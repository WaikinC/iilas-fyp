"""Validate and preserve a source-informed assistant parcel review, never approval.

Revalidates the original queue with parcel_review; records PNG header dimensions
and render asset references. Visual assessments are supplied, not inferred here.
All inputs/outputs stay under ignored research/datasets; outputs never overwrite.
"""
from collections import Counter, defaultdict
import csv
import io
import json
from pathlib import Path, PurePosixPath
import re
import struct
import sys
import tempfile

import parcel_review as queue_tool
from parcel_review import ReviewError, confined, parse_json, require, sha256


EXTRA_FIELDS = ['assistant_label', 'assistant_visibility', 'assistant_reason_code',
                'assistant_reason', 'assistant_review_method', 'source_agreement',
                'image_width', 'image_height', 'asset_root', 'obj_reference',
                'mtl_reference', 'binvox_reference', 'texture_reference',
                'proposed_asset_family_id']


def asset_fields(data, model):
    keys = {'OBJ', 'MTL', 'BINVOX', 'TEXTURE', 'IMAGE_WIDTH', 'IMAGE_HEIGHT'}
    values = {}
    sections_seen = set()
    section, in_model = None, False
    for line in data.decode('utf-8').splitlines():
        heading = re.match(r'''^[ \t]*["']?(SCENARIO|MODEL|RENDER)["']?\s*:''', line)
        if heading:
            name = heading.group(1)
            require(name not in sections_seen, 'ambiguous_asset_section')
            sections_seen.add(name)
            if name == 'MODEL':
                require(section == 'SCENARIO' and line == '  MODEL:', 'unsupported_asset_section')
                in_model = True
            else:
                require(line == name + ':', 'unsupported_asset_section')
                section, in_model = name, False
            continue
        key = re.match(r'''^[ \t]*["']?(OBJ|MTL|BINVOX|TEXTURE|IMAGE_WIDTH|IMAGE_HEIGHT)["']?\s*:''', line)
        if key:
            name = key.group(1)
            require(name not in values, 'ambiguous_asset_metadata')
            if name in {'OBJ', 'MTL', 'BINVOX'}:
                require(section == 'SCENARIO' and in_model, 'asset_metadata_wrong_section')
            elif name == 'TEXTURE':
                require(section == 'SCENARIO', 'asset_metadata_wrong_section')
                in_model = False
            else:
                require(section == 'RENDER', 'asset_metadata_wrong_section')
            indent = '    ' if name in {'OBJ', 'MTL', 'BINVOX'} else '  '
            match = re.fullmatch(indent + name + r': ([A-Za-z0-9_./-]+)', line)
            require(match is not None, 'unsupported_asset_metadata')
            values[name] = match.group(1)
            continue
        if line and not line.startswith((' ', '#')):
            section, in_model = None, False
        elif re.match(r'^  [^ ]', line):
            in_model = False
    require(set(values) == keys, 'missing_asset_metadata')
    root = 'google_scanned_objects/' + model
    for key in ['OBJ', 'MTL', 'BINVOX', 'TEXTURE']:
        value = values[key]
        path = PurePosixPath(value)
        require(not path.is_absolute() and '..' not in path.parts and ':' not in value,
                'unsafe_asset_reference')
        if key != 'TEXTURE':
            require(value.startswith(root + '/'), 'asset_root_mismatch')
    require(values['MTL'] == root + '/meshes/model.mtl', 'asset_material_mismatch')
    require(values['OBJ'].endswith('.obj') and values['BINVOX'].endswith('.binvox'), 'asset_extension_mismatch')
    return root, values


