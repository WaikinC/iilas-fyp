"""Closed serving contract for the frozen context RF; no training or test replay."""
import hashlib
import math
import re
import struct
from dataclasses import dataclass
from importlib import metadata
import json
import os
from pathlib import Path
import platform
import io
import time
import threading
import sys
import argparse
from uuid import uuid4

import runner_runtime as runtime
from inventory_context_runtime import measure_output_bytes

PROTOCOL='inventory-context-inference-2.0'
SCHEMA='inventory-context-local-serving-2.0'
FEATURES=('available_quantity','reserved_quantity','movement_frequency','reorder_distance',
    'adjustment_count','days_since_replenishment','additional_firm_quantity','additional_due_days',
    'incoming_quantity','incoming_eta_days','supply_none','supply_planned','supply_confirmed','supply_disrupted')
CLASSES=('Normal','Reorder Risk','Critical Stock Risk')
PROVENANCE=dict(evaluationKind='synthetic-stock-context-prototype',origin='simulated-manual',
    evaluationOnly=True,operationally_approved=False,independentAccuracyValidated=False,
    acceptanceSha256=None,humanReviewRequired=True)
STATES=('none','planned','confirmed','disrupted')
DAYS=frozenset(('days_since_replenishment','additional_due_days','incoming_eta_days'))
UUID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\Z')
HASH=re.compile(r'[0-9a-f]{64}\Z')
ROOT=Path(__file__).resolve().parents[1]
DATA_REL='research/datasets/inventory-simulation-v2'
SERVING_REL='research/datasets/inventory-context-serving-v2'
MAX_JSON=8*1024**2
MAX_MODEL=10*1024**2
MAX_MANIFEST=64*1024
MODEL_SPEC=dict(arm='RF14',depth=12,features='context',leaf=2)
# These identities name the consumed study. Integration cannot select or replace it.
FROZEN_HASHES={
 'main-01/manifest.json':'06b22b1c46e4d0c6dba6439abe4a00363c36be4424062fa678b5a34efd84d414',
 'development-01/final-RF14.joblib':'43b5641f6cd6cb045fd6f9ff06463f2e51c9dc759b84dbfa25b041a3942850d0',
 'development-01/development.json':'0f86cc4f9751f69618c97d8b7e768f0482b079fd0c18a65df7d2c85b18cc834e',
 'evaluation-01/evaluation.json':'aaddf205d243c7481e9fbd602832c3cbc8df682e6d4a2a17bbc0629258b67fd6',
 'registry/context-v2-main-01-preparation-complete.json':'99af6cd8d7541488295709a7fca16be0fee8182a944dfecf6742816649534ec2',
 'registry/context-v2-main-01-development-complete.json':'0eb1350894bd9d4b4f66364d6dd98755cfd0af455b5dcc8cedb2b6c9cfa440cc',
 'registry/context-v2-main-01-evaluation-complete.json':'846a30cf4a301fd695e6dd9dab17c6575b61cee7050239dbb91d969223aa4a5a',
}
SOURCE_FILES=('research/inventory_context_inference.py', 'research/serve_inventory_context_local_eval.py', 'research/runner_runtime.py', 'research/inventory_inference.py', 'lib/inventoryAI.js', 'backend/functions/inventoryAI.js', 'lib/inventoryContextAI.js', 'backend/functions/inventoryContextAI.js', 'backend/functions/inventoryContextAI.mjs', 'backend/functions/inventoryAI.mjs', 'backend/functions/service.mjs', 'lib/inventoryContextAIClient.js', 'lib/inventoryAIClient.js', 'src/features/stock/InventoryAIExperiment.tsx', 'src/features/stock/InventoryRisk.tsx', 'backend/functions/inventoryExperimentLifecycle.mjs', 'backend/functions/inventoryDemoProductAI.mjs', 'lib/inventoryStockAIClient.js', 'src/features/stock/StockManagement.tsx', 'scripts/prepare-inventory-ai-local.mjs', 'lib/inventoryDemoReorder.js', 'backend/functions/inventoryDemoReorder.js', 'backend/functions/inventoryDemoProductFacts.mjs', 'backend/functions/inventoryDemoReorder.mjs', 'lib/inventoryDemoReorderClient.js', 'src/features/stock/InventoryDemoReorder.tsx', 'src/features/operations/Procurement.tsx', 'lib/inventoryDemoProcurement.js', 'backend/functions/inventoryDemoProcurement.js', 'backend/functions/inventoryDemoProcurement.mjs', 'backend/functions/purchaseOrderWorkflow.mjs', 'lib/inventoryDemoProcurementClient.js', 'src/features/operations/InventoryDemoProcurement.tsx', 'lib/procurementValidation.js', 'backend/functions/procurementValidation.js', 'lib/locationStock.js', 'backend/functions/locationStock.js', 'backend/functions/access.mjs', 'src/features/stock/stock.css', 'research/inventory_context_runtime.py', 'lib/accountRoles.js', 'backend/functions/accountRoles.js', 'lib/completionWorkflow.js', 'backend/functions/completionWorkflow.js', 'lib/completionClient.js', 'backend/functions/completionOperations.mjs', 'lib/integrityWorkflow.js', 'backend/functions/integrityWorkflow.js', 'backend/functions/integrityWorkflow.mjs', 'backend/functions/integritySource.mjs', 'lib/integrityRegistrationClient.js', 'src/features/operations/IntegrityVerification.tsx', 'lib/transportPlanning.js', 'backend/functions/transportPlanning.js', 'backend/functions/fleetTransport.mjs', 'src/features/operations/operationsData.tsx', 'src/features/operations/FleetManagement.tsx', 'src/features/operations/TransportManagement.tsx', 'src/features/operations/TransportPlanningMap.tsx', 'backend/functions/customerAccess.mjs', 'backend/functions/customerEvidence.mjs', 'lib/customerPortal.js', 'src/features/customer/CustomerPortal.tsx', 'src/features/customer/customer.css', 'src/features/operations/CustomerShipmentAccess.tsx', 'src/features/workspace/WorkspaceGate.tsx', 'src/features/workspace/AdminPanel.tsx', 'lib/reporting.js', 'backend/functions/reporting.js', 'backend/functions/reporting.mjs', 'lib/catalogueFilters.js', 'src/features/operations/ReportExplorer.tsx', 'src/features/operations/ReportsWorkspace.tsx', 'src/features/operations/ResearchVerification.tsx', 'src/features/operations/Operations.tsx', 'src/features/operations/operations.css', 'app/page.tsx', 'backend/functions/index.mjs', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'scripts/prepare-functions.mjs', 'scripts/prepare-fyp-completion-local.mjs', 'lib/reportResponse.js', 'src/features/operations/EvidenceFileComparison.tsx', 'lib/mobileDelivery.js', 'backend/functions/mobileDelivery.js', 'backend/functions/mobileDelivery.mjs', 'backend/functions/mobileEvidence.mjs', 'backend/functions/deliveryWorkflow.mjs', 'backend/functions/evidenceRegistration.mjs', 'lib/demoEnvironment.js', 'backend/functions/demoEnvironment.js', 'backend/functions/demoEnvironment.mjs', 'lib/hybridGateway.js', 'backend/functions/hybridGateway.js', 'backend/functions/hybridGateway.mjs', 'backend/functions/hybridSigning.mjs', 'backend/functions/hybridModelBinding.mjs', 'lib/firebaseRuntime.js', 'lib/firebase.js', 'lib/workspace.js', 'tools/msi-gateway/models.mjs', 'tools/msi-gateway/authentication.mjs', 'tools/msi-gateway/server.mjs', 'backend/functions/hybridIntegrity.mjs', 'src/main.tsx', 'tools/msi-gateway/integrity.mjs', 'tools/msi-gateway/launch.mjs')

