"""One supervised MobileNetV2 tail candidate; development evidence only.

The old crop development sources and artifacts are inputs, never updated here.
Public admission reads metadata/checkpoint hashes, never reserved test pixels.
Receipts are accidental-mutation guards, not protection against a code owner.
"""
import argparse
from collections import Counter
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import kaputt_crop_train as old
import parcel_train as base
import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
MiB = 1024**2
RECIPE = 'mobilenetv2-tail14-16-conv1-lr1e-5-v1'
FIT_ID = 'mobilenetv2-clahe-tail'
PROBE_SALT = 'iilas-tail-gradient-probe-v1'
CODE_FILES = (*old.CODE_FILES, 'parcel_finetune.py', 'kaputt_crop_finetune.py')


def phase_limits():
    return runtime.Limits(max_wall_seconds=3300, max_fit_seconds=3000,
        max_rss_bytes=2048*MiB, min_available_bytes=3072*MiB,
        min_free_disk_bytes=2048*MiB, max_output_bytes=512*MiB,
        available_floor_bytes=768*MiB, threads=1)


def probe_limits():
    return runtime.Limits(max_wall_seconds=180, max_fit_seconds=180,
        max_rss_bytes=2048*MiB, min_available_bytes=3072*MiB,
        min_free_disk_bytes=2048*MiB, max_output_bytes=32*MiB,
        available_floor_bytes=768*MiB, threads=1)


def recipe():
    return dict(schema_version=1, recipe_version=RECIPE,
        benchmark_profile='kaputt_crop_tail_development', evaluation_scope='development_only',
        operationally_approved=False, input_scope='crop_only', architecture='mobilenetv2',
        contrast='clahe', fixed_comparator='efficientnetb0-none', seed=42, batch_size=4,
        epochs=5, patience=2, learning_rate=1e-5, optimizer='fresh-Adam', dropout=.2,
        class_order=['Normal','Damaged'], preprocessing='rgb-letterbox224-v1',
        weighting='equal_dependency_component_mean1', augmentation='unchanged-train-only-v1',
        decision='argmax-exact-tie-abstains', selection='component_macro_f1_desc-nll_asc-baseline_on_ties',
        trainable='block_14-15-16-and-Conv_1-convolution-kernels-plus-normal_damaged-head',
        frozen='all-BatchNormalization-and-earlier-backbone-weights',
        loss_reduction='sum_over_batch_size', restore_best_weights=True,
        limits={'develop':vars(phase_limits()),'probe':vars(probe_limits())},
        packages=copy.deepcopy(old.PINNED_PACKAGES))


def code_bindings():
    return {name:runtime.sha256_file(Path(__file__).parent/name) for name in CODE_FILES}


def metadata_path(path, maximum=4*MiB):
    # Do not resolve or read before checking traversal, links and reparse points.
    raw=Path(path)
    if raw.suffix != '.json': raise ValueError('Bounded JSON metadata required')
    safe=runtime._validate_output_path(old._research_file_path(raw))
    if not safe.is_file() or not 0 < safe.stat().st_size <= maximum:
        raise ValueError('Bounded JSON metadata required')
    return safe


def read_json(path, maximum=4*MiB):
    path=metadata_path(path,maximum)
    def invalid(value): raise ValueError('Nonfinite JSON number: '+value)
    return json.loads(path.read_text(encoding='utf-8'),parse_constant=invalid)


def read_sealed(path):
    doc=read_json(path)
    if (not isinstance(doc,dict) or set(doc) != {'payload','sha256'}
            or base.digest(doc['payload']) != doc['sha256']):
        raise ValueError('Invalid hash seal')
    return doc['payload']


def record(path):
    path=runtime._validate_output_path(old._research_file_path(path))
    if not path.is_file():raise ValueError('Missing bound artifact')
    return {'path':str(path),'sha256':runtime.sha256_file(path)}


def check_record(value, *, json_only=False):
    if not isinstance(value,dict) or set(value) != {'path','sha256'}:
        raise ValueError('Invalid artifact binding')
    path=metadata_path(value['path']) if json_only else runtime._validate_output_path(old._research_file_path(value['path']))
    if not path.is_file() or runtime.sha256_file(path) != value['sha256']:
        raise ValueError('Changed bound artifact')
    return path


def verify_resource(path, limits, *, fit=True):
    value=read_json(path)
    maximum=limits.max_fit_seconds if fit else limits.max_wall_seconds
    if (value.get('status') != 'success' or value.get('reason') is not None
            or value.get('returncode') != 0):raise ValueError('Incomplete resource result')
    for key,cap in (('elapsed_seconds',maximum),('peak_rss_bytes',limits.max_rss_bytes)):
        number=value.get(key)
        if type(number) not in (int,float) or not math.isfinite(number) or not 0 <= number <= cap:
            raise ValueError('Invalid resource bound: '+key)
    snap=value.get('last_snapshot',{})
    for key,minimum in (('available_bytes',limits.available_floor_bytes),('free_disk_bytes',limits.min_free_disk_bytes)):
        if type(snap.get(key)) is not int or snap[key] < minimum:raise ValueError('Invalid resource snapshot')
    for key,maximum in (('rss_bytes',limits.max_rss_bytes),('output_bytes',limits.max_output_bytes)):
        if type(snap.get(key)) is not int or not 0 <= snap[key] <= maximum:raise ValueError('Invalid resource snapshot')
    if not snap.get('pids') or any(type(pid) is not int or pid <= 0 for pid in snap['pids']):
        raise ValueError('Missing native process membership')
    return value


