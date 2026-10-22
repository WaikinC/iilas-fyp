"""Once-only publisher TEST evaluation. No training, selection or serving activation.

Windows freeze validates the unchanged audit. WSL preparation verifies explicit
portable metadata/asset bindings; only native-contained leaves import ML/decode.
Seals detect drift, not a malicious local owner. Failed population claims stay.
"""
import argparse
from collections import Counter
import copy
import hashlib
import json
import math
import os
from pathlib import Path, PureWindowsPath, PurePosixPath
import random
import sys
import time

import parcel_gpu_train as gpu
import parcel_gpu_data as transport
import parcel_source_test_audit as audit

ROOT=Path(__file__).resolve().parents[1]
CODE=Path(__file__).resolve()
FIT_IDS=tuple(gpu.FIT_IDS)
CLASSES=('Normal','Damaged')
DEVELOPMENT_KEY='aef72c6d16f6c23424533e801821ab37a1bd006ebe6d359030ce3a9f55c02507'
PROFILE='parcel_visible_source_test_v1'
MiB=1024**2
METRICS=('accuracy','damaged_precision','damaged_recall','normal_f1','damaged_f1','macro_f1','nll','stable_ce')
require=gpu.require
digest=transport._digest
sha=transport._sha


def evaluation_policy():
    return dict(profile=PROFILE,fit_ids=list(FIT_IDS),primary=FIT_IDS[0],class_order=list(CLASSES),
        decision='larger_probability_exact_tie_abstains',preprocessing='rgb-letterbox224-v1',
        scoring='compiled_validation_batch4_partial_v1',batch_size=4,training=False,
        model_seconds=180,phase_seconds=600,memory_limit_bytes=4096*MiB,gpu_allocator_mib=2048,
        admission_memory_bytes=6144*MiB,live_memory_floor_bytes=2048*MiB,cpu_count=1,swap_bytes=0,
        minimum_disk_bytes=20*1024**3,max_output_bytes=512*MiB,
        nll='true_probability_clipped_floor1e-7',stable_ce='unclipped_logsumexp_logits',
        bootstrap=dict(draws=2000,seed=42,unit='dependency_component',paired=True,
            group_order='lexicographically_sorted',multiplicity='retained',interval='linear_percentile_2.5_97.5'),
        f1_zero_denominator=0.,undefined_precision_recall=None,accuracy_target=.8,
        operationally_approved=False,serving_gates='closed')


def validate_admission(value):
    require(value.get('kind')=='parcel_source_test_audit_v1' and value.get('schema_version')==1
        and value.get('class_order')==list(CLASSES) and value.get('source_closed') is True
        and value.get('training_admission') is False and value.get('audit_admission') is True
        and value.get('evaluation_status')=='not_run' and value.get('admission_blockers')==[],
        'Final independently admitted, unscored source audit required')
    dispositions=value.get('dispositions',[]);rows=value.get('rows',[])
    require(len(dispositions)==4148 and len({r['sample_id'] for r in dispositions})==4148,'All original dispositions required')
    test=[r for r in dispositions if r['split']=='test']
    require(len(test)==102 and Counter(r['label'] for r in test)=={'Normal':51,'Damaged':51},'All102TEST publisher denominators required')
    eligible=[dict(r,dependency_group_id=r['audit_dependency_group_id'],quality_basis='publisher_label_not_independently_verified')
        for r in sorted(test,key=lambda r:r['sample_id']) if r.get('technical_status')=='decoded' and r.get('audit_reasons')==[]]
    require(rows==eligible and rows and set(r['label'] for r in rows)==set(CLASSES),'Admission/order/label/hold closure changed')
    for r in rows:
        require(r['split']=='test' and isinstance(r.get('dependency_group_id'),str) and r['dependency_group_id']
            and transport.HEX.fullmatch(r.get('sha256','')) and transport.HEX.fullmatch(r.get('pixel_sha256',''))
            and type(r.get('width')) is int and type(r.get('height')) is int and min(r['width'],r['height'])>=64
            and r['width']*r['height']<=16000000 and type(r.get('strict_publisher_partition_eligible')) is bool,
            'Invalid admitted TEST row')
        transport._portable(r['path'])
    return rows


def population_key(source_sha256,admission):
    require(transport.HEX.fullmatch(source_sha256 or ''),'Invalid source identity')
    population=sorted((r['sample_id'],r['sha256']) for r in admission['dispositions'] if r['split']=='test')
    require(len(population)==102 and len({r[0] for r in population})==102,'Full original TEST population required')
    return digest(dict(purpose='once_only_visible_source_test',source_sha256=source_sha256,test=population))


def reserve_population(source_sha256,admission,protocol,output,registry=None):
    key=population_key(source_sha256,admission)
    registry=Path(registry) if registry is not None else safe_output(ROOT/'research/datasets/parcel-source-test-evaluation-registry')
    registry.mkdir(parents=True,exist_ok=True);claim=registry/key
    try:claim.mkdir()
    except FileExistsError as error:raise ValueError('Population already reserved; no retry or changed-key evaluation permitted') from error
    write(claim/'reserved.json',dict(population_key=key,source_sha256=source_sha256,protocol=protocol,output=str(Path(output).absolute()),
        test=sorted((r['sample_id'],r['sha256']) for r in admission['dispositions'] if r['split']=='test')))
    return claim


def finite(value):return type(value) in (float,int) and math.isfinite(value)


def _raw_guard(rows,raw):
    require(len(rows)==len(raw),'Prediction membership count changed')
    for row,prediction in zip(rows,raw):
        require(all(prediction.get(k)==row[k] for k in ('sample_id','label','dependency_group_id','sha256','pixel_sha256')),
            'Prediction membership/order/label/hash changed')
        p=prediction.get('probabilities');z=prediction.get('logits');ce=prediction.get('keras_sparse_ce')
        require(isinstance(p,list) and len(p)==2 and all(finite(v) and 0<=v<=1 for v in p)
            and math.isclose(sum(p),1.,rel_tol=1e-5,abs_tol=1e-6),'Invalid probabilities')
        require(isinstance(z,list) and len(z)==2 and all(finite(v) for v in z) and finite(ce) and ce>=0,'Invalid logits/CE')
        maximum=max(z);total=sum(math.exp(v-maximum) for v in z)
        require(all(math.isclose(a,math.exp(b-maximum)/total,rel_tol=1e-4,abs_tol=1e-37) for a,b in zip(p,z)),
            'Logit/softmax mismatch')
        stable=maximum-z[CLASSES.index(row['label'])]+math.log(total)
        require(math.isclose(stable,ce,rel_tol=1e-4,abs_tol=1e-4),'Logit/CE mismatch')


