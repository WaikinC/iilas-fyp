"""HTTP boundary tests; injected execution never loads a real parcel model."""
import asyncio
import base64
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from uuid import UUID
from unittest.mock import patch

import api

PARCEL_CONFIG_ENV = {name: "" for name in (
    "IILAS_PARCEL_SELECTION", "IILAS_PARCEL_TEST_DIRECTORY",
    "IILAS_PARCEL_GPU_DESCRIPTOR", "IILAS_PARCEL_GPU_DESCRIPTOR_SHA256")}


async def request(app, body=b"", *, token=b"Bearer test-token", headers=(),
                  chunks=None, disconnect=None, path="/predict", method="POST"):
    messages = []
    reads = 0
    chunks = list(chunks if chunks is not None else [body])

    async def receive():
        nonlocal reads
        reads += 1
        if chunks:
            chunk = chunks.pop(0)
            return {"type": "http.request", "body": chunk, "more_body": bool(chunks)}
        if disconnect:
            await disconnect.wait()
            return {"type": "http.disconnect"}
        await asyncio.Future()

    async def send(message):
        messages.append(message)

    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
             "scheme": "http", "method": method, "path": path, "raw_path": path.encode(),
             "query_string": b"", "root_path": "", "server": ("127.0.0.1", 8000),
             "client": ("127.0.0.1", 1234),
             "headers": [(b"content-type", b"application/json"), *headers]}
    if token is not None:
        scope["headers"].append((b"authorization", token))
    await app(scope, receive, send)
    status = next((m["status"] for m in messages if m["type"] == "http.response.start"), None)
    raw = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, json.loads(raw) if raw else None, reads


class HttpBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        asyncio.get_running_loop().slow_callback_duration = 1
        self.env = patch.dict(os.environ, {**PARCEL_CONFIG_ENV, "IILAS_RESEARCH_TOKEN": "test-token",
                                          "IILAS_PARCEL_SELECTION": "",
                                          "IILAS_PARCEL_TEST_DIRECTORY": ""})
        self.env.start()
        self.app = api.create_app()

    async def asyncTearDown(self):
        self.env.stop()

    async def test_bad_auth_does_not_read_even_malformed_body(self):
        for token in (None, b"Bearer wrong", b"Bearer \xff"):
            with self.subTest(token=token):
                status, _, reads = await request(self.app, b"{", token=token)
                self.assertEqual(status, 401)
                self.assertEqual(reads, 0)

    async def test_unconfigured_auth_does_not_read_body(self):
        with patch.dict(os.environ, {"IILAS_RESEARCH_TOKEN": ""}):
            app = api.create_app()
            status, _, reads = await request(app, b"{")
        self.assertEqual((status, reads), (503, 0))

    async def test_oversized_declared_length_rejected_without_body_read(self):
        status, _, reads = await request(self.app, b"{}", headers=[(b"content-length", b"14100001")])
        self.assertEqual((status, reads), (413, 0))

    async def test_chunked_limit_cannot_be_bypassed_by_missing_or_false_length(self):
        for headers in ([], [(b"content-length", b"2")]):
            status, _, _ = await request(self.app, headers=headers,
                                        chunks=[b" " * 7_050_001, b" " * 7_050_000])
            self.assertEqual(status, 413)

    async def test_invalid_json_and_validation_errors_never_echo_inputs(self):
        for body in (b'{"private-secret":', b'{"kind":{"private-secret":"C:/private/model"}}',
                     b'{"kind":"parcel","imageBase64":42}'):
            status, result, _ = await request(self.app, body)
            self.assertEqual(status, 422)
            self.assertNotIn("private", json.dumps(result))
            self.assertNotIn("input", json.dumps(result))

    async def test_parcel_requires_strict_nonempty_base64(self):
        for image in (None, "", "%%%%", "YQ", "YQ==\n"):
            status, _, _ = await request(self.app, json.dumps({"kind": "parcel", "imageBase64": image}).encode())
            self.assertEqual(status, 422)

    async def test_decoded_image_limit_and_field_limit(self):
        image = base64.b64encode(b"x" * (10 * 1024 * 1024 + 1)).decode()
        status, _, _ = await request(self.app, json.dumps({"kind": "parcel", "imageBase64": image}).encode())
        self.assertEqual(status, 413)
        status, _, _ = await request(self.app, json.dumps({"kind": "parcel", "imageBase64": "A" * 14_000_001}).encode())
        self.assertEqual(status, 422)

    async def test_valid_parcel_without_accepted_model_is_unavailable(self):
        status, _, _ = await request(self.app, b'{"kind":"parcel","imageBase64":"YQ=="}')
        self.assertEqual(status, 503)

    async def test_tabular_inputs_and_results_retain_existing_contract(self):
        for kind, label in (("inventory", "Reorder Risk"), ("delivery", "Medium")):
            expected = {"label": label, "confidence": .8, "model": "RandomForest",
                        "modelVersion": "v1", "scores": [.2, .8]}
            with patch.object(api, "predict_tabular", return_value=expected) as predict:
                status, result, _ = await request(self.app, json.dumps(
                    {"kind": kind, "features": {"available_quantity": 4, "reorder_distance": -2}}).encode())
            self.assertEqual((status, result), (200, expected))
            predict.assert_called_once_with(kind, {"available_quantity": 4., "reorder_distance": -2.})

    async def test_health_is_cheap_and_reports_no_operational_vision(self):
        with patch.object(self.app.state.parcel_executor, "audit", side_effect=AssertionError("must not audit")):
            status, result, _ = await request(self.app, method="GET", path="/health", token=None)
        self.assertEqual(status, 200)
        self.assertIs(result["vision"], False)
        self.assertEqual(result["parcel"]["status"], "not_configured")
        self.assertIs(result["parcel"]["operationallyApproved"], False)
        self.assertIn("checkedAt", result["parcel"])
        self.assertEqual(set(result["models"]), {"inventory", "delivery"})

    async def test_duplicate_headers_and_malformed_lengths_rejected_before_read(self):
        for headers, expected in (
                ([(b"authorization", b"Bearer test-token")], 401),
                ([(b"content-length", b"-1")], 422),
                ([(b"content-length", b"x")], 422),
                ([(b"content-length", b"1"), (b"content-length", b"1")], 422)):
            status, _, reads = await request(self.app, b"{}", headers=headers)
            self.assertEqual((status, reads), (expected, 0))


