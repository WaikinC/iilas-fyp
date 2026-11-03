import copy
import json
from pathlib import Path
import sys
from unittest.mock import patch
from uuid import uuid4
import unittest
import delivery_demo_inference as m
import delivery_demo_contract as c

class Inference(unittest.TestCase):
    def setUp(self):
        self.root=m.ROOT/m.SERVING_REL/'checks'/uuid4().hex[:8];self.root.mkdir(parents=True)
        self.pins=patch.object(m,'SOURCE_FILES',('research/delivery_demo_contract.py',));self.pins.start();self.manifest=m.prepare_manifest(self.root/'manifest.json')
        f=dict(zip(c.FEATURES,[10,1,0,0,1,2,1,0,1,0]));self.request=dict(protocol=m.PROTOCOL,requestId=str(uuid4()),features=f,inputSha256=c.feature_digest(f))
    def tearDown(self):self.pins.stop()
    def test_metadata_never_unpickles_or_reads_raw_test(self):
        import joblib
        actual=m.read_bytes
        def read(path,*args):
            self.assertNotEqual(Path(path).name,'test.json');return actual(path,*args)
        with patch.object(joblib,'load',side_effect=AssertionError('No unpickle')),patch.object(m,'read_bytes',side_effect=read):self.assertEqual(m.load_manifest(self.manifest.path,self.manifest.sha256).sha256,self.manifest.sha256)
    def test_manifest_source_model_schema_and_request_tamper_refuse(self):
        for key,value in [('model',{'sha256':'0'*64}),('features',[]),('provenance',{})]:
            data=copy.deepcopy(self.manifest.data);data[key]=value;p=self.root/(key+'.json');m.runtime.write_json_exclusive(p,data)
            with self.assertRaises((ValueError,m.DeliveryUnavailable)):m.load_manifest(p,m.digest(p.read_bytes()))
        with patch.object(m,'source_pins',return_value={'wrong':'a'*64}),self.assertRaises((ValueError,m.DeliveryUnavailable)):m.load_manifest(self.manifest.path,self.manifest.sha256)
        for change in [dict(inputSha256='a'*64),dict(protocol='old'),dict(extra=1)]:
            with self.assertRaises(ValueError):m.validate_request(self.request|change)
    def test_direct_inference_refused_before_deserialization_and_model_hash_gate(self):
        with self.assertRaises(Exception):m.infer(self.request,self.manifest)
        import joblib
        with patch.object(m.runtime,'require_supervised_worker'),patch.object(m,'read_bytes',return_value=b'bad'),patch.object(joblib,'load',side_effect=AssertionError('Must not unpickle')):
            with self.assertRaises((ValueError,m.DeliveryUnavailable)):m.infer(self.request,self.manifest)
    def test_real_supervised_fixture_uses_frozen_RF_and_confirms_cleanup(self):
        def command(output,request):return [sys.executable,str(Path(__file__).resolve()),'_fixture',str(self.manifest.path),self.manifest.sha256,str(output)]
        executor=m.DeliveryExecutor(self.manifest,self.root/'requests',_command=command);response=executor.run(self.request)
        self.assertIn(response['label'],m.CLASSES);self.assertEqual(response['modelSha256'],self.manifest.data['model']['sha256']);self.assertFalse(executor.busy);self.assertFalse(executor.unavailable)
        native=m.read_json(next((self.root/'requests').glob('*/inference.result.json')));self.assertEqual(native['status'],'success');self.assertTrue(native['cleanup_confirmed'])
    def test_caps_reserve_refusal_and_quarantine(self):
        limits=m.inference_limits();self.assertEqual((limits.max_wall_seconds,limits.max_fit_seconds,limits.max_rss_bytes,limits.min_available_bytes,limits.max_output_bytes,limits.threads),(15,15,2*1024**3,3*1024**3,10*1024**2,2))
        with patch.object(m,'measure_output_bytes',return_value=90*1024**2+1),self.assertRaises(m.DeliveryUnavailable):m.DeliveryExecutor(self.manifest,self.root/'cap').run(self.request)
        class Failed:
            cleanup_confirmed=False
            def __init__(self,*_):pass
            def preflight(self,**_):return {}
            def run(self,*_,**__):return {'status':'failed'}
        executor=m.DeliveryExecutor(self.manifest,self.root/'quarantine',_supervisor=Failed)
        with self.assertRaises(m.DeliveryUnavailable):executor.run(self.request)
        self.assertTrue(executor.unavailable);self.assertFalse(executor.busy)
        with self.assertRaises(m.DeliveryUnavailable):executor.run(self.request)

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='_fixture':
        m.runtime.require_supervised_worker();m.SOURCE_FILES=('research/delivery_demo_contract.py',);manifest=m.load_manifest(Path(sys.argv[2]),sys.argv[3]);output=Path(sys.argv[4]);request=m.read_json(output/'request.json');response=m.infer(request,manifest);m.runtime.write_json_exclusive(output/'prediction.json',response)
    else:unittest.main()
