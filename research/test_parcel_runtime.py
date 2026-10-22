"""Real tiny-process tests; no TensorFlow, image decoder or model is loaded."""
import asyncio
import base64
import ctypes
from dataclasses import FrozenInstanceError
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import types
import unittest
import uuid
from unittest.mock import patch

try:
    import parcel_runtime as parcel
except ImportError:
    parcel = None

ROOT = Path(__file__).resolve().parents[1]
IMAGE = base64.b64encode(b"tiny encoded image fixture").decode()


def alive(pid):
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.restype = ctypes.c_void_p
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        return False
    try:
        code = ctypes.c_ulong()
        kernel.GetExitCodeProcess(ctypes.c_void_p(handle), ctypes.byref(code))
        return code.value == 259
    finally:
        kernel.CloseHandle(ctypes.c_void_p(handle))


def fixture_manager():
    import parcel_runtime as runtime
    import runner_runtime
    directory, scenario, marker = sys.argv[2:5]
    limits = runtime.parcel_limits()
    # Constructor/function injection only: production CLI has no fixture flags.
    if scenario == "disk":
        from dataclasses import replace
        limits = replace(limits, min_free_disk_bytes=2**60)
    if scenario == "output":
        from dataclasses import replace
        limits = replace(limits, max_output_bytes=30000)
    if scenario == "memory_start":
        from dataclasses import replace
        limits = replace(limits, min_available_bytes=2**60)
    if scenario == "memory_floor":
        from dataclasses import replace
        limits = replace(limits, available_floor_bytes=2**60)
    if scenario == "rss":
        from dataclasses import replace
        limits = replace(limits, max_rss_bytes=100 * 1024**2)
    if scenario == "delayed_termination":
        import threading
        kernel = ctypes.WinDLL("kernel32")
        kernel.OpenJobObjectW.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_wchar_p]
        kernel.OpenJobObjectW.restype = ctypes.c_void_p
        def delayed_termination(job):
            handle = kernel.OpenJobObjectW(8, False, job.name)
            def terminate():
                kernel.TerminateJobObject(ctypes.c_void_p(handle), 137)
                kernel.CloseHandle(ctypes.c_void_p(handle))
            # Model asynchronous native Job termination while keeping actual
            # child processes and Job membership/termination real.
            threading.Timer(.3, terminate).start()
        runner_runtime._ProcessJob.terminate = delayed_termination
    if scenario in ("success_child", "delayed_termination"):
        release = runtime._Mutex.__exit__
        def checked_release(self, *args):
            recorded = json.loads(Path(marker).read_text())
            recorded["child_alive_at_mutex_release"] = alive(recorded["child"])
            Path(marker).write_text(json.dumps(recorded))
            return release(self, *args)
        runtime._Mutex.__exit__ = checked_release
    runtime.manage(Path(directory), worker_command=lambda path: [
        sys.executable, __file__, "_fixture_worker", str(path), scenario, marker
    ], limits=limits)


def fixture_worker():
    import runner_runtime
    runner_runtime.require_supervised_worker()
    directory, scenario, marker = Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4])
    request = json.loads((directory / "input.json").read_text())
    child = None
    if scenario in {"hang", "crash", "success_child", "delayed_termination"}:
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    if scenario == "rss":
        allocation = bytearray(140 * 1024**2)
        time.sleep(60)
    marker.write_text(json.dumps(dict(manager=os.getppid(), worker=os.getpid(),
                                     child=child.pid if child else None)))
    if scenario == "crash":
        kernel = ctypes.WinDLL("kernel32")
        kernel.OpenProcess.restype = ctypes.c_void_p
        handle = kernel.OpenProcess(1, False, os.getppid())
        kernel.TerminateProcess(ctypes.c_void_p(handle), 17)
        time.sleep(60)
    if scenario == "hang":
        time.sleep(60)
    if scenario == "output":
        (directory / "worker.stdout.log").open("ab").write(b"x" * 60000)
        time.sleep(60)
    if request["mode"] == "audit":
        result = dict(status="artifact_ready", operationally_approved=False,
                      model=dict(model="MobileNetV2", modelVersion="a" * 64,
                                 artifact="C:/private/path", selection_sha256=request["bindings"]["selectionSha256"],
                                 report_sha256=request["bindings"]["evaluationSha256"]))
    else:
        result = dict(status="predicted", label="Normal", confidence=0.8,
                      probabilities=[0.8, 0.2], confidenceMeaning="uncalibrated",
                      model="MobileNetV2", modelVersion="a" * 64,
                      preprocessing="rgb-letterbox-224", contrast="none",
                      evidenceSha256=request["evidenceSha256"],
                      selectionSha256=request["bindings"]["selectionSha256"],
                      evaluationSha256=request["bindings"]["evaluationSha256"],
                      processingTimeMs=1.0, humanReviewRequired=True,
                      operationally_approved=False, classOrder=["Normal", "Damaged"],
                      acceptanceSha256=None)
    result["requestId"] = request["requestId"]
    if scenario == "foreign":
        result["requestId"] = str(uuid.uuid4())
    elif scenario == "hash":
        result["evidenceSha256"] = "b" * 64
    elif scenario == "model":
        result["modelVersion"] = "b" * 64
    elif scenario == "probabilities":
        result["probabilities"] = [0.8, 0.8]
    elif scenario == "approved":
        result["operationally_approved"] = True
    elif scenario == "tie":
        result.update(status="abstained", label=None, confidence=0.5, probabilities=[0.5, 0.5])
    elif scenario == "nan":
        result["confidence"] = float("nan")
    elif scenario == "bad_status":
        result["status"] = "ready"
    elif scenario == "evaluation":
        result["evaluationSha256"] = "b" * 64
    elif scenario == "selection":
        result["selectionSha256"] = "b" * 64
    elif scenario == "oversized_response":
        result["unexpected"] = "x" * 17000
    elif scenario == "secrets":
        assert "AI_SERVICE_TOKEN" not in os.environ
        assert "FIREBASE_PRIVATE_KEY" not in os.environ
    elif scenario == "changed_selection":
        with Path(request["selection"]).open("a") as output:
            output.write(" ")
    if scenario == "malformed":
        (directory / "response.json").write_text("{")
    elif scenario == "nan":
        (directory / "response.json").write_text(json.dumps(result))
    else:
        runner_runtime.write_json_exclusive(directory / "response.json", result)


