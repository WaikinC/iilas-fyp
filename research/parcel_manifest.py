"""Approved parcel cohort schemas (local research only).

Schema v2 is exclusively publisher_packaging_development/development_only.
It binds publisher_annotations and publisher_policy JSON paths and SHA-256s.
Snapshot annotation_files map local relative paths to original annotation hashes;
captures bind capture/source/item IDs, publisher_defect (bool), item_material,
publisher_split, crop_image/crop_sha256 and original_image/original_sha256.
Paths in annotation_files resolve at the snapshot; image paths at image_root.
Rows use publisher labels, publisher_item groups, query_crop role and packaging
target, with exact kaputt:item:<source_item_identifier> group IDs. No physical
parcel identity or human-reviewed label is asserted. Source file hashes remain
checked without Parquet imports. Metadata-only mode never reads image bytes.

JSON keys: schema_version=1, image_root (absolute directory under the ignored
research/datasets tree), domain (real|synthetic), source_registry
(relative JSON path), source_registry_sha256, rows. Registry maps source_id to
licence, provenance, licence_evidence (meaningful strings), approved=true.
Each row requires sample_id, image_path (relative), image_sha256, label
(Normal|Damaged), label_status=reviewed, review_evidence (reviewer/dossier ref),
source_id, origin matching domain, group_id, group_status=confirmed,
role=primary, target_status=single_principal, split (empty|train|validation|test).
Optional dependency_ids list links physical parcels, sessions and derived assets
transitively, in the same identity namespace as group_id. Preserve original
review evidence; it is a declaration, not proof of independent human review.
Optional near_duplicate_flags require near_duplicate_decision evidence.
Frozen documents add original_manifest_sha256 and explicit splits. They never
overwrite files. _image_path and _group_id are runtime-only resolved fields.
Each source must cover both classes across the whole cohort (not each split).
This conservative admission guard does not establish freedom from background,
session or other confounding; review those explicitly before any real study.
Metadata-only validation never decodes pixels; image verification checks hashes,
readability, dimensions and exact decoded duplicates, not semantic independence.
TAMPAR sources/review files are conservatively reserved, never eligible here.
"""
import hashlib
import json
from pathlib import Path, PureWindowsPath
from collections import Counter

LABELS = ('Normal', 'Damaged')
SPLITS = ('train', 'validation', 'test')
BASE = Path(__file__).resolve().parents[1]
RESERVED_REVIEW = BASE/'research/datasets/tampar-label-review-20261020/resolved-review.csv'
PUBLISHER_PROFILE = 'publisher_packaging_development'
PROFILE_FIELDS = ('benchmark_profile', 'evaluation_scope', 'publisher_annotations',
                  'publisher_annotations_sha256', 'publisher_policy', 'publisher_policy_sha256')


def _sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def benchmark_context(doc):
    """Portable scope/provenance facts, without local file paths."""
    if doc.get('schema_version') != 2:
        return {}
    return {k: doc.get(k) for k in ('benchmark_profile', 'evaluation_scope',
            'publisher_annotations_sha256', 'publisher_policy_sha256')} | {
        'label_basis': 'publisher_defect_annotation',
        'grouping_basis': 'publisher_item_identifier',
        'grouping_interpretation': (
            'Equal connected source-item groups are weighted and resampled; each dependency '
            'component receives one total weight. Physical parcel/session identities are unverified.'),
        'evaluation_boundary': (
            'Internal development holdout from already screened publisher TRAIN images; '
            'not an official source test or final independent IILAS evaluation.')}


