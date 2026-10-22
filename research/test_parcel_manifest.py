import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import cv2
import numpy as np

import parcel_manifest as pm

class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=Path(__file__).parent / 'datasets')
        self.root = Path(self.tmp.name)
        registry = {'fixture': {'licence':'CC0-1.0', 'provenance':'Synthetic software fixture generated for tests', 'licence_evidence':'Fixture authors grant CC0 in this test', 'approved':True}}
        self.registry = self.root / 'sources.json'
        self.registry.write_text(json.dumps(registry))
        self.doc = {'schema_version':1, 'image_root':str(self.root.resolve()), 'domain':'synthetic', 'source_registry':'sources.json', 'source_registry_sha256':self.sha(self.registry), 'rows':[]}
        for n in range(20):
            p = self.root / f'{n}.png'
            cv2.imwrite(str(p), np.full((64,64,3), (n*10,n,255-n), dtype=np.uint8))
            self.doc['rows'].append(dict(sample_id=f's{n}',image_path=p.name,image_sha256=self.sha(p),label=['Normal','Damaged'][n%2],label_status='reviewed',review_evidence='review-log.json#reviewer-A-case-'+str(n),source_id='fixture',origin='synthetic',group_id=f'g{n}',group_status='confirmed',role='primary',target_status='single_principal',split=''))
        self.path = self.root / 'manifest.json'
    def tearDown(self): self.tmp.cleanup()
    @staticmethod
    def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
    def save(self): self.path.write_text(json.dumps(self.doc)); return self.path
    def test_freeze_balanced_deterministic_immutable(self):
        a=pm.freeze_split(self.save(),self.root/'a.json')
        b=pm.freeze_split(self.path,self.root/'b.json')
        self.assertEqual(a.read_bytes(),b.read_bytes())
        receipt=json.loads(Path(str(a)+'.audit.json').read_text())
        self.assertEqual(receipt['manifest_sha256'],self.sha(a))
        self.assertTrue(receipt['verify_images'])
        counts=pm.audit_manifest(a)['partitions']
        for split in ('train','validation','test'):
            self.assertGreater(counts[split]['classes']['Normal'],0)
            self.assertGreater(counts[split]['classes']['Damaged'],0)
        with self.assertRaises(FileExistsError): pm.freeze_split(self.path,a)
    def test_invalid_fields(self):
        cases=[('review_evidence',''),('label_status','pending'),('role','challenge'),('image_sha256','0'*64),('image_path','../escape.png'),('group_status','pending'),('target_status','multiple')]
        for field,value in cases:
            with self.subTest(field=field):
                old=self.doc['rows'][0][field]; self.doc['rows'][0][field]=value
                with self.assertRaises(ValueError): pm.audit_manifest(self.save())
                self.doc['rows'][0][field]=old
    def test_unknown_licence(self):
        self.registry.write_text(json.dumps({'fixture':{'licence':'unknown','provenance':'public source','licence_evidence':'unknown','approved':True}}))
        self.doc['source_registry_sha256']=self.sha(self.registry)
        with self.assertRaises(ValueError): pm.audit_manifest(self.save())
    def test_short_valid_licence_identifier(self):
        registry=json.loads(self.registry.read_text())
        registry['fixture']['licence']='MIT'
        self.registry.write_text(json.dumps(registry))
        self.doc['source_registry_sha256']=self.sha(self.registry)
        self.assertEqual(pm.audit_manifest(self.save(),verify_images=False)['images'],20)
    def test_decoded_duplicates(self):
        p=self.root/'copy.bmp'; cv2.imwrite(str(p), cv2.imread(str(self.root/'0.png')))
        self.doc['rows'][1].update(image_path=p.name,image_sha256=self.sha(p))
        with self.assertRaises(ValueError): pm.audit_manifest(self.save())
    def test_connected_group_cross_split(self):
        self.doc['rows'][0].update(dependency_ids=['session:A'],split='train')
        self.doc['rows'][1].update(dependency_ids=['session:A'],split='test')
        with self.assertRaises(ValueError): pm.load_manifest(self.save(),verify_images=False)
    def test_metadata_only_never_opens_pixels(self):
        with patch('cv2.imdecode',side_effect=AssertionError('pixels opened')):
            self.assertEqual(len(pm.load_manifest(self.save(),verify_images=False)['rows']),20)
    def test_intake_minimum_and_reserved_panel(self):
        self.doc['rows']=self.doc['rows'][:6]
        with self.assertRaises(ValueError): pm.freeze_split(self.save(),self.root/'split.json')
        self.doc['rows'][0]['source_id']='tampar'
        with self.assertRaises(ValueError): pm.load_manifest(self.save(),verify_images=False)
    def test_near_duplicate_needs_decision(self):
        self.doc['rows'][0]['near_duplicate_flags']=['s1']
        with self.assertRaises(ValueError): pm.load_manifest(self.save(),verify_images=False)
    def test_registry_hash(self):
        self.doc['source_registry_sha256']='0'*64
        with self.assertRaises(ValueError): pm.load_manifest(self.save(),verify_images=False)
    def test_tracked_or_nonignored_input_rejected(self):
        import runner_runtime
        with patch.object(runner_runtime,'_validate_output_path',
                          side_effect=runner_runtime.RuntimeSafetyError('tracked')):
            with self.assertRaisesRegex(ValueError,'tracked'):
                pm.load_manifest(self.save(),verify_images=False)
    def test_reserved_hash_cannot_be_renamed(self):
        reserved=self.root/'reserved.csv'
        reserved.write_text('original_sha256\n'+self.doc['rows'][0]['image_sha256']+'\n')
        with patch.object(pm,'RESERVED_REVIEW',reserved,create=True):
            with self.assertRaises(ValueError): pm.load_manifest(self.save(),verify_images=False)
    def test_connected_mixed_group_stays_together(self):
        self.doc['rows'][0]['dependency_ids']=['recording:A']
        self.doc['rows'][1]['dependency_ids']=['recording:A','derived:B']
        self.doc['rows'][2]['dependency_ids']=['derived:B']
        frozen=pm.load_manifest(pm.freeze_split(self.save(),self.root/'frozen.json'),verify_images=False)
        self.assertEqual(len({r['split'] for r in frozen['rows'][:3]}),1)
    def test_metadata_only_never_reads_image_bytes(self):
        original=Path.read_bytes
        def guarded(path):
            if path.suffix=='.png': raise AssertionError('image bytes accessed')
            return original(path)
        self.save()
        with patch.object(Path,'read_bytes',guarded):
            pm.load_manifest(self.path,verify_images=False)
    def test_invalid_json_shapes(self):
        for invalid in ([], {'schema_version':1,'domain':'synthetic','rows':[None]}):
            self.path.write_text(json.dumps(invalid))
            with self.assertRaises(ValueError): pm.load_manifest(self.path,verify_images=False)
    def register_two_sources(self):
        registry=json.loads(self.registry.read_text())
        registry['second']=dict(registry['fixture'])
        self.registry.write_text(json.dumps(registry))
        self.doc['source_registry_sha256']=self.sha(self.registry)
    def test_source_determines_class_rejected(self):
        self.register_two_sources()
        for row in self.doc['rows']:
            row['source_id']='fixture' if row['label']=='Normal' else 'second'
        with self.assertRaisesRegex(ValueError,'source.*class'):
            pm.freeze_split(self.save(),self.root/'bad.json')
        self.assertFalse((self.root/'bad.json').exists())
        with self.assertRaisesRegex(ValueError,'source.*class'):
            pm.load_manifest(self.path,verify_images=False)
    def test_source_class_counts_and_global_only_gate(self):
        self.register_two_sources()
        for row in self.doc['rows'][10:]: row['source_id']='second'
        result=pm.audit_manifest(self.save(),verify_images=False)
        self.assertEqual(result['sources']['fixture']['classes'],{'Normal':5,'Damaged':5})
        self.assertEqual(result['sources']['second']['groups'],10)
        pm.freeze_split(self.path,self.root/'valid.json')
    def test_symlink(self):
        p=self.root/'linked.png'
        try: p.symlink_to(self.root/'0.png')
        except OSError: self.skipTest('Windows symlink privilege unavailable')
        self.doc['rows'][0]['image_path']=p.name
        with self.assertRaises(ValueError): pm.load_manifest(self.save(),verify_images=False)

if __name__=='__main__': unittest.main()





