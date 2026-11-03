import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {createHash} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {completionExact,completionUUID,completionIdentifier,completionCanonical} from './completionWorkflow.js';
import {validateEvidenceCapture} from './parcelEvidence.js';
import {authorizeEvidence,prepareEvidenceRegistration} from './evidenceRegistration.mjs';
import {mobileAssigned,mobileIdentity} from './mobileDelivery.mjs';
import {authoriseCustomerEvidence} from './customerEvidence.mjs';
import {runCustomerTransaction} from './customerAccess.mjs';
import {evidenceFile} from './evidenceProvider.mjs';
import {inputText} from './procurementValidation.js';
const sha=x=>createHash('sha256').update(x).digest('hex'),key=(scope,actor,id)=>sha(JSON.stringify([scope,actor,id]));
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
const fail=(message='Evidence input, authority or version changed.',code='failed-precondition')=>{throw Object.assign(Error(message),{code});};
const serial=value=>JSON.stringify(value,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export function validateMsiWebPreparation(raw,clock=Date.now){
 const v=completionExact(raw,['operationId','shipmentId','expectedVersion','evidenceId','stage','evidenceType','contentType','bytes','sha256','captureSource','capturedAtClient']);completionUUID(v.operationId);completionIdentifier(v.shipmentId);completionIdentifier(v.evidenceId);
 validateEvidenceCapture({stage:v.stage,type:v.evidenceType,captureSource:v.captureSource,capturedAtClient:v.capturedAtClient},clock());
 if(!Number.isSafeInteger(v.expectedVersion)||v.expectedVersion<1||!Number.isSafeInteger(v.bytes)||v.bytes<1||v.bytes>10485760||!/^[a-f0-9]{64}$/.test(v.sha256)||!['image/jpeg','image/png','image/webp','application/pdf'].includes(v.contentType)||v.evidenceType==='Parcel Image'&&!v.contentType.startsWith('image/'))fail();return v;
}
async function live(auth){const u=await getAuth().getUser(auth.uid);if(u.disabled||u.uid!==auth.uid)fail('The account is unavailable.','permission-denied');}
export async function prepareMsiWebEvidence(auth,raw){
 const input=validateMsiWebPreparation(raw),capture={stage:input.stage,type:input.evidenceType,captureSource:input.captureSource,capturedAtClient:input.capturedAtClient};await live(auth);
 return approvedTransaction(auth,ROLES,async(tx,config,member)=>{
  const scope=config.dataScopeId,intentId=key(scope,auth.uid,input.operationId),target=ref('msiEvidenceIntents',intentId),old=(await tx.get(target)).data();
  if(old){if(old.status==='Cancelled')fail('The original preparation was cancelled; start a new proof operation.');if(old.ownerId!==scope||old.actor!==auth.uid||completionCanonical(old.input)!==completionCanonical(input))fail();return {intentId,path:old.path,metadata:old.metadata,expiresAt:old.expiresAt};}
  const shipment=await authorizeEvidence(tx,{scope,actor:auth.uid,member,shipmentId:input.shipmentId,capture}),existing=await tx.get(ref('evidence',input.evidenceId));if(existing.exists||shipment.version!==input.expectedVersion)fail();
  const path=`evidence/${scope}/${input.shipmentId}/${input.evidenceId}`,metadata={actor:auth.uid,stage:input.stage,evidenceType:input.evidenceType,captureSource:input.captureSource,capturedAtClient:input.capturedAtClient||'',webPrepareId:input.operationId,sha256:input.sha256},expiresAt=Date.now()+1800000;
  tx.create(target,{ownerId:scope,actor:auth.uid,input,path,metadata,expiresAt,status:'Prepared',version:1,createdAt:FieldValue.serverTimestamp()});return {intentId,path,metadata,expiresAt};
 });
}
export async function reconcileMsiWebEvidence(auth,raw){
 const input=completionExact(raw,['operationId','shipmentId','evidenceId'],['intentId']);completionUUID(input.operationId);completionIdentifier(input.shipmentId);completionIdentifier(input.evidenceId);if(input.intentId!==undefined)completionIdentifier(input.intentId);await live(auth);
 const matches=(p,scope)=>{if(p.ownerId!==scope||p.actor!==auth.uid||p.input?.operationId!==input.operationId||p.input.evidenceId!==input.evidenceId||p.input.shipmentId!==input.shipmentId)fail();};
 const terminal=(p,existing)=>{if(p.status==='Cancelled')return {state:'Cancelled'};if(p.status==='Registered'){if(!existing||existing.ownerId!==p.ownerId||existing.actor!==auth.uid||existing.path!==p.path||existing.sha256!==p.input.sha256||existing.storageGeneration!==p.generation)fail();return {state:'Registered',result:{id:input.evidenceId,sha256:existing.sha256}};}if(existing)fail('The original evidence needs reconciliation.');return null;};
 const first=await approvedTransaction(auth,ROLES,async(tx,config)=>{const scope=config.dataScopeId,intentId=key(scope,auth.uid,input.operationId);if(input.intentId!==undefined&&input.intentId!==intentId)fail('This proof operation belongs to another account.','permission-denied');const target=ref('msiEvidenceIntents',intentId),p=(await tx.get(target)).data();if(!p){tx.create(target,{ownerId:scope,actor:auth.uid,input:{operationId:input.operationId,shipmentId:input.shipmentId,evidenceId:input.evidenceId},status:'Cancelled',version:1,cancelledAt:FieldValue.serverTimestamp()});return {terminal:{state:'Cancelled'}};}matches(p,scope);const existing=(await tx.get(ref('evidence',input.evidenceId))).data(),done=terminal(p,existing);if(done)return {terminal:done};if(!['Prepared','Uploaded'].includes(p.status))fail();return {p,intentId};});
 if(first.terminal)return first.terminal;const {p,intentId}=first;let metadata=null;try{[metadata]=await evidenceFile(p.path).getMetadata();}catch(error){if(!['not-found','ENOENT'].includes(error?.code))throw error;if(p.status==='Uploaded')fail('Committed proof bytes are unavailable; keep the original operation.','unavailable');}
 if(metadata&&(metadata.path!==p.path||Number(metadata.size)!==p.input.bytes||metadata.contentType!==p.input.contentType||completionCanonical(metadata.metadata)!==completionCanonical(p.metadata)||p.generation&&p.generation!==metadata.generation))fail();await live(auth);
 return approvedTransaction(auth,ROLES,async(tx,config,member)=>{const target=ref('msiEvidenceIntents',intentId),fresh=(await tx.get(target)).data(),existing=(await tx.get(ref('evidence',input.evidenceId))).data();if(!fresh)fail();matches(fresh,config.dataScopeId);const done=terminal(fresh,existing);if(done)return done;if(serial(fresh)!==serial(p))fail('Proof state changed; reconcile the same operation again.');const capture={stage:p.input.stage,type:p.input.evidenceType,captureSource:p.input.captureSource,capturedAtClient:p.input.capturedAtClient};let stale=false;try{const shipment=await authorizeEvidence(tx,{scope:config.dataScopeId,actor:auth.uid,member,shipmentId:p.input.shipmentId,capture});stale=shipment.version!==p.input.expectedVersion;}catch(error){if(!['permission-denied','failed-precondition','not-found'].includes(error?.code))throw error;stale=true;}
  if(stale||!metadata&&p.expiresAt<=Date.now()){tx.update(target,{status:'Cancelled',version:(p.version||1)+1,cancelledAt:FieldValue.serverTimestamp()});return {state:'Cancelled'};}
  const prepared={intentId,path:p.path,metadata:p.metadata,expiresAt:p.expiresAt};if(!metadata)return {state:'Prepared',prepared};tx.update(target,{status:'Uploaded',generation:metadata.generation,uploadedAt:FieldValue.serverTimestamp()});return {state:'Uploaded',prepared};
 });
}
export async function resolveMsiUploadIntent(auth,kind,intentId){
 completionIdentifier(intentId);if(!['web','mobile'].includes(kind))fail();await live(auth);if(kind==='mobile')await mobileIdentity(auth);
 return approvedTransaction(auth,ROLES,async(tx,config,member)=>{
  const scope=config.dataScopeId,recordId=kind==='web'?intentId:key(scope,auth.uid,intentId),target=ref(kind==='web'?'msiEvidenceIntents':'mobileEvidenceRequests',recordId),p=(await tx.get(target)).data();
  if(!p||p.ownerId!==scope||p.actor!==auth.uid||['CleanupPending','Cancelled'].includes(p.status))fail('The original proof preparation is unavailable.','permission-denied');
  if(kind==='web'){
   const capture={stage:p.input.stage,type:p.input.evidenceType,captureSource:p.input.captureSource,capturedAtClient:p.input.capturedAtClient};const shipment=await authorizeEvidence(tx,{scope,actor:auth.uid,member,shipmentId:p.input.shipmentId,capture});if(shipment.version!==p.input.expectedVersion&&p.status!=='Registered')fail();
  }else{if(member.role!=='Driver')fail('Only the assigned Driver may upload.','permission-denied');const assigned=await mobileAssigned(tx,scope,auth.uid,p.input.shipmentId);if(assigned.shipment.version!==p.shipmentVersion||assigned.plan.version!==p.assignmentVersion)fail();}
  return {intentId,path:p.path,bytes:p.input.bytes,sha256:p.input.sha256,contentType:p.input.contentType,metadata:p.metadata,expiresAt:kind==='web'?p.expiresAt:Number.MAX_SAFE_INTEGER};
 });
}
export async function finaliseMsiUpload(auth,kind,intentId,metadata){
 const current=await resolveMsiUploadIntent(auth,kind,intentId);if(current.path!==metadata.path||current.bytes!==Number(metadata.size)||current.contentType!==metadata.contentType)fail();
 if(kind==='web')await approvedTransaction(auth,ROLES,async(tx,config)=>{const target=ref('msiEvidenceIntents',intentId),p=(await tx.get(target)).data();if(!p||p.actor!==auth.uid||p.ownerId!==config.dataScopeId||p.path!==current.path||['CleanupPending','Cancelled'].includes(p.status))fail();if(p.generation&&p.generation!==metadata.generation)fail();if(p.status!=='Registered')tx.update(target,{status:'Uploaded',generation:metadata.generation,uploadedAt:FieldValue.serverTimestamp()});});
}
export function validateMsiWebRegistration(raw){const input=completionExact(raw,['id','shipmentId','path','name','type','stage','captureSource','capturedAtClient','intentId']);completionIdentifier(input.intentId);completionIdentifier(input.id);completionIdentifier(input.shipmentId);input.name=inputText(input.name,'Evidence filename',180,1,true);validateEvidenceCapture(input);return input;}
export async function registerMsiWebEvidence(auth,scope,raw){
 const input=validateMsiWebRegistration(raw),capture=validateEvidenceCapture(input);await live(auth);
 const before=await approvedTransaction(auth,ROLES,async(tx,config)=>{const p=(await tx.get(ref('msiEvidenceIntents',input.intentId))).data(),existing=(await tx.get(ref('evidence',input.id))).data();if(config.dataScopeId!==scope||!p||p.actor!==auth.uid||p.ownerId!==scope||p.path!==input.path||p.input.evidenceId!==input.id||p.input.shipmentId!==input.shipmentId||p.input.stage!==capture.stage||p.input.evidenceType!==capture.type||p.input.captureSource!==capture.captureSource||p.input.capturedAtClient!==capture.capturedAtClient)fail();if(existing){if(existing.ownerId!==scope||existing.actor!==auth.uid||existing.path!==p.path||existing.sha256!==p.input.sha256||existing.storageGeneration!==p.generation||existing.name!==input.name)fail();return {replay:{id:input.id,sha256:existing.sha256}};}if(p.status!=='Uploaded')fail();return {prepared:p};});
 if(before.replay)return before.replay;const p=before.prepared,file=evidenceFile(p.path),[metadata]=await file.getMetadata(),[bytes]=await file.download(),[after]=await file.getMetadata();
 if(Number(metadata.size)!==p.input.bytes||bytes.length!==p.input.bytes||sha(bytes)!==p.input.sha256||metadata.generation!==p.generation||after.generation!==metadata.generation||metadata.contentType!==p.input.contentType)fail();await live(auth);
 return approvedTransaction(auth,ROLES,async(tx,config,member)=>{const target=ref('msiEvidenceIntents',input.intentId),fresh=(await tx.get(target)).data();if(config.dataScopeId!==scope||serial(fresh)!==serial(p))fail();const shipment=await authorizeEvidence(tx,{scope,actor:auth.uid,member,shipmentId:input.shipmentId,capture});if(shipment.version!==p.input.expectedVersion)fail();const prepared=await prepareEvidenceRegistration(tx,{scope,actor:auth.uid,member,shipmentId:input.shipmentId,key:input.id,path:p.path,name:input.name,capture,contentType:metadata.contentType,bytes:bytes.length,sha256:p.input.sha256,generation:metadata.generation});prepared.apply();tx.update(target,{status:'Registered',registeredAt:FieldValue.serverTimestamp()});return {id:input.id,sha256:p.input.sha256};});
}
export async function readMsiEvidence({provider,authorise,signal}){
 const before=await authorise();signal?.throwIfAborted();const metadata=await provider.getMetadata(before.path);if(Number(metadata.size)!==before.bytes||metadata.contentType!==before.contentType||before.generation&&String(metadata.generation)!==before.generation)fail();
 const bytes=await provider.download(before.path);signal?.throwIfAborted();if(!Buffer.isBuffer(bytes)||bytes.length!==before.bytes||bytes.length>10485760||sha(bytes)!==before.sha256)fail();
 const last=await provider.getMetadata(before.path),after=await authorise();signal?.throwIfAborted();if(after.binding!==before.binding||last.generation!==metadata.generation||last.contentType!==metadata.contentType||Number(last.size)!==Number(metadata.size))fail();return {bytes,snapshot:after};
}
async function staffSnapshot(auth,evidenceId){await live(auth);return approvedTransaction(auth,ROLES,async(tx,config,member)=>{const e=(await tx.get(ref('evidence',completionIdentifier(evidenceId)))).data();if(!e||e.ownerId!==config.dataScopeId)fail('Proof is unavailable.','not-found');return {path:e.path,bytes:e.bytes,sha256:e.sha256,contentType:e.contentType,generation:e.storageGeneration||'',binding:sha(serial([e,member.version])),fileName:e.name||'proof'};});}
async function customerSnapshot(auth,shipmentId){
 await live(auth);completionIdentifier(shipmentId);const evidenceId=await runCustomerTransaction(auth,async(tx,scope)=>{const d=(await tx.get(ref('deliveries',shipmentId))).data();if(!d||d.ownerId!==scope||!d.proofId)fail('Proof is unavailable.','not-found');return d.proofId;});
 const e=(await ref('evidence',evidenceId).get()).data(),a=await authoriseCustomerEvidence(auth,{shipmentId,evidenceId});if(!e||e.path!==a.path||e.sha256!==a.sha256)fail();return {path:a.path,bytes:a.proof.bytes,sha256:a.sha256,contentType:a.proof.contentType,generation:e.storageGeneration||'',binding:sha(serial([a.binding,e.storageGeneration||null])),fileName:a.proof.fileName};
}
export function createMsiEvidenceRoutes({provider,resolveUpload=resolveMsiUploadIntent,finishUpload=finaliseMsiUpload,authoriseStaff=staffSnapshot,authoriseCustomer=customerSnapshot}){
 return async({req,res,auth,route,signal,send})=>{
  if(route.kind==='upload'){
   if(req.headers?.['content-encoding'])fail();const intent=await resolveUpload(auth,route.intentKind,route.intentId);signal?.throwIfAborted();if(req.headers?.['content-type']&&req.headers['content-type']!==intent.contentType)fail();
   async function* stream(){for await(const chunk of req){signal?.throwIfAborted();yield chunk;}}
   const metadata=await provider.commit(intent,stream());signal?.throwIfAborted();await finishUpload(auth,route.intentKind,route.intentId,metadata);signal?.throwIfAborted();send(200,{data:metadata});return;
  }
  const result=await readMsiEvidence({provider,authorise:()=>route.kind==='customer'?authoriseCustomer(auth,route.shipmentId):authoriseStaff(auth,route.evidenceId),signal});
  const name=String(result.snapshot.fileName).replace(/[^\x20-\x7e]|["\\/]/g,'_').slice(0,180);res.writeHead(200,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-IILAS-Protocol':'iilas-msi-api-1.0','X-IILAS-Backend':req.headers['x-iilas-backend'],'Content-Type':result.snapshot.contentType,'Content-Length':result.bytes.length,'Content-Disposition':`attachment; filename="${name}"`});res.end(result.bytes);
 };
}
