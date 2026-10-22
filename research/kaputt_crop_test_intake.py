"""Strict, once-only crop TEST admission; no model import, fitting or inference.

Public builders are worker operations: they require membership of the real named
Windows ResourceSupervisor Job. The reference pass reads only already-seen
crops and needs no scientific test claim. Acquisition requires a durable matching
canonical claim and sealed test-run, and consumes no alternative namespace.
Synthetic tests replace external boundaries explicitly; there is no fixture flag.
Hash seals guard accidental mutation, not a local owner rewriting code/evidence.
"""
from collections import Counter, defaultdict
import copy
from dataclasses import replace
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tarfile
import time

import kaputt_crop_intake as low
import kaputt_crop_manifest as provenance
import kaputt_crop_train as development
import kaputt_crop_finetune as completed
import parcel_train as base
import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
MiB = 1024**2
PROFILE = 'kaputt_crop_internal_test'
POLICY_SHA256 = development.TEST_ADMISSION_SHA256
GRAPH_VERSION = 'all965-reference-relays-encoded-decoded-dhash4-v1'
CODE_FILES = (*completed.CODE_FILES, 'kaputt_crop_intake.py', 'kaputt_crop_test_intake.py')
HEX = re.compile('[0-9a-f]{64}\\Z')


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def reference_limits():
    return runtime.Limits(max_wall_seconds=180, max_fit_seconds=180,
        max_rss_bytes=512*MiB, min_available_bytes=3072*MiB,
        min_free_disk_bytes=20*1024**3, max_output_bytes=512*MiB,
        available_floor_bytes=768*MiB, threads=1)


def acquisition_limits():
    return replace(reference_limits(), max_wall_seconds=1800, max_fit_seconds=1800)


def _intake_limits():
    return low.IntakeLimits(max_selected_files=147, max_output_bytes=512*MiB,
        min_available_bytes=3072*MiB, available_floor_bytes=768*MiB)


def code_bindings():
    return {name: runtime.sha256_file(Path(__file__).parent/name) for name in CODE_FILES}


def _metadata_path(path):
    raw = Path(path)
    _require(raw.suffix == '.json', 'Bounded JSON metadata required before text reads')
    safe = provenance._local(raw)
    _require(safe.is_file() and 0 < safe.stat().st_size <= 32*MiB, 'Bounded JSON metadata required')
    return safe


