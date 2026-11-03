"""Exclusive delivery-study files and source-bound immutable phase claims."""
from pathlib import Path
import hashlib
import json
import os
import platform
from importlib import metadata

ROOT=Path(__file__).resolve().parents[1]
DATA_ROOT=ROOT/'research/datasets/delivery-simulation-v1'
PIN_FILES=('research/delivery_demo_contract.py','research/delivery_demo_simulation.py','research/delivery_demo_data.py','research/delivery_demo_artifacts.py','research/delivery_demo_train.py','research/delivery_demo_evaluate.py','research/delivery_demo_cli.py','research/test_delivery_demo_contract.py','research/test_delivery_demo_simulation.py','research/test_delivery_demo_data.py','research/test_delivery_demo_train.py','research/test_delivery_demo_evaluate.py','research/DELIVERY_DEMO_PROTOCOL_2026-10-24.md','research/runner_runtime.py','research/inventory_context_runtime.py','research/inventory_inference.py')
PROTOCOL='delivery-demo-study-1.0'

def digest(blob):return hashlib.sha256(blob).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf-8')
def safe(value,base=None):
    base=base or DATA_ROOT;raw=Path(value)
    if '..' in raw.parts or any(ord(c)<32 for c in str(raw)):raise ValueError('Unsafe delivery path')
    p=raw if raw.is_absolute() else ROOT/raw
    if not p.is_relative_to(base) or p==base:raise ValueError('Delivery path outside owned root')
    for parent in (p,*p.parents):
        if parent.is_symlink() or parent.is_junction() or parent.is_file() and parent.stat().st_nlink!=1:raise ValueError('Linked delivery path refused')
    return p
def read_bytes(path,limit=8*1024**2):
    p=Path(path)
    if p.is_symlink() or p.is_junction() or p.stat().st_nlink!=1 or not 0<p.stat().st_size<=limit:raise ValueError('Invalid delivery file')
    with p.open('rb') as f:b=f.read(limit+1)
    if len(b)>limit:raise ValueError('Delivery file grew past limit')
    return b
def read_json(path,limit=8*1024**2):
    def pairs(items):
        result={}
        for k,v in items:
            if k in result:raise ValueError('Duplicate delivery JSON key')
            result[k]=v
        return result
    return json.loads(read_bytes(path,limit),object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite JSON')))
def write_json(path,value):
    p=safe(path);p.parent.mkdir(parents=True,exist_ok=True);safe(p)
    with p.open('xb') as f:f.write(canonical(value));f.flush();os.fsync(f.fileno())
    return digest(read_bytes(p))
def source_pins():return {p:digest((ROOT/p).read_bytes()) for p in PIN_FILES}
def environment():return dict(python=platform.python_version(),packages={k:metadata.version(k) for k in ('scikit-learn','numpy','scipy','joblib')})
def claim(phase,output):
    if phase not in ('prepare','develop','evaluate'):raise ValueError('Unknown delivery phase')
    return write_json(DATA_ROOT/'registry'/f'{phase}-attempt.json',dict(protocol=PROTOCOL,output=str(safe(output))))
def complete(phase,path):return write_json(DATA_ROOT/'registry'/f'{phase}-complete.json',dict(protocol=PROTOCOL,path=str(path),sha256=digest(read_bytes(path))))
