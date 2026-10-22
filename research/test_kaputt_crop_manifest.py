"""Behavioural safeguards for the separate crop-only development manifest."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / 'research/datasets/freshretailnet-audit-2026-10-17/_deps'))
import cv2
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

try:
    import kaputt_crop_manifest as manifest
except ModuleNotFoundError:
    manifest = None


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, doc):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(doc, sort_keys=True, indent=2) + '\n', encoding='utf-8')


class CropFixture:
    """Real small annotations/receipts; absent reserved pixels detect test access."""
    def __init__(self, root):
        self.root = Path(root)
        self.output = self.root / 'cohort/manifest.json'
        self.upstream = self.root / 'upstream'
        self.intake = self.root / 'intake'
        self.proposal = self.upstream / 'cohort-selection-proposal.json'
        self.selection = self.upstream / 'intake-selection-02.json'
        self.verification = self.upstream / 'independent-intake-verification-02.json'
        self.rows = []
        self.groups = []
        # a-b-c touches the old sample at c; d-e crosses train/validation;
        # f-g stays one component with mixed labels; h is validation; i test;
        # j is a previously withdrawn technical-quality group.
        for index, item in enumerate('abcdefghij'):
            split = 'validation' if item in 'eh' else ('internal_test' if item == 'i' else 'train')
            capture = f'00000000-0000-4000-8000-{index:012d}'
            row = {'capture_id': capture, 'item_identifier': item,
                   'item_material': 'cardboard', 'defect': item in 'cgij',
                   'major_defect': False, 'defect_types': '',
                   'query_crop': f'data/train/query-data/crop/{capture}.jpg'}
            self.rows.append(row)
            self.groups.append({'item_identifier': item, 'group_id': 'kaputt:item:' + item,
                                'cardboard_capture_ids': [capture],
                                'proposed_internal_partition': split})
        query = self.root / 'annotations/query-train.parquet'
        sample = self.root / 'annotations/query-sample.parquet'
        reference = self.root / 'annotations/reference-train.parquet'
        licence = self.root / 'annotations/LICENSE'
        query.parent.mkdir(parents=True)
        pq.write_table(pa.Table.from_pylist(self.rows), query)
        pq.write_table(pa.Table.from_pylist([{'capture_id': 'old-capture', 'item_identifier': 'old-item'}]), sample)
        pq.write_table(pa.table({'item_identifier': pa.array([], type=pa.string())}), reference)
        licence.write_text('Research fixture licence evidence', encoding='utf-8')
        sources = {p.relative_to(BASE).as_posix(): {'sha256': sha(p), 'bytes': p.stat().st_size}
                   for p in (query, sample, reference, licence)}
        proposal = {'schema_version': 1, 'official_source_split': 'train',
                    'selected_cardboard_query_metadata': self.rows,
                    'selected_item_groups': self.groups, 'source_files': sources,
                    'excluded_sample_item_identifiers': ['old-item'],
                    'selection_sha256': '1' * 64, 'partition_sha256': '2' * 64,
                    'reserved_noncardboard_sibling_query_metadata': [],
                    'reserved_reference_metadata': []}
        save(self.proposal, proposal)
        prior = self.upstream / 'intake-selection-01.json'
        quality = self.upstream / 'quality-audit-01.json'
        withdrawal = self.upstream / 'parent-quality-withdrawal-01.json'
        amendment = self.upstream / 'quality-withdrawal-proposal.json'
        save(prior, {'source_proposal_sha256': sha(self.proposal)})
        save(quality, {'failed_crops': [{'capture_id': self.rows[-1]['capture_id'],
                                       'width': 20, 'height': 20}]})
        save(withdrawal, {'status': 'parent_quality_withdrawal_check', 'withdrawn_item_ids': ['j'],
                          'removed_captures': [self.rows[-1]], 'no_images_opened': True})
        save(amendment, {'status': 'proposed_quality_withdrawal_not_training_admitted',
                         'input_proposal': {'sha256': sha(self.proposal)},
                         'minimum_side_pixels': 64, 'withdrawn_groups': [self.groups[-1]],
                         'all_withdrawn_item_query_metadata': [self.rows[-1]]})
        selected = [r['query_crop'] for r in self.rows if r['item_identifier'] not in 'ij']
        selection = {'official_split': 'train', 'source_proposal_sha256': sha(self.proposal),
                     'prior_intake_selection_sha256': sha(prior), 'quality_audit_sha256': sha(quality),
                     'quality_withdrawal_sha256': sha(amendment), 'withdrawn_item_ids': ['j'],
                     'selected_paths': selected, 'no_replacements': True,
                     'surviving_partitions_unchanged': True, 'extract_images': 8,
                     'selection_sha256': '1' * 64, 'partition_sha256': '2' * 64}
        save(self.selection, selection)
        images = []
        for index, row in enumerate(self.rows[:8]):
            path = self.intake / 'selected' / row['query_crop']
            path.parent.mkdir(parents=True, exist_ok=True)
            image = np.full((64, 65, 3), index * 20, dtype=np.uint8)
            cv2.imwrite(str(path), image)
            decoded = cv2.imdecode(np.frombuffer(path.read_bytes(), np.uint8), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
            images.append({'path': row['query_crop'], 'sha256': sha(path), 'verified_sha256': sha(path),
                           'decoded_sha256': hashlib.sha256(memoryview(decoded)).hexdigest(),
                           'width': 65, 'height': 64, 'bytes': path.stat().st_size})
        self.archive = self.root / 'fixture-archive.tar.gz'
        self.archive.write_bytes(b'fixture archive for stat identity')
        stat = self.archive.stat()
        identity = {'device': stat.st_dev, 'inode': stat.st_ino, 'bytes': stat.st_size,
                    'mtime_ns': stat.st_mtime_ns,
                    'birthtime_ns': getattr(stat, 'st_birthtime_ns', stat.st_ctime_ns)}
        receipt = {'status': 'completed', 'archive_bytes': self.archive.stat().st_size,
                   'archive_sha256': sha(self.archive), 'archive': str(self.archive),
                   'archive_identity_before': identity, 'archive_identity_after': identity,
                   'selected': images, 'selected_files': 8, 'retained_bytes': sum(r['bytes'] for r in images),
                   'regular_paths': selected + [self.rows[8]['query_crop']],
                   'limits': {'min_side': 64, 'max_pixels': 16000000, 'max_file_bytes': 16777216}}
        save(self.intake / 'selected/receipt.json', receipt)
        metadata = {'status': 'verified_intake_not_training_admitted',
                    'receipt_sha256': sha(self.intake / 'selected/receipt.json'),
                    'selection_sha256': sha(self.selection), 'proposal_sha256': sha(self.proposal),
                    'quality_withdrawal_sha256': sha(amendment), 'source_files': sources,
                    'all_archive_paths_match_official_metadata': True,
                    'no_official_heldout_images_extracted_or_decoded': True,
                    'reserved_internal_test_not_extracted': 1}
        save(self.intake / 'metadata-verification.json', metadata)
        supervision = {'status': 'success', 'returncode': 0, 'reason': None}
        save(self.intake / 'stream.result.json', supervision)
        captures = {r['item_identifier']: r['capture_id'] for r in self.rows}
        edges = [{'a': captures[a], 'b': captures[b], 'distance': 4}
                 for a, b in [('a', 'b'), ('b', 'c'), ('d', 'e'), ('f', 'g')]]
        verification = {'status': 'independent_integrity_verified_not_training_admitted',
                        'images': 8, 'source_item_groups': 8, 'supervision': supervision,
                        'near_cross_item_candidates_dhash_le4': edges,
                        'old_sample_near_candidates_dhash_le4': [
                            {'new': captures['c'], 'old': 'old-capture', 'distance': 4}],
                        'exact_cross_item_duplicates': [], 'old_sample_exact_matches': [],
                        'no_internal_or_official_test_images_extracted_or_decoded': True}
        save(self.verification, verification)

    def build(self):
        return manifest.build_manifest(self.proposal, self.selection, self.intake,
                                       self.verification, self.output)


class CropManifestTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(manifest, 'crop-only manifest implementation is missing')
        self.temp = tempfile.TemporaryDirectory(prefix='crop-manifest-test-', dir=BASE / 'research/datasets')
        self.addCleanup(self.temp.cleanup)
        self.fixture = CropFixture(self.temp.name)
        # The loader still performs real identity/provenance work; substitute
        # the official 31.6 GB payload identity with this tiny test archive.
        for name, value in [('ARCHIVE_BYTES', self.fixture.archive.stat().st_size),
                            ('ARCHIVE_SHA256', sha(self.fixture.archive))]:
            patcher = patch.object(manifest, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_transitive_old_sample_and_cross_partition_components_quarantine_whole_items(self):
        doc = self.fixture.build()
        self.assertEqual([r['item_identifier'] for r in doc['rows']], ['f', 'g', 'h'])
        self.assertEqual([r['label'] for r in doc['rows']], ['Normal', 'Damaged', 'Normal'])
        self.assertEqual(doc['rows'][0]['dependency_group_id'], doc['rows'][1]['dependency_group_id'])
        self.assertNotEqual(doc['rows'][1]['dependency_group_id'], doc['rows'][2]['dependency_group_id'])
        self.assertEqual({r['item_identifier'] for r in doc['reserved_test_metadata']}, {'i'})
        self.assertEqual({r['item_identifier'] for r in doc['exclusions']}, set('abcdej'))

    def test_metadata_only_load_never_opens_any_image_or_reserved_test_path(self):
        self.fixture.build()
        real_open = Path.open
        def metadata_only(path, *args, **kwargs):
            if path.suffix.lower() in {'.jpg', '.png'}:
                self.fail('metadata-only load opened pixels: ' + str(path))
            return real_open(path, *args, **kwargs)
        with patch.object(Path, 'open', metadata_only):
            doc = manifest.load_manifest(self.fixture.output)
        self.assertEqual(len(doc['rows']), 3)
        self.assertEqual(doc['rows'][0]['_group_id'], doc['rows'][1]['_group_id'])
        self.assertTrue(doc['rows'][0]['_image_path'].is_absolute())
        self.assertEqual(manifest.benchmark_context(doc)['evaluation_scope'], 'development_only')

    def test_image_verification_is_limited_to_retained_development_rows(self):
        self.fixture.build()
        excluded = self.fixture.intake / 'selected' / self.fixture.rows[0]['query_crop']
        excluded.unlink()
        doc = manifest.load_manifest(self.fixture.output, verify_images=True)
        self.assertEqual(len(doc['rows']), 3)
        included = self.fixture.intake / 'selected' / doc['rows'][0]['image_path']
        included.write_bytes(b'altered JPEG')
        with self.assertRaises(ValueError):
            manifest.load_manifest(self.fixture.output, verify_images=True)

    def test_manifest_label_group_partition_and_omission_tampering_rejected(self):
        self.fixture.build()
        original = json.loads(self.fixture.output.read_text())
        for change in ('label', 'group', 'partition', 'omission', 'test'):
            with self.subTest(change=change):
                doc = copy.deepcopy(original)
                if change == 'label': doc['rows'][0]['label'] = 'Damaged'
                if change == 'group': doc['rows'][0]['dependency_group_id'] = 'forged-group'
                if change == 'partition': doc['rows'][0]['split'] = 'validation'
                if change == 'omission': doc['rows'].pop()
                if change == 'test': doc['rows'].append(copy.deepcopy(doc['reserved_test_metadata'][0]))
                save(self.fixture.output, doc)
                with self.assertRaises(ValueError): manifest.load_manifest(self.fixture.output)

    def test_provenance_mutation_or_missing_supervision_denies_admission(self):
        self.fixture.build()
        supervision = self.fixture.intake / 'stream.result.json'
        save(supervision, {'status': 'failed', 'returncode': 1})
        with self.assertRaises(ValueError): manifest.load_manifest(self.fixture.output)

    def test_source_labels_must_match_original_annotations(self):
        proposal = json.loads(self.fixture.proposal.read_text())
        proposal['selected_cardboard_query_metadata'][5]['defect'] = True
        save(self.fixture.proposal, proposal)
        amendment_path = self.fixture.upstream / 'quality-withdrawal-proposal.json'
        amendment = json.loads(amendment_path.read_text())
        amendment['input_proposal']['sha256'] = sha(self.fixture.proposal)
        save(amendment_path, amendment)
        # Even updating all first-level receipts cannot turn a false source label into truth.
        selection = json.loads(self.fixture.selection.read_text())
        selection['source_proposal_sha256'] = sha(self.fixture.proposal)
        selection['quality_withdrawal_sha256'] = sha(amendment_path)
        prior_path = self.fixture.upstream / 'intake-selection-01.json'
        prior = json.loads(prior_path.read_text())
        prior['source_proposal_sha256'] = sha(self.fixture.proposal)
        save(prior_path, prior)
        selection['prior_intake_selection_sha256'] = sha(prior_path)
        save(self.fixture.selection, selection)
        metadata_path = self.fixture.intake / 'metadata-verification.json'
        metadata = json.loads(metadata_path.read_text())
        metadata['selection_sha256'] = sha(self.fixture.selection)
        metadata['proposal_sha256'] = sha(self.fixture.proposal)
        metadata['quality_withdrawal_sha256'] = sha(amendment_path)
        save(metadata_path, metadata)
        with self.assertRaises(ValueError): self.fixture.build()

    def test_missing_archive_identity_is_not_admitted_by_a_completed_receipt(self):
        receipt_path = self.fixture.intake / 'selected/receipt.json'
        receipt = json.loads(receipt_path.read_text())
        for name in ('archive', 'archive_identity_before', 'archive_identity_after'):
            receipt.pop(name)
        save(receipt_path, receipt)
        metadata_path = self.fixture.intake / 'metadata-verification.json'
        metadata = json.loads(metadata_path.read_text())
        metadata['receipt_sha256'] = sha(receipt_path)
        save(metadata_path, metadata)
        with self.assertRaises(ValueError): self.fixture.build()

    def test_quality_withdrawal_must_correspond_to_recorded_bad_capture(self):
        audit_path = self.fixture.upstream / 'quality-audit-01.json'
        audit = json.loads(audit_path.read_text())
        audit['failed_crops'][0]['capture_id'] = self.fixture.rows[5]['capture_id']
        save(audit_path, audit)
        selection = json.loads(self.fixture.selection.read_text())
        selection['quality_audit_sha256'] = sha(audit_path)
        save(self.fixture.selection, selection)
        metadata_path = self.fixture.intake / 'metadata-verification.json'
        metadata = json.loads(metadata_path.read_text())
        metadata['selection_sha256'] = sha(self.fixture.selection)
        save(metadata_path, metadata)
        with self.assertRaises(ValueError): self.fixture.build()

    def test_unsafe_image_path_rejected_before_any_pixel_read(self):
        self.fixture.build()
        doc = json.loads(self.fixture.output.read_text())
        doc['rows'][0]['image_path'] = '../outside.jpg'
        save(self.fixture.output, doc)
        with self.assertRaises(ValueError): manifest.load_manifest(self.fixture.output)

    def test_existing_manifest_is_never_overwritten(self):
        self.fixture.build()
        before = self.fixture.output.read_bytes()
        with self.assertRaises((ValueError, FileExistsError)): self.fixture.build()
        self.assertEqual(self.fixture.output.read_bytes(), before)

    def test_metadata_parquet_reads_enforce_one_cpu_and_io_thread(self):
        previous_cpu, previous_io = pa.cpu_count(), pa.io_thread_count()
        self.addCleanup(pa.set_cpu_count, previous_cpu)
        self.addCleanup(pa.set_io_thread_count, previous_io)
        pa.set_cpu_count(4)
        pa.set_io_thread_count(4)
        read_table = pq.read_table
        def serial_read(*args, **kwargs):
            # Reject the implicit threaded default while still reading the
            # real fixture annotations; no fake Parquet result is supplied.
            self.assertIs(kwargs.get('use_threads'), False)
            self.assertEqual(pa.cpu_count(), 1)
            self.assertEqual(pa.io_thread_count(), 1)
            return read_table(*args, **kwargs)
        with patch.object(pq, 'read_table', serial_read):
            doc = self.fixture.build()
        self.assertEqual(len(doc['rows']), 3)


if __name__ == '__main__':
    unittest.main()
