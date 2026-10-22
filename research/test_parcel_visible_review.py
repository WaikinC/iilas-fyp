"""Prediction-blind review overlay fixtures; downloaded assets are not used."""
import copy
import importlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import test_parcel_visible_manifest as fixture_module
from test_parcel_visible_manifest import png, sha, write_json

try:
    review_module = importlib.import_module('parcel_visible_review')
except ModuleNotFoundError:
    review_module = None


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture_module.ManifestTests('test_exact_mapping_and_test_is_never_decoded_or_extracted')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.members.update({
            'train/undamagedpackages/spare-normal.rf.a.png': png(11),
            'train/damagedpackages/spare-damage.rf.a.png': png(12),
            'valid/undamagedpackages/spare-valid-normal.rf.a.png': png(13),
            'valid/damagedpackages/spare-valid-damage.rf.a.png': png(14),
        })

    def build(self):
        self.candidate = self.fixture.build()
        self.candidate_path = self.fixture.manifest_path
        self.candidate_bytes = self.candidate_path.read_bytes()
        self.assertIsNotNone(review_module, 'Review overlay is not implemented')
        for item in [patch.object(review_module,'ROOT',self.fixture.root),
                     patch.object(review_module.base.runtime,'_validate_output_path',side_effect=lambda path,**kwargs:Path(path))]:
            item.start(); self.addCleanup(item.stop)
        evidence = self.fixture.directory/'review-evidence'
        evidence.mkdir()
        bindings = {}
        for name in ('policy','rendered','observations','lock','metadata_review','sample_key'):
            path = evidence/(name+'.md' if name=='metadata_review' else name+'.json')
            if name=='sample_key':
                write_json(path,dict(samples=[dict(case_id=f'Q{index:02}',**row)
                                             for index,row in enumerate(self.candidate['rows'],1)],support={}))
            else:
                path.write_text('fixture '+name)
            bindings[name] = dict(path=str(path),sha256=sha(path.read_bytes()))
        self.review_path = evidence/'review.json'
        self.review = dict(schema_version=1,policy='publisher_visible_condition_pilot_with_sampled_review',decision='accept',
            candidate_sha256=sha(self.candidate_bytes),source_sha256=self.candidate['source']['sha256'],
            independent_reviewer='independent-fixture-reviewer',bindings=bindings,
            sampled_reviews=[dict(case_id=f'Q{index:02}',sample_id=row['sample_id'],sha256=row['sha256'],quality='suitable',
                                 observed_condition='Uncertain',notes='prediction-blind fixture')
                             for index,row in enumerate(self.candidate['rows'],1)],
            rights_holds=[],dependency_links=[])
        self.output = self.fixture.directory/'reviewed-manifest.json'

    def row(self,family):
        return next(row for row in self.candidate['rows'] if row['source_family']==family)

    def sync_evidence(self):
        cases={row['sample_id']:row['case_id'] for row in self.review['sampled_reviews']}
        rights={row['sample_id'] for row in self.review['rights_holds']}
        observations=[]
        for row in self.review['sampled_reviews']:
            record=dict(case_id=row['case_id'],quality=row['quality'],observed_condition=row['observed_condition'],note=row['notes'])
            if row['sample_id'] in rights:record['rights_flag']='rights_uncleared_stock'
            observations.append(record)
        path=Path(self.review['bindings']['observations']['path'])
        write_json(path,dict(schema_version=1,publisher_key_opened=False,model_predictions_seen=False,
            observations=observations,candidate_related_views=[dict(cases=[cases[row['left_sample_id']],cases[row['right_sample_id']]],
                basis=row['basis'],strength='conservative_review_dependency_not_physical_identity')
                for row in self.review['dependency_links'] if row['left_sample_id'] in cases and row['right_sample_id'] in cases]))
        self.review['bindings']['observations']['sha256']=sha(path.read_bytes())
        path=Path(self.review['bindings']['lock']['path'])
        write_json(path,dict(model_predictions_seen=False,observations_sha256=self.review['bindings']['observations']['sha256'],
                            publisher_key_read_after_this_lock=True))
        self.review['bindings']['lock']['sha256']=sha(path.read_bytes())

    def admit(self,sync=True):
        if sync:self.sync_evidence()
        write_json(self.review_path,self.review)
        path = review_module.admit_manifest(self.candidate_path,self.review_path,self.output)
        self.assertEqual(path,self.output)
        self.assertEqual(self.candidate_bytes,self.candidate_path.read_bytes())
        return review_module.load_manifest(path)

    def link(self,left,right):
        return dict(left_sample_id=left['sample_id'],right_sample_id=right['sample_id'],left_sha256=left['sha256'],
            right_sha256=right['sha256'],basis='same photographed object at different scale',strength='conservative_review_dependency')

    def test_rights_hold_excludes_suitable_image_without_quality_lie(self):
        self.build(); target = self.row('a')
        self.review['rights_holds']=[dict(sample_id=target['sample_id'],sha256=target['sha256'],reason='Visible stock watermark')]
        data = self.admit()
        held = next(row for row in data['dispositions'] if row['sample_id']==target['sample_id'])
        self.assertEqual(held['quality'],'suitable')
        self.assertEqual(held['review_rights_observation'],'Visible stock watermark')
        self.assertNotIn(target['sample_id'],{row['sample_id'] for row in data['rows']})
        self.assertTrue(data['training_admission'])
        self.assertEqual(data['admission_kind'],'visible_review_overlay_v1')
        self.assertEqual(len(data['dispositions']),9)

    def test_label_disagreement_is_not_automatic_hold_or_relabel(self):
        self.build()
        for sample in self.review['sampled_reviews']:
            sample['observed_condition']='Damaged' if next(row for row in self.candidate['rows'] if row['sample_id']==sample['sample_id'])['label']=='Normal' else 'Normal'
        data = self.admit()
        self.assertEqual([(row['sample_id'],row['label']) for row in data['rows']],
                         [(row['sample_id'],row['label']) for row in self.candidate['rows']])

    def test_manual_cross_split_dependency_holds_both_without_move(self):
        self.build(); left,right=self.row('a'),self.row('c')
        self.review['dependency_links']=[self.link(left,right)]
        data = self.admit()
        for target in (left,right):
            held = next(row for row in data['dispositions'] if row['sample_id']==target['sample_id'])
            self.assertIn('review_cross_partition_component',held['reasons'])
            self.assertEqual(held['split'],target['split'])
            self.assertNotIn(target['sample_id'],{row['sample_id'] for row in data['rows']})

    def test_quality_and_rights_propagate_to_related_assets_with_no_backfill(self):
        self.fixture.members['train/undamagedpackages/a.rf.other.png']=png(21)
        self.fixture.members['train/undamagedpackages/third-normal.rf.x.png']=png(22)
        self.build(); target=self.row('a'); other=self.row('spare-normal')
        self.review['dependency_links']=[self.link(target,other)]
        for sample in self.review['sampled_reviews']:
            if sample['sample_id']==target['sample_id']:sample['quality']='ambiguous'
        data=self.admit()
        self.assertEqual(len(self.candidate['rows'])-len(data['rows']),2)
        self.assertNotIn(target['sample_id'],{row['sample_id'] for row in data['rows']})
        self.assertNotIn(other['sample_id'],{row['sample_id'] for row in data['rows']})
        self.assertTrue({row['sample_id'] for row in data['rows']} <= {row['sample_id'] for row in self.candidate['rows']})
        self.assertEqual(data['summary']['replacement_images'],0)

    def test_rights_hold_propagates_through_review_link_without_quality_changes(self):
        self.build();left,right=self.row('a'),self.row('b')
        self.review['dependency_links']=[self.link(left,right)]
        self.review['rights_holds']=[dict(sample_id=left['sample_id'],sha256=left['sha256'],reason='Visible watermark')]
        data=self.admit()
        related=[row for row in data['dispositions'] if row['sample_id'] in (left['sample_id'],right['sample_id'])]
        self.assertTrue(all(row['quality']=='suitable' for row in related))
        self.assertTrue(all('review_rights_candidate_family' in row['reasons'] for row in related))
        self.assertNotIn('review_rights_observation',next(row for row in related if row['sample_id']==right['sample_id']))

    def test_review_key_case_or_membership_mismatch_rejected(self):
        self.build()
        self.review['sampled_reviews'][0]['case_id']='wrong-case'
        with self.assertRaisesRegex(ValueError,'key|case|sample'):
            self.admit()

    def test_both_classes_required_after_explicit_holds(self):
        self.build()
        self.review['rights_holds']=[dict(sample_id=row['sample_id'],sha256=row['sha256'],reason='fixture watermark')
                                     for row in self.candidate['rows'] if row['split']=='validation' and row['label']=='Damaged']
        with self.assertRaisesRegex(ValueError,'Both classes'):
            self.admit()
        self.assertFalse(self.output.exists())

    def test_locked_rights_flag_cannot_be_omitted_from_review_holds(self):
        self.build();target=self.row('a')
        self.review['rights_holds']=[dict(sample_id=target['sample_id'],sha256=target['sha256'],reason='Visible watermark')]
        self.sync_evidence();self.review['rights_holds']=[]
        with self.assertRaisesRegex(ValueError,'rights|locked'):
            self.admit(sync=False)

    def test_locked_related_pair_cannot_be_omitted(self):
        self.build();self.review['dependency_links']=[self.link(self.row('a'),self.row('c'))]
        self.sync_evidence();self.review['dependency_links']=[]
        with self.assertRaisesRegex(ValueError,'dependency|related|locked'):
            self.admit(sync=False)

    def test_locked_quality_or_note_cannot_be_rewritten_in_overlay(self):
        self.build();self.sync_evidence();self.review['sampled_reviews'][0]['notes']='rewritten after lock'
        with self.assertRaisesRegex(ValueError,'observation|locked'):
            self.admit(sync=False)

    def test_manual_dependency_to_test_holds_candidate_without_test_decode(self):
        self.build();target=self.row('a')
        reserved=next(row for row in self.candidate['dispositions'] if row['split']=='test')
        self.review['dependency_links']=[self.link(target,reserved)]
        data=self.admit()
        held=next(row for row in data['dispositions'] if row['sample_id']==target['sample_id'])
        test=next(row for row in data['dispositions'] if row['split']=='test')
        self.assertIn('review_published_test_component',held['reasons'])
        self.assertEqual(test['disposition'],'test_reserved')
        self.assertIsNone(test['pixel_sha256'])
        self.assertNotIn('path',test)

    def test_newly_merged_component_retains_at_most_four_original_views(self):
        self.fixture.members['train/undamagedpackages/extra-one.rf.x.png']=png(31)
        self.fixture.members['train/undamagedpackages/extra-two.rf.x.png']=png(32)
        self.build()
        linked=[self.row(name) for name in ('a','b','spare-normal','spare-damage','extra-one')]
        self.review['dependency_links']=[self.link(linked[index],linked[index+1]) for index in range(4)]
        data=self.admit();linked_ids={row['sample_id'] for row in linked}
        self.assertEqual(sum(row['sample_id'] in linked_ids for row in data['rows']),4)
        self.assertEqual(len(self.candidate['rows'])-len(data['rows']),1)
        self.assertTrue(any('review_component_view_cap' in row['reasons'] for row in data['dispositions']))

    def test_review_file_drift_after_admission_rejected(self):
        self.build();self.admit();self.review_path.write_text('{}')
        with self.assertRaisesRegex(ValueError,'binding|changed'):
            review_module.load_manifest(self.output)

    def test_underlying_source_drift_after_admission_rejected(self):
        self.build();self.admit();self.fixture.source.write_bytes(b'changed artificial ZIP')
        with self.assertRaisesRegex(ValueError,'archive|source'):
            review_module.load_manifest(self.output)

    def test_resealed_membership_edit_rejected_by_reconstruction(self):
        self.build();self.admit()
        doc=json.loads(self.output.read_text());doc['payload']['rows'].pop()
        doc['sha256']=review_module.base._digest(doc['payload']);write_json(self.output,doc)
        with self.assertRaisesRegex(ValueError,'reconstruction'):
            review_module.load_manifest(self.output)

    def test_unknown_id_and_wrong_sha_rejected(self):
        self.build()
        for field,value in [('sample_id','unknown'),('sha256','0'*64)]:
            saved=self.review['sampled_reviews'][0][field]
            self.review['sampled_reviews'][0][field]=value
            with self.assertRaisesRegex(ValueError,'review|sample|hash'):
                self.admit()
            self.review['sampled_reviews'][0][field]=saved

    def test_duplicate_or_reversed_dependency_links_rejected(self):
        self.build();left,right=self.row('a'),self.row('spare-normal')
        self.review['dependency_links']=[self.link(left,right),self.link(right,left)]
        with self.assertRaisesRegex(ValueError,'Duplicate|repeated'):
            self.admit()

    def test_unsafe_output_rejected_and_existing_output_never_overwritten(self):
        self.build();self.output=self.fixture.root/'outside.json'
        with self.assertRaisesRegex(ValueError,'output|datasets'):
            self.admit()
        self.output=self.fixture.directory/'reviewed-manifest.json'
        self.admit()
        with self.assertRaises(FileExistsError):
            self.admit()

    def test_review_and_evidence_binding_drift_rejected(self):
        self.build();self.admit()
        evidence=Path(self.review['bindings']['metadata_review']['path'])
        evidence.write_text('changed')
        with self.assertRaisesRegex(ValueError,'binding|changed'):
            review_module.load_manifest(self.output)

    def test_seal_drift_and_unknown_admission_kind_rejected(self):
        self.build();self.admit()
        doc=json.loads(self.output.read_text());doc['payload']['rows'][0]['label']='invalid'
        write_json(self.output,doc)
        with self.assertRaisesRegex(ValueError,'seal'):
            review_module.load_manifest(self.output)


if __name__=='__main__':
    unittest.main()
