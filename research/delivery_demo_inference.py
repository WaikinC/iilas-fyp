"""Bound source/artefact serving for the frozen simulated delivery RF."""
from dataclasses import dataclass
from pathlib import Path
import argparse,hashlib,io,json,math,re,sys,threading,time
from uuid import uuid4
import runner_runtime as runtime
import delivery_demo_artifacts as a
import delivery_demo_contract as c
from inventory_context_runtime import measure_output_bytes
ROOT=a.ROOT
SERVING_REL='research/datasets/delivery-demo-serving-v1'
DATA_REL='research/datasets/delivery-simulation-v1'
PROTOCOL=c.PROTOCOL
FEATURES=c.FEATURES
CLASSES=c.CLASSES
PROVENANCE=c.PROVENANCE
MAX_MANIFEST=64*1024
MAX_MODEL=10*1024**2
TOTAL_OUTPUT_BYTES=100*1024**2
FROZEN_HASHES={'main-01/manifest.json': 'be2bd72da306b1e1d1de73f9cb8beb22e0e952565d4e3a207d085eee2418bbda', 'development-01/development.json': '919c038ef689078471ed8071070f262981657b6f60a406e5c6a391ab090ad6b8', 'evaluation-01/evaluation.json': '7d0f751bb784a85517757289923430082a0c9bbb5d71e121b825395abe7381cb', 'registry/prepare-complete.json': '89783c088388ccba959a13fa6e4b2800feaa356d20ea1f443472d83fd49cd53b', 'registry/develop-complete.json': 'ea7e437656e9eefec612b24b5006d5472e1cd78e4a7e1f8d5ad143699bb6979e', 'registry/evaluate-complete.json': 'fd68a7c8be53ce845741909209cf07ec818e2a9acdca975f9a16127811a99c22', 'development-01/inference.result.json': '764742454c3e5c9871d33adbcaaac7b7835fac50295ec50ca1a2270e1943f19e', 'evaluation-01/inference.result.json': '639955e20288dcd5277bc20b07e8cfbf561d54764b753efa54980f4f8fef42be', 'development-01/candidate-02/job.joblib': 'fddad08e87facde391a3acca68ad3da92579577e9a30bc3396759c01fce3527b'}
MODEL_SPEC={'depth': 12, 'family': 'RF', 'leaf': 1}
SOURCE_FILES=('research/delivery_demo_inference.py', 'research/serve_delivery_demo_local_eval.py', 'research/runner_runtime.py', 'research/inventory_context_runtime.py', 'research/inventory_inference.py', 'lib/deliveryRiskDemo.js', 'backend/functions/deliveryRiskDemo.js', 'backend/functions/deliveryDemoSource.mjs', 'backend/functions/deliveryDemoLifecycle.mjs', 'backend/functions/deliveryDemoAI.mjs', 'backend/functions/service.mjs', 'backend/functions/access.mjs', 'lib/deliveryRiskDemoClient.js', 'src/features/operations/DeliveryRiskDemo.tsx', 'src/features/operations/Operations.tsx', 'src/features/operations/deliverySignals.ts', 'src/features/operations/operations.css', 'src/features/operations/ResearchVerification.tsx', 'firestore.rules', 'firestore.indexes.json', 'scripts/prepare-delivery-ai-local.mjs', 'scripts/prepare-inventory-ai-local.mjs', 'scripts/prepare-functions.mjs', 'lib/accountRoles.js', 'backend/functions/accountRoles.js', 'lib/completionWorkflow.js', 'backend/functions/completionWorkflow.js', 'lib/completionClient.js', 'backend/functions/completionOperations.mjs', 'lib/integrityWorkflow.js', 'backend/functions/integrityWorkflow.js', 'backend/functions/integrityWorkflow.mjs', 'backend/functions/integritySource.mjs', 'lib/integrityRegistrationClient.js', 'src/features/operations/IntegrityVerification.tsx', 'lib/transportPlanning.js', 'backend/functions/transportPlanning.js', 'backend/functions/fleetTransport.mjs', 'src/features/operations/operationsData.tsx', 'src/features/operations/FleetManagement.tsx', 'src/features/operations/TransportManagement.tsx', 'src/features/operations/TransportPlanningMap.tsx', 'backend/functions/customerAccess.mjs', 'backend/functions/customerEvidence.mjs', 'lib/customerPortal.js', 'src/features/customer/CustomerPortal.tsx', 'src/features/customer/customer.css', 'src/features/operations/CustomerShipmentAccess.tsx', 'src/features/workspace/WorkspaceGate.tsx', 'src/features/workspace/AdminPanel.tsx', 'lib/reporting.js', 'backend/functions/reporting.js', 'backend/functions/reporting.mjs', 'lib/catalogueFilters.js', 'src/features/operations/ReportExplorer.tsx', 'src/features/operations/ReportsWorkspace.tsx', 'app/page.tsx', 'backend/functions/index.mjs', 'storage.rules', 'scripts/prepare-fyp-completion-local.mjs', 'lib/reportResponse.js', 'src/features/operations/EvidenceFileComparison.tsx', 'lib/mobileDelivery.js', 'backend/functions/mobileDelivery.js', 'backend/functions/mobileDelivery.mjs', 'backend/functions/mobileEvidence.mjs', 'backend/functions/deliveryWorkflow.mjs', 'backend/functions/evidenceRegistration.mjs', 'lib/demoEnvironment.js', 'backend/functions/demoEnvironment.js', 'backend/functions/demoEnvironment.mjs', 'lib/hybridGateway.js', 'backend/functions/hybridGateway.js', 'backend/functions/hybridGateway.mjs', 'backend/functions/hybridSigning.mjs', 'backend/functions/hybridModelBinding.mjs', 'lib/firebaseRuntime.js', 'lib/firebase.js', 'lib/workspace.js', 'tools/msi-gateway/models.mjs', 'tools/msi-gateway/authentication.mjs', 'tools/msi-gateway/server.mjs', 'backend/functions/hybridIntegrity.mjs', 'src/main.tsx', 'tools/msi-gateway/integrity.mjs', 'tools/msi-gateway/launch.mjs')