class StockUnavailable(RuntimeError):pass
class StockBusy(StockUnavailable):pass

@dataclass(frozen=True)
class Manifest:
    path:Path
    sha256:str
    data:dict

def exact(value,keys):
    if type(value) is not dict or set(value)!=set(keys):raise ValueError('Invalid context stock fields')

def validate_features(value):
    exact(value,FEATURES)
    f={}
    for key in FEATURES:
        v=value[key]
        low=-1000000 if key=='reorder_distance' else 0
        high=36500 if key in DAYS else 1 if key.startswith('supply_') else 2000 if key in ('movement_frequency','adjustment_count') else 1000000
        if type(v) not in (int,float) or not low<=v<=high or not math.isfinite(v):raise ValueError('Invalid context feature units or bounds')
        if key not in DAYS and int(v)!=v:raise ValueError('Integral context quantity or count required')
        f[key]=0 if v==0 else v
    if f['available_quantity']+f['reserved_quantity']>1000000 or f['adjustment_count']>f['movement_frequency'] or not 0<=f['available_quantity']-f['reorder_distance']<=1000000:
        raise ValueError('Inconsistent stock feature totals')
    if sum(f['supply_'+state] for state in STATES)!=1:raise ValueError('Exactly one supply state required')
    if f['additional_firm_quantity']==0 and f['additional_due_days']!=0:raise ValueError('Absent demand has no encoded deadline')
    if f['supply_none']==1:
        if f['incoming_quantity']!=0 or f['incoming_eta_days']!=0:raise ValueError('Absent supply has no batch facts')
    elif f['incoming_quantity']==0:raise ValueError('Stated supply requires positive batch quantity')
    return f

