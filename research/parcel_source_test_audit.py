"""Closed, once-exposure publisher TEST audit; no inference or label changes.

Controllers are stdlib-only. Image imports/decoding belong exclusively to the
Windows Job worker. Seals detect drift, not a malicious local file owner.
"""
from collections import Counter, defaultdict
import copy
import hashlib
import math
from pathlib import Path
import stat
import sys
import zipfile

import parcel_visible_manifest as base
import parcel_visible_review as review_base
import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
CODE = Path(__file__).resolve()
MiB = 1024**2
FIT_IDS = ['mobilenetv2-clahe','efficientnetb0-none']
COUNTS = dict(source=4148,test=102,rights=7,dev=915,normal=51,damaged=51)
REFERENCE_COUNTS = (965,31)
POLICY = dict(max_file_bytes=16*MiB,minimum_side=64,max_pixels=16000000,
    dhash_distance=4,neutral_rank='visible-source-test-neutral-v1|42|',
    publisher_labels_unchanged=True,physical_identity='unknown',test_training_allowed=False)


def _require(ok, message):
    if not ok:
        raise ValueError(message)


def _metadata(path):
    path = base._local(path)
    _require(any(path.is_relative_to(ROOT/part) for part in ('research/datasets','outputs'))
        and path.suffix.lower() in ('.json','.md','.txt','.log','.py')
        and path.is_file() and 0<path.stat().st_size<=32*MiB, 'Bounded local audit metadata required')
    return path


def _record(path):
    path = _metadata(path)
    return dict(path=str(path),sha256=runtime.sha256_file(path))


def _verify(record):
    _require(isinstance(record,dict) and set(record)=={'path','sha256'}
        and isinstance(record['sha256'],str) and base.HEX.fullmatch(record['sha256']), 'Invalid audit binding')
    path = _metadata(record['path'])
    _require(_record(path)==record, 'Changed audit metadata binding')
    return path


def _code_bindings():
    return {p.name:runtime.sha256_file(p) for p in
        (CODE,Path(base.__file__),Path(review_base.__file__),Path(runtime.__file__),CODE.parent/'parcel_inputs.py',
         CODE.parent/'parcel_gpu_runtime.py',CODE.parent/'parcel_gpu_check.py')}


