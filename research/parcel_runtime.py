"""Disposable Windows parcel transport. Importing this module is stdlib-only.

Artifact integrity never grants operational approval. The HTTP caller supplies
only server configuration; neither CLI nor environment offers a fixture/model
approval bypass. Heavy dependencies are imported exclusively by the supervised
worker. Local Python command injection exists for process integration tests.
"""
import asyncio
import base64
import binascii
import ctypes
from ctypes import wintypes as W
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
REQUEST_ROOT = ROOT / "research/datasets/parcel-api-requests"
MIB = 1024 ** 2
MAX_IMAGE_BYTES = 10 * MIB
MAX_BASE64_CHARS = 4 * ((MAX_IMAGE_BYTES + 2) // 3)
KNOWN_FILES = frozenset(("input.json", "owner.json", "response.json",
                        "manager.json", "worker.stdout.log", "worker.stderr.log",
                        "worker.result.json"))
HASH = re.compile(r"^[a-f0-9]{64}$")


class ParcelRuntimeError(RuntimeError):
    """Safe public errors contain no paths, image data, or inner exceptions."""


class ParcelBusy(ParcelRuntimeError):
    pass


class ParcelUnavailable(ParcelRuntimeError):
    pass


class ParcelTimeout(ParcelRuntimeError):
    pass


class ParcelInvalidInput(ParcelRuntimeError):
    pass


class ParcelCancelled(ParcelRuntimeError):
    pass


@dataclass(frozen=True)
class ParcelArtifacts:
    selection_path: Path
    test_directory: Path


@dataclass(frozen=True)
class ParcelGPUArtifacts:
    descriptor_path: Path
    descriptor_sha256: str


def parcel_limits():
    return runtime.Limits(25, 25, 2048 * MIB, 3072 * MIB, 2048 * MIB,
                          64 * MIB, poll_seconds=.05, threads=1,
                          available_floor_bytes=768 * MIB)


def _uuid(value):
    if not isinstance(value, str):
        raise ParcelInvalidInput("Invalid request identity")
    try:
        if str(uuid.UUID(value)) != value:
            raise ValueError()
    except ValueError:
        raise ParcelInvalidInput("Invalid request identity") from None
    return value


def _directory(path):
    path = Path(path).absolute()
    _uuid(path.name)
    if path.parent != REQUEST_ROOT or path.is_symlink():
        raise ParcelUnavailable("Unsafe request directory")
    checked = runtime._validate_output_path(path)
    if checked.parent != REQUEST_ROOT.resolve():
        raise ParcelUnavailable("Unsafe request directory")
    return checked


def _json(path, limit=1024 * 1024):
    if path.is_symlink() or path.stat().st_size > limit:
        raise ParcelUnavailable("Invalid bounded result")
    with path.open("rb") as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise ParcelUnavailable("Invalid bounded result")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ParcelUnavailable("Invalid result envelope")
    return value


def _image(value):
    if not isinstance(value, str) or not 0 < len(value) <= MAX_BASE64_CHARS:
        raise ParcelInvalidInput("Provide a nonempty image up to 10 MiB")
    try:
        data = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise ParcelInvalidInput("Invalid base64 image") from None
    if not 0 < len(data) <= MAX_IMAGE_BYTES:
        raise ParcelInvalidInput("Provide a nonempty image up to 10 MiB")
    return data


def _artifact_request(artifacts):
    """Serialize only the configured artifact type; never infer it from fields."""
    if type(artifacts) is ParcelArtifacts:
        return dict(artifactKind="legacy-selection-v1",
                    selection=str(Path(artifacts.selection_path).resolve()),
                    testDirectory=str(Path(artifacts.test_directory).resolve()))
    if type(artifacts) is ParcelGPUArtifacts:
        path, pin = artifacts.descriptor_path, artifacts.descriptor_sha256
        if (not isinstance(path, Path) or not path.is_absolute()
                or any(ord(char) < 32 for char in str(path))
                or not isinstance(pin, str) or not HASH.fullmatch(pin)):
            raise ParcelUnavailable("Parcel artifacts unavailable")
        try:
            path = runtime._validate_output_path(path)
        except (OSError, ValueError, runtime.RuntimeSafetyError):
            raise ParcelUnavailable("Parcel artifacts unavailable") from None
        return dict(artifactKind="gpu-descriptor-v2", descriptor=str(path), descriptorSha256=pin)
    raise ParcelUnavailable("Parcel artifacts unavailable")


def _request_artifacts(request):
    """Reject mixed private envelopes, including GPU fields without a GPU tag."""
    base = {"requestId", "mode", "imageBase64", "evidenceSha256", "bindings"}
    kind = request.get("artifactKind")
    if kind == "gpu-descriptor-v2":
        fields = {"artifactKind", "descriptor", "descriptorSha256"}
        if set(request) != base | fields or not isinstance(request["descriptor"], str):
            raise ParcelUnavailable("Invalid parcel artifacts")
        artifacts = ParcelGPUArtifacts(Path(request["descriptor"]), request["descriptorSha256"])
    elif kind == "legacy-selection-v1" or "artifactKind" not in request:
        fields = {"selection", "testDirectory"} | ({"artifactKind"} if kind is not None else set())
        if (set(request) != base | fields
                or any(not isinstance(request[key], str) or not request[key] for key in ("selection", "testDirectory"))):
            raise ParcelUnavailable("Invalid parcel artifacts")
        artifacts = ParcelArtifacts(Path(request["selection"]), Path(request["testDirectory"]))
    else:
        raise ParcelUnavailable("Invalid parcel artifacts")
    _artifact_request(artifacts)
    return artifacts


def _bindings(artifacts):
    if type(artifacts) is ParcelGPUArtifacts:
        branch = _artifact_request(artifacts)
        try:
            import parcel_gpu_serving
            result = parcel_gpu_serving.descriptor_bindings(branch["descriptor"], branch["descriptorSha256"])
        except (OSError, ValueError, TypeError, KeyError, AttributeError, ImportError):
            raise ParcelUnavailable("Parcel artifacts unavailable") from None
        if (type(result) is not dict
                or set(result) != {"modelVersion", "selectionSha256", "evaluationSha256"}
                or any(not isinstance(value, str) or not HASH.fullmatch(value) for value in result.values())
                or result["selectionSha256"] != branch["descriptorSha256"]):
            raise ParcelUnavailable("Parcel artifacts unavailable")
        return result
    if type(artifacts) is not ParcelArtifacts:
        raise ParcelUnavailable("Parcel artifacts unavailable")
    selection = runtime._validate_output_path(artifacts.selection_path)
    report = runtime._validate_output_path(Path(artifacts.test_directory) / "report.json")
    document = _json(selection)
    payload = document.get("payload", document)
    fit = next(f for f in payload["selected"] if f["architecture"] == "mobilenetv2")
    model_hash = fit["artifact_sha256"]
    if not isinstance(model_hash, str) or not HASH.fullmatch(model_hash):
        raise ParcelUnavailable("Parcel artifacts unavailable")
    # Bound the metadata read before hashing. Full provenance is revalidated by
    # the worker against originals; this snapshot only binds response identity.
    if report.stat().st_size > 8 * MIB:
        raise ParcelUnavailable("Parcel artifacts unavailable")
    return dict(modelVersion=model_hash, selectionSha256=runtime.sha256_file(selection),
                evaluationSha256=runtime.sha256_file(report))


def _kernel():
    if os.name != "nt":
        raise ParcelUnavailable("Windows supervision required")
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, W.BOOL, W.LPCWSTR]
    kernel.CreateMutexW.restype = W.HANDLE
    kernel.WaitForSingleObject.argtypes = [W.HANDLE, W.DWORD]
    kernel.WaitForSingleObject.restype = W.DWORD
    kernel.ReleaseMutex.argtypes = [W.HANDLE]
    kernel.CloseHandle.argtypes = [W.HANDLE]
    kernel.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
    kernel.OpenProcess.restype = W.HANDLE
    return kernel


