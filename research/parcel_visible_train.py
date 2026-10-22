"""Once-only visible-parcel development controller; no TEST or serving path.

Public commands prepare metadata, probe TRAIN cost without updates, then develop.
Only Job-contained leaf workers import TensorFlow. All output is local/ignored;
hash seals detect accidental drift, not an owner deliberately editing receipts.
"""
import argparse
from contextlib import contextmanager
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time

import parcel_train as base
import kaputt_crop_train as crop
import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
MiB = 1024**2
PROFILE = 'parcel_visible_development'
CLASS_ORDER = ('Normal','Damaged')
FIT_IDS = ('mobilenetv2-clahe','efficientnetb0-none')
ARCHITECTURES = ('mobilenetv2','efficientnetb0')
REGISTRY = ROOT/'research/datasets/parcel-visible-run-registry'
CODE_FILES = ('parcel_visible_train.py','parcel_visible_manifest.py','parcel_visible_review.py','parcel_train.py',
              'kaputt_crop_train.py','parcel_inputs.py','parcel_models.py','runner_runtime.py')
WEIGHT_METADATA = crop.WEIGHT_METADATA
PROOF_HASHES = crop.PROOF_HASHES
component_weights = crop.component_weights
validation_metrics = crop.validation_metrics
partition_summary = crop.partition_summary


def phase_limits(probe=False):
    return runtime.Limits(max_wall_seconds=180 if probe else 6300,
                          max_fit_seconds=180 if probe else 3000,
                          max_rss_bytes=2048*MiB,min_available_bytes=3072*MiB,
                          available_floor_bytes=768*MiB,min_free_disk_bytes=20480*MiB,
                          max_output_bytes=(128 if probe else 512)*MiB,threads=1)


def settings_template():
    return dict(schema_version=1,benchmark_profile=PROFILE,evaluation_scope='development_only',
                operationally_approved=False,input_scope='full_exported_frame',seed=42,batch_size=4,
                epochs=10,patience=3,learning_rate=.001,dropout=.2,fit_ids=list(FIT_IDS),
                class_order=list(CLASS_ORDER),preprocessing='rgb-letterbox224-v1',
                weighting='equal_dependency_component_mean1',
                selection='component_macro_f1_desc-nll_asc-retain_mobilenet_on_exact_tie',
                probe='fixed_train_batch_no_update_twice_cost_v1',
                limits=dict(develop=vars(phase_limits()),probe=vars(phase_limits(True))),
                packages=dict(crop.PINNED_PACKAGES),weights={},weight_proofs=[])


def load_protocol(path):
    path=runtime._validate_output_path(crop._research_file_path(path))
    if path.suffix!='.json' or not 0<path.stat().st_size<=MiB:
        raise ValueError('Bounded local JSON protocol required')
    data=json.loads(path.read_text(encoding='utf-8'))
    expected=settings_template()
    if set(data)!=set(expected): raise ValueError('Protocol amendment required: fields')
    for key,value in expected.items():
        if key in ('weights','weight_proofs'): continue
        if type(data.get(key)) is not type(value) or data[key]!=value:
            raise ValueError('Protocol amendment required: '+key)
    if data['packages']!=base.environment()['packages']:
        raise ValueError('Installed dependencies differ from pinned protocol')
    if set(data['weights'])!=set(ARCHITECTURES):
        raise ValueError('Both official pretrained weight records required')
    for name,record in data['weights'].items():
        if base.digest({k:v for k,v in record.items() if k!='path'})!=WEIGHT_METADATA[name]:
            raise ValueError('Changed pretrained weight provenance: '+name)
        local=Path(record.get('path',''))
        if not local.is_absolute(): local=path.parent/local
        local=runtime._validate_output_path(crop._research_file_path(local))
        if not local.is_file() or runtime.sha256_file(local)!=record['sha256']:
            raise ValueError('Missing or changed pretrained weight: '+name)
        record['path']=str(local)
    proofs=data['weight_proofs']
    if len(proofs)!=4 or {r.get('sha256') for r in proofs}!=PROOF_HASHES:
        raise ValueError('Exact licence/acquisition/compatibility evidence required')
    for record in proofs:
        if set(record)!={'path','sha256'}: raise ValueError('Invalid pretrained evidence record')
        local=Path(record['path'])
        if not local.is_absolute():local=path.parent/local
        local=runtime._validate_output_path(crop._research_file_path(local))
        if not local.is_file() or runtime.sha256_file(local)!=record['sha256']:
            raise ValueError('Changed local pretrained evidence')
        record['path']=str(local)
    return data


