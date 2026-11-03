"""Explicit loopback experiment factory. Original operational factories stay closed."""
import argparse
import asyncio
import base64
import binascii
from contextlib import asynccontextmanager
import math
import os
from pathlib import Path
import time
from uuid import uuid4

import api
from fastapi import FastAPI, HTTPException, Request as HttpRequest
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

import parcel_local_eval as local
import parcel_runtime as parcel
from parcel_warm_runtime import WarmParcelExecutor

PARCEL_DEADLINE_SECONDS = 25
WIRE_DEADLINE_SECONDS = 30
_MANIFEST = 'IILAS_PARCEL_LOCAL_EVAL_MANIFEST'
_MANIFEST_SHA = 'IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256'
_OLD_SETTINGS = ('IILAS_PARCEL_WARM_BUNDLE', 'IILAS_PARCEL_WARM_BUNDLE_SHA256',
    'IILAS_PARCEL_GPU_DESCRIPTOR', 'IILAS_PARCEL_GPU_DESCRIPTOR_SHA256',
    'IILAS_PARCEL_SELECTION', 'IILAS_PARCEL_TEST_DIRECTORY')


class LoopbackOnly:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http':
            server = scope.get('server') or ('', None)
            hosts = [value for key, value in scope.get('headers', ()) if key.lower() == b'host']
            port = server[1]
            valid_port = type(port) is int and 1 <= port <= 65535
            expected_host = f'127.0.0.1:{port}'.encode('ascii') if valid_port else None
            if ((scope.get('client') or ('',))[0] != '127.0.0.1'
                    or server[0] != '127.0.0.1' or scope.get('scheme') != 'http'
                    or not valid_port or hosts != [expected_host]):
                await JSONResponse({'detail': 'Local research service only.'}, status_code=403)(scope, receive, send)
                return
        await self.app(scope, receive, send)


def _pair(path, digest):
    if not path or not isinstance(digest, str) or not parcel.HASH.fullmatch(digest):
        raise ValueError('Complete server-owned local evaluation configuration required.')
    return local._manifest_path(path), digest


def _configuration(path, digest):
    if any(os.environ.get(key, '') for key in _OLD_SETTINGS):
        raise ValueError('Conflicting parcel configuration.')
    env_path, env_sha = os.environ.get(_MANIFEST, ''), os.environ.get(_MANIFEST_SHA, '')
    explicit = path is not None or digest is not None
    if not explicit and not env_path and not env_sha:
        return None
    selected = _pair(path, digest) if explicit else _pair(env_path, env_sha)
    if env_path or env_sha:
        if _pair(env_path, env_sha) != selected:
            raise ValueError('Conflicting local evaluation configuration.')
    if not os.environ.get('IILAS_RESEARCH_TOKEN', '').strip():
        raise ValueError('Existing service authentication is required.')
    return local.load_manifest(*selected)


async def _drain(task, cancel):
    """Repeated outer cancellation cannot abandon native executor cleanup."""
    cancel.set()
    task.cancel()
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError:
            continue
        except Exception:
            break
    await asyncio.gather(task, return_exceptions=True)


async def _close_executor(executor):
    close = asyncio.create_task(executor.aclose())
    interrupted = False
    while not close.done():
        try:
            await asyncio.shield(close)
        except asyncio.CancelledError:
            interrupted = True
    close.result()
    if interrupted:
        raise asyncio.CancelledError()


async def _current_manifest(executor, manifest):
    try:
        if local.load_manifest(manifest.path, manifest.sha256) != manifest:
            raise ValueError()
    except (ValueError, OSError):
        await _close_executor(executor)
        raise parcel.ParcelUnavailable('Local evaluation unavailable.') from None


