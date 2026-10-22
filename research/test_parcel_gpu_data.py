"""Artificial encoded files only; no image decode or model-weight loading."""
import copy
import builtins
import hashlib
import importlib
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

try:
    gpu=importlib.import_module('parcel_gpu_data')
except ModuleNotFoundError:
    gpu=None


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path,value):
    path.write_text(json.dumps(value),encoding='utf-8')


class TransportTests(unittest.TestCase):
    def setUp(self):
        parent=Path(__file__).resolve().parents[1]/'outputs'/'parcel-visible-implementation-20261021'/'gpu-fixtures'
        parent.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=parent);self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.data=self.root/'research'/'datasets';self.data.mkdir(parents=True)
        self.assets=self.data/'assets';self.assets.mkdir()
        rows=[]
        for index,(split,label) in enumerate([('train','Normal'),('train','Damaged'),('validation','Normal'),('validation','Damaged')]):
            path=self.assets/f'fixture-{index}.jpg';path.write_bytes(('artificial encoded image '+str(index)).encode())
            rows.append(dict(sample_id=str(index),split=split,label=label,dependency_group_id='g'+str(index),
                source_family='f'+str(index),path=path.relative_to(self.root).as_posix(),sha256=sha(path.read_bytes()),
                pixel_sha256=str(index)*64,width=64,height=64))
        self.manifest_payload=dict(schema_version=1,benchmark_profile='parcel_visible_development',class_order=['Normal','Damaged'],
            training_admission=True,admission_kind='visible_review_overlay_v1',rows=rows,
            source=dict(path='C:/original/Downloads/source.zip',sha256='a'*64),
            bindings=[dict(path='C:/original/research/datasets/native.json',sha256='b'*64)])
        self.manifest=self.data/'admitted.json';write(self.manifest,dict(payload=self.manifest_payload,sha256=digest(self.manifest_payload)))
        weights={};proofs=[]
        for name in ('mobilenetv2','efficientnetb0'):
            path=self.assets/(name+'.h5');path.write_bytes(('artificial weight '+name).encode())
            weights[name]=dict(path=str(path),sha256=sha(path.read_bytes()),source='official fixture metadata',licence='fixture')
        for index in range(4):
            path=self.assets/f'proof-{index}.json';write(path,dict(fixture=index))
            proofs.append(dict(path=str(path),sha256=sha(path.read_bytes())))
        self.protocol_payload=dict(schema_version=1,benchmark_profile='parcel_visible_development',class_order=['Normal','Damaged'],
            fit_ids=['mobilenetv2-clahe','efficientnetb0-none'],seed=42,weights=weights,weight_proofs=proofs)
        self.protocol=self.data/'protocol.json';write(self.protocol,self.protocol_payload)
        self.output=self.data/'gpu-transport'
        self.fake=types.SimpleNamespace(load_frozen=Mock(return_value=copy.deepcopy(self.manifest_payload)),
            load_protocol=Mock(return_value=copy.deepcopy(self.protocol_payload)),code_bindings=lambda:{})

    def boundaries(self):
        self.assertIsNotNone(gpu,'GPU transport is not implemented')
        for item in [patch.object(gpu,'ROOT',self.root),patch.object(gpu,'_git_check',return_value=None),
            patch.object(gpu,'WEIGHT_METADATA',{name:digest({k:v for k,v in value.items() if k!='path'})
                                              for name,value in self.protocol_payload['weights'].items()}),
            patch.object(gpu,'PROOF_HASHES',{row['sha256'] for row in self.protocol_payload['weight_proofs']}),
            patch.dict('sys.modules',{'parcel_visible_train':self.fake})]:
            item.start();self.addCleanup(item.stop)

    def exported(self):
        self.boundaries();path=gpu.export(self.manifest,self.protocol,self.output)
        self.assertEqual(path,self.output/'transport.json')
        return path,gpu.load_transport(path,repo_root=self.root)

    def test_export_preserves_source_bytes_membership_and_windows_bindings(self):
        original_manifest=self.manifest.read_bytes();original_protocol=self.protocol.read_bytes()
        path,result=self.exported()
        self.fake.load_frozen.assert_called_once_with(self.manifest)
        self.fake.load_protocol.assert_called_once_with(self.protocol)
        self.assertEqual(result['manifest'],self.manifest_payload)
        self.assertEqual(result['protocol'],self.protocol_payload)
        self.assertEqual((self.output/'manifest-original.json').read_bytes(),original_manifest)
        self.assertEqual((self.output/'protocol-original.json').read_bytes(),original_protocol)
        self.assertEqual(len(result['resolved']['images']),4)
        self.assertEqual(len(result['resolved']['weights']),2)
        self.assertEqual(len(result['resolved']['weight_proofs']),4)
        self.assertTrue(all(Path(value).is_file() for value in result['resolved']['images'].values()))

    def test_original_windows_admission_failure_prevents_output(self):
        self.boundaries();self.fake.load_frozen.side_effect=ValueError('fixture admission rejected')
        with self.assertRaisesRegex(ValueError,'admission'):
            gpu.export(self.manifest,self.protocol,self.output)
        self.assertFalse(self.output.exists())

    def test_unsafe_portable_paths_rejected_in_linux_logic(self):
        self.boundaries()
        for value in ('.','../escape','/etc/file','C:/Windows/file','C:\\Windows\\file','a\\b','a/../b','a//b','./file'):
            with self.subTest(value=value),self.assertRaises(ValueError):
                gpu._portable(value)
        self.assertEqual(gpu._portable('research/datasets/assets/a.jpg'),'research/datasets/assets/a.jpg')

    def test_source_copy_or_asset_hash_drift_rejected(self):
        path,result=self.exported();asset=Path(result['resolved']['images']['0']);asset.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'hash|changed'):
            gpu.load_transport(path,repo_root=self.root)

    def test_original_copy_drift_rejected(self):
        path,_=self.exported();(self.output/'protocol-original.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'hash|changed'):
            gpu.load_transport(path,repo_root=self.root)

    def test_resealed_relocation_cannot_resplit_or_relabel_membership(self):
        path,_=self.exported();doc=json.loads(path.read_text())
        doc['payload']['relocations'][0]['key']='unknown';doc['sha256']=digest(doc['payload']);write(path,doc)
        with self.assertRaisesRegex(ValueError,'relocation|membership'):
            gpu.load_transport(path,repo_root=self.root)

    def test_existing_output_and_outside_output_refused(self):
        self.exported()
        with self.assertRaises(FileExistsError):gpu.export(self.manifest,self.protocol,self.output)
        with self.assertRaises(ValueError):gpu.export(self.manifest,self.protocol,self.root/'outside')

    def test_weight_provenance_metadata_and_proof_set_are_exact(self):
        self.boundaries();self.protocol_payload['weights']['mobilenetv2']['source']='unapproved source'
        write(self.protocol,self.protocol_payload);self.fake.load_protocol.return_value=copy.deepcopy(self.protocol_payload)
        with self.assertRaisesRegex(ValueError,'weight|provenance'):
            gpu.export(self.manifest,self.protocol,self.output)

    def test_git_guard_rejects_tracked_dirty_or_unignored_data(self):
        self.assertIsNotNone(gpu)
        original=gpu._git_check;self.boundaries()
        relative='research/datasets/assets/fixture-0.jpg'
        for bad in ('tracked','dirty','unignored'):
            outputs=[(str(self.root)+'\n').encode(),b'tracked\0' if bad=='tracked' else b'',
                     b'?? untracked\0' if bad=='dirty' else b'',b'' if bad=='unignored' else (relative+'\0').encode()]
            results=[types.SimpleNamespace(returncode=0,stdout=out) for out in outputs]
            with patch.object(gpu.subprocess,'run',side_effect=results),self.assertRaisesRegex(ValueError,'ignored|tracked|Git'):
                original(self.root,[relative])

    def test_linux_load_imports_no_windows_admission_or_ml_modules(self):
        path,_=self.exported();original=builtins.__import__
        forbidden={'tensorflow','keras','numpy','cv2','parcel_visible_train','parcel_visible_manifest','parcel_visible_review','runner_runtime'}
        def guarded(name,*args,**kwargs):
            if name.split('.')[0] in forbidden:raise AssertionError('Forbidden Linux-load import '+name)
            return original(name,*args,**kwargs)
        with patch('builtins.__import__',side_effect=guarded):
            self.assertEqual(len(gpu.load_transport(path,repo_root=self.root)['manifest']['rows']),4)

    def test_link_guard_rejects_os_reported_symlink(self):
        path,result=self.exported();target=Path(result['resolved']['images']['0'])
        original=Path.is_symlink
        with patch.object(Path,'is_symlink',autospec=True,side_effect=lambda value:value==target or original(value)):
            with self.assertRaisesRegex(ValueError,'link'):
                gpu.load_transport(path,repo_root=self.root)

    def test_windows_to_linux_mapping_is_explicit_and_contained(self):
        self.boundaries()
        self.assertEqual(gpu._windows_relative('C:\\repo\\research\\datasets\\a.jpg','C:\\repo'),
                         'research/datasets/a.jpg')
        for value in ('D:\\repo\\a.jpg','C:\\repo-other\\a.jpg','C:\\repo\\..\\outside.jpg','/mnt/c/repo/a.jpg'):
            with self.subTest(value=value),self.assertRaises(ValueError):
                gpu._windows_relative(value,'C:\\repo')

    def test_resealed_windows_absolute_relocation_refused(self):
        path,_=self.exported();doc=json.loads(path.read_text())
        doc['payload']['relocations'][0]['repo_path']='C:/outside/model.h5'
        doc['sha256']=digest(doc['payload']);write(path,doc)
        with self.assertRaisesRegex(ValueError,'relocation|Relocation'):
            gpu.load_transport(path,repo_root=self.root)

    def test_missing_proof_is_not_replaced_by_another_receipt(self):
        path,result=self.exported();proof=next(iter(result['resolved']['weight_proofs'].values()))
        Path(proof).write_bytes(b'different receipt')
        with self.assertRaisesRegex(ValueError,'hash'):
            gpu.load_transport(path,repo_root=self.root)

    def test_bound_original_source_code_drift_rejected(self):
        source=self.root/'research'/'fixture-source.py';source.write_text('original fixture source')
        self.fake.code_bindings=lambda:{'fixture-source.py':sha(source.read_bytes())}
        path,_=self.exported();source.write_text('changed fixture source')
        with self.assertRaisesRegex(ValueError,'source code'):
            gpu.load_transport(path,repo_root=self.root)

    def test_cold_import_requires_only_stdlib(self):
        self.assertIsNotNone(gpu);original=builtins.__import__
        forbidden={'tensorflow','keras','numpy','cv2','parcel_visible_train','parcel_visible_manifest','parcel_visible_review','runner_runtime'}
        def guarded(name,*args,**kwargs):
            if name.split('.')[0] in forbidden:raise AssertionError('Forbidden cold import '+name)
            return original(name,*args,**kwargs)
        with patch('builtins.__import__',side_effect=guarded):importlib.reload(gpu)


if __name__=='__main__':unittest.main()