def validate_manifest(data):
    if data.get('admission_kind')!='visible_review_overlay_v1':
        raise ValueError('Source-bound visible review overlay required')
    if (data.get('schema_version')!=1 or data.get('benchmark_profile')!=PROFILE
            or data.get('class_order')!=list(CLASS_ORDER) or data.get('training_admission') is not True):
        raise ValueError('Admitted visible development manifest required')
    rows=data.get('rows',[])
    if not rows or {r.get('split') for r in rows}!={'train','validation'}:
        raise ValueError('Only TRAIN/VALID partitions admitted')
    if len({r.get('sample_id') for r in rows})!=len(rows): raise ValueError('Duplicate manifest membership')
    groups=[]
    for split,cap in (('train',1600),('validation',400)):
        selected=[r for r in rows if r['split']==split]
        component_weights(selected)
        if len(selected)>cap or {r['label'] for r in selected}!=set(CLASS_ORDER):
            raise ValueError('Partition ceiling or class support violation')
        groups.append({r['dependency_group_id'] for r in selected})
    if groups[0]&groups[1]: raise ValueError('Dependency component crosses partitions')
    return data


def load_frozen(path):
    from parcel_visible_review import load_manifest
    return validate_manifest(load_manifest(runtime._validate_output_path(path)))


def code_bindings():
    return {name:runtime.sha256_file(Path(__file__).parent/name) for name in CODE_FILES}


def experiment_identity(data,binding):
    settings=copy.deepcopy(binding['settings'])
    for record in settings['weights'].values(): record.pop('path',None)
    for record in settings['weight_proofs']:record.pop('path',None)
    settings['weight_proofs'].sort(key=lambda r:r['sha256'])
    rows=[{k:v for k,v in r.items() if k not in ('path','_image_path')} for r in data['rows']]
    return base.digest(dict(profile=PROFILE,rows=sorted(rows,key=lambda r:r['sample_id']),
                            settings=settings,code=binding['code'],environment=binding['environment']))


def prepare(manifest,protocol,output):
    """Freeze current metadata and file hashes; do not decode or build a model."""
    data=load_frozen(manifest);settings=load_protocol(protocol)
    binding=dict(manifest=dict(path=str(Path(manifest).resolve()),sha256=runtime.sha256_file(manifest)),
                 protocol=dict(path=str(Path(protocol).resolve()),sha256=runtime.sha256_file(protocol)),
                 settings=settings,code=code_bindings(),environment=base.environment())
    out=runtime.create_run_directory(output)
    base.write_sealed(out/'prepared.json',dict(key=experiment_identity(data,binding),binding=binding,
                      profile=PROFILE,operationally_approved=False))
    return out/'prepared.json'


def read_prepared(path):
    path=runtime._validate_output_path(path)
    prepared=base.read_sealed(path)
    data=verify_binding(prepared['binding'])
    if prepared.get('key')!=experiment_identity(data,prepared['binding']):
        raise ValueError('Changed experiment identity')
    return prepared


def verify_binding(binding):
    for name in ('manifest','protocol'):
        record=binding[name]
        path=runtime._validate_output_path(record['path'])
        if runtime.sha256_file(path)!=record['sha256']:raise ValueError('Changed '+name)
    if binding['code']!=code_bindings() or binding['environment']!=base.environment():
        raise ValueError('Changed code or dependency environment')
    if binding['settings']!=load_protocol(binding['protocol']['path']):
        raise ValueError('Changed protocol/weight evidence')
    return load_frozen(binding['manifest']['path'])


