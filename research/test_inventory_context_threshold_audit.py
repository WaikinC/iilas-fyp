import importlib.util
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest


class ThresholdAuditTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_context_threshold_audit'))
        import inventory_context_threshold_audit as audit
        self.audit = audit
        self.rows = {'a': ('family-a', 'Critical Stock Risk'),
                     'b': ('family-b', 'Normal'),
                     'c': ('family-c', 'Reorder Risk')}
        self.folds = []
        for sample, probabilities, predicted in (
            ('a', [.40, .21, .39], 'Normal'),
            ('b', [.70, .10, .20], 'Normal'),
            ('c', [.10, .75, .15], 'Reorder Risk'),
        ):
            train_ids = [other for other in self.rows if other != sample]
            split = {'train': [self.rows[key][0] for key in train_ids],
                     'validation': [self.rows[sample][0]]}
            entry = {'train_ids': train_ids, 'evaluate_ids': [sample]}
            prediction = {'classes': ['Normal', 'Reorder Risk', 'Critical Stock Risk'],
                          'probabilities': [probabilities], 'predicted': [predicted]}
            self.folds.append((split, entry, prediction))

    def test_threshold_sweep_reproduces_baseline_and_keeps_pooled_and_fold_counts(self):
        report = self.audit.compare(self.rows, self.folds)
        self.assertEqual(report['baseline']['pooled']['critical_as_normal'], 1)
        self.assertEqual(report['baseline']['pooled']['critical_recall'], 0)
        self.assertIsNone(report['baseline']['pooled']['critical_precision'])
        threshold = next(result for result in report['threshold_sweep'] if result['threshold'] == .375)
        self.assertEqual(threshold['pooled']['macro_f1'], 1)
        self.assertEqual(threshold['pooled']['critical_as_normal'], 0)
        self.assertEqual(threshold['pooled']['normal_alerts'], 0)
        self.assertEqual(threshold['folds'][0]['critical_recall'], 1)
        self.assertIsNone(threshold['folds'][1]['critical_recall'])

    def test_same_family_cannot_appear_in_training_and_validation(self):
        self.rows['b'] = ('family-a', 'Normal')
        self.folds[0][0]['train'][0] = 'family-a'
        with self.assertRaisesRegex(ValueError, 'family partition'):
            self.audit.compare(self.rows, self.folds)

    def test_changed_prediction_row_alignment_is_rejected(self):
        self.folds[0][1]['evaluate_ids'] = ['b']
        with self.assertRaisesRegex(ValueError, 'row order'):
            self.audit.compare(self.rows, self.folds)

    def test_unverified_saved_prediction_is_rejected(self):
        with TemporaryDirectory() as temporary:
            directory = Path(temporary)
            path = directory / 'prediction.json'
            payload = b'{"example":1}'
            path.write_bytes(payload)
            file_index = {'files': {'prediction.json': sha256(payload).hexdigest()}}
            self.assertEqual(self.audit.checked_json(directory, file_index, 'prediction.json'), {'example': 1})
            path.write_bytes(b'{"example":2}')
            with self.assertRaisesRegex(ValueError, 'Changed artifact'):
                self.audit.checked_json(directory, file_index, 'prediction.json')


if __name__ == '__main__':
    unittest.main()
