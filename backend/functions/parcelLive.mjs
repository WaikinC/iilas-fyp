import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {createHash,randomUUID} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {runParcelLiveOperation,guardParcelLiveOperation,guardParcelLiveTransaction,parcelLiveOperationDeadline,tightenParcelLiveOperationDeadline,onParcelLiveCancel} from './parcelLiveDeadline.mjs';
import {parcelLiveAcceptance,requireParcelLiveAcceptance} from './parcelLiveAcceptance.mjs';
import {validateParcelLiveResponse} from './parcelLiveResponse.mjs';
import {selectParcelLocalEvaluationModel,assertParcelLocalEvaluationAuthority,isParcelLocalEvaluationModel} from './parcelLocalEvaluation.mjs';
import {validateParcelLocalEvaluationLiveResponse} from './parcelLocalEvaluationResponse.mjs';
import {PARCEL_LIVE_POLICY as POLICY,canonicalParcelLiveValue,parcelLiveStartReceiptKey,parcelLiveActorLockKey,parcelLiveFrameKey,parcelLiveIngestDigest,validateStartParcelLiveSession,validateReserveParcelLiveFrame,validateAnalyseParcelLiveFrame,validateResolveParcelLiveSession,validateResolveParcelLiveFrame,validateStopParcelLiveSession,validateReviewParcelLiveFrame,canStartParcelLive,canReserveParcelLiveFrame,canCompleteParcelLiveFrame,parcelLiveSessionExpiresAt,parcelLiveFrameExpiresAt,matchesParcelLiveActorLock,matchesParcelLiveFrameClaim,toPublicParcelLiveSession,toPublicParcelLiveFrame,reviewParcelLiveFrameRecord} from './parcelLive.js';

const db=()=>getFirestore(),ref=(kind,id)=>db().collection(kind).doc(id);
const digest=value=>createHash('sha256').update(canonicalParcelLiveValue(value)).digest('hex');
const same=(a,b)=>canonicalParcelLiveValue(a)===canonicalParcelLiveValue(b);
const fail=(code='failed-precondition')=>{const e=new Error(code==='permission-denied'?'Your account cannot perform this live parcel operation.':code==='not-found'?'The live parcel record was not found.':code==='unavailable'?'The live parcel outcome could not be saved. Resolve the saved operation before trying again.':'The live parcel operation is invalid, changed or requires reconciliation.');e.code=code;e.liveSafe=true;throw e;};
const problem=reasonCode=>Object.assign(new Error('Live parcel resource failed.'),{reasonCode});
const safe=fn=>(...args)=>runParcelLiveOperation(async()=>{try{return await fn(...args);}catch(e){if(e.liveSafe)throw e;if(e.code==='permission-denied')fail('permission-denied');if(e.code==='unavailable')fail('unavailable');fail();}});
const scoped=(snapshot,scope)=>{const r=snapshot.data();if(!r||r.ownerId!==scope)fail('not-found');return r;};
const selectedModel=()=>{try{return requireParcelLiveAcceptance(parcelLiveAcceptance);}catch{return selectParcelLocalEvaluationModel('sampled-live');}};
function localAuthority(model){try{assertParcelLocalEvaluationAuthority(model);}catch{fail('unavailable');}}
const serviceReady=()=>Boolean(process.env.RESEARCH_API_URL&&process.env.RESEARCH_API_TOKEN);
const actorKey=(scope,actor)=>parcelLiveActorLockKey(scope,actor);
const frameKey=(scope,sessionId,frameId)=>parcelLiveFrameKey(scope,sessionId,frameId);
async function scopedTx(auth,scope,roles,work){guardParcelLiveOperation();return approvedTransaction(auth,roles,async(tx,config,account)=>{guardParcelLiveOperation();if(config.dataScopeId!==scope)fail('permission-denied');return work(tx,config,account);},guardParcelLiveTransaction);}
async function context(tx,scope,shipmentId){const shipment=scoped(await tx.get(ref('shipments',shipmentId)),scope),plan=(await tx.get(ref('transportPlans',shipmentId))).data()??null;return {shipment,plan};}
const snapshot=(config,account,{shipment,plan})=>({config:{dataScopeId:config.dataScopeId,version:config.version??null},account:{version:account.version??null,role:account.role,status:account.status,active:account.active},shipment:{ownerId:shipment.ownerId,status:shipment.status,version:shipment.version??null},plan:plan?{ownerId:plan.ownerId,version:plan.version??null,driverUid:plan.driverUid??null}:null});
const eligible=(scope,actor,account,stage,{shipment,plan})=>(!plan||plan.ownerId===scope)&&canStartParcelLive({account,scopeId:scope,ownerId:shipment.ownerId,role:account.role,actorUid:actor,stage,shipmentStatus:shipment.status,assignedDriverUid:plan?.driverUid});
const blank={label:null,probabilities:null,confidence:null,confidenceMeaning:null,serviceRequestId:null,processingTimeMs:null,totalProcessingTimeMs:null,humanReviewRequired:false,reviewStatus:'NotApplicable',reviewNotes:null,reviewedBy:null,reviewedAt:null};
const busy=sessionId=>({state:'Busy',sessionId,reasonCode:'session-busy'});