def validate_attempt(attempt,rows,model):
    require(attempt.get('fit_id')==model['fit_id'] and attempt.get('scoring')==evaluation_policy()['scoring'],'Foreign scorer/model')
    require(attempt.get('batch_sizes')==gpu.batch_sizes(len(rows)),'Exact batch4/partial final required')
    require(attempt.get('output_devices') and all(isinstance(d,str) and d.endswith('GPU:0') for d in attempt['output_devices']),
        'Model outputs must execute on GPU:0')
    require(attempt.get('artifact_before_sha256')==attempt.get('artifact_after_sha256')==model['sha256'],'Saved artifact changed')
    before=attempt.get('state_before',{});after=attempt.get('state_after',{})
    require(before==after and type(before.get('optimizer_iterations')) is int
        and before['optimizer_iterations']==model['optimizer_iterations'],'Model/optimizer state changed')
    for field in ('model_variables','optimizer_variables'):
        variables=before.get(field,[])
        require(variables and len({r['name'] for r in variables})==len(variables),'Missing/duplicate full variable state')
        for r in variables:
            require(set(r)=={'name','shape','dtype','sha256'} and isinstance(r['name'],str) and r['name']
                and isinstance(r['shape'],list) and all(type(n) is int and n>=0 for n in r['shape'])
                and isinstance(r['dtype'],str) and r['dtype'] and transport.HEX.fullmatch(r['sha256']),
                'Malformed model/optimizer variable snapshot')
    _raw_guard(rows,attempt.get('raw',[]))


def _serializable(value):
    if isinstance(value,float) and not math.isfinite(value):return {'nonfinite':repr(value)}
    if isinstance(value,dict):return {k:_serializable(v) for k,v in value.items()}
    if isinstance(value,(tuple,list)):return [_serializable(v) for v in value]
    return value


def write(path,value):transport._write(Path(path),_serializable(value))


def persist_attempt(target,attempt,rows,model):
    path=Path(target)/'attempt.json';write(path,attempt)
    try:validate_attempt(attempt,rows,model)
    except Exception as error:
        write(Path(target)/'guard-failed.json',dict(reason=str(error),attempt_sha256=sha(path)))
        raise
    return path


def metrics(rows,predictions,component_weighted=False,*,multiplicity=None):
    require(len(rows)==len(predictions),'Metric membership mismatch')
    sizes=Counter(r['dependency_group_id'] for r in rows);matrix=[[0.,0.,0.],[0.,0.,0.]]
    total=nll=stable_ce=0.;has_logits=True
    for row,raw in zip(rows,predictions):
        p=raw['probabilities'];truth=CLASSES.index(row['label'])
        weight=float(1 if multiplicity is None else multiplicity.get(row['dependency_group_id'],0))
        if component_weighted:weight/=sizes[row['dependency_group_id']]
        predicted=2 if p[0]==p[1] else (0 if p[0]>p[1] else 1)
        matrix[truth][predicted]+=weight;total+=weight
        nll-=weight*math.log(max(p[truth],1e-7))
        z=raw.get('logits')
        if z is None:has_logits=False
        else:
            maximum=max(z)
            stable_ce+=weight*(maximum-z[truth]+math.log(sum(math.exp(v-maximum) for v in z)))
    def ratio(a,b):return a/b if b else None
    per_class={}
    for index,label in enumerate(CLASSES):
        tp=matrix[index][index];support=sum(matrix[index]);predicted=sum(r[index] for r in matrix)
        fp=predicted-tp;fn=support-tp;f1_denominator=2*tp+fp+fn
        per_class[label]=dict(precision=ratio(tp,predicted),recall=ratio(tp,support),f1=2*tp/f1_denominator if f1_denominator else 0.,
            support_weight=support,predicted_weight=predicted,true_positive_weight=tp,false_positive_weight=fp,
            false_negative_weight=fn,f1_denominator=f1_denominator)
    return dict(count=len(rows),total_weight=total,accuracy=ratio(matrix[0][0]+matrix[1][1],total),
        nll=ratio(nll,total),stable_ce=ratio(stable_ce,total) if has_logits else None,confusion=matrix,confusion_columns=['Normal','Damaged','Abstained'],
        per_class=per_class,macro_f1=sum(p['f1'] for p in per_class.values())/2 if total else None,
        abstention_weight=sum(r[2] for r in matrix),coverage=ratio(sum(r[0]+r[1] for r in matrix),total))


def percentile(values,p):
    ordered=sorted(values);position=(len(ordered)-1)*p;lo=math.floor(position);hi=math.ceil(position)
    return ordered[lo]+(ordered[hi]-ordered[lo])*(position-lo)


def interval(values):
    valid=[v for v in values if v is not None]
    return dict(lower=percentile(valid,.025) if valid else None,upper=percentile(valid,.975) if valid else None,
        valid_replicates=len(valid),undefined_replicates=len(values)-len(valid))


def _metric_values(point):
    return dict(accuracy=point['accuracy'],damaged_precision=point['per_class']['Damaged']['precision'],
        damaged_recall=point['per_class']['Damaged']['recall'],normal_f1=point['per_class']['Normal']['f1'],
        damaged_f1=point['per_class']['Damaged']['f1'],macro_f1=point['macro_f1'],nll=point['nll'],stable_ce=point['stable_ce'])


def paired_bootstrap(rows,attempts,*,draws=2000,seed=42,deadline=None):
    require(draws==2000 and seed==42 and [a['fit_id'] for a in attempts]==list(FIT_IDS),'Fixed paired bootstrap policy required')
    groups=sorted({r['dependency_group_id'] for r in rows});rng=random.Random(seed)
    values={fid:{w:{m:[] for m in METRICS} for w in ('image','component')} for fid in FIT_IDS}
    deltas={w:{m:[] for m in METRICS} for w in ('image','component')}
    zeros={fid:{w:Counter({name:0 for name in ('total_weight','damaged_precision','damaged_recall','normal_f1','damaged_f1')})
        for w in ('image','component')} for fid in FIT_IDS}
    for index in range(draws):
        if deadline is not None and index%16==0:require(time.monotonic()<deadline,'Whole evaluation deadline exceeded during scoring')
        counts=Counter(groups[rng.randrange(len(groups))] for _ in groups)
        measured={}
        for attempt in attempts:
            fid=attempt['fit_id'];measured[fid]={}
            for weighting in ('image','component'):
                point=metrics(rows,attempt['raw'],weighting=='component',multiplicity=counts)
                selected=_metric_values(point);measured[fid][weighting]=selected
                for metric,value in selected.items():values[fid][weighting][metric].append(value)
                denominators=dict(total_weight=point['total_weight'],damaged_precision=point['per_class']['Damaged']['predicted_weight'],
                    damaged_recall=point['per_class']['Damaged']['support_weight'],normal_f1=point['per_class']['Normal']['f1_denominator'],
                    damaged_f1=point['per_class']['Damaged']['f1_denominator'])
                for name,value in denominators.items():zeros[fid][weighting][name]+=value==0
        for weighting in deltas:
            for metric in METRICS:
                a=measured[FIT_IDS[0]][weighting][metric];b=measured[FIT_IDS[1]][weighting][metric]
                deltas[weighting][metric].append(None if a is None or b is None else b-a)
    return dict(model_intervals={fid:{w:{m:interval(v) for m,v in measured.items()} for w,measured in weights.items()} for fid,weights in values.items()},
        paired_comparator_minus_primary={w:{m:interval(v) for m,v in measured.items()} for w,measured in deltas.items()},
        denominator_zero_replicates={fid:{w:dict(z) for w,z in weights.items()} for fid,weights in zeros.items()})


