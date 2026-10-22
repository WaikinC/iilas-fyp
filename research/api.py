"""Authenticated internal inference transport; parcel acceptance remains closed."""
import asyncio
import base64
import binascii
import hmac
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request as HttpRequest
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from parcel_runtime import (ParcelArtifacts, ParcelGPUArtifacts, ParcelExecutor, ParcelBusy,
                            ParcelUnavailable, ParcelTimeout, ParcelInvalidInput,
                            ParcelCancelled, ParcelRuntimeError)

MAX_BODY_BYTES = 14_100_000
MAX_IMAGE_BYTES = 10 * 1024 * 1024
LIVE_MAX_BODY_BYTES = 1_410_000
LIVE_MAX_IMAGE_BYTES = 1024 * 1024
PARCEL_DEADLINE_SECONDS = 25
MODEL_DIR = Path(__file__).parent / "models"


class Request(BaseModel):
    kind: str
    features: dict[str, float] = Field(default_factory=dict)
    imageBase64: str | None = Field(default=None, max_length=14_000_000)


class LiveParcelRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    intendedUse: str = Field(pattern=r'^sampled-live$')
    sessionId: str = Field(pattern=r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    frameId: str = Field(pattern=r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    sequence: int = Field(ge=1, le=12)
    imageBase64: str = Field(min_length=4, max_length=1_398_104,
                            pattern=r'^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$')


def predict_tabular(kind, features):
    # Parcel HTTP startup/health/auth must not import the tabular ML stack.
    from models import predict_tabular as predict
    return predict(kind, features)


def _operational_admission(artifacts):
    """Closed until scientific acceptance is bound to exact selected artifacts.

    Integrity audit results and environment settings cannot grant permission.
    """
    return False


def _operational_live_admission(artifacts):
    """Distinct intended-use gate; photo acceptance/env/request flags cannot enable live."""
    return False


def _configured_parcel_artifacts() -> tuple[ParcelArtifacts | ParcelGPUArtifacts | None, bool]:
    """Capture one server-owned identity; incomplete/mixed settings never fall back."""
    selection = os.environ.get("IILAS_PARCEL_SELECTION", "")
    test_directory = os.environ.get("IILAS_PARCEL_TEST_DIRECTORY", "")
    descriptor = os.environ.get("IILAS_PARCEL_GPU_DESCRIPTOR", "")
    descriptor_sha256 = os.environ.get("IILAS_PARCEL_GPU_DESCRIPTOR_SHA256", "")
    legacy = bool(selection or test_directory)
    gpu = bool(descriptor or descriptor_sha256)
    if not legacy and not gpu:
        return None, False
    if legacy and gpu:
        return None, True

    def valid_path(value):
        return bool(value and value.strip() and not any(ord(char) < 32 for char in value))

    try:
        if legacy:
            if valid_path(selection) and valid_path(test_directory):
                return ParcelArtifacts(Path(selection), Path(test_directory)), True
        elif (valid_path(descriptor) and re.fullmatch(r"[0-9a-f]{64}", descriptor_sha256)
              and ".." not in Path(descriptor).parts):
            return ParcelGPUArtifacts(Path(descriptor).absolute(), descriptor_sha256), True
    except (OSError, ValueError, TypeError):
        pass
    return None, True


def _timestamp():
    return datetime.now(timezone.utc).isoformat()


class AuthenticatedIntake:
    """Authenticate before consuming any bytes; cap streamed bytes independently."""
    def __init__(self, app, token):
        self.app = app
        self.expected = b"Bearer " + token.encode("utf-8") if token else None

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] not in ("/predict", "/predict/live-parcel"):
            await self.app(scope, receive, send)
            return

        async def reject(status, detail):
            await JSONResponse({"detail": detail}, status_code=status)(scope, receive, send)

        if self.expected is None:
            await reject(503, "Research service authentication is not configured.")
            return
        headers = scope.get("headers", [])
        body_limit = LIVE_MAX_BODY_BYTES if scope["path"] == "/predict/live-parcel" else MAX_BODY_BYTES
        credentials = [v for k, v in headers if k.lower() == b"authorization"]
        if len(credentials) != 1 or not hmac.compare_digest(credentials[0], self.expected):
            await reject(401, "Invalid service credentials.")
            return
        lengths = [v for k, v in headers if k.lower() == b"content-length"]
        if lengths:
            if len(lengths) != 1 or not lengths[0].isdigit():
                await reject(422, "Invalid request.")
                return
            if len(lengths[0]) > 12 or int(lengths[0]) > body_limit:
                await reject(413, "Request exceeds the size limit.")
                return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > body_limit:
                await reject(413, "Request exceeds the size limit.")
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                payload = bytes(body)
                body.clear()
                return {"type": "http.request", "body": payload, "more_body": False}
            return await receive()

        async def connected_send(message):
            if not scope.get("state", {}).get("parcel_disconnected", False):
                await send(message)

        await self.app(scope, replay, connected_send)


async def _parcel_run(http, image_base64, artifacts):
    cancel = asyncio.Event()
    executor = http.app.state.parcel_executor
    work = asyncio.create_task(executor.run(str(uuid4()), image_base64, artifacts, cancel))

    async def disconnected():
        while True:
            if (await http.receive())["type"] == "http.disconnect":
                http.state.parcel_disconnected = True
                return

    watch = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait({work, watch}, timeout=PARCEL_DEADLINE_SECONDS,
                                     return_when=asyncio.FIRST_COMPLETED)
        if watch in done:
            cancel.set()
            work.cancel()
            await asyncio.gather(work, return_exceptions=True)
            return Response(status_code=499)  # Suppressed by connected_send.
        if work not in done:
            cancel.set()
            work.cancel()
            await asyncio.gather(work, return_exceptions=True)
            raise ParcelTimeout("Parcel deadline exceeded.")
        result = await work
        # Admission remains closed above. Even an internally admitted future
        # executor must identify the score order and reviewed acceptance record;
        # these fields can never be supplied by the HTTP request or environment.
        if (not isinstance(result, dict) or result.get("operationally_approved") is not True
                or type(result.get("classOrder")) is not list
                or result["classOrder"] != ["Normal", "Damaged"]
                or not isinstance(result.get("acceptanceSha256"), str)
                or len(result["acceptanceSha256"]) != 64
                or any(c not in "0123456789abcdef" for c in result["acceptanceSha256"])):
            raise ParcelUnavailable("Operational acceptance is unavailable.")
        return result
    except asyncio.CancelledError:
        cancel.set()
        work.cancel()
        await asyncio.gather(work, return_exceptions=True)
        raise
    finally:
        watch.cancel()
        await asyncio.gather(watch, return_exceptions=True)


def create_app():
    token = os.environ.get("IILAS_RESEARCH_TOKEN", "")
    artifacts, configured = _configured_parcel_artifacts()

    @asynccontextmanager
    async def lifespan(application):
        snapshot = {"status": "unavailable" if configured else "not_configured",
                    "operationallyApproved": False, "checkedAt": _timestamp()}
        if artifacts is not None:
            try:
                result = await asyncio.wait_for(application.state.parcel_executor.audit(artifacts),
                                                PARCEL_DEADLINE_SECONDS)
                if result.get("status") == "artifact_ready":
                    snapshot["status"] = "artifact_ready"
                    digest = result.get("model", {}).get("modelVersion", "")
                    if isinstance(digest, str) and len(digest) == 64 and all(c in "0123456789abcdef" for c in digest):
                        snapshot["modelVersion"] = digest
            except (ParcelRuntimeError, asyncio.TimeoutError, OSError, ValueError, TypeError):
                pass
        snapshot["checkedAt"] = _timestamp()
        application.state.parcel_snapshot = snapshot
        yield

    application = FastAPI(title="IILAS Research Inference", docs_url=None,
                          redoc_url=None, openapi_url=None, lifespan=lifespan)
    application.state.parcel_executor = ParcelExecutor()
    application.state.parcel_snapshot = {
        "status": "unavailable" if configured else "not_configured",
        "operationallyApproved": False, "checkedAt": _timestamp()}
    application.add_middleware(AuthenticatedIntake, token=token)

    @application.exception_handler(RequestValidationError)
    async def invalid_request(_http, _error):
        # Pydantic includes raw input and exception context by default.
        return JSONResponse({"detail": "Invalid request."}, status_code=422)

    @application.get("/health")
    async def health():
        parcel = dict(application.state.parcel_snapshot)
        if application.state.parcel_executor.busy:
            parcel["status"] = "busy"
        return {"models": {kind: (MODEL_DIR / f"{kind}.joblib").is_file()
                           for kind in ("inventory", "delivery")},
                "vision": False, "parcel": parcel}

    @application.post("/predict")
    async def predict(request: Request, http: HttpRequest):
        if request.kind in ("inventory", "delivery"):
            try:
                return await run_in_threadpool(predict_tabular, request.kind, request.features)
            except FileNotFoundError:
                raise HTTPException(503, "Requested model is unavailable.") from None
            except (ValueError, KeyError):
                raise HTTPException(422, "Invalid model features.") from None
        if request.kind != "parcel" or not request.imageBase64:
            raise HTTPException(422, "Choose inventory, delivery, or parcel with an image.")
        try:
            data = base64.b64decode(request.imageBase64, validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(422, "Invalid parcel image encoding.") from None
        if not data:
            raise HTTPException(422, "Provide a parcel image.")
        if len(data) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Parcel image exceeds the size limit.")
        del data
        if artifacts is None or not _operational_admission(artifacts):
            raise HTTPException(503, "Parcel model operational acceptance is unavailable.")
        try:
            return await _parcel_run(http, request.imageBase64, artifacts)
        except ParcelBusy:
            raise HTTPException(429, "Parcel inference is busy.") from None
        except ParcelTimeout:
            raise HTTPException(504, "Parcel inference deadline exceeded.") from None
        except ParcelInvalidInput:
            raise HTTPException(422, "Invalid parcel image.") from None
        except (ParcelUnavailable, ParcelCancelled, ParcelRuntimeError):
            raise HTTPException(503, "Parcel inference is unavailable.") from None

    @application.post("/predict/live-parcel")
    async def live_parcel(request: LiveParcelRequest, http: HttpRequest):
        # Authentication/body/schema checks precede this gate; no image decode,
        # model work or caller-declared approval can grant live intended use.
        if artifacts is None or not _operational_live_admission(artifacts):
            raise HTTPException(503, "Live parcel operational acceptance is unavailable.")
        try:
            data = base64.b64decode(request.imageBase64, validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(422, "Invalid request.") from None
        if len(data) > LIVE_MAX_IMAGE_BYTES:
            raise HTTPException(413, "Live parcel image exceeds the size limit.")
        if not data or base64.b64encode(data).decode('ascii') != request.imageBase64:
            raise HTTPException(422, "Invalid request.")
        del data
        try:
            result = await _parcel_run(http, request.imageBase64, artifacts)
            if isinstance(result, Response):
                return result
            # These bindings must originate in the admitted worker result,
            # never from request fields or photo acceptance. The trusted caller
            # additionally compares the exact live pin/policy/model hashes.
            if (result.get('intendedUse') != 'sampled-live'
                    or not isinstance(result.get('policyVersion'), str)
                    or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}', result['policyVersion'])
                    or not isinstance(result.get('policySha256'), str)
                    or not re.fullmatch(r'[0-9a-f]{64}', result['policySha256'])):
                raise ParcelUnavailable("Live operational acceptance is unavailable.")
            return {**result, 'sessionId': request.sessionId, 'frameId': request.frameId,
                    'sequence': request.sequence}
        except ParcelBusy:
            raise HTTPException(429, "Parcel inference is busy.") from None
        except ParcelTimeout:
            raise HTTPException(504, "Parcel inference deadline exceeded.") from None
        except ParcelInvalidInput:
            raise HTTPException(422, "Invalid parcel image.") from None
        except (ParcelUnavailable, ParcelCancelled, ParcelRuntimeError):
            raise HTTPException(503, "Live parcel inference is unavailable.") from None

    return application


app = create_app()