class _Mutex:
    """Acquire and release on the synchronous manager's same OS thread."""
    def __enter__(self):
        self.kernel = _kernel()
        name = hashlib.sha256(str(ROOT.resolve()).casefold().encode()).hexdigest()
        self.handle = self.kernel.CreateMutexW(None, False, "Local\\IILASParcel-" + name)
        if not self.handle:
            raise ParcelUnavailable("Parcel admission unavailable")
        state = self.kernel.WaitForSingleObject(self.handle, 0)
        if state not in (0, 0x80):  # acquired or abandoned owner
            self.kernel.CloseHandle(self.handle)
            if state == 0x102:
                raise ParcelBusy("Parcel worker busy")
            raise ParcelUnavailable("Parcel admission unavailable")
        return self

    def __exit__(self, *args):
        self.kernel.ReleaseMutex(self.handle)
        self.kernel.CloseHandle(self.handle)


def _job_active(kernel, handle):
    class Accounting(ctypes.Structure):
        _fields_ = [(name, ctypes.c_longlong) for name in
                    ("user", "kernel", "period_user", "period_kernel")] + [
                        (name, W.DWORD) for name in
                        ("faults", "total", "active", "terminated")]
    kernel.QueryInformationJobObject.argtypes = [
        W.HANDLE, ctypes.c_int, ctypes.c_void_p, W.DWORD, ctypes.c_void_p]
    info = Accounting()
    if not kernel.QueryInformationJobObject(handle, 1, ctypes.byref(info), ctypes.sizeof(info), None):
        raise ParcelUnavailable("Job drain monitor unavailable")
    return info.active