def summarize(admission,attempts,*,deadline=None):
    rows=validate_admission(admission)
    require([a['fit_id'] for a in attempts]==list(FIT_IDS),'Fixed serial model outputs required')
    for attempt in attempts:_raw_guard(rows,attempt['raw'])
    def subset(indices):
        selected=[rows[i] for i in indices]
        output=[dict(fit_id=a['fit_id'],raw=[a['raw'][i] for i in indices]) for a in attempts]
        normal=[dict(probabilities=[1.,0.],logits=None) for _ in selected]
        return dict(support=dict(images=len(selected),components=len({r['dependency_group_id'] for r in selected}),
            class_counts=dict(Counter(r['label'] for r in selected))),
            point_estimates={a['fit_id']:{w:metrics(selected,a['raw'],w=='component') for w in ('image','component')} for a in output},
            always_normal={w:metrics(selected,normal,w=='component') for w in ('image','component')},
            uncertainty=paired_bootstrap(selected,output,deadline=deadline))
    test=[r for r in admission['dispositions'] if r['split']=='test']
    return dict(kind='parcel_source_test_summary_v1',primary_model=FIT_IDS[0],comparator_model=FIT_IDS[1],
        primary=subset(range(len(rows))),strict=subset([i for i,r in enumerate(rows) if r['strict_publisher_partition_eligible']]),
        coverage=dict(reserved_test=102,admitted=len(rows),excluded=102-len(rows),admitted_fraction=len(rows)/102,
            original_class_counts=dict(Counter(r['label'] for r in test)),admitted_class_counts=dict(Counter(r['label'] for r in rows)),
            excluded_class_counts=dict(Counter(r['label'] for r in test if r['sample_id'] not in {x['sample_id'] for x in rows})),
            technical_failures=sum(r.get('technical_status')=='failed' for r in test),
            prediction_attempts={a['fit_id']:len(a['raw']) for a in attempts},model_failures=0),test_dispositions=test,
        accuracy_target=.8,target_interpretation='Prospective descriptive target; no new lower-bound criterion',
        metric_policy=evaluation_policy(),operationally_approved=False,serving_gates='closed',
        limitations='Publisher-source labels; conservative dependencies are not physical parcels; no unseen-source/photo/live acceptance.')


def safe_output(path):
    path=Path(path).absolute()
    require(path.is_relative_to(ROOT.absolute()),'Output outside application')
    relative=path.relative_to(ROOT.absolute()).as_posix()
    require(relative.startswith(('research/datasets/','outputs/')),'Ignored local output required')
    return transport._safe(ROOT,relative,data=False,exists=False)


def local_record(path):
    path=Path(path).absolute();relative=path.relative_to(ROOT.absolute()).as_posix()
    local=transport._safe(ROOT,relative,data=False)
    return dict(repo_path=relative,sha256=sha(local))


def verify_record(record):
    require(set(record)=={'repo_path','sha256'} and transport.HEX.fullmatch(record.get('sha256','')),'Invalid portable record')
    path=transport._safe(ROOT,record['repo_path'],data=False)
    require(sha(path)==record['sha256'],'Changed bound portable bytes')
    return path


def code_bindings():
    names=set(gpu.CODE_FILES)|set(audit._code_bindings())|{CODE.name}
    return {name:sha(CODE.parent/name) for name in sorted(names)}


def _walk_records(value,resolve):
    """Visit authoritative metadata edges; retain typed review visuals as data.

    The frozen audit validates the legacy review. Its rendered binding is a
    metadata document whose sheets are supporting images, not metadata edges.
    Only that exact policy/binding ancestry grants the narrow opaque role.
    """
    visited={}
    def walk(node,role='metadata',*,document=False):
        if role=='legacy_review_rendered' and document:
            require(isinstance(node,dict) and set(node)=={'accuracy_claim','model_predictions','samples','sheets','support','test_pixels_decoded'}
                and node['accuracy_claim'] is False and node['model_predictions']==0 and node['test_pixels_decoded']==0
                and type(node['samples']) is int and node['samples']>0
                and isinstance(node['support'],dict) and set(node['support'])=={s+'|'+label for s in ('train','validation') for label in CLASSES}
                and isinstance(node['sheets'],list) and 0<len(node['sheets'])<=node['samples'], 'Invalid blind review rendered contract')
            for support in node['support'].values():
                require(isinstance(support,dict) and set(support)=={'requested','selected','shortfall'}
                    and all(type(v) is int and v>=0 for v in support.values())
                    and support['requested']==support['selected']+support['shortfall'],'Invalid rendered review support')
            require(sum(r['selected'] for r in node['support'].values())==node['samples'],'Rendered review sample support differs')
            for sheet in node['sheets']:
                require(isinstance(sheet,dict) and set(sheet)=={'path','sha256'} and isinstance(sheet['path'],str)
                    and sheet['path'] and PureWindowsPath(sheet['path']).suffix.lower()=='.png'
                    and transport.HEX.fullmatch(sheet.get('sha256','')),'Invalid opaque supporting review PNG')
            # Original JSON bytes bind these records. Never resolve relative
            # paths against CWD, read/copy the PNG, or add a metadata mapping.
            return
        if isinstance(node,dict):
            if set(node)=={'path','sha256'}:
                original=node['path'];require(isinstance(original,str) and transport.HEX.fullmatch(node['sha256']),'Invalid metadata edge')
                require(PureWindowsPath(original).is_absolute() or PurePosixPath(original).is_absolute(),
                    'Authoritative metadata reference must have explicit absolute provenance')
                suffix=PureWindowsPath(original).suffix.lower()
                require(suffix in ('.json','.md','.txt','.log','.py','.sh') and (role=='metadata' or suffix=='.json'),
                    'Authoritative edge must reference bounded metadata')
                if original in visited:
                    require(visited[original]==node['sha256'],'Conflicting metadata edge');return
                visited[original]=node['sha256'];path=resolve(node)
                if path.suffix.lower()=='.json':walk(transport._json(path),role,document=True)
            else:
                legacy=(node.get('schema_version')==1 and node.get('policy')==audit.review_base.POLICY
                    and node.get('decision')=='accept' and isinstance(node.get('bindings'),dict)
                    and set(node['bindings'])==audit.review_base.BINDINGS)
                for name,child in node.items():
                    if legacy and name=='bindings':
                        for binding,record in child.items():
                            walk(record,'legacy_review_rendered' if binding=='rendered' else 'metadata')
                    else:walk(child)
        elif isinstance(node,list):
            for child in node:walk(child)
    walk(value)
    return visited


def _mounted_windows(original):
    parts=PurePosixPath(original).parts
    require(len(parts)>3 and parts[0]=='/' and parts[1]=='mnt' and len(parts[2])==1
        and parts[2].isalpha() and '..' not in parts,'Not an explicit mounted Windows path')
    return PureWindowsPath(parts[2].upper()+':/',*parts[3:])


