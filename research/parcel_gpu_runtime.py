"""Restricted WSL2 user-systemd supervision for the parcel GPU research workers.

No TensorFlow import. Hard limits belong to the actual service/cgroup, not env
flags. Memory peak includes the whole cgroup and cache (a conservative RSS bound).
Failed attempts and unconfirmed cleanup are preserved; no resume/replacement.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import time

import parcel_gpu_check as gpu

ROOT=Path(__file__).resolve().parents[1]
CGROUP_ROOT=Path('/sys/fs/cgroup')
PROC_ROOT=Path('/proc')
REGISTRY=ROOT/'research/datasets/parcel-gpu-runtime-registry'
MiB=1024**2
RESOURCE_PROFILE='parcel_gpu_memory_v3'
ROOT_CACHE_COMMAND=('/mnt/c/Windows/System32/wsl.exe','-d','Ubuntu-24.04','-u','root','--exec',
                    'timeout','--kill-after=1s','7s','sh','-c',
                    'sync; printf 3 > /proc/sys/vm/drop_caches')
ROOT_CACHE_POLICY='fixed_root_linux_cache_once_v1'
MEMORY_MAX=4096*MiB
ADMISSION_MEMORY=6144*MiB
LIVE_MEMORY_FLOOR=2048*MiB
ADMISSION_WAIT_SECONDS=45
ADMISSION_POLL_SECONDS=2
CAPS=(180,3000)
PROPERTY_NAMES=('Id','ControlGroup','MainPID','MemoryMax','MemorySwapMax','CPUQuotaPerSecUSec',
                'RuntimeMaxUSec','TimeoutStopUSec','KillMode','ActiveState','Result','ExecMainCode','ExecMainStatus')
ACTIVATION=ROOT.parent/'Enter-IILAS-GPU.sh'


def file_hash(path):return gpu.file_hash(path)


def write_json(path,value):
    data=(json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
    if len(data)>MiB:raise ValueError('Runtime metadata exceeds 1MiB bound')
    with open(path,'xb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())


def read_bounded(path,limit=65536):
    with open(path,encoding='utf-8') as stream:text=stream.read(limit+1)
    if len(text)>limit:raise ValueError('Runtime metadata read bound exceeded')
    return text


def require_wsl2():
    release=platform.release().lower()
    if platform.system()!='Linux' or 'microsoft' not in release or 'wsl2' not in release:
        raise ValueError('Native Linux WSL2 runtime required')


def cli(command,timeout=10):
    result=subprocess.run(command,capture_output=True,text=True,timeout=timeout)
    if len(result.stdout)+len(result.stderr)>65536:raise ValueError('Runtime command output exceeds bound')
    return result


def git_ignored(path):
    relative=path.relative_to(ROOT).as_posix()
    tracked=cli(['git','ls-files','--',relative])
    ignored=cli(['git','check-ignore','-q','--',relative])
    return tracked.returncode==0 and not tracked.stdout.strip() and ignored.returncode==0


def safe_path(path):
    path=Path(path)
    if '..' in path.parts:raise ValueError('Output traversal forbidden')
    for node in (path.absolute(),*path.absolute().parents):
        if node.is_symlink() or (hasattr(node,'is_junction') and node.is_junction()):
            raise ValueError('Runtime links/junctions forbidden')
        if node==ROOT:break
    path=path.resolve()
    if not path.is_relative_to(ROOT/'research/datasets') or path==ROOT/'research/datasets' or not git_ignored(path):
        raise ValueError('Runtime output must be untracked/ignored below research/datasets')
    return path


def unit_identifier(name):
    if not isinstance(name,str):raise ValueError('Invalid service name')
    if name.endswith('.service'):name=name[:-8]
    if not re.fullmatch(r'iilas-gpu-[a-z0-9][a-z0-9-]{0,80}',name):raise ValueError('Invalid GPU service name')
    return name+'.service'


def seconds(value):
    parts=str(value).split();total=0.
    if not parts:raise ValueError('Empty systemd duration')
    for part in parts:
        match=re.fullmatch(r'(\d+(?:\.\d+)?)(us|ms|s|min|h)',part)
        if not match:raise ValueError('Unrecognized systemd duration: '+str(value))
        total+=float(match[1])*{'us':.000001,'ms':.001,'s':1.,'min':60.,'h':3600.}[match[2]]
    return total


def normalized_properties(raw):
    result=dict(raw)
    for key in ('MainPID','MemoryMax','MemorySwapMax'):result[key]=int(raw[key])
    for key in ('CPUQuotaPerSecUSec','RuntimeMaxUSec','TimeoutStopUSec'):
        result[key]=round(seconds(raw[key])*1000000)
    return result


def validate_properties(properties,wall_seconds=None):
    expected={'MemoryMax':MEMORY_MAX,'MemorySwapMax':0,'CPUQuotaPerSecUSec':1000000,
              'TimeoutStopUSec':5000000,'KillMode':'control-group'}
    if any(properties.get(key)!=value for key,value in expected.items()):raise ValueError('Actual systemd resource caps differ')
    wall=properties.get('RuntimeMaxUSec',0)/1000000
    if not wall.is_integer() or not 0<wall<=max(CAPS) or (wall_seconds is not None and wall!=wall_seconds):
        raise ValueError('Actual service wall cap differs')


def effective_wall(requested,deadline,*,now):
    if type(requested) is not int or requested not in CAPS:raise ValueError('Only fixed requested wall caps supported')
    effective=requested if deadline is None else min(requested,math.floor(deadline-now)-1)
    if effective<=0:raise ValueError('phase_deadline')
    return effective


def check_deadline(deadline):
    if deadline is not None and time.monotonic()>=deadline:raise ValueError('phase_deadline')


def unit_properties(unit):
    result=cli(['systemctl','--user','show',unit_identifier(unit),'--property='+','.join(PROPERTY_NAMES)])
    if result.returncode!=0:raise ValueError('Cannot inspect actual systemd service: '+result.stderr[:512])
    return dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)


def registered_units(pattern='iilas-gpu-*'):
    result=cli(['systemctl','--user','list-units','--all','--full','--plain','--no-legend',pattern])
    if result.returncode!=0:raise ValueError('Cannot confirm systemd unit inventory')
    return [line.split()[0] for line in result.stdout.splitlines() if line.strip()]


def cgroup_path(relative):
    if not relative.startswith('/') or '..' in Path(relative).parts:raise ValueError('Unsafe cgroup path')
    path=(CGROUP_ROOT/relative.lstrip('/')).resolve()
    if not path.is_relative_to(CGROUP_ROOT.resolve()) or path==CGROUP_ROOT.resolve():raise ValueError('Unsafe cgroup root')
    return path


def cgroup_members(path):
    if not path.exists():return []
    members=[]
    for file in [path/'cgroup.procs',*path.rglob('cgroup.procs')]:
        members.extend(int(value) for value in read_bounded(file).split())
    return sorted(set(members))


def cgroup_memory_snapshot(path):
    """Keep kernel charge and process RSS separate; neither changes the guard."""
    stat=dict((key,int(value)) for key,value in (line.split() for line in read_bounded(path/'memory.stat').splitlines()))
    if any(key not in stat or stat[key]<0 for key in ('anon','file','kernel')):
        raise ValueError('Cgroup memory.stat components unavailable')
    result=dict(current_bytes=int(read_bounded(path/'memory.current')),peak_bytes=int(read_bounded(path/'memory.peak')),
                stat_bytes={key:stat[key] for key in ('anon','file','kernel')},processes=[],process_rss_bytes=0)
    for pid in cgroup_members(path):
        proc=PROC_ROOT/str(pid)
        try:status=read_bounded(proc/'status')
        except OSError as error:
            if not proc.exists():
                result['processes'].append(dict(pid=pid,status='gone',vmrss_bytes=None));continue
            raise ValueError('Live cgroup PID RSS uninspectable: '+str(pid)) from error
        match=re.search(r'^VmRSS:\s+(\d+)\s+kB\s*$',status,re.MULTILINE)
        if match is None:
            if re.search(r'^State:\s+Z\b',status,re.MULTILINE):
                result['processes'].append(dict(pid=pid,status='zombie',vmrss_bytes=None));continue
            if not proc.exists():
                result['processes'].append(dict(pid=pid,status='gone',vmrss_bytes=None));continue
            raise ValueError('Live cgroup PID RSS unavailable: '+str(pid))
        rss=int(match[1])*1024
        result['processes'].append(dict(pid=pid,status='live',vmrss_bytes=rss));result['process_rss_bytes']+=rss
    return result


def require_worker():
    require_wsl2()
    lines=[line for line in read_bounded('/proc/self/cgroup').splitlines() if line.startswith('0::')]
    if len(lines)!=1:raise ValueError('Actual cgroup v2 membership unavailable')
    relative=lines[0][3:];unit=unit_identifier(relative.rsplit('/',1)[-1])
    raw=unit_properties(unit);properties=normalized_properties(raw);validate_properties(properties)
    if properties.get('Id')!=unit or properties.get('ControlGroup')!=relative or properties.get('ActiveState')!='active':
        raise ValueError('Worker is outside the exact active service cgroup')
    path=cgroup_path(relative)
    quota,period=map(int,read_bounded(path/'cpu.max').split())
    limits=dict(memory_max=int(read_bounded(path/'memory.max')),memory_swap_max=int(read_bounded(path/'memory.swap.max')),
                cpu_quota=quota,cpu_period=period)
    if limits['memory_max']!=MEMORY_MAX or limits['memory_swap_max']!=0 or quota!=period or period<=0:
        raise ValueError('Actual kernel cgroup limits differ')
    members=[int(value) for value in read_bounded(path/'cgroup.procs').split()]
    if os.getpid() not in members or properties['MainPID'] not in members:
        raise ValueError('Actual worker/main PID membership not proved')
    return dict(resource_profile=RESOURCE_PROFILE,unit_name=unit,cgroup=relative,pid=os.getpid(),main_pid=properties['MainPID'],
                properties=properties,raw_properties=raw,cgroup_limits=limits,current_members=members)


def service_command(command,output_dir,unit_name,wall_seconds,environment=None,*,effective_wall_seconds=None):
    unit=unit_identifier(unit_name)
    if type(wall_seconds) is not int or wall_seconds not in CAPS:raise ValueError('Only fixed 180/3000 second caps supported')
    actual=wall_seconds if effective_wall_seconds is None else effective_wall_seconds
    if type(actual) is not int or not 0<actual<=wall_seconds:raise ValueError('Invalid stricter effective wall cap')
    if not isinstance(command,list) or not command or len(command)>256 or any(not isinstance(v,str) or not v or '\x00' in v or len(v)>16384 for v in command):
        raise ValueError('Bounded nonempty structured command required')
    env=os.environ if environment is None else environment
    passed={key:env[key] for key in ('PATH','HOME','USER','LOGNAME','WSL_INTEROP','WSL_DISTRO_NAME','LANG','VIRTUAL_ENV','LD_LIBRARY_PATH') if key in env}
    passed.update(PYTHONDONTWRITEBYTECODE='1',PYTHONNOUSERSITE='1',OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',
                  MKL_NUM_THREADS='1',TF_NUM_INTRAOP_THREADS='1',TF_NUM_INTEROP_THREADS='1',CUDA_VISIBLE_DEVICES='0')
    if any('\x00' in value or '\n' in value for value in passed.values()):raise ValueError('Invalid service environment value')
    properties=['MemoryAccounting=yes','CPUAccounting=yes','MemoryMax='+str(MEMORY_MAX),'MemorySwapMax=0',
                'CPUQuota=100%','RuntimeMaxSec='+str(actual),'TimeoutStopSec=5','KillMode=control-group',
                'OOMPolicy=stop','WorkingDirectory='+str(ROOT)]
    args=['systemd-run','--user','--wait','--pipe','--collect','--unit='+unit]
    args+=['--property='+value for value in properties]
    args+=['--setenv='+key+'='+value for key,value in sorted(passed.items())]
    args+=['--','bash','--noprofile','--norc','-c','set -euo pipefail; source "$1"; shift; exec "$@"',
           'iilas-gpu-activation',str(ACTIVATION),sys.executable,str(Path(__file__).resolve()),'_worker',
           '--output',str(output_dir),'--unit',unit,'--wall',str(wall_seconds),'--',*command]
    return args


def output_bytes(out):
    total=0
    for path in Path(out).rglob('*'):
        if path.is_symlink() or (hasattr(path,'is_junction') and path.is_junction()):raise ValueError('Worker output link forbidden')
        if path.is_file():total+=path.stat().st_size
    return total


def metadata_query(command,receipt,deadline=None):
    remaining=10. if deadline is None else min(10.,deadline-time.monotonic())
    if remaining<=0:raise ValueError('phase_deadline')
    result=cli(command,timeout=remaining)
    check_deadline(deadline)
    if result.returncode!=0:raise ValueError('Resource metadata command failed: '+result.stderr[:512])
    text=result.stdout.replace('\x00','').strip()
    if len(text)>16384:raise ValueError('Resource metadata output exceeds bound')
    receipt.append(dict(command=command,returncode=result.returncode))
    return text


def resource_snapshot(out,deadline=None):
    receipt=[]
    host=metadata_query([gpu.HOST_POWERSHELL,'-NoProfile','-NonInteractive','-Command',
        '[Console]::Write((Get-CimInstance -ClassName Win32_OperatingSystem).FreePhysicalMemory)'],receipt,deadline)
    if not re.fullmatch(r'[0-9]{1,14}',host):raise ValueError('Host available RAM metadata invalid')
    free=metadata_query(['nvidia-smi','--query-gpu=memory.free','--format=csv,noheader,nounits'],receipt,deadline)
    if not re.fullmatch(r'[0-9]{1,8}',free):raise ValueError('Single GPU free memory metadata invalid')
    return dict(host_available_bytes=int(host)*1024,guest_available_bytes=gpu.linux_available_bytes(),gpu_free_mib=int(free),
                free_disk_bytes=shutil.disk_usage(out).free,output_bytes=output_bytes(out),queries=receipt)


def check_resources(snapshot,*,admission,max_output_bytes=512*MiB):
    if max_output_bytes not in (128*MiB,512*MiB):raise ValueError('Unsupported output quota')
    if snapshot['gpu_free_mib']<(3072 if admission else 512):raise ValueError('gpu_reserve_floor')
    if snapshot['free_disk_bytes']<20480*MiB:raise ValueError('free_disk_floor')
    if snapshot['output_bytes']>max_output_bytes:raise ValueError('generated_output_limit')
    floor=ADMISSION_MEMORY if admission else LIVE_MEMORY_FLOOR
    if snapshot['host_available_bytes']<floor or snapshot['guest_available_bytes']<floor:raise ValueError('available_memory_floor')


def await_admission(out,phase_deadline,max_output_bytes,receipt):
    """Read-only RAM readiness polling; never retry a worker or extend a phase."""
    began=time.monotonic();limit=began+ADMISSION_WAIT_SECONDS
    if phase_deadline is not None:limit=min(limit,phase_deadline)
    receipt.update(policy='host_guest_ram_wait_v1',max_seconds=ADMISSION_WAIT_SECONDS,
                   poll_seconds=ADMISSION_POLL_SECONDS,started_monotonic=began,
                   deadline_monotonic=limit,phase_deadline_monotonic=phase_deadline,
                   snapshots=[],status='waiting',elapsed_seconds=0.)
    try:
        while True:
            check_deadline(phase_deadline)
            if time.monotonic()>=limit:raise ValueError('available_memory_floor')
            snapshot=resource_snapshot(out,limit)
            receipt['snapshots'].append(dict(elapsed_seconds=time.monotonic()-began,snapshot=snapshot))
            check_deadline(phase_deadline)
            if time.monotonic()>=limit:raise ValueError('available_memory_floor')
            try:check_resources(snapshot,admission=True,max_output_bytes=max_output_bytes)
            except ValueError as error:
                if str(error)!='available_memory_floor':raise
                time.sleep(min(ADMISSION_POLL_SECONDS,max(0.,limit-time.monotonic())))
                continue
            receipt['status']='ready'
            return snapshot
    except Exception as error:
        failure=error
        if (str(error)=='phase_deadline' or isinstance(error,subprocess.TimeoutExpired)) and time.monotonic()>=limit:
            if phase_deadline is not None and time.monotonic()>=phase_deadline:
                failure=ValueError('phase_deadline')
            else:
                failure=ValueError('available_memory_floor' if receipt['snapshots'] else 'admission_readiness_timeout')
        receipt['status']='failed';receipt['reason']=str(failure)[:1024]
        if failure is not error:raise failure from error
        raise
    finally:receipt['elapsed_seconds']=time.monotonic()-began


def root_cache_recovery(out,phase_deadline,receipt):
    """One fixed pre-admission Linux cache operation, with no registered GPU unit."""
    began=time.monotonic()
    receipt.update(policy=ROOT_CACHE_POLICY,command=list(ROOT_CACHE_COMMAND),status='started',returncode=None,
                   started_monotonic=began,phase_deadline_monotonic=phase_deadline,max_command_seconds=10,
                   inner_timeout_seconds=7,inner_kill_after_seconds=1)
    try:
        check_deadline(phase_deadline)
        if registered_units():raise ValueError('GPU units registered before cache recovery')
        receipt['before']=resource_snapshot(out,phase_deadline)
        check_deadline(phase_deadline)
        if registered_units():raise ValueError('GPU units registered before cache recovery')
        if phase_deadline is not None and phase_deadline-time.monotonic()<10:
            raise ValueError('cache_recovery_phase_budget')
        timeout=10.
        receipt['command_timeout_seconds']=timeout;command_began=time.monotonic()
        try:
            result=cli(list(ROOT_CACHE_COMMAND),timeout=timeout)
            receipt.update(returncode=result.returncode,stdout=result.stdout[:2048],stderr=result.stderr[:2048])
        except Exception:
            receipt['status']='unconfirmed'
            raise
        finally:receipt['command_elapsed_seconds']=time.monotonic()-command_began
        check_deadline(phase_deadline)
        if result.returncode!=0:raise ValueError('cache_recovery_exit')
        receipt['after']=resource_snapshot(out,phase_deadline)
        check_deadline(phase_deadline)
        receipt['status']='success'
    except Exception as error:
        if receipt['status']!='unconfirmed':receipt['status']='failed'
        receipt['reason']=str(error)[:1024]
        raise
    finally:receipt['elapsed_seconds']=time.monotonic()-began


def controller_rss_bytes():
    match=re.search(r'^VmRSS:\s+(\d+)\s+kB\s*$',read_bounded('/proc/self/status'),re.MULTILINE)
    if not match:raise ValueError('Actual controller VmRSS unavailable')
    return int(match[1])*1024


def check_aggregate(cgroup_memory,controller_rss):
    if cgroup_memory<0 or controller_rss<0 or cgroup_memory+controller_rss>MEMORY_MAX:
        raise ValueError('aggregate_memory_limit')


def stop_worker(unit_name,cgroup=None):
    unit=unit_identifier(unit_name);actions=[]
    # stop waits for KillMode=control-group/TimeoutStopSec=5 cleanup. Never kill a
    # shell-built command or unrelated process; the validated exact unit is used.
    if unit in registered_units(unit):
        before=unit_properties(unit)
        cgroup=cgroup or before.get('ControlGroup') or None
        stopped=cli(['systemctl','--user','stop',unit],timeout=15)
        actions.append(dict(action='stop',returncode=stopped.returncode,stderr=stopped.stderr[:1024]))
    present=unit in registered_units(unit)
    if present:
        raw=unit_properties(unit)
        active=raw.get('ActiveState') not in ('inactive','failed')
        if active:
            killed=cli(['systemctl','--user','kill','--kill-whom=all','--signal=KILL',unit])
            actions.append(dict(action='kill_all',returncode=killed.returncode,stderr=killed.stderr[:1024]))
            time.sleep(.1)
            present=unit in registered_units(unit)
    inactive=not present or unit_properties(unit).get('ActiveState') in ('inactive','failed')
    members=[] if cgroup is None else cgroup_members(cgroup_path(cgroup))
    return dict(status='clean' if inactive and not members else 'unconfirmed',unit_inactive=inactive,
                cgroup_empty=not members,remaining_pids=members,actions=actions)


def validate_native_result(record,wall_seconds):
    if record.get('status')!='success' or record.get('returncode')!=0:raise ValueError('Native worker unsuccessful')
    validate_resource_profile(record)
    if record.get('requested_max_wall_seconds')!=wall_seconds:raise ValueError('Requested wall binding differs')
    actual=effective_wall(wall_seconds,record.get('phase_deadline_monotonic'),now=record['armed_monotonic'])
    if record.get('effective_wall_seconds')!=actual:raise ValueError('Effective wall binding differs')
    if record.get('max_output_bytes') not in (128*MiB,512*MiB):raise ValueError('Output quota binding differs')
    validate_properties(record['properties'],actual)
    if any(not isinstance(record.get(key),(int,float)) or not math.isfinite(record[key]) or record[key]<0
           for key in ('elapsed_seconds','peak_rss_bytes')):
        raise ValueError('Invalid native measurement')
    if record['elapsed_seconds']>actual or record['peak_rss_bytes']>MEMORY_MAX:raise ValueError('Native resource bound exceeded')
    cleanup=record.get('cleanup',{})
    if cleanup.get('status')!='clean' or cleanup.get('unit_inactive') is not True or cleanup.get('cgroup_empty') is not True or cleanup.get('remaining_pids')!=[]:
        raise ValueError('Native cleanup is unconfirmed')
    for key in ('worker_envelope_sha256','worker_terminal_sha256','request_sha256'):
        if not re.fullmatch('[0-9a-f]{64}',record.get(key,'')):raise ValueError('Missing native worker proof hash')


def validate_resource_profile(record):
    expected=dict(resource_profile=RESOURCE_PROFILE,memory_limit_bytes=MEMORY_MAX,
                  admission_memory_bytes=ADMISSION_MEMORY,live_memory_floor_bytes=LIVE_MEMORY_FLOOR,
                  root_cache_policy=ROOT_CACHE_POLICY)
    if any(record.get(key)!=value for key,value in expected.items()):raise ValueError('Prospective memory resource profile differs')


def run_worker(command,output_dir,unit_name,wall_seconds,*,phase_deadline_monotonic=None,output_tree=None,max_output_bytes=512*MiB):
    require_wsl2();unit=unit_identifier(unit_name)
    args=service_command(command,output_dir,unit,wall_seconds)
    if max_output_bytes not in (128*MiB,512*MiB):raise ValueError('Unsupported output quota')
    if phase_deadline_monotonic is not None and (not isinstance(phase_deadline_monotonic,(int,float)) or not math.isfinite(phase_deadline_monotonic)):
        raise ValueError('Invalid phase deadline')
    out=safe_path(output_dir)
    if out.exists():raise FileExistsError('Runtime output exists; resume forbidden')
    quota_tree=out if output_tree is None else safe_path(output_tree)
    if not out.is_relative_to(quota_tree):raise ValueError('Worker output must remain in monitored output tree')
    out.parent.mkdir(parents=True,exist_ok=True);out.mkdir()
    request=dict(schema_version=1,command=command,unit_name=unit,wall_seconds=wall_seconds,requested_max_wall_seconds=wall_seconds,
                 resource_profile=RESOURCE_PROFILE,memory_limit_bytes=MEMORY_MAX,admission_memory_bytes=ADMISSION_MEMORY,
                 root_cache_policy=ROOT_CACHE_POLICY,
                 live_memory_floor_bytes=LIVE_MEMORY_FLOOR,
                 admission_readiness_policy='host_guest_ram_wait_v1',admission_wait_max_seconds=ADMISSION_WAIT_SECONDS,
                 admission_poll_seconds=ADMISSION_POLL_SECONDS,
                 phase_deadline_monotonic=phase_deadline_monotonic,code_sha256=file_hash(__file__),
                 activation_sha256=file_hash(ACTIVATION),output=str(out),output_tree=str(quota_tree),max_output_bytes=max_output_bytes)
    write_json(out/'intent.json',request)
    record=dict(status='failed',reason=None,returncode=None,unit_name=unit,elapsed_seconds=0.,peak_rss_bytes=0,
                resource_profile=RESOURCE_PROFILE,memory_limit_bytes=MEMORY_MAX,admission_memory_bytes=ADMISSION_MEMORY,
                root_cache_policy=ROOT_CACHE_POLICY,root_cache_recovery={},
                live_memory_floor_bytes=LIVE_MEMORY_FLOOR,last_cgroup_memory=None,process_rss_peak_bytes=0,
                admission_readiness_policy='host_guest_ram_wait_v1',admission_wait={},
                properties={},cleanup=dict(status='not_started'),admission=None,last_snapshot=None,
                worker_envelope_sha256=None,worker_terminal_sha256=None,controller_rss_peak_bytes=0,peak_memory_bytes=0,
                requested_max_wall_seconds=wall_seconds,phase_deadline_monotonic=phase_deadline_monotonic,
                max_output_bytes=max_output_bytes,output_tree=str(quota_tree),request_sha256=None,
                effective_wall_seconds=None,armed_monotonic=None)
    began=time.monotonic();client=None;proof=None;lease=None;started=False
    try:
        lock=safe_path(REGISTRY/'active-runtime');lock.parent.mkdir(parents=True,exist_ok=True);lock.mkdir();lease=lock
        claim=safe_path(REGISTRY/'units'/unit);claim.parent.mkdir(parents=True,exist_ok=True);claim.mkdir()
        write_json(claim/'attempt.json',dict(output=str(out),intent_sha256=file_hash(out/'intent.json')))
        check_deadline(phase_deadline_monotonic)
        if registered_units():raise ValueError('Existing GPU runtime unit requires reconciliation')
        root_cache_recovery(quota_tree,phase_deadline_monotonic,record['root_cache_recovery'])
        record['admission']=await_admission(quota_tree,phase_deadline_monotonic,max_output_bytes,record['admission_wait'])
        armed=time.monotonic();actual=effective_wall(wall_seconds,phase_deadline_monotonic,now=armed)
        request.update(effective_wall_seconds=actual,armed_monotonic=armed)
        record.update(effective_wall_seconds=actual,armed_monotonic=armed)
        args=service_command(command,out,unit,wall_seconds,effective_wall_seconds=actual)
        write_json(out/'request.json',request)
        record['request_sha256']=file_hash(out/'request.json')
        with open(out/'stdout.log','xb') as stdout,open(out/'stderr.log','xb') as stderr:
            client=subprocess.Popen(args,cwd=ROOT,stdout=stdout,stderr=stderr,start_new_session=True)
            started=True
            while True:
                check_deadline(phase_deadline_monotonic)
                record['last_snapshot']=resource_snapshot(quota_tree,phase_deadline_monotonic)
                check_deadline(phase_deadline_monotonic)
                check_resources(record['last_snapshot'],admission=False,max_output_bytes=max_output_bytes)
                controller=controller_rss_bytes();record['controller_rss_peak_bytes']=max(record['controller_rss_peak_bytes'],controller)
                envelope=out/'worker-envelope.json'
                if (out/'worker-envelope.ready').exists() and proof is None:
                    saved=json.loads(read_bounded(envelope));proof=saved['proof']
                    if saved['request_sha256']!=file_hash(out/'request.json') or proof['unit_name']!=unit:raise ValueError('Worker envelope binding mismatch')
                    validate_properties(proof['properties'],actual);record['properties']=proof['properties']
                    record['raw_properties']=proof.get('raw_properties',{})
                if proof:
                    cg=cgroup_path(proof['cgroup'])
                    if cg.exists():
                        try:
                            memory=cgroup_memory_snapshot(cg);record['last_cgroup_memory']=memory
                            current=memory['current_bytes'];peak=memory['peak_bytes']
                            record['process_rss_peak_bytes']=max(record['process_rss_peak_bytes'],memory['process_rss_bytes'])
                        except FileNotFoundError:
                            if client.poll() is None or not (out/'worker-terminal.json').exists():raise
                            current=0;peak=0  # --collect may remove a completed cgroup; terminal seals its peak.
                        record['peak_memory_bytes']=max(record['peak_memory_bytes'],peak)
                        record['peak_rss_bytes']=max(record['peak_rss_bytes'],peak+controller)
                        check_aggregate(current,controller)
                if client.poll() is not None:break
                if time.monotonic()-began>wall_seconds+30:raise ValueError('service_control_timeout')
                time.sleep(1)
        record['returncode']=client.wait(timeout=5)
        if proof is None:raise ValueError('Missing worker kernel envelope')
        terminal=json.loads(read_bounded(out/'worker-terminal.json'))
        record['final_output_bytes']=output_bytes(quota_tree)
        if record['final_output_bytes']>max_output_bytes:raise ValueError('generated_output_limit')
        record['elapsed_seconds']=terminal['elapsed_seconds'];record['peak_memory_bytes']=max(record['peak_memory_bytes'],terminal['peak_memory_bytes'])
        record['terminal_cgroup_memory']=terminal['memory_snapshot']
        record['process_rss_peak_bytes']=max(record['process_rss_peak_bytes'],terminal['memory_snapshot']['process_rss_bytes'])
        record['peak_rss_bytes']=max(record['peak_rss_bytes'],terminal['peak_memory_bytes']+record['controller_rss_peak_bytes'])
        record['worker_envelope_sha256']=file_hash(out/'worker-envelope.json')
        record['worker_terminal_sha256']=file_hash(out/'worker-terminal.json')
        if record['returncode']!=0 or terminal['returncode']!=0:raise ValueError('worker_exit')
        record['cleanup']=stop_worker(unit,proof['cgroup']);record['status']='success'
        validate_native_result(record,wall_seconds)
    except Exception as error:
        record['status']='failed';record['reason']=str(error)[:2048]
        if record['root_cache_recovery'].get('status')=='unconfirmed':
            record['cleanup']=dict(status='unconfirmed',reason='administrative_cache_cleanup_unconfirmed')
    finally:
        if started:
            try:record['cleanup']=stop_worker(unit,None if proof is None else proof['cgroup'])
            except Exception as error:record['cleanup']=dict(status='unconfirmed',error=str(error)[:1024])
            if client is not None:
                try:record['returncode']=client.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    try:client.kill();record['returncode']=client.wait(timeout=5)
                    except Exception as error:
                        record['cleanup']=dict(status='unconfirmed',error='Client termination: '+str(error)[:1024])
            if record['cleanup'].get('status')!='clean':record['status']='failed';record['reason']='cleanup_unconfirmed'
        record['controller_elapsed_seconds']=time.monotonic()-began
        if not (out/'request.json').exists():write_json(out/'request.json',request)
        record['request_sha256']=file_hash(out/'request.json')
        for artifact,key in [('worker-envelope.json','worker_envelope_sha256'),('worker-terminal.json','worker_terminal_sha256')]:
            if (out/artifact).exists():record[key]=file_hash(out/artifact)
        write_json(out/'native-result.json',record)
        if lease is not None and record['cleanup'].get('status') in ('clean','not_started'):lease.rmdir()
    return record


def _worker(output,unit,wall,command):
    proof=require_worker();out=safe_path(output)
    request=json.loads(read_bounded(out/'request.json'))
    validate_resource_profile(request)
    if (request['command']!=command or request['unit_name']!=unit or request['wall_seconds']!=wall
            or request['code_sha256']!=file_hash(__file__) or request['activation_sha256']!=file_hash(ACTIVATION)):
        raise ValueError('Changed source/command binding')
    if request['requested_max_wall_seconds']!=wall:raise ValueError('Requested wall binding differs')
    actual=effective_wall(wall,request['phase_deadline_monotonic'],now=request['armed_monotonic'])
    if actual!=request['effective_wall_seconds']:raise ValueError('Effective wall binding differs')
    check_deadline(request['phase_deadline_monotonic'])
    validate_properties(proof['properties'],actual)
    write_json(out/'worker-envelope.json',dict(proof=proof,request_sha256=file_hash(out/'request.json')))
    with open(out/'worker-envelope.ready','xb'):pass
    began=time.monotonic()
    child=subprocess.Popen(command,cwd=ROOT)
    returncode=child.wait()
    cg=cgroup_path(proof['cgroup'])
    events=dict((key,int(value)) for key,value in (line.split() for line in read_bounded(cg/'memory.events').splitlines()))
    write_json(out/'worker-terminal.json',dict(returncode=returncode,elapsed_seconds=time.monotonic()-began,
        peak_memory_bytes=int(read_bounded(cg/'memory.peak')),memory_events=events,memory_snapshot=cgroup_memory_snapshot(cg)))
    return returncode


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('_worker',));parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--unit',required=True);parser.add_argument('--wall',type=int,required=True)
    args,command=parser.parse_known_args()
    if command[:1]==['--']:command=command[1:]
    return _worker(args.output,args.unit,args.wall,command)


if __name__=='__main__':sys.exit(main())