async function load(tx,scope,sessionId,newSessionWork,internalCleanup=false){
  const session=scoped(await tx.get(ref('parcelLiveSessions',sessionId)),scope);
  if(!internalCleanup)localAuthority(session.model);
  if(session.sessionId!==sessionId)fail();toPublicParcelLiveSession(session);
  if(newSessionWork)newSessionWork(session);
  const key=await parcelLiveStartReceiptKey(scope,session.actorUid,session.operationId),receipt=(await tx.get(ref('parcelLiveStartRequests',key))).data();
  const lock=(await tx.get(ref('parcelLiveActorLocks',await actorKey(scope,session.actorUid)))).data()??null;
  if(!receipt||receipt.state!=='Started'||receipt.startReceiptKey!==key||receipt.ownerId!==scope||receipt.actorUid!==session.actorUid||receipt.sessionId!==sessionId||receipt.input.operationId!==session.operationId||receipt.input.shipmentId!==session.shipmentId||receipt.input.stage!==session.stage||receipt.commandHash!==digest(receipt.input)||receipt.expiresAt!==session.expiresAt||!same(receipt.model,session.model)||!same(receipt.policy,session.policy))fail();
  let frame=null,frameReceipt=null;
  if(session.inFlightFrameId){const fk=await frameKey(scope,sessionId,session.inFlightFrameId);frame=scoped(await tx.get(ref('parcelLiveFrames',fk)),scope);frameReceipt=(await tx.get(ref('parcelLiveFrameRequests',fk))).data();if(!frameMatches(receipt,frameReceipt,frame)||!matchesParcelLiveActorLock(receipt,lock))fail();}
  return {session,receipt,lock,frame,frameReceipt};
}
function frameMatches(start,receipt,frame){
  return !!(receipt&&frame&&matchesParcelLiveActorLock(start,receipt)&&receipt.frameId===frame.frameId&&receipt.frameReceiptKey===digest({kind:'parcel-live-frame',ownerId:frame.ownerId,sessionId:frame.sessionId,frameId:frame.frameId})&&receipt.frameExpiresAt===frame.expiresAt&&receipt.sequence===frame.sequence&&receipt.generation===frame.sessionGeneration&&receipt.commandHash===digest(receipt.input)&&['ownerId','actorUid','sessionId'].every(k=>start[k]===frame[k])&&['sessionId','frameId','sequence','sha256','bytes','width','height','capturedAtClient'].every(k=>receipt.input[k]===frame[k])&&same(frame.model,start.model)&&same(frame.policy,start.policy));
}
function finishFrame(tx,b,frame,receipt,outcome,time){
  if(!['Reserved','Running'].includes(frame.state))return toPublicParcelLiveFrame(frame);
  if(!frameMatches(b.receipt,receipt,frame))fail();
  const inferred=['Predicted','Abstained'].includes(outcome.state),terminal=toPublicParcelLiveFrame({...frame,...blank,...outcome,version:inferred?3:frame.version+1,updatedAt:time,completedAt:time,humanReviewRequired:inferred,reviewStatus:inferred?'Pending':'NotApplicable',reasonCode:inferred?null:outcome.reasonCode});
  tx.set(ref('parcelLiveFrames',receipt.frameReceiptKey),terminal);
  return terminal;
}
function closeSession(tx,b,state,reason,time){
  const {session,receipt,lock,frame,frameReceipt}=b;if(session.state!=='Open')return toPublicParcelLiveSession(session);
  if(frame){const expired=time>=frame.expiresAt;finishFrame(tx,b,frame,frameReceipt,{state:expired?'Expired':state==='Stopped'?'Cancelled':'Stale',reasonCode:expired?'frame-expired':state==='Stopped'?'session-stopped':reason},time);}
  const terminal=toPublicParcelLiveSession({...session,state,reasonCode:reason,stoppedAt:state==='Stopped'?time:null,updatedAt:time,generation:session.generation+1,version:session.version+1,inFlightFrameId:null,completedCount:session.completedCount+(frame?1:0)});
  tx.set(ref('parcelLiveSessions',session.sessionId),terminal);
  if(matchesParcelLiveActorLock(receipt,lock))tx.delete(ref('parcelLiveActorLocks',digest({kind:'parcel-live-actor-lock',ownerId:receipt.ownerId,actorUid:receipt.actorUid})));
  return terminal;
}
function staleReason(b,config,account,current){
  const fresh=snapshot(config,account,current);
  if(!same(b.receipt.model,selectedModel())||!same(b.receipt.policy,POLICY))return 'model-changed';
  if(!same(b.receipt.snapshot,fresh)||!eligible(b.session.ownerId,b.session.actorUid,account,b.session.stage,current))return same(b.receipt.snapshot.account,fresh.account)?'context-changed':'access-changed';
  return null;
}
function ensureOpen(b,actor,time){if(b.session.actorUid!==actor)fail('permission-denied');if(b.session.state!=='Open'||time>=b.session.expiresAt||!matchesParcelLiveActorLock(b.receipt,b.lock))fail();}