class ParcelWireContractTests(unittest.TestCase):
    def setUp(self):
        self.request = dict(requestId=str(uuid.uuid4()), mode="infer", evidenceSha256="a" * 64,
                            bindings=dict(modelVersion="b" * 64, selectionSha256="c" * 64,
                                          evaluationSha256="d" * 64))
        self.result = dict(requestId=self.request["requestId"], status="predicted", label="Normal",
                           probabilities=[.8, .2], confidence=.8, confidenceMeaning="uncalibrated",
                           model="MobileNetV2", evidenceSha256="a" * 64, **self.request["bindings"],
                           preprocessing="rgb-letterbox-224", contrast="none", processingTimeMs=1.,
                           humanReviewRequired=True, operationally_approved=False,
                           classOrder=["Normal", "Damaged"], acceptanceSha256=None)

    def test_unaccepted_runtime_preserves_explicit_class_order_and_null_acceptance(self):
        result = parcel._validate_result(self.result, self.request)
        self.assertEqual(result["classOrder"], ["Normal", "Damaged"])
        self.assertIn("acceptanceSha256", result)
        self.assertIsNone(result["acceptanceSha256"])

    def test_runtime_rejects_missing_reordered_or_self_declared_approval_fields(self):
        for field, value in (("classOrder", None), ("classOrder", ["Damaged", "Normal"]),
                             ("acceptanceSha256", "e" * 64), ("acceptanceSha256", False)):
            with self.subTest(field=field, value=value):
                with self.assertRaises(parcel.ParcelUnavailable):
                    parcel._validate_result({**self.result, field: value}, self.request)
        for field in ("classOrder", "acceptanceSha256"):
            value = self.result.copy()
            del value[field]
            with self.subTest(missing=field), self.assertRaises(parcel.ParcelUnavailable):
                parcel._validate_result(value, self.request)


