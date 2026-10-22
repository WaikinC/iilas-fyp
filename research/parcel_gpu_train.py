"""Prospective, once-only WSL GPU visible-parcel development experiment.

Prepare is metadata/encoded-hash only. Native systemd-contained leaves alone
import TensorFlow. This profile never reads TEST, selects a serving model, or
retries a failed claim. Prior CPU sources and receipts remain unchanged.
"""
import argparse
from collections import Counter
from contextlib import contextmanager
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import subprocess
import sys
import time

STARTUP_ACTIVATION_LIBRARIES=os.environ.get('LD_LIBRARY_PATH','')

import parcel_gpu_data as transport
import parcel_gpu_data_fast as fast_transport
import parcel_visible_train as science

ROOT=Path(__file__).resolve().parents[1]
MiB=1024**2
OUTPUT_LIMITS={'probe':128*MiB,'develop':512*MiB}
PROFILE='parcel_visible_gpu_development_v4'
HOST_MEMORY_LIMIT=4096*MiB
PROBE_KIND='compiled_train_gradient_three_steady_MAX_v1'
FIT_IDS=('mobilenetv2-clahe','efficientnetb0-none')
REGISTRY=ROOT/'research/datasets/parcel-gpu-run-registry'
GPU_CHECK=ROOT/'outputs/parcel-gpu-setup-20261021/gpu-check-03/gpu-check.json'
GPU_CHECK_SHA='081818a22dc56557f7752847e82eb044b058c7094575ce081f5c8a443785086a'
HELPER=ROOT.parent/'Enter-IILAS-GPU.sh'
CORE_PACKAGES=dict(science.crop.PINNED_PACKAGES)
CODE_FILES=tuple(sorted(set(science.CODE_FILES+('parcel_gpu_check.py','parcel_gpu_data.py','parcel_gpu_data_fast.py','parcel_gpu_runtime.py','parcel_gpu_train.py'))))
component_weights=science.component_weights
validation_metrics=science.validation_metrics
partition_summary=science.partition_summary
restored_validation=science.restored_validation
fixed_probe_rows=science.fixed_probe_rows
compare_fits=science.compare_fits
digest=transport._digest
sha256_file=transport._sha


def require(ok,message):
    if not ok:raise ValueError(message)


def write_json(path,value):transport._write(Path(path),value)


def write_sealed(path,value):write_json(path,dict(payload=value,sha256=digest(value)))


def read_sealed(path):return transport._unseal(Path(path))


def output_path(path):
    path=Path(path).absolute()
    require(path.is_relative_to(ROOT.absolute()) and path.resolve().is_relative_to(ROOT.resolve()),
            'Output escapes application repository')
    relative=transport._portable(path.relative_to(ROOT.absolute()).as_posix())
    require(relative.startswith(('research/datasets/','outputs/')),'Ignored local research output required')
    for node in (path,*path.parents):
        require(not node.is_symlink() and not (hasattr(node,'is_junction') and node.is_junction()),'Output links forbidden')
    return path


def gpu_protocol():
    return dict(schema_version=1,profile=PROFILE,evaluation_scope='development_only',
        operationally_approved=False,fit_ids=list(FIT_IDS),seed=42,batch_size=4,
        epochs=10,patience=3,learning_rate=.001,dropout=.2,dtype='float32',
        gpu_device='/GPU:0',gpu_allocator_mib=2048,soft_device_placement=False,
        jit_compile=False,probe_kind=PROBE_KIND,steady_replicates=3,steady_reduction='MAX',
        probe_component_weights='full_TRAIN_weights_mapped_to_fixed_four',
        probe_seconds=180,fit_seconds=3000,phase_seconds=6300,
        resource_profile='parcel_gpu_memory_v3',max_rss_bytes=HOST_MEMORY_LIMIT,
        memory_limit_bytes=HOST_MEMORY_LIMIT,admission_memory_bytes=6144*MiB,
        live_memory_floor_bytes=2048*MiB,max_output_bytes=dict(OUTPUT_LIMITS),
        root_cache_policy='fixed_root_linux_cache_once_v1',root_cache_attempts=1,
        root_cache_precondition='before_admission_no_registered_gpu_units',
        root_cache_timeout_seconds=10,root_cache_required_phase_seconds=10,
        dataset_cardinality='assert_exact_batched_ceil_count_v1',scoring_batch_size=4,
        scoring='compiled_validation_batch4_partial_v1',tf32_policy='unchanged_runtime_default_recorded',
        checkpoint_loss='component_stable_logits_ce_v1',legacy_report_nll='clipped_probability_floor1e-7',
        stable_ce_abs_rel_tolerance=1e-4,softmax_absolute_tolerance=1e-37,softmax_relative_tolerance=1e-4,
        optimizer_iterations='189_times_completed_epochs',
        preprocessing='rgb-letterbox224-v1',weighting='equal_dependency_component_mean1',
        primary_architecture='mobilenetv2',serving_gates='closed')


def validate_cohort(data):
    rows=data.get('rows',[])
    require(Counter((r.get('split'),r.get('label')) for r in rows)==
        Counter({('train','Normal'):385,('train','Damaged'):368,
                 ('validation','Normal'):107,('validation','Damaged'):55}),
        'Exact admitted 753 TRAIN / 162 VALID membership and labels required; no TEST')
    require(len({r['sample_id'] for r in rows})==915,'Duplicate admitted membership')
    groups=[{r['dependency_group_id'] for r in rows if r['split']==s} for s in ('train','validation')]
    require(not groups[0]&groups[1],'Dependency component crosses partitions')
    for split in ('train','validation'):component_weights([r for r in rows if r['split']==split])
    return data


