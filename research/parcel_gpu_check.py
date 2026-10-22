"""Explicit WSL2 GPU environment check only; no models, datasets or fitting.

Run `check --output outputs/parcel-gpu-setup-20261021/NEW-DIRECTORY` under
an external timeout. Admission: both Windows host and WSL RAM >=3GiB,
RTX3050 free VRAM >=3GiB. One logical GPU has a 2048MiB TF allocator ceiling,
leaving a nominal >=1GiB admission reserve; CUDA context/driver memory is extra.
This tiny tensor proof does not establish model feasibility or accuracy.
"""
import argparse
import csv
import hashlib
import importlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import re
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
MiB=1024**2
GiB=1024**3
PINNED_PACKAGES={'tensorflow':'2.21.0','keras':'3.15.1','numpy':'2.4.2',
                 'opencv-python-headless':'4.14.0.94','h5py':'3.14.0'}
HOST_POWERSHELL='/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
SMI_COMMAND=['nvidia-smi','--query-gpu=name,uuid,driver_version,memory.total,memory.free',
             '--format=csv,noheader,nounits']


def file_hash(path):
    value=hashlib.sha256()
    with open(path,'rb') as stream:
        for block in iter(lambda:stream.read(MiB),b''):value.update(block)
    return value.hexdigest()


def output_directory(path):
    path=Path(path)
    if '..' in path.parts:raise ValueError('Output traversal forbidden')
    allowed=ROOT/'outputs/parcel-gpu-setup-20261021'
    for node in (path.absolute(),*path.absolute().parents):
        if node.is_symlink() or (hasattr(node,'is_junction') and node.is_junction()):
            raise ValueError('Output links forbidden')
        if node==ROOT:break
    path=path.resolve()
    if not path.is_relative_to(allowed) or path==allowed:
        raise ValueError('Output must be under ignored GPU setup directory')
    if path.exists():raise FileExistsError('GPU check output already exists; use a new declared directory')
    path.parent.mkdir(parents=True,exist_ok=True);path.mkdir()
    return path


def write_receipt(path,payload):
    canonical=json.dumps(payload,sort_keys=True,separators=(',',':'),allow_nan=False,default=str).encode()
    value={'payload':payload,'sha256':hashlib.sha256(canonical).hexdigest()}
    encoded=json.dumps(value,indent=2,sort_keys=True,allow_nan=False,default=str).encode()+b'\n'
    if len(encoded)>128*1024:raise ValueError('GPU receipt exceeds 128KiB output ceiling')
    with open(path,'xb') as stream:stream.write(encoded);stream.flush()


def query(command,receipt):
    result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=10)
    stdout=result.stdout.replace('\x00','').strip();stderr=result.stderr.replace('\x00','').strip()
    if len(result.stdout.encode())>16*1024 or len(result.stderr.encode())>16*1024:
        raise ValueError('System query output exceeds 16KiB bound')
    receipt['queries'].append(dict(command=command,returncode=result.returncode,stdout=stdout,stderr=stderr))
    if result.returncode!=0:raise ValueError('System query failed: '+command[0])
    return stdout


def linux_available_bytes():
    path=Path('/proc/meminfo')
    with open(path,encoding='ascii') as stream:text=stream.read(65537)
    if len(text)>65536:raise ValueError('Linux RAM metadata exceeds bound')
    match=re.search(r'^MemAvailable:\s+(\d+)\s+kB\s*$',text,re.MULTILINE)
    if not match:raise ValueError('Linux MemAvailable RAM is unavailable; no fallback')
    return int(match[1])*1024


def admissions(receipt):
    if platform.system()!='Linux' or 'microsoft' not in platform.release().lower() or 'wsl2' not in platform.release().lower():
        raise ValueError('Explicit Linux WSL2 environment required')
    receipt['packages']={name:importlib.metadata.version(name) for name in PINNED_PACKAGES}
    if receipt['packages']!=PINNED_PACKAGES:raise ValueError('Installed package pins differ')
    guest=linux_available_bytes();receipt['wsl_available_bytes']=guest
    if guest<3*GiB:raise ValueError('WSL RAM admission requires at least 3GiB available')
    text=query([HOST_POWERSHELL,'-NoProfile','-NonInteractive','-Command',
        '[Console]::Write((Get-CimInstance -ClassName Win32_OperatingSystem).FreePhysicalMemory)'],receipt)
    if not re.fullmatch(r'[0-9]{1,14}',text):raise ValueError('Host FreePhysicalMemory must be strict decimal KiB')
    host=int(text)*1024;receipt['windows_available_bytes']=host
    if host<3*GiB:raise ValueError('Windows host RAM admission requires at least 3GiB available')
    rows=list(csv.reader(query(SMI_COMMAND,receipt).splitlines(),skipinitialspace=True))
    if len(rows)!=1 or len(rows[0])!=5:raise ValueError('Exactly one NVIDIA GPU record required')
    name,uuid,driver,total,free=(part.strip() for part in rows[0])
    if not re.search(r'\bRTX\s*3050\b',name,re.IGNORECASE) or not uuid.startswith('GPU-') or not driver:
        raise ValueError('Actual NVIDIA RTX3050 identity required')
    if not total.isdecimal() or not free.isdecimal():raise ValueError('Numeric GPU memory evidence required')
    receipt['nvidia']=dict(name=name,uuid=uuid,driver_version=driver,total_mib=int(total),free_mib=int(free))
    if int(free)<3072 or int(total)<int(free):raise ValueError('GPU free admission requires at least 3072MiB')


