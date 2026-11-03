"""ASGI stock-only protocol fixtures: no model, real account or dataset."""
import asyncio
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch


class StockHTTPTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('serve_inventory_local_eval'),'Stock-only HTTP factory is missing')
        import serve_inventory_local_eval as service
        self.s=service

    async def request(self,application,path='/health',method='GET',body=b'',headers=None,client='127.0.0.1'):
        messages=[];reads=[];sent=0;done=asyncio.Event();chunks=body if isinstance(body,list) else [body]
        async def receive():
            nonlocal sent
            reads.append(True)
            if sent<len(chunks):
                chunk=chunks[sent];sent+=1
                return dict(type='http.request',body=chunk,more_body=sent<len(chunks))
            await done.wait();return dict(type='http.disconnect')
        async def send(message):
            messages.append(message)
            if message['type']=='http.response.body' and not message.get('more_body'):done.set()
        scope=dict(type='http',asgi=dict(version='3.0'),http_version='1.1',scheme='http',method=method,path=path,raw_path=path.encode(),query_string=b'',root_path='',server=('127.0.0.1',8001),client=(client,1234),headers=[(b'host',b'127.0.0.1:8001')]+(headers or []))
        await application(scope,receive,send)
        return next(m['status'] for m in messages if m['type']=='http.response.start'),reads,messages

    def fixture(self):
        a=self.s.local;features=dict(zip(a.FEATURES,[100,20,12,75,1,.25]))
        manifest=a.Manifest(Path('fixture'),'d'*64,dict(model=dict(sha256='a'*64),dataset=dict(sha256='b'*64),
            development=dict(sha256='c'*64),evaluation=dict(sha256='e'*64),ranges={k:dict(min=-100,max=1000) for k in a.FEATURES}))
        request=dict(protocol=a.PROTOCOL,requestId='00000000-0000-4000-8000-000000000001',features=features,inputSha256=a.feature_digest(features))
        response=dict(protocol=a.PROTOCOL,requestId=request['requestId'],inputSha256=request['inputSha256'],features=features,
            classOrder=list(a.CLASSES),label='Normal',probabilities=[.7,.2,.1],model='RandomForest',modelSha256='a'*64,
            servingManifestSha256='d'*64,datasetSha256='b'*64,developmentSha256='c'*64,evaluationSha256='e'*64,
            processingTimeMs=.5,totalProcessingTimeMs=1,outOfRange=[],**a.PROVENANCE)
        return manifest,request,response

    async def test_health_never_claims_operational_approval_and_unknown_routes_are_closed(self):
        with patch.dict(os.environ,{},clear=True):application=self.s.create_app()
        status,_,messages=await self.request(application)
        self.assertEqual(status,200);self.assertIn(b'false',b''.join(m.get('body',b'') for m in messages))
        for path in ('/docs','/openapi.json','/predict','/predict/live-parcel'):
            status,_,_=await self.request(application,path);self.assertEqual(status,404)

    async def test_unconfirmed_native_cleanup_is_unavailable_not_ready(self):
        manifest,request,_=self.fixture();a=self.s.local
        class Quarantined:
            busy=False;unavailable=True
            def run(self,_request):raise a.StockUnavailable('Restart required')
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True),patch.object(a,'load_manifest',return_value=manifest):
            application=self.s.create_app('fixture','d'*64,_executor_factory=lambda _:Quarantined())
            headers=[(b'authorization',b'Bearer fixture-only-value')]
            status,_,messages=await self.request(application,headers=headers)
            self.assertEqual(status,200);self.assertIn(b'"status":"unavailable"',b''.join(m.get('body',b'') for m in messages))
            status,_,_=await self.request(application,'/predict/stock-experiment','POST',json.dumps(request).encode(),headers)
            self.assertEqual(status,503)

    async def test_authentication_happens_before_any_body_read(self):
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True):application=self.s.create_app()
        for headers in ([],[(b'authorization',b'Bearer wrong')],[(b'authorization',b'Bearer fixture-only-value')]*2):
            status,reads,_=await self.request(application,'/predict/stock-experiment','POST',b'large private input',headers)
            self.assertEqual(status,401);self.assertFalse(reads)

    async def test_non_loopback_is_denied_before_body_and_authenticated_body_is_bounded(self):
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True):application=self.s.create_app()
        header=[(b'authorization',b'Bearer fixture-only-value')]
        status,reads,_=await self.request(application,'/predict/stock-experiment','POST',b'{}',header,client='192.168.1.2')
        self.assertEqual(status,403);self.assertFalse(reads)
        status,_,_=await self.request(application,'/predict/stock-experiment','POST',b'x'*4097,header)
        self.assertEqual(status,413)

    async def test_malformed_or_extra_fields_never_fall_back_to_a_model(self):
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True):application=self.s.create_app()
        headers=[(b'authorization',b'Bearer fixture-only-value'),(b'content-type',b'application/json')]
        for body in (b'{',b'{}',b'{"kind":"inventory","features":{}}'):
            status,_,_=await self.request(application,'/predict/stock-experiment','POST',body,headers)
            self.assertEqual(status,422)

    async def test_valid_response_busy_and_forged_result_are_distinct(self):
        manifest,request,response=self.fixture();a=self.s.local
        class Executor:
            busy=False
            mode='valid'
            def run(self,payload):
                if self.mode=='busy':raise a.StockBusy('fixture')
                return dict(copy.deepcopy(response),**({'operationally_approved':True} if self.mode=='forged' else {}))
        executor=Executor()
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True),patch.object(a,'load_manifest',return_value=manifest):
            application=self.s.create_app(manifest.path,manifest.sha256,_executor_factory=lambda _:executor)
            headers=[(b'authorization',b'Bearer fixture-only-value'),(b'content-type',b'application/json')]
            for mode,wanted in [('valid',200),('busy',429),('forged',503)]:
                executor.mode=mode
                status,_,messages=await self.request(application,'/predict/stock-experiment','POST',json.dumps(request).encode(),headers)
                self.assertEqual(status,wanted)
                if mode=='valid':self.assertEqual(json.loads(b''.join(m.get('body',b'') for m in messages)),response)

    async def test_health_revalidates_source_drift_after_startup(self):
        manifest,_,_=self.fixture();a=self.s.local
        class Executor:busy=False
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True),patch.object(a,'load_manifest',return_value=manifest) as loader:
            application=self.s.create_app(manifest.path,manifest.sha256,_executor_factory=lambda _:Executor())
            loader.side_effect=a.StockUnavailable('source drift')
            status,_,messages=await self.request(application)
            self.assertEqual(status,200)
            body=json.loads(b''.join(m.get('body',b'') for m in messages))
            self.assertEqual(body['status'],'unavailable')

    async def test_chunked_and_declared_oversize_refuse_without_model_work(self):
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True):application=self.s.create_app()
        headers=[(b'authorization',b'Bearer fixture-only-value')]
        status,reads,_=await self.request(application,'/predict/stock-experiment','POST',b'{}',headers+[(b'content-length',b'4097')])
        self.assertEqual(status,413);self.assertFalse(reads)
        status,_,_=await self.request(application,'/predict/stock-experiment','POST',[b'x'*2048,b'x'*2049],headers)
        self.assertEqual(status,413)

    async def test_disconnect_drains_the_owned_work_before_returning(self):
        manifest,request,response=self.fixture();a=self.s.local;started=threading.Event();finished=threading.Event()
        class Executor:
            busy=False
            def run(self,payload):
                self.busy=True;started.set()
                try:
                    threading.Event().wait(.05)
                    return response
                finally:self.busy=False;finished.set()
        executor=Executor();messages=[];sent=False
        async def receive():
            nonlocal sent
            if not sent:sent=True;return dict(type='http.request',body=json.dumps(request).encode(),more_body=False)
            while not started.is_set():await asyncio.sleep(.001)
            return dict(type='http.disconnect')
        async def send(message):messages.append(message)
        scope=dict(type='http',asgi=dict(version='3.0'),http_version='1.1',scheme='http',method='POST',path='/predict/stock-experiment',raw_path=b'/predict/stock-experiment',query_string=b'',root_path='',server=('127.0.0.1',8001),client=('127.0.0.1',1234),headers=[(b'host',b'127.0.0.1:8001'),(b'authorization',b'Bearer fixture-only-value')])
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True),patch.object(a,'load_manifest',return_value=manifest):
            application=self.s.create_app(manifest.path,manifest.sha256,_executor_factory=lambda _:executor)
            await application(scope,receive,send)
        self.assertTrue(finished.is_set());self.assertFalse(executor.busy);self.assertFalse(messages)

    async def test_deadline_waits_for_cleanup_and_repeated_cancellation_does_not_cancel_work(self):
        manifest,request,response=self.fixture();a=self.s.local;finished=threading.Event()
        class Executor:
            busy=False
            def run(self,payload):
                try:threading.Event().wait(.03);return response
                finally:finished.set()
        async def timeout(tasks,**kwargs):return set(),set(tasks)
        with patch.dict(os.environ,{'IILAS_STOCK_SERVICE_TOKEN':'fixture-only-value'},clear=True),patch.object(a,'load_manifest',return_value=manifest):
            application=self.s.create_app(manifest.path,manifest.sha256,_executor_factory=lambda _:Executor())
            with patch.object(self.s.asyncio,'wait',side_effect=timeout):
                status,_,_=await self.request(application,'/predict/stock-experiment','POST',json.dumps(request).encode(),[(b'authorization',b'Bearer fixture-only-value')])
            self.assertEqual(status,504);self.assertTrue(finished.is_set())
        gate=asyncio.Event();work=asyncio.create_task(gate.wait());cleanup=asyncio.create_task(self.s.drain(work))
        await asyncio.sleep(0);cleanup.cancel();await asyncio.sleep(0);cleanup.cancel();await asyncio.sleep(0)
        self.assertFalse(work.cancelled());gate.set();await cleanup
        self.assertTrue(work.done());self.assertFalse(work.cancelled())

    async def test_import_does_not_load_tensorflow_decoder_or_parcel_serving(self):
        code="import serve_inventory_local_eval,sys;assert not any(n=='tensorflow' or n=='PIL' or n.startswith('parcel_') for n in sys.modules)"
        result=subprocess.run([sys.executable,'-c',code],cwd=Path(__file__).parent,capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)


if __name__=='__main__':unittest.main()
