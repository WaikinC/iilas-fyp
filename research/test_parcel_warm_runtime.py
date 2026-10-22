"""Tiny native process fixtures; no model, dataset image or acceptance bypass."""
import asyncio
import base64
from contextlib import contextmanager
from dataclasses import dataclass
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import types
import unittest
import uuid
from unittest.mock import patch

import parcel_runtime as parcel
try:
    import parcel_warm_runtime as warm
except ImportError:
    warm = None

ROOT = Path(__file__).resolve().parents[1]
BINDINGS = dict(modelVersion='a'*64, selectionSha256='b'*64, evaluationSha256='c'*64)
IMAGE = base64.b64encode(b'artificial encoded fixture').decode()


def preserve_fixture_diagnostics(directory, destination):
    """Copy only bounded native receipts after stock reap, before stock cleanup."""
    destination.mkdir(parents=True, exist_ok=False)
    for name in ('manager.json', 'worker.result.json', 'worker.stderr.log'):
        source = directory/name
        if not source.exists():
            continue
        if source.is_symlink() or source.is_junction() or not source.is_file():
            raise ValueError('Unsafe fixture diagnostic')
        with source.open('rb') as stream:
            data = stream.read(65537)
        if len(data) > 65536:
            raise ValueError('Oversized fixture diagnostic')
        with (destination/name).open('xb') as stream:
            stream.write(data)


class FixtureDiagnosticsTests(unittest.TestCase):
    def test_failed_manager_context_is_preserved_before_stock_cleanup(self):
        import tempfile
        with tempfile.TemporaryDirectory(dir=ROOT/'outputs') as temporary:
            root = Path(temporary)
            source = root/'source'
            source.mkdir()
            (source/'manager.json').write_text('{"status":"failed"}')
            (source/'worker.result.json').write_text('{"reason":"fixture monitoring failure"}')
            (source/'worker.stderr.log').write_text('fixture traceback')
            (source/'input.json').write_text('must never archive input')
            destination = root/'archive'
            preserve_fixture_diagnostics(source, destination)
            self.assertEqual(set(p.name for p in destination.iterdir()),
                {'manager.json', 'worker.result.json', 'worker.stderr.log'})
            self.assertEqual((destination/'worker.result.json').read_text(),
                '{"reason":"fixture monitoring failure"}')
            with self.assertRaises(FileExistsError):
                preserve_fixture_diagnostics(source, destination)


def fixture_worker(directory, scenario):
    import runner_runtime as native
    native.require_supervised_worker()
    assert 'IILAS_RESEARCH_TOKEN' not in os.environ
    directory = Path(directory)
    temporary = directory/'tmp'
    temporary.mkdir(exist_ok=True)
    request = json.loads((directory/'input.json').read_text())
    cache_id = request['requestId']
    def write(name, value):
        pending = temporary/(name+'.part')
        native.write_json_exclusive(pending, value)
        pending.rename(temporary/name)
    write('ready.json', dict(schema_version=1, kind='parcel_warm_ready_v1', cacheId=cache_id,
        bundleSha256='d'*64, bindings=BINDINGS, operationally_approved=False))
    first = True
    while True:
        if (temporary/'stop.json').exists():
            return
        if (temporary/'slot.out.json').exists():
            time.sleep(.01)
            continue
        if not first:
            if not (temporary/'slot.in.json').exists():
                time.sleep(.01)
                continue
            request = json.loads((temporary/'slot.in.json').read_text())['request']
        first = False
        if scenario == 'hang':
            subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
            time.sleep(60)
        if scenario == 'slow':
            time.sleep(.35)
        if scenario == 'crash':
            return
        result = dict(requestId=request['requestId'], status='predicted', label='Normal',
            confidence=.8, probabilities=[.8,.2], confidenceMeaning='uncalibrated',
            model='MobileNetV2', **BINDINGS, evidenceSha256=request['evidenceSha256'],
            preprocessing='rgb-letterbox224-v1', contrast='clahe', processingTimeMs=1.,
            humanReviewRequired=True, operationally_approved=False,
            classOrder=['Normal','Damaged'], acceptanceSha256=None)
        envelope = dict(schema_version=1, kind='parcel_warm_result_v1', cacheId=cache_id,
            bundleSha256='d'*64, requestId=request['requestId'], result=result)
        if scenario == 'foreign':
            envelope['cacheId'] = str(uuid.uuid4())
        elif scenario == 'approved':
            result['operationally_approved'] = True
        elif scenario == 'unknown_cleanup':
            (directory/'unrecognised.txt').write_text('fixture')
        write('slot.out.json', envelope)


