import copy
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from uuid import uuid4
import delivery_demo_artifacts as a
import delivery_demo_data as m

class Preparation(unittest.TestCase):
    def setUp(self):
        self.root=a.ROOT/'research/datasets'/('delivery-fixture-'+uuid4().hex[:8]);self.root.mkdir(parents=True)
        self.patches=[patch.object(a,'DATA_ROOT',self.root),patch.object(a,'PIN_FILES',('research/delivery_demo_contract.py','research/delivery_demo_simulation.py'))]
        for p in self.patches:p.start()
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
    def test_full_fixture_manifest_groups_labels_and_no_test_read_in_development(self):
        manifest=m.prepare_dataset(self.root/'prepared');self.assertEqual(manifest['counts'],{'train':840,'validation':180,'test':180})
        self.assertEqual(manifest['familyCounts'],{'train':210,'validation':45,'test':45})
        actual=a.read_json
        def guarded(path,*args,**kw):
            self.assertNotEqual(Path(path).name,'test.json');return actual(path,*args,**kw)
        with patch.object(a,'read_json',side_effect=guarded):self.assertEqual(m.verify_dataset(self.root/'prepared/manifest.json')['counts'],manifest['counts'])
        full=m.verify_dataset(self.root/'prepared/manifest.json',include_test=True);self.assertEqual(full['counts'],manifest['counts'])
        with self.assertRaises((ValueError,FileExistsError)):m.prepare_dataset(self.root/'different-output')
    def test_tamper_existing_outside_or_linked_paths_refuse(self):
        m.prepare_dataset(self.root/'prepared');p=self.root/'prepared/train.json';p.write_bytes(p.read_bytes()+b' ')
        with self.assertRaises(ValueError):m.verify_dataset(self.root/'prepared/manifest.json')
        with self.assertRaises(ValueError):a.safe(self.root/'../outside',self.root)
        with self.assertRaises(ValueError):a.safe(a.ROOT/'README.md',self.root)
    def test_split_is_by_entire_family_and_leakage_columns_absent(self):
        manifest=m.prepare_dataset(self.root/'prepared');groups=[]
        for name in ['train','validation','test']:
            rows=a.read_json(self.root/'prepared'/f'{name}.json');groups.append({r['case']['familyId'] for r in rows})
            self.assertGreaterEqual(min(manifest['classCounts'][name].values()),20)
        self.assertFalse(groups[0]&groups[1] or groups[0]&groups[2] or groups[1]&groups[2])
    def test_rehashed_manifest_and_hardlinked_payload_refuse(self):
        m.prepare_dataset(self.root/'prepared');p=self.root/'prepared/manifest.json';v=a.read_json(p);v['partitions']['test']='0'*64;p.write_bytes(a.canonical(v))
        with self.assertRaises(ValueError):m.verify_dataset(p)
        original=self.root/'ordinary.json';original.write_text('{"value":1}');alias=self.root/'hardlink.json';os.link(original,alias)
        with self.assertRaises(ValueError):a.read_json(alias)
        self.assertEqual(original.read_text(),'{"value":1}')

if __name__=='__main__':unittest.main()