class DeliveryUnavailable(RuntimeError):pass
class DeliveryBusy(DeliveryUnavailable):pass
@dataclass(frozen=True)
class Manifest:
    path:Path
    sha256:str
    data:dict

def safe_path(value,*,serving=False,existing=True):
    p=a.safe(value,ROOT/SERVING_REL if serving else ROOT)
    if existing and not p.is_file():raise ValueError('Delivery file is missing')
    return p

def digest(blob):return hashlib.sha256(blob).hexdigest()
def decode_json(blob):
    def pairs(items):
        d={}
        for k,v in items:
            if k in d:raise ValueError('Duplicate delivery JSON key')
            d[k]=v
        return d
    return json.loads(blob,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite delivery JSON')))
def read_bytes(path,limit=8*1024**2):return a.read_bytes(safe_path(path),limit)
def read_json(path,limit=8*1024**2):return decode_json(read_bytes(path,limit))
def source_pins():return {n:digest((ROOT/n).read_bytes()) for n in SOURCE_FILES}
def feature_digest(value):return c.feature_digest(value)
def validate_request(value):
    c.exact(value,('protocol','requestId','inputSha256','features'))
    if value['protocol']!=PROTOCOL or type(value['requestId']) is not str or not re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}',value['requestId']):raise ValueError('Invalid delivery request identity')
    features=c.validate_features(value['features'])
    if value['inputSha256']!=feature_digest(features):raise ValueError('Delivery input digest differs')
    return value|dict(features=features)
