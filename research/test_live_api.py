"""Live transport fixtures are software evidence; no model or image is loaded."""
import asyncio
import base64
import hashlib
import json
import os
import unittest
from unittest.mock import patch

import api
from test_api import request, RuntimeDouble, envelope, PARCEL_CONFIG_ENV


SESSION = 'a0000000-0000-4000-8000-000000000001'
FRAME = 'b0000000-0000-4000-8000-000000000002'
PATH = '/predict/live-parcel'
IMAGE = b'bounded-software-frame'


def payload(**changes):
    return {'intendedUse': 'sampled-live', 'sessionId': SESSION, 'frameId': FRAME,
            'sequence': 1, 'imageBase64': base64.b64encode(IMAGE).decode(), **changes}


class LiveParcelTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env = patch.dict(os.environ, {**PARCEL_CONFIG_ENV, 'IILAS_RESEARCH_TOKEN': 'test-token',
                                          'IILAS_PARCEL_SELECTION': 'private-selection.json',
                                          'IILAS_PARCEL_TEST_DIRECTORY': 'private-test'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.app = api.create_app()
        self.executor = RuntimeDouble({**envelope(), 'evidenceSha256': hashlib.sha256(IMAGE).hexdigest(),
                                       'intendedUse': 'sampled-live', 'policyVersion': 'parcel-live-v1',
                                       'policySha256': 'f' * 64})
        self.app.state.parcel_executor = self.executor

    async def call(self, value=None, **kwargs):
        return await request(self.app, json.dumps(payload() if value is None else value).encode(),
                             path=PATH, **kwargs)

    async def test_live_auth_rejects_before_reading_any_body(self):
        for token in (None, b'Bearer wrong', b'Bearer \xff'):
            status, body, reads = await request(self.app, b'{private-image', token=token, path=PATH)
            self.assertEqual((status, reads), (401, 0))
            self.assertNotIn('private', json.dumps(body))

    async def test_live_declared_body_limit_rejects_before_read(self):
        status, _, reads = await self.call(headers=[(b'content-length', b'1410001')])
        self.assertEqual((status, reads), (413, 0))

    async def test_live_streaming_body_limit_ignores_false_length(self):
        status, _, _ = await request(self.app, path=PATH, headers=[(b'content-length', b'2')],
                                     chunks=[b' ' * 705001, b' ' * 705000])
        self.assertEqual(status, 413)

    async def test_live_defaults_closed_without_executor_or_decode(self):
        with patch.object(api.base64, 'b64decode', side_effect=AssertionError('must not decode')):
            status, body, _ = await self.call()
        self.assertEqual(status, 503)
        self.assertNotIn('label', body)
        self.assertEqual(self.executor.calls, [])

    async def test_photo_admission_and_environment_cannot_authorise_live(self):
        with patch.object(api, '_operational_admission', return_value=True), \
                patch.dict(os.environ, {'IILAS_LIVE_APPROVED': 'true', 'IILAS_PARCEL_APPROVED': 'true'}):
            status, _, _ = await self.call()
        self.assertEqual(status, 503)
        self.assertEqual(self.executor.calls, [])

    async def test_gpu_descriptor_readiness_cannot_authorise_live_or_decode_frames(self):
        with patch.dict(os.environ, {**PARCEL_CONFIG_ENV, 'IILAS_PARCEL_GPU_DESCRIPTOR': 'private-descriptor.json',
                                    'IILAS_PARCEL_GPU_DESCRIPTOR_SHA256': 'a' * 64,
                                    'IILAS_LIVE_APPROVED': 'true', 'IILAS_PARCEL_APPROVED': 'true'}):
            app = api.create_app(); executor = RuntimeDouble(self.executor.result); app.state.parcel_executor = executor
            async with app.router.lifespan_context(app):
                with patch.object(api.base64, 'b64decode', side_effect=AssertionError('must not decode')):
                    status, body, _ = await request(app, json.dumps(payload()).encode(), path=PATH)
                _, health, _ = await request(app, method='GET', path='/health')
        self.assertEqual(status, 503); self.assertNotIn('label', body)
        self.assertEqual(health['parcel']['status'], 'artifact_ready'); self.assertFalse(health['vision'])
        self.assertEqual(len(executor.audit_calls), 1); self.assertEqual(executor.calls, [])
        self.assertIs(type(executor.audit_calls[0]), api.ParcelGPUArtifacts)

    async def test_live_body_cannot_choose_descriptor_identity(self):
        for changes in ({'descriptor': 'private-caller.json'}, {'descriptorSha256': 'a' * 64}):
            status, body, _ = await self.call(payload(**changes))
            self.assertEqual(status, 422); self.assertEqual(body, {'detail': 'Invalid request.'})
        self.assertEqual(self.executor.calls, [])

    async def test_strict_live_identity_extra_fields_and_sequence(self):
        for changes in ({'sessionId': 'private-path'}, {'sessionId': SESSION.upper()},
                        {'frameId': 42}, {'frameId': FRAME.upper()}, {'sequence': True},
                        {'sequence': '1'}, {'sequence': 0}, {'sequence': 13},
                        {'intendedUse': 'registered-photo'}, {'operationally_approved': True},
                        {'imageBase64': 42}, {'imageBase64': ''}, {'imageBase64': '%%%%'}):
            with self.subTest(changes=changes):
                status, body, _ = await self.call(payload(**changes))
                self.assertEqual(status, 422)
                self.assertEqual(body, {'detail': 'Invalid request.'})
        self.assertEqual(self.executor.calls, [])

    async def test_accepted_test_fixture_has_explicit_bound_live_wire(self):
        with patch.object(api, '_operational_live_admission', return_value=True):
            status, body, _ = await self.call()
        self.assertEqual(status, 200)
        for key in ('intendedUse', 'sessionId', 'frameId', 'sequence'):
            self.assertEqual(body[key], payload()[key])
        self.assertEqual(body['evidenceSha256'], hashlib.sha256(IMAGE).hexdigest())
        self.assertEqual(body['policyVersion'], 'parcel-live-v1')
        self.assertEqual(body['policySha256'], 'f' * 64)
        self.assertEqual(len(self.executor.calls), 1)

    async def test_exact_one_mib_accepted_but_one_byte_more_rejected(self):
        self.executor.result['evidenceSha256'] = hashlib.sha256(b'x' * 1048576).hexdigest()
        with patch.object(api, '_operational_live_admission', return_value=True):
            status, _, _ = await self.call(payload(imageBase64=base64.b64encode(b'x' * 1048576).decode()))
            self.assertEqual(status, 200)
            status, _, _ = await self.call(payload(imageBase64=base64.b64encode(b'x' * 1048577).decode()))
            self.assertEqual(status, 413)
        self.assertEqual(len(self.executor.calls), 1)

    async def test_noncanonical_base64_rejected_before_executor(self):
        with patch.object(api, '_operational_live_admission', return_value=True):
            for image in ('Zh==', 'YQ==\n', 'YQ', '=YQ=', 'AAAA===='):
                status, _, _ = await self.call(payload(imageBase64=image))
                self.assertEqual(status, 422)
        self.assertEqual(self.executor.calls, [])

    async def test_photo_only_or_missing_live_policy_cannot_become_live_wire(self):
        for changes in ({'intendedUse': None}, {'intendedUse': 'registered-photo'},
                        {'policyVersion': None}, {'policyVersion': 'private/path'},
                        {'policySha256': None}, {'policySha256': 'not-a-digest'}):
            self.app.state.parcel_executor = RuntimeDouble({**self.executor.result, **changes})
            with patch.object(api, '_operational_live_admission', return_value=True):
                status, body, _ = await self.call()
            self.assertEqual(status, 503)
            self.assertNotIn('label', body)

    async def test_runtime_errors_are_safe_and_statuses_preserved(self):
        for exception, expected in ((api.ParcelBusy, 429), (api.ParcelTimeout, 504),
                                    (api.ParcelInvalidInput, 422), (api.ParcelUnavailable, 503),
                                    (api.ParcelCancelled, 503)):
            self.app.state.parcel_executor = RuntimeDouble(error=exception('private-image-secret'))
            with patch.object(api, '_operational_live_admission', return_value=True):
                status, body, _ = await self.call()
            self.assertEqual(status, expected)
            self.assertNotIn('private', json.dumps(body))

    async def test_live_disconnect_waits_for_same_executor_cleanup(self):
        started, stopped, disconnected = asyncio.Event(), asyncio.Event(), asyncio.Event()

        async def hanging(_request_id, _image, _artifacts, cancel_event=None):
            started.set()
            try:
                await asyncio.Future()
            finally:
                await asyncio.sleep(.01)
                stopped.set()

        with patch.object(api, '_operational_live_admission', return_value=True), \
                patch.object(self.executor, 'run', side_effect=hanging):
            task = asyncio.create_task(self.call(disconnect=disconnected))
            try:
                await asyncio.wait_for(started.wait(), 2)
                disconnected.set()
                status, _, _ = await asyncio.wait_for(task, 2)
                self.assertIsNone(status)
                self.assertTrue(stopped.is_set())
            finally:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)


if __name__ == '__main__':
    unittest.main()