def claim_phase(key,phase,detail,registry=None):
    if phase not in ('probe','develop') or len(key)!=64 or any(c not in '0123456789abcdef' for c in key):
        raise ValueError('Invalid visible experiment phase/key')
    registry=runtime._validate_output_path(registry or REGISTRY)
    registry.mkdir(parents=True,exist_ok=True)
    claim=registry/(phase+'-'+key)
    try:claim.mkdir()
    except FileExistsError as error:raise ValueError('Experiment already claimed; automatic retry forbidden') from error
    runtime.write_json_exclusive(claim/'started.json',dict(key=key,phase=phase,**detail))
    return claim


@contextmanager
def exclusive_job(path=None):
    """One visible research controller; stale locks require manual investigation."""
    lock=runtime._validate_output_path(path or REGISTRY/'active-job')
    lock.parent.mkdir(parents=True,exist_ok=True)
    try:lock.mkdir()
    except FileExistsError as error:raise ValueError('A research job is active or requires reconciliation') from error
    try:yield
    finally:lock.rmdir()


def validate_fit_set(results):
    if ([r.get('fit_id') for r in results]!=list(FIT_IDS)
            or any(r.get('status')!='success' or r.get('fit_id')!=r.get('architecture','')+'-'+r.get('contrast','') for r in results)):
        raise ValueError('Exactly two ordered successful fits required; partial selection forbidden')
    for row in results:
        if any(not isinstance(row.get(k),(int,float)) or not math.isfinite(row[k]) or row[k]<0
               for k in ('component_macro_f1','component_nll')):
            raise ValueError('Invalid comparison metric')


def compare_fits(results):
    validate_fit_set(results)
    return min(results,key=lambda r:(-r['component_macro_f1'],r['component_nll'],FIT_IDS.index(r['fit_id'])))


def read_image(row,*,allowed):
    if row.get('split') not in ('train','validation') or row['split'] not in allowed:
        raise ValueError('Forbidden image partition')
    path=crop._research_file_path(ROOT/row['path'])
    if not 0<path.stat().st_size<=16*MiB:raise ValueError('Image byte bound exceeded')
    if min(row['width'],row['height'])<64 or row['width']*row['height']>16_000_000:
        raise ValueError('Image dimension bound exceeded')
    payload=path.read_bytes()
    if hashlib.sha256(payload).hexdigest()!=row['sha256']:raise ValueError('Image hash mismatch')
    from parcel_inputs import decode_rgb
    rgb=decode_rgb(payload)
    if (rgb.shape[:2]!=(row['height'],row['width'])
            or hashlib.sha256(rgb.tobytes()).hexdigest()!=row['pixel_sha256']):
        raise ValueError('Decoded RGB pixel hash or dimensions changed')
    return rgb


def image_stream(rows,contrast,*,training,rng=None):
    import numpy as np
    from parcel_inputs import prepare_image,augment_image
    weights=component_weights(rows)
    split='train' if training else 'validation'
    if rows[0]['split']!=split:raise ValueError('Training flag differs from partition')
    rng=rng if rng is not None else np.random.default_rng(42)
    indices=rng.permutation(len(rows)) if training else range(len(rows))
    for index in indices:
        index=int(index);row=rows[index]
        image=prepare_image(read_image(row,allowed=(split,)),contrast)
        if training:image=augment_image(image,rng,training=True)
        yield image,np.int32(CLASS_ORDER.index(row['label'])),np.float32(weights[index])


def batch_stream(rows,contrast,*,training,rng=None,batch_size=4):
    import numpy as np
    images=[];labels=[];weights=[]
    for image,label,weight in image_stream(rows,contrast,training=training,rng=rng):
        images.append(image);labels.append(label);weights.append(weight)
        if len(images)==batch_size:
            yield np.stack(images),np.asarray(labels,np.int32),np.asarray(weights,np.float32)
            images=[];labels=[];weights=[]
    if images:yield np.stack(images),np.asarray(labels,np.int32),np.asarray(weights,np.float32)


