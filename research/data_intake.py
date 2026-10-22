"""Local data-collection scaffolding and redacted audits. Never trains or labels data."""
import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timedelta
import hashlib
import json
import math
from pathlib import Path, PureWindowsPath

from models import SCHEMAS

DATA_ROOT = Path(__file__).parent / 'datasets'
DEFAULT_ROOT = DATA_ROOT / 'intake-v1'
KINDS = ('inventory', 'delivery', 'parcel')
COMMON = ['sample_id', 'group_id', 'source_id', 'origin', 'observed_at',
          'feature_cutoff_at', 'label', 'label_status', 'labeler_id',
          'evidence_ref', 'rubric_version', 'split']
DELIVERY_TIMES = ['dispatch_at', 'deadline_at', 'outcome_checked_at']
COUNT_FIELDS = {'movement_frequency', 'adjustment_count', 'failed_attempts',
                'status_event_count', 'parcel_count'}


def columns(kind):
    if kind not in KINDS:
        raise ValueError('Unsupported task.')
    return COMMON + (['image_path'] if kind == 'parcel' else SCHEMAS[kind]['features']) + (
        DELIVERY_TIMES if kind == 'delivery' else [])


def initialize(root=DEFAULT_ROOT):
    """Create a new collection only. Existing paths are never merged or overwritten."""
    root = Path(root)
    root.mkdir(parents=True, exist_ok=False)
    for kind in KINDS:
        directory = root / kind
        directory.mkdir()
        if kind == 'parcel':
            (directory / 'images').mkdir()
        metadata = {'schema_version': 1, 'kind': kind, 'rubric_version': '1.0',
                    'protocol_status': 'proposed', 'sources': []}
        with (directory / 'dataset.json').open('x', encoding='utf-8') as handle:
            json.dump(metadata, handle, indent=2)
        with (directory / 'observations.csv').open('x', newline='', encoding='utf-8') as handle:
            csv.writer(handle).writerow(columns(kind))
    return root


def timestamp(value):
    parsed = datetime.fromisoformat(value)
    if parsed.utcoffset() is None:
        raise ValueError('Timestamp needs timezone.')
    return parsed