def _hash_value(value):
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def _publisher_snapshot(doc, path, root, verify_images):
    declared_images = {_relative(row['image_path'], root) for row in doc.get('rows', [])
                       if isinstance(row, dict) and 'image_path' in row}
    records = {}
    for key in ('publisher_annotations', 'publisher_policy'):
        file = _local(_relative(doc[key], path.parent))
        if file.suffix.lower() != '.json' or file in declared_images:
            raise ValueError('publisher provenance must be JSON metadata, not image input')
        if not _hash_value(doc[key + '_sha256']) or _sha(file) != doc[key + '_sha256']:
            raise ValueError('publisher provenance hash mismatch')
        records[key] = (file, json.loads(file.read_text(encoding='utf-8')))
    policy_path, policy = records['publisher_policy']
    snapshot_path, snapshot = records['publisher_annotations']
    if (not isinstance(policy, dict)
            or policy.get('mapping') != {'defect=false': 'Normal', 'defect=true': 'Damaged'}
            or policy.get('human_relabelling_required_for_this_benchmark') is not False):
        raise ValueError('invalid publisher label policy')
    source_hashes = policy.get('source_hashes')
    if not isinstance(source_hashes, dict) or not source_hashes:
        raise ValueError('publisher policy source hashes required')
    if not isinstance(snapshot, dict) or type(snapshot.get('schema_version')) is not int or snapshot['schema_version'] != 1:
        raise ValueError('invalid publisher annotation snapshot')
    captures = snapshot.get('captures')
    if not isinstance(captures, list) or not captures or any(not isinstance(c, dict) for c in captures):
        raise ValueError('publisher capture records required')
    for capture in captures:
        for kind in ('crop', 'original'):
            declared_images.add(_relative(capture[kind + '_image'], root))
    policy_files = {}
    for name, digest in source_hashes.items():
        file = _local(_relative(name, policy_path.parent))
        if file.suffix.lower() not in ('.json', '.parquet') or file in declared_images:
            raise ValueError('publisher policy provenance must not reference image bytes')
        if not _hash_value(digest) or _sha(file) != digest:
            raise ValueError('publisher policy source hash mismatch')
        policy_files[file] = digest
    annotations = snapshot.get('annotation_files')
    if not isinstance(annotations, dict) or not annotations:
        raise ValueError('original publisher annotation hashes required')
    for name, digest in annotations.items():
        file = _local(_relative(name, snapshot_path.parent))
        if (not _hash_value(digest) or file.suffix.lower() != '.parquet'
                or policy_files.get(file) != digest):
            raise ValueError('publisher annotation provenance differs from policy')
    lookup, crops, originals = {}, set(), set()
    for capture in captures:
        if not isinstance(capture, dict):
            raise ValueError('invalid publisher capture')
        if (any(not _text(capture.get(k), minimum=1) for k in ('capture_id', 'source_item_identifier'))
                or capture.get('source_id') != 'kaputt'
                or type(capture.get('publisher_defect')) is not bool
                or capture.get('item_material') != 'cardboard'
                or capture.get('publisher_split') != 'train'):
            raise ValueError('invalid publisher capture annotation')
        if capture['capture_id'] in lookup:
            raise ValueError('duplicate publisher capture')
        lookup[capture['capture_id']] = capture
        for kind, seen in (('crop', crops), ('original', originals)):
            file = _relative(capture[kind + '_image'], root)
            digest = capture[kind + '_sha256']
            if (not _hash_value(digest) or not file.is_file()
                    or file.stat().st_size > 16 * 1024 * 1024 or file in seen):
                raise ValueError('invalid or duplicate publisher ' + kind)
            seen.add(file)
            if verify_images and _sha(file) != digest:
                raise ValueError('publisher ' + kind + ' hash mismatch')
    if crops & originals:
        raise ValueError('publisher originals and query crops must be distinct files')
    return lookup


def _publisher_row(row, captures, seen, root):
    capture_id = row.get('capture_id')
    if not isinstance(capture_id, str) or capture_id not in captures or capture_id in seen:
        raise ValueError('missing or duplicate publisher capture')
    seen.add(capture_id)
    capture = captures[capture_id]
    if (row.get('label_status') != 'publisher' or row.get('group_status') != 'publisher_item'
            or row.get('role') != 'query_crop' or row.get('target_status') != 'packaging'
            or row.get('review_evidence')):
        raise ValueError('publisher provenance statuses required; human/physical claims forbidden')
    if (type(row.get('publisher_defect')) is not bool
            or any(row.get(k) != capture[k] for k in ('source_id', 'source_item_identifier',
                       'publisher_defect', 'item_material', 'publisher_split'))
            or row['label'] != ('Damaged' if capture['publisher_defect'] else 'Normal')
            or row['group_id'] != 'kaputt:item:' + capture['source_item_identifier']
            or _relative(row['image_path'], root) != _relative(capture['crop_image'], root)
            or row['image_sha256'] != capture['crop_sha256']):
        raise ValueError('row differs from publisher annotation or source item group')


def _text(value, minimum=4):
    return isinstance(value, str) and len(value.strip()) >= minimum and value.strip().lower() not in {'unknown','none','pending','n/a','todo'}


def _safe(path, root):
    path = Path(path)
    if not path.is_absolute():
        path = root / path
    if '..' in path.parts:
        raise ValueError('path traversal forbidden')
    for component in (path, *path.parents):
        if component.is_symlink() or (hasattr(component, 'is_junction') and component.is_junction()):
            raise ValueError('linked paths forbidden')
    resolved = path.resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise ValueError('path outside approved dataset root')
    return resolved


def _local(path):
    import runner_runtime
    try:
        return runner_runtime._validate_output_path(path)
    except runner_runtime.RuntimeSafetyError as error:
        raise ValueError(str(error)) from error


def _relative(value, root):
    if not isinstance(value,str) or Path(value).is_absolute() or PureWindowsPath(value).is_absolute() or ':' in value:
        raise ValueError('relative dataset path required')
    return _safe(root / value, root)