def _json(path):
    def invalid(value):
        raise ValueError('Nonfinite JSON number: '+value)
    def unique(pairs):
        result = {}
        for key, value in pairs:
            _require(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(_metadata_path(path).read_text(encoding='utf-8'),
                      parse_constant=invalid, object_pairs_hook=unique)


def _sealed(path):
    doc = _json(path)
    _require(isinstance(doc, dict) and set(doc) == {'payload', 'sha256'}
             and base.digest(doc['payload']) == doc['sha256'], 'Invalid metadata seal')
    return doc['payload']


def metadata_record(path):
    path = _metadata_path(path)
    return {'path': str(path), 'sha256': runtime.sha256_file(path)}


def _record(value):
    _require(isinstance(value, dict) and set(value) == {'path', 'sha256'}
             and isinstance(value.get('sha256'), str) and HEX.fullmatch(value['sha256']),
             'Invalid JSON metadata binding')
    path = _metadata_path(value['path'])
    _require(metadata_record(path) == value, 'Changed metadata binding')
    return path


def validate_candidates(rows):
    _require(isinstance(rows, list) and len(rows) == 147, 'Exact 147 reserved candidates required')
    seen = set()
    for row in rows:
        _require(isinstance(row, dict), 'Candidate object required')
        match = provenance.IMAGE.fullmatch(row.get('query_crop', ''))
        _require(match is not None and match.group(1) == row.get('capture_id')
                 and row.get('capture_id') not in seen
                 and row.get('official_split') == 'train'
                 and row.get('proposed_internal_partition') == 'internal_test'
                 and type(row.get('defect')) is bool and type(row.get('major_defect')) is bool
                 and row.get('item_material') == 'cardboard'
                 and isinstance(row.get('defect_types'), str)
                 and isinstance(row.get('item_identifier'), str) and bool(row['item_identifier']),
                 'Invalid/foreign/duplicate reserved publisher metadata')
        seen.add(row['capture_id'])
    _require(rows == sorted(rows, key=lambda row: row['capture_id']), 'Stable frozen candidate order required')
    return rows


def _development_context(manifest_path, selection_path):
    """Verify the completed original experiment without its pre-fit no-test guard.

    Reuse _verify_completed in full, not verify_baseline (which forbids a later
    legitimate test claim). All four checkpoint/raw/worker/phase/resource links
    and the original completed claim are still verified. This is metadata/model
    hashing only; load_frozen's default never decodes reserved or dev pixels.
    """
    manifest_path, selection_path = _metadata_path(manifest_path), _metadata_path(selection_path)
    _require(selection_path.name == 'selection.json', 'Completed original selection required')
    selection = _sealed(selection_path)
    run = _sealed(selection_path.parent/'development.json')
    binding = run['binding']
    _record(binding['protocol'])
    completed.validate_original_protocol_paths(_json(binding['protocol']['path']), Path(binding['protocol']['path']).parent)
    _require(metadata_record(manifest_path) == binding['manifest'], 'Foreign development manifest')
    # Admit all legacy read targets before legacy hashing helpers can follow them.
    _require(isinstance(selection.get('all_fits'), list) and len(selection['all_fits']) == 4,
             'Four completed fits required')
    development.validate_fit_set(selection['all_fits'])
    for fit in selection['all_fits']:
        target = selection_path.parent/fit['fit_id']
        expected = provenance._local(target/'classifier.keras', datasets_only=True)
        _require(Path(fit.get('artifact', '')).absolute() == expected, 'Unsafe saved-model reference')
        for name in ('fit.json', 'worker-receipt.json', 'validation-predictions.json', 'history.json'):
            _metadata_path(target/name)
        _metadata_path(selection_path.parent/(fit['fit_id']+'.result.json'))
    for name in ('phase-receipt.json', 'development.result.json'):
        _metadata_path(selection_path.parent/name)
    _require(binding['code'] == development.code_bindings()
             and binding['environment'] == base.environment(), 'Changed original sources/environment')
    development.verify_binding(binding)
    data = development.load_frozen(manifest_path)
    _require(development.experiment_identity(data, binding) == run['key'], 'Changed development identity')
    completed._verify_completed(selection_path.parent, selection, run, data)
    validate_candidates(data['reserved_test_metadata'])
    proposal = _json(data['inputs']['proposal'])
    verification = _json(data['inputs']['independent_verification'])
    receipt = _json(Path(data['inputs']['intake_root'])/'selected/receipt.json')
    source = {r['capture_id']: r for r in proposal['selected_cardboard_query_metadata']}
    frozen = {r['capture_id']: r['split'] for r in data['rows']}
    references = []
    for entry in receipt['selected']:
        match = provenance.IMAGE.fullmatch(entry['path'])
        _require(match is not None and match.group(1) in source, 'Foreign known development crop')
        capture_id = match.group(1)
        references.append({'capture_id': capture_id, 'item_identifier': source[capture_id]['item_identifier'],
            'endpoint': frozen.get(capture_id), 'image_path': str(provenance._relative(entry['path'], Path(data['image_root']))),
            'image_sha256': entry['sha256'], 'decoded_sha256': entry['decoded_sha256'],
            'width': entry['width'], 'height': entry['height'], 'image_bytes': entry['bytes']})
    sample_path = provenance._relative(data['source_hashes']['source:query-sample.parquet']['path'], ROOT)
    samples = provenance._parquet(sample_path)
    sample_receipt_path = sample_path.parent.parent/'sample-acquisition.json'
    sample_receipt = _json(sample_receipt_path)
    _require(sample_receipt.get('publisher_sha256_match') is True
             and sample_receipt.get('archive_sha256') == '2ba43dec177611e9febb5fa82cf292bb3093506702ed1592315261d9e8597329'
             and sample_receipt.get('archive_bytes') == 525919493, 'Original sample acquisition required')
    sample_files = {r['name']: r for r in sample_receipt['files']}
    for row in samples:
        name = 'sample-data/'+row['query_crop']
        entry = sample_files[name]
        references.append({'capture_id': row['capture_id'], 'item_identifier': row['item_identifier'],
            'endpoint': 'old100', 'image_path': str(provenance._relative(name, sample_path.parent.parent)),
            'image_sha256': entry['sha256'], 'image_bytes': entry['bytes']})
    _require(len(receipt['selected']) == 865 and len(samples) == 100
             and len({r['capture_id'] for r in references}) == 965, 'Complete 865 plus old100 references required')
    known_edges = []
    for edge in verification['near_cross_item_candidates_dhash_le4']:
        known_edges.append({'a': edge['a'], 'b': edge['b'], 'reason': 'known_dhash4'})
    for edge in verification['old_sample_near_candidates_dhash_le4']:
        known_edges.append({'a': edge['new'], 'b': edge['old'], 'reason': 'known_dhash4'})
    return {'data': data, 'selection': selection, 'archive': copy.deepcopy(data['archive']),
            'archive_path': receipt['archive'], 'archive_identity': receipt['archive_identity_after'],
            'archive_paths': receipt['regular_paths'], 'reference_rows': sorted(references, key=lambda r: r['capture_id']),
            'known_edges': sorted(known_edges, key=lambda e: (e['a'], e['b'])),
            'reference_sources': {'sample_receipt': metadata_record(sample_receipt_path),
                'verification': metadata_record(data['inputs']['independent_verification'])}}


def _core_context(manifest, selection, binding):
    provenance._validate_research_roots()
    _metadata_path(manifest); _metadata_path(selection)
    _require(isinstance(binding, dict) and isinstance(binding.get('core'), dict), 'Evaluation binding required')
    core = binding['core']
    _require(set(core) == {'development_key', 'manifest', 'selection', 'protocol', 'policy', 'policy_sha256',
                          'candidates_sha256', 'sources', 'environment'}, 'Complete fixed evaluation core required')
    _require(isinstance(core['development_key'], str) and HEX.fullmatch(core['development_key']), 'Invalid development key')
    _require(core['policy_sha256'] == POLICY_SHA256 and base.digest(core['policy']) == POLICY_SHA256,
             'Entire frozen internal-test policy required')
    _require(metadata_record(manifest) == core['manifest'] and metadata_record(selection) == core['selection'],
             'Changed manifest/selection binding')
    protocol = _json(_record(core['protocol']))
    _require(protocol.get('policy') == core['policy'] and protocol.get('policy_sha256') == POLICY_SHA256
             and protocol.get('sources') == core['sources'] and protocol.get('environment') == core['environment']
             and protocol.get('resources', {}).get('reference') == vars(reference_limits())
             and protocol.get('resources', {}).get('acquire') == vars(acquisition_limits()), 'Changed prospective protocol')
    _require(core['environment'] == base.environment(), 'Changed package environment')
    sources = core['sources']
    _require(isinstance(sources, dict) and set(CODE_FILES) <= sources.keys(), 'All reused/new sources required')
    for name, sha in sources.items():
        _require(isinstance(name, str) and re.fullmatch('[a-z][a-z0-9_]*[.]py', name)
                 and isinstance(sha, str) and HEX.fullmatch(sha), 'Unsafe evaluation source reference')
        _require(runtime.sha256_file(Path(__file__).parent/name) == sha, 'Changed evaluation source')
    context = _development_context(manifest, selection)
    rows = validate_candidates(context['data']['reserved_test_metadata'])
    _require(context['selection']['development_key'] == core['development_key']
             and base.digest(rows) == core['candidates_sha256'], 'Changed candidate identity')
    return context


def _claim(binding, *, active=True):
    core = binding['core']; key = core['development_key']
    canonical = provenance._local(ROOT/'research/datasets/kaputt-crop-test-registry'/('test-'+key), datasets_only=True)
    historical = provenance._local(ROOT/'research/datasets/kaputt-crop-run-registry'/('test-'+key), datasets_only=True)
    _require(not historical.exists(), 'Historical test claim exists; alternate claim forbidden')
    _require(provenance._local(binding.get('claim', ''), datasets_only=True) == canonical and canonical.is_dir(),
             'Matching canonical durable test claim required')
    _require(not (canonical/'failed.json').exists(), 'Failed test claim is terminal')
    _require(not active or not (canonical/'completed.json').exists(), 'Completed test claim cannot acquire/read again')
    started = _json(canonical/'started.json')
    _require(set(started) == {'key', 'phase', 'output', 'binding_sha256'}
             and started['key'] == key and started['phase'] == 'test'
             and started['binding_sha256'] == base.digest(core), 'Forged/changed started test claim')
    out = provenance._local(started['output'], datasets_only=True)
    run_path = _record(binding['test_run'])
    _require(run_path == out/'test-run.json', 'Claim output/test-run mismatch')
    run = _sealed(run_path)
    _require(run.get('status') == 'claimed' and run.get('development_key') == key
             and run.get('claim') == str(canonical) and run.get('binding') == core,
             'Changed sealed test-run provenance')
    for name in ('reference_index', 'reference_resource'):
        _require(run.get(name) == binding.get(name), 'Test-run must bind exact reference/resource artifacts')
    command = run.get('acquisition_command')
    expected_source = ROOT/'research/kaputt_crop_evaluate.py'
    _require(isinstance(command, list) and len(command) >= 3
             and all(isinstance(value, str) and value for value in command)
             and Path(command[0]).absolute() == Path(sys.executable).absolute()
             and Path(command[1]).absolute() == expected_source and command[2] == '_acquire',
             'Exact prospective acquisition command required')
    return out


def _fingerprint_file(path, *, minimum=True):
    """Guard header allocation; un-oriented BGR fingerprints, one array at a time."""
    path = provenance._local(path, datasets_only=True)
    size = path.stat().st_size
    if not 0 < size <= 16*MiB:
        return None, ['encoded_bytes']
    try:
        width, height = low._jpeg_dimensions(path)
        if width <= 0 or height <= 0 or width*height > 16_000_000:
            return None, ['maximum_pixels']
        if minimum and min(width, height) < 64:
            return None, ['minimum_side']
        with path.open('rb') as stream:
            stream.seek(-2, 2)
            if stream.read() != b'\xff\xd9':
                return None, ['jpeg_eoi']
    except (low.IntakeError, OSError, ValueError):
        return None, ['invalid_jpeg']
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    raw = path.read_bytes()
    original = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
    if original is None or original.shape != (height, width, 3):
        return None, ['jpeg_decode']
    gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
    bits = np.packbits(small[:, 1:] > small[:, :-1]).tobytes()
    result = {'width': width, 'height': height, 'image_bytes': size,
        'image_sha256': hashlib.sha256(raw).hexdigest(),
        'decoded_sha256': hashlib.sha256(original.tobytes()).hexdigest(),
        'dhash64': f'{int.from_bytes(bits, "big"):016x}'}
    del original, gray, small, raw
    return result, []


def reference_payload(context, core, rows):
    return {'schema_version': 1, 'status': 'complete', 'profile': PROFILE,
            'graph_version': GRAPH_VERSION, 'core_sha256': base.digest(core),
            'metadata_sha256': base.digest(context['reference_rows']),
            'sources': context['reference_sources'], 'known_edges': context['known_edges'], 'rows': rows}


def _worker_provenance(limits):
    return {'job': os.environ.get('IILAS_RUNNER_JOB'), 'pid': os.getpid(),
            'command': [sys.executable, *sys.argv], 'limits': vars(limits)}


def _verify_worker(worker, command, limits):
    _require(isinstance(worker, dict) and set(worker) == {'job', 'pid', 'command', 'limits'}
             and isinstance(worker['job'], str) and worker['job'].startswith('Local\\IILASNativeRunner-')
             and type(worker['pid']) is int and worker['pid'] > 0
             and worker['command'] == command and worker['limits'] == vars(limits),
             'Named worker Job/command/limits provenance required')


def _reference_command(core):
    command = _json(core['protocol']['path']).get('reference_command')
    _require(isinstance(command, list) and len(command) >= 3
             and all(isinstance(value, str) and value for value in command)
             and Path(command[0]).absolute() == Path(sys.executable).absolute()
             and Path(command[1]).absolute() == ROOT/'research/kaputt_crop_evaluate.py'
             and command[2] == '_reference', 'Exact prospective reference command required')
    return command


def build_reference_index(development_manifest, selection_path, destination, evaluation_binding):
    """Supervised already-seen reference pass; no TEST claim or TEST pixel access."""
    runtime.require_supervised_worker()
    context = _core_context(development_manifest, selection_path, evaluation_binding)
    reference_command = _reference_command(evaluation_binding['core'])
    _verify_worker(_worker_provenance(reference_limits()), reference_command, reference_limits())
    destination = runtime.create_run_directory(destination)
    base.worker_environment(destination)
    limits = low.IntakeLimits(max_wall_seconds=180, max_output_bytes=512*MiB,
        min_available_bytes=3072*MiB, available_floor_bytes=768*MiB)
    resources = low._Resources(destination, limits)
    rows = []
    for expected in context['reference_rows']:
        resources.check(force=True)
        path = provenance._local(expected['image_path'], datasets_only=True)
        # Old sample crops can be smaller than 64: they are relay/endpoints,
        # never technical admissions for fitting/scoring in this new profile.
        actual, reasons = _fingerprint_file(path, minimum=False)
        _require(not reasons, 'Known reference unreadable; fail reference pass')
        for name in ('image_sha256', 'decoded_sha256', 'width', 'height', 'image_bytes'):
            _require(name not in expected or actual[name] == expected[name], 'Changed known reference pixels')
        rows.append(dict(expected, **actual))
    _core_context(development_manifest, selection_path, evaluation_binding)
    payload = reference_payload(context, evaluation_binding['core'], rows)
    payload['worker'] = _worker_provenance(reference_limits())
    _verify_worker(payload['worker'], reference_command, reference_limits())
    path = destination/'reference-index.json'
    base.write_sealed(path, payload)
    resources.check(force=True)
    return path


def _reference(context, binding):
    path = _record(binding['reference_index'])
    _record(binding['reference_resource'])
    completed.verify_resource(binding['reference_resource']['path'], reference_limits())
    doc = _sealed(path)
    expected = reference_payload(context, binding['core'], doc.get('rows'))
    expected['worker'] = doc.get('worker')
    _require(doc == expected, 'Changed reference-index provenance/known edges')
    _require(Path(binding['reference_resource']['path']) == path.parent.parent/'reference.result.json',
             'Reference resource result must match reference worker output')
    _verify_worker(doc.get('worker'), _reference_command(binding['core']), reference_limits())
    for record in doc['sources'].values():
        _record(record)
    rows = doc['rows']
    _require(isinstance(rows, list) and len(rows) == len(context['reference_rows']), 'Complete reference index required')
    for metadata, row in zip(context['reference_rows'], rows):
        _require(isinstance(row, dict) and all(row.get(k) == v for k, v in metadata.items()),
                 'Changed/foreign reference node')
        _validate_fingerprint(row, minimum=False)
    # Successful named supervision is bound through the worker's sealed output
    # and exact native result hash. A success result without this index is useless.
    return doc


def _validate_fingerprint(row, *, minimum=True):
    _require(all(isinstance(row.get(k), str) and HEX.fullmatch(row[k])
                 for k in ('image_sha256', 'decoded_sha256'))
             and isinstance(row.get('dhash64'), str) and re.fullmatch('[0-9a-f]{16}', row['dhash64'])
             and all(type(row.get(k)) is int and row[k] > 0 for k in ('width', 'height', 'image_bytes'))
             and row['width']*row['height'] <= 16_000_000 and row['image_bytes'] <= 16*MiB
             and (not minimum or min(row['width'], row['height']) >= 64), 'Invalid fingerprint metadata')


def resolve_graph(audits, references, known_edges):
    """Metadata-only full closure. Every known reference edge remains a relay."""
    candidates = sorted(audits, key=lambda r: r['capture_id'])
    nodes = {}
    for row in [*references, *candidates]:
        capture_id = row['capture_id']
        _require(capture_id not in nodes, 'Duplicate graph capture')
        nodes[capture_id] = row
    parent = {key: key for key in nodes}
    def find(key):
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key
    edges = set()
    def link(a, b, reason):
        _require(a in parent and b in parent and a != b, 'Invalid graph edge')
        a, b = sorted((a, b))
        edges.add((a, b, reason))
        left, right = find(a), find(b)
        parent[max(left, right)] = min(left, right)
    for edge in known_edges:
        link(edge['a'], edge['b'], edge['reason'])
    by_item = defaultdict(list)
    for key, row in nodes.items():
        by_item[row['item_identifier']].append(key)
    for group in by_item.values():
        ordered = sorted(group)
        for capture_id in ordered[1:]:
            link(ordered[0], capture_id, 'same_source_item')
    valid = {}
    for row in references:
        _validate_fingerprint(row, minimum=False)
        _require(row.get('endpoint') in (None, 'train', 'validation', 'old100'), 'Foreign reference endpoint')
        valid[row['capture_id']] = row
    test_ids = {r['capture_id'] for r in candidates}
    for row in candidates:
        _require(isinstance(row.get('technical_reasons'), list), 'Technical audit required')
        if row.get('fingerprint') is not None:
            _validate_fingerprint(row['fingerprint'])
            valid[row['capture_id']] = row['fingerprint']
        else:
            _require(bool(row['technical_reasons']), 'Missing valid fingerprint without technical reason')
    keys = sorted(valid)
    for index, a in enumerate(keys):
        for b in keys[index+1:]:
            # Reference-reference relations are retained and also recomputed:
            # excluded reference relays must not disappear between experiments.
            first, second = valid[a], valid[b]
            if first['image_sha256'] == second['image_sha256']:
                link(a, b, 'encoded_sha256')
            if first['decoded_sha256'] == second['decoded_sha256']:
                link(a, b, 'decoded_sha256')
            if (int(first['dhash64'], 16) ^ int(second['dhash64'], 16)).bit_count() <= 4:
                link(a, b, 'dhash4')
    groups = defaultdict(list)
    for key in sorted(nodes):
        groups[find(key)].append(key)
    dispositions = []
    components = []
    for group in sorted(groups.values()):
        group_tests = sorted(set(group) & test_ids)
        if not group_tests:
            continue
        items = sorted({nodes[key]['item_identifier'] for key in group})
        component = 'kaputt:test-dependency:'+base.digest(items)
        endpoints = sorted(key for key in group if nodes[key].get('endpoint') is not None)
        failures = sorted(key for key in group_tests if nodes[key]['technical_reasons'])
        reasons = sorted({'touches_'+nodes[key]['endpoint'] for key in endpoints}
                         | ({'technical_failure'} if failures else set()))
        components.append({'dependency_group_id': component, 'capture_ids': group, 'source_items': items,
                           'test_capture_ids': group_tests, 'prohibited_endpoints': endpoints,
                           'technical_failures': failures, 'reasons': reasons})
        for key in group_tests:
            dispositions.append({'capture_id': key, 'dependency_group_id': component,
                'disposition': 'excluded' if reasons else 'included', 'reasons': reasons,
                'prohibited_endpoints': endpoints, 'technical_failures': failures})
    return {'edges': [{'a': a, 'b': b, 'reason': reason} for a, b, reason in sorted(edges)],
            'components': components, 'dispositions': sorted(dispositions, key=lambda r: r['capture_id'])}


def _stage_archive(archive, destination, context, rows, limits):
    """Strict full compressed/tar audit; stage only exact 147 TRAIN allowlist.

    No selected JPEG is decoded until gzip CRC, full hash/length, every tar
    header and complete member set succeed. Invalid JPEGs are later technical
    exclusions; archive corruption/foreign/missing members are attempt failures.
    """
    archive = Path(archive)
    low._safe_ancestors(archive)
    before = low._identity(archive.stat())
    expected = context['archive']
    _require(archive.is_file() and before['bytes'] == expected['bytes'], 'Source archive length changed')
    if 'archive_path' in context:
        _require(archive.absolute() == Path(context['archive_path']).absolute()
                 and before == context['archive_identity'], 'Original verified archive identity required')
    resources = low._Resources(destination, limits)
    selected = {row['query_crop'] for row in rows}
    names, seen, entries = set(), set(), []
    allowed_names = set(context['archive_paths'])
    output_bytes = 0
    members = 0
    with archive.open('rb') as source:
        _require(low._identity(os.fstat(source.fileno())) == before, 'Archive replaced before stream')
        compressed = low._HashedReader(source, resources, expected['bytes'])
        with gzip.GzipFile(fileobj=compressed, mode='rb') as gz:
            stream = low._InflatedReader(gz, resources, limits)
            while True:
                header = stream.exact(512)
                if header == bytes(512):
                    _require(stream.exact(512) == bytes(512), 'Two tar ending blocks required')
                    trailer = 0
                    while True:
                        block = stream.read(min(low.CHUNK, limits.max_trailer_bytes-trailer+1))
                        if not block:
                            break
                        trailer += len(block)
                        _require(trailer <= limits.max_trailer_bytes and not any(block), 'Nonzero/excess tar trailer')
                    break
                info = tarfile.TarInfo.frombuf(header, encoding='ascii', errors='strict')
                for field in (header[:100], header[345:500]):
                    _require(b'\0' not in field or not any(field.split(b'\0', 1)[1]), 'Nonzero tar name padding')
                _require(info.type in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE)
                         and not info.linkname and not info.sparse, 'Unsupported tar/link/sparse header')
                name = info.name[:-1] if info.isdir() and info.name.endswith('/') else info.name
                low._canonical(name)
                _require(name.casefold() not in seen, 'Duplicate/case-alias tar member')
                seen.add(name.casefold()); members += 1
                _require(members <= limits.max_members, 'Archive member cap')
                if info.isdir():
                    _require(name in low.DIRECTORIES and info.size == 0, 'Foreign archive directory')
                    continue
                _require(low.FILE.fullmatch(name) and 0 < info.size <= limits.max_file_bytes
                         and not info.mode & 0o111, 'Foreign/oversize/executable archive member')
                names.add(name)
                _require(len(names) <= limits.max_regular_files and name in allowed_names, 'Foreign archive metadata member')
                keep = name in selected
                target = provenance._relative(name, destination/'staged') if keep else None
                digest = hashlib.sha256()
                out = None
                if keep:
                    _require(output_bytes+info.size <= limits.max_output_bytes, 'Staged output cap')
                    target.parent.mkdir(parents=True, exist_ok=True)
                    low._safe_ancestors(target)
                    out = target.open('xb')
                try:
                    remaining = info.size
                    while remaining:
                        block = stream.exact(min(remaining, low.CHUNK)); remaining -= len(block)
                        if out:
                            out.write(block); digest.update(block)
                    if out:
                        out.flush(); os.fsync(out.fileno())
                finally:
                    if out:
                        out.close()
                _require(not any(stream.exact((-info.size) % 512)), 'Nonzero tar member padding')
                if keep:
                    output_bytes += info.size
                    entries.append({'path': name, 'image_bytes': info.size, 'image_sha256': digest.hexdigest()})
        _require(compressed.count == expected['bytes'] and compressed.digest.hexdigest() == expected['sha256'],
                 'Corrupt or changed compressed source archive')
        after = low._identity(os.fstat(source.fileno()))
    _require(before == after == low._identity(archive.stat()), 'Archive changed during acquisition')
    _require(names == set(context['archive_paths']) and {e['path'] for e in entries} == selected,
             'Missing/foreign archive member; acquisition incomplete')
    return {'status': 'complete', 'archive': str(archive.absolute()), 'archive_identity_before': before,
            'archive_identity_after': after, 'archive_sha256': expected['sha256'], 'archive_bytes': expected['bytes'],
            'regular_paths_sha256': base.digest(sorted(names)), 'regular_files': len(names),
            'members': members, 'retained_bytes': output_bytes, 'selected': sorted(entries, key=lambda e: e['path']),
            'limits': vars(limits), 'elapsed_seconds': time.monotonic()-resources.started,
            'peak_rss_bytes': resources.peak_rss}


