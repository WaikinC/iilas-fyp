"""Bounded public TRAIN/VALID intake; TEST pixels are never opened.

Preparation is a native-supervised operation. Its immutable candidate is not
training admission: an independently recorded, prediction-blind sampled quality
review admits a separate manifest. Publisher labels are never rewritten.
Filename/dHash links are conservative dependencies, not physical identities or
proof of exact duplicates. Hash seals protect drift, not a malicious local owner.
"""
from collections import Counter, defaultdict
import copy
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import sys
import zipfile
import zlib

import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
CODE_ROOT = Path(__file__).resolve().parent
SOURCE_SHA256 = 'b10758ad148b9ad8fc8aac21365da2a62b532af1b9b8441ec0a45366352f9ffc'
EXPECTED_IMAGES = 4148
MiB = 1024**2
PROFILE = 'parcel_visible_development'
CLASSES = {'undamagedpackages': 'Normal', 'damagedpackages': 'Damaged'}
HEX = re.compile(r'[0-9a-f]{64}\Z')
POLICY = dict(seed=42, max_train=1600, max_validation=400, max_component_views=4,
    max_family_views=1, minimum_side=64, max_pixels=16000000, max_file_bytes=16*MiB,
    max_expanded_bytes=512*MiB, dhash_distance=4, test_pixels_allowed=False,
    filename_family_is_physical_identity=False, filename_family_is_exact_duplicate=False,
    physical_session_identity='unknown', original_geometry_recovered=False,
    source_transform='publisher v1 640-square stretch and training augmentation; exported derivatives',
    quality_basis='publisher_label_not_independently_verified',
    holdout_status='publisher_TEST_not_certified_unexposed_or_independent',
    preview_status='known TRAIN detail IDs rScgrstZNtmkSKwTJ4sb and 6ndLI2LxSbhSIFLMWi7c; '
                   'gallery/cover/version previews not fully matched; no fresh-holdout claim')


def _require(ok, message):
    if not ok:
        raise ValueError(message)


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def _local(path):
    path = Path(path).absolute()
    _require('..' not in path.parts, 'Unsafe local path')
    for item in (path, *path.parents):
        _require(not item.is_symlink() and not (hasattr(item, 'is_junction') and item.is_junction()),
                 'Local links/junctions forbidden')
    return path.resolve()


def _json(path):
    path = _local(path)
    _require(path.is_file() and 0 < path.stat().st_size <= 32*MiB, 'Bounded JSON metadata required')
    def unique(pairs):
        doc = {}
        for key, value in pairs:
            _require(key not in doc, 'Duplicate JSON key')
            doc[key] = value
        return doc
    def invalid(value):
        raise ValueError('Nonfinite JSON: '+value)
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique, parse_constant=invalid)


def _record(path):
    path = _local(path)
    return dict(path=str(path), sha256=runtime.sha256_file(path))


def _verify_record(record):
    _require(isinstance(record, dict) and set(record)=={'path', 'sha256'}
             and HEX.fullmatch(record.get('sha256', '')), 'Invalid binding')
    _require(_record(record['path'])==record, 'Changed metadata/source binding')
    return Path(record['path'])


def _seal(path, payload):
    runtime.write_json_exclusive(path, dict(payload=payload, sha256=_digest(payload)))
    return Path(path)


def _unseal(path):
    doc = _json(path)
    _require(isinstance(doc, dict) and set(doc)=={'payload', 'sha256'}
             and _digest(doc['payload'])==doc['sha256'], 'Invalid manifest seal')
    return doc['payload']


def _code_bindings():
    return {name: runtime.sha256_file(CODE_ROOT/name)
            for name in ('parcel_visible_manifest.py', 'parcel_inputs.py', 'runner_runtime.py')}


def _identity(path):
    value = path.stat()
    return dict(bytes=value.st_size, device=value.st_dev, inode=value.st_ino, mtime_ns=value.st_mtime_ns)