def freeze_admission(admitted,output):
    """Windows parent-only admission gate. Copies metadata, never image/model bytes."""
    require(os.name=='nt','Original Windows audit environment required')
    admitted=Path(admitted).absolute();value=audit.load_audit(admitted);validate_admission(value)
    context=audit._protocol(audit._verify(value['bindings']['protocol']))
    proof=context['proof'];require(proof['development_key']==DEVELOPMENT_KEY,'Wrong accepted development run')
    output=safe_output(output);require(output.is_relative_to(ROOT/'research/datasets'),'Transport below ignored research data required')
    transport._git_check(ROOT,[output.relative_to(ROOT).as_posix()]);output.mkdir(parents=True,exist_ok=False)
    root_records=[audit._record(admitted),context['protocol']['development_manifest'],*context['source_bindings']]
    candidate=Path(value['candidate']['path'])
    for path in (candidate.parent/'audit-completion.json',Path(value['reservation']['path']).parent/'access-started.json'):
        root_records.append(audit._record(path))
    # The frozen audit validator checks these nonstandard named receipt edges.
    review_path=audit._verify(proof['independent_review']);review=transport._json(review_path)
    binary=review['parent_binary_readback']
    for name in ('source','receipt','log'):
        root_records.append(dict(path=binary[name+'_path'],sha256=binary[name+'_sha256']))
    aliases={r['original_path']:r['local_path'] for r in proof.get('relocations',[])}
    mappings=[]
    def resolve(record):
        original=record['path'];relocated=aliases.get(original,original)
        if original.startswith('/mnt/') and original not in aliases:relocated=str(_mounted_windows(original))
        local=Path(relocated).absolute()
        # Only metadata referenced by the validated audit is copied. The helper
        # is the single explicitly named file outside the application checkout.
        require(local.is_relative_to(ROOT) or local==ROOT.parent/'Enter-IILAS-GPU.sh','Foreign metadata relocation')
        require(local.suffix.lower() in ('.json','.md','.txt','.log','.py','.sh')
            and local.is_file() and 0<local.stat().st_size<=32*MiB and sha(local)==record['sha256'],'Changed/bounded metadata required')
        destination=output/(str(len(mappings)).zfill(5)+local.suffix.lower())
        with open(destination,'xb') as stream:stream.write(local.read_bytes())
        require(sha(destination)==record['sha256'],'Metadata copy mismatch')
        mappings.append(dict(original_path=original,windows_path=str(local),repo_path=destination.relative_to(ROOT).as_posix(),sha256=record['sha256']))
        return destination
    _walk_records(root_records,resolve)
    payload=dict(kind='parcel_source_test_transport_v1',windows_repo_root=str(ROOT),admission=value,
        admission_record=root_records[0],source_sha256=context['report']['source_sha256'],
        original_manifest_record=context['protocol']['development_manifest'],source_report_record=context['source_bindings'][1],
        roots=root_records,metadata=mappings,code=code_bindings(),development_proof=proof)
    path=output/'transport.json';gpu.write_sealed(path,payload)
    verify_transport(payload)
    return path


def verify_transport(snapshot):
    require(snapshot.get('kind')=='parcel_source_test_transport_v1' and snapshot.get('code')==code_bindings(),'Transport/code drift')
    mappings=snapshot.get('metadata',[]);table={r['original_path']:r for r in mappings}
    require(len(table)==len(mappings) and len({r['repo_path'] for r in mappings})==len(mappings),'Duplicate metadata relocation')
    windows_root=PureWindowsPath(snapshot['windows_repo_root'])
    require(windows_root.is_absolute(),'Invalid original Windows repository')
    used=set()
    def resolve(record):
        require(record['path'] in table,'Missing original metadata relocation')
        mapping=table[record['path']];windows=PureWindowsPath(mapping['windows_path'])
        require(set(mapping)=={'original_path','windows_path','repo_path','sha256'} and mapping['sha256']==record['sha256']
            and '..' not in windows.parts and (windows.is_relative_to(windows_root) or windows==windows_root.parent/'Enter-IILAS-GPU.sh'),
            'Foreign Windows metadata provenance')
        original=PureWindowsPath(mapping['original_path'])
        if original.is_absolute() and original.drive:
            require(original==windows,'Changed original Windows metadata path')
        else:
            proof=snapshot.get('development_proof',{})
            explicit=any(r['original_path']==mapping['original_path'] and PureWindowsPath(r['local_path'])==windows
                and r['sha256']==mapping['sha256'] for r in proof.get('relocations',[]))
            mounted=mapping['original_path'].startswith('/mnt/') and _mounted_windows(mapping['original_path'])==windows
            require(explicit or mounted,'Unproven original Linux relocation')
        path=transport._safe(ROOT,mapping['repo_path'],data=False)
        require(mapping['repo_path'].startswith('research/datasets/') and sha(path)==record['sha256'],'Changed copied metadata bytes')
        used.add(mapping['original_path']);return path
    _walk_records(snapshot.get('roots',[]),resolve)
    require(used==set(table),'Unused metadata relocation')
    require(snapshot['admission_record'] in snapshot['roots'],'Admission root missing')
    admission=transport._unseal(resolve(snapshot['admission_record']))
    require(admission==snapshot['admission'],'Transport admission differs from untouched original')
    require(snapshot['original_manifest_record'] in snapshot['roots'] and snapshot['source_report_record'] in snapshot['roots'],
        'Original source metadata roots missing')
    original=transport._unseal(resolve(snapshot['original_manifest_record']))
    source_report=transport._json(resolve(snapshot['source_report_record']))
    require(snapshot['source_sha256']==original['source']['sha256']==source_report['source_sha256'],
        'Source header differs from untouched source identity')
    identity=lambda dispositions:sorted((r['sample_id'],r['split'],r['label'],r['sha256']) for r in dispositions)
    require(identity(original['dispositions'])==identity(admission['dispositions']),'Original full source membership/labels/hash closure changed')
    rows=validate_admission(admission)
    for row in rows:
        image=transport._safe(ROOT,row['path'])
        require(0<image.stat().st_size<=16*MiB and sha(image)==row['sha256'],'Changed admitted encoded image')
    population_key(snapshot['source_sha256'],admission)
    return admission


def validate_preflight(proof,context):
    require(proof.get('kind')=='parcel_source_test_preflight_v1' and proof.get('status')=='pass'
        and proof.get('context_sha256')==digest(context) and proof.get('no_test_access') is True
        and proof.get('input_scope') in ('artificial','exposed_validation')
        and proof.get('ordered_fit_ids')==list(FIT_IDS),'Wrong preflight scope/context')
    models=proof.get('models',[])
    require([m.get('fit_id') for m in models]==list(FIT_IDS),'Both fixed preflight models required')
    for model in models:
        require(model.get('state_unchanged') is True and finite(model.get('cold_seconds')) and 0<model['cold_seconds']<=180
            and finite(model.get('projected_seconds')) and 0<model['projected_seconds']<=180,'Preflight cold cost/state rejected')
    require(finite(proof.get('projected_phase_seconds')) and 0<proof['projected_phase_seconds']<=600
        and proof['projected_phase_seconds']>=sum(m['projected_seconds'] for m in models),'Whole preflight projection exceeds bound')
    for record in proof.get('evidence',[]):verify_record(record)


