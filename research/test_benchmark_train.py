"""Small synthetic fixtures test software contracts, never benchmark performance."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

import benchmark_prepare as prep


class BenchmarkTrainingTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('benchmark_train'), 'Benchmark training module missing')
        import benchmark_train
        self.api = benchmark_train
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.runs = self.root / 'benchmark-runs'
        self.addCleanup(patch.stopall)
        patch.object(self.api, 'DATA_ROOT', self.root).start()
        patch.object(self.api, 'RUN_ROOT', self.runs).start()

    def fixture(self, kind='delivery'):
        rows = []
        for label in [0, 1]:
            for i in range(30):
                if kind == 'inventory':
                    row = {c: 0.5 for c in prep.INVENTORY_COLUMNS}
                    row.update(SKU=f'{label}-{i}', BO=label, INV=(i % 5 - 1) / 10)
                    row.update({f'RSK{n}': 0 for n in range(1, 7)})
                    rows.append(row)
                else:
                    for _ in range(2):
                        rows.append({'group_id': f'{label}-{i}', 'payment_type': 'DEBIT',
                                     'scheduled_shipping_days': i % 4, 'shipping_mode': 'Same Day',
                                     'item_quantity': i % 3 + 1, 'category_id': 2 if i % 2 else 99,
                                     'late_delivery_target': label})
        source = self.root / f'{kind}.csv'
        pd.DataFrame(rows).to_csv(source, index=False)
        split_dir = self.root / f'{kind}-splits'
        digest = prep.sha256(source)
        prep.build_tabular(source, split_dir, kind, digest)
        pins = dict(prep.PINNED)
        pins[kind] = (source.name, digest)
        patch.dict(prep.PINNED, pins).start()
        return source, split_dir

    def rewrite_manifest(self, split_dir, changes):
        path = split_dir / 'manifest.json'
        manifest = json.loads(path.read_text())
        manifest.update(changes)
        path.write_text(json.dumps(manifest))

    def test_load_reconciles_all_source_rows_and_excludes_audit_predictors(self):
        source, splits = self.fixture()
        verified = self.api.load_verified(source, splits, 'delivery')
        self.assertEqual(len(verified.frame), 120)
        self.assertEqual(verified.features, prep.DELIVERY_FEATURES)
        self.assertEqual(verified.frame.groupby('group_id').split.nunique().max(), 1)
        self.assertEqual(verified.frame.split.value_counts().to_dict(), {'train': 84, 'test': 20, 'validation': 16})

    def test_pinned_source_hash_is_required_even_if_manifest_is_rehashed(self):
        source, splits = self.fixture()
        raw = pd.read_csv(source)
        raw.loc[0, 'item_quantity'] = 77
        raw.to_csv(source, index=False)
        self.rewrite_manifest(splits, {'source_sha256': prep.sha256(source)})
        with self.assertRaises(ValueError):
            self.api.load_verified(source, splits, 'delivery')

    def test_split_byte_hash_is_required(self):
        source, splits = self.fixture()
        with (splits / 'splits.csv').open('a') as handle:
            handle.write('\n')
        with self.assertRaises(ValueError):
            self.api.load_verified(source, splits, 'delivery')

    def test_rehashed_group_label_row_and_split_tampering_is_rejected(self):
        source, splits = self.fixture()
        path = splits / 'splits.csv'
        original = path.read_bytes()
        for column, value in [('group_id', 'fabricated'), ('label', 1), ('source_row', 3),
                              ('split', 'test')]:
            with self.subTest(column=column):
                path.write_bytes(original)
                frame = pd.read_csv(path)
                index = frame.index[frame.split == 'train'][0] if column == 'split' else 0
                frame.loc[index, column] = value
                frame.to_csv(path, index=False)
                self.rewrite_manifest(splits, {'split_sha256': prep.sha256(path)})
                with self.assertRaises(ValueError):
                    self.api.load_verified(source, splits, 'delivery')

    def test_manifest_protocol_seed_features_kind_and_counts_are_enforced(self):
        source, splits = self.fixture()
        original = (splits / 'manifest.json').read_bytes()
        for change in [{'protocol_version': 'other'}, {'seed': 43}, {'features': ['label']},
                       {'benchmark': 'inventory'}, {'source_rows': 1}, {'splits': {}},
                       {'target_values': [0, 1, 2]}, {'preparation_code_sha256': '0' * 64},
                       {'quality': {'limitations': ['invented claim']}}]:
            with self.subTest(change=change):
                (splits / 'manifest.json').write_bytes(original)
                self.rewrite_manifest(splits, change)
                with self.assertRaises(ValueError):
                    self.api.load_verified(source, splits, 'delivery')

    def test_inventory_negative_cohort_tampering_is_rejected(self):
        source, splits = self.fixture('inventory')
        path = splits / 'splits.csv'
        frame = pd.read_csv(path)
        frame.loc[0, 'negative_inventory'] = not bool(frame.loc[0, 'negative_inventory'])
        frame.to_csv(path, index=False)
        self.rewrite_manifest(splits, {'split_sha256': prep.sha256(path)})
        with self.assertRaises(ValueError):
            self.api.load_verified(source, splits, 'inventory')

    def test_train_pipeline_handles_unknown_category_without_learning_it(self):
        model = self.api.make_models('delivery')['logistic_regression']
        train = pd.DataFrame({'payment_type': ['DEBIT', 'CASH', 'DEBIT', 'CASH'],
                              'scheduled_shipping_days': [0, 2, 0, 2], 'shipping_mode': ['Same Day'] * 4,
                              'item_quantity': [1, 3, 1, 3], 'category_id': [2, 99, 2, 99]})
        model.fit(train, [0, 1, 0, 1])
        test = train.iloc[:1].copy()
        test['category_id'] = 777
        test['item_quantity'] = 1000
        model.predict_proba(test)
        transform = model.named_steps['preprocess']
        self.assertEqual(transform.named_transformers_['categorical'].categories_[2].tolist(), [2, 99])
        self.assertEqual(transform.named_transformers_['numeric'].mean_.tolist(), [1.0, 2.0])

    def test_development_folds_keep_groups_and_test_rows_out(self):
        source, splits = self.fixture('inventory')
        data = self.api.load_verified(source, splits, 'inventory')
        train = data.frame[data.frame.split == 'train'].reset_index(drop=True)
        folds = self.api.inventory_folds(train)
        self.assertEqual(len(folds), 3)
        covered = []
        for fit, validation in folds:
            self.assertFalse(set(train.iloc[fit].group_id) & set(train.iloc[validation].group_id))
            self.assertEqual(set(train.iloc[fit].label), {0, 1})
            self.assertEqual(set(train.iloc[validation].label), {0, 1})
            covered.extend(validation.tolist())
        self.assertEqual(sorted(covered), list(range(len(train))))
        duplicated_group = train.copy()
        duplicated_group.loc[0, 'group_id'] = duplicated_group.loc[1, 'group_id']
        with self.assertRaises(ValueError):
            self.api.inventory_folds(duplicated_group)
        contaminated = train.copy()
        contaminated.loc[0, 'split'] = 'test'
        with self.assertRaises(ValueError):
            self.api.inventory_folds(contaminated)

    def test_binary_metrics_include_minority_and_precision_recall_evidence(self):
        metrics, curve = self.api.binary_metrics(np.array([0, 0, 1, 1]), np.array([0.1, 0.6, 0.2, 0.9]))
        self.assertEqual(metrics['confusion_matrix'], [[1, 1], [1, 1]])
        self.assertAlmostEqual(metrics['macro_f1'], 0.5)
        self.assertAlmostEqual(metrics['balanced_accuracy'], 0.5)
        self.assertAlmostEqual(metrics['average_precision_positive'], 5 / 6)
        self.assertEqual(metrics['per_class']['1']['support'], 2)
        self.assertEqual(curve['precision'][-1], 1.0)
        self.assertEqual(curve['recall'][-1], 0.0)

    def test_majority_baseline_fits_majority_without_balanced_weights(self):
        model = self.api.make_models('inventory')['majority_baseline']
        features = pd.DataFrame(np.zeros((5, len(prep.INVENTORY_FEATURES))), columns=prep.INVENTORY_FEATURES)
        model.fit(features, [0, 1, 1, 1, 1])
        self.assertEqual(self.api.positive_probability(model, features).tolist(), [1.0] * 5)

    def test_delivery_run_records_full_protocol_and_common_test_evidence(self):
        source, splits = self.fixture()
        output = self.runs / 'delivery-test'
        events = []
        def check_selection_before_test(message):
            events.append(message)
            if 'evaluating common held-out test' in message:
                self.assertTrue((output / 'selection-before-test.json').is_file())
                selection = json.loads((output / 'selection-before-test.json').read_text())
                self.assertIn(selection['selected_model'], selection['eligible_models'])
        report = self.api.run_benchmark(source, splits, output, 'delivery', progress=check_selection_before_test)
        self.assertTrue((output / 'report.json').is_file())
        self.assertFalse(report['primary_iilas_task_evaluated'])
        self.assertEqual(report['data_usage']['source_rows'], 120)
        self.assertEqual(report['data_usage']['subset_method'], 'none: all verified source rows')
        self.assertEqual(report['protocol']['threshold'], 0.5)
        self.assertEqual(report['protocol']['threads'], 2)
        self.assertEqual(set(report['models']), {'majority_baseline', 'decision_tree', 'random_forest', 'logistic_regression'})
        self.assertEqual(report['selection']['criterion'], 'development_macro_f1')
        self.assertEqual(report['selection']['selected_before_test'], True)
        self.assertEqual(len(events), 8)
        for result in report['models'].values():
            self.assertEqual(result['test']['rows'], 20)
            self.assertTrue((output / result['precision_recall_file']).is_file())
        self.assertNotIn('group_id', json.dumps(report))
        self.assertFalse(list(output.glob('*.joblib')))
        before = (output / 'report.json').read_bytes()
        with self.assertRaises(FileExistsError):
            self.api.run_benchmark(source, splits, output, 'delivery')
        self.assertEqual(before, (output / 'report.json').read_bytes())

    def test_held_out_feature_changes_do_not_change_development_scores(self):
        source, splits = self.fixture()
        first = self.api.run_benchmark(source, splits, self.runs / 'first', 'delivery')
        mapping = pd.read_csv(splits / 'splits.csv')
        raw = pd.read_csv(source)
        indices = mapping.loc[mapping.split == 'test', 'source_row'] - 2
        raw.loc[indices, 'category_id'] = 777
        raw.loc[indices, 'item_quantity'] = 1000
        raw.to_csv(source, index=False)
        second_splits = self.root / 'second-splits'
        digest = prep.sha256(source)
        prep.build_tabular(source, second_splits, 'delivery', digest)
        with patch.dict(prep.PINNED, {'delivery': (source.name, digest)}):
            second = self.api.run_benchmark(source, second_splits, self.runs / 'second', 'delivery')
        self.assertEqual(first['selection'], second['selection'])
        for name in first['models']:
            self.assertEqual(first['models'][name]['development'], second['models'][name]['development'])

    def test_input_mutation_during_training_prevents_completed_report(self):
        source, splits = self.fixture()
        output = self.runs / 'mutation'
        def mutate_on_test(message):
            if 'evaluating common held-out test for majority_baseline' in message:
                with source.open('a') as handle:
                    handle.write('\n')
        with self.assertRaises(ValueError):
            self.api.run_benchmark(source, splits, output, 'delivery', progress=mutate_on_test)
        self.assertFalse((output / 'report.json').exists())

    def test_inventory_run_uses_group_cv_and_can_save_only_benchmark_models(self):
        source, splits = self.fixture('inventory')
        output = self.runs / 'inventory-test'
        report = self.api.run_benchmark(source, splits, output, 'inventory', save_models=True)
        self.assertEqual(report['protocol']['development'], 'three_fold_stratified_group_cv_on_train')
        self.assertEqual(len(report['models']['random_forest']['development']['folds']), 3)
        self.assertEqual(report['models']['random_forest']['test']['rows'], 12)
        self.assertEqual(len(list(output.glob('*.joblib'))), 3)

    def test_output_and_inputs_must_stay_in_ignored_dataset_boundaries(self):
        source, splits = self.fixture()
        for output in [self.root / 'active-models', self.runs, self.runs / '..' / 'elsewhere']:
            with self.subTest(output=output), self.assertRaises(ValueError):
                self.api.run_benchmark(source, splits, output, 'delivery')
            self.assertFalse((output / 'report.json').exists())
        with self.assertRaises(ValueError):
            self.api.load_verified(self.root.parent / source.name, splits, 'delivery')

    def test_cli_errors_are_redacted_including_argument_parse_errors(self):
        for argv in [['delivery', '--source', str(self.root / 'private-marker.csv')],
                     ['private-marker'], ['delivery', '--unknown', 'private-marker']]:
            output = io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                status = self.api.main(argv)
            self.assertEqual(status, 2)
            self.assertNotIn('private-marker', output.getvalue())
            self.assertNotIn('Traceback', output.getvalue())


if __name__ == '__main__':
    unittest.main()