def activation_libraries():
    """Preserve startup identity across only the pinned cv2 bootstrap prefix."""
    current=os.environ.get('LD_LIBRARY_PATH','')
    if current==STARTUP_ACTIVATION_LIBRARIES:return STARTUP_ACTIVATION_LIBRARIES
    loaded=sys.modules.get('cv2')
    require(loaded is not None,'Unexpected activation library mutation before cv2 loaded')
    distribution=importlib.metadata.distribution('opencv-python-headless')
    origin=Path(distribution.locate_file('cv2/__init__.py')).absolute()
    prefix=str(origin.parent/'../../lib64')+':'
    require(distribution.version==CORE_PACKAGES['opencv-python-headless']
            and getattr(loaded,'__file__',None)==str(origin)
            and getattr(getattr(loaded,'__spec__',None),'origin',None)==str(origin)
            and current==prefix+STARTUP_ACTIVATION_LIBRARIES,
            'Unexpected activation library mutation or cv2 origin')
    return STARTUP_ACTIVATION_LIBRARIES


def environment():
    """Bind installed core/CUDA metadata without importing ML or inspecting config."""
    require(platform.system()=='Linux' and sys.version_info[:3]==(3,12,3),'Verified WSL Python 3.12.3 required')
    packages={}
    for dist in importlib.metadata.distributions():
        name=dist.metadata['Name'].lower().replace('_','-')
        if name not in CORE_PACKAGES and not name.startswith(('nvidia-','cuda-')):continue
        files={}
        for entry in dist.files or []:
            if str(entry).endswith(('.dist-info/METADATA','.dist-info/RECORD')):
                files[str(entry)]=sha256_file(dist.locate_file(entry))
        require(any(k.endswith('/METADATA') for k in files) and any(k.endswith('/RECORD') for k in files),
                'Installed package metadata/RECORD missing: '+name)
        require(name not in packages,'Duplicate installed package: '+name)
        packages[name]=dict(version=dist.version,metadata=files)
    require({n:packages.get(n,{}).get('version') for n in CORE_PACKAGES}==CORE_PACKAGES,
            'Core package pins changed')
    require(any(n.startswith('nvidia-') for n in packages),'Resolved CUDA packages missing')
    query=subprocess.run(['nvidia-smi','--query-gpu=name,uuid,driver_version,memory.total',
                          '--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=10,check=False)
    require(query.returncode==0 and len(query.stdout)<16384,'GPU identity query failed')
    rows=[line.strip().split(', ') for line in query.stdout.strip().splitlines()]
    require(len(rows)==1 and len(rows[0])==4,'Exactly one NVIDIA device required')
    name,uuid,driver,total=rows[0]
    return dict(platform=platform.system(),python=platform.python_version(),kernel=platform.release(),
                packages=packages,nvidia=dict(name=name,uuid=uuid,driver_version=driver,total_mib=int(total)),
                activation_libraries=activation_libraries(),executable=sys.executable)


def verify_gpu_check(path=GPU_CHECK):
    result=read_sealed(path)
    require(digest(result)==GPU_CHECK_SHA and result.get('status')=='success'
            and result.get('kind')=='parcel_gpu_environment_check_v1'
            and result.get('packages')==CORE_PACKAGES
            and result.get('logical_gpu_memory_limit_mib')==2048
            and result.get('tensorflow_build',{}).get('is_cuda_build') is True,
            'Exact successful GPU check03 required')
    require(sha256_file(Path(__file__).parent/'parcel_gpu_check.py')==result.get('code_sha256'),
            'Current GPU checker differs from successful check03')
    for name in ('tensor','convolution'):
        operation=result[name]
        require(operation.get('device','').endswith('GPU:0') and operation.get('finite') is True,
                'GPU check lacks materialized GPU operation')
    return result


def code_bindings():
    return {name:sha256_file(Path(__file__).parent/name) for name in CODE_FILES}


def experiment_identity(binding):return digest(dict(profile=PROFILE,binding=binding))


def prepare(transport_path,output):
    """Freeze new prospective metadata; no decoding, TensorFlow, or model access."""
    loaded=fast_transport.load_transport(transport_path);validate_cohort(loaded['manifest'])
    env=environment();check=verify_gpu_check()
    require(env['nvidia']=={k:check['nvidia'][k] for k in ('name','uuid','driver_version','total_mib')},
            'GPU hardware or driver differs from actual check03')
    binding=dict(transport=dict(path=str(Path(transport_path).resolve()),sha256=sha256_file(transport_path)),
        code=code_bindings(),environment=env,execution=gpu_protocol(),
        gpu_check=dict(path=str(GPU_CHECK),sha256=sha256_file(GPU_CHECK),payload_sha256=GPU_CHECK_SHA),
        activation_helper=dict(path=str(HELPER),sha256=sha256_file(HELPER)),
        original_settings_sha256=digest(loaded['settings']),membership_sha256=digest(loaded['manifest']['rows']))
    out=output_path(output);transport._git_check(ROOT,[out.relative_to(ROOT).as_posix()])
    out.mkdir(parents=True,exist_ok=False)
    result=out/'prepared.json'
    write_sealed(result,dict(profile=PROFILE,key=experiment_identity(binding),binding=binding,
        operationally_approved=False,prior_cpu_claims='preserved; this is a prospective GPU profile'))
    return result


def verify_binding(binding):
    for name in ('transport','gpu_check','activation_helper'):
        record=binding[name]
        require(sha256_file(record['path'])==record['sha256'],'Changed bound '+name)
    require(binding['code']==code_bindings(),'Changed source code')
    require(binding['environment']==environment(),'Changed core/CUDA environment or GPU identity')
    require(binding['execution']==gpu_protocol(),'Changed fixed GPU execution protocol')
    verify_gpu_check(binding['gpu_check']['path'])
    loaded=fast_transport.load_transport(binding['transport']['path']);validate_cohort(loaded['manifest'])
    require(digest(loaded['settings'])==binding['original_settings_sha256']
            and digest(loaded['manifest']['rows'])==binding['membership_sha256'],'Changed original protocol or membership')
    return loaded


def read_prepared(path):
    value=read_sealed(output_path(path))
    require(value.get('profile')==PROFILE and value.get('operationally_approved') is False
            and value.get('key')==experiment_identity(value['binding']),'Changed GPU prepared identity')
    verify_binding(value['binding'])
    return value


def claim_phase(key,phase,detail,registry=None):
    require(phase in ('probe','develop') and len(key)==64 and all(c in '0123456789abcdef' for c in key),
            'Invalid GPU phase/key')
    registry=Path(registry) if registry is not None else output_path(REGISTRY)
    registry.mkdir(parents=True,exist_ok=True);claim=registry/(phase+'-'+key)
    try:claim.mkdir()
    except FileExistsError as error:raise ValueError('GPU experiment already claimed; automatic retry forbidden') from error
    write_json(claim/'started.json',dict(key=key,phase=phase,profile=PROFILE,**detail))
    return claim


@contextmanager
def exclusive_job():
    # Share the existing research lock too: CPU/GPU experiments must not overlap.
    locks=[REGISTRY/'active-job',science.REGISTRY/'active-job']
    acquired=[];guard={'retain':False}
    try:
        for lock in locks:
            lock=output_path(lock);lock.parent.mkdir(parents=True,exist_ok=True)
            try:lock.mkdir()
            except FileExistsError as error:raise ValueError('Research job active or stale; reconcile before another attempt') from error
            acquired.append(lock)
        yield guard
    finally:
        import parcel_gpu_runtime as native
        retained=guard['retain'] or (Path(native.REGISTRY)/'active-runtime').exists()
        for lock in reversed(acquired):
            if retained:
                marker=lock/'cleanup-unconfirmed.json'
                if not marker.exists():write_json(marker,dict(reason='Native cleanup requires reconciliation; shared research lock retained'))
            else:lock.rmdir()


def positive(value):return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value>0


def probe_weights(data):
    train=[r for r in data['rows'] if r['split']=='train']
    lookup={r['sample_id']:w for r,w in zip(train,component_weights(train))}
    return [lookup[r['sample_id']] for r in fixed_probe_rows(data)]


def project_probe(record,data):
    require(record.get('probe_kind')==PROBE_KIND and record.get('replicates')==3
            and record.get('optimizer_state_unchanged') is True,'Fixed compiled no-update GPU probe required')
    require(record.get('train_component_weights')==probe_weights(data),'Probe full-TRAIN component weights changed')
    device_proof=record.get('gpu_execution',{})
    require(device_proof.get('head_gradient_count')==2 and all(
        isinstance(device_proof.get(key),list) and len(device_proof[key])==1
        and device_proof[key][0].endswith('GPU:0') for key in ('forward_devices','head_gradient_devices')),
        'Actual model forward/head gradients must execute on GPU:0')
    for name in ('forward','gradient','decode'):
        values=record.get('steady_'+name+'_seconds',[])
        require(len(values)==3 and all(positive(v) for v in values)
                and record.get(name+'_seconds')==max(values),'Probe must use MAX of exactly three steady '+name+' timings')
    require(all(positive(record.get(k)) for k in ('cold_forward_seconds','cold_gradient_seconds')),
            'Cold trace/materialization timing required')
    return science.project_probe(record,data)


def finalize_probe(target,record,data,prepared):
    write_sealed(Path(target)/'probe-attempt.json',dict(record,key=prepared['key'],binding_sha256=digest(prepared['binding'])))
    project_probe(record,data)
    write_sealed(Path(target)/'probe-model.json',record)


def validate_native(record,wall_seconds):
    require(record.get('status')=='success' and record.get('returncode')==0
            and positive(record.get('elapsed_seconds')) and record['elapsed_seconds']<=wall_seconds
            and isinstance(record.get('peak_rss_bytes'),int) and 0<=record['peak_rss_bytes']<=HOST_MEMORY_LIMIT,
            'Native worker failed resource proof')
    # Runtime owns platform property normalization and exact cgroup/cleanup proof.
    import parcel_gpu_runtime as native
    native.validate_native_result(record,wall_seconds)


def verify_native_files(target,records,wall_seconds):
    expected={'request.json','native-result.json','worker-envelope.json','worker-terminal.json'}
    require(set(records)==expected,'Incomplete native evidence binding')
    for name,sha in records.items():require(sha256_file(Path(target)/name)==sha,'Changed native evidence: '+name)
    result=transport._json(Path(target)/'native-result.json')
    validate_native(result,wall_seconds)
    require(result['worker_envelope_sha256']==records['worker-envelope.json']
            and result['worker_terminal_sha256']==records['worker-terminal.json'],'Native receipt proof binding changed')
    request=transport._json(Path(target)/'request.json')
    envelope=transport._json(Path(target)/'worker-envelope.json')
    require(result.get('request_sha256')==records['request.json']==envelope.get('request_sha256'),
            'Native armed request binding changed')
    phase='probe' if wall_seconds==180 else 'develop'
    quota=OUTPUT_LIMITS[phase];tree=str(Path(target).parent)
    require(result.get('max_output_bytes')==request.get('max_output_bytes')==quota
            and result.get('output_tree')==request.get('output_tree')==tree,'Native phase output quota/tree changed')
    require(request.get('command')==worker_command(phase,Path(target).parent,Path(target).name),
            'Native worker command differs from fixed phase/fit')


def native_bindings(target):
    return {name:sha256_file(Path(target)/name) for name in ('request.json','native-result.json','worker-envelope.json','worker-terminal.json')}


def worker_command(phase,out,fit_id):
    return [sys.executable,str(Path(__file__).resolve()),'_probe' if phase=='probe' else '_fit',
            '--output',str(out),'--fit-id',fit_id]


def verify_probe(path,prepared,loaded=None):
    receipt=read_sealed(output_path(path));loaded=loaded or verify_binding(prepared['binding'])
    require(receipt.get('key')==prepared['key'] and receipt.get('binding_sha256')==digest(prepared['binding'])
            and receipt.get('status')=='success'
            and [r.get('fit_id') for r in receipt.get('models',[])]==list(FIT_IDS),'Successful source-bound two-model GPU probe required')
    projections=[project_probe(r,loaded['manifest']) for r in receipt['models']]
    require(receipt.get('projections')==projections and sum(p['fit_seconds'] for p in projections)+300<=6300,
            'GPU phase projection exceeds unchanged cap')
    require(set(receipt.get('native_records',{}))==set(FIT_IDS),'Both native model proofs required')
    for fit_id in FIT_IDS:verify_native_files(Path(path).parent/fit_id,receipt['native_records'][fit_id],180)
    return receipt


def validate_raw_result(result,raw,history,data,prepared):
    require(result.get('key')==prepared['key'] and result.get('binding_sha256')==digest(prepared['binding'])
            and result.get('fit_id') in FIT_IDS,'Fit provenance binding mismatch')
    devices=result.get('validation_output_devices',[])
    require(len(devices)==1 and devices[0].endswith('GPU:0'),'Reloaded VALID model output must execute on GPU:0')
    rows=[r for r in data['rows'] if r['split']=='validation']
    require([r.get('sample_id') for r in raw]==[r['sample_id'] for r in rows]
            and all(all(pred.get(k)==row[k] for k in ('label','dependency_group_id','sha256','pixel_sha256'))
                    for pred,row in zip(raw,rows))
            and [r.get('component_weight') for r in raw]==component_weights(rows),'VALID membership/provenance changed')
    metrics=validation_metrics(rows,[r['probabilities'] for r in raw])
    require(metrics==result.get('validation_metrics') and result.get('component_macro_f1')==metrics['component_weighted']['macro_f1']
            and result.get('component_nll')==metrics['component_weighted']['nll'],'Raw VALID metrics do not reconstruct')
    stable=stable_validation_loss(rows,[r['probabilities'] for r in raw],[r['logits'] for r in raw],
                                  [r['keras_sparse_ce'] for r in raw])
    expected=math.ceil(sum(r['split']=='train' for r in data['rows'])/4)*len(history.get('loss',[]))
    require(result.get('optimizer_iterations')==result.get('expected_optimizer_iterations')==expected,
            'Unexpected optimizer iteration count')
    require(result.get('checkpoint_component_stable_ce')==stable
            and result.get('scoring')=='compiled_validation_batch4_partial_v1'
            and result.get('validation_batch_sizes')==batch_sizes(len(rows)),'Changed checkpoint loss or scoring contract')
    restored=restored_validation(history,stable)
    require(all(result.get(k)==v for k,v in restored.items())
            and result.get('raw_predictions_from')=='reloaded_classifier.keras','Missing restored checkpoint serialization evidence')
    return metrics


def verify_fit_result(out,prepared,result,loaded=None):
    loaded=loaded or verify_binding(prepared['binding']);target=Path(out)/result['fit_id']
    for name,key in (('classifier.keras','artifact_sha256'),('validation-predictions.json','validation_predictions_sha256'),('history.json','history_sha256'),('validation-diagnostic.json','validation_diagnostic_sha256')):
        require(sha256_file(target/name)==result.get(key),'Changed fit artifact: '+name)
    validate_raw_result(result,transport._json(target/'validation-predictions.json'),transport._json(target/'history.json'),loaded['manifest'],prepared)
    diagnostic=transport._json(target/'validation-diagnostic.json')
    require(diagnostic.get('key')==prepared['key'] and diagnostic.get('binding_sha256')==digest(prepared['binding'])
            and diagnostic.get('fit_id')==result['fit_id'] and diagnostic.get('artifact_sha256')==result['artifact_sha256']
            and all(diagnostic.get(k)==result.get(k) for k in ('optimizer_iterations','expected_optimizer_iterations',
                'checkpoint_component_stable_ce','validation_batch_sizes','scoring')),'Changed validation diagnostic provenance')


def _public_phase(prepared_path,output,phase,probe_path=None):
    import parcel_gpu_runtime as native
    prepared=read_prepared(prepared_path);loaded=verify_binding(prepared['binding'])
    if phase=='develop':verify_probe(probe_path,prepared,loaded)
    with exclusive_job() as guard:
        out=output_path(output);transport._git_check(ROOT,[out.relative_to(ROOT).as_posix()])
        out.mkdir(parents=True,exist_ok=False)
        claim=claim_phase(prepared['key'],phase,dict(output=str(out),fit_ids=list(FIT_IDS)))
        began=time.monotonic();deadline=began+(6300 if phase=='develop' else 180)
        write_sealed(out/'request.json',dict(prepared=prepared,phase=phase,
            probe=None if probe_path is None else dict(path=str(Path(probe_path).resolve()),sha256=sha256_file(probe_path))))
        try:
            models=[];proofs={}
            for index,fit_id in enumerate(FIT_IDS):
                require(time.monotonic()<deadline,'Whole GPU phase cap exceeded')
                target=out/fit_id  # native runtime exclusively creates this tree
                unit='iilas-gpu-'+phase+'-'+prepared['key'][:12]+'-'+str(index)
                command=worker_command(phase,out,fit_id)
                cap=180 if phase=='probe' else 3000
                record=native.run_worker(command,target,unit,cap,phase_deadline_monotonic=deadline,
                                         output_tree=out,max_output_bytes=OUTPUT_LIMITS[phase])
                if guard is not None and record.get('cleanup',{}).get('status') not in ('clean','not_started'):
                    guard['retain']=True
                validate_native(record,cap);proofs[fit_id]=native_bindings(target)
                verify_native_files(target,proofs[fit_id],cap)
                model=read_sealed(target/('probe-model.json' if phase=='probe' else 'fit.json'))
                if phase=='develop':verify_fit_result(out,prepared,model,loaded)
                models.append(model)
                require(time.monotonic()<deadline,'Whole GPU phase cap exceeded')
            verify_binding(prepared['binding'])
            if phase=='probe':
                projections=[project_probe(r,loaded['manifest']) for r in models]
                require(sum(p['fit_seconds'] for p in projections)+300<=6300,'GPU phase projection exceeds cap')
                result=out/'probe.json'
                write_sealed(result,dict(status='success',key=prepared['key'],binding_sha256=digest(prepared['binding']),
                    models=models,projections=projections,native_records=proofs,
                    interpretation='TRAIN-only no-update GPU feasibility; no accuracy'))
                verify_probe(result,prepared,loaded)
            else:
                for model in models:verify_fit_result(out,prepared,model,loaded)
                comparison=compare_fits(models);result=out/'comparison.json'
                write_sealed(result,dict(status='success',profile=PROFILE,key=prepared['key'],binding=prepared['binding'],
                    all_fits=models,native_records=proofs,comparison_winner=comparison['fit_id'],
                    primary='mobilenetv2-clahe',operationally_approved=False,serving_gates='closed',
                    elapsed_seconds=time.monotonic()-began))
            write_json(claim/'completed.json',dict(result_sha256=sha256_file(result)))
            return result
        except Exception as error:
            write_json(claim/'failed.json',dict(reason=str(error),elapsed_seconds=time.monotonic()-began))
            raise


def probe(prepared,output):return _public_phase(prepared,output,'probe')


def develop(prepared,probe_receipt,output):return _public_phase(prepared,output,'develop',probe_receipt)


def configure_gpu(tf):
    """Fail closed on GPU identity/placement; only intentionally CPU ops use CPU."""
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    devices=tf.config.list_physical_devices('GPU')
    require(len(devices)==1,'Exactly one physical GPU required; CPU fallback forbidden')
    tf.config.set_visible_devices(devices,'GPU')
    tf.config.set_logical_device_configuration(devices[0],[tf.config.LogicalDeviceConfiguration(memory_limit=2048)])
    tf.config.set_soft_device_placement(False)
    logical=tf.config.list_logical_devices('GPU')
    require(len(logical)==1 and logical[0].name.endswith('GPU:0'),'Exactly one logical GPU:0 required')
    require(not tf.config.get_soft_device_placement(),'CPU fallback forbidden')
    tf.keras.utils.set_random_seed(42);tf.keras.mixed_precision.set_global_policy('float32')
    with tf.device('/GPU:0'):operation=tf.linalg.matmul(tf.ones((8,8),tf.float32),tf.ones((8,8),tf.float32))
    values=operation.numpy()
    require(operation.device.endswith('GPU:0') and bool((values==8).all()),'Materialized GPU:0 operation required')
    return dict(device=operation.device,allocator_mib=2048,soft_device_placement=False,jit_compile=False)


def _leaf_setup(out,fit_id,phase):
    import parcel_gpu_runtime as native
    proof=native.require_worker()  # actual cgroup and PID proof BEFORE TensorFlow
    require(fit_id in FIT_IDS,'Unknown fixed fit')
    out=output_path(out);target=output_path(out/fit_id)
    request=read_sealed(out/'request.json');prepared=request['prepared']
    require(request.get('phase')==phase and prepared.get('profile')==PROFILE
            and prepared.get('key')==experiment_identity(prepared['binding']),'Worker request binding mismatch')
    loaded=verify_binding(prepared['binding'])
    if phase=='develop':
        probe_record=request.get('probe');require(probe_record is not None,'Probe required before model access')
        require(sha256_file(probe_record['path'])==probe_record['sha256'],'Probe changed after admission')
        verify_probe(probe_record['path'],prepared,loaded)
    require('tensorflow' not in sys.modules,'GPU configuration must precede TensorFlow import')
    os.environ['KERAS_HOME']=str(target/'keras-cache')
    os.environ['TF_DETERMINISTIC_OPS']='1'
    os.environ['TF_ENABLE_ONEDNN_OPTS']='0'
    os.environ['CUDA_VISIBLE_DEVICES']='0'
    for name in ('TF_NUM_INTRAOP_THREADS','TF_NUM_INTEROP_THREADS','OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS'):os.environ[name]='1'
    import tempfile
    tmp=target/'tmp';tmp.mkdir();os.environ['TMPDIR']=str(tmp);tempfile.tempdir=str(tmp)
    # Restrict Python-side acquisition as well as requiring local official weights.
    import socket
    def denied(*args,**kwargs):raise RuntimeError('Network prohibited in parcel GPU workers')
    socket.create_connection=denied;socket.socket.connect=denied;socket.socket.connect_ex=denied
    import tensorflow as tf
    device=configure_gpu(tf)
    write_sealed(target/'gpu-worker.json',dict(native=proof,gpu=device,key=prepared['key']))
    return prepared,target,tf,loaded


def read_image(row,loaded,*,allowed):
    require(row.get('split') in ('train','validation') and row['split'] in allowed,'Forbidden image partition')
    local=Path(loaded['resolved']['images'][row['sample_id']])
    require(local.resolve()==(ROOT/row['path']).resolve(),'Changed resolved image path')
    local=transport._safe(ROOT,row['path'])
    require(0<local.stat().st_size<=16*MiB and min(row['width'],row['height'])>=64
            and row['width']*row['height']<=16_000_000,'Image byte/dimension bound exceeded')
    payload=local.read_bytes();require(hashlib.sha256(payload).hexdigest()==row['sha256'],'Image encoded hash changed')
    from parcel_inputs import decode_rgb
    rgb=decode_rgb(payload)
    require(rgb.shape[:2]==(row['height'],row['width']) and hashlib.sha256(rgb.tobytes()).hexdigest()==row['pixel_sha256'],
            'Decoded RGB pixels changed')
    return rgb


def batch_stream(rows,contrast,loaded,*,training,rng=None,sample_weights=None):
    import numpy as np
    from parcel_inputs import prepare_image,augment_image
    weights=component_weights(rows) if sample_weights is None else sample_weights
    require(len(weights)==len(rows) and all(positive(weight) for weight in weights),'Invalid mapped component weights')
    split='train' if training else 'validation'
    require(rows and all(row['split']==split for row in rows),'Training flag differs from partition')
    rng=rng if rng is not None else np.random.default_rng(42)
    indices=rng.permutation(len(rows)) if training else range(len(rows))
    images=[];labels=[];selected_weights=[]
    for index in indices:
        index=int(index);row=rows[index]
        image=prepare_image(read_image(row,loaded,allowed=(split,)),contrast)
        if training:image=augment_image(image,rng,training=True)
        images.append(image);labels.append(science.CLASS_ORDER.index(row['label']));selected_weights.append(weights[index])
        if len(images)==4:
            yield np.stack(images),np.asarray(labels,np.int32),np.asarray(selected_weights,np.float32)
            images=[];labels=[];selected_weights=[]
    if images:yield np.stack(images),np.asarray(labels,np.int32),np.asarray(selected_weights,np.float32)


def dataset(rows,contrast,loaded,training,tf):
    import numpy as np
    rng=np.random.default_rng(42)
    ds=tf.data.Dataset.from_generator(lambda:batch_stream(rows,contrast,loaded,training=training,rng=rng),
        output_signature=(tf.TensorSpec((None,224,224,3),tf.float32),tf.TensorSpec((None,),tf.int32),tf.TensorSpec((None,),tf.float32)))
    ds=ds.apply(tf.data.experimental.assert_cardinality(math.ceil(len(rows)/4)))
    options=tf.data.Options();options.threading.private_threadpool_size=1
    options.threading.max_intra_op_parallelism=1;options.experimental_deterministic=True
    return ds.with_options(options).prefetch(1)


def build_model(tf,architecture,loaded):
    from parcel_models import build_classifier
    model=build_classifier(architecture,Path(loaded['resolved']['weights'][architecture]))
    # Explicit False preserves the former CPU auto=False choice on a GPU host.
    model.compile(optimizer=tf.keras.optimizers.Adam(.001),loss='sparse_categorical_crossentropy',jit_compile=False)
    return model


def compiled_probe_functions(tf,model):
    images_signature=tf.TensorSpec((None,224,224,3),tf.float32)
    @tf.function(input_signature=[images_signature],jit_compile=False)
    def forward(images):return model(images,training=False)
    @tf.function(input_signature=[images_signature,tf.TensorSpec((None,),tf.int32),
                                  tf.TensorSpec((None,),tf.float32)],jit_compile=False)
    def gradient(images,labels,weights):
        with tf.GradientTape() as tape:
            probabilities=model(images,training=True)
            loss=tf.reduce_mean(weights*tf.keras.losses.sparse_categorical_crossentropy(labels,probabilities))
        gradients=tape.gradient(loss,model.trainable_variables)
        return probabilities,loss,gradients
    return forward,gradient


def require_gpu_tensor(tensor):
    require(isinstance(getattr(tensor,'device',None),str) and tensor.device.endswith('GPU:0'),
            'Actual model tensor must execute on GPU:0; CPU fallback forbidden')
    return tensor.device


def batch_sizes(count):return [4]*(count//4)+([count%4] if count%4 else [])


def compiled_validation_forward(tf,model):
    @tf.function(input_signature=[tf.TensorSpec((None,224,224,3),tf.float32),tf.TensorSpec((None,),tf.int32)],jit_compile=False)
    def forward(images,labels):
        probabilities=model(images,training=False)
        logits=getattr(probabilities,'_keras_logits',None)
        require(logits is not None,'Cached classifier logits required; probability-only checkpoint loss forbidden')
        losses=tf.keras.losses.sparse_categorical_crossentropy(labels,probabilities)
        return probabilities,logits,losses
    return forward


def validation_probabilities(model,rows,contrast,loaded,tf):
    require(rows and all(row['split']=='validation' for row in rows),'Only VALID scoring rows admitted')
    forward=compiled_validation_forward(tf,model);probabilities=[];logits=[];losses=[];devices=set();sizes=[];offset=0
    expected_sizes=batch_sizes(len(rows))
    for index,(images,labels,_) in enumerate(batch_stream(rows,contrast,loaded,training=False)):
        require(index<len(expected_sizes) and len(images)==expected_sizes[index]
                and [int(value) for value in labels]==[science.CLASS_ORDER.index(row['label']) for row in rows[offset:offset+len(images)]],
                'VALID scoring batch membership/order changed')
        values=forward(tf.convert_to_tensor(images),tf.convert_to_tensor(labels))
        for value in values:devices.add(require_gpu_tensor(value))
        p,z,ce=[value.numpy().tolist() for value in values]
        require(len(p)==len(z)==len(ce)==len(images),'VALID scoring output count changed')
        probabilities.extend(p);logits.extend(z);losses.extend(ce);sizes.append(len(images));offset+=len(images)
    require(offset==len(rows) and sizes==expected_sizes,'VALID scoring membership/order or final partial batch changed')
    return probabilities,logits,losses,sorted(devices),sizes


def stable_validation_loss(rows,probabilities,logits,keras_ce):
    require(len(rows)==len(probabilities)==len(logits)==len(keras_ce),'Stable CE membership changed')
    validation_metrics(rows,probabilities)
    reconstructed=[]
    for row,p,z,ce in zip(rows,probabilities,logits,keras_ce):
        require(isinstance(z,list) and len(z)==2 and all(isinstance(v,(int,float)) and math.isfinite(v) for v in z)
                and isinstance(ce,(int,float)) and math.isfinite(ce) and ce>=0,'Invalid saved logits or sparse CE')
        maximum=max(z);exponentials=[math.exp(v-maximum) for v in z];total=sum(exponentials)
        require(all(math.isclose(value,exponential/total,rel_tol=1e-4,abs_tol=1e-37) for value,exponential in zip(p,exponentials)),
                'Saved logits do not reconstruct softmax probabilities')
        loss=(maximum-z[science.CLASS_ORDER.index(row['label'])])+math.log(total)
        require(math.isclose(loss,ce,abs_tol=1e-4,rel_tol=1e-4),'Saved Keras sparse CE does not reconstruct from logits')
        reconstructed.append(loss)
    weights=component_weights(rows)
    return sum(w*loss for w,loss in zip(weights,reconstructed))/sum(weights)


def finalize_fit_validation(target,prepared,fit_id,rows,history,probabilities,logits,keras_ce,devices,sizes,optimizer_iterations,tf32_enabled):
    """Keep complete failed-attempt evidence before either checkpoint guard."""
    raw=[dict(sample_id=r['sample_id'],label=r['label'],dependency_group_id=r['dependency_group_id'],
        sha256=r['sha256'],pixel_sha256=r['pixel_sha256'],component_weight=w,probabilities=p,logits=z,keras_sparse_ce=ce)
        for r,w,p,z,ce in zip(rows,component_weights(rows),probabilities,logits,keras_ce)]
    write_json(Path(target)/'validation-predictions.json',raw)
    metrics=validation_metrics(rows,probabilities);expected=189*len(history.get('loss',[]))
    diagnostic=dict(key=prepared['key'],binding_sha256=digest(prepared['binding']),fit_id=fit_id,
        artifact_sha256=sha256_file(Path(target)/'classifier.keras'),optimizer_iterations=optimizer_iterations,
        expected_optimizer_iterations=expected,raw_component_nll=metrics['component_weighted']['nll'],
        legacy_nll_definition='truth probability clipped at1e-7; unchanged report/selection quantity',
        minimum_val_loss=min(history.get('val_loss',[])),validation_batch_sizes=sizes,validation_output_devices=devices,
        scoring='compiled_validation_batch4_partial_v1',tensorflow_tf32_enabled=tf32_enabled,
        checkpoint_loss='component_stable_logits_ce_v1',absolute_relative_tolerance=1e-4)
    try:stable=stable_validation_loss(rows,probabilities,logits,keras_ce)
    except Exception as error:
        write_json(Path(target)/'validation-diagnostic.json',dict(diagnostic,stable_loss_error=str(error)))
        raise
    diagnostic.update(checkpoint_component_stable_ce=stable,absolute_checkpoint_difference=abs(stable-diagnostic['minimum_val_loss']))
    write_json(Path(target)/'validation-diagnostic.json',diagnostic)
    require(optimizer_iterations==expected,'Unexpected optimizer iteration count')
    require(sizes==batch_sizes(len(rows)),'VALID batch shape changed')
    restoration=restored_validation(history,stable)
    return metrics,restoration,diagnostic


def _probe(out,fit_id):
    began=time.monotonic();prepared,target,tf,loaded=_leaf_setup(out,fit_id,'probe')
    import numpy as np
    rows=fixed_probe_rows(loaded['manifest']);weights_for_probe=probe_weights(loaded['manifest'])
    architecture,contrast=fit_id.rsplit('-',1)
    model=build_model(tf,architecture,loaded)
    require(len(model.trainable_variables)==2,'Exactly the fresh two-class Dense head must be trainable')
    model.optimizer.build(model.trainable_variables)
    state=lambda:[v.numpy().copy() for v in [*model.weights,*model.optimizer.variables]]
    before=state()
    images,labels,weights=next(batch_stream(rows,contrast,loaded,training=True,rng=np.random.default_rng(42),sample_weights=weights_for_probe))
    images=tf.convert_to_tensor(images);labels=tf.convert_to_tensor(labels);weights=tf.convert_to_tensor(weights)
    forward,gradient=compiled_probe_functions(tf,model)
    forward_devices=set();gradient_devices=set()
    def measured(call,*,with_gradients=False):
        start=time.monotonic();value=call()
        forward_devices.add(require_gpu_tensor(value[0] if with_gradients else value))
        if with_gradients:
            require(len(value[2])==2,'Exactly two head gradients required')
            for tensor in value[2]:gradient_devices.add(require_gpu_tensor(tensor))
        for tensor in tf.nest.flatten(value):
            require(tensor is not None,'Missing head gradient')
            require(bool(np.isfinite(tensor.numpy()).all()),'Nonfinite probe output/gradient')
        return time.monotonic()-start
    cold_forward=measured(lambda:forward(images))
    cold_gradient=measured(lambda:gradient(images,labels,weights),with_gradients=True)
    setup=time.monotonic()-began  # includes construction, decode and each cold trace once
    steady_decode=[];steady_forward=[];steady_gradient=[]
    for _ in range(3):
        start=time.monotonic()
        batch=next(batch_stream(rows,contrast,loaded,training=True,rng=np.random.default_rng(42),sample_weights=weights_for_probe))
        images=tf.convert_to_tensor(batch[0]);labels=tf.convert_to_tensor(batch[1]);weights=tf.convert_to_tensor(batch[2])
        steady_decode.append(time.monotonic()-start)
        steady_forward.append(measured(lambda:forward(images)))
        steady_gradient.append(measured(lambda:gradient(images,labels,weights),with_gradients=True))
    start=time.monotonic();model.save(target/'probe.keras')
    restored=tf.keras.models.load_model(target/'probe.keras',compile=True)
    measured(lambda:restored(images,training=False));save_load=time.monotonic()-start
    after=state();restored_state=[v.numpy() for v in [*restored.weights,*restored.optimizer.variables]]
    # Dropout seed-generator state may advance; model.weights is learned/BN state,
    # optimizer.variables are iteration, learning rate and all prebuilt slots.
    unchanged=len(before)==len(after)==len(restored_state) and all(np.array_equal(a,b) and np.array_equal(a,c) for a,b,c in zip(before,after,restored_state))
    record=dict(fit_id=fit_id,probe_kind=PROBE_KIND,replicates=3,state_unchanged=unchanged,
        optimizer_state_unchanged=unchanged,batch_size=4,train_sample_ids=[r['sample_id'] for r in rows],
        train_component_weights=weights_for_probe,
        gpu_execution=dict(forward_devices=sorted(forward_devices),head_gradient_devices=sorted(gradient_devices),head_gradient_count=2),
        setup_seconds=setup,cold_forward_seconds=cold_forward,cold_gradient_seconds=cold_gradient,
        decode_seconds=max(steady_decode),forward_seconds=max(steady_forward),gradient_seconds=max(steady_gradient),
        steady_decode_seconds=steady_decode,steady_forward_seconds=steady_forward,
        steady_gradient_seconds=steady_gradient,save_load_seconds=save_load)
    finalize_probe(target,record,loaded['manifest'],prepared)
    verify_binding(prepared['binding'])


def _fit(out,fit_id):
    prepared,target,tf,loaded=_leaf_setup(out,fit_id,'develop')
    architecture,contrast=fit_id.rsplit('-',1)
    rows={s:[r for r in loaded['manifest']['rows'] if r['split']==s] for s in ('train','validation')}
    model=build_model(tf,architecture,loaded)
    history=science.fit_head(model,dataset(rows['train'],contrast,loaded,True,tf),
                            dataset(rows['validation'],contrast,loaded,False,tf),tf).history
    write_json(target/'history.json',history)
    optimizer_iterations=int(model.optimizer.iterations.numpy())
    model.save(target/'classifier.keras');del model
    import gc
    gc.collect()
    restored=tf.keras.models.load_model(target/'classifier.keras',compile=False)
    probabilities,logits,keras_ce,output_devices,sizes=validation_probabilities(restored,rows['validation'],contrast,loaded,tf)
    metrics,restoration,diagnostic=finalize_fit_validation(target,prepared,fit_id,rows['validation'],history,
        probabilities,logits,keras_ce,output_devices,sizes,optimizer_iterations,
        bool(tf.config.experimental.tensor_float_32_execution_enabled()))
    verify_binding(prepared['binding'])
    result=dict(status='success',fit_id=fit_id,architecture=architecture,contrast=contrast,
        key=prepared['key'],binding_sha256=digest(prepared['binding']),validation_metrics=metrics,
        component_macro_f1=metrics['component_weighted']['macro_f1'],component_nll=metrics['component_weighted']['nll'],
        **restoration,raw_predictions_from='reloaded_classifier.keras',
        validation_output_devices=output_devices,validation_batch_sizes=sizes,scoring=diagnostic['scoring'],
        optimizer_iterations=optimizer_iterations,expected_optimizer_iterations=diagnostic['expected_optimizer_iterations'],
        checkpoint_component_stable_ce=diagnostic['checkpoint_component_stable_ce'],
        partition_counts={k:partition_summary(v) for k,v in rows.items()},
        artifact_sha256=sha256_file(target/'classifier.keras'),validation_predictions_sha256=sha256_file(target/'validation-predictions.json'),
        history_sha256=sha256_file(target/'history.json'),validation_diagnostic_sha256=sha256_file(target/'validation-diagnostic.json'),
        legacy_report_nll='clipped_probability_floor1e-7',operationally_approved=False)
    raw=transport._json(target/'validation-predictions.json')
    validate_raw_result(result,raw,history,loaded['manifest'],prepared)
    write_sealed(target/'fit.json',result)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('prepare','probe','develop','_probe','_fit'))
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--transport',type=Path);parser.add_argument('--prepared',type=Path)
    parser.add_argument('--probe',type=Path);parser.add_argument('--fit-id')
    args=parser.parse_args()
    if args.command=='prepare':
        if args.transport is None:parser.error('--transport required')
        print(prepare(args.transport,args.output))
    elif args.command=='probe':
        if args.prepared is None:parser.error('--prepared required')
        print(probe(args.prepared,args.output))
    elif args.command=='develop':
        if args.prepared is None or args.probe is None:parser.error('--prepared and --probe required')
        print(develop(args.prepared,args.probe,args.output))
    elif args.command=='_probe':_probe(args.output,args.fit_id)
    else:_fit(args.output,args.fit_id)


if __name__=='__main__':main()
