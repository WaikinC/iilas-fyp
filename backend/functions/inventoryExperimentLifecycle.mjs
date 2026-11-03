import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash,randomUUID} from 'node:crypto';
import {approvedTransaction} from './access.mjs';
import {contextFeaturesForScenario,contextFeaturePayload,validateContextPrediction,INVENTORY_CONTEXT_PROTOCOL,INVENTORY_CONTEXT_PROVENANCE} from './inventoryContextAI.js';
import {canonicalInventoryAI} from './inventoryAI.js';
import {trustedDemoEnvironment} from './demoEnvironment.mjs';
import {inferHybridPrediction} from './hybridGateway.mjs';
const PROJECT='fyp-inventory-and-logistics',URL='http://127.0.0.1:8001',ROLES=['Admin','Manager','Inventory','Warehouse'],LEASE_MS=45000;
const fail=(message,code='failed-precondition')=>{throw Object.assign(new Error(message),{code});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const hash=value=>digest(canonicalInventoryAI(value));
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
const stamp=()=>FieldValue.serverTimestamp();
export function assertInventoryLocalEmulators(){
 if(['spark-msi','spark-loopback-test'].includes(process.env.IILAS_DEMO_MODE)){trustedDemoEnvironment();return;}
 if(process.env.IILAS_DEMO_MODE==='cloud-demo'){trustedDemoEnvironment();return;}
 const env=process.env;
 if(env.FUNCTIONS_EMULATOR!=='true'||(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT)!==PROJECT||[env.GCLOUD_PROJECT,env.GOOGLE_CLOUD_PROJECT].some(v=>v&&v!==PROJECT)||env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8081'||env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199'||env.IILAS_STOCK_API_URL&&env.IILAS_STOCK_API_URL!==URL)fail('Stock AI experiments require the configured local MSI emulators.','unavailable');
}
async function boundedJSON(response){
 const reader=response.body?.getReader();if(!reader)throw Error('Stock response body missing.');
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw Error('Stock response too large.');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const REASONS={product_changed:'The selected demo product changed during analysis. Refresh its facts before starting a new experiment.',busy:'The local stock model is busy. No automatic retry was made.',timeout:'The local stock model did not complete within its deadline.',invalid_response:'The model result could not be verified.',service_unavailable:'The local stock service is unavailable. Check its profile and resource admission.',configuration_changed:'The stock model configuration changed during this request.',request_expired:'The original request expired without a confirmed result.'};

export function createInventoryExperimentLifecycle({configuration,fetcher=(...args)=>fetch(...args),clock=Date.now,definition,infer}){
 const {collection,action,auditPrefix,version,validateInput,prepareClaim=async()=>({}),checkFinal=async()=>null,publicFields=()=>({}),writeResult=()=>{}}=definition;
 const run=(auth,scope,work)=>approvedTransaction(auth,ROLES,async(tx,config,member)=>{if(scope!==config.dataScopeId)fail('The shared system data source cannot be changed.','permission-denied');return work(tx,member);});
 const identity=(auth,scope,data)=>hash({action,actor:auth.uid,scope,operationId:data.operationId});
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
  tx.create(ref('inventoryAIExperiments',experimentId),{ownerId:saved.ownerId,actor:saved.actor,operationId:saved.input.operationId,scenario:saved.scenario??saved.input.scenario,features:saved.features,inputSha256:saved.inputSha256,status,prediction,reason,source:saved.binding,createdAt:stamp(),requestedAtMs:saved.startedAtMs,version,protocol:INVENTORY_CONTEXT_PROTOCOL,...publicFields(saved),...INVENTORY_CONTEXT_PROVENANCE});
  tx.update(receiptRef,{state:status,result,completedAt:stamp(),version:2});
  tx.create(ref('auditLogs',auditPrefix+receiptRef.path.split('/').at(-1)),{ownerId:saved.ownerId,actor:saved.actor,kind:'inventoryAIExperiments',recordId:experimentId,action:'Experiment',version:1,label:'Simulated stock AI experiment; not an operational prediction',at:stamp()});
  writeResult(tx,{experimentId,saved,status,prediction});
  return result;
 }
 async function start(auth,scope,input){
  assertInventoryLocalEmulators();const data=validateInput(input),key=identity(auth,scope,data),receiptRef=ref(collection,key);
  const existing=await run(auth,scope,async tx=>{const snapshot=await tx.get(receiptRef);return snapshot.exists?outcome(checked(snapshot.data(),auth,scope,data)):null;});
  if(existing)return existing;
  const config=configuration();
  if(!config)fail('Stock AI configuration is unavailable.','unavailable');
  const claimed=await run(auth,scope,async tx=>{
   const old=await tx.get(receiptRef);if(old.exists)return {existing:outcome(checked(old.data(),auth,scope,data))};
   const startedAtMs=clock(),prepared=await prepareClaim(tx,{auth,scope,data,nowMs:startedAtMs,configuration:config});
   const features=contextFeaturesForScenario(prepared.scenario??data.scenario),inputSha256=digest(contextFeaturePayload(features));
   const nonce=randomUUID(),saved={ownerId:scope,actor:auth.uid,commandHash:hash(data),input:data,...prepared,features,inputSha256,state:'Running',nonce,startedAtMs,expiresAtMs:startedAtMs+LEASE_MS,configurationFingerprint:config.fingerprint,binding:{...config.expected,metrics:config.metrics,model:'RandomForest'},createdAt:stamp(),version:1};
   tx.create(receiptRef,saved);return {saved};
  });
  if(claimed.existing)return claimed.existing;
  const saved=claimed.saved,{features,inputSha256}=saved,request={protocol:INVENTORY_CONTEXT_PROTOCOL,requestId:saved.nonce,inputSha256,features};
  let prediction=null,reasonCode=null;
  try{
   if(infer||config.mode==='hybrid')prediction=await (infer||inferHybridPrediction)({kind:'stock',auth,scope,saved,request,configuration:config});
   else{
   const response=await fetcher(config.url+'/predict/stock-experiment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify(request),signal:AbortSignal.timeout(25000)});
   if(!response.ok){reasonCode=response.status===429?'busy':'service_unavailable';await response.body?.cancel().catch(()=>{});}
   else{
    try{prediction=validateContextPrediction(await boundedJSON(response),{...config.expected,requestId:saved.nonce,inputSha256,features});}
    catch{reasonCode='invalid_response';}
   }
   }
  }catch(error){reasonCode=error?.code==='busy'?'busy':['TimeoutError','AbortError'].includes(error?.name)?'timeout':'service_unavailable';}
  return run(auth,scope,async tx=>{
   const snapshot=await tx.get(receiptRef);if(!snapshot.exists)fail('The original stock operation needs reconciliation.','unavailable');
   const latest=checked(snapshot.data(),auth,scope,data);
   if(latest.state!=='Running')return outcome(latest);
   if(latest.nonce!==saved.nonce)return pending(data);
   let attemptReason=reasonCode;
   const finalReason=await checkFinal(tx,{scope,saved:latest});
   if(!attemptReason&&finalReason)attemptReason=finalReason;
   // Every retry completes its reads before checking admission, immediately
   // before writes. Terminal replay above needs no current configuration.
   let fingerprint=null;try{fingerprint=configuration()?.fingerprint;}catch{/* withdrawn source/capability */}
   if(fingerprint!==latest.configurationFingerprint)attemptReason='configuration_changed';
   if(clock()>=latest.expiresAtMs)attemptReason='request_expired';
   return finish(tx,receiptRef,latest,attemptReason?'Unavailable':'Predicted',attemptReason?null:prediction,attemptReason);
  });
 }
 async function resolve(auth,scope,input){
  assertInventoryLocalEmulators();const data=validateInput(input),receiptRef=ref(collection,identity(auth,scope,data));
  return run(auth,scope,async tx=>{
   const snapshot=await tx.get(receiptRef);
   if(!snapshot.exists){const result={state:'Cancelled',operationId:data.operationId,experimentId:null,replayed:false};tx.create(receiptRef,{ownerId:scope,actor:auth.uid,input:data,commandHash:hash(data),state:'Cancelled',result,createdAt:stamp(),version:1});return result;}
   const saved=checked(snapshot.data(),auth,scope,data);
   if(saved.state!=='Running')return outcome(saved);
   if(clock()<saved.expiresAtMs)return pending(data);
   return finish(tx,receiptRef,saved,'Unavailable',null,'request_expired');
  });
 }
 return {start,resolve};
}
