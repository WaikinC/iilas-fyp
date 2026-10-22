"""Artificial warm-context checks. No image/model bytes, ML imports or native Jobs."""
import importlib
import importlib.util
import builtins
import os
from pathlib import Path
import sys
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch


class Tensor:
    shape=(224,224,3)
    def __getitem__(self,key):return self


class Scores:
    shape=(1,2)
    def __init__(self,values):self.values=values
    def __getitem__(self,index):
        class Row:
            def __init__(self,values):self.values=values
            def tolist(self):return list(self.values)
        return Row(self.values)


class Model:
    input_shape=(None,224,224,3);output_shape=(None,2)
    def __init__(self):self.version=0;self.values=[.8,.2];self.device='CPU:0';self.calls=[];self.during=None
    def __call__(self,tensor,*,training):
        self.calls.append(training)
        if self.during:self.during()
        model=self
        class Output:
            device=model.device
            def numpy(self):return Scores(model.values)
        return Output()


class WarmTests(unittest.TestCase):
    def setUp(self):
        self.warm=importlib.import_module('parcel_warm_model')
        self.environment_guard=self.warm._environment_guard
        # Every test represents a fresh worker with a fake loader, never TF.
        self.warm._load_started=False
        self.model=Model();self.events=[];self.path=Path(__file__).resolve().parent/'datasets/fake-descriptor.json'
        self.pin='41be154569ace87d85bae5dc12b77eb7d08ffcb52616bb2e075f00c1300e21eb'
        self.artifact=Path(__file__).resolve().parent/'datasets/fake-model.keras'
        self.patchers=[
            patch.object(self.warm.runtime,'require_supervised_worker',side_effect=lambda:self.events.append('supervised')),
            patch.object(self.warm,'_source_guard',side_effect=lambda:self.events.append('source')),
            patch.object(self.warm,'_environment_guard',side_effect=lambda:self.events.append('environment')),
            patch.object(self.warm.adapter,'safe_path',side_effect=lambda path:self.warm.adapter.ROOT/Path(path)),
            patch.object(self.warm.adapter,'validate_descriptor',side_effect=lambda *args:self.descriptor()),
            patch.object(self.warm.adapter,'_check_artifact',side_effect=lambda:self.check_artifact()),
            patch.object(self.warm.adapter,'_load_model',side_effect=lambda path:self.load_model(path)),
            patch.object(self.warm.adapter,'_snapshot',side_effect=lambda model:self.snapshot(model)),
            patch.object(self.warm.adapter,'_decode_prepare',return_value=Tensor())]
        for patcher in self.patchers:patcher.start();self.addCleanup(patcher.stop)
        self.contexts=[]
        self.addCleanup(self.close_all)

    def close_all(self):
        for context in self.contexts:
            try:self.warm.close_context(context)
            except ValueError:pass

    def descriptor(self):
        self.events.append('descriptor')
        self.warm.adapter._check_artifact()  # Real validate_descriptor performs hash one.
        return dict(model='MobileNetV2',modelVersion=self.warm.adapter.MODEL_SHA,artifact=str(self.artifact),contrast='clahe',
            preprocessing='rgb-letterbox224-v1',class_order=['Normal','Damaged'],selection_sha256=self.pin,
            report_sha256=self.warm.adapter.REPORT_SHA,operationally_approved=False)

    def check_artifact(self):self.events.append('artifact');return self.artifact
    def load_model(self,path):self.events.append('load');self.assertEqual(path,self.artifact);return self.model
    def snapshot(self,model):
        self.events.append('snapshot')
        return dict(model_variables=[dict(version=model.version)]*263,optimizer_variables=[dict(version=0)]*6,optimizer_iterations=945)
    def load(self):
        context=self.warm.load_context(self.path,self.pin);self.contexts.append(context);return context

    def test_one_load_and_two_frames_preserve_exact_closed_contract_and_four_artifact_checks(self):
        context=self.load();self.events.clear()
        for index in range(2):
            result=self.warm.predict(context,b'fixed development fixture')
            self.assertEqual(set(result),{'status','label','confidence','probabilities','confidenceMeaning','model','modelVersion',
                'preprocessing','contrast','evidenceSha256','selectionSha256','evaluationSha256','classOrder','acceptanceSha256',
                'processingTimeMs','humanReviewRequired','operationally_approved'})
            self.assertEqual(result['label'],'Normal');self.assertEqual(result['probabilities'],[.8,.2])
            self.assertTrue(result['humanReviewRequired']);self.assertIs(result['operationally_approved'],False)
            self.assertIsNone(result['acceptanceSha256']);self.assertEqual(result['confidenceMeaning'],'uncalibrated')
            self.assertEqual(result['selectionSha256'],self.pin);self.assertEqual(result['classOrder'],['Normal','Damaged'])
            self.assertEqual(self.events.count('artifact'),4*(index+1))
        self.assertEqual(self.model.calls,[False,False]);self.assertNotIn('load',self.events)

    def test_tie_abstains_and_damaged_uses_same_class_order(self):
        context=self.load();self.model.values=[.5,.5]
        result=self.warm.predict(context,b'x');self.assertIsNone(result['label']);self.assertEqual(result['status'],'abstained')
        self.model.values=[.1,.9];self.assertEqual(self.warm.predict(context,b'x')['label'],'Damaged')

    def test_before_frame_baseline_drift_fails_before_forward_and_invalidates_context(self):
        context=self.load();self.model.version=1
        with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        self.assertEqual(self.model.calls,[])
        self.model.version=0
        with self.assertRaises(ValueError):self.warm.predict(context,b'x')

    def test_after_forward_mutation_fails_and_invalidates_context(self):
        context=self.load();self.model.during=lambda:setattr(self.model,'version',1)
        with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        self.assertEqual(self.model.calls,[False])
        with self.assertRaises(ValueError):self.warm.predict(context,b'x')

    def test_descriptor_and_artifact_drift_each_prevent_forward(self):
        for target in ('validate_descriptor','_check_artifact'):
            with self.subTest(target=target):
                self.warm._load_started=False  # A fresh artificial worker for each failure case.
                context=self.load()
                with patch.object(self.warm.adapter,target,side_effect=ValueError('changed')):
                    with self.assertRaises(ValueError):self.warm.predict(context,b'x')
                self.assertEqual(self.model.calls,[])

    def test_foreign_unloaded_closed_and_unexpected_handle_mutation_are_rejected(self):
        for context in (None,object(),self.warm.ModelContext()):
            with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        context=self.load()
        with self.assertRaises(AttributeError):context.model=self.model
        with self.assertRaises(AttributeError):context.descriptor_path=self.path
        self.warm.close_context(context)
        with self.assertRaises(ValueError):self.warm.predict(context,b'x')

    def test_reentrant_frame_is_rejected_without_poisoning_active_call(self):
        context=self.load();attempts=[]
        def reenter():
            with self.assertRaises(ValueError):self.warm.predict(context,b'x')
            with self.assertRaises(ValueError):self.warm.close_context(context)
            attempts.append('blocked')
        self.model.during=reenter
        self.assertEqual(self.warm.predict(context,b'x')['label'],'Normal');self.assertEqual(attempts,['blocked'])

    def test_concurrent_frame_is_rejected_while_first_call_owns_context(self):
        context=self.load();entered=threading.Event();release=threading.Event();out=[]
        self.model.during=lambda:(entered.set(),release.wait(3))
        thread=threading.Thread(target=lambda:out.append(self.warm.predict(context,b'x')));thread.start()
        try:
            self.assertTrue(entered.wait(3))
            with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        finally:release.set();thread.join(3)
        self.assertFalse(thread.is_alive());self.assertEqual(out[0]['label'],'Normal')

    def test_supervision_and_environment_precede_original_model_loader(self):
        self.load();self.assertEqual(self.events[:3],['supervised','source','environment'])
        self.assertEqual(self.events.count('load'),1)
        self.assertLess(self.events.index('environment'),self.events.index('load'))
        with patch.object(self.warm.runtime,'require_supervised_worker',side_effect=ValueError('unsupervised')):
            with self.assertRaises(ValueError):self.warm.load_context(self.path,self.pin)
        self.assertEqual(self.events.count('load'),1)

    def test_invalid_shape_device_probability_and_bytes_fail_closed(self):
        cases=[('input_shape',(None,1)),('output_shape',(None,3)),('device','GPU:0'),('values',[float('nan'),.5]),
            ('values',[.7,.7]),('values',[-.1,1.1])]
        for name,value in cases:
            with self.subTest(name=name,value=value):
                self.warm._load_started=False  # Fake worker reset; no real TF process is reused.
                self.model=Model();context=self.load();setattr(self.model,name,value)
                with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        self.model=Model()
        for data in (b'',bytearray(b'x'),'x',b'x'*(10*1024**2+1)):
            with self.subTest(data_type=type(data)):
                self.warm._load_started=False
                context=self.load()
                with self.assertRaises(ValueError):self.warm.predict(context,data)

    def test_snapshot_baseline_is_not_retained_as_mutable_loader_owned_reference(self):
        shared=self.snapshot(self.model)
        with patch.object(self.warm.adapter,'_snapshot',return_value=shared):context=self.load()
        shared['model_variables'][0]['version']=8
        with patch.object(self.warm.adapter,'_snapshot',return_value=shared):
            with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        self.assertEqual(self.model.calls,[])

    def test_only_one_original_loader_entry_per_worker_even_after_close(self):
        context=self.load()
        with self.assertRaises(ValueError):self.warm.load_context(self.path,self.pin)
        self.warm.close_context(context)
        with self.assertRaises(ValueError):self.warm.load_context(self.path,self.pin)
        self.assertEqual(self.events.count('load'),1)

    def test_failed_original_load_requires_fresh_worker_before_another_attempt(self):
        with patch.object(self.warm.adapter,'_load_model',side_effect=ValueError('failed loader')) as loader:
            with self.assertRaises(ValueError):self.warm.load_context(self.path,self.pin)
            with self.assertRaises(ValueError):self.warm.load_context(self.path,self.pin)
        self.assertEqual(loader.call_count,1)

    def test_late_artifact_hash_drift_is_detected_after_forward(self):
        context=self.load();checks=[]
        def changed():
            checks.append('checked')
            if len(checks)==4:raise ValueError('changed after forward')
            return self.artifact
        with patch.object(self.warm.adapter,'_check_artifact',side_effect=changed):
            with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        self.assertEqual(len(checks),4);self.assertEqual(self.model.calls,[False])

    def test_per_frame_time_bound_and_invalid_snapshot_count_fail_closed(self):
        context=self.load()
        with patch.object(self.warm.time,'perf_counter',side_effect=[0.,26.]):
            with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        self.warm._load_started=False;self.model=Model();context=self.load();bad=self.snapshot(self.model)
        bad['optimizer_variables'].pop()
        with patch.object(self.warm.adapter,'_snapshot',return_value=bad):
            with self.assertRaises(ValueError):self.warm.predict(context,b'x')
        self.assertEqual(self.model.calls,[])

    def test_source_pin_and_descriptor_pin_fail_before_loader(self):
        with self.assertRaises(ValueError):self.warm.load_context(self.path,'0'*64)
        with patch.object(self.warm,'_source_guard',side_effect=ValueError('source drift')):
            with self.assertRaises(ValueError):self.warm.load_context(self.path,self.pin)
        self.assertNotIn('load',self.events)

    def test_environment_precondition_requires_cpu_offline_temp_and_fresh_tensorflow(self):
        temporary=tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent/'datasets');self.addCleanup(temporary.cleanup)
        scratch=Path(temporary.name)/'tmp';scratch.mkdir()
        environment={'CUDA_VISIBLE_DEVICES':'-1','TF_ENABLE_ONEDNN_OPTS':'0','TF_DETERMINISTIC_OPS':'1',
            'TEMP':str(scratch),'TMP':str(scratch)}
        environment.update({name:'1' for name in ('TF_NUM_INTRAOP_THREADS','TF_NUM_INTEROP_THREADS',
            'OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS')})
        def denied(*args):raise AssertionError('No network in fixtures')
        denied.__module__='parcel_train';denied.__qualname__='offline.<locals>.denied'
        with patch.dict(os.environ,environment),patch.object(tempfile,'tempdir',str(scratch)),patch.object(socket,'create_connection',denied),\
            patch.object(socket.socket,'connect',denied),patch.object(socket.socket,'connect_ex',denied):
            self.environment_guard()
            with patch.dict(os.environ,{'OMP_NUM_THREADS':'2'}):
                with self.assertRaises(ValueError):self.environment_guard()
            with patch.dict(sys.modules,{'tensorflow':object()}):
                with self.assertRaises(ValueError):self.environment_guard()
        with patch.dict(os.environ,environment),patch.object(tempfile,'tempdir',str(scratch)),patch.object(socket,'create_connection',lambda *args:None):
            with self.assertRaises(ValueError):self.environment_guard()

    def test_environment_rejects_tracked_temp_and_mismatched_cached_temp(self):
        import parcel_train
        # An actual existing ignored output mirrors worker_environment setup.
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent/'datasets') as temporary:
            output=Path(temporary);tracked=Path(__file__).resolve().parent
            with patch.dict(os.environ),patch.object(tempfile,'tempdir',None),\
                patch.object(socket,'create_connection'),patch.object(socket.socket,'connect'),patch.object(socket.socket,'connect_ex'):
                parcel_train.worker_environment(output)
                self.environment_guard()
                with patch.object(tempfile,'tempdir',str(tracked)):
                    with self.assertRaises(ValueError):self.environment_guard()
                with patch.dict(os.environ,{'TEMP':str(tracked),'TMP':str(tracked)}),\
                    patch.object(tempfile,'tempdir',str(tracked)):
                    with self.assertRaises(ValueError):self.environment_guard()

    def test_environment_output_policy_must_admit_tmp_parent_and_tmp_name(self):
        import parcel_train
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent/'datasets') as temporary:
            output=Path(temporary)
            with patch.dict(os.environ),patch.object(tempfile,'tempdir',None),\
                patch.object(socket,'create_connection'),patch.object(socket.socket,'connect'),patch.object(socket.socket,'connect_ex'):
                parcel_train.worker_environment(output)
                with patch.object(self.warm.runtime,'_validate_output_path',side_effect=ValueError('tracked/nonignored output')) as validate:
                    with self.assertRaises(ValueError):self.environment_guard()
                validate.assert_called_once_with(output)
                other=output/'other';other.mkdir()
                with patch.dict(os.environ,{'TEMP':str(other),'TMP':str(other)}),patch.object(tempfile,'tempdir',str(other)):
                    with self.assertRaises(ValueError):self.environment_guard()

    def test_module_import_never_imports_a_heavy_ml_library(self):
        original=builtins.__import__;seen=[]
        def guarded(name,*args,**kwargs):
            seen.append(name)
            if name.split('.')[0] in {'tensorflow','keras','numpy','cv2','h5py'}:raise AssertionError('Heavy import')
            return original(name,*args,**kwargs)
        spec=importlib.util.spec_from_file_location('warm_import_fixture',Path(self.warm.__file__))
        module=importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules,{'warm_import_fixture':module}),patch.object(builtins,'__import__',side_effect=guarded):
            spec.loader.exec_module(module)
        self.assertFalse({'tensorflow','keras','numpy','cv2','h5py'}&set(seen))


if __name__=='__main__':unittest.main()