def _statistics(audits, graph):
    lookup = {r['capture_id']: r for r in graph['dispositions']}
    result = {}
    for category in ('candidates', 'included', 'excluded'):
        selected = [r for r in audits if category == 'candidates' or lookup[r['capture_id']]['disposition'] == category]
        groups = defaultdict(set)
        for row in selected:
            groups[lookup[row['capture_id']]['dependency_group_id']].add('Damaged' if row['defect'] else 'Normal')
        result[category] = {'images': len(selected), 'source_items': len({r['item_identifier'] for r in selected}),
            'dependency_components': len(groups), 'labels': dict(sorted(Counter('Damaged' if r['defect'] else 'Normal' for r in selected).items())),
            'materials': dict(sorted(Counter(r['item_material'] for r in selected).items())),
            'mixed_label_components': sum(len(labels) > 1 for labels in groups.values())}
    result['exclusion_reasons'] = {reason: {'images': len([r for r in audits if reason in lookup[r['capture_id']]['reasons']]),
        'labels': dict(Counter('Damaged' if r['defect'] else 'Normal' for r in audits if reason in lookup[r['capture_id']]['reasons'])),
        'materials': dict(Counter(r['item_material'] for r in audits if reason in lookup[r['capture_id']]['reasons']))}
        for reason in sorted({reason for row in lookup.values() for reason in row['reasons']})}
    return result