def tensor_check(tf,receipt):
    if tf.__version__!=PINNED_PACKAGES['tensorflow'] or tf.keras.__version__!=PINNED_PACKAGES['keras']:
        raise ValueError('Loaded TensorFlow/Keras differs from installed package pins')
    build=tf.sysconfig.get_build_info();receipt['tensorflow_build']=build
    if not build.get('is_cuda_build') or not build.get('cuda_version') or not build.get('cudnn_version'):
        raise ValueError('CUDA/cuDNN TensorFlow build required')
    tf.config.set_soft_device_placement(False)
    physical=tf.config.list_physical_devices('GPU')
    if len(physical)!=1:raise ValueError('Exactly one TensorFlow physical GPU required')
    details=tf.config.experimental.get_device_details(physical[0])
    if not re.search(r'\bRTX\s*3050\b',details.get('device_name',''),re.IGNORECASE):
        raise ValueError('TensorFlow GPU does not match NVIDIA RTX3050')
    receipt['tensorflow_gpu_details']=details
    tf.config.set_visible_devices([physical[0]],'GPU')
    tf.config.set_logical_device_configuration(physical[0],[tf.config.LogicalDeviceConfiguration(memory_limit=2048)])
    receipt['logical_gpu_memory_limit_mib']=2048
    logical=tf.config.list_logical_devices('GPU')
    if len(logical)!=1 or not logical[0].name.endswith('GPU:0'):
        raise ValueError('Exactly one logical GPU:0 required')
    receipt['logical_gpu_names']=[device.name for device in logical]
    start=time.perf_counter()
    with tf.device('/GPU:0'):
        left=tf.fill((32,32),tf.constant(2.,dtype=tf.float32))
        right=tf.fill((32,32),tf.constant(3.,dtype=tf.float32))
        product=tf.linalg.matmul(left,right)
        values=product.numpy().reshape(-1).tolist()  # synchronizes actual execution
    elapsed=time.perf_counter()-start
    if not re.search(r'(?:^|/)device:GPU:0$',product.device):raise ValueError('GPU placement proof failed; CPU fallback forbidden')
    if len(values)!=1024 or any(not math.isfinite(v) or v!=192. for v in values):
        raise ValueError('GPU tensor result is nonfinite or incorrect')
    receipt['tensor']=dict(operation='float32 matmul 32x32 fill2 times fill3',device=product.device,
        finite=True,elements=1024,expected_each=192.,checksum=sum(values),elapsed_seconds=elapsed)
    start=time.perf_counter()
    with tf.device('/GPU:0'):
        inputs=tf.ones((1,8,8,3),dtype=tf.float32)
        filters=tf.ones((3,3,3,2),dtype=tf.float32)
        convolved=tf.nn.conv2d(inputs,filters,strides=[1,1,1,1],padding='VALID')
        convolution_values=convolved.numpy().reshape(-1).tolist()
    elapsed=time.perf_counter()-start
    if (not re.search(r'(?:^|/)device:GPU:0$',convolved.device)
            or list(convolved.shape)!=[1,6,6,2] or len(convolution_values)!=72
            or any(not math.isfinite(v) or v!=27. for v in convolution_values)):
        raise ValueError('GPU convolution placement, shape or finite/numerical proof failed')
    receipt['convolution']=dict(operation='float32 conv2d ones1x8x8x3 filter3x3x3x2 VALID stride1',
        device=convolved.device,shape=[1,6,6,2],finite=True,elements=72,expected_each=27.,
        checksum=sum(convolution_values),elapsed_seconds=elapsed)
    memory=tf.config.experimental.get_memory_info('GPU:0')
    if any(not isinstance(memory.get(k),int) or not 0<=memory[k]<=2048*MiB for k in ('current','peak')):
        raise ValueError('TensorFlow allocator exceeds configured probe ceiling')
    receipt['tensorflow_allocator_bytes']=memory
    receipt['tensorflow_module']=dict(path=tf.__file__,sha256=file_hash(tf.__file__))


def check(output):
    out=output_directory(output)
    receipt=dict(schema_version=1,kind='parcel_gpu_environment_check_v1',status='started',
        python=sys.version.split()[0],platform=platform.system(),kernel=platform.release(),
        code_sha256=file_hash(__file__),queries=[],evaluation_scope='environment_only',
        boundary='No model/dataset access, fitting, accuracy or serving admission',
        limits=dict(query_timeout_seconds=10,query_output_bytes=16384,receipt_bytes=131072,
                    ram_admission_bytes=3*GiB,gpu_admission_mib=3072,gpu_allocator_ceiling_mib=2048,
                    nominal_gpu_reserve_mib=1024,external_wall_timeout_required=True))
    began=time.perf_counter()
    try:
        admissions(receipt)
        if 'tensorflow' in sys.modules:raise ValueError('GPU check must configure before any TensorFlow import/initialization')
        tf=importlib.import_module('tensorflow')
        tensor_check(tf,receipt)
        receipt['status']='success'
    except Exception as error:
        receipt['status']='failed';receipt['error']=str(error)[:2048]
        raise
    finally:
        receipt['elapsed_seconds']=time.perf_counter()-began
        write_receipt(out/'gpu-check.json',receipt)
    return out/'gpu-check.json'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('check',))
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    print(check(args.output))


if __name__=='__main__':main()
