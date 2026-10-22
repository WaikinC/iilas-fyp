"""Artificial archives only: no downloaded dataset access or native jobs."""
import copy
import hashlib
import importlib
import json
from pathlib import Path
import random
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import zlib

try:
    visible = importlib.import_module('parcel_visible_manifest')
except ModuleNotFoundError:
    visible = None


def sha(data):
    return hashlib.sha256(data).hexdigest()


def png(seed, size=64, compression=6):
    rng = random.Random(seed)
    raw = b''.join(b'\0' + rng.randbytes(size * 3) for _ in range(size))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw,compression)) + chunk(b'IEND', b''))


def write_json(path, value):
    path.write_text(json.dumps(value), encoding='utf-8')


class ManifestTests(unittest.TestCase):
    def setUp(self):
        temp_parent = Path(__file__).resolve().parents[1]/'outputs'/'parcel-visible-implementation-20261021'/'manifest-fixtures'
        temp_parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=temp_parent)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.directory = self.root / 'research' / 'datasets'
        self.directory.mkdir(parents=True)
        self.source = self.root / 'fixture.zip'
        self.receipts = self.directory / 'metadata'
        self.receipts.mkdir()
        self.members = {
            'train/undamagedpackages/a.rf.1.png': png(1),
            'train/damagedpackages/b.rf.2.png': png(2),
            'valid/undamagedpackages/c.rf.3.png': png(3),
            'valid/damagedpackages/d.rf.4.png': png(4),
            'test/damagedpackages/reserved.rf.5.png': b'TEST pixels must never be decoded',
        }

    def fixture(self):
        with zipfile.ZipFile(self.source, 'w') as archive:
            for member, data in self.members.items():
                info = zipfile.ZipInfo()
                info.filename = member
                info.orig_filename = member
                archive.writestr(info, data)
        stat = self.source.stat()
        identity = dict(bytes=stat.st_size, device=stat.st_dev, inode=stat.st_ino, mtime_ns=stat.st_mtime_ns)
        inventory = []
        with zipfile.ZipFile(self.source) as archive:
            for info in archive.infolist():
                inventory.append(dict(path=info.filename, bytes=info.file_size,
                                      compressed_bytes=info.compress_size, crc32=f'{info.CRC:08x}',
                                      filename_family_hint=Path(info.filename).name.split('.rf.')[0]))
        report = dict(status='metadata_audit_only', training_admission=False, pixels_decoded=0,
                      source=str(self.source), source_identity=identity, source_sha256=sha(self.source.read_bytes()),
                      images=len(inventory), images_inventory=inventory)
        native = dict(status='success', returncode=0, reason=None, elapsed_seconds=1, peak_rss_bytes=1000000)
        write_json(self.receipts/'report.json', report)
        write_json(self.receipts/'metadata.result.json', native)
        write_json(self.receipts/'completion.json', dict(status='metadata_complete_not_image_or_training_admission',
            report_sha256=sha((self.receipts/'report.json').read_bytes()),
            native_sha256=sha((self.receipts/'metadata.result.json').read_bytes())))
        return self.receipts/'completion.json'

    def build(self):
        receipt = self.fixture()
        self.assertIsNotNone(visible, 'Manifest builder is not implemented')
        patches = [patch.object(visible, 'ROOT', self.root), patch.object(visible, 'EXPECTED_IMAGES', len(self.members)),
                   patch.object(visible, 'SOURCE_SHA256', sha(self.source.read_bytes())),
                   patch.object(visible.runtime, 'require_supervised_worker', return_value=None)]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.output = self.directory/('candidate-'+str(len(list(self.directory.glob('candidate-*')))))
        self.output.mkdir()
        self.manifest_path = visible._build_candidates(receipt, self.output)
        write_json(self.output/'intake.result.json', dict(status='success',returncode=0,reason=None,
                   elapsed_seconds=1,peak_rss_bytes=1000000))
        write_json(self.output/'request.json', dict(code_bindings=visible._code_bindings(),
                   limits=vars(visible.intake_limits()), source_receipt=visible._record(receipt)))
        write_json(self.output/'intake-completion.json', dict(status='candidate_pending_independent_review',
                   manifest=visible._record(self.manifest_path),native=visible._record(self.output/'intake.result.json'),
                   request=visible._record(self.output/'request.json')))
        return visible.load_manifest(self.manifest_path)

    def test_exact_mapping_and_test_is_never_decoded_or_extracted(self):
        result = self.build()
        self.assertEqual(result['class_order'], ['Normal', 'Damaged'])
        self.assertEqual({(row['publisher_class'], row['label']) for row in result['rows']},
                         {('undamagedpackages', 'Normal'), ('damagedpackages', 'Damaged')})
        self.assertEqual(len(result['dispositions']), 5)
        reserved = next(row for row in result['dispositions'] if row['split'] == 'test')
        self.assertIsNone(reserved['pixel_sha256'])
        self.assertNotIn('path', reserved)
        self.assertFalse(result['training_admission'])
        self.assertEqual(len(list((self.output/'images').iterdir())), 4)

    def test_unknown_class_rejected(self):
        self.members['train/damaged-packages/unknown.png'] = png(9)
        with self.assertRaisesRegex(ValueError, 'class|member'):
            self.build()

    def test_unsafe_member_paths_rejected_before_extraction(self):
        for name in ['../escape.png', '/absolute.png', 'train\\damagedpackages\\evil.png',
                     'C:/drive.png', 'train/damagedpackages/a:stream.png']:
            with self.subTest(name=name):
                self.members[name] = png(9)
                with self.assertRaisesRegex(ValueError, 'Unsafe|member'):
                    self.build()
                del self.members[name]

    def test_exact_duplicate_contradictory_publisher_labels_hold(self):
        self.members['train/undamagedpackages/duplicate.rf.8.png'] = self.members['train/damagedpackages/b.rf.2.png']
        result = self.build()
        conflicts = [row for row in result['dispositions'] if 'verified_label_conflict' in row['reasons']]
        self.assertEqual(len(conflicts), 2)
        self.assertFalse(any(row['label'] == 'Damaged' and row['split'] == 'train' for row in result['rows']))

    def test_cross_partition_filename_hint_quarantines_component_without_physical_claim(self):
        self.members['valid/undamagedpackages/a.rf.9.png'] = png(9)
        result = self.build()
        held = [row for row in result['dispositions'] if row['source_family'] == 'a']
        self.assertEqual(len(held), 2)
        self.assertTrue(all('cross_partition_component' in row['reasons'] for row in held))
        self.assertFalse(result['policy']['filename_family_is_physical_identity'])

    def test_verified_conflict_holds_conservative_family_without_claiming_exact(self):
        self.members['train/undamagedpackages/conflict.rf.x.png'] = self.members['train/damagedpackages/b.rf.2.png']
        self.members['train/undamagedpackages/conflict.rf.other.png'] = png(29)
        result = self.build()
        indirect = next(row for row in result['dispositions'] if row['member'].endswith('conflict.rf.other.png'))
        self.assertIn('conflict_candidate_family',indirect['reasons'])
        self.assertNotIn('verified_label_conflict',indirect['reasons'])
        self.assertNotIn(indirect['sample_id'],{row['sample_id'] for row in result['rows']})

    def test_exact_overlap_with_reserved_test_quarantines_without_decode(self):
        self.members['test/damagedpackages/reserved.rf.5.png'] = self.members['train/damagedpackages/b.rf.2.png']
        result = self.build()
        train = next(row for row in result['dispositions'] if row['member'].endswith('b.rf.2.png'))
        self.assertIn('published_test_component', train['reasons'])
        self.assertIsNone(next(row for row in result['dispositions'] if row['split']=='test')['pixel_sha256'])

    def test_stock_flag_and_verified_derivative_hold(self):
        self.members['train/undamagedpackages/iStock-asset.rf.x.png'] = self.members['train/undamagedpackages/a.rf.1.png']
        result = self.build()
        held = [row for row in result['dispositions'] if 'rights_uncleared_stock' in row['reasons']]
        self.assertEqual(len(held), 2)

    def test_missing_class_is_explicit_not_invented(self):
        del self.members['valid/damagedpackages/d.rf.4.png']
        result = self.build()
        self.assertIn('validation_missing_Damaged', result['summary']['admission_blockers'])
        self.assertFalse(result['training_admission'])

    def test_family_representative_is_one_even_when_exported_pixels_differ(self):
        self.members['train/undamagedpackages/a.rf.other.png'] = png(21)
        result = self.build()
        self.assertEqual(sum(row['source_family']=='a' for row in result['rows']), 1)
        self.assertEqual(sum('family_representative_cap' in row['reasons'] for row in result['dispositions']), 1)

    def test_technical_hold_propagates_to_filename_hint_without_calling_exact(self):
        self.members['train/undamagedpackages/a.rf.bad.png'] = png(4, 17)
        result = self.build()
        family = [row for row in result['dispositions'] if row['source_family']=='a']
        self.assertTrue(all(row['reasons'] for row in family))
        self.assertTrue(any('technical_candidate_family' in row['reasons'] for row in family))

    def test_load_rejects_image_byte_drift_without_decoding(self):
        result = self.build()
        (self.root/result['rows'][0]['path']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'image.*changed|hash'):
            visible.load_manifest(self.manifest_path)

    def test_source_drift_rejected(self):
        self.build()
        self.source.write_bytes(b'changed archive')
        with self.assertRaisesRegex(ValueError, 'source|archive'):
            visible.load_manifest(self.manifest_path)

    def test_metadata_binding_drift_rejected(self):
        self.build()
        (self.receipts/'report.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'binding|receipt|metadata'):
            visible.load_manifest(self.manifest_path)

    def test_manifest_seal_drift_rejected(self):
        self.build()
        envelope = json.loads(self.manifest_path.read_text())
        envelope['payload']['rows'][0]['label'] = 'Bogus'
        write_json(self.manifest_path, envelope)
        with self.assertRaisesRegex(ValueError, 'seal'):
            visible.load_manifest(self.manifest_path)

    def test_unsupervised_hidden_builder_refuses_before_archive_access(self):
        self.assertIsNotNone(visible, 'Manifest builder is not implemented')
        with patch.dict('os.environ', {}, clear=True), self.assertRaises(Exception):
            visible._build_candidates(Path('missing'), Path('missing'))

    def test_admission_binds_independent_review_and_never_relabels(self):
        candidate = self.build()
        review = self.output/'review.json'
        write_json(review, dict(schema_version=1, policy='publisher_visible_condition_pilot_with_sampled_review',
            candidate_sha256=sha(self.manifest_path.read_bytes()), source_sha256=candidate['source']['sha256'],
            independent_reviewer='fixture-reviewer', decision='accept',
            sampled_reviews=[dict(sample_id=row['sample_id'], sha256=row['sha256'], quality='suitable',
                                  observed_condition='Uncertain') for row in candidate['rows']], holds=[]))
        admitted_path = visible.admit_manifest(self.manifest_path, review)
        admitted = visible.load_manifest(admitted_path)
        self.assertTrue(admitted['training_admission'])
        self.assertFalse(visible.load_manifest(self.manifest_path)['training_admission'])
        self.assertEqual([row['label'] for row in candidate['rows']], [row['label'] for row in admitted['rows']])

    def test_admission_rejects_empty_review_and_cannot_overwrite(self):
        candidate = self.build()
        review = self.output/'review.json'
        write_json(review, dict(schema_version=1, policy='publisher_visible_condition_pilot_with_sampled_review',
            candidate_sha256=sha(self.manifest_path.read_bytes()), source_sha256=candidate['source']['sha256'],
            independent_reviewer='fixture', decision='accept', sampled_reviews=[], holds=[]))
        with self.assertRaisesRegex(ValueError, 'sample|review'):
            visible.admit_manifest(self.manifest_path, review)

    def test_quality_hold_propagates_to_related_selected_family_without_replacement(self):
        self.members['train/undamagedpackages/a-copy.rf.x.png'] = self.members['train/undamagedpackages/a.rf.1.png']
        self.members['train/undamagedpackages/other.rf.x.png'] = png(31)
        candidate = self.build()
        target = next(row for row in candidate['rows'] if row['source_family']=='a')
        reviews = [dict(sample_id=row['sample_id'], sha256=row['sha256'],
                        quality='ambiguous' if row['sample_id']==target['sample_id'] else 'suitable')
                   for row in candidate['rows']]
        review = self.output/'review.json'
        write_json(review, dict(schema_version=1, policy='publisher_visible_condition_pilot_with_sampled_review',
            candidate_sha256=sha(self.manifest_path.read_bytes()), source_sha256=candidate['source']['sha256'],
            independent_reviewer='fixture-reviewer', decision='accept', sampled_reviews=reviews, holds=[]))
        admitted = visible.load_manifest(visible.admit_manifest(self.manifest_path, review))
        self.assertFalse(any(row['source_family'] in ('a','a-copy') for row in admitted['rows']))
        self.assertEqual(len(candidate['rows'])-len(admitted['rows']),2)

    def test_header_bounds_checked_before_decoder(self):
        self.assertIsNotNone(visible)
        with patch('parcel_inputs.decode_rgb', side_effect=AssertionError('Decoder must not run')):
            with self.assertRaisesRegex(ValueError, 'dimension'):
                visible._decode(png(2,17))

    def test_perceptual_candidates_are_not_verified_label_conflicts_and_component_cap_applies(self):
        self.assertIsNotNone(visible)
        rows = [dict(sample_id=str(index),split='train',source_family='family'+str(index),
                     label='Normal' if index%2 else 'Damaged', sha256=sha(str(index).encode()),
                     pixel_sha256=sha(('pixel'+str(index)).encode()),dhash=f'{value:016x}', reasons=[])
                for index,value in enumerate([0,1,3,7,15,31])]
        visible._graph(rows)
        selected = visible._select(rows)
        self.assertEqual(len({row['dependency_group_id'] for row in rows}),1)
        self.assertEqual(len(selected),4)
        self.assertFalse(any('verified_label_conflict' in row['reasons'] for row in rows))

    def test_fixed_split_ceilings_do_not_create_extra_views(self):
        self.assertIsNotNone(visible)
        rows = [dict(sample_id=str(index),split='train' if index<1700 else 'validation',
                     dependency_group_id='group'+str(index),source_family='family'+str(index),reasons=[])
                for index in range(2200)]
        selected = visible._select(rows)
        self.assertEqual(sum(row['split']=='train' for row in selected),1600)
        self.assertEqual(sum(row['split']=='validation' for row in selected),400)

    def test_review_drift_rejected_after_admission(self):
        candidate = self.build()
        review = self.output/'review.json'
        write_json(review, dict(schema_version=1, policy='publisher_visible_condition_pilot_with_sampled_review',
            candidate_sha256=sha(self.manifest_path.read_bytes()), source_sha256=candidate['source']['sha256'],
            independent_reviewer='fixture-reviewer', decision='accept',
            sampled_reviews=[dict(sample_id=row['sample_id'],sha256=row['sha256'],quality='suitable')
                             for row in candidate['rows']], holds=[]))
        admitted = visible.admit_manifest(self.manifest_path,review)
        with self.assertRaises(FileExistsError):
            visible.admit_manifest(self.manifest_path,review)
        review.write_text('{}')
        with self.assertRaisesRegex(ValueError,'binding'):
            visible.load_manifest(admitted)

    def test_copied_intake_request_cannot_bind_unrelated_source_receipt(self):
        self.build()
        request_path = self.output/'request.json'
        request = json.loads(request_path.read_text())
        request['source_receipt'] = visible._record(self.output/'intake.result.json')
        write_json(request_path,request)
        completion_path = self.output/'intake-completion.json'
        completion = json.loads(completion_path.read_text())
        completion['request'] = visible._record(request_path)
        write_json(completion_path,completion)
        with self.assertRaisesRegex(ValueError,'source.*receipt|request'):
            visible.load_manifest(self.manifest_path)

    def test_same_rgb_bytes_different_shapes_are_not_verified_duplicates(self):
        self.assertIsNotNone(visible)
        rows = [dict(sample_id=str(index),split='train',source_family='family'+str(index),
                     label='Normal' if index else 'Damaged',sha256=sha(str(index).encode()),
                     pixel_sha256='f'*64,dhash='0000000000000000' if index else 'ffffffffffffffff',
                     width=64 if index else 128,height=128 if index else 64,reasons=[])
                for index in range(2)]
        visible._graph(rows)
        self.assertEqual(len({row['dependency_group_id'] for row in rows}),2)
        self.assertTrue(all('verified_label_conflict' not in row['reasons'] for row in rows))

    def test_distinct_encodings_same_pixels_link_as_verified_conflict(self):
        self.members['train/undamagedpackages/reencoded.rf.x.png'] = png(2,compression=0)
        result = self.build()
        linked = [row for row in result['dispositions'] if row['member'].endswith(('b.rf.2.png','reencoded.rf.x.png'))]
        self.assertEqual(len({row['sha256'] for row in linked}),2)
        self.assertEqual(len({row['pixel_sha256'] for row in linked}),1)
        self.assertTrue(all('verified_label_conflict' in row['reasons'] for row in linked))

    def test_test_payload_never_reaches_decoder_and_load_never_decodes(self):
        self.assertIsNotNone(visible)
        original_decode = visible._decode
        decoded = []
        def observe(data):
            decoded.append(data)
            return original_decode(data)
        with patch.object(visible,'_decode',side_effect=observe):
            self.build()
        self.assertEqual(len(decoded),4)
        self.assertNotIn(b'TEST pixels must never be decoded',decoded)
        with patch.object(visible,'_decode',side_effect=AssertionError('load must not decode')):
            self.assertEqual(len(visible.load_manifest(self.manifest_path)['rows']),4)

    def test_failed_source_native_receipt_rejected_before_any_image_decode(self):
        self.build()
        native_path = self.receipts/'metadata.result.json'
        write_json(native_path,dict(status='failed',returncode=1,reason='rss_limit',elapsed_seconds=1,peak_rss_bytes=1000000))
        completion_path = self.receipts/'completion.json'
        completion = json.loads(completion_path.read_text())
        completion['native_sha256'] = sha(native_path.read_bytes())
        write_json(completion_path,completion)
        new_output = self.directory/'failed-candidate'
        new_output.mkdir()
        with patch.object(visible,'_decode',side_effect=AssertionError('must fail before decode')):
            with self.assertRaisesRegex(ValueError,'native completion'):
                visible._build_candidates(completion_path,new_output)


if __name__ == '__main__':
    unittest.main()
