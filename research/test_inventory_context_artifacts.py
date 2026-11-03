"""Local software fixtures; no scientific claims or real test release."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_context_artifacts'), 'V2 artifact boundary missing')
        import inventory_context_artifacts as api
        self.a = api
        base = Path(__file__).parent/'datasets/context-software-tests'
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def fixture_limits(self, **kw):
        values = dict(max_wall_seconds=12,max_fit_seconds=5,max_rss_bytes=2*1024**3,
            min_available_bytes=0,min_free_disk_bytes=0,max_output_bytes=10**7,poll_seconds=.05,threads=2)
        values.update(kw)
        return self.a.runtime.Limits(**values)

    def test_exact_json_paths_and_limits(self):
        a=self.a
        with self.assertRaises(ValueError): a.decode_json(b'{"x":1,"x":2}')
        for member in ('../x','/absolute','C:/outside','a/../b','a\\b'):
            with self.assertRaises(ValueError): a.member_path(self.root, member)
        self.assertEqual(a.safe_path(self.root/'fresh',existing=False),self.root/'fresh')
        with self.assertRaises((ValueError,a.runtime.RuntimeSafetyError)): a.safe_path(self.root,existing=False)
        with self.assertRaises(a.runtime.RuntimeSafetyError): a.safe_path(Path(__file__),existing=True)
        a.write_json(self.root/'one.json',{'x':1})
        with self.assertRaises(FileExistsError):a.write_json(self.root/'one.json',{'x':2})
        limits=a.limits('development')
        self.assertEqual((limits.max_wall_seconds,limits.max_fit_seconds,limits.max_rss_bytes,
            limits.min_available_bytes,limits.min_free_disk_bytes,limits.max_output_bytes,limits.threads),
            (900,60,2*1024**3,3*1024**3,1024**3,100*1024**2,2))
        self.assertEqual(a.limits('evaluation').max_wall_seconds,120)

    def test_claim_cannot_move_or_change_cohort(self):
        a=self.a
        with patch.object(a,'BASE',self.root),patch.object(a,'source_pins',return_value={'fixture':'a'*64}),patch.object(a,'versions',return_value={'fixture':'1'}):
            claim=a.claim_phase('preparation',None,self.root/'main')
            a.verify_claim(claim,'preparation',None,self.root/'main')
            for path,sha in ((self.root/'elsewhere',None),(self.root/'main','b'*64)):
                with self.assertRaises((ValueError,FileExistsError)):
                    a.claim_phase('preparation',sha,path)
            with self.assertRaises(ValueError):a.verify_claim(claim,'preparation',None,self.root/'elsewhere')
            with self.assertRaises(ValueError):a.claim_phase('development','c'*64,self.root/'dev')

    def test_test_reader_rejects_before_any_open(self):
        with patch.object(Path,'open',side_effect=AssertionError('Test opened before claim')):
            with self.assertRaises(ValueError):self.a.load_rows(self.root,'a'*64,'test')

    def test_saved_cohort_and_develop_reader_has_no_test_access(self):
        import inventory_context_data as data
        a=self.a;source=self.root/'main'
        with patch.object(a,'BASE',self.root),patch.object(a,'source_pins',return_value={'software-fixture':'a'*64}),patch.object(a,'versions',return_value={'fixture':'1'}),patch.object(a.runtime,'require_supervised_worker'):
            a.claim_phase('preparation',None,source)
            data.prepare_cohort(source)
            sha=a.runtime.sha256_file(source/'manifest.json')
            self.assertEqual(data.audit_cohort(source,sha)['rows'],3600)
            original=Path.open
            def fence(path,*args,**kwargs):
                relative=path.relative_to(source).as_posix() if path.is_relative_to(source) else ''
                if relative=='test.csv' or relative.startswith('test/'):
                    raise AssertionError('Development read test observations')
                return original(path,*args,**kwargs)
            with patch.object(Path,'open',fence):
                rows=a.load_rows(source,sha,'development')
            self.assertEqual(len(rows),2880)
            with patch.object(a,'versions',return_value={'fixture':'changed'}):
                with self.assertRaises(ValueError):a.read_manifest(source,sha)
            with self.assertRaises(ValueError):data.prepare_cohort(source)
            manifest=a.read_json(source/'manifest.json')
            for mutation in ('source','order','member','teacher'):
                import copy
                value=copy.deepcopy(manifest)
                if mutation=='source':value['basis']['source_pins']['software-fixture']='b'*64
                if mutation=='order':value['basis']['classes'].reverse()
                if mutation=='member':value['files']['../escape']='a'*64
                if mutation=='teacher':value['basis']['teacher']='changed'
                (source/'manifest.json').write_bytes(a.c.sim.canonical(value))
                altered=a.runtime.sha256_file(source/'manifest.json')
                with self.subTest(mutation=mutation),self.assertRaises(ValueError):a.read_manifest(source,altered)

    def test_native_success_and_timeout_reap_owned_grandchild(self):
        a=self.a
        for name,source,timeout in (
            ('success',"import os; assert os.environ['OMP_NUM_THREADS']=='2'",5),
            ('timeout',"import subprocess,sys,pathlib,time; p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(20)']); pathlib.Path('child.pid').write_text(str(p.pid)); time.sleep(20)",.7)):
            out=self.root/name;out.mkdir()
            supervisor=a.ContextSupervisor(out,self.fixture_limits(max_fit_seconds=timeout),self.root)
            result=supervisor.run([sys.executable,'-c',source],fit_id='preparation')
            self.assertEqual(result['status'],'success' if name=='success' else 'failed',result)
            self.assertTrue(result['cleanup_confirmed'],result)
            if name=='timeout':
                self.assertEqual(result['reason'],'fit_timeout')
                pid=int((out/'child.pid').read_text())
                self.assertFalse(a.owner_identity(pid)['running'])
            with self.assertRaises(a.runtime.RuntimeSafetyError):
                supervisor.run([sys.executable,'-c','pass'],fit_id='preparation')

    def test_unknown_cleanup_is_sticky(self):
        a=self.a
        out=self.root/'unknown';out.mkdir()
        supervisor=a.ContextSupervisor(out,self.fixture_limits(),self.root)
        original=a._confirm_stock_tree
        def unknown(job,worker,assigned):
            self.assertTrue(original(job,worker,assigned))
            return False
        with patch.object(a,'_confirm_stock_tree',side_effect=unknown):
            result=supervisor.run([sys.executable,'-c','pass'],fit_id='preparation')
        self.assertEqual(result['reason'],'cleanup_unconfirmed')
        with self.assertRaises(a.runtime.RuntimeSafetyError):supervisor.run([sys.executable,'-c','pass'],fit_id='evaluation')
        supervisor._job.close()  # Test confirmed real drain above; release only its own retained handle.

    def test_delayed_cleanup_holds_admission(self):
        a=self.a
        out=self.root/'delay';out.mkdir()
        supervisor=a.ContextSupervisor(out,self.fixture_limits(),self.root)
        entered,release=threading.Event(),threading.Event()
        original=a._confirm_stock_tree
        def delayed(*args):
            entered.set();release.wait(4)
            return original(*args)
        result=[]
        with patch.object(a,'_confirm_stock_tree',side_effect=delayed):
            thread=threading.Thread(target=lambda:result.append(supervisor.run([sys.executable,'-c','pass'],fit_id='preparation')))
            thread.start()
            try:
                self.assertTrue(entered.wait(5))
                with self.assertRaises(a.runtime.RuntimeSafetyError):supervisor.run([sys.executable,'-c','pass'],fit_id='evaluation')
            finally:release.set();thread.join(5)
        self.assertEqual(result[0]['status'],'success')

    def test_missing_monitor_combined_output_and_admission_lock(self):
        a=self.a
        out=self.root/'limits';out.mkdir()
        supervisor=a.ContextSupervisor(out,self.fixture_limits(max_output_bytes=10),self.root)
        (self.root/'large').write_bytes(b'x'*20)
        with self.assertRaises(a.runtime.RuntimeSafetyError):supervisor.preflight()
        with patch.object(a.runtime,'native_snapshot',side_effect=OSError('missing')):
            with self.assertRaises(a.runtime.RuntimeSafetyError):supervisor.preflight()
        with patch.object(a,'BASE',self.root),patch.object(a,'other_training_processes',return_value=[]):
            lock=a.acquire_active()
            with self.assertRaises(FileExistsError):a.acquire_active()
            a.release_active(lock)
            self.assertFalse((self.root/'registry/active.json').exists())
        with patch.object(a,'BASE',self.root),patch.object(a,'other_training_processes',return_value=[123]):
            with self.assertRaises(a.runtime.RuntimeSafetyError):a.acquire_active()

    def test_other_project_training_process_is_detected_without_stopping_it(self):
        import subprocess
        script=self.root/'freshretailnet_train.py';script.write_text('import time; time.sleep(60)')
        worker=subprocess.Popen([sys.executable,str(script)])
        try:
            self.assertIn(worker.pid,self.a.other_training_processes())
            self.assertIsNone(worker.poll())
        finally:
            worker.terminate();worker.wait(timeout=5)

    def test_native_venv_launcher_is_not_a_second_training_run(self):
        import subprocess
        script=self.root/'inventory_context_cli_probe.py'
        script.write_text('import sys, json\n'
            f'sys.path.insert(0, {str(Path(__file__).parent.resolve())!r})\n'
            'import inventory_context_artifacts as a\n'
            'print(json.dumps(a.other_training_processes()))\n')
        result=subprocess.run([sys.executable,str(script),'prepare'],
            capture_output=True,text=True,check=True,timeout=30)
        self.assertEqual(json.loads(result.stdout),[])

    def test_only_verified_parent_launcher_is_excluded(self):
        import copy
        rows=[dict(pid=2,parent=1,executable='C:/base/python.exe',created=20,same_command=True,training=True),
              dict(pid=1,parent=0,executable='C:/venv/python.exe',created=10,same_command=True,training=True),
              dict(pid=3,parent=1,executable='C:/venv/python.exe',created=30,same_command=True,training=True)]
        def detected(values):return self.a._external_training_ids(values,2,1,'C:/venv/python.exe','C:/base/python.exe')
        self.assertEqual(detected(rows),[3])
        for key,value in (('same_command',False),('executable','C:/other/python.exe'),('created',21),('created',None)):
            altered=copy.deepcopy(rows);altered[1][key]=value
            self.assertEqual(detected(altered),[1,3])
        with self.assertRaises(self.a.runtime.RuntimeSafetyError):detected(rows[1:])


if __name__=='__main__':unittest.main()