def _closed(value):
    if value.get('operationally_approved') is not False:
        raise ValueError('Operational acceptance must remain closed')


def verify_predictions(target, fit, rows):
    raw=read_json(Path(target)/'validation-predictions.json')
    if not isinstance(raw,list) or len(raw) != len(rows):raise ValueError('Raw prediction count mismatch')
    weights=old.component_weights(rows)
    for row,weight,prediction in zip(rows,weights,raw):
        for name in ('sample_id','capture_id','label','item_identifier','dependency_group_id'):
            if prediction.get(name) != row[name]:raise ValueError('Raw prediction association mismatch')
        if prediction.get('component_weight') != weight:raise ValueError('Raw component weight mismatch')
    metrics=old.validation_metrics(rows,[row['probabilities'] for row in raw])
    for prediction,decision in zip(raw,metrics['predictions']):
        if prediction.get('prediction') != ('Uncertain' if decision < 0 else old.CLASS_ORDER[decision]):
            raise ValueError('Changed exact-tie-abstains decision')
    if (fit.get('validation_metrics') != metrics
            or fit.get('component_macro_f1') != metrics['component_weighted']['macro_f1']
            or fit.get('component_nll') != metrics['component_weighted']['nll']):
        raise ValueError('Raw metrics mismatch')
    history=read_json(Path(target)/'history.json')
    losses=history.get('val_loss',[])
    if (not losses or any(type(v) not in (int,float) or not math.isfinite(v) or v < 0 for v in losses)
            or not math.isclose(min(losses),fit['component_nll'],rel_tol=0,abs_tol=2e-5)):
        raise ValueError('Best validation history does not match restored artifact')
    return metrics


def _verify_completed(out, selection, run, data):
    """Complete original receipt graph after original metadata admission."""
    key=run['key'];binding=run['binding']
    if (selection.get('status') != 'complete' or selection.get('development_key') != key
            or selection.get('binding') != binding or selection.get('evaluation_scope') != 'development_only'
            or selection.get('input_scope') != 'crop_only' or selection.get('class_order') != list(old.CLASS_ORDER)
            or selection.get('decision') != 'argmax-exact-tie-abstains'
            or selection.get('test_metrics') != 'Not run'
            or selection.get('benchmark_context') != binding['benchmark_context']):
        raise ValueError('Incomplete or changed baseline selection')
    _closed(selection)
    rows={split:[r for r in data['rows'] if r['split'] == split] for split in ('train','validation')}
    if ({split:len(value) for split,value in rows.items()} != {'train':633,'validation':133}
            or Counter(r['label'] for r in rows['train']) != {'Normal':369,'Damaged':264}
            or Counter(r['label'] for r in rows['validation']) != {'Normal':80,'Damaged':53}
            or len(data.get('reserved_test_metadata',[])) != 147):
        raise ValueError('Exact original 633/133 development cohort required')
    old.validate_fit_set(selection['all_fits'])
    for fit in selection['all_fits']:
        fit_id=fit['fit_id'];target=out/fit_id
        if read_sealed(target/'fit.json') != fit:raise ValueError('Fit receipt differs from selection')
        old.verify_fit_result(out,run,fit)
        _closed(fit)
        if (fit.get('seed') != 42 or fit.get('weights_sha256') != binding['settings']['weights'][fit['architecture']]['sha256']
                or fit.get('benchmark_context') != binding['benchmark_context']
                or fit.get('partition_counts') != {split:old.partition_summary(value) for split,value in rows.items()}):
            raise ValueError('Changed fit recipe/cohort context')
        verify_predictions(target,fit,rows['validation'])
        verify_resource(out/(fit_id+'.result.json'),old.phase_limits())
        expected={'development_key':key,'binding_sha256':base.digest(binding),'fit_id':fit_id,
            'fit_receipt_sha256':runtime.sha256_file(target/'fit.json'),
            'resource_result_sha256':runtime.sha256_file(out/(fit_id+'.result.json'))}
        if read_sealed(target/'worker-receipt.json') != expected:raise ValueError('Changed worker/resource link')
    selected=[old.choose_variant([r for r in selection['all_fits'] if r['architecture'] == name]) for name in old.ARCHITECTURES]
    if (selection.get('selected') != selected or [r['fit_id'] for r in selected] != ['mobilenetv2-clahe','efficientnetb0-none']):
        raise ValueError('Required selected Mobile CLAHE and EfficientNet none baseline')
    verify_resource(out/'development.result.json',old.phase_limits(),fit=False)
    expected={'development_key':key,'binding_sha256':base.digest(binding),
        'resource_result_sha256':runtime.sha256_file(out/'development.result.json'),
        'selection_sha256':runtime.sha256_file(out/'selection.json')}
    if read_sealed(out/'phase-receipt.json') != expected:raise ValueError('Changed phase receipt')
    claim=runtime._validate_output_path(old._research_file_path(run['claim']))
    canonical=ROOT/'research/datasets/kaputt-crop-run-registry'/('develop-'+key)
    if claim != canonical or Path(run['output']).resolve() != out:raise ValueError('Changed original claim/output')
    started=read_json(claim/'started.json')
    if (started != {'key':key,'phase':'develop','output':str(out),'fit_ids':list(old.FIT_IDS),'profile':old.PROFILE}
            or (claim/'failed.json').exists()
            or read_json(claim/'completed.json') != {'selection_sha256':runtime.sha256_file(out/'selection.json')}):
        raise ValueError('Original development claim is not completed')


