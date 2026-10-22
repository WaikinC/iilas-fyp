"""Artificial worker tests: no model bytes, datasets, or native Job launch."""
import hashlib
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
import uuid
import parcel_runtime as parcel
import parcel_warm_protocol as protocol
try:
    import parcel_warm_worker as worker
except ImportError:
    worker = None

class WorkerTests(unittest.TestCase):
    def test_manager_passes_explicit_warm_limits(self):
        bundle = types.SimpleNamespace(path=Path(__file__), sha256='3'*64)
        with patch.object(protocol, 'load_bundle', return_value=bundle), patch.object(parcel, 'manage') as manage:
            worker.manage(Path(__file__), bundle.path, bundle.sha256)
        self.assertEqual(manage.call_args.kwargs['limits'].max_wall_seconds, 120)
        self.assertEqual(manage.call_args.kwargs['limits'].max_fit_seconds, 120)
        self.assertEqual(parcel.parcel_limits().max_wall_seconds, 25)

    def test_first_frame_once_and_slot_replay_rejected_with_context_closed(self):
        self.assertIsNotNone(worker, 'warm worker is missing')
        self.exercise('duplicate')

    def test_second_distinct_frame_runs_after_ack_and_stop_closes_context(self):
        self.assertIsNotNone(worker, 'warm worker is missing')
        self.exercise('second')

    def test_second_frame_reuses_at_89_seconds(self):
        self.exercise('reuse-89')

    def test_idle_retires_without_rereading_root(self):
        self.exercise('idle')

    def test_first_committed_frame_finishes_after_startup_retirement(self):
        self.exercise('slow-load')

    def test_retiring_worker_refuses_new_frame(self):
        self.exercise('retiring')

    def test_prediction_failure_emits_unavailable_then_closes(self):
        self.exercise('failure')

    def test_frame_validation_crossing_reuse_deadline_never_predicts(self):
        self.exercise('validation-expiry')

    def test_final_decode_crossing_reuse_deadline_never_predicts(self):
        self.exercise('decode-expiry')

    def exercise(self, mode):
        directory = parcel.REQUEST_ROOT / str(uuid.uuid4())
        directory.mkdir(parents=True)
        artifacts = parcel.ParcelGPUArtifacts(directory/'descriptor.json','4'*64)
        bindings = dict(modelVersion='1'*64,selectionSha256='4'*64,evaluationSha256='2'*64)
        bundle = protocol.WarmBundle(directory/'bundle.json','3'*64,artifacts,bindings)
        root = dict(requestId=directory.name,mode='predict',imageBase64='YQ==',evidenceSha256=hashlib.sha256(b'a').hexdigest(),bindings=bindings,artifactKind='gpu-descriptor-v2',descriptor=str(artifacts.descriptor_path),descriptorSha256='4'*64)
        second = dict(root,requestId=str(uuid.uuid4()) if mode in ('second','reuse-89','validation-expiry','decode-expiry') else directory.name)
        model = types.SimpleNamespace(load_context=lambda *a: object())
        calls=[];closed=[];clock=[0.0];state=[0]
        def predict(context,data):
            calls.append(data)
            if mode=='failure': raise ValueError('artificial failure')
            return {'fixture':True}
        model.predict=predict
        if mode in ('slow-load','reuse-89'):
            def load(*args):
                clock[0]=111 if mode=='slow-load' else 88
                return object()
            model.load_context=load
        model.close_context=lambda context: closed.append(True)
        def sleep(_):
            clock[0]+=.01
            if mode=='idle':
                clock[0]+=1
                return
            temporary=directory/'tmp';out=temporary/'slot.out.json';inp=temporary/'slot.in.json'
            if out.exists() and state[0]==0:
                self.assertEqual(protocol.read_json(out,65536)['requestId'],root['requestId'])
                if mode=='retiring': clock[0]=90
                if mode=='reuse-89': clock[0]=89
                out.unlink()
                protocol.write_json(inp,protocol.frame_envelope(directory.name,bundle,second),protocol.FRAME_LIMIT)
                state[0]=1
            elif out.exists() and state[0]==1:
                inp.unlink();out.unlink()
                protocol.write_json(temporary/'stop.json',dict(schema_version=1,kind='parcel_warm_stop_v1',cacheId=directory.name,bundleSha256=bundle.sha256),65536)
                state[0]=2
            if clock[0]>112: raise AssertionError('worker failed to retire')
        original_parse=protocol.parse_frame
        def parse(*args):
            value=original_parse(*args)
            if mode=='validation-expiry' and state[0]==1 and value['requestId']!=root['requestId']: clock[0]=90
            return value
        original_image=parcel._image
        final_decode=[False]
        def image(value):
            if mode=='decode-expiry' and state[0]==1 and not final_decode[0]:
                # frame_envelope + parse_frame each decode first; only the final
                # direct decoding immediately before model.predict advances age.
                import inspect
                frame=inspect.currentframe().f_back
                while frame is not None and frame.f_code.co_filename not in (worker.__file__,protocol.__file__):
                    frame=frame.f_back
                if frame is not None and frame.f_code is worker.infer.__code__:
                    clock[0]=90
                    final_decode[0]=True
            return original_image(value)
        try:
            parcel.runtime.write_json_exclusive(directory/'input.json',root)
            parcel.runtime.write_json_exclusive(directory/'owner.json',{'fixture':True})
            with patch.object(parcel,'_image',side_effect=image), patch.object(protocol,'parse_frame',side_effect=parse), patch.object(protocol,'load_bundle',return_value=bundle), patch.object(parcel,'_bindings',return_value=bindings), patch.object(parcel.runtime,'require_supervised_worker'), patch('parcel_train.worker_environment'), patch.dict(sys.modules,parcel_warm_model=model), patch.object(worker.time,'monotonic',side_effect=lambda:clock[0]), patch.object(worker.time,'sleep',side_effect=sleep), patch.object(parcel,'_validate_result',side_effect=lambda result,request:result):
                if mode=='duplicate':
                    with self.assertRaises(Exception): worker.infer(directory,bundle.path,bundle.sha256)
                else: worker.infer(directory,bundle.path,bundle.sha256)
            self.assertEqual(calls,[b'a',b'a'] if mode in ('second','reuse-89') else [b'a'])
            if mode=='decode-expiry': self.assertTrue(final_decode[0])
            if mode=='failure':
                result=protocol.read_json(directory/'tmp'/'slot.out.json',65536)['result']
                self.assertEqual(result,dict(error='unavailable',requestId=directory.name))
            self.assertEqual(closed,[True])
            ready=protocol.read_json(directory/'tmp'/'ready.json',65536)
            self.assertIs(ready['operationally_approved'],False)
        finally: parcel._cleanup(directory)

if __name__=='__main__': unittest.main()



