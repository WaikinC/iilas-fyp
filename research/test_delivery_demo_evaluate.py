import unittest
from unittest.mock import patch
import delivery_demo_evaluate as m

class Evaluation(unittest.TestCase):
    def test_family_bootstrap_is_deterministic_and_reports_undefined(self):
        labels=['Low','Medium','High']*4;predicted=['Low']*12;families=['a']*4+['b']*4+['c']*4
        a=m.bootstrap_intervals(labels,predicted,families);self.assertEqual(a,m.bootstrap_intervals(labels,predicted,families));self.assertEqual(a['resamples'],1000);self.assertEqual(a['highPrecision']['undefined'],1000)
    def test_hash_checked_before_loading_any_estimator(self):
        with patch.object(m.a,'read_bytes',return_value=b'not a model'),patch('joblib.load',side_effect=AssertionError('Must not unpickle')):
            with self.assertRaises(ValueError):m.load_model('x.joblib','0'*64)
    def test_evaluation_has_native_admission_before_any_source_read(self):
        with patch.object(m.a,'read_json',side_effect=AssertionError('No read before admission')):
            with self.assertRaises(Exception):m.evaluate('development.json','unused')

if __name__=='__main__':unittest.main()