def _proof(path):
    proof = base._json(_metadata(path))
    _require(proof.get('schema_version')==1 and proof.get('status')=='verified_complete'
        and base.HEX.fullmatch(proof.get('development_key','')) and proof.get('fit_ids')==FIT_IDS,
        'Completed exact two-fit independent proof required')
    relocations, used = {}, set()
    local = set()
    for item in proof.get('relocations',[]):
        _require(set(item)=={'original_path','local_path','sha256'} and item['original_path'].startswith('/')
            and item['original_path'] not in relocations and item['local_path'] not in local,
            'Duplicate/invalid metadata relocation')
        relocations[item['original_path']] = item
        local.add(item['local_path'])
    def bound(record):
        record = copy.deepcopy(record)
        original = record['path']
        if original in relocations:
            _require(relocations[original]['sha256']==record['sha256'], 'Relocation SHA mismatch')
            record['path']=relocations[original]['local_path']
            _require(relocations[original]==dict(original_path=original,
                local_path=record['path'],sha256=record['sha256']), 'Missing explicit metadata relocation')
            used.add(original)
        return _verify(record)
    comparison_path = bound(proof['comparison'])
    comparison = base._unseal(comparison_path)
    _require(comparison.get('status')=='success' and comparison.get('key')==proof['development_key']
        and comparison.get('profile')=='parcel_visible_gpu_development_v4'
        and comparison.get('operationally_approved') is False and comparison.get('serving_gates')=='closed'
        and comparison.get('primary')==FIT_IDS[0] and len(comparison.get('all_fits',[]))==2,
        'Foreign/incomplete development comparison')
    _require(base._json(bound(proof['completed_claim'])).get('result_sha256')==runtime.sha256_file(comparison_path),
        'Completed claim does not bind comparison')
    _require(not (bound(proof['completed_claim']).parent/'failed.json').exists(), 'Failed development claim')
    independent = base._json(bound(proof['independent_review']))
    _require(independent.get('schema_version')==1 and independent.get('kind')=='independent_gpu_development_scientific_attestation_v1'
        and independent.get('status')=='pass' and independent.get('key')==proof['development_key']
        and independent.get('comparison_sha256')==runtime.sha256_file(comparison_path)
        and independent.get('development_manifest_sha256')==proof.get('development_manifest_sha256')
        and independent.get('ordered_fit_ids')==FIT_IDS and independent.get('primary')==FIT_IDS[0]
        and independent.get('paired_statistics_verified') is True and independent.get('operationally_approved') is False
        and independent.get('serving_gates')=='closed' and independent.get('reviewer_binary_access') is False
        and [r.get('fit_id') for r in independent.get('fit_guards',[])]==FIT_IDS,
        'Independent scientific completion does not bind both fits')
    binary=independent.get('parent_binary_readback',{})
    _require(binary.get('no_model_execution') is True and binary.get('verification_performed_by')=='parent'
        and binary.get('reviewer_metadata_only') is True,'Parent binary verification receipt required')
    for name in ('source','receipt','log'):
        _verify(dict(path=binary[name+'_path'],sha256=binary[name+'_sha256']))
    _require(set(proof.get('fit_records',{}))==set(FIT_IDS)
        and set(proof.get('native_records',{}))==set(FIT_IDS), 'Both fit/native records required')
    _require([f.get('fit_id') for f in comparison['all_fits']]==FIT_IDS, 'Ordered exact fit IDs required')
    for fit in comparison['all_fits']:
        fid = fit['fit_id']
        _require(base._unseal(bound(proof['fit_records'][fid]))==fit and fit.get('status')=='success'
            and fit.get('key')==proof['development_key'] and base.HEX.fullmatch(fit.get('artifact_sha256',''))
            and type(fit.get('optimizer_iterations')) is int and fit['optimizer_iterations']>0
            and fit['optimizer_iterations']==fit.get('expected_optimizer_iterations')
            and fit.get('scoring')=='compiled_validation_batch4_partial_v1'
            and fit.get('raw_predictions_from')=='reloaded_classifier.keras', 'Fit scientific/provenance guard failed')
        checked = next(r for r in independent['fit_guards'] if r['fit_id']==fid)
        _require(all(checked.get(k)==fit.get(k) for k in ('artifact_sha256','optimizer_iterations','expected_optimizer_iterations'))
            and checked.get('fit_sha256')==proof['fit_records'][fid]['sha256']
            and all(checked.get(k)==fit.get(k) for k in ('history_sha256','validation_predictions_sha256','validation_diagnostic_sha256','checkpoint_component_stable_ce'))
            and type(checked.get('epochs')) is int and 1<=checked['epochs']<=10
            and checked['optimizer_iterations']==189*checked['epochs']
            and isinstance(checked.get('absolute_checkpoint_difference'),(float,int))
            and math.isfinite(checked['absolute_checkpoint_difference']) and 0<=checked['absolute_checkpoint_difference']<=1e-4,
            'Independent fit guard attestation incomplete')
        native = proof['native_records'][fid]
        _require(set(native)=={'request.json','native-result.json','worker-envelope.json','worker-terminal.json'},
            'Four native metadata records required')
        records = {name:base._json(bound(rec)) for name,rec in native.items()}
        _require({name:rec['sha256'] for name,rec in native.items()}==comparison['native_records'][fid],
            'Native records differ from completed comparison')
        _require(checked.get('native_bindings')==comparison['native_records'][fid],'Scientific/native attestation differs')
        result = records['native-result.json']
        import parcel_gpu_runtime as gpu_native
        gpu_native.validate_native_result(result,3000)  # Pure metadata validation; no OS/ML invocation.
        request=records['request.json']
        gpu_native.validate_resource_profile(request)
        _require(all(request.get(k)==result.get(k) for k in ('unit_name','armed_monotonic','effective_wall_seconds',
            'phase_deadline_monotonic','requested_max_wall_seconds'))
            and request.get('unit_name')=='iilas-gpu-develop-'+proof['development_key'][:12]+'-'+str(FIT_IDS.index(fid))+'.service'
            and request.get('code_sha256')==comparison.get('binding',{}).get('code',{}).get('parcel_gpu_runtime.py')
            and request.get('activation_sha256')==comparison.get('binding',{}).get('activation_helper',{}).get('sha256'),
            'Native request source/resource/unit mismatch')
        own_code=_code_bindings()
        if 'parcel_gpu_runtime.py' in own_code:
            _require(request['code_sha256']==own_code['parcel_gpu_runtime.py'],'Frozen GPU native validator differs from fit proof')
        envelope=records['worker-envelope.json'].get('proof',{})
        _require(envelope.get('unit_name')==result['unit_name'] and envelope.get('properties')==result['properties'],
            'Native envelope properties/unit mismatch')
        _require(request.get('max_output_bytes')==result.get('max_output_bytes')==512*MiB
            and request.get('output_tree')==result.get('output_tree')
            and len(request.get('command',[]))==7 and request['command'][2]=='_fit'
            and request['command'][3:5]==['--output',request['output_tree']]
            and request.get('output')==request['output_tree'].rstrip('/')+'/'+fid
            and request['command'][-2:]==['--fit-id',fid]
            and records['worker-terminal.json'].get('returncode')==0, 'Native fit phase/command mismatch')
        for field,name in (('request_sha256','request.json'),('worker_envelope_sha256','worker-envelope.json'),
                           ('worker_terminal_sha256','worker-terminal.json')):
            _require(result.get(field)==native[name]['sha256'], 'Native internal hash mismatch')
        _require(records['worker-envelope.json'].get('request_sha256')==native['request.json']['sha256'],
            'Native envelope/request mismatch')
    _require(used==set(relocations), 'Unused metadata relocation')
    return proof