def feature_payload(value):
    f=validate_features(value)
    return PROTOCOL+'\n'+''.join(k+'='+struct.pack('>d',float(f[k])).hex()+'\n' for k in FEATURES)

def feature_digest(value):return hashlib.sha256(feature_payload(value).encode('utf-8')).hexdigest()

def validate_request(value):
    exact(value,('protocol','requestId','inputSha256','features'))
    if value['protocol']!=PROTOCOL or type(value['requestId']) is not str or not UUID.fullmatch(value['requestId']):raise ValueError('Invalid context request identity')
    f=validate_features(value['features'])
    if type(value['inputSha256']) is not str or value['inputSha256']!=feature_digest(f):raise ValueError('Context feature digest differs')
    return dict(protocol=PROTOCOL,requestId=value['requestId'],inputSha256=value['inputSha256'],features=f)

def safe_path(value,*,serving=False,existing=True):
    raw=Path(value)
    if '..' in raw.parts or any(ord(c)<32 for c in str(raw)):raise ValueError('Unsafe context artifact path')
    path=raw if raw.is_absolute() else ROOT/raw
    base=ROOT/SERVING_REL if serving else ROOT
    if not path.is_relative_to(base) or path==base:raise ValueError('Context artifact outside allowed root')
    for p in (path,*path.parents):
        if p.is_symlink() or p.is_junction():raise ValueError('Linked context artifact refused')
        if p.exists() and p.is_file() and p.stat().st_nlink!=1:raise ValueError('Hardlinked context artifact refused')
    if existing and not path.is_file():raise ValueError('Required context artifact missing')
    return path

def read_bytes(path,limit=MAX_JSON):
    path=safe_path(path)
    if not 0<path.stat().st_size<=limit:raise ValueError('Context artifact size is invalid')
    with path.open('rb') as stream:blob=stream.read(limit+1)
    if not 0<len(blob)<=limit:raise ValueError('Context artifact grew beyond its limit')
    return blob

def decode_json(blob):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result:raise ValueError('Duplicate context JSON key')
            result[key]=value
        return result
    def invalid(_):raise ValueError('Nonfinite context JSON')
    return json.loads(blob,object_pairs_hook=pairs,parse_constant=invalid)

def read_json(path,limit=MAX_JSON):return decode_json(read_bytes(path,limit))
def digest(blob):return hashlib.sha256(blob).hexdigest()
def versions():return {'python':platform.python_version(),**{k:metadata.version(k) for k in ('scikit-learn','numpy','scipy','joblib','threadpoolctl')}}
def scientific_basis():
    import inventory_context_artifacts as artifacts
    return artifacts.basis()

def _reference(relative):
    return dict(path=f'{DATA_REL}/{relative}',sha256=FROZEN_HASHES[relative])

