"""Immutable local artifacts and bounded native execution for the v2 experiment."""
from datetime import datetime, timezone
import csv
import ctypes
from ctypes import wintypes as w
import importlib.metadata
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import subprocess
import sys
import threading
import time
import uuid

import inventory_context_contract as c
import runner_runtime as runtime
from inventory_inference import _confirm_stock_tree

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'research/datasets/inventory-simulation-v2'
EXPERIMENT = 'context-v2-main-01'
PHASES = ('preparation', 'development', 'evaluation')
MAX_BYTES = 100*1024**2
PIN_FILES = tuple('research/inventory_context_'+name+'.py' for name in
    ('contract','data','artifacts','train','evaluate','cli')) + (
    'research/INVENTORY_CONTEXT_PROTOCOL_2026-10-23.md',
    'research/inventory_simulation.py','research/runner_runtime.py','research/inventory_inference.py',
    'lib/inventoryRisk.js','lib/locationStock.js')


def write_json(path, value):
    with Path(path).open('xb') as stream:
        stream.write(c.sim.canonical(value));stream.flush();os.fsync(stream.fileno())


def decode_json(data):
    def pairs(values):
        result={}
        for key,value in values:
            if key in result:raise ValueError('Duplicate JSON key')
            result[key]=value
        return result
    def invalid(value):raise ValueError('Nonfinite JSON value')
    return json.loads(data,object_pairs_hook=pairs,parse_constant=invalid)


def read_json(path):
    path=Path(path)
    if path.stat().st_size>MAX_BYTES:raise ValueError('Artifact too large')
    return decode_json(path.read_bytes())


def safe_path(path, *, existing):
    result=runtime._validate_output_path(path)
    if existing and not result.exists():raise ValueError('Required path missing')
    if not existing and result.exists():raise ValueError('Destination exists; no resume')
    return result


def member_path(root, relative):
    if (type(relative) is not str or '\\' in relative or ':' in relative
        or relative.startswith('/') or any(p in ('','.', '..') for p in relative.split('/'))):
        raise ValueError('Unsafe manifest member')
    path=Path(root).joinpath(*PurePosixPath(relative).parts)
    for ancestor in (path,*path.parents):
        if ancestor.is_symlink() or ancestor.is_junction():raise ValueError('Linked artifact forbidden')
        if ancestor==Path(root):break
    return path


def source_pins():
    return {**{name:runtime.sha256_file(ROOT/name) for name in PIN_FILES},
            'original_inventory_report':c.sim.REPORT_SHA.lower()}


def versions():
    return {'python':platform.python_version(),**{name:importlib.metadata.version(name)
        for name in ('scikit-learn','numpy','scipy','joblib','threadpoolctl')}}


def basis():
    return dict(protocol=c.PROTOCOL,teacher=c.TEACHER,seeds=list(c.SEEDS),
        classes=list(c.CLASSES),features6=list(c.FEATURES6),features14=list(c.FEATURES14),
        source_pins=source_pins(),versions=versions())


def limits(phase):
    if phase not in PHASES:raise ValueError('Unknown phase')
    return runtime.Limits(max_wall_seconds=900 if phase=='development' else 120,
        max_fit_seconds=60,max_rss_bytes=2*1024**3,min_available_bytes=3*1024**3,
        min_free_disk_bytes=1024**3,max_output_bytes=MAX_BYTES,poll_seconds=.1,threads=2)