def _protocol(path):
    path = _metadata(path)
    protocol = base._json(path)
    _require(protocol.get('schema_version')==1 and protocol.get('kind')=='parcel_source_test_audit_protocol_v1'
        and protocol.get('policy')==POLICY and protocol.get('code_bindings')==_code_bindings(), 'Audit protocol/code drift')
    proof = _proof(_verify(protocol['development_proof']))
    _require(proof.get('development_manifest_sha256')==protocol['development_manifest']['sha256'],
        'Scientific completion binds a different development admission')
    manifest = review_base.load_manifest(_verify(protocol['development_manifest']))
    report, source_bindings = base._source_receipt(_verify(protocol['source_receipt']),hash_archive=True)
    _require(manifest['source']['sha256']==report['source_sha256'] and len(manifest['dispositions'])==COUNTS['source']
        and len(manifest['rows'])==COUNTS['dev'] and manifest['source_inventory']==report['images_inventory'],
        'Wrong frozen development/source membership')
    test = [r for r in manifest['dispositions'] if r['split']=='test']
    _require(len(test)==COUNTS['test'] and len({r['sample_id'] for r in manifest['dispositions']})==COUNTS['source']
        and Counter(r['label'] for r in test)=={'Normal':COUNTS['normal'],'Damaged':COUNTS['damaged']},
        'Wrong full source/TEST denominators')
    rights = [r for r in test if 'rights_uncleared_stock' in r['reasons']]
    _require(len(rights)==COUNTS['rights'] and all(r['label']=='Damaged' for r in rights)
        and all(not r.get('path') and not r.get('pixel_sha256') and not r.get('dhash') for r in test),
        'Initial TEST closure/rights changed')
    for row in manifest['dispositions']:
        split,publisher,_ = base._member(row['member'])
        _require(row['label']==base.CLASSES[publisher] and row['publisher_class']==publisher
            and row['split']==('validation' if split=='valid' else split), 'Publisher mapping changed')
    _verify(protocol['exposure_ledger'])
    for record in protocol['reference_bindings']:
        _verify(record)
    ledger,references=_ledger(protocol)
    _overlay(manifest,{},ledger,references,None)  # Validate IDs/links/exposure metadata before reservation/pixels.
    return dict(protocol=protocol,protocol_binding=_record(path),manifest=manifest,proof=proof,
        report=report,source_bindings=source_bindings,test=test,
        candidates=[r for r in test if r not in rights])


def audit_limits():
    return runtime.Limits(600,600,1024*MiB,3072*MiB,20*1024**3,512*MiB,
        threads=1,available_floor_bytes=768*MiB)


def _reserve(context, output):
    population = sorted((r['sample_id'],r['sha256']) for r in context['test'])
    key = base._digest(dict(source_sha256=context['report']['source_sha256'],version=1,test=population))
    directory = runtime._validate_output_path(ROOT/'research/datasets/parcel-source-test-audit-registry'/key,repo_root=ROOT)
    directory.parent.mkdir(parents=True,exist_ok=True)
    directory.mkdir(exist_ok=False)
    path = directory/'reserved.json'
    runtime.write_json_exclusive(path,dict(key=key,source_sha256=context['report']['source_sha256'],test=population,
        protocol=context['protocol_binding'],output=str(Path(output).absolute()),source_closed=True))
    return _record(path)


def prepare_audit(protocol: Path, output: Path) -> Path:
    context = _protocol(protocol)
    output = runtime.create_run_directory(output,repo_root=ROOT)
    supervisor = runtime.ResourceSupervisor(output,audit_limits())
    try:
        snapshot = supervisor.preflight()
    except Exception as error:
        runtime.write_json_exclusive(output/'preflight.json',dict(status='failed',reason=str(error),source_closed=True,
            native_job_attempted=False,exposure_reserved=False))
        raise
    runtime.write_json_exclusive(output/'preflight.json',dict(status='success',snapshot=snapshot,limits=vars(audit_limits())))
    reservation = _reserve(context,output)
    request = output/'request.json'
    runtime.write_json_exclusive(request,dict(protocol=context['protocol_binding'],reservation=reservation,
        limits=vars(audit_limits()),code_bindings=_code_bindings()))
    result = supervisor.run([sys.executable,str(CODE),'_worker',str(request)],fit_id='audit',cwd=ROOT)
    _require(result['status']=='success' and result['returncode']==0, 'Audit worker failed; no automatic retry')
    candidate = output/'candidate-audit.json'
    runtime.write_json_exclusive(output/'audit-completion.json',dict(candidate=_record(candidate),request=_record(request),
        native=_record(output/'audit.result.json'),reservation=reservation))
    load_audit(candidate)
    return candidate


def _decode_rgb(data):
    from parcel_inputs import decode_rgb
    return decode_rgb(data)


def _fingerprint(data):
    _require(0<len(data)<=POLICY['max_file_bytes'], 'Image encoded bound')
    width,height=base._dimensions(data)
    _require(min(width,height)>=64 and width*height<=POLICY['max_pixels'], 'Image header dimension bounds')
    rgb=_decode_rgb(data)
    height,width=rgb.shape[:2]
    _require(min(width,height)>=64 and width*height<=POLICY['max_pixels'], 'Decoded dimension bounds')
    import cv2
    small=cv2.resize(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY),(9,8),interpolation=cv2.INTER_AREA)
    value=0
    for bit in (small[:,1:]>small[:,:-1]).ravel(): value=(value<<1)|int(bit)
    return dict(width=width,height=height,pixel_sha256=hashlib.sha256(rgb.tobytes()).hexdigest(),dhash=f'{value:016x}'),rgb


def _render(rgb,path):
    import cv2
    height,width=rgb.shape[:2]
    scale=min(1,640/max(height,width))
    if scale<1:
        rgb=cv2.resize(rgb,(max(1,round(width*scale)),max(1,round(height*scale))),interpolation=cv2.INTER_AREA)
    ok,encoded=cv2.imencode('.png',cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR))
    _require(ok and len(encoded)<=4*MiB, 'Neutral render bound')
    with open(path,'xb') as stream: stream.write(encoded.tobytes())


