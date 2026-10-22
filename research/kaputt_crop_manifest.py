"""Separate, frozen, crop-only Kaputt development provenance.

This schema does not admit models for IILAS serving. Labels are publisher
packaging-defect annotations, and dependency components are conservative
statistical units, not confirmed physical parcels. Metadata validation hashes
metadata only; optional pixel verification is restricted to retained TRAIN
development crops. Reserved test metadata never grants pixel access.
"""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import subprocess
import sys

from runner_runtime import write_json_exclusive

BASE = Path(__file__).resolve().parents[1]
PROFILE = 'kaputt_crop_development'
ARCHIVE_BYTES = 31_564_000_506
ARCHIVE_SHA256 = 'de3fe46bac181ec1a369bd957e56d8c6f595669fc3f5c8df42ca12434995ccc1'
IMAGE = re.compile(r'data/train/query-data/crop/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]jpg\Z')


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _local(path, *, datasets_only=False):
    raw = Path(path)
    _require('..' not in raw.parts, 'Parent path traversal forbidden')
    absolute = raw.absolute()
    for node in (absolute, *absolute.parents):
        _require(not node.is_symlink() and not (hasattr(node, 'is_junction') and node.is_junction()),
                 'Link/junction path forbidden')
        if node.exists():
            _require(not getattr(node.lstat(), 'st_file_attributes', 0) & 0x400,
                     'Reparse path forbidden')
        if node == BASE:
            break
    resolved = absolute.resolve()
    roots = [BASE / 'research/datasets']
    if not datasets_only:
        roots.append(BASE / 'outputs')
    _require(any(resolved.is_relative_to(root) and resolved != root for root in roots),
             'Path must be below ignored local research data/output roots')
    return resolved


def _validate_research_roots():
    # One fresh tree-level guard per public operation, rather than two Git
    # subprocesses per crop. Forced tracking of any local dataset/output fails.
    tracked = subprocess.run(['git', 'ls-files', '--', 'research/datasets', 'outputs'],
                             cwd=BASE, capture_output=True, text=True, check=True)
    _require(not tracked.stdout.strip(), 'Research datasets/outputs must be untracked')
    for root in ('research/datasets', 'outputs'):
        ignored = subprocess.run(['git', 'check-ignore', '-q', '--', root + '/.__crop_guard__'], cwd=BASE)
        _require(ignored.returncode == 0, 'Research datasets/outputs must be ignored')


def _relative(value, root):
    _require(isinstance(value, str) and bool(value) and '\\' not in value and ':' not in value
             and not PurePosixPath(value).is_absolute() and not PureWindowsPath(value).is_absolute()
             and all(part not in ('', '.', '..') and not part.endswith((' ', '.'))
                     for part in value.split('/')), 'Canonical relative path required')
    path = _local(root / value)
    _require(path.is_relative_to(root.resolve()), 'Path escapes declared root')
    return path


def _json(path):
    path = _local(path)
    _require(path.suffix == '.json' and path.is_file() and path.stat().st_size <= 32 * 1024**2,
             'Bounded JSON metadata file required')
    doc = json.loads(path.read_text(encoding='utf-8'))
    _require(isinstance(doc, dict), 'JSON object required')
    return doc


def _identity(path):
    path = _local(path)
    return {'path': path.relative_to(BASE).as_posix(), 'sha256': _sha(path),
            'bytes': path.stat().st_size}


def _verify_hash(path, expected, message):
    _require(isinstance(expected, str) and bool(re.fullmatch('[0-9a-f]{64}', expected))
             and _sha(path) == expected, message)


def _parquet(path):
    # The verified pyarrow dependency is local and unchanged; no downloads or
    # image APIs are invoked by the metadata path.
    deps = BASE / 'research/datasets/freshretailnet-audit-2026-10-17/_deps'
    if str(deps) not in sys.path:
        sys.path.insert(0, str(deps))
    import pyarrow as pa
    import pyarrow.parquet as pq
    pa.set_cpu_count(1)
    pa.set_io_thread_count(1)
    return pq.read_table(path, use_threads=False).to_pylist()