def verify_baseline(selection_path,manifest_path):
    selection_path=metadata_path(selection_path);manifest_path=metadata_path(manifest_path)
    out=selection_path.parent
    if selection_path.name != 'selection.json':raise ValueError('Original selection filename required')
    selection=read_sealed(selection_path);run=read_sealed(out/'development.json')
    binding=run['binding']
    metadata_path(binding['protocol']['path'],MiB)
    check_record(binding['protocol'],json_only=True)
    validate_original_protocol_paths(read_json(binding['protocol']['path'],MiB),Path(binding['protocol']['path']).parent)
    if (record(manifest_path) != binding['manifest'] or binding['code'] != old.code_bindings()
            or binding['environment'] != base.environment()):raise ValueError('Changed original source/manifest/environment')
    old.verify_binding(binding)
    data=old.load_frozen(manifest_path)
    if old.experiment_identity(data,binding) != run['key']:raise ValueError('Changed original development identity')
    deny_test_claim(run['key'])
    _verify_completed(out,selection,run,data)
    return {'development_key':run['key'],'selection':record(selection_path),'manifest':record(manifest_path),
        'development':record(out/'development.json'),'phase':record(out/'phase-receipt.json'),
        'resource':record(out/'development.result.json'),'completed_claim':record(Path(run['claim'])/'completed.json'),
        'original_binding_sha256':base.digest(binding),
        'mobile':copy.deepcopy(selection['selected'][0]),'comparator':copy.deepcopy(selection['selected'][1])}


def validate_original_protocol_paths(protocol,parent):
    # The sealed old implementation predates the stricter path pre-admission.
    # Check its checkpoint/proof references here before it can hash any bytes.
    for value in protocol.get('weights',{}).values():
        path=Path(value.get('path',''))
        if not path.is_absolute():path=Path(parent)/path
        if path.suffix != '.h5':raise ValueError('Original checkpoint must be HDF5, never pixels')
        runtime._validate_output_path(old._research_file_path(path))
    for value in protocol.get('weight_proofs',[]):
        path=Path(value.get('path',''))
        if not path.is_absolute():path=Path(parent)/path
        if path.suffix not in ('.md','.json'):raise ValueError('Original proof must be metadata, never pixels')
        runtime._validate_output_path(old._research_file_path(path))


def deny_test_claim(key):
    test=runtime._validate_output_path(ROOT/'research/datasets/kaputt-crop-test-registry'/('test-'+key))
    if test.exists():raise ValueError('Internal test already claimed; new development prohibited')


def candidate_identity(baseline_development_key):
    if (not isinstance(baseline_development_key,str) or len(baseline_development_key) != 64
            or any(c not in '0123456789abcdef' for c in baseline_development_key)):
        raise ValueError('Invalid baseline development key')
    return base.digest({'baseline_development_key':baseline_development_key,'recipe_version':RECIPE})


def claim_candidate(key,details,registry=None):
    deny_test_claim(key)
    return base.claim_phase(candidate_identity(key),'develop',details,
        registry or ROOT/'research/datasets/kaputt-crop-finetune-registry')


def choose_candidate(baseline,candidate):
    for value in (baseline,candidate):
        for name in ('component_macro_f1','component_nll'):
            number=value.get(name)
            if type(number) not in (int,float) or not math.isfinite(number) or number < 0:
                raise ValueError('Invalid component validation metric')
        if value['component_macro_f1'] > 1:raise ValueError('Invalid F1')
    return candidate if (-candidate['component_macro_f1'],candidate['component_nll']) < (-baseline['component_macro_f1'],baseline['component_nll']) else baseline


def probe_samples(rows):
    if any(r.get('official_split') != 'train' for r in rows):raise ValueError('Only publisher TRAIN is allowed')
    weights=old.component_weights(rows)
    if rows[0]['split'] != 'train':raise ValueError('Only development TRAIN is allowed')
    ranked=sorted(zip(rows,weights),key=lambda pair:hashlib.sha256((PROBE_SALT+':'+pair[0]['sample_id']).encode()).hexdigest())
    selected=[];items=set();components=set()
    for label in old.CLASS_ORDER:
        count=0
        for row,weight in ranked:
            if row['label'] != label or row['item_identifier'] in items or row['dependency_group_id'] in components:continue
            selected.append(dict({k:v for k,v in row.items() if k not in ('_image_path','_group_id')},component_weight=weight))
            items.add(row['item_identifier']);components.add(row['dependency_group_id']);count+=1
            if count == 2:break
        if count != 2:raise ValueError('Four distinct TRAIN source items/components required')
    return selected


