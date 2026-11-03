import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {approvedTransaction} from './access.mjs';
import {getInventoryAssessment} from './inventoryRisk.mjs';
import {assertInventoryLocalEmulators} from './inventoryExperimentLifecycle.mjs';
import {validateExperimentInput,featuresForScenario,canonicalInventoryAI,inventoryAIFeaturePayload,validateInventoryPrediction,inventoryAIReadiness,INVENTORY_AI_PROTOCOL,INVENTORY_AI_FEATURES,INVENTORY_AI_CLASSES,INVENTORY_AI_PROVENANCE} from './inventoryAI.js';

const ROOT=fileURLToPath(new globalThis.URL('../../',import.meta.url)),URL='http://127.0.0.1:8001',PROJECT='fyp-inventory-and-logistics';
const ROLES=['Admin','Manager','Inventory','Warehouse'],LEASE_MS=45000,HASH=/^[0-9a-f]{64}$/;
const SOURCE_FILES=['research/inventory_inference.py','research/serve_inventory_local_eval.py','research/runner_runtime.py','lib/inventoryAI.js','backend/functions/inventoryAI.js','backend/functions/inventoryAI.mjs','backend/functions/service.mjs','lib/inventoryAIClient.js','src/features/stock/InventoryAIExperiment.tsx','src/features/stock/InventoryRisk.tsx'];
const fail=(message,code='failed-precondition')=>{throw Object.assign(new Error(message),{code});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const hash=value=>digest(canonicalInventoryAI(value));
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
const stamp=()=>FieldValue.serverTimestamp();
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error('Invalid stock metadata.');}
function localOnly(){
 const env=process.env;
 if(env.FUNCTIONS_EMULATOR!=='true'||(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT)!==PROJECT||[env.GCLOUD_PROJECT,env.GOOGLE_CLOUD_PROJECT].some(v=>v&&v!==PROJECT)||env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8081'||env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199'||env.IILAS_STOCK_API_URL&&env.IILAS_STOCK_API_URL!==URL)fail('Stock AI experiments require the configured local MSI emulators.','unavailable');
}
function checkedPath(value,dataOnly=false){
 if(typeof value!=='string'||!value||/[\x00-\x1f\x7f]/.test(value)||value.split(/[\\/]/).includes('..'))throw Error('Invalid stock metadata path.');
 const path=resolve(ROOT,value),base=dataOnly?resolve(ROOT,'research/datasets'):resolve(ROOT),rel=relative(base,path);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Stock metadata path is outside its local area.');
 let current=ROOT;
 for(const part of relative(ROOT,path).split(/[\\/]/)){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw Error('Linked stock metadata refused.');}
 return path;
}
function fileHash(path,maxBytes=10*1024*1024){if(!lstatSync(path).isFile()||lstatSync(path).size>maxBytes)throw Error('Stock metadata size is invalid.');return digest(readFileSync(path));}
export function readInventoryAIConfiguration(){
 try{
  localOnly();const env=process.env,token=env.IILAS_STOCK_API_TOKEN;
  if(env.IILAS_STOCK_API_URL!==URL||typeof token!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(token)||!HASH.test(env.IILAS_STOCK_MANIFEST_SHA256||''))throw Error('Incomplete stock service settings.');
  const path=checkedPath(env.IILAS_STOCK_MANIFEST_PATH,true),pin=env.IILAS_STOCK_MANIFEST_SHA256;
  if(fileHash(path,65536)!==pin)throw Error('Stock manifest differs.');
  const m=JSON.parse(readFileSync(path,'utf8'));
  exact(m,['schema','protocol','dataset','development','evaluation','model','versions','features','classOrder','ranges','metrics','sourcePins',...Object.keys(INVENTORY_AI_PROVENANCE)]);
  if(m.schema!=='inventory-local-serving-1.0'||m.protocol!==INVENTORY_AI_PROTOCOL||canonicalInventoryAI(m.features)!==canonicalInventoryAI(INVENTORY_AI_FEATURES)||canonicalInventoryAI(m.classOrder)!==canonicalInventoryAI(INVENTORY_AI_CLASSES))throw Error('Stock manifest schema differs.');
  for(const [key,value] of Object.entries(INVENTORY_AI_PROVENANCE))if(m[key]!==value)throw Error('Stock provenance differs.');
  exact(m.sourcePins,SOURCE_FILES);
  for(const name of SOURCE_FILES)if(!HASH.test(m.sourcePins[name])||fileHash(checkedPath(name))!==m.sourcePins[name])throw Error('Stock source differs.');
  for(const key of ['dataset','development','evaluation']){exact(m[key],['path','sha256']);if(!HASH.test(m[key].sha256)||fileHash(checkedPath(m[key].path,true))!==m[key].sha256)throw Error('Stock experiment artifact differs.');}
  exact(m.model,['path','sha256','spec']);
  if(!HASH.test(m.model.sha256)||fileHash(checkedPath(m.model.path,true))!==m.model.sha256||canonicalInventoryAI(m.model.spec)!==canonicalInventoryAI({id:'rf-d6-l2',family:'RandomForest',depth:6,leaf:2}))throw Error('Frozen stock RF differs.');
  exact(m.ranges,INVENTORY_AI_FEATURES);
  for(const range of Object.values(m.ranges)){exact(range,['min','max']);if(typeof range.min!=='number'||typeof range.max!=='number'||!Number.isFinite(range.min)||!Number.isFinite(range.max)||range.min>range.max)throw Error('Invalid stock range.');}
  exact(m.metrics,['accuracy','criticalRecall','observations','origin']);
  if(m.metrics.accuracy!==.75||m.metrics.criticalRecall!==.45||m.metrics.observations!==60||m.metrics.origin!=='AI-authored synthetic policy')throw Error('Stock evaluation disclosure differs.');
  const expected={modelSha256:m.model.sha256,servingManifestSha256:pin,datasetSha256:m.dataset.sha256,developmentSha256:m.development.sha256,evaluationSha256:m.evaluation.sha256,ranges:m.ranges};
  return {url:URL,token,expected,metrics:m.metrics,fingerprint:hash({url:URL,path,manifestSha256:pin,tokenSha256:digest(token)})};
 }catch{fail('Stock AI configuration is unavailable. Recover existing work or check the local serving profile.','unavailable');}
}

