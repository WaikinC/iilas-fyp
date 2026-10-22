"""Closed exposed-VALID CPU research comparison; never enables application serving.

Prepare freezes metadata/encoded hashes. Parent review of request SHA is required
before run; only its native-contained leaf decodes images or imports ML. The
600s comparison is NOT a 25s operational cold-request proof. No TEST access.
"""
import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import sys
import time
import uuid

import runner_runtime as runtime

ROOT=Path(__file__).resolve().parents[1]
CODE=Path(__file__).resolve()
OUTPUT_ROOT=ROOT/'research/datasets/parcel-windows-valid-compat'
KIND='parcel_windows_valid_compat_v1'
KEY='aef72c6d16f6c23424533e801821ab37a1bd006ebe6d359030ce3a9f55c02507'
MODEL_SHA='2fffa7aa1a8c33c6698a97e38d028858b8433aec84dbd582c01094711a0ae4da'
COMPARISON_SHA='8e52e1f6f947be6a988f156842daabac6969808f9235dce99047089518cd04f2'
BASE='research/datasets/parcel-visible-gpu-20261021/'
PATHS=dict(proof='research/datasets/parcel-source-test-audit-20261021/protocol-01/development-proof.json',
    transport=BASE+'transport-01/transport.json',comparison=BASE+'develop-02/comparison.json',
    artifact=BASE+'develop-02/mobilenetv2-clahe/classifier.keras',
    gpu_raw=BASE+'develop-02/mobilenetv2-clahe/validation-predictions.json')
CLASSES=('Normal','Damaged')
MiB=1024**2
HASH=re.compile(r'[0-9a-f]{64}\Z')
CODE_NAMES=('parcel_windows_valid_compat.py','runner_runtime.py','parcel_runtime.py','parcel_inputs.py',
    'parcel_models.py','parcel_train.py','parcel_gpu_train.py','parcel_gpu_data.py','parcel_source_test_audit.py')


def require(ok,message):
    if not ok:raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def policy():
    return dict(kind=KIND,development_key=KEY,fit_id='mobilenetv2-clahe',model_sha256=MODEL_SHA,
        class_order=list(CLASSES),preprocessing='rgb-letterbox224-v1',contrast='clahe',
        decision='larger_probability_exact_tie_abstains',confidence='uncalibrated',training=False,
        cpu_batch1='direct_eager_training_false',cpu_batch4='compiled_validation_batch4_partial_v1',
        wall_seconds=600,memory_limit_bytes=2048*MiB,admission_bytes=3072*MiB,
        live_floor_bytes=768*MiB,cpu_count=1,min_disk_bytes=20*1024**3,max_output_bytes=128*MiB,
        cache_policy='no_cache_clear_no_persistent_model_v1',optimizer_iterations=945,
        nll='true_probability_clipped_floor1e-7',operationally_approved=False,serving_gates='closed')


def validate_policy(value):require(value==policy(),'Fixed comparison policy changed')


def limits():
    p=policy()
    return runtime.Limits(600,600,p['memory_limit_bytes'],p['admission_bytes'],p['min_disk_bytes'],
        p['max_output_bytes'],poll_seconds=.05,threads=1,available_floor_bytes=p['live_floor_bytes'])


def output_path(path):
    raw=Path(path).absolute()
    require(raw.parent==OUTPUT_ROOT.absolute(),'Fixed compatibility output root required')
    try:require(str(uuid.UUID(raw.name))==raw.name,'Canonical output UUID required')
    except (ValueError,AttributeError):raise ValueError('Canonical output UUID required') from None
    return runtime._validate_output_path(raw)


def json_file(path,maximum=8*MiB,*,expected_sha=None):
    def pairs(items):
        result={}
        for key,value in items:
            require(key not in result,'Duplicate JSON key');result[key]=value
        return result
    path=runtime._validate_output_path(path)
    before=path.stat();require(path.is_file() and before.st_nlink==1 and 0<before.st_size<=maximum,'Bounded regular metadata required')
    data=path.read_bytes();after=path.stat()
    require((before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_ino,after.st_size,after.st_mtime_ns)
        and len(data)==before.st_size,'Metadata changed while reading')
    require(expected_sha is None or hashlib.sha256(data).hexdigest()==expected_sha,'Parsed metadata SHA changed')
    return json.loads(data,object_pairs_hook=pairs,parse_constant=lambda value:(_ for _ in ()).throw(ValueError('Nonfinite JSON')))


