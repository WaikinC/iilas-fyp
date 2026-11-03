"""Context HTTP boundaries reuse established transport cases with v2 fixtures."""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import test_serve_inventory_local_eval as legacy_tests
import test_inventory_context_inference as context_tests

class ContextHTTPTests(legacy_tests.StockHTTPTests):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('serve_inventory_context_local_eval'),'Context HTTP factory must exist')
        import serve_inventory_context_local_eval as service
        self.s=service
    def fixture(self):
        a=self.s.local;f=context_tests.features()
        manifest=a.Manifest(Path('fixture'),'d'*64,dict(model=dict(sha256='a'*64),dataset=dict(sha256='b'*64),development=dict(sha256='c'*64),evaluation=dict(sha256='e'*64),ranges={k:dict(min=-100,max=1000) for k in a.FEATURES}))
        request=dict(protocol=a.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',features=f,inputSha256=a.feature_digest(f))
        response=dict(request,classOrder=list(a.CLASSES),label='Normal',probabilities=[.7,.2,.1],model='RandomForest',modelSha256='a'*64,servingManifestSha256='d'*64,datasetSha256='b'*64,developmentSha256='c'*64,evaluationSha256='e'*64,processingTimeMs=.5,totalProcessingTimeMs=1,outOfRange=[],**a.PROVENANCE)
        return manifest,request,response
    async def test_duplicate_JSON_nonfinite_and_old_protocol_rejected(self):
        manifest,request,response=self.fixture();a=self.s.local
        class Executor:
            busy=False
            def run(self,_):return response
        headers=[(b'authorization',b'Bearer fixture-only-value')]
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True),patch.object(a,'load_manifest',return_value=manifest):
            app=self.s.create_app(manifest.path,manifest.sha256,_executor_factory=lambda _:Executor())
            encoded=json.dumps(request)
            for body in [('{"protocol":"old",'+encoded[1:]).encode(),encoded.replace('0.0005','NaN').encode(),json.dumps({**request,'protocol':'inventory-synthetic-inference-1.0'}).encode()]:
                status,_,_=await self.request(app,'/predict/stock-experiment','POST',body,headers)
                self.assertEqual(status,422)
            for h in [[(b'host',b'localhost:8001')],[(b'x-forwarded-for',b'127.0.0.1')],[(b'forwarded',b'for=127.0.0.1')]]:
                status,reads,_=await self.request(app,'/predict/stock-experiment','POST',encoded.encode(),headers+h)
                self.assertEqual(status,403);self.assertFalse(reads)
    async def test_partial_or_conflicting_configuration_stays_unavailable(self):
        a=self.s.local
        for env in [{'IILAS_STOCK_SERVING_MANIFEST':'fixture'},{'IILAS_STOCK_SERVING_MANIFEST_SHA256':'d'*64}]:
            with patch.dict(os.environ,env,clear=True):
                with self.assertRaises(a.StockUnavailable):self.s.configuration(None,None)
        with patch.dict(os.environ,{'IILAS_STOCK_SERVING_MANIFEST':'other','IILAS_STOCK_SERVING_MANIFEST_SHA256':'d'*64},clear=True):
            with self.assertRaises(a.StockUnavailable):self.s.configuration('fixture','d'*64)
    async def test_server_port_scheme_and_duplicate_lengths_are_rejected_before_body(self):
        reached=[]
        async def inner(*_):reached.append(True)
        async def receive():raise AssertionError('Denied request body read')
        for changed in [{'server':('127.0.0.1',8000)},{'scheme':'https'},{'client':('::1',123)}]:
            messages=[]
            async def send(message):messages.append(message)
            scope={'type':'http','scheme':'http','server':('127.0.0.1',8001),'client':('127.0.0.1',123),'path':'/health','headers':[(b'host',b'127.0.0.1:8001')],**changed}
            await self.s.StockIntake(inner,'fixture-only-value')(scope,receive,send)
            self.assertEqual(messages[0]['status'],403);self.assertFalse(reached)
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True):app=self.s.create_app()
        status,reads,_=await self.request(app,'/predict/stock-experiment','POST',b'{}',[(b'authorization',b'Bearer fixture-only-value'),(b'content-length',b'2'),(b'content-length',b'2')])
        self.assertEqual(status,422);self.assertFalse(reads)
    async def test_import_does_not_load_tensorflow_decoder_or_parcel_serving(self):
        import subprocess,sys
        code="import serve_inventory_context_local_eval,sys;assert not any(n=='tensorflow' or n=='PIL' or n.startswith('parcel_') for n in sys.modules)"
        r=subprocess.run([sys.executable,'-c',code],cwd=Path(__file__).parent,capture_output=True,text=True,timeout=10)
        self.assertEqual(r.returncode,0,r.stderr)

if __name__=='__main__':unittest.main()