def load_manifest(path, verify_images=True):
    """Validate metadata and dependency isolation; optionally decode all images."""
    try:
        path = _local(path)
        doc = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(doc,dict): raise ValueError('manifest must be an object')
        version = doc.get('schema_version')
        if type(version) is not int or version not in (1, 2) or doc.get('domain') not in ('real','synthetic'):
            raise ValueError('unsupported manifest schema/domain')
        if version == 1 and any(k in doc for k in PROFILE_FIELDS):
            raise ValueError('publisher profile requires explicit schema v2')
        if version == 2 and (doc.get('benchmark_profile') != PUBLISHER_PROFILE
                            or doc.get('evaluation_scope') != 'development_only'
                            or doc['domain'] != 'real'):
            raise ValueError('schema v2 requires real publisher development-only profile')
        root = Path(doc['image_root'])
        if not root.is_absolute(): raise ValueError('absolute image_root required')
        root = _local(root)
        captures = _publisher_snapshot(doc, path, root, verify_images) if version == 2 else {}
        seen_captures = set()
        registry_path = _local(_relative(doc['source_registry'], path.parent))
        if _sha(registry_path) != doc['source_registry_sha256']: raise ValueError('source registry hash mismatch')
        registry = json.loads(registry_path.read_text(encoding='utf-8'))
        if not isinstance(registry,dict): raise ValueError('source registry must be a mapping')
        rows = doc['rows']
        if not isinstance(rows,list) or not rows: raise ValueError('empty manifest')
        ids, decoded, files = set(), set(), set()
        import csv
        reserved_hashes=set()
        if RESERVED_REVIEW.is_file():
            with RESERVED_REVIEW.open(encoding='utf-8-sig',newline='') as stream:
                reserved_hashes={r['original_sha256'] for r in csv.DictReader(stream)}
        parent = {}
        def find(x):
            parent.setdefault(x,x)
            if parent[x]!=x: parent[x]=find(parent[x])
            return parent[x]
        def union(a,b):
            a,b=find(a),find(b)
            parent[max(a,b)]=min(a,b)
        for row in rows:
            if not isinstance(row,dict): raise ValueError('row must be an object')
            for field in ('sample_id','group_id','source_id','image_path','image_sha256'):
                if not isinstance(row.get(field),str) or not row[field].strip(): raise ValueError('missing '+field)
            if row['image_sha256'] in reserved_hashes: raise ValueError('reserved TAMPAR diagnostic image hash')
            if row['sample_id'] in ids: raise ValueError('duplicate sample_id')
            ids.add(row['sample_id'])
            if any('tampar' in str(row.get(k,'')).lower() for k in ('source_id','image_path','review_evidence')) or 'tampar' in str(root).lower():
                raise ValueError('TAMPAR diagnostic/reference material is reserved')
            source = registry.get(row['source_id'],{})
            if not isinstance(source,dict): raise ValueError('source entry must be an object')
            if (source.get('approved') is not True or not _text(source.get('licence'),minimum=3)
                    or any(not _text(source.get(k)) for k in ('provenance','licence_evidence'))):
                raise ValueError('unapproved source or unknown licence/evidence')
            if version == 2:
                _publisher_row(row, captures, seen_captures, root)
            elif row.get('label') not in LABELS or row.get('label_status')!='reviewed' or not _text(row.get('review_evidence')):
                raise ValueError('reviewed human label evidence required')
            if version == 1 and (row.get('group_status')!='confirmed' or row.get('role')!='primary' or row.get('target_status')!='single_principal'):
                raise ValueError('confirmed primary single principal parcel required; challenge excluded')
            if row.get('origin')!=doc['domain']: raise ValueError('mixed real/synthetic domain')
            if row.get('split') not in ('',*SPLITS): raise ValueError('invalid split')
            if row.get('near_duplicate_flags') and not _text(row.get('near_duplicate_decision')): raise ValueError('near duplicate decision required')
            deps=row.get('dependency_ids',[])
            if not isinstance(deps,list) or any(not isinstance(x,str) or not x.strip() for x in deps): raise ValueError('invalid dependency_ids')
            find(row['group_id'])
            for dep in deps: union(row['group_id'],dep)
            image = _relative(row['image_path'],root)
            if image in files: raise ValueError('duplicate image path')
            files.add(image)
            if not image.is_file() or image.stat().st_size>16*1024*1024: raise ValueError('missing or oversized image')
            if len(row['image_sha256'])!=64 or any(c not in '0123456789abcdef' for c in row['image_sha256']): raise ValueError('invalid image SHA256')
            row['_image_path']=str(image)
            if verify_images:
                if _sha(image)!=row['image_sha256']: raise ValueError('image hash mismatch')
                from parcel_inputs import decode_rgb
                pixels=decode_rgb(image.read_bytes())
                digest=hashlib.sha256(str(pixels.shape).encode()+pixels.tobytes()).hexdigest()
                if digest in decoded: raise ValueError('duplicate decoded image')
                decoded.add(digest)
        source_classes={}
        for row in rows:
            source_classes.setdefault(row['source_id'],set()).add(row['label'])
        if any(labels!=set(LABELS) for labels in source_classes.values()):
            raise ValueError('each source must contain both classes; source/class confounding forbidden')
        groups={}
        for row in rows:
            row['_group_id']=find(row['group_id'])
            groups.setdefault(row['_group_id'],set()).add(row['split'])
        if any(len(v)>1 for v in groups.values()): raise ValueError('connected group crosses partitions')
        if any(r['split'] for r in rows):
            if any(not r['split'] for r in rows): raise ValueError('partial split assignment')
            for split in SPLITS:
                if {r['label'] for r in rows if r['split']==split}!=set(LABELS): raise ValueError('partition missing class')
        return doc
    except (KeyError, TypeError, OSError, json.JSONDecodeError) as exc:
        raise ValueError('invalid manifest or inaccessible dataset metadata') from exc