def adjudicate(source, queue, review_path, output):
    root = queue_tool.DATASETS.resolve()
    source, queue, review_path, output = [confined(Path(p), root) for p in [source, queue, review_path, output]]
    require(not output.exists(), 'output_exists')
    require(not output.is_relative_to(source) and not output.is_relative_to(queue), 'output_inside_input')
    review_bytes = review_path.read_bytes()
    review = parse_json(review_bytes)
    expected = {'schema_version', 'reviewer_kind', 'review_date', 'review_method', 'source_informed',
                'independent_ground_truth', 'queue_sha256', 'assessments', 'possible_family_links'}
    require(isinstance(review, dict) and set(review) == expected, 'unsupported_review_schema')
    require(review['schema_version'] == 1 and review['reviewer_kind'] == 'assistant'
            and review['source_informed'] is True and review['independent_ground_truth'] is False
            and review['review_method'] == 'original_resolution_view_image', 'not_assistant_review')
    require(isinstance(review['review_date'], str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', review['review_date']), 'invalid_review_date')
    queue_files = {name: confined(queue / name, queue).read_bytes()
                   for name in ['review-queue.csv', 'review-summary.json', 'verified-files.json']}
    queue_bytes = queue_files['review-queue.csv']
    require(sha256(queue_bytes) == review['queue_sha256'], 'queue_hash_mismatch')
    # Reuse every original source/hash/path/config guard, comparing all queue files.
    # TemporaryDirectory owns only its newly created directory under DATASETS.
    with tempfile.TemporaryDirectory(prefix='parcel-validation-', dir=root) as temporary:
        regenerated = Path(temporary) / 'queue'
        source_summary = queue_tool.prepare(source, regenerated)
        for name in ['review-queue.csv', 'review-summary.json', 'verified-files.json']:
            require(queue_files[name] == (regenerated / name).read_bytes(), 'queue_revalidation_mismatch')
    rows = list(csv.DictReader(io.StringIO(queue_bytes.decode('utf-8'))))
    assessments = review['assessments']
    require(isinstance(assessments, list) and len(assessments) == len(rows), 'review_coverage')
    by_position = {}
    fields = {'pilot_position', 'image_sha256', 'assistant_label', 'visibility', 'reason_code', 'reason', 'viewed_original'}
    for item in assessments:
        require(isinstance(item, dict) and set(item) == fields, 'invalid_assessment')
        pos = item['pilot_position']
        require(type(pos) is int and pos > 0 and pos not in by_position, 'duplicate_or_invalid_position')
        require(item['assistant_label'] in {'Normal', 'Damaged', 'Uncertain'}
                and item['visibility'] in {'adequate', 'limited', 'insufficient'}
                and item['viewed_original'] is True, 'invalid_assessment_state')
        require(item['visibility'] != 'insufficient' or item['assistant_label'] == 'Uncertain', 'insufficient_visibility_label')
        require(isinstance(item['reason'], str) and 10 <= len(item['reason']) <= 1000
                and isinstance(item['reason_code'], str) and re.fullmatch(r'[a-z_]{3,80}', item['reason_code']), 'invalid_reason')
        by_position[pos] = item
    require(set(by_position) == {int(row['pilot_position']) for row in rows}, 'review_coverage')
    links = review['possible_family_links']
    require(isinstance(links, list) and len(links) <= len(rows), 'invalid_family_links')
    for link in links:
        require(isinstance(link, dict) and set(link) == {'positions', 'evidence', 'status'}, 'invalid_family_link')
        positions = link['positions']
        require(isinstance(positions, list) and len(positions) >= 2
                and all(type(p) is int and p in by_position for p in positions)
                and len(set(positions)) == len(positions)
                and link['status'] == 'possible_related_assets_pending'
                and isinstance(link['evidence'], str) and 20 <= len(link['evidence']) <= 1500, 'invalid_family_link')
    families = defaultdict(list)
    for row in rows:
        assessment = by_position[int(row['pilot_position'])]
        require(assessment['image_sha256'] == row['image_sha256'], 'review_image_mismatch')
        image_bytes = confined(root / row['image_path'], source).read_bytes()
        require(image_bytes[:8] == b'\x89PNG\r\n\x1a\n' and image_bytes[12:16] == b'IHDR', 'invalid_png_header')
        width, height = struct.unpack('!II', image_bytes[16:24])
        asset_root, config = asset_fields(confined(root / row['render_config_path'], source).read_bytes(), row['source_model'])
        require(width > 0 and height > 0 and (width, height) == (int(config['IMAGE_WIDTH']), int(config['IMAGE_HEIGHT'])), 'image_dimensions_mismatch')
        family_id = 'asset-root-' + sha256(asset_root.encode())
        families[family_id].append(int(row['pilot_position']))
        label = assessment['assistant_label']
        row.update(assistant_label=label, assistant_visibility=assessment['visibility'],
            assistant_reason_code=assessment['reason_code'], assistant_reason=assessment['reason'],
            assistant_review_method=review['review_method'],
            source_agreement='uncertain' if label == 'Uncertain' else 'agrees' if label == row['candidate_label'] else 'disagrees',
            image_width=width, image_height=height, asset_root=asset_root,
            obj_reference=config['OBJ'], mtl_reference=config['MTL'], binvox_reference=config['BINVOX'],
            texture_reference=config['TEXTURE'], proposed_asset_family_id=family_id)
    csv_buffer = io.StringIO(newline='')
    writer = csv.DictWriter(csv_buffer, fieldnames=queue_tool.FIELDS + EXTRA_FIELDS)
    writer.writeheader()
    writer.writerows(rows)
    csv_bytes = csv_buffer.getvalue().encode('utf-8')
    summary = {'schema_version': 1, 'reviewer_kind': 'assistant', 'source_informed': True,
        'independent_ground_truth': False, 'samples': len(rows),
        'assistant_label_counts': dict(Counter(r['assistant_label'] for r in rows)),
        'visibility_counts': dict(Counter(r['assistant_visibility'] for r in rows)),
        'source_agreement_counts': dict(Counter(r['source_agreement'] for r in rows)),
        'candidate_asset_roots': len(families), 'repeated_asset_roots': sum(len(v) > 1 for v in families.values()),
        'possible_cross_root_links': len(links), 'human_labels_pending': len(rows),
        'human_review_complete': False, 'family_independence_verified': False, 'family_grouping_approved': False,
        'ready_for_split': False, 'model_trained': False, 'original_queue_preserved': True,
        'source_verified_files': source_summary['verified_files'],
        'visual_review_attestation': 'Assistant supplied; validator cannot prove that visual review occurred.',
        'image_validation': 'Original image hashes and PNG header dimensions; no pixel decoding by this CLI.',
        'grouping_evidence': 'Shared GSO root in OBJ, MTL and BINVOX references; different roots do not prove independence.',
        'final_authority': 'Human review of condition, visibility and related source assets remains pending.',
        'input_sha256': sha256(review_bytes), 'queue_sha256': sha256(queue_bytes),
        'review_csv_sha256': sha256(csv_bytes),
        'code_sha256': sha256(Path(__file__).read_bytes()),
        'queue_code_sha256': sha256(Path(queue_tool.__file__).read_bytes())}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir()
    outputs = {'assistant-review.csv': csv_bytes, 'assistant-input.json': review_bytes,
        'summary.json': (json.dumps(summary, indent=2, sort_keys=True) + '\n').encode(),
        'family-proposals.json': (json.dumps({'shared_asset_root_members': dict(sorted(families.items())),
            'possible_links_not_merged': links, 'approved': False}, indent=2, sort_keys=True) + '\n').encode(),
        'adjudication-code-snapshot.py': Path(__file__).read_bytes(),
        'queue-code-snapshot.py': Path(queue_tool.__file__).read_bytes()}
    for name, data in outputs.items():
        with (output / name).open('xb') as stream:
            stream.write(data)
    return summary


def main(argv=None):
    parser = queue_tool.RedactedParser(description=__doc__)
    for name in ['source', 'queue', 'review', 'output']:
        parser.add_argument('--' + name, required=True)
    try:
        args = parser.parse_args(argv)
        result = adjudicate(args.source, args.queue, args.review, args.output)
    except ReviewError as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        return 2
    except (OSError, ValueError, TypeError, KeyError, OverflowError, RecursionError, csv.Error, struct.error):
        print(json.dumps({'error': 'invalid_or_unreadable_review_input_or_output'}), file=sys.stderr)
        return 2
    print(json.dumps({k: result[k] for k in ['samples', 'assistant_label_counts', 'candidate_asset_roots', 'ready_for_split']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