def _admit_job(directory):
    """Mutex abandonment alone is not proof the previous Job has drained."""
    marker = REQUEST_ROOT / "active.json"
    kernel = _kernel()
    kernel.OpenJobObjectW.argtypes = [W.DWORD, W.BOOL, W.LPCWSTR]
    kernel.OpenJobObjectW.restype = W.HANDLE
    if marker.exists():
        prior = _json(marker, 1024)
        name = prior.get("jobName")
        if not isinstance(name, str) or not name.startswith("Local\\IILASNativeRunner-"):
            raise ParcelUnavailable("Parcel recovery requires inspection")
        handle = kernel.OpenJobObjectW(4, False, name)
        if not handle:
            # An unexpectedly dead HTTP parent cannot attest its final drain.
            # Retain the marker for local inspection, rather than guessing that
            # an abandoned mutex authorizes another expensive execution.
            raise ParcelUnavailable("Parcel recovery requires inspection")
        try:
            if _job_active(kernel, handle):
                raise ParcelBusy("Parcel worker busy")
        finally:
            kernel.CloseHandle(handle)
        marker.unlink()
    owner = _json(directory / "owner.json", 1024)
    name = owner.get("jobName")
    if not isinstance(name, str) or not name.startswith("Local\\IILASNativeRunner-"):
        raise ParcelUnavailable("Parcel containment unavailable")
    runtime.write_json_exclusive(marker, dict(requestId=directory.name, jobName=name))


def _release_job_marker(request_id):
    # Called only after the parent has observed zero members in its outer Job.
    # The same mutex prevents replacing a successor's marker during cleanup.
    try:
        with _Mutex():
            marker = REQUEST_ROOT / "active.json"
            if marker.exists() and _json(marker, 1024).get("requestId") == request_id:
                marker.unlink()
            return True
    except ParcelBusy:
        marker = REQUEST_ROOT / "active.json"
        # Keep the old Job queryable until a successor has consumed its marker.
        try:
            return not marker.exists() or _json(marker, 1024).get("requestId") != request_id
        except (FileNotFoundError, json.JSONDecodeError):
            # A successor can be between unlink and exclusive replacement while
            # it owns the mutex. Retain our handle and retry after that mutation.
            return False


