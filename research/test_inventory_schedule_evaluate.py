"""Fictional fixture tests for the once-only inventory schedule evaluator."""

import importlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from inventory_context_contract import CLASSES
import runner_runtime as runtime


class InventoryScheduleEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.evaluation = importlib.import_module('inventory_schedule_evaluate')

    def test_direct_worker_refuses_to_generate_or_load(self):
        with self.assertRaisesRegex(runtime.RuntimeSafetyError, 'Worker requires ResourceSupervisor'):
            self.evaluation.worker()

    def test_claim_cannot_be_replaced(self):
        with TemporaryDirectory() as temporary:
            claim = Path(temporary) / 'claim.json'
            self.evaluation.write_claim(claim, 'a' * 64, {'evaluator.py': 'b' * 64})
            original = claim.read_bytes()
            with self.assertRaises(FileExistsError):
                self.evaluation.write_claim(claim, 'c' * 64, {'evaluator.py': 'b' * 64})
            self.assertEqual(claim.read_bytes(), original)

    def test_paired_risk_metrics_show_critical_misses_and_false_alerts(self):
        normal, reorder, critical = CLASSES
        labels = [normal, normal, reorder, critical, critical]
        packets = {'rf14': [normal, reorder, reorder, normal, critical],
                   'schedule': [normal, normal, reorder, critical, critical]}
        report = self.evaluation.compare(labels, packets)
        baseline = report['metrics']['rf14']
        candidate = report['metrics']['schedule']
        self.assertEqual(baseline['critical_as_normal'], 1)
        self.assertEqual(baseline['critical_precision'], 1)
        self.assertEqual(baseline['critical_recall'], 0.5)
        self.assertEqual(baseline['normal_false_alert_rate'], 0.5)
        self.assertEqual(candidate['accuracy'], 1)
        self.assertEqual(candidate['macro_f1'], 1)
        self.assertAlmostEqual(report['schedule_minus_rf14']['accuracy'], 0.4)
        self.assertEqual(report['schedule_minus_rf14']['critical_as_normal'], -1)

    def test_predictions_are_retained_before_metrics(self):
        normal, reorder, critical = CLASSES
        rows = [{'sample': f'fixture-{index}', 'family': 'fictional', 'label': label}
                for index, label in enumerate((normal, reorder, critical))]
        packet = {'classes': list(CLASSES), 'probabilities': [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
                  'predicted': list(CLASSES)}
        with TemporaryDirectory() as temporary:
            output = Path(temporary)
            frozen_sha = 'a' * 64
            score = self.evaluation.compare

            def score_saved_predictions(labels, predictions):
                self.assertTrue((output / 'rf14.predictions.json').is_file())
                self.assertTrue((output / 'schedule.predictions.json').is_file())
                self.assertTrue((output / 'predictions-complete.json').is_file())
                self.assertFalse((output / 'evaluation.json').exists())
                return score(labels, predictions)

            with patch.object(self.evaluation, 'compare', side_effect=score_saved_predictions):
                report = self.evaluation.retain_and_score(output, rows, {'rf14': packet, 'schedule': packet}, frozen_sha)
            self.assertEqual(report['metrics']['schedule']['accuracy'], 1)
            retained = json.loads((output / 'evaluation.json').read_text(encoding='utf-8'))
            self.assertEqual(retained['frozen_sha256'], frozen_sha)
            with self.assertRaises(FileExistsError):
                self.evaluation.retain_and_score(output, rows, {'rf14': packet, 'schedule': packet}, frozen_sha)

    def test_frozen_models_require_the_sealed_bytes_and_native_success(self):
        with TemporaryDirectory() as temporary:
            directory = Path(temporary)
            development = directory / 'development'
            development.mkdir()
            claim = directory / 'development.claim.json'
            claim.write_text('{}', encoding='utf-8')
            pins = {'evaluator.py': 'b' * 64}
            versions = {'python': 'fictional-version'}
            native = {'status': 'success', 'reason': None, 'returncode': 0}
            fits = ('cv-rf14-f0', 'cv-rf14-f1', 'cv-rf14-f2', 'final-rf14',
                    'cv-schedule-f0', 'cv-schedule-f1', 'cv-schedule-f2', 'final-schedule')
            results = {fit: native.copy() for fit in fits}
            for fit in fits:
                (development / f'{fit}.result.json').write_text(json.dumps(native), encoding='utf-8')
            for arm in ('rf14', 'schedule'):
                (development / f'final-{arm}.joblib').write_bytes(arm.encode())
            frozen_path = development / 'frozen.json'
            frozen = {'phase': 'development', 'protocol': 'inventory-schedule-outcome-3.0',
                      'holdout_scored': False, 'fit_count': 8, 'source_pins': pins, 'versions': versions,
                      'claim_sha256': runtime.sha256_file(claim), 'native_results': results,
                      'files': {file.name: runtime.sha256_file(file) for file in development.iterdir()}}
            frozen_path.write_text(json.dumps(frozen), encoding='utf-8')
            _, models = self.evaluation.verify_frozen(development, claim, pins, versions)
            self.assertEqual(models, {'rf14': b'rf14', 'schedule': b'schedule'})
            with self.assertRaisesRegex(ValueError, 'source or versions'):
                self.evaluation.verify_frozen(development, claim, {}, versions)

            model = development / 'final-schedule.joblib'
            model.write_bytes(b'changed bytes')
            with self.assertRaisesRegex(ValueError, 'Changed artifact'):
                self.evaluation.verify_frozen(development, claim, pins, versions)
            model.write_bytes(b'schedule')

            failed = {'status': 'failed', 'reason': 'fixture', 'returncode': 1}
            receipt = development / 'final-schedule.result.json'
            receipt.write_text(json.dumps(failed), encoding='utf-8')
            frozen['native_results']['final-schedule'] = failed
            frozen['files'][receipt.name] = runtime.sha256_file(receipt)
            frozen_path.write_text(json.dumps(frozen), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Native fit failed'):
                self.evaluation.verify_frozen(development, claim, pins, versions)

    def test_holdout_contract_uses_four_registered_views_per_reserved_family(self):
        def build_family(number):
            if not 180 <= number < 240:
                self.fail('An evaluator tried to generate a development family')
            family = f'IS3-{number:03}'
            return [dict(family=family, sample=f'{family}-V{view}', rf14=[1], schedule=[2],
                         label=CLASSES[view % 3]) for view in range(1, 5)]

        fixture = SimpleNamespace(DEV_FAMILIES=range(180), HOLDOUT_FAMILIES=range(180, 240),
                                  build_family=build_family, FEATURE_NAMES={'rf14': ['a'], 'schedule': ['b']})
        rows = self.evaluation.holdout_rows(fixture)
        self.assertEqual(len(rows), 240)
        self.assertEqual(rows[0]['sample'], 'IS3-180-V1')
        self.assertEqual(rows[-1]['sample'], 'IS3-239-V4')


if __name__ == '__main__':
    unittest.main()