def storage_projection(existing_bytes):
    """Reserve the full remaining run without assuming a compression ratio.

    Retain four final estimators only. CV keeps parameters, input/model digests,
    probabilities and native receipts; temporary serialization is in RAM.
    Pinned sklearn nodes are64B plus3 float64 class values (24B).
    """
    if type(existing_bytes) is not int or existing_bytes<0:raise ValueError('Invalid storage measurement')
    final_tree_arrays=2*100*(2*min(2**12,2880//2)-1)*88 + 2*(2*min(2**8,2880//2)-1)*88
    reserves=dict(final_tree_arrays=final_tree_arrays,serialization_overhead=8*1024**2,
        jobs=8*1024**2,predictions=8*1024**2,ledger_and_analysis=8*1024**2,
        logs_registry_and_headroom=8*1024**2)
    total=existing_bytes+sum(reserves.values())
    if total>MAX_BYTES:raise runtime.RuntimeSafetyError('planned_output_limit')
    return dict(strategy='four-final-models-zlib3-cv-digests',existing_bytes=existing_bytes,
        reserves=reserves,planned_peak_bytes=total,cap_bytes=MAX_BYTES,
        temporary_disk_bytes=0,temporary_serialization='bounded process RAM; no disk copy',
        compression_savings_assumed=0)


def owner_identity(pid=None):
    if os.name!='nt':raise runtime.RuntimeSafetyError('Native Windows required')
    pid=os.getpid() if pid is None else pid
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    k.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];k.OpenProcess.restype=w.HANDLE
    k.GetProcessTimes.argtypes=[w.HANDLE,*([ctypes.POINTER(w.FILETIME)]*4)]
    k.GetExitCodeProcess.argtypes=[w.HANDLE,ctypes.POINTER(w.DWORD)]
    k.CloseHandle.argtypes=[w.HANDLE]
    handle=k.OpenProcess(0x1000,False,pid)
    if not handle:
        if ctypes.get_last_error()==87:return dict(pid=pid,created=None,running=False)
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        values=[w.FILETIME() for _ in range(4)];code=w.DWORD()
        if not k.GetProcessTimes(handle,*(ctypes.byref(v) for v in values)) or not k.GetExitCodeProcess(handle,ctypes.byref(code)):
            raise ctypes.WinError(ctypes.get_last_error())
        return dict(pid=pid,created=(values[0].dwHighDateTime<<32)|values[0].dwLowDateTime,running=code.value==259)
    finally:k.CloseHandle(handle)


def other_training_processes():
    # Compare command lines inside the native query; never return their values.
    script=("$stockProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^python(w)?(.exe)?$' }); "
        f"$stockCurrent = $stockProcesses | Where-Object {{ $_.ProcessId -eq {os.getpid()} }}; "
        "@($stockProcesses | ForEach-Object { [pscustomobject]@{ "
        "pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; executable=$_.ExecutablePath; "
        "created=$_.CreationDate.ToUniversalTime().Ticks; "
        "same_command=[bool]($stockCurrent.CommandLine -and $_.CommandLine -ceq $stockCurrent.CommandLine); "
        "training=[bool]($_.CommandLine -match '(inventory_context_cli.*(prepare|develop|evaluate)|inventory_simulation_train|benchmark_train|freshretailnet_train|olist_train|kaputt_crop_train|parcel_gpu_train|parcel_visible_train|parcel_train)') "
        "} }) | ConvertTo-Json -Compress")
    result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],
        capture_output=True,text=True,timeout=20,check=True)
    rows=json.loads(result.stdout) if result.stdout.strip() else []
    if type(rows) is dict:rows=[rows]
    return _external_training_ids(rows,os.getpid(),os.getppid(),sys.executable,sys._base_executable)


def _external_training_ids(rows,pid,parent_pid,executable,base_executable):
    current=next((row for row in rows if row['pid']==pid),None)
    if not current or current['parent']!=parent_pid:
        raise runtime.RuntimeSafetyError('Cannot verify current native process identity')
    parent=next((row for row in rows if row['pid']==parent_pid),None)
    norm=lambda value:os.path.normcase(os.path.abspath(value)) if value else None
    launcher=(parent and parent['same_command'] is True
        and norm(parent['executable'])==norm(executable)
        and norm(current['executable'])==norm(base_executable)
        and norm(parent['executable'])!=norm(current['executable'])
        and type(parent['created']) is int and type(current['created']) is int
        and 0<parent['created']<=current['created'])
    return [row['pid'] for row in rows if row['training'] and row['pid']!=pid
            and not (launcher and row['pid']==parent_pid)]


def acquire_active():
    if other_training_processes():raise runtime.RuntimeSafetyError('Another project training process is active')
    registry=BASE/'registry';registry.mkdir(parents=True,exist_ok=True)
    lock=dict(owner=owner_identity(),token=uuid.uuid4().hex,created_at=datetime.now(timezone.utc).isoformat())
    write_json(registry/'active.json',lock)
    return lock


def release_active(lock):
    path=BASE/'registry/active.json'
    if read_json(path)!=lock or lock['owner']!=owner_identity():raise ValueError('Active owner changed')
    write_json(BASE/'registry'/('released-'+lock['token']+'.json'),lock)
    path.unlink()


def _claim_path(phase):
    if phase not in PHASES:raise ValueError('Unknown phase')
    return BASE/'registry'/f'{EXPERIMENT}-{phase}.json'


def completion(phase):
    value=read_json(BASE/'registry'/f'{EXPERIMENT}-{phase}-complete.json')
    claim=read_json(_claim_path(phase))
    verify_claim(claim,phase,claim['source_sha256'],Path(claim['output']))
    if value['claim_sha256']!=c.sim.digest(claim):raise ValueError('Completion/claim mismatch')
    return value


