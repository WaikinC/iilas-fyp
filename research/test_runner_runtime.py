import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch
try:
    import runner_runtime as runtime
except ImportError:
    runtime = None

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(runtime, 'runtime safeguards must exist')
        self.base = Path(__file__).resolve().parent / 'datasets' / 'runtime-tests'
        self.base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=self.base)
        self.addCleanup(self.temp.cleanup)
        self.out = Path(self.temp.name)
    def limits(self, **kw):
        args=dict(max_wall_seconds=10,max_fit_seconds=5,max_rss_bytes=4*1024**3,min_available_bytes=0,min_free_disk_bytes=0,max_output_bytes=10**6,poll_seconds=.05,threads=1)
        args.update(kw)
        return runtime.Limits(**args)
    def run_worker(self, source, **kw):
        return runtime.ResourceSupervisor(self.out,self.limits(**kw)).run([sys.executable,'-c',source],fit_id='tiny')
    def test_normal_worker(self):
        self.assertEqual(self.run_worker('pass')['status'],'success')
    def test_timeout_kills_worker(self):
        result=self.run_worker('import time; time.sleep(20)',max_fit_seconds=.15)
        self.assertEqual(result['reason'],'fit_timeout')
        self.assertLess(result['elapsed_seconds'],5)
    def test_rss_kills_worker(self):
        result=self.run_worker('import time; x=bytearray(90*1024**2); time.sleep(20)',max_rss_bytes=runtime.native_snapshot()['rss_bytes']+70*1024**2)
        self.assertEqual(result['reason'],'rss_limit')
        self.assertIsNotNone(result['returncode'],'RSS test must launch a worker')
        self.assertGreater(result['peak_rss_bytes'],runtime.native_snapshot()['rss_bytes']+50*1024**2)
    def test_output_kills_worker(self):
        result=self.run_worker("import pathlib,time; pathlib.Path('large').write_bytes(b'x'*20000); time.sleep(20)",max_output_bytes=1000)
        self.assertEqual(result['reason'],'output_limit')
    def test_wall_timeout(self):
        self.assertEqual(self.run_worker('import time; time.sleep(20)',max_wall_seconds=.15)['reason'],'wall_timeout')
    def test_low_memory_and_disk(self):
        for limits in [self.limits(min_available_bytes=2**70),self.limits(min_free_disk_bytes=2**70)]:
            with self.assertRaises(runtime.RuntimeSafetyError):runtime.ResourceSupervisor(self.out,limits).preflight()
    def test_missing_monitor_fails_closed(self):
        with patch.object(runtime,'native_snapshot',side_effect=OSError('unavailable')):
            with self.assertRaises(runtime.RuntimeSafetyError):runtime.ResourceSupervisor(self.out,self.limits()).preflight()
    def test_paths_and_exclusive_json(self):
        root=Path(__file__).resolve().parents[1]
        path=self.out/'fresh'
        self.assertEqual(runtime.create_run_directory(path),path)
        with self.assertRaises(runtime.RuntimeSafetyError):runtime.create_run_directory(path)
        with self.assertRaises(runtime.RuntimeSafetyError):runtime.create_run_directory(root/'research'/'escape')
        with self.assertRaises(runtime.RuntimeSafetyError):runtime.create_run_directory(self.out/'..'/'escape')
        runtime.write_json_exclusive(path/'manifest.json',{'a':1})
        with self.assertRaises(FileExistsError):runtime.write_json_exclusive(path/'manifest.json',{'a':2})
        self.assertEqual(len(runtime.sha256_file(path/'manifest.json')),64)
    def test_monitor_loss_kills_live_worker(self):
        original=runtime.native_snapshot
        count=0
        def lose(*args,**kwargs):
            nonlocal count
            count+=1
            if count>2:raise OSError('lost')
            return original(*args,**kwargs)
        with patch.object(runtime,'native_snapshot',side_effect=lose):
            result=self.run_worker('import time; time.sleep(20)')
        self.assertEqual(result['status'],'failed')
        self.assertIn('monitoring unavailable',result['reason'])
        self.assertIsNotNone(result['returncode'])
    def test_descendant_terminated(self):
        source="import subprocess,sys,time,pathlib; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(20)']); pathlib.Path('child.pid').write_text(str(p.pid)); time.sleep(20)"
        result=self.run_worker(source,max_fit_seconds=.5)
        self.assertEqual(result['reason'],'fit_timeout')
        pid=int((self.out/'child.pid').read_text())
        import ctypes
        kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        kernel.OpenProcess.restype=ctypes.c_void_p
        handle=kernel.OpenProcess(0x1000,False,pid)
        if handle:
            code=ctypes.c_ulong()
            kernel.GetExitCodeProcess(ctypes.c_void_p(handle),ctypes.byref(code))
            kernel.CloseHandle(ctypes.c_void_p(handle))
            self.assertNotEqual(code.value,259,'descendant still running')
    def test_threads_are_capped(self):
        result=self.run_worker("import os; assert os.environ['OMP_NUM_THREADS']=='1'")
        self.assertEqual(result['status'],'success')
    def test_live_low_memory_and_disk_kill(self):
        for field,reason in [('available_bytes','available_memory'),('free_disk_bytes','free_disk_limit')]:
            with self.subTest(field=field):
                target=self.out/field;target.mkdir()
                supervisor=runtime.ResourceSupervisor(target,self.limits(min_available_bytes=1,min_free_disk_bytes=1))
                original=supervisor.preflight
                calls=0
                def breach(*args,**kwargs):
                    nonlocal calls
                    calls+=1
                    if calls>2:raise runtime.RuntimeSafetyError(reason)
                    return original(*args,**kwargs)
                with patch.object(supervisor,'preflight',side_effect=breach):
                    result=supervisor.run([sys.executable,'-c','import time; time.sleep(20)'],fit_id='breach')
                self.assertEqual(result['reason'],reason)
                self.assertIsNotNone(result['returncode'])
    def test_symlink_path_refused(self):
        link=self.out/'link'
        try:link.symlink_to(self.out,target_is_directory=True)
        except OSError:self.skipTest('Windows symlink privilege unavailable')
        with self.assertRaises(runtime.RuntimeSafetyError):runtime.create_run_directory(link/'escape')
    def test_tracked_destination_refused(self):
        import subprocess
        repo=self.out/'repo';repo.mkdir()
        subprocess.run(['git','init','-q',str(repo)],check=True)
        (repo/'.gitignore').write_text('/research/datasets/')
        target=repo/'research'/'datasets'/'tracked';target.mkdir(parents=True)
        (target/'file').write_text('fixture')
        subprocess.run(['git','add','-f','research/datasets/tracked/file'],cwd=repo,check=True)
        import shutil
        shutil.rmtree(target)
        with self.assertRaises(runtime.RuntimeSafetyError):runtime.create_run_directory(target,repo_root=repo)
    def test_runtime_ram_gate_only_before_launch(self):
        supervisor=runtime.ResourceSupervisor(self.out,self.limits())
        original=supervisor.preflight
        gates=[]
        def capture(*args,**kwargs):
            gates.append(kwargs)
            return original(*args,**kwargs)
        with patch.object(supervisor,'preflight',side_effect=capture):
            result=supervisor.run([sys.executable,'-c','pass'],fit_id='gate',include_resident_preflight=True)
        self.assertEqual(result['status'],'success')
        self.assertTrue(gates[0]['include_resident'])
        self.assertTrue(all(g['required_available_bytes']==0 for g in gates[1:]))
    def test_configured_memory_floor_terminates_live_worker(self):
        """Initial start requirement and live free-RAM floor are distinct."""
        supervisor=runtime.ResourceSupervisor(
            self.out,self.limits(min_available_bytes=200,available_floor_bytes=100))
        original=runtime.native_snapshot
        calls=0
        def snapshot(*args,**kwargs):
            nonlocal calls
            calls+=1
            value=original(*args,**kwargs)
            value['available_bytes']=1000 if calls==1 else 99
            return value
        with patch.object(runtime,'native_snapshot',side_effect=snapshot):
            result=supervisor.run([sys.executable,'-c','import time; time.sleep(20)'],fit_id='floor')
        self.assertEqual(result['reason'],'available_memory')
        self.assertIsNotNone(result['returncode'])
        self.assertLess(result['elapsed_seconds'],5)
    def test_supervisor_rejects_non_dataset_output(self):
        with self.assertRaises(runtime.RuntimeSafetyError):runtime.ResourceSupervisor(Path(__file__).parent,self.limits())
    def test_parent_crash_job_closes_descendant(self):
        script="import sys,time,pathlib; sys.path.insert(0,sys.argv[1]); import runner_runtime as r; r.ResourceSupervisor(sys.argv[2],r.Limits(10,10,4*1024**3,0,0,10**6,poll_seconds=.05)).run([sys.executable,'-c',\"import os,pathlib,time; pathlib.Path('crash.pid').write_text(str(os.getpid())); time.sleep(20)\"],fit_id='crash')"
        import subprocess,time,ctypes
        parent=subprocess.Popen([sys.executable,'-c',script,str(Path(__file__).parent),str(self.out)])
        try:
            until=time.monotonic()+5
            while not (self.out/'crash.pid').exists() and time.monotonic()<until:time.sleep(.05)
            self.assertTrue((self.out/'crash.pid').exists())
            pid=int((self.out/'crash.pid').read_text())
            parent.kill();parent.wait()
            kernel=ctypes.WinDLL('kernel32',use_last_error=True);kernel.OpenProcess.restype=ctypes.c_void_p
            time.sleep(.1)
            handle=kernel.OpenProcess(0x1000,False,pid)
            if handle:
                code=ctypes.c_ulong();kernel.GetExitCodeProcess(ctypes.c_void_p(handle),ctypes.byref(code));kernel.CloseHandle(ctypes.c_void_p(handle))
                self.assertNotEqual(code.value,259)
        finally:
            if parent.poll() is None:parent.kill();parent.wait()
    def test_orphan_job_memory_is_monitored(self):
        # Middle exits before grandchild allocates: parent-chain enumeration loses it.
        child="import os,time,pathlib; time.sleep(.3); pathlib.Path('orphan.pid').write_text(str(os.getpid())); x=bytearray(80*1024**2); time.sleep(20)"
        middle="import subprocess,sys; subprocess.Popen([sys.executable,'-c',"+repr(child)+"])"
        source="import subprocess,sys,time; subprocess.run([sys.executable,'-c',"+repr(middle)+"]); time.sleep(20)"
        result=self.run_worker(source,max_rss_bytes=runtime.native_snapshot()['rss_bytes']+70*1024**2)
        self.assertEqual(result['reason'],'rss_limit')
        self.assertTrue((self.out/'orphan.pid').exists())
        self.assertIsNotNone(result['returncode'])
    def test_supervision_handshake(self):
        with self.assertRaises(runtime.RuntimeSafetyError):runtime.require_supervised_worker()
        with patch.dict('os.environ',{'IILAS_RUNNER_JOB':'Local\\nonexistent-iilas-test-job'}):
            with self.assertRaises(runtime.RuntimeSafetyError):runtime.require_supervised_worker()
        source="import sys; sys.path.insert(0,"+repr(str(Path(__file__).parent))+"); import runner_runtime; runner_runtime.require_supervised_worker()"
        self.assertEqual(self.run_worker(source)['status'],'success')
    def test_unrelated_named_job_is_rejected(self):
        job=runtime._ProcessJob()
        self.addCleanup(job.close)
        with patch.dict('os.environ',{'IILAS_RUNNER_JOB':job.name}):
            with self.assertRaises(runtime.RuntimeSafetyError):runtime.require_supervised_worker()
    def test_resume_thread_failure_is_immediate_and_kills_job(self):
        class FailingResume:
            def __init__(self):self.argtypes=None;self.restype=None
            def __call__(self,handle):return 0xffffffff if self.restype is runtime.W.DWORD else -1
        original=runtime.ctypes.WinDLL
        def library(name,**kwargs):
            value=original(name,**kwargs)
            if name=='kernel32':value.ResumeThread=FailingResume()
            return value
        with patch.object(runtime.ctypes,'WinDLL',side_effect=library):
            result=self.run_worker('import time; time.sleep(20)')
        self.assertEqual(result['status'],'failed')
        self.assertIsNotNone(result['returncode'])
        self.assertNotEqual(result['reason'],'fit_timeout')
        self.assertLess(result['elapsed_seconds'],2)
    def test_ledger_incomplete_and_failure(self):
        ledger=runtime.FitLedger(['one','two'])
        ledger.record('one',{'status':'success'})
        with self.assertRaises(runtime.RuntimeSafetyError):ledger.seal()
        ledger.record('two',{'status':'failed'})
        with self.assertRaises(runtime.RuntimeSafetyError):ledger.seal()
        with self.assertRaises(runtime.RuntimeSafetyError):ledger.record('one',{'status':'success'})
        good=runtime.FitLedger(['one']);good.record('one',{'status':'success'})
        self.assertEqual(good.seal()['status'],'complete')
if __name__=='__main__':unittest.main()
