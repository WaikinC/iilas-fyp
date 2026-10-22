"""Artificial JPEG/tar fixtures only; never read reserved dataset pixels."""
import copy
import gzip
import hashlib
import io
import json
from pathlib import Path
import random
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import parcel_train as base
import runner_runtime as runtime

try:
    import kaputt_crop_test_intake as intake
except ImportError:
    intake = None

ROOT = Path(__file__).resolve().parents[1]


def jpeg(seed=1, side=64):
    import cv2
    import numpy as np
    array = np.random.default_rng(seed).integers(0, 255, (side, side, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode('.jpg', array)
    assert ok
    return encoded.tobytes()


def capture(index):
    return f'00000000-0000-4000-8000-{index:012d}'


def candidate(index, item=None, damaged=False):
    value = capture(index)
    return {'capture_id': value, 'item_identifier': item or f'item-{index}',
            'item_material': 'cardboard', 'defect': damaged, 'major_defect': False,
            'defect_types': '', 'official_split': 'train',
            'proposed_internal_partition': 'internal_test',
            'query_crop': f'data/train/query-data/crop/{value}.jpg'}


def archive(path, entries):
    with tarfile.open(path, 'w:gz', format=tarfile.USTAR_FORMAT) as target:
        for name, content, kind in entries:
            info = tarfile.TarInfo(name)
            info.type = kind
            info.mode = 0o644
            info.size = len(content)
            target.addfile(info, io.BytesIO(content))
    return path


def fingerprint(node, bits, endpoint=None, sha=None):
    return {'capture_id': node, 'item_identifier': node, 'endpoint': endpoint,
            'image_sha256': sha or base.digest(node), 'decoded_sha256': base.digest('decoded-' + node),
            'dhash64': f'{bits:016x}', 'width': 64, 'height': 64, 'image_bytes': 100}


class RequiredImplementation(unittest.TestCase):
    def test_dedicated_intake_exists(self):
        self.assertIsNotNone(intake, 'strict once-only test intake is not implemented')


@unittest.skipIf(intake is None, 'implementation absent')
class GraphTests(unittest.TestCase):
    def row(self, index, bits, item=None):
        source = candidate(index, item)
        return dict(source, fingerprint=fingerprint(source['capture_id'], bits), technical_reasons=[])

    def test_transitive_excluded_reference_relay_and_old_endpoint(self):
        rows = [self.row(1, 0), self.row(2, (1 << 12)-1)]
        refs = [fingerprint('excluded', 15), fingerprint('old', (1 << 40)-1, 'old100')]
        edges = [{'a': 'excluded', 'b': 'old', 'reason': 'known_dhash4'}]
        graph = intake.resolve_graph(rows, refs, edges)
        self.assertEqual(graph['dispositions'][0]['reasons'], ['touches_old100'])
        self.assertEqual(graph['dispositions'][1]['disposition'], 'included')
        self.assertIn('old', graph['dispositions'][0]['prohibited_endpoints'])

    def test_excluded_only_contact_is_retained_and_distance_four_five(self):
        refs = [fingerprint('excluded', 0)]
        rows = [self.row(1, 15), self.row(2, 31)]
        # 1 and 2 also connect to each other, so both closures can see the relay.
        result = intake.resolve_graph(rows, refs, [])
        self.assertTrue(all(r['disposition'] == 'included' for r in result['dispositions']))
        direct = {(e['a'], e['b']) for e in result['edges']}
        self.assertIn(tuple(sorted((capture(1), 'excluded'))), direct)
        self.assertNotIn(tuple(sorted((capture(2), 'excluded'))), direct)

    def test_technical_failure_same_item_mixed_labels_propagates(self):
        a, b = self.row(1, 0, 'same'), self.row(2, (1 << 64)-1, 'same')
        a['technical_reasons'] = ['minimum_side']
        a['fingerprint'] = None
        b['defect'] = True
        graph = intake.resolve_graph([a, b], [], [])
        self.assertTrue(all(r['reasons'] == ['technical_failure'] for r in graph['dispositions']))
        self.assertEqual(len({r['dependency_group_id'] for r in graph['dispositions']}), 1)

    def test_exact_encoded_and_decoded_edges_and_frozen_endpoint(self):
        rows = [self.row(1, 0), self.row(2, (1 << 64)-1)]
        ref = fingerprint('frozen', (1 << 32)-1, 'validation')
        rows[0]['fingerprint']['image_sha256'] = ref['image_sha256']
        rows[1]['fingerprint']['decoded_sha256'] = rows[0]['fingerprint']['decoded_sha256']
        graph = intake.resolve_graph(rows, [ref], [])
        self.assertTrue(all(r['reasons'] == ['touches_validation'] for r in graph['dispositions']))
        self.assertEqual({'encoded_sha256', 'decoded_sha256'},
                         {e['reason'] for e in graph['edges']})

    def test_stable_order_and_unknown_known_edge_rejected(self):
        rows = [self.row(1, 0), self.row(2, 15)]
        self.assertEqual(intake.resolve_graph(rows, [], []), intake.resolve_graph(rows[::-1], [], []))
        with self.assertRaises(ValueError):
            intake.resolve_graph(rows, [], [{'a': 'foreign', 'b': capture(1), 'reason': 'known'}])

    def test_independent_bfs_reconstruction_of_relay_closure(self):
        # Separate adjacency + BFS oracle; no union/find or production edge list.
        rows = [self.row(i, random.Random(i).getrandbits(64)) for i in range(1, 12)]
        rows[1]['item_identifier'] = rows[0]['item_identifier']
        rows[2]['fingerprint']['dhash64'] = rows[1]['fingerprint']['dhash64']
        refs = [fingerprint('relay', int(rows[2]['fingerprint']['dhash64'], 16)),
                fingerprint('old', (1 << 64)-1, 'old100'), fingerprint('alone', 0)]
        known = [{'a': 'relay', 'b': 'old', 'reason': 'known_dhash4'}]
        all_rows = {r['capture_id']: r for r in [*rows, *refs]}
        adjacent = {key: set() for key in all_rows}
        for a in all_rows:
            for b in all_rows:
                if a == b: continue
                first, second = all_rows[a], all_rows[b]
                fa = first.get('fingerprint', first); fb = second.get('fingerprint', second)
                if (first['item_identifier'] == second['item_identifier']
                        or fa['image_sha256'] == fb['image_sha256']
                        or fa['decoded_sha256'] == fb['decoded_sha256']
                        or bin(int(fa['dhash64'],16) ^ int(fb['dhash64'],16)).count('1') <= 4
                        or {a,b} == {'relay','old'}):
                    adjacent[a].add(b)
        actual = intake.resolve_graph(rows, refs, known)
        for row in actual['dispositions']:
            reached, todo = set(), [row['capture_id']]
            while todo:
                node = todo.pop()
                if node in reached: continue
                reached.add(node); todo.extend(adjacent[node]-reached)
            self.assertEqual(row['disposition'], 'excluded' if 'old' in reached else 'included')
            component = next(c for c in actual['components'] if c['dependency_group_id'] == row['dependency_group_id'])
            self.assertEqual(set(component['capture_ids']), reached)


@unittest.skipIf(intake is None, 'implementation absent')
class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT/'research/datasets', prefix='software-test-intake-')
        self.root = Path(self.temp.name)
        self.rows = [candidate(i, damaged=i % 2 == 0) for i in range(1, 148)]
        self.data = {'reserved_test_metadata': self.rows}
        self.archive = archive(self.root/'fixture.tar.gz',
                               [(r['query_crop'], jpeg(i), tarfile.REGTYPE) for i, r in enumerate(self.rows)])
        self.manifest = self.root/'manifest.json'; self.selection = self.root/'selection.json'
        runtime.write_json_exclusive(self.manifest, {'synthetic': True})
        runtime.write_json_exclusive(self.selection, {'synthetic': True})
        self.policy = json.loads((ROOT/'research/datasets/kaputt-crop-development-20261020/protocol-01.json').read_text())['internal_test_admission']
        self.key = base.digest(self.root.name)
        self.context = {'data': self.data, 'selection': {'development_key': self.key},
                        'archive': {'bytes': self.archive.stat().st_size, 'sha256': runtime.sha256_file(self.archive)},
                        'archive_paths': [r['query_crop'] for r in self.rows],
                        'reference_rows': [], 'known_edges': [], 'reference_sources': {}}
        self.core = {'development_key': self.key,
                     'manifest': intake.metadata_record(self.manifest), 'selection': intake.metadata_record(self.selection),
                     'policy': self.policy, 'policy_sha256': intake.POLICY_SHA256,
                     'candidates_sha256': base.digest(self.rows), 'sources': intake.code_bindings(),
                     'environment': base.environment()}
        protocol = self.root/'protocol.json'
        self.reference_command = [sys.executable, str(ROOT/'research/kaputt_crop_evaluate.py'), '_reference', '--output', str(self.root)]
        runtime.write_json_exclusive(protocol, {'policy': self.policy, 'policy_sha256': intake.POLICY_SHA256,
            'sources': self.core['sources'], 'environment': self.core['environment'],
            'reference_command': self.reference_command,
            'resources': {'reference': vars(intake.reference_limits()), 'acquire': vars(intake.acquisition_limits())}})
        self.core['protocol'] = intake.metadata_record(protocol)
        self.claim = ROOT/'research/datasets/kaputt-crop-test-registry'/('test-'+self.key)
        self.claim.mkdir(parents=True)
        runtime.write_json_exclusive(self.claim/'started.json', {'key': self.key, 'phase': 'test',
            'output': str(self.root), 'binding_sha256': base.digest(self.core)})
        run = self.root/'test-run.json'
        base.write_sealed(run, {'status': 'claimed', 'development_key': self.key, 'claim': str(self.claim), 'binding': self.core})
        self.binding = {'core': self.core, 'claim': str(self.claim), 'test_run': intake.metadata_record(run)}
        ref = self.root/'reference/reference-index.json'; ref.parent.mkdir()
        reference_doc = intake.reference_payload(self.context, self.core, [])
        reference_doc['worker'] = {'job': 'Local\\IILASNativeRunner-software-double', 'pid': intake.os.getpid(),
            'command': self.reference_command, 'limits': vars(intake.reference_limits())}
        base.write_sealed(ref, reference_doc)
        resource = self.root/'reference.result.json'
        limits = intake.reference_limits()
        runtime.write_json_exclusive(resource, {'status': 'success', 'reason': None, 'returncode': 0,
            'elapsed_seconds': .1, 'peak_rss_bytes': 1, 'last_snapshot': {'available_bytes': limits.min_available_bytes,
            'free_disk_bytes': limits.min_free_disk_bytes, 'rss_bytes': 1, 'output_bytes': 1, 'pids': [1]}})
        self.binding.update(reference_index=intake.metadata_record(ref), reference_resource=intake.metadata_record(resource))
        self.command = [sys.executable, str(ROOT/'research/kaputt_crop_evaluate.py'), '_acquire', '--output', str(self.root)]
        run.unlink()
        base.write_sealed(run, {'status': 'claimed', 'development_key': self.key, 'claim': str(self.claim),
            'binding': self.core, 'reference_index': self.binding['reference_index'],
            'reference_resource': self.binding['reference_resource'], 'acquisition_command': self.command})
        self.binding['test_run'] = intake.metadata_record(run)
        self.patches = [patch.object(intake, '_development_context', return_value=self.context),
                        patch.object(runtime, 'require_supervised_worker'),
                        patch.object(intake, '_original_stream_dependencies', return_value=[]),
                        patch.dict(intake.os.environ, {'IILAS_RUNNER_JOB': 'Local\\IILASNativeRunner-software-double'}),
                        patch.object(intake.sys, 'argv', self.command[1:]),
                        patch.object(intake.low, 'native_snapshot', return_value={'available_bytes': 8*1024**3, 'rss_bytes': 100}),
                        patch.object(intake.low.shutil, 'disk_usage', return_value=type('Disk', (), {'free': 100*1024**3})())]
        for item in self.patches: item.start()

    def tearDown(self):
        for item in reversed(self.patches): item.stop()
        import shutil
        shutil.rmtree(self.claim, ignore_errors=True)
        shutil.rmtree(ROOT/'research/datasets/kaputt-crop-run-registry'/('test-'+self.key), ignore_errors=True)
        self.temp.cleanup()

    def build(self):
        path = intake.build_test_admission(self.manifest, self.selection, self.archive,
                                           self.root/'admission', self.binding)
        resource = self.root/'acquire.result.json'
        if not resource.exists():
            runtime.write_json_exclusive(resource, json.loads((self.root/'reference.result.json').read_text()))
        intake.seal_successful_acquisition(path, resource)
        return path

    def test_complete_147_dispositions_labels_and_metadata_loader_no_pixels(self):
        path = self.build()
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('pixel bytes forbidden')):
            result = intake.load_test_admission(path)
        self.assertEqual(len(result['dispositions']), 147)
        self.assertEqual(result['statistics']['candidates']['images'], 147)
        self.assertEqual([r['publisher_metadata'] for r in result['audits']], self.rows)
        self.assertTrue(all(r['input_scope'] == 'crop_only' for r in result['rows']))
        self.assertNotIn('original_image_sha256', str(result))

    def test_claim_missing_terminal_historical_and_altered_run_fail_before_archive(self):
        cases = ['missing', 'failed', 'completed', 'historical', 'changed-run']
        for case in cases:
            with self.subTest(case=case), patch.object(intake, '_stage_archive', side_effect=AssertionError('pixels')):
                if case == 'missing':
                    (self.claim/'started.json').rename(self.claim/'save.json')
                elif case in ('failed', 'completed'):
                    runtime.write_json_exclusive(self.claim/(case+'.json'), {})
                elif case == 'historical':
                    (ROOT/'research/datasets/kaputt-crop-run-registry'/('test-'+self.key)).mkdir()
                else:
                    self.binding['core']['candidates_sha256'] = '0'*64
                with self.assertRaises((ValueError, FileNotFoundError)):
                    self.build()
                if case == 'missing': (self.claim/'save.json').rename(self.claim/'started.json')
                elif case in ('failed', 'completed'): (self.claim/(case+'.json')).unlink()
                elif case == 'historical': (ROOT/'research/datasets/kaputt-crop-run-registry'/('test-'+self.key)).rmdir()

    def test_modified_policy_and_candidate_metadata_rejected(self):
        self.binding['core']['policy']['technical_rules']['minimum_side'] = 1
        with patch.object(intake, '_stage_archive', side_effect=AssertionError('pixels')):
            with self.assertRaises(ValueError): self.build()

    def test_candidate_count_label_split_and_foreign_paths_checked(self):
        for field, value in [('query_crop', '../bad.jpg'), ('official_split', 'test'), ('defect', 1)]:
            with self.subTest(field=field):
                rows = copy.deepcopy(self.rows); rows[0][field] = value
                with self.assertRaises(ValueError): intake.validate_candidates(rows)
        with self.assertRaises(ValueError): intake.validate_candidates(self.rows[:-1])

    def test_destination_reuse_fails(self):
        self.build()
        with self.assertRaises((ValueError, RuntimeError)): self.build()

    def test_technical_small_view_excludes_whole_source_item(self):
        self.rows[1]['item_identifier'] = self.rows[0]['item_identifier']
        self.archive.unlink()
        archive(self.archive, [(r['query_crop'], jpeg(i, 32 if i == 0 else 64), tarfile.REGTYPE)
                               for i, r in enumerate(self.rows)])
        self.rebind()
        result = intake.load_test_admission(self.build())
        self.assertEqual(result['dispositions'][0]['reasons'], ['technical_failure'])
        self.assertEqual(result['dispositions'][1]['reasons'], ['technical_failure'])
        self.assertIsNone(result['audits'][0]['fingerprint'])
        self.assertNotIn(capture(1), {r['capture_id'] for r in result['rows']})

    def rebind(self):
        # Recreate only this synthetic fixture's claim before its first access.
        self.context['archive'] = {'bytes': self.archive.stat().st_size, 'sha256': runtime.sha256_file(self.archive)}
        marker = self.claim/'acquisition-started.json'
        if marker.exists(): marker.unlink()  # Explicit reset of independent synthetic archive scenarios only.
        self.core['candidates_sha256'] = base.digest(self.rows)
        (self.claim/'started.json').unlink()
        runtime.write_json_exclusive(self.claim/'started.json', {'key': self.key, 'phase': 'test',
            'output': str(self.root), 'binding_sha256': base.digest(self.core)})
        ref = self.root/'reference/reference-index.json'; ref.unlink()
        reference_doc = intake.reference_payload(self.context, self.core, [])
        reference_doc['worker'] = {'job': 'Local\\IILASNativeRunner-software-double', 'pid': intake.os.getpid(),
            'command': self.reference_command, 'limits': vars(intake.reference_limits())}
        base.write_sealed(ref, reference_doc)
        self.binding['reference_index'] = intake.metadata_record(ref)
        run = self.root/'test-run.json'; run.unlink()
        base.write_sealed(run, {'status': 'claimed', 'development_key': self.key, 'claim': str(self.claim),
            'binding': self.core, 'reference_index': self.binding['reference_index'],
            'reference_resource': self.binding['reference_resource'], 'acquisition_command': self.command})
        self.binding['test_run'] = intake.metadata_record(run)

    def test_exact_admitted_reader_rejects_mutated_row_before_pixels(self):
        path = self.build(); result = intake.load_test_admission(path)
        row = result['rows'][0]
        changed = dict(row, label='Damaged' if row['label'] == 'Normal' else 'Normal')
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('pixels')):
            with self.assertRaises(ValueError): intake.read_admitted_image(path, changed)
        image = intake.read_admitted_image(path, row)
        self.assertEqual(image.shape, (64, 64, 3))

    def test_forged_admission_graph_recomputed_metadata_only(self):
        path = self.build(); doc = base.read_sealed(path)
        doc['dispositions'][0]['reasons'] = ['invented']
        path.unlink(); base.write_sealed(path, doc)
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('pixels')):
            with self.assertRaises(ValueError): intake.load_test_admission(path)

    def test_unsafe_metadata_never_read_as_text(self):
        with patch.object(Path, 'read_text', side_effect=AssertionError('unsafe read')):
            with self.assertRaises(ValueError): intake.load_test_admission(self.root/'sample.jpg')
            with self.assertRaises(ValueError): intake.load_test_admission(self.root/'x/../manifest.json')

    def test_missing_or_failed_completion_forbids_public_admission(self):
        path = intake.build_test_admission(self.manifest, self.selection, self.archive,
                                           self.root/'admission', self.binding)
        with self.assertRaises((ValueError, FileNotFoundError)): intake.load_test_admission(path)
        resource = self.root/'acquire.result.json'
        runtime.write_json_exclusive(resource, {'status': 'failed', 'reason': 'wall_timeout', 'returncode': 1})
        with self.assertRaises(ValueError): intake.seal_successful_acquisition(path, resource)
        self.assertFalse((path.parent/'admission-completion.json').exists())

    def test_cached_reader_exact_membership_and_final_verification(self):
        path = self.build()
        reader = intake.open_admitted_reader(path)
        rows = reader.rows
        original_label = rows[0]['label']
        rows[0]['label'] = 'changed'
        self.assertEqual(reader.rows[0]['label'], original_label)
        with patch.object(intake, 'load_test_admission', side_effect=AssertionError('full load per read')):
            self.assertEqual(reader.read(reader.rows[0]).shape, (64, 64, 3))
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('foreign pixels')):
            with self.assertRaises(ValueError): reader.read(rows[0])
        reader.verify()
        source = self.root/'reference.result.json'
        source.write_text('{}')
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('mutated binding pixels')):
            with self.assertRaises(ValueError): reader.read(reader.rows[0])

    def test_failed_reference_resource_and_preflight_never_open_archive(self):
        with patch.object(intake.low, 'native_snapshot', return_value={'available_bytes': 1, 'rss_bytes': 1}):
            with patch.object(Path, 'open', side_effect=AssertionError('archive opened')):
                # Direct resource check is independent of metadata SHA reads.
                with self.assertRaises(RuntimeError): intake.low._Resources(self.root, intake.low.IntakeLimits())
        (self.root/'reference.result.json').write_text('{}')
        with patch.object(intake, '_stage_archive', side_effect=AssertionError('archive pixels')):
            with self.assertRaises(ValueError): self.build()

    def test_reference_pass_before_claim_reads_only_expected_reference_paths(self):
        # Claim removed: reference metadata/index remains a preclaim operation.
        import shutil
        shutil.rmtree(self.claim)
        with patch.object(intake, '_fingerprint_file', side_effect=AssertionError('no references exist')):
            with patch.object(intake.sys, 'argv', self.reference_command[1:]):
                path = intake.build_reference_index(self.manifest, self.selection, self.root/'reference-pass', {'core': self.core})
        self.assertEqual(base.read_sealed(path)['rows'], [])

    def test_direct_build_requires_real_supervisor(self):
        self.patches[1].stop()
        with self.assertRaises(runtime.RuntimeSafetyError): self.build()
        self.patches[1].start()

    def test_failed_acquisition_cannot_retry_under_new_destination(self):
        with patch.object(intake, '_stage_archive', side_effect=ValueError('synthetic acquisition failure')):
            with self.assertRaises(ValueError): self.build()
        with patch.object(intake, '_stage_archive', side_effect=AssertionError('replacement pixels')):
            with self.assertRaises((ValueError, FileExistsError)):
                intake.build_test_admission(self.manifest, self.selection, self.archive,
                                            self.root/'alternative-destination', self.binding)

    def test_jpeg_exact_dhash_convention_and_header_bounds(self):
        import cv2
        import numpy as np
        path = self.root/'software.jpg'; raw = jpeg(987); path.write_bytes(raw)
        actual, reasons = intake._fingerprint_file(path)
        self.assertEqual(reasons, [])
        image = cv2.imdecode(np.frombuffer(raw,np.uint8), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
        gray = cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
        small = cv2.resize(gray,(9,8),interpolation=cv2.INTER_AREA)
        expected = ''.join('1' if b > a else '0' for scan in small for a,b in zip(scan[:-1],scan[1:]))
        self.assertEqual(actual['dhash64'], f'{int(expected,2):016x}')
        path.write_bytes(b'not jpeg')
        self.assertEqual(intake._fingerprint_file(path), (None,['invalid_jpeg']))
        path.write_bytes(raw[:-2])
        self.assertEqual(intake._fingerprint_file(path), (None,['jpeg_eoi']))
        # Header claims 65535 squared pixels; decoder must never be called.
        path.write_bytes(b'\xff\xd8\xff\xc0\x00\x11\x08\xff\xff\xff\xff\x03'+b'\0'*10+b'\xff\xd9')
        with patch.object(cv2,'imdecode',side_effect=AssertionError('allocation')):
            self.assertEqual(intake._fingerprint_file(path), (None,['maximum_pixels']))

    def test_bad_completed_selection_and_nonjson_fail_before_payload(self):
        self.patches[0].stop()
        with patch.object(intake, '_stage_archive', side_effect=AssertionError('pixels')):
            with self.assertRaises(ValueError): self.build()
        self.patches[0].start()

    def test_crc_hash_and_tar_end_errors_precede_any_selected_decode(self):
        payload = self.archive.read_bytes()
        # Corrupt CRC while keeping metadata's compressed digest correct.
        broken = bytearray(payload); broken[-8] ^= 1
        self.archive.write_bytes(broken); self.rebind()
        with patch.object(intake, '_fingerprint_file', side_effect=AssertionError('decode before archive verification')):
            with self.assertRaises((ValueError, RuntimeError, gzip.BadGzipFile)): self.build()

    def test_resource_and_worker_command_mutation_block_completion(self):
        path = intake.build_test_admission(self.manifest, self.selection, self.archive,
                                           self.root/'admission', self.binding)
        doc = base.read_sealed(path); doc['worker']['command'] = ['foreign']
        path.unlink(); base.write_sealed(path, doc)
        resource = self.root/'acquire.result.json'
        runtime.write_json_exclusive(resource, json.loads((self.root/'reference.result.json').read_text()))
        with self.assertRaises(ValueError): intake.seal_successful_acquisition(path, resource)

    def test_reader_rejects_original_archive_mutation_before_more_pixels(self):
        path = self.build(); reader = intake.open_admitted_reader(path)
        with self.archive.open('ab') as stream: stream.write(b'changed')
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('pixels after source mutation')):
            with self.assertRaises(ValueError): reader.read(reader.rows[0])

    def test_reader_watches_new_reference_provenance_source(self):
        sample = self.root/'sample-acquisition.json'
        runtime.write_json_exclusive(sample, {'software': True})
        self.context['reference_sources'] = {'sample_receipt': intake.metadata_record(sample)}
        self.rebind()
        path = self.build(); reader = intake.open_admitted_reader(path)
        sample.write_text('{"changed":true}')
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('pixels after provenance mutation')):
            with self.assertRaises(ValueError): reader.read(reader.rows[0])

    def test_exact_original_archive_can_remain_outside_dataset_tree(self):
        import shutil
        with tempfile.TemporaryDirectory(dir=ROOT.parent, prefix='software-external-archive-') as outside:
            external = Path(outside)/'original.tar.gz'
            shutil.copyfile(self.archive, external)
            self.archive = external
            self.context['archive_path'] = str(external)
            self.context['archive_identity'] = intake.low._identity(external.stat())
            self.rebind()
            reader = intake.open_admitted_reader(self.build())
            self.assertEqual(reader.read(reader.rows[0]).shape, (64,64,3))
            with external.open('ab') as stream: stream.write(b'changed')
            with patch.object(Path,'read_bytes',side_effect=AssertionError('changed source before pixels')):
                with self.assertRaises(ValueError): reader.read(reader.rows[0])

    def test_wrong_actual_acquire_command_rejected_before_archive(self):
        with patch.object(intake.sys,'argv',['foreign.py','_acquire']):
            with patch.object(intake,'_stage_archive',side_effect=AssertionError('pixels before command match')):
                with self.assertRaises(ValueError): self.build()

    def test_corrupt_missing_duplicate_foreign_link_truncated_and_digest(self):
        entries = [(r['query_crop'], jpeg(i), tarfile.REGTYPE) for i, r in enumerate(self.rows)]
        variants = [('missing', entries[:-1]), ('duplicate', entries + entries[:1]),
                    ('foreign', entries + [('data/test/query-data/image/'+capture(999)+'.jpg', b'x', tarfile.REGTYPE)]),
                    ('link', entries + [(self.rows[0]['query_crop']+'x', b'', tarfile.SYMTYPE)]),
                    ('traversal', entries + [('../x', b'x', tarfile.REGTYPE)])]
        for name, content in variants:
            with self.subTest(name=name):
                self.archive.unlink(); archive(self.archive, content); self.rebind()
                with self.assertRaises((ValueError, RuntimeError)): self.build()
                self.assertFalse((self.root/'admission/manifest.json').exists())
                import shutil
                shutil.rmtree(self.root/'admission', ignore_errors=True)
        self.archive.unlink(); archive(self.archive, entries)
        payload = self.archive.read_bytes(); self.archive.write_bytes(payload[:-5]); self.rebind()
        with self.assertRaises((ValueError, RuntimeError, EOFError)): self.build()


if __name__ == '__main__':
    unittest.main()