def fixture_manager(directory, scenario):
    parcel.manage(Path(directory), worker_command=lambda p: [
        sys.executable, __file__, '_worker', str(p), scenario])


class WarmProfileBoundaryTests(unittest.TestCase):
    def test_reuse_admission_boundary_and_original_request_deadline(self):
        executor = warm.WarmParcelExecutor(Path(__file__), 'd'*64)
        cache = types.SimpleNamespace(retiring=False, manager=types.SimpleNamespace(poll=lambda: None),
            started=0., last_used=89., seen={'first'})
        with patch.object(warm.time, 'monotonic', return_value=89.999):
            self.assertTrue(executor._reusable(cache))
        with patch.object(warm.time, 'monotonic', return_value=90.):
            self.assertFalse(executor._reusable(cache))
        with patch.object(warm.time, 'monotonic', return_value=24.999):
            executor._deadline(0., None)
        with patch.object(warm.time, 'monotonic', return_value=25.):
            with self.assertRaises(parcel.ParcelTimeout): executor._deadline(0., None)


@unittest.skipUnless(os.name == 'nt', 'Windows native containment')
class WarmRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.assertIsNotNone(warm, 'The bounded warm executor has not been implemented')
        self.artifacts = parcel.ParcelGPUArtifacts(
            ROOT/'research/datasets/warm-runtime-fixture/descriptor.json', 'b'*64)
        self.bundle = types.SimpleNamespace(path=ROOT/'research/datasets/warm-runtime-fixture/bundle.json',
            sha256='d'*64, artifacts=self.artifacts, bindings=BINDINGS)
        self.patches = [patch.object(warm.protocol, 'load_bundle', return_value=self.bundle),
                        patch.object(parcel, '_bindings', return_value=BINDINGS)]
        for item in self.patches:
            item.start()
        self.executors = []
        self.diagnostic_errors = []

    def executor(self, scenario='success'):
        value = warm.WarmParcelExecutor(self.bundle.path, self.bundle.sha256,
            manager_command=lambda directory: [sys.executable, __file__, '_manager', str(directory), scenario])
        self.executors.append(value)
        original_reap = value._cold._reap
        async def reap_with_diagnostics(job, manager, request_id):
            try:
                return await original_reap(job, manager, request_id)
            finally:
                # Diagnostic failure must never skip stock cleanup after reap.
                try:
                    destination = (ROOT/'outputs/parcel-warm-integration-20261022'
                        /'runtime-fixture-diagnostics'/self._testMethodName/request_id)
                    preserve_fixture_diagnostics(parcel.REQUEST_ROOT/request_id, destination)
                except Exception as error:
                    self.diagnostic_errors.append(repr(error))
        value._cold._reap = reap_with_diagnostics
        return value

    async def asyncTearDown(self):
        for executor in getattr(self, 'executors', []):
            await executor.aclose()
        for item in reversed(getattr(self, 'patches', [])):
            item.stop()
        self.assertEqual(getattr(self, 'diagnostic_errors', []), [])

    async def run_frame(self, executor, identity=None, cancel=None):
        return await executor.run(identity or str(uuid.uuid4()), IMAGE, self.artifacts, cancel)

    async def test_two_request_ids_share_one_job_then_close_drains_and_deletes(self):
        executor = self.executor()
        first = await self.run_frame(executor)
        cache = executor._cache
        process = cache.manager
        second = await self.run_frame(executor)
        self.assertNotEqual(first['requestId'], second['requestId'])
        self.assertIs(executor._cache, cache)
        self.assertEqual(first['probabilities'], second['probabilities'])
        self.assertFalse(first['operationally_approved'])
        self.assertFalse(executor.busy)
        await executor.aclose()
        self.assertIsNotNone(process.poll())
        self.assertFalse(cache.directory.exists())
        self.assertFalse((parcel.REQUEST_ROOT/'active.json').exists())

    async def test_concurrent_request_rejected_without_queue(self):
        executor = self.executor('slow')
        first = asyncio.create_task(self.run_frame(executor))
        await asyncio.sleep(.05)
        with self.assertRaises(parcel.ParcelBusy):
            await self.run_frame(executor)
        await first

    async def test_duplicate_uuid_rejected_and_cache_drained(self):
        executor = self.executor()
        identity = str(uuid.uuid4())
        await self.run_frame(executor, identity)
        cache = executor._cache
        with self.assertRaises(parcel.ParcelInvalidInput):
            await self.run_frame(executor, identity)
        self.assertFalse(cache.directory.exists())

    async def test_foreign_result_is_unavailable_and_drained(self):
        executor = self.executor('foreign')
        with self.assertRaises(parcel.ParcelUnavailable):
            await self.run_frame(executor)
        self.assertIsNone(executor._cache)

    async def test_self_approval_rejected(self):
        with self.assertRaises(parcel.ParcelUnavailable):
            await self.run_frame(self.executor('approved'))

    async def test_manager_exit_without_response_is_unavailable(self):
        with self.assertRaises(parcel.ParcelUnavailable):
            await self.run_frame(self.executor('crash'))

    async def test_cancel_event_kills_descendants_before_release(self):
        executor = self.executor('hang')
        cancel = asyncio.Event()
        task = asyncio.create_task(self.run_frame(executor, cancel=cancel))
        await asyncio.sleep(.3)
        cache = executor._cache
        cancel.set()
        with self.assertRaises(parcel.ParcelCancelled):
            await task
        self.assertIsNone(executor._cache)
        self.assertFalse(cache.directory.exists())
        self.assertIsNotNone(cache.manager.poll())

    async def test_task_cancellation_shield_awaits_cleanup(self):
        executor = self.executor('hang')
        task = asyncio.create_task(self.run_frame(executor))
        await asyncio.sleep(.3)
        cache = executor._cache
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertFalse(cache.directory.exists())
        self.assertIsNone(executor._cache)

    async def test_expiry_rotates_only_after_old_process_exit(self):
        executor = self.executor()
        await self.run_frame(executor)
        old = executor._cache
        old.started -= warm.protocol.policy()['reuse_before_seconds'] + 1
        await self.run_frame(executor)
        self.assertIsNot(executor._cache, old)
        self.assertFalse(old.directory.exists())
        self.assertIsNotNone(old.manager.poll())

    async def test_idle_watchdog_drains_without_new_request(self):
        executor = self.executor()
        await self.run_frame(executor)
        old = executor._cache
        old.last_used -= 13
        for _ in range(200):
            if executor._cache is None:
                break
            await asyncio.sleep(.02)
        self.assertIsNone(executor._cache)
        self.assertFalse(old.directory.exists())

    async def test_pre_cancelled_and_closed_executor_do_not_spawn(self):
        executor = self.executor()
        cancel = asyncio.Event()
        cancel.set()
        with self.assertRaises(parcel.ParcelCancelled):
            await self.run_frame(executor, cancel=cancel)
        self.assertIsNone(executor._cache)
        await executor.aclose()
        with self.assertRaises(parcel.ParcelUnavailable):
            await self.run_frame(executor)

    async def test_close_cancels_active_request_and_is_idempotent(self):
        executor = self.executor('hang')
        task = asyncio.create_task(self.run_frame(executor))
        await asyncio.sleep(.3)
        await executor.aclose()
        with self.assertRaises((parcel.ParcelCancelled, parcel.ParcelUnavailable)):
            await task
        await executor.aclose()
        self.assertIsNone(executor._cache)

    async def test_deadline_times_out_and_drains(self):
        executor = self.executor('hang')
        policy = warm.protocol.policy()
        with patch.object(warm.protocol, 'policy', return_value={**policy, 'request_deadline_seconds': .5}):
            with self.assertRaises(parcel.ParcelTimeout):
                await self.run_frame(executor)
        self.assertIsNone(executor._cache)

    async def test_shutdown_sends_stop_before_reaping(self):
        executor = self.executor()
        await self.run_frame(executor)
        cache = executor._cache
        original = executor._cold._reap
        observed = []
        async def reap(*args):
            observed.append((cache.directory/'tmp/stop.json').is_file())
            await original(*args)
        with patch.object(executor._cold, '_reap', side_effect=reap):
            await executor.aclose()
        self.assertEqual(observed, [True])

    async def test_existing_request_directory_is_never_deleted(self):
        import parcel_gpu_train as gpu
        import runner_runtime as native
        @contextmanager
        def fake_lease():
            yield {'retain':False}
        identity = str(uuid.uuid4())
        directory = native.create_run_directory(parcel.REQUEST_ROOT/identity)
        saved = directory/'input.json'
        saved.write_text('existing artificial request; do not replace')
        executor = self.executor()
        try:
            with patch.object(gpu, 'exclusive_job', fake_lease):
                with self.assertRaises(parcel.ParcelUnavailable):
                    await self.run_frame(executor, identity)
            self.assertEqual(saved.read_text(), 'existing artificial request; do not replace')
        finally:
            # Only remove this fixture's exact file and empty fixture directory.
            saved.unlink(missing_ok=True)
            if directory.exists():
                directory.rmdir()
            executor._cache = None

    async def test_unknown_cleanup_retains_lease_and_blocks_successor(self):
        executor = self.executor('unknown_cleanup')
        await self.run_frame(executor)
        cache = executor._cache
        try:
            with self.assertRaises(parcel.ParcelUnavailable):
                await executor.aclose()
            self.assertTrue(executor.busy)
            self.assertTrue(cache.guard['retain'])
            self.assertIsNotNone(cache.manager.poll())
            self.assertTrue(cache.directory.exists())
            with self.assertRaises(parcel.ParcelUnavailable):
                await self.run_frame(executor)
        finally:
            # Model process is already reaped. Reconcile only the deliberately
            # inserted fixture file, then the stock known-file cleanup plan.
            (cache.directory/'unrecognised.txt').unlink()
            parcel._cleanup(cache.directory)
            cache.guard['retain'] = False
            cache.lease.__exit__(None, None, None)
            executor._cache = None

    async def test_changed_source_identity_drains_retained_worker(self):
        executor = self.executor()
        await self.run_frame(executor)
        old = executor._cache
        with patch.object(warm.protocol, 'load_bundle', side_effect=parcel.ParcelUnavailable('Changed source')):
            with self.assertRaises(parcel.ParcelUnavailable):
                await self.run_frame(executor)
        self.assertIsNone(executor._cache)
        self.assertFalse(old.directory.exists())

    async def test_audit_drains_cache_and_delegates_without_loading_model(self):
        executor = self.executor()
        await self.run_frame(executor)
        old = executor._cache
        async def audit(artifacts, cancel):
            self.assertIsNone(executor._cache)
            self.assertFalse(old.directory.exists())
            return {'status':'artifact_ready','operationally_approved':False}
        with patch.object(executor._cold, 'audit', side_effect=audit):
            result = await executor.audit(self.artifacts)
        self.assertFalse(result['operationally_approved'])

    async def test_known_failed_manager_cannot_publish_valid_cached_result(self):
        executor = self.executor()
        identity = str(uuid.uuid4())
        request = warm.protocol.frame_request(identity, IMAGE, self.artifacts)
        cache = types.SimpleNamespace(directory=parcel.REQUEST_ROOT/identity,
            bundle=self.bundle, manager=types.SimpleNamespace(poll=lambda: 0, returncode=0))
        temporary = cache.directory/'tmp'
        temporary.mkdir(parents=True)
        result = dict(requestId=identity,status='predicted',label='Normal',confidence=.8,
            probabilities=[.8,.2], confidenceMeaning='uncalibrated', model='MobileNetV2',
            **BINDINGS,evidenceSha256=request['evidenceSha256'],preprocessing='rgb-letterbox224-v1',
            contrast='clahe',processingTimeMs=1.,humanReviewRequired=True,
            operationally_approved=False,classOrder=['Normal','Damaged'],acceptanceSha256=None)
        parcel.runtime.write_json_exclusive(cache.directory/'manager.json',
            dict(status='failed',reason='resource_or_worker'))
        warm.protocol.write_json(temporary/'ready.json', dict(schema_version=1,
            kind='parcel_warm_ready_v1',cacheId=identity,bundleSha256='d'*64,
            bindings=BINDINGS,operationally_approved=False),65536)
        warm.protocol.write_json(temporary/'slot.out.json', dict(schema_version=1,
            kind='parcel_warm_result_v1',cacheId=identity,bundleSha256='d'*64,
            requestId=identity,result=result),65536)
        try:
            with self.assertRaises(parcel.ParcelUnavailable):
                await executor._receive(cache,request,time.monotonic(),None)
        finally:
            parcel._cleanup(cache.directory)

    async def test_known_mutex_contention_releases_unowned_leases(self):
        import parcel_gpu_train as gpu
        released=[]
        @contextmanager
        def lease():
            guard={'retain':False}
            try:
                yield guard
            finally:
                released.append(not guard['retain'])
        executor = self.executor()
        with patch.object(gpu,'exclusive_job',lease), patch.object(parcel,'_Mutex',
                side_effect=parcel.ParcelBusy('Other worker owns mutex')):
            with self.assertRaises(parcel.ParcelBusy):
                await self.run_frame(executor)
        self.assertEqual(released,[True])
        self.assertIsNone(executor._cache)
        self.assertFalse(executor.busy)

    async def test_manager_failure_during_final_identity_check_cannot_return_success(self):
        executor = self.executor()
        identity = str(uuid.uuid4())
        directory = parcel.REQUEST_ROOT/identity
        (directory/'tmp').mkdir(parents=True)
        (directory/'tmp/slot.out.json').write_text('{}')
        ended=[False]
        manager=types.SimpleNamespace(poll=lambda:1 if ended[0] else None, returncode=1)
        cache=types.SimpleNamespace(directory=directory,manager=manager,bundle=self.bundle,
            started=time.monotonic(),last_used=time.monotonic(),retiring=False,seen={identity})
        loads=[0]
        def load(*args):
            loads[0]+=1
            if loads[0]==2:
                parcel.runtime.write_json_exclusive(directory/'manager.json',
                    dict(status='failed',reason='resource_or_worker'))
                ended[0]=True
            return self.bundle
        def start(*args):
            executor._cache=cache
            return cache
        async def receive(*args):
            return {'requestId':identity}
        async def dispose():
            executor._cache=None
        try:
            with patch.object(warm.protocol,'load_bundle',side_effect=load), \
                    patch.object(executor,'_start',side_effect=start), \
                    patch.object(executor,'_receive',side_effect=receive), \
                    patch.object(executor,'_dispose',side_effect=dispose):
                with self.assertRaises(parcel.ParcelUnavailable):
                    await self.run_frame(executor,identity)
        finally:
            executor._cache=None
            parcel._cleanup(directory)

    async def test_retirement_boundary_is_110_seconds_even_when_active(self):
        executor = self.executor()
        cache = types.SimpleNamespace(started=0., last_used=109., retiring=False,
            manager=types.SimpleNamespace(poll=lambda: None))
        executor._cache = cache
        executor._busy = True
        async def finish_tick(_):
            executor._cache = None
        for now, expected in ((109.999, False), (110., True)):
            cache.retiring = False
            executor._cache = cache
            with patch.object(warm.time, 'monotonic', return_value=now), patch.object(warm.asyncio, 'sleep', side_effect=finish_tick):
                await executor._watch(cache)
            self.assertEqual(cache.retiring, expected)
        executor._busy = False

    async def _watcher_cleanup_failure(self, idle):
        import gc
        executor = self.executor()
        loop = asyncio.get_running_loop()
        previous = loop.get_exception_handler()
        errors = []
        loop.set_exception_handler(lambda loop, context: errors.append(context))
        cache = types.SimpleNamespace(started=time.monotonic(),
            last_used=time.monotonic() - (13 if idle else 0), retiring=False,
            manager=types.SimpleNamespace(poll=lambda: None), owns_directory=True,
            directory=parcel.REQUEST_ROOT/str(uuid.uuid4()), job=None,
            guard={'retain': True}, dispose_task=None, watcher=None)
        executor._cache = cache
        try:
            with patch.object(warm.protocol, 'write_json', side_effect=ValueError('fixture stop failure')), \
                    patch.object(parcel, '_cleanup', side_effect=parcel.ParcelUnavailable('fixture cleanup failure')):
                cache.watcher = asyncio.create_task(executor._watch(cache))
                if idle:
                    for _ in range(10):
                        await asyncio.sleep(.01)
                        if cache.watcher.done(): break
                with self.assertRaises(parcel.ParcelUnavailable):
                    await executor.aclose()
                await asyncio.sleep(.01)
                self.assertTrue(cache.watcher.done())
                self.assertIsNone(cache.watcher.exception(), 'Watcher must consume its owned cleanup failure')
                self.assertTrue(executor._fault)
                self.assertIs(executor._cache, cache)
                self.assertTrue(cache.guard['retain'])
                self.assertIsNotNone(cache.dispose_task.exception())
                with self.assertRaises(parcel.ParcelUnavailable):
                    executor._admit(None)
                with self.assertRaises(parcel.ParcelUnavailable):
                    await self.run_frame(executor)
                with self.assertRaises(parcel.ParcelUnavailable):
                    await executor.aclose()
                cache.watcher = None
                gc.collect()
                await asyncio.sleep(0)
                self.assertEqual(errors, [])
        finally:
            executor._cache = None  # Artificial cache has no process, files or leases.
            loop.set_exception_handler(previous)

    async def test_idle_watch_cleanup_failure_has_no_orphan_task_error(self):
        await self._watcher_cleanup_failure(True)

    async def test_close_cleanup_failure_has_no_orphan_task_error(self):
        await self._watcher_cleanup_failure(False)

    async def test_active_first_request_is_not_an_idle_cache(self):
        executor = self.executor('slow')
        task = asyncio.create_task(self.run_frame(executor))
        try:
            await asyncio.sleep(.02)
            cache = executor._cache
            self.assertIsNotNone(cache)
            cache.last_used -= 13
            await asyncio.sleep(.06)
            self.assertFalse(cache.retiring, 'Active loading/prediction is not idle time')
        finally:
            await asyncio.gather(task, return_exceptions=True)


if __name__ == '__main__':
    if len(sys.argv)>1 and sys.argv[1]=='_manager':
        fixture_manager(sys.argv[2], sys.argv[3])
    elif len(sys.argv)>1 and sys.argv[1]=='_worker':
        fixture_worker(sys.argv[2], sys.argv[3])
    else:
        unittest.main()