def dataset(rows,contrast,training,tf):
    import numpy as np
    rng=np.random.default_rng(42)
    ds=tf.data.Dataset.from_generator(lambda:batch_stream(rows,contrast,training=training,rng=rng),
            output_signature=(tf.TensorSpec((None,224,224,3),tf.float32),
                              tf.TensorSpec((None,),tf.int32),tf.TensorSpec((None,),tf.float32)))
    options=tf.data.Options();options.threading.private_threadpool_size=1
    options.threading.max_intra_op_parallelism=1;options.experimental_deterministic=True
    return ds.with_options(options).prefetch(1)


def fit_head(model,train_data,validation_data,tf):
    return model.fit(train_data,validation_data=validation_data,epochs=10,verbose=2,
                     callbacks=[tf.keras.callbacks.EarlyStopping(monitor='val_loss',patience=3,
                                                                 restore_best_weights=True)])


def restored_validation(history,raw_nll):
    """Mean-one component NLL must reproduce Keras' best weighted val_loss.

    Float32 batched reductions and scalar JSON recomputation can differ slightly;
    the fixed absolute/relative 1e-4 tolerance cannot excuse a worse checkpoint.
    """
    losses=history.get('loss',[]);values=history.get('val_loss',[])
    if (not 1<=len(values)<=10 or len(losses)!=len(values)
            or any(not isinstance(v,(int,float)) or not math.isfinite(v) or v<0 for v in [*losses,*values])
            or not math.isfinite(raw_nll)):
        raise ValueError('Invalid restored validation history')
    minimum=min(values)
    if not math.isclose(raw_nll,minimum,abs_tol=1e-4,rel_tol=1e-4):
        raise ValueError('Raw VALID loss does not match restored best checkpoint')
    return dict(best_epoch=values.index(minimum)+1,min_val_loss=minimum)


def fixed_probe_rows(data):
    return sorted((r for r in data['rows'] if r['split']=='train'),key=lambda r:r['sample_id'])[:4]


def project_probe(record,data):
    selected=fixed_probe_rows(data)
    if (record.get('fit_id') not in FIT_IDS or record.get('state_unchanged') is not True
            or record.get('batch_size')!=len(selected)
            or record.get('train_sample_ids')!=[r['sample_id'] for r in selected]):
        raise ValueError('Probe state or fixed TRAIN membership changed')
    for key in ('setup_seconds','decode_seconds','forward_seconds','gradient_seconds','save_load_seconds'):
        if not isinstance(record.get(key),(float,int)) or not math.isfinite(record[key]) or record[key]<=0:
            raise ValueError('Invalid probe timing')
    batch=len(selected)
    train_batches=math.ceil(sum(r['split']=='train' for r in data['rows'])/batch)
    validation_batches=math.ceil(sum(r['split']=='validation' for r in data['rows'])/batch)
    # gradient_seconds measures a complete forward/loss/backward batch already.
    # Double that complete TRAIN cost and separate forward-only VALID cost;
    # allow a checkpoint each epoch plus final save/reload and cold setup.
    seconds=(record['setup_seconds']+2*(10*(train_batches*(record['decode_seconds']+record['gradient_seconds'])
             +validation_batches*(record['decode_seconds']+record['forward_seconds'])+record['save_load_seconds'])+record['save_load_seconds']))
    if seconds>3000:raise ValueError('Conservative fit projection exceeds unchanged cap')
    return dict(fit_id=record['fit_id'],fit_seconds=seconds,train_batches=train_batches,
                validation_batches=validation_batches,maximum_epochs=10,safety_factor=2)