def require_inventory(actual,expected):
    if not isinstance(actual,dict) or not actual or actual != expected:
        raise ValueError('Changed trainable inventory')
    validate_inventory(actual)


def validate_inventory(inventory):
    expected={}
    for block in (14,15,16):
        expected[f'block_{block}_expand/kernel']=[1,1,160,960]
        expected[f'block_{block}_depthwise/kernel']=[3,3,960,1]
        expected[f'block_{block}_project/kernel']=[1,1,960,320 if block == 16 else 160]
    expected.update({'Conv_1/kernel':[1,1,320,1280],'normal_damaged/kernel':[1280,2],'normal_damaged/bias':[2]})
    records=inventory.get('trainable_variables',[])
    if (inventory.get('schema_version') != 1 or inventory.get('architecture') != 'mobilenetv2_parcel'
            or inventory.get('trainable_variable_count') != 12 or len(records) != 12
            or inventory.get('trainable_parameter_count') != 1513282
            or {r.get('name') for r in records} != set(expected)):
        raise ValueError('Unexpected exact tail inventory')
    for value in records:
        if (value.get('shape') != expected[value['name']] or value.get('dtype') != 'float32'
                or value.get('layer') != value['name'].rsplit('/',1)[0]
                or value.get('parameters') != math.prod(value['shape'])):
            raise ValueError('Unexpected tail variable shape/layer/dtype')


def validate_fingerprint(value,inventory,*,frozen_only=False):
    records=inventory['frozen_variables'] if frozen_only else [*inventory['trainable_variables'],*inventory['frozen_variables']]
    expected={r['name']:r for r in records}
    if (not isinstance(value,dict) or value.get('frozen_only') is not frozen_only
            or set(value.get('learned_weights',{})) != set(expected)
            or set(value.get('batch_normalization',{})) != {r['name'] for r in inventory['batch_normalization_variables']}):
        raise ValueError('Changed fingerprint variable structure')
    for name,entry in value['learned_weights'].items():
        if (entry.get('shape') != expected[name]['shape'] or entry.get('dtype') != expected[name]['dtype']
                or not isinstance(entry.get('sha256'),str) or len(entry['sha256']) != 64
                or any(c not in '0123456789abcdef' for c in entry['sha256'])):
            raise ValueError('Invalid learned weight fingerprint')
    if any(value['learned_weights'].get(name) != entry for name,entry in value['batch_normalization'].items()):
        raise ValueError('Changed BN fingerprint association')


def validate_weight_change(before,after,frozen_before,frozen_after,inventory=None):
    # Dropout RNG counters may advance in model.fit, but they are not learned
    # parameters. They neither invalidate frozen state nor prove a tail update.
    for name in ('learned_weights','batch_normalization'):
        if name not in frozen_before or frozen_before[name] != frozen_after.get(name):
            raise ValueError('Changed frozen learned weights/BN state')
    if before.get('batch_normalization') != after.get('batch_normalization'):
        raise ValueError('Changed frozen BatchNormalization state')
    first=before.get('learned_weights',{});last=after.get('learned_weights',{})
    if not first or set(first) != set(last):raise ValueError('Changed learned weight structure')
    changed={name for name in first if first[name] != last[name]}
    allowed=set(first)-set(frozen_before['learned_weights'])
    if inventory is not None:
        allowed={r['name'] for r in inventory['trainable_variables']}
    if not changed or not changed <= allowed:raise ValueError('No permitted learned weight changed, or forbidden update')


def _binding(selection,manifest):
    return {'baseline':verify_baseline(selection,manifest),'sources':code_bindings(),'environment':base.environment()}


def verify_binding(binding):
    baseline=binding['baseline']
    if _binding(baseline['selection']['path'],baseline['manifest']['path']) != binding:
        raise ValueError('Changed source/environment/baseline binding')


def probe(selection_path,manifest_path,output):
    binding=_binding(selection_path,manifest_path)
    data=old.load_frozen(manifest_path)
    samples=probe_samples([r for r in data['rows'] if r['split'] == 'train'])
    out=runtime.create_run_directory(output)
    supervisor=runtime.ResourceSupervisor(out,probe_limits())
    try:supervisor.preflight()
    except Exception as error:
        runtime.write_json_exclusive(out/'preflight-failed.json',{'reason':str(error)});raise
    base.write_sealed(out/'probe-request.json',{'binding':binding,'samples':samples,'salt':PROBE_SALT,
        'limits':vars(probe_limits()),'optimizer_updates':0,'warmup_passes':1,'timed_passes':3})
    result=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_probe','--output',str(out)],fit_id='probe',cwd=ROOT)
    if result['status'] != 'success':raise ValueError('Probe failed; preserve evidence: '+str(result['reason']))
    verify_probe(out/'probe-request.json',out/'probe-report.json',out/'probe.result.json')
    base.write_sealed(out/'probe-receipt.json',{'request':record(out/'probe-request.json'),
        'report':record(out/'probe-report.json'),'resource':record(out/'probe.result.json'),
        'binding_sha256':base.digest(binding)})
    return out/'probe-receipt.json'


