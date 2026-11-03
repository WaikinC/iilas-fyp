import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {createHash} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {assertCompletionLocal} from './completionOperations.mjs';
import {completionExact,completionIdentifier} from './completionWorkflow.js';
import {MOBILE_LIMITS as L,MOBILE_PROTOCOL,validateMobileRequest,parseMobilePayload,validateMobileResult,mobileHash,shouldReplaceLatest,validateMobilePage,validateMobileShipment} from './mobileDelivery.js';
import {prepareDeliveryTransition} from './deliveryWorkflow.mjs';
const fail=(message,code='failed-precondition')=>{throw Object.assign(Error(message),{code});};
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
const stamp=()=>FieldValue.serverTimestamp();
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function assertMobileLocal(){assertCompletionLocal();if(process.env.IILAS_MOBILE_DEMO!=='enabled')fail('The Android local demonstration is unavailable.','unavailable');}
export async function mobileIdentity(auth,identity=getAuth()){
 assertMobileLocal();completionIdentifier(auth?.uid);const live=await identity.getUser(auth.uid);
 if(live.uid!==auth.uid||live.disabled||!live.email)fail('Sign in with an active account.','permission-denied');return live;
}
export async function mobileAssigned(tx,scope,actor,shipmentId,allowTerminal=false){
 completionIdentifier(shipmentId);const shipment=(await tx.get(ref('shipments',shipmentId))).data(),plan=(await tx.get(ref('transportPlans',shipmentId))).data(),old=(await tx.get(ref('deliveries',shipmentId))).data()||{status:'Dispatched',version:0,failedAttempts:0};
 if(!shipment||shipment.ownerId!==scope||!plan||plan.ownerId!==scope||plan.driverUid!==actor)fail('assignment_changed');
 if(old.ownerId!==undefined&&old.ownerId!==scope)fail('authority_changed');
 if(shipment.status!=='Dispatched'||!allowTerminal&&['Delivered','Returned'].includes(old.status))fail('delivery_closed');return {shipment,plan,old};
}
export async function runMobileOperation({auth,scope,input,identity=getAuth(),clock=Date.now,resolveOnly=false,work}){
 await mobileIdentity(auth,identity);const request=validateMobileRequest(input),payload=parseMobilePayload(request),requestSha256=mobileHash(request.payloadJson);
 return approvedTransaction(auth,ROLES,async(tx,config,member)=>{
  const s=config.dataScopeId;if(scope!==undefined&&scope!==s)fail('The data source cannot be changed.','permission-denied');
  const receiptRef=ref('mobileRequests',digest([s,auth.uid,request.operationId])),saved=(await tx.get(receiptRef)).data();
  if(saved){if(saved.ownerId!==s||saved.actor!==auth.uid||saved.request.action!==request.action||saved.request.payloadJson!==request.payloadJson)fail('This operation belongs to different input.');return {...validateMobileResult(saved.result,request),replayed:true};}
  if(member.role!=='Driver')fail('Only an assigned Driver can start this operation.','permission-denied');
  let prepared,result={protocol:MOBILE_PROTOCOL,operationId:request.operationId,action:request.action,requestSha256,state:'Cancelled',recordId:null,version:null,reason:null,replayed:false,data:null};
  if(!resolveOnly){
   try{prepared=await work(tx,{scope:s,actor:auth.uid,member,request,payload,clock});result={...result,state:'Committed',...prepared.result};}
   catch(error){if(!['stale_version','assignment_changed','delivery_closed','invalid_clock','expired_capture','evidence_conflict','authority_changed'].includes(error.message))throw error;result={...result,state:'Rejected',reason:error.message};}
  }
  validateMobileResult(result,request);assertMobileLocal();if(prepared)prepared.apply();tx.create(receiptRef,{ownerId:s,actor:auth.uid,request,result,createdAt:stamp()});return result;
 });
}
async function projection(tx,scope,actor,key){
 const {shipment,plan,old}=await mobileAssigned(tx,scope,actor,key,true);
 const proofs=await tx.get(getFirestore().collection('evidence').where('ownerId','==',scope).where('shipmentId','==',key).where('type','==','Proof of Delivery').limit(20));
 return validateMobileShipment({id:key,reference:shipment.reference,recipient:shipment.recipient||shipment.customerName||shipment.customer||'Recipient',address:shipment.address||shipment.destination||'Address unavailable',expectedDelivery:shipment.expectedDelivery,shipmentVersion:shipment.version,deliveryVersion:old.version,status:old.status,assignmentVersion:plan.version,proofs:proofs.docs.map(d=>({id:d.id,name:d.data().name}))});
}
async function trackingWork(tx,{scope,actor,request,payload,clock}){
 const now=clock();
 if(request.action==='tracking.start'){
  const {plan}=await mobileAssigned(tx,scope,actor,payload.shipmentId),lockRef=ref('mobileTrackingSessions','device_'+digest([scope,actor,payload.installationId])),lock=(await tx.get(lockRef)).data();
  let prior=null;
  if(lock?.sessionId){
   prior=(await tx.get(ref('mobileTrackingSessions',lock.sessionId))).data();
   if(!prior||prior.ownerId!==scope||prior.actor!==actor)fail('authority_changed');
   if(lock.active&&lock.leaseUntilMs>now&&prior.active){
    const previousShipment=(await tx.get(ref('shipments',prior.shipmentId))).data(),previousPlan=(await tx.get(ref('transportPlans',prior.shipmentId))).data(),previousDelivery=(await tx.get(ref('deliveries',prior.shipmentId))).data();
    if(previousShipment?.ownerId===scope&&previousShipment.status==='Dispatched'&&previousPlan?.ownerId===scope&&previousPlan.driverUid===actor&&previousPlan.version===prior.assignmentVersion&&!['Delivered','Returned'].includes(previousDelivery?.status))fail('authority_changed');
   }
  }
  const sessionId=request.operationId,session={ownerId:scope,actor,shipmentId:payload.shipmentId,installationId:payload.installationId,assignmentVersion:plan.version,driverId:plan.driverId,vehicleId:plan.vehicleId,startedAtMs:now,leaseUntilMs:now+L.leaseMs,absoluteUntilMs:now+L.absoluteMs,active:true,lastSequence:0,lastCapturedAtMs:0,version:1};
  return {result:{recordId:sessionId,version:1,data:{sessionId,serverNowMs:now,leaseUntilMs:session.leaseUntilMs,absoluteUntilMs:session.absoluteUntilMs,intervalMs:L.intervalMs}},apply(){if(prior)tx.update(ref('mobileTrackingSessions',lock.sessionId),{active:false,stoppedAtMs:Math.min(now,prior.leaseUntilMs),version:prior.version+1});tx.create(ref('mobileTrackingSessions',sessionId),session);tx.set(lockRef,{sessionId,active:true,leaseUntilMs:session.leaseUntilMs});}};
 }
 const sessionId=payload.sessionId,sessionRef=ref('mobileTrackingSessions',sessionId),session=(await tx.get(sessionRef)).data();
 if(!session||session.ownerId!==scope||session.actor!==actor)fail('assignment_changed');
 const {plan}=await mobileAssigned(tx,scope,actor,session.shipmentId);
 if(plan.version!==session.assignmentVersion||plan.driverId!==session.driverId||plan.vehicleId!==session.vehicleId)fail('assignment_changed');
 const lockRef=ref('mobileTrackingSessions','device_'+digest([scope,actor,session.installationId])),lock=(await tx.get(lockRef)).data();
 if(request.action==='tracking.stop')return {result:{recordId:sessionId,version:session.version+1,data:{sessionId,stopped:true}},apply(){tx.update(sessionRef,{active:false,version:session.version+1,stoppedAtMs:now});if(lock?.sessionId===sessionId)tx.set(lockRef,{sessionId,active:false,leaseUntilMs:session.leaseUntilMs});}};
 if(request.action==='tracking.renew'){
  if(!session.active||lock?.sessionId!==sessionId||now>=session.leaseUntilMs||now>=session.absoluteUntilMs)fail('expired_capture');
  const leaseUntilMs=Math.min(now+L.leaseMs,session.absoluteUntilMs);
  return {result:{recordId:sessionId,version:session.version+1,data:{sessionId,serverNowMs:now,leaseUntilMs,absoluteUntilMs:session.absoluteUntilMs,intervalMs:L.intervalMs}},apply(){tx.update(sessionRef,{leaseUntilMs,version:session.version+1});tx.set(lockRef,{sessionId,active:true,leaseUntilMs});}};
 }
 if(request.action!=='tracking.points')fail('Invalid tracking action.');
 // Stop/expiry prevents further capture, but an admitted pre-stop sample can
 // still flush under current assignment for its bounded 24-hour lookback.
 const existingLatest=(await tx.get(ref('locations',session.shipmentId))).data();let latest=existingLatest,sequence=session.lastSequence,captured=session.lastCapturedAtMs;const writes=[];
 if(existingLatest&&existingLatest.ownerId!==scope)fail('authority_changed');
 for(const point of payload.points){
  const sampleRef=ref('locationEvents',digest([scope,sessionId,point.sampleId])),existing=(await tx.get(sampleRef)).data(),pointHash=digest(point);
  if(existing){if(existing.mobilePointHash!==pointHash)fail('invalid_clock');continue;}
  if(point.capturedAtMs>session.leaseUntilMs||point.capturedAtMs>session.absoluteUntilMs||(session.stoppedAtMs&&point.capturedAtMs>session.stoppedAtMs))fail('expired_capture');
  if(point.sequence<=sequence||point.capturedAtMs<captured||point.capturedAtMs<session.startedAtMs-L.clockToleranceMs||point.capturedAtMs>now+L.clockToleranceMs||point.capturedAtMs<now-L.lookbackMs)fail('invalid_clock');
  const record={ownerId:scope,shipmentId:session.shipmentId,actor,...point,sessionId,mobilePointHash:pointHash,submittedAt:stamp()};writes.push([sampleRef,record]);if(shouldReplaceLatest(record,latest))latest=record;sequence=point.sequence;captured=point.capturedAtMs;
 }
 const latestChanged=latest!==existingLatest;
 return {result:{recordId:sessionId,version:session.version+1,data:{accepted:payload.points.length,latestChanged}},apply(){for(const [r,v]of writes)tx.create(r,v);if(latestChanged)tx.set(ref('locations',session.shipmentId),latest);tx.update(sessionRef,{lastSequence:sequence,lastCapturedAtMs:captured,version:session.version+1});}};
}
export function createMobileCommands({identity,clock=Date.now}={}){
 const live=identity||getAuth();
 const read=async(auth,scope,input,work)=>{await mobileIdentity(auth,live);return approvedTransaction(auth,['Driver'],async(tx,config)=>{if(scope!==undefined&&scope!==config.dataScopeId)fail('The data source cannot be changed.','permission-denied');return work(tx,config.dataScopeId,input);});};
 return {
  async getMobileAvailability(auth,scope,input){completionExact(input,[]);await mobileIdentity(auth,live);return {available:true,protocol:MOBILE_PROTOCOL};},
  async getMobileAccessContext(auth,scope,input){completionExact(input,[]);await mobileIdentity(auth,live);return getFirestore().runTransaction(async tx=>{const config=(await tx.get(getFirestore().doc('system/config'))).data(),member=(await tx.get(ref('users',auth.uid))).data();if(scope!==undefined&&scope!==config?.dataScopeId)fail('Wrong data source.','permission-denied');const approved=member?.active===true&&member.status==='Approved'&&ROLES.includes(member.role);return {uid:auth.uid,scope:approved?config?.dataScopeId:null,role:approved?member.role:null,mode:approved?(member.role==='Driver'?'Driver':'Recovery only'):'Waiting',protocol:MOBILE_PROTOCOL};});},
  async mintMobileWebSession(auth,scope,input){completionExact(input,[]);await mobileIdentity(auth,live);const context=await this.getMobileAccessContext(auth,scope,{});if(context.mode==='Waiting')fail('Account approval is required.','permission-denied');return {uid:auth.uid,customToken:await live.createCustomToken(auth.uid)};},
  getMobileAssignments(auth,scope,input){const p=completionExact(input,[],['cursor']);if(p.cursor!==undefined&&p.cursor!==null)completionIdentifier(p.cursor);return read(auth,scope,p,async(tx,s)=>{let query=getFirestore().collection('transportPlans').where('ownerId','==',s).where('driverUid','==',auth.uid).where('status','==','Scheduled').orderBy('__name__').limit(20);if(p.cursor)query=query.startAfter(p.cursor);const page=await tx.get(query),items=[];for(const row of page.docs){try{items.push(await projection(tx,s,auth.uid,row.id));}catch(error){if(!['assignment_changed','delivery_closed'].includes(error.message))throw error;}}return validateMobilePage({items,cursor:page.docs.length===20?page.docs.at(-1).id:null,verifiedAtMs:clock()});});},
  getMobileShipment(auth,scope,input){const p=completionExact(input,['shipmentId']);return read(auth,scope,p,(tx,s)=>projection(tx,s,auth.uid,p.shipmentId));},
  async mobileCommand(auth,scope,input){
   const request=validateMobileRequest(input);
   if(request.action.startsWith('evidence.')){const {mobileEvidenceOperation}=await import('./mobileEvidence.mjs');return mobileEvidenceOperation({auth,scope,input,identity:live,clock});}
   return runMobileOperation({auth,scope,input,identity:live,clock,work:async(tx,context)=>{
    if(request.action.startsWith('tracking.'))return trackingWork(tx,context);
    const {shipment,plan,old}=await mobileAssigned(tx,context.scope,context.actor,context.payload.shipmentId);
    if(old.version!==context.payload.expectedVersion||shipment.version!==context.payload.expectedShipmentVersion||plan.version!==context.payload.expectedAssignmentVersion)fail('stale_version');
    return prepareDeliveryTransition(tx,{...context,shipment,plan,old,command:{...context.payload,version:context.payload.expectedVersion}});
   }});
  },
  resolveMobileCommand(auth,scope,input){return runMobileOperation({auth,scope,input,identity:live,clock,resolveOnly:true});},
 };
}
