"""Explicit loopback context-stock factory; never operational admission."""
import argparse
import asyncio
from contextlib import asynccontextmanager
import hmac
import json
import os
from pathlib import Path

from fastapi import FastAPI,HTTPException,Request,Response
from starlette.responses import JSONResponse

import inventory_context_inference as local

BODY_LIMIT=4096
HTTP_DEADLINE_SECONDS=20


class StockIntake:
    def __init__(self,app,token):
        self.app=app
        self.expected=b'Bearer '+token.encode('utf-8') if token else None

    async def __call__(self,scope,receive,send):
        if scope['type']!='http':
            await self.app(scope,receive,send);return
        headers=scope.get('headers',[])
        hosts=[v for k,v in headers if k.lower()==b'host']
        if (any(k.lower() in (b'forwarded',b'x-forwarded-for',b'x-forwarded-host',b'x-forwarded-proto',b'x-forwarded-port') for k,_ in headers) or scope.get('scheme')!='http' or scope.get('server')!=('127.0.0.1',8001) or
            (scope.get('client') or ('',))[0]!='127.0.0.1' or hosts!=[b'127.0.0.1:8001']):
            await JSONResponse({'detail':'Local stock service only.'},status_code=403)(scope,receive,send);return
        if scope['path']!='/predict/stock-experiment':
            await self.app(scope,receive,send);return
        if self.expected is None:
            await JSONResponse({'detail':'Stock service authentication is unavailable.'},status_code=503)(scope,receive,send);return
        credentials=[v for k,v in headers if k.lower()==b'authorization']
        if len(credentials)!=1 or not hmac.compare_digest(credentials[0],self.expected):
            await JSONResponse({'detail':'Invalid service credentials.'},status_code=401)(scope,receive,send);return
        lengths=[v for k,v in headers if k.lower()==b'content-length']
        if lengths:
            if len(lengths)!=1 or not lengths[0].isdigit() or len(lengths[0])>12:
                await JSONResponse({'detail':'Invalid request.'},status_code=422)(scope,receive,send);return
            if int(lengths[0])>BODY_LIMIT:
                await JSONResponse({'detail':'Stock request is too large.'},status_code=413)(scope,receive,send);return
        body=bytearray()
        while True:
            message=await receive()
            if message['type']=='http.disconnect':return
            chunk=message.get('body',b'')
            if len(body)+len(chunk)>BODY_LIMIT:
                await JSONResponse({'detail':'Stock request is too large.'},status_code=413)(scope,receive,send);return
            body.extend(chunk)
            if not message.get('more_body',False):break
        delivered=False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered=True;payload=bytes(body);body.clear()
                return dict(type='http.request',body=payload,more_body=False)
            return await receive()
        async def connected_send(message):
            if not scope.get('state',{}).get('stock_disconnected',False):await send(message)
        await self.app(scope,replay,connected_send)


async def drain(task):
    # Cancelling asyncio.to_thread does not terminate its native Job. Never
    # cancel this task; await its bounded cleanup even through repeated cancel.
    while not task.done():
        try:await asyncio.shield(task)
        except asyncio.CancelledError:continue
        except Exception:break
    await asyncio.gather(task,return_exceptions=True)


def configuration(path,digest):
    env_path=os.environ.get('IILAS_STOCK_SERVING_MANIFEST','')
    env_sha=os.environ.get('IILAS_STOCK_SERVING_MANIFEST_SHA256','')
    explicit=path is not None or digest is not None
    if not explicit and not env_path and not env_sha:return None,False
    selected=(str(path),digest) if explicit else (env_path,env_sha)
    if (env_path or env_sha) and (env_path,env_sha)!=selected:
        raise local.StockUnavailable('Conflicting stock configuration')
    if not selected[0] or not selected[1]:raise local.StockUnavailable('Incomplete stock configuration')
    return local.load_manifest(*selected),True


def create_app(manifest_path=None,manifest_sha256=None,*,_executor_factory=None):
    token=os.environ.get('IILAS_STOCK_SERVICE_TOKEN','').strip()
    configured=False;manifest=None
    try:manifest,configured=configuration(manifest_path,manifest_sha256)
    except (local.StockUnavailable,ValueError,OSError):configured=True
    executor=(_executor_factory or local.ContextExecutor)(manifest) if manifest and token else None
    tasks=set()
    @asynccontextmanager
    async def lifespan(_app):
        yield
        for task in tuple(tasks):await drain(task)
    application=FastAPI(docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan)
    application.state.stock_executor=executor
    application.state.stock_manifest=manifest
    application.add_middleware(StockIntake,token=token)

    @application.get('/health')
    async def health():
        status='artifact_ready' if executor else 'unavailable' if configured else 'not_configured'
        if executor and getattr(executor,'unavailable',False):status='unavailable'
        elif executor and executor.busy:status='busy'
        elif executor:
            try:local.load_manifest(manifest.path,manifest.sha256)
            except (local.StockUnavailable,ValueError,OSError):status='unavailable'
        return dict(protocol=local.PROTOCOL,status=status,model='RandomForest',operationallyApproved=False)

    @application.post('/predict/stock-experiment')
    async def predict(http:Request):
        try:request=local.validate_request(local.decode_json(await http.body()))
        except (ValueError,TypeError,KeyError):raise HTTPException(422,'Invalid stock model features.') from None
        if executor is None:raise HTTPException(503,'Stock model is unavailable.')
        work=asyncio.create_task(asyncio.to_thread(executor.run,request));tasks.add(work)
        async def disconnected():
            while True:
                if (await http.receive())['type']=='http.disconnect':
                    http.state.stock_disconnected=True;return
        watch=asyncio.create_task(disconnected())
        try:
            done,_=await asyncio.wait({work,watch},timeout=HTTP_DEADLINE_SECONDS,return_when=asyncio.FIRST_COMPLETED)
            if watch in done:
                await drain(work);return Response(status_code=499)
            if work not in done:
                await drain(work);raise HTTPException(504,'Stock inference deadline exceeded.')
            return local.validate_prediction(await work,request,manifest)
        except local.StockBusy:raise HTTPException(429,'Stock inference is busy.') from None
        except local.StockUnavailable:raise HTTPException(503,'Stock inference is unavailable.') from None
        except asyncio.CancelledError:
            await drain(work);raise
        finally:
            watch.cancel();await asyncio.gather(watch,return_exceptions=True)
            tasks.discard(work)
    return application


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    p=commands.add_parser('prepare');p.add_argument('--output',type=Path,required=True)
    p=commands.add_parser('audit');p.add_argument('--manifest',type=Path,required=True);p.add_argument('--manifest-sha256',required=True)
    p=commands.add_parser('serve');p.add_argument('--port',type=int,default=8001)
    args=parser.parse_args(argv)
    if args.command in ('prepare','audit'):
        try:manifest=local.prepare_supervised(args.output) if args.command=='prepare' else local.load_manifest(args.manifest,args.manifest_sha256)
        except (local.StockUnavailable,ValueError,OSError):parser.error('Stock serving manifest is unavailable.')
        print(manifest.sha256);return
    if args.port!=8001:parser.error('The stock-only loopback port is8001.')
    application=create_app()
    if application.state.stock_executor is None:parser.error('Complete local stock authentication/manifest configuration is required.')
    import uvicorn
    uvicorn.run(application,host='127.0.0.1',port=8001,proxy_headers=False)


if __name__=='__main__':main()