def _ledger(protocol):
    ledger=base._json(_verify(protocol['exposure_ledger']))
    _require(ledger.get('schema_version')==1 and isinstance(ledger.get('entries'),list)
        and isinstance(ledger.get('known_links'),list) and isinstance(ledger.get('unresolved_preview_status'),str),
        'Explicit exposure ledger required')
    references=[];counts=[]
    for binding in protocol['reference_bindings']:
        doc=base._json(_verify(binding));payload=doc.get('payload',doc)
        if 'rows' in payload:
            counts.append(len(payload['rows']))
            # Frozen older reference uses unoriented BGR: encoded joins only.
            for index,row in enumerate(payload['rows']):
                references.append(dict(reference_id='old-'+binding['sha256'][:16]+'-'+str(index),
                    sha256=row['image_sha256'],kind='prior_evaluation',fingerprint_convention='unoriented_BGR'))
        elif 'selected' in payload:
            counts.append(len(payload['selected']))
            for index,row in enumerate(payload['selected']):
                references.append(dict(reference_id='public-'+binding['sha256'][:16]+'-'+str(index),
                    sha256=row['sha256'],kind='human_review',fingerprint_convention='encoded_only'))
        else:
            raise ValueError('Unsupported fixed reference metadata')
    _require(tuple(counts)==REFERENCE_COUNTS,'Both complete prior reference populations required')
    for entry in ledger['entries']:
        _verify(entry['evidence'])
        _require(entry.get('fingerprint_convention') in ('oriented_RGB_v1','unoriented_BGR','encoded_only'),
            'Explicit exposure fingerprint convention required')
    return ledger,references


def _overlay(manifest,fingerprints,ledger,references,review):
    rows=copy.deepcopy(manifest['dispositions'])
    ids={row['sample_id']:index for index,row in enumerate(rows)}
    initial_ids=set(ids)
    exposed={r['sample_id'] for r in manifest['rows']}
    exposed.update(r['sample_id'] for r in rows if 'review_observation' in r)
    for row in rows:
        row['original_dependency_group_id']=row['dependency_group_id']
        row['audit_reasons']=[]
        if row['sample_id'] in fingerprints:
            row.update(copy.deepcopy(fingerprints[row['sample_id']]))
        row['technical_status']='not_attempted' if row['split']=='test' else 'original_metadata'
        if row['sample_id'] in fingerprints:
            row['technical_status']='failed' if fingerprints[row['sample_id']].get('technical_error') else 'decoded'
    for item in [*ledger['entries'],*references]:
        _require(item.get('kind') in ('actual_train','actual_validation','human_review','preview','prior_evaluation')
            and base.HEX.fullmatch(item.get('sha256','')), 'Invalid exposure entry')
        if item.get('sample_id') is not None:
            _require(item['sample_id'] in ids and rows[ids[item['sample_id']]]['sha256']==item['sha256'], 'Exposure source ID/SHA drift')
            exposed.add(item['sample_id']);continue
        sid=item.get('reference_id')
        _require(isinstance(sid,str) and sid and sid not in ids, 'Duplicate/unknown external reference ID')
        node=dict(sample_id=sid,sha256=item['sha256'],split='external',label=None,source_family=None,
            dependency_group_id=None,pixel_sha256=None,dhash=None,reasons=[],audit_reasons=[])
        if item.get('fingerprint_convention')=='oriented_RGB_v1':
            _require(type(item.get('width')) is int and type(item.get('height')) is int
                and base.HEX.fullmatch(item.get('pixel_sha256','')) and isinstance(item.get('dhash'),str)
                and len(item['dhash'])==16, 'Compatible reference fingerprint required')
            node.update({k:item[k] for k in ('width','height','pixel_sha256','dhash')})
        ids[sid]=len(rows);rows.append(node);exposed.add(sid)
    union,exact=base._Union(len(rows)),base._Union(len(rows))
    edges=[]
    for key,verified in [('dependency_group_id',False),('source_family',False),('sha256',True),('pixel_sha256',True)]:
        seen={}
        for i,row in enumerate(rows):
            value=row.get(key)
            if value is None:continue
            if key=='pixel_sha256':value=(row.get('width'),row.get('height'),value)
            if value in seen:
                j=seen[value];union.join(i,j)
                if verified:exact.join(i,j)
                edges.append(dict(left=rows[j]['sample_id'],right=row['sample_id'],basis=key,verified=verified))
            else:seen[value]=i
    decoded=[(i,int(r['dhash'],16)) for i,r in enumerate(rows) if r.get('dhash') is not None]
    for pos,(i,value) in enumerate(decoded):
        for j,other in decoded[:pos]:
            if (value^other).bit_count()<=4:
                union.join(i,j);edges.append(dict(left=rows[j]['sample_id'],right=rows[i]['sample_id'],basis='dhash_candidate',verified=False))
    observations={} if review is None else {r['sample_id']:r for r in review['sampled_reviews']}
    rights={} if review is None else {r['sample_id']:r for r in review['rights_holds']}
    for link in [*ledger['known_links'],*([] if review is None else review['dependency_links'])]:
        left,right=link.get('left_sample_id'),link.get('right_sample_id')
        _require(left in ids and right in ids and left!=right and link.get('basis','').strip()
            and link.get('strength')=='conservative_review_dependency'
            and link.get('left_sha256')==rows[ids[left]]['sha256'] and link.get('right_sha256')==rows[ids[right]]['sha256'],
            'Invalid dependency link ID/hash/basis')
        pair=tuple(sorted((left,right)))
        _require(not any(e.get('review_pair')==pair for e in edges), 'Repeated dependency link')
        union.join(ids[left],ids[right]);edges.append(dict(left=left,right=right,basis=link['basis'],verified=False,review_pair=pair))
    exact_groups=defaultdict(list)
    for i,r in enumerate(rows):exact_groups[exact.find(i)].append(r)
    conflicts={r['sample_id'] for group in exact_groups.values() if len({r['label'] for r in group if r['label'] is not None})>1 for r in group}
    groups=defaultdict(list)
    for i,row in enumerate(rows):groups[union.find(i)].append(row)
    for group in groups.values():
        gid='audit-dep-'+base._digest(sorted(r['sample_id'] for r in group))[:24]
        shared=[]
        if any(r['sample_id'] in exposed for r in group):shared.append('actual_exposure_candidate_family')
        if any(any('rights' in reason for reason in r['reasons']) or r['sample_id'] in rights for r in group):shared.append('rights_candidate_family')
        if any(r['sample_id'] in conflicts for r in group):shared.append('conflict_candidate_family')
        if any(r.get('technical_error') for r in group):shared.append('technical_candidate_family')
        if any(observations.get(r['sample_id'],{}).get('quality') in ('ambiguous','irrelevant') for r in group):shared.append('quality_candidate_family')
        strict=not any(r['split'] in ('train','validation') for r in group)
        for row in group:
            row['audit_dependency_group_id']=gid;row['strict_publisher_partition_eligible']=strict
            row['audit_reasons']=shared.copy()
            if row['sample_id'] in conflicts:row['audit_reasons'].append('verified_label_conflict')
            if row['sample_id'] in observations:row['audit_quality_observation']=copy.deepcopy(observations[row['sample_id']])
            if row['sample_id'] in rights:row['audit_rights_observation']=copy.deepcopy(rights[row['sample_id']])
            row['audit_rights']='explicit_review_hold' if row['sample_id'] in rights else row.get('rights','reference')
            row['audit_exposure']='known_dependency' if 'actual_exposure_candidate_family' in shared else ledger['unresolved_preview_status']
            row['audit_disposition']='relay_only' if row['split']!='test' else ('held' if row['audit_reasons'] else 'candidate')
    return dict(dispositions=[r for r in rows if r['sample_id'] in initial_ids],graph=dict(edges=edges,
        components=len(groups),external_relay_count=len(rows)-len(initial_ids)))