def verify_probe(request_path,report_path,resource_path):
    request_path=metadata_path(request_path);out=request_path.parent
    if (Path(report_path).absolute() != out/'probe-report.json'
            or Path(resource_path).absolute() != out/'probe.result.json'
            or request_path.name != 'probe-request.json'):raise ValueError('Probe proof path mismatch')
    request=read_sealed(request_path);report=read_sealed(report_path)
    verify_binding(request['binding'])
    data=old.load_frozen(request['binding']['baseline']['manifest']['path'])
    samples=probe_samples([r for r in data['rows'] if r['split'] == 'train'])
    validate_probe_request(request,samples)
    verify_resource(resource_path,probe_limits())
    if (report.get('status') != 'success' or report.get('request_sha256') != runtime.sha256_file(request_path)
            or report.get('binding_sha256') != base.digest(request['binding'])
            or report.get('sample_ids') != [r['sample_id'] for r in samples]
            or report.get('optimizer_updates') != 0):raise ValueError('Changed probe report binding')
    validate_gradient_proof(report['gradient_proof'])
    if report['gradient_proof']['sample_weights'] != [r['component_weight'] for r in samples]:
        raise ValueError('Probe used different full-partition sample weights')
    require_inventory(report['inventory'],report['gradient_proof']['inventory'])
    return report


def validate_probe_request(request,samples):
    if (request.get('samples') != samples or request.get('salt') != PROBE_SALT
            or request.get('limits') != vars(probe_limits()) or type(request.get('optimizer_updates')) is not int
            or request.get('optimizer_updates') != 0 or type(request.get('warmup_passes')) is not int
            or request.get('warmup_passes') != 1 or type(request.get('timed_passes')) is not int
            or request.get('timed_passes') != 3):
        raise ValueError('Changed fixed TRAIN probe request')


def validate_gradient_proof(proof):
    if not isinstance(proof,dict) or proof.get('schema_version') != 1 or not proof.get('inventory'):
        raise ValueError('Missing gradient proof inventory')
    for key in ('no_optimizer_updates','learned_weights_unchanged','batch_normalization_unchanged','random_generator_state_unchanged'):
        if proof.get(key) is not True:raise ValueError('Invalid gradient proof: '+key)
    if (proof.get('training') is not False
            or proof.get('loss_reduction') != 'sum_weighted_sparse_ce_divided_by_batch4'):
        raise ValueError('Changed probe gradient call mode/loss')
    if proof.get('before') != proof.get('after') or not proof.get('before',{}).get('learned_weights'):
        raise ValueError('Probe changed learned weights/BN/random state')
    weights=proof.get('sample_weights',[])
    if len(weights) != 4 or any(type(w) not in (int,float) or not math.isfinite(w) or w <= 0 for w in weights):
        raise ValueError('Invalid probe sample weights')
    timing=proof.get('timings_seconds',{})
    durations=[timing.get('warmup'),*timing.get('timed_passes',[])]
    if len(durations) != 4 or any(type(v) not in (int,float) or not math.isfinite(v) or v < 0 for v in durations):
        raise ValueError('Invalid probe timing/pass count')
    inventory=proof['inventory'];variables=inventory.get('trainable_variables',[])
    validate_inventory(inventory)
    validate_fingerprint(proof['before'],inventory)
    names=[r.get('name') for r in variables]
    if (not names or len(set(names)) != len(names) or any(not isinstance(n,str) or not n for n in names)
            or inventory.get('trainable_variable_count') != len(names)
            or inventory.get('trainable_parameter_count') != sum(r.get('parameters',0) for r in variables)):
        raise ValueError('Invalid probe variable inventory')
    gradients=proof.get('gradients',[])
    if len(gradients) != 4:raise ValueError('Missing gradient warmup/timed passes')
    for gradient in gradients:
        loss=gradient.get('loss');actual=gradient.get('variables',[])
        if (type(loss) not in (int,float) or not math.isfinite(loss) or loss < 0
                or gradient.get('all_finite_and_present') is not True or gradient.get('any_nonzero') is not True
                or [r.get('name') for r in actual] != names):raise ValueError('Missing/nonfinite permitted gradient')
        for value in actual:
            norm=value.get('l2_norm')
            if (value.get('finite') is not True or type(value.get('nonzero')) is not bool
                    or type(norm) not in (int,float) or not math.isfinite(norm) or norm < 0
                    or value['nonzero'] != (norm > 0)):
                raise ValueError('Invalid gradient norm')
        if not any(r['nonzero'] for r in actual):raise ValueError('All permitted gradients are zero')