class ParcelGPUTransportTests(unittest.TestCase):
    """Artificial metadata and native/model boundaries; never start a process."""
    def setUp(self):
        self.assertTrue(hasattr(parcel, "ParcelGPUArtifacts"), "explicit GPU artifact type required")
        base = ROOT / "research/datasets/parcel-runtime-pure-tests"
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name).resolve()
        self.descriptor = self.directory / "descriptor.json"
        self.descriptor.write_text('{"artificial":"descriptor"}')
        self.pin = hashlib.sha256(self.descriptor.read_bytes()).hexdigest()
        self.artifacts = parcel.ParcelGPUArtifacts(self.descriptor, self.pin)
        self.bindings = dict(modelVersion="a" * 64, selectionSha256=self.pin,
                             evaluationSha256="c" * 64)
        self.path_check = patch.object(parcel.runtime, "_validate_output_path", side_effect=lambda path: Path(path).resolve())
        self.path_check.start(); self.addCleanup(self.path_check.stop)
        self.adapter = types.SimpleNamespace(descriptor_bindings=self.read_bindings)
        self.modules = patch.dict(sys.modules, parcel_gpu_serving=self.adapter)
        self.modules.start(); self.addCleanup(self.modules.stop)

    def read_bindings(self, path, pin):
        if hashlib.sha256(Path(path).read_bytes()).hexdigest() != pin:
            raise ValueError("Descriptor changed")
        return dict(self.bindings)

    def envelope(self):
        return dict(requestId=str(uuid.uuid4()), mode="predict", imageBase64=IMAGE,
                    evidenceSha256=hashlib.sha256(base64.b64decode(IMAGE)).hexdigest(),
                    bindings=dict(self.bindings), artifactKind="gpu-descriptor-v2",
                    descriptor=str(self.descriptor), descriptorSha256=self.pin)

    def response(self, request):
        return dict(status="predicted", label="Normal", confidence=.8, probabilities=[.8,.2],
                    confidenceMeaning="uncalibrated", model="MobileNetV2", **request["bindings"],
                    preprocessing="rgb-letterbox224-v1", contrast="clahe",
                    evidenceSha256=request["evidenceSha256"], processingTimeMs=1.,
                    humanReviewRequired=True, operationally_approved=False,
                    classOrder=["Normal","Damaged"], acceptanceSha256=None)

    def test_gpu_identity_is_frozen_and_serializes_only_explicit_gpu_fields(self):
        with self.assertRaises(FrozenInstanceError):self.artifacts.descriptor_sha256 = "f" * 64
        self.assertEqual(parcel._artifact_request(self.artifacts),
            dict(artifactKind="gpu-descriptor-v2", descriptor=str(self.descriptor), descriptorSha256=self.pin))
        self.assertEqual(parcel._bindings(self.artifacts), self.bindings)

    def test_legacy_identity_retains_its_metadata_binding_and_explicit_tag(self):
        selection=self.directory/"selection.json";selection.write_text(json.dumps(dict(selected=[
            dict(architecture="mobilenetv2",artifact_sha256="b"*64)])))
        report=self.directory/"report.json";report.write_text('{"status":"complete"}')
        artifacts=parcel.ParcelArtifacts(selection,self.directory)
        self.assertEqual(parcel._artifact_request(artifacts),dict(artifactKind="legacy-selection-v1",
            selection=str(selection),testDirectory=str(self.directory)))
        self.assertEqual(parcel._bindings(artifacts),dict(modelVersion="b"*64,
            selectionSha256=hashlib.sha256(selection.read_bytes()).hexdigest(),
            evaluationSha256=hashlib.sha256(report.read_bytes()).hexdigest()))

    def test_unknown_mixed_and_malformed_artifact_types_never_select_a_branch(self):
        class Mixed(parcel.ParcelGPUArtifacts):pass
        invalid=[None,{},types.SimpleNamespace(descriptor_path=self.descriptor,descriptor_sha256=self.pin),
            Mixed(self.descriptor,self.pin),parcel.ParcelGPUArtifacts(str(self.descriptor),self.pin),
            parcel.ParcelGPUArtifacts(Path("relative.json"),self.pin)]
        invalid += [parcel.ParcelGPUArtifacts(self.descriptor,pin) for pin in (None,True,"",self.pin.upper(),"a"*63,"a"*64+"\n")]
        for value in invalid:
            with self.subTest(value=value),self.assertRaises(parcel.ParcelUnavailable):parcel._artifact_request(value)

    def test_gpu_reader_cannot_return_foreign_extra_or_malformed_bindings(self):
        for value in ({},dict(self.bindings,extra="f"*64),dict(self.bindings,selectionSha256="b"*64),
                      dict(self.bindings,modelVersion=True)):
            self.adapter.descriptor_bindings=lambda *args,value=value:value
            with self.subTest(value=value),self.assertRaises(parcel.ParcelUnavailable):parcel._bindings(self.artifacts)

    def test_private_envelope_rejects_mixed_unknown_and_untagged_gpu_fields(self):
        good=self.envelope()
        self.assertEqual(parcel._request_artifacts(good),self.artifacts)
        cases=[dict(good,selection="legacy"),dict(good,testDirectory="legacy"),dict(good,artifactKind="foreign"),
               dict(good,descriptorSha256="A"*64),dict(good,descriptor=None),dict(good,unexpected=True)]
        cases.append({k:v for k,v in good.items() if k!="artifactKind"})
        for value in cases:
            with self.subTest(value=value),self.assertRaises(parcel.ParcelUnavailable):parcel._request_artifacts(value)
        legacy={k:v for k,v in good.items() if k not in ("artifactKind","descriptor","descriptorSha256")}
        legacy.update(selection=str(self.directory/"selection.json"),testDirectory=str(self.directory))
        self.assertEqual(parcel._request_artifacts(legacy),parcel.ParcelArtifacts(Path(legacy["selection"]),self.directory))

    def test_gpu_wire_requires_exact_preparation_and_keeps_closed_fields(self):
        request=self.envelope();result=dict(self.response(request),requestId=request["requestId"])
        result["privatePath"]="C:/private/never-return"
        checked=parcel._validate_result(result,request)
        self.assertNotIn("privatePath",checked);self.assertEqual(len(checked),18)
        self.assertIsNone(checked["acceptanceSha256"]);self.assertFalse(checked["operationally_approved"])
        for change in (dict(contrast="none"),dict(preprocessing="rgb-letterbox-224"),dict(humanReviewRequired=False)):
            with self.subTest(change=change),self.assertRaises(parcel.ParcelUnavailable):
                parcel._validate_result(dict(result,**change),request)

    def invoke_worker(self, request, *, mutate=False, legacy=False):
        directory=self.directory/request["requestId"];directory.mkdir()
        (directory/"input.json").write_text(json.dumps(request));events=[]
        def environment(path):events.append("environment")
        def predict(*args):
            self.assertEqual(events,["supervised","environment"])
            self.assertEqual(args,(base64.b64decode(IMAGE),request["descriptor"],request["descriptorSha256"]))
            if mutate:self.descriptor.write_text("changed")
            return self.response(request)
        def audit(*args):
            self.assertEqual(events,["supervised","environment"])
            self.assertEqual(args,(request["descriptor"],request["descriptorSha256"]))
            return dict(status="artifact_ready",operationally_approved=False,
                model=dict(model="MobileNetV2",modelVersion="a"*64,selection_sha256=self.pin,report_sha256="c"*64))
        self.adapter.predict_image=predict;self.adapter.audit_descriptor=audit
        with patch.object(parcel.runtime,"require_supervised_worker",side_effect=lambda:events.append("supervised")),\
             patch.object(parcel,"_directory",return_value=directory),\
             patch.dict(sys.modules,parcel_train=types.SimpleNamespace(worker_environment=environment)):
            parcel.infer(directory)
        return json.loads((directory/"response.json").read_text())

    def test_gpu_worker_predict_and_audit_dispatch_after_containment_environment(self):
        request=self.envelope();response=self.invoke_worker(request)
        self.assertEqual(response["requestId"],request["requestId"]);self.assertEqual(response["label"],"Normal")
        request=self.envelope();request["mode"]="audit";response=self.invoke_worker(request)
        self.assertEqual(response["status"],"artifact_ready");self.assertFalse(response["operationally_approved"])

    def test_legacy_worker_keeps_selection_dispatch_with_or_without_its_explicit_tag(self):
        selection=self.directory/"selection.json";selection.write_text(json.dumps(dict(selected=[
            dict(architecture="mobilenetv2",artifact_sha256="a"*64)])))
        (self.directory/"report.json").write_text('{"status":"complete"}')
        bindings=parcel._bindings(parcel.ParcelArtifacts(selection,self.directory))
        for tagged in (False,True):
            request=self.envelope()
            for key in ("artifactKind","descriptor","descriptorSha256"):request.pop(key)
            request.update(bindings=bindings,selection=str(selection),testDirectory=str(self.directory))
            if tagged:request["artifactKind"]="legacy-selection-v1"
            directory=self.directory/request["requestId"];directory.mkdir()
            (directory/"input.json").write_text(json.dumps(request));events=[]
            def predict(data,path,test):
                self.assertEqual(events,["environment"])
                self.assertEqual((data,path,test),(base64.b64decode(IMAGE),str(selection),str(self.directory)))
                return self.response(request)
            with patch.object(parcel.runtime,"require_supervised_worker"),patch.object(parcel,"_directory",return_value=directory),\
                 patch.dict(sys.modules,parcel_serving=types.SimpleNamespace(predict_image=predict),
                            parcel_train=types.SimpleNamespace(worker_environment=lambda path:events.append("environment"))):
                parcel.infer(directory)
            self.assertEqual(json.loads((directory/"response.json").read_text())["requestId"],request["requestId"])

    def test_worker_rejects_pre_post_binding_drift_and_changed_encoded_evidence(self):
        for case in ("pre","post","evidence"):
            request=self.envelope()
            if case=="pre":request["bindings"]["evaluationSha256"]="f"*64
            elif case=="evidence":request["evidenceSha256"]="f"*64
            with self.subTest(case=case):
                if case=="evidence":
                    response=self.invoke_worker(request);self.assertEqual(response.get("error"),"invalid_input")
                else:
                    with self.assertRaises(parcel.ParcelUnavailable):self.invoke_worker(request,mutate=case=="post")
            self.descriptor.write_text('{"artificial":"descriptor"}')

    def test_unsupervised_infer_never_imports_worker_or_adapter(self):
        import builtins
        original=builtins.__import__;seen=[]
        def importing(name,*args,**kwargs):
            if name in ("parcel_train","parcel_gpu_serving","parcel_serving"):seen.append(name)
            return original(name,*args,**kwargs)
        with patch.object(parcel.runtime,"require_supervised_worker",side_effect=RuntimeError("unsupervised")),\
             patch.object(builtins,"__import__",side_effect=importing):
            with self.assertRaisesRegex(RuntimeError,"unsupervised"):parcel.infer(self.directory)
        self.assertEqual(seen,[])