def _cleanup(directory):
    """Known files and a bounded, individually checked worker temp subtree only."""
    directory = _directory(directory)
    if not directory.exists():
        return
    entries = list(directory.iterdir())
    if len(entries) > len(KNOWN_FILES) + 1:
        raise ParcelUnavailable("Request cleanup unavailable")
    files, folders = [], []
    for path in entries:
        if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
            raise ParcelUnavailable("Request cleanup unavailable")
        if path.name in KNOWN_FILES and path.is_file():
            files.append(path)
        elif path.name == "tmp" and path.is_dir():
            pending = [(path, 0)]
            while pending:
                folder, depth = pending.pop()
                folders.append(folder)
                if depth > 8 or len(files) + len(folders) > 1024:
                    raise ParcelUnavailable("Request cleanup unavailable")
                for child in folder.iterdir():
                    if (child.is_symlink()
                            or (hasattr(child, "is_junction") and child.is_junction())
                            or not child.resolve().is_relative_to(directory)):
                        raise ParcelUnavailable("Request cleanup unavailable")
                    if child.is_dir():
                        pending.append((child, depth + 1))
                    elif child.is_file():
                        files.append(child)
                    else:
                        raise ParcelUnavailable("Request cleanup unavailable")
        else:
            raise ParcelUnavailable("Request cleanup unavailable")
    # Validate the entire plan before deleting anything.
    for path in files:
        if not path.resolve().is_relative_to(directory):
            raise ParcelUnavailable("Request cleanup unavailable")
    for path in files:
        path.unlink()
    for path in reversed(folders):
        path.rmdir()
    directory.rmdir()


def _sweep(current):
    """At most 32 old, ownerless requests per admission, while holding mutex."""
    if not REQUEST_ROOT.exists():
        return
    kernel = _kernel()
    checked = 0
    for path in REQUEST_ROOT.iterdir():
        if checked >= 32:
            break
        checked += 1
        try:
            if path == current or time.time() - path.stat().st_mtime < 60:
                continue
            path = _directory(path)
            owner = _json(path / "owner.json", 1024)
            pid = owner["pid"]
            if type(pid) is not int or pid <= 0:
                continue
            handle = kernel.OpenProcess(0x100000, False, pid)
            if handle:
                try:
                    if kernel.WaitForSingleObject(handle, 0) == 0x102:
                        continue
                finally:
                    kernel.CloseHandle(handle)
            elif ctypes.get_last_error() != 87:
                continue  # Permission/monitor failure is not proof of death.
            _cleanup(path)
        except (OSError, ValueError, KeyError, ParcelRuntimeError, runtime.RuntimeSafetyError):
            continue


def _safe_audit(result, bindings):
    if result.get("operationally_approved") is not False:
        raise ParcelUnavailable("Invalid approval result")
    if result.get("status") == "unavailable":
        return dict(status="unavailable", operationally_approved=False)
    model = result.get("model")
    if (result.get("status") != "artifact_ready" or not isinstance(model, dict)
            or model.get("model") != "MobileNetV2"
            or model.get("modelVersion") != bindings["modelVersion"]
            or model.get("selection_sha256") != bindings["selectionSha256"]
            or model.get("report_sha256") != bindings["evaluationSha256"]):
        raise ParcelUnavailable("Invalid artifact result")
    return dict(status="artifact_ready", operationally_approved=False,
                model={key: model[key] for key in
                       ("model", "modelVersion", "selection_sha256", "report_sha256")})


def _number(value):
    return type(value) in (int, float) and math.isfinite(value)