def protocol_template(selection_path,manifest_path,probe_receipt):
    binding=_binding(selection_path,manifest_path)
    receipt_path=metadata_path(probe_receipt);receipt=read_sealed(receipt_path)
    for name in ('request','report','resource'):check_record(receipt[name],json_only=True)
    if receipt.get('binding_sha256') != base.digest(binding):raise ValueError('Probe binding differs from current sources')
    if receipt_path != Path(receipt['request']['path']).parent/'probe-receipt.json':raise ValueError('Probe receipt path mismatch')
    report=verify_probe(receipt['request']['path'],receipt['report']['path'],receipt['resource']['path'])
    original=read_sealed(binding['baseline']['development']['path'])
    return {**recipe(),**binding,'internal_test_admission':copy.deepcopy(original['binding']['settings']['internal_test_admission']),
        'probe':{**receipt,'receipt':record(receipt_path),'inventory':report['inventory']}}


def load_protocol(path):
    path=metadata_path(path,MiB);data=read_json(path,MiB)
    if not isinstance(data,dict):raise ValueError('Protocol JSON object required')
    for name,value in recipe().items():
        if type(data.get(name)) is not type(value) or data.get(name) != value:
            raise ValueError('Protocol amendment required: '+name)
    if data.get('packages') != base.environment()['packages']:raise ValueError('Changed pinned package environment')
    baseline=data.get('baseline',{})
    expected=protocol_template(baseline['selection']['path'],baseline['manifest']['path'],data['probe']['receipt']['path'])
    if data != expected:raise ValueError('Changed source/probe/lineage/test-policy protocol binding')
    return data


def _worker_setup(out):
    base.worker_environment(out)
    os.environ['KERAS_HOME']=str(Path(out)/'keras-cache')
    import tensorflow as tf
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    tf.keras.utils.set_random_seed(42)
    tf.keras.mixed_precision.set_global_policy('float32')
    return tf


def _probe(out):
    runtime.require_supervised_worker()
    out=runtime._validate_output_path(out)
    if any((out/name).exists() for name in ('probe-report.json','probe.result.json','probe-receipt.json')):
        raise ValueError('Probe already attempted; fresh output required')
    request=read_sealed(out/'probe-request.json');verify_binding(request['binding'])
    data=old.load_frozen(request['binding']['baseline']['manifest']['path'])
    train=[r for r in data['rows'] if r['split'] == 'train']
    validate_probe_request(request,probe_samples(train))
    _worker_setup(out)
    import numpy as np
    import parcel_finetune as model_tail
    from parcel_inputs import prepare_image
    by_id={r['sample_id']:r for r in train}
    images=[];labels=[];weights=[]
    for sample in request['samples']:
        row=by_id[sample['sample_id']]
        images.append(prepare_image(old.read_image(row,allowed=('train',)),'clahe'))
        labels.append(old.CLASS_ORDER.index(row['label']));weights.append(sample['component_weight'])
    model=model_tail.load_candidate(request['binding']['baseline']['mobile']['artifact'])
    inventory=model_tail.configure_tail(model)
    proof=model_tail.gradient_probe(model,np.asarray(images,np.float32),np.asarray(labels,np.int32),np.asarray(weights,np.float64))
    validate_gradient_proof(proof);require_inventory(inventory,proof['inventory'])
    verify_binding(request['binding'])
    base.write_sealed(out/'probe-report.json',{'status':'success','request_sha256':runtime.sha256_file(out/'probe-request.json'),
        'binding_sha256':base.digest(request['binding']),'sample_ids':[r['sample_id'] for r in request['samples']],
        'optimizer_updates':0,'inventory':inventory,'gradient_proof':proof,
        'evaluation_scope':'development_only','operationally_approved':False})


def develop(selection_path,manifest_path,protocol_path,output):
    binding=_binding(selection_path,manifest_path);settings=load_protocol(protocol_path)
    if any(settings[name] != binding[name] for name in binding):raise ValueError('Protocol has different starting lineage')
    out=runtime.create_run_directory(output);supervisor=runtime.ResourceSupervisor(out,phase_limits())
    try:supervisor.preflight()
    except Exception as error:
        runtime.write_json_exclusive(out/'preflight-failed.json',{'reason':str(error)});raise
    binding={**binding,'protocol':record(protocol_path),'settings':settings}
    key=candidate_identity(binding['baseline']['development_key'])
    claim=claim_candidate(binding['baseline']['development_key'],{'output':str(out),'binding_sha256':base.digest(binding),
        'recipe_version':RECIPE,'fit_ids':[FIT_ID]})
    try:
        base.write_sealed(out/'development.json',{'key':key,'binding':binding,'claim':str(claim),'output':str(out)})
        result=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_phase','--output',str(out)],
            fit_id='development',cwd=ROOT,enforce_fit_timeout=False)
        if result['status'] != 'success':raise ValueError('Candidate failed; no replacement: '+str(result['reason']))
        run=read_sealed(out/'development.json');selection=verify_selection(out,run)
        verify_resource(out/'development.result.json',phase_limits(),fit=False)
        base.write_sealed(out/'phase-receipt.json',{'development_key':key,'binding_sha256':base.digest(binding),
            'resource_result_sha256':runtime.sha256_file(out/'development.result.json'),
            'selection_sha256':runtime.sha256_file(out/'selection.json')})
        base.finish_claim(claim,'completed',{'selection_sha256':runtime.sha256_file(out/'selection.json'),
            'phase_receipt_sha256':runtime.sha256_file(out/'phase-receipt.json')})
    except Exception as error:
        base.finish_claim(claim,'failed',{'reason':str(error)});raise
    return out/'selection.json'