def environment():
    return dict(platform=platform.system(),python=platform.python_version(),executable=sys.executable,
        packages={name:importlib.metadata.version(name) for name in ('tensorflow','keras','numpy','h5py','opencv-python-headless')})


def code_bindings():return {name:runtime.sha256_file(CODE.parent/name) for name in CODE_NAMES}


def validate_asset_roles(records):
    require(isinstance(records,dict) and set(records)==set(PATHS),'Fixed asset roles required')
    for role,path in PATHS.items():
        record=records[role]
        require(isinstance(record,dict) and set(record)=={'path','sha256','bytes'} and record['path']==path
            and isinstance(record['sha256'],str) and HASH.fullmatch(record['sha256'])
            and type(record['bytes']) is int and 0<record['bytes']<=(128*MiB if role=='artifact' else 8*MiB),
            'Fixed bounded asset role/path required')


def asset_records():
    result={}
    for role,relative in PATHS.items():
        path=runtime._validate_output_path(ROOT/relative)
        require(path.is_file() and path.stat().st_nlink==1,'Regular unlinked asset required')
        result[role]=dict(path=relative,sha256=runtime.sha256_file(path),bytes=path.stat().st_size)
    validate_asset_roles(result)
    require(result['artifact']['sha256']==MODEL_SHA and result['comparison']['sha256']==COMPARISON_SHA,'Accepted artifact/comparison changed')
    return result


def validate_rows(rows):
    require(isinstance(rows,list) and len(rows)==162 and len({r['sample_id'] for r in rows})==162
        and Counter(r['label'] for r in rows)=={'Normal':107,'Damaged':55}
        and len({r['dependency_group_id'] for r in rows})==159,'Exact exposed VALID support required')
    for row in rows:
        require(row.get('split')=='validation' and HASH.fullmatch(row.get('sha256',''))
            and HASH.fullmatch(row.get('pixel_sha256','')) and type(row.get('width')) is int
            and type(row.get('height')) is int and min(row['width'],row['height'])>=64
            and row['width']*row['height']<=16000000,'Only technical-admitted VALID allowed')
    return rows


def context():
    # Original validators remain unchanged; this invocation is metadata/encoded hashes only.
    import parcel_source_test_audit as audit
    import parcel_gpu_data as transport
    proof=audit._proof(ROOT/PATHS['proof'])
    require(proof['development_key']==KEY and proof['comparison']['sha256']==COMPARISON_SHA,'Foreign development proof')
    loaded=transport.load_transport(ROOT/PATHS['transport'])
    require(loaded['transport']['source_copies']['manifest']['sha256']==proof['development_manifest_sha256'],
        'Different exposed development manifest')
    rows=validate_rows([r for r in loaded['manifest']['rows'] if r['split']=='validation'])
    comparison=json_file(ROOT/PATHS['comparison'])['payload'];fit=comparison['all_fits'][0]
    require(fit['fit_id']=='mobilenetv2-clahe' and fit['artifact_sha256']==MODEL_SHA
        and fit['optimizer_iterations']==fit['expected_optimizer_iterations']==945,'Different accepted Mobile fit')
    require(runtime.sha256_file(ROOT/PATHS['gpu_raw'])==fit['validation_predictions_sha256'],'Original GPU reference changed')
    return rows,loaded


def prepare(output):
    out=output_path(output);require(not out.exists(),'New output required; no resume')
    rows,_=context();assets=asset_records()
    request=dict(schema_version=1,kind=KIND,policy=policy(),assets=assets,rows=rows,
        rows_sha256=digest(rows),code=code_bindings(),environment=environment())
    runtime.create_run_directory(out);runtime.write_json_exclusive(out/'request.json',request)
    return out/'request.json'


def load_request(path,expected_sha):
    path=Path(path).absolute();out=output_path(path.parent)
    require(path.name=='request.json' and isinstance(expected_sha,str) and HASH.fullmatch(expected_sha)
        and runtime.sha256_file(path)==expected_sha,'Exact reviewed request SHA required')
    value=json_file(path,expected_sha=expected_sha)
    require(set(value)=={'schema_version','kind','policy','assets','rows','rows_sha256','code','environment'}
        and value['schema_version']==1 and value['kind']==KIND,'Invalid comparison request')
    validate_policy(value['policy']);validate_asset_roles(value['assets'])
    require(value['code']==code_bindings() and value['environment']==environment(),'Code/environment changed')
    require(value['assets']==asset_records(),'Bound original assets changed')
    rows,loaded=context()
    require(value['rows']==rows and value['rows_sha256']==digest(rows),'Frozen exposed VALID membership/order changed')
    return value,loaded,out


