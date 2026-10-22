import {canUploadEvidence} from './parcelEvidence.js';

// Pure shape/policy helpers are not authentication, transaction fences or model
// acceptance. Server callers supply protected scope, current authority and time.
const fail=(message='Invalid parcel live data.',code='invalid-argument')=>{const error=new Error(message);error.code=code;throw error;};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const data=(value,key)=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return !!descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.enumerable;};
const own=(value,keys)=>plain(value)&&keys.every(key=>data(value,key));
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const pair=value=>Array.isArray(value)&&value.length===2&&data(value,'0')&&data(value,'1')&&Reflect.ownKeys(value).length===3;
const stage=value=>value==='Pre-dispatch'||value==='Delivery';
const exact=(value,keys)=>{if(!own(value,keys)||Reflect.ownKeys(value).length!==keys.length)fail('Parcel live request contains missing or unsupported fields.');};
const time=value=>{if(!integer(value))fail('Invalid parcel live timestamp.');return value;};
const notes=value=>{if(typeof value!=='string'||value.trim().length<3||value.length>240||/[\u0000-\u001f\u007f]/.test(value))fail('Enter review notes from 3 to 240 characters.');return value.trim();};
const canonicalTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString()===value;
const clientTime=(value,nowMs)=>canonicalTime(value)&&integer(nowMs)&&Date.parse(value)<=nowMs+300000;
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export function canonicalParcelLiveValue(value) {
  const ancestors=new Set();
  const visit=current=>{
    if(current===null||typeof current==='string'||typeof current==='boolean')return JSON.stringify(current);
    if(finite(current)&&!Object.is(current,-0))return JSON.stringify(current);
    if(!current||typeof current!=='object'||ancestors.has(current))fail('Invalid canonical parcel live value.');
    ancestors.add(current);let result;
    if(Array.isArray(current)){
      if(Reflect.ownKeys(current).length!==current.length+1||Array.from({length:current.length},(_,index)=>String(index)).some(key=>!data(current,key)))fail('Canonical arrays must contain only dense data entries.');
      result=`[${Array.from({length:current.length},(_,index)=>visit(current[index])).join(',')}]`;
    }else{
      if(!plain(current)||Reflect.ownKeys(current).some(key=>typeof key!=='string'||!data(current,key)||['__proto__','constructor','prototype'].includes(key)))fail('Canonical objects must contain only safe own data fields.');
      result=`{${Object.keys(current).sort().map(key=>`${JSON.stringify(key)}:${visit(current[key])}`).join(',')}}`;
    }
    ancestors.delete(current);return result;
  };
  return visit(value);
}