def audit(root, kind):
    """Return aggregate counts and row-number issue codes, never raw private values."""
    expected = columns(kind)
    folder = Path(root) / kind
    labels = ['Normal', 'Damaged'] if kind == 'parcel' else SCHEMAS[kind]['labels']
    result = {'kind': kind, 'rows': 0, 'reviewed_rows': 0, 'unresolved_rows': 0,
              'class_counts': {label: 0 for label in labels}, 'groups_per_class': {},
              'origins': {}, 'issues': [], 'ready_for_split': False,
              'model_evaluated': False, 'limitations': ['software_minimum_only',
                  'human_labels_and_source_permissions_not_verified_by_software',
                  'near_duplicate_review_is_not_exhaustive']}

    def issue(code, row=None, field=None):
        item = {'code': code}
        if row is not None: item['row'] = row
        if field is not None: item['field'] = field
        result['issues'].append(item)

    try:
        metadata = json.loads((folder / 'dataset.json').read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        issue('invalid_metadata'); return result
    if not isinstance(metadata, dict) or metadata.get('kind') != kind or metadata.get('schema_version') != 1:
        issue('invalid_metadata'); return result
    if metadata.get('protocol_status') != 'reviewed': issue('protocol_not_reviewed')
    if not isinstance(metadata.get('rubric_version'), str) or not metadata['rubric_version'].strip():
        issue('invalid_rubric_version')
    if metadata.get('rubric_version') != '1.0': issue('unsupported_rubric')
    sources = metadata.get('sources')
    if not isinstance(sources, list):
        issue('invalid_sources'); return result
    source_ids = set()
    for source in sources:
        required = ['source_id', 'reference', 'license_or_permission', 'permitted_use']
        if not isinstance(source, dict) or any(not isinstance(source.get(k), str) or not source[k].strip() for k in required):
            issue('incomplete_provenance'); continue
        if source['source_id'] in source_ids: issue('duplicate_source')
        source_ids.add(source['source_id'])
    if not source_ids: issue('missing_provenance')
    try:
        with (folder / 'observations.csv').open(encoding='utf-8-sig', newline='') as handle:
            reader = csv.DictReader(handle)
            if len(reader.fieldnames or []) != len(expected) or set(reader.fieldnames or []) != set(expected):
                issue('invalid_columns'); return result
            rows = list(reader)
    except (OSError, UnicodeError, csv.Error):
        issue('unreadable_observations'); return result
    result['rows'] = len(rows)
    if not rows: issue('empty_dataset')
    ids = set(); observations = set(); delivery_groups = set()
    groups = defaultdict(set); split_groups = defaultdict(set)
    origins = Counter(); image_hashes = set(); perceptual = []
    split_counts = Counter()
    for number, row in enumerate(rows, start=2):
        if None in row or any(value is None for value in row.values()):
            issue('malformed_row', number); continue
        row = {key: value.strip() for key, value in row.items()}
        for field in ['sample_id', 'group_id']:
            if not row[field]: issue('missing_identifier', number, field)
        if row['sample_id'] in ids: issue('duplicate_sample', number)
        ids.add(row['sample_id'])
        if row['source_id'] not in source_ids: issue('unknown_source', number)
        if row['origin'] not in ['real', 'simulated']:
            issue('invalid_origin', number)
        else: origins[row['origin']] += 1
        split = row['split']
        allowed_splits = ['', 'train', 'test'] + (['validation'] if kind != 'inventory' else [])
        if split not in allowed_splits: issue('invalid_split', number)
        else: split_counts[split] += 1
        if split: split_groups[row['group_id']].add(split)
        times = {}
        for field in ['observed_at', 'feature_cutoff_at']:
            try: times[field] = timestamp(row[field])
            except (ValueError, OverflowError): issue('invalid_timestamp', number, field)
        if len(times) == 2 and times['feature_cutoff_at'] > times['observed_at']:
            issue('future_features', number)
        if kind != 'parcel' and 'observed_at' in times:
            key = (row['group_id'], times['observed_at'])
            if key in observations: issue('duplicate_observation', number)
            observations.add(key)
        if kind == 'delivery':
            if row['group_id'] in delivery_groups: issue('multiple_delivery_snapshots', number)
            delivery_groups.add(row['group_id'])
        if row['rubric_version'] != metadata.get('rubric_version'):
            issue('rubric_mismatch', number)
        reviewed = row['label_status'] == 'reviewed'
        if reviewed:
            result['reviewed_rows'] += 1
            if row['label'] not in labels: issue('invalid_label', number)
            else:
                result['class_counts'][row['label']] += 1
                if row['group_id']: groups[row['label']].add(row['group_id'])
            if not row['labeler_id'] or not row['evidence_ref']:
                issue('missing_review_evidence', number)
        else:
            result['unresolved_rows'] += 1
            if row['label_status'] not in ['pending', 'unresolved', 'excluded']:
                issue('invalid_label_status', number)
        if kind == 'parcel':
            inspect_image(folder, row, number, issue, image_hashes, perceptual)
            continue
        values = {}
        for field in SCHEMAS[kind]['features']:
            try:
                value = float(row[field])
                valid = math.isfinite(value) and (field == 'reorder_distance' or value >= 0)
                if field in COUNT_FIELDS: valid = valid and value.is_integer()
                if field == 'has_proof': valid = valid and value in [0, 1]
                if field in ['expected_duration_hours', 'parcel_count']: valid = valid and value > 0
                if not valid: raise ValueError()
                values[field] = value
            except (ValueError, OverflowError): issue('invalid_feature', number, field)
        if kind == 'delivery':
            for field in DELIVERY_TIMES:
                if field == 'outcome_checked_at' and not reviewed and not row[field]: continue
                try: times[field] = timestamp(row[field])
                except (ValueError, OverflowError): issue('invalid_timestamp', number, field)
            if all(key in times for key in ['dispatch_at', 'deadline_at', 'observed_at']):
                duration = (times['deadline_at'] - times['dispatch_at']).total_seconds() / 3600
                elapsed = (times['observed_at'] - times['dispatch_at']).total_seconds() / 3600
                if duration <= 0 or not .5 * duration <= elapsed <= .6 * duration:
                    issue('invalid_observation_window', number)
                for field, actual in [('expected_duration_hours', duration), ('elapsed_hours', elapsed)]:
                    if field in values and not math.isclose(values[field], actual, abs_tol=1/3600):
                        issue('duration_mismatch', number, field)
            if reviewed and 'deadline_at' in times and 'outcome_checked_at' in times:
                if times['outcome_checked_at'] < times['deadline_at'] + timedelta(hours=24):
                    issue('incomplete_followup', number)
    if any(len(splits) > 1 for splits in split_groups.values()): issue('group_split_leakage')
    if split_counts.get('') and len(split_counts) > 1: issue('partially_assigned_splits')
    if len(origins) > 1: issue('mixed_origins')
    result['origins'] = dict(origins)
    result['groups_per_class'] = {label: len(groups[label]) for label in labels}
    if any(count < 5 for count in result['groups_per_class'].values()): issue('insufficient_independent_groups')
    if result['unresolved_rows']: issue('unresolved_labels')
    result['ready_for_split'] = not result['issues'] and bool(rows)
    return result


def inspect_image(folder, row, number, issue, hashes, perceptual):
    raw = row['image_path']
    relative = Path(raw)
    path = (folder / relative).resolve()
    image_root = (folder / 'images').resolve()
    if (not raw or relative.is_absolute() or PureWindowsPath(raw).drive
            or '..' in relative.parts or not path.is_relative_to(image_root)
            or not path.is_relative_to(folder.resolve())):
        issue('invalid_image_path', number); return
    if path.suffix.lower() not in ['.png', '.jpg', '.jpeg', '.webp'] or not path.is_file():
        issue('invalid_image', number); return
    if path.stat().st_size > 16_000_000:
        issue('oversized_image', number); return
    import cv2
    image = cv2.imread(str(path))
    if image is None or min(image.shape[:2]) < 64:
        issue('invalid_image', number); return
    digest = hashlib.sha256(str(image.shape).encode() + image.tobytes()).hexdigest()
    if digest in hashes: issue('duplicate_image', number)
    hashes.add(digest)
    gray = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (9, 8))
    fingerprint = sum(int(bit) << index for index, bit in enumerate((gray[:, 1:] > gray[:, :-1]).flat))
    if any(group != row['group_id'] and (old ^ fingerprint).bit_count() <= 3 for old, group in perceptual):
        issue('possible_related_images', number)
    perceptual.append((fingerprint, row['group_id']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['init', 'audit'])
    parser.add_argument('--root', type=Path, default=DEFAULT_ROOT)
    parser.add_argument('--kind', choices=KINDS)
    args = parser.parse_args()
    # All CLI-created/inspected collections stay in the repository's ignored data area.
    if not args.root.resolve().is_relative_to(DATA_ROOT.resolve()) or args.root.resolve() == DATA_ROOT.resolve():
        print('Choose a collection subfolder under research/datasets; data must stay outside tracked source.')
        return 1
    try:
        if args.command == 'init':
            initialize(args.root)
            print('Created empty collection templates. No labels, datasets or models were generated.')
            return 0
        reports = [audit(args.root, kind) for kind in ([args.kind] if args.kind else KINDS)]
        print(json.dumps(reports, indent=2))
        return 0 if all(report['ready_for_split'] for report in reports) else 2
    except (OSError, ValueError):
        print('Intake operation could not complete. Check the local files; existing collections are never overwritten.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