def decide(p):
    require(isinstance(p,list) and len(p)==2 and all(type(x) in (int,float) and math.isfinite(x) and 0<=x<=1 for x in p)
        and abs(sum(p)-1)<=1e-6,'Invalid two-class probabilities')
    return None if p[0]==p[1] else CLASSES[int(p[1]>p[0])]


def validate_raw(rows,raw):
    require(len(rows)==len(raw),'Raw membership count changed')
    for row,pred in zip(rows,raw):
        require(all(pred.get(k)==row[k] for k in ('sample_id','label','dependency_group_id','sha256','pixel_sha256')),
            'Raw membership/order/provenance changed')
        decide(pred['probabilities'])


def metrics(rows,raw):
    validate_raw(rows,raw);require(bool(rows),'Empty metric rows')
    matrix=[[0,0,0],[0,0,0]];nll=0.
    for row,p in zip(rows,raw):
        actual=CLASSES.index(row['label']);label=decide(p['probabilities'])
        matrix[actual][2 if label is None else CLASSES.index(label)]+=1
        nll-=math.log(max(1e-7,p['probabilities'][actual]))
    tp=matrix[1][1];predicted_d=matrix[0][1]+tp;support_d=sum(matrix[1])
    return dict(images=len(rows),confusion=matrix,accuracy=(matrix[0][0]+tp)/len(rows),
        coverage=(len(rows)-matrix[0][2]-matrix[1][2])/len(rows),
        damaged_precision=None if not predicted_d else tp/predicted_d,
        damaged_recall=None if not support_d else tp/support_d,nll=nll/len(rows))


def compare_paths(rows,one,four,gpu):
    paths=dict(cpu_batch1=one,cpu_batch4=four,gpu_batch4=gpu)
    result=dict(metrics={name:metrics(rows,raw) for name,raw in paths.items()},operationally_approved=False,
        interpretation='Exposed VALID CPU path comparison only; no new independent accuracy or photo/live acceptance')
    for a,b in (('cpu_batch1','cpu_batch4'),('cpu_batch1','gpu_batch4'),('cpu_batch4','gpu_batch4')):
        differences=[];disagreements=[]
        for row,left,right in zip(rows,paths[a],paths[b]):
            differences.extend(abs(x-y) for x,y in zip(left['probabilities'],right['probabilities']))
            la,lb=decide(left['probabilities']),decide(right['probabilities'])
            if la!=lb:disagreements.append(dict(sample_id=row['sample_id'],left=la,right=lb))
        result[a+'_vs_'+b]=dict(max_absolute_probability_difference=max(differences),
            mean_absolute_probability_difference=sum(differences)/len(differences),disagreements=disagreements)
    return result


def validate_compiled(rows,raw,diagnostics):
    validate_raw(rows,raw);require(len(diagnostics)==len(rows),'Missing compiled diagnostics')
    for row,pred,diagnostic in zip(rows,raw,diagnostics):
        z=diagnostic.get('logits');ce=diagnostic.get('keras_sparse_ce')
        require(isinstance(z,list) and len(z)==2 and all(type(v) in (float,int) and math.isfinite(v) for v in z)
            and type(ce) in (float,int) and math.isfinite(ce) and ce>=0,'Invalid compiled logits/CE')
        maximum=max(z);exponentials=[math.exp(v-maximum) for v in z];total=sum(exponentials)
        require(all(math.isclose(p,e/total,rel_tol=1e-4,abs_tol=1e-37) for p,e in zip(pred['probabilities'],exponentials)),
            'Compiled logits do not reconstruct probabilities')
        loss=maximum-z[CLASSES.index(row['label'])]+math.log(total)
        require(math.isclose(loss,ce,rel_tol=1e-4,abs_tol=1e-4),'Compiled CE does not reconstruct')


def snapshot_state(model):
    optimizer=getattr(model,'optimizer',None);require(optimizer is not None,'Serialized optimizer missing')
    def values(variables):
        result=[]
        for index,var in enumerate(variables):
            array=var.numpy();result.append(dict(name=str(index)+':'+str(getattr(var,'path',getattr(var,'name',''))),
                shape=list(array.shape),dtype=str(array.dtype),sha256=hashlib.sha256(array.tobytes()).hexdigest()))
        return result
    return dict(model_variables=values(model.variables),optimizer_variables=values(optimizer.variables),
        optimizer_iterations=int(optimizer.iterations.numpy()))