def _admitted_rows(audits, graph):
    dispositions = {r['capture_id']: r for r in graph['dispositions']}
    result = []
    for audit in audits:
        item = dispositions[audit['capture_id']]
        if item['disposition'] == 'included':
            result.append({'sample_id': 'kaputt:'+audit['capture_id'], 'capture_id': audit['capture_id'],
                'item_identifier': audit['item_identifier'], 'dependency_group_id': item['dependency_group_id'],
                'label': 'Damaged' if audit['defect'] else 'Normal', 'publisher_defect': audit['defect'],
                'publisher_metadata': audit['publisher_metadata'], 'official_split': 'train', 'split': 'internal_test',
                'input_scope': 'crop_only', 'role': 'query_crop', 'image_path': 'staged/'+audit['query_crop'],
                **audit['fingerprint']})
    return result


def build_test_admission(development_manifest, selection_path, archive_path, destination, evaluation_binding):
    runtime.require_supervised_worker()
    context = _core_context(development_manifest, selection_path, evaluation_binding)
    out = _claim(evaluation_binding)
    _verify_worker(_worker_provenance(acquisition_limits()),
                   _sealed(evaluation_binding['test_run']['path'])['acquisition_command'], acquisition_limits())
    reference = _reference(context, evaluation_binding)
    destination = provenance._local(destination, datasets_only=True)
    _require(destination.is_relative_to(out) and destination != out, 'Admission must remain below claimed attempt output')
    # A partial/failed worker cannot restart under a renamed destination while
    # its parent is still recording terminal failure. Never remove this marker.
    acquire_marker = Path(evaluation_binding['claim'])/'acquisition-started.json'
    _require(not acquire_marker.exists(), 'Acquisition already started; replacement attempt forbidden')
    destination = runtime.create_run_directory(destination)
    try:
        runtime.write_json_exclusive(acquire_marker, {'core_sha256': base.digest(evaluation_binding['core']),
            'test_run': evaluation_binding['test_run'], 'destination': str(destination)})
        base.worker_environment(destination)
        candidates = context['data']['reserved_test_metadata']
        limits = _intake_limits()
        receipt = _stage_archive(archive_path, destination, context, candidates, limits)
        entries = {r['path']: r for r in receipt['selected']}
        resources = low._Resources(destination, limits)
        audits = []
        for row in candidates:
            resources.check(force=True)
            path = provenance._relative(row['query_crop'], destination/'staged')
            # Byte identity is required even for technically excluded staging.
            _require(path.stat().st_size == entries[row['query_crop']]['image_bytes']
                     and runtime.sha256_file(path) == entries[row['query_crop']]['image_sha256'], 'Staged crop changed')
            fingerprint, reasons = _fingerprint_file(path)
            audits.append(dict(row, publisher_metadata=copy.deepcopy(row), fingerprint=fingerprint,
                               technical_reasons=reasons))
        graph = resolve_graph(audits, reference['rows'], reference['known_edges'])
        _core_context(development_manifest, selection_path, evaluation_binding)
        _claim(evaluation_binding); _reference(context, evaluation_binding)
        payload = {'schema_version': 1, 'profile': PROFILE, 'evaluation_scope': 'development_only',
            'input_scope': 'crop_only', 'operationally_approved': False, 'label_basis': 'publisher_defect_annotation',
            'status': 'complete', 'technical_admission': 'complete', 'dependency_admission': 'complete',
            'worker': _worker_provenance(acquisition_limits()),
            'graph_version': GRAPH_VERSION, 'binding': copy.deepcopy(evaluation_binding),
            'archive_receipt': receipt, 'candidate_metadata': copy.deepcopy(candidates), 'audits': audits,
            **graph, 'rows': _admitted_rows(audits, graph), 'statistics': _statistics(audits, graph)}
        _require(sum(r['image_bytes'] for r in receipt['selected'])+len(json.dumps(payload).encode()) <= limits.max_output_bytes,
                 'Receipt-inclusive output cap')
        resources.check(force=True)
        path = destination/'manifest.json'
        base.write_sealed(path, payload)
        return path
    except Exception as error:
        runtime.write_json_exclusive(destination/'FAILED.json', {'status': 'failed', 'reason': str(error),
                                                               'partial_outputs_admitted': False})
        raise