def _snapshot():
    """Bounded saved metadata, never raw TEST, training, or deserialization."""
    values={}
    for relative,pin in FROZEN_HASHES.items():
        blob=read_bytes(ROOT/DATA_REL/relative,MAX_MODEL if relative.endswith('.joblib') else MAX_JSON)
        if digest(blob)!=pin:raise ValueError('Frozen context artifact identity differs')
        if relative.endswith('.json'):values[relative]=decode_json(blob)
    source=values['main-01/manifest.json'];dev=values['development-01/development.json'];evaluation=values['evaluation-01/evaluation.json']
    basis=scientific_basis()
    if source['basis']!=basis or dev['basis']!=basis or basis['versions']!=versions() or basis['features14']!=list(FEATURES):raise ValueError('Context scientific basis differs')
    for phase in ('preparation','development','evaluation'):
        completion=values[f'registry/context-v2-main-01-{phase}-complete.json'];native=completion['receipt']['native']
        if completion['phase']!=phase or native['status']!='success' or type(native['returncode']) is not int or native['returncode']!=0 or native['cleanup_confirmed'] is not True:raise ValueError('Incomplete context scientific phase')
    dc=values['registry/context-v2-main-01-development-complete.json']
    ec=values['registry/context-v2-main-01-evaluation-complete.json']
    for completion,name in ((dc,'development.json'),(ec,'evaluation.json')):
        prefix='development-01' if name=='development.json' else 'evaluation-01'
        if completion['files'][name]!=FROZEN_HASHES[prefix+'/'+name]:raise ValueError('Phase metadata binding differs')
    if dc['files']['final-RF14.joblib']!=FROZEN_HASHES['development-01/final-RF14.joblib'] or dev['selected']['RF14']!=MODEL_SPEC:raise ValueError('Selected context RF differs')
    # This saved final development job contains only development rows. It pins
    # ranges cheaply without replaying every ledger/fit on a serving request.
    job_blob=read_bytes(ROOT/DATA_REL/'development-01/final-RF14.job.json')
    if digest(job_blob)!=dc['files']['final-RF14.job.json']:raise ValueError('Context development range source differs')
    job=decode_json(job_blob)
    if job['spec']!=MODEL_SPEC or job['features']!=list(FEATURES) or type(job['x_train']) is not list or not job['x_train']:raise ValueError('Context range source schema differs')
    rows=[]
    for row in job['x_train']:
        if type(row) is not list or len(row)!=len(FEATURES):raise ValueError('Context range row differs')
        rows.append(validate_features(dict(zip(FEATURES,row))))
    ranges={k:dict(min=min(row[k] for row in rows),max=max(row[k] for row in rows)) for k in FEATURES}
    if evaluation['rows']!=720 or evaluation['families']!=60:raise ValueError('Context evaluation cohort differs')
    rf=evaluation['metrics']['RF14'];critical=rf['per_class']['Critical Stock Risk']
    metrics=dict(accuracy=rf['accuracy'],macroF1=rf['macro_f1'],criticalPrecision=critical['precision'],criticalRecall=critical['recall'],observations=720,families=60,accuracyInterval=evaluation['bootstrap']['intervals']['RF14']['accuracy'],origin='AI-authored synthetic policy')
    return dict(schema=SCHEMA,protocol=PROTOCOL,dataset=_reference('main-01/manifest.json'),
        development=_reference('registry/context-v2-main-01-development-complete.json'),
        evaluation=_reference('registry/context-v2-main-01-evaluation-complete.json'),
        model=dict(_reference('development-01/final-RF14.joblib'),spec=dict(MODEL_SPEC)),
        versions=versions(),features=list(FEATURES),classOrder=list(CLASSES),ranges=ranges,
        metrics=metrics,scientificBasis=basis,sourcePins={name:digest(read_bytes(ROOT/name)) for name in SOURCE_FILES},**PROVENANCE)

def audit_development():
    """One preparation-time audit of saved evidence; does not release TEST."""
    import inventory_context_artifacts as a
    import inventory_context_train as train
    for phase in ('preparation','development','evaluation'):
        a.completion(phase) # Verifies original consumed claim binding.
    checked=train.validate_development(ROOT/DATA_REL/'development-01',FROZEN_HASHES['main-01/manifest.json'])
    if checked['fits']!=52 or checked['selected']['RF14']!=MODEL_SPEC:raise ValueError('Development evidence does not select frozen RF14')
    # The completion inventory hashes previously recorded evaluation output;
    # this does not recompute metrics or load the held-out source observations.
    for phase,folder in [('development','development-01'),('evaluation','evaluation-01')]:
        completion=read_json(ROOT/DATA_REL/f'registry/context-v2-main-01-{phase}-complete.json')
        for relative,pin in completion['files'].items():
            path=safe_path(ROOT/DATA_REL/folder/relative)
            # Completed stdout/stderr can be empty; hash them without JSON parsing.
            if path.stat().st_size==0:actual=digest(b'')
            else:actual=digest(read_bytes(path,MAX_MODEL if relative.endswith('.joblib') else MAX_JSON))
            if actual!=pin:raise ValueError('Frozen scientific inventory changed')