// Keep this standalone server policy independent of the foreground controller.
// Drift is tested at integration, never resolved by silently changing limits.
const policyBody=freeze({version:'parcel-live-v1',intendedUse:'sampled-live',limits:{sessionMs:120000,maxFrames:12,minIntervalMs:5000,maxInFlight:1,maxQueued:0,maxBytes:1048576,maxLongEdge:960,maxBase64Chars:1398104,frameLeaseMs:60000,handlerDeadlineMs:50000,storageDeadlineMs:10000,httpDeadlineMs:30000,maxResponseBytes:16384,resultMaxAgeMs:15000,localFrameDeadlineMs:60000,submissionCooldownMs:5000},profile:{contentType:'image/jpeg',retention:'retained-evidence-no-auto-delete',visibility:'approved-fixed-scope',capture:'foreground-sampled-frames',audio:false,continuousVideo:false,automaticTraining:false}});
export const PARCEL_LIVE_POLICY=freeze({...policyBody,sha256:'50f4160d21f584110bbb7d68a6ff6552c2efe83bd14b119282d4b7a1e9217121'});
export const PARCEL_LIVE_SESSION_STATES=Object.freeze(['Open','Stopped','Unavailable','Expired','Stale']);
export const PARCEL_LIVE_FRAME_STATES=Object.freeze(['Reserved','Running','Predicted','Abstained','Unavailable','Failed','Stale','Expired','Cancelled']);
export const PARCEL_LIVE_TERMINAL_FRAME_STATES=Object.freeze(PARCEL_LIVE_FRAME_STATES.slice(2));
export const PARCEL_LIVE_REVIEW_STATUSES=Object.freeze(['NotApplicable','Pending','Accepted','Rejected','Reviewed']);
const reasons=freeze({
  'model-unavailable':['Unavailable','No evaluated live parcel model is available.'],
  'service-unavailable':['Unavailable','Live parcel analysis is temporarily unavailable.'],
  'invalid-image':['Failed','The sampled parcel image could not be verified.'],
  'storage-failed':['Failed','The sampled parcel image could not be retained.'],
  'service-failed':['Failed','Live parcel analysis could not be completed.'],
  'invalid-response':['Failed','Live parcel analysis returned an invalid result.'],
  'resource-limit':['Failed','Live parcel analysis exceeded its resource limit.'],
  'time-limit':['Failed','Live parcel analysis exceeded its time limit.'],
  'context-changed':['Stale','The shipment context changed during live analysis.'],
  'access-changed':['Stale','Access changed during live analysis.'],
  'model-changed':['Stale','The accepted live parcel model changed.'],
  'session-expired':['Expired','The live parcel session expired.'],
  'frame-expired':['Expired','No authoritative frame result was saved before expiry.'],
  'session-stopped':['Cancelled','The live parcel session was stopped.'],
  'user-stop':['Stopped','The live parcel session was stopped.'],
  'session-busy':['Busy','Another live parcel session requires reconciliation.'],
});
export const PARCEL_LIVE_REASON_CODES=Object.freeze(Object.keys(reasons));
export function parcelLiveReasonMessage(code){return Object.hasOwn(reasons,code)?reasons[code][1]:'The live parcel outcome is unavailable.';}

export function validateStartParcelLiveSession(input){exact(input,['shipmentId','stage','operationId']);if(!id(input.shipmentId)||!stage(input.stage)||!uuid(input.operationId))fail();return {shipmentId:input.shipmentId,stage:input.stage,operationId:input.operationId};}
export function validateReserveParcelLiveFrame(input,nowMs=Date.now()){
  const keys=['sessionId','frameId','sequence','bytes','sha256','width','height','capturedAtClient'];exact(input,keys);
  if(!uuid(input.sessionId)||!uuid(input.frameId)||!integer(input.sequence,1,12)||!integer(input.bytes,1,1048576)||!digest(input.sha256)||!integer(input.width,1,960)||!integer(input.height,1,960)||!clientTime(input.capturedAtClient,nowMs))fail('Invalid sampled frame declaration.');
  return Object.fromEntries(keys.map(key=>[key,input[key]]));
}
export function validateAnalyseParcelLiveFrame(input){
  exact(input,['sessionId','frameId','jpegBase64']);const encoded=input.jpegBase64;
  if(!uuid(input.sessionId)||!uuid(input.frameId)||typeof encoded!=='string'||encoded.length<4||encoded.length>1398104||encoded.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))fail('Invalid bounded sampled frame encoding.');
  const padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if(encoded.length/4*3-padding>1048576||(padding===2&&(alphabet.indexOf(encoded.at(-3))&15)!==0)||(padding===1&&(alphabet.indexOf(encoded.at(-2))&3)!==0))fail('Invalid canonical sampled frame encoding.');
  return {sessionId:input.sessionId,frameId:input.frameId,jpegBase64:encoded};
}
export function validateResolveParcelLiveSession(input){exact(input,['sessionId']);if(!uuid(input.sessionId))fail();return {sessionId:input.sessionId};}
export function validateResolveParcelLiveFrame(input){exact(input,['sessionId','frameId']);if(!uuid(input.sessionId)||!uuid(input.frameId))fail();return {sessionId:input.sessionId,frameId:input.frameId};}
export function validateStopParcelLiveSession(input){return validateResolveParcelLiveSession(input);}
export function validateReviewParcelLiveFrame(input){exact(input,['sessionId','frameId','version','decision','notes']);if(!uuid(input.sessionId)||!uuid(input.frameId)||!integer(input.version,1)||!['Accepted','Rejected','Reviewed'].includes(input.decision))fail();return {sessionId:input.sessionId,frameId:input.frameId,version:input.version,decision:input.decision,notes:notes(input.notes)};}

