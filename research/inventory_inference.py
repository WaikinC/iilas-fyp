"""Source-bound synthetic stock inference. No fitting or real-data admission."""
import argparse
import ctypes
from dataclasses import dataclass
import hashlib
from importlib import metadata
import io
import json
import math
from pathlib import Path
import platform
import os
import re
import struct
import sys
import threading
import time
from uuid import uuid4

import runner_runtime as runtime

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'research/datasets/inventory-simulation-v1/main-01'
DEVELOPMENT=ROOT/'research/datasets/inventory-simulation-v1/stock-development-01'
EVALUATION=ROOT/'research/datasets/inventory-simulation-v1/stock-evaluation-01'
SCHEMA='inventory-local-serving-1.0'
PROTOCOL='inventory-synthetic-inference-1.0'
FEATURES=('available_quantity','reserved_quantity','movement_frequency','reorder_distance','adjustment_count','days_since_replenishment')
CLASSES=('Normal','Reorder Risk','Critical Stock Risk')
PROVENANCE=dict(evaluationKind='synthetic-stock-prototype',origin='simulated-manual',evaluationOnly=True,
                operationally_approved=False,independentAccuracyValidated=False,acceptanceSha256=None,humanReviewRequired=True)
TOTAL_OUTPUT_BYTES=100*1024**2
UUID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\Z')
HASH=re.compile(r'[0-9a-f]{64}\Z')
SOURCE_FILES=('research/inventory_inference.py','research/serve_inventory_local_eval.py','research/runner_runtime.py',
              'lib/inventoryAI.js','backend/functions/inventoryAI.js','backend/functions/inventoryAI.mjs',
              'backend/functions/service.mjs','lib/inventoryAIClient.js',
              'src/features/stock/InventoryAIExperiment.tsx','src/features/stock/InventoryRisk.tsx')


class StockUnavailable(RuntimeError):
    pass


class StockBusy(StockUnavailable):
    pass


@dataclass(frozen=True)
class Manifest:
    path:Path
    sha256:str
    data:dict


def sha(path):
    return runtime.sha256_file(path)


