"""Temporary, synthetic fixtures check intake software, never model accuracy."""
import csv
import importlib.util
import json
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('data_intake'), 'Dataset intake implementation is missing')
        import data_intake
        self.api = data_intake
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'intake'
        self.api.initialize(self.root)

    def write(self, kind, rows):
        with (self.root / kind / 'observations.csv').open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=self.api.columns(kind))
            writer.writeheader(); writer.writerows(rows)

    def configure(self, kind):
        path = self.root / kind / 'dataset.json'
        metadata = json.loads(path.read_text())
        metadata.update(protocol_status='reviewed', sources=[{
            'source_id': 'fixture', 'reference': 'temporary synthetic software fixture',
            'license_or_permission': 'test author', 'permitted_use': 'software testing only',
        }])
        path.write_text(json.dumps(metadata), encoding='utf-8')

    def row(self, kind='inventory', **changes):
        row = {key: '' for key in self.api.columns(kind)}
        row.update(sample_id='private-sample', group_id='private-group', source_id='fixture',
                   origin='simulated', observed_at='2026-10-17T12:00:00+08:00',
                   feature_cutoff_at='2026-10-17T12:00:00+08:00', label_status='reviewed',
                   labeler_id='reviewer', evidence_ref='private-evidence', rubric_version='1.0')
        if kind == 'inventory':
            row.update(available_quantity=10, reserved_quantity=2, movement_frequency=4,
                       reorder_distance=-2, adjustment_count=0, days_since_replenishment=3,
                       label='Normal')
        elif kind == 'delivery':
            row.update(expected_duration_hours=24, elapsed_hours=12, failed_attempts=0,
                       has_proof=0, status_event_count=2, parcel_count=1, label='Low',
                       dispatch_at='2026-10-17T00:00:00+08:00', deadline_at='2026-10-18T00:00:00+08:00',
                       outcome_checked_at='2026-10-19T00:00:00+08:00')
        else:
            row.update(image_path='images/parcel.png', label='Normal')
        row.update(changes)
        return row

    def audit_row(self, kind='inventory', **changes):
        self.configure(kind); self.write(kind, [self.row(kind, **changes)])
        return self.api.audit(self.root, kind)

    def codes(self, report):
        return {issue['code'] for issue in report['issues']}

    def test_templates_are_empty_and_existing_folder_is_preserved(self):
        before=(self.root/'inventory'/'observations.csv').read_bytes()
        with self.assertRaises(FileExistsError): self.api.initialize(self.root)
        self.assertEqual(before,(self.root/'inventory'/'observations.csv').read_bytes())
        for kind in ['inventory','delivery','parcel']:
            report=self.api.audit(self.root,kind)
            self.assertEqual(report['rows'],0)
            self.assertFalse(report['ready_for_split'])

    def test_cli_limits_collections_to_the_git_ignored_dataset_area(self):
        outside=Path(self.temp.name)/'outside'
        # TEMP may itself be inside datasets in a restricted workspace. Exercise
        # the boundary against an explicit sibling allowed root instead.
        with patch.object(self.api,'DATA_ROOT',self.root), patch('sys.argv',['data_intake.py','init','--root',str(outside)]), patch('sys.stdout',new_callable=io.StringIO):
            result=self.api.main()
        self.assertEqual(result,1)
        self.assertFalse(outside.exists())

    def test_signed_reorder_distance_is_valid_but_negative_quantity_is_not(self):
        self.assertNotIn('invalid_feature',self.codes(self.audit_row()))
        self.assertIn('invalid_feature',self.codes(self.audit_row(available_quantity=-1)))

    def test_invalid_counts_and_nonfinite_values_are_rejected(self):
        for field,value in [('movement_frequency',1.5),('reserved_quantity','NaN'),('days_since_replenishment','inf')]:
            with self.subTest(field=field):
                self.assertIn('invalid_feature',self.codes(self.audit_row(**{field:value})))

    def test_pending_label_is_counted_without_becoming_eligible(self):
        report=self.audit_row(label='',label_status='pending',labeler_id='',evidence_ref='')
        self.assertEqual(report['unresolved_rows'],1)
        self.assertEqual(report['reviewed_rows'],0)
        self.assertFalse(report['ready_for_split'])

    def test_reviewed_label_needs_valid_label_source_and_evidence(self):
        for changes,code in [({'label':'Unclear'},'invalid_label'),({'source_id':'unknown'},'unknown_source'),
                             ({'evidence_ref':''},'missing_review_evidence')]:
            with self.subTest(code=code):self.assertIn(code,self.codes(self.audit_row(**changes)))

    def test_future_features_and_timezone_free_timestamps_are_rejected(self):
        self.assertIn('future_features',self.codes(self.audit_row(feature_cutoff_at='2026-10-18T00:00:00Z')))
        self.assertIn('invalid_timestamp',self.codes(self.audit_row(observed_at='2026-10-17T12:00:00')))

    def test_duplicate_sample_and_group_split_leakage_are_detected(self):
        self.configure('inventory')
        self.write('inventory',[self.row(split='train'),self.row(split='test')])
        codes=self.codes(self.api.audit(self.root,'inventory'))
        self.assertIn('duplicate_sample',codes);self.assertIn('group_split_leakage',codes)

    def test_duplicate_observation_with_different_sample_id_is_detected(self):
        self.configure('inventory')
        self.write('inventory',[self.row(),self.row(sample_id='copy')])
        self.assertIn('duplicate_observation',self.codes(self.api.audit(self.root,'inventory')))

    def test_only_one_primary_snapshot_per_delivery_is_allowed(self):
        self.configure('delivery')
        self.write('delivery',[self.row('delivery'),self.row('delivery',sample_id='later',
            observed_at='2026-10-17T13:00:00+08:00',elapsed_hours=13)])
        self.assertIn('multiple_delivery_snapshots',self.codes(self.api.audit(self.root,'delivery')))

    def test_unsupported_rubric_cannot_silently_use_old_delivery_rules(self):
        self.configure('delivery')
        path=self.root/'delivery'/'dataset.json';metadata=json.loads(path.read_text())
        metadata['rubric_version']='2.0';path.write_text(json.dumps(metadata))
        self.write('delivery',[self.row('delivery',rubric_version='2.0')])
        self.assertIn('unsupported_rubric',self.codes(self.api.audit(self.root,'delivery')))

    def test_audit_never_echoes_private_values(self):
        report=self.audit_row(label='SECRET-MARKER-DO-NOT-ECHO')
        encoded=json.dumps(report)
        for value in ['SECRET-MARKER','private-sample','private-group','private-evidence']:
            self.assertNotIn(value,encoded)

    def test_header_mismatch_is_reported_without_crashing(self):
        (self.root/'inventory'/'observations.csv').write_text('unexpected\nprivate\n')
        self.assertIn('invalid_columns',self.codes(self.api.audit(self.root,'inventory')))

    def test_delivery_timing_and_proof_validation(self):
        valid=self.audit_row('delivery')
        self.assertNotIn('invalid_observation_window',self.codes(valid))
        for changes,code in [({'has_proof':2},'invalid_feature'),
                             ({'elapsed_hours':11},'duration_mismatch'),
                             ({'observed_at':'2026-10-17T23:00:00+08:00'},'invalid_observation_window'),
                             ({'outcome_checked_at':'2026-10-18T00:00:00+08:00'},'incomplete_followup')]:
            with self.subTest(code=code):self.assertIn(code,self.codes(self.audit_row('delivery',**changes)))

    def test_parcel_path_cannot_escape_collection_folder(self):
        for path in ['../private-config/example.png','C:/secret.png','images/../../secret.png']:
            with self.subTest(path=path):
                self.assertIn('invalid_image_path',self.codes(self.audit_row('parcel',image_path=path)))

    def test_parcel_decode_and_duplicate_checks(self):
        import cv2
        import numpy as np
        image=np.random.default_rng(42).integers(0,256,(80,80,3),dtype=np.uint8)
        target=self.root/'parcel'/'images'/'parcel.png'; cv2.imwrite(str(target),image)
        self.assertNotIn('invalid_image',self.codes(self.audit_row('parcel')))
        self.write('parcel',[self.row('parcel'),self.row('parcel',sample_id='second',group_id='other')])
        self.assertIn('duplicate_image',self.codes(self.api.audit(self.root,'parcel')))
        target.write_bytes(b'not an image')
        self.assertIn('invalid_image',self.codes(self.api.audit(self.root,'parcel')))

    def test_eligible_groups_do_not_claim_training_or_real_evaluation(self):
        self.configure('inventory');rows=[]
        for label in ['Normal','Reorder Risk','Critical Stock Risk']:
            for n in range(5):rows.append(self.row(label=label,sample_id=f'{label}-{n}',group_id=f'{label}-{n}'))
        self.write('inventory',rows);report=self.api.audit(self.root,'inventory')
        self.assertTrue(report['ready_for_split'])
        self.assertEqual(report['origins'],{'simulated':15})
        self.assertFalse(report['model_evaluated'])
        self.assertIn('software_minimum_only',report['limitations'])

    def test_mixed_origins_and_missing_review_status_block_readiness(self):
        self.assertIn('protocol_not_reviewed',self.codes(self.api.audit(self.root,'inventory')))
        self.configure('inventory')
        self.write('inventory',[self.row(),self.row(sample_id='second',group_id='other',origin='real')])
        self.assertIn('mixed_origins',self.codes(self.api.audit(self.root,'inventory')))


if __name__ == '__main__': unittest.main()
