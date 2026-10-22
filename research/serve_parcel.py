"""Loopback factory for the bounded parcel executor; acceptance remains closed."""
import argparse
from contextlib import asynccontextmanager
import os
from pathlib import Path
from threading import RLock

import api
import parcel_warm_protocol as protocol
from parcel_warm_runtime import WarmParcelExecutor

_CONFIG_LOCK = RLock()
_BUNDLE = 'IILAS_PARCEL_WARM_BUNDLE'
_BUNDLE_SHA = 'IILAS_PARCEL_WARM_BUNDLE_SHA256'
_GPU = 'IILAS_PARCEL_GPU_DESCRIPTOR'
_GPU_SHA = 'IILAS_PARCEL_GPU_DESCRIPTOR_SHA256'


def _pair(path, digest):
    if not path or not digest:
        raise ValueError('Complete server-owned warm bundle configuration required.')
    return Path(path).absolute(), digest


def create_app(bundle_path=None, bundle_sha256=None):
    """Capture validated metadata, compose the original API and close on exit."""
    with _CONFIG_LOCK:
        env_path, env_digest = os.environ.get(_BUNDLE, ''), os.environ.get(_BUNDLE_SHA, '')
        explicit = bundle_path is not None or bundle_sha256 is not None
        selected = _pair(bundle_path, bundle_sha256) if explicit else _pair(env_path, env_digest)
        if env_path or env_digest:
            if _pair(env_path, env_digest) != selected:
                raise ValueError('Conflicting server-owned warm bundle configuration.')
        bundle = protocol.load_bundle(*selected)
        if any(os.environ.get(key, '') for key in ('IILAS_PARCEL_SELECTION', 'IILAS_PARCEL_TEST_DIRECTORY')):
            raise ValueError('Conflicting legacy parcel configuration.')
        descriptor = str(bundle.artifacts.descriptor_path)
        descriptor_sha = bundle.artifacts.descriptor_sha256
        old = {key: os.environ.get(key) for key in (_GPU, _GPU_SHA)}
        if any(old.values()):
            if not all(old.values()) or (Path(old[_GPU]).absolute(), old[_GPU_SHA]) != (bundle.artifacts.descriptor_path, descriptor_sha):
                raise ValueError('Conflicting GPU parcel configuration.')
        try:
            os.environ[_GPU], os.environ[_GPU_SHA] = descriptor, descriptor_sha
            application = api.create_app()
        finally:
            for key, value in old.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
        executor = WarmParcelExecutor(bundle.path, bundle.sha256)
        application.state.parcel_executor = executor
        original_lifespan = application.router.lifespan_context

        @asynccontextmanager
        async def lifespan(app):
            try:
                async with original_lifespan(app) as state:
                    yield state
            finally:
                await executor.aclose()

        application.router.lifespan_context = lifespan
        return application


def main(argv=None):
    parser = argparse.ArgumentParser(description='Bounded loopback parcel research service')
    parser.add_argument('--port', type=int, required=True)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error('Port must be between 1 and 65535.')
    if not os.environ.get('IILAS_RESEARCH_TOKEN', '').strip():
        parser.error('Existing service authentication environment is required.')
    application = create_app()
    import uvicorn
    uvicorn.run(application, host='127.0.0.1', port=args.port)


if __name__ == '__main__':
    main()