def read_json(path,limit=2*1024**2):
    path=Path(path)
    if path.is_symlink() or not 0 < path.stat().st_size <= limit:
        raise ValueError('Stock metadata is unavailable')
    return json.loads(path.read_text(encoding='utf-8'),parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite JSON')))


def exact(value,keys):
    if type(value) is not dict or set(value)!=set(keys):
        raise ValueError('Invalid stock experiment fields')


def validate_features(value):
    exact(value,FEATURES)
    result={}
    for name in FEATURES:
        v=value[name]
        minimum=-1000000 if name=='reorder_distance' else 0
        maximum=36500 if name=='days_since_replenishment' else 2000 if name in ('movement_frequency','adjustment_count') else 1000000
        if type(v) not in (int,float) or not math.isfinite(v) or not minimum<=v<=maximum:
            raise ValueError('Invalid stock model units/bounds')
        if name!='days_since_replenishment' and int(v)!=v:
            raise ValueError('Stock quantities/counts must be integral')
        result[name]=0 if v==0 else v
    if (result['available_quantity']+result['reserved_quantity']>1000000 or
        result['adjustment_count']>result['movement_frequency'] or
        not 0<=result['available_quantity']-result['reorder_distance']<=1000000):
        raise ValueError('Inconsistent stock features')
    return result


def feature_payload(value):
    features=validate_features(value)
    return PROTOCOL+'\n'+''.join(name+'='+struct.pack('>d',float(features[name])).hex()+'\n' for name in FEATURES)


def feature_digest(value):
    return hashlib.sha256(feature_payload(value).encode('utf-8')).hexdigest()


def validate_request(value):
    exact(value,('protocol','requestId','inputSha256','features'))
    if value['protocol']!=PROTOCOL or type(value['requestId']) is not str or not UUID.fullmatch(value['requestId']):
        raise ValueError('Invalid stock protocol/request identity')
    features=validate_features(value['features'])
    if type(value['inputSha256']) is not str or value['inputSha256']!=feature_digest(features):
        raise ValueError('Stock feature digest differs')
    return dict(protocol=PROTOCOL,requestId=value['requestId'],inputSha256=value['inputSha256'],features=features)


def versions():
    return dict(python=platform.python_version(),sklearn=metadata.version('scikit-learn'),
                numpy=metadata.version('numpy'),scipy=metadata.version('scipy'),joblib=metadata.version('joblib'))


def source_pins():
    return {name:sha(ROOT/name) for name in SOURCE_FILES}


def reference(path):
    path=Path(path).resolve()
    return dict(path=path.relative_to(ROOT).as_posix(),sha256=sha(path))


def artifact_metadata():
    # Importing the frozen trainer exposes metadata verifiers only. Never invoke
    # its training/evaluation entrypoints or regenerate scientific observations.
    import inventory_simulation_train as training
    development,df,selection=training.validate_development(DEVELOPMENT)
    source,manifest,_=training.source_metadata(SOURCE)
    ef=read_json(EVALUATION/'frozen.json')
    required=dict(protocol=training.PROTOCOL,phase='evaluation',dataset_sha256=training.DATASET_SHA,status='success',
                  versions=versions(),code_pins=training.code_pins(),source_pins=training.data.source_pins(),**training.FLAGS)
    if any(ef.get(k)!=v for k,v in required.items()) or ef.get('artifacts')!=training.inventory(EVALUATION):
        raise StockUnavailable('Frozen stock evaluation identity differs')
    training.verify_claim('evaluation',EVALUATION)
    native=read_json(EVALUATION/'evaluation.result.json')
    if native['status']!='success' or native['elapsed_seconds']!=ef['elapsed_seconds'] or df['elapsed_seconds']+ef['elapsed_seconds']>=900:
        raise StockUnavailable('Stock native experiment evidence differs')
    model=development/'final-RandomForest.joblib'
    receipt=read_json(EVALUATION/'predictions-frozen.json')
    if receipt['models']['RandomForest']!=sha(model) or receipt['sha256']!=sha(EVALUATION/'predictions.json'):
        raise StockUnavailable('Frozen stock prediction receipt differs')
    measured=read_json(EVALUATION/'metrics.json')
    if measured['protocol']!=training.PROTOCOL or measured['dataset_sha256']!=training.DATASET_SHA or any(measured.get(k)!=v for k,v in training.FLAGS.items()):
        raise StockUnavailable('Stock evaluation provenance differs')
    rows,_=training.load_partition(source,'development')
    ranges={name:dict(min=min(r[name] for r in rows),max=max(r[name] for r in rows)) for name in FEATURES}
    rf=measured['models']['RandomForest']
    return dict(schema=SCHEMA,protocol=PROTOCOL,dataset=reference(source/'manifest.json'),
        development=reference(development/'frozen.json'),evaluation=reference(EVALUATION/'frozen.json'),
        model=dict(reference(model),spec=selection['choices']['RandomForest']),versions=versions(),
        features=list(FEATURES),classOrder=list(CLASSES),ranges=ranges,
        metrics=dict(accuracy=rf['accuracy'],criticalRecall=rf['per_class']['Critical Stock Risk']['recall'],
                     observations=measured['observations'],origin='AI-authored synthetic policy'),
        sourcePins=source_pins(),**PROVENANCE)


def prepare_manifest(output):
    output=runtime._validate_output_path(output,ROOT)
    output.parent.mkdir(parents=True,exist_ok=True)
    value=artifact_metadata()
    runtime.write_json_exclusive(output,value)
    return load_manifest(output,sha(output))


def load_manifest(path,expected_sha256):
    try:
        path=runtime._validate_output_path(path,ROOT)
        if type(expected_sha256) is not str or not HASH.fullmatch(expected_sha256) or sha(path)!=expected_sha256:
            raise ValueError('Stock serving manifest pin differs')
        value=read_json(path,65536)
        if value!=artifact_metadata():
            raise ValueError('Stock serving manifest/source differs')
        return Manifest(path,expected_sha256,value)
    except (OSError,ValueError,KeyError,TypeError,runtime.RuntimeSafetyError) as error:
        raise StockUnavailable('Stock model configuration is unavailable') from error


def inference_limits():
    return runtime.Limits(max_wall_seconds=15,max_fit_seconds=15,max_rss_bytes=2*1024**3,
        min_available_bytes=3*1024**3,min_free_disk_bytes=1024**3,max_output_bytes=10*1024**2,threads=2)


def validate_prediction(value,request,manifest):
    try:
        keys=('protocol','requestId','inputSha256','features','classOrder','label','probabilities','model',
              'modelSha256','servingManifestSha256','datasetSha256','developmentSha256','evaluationSha256',
              'processingTimeMs','totalProcessingTimeMs','outOfRange',*PROVENANCE)
        exact(value,keys)
        data=manifest.data
        identities=dict(protocol=PROTOCOL,requestId=request['requestId'],inputSha256=request['inputSha256'],
            features=request['features'],classOrder=list(CLASSES),model='RandomForest',
            modelSha256=data['model']['sha256'],servingManifestSha256=manifest.sha256,
            datasetSha256=data['dataset']['sha256'],developmentSha256=data['development']['sha256'],evaluationSha256=data['evaluation']['sha256'])
        for key,wanted in dict(identities,**PROVENANCE).items():
            # bool is a subclass of int in Python; type must agree for flags.
            if type(value[key]) is not type(wanted) or value[key]!=wanted:
                raise ValueError('Stock response identity differs')
        validate_features(value['features'])
        p=value['probabilities']
        if type(p) is not list or len(p)!=3 or any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1 for v in p) or abs(sum(p)-1)>1e-6:
            raise ValueError('Invalid stock scores')
        index=max((2,0,1),key=lambda i:p[i])
        if value['label']!=CLASSES[index]:raise ValueError('Stock class differs')
        for key,maximum in [('processingTimeMs',15000),('totalProcessingTimeMs',20000)]:
            v=value[key]
            if type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=maximum:
                raise ValueError('Invalid stock timing')
        if value['processingTimeMs']>value['totalProcessingTimeMs']:raise ValueError('Stock timing differs')
        out=[k for k in FEATURES if request['features'][k]<data['ranges'][k]['min'] or request['features'][k]>data['ranges'][k]['max']]
        if value['outOfRange']!=out or type(value['outOfRange']) is not list:raise ValueError('Stock range disclosure differs')
        return value
    except (ValueError,KeyError,TypeError) as error:
        raise StockUnavailable('Stock inference response is unavailable') from error