def audit_manifest(path, verify_images=True):
    doc=load_manifest(path,verify_images)
    def counts(rows):
        return {'images':len(rows),'groups':len({r['_group_id'] for r in rows}), 'classes':dict(Counter(r['label'] for r in rows)), 'group_classes':{label:len({r['_group_id'] for r in rows if r['label']==label}) for label in LABELS}}
    context = {'benchmark_context': benchmark_context(doc)} if doc['schema_version'] == 2 else {}
    return {'manifest_sha256':_sha(Path(path)), 'domain':doc['domain'], **context, **counts(doc['rows']), 'sources':{source:counts([r for r in doc['rows'] if r['source_id']==source]) for source in sorted({r['source_id'] for r in doc['rows']})}, 'partitions':{s:counts([r for r in doc['rows'] if r['split']==s]) for s in SPLITS}}


def freeze_split(manifest_path, output, seed=42):
    """Freeze approximately 70/15/15, retaining whole connected groups."""
    doc=load_manifest(manifest_path)
    rows=doc['rows']
    if any(r['split'] for r in rows): raise ValueError('manifest already partitioned')
    groups={}
    for row in rows: groups.setdefault(row['_group_id'],[]).append(row)
    totals={label:sum(any(r['label']==label for r in members) for members in groups.values()) for label in LABELS}
    if min(totals.values())<5: raise ValueError('minimum five eligible groups per class; not scientific adequacy')
    ratios=(.70,.15,.15)
    achieved={s:Counter() for s in SPLITS}
    assignments={}
    ranked=sorted(groups,key=lambda g:(hashlib.sha256(f'{seed}:{g}'.encode()).hexdigest(),g))
    # Highest normalized remaining class/group shortfall; stable split tie order.
    for group in ranked:
        labels={r['label'] for r in groups[group]}
        scores=[]
        for s,ratio in zip(SPLITS,ratios):
            scores.append(sum((ratio*totals[label]-achieved[s][label])/totals[label] for label in labels)+(ratio*len(groups)-achieved[s]['groups'])/len(groups))
        split=SPLITS[max(range(3),key=lambda i:scores[i])]
        assignments[group]=split
        achieved[split].update(labels)
        achieved[split]['groups']+=1
    for row in rows:
        row['split']=assignments[row.pop('_group_id')]
        row.pop('_image_path')
    for s in SPLITS:
        if {r['label'] for r in rows if r['split']==s}!=set(LABELS): raise ValueError('allocation lacks class in partition; collect more independent groups')
    manifest_path=Path(manifest_path).resolve()
    output=_local(output)
    # Preserve registry linkage even when output has another dataset directory.
    import os
    links = ('source_registry', 'publisher_annotations', 'publisher_policy') if doc['schema_version'] == 2 else ('source_registry',)
    for key in links:
        doc[key]=os.path.relpath(manifest_path.parent/doc[key],output.parent)
        if '..' in Path(doc[key]).parts: raise ValueError('output must preserve safe provenance-relative location')
    doc['original_manifest_sha256']=_sha(manifest_path)
    receipt_path=_local(Path(str(output)+'.audit.json'))
    if receipt_path.exists(): raise FileExistsError('audit receipt already exists')
    with output.open('x',encoding='utf-8') as stream: json.dump(doc,stream,indent=2,sort_keys=True)
    receipt={**audit_manifest(output), 'schema_version':doc['schema_version'], 'verify_images':True, 'source_registry_sha256':doc['source_registry_sha256']}
    with receipt_path.open('x',encoding='utf-8') as stream: json.dump(receipt,stream,indent=2,sort_keys=True)
    return output