def _reference(name):return dict(path=f'{DATA_REL}/{name}',sha256=FROZEN_HASHES[name])
def _snapshot():
    values={}
    for name,pin in FROZEN_HASHES.items():
        blob=read_bytes(ROOT/DATA_REL/name,MAX_MODEL if name.endswith('.joblib') else 8*1024**2)
        if digest(blob)!=pin:raise DeliveryUnavailable('Frozen delivery artefact changed')
        if name.endswith('.json'):values[name]=decode_json(blob)
    dataset=values['main-01/manifest.json'];dev=values['development-01/development.json'];ev=values['evaluation-01/evaluation.json']
    if dataset['sourcePins']!=a.source_pins() or dev['sourcePins']!=a.source_pins() or ev['sourcePins']!=a.source_pins() or dataset['environment']!=a.environment() or not dev['rfBeatsDummy'] or ev['fitCalls']!=0:raise DeliveryUnavailable('Delivery scientific identity differs')
    for name in ('development-01/inference.result.json','evaluation-01/inference.result.json'):
        if values[name]['status']!='success' or values[name]['cleanup_confirmed'] is not True:raise DeliveryUnavailable('Delivery study cleanup incomplete')
    record=dev['records'][dev['selected']['RF']]
    if record['spec']!=MODEL_SPEC or record['modelSha256']!=FROZEN_HASHES[str(Path(record['modelPath']).relative_to(ROOT/DATA_REL)).replace('\\','/')]:raise DeliveryUnavailable('Wrong delivery RF selection')
    model_name=next(n for n in FROZEN_HASHES if n.endswith('.joblib'))
    return dict(schema='delivery-demo-local-serving-1.0',protocol=PROTOCOL,features=list(FEATURES),classes=list(CLASSES),provenance=PROVENANCE,model=_reference(model_name),dataset=_reference('main-01/manifest.json'),development=_reference('development-01/development.json'),evaluation=_reference('evaluation-01/evaluation.json'),modelSpec=MODEL_SPEC,ranges=dev['ranges'],metrics=ev['models']['RF']['metrics'],scientificSourcePins=a.source_pins(),environment=a.environment())
def prepare_manifest(output):
    path=safe_path(output,serving=True,existing=False)
    if path.exists():raise DeliveryUnavailable('Delivery manifest already exists')
    value=_snapshot()|dict(sourcePins=source_pins());path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('xb') as f:f.write(a.canonical(value))
    return load_manifest(path,digest(read_bytes(path,MAX_MANIFEST)))
def load_manifest(path,sha256):
    path=safe_path(path,serving=True);blob=read_bytes(path,MAX_MANIFEST)
    if digest(blob)!=sha256:raise DeliveryUnavailable('Delivery manifest digest differs')
    value=decode_json(blob);expected=_snapshot()|dict(sourcePins=source_pins())
    if value!=expected:raise DeliveryUnavailable('Delivery source/manifest schema differs')
    return Manifest(path,sha256,value)
def validate_prediction(value,request,manifest):
    try:
        keys=('protocol','requestId','inputSha256','features','label','probabilities','model','modelSha256','servingManifestSha256','datasetSha256','developmentSha256','evaluationSha256','processingTimeMs','totalProcessingTimeMs','outOfRange',*PROVENANCE)
        c.exact(value,keys)
        for k,v in request.items():
            if value[k]!=v:raise ValueError('Delivery response identity differs')
        for k,v in PROVENANCE.items():
            if type(value[k]) is not type(v) or value[k]!=v:raise ValueError('Delivery provenance changed')
        if value['model']!='RandomForest' or value['label']!=c.choose_label(value['probabilities']) or value['modelSha256']!=manifest.data['model']['sha256'] or value['servingManifestSha256']!=manifest.sha256:raise ValueError('Delivery model/score differs')
        for k in ('dataset','development','evaluation'):
            if value[k+'Sha256']!=manifest.data[k]['sha256']:raise ValueError('Delivery study source differs')
        c.number(value['processingTimeMs'],0,60000);c.number(value['totalProcessingTimeMs'],value['processingTimeMs'],60000)
        expected=[k for k in FEATURES if value['features'][k]<manifest.data['ranges'][k]['min'] or value['features'][k]>manifest.data['ranges'][k]['max']]
        if value['outOfRange']!=expected:raise ValueError('Delivery range warnings differ')
        return value
    except (ValueError,KeyError,TypeError) as error:raise DeliveryUnavailable('Invalid delivery response') from error

