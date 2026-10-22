"""Strict, metadata-only transport for the closed bounded parcel cache."""
from dataclasses import asdict, dataclass, replace
import hashlib
import json
import os
from pathlib import Path

import parcel_runtime as parcel
import parcel_gpu_serving as adapter
import runner_runtime as runtime

DESCRIPTOR_SHA256 = '41be154569ace87d85bae5dc12b77eb7d08ffcb52616bb2e075f00c1300e21eb'
SOURCES = ('parcel_warm_model.py', 'parcel_warm_protocol.py', 'parcel_warm_worker.py',
           'parcel_warm_runtime.py', 'serve_parcel.py')
METADATA_LIMIT = 65536
FRAME_LIMIT = parcel.MAX_BASE64_CHARS + 8192
FILES = frozenset(('ready.json', 'slot.in.json', 'slot.out.json', 'stop.json'))


def require(ok):
    if not ok:
        raise parcel.ParcelUnavailable('Warm parcel unavailable')


def native_limits():
    """Explicit warm lifetime; every other original containment limit is retained."""
    return replace(parcel.parcel_limits(), max_wall_seconds=120, max_fit_seconds=120)


def policy():
    return dict(profile='parcel_warm_worker_120s_v2',
                retire_after_seconds=110, request_deadline_seconds=25,
                reuse_before_seconds=90, idle_seconds=12, max_frames=12,
                native_limits=asdict(native_limits()), operationally_approved=False)


@dataclass(frozen=True)
class WarmBundle:
    path: Path
    sha256: str
    artifacts: parcel.ParcelGPUArtifacts
    bindings: dict


def read_json(path, limit):
    return adapter.read_json(Path(path), limit)


def _canonical(path):
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts)
    checked = runtime._validate_output_path(path)
    require(path == checked)
    return checked


def temporary(directory):
    directory = parcel._directory(directory)
    require(directory.is_dir())
    path = _canonical(directory / 'tmp')
    path.mkdir(exist_ok=True)
    require(path.is_dir())
    return path


def write_json(path, value, limit):
    path = Path(path)
    require(path.name in FILES and path.parent.name == 'tmp')
    require(temporary(path.parent.parent) == path.parent)
    require(_canonical(path) == path)
    payload = (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode()
    require(0 < len(payload) <= limit)
    part = path.with_name(path.name + '.part')
    _canonical(part)
    # Windows rename refuses an existing destination. Never replace pending data.
    require(os.name == 'nt')
    with part.open('xb') as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    part.rename(path)


def _code():
    return {name: runtime.sha256_file(adapter.safe_path('research/' + name)) for name in SOURCES}


def _descriptor(path, pin):
    require(pin == DESCRIPTOR_SHA256)
    artifacts = parcel.ParcelGPUArtifacts(_canonical(path), pin)
    bindings = parcel._bindings(artifacts)  # compact metadata, including original source checks
    return artifacts, bindings


def load_bundle(path, expected_sha256):
    path = _canonical(path)
    require(isinstance(expected_sha256, str) and parcel.HASH.fullmatch(expected_sha256))
    value = adapter.read_json(path, METADATA_LIMIT, expected_sha=expected_sha256)
    require(set(value) == {'schema_version','kind','descriptor','descriptorSha256','bindings','code','policy'})
    require(type(value['schema_version']) is int and value['schema_version'] == 1
            and value['kind'] == 'parcel_warm_bundle_v1'
            and adapter.digest(value['policy']) == adapter.digest(policy())
            and value['code'] == _code())
    artifacts, bindings = _descriptor(Path(value['descriptor']), value['descriptorSha256'])
    require(value['bindings'] == bindings)
    return WarmBundle(path, expected_sha256, artifacts, bindings)


def create_bundle(output, descriptor_path, descriptor_sha256):
    output = _canonical(output)
    artifacts, bindings = _descriptor(Path(descriptor_path), descriptor_sha256)
    value = dict(schema_version=1, kind='parcel_warm_bundle_v1', descriptor=str(artifacts.descriptor_path),
                 descriptorSha256=descriptor_sha256, bindings=bindings, code=_code(), policy=policy())
    payload = (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode()
    require(len(payload) <= METADATA_LIMIT)
    with output.open('xb') as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    return load_bundle(output, hashlib.sha256(payload).hexdigest())


def frame_request(request_id, image_base64, artifacts):
    parcel._uuid(request_id)
    require(type(artifacts) is parcel.ParcelGPUArtifacts)
    data = parcel._image(image_base64)
    return dict(requestId=request_id, mode='predict', imageBase64=image_base64,
                evidenceSha256=hashlib.sha256(data).hexdigest(), bindings=parcel._bindings(artifacts),
                **parcel._artifact_request(artifacts))


def frame_envelope(cache_id, bundle, request):
    value = dict(schema_version=1, kind='parcel_warm_frame_v1', cacheId=cache_id,
                 bundleSha256=bundle.sha256, request=request)
    parse_frame(value, cache_id, bundle)
    return value


def parse_frame(envelope, cache_id, bundle):
    parcel._uuid(cache_id)
    require(type(envelope) is dict and set(envelope) ==
            {'schema_version','kind','cacheId','bundleSha256','request'})
    require(type(envelope['schema_version']) is int and envelope['schema_version'] == 1
            and envelope['kind'] == 'parcel_warm_frame_v1' and envelope['cacheId'] == cache_id
            and envelope['bundleSha256'] == bundle.sha256)
    request = envelope['request']
    require(type(request) is dict)
    artifacts = parcel._request_artifacts(request)
    require(artifacts == bundle.artifacts and request['mode'] == 'predict')
    parcel._uuid(request['requestId'])
    require(request['bindings'] == bundle.bindings and parcel._bindings(artifacts) == bundle.bindings)
    data = parcel._image(request['imageBase64'])
    require(hashlib.sha256(data).hexdigest() == request['evidenceSha256'])
    return request
