import unittest
import tempfile
from pathlib import Path
import numpy as np
import pandas as pd
from unittest.mock import patch
import json
import joblib
import olist_train as o


def row(**kw):
    r=dict(order_id='a',customer_id='c',order_status='delivered',order_purchase_timestamp='2018-01-01 12:00:00',order_approved_at='',order_delivered_carrier_date='',order_delivered_customer_date='2018-01-10 23:59:59',order_estimated_delivery_date='2018-01-10 00:00:00')
    r.update(kw); return r

class Cohorts(unittest.TestCase):
    def test_calendar_exact_and_missing_cancelled(self):
        a=o.assess(row()); self.assertEqual((a['calendar'],a['exact']),(0,1))
        self.assertEqual(o.assess(row(order_delivered_customer_date='2018-01-11 00:00:00'))['calendar'],1)
        for kw in ({'order_status':'canceled'},{'order_delivered_customer_date':''}):
            self.assertFalse(o.assess(row(**kw))['core'])
    def test_optional_chronology_and_boundaries(self):
        self.assertTrue(o.assess(row())['strict'])
        self.assertFalse(o.assess(row(order_approved_at='2017-12-31 00:00:00'))['strict'])
        from datetime import datetime as D
        self.assertTrue(o.mature(D(2018,1,1),D(2018,2,1)))
        self.assertFalse(o.mature(D(2018,1,1),D(2018,1,31,23,59,59)))
        a=o.assess(row(order_delivered_customer_date='2018-05-01 00:00:00'))
        self.assertEqual(o.exclusion(a,'validation'),'outcome_at_or_after_cutoff')
        self.assertIsNone(o.window_for(D(2018,3,1)))
    def test_order_and_item_duplicates_and_one_weight(self):
        orders=[row()]; customers=[dict(customer_id='c',customer_unique_id='u')]
        items=[dict(order_id='a',order_item_id=str(i),product_id='p',seller_id='s') for i in [1,2]]
        frame,summary=o.prepare_rows(orders,customers,items)
        self.assertEqual(len(frame),1); self.assertEqual(summary['partitions']['validation']['joined_item_rows'],2)
        with self.assertRaises(ValueError): o.prepare_rows(orders*2,customers,items)
        with self.assertRaises(ValueError): o.prepare_rows(orders,customers,items*2)
        with self.assertRaises(ValueError): o.prepare_rows(orders,customers*2,items)
    def test_novelty_uses_excluded_unused_prior(self):
        orders=[row(order_id='old',order_status='canceled',order_purchase_timestamp='2017-12-31 12:00:00'),row()]
        f,_=o.prepare_rows(orders,[dict(customer_id='c',customer_unique_id='u')],[])
        self.assertFalse(bool(f.iloc[0].unseen_customer))