def finalize_probe_model(target,record,data,prepared):
    """Preserve measurements even when projection rejects this once-only attempt."""
    base.write_sealed(Path(target)/'probe-model-attempt.json',dict(record,key=prepared['key'],
                      binding_sha256=base.digest(prepared['binding'])))
    if record.get('state_unchanged') is not True:
        raise ValueError('No-update probe modified learned/BN state')
    project_probe(record,data)
    verify_binding(prepared['binding'])
    base.write_sealed(Path(target)/'probe-model.json',record)


def verify_probe(path,prepared,*,data=None):
    path=runtime._validate_output_path(path);receipt=base.read_sealed(path)
    if (receipt.get('key')!=prepared['key'] or receipt.get('binding_sha256')!=base.digest(prepared['binding'])
            or receipt.get('status')!='success' or [r.get('fit_id') for r in receipt.get('models',[])]!=list(FIT_IDS)):
        raise ValueError('Successful source-bound two-model probe required')
    data=verify_binding(prepared['binding']) if data is None else data
    projections=[project_probe(r,data) for r in receipt['models']]
    if receipt.get('projections')!=projections or sum(r['fit_seconds'] for r in projections)+300>6300:
        raise ValueError('Phase projection exceeds unchanged cap')
    for record in receipt['native_records']:
        local=runtime._validate_output_path(path.parent/record['name'])
        if runtime.sha256_file(local)!=record['sha256']:raise ValueError('Changed native probe record')
        result=json.loads(local.read_text(encoding='utf-8'))
        if (result.get('status')!='success' or result.get('returncode')!=0
                or any(not isinstance(result.get(k),(int,float)) or not math.isfinite(result[k]) or result[k]<0
                       for k in ('elapsed_seconds','peak_rss_bytes'))
                or result.get('elapsed_seconds',float('inf'))>180
                or result.get('peak_rss_bytes',float('inf'))>2048*MiB):
            raise ValueError('Probe native resource proof failed')
    if {r['name'] for r in receipt['native_records']}!={'probe.result.json',*(f'{f}.result.json' for f in FIT_IDS)}:
        raise ValueError('Incomplete native probe records')
    return receipt


def _public_phase(prepared_path,output,phase,probe_path=None):
    prepared=read_prepared(prepared_path)
    if phase=='develop':verify_probe(probe_path,prepared)
    with exclusive_job():
        out=runtime.create_run_directory(output)
        claim=claim_phase(prepared['key'],phase,dict(output=str(out),fit_ids=list(FIT_IDS),profile=PROFILE))
        try:
            base.write_sealed(out/'request.json',dict(prepared=prepared,
                probe=None if probe_path is None else dict(path=str(Path(probe_path).resolve()),sha256=runtime.sha256_file(probe_path))))
            supervisor=runtime.ResourceSupervisor(out,phase_limits(phase=='probe'))
            command='_probe_phase' if phase=='probe' else '_phase'
            record=supervisor.run([sys.executable,str(Path(__file__).resolve()),command,'--output',str(out)],
                                  fit_id=phase,cwd=ROOT,enforce_fit_timeout=False)
            if record['status']!='success':raise ValueError('Phase failed; no replacement: '+str(record['reason']))
            if phase=='probe':
                body=base.read_sealed(out/'probe-body.json')
                body['native_records']=[dict(name=name,sha256=runtime.sha256_file(out/name))
                    for name in ['probe.result.json',*(f'{f}.result.json' for f in FIT_IDS)]]
                base.write_sealed(out/'probe.json',body)
                result=out/'probe.json';verify_probe(result,prepared)
            else:
                result=out/'selection.json';selection=base.read_sealed(result)
                if selection.get('key')!=prepared['key'] or selection.get('binding')!=prepared['binding']:
                    raise ValueError('Selection provenance changed')
                validate_fit_set(selection['all_fits'])
                for row in selection['all_fits']:verify_fit_result(out,prepared,row)
                verify_binding(prepared['binding'])
            base.finish_claim(claim,'completed',dict(result_sha256=runtime.sha256_file(result)))
            return result
        except Exception as error:
            base.finish_claim(claim,'failed',dict(reason=str(error)))
            raise