def infer(manifest,request,output):
    runtime.require_supervised_worker()
    began=time.perf_counter()
    manifest=load_manifest(manifest.path,manifest.sha256)
    request=validate_request(request)
    runtime._validate_output_path(output,ROOT)
    data=manifest.data
    model_path=runtime._validate_output_path(ROOT/data['model']['path'],ROOT)
    if model_path.stat().st_size>10*1024**2:
        raise StockUnavailable('Stock model bytes are unavailable')
    # Hash and deserialize the SAME byte buffer, avoiding path replacement
    # between hash verification and pickle loading.
    blob=model_path.read_bytes()
    if hashlib.sha256(blob).hexdigest()!=data['model']['sha256']:
        raise StockUnavailable('Stock model bytes differ')
    import joblib
    import numpy as np
    from threadpoolctl import threadpool_limits
    import inventory_simulation_train as training
    model=joblib.load(io.BytesIO(blob))
    if (model.get_params()!=training.estimator(data['model']['spec']).get_params() or
        list(model.classes_)!=sorted(CLASSES) or model.n_features_in_!=len(FEATURES)):
        raise StockUnavailable('Stock model class/parameter schema differs')
    values=request['features'];row=[[values[name] for name in FEATURES]]
    with threadpool_limits(limits=2):
        start=time.perf_counter();raw=model.predict_proba(row)[0];duration=(time.perf_counter()-start)*1000
    if len(raw)!=3 or not np.isfinite(raw).all() or (raw<0).any() or (raw>1).any() or abs(float(raw.sum())-1)>1e-6:
        raise StockUnavailable('Invalid stock model scores')
    probabilities=[float(raw[list(model.classes_).index(label)]) for label in CLASSES]
    label=str(model.classes_[int(np.argmax(raw))])
    out=[name for name in FEATURES if values[name]<data['ranges'][name]['min'] or values[name]>data['ranges'][name]['max']]
    return dict(protocol=PROTOCOL,requestId=request['requestId'],inputSha256=request['inputSha256'],features=values,
        classOrder=list(CLASSES),label=label,probabilities=probabilities,model='RandomForest',modelSha256=data['model']['sha256'],
        servingManifestSha256=manifest.sha256,datasetSha256=data['dataset']['sha256'],developmentSha256=data['development']['sha256'],
        evaluationSha256=data['evaluation']['sha256'],processingTimeMs=duration,
        totalProcessingTimeMs=(time.perf_counter()-began)*1000,outOfRange=out,**PROVENANCE)


