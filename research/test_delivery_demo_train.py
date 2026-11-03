import unittest
from pathlib import Path
from uuid import uuid4
import sys
from unittest.mock import patch
import delivery_demo_train as m
import delivery_demo_contract as c

class Train(unittest.TestCase):
    def test_fixed_eleven_candidate_registry_and_fair_selection(self):
        specs=m.candidates();self.assertEqual(len(specs),11);self.assertEqual([s['family'] for s in specs].count('RF'),4);self.assertEqual([s['family'] for s in specs].count('DT'),4);self.assertEqual([s['family'] for s in specs].count('LR'),2)
        rf=m.estimator(specs[0],list(c.CLASSES));self.assertEqual((rf.n_estimators,rf.n_jobs,rf.max_depth,rf.min_samples_leaf),(128,2,8,1))
        records=[dict(index=i,spec=s,metrics=dict(macroF1=.5,perClass={'High':{'recall':.5,'precision':.5}})) for i,s in enumerate(specs)]
        self.assertEqual(m.select(records)['RF'],0);records[1]['metrics']['perClass']={'High':{'recall':.6,'precision':.4}};self.assertEqual(m.select(records)['RF'],1)
    def test_development_reader_never_reads_test_and_matrix_has_only_columns(self):
        manifest={'output':'unused'};row={'features':dict(zip(c.FEATURES,[10,1,0,0,1,2,1,0,1,0])),'label':'Low'};opened=[]
        with patch.object(m.data,'verify_dataset',return_value=manifest),patch.object(m.a,'read_json',side_effect=lambda p:opened.append(str(p)) or [row]):
            train,validation=m.development_rows('manifest.json')
        self.assertEqual(len(opened),2);self.assertTrue(all('test.json' not in p for p in opened));self.assertEqual(m.matrix(train),[[10,1,0,0,1,2,1,0,1,0]])
    def test_fitting_requires_native_worker_and_preprocessing_fits_train_only(self):
        class Spy:
            classes_=list(c.CLASSES)
            def fit(self,x,y):self.seen=(x,y);return self
            def predict_proba(self,x):self.predicted=x;return [[1,0,0] for _ in x]
        spy=Spy();train=[[1]*10]*3;validation=[[2]*10]*2
        with self.assertRaises(Exception):m.fit_candidate(m.candidates()[0],train,list(c.CLASSES),validation)
        with patch.object(m.runtime,'require_supervised_worker'),patch.object(m,'estimator',return_value=spy):model,result=m.fit_candidate(m.candidates()[0],train,list(c.CLASSES),validation)
        self.assertEqual(spy.seen,(train,list(c.CLASSES)));self.assertEqual(spy.predicted,validation);self.assertEqual(result['predicted'],['Low','Low'])
    def test_strict_class_mapping_tie_and_metric_undefined_precision(self):
        class Model:
            classes_=['High','Low','Medium']
            def predict_proba(self,x):return [[.5,.5,0] for _ in x]
        self.assertEqual(m.predictions(Model(),[[0]*10])['predicted'],['Low'])
        result=m.score(['Low','Medium','High'],['Low']*3);self.assertEqual(result['perClass']['High']['precision'],0);self.assertTrue(result['perClass']['High']['precisionUndefined'])
    def test_native_limits_and_inherited_confirmed_lifecycle(self):
        from inventory_context_runtime import ContextServingSupervisor
        from inventory_inference import _StockSupervisor
        self.assertIs(m.SUPERVISOR,ContextServingSupervisor);self.assertIs(m.SUPERVISOR.run,_StockSupervisor.run)
        self.assertEqual((m.limits(False).max_fit_seconds,m.limits(True).max_wall_seconds,m.limits(False).threads),(120,1800,1))
    def test_actual_supervised_fixture_fit_confirms_cleanup(self):
        import delivery_demo_simulation as simulation
        rows=[];counts={label:0 for label in c.CLASSES}
        for case in simulation.generate_families():
            row=simulation.replay_snapshot(case);label=c.teaching_label(row['facts'])['label']
            if counts[label]<3:rows.append({**row,'label':label});counts[label]+=1
            if min(counts.values())==3:break
        root=m.a.DATA_ROOT/'nativechecks'/uuid4().hex[:8];root.mkdir(parents=True)
        x=m.matrix(rows);job=dict(index=0,spec=m.candidates()[0],features=list(c.FEATURES),xtrain=x,ytrain=[r['label'] for r in rows],xvalidation=x[:3],datasetSha256='a'*64,claimSha256='b'*64)
        path=root/'job.json';digest=m.a.write_json(path,job);supervisor=m.SUPERVISOR(root,m.limits(),m.a.DATA_ROOT)
        result=supervisor.run([sys.executable,str(Path(m.__file__).with_name('delivery_demo_cli.py')),'_fit','--job',str(path),'--sha256',digest],fit_id='inference',cwd=m.a.ROOT)
        self.assertEqual(result['status'],'success',str(result)+' '+str(root));self.assertTrue(result['cleanup_confirmed']);self.assertEqual(m.a.read_json(root/'job.fit.json')['fitRows'],9)

if __name__=='__main__':unittest.main()
