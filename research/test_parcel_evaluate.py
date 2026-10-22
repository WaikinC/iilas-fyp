import unittest
import copy
import json
from unittest.mock import patch
from pathlib import Path
import parcel_evaluate as e


class EvaluationTests(unittest.TestCase):
    def rows(self):
        return [dict(sample_id=str(i), label=label, _group_id=str(i), image_sha256=str(i), target_status='single_principal')
                for i, label in enumerate(e.CLASSES)]

    def test_abstention_is_miss_and_undefined_precision_null(self):
        result = e.metrics(self.rows(), ['Normal', None])
        self.assertEqual(result['accuracy']['value'], .5)
        self.assertIsNone(result['classes']['Damaged']['precision']['value'])
        self.assertEqual(result['classes']['Damaged']['recall']['value'], 0)
        self.assertEqual(result['conditional']['accuracy']['value'], 1)

    def test_invalid_scores(self):
        for p in ([1], [float('nan'), 0], [-1, 2], [.2, .2]):
            with self.assertRaises(ValueError): e.decide(p)
        self.assertIsNone(e.decide([.5, .5]))

    def test_missing_class(self):
        with self.assertRaises(ValueError): e.validate_rows(self.rows()[:1])

    def test_incomplete_foreign_and_changed_predictions(self):
        rows = self.rows()
        raw = [dict(sample_id=r['sample_id'], image_sha256=r['image_sha256'], probabilities=[.7, .3]) for r in rows]
        self.assertEqual(len(e.validate_raw(rows, raw)), 2)
        for bad in (raw[:1], raw + raw[:1], [dict(raw[0], image_sha256='changed'), raw[1]]):
            with self.assertRaises(ValueError): e.validate_raw(rows, bad)

    def test_baseline_absent_and_association_required(self):
        self.assertEqual(e.baseline(None, self.rows())['status'], 'Not run')
        with self.assertRaises(ValueError): e.validate_rows([dict(r, target_status='multiple') for r in self.rows()])

    def test_bootstrap_insufficient(self):
        self.assertEqual(e.bootstrap(self.rows(), ['Normal', None], ['Normal', 'Damaged'])['status'], 'insufficient support')

    def test_equal_parcel_weights(self):
        rows = self.rows()
        rows.append(dict(rows[0], sample_id='view2'))
        self.assertAlmostEqual(e.metrics(rows, ['Normal', None, 'Normal'], True)['accuracy']['value'], .5)
        self.assertAlmostEqual(e.metrics(rows, ['Normal', None, 'Normal'])['accuracy']['value'], 2/3)

    def test_phase_failure_never_scores_or_retries(self):
        for reason in ('timeout', 'RSS limit', 'available memory floor', 'output cap'):
            with self.subTest(reason=reason), patch.object(e.runtime, 'require_supervised_worker'), patch.object(e, 'context', return_value=({}, {'selected':[{'architecture':'mobilenetv2'}, {'architecture':'efficientnetb0'}]}, [])), patch.object(e.runtime, 'ResourceSupervisor') as supervisor:
                supervisor.return_value.run.return_value = dict(status='failed', reason=reason)
                with self.assertRaises(ValueError): e._phase(Path('unused'))
                self.assertEqual(supervisor.return_value.run.call_count, 1)

    def test_test_claim_is_development_key_and_failure_durable(self):
        selection = dict(development_key='a'*64)
        with patch.object(e, 'verify_selection', return_value=selection), patch.object(e.train, 'load_frozen', return_value={'rows':[dict(r, split='test') for r in self.rows()]}), patch.object(e.runtime, 'create_run_directory', return_value=Path('unused')), patch.object(e.runtime, 'ResourceSupervisor') as supervisor, patch.object(e.runtime, 'sha256_file', return_value='hash'), patch.object(e.train, 'claim_phase', return_value=Path('claim')) as claim, patch.object(e.train, 'write_sealed'), patch.object(e.train, 'finish_claim') as finish:
            supervisor.return_value.run.return_value = dict(status='failed', reason='timeout')
            with self.assertRaises(ValueError): e.test(Path('selection'), Path('manifest'), Path('output'))
            self.assertEqual(claim.call_args.args[:2], ('a'*64, 'test'))
            self.assertEqual(finish.call_args.args[1], 'failed')

    def test_copying_output_cannot_change_test_claim_identity(self):
        import tempfile
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent/'datasets') as tmp, patch.object(e.runtime, '_validate_output_path', side_effect=lambda p: Path(p)):
            key = 'c'*64
            e.train.claim_phase(key, 'test', {'output':'first'}, registry=Path(tmp))
            with self.assertRaises(ValueError):
                e.train.claim_phase(key, 'test', {'output':'copied-output'}, registry=Path(tmp))

    def baseline_fixture(self):
        rows = [dict(r, source_id='independent') for r in self.rows()]
        association = dict(recorded_before_outputs=True, recorded_at_utc='2026-01-01T00:00:00+00:00', targets=[dict(sample_id=r['sample_id'], image_sha256=r['image_sha256'], target_status='single_principal', source_id=r['source_id']) for r in rows])
        export = dict(status='complete', checkpoint_sha256=e.CHECKPOINT, settings=dict(e.BASE_SETTINGS), class_order=list(e.CLASSES), authorization_evidence='review', supervisor_evidence='job', training_source_review_evidence='review', known_training_source_exclusion=True, known_training_sources=list(e.KNOWN_BASELINE_SOURCES), inference_started_at_utc='2026-01-02T00:00:00+00:00', pre_output_associations={'path':'association','sha256':'hash'}, predictions=[dict(sample_id=r['sample_id'], image_sha256=r['image_sha256'], detections=[], summary='No detection') for r in rows])
        return rows, export, association

    def test_baseline_raw_detection_mapping_and_abstentions(self):
        damaged = dict(class_id=0, class_name='Damaged', confidence=.9, bbox=[0, 0, 10, 10])
        normal = dict(damaged, class_id=1, class_name='Normal')
        self.assertEqual(e.detection_summary([damaged]), 'Damaged')
        self.assertEqual(e.detection_summary([normal]), 'Normal')
        self.assertEqual(e.detection_summary([normal, damaged]), 'Mixed')
        self.assertEqual(e.detection_summary([]), 'No detection')
        for invalid in (dict(damaged, class_name='Normal'), dict(damaged, bbox=[1, 0, 0, 2]), dict(damaged, confidence=float('nan'))):
            with self.assertRaises(ValueError): e.detection_summary([invalid])

    def test_baseline_rejects_compromised_summary_settings_and_exclusions(self):
        rows, good, association = self.baseline_fixture()
        variants = []
        bad = copy.deepcopy(good); bad['predictions'][0]['summary']='Normal'; variants.append(bad)
        bad = copy.deepcopy(good); bad['known_training_sources']=['caller-approved']; variants.append(bad)
        for key in e.BASE_SETTINGS:
            bad = copy.deepcopy(good); bad['settings'][key]='changed'; variants.append(bad)
        for export in variants:
            with patch.object(e.train, 'read_sealed', side_effect=[export, association]), patch.object(e.runtime, 'sha256_file', return_value='hash'):
                with self.assertRaises(ValueError): e.baseline('export', rows)
        with patch.object(e.train, 'read_sealed', side_effect=[good, association]), patch.object(e.runtime, 'sha256_file', return_value='hash'):
            self.assertEqual(e.baseline('export', rows)['image_weighted']['coverage']['value'], 0)
        for source in ('https://universe.roboflow.com/nani-tmzf6/package-detection-5ozpr/2', 'package_detection_e1ssd-copy'):
            self.assertTrue(e.known_baseline_source(source))

    def test_selection_tampering_precedes_claim_and_pixels(self):
        import tempfile
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent/'datasets') as tmp:
            root = Path(tmp)
            manifest, protocol, artifact = [root/name for name in ('manifest', 'protocol', 'artifact')]
            for path in (manifest, protocol, artifact): path.write_text('original')
            binding = dict(manifest={'path':str(manifest),'sha256':e.runtime.sha256_file(manifest)}, protocol={'path':str(protocol),'sha256':e.runtime.sha256_file(protocol)}, settings={}, code={}, environment={})
            fits = [dict(status='success', fit_id=a+'-'+c, architecture=a, contrast=c, macro_f1=.5, validation_loss=.5, artifact=str(artifact), artifact_sha256=e.runtime.sha256_file(artifact)) for a in e.train.ARCHITECTURES for c in e.train.CONTRASTS]
            selection = dict(status='complete', development_key='d'*64, binding=binding, all_fits=fits, selected=[fits[0], fits[2]], class_order=list(e.CLASSES), decision='argmax-exact-tie-abstains')
            for kind in ('manifest', 'protocol', 'artifact', 'unselected'):
                candidate = copy.deepcopy(selection)
                if kind == 'unselected': candidate['selected'][0] = candidate['all_fits'][1]
                else: (root/kind).write_text('changed')
                with patch.object(e.train, 'read_sealed', return_value=candidate), patch.object(e.train, 'code_bindings', return_value={}), patch.object(e.train, 'environment', return_value={}), patch.object(e.train, 'load_protocol', return_value={}), patch.object(e.train, 'claim_phase') as claim, patch.object(e.train, 'read_image') as pixels:
                    with self.assertRaises(ValueError): e.test(root/'selection', manifest, root/'output')
                    claim.assert_not_called(); pixels.assert_not_called()
                if kind != 'unselected': (root/kind).write_text('original')


if __name__ == '__main__': unittest.main()
