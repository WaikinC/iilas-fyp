"""Linux runtime boundary fixtures; no systemd/WSL/ML execution."""
import copy
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

try:
    import parcel_gpu_runtime as runtime
except ModuleNotFoundError:
    runtime=None


class GpuRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(runtime,'GPU systemd runtime missing')
        base=runtime.ROOT/'research/datasets/gpu-runtime-software-fixtures';base.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=base);self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)

    def raw_properties(self):
        return dict(Id='iilas-gpu-fixture.service',ControlGroup='/user.slice/iilas-gpu-fixture.service',
                    MainPID='40',MemoryMax='4294967296',MemorySwapMax='0',CPUQuotaPerSecUSec='1s',
                    RuntimeMaxUSec='3min',TimeoutStopUSec='5s',KillMode='control-group',ActiveState='active')

    def proof(self):
        return dict(unit_name='iilas-gpu-fixture.service',cgroup='/user.slice/iilas-gpu-fixture.service',
                    pid=42,main_pid=40,properties=runtime.normalized_properties(self.raw_properties()),
                    raw_properties=self.raw_properties(),current_members=[40,42],
                    cgroup_limits=dict(memory_max=4294967296,memory_swap_max=0,cpu_quota=100000,cpu_period=100000))

    def snapshot(self):
        return dict(host_available_bytes=8*1024**3,guest_available_bytes=8*1024**3,
                    gpu_free_mib=3965,free_disk_bytes=21*1024**3,output_bytes=0)

    def test_actual_cgroup_and_service_properties_are_required_before_worker(self):
        def read(path,*args):
            return {'cgroup':'0::/user.slice/iilas-gpu-fixture.service\n','memory.max':'4294967296',
                    'memory.swap.max':'0','cpu.max':'100000 100000','cgroup.procs':'40\n42\n'}[Path(path).name]
        with patch.object(runtime,'require_wsl2'),patch.object(runtime,'read_bounded',side_effect=read),\
                patch.object(runtime,'unit_properties',return_value=self.raw_properties()),patch.object(runtime.os,'getpid',return_value=42):
            proof=runtime.require_worker()
            self.assertEqual(proof['properties']['RuntimeMaxUSec'],180000000)
            self.assertEqual(proof['cgroup_limits']['cpu_quota'],100000)
            with patch.object(runtime,'unit_properties',return_value=dict(self.raw_properties(),MemoryMax='8589934592')):
                with self.assertRaises(ValueError):runtime.require_worker()
            with patch.object(runtime,'read_bounded',return_value='0::/ordinary.slice\n'),\
                    patch.dict(os.environ,{'IILAS_GPU_RUNTIME_UNIT':'iilas-gpu-fixture.service'}):
                with self.assertRaises(ValueError):runtime.require_worker()

    def test_worker_rejects_missing_pid_swap_cpu_and_changed_wall_caps(self):
        for changed in ({'MemorySwapMax':'1'},{'CPUQuotaPerSecUSec':'2s'},
                        {'RuntimeMaxUSec':'51min'},{'TimeoutStopUSec':'10s'},{'KillMode':'process'}):
            with self.assertRaises(ValueError):runtime.validate_properties(runtime.normalized_properties(dict(self.raw_properties(),**changed)))
        runtime.validate_properties(runtime.normalized_properties(dict(self.raw_properties(),RuntimeMaxUSec='50min')))

    def test_launch_is_fixed_activation_with_structured_command_and_env(self):
        command=['python','script.py','literal; touch forbidden','a b']
        env={'PATH':'/venv/bin:/usr/bin','HOME':'/home/iilas','WSL_INTEROP':'/run/WSL/1_interop','API_SECRET':'never-pass'}
        args=runtime.service_command(command,self.root,'iilas-gpu-fixture.service',180,env)
        self.assertIn('--property=MemoryMax=4294967296',args)
        self.assertIn('--property=MemorySwapMax=0',args)
        self.assertIn('--property=CPUQuota=100%',args)
        self.assertIn('--property=RuntimeMaxSec=180',args)
        self.assertIn('--property=KillMode=control-group',args)
        self.assertIn('--setenv=WSL_INTEROP=/run/WSL/1_interop',args)
        self.assertFalse(any('API_SECRET' in value for value in args))
        self.assertEqual(args[-len(command):],command)
        self.assertNotIn('literal; touch forbidden',args[args.index('-c')+1])

    def test_resource_thresholds_keep_admission_and_live_floors_separate(self):
        for field,value in [('host_available_bytes',2*1024**3),('guest_available_bytes',2*1024**3),
                            ('gpu_free_mib',3071),('free_disk_bytes',19*1024**3),('output_bytes',513*1024**2)]:
            snap=self.snapshot();snap[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):runtime.check_resources(snap,admission=True)
        snap=self.snapshot();snap.update(host_available_bytes=2048*1024**2,guest_available_bytes=2048*1024**2,gpu_free_mib=512)
        runtime.check_resources(snap,admission=False)
        for field in ('host_available_bytes','guest_available_bytes','gpu_free_mib'):
            bad=dict(snap);bad[field]-=1
            with self.assertRaises(ValueError):runtime.check_resources(bad,admission=False)

    def successful_record(self):
        return dict(status='success',returncode=0,elapsed_seconds=.1,peak_rss_bytes=100,
            resource_profile='parcel_gpu_memory_v3',memory_limit_bytes=4294967296,
            root_cache_policy='fixed_root_linux_cache_once_v1',
            admission_memory_bytes=6*1024**3,live_memory_floor_bytes=2*1024**3,
            requested_max_wall_seconds=180,effective_wall_seconds=180,armed_monotonic=100.,
            phase_deadline_monotonic=None,max_output_bytes=512*runtime.MiB,
            properties=runtime.normalized_properties(self.raw_properties()),
            cleanup=dict(status='clean',unit_inactive=True,cgroup_empty=True,remaining_pids=[]),
            worker_envelope_sha256='a'*64,worker_terminal_sha256='b'*64,request_sha256='c'*64)

    def test_native_success_requires_caps_exit_memory_and_complete_cleanup(self):
        good=self.successful_record();runtime.validate_native_result(good,180)
        for key,value in [('returncode',1),('elapsed_seconds',181),('peak_rss_bytes',4294967297),
                          ('resource_profile','parcel_gpu_memory_v1'),('memory_limit_bytes',2147483648),
                          ('worker_envelope_sha256',''),('cleanup',dict(status='clean',unit_inactive=True,cgroup_empty=False,remaining_pids=[42]))]:
            bad=copy.deepcopy(good);bad[key]=value
            with self.assertRaises(ValueError):runtime.validate_native_result(bad,180)

    def run_fixture(self,*,exit_code=0,phase_deadline=None,cleanup=None,cache_error=None):
        outer=self
        class Client:
            def __init__(self,args,**kwargs):
                out=Path(kwargs['stdout'].name).parent
                request=json.loads((out/'request.json').read_text())
                proof=outer.proof()
                proof['properties']['RuntimeMaxUSec']=request['effective_wall_seconds']*1000000
                runtime.write_json(out/'worker-envelope.json',dict(proof=proof,request_sha256=runtime.file_hash(out/'request.json')))
                (out/'worker-envelope.ready').touch()
                runtime.write_json(out/'worker-terminal.json',dict(returncode=exit_code,elapsed_seconds=.1,
                    peak_memory_bytes=100,memory_events={'oom_kill':0},memory_snapshot=dict(current_bytes=100,
                        peak_bytes=100,stat_bytes=dict(anon=50,file=30,kernel=20),processes=[],process_rss_bytes=50)))
                self.returncode=exit_code
            def poll(self):return self.returncode
            def wait(self,timeout=None):return self.returncode
        clean=cleanup or dict(status='clean',unit_inactive=True,cgroup_empty=True,remaining_pids=[])
        def cache_recovery(out,deadline,receipt):
            receipt['status']='unconfirmed' if cache_error=='administrative_cleanup_unconfirmed' else ('failed' if cache_error else 'success')
            if cache_error:raise ValueError(cache_error)
        with patch.object(runtime,'require_wsl2'),patch.object(runtime,'git_ignored',return_value=True),\
                patch.object(runtime,'REGISTRY',self.root/'registry'),patch.object(runtime,'controller_rss_bytes',return_value=1000),\
                patch.object(runtime,'resource_snapshot',return_value=self.snapshot()),\
                patch.object(runtime,'root_cache_recovery',side_effect=cache_recovery) as cache,\
                patch.object(runtime,'registered_units',return_value=[]),\
                patch.object(runtime,'stop_worker',return_value=clean),\
                patch.object(runtime.subprocess,'Popen',Client):
            result=runtime.run_worker(['python','fixture.py'],self.root/'run','iilas-gpu-fixture',180,
                phase_deadline_monotonic=phase_deadline)
            self.assertLessEqual(cache.call_count,1)
            return result

    def test_success_and_failed_workers_have_exclusive_durable_native_results(self):
        result=self.run_fixture()
        self.assertEqual(result['status'],'success')
        self.assertEqual(result['admission_wait']['status'],'ready')
        self.assertTrue((self.root/'run/native-result.json').is_file())
        with self.assertRaises(FileExistsError):self.run_fixture()

    def test_worker_failure_and_expired_phase_never_claim_success(self):
        result=self.run_fixture(exit_code=1)
        self.assertEqual(result['status'],'failed')
        self.assertEqual(result['returncode'],1)
        self.assertRegex(result['worker_terminal_sha256'],'^[0-9a-f]{64}$')
        self.root=self.root/'other';self.root.mkdir()
        result=self.run_fixture(phase_deadline=time.monotonic()-1)
        self.assertEqual(result['status'],'failed')
        self.assertIn('phase',result['reason'])

    def test_unconfirmed_cleanup_retains_global_runtime_lease(self):
        result=self.run_fixture(cleanup=dict(status='unconfirmed',remaining_pids=[42]))
        self.assertEqual(result['status'],'failed')
        self.assertEqual(result['reason'],'cleanup_unconfirmed')
        self.assertTrue((self.root/'registry/active-runtime').is_dir())

    def test_final_artifact_growth_after_last_sample_cannot_claim_success(self):
        with patch.object(runtime,'output_bytes',return_value=512*runtime.MiB+1):result=self.run_fixture()
        self.assertEqual(result['status'],'failed')
        self.assertIn('output',result['reason'])

    def test_unsafe_units_outputs_and_wall_caps_reject_without_launch(self):
        for unit in ('other.service','iilas-gpu-x;rm','../iilas-gpu-x'):
            with self.assertRaises(ValueError):runtime.service_command(['python'],self.root,unit,180,{})
        with self.assertRaises(ValueError):runtime.service_command(['python'],self.root,'iilas-gpu-x',600,{})
        with patch.object(runtime,'require_wsl2'),self.assertRaises(ValueError):
            runtime.run_worker(['python'],runtime.ROOT/'outputs/not-research','iilas-gpu-x',180)

    def test_aggregate_unit_and_outside_controller_memory_cannot_exceed_v2_cap(self):
        runtime.check_aggregate(4095*1024**2,1024**2)
        with self.assertRaisesRegex(ValueError,'aggregate'):
            runtime.check_aggregate(4095*1024**2,1024**2+1)

    def test_v2_requires_six_gib_admission_and_records_distinct_charge_and_rss(self):
        self.assertEqual(runtime.MEMORY_MAX,4*1024**3)
        snap=self.snapshot();snap['host_available_bytes']=6*1024**3-1
        with self.assertRaisesRegex(ValueError,'memory'):runtime.check_resources(snap,admission=True)
        snap=self.snapshot();snap['guest_available_bytes']=6*1024**3-1
        with self.assertRaisesRegex(ValueError,'memory'):runtime.check_resources(snap,admission=True)
        cg=self.root/'cg';cg.mkdir();proc=self.root/'proc';proc.mkdir()
        (cg/'cgroup.procs').write_text('40\n42\n')
        (cg/'memory.current').write_text('9000');(cg/'memory.peak').write_text('10000')
        (cg/'memory.stat').write_text('anon 1000\nfile 6000\nkernel 2000\n')
        live=proc/'40';live.mkdir();(live/'status').write_text('State:\tS (sleeping)\nVmRSS:\t2 kB\n')
        with patch.object(runtime,'PROC_ROOT',proc):
            evidence=runtime.cgroup_memory_snapshot(cg)
            self.assertEqual(evidence['current_bytes'],9000)
            self.assertEqual(evidence['stat_bytes'],dict(anon=1000,file=6000,kernel=2000))
            self.assertEqual(evidence['process_rss_bytes'],2048)
            self.assertEqual(evidence['processes'],[dict(pid=40,status='live',vmrss_bytes=2048),dict(pid=42,status='gone',vmrss_bytes=None)])
            (live/'status').write_text('State:\tS (sleeping)\n')
            with self.assertRaisesRegex(ValueError,'RSS'):runtime.cgroup_memory_snapshot(cg)

    def test_phase_remaining_is_armed_as_stricter_kernel_cap(self):
        self.assertEqual(runtime.seconds('2min 58s'),178.)
        self.assertEqual(runtime.effective_wall(3000,110.,now=100.),9)
        self.assertEqual(runtime.effective_wall(180,None,now=100.),180)
        with self.assertRaisesRegex(ValueError,'phase_deadline'):runtime.effective_wall(180,100.9,now=100.)
        args=runtime.service_command(['python'],self.root,'iilas-gpu-fixture',180,{},effective_wall_seconds=9)
        self.assertIn('--property=RuntimeMaxSec=9',args)
        good=self.successful_record();good.update(requested_max_wall_seconds=180,effective_wall_seconds=9,
            armed_monotonic=100.,phase_deadline_monotonic=110.,max_output_bytes=128*runtime.MiB)
        good['properties']['RuntimeMaxUSec']=9000000
        runtime.validate_native_result(good,180)
        good['effective_wall_seconds']=10
        with self.assertRaises(ValueError):runtime.validate_native_result(good,180)

    def test_probe_output_quota_and_deadline_checked_after_each_query(self):
        snap=self.snapshot();snap['output_bytes']=128*runtime.MiB+1
        with self.assertRaisesRegex(ValueError,'output'):
            runtime.check_resources(snap,admission=False,max_output_bytes=128*runtime.MiB)
        with patch.object(runtime,'cli',return_value=type('Reply',(),dict(returncode=0,stdout='123\x00\n',stderr=''))()) as call,\
                patch.object(runtime.time,'monotonic',side_effect=[100.,102.]):
            with self.assertRaisesRegex(ValueError,'phase_deadline'):runtime.metadata_query(['fixture'],[],101.)
            self.assertEqual(call.call_args.kwargs['timeout'],1.)

    def readiness_fixture(self,snapshots,deadline=None):
        clock=[100.];receipt={}
        def sleep(duration):clock[0]+=duration
        def snapshot(out,limit):
            self.assertLessEqual(limit,145.)
            if deadline is not None:self.assertLessEqual(limit,deadline)
            return snapshots.pop(0) if len(snapshots)>1 else snapshots[0]
        with patch.object(runtime.time,'monotonic',side_effect=lambda:clock[0]),\
                patch.object(runtime.time,'sleep',side_effect=sleep),\
                patch.object(runtime,'resource_snapshot',side_effect=snapshot) as query:
            try:return runtime.await_admission(self.root,deadline,512*runtime.MiB,receipt),receipt,query.call_count
            except Exception as error:
                error.wait_receipt=receipt;error.query_count=query.call_count;raise

    def test_readiness_wait_recovers_with_actual_floor_and_records_fixed_policy(self):
        low=dict(self.snapshot(),host_available_bytes=5*1024**3)
        admitted,receipt,count=self.readiness_fixture([low,self.snapshot()],deadline=120.)
        self.assertEqual(count,2);self.assertEqual(receipt['elapsed_seconds'],2.)
        self.assertEqual(receipt['status'],'ready');self.assertEqual(len(receipt['snapshots']),2)
        runtime.check_resources(admitted,admission=True)
        self.assertEqual((runtime.MEMORY_MAX,runtime.ADMISSION_MEMORY,runtime.LIVE_MEMORY_FLOOR),(4*1024**3,6*1024**3,2*1024**3))

    def test_readiness_wait_stays_low_or_phase_expires_without_extending(self):
        low=dict(self.snapshot(),guest_available_bytes=5*1024**3)
        for deadline,reason,elapsed in [(None,'available_memory_floor',45.),(103.,'phase_deadline',3.)]:
            with self.subTest(deadline=deadline),self.assertRaisesRegex(ValueError,reason) as caught:
                self.readiness_fixture([low],deadline)
            self.assertEqual(caught.exception.wait_receipt['elapsed_seconds'],elapsed)
            self.assertEqual(caught.exception.wait_receipt['status'],'failed')

    def test_readiness_wait_never_waits_for_nonmemory_resource_failure(self):
        for field,value,reason in [('gpu_free_mib',3000,'gpu_reserve'),('free_disk_bytes',19*1024**3,'free_disk'),
                                   ('output_bytes',513*runtime.MiB,'output')]:
            bad=dict(self.snapshot(),host_available_bytes=5*1024**3);bad[field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,reason) as caught:self.readiness_fixture([bad])
            self.assertEqual(caught.exception.query_count,1)
            self.assertEqual(caught.exception.wait_receipt['elapsed_seconds'],0.)

    def test_readiness_query_cannot_extend_wait_or_misreport_phase_expiry(self):
        clock=[100.];receipt={}
        def query(out,limit):
            self.assertEqual(limit,145.);clock[0]=145.;raise ValueError('phase_deadline')
        with patch.object(runtime.time,'monotonic',side_effect=lambda:clock[0]),\
                patch.object(runtime,'resource_snapshot',side_effect=query),self.assertRaisesRegex(ValueError,'admission_readiness_timeout'):
            runtime.await_admission(self.root,200.,512*runtime.MiB,receipt)
        self.assertEqual(receipt['elapsed_seconds'],45.)

    def cache_fixture(self,*,units=None,returncode=0,deadline=120.,timeout=False):
        receipt={};clock=[100.]
        reply=type('Reply',(),dict(returncode=returncode,stdout='',stderr='failure' if returncode else ''))()
        def invoke(command,*,timeout):
            clock[0]+=1.
            if timeout_error:raise runtime.subprocess.TimeoutExpired(command,timeout)
            return reply
        timeout_error=timeout
        with patch.object(runtime.time,'monotonic',side_effect=lambda:clock[0]),\
                patch.object(runtime,'registered_units',return_value=units or []),\
                patch.object(runtime,'resource_snapshot',return_value=self.snapshot()),\
                patch.object(runtime,'cli',side_effect=invoke) as command:
            try:
                runtime.root_cache_recovery(self.root,deadline,receipt)
                return receipt,command
            except Exception as error:error.cache_receipt=receipt;error.command_calls=command.call_count;raise

    def test_root_cache_recovery_is_exact_once_bounded_and_before_admission(self):
        receipt,command=self.cache_fixture()
        self.assertEqual(receipt['status'],'success');self.assertEqual(receipt['returncode'],0)
        self.assertEqual(receipt['elapsed_seconds'],1.);self.assertEqual(command.call_count,1)
        self.assertEqual(command.call_args.args[0],['/mnt/c/Windows/System32/wsl.exe','-d','Ubuntu-24.04','-u','root','--exec',
            'timeout','--kill-after=1s','7s','sh','-c',
            'sync; printf 3 > /proc/sys/vm/drop_caches'])
        self.assertEqual(command.call_args.kwargs['timeout'],10.)
        self.assertIn('before',receipt);self.assertIn('after',receipt)

    def test_root_cache_recovery_refuses_active_unit_failure_timeout_and_expired_deadline(self):
        for kwargs,reason,calls in [(dict(units=['iilas-gpu-active.service']),'registered',0),
                                    (dict(returncode=1),'cache_recovery_exit',1),
                                    (dict(timeout=True),'timed out',1),
                                    (dict(deadline=105.),'cache_recovery_phase_budget',0),
                                    (dict(deadline=99.),'phase_deadline',0)]:
            with self.subTest(kwargs=kwargs),self.assertRaisesRegex(Exception,reason) as caught:self.cache_fixture(**kwargs)
            self.assertEqual(caught.exception.command_calls,calls)
            self.assertEqual(caught.exception.cache_receipt['status'],'unconfirmed' if kwargs.get('timeout') else 'failed')

    def test_no_worker_is_started_when_cache_recovery_fails(self):
        result=self.run_fixture(cache_error='cache_recovery_exit')
        self.assertEqual(result['status'],'failed');self.assertEqual(result['cleanup']['status'],'not_started')
        self.assertFalse((self.root/'run/stdout.log').exists())

    def test_unknown_administrative_cleanup_retains_lease_and_never_launches_worker(self):
        result=self.run_fixture(cache_error='administrative_cleanup_unconfirmed')
        self.assertEqual(result['cleanup']['status'],'unconfirmed')
        self.assertTrue((self.root/'registry/active-runtime').is_dir())
        self.assertFalse((self.root/'run/stdout.log').exists())


if __name__=='__main__':unittest.main()
