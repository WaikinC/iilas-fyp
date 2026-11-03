"""Serving output accounting and differential frozen-supervisor guard tests."""
import contextlib
import importlib
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import runner_runtime as frozen_runtime
import inventory_inference as frozen_stock

try:
    m=importlib.import_module('inventory_context_runtime')
except ModuleNotFoundError as error:
    if error.name!='inventory_context_runtime':raise
    m=None

ROOT=Path(__file__).resolve().parents[1]

class OutputCounterTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(m,'Serving-only runtime module must exist')
        self.tmp=tempfile.TemporaryDirectory(prefix='wos-',dir=ROOT/'outputs')
        self.addCleanup(self.tmp.cleanup)
        self.tree=Path(self.tmp.name)/'tree';self.tree.mkdir()
    def test_nested_empty_zero_and_large_file_totals_equal_frozen_counter(self):
        (self.tree/'a'/'b').mkdir(parents=True);(self.tree/'empty').mkdir()
        (self.tree/'zero').touch();(self.tree/'a'/'b'/'one').write_bytes(b'x'*17)
        with (self.tree/'large').open('wb') as f:f.truncate(1024**2+31)
        self.assertEqual(m.measure_output_bytes(self.tree),1024**2+48)
        self.assertEqual(m.measure_output_bytes(self.tree),frozen_runtime._output_bytes(self.tree))
    def test_empty_tree_is_zero(self):self.assertEqual(m.measure_output_bytes(self.tree),0)
    def test_one_fresh_file_stat_is_reused(self):
        file=self.tree/'one';file.write_bytes(b'x'*17);original=os.stat;calls=[]
        def live(path,*args,**kwargs):
            if os.fspath(path)==str(file):calls.append(kwargs.get('follow_symlinks'))
            return original(path,*args,**kwargs)
        with patch.object(m.os,'stat',side_effect=live):self.assertEqual(m.measure_output_bytes(self.tree),17)
        self.assertEqual(calls,[False])
    def test_second_scan_observes_growth(self):
        file=self.tree/'one';file.write_bytes(b'x'*17);self.assertEqual(m.measure_output_bytes(self.tree),17)
        with file.open('ab') as f:f.write(b'y'*31)
        self.assertEqual(m.measure_output_bytes(self.tree),48)
    def test_growth_after_enumeration_before_stat_is_counted(self):
        file=self.tree/'one';file.write_bytes(b'x'*17);original=os.scandir
        @contextlib.contextmanager
        def changing(path):
            with original(path) as entries:
                def rows():
                    for entry in entries:
                        if entry.name=='one':
                            entry.stat(follow_symlinks=False)  # Windows cached size17
                            file.write_bytes(b'x'*48)
                        yield entry
                yield rows()
        with patch.object(m.os,'scandir',changing):self.assertEqual(m.measure_output_bytes(self.tree),48)
    def test_unreadable_or_disappearing_entry_never_returns_partial_total(self):
        file=self.tree/'one';file.write_bytes(b'x');original=os.stat
        for failure in [PermissionError('denied'),FileNotFoundError('changed')]:
            def failed(path,*args,**kwargs):
                if os.fspath(path)==str(file):raise failure
                return original(path,*args,**kwargs)
            with self.subTest(error=type(failure).__name__),patch.object(m.os,'stat',side_effect=failed):
                with self.assertRaises(frozen_runtime.RuntimeSafetyError):m.measure_output_bytes(self.tree)
    def test_missing_or_file_root_is_refused(self):
        file=self.tree/'one';file.touch()
        for root in [self.tree/'absent',file]:
            with self.subTest(root=root.name),self.assertRaises(frozen_runtime.RuntimeSafetyError):m.measure_output_bytes(root)
    def test_nonlink_reparse_metadata_is_not_blanket_rejected(self):
        file=self.tree/'one';file.write_bytes(b'x'*17);original=os.stat
        def cloud(path,*args,**kwargs):
            if os.fspath(path)==str(file):return SimpleNamespace(st_mode=stat.S_IFREG,st_size=17,st_reparse_tag=0x9000001A)
            return original(path,*args,**kwargs)
        with patch.object(m.os,'stat',side_effect=cloud):self.assertEqual(m.measure_output_bytes(self.tree),17)
    def test_link_reparse_tags_are_refused_even_with_regular_mode(self):
        file=self.tree/'one';file.touch();original=os.stat
        for tag in [0xA000000C,0xA0000003]:
            def linked(path,*args,**kwargs):
                if os.fspath(path)==str(file):return SimpleNamespace(st_mode=stat.S_IFREG,st_size=17,st_reparse_tag=tag)
                return original(path,*args,**kwargs)
            with self.subTest(tag=tag),patch.object(m.os,'stat',side_effect=linked):
                with self.assertRaises(frozen_runtime.RuntimeSafetyError):m.measure_output_bytes(self.tree)
    def test_directory_is_rechecked_before_descend(self):
        child=self.tree/'child';child.mkdir();original=os.stat;visits=0;scandir=os.scandir
        def swapped(path,*args,**kwargs):
            nonlocal visits
            if os.fspath(path)==str(child):
                visits+=1
                if visits>1:return SimpleNamespace(st_mode=stat.S_IFDIR,st_size=0,st_reparse_tag=0xA0000003)
            return original(path,*args,**kwargs)
        def no_follow(path):
            if os.fspath(path)==str(child):raise AssertionError('Traversed replaced directory')
            return scandir(path)
        with patch.object(m.os,'stat',side_effect=swapped),patch.object(m.os,'scandir',side_effect=no_follow):
            with self.assertRaises(frozen_runtime.RuntimeSafetyError):m.measure_output_bytes(self.tree)
        self.assertEqual(visits,2)
    def test_hardlink_counts_per_path(self):
        file=self.tree/'one';file.write_bytes(b'x'*13);os.link(file,self.tree/'two')
        self.assertEqual(m.measure_output_bytes(self.tree),26)
        self.assertEqual(m.measure_output_bytes(self.tree),frozen_runtime._output_bytes(self.tree))
    @unittest.skipUnless(os.name=='nt','Native Windows junction required')
    def test_native_windows_junction_is_refused_without_touching_target(self):
        import _winapi
        target=Path(self.tmp.name)/'target';target.mkdir();marker=target/'marker';marker.write_bytes(b'preserve')
        link=self.tree/'junction';_winapi.CreateJunction(str(target),str(link))
        try:
            for root in [self.tree,link]:
                with self.subTest(root=root.name),self.assertRaises(frozen_runtime.RuntimeSafetyError):m.measure_output_bytes(root)
            self.assertEqual(marker.read_bytes(),b'preserve')
        finally:os.rmdir(link)
        self.assertEqual(marker.read_bytes(),b'preserve')
    def test_native_symlink_is_refused_without_touching_target(self):
        target=Path(self.tmp.name)/'target';target.mkdir();marker=target/'marker';marker.write_bytes(b'preserve');link=self.tree/'symbolic'
        try:os.symlink(target,link,target_is_directory=True)
        except OSError as e:self.skipTest('Native symlink unavailable: '+str(e.winerror if hasattr(e,'winerror') else e.errno))
        try:
            with self.assertRaises(frozen_runtime.RuntimeSafetyError):m.measure_output_bytes(self.tree)
        finally:link.unlink()
        self.assertEqual(marker.read_bytes(),b'preserve')