def _build_audit(context,output,reservation):
    runtime.require_supervised_worker()
    _verify(reservation)
    output=base._local(output)
    _require(output.is_dir() and output.is_relative_to(ROOT/'research/datasets'), 'Unsafe audit worker output')
    manifest=context['manifest'];expected={r['path']:r for r in manifest['source_inventory']}
    _require(len(expected)==COUNTS['source'], 'Duplicate source inventory')
    fingerprints={};images=output/'images';neutral=output/'neutral'
    images.mkdir();neutral.mkdir()
    rendered=[];opened=[]
    source=Path(context['report']['source'])
    _require(runtime.sha256_file(source)==context['report']['source_sha256'], 'Source archive hash drift')
    with zipfile.ZipFile(source) as archive:
        seen=set();infos={};expanded=0
        for info in archive.infolist():
            name=info.filename
            _require(info.orig_filename==name and name not in seen and '\\' not in name
                and not info.flag_bits&1 and not stat.S_ISLNK(info.external_attr>>16), 'Unsafe duplicate/encrypted/link ZIP member')
            seen.add(name)
            if info.is_dir():
                _require(name.rstrip('/') in ('train','valid','test') or name.rstrip('/') in
                    {s+'/'+c for s in ('train','valid','test') for c in base.CLASSES}, 'Unsafe ZIP directory');continue
            if name in ('README.dataset.txt','README.roboflow.txt'):
                _require(info.file_size<=MiB,'README bound');continue
            base._member(name)
            _require(name in expected,'Unknown ZIP image')
            record=expected[name]
            _require((info.file_size,info.compress_size,f'{info.CRC:08x}')==(record['bytes'],record['compressed_bytes'],record['crc32'])
                and 0<info.file_size<=16*MiB and info.file_size<=200*max(info.compress_size,1), 'ZIP inventory/bounds drift')
            expanded+=info.file_size;_require(expanded<=512*MiB,'ZIP expanded bound');infos[name]=info
        _require(set(infos)==set(expected) and len(seen)<=COUNTS['source']+100,'Source ZIP not closed')
        runtime.write_json_exclusive(Path(reservation['path']).parent/'access-started.json',dict(protocol=context['protocol_binding'],initial_candidates=len(context['candidates'])))
        ranked=sorted(context['candidates'],key=lambda r:hashlib.sha256((POLICY['neutral_rank']+r['sample_id']).encode()).hexdigest())
        for index,row in enumerate(ranked,1):
            sid=row['sample_id'];case='Q'+str(index).zfill(3)
            opened.append(sid)
            with archive.open(infos[row['member']]) as stream:data=stream.read(16*MiB+1)
            _require(len(data)==infos[row['member']].file_size and hashlib.sha256(data).hexdigest()==row['sha256'],'Member encoded hash/size drift')
            try:
                fp,rgb=_fingerprint(data)
            except ValueError as error:
                fingerprints[sid]=dict(technical_error=type(error).__name__+':'+str(error)[:160])
            else:
                path=images/(sid+Path(row['member']).suffix)
                with open(path,'xb') as stream:stream.write(data)
                fp['path']=path.relative_to(ROOT).as_posix();fingerprints[sid]=fp
                neutral_path=neutral/(case+'.png');_render(rgb,neutral_path)
                rendered.append(dict(case_id=case,sample_id=sid,sha256=row['sha256'],neutral_path=neutral_path.relative_to(ROOT).as_posix(),
                    image_sha256=runtime.sha256_file(neutral_path),technical_status='decoded'))
            runtime.write_json_exclusive(output/('progress-'+str(index).zfill(3)+'.json'),dict(sample_id=sid,technical=fingerprints[sid]))
    _require(runtime.sha256_file(source)==context['report']['source_sha256'],'Archive changed during audit')
    ledger,references=_ledger(context['protocol'])
    rebuilt=_overlay(manifest,fingerprints,ledger,references,None)
    identity=dict(source_sha256=context['report']['source_sha256'],protocol=context['protocol_binding'],reservation=reservation)
    key=base._seal(output/'private-key.json',dict(**identity,samples=[dict(case_id=r['case_id'],sample_id=r['sample_id'],sha256=r['sha256'],
        split='test',label=next(x['label'] for x in context['test'] if x['sample_id']==r['sample_id']),
        dependency_group_id=next(x['audit_dependency_group_id'] for x in rebuilt['dispositions'] if x['sample_id']==r['sample_id'])) for r in rendered]))
    neutral_manifest=base._seal(output/'neutral-manifest.json',dict(**identity,cases=[{k:v for k,v in r.items() if k not in ('sample_id','sha256')} for r in rendered]))
    payload=dict(schema_version=1,kind='parcel_source_test_audit_v1',class_order=['Normal','Damaged'],source_closed=True,
        training_admission=False,audit_admission=False,evaluation_status='not_run',bindings=dict(protocol=context['protocol_binding']),
        code_bindings=_code_bindings(),reservation=reservation,source_inventory=copy.deepcopy(manifest['source_inventory']),
        fingerprints=fingerprints,neutral_review=dict(sample_key=_record(key),neutral_manifest=_record(neutral_manifest)),
        **rebuilt)
    payload['rows']=_eligible(payload['dispositions'])
    payload['summary']=_summary(payload['dispositions'],payload['rows'],len(opened),len(rendered))
    return base._seal(output/'candidate-audit.json',payload)