def prepare_manifest(output):
    try:
        path=safe_path(output,serving=True,existing=False)
        if path.exists():raise FileExistsError('Context serving metadata is immutable')
        value=_snapshot();audit_development()
        blob=json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')
        if len(blob)>MAX_MANIFEST:raise ValueError('Context serving metadata exceeds cap')
        path.parent.mkdir(parents=True,exist_ok=True)
        safe_path(path,serving=True,existing=False)
        with path.open('xb') as stream:stream.write(blob);stream.flush();os.fsync(stream.fileno())
        return load_manifest(path,digest(blob))
    except (OSError,ValueError,KeyError,TypeError) as error:raise StockUnavailable('Context serving metadata preparation is unavailable') from error

def load_manifest(path,expected_sha256):
    try:
        path=safe_path(path,serving=True)
        if type(expected_sha256) is not str or not HASH.fullmatch(expected_sha256):raise ValueError('Invalid context manifest hash')
        blob=read_bytes(path,MAX_MANIFEST)
        if digest(blob)!=expected_sha256:raise ValueError('Context serving manifest pin differs')
        value=decode_json(blob)
        # JSON comparison keeps booleans distinct from integers (False != 0 on
        # the wire), unlike Python's ordinary nested dictionary equality.
        if json.dumps(value,sort_keys=True,allow_nan=False)!=json.dumps(_snapshot(),sort_keys=True,allow_nan=False):raise ValueError('Context source-bound metadata differs')
        return Manifest(path,expected_sha256,value)
    except (OSError,ValueError,KeyError,TypeError) as error:raise StockUnavailable('Context model configuration is unavailable') from error

def validate_prediction(value,request,manifest):
    try:
        request=validate_request(request);data=manifest.data
        expected=dict(protocol=PROTOCOL,requestId=request['requestId'],inputSha256=request['inputSha256'],features=request['features'],classOrder=list(CLASSES),model='RandomForest',modelSha256=data['model']['sha256'],servingManifestSha256=manifest.sha256,**{k+'Sha256':data[k]['sha256'] for k in ('dataset','development','evaluation')},**PROVENANCE)
        exact(value,(*expected,'label','probabilities','processingTimeMs','totalProcessingTimeMs','outOfRange'))
        for k,v in expected.items():
            if type(value[k]) is not type(v) or value[k]!=v:raise ValueError('Context response binding differs')
        validate_features(value['features'])
        p=value['probabilities']
        if type(p) is not list or len(p)!=3 or any(type(v) not in (int,float) or not 0<=v<=1 or not math.isfinite(v) for v in p) or abs(sum(p)-1)>1e-6:raise ValueError('Invalid context scores')
        if value['label']!=CLASSES[max((2,0,1),key=lambda i:p[i])]:raise ValueError('Context score/label mismatch')
        for key,cap in [('processingTimeMs',15000),('totalProcessingTimeMs',20000)]:
            v=value[key]
            if type(v) not in (int,float) or not 0<=v<=cap or not math.isfinite(v):raise ValueError('Invalid context timing')
        if value['processingTimeMs']>value['totalProcessingTimeMs']:raise ValueError('Context timing order differs')
        outside=[k for k in FEATURES if request['features'][k]<data['ranges'][k]['min'] or request['features'][k]>data['ranges'][k]['max']]
        if type(value['outOfRange']) is not list or value['outOfRange']!=outside:raise ValueError('Context development range warnings differ')
        return value
    except (ValueError,KeyError,TypeError) as error:raise StockUnavailable('Context inference response is unavailable') from error