def _source_receipt(receipt, *, hash_archive):
    receipt = _local(receipt)
    completion = _json(receipt)
    report_path, native_path = receipt.parent/'report.json', receipt.parent/'metadata.result.json'
    _require(completion.get('status')=='metadata_complete_not_image_or_training_admission'
             and runtime.sha256_file(report_path)==completion.get('report_sha256')
             and runtime.sha256_file(native_path)==completion.get('native_sha256'), 'Invalid source metadata receipt binding')
    report, native = _json(report_path), _json(native_path)
    _require(native.get('status')=='success' and native.get('returncode')==0 and native.get('reason') is None
             and 0 < native.get('elapsed_seconds', 0)<=180 and 0 < native.get('peak_rss_bytes', 0)<=512*MiB,
             'Source metadata native completion failed or exceeded bounds')
    _require(report.get('status')=='metadata_audit_only' and report.get('pixels_decoded')==0
             and report.get('training_admission') is False and report.get('images')==EXPECTED_IMAGES
             and report.get('source_sha256')==SOURCE_SHA256, 'Wrong source metadata/profile')
    source = _local(report['source'])
    _require(source.is_file() and _identity(source)==report.get('source_identity'), 'Changed source archive identity')
    if hash_archive:
        _require(runtime.sha256_file(source)==SOURCE_SHA256, 'Changed source archive hash')
    return report, [_record(path) for path in (receipt, report_path, native_path)]


def _member(name):
    _require(isinstance(name, str) and name and '\\' not in name and ':' not in name
             and not name.startswith('/') and '\0' not in name, 'Unsafe ZIP member')
    path = PurePosixPath(name)
    _require(all(part not in ('', '.', '..') and not part.endswith((' ', '.')) for part in name.rstrip('/').split('/')),
             'Unsafe ZIP member')
    for part in path.parts:
        _require(part.split('.')[0].upper() not in {'CON','PRN','AUX','NUL',
            *(f'COM{i}' for i in range(1,10)), *(f'LPT{i}' for i in range(1,10))}, 'Unsafe ZIP member')
    if len(path.parts)==3 and path.parts[0] in ('train','valid','test'):
        _require(path.parts[1] in CLASSES and path.suffix.lower() in ('.jpg','.jpeg','.png','.webp'), 'Unknown image class/member')
        return path.parts[0], path.parts[1], path.name
    raise ValueError('Unknown image member/class')


def _family(filename):
    return filename.split('.rf.')[0]


def _dimensions(data):
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        offset, dimensions, ended = 8, None, False
        while offset+12<=len(data):
            length = int.from_bytes(data[offset:offset+4],'big')
            kind = data[offset+4:offset+8]
            end = offset+12+length
            _require(end<=len(data), 'Truncated PNG chunk')
            payload = data[offset+8:offset+8+length]
            _require(zlib.crc32(kind+payload)==int.from_bytes(data[end-4:end],'big'), 'PNG CRC invalid')
            if kind==b'IHDR':
                _require(dimensions is None and offset==8 and length==13, 'Invalid PNG header')
                dimensions = struct.unpack('>II',payload[:8])
            if kind==b'IEND':
                _require(length==0 and end==len(data), 'Invalid PNG end'); ended=True; break
            offset = end
        _require(ended and dimensions is not None, 'Missing PNG header/end')
        return dimensions
    _require(data.startswith(b'\xff\xd8') and data.endswith(b'\xff\xd9'), 'Unsupported/truncated JPEG/PNG')
    stream = io.BytesIO(data); stream.seek(2)
    for _ in range(65536):
        _require(stream.tell()<=MiB and stream.read(1)==b'\xff', 'Invalid/bounded JPEG header')
        marker = stream.read(1)
        while marker==b'\xff':
            marker = stream.read(1)
        _require(bool(marker) and marker not in (b'\x00',b'\xd9',b'\xda'), 'JPEG dimensions missing')
        if marker[0] in range(0xd0,0xd9) or marker==b'\x01':
            continue
        length = stream.read(2)
        _require(len(length)==2, 'Truncated JPEG segment')
        size = int.from_bytes(length,'big')
        _require(size>=2 and stream.tell()+size-2<=len(data), 'Invalid JPEG segment')
        if marker[0] in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf):
            head = stream.read(5)
            _require(size>=8 and len(head)==5, 'Invalid JPEG frame')
            height,width = struct.unpack('>HH',head[1:])
            return width,height
        stream.seek(size-2,1)
    raise ValueError('JPEG header bound exceeded')