def _eligible(dispositions):
    return [dict(row,dependency_group_id=row['audit_dependency_group_id'],quality_basis='publisher_label_not_independently_verified')
        for row in sorted(dispositions,key=lambda r:r['sample_id'])
        if row['split']=='test' and row.get('technical_status')=='decoded' and not row['audit_reasons']]


def _summary(dispositions,rows,attempted,rendered):
    return dict(original_source=COUNTS['source'],reserved_test=COUNTS['test'],initial_candidates=COUNTS['test']-COUNTS['rights'],
        initial_rights=COUNTS['rights'],attempted=attempted,decoded=sum(r.get('technical_status')=='decoded' for r in dispositions if r['split']=='test'),rendered=rendered,accepted=len(rows),
        class_counts=dict(Counter(r['label'] for r in rows)),components=len({r['dependency_group_id'] for r in rows}),
        strict_class_counts=dict(Counter(r['label'] for r in rows if r['strict_publisher_partition_eligible'])),
        strict_components=len({r['dependency_group_id'] for r in rows if r['strict_publisher_partition_eligible']}),
        preview_status='preview_membership_not_fully_matched',rights_status='no_known_holds_is_not_asset_rights_clearance',
        reasons=dict(Counter(reason for r in dispositions if r['split']=='test' for reason in r['audit_reasons'])),
        independent_physical_parcel_accuracy_established=False)


def _asset(relative,expected,limit):
    _require(isinstance(relative,str) and '\\' not in relative and not Path(relative).is_absolute()
        and '..' not in Path(relative).parts,'Unsafe audit asset path')
    path=base._local(ROOT/relative)
    _require(path.is_relative_to(ROOT/'research/datasets') and path.is_file()
        and 0<path.stat().st_size<=limit and runtime.sha256_file(path)==expected,'Changed audit encoded asset')
    return path


def _neutral(candidate,context):
    key=base._unseal(_verify(candidate['neutral_review']['sample_key']))
    neutral=base._unseal(_verify(candidate['neutral_review']['neutral_manifest']))
    for document in (key,neutral):
        _require(document.get('source_sha256')==context['report']['source_sha256']
            and document.get('protocol')==context['protocol_binding'] and document.get('reservation')==candidate['reservation'],
            'Neutral artifact source/protocol/reservation mismatch')
    decoded={sid for sid,fp in candidate['fingerprints'].items() if 'technical_error' not in fp}
    samples=key.get('samples',[]);cases=neutral.get('cases',[])
    _require(len(samples)==len(decoded) and {r['sample_id'] for r in samples}==decoded
        and len({r['case_id'] for r in samples})==len(samples) and len(cases)==len(samples), 'Incomplete neutral census/key')
    ranked=sorted(context['candidates'],key=lambda r:hashlib.sha256((POLICY['neutral_rank']+r['sample_id']).encode()).hexdigest())
    ranks={r['sample_id']:'Q'+str(i).zfill(3) for i,r in enumerate(ranked,1)}
    source={r['sample_id']:r for r in context['test']}
    original={r['sample_id']:r for r in candidate['dispositions']}
    for row in samples:
        sid=row['sample_id'];base_row=source[sid]
        _require(row==dict(case_id=ranks[sid],sample_id=sid,sha256=base_row['sha256'],split='test',label=base_row['label'],
            dependency_group_id=original[sid]['audit_dependency_group_id']), 'Neutral key membership/rank/hash drift')
    _require({r['case_id'] for r in cases}=={r['case_id'] for r in samples}, 'Neutral case IDs mismatch')
    for row in cases:
        _require(set(row)=={'case_id','neutral_path','image_sha256','technical_status'} and row['technical_status']=='decoded',
            'Neutral metadata leaks key/unsupported fields')
        image=_asset(row['neutral_path'],row['image_sha256'],4*MiB)
        _require(image.parent==Path(candidate['neutral_review']['sample_key']['path']).parent/'neutral'
            and image.name==row['case_id']+'.png','Foreign neutral case image')
    return key


