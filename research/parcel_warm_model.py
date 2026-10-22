"""Internal, closed model reuse primitive for a disposable supervised Windows Job.

This module has no service, transport, activation or lifetime extension. Its new
source identity must be pinned by a separately reviewed diagnostic; the existing
descriptor does not certify this module. The original cold adapter is unchanged.
Closing a context drops Python references. TensorFlow allocator release is only
established by terminating and draining the enclosing native Job.
"""
from dataclasses import dataclass, field
import hashlib
import json
import math
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time
import weakref

import parcel_gpu_serving as adapter
import runner_runtime as runtime


DESCRIPTOR_SHA256='41be154569ace87d85bae5dc12b77eb7d08ffcb52616bb2e075f00c1300e21eb'
_SOURCES={
    'parcel_gpu_serving.py':'724c26fb91f3cdb8a4c8b012b4499c1e7f95404d99d2d28ee74f48713af47de8',
    'parcel_runtime.py':'8dccf6ac8ffecb68724a4d9f528aba90c279265bc17888c6f4ab9cf8be51dcc4',
    'api.py':'a4531e14185693392c6b8cb953c683925b865e3e4a4506cfec8057308f07d254'}


class ModelContext:
    """Opaque internal handle. Constructing one does not create a loaded context."""
    __slots__=('__weakref__',)


@dataclass
class _State:
    descriptor_path:Path
    descriptor_sha256:str
    descriptor_record:str
    artifact_path:Path
    baseline:str
    model:object
    lock:object=field(default_factory=threading.Lock)
    closed:bool=False


_states=weakref.WeakKeyDictionary()
_registry_lock=threading.Lock()
_load_lock=threading.Lock()
_load_started=False


def _require(ok):
    if not ok:raise ValueError('Warm parcel prediction unavailable')


def _source_guard():
    for name,pin in _SOURCES.items():
        _require(runtime.sha256_file(adapter.safe_path('research/'+name))==pin)


def _environment_guard():
    """Verify existing worker_environment setup without importing ML libraries."""
    _require(os.name=='nt' and not {'tensorflow','keras'}&set(sys.modules))
    expected={'CUDA_VISIBLE_DEVICES':'-1','TF_ENABLE_ONEDNN_OPTS':'0','TF_DETERMINISTIC_OPS':'1'}
    expected.update({name:'1' for name in ('TF_NUM_INTRAOP_THREADS','TF_NUM_INTEROP_THREADS',
        'OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS')})
    _require(all(os.environ.get(name)==value for name,value in expected.items()))
    temporary=os.environ.get('TEMP');_require(temporary and temporary==os.environ.get('TMP'))
    path=Path(temporary).absolute()
    _require(path.name=='tmp' and Path(temporary)==path and '..' not in path.parts
        and path==adapter.safe_path(path.relative_to(adapter.ROOT).as_posix()) and path.is_dir())
    _require(runtime._validate_output_path(path.parent)==path.parent and tempfile.tempdir==str(path))
    # parcel_train.offline installs this fixed local denial function at all three
    # entry points; no network call is made while checking the precondition.
    for denied in (socket.create_connection,socket.socket.connect,socket.socket.connect_ex):
        _require(getattr(denied,'__module__',None)=='parcel_train' and
            getattr(denied,'__qualname__',None)=='offline.<locals>.denied')


def _freeze(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)


def _shape(model):
    _require(model.input_shape==(None,224,224,3) and model.output_shape==(None,2))


def _snapshot(model):
    snapshot=adapter._snapshot(model)
    _require(len(snapshot['model_variables'])==263 and len(snapshot['optimizer_variables'])==6
        and type(snapshot['optimizer_iterations']) is int and snapshot['optimizer_iterations']==945)
    return _freeze(snapshot)  # Immutable copy, never a caller-owned mutable object.


def _descriptor(path,pin):
    metadata=adapter.validate_descriptor(path,pin)
    _require(metadata['model']=='MobileNetV2' and metadata['modelVersion']==adapter.MODEL_SHA
        and metadata['contrast']=='clahe' and metadata['preprocessing']=='rgb-letterbox224-v1'
        and metadata['class_order']==['Normal','Damaged'] and metadata['selection_sha256']==pin
        and metadata['report_sha256']==adapter.REPORT_SHA and metadata['operationally_approved'] is False)
    return metadata


