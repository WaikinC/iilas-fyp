import importlib
import unittest
import numpy as np
import pandas as pd

try:
    import freshretailnet_train as f
except ModuleNotFoundError:
    f = None


def source(days=97, series=2):
    rows=[]
    for s in range(series):
        for i,d in enumerate(pd.date_range('2024-03-28', periods=days)):
            rows.append(dict(store_id=s, product_id=s+10, city_id=s, dt=d,
                             sale_amount=float(i+s*1000), stock_hour6_22_cnt=i%3))
    return pd.DataFrame(rows)


class FreshTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(f, 'FreshRetailNet runner is not implemented')

    def test_shift_before_roll_same_series_and_feature_order(self):
        frame=source().sample(frac=1,random_state=3)
        x,m=f.features(frame, '2024-04-25', '2024-04-25')
        self.assertEqual(x.dtype,np.float32)
        self.assertEqual(x.shape,(2,24))
        np.testing.assert_array_equal(x[0,:4],[27,21,14,0])
        np.testing.assert_array_equal(x[1,:4],[1027,1021,1014,1000])
        np.testing.assert_allclose(x[0,8:11],[24,20.5,13.5])
        np.testing.assert_array_equal(x[0,17:],[0,0,0,1,0,0,0])
        marked=frame.copy()
        marked.loc[marked.dt.ge('2024-04-25'),'sale_amount']=999999
        np.testing.assert_array_equal(x,f.features(marked,'2024-04-25','2024-04-25')[0])

    def test_missing_duplicates_and_invalid_values_refused(self):
        for bad in [source().drop(index=3),pd.concat([source(),source().iloc[:1]])]:
            with self.assertRaises(ValueError): f.features(bad,'2024-04-25','2024-04-25')
        for col,value in [('sale_amount',np.inf),('stock_hour6_22_cnt',17)]:
            bad=source(); bad.loc[0,col]=value
            with self.assertRaises(ValueError): f.features(bad,'2024-04-25','2024-04-25')

    def test_probability_class_order_and_grid(self):
        class Model:
            classes_=np.array([1,0])
            def predict_proba(self,x): return np.tile([.8,.2],(len(x),1))
        np.testing.assert_array_equal(f.positive_probability(Model(),np.zeros((3,24))),[.8]*3)
        self.assertEqual(len(f.thresholds()),202)
        self.assertGreater(f.thresholds()[-1],1)
        report=f.metric_report(np.array([0,1]),np.array([.2,.8]),.5)
        self.assertEqual(report['confusion_matrix'],[[1,0],[0,1]])
        no=f.metric_report(np.array([0,1]),np.array([.2,.8]),2)
        self.assertTrue(no['undefined_positive_precision'])

    def test_registry_exact_and_tie_rule(self):
        registry=f.candidates()
        self.assertEqual([r['id'] for r in registry],['dummy_most_frequent','dt_balanced_leaf20','dt_none_leaf20','dt_balanced_leaf100','rf_balanced_leaf20','rf_none_leaf20','rf_balanced_leaf100'])
        self.assertEqual(registry[4]['model'].get_params()['max_samples'],500000)
        common={'macro_f1':.4,'positive_f1':.3,'positive_ap':.2,'order':1}
        options=[dict(common,threshold=.4),dict(common,threshold=.6),dict(common,threshold=.5)]
        self.assertEqual(f.choose(options)['threshold'],.5)
        self.assertEqual(f.choose(options[:2])['threshold'],.6)

    def test_bootstrap_invalid_class_is_unavailable(self):
        out=f.cluster_bootstrap(np.array([0,1]),{'rf':np.array([0,1]),'dt':np.array([1,0]),'dummy':np.array([0,0])},np.array([0,1]),np.array([0,1]),replicates=500)
        self.assertFalse(out['available'])
        self.assertGreater(out['invalid_replicates'],0)
        self.assertEqual(out['replicates'],500)

    def test_development_never_reads_eval(self):
        train=source(90)
        x,m=f.prepare_phase(train,'development')
        self.assertEqual(int(m.dt.max().day),25)
        self.assertEqual(len(x),124)
        with self.assertRaises(ValueError): f.prepare_phase(source(),'development')

if __name__=='__main__': unittest.main()