def validate_no_update(attempt):
    require(attempt.get('artifact_hashes')==[MODEL_SHA]*4,'Saved artifact changed')
    states=attempt.get('states',[])
    require(len(states)==4 and all(s==states[0] for s in states) and states[0].get('optimizer_iterations')==945,
        'Model/optimizer state changed between paths')
    for field in ('model_variables','optimizer_variables'):
        records=states[0].get(field,[])
        require(records and len({r['name'] for r in records})==len(records),'Missing full variable state')
        for r in records:
            require(set(r)=={'name','shape','dtype','sha256'} and isinstance(r['name'],str) and r['name']
                and isinstance(r['shape'],list) and all(type(n) is int and n>=0 for n in r['shape'])
                and isinstance(r['dtype'],str) and HASH.fullmatch(r['sha256']),'Malformed variable state')


def serializable(value):
    if isinstance(value,float) and not math.isfinite(value):return dict(nonfinite=repr(value))
    if isinstance(value,dict):return {k:serializable(v) for k,v in value.items()}
    if isinstance(value,(tuple,list)):return [serializable(v) for v in value]
    return value


def persist_attempt(path,attempt):
    runtime.write_json_exclusive(path,serializable(attempt));validate_no_update(attempt)


def score_batches(rows,batch_size,prepare_row,forward,persist):
    require(batch_size in (1,4),'Only direct1/compiled4 allowed');raw=[]
    for start in range(0,len(rows),batch_size):
        batch=rows[start:start+batch_size];began=time.monotonic();images=[prepare_row(row) for row in batch]
        prepared=time.monotonic();probabilities=forward(images,[CLASSES.index(r['label']) for r in batch])
        finished=time.monotonic();require(len(probabilities)==len(batch),'Prediction batch count changed')
        for row,p in zip(batch,probabilities):
            prediction={k:row[k] for k in ('sample_id','label','dependency_group_id','sha256','pixel_sha256')}
            prediction['probabilities']=p;raw.append(prediction)
        persist(dict(offset=start,batch_size=len(batch),prepare_seconds=prepared-began,forward_seconds=finished-prepared,
            predictions=raw[-len(batch):]))
    return raw


def cpu_affinity():
    import ctypes
    from ctypes import wintypes as W
    require(os.name=='nt','Native Windows CPU leaf required')
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.GetCurrentProcess.restype=W.HANDLE;handle=kernel.GetCurrentProcess()
    kernel.GetProcessAffinityMask.argtypes=[W.HANDLE,ctypes.POINTER(ctypes.c_size_t),ctypes.POINTER(ctypes.c_size_t)]
    kernel.SetProcessAffinityMask.argtypes=[W.HANDLE,ctypes.c_size_t]
    current=ctypes.c_size_t();system=ctypes.c_size_t()
    require(kernel.GetProcessAffinityMask(handle,ctypes.byref(current),ctypes.byref(system)),'CPU affinity query failed')
    selected=current.value & -current.value
    require(selected and kernel.SetProcessAffinityMask(handle,selected),'CPU affinity bind failed')
    require(kernel.GetProcessAffinityMask(handle,ctypes.byref(current),ctypes.byref(system)) and current.value==selected,
        'One CPU affinity verification failed')
    return selected


