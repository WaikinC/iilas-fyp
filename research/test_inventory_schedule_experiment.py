import importlib.util
import unittest


class ScheduleExperimentTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_schedule_experiment'))
        import inventory_schedule_experiment as experiment
        self.experiment = experiment

    def test_predictors_use_only_recorded_schedules(self):
        stock = (10, 2, 4, 3, 0, 9)
        commitments = ((2, 6), (2, 7), (8, 11))
        incoming = ((1, 4, 'planned'), (2, 8, 'confirmed'), (11, 12, 'confirmed'))
        baseline, schedule = self.experiment.feature_vectors(stock, commitments, incoming)
        self.assertEqual(baseline, [10, 2, 4, 3, 0, 9, 6, 2, 4, 1, 0, 1, 0, 0])
        self.assertEqual(schedule, baseline + [1, 8, 13, 24, 20])
        absent, absent_schedule = self.experiment.feature_vectors(stock, (), ())
        self.assertEqual(absent, [10, 2, 4, 3, 0, 9, 0, 0, 0, 0, 1, 0, 0, 0])
        self.assertEqual(absent_schedule, absent + [0, 0, 0, 0, 0])

    def test_outcome_uses_realized_stock_at_each_deadline_and_horizon(self):
        replay = self.experiment.classify_trajectory
        self.assertEqual(replay(5, 4, ((4, 10),), ((3, 6),)), 'Critical Stock Risk')
        self.assertEqual(replay(5, 4, ((3, 5),), ((3, 6),)), 'Reorder Risk')
        self.assertEqual(replay(5, 4, ((3, 6),), ((3, 6),)), 'Normal')
        self.assertEqual(replay(5, 4, (), ((15, 6),)), 'Normal')

    def test_development_folds_hold_whole_families_and_reserve_later_families(self):
        folds = self.experiment.development_groups()
        self.assertEqual(tuple(map(len, folds)), (60, 60, 60))
        self.assertEqual(set().union(*map(set, folds)), set(range(180)))
        self.assertEqual(self.experiment.HOLDOUT_FAMILIES, range(180, 240))
        self.assertEqual(folds, self.experiment.development_groups())
        rows = self.experiment.build_family(0)
        self.assertEqual({row['family'] for row in rows}, {'IS3-000'})
        self.assertEqual(len({row['sample'] for row in rows}), 4)
        self.assertEqual(rows, self.experiment.build_family(0))
        self.assertTrue(all(len(row['rf14']) == 14 and len(row['schedule']) == 19 for row in rows))


if __name__ == '__main__':
    unittest.main()