def _decode(data):
    # Header bounds precede the shared OpenCV decode (EXIF once, RGB once).
    width,height = _dimensions(data)
    _require(min(width,height)>=64 and width*height<=16000000, 'Image dimension bounds')
    import cv2
    from parcel_inputs import decode_rgb
    rgb = decode_rgb(data)
    height, width = rgb.shape[:2]
    _require(min(width,height)>=64 and width*height<=16000000, 'Decoded dimension bounds')
    small = cv2.resize(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), (9,8), interpolation=cv2.INTER_AREA)
    bits = (small[:,1:]>small[:,:-1]).ravel()
    value = 0
    for bit in bits:
        value = (value << 1) | int(bit)
    return dict(width=width, height=height, pixel_sha256=hashlib.sha256(rgb.tobytes()).hexdigest(), dhash=f'{value:016x}')


class _Union:
    def __init__(self, count):
        self.parents = list(range(count))
    def find(self, index):
        while index != self.parents[index]:
            self.parents[index] = self.parents[self.parents[index]]
            index = self.parents[index]
        return index
    def join(self, left, right):
        left, right = self.find(left), self.find(right)
        self.parents[max(left,right)] = min(left,right)


def _rank(value):
    return hashlib.sha256(('42|'+value).encode()).hexdigest()


def _graph(rows):
    conservative, verified = _Union(len(rows)), _Union(len(rows))
    counts = Counter()
    for key, strict in [('source_family',False), ('sha256',True), ('pixel_sha256',True)]:
        seen = {}
        for index, row in enumerate(rows):
            value = row.get(key)
            if value is None:
                continue
            if key=='pixel_sha256':
                value = (row.get('width'),row.get('height'),value)
            if value in seen:
                conservative.join(index,seen[value]); counts[key] += 1
                if strict:
                    verified.join(index,seen[value])
            else:
                seen[value] = index
    decoded = [(index,int(row['dhash'],16)) for index,row in enumerate(rows) if row['dhash'] is not None]
    for pos,(index,value) in enumerate(decoded):
        for other, other_value in decoded[:pos]:
            if (value^other_value).bit_count()<=4:
                conservative.join(index,other); counts['dhash_candidates'] += 1
    groups, exact = defaultdict(list), defaultdict(list)
    for index, row in enumerate(rows):
        groups[conservative.find(index)].append(row)
        exact[verified.find(index)].append(row)
    for family in exact.values():
        reasons = set()
        if len({row['label'] for row in family})>1:
            reasons.add('verified_label_conflict')
        if any('rights_uncleared_stock' in row['reasons'] for row in family):
            reasons.add('rights_uncleared_stock')
        if any('technical_invalid' in row['reasons'] for row in family):
            reasons.add('technical_verified_derivative')
        for row in family:
            row['reasons'].extend(reasons)
    for component in groups.values():
        group_id = 'dep-'+_digest(sorted(row['sample_id'] for row in component))[:24]
        splits = {row['split'] for row in component}
        shared = set()
        if len(splits)>1:
            shared.add('cross_partition_component')
        if 'test' in splits:
            shared.add('published_test_component')
        # A conservative hold is explicitly not a claim of verified derivation.
        if any('rights_uncleared_stock' in row['reasons'] for row in component):
            shared.add('rights_candidate_family')
        if any('technical_invalid' in row['reasons'] for row in component):
            shared.add('technical_candidate_family')
        if any('verified_label_conflict' in row['reasons'] for row in component):
            shared.add('conflict_candidate_family')
        for row in component:
            row['dependency_group_id'] = group_id
            row['reasons'] = sorted(set(row['reasons']) | shared)
    return dict(counts), len(groups)