def _archive_identity(receipt):
    _require(receipt.get('archive_bytes') == ARCHIVE_BYTES
             and receipt.get('archive_sha256') == ARCHIVE_SHA256,
             'Completed official archive hash/length required')
    # Real receipts carry the stable native identity captured around the full
    # stream hash. Do not re-read 31.6 GB on each metadata-only worker load.
    _require(isinstance(receipt.get('archive'), str) and receipt['archive'], 'Verified source archive identity required')
    path = Path(receipt['archive'])
    _require(path.is_absolute() and path.is_file(), 'Verified source archive missing')
    for node in (path, *path.parents):
        _require(not node.is_symlink() and not (hasattr(node, 'is_junction') and node.is_junction()),
                 'Source archive links forbidden')
    stat = path.stat()
    identity = {'device': stat.st_dev, 'inode': stat.st_ino, 'bytes': stat.st_size,
                'mtime_ns': stat.st_mtime_ns,
                'birthtime_ns': getattr(stat, 'st_birthtime_ns', stat.st_ctime_ns)}
    _require(identity == receipt.get('archive_identity_before') == receipt.get('archive_identity_after'),
             'Verified archive identity changed since full stream check')


def _source_rows(proposal):
    sources = proposal.get('source_files')
    _require(isinstance(sources, dict) and sources, 'Original source bindings required')
    source_paths = {}
    for name, identity in sources.items():
        path = _relative(name, BASE)
        _require(path.suffix in ('.json', '.parquet') or path.name == 'LICENSE',
                 'Source bindings may only hash metadata or licence, never pixels')
        _require(path.is_file() and path.stat().st_size == identity.get('bytes'), 'Source length changed')
        _verify_hash(path, identity.get('sha256'), 'Original source hash changed')
        _require(path.name not in source_paths, 'Ambiguous original source filename')
        source_paths[path.name] = path
    _require({'query-train.parquet', 'query-sample.parquet', 'reference-train.parquet', 'LICENSE'}
             <= source_paths.keys(), 'Original annotations/sample/licence bindings missing')
    queries = _parquet(source_paths['query-train.parquet'])
    samples = _parquet(source_paths['query-sample.parquet'])
    references = _parquet(source_paths['reference-train.parquet'])
    sample_ids = {r['item_identifier'] for r in samples}
    _require(set(proposal.get('excluded_sample_item_identifiers', [])) == sample_ids,
             'Prior sample exclusion set differs from source annotations')
    return queries, samples, references, source_paths