def _load_staged(path):
    """Private metadata reconstruction, usable before the native worker exits."""
    provenance._validate_research_roots()
    path = _metadata_path(path)
    doc = _sealed(path)
    _require(doc.get('schema_version') == 1 and type(doc['schema_version']) is int
             and doc.get('profile') == PROFILE and doc.get('evaluation_scope') == 'development_only'
             and doc.get('input_scope') == 'crop_only' and doc.get('operationally_approved') is False
             and doc.get('status') == doc.get('technical_admission') == doc.get('dependency_admission') == 'complete'
             and doc.get('graph_version') == GRAPH_VERSION and doc.get('label_basis') == 'publisher_defect_annotation',
             'Complete closed crop-only test admission required')
    binding = doc['binding']; core = binding['core']
    context = _core_context(core['manifest']['path'], core['selection']['path'], binding)
    out = _claim(binding, active=False)
    _require(path.name == 'manifest.json' and path.is_relative_to(out) and not (path.parent/'FAILED.json').exists(),
             'Foreign/failed admission path')
    marker = _json(Path(binding['claim'])/'acquisition-started.json')
    _require(marker == {'core_sha256': base.digest(core), 'test_run': binding['test_run'], 'destination': str(path.parent)},
             'Changed exclusive acquisition marker')
    reference = _reference(context, binding)
    candidates = context['data']['reserved_test_metadata']
    _require(doc['candidate_metadata'] == candidates and len(doc['audits']) == 147, 'Changed/incomplete candidate dispositions')
    receipt = doc['archive_receipt']
    _require(receipt.get('status') == 'complete' and receipt.get('archive_sha256') == context['archive']['sha256']
             and receipt.get('archive_bytes') == context['archive']['bytes']
             and receipt.get('regular_files') == len(context['archive_paths'])
             and receipt.get('regular_paths_sha256') == base.digest(sorted(context['archive_paths']))
             and receipt.get('archive_identity_before') == receipt.get('archive_identity_after')
             and receipt.get('limits') == vars(_intake_limits())
             and type(receipt.get('members')) is int and 0 < receipt['members'] <= _intake_limits().max_members
             and type(receipt.get('elapsed_seconds')) in (int, float) and 0 <= receipt['elapsed_seconds'] <= 1800
             and type(receipt.get('peak_rss_bytes')) is int and 0 <= receipt['peak_rss_bytes'] <= 512*MiB
             and len(receipt.get('selected', [])) == 147, 'Invalid strict acquisition receipt')
    if 'archive_identity' in context:
        _require(receipt['archive_identity_after'] == context['archive_identity']
                 and receipt['archive'] == context['archive_path'], 'Changed original archive identity')
    entries = {r['path']: r for r in receipt['selected']}
    _require(len(entries) == 147 and set(entries) == {r['query_crop'] for r in candidates}
             and receipt['retained_bytes'] == sum(e['image_bytes'] for e in entries.values()), 'Acquisition completeness changed')
    for entry in entries.values():
        _require(set(entry) == {'path', 'image_bytes', 'image_sha256'}
                 and type(entry['image_bytes']) is int and 0 < entry['image_bytes'] <= 16*MiB
                 and isinstance(entry['image_sha256'], str) and HEX.fullmatch(entry['image_sha256']),
                 'Invalid staged byte receipt')
    for row, audit in zip(candidates, doc['audits']):
        _require(audit.get('publisher_metadata') == row and all(audit.get(k) == v for k, v in row.items()),
                 'Altered source label/material/provenance')
        _require(set(audit) == set(row) | {'publisher_metadata', 'fingerprint', 'technical_reasons'}, 'Foreign technical-audit field')
        _require(isinstance(audit['technical_reasons'], list)
                 and set(audit['technical_reasons']) <= {'encoded_bytes', 'minimum_side', 'maximum_pixels',
                                                       'jpeg_eoi', 'invalid_jpeg', 'jpeg_decode'}, 'Foreign technical exclusion')
        if audit['fingerprint'] is not None:
            _require(not audit['technical_reasons'], 'Valid fingerprint cannot conceal technical failure')
            _validate_fingerprint(audit['fingerprint'])
            _require(audit['fingerprint']['image_sha256'] == entries[row['query_crop']]['image_sha256']
                     and audit['fingerprint']['image_bytes'] == entries[row['query_crop']]['image_bytes'], 'Changed staged fingerprint')
    graph = resolve_graph(doc['audits'], reference['rows'], reference['known_edges'])
    _require(all(doc.get(k) == v for k, v in graph.items())
             and doc.get('statistics') == _statistics(doc['audits'], graph)
             and doc.get('rows') == _admitted_rows(doc['audits'], graph), 'Changed admission graph/labels/dispositions')
    for row in doc['rows']:
        provenance._relative(row['image_path'], path.parent)  # containment only; no image reads/stat
    return doc