def infer(request,manifest):
    runtime.require_supervised_worker();began=time.perf_counter();request=validate_request(request)
    blob=read_bytes(ROOT/manifest.data['model']['path'],MAX_MODEL)
    if digest(blob)!=manifest.data['model']['sha256']:raise DeliveryUnavailable('Delivery model changed before unpickle')
    import joblib
    from sklearn.ensemble import RandomForestClassifier
    from threadpoolctl import threadpool_limits
    bundle=joblib.load(io.BytesIO(blob));c.exact(bundle,('model','spec','features','classes','provenance'));model=bundle['model']
    expected=RandomForestClassifier(n_estimators=128,max_depth=MODEL_SPEC['depth'],min_samples_leaf=MODEL_SPEC['leaf'],n_jobs=2,class_weight='balanced',random_state=20261024)
    if bundle['spec']!=MODEL_SPEC or bundle['features']!=list(FEATURES) or bundle['classes']!=list(CLASSES) or bundle['provenance']!=PROVENANCE or type(model) is not RandomForestClassifier or model.get_params()!=expected.get_params() or getattr(model,'n_features_in_',None)!=10 or set(model.classes_)!=set(CLASSES):raise DeliveryUnavailable('Delivery estimator schema changed')
    with threadpool_limits(limits=2):
        start=time.perf_counter();raw=model.predict_proba([[request['features'][k] for k in FEATURES]])[0];prediction_ms=(time.perf_counter()-start)*1000
    probabilities={label:float(raw[list(model.classes_).index(label)]) for label in CLASSES}
    value=request|dict(label=c.choose_label(probabilities),probabilities=probabilities,model='RandomForest',modelSha256=manifest.data['model']['sha256'],servingManifestSha256=manifest.sha256,processingTimeMs=prediction_ms,totalProcessingTimeMs=(time.perf_counter()-began)*1000,outOfRange=[k for k in FEATURES if request['features'][k]<manifest.data['ranges'][k]['min'] or request['features'][k]>manifest.data['ranges'][k]['max']],**{k+'Sha256':manifest.data[k]['sha256'] for k in ('dataset','development','evaluation')},**PROVENANCE)
    return validate_prediction(value,request,manifest)

def inference_limits():
    return runtime.Limits(max_wall_seconds=15,max_fit_seconds=15,max_rss_bytes=2*1024**3,
        min_available_bytes=3*1024**3,min_free_disk_bytes=1024**3,max_output_bytes=10*1024**2,poll_seconds=.1,threads=2)