export async function parcelLiveDigest(value){const bytes=new TextEncoder().encode(canonicalParcelLiveValue(value));const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function parcelLiveStartReceiptKey(ownerId,actorUid,operationId){if(!id(ownerId)||!id(actorUid)||!uuid(operationId))fail();return parcelLiveDigest({kind:'parcel-live-start',ownerId,actorUid,operationId});}
export async function parcelLiveActorLockKey(ownerId,actorUid){if(!id(ownerId)||!id(actorUid))fail();return parcelLiveDigest({kind:'parcel-live-actor-lock',ownerId,actorUid});}
export async function parcelLiveFrameKey(ownerId,sessionId,frameId){if(!id(ownerId)||!uuid(sessionId)||!uuid(frameId))fail();return parcelLiveDigest({kind:'parcel-live-frame',ownerId,sessionId,frameId});}
export async function parcelLiveIngestDigest(input){const validated=validateAnalyseParcelLiveFrame(input);return parcelLiveDigest({kind:'parcel-live-ingest',...validated});}
export function canReadParcelLive({account,scopeId,ownerId}={}){return !!(account?.status==='Approved'&&account.active===true&&id(scopeId)&&scopeId===ownerId);}
export function canStartParcelLive(input={}){return canReadParcelLive(input)&&id(input.actorUid)&&canUploadEvidence(input);}
export function parcelLiveSessionExpiresAt(nowMs){time(nowMs);return time(nowMs+120000);}
export function parcelLiveFrameExpiresAt(nowMs,sessionExpiresAt){time(nowMs);time(sessionExpiresAt);if(nowMs>=sessionExpiresAt)fail();return Math.min(time(nowMs+60000),sessionExpiresAt);}

const lockKeys=['ownerId','actorUid','sessionId','startReceiptKey','nonce','generation','expiresAt'];
function validLock(value){return own(value,lockKeys)&&id(value.ownerId)&&id(value.actorUid)&&uuid(value.sessionId)&&digest(value.startReceiptKey)&&uuid(value.nonce)&&integer(value.generation,1)&&integer(value.expiresAt,1);}
export function matchesParcelLiveActorLock(claim,lock){return !!(validLock(claim)&&validLock(lock)&&lockKeys.every(key=>claim[key]===lock[key]));}
const frameClaimKeys=[...lockKeys,'frameId','frameReceiptKey','sequence','frameNonce','frameExpiresAt'];
function validClaim(value){return validLock(value)&&own(value,frameClaimKeys)&&uuid(value.frameId)&&digest(value.frameReceiptKey)&&integer(value.sequence,1,12)&&uuid(value.frameNonce)&&integer(value.frameExpiresAt,1)&&value.frameExpiresAt<=value.expiresAt;}
export function matchesParcelLiveFrameClaim(claim,lock){return !!(validClaim(claim)&&validClaim(lock)&&frameClaimKeys.every(key=>claim[key]===lock[key]));}

function safePolicy(value){
  if(!plain(value)||canonicalParcelLiveValue(value)!==canonicalParcelLiveValue(PARCEL_LIVE_POLICY))fail('Invalid live parcel policy.');
  return {...PARCEL_LIVE_POLICY,limits:{...PARCEL_LIVE_POLICY.limits},profile:{...PARCEL_LIVE_POLICY.profile}};
}
const modelKeys=['model','modelVersion','selectionSha256','evaluationSha256','acceptanceSha256','preprocessing','contrast','classOrder','intendedUse','policyVersion','policySha256'];
export function toSafeParcelLiveModel(value){
  if(value===null)return null;
  if(!own(value,modelKeys)||value.model!=='MobileNetV2'||value.intendedUse!=='sampled-live'||value.policyVersion!==PARCEL_LIVE_POLICY.version||value.policySha256!==PARCEL_LIVE_POLICY.sha256||!['modelVersion','selectionSha256','evaluationSha256','acceptanceSha256'].every(key=>digest(value[key]))||typeof value.preprocessing!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_. -]{0,255}$/.test(value.preprocessing)||!['none','clahe'].includes(value.contrast)||!pair(value.classOrder)||value.classOrder[0]!=='Normal'||value.classOrder[1]!=='Damaged')fail('Invalid accepted live parcel model lineage.');
  return Object.fromEntries(modelKeys.map(key=>[key,key==='classOrder'?['Normal','Damaged']:value[key]]));
}
function baseBindings(record,keys){
  if(!own(record,keys)||!['ownerId','actorUid','shipmentId'].every(key=>id(record[key]))||!uuid(record.sessionId)||!stage(record.stage))fail('Invalid live parcel identity.');
  return {ownerId:record.ownerId,sessionId:record.sessionId,actorUid:record.actorUid,shipmentId:record.shipmentId,stage:record.stage,policy:safePolicy(record.policy),model:toSafeParcelLiveModel(record.model)};
}
const sessionKeys=['ownerId','sessionId','actorUid','operationId','shipmentId','stage','policy','model','state','createdAt','updatedAt','expiresAt','stoppedAt','version','generation','reservedCount','completedCount','inFlightFrameId','lastReservedAt','reasonCode'];
export function toPublicParcelLiveSession(record){
  const safe=baseBindings(record,sessionKeys);
  if(!uuid(record.operationId)||!PARCEL_LIVE_SESSION_STATES.includes(record.state)||!integer(record.createdAt)||record.expiresAt!==parcelLiveSessionExpiresAt(record.createdAt)||!integer(record.updatedAt)||record.updatedAt<record.createdAt||!integer(record.version,1)||!integer(record.generation,1)||!integer(record.reservedCount,0,12)||!integer(record.completedCount,0,record.reservedCount)||!(record.inFlightFrameId===null||uuid(record.inFlightFrameId))||!(record.lastReservedAt===null||integer(record.lastReservedAt)&&record.lastReservedAt>=record.createdAt&&record.lastReservedAt<record.expiresAt)||((record.reservedCount===0)!==(record.lastReservedAt===null)))fail('Invalid live parcel session state.');
  if(record.inFlightFrameId!==null&&(record.reservedCount===0||record.completedCount>=record.reservedCount))fail('Invalid live parcel session slot.');
  if(record.state==='Open'){
    if(!safe.model||record.reasonCode!==null||record.stoppedAt!==null||record.generation!==1||record.updatedAt>=record.expiresAt)fail('Invalid open live parcel session.');
  }else{
    if(record.inFlightFrameId!==null||!Object.hasOwn(reasons,record.reasonCode)||reasons[record.reasonCode][0]!==record.state)fail('Invalid terminal live parcel session.');
    if(record.state==='Stopped'? !integer(record.stoppedAt)||record.stoppedAt!==record.updatedAt:record.stoppedAt!==null)fail('Invalid live parcel stop time.');
    if(record.state==='Unavailable'){
      if(record.generation!==1||record.version!==1||record.reservedCount!==0||record.completedCount!==0||record.updatedAt!==record.createdAt)fail('Unavailable live sessions cannot have acquired work.');
    }else if(!safe.model||record.generation<2||record.version<2||(record.state==='Expired'?record.updatedAt<record.expiresAt:record.updatedAt>=record.expiresAt))fail('Invalid terminal live parcel session time.');
  }
  return {...safe,...Object.fromEntries(sessionKeys.filter(key=>!Object.hasOwn(safe,key)).map(key=>[key,record[key]]))};
}

