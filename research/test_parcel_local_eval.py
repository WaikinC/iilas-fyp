"""Local evaluation metadata/result tests: artificial bytes, never model pixels."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import parcel_runtime as parcel
try:
    import parcel_local_eval as local
except ModuleNotFoundError as error:
    if error.name != 'parcel_local_eval':
        raise
    local = None

ROOT = Path(__file__).resolve().parents[1]
BINDINGS = dict(modelVersion='2fffa7aa1a8c33c6698a97e38d028858b8433aec84dbd582c01094711a0ae4da',
                selectionSha256='41be154569ace87d85bae5dc12b77eb7d08ffcb52616bb2e075f00c1300e21eb',
                evaluationSha256='b4f6727ce08630f8289b572e6a9d4ab71d730aff102250aa4af505bc27252fcc')
REQUEST_ID = '00000000-0000-4000-8000-000000000001'


def result(request_id=REQUEST_ID, image='YQ==', tie=False):
    import base64
    return dict(requestId=request_id, status='abstained' if tie else 'predicted',
                label=None if tie else 'Normal', confidence=.5 if tie else .8,
                probabilities=[.5, .5] if tie else [.8, .2],
                confidenceMeaning='uncalibrated', model='MobileNetV2', **BINDINGS,
                preprocessing='rgb-letterbox224-v1', contrast='clahe',
                evidenceSha256=hashlib.sha256(base64.b64decode(image)).hexdigest(),
                processingTimeMs=15., totalProcessingTimeMs=20., humanReviewRequired=True,
                operationally_approved=False, classOrder=['Normal', 'Damaged'], acceptanceSha256=None)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(local, 'local evaluation manifest capability is missing')
        self.temp = tempfile.TemporaryDirectory(dir=ROOT/'outputs')
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)/'version-01'/'manifest.json'
        # Task2 source files intentionally do not yet exist. Do not invent them.
        self.code = {'research/parcel_local_eval.py': 'a'*64,
                     'research/serve_parcel_local_eval.py': 'b'*64,
                     'backend/functions/parcelLocalEvaluation.mjs': 'c'*64}
        self.code_patch = patch.object(local, '_source_code', return_value=self.code)
        self.code_patch.start()
        self.addCleanup(self.code_patch.stop)

    def make(self):
        return local.create_manifest(self.output)

    def rewrite(self, change):
        value = json.loads(self.output.read_text())
        change(value)
        self.output.write_text(json.dumps(value), encoding='utf-8')
        return hashlib.sha256(self.output.read_bytes()).hexdigest()

    def test_preparation_binds_original_bundle_and_exact_frozen_identity(self):
        manifest = self.make()
        self.assertEqual(manifest.sha256, hashlib.sha256(self.output.read_bytes()).hexdigest())
        self.assertEqual(manifest.bundle.bindings, BINDINGS)
        value = json.loads(self.output.read_text())
        self.assertEqual(value['kind'], 'parcel_local_evaluation_bundle_v1')
        self.assertEqual(value['warmBundle'], {
            'repo_path': 'research/datasets/parcel-warm-serving-20261022/bundle-03/bundle.json',
            'sha256': 'dab3da809ca11d287a68ab36f7e55680d15b4f50872819c6243c0858c1b2bd10'})
        self.assertEqual(value['artifact']['sha256'], BINDINGS['modelVersion'])
        self.assertEqual(value['livePolicy'], {'version': 'parcel-live-v1',
            'sha256': '50f4160d21f584110bbb7d68a6ff6552c2efe83bd14b119282d4b7a1e9217121'})
        self.assertIs(value['contract']['operationally_approved'], False)
        self.assertIsNone(value['contract']['acceptance_sha256'])
        before = self.output.read_bytes()
        with self.assertRaises((ValueError, OSError)):
            self.make()
        self.assertEqual(self.output.read_bytes(), before)

    def test_rehashed_manifest_cannot_change_lineage_policy_paths_or_fields(self):
        self.make()
        original = self.output.read_bytes()
        mutations = [lambda v: v.update(extra=True), lambda v: v.update(schema_version=True),
            lambda v: v['warmBundle'].update(sha256='0'*64),
            lambda v: v['warmBundle'].update(repo_path='research/../private.json'),
            lambda v: v['descriptor'].update(sha256='0'*64),
            lambda v: v['artifact'].update(sha256='0'*64),
            lambda v: v['bindings'].update(evaluationSha256='0'*64),
            lambda v: v['livePolicy'].update(sha256='0'*64),
            lambda v: v['contract'].update(operationally_approved=True),
            lambda v: v['contract'].update(operationally_approved=0),
            lambda v: v['contract'].update(human_review_required=1),
            lambda v: v['code'].update({'research/parcel_local_eval.py': '0'*64})]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                self.output.write_bytes(original)
                pin = self.rewrite(mutation)
                with self.assertRaises(ValueError):
                    local.load_manifest(self.output, pin)

    def test_hash_json_size_and_changed_source_fail_closed(self):
        manifest = self.make()
        with self.assertRaises(ValueError):
            local.load_manifest(self.output, '0'*64)
        with patch.object(local, '_source_code', return_value={**self.code, 'new.py': '0'*64}):
            with self.assertRaises(ValueError):
                local.load_manifest(self.output, manifest.sha256)
        for payload in (b'{"kind":1,"kind":2}', b'{"x":NaN}', b' '*65537, b'[]'):
            self.output.write_bytes(payload)
            with self.assertRaises(ValueError):
                local.load_manifest(self.output, hashlib.sha256(payload).hexdigest())

    def test_relative_traversal_and_non_output_manifest_paths_reject(self):
        for path in ('relative.json', ROOT/'research'/'manifest.json',
                     ROOT/'outputs'/'..'/'manifest.json'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                local.create_manifest(path)

    def test_source_map_hashes_actual_files_and_missing_sources_reject(self):
        self.code_patch.stop()
        source = Path(self.temp.name)/'source.py'
        source.write_bytes(b'artificial source\n')
        relative = source.relative_to(ROOT).as_posix()
        with patch.object(local, 'SOURCE_FILES', (relative,)):
            self.assertEqual(local._source_code(), {relative: hashlib.sha256(b'artificial source\n').hexdigest()})
            source.unlink()
            with self.assertRaises((ValueError, OSError)):
                local._source_code()


class ResultTests(ManifestTests):
    def test_predictions_and_ties_keep_false_null_and_server_manifest(self):
        manifest = self.make()
        for tie in (False, True):
            output = local.experimental_result(result(tie=tie), REQUEST_ID, 'YQ==', manifest)
            self.assertEqual(output['evaluationKind'], 'local-experimental')
            self.assertEqual(output['evaluationManifestSha256'], manifest.sha256)
            self.assertEqual(output['intendedUse'], 'registered-photo')
            self.assertIs(output['operationally_approved'], False)
            self.assertIsNone(output['acceptanceSha256'])
            self.assertIs(output['humanReviewRequired'], True)
            self.assertEqual(output['label'], None if tie else 'Normal')
            self.assertEqual(output['probabilities'], [.5, .5] if tie else [.8, .2])
            self.assertNotIn('totalProcessingTimeMs', output)

    def test_result_rejects_true_nonnull_forged_marker_lineage_scores_and_extra(self):
        manifest = self.make()
        for change in ({'operationally_approved': True}, {'acceptanceSha256': 'f'*64},
                       {'evaluationKind': 'local-experimental'}, {'private': 'secret'},
                       {'evaluationSha256': '0'*64}, {'modelVersion': '0'*64},
                       {'preprocessing': 'changed'}, {'probabilities': [.2, .8]},
                       {'requestId': '00000000-0000-4000-8000-000000000002'},
                       {'evidenceSha256': '0'*64}, {'totalProcessingTimeMs': float('nan')}):
            with self.subTest(change=change), self.assertRaises(parcel.ParcelUnavailable):
                local.experimental_result({**result(), **change}, REQUEST_ID, 'YQ==', manifest)

    def test_live_binding_is_exact_and_comes_from_validated_request(self):
        manifest = self.make()
        live = dict(sessionId=REQUEST_ID, frameId='00000000-0000-4000-8000-000000000002', sequence=12)
        output = local.experimental_result(result(), REQUEST_ID, 'YQ==', manifest, live=live)
        self.assertEqual({k: output[k] for k in live}, live)
        self.assertEqual(output['intendedUse'], 'sampled-live')
        self.assertEqual(output['policyVersion'], 'parcel-live-v1')
        self.assertEqual(output['policySha256'], '50f4160d21f584110bbb7d68a6ff6552c2efe83bd14b119282d4b7a1e9217121')
        for change in ({'sequence': True}, {'sequence': 13}, {'sessionId': 'bad'},
                       {'policySha256': '0'*64}):
            with self.subTest(change=change), self.assertRaises(parcel.ParcelUnavailable):
                local.experimental_result(result(), REQUEST_ID, 'YQ==', manifest, live={**live, **change})


if __name__ == '__main__':
    unittest.main()
