import copy
import importlib.util
import unittest
from pathlib import Path
import tempfile
from unittest.mock import patch
import inventory_context_contract as c
from test_inventory_context_contract import make_case


class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_context_evaluate'),'V2 grouped evaluation missing')
        import inventory_context_evaluate as api
        self.a=api
        self.rows=[]
        for family,label in (('A','Normal'),('B','Critical Stock Risk')):
            for view in range(12):
                case=make_case();case.update(family_id=family,view_id=view+1)
                self.rows.append(dict(sample_id=f'{family}-{view}',family_id=family,label=label,case=case,features=[100,0,1,80,0,2]))
        self.predictions={arm:['Normal']*24 for arm in api.train.ARMS}

    def test_bootstrap_resamples_whole_families_and_reports_undefined(self):
        value=self.a.family_bootstrap(self.rows,self.predictions)
        self.assertEqual(len(value['draws']),500)
        self.assertGreater(value['undefined_counts']['RF6']['critical_precision'],0)
        for draw in value['draws']:
            self.assertEqual(len(draw['family_ids']),2)
            self.assertEqual(len(draw['row_indices']),24)
            self.assertEqual(set(draw['metrics']),set(self.a.train.ARMS))
            for offset,family in enumerate(draw['family_ids']):
                indices=draw['row_indices'][offset*12:(offset+1)*12]
                self.assertEqual([self.rows[i]['family_id'] for i in indices],[family]*12)
                self.assertEqual(len(set(indices)),12)
        self.assertEqual(value,self.a.family_bootstrap(self.rows,self.predictions))
        self.assertEqual(value['intervals']['RF14-minus-RF6']['macro_f1'],[0,0])
        with self.assertRaises(ValueError):self.a.family_bootstrap(self.rows[:-1],{k:v[:-1] for k,v in self.predictions.items()})

    def test_independent_arithmetic_matches_and_rejects_draw_tamper(self):
        a=self.a
        value=a.family_bootstrap(self.rows,self.predictions)
        with (patch.object(a,'score',side_effect=AssertionError('Audit used primary metric')),
              patch.object(a,'family_bootstrap',side_effect=AssertionError('Audit regenerated primary bootstrap'))):
            a.audit_bootstrap(self.rows,self.predictions,value)
            bad=copy.deepcopy(value);bad['draws'][0]['row_indices'][0]=23
            with self.assertRaises(ValueError):a.audit_bootstrap(self.rows,self.predictions,bad)
        metric=a.score(['Normal'],['Normal'])
        self.assertIn('Critical Stock Risk',metric['undefined_f1'])

    def test_all_predictions_saved_before_any_metric_and_readonly_audit(self):
        e=self.a;a=e.a
        base=Path(__file__).parent/'datasets/context-evaluation-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            root=Path(temp).resolve();dev=root/'dev';out=root/'eval';dev.mkdir();out.mkdir()
            rows=[]
            for family in range(60):
                for view in range(12):
                    case=make_case();case['sample_id']=f'F{family}-V{view}'
                    case['family_id']=case['ledger']['family_id']=f'F{family}';case['view_id']=view+1
                    rows.append(dict(case=case,sample_id=case['sample_id'],family_id=case['family_id'],
                        features=list(c.encode_case(case,feature_set='context')),label=c.CLASSES[view%3]))
            selected={arm:next(s for s in e.train.candidates() if s['arm']==arm) for arm in e.train.ARMS}
            a.write_json(dev/'development.json',dict(selected=selected,controls=e.train.fit_controls(rows)))
            frozen=dict(output=str(dev),files=a._inventory(dev));claim={'output':str(out)}
            class Model:
                classes_=list(c.CLASSES)
                def predict_proba(self,x):return [[.8,.1,.1] for _ in x]
            original_read=a.read_json;real_score=e.score
            def metric_guard(*args):
                self.assertTrue((out/'predictions-complete.json').is_file())
                for arm in e.train.ARMS:self.assertTrue((out/(arm+'.predictions.json')).is_file())
                return real_score(*args)
            with (patch.object(a.runtime,'require_supervised_worker'),patch.object(a,'verify_claim'),
                  patch.object(a,'completion',return_value=frozen),patch.object(e.train,'validate_development',return_value={}),
                  patch.object(a,'load_rows',return_value=rows),
                  patch.object(a,'read_json',side_effect=lambda path:claim if Path(path)==a._claim_path('evaluation') else original_read(path)),
                  patch('joblib.load',return_value=Model()),patch.object(e,'score',side_effect=metric_guard)):
                result=e.evaluate(root/'source','a'*64,dev,out,None)
                self.assertEqual((result['rows'],result['families']),(720,60))
                with (patch('joblib.load',side_effect=AssertionError('Audit loaded estimator')),
                      patch.object(e.train,'estimator',side_effect=AssertionError('Audit fitted estimator')),
                      patch.object(e,'score',side_effect=AssertionError('Audit called primary metric')),
                      patch.object(e,'family_bootstrap',side_effect=AssertionError('Audit reused primary bootstrap'))):
                    self.assertTrue(e.audit_evaluation(root/'source','a'*64,dev,out)['verified'])
                    data=a.read_json(out/'RF6.predictions.json');data['sample_ids'].reverse()
                    (out/'RF6.predictions.json').write_bytes(c.sim.canonical(data))
                    with self.assertRaises(ValueError):e.audit_evaluation(root/'source','a'*64,dev,out)


if __name__=='__main__':unittest.main()