const frameKeys=['ownerId','sessionId','frameId','sequence','actorUid','shipmentId','stage','policy','model','sha256','bytes','width','height','contentType','capturedAtClient','reservedAt','expiresAt','updatedAt','completedAt','state','version','sessionGeneration','label','probabilities','confidence','confidenceMeaning','serviceRequestId','processingTimeMs','totalProcessingTimeMs','reasonCode','retention','image','humanReviewRequired','reviewStatus','reviewNotes','reviewedBy','reviewedAt'];
const imageKeys=['generation','metageneration','sha256','bytes','width','height','contentType'];
function safeImage(record){
  if(!['Unverified','Verified','Unknown'].includes(record.retention))fail('Invalid retained live image status.');
  if(record.retention!=='Verified'){if(record.image!==null)fail('Unverified live image cannot claim object identity.');return null;}
  const image=record.image;
  if(!own(image,imageKeys)||!['generation','metageneration'].every(key=>typeof image[key]==='string'&&/^[1-9][0-9]{0,19}$/.test(image[key]))||!['sha256','bytes','width','height','contentType'].every(key=>image[key]===record[key]))fail('Invalid verified live image identity.');
  return Object.fromEntries(imageKeys.map(key=>[key,image[key]]));
}
export function toPublicParcelLiveFrame(record){
  const safe=baseBindings(record,frameKeys);
  if(!safe.model||!uuid(record.frameId)||!integer(record.sequence,1,12)||!digest(record.sha256)||!integer(record.bytes,1,1048576)||!integer(record.width,1,960)||!integer(record.height,1,960)||record.contentType!=='image/jpeg'||!clientTime(record.capturedAtClient,record.reservedAt)||!integer(record.reservedAt)||!integer(record.expiresAt)||record.expiresAt<=record.reservedAt||record.expiresAt>record.reservedAt+60000||!integer(record.updatedAt)||record.updatedAt<record.reservedAt||!integer(record.version,1)||!integer(record.sessionGeneration,1)||!PARCEL_LIVE_FRAME_STATES.includes(record.state))fail('Invalid live parcel frame state.');
  const image=safeImage(record),inference=['Predicted','Abstained'].includes(record.state),active=['Reserved','Running'].includes(record.state);
  if(active){
    if(record.completedAt!==null||record.version!==(record.state==='Reserved'?1:2)||record.updatedAt>=record.expiresAt||record.reasonCode!==null||(record.state==='Reserved'&&(record.retention!=='Unverified'||record.updatedAt!==record.reservedAt)))fail('Invalid active live parcel frame.');
  }else if(!integer(record.completedAt)||record.completedAt<record.reservedAt||record.updatedAt<record.completedAt||record.version<2||(record.state==='Expired'?record.completedAt<record.expiresAt:record.completedAt>=record.expiresAt))fail('Invalid terminal live parcel frame time.');
  if(inference){
    const p=record.probabilities;
    if(!safe.model||!image||!pair(p)||!finite(p[0])||!finite(p[1])||p[0]<0||p[0]>1||p[1]<0||p[1]>1||Math.abs(p[0]+p[1]-1)>1e-6||!finite(record.confidence)||record.confidence<0||record.confidence>1||Math.abs(record.confidence-Math.max(p[0],p[1]))>1e-6||record.confidenceMeaning!=='uncalibrated'||!uuid(record.serviceRequestId)||!finite(record.processingTimeMs)||record.processingTimeMs<0||record.processingTimeMs>25000||!finite(record.totalProcessingTimeMs)||record.totalProcessingTimeMs<record.processingTimeMs||record.totalProcessingTimeMs>30000||record.reasonCode!==null)fail('Invalid live parcel inference.');
    const label=p[0]===p[1]?null:p[0]>p[1]?'Normal':'Damaged';
    if(record.state==='Predicted'?!label||record.label!==label:record.label!==null||label!==null)fail('Invalid live parcel label.');
  }else{
    if(['label','probabilities','confidence','confidenceMeaning','serviceRequestId','processingTimeMs','totalProcessingTimeMs'].some(key=>record[key]!==null)||(!active&&(!Object.hasOwn(reasons,record.reasonCode)||reasons[record.reasonCode][0]!==record.state)))fail('Missing live inference must remain null.');
  }
  const allowed=record.state==='Predicted'?['Pending','Accepted','Rejected']:record.state==='Abstained'?['Pending','Reviewed']:['NotApplicable'];
  if(!allowed.includes(record.reviewStatus)||record.humanReviewRequired!==(inference&&record.reviewStatus==='Pending'))fail('Invalid live parcel review status.');
  const reviewed=inference&&record.reviewStatus!=='Pending';
  if(reviewed){if(!id(record.reviewedBy)||!integer(record.reviewedAt)||record.reviewedAt<record.completedAt||record.reviewedAt!==record.updatedAt||record.version!==4)fail('Invalid live parcel reviewer.');notes(record.reviewNotes);}
  else if(record.reviewNotes!==null||record.reviewedBy!==null||record.reviewedAt!==null||(inference&&record.version!==3))fail('Invalid unreviewed live parcel frame.');
  return {...safe,...Object.fromEntries(frameKeys.filter(key=>!Object.hasOwn(safe,key)&&!['image','probabilities'].includes(key)).map(key=>[key,record[key]])),image,probabilities:inference?[record.probabilities[0],record.probabilities[1]]:null};
}