def claim_phase(phase,source_sha256,output):
    path=_claim_path(phase)
    if phase=='preparation':
        if source_sha256 is not None:raise ValueError('Preparation has no dataset yet')
    else:
        if type(source_sha256) is not str or not re.fullmatch('[a-f0-9]{64}',source_sha256):
            raise ValueError('Invalid dataset identity')
        try:prepared=completion('preparation')
        except FileNotFoundError as error:raise ValueError('Preparation not completed') from error
        if prepared['source_sha256']!=source_sha256:raise ValueError('Different cohort')
        if phase=='evaluation' and completion('development')['source_sha256']!=source_sha256:
            raise ValueError('Unfrozen development')
    output=safe_path(output,existing=phase!='preparation')
    value=dict(experiment_id=EXPERIMENT,phase=phase,source_sha256=source_sha256,
        output=str(output),basis_sha256=c.sim.digest(basis()),owner=owner_identity(),
        created_at=datetime.now(timezone.utc).isoformat())
    path.parent.mkdir(parents=True,exist_ok=True);write_json(path,value)
    return value


def verify_claim(claim,phase,source_sha256,output):
    if (claim.get('experiment_id')!=EXPERIMENT or claim.get('phase')!=phase
        or claim.get('source_sha256')!=source_sha256 or claim.get('output')!=str(Path(output).resolve())
        or claim.get('basis_sha256')!=c.sim.digest(basis()) or read_json(_claim_path(phase))!=claim):
        raise ValueError('Claim binding changed')


def _inventory(root):
    result={}
    for path in Path(root).rglob('*'):
        relative=path.relative_to(root).as_posix();member_path(root,relative)
        if path.is_file():result[relative]=runtime.sha256_file(path)
    return result


def freeze_run(output,phase,receipt):
    claim=read_json(_claim_path(phase))
    verify_claim(claim,phase,claim['source_sha256'],output)
    value=dict(experiment_id=EXPERIMENT,phase=phase,output=str(Path(output).resolve()),
        source_sha256=receipt['source_sha256'],claim_sha256=c.sim.digest(claim),
        files=_inventory(output),receipt=receipt)
    write_json(BASE/'registry'/f'{EXPERIMENT}-{phase}-complete.json',value)
    return value


def read_manifest(source,expected_sha256):
    source=safe_path(source,existing=True)
    if runtime.sha256_file(source/'manifest.json')!=expected_sha256:raise ValueError('Manifest hash changed')
    manifest=read_json(source/'manifest.json')
    c.sim.exact(manifest,('basis','files','counts','preparation_claim_sha256'),'manifest')
    if manifest['basis']!=basis():raise ValueError('Sources/runtime/feature order changed')
    if type(manifest['files']) is not dict:raise ValueError('Invalid file inventory')
    for name,sha in manifest['files'].items():
        member_path(source,name)
        if type(sha) is not str or not re.fullmatch('[a-f0-9]{64}',sha):raise ValueError('Invalid file hash')
    observed={p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file()}
    if observed!=set(manifest['files'])|{'manifest.json'}:raise ValueError('Changed dataset tree')
    # Deliberately do not open/hash test observations here.
    return manifest


def checked_bytes(source,manifest,relative):
    path=member_path(source,relative)
    if relative not in manifest['files'] or path.stat().st_size>MAX_BYTES:raise ValueError('Unregistered/large artifact')
    value=path.read_bytes()
    import hashlib
    if hashlib.sha256(value).hexdigest()!=manifest['files'][relative]:raise ValueError('Changed artifact')
    return value


def read_case(source,manifest,relative,partition):
    if partition not in ('development','test') or not relative.startswith(partition+'/dossiers/'):
        raise ValueError('Partition access denied')
    dossier=decode_json(checked_bytes(source,manifest,relative))
    c.sim.exact(dossier,tuple(k for k in c.CASE_KEYS if k!='ledger')+
        ('ledger_ref','ledger_sha256','annotation'),'dossier')
    if not dossier['ledger_ref'].startswith(partition+'/ledgers/'):raise ValueError('Cross-partition ledger')
    if manifest['files'].get(dossier['ledger_ref'])!=dossier['ledger_sha256']:raise ValueError('Ledger reference changed')
    case={k:v for k,v in dossier.items() if k in c.CASE_KEYS}
    case['ledger']=decode_json(checked_bytes(source,manifest,dossier['ledger_ref']))
    if c.teach_case(case)!=dossier['annotation']:raise ValueError('Annotation changed')
    return case