class FrozenTests(unittest.TestCase):
    def test_confirmation_requires_sealed_untampered_development(self):
        self.assertTrue(hasattr(f,'freeze_selection'),'Frozen-selection interface is absent')
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory(dir=f.DATA) as tmp:
            folder=Path(tmp)
            with self.assertRaises(ValueError): f.validate_selection(folder)
            choices={'rf':{'id':'rf_none_leaf20','threshold':.6},'dt':{'id':'dt_none_leaf20','threshold':.4},'dummy':{'id':'dummy_most_frequent','threshold':.5}}
            with self.assertRaises(ValueError): f.freeze_selection(folder,choices,{'complete':False})

    def test_counts_cutoffs_and_synthetic_fit(self):
        self.assertTrue(hasattr(f,'fit_and_save'),'Fit worker is absent')
        import tempfile
        from pathlib import Path
        from sklearn.tree import DecisionTreeClassifier
        with tempfile.TemporaryDirectory(dir=f.DATA) as tmp:
            path=Path(tmp)
            np.save(path/'x.npy',np.array([[0.],[1.],[2.],[3.]],dtype=np.float32))
            np.save(path/'y.npy',np.array([0,0,1,1],dtype=np.uint8))
            f.fit_and_save(DecisionTreeClassifier(random_state=42),path/'x.npy',path/'y.npy',path/'model.joblib')
            import joblib
            model=joblib.load(path/'model.joblib')
            np.testing.assert_array_equal(model.predict([[0],[3]]),[0,1])


class GuardAndReportingTests(unittest.TestCase):
    def test_frozen_valid_selection_tampering_and_replay(self):
        import tempfile
        from pathlib import Path
        from runner_runtime import write_json_exclusive
        with tempfile.TemporaryDirectory(dir=f.DATA) as tmp:
            folder=Path(tmp)
            choices={'rf':{'id':'rf_none_leaf20','threshold':.6},'dt':{'id':'dt_none_leaf20','threshold':.4},'dummy':{'id':'dummy_most_frequent','threshold':.5}}
            ledger={'status':'complete','expected_ids':[r['id'] for r in f.candidates()], 'results':{r['id']:{'status':'success'} for r in f.candidates()}}
            (folder/'probabilities.bin').write_bytes(b'locked')
            f.freeze_selection(folder,choices,ledger)
            write_json_exclusive(folder/'phase-status.json',{'status':'success','elapsed_seconds':1})
            f.seal_completion(folder)
            self.assertEqual(f.validate_selection(folder)['choices'],choices)
            f.claim_confirmation(folder,'abc')
            with self.assertRaises(FileExistsError): f.claim_confirmation(folder,'abc')
            (folder/'probabilities.bin').write_bytes(b'changed')
            with self.assertRaises(ValueError): f.validate_selection(folder)

    def test_fast_threshold_reports_match_hand_checked_confusion(self):
        self.assertTrue(hasattr(f,'threshold_reports'),'Efficient sweep absent')
        y=np.array([0,1,0,1]); p=np.array([0.,.5,.5,1.])
        table=f.threshold_reports(y,p,[0.,.5,1.,np.nextafter(1.,np.inf)])
        self.assertEqual([r['confusion_matrix'] for r in table],[[[0,2],[0,2]],[[1,1],[0,2]],[[2,0],[1,1]],[[2,0],[2,0]]])
        for r in table:
            self.assertAlmostEqual(r['macro_f1'],f.metric_report(y,p,r['threshold'])['macro_f1'])

class PhaseBoundaryTests(unittest.TestCase):
    def test_midnight_marker_and_prior_completed_eval_day(self):
        frame=source()
        baseline=f.features(frame,'2024-06-27','2024-06-27')[0]
        frame.loc[frame.dt.eq('2024-06-26'),'sale_amount']=777
        changed=f.features(frame,'2024-06-27','2024-06-27')[0]
        np.testing.assert_array_equal(changed[:,0],[777,777])
        self.assertNotEqual(float(baseline[0,0]),float(changed[0,0]))
        frame.loc[frame.dt.ge('2024-06-27'),'sale_amount']=999
        np.testing.assert_array_equal(changed,f.features(frame,'2024-06-27','2024-06-27')[0])

    def test_confirmation_uses_exact_three_locked_candidates(self):
        self.assertTrue(hasattr(f,'phase_candidates'),'Phase registry selector absent')
        chosen={'rf':{'id':'rf_none_leaf20','threshold':.6},'dt':{'id':'dt_none_leaf20','threshold':.4},'dummy':{'id':'dummy_most_frequent','threshold':.5}}
        self.assertEqual(len(f.phase_candidates('development')),7)
        self.assertEqual([r['id'] for r in f.phase_candidates('confirmation',chosen)],['dummy_most_frequent','dt_none_leaf20','rf_none_leaf20'])
        with self.assertRaises(ValueError): f.phase_candidates('confirmation',dict(chosen,rf={'id':'dt_none_leaf20','threshold':.6}))