def _select(rows):
    selected, families, components, splits = [], set(), Counter(), Counter()
    for row in sorted(rows, key=lambda row: (_rank(row['dependency_group_id']), _rank(row['sample_id']))):
        if row['split']=='test':
            row['disposition'] = 'test_reserved'; continue
        if row['reasons']:
            row['disposition'] = 'held'; continue
        family = row['source_family']
        if family in families:
            row['reasons'].append('family_representative_cap')
        elif components[row['dependency_group_id']]>=4:
            row['reasons'].append('component_view_cap')
        elif splits[row['split']] >= (1600 if row['split']=='train' else 400):
            row['reasons'].append('split_view_cap')
        if row['reasons']:
            row['disposition'] = 'not_selected'; continue
        row['disposition'] = 'selected'
        families.add(family); components[row['dependency_group_id']] += 1; splits[row['split']] += 1
        selected.append(copy.deepcopy(row))
    return sorted(selected, key=lambda row: (row['split'], row['sample_id']))


def _summary(rows, dispositions):
    counts = Counter((row['split'],row['label']) for row in rows)
    blockers = [split+'_missing_'+label for split in ('train','validation') for label in ('Normal','Damaged')
                if not counts[split,label]]
    return dict(original_images=len(dispositions), accepted_images=len(rows),
        accepted_split_class={split+'|'+label: counts[split,label] for split in ('train','validation') for label in ('Normal','Damaged')},
        component_support={split:len({row['dependency_group_id'] for row in rows if row['split']==split}) for split in ('train','validation')},
        reasons=dict(Counter(reason for row in dispositions for reason in row['reasons'])),
        admission_blockers=blockers, numerical_expansion_over_633=sum(row['split']=='train' for row in rows)>=634,
        independent_physical_parcel_accuracy_established=False, live_camera_accuracy_established=False)