def worker(request_path,request_sha):
    runtime.require_supervised_worker()  # Before any request asset/image read or heavy import.
    began=time.monotonic();cpu_started=time.process_time();request,loaded,out=load_request(request_path,request_sha)
    import parcel_train as train
    train.worker_environment(out);affinity=cpu_affinity()
    import tensorflow as tf
    import numpy as np
    from parcel_inputs import decode_rgb,prepare_image
    import parcel_gpu_train as gpu
    require(not tf.config.list_logical_devices('GPU'),'CPU-only configuration required')
    load_start=time.monotonic();model=tf.keras.models.load_model(ROOT/PATHS['artifact'],compile=True,safe_mode=True)
    require(model.input_shape==(None,224,224,3) and model.output_shape==(None,2),'Model shape changed')
    attempt=dict(kind=KIND,request_sha256=request_sha,policy=policy(),states=[],artifact_hashes=[],cpu_batch1=[],cpu_batch4=[],
        devices=[],compiled_logits_ce=[],tensor_hashes={},cpu_affinity=affinity,load_seconds=time.monotonic()-load_start)
    def prepared(row):
        path=Path(loaded['resolved']['images'][row['sample_id']]);require(path==ROOT/row['path'],'Resolved VALID path changed')
        data=path.read_bytes();require(hashlib.sha256(data).hexdigest()==row['sha256'],'VALID encoded bytes changed')
        rgb=decode_rgb(data);require(rgb.shape[:2]==(row['height'],row['width'])
            and hashlib.sha256(rgb.tobytes()).hexdigest()==row['pixel_sha256'],'VALID decoded bytes changed')
        tensor=prepare_image(rgb,'clahe');tensor_sha=hashlib.sha256(tensor.tobytes()).hexdigest()
        prior=attempt['tensor_hashes'].setdefault(row['sample_id'],tensor_sha);require(prior==tensor_sha,'Prepared tensor changed between paths')
        return tensor
    def materialize(value):
        require(str(value.device).endswith('CPU:0'),'Actual output must execute on CPU:0')
        attempt['devices'].append(str(value.device));return value.numpy().tolist()
    compiled=gpu.compiled_validation_forward(tf,model)
    def direct(images,labels):return materialize(model(np.stack(images),training=False))
    def four(images,labels):
        p,z,ce=compiled(tf.convert_to_tensor(np.stack(images)),tf.convert_to_tensor(labels,dtype=tf.int32))
        probabilities=materialize(p);logits=materialize(z);losses=materialize(ce)
        attempt['compiled_logits_ce'].extend(dict(logits=a,keras_sparse_ce=b) for a,b in zip(logits,losses))
        return probabilities
    try:
        with open(out/'progress.jsonl','x',encoding='utf-8') as progress:
            for name,size,forward in (('cpu_batch1',1,direct),('cpu_batch4',4,four)):
                attempt['states'].append(snapshot_state(model));attempt['artifact_hashes'].append(runtime.sha256_file(ROOT/PATHS['artifact']))
                runtime.write_json_exclusive(out/(name+'-before.json'),dict(state=attempt['states'][-1],artifact_sha256=attempt['artifact_hashes'][-1]))
                def persist(event):
                    attempt[name].extend(event['predictions'])
                    progress.write(json.dumps(serializable(dict(path=name,**event)),allow_nan=False)+'\n');progress.flush();os.fsync(progress.fileno())
                score_batches(request['rows'],size,prepared,forward,persist)
                attempt['states'].append(snapshot_state(model));attempt['artifact_hashes'].append(runtime.sha256_file(ROOT/PATHS['artifact']))
                runtime.write_json_exclusive(out/(name+'-after.json'),dict(state=attempt['states'][-1],artifact_sha256=attempt['artifact_hashes'][-1]))
        attempt['elapsed_seconds']=time.monotonic()-began;attempt['cpu_seconds']=time.process_time()-cpu_started
    except Exception as error:
        attempt['failure_type']=type(error).__name__
        runtime.write_json_exclusive(out/'attempt.json',serializable(attempt));raise
    persist_attempt(out/'attempt.json',attempt)  # Raw/state data persist before guards/metrics.
    reference=json_file(ROOT/PATHS['gpu_raw'],expected_sha=request['assets']['gpu_raw']['sha256'])
    summary=compare_paths(request['rows'],attempt['cpu_batch1'],attempt['cpu_batch4'],reference)
    validate_compiled(request['rows'],attempt['cpu_batch4'],attempt['compiled_logits_ce'])
    runtime.write_json_exclusive(out/'summary.json',summary)
    load_request(request_path,request_sha)  # Repeat bound byte/code/environment verification before success.


def drain_job(supervisor,deadline,*,active=None,clock=time.monotonic):
    if not supervisor._query_handle:
        if getattr(supervisor,'native_run_invoked',None) is False:
            return dict(status='not_started',native_run_invoked=False,job_name=None)
        raise runtime.RuntimeSafetyError('Possible native start without drain monitor; cleanup unconfirmed')
    if active is None:
        import parcel_runtime as parcel
        active=lambda:parcel._job_active(supervisor._kernel,supervisor._query_handle)
    try:
        while active():
            if clock()>=deadline:raise runtime.RuntimeSafetyError('Native drain deadline; retain research locks')
            time.sleep(.01)
    finally:
        supervisor._kernel.CloseHandle(supervisor._query_handle);supervisor._query_handle=None
    return dict(status='clean',native_run_invoked=getattr(supervisor,'native_run_invoked',None),
        job_name=getattr(supervisor,'native_job_name',None))