def _pending(path):
    path=_metadata(path);candidate=base._unseal(path)
    _require(candidate.get('schema_version')==1 and candidate.get('kind')=='parcel_source_test_audit_v1'
        and candidate.get('class_order')==['Normal','Damaged'] and candidate.get('source_closed') is True
        and candidate.get('training_admission') is False and candidate.get('audit_admission') is False
        and candidate.get('evaluation_status')=='not_run' and candidate.get('code_bindings')==_code_bindings(),
        'Candidate audit profile/code/admission changed')
    context=_protocol(_verify(candidate['bindings']['protocol']))
    completion=base._json(path.parent/'audit-completion.json')
    _require(_verify(completion['candidate'])==path and completion['reservation']==candidate['reservation'], 'Audit completion/candidate mismatch')
    _require(_verify(completion['request'])==path.parent/'request.json'
        and _verify(completion['native'])==path.parent/'audit.result.json'
        and _verify(candidate['neutral_review']['sample_key'])==path.parent/'private-key.json'
        and _verify(candidate['neutral_review']['neutral_manifest'])==path.parent/'neutral-manifest.json',
        'Audit sidecars must remain in their monitored worker output')
    request=base._json(_verify(completion['request']));native=base._json(_verify(completion['native']))
    _require(request==dict(protocol=context['protocol_binding'],reservation=candidate['reservation'],limits=vars(audit_limits()),code_bindings=_code_bindings())
        and native.get('status')=='success' and native.get('returncode')==0 and native.get('reason') is None
        and 0<native.get('elapsed_seconds',0)<=600 and 0<native.get('peak_rss_bytes',0)<=1024*MiB, 'Native audit provenance/bounds mismatch')
    reservation=base._json(_verify(candidate['reservation']))
    population=sorted((r['sample_id'],r['sha256']) for r in context['test'])
    key=base._digest(dict(source_sha256=context['report']['source_sha256'],version=1,test=population))
    _require(reservation==dict(key=key,source_sha256=context['report']['source_sha256'],test=[list(p) for p in population],
        protocol=context['protocol_binding'],output=str(path.parent),source_closed=True)
        and Path(candidate['reservation']['path'])==ROOT/'research/datasets/parcel-source-test-audit-registry'/key/'reserved.json',
        'Audit exposure reservation identity mismatch')
    started=base._json(Path(candidate['reservation']['path']).parent/'access-started.json')
    _require(started==dict(protocol=context['protocol_binding'],initial_candidates=len(context['candidates'])),'Missing worker access proof')
    fps=candidate['fingerprints'];sources={r['sample_id']:r for r in context['candidates']}
    _require(set(fps)==set(sources),'Fixed candidate attempted membership changed')
    for sid,fp in fps.items():
        if 'technical_error' in fp:
            _require(set(fp)=={'technical_error'} and isinstance(fp['technical_error'],str) and fp['technical_error'], 'Invalid technical failure')
        else:
            _require(set(fp)=={'path','width','height','pixel_sha256','dhash'} and type(fp['width']) is int and type(fp['height']) is int
                and min(fp['width'],fp['height'])>=64 and fp['width']*fp['height']<=16000000
                and base.HEX.fullmatch(fp['pixel_sha256']) and len(fp['dhash'])==16 and all(c in '0123456789abcdef' for c in fp['dhash']),
                'Invalid native fingerprint')
            image=_asset(fp['path'],sources[sid]['sha256'],16*MiB)
            _require(image.parent==path.parent/'images' and image.stem==sid,'Foreign extracted image path')
    ledger,references=_ledger(context['protocol'])
    rebuilt=_overlay(context['manifest'],fps,ledger,references,None)
    rows=_eligible(rebuilt['dispositions'])
    _require(candidate['source_inventory']==context['manifest']['source_inventory'] and candidate['dispositions']==rebuilt['dispositions']
        and base._digest(candidate['graph'])==base._digest(rebuilt['graph']) and candidate['rows']==rows,
        'Audit inventory/graph/membership reconstruction mismatch')
    samples=_neutral(candidate,context)['samples']
    _require(candidate['summary']==_summary(rebuilt['dispositions'],rows,len(fps),len(samples)), 'Audit summary mismatch')
    return candidate,context