class GuardParityTests(unittest.TestCase):
    def setUp(self):self.assertIsNotNone(m,'Serving-only runtime module must exist')
    def invoke(self,kind,*,available=1000,rss=100,disk=1000,run_bytes=0,total=0,clock=1,required=None,resident=False,monitor_error=False):
        run=Path('controlled-run');root=Path('controlled-root')
        instance=object.__new__(kind);instance.output_dir=run;instance.stock_root=root;instance._job=None;instance.started=0;instance.last_snapshot=None
        instance.limits=frozen_runtime.Limits(max_wall_seconds=10,max_fit_seconds=15,max_rss_bytes=200,min_available_bytes=500,min_free_disk_bytes=100,max_output_bytes=1000,poll_seconds=.1,threads=2)
        def count(path):return total if path==root else run_bytes
        snap=dict(available_bytes=available,rss_bytes=rss,pids=[123]);error=OSError('native monitor lost') if monitor_error else None
        with patch.object(frozen_runtime,'native_snapshot',side_effect=error,return_value=snap.copy()),patch.object(frozen_runtime.shutil,'disk_usage',return_value=SimpleNamespace(free=disk)),patch.object(frozen_runtime.time,'monotonic',return_value=clock),patch.object(frozen_runtime,'_output_bytes',side_effect=count),patch.object(m,'measure_output_bytes',side_effect=count):
            try:value=instance.preflight(required_available_bytes=required,include_resident=resident);return ('ok',value)
            except frozen_runtime.RuntimeSafetyError as e:return ('error',str(e))
    def test_all_base_guards_match_frozen_supervisor(self):
        for options,code in [({},None),({'available':499},'available_memory'),({'rss':201},'rss_limit'),({'disk':99},'free_disk_limit'),({'run_bytes':1001},'output_limit'),({'clock':11},'wall_timeout'),({'monitor_error':True},'Resource monitoring unavailable: native monitor lost'),({'required':1001},'available_memory'),({'available':400,'resident':True},None),({'available':400},'available_memory')]:
            with self.subTest(options=options):
                old=self.invoke(frozen_stock._StockSupervisor,**options);new=self.invoke(m.ContextServingSupervisor,**options)
                self.assertEqual(new,old)
                self.assertEqual(new[0],'error' if code else 'ok')
                if code:self.assertEqual(new[1],code)
    def test_global_cap_and_equality_match(self):
        for options,code in [({'total':100*1024**2},None),({'total':100*1024**2+1},'total_output_limit'),({'available':500,'rss':200,'disk':100,'run_bytes':1000,'clock':10},None)]:
            with self.subTest(options=options):
                old=self.invoke(frozen_stock._StockSupervisor,**options);new=self.invoke(m.ContextServingSupervisor,**options);self.assertEqual(new,old)
                self.assertEqual(new[0],'error' if code else 'ok')
                if code:self.assertEqual(new[1],code)
    def test_inherited_run_constructor_and_limits_unchanged(self):
        self.assertIs(m.ContextServingSupervisor.run,frozen_stock._StockSupervisor.run)
        self.assertIs(m.ContextServingSupervisor.__init__,frozen_stock._StockSupervisor.__init__)
        self.assertEqual(m.TOTAL_OUTPUT_BYTES,frozen_stock.TOTAL_OUTPUT_BYTES)

if __name__=='__main__':unittest.main()