def infer(manifest,request,output):
    runtime.require_supervised_worker()
    began=time.perf_counter()
    manifest=load_manifest(manifest.path,manifest.sha256)
    request=validate_request(request)
    target=safe_path(output,serving=True,existing=False)
    if target.exists():raise StockUnavailable('Context output already exists')
    data=manifest.data
    blob=read_bytes(ROOT/data['model']['path'],MAX_MODEL)
    if digest(blob)!=data['model']['sha256']:raise StockUnavailable('Frozen context model bytes differ')
    import joblib
    import numpy as np
    from sklearn.ensemble import RandomForestClassifier
    from threadpoolctl import threadpool_limits
    # Only the admitted native worker loads this verified buffer, never an
    # arbitrary uploaded/path-substituted pickle or a later second file read.
    model=joblib.load(io.BytesIO(blob))
    expected=RandomForestClassifier(n_estimators=100,max_depth=12,min_samples_leaf=2,class_weight='balanced',random_state=42,n_jobs=2)
    if type(model) is not RandomForestClassifier or model.get_params()!=expected.get_params() or getattr(model,'n_features_in_',None)!=14 or list(getattr(model,'classes_',[]))!=sorted(CLASSES):raise StockUnavailable('Frozen context estimator schema differs')
    f=request['features']
    with threadpool_limits(limits=2):
        start=time.perf_counter()
        raw=model.predict_proba([[f[k] for k in FEATURES]])[0]
        prediction_ms=(time.perf_counter()-start)*1000
    if len(raw)!=3 or not np.isfinite(raw).all() or (raw<0).any() or (raw>1).any() or abs(float(raw.sum())-1)>1e-6:raise StockUnavailable('Invalid context estimator scores')
    probabilities=[float(raw[list(model.classes_).index(label)]) for label in CLASSES]
    result=dict(request,classOrder=list(CLASSES),label=str(model.classes_[int(np.argmax(raw))]),probabilities=probabilities,model='RandomForest',
        modelSha256=data['model']['sha256'],servingManifestSha256=manifest.sha256,
        **{k+'Sha256':data[k]['sha256'] for k in ('dataset','development','evaluation')},
        processingTimeMs=prediction_ms,totalProcessingTimeMs=(time.perf_counter()-began)*1000,
        outOfRange=[k for k in FEATURES if f[k]<data['ranges'][k]['min'] or f[k]>data['ranges'][k]['max']],**PROVENANCE)
    return validate_prediction(result,request,manifest)

TOTAL_OUTPUT_BYTES=100*1024**2

def inference_limits():
    return runtime.Limits(max_wall_seconds=15,max_fit_seconds=15,max_rss_bytes=2*1024**3,
        min_available_bytes=3*1024**3,min_free_disk_bytes=1024**3,max_output_bytes=10*1024**2,poll_seconds=.1,threads=2)