def _read_review(path,candidate,candidate_path,context):
    review=base._json(_metadata(path))
    _require(review.get('schema_version')==1 and review.get('decision')=='accept' and isinstance(review.get('independent_reviewer'),str)
        and review['independent_reviewer'].strip() and review.get('candidate_sha256')==runtime.sha256_file(candidate_path)
        and review.get('source_sha256')==context['report']['source_sha256'],'Invalid audit review identity')
    bindings=review.get('bindings',{})
    _require(set(bindings)=={'policy','sample_key','neutral_manifest','observations','lock','independent_review'}
        and bindings['policy']==context['protocol_binding']
        and all(bindings[k]==candidate['neutral_review'][k] for k in ('sample_key','neutral_manifest')),'Review policy/key/neutral mismatch')
    for binding in bindings.values():_verify(binding)
    key=_neutral(candidate,context)
    samples={r['sample_id']:r for r in key['samples']};case_map={r['case_id']:r for r in key['samples']}
    observed=base._json(_verify(bindings['observations']))
    lock=base._json(_verify(bindings['lock']))
    _require(lock.get('observations_sha256')==bindings['observations']['sha256'] and lock.get('key_unopened') is True
        and lock.get('predictions_unseen') is True and observed.get('publisher_key_opened') is False
        and observed.get('model_predictions_seen') is False,
        'Review observations not locked before key')
    independent=base._json(_verify(bindings['independent_review']))
    _require(independent.get('schema_version')==1 and independent.get('kind')=='independent_source_test_audit_review_v1'
        and independent.get('status')=='accepted' and independent.get('source_sha256')==review['source_sha256']
        and independent.get('candidate_sha256')==review['candidate_sha256']
        and independent.get('independent_reviewer')==review['independent_reviewer']
        and all(independent.get(k+'_sha256')==bindings[k]['sha256'] for k in ('observations','sample_key','neutral_manifest','lock')),
        'Independent audit review receipt does not bind census/source')
    observations=observed.get('observations',[])
    _require(observed.get('schema_version')==1 and len(observations)==len(samples)
        and {r['case_id'] for r in observations}==set(case_map),'Incomplete locked observation census')
    obs={r['case_id']:r for r in observations}
    records=review.get('sampled_reviews',[])
    _require(len(records)==len(samples) and {r['sample_id'] for r in records}==set(samples),'Incomplete review census')
    all_rows={r['sample_id']:r for r in context['manifest']['dispositions']}
    rights=review.get('rights_holds',[]);rights_ids=set()
    for item in rights:
        sid=item.get('sample_id')
        _require(sid in all_rows and sid not in rights_ids and item.get('sha256')==all_rows[sid]['sha256']
            and isinstance(item.get('reason'),str) and item['reason'].strip(),'Unknown/repeated rights hold/hash/evidence')
        rights_ids.add(sid)
    links=review.get('dependency_links',[]);pairs=set()
    for item in links:
        pair=tuple(sorted((item.get('left_sample_id',''),item.get('right_sample_id',''))))
        _require(pair not in pairs,'Repeated review dependency link');pairs.add(pair)
    for item in records:
        sid=item['sample_id'];sample=samples[sid];observation=obs[sample['case_id']]
        _require(item.get('case_id')==sample['case_id'] and item.get('sha256')==sample['sha256']
            and item.get('quality') in ('suitable','ambiguous','irrelevant') and item.get('observed_condition') in ('Normal','Damaged','Uncertain')
            and isinstance(item.get('notes'),str) and item['notes'].strip()
            and all(item.get(k)==observation.get(k) for k in ('quality','observed_condition','notes')),'Review observation/key/hash mismatch')
        if observation.get('rights_flag'):
            _require(sid in rights_ids,'Locked rights evidence omitted')
        for related in observation.get('related_case_ids',[]):
            _require(related in case_map and tuple(sorted((sid,case_map[related]['sample_id']))) in pairs,'Locked derivative evidence omitted')
    return review


def _admitted(candidate,candidate_path,review_path,context):
    review=_read_review(review_path,candidate,candidate_path,context)
    ledger,references=_ledger(context['protocol'])
    rebuilt=_overlay(context['manifest'],candidate['fingerprints'],ledger,references,review)
    payload=copy.deepcopy(candidate)
    payload.update(rebuilt)
    payload['rows']=_eligible(rebuilt['dispositions'])
    _require({r['sample_id'] for r in payload['rows']}<={r['sample_id'] for r in candidate['rows']},'Admission expanded candidate membership')
    blockers=['missing_'+label for label in ('Normal','Damaged') if not any(r['label']==label for r in payload['rows'])]
    payload.update(candidate=_record(candidate_path),review=_record(review_path),audit_admission=not blockers,admission_blockers=blockers)
    payload['summary']=_summary(payload['dispositions'],payload['rows'],candidate['summary']['attempted'],candidate['summary']['rendered'])
    return payload


def admit_audit(candidate: Path,review: Path,output: Path) -> Path:
    original,context=_pending(candidate)
    output=runtime._validate_output_path(output,repo_root=ROOT)
    _require(output.suffix=='.json' and not output.exists(),'Audit output must be new ignored JSON')
    payload=_admitted(original,Path(candidate),Path(review),context)
    output.parent.mkdir(parents=True,exist_ok=True)
    base._seal(output,payload)
    _require(payload['audit_admission'],'Audit blocked: both publisher classes required; outcome preserved')
    return output


def load_audit(path: Path) -> dict:
    payload=base._unseal(_metadata(path))
    if 'candidate' not in payload:
        return _pending(path)[0]
    candidate_path=_verify(payload['candidate']);review_path=_verify(payload['review'])
    candidate,context=_pending(candidate_path)
    expected=_admitted(candidate,candidate_path,review_path,context)
    _require(base._digest(payload)==base._digest(expected),'Frozen admission overlay reconstruction mismatch')
    return payload


def _worker(request_path):
    runtime.require_supervised_worker()
    request=base._json(_metadata(request_path))
    _require(request.get('code_bindings')==_code_bindings() and request.get('limits')==vars(audit_limits()),'Worker request/code/limit drift')
    context=_protocol(_verify(request['protocol']))
    return _build_audit(context,Path(request_path).parent,request['reservation'])


def main(argv=None):
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    prepare=sub.add_parser('prepare');prepare.add_argument('--protocol',type=Path,required=True);prepare.add_argument('--output',type=Path,required=True)
    admit=sub.add_parser('admit');admit.add_argument('--candidate',type=Path,required=True);admit.add_argument('--review',type=Path,required=True);admit.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(argv)
    try:
        result=prepare_audit(args.protocol,args.output) if args.command=='prepare' else admit_audit(args.candidate,args.review,args.output)
        print(result)
        return 0
    except (OSError,ValueError,KeyError,TypeError,runtime.RuntimeSafetyError) as error:
        print(str(error),file=sys.stderr)
        return 2


if __name__=='__main__':
    if len(sys.argv)==3 and sys.argv[1]=='_worker':
        _worker(Path(sys.argv[2]))
    else:
        raise SystemExit(main())
