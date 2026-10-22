"""One bounded native Job shared by serial, identity-bound parcel requests.

This internal executor does not grant operational acceptance. The unchanged
warm manager owns explicit 120s native lifetime; the parent owns cancellation, expiry and Job drain.
"""
import asyncio
from dataclasses import dataclass, field
import os
from pathlib import Path
import subprocess
import sys
import time

import parcel_runtime as parcel
import parcel_warm_protocol as protocol
import runner_runtime as native


@dataclass
class _Cache:
    directory: Path
    bundle: object
    started: float
    last_used: float
    lease: object
    guard: dict
    owns_directory: bool = False
    job: object = None
    manager: object = None
    watcher: object = None
    retiring: bool = False
    ready: bool = False
    seen: set = field(default_factory=set)
    dispose_task: object = None


class WarmParcelExecutor:
    def __init__(self, bundle_path, bundle_sha256, *, manager_command=None):
        self.bundle_path = Path(bundle_path)
        self.bundle_sha256 = bundle_sha256
        self._manager_command = manager_command or (lambda directory: [
            sys.executable, str(Path(__file__).with_name('parcel_warm_worker.py')),
            '_manage', str(directory), '--bundle', str(self.bundle_path),
            '--bundle-sha256', self.bundle_sha256])
        self._cold = parcel.ParcelExecutor()
        self._cache = None
        self._busy = False
        self._closed = False
        self._closing = asyncio.Event()
        self._active_done = asyncio.Event()
        self._active_done.set()
        self._fault = False

    @property
    def busy(self):
        return self._busy or self._fault

    def _bundle(self, artifacts):
        bundle = protocol.load_bundle(self.bundle_path, self.bundle_sha256)
        if bundle.artifacts != artifacts:
            raise parcel.ParcelUnavailable('Parcel artifacts unavailable')
        return bundle

    def _admit(self, cancel):
        if self._closed or self._fault:
            raise parcel.ParcelUnavailable('Parcel worker unavailable')
        if self._busy:
            raise parcel.ParcelBusy('Parcel worker busy')
        if cancel is not None and cancel.is_set():
            raise parcel.ParcelCancelled('Parcel request cancelled')
        self._busy = True
        self._active_done.clear()

    def _deadline(self, began, cancel):
        if self._closing.is_set() or (cancel is not None and cancel.is_set()):
            raise parcel.ParcelCancelled('Parcel request cancelled')
        if time.monotonic()-began >= protocol.policy()['request_deadline_seconds']:
            raise parcel.ParcelTimeout('Parcel execution deadline')

    async def audit(self, artifacts, cancel_event=None):
        self._admit(cancel_event)
        try:
            if type(artifacts) is parcel.ParcelGPUArtifacts:
                self._bundle(artifacts)
            await self._dispose()
            return await self._cold.audit(artifacts, cancel_event)
        finally:
            self._busy = False
            self._active_done.set()

    async def run(self, request_id, image_base64, configured_artifacts, cancel_event=None):
        began = time.monotonic()
        parcel._uuid(request_id)
        parcel._image(image_base64)
        self._admit(cancel_event)
        try:
            if type(configured_artifacts) is parcel.ParcelArtifacts:
                await self._dispose()
                self._deadline(began, cancel_event)
                return await self._cold.run(request_id, image_base64, configured_artifacts, cancel_event)
            bundle = self._bundle(configured_artifacts)
            request = protocol.frame_request(request_id, image_base64, configured_artifacts)
            cache = self._cache
            if cache is not None and request_id in cache.seen:
                raise parcel.ParcelInvalidInput('Repeated parcel request identity')
            if cache is not None and not self._reusable(cache):
                await self._dispose()
                cache = None
            self._deadline(began, cancel_event)
            if cache is None:
                cache = self._start(bundle, request)
            else:
                self._check_ready(cache)
                if any((cache.directory/'tmp'/name).exists() for name in ('slot.in.json','slot.out.json')):
                    raise parcel.ParcelUnavailable('Parcel slot unavailable')
                protocol.write_json(cache.directory/'tmp/slot.in.json',
                    protocol.frame_envelope(cache.directory.name, bundle, request), protocol.FRAME_LIMIT)
                cache.seen.add(request_id)
            result = await self._receive(cache, request, began, cancel_event)
            self._deadline(began, cancel_event)
            if self._bundle(configured_artifacts) != bundle:
                raise parcel.ParcelUnavailable('Parcel artifacts changed')
            self._terminal(cache)
            cache.last_used = time.monotonic()
            # ACK input first; output remains a barrier against replay until it
            # too is removed. A fresh request cannot enter before both are gone.
            incoming = cache.directory/'tmp/slot.in.json'
            if incoming.exists():
                incoming.unlink()
            (cache.directory/'tmp/slot.out.json').unlink()
            if not self._reusable(cache):
                await self._dispose()
            self._deadline(began, cancel_event)
            result['totalProcessingTimeMs'] = (time.monotonic()-began)*1000
            return result
        except (parcel.ParcelRuntimeError, asyncio.CancelledError):
            await self._dispose()
            raise
        except Exception:
            await self._dispose()
            raise parcel.ParcelUnavailable('Parcel execution unavailable') from None
        finally:
            self._busy = False
            self._active_done.set()

    def _reusable(self, cache):
        policy = protocol.policy()
        return (not cache.retiring and cache.manager is not None and cache.manager.poll() is None
                and time.monotonic()-cache.started < policy['reuse_before_seconds']
                and time.monotonic()-cache.last_used < policy['idle_seconds']
                and len(cache.seen) < policy['max_frames'])

    def _start(self, bundle, request):
        import parcel_gpu_train as gpu
        import parcel_gpu_runtime as gpu_native
        lease = gpu.exclusive_job()
        guard = lease.__enter__()
        # Keep ownership until the whole request tree and its marker are gone.
        guard['retain'] = False
        cache = _Cache(parcel.REQUEST_ROOT/request['requestId'], bundle,
                       time.monotonic(), time.monotonic(), lease, guard)
        try:
            with parcel._Mutex():
                if ((Path(gpu_native.REGISTRY)/'active-runtime').exists()
                        or (parcel.REQUEST_ROOT/'active.json').exists()):
                    guard['retain'] = True
                    self._fault = True
                    raise parcel.ParcelUnavailable('Parcel recovery requires inspection')
            cache.directory = native.create_run_directory(cache.directory)
        except BaseException:
            # Known contention/exclusive-create failure created no owned work.
            # Preserve any existing directory; release only our acquired leases.
            lease.__exit__(None, None, None)
            raise
        cache.owns_directory = True
        guard['retain'] = True
        self._cache = cache
        cache.job = native._ProcessJob()
        native.write_json_exclusive(cache.directory/'owner.json',
            dict(pid=os.getpid(), jobName=cache.job.name))
        native.write_json_exclusive(cache.directory/'input.json', request)
        protocol.temporary(cache.directory)
        environment = {key: value for key, value in os.environ.items()
            if key.upper() in {'SYSTEMROOT','WINDIR','PATH','PATHEXT','COMSPEC','TEMP','TMP'}}
        cache.manager = subprocess.Popen(self._manager_command(cache.directory), cwd=parcel.ROOT,
            env=environment, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, creationflags=4)
        cache.job.assign(cache.manager)
        cache.job.resume(cache.manager)
        cache.seen.add(request['requestId'])
        cache.watcher = asyncio.create_task(self._watch(cache))
        return cache

    def _check_ready(self, cache):
        value = protocol.read_json(cache.directory/'tmp/ready.json', protocol.METADATA_LIMIT)
        expected = dict(schema_version=1, kind='parcel_warm_ready_v1', cacheId=cache.directory.name,
            bundleSha256=cache.bundle.sha256, bindings=cache.bundle.bindings, operationally_approved=False)
        if value != expected or type(value.get('schema_version')) is not int or value.get('operationally_approved') is not False:
            raise parcel.ParcelUnavailable('Invalid parcel worker readiness')
        cache.ready = True

    def _terminal(self, cache):
        if cache.manager.poll() is None:
            return False
        outcome = parcel._json(cache.directory/'manager.json', 4096)
        if outcome.get('status') == 'busy':
            raise parcel.ParcelBusy('Parcel worker busy')
        if outcome.get('reason') in ('wall_timeout','fit_timeout'):
            raise parcel.ParcelTimeout('Parcel execution deadline')
        if cache.manager.returncode != 0 or outcome.get('status') != 'success':
            raise parcel.ParcelUnavailable('Parcel execution unavailable')
        return True

    async def _receive(self, cache, request, began, cancel):
        path = cache.directory/'tmp/slot.out.json'
        while True:
            self._deadline(began, cancel)
            terminal = self._terminal(cache)
            if path.exists():
                self._check_ready(cache)
                envelope = protocol.read_json(path, protocol.METADATA_LIMIT)
                if (set(envelope) != {'schema_version','kind','cacheId','bundleSha256','requestId','result'}
                        or type(envelope.get('schema_version')) is not int or envelope['schema_version'] != 1
                        or envelope['kind'] != 'parcel_warm_result_v1'
                        or envelope['cacheId'] != cache.directory.name
                        or envelope['bundleSha256'] != cache.bundle.sha256
                        or envelope['requestId'] != request['requestId']
                        or type(envelope['result']) is not dict):
                    raise parcel.ParcelUnavailable('Foreign parcel result')
                return parcel._validate_result(envelope['result'], request)
            if terminal:
                raise parcel.ParcelUnavailable('Parcel execution unavailable')
            await asyncio.sleep(.02)

    async def _watch(self, cache):
        try:
            while self._cache is cache:
                policy = protocol.policy()
                now = time.monotonic()
                if (cache.retiring or cache.manager.poll() is not None or now-cache.started >= policy['retire_after_seconds']
                        or (not self._busy and now-cache.last_used >= policy['idle_seconds'])):
                    cache.retiring = True
                    # An already committed first image may finish within the
                    # original 25s request deadline; never admit a later retiring frame.
                    if not self._busy:
                        await self._dispose()
                        return
                await asyncio.sleep(.02)
        except asyncio.CancelledError:
            raise
        except Exception:
            self._fault = True
            cache.retiring = True
            try:
                await self._dispose()
            except Exception:
                # Watcher owns background observation, not recovery. The failed
                # disposal task and retained ownership still reject run/aclose.
                pass

    async def _dispose(self):
        cache = self._cache
        if cache is None:
            return
        cache.retiring = True
        if cache.dispose_task is None:
            cache.dispose_task = asyncio.create_task(self._drain(cache))
        # Repeated caller cancellation must not abandon the cleanup task.
        interrupted = False
        while not cache.dispose_task.done():
            try:
                await asyncio.shield(cache.dispose_task)
            except asyncio.CancelledError:
                interrupted = True
        cache.dispose_task.result()
        if interrupted:
            raise asyncio.CancelledError()

    async def _drain(self, cache):
        try:
            if not cache.owns_directory:
                # Failed exclusive creation does not transfer ownership of a
                # pre-existing request, even when all its filenames are known.
                raise parcel.ParcelUnavailable('Parcel admission unconfirmed')
            if cache.manager is not None and cache.manager.poll() is None:
                try:
                    protocol.write_json(cache.directory/'tmp/stop.json', dict(schema_version=1,
                        kind='parcel_warm_stop_v1', cacheId=cache.directory.name,
                        bundleSha256=cache.bundle.sha256), protocol.METADATA_LIMIT)
                    until = time.monotonic()+.25
                    while cache.manager.poll() is None and time.monotonic()<until:
                        await asyncio.sleep(.01)
                except Exception:
                    pass  # Native drain remains mandatory if graceful stop fails.
            if cache.job is not None:
                await self._cold._reap(cache.job, cache.manager, cache.directory.name)
            parcel._cleanup(cache.directory)
            marker = parcel.REQUEST_ROOT/'active.json'
            if cache.directory.exists() or marker.exists():
                raise parcel.ParcelUnavailable('Parcel cleanup unconfirmed')
            cache.guard['retain'] = False
            cache.lease.__exit__(None, None, None)
            self._cache = None
        except BaseException:
            self._fault = True
            cache.guard['retain'] = True
            raise

    async def aclose(self):
        self._closed = True
        self._closing.set()
        await self._active_done.wait()
        watcher = self._cache.watcher if self._cache else None
        try:
            await self._dispose()
        finally:
            # Retrieve the watcher outcome even when confirmed cleanup failed.
            if watcher is not None and watcher is not asyncio.current_task():
                await watcher