def verify_run(run):
    binding=run['binding']
    verify_binding({k:binding[k] for k in ('baseline','sources','environment')})
    if check_record(binding['protocol'],json_only=True) and load_protocol(binding['protocol']['path']) != binding['settings']:
        raise ValueError('Changed prospective protocol')
    key=candidate_identity(binding['baseline']['development_key'])
    claim=ROOT/'research/datasets/kaputt-crop-finetune-registry'/('develop-'+key)
    if run['key'] != key or Path(run['claim']).resolve() != claim:raise ValueError('Changed one-use candidate identity')
    expected={'key':key,'phase':'develop','output':run['output'],'binding_sha256':base.digest(binding),
        'recipe_version':RECIPE,'fit_ids':[FIT_ID]}
    if read_json(claim/'started.json') != expected or (claim/'failed.json').exists():
        raise ValueError('Candidate claim failed or changed')


def verify_candidate_fit(out,run):
    target=Path(out)/FIT_ID;fit=read_sealed(target/'fit.json')
    if (fit.get('status') != 'success' or fit.get('fit_id') != FIT_ID or fit.get('architecture') != 'mobilenetv2'
            or fit.get('contrast') != 'clahe' or fit.get('development_key') != run['key']
            or fit.get('binding_sha256') != base.digest(run['binding'])
            or fit.get('evaluation_scope') != 'development_only'):raise ValueError('Incomplete candidate fit')
    _closed(fit)
    if Path(fit.get('artifact','')).absolute() != target/'classifier.keras':raise ValueError('Changed candidate artifact path')
    for name,key in (('classifier.keras','artifact_sha256'),('history.json','history_sha256'),
                     ('validation-predictions.json','validation_predictions_sha256'),('weight-proof.json','weight_proof_sha256')):
        if record(target/name)['sha256'] != fit.get(key):raise ValueError('Changed candidate artifact')
    data=old.load_frozen(run['binding']['baseline']['manifest']['path'])
    rows={split:[r for r in data['rows'] if r['split'] == split] for split in ('train','validation')}
    if fit.get('partition_counts') != {split:old.partition_summary(value) for split,value in rows.items()}:
        raise ValueError('Changed candidate cohort')
    verify_predictions(target,fit,rows['validation'])
    history=read_json(target/'history.json')
    if not 1 <= len(history['val_loss']) <= 5 or any(len(values) != len(history['val_loss']) for values in history.values()):
        raise ValueError('Changed candidate epoch bounds')
    proof=read_sealed(target/'weight-proof.json')
    require_inventory(proof['inventory'],run['binding']['settings']['probe']['inventory'])
    for name in ('before','after','frozen_before','frozen_after'):
        validate_fingerprint(proof[name],proof['inventory'],frozen_only=name.startswith('frozen_'))
    validate_weight_change(proof['before'],proof['after'],proof['frozen_before'],proof['frozen_after'],proof['inventory'])
    if proof.get('binding_sha256') != base.digest(run['binding']):raise ValueError('Changed learned weight proof binding')
    verify_resource(Path(out)/(FIT_ID+'.result.json'),phase_limits())
    return fit


def _worker_receipt(out,run):
    return {'development_key':run['key'],'binding_sha256':base.digest(run['binding']),'fit_id':FIT_ID,
        'fit_receipt_sha256':runtime.sha256_file(Path(out)/FIT_ID/'fit.json'),
        'resource_result_sha256':runtime.sha256_file(Path(out)/(FIT_ID+'.result.json'))}


def _selection(run,fit):
    baseline=run['binding']['baseline']
    chosen=choose_candidate(baseline['mobile'],fit)
    return {'status':'complete','development_key':run['key'],'binding':run['binding'],
        'selected':[chosen,baseline['comparator']], 'candidate':fit,'baseline':baseline['mobile'],
        'candidate_selected':chosen == fit,'class_order':list(old.CLASS_ORDER),
        'decision':'argmax-exact-tie-abstains','confidence':'uncalibrated','input_scope':'crop_only',
        'evaluation_scope':'development_only','operationally_approved':False,'test_metrics':'Not run',
        'interpretation':'Internal development tuning; no independent IILAS accuracy or operational acceptance'}


def verify_selection(out,run):
    verify_run(run)
    if Path(run['output']).resolve() != Path(out).resolve():raise ValueError('Changed candidate output')
    fit=verify_candidate_fit(out,run)
    if read_sealed(Path(out)/FIT_ID/'worker-receipt.json') != _worker_receipt(out,run):raise ValueError('Changed candidate worker link')
    selection=read_sealed(Path(out)/'selection.json')
    if selection != _selection(run,fit):raise ValueError('Changed candidate selection or fixed comparator')
    return selection


def _phase(out):
    runtime.require_supervised_worker()
    out=runtime._validate_output_path(out);run=read_sealed(out/'development.json');verify_run(run)
    base.worker_environment(out)
    supervisor=runtime.ResourceSupervisor(out,phase_limits())
    result=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_fit','--output',str(out)],fit_id=FIT_ID,cwd=ROOT)
    if result['status'] != 'success':raise ValueError('Candidate fit failed; no replacement')
    fit=verify_candidate_fit(out,run);verify_run(run)
    base.write_sealed(out/FIT_ID/'worker-receipt.json',_worker_receipt(out,run))
    base.write_sealed(out/'selection.json',_selection(run,fit))


