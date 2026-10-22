"""Synthetic fixtures test review preparation, never image accuracy."""
import csv
import functools
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parent


@functools.cache
def interpreter_startup_stderr():
    # Some restricted Windows environments emit a Python bootstrap warning before
    # any application code runs. Learn only that exact interpreter-only prefix;
    # do not discard arbitrary application diagnostics or trailing output.
    probe = subprocess.run([sys.executable, '-c', 'pass'], text=True,
                           capture_output=True, check=True)
    return probe.stderr


class ParcelReviewTests(unittest.TestCase):
    def setUp(self):
        (ROOT / 'datasets').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'datasets')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / 'parcel3d-pilot'
        self.source.mkdir()
        self.output = self.base / 'review'
        self.members = []
        triage = []
        for index, (model, label) in enumerate([
            ('shared_model', 'Normal'), ('shared_model', 'Damaged'), ('other_model', 'Normal')
        ], 1):
            sid = f'00000000-0000-0000-0000-{index:012d}'
            folder = self.source / sid
            folder.mkdir()
            config = (f'SCENARIO:\n  ID: {sid}\n  FLAG: train\n'
                      f'  MODEL:\n    NAME: {model}\n  PARCEL_TYPE: {label.lower()}\n')
            files = []
            for name, content in [('render_config.yaml', config.encode()),
                                  ('rgb.png', f'fixture-image-{index}'.encode()),
                                  ('annotations.json', b'{}')]:
                (folder / name).write_bytes(content)
                member_name = 'meta/render_config.yaml' if name == 'render_config.yaml' else name
                files.append({'path': f'parcel3d-pilot\\{sid}\\{name}',
                              'member': f'parcel3d/train/{sid}/{member_name}',
                              'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(),
                              'zip_crc_verified': True})
            self.members.append({'sample_id': sid, 'source_type': label.lower(),
                                 'candidate_label': label, 'source_model': model,
                                 'origin': 'simulated', 'label_status': 'pending',
                                 'source_split': 'train', 'files': files})
            triage.append([index, sid, label, 'low_light_or_small_object' if index == 2
                           else 'not_flagged_at_contact_sheet_scale', 'pending'])
        self.save_manifest()
        (self.source / 'pilot-audit.json').write_text('{}', encoding='utf-8')
        with (self.source / 'visual-triage.csv').open('w', newline='', encoding='utf-8') as stream:
            writer = csv.writer(stream)
            writer.writerow(['pilot_position', 'sample_id', 'source_label',
                             'assistant_contact_sheet_flag', 'human_review_status'])
            writer.writerows(triage)

    def save_manifest(self):
        (self.source / 'manifest.json').write_text(json.dumps({
            'source': 'https://zenodo.org/records/8032204', 'version': '1.0',
            'members': self.members}), encoding='utf-8')

    def run_prepare(self, source=None, output=None):
        result = subprocess.run([sys.executable, str(ROOT / 'parcel_review.py'),
                               '--source', str(source or self.source),
                               '--output', str(output or self.output)],
                              text=True, capture_output=True, check=False)
        startup = interpreter_startup_stderr()
        if startup and result.stderr.startswith(startup):
            result.stderr = result.stderr[len(startup):]
        return result

    def assert_rejected(self):
        result = self.run_prepare()
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertFalse(self.output.exists())
        self.assertNotIn(str(self.source), result.stderr)
        self.assertNotIn('Traceback', result.stderr)
        self.assertTrue(result.stderr.startswith('{'), 'Expected redacted structured diagnostic')
        self.assertIn('error', json.loads(result.stderr))

    def test_pending_queue_groups_exact_model_names_without_acceptance(self):
        result = self.run_prepare()
        self.assertEqual(result.returncode, 0, result.stderr)
        with (self.output / 'review-queue.csv').open(newline='', encoding='utf-8') as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 3)
        by_id = {row['sample_id']: row for row in rows}
        first, second, third = [by_id[m['sample_id']] for m in self.members]
        self.assertEqual(first['candidate_group_id'], second['candidate_group_id'])
        self.assertNotEqual(first['candidate_group_id'], third['candidate_group_id'])
        self.assertEqual(second['assistant_contact_sheet_flag'], 'low_light_or_small_object')
        for row in rows:
            self.assertEqual(row['label_status'], 'pending')
            self.assertEqual(row['visibility_status'], 'pending')
            self.assertEqual(row['family_review_status'], 'pending')
            for field in ['label', 'split', 'approved_family_id', 'reviewer', 'review_notes']:
                self.assertEqual(row[field], '')
        report = json.loads((self.output / 'review-summary.json').read_text())
        self.assertEqual(report['samples'], 3)
        self.assertEqual(report['candidate_groups'], 2)
        self.assertEqual(report['verified_files'], 9)
        self.assertFalse(report['ready_for_split'])
        self.assertEqual(len(report['source_metadata']), 3)
        for item in report['source_metadata']:
            self.assertEqual(item['sha256'], hashlib.sha256((self.source / item['name']).read_bytes()).hexdigest())

    def test_reproducible_outputs_and_refuse_overwrite(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        other = self.base / 'review-second'
        self.assertEqual(self.run_prepare(output=other).returncode, 0)
        originals = {p.name: p.read_bytes() for p in self.output.iterdir()}
        self.assertEqual(originals, {p.name: p.read_bytes() for p in other.iterdir()})
        self.assertEqual(self.run_prepare().returncode, 2)
        self.assertEqual(originals, {p.name: p.read_bytes() for p in self.output.iterdir()})

    def test_reject_tampered_file(self):
        (self.source / self.members[0]['sample_id'] / 'rgb.png').write_bytes(b'tampered')
        self.assert_rejected()

    def test_reject_wrong_hash_even_when_size_matches(self):
        self.members[0]['files'][1]['sha256'] = '0' * 64
        self.save_manifest()
        self.assert_rejected()

    def test_reject_escaped_paths(self):
        for path in ['../private-config/secret', 'C:/private/secret',
                     'parcel3d-pilot/../outside', 'parcel3d-pilot\\..\\outside']:
            with self.subTest(path=path):
                self.members[0]['files'][0]['path'] = path
                self.save_manifest()
                self.assert_rejected()

    def test_reject_missing_and_duplicate_sample_members(self):
        self.members.append(self.members[0])
        self.save_manifest()
        self.assert_rejected()
        self.members.pop()
        self.members[0]['files'].pop()
        self.save_manifest()
        self.assert_rejected()

    def test_reject_source_model_or_candidate_label_mismatch(self):
        original = self.members[0]['source_model']
        self.members[0]['source_model'] = 'wrong_model'
        self.save_manifest()
        self.assert_rejected()
        self.members[0]['source_model'] = original
        self.members[0]['candidate_label'] = 'Damaged'
        self.save_manifest()
        self.assert_rejected()

    def test_reject_triage_mismatch_and_no_invented_human_approval(self):
        path = self.source / 'visual-triage.csv'
        original = path.read_text()
        path.write_text(original.replace(',Normal,', ',Damaged,', 1))
        self.assert_rejected()
        path.write_text(original.replace(',pending', ',accepted', 1))
        self.assert_rejected()

    def test_reject_duplicate_image_content(self):
        first = self.source / self.members[0]['sample_id'] / 'rgb.png'
        second = self.source / self.members[1]['sample_id'] / 'rgb.png'
        second.write_bytes(first.read_bytes())
        self.members[1]['files'][1].update(bytes=first.stat().st_size,
                                         sha256=hashlib.sha256(first.read_bytes()).hexdigest())
        self.save_manifest()
        self.assert_rejected()

    def test_cli_restricts_both_roots_and_redacts_invalid_input(self):
        # Use a verified outside-datasets area regardless of the TEMP override.
        outside_parent = ROOT.parent / 'outputs'
        outside_parent.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=outside_parent, prefix='parcel-boundary-') as external:
            for source, output in [(Path(external), self.output), (self.source, Path(external) / 'review')]:
                result = self.run_prepare(source=source, output=output)
                self.assertEqual(result.returncode, 2)
                self.assertNotIn(external, result.stderr)
                self.assertNotIn('Traceback', result.stderr)
                self.assertTrue(result.stderr.startswith('{'), 'Expected structured root rejection')
        (self.source / 'manifest.json').write_text('{secret-marker invalid json')
        result = self.run_prepare()
        self.assertEqual(result.returncode, 2)
        self.assertNotIn('secret-marker', result.stderr)
        self.assertNotIn('Traceback', result.stderr)
        self.assertTrue(result.stderr.startswith('{'), 'Expected structured parse rejection')

    def test_oversized_triage_field_is_redacted_and_creates_no_output(self):
        path = self.source / 'visual-triage.csv'
        path.write_text(path.read_text().replace('not_flagged_at_contact_sheet_scale', 'x' * 200000, 1))
        self.assert_rejected()

    def rewrite_config(self, text):
        path = self.source / self.members[0]['sample_id'] / 'render_config.yaml'
        data = text.encode()
        path.write_bytes(data)
        self.members[0]['files'][0].update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        self.save_manifest()

    def test_reject_duplicate_relevant_scalar_even_with_unsupported_syntax(self):
        path = self.source / self.members[0]['sample_id'] / 'render_config.yaml'
        original = path.read_text()
        for index, suffix in enumerate(['  PARCEL_TYPE: "damaged"\n',
                                        '  PARCEL_TYPE: |\n    damaged\n',
                                        '  "PARCEL_TYPE": damaged\n']):
            with self.subTest(suffix=suffix):
                self.output = self.base / f'duplicate-scalar-{index}'
                self.rewrite_config(original + suffix)
                self.assert_rejected()

    def test_reject_repeated_model_or_scenario_sections(self):
        path = self.source / self.members[0]['sample_id'] / 'render_config.yaml'
        original = path.read_text()
        for index, suffix in enumerate(['  MODEL:\n    NAME: "other_model"\n',
                                        '  MODEL: {NAME: other_model}\n',
                                        'SCENARIO: {PARCEL_TYPE: damaged}\n']):
            with self.subTest(suffix=suffix):
                self.output = self.base / f'duplicate-section-{index}'
                self.rewrite_config(original + suffix)
                self.assert_rejected()


if __name__ == '__main__':
    unittest.main()