async function boundedJSON(response){
 const reader=response.body?.getReader();if(!reader)throw Error('Stock response body missing.');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw Error('Stock response too large.');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const REASONS={busy:'The local stock model is busy. No automatic retry was made.',timeout:'The local stock model did not complete within its deadline.',invalid_response:'The model result could not be verified.',service_unavailable:'The local stock service is unavailable. Check its profile and resource admission.',configuration_changed:'The stock model configuration changed during this request.',request_expired:'The original request expired without a confirmed result.'};

export function createInventoryAICommands({configuration=readInventoryAIConfiguration,fetcher=(...args)=>fetch(...args),clock=Date.now}={}){
 const run=(auth,scope,work)=>approvedTransaction(auth,ROLES,async(tx,config,member)=>{if(scope!==config.dataScopeId)fail('The shared system data source cannot be changed.','permission-denied');return work(tx,member);});
 const identity=(auth,scope,data)=>hash({action:'inventoryExperiment',actor:auth.uid,scope,operationId:data.operationId});
 const pending=data=>({state:'Pending',operationId:data.operationId,experimentId:null,replayed:true});
 function checked(saved,auth,scope,data){
  if(saved.ownerId!==scope||saved.actor!==auth.uid||saved.commandHash!==hash(data))fail('This stock experiment operation belongs to different input.');
  if(!['Running','Predicted','Unavailable','Cancelled'].includes(saved.state))fail('The saved stock operation needs reconciliation.','unavailable');
  return saved;
 }
 const outcome=saved=>saved.state==='Running'?pending(saved.input):{...saved.result,replayed:true};
 function finish(tx,receiptRef,saved,status,prediction=null,reasonCode=null){
  const experimentId=randomUUID(),result={state:status,operationId:saved.input.operationId,experimentId,replayed:false};
  const reason=reasonCode?{code:reasonCode,message:REASONS[reasonCode]}:null;
  tx.create(ref('inventoryAIExperiments',experimentId),{ownerId:saved.ownerId,actor:saved.actor,operationId:saved.input.operationId,scenario:saved.input.scenario,features:saved.features,inputSha256:saved.inputSha256,status,prediction,reason,source:saved.binding,createdAt:stamp(),requestedAtMs:saved.startedAtMs,version:1,protocol:INVENTORY_AI_PROTOCOL,...INVENTORY_AI_PROVENANCE});
  tx.update(receiptRef,{state:status,result,completedAt:stamp(),version:2});
  tx.create(ref('auditLogs','inventoryAI_'+receiptRef.path.split('/').at(-1)),{ownerId:saved.ownerId,actor:saved.actor,kind:'inventoryAIExperiments',recordId:experimentId,action:'Experiment',version:1,label:'Simulated stock AI experiment; not an operational prediction',at:stamp()});
  return result;
 }
 async function startInventoryExperiment(auth,scope,input){
  localOnly();const data=validateExperimentInput(input),key=identity(auth,scope,data),receiptRef=ref('inventoryAIRequests',key);
  const existing=await run(auth,scope,async tx=>{const snapshot=await tx.get(receiptRef);return snapshot.exists?outcome(checked(snapshot.data(),auth,scope,data)):null;});
  if(existing)return existing;
  const config=configuration();
  if(!config)fail('Stock AI configuration is unavailable.','unavailable');
  const features=featuresForScenario(data.scenario),inputSha256=digest(inventoryAIFeaturePayload(features));
  const claimed=await run(auth,scope,async tx=>{
   const old=await tx.get(receiptRef);if(old.exists)return {existing:outcome(checked(old.data(),auth,scope,data))};
   const nonce=randomUUID(),startedAtMs=clock(),saved={ownerId:scope,actor:auth.uid,commandHash:hash(data),input:data,features,inputSha256,state:'Running',nonce,startedAtMs,expiresAtMs:startedAtMs+LEASE_MS,configurationFingerprint:config.fingerprint,binding:{...config.expected,metrics:config.metrics,model:'RandomForest'},createdAt:stamp(),version:1};
   tx.create(receiptRef,saved);return {saved};
  });
  if(claimed.existing)return claimed.existing;
  const saved=claimed.saved,request={protocol:INVENTORY_AI_PROTOCOL,requestId:saved.nonce,inputSha256,features};
  let prediction=null,reasonCode=null;
  try{
   const response=await fetcher(config.url+'/predict/stock-experiment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify(request),signal:AbortSignal.timeout(25000)});
   if(!response.ok){reasonCode=response.status===429?'busy':'service_unavailable';await response.body?.cancel().catch(()=>{});}
   else{
    try{prediction=validateInventoryPrediction(await boundedJSON(response),{...config.expected,requestId:saved.nonce,inputSha256,features});}
    catch{reasonCode='invalid_response';}
   }
  }catch(error){reasonCode=['TimeoutError','AbortError'].includes(error?.name)?'timeout':'service_unavailable';}
  let current=null;try{current=configuration()?.fingerprint;}catch{/* configuration removal fences late output */}
  if(current!==saved.configurationFingerprint){reasonCode='configuration_changed';prediction=null;}
  return run(auth,scope,async tx=>{
   const snapshot=await tx.get(receiptRef);if(!snapshot.exists)fail('The original stock operation needs reconciliation.','unavailable');
   const latest=checked(snapshot.data(),auth,scope,data);
   if(latest.state!=='Running')return outcome(latest);
   if(latest.nonce!==saved.nonce)return pending(data);
   if(clock()>=latest.expiresAtMs){reasonCode='request_expired';prediction=null;}
   return finish(tx,receiptRef,latest,reasonCode?'Unavailable':'Predicted',reasonCode?null:prediction,reasonCode);
  });
 }
 async function resolveInventoryExperiment(auth,scope,input){
  localOnly();const data=validateExperimentInput(input),receiptRef=ref('inventoryAIRequests',identity(auth,scope,data));
  return run(auth,scope,async tx=>{
   const snapshot=await tx.get(receiptRef);
   if(!snapshot.exists){const result={state:'Cancelled',operationId:data.operationId,experimentId:null,replayed:false};tx.create(receiptRef,{ownerId:scope,actor:auth.uid,input:data,commandHash:hash(data),state:'Cancelled',result,createdAt:stamp(),version:1});return result;}
   const saved=checked(snapshot.data(),auth,scope,data);
   if(saved.state!=='Running')return outcome(saved);
   if(clock()<saved.expiresAtMs)return pending(data);
   return finish(tx,receiptRef,saved,'Unavailable',null,'request_expired');
  });
 }
 async function recoverInventoryExperiment(auth,scope,input){
  localOnly();const data=validateExperimentInput(input),receiptRef=ref('inventoryAIRequests',identity(auth,scope,data));
  return run(auth,scope,async tx=>{
   const snapshot=await tx.get(receiptRef);
   if(!snapshot.exists)fail('New six-input experiments are no longer available. Use the context experiment; recover only a previous saved request.','unavailable');
   return outcome(checked(snapshot.data(),auth,scope,data));
  });
 }
 async function getInventoryAIReadiness(auth,scope,input){assertInventoryLocalEmulators();return inventoryAIReadiness(await getInventoryAssessment(auth,scope,input));}
 return {startInventoryExperiment,resolveInventoryExperiment,recoverInventoryExperiment,getInventoryAIReadiness};
}
const commands=createInventoryAICommands();
export const startInventoryExperiment=(...args)=>commands.startInventoryExperiment(...args);
export const resolveInventoryExperiment=(...args)=>commands.resolveInventoryExperiment(...args);
export const recoverInventoryExperiment=(...args)=>commands.recoverInventoryExperiment(...args);
export const getInventoryAIReadiness=(...args)=>commands.getInventoryAIReadiness(...args);