def probe(prepared,output):return _public_phase(prepared,output,'probe')


def develop(prepared,probe_receipt,output):return _public_phase(prepared,output,'develop',probe_receipt)


def _request(out):
    request=base.read_sealed(Path(out)/'request.json')
    prepared=request['prepared'];data=verify_binding(prepared['binding'])
    if prepared.get('key')!=experiment_identity(data,prepared['binding']):
        raise ValueError('Changed experiment identity')
    if request['probe'] is not None:
        if runtime.sha256_file(request['probe']['path'])!=request['probe']['sha256']:
            raise ValueError('Probe changed after admission')
        verify_probe(request['probe']['path'],prepared,data=data)
    request['_data']=data
    return request


def _probe_phase(out):
    runtime.require_supervised_worker();out=runtime._validate_output_path(out)
    base.worker_environment(out);request=_request(out);prepared=request['prepared']
    data=request['_data'];models=[]
    supervisor=runtime.ResourceSupervisor(out,phase_limits(True))
    for fit_id in FIT_IDS:
        record=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_probe_model','--output',str(out),'--fit-id',fit_id],
                              fit_id=fit_id,cwd=ROOT)
        if record['status']!='success':raise ValueError('Probe failed; no replacement: '+fit_id)
        models.append(base.read_sealed(out/fit_id/'probe-model.json'))
    projections=[project_probe(r,data) for r in models]
    if sum(r['fit_seconds'] for r in projections)+300>6300:raise ValueError('Phase projection exceeds cap')
    verify_binding(prepared['binding'])
    base.write_sealed(out/'probe-body.json',dict(status='success',key=prepared['key'],
        binding_sha256=base.digest(prepared['binding']),models=models,projections=projections,
        interpretation='TRAIN-only no-update feasibility estimate; no accuracy result'))


def _leaf_setup(out,fit_id,*,require_probe=False):
    runtime.require_supervised_worker();out=runtime._validate_output_path(out)
    if fit_id not in FIT_IDS:raise ValueError('Unknown fit')
    request=_request(out)
    if require_probe and request['probe'] is None:raise ValueError('Probe required before model access')
    target=out/fit_id;target.mkdir(exist_ok=False)
    base.worker_environment(target);os.environ['KERAS_HOME']=str(target/'keras-cache')
    import tensorflow as tf
    tf.config.set_visible_devices([],'GPU')
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    tf.keras.utils.set_random_seed(42);tf.keras.mixed_precision.set_global_policy('float32')
    return request['prepared'],target,tf,request['_data']


def _probe_model(out,fit_id):
    runtime.require_supervised_worker();began=time.monotonic()
    prepared,target,tf,data=_leaf_setup(out,fit_id)
    import numpy as np
    from parcel_models import build_classifier
    rows=fixed_probe_rows(data)
    architecture,contrast=fit_id.rsplit('-',1)
    model=build_classifier(architecture,Path(prepared['binding']['settings']['weights'][architecture]['path']))
    start=time.monotonic()
    images,labels,_=next(batch_stream(rows,contrast,training=True,rng=np.random.default_rng(42)))
    decode_seconds=time.monotonic()-start
    before=[w.numpy().copy() for w in model.weights]
    setup=time.monotonic()-began
    start=time.monotonic();forward=model(images,training=False);forward.numpy()
    forward_seconds=time.monotonic()-start
    start=time.monotonic()
    with tf.GradientTape() as tape:
        probabilities=model(images,training=False)
        loss=tf.reduce_mean(tf.keras.losses.sparse_categorical_crossentropy(labels,probabilities))
    gradients=tape.gradient(loss,model.trainable_weights)
    if not gradients or any(g is None or not bool(tf.reduce_all(tf.math.is_finite(g)).numpy()) for g in gradients):
        raise ValueError('Invalid fixed TRAIN gradients')
    gradient_seconds=time.monotonic()-start
    start=time.monotonic();model.save(target/'probe.keras')
    restored=tf.keras.models.load_model(target/'probe.keras')
    restored(images,training=False).numpy();save_load=time.monotonic()-start
    unchanged=(len(before)==len(model.weights)==len(restored.weights)
        and all(np.array_equal(a,w.numpy()) and np.array_equal(a,v.numpy())
                for a,w,v in zip(before,model.weights,restored.weights)))
    record=dict(fit_id=fit_id,setup_seconds=setup,forward_seconds=forward_seconds,
                gradient_seconds=gradient_seconds,decode_seconds=decode_seconds,save_load_seconds=save_load,state_unchanged=unchanged,
                batch_size=len(rows),train_sample_ids=[r['sample_id'] for r in rows])
    finalize_probe_model(target,record,data,prepared)