def worker_command(output,fit_id,*,purpose='evaluation'):
    require(purpose in ('evaluation','preflight'),'Unknown worker purpose')
    return [sys.executable,str(CODE),'_worker','--output',str(output),'--fit-id',fit_id,'--purpose',purpose]


def verify_native(target,prepared,fit_id,record,*,purpose='evaluation'):
    import parcel_gpu_runtime as native
    native.validate_native_result(record,180)
    target=Path(target);out=target.parent
    saved=transport._json(target/'native-result.json');request=transport._json(target/'request.json')
    envelope=transport._json(target/'worker-envelope.json');terminal=transport._json(target/'worker-terminal.json')
    require(saved==record,'Changed native-result bytes')
    bindings={name:sha(target/name) for name in ('native-result.json','request.json','worker-envelope.json','worker-terminal.json')}
    for field,name in (('request_sha256','request.json'),('worker_envelope_sha256','worker-envelope.json'),('worker_terminal_sha256','worker-terminal.json')):
        require(record[field]==bindings[name],'Native sidecar hash mismatch')
    expected_unit='iilas-gpu-'+('source' if purpose=='evaluation' else 'source-preflight')+'-'+prepared['key'][:12]+'-'+str(FIT_IDS.index(fit_id))+'.service'
    require(request.get('command')==worker_command(out,fit_id,purpose=purpose) and request.get('unit_name')==record.get('unit_name')==expected_unit
        and request.get('output')==str(target) and request.get('output_tree')==record.get('output_tree')==str(out)
        and request.get('max_output_bytes')==record.get('max_output_bytes')==512*MiB
        and request.get('code_sha256')==prepared['binding']['code']['parcel_gpu_runtime.py']
        and request.get('activation_sha256')==prepared['binding']['activation_helper']['sha256'],'Native evaluator command/identity/quota mismatch')
    native.validate_resource_profile(request)
    require(all(request.get(k)==record.get(k) for k in ('armed_monotonic','effective_wall_seconds','phase_deadline_monotonic','requested_max_wall_seconds'))
        and envelope.get('request_sha256')==bindings['request.json'] and envelope.get('proof',{}).get('unit_name')==expected_unit
        and envelope['proof'].get('properties')==record['properties'] and terminal.get('returncode')==0,'Native request/envelope/terminal mismatch')
    return bindings


def _read_sealed(path):return transport._unseal(Path(path))


def _transport_document(snapshot,record,*,sealed=False):
    mapping=next((r for r in snapshot['metadata'] if r['original_path']==record['path'] and r['sha256']==record['sha256']),None)
    require(mapping is not None,'Missing original proof metadata')
    path=transport._safe(ROOT,mapping['repo_path'],data=False)
    require(sha(path)==record['sha256'],'Changed original proof bytes')
    return _read_sealed(path) if sealed else transport._json(path)


def build_context(source_transport,models):
    source_transport=Path(source_transport);snapshot=_read_sealed(source_transport);admission=verify_transport(snapshot)
    protocol=_transport_document(snapshot,admission['bindings']['protocol'])
    proof=_transport_document(snapshot,protocol['development_proof'])
    require(proof==snapshot.get('development_proof') and proof.get('development_key')==DEVELOPMENT_KEY
        and proof.get('status')=='verified_complete' and proof.get('fit_ids')==list(FIT_IDS),'Exact accepted independent development proof required')
    require(set(models)==set(FIT_IDS),'Exactly the two accepted artifacts required')
    bound_models={}
    for fid in FIT_IDS:
        fit=_transport_document(snapshot,proof['fit_records'][fid],sealed=True)
        require(fit.get('key')==DEVELOPMENT_KEY and fit.get('status')=='success' and fit.get('fit_id')==fid
            and fit.get('optimizer_iterations')==fit.get('expected_optimizer_iterations')
            and type(fit.get('optimizer_iterations')) is int and fit['optimizer_iterations']>0,'Invalid accepted model receipt')
        record=local_record(models[fid]);require(record['sha256']==fit['artifact_sha256'],'Wrong accepted model artifact')
        bound_models[fid]=dict(record,fit_id=fid,optimizer_iterations=fit['optimizer_iterations'])
    context=dict(transport=local_record(source_transport),source_sha256=snapshot['source_sha256'],
        population_key=population_key(snapshot['source_sha256'],admission),membership_sha256=digest(admission['rows']),
        development_proof_sha256=digest(proof),code=code_bindings(),environment=gpu.environment(),
        activation_helper=dict(path=str(gpu.HELPER),sha256=sha(gpu.HELPER)),models=bound_models,policy=evaluation_policy())
    return context,snapshot


def verify_context(context):
    require(context.get('code')==code_bindings() and context.get('policy')==evaluation_policy(),'Evaluation source/policy drift')
    require(context.get('environment')==gpu.environment(),'GPU environment drift')
    require(context['activation_helper']==dict(path=str(gpu.HELPER),sha256=sha(gpu.HELPER)),'GPU activation helper drift')
    model_paths={fid:verify_record({k:v for k,v in context['models'][fid].items() if k in ('repo_path','sha256')}) for fid in FIT_IDS}
    rebuilt,snapshot=build_context(verify_record(context['transport']),model_paths)
    require(rebuilt==context,'Frozen evaluation metadata/artifact binding drift')
    return snapshot


def prepare(source_transport,models,preflight,output):
    context,snapshot=build_context(source_transport,models)
    preflight_path=Path(preflight);proof=_read_sealed(preflight_path)
    validate_preflight(proof,context);verify_preflight_evidence(proof,context,snapshot)
    output=safe_output(output);transport._git_check(ROOT,[output.relative_to(ROOT).as_posix()]);output.mkdir(parents=True,exist_ok=False)
    path=output/'prepared.json'
    gpu.write_sealed(path,dict(profile=PROFILE,key=digest(context),binding=context,preflight=local_record(preflight_path),
        operationally_approved=False,serving_gates='closed'))
    return path


def read_prepared(path):
    prepared=_read_sealed(path);context=prepared.get('binding',{})
    require(prepared.get('profile')==PROFILE and prepared.get('key')==digest(context)
        and prepared.get('operationally_approved') is False and prepared.get('serving_gates')=='closed','Prepared evaluation identity drift')
    snapshot=verify_context(context);proof=_read_sealed(verify_record(prepared['preflight']))
    validate_preflight(proof,context);verify_preflight_evidence(proof,context,snapshot)
    return prepared,snapshot


def snapshot_state(model):
    optimizer=getattr(model,'optimizer',None)
    require(optimizer is not None and getattr(optimizer,'iterations',None) is not None,'Serialized optimizer must be restored')
    def variables(values):
        result=[]
        for index,variable in enumerate(values):
            array=variable.numpy();name=getattr(variable,'path',None) or getattr(variable,'name',None)
            result.append(dict(name=str(index)+':'+str(name),shape=[int(n) for n in array.shape],dtype=str(array.dtype),
                sha256=hashlib.sha256(array.tobytes()).hexdigest()))
        return result
    return dict(model_variables=variables(model.variables),optimizer_variables=variables(optimizer.variables),
        optimizer_iterations=int(optimizer.iterations.numpy()))