def _completion_payload(path, doc, result_path):
    out = _claim(doc['binding'], active=False)
    result_path = _metadata_path(result_path)
    _require(result_path == out/'acquire.result.json', 'Expected same-attempt acquisition resource result required')
    completed.verify_resource(result_path, acquisition_limits())
    worker = doc.get('worker', {})
    run = _sealed(doc['binding']['test_run']['path'])
    _verify_worker(worker, run['acquisition_command'], acquisition_limits())
    return {'schema_version': 1, 'status': 'complete', 'profile': PROFILE,
            'manifest': metadata_record(path), 'resource': metadata_record(result_path),
            'claim': doc['binding']['claim'], 'test_run': doc['binding']['test_run'],
            'acquisition_started': metadata_record(Path(doc['binding']['claim'])/'acquisition-started.json'),
            'core_sha256': base.digest(doc['binding']['core']), 'worker': worker}


def seal_successful_acquisition(manifest, native_result):
    """Controller-only post-exit completion; no image reads or worker reruns.

    Call once after ResourceSupervisor.run(..., fit_id='acquire') is TERMINAL
    success. Staged manifests/partial successful-worker output alone never admit
    a cohort. The sidecar is exclusive and does not create a circular hash.
    """
    path = _metadata_path(manifest)
    doc = _load_staged(path)
    _claim(doc['binding'])
    payload = _completion_payload(path, doc, native_result)
    target = path.parent/'admission-completion.json'
    base.write_sealed(target, payload)
    return target


