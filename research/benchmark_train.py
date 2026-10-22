"""Run fixed binary public benchmarks; never activate primary IILAS models."""
import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import platform
from pathlib import Path
import time
import warnings

import joblib
import numpy as np
import pandas as pd
import scipy
import sklearn
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, balanced_accuracy_score,
                             confusion_matrix, precision_recall_curve,
                             precision_recall_fscore_support)
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier
from threadpoolctl import threadpool_limits

import benchmark_prepare as prep

DATA_ROOT = prep.DATA_ROOT
RUN_ROOT = DATA_ROOT / 'benchmark-runs'
SEED = 42
THREADS = 2
THRESHOLD = 0.5
PROTOCOL = 'public-binary-benchmark-training-1.0'


@dataclass
class VerifiedData:
    frame: pd.DataFrame
    features: list
    manifest: dict
    hashes: dict


def contained(path, root):
    path, root = Path(path).resolve(), Path(root).resolve()
    if path == root or not path.is_relative_to(root):
        raise ValueError('Path must be inside the permitted ignored dataset subfolder.')
    return path


def split_summary(frame, kind):
    result = {}
    for name, part in frame.groupby('split'):
        if set(part.label.unique()) != {0, 1}:
            raise ValueError('Every partition must contain both native classes.')
        result[name] = {'rows': len(part), 'groups': int(part.group_id.nunique()),
                        'class_rows': {str(k): int(v) for k, v in part.label.value_counts().items()},
                        'class_groups': {str(k): int(v) for k, v in part.groupby('label').group_id.nunique().items()}}
        if kind == 'inventory':
            result[name]['negative_inventory_rows'] = int(part.negative_inventory.sum())
    return result