class DeliveryExecutor:
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
        if self.unavailable:raise DeliveryUnavailable('Delivery executor needs confirmed native cleanup')
        if not self._lock.acquire(blocking=False):raise DeliveryBusy('Delivery model is busy')
        supervisor=None;began=time.perf_counter()
        try:
            if self.unavailable:raise DeliveryUnavailable('Delivery executor is quarantined')
            manifest=load_manifest(self.manifest.path,self.manifest.sha256)
            root=safe_path(self.output_root,serving=True,existing=False);root.mkdir(parents=True,exist_ok=True)
            if measure_output_bytes(ROOT/SERVING_REL)+inference_limits().max_output_bytes>TOTAL_OUTPUT_BYTES:raise DeliveryUnavailable('Delivery serving evidence capacity reached')
            output=runtime.create_run_directory(root/str(uuid4()),ROOT)
            supervisor=self._supervisor(output,inference_limits(),ROOT/SERVING_REL);supervisor.preflight()
            request_path=output/'request.json';runtime.write_json_exclusive(request_path,request)
            command=self._command(output,request) if self._command else [sys.executable,str(Path(__file__).resolve()),'_worker','--manifest',str(manifest.path),'--manifest-sha256',manifest.sha256,'--request',str(request_path),'--request-sha256',digest(read_bytes(request_path,4096)),'--output',str(output)]
            result=supervisor.run(command,fit_id='inference',cwd=ROOT)
            if result['status']!='success' or not supervisor.cleanup_confirmed:raise DeliveryUnavailable('Delivery native inference unavailable')
            supervisor.preflight(required_available_bytes=0)
            manifest=load_manifest(manifest.path,manifest.sha256)
            response=validate_prediction(read_json(output/'prediction.json',MAX_MANIFEST),request,manifest)
            response['totalProcessingTimeMs']=(time.perf_counter()-began)*1000
            return validate_prediction(response,request,manifest)
        except (OSError,ValueError,KeyError,TypeError,runtime.RuntimeSafetyError) as error:raise DeliveryUnavailable('Delivery local inference is unavailable') from error
        finally:
            if supervisor is not None and not getattr(supervisor,'cleanup_confirmed',True):
                self._cleanup_failed=True;self._quarantined_supervisor=supervisor
            self._lock.release()

def prepare_supervised(output):
    """The public preparation command keeps the deep audit in a bounded Job."""
    from inventory_inference import _StockSupervisor
    target=safe_path(output,serving=True,existing=False)
    if target.exists():raise DeliveryUnavailable('Delivery serving manifest already exists')
    root=ROOT/SERVING_REL;root.mkdir(parents=True,exist_ok=True)
    if runtime._output_bytes(root)+10*1024**2>TOTAL_OUTPUT_BYTES:raise DeliveryUnavailable('Delivery serving evidence capacity reached')
    run=runtime.create_run_directory(root/'metadata-checks'/str(uuid4()),ROOT)
    limits=runtime.Limits(max_wall_seconds=120,max_fit_seconds=120,max_rss_bytes=2*1024**3,min_available_bytes=3*1024**3,min_free_disk_bytes=1024**3,max_output_bytes=10*1024**2,poll_seconds=.1,threads=2)
    supervisor=_StockSupervisor(run,limits,root)
    request=run/'request.json';runtime.write_json_exclusive(request,dict(output=str(target)))
    result=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_prepare','--request',str(request),'--request-sha256',digest(read_bytes(request,4096)),'--output',str(run)],fit_id='inference',cwd=ROOT)
    if result['status']!='success' or not supervisor.cleanup_confirmed:raise DeliveryUnavailable('Delivery metadata audit failed; inspect retained evidence')
    receipt=read_json(run/'prepared.json',4096)
    if receipt['path']!=str(target):raise DeliveryUnavailable('Delivery preparation target differs')
    return load_manifest(target,receipt['sha256'])


def main(argv=None):
    p=argparse.ArgumentParser();p.add_argument('command',choices=['_worker','_prepare']);p.add_argument('--manifest',type=Path);p.add_argument('--manifest-sha256');p.add_argument('--request',type=Path,required=True);p.add_argument('--request-sha256',required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args(argv);runtime.require_supervised_worker()
    request_path=safe_path(args.request,serving=True);output=safe_path(args.output,serving=True,existing=False)
    if request_path.parent!=output or request_path.name!='request.json':raise DeliveryUnavailable('Delivery request directory differs')
    blob=read_bytes(request_path,4096)
    if digest(blob)!=args.request_sha256:raise DeliveryUnavailable('Delivery request bytes changed')
    value=decode_json(blob)
    if args.command=='_prepare':
        c.exact(value,('output',));manifest=prepare_manifest(value['output']);runtime.write_json_exclusive(output/'prepared.json',dict(path=str(manifest.path),sha256=manifest.sha256))
    else:
        manifest=load_manifest(args.manifest,args.manifest_sha256);result=infer(value,manifest);runtime.write_json_exclusive(output/'prediction.json',result)
if __name__=='__main__':main()
