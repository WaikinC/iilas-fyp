"""Artificial factory tests: no model, native process or HTTP server."""
import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

import api
from parcel_runtime import ParcelGPUArtifacts
import serve_parcel as serve

KEYS = ('IILAS_PARCEL_WARM_BUNDLE', 'IILAS_PARCEL_WARM_BUNDLE_SHA256',
        'IILAS_PARCEL_SELECTION', 'IILAS_PARCEL_TEST_DIRECTORY',
        'IILAS_PARCEL_GPU_DESCRIPTOR', 'IILAS_PARCEL_GPU_DESCRIPTOR_SHA256')


class FactoryTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {key: '' for key in KEYS})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.artifacts = ParcelGPUArtifacts(Path('descriptor.json').absolute(), 'a' * 64)
        self.bundle = SimpleNamespace(path=Path('bundle.json').absolute(), sha256='b'*64,
                                      artifacts=self.artifacts)
        self.loader = patch.object(serve.protocol, 'load_bundle', return_value=self.bundle).start()
        self.addCleanup(patch.stopall)
        self.executor = SimpleNamespace(busy=False, closed=0)
        async def audit(artifacts):
            self.assertEqual(artifacts, self.artifacts)
            return {'status': 'artifact_ready'}
        async def close():
            self.executor.closed += 1
        self.executor.audit = audit
        self.executor.aclose = close
        self.constructor = patch.object(serve, 'WarmParcelExecutor', return_value=self.executor).start()

    def make(self):
        return serve.create_app(self.bundle.path, self.bundle.sha256)

    def test_explicit_configuration_restores_environment(self):
        before = dict(os.environ)
        app = self.make()
        self.assertIs(app.state.parcel_executor, self.executor)
        self.assertEqual(dict(os.environ), before)
        self.loader.assert_called_once_with(self.bundle.path, self.bundle.sha256)
        self.constructor.assert_called_once_with(self.bundle.path, self.bundle.sha256)
        self.assertFalse(api._operational_admission(self.artifacts))
        self.assertFalse(api._operational_live_admission(self.artifacts))

    def test_complete_environment_pair(self):
        os.environ['IILAS_PARCEL_WARM_BUNDLE'] = str(self.bundle.path)
        os.environ['IILAS_PARCEL_WARM_BUNDLE_SHA256'] = self.bundle.sha256
        self.assertIs(serve.create_app().state.parcel_executor, self.executor)

    def test_partial_or_missing_pair_rejected(self):
        for args in ((), (self.bundle.path,), (None, self.bundle.sha256)):
            with self.subTest(args=args), self.assertRaises(ValueError):
                serve.create_app(*args)
        self.loader.assert_not_called()

    def test_conflicting_environment_pair_rejected(self):
        os.environ['IILAS_PARCEL_WARM_BUNDLE'] = 'different.json'
        os.environ['IILAS_PARCEL_WARM_BUNDLE_SHA256'] = self.bundle.sha256
        with self.assertRaises(ValueError):
            self.make()

    def test_legacy_and_incomplete_or_conflicting_gpu_rejected(self):
        for config in ({'IILAS_PARCEL_SELECTION': 'legacy'},
                       {'IILAS_PARCEL_TEST_DIRECTORY': 'legacy'},
                       {'IILAS_PARCEL_GPU_DESCRIPTOR': str(self.artifacts.descriptor_path)},
                       {'IILAS_PARCEL_GPU_DESCRIPTOR': 'different.json',
                        'IILAS_PARCEL_GPU_DESCRIPTOR_SHA256': 'a'*64}):
            with self.subTest(config=config), patch.dict(os.environ, config), self.assertRaises(ValueError):
                self.make()
        self.constructor.assert_not_called()

    def test_same_gpu_pair_accepted(self):
        with patch.dict(os.environ, {'IILAS_PARCEL_GPU_DESCRIPTOR': str(self.artifacts.descriptor_path),
                                   'IILAS_PARCEL_GPU_DESCRIPTOR_SHA256': 'a'*64}):
            self.make()

    def test_invalid_bundle_never_constructs_app(self):
        self.loader.side_effect = ValueError('invalid metadata')
        with patch.object(api, 'create_app') as factory, self.assertRaises(ValueError):
            self.make()
        factory.assert_not_called()
        self.constructor.assert_not_called()

    def test_environment_restored_after_original_factory_failure(self):
        before = dict(os.environ)
        with patch.object(api, 'create_app', side_effect=RuntimeError('fixture')):
            with self.assertRaises(RuntimeError):
                self.make()
        self.assertEqual(dict(os.environ), before)

    def test_cli_loopback_and_existing_token_only(self):
        with patch.dict(os.environ, {'IILAS_RESEARCH_TOKEN': 'fixture-token'}), \
                patch.object(serve, 'create_app', return_value='fixture-app'), \
                patch('uvicorn.run') as run:
            serve.main(['--port', '8123'])
        run.assert_called_once_with('fixture-app', host='127.0.0.1', port=8123)

    def test_cli_missing_token_and_invalid_port_rejected(self):
        with patch.dict(os.environ, {'IILAS_RESEARCH_TOKEN': ''}), patch('uvicorn.run') as run:
            with self.assertRaises(SystemExit):
                serve.main(['--port', '8123'])
        run.assert_not_called()
        for port in ('0', '65536'):
            with self.assertRaises(SystemExit):
                serve.main(['--port', port])


class LifespanTests(unittest.IsolatedAsyncioTestCase):
    setUp = FactoryTests.setUp
    make = FactoryTests.make

    async def test_audit_uses_warm_executor_and_shutdown_closes(self):
        app = self.make()
        async with app.router.lifespan_context(app):
            self.assertEqual(app.state.parcel_snapshot['status'], 'artifact_ready')
            self.assertFalse(app.state.parcel_snapshot['operationallyApproved'])
            self.assertEqual(self.executor.closed, 0)
        self.assertEqual(self.executor.closed, 1)

    async def test_startup_failure_still_closes(self):
        @asynccontextmanager
        async def failed(app):
            raise RuntimeError('artificial startup failure')
            yield
        original = api.create_app
        def factory():
            app = original()
            app.router.lifespan_context = failed
            return app
        with patch.object(api, 'create_app', side_effect=factory):
            app = self.make()
        with self.assertRaises(RuntimeError):
            async with app.router.lifespan_context(app):
                pass
        self.assertEqual(self.executor.closed, 1)

    async def test_body_failure_still_closes(self):
        app = self.make()
        with self.assertRaises(RuntimeError):
            async with app.router.lifespan_context(app):
                raise RuntimeError('fixture')
        self.assertEqual(self.executor.closed, 1)