def _confirm_stock_tree(job,worker,assigned):
    """Confirm native process signals AND empty Job membership before reuse.

    TerminateJobObject requests asynchronous termination. Keep its handle open
    until every observed member has signalled; an unknown outcome quarantines
    this executor instead of reopening admission. This does not alter the
    source-pinned training supervisor.
    """
    if os.name!='nt':return False
    from ctypes import wintypes as w
    kernel=job.kernel;handles={};deadline=time.monotonic()+3
    kernel.OpenProcess.argtypes=[w.DWORD,w.BOOL,w.DWORD];kernel.OpenProcess.restype=w.HANDLE
    kernel.WaitForSingleObject.argtypes=[w.HANDLE,w.DWORD];kernel.WaitForSingleObject.restype=w.DWORD
    kernel.IsProcessInJob.argtypes=[w.HANDLE,w.HANDLE,ctypes.POINTER(w.BOOL)]
    def capture():
        members=job.pids()
        for pid in members:
            if time.monotonic()>=deadline:raise TimeoutError('Stock cleanup confirmation deadline')
            if pid in handles:continue
            handle=kernel.OpenProcess(0x100000|0x1000,False,pid)
            if not handle:
                if ctypes.get_last_error()==87:continue # Exited after membership snapshot.
                raise ctypes.WinError(ctypes.get_last_error())
            member=w.BOOL()
            if not kernel.IsProcessInJob(handle,job.handle,ctypes.byref(member)):
                kernel.CloseHandle(handle);raise ctypes.WinError(ctypes.get_last_error())
            if member.value:handles[pid]=handle
            else:kernel.CloseHandle(handle) # A reused PID is never treated as owned.
        return members
    try:
        capture();job.terminate()
        if worker is not None and not assigned:
            worker.kill();worker.wait(timeout=max(.001,deadline-time.monotonic()))
        while True:
            members=capture();states=[kernel.WaitForSingleObject(handle,0) for handle in handles.values()]
            if any(state not in (0,0x102) for state in states):return False
            if not members and all(state==0 for state in states) and (worker is None or worker.poll() is not None):return True
            if time.monotonic()>=deadline:return False
            time.sleep(.01)
    finally:
        for handle in handles.values():kernel.CloseHandle(handle)


class _StockSupervisor(runtime.ResourceSupervisor):
    def __init__(self,directory,limits,root):
        self.stock_root=root
        self.cleanup_confirmed=True
        super().__init__(directory,limits)

    def preflight(self,*args,**kwargs):
        result=super().preflight(*args,**kwargs)
        if runtime._output_bytes(self.stock_root)>TOTAL_OUTPUT_BYTES:
            raise runtime.RuntimeSafetyError('total_output_limit')
        return result

    def run(self,command,*,fit_id,cwd=None):
        # Stock-specific lifecycle: reuse the unchanged native Job, monitor and
        # limits, with a confirmed drain rather than the training runner's
        # terminate-and-close finalizer.
        if self.failed or fit_id in self.attempted or fit_id!='inference':raise runtime.RuntimeSafetyError('Failed/repeated stock execution forbidden')
        self.attempted.add(fit_id);began=time.monotonic();peak=0;reason=None;worker=None;job=None;assigned=False
        env=os.environ.copy()
        for key in ['OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS','VECLIB_MAXIMUM_THREADS','NUMEXPR_NUM_THREADS','BLIS_NUM_THREADS']:env[key]=str(self.limits.threads)
        try:
            self.preflight();job=runtime._ProcessJob();self._job=job;self.cleanup_confirmed=False;env['IILAS_RUNNER_JOB']=job.name
            with open(self.output_dir/(fit_id+'.stdout.log'),'xb') as stdout,open(self.output_dir/(fit_id+'.stderr.log'),'xb') as stderr:
                worker=runtime.subprocess.Popen(command,cwd=cwd or self.output_dir,env=env,stdout=stdout,stderr=stderr,creationflags=4)
                job.assign(worker);assigned=True;job.resume(worker)
                while True:
                    snap=self.preflight(required_available_bytes=self.limits.available_floor_bytes);peak=max(peak,snap['rss_bytes'])
                    if time.monotonic()-began>self.limits.max_fit_seconds:raise runtime.RuntimeSafetyError('fit_timeout')
                    if worker.poll() is not None:break
                    time.sleep(self.limits.poll_seconds)
                if worker.returncode!=0:reason='worker_exit'
        except Exception as error:
            if self.last_snapshot:peak=max(peak,self.last_snapshot['rss_bytes'])
            reason=str(error)
        finally:
            if job:
                try:self.cleanup_confirmed=bool(_confirm_stock_tree(job,worker,assigned))
                except Exception:self.cleanup_confirmed=False
                if self.cleanup_confirmed:
                    try:job.close();self._job=None
                    except Exception:self.cleanup_confirmed=False
                if not self.cleanup_confirmed:
                    reason='cleanup_unconfirmed'
                    # Keep the Job handle alive and make a best-effort kill;
                    # its executor remains quarantined until service restart.
                    try:job.terminate()
                    except Exception:pass
        result=dict(status='failed' if reason else 'success',reason=reason,returncode=worker.returncode if worker else None,elapsed_seconds=time.monotonic()-began,peak_rss_bytes=peak,last_snapshot=self.last_snapshot,cleanup_confirmed=self.cleanup_confirmed)
        self.failed=bool(reason);runtime.write_json_exclusive(self.output_dir/(fit_id+'.result.json'),result)
        return result