def _fit(out):
    runtime.require_supervised_worker()
    out=runtime._validate_output_path(out);run=read_sealed(out/'development.json');verify_run(run)
    target=out/FIT_ID;target.mkdir(exist_ok=False)
    tf=_worker_setup(target)
    import numpy as np
    import parcel_finetune as model_tail
    from parcel_inputs import prepare_image
    model=model_tail.load_candidate(run['binding']['baseline']['mobile']['artifact'])
    inventory=model_tail.configure_tail(model)
    require_inventory(inventory,run['binding']['settings']['probe']['inventory'])
    before=model_tail.weight_fingerprints(model);frozen_before=model_tail.weight_fingerprints(model,frozen_only=True)
    data=old.load_frozen(run['binding']['baseline']['manifest']['path'])
    rows={split:[r for r in data['rows'] if r['split'] == split] for split in ('train','validation')}

    def dataset(split):
        rng=np.random.default_rng(42)
        def stream():yield from old.image_stream(rows[split],'clahe',training=split == 'train',rng=rng)
        ds=tf.data.Dataset.from_generator(stream,output_signature=(tf.TensorSpec((224,224,3),tf.float32),
            tf.TensorSpec((),tf.int32),tf.TensorSpec((),tf.float32)))
        options=tf.data.Options();options.threading.private_threadpool_size=1
        options.threading.max_intra_op_parallelism=1;options.experimental_deterministic=True
        return ds.batch(4).with_options(options).prefetch(1)

    model.compile(optimizer=tf.keras.optimizers.Adam(1e-5),loss='sparse_categorical_crossentropy')
    history=model.fit(dataset('train'),validation_data=dataset('validation'),epochs=5,
        callbacks=[tf.keras.callbacks.EarlyStopping(monitor='val_loss',patience=2,restore_best_weights=True)],verbose=2)
    require_inventory(model_tail.configure_tail(model),inventory)
    after=model_tail.weight_fingerprints(model);frozen_after=model_tail.weight_fingerprints(model,frozen_only=True)
    validate_weight_change(before,after,frozen_before,frozen_after,inventory)
    probabilities=[]
    for row in rows['validation']:
        image=prepare_image(old.read_image(row,allowed=('validation',)),'clahe')
        probabilities.append(model(np.expand_dims(image,0),training=False).numpy()[0].tolist())
    metrics=old.validation_metrics(rows['validation'],probabilities)
    raw=[{**{key:row[key] for key in ('sample_id','capture_id','label','item_identifier','dependency_group_id')},
        'component_weight':weight,'probabilities':p,'prediction':'Uncertain' if prediction < 0 else old.CLASS_ORDER[prediction]}
        for row,weight,p,prediction in zip(rows['validation'],old.component_weights(rows['validation']),probabilities,metrics['predictions'])]
    verify_run(run)
    runtime.write_json_exclusive(target/'validation-predictions.json',raw)
    runtime.write_json_exclusive(target/'history.json',history.history)
    base.write_sealed(target/'weight-proof.json',{'inventory':inventory,'before':before,'after':after,
        'frozen_before':frozen_before,'frozen_after':frozen_after,'binding_sha256':base.digest(run['binding'])})
    artifact=target/'classifier.keras';model.save(artifact)
    base.write_sealed(target/'fit.json',{'status':'success','fit_id':FIT_ID,'architecture':'mobilenetv2','contrast':'clahe',
        'development_key':run['key'],'binding_sha256':base.digest(run['binding']),
        'component_macro_f1':metrics['component_weighted']['macro_f1'],'component_nll':metrics['component_weighted']['nll'],
        'validation_metrics':metrics,'partition_counts':{split:old.partition_summary(value) for split,value in rows.items()},
        'artifact':str(artifact),'artifact_sha256':runtime.sha256_file(artifact),
        'history_sha256':runtime.sha256_file(target/'history.json'),
        'validation_predictions_sha256':runtime.sha256_file(target/'validation-predictions.json'),
        'weight_proof_sha256':runtime.sha256_file(target/'weight-proof.json'),
        'recipe_version':RECIPE,'seed':42,'evaluation_scope':'development_only','operationally_approved':False})


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('probe','develop','_probe','_phase','_fit'))
    for name in ('selection','manifest','protocol','output'):parser.add_argument('--'+name,type=Path,required=name == 'output')
    args=parser.parse_args()
    if args.command in ('probe','develop'):
        if args.selection is None or args.manifest is None:parser.error('--selection and --manifest required')
        if args.command == 'probe':print(probe(args.selection,args.manifest,args.output))
        else:
            if args.protocol is None:parser.error('--protocol required')
            print(develop(args.selection,args.manifest,args.protocol,args.output))
    else:{'_probe':_probe,'_phase':_phase,'_fit':_fit}[args.command](args.output)


if __name__ == '__main__':main()