def _validate_result(result, request):
    gpu = request.get("artifactKind") == "gpu-descriptor-v2"
    if "artifactKind" in request or "descriptor" in request or "descriptorSha256" in request:
        _request_artifacts(request)
    if result.get("requestId") != request["requestId"]:
        raise ParcelUnavailable("Foreign parcel result")
    if result.get("error") == "invalid_input":
        raise ParcelInvalidInput("Invalid parcel image")
    if request["mode"] == "audit":
        return _safe_audit(result, request["bindings"])
    if (result.get("operationally_approved") is not False
            or type(result.get("classOrder")) is not list
            or result["classOrder"] != ["Normal", "Damaged"]
            or "acceptanceSha256" not in result or result["acceptanceSha256"] is not None
            or result.get("humanReviewRequired") is not True
            or result.get("model") != "MobileNetV2"
            or result.get("confidenceMeaning") != "uncalibrated"
            or result.get("evidenceSha256") != request["evidenceSha256"]
            or any(result.get(key) != value for key, value in request["bindings"].items())):
        raise ParcelUnavailable("Invalid parcel binding")
    scores = result.get("probabilities")
    if (not isinstance(scores, list) or len(scores) != 2
            or any(not _number(p) or not 0 <= p <= 1 for p in scores)
            or not math.isclose(sum(scores), 1, abs_tol=1e-6)
            or not _number(result.get("confidence"))
            or not math.isclose(result["confidence"], max(scores), abs_tol=1e-6)
            or not _number(result.get("processingTimeMs"))
            or not 0 <= result["processingTimeMs"] <= 25000):
        raise ParcelUnavailable("Invalid parcel scores")
    expected_label = None if scores[0] == scores[1] else ("Normal" if scores[0] > scores[1] else "Damaged")
    expected_status = "abstained" if expected_label is None else "predicted"
    if (result.get("label") != expected_label or result.get("status") != expected_status
            or result.get("contrast") not in ("none", "clahe")
            or not isinstance(result.get("preprocessing"), str)
            or not 0 < len(result["preprocessing"]) <= 256):
        raise ParcelUnavailable("Invalid parcel decision")
    if gpu and (result["preprocessing"] != "rgb-letterbox224-v1" or result["contrast"] != "clahe"):
        raise ParcelUnavailable("Invalid parcel preparation")
    keys = ("requestId", "status", "label", "confidence", "probabilities",
            "confidenceMeaning", "model", "modelVersion", "preprocessing",
            "contrast", "evidenceSha256", "selectionSha256", "evaluationSha256",
            "processingTimeMs", "humanReviewRequired", "operationally_approved",
            "classOrder", "acceptanceSha256")
    return {key: result[key] for key in keys}