def load_rows(source,expected_sha256,partition,*,claim=None):
    if partition not in ('development','test'):raise ValueError('Unknown partition')
    if partition=='test':
        if claim is None:raise ValueError('Test release requires consumed evaluation claim')
        verify_claim(claim,'evaluation',expected_sha256,claim['output'])
        dev=completion('development')
        if dev['source_sha256']!=expected_sha256 or _inventory(Path(dev['output']))!=dev['files']:
            raise ValueError('Development not frozen')
    manifest=read_manifest(source,expected_sha256)
    from inventory_context_data import COLUMNS
    reader=csv.DictReader(io.StringIO(checked_bytes(source,manifest,partition+'.csv').decode()))
    if tuple(reader.fieldnames or ())!=COLUMNS:raise ValueError('Changed CSV columns')
    rows=[];seen=set()
    for raw in reader:
        if set(raw)!=set(COLUMNS) or raw['split']!=partition:raise ValueError('Invalid CSV row')
        c.sim.identifier(raw['sample_id'])
        relative=f"{partition}/dossiers/{raw['sample_id']}.json"
        case=read_case(source,manifest,relative,partition)
        features=c.encode_case(case,feature_set='context')
        if (raw['sample_id'] in seen or raw['dossier_sha256']!=manifest['files'][relative]
            or any(raw[k]!=str(case[k]) for k in COLUMNS[:5])
            or raw['label']!=c.teach_case(case)['label']
            or any(raw[k]!=str(value) for k,value in zip(c.FEATURES14,features))):
            raise ValueError('CSV differs from replayed evidence')
        seen.add(raw['sample_id'])
        rows.append(dict(case=case,label=raw['label'],sample_id=case['sample_id'],
            family_id=case['family_id'],features=list(features)))
    expected=2880 if partition=='development' else 720
    if len(rows)!=expected:raise ValueError('Wrong partition row count')
    return rows


class ContextSupervisor(runtime.ResourceSupervisor):
    def __init__(self,output,limits,cohort_root):
        self.cohort_root=Path(cohort_root);self.cleanup_confirmed=True
        self._admission=threading.Lock()
        super().__init__(output,limits)

    def preflight(self,*args,**kwargs):
        result=super().preflight(*args,**kwargs)
        if runtime._output_bytes(self.cohort_root)>self.limits.max_output_bytes:
            raise runtime.RuntimeSafetyError('combined_output_limit')
        return result

    def run(self,command,*,fit_id,cwd=None,enforce_fit_timeout=True):
        if self.failed or fit_id in self.attempted or not re.fullmatch(
            r'(preparation|development|evaluation|cv-(RF6|RF14|DT6|DT14)-d\d+-l\d+-f[012]|final-(RF6|RF14|DT6|DT14))',fit_id):
            raise runtime.RuntimeSafetyError('Failed, repeated or unregistered execution')
        if not self._admission.acquire(blocking=False):raise runtime.RuntimeSafetyError('Native worker still active or draining')
        self.attempted.add(fit_id)
        began=time.monotonic();peak=0;reason=None;worker=None;job=None;assigned=False
        env=os.environ.copy()
        for key in ('OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS','NUMEXPR_NUM_THREADS','BLIS_NUM_THREADS'):
            env[key]=str(self.limits.threads)
        try:
            self.preflight();job=runtime._ProcessJob();self._job=job;self.cleanup_confirmed=False
            env['IILAS_RUNNER_JOB']=job.name
            with open(self.output_dir/(fit_id+'.stdout.log'),'xb') as stdout,open(self.output_dir/(fit_id+'.stderr.log'),'xb') as stderr:
                worker=subprocess.Popen(command,cwd=cwd or self.output_dir,env=env,stdout=stdout,stderr=stderr,creationflags=4)
                job.assign(worker);assigned=True;job.resume(worker)
                while True:
                    snap=self.preflight(required_available_bytes=self.limits.available_floor_bytes)
                    peak=max(peak,snap['rss_bytes'])
                    if enforce_fit_timeout and time.monotonic()-began>self.limits.max_fit_seconds:
                        raise runtime.RuntimeSafetyError('fit_timeout')
                    if worker.poll() is not None:break
                    time.sleep(self.limits.poll_seconds)
                if worker.returncode!=0:reason='worker_exit'
        except Exception as error:
            if self.last_snapshot:peak=max(peak,self.last_snapshot['rss_bytes'])
            reason=str(error)
        finally:
            if job:
                try:self.cleanup_confirmed=bool(_confirm_stock_tree(job,worker,assigned))
                except Exception:self.cleanup_confirmed=False
                if self.cleanup_confirmed:
                    try:job.close();self._job=None
                    except Exception:self.cleanup_confirmed=False
                if not self.cleanup_confirmed:
                    reason='cleanup_unconfirmed'
                    try:job.terminate()
                    except Exception:pass
            self.failed=bool(reason)
            result=dict(status='failed' if reason else 'success',reason=reason,
                returncode=worker.returncode if worker else None,elapsed_seconds=time.monotonic()-began,
                peak_rss_bytes=peak,last_snapshot=self.last_snapshot,cleanup_confirmed=self.cleanup_confirmed)
            try:write_json(self.output_dir/(fit_id+'.result.json'),result)
            except Exception:
                self.failed=True
                raise
            finally:self._admission.release()
        return result