class ParcelGPUExecutorTests(unittest.TestCase):
    """The real executor with fake OS process boundaries, never Popen/Win32."""
    def setUp(self):
        base=ROOT/"research/datasets/parcel-runtime-pure-tests";base.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=base);self.addCleanup(self.temp.cleanup)
        self.directory=Path(self.temp.name).resolve();self.descriptor=self.directory/"descriptor.json"
        self.descriptor.write_text('{"fixture":"gpu"}')
        self.pin=hashlib.sha256(self.descriptor.read_bytes()).hexdigest()
        self.artifacts=parcel.ParcelGPUArtifacts(self.descriptor,self.pin)
        self.bindings=dict(modelVersion="a"*64,selectionSha256=self.pin,evaluationSha256="c"*64)
        self.requests=[];self.events=[];self.environments=[]

    async def execute(self, scenario="predict"):
        async def cleanup(awaitable):return await awaitable
        def bindings(path,pin):
            if hashlib.sha256(Path(path).read_bytes()).hexdigest()!=pin:raise ValueError("changed")
            return dict(self.bindings)
        def spawn(command,**kwargs):
            directory=Path(command[-1]);request=json.loads((directory/"input.json").read_text())
            self.requests.append(request);self.environments.append(kwargs["env"])
            if request["mode"]=="audit":
                result=dict(status="artifact_ready",operationally_approved=False,model=dict(model="MobileNetV2",
                    modelVersion="a"*64,selection_sha256=self.pin,report_sha256="c"*64,artifact="private/path"))
            else:result=ParcelGPUTransportTests.response(self,request)
            result["requestId"]=request["requestId"]
            if scenario=="evidence":result["evidenceSha256"]="f"*64
            parcel.runtime.write_json_exclusive(directory/"response.json",result)
            parcel.runtime.write_json_exclusive(directory/"manager.json",dict(status="success"))
            if scenario=="drift":self.descriptor.write_text("changed")
            return types.SimpleNamespace(returncode=0,poll=lambda:0,wait=lambda timeout:0)
        job=types.SimpleNamespace(name="Local\\IILASNativeRunner-artificial",assign=lambda proc:self.events.append("assigned"),
            resume=lambda proc:self.events.append("resumed"),terminate=lambda:self.events.append("terminated"),
            pids=lambda:[],close=lambda:self.events.append("closed"))
        executor=parcel.ParcelExecutor()
        with patch.object(parcel,"REQUEST_ROOT",self.directory/"requests"),\
             patch.object(parcel.runtime,"_validate_output_path",side_effect=lambda path,*args:Path(path).resolve()),\
             patch.object(parcel.runtime,"_ProcessJob",return_value=job),patch.object(parcel.subprocess,"Popen",side_effect=spawn),\
             patch.object(parcel,"_release_job_marker",return_value=True),\
             patch.object(parcel.asyncio,"create_task",side_effect=lambda awaitable:awaitable),\
             patch.object(parcel.asyncio,"shield",side_effect=cleanup),\
             patch.dict(sys.modules,parcel_gpu_serving=types.SimpleNamespace(descriptor_bindings=bindings)),\
             patch.dict(os.environ,AI_SERVICE_TOKEN="artificial",FIREBASE_PRIVATE_KEY="artificial"):
            try:
                if scenario=="audit":return await executor.audit(self.artifacts)
                return await executor.run(str(uuid.uuid4()),IMAGE,self.artifacts)
            finally:
                self.assertFalse(executor.busy)
                requests=self.directory/"requests"
                self.assertFalse(requests.exists() and any(requests.iterdir()))

    def run_coroutine(self, coroutine):
        # Fake processes are already terminal and cleanup has no suspension;
        # drive the real coroutine without opening Windows asyncio sockets.
        try:
            coroutine.send(None)
        except StopIteration as completed:
            return completed.value
        finally:
            coroutine.close()
        self.fail("Unexpected asynchronous I/O in the pure executor fixture")

    def test_existing_executor_serializes_gpu_branch_and_returns_only_safe_wire_fields(self):
        result=self.run_coroutine(self.execute())
        request=self.requests[0]
        self.assertEqual({k:request[k] for k in ("artifactKind","descriptor","descriptorSha256")},
            dict(artifactKind="gpu-descriptor-v2",descriptor=str(self.descriptor),descriptorSha256=self.pin))
        self.assertNotIn("selection",request);self.assertNotIn("testDirectory",request)
        self.assertEqual(result["label"],"Normal");self.assertIsNone(result["acceptanceSha256"])
        self.assertFalse(result["operationally_approved"]);self.assertIn("totalProcessingTimeMs",result)
        self.assertEqual(self.events,["assigned","resumed","terminated","closed"])
        self.assertNotIn("AI_SERVICE_TOKEN",self.environments[0]);self.assertNotIn("FIREBASE_PRIVATE_KEY",self.environments[0])

    def test_existing_audit_strips_private_adapter_paths(self):
        result=self.run_coroutine(self.execute("audit"))
        self.assertEqual(result["status"],"artifact_ready");self.assertNotIn("artifact",result["model"])
        self.assertFalse(result["operationally_approved"])

    def test_existing_executor_rejects_post_binding_and_evidence_drift_and_still_cleans(self):
        for scenario in ("drift","evidence"):
            with self.subTest(scenario=scenario),self.assertRaises(parcel.ParcelUnavailable):self.run_coroutine(self.execute(scenario))
            self.assertEqual(self.events[-2:],["terminated","closed"])
            self.descriptor.write_text('{"fixture":"gpu"}')