class ContextExecutor:
    def __init__(self,manifest,output_root=None,*,_command=None,_supervisor=None):
        # Reuse the unchanged, verified native Job lifecycle, including its
        # separate three-second drain. Scientific sources stay immutable.
        from inventory_context_runtime import ContextServingSupervisor
        self.manifest=manifest
        self.output_root=Path(output_root or ROOT/SERVING_REL/'requests')
        self._command=_command;self._supervisor=_supervisor or ContextServingSupervisor
        self._lock=threading.Lock();self._cleanup_failed=False;self._quarantined_supervisor=None
    @property
    def busy(self):return self._lock.locked()
    @property
    def unavailable(self):return self._cleanup_failed
    def run(self,request):
        request=validate_request(request)
        if self.unavailable:raise StockUnavailable('Context executor needs confirmed native cleanup')
        if not self._lock.acquire(blocking=False):raise StockBusy('Context model is busy')
        supervisor=None;began=time.perf_counter()
        try:
            if self.unavailable:raise StockUnavailable('Context executor is quarantined')
            manifest=load_manifest(self.manifest.path,self.manifest.sha256)
            root=safe_path(self.output_root,serving=True,existing=False);root.mkdir(parents=True,exist_ok=True)
            if measure_output_bytes(ROOT/SERVING_REL)+inference_limits().max_output_bytes>TOTAL_OUTPUT_BYTES:raise StockUnavailable('Context serving evidence capacity reached')
            output=runtime.create_run_directory(root/str(uuid4()),ROOT)
            supervisor=self._supervisor(output,inference_limits(),ROOT/SERVING_REL);supervisor.preflight()
            request_path=output/'request.json';runtime.write_json_exclusive(request_path,request)
            command=self._command(output,request) if self._command else [sys.executable,str(Path(__file__).resolve()),'_worker','--manifest',str(manifest.path),'--manifest-sha256',manifest.sha256,'--request',str(request_path),'--request-sha256',digest(read_bytes(request_path,4096)),'--output',str(output)]
            result=supervisor.run(command,fit_id='inference',cwd=ROOT)
            if result['status']!='success' or not supervisor.cleanup_confirmed:raise StockUnavailable('Context native inference unavailable')
            supervisor.preflight(required_available_bytes=0)
            manifest=load_manifest(manifest.path,manifest.sha256)
            response=validate_prediction(read_json(output/'prediction.json',MAX_MANIFEST),request,manifest)
            response['totalProcessingTimeMs']=(time.perf_counter()-began)*1000
            return validate_prediction(response,request,manifest)
        except (OSError,ValueError,KeyError,TypeError,runtime.RuntimeSafetyError) as error:raise StockUnavailable('Context local inference is unavailable') from error
        finally:
            if supervisor is not None and not getattr(supervisor,'cleanup_confirmed',True):
                self._cleanup_failed=True;self._quarantined_supervisor=supervisor
            self._lock.release()

def prepare_supervised(output):
    """The public preparation command keeps the deep audit in a bounded Job."""
    from inventory_inference import _StockSupervisor
    target=safe_path(output,serving=True,existing=False)
    if target.exists():raise StockUnavailable('Context serving manifest already exists')
    root=ROOT/SERVING_REL;root.mkdir(parents=True,exist_ok=True)
    if runtime._output_bytes(root)+10*1024**2>TOTAL_OUTPUT_BYTES:raise StockUnavailable('Context serving evidence capacity reached')
    run=runtime.create_run_directory(root/'metadata-checks'/str(uuid4()),ROOT)
    limits=runtime.Limits(max_wall_seconds=120,max_fit_seconds=120,max_rss_bytes=2*1024**3,min_available_bytes=3*1024**3,min_free_disk_bytes=1024**3,max_output_bytes=10*1024**2,poll_seconds=.1,threads=2)
    supervisor=_StockSupervisor(run,limits,root)
    request=run/'request.json';runtime.write_json_exclusive(request,dict(output=str(target)))
    result=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_prepare','--request',str(request),'--request-sha256',digest(read_bytes(request,4096)),'--output',str(run)],fit_id='inference',cwd=ROOT)
    if result['status']!='success' or not supervisor.cleanup_confirmed:raise StockUnavailable('Context metadata audit failed; inspect retained evidence')
    receipt=read_json(run/'prepared.json',4096)
    if receipt['path']!=str(target):raise StockUnavailable('Context preparation target differs')
    return load_manifest(target,receipt['sha256'])

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['_worker','_prepare'])
    parser.add_argument('--manifest',type=Path);parser.add_argument('--manifest-sha256')
    parser.add_argument('--request',type=Path,required=True);parser.add_argument('--request-sha256',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(argv);runtime.require_supervised_worker()
    request_path=safe_path(args.request,serving=True)
    output=safe_path(args.output,serving=True,existing=False)
    if request_path.parent!=output or request_path.name!='request.json':raise StockUnavailable('Context worker request directory differs')
    blob=read_bytes(request_path,4096)
    if digest(blob)!=args.request_sha256:raise StockUnavailable('Context worker request bytes differ')
    request=decode_json(blob)
    if args.command=='_prepare':
        exact(request,('output',));manifest=prepare_manifest(request['output'])
        runtime.write_json_exclusive(output/'prepared.json',dict(path=str(manifest.path),sha256=manifest.sha256))
    else:
        manifest=load_manifest(args.manifest,args.manifest_sha256)
        prediction=infer(manifest,request,output/'prediction.json')
        runtime.write_json_exclusive(output/'prediction.json',prediction)

if __name__=='__main__':main()