def _reconstruct(proposal_path, selection_path, intake_root, verification_path):
    proposal_path, selection_path, verification_path = map(_local, (proposal_path, selection_path, verification_path))
    intake_root = _local(intake_root, datasets_only=True)
    proposal, selection, verification = map(_json, (proposal_path, selection_path, verification_path))
    receipt_path = intake_root / 'selected/receipt.json'
    metadata_path = intake_root / 'metadata-verification.json'
    supervision_path = intake_root / 'stream.result.json'
    receipt, metadata, supervision = map(_json, (receipt_path, metadata_path, supervision_path))
    withdrawal_path = selection_path.parent / 'parent-quality-withdrawal-01.json'
    amendment_path = selection_path.parent / 'quality-withdrawal-proposal.json'
    audit_path = selection_path.parent / 'quality-audit-01.json'
    prior_path = selection_path.parent / 'intake-selection-01.json'
    withdrawal, audit, prior, amendment = map(_json, (withdrawal_path, audit_path, prior_path, amendment_path))
    _require(receipt.get('status') == 'completed'
             and metadata.get('status') == 'verified_intake_not_training_admitted'
             and supervision.get('status') == 'success' and supervision.get('returncode') == 0
             and supervision.get('reason') is None
             and verification.get('status') == 'independent_integrity_verified_not_training_admitted'
             and verification.get('supervision') == supervision,
             'All three completed intake artifacts and independent verification required')
    _archive_identity(receipt)
    for path, expected in ((proposal_path, selection.get('source_proposal_sha256')),
                           (proposal_path, metadata.get('proposal_sha256')),
                           (proposal_path, prior.get('source_proposal_sha256')),
                           (selection_path, metadata.get('selection_sha256')),
                           (receipt_path, metadata.get('receipt_sha256')),
                           (amendment_path, selection.get('quality_withdrawal_sha256')),
                           (amendment_path, metadata.get('quality_withdrawal_sha256')),
                           (proposal_path, amendment.get('input_proposal', {}).get('sha256')),
                           (audit_path, selection.get('quality_audit_sha256')),
                           (prior_path, selection.get('prior_intake_selection_sha256'))):
        _verify_hash(path, expected, 'Upstream provenance hash mismatch')
    _require(proposal.get('official_source_split') == selection.get('official_split') == 'train'
             and selection.get('no_replacements') is True
             and selection.get('surviving_partitions_unchanged') is True
             and metadata.get('all_archive_paths_match_official_metadata') is True
             and metadata.get('no_official_heldout_images_extracted_or_decoded') is True
             and verification.get('no_internal_or_official_test_images_extracted_or_decoded') is True,
             'Official TRAIN/development boundary or unchanged selection declaration missing')
    _require(metadata.get('source_files') == proposal.get('source_files'), 'Source receipt binding mismatch')
    _require(selection.get('selection_sha256') == proposal.get('selection_sha256')
             and selection.get('partition_sha256') == proposal.get('partition_sha256'),
             'Original proposed selection/partition identities changed')
    queries, samples, references, source_paths = _source_rows(proposal)
    source_by_capture = {}
    source_by_item = defaultdict(list)
    for row in queries:
        _require(row['capture_id'] not in source_by_capture, 'Duplicate original capture')
        source_by_capture[row['capture_id']] = row
        if row['item_material'] == 'cardboard':
            source_by_item[row['item_identifier']].append(row)
    groups = {}
    for group in proposal.get('selected_item_groups', []):
        item = group['item_identifier']
        _require(isinstance(item, str) and item and item not in groups
                 and group.get('group_id') == 'kaputt:item:' + item
                 and group.get('proposed_internal_partition') in ('train', 'validation', 'internal_test')
                 and item not in set(proposal['excluded_sample_item_identifiers']), 'Invalid original source item group')
        actual = [r['capture_id'] for r in source_by_item[item]]
        _require(len(actual) > 0 and len(group['cardboard_capture_ids']) == len(set(group['cardboard_capture_ids']))
                 and set(actual) == set(group['cardboard_capture_ids']), 'Source item captures incomplete')
        groups[item] = group
    captures = {}
    for row in proposal.get('selected_cardboard_query_metadata', []):
        capture = row['capture_id']
        _require(capture not in captures and capture in source_by_capture, 'Missing/duplicate selected capture')
        source = source_by_capture[capture]
        _require(row == source and row['item_identifier'] in groups
                 and type(row.get('defect')) is bool and row.get('item_material') == 'cardboard'
                 and IMAGE.fullmatch(row.get('query_crop', '')) is not None
                 and IMAGE.fullmatch(row['query_crop']).group(1) == capture,
                 'Selected row differs from original publisher annotations')
        captures[capture] = row
    _require(set(captures) == {capture for group in groups.values() for capture in group['cardboard_capture_ids']},
             'Proposed selection omits source item captures')
    withdrawn = set(selection.get('withdrawn_item_ids', []))
    _require(withdrawn <= groups.keys() and set(withdrawal.get('withdrawn_item_ids', [])) == withdrawn
             and withdrawal.get('status') == 'parent_quality_withdrawal_check'
             and withdrawal.get('no_images_opened') is True, 'Quality withdrawal mismatch')
    _require(amendment.get('status') == 'proposed_quality_withdrawal_not_training_admitted'
             and amendment.get('minimum_side_pixels') == 64
             and sorted(amendment.get('withdrawn_groups', []), key=lambda r: r['item_identifier']) ==
                 sorted((groups[item] for item in withdrawn), key=lambda r: r['item_identifier']),
             'Quality amendment differs from complete original groups')
    _require(sorted(withdrawal.get('removed_captures', []), key=lambda r: r['capture_id']) ==
             sorted((r for r in captures.values() if r['item_identifier'] in withdrawn), key=lambda r: r['capture_id']),
             'Quality withdrawal must remove complete original groups')
    _require(sorted(amendment.get('all_withdrawn_item_query_metadata', []), key=lambda r: r['capture_id']) ==
             sorted((r for r in queries if r['item_identifier'] in withdrawn), key=lambda r: r['capture_id']),
             'Quality amendment omits withdrawn source-item query derivatives')
    failed_crops = audit.get('failed_crops')
    _require(isinstance(failed_crops, list) and bool(failed_crops)
             and all(r.get('capture_id') in captures
                     and type(r.get('width')) is int and type(r.get('height')) is int
                     and 0 < min(r['width'], r['height']) < 64 for r in failed_crops)
             and {captures[r['capture_id']]['item_identifier'] for r in failed_crops} == withdrawn,
             'Quality withdrawal differs from recorded minimum-dimension failures')
    development = {c: r for c, r in captures.items() if r['item_identifier'] not in withdrawn
                   and groups[r['item_identifier']]['proposed_internal_partition'] in ('train', 'validation')}
    reserved = sorted((dict(r, proposed_internal_partition='internal_test', official_split='train')
                       for r in captures.values() if r['item_identifier'] not in withdrawn
                       and groups[r['item_identifier']]['proposed_internal_partition'] == 'internal_test'),
                      key=lambda r: r['capture_id'])
    paths = {r['query_crop'] for r in development.values()}
    _require(len(selection.get('selected_paths', [])) == len(paths)
             and set(selection['selected_paths']) == paths
             and selection.get('extract_images') == len(paths), 'Extraction allowlist differs from complete surviving development groups')
    _require(metadata.get('reserved_internal_test_not_extracted') == len(reserved), 'Reserved test metadata count changed')
    entries = {r['path']: r for r in receipt.get('selected', [])}
    _require(len(entries) == len(receipt.get('selected', [])) == receipt.get('selected_files') == len(paths)
             and set(entries) == paths and verification.get('images') == len(paths)
             and verification.get('source_item_groups') == len({r['item_identifier'] for r in development.values()}),
             'Completed extraction receipt differs from selected captures')
    _require(receipt.get('retained_bytes') == sum(r['bytes'] for r in entries.values()), 'Retained byte total differs from receipt')
    _require(not verification.get('exact_cross_item_duplicates') and not verification.get('old_sample_exact_matches'),
             'Exact duplicates require a separate frozen resolution')
    parent = {item: item for item in {r['item_identifier'] for r in development.values()}}
    def find(item):
        while parent[item] != item:
            parent[item] = parent[parent[item]]
            item = parent[item]
        return item
    edges = verification.get('near_cross_item_candidates_dhash_le4')
    _require(isinstance(edges, list), 'Development dependency edges missing')
    for edge in edges:
        _require(edge.get('a') in development and edge.get('b') in development
                 and type(edge.get('distance')) is int and 0 <= edge['distance'] <= 4,
                 'Invalid development dependency edge')
        a, b = (development[edge[k]]['item_identifier'] for k in ('a', 'b'))
        _require(a != b, 'Cross-item edge must link different source items')
        a, b = find(a), find(b)
        parent[max(a, b)] = min(a, b)
    components = defaultdict(list)
    for item in sorted(parent):
        components[find(item)].append(item)
    old_captures = {r['capture_id'] for r in samples}
    touched = set()
    old_edges = verification.get('old_sample_near_candidates_dhash_le4')
    _require(isinstance(old_edges, list), 'Prior sample dependency edges missing')
    for edge in old_edges:
        _require(edge.get('new') in development and edge.get('old') in old_captures
                 and type(edge.get('distance')) is int and 0 <= edge['distance'] <= 4,
                 'Invalid prior sample dependency edge')
        touched.add(find(development[edge['new']]['item_identifier']))
    component_ids = {root: 'kaputt:dependency:' + hashlib.sha256('|'.join(items).encode()).hexdigest()
                     for root, items in components.items()}
    quarantined, exclusion = set(), []
    for root, items in sorted(components.items()):
        splits = {groups[item]['proposed_internal_partition'] for item in items}
        reasons = (['touches_prior_sample'] if root in touched else []) + (['spans_proposed_partitions'] if len(splits) > 1 else [])
        if reasons:
            quarantined.update(items)
            exclusion.extend({'item_identifier': item, 'group_id': groups[item]['group_id'],
                              'dependency_group_id': component_ids[root], 'reasons': reasons,
                              'capture_ids': sorted(groups[item]['cardboard_capture_ids'])} for item in items)
    exclusion.extend({'item_identifier': item, 'group_id': groups[item]['group_id'],
                      'dependency_group_id': None, 'reasons': ['previous_quality_withdrawal'],
                      'capture_ids': sorted(groups[item]['cardboard_capture_ids'])} for item in sorted(withdrawn))
    rows = []
    root = _local(intake_root / 'selected', datasets_only=True)
    for capture, source in sorted(development.items()):
        item = source['item_identifier']
        if item in quarantined:
            continue
        entry = entries[source['query_crop']]
        _relative(source['query_crop'], root)
        _require(entry.get('sha256') == entry.get('verified_sha256')
                 and all(isinstance(entry.get(k), str) and re.fullmatch('[0-9a-f]{64}', entry[k])
                         for k in ('sha256', 'decoded_sha256'))
                 and all(type(entry.get(k)) is int and entry[k] >= 64 for k in ('width', 'height'))
                 and entry['width'] * entry['height'] <= 16_000_000
                 and type(entry.get('bytes')) is int and 0 < entry['bytes'] <= 16 * 1024**2,
                 'Invalid completed development image receipt')
        rows.append({'sample_id': 'kaputt:' + capture, 'capture_id': capture,
                     'item_identifier': item, 'group_id': groups[item]['group_id'],
                     'dependency_group_id': component_ids[find(item)],
                     'image_path': source['query_crop'], 'image_sha256': entry['sha256'],
                     'decoded_sha256': entry['decoded_sha256'], 'width': entry['width'],
                     'height': entry['height'], 'image_bytes': entry['bytes'],
                     'label': 'Damaged' if source['defect'] else 'Normal',
                     'publisher_defect': source['defect'], 'split': groups[item]['proposed_internal_partition'],
                     'official_split': 'train', 'role': 'query_crop'})
    _require(rows and {r['split'] for r in rows} == {'train', 'validation'}, 'Both retained development partitions required')
    _require(len({r['image_sha256'] for r in rows}) == len(rows)
             and len({r['decoded_sha256'] for r in rows}) == len(rows), 'Retained exact duplicate receipts forbidden')
    statistics = _statistics(rows)
    provenance = {key: _identity(path) for key, path in {
        'proposal': proposal_path, 'selection': selection_path, 'quality_amendment': amendment_path,
        'quality_withdrawal_check': withdrawal_path,
        'quality_audit': audit_path, 'prior_selection': prior_path, 'independent_verification': verification_path,
        'intake_receipt': receipt_path, 'intake_metadata_verification': metadata_path,
        'intake_supervision': supervision_path}.items()}
    provenance.update({'source:' + name: _identity(path) for name, path in source_paths.items()})
    return {'schema_version': 1, 'profile': PROFILE, 'benchmark_profile': PROFILE,
            'evaluation_scope': 'development_only', 'operationally_approved': False,
            'frozen_development': True, 'image_root': str(root),
            'inputs': {'proposal': str(proposal_path), 'selection': str(selection_path),
                       'intake_root': str(intake_root), 'independent_verification': str(verification_path)},
            'archive': {'bytes': ARCHIVE_BYTES, 'sha256': ARCHIVE_SHA256},
            'source_hashes': provenance, 'label_basis': 'publisher_defect_annotation',
            'grouping_basis': 'transitive_source_item_dhash_le4_dependency',
            'dependency_rule': {'maximum_dhash_distance': 4, 'cross_item_edges': len(edges),
                                'prior_sample_edges': len(old_edges),
                                'quarantine_entire_component_touching_prior_sample': True,
                                'quarantine_entire_component_spanning_proposed_partitions': True,
                                'no_replacements_or_partition_reassignments': True},
            'rows': rows, 'reserved_test_metadata': reserved,
            'exclusions': sorted(exclusion, key=lambda r: r['item_identifier']),
            'statistics': statistics}


