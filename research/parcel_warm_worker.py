"""One supervised, bounded reuse worker behind the unchanged parcel manager."""
import argparse
import importlib
from pathlib import Path
import sys
import time

import parcel_runtime as parcel
import parcel_warm_protocol as protocol
import runner_runtime as runtime


def _identity(bundle):
    current = protocol.load_bundle(bundle.path, bundle.sha256)
    protocol.require(current == bundle)


def _stop(value, cache_id, bundle):
    protocol.require(set(value) == {'schema_version','kind','cacheId','bundleSha256'}
                     and type(value['schema_version']) is int and value['schema_version'] == 1
                     and value['kind'] == 'parcel_warm_stop_v1'
                     and value['cacheId'] == cache_id and value['bundleSha256'] == bundle.sha256)


def infer(directory, bundle_path, bundle_sha256):
    runtime.require_supervised_worker()
    directory = parcel._directory(directory)
    started = time.monotonic()
    # Parent writes this exclusive marker at cache creation before either process.
    initial_age = max(0.0, time.time() - (directory/'owner.json').stat().st_mtime)
    age = lambda: initial_age + time.monotonic() - started
    import parcel_train
    parcel_train.worker_environment(directory)  # Must precede reuse module and image decoding.
    bundle = protocol.load_bundle(Path(bundle_path), bundle_sha256)
    policy = protocol.policy()
    temporary = protocol.temporary(directory)
    cache_id = directory.name
    request = protocol.read_json(directory/'input.json', protocol.FRAME_LIMIT)
    protocol.require(request.get('requestId') == cache_id)
    protocol.parse_frame(protocol.frame_envelope(cache_id,bundle,request),cache_id,bundle)
    protocol.require(not any((temporary/name).exists() for name in protocol.FILES))
    model = importlib.import_module('parcel_warm_model')
    context = None
    seen = set()
    last = time.monotonic()
    try:
        _identity(bundle)
        context = model.load_context(bundle.artifacts.descriptor_path,bundle.artifacts.descriptor_sha256)
        _identity(bundle)
        protocol.write_json(temporary/'ready.json',dict(schema_version=1,kind='parcel_warm_ready_v1',
            cacheId=cache_id,bundleSha256=bundle.sha256,bindings=bundle.bindings,
            operationally_approved=False),protocol.METADATA_LIMIT)
        while True:
            # Only the first root frame is committed across startup/retirement.
            protocol.require(request['requestId'] not in seen)
            seen.add(request['requestId'])
            failed = False
            try:
                _identity(bundle)
                protocol.parse_frame(protocol.frame_envelope(cache_id,bundle,request),cache_id,bundle)
                data = parcel._image(request['imageBase64'])
                if len(seen) > 1 and age() >= policy['reuse_before_seconds']:
                    return
                result = model.predict(context,data)
                _identity(bundle)
                result = dict(result,requestId=request['requestId'])
                result = parcel._validate_result(result,request)
            except Exception:
                result = dict(error='unavailable',requestId=request['requestId'])
                failed = True
            protocol.write_json(temporary/'slot.out.json',dict(schema_version=1,kind='parcel_warm_result_v1',
                cacheId=cache_id,bundleSha256=bundle.sha256,requestId=request['requestId'],result=result),
                protocol.METADATA_LIMIT)
            last = time.monotonic()
            if failed or len(seen) >= policy['max_frames'] or age() >= policy['retire_after_seconds']:
                return
            while True:
                stop = temporary/'stop.json'
                if stop.exists():
                    _stop(protocol.read_json(stop,protocol.METADATA_LIMIT),cache_id,bundle)
                    return
                if age() >= policy['retire_after_seconds'] or time.monotonic()-last >= policy['idle_seconds']:
                    return
                output = temporary/'slot.out.json'
                incoming = temporary/'slot.in.json'
                # Never consume an input while output is awaiting ordered ACK.
                if not output.exists() and incoming.exists():
                    if age() >= policy['reuse_before_seconds']:
                        return
                    request = protocol.parse_frame(protocol.read_json(incoming,protocol.FRAME_LIMIT),cache_id,bundle)
                    protocol.require(request['requestId'] not in seen)
                    break
                time.sleep(.02)
    finally:
        if context is not None:
            # predict may already invalidate its context on failure. Exit still
            # drops all model state through native process/Job retirement.
            try:
                model.close_context(context)
            except ValueError:
                pass


def manage(directory,bundle_path,bundle_sha256):
    bundle = protocol.load_bundle(Path(bundle_path),bundle_sha256)
    parcel.manage(directory,limits=protocol.native_limits(),worker_command=lambda path:[sys.executable,str(Path(__file__).absolute()),
        '_worker',str(path),'--bundle',str(bundle.path),'--bundle-sha256',bundle.sha256])


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('mode',choices=('_manage','_worker'))
    parser.add_argument('directory',type=Path)
    parser.add_argument('--bundle',type=Path,required=True)
    parser.add_argument('--bundle-sha256',required=True)
    args = parser.parse_args(argv)
    try:
        (manage if args.mode == '_manage' else infer)(args.directory,args.bundle,args.bundle_sha256)
        return 0
    except Exception:
        return 2  # Do not expose private paths or image data through logs.


if __name__ == '__main__':
    raise SystemExit(main())

