"""Synthetic software checks; never evidence of parcel-label accuracy."""
import csv
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import struct
import unittest
from unittest.mock import patch
import zlib

import parcel_adjudication
import parcel_review
import test_parcel_review as fixtures


ROOT = Path(__file__).resolve().parent


class ParcelAdjudicationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ParcelReviewTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.base = self.fixture.base
        self.source = self.fixture.source
        self.queue = self.base / 'queue'
        self.output = self.base / 'adjudicated'
        for i, member in enumerate(self.fixture.members):
            folder = self.source / member['sample_id']
            def chunk(kind, data):
                return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
            png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 16, 12, 8, 2, 0, 0, 0))
            png += chunk(b'IDAT', zlib.compress((b'\0' + bytes([i * 50, 70, 80]) * 16) * 12)) + chunk(b'IEND', b'')
            (folder / 'rgb.png').write_bytes(png)
            path = folder / 'render_config.yaml'
            asset = 'google_scanned_objects/' + member['source_model']
            path.write_text(path.read_text().replace('  PARCEL_TYPE:',
                f'    OBJ: {asset}/meshes/model.obj\n'
                f'    MTL: {asset}/meshes/model.mtl\n'
                f'    BINVOX: {asset}/binvox/model.binvox\n'
                f'  TEXTURE: cardboard/textures/example.png\n  PARCEL_TYPE:') +
                'RENDER:\n  IMAGE_WIDTH: 16\n  IMAGE_HEIGHT: 12\n')
            for entry in member['files']:
                data = (folder / Path(entry['path'].replace('\\', '/')).name).read_bytes()
                entry.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        self.fixture.save_manifest()
        parcel_review.prepare(self.source, self.queue)
        with (self.queue / 'review-queue.csv').open(newline='') as stream:
            self.rows = list(csv.DictReader(stream))
        self.review = {
            'schema_version': 1, 'reviewer_kind': 'assistant', 'review_date': '2026-10-17',
            'review_method': 'original_resolution_view_image', 'source_informed': True,
            'independent_ground_truth': False,
            'queue_sha256': hashlib.sha256((self.queue / 'review-queue.csv').read_bytes()).hexdigest(),
            'assessments': [dict(pilot_position=i, image_sha256=row['image_sha256'],
                assistant_label=label, visibility='adequate', reason_code='fixture_review',
                reason='Synthetic test review only.', viewed_original=True)
                for i, row, label in zip([1, 2, 3], self.rows, ['Normal', 'Damaged', 'Uncertain'])],
            'possible_family_links': []}
        self.review_path = self.base / 'assistant-input.json'
        self.save_review()

    def save_review(self):
        self.review_path.write_text(json.dumps(self.review), encoding='utf-8')

    def run_cli(self, output=None):
        return subprocess.run([sys.executable, str(ROOT / 'parcel_adjudication.py'),
            '--source', str(self.source), '--queue', str(self.queue),
            '--review', str(self.review_path), '--output', str(output or self.output)],
            capture_output=True, text=True, check=False)

    def reject(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertFalse(self.output.exists())
        self.assertNotIn(str(self.base), result.stderr)
        self.assertNotIn('Traceback', result.stderr)
        self.assertIn('error', json.loads(result.stderr.splitlines()[-1]))

    def test_review_keeps_human_authority_pending_and_groups_shared_asset_root(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads((self.output / 'summary.json').read_text())
        self.assertEqual(summary['assistant_label_counts'], {'Normal': 1, 'Damaged': 1, 'Uncertain': 1})
        self.assertEqual(summary['candidate_asset_roots'], 2)
        self.assertFalse(summary['ready_for_split'])
        with (self.output / 'assistant-review.csv').open(newline='') as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(rows[0]['proposed_asset_family_id'], rows[1]['proposed_asset_family_id'])
        self.assertNotEqual(rows[0]['proposed_asset_family_id'], rows[2]['proposed_asset_family_id'])
        for row in rows:
            self.assertEqual(row['label_status'], 'pending')
            self.assertEqual(row['split'], '')
            self.assertEqual(row['approved_family_id'], '')
            self.assertEqual(row['label'], '')

    def test_reproducible_outputs_and_refuse_overwrite(self):
        self.assertEqual(self.run_cli().returncode, 0)
        original = {p.name: p.read_bytes() for p in self.output.iterdir()}
        second = self.base / 'second'
        self.assertEqual(self.run_cli(second).returncode, 0)
        self.assertEqual(original, {p.name: p.read_bytes() for p in second.iterdir()})
        self.assertEqual(self.run_cli().returncode, 2)
        self.assertEqual(original, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_reject_tampered_source_image_or_queue(self):
        path = self.source / self.fixture.members[0]['sample_id'] / 'rgb.png'
        original = path.read_bytes()
        path.write_bytes(b'not-the-reviewed-image')
        self.reject()
        path.write_bytes(original)
        path = self.queue / 'review-queue.csv'
        path.write_text(path.read_text().replace('pending', 'accepted', 1))
        self.reject()

    def test_reject_incomplete_duplicate_or_wrong_image_reviews(self):
        original = json.loads(json.dumps(self.review))
        for mode in ['missing', 'duplicate', 'hash']:
            self.review = json.loads(json.dumps(original))
            if mode == 'missing':
                self.review['assessments'].pop()
            elif mode == 'duplicate':
                self.review['assessments'][1] = self.review['assessments'][0]
            else:
                self.review['assessments'][0]['image_sha256'] = '0' * 64
            self.save_review()
            self.reject()

    def test_reject_human_approval_or_final_split_in_assistant_input(self):
        for key, value in [('reviewer_kind', 'human'), ('independent_ground_truth', True), ('split', 'train')]:
            original = json.loads(json.dumps(self.review))
            self.review[key] = value
            self.save_review()
            self.reject()
            self.review = original

    def test_reject_unsupported_asset_paths_and_duplicate_asset_keys(self):
        path = self.source / self.fixture.members[0]['sample_id'] / 'render_config.yaml'
        original = path.read_text()
        for addition in ['    OBJ: "private-value"\n', '    OBJ: ../../private-value\n']:
            with self.assertRaises(parcel_review.ReviewError):
                parcel_adjudication.asset_fields((original + addition).encode(), 'shared_model')

    def test_asset_references_cannot_be_supplied_by_an_unrelated_section(self):
        path = self.source / self.fixture.members[0]['sample_id'] / 'render_config.yaml'
        original = path.read_text()
        for altered in [original.replace('SCENARIO:', 'UNRELATED:'),
                        original.replace('  MODEL:', '  OTHER:'),
                        original.replace('RENDER:', 'UNRELATED:')]:
            with self.assertRaises(parcel_review.ReviewError):
                parcel_adjudication.asset_fields(altered.encode(), 'shared_model')

    def test_queue_child_resolving_outside_queue_is_rejected(self):
        # Model a filesystem-resolved link without requiring Windows symlink privileges.
        # Real confined() must reject the resolved target before read_bytes can run.
        real_resolve = Path.resolve
        target = self.queue / 'review-queue.csv'
        external = ROOT / 'outside-datasets' / 'sensitive.csv'
        def resolve(path, *args, **kwargs):
            return external if path == target else real_resolve(path, *args, **kwargs)
        with patch.object(Path, 'resolve', autospec=True, side_effect=resolve):
            with self.assertRaisesRegex(parcel_review.ReviewError, 'path_outside_dataset'):
                parcel_adjudication.adjudicate(self.source, self.queue, self.review_path, self.output)
        self.assertFalse(self.output.exists())

    def test_reject_external_output_and_malformed_input_with_redacted_error(self):
        result = self.run_cli(ROOT / 'outside-datasets')
        self.assertEqual(result.returncode, 2)
        self.assertNotIn(str(ROOT), result.stderr)
        self.review_path.write_text('{sensitive-marker malformed')
        self.reject()


if __name__ == '__main__':
    unittest.main()