def _build_candidates(source_receipt, output):
    runtime.require_supervised_worker()
    output = _local(output)
    _require(output.is_dir() and output.is_relative_to(ROOT/'research'/'datasets'), 'Unsafe intake output')
    report, bindings = _source_receipt(source_receipt, hash_archive=True)
    source = Path(report['source'])
    inventory = report['images_inventory']
    _require(isinstance(inventory,list) and len(inventory)==EXPECTED_IMAGES, 'Wrong source inventory count')
    expected = {}
    for row in inventory:
        _member(row['path'])
        _require(row['path'] not in expected, 'Duplicate inventory member')
        expected[row['path']] = row
    rows = []
    images = output/'images'
    images.mkdir(exist_ok=False)
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        _require(len(infos)<=EXPECTED_IMAGES+100, 'ZIP inventory member bound')
        seen, expanded = set(), 0
        image_infos = []
        # Validate the entire directory before any member read or extraction.
        for info in infos:
            name = info.filename
            _require(info.orig_filename==name and '\\' not in info.orig_filename, 'Unsafe normalized ZIP member')
            _require(name not in seen, 'Duplicate ZIP member'); seen.add(name)
            _require(not info.flag_bits&1 and not stat.S_ISLNK(info.external_attr>>16), 'ZIP encrypted/link member')
            if info.is_dir():
                _require(name.rstrip('/') in ('train','valid','test') or name.rstrip('/') in
                    {split+'/'+label for split in ('train','valid','test') for label in CLASSES}, 'Unsafe directory member')
                continue
            if name in ('README.dataset.txt','README.roboflow.txt'):
                _require(info.file_size<=MiB, 'README size bound'); continue
            _member(name)
            _require(name in expected, 'Unexpected ZIP image member')
            record = expected[name]
            _require((info.file_size,info.compress_size,f'{info.CRC:08x}')==
                     (record['bytes'],record['compressed_bytes'],record['crc32']), 'ZIP source inventory drift')
            _require(0<info.file_size<=16*MiB and info.file_size<=200*max(info.compress_size,1), 'ZIP per-file bounds')
            expanded += info.file_size
            _require(expanded<=512*MiB, 'ZIP expanded bound')
            image_infos.append(info)
        _require({info.filename for info in image_infos}==set(expected), 'Missing ZIP source image members')
        for info in sorted(image_infos, key=lambda info:info.filename):
            split, publisher, filename = _member(info.filename)
            sample_id = hashlib.sha256(info.filename.encode()).hexdigest()[:24]
            with archive.open(info) as stream:
                data = stream.read(16*MiB+1)
            _require(len(data)==info.file_size and len(data)<=16*MiB, 'Image encoded bound')
            row = dict(sample_id=sample_id, member=info.filename, split='validation' if split=='valid' else split,
                publisher_class=publisher, label=CLASSES[publisher], source_family=_family(filename),
                sha256=hashlib.sha256(data).hexdigest(), pixel_sha256=None, dhash=None,
                quality='publisher_label_not_independently_verified', rights='source_CC_BY_4_0_not_asset_warranty',
                exposure='preview_membership_not_fully_matched', reasons=[])
            if re.search(r'istock|getty', filename, re.I):
                row['reasons'].append('rights_uncleared_stock')
                row['rights'] = 'rights_uncleared_stock'
            if split!='test':
                try:
                    row.update(_decode(data))
                except Exception as error:
                    row['reasons'].append('technical_invalid')
                    row['technical_error_type'] = type(error).__name__
                else:
                    destination = images/(sample_id+Path(filename).suffix.lower())
                    with open(destination,'xb') as stream:
                        stream.write(data)
                    row['path'] = destination.relative_to(ROOT).as_posix()
            rows.append(row)
    _require(_identity(source)==report['source_identity'] and runtime.sha256_file(source)==SOURCE_SHA256,
             'Changed source archive during intake')
    graph, components = _graph(rows)
    selected = _select(rows)
    payload = dict(schema_version=1, benchmark_profile=PROFILE, class_order=['Normal','Damaged'],
        training_admission=False, policy=POLICY, class_mapping=CLASSES,
        source_inventory=copy.deepcopy(inventory),
        source=dict(path=str(source), sha256=SOURCE_SHA256, identity=report['source_identity'],
            title='Damaged Box Detection', uploader='project-33xgh', version=1, licence='CC BY 4.0',
            url='https://universe.roboflow.com/project-33xgh/damaged-box-detection/dataset/1'),
        bindings=bindings, code_bindings=_code_bindings(), graph=dict(links=graph, components=components),
        rows=selected, dispositions=rows, summary=_summary(selected,rows))
    return _seal(output/'candidate-manifest.json', payload)


def intake_limits():
    return runtime.Limits(max_wall_seconds=600, max_fit_seconds=600, max_rss_bytes=1024*MiB,
        min_available_bytes=3072*MiB, available_floor_bytes=768*MiB, min_free_disk_bytes=20*1024**3,
        max_output_bytes=512*MiB, threads=1)


def prepare_manifest(source_receipt: Path, output: Path) -> Path:
    output = runtime.create_run_directory(output)
    receipt = _record(source_receipt)
    request = output/'request.json'
    runtime.write_json_exclusive(request, dict(source_receipt=receipt, code_bindings=_code_bindings(),
        purpose='visible-development-intake-no-TEST-pixels', limits=vars(intake_limits())))
    result = runtime.ResourceSupervisor(output,intake_limits()).run(
        [sys.executable,str(Path(__file__).resolve()),'_worker',str(request)], fit_id='intake',cwd=ROOT)
    _require(result['status']=='success' and result['returncode']==0, 'Native intake failed; preserved without retry')
    manifest = output/'candidate-manifest.json'
    runtime.write_json_exclusive(output/'intake-completion.json',dict(status='candidate_pending_independent_review',
        manifest=_record(manifest), native=_record(output/'intake.result.json'), request=_record(request)))
    load_manifest(manifest)
    return manifest