def verify_attempt_files(target,prepared,rows,fit_id,*,purpose='evaluation'):
    target=Path(target);attempt=transport._json(target/'attempt.json')
    require(attempt.get('key')==prepared['key'] and attempt.get('purpose')==purpose,'Attempt phase/key identity mismatch')
    validate_attempt(attempt,rows,prepared['binding']['models'][fit_id])
    names=['attempt.json','state-before.json','state-after.json','worker-envelope.json'];offset=0
    child=attempt.get('native',{});wrapper=transport._json(target/'worker-envelope.json').get('proof',{})
    stable=('unit_name','cgroup','resource_profile','properties','cgroup_limits','main_pid')
    require(all(key in child and child[key]==wrapper.get(key) for key in stable)
        and type(child.get('pid')) is int and child['pid']>0 and type(child.get('main_pid')) is int and child['main_pid']>0
        and isinstance(child.get('current_members'),list) and child['pid'] in child['current_members']
        and child['main_pid'] in child['current_members'],'Child native proof differs from verified wrapper')
    for name in ('before','after'):
        require(transport._json(target/('state-'+name+'.json'))==attempt['state_'+name],'Attempt/full state evidence differs')
    expected=[]
    for index,size in enumerate(attempt['batch_sizes']):
        name='batch-'+str(index).zfill(3)+'.json';expected.append(name);names.append(name)
        record=transport._json(target/name);raw=attempt['raw'][offset:offset+size];selected=rows[offset:offset+size]
        require(record.get('size')==size and record.get('sample_ids')==[r['sample_id'] for r in selected]
            and record.get('input_labels')==[CLASSES.index(r['label']) for r in selected]
            and all(record.get(field)==[r[key] for r in raw] for field,key in
                (('probabilities','probabilities'),('logits','logits'),('keras_sparse_ce','keras_sparse_ce')))
            and record.get('devices') and sorted(set(record['devices']))==attempt['output_devices'],
            'Attempt/incremental batch evidence differs')
        if 'timing' in attempt:
            require({k:record[k] for k in ('size','decode_seconds','forward_seconds','pixels')}==attempt['timing'][index],
                'Attempt/incremental timing evidence differs')
        offset+=size
    require(sorted(p.name for p in target.glob('batch-*.json'))==expected,'Unexpected incremental batch evidence')
    return {name:sha(target/name) for name in names}


def evaluate(prepared_path,output):
    """Consume this population even if admission, launch or later guards fail."""
    import parcel_gpu_runtime as native
    prepared,snapshot=read_prepared(prepared_path);admission=snapshot['admission']
    with gpu.exclusive_job() as guard:
        out=safe_output(output);require(not out.exists(),'New evaluation output required')
        transport._git_check(ROOT,[out.relative_to(ROOT).as_posix()])
        claim=reserve_population(snapshot['source_sha256'],admission,prepared,out)
        began=time.monotonic();deadline=began+600;out.mkdir(parents=True,exist_ok=False)
        write(out/'request.json',dict(purpose='evaluation',prepared=prepared,claim=local_record(claim/'reserved.json')))
        try:
            native_records={};attempt_hashes={};attempt_evidence={}
            for index,fid in enumerate(FIT_IDS):
                require(time.monotonic()<deadline,'Whole evaluation deadline exceeded')
                target=out/fid;unit='iilas-gpu-source-'+prepared['key'][:12]+'-'+str(index)
                record=native.run_worker(worker_command(out,fid),target,unit,180,phase_deadline_monotonic=deadline,output_tree=out,max_output_bytes=512*MiB)
                if guard is not None and record.get('cleanup',{}).get('status') not in ('clean','not_started'):guard['retain']=True
                native_records[fid]=verify_native(target,prepared,fid,record)
                attempt=transport._json(target/'attempt.json');validate_attempt(attempt,admission['rows'],prepared['binding']['models'][fid])
                attempt_hashes[fid]=sha(target/'attempt.json')
                attempt_evidence[fid]=verify_attempt_files(target,prepared,admission['rows'],fid)
                require(time.monotonic()<deadline,'Whole evaluation deadline exceeded')
            # Reopen BOTH workers' untouched raw/native evidence after comparator.
            attempts=[]
            for fid in FIT_IDS:
                target=out/fid;record=transport._json(target/'native-result.json')
                require(verify_native(target,prepared,fid,record)==native_records[fid],'Post-comparator native evidence drift')
                require(sha(target/'attempt.json')==attempt_hashes[fid],'Post-comparator attempt bytes changed')
                require(verify_attempt_files(target,prepared,admission['rows'],fid)==attempt_evidence[fid],
                    'Post-comparator incremental/state evidence changed')
                attempt=transport._json(target/'attempt.json');validate_attempt(attempt,admission['rows'],prepared['binding']['models'][fid])
                attempts.append(attempt)
            verify_context(prepared['binding']);report=summarize(admission,attempts,deadline=deadline)
            require(time.monotonic()<deadline,'Whole evaluation/scoring deadline exceeded')
            report.update(key=prepared['key'],binding=prepared['binding'],preflight=prepared['preflight'],native_records=native_records,
                raw_attempts={fid:local_record(out/fid/'attempt.json') for fid in FIT_IDS},elapsed_seconds=time.monotonic()-began)
            report['attempt_evidence']=attempt_evidence
            result=out/'evaluation.json';gpu.write_sealed(result,report)
            require(native.output_bytes(out)<=512*MiB and time.monotonic()<deadline,'Whole output/deadline exceeded')
            write(claim/'completed.json',dict(result=local_record(result),elapsed_seconds=time.monotonic()-began))
            return result
        except Exception as error:
            failure=dict(reason=str(error),elapsed_seconds=time.monotonic()-began,serving_gates='closed',operationally_approved=False)
            write(claim/'failed.json',failure);write(out/'failed.json',failure)
            raise


def batch_inputs(rows,contrast,*,allowed):
    import numpy as np
    from parcel_inputs import decode_rgb,prepare_image
    require(rows and all(r['split'] in allowed for r in rows),'Forbidden scoring partition')
    for start in range(0,len(rows),4):
        began=time.monotonic();images=[];labels=[]
        for row in rows[start:start+4]:
            path=transport._safe(ROOT,row['path']);require(0<path.stat().st_size<=16*MiB,'Image byte bound')
            payload=path.read_bytes();require(hashlib.sha256(payload).hexdigest()==row['sha256'],'Encoded image drift')
            rgb=decode_rgb(payload)
            require(rgb.shape[:2]==(row['height'],row['width']) and row['width']*row['height']<=16000000
                and hashlib.sha256(rgb.tobytes()).hexdigest()==row['pixel_sha256'],'Oriented RGB image drift')
            images.append(prepare_image(rgb,contrast));labels.append(CLASSES.index(row['label']))
        yield np.stack(images),np.asarray(labels,np.int32),time.monotonic()-began


