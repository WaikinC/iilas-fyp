"""Artificial ASGI/executor tests; no sockets, pixels or native model process."""
import asyncio
import json
import os
import io
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

import api
import parcel_runtime as parcel
from test_api import request as base_request
from test_parcel_local_eval import ROOT, REQUEST_ID, result
try:
    import parcel_local_eval as local
    import serve_parcel_local_eval as serve
except ModuleNotFoundError as error:
    if error.name not in ('parcel_local_eval', 'serve_parcel_local_eval'):
        raise
    local = serve = None

KEYS = ('IILAS_PARCEL_LOCAL_EVAL_MANIFEST', 'IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256',
        'IILAS_PARCEL_WARM_BUNDLE', 'IILAS_PARCEL_WARM_BUNDLE_SHA256',
        'IILAS_PARCEL_GPU_DESCRIPTOR', 'IILAS_PARCEL_GPU_DESCRIPTOR_SHA256',
        'IILAS_PARCEL_SELECTION', 'IILAS_PARCEL_TEST_DIRECTORY')
PHOTO = b'{"kind":"parcel","imageBase64":"YQ=="}'
LIVE = dict(intendedUse='sampled-live', sessionId=REQUEST_ID,
            frameId='00000000-0000-4000-8000-000000000002', sequence=1, imageBase64='YQ==')


async def request(app, *args, **kwargs):
    headers = list(kwargs.pop('headers', ()))
    if not any(key.lower() == b'host' for key, _ in headers):
        headers.append((b'host', b'127.0.0.1:8000'))
    return await base_request(app, *args, headers=headers, **kwargs)


