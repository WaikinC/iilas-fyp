"""Pure wire contract tests; no dataset access, fitting or deserialization."""
import copy
import importlib
import unittest
import json
import hashlib
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

try:
    m=importlib.import_module('inventory_context_inference')
except ModuleNotFoundError as error:
    if error.name!='inventory_context_inference':raise
    m=None

def features():
    return dict(available_quantity=7,reserved_quantity=3,movement_frequency=2,reorder_distance=-1,
        adjustment_count=0,days_since_replenishment=.0005,additional_firm_quantity=0,
        additional_due_days=0,incoming_quantity=0,incoming_eta_days=0,
        supply_none=1,supply_planned=0,supply_confirmed=0,supply_disrupted=0)

class WireContract(unittest.TestCase):
    def setUp(self):self.assertIsNotNone(m,'Context inference contract must exist')
    def test_exact_order_and_no_double_reservations(self):
        self.assertEqual(m.validate_features(features()),features())
        self.assertEqual(tuple(m.validate_features(dict(reversed(list(features().items()))))),m.FEATURES)
    def test_invalid_units_and_keys(self):
        for key in features():
            for value in (True,False,None,'1',float('nan'),float('inf')):
                with self.subTest(key=key,value=value),self.assertRaises(ValueError):m.validate_features({**features(),key:value})
            f=features();del f[key]
            with self.assertRaises(ValueError):m.validate_features(f)
        with self.assertRaises(ValueError):m.validate_features({**features(),'label':'Normal'})
    def test_stock_and_absence_consistency(self):
        patches=[dict(reserved_quantity=1000000),dict(adjustment_count=3),dict(reorder_distance=8),
            dict(supply_none=0),dict(supply_planned=1),dict(supply_none=.5,supply_confirmed=.5),
            dict(incoming_quantity=1),dict(incoming_eta_days=1),dict(additional_due_days=1),
            dict(additional_firm_quantity=1.1),dict(days_since_replenishment=36501)]
        for patch in patches:
            with self.subTest(patch=patch),self.assertRaises(ValueError):m.validate_features({**features(),**patch})
    def test_positive_supply_and_due_now(self):
        for state in ('planned','confirmed','disrupted'):
            f={**features(),'supply_none':0,'supply_'+state:1,'incoming_quantity':1,'incoming_eta_days':0,'additional_firm_quantity':1,'additional_due_days':.25}
            self.assertEqual(m.validate_features(f),f)
            f['incoming_quantity']=0
            with self.assertRaises(ValueError):m.validate_features(f)
    def test_binary64_and_zero(self):
        self.assertIn('reorder_distance=bff0000000000000\n',m.feature_payload(features()))
        self.assertEqual(m.feature_payload({**features(),'days_since_replenishment':-0.0}),m.feature_payload({**features(),'days_since_replenishment':0}))
        self.assertIn('days_since_replenishment=3e7ad7f29abcaf48\n',m.feature_payload({**features(),'days_since_replenishment':1e-7}))
    def test_request_identity_and_feature_digest(self):
        r=dict(protocol=m.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',inputSha256=m.feature_digest(features()),features=features())
        original=copy.deepcopy(r);self.assertEqual(m.validate_request(r),r);self.assertEqual(r,original)
        for patch in (dict(protocol='old'),dict(requestId='bad'),dict(inputSha256='0'*64),dict(extra=1)):
            with self.assertRaises(ValueError):m.validate_request({**r,**patch})

class ServingMetadata(unittest.TestCase):
    def setUp(self):
        self.assertTrue(hasattr(m,'load_manifest'),'Source-bound context metadata adapter must exist')
        root=Path(__file__).resolve().parents[1]
        (root/'outputs/t').mkdir(parents=True,exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=root/'outputs/t',prefix='cm')
        self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.patches=[]
        def replace(name,value):
            ctx=patch.object(m,name,value);ctx.start();self.addCleanup(ctx.stop)
        replace('ROOT',self.root);replace('SOURCE_FILES',('lib/service.js',))
        (self.root/'lib').mkdir();(self.root/'lib/service.js').write_text('fixture service')
        self.base=self.root/'research/datasets/inventory-simulation-v2';self.base.mkdir(parents=True)
        self.model_bytes=b'explicit non-executable software fixture'
        self.write('development-01/final-RF14.joblib',self.model_bytes)
        native=dict(status='success',returncode=0,cleanup_confirmed=True)
        self.basis={'source_pins':{'fixture':'a'*64},'versions':m.versions(),'features14':list(m.FEATURES)}
        self.write('main-01/manifest.json',dict(basis=self.basis,files={},counts={}))
        spec=dict(arm='RF14',depth=12,features='context',leaf=2)
        self.write('development-01/development.json',dict(selected={'RF14':spec},basis=self.basis))
        self.write('development-01/final-RF14.job.json',dict(spec=spec,features=list(m.FEATURES),x_train=[list(features().values())]))
        self.write('evaluation-01/evaluation.json',dict(rows=720,families=60,source_sha256='x',provenance={'origin':'simulated'},metrics={'RF14':dict(accuracy=587/720,macro_f1=.8080105925190334,per_class={'Critical Stock Risk':dict(precision=.79,recall=316/360)})},bootstrap={'intervals':{'RF14':{'accuracy':[.7853819444444444,.8486111111111111]}}}))
        for phase,folder in [('preparation','main-01'),('development','development-01'),('evaluation','evaluation-01')]:
            inventory={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (self.base/folder).iterdir()}
            self.write(f'registry/context-v2-main-01-{phase}-complete.json',dict(phase=phase,files=inventory,receipt={'native':native}))
        refs=['main-01/manifest.json','development-01/final-RF14.joblib','development-01/development.json','evaluation-01/evaluation.json']+[f'registry/context-v2-main-01-{p}-complete.json' for p in ('preparation','development','evaluation')]
        replace('FROZEN_HASHES',{p:hashlib.sha256((self.base/p).read_bytes()).hexdigest() for p in refs})
        replace('scientific_basis',lambda:self.basis)
        self.dest=self.root/'research/datasets/inventory-context-serving-v2/manifest.json'
    def write(self,name,value):
        p=self.base/name;p.parent.mkdir(parents=True,exist_ok=True)
        p.write_bytes(value if isinstance(value,bytes) else json.dumps(value,sort_keys=True).encode())
    def prepare(self):
        with patch.object(m,'audit_development',return_value=None) as audit:
            result=m.prepare_manifest(self.dest);audit.assert_called_once()
        return result
    def test_prepare_then_bounded_load_without_deep_audit(self):
        result=self.prepare()
        with patch.object(m,'audit_development',side_effect=AssertionError('Repeated deep audit')):
            self.assertEqual(m.load_manifest(result.path,result.sha256).data,result.data)
        self.assertEqual(result.data['metrics']['observations'],720)
        self.assertEqual(result.data['model']['spec']['arm'],'RF14')
    def test_serving_helper_tamper_refuses_binding(self):
        helper=self.root/'research/inventory_context_runtime.py';helper.parent.mkdir(exist_ok=True);helper.write_text('fixture helper version1')
        with patch.object(m,'SOURCE_FILES',('lib/service.js','research/inventory_context_runtime.py')):
            result=self.prepare();helper.write_text('altered serving helper')
            with self.assertRaises(m.StockUnavailable):m.load_manifest(result.path,result.sha256)
    def test_frozen_file_and_service_source_mutations_are_rejected(self):
        result=self.prepare()
        for relative in m.FROZEN_HASHES:
            p=self.base/relative;blob=p.read_bytes();p.write_bytes(blob+b' ')
            with self.subTest(relative=relative),self.assertRaises(m.StockUnavailable):m.load_manifest(result.path,result.sha256)
            p.write_bytes(blob)
        (self.root/'lib/service.js').write_text('changed')
        with self.assertRaises(m.StockUnavailable):m.load_manifest(result.path,result.sha256)
    def test_even_rehashed_manifest_cannot_change_model_features_metrics_or_versions(self):
        result=self.prepare()
        for key,value in [('model',{**result.data['model'],'spec':{'arm':'DT14'}}),('features',list(reversed(m.FEATURES))),('classOrder',list(reversed(m.CLASSES))),('versions',{}),('metrics',{**result.data['metrics'],'accuracy':1}),('scientificBasis',{}),('ranges',{}),('operationally_approved',0)]:
            altered={**result.data,key:value};self.dest.write_text(json.dumps(altered));sha=hashlib.sha256(self.dest.read_bytes()).hexdigest()
            with self.subTest(key=key),self.assertRaises(m.StockUnavailable):m.load_manifest(self.dest,sha)
    def test_no_overwrite_outside_link_or_oversized_metadata(self):
        result=self.prepare()
        with self.assertRaises((m.StockUnavailable,ValueError,FileExistsError)):m.prepare_manifest(self.dest)
        for p in [self.root/'outside.json',self.root/'research/datasets/../escape.json']:
            with self.assertRaises((m.StockUnavailable,ValueError)):m.prepare_manifest(p)
        linked=self.dest.with_name('linked.json');linked.hardlink_to(self.dest)
        with self.assertRaises(m.StockUnavailable):m.load_manifest(linked,result.sha256)
        linked.unlink();self.dest.write_bytes(b' '*65537)
        with self.assertRaises(m.StockUnavailable):m.load_manifest(self.dest,hashlib.sha256(self.dest.read_bytes()).hexdigest())
    def test_failed_native_completion_is_rejected_even_with_rebound_fixture_pin(self):
        relative='registry/context-v2-main-01-development-complete.json';p=self.base/relative
        v=json.loads(p.read_text());v['receipt']['native']['cleanup_confirmed']=False;self.write(relative,v)
        m.FROZEN_HASHES[relative]=hashlib.sha256(p.read_bytes()).hexdigest()
        with self.assertRaises(m.StockUnavailable):self.prepare()
    def test_prediction_validation_binds_request_and_rejects_boolean_scores(self):
        manifest=self.prepare();request=dict(protocol=m.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',inputSha256=m.feature_digest(features()),features=features())
        value=dict(request,classOrder=list(m.CLASSES),model='RandomForest',label='Critical Stock Risk',probabilities=[.5,0,.5],modelSha256=manifest.data['model']['sha256'],servingManifestSha256=manifest.sha256,**{k+'Sha256':manifest.data[k]['sha256'] for k in ('dataset','development','evaluation')},processingTimeMs=1,totalProcessingTimeMs=2,outOfRange=[],**m.PROVENANCE)
        self.assertEqual(m.validate_prediction(value,request,manifest),value)
        for change in [dict(probabilities=[True,0,0]),dict(label='Normal'),dict(operationally_approved=0),dict(requestId='bad'),dict(outOfRange=['supply_none']),dict(processingTimeMs=3)]:
            with self.subTest(change=change),self.assertRaises(m.StockUnavailable):m.validate_prediction({**value,**change},request,manifest)

class ActualMetadata(unittest.TestCase):
    def test_saved_metadata_reads_no_raw_test_fit_or_model_load(self):
        self.assertTrue(hasattr(m,'_snapshot'),'Metadata snapshot implementation required')
        if not (m.ROOT/m.DATA_REL/'main-01/manifest.json').exists():self.skipTest('Local ignored scientific artifacts unavailable')
        import joblib
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.tree import DecisionTreeClassifier
        original=Path.open;opened=[]
        def guard(path,*args,**kwargs):
            name=path.as_posix();opened.append(name)
            if '/main-01/test/' in name or name.endswith('/main-01/test.csv'):raise AssertionError('Raw held-out observation opened')
            return original(path,*args,**kwargs)
        # Later-task sources do not exist yet. This test checks real scientific
        # metadata only, not a usable production serving manifest.
        existing=tuple(p for p in m.SOURCE_FILES if (m.ROOT/p).exists())
        with patch.object(m,'SOURCE_FILES',existing),patch.object(Path,'open',guard),patch.object(joblib,'load',side_effect=AssertionError('Unpickle during metadata')),patch.object(RandomForestClassifier,'fit',side_effect=AssertionError('Fit during metadata')),patch.object(DecisionTreeClassifier,'fit',side_effect=AssertionError('Fit during metadata')):
            value=m._snapshot()
        self.assertEqual(value['metrics']['accuracy'],587/720)
        self.assertEqual(value['metrics']['families'],60)
        self.assertTrue(any(p.endswith('final-RF14.job.json') for p in opened))

class ModelInference(unittest.TestCase):
    setUp=ServingMetadata.setUp
    write=ServingMetadata.write
    prepare=ServingMetadata.prepare
    def model(self):
        import numpy as np
        from sklearn.ensemble import RandomForestClassifier
        model=RandomForestClassifier(n_estimators=100,max_depth=12,min_samples_leaf=2,class_weight='balanced',random_state=42,n_jobs=2)
        model.classes_=np.array(sorted(m.CLASSES));model.n_features_in_=14
        model.predict_proba=lambda rows:np.array([[.5,.5,0]])
        return model
    def request(self):return dict(protocol=m.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',inputSha256=m.feature_digest(features()),features=features())
    def test_supervised_worker_required_before_configuration_or_model_access(self):
        self.assertTrue(hasattr(m,'infer'),'Frozen RF context inference required')
        with patch.object(m.runtime,'require_supervised_worker',side_effect=RuntimeError('outside owned Job')),patch.object(m,'load_manifest',side_effect=AssertionError('Read before Job admission')):
            with self.assertRaisesRegex(RuntimeError,'outside owned Job'):m.infer(None,None,None)
    def test_same_buffer_hash_before_unpickle_and_alphabetical_tie(self):
        self.assertTrue(hasattr(m,'infer'),'Frozen RF context inference required')
        import joblib
        manifest=self.prepare();received=[]
        def load(stream):received.append(stream.read());return self.model()
        with patch.object(m.runtime,'require_supervised_worker'),patch.object(m,'load_manifest',return_value=manifest),patch.object(joblib,'load',side_effect=load):
            result=m.infer(manifest,self.request(),self.dest.with_name('result.json'))
        self.assertEqual(received,[self.model_blob()]);self.assertEqual(result['label'],'Critical Stock Risk');self.assertEqual(result['probabilities'],[.5,0,.5]);self.assertEqual(m.validate_prediction(result,self.request(),manifest),result)
    def model_blob(self):return self.model_bytes
    def test_model_hash_change_refuses_deserialization(self):
        self.assertTrue(hasattr(m,'infer'),'Frozen RF context inference required')
        import joblib
        manifest=self.prepare();(self.base/'development-01/final-RF14.joblib').write_bytes(b'changed pickle')
        with patch.object(m.runtime,'require_supervised_worker'),patch.object(m,'load_manifest',return_value=manifest),patch.object(joblib,'load',side_effect=AssertionError('Unverified pickle loaded')):
            with self.assertRaises(m.StockUnavailable):m.infer(manifest,self.request(),self.dest.with_name('result.json'))
    def test_parameter_and_feature_order_schema_cannot_change(self):
        self.assertTrue(hasattr(m,'infer'),'Frozen RF context inference required')
        import joblib
        manifest=self.prepare()
        for field,value in [('n_features_in_',6),('max_depth',6),('n_jobs',-1),('classes_',list(reversed(sorted(m.CLASSES))))]:
            model=self.model();setattr(model,field,value)
            with self.subTest(field=field),patch.object(m.runtime,'require_supervised_worker'),patch.object(m,'load_manifest',return_value=manifest),patch.object(joblib,'load',return_value=model),self.assertRaises(m.StockUnavailable):m.infer(manifest,self.request(),self.dest.with_name('result.json'))

class ActualNative(unittest.TestCase):
    def run_native(self,mode):
        if os.name!='nt':self.skipTest('Native Windows Job required')
        if not (m.ROOT/m.DATA_REL/'main-01/manifest.json').exists():self.skipTest('Ignored frozen study unavailable')
        from inventory_inference import _StockSupervisor
        from uuid import uuid4
        root=m.ROOT/m.SERVING_REL/'software-checks';root.mkdir(parents=True,exist_ok=True)
        output=m.runtime.create_run_directory(root/str(uuid4()),m.ROOT)
        seconds=120 if mode=='audit' else 15
        limits=m.runtime.Limits(max_wall_seconds=seconds,max_fit_seconds=seconds,max_rss_bytes=2*1024**3,min_available_bytes=3*1024**3,min_free_disk_bytes=1024**3,max_output_bytes=10*1024**2,threads=2)
        supervisor=_StockSupervisor(output,limits,root)
        result=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_native_context_fixture',mode,str(output)],fit_id='inference',cwd=m.ROOT)
        self.assertEqual(result['status'],'success',str(result)+'; '+str(output))
        self.assertTrue(result['cleanup_confirmed'])
        return m.read_json(output/'proof.json')
    def test_actual_supervised_metadata_audit_never_fits_loads_model_or_opens_test(self):
        self.assertTrue(self.run_native('audit')['metadata_only'])
    def test_actual_supervised_RF14_matches_manual_row_probabilities(self):
        proof=self.run_native('infer');self.assertTrue(proof['parity']);self.assertEqual(proof['model_sha256'],m.FROZEN_HASHES['development-01/final-RF14.joblib'])

class ContextExecutorTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(hasattr(m,'ContextExecutor'),'Context executor must exist')
        from uuid import uuid4
        self.root=m.ROOT/m.SERVING_REL/'executor-checks'/str(uuid4());self.root.mkdir(parents=True)
        self.manifest=m.Manifest(self.root/'manifest.json','a'*64,dict(model={'sha256':'b'*64},dataset={'sha256':'c'*64},development={'sha256':'d'*64},evaluation={'sha256':'e'*64},ranges={k:dict(min=-1000000,max=1000000) for k in m.FEATURES}))
        self.request=dict(protocol=m.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',features=features(),inputSha256=m.feature_digest(features()))
        self.response=dict(self.request,classOrder=list(m.CLASSES),label='Normal',probabilities=[.7,.2,.1],model='RandomForest',modelSha256='b'*64,servingManifestSha256='a'*64,datasetSha256='c'*64,developmentSha256='d'*64,evaluationSha256='e'*64,processingTimeMs=.1,totalProcessingTimeMs=1,outOfRange=[],**m.PROVENANCE)
    def test_RF14_default_uses_serving_only_supervisor(self):
        from inventory_context_runtime import ContextServingSupervisor
        self.assertIs(m.ContextExecutor(self.manifest)._supervisor,ContextServingSupervisor)
    def test_admission_uses_fresh_counter_and_reserves_ten_MiB(self):
        launched=[];response=self.response
        class Supervisor:
            cleanup_confirmed=True
            def __init__(self,output,*_):self.output=output
            def preflight(self,**_):return {}
            def run(self,*_,**__):
                launched.append(True);m.runtime.write_json_exclusive(self.output/'prediction.json',response)
                return {'status':'success'}
        for size in [90*1024**2,90*1024**2+1]:
            launched.clear();executor=m.ContextExecutor(self.manifest,self.root/('cap-'+str(size)),_supervisor=Supervisor)
            with patch.object(m,'load_manifest',return_value=self.manifest),patch.object(m,'measure_output_bytes',return_value=size,create=True):
                if size==90*1024**2:self.assertEqual(executor.run(self.request)['label'],'Normal')
                else:
                    with self.assertRaises(m.StockUnavailable):executor.run(self.request)
            self.assertEqual(len(launched),int(size==90*1024**2));self.assertFalse(executor.busy)
    def test_preparation_still_uses_original_supervisor(self):
        import inventory_inference
        observed=[]
        class Observed(Exception):pass
        class Supervisor:
            def __init__(self,_run,limits,_root):observed.append(limits)
            def run(self,*_,**__):raise Observed()
        with patch.object(inventory_inference,'_StockSupervisor',Supervisor),patch.object(m.runtime,'_output_bytes',return_value=0):
            with self.assertRaises(Observed):m.prepare_supervised(self.root/'unused-prepared.json')
        self.assertEqual(len(observed),1);self.assertEqual(observed[0].max_wall_seconds,120)
    def test_fixed_limits_and_no_direct_worker(self):
        limits=m.inference_limits();self.assertEqual((limits.max_fit_seconds,limits.threads,limits.max_rss_bytes,limits.min_available_bytes,limits.min_free_disk_bytes,limits.max_output_bytes),(15,2,2*1024**3,3*1024**3,1024**3,10*1024**2))
        import subprocess
        result=subprocess.run([sys.executable,str(Path(m.__file__)),'_worker','--manifest','missing','--manifest-sha256','a'*64,'--request','missing','--request-sha256','b'*64,'--output','missing'],capture_output=True,text=True,timeout=10)
        self.assertNotEqual(result.returncode,0);self.assertIn('supervis',result.stderr.lower())
    def test_draining_retains_admission_and_unknown_cleanup_quarantines(self):
        import threading
        for confirmed in (True,False):
            entered=threading.Event();release=threading.Event();launched=[];errors=[]
            response=self.response
            class Supervisor:
                cleanup_confirmed=True
                def __init__(self,output,limits,root):self.output=output
                def preflight(self,**kwargs):return {}
                def run(self,*args,**kwargs):
                    launched.append(True);entered.set();release.wait(5);self.cleanup_confirmed=confirmed
                    m.runtime.write_json_exclusive(self.output/'prediction.json',response)
                    return {'status':'success' if confirmed else 'failed'}
            executor=m.ContextExecutor(self.manifest,self.root/str(confirmed),_supervisor=Supervisor)
            def first():
                try:executor.run(self.request)
                except Exception as e:errors.append(e)
            with patch.object(m,'load_manifest',return_value=self.manifest):
                thread=threading.Thread(target=first);thread.start()
                try:
                    self.assertTrue(entered.wait(5),str(errors));self.assertTrue(executor.busy)
                    with self.assertRaises(m.StockBusy):executor.run(self.request)
                finally:release.set();thread.join(5)
                self.assertFalse(thread.is_alive());self.assertFalse(executor.busy);self.assertEqual(len(launched),1)
                self.assertEqual(executor.unavailable,not confirmed)
                if not confirmed:
                    self.assertTrue(errors)
                    with self.assertRaises(m.StockUnavailable):executor.run(self.request)
                    self.assertEqual(len(launched),1)
                else:self.assertFalse(errors)
    def test_resource_or_aggregate_refusal_never_launches_or_leaves_busy(self):
        launched=[]
        class Refused:
            cleanup_confirmed=True
            def __init__(self,*_):pass
            def preflight(self,**kwargs):raise m.runtime.RuntimeSafetyError('available_memory')
            def run(self,*args,**kwargs):launched.append(True)
        executor=m.ContextExecutor(self.manifest,self.root/'refusal',_supervisor=Refused)
        with patch.object(m,'load_manifest',return_value=self.manifest):
            with self.assertRaises(m.StockUnavailable):executor.run(self.request)
            self.assertFalse(executor.busy);self.assertFalse(executor.unavailable);self.assertFalse(launched)
            with patch.object(m,'measure_output_bytes',return_value=m.TOTAL_OUTPUT_BYTES-10*1024**2+1,create=True):
                with self.assertRaises(m.StockUnavailable):executor.run(self.request)
            self.assertFalse(executor.busy);self.assertFalse(launched)
    def test_native_success_and_timeout_clean_up_descendants(self):
        if os.name!='nt':self.skipTest('Native Windows Job required')
        import inventory_context_artifacts as artifacts
        for mode in ('success','timeout'):
            def command(output,request):
                code="import sys,os,json,pathlib,subprocess,time;sys.path.insert(0,'research');import runner_runtime as r;r.require_supervised_worker();child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);"
                code+=f"out=pathlib.Path({str(output)!r});(out/'pids.json').write_text(json.dumps([os.getpid(),child.pid]));"
                code+="time.sleep(60)" if mode=='timeout' else f"(out/'prediction.json').write_text({json.dumps(self.response)!r});time.sleep(.2)"
                return [sys.executable,'-c',code]
            executor=m.ContextExecutor(self.manifest,self.root/mode,_command=command)
            with patch.object(m,'load_manifest',return_value=self.manifest):
                if mode=='timeout':
                    with self.assertRaises(m.StockUnavailable):executor.run(self.request)
                else:self.assertEqual(executor.run(self.request)['label'],'Normal')
            paths=list((self.root/mode).glob('*/pids.json'));self.assertEqual(len(paths),1)
            for pid in json.loads(paths[0].read_text()):self.assertFalse(artifacts.owner_identity(pid)['running'])
            native=json.loads(paths[0].with_name('inference.result.json').read_text());self.assertTrue(native['cleanup_confirmed']);self.assertFalse(executor.busy)

def native_fixture(mode,output):
    """Explicit test-only manifest with existing sources; never a serving profile."""
    m.runtime.require_supervised_worker()
    import joblib
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.tree import DecisionTreeClassifier
    original=Path.open
    def guard(path,*args,**kwargs):
        name=path.as_posix()
        if '/main-01/test/' in name or name.endswith('/main-01/test.csv'):raise AssertionError('Raw held-out observation opened')
        return original(path,*args,**kwargs)
    existing=tuple(p for p in m.SOURCE_FILES if (m.ROOT/p).exists())
    with patch.object(m,'SOURCE_FILES',existing),patch.object(Path,'open',guard),patch.object(RandomForestClassifier,'fit',side_effect=AssertionError('No fitting')),patch.object(DecisionTreeClassifier,'fit',side_effect=AssertionError('No fitting')):
        if mode=='audit':
            with patch.object(joblib,'load',side_effect=AssertionError('Metadata cannot unpickle')):
                m._snapshot();m.audit_development()
            proof={'metadata_only':True}
        elif mode=='infer':
            # Metadata gate is covered separately. This fixture isolates real
            # worker/model parity before later-task source files exist.
            value=m._snapshot();path=output/'fixture-manifest.json';m.runtime.write_json_exclusive(path,value)
            manifest=m.load_manifest(path,m.digest(path.read_bytes()))
            request=dict(protocol=m.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',inputSha256=m.feature_digest(features()),features=features())
            result=m.infer(manifest,request,output/'prediction.json');m.runtime.write_json_exclusive(output/'prediction.json',result)
            import io
            import numpy as np
            from threadpoolctl import threadpool_limits
            blob=m.read_bytes(m.ROOT/m.DATA_REL/'development-01/final-RF14.joblib',m.MAX_MODEL)
            if m.digest(blob)!=m.FROZEN_HASHES['development-01/final-RF14.joblib']:raise AssertionError('Frozen model changed')
            model=joblib.load(io.BytesIO(blob))
            with threadpool_limits(limits=2):raw=model.predict_proba([[7,3,2,-1,0,.0005,0,0,0,0,1,0,0,0]])[0]
            expected=[float(raw[list(model.classes_).index(k)]) for k in m.CLASSES]
            # The two-thread RF reduction may accumulate tree probabilities in
            # a different order. Require numerical parity, not bitwise identity
            # between independent calls; transport checks still require exact
            # equality with the worker output that actually served the request.
            delta=float(np.max(np.abs(np.asarray(result['probabilities'])-expected)))
            np.testing.assert_allclose(result['probabilities'],expected,rtol=0,atol=1e-12)
            if result['label']!=str(model.classes_[int(np.argmax(raw))]):raise AssertionError('Manual row class differs')
            proof={'parity':True,'max_absolute_probability_difference':delta,'absolute_tolerance':1e-12,'model_sha256':result['modelSha256'],'processingTimeMs':result['processingTimeMs'],'totalProcessingTimeMs':result['totalProcessingTimeMs']}
        else:raise ValueError('Unknown fixture mode')
        m.runtime.write_json_exclusive(output/'proof.json',proof)

if __name__=='__main__':
    if len(sys.argv)==4 and sys.argv[1]=='_native_context_fixture':native_fixture(sys.argv[2],Path(sys.argv[3]))
    else:unittest.main()