def score_rows(tf,model,rows,batches,target):
    """One exact compiled path, used for TEST and explicit exposed-VALID preflight."""
    forward=gpu.compiled_validation_forward(tf,model);raw=[];sizes=[];devices=set();timing=[];offset=0
    for index,(images,labels,decode_seconds) in enumerate(batches):
        selected=rows[offset:offset+len(images)];began=time.monotonic()
        values=forward(tf.convert_to_tensor(images),tf.convert_to_tensor(labels))
        p,z,ce=[v.numpy().tolist() for v in values]
        elapsed=time.monotonic()-began
        batch=[dict(**{k:r[k] for k in ('sample_id','label','dependency_group_id','sha256','pixel_sha256')},
            probabilities=prob,logits=logit,keras_sparse_ce=loss) for r,prob,logit,loss in zip(selected,p,z,ce)]
        # Preserve output tensor metadata and all materialized outputs BEFORE any
        # cardinality, placement, numerical or row-order success guard.
        record=dict(sample_ids=[r['sample_id'] for r in selected],input_labels=[int(x) for x in labels],
            probabilities=p,logits=z,keras_sparse_ce=ce,devices=[getattr(v,'device',None) for v in values],
            size=len(images),decode_seconds=decode_seconds,forward_seconds=elapsed,
            pixels=sum(r['width']*r['height'] for r in selected))
        write(Path(target)/('batch-'+str(index).zfill(3)+'.json'),record)
        require(index<len(gpu.batch_sizes(len(rows))) and len(images)==gpu.batch_sizes(len(rows))[index]
            and [int(x) for x in labels]==[CLASSES.index(r['label']) for r in selected]
            and len(p)==len(z)==len(ce)==len(selected),'Scoring cardinality/order mismatch')
        for value in values:devices.add(gpu.require_gpu_tensor(value))
        raw.extend(batch);sizes.append(len(images));timing.append({k:record[k] for k in ('size','decode_seconds','forward_seconds','pixels')});offset+=len(images)
    require(offset==len(rows),'Incomplete scoring stream')
    return raw,sizes,sorted(devices),timing


def project_preflight(attempt,target,*,native=None):
    timing=attempt.get('timing',[]);startup=attempt.get('startup_seconds')
    require(finite(startup) and startup>0 and [t.get('size') for t in timing]==[4,2], 'Cold4+short2 preflight required')
    for t in timing:
        require(all(finite(t.get(k)) and t[k]>0 for k in ('decode_seconds','forward_seconds')),'Missing positive preflight timings')
    count=target if type(target) is int else len(target)
    decode=max(t['decode_seconds']/t['size'] for t in timing)*count
    if isinstance(target,list):
        require(all(type(t.get('pixels')) is int and t['pixels']>0 for t in timing),'Preflight pixel-cost evidence required')
        decode=max(t['decode_seconds']/t['pixels'] for t in timing)*sum(r['width']*r['height'] for r in target)
    fixed=startup
    if native is not None:
        require(finite(native.get('elapsed_seconds')) and native['elapsed_seconds']>0,'Native cold elapsed missing')
        fixed=native['elapsed_seconds']-sum(t['decode_seconds']+t['forward_seconds'] for t in timing)
        require(fixed>=startup and native['elapsed_seconds']>=attempt.get('cold_seconds',0),'Native elapsed omits cold worker work')
    projected=fixed+timing[0]['forward_seconds']+2*(decode+timing[1]['forward_seconds']/2*count)
    require(0<projected<=180,'Preflight projection exceeds180seconds')
    return projected


def _preflight_rows(development_transport,context):
    loaded=gpu.fast_transport.load_transport(development_transport);gpu.validate_cohort(loaded['manifest'])
    rows=sorted((r for r in loaded['manifest']['rows'] if r['split']=='validation'),key=lambda r:r['sample_id'])[:6]
    # The accepted proof's immutable comparison binds the original membership.
    snapshot=_read_sealed(verify_record(context['transport']))
    proof=snapshot['development_proof'];comparison=_transport_document(snapshot,proof['comparison'],sealed=True)
    require(digest(loaded['manifest']['rows'])==comparison['binding']['membership_sha256'],'Preflight VALID is not accepted development membership')
    require(len(rows)==6,'Six exposed VALID views required')
    return rows


def _worker(output,fit_id,purpose):
    import parcel_gpu_runtime as native
    native_proof=native.require_worker()  # BEFORE TensorFlow or any image decoder.
    began=time.monotonic();output=safe_output(output);target=output/fit_id
    request=transport._json(output/'request.json');prepared=request['prepared'];context=prepared['binding']
    require(request.get('purpose')==purpose and fit_id in FIT_IDS and prepared.get('key')==digest(context),'Wrong worker request')
    snapshot=verify_context(context)
    if purpose=='evaluation':
        require(prepared.get('profile')==PROFILE,'Wrong evaluation profile')
        # Controller has already verified cold proof; verify its immutable bytes
        # here without recursively reloading both cold workers' model evidence.
        preflight=_read_sealed(verify_record(prepared['preflight']));validate_preflight(preflight,context)
        claim=transport._json(verify_record(request['claim']))
        require(claim['population_key']==population_key(snapshot['source_sha256'],snapshot['admission'])
            and claim['protocol']==prepared and claim['output']==str(output),'Population reservation mismatch')
        rows=snapshot['admission']['rows'];allowed=('test',)
    else:
        require(purpose=='preflight' and prepared.get('profile')==PROFILE+'-preflight','Wrong preflight profile')
        rows=_preflight_rows(verify_record(request['development_transport']),context);allowed=('validation',)
    require('tensorflow' not in sys.modules,'TensorFlow imported before native/configuration proof')
    os.environ.update(KERAS_HOME=str(target/'keras-cache'),TF_DETERMINISTIC_OPS='1',TF_ENABLE_ONEDNN_OPTS='0',CUDA_VISIBLE_DEVICES='0')
    for name in ('TF_NUM_INTRAOP_THREADS','TF_NUM_INTEROP_THREADS','OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS'):os.environ[name]='1'
    import tempfile
    tmp=target/'tmp';tmp.mkdir();os.environ['TMPDIR']=str(tmp);tempfile.tempdir=str(tmp)
    import socket
    def denied(*args,**kwargs):raise RuntimeError('Network prohibited in source evaluator')
    socket.create_connection=denied;socket.socket.connect=denied;socket.socket.connect_ex=denied
    import tensorflow as tf
    device=gpu.configure_gpu(tf);model_record=context['models'][fit_id]
    artifact=verify_record({k:v for k,v in model_record.items() if k in ('repo_path','sha256')})
    artifact_before=sha(artifact)
    model=tf.keras.models.load_model(artifact,compile=True)
    before=snapshot_state(model);write(target/'state-before.json',before)
    startup=time.monotonic()-began;attempt=None
    try:
        raw,sizes,devices,timing=score_rows(tf,model,rows,batch_inputs(rows,fit_id.rsplit('-',1)[1],allowed=allowed),target)
        after=snapshot_state(model);write(target/'state-after.json',after)
        attempt=dict(fit_id=fit_id,key=prepared['key'],purpose=purpose,scoring=evaluation_policy()['scoring'],
            raw=raw,batch_sizes=sizes,output_devices=devices,artifact_before_sha256=artifact_before,
            artifact_after_sha256=sha(artifact),state_before=before,state_after=after,native=native_proof,gpu=device,
            tf32_enabled=bool(tf.config.experimental.tensor_float_32_execution_enabled()),
            startup_seconds=startup,timing=timing,cold_seconds=time.monotonic()-began)
        persist_attempt(target,attempt,rows,model_record)
        verify_context(context)
    except Exception as error:
        failure=dict(reason=str(error),partial_batches=sorted(p.name for p in target.glob('batch-*.json')),
            artifact_after_sha256=sha(artifact),state_after=snapshot_state(model))
        write(target/'worker-failed.json',failure)
        raise


