"""Prepare an unapproved Parcel3D pilot review queue using only stdlib.

This validates local provenance consistency, not human labels or independence.
It never decodes images, assigns final families/splits, or trains a model.
Input and output must be inside research/datasets; output must not exist.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import sys


DATASETS = Path(__file__).resolve().parent / 'datasets'
SOURCE_URL = 'https://zenodo.org/records/8032204'
FIELDS = [
    'pilot_position', 'sample_id', 'source_split', 'origin', 'source_model',
    'candidate_group_id', 'candidate_label', 'image_path', 'image_sha256',
    'render_config_path', 'annotation_path', 'assistant_contact_sheet_flag',
    'label_status', 'label', 'visibility_status', 'family_review_status',
    'approved_family_id', 'split', 'reviewer', 'review_notes',
]


class ReviewError(ValueError):
    """Carries only a static, non-sensitive issue code."""


def require(condition, code):
    if not condition:
        raise ReviewError(code)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def confined(path, root):
    resolved = path.resolve()
    require(resolved != root and resolved.is_relative_to(root), 'path_outside_dataset')
    return resolved


def parse_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'duplicate_json_key')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique)


def config_fields(data):
    """Read only the publisher's plain YAML scalar subset, never execute YAML.

    Match the exact SCENARIO/MODEL indentation and fail on ambiguous duplicates.
    Other keys are ignored; this is deliberately not a general YAML parser.
    """
    result = {}
    seen = set()
    scenario = False
    model = False
    for line in data.decode('utf-8').splitlines():
        # Recognize relevant keys before validating values. Otherwise unsupported
        # quoted/block/flow values could hide a duplicate behind an earlier value.
        key_match = re.match(r'''^[ \t]*["']?(SCENARIO|MODEL|PARCEL_TYPE|NAME|ID|FLAG)["']?\s*:''', line)
        if key_match:
            key = key_match.group(1)
            require(key not in seen, 'ambiguous_render_config')
            seen.add(key)
            if key == 'SCENARIO':
                require(line == 'SCENARIO:', 'unsupported_render_config')
                scenario, model = True, False
            elif key == 'MODEL':
                require(scenario and line == '  MODEL:', 'unsupported_render_config')
                model = True
            else:
                indent = '    ' if key == 'NAME' else '  '
                require(scenario and (key != 'NAME' or model), 'unsupported_render_config')
                match = re.fullmatch(indent + key + r': ([A-Za-z0-9_-]+)', line)
                require(match is not None, 'unsupported_render_config')
                result[key] = match.group(1)
                if key != 'NAME':
                    model = False
            continue
        if line and not line.startswith(' '):
            scenario, model = False, False
        elif scenario and re.match(r'^  [^ ]', line):
            model = False
    require(set(result) == {'NAME', 'PARCEL_TYPE', 'ID', 'FLAG'}, 'unsupported_render_config')
    return result


def prepare(source, output):
    root = DATASETS.resolve()
    source = confined(Path(source), root)
    output = confined(Path(output), root)
    require(source.is_dir(), 'source_missing')
    require(not output.exists(), 'output_exists')
    require(not output.is_relative_to(source), 'output_inside_source')

    metadata = {}
    metadata_hashes = []
    for name in ['manifest.json', 'pilot-audit.json', 'visual-triage.csv']:
        path = confined(source / name, source)
        data = path.read_bytes()
        metadata[name] = data
        metadata_hashes.append({'name': name, 'bytes': len(data), 'sha256': sha256(data)})
    manifest = parse_json(metadata['manifest.json'])
    require(isinstance(parse_json(metadata['pilot-audit.json']), dict), 'invalid_audit')
    require(isinstance(manifest, dict) and manifest.get('source') == SOURCE_URL
            and manifest.get('version') == '1.0', 'unsupported_source')
    members = manifest.get('members')
    require(isinstance(members, list) and 0 < len(members) <= 10000, 'invalid_members')
    triage = {}
    positions = set()
    reader = csv.DictReader(io.StringIO(metadata['visual-triage.csv'].decode('utf-8-sig')))
    require(reader.fieldnames == ['pilot_position', 'sample_id', 'source_label',
                                 'assistant_contact_sheet_flag', 'human_review_status'], 'invalid_triage_header')
    for row in reader:
        sid = row['sample_id']
        require(sid not in triage and None not in row, 'duplicate_or_invalid_triage')
        require(row['human_review_status'] == 'pending', 'triage_not_pending')
        require(row['assistant_contact_sheet_flag'] in {
            'low_light_or_small_object', 'not_flagged_at_contact_sheet_scale'}, 'unknown_triage_flag')
        require(re.fullmatch(r'[1-9][0-9]*', row['pilot_position'] or ''), 'invalid_pilot_position')
        position = int(row['pilot_position'])
        require(position not in positions, 'duplicate_pilot_position')
        positions.add(position)
        triage[sid] = row
    require(positions == set(range(1, len(members) + 1)), 'triage_coverage')

    rows = []
    file_records = []
    sample_ids = set()
    file_paths = set()
    image_hashes = set()
    models = set()
    label_counts = {'Normal': 0, 'Damaged': 0}
    flagged = 0
    for member in members:
        require(isinstance(member, dict), 'invalid_member')
        sid = member.get('sample_id')
        require(isinstance(sid, str) and re.fullmatch(
            r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', sid), 'invalid_sample_id')
        require(sid not in sample_ids, 'duplicate_sample')
        sample_ids.add(sid)
        source_type = member.get('source_type')
        require(source_type in {'normal', 'damaged'}, 'unknown_source_label')
        label = {'normal': 'Normal', 'damaged': 'Damaged'}[source_type]
        require(member.get('candidate_label') == label, 'candidate_label_mismatch')
        require(member.get('label_status') == 'pending' and member.get('origin') == 'simulated'
                and member.get('source_split') == 'train', 'unsupported_source_state')
        model = member.get('source_model')
        require(isinstance(model, str) and re.fullmatch(r'[A-Za-z0-9_-]+', model), 'invalid_source_model')
        require(sid in triage and triage[sid]['source_label'] == label, 'triage_label_mismatch')
        files = member.get('files')
        require(isinstance(files, list) and len(files) == 3, 'file_coverage')
        saved = {}
        for item in files:
            require(isinstance(item, dict) and isinstance(item.get('path'), str), 'invalid_file_record')
            relative = PurePosixPath(item['path'].replace('\\', '/'))
            require(not relative.is_absolute() and len(relative.parts) == 3
                    and relative.parts[0] == source.name and relative.parts[1] == sid
                    and relative.parts[2] in {'render_config.yaml', 'rgb.png', 'annotations.json'}, 'invalid_member_path')
            name = relative.parts[2]
            path = confined(source / sid / name, source)
            require(path not in file_paths and name not in saved, 'duplicate_file')
            file_paths.add(path)
            archive_name = 'meta/render_config.yaml' if name == 'render_config.yaml' else name
            require(item.get('member') == f'parcel3d/train/{sid}/{archive_name}', 'archive_member_mismatch')
            require(type(item.get('bytes')) is int and item['bytes'] > 0
                    and isinstance(item.get('sha256'), str)
                    and re.fullmatch(r'[0-9a-f]{64}', item['sha256']), 'invalid_file_integrity')
            data = path.read_bytes()
            require(len(data) == item['bytes'] and sha256(data) == item['sha256'], 'file_integrity_mismatch')
            require(item.get('zip_crc_verified') is True, 'source_crc_not_recorded')
            relative_path = path.relative_to(root).as_posix()
            saved[name] = (relative_path, item['sha256'], data)
            file_records.append({'sample_id': sid, 'path': relative_path, 'bytes': len(data),
                                 'sha256': item['sha256'], 'archive_member': item['member']})
        config = config_fields(saved['render_config.yaml'][2])
        require(config == {'NAME': model, 'PARCEL_TYPE': source_type, 'ID': sid, 'FLAG': 'train'},
                'render_config_mismatch')
        require(isinstance(parse_json(saved['annotations.json'][2]), (dict, list)), 'invalid_annotations')
        image_hash = saved['rgb.png'][1]
        require(image_hash not in image_hashes, 'duplicate_image')
        image_hashes.add(image_hash)
        models.add(model)
        label_counts[label] += 1
        flag = triage[sid]['assistant_contact_sheet_flag']
        flagged += flag == 'low_light_or_small_object'
        row = dict.fromkeys(FIELDS, '')
        row.update(pilot_position=triage[sid]['pilot_position'], sample_id=sid,
                   source_split='train', origin='simulated', source_model=model,
                   candidate_group_id='source-model-' + sha256(model.encode()),
                   candidate_label=label, image_path=saved['rgb.png'][0], image_sha256=image_hash,
                   render_config_path=saved['render_config.yaml'][0], annotation_path=saved['annotations.json'][0],
                   assistant_contact_sheet_flag=flag, label_status='pending', visibility_status='pending',
                   family_review_status='pending')
        rows.append(row)
    require(set(triage) == sample_ids, 'triage_coverage')
    rows.sort(key=lambda row: int(row['pilot_position']))
    file_records.sort(key=lambda item: item['path'])
    summary = {
        'schema_version': 1, 'source': SOURCE_URL, 'source_root': source.relative_to(root).as_posix(),
        'source_metadata': metadata_hashes, 'samples': len(rows), 'candidate_groups': len(models),
        'source_label_counts': label_counts, 'verified_files': len(file_records),
        'distinct_image_hashes': len(image_hashes), 'contact_sheet_flagged': flagged,
        'labels_pending': len(rows), 'human_label_review_complete': False,
        'family_grouping_approved': False, 'ready_for_split': False, 'model_trained': False,
        'grouping_rule': 'Exact source_model equality only; distinct names may still share a family.',
        'limitations': [
            'Source render flags are candidate labels, not independently accepted visible-condition labels.',
            'Contact-sheet flags are inherited triage, not full-resolution visibility approval.',
            'Human family, visibility and label review remain required; every split is blank.',
            'Local hashes check consistency with the saved manifest, not publisher authenticity.',
            'No image decoding or complete source archive verification is performed here.',
            'Synthetic pilot only; academic-use and mixed resource restrictions remain applicable.',
        ],
    }
    # All validation completes before reserving a fresh output directory. Never remove
    # or replace existing output; incomplete outputs after an I/O failure remain visible.
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir()
    with (output / 'review-queue.csv').open('x', encoding='utf-8', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    for name, value in [('review-summary.json', summary), ('verified-files.json', file_records)]:
        with (output / name).open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(json.dumps(value, indent=2, sort_keys=True) + '\n')
    return summary


class RedactedParser(argparse.ArgumentParser):
    def error(self, message):
        raise ReviewError('invalid_arguments')


def main(argv=None):
    parser = RedactedParser(description=__doc__)
    parser.add_argument('--source', required=True, help='Existing pilot directory under research/datasets')
    parser.add_argument('--output', required=True, help='New review directory under research/datasets')
    try:
        args = parser.parse_args(argv)
        result = prepare(args.source, args.output)
    except ReviewError as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        return 2
    except (OSError, ValueError, TypeError, KeyError, OverflowError, RecursionError, csv.Error):
        print(json.dumps({'error': 'invalid_or_unreadable_input_or_output'}), file=sys.stderr)
        return 2
    print(json.dumps({key: result[key] for key in ['samples', 'candidate_groups', 'verified_files',
                                                   'labels_pending', 'ready_for_split']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
