"""Fail-closed stdlib native-runner guards. Run entire phase under run(...,
 enforce_fit_timeout=False), and individual fits under nested supervisors.
All manifests/results use exclusive creation; no resume or replacement fits.
"""
from dataclasses import dataclass
from pathlib import Path
import ctypes
from ctypes import wintypes as W
import hashlib
import json
import math
import os
import shutil
import subprocess
import time
import uuid

class RuntimeSafetyError(RuntimeError):
    pass

@dataclass(frozen=True)
class Limits:
    max_wall_seconds: float
    max_fit_seconds: float
    max_rss_bytes: int
    min_available_bytes: int
    min_free_disk_bytes: int
    max_output_bytes: int
    poll_seconds: float = 1.0
    threads: int = 1
    available_floor_bytes: int = 0
    def __post_init__(self):
        for name,value in vars(self).items():
            if not isinstance(value,(int,float)) or not math.isfinite(value) or value < 0:
                raise RuntimeSafetyError('Invalid resource limit: '+name)
        if not 0 < self.poll_seconds <= 5 or self.threads < 1:
            raise RuntimeSafetyError('Polling must be in (0,5] and threads positive')


def sha256_file(path):
    digest=hashlib.sha256()
    with open(path,'rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()


def write_json_exclusive(path,value):
    payload=json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n'
    with open(path,'x',encoding='utf-8') as stream:
        stream.write(payload);stream.flush();os.fsync(stream.fileno())


def _validate_output_path(path,repo_root=None):
    root=Path(repo_root or Path(__file__).resolve().parents[1]).resolve()
    raw=Path(path)
    if '..' in raw.parts:raise RuntimeSafetyError('Parent traversal forbidden')
    absolute=raw.absolute()
    allowed=root/'research'/'datasets'
    for ancestor in (absolute,*absolute.parents):
        if ancestor.is_symlink() or (hasattr(ancestor,'is_junction') and ancestor.is_junction()):
            raise RuntimeSafetyError('Links/junctions forbidden')
        if ancestor==root:break
    resolved=absolute.resolve()
    if not resolved.is_relative_to(allowed) or resolved==allowed:
        raise RuntimeSafetyError('Destination must be below research/datasets')
    relative=resolved.relative_to(root).as_posix()
    tracked=subprocess.run(['git','ls-files','--',relative],cwd=root,capture_output=True,text=True,check=True)
    ignored=subprocess.run(['git','check-ignore','-q','--',relative],cwd=root)
    if tracked.stdout.strip() or ignored.returncode!=0:raise RuntimeSafetyError('Destination must be untracked and ignored')
    return resolved


def create_run_directory(path,repo_root=None):
    resolved=_validate_output_path(path,repo_root)
    if resolved.exists():raise RuntimeSafetyError('Destination already exists; resume forbidden')
    resolved.parent.mkdir(parents=True,exist_ok=True)
    resolved.mkdir(exist_ok=False)
    return resolved


def native_snapshot(root_pid=None,*,extra_pids=()):
    """Available physical RAM and aggregate working set of PID and descendants.
    Windows Toolhelp/PSAPI native APIs; inability to inspect a live PID is fatal.
    """
    if os.name!='nt':raise RuntimeSafetyError('Native Windows monitoring required')
    k=ctypes.WinDLL('kernel32',use_last_error=True)
    p=ctypes.WinDLL('psapi',use_last_error=True)
    class MEMORY(ctypes.Structure):
        _fields_=[('length',W.DWORD),('load',W.DWORD)]+[(n,ctypes.c_ulonglong) for n in ['total','available','page_total','page_available','virtual_total','virtual_available','extended']]
    mem=MEMORY();mem.length=ctypes.sizeof(mem)
    if not k.GlobalMemoryStatusEx(ctypes.byref(mem)):raise ctypes.WinError(ctypes.get_last_error())
    class ENTRY(ctypes.Structure):
        _fields_=[('size',W.DWORD),('usage',W.DWORD),('pid',W.DWORD),('heap',ctypes.c_size_t),('module',W.DWORD),('threads',W.DWORD),('parent',W.DWORD),('priority',W.LONG),('flags',W.DWORD),('exe',W.WCHAR*260)]
    k.CreateToolhelp32Snapshot.restype=W.HANDLE
    k.OpenProcess.restype=W.HANDLE
    k.OpenProcess.argtypes=[W.DWORD,W.BOOL,W.DWORD]
    k.CloseHandle.argtypes=[W.HANDLE]
    k.Process32FirstW.argtypes=[W.HANDLE,ctypes.POINTER(ENTRY)]
    k.Process32NextW.argtypes=[W.HANDLE,ctypes.POINTER(ENTRY)]
    p.GetProcessMemoryInfo.argtypes=[W.HANDLE,ctypes.c_void_p,W.DWORD]
    handle=k.CreateToolhelp32Snapshot(2,0)
    if handle==ctypes.c_void_p(-1).value:raise ctypes.WinError(ctypes.get_last_error())
    entries=[];entry=ENTRY();entry.size=ctypes.sizeof(entry)
    try:
        ok=k.Process32FirstW(handle,ctypes.byref(entry))
        if not ok:raise ctypes.WinError(ctypes.get_last_error())
        while ok:
            entries.append((entry.pid,entry.parent));ok=k.Process32NextW(handle,ctypes.byref(entry))
    finally:k.CloseHandle(handle)
    selected={root_pid or os.getpid()}
    while True:
        expanded=selected|{pid for pid,parent in entries if parent in selected}
        if expanded==selected:break
        selected=expanded
    selected.update(extra_pids)
    class COUNTERS(ctypes.Structure):
        _fields_=[('size',W.DWORD),('faults',W.DWORD)]+[(n,ctypes.c_size_t) for n in ['peak','working','poolpeak','pool','nonpeak','non','page','peakpage']]
    rss=0
    for pid in selected:
        proc=k.OpenProcess(0x410,False,pid)
        if not proc:
            if ctypes.get_last_error()==87:continue # PID exited after membership snapshot
            raise ctypes.WinError(ctypes.get_last_error())
        counters=COUNTERS();counters.size=ctypes.sizeof(counters)
        try:
            if not p.GetProcessMemoryInfo(proc,ctypes.byref(counters),counters.size):raise ctypes.WinError(ctypes.get_last_error())
            rss+=counters.working
        finally:k.CloseHandle(proc)
    return dict(available_bytes=mem.available,rss_bytes=rss,pids=sorted(selected))


def _output_bytes(directory):
    total=0
    for path in Path(directory).rglob('*'):
        if path.is_symlink() or (hasattr(path,'is_junction') and path.is_junction()):raise RuntimeSafetyError('Output link forbidden')
        if path.is_file():total+=path.stat().st_size
    return total

class _ProcessJob:
    def __init__(self):
        self.kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        self.kernel.CreateJobObjectW.restype=W.HANDLE
        self.kernel.AssignProcessToJobObject.argtypes=[W.HANDLE,W.HANDLE]
        self.kernel.TerminateJobObject.argtypes=[W.HANDLE,W.UINT]
        self.kernel.CloseHandle.argtypes=[W.HANDLE]
        self.name='Local\\IILASNativeRunner-'+uuid.uuid4().hex
        self.kernel.CreateJobObjectW.argtypes=[ctypes.c_void_p,W.LPCWSTR]
        self.handle=self.kernel.CreateJobObjectW(None,self.name)
        if not self.handle:raise ctypes.WinError(ctypes.get_last_error())
        class BASIC(ctypes.Structure):
            _fields_=[('process_time',ctypes.c_longlong),('job_time',ctypes.c_longlong),('flags',W.DWORD),('min_working',ctypes.c_size_t),('max_working',ctypes.c_size_t),('active',W.DWORD),('affinity',ctypes.c_size_t),('priority',W.DWORD),('scheduling',W.DWORD)]
        class IO(ctypes.Structure):
            _fields_=[(name,ctypes.c_ulonglong) for name in ['read_ops','write_ops','other_ops','read_bytes','write_bytes','other_bytes']]
        class EXTENDED(ctypes.Structure):
            _fields_=[('basic',BASIC),('io',IO),('process_memory',ctypes.c_size_t),('job_memory',ctypes.c_size_t),('peak_process',ctypes.c_size_t),('peak_job',ctypes.c_size_t)]
        info=EXTENDED();info.basic.flags=0x2000 # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        self.kernel.SetInformationJobObject.argtypes=[W.HANDLE,ctypes.c_int,ctypes.c_void_p,W.DWORD]
        if not self.kernel.SetInformationJobObject(self.handle,9,ctypes.byref(info),ctypes.sizeof(info)):
            self.close();raise ctypes.WinError(ctypes.get_last_error())
    def pids(self):
        # Job membership persists after an intermediate parent exits, and includes
        # members of nested jobs. Query grows until a complete snapshot is read.
        self.kernel.QueryInformationJobObject.argtypes=[W.HANDLE,ctypes.c_int,ctypes.c_void_p,W.DWORD,ctypes.c_void_p]
        capacity=64
        while capacity<=1048576:
            buffer=ctypes.create_string_buffer(8+capacity*ctypes.sizeof(ctypes.c_size_t))
            ok=self.kernel.QueryInformationJobObject(self.handle,3,buffer,len(buffer),None)
            error=ctypes.get_last_error()
            assigned=W.DWORD.from_buffer(buffer,0).value
            count=W.DWORD.from_buffer(buffer,4).value
            if ok and count==assigned:
                return list((ctypes.c_size_t*count).from_buffer(buffer,8))
            if not ok and error!=234:raise ctypes.WinError(error)
            capacity=max(capacity*2,assigned+64)
        raise RuntimeSafetyError('Job membership monitor capacity exceeded')
    def resume(self,worker):
        # Launch suspended: assignment precedes any worker code/descendant creation.
        class THREAD(ctypes.Structure):
            _fields_=[('size',W.DWORD),('usage',W.DWORD),('tid',W.DWORD),('pid',W.DWORD),('base',W.LONG),('delta',W.LONG),('flags',W.DWORD)]
        self.kernel.CreateToolhelp32Snapshot.restype=W.HANDLE
        self.kernel.Thread32First.argtypes=[W.HANDLE,ctypes.POINTER(THREAD)]
        self.kernel.Thread32Next.argtypes=[W.HANDLE,ctypes.POINTER(THREAD)]
        self.kernel.OpenThread.restype=W.HANDLE
        self.kernel.OpenThread.argtypes=[W.DWORD,W.BOOL,W.DWORD]
        self.kernel.ResumeThread.argtypes=[W.HANDLE]
        self.kernel.ResumeThread.restype=W.DWORD
        snapshot=self.kernel.CreateToolhelp32Snapshot(4,0)
        if snapshot==ctypes.c_void_p(-1).value:raise ctypes.WinError(ctypes.get_last_error())
        entry=THREAD();entry.size=ctypes.sizeof(entry);resumed=False
        try:
            ok=self.kernel.Thread32First(snapshot,ctypes.byref(entry))
            while ok:
                if entry.pid==worker.pid:
                    thread=self.kernel.OpenThread(2,False,entry.tid)
                    if not thread:raise ctypes.WinError(ctypes.get_last_error())
                    try:
                        if self.kernel.ResumeThread(thread)==0xffffffff:raise ctypes.WinError(ctypes.get_last_error())
                        resumed=True
                    finally:self.kernel.CloseHandle(thread)
                ok=self.kernel.Thread32Next(snapshot,ctypes.byref(entry))
        finally:self.kernel.CloseHandle(snapshot)
        if not resumed:raise RuntimeSafetyError('Suspended worker thread unavailable')
    def assign(self,worker):
        if not self.kernel.AssignProcessToJobObject(self.handle,W.HANDLE(int(worker._handle))):
            worker.kill();worker.wait();raise ctypes.WinError(ctypes.get_last_error())
    def terminate(self):
        if not self.kernel.TerminateJobObject(self.handle,137):raise ctypes.WinError(ctypes.get_last_error())
    def close(self):self.kernel.CloseHandle(self.handle)


def require_supervised_worker():
    """Refuse accidental direct hidden CLI execution outside its named runtime Job.
    This is a local workflow guard, not authentication against users editing code.
    """
    name=os.environ.get('IILAS_RUNNER_JOB','')
    if os.name!='nt' or not name.startswith('Local\\IILASNativeRunner-'):
        raise RuntimeSafetyError('Worker requires ResourceSupervisor')
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenJobObjectW.restype=W.HANDLE
    kernel.OpenJobObjectW.argtypes=[W.DWORD,W.BOOL,W.LPCWSTR]
    kernel.IsProcessInJob.argtypes=[W.HANDLE,W.HANDLE,ctypes.POINTER(W.BOOL)]
    kernel.GetCurrentProcess.restype=W.HANDLE
    kernel.CloseHandle.argtypes=[W.HANDLE]
    handle=kernel.OpenJobObjectW(4,False,name) # JOB_OBJECT_QUERY
    if not handle:raise RuntimeSafetyError('Runtime supervisor Job unavailable')
    try:
        member=W.BOOL()
        if not kernel.IsProcessInJob(kernel.GetCurrentProcess(),handle,ctypes.byref(member)) or not member.value:
            raise RuntimeSafetyError('Worker is outside its named supervisor Job')
    finally:kernel.CloseHandle(handle)


class ResourceSupervisor:
    def __init__(self,output_dir,limits):
        self.output_dir=_validate_output_path(output_dir);self.limits=limits
        if not self.output_dir.is_dir():raise RuntimeSafetyError('Output directory missing')
        self.started=time.monotonic();self.failed=False;self.attempted=set();self._job=None;self.last_snapshot=None
    def preflight(self,required_available_bytes=None,include_resident=False):
        try:
            snap=native_snapshot(extra_pids=self._job.pids() if self._job else ())
            snap['free_disk_bytes']=shutil.disk_usage(self.output_dir).free
            snap['output_bytes']=_output_bytes(self.output_dir)
        except Exception as error:raise RuntimeSafetyError('Resource monitoring unavailable: '+str(error)) from error
        self.last_snapshot=snap
        required=self.limits.min_available_bytes if required_available_bytes is None else required_available_bytes
        if snap['available_bytes']+(snap['rss_bytes'] if include_resident else 0)<required:raise RuntimeSafetyError('available_memory')
        if snap['rss_bytes']>self.limits.max_rss_bytes:raise RuntimeSafetyError('rss_limit')
        if snap['free_disk_bytes']<self.limits.min_free_disk_bytes:raise RuntimeSafetyError('free_disk_limit')
        if snap['output_bytes']>self.limits.max_output_bytes:raise RuntimeSafetyError('output_limit')
        if time.monotonic()-self.started>self.limits.max_wall_seconds:raise RuntimeSafetyError('wall_timeout')
        return snap
    def run(self,command,*,fit_id,cwd=None,enforce_fit_timeout=True,include_resident_preflight=False):
        if self.failed or fit_id in self.attempted:raise RuntimeSafetyError('Failed/repeated execution forbidden')
        if not fit_id or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in fit_id):raise RuntimeSafetyError('Unsafe fit ID')
        self.attempted.add(fit_id)
        began=time.monotonic();peak=0;reason=None;worker=None;job=None
        env=os.environ.copy()
        for key in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS','NUMEXPR_NUM_THREADS','BLIS_NUM_THREADS']:env[key]=str(self.limits.threads)
        try:
            self.preflight(include_resident=include_resident_preflight)
            job=_ProcessJob()
            self._job=job
            env['IILAS_RUNNER_JOB']=job.name
            with open(self.output_dir/(fit_id+'.stdout.log'),'xb') as stdout,open(self.output_dir/(fit_id+'.stderr.log'),'xb') as stderr:
                worker=subprocess.Popen(command,cwd=cwd or self.output_dir,env=env,stdout=stdout,stderr=stderr,creationflags=4)
                job.assign(worker)
                job.resume(worker)
                while True:
                    snap=self.preflight(required_available_bytes=self.limits.available_floor_bytes);peak=max(peak,snap['rss_bytes'])
                    if enforce_fit_timeout and time.monotonic()-began>self.limits.max_fit_seconds:raise RuntimeSafetyError('fit_timeout')
                    if worker.poll() is not None:break
                    time.sleep(self.limits.poll_seconds)
                if worker.returncode!=0:reason='worker_exit'
        except Exception as error:
            if self.last_snapshot:peak=max(peak,self.last_snapshot['rss_bytes'])
            reason=str(error)
            if worker is not None:
                job.terminate() if job else worker.kill()
                worker.wait(timeout=10)
        finally:
            if job:
                job.terminate()
                job.close()
                self._job=None
        result=dict(status='failed' if reason else 'success',reason=reason,returncode=worker.returncode if worker else None,elapsed_seconds=time.monotonic()-began,peak_rss_bytes=peak,last_snapshot=self.last_snapshot)
        self.failed=bool(reason)
        write_json_exclusive(self.output_dir/(fit_id+'.result.json'),result)
        return result

class FitLedger:
    def __init__(self,expected_ids):
        self.expected=tuple(expected_ids);self.results={};self.sealed=False
        if len(set(self.expected))!=len(self.expected) or not self.expected:raise RuntimeSafetyError('Invalid registry')
    def record(self,fit_id,result):
        if self.sealed or fit_id not in self.expected or fit_id in self.results:raise RuntimeSafetyError('Unknown/repeated/sealed fit')
        self.results[fit_id]=json.loads(json.dumps(result,allow_nan=False))
    def seal(self):
        if set(self.results)!=set(self.expected) or any(r.get('status')!='success' for r in self.results.values()):raise RuntimeSafetyError('Incomplete fits; selection forbidden')
        self.sealed=True
        return dict(status='complete',expected_ids=list(self.expected),results=json.loads(json.dumps(self.results)))