def _statistics(rows):
    result = {'images': len(rows), 'source_items': len({r['item_identifier'] for r in rows}),
              'dependency_components': len({r['dependency_group_id'] for r in rows}),
              'labels': dict(sorted(Counter(r['label'] for r in rows).items())), 'partitions': {}}
    for split in ('train', 'validation'):
        selected = [r for r in rows if r['split'] == split]
        result['partitions'][split] = {'images': len(selected),
            'source_items': len({r['item_identifier'] for r in selected}),
            'dependency_components': len({r['dependency_group_id'] for r in selected}),
            'labels': dict(sorted(Counter(r['label'] for r in selected).items()))}
    return result


def build_manifest(proposal_path, selection_path, intake_root, verification_path, output_path):
    """Resolve dependencies and exclusively freeze a manifest; never read pixels."""
    _validate_research_roots()
    output_path = _local(output_path, datasets_only=True)
    _require(output_path.suffix == '.json', 'Manifest must be JSON')
    if output_path.exists():
        raise FileExistsError('Frozen manifest already exists; overwrite/resume forbidden')
    doc = _reconstruct(proposal_path, selection_path, intake_root, verification_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_json_exclusive(output_path, doc)
    return doc


def load_manifest(path, verify_images=False):
    """Reconstruct exact frozen metadata; optionally verify retained dev pixels."""
    _validate_research_roots()
    path = _local(path, datasets_only=True)
    doc = _json(path)
    _require(doc.get('schema_version') == 1 and type(doc.get('schema_version')) is int
             and doc.get('profile') == PROFILE and doc.get('benchmark_profile') == PROFILE
             and doc.get('evaluation_scope') == 'development_only'
             and doc.get('operationally_approved') is False and doc.get('frozen_development') is True,
             'Unsupported crop development profile or operational claim')
    sources = doc.get('source_hashes')
    _require(isinstance(sources, dict) and bool(sources), 'Frozen source bindings missing')
    for identity in sources.values():
        file = _relative(identity['path'], BASE)
        _require(file.suffix in ('.json', '.parquet') or file.name == 'LICENSE',
                 'Metadata source binding must not reference pixels')
        _require(file.is_file() and file.stat().st_size == identity.get('bytes'), 'Frozen source length changed')
        _verify_hash(file, identity.get('sha256'), 'Frozen source hash changed')
    inputs = doc.get('inputs', {})
    expected = _reconstruct(inputs['proposal'], inputs['selection'], inputs['intake_root'], inputs['independent_verification'])
    _require(doc == expected, 'Manifest rows/provenance/dependencies differ from frozen source reconstruction')
    root = _local(doc['image_root'], datasets_only=True)
    if verify_images:
        import cv2
        import numpy as np
        cv2.setNumThreads(1)
    for row in doc['rows']:
        file = _relative(row['image_path'], root)
        _require(file.is_file() and file.stat().st_size == row['image_bytes'], 'Retained development image missing or changed size')
        if verify_images:
            raw = file.read_bytes()
            _require(hashlib.sha256(raw).hexdigest() == row['image_sha256'], 'Development image byte hash changed')
            decoded = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
            _require(decoded is not None and decoded.shape == (row['height'], row['width'], 3),
                     'Development image decode/dimensions changed')
            _require(hashlib.sha256(memoryview(decoded)).hexdigest() == row['decoded_sha256'],
                     'Development decoded pixels changed')
        row['_image_path'] = file
        row['_group_id'] = row['dependency_group_id']
    doc['manifest_sha256'] = _sha(path)
    doc['_manifest_path'] = path
    return doc


def benchmark_context(doc):
    """Portable truthful scope/provenance; never imply IILAS acceptance."""
    _require(doc.get('profile') == PROFILE and doc.get('operationally_approved') is False,
             'Explicit development profile required')
    return {'benchmark_profile': PROFILE, 'profile': PROFILE,
            'evaluation_scope': 'development_only', 'operationally_approved': False,
            'manifest_sha256': doc.get('manifest_sha256'),
            'source_hashes': {key: value['sha256'] for key, value in doc['source_hashes'].items()},
            'label_basis': 'publisher_defect_annotation',
            'grouping_basis': 'transitive_source_item_dhash_le4_dependency',
            'grouping_interpretation': 'Equal dependency-component weights; physical parcel/session identity unverified.',
            'evaluation_boundary': 'Internal development partitions from publisher TRAIN crops; no official held-out evaluation or IILAS operational accuracy claim.'}
