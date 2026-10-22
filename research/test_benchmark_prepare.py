"""Temporary fixtures verify preparation, not model performance."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import pandas as pd


class BenchmarkPreparationTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('benchmark_prepare'), 'Benchmark preparation module missing')
        import benchmark_prepare
        self.api = benchmark_prepare
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def frame(self):
        return pd.DataFrame([{'group_id':f'{label}-{i}', 'label':label}
                             for label in [0,1] for i in range(20) for _ in range(2)])

    def inventory(self):
        rows=[]
        for label in [0,1]:
            for i in range(20):
                row={c:0.5 for c in self.api.INVENTORY_COLUMNS}
                row.update(SKU=f'{label}-{i}',TIM=2,BO=label)
                row.update({f'RSK{n}':0 for n in range(1,7)})
                rows.append(row)
        rows[0]['INV']=-0.2
        return pd.DataFrame(rows)

    def test_splits_are_reproducible_and_row_order_independent(self):
        frame=self.frame()
        first=self.api.assign_splits(frame,'delivery',42)
        shuffled=frame.sample(frac=1,random_state=9)
        second=self.api.assign_splits(shuffled,'delivery',42)
        self.assertEqual(dict(zip(frame.group_id,first)),dict(zip(shuffled.group_id,second)))
        frame['split']=first
        self.assertEqual(frame.groupby('group_id').split.nunique().max(),1)
        self.assertEqual(frame.drop_duplicates('group_id').split.value_counts().to_dict(),{'train':28,'validation':6,'test':6})
        for split in ['train','validation','test']:
            self.assertEqual(set(frame.loc[frame.split==split,'label']),{0,1})

    def test_inventory_is_80_20_and_seed_changes_assignments(self):
        frame=self.frame()
        result=self.api.assign_splits(frame,'inventory',42)
        self.assertEqual(result.value_counts().to_dict(),{'train':64,'test':16})
        self.assertFalse(result.equals(self.api.assign_splits(frame,'inventory',43)))

    def test_invalid_targets_conflicting_groups_and_small_classes_fail(self):
        for change in ['label','conflict','small','blank']:
            frame=self.frame()
            if change=='label':frame.loc[0,'label']=2
            if change=='conflict':frame.loc[0,'label']=1
            if change=='small':frame=frame.iloc[:10]
            if change=='blank':frame.loc[0,'group_id']=''
            with self.subTest(change=change),self.assertRaises(ValueError):
                self.api.assign_splits(frame,'delivery',42)

    def test_negative_inventory_is_preserved_and_not_relabelled(self):
        frame,report=self.api.prepare_inventory(self.inventory())
        self.assertEqual(frame.iloc[0]['INV'],-0.2)
        self.assertEqual(frame.iloc[0]['label'],0)
        self.assertEqual(report['negative_inventory_rows'],1)
        self.assertNotIn('SKU',frame.columns)
        self.assertNotIn('RSK1',frame.columns)
        self.assertNotIn('INQ',frame.columns)

    def test_bad_schema_duplicate_sku_nonfinite_and_bad_flags_fail(self):
        for change in ['extra','duplicate','nonfinite','flag']:
            frame=self.inventory()
            if change=='extra':frame['password']='private-marker'
            if change=='duplicate':frame.loc[0,'SKU']=frame.loc[1,'SKU']
            if change=='nonfinite':frame.loc[0,'INV']=float('inf')
            if change=='flag':frame.loc[0,'RSK1']=2
            with self.subTest(change=change),self.assertRaises(ValueError) as caught:
                self.api.prepare_inventory(frame)
            self.assertNotIn('private-marker',str(caught.exception))

    def test_delivery_allows_same_day_and_preserves_order_group(self):
        frame=self.frame().rename(columns={'label':'late_delivery_target'})
        frame['payment_type']='DEBIT';frame['scheduled_shipping_days']=0
        frame['shipping_mode']='Same Day';frame['item_quantity']=1;frame['category_id']=2
        prepared,report=self.api.prepare_delivery(frame)
        self.assertEqual(len(prepared),80)
        self.assertEqual(prepared.scheduled_shipping_days.min(),0)
        self.assertEqual(prepared.group_id.nunique(),40)
        frame['Delivery Status']='SECRET'
        with self.assertRaises(ValueError) as caught:self.api.prepare_delivery(frame)
        self.assertNotIn('SECRET',str(caught.exception))

    def test_hash_mismatch_and_overwrite_refused(self):
        source=self.root/'input.csv';self.inventory().to_csv(source,index=False)
        dest=self.root/'out'
        with self.assertRaises(ValueError):self.api.build_tabular(source,dest,'inventory','wrong')
        self.assertFalse(dest.exists())
        report=self.api.build_tabular(source,dest,'inventory',self.api.sha256(source))
        before=(dest/'splits.csv').read_bytes()
        with self.assertRaises(FileExistsError):self.api.build_tabular(source,dest,'inventory',self.api.sha256(source))
        self.assertEqual(before,(dest/'splits.csv').read_bytes())
        self.assertEqual(report['primary_iilas_task_evaluated'],False)
        self.assertEqual(report['model_trained'],False)
        self.assertEqual(self.api.sha256(dest/'splits.csv'),report['split_sha256'])
        self.assertEqual(report['features'],self.api.INVENTORY_FEATURES)

    def test_manifest_reconciles_every_source_row_without_feature_export(self):
        source=self.root/'input.csv';self.inventory().to_csv(source,index=False)
        dest=self.root/'out';self.api.build_tabular(source,dest,'inventory',self.api.sha256(source))
        result=pd.read_csv(dest/'splits.csv')
        self.assertEqual(sorted(result.source_row),list(range(2,42)))
        self.assertNotIn('INV',result.columns)
        self.assertEqual(result.negative_inventory.sum(),1)
        report=json.loads((dest/'manifest.json').read_text())
        self.assertEqual(sum(s['rows'] for s in report['splits'].values()),40)


if __name__=='__main__':unittest.main()