def load_test_admission(path, verify_images=False):
    """Validate complete post-worker admission; no image bytes by default."""
    path = _metadata_path(path)
    doc = _load_staged(path)
    completion = _sealed(path.parent/'admission-completion.json')
    _require(completion == _completion_payload(path, doc, completion.get('resource', {}).get('path', '')),
             'Changed complete acquisition/resource/manifest binding')
    if verify_images:
        runtime.require_supervised_worker()
        _claim(doc['binding'])
        for row in doc['rows']:
            _read_exact(path, row)
    return doc


def _read_exact(admission_path, row):
    path = provenance._relative(row['image_path'], Path(admission_path).parent)
    actual, reasons = _fingerprint_file(path)
    _require(not reasons and actual == {key: row[key] for key in actual}, 'Admitted crop bytes/pixels changed')
    from parcel_inputs import decode_rgb
    raw = path.read_bytes()
    _require(len(raw) == row['image_bytes'] and hashlib.sha256(raw).hexdigest() == row['image_sha256'],
             'Admitted bytes changed before classifier decode')
    return decode_rgb(raw)


def read_admitted_image(admission_path, row):
    """Exact admitted row only; validate every metadata association before bytes."""
    runtime.require_supervised_worker()
    doc = load_test_admission(admission_path)
    _claim(doc['binding'])
    matches = [value for value in doc['rows'] if value['sample_id'] == row.get('sample_id')]
    _require(len(matches) == 1 and matches[0] == row, 'Foreign/non-admitted/altered sample rejected before pixels')
    return _read_exact(admission_path, row)