class ParcelExecutor:
    def __init__(self, *, timeout_seconds=25, manager_command=None):
        if not _number(timeout_seconds) or not 0 < timeout_seconds <= 25:
            raise ValueError("Parcel deadline must be in (0, 25]")
        self.timeout_seconds = timeout_seconds
        self._manager_command = manager_command or (
            lambda directory: [sys.executable, str(Path(__file__)), "_manage", str(directory)])
        self._busy = False

    @property
    def busy(self):
        return self._busy

    async def run(self, request_id, image_base64, configured_artifacts, cancel_event=None):
        began = time.monotonic()
        _uuid(request_id)
        data = _image(image_base64)
        return await self._execute(request_id, "predict", image_base64,
                                   hashlib.sha256(data).hexdigest(),
                                   configured_artifacts, cancel_event, began)

    async def audit(self, configured_artifacts, cancel_event=None):
        return await self._execute(str(uuid.uuid4()), "audit", None, None,
                                   configured_artifacts, cancel_event, time.monotonic())

    async def _execute(self, request_id, mode, image, evidence_hash, artifacts, cancel, began):
        if self._busy:
            raise ParcelBusy("Parcel worker busy")
        if cancel is not None and cancel.is_set():
            raise ParcelCancelled("Parcel request cancelled")
        self._busy = True
        directory = None
        manager = job = None
        try:
            bindings = _bindings(artifacts)
            directory = runtime.create_run_directory(REQUEST_ROOT / request_id)
            job = runtime._ProcessJob()
            request = dict(requestId=request_id, mode=mode, imageBase64=image,
                           evidenceSha256=evidence_hash, bindings=bindings,
                           **_artifact_request(artifacts))
            runtime.write_json_exclusive(directory / "owner.json",
                                         dict(pid=os.getpid(), jobName=job.name))
            runtime.write_json_exclusive(directory / "input.json", request)
            # Only pass a minimal inherited process environment; service tokens
            # never enter child environments, request files, or worker logs.
            environment = {key: value for key, value in os.environ.items()
                           if key.upper() in {"SYSTEMROOT", "WINDIR", "PATH",
                                              "PATHEXT", "COMSPEC", "TEMP", "TMP"}}
            manager = subprocess.Popen(self._manager_command(directory), cwd=ROOT,
                env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, creationflags=4)
            job.assign(manager)
            job.resume(manager)
            while manager.poll() is None:
                if cancel is not None and cancel.is_set():
                    raise ParcelCancelled("Parcel request cancelled")
                if time.monotonic() - began >= self.timeout_seconds:
                    raise ParcelTimeout("Parcel execution deadline")
                await asyncio.sleep(.02)
            if cancel is not None and cancel.is_set():
                raise ParcelCancelled("Parcel request cancelled")
            if time.monotonic() - began >= self.timeout_seconds:
                raise ParcelTimeout("Parcel execution deadline")
            outcome = _json(directory / "manager.json", 4096)
            if outcome.get("status") == "busy":
                raise ParcelBusy("Parcel worker busy")
            if manager.returncode != 0 or outcome.get("status") != "success":
                if outcome.get("reason") in ("wall_timeout", "fit_timeout"):
                    raise ParcelTimeout("Parcel execution deadline")
                raise ParcelUnavailable("Parcel execution unavailable")
            result = _validate_result(_json(directory / "response.json", 16384), request)
            if _bindings(artifacts) != bindings:
                raise ParcelUnavailable("Parcel artifacts changed")
        except (ParcelRuntimeError, asyncio.CancelledError):
            raise
        except Exception:
            raise ParcelUnavailable("Parcel execution unavailable") from None
        finally:
            try:
                if job:
                    # Awaiting a shielded cleanup prevents caller cancellation
                    # from releasing admission while a descendant still runs.
                    cleanup = asyncio.create_task(self._reap(job, manager, request_id))
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        await cleanup
                        raise
            finally:
                try:
                    if directory is not None:
                        _cleanup(directory)
                finally:
                    self._busy = False
        elapsed = time.monotonic() - began
        if elapsed >= self.timeout_seconds:
            raise ParcelTimeout("Parcel execution deadline")
        result["totalProcessingTimeMs"] = elapsed * 1000
        return result

    async def _reap(self, job, manager, request_id):
        try:
            job.terminate()
            # Assignment can fail before the suspended manager joins the Job.
            # Kill the direct handle too, then reap it asynchronously.
            if manager is not None and manager.poll() is None:
                manager.kill()
            # Query the Job, not a parent tree: an exited manager can leave
            # descendants reparented, but they remain members of this Job.
            while job.pids() or (manager is not None and manager.poll() is None):
                await asyncio.sleep(.01)
            if manager is not None:
                manager.wait(timeout=0)
            while not _release_job_marker(request_id):
                await asyncio.sleep(.01)
        finally:
            job.close()


class _DrainingSupervisor(runtime.ResourceSupervisor):
    """Retain a query handle to verify all inner Job members have exited.

    TerminateJobObject initiates termination; it does not promise that every
    process has exited when the call returns. Holding the repository mutex
    through this drain prevents an admission overlap on successful completion.
    The outer HTTP Job still handles a crashed manager or a request deadline.
    """
    def __init__(self, directory, limits):
        super().__init__(directory, limits)
        self._query_handle = None
        self._kernel = _kernel()
        self._kernel.OpenJobObjectW.argtypes = [W.DWORD, W.BOOL, W.LPCWSTR]
        self._kernel.OpenJobObjectW.restype = W.HANDLE
        self._kernel.QueryInformationJobObject.argtypes = [
            W.HANDLE, ctypes.c_int, ctypes.c_void_p, W.DWORD, ctypes.c_void_p]

    def preflight(self, *args, **kwargs):
        if self._job is not None and self._query_handle is None:
            self._query_handle = self._kernel.OpenJobObjectW(4, False, self._job.name)
            if not self._query_handle:
                raise runtime.RuntimeSafetyError("Job drain monitor unavailable")
        return super().preflight(*args, **kwargs)

    def drain(self):
        if self._query_handle is None:
            return
        try:
            while _job_active(self._kernel, self._query_handle):
                time.sleep(.01)
        finally:
            self._kernel.CloseHandle(self._query_handle)
            self._query_handle = None