def scoring_cost():
    """Cold stdlib-only worst support benchmark, artificial102 independent groups."""
    rows=[dict(sample_id='artificial-'+str(i),label=CLASSES[i%2],dependency_group_id='group-'+str(i)) for i in range(102)]
    raw=[dict(probabilities=[.8,.2],logits=[math.log(.8),math.log(.2)]) for _ in rows]
    attempts=[dict(fit_id=fid,raw=raw) for fid in FIT_IDS];began=time.monotonic()
    paired_bootstrap(rows,attempts);paired_bootstrap(rows,attempts)
    return dict(kind='artificial102_primary_and_strict_2000paired_bootstrap',seconds=time.monotonic()-began,safety_factor=2)


def verify_preflight_evidence(proof,context,snapshot):
    require(proof.get('input_scope')=='exposed_validation','Actual accepted exposed VALID coldproof required')
    rows=_preflight_rows(verify_record(proof['development_transport']),context)
    require(proof.get('validation_rows')==rows,'Preflight exposed membership/order changed')
    prepared=dict(key=digest(context),binding=context)
    for item,fid in zip(proof['models'],FIT_IDS):
        path=verify_record(item['attempt']);target=path.parent
        native=transport._json(verify_record(item['native']))
        bindings=verify_native(target,prepared,fid,native,purpose='preflight')
        require(bindings==item['native_bindings'],'Preflight native evidence drift')
        attempt=transport._json(path);validate_attempt(attempt,rows,context['models'][fid])
        require(verify_attempt_files(target,prepared,rows,fid,purpose='preflight')==item['attempt_evidence'],
            'Preflight incremental/state evidence drift')
        require(attempt.get('purpose')=='preflight' and attempt.get('key')==prepared['key']
            and item['cold_seconds']==attempt['cold_seconds']
            and item['projected_seconds']==project_preflight(attempt,snapshot['admission']['rows'],native=native), 'Preflight cost/raw binding drift')
    cost=proof['scoring_cost']
    require(cost.get('kind')=='artificial102_primary_and_strict_2000paired_bootstrap' and cost.get('safety_factor')==2
        and finite(cost.get('seconds')) and cost['seconds']>0
        and finite(proof.get('controller_fixed_seconds')) and proof['controller_fixed_seconds']>=0
        and proof['projected_phase_seconds']==sum(m['projected_seconds'] for m in proof['models'])+2*cost['seconds']+2*proof['controller_fixed_seconds'],
        'Scoring/controller cost binding mismatch')


def run_preflight(source_transport,models,development_transport,output):
    """Parent-only actual native coldproof on the fixed six already exposed VALID."""
    import parcel_gpu_runtime as native
    context,snapshot=build_context(source_transport,models)
    development_transport=Path(development_transport);rows=_preflight_rows(development_transport,context)
    prepared=dict(profile=PROFILE+'-preflight',key=digest(context),binding=context)
    with gpu.exclusive_job() as guard:
        output=safe_output(output);transport._git_check(ROOT,[output.relative_to(ROOT).as_posix()]);output.mkdir(parents=True,exist_ok=False)
        write(output/'request.json',dict(purpose='preflight',prepared=prepared,development_transport=local_record(development_transport)))
        began=time.monotonic();deadline=began+600;results=[];native_seconds=0.
        try:
            for index,fid in enumerate(FIT_IDS):
                target=output/fid;unit='iilas-gpu-source-preflight-'+prepared['key'][:12]+'-'+str(index)
                record=native.run_worker(worker_command(output,fid,purpose='preflight'),target,unit,180,
                    phase_deadline_monotonic=deadline,output_tree=output,max_output_bytes=512*MiB)
                if guard is not None and record.get('cleanup',{}).get('status') not in ('clean','not_started'):guard['retain']=True
                bindings=verify_native(target,prepared,fid,record,purpose='preflight')
                attempt=transport._json(target/'attempt.json');validate_attempt(attempt,rows,context['models'][fid])
                evidence=verify_attempt_files(target,prepared,rows,fid,purpose='preflight');native_seconds+=record['elapsed_seconds']
                results.append(dict(fit_id=fid,cold_seconds=attempt['cold_seconds'],projected_seconds=project_preflight(attempt,snapshot['admission']['rows'],native=record),
                    state_unchanged=True,attempt=local_record(target/'attempt.json'),native=local_record(target/'native-result.json'),native_bindings=bindings,attempt_evidence=evidence))
            verify_context(context);cost=scoring_cost();controller_fixed=max(0.,time.monotonic()-began-native_seconds-cost['seconds'])
            proof=dict(kind='parcel_source_test_preflight_v1',status='pass',context_sha256=digest(context),
                no_test_access=True,input_scope='exposed_validation',ordered_fit_ids=list(FIT_IDS),models=results,
                validation_rows=rows,development_transport=local_record(development_transport),scoring_cost=cost,
                controller_fixed_seconds=controller_fixed,projected_phase_seconds=sum(m['projected_seconds'] for m in results)+2*cost['seconds']+2*controller_fixed,evidence=[])
            validate_preflight(proof,context);verify_preflight_evidence(proof,context,snapshot)
            require(time.monotonic()<deadline and native.output_bytes(output)<=512*MiB,'Preflight whole bound exceeded')
            result=output/'preflight.json';gpu.write_sealed(result,proof);return result
        except Exception as error:
            write(output/'failed.json',dict(reason=str(error),no_test_access=True));raise


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    freeze=sub.add_parser('freeze');freeze.add_argument('--admitted',type=Path,required=True);freeze.add_argument('--output',type=Path,required=True)
    prepare_parser=sub.add_parser('prepare')
    for name in ('transport','mobilenet','efficientnet','preflight','output'):prepare_parser.add_argument('--'+name,type=Path,required=True)
    evaluate_parser=sub.add_parser('evaluate');evaluate_parser.add_argument('--prepared',type=Path,required=True);evaluate_parser.add_argument('--output',type=Path,required=True)
    worker=sub.add_parser('_worker');worker.add_argument('--output',type=Path,required=True);worker.add_argument('--fit-id',choices=FIT_IDS,required=True);worker.add_argument('--purpose',choices=('evaluation','preflight'),required=True)
    args=parser.parse_args(argv)
    if args.command=='freeze':result=freeze_admission(args.admitted,args.output)
    elif args.command=='prepare':result=prepare(args.transport,dict(zip(FIT_IDS,(args.mobilenet,args.efficientnet))),args.preflight,args.output)
    elif args.command=='evaluate':result=evaluate(args.prepared,args.output)
    else:return _worker(args.output,args.fit_id,args.purpose)
    print(result)


if __name__=='__main__':main()