def _completion(candidate, source_receipt_binding):
    receipt = _json(candidate.parent/'intake-completion.json')
    _require(receipt.get('status')=='candidate_pending_independent_review'
             and _verify_record(receipt['manifest'])==candidate, 'Invalid candidate native receipt binding')
    native = _json(_verify_record(receipt['native']))
    _require(native.get('status')=='success' and native.get('returncode')==0 and native.get('reason') is None
        and 0<native.get('elapsed_seconds',0)<=600 and 0<native.get('peak_rss_bytes',0)<=1024*MiB,
        'Candidate native worker failed or exceeded bounds')
    request = _json(_verify_record(receipt['request']))
    _require(request.get('code_bindings')==_code_bindings() and request.get('limits')==vars(intake_limits()),
             'Changed intake request bindings')
    _require(request.get('source_receipt')==source_receipt_binding, 'Intake request source receipt mismatch')
    _verify_record(request['source_receipt'])


def _image_path(relative):
    _require(isinstance(relative,str) and '\\' not in relative and not Path(relative).is_absolute()
             and '..' not in PurePosixPath(relative).parts, 'Unsafe image path')
    path = _local(ROOT/relative)
    _require(path.is_relative_to(ROOT/'research'/'datasets') and path.is_file(), 'Image must remain below research/datasets')
    return path


def load_manifest(path: Path) -> dict:
    path = _local(path)
    payload = _unseal(path)
    _require(payload.get('schema_version')==1 and payload.get('benchmark_profile')==PROFILE
             and payload.get('class_order')==['Normal','Damaged'] and payload.get('class_mapping')==CLASSES
             and payload.get('policy')==POLICY and payload.get('code_bindings')==_code_bindings(), 'Manifest profile/code drift')
    for record in payload['bindings']:
        _verify_record(record)
    source = payload['source']
    _require(source['sha256']==SOURCE_SHA256 and _identity(_local(source['path']))==source['identity']
             and runtime.sha256_file(source['path'])==source['sha256'], 'Changed source archive identity/hash')
    dispositions, rows = payload['dispositions'], payload['rows']
    _require(len(payload['source_inventory'])==EXPECTED_IMAGES
             and {row['path'] for row in payload['source_inventory']}=={row['member'] for row in dispositions},
             'Full source inventory changed')
    _require(len(dispositions)==EXPECTED_IMAGES and len({row['sample_id'] for row in dispositions})==EXPECTED_IMAGES,
             'Full source disposition denominator changed')
    _require(rows==sorted([row for row in dispositions if row['disposition']=='selected'],
                         key=lambda row:(row['split'],row['sample_id'])), 'Accepted membership/dispositions changed')
    families, component_counts, component_splits = set(), Counter(), defaultdict(set)
    for row in dispositions:
        split, publisher, name = _member(row['member'])
        _require(row['split']==('validation' if split=='valid' else split) and row['publisher_class']==publisher
                 and row['label']==CLASSES[publisher] and row['source_family']==_family(name)
                 and row['sample_id']==hashlib.sha256(row['member'].encode()).hexdigest()[:24], 'Publisher membership/label changed')
        if split=='test':
            _require('path' not in row and row['pixel_sha256'] is None and row['dhash'] is None
                     and row['disposition']=='test_reserved', 'Forbidden TEST extraction/decode/membership')
        if row['disposition']=='selected':
            _require(split!='test' and not row['reasons'] and row['source_family'] not in families
                     and HEX.fullmatch(row['pixel_sha256']) and row['width']*row['height']<=16000000
                     and min(row['width'],row['height'])>=64, 'Unsafe selected image')
            families.add(row['source_family']); component_counts[row['dependency_group_id']] += 1
            component_splits[row['dependency_group_id']].add(row['split'])
            image = _image_path(row['path'])
            _require(image.stat().st_size<=16*MiB and runtime.sha256_file(image)==row['sha256'], 'Accepted image bytes/hash changed')
    _require(all(count<=4 for count in component_counts.values()) and all(len(splits)==1 for splits in component_splits.values())
             and sum(row['split']=='train' for row in rows)<=1600 and sum(row['split']=='validation' for row in rows)<=400,
             'Manifest component/split cap changed')
    _require(payload['summary']==_summary(rows,dispositions), 'Manifest summary changed')
    candidate = path
    if payload['training_admission']:
        candidate = _verify_record(payload['candidate_binding'])
        original = load_manifest(candidate)
        review_path = _verify_record(payload['review_binding'])
        reconstructed = _admitted_payload(original, candidate, review_path)
        _require(payload==reconstructed and not payload['summary']['admission_blockers'], 'Invalid independent review admission')
    else:
        _require(payload['training_admission'] is False, 'Invalid training admission state')
    _completion(candidate, payload['bindings'][0])
    return payload


