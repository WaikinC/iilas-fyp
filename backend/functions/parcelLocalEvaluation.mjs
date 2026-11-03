import {getApp} from 'firebase-admin/app';
import {openSync,readSync,closeSync,fstatSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,dirname,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PROJECT='fyp-inventory-and-logistics',BUCKET=`${PROJECT}.firebasestorage.app`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const SOURCE_FILES=Object.freeze(["research/parcel_local_eval.py", "research/serve_parcel_local_eval.py", "backend/functions/parcelLocalEvaluation.mjs", "backend/functions/parcelLocalEvaluationResponse.mjs", "backend/functions/service.mjs", "backend/functions/parcelAnalysis.mjs", "backend/functions/parcelLive.mjs", "backend/functions/parcelResponse.mjs", "backend/functions/parcelLiveResponse.mjs", "backend/functions/parcelLiveAcceptance.mjs", "lib/parcelAnalysis.js", "lib/parcelLive.js", "lib/accountRoles.js", "backend/functions/accountRoles.js", "lib/completionWorkflow.js", "backend/functions/completionWorkflow.js", "lib/completionClient.js", "backend/functions/completionOperations.mjs", "lib/integrityWorkflow.js", "backend/functions/integrityWorkflow.js", "backend/functions/integrityWorkflow.mjs", "backend/functions/integritySource.mjs", "lib/integrityRegistrationClient.js", "src/features/operations/IntegrityVerification.tsx", "lib/transportPlanning.js", "backend/functions/transportPlanning.js", "backend/functions/fleetTransport.mjs", "src/features/operations/operationsData.tsx", "src/features/operations/FleetManagement.tsx", "src/features/operations/TransportManagement.tsx", "src/features/operations/TransportPlanningMap.tsx", "backend/functions/customerAccess.mjs", "backend/functions/customerEvidence.mjs", "lib/customerPortal.js", "src/features/customer/CustomerPortal.tsx", "src/features/customer/customer.css", "src/features/operations/CustomerShipmentAccess.tsx", "src/features/workspace/WorkspaceGate.tsx", "src/features/workspace/AdminPanel.tsx", "lib/reporting.js", "backend/functions/reporting.js", "backend/functions/reporting.mjs", "lib/catalogueFilters.js", "src/features/operations/ReportExplorer.tsx", "src/features/operations/ReportsWorkspace.tsx", "src/features/operations/ResearchVerification.tsx", "src/features/operations/Operations.tsx", "src/features/operations/operations.css", "app/page.tsx", "backend/functions/index.mjs", "backend/functions/access.mjs", "firestore.rules", "firestore.indexes.json", "storage.rules", "scripts/prepare-functions.mjs", "scripts/prepare-fyp-completion-local.mjs", "lib/reportResponse.js", "src/features/operations/EvidenceFileComparison.tsx", "lib/mobileDelivery.js", "backend/functions/mobileDelivery.js", "backend/functions/mobileDelivery.mjs", "backend/functions/mobileEvidence.mjs", "backend/functions/deliveryWorkflow.mjs", "backend/functions/evidenceRegistration.mjs", "lib/demoEnvironment.js", "backend/functions/demoEnvironment.js", "backend/functions/demoEnvironment.mjs", "lib/hybridGateway.js", "backend/functions/hybridGateway.js", "backend/functions/hybridGateway.mjs", "backend/functions/hybridSigning.mjs", "backend/functions/hybridModelBinding.mjs", "backend/functions/hybridIntegrity.mjs", "lib/firebaseRuntime.js", "lib/firebase.js", "lib/workspace.js", "src/main.tsx", "tools/msi-gateway/models.mjs", "tools/msi-gateway/authentication.mjs", "tools/msi-gateway/server.mjs", "tools/msi-gateway/integrity.mjs", "tools/msi-gateway/launch.mjs"]);
export const LOCAL_EVALUATION_IDENTITY=Object.freeze({schema_version:1,kind:'parcel_local_evaluation_bundle_v1',warmBundle:{repo_path:'research/datasets/parcel-warm-serving-20261022/bundle-03/bundle.json',sha256:'dab3da809ca11d287a68ab36f7e55680d15b4f50872819c6243c0858c1b2bd10'},descriptor:{repo_path:'research/datasets/parcel-gpu-serving-20261022/descriptor-02/descriptor.json',sha256:'41be154569ace87d85bae5dc12b77eb7d08ffcb52616bb2e075f00c1300e21eb'},artifact:{repo_path:'research/datasets/parcel-visible-gpu-20261021/develop-02/mobilenetv2-clahe/classifier.keras',sha256:'2fffa7aa1a8c33c6698a97e38d028858b8433aec84dbd582c01094711a0ae4da'},bindings:{modelVersion:'2fffa7aa1a8c33c6698a97e38d028858b8433aec84dbd582c01094711a0ae4da',selectionSha256:'41be154569ace87d85bae5dc12b77eb7d08ffcb52616bb2e075f00c1300e21eb',evaluationSha256:'b4f6727ce08630f8289b572e6a9d4ab71d730aff102250aa4af505bc27252fcc'},contract:{class_order:['Normal','Damaged'],preprocessing:'rgb-letterbox224-v1',contrast:'clahe',decision:'larger_probability_exact_tie_abstains',confidence:'uncalibrated',human_review_required:true,operationally_approved:false,acceptance_sha256:null},livePolicy:{version:'parcel-live-v1',sha256:'50f4160d21f584110bbb7d68a6ff6552c2efe83bd14b119282d4b7a1e9217121'}});
function regularBytes(path,limit){
  const rel=relative(ROOT,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error();
  let current=ROOT;for(const part of rel.split(/[\\/]/)){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw new Error();}
  const before=lstatSync(path);if(!before.isFile()||before.nlink!==1||before.size<1||before.size>limit||realpathSync(path)!==path)throw new Error();
  const fd=openSync(path,'r');try{
    const opened=fstatSync(fd);if(!opened.isFile()||opened.nlink!==1||opened.ino!==before.ino||opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)throw new Error();
    const buffer=Buffer.alloc(before.size+1);let length=0;
    while(length<buffer.length){const count=readSync(fd,buffer,length,buffer.length-length,null);if(count===0)break;length+=count;}
    const after=lstatSync(path),finished=fstatSync(fd);
    if(length!==before.size||after.nlink!==1||finished.nlink!==1||after.size!==before.size||finished.size!==before.size||after.mtimeMs!==before.mtimeMs||finished.mtimeMs!==before.mtimeMs||after.ino!==before.ino||finished.ino!==before.ino||realpathSync(path)!==path)throw new Error();
    return buffer.subarray(0,length);
  }finally{closeSync(fd);}
}
function configured(){
  const e=process.env;if(e.FUNCTIONS_EMULATOR!=='true'||e.GCLOUD_PROJECT!==PROJECT||e.GOOGLE_CLOUD_PROJECT!==PROJECT||e.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||e.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8081'||e.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199'||!e.RESEARCH_API_TOKEN?.trim())return false;
  if(Object.keys(e).some(key=>key.startsWith('IILAS_PARCEL_')&&!['IILAS_PARCEL_LOCAL_EVAL_MANIFEST','IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256'].includes(key)&&e[key]))return false;
  // Inspect the raw URL as well as URL parsing: numeric-IP normalization and
  // hostname aliases must never turn a nonliteral endpoint into authority.
  if(!/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/?$/.test(e.RESEARCH_API_URL??''))return false;
  const url=new URL(e.RESEARCH_API_URL);if(!url.port||Number(url.port)>65535)return false;
  for(const key of ['EVIDENCE_BUCKET','STORAGE_BUCKET_URL'])if(e[key]!==undefined&&e[key]!==BUCKET)return false;
  if(e.FIREBASE_CONFIG){const config=JSON.parse(e.FIREBASE_CONFIG);if(config.projectId!==PROJECT||config.storageBucket!==BUCKET)return false;}
  const options=getApp().options;return options.projectId===PROJECT&&options.storageBucket===BUCKET;
}
export function isParcelLocalEvaluationModel(model){return !!model&&model.evaluationKind==='local-experimental';}
export function selectParcelLocalEvaluationModel(intendedUse){
  try{
    if(!['registered-photo','sampled-live'].includes(intendedUse)||!configured())return null;
    const path=process.env.IILAS_PARCEL_LOCAL_EVAL_MANIFEST,pin=process.env.IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256;
    if(typeof path!=='string'||/[\u0000-\u001f]/.test(path)||!isAbsolute(path)||path!==resolve(path)||relative(resolve(ROOT,'outputs'),path).startsWith('..')||basename(path)!=='manifest.json'||!digest(pin))return null;
    const bytes=regularBytes(path,65536);if(sha(bytes)!==pin)return null;
    const manifest=JSON.parse(bytes.toString('utf8'));
    // The Python writer emits sorted compact JSON plus one newline. Requiring
    // that representation also rejects duplicate keys and nonfinite JSON.
    if(bytes.toString('utf8')!==JSON.stringify(canonical(manifest))+'\n')return null;
    const code=Object.fromEntries(SOURCE_FILES.map(p=>[p,sha(regularBytes(resolve(ROOT,p),1024*1024))]));
    if(!same(manifest,{...LOCAL_EVALUATION_IDENTITY,code}))return null;
    for(const key of ['warmBundle','descriptor'])if(sha(regularBytes(resolve(ROOT,manifest[key].repo_path),1024*1024))!==manifest[key].sha256)return null;
    return {model:'MobileNetV2',...manifest.bindings,acceptanceSha256:null,preprocessing:manifest.contract.preprocessing,contrast:manifest.contract.contrast,classOrder:['Normal','Damaged'],evaluationKind:'local-experimental',evaluationManifestSha256:pin,...(intendedUse==='sampled-live'?{intendedUse,policyVersion:manifest.livePolicy.version,policySha256:manifest.livePolicy.sha256}:{})};
  }catch{return null;}
}
export function assertParcelLocalEvaluationAuthority(model){
  if(model&&['evaluationOnly','runtimeMode','operationally_approved'].some(k=>Object.hasOwn(model,k)))throw Object.assign(new Error('Local parcel evaluation authority is unavailable.'),{code:'unavailable'});
  if(!isParcelLocalEvaluationModel(model)){
    if(model&&['evaluationKind','evaluationManifestSha256'].some(k=>Object.hasOwn(model,k))||model?.acceptanceSha256===null)throw Object.assign(new Error('Local parcel evaluation authority is unavailable.'),{code:'unavailable'});
    return;
  }
  const selected=selectParcelLocalEvaluationModel(model.intendedUse==='sampled-live'?'sampled-live':'registered-photo');
  if(!selected||!same(selected,model))throw Object.assign(new Error('Local parcel evaluation authority is unavailable.'),{code:'unavailable'});
}