class RuntimeDouble:
    busy = False

    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []
        self.audit_calls = []

    async def audit(self, artifacts, cancel_event=None):
        self.audit_calls.append(artifacts)
        if self.error:
            raise self.error
        return {"status": "artifact_ready", "operationally_approved": False,
                "model": {"modelVersion": "a" * 64, "artifact": "C:/private/model"}}

    async def run(self, request_id, image_base64, configured_artifacts, cancel_event=None):
        self.calls.append((request_id, image_base64, configured_artifacts))
        if self.error:
            raise self.error
        return {**self.result, "requestId": request_id}


def envelope(status="predicted", approved=True):
    return {"status": status, "label": "Normal" if status == "predicted" else None,
            "confidence": .8 if status == "predicted" else .5,
            "probabilities": [.8, .2] if status == "predicted" else [.5, .5],
            "confidenceMeaning": "uncalibrated", "model": "MobileNetV2",
            "modelVersion": "a" * 64, "evidenceSha256": "b" * 64,
            "selectionSha256": "c" * 64, "evaluationSha256": "d" * 64,
            "preprocessing": "rgb-letterbox-224", "contrast": "none",
            "humanReviewRequired": True, "processingTimeMs": 1.,
            "totalProcessingTimeMs": 2., "operationally_approved": approved,
            "classOrder": ["Normal", "Damaged"], "acceptanceSha256": "e" * 64}


class ParcelTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env = patch.dict(os.environ, {**PARCEL_CONFIG_ENV, "IILAS_RESEARCH_TOKEN": "test-token",
                                          "IILAS_PARCEL_SELECTION": "private-selection.json",
                                          "IILAS_PARCEL_TEST_DIRECTORY": "private-test"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.app = api.create_app()

    async def test_startup_snapshot_is_safe_and_never_grants_acceptance(self):
        executor = RuntimeDouble(envelope())
        self.app.state.parcel_executor = executor
        with patch.dict(os.environ, {"IILAS_PARCEL_SELECTION": "changed-after-creation.json"}):
            async with self.app.router.lifespan_context(self.app):
                for _ in range(2):
                    status, health, _ = await request(self.app, method="GET", path="/health")
                    self.assertEqual(status, 200)
                    self.assertEqual(health["parcel"]["status"], "artifact_ready")
                    self.assertEqual(health["parcel"]["modelVersion"], "a" * 64)
                    self.assertIs(health["vision"], False)
                    self.assertIs(health["parcel"]["operationallyApproved"], False)
                    self.assertNotIn("private", json.dumps(health))
                status, _, _ = await request(self.app, b'{"kind":"parcel","imageBase64":"YQ==","operationally_approved":true}')
                self.assertEqual(status, 503)
        self.assertEqual(len(executor.audit_calls), 1)
        self.assertEqual(str(executor.audit_calls[0].selection_path), "private-selection.json")
        self.assertEqual(executor.calls, [])

    async def test_startup_failure_is_sanitized_and_health_can_report_busy(self):
        executor = RuntimeDouble(error=api.ParcelUnavailable("C:/private/secret"))
        self.app.state.parcel_executor = executor
        async with self.app.router.lifespan_context(self.app):
            _, health, _ = await request(self.app, method="GET", path="/health")
            self.assertEqual(health["parcel"]["status"], "unavailable")
            self.assertNotIn("private", json.dumps(health))
            executor.busy = True
            _, health, _ = await request(self.app, method="GET", path="/health")
            self.assertEqual(health["parcel"]["status"], "busy")
            self.assertIs(health["vision"], False)

    async def test_predicted_and_abstained_contract_with_test_only_admission(self):
        for outcome in ("predicted", "abstained"):
            result = envelope(outcome)
            executor = RuntimeDouble(result)
            self.app.state.parcel_executor = executor
            with patch.object(api, "_operational_admission", return_value=True):
                status, body, _ = await request(self.app, b'{"kind":"parcel","imageBase64":"YQ==","requestId":"forged"}')
            self.assertEqual(status, 200)
            request_id = body.pop("requestId")
            self.assertEqual(str(UUID(request_id)), request_id)
            self.assertEqual(body, result)
            self.assertEqual(executor.calls[0][1], "YQ==")

    async def test_unapproved_output_never_becomes_operational_prediction(self):
        self.app.state.parcel_executor = RuntimeDouble(envelope(approved=False))
        with patch.object(api, "_operational_admission", return_value=True):
            status, body, _ = await request(self.app, b'{"kind":"parcel","imageBase64":"YQ=="}')
        self.assertEqual(status, 503)
        self.assertNotIn("label", body)

    async def test_wire_requires_explicit_class_order_and_acceptance_digest(self):
        for field, invalid in (("classOrder", None), ("classOrder", ["Damaged", "Normal"]),
                               ("classOrder", ["Normal"]), ("acceptanceSha256", None),
                               ("acceptanceSha256", True), ("acceptanceSha256", "unbound")):
            with self.subTest(field=field, value=invalid):
                self.app.state.parcel_executor = RuntimeDouble({**envelope(), field: invalid})
                with patch.object(api, "_operational_admission", return_value=True):
                    status, body, _ = await request(self.app, b'{"kind":"parcel","imageBase64":"YQ=="}')
                self.assertEqual(status, 503)
                self.assertNotIn("label", body)

    async def test_runtime_errors_are_sanitized_and_statuses_preserved(self):
        for error, expected in ((api.ParcelBusy, 429), (api.ParcelTimeout, 504),
                                (api.ParcelInvalidInput, 422), (api.ParcelUnavailable, 503),
                                (api.ParcelCancelled, 503)):
            self.app.state.parcel_executor = RuntimeDouble(error=error("private-secret"))
            with patch.object(api, "_operational_admission", return_value=True):
                status, body, _ = await request(self.app, b'{"kind":"parcel","imageBase64":"YQ=="}')
            self.assertEqual(status, expected)
            self.assertNotIn("private", json.dumps(body))

    async def test_disconnect_and_deadline_wait_for_executor_cleanup(self):
        for disconnect_request in (True, False):
            started, stopped, disconnect = asyncio.Event(), asyncio.Event(), asyncio.Event()
            signals = []

            async def hanging(_request_id, _image, _artifacts, cancel_event=None):
                signals.append(cancel_event)
                started.set()
                try:
                    await asyncio.Future()
                finally:
                    await asyncio.sleep(.02)
                    stopped.set()

            with patch.object(self.app.state.parcel_executor, "run", side_effect=hanging), \
                    patch.object(api, "_operational_admission", return_value=True), \
                    patch.object(api, "PARCEL_DEADLINE_SECONDS", .05):
                task = asyncio.create_task(request(self.app, b'{"kind":"parcel","imageBase64":"YQ=="}',
                                                   disconnect=disconnect))
                await started.wait()
                if disconnect_request:
                    disconnect.set()
                status, _, _ = await task
            self.assertEqual(status, None if disconnect_request else 504)
            self.assertTrue(signals[0].is_set())
            self.assertTrue(stopped.is_set())

    @unittest.skipUnless(os.name == "nt", "Windows real manager cancellation")
    async def test_http_disconnect_reaps_real_manager_worker_and_descendant(self):
        from test_parcel_runtime import alive
        import parcel_runtime
        base = Path(__file__).parent / "datasets" / "parcel-api-tests"
        base.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            directory = Path(temp)
            selection = directory / "selection.json"
            selection.write_text(json.dumps({"selected": [
                {"architecture": "mobilenetv2", "artifact_sha256": "a" * 64}]}))
            (directory / "report.json").write_text('{"status":"complete"}')
            marker = directory / "pids.json"
            request_directories = []

            def command(workdir):
                request_directories.append(workdir)
                return [sys.executable, str(Path(__file__).with_name("test_parcel_runtime.py")),
                        "_fixture_manager", str(workdir), "hang", str(marker)]

            with patch.dict(os.environ, {"IILAS_PARCEL_SELECTION": str(selection),
                                         "IILAS_PARCEL_TEST_DIRECTORY": str(directory)}):
                app = api.create_app()
            app.state.parcel_executor = parcel_runtime.ParcelExecutor(manager_command=command)
            disconnect = asyncio.Event()
            with patch.object(api, "_operational_admission", return_value=True):
                task = asyncio.create_task(request(app, b'{"kind":"parcel","imageBase64":"YQ=="}',
                                                   disconnect=disconnect))
                try:
                    for _ in range(300):
                        if marker.exists():
                            break
                        await asyncio.sleep(.02)
                    self.assertTrue(marker.exists(), "tiny supervised worker must start")
                    pids = json.loads(marker.read_text())
                    disconnect.set()
                    status, _, _ = await asyncio.wait_for(task, 5)
                    self.assertIsNone(status)
                    for pid in pids.values():
                        self.assertFalse(alive(pid), "HTTP disconnect must reap the process tree")
                    self.assertFalse(app.state.parcel_executor.busy)
                    self.assertTrue(request_directories)
                    self.assertTrue(all(not path.exists() for path in request_directories))
                finally:
                    if not task.done():
                        task.cancel()
                        await asyncio.gather(task, return_exceptions=True)


class ParcelConfigurationTests(unittest.TestCase):
    def configured(self, **values):
        with patch.object(api.os, "environ", {**PARCEL_CONFIG_ENV, **values}):
            return api._configured_parcel_artifacts()

    def test_empty_and_complete_legacy_configuration_keep_original_identity(self):
        self.assertEqual(self.configured(), (None, False))
        artifacts, configured = self.configured(IILAS_PARCEL_SELECTION="private-selection.json",
                                                IILAS_PARCEL_TEST_DIRECTORY="private-test")
        self.assertTrue(configured)
        self.assertIs(type(artifacts), api.ParcelArtifacts)
        self.assertEqual(artifacts.selection_path, Path("private-selection.json"))
        self.assertEqual(artifacts.test_directory, Path("private-test"))

    def test_complete_descriptor_configuration_is_typed_server_identity(self):
        artifacts, configured = self.configured(IILAS_PARCEL_GPU_DESCRIPTOR="private-descriptor.json",
                                                IILAS_PARCEL_GPU_DESCRIPTOR_SHA256="a" * 64)
        self.assertTrue(configured)
        self.assertIs(type(artifacts), api.ParcelGPUArtifacts)
        self.assertEqual(artifacts.descriptor_path, Path("private-descriptor.json").absolute())
        self.assertEqual(artifacts.descriptor_sha256, "a" * 64)

    def test_partial_and_mixed_configuration_never_falls_back(self):
        legacy = {"IILAS_PARCEL_SELECTION": "private-selection.json", "IILAS_PARCEL_TEST_DIRECTORY": "private-test"}
        gpu = {"IILAS_PARCEL_GPU_DESCRIPTOR": "private-descriptor.json", "IILAS_PARCEL_GPU_DESCRIPTOR_SHA256": "a" * 64}
        cases = [{key: value} for key, value in {**legacy, **gpu}.items()]
        cases.extend(({**legacy, **gpu}, {**legacy, "IILAS_PARCEL_GPU_DESCRIPTOR": "private-descriptor.json"},
                      {**gpu, "IILAS_PARCEL_TEST_DIRECTORY": "private-test"}))
        for values in cases:
            with self.subTest(keys=tuple(values)):
                self.assertEqual(self.configured(**values), (None, True))

    def test_malformed_pin_or_path_is_configured_but_unavailable(self):
        for pin in ("A" * 64, "a" * 63, "g" * 64, "private-secret", " " * 64):
            with self.subTest(pin_shape=len(pin)):
                self.assertEqual(self.configured(IILAS_PARCEL_GPU_DESCRIPTOR="private.json",
                                                IILAS_PARCEL_GPU_DESCRIPTOR_SHA256=pin), (None, True))
        for path in (" ", "private\0secret.json", "private\nsecret.json", "../private.json"):
            with self.subTest(path_kind=repr(path)):
                self.assertEqual(self.configured(IILAS_PARCEL_GPU_DESCRIPTOR=path,
                                                IILAS_PARCEL_GPU_DESCRIPTOR_SHA256="a" * 64), (None, True))


class GPUParcelStartupTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env = patch.dict(os.environ, {**PARCEL_CONFIG_ENV, "IILAS_RESEARCH_TOKEN": "test-token",
            "IILAS_PARCEL_GPU_DESCRIPTOR": "private-descriptor.json",
            "IILAS_PARCEL_GPU_DESCRIPTOR_SHA256": "a" * 64})
        self.env.start(); self.addCleanup(self.env.stop)

    async def test_descriptor_is_captured_once_and_ready_health_stays_closed(self):
        app = api.create_app(); executor = RuntimeDouble(envelope()); app.state.parcel_executor = executor
        with patch.dict(os.environ, {"IILAS_PARCEL_GPU_DESCRIPTOR": "changed-private.json",
                                    "IILAS_PARCEL_GPU_DESCRIPTOR_SHA256": "b" * 64,
                                    "IILAS_PARCEL_SELECTION": "mixed-after-creation.json"}):
            async with app.router.lifespan_context(app):
                _, health, _ = await request(app, method="GET", path="/health")
                self.assertEqual(health["parcel"]["status"], "artifact_ready")
                self.assertFalse(health["vision"]); self.assertFalse(health["parcel"]["operationallyApproved"])
                self.assertNotIn("private", json.dumps(health))
                with patch.dict(os.environ, {"IILAS_PARCEL_APPROVED": "true", "IILAS_LIVE_APPROVED": "true"}):
                    status, body, _ = await request(app, json.dumps({"kind": "parcel", "imageBase64": "YQ==",
                        "descriptor": "caller-private.json", "descriptorSha256": "c" * 64,
                        "operationally_approved": True}).encode())
                self.assertEqual(status, 503); self.assertNotIn("label", body)
        self.assertEqual(len(executor.audit_calls), 1)
        captured = executor.audit_calls[0]
        self.assertIs(type(captured), api.ParcelGPUArtifacts)
        self.assertEqual(captured.descriptor_path, Path("private-descriptor.json").absolute())
        self.assertEqual(captured.descriptor_sha256, "a" * 64)
        self.assertFalse(api._operational_admission(captured)); self.assertFalse(api._operational_live_admission(captured))
        self.assertEqual(executor.calls, [])

    async def test_descriptor_startup_failure_is_sanitized(self):
        app = api.create_app(); executor = RuntimeDouble(error=api.ParcelUnavailable("C:/private/secret"))
        app.state.parcel_executor = executor
        async with app.router.lifespan_context(app):
            _, health, _ = await request(app, method="GET", path="/health")
        self.assertEqual(len(executor.audit_calls), 1)
        self.assertEqual(health["parcel"]["status"], "unavailable")
        self.assertNotIn("private", json.dumps(health)); self.assertFalse(health["vision"])

    async def test_invalid_configuration_is_unavailable_without_startup_worker(self):
        for values in ({"IILAS_PARCEL_GPU_DESCRIPTOR_SHA256": "private-secret"},
                       {"IILAS_PARCEL_SELECTION": "mixed-private.json"},
                       {"IILAS_PARCEL_GPU_DESCRIPTOR": ""}):
            with self.subTest(keys=tuple(values)), patch.dict(os.environ, values):
                app = api.create_app(); executor = RuntimeDouble(envelope()); app.state.parcel_executor = executor
                async with app.router.lifespan_context(app):
                    _, health, _ = await request(app, method="GET", path="/health")
                    status, body, _ = await request(app, b'{"kind":"parcel","imageBase64":"YQ=="}')
                self.assertEqual(health["parcel"]["status"], "unavailable")
                self.assertEqual(status, 503); self.assertNotIn("private", json.dumps((health, body)))
                self.assertEqual(executor.audit_calls, []); self.assertEqual(executor.calls, [])


if __name__ == "__main__":
    unittest.main()