export const startParcelLiveSession=safe(async(auth,scope,input)=>{
  const data=validateStartParcelLiveSession(input),key=await parcelLiveStartReceiptKey(scope,auth.uid,data.operationId),lk=await actorKey(scope,auth.uid);
  return scopedTx(auth,scope,ROLES,async(tx,config,account)=>{
    const old=(await tx.get(ref('parcelLiveStartRequests',key))).data();
    if(old){if(old.ownerId!==scope||old.actorUid!==auth.uid||old.commandHash!==digest(data)||!same(old.input,data))fail();if(old.state==='Blocked'){const blocking=scoped(await tx.get(ref('parcelLiveSessions',old.sessionId)),scope);localAuthority(blocking.model);return busy(old.sessionId);}return toPublicParcelLiveSession((await load(tx,scope,old.sessionId)).session);}
    const current=await context(tx,scope,data.shipmentId);if(!eligible(scope,auth.uid,account,data.stage,current))fail('permission-denied');
    const lock=(await tx.get(ref('parcelLiveActorLocks',lk))).data();
    if(lock){const blocking=scoped(await tx.get(ref('parcelLiveSessions',lock.sessionId)),scope);localAuthority(blocking.model);if(blocking.actorUid!==auth.uid||lock.actorUid!==auth.uid||lock.ownerId!==scope)fail();tx.create(ref('parcelLiveStartRequests',key),{ownerId:scope,actorUid:auth.uid,input:data,commandHash:digest(data),state:'Blocked',sessionId:lock.sessionId,createdAt:Date.now()});return busy(lock.sessionId);}
    const model=selectedModel(),createdAt=Date.now(),sessionId=randomUUID(),reasonCode=!model?'model-unavailable':!serviceReady()?'service-unavailable':null;
    const session=toPublicParcelLiveSession({ownerId:scope,actorUid:auth.uid,sessionId,...data,policy:POLICY,model,state:reasonCode?'Unavailable':'Open',createdAt,updatedAt:createdAt,expiresAt:parcelLiveSessionExpiresAt(createdAt),stoppedAt:null,version:1,generation:1,reservedCount:0,completedCount:0,inFlightFrameId:null,lastReservedAt:null,reasonCode});
    const receipt={ownerId:scope,actorUid:auth.uid,sessionId,startReceiptKey:key,nonce:randomUUID(),generation:1,expiresAt:session.expiresAt,state:'Started',input:data,commandHash:digest(data),snapshot:snapshot(config,account,current),model,policy:POLICY};
    tx.create(ref('parcelLiveStartRequests',key),receipt);tx.create(ref('parcelLiveSessions',sessionId),session);if(session.state==='Open')tx.create(ref('parcelLiveActorLocks',lk),{ownerId:scope,actorUid:auth.uid,sessionId,startReceiptKey:key,nonce:receipt.nonce,generation:1,expiresAt:session.expiresAt});return session;
  });
});
export const reserveParcelLiveFrame=safe(async(auth,scope,input)=>{
  const data=validateReserveParcelLiveFrame(input),fk=await frameKey(scope,data.sessionId,data.frameId);
  return scopedTx(auth,scope,ROLES,async(tx,config,account)=>{
    const old=(await tx.get(ref('parcelLiveFrameRequests',fk))).data();
    const b=await load(tx,scope,data.sessionId,old?undefined:session=>{if(session.actorUid!==auth.uid)fail('permission-denied');if(session.state!=='Open')fail();tightenParcelLiveOperationDeadline(session.expiresAt);});
    if(old){const f=scoped(await tx.get(ref('parcelLiveFrames',fk)),scope);if(b.session.actorUid!==auth.uid||!same(old.input,data)||old.commandHash!==digest(data)||!frameMatches(b.receipt,old,f))fail();return toPublicParcelLiveFrame(f);}
    const current=await context(tx,scope,b.session.shipmentId),time=Date.now();ensureOpen(b,auth.uid,time);if(staleReason(b,config,account,current))fail();if(!canReserveParcelLiveFrame(b.session,time))fail();
    const f=toPublicParcelLiveFrame({ownerId:scope,sessionId:data.sessionId,frameId:data.frameId,sequence:data.sequence,actorUid:auth.uid,shipmentId:b.session.shipmentId,stage:b.session.stage,policy:POLICY,model:b.session.model,...data,contentType:'image/jpeg',reservedAt:time,expiresAt:parcelLiveFrameExpiresAt(time,b.session.expiresAt),updatedAt:time,completedAt:null,state:'Reserved',version:1,sessionGeneration:b.session.generation,...blank,reasonCode:null,retention:'Unverified',image:null});
    if(data.sequence!==b.session.reservedCount+1)fail();const receipt={...b.receipt,input:data,commandHash:digest(data),frameId:data.frameId,frameReceiptKey:fk,sequence:data.sequence,frameNonce:randomUUID(),frameExpiresAt:f.expiresAt};
    tx.create(ref('parcelLiveFrameRequests',fk),receipt);tx.create(ref('parcelLiveFrames',fk),f);tx.set(ref('parcelLiveSessions',data.sessionId),toPublicParcelLiveSession({...b.session,version:b.session.version+1,reservedCount:data.sequence,lastReservedAt:time,inFlightFrameId:data.frameId,updatedAt:time}));return f;
  });
});
async function getFrame(tx,scope,b,frameId){const fk=await frameKey(scope,b.session.sessionId,frameId),f=scoped(await tx.get(ref('parcelLiveFrames',fk)),scope),r=(await tx.get(ref('parcelLiveFrameRequests',fk))).data();if(!frameMatches(b.receipt,r,f))fail();toPublicParcelLiveFrame(f);return {f,r};}
async function claim(auth,scope,data,ingestHash){return scopedTx(auth,scope,ROLES,async(tx,config,account)=>{
  const b=await load(tx,scope,data.sessionId),{f,r}=b.frame?.frameId===data.frameId?{f:toPublicParcelLiveFrame(b.frame),r:b.frameReceipt}:await getFrame(tx,scope,b,data.frameId);
  if(f.actorUid!==auth.uid)fail('permission-denied');
  if(r.ingestHash!==undefined){if(r.ingestHash!==ingestHash)fail();return {result:toPublicParcelLiveFrame(f)};}
  if(f.state!=='Reserved')fail();tightenParcelLiveOperationDeadline(Math.min(f.expiresAt,b.session.expiresAt));
  const current=await context(tx,scope,f.shipmentId),time=Date.now();ensureOpen(b,auth.uid,time);if(!serviceReady()||staleReason(b,config,account,current)||b.session.inFlightFrameId!==f.frameId||!matchesParcelLiveFrameClaim(r,b.frameReceipt)||time>=f.expiresAt)fail();
  // Only the digest survives ingestion. Running replay never decodes or writes.
  const running=toPublicParcelLiveFrame({...f,state:'Running',version:2,updatedAt:time,retention:'Unknown'});
  tx.update(ref('parcelLiveFrameRequests',r.frameReceiptKey),{ingestHash});tx.set(ref('parcelLiveFrames',r.frameReceiptKey),running);return {b,frame:running,receipt:{...r,ingestHash}};
});}
async function complete(auth,scope,expected,outcome,deadline,{checkpoint=false}={}){return scopedTx(auth,scope,ROLES,async(tx,config,account)=>{
  const b=await load(tx,scope,expected.sessionId,undefined,true),{f,r}=await getFrame(tx,scope,b,expected.frameId);
  if(!same(r,expected)||!matchesParcelLiveFrameClaim(r,expected))fail();if(!['Reserved','Running'].includes(f.state))return toPublicParcelLiveFrame(f);
  const current=await context(tx,scope,f.shipmentId),reason=staleReason(b,config,account,current),time=Date.now();
  if(time>=b.session.expiresAt){closeSession(tx,b,'Expired','session-expired',time);return toPublicParcelLiveFrame({...f,...blank,state:'Expired',reasonCode:'frame-expired',completedAt:time,updatedAt:time,version:f.version+1});}
  if(reason){closeSession(tx,b,'Stale',reason,time);return toPublicParcelLiveFrame({...f,...blank,state:time>=f.expiresAt?'Expired':'Stale',reasonCode:time>=f.expiresAt?'frame-expired':reason,completedAt:time,updatedAt:time,version:f.version+1});}
  if(b.session.state!=='Open'||b.session.inFlightFrameId!==f.frameId||!matchesParcelLiveActorLock(r,b.lock)||!matchesParcelLiveFrameClaim(r,b.frameReceipt))fail();
  if(time<f.expiresAt&&!canCompleteParcelLiveFrame(b.session,f,time))fail();
  if(checkpoint&&time<Math.min(f.expiresAt,deadline)){const updated=toPublicParcelLiveFrame({...f,retention:'Verified',image:outcome.image});tx.set(ref('parcelLiveFrames',r.frameReceiptKey),updated);return updated;}
  const chosen=time>=f.expiresAt?{state:'Expired',reasonCode:'frame-expired'}:time>=deadline?{state:'Failed',reasonCode:'time-limit'}:outcome;
  const out=finishFrame(tx,b,f,r,chosen,time);tx.set(ref('parcelLiveSessions',f.sessionId),toPublicParcelLiveSession({...b.session,inFlightFrameId:null,completedCount:b.session.completedCount+1,version:b.session.version+1,updatedAt:time}));return out;
});}
// Revocation cannot prevent internal null cleanup. No read authority or business
// permission is granted by this path, and every original coordinate is checked.
async function cleanup(expected){guardParcelLiveOperation();await db().runTransaction(async original=>{
  const tx=guardParcelLiveTransaction(original);
  const b=await load(tx,expected.ownerId,expected.sessionId,undefined,true),{f,r}=await getFrame(tx,expected.ownerId,b,expected.frameId);if(!same(r,expected)||!matchesParcelLiveFrameClaim(r,expected)||!['Reserved','Running'].includes(f.state))return;
  const time=Date.now();if(b.session.state==='Open')closeSession(tx,b,time>=b.session.expiresAt?'Expired':'Stale',time>=b.session.expiresAt?'session-expired':'access-changed',time);
  guardParcelLiveOperation();
});}
async function bounded(work,ms,cancel=()=>{}){if(ms<=0)throw problem('time-limit');let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>{cancel();reject(problem('time-limit'));},ms);})]);}finally{clearTimeout(timer);}}
const remaining=(deadline,limit)=>Math.min(limit,deadline-Date.now());
function jpegDimensions(b){
  if(b.length<4||b[0]!==255||b[1]!==216)throw problem('invalid-image');
  let pos=2,width,height,components,scans=0,segments=0,inScan=false;
  while(pos<b.length){
    if(++segments>8192)throw problem('resource-limit');
    if(inScan){while(pos<b.length&&b[pos]!==255)pos++;if(pos>=b.length)break;while(b[pos]===255)pos++;const m=b[pos++];if(m===0||m>=208&&m<=215)continue;inScan=false;pos-=2;}
    if(b[pos++]!==255)throw problem('invalid-image');while(b[pos]===255)pos++;const marker=b[pos++];
    if(marker===217){if(!width||!scans||pos!==b.length)throw problem('invalid-image');return {width,height};}
    if(marker===216||marker===0||marker===1||marker>=208&&marker<=215||pos+2>b.length)throw problem('invalid-image');
    const length=b.readUInt16BE(pos);if(length<2||pos+length>b.length)throw problem('invalid-image');const end=pos+length;
    if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){
      if(![192,193,194].includes(marker)||width||length<8||b[pos+2]!==8)throw problem('invalid-image');height=b.readUInt16BE(pos+3);width=b.readUInt16BE(pos+5);const n=b[pos+7];if(![1,3].includes(n)||length!==8+3*n||!width||!height||Math.max(width,height)>960)throw problem('invalid-image');components=new Set();for(let i=0;i<n;i++){const p=pos+8+3*i,sampling=b[p+1];if(components.has(b[p])||!(sampling>>4)||!(sampling&15)||(sampling>>4)>4||(sampling&15)>4||b[p+2]>3)throw problem('invalid-image');components.add(b[p]);}
    }
    if(marker===218){const n=b[pos+2];if(!width||!n||n>components.size||length!==6+2*n)throw problem('invalid-image');const seen=new Set();for(let i=0;i<n;i++){const id=b[pos+3+2*i];if(!components.has(id)||seen.has(id))throw problem('invalid-image');seen.add(id);}scans++;inScan=true;}
    if(marker===220)throw problem('invalid-image');pos=end;
  }throw problem('invalid-image');
}
function verifyBytes(buffer,f){if(buffer.length>1048576)throw problem('resource-limit');if(buffer.length!==f.bytes||createHash('sha256').update(buffer).digest('hex')!==f.sha256)throw problem('invalid-image');const d=jpegDimensions(buffer);if(d.width!==f.width||d.height!==f.height)throw problem('invalid-image');return buffer;}
const objectPath=f=>`parcel-live/${f.ownerId}/${f.sessionId}/${f.frameId}`;
function storageObject(f,deadline,generation){
  guardParcelLiveOperation();
  const object=getStorage().bucket(process.env.EVIDENCE_BUCKET||'fyp-inventory-and-logistics.firebasestorage.app').file(objectPath(f),generation?{generation}:undefined);
  // Isolated File interceptors avoid changing the shared Admin client. The
  // underlying GCS request layer supports maxRetries and native timeout; the
  // independent outer deadline still fences a transport ignoring cancellation.
  object.interceptors.push({request:options=>({...options,maxRetries:0,timeout:Math.max(1,remaining(deadline,10000))})});return object;
}
function identity(metadata,f){if(!metadata||metadata.contentType!=='image/jpeg'||String(metadata.size)!==String(f.bytes)||!['generation','metageneration'].every(k=>typeof metadata[k]==='string'&&/^[1-9][0-9]{0,19}$/.test(metadata[k])))throw problem('storage-failed');return {generation:metadata.generation,metageneration:metadata.metageneration,sha256:f.sha256,bytes:f.bytes,width:f.width,height:f.height,contentType:'image/jpeg'};}
async function retain(buffer,f,deadline){let stream,cancelled=false;const cancel=()=>{cancelled=true;stream?.destroy(problem('time-limit'));},unsubscribe=onParcelLiveCancel(cancel);try{return await bounded(async()=>{
  const object=storageObject(f,deadline);
  guardParcelLiveOperation();await new Promise((resolve,reject)=>{stream=object.createWriteStream({resumable:false,validation:'crc32c',timeout:Math.max(1,remaining(deadline,10000)),metadata:{contentType:'image/jpeg'},preconditionOpts:{ifGenerationMatch:0}});stream.once('error',reject);stream.once('finish',resolve);stream.end(buffer);});guardParcelLiveOperation();if(cancelled)throw problem('time-limit');
  // File.metadata is the successful upload acknowledgement, assigned by GCS
  // before finish. Never ask latest metadata to invent that write's identity.
  const acknowledged=identity(object.metadata,f),pinned=storageObject(f,deadline,acknowledged.generation),[metadata]=await pinned.getMetadata();guardParcelLiveOperation();if(cancelled)throw problem('time-limit');if(!same(identity(metadata,f),acknowledged))throw problem('storage-failed');return acknowledged;
},remaining(deadline,10000),cancel);}catch(e){throw e.liveDeadline||e.reasonCode?e:problem('storage-failed');}finally{unsubscribe();stream?.destroy();}}
async function revalidate(f,deadline){let stream,cancelled=false;const cancel=()=>{cancelled=true;stream?.destroy(problem('time-limit'));},unsubscribe=onParcelLiveCancel(cancel);try{return await bounded(async()=>{
  const object=storageObject(f,deadline,f.image.generation),[before]=await object.getMetadata();guardParcelLiveOperation();if(cancelled||!same(identity(before,f),f.image))throw problem('storage-failed');stream=object.createReadStream();const buffer=Buffer.alloc(f.bytes);let size=0;for await(const chunk of stream){guardParcelLiveOperation();if(cancelled)throw problem('time-limit');const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);if(size+b.length>buffer.length)throw problem('resource-limit');b.copy(buffer,size);size+=b.length;}guardParcelLiveOperation();verifyBytes(buffer.subarray(0,size),f);const [after]=await object.getMetadata();guardParcelLiveOperation();if(cancelled||!same(identity(after,f),f.image))throw problem('storage-failed');
},remaining(deadline,10000),cancel);}catch(e){throw e.liveDeadline||e.reasonCode?e:problem('storage-failed');}finally{unsubscribe();stream?.destroy();}}
async function infer(buffer,f,deadline){const controller=new AbortController();let reader;const cancel=()=>{controller.abort();if(reader)void reader.cancel().catch(()=>{});},unsubscribe=onParcelLiveCancel(cancel);try{return await bounded(async()=>{
  localAuthority(f.model);
  guardParcelLiveOperation();const response=await fetch(`${process.env.RESEARCH_API_URL.replace(/\/$/,'')}/predict/live-parcel`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.RESEARCH_API_TOKEN}`},body:JSON.stringify({intendedUse:'sampled-live',sessionId:f.sessionId,frameId:f.frameId,sequence:f.sequence,imageBase64:buffer.toString('base64')}),signal:controller.signal});if(controller.signal.aborted){void response.body?.cancel().catch(()=>{});throw problem('time-limit');}guardParcelLiveOperation();if(!response.ok){void response.body?.cancel().catch(()=>{});throw problem([429,503].includes(response.status)?'service-unavailable':'service-failed');}if(!response.body)throw problem('invalid-response');reader=response.body.getReader();const chunks=[];let size=0;while(true){guardParcelLiveOperation();const {done,value}=await reader.read();guardParcelLiveOperation();if(done)break;size+=value.byteLength;if(size>16384)throw problem('resource-limit');chunks.push(Buffer.from(value));}let parsed;try{parsed=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));return isParcelLocalEvaluationModel(f.model)?validateParcelLocalEvaluationLiveResponse(parsed,{model:f.model,evidenceSha256:f.sha256,sessionId:f.sessionId,frameId:f.frameId,sequence:f.sequence}):validateParcelLiveResponse(parsed,{acceptance:f.model,evidenceSha256:f.sha256,sessionId:f.sessionId,frameId:f.frameId,sequence:f.sequence});}catch{throw problem('invalid-response');}
},remaining(deadline,30000),cancel);}catch(e){throw e.liveDeadline||e.reasonCode?e:problem('service-failed');}finally{unsubscribe();cancel();}}
export const analyseParcelLiveFrame=safe(async(auth,scope,input)=>{
  const operationDeadline=parcelLiveOperationDeadline(),data=validateAnalyseParcelLiveFrame(input),ingestHash=await parcelLiveIngestDigest(data),claimed=await claim(auth,scope,data,ingestHash);if(claimed.result)return claimed.result;
  const f=claimed.frame,expected=claimed.receipt,deadline=Math.min(operationDeadline,f.expiresAt,expected.expiresAt);let outcome;
  try{
    // Acceptance and original protected context have been checked before decode.
    if(Date.now()>=deadline)throw problem('time-limit');
    const buffer=verifyBytes(Buffer.from(data.jpegBase64,'base64'),f),image=await retain(buffer,f,deadline),checkpoint=await complete(auth,scope,expected,{image},deadline,{checkpoint:true});
    if(checkpoint.state!=='Running')return checkpoint;
    const result=await infer(buffer,checkpoint,deadline);outcome={state:result.status==='predicted'?'Predicted':'Abstained',label:result.label,probabilities:result.probabilities,confidence:result.confidence,confidenceMeaning:'uncalibrated',serviceRequestId:result.requestId,processingTimeMs:result.processingTimeMs,totalProcessingTimeMs:result.totalProcessingTimeMs};
  }catch(e){if(e.liveDeadline)throw e;if(e.code==='permission-denied'){await cleanup(expected);throw e;}const reason=e.reasonCode||'service-failed';outcome={state:reason==='service-unavailable'?'Unavailable':'Failed',reasonCode:reason};}
  try{return await complete(auth,scope,expected,outcome,deadline);}catch(e){if(e.liveDeadline)throw e;try{await cleanup(expected);}catch{fail('unavailable');}if(e.code==='permission-denied')throw e;return resolveParcelLiveFrame(auth,scope,{sessionId:f.sessionId,frameId:f.frameId});}
});
async function resolve(auth,scope,data,wantFrame){return scopedTx(auth,scope,ROLES,async tx=>{
  const b=await load(tx,scope,data.sessionId),target=wantFrame?await getFrame(tx,scope,b,data.frameId):null,time=Date.now();
  if(b.session.state==='Open'&&time>=b.session.expiresAt){const out=closeSession(tx,b,'Expired','session-expired',time);if(!wantFrame)return out;if(target.f.frameId===b.frame?.frameId)return toPublicParcelLiveFrame({...target.f,...blank,state:'Expired',reasonCode:'frame-expired',completedAt:time,updatedAt:time,version:target.f.version+1});}
  else if(b.frame&&time>=b.frame.expiresAt){const out=finishFrame(tx,b,b.frame,b.frameReceipt,{state:'Expired',reasonCode:'frame-expired'},time);tx.set(ref('parcelLiveSessions',b.session.sessionId),toPublicParcelLiveSession({...b.session,inFlightFrameId:null,completedCount:b.session.completedCount+1,version:b.session.version+1,updatedAt:time}));if(wantFrame&&target.f.frameId===b.frame.frameId)return out;if(!wantFrame)return toPublicParcelLiveSession({...b.session,inFlightFrameId:null,completedCount:b.session.completedCount+1,version:b.session.version+1,updatedAt:time});}
  return wantFrame?toPublicParcelLiveFrame(target.f):toPublicParcelLiveSession(b.session);
});}
export const resolveParcelLiveSession=safe((auth,scope,input)=>resolve(auth,scope,validateResolveParcelLiveSession(input),false));
export const resolveParcelLiveFrame=safe((auth,scope,input)=>resolve(auth,scope,validateResolveParcelLiveFrame(input),true));
export const stopParcelLiveSession=safe(async(auth,scope,input)=>{const data=validateStopParcelLiveSession(input);return scopedTx(auth,scope,ROLES,async(tx,_config,account)=>{const b=await load(tx,scope,data.sessionId);if(auth.uid!==b.session.actorUid&&!['Admin','Manager'].includes(account.role))fail('permission-denied');if(b.session.state!=='Open')return toPublicParcelLiveSession(b.session);const time=Date.now();return closeSession(tx,b,time>=b.session.expiresAt?'Expired':'Stopped',time>=b.session.expiresAt?'session-expired':'user-stop',time);});});
export const cleanupParcelLiveSession=safe(async(auth,scope,input)=>{
  const {sessionId}=validateResolveParcelLiveSession(input);
  return scopedTx(auth,scope,ROLES,async(tx,_config,account)=>{
    const b=await load(tx,scope,sessionId,undefined,true),{session,receipt,lock,frame,frameReceipt}=b;
    if(auth.uid!==session.actorUid&&!['Admin','Manager'].includes(account.role))fail('permission-denied');
    if(session.state!=='Open'&&!['Expired','Stale'].includes(session.state))return {released:false};
    validateStartParcelLiveSession(receipt.input);
    const original=receipt.snapshot;
    if(receipt.generation!==1||!matchesParcelLiveActorLock(receipt,receipt)||original?.config?.dataScopeId!==scope||original.shipment?.ownerId!==scope||original.plan&&original.plan.ownerId!==scope||!eligible(scope,session.actorUid,original.account,session.stage,{shipment:original.shipment,plan:original.plan}))fail();
    const current=await context(tx,scope,session.shipmentId);if(current.plan&&current.plan.ownerId!==scope)fail();
    if(session.state!=='Open'){
      if(session.generation!==receipt.generation+1)fail();
      if(lock&&!matchesParcelLiveActorLock(receipt,lock)&&(lock.sessionId===session.sessionId||lock.ownerId!==scope||lock.actorUid!==session.actorUid||!matchesParcelLiveActorLock(lock,lock)))fail();
      if(matchesParcelLiveActorLock(receipt,lock))tx.delete(ref('parcelLiveActorLocks',await actorKey(scope,session.actorUid)));
      return {released:true};
    }
    if(session.generation!==receipt.generation||!matchesParcelLiveActorLock(receipt,lock))fail();
    if(frame){
      toPublicParcelLiveFrame(frame);
      if(!['Reserved','Running'].includes(frame.state)||frame.shipmentId!==session.shipmentId||frame.stage!==session.stage||frame.sessionGeneration!==session.generation||frame.sequence!==session.reservedCount||frame.reservedAt!==session.lastReservedAt||frame.expiresAt!==Math.min(frame.reservedAt+60000,session.expiresAt)||!matchesParcelLiveFrameClaim(frameReceipt,frameReceipt))fail();
    }
    let authorityLost=false;
    if(isParcelLocalEvaluationModel(session.model)){try{assertParcelLocalEvaluationAuthority(session.model);}catch{authorityLost=true;}}
    const time=Date.now();if(time<session.expiresAt&&!authorityLost)return {released:false};
    closeSession(tx,b,time>=session.expiresAt?'Expired':'Stale',time>=session.expiresAt?'session-expired':'model-changed',time);
    return {released:true};
  });
});
export const reviewParcelLiveFrame=safe(async(auth,scope,input)=>{
  const deadline=parcelLiveOperationDeadline(),data=validateReviewParcelLiveFrame(input),prepared=await scopedTx(auth,scope,['Admin','Manager'],async(tx,config,account)=>{const b=await load(tx,scope,data.sessionId),{f}=await getFrame(tx,scope,b,data.frameId);reviewParcelLiveFrameRecord(f,data,{role:account.role,reviewerUid:auth.uid,nowMs:Date.now()});if(f.retention!=='Verified'||!f.image)fail();return {frame:f,account:snapshot(config,account,{shipment:{ownerId:scope,status:'Review',version:0},plan:null}).account,config:{dataScopeId:config.dataScopeId,version:config.version??null}};});
  await revalidate(prepared.frame,Math.min(deadline,Date.now()+10000));
  return scopedTx(auth,scope,['Admin','Manager'],async(tx,config,account)=>{const b=await load(tx,scope,data.sessionId),{f,r}=await getFrame(tx,scope,b,data.frameId);if(!same(f,prepared.frame)||!same({dataScopeId:config.dataScopeId,version:config.version??null},prepared.config)||!same({version:account.version??null,role:account.role,status:account.status,active:account.active},prepared.account)||Date.now()>=deadline)fail();const changed=reviewParcelLiveFrameRecord(f,data,{role:account.role,reviewerUid:auth.uid,nowMs:Date.now()});tx.set(ref('parcelLiveFrames',r.frameReceiptKey),changed);return changed;});
});