class SyntheticOrchestrationTests(unittest.TestCase):
    def test_real_worker_phase_handoff_and_prescore_freeze(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from sklearn.ensemble import RandomForestClassifier
        from runner_runtime import FitLedger,write_json_exclusive
        original_candidates=f.candidates
        original_report=f.report_phase
        observed=[]; fit_count=[0]; preparing=[False]
        def tiny_candidates():
            rows=original_candidates()
            for row in rows:
                if row['family']=='rf': row['model']=RandomForestClassifier(n_estimators=2,max_samples=2,n_jobs=1,random_state=42)
            return rows
        def tiny_source(name):
            if name=='eval.parquet' and not preparing[0]: self.assertEqual(fit_count[0],10)
            data=source()
            data['stock_hour6_22_cnt']=data.store_id%2
            data['source_partition']=np.where(data.dt.le('2024-06-25'),'train.parquet','eval.parquet')
            data['source_row']=np.arange(len(data))
            return data.loc[data.source_partition.eq(name)].copy()
        def tiny_fits(folder,rows,remaining):
            ledger=FitLedger([r['id'] for r in rows])
            for row in rows:
                f.fit_and_save(row['model'],folder/'fit-x.npy',folder/'fit-y.npy',folder/(row['id']+'.joblib'))
                ledger.record(row['id'],{'status':'success'}); fit_count[0]+=1
            return ledger.seal()
        def checked_report(folder,metadata,probabilities,phase,choices=None):
            import json
            frozen=json.loads((folder/'predictions-frozen.json').read_text())
            self.assertEqual(len(frozen['probabilities']),7 if phase=='development' else 3)
            for name,sha in frozen['probabilities'].items():
                self.assertEqual(f.digest(folder/(name+'-probability.npy')),sha)
            observed.append(phase)
            return original_report(folder,metadata,probabilities,phase,choices)
        with tempfile.TemporaryDirectory(dir=f.DATA) as tmp, patch.object(f,'candidates',tiny_candidates), patch.object(f,'read_source',tiny_source), patch.object(f,'validate_counts',return_value={'synthetic':True}), patch.object(f,'fit_registry',tiny_fits), patch.object(f,'report_phase',checked_report), patch.object(f,'validate_warmup',return_value=None):
            base=Path(tmp); dev=base/'dev'; confirm=base/'confirm'; prep=base/'prepare'; dev.mkdir(); confirm.mkdir(); prep.mkdir()
            preparing[0]=True
            f.prepare_worker(prep,{'contract':f.contract(),'evidence':{'synthetic':True}})
            preparing[0]=False
            self.assertEqual(np.load(prep/'features.npy').shape,(138,24))
            self.assertEqual(fit_count[0],0)
            for folder in (dev,confirm): write_json_exclusive(folder/'manifest.json',{'contract':f.contract(),'remaining_wall_seconds':60})
            f.worker('development',dev)
            write_json_exclusive(dev/'phase-status.json',{'status':'success','elapsed_seconds':1})
            f.seal_completion(dev)
            original_status=(dev/'phase-status.json').read_bytes()
            self.assertEqual(len(f.validate_selection(dev)['ledger']['results']),7)
            (dev/'phase-status.json').write_text('{"status":"failed"}')
            with self.assertRaises(ValueError): f.worker('confirmation',confirm,dev)
            self.assertEqual(fit_count[0],7)
            (dev/'phase-status.json').write_bytes(original_status)
            f.worker('confirmation',confirm,dev)
            self.assertEqual(observed,['development','confirmation'])
            import json
            self.assertEqual(json.loads((confirm/'execution.json').read_text())['model_fits'],3)
            self.assertEqual(len(json.loads((dev/'threshold-table.json').read_text())),1213)


class DevelopmentReplayTests(unittest.TestCase):
    def test_new_destination_cannot_repeat_development_protocol(self):
        self.assertTrue(hasattr(f,'claim_development'),'Development replay claim absent')
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory(dir=f.DATA) as tmp:
            path=Path(tmp)/'protocol-claims'
            f.claim_development('first',path)
            with self.assertRaises(FileExistsError): f.claim_development('different-output',path)


class CompletionSealTests(unittest.TestCase):
    def test_parent_status_and_elapsed_are_hash_bound(self):
        self.assertTrue(hasattr(f,'seal_completion'),'Parent completion seal absent')
        import tempfile
        from pathlib import Path
        from runner_runtime import write_json_exclusive
        with tempfile.TemporaryDirectory(dir=f.DATA) as tmp:
            folder=Path(tmp)
            choices={'rf':{'id':'rf_none_leaf20','threshold':.6},'dt':{'id':'dt_none_leaf20','threshold':.4},'dummy':{'id':'dummy_most_frequent','threshold':.5}}
            ledger={'status':'complete','results':{r['id']:{'status':'success'} for r in f.candidates()}}
            f.freeze_selection(folder,choices,ledger)
            write_json_exclusive(folder/'phase-status.json',{'status':'success','elapsed_seconds':7200})
            f.seal_completion(folder)
            f.validate_selection(folder)
            (folder/'phase-status.json').write_text('{"status":"success","elapsed_seconds":0}')
            with self.assertRaises(ValueError): f.validate_selection(folder)

class PrepareSourceTests(unittest.TestCase):
    def test_small_source_cannot_claim_full_pinned_warmup(self):
        self.assertTrue(hasattr(f,'validate_warmup'),'Pinned warmup verifier absent')
        with self.assertRaises(ValueError): f.validate_warmup(source())