def load_verified(source, split_dir, kind):
    """Verify immutable source bytes AND independently recompute the entire split map."""
    if kind not in prep.PINNED:
        raise ValueError('Unsupported benchmark.')
    source, split_dir = contained(source, DATA_ROOT), contained(split_dir, DATA_ROOT)
    manifest_path = contained(split_dir / 'manifest.json', DATA_ROOT)
    split_path = contained(split_dir / 'splits.csv', DATA_ROOT)
    pinned_name, pinned_hash = prep.PINNED[kind]
    if source.name != pinned_name or prep.sha256(source) != pinned_hash:
        raise ValueError('Source does not match the pinned public benchmark.')
    manifest_hash = prep.sha256(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    features = prep.INVENTORY_FEATURES if kind == 'inventory' else prep.DELIVERY_FEATURES
    expected = {'protocol_version': 'public-benchmark-splits-1.0', 'benchmark': kind,
                'seed': SEED, 'features': features, 'target_values': [0, 1],
                'target': 'BO' if kind == 'inventory' else 'late_delivery_target',
                'source_file': pinned_name, 'source_sha256': pinned_hash,
                'fractions': {'train': .8, 'test': .2} if kind == 'inventory' else {'train': .7, 'validation': .15, 'test': .15},
                'preparation_code_sha256': prep.sha256(prep.__file__),
                'model_trained': False, 'primary_iilas_task_evaluated': False,
                'status': 'split_preparation_complete_not_model_acceptance'}
    if any(manifest.get(key) != value for key, value in expected.items()):
        raise ValueError('Manifest protocol or feature contract mismatch.')
    split_hash = prep.sha256(split_path)
    if split_hash != manifest.get('split_sha256'):
        raise ValueError('Split checksum mismatch.')
    raw = pd.read_csv(source, dtype={'SKU': 'string'} if kind == 'inventory' else {'group_id': 'string'})
    prepared, quality = prep.prepare_inventory(raw) if kind == 'inventory' else prep.prepare_delivery(raw)
    if manifest.get('source_rows') != len(prepared):
        raise ValueError('Manifest source row count mismatch.')
    if manifest.get('quality') != quality:
        raise ValueError('Manifest source semantics or limitation record mismatch.')
    del raw
    actual = pd.read_csv(split_path, dtype={'group_id': 'string'})
    columns = ['source_row', 'group_id', 'label', 'split']
    if kind == 'inventory':
        columns.append('negative_inventory')
    prep.schema(actual, columns)
    source_rows = prep.numeric(actual, ['source_row']).source_row
    if (len(actual) != len(prepared) or source_rows.duplicated().any()
            or not np.array_equal(np.sort(source_rows.to_numpy()), np.arange(2, len(prepared) + 2))):
        raise ValueError('Split map must cover every source row exactly once.')
    actual = actual.sort_values('source_row').reset_index(drop=True)
    expected_splits = prep.assign_splits(prepared, kind, SEED)
    if (not np.array_equal(actual.group_id.to_numpy(), prepared.group_id.to_numpy())
            or not np.array_equal(actual.label.to_numpy(), prepared.label.to_numpy())
            or not np.array_equal(actual.split.to_numpy(), expected_splits.to_numpy())):
        raise ValueError('Split mapping disagrees with independently prepared groups, labels or assignments.')
    if kind == 'inventory' and (actual.negative_inventory.dtype != bool or
            not np.array_equal(actual.negative_inventory.to_numpy(), prepared.negative_inventory.to_numpy())):
        raise ValueError('Inventory sensitivity cohort mapping mismatch.')
    prepared['source_row'] = np.arange(2, len(prepared) + 2)
    prepared['split'] = expected_splits
    if split_summary(prepared, kind) != manifest.get('splits'):
        raise ValueError('Manifest partition counts mismatch.')
    if prepared.groupby('group_id').split.nunique().max() != 1:
        raise ValueError('Group leakage detected.')
    if (prep.sha256(source) != pinned_hash or prep.sha256(split_path) != split_hash
            or prep.sha256(manifest_path) != manifest_hash):
        raise ValueError('Inputs changed during validation.')
    return VerifiedData(prepared, list(features), manifest,
                        {'source_sha256': pinned_hash, 'split_sha256': split_hash,
                         'split_manifest_sha256': manifest_hash,
                         'preparation_code_sha256': expected['preparation_code_sha256']})


def make_models(kind):
    """Fixed settings, no search or test-informed parameter adjustment."""
    if kind not in prep.PINNED:
        raise ValueError('Unsupported benchmark.')
    estimators = {
        'majority_baseline': DummyClassifier(strategy='most_frequent'),
        'decision_tree': DecisionTreeClassifier(max_depth=12, min_samples_leaf=2,
                                                min_samples_split=2, class_weight='balanced', random_state=SEED),
        'random_forest': RandomForestClassifier(n_estimators=64, max_depth=12, min_samples_leaf=2,
                                                min_samples_split=2, class_weight='balanced',
                                                random_state=SEED, n_jobs=THREADS),
    }
    if kind == 'delivery':
        estimators['logistic_regression'] = LogisticRegression(C=1.0, solver='lbfgs', max_iter=1000,
                                                               tol=1e-4, class_weight='balanced', random_state=SEED)
    models = {}
    for name, estimator in estimators.items():
        if kind == 'inventory':
            transform = ColumnTransformer([('numeric', 'passthrough', prep.INVENTORY_FEATURES)], remainder='drop')
        else:
            transform = ColumnTransformer([
                ('categorical', OneHotEncoder(handle_unknown='ignore', sparse_output=True),
                 ['payment_type', 'shipping_mode', 'category_id']),
                ('numeric', StandardScaler() if name == 'logistic_regression' else 'passthrough',
                 ['scheduled_shipping_days', 'item_quantity']),
            ], remainder='drop')
        models[name] = Pipeline([('preprocess', transform), ('model', estimator)])
    return models


def inventory_folds(train):
    """The pinned inventory has one row/SKU; stratification thus keeps whole groups."""
    if train.group_id.duplicated().any() or set(train.split) != {'train'}:
        raise ValueError('Inventory CV requires independent singleton training groups.')
    splitter = StratifiedKFold(n_splits=3, shuffle=True, random_state=SEED)
    folds = list(splitter.split(np.zeros(len(train)), train.label))
    for fit, validation in folds:
        if (set(train.iloc[fit].label) != {0, 1} or set(train.iloc[validation].label) != {0, 1}
                or set(train.iloc[fit].group_id) & set(train.iloc[validation].group_id)):
            raise ValueError('Invalid or overlapping inventory CV groups.')
    return folds


def positive_probability(model, features):
    classes = model.named_steps['model'].classes_
    if set(classes) != {0, 1}:
        raise ValueError('Fitted model must retain both binary classes.')
    return model.predict_proba(features)[:, int(np.flatnonzero(classes == 1)[0])]


def binary_metrics(labels, probabilities):
    labels, probabilities = np.asarray(labels), np.asarray(probabilities)
    if (set(labels) != {0, 1} or len(labels) != len(probabilities)
            or not np.isfinite(probabilities).all() or ((probabilities < 0) | (probabilities > 1)).any()):
        raise ValueError('Invalid binary evaluation inputs.')
    predictions = (probabilities >= THRESHOLD).astype(int)
    precision, recall, f1, support = precision_recall_fscore_support(labels, predictions, labels=[0, 1], zero_division=0)
    curve_precision, curve_recall, thresholds = precision_recall_curve(labels, probabilities, pos_label=1)
    metrics = {'rows': int(len(labels)), 'threshold': THRESHOLD,
               'macro_f1': float(np.mean(f1)), 'balanced_accuracy': float(balanced_accuracy_score(labels, predictions)),
               'accuracy': float(np.mean(labels == predictions)),
               'average_precision_positive': float(average_precision_score(labels, probabilities)),
               'positive_prevalence': float(np.mean(labels)),
               'confusion_matrix_labels': [0, 1], 'confusion_matrix': confusion_matrix(labels, predictions, labels=[0, 1]).tolist(),
               'per_class': {str(label): {'precision': float(precision[label]), 'recall': float(recall[label]),
                                        'f1': float(f1[label]), 'support': int(support[label])} for label in [0, 1]}}
    curve = {'precision': curve_precision.tolist(), 'recall': curve_recall.tolist(),
             'threshold': thresholds.tolist() + [None]}
    return metrics, curve


def write_json(path, data):
    with Path(path).open('x', encoding='utf-8') as handle:
        json.dump(data, handle, indent=2, allow_nan=False)


def run_benchmark(source, split_dir, output, kind, save_models=False, progress=None):
    """Train sequentially, freeze development selection, then evaluate the common test."""
    output = contained(output, RUN_ROOT)
    contained(output, DATA_ROOT)
    if output.exists():
        raise FileExistsError('Destination exists; refusing overwrite.')
    started = time.perf_counter()
    data = load_verified(source, split_dir, kind)
    models = make_models(kind)
    protocol = {'version': PROTOCOL, 'seed': SEED, 'threshold': THRESHOLD,
                'threshold_selection': 'fixed before any model evaluation; no threshold search',
                'threads': THREADS, 'parallel_models': False, 'hyperparameter_search': False,
                'development': 'three_fold_stratified_group_cv_on_train' if kind == 'inventory' else 'fixed_validation_partition',
                'cv_implementation': 'StratifiedKFold(3, shuffle=True, random_state=42); verified one row per SKU group; explicit overlap checks'
                    if kind == 'inventory' else None,
                'preprocessing': 'Pipeline fit on each training fold, or training partition only; no imputation or resampling',
                'category_id_treatment': 'categorical one-hot, unknown ignored' if kind == 'delivery' else None,
                'final_fit_rows': 'training partition only; validation and test never added',
                'model_parameters': {name: model.named_steps['model'].get_params() for name, model in models.items()}}
    output.mkdir(parents=True, exist_ok=False)
    # This immutable pre-fit record makes the fixed choices inspectable before any scores.
    write_json(output / 'protocol.json', protocol)
    code = Path(__file__).read_bytes()
    (output / 'benchmark-train-code.py').write_bytes(code)
    (output / 'benchmark-prepare-code.py').write_bytes(Path(prep.__file__).read_bytes())
    train = data.frame.loc[data.frame.split == 'train'].reset_index(drop=True)
    validation = data.frame.loc[data.frame.split == 'validation'].reset_index(drop=True)
    folds = inventory_folds(train) if kind == 'inventory' else None
    x_train, y_train = train[data.features], train.label
    results = {}
    with threadpool_limits(limits=THREADS), warnings.catch_warnings():
        warnings.simplefilter('error', ConvergenceWarning)
        for name, model in models.items():
            if progress:
                progress(f'{kind}: developing {name}')
            model_started = time.perf_counter()
            if folds is not None:
                fold_results = []
                for index, (fit, held_out) in enumerate(folds):
                    candidate = clone(model)
                    candidate.fit(x_train.iloc[fit], y_train.iloc[fit])
                    metrics, _ = binary_metrics(y_train.iloc[held_out], positive_probability(candidate, x_train.iloc[held_out]))
                    fold_results.append({'fold': index + 1, 'fit_rows': len(fit), 'validation_rows': len(held_out),
                                         'group_overlap': 0, 'metrics': metrics})
                development = {'folds': fold_results,
                               'macro_f1': float(np.mean([fold['metrics']['macro_f1'] for fold in fold_results])),
                               'macro_f1_std': float(np.std([fold['metrics']['macro_f1'] for fold in fold_results]))}
                model.fit(x_train, y_train)
            else:
                model.fit(x_train, y_train)
                development, _ = binary_metrics(validation.label, positive_probability(model, validation[data.features]))
            results[name] = {'development': development, 'development_and_fit_seconds': time.perf_counter() - model_started}
        eligible = list(models)
        selected = max(eligible, key=lambda name: results[name]['development']['macro_f1'])
        selection = {'criterion': 'development_macro_f1',
                     'aggregation': 'arithmetic mean of three fold macro F1 values' if kind == 'inventory' else 'fixed validation partition macro F1',
                     'tie_break': 'first in declared candidate order: majority_baseline, decision_tree, random_forest, logistic_regression',
                     'eligible_models': eligible, 'selected_model': selected,
                     'best_development_candidate': selected, 'committed_random_forest_unchanged': True,
                     'selected_before_test': True,
                     'development_scores': {name: results[name]['development']['macro_f1'] for name in models}}
        write_json(output / 'selection-before-test.json', selection)
        test = data.frame.loc[data.frame.split == 'test']
        for name, model in models.items():
            if progress:
                progress(f'{kind}: evaluating common held-out test for {name}')
            metrics, curve = binary_metrics(test.label, positive_probability(model, test[data.features]))
            curve_name = f'{name}-test-precision-recall.csv'
            pd.DataFrame(curve).to_csv(output / curve_name, index=False)
            results[name].update(test=metrics, precision_recall_file=curve_name,
                                 precision_recall_sha256=prep.sha256(output / curve_name))
            if save_models:
                model_name = f'{name}-benchmark-only.joblib'
                joblib.dump(model, output / model_name)
                results[name].update(model_file=model_name, model_sha256=prep.sha256(output / model_name))
    # No mutable file is trusted merely because it passed a check before training.
    for path, digest in [(source, data.hashes['source_sha256']),
                         (Path(split_dir) / 'splits.csv', data.hashes['split_sha256']),
                         (Path(split_dir) / 'manifest.json', data.hashes['split_manifest_sha256'])]:
        if prep.sha256(path) != digest:
            raise ValueError('Inputs changed during the benchmark; no completed report written.')
    if prep.sha256(__file__) != hashlib.sha256(code).hexdigest():
        raise ValueError('Runner code changed during the benchmark.')
    report = {'status': 'binary_public_benchmark_complete_not_primary_model_acceptance',
              'benchmark': kind, 'completed_at_utc': datetime.now(timezone.utc).isoformat(),
              'protocol': protocol, 'selection': selection, 'models': results,
              'data_usage': {'source_rows': len(data.frame), 'used_rows': len(data.frame),
                             'subset_method': 'none: all verified source rows', 'partitions': data.manifest['splits']},
              'features': data.features, 'native_target': data.manifest['target'], 'target_values': [0, 1],
              'hashes': {**data.hashes, 'runner_code_sha256': hashlib.sha256(code).hexdigest(),
                         'protocol_sha256': prep.sha256(output / 'protocol.json'),
                         'selection_before_test_sha256': prep.sha256(output / 'selection-before-test.json')},
              'environment': {'python': platform.python_version(), 'platform': platform.system(),
                              'architecture': platform.machine(), 'numpy': np.__version__, 'pandas': pd.__version__,
                              'scipy': scipy.__version__, 'scikit_learn': sklearn.__version__, 'joblib': joblib.__version__},
              'elapsed_seconds': time.perf_counter() - started, 'primary_iilas_task_evaluated': False,
              'inference_activated': False, 'models_saved': bool(save_models),
              'limitations': [*data.manifest.get('quality', {}).get('limitations', []),
                              'Native public binary labels do not evaluate the primary three-class IILAS task.',
                              'Fixed group partitions do not establish future-time or real-operational generalisation.',
                              'No uncertainty interval, final acceptance criterion or calibration claim is made.',
                              'Inventory negative-INV rows are retained; the separate exclusion sensitivity run is not performed.']}
    write_json(output / 'report.json', report)
    return report


class RedactedParser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError('Invalid command arguments.')


def main(argv=None):
    parser = RedactedParser(description=__doc__)
    parser.add_argument('kind', choices=list(prep.PINNED))
    parser.add_argument('--source', type=Path)
    parser.add_argument('--splits', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--save-models', action='store_true', help='Save benchmark-only weights in this ignored run directory.')
    try:
        args = parser.parse_args(argv)
        source = args.source or prep.SOURCES / prep.PINNED[args.kind][0]
        splits = args.splits or DATA_ROOT / 'benchmark-splits-v1' / args.kind
        output = args.output or RUN_ROOT / f'{args.kind}-v1'
        report = run_benchmark(source, splits, output, args.kind, args.save_models,
                               progress=lambda message: print(message, flush=True))
        print(json.dumps({'status': report['status'], 'benchmark': report['benchmark'],
                          'source_rows': report['data_usage']['source_rows'],
                          'selected_model': report['selection']['selected_model'],
                          'primary_iilas_task_evaluated': False}, indent=2))
        return 0
    except Exception:
        # Parser, pandas and estimator exceptions can echo values or local paths.
        print('Benchmark stopped: check pinned inputs, manifest integrity, unused output path and runtime. No source values printed.')
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