def load_context(descriptor_path:Path,descriptor_sha256:str):
    """Load once, after the caller configured a fresh supervised CPU/offline worker.

    No actual execution is authorized by this function alone. The caller must
    retain the existing native Job limits and lifecycle, including its 25s cap.
    Entering the original loader consumes this worker's sole load attempt. Even
    after close or failed loading, another context requires a fresh worker.
    """
    runtime.require_supervised_worker()
    global _load_started
    _require(_load_lock.acquire(blocking=False))
    started=time.perf_counter()
    try:
        _require(not _load_started)
        _source_guard();_environment_guard()
        _require(descriptor_sha256==DESCRIPTOR_SHA256)
        path=Path(descriptor_path).absolute();_require('..' not in path.parts)
        _require(path==adapter.safe_path(path.relative_to(adapter.ROOT).as_posix()))
        metadata=_descriptor(path,descriptor_sha256)
        artifact=adapter._check_artifact();_require(metadata['artifact']==str(artifact))
        _load_started=True
        model=adapter._load_model(artifact)  # Original fresh-TensorFlow loader, once.
        _shape(model);baseline=_snapshot(model)
        _require(adapter._check_artifact()==artifact)
        _source_guard();_require(0<=time.perf_counter()-started<=25)
        context=ModelContext()
        with _registry_lock:
            _states[context]=_State(path,descriptor_sha256,_freeze(metadata),artifact,baseline,model)
        return context
    except Exception:
        raise ValueError('Warm parcel context unavailable') from None
    finally:_load_lock.release()


def _state(context):
    _require(type(context) is ModelContext)
    with _registry_lock:state=_states.get(context)
    _require(state is not None and not state.closed and state.model is not None)
    return state


def _close(state):
    state.closed=True;state.model=None;state.baseline='';state.descriptor_record=''


def close_context(context):
    """Mark closed and drop references; native Job exit still owns TF cleanup."""
    state=_state(context);_require(state.lock.acquire(blocking=False))
    try:_close(state)
    finally:state.lock.release()


def predict(context,data:bytes):
    """Serial no-update inference; every frame retains all original checks."""
    runtime.require_supervised_worker()
    state=_state(context);_require(state.lock.acquire(blocking=False))
    started=time.perf_counter()
    try:
        _require(not state.closed and state.model is not None and os.name=='nt')
        _source_guard()
        _require(type(data) is bytes and 0<len(data)<=10*1024**2)
        # validate_descriptor includes artifact hash one, as in the cold adapter.
        _require(_freeze(_descriptor(state.descriptor_path,state.descriptor_sha256))==state.descriptor_record)
        tensor=adapter._decode_prepare(data);_require(tuple(tensor.shape)==(224,224,3))
        _require(adapter._check_artifact()==state.artifact_path)  # Hash two.
        _shape(state.model);before=_snapshot(state.model);_require(before==state.baseline)
        _require(adapter._check_artifact()==state.artifact_path)  # Hash three.
        output=state.model(tensor[None,...],training=False)
        _require(isinstance(getattr(output,'device',None),str) and output.device.endswith('CPU:0'))
        scores=output.numpy();_require(tuple(scores.shape)==(1,2));probabilities=scores[0].tolist()
        _require(len(probabilities)==2 and all(type(value) in (int,float) and math.isfinite(value)
            and 0<=value<=1 for value in probabilities) and abs(sum(probabilities)-1)<=1e-6)
        _require(_snapshot(state.model)==before)
        _require(adapter._check_artifact()==state.artifact_path)  # Hash four.
        _source_guard();elapsed=(time.perf_counter()-started)*1000;_require(0<=elapsed<=25000)
        label=None if probabilities[0]==probabilities[1] else ('Normal' if probabilities[0]>probabilities[1] else 'Damaged')
        return dict(status='abstained' if label is None else 'predicted',label=label,confidence=max(probabilities),
            probabilities=probabilities,confidenceMeaning='uncalibrated',model='MobileNetV2',modelVersion=adapter.MODEL_SHA,
            preprocessing='rgb-letterbox224-v1',contrast='clahe',evidenceSha256=hashlib.sha256(data).hexdigest(),
            selectionSha256=state.descriptor_sha256,evaluationSha256=adapter.REPORT_SHA,classOrder=['Normal','Damaged'],
            acceptanceSha256=None,processingTimeMs=elapsed,humanReviewRequired=True,operationally_approved=False)
    except BaseException as error:
        _close(state)
        if not isinstance(error,Exception):raise
        raise ValueError('Warm parcel prediction unavailable') from None
    finally:state.lock.release()