export function canReserveParcelLiveFrame(record,nowMs){try{const s=toPublicParcelLiveSession(record);return s.state==='Open'&&integer(nowMs)&&nowMs>=s.createdAt&&nowMs<s.expiresAt&&s.reservedCount<12&&s.inFlightFrameId===null&&(s.lastReservedAt===null||nowMs-s.lastReservedAt>=5000);}catch{return false;}}
export function isParcelLiveSessionExpired(record,nowMs){try{const s=toPublicParcelLiveSession(record);return s.state==='Open'&&integer(nowMs)&&nowMs>=s.expiresAt;}catch{return false;}}
export function isParcelLiveFrameExpired(record,nowMs){try{const f=toPublicParcelLiveFrame(record);return ['Reserved','Running'].includes(f.state)&&integer(nowMs)&&nowMs>=f.expiresAt;}catch{return false;}}
export function canCompleteParcelLiveFrame(session,frame,nowMs){
  try{const s=toPublicParcelLiveSession(session),f=toPublicParcelLiveFrame(frame);return s.state==='Open'&&f.state==='Running'&&integer(nowMs)&&f.reservedAt>=s.createdAt&&s.lastReservedAt===f.reservedAt&&f.expiresAt===Math.min(f.reservedAt+60000,s.expiresAt)&&nowMs>=f.reservedAt&&nowMs<Math.min(s.expiresAt,f.expiresAt)&&s.inFlightFrameId===f.frameId&&s.generation===f.sessionGeneration&&s.reservedCount===f.sequence&&['ownerId','sessionId','actorUid','shipmentId','stage'].every(key=>s[key]===f[key])&&canonicalParcelLiveValue(s.model)===canonicalParcelLiveValue(f.model)&&canonicalParcelLiveValue(s.policy)===canonicalParcelLiveValue(f.policy);}catch{return false;}
}
export function reviewParcelLiveFrameRecord(record,input,{role,reviewerUid,nowMs}={}){
  const f=toPublicParcelLiveFrame(record),review=validateReviewParcelLiveFrame(input);
  if(!['Admin','Manager'].includes(role)||!id(reviewerUid))fail('An administrator or manager must review this result.','permission-denied');
  if(f.sessionId!==review.sessionId||f.frameId!==review.frameId||f.version!==review.version||f.reviewStatus!=='Pending'||!(f.state==='Predicted'?['Accepted','Rejected'].includes(review.decision):f.state==='Abstained'&&review.decision==='Reviewed'))fail('The live parcel review is stale or mismatched.','failed-precondition');
  return toPublicParcelLiveFrame({...f,version:f.version+1,updatedAt:time(nowMs),reviewStatus:review.decision,reviewNotes:review.notes,reviewedBy:reviewerUid,reviewedAt:nowMs,humanReviewRequired:false});
}
