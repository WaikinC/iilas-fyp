"""Mock FD fixtures on Windows; real Linux cases use only artificial files."""
import errno
import hashlib
import importlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import types
import unittest
from unittest.mock import patch

import parcel_gpu_data as slow
import test_parcel_gpu_data as fixture_module

try:fast=importlib.import_module('parcel_gpu_data_fast')
except ModuleNotFoundError:fast=None


def status(mode=stat.S_IFREG|0o444,*,size=3,mtime=100,nlink=1,ctime=100,atime=50,ino=20,dev=1):
    return types.SimpleNamespace(st_mode=mode,st_dev=dev,st_ino=ino,st_nlink=nlink,
                                 st_size=size,st_mtime_ns=mtime,st_ctime_ns=ctime,st_atime_ns=atime)


class MockDescriptorTests(unittest.TestCase):
    def reader(self):
        self.assertIsNotNone(fast,'Fast loader is not implemented')
        reader=object.__new__(fast._Reader);reader.root=PurePosixPath('/repo');reader.cache={'':10}
        for key,value in [('O_NOFOLLOW',0x20000),('O_DIRECTORY',0x10000),('O_NONBLOCK',0x800)]:
            item=patch.object(fast.os,key,value,create=True);item.start();self.addCleanup(item.stop)
        return reader

    def test_all_bytes_hashed_and_owned_descriptors_closed(self):
        reader=self.reader()
        with patch.object(fast.os,'open',return_value=20) as opened,patch.object(fast.os,'fstat',side_effect=[status(),status()]), \
             patch.object(fast.os,'read',side_effect=[b'ab',b'c',b'']), \
             patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/asset'), \
             patch.object(fast.os,'close') as closed:
            with reader:
                value,_=reader.read('asset',10)
            self.assertEqual(value,hashlib.sha256(b'abc').hexdigest())
            self.assertTrue(opened.call_args.args[1]&fast.os.O_NOFOLLOW)
            self.assertEqual({call.args[0] for call in closed.call_args_list},{10,20})

    def test_file_drift_rejected_and_closed(self):
        reader=self.reader()
        with patch.object(fast.os,'open',return_value=20),patch.object(fast.os,'fstat',side_effect=[status(),status(mtime=200)]), \
             patch.object(fast.os,'read',side_effect=[b'abc',b'']), \
             patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/asset'), \
             patch.object(fast.os,'close') as closed:
            with self.assertRaisesRegex(ValueError,'changed|drift'):
                with reader:reader.read('asset',10)
            self.assertEqual({call.args[0] for call in closed.call_args_list},{10,20})

    def test_proc_descriptor_escape_rejected_before_hashing(self):
        reader=self.reader()
        with patch.object(fast.os,'open',return_value=20),patch.object(fast.os,'fstat',return_value=status()), \
             patch.object(fast.os,'read') as read,patch.object(fast.os,'close') as closed, \
             patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/outside/asset'):
            with self.assertRaisesRegex(ValueError,'descriptor|containment|target'):
                with reader:reader.read('asset',10)
            read.assert_not_called();self.assertEqual({call.args[0] for call in closed.call_args_list},{10,20})

    def test_descriptor_exhaustion_closes_cached_parents(self):
        reader=self.reader()
        with patch.object(fast.os,'open',side_effect=[11,OSError(errno.EMFILE,'too many descriptors')]), \
             patch.object(fast.os,'fstat',return_value=status(stat.S_IFDIR|0o555)), \
             patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/one'), \
             patch.object(fast.os,'close') as closed:
            with self.assertRaises(OSError):
                with reader:reader.read('one/two/asset',10)
            self.assertEqual({call.args[0] for call in closed.call_args_list},{10,11})

    def test_hardlink_and_bound_refuse_before_hashing(self):
        for file_status in (status(nlink=2),status(size=11),status(stat.S_IFIFO|0o444)):
            with self.subTest(file_status=file_status):
                reader=self.reader()
                with patch.object(fast.os,'open',return_value=20),patch.object(fast.os,'fstat',return_value=file_status), \
                     patch.object(fast.os,'read') as read,patch.object(fast.os,'close'), \
                     patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/asset'):
                    with self.assertRaises(ValueError):
                        with reader:reader.read('asset',10)
                    read.assert_not_called()

    def test_nonregular_open_is_nonblocking_before_fstat(self):
        reader=self.reader()
        with patch.object(fast.os,'open',return_value=20) as opened,patch.object(fast.os,'fstat',return_value=status(stat.S_IFIFO|0o444)), \
             patch.object(fast.os,'close'),patch.object(fast.os,'readlink',return_value='/repo'):
            with self.assertRaises(ValueError):
                with reader:reader.read('asset',10)
            self.assertTrue(opened.call_args.args[1]&fast.os.O_NONBLOCK)

    def test_parent_descriptor_is_reused_but_every_asset_rehashed(self):
        reader=self.reader();targets={10:'/repo',11:'/repo/shared',20:'/repo/shared/a',21:'/repo/shared/b'}
        with patch.object(fast.os,'open',side_effect=[11,20,21]) as opened, \
             patch.object(fast.os,'fstat',side_effect=[status(stat.S_IFDIR|0o555),status(),status(),status(),status()]), \
             patch.object(fast.os,'read',side_effect=[b'abc',b'',b'abc',b'']) as read,patch.object(fast.os,'close'), \
             patch.object(fast.os,'readlink',side_effect=lambda path:targets[int(str(path).rsplit('/',1)[1])]):
            with reader:
                reader.read('shared/a',10);reader.read('shared/b',10)
            self.assertEqual(opened.call_count,3);self.assertEqual(read.call_count,4)

    def test_parser_failure_still_closes_leaf_and_cache(self):
        reader=self.reader()
        with patch.object(fast.os,'open',return_value=20),patch.object(fast.os,'fstat',return_value=status()), \
             patch.object(fast.os,'read',side_effect=[b'abc',b'']),patch.object(fast.os,'close') as closed, \
             patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/asset'):
            def invalid_parser(path):raise ValueError('fixture parse failed')
            with self.assertRaisesRegex(ValueError,'parse failed'):
                with reader:reader.read('asset',10,invalid_parser)
            self.assertEqual({call.args[0] for call in closed.call_args_list},{10,20})

    def test_observed_advancing_coupled_access_stamp_accepted(self):
        reader=self.reader()
        before=status(ctime=1792583052395602900,atime=1792584556457010600)
        after=status(ctime=1792587083408636600,atime=1792587083408636600)
        with patch.object(fast.os,'open',return_value=20),patch.object(fast.os,'fstat',side_effect=[before,after]), \
             patch.object(fast.os,'read',side_effect=[b'abc',b'']),patch.object(fast.os,'close'), \
             patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/asset'):
            with reader:digest,_=reader.read('asset',10)
            self.assertEqual(digest,hashlib.sha256(b'abc').hexdigest())

    def test_other_ctime_or_strict_identity_changes_still_rejected(self):
        for after in (status(ctime=200),status(ctime=200,atime=200,mtime=200),status(ctime=200,atime=200,ino=21),
                      status(ctime=200,atime=200,size=4),status(ctime=40,atime=40),status(ctime=200,atime=49),
                      status(ctime=200,atime=201),status(ctime=200,atime=200,dev=2),status(ctime=200,atime=200,nlink=2),
                      status(stat.S_IFREG|0o600,ctime=200,atime=200)):
            with self.subTest(after=after):
                reader=self.reader()
                with patch.object(fast.os,'open',return_value=20),patch.object(fast.os,'fstat',side_effect=[status(),after]), \
                     patch.object(fast.os,'read',side_effect=[b'abc',b'']),patch.object(fast.os,'close'), \
                     patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/asset'):
                    with self.assertRaisesRegex(ValueError,'changed'):
                        with reader:reader.read('asset',10)

    def test_parser_reads_immutable_exact_hashed_buffer_without_reopen(self):
        reader=self.reader();payload=b'{"value":1}';size=len(payload)
        def parse(snapshot):
            self.assertTrue(snapshot.is_file());self.assertEqual(snapshot.stat().st_size,size)
            with self.assertRaises(AttributeError):snapshot._data=b'changed'
            return slow._json(snapshot)
        with patch.object(fast.os,'open',return_value=20),patch.object(fast.os,'fstat',side_effect=[status(size=size),status(size=size)]), \
             patch.object(fast.os,'read',side_effect=[payload[:4],payload[4:],b'']),patch.object(fast.os,'close'), \
             patch.object(Path,'open',side_effect=AssertionError('Parser must not reopen descriptor path')), \
             patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/asset'):
            with reader:digest,value=reader.read('asset',100,parse)
            self.assertEqual(value,{'value':1});self.assertEqual(digest,hashlib.sha256(payload).hexdigest())

    def test_buffer_keeps_original_duplicate_nonfinite_and_seal_guards(self):
        self.assertIsNotNone(fast)
        for payload in (b'{"a":1,"a":2}',b'{"a":NaN}'):
            with self.subTest(payload=payload),self.assertRaises(ValueError):slow._json(fast._BytesPath(payload))
        value={'payload':{'a':1},'sha256':slow._digest({'a':1})}
        self.assertEqual(slow._unseal(fast._BytesPath(json.dumps(value).encode())),{'a':1})
        value['payload']['a']=2
        with self.assertRaisesRegex(ValueError,'seal'):slow._unseal(fast._BytesPath(json.dumps(value).encode()))

    def test_parser_buffer_ceiling_checked_before_open(self):
        reader=self.reader()
        with patch.object(fast.os,'open') as opened,patch.object(fast.os,'close'):
            with self.assertRaisesRegex(ValueError,'buffer'):
                with reader:reader.read('asset',33*slow.MiB,slow._json)
            opened.assert_not_called()

    def test_paired_stamp_does_not_bypass_actual_caller_expected_hash(self):
        reader=self.reader()
        with patch.object(fast.os,'open',return_value=20),patch.object(fast.os,'fstat',side_effect=[status(),status(ctime=200,atime=200)]), \
             patch.object(fast.os,'read',side_effect=[b'XYZ',b'']),patch.object(fast.os,'close'), \
             patch.object(fast.os,'readlink',side_effect=lambda path:'/repo' if str(path).endswith('/10') else '/repo/asset'):
            with reader:changed_digest,_=reader.read('asset',10)
        if sys.platform=='linux':
            native=LinuxDescriptorTests('test_fast_equals_original_loader_and_hashes_all_assets')
            native.setUp();self.addCleanup(native.doCleanups)
            fixture,transport=native.fixture,native.path
            code=slow.CODE_PATH
        else:
            fixture=fixture_module.TransportTests('test_export_preserves_source_bytes_membership_and_windows_bindings')
            fixture.setUp();self.addCleanup(fixture.doCleanups);transport,_=fixture.exported()
            code=fixture.root/'research'/'parcel_gpu_data.py';code.write_bytes(slow.CODE_PATH.read_bytes())
        class FixtureReader:
            def __init__(self,root):self.root=root
            def __enter__(self):return self
            def __exit__(self,*unused):pass
            def read(self,relative,limit,parser=None):
                data=(self.root/relative).read_bytes()
                digest=changed_digest if relative.endswith('/fixture-0.jpg') else hashlib.sha256(data).hexdigest()
                return digest,parser(fast._BytesPath(data)) if parser else None
        with patch.object(slow,'CODE_PATH',code),patch.object(fast,'_Reader',FixtureReader),patch.object(fast,'_supported',return_value=None):
            with self.assertRaisesRegex(ValueError,'asset encoded hash changed'):
                fast.load_transport(transport,repo_root=fixture.root)

    @unittest.skipIf(sys.platform=='linux','Unsupported-platform check is a Windows fixture')
    def test_unsupported_platform_fails_closed(self):
        self.assertIsNotNone(fast,'Fast loader is not implemented')
        with self.assertRaisesRegex(ValueError,'Linux|supported'):
            fast.load_transport(Path('not-opened.json'))