async def _run(http, image, manifest, *, live=None):
    # Recheck server-owned source/manifest identity on both sides of native work.
    executor = http.app.state.parcel_executor
    await _current_manifest(executor, manifest)
    request_id = str(uuid4())
    cancel = asyncio.Event()
    work = asyncio.create_task(http.app.state.parcel_executor.run(
        request_id, image, manifest.bundle.artifacts, cancel))

    async def disconnected():
        while True:
            if (await http.receive())['type'] == 'http.disconnect':
                http.state.parcel_disconnected = True
                return
    watch = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait({work, watch}, timeout=PARCEL_DEADLINE_SECONDS,
                                     return_when=asyncio.FIRST_COMPLETED)
        if watch in done:
            await _drain(work, cancel)
            return Response(status_code=499)
        if work not in done:
            await _drain(work, cancel)
            raise parcel.ParcelTimeout('Parcel deadline exceeded.')
        result = await work
        await _current_manifest(executor, manifest)
        try:
            return local.experimental_result(result, request_id, image, manifest, live=live)
        except parcel.ParcelUnavailable:
            await _close_executor(executor)
            raise
    except asyncio.CancelledError:
        await _drain(work, cancel)
        raise
    finally:
        watch.cancel()
        await asyncio.gather(watch, return_exceptions=True)


def _image(encoded, maximum):
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error, TypeError):
        raise HTTPException(422, 'Invalid parcel image encoding.') from None
    if not data or base64.b64encode(data).decode('ascii') != encoded:
        raise HTTPException(422, 'Invalid parcel image encoding.')
    if len(data) > maximum:
        raise HTTPException(413, 'Parcel image exceeds the size limit.')


async def _prediction(http, image, manifest, *, began, live=None):
    if manifest is None:
        raise HTTPException(503, 'Local parcel evaluation is unavailable.')
    try:
        result = await _run(http, image, manifest, live=live)
        if isinstance(result, Response):
            return result
        # Measure the actual service interval, including route preparation,
        # native work and manifest/result validation. Never substitute the raw
        # worker total or inflate the clock value to match worker processing.
        elapsed_ms = (time.monotonic()-began)*1000
        if (not math.isfinite(elapsed_ms) or elapsed_ms < result['processingTimeMs']
                or elapsed_ms > WIRE_DEADLINE_SECONDS*1000):
            await _close_executor(http.app.state.parcel_executor)
            raise parcel.ParcelUnavailable('Local parcel timing is unavailable.')
        return {**result, 'totalProcessingTimeMs': elapsed_ms}
    except parcel.ParcelBusy:
        raise HTTPException(429, 'Parcel inference is busy.') from None
    except parcel.ParcelTimeout:
        raise HTTPException(504, 'Parcel inference deadline exceeded.') from None
    except parcel.ParcelInvalidInput:
        raise HTTPException(422, 'Invalid parcel image.') from None
    except parcel.ParcelRuntimeError:
        raise HTTPException(503, 'Parcel inference is unavailable.') from None