class StockExecutor:
    def __init__(self,manifest,output_root=None,*,_command=None,_supervisor=None):
        self.manifest=manifest
        self.output_root=Path(output_root or ROOT/'research/datasets/inventory-serving-v1/requests')
        self._lock=threading.Lock()
        self._command=_command
        self._supervisor=_supervisor or _StockSupervisor
        self._cleanup_failed=False
        self._quarantined_supervisor=None

    @property
    def unavailable(self):
        return self._cleanup_failed

    @property
    def busy(self):
        return self._lock.locked()

    def run(self,request):
        request=validate_request(request)
        if self._cleanup_failed:raise StockUnavailable('Stock executor requires restart after unconfirmed native cleanup')
        if not self._lock.acquire(blocking=False):
            raise StockBusy('Stock inference is busy')
        began=time.perf_counter();supervisor=None
        try:
            # A caller can pass the fast check while another request finishes.
            # Recheck quarantine under the acquired admission lock as well.
            if self._cleanup_failed:raise StockUnavailable('Stock executor requires restart after unconfirmed native cleanup')
            manifest=load_manifest(self.manifest.path,self.manifest.sha256)
            root=runtime._validate_output_path(self.output_root,ROOT)
            root.mkdir(parents=True,exist_ok=True)
            if runtime._output_bytes(root)>=TOTAL_OUTPUT_BYTES:
                raise StockUnavailable('Stock inference output limit reached')
            output=runtime.create_run_directory(root/str(uuid4()),ROOT)
            supervisor=self._supervisor(output,inference_limits(),root)
            supervisor.preflight()
            runtime.write_json_exclusive(output/'request.json',request)
            command=(self._command(output,request) if self._command else [sys.executable,str(Path(__file__).resolve()),'_worker',
                '--manifest',str(manifest.path),'--manifest-sha256',manifest.sha256,'--request',str(output/'request.json'),'--output',str(output)])
            result=supervisor.run(command,fit_id='inference',cwd=ROOT)
            if result['status']!='success':
                raise StockUnavailable('Stock native inference is unavailable')
            supervisor.preflight(required_available_bytes=0)
            response=validate_prediction(read_json(output/'prediction.json',65536),request,manifest)
            response['totalProcessingTimeMs']=(time.perf_counter()-began)*1000
            if response['totalProcessingTimeMs']>20000:
                raise StockUnavailable('Stock inference deadline exceeded')
            return validate_prediction(response,request,manifest)
        except (OSError,ValueError,KeyError,TypeError,runtime.RuntimeSafetyError) as error:
            raise StockUnavailable('Stock local inference is unavailable') from error
        finally:
            if supervisor is not None and not getattr(supervisor,'cleanup_confirmed',True):
                self._cleanup_failed=True;self._quarantined_supervisor=supervisor
            self._lock.release()


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['_worker'])
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--manifest-sha256',required=True)
    parser.add_argument('--request',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(argv)
    runtime.require_supervised_worker()
    request_path=runtime._validate_output_path(args.request,ROOT)
    output=runtime._validate_output_path(args.output,ROOT)
    if request_path.parent!=output or request_path.name!='request.json':
        raise StockUnavailable('Stock worker input directory differs')
    manifest=load_manifest(args.manifest,args.manifest_sha256)
    prediction=infer(manifest,read_json(request_path,4096),output)
    runtime.write_json_exclusive(output/'prediction.json',prediction)


if __name__=='__main__':main()