class Executor:
    busy = False
    def __init__(self):
        self.calls = []
        self.error = None
        self.change = {}
        self.closed = 0
        self.audit_calls = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.cleaned = False
        self.wait = False
        self.audit_error = None
    async def audit(self, artifacts):
        self.audit_calls += 1
        if self.audit_error:
            raise self.audit_error
        return {'status': 'artifact_ready'}
    async def run(self, request_id, image, artifacts, cancel):
        started = time.monotonic()
        self.calls.append((request_id, image, artifacts))
        self.started.set()
        if self.wait:
            try:
                await self.release.wait()
            except asyncio.CancelledError:
                if not cancel.is_set():
                    raise AssertionError('cancellation event missing')
                await asyncio.sleep(.01)
                self.cleaned = True
                raise
        if self.error:
            raise self.error
        # Artificial model work takes real time; its reported processing time
        # must fit within the separately measured service duration.
        await asyncio.sleep(.002)
        processing_ms = (time.monotonic()-started)*1000
        return {**result(request_id, image), 'processingTimeMs': processing_ms, **self.change}
    async def aclose(self):
        self.closed += 1


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.assertIsNotNone(serve, 'local evaluation service capability is missing')
        asyncio.get_running_loop().slow_callback_duration = 2
        self.env = patch.dict(os.environ, {**{key: '' for key in KEYS}, 'IILAS_RESEARCH_TOKEN': 'test-token'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT/'outputs')
        self.addCleanup(self.temp.cleanup)
        with patch.object(local, '_source_code', return_value={'fixture': 'a'*64}):
            self.manifest = local.create_manifest(Path(self.temp.name)/'v1'/'manifest.json')
        self.load = patch.object(serve.local, 'load_manifest', return_value=self.manifest)
        self.load.start()
        self.addCleanup(self.load.stop)
        self.executor = Executor()
        self.construct = patch.object(serve, 'WarmParcelExecutor', return_value=self.executor)
        self.construct.start()
        self.addCleanup(self.construct.stop)
        self.app = serve.create_app(self.manifest.path, self.manifest.sha256)

    async def test_both_routes_return_experimental_false_null_and_bound_live(self):
        for path, body in (('/predict', PHOTO), ('/predict/live-parcel', json.dumps(LIVE).encode())):
            status, output, _ = await request(self.app, body, path=path)
            self.assertEqual(status, 200)
            self.assertEqual(output['evaluationKind'], 'local-experimental')
            self.assertEqual(output['evaluationManifestSha256'], self.manifest.sha256)
            self.assertIs(output['operationally_approved'], False)
            self.assertIsNone(output['acceptanceSha256'])
            self.assertIn('totalProcessingTimeMs', output)
            self.assertGreaterEqual(output['totalProcessingTimeMs'], output['processingTimeMs'])
            self.assertLessEqual(output['totalProcessingTimeMs'], 30000)
            if path.endswith('live-parcel'):
                self.assertEqual(output['sessionId'], REQUEST_ID)
                self.assertEqual(output['sequence'], 1)

    async def test_total_service_duration_covers_preparation_worker_and_validation(self):
        original_image, original_result = serve._image, local.experimental_result
        observed = {}
        def preparation(*args):
            observed['preparation_started'] = time.perf_counter()
            time.sleep(.005)
            return original_image(*args)
        def manifest(*args):
            time.sleep(.005)
            return self.manifest
        def validation(*args, **kwargs):
            value = original_result(*args, **kwargs)
            time.sleep(.005)
            observed['validation_finished'] = time.perf_counter()
            return value
        # Deliberately unrelated optional worker total must not become the HTTP
        # service total; all observed service time below uses the real clock.
        self.executor.change = {'totalProcessingTimeMs': 24000.}
        for path, body in (('/predict', PHOTO), ('/predict/live-parcel', json.dumps(LIVE).encode())):
            with patch.object(serve, '_image', side_effect=preparation), \
                 patch.object(local, 'load_manifest', side_effect=manifest), \
                 patch.object(local, 'experimental_result', side_effect=validation):
                started = time.perf_counter()
                status, output, _ = await request(self.app, body, path=path)
                elapsed_ms = (time.perf_counter()-started)*1000
            self.assertEqual(status, 200)
            self.assertIn('totalProcessingTimeMs', output)
            self.assertGreaterEqual(output['totalProcessingTimeMs'], 20)
            self.assertGreaterEqual(output['totalProcessingTimeMs'],
                (observed['validation_finished']-observed['preparation_started'])*1000)
            self.assertLessEqual(output['totalProcessingTimeMs'], elapsed_ms+1)
            self.assertNotEqual(output['totalProcessingTimeMs'], 24000.)
            self.assertEqual(output['probabilities'], [.8, .2])
            self.assertEqual(output['confidence'], .8)

    async def test_service_duration_outside_wire_cap_rejects_and_closes(self):
        original_result = local.experimental_result
        def validation(*args, **kwargs):
            value = original_result(*args, **kwargs)
            time.sleep(.025)
            return value
        # Prospectively shorten the wire cap for this real elapsed-time test.
        # The production30s cap and model25s deadline are unchanged.
        with patch.object(serve, 'WIRE_DEADLINE_SECONDS', .02, create=True), \
             patch.object(local, 'experimental_result', side_effect=validation):
            status, output, _ = await request(self.app, PHOTO)
        self.assertEqual(status, 503)
        self.assertNotIn('totalProcessingTimeMs', output)
        self.assertEqual(self.executor.closed, 1)

    async def test_worker_processing_cannot_force_fabricated_maximum_total(self):
        self.executor.change = {'processingTimeMs': 25000.}
        status, output, _ = await request(self.app, PHOTO)
        self.assertEqual(status, 503)
        self.assertNotIn('totalProcessingTimeMs', output)
        self.assertEqual(self.executor.closed, 1)

    async def test_authentication_and_duplicate_lengths_precede_body_read(self):
        for token, headers, expected in ((None, [], 401), (b'Bearer wrong', [], 401),
            (b'Bearer test-token', [(b'authorization', b'Bearer test-token')], 401),
            (b'Bearer test-token', [(b'content-length', b'1'), (b'content-length', b'1')], 422),
            (b'Bearer test-token', [(b'content-length', b'14100001')], 413)):
            status, _, reads = await request(self.app, b'{', token=token, headers=headers)
            self.assertEqual((status, reads), (expected, 0))
        self.assertEqual(self.executor.calls, [])

    async def test_strict_schema_base64_and_limits_do_not_execute(self):
        for path, body, expected in (
            ('/predict', b'{"kind":"parcel","imageBase64":"YR=="}', 422),
            ('/predict', b'{"kind":"parcel","imageBase64":"YQ==","evaluationKind":"local-experimental"}', 422),
            ('/predict', b'{"kind":"parcel","imageBase64":"YQ==","features":{}}', 422),
            ('/predict/live-parcel', json.dumps({**LIVE, 'policySha256': 'a'*64}).encode(), 422),
            ('/predict/live-parcel', json.dumps({**LIVE, 'sequence': True}).encode(), 422),
            ('/predict/live-parcel', json.dumps({**LIVE, 'imageBase64': 'AAAA'*(349527)}).encode(), 422),
            ('/predict', b'{"kind":{"secret":"C:/private/model"}}', 422)):
            status, output, _ = await request(self.app, body, path=path)
            self.assertEqual(status, expected)
            self.assertNotIn('secret', json.dumps(output))
        self.assertEqual(self.executor.calls, [])

    async def test_streamed_body_limit_and_live_declared_limit(self):
        status, _, _ = await request(self.app, path='/predict/live-parcel', chunks=[b' '*705001, b' '*705000])
        self.assertEqual(status, 413)
        status, _, reads = await request(self.app, b'', path='/predict/live-parcel', headers=[(b'content-length', b'1410001')])
        self.assertEqual((status, reads), (413, 0))
        self.assertEqual(self.executor.calls, [])

    async def test_worker_authority_mismatch_and_errors_are_sanitized(self):
        for change in ({'operationally_approved': True}, {'acceptanceSha256': 'a'*64},
                       {'policySha256': 'a'*64}, {'modelVersion': '0'*64}):
            self.executor.change = change
            status, output, _ = await request(self.app, PHOTO)
            self.assertEqual(status, 503)
            self.assertNotIn('a'*64, json.dumps(output))
        self.executor.change = {}
        for error, expected in ((parcel.ParcelBusy('secret'), 429),
                                (parcel.ParcelTimeout('secret'), 504),
                                (parcel.ParcelInvalidInput('secret'), 422),
                                (parcel.ParcelUnavailable('secret'), 503)):
            self.executor.error = error
            status, output, _ = await request(self.app, PHOTO)
            self.assertEqual(status, expected)
            self.assertNotIn('secret', json.dumps(output))

    async def test_unconfigured_health_never_constructs_or_audits_executor(self):
        self.construct.stop()
        with patch.object(serve, 'WarmParcelExecutor', side_effect=AssertionError('must not construct')):
            app = serve.create_app()
            async with app.router.lifespan_context(app):
                status, output, _ = await request(app, method='GET', path='/health', token=None)
                self.assertEqual(status, 200)
                self.assertEqual(output['parcel']['status'], 'not_configured')
                self.assertIs(output['vision'], False)
                status, _, _ = await request(app, PHOTO)
                self.assertEqual(status, 503)
                self.assertFalse(any(name in sys.modules for name in ('tensorflow', 'cv2', 'keras', 'models')))

    async def test_nonliteral_peer_rejected_before_read_and_forwarded_headers_cannot_enable(self):
        for peer in ('192.168.1.1', 'localhost', '::1', None):
            messages = []
            reads = 0
            async def receive():
                nonlocal reads
                reads += 1
                return {'type': 'http.request', 'body': PHOTO, 'more_body': False}
            async def send(message):
                messages.append(message)
            scope = dict(type='http', path='/predict', method='POST', headers=[
                (b'authorization', b'Bearer test-token'), (b'x-forwarded-for', b'127.0.0.1')],
                client=(peer, 1234) if peer else None)
            await self.app(scope, receive, send)
            self.assertEqual(messages[0]['status'], 403)
            self.assertEqual(reads, 0)
        self.assertEqual(self.executor.calls, [])

    async def test_host_must_be_single_literal_loopback_with_actual_explicit_port(self):
        for hosts in ([b'localhost:8000'], [b'127.0.0.1'], [b'127.0.0.1:8001'],
                      [b'user@127.0.0.1:8000'], [b'127.0.0.1:8000.evil'],
                      [b'[::1]:8000'], [b'127.0.0.1:8000', b'127.0.0.1:8000']):
            status, _, reads = await request(self.app, PHOTO, headers=[(b'host', host) for host in hosts])
            self.assertEqual((status, reads), (403, 0))
        self.assertEqual(self.executor.calls, [])

    async def test_manifest_drift_before_or_after_work_closes_native_owner(self):
        for after in (False, True):
            async def run():
                status, output, _ = await request(self.app, PHOTO)
                self.assertEqual(status, 503)
                self.assertNotIn('private', json.dumps(output))
            self.executor.closed = 0
            before_calls = len(self.executor.calls)
            side_effect = [self.manifest, ValueError('private drift')] if after else ValueError('private drift')
            with patch.object(serve.local, 'load_manifest', side_effect=side_effect):
                await run()
            self.assertEqual(self.executor.closed, 1)
            self.assertEqual(len(self.executor.calls)-before_calls, 1 if after else 0)

    async def test_audit_cancellation_and_repeated_shutdown_cancellation_wait_for_close(self):
        audit_started, close_started, release = asyncio.Event(), asyncio.Event(), asyncio.Event()
        async def audit(artifacts):
            audit_started.set()
            await asyncio.Future()
        async def close():
            close_started.set()
            await release.wait()
            self.executor.cleaned = True
        self.executor.audit, self.executor.aclose = audit, close
        async def lifecycle():
            async with self.app.router.lifespan_context(self.app):
                self.fail('cancelled audit cannot enter app body')
        task = asyncio.create_task(lifecycle())
        await audit_started.wait()
        task.cancel()
        await close_started.wait()
        task.cancel()
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        release.set()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(self.executor.cleaned)

    async def test_lifespan_closes_after_audit_failure_and_body_failure(self):
        async with self.app.router.lifespan_context(self.app):
            self.assertEqual(self.app.state.parcel_snapshot['status'], 'artifact_ready')
        self.assertEqual(self.executor.closed, 1)
        self.executor.audit_error = RuntimeError('private startup failure')
        with self.assertRaises(RuntimeError):
            async with self.app.router.lifespan_context(self.app):
                pass
        self.assertEqual(self.executor.closed, 2)
        self.executor.audit_error = None
        with self.assertRaises(RuntimeError):
            async with self.app.router.lifespan_context(self.app):
                raise RuntimeError('body')
        self.assertEqual(self.executor.closed, 3)

    async def test_disconnect_cancellation_and_deadline_await_executor_cleanup(self):
        for mode in ('disconnect', 'cancel', 'deadline'):
            with self.subTest(mode=mode):
                self.executor.started.clear()
                self.executor.cleaned = False
                self.executor.wait = True
                disconnect = asyncio.Event()
                with patch.object(serve, 'PARCEL_DEADLINE_SECONDS', .03 if mode == 'deadline' else 25):
                    task = asyncio.create_task(request(self.app, PHOTO, disconnect=disconnect))
                    await self.executor.started.wait()
                    if mode == 'disconnect':
                        disconnect.set()
                    if mode == 'cancel':
                        task.cancel()
                        with self.assertRaises(asyncio.CancelledError):
                            await task
                    else:
                        status, _, _ = await task
                        self.assertEqual(status, None if mode == 'disconnect' else 504)
                self.assertTrue(self.executor.cleaned)

    async def test_tabular_contract_stays_unchanged(self):
        expected = {'label': 'Medium', 'confidence': .8, 'model': 'RandomForest'}
        with patch.object(api, 'predict_tabular', return_value=expected):
            status, output, _ = await request(self.app, b'{"kind":"delivery","features":{"x":1}}')
        self.assertEqual((status, output), (200, expected))

    async def test_partial_conflicting_mixed_and_blank_token_config_reject(self):
        for config in ({KEYS[0]: str(self.manifest.path)}, {KEYS[1]: self.manifest.sha256},
                       {'IILAS_PARCEL_WARM_BUNDLE': 'legacy'},
                       {'IILAS_PARCEL_GPU_DESCRIPTOR': 'legacy'},
                       {'IILAS_PARCEL_SELECTION': 'legacy'}, {'IILAS_RESEARCH_TOKEN': ' '}):
            with self.subTest(config=config), patch.dict(os.environ, config), self.assertRaises(ValueError):
                serve.create_app(self.manifest.path, self.manifest.sha256)

    async def test_cli_loopback_only_proxy_headers_disabled_and_no_host_option(self):
        with patch.object(serve, 'create_app', return_value=self.app), patch('uvicorn.run') as run:
            serve.main(['serve', '--port', '8123'])
        run.assert_called_once_with(self.app, host='127.0.0.1', port=8123, proxy_headers=False)
        for args in (['serve', '--port', '0'], ['serve', '--port', '8123', '--host', '0.0.0.0']):
            with patch('sys.stderr', new=io.StringIO()), self.assertRaises(SystemExit):
                serve.main(args)


if __name__ == '__main__':
    unittest.main()