def create_app(manifest_path=None, manifest_sha256=None):
    """Capture complete configuration; default import/health never starts work."""
    manifest = _configuration(manifest_path, manifest_sha256)
    executor = WarmParcelExecutor(manifest.bundle.path, manifest.bundle.sha256) if manifest else None

    @asynccontextmanager
    async def lifespan(application):
        try:
            if executor is not None:
                try:
                    audit = await asyncio.wait_for(executor.audit(manifest.bundle.artifacts), PARCEL_DEADLINE_SECONDS)
                    if audit.get('status') == 'artifact_ready':
                        application.state.parcel_snapshot['status'] = 'artifact_ready'
                except (parcel.ParcelRuntimeError, asyncio.TimeoutError, OSError, ValueError, TypeError):
                    application.state.parcel_snapshot['status'] = 'unavailable'
            yield
        finally:
            if executor is not None:
                # aclose owns bounded native drain; cancellation cannot skip it.
                await _close_executor(executor)

    application = FastAPI(title='IILAS Local Experimental Inference', docs_url=None,
                          redoc_url=None, openapi_url=None, lifespan=lifespan)
    application.state.parcel_executor = executor
    application.state.parcel_snapshot = dict(status='configured' if manifest else 'not_configured',
        operationallyApproved=False, checkedAt=api._timestamp())
    application.add_middleware(api.AuthenticatedIntake, token=os.environ.get('IILAS_RESEARCH_TOKEN', '').strip())
    application.add_middleware(LoopbackOnly)

    @application.exception_handler(RequestValidationError)
    async def invalid_request(_http, _error):
        return JSONResponse({'detail': 'Invalid request.'}, status_code=422)

    @application.get('/health')
    async def health():
        snapshot = dict(application.state.parcel_snapshot)
        if executor is not None and executor.busy:
            snapshot['status'] = 'busy'
        return dict(models={kind: (api.MODEL_DIR/f'{kind}.joblib').is_file()
                           for kind in ('inventory', 'delivery')}, vision=False, parcel=snapshot)

    @application.post('/predict')
    async def predict(request: api.Request, http: HttpRequest):
        if request.kind in ('inventory', 'delivery'):
            try:
                return await run_in_threadpool(api.predict_tabular, request.kind, request.features)
            except FileNotFoundError:
                raise HTTPException(503, 'Requested model is unavailable.') from None
            except (ValueError, KeyError):
                raise HTTPException(422, 'Invalid model features.') from None
        # Original Request remains in use, but parcel authority has an exact
        # shape. Pydantic extra-ignore must not silently accept mode/approval.
        began = time.monotonic()
        if request.kind != 'parcel' or request.model_fields_set != {'kind', 'imageBase64'}:
            raise HTTPException(422, 'Invalid parcel request.')
        raw = await http.json()
        if set(raw) != {'kind', 'imageBase64'}:
            raise HTTPException(422, 'Invalid parcel request.')
        _image(request.imageBase64, api.MAX_IMAGE_BYTES)
        return await _prediction(http, request.imageBase64, manifest, began=began)

    @application.post('/predict/live-parcel')
    async def live_parcel(request: api.LiveParcelRequest, http: HttpRequest):
        began = time.monotonic()
        _image(request.imageBase64, api.LIVE_MAX_IMAGE_BYTES)
        return await _prediction(http, request.imageBase64, manifest, began=began,
            live={key: getattr(request, key) for key in ('sessionId', 'frameId', 'sequence')})

    return application


def main(argv=None):
    parser = argparse.ArgumentParser(description='Explicit local experimental parcel service')
    commands = parser.add_subparsers(dest='command', required=True)
    prepare = commands.add_parser('prepare', help='Create a fresh versioned metadata manifest')
    prepare.add_argument('--output', required=True, type=Path)
    check = commands.add_parser('check', help='Validate metadata without audit/model execution')
    check.add_argument('--manifest', required=True, type=Path)
    check.add_argument('--sha256', required=True)
    serve = commands.add_parser('serve', help='Serve on literal 127.0.0.1')
    serve.add_argument('--port', type=int, required=True)
    args = parser.parse_args(argv)
    if args.command in ('prepare', 'check'):
        try:
            manifest = (local.create_manifest(args.output) if args.command == 'prepare'
                        else local.load_manifest(args.manifest, args.sha256))
        except ValueError:
            parser.error('Local evaluation manifest is unavailable.')
        print(manifest.sha256)
        return
    if not 1 <= args.port <= 65535:
        parser.error('Port must be between 1 and 65535.')
    if not os.environ.get('IILAS_RESEARCH_TOKEN', '').strip():
        parser.error('Existing service authentication environment is required.')
    application = create_app()
    if application.state.parcel_executor is None:
        parser.error('Complete server-owned local evaluation configuration required.')
    import uvicorn
    uvicorn.run(application, host='127.0.0.1', port=args.port, proxy_headers=False)


if __name__ == '__main__':
    main()