def verify_fit_result(out,prepared,result):
    if result.get('key')!=prepared['key'] or result.get('binding_sha256')!=base.digest(prepared['binding']):
        raise ValueError('Fit provenance binding mismatch')
    fit_id=result.get('fit_id')
    if fit_id not in FIT_IDS:raise ValueError('Unknown fit receipt')
    target=Path(out)/fit_id
    for name,key in (('classifier.keras','artifact_sha256'),('validation-predictions.json','validation_predictions_sha256'),('history.json','history_sha256')):
        local=runtime._validate_output_path(target/name)
        if runtime.sha256_file(local)!=result.get(key):raise ValueError('Changed fit artifact: '+name)
    data=load_frozen(prepared['binding']['manifest']['path'])
    rows=[r for r in data['rows'] if r['split']=='validation']
    raw=json.loads((target/'validation-predictions.json').read_text(encoding='utf-8'))
    if ([r['sample_id'] for r in raw]!=[r['sample_id'] for r in rows]
            or any(any(pred.get(k)!=row[k] for k in ('label','dependency_group_id','sha256','pixel_sha256')) for pred,row in zip(raw,rows))):
        raise ValueError('VALID membership changed')
    metrics=validation_metrics(rows,[r['probabilities'] for r in raw])
    if (metrics!=result['validation_metrics'] or result['component_macro_f1']!=metrics['component_weighted']['macro_f1']
            or result['component_nll']!=metrics['component_weighted']['nll']):
        raise ValueError('Raw VALID metrics do not reconstruct')
    restored=restored_validation(json.loads((target/'history.json').read_text(encoding='utf-8')),
                                 metrics['component_weighted']['nll'])
    if (any(result.get(k)!=v for k,v in restored.items())
            or result.get('raw_predictions_from')!='reloaded_classifier.keras'):
        raise ValueError('Missing restored checkpoint/serialization evidence')


def _phase(out):
    runtime.require_supervised_worker();out=runtime._validate_output_path(out)
    base.worker_environment(out);request=_request(out)
    if request['probe'] is None:raise ValueError('Probe required before fitting')
    prepared=request['prepared'];supervisor=runtime.ResourceSupervisor(out,phase_limits());results=[]
    for fit_id in FIT_IDS:
        record=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_fit','--output',str(out),'--fit-id',fit_id],fit_id=fit_id,cwd=ROOT)
        if record['status']!='success':raise ValueError('Fit failed; no replacement: '+fit_id)
        result=base.read_sealed(out/fit_id/'fit.json')
        if result.get('fit_id')!=fit_id:raise ValueError('Wrong ordered fit receipt')
        verify_fit_result(out,prepared,result);results.append(result)
        base.write_sealed(out/fit_id/'worker-receipt.json',dict(fit_id=fit_id,key=prepared['key'],
            fit_receipt_sha256=runtime.sha256_file(out/fit_id/'fit.json'),
            resource_result_sha256=runtime.sha256_file(out/(fit_id+'.result.json'))))
    validate_fit_set(results);verify_binding(prepared['binding'])
    for result in results:verify_fit_result(out,prepared,result)
    base.write_sealed(out/'selection.json',dict(status='complete',key=prepared['key'],binding=prepared['binding'],
        all_fits=results,comparison_winner=compare_fits(results)['fit_id'],primary='mobilenetv2-clahe',
        class_order=list(CLASS_ORDER),evaluation_scope='development_only',operationally_approved=False,
        test_metrics='Not run',interpretation='Publisher-source development; no physical independence or live-camera acceptance'))