def new_supervisor(out):
    import parcel_runtime as parcel
    class ObservedSupervisor(parcel._DrainingSupervisor):
        """Observe the existing Job before the inherited monitor-open can fail."""
        def __init__(self):
            super().__init__(out,limits());self.native_run_invoked=False;self.native_job_name=None
        def preflight(self,*args,**kwargs):
            if self._job is not None:
                name=self._job.name
                if self.native_job_name is None:
                    self.native_job_name=name
                    runtime.write_json_exclusive(out/'native-job-observed.json',dict(job_name=name,
                        native_run_invoked=self.native_run_invoked,worker_may_have_started=True))
                require(self.native_job_name==name,'Native Job identity changed')
            try:return super().preflight(*args,**kwargs)
            finally:
                if self._query_handle and not (out/'native-drain-monitor.json').exists():
                    runtime.write_json_exclusive(out/'native-drain-monitor.json',dict(job_name=self.native_job_name,
                        monitor_opened=True,native_run_invoked=self.native_run_invoked))
    return ObservedSupervisor()


def run(request_path,request_sha):
    require(os.name=='nt' and 'tensorflow' not in sys.modules,'Cold native Windows controller required')
    out=output_path(Path(request_path).absolute().parent)
    require(not any((out/name).exists() for name in ('execution.json','launch.json','worker.result.json','attempt.json')),'No retry/resume')
    import parcel_gpu_train as gpu
    import parcel_runtime as parcel
    with gpu.exclusive_job() as guard,parcel._Mutex():
        import parcel_gpu_runtime as native
        if (Path(native.REGISTRY)/'active-runtime').exists():
            guard['retain']=True
            runtime.write_json_exclusive(out/'native-lease-blocked.json',dict(status='unconfirmed',
                reason='Existing Linux native lease requires reconciliation',request_sha256=request_sha,
                native_worker_created=False))
            raise ValueError('Native research lease active or unresolved; no Windows worker permitted')
        require(not (parcel.REQUEST_ROOT/'active.json').exists(),'Parcel job active or recovery required')
        began=time.monotonic();cpu_started=time.process_time();deadline=began+600
        runtime.write_json_exclusive(out/'execution.json',dict(request_sha256=request_sha,policy=policy()))
        supervisor=new_supervisor(out)
        try:
            initial=supervisor.preflight();affinity=cpu_affinity()
            load_request(request_path,request_sha)
            require(not set(sys.modules)&{'tensorflow','numpy','cv2'},'Controller must remain stdlib-only')
            runtime.write_json_exclusive(out/'launch.json',dict(request_sha256=request_sha,policy=policy(),
                initial_snapshot=initial,controller_affinity=affinity,command=[sys.executable,str(CODE),'_worker',
                '--request',str(Path(request_path).absolute()),'--request-sha256',request_sha]))
            runtime.write_json_exclusive(out/'native-run-invoked.json',dict(request_sha256=request_sha,
                worker_may_have_started=True,job_identity='unknown_until_observed'))
            supervisor.native_run_invoked=True
            result=supervisor.run([sys.executable,str(CODE),'_worker','--request',str(Path(request_path).absolute()),
                '--request-sha256',request_sha],fit_id='worker',cwd=ROOT)
        finally:
            guard['retain']=True
            try:drain=drain_job(supervisor,deadline)
            except Exception as error:
                runtime.write_json_exclusive(out/'cleanup.json',dict(status='unconfirmed',request_sha256=request_sha,
                    native_run_invoked=getattr(supervisor,'native_run_invoked',None),
                    job_name=getattr(supervisor,'native_job_name',None),reason_type=type(error).__name__))
                raise
            runtime.write_json_exclusive(out/'cleanup.json',dict(drain,request_sha256=request_sha,
                elapsed_seconds=time.monotonic()-began,controller_cpu_seconds=time.process_time()-cpu_started))
            guard['retain']=False
        require(time.monotonic()<=deadline,'Whole comparison deadline exceeded')
        require(result['status']=='success' and result['returncode']==0,'Comparison worker failed; preserve attempt')
    return out/'summary.json'


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=('prepare','run','_worker'))
    parser.add_argument('--output',type=Path);parser.add_argument('--request',type=Path);parser.add_argument('--request-sha256')
    args=parser.parse_args()
    if args.command=='prepare':result=prepare(args.output)
    elif args.command=='run':result=run(args.request,args.request_sha256)
    else:worker(args.request,args.request_sha256);return 0
    print(str(result));return 0


if __name__=='__main__':raise SystemExit(main())