class Models(unittest.TestCase):
    def test_native_supervised_synthetic_fit_reconstructs_worker_artifacts(self):
        from runner_runtime import ResourceSupervisor,Limits
        x=pd.DataFrame(dict(purchase_month=[1]*20,purchase_weekday=[i%7 for i in range(20)],purchase_hour=list(range(20)),promised_calendar_lead_days=list(range(20)),calendar=[i%2 for i in range(20)]))
        with tempfile.TemporaryDirectory(dir=o.HERE/'datasets') as tmp:
            path=Path(tmp)
            guard=ResourceSupervisor(path,Limits(max_wall_seconds=60,max_fit_seconds=30,max_rss_bytes=2*1024**3,min_available_bytes=0,min_free_disk_bytes=0,max_output_bytes=16*1024**2,poll_seconds=.1,threads=1))
            p,result=o.run_fit(path,o.registry()[4],x,x.iloc[:4],guard)
            self.assertEqual(result['status'],'success')
            self.assertEqual(len(p),4)
            model=joblib.load(path/'primary-04-DT/model.joblib')
            np.testing.assert_allclose(p,o.positive_probability(model,x.iloc[:4][o.FEATURES]))

    def test_unreviewed_sklearn_version_refused_before_fit(self):
        with patch.object(o.sklearn,'__version__','9.0.0'):
            with self.assertRaises(ValueError): o.validate_environment()

    def test_internal_worker_cannot_be_invoked_without_supervision(self):
        from runner_runtime import RuntimeSafetyError
        with self.assertRaises(RuntimeSafetyError): o.main(['_fit','--job','not-an-authorized-job'])

    def test_equal_distance_tie_uses_descending_threshold(self):
        scores=[dict(macro_f1=.7,positive_f1=.6,average_precision=.5,candidate_index=0,threshold=t) for t in [.45,.55]]
        self.assertEqual(min(scores,key=o.ranking)['threshold'],.55)

    def test_missing_class_metrics_are_unavailable_and_invalid_probabilities_refused(self):
        result=o.metrics(np.array([0,0]),np.array([.1,.2]),.5)
        self.assertIsNone(result['macro_f1'])
        self.assertIsNone(result['classes']['1']['recall'])
        with self.assertRaises(ValueError): o.metrics([0,1],[np.nan,.5],.5)
        class M:
            classes_=np.array([0,1])
            def predict_proba(self,x): return np.array([[.2,.2],[.1,.9]])
        with self.assertRaises(ValueError): o.positive_probability(M(),[1,2])

    def test_partial_development_never_freezes_selection(self):
        from runner_runtime import FitLedger,RuntimeSafetyError
        ledger=FitLedger(o.fit_ids())
        ledger.record('primary-00-RF',dict(status='failed'))
        with self.assertRaises(RuntimeSafetyError): ledger.seal()

    def test_full_synthetic_development_then_confirmation_without_refit(self):
        rows=[]
        for role,month in [('train',11),('validation',1),('confirmation',5)]:
            for i in range(12):
                rows.append(dict(order_id=f'{role}{i}',customer=f'u{i}',split=role,calendar=i%2,exact=i%2,
                    strict=i!=11,unseen_customer=i>1,mature60=i<10,month=f'2018-{month:02}',week='2018-01-01' if i<6 else '2018-01-08',
                    purchase_month=month,purchase_weekday=i%7,purchase_hour=i,promised_calendar_lead_days=i+1))
        frame=pd.DataFrame(rows); summary={'synthetic':True}
        calls=[]
        def local_fit(run_dir,spec,train,evaluation,supervisor):
            # Real estimators and production worker; this harness removes only process launch.
            p=run_dir/spec['id']; p.mkdir()
            joblib.dump(dict(x_train=train[o.FEATURES],y_train=train['exact' if spec.get('variant')=='exact' else 'calendar'].to_numpy(),x_evaluation=evaluation[o.FEATURES],spec=spec),p/'input.joblib')
            o.fit_worker(p); calls.append(spec['id'])
            return np.load(p/'probabilities.npy'),dict(status='success')
        real_report=o.complete_report
        def checked_report(f,p,c):
            self.assertEqual(len(calls),33)
            self.assertTrue((confirmation/'predictions-frozen.json').exists())
            self.assertTrue((confirmation/'predictions.npz').exists())
            return real_report(f,p,c)
        real_probability=o.positive_probability
        def probability(m,x): calls.append('confirmation-predict'); return real_probability(m,x)
        with tempfile.TemporaryDirectory(dir=o.HERE/'datasets') as tmp:
            development=Path(tmp)/'development'; development.mkdir()
            confirmation=Path(tmp)/'confirmation'; confirmation.mkdir()
            with patch.object(o,'load_source',return_value=(frame,summary)),patch.object(o,'run_fit',side_effect=local_fit):
                o.develop(None,development,None)
                metadata=json.loads((development/'completion.json').read_text())
                o.write_json(development/'develop.result.json',dict(status='success',returncode=0,elapsed_seconds=metadata['elapsed_seconds']))
                o.freeze_inventory(development,metadata)
                self.assertEqual(len(calls),21)
                self.assertEqual(json.loads((development/'fit-ledger.json').read_text())['status'],'complete')
                with patch.object(o,'positive_probability',side_effect=probability),patch.object(o,'complete_report',side_effect=checked_report):
                    o.confirm(None,confirmation,development)
                self.assertEqual(len(calls),33)
                self.assertEqual(json.loads((confirmation/'completion.json').read_text())['fit_count'],0)
                with self.assertRaises(FileExistsError): o.confirm(None,Path(tmp)/'replay',development)
                frozen=json.loads((development/'frozen.json').read_text())
                frozen['elapsed_seconds']+=1
                (development/'frozen.json').write_text(json.dumps(frozen))
                with self.assertRaises(ValueError): o.validate_development(development)
    def test_exact_registry_and_feature_boundary(self):
        reg=o.registry(); self.assertEqual(len(reg),13)
        self.assertEqual([r['family'] for r in reg],['RF']*4+['DT']*4+['LR']*4+['Dummy'])
        self.assertEqual(len(o.fit_ids()),21)
        x=pd.DataFrame(dict(purchase_month=[1,2],purchase_weekday=[0,1],purchase_hour=[1,2],promised_calendar_lead_days=[0,10]))
        with self.assertRaises(ValueError): o.feature_frame(x.assign(actual_delivery=1))
        for family in ['RF','DT','LR','Dummy']:
            spec=next(r for r in reg if r['family']==family)
            m=o.pipeline(spec); m.fit(o.feature_frame(x),[0,1])
            z=x.iloc[[0]].copy(); z['purchase_month']=12; z['promised_calendar_lead_days']=100
            m.predict_proba(o.feature_frame(z))
            enc=m.named_steps['preprocess'].named_transformers_['categorical']
            self.assertNotIn(12,enc.categories_[0])
            if family=='LR': self.assertEqual(m.named_steps['preprocess'].named_transformers_['numeric'].mean_[0],5)
    def test_class_index_probabilities_and_ties(self):
        class M:
            classes_=np.array([1,0])
            def predict_proba(self,x): return np.array([[.8,.2],[.1,.9]])
        np.testing.assert_equal(o.positive_probability(M(),[1,2]),[.8,.1])
        y=np.array([0,1]); p=np.array([.1,.9]); reg=o.registry()
        selected,all_scores=o.select([(reg[4],p),(reg[5],p)],y)
        self.assertEqual(selected['candidate_id'],reg[4]['id']); self.assertEqual(selected['threshold'],.5)
        self.assertEqual(len(o.thresholds()),202)
        self.assertEqual(o.metrics(y,p,1.01)['alert_count'],0)
        self.assertTrue(o.metrics(y,p,1.01)['positive_precision_undefined'])
    def test_sensitivity_keeps_primary_threshold_and_parameters(self):
        choices={f:dict(candidate_id=next(r['id'] for r in o.registry() if r['family']==f),threshold=.37 if f!='Dummy' else .5) for f in ['RF','DT','LR','Dummy']}
        jobs=o.sensitivity_specs(choices)
        self.assertEqual(len(jobs),8)
        self.assertTrue(all(j['threshold']==choices[j['family']]['threshold'] for j in jobs))
    def test_paired_bootstraps_invalid_and_pairing(self):
        y=np.array([0,1,0,1]); predictions={f:np.array([.1,.9,.2,.8]) for f in ['RF','DT','LR']}
        b=o.bootstrap(y,predictions,{f:.5 for f in predictions},np.array(['a','a','b','b']),replicates=500)
        self.assertEqual(b['paired_differences']['RF-minus-DT']['macro_f1']['interval'],[0,0])
        b=o.bootstrap(np.array([0,1]),{f:np.array([.1,.9]) for f in predictions},{f:.5 for f in predictions},np.array(['a','b']),replicates=500)
        self.assertIsNone(b['models']['RF']['macro_f1']['interval'])
        self.assertGreater(b['models']['RF']['macro_f1']['invalid_replicates'],25)
    def test_confirmation_inventory_tampering_and_replay(self):
        with tempfile.TemporaryDirectory(dir=o.HERE/"datasets") as tmp:
            p=Path(tmp); (p/'a').write_text('original')
            o.freeze_inventory(p,{'status':'success'})
            self.assertEqual(o.verify_inventory(p)['status'],'success')
            o.claim_confirmation(p)
            with self.assertRaises((ValueError,FileExistsError)): o.claim_confirmation(p)
            (p/'a').write_text('changed')
            with self.assertRaises(ValueError): o.verify_inventory(p)

if __name__=='__main__': unittest.main()