def _fit(out,fit_id):
    runtime.require_supervised_worker();prepared,target,tf,data=_leaf_setup(out,fit_id,require_probe=True)
    import numpy as np
    from parcel_models import build_classifier
    from parcel_inputs import prepare_image
    rows={split:[r for r in data['rows'] if r['split']==split] for split in ('train','validation')}
    architecture,contrast=fit_id.rsplit('-',1)
    model=build_classifier(architecture,Path(prepared['binding']['settings']['weights'][architecture]['path']))
    history=fit_head(model,dataset(rows['train'],contrast,True,tf),dataset(rows['validation'],contrast,False,tf),tf)
    history_values=history.history
    model.save(target/'classifier.keras')
    del history,model
    import gc
    gc.collect()
    model=tf.keras.models.load_model(target/'classifier.keras',compile=False)
    probabilities=[model(np.expand_dims(prepare_image(read_image(r,allowed=('validation',)),contrast),0),training=False).numpy()[0].tolist() for r in rows['validation']]
    metrics=validation_metrics(rows['validation'],probabilities)
    restoration=restored_validation(history_values,metrics['component_weighted']['nll'])
    raw=[dict(sample_id=r['sample_id'],label=r['label'],dependency_group_id=r['dependency_group_id'],
              sha256=r['sha256'],pixel_sha256=r['pixel_sha256'],component_weight=w,probabilities=p)
         for r,w,p in zip(rows['validation'],component_weights(rows['validation']),probabilities)]
    runtime.write_json_exclusive(target/'validation-predictions.json',raw)
    runtime.write_json_exclusive(target/'history.json',history_values)
    verify_binding(prepared['binding'])
    base.write_sealed(target/'fit.json',dict(status='success',fit_id=fit_id,architecture=architecture,contrast=contrast,
        key=prepared['key'],binding_sha256=base.digest(prepared['binding']),validation_metrics=metrics,
        component_macro_f1=metrics['component_weighted']['macro_f1'],component_nll=metrics['component_weighted']['nll'],
        **restoration,raw_predictions_from='reloaded_classifier.keras',
        partition_counts={k:partition_summary(v) for k,v in rows.items()},
        artifact_sha256=runtime.sha256_file(target/'classifier.keras'),
        validation_predictions_sha256=runtime.sha256_file(target/'validation-predictions.json'),
        history_sha256=runtime.sha256_file(target/'history.json'),
        early_stopping='component-weighted val_loss; patience3; restore_best_weights',operationally_approved=False))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('prepare','probe','develop','_probe_phase','_probe_model','_phase','_fit'))
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--manifest',type=Path);parser.add_argument('--protocol',type=Path)
    parser.add_argument('--prepared',type=Path);parser.add_argument('--probe',type=Path)
    parser.add_argument('--fit-id')
    args=parser.parse_args()
    if args.command.startswith('_'):
        runtime.require_supervised_worker()
        if args.command=='_phase':_phase(args.output)
        elif args.command=='_probe_phase':_probe_phase(args.output)
        elif args.command=='_fit':_fit(args.output,args.fit_id)
        else:_probe_model(args.output,args.fit_id)
    elif args.command=='prepare':
        if args.manifest is None or args.protocol is None:parser.error('--manifest and --protocol required')
        print(prepare(args.manifest,args.protocol,args.output))
    elif args.command=='probe':
        if args.prepared is None:parser.error('--prepared required')
        print(probe(args.prepared,args.output))
    else:
        if args.prepared is None or args.probe is None:parser.error('--prepared and --probe required')
        print(develop(args.prepared,args.probe,args.output))


if __name__=='__main__':main()
