import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import fs,{mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
let options={projectId:'fyp-inventory-and-logistics',storageBucket:'fyp-inventory-and-logistics.firebasestorage.app'};
mock.module(new URL('../backend/functions/node_modules/firebase-admin/lib/esm/app/index.js',import.meta.url).href,{namedExports:{getApp:()=>({options})}});
const {selectParcelLocalEvaluationModel,assertParcelLocalEvaluationAuthority,LOCAL_EVALUATION_IDENTITY,SOURCE_FILES}=await import('../backend/functions/parcelLocalEvaluation.mjs');
const {validateParcelLocalEvaluationResponse,validateParcelLocalEvaluationLiveResponse}=await import('../backend/functions/parcelLocalEvaluationResponse.mjs');
const {validateParcelResponse}=await import('../backend/functions/parcelResponse.mjs');
const {requireParcelLiveAcceptance}=await import('../backend/functions/parcelLiveAcceptance.mjs');
const root=fileURLToPath(new URL('../',import.meta.url)),dir=join(root,'outputs',`local-eval-qa-${randomUUID()}`),path=join(dir,'manifest.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const manifest=()=>({...structuredClone(LOCAL_EVALUATION_IDENTITY),code:Object.fromEntries(SOURCE_FILES.map(p=>[p,sha(readFileSync(join(root,p)))]))});
const env={FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:options.projectId,GOOGLE_CLOUD_PROJECT:options.projectId,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',RESEARCH_API_URL:'http://127.0.0.1:8011',RESEARCH_API_TOKEN:randomUUID(),IILAS_PARCEL_LOCAL_EVAL_MANIFEST:path};
function configure(value=manifest()){mkdirSync(dir,{recursive:true});const bytes=JSON.stringify(sorted(value))+'\n';writeFileSync(path,bytes);Object.assign(process.env,env,{IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256:sha(bytes)});}
function wire(model,live=false){return {...model,intendedUse:live?'sampled-live':'registered-photo',evaluationOnly:true,runtimeMode:'local-evaluation',operationally_approved:false,humanReviewRequired:true,confidenceMeaning:'uncalibrated',evidenceSha256:'e'.repeat(64),probabilities:[0.2,0.8],confidence:0.8,label:'Damaged',status:'predicted',requestId:randomUUID(),processingTimeMs:12,totalProcessingTimeMs:15,...(live?{sessionId:randomUUID(),frameId:randomUUID(),sequence:1}:{})};}
test('local capability requires complete exact emulator, project, Admin and manifest conjunction',()=>{try{
  configure();assert.equal(selectParcelLocalEvaluationModel('registered-photo').evaluationKind,'local-experimental');
  for(const key of Object.keys(env)){const old=process.env[key];delete process.env[key];assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null,key);process.env[key]=old;}
  for(const [key,values] of Object.entries({RESEARCH_API_URL:['http://localhost:8011','https://127.0.0.1:8011','http://127.0.0.1','http://127.0.0.1:8011/x','http://127.0.0.1:8011?x','http://127.0.0.1:8011#x','http://u@127.0.0.1:8011','http://2130706433:8011','http://127.0.0.1:65536'],GCLOUD_PROJECT:['other'],EVIDENCE_BUCKET:['other'],STORAGE_BUCKET_URL:['other'],FIREBASE_CONFIG:[JSON.stringify({projectId:'other',storageBucket:options.storageBucket})],FUNCTIONS_EMULATOR:['false'],FIRESTORE_EMULATOR_HOST:['localhost:8081','127.0.0.1:8080']})){for(const value of values){configure();process.env[key]=value;assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null,`${key}: ${value}`);}delete process.env[key];}
  configure();options={...options,projectId:'other'};assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null);options.projectId=env.GCLOUD_PROJECT;
  configure();options.storageBucket='other';assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null);options.storageBucket='fyp-inventory-and-logistics.firebasestorage.app';
  for(const change of [m=>m.contract.operationally_approved=true,m=>m.contract.acceptance_sha256='a'.repeat(64),m=>m.livePolicy.sha256='a'.repeat(64),m=>m.bindings.modelVersion='a'.repeat(64),m=>m.code[SOURCE_FILES[0]]='a'.repeat(64),m=>m.extra=true]){const m=manifest();change(m);configure(m);assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null);}
  configure();const model=selectParcelLocalEvaluationModel('registered-photo');delete process.env.FUNCTIONS_EMULATOR;assert.throws(()=>assertParcelLocalEvaluationAuthority(model));
}finally{rmSync(dir,{recursive:true,force:true});}});
test('manifest byte limits, exact filename, duplicate keys, source drift and mixed settings fail closed',()=>{try{
  configure();process.env.IILAS_PARCEL_WARM_BUNDLE='conflicting';assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null);delete process.env.IILAS_PARCEL_WARM_BUNDLE;
  configure();const original=readFileSync(path);for(const bytes of [Buffer.alloc(65537,32),Buffer.from(original.toString().replace('"schema_version":1','"schema_version":1,"schema_version":1')),Buffer.from(original.toString().replace('"schema_version":1','"schema_version":2'))]){writeFileSync(path,bytes);process.env.IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256=sha(bytes);assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null);}
  configure();const wrong=join(dir,'othermanifest.json');writeFileSync(wrong,readFileSync(path));process.env.IILAS_PARCEL_LOCAL_EVAL_MANIFEST=wrong;assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null);
  configure();process.env.IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256='f'.repeat(64);assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null);
}finally{delete process.env.IILAS_PARCEL_WARM_BUNDLE;rmSync(dir,{recursive:true,force:true});}});
test('a hardlinked manifest is not a server-owned regular single-link configuration',()=>{try{
  configure();const original=fs.lstatSync,stat=mock.method(fs,'lstatSync',(...args)=>{const result=original(...args);if(args[0]===path)result.nlink=2;return result;});syncBuiltinESMExports();
  try{assert.equal(selectParcelLocalEvaluationModel('registered-photo'),null);}finally{stat.mock.restore();syncBuiltinESMExports();}
}finally{rmSync(dir,{recursive:true,force:true});}});
test('strict false/null responses preserve measured timing and reject mixed authority or malformed wire',()=>{try{
  configure();for(const live of [false,true]){const model=selectParcelLocalEvaluationModel(live?'sampled-live':'registered-photo'),result=wire(model,live),validate=live?validateParcelLocalEvaluationLiveResponse:validateParcelLocalEvaluationResponse,context={model,evidenceSha256:result.evidenceSha256,...(live?{sessionId:result.sessionId,frameId:result.frameId,sequence:1}:{})};
    assert.equal(validate(result,context).totalProcessingTimeMs,15);
    assert.throws(()=>live?requireParcelLiveAcceptance(model):validateParcelResponse(result,{acceptance:{...model,intendedUse:'registered-photo'},evidenceSha256:result.evidenceSha256}));
    for(const patch of [{operationally_approved:true},{acceptanceSha256:'a'.repeat(64)},{evaluationKind:null},{evaluationManifestSha256:'a'.repeat(64)},{evaluationOnly:false},{runtimeMode:'warm'},{modelVersion:'a'.repeat(64)},{totalProcessingTimeMs:11},{totalProcessingTimeMs:30001},{processingTimeMs:25001},{probabilities:[0.8,0.8]},{extra:true},...(live?[{sequence:2},{policySha256:'a'.repeat(64)}]:[])])assert.throws(()=>validate({...result,...patch},context),JSON.stringify(patch));
    const tie={...result,status:'abstained',label:null,probabilities:[0.5,0.5],confidence:0.5};assert.equal(validate(tie,context).label,null);
    const getter={...result};Object.defineProperty(getter,'confidence',{get(){throw new Error('accessor executed');},enumerable:true});assert.throws(()=>validate(getter,context));
  }
}finally{rmSync(dir,{recursive:true,force:true});}});
