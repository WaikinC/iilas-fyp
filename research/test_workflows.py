"""Synthetic fixtures test software only; their metrics are not FYP evaluation evidence."""
import json
import csv
import cv2
import tempfile
import unittest
from pathlib import Path
import numpy as np
import pandas as pd
from models import SCHEMAS, train_tabular, predict_tabular
from vision import inspect_dataset, build_model

class ResearchWorkflowTests(unittest.TestCase):
    def test_no_models_fail_explicitly(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError): predict_tabular('inventory',{},folder)
            with self.assertRaises(ValueError): inspect_dataset(folder)

    def test_grouped_training_and_inference(self):
        with tempfile.TemporaryDirectory() as folder:
            for kind,schema in SCHEMAS.items():
                rng=np.random.default_rng(42);rows=[]
                for index,label in enumerate(schema['labels']):
                    for group in range(12):
                        for observation in range(2):
                            rows.append({**{feature:float(rng.uniform(0,10)+index*10+observation) for feature in schema['features']},'label':label,'group_id':f'{index}-{group}'})
                frame=pd.DataFrame(rows);path=Path(folder)/f'{kind}.csv';frame.to_csv(path,index=False)
                report=train_tabular(path,kind,folder,'SYNTHETIC SOFTWARE TEST ONLY')
                self.assertFalse(set(report['train_groups'])&set(report['test_groups']))
                self.assertIn('DecisionTree',report['evaluation']);self.assertEqual(report['model'],'RandomForest')
                result=predict_tabular(kind,frame.iloc[0].to_dict(),folder)
                self.assertIn(result['label'],schema['labels']);self.assertTrue(result['humanReviewRequired'])
                self.assertAlmostEqual(sum(result['probabilities'].values()),1)
                frame.loc[0,'label']='Unknown';frame.to_csv(path,index=False)
                with self.assertRaises(ValueError):train_tabular(path,kind,folder,'Synthetic test')

    def test_vision_architecture_and_normalization(self):
        # Random weights verify graph execution only; no trained parcel classifier is claimed.
        model=build_model('MobileNetV2',weights=None)
        result=model(np.zeros((1,224,224,3),dtype=np.float32),training=False).numpy()
        self.assertEqual(result.shape,(1,2));self.assertAlmostEqual(float(result.sum()),1,places=5)

    def test_parcel_split_leakage(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);rows=[];rng=np.random.default_rng(42)
            for split in ['train','validation','test']:
                for label in ['Normal','Damaged']:
                    directory=root/split/label;directory.mkdir(parents=True)
                    for n in range(5):
                        path=directory/f'{n}.png';cv2.imwrite(str(path),rng.integers(0,256,(64,64,3),dtype=np.uint8))
                        rows.append({'path':path.relative_to(root).as_posix(),'parcel_id':f'{split}-{label}-{n}','label':label})
            def manifest():
                with (root/'manifest.csv').open('w',newline='',encoding='utf-8') as handle:
                    writer=csv.DictWriter(handle,fieldnames=['path','parcel_id','label']);writer.writeheader();writer.writerows(rows)
            manifest();self.assertEqual(inspect_dataset(root)['test']['Normal'],5)
            rows[-1]['parcel_id']=rows[0]['parcel_id'];manifest()
            with self.assertRaisesRegex(ValueError,'multiple splits'):inspect_dataset(root)

if __name__=='__main__':unittest.main()