@unittest.skipUnless(os.name == "nt", "Windows Job/mutex integration")
class ParcelRuntimeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.assertIsNotNone(parcel, "bounded parcel executor must exist")
        base = ROOT / "research/datasets/parcel-runtime-tests"
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.selection = self.directory / "selection.json"
        self.selection.write_text(json.dumps(dict(selected=[
            dict(architecture="mobilenetv2", artifact_sha256="a" * 64)])))
        (self.directory / "report.json").write_text('{"status":"complete"}')
        self.artifacts = parcel.ParcelArtifacts(self.selection, self.directory)
        self.markers = []
        self.requests = []

    def executor(self, scenario="success", timeout=10):
        marker = self.directory / (uuid.uuid4().hex + ".pid.json")
        self.markers.append(marker)
        return parcel.ParcelExecutor(
            timeout_seconds=timeout,
            manager_command=lambda directory: [sys.executable, __file__,
                "_fixture_manager", str(directory), scenario, str(marker)])

    async def run_request(self, executor, cancel=None, image=IMAGE):
        request_id = str(uuid.uuid4())
        self.requests.append(request_id)
        return await executor.run(request_id, image, self.artifacts, cancel)

    async def wait_marker(self, marker):
        for _ in range(250):
            if marker.exists():
                return json.loads(marker.read_text())
            await asyncio.sleep(.02)
        self.fail("tiny worker did not start")

    def assert_clean(self):
        for request in self.requests:
            self.assertFalse((parcel.REQUEST_ROOT / request).exists())

    async def test_success_binds_request_and_cleans_input(self):
        result = await self.run_request(self.executor())
        self.assertEqual(result["label"], "Normal")
        self.assertEqual(result["requestId"], self.requests[0])
        self.assertEqual(result["evidenceSha256"], hashlib.sha256(base64.b64decode(IMAGE)).hexdigest())
        self.assertFalse(result["operationally_approved"])
        self.assertGreaterEqual(result["totalProcessingTimeMs"], 1)
        self.assert_clean()

    async def test_total_timing_includes_input_validation_and_cleanup(self):
        original = parcel._image
        def delayed_image(value):
            time.sleep(.25)
            return original(value)
        began = time.monotonic()
        with patch.object(parcel, "_image", side_effect=delayed_image):
            result = await self.run_request(self.executor())
        elapsed = (time.monotonic() - began) * 1000
        self.assertLess(abs(elapsed - result["totalProcessingTimeMs"]), 60)

    async def test_ties_remain_abstained(self):
        result = await self.run_request(self.executor("tie"))
        self.assertEqual((result["status"], result["label"]), ("abstained", None))

    async def test_audit_redacts_paths_and_remains_unapproved(self):
        result = await self.executor().audit(self.artifacts)
        self.assertEqual(result["status"], "artifact_ready")
        self.assertNotIn("artifact", result["model"])
        self.assertFalse(result["operationally_approved"])

    async def test_corrupt_foreign_and_unapproved_outputs_fail_closed(self):
        for scenario in ("malformed", "foreign", "hash", "model", "probabilities",
                         "approved", "nan", "bad_status", "evaluation", "selection",
                         "oversized_response"):
            with self.subTest(scenario=scenario):
                with self.assertRaises(parcel.ParcelUnavailable):
                    await self.run_request(self.executor(scenario))
                self.assert_clean()

    async def test_cancel_terminates_manager_worker_and_descendant(self):
        cancel = asyncio.Event()
        executor = self.executor("hang")
        task = asyncio.create_task(self.run_request(executor, cancel))
        pids = await self.wait_marker(self.markers[-1])
        cancel.set()
        with self.assertRaises(parcel.ParcelCancelled):
            await task
        for pid in pids.values():
            self.assertFalse(alive(pid), f"orphan PID {pid}")
        self.assert_clean()

    async def test_task_cancellation_also_reaps_tree(self):
        executor = self.executor("hang")
        task = asyncio.create_task(self.run_request(executor))
        pids = await self.wait_marker(self.markers[-1])
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertFalse(any(alive(pid) for pid in pids.values()))
        self.assert_clean()

    async def test_deadline_terminates_tree(self):
        executor = self.executor("hang", timeout=1.5)
        began = time.monotonic()
        with self.assertRaises(parcel.ParcelTimeout):
            await self.run_request(executor)
        pids = await self.wait_marker(self.markers[-1])
        self.assertFalse(any(alive(pid) for pid in pids.values()))
        self.assertLess(time.monotonic() - began, 5)
        self.assert_clean()

    async def test_cross_process_busy_is_nonblocking_and_slot_recovers(self):
        cancel = asyncio.Event()
        task = asyncio.create_task(self.run_request(self.executor("hang"), cancel))
        await self.wait_marker(self.markers[-1])
        began = time.monotonic()
        with self.assertRaises(parcel.ParcelBusy):
            await self.run_request(self.executor())
        self.assertLess(time.monotonic() - began, 3)
        cancel.set()
        with self.assertRaises(parcel.ParcelCancelled):
            await task
        self.assertEqual((await self.run_request(self.executor()))["status"], "predicted")
        self.assert_clean()

    async def test_manager_crash_reaps_descendants_and_abandoned_mutex_recovers(self):
        with self.assertRaises(parcel.ParcelUnavailable):
            await self.run_request(self.executor("crash"))
        pids = await self.wait_marker(self.markers[-1])
        self.assertFalse(any(alive(pid) for pid in pids.values()))
        self.assertEqual((await self.run_request(self.executor()))["status"], "predicted")
        self.assert_clean()

    async def test_resource_bounds_fail_closed_and_cleanup(self):
        for scenario in ("disk", "output", "memory_start", "memory_floor", "rss"):
            with self.subTest(scenario=scenario):
                with self.assertRaises(parcel.ParcelUnavailable):
                    await self.run_request(self.executor(scenario))
                self.assert_clean()

    async def test_successful_worker_descendant_is_reaped(self):
        result = await self.run_request(self.executor("success_child"))
        self.assertEqual(result["status"], "predicted")
        pids = await self.wait_marker(self.markers[-1])
        self.assertFalse(pids.pop("child_alive_at_mutex_release"))
        self.assertFalse(any(alive(pid) for pid in pids.values()))

    async def test_mutex_waits_for_asynchronous_job_termination(self):
        await self.run_request(self.executor("delayed_termination"))
        pids = await self.wait_marker(self.markers[-1])
        self.assertFalse(pids.pop("child_alive_at_mutex_release"),
                         "mutex released before descendant terminated")
        self.assertFalse(any(alive(pid) for pid in pids.values()))

    async def test_assignment_exception_reaps_suspended_manager(self):
        launched = []
        def cannot_assign(job, process):
            launched.append(process)
            raise OSError("assignment unavailable")
        try:
            with patch.object(parcel.runtime._ProcessJob, "assign", cannot_assign):
                with self.assertRaises(parcel.ParcelUnavailable):
                    await self.run_request(self.executor())
            self.assertTrue(launched)
            self.assertFalse(alive(launched[0].pid))
            self.assert_clean()
        finally:
            for process in launched:
                if process.poll() is None:
                    process.kill()
                    process.wait()

    async def test_abandoned_mutex_does_not_admit_over_active_prior_job(self):
        job = parcel.runtime._ProcessJob()
        process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"],
                                   creationflags=4)
        job.assign(process)
        job.resume(process)
        marker = parcel.REQUEST_ROOT / "active.json"
        with marker.open("x") as stream:
            json.dump(dict(requestId=str(uuid.uuid4()), jobName=job.name), stream)
        try:
            # No mutex owner remains, but the earlier Job still has a member.
            with self.assertRaises(parcel.ParcelBusy):
                await self.run_request(self.executor())
            job.terminate()
            process.wait(timeout=5)
            self.assertEqual((await self.run_request(self.executor()))["status"], "predicted")
        finally:
            job.terminate()
            process.wait(timeout=5)
            job.close()
            marker.unlink(missing_ok=True)

    async def test_marker_replacement_race_retries_without_overriding_cleanup(self):
        for error in (FileNotFoundError(), json.JSONDecodeError("partial", "{", 1)):
            with self.subTest(error=type(error).__name__):
                with patch.object(parcel._Mutex, "__enter__", side_effect=parcel.ParcelBusy()), \
                     patch.object(Path, "exists", return_value=True), \
                     patch.object(parcel, "_json", side_effect=error):
                    self.assertFalse(parcel._release_job_marker(str(uuid.uuid4())))

    async def test_service_secrets_do_not_enter_worker_environment(self):
        fixture_value = uuid.uuid4().hex
        with patch.dict(os.environ, AI_SERVICE_TOKEN=fixture_value, FIREBASE_PRIVATE_KEY=fixture_value):
            self.assertEqual((await self.run_request(self.executor("secrets")))["status"], "predicted")

    async def test_audit_unavailable_returns_safe_status(self):
        self.selection.unlink()
        with self.assertRaises(parcel.ParcelUnavailable) as caught:
            await self.executor().audit(self.artifacts)
        self.assertNotIn(str(self.directory), str(caught.exception))

    async def test_artifact_change_during_request_invalidates_result(self):
        with self.assertRaises(parcel.ParcelUnavailable):
            await self.run_request(self.executor("changed_selection"))
        self.assert_clean()

    async def test_abandoned_request_sweep_preserves_live_and_unknown_files(self):
        old = parcel.runtime.create_run_directory(parcel.REQUEST_ROOT / str(uuid.uuid4()))
        live = parcel.runtime.create_run_directory(parcel.REQUEST_ROOT / str(uuid.uuid4()))
        unknown = parcel.runtime.create_run_directory(parcel.REQUEST_ROOT / str(uuid.uuid4()))
        # Real exited PID avoids assuming any arbitrary PID is unused.
        finished = subprocess.Popen([sys.executable, "-c", "pass"])
        finished.wait()
        for directory, pid in ((old, finished.pid), (live, os.getpid()), (unknown, finished.pid)):
            (directory / "owner.json").write_text(json.dumps(dict(pid=pid)))
            (directory / "input.json").write_text("private image body")
            os.utime(directory, (time.time() - 120, time.time() - 120))
        (unknown / "keep.txt").write_text("unrecognized file")
        os.utime(unknown, (time.time() - 120, time.time() - 120))
        try:
            await self.run_request(self.executor())
            self.assertFalse(old.exists())
            self.assertTrue((live / "input.json").exists())
            self.assertEqual((unknown / "keep.txt").read_text(), "unrecognized file")
        finally:
            for directory in (old, live, unknown):
                for name in ("owner.json", "input.json", "keep.txt"):
                    (directory / name).unlink(missing_ok=True)
                if directory.exists():
                    directory.rmdir()

    async def test_same_executor_busy_and_pre_cancel_do_not_launch(self):
        executor = self.executor("hang")
        cancel = asyncio.Event()
        task = asyncio.create_task(self.run_request(executor, cancel))
        await self.wait_marker(self.markers[-1])
        self.assertTrue(executor.busy)
        with self.assertRaises(parcel.ParcelBusy):
            await self.run_request(executor)
        cancel.set()
        with self.assertRaises(parcel.ParcelCancelled):
            await task
        self.assertFalse(executor.busy)
        with self.assertRaises(parcel.ParcelCancelled):
            await self.run_request(self.executor(), cancel)
        self.assertFalse(self.markers[-1].exists())

    async def test_cleanup_refuses_path_outside_request_root(self):
        (self.directory / "input.json").write_text("keep")
        with self.assertRaises(parcel.ParcelRuntimeError):
            parcel._cleanup(self.directory)
        self.assertEqual((self.directory / "input.json").read_text(), "keep")

    async def test_import_does_not_load_image_or_ml_modules(self):
        source = ("import sys; import parcel_runtime; "
                  "assert not any(k in sys.modules for k in "
                  "('tensorflow','numpy','cv2','parcel_serving','parcel_train'))")
        result = subprocess.run([sys.executable, "-c", source], cwd=ROOT / "research",
                                capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr.decode())

    async def test_bad_base64_size_and_request_path_rejected_before_spawn(self):
        for data in ("", "!!!", "a" * 13981017):
            with self.assertRaises(parcel.ParcelInvalidInput):
                await self.run_request(self.executor(), image=data)
        with self.assertRaises(parcel.ParcelInvalidInput):
            await self.executor().run("../escape", IMAGE, self.artifacts)
        self.assertFalse(any(path.exists() for path in self.markers))
        self.assert_clean()

    async def test_unsupervised_worker_refuses_before_heavy_import(self):
        proc = await asyncio.create_subprocess_exec(
            sys.executable, str(Path(__file__).with_name("parcel_runtime.py")),
            "_infer", str(self.directory), stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await proc.communicate()
        self.assertNotEqual(proc.returncode, 0)
        self.assertNotIn(b"tensorflow", stdout.lower() + stderr.lower())


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "_fixture_manager":
        fixture_manager()
    elif len(sys.argv) > 1 and sys.argv[1] == "_fixture_worker":
        fixture_worker()
    else:
        unittest.main()
