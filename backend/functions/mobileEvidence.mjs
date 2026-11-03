import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {evidenceFile} from './evidenceProvider.mjs';
import {createHash} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {runMobileOperation,mobileIdentity,mobileAssigned} from './mobileDelivery.mjs';
import {validateMobileRequest,parseMobilePayload} from './mobileDelivery.js';
import {prepareEvidenceRegistration} from './evidenceRegistration.mjs';
const fail=message=>{throw Object.assign(Error(message),{code:'failed-precondition'});};
const keyFor=(scope,actor,id)=>createHash('sha256').update(JSON.stringify([scope,actor,id])).digest('hex');
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
export async function mobileEvidenceOperation(options){
 const {auth,scope,identity}=options,request=validateMobileRequest(options.input),p=parseMobilePayload(request);
 if(request.action==='evidence.prepare')return runMobileOperation({...options,work:async(tx,c)=>{
  const {shipment,plan}=await mobileAssigned(tx,c.scope,c.actor,p.shipmentId),path=`evidence/${c.scope}/${p.shipmentId}/${p.evidenceId}`,target=ref('mobileEvidenceRequests',keyFor(c.scope,c.actor,request.operationId)),existing=(await tx.get(ref('evidence',p.evidenceId))).data();
  if(existing)fail('evidence_conflict');if(p.capturedAtClient!==null)fail('A selected file cannot declare camera capture time.');
  const metadata={actor:c.actor,stage:p.stage,evidenceType:p.type,captureSource:p.captureSource,capturedAtClient:'',mobilePrepareId:request.operationId,sha256:p.sha256};
  return {result:{state:'Pending',recordId:p.evidenceId,version:1,data:{evidenceId:p.evidenceId,path,metadata}},apply(){tx.create(target,{ownerId:c.scope,actor:c.actor,operationId:request.operationId,input:p,path,metadata,shipmentVersion:shipment.version,assignmentVersion:plan.version,createdAt:FieldValue.serverTimestamp()});}};
 }});
 // Read current identity and preparation before touching Storage. A terminal
 // exact result can be recovered after delivery closure without another hash.
 await mobileIdentity(auth,identity);
 const preflight=await approvedTransaction(auth,ROLES,async(tx,config,member)=>{
  const s=config.dataScopeId;if(scope!==undefined&&scope!==s)fail('The data source cannot be changed.');
  const saved=(await tx.get(ref('mobileRequests',keyFor(s,auth.uid,request.operationId)))).data();
  if(saved)return {replay:true};
  if(member.role!=='Driver')fail('An assigned Driver is required.');
  const prepared=(await tx.get(ref('mobileEvidenceRequests',keyFor(s,auth.uid,p.prepareOperationId)))).data();
  if(!prepared||prepared.ownerId!==s||prepared.actor!==auth.uid)fail('The original proof preparation is required.');
  const assigned=await mobileAssigned(tx,s,auth.uid,prepared.input.shipmentId);
  if(assigned.shipment.version!==prepared.shipmentVersion||assigned.plan.version!==prepared.assignmentVersion)fail('assignment_changed');
  return {prepared};
 });
 if(preflight.replay)return runMobileOperation({...options,resolveOnly:true});
  const prepared=preflight.prepared,object=evidenceFile(prepared.path);
 let verified=null,conflict=false;
 let metadata;try{[metadata]=await object.getMetadata();}catch(error){if(Number(error.code)===404)throw Object.assign(Error('Proof upload is not present yet.'),{code:'not-found'});throw error;}
 if(String(metadata.size)!==String(prepared.input.bytes)||metadata.contentType!==prepared.input.contentType||!metadata.generation||Object.entries(prepared.metadata).some(([k,v])=>metadata.metadata?.[k]!==v))conflict=true;
 if(!conflict){
  const [buffer]=await object.download({start:0,end:prepared.input.bytes,validation:false}),[after]=await object.getMetadata();
  if(buffer.length!==prepared.input.bytes||createHash('sha256').update(buffer).digest('hex')!==prepared.input.sha256||String(after.generation)!==String(metadata.generation)||String(after.metageneration??'')!==String(metadata.metageneration??''))conflict=true;
  else verified={generation:String(metadata.generation)};
 }
 return runMobileOperation({...options,work:async(tx,c)=>{
  if(conflict)fail('evidence_conflict');
  const fresh=(await tx.get(ref('mobileEvidenceRequests',keyFor(c.scope,c.actor,p.prepareOperationId)))).data();
  if(JSON.stringify(fresh)!==JSON.stringify(prepared))fail('evidence_conflict');
  const {shipment,plan}=await mobileAssigned(tx,c.scope,c.actor,prepared.input.shipmentId);
  if(shipment.version!==prepared.shipmentVersion||plan.version!==prepared.assignmentVersion)fail('assignment_changed');
  const value=prepared.input,capture={type:value.type,stage:value.stage,captureSource:value.captureSource,capturedAtClient:value.capturedAtClient};
  const registration=await prepareEvidenceRegistration(tx,{scope:c.scope,actor:c.actor,member:c.member,shipmentId:value.shipmentId,key:value.evidenceId,path:prepared.path,name:value.name,capture,contentType:value.contentType,bytes:value.bytes,sha256:value.sha256,generation:verified.generation});
  return registration;
 }});
}