class _AdmittedReader:
    """One-worker validated metadata snapshot; one uncached image at a time."""
    def __init__(self, path):
        runtime.require_supervised_worker()
        self._path = _metadata_path(path)
        self._doc = load_test_admission(self._path)
        _claim(self._doc['binding'])
        self._pid = os.getpid()
        self._job = os.environ.get('IILAS_RUNNER_JOB')
        self._rows = {r['sample_id']: copy.deepcopy(r) for r in self._doc['rows']}
        self._identities = {}
        def remember(path, *, code=False, artifact=False, archive=False):
            if code:
                safe = Path(path)
                low._safe_ancestors(safe)
            elif archive:
                # The preserved 31.6 GB original is outside the dataset tree.
                # It was already matched to the completed intake's exact path
                # and stable native identity by _load_staged. Watch that source
                # in place; never copy it or turn its location into pixel access.
                safe = Path(path)
                _require(safe.is_absolute() and '..' not in safe.parts and safe.name.endswith('.tar.gz'),
                         'Exact absolute original source archive required')
                low._safe_ancestors(safe)
            elif artifact:
                safe = provenance._local(path, datasets_only=True)
                _require(safe.suffix in ('.h5', '.keras', '.parquet') or safe.name == 'LICENSE', 'Unsafe snapshot artifact')
            else:
                safe = _metadata_path(path)
            self._identities[str(safe)] = low._identity(safe.stat())
        remember(self._path)
        remember(self._path.parent/'admission-completion.json')
        completion = _sealed(self._path.parent/'admission-completion.json')
        remember(completion['resource']['path'])
        binding = self._doc['binding']; core = binding['core']
        for name in ('manifest', 'selection', 'protocol'):
            remember(core[name]['path'])
        for name in ('test_run', 'reference_index', 'reference_resource'):
            remember(binding[name]['path'])
        reference = _sealed(binding['reference_index']['path'])
        for record in reference['sources'].values():
            remember(record['path'])
        remember(self._doc['archive_receipt']['archive'], archive=True)
        _require(self._identities[self._doc['archive_receipt']['archive']]
                 == self._doc['archive_receipt']['archive_identity_after'], 'Source archive changed before admitted stream')
        remember(Path(binding['claim'])/'started.json')
        remember(Path(binding['claim'])/'acquisition-started.json')
        for name in core['sources']:
            remember(Path(__file__).parent/name, code=True)
        for path, kind in _original_stream_dependencies(core):
            remember(path, code=kind == 'code', artifact=kind == 'artifact')

    @property
    def rows(self):
        return copy.deepcopy(list(self._rows.values()))

    def _stable(self):
        runtime.require_supervised_worker()
        _require(os.getpid() == self._pid and os.environ.get('IILAS_RUNNER_JOB') == self._job,
                 'Reader belongs to a different native worker')
        _claim(self._doc['binding'])
        for path, expected in self._identities.items():
            low._safe_ancestors(path)
            _require(low._identity(Path(path).stat()) == expected, 'Bound artifact changed during admitted stream')

    def read(self, row):
        _require(isinstance(row, dict) and row.get('sample_id') in self._rows
                 and row == self._rows[row['sample_id']], 'Foreign/non-admitted/altered sample rejected before pixels')
        self._stable()
        return _read_exact(self._path, row)

    def verify(self):
        """Mandatory final full binding/graph verification before raw completion."""
        self._stable()
        _require(load_test_admission(self._path) == self._doc, 'Changed admission at stream completion')
        return metadata_record(self._path)


def open_admitted_reader(admission_path):
    return _AdmittedReader(admission_path)


def _original_stream_dependencies(core):
    """Stat-only watch list after full original-experiment validation."""
    result = []
    data = _json(core['manifest']['path'])
    for record in data['source_hashes'].values():
        source = provenance._relative(record['path'], ROOT)
        result.append((source, 'metadata' if source.suffix == '.json' else 'artifact'))
    selection = _sealed(core['selection']['path'])
    root = Path(core['selection']['path']).parent
    for name in ('development.json', 'phase-receipt.json', 'development.result.json'):
        result.append((root/name, 'metadata'))
    development_run = _sealed(root/'development.json')
    for name in ('started.json', 'completed.json'):
        result.append((Path(development_run['claim'])/name, 'metadata'))
    for fit in selection['all_fits']:
        target = root/fit['fit_id']
        result.append((target/'classifier.keras', 'artifact'))
        for name in ('fit.json', 'worker-receipt.json', 'validation-predictions.json', 'history.json'):
            result.append((target/name, 'metadata'))
        result.append((root/(fit['fit_id']+'.result.json'), 'metadata'))
    original = selection['binding']
    result.append((original['protocol']['path'], 'metadata'))
    for row in original['settings']['weights'].values():
        result.append((row['path'], 'artifact'))
    for row in original['settings']['weight_proofs']:
        result.append((row['path'], 'code' if Path(row['path']).suffix == '.md' else 'metadata'))
    return result