@unittest.skipUnless(sys.platform=='linux','Parent executes Linux artificial descriptor fixtures')
class LinuxDescriptorTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(fast)
        self.fixture=fixture_module.TransportTests('test_export_preserves_source_bytes_membership_and_windows_bindings')
        # DrvFS (/mnt/c) cannot create FIFO nodes. Keep this Linux-only tree on
        # native /tmp while reusing the unchanged shared artificial fixture.
        temporary_directory=fixture_module.tempfile.TemporaryDirectory
        def native_temporary_directory(*args,**kwargs):
            kwargs['dir']='/tmp'
            return temporary_directory(*args,**kwargs)
        with patch.object(fixture_module.tempfile,'TemporaryDirectory',side_effect=native_temporary_directory):
            self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups);self.fixture.boundaries()
        self.root=self.fixture.root;self.output=self.fixture.output;self.output.mkdir()
        reference=self.root/'research'/'parcel_gpu_data.py';reference.write_bytes(slow.CODE_PATH.read_bytes())
        source_patch=patch.object(slow,'CODE_PATH',reference);source_patch.start();self.addCleanup(source_patch.stop)
        windows_root='C:\\repo';protocol=self.fixture.protocol_payload
        for record in [*protocol['weights'].values(),*protocol['weight_proofs']]:
            record['path']=str(PurePosixPath(record['path']).relative_to(self.root))
            record['path']=windows_root+'\\'+record['path'].replace('/','\\')
        fixture_module.write(self.fixture.protocol,protocol)
        copies={}
        for name,path in [('manifest',self.fixture.manifest),('protocol',self.fixture.protocol)]:
            copied=self.output/(name+'-original.json');copied.write_bytes(path.read_bytes())
            copies[name]=dict(source_path=windows_root+'\\'+path.relative_to(self.root).as_posix().replace('/','\\'),
                repo_path=copied.relative_to(self.root).as_posix(),sha256=slow._sha(copied))
        payload=dict(schema_version=1,kind=slow.KIND,benchmark_profile=slow.PROFILE,class_order=['Normal','Damaged'],
            admission_scope='relocation_of_Windows_validated_development_inputs_only',operationally_approved=False,
            windows_repo_root=windows_root,source_copies=copies,settings=protocol,
            relocations=slow._relocations(self.fixture.manifest_payload,protocol,protocol,windows_root,copies['protocol']['source_path']),
            membership_sha256=slow._digest(self.fixture.manifest_payload['rows']),membership_count=4,
            weight_metadata=slow.WEIGHT_METADATA,proof_hashes=sorted(slow.PROOF_HASHES),source_code_bindings={},
            transport_code_sha256=slow._sha(slow.CODE_PATH))
        self.path=self.output/'transport.json';fixture_module.write(self.path,dict(payload=payload,sha256=slow._digest(payload)))

    def test_fast_equals_original_loader_and_hashes_all_assets(self):
        reference=slow.load_transport(self.path,repo_root=self.root)
        self.assertEqual(fast.load_transport(self.path,repo_root=self.root),reference)
        target=Path(reference['resolved']['images']['0']);target.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'hash|changed'):fast.load_transport(self.path,repo_root=self.root)

    def test_real_file_symlink_and_directory_symlink_rejected(self):
        asset=self.fixture.assets/'fixture-0.jpg';original=asset.read_bytes();asset.unlink()
        other=self.root/'other.jpg';other.write_bytes(original);asset.symlink_to(other)
        with self.assertRaises((ValueError,OSError)):fast.load_transport(self.path,repo_root=self.root)
        asset.unlink();asset.write_bytes(original)
        moved=self.root/'moved-assets';self.fixture.assets.rename(moved);self.fixture.assets.symlink_to(moved,target_is_directory=True)
        with self.assertRaises((ValueError,OSError)):fast.load_transport(self.path,repo_root=self.root)

    def test_real_hardlink_rejected_and_no_descriptor_leak(self):
        asset=self.fixture.assets/'fixture-0.jpg';os.link(asset,self.root/'hardlinked.jpg')
        before=len(list(Path('/proc/self/fd').iterdir()))
        with self.assertRaises(ValueError):fast.load_transport(self.path,repo_root=self.root)
        self.assertEqual(len(list(Path('/proc/self/fd').iterdir())),before)

    def test_real_fifo_is_rejected_without_blocking(self):
        asset=self.fixture.assets/'fixture-0.jpg';asset.unlink();os.mkfifo(asset)
        with self.assertRaises(ValueError):fast.load_transport(self.path,repo_root=self.root)


if __name__=='__main__':unittest.main()