def manage(directory, *, worker_command=None, limits=None):
    """Synchronous disposable manager; injection is Python-only for tiny tests."""
    directory = _directory(directory)
    try:
        with _Mutex():
            _admit_job(directory)
            _sweep(directory)
            supervisor = _DrainingSupervisor(directory, limits or parcel_limits())
            command = (worker_command or (
                lambda path: [sys.executable, str(Path(__file__)), "_infer", str(path)]
            ))(directory)
            try:
                result = supervisor.run(command, fit_id="worker", cwd=ROOT)
            finally:
                supervisor.drain()
            reason = result.get("reason")
            safe_reason = reason if reason in ("wall_timeout", "fit_timeout") else "resource_or_worker"
            runtime.write_json_exclusive(directory / "manager.json",
                dict(status=result["status"], reason=safe_reason if reason else None))
    except ParcelBusy:
        runtime.write_json_exclusive(directory / "manager.json", dict(status="busy"))


def infer(directory):
    # This must precede heavy imports AND all image/file decoding.
    runtime.require_supervised_worker()
    directory = _directory(directory)
    import parcel_train
    parcel_train.worker_environment(directory)
    request = _json(directory / "input.json", MAX_BASE64_CHARS + 8192)
    _uuid(request["requestId"])
    if request["requestId"] != directory.name:
        raise ParcelUnavailable("Foreign parcel request")
    artifacts = _request_artifacts(request)
    if _bindings(artifacts) != request["bindings"]:
        raise ParcelUnavailable("Parcel artifacts changed")
    gpu = type(artifacts) is ParcelGPUArtifacts
    if gpu:
        import parcel_gpu_serving as serving
    else:
        import parcel_serving as serving
    try:
        if request["mode"] == "audit":
            result = (serving.audit_descriptor(request["descriptor"], request["descriptorSha256"]) if gpu
                      else serving.audit(request["selection"], request["testDirectory"]))
        elif request["mode"] == "predict":
            data = _image(request["imageBase64"])
            if hashlib.sha256(data).hexdigest() != request["evidenceSha256"]:
                raise ParcelInvalidInput("Image hash changed")
            result = (serving.predict_image(data, request["descriptor"], request["descriptorSha256"]) if gpu
                      else serving.predict_image(data, request["selection"], request["testDirectory"]))
        else:
            raise ParcelUnavailable("Invalid parcel mode")
    except ValueError as error:
        if str(error) in ("Invalid image or image dimension below 64 pixels",
                          "Parcel image exceeds 24 megapixels"):
            result = dict(error="invalid_input")
        else:
            result = dict(error="unavailable")
    except ParcelInvalidInput:
        result = dict(error="invalid_input")
    if _bindings(artifacts) != request["bindings"]:
        raise ParcelUnavailable("Parcel artifacts changed")
    result["requestId"] = request["requestId"]
    runtime.write_json_exclusive(directory / "response.json", result)


def main():
    try:
        if len(sys.argv) != 3:
            return 2
        if sys.argv[1] == "_manage":
            manage(Path(sys.argv[2]))
        elif sys.argv[1] == "_infer":
            infer(Path(sys.argv[2]))
        else:
            return 2
        return 0
    except Exception:
        # Inner validation/OS errors may carry private artifact paths.
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
