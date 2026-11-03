"""Disposable stock-serving fixtures; never scientific evaluation observations."""
import copy
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch


class StockInferenceTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_inference'),'Frozen stock inference adapter is missing')
        import inventory_inference as api
        self.a=api

    def features(self):
        return dict(zip(self.a.FEATURES,[100,20,12,75,1,.25]))

    def test_feature_units_and_cross_language_binary_digest(self):
        a=self.a;f=self.features()
        self.assertEqual(a.validate_features(f),f)
        for value in (None,True,'1',float('nan'),float('inf'),-1):
            with self.assertRaises(ValueError):a.validate_features(dict(f,days_since_replenishment=value))
        with self.assertRaises(ValueError):a.validate_features(dict(f,extra=1))
        with self.assertRaises(ValueError):a.validate_features(dict(f,adjustment_count=13))
        for age in (.25,1e-7,-0.,0.,1.):
            values=dict(f,days_since_replenishment=age)
            source="import {inventoryAIFeaturePayload} from './lib/inventoryAI.js';process.stdout.write(inventoryAIFeaturePayload(JSON.parse(process.argv[1])));"
            result=subprocess.run(['node','--input-type=module','-e',source,json.dumps(values)],cwd=a.ROOT,capture_output=True,text=True,check=True)
            self.assertEqual(a.feature_payload(values),result.stdout)

    def test_closed_request_and_direct_worker_guard(self):
        a=self.a;request=dict(protocol=a.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',features=self.features(),inputSha256=a.feature_digest(self.features()))
        self.assertEqual(a.validate_request(request),request)
        for change in (dict(inputSha256='0'*64),dict(features=dict(self.features(),label='Normal')),dict(operationally_approved=True)):
            with self.assertRaises(ValueError):a.validate_request(dict(request,**change))
        with patch.dict(os.environ,{'IILAS_RUNNER_JOB':''}):
            with self.assertRaises(a.runtime.RuntimeSafetyError):a.main(['_worker','--manifest','missing','--manifest-sha256','0'*64,'--request','missing','--output','missing'])

    def test_resource_bounds_are_not_configurable_from_requests(self):
        a=self.a;l=a.inference_limits()
        self.assertEqual((l.max_wall_seconds,l.max_fit_seconds),(15,15))
        self.assertEqual((l.max_rss_bytes,l.min_available_bytes,l.min_free_disk_bytes),(2*1024**3,3*1024**3,1024**3))
        self.assertEqual((l.max_output_bytes,l.threads),(10*1024**2,2))
        self.assertEqual(a.TOTAL_OUTPUT_BYTES,100*1024**2)

    def test_worker_response_cannot_forge_lineage_scores_or_approval(self):
        a=self.a;features=self.features()
        manifest=a.Manifest(Path('fixture'),'d'*64,dict(model=dict(sha256='a'*64),dataset=dict(sha256='b'*64),
            development=dict(sha256='c'*64),evaluation=dict(sha256='e'*64),ranges={k:dict(min=-100,max=1000) for k in a.FEATURES}))
        request=dict(protocol=a.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',features=features,inputSha256=a.feature_digest(features))
        response=dict(protocol=a.PROTOCOL,requestId=request['requestId'],inputSha256=request['inputSha256'],features=features,
            classOrder=list(a.CLASSES),label='Normal',probabilities=[.7,.2,.1],model='RandomForest',modelSha256='a'*64,
            servingManifestSha256='d'*64,datasetSha256='b'*64,developmentSha256='c'*64,evaluationSha256='e'*64,
            processingTimeMs=.5,totalProcessingTimeMs=1,outOfRange=[],**a.PROVENANCE)
        self.assertEqual(a.validate_prediction(response,request,manifest),response)
        for change in (dict(operationally_approved=True),dict(modelSha256='0'*64),dict(probabilities=[.7,.2,.2]),
                       dict(label='Critical Stock Risk'),dict(extra=1),dict(totalProcessingTimeMs=float('nan'))):
            with self.assertRaises(a.StockUnavailable):a.validate_prediction(dict(response,**change),request,manifest)

    def test_manifest_hash_current_source_and_metadata_are_checked_without_loading_pickle(self):
        a=self.a
        base=a.ROOT/'research/datasets/stock-infer-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            directory=Path(temp);self.assertTrue(directory.resolve().is_relative_to(base.resolve()))
            path=directory/'manifest.json';meta=dict(schema=a.SCHEMA,protocol=a.PROTOCOL,marker='fixture-metadata')
            with patch.object(a,'artifact_metadata',return_value=meta):
                manifest=a.prepare_manifest(path)
                self.assertEqual(a.load_manifest(path,manifest.sha256).data,meta)
                with self.assertRaises((ValueError,a.StockUnavailable)):a.load_manifest(path,'0'*64)
                with self.assertRaises((ValueError,OSError,a.StockUnavailable)):a.prepare_manifest(path)
            with patch.object(a,'artifact_metadata',return_value=dict(meta,marker='changed-source')):
                with self.assertRaises((ValueError,a.StockUnavailable)):a.load_manifest(path,manifest.sha256)

    def test_metadata_preparation_does_not_read_reserved_observations_or_call_training(self):
        a=self.a
        import inventory_simulation_train as training
        base=a.ROOT/'research/datasets/stock-infer-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            directory=Path(temp);dev=directory/'dev';evaluation=directory/'eval';source=directory/'source'
            for p in (dev,evaluation,source):p.mkdir()
            (dev/'frozen.json').write_text('{}');(dev/'final-RandomForest.joblib').write_bytes(b'fixture-model-not-a-pickle')
            (source/'manifest.json').write_text('{}');(source/'test.csv').write_text('Reserved fixture must not be read')
            (evaluation/'predictions.json').write_text('{}')
            a.runtime.write_json_exclusive(evaluation/'predictions-frozen.json',dict(models=dict(RandomForest=a.sha(dev/'final-RandomForest.joblib')),sha256=a.sha(evaluation/'predictions.json')))
            ef=dict(protocol=training.PROTOCOL,phase='evaluation',dataset_sha256=training.DATASET_SHA,status='success',versions=a.versions(),code_pins={},source_pins={},elapsed_seconds=1,artifacts={},**training.FLAGS)
            a.runtime.write_json_exclusive(evaluation/'frozen.json',ef)
            a.runtime.write_json_exclusive(evaluation/'evaluation.result.json',dict(status='success',elapsed_seconds=1))
            a.runtime.write_json_exclusive(evaluation/'metrics.json',dict(protocol=training.PROTOCOL,dataset_sha256=training.DATASET_SHA,observations=60,models=dict(RandomForest=dict(accuracy=.75,per_class={'Critical Stock Risk':dict(recall=.45)})),**training.FLAGS))
            original=Path.read_text
            def guarded(path,*args,**kwargs):
                if path.name=='test.csv' or 'dossiers' in path.parts:raise AssertionError('Reserved observations opened')
                return original(path,*args,**kwargs)
            rows=[dict(zip(a.FEATURES,[0]*6)),dict(zip(a.FEATURES,[100]*6))]
            spec=dict(id='rf-d6-l2',family='RandomForest',depth=6,leaf=2)
            with patch.object(a,'DEVELOPMENT',dev),patch.object(a,'EVALUATION',evaluation),patch.object(a,'SOURCE',source), \
                 patch.object(training,'validate_development',return_value=(dev,dict(elapsed_seconds=1),dict(choices=dict(RandomForest=spec)))), \
                 patch.object(training,'source_metadata',return_value=(source,{},{})),patch.object(training,'inventory',return_value={}), \
                 patch.object(training,'verify_claim'),patch.object(training,'code_pins',return_value={}), \
                 patch.object(training.data,'source_pins',return_value={}),patch.object(a,'source_pins',return_value={}), \
                 patch.object(training,'load_partition',return_value=(rows,{})) as reader, \
                 patch.object(training,'main',side_effect=AssertionError('Training/evaluation CLI invoked')), \
                 patch.object(Path,'read_text',guarded):
                meta=a.artifact_metadata();reader.assert_called_once_with(source,'development')
                self.assertEqual(meta['model']['sha256'],a.sha(dev/'final-RandomForest.joblib'))
                self.assertFalse(meta['operationally_approved'])
                (evaluation/'evaluation.result.json').write_text('{"status":"failed","elapsed_seconds":1}')
                with self.assertRaises(a.StockUnavailable):a.artifact_metadata()

    def test_worker_predicts_disposable_registered_model_and_refuses_changed_weights(self):
        a=self.a
        import joblib
        from sklearn.ensemble import RandomForestClassifier
        base=a.ROOT/'research/datasets/stock-infer-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            directory=Path(temp);model_path=directory/'fixture.joblib'
            model=RandomForestClassifier(n_estimators=100,max_depth=6,min_samples_leaf=2,n_jobs=2,class_weight='balanced',random_state=42)
            x=[[10+i,2,3,i,0,1] for i in range(30)];y=[a.CLASSES[i//10] for i in range(30)];model.fit(x,y)
            joblib.dump(model,model_path)
            meta=dict(model=dict(path=model_path.relative_to(a.ROOT).as_posix(),sha256=a.sha(model_path),spec=dict(id='rf-d6-l2',family='RandomForest',depth=6,leaf=2)),dataset=dict(sha256='a'*64),development=dict(sha256='b'*64),evaluation=dict(sha256='c'*64),ranges={k:dict(min=-100,max=1000) for k in a.FEATURES})
            manifest=a.Manifest(directory/'fixture-manifest.json','d'*64,meta)
            request=dict(protocol=a.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',features=self.features(),inputSha256=a.feature_digest(self.features()))
            with patch.object(a.runtime,'require_supervised_worker'),patch.object(a,'load_manifest',return_value=manifest):
                result=a.infer(manifest,request,directory)
                self.assertEqual(result['classOrder'],list(a.CLASSES));self.assertEqual(result['model'],'RandomForest')
                self.assertAlmostEqual(sum(result['probabilities']),1)
                self.assertFalse(result['operationally_approved']);self.assertIsNone(result['acceptanceSha256'])
                model_path.write_bytes(b'changed')
                with patch.object(joblib,'load',side_effect=AssertionError('Changed pickle must not load')):
                    with self.assertRaises(a.StockUnavailable):a.infer(manifest,request,directory)

    def executor_fixture(self,directory):
        a=self.a;features=self.features()
        manifest=a.Manifest(directory/'fixture-manifest.json','d'*64,dict(model=dict(sha256='a'*64),dataset=dict(sha256='b'*64),
            development=dict(sha256='c'*64),evaluation=dict(sha256='e'*64),ranges={k:dict(min=-100,max=1000) for k in a.FEATURES}))
        request=dict(protocol=a.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',features=features,inputSha256=a.feature_digest(features))
        response=dict(protocol=a.PROTOCOL,requestId=request['requestId'],inputSha256=request['inputSha256'],features=features,
            classOrder=list(a.CLASSES),label='Normal',probabilities=[.7,.2,.1],model='RandomForest',modelSha256='a'*64,
            servingManifestSha256='d'*64,datasetSha256='b'*64,developmentSha256='c'*64,evaluationSha256='e'*64,
            processingTimeMs=.5,totalProcessingTimeMs=1,outOfRange=[],**a.PROVENANCE)
        return manifest,request,response

    def test_busy_and_resource_refusal_never_start_a_worker_or_leave_busy(self):
        a=self.a;base=a.ROOT/'research/datasets/stock-infer-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            directory=Path(temp);manifest,request,_=self.executor_fixture(directory)
            class Refused:
                reason='available_memory'
                def __init__(self,*args):pass
                def preflight(self,*args,**kwargs):raise a.runtime.RuntimeSafetyError(self.reason)
                def run(self,*args,**kwargs):raise AssertionError('Refused admission started a worker')
            executor=a.StockExecutor(manifest,directory/'requests',_supervisor=Refused)
            with executor._lock:
                with self.assertRaises(a.StockBusy):executor.run(request)
            with patch.object(a,'load_manifest',return_value=manifest):
                for reason in ('available_memory','free_disk_limit','rss_limit','output_limit'):
                    Refused.reason=reason
                    with self.assertRaises(a.StockUnavailable):executor.run(request)
                    self.assertFalse(executor.busy)
            self.assertFalse(executor.busy)
            self.assertFalse(list((directory/'requests').rglob('request.json')))
            with patch.object(a,'load_manifest',return_value=manifest),patch.object(a.runtime,'_output_bytes',return_value=a.TOTAL_OUTPUT_BYTES):
                with self.assertRaises(a.StockUnavailable):executor.run(request)
            self.assertFalse(executor.busy)

    @unittest.skipUnless(os.name=='nt','Native Windows Job closure')
    def test_native_success_and_timeout_reap_owned_grandchild_before_releasing_busy(self):
        a=self.a
        import sys
        def alive(pid):
            kernel=ctypes.WinDLL('kernel32',use_last_error=True)
            kernel.OpenProcess.restype=ctypes.c_void_p
            kernel.GetExitCodeProcess.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong)]
            kernel.CloseHandle.argtypes=[ctypes.c_void_p]
            handle=kernel.OpenProcess(0x1000,False,pid)
            if not handle:return False
            try:
                code=ctypes.c_ulong()
                return bool(kernel.GetExitCodeProcess(handle,ctypes.byref(code))) and code.value==259
            finally:kernel.CloseHandle(handle)
        base=a.ROOT/'research/datasets/stock-infer-tests';base.mkdir(parents=True,exist_ok=True)
        for scenario in ('success','timeout'):
            with self.subTest(scenario=scenario),tempfile.TemporaryDirectory(dir=base) as temp:
                directory=Path(temp);manifest,request,response=self.executor_fixture(directory)
                def command(output,payload):
                    code=("import sys,os,json,pathlib,subprocess,time;sys.path.insert(0,'research');"
                          "import runner_runtime;runner_runtime.require_supervised_worker();"
                          "child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);"
                          f"out=pathlib.Path({str(output)!r});"
                          "(out/'pids.json').write_text(json.dumps([os.getpid(),child.pid]));")
                    code+=("time.sleep(60)" if scenario=='timeout' else f"(out/'prediction.json').write_text({json.dumps(response)!r});time.sleep(.2)")
                    return [sys.executable,'-c',code]
                executor=a.StockExecutor(manifest,directory/'requests',_command=command)
                with patch.object(a,'load_manifest',return_value=manifest):
                    if scenario=='timeout':
                        with self.assertRaises(a.StockUnavailable):executor.run(request)
                    else:self.assertEqual(executor.run(request)['label'],'Normal')
                self.assertFalse(executor.busy)
                markers=list((directory/'requests').rglob('pids.json'));self.assertEqual(len(markers),1)
                self.assertFalse(any(alive(pid) for pid in json.loads(markers[0].read_text())))
                receipt=json.loads((markers[0].parent/'inference.result.json').read_text())
                self.assertEqual(receipt['status'],'success' if scenario=='success' else 'failed')

    def test_delayed_cleanup_holds_admission_until_confirmation(self):
        self.cleanup_fixture(fail=False)

    def test_unconfirmed_cleanup_quarantines_executor_without_second_worker(self):
        self.cleanup_fixture(fail=True)

    def cleanup_fixture(self,fail):
        a=self.a;base=a.ROOT/'research/datasets/stock-infer-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            directory=Path(temp);manifest,request,response=self.executor_fixture(directory)
            entered=threading.Event();release=threading.Event();finished=threading.Event();launched=[];errors=[]
            class Job:
                name='fixture-owned-job'
                def assign(self,worker):pass
                def resume(self,worker):pass
                def pids(self):return []
                def terminate(self):pass
                def close(self):pass
            class Worker:
                pid=123;returncode=0
                def __init__(self,*args,**kwargs):
                    launched.append(self);(Path(kwargs['stdout'].name).parent/'prediction.json').write_text(json.dumps(response))
                def poll(self):return 0
                def wait(self,**kwargs):return 0
                def kill(self):pass
            def confirm(job,worker,assigned):
                entered.set();release.wait(10)
                if fail:raise OSError('fixture termination/wait confirmation failed')
                return True
            executor=a.StockExecutor(manifest,directory/'requests',_command=lambda *_:['fixture-worker'])
            original_popen=a.runtime.subprocess.Popen
            def launch(command,*args,**kwargs):
                # Git/path checks are real subprocesses, not model workers.
                return Worker(command,*args,**kwargs) if command==['fixture-worker'] else original_popen(command,*args,**kwargs)
            def first():
                try:executor.run(request)
                except Exception as error:errors.append(error)
                finally:finished.set()
            with patch.object(a,'load_manifest',return_value=manifest),patch.object(a.runtime,'_ProcessJob',Job), \
                 patch.object(a.runtime.subprocess,'Popen',launch),patch.object(a.runtime.ResourceSupervisor,'preflight',return_value=dict(rss_bytes=1)), \
                 patch.object(a,'_confirm_stock_tree',side_effect=confirm,create=True):
                thread=threading.Thread(target=first);thread.start()
                try:
                    self.assertTrue(entered.wait(5),'Native cleanup must reach confirmed draining before admission reopens: '+repr(errors))
                    self.assertFalse(finished.is_set());self.assertTrue(executor.busy)
                    with self.assertRaises(a.StockBusy):executor.run(request)
                finally:release.set();thread.join(3)
                self.assertFalse(thread.is_alive());self.assertEqual(len(launched),1)
                if fail:
                    self.assertTrue(errors);self.assertTrue(executor.unavailable)
                    with self.assertRaises(a.StockUnavailable):executor.run(request)
                    self.assertEqual(len(launched),1)
                else:self.assertEqual(errors,[]);self.assertFalse(executor.busy)


if __name__=='__main__':unittest.main()