def _admitted_payload(original, candidate, review_path):
    _require(original['training_admission'] is False, 'Admission requires original candidate')
    review = _json(review_path)
    _require(review.get('schema_version')==1 and review.get('policy')=='publisher_visible_condition_pilot_with_sampled_review'
        and review.get('decision')=='accept' and isinstance(review.get('independent_reviewer'),str)
        and bool(review['independent_reviewer'].strip()) and review.get('candidate_sha256')==runtime.sha256_file(candidate)
        and review.get('source_sha256')==original['source']['sha256'], 'Invalid independent review/source binding')
    samples = review.get('sampled_reviews')
    _require(isinstance(samples,list) and samples, 'Nonempty prediction-blind sampled review required')
    candidates = {row['sample_id']:row for row in original['rows']}
    seen, quality = set(), {}
    for sample in samples:
        sample_id = sample.get('sample_id')
        _require(sample_id in candidates and sample_id not in seen and sample.get('sha256')==candidates[sample_id]['sha256']
                 and sample.get('quality') in ('suitable','ambiguous','irrelevant')
                 and sample.get('observed_condition') in ('Normal','Damaged','Uncertain',None), 'Invalid sampled review row')
        seen.add(sample_id); quality[sample_id] = sample['quality']
    # Parent freezes the sample protocol separately; both labels/splits must be represented.
    _require({(candidates[key]['split'],candidates[key]['label']) for key in seen}==
        {('train','Normal'),('train','Damaged'),('validation','Normal'),('validation','Damaged')},
        'Sampled review must cover both classes and development splits')
    for hold in review.get('holds',[]):
        _require(hold.get('sample_id') in candidates and hold.get('sha256')==candidates[hold['sample_id']]['sha256']
                 and hold.get('quality') in ('ambiguous','irrelevant'), 'Invalid explicit quality hold')
        quality[hold['sample_id']] = hold['quality']
    payload = copy.deepcopy(original)
    held_components = {candidates[key]['dependency_group_id'] for key,value in quality.items()
                       if value in ('ambiguous','irrelevant')}
    for row in payload['dispositions']:
        if row['sample_id'] in quality:
            row['quality'] = quality[row['sample_id']]
            if row['quality'] in ('ambiguous','irrelevant'):
                row['reasons'].append('quality_'+row['quality']); row['disposition']='held'
        if row['dependency_group_id'] in held_components:
            row['reasons'].append('quality_candidate_family')
            if row['split']!='test':
                row['disposition']='held'
    payload['rows'] = sorted([copy.deepcopy(row) for row in payload['dispositions'] if row['disposition']=='selected'],
                             key=lambda row:(row['split'],row['sample_id']))
    payload['summary'] = _summary(payload['rows'],payload['dispositions'])
    _require(not payload['summary']['admission_blockers'], 'Both classes required in TRAIN/validation after review holds')
    payload.update(training_admission=True, candidate_binding=_record(candidate), review_binding=_record(review_path))
    return payload


def admit_manifest(candidate: Path, review: Path) -> Path:
    candidate = _local(candidate)
    original = load_manifest(candidate)
    payload = _admitted_payload(original,candidate,_local(review))
    return _seal(candidate.parent/'admitted-manifest.json',payload)


def main():
    _require(len(sys.argv)==3 and sys.argv[1]=='_worker', 'Only controller-dispatched hidden worker supported')
    runtime.require_supervised_worker()
    request_path = _local(sys.argv[2])
    request = _json(request_path)
    _require(request['code_bindings']==_code_bindings() and request['limits']==vars(intake_limits()), 'Worker request/code drift')
    receipt = _verify_record(request['source_receipt'])
    _build_candidates(receipt,request_path.parent)


if __name__=='__main__':
    main()
