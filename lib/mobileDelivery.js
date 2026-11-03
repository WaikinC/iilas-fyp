import {sha256,toUtf8Bytes} from 'ethers';
import {completionExact,completionCanonical,completionIdentifier,completionUUID} from './completionWorkflow.js';

export const MOBILE_PROTOCOL='mobile-command-1.0';
export const MOBILE_LIMITS=Object.freeze({page:20,actions:200,points:2000,files:10,fileBytes:10485760,totalBytes:125829120,pointBatch:25,envelopeBytes:65536,payloadCharacters:32768,intervalMs:20000,leaseMs:1800000,renewMs:300000,absoluteMs:14400000,lookbackMs:86400000,clockToleranceMs:120000});
export const MOBILE_ACTIONS=Object.freeze(['tracking.start','tracking.renew','tracking.stop','tracking.points','delivery.update','evidence.prepare','evidence.finalise']);
const fail=()=>{throw Error('Invalid mobile data.');};
export const mobileHash=value=>sha256(toUtf8Bytes(value)).slice(2);
const exact=completionExact,id=completionIdentifier,uuid=completionUUID;
function number(value,min=0,max=Number.MAX_SAFE_INTEGER,integer=true){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value)))fail();return value;}
function text(value,min,max){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fail();return value;}
function hash(value){if(typeof value!=='string'||!(/^[a-f0-9]{64}$/).test(value))fail();return value;}
function timestamp(value){return number(value,0,8640000000000000);}
function nullableId(value){if(value!==null)id(value);}
export function validateMobileRequest(raw){
 const value=exact(raw,['protocol','operationId','action','payloadJson']);
 if(value.protocol!==MOBILE_PROTOCOL||!MOBILE_ACTIONS.includes(value.action))fail();uuid(value.operationId);
 text(value.payloadJson,2,MOBILE_LIMITS.payloadCharacters);
 if(new TextEncoder().encode(JSON.stringify(value)).length>MOBILE_LIMITS.envelopeBytes)fail();
 return value;
}
export function parseMobilePayload(raw){
 const request=validateMobileRequest(raw);let parsed;try{parsed=JSON.parse(request.payloadJson);}catch{fail();}
 completionCanonical(parsed);
 let p;
 switch(request.action){
 case 'tracking.start':p=exact(parsed,['shipmentId','installationId']);id(p.shipmentId);uuid(p.installationId);break;
 case 'tracking.renew':case 'tracking.stop':p=exact(parsed,['sessionId']);uuid(p.sessionId);break;
 case 'tracking.points':{
  p=exact(parsed,['sessionId','points']);uuid(p.sessionId);
  if(!Array.isArray(p.points)||p.points.length<1||p.points.length>MOBILE_LIMITS.pointBatch)fail();
  let previous=null;const seen=new Set();
  for(const item of p.points){const point=exact(item,['sampleId','sequence','capturedAtMs','latitude','longitude','accuracy']);uuid(point.sampleId);number(point.sequence,1);timestamp(point.capturedAtMs);number(point.latitude,-90,90,false);number(point.longitude,-180,180,false);number(point.accuracy,0,100000,false);
   if(seen.has(point.sampleId)||(previous&&(point.sequence<=previous.sequence||point.capturedAtMs<previous.capturedAtMs)))fail();seen.add(point.sampleId);previous=point;
  }break;
 }
 case 'delivery.update':p=exact(parsed,['shipmentId','expectedVersion','expectedShipmentVersion','expectedAssignmentVersion','status','notes','proofId']);id(p.shipmentId);number(p.expectedVersion);number(p.expectedShipmentVersion);number(p.expectedAssignmentVersion);if(!['In Transit','Attempt Failed','Delivered','Returned'].includes(p.status))fail();text(p.notes,3,500);nullableId(p.proofId);if(p.status==='Delivered'&&p.proofId===null)fail();break;
 case 'evidence.prepare':p=exact(parsed,['shipmentId','evidenceId','type','stage','name','contentType','bytes','sha256','captureSource','capturedAtClient']);id(p.shipmentId);uuid(p.evidenceId);text(p.name,1,180);number(p.bytes,1,MOBILE_LIMITS.fileBytes);hash(p.sha256);if(p.type!=='Proof of Delivery'||p.stage!=='Delivery'||p.captureSource!=='file'||!['image/jpeg','image/png','image/webp','application/pdf'].includes(p.contentType))fail();if(p.capturedAtClient!==null&&(typeof p.capturedAtClient!=='string'||!Number.isFinite(Date.parse(p.capturedAtClient))||new Date(p.capturedAtClient).toISOString()!==p.capturedAtClient))fail();break;
 case 'evidence.finalise':p=exact(parsed,['prepareOperationId']);uuid(p.prepareOperationId);break;
 default:fail();
 }
 return p;
}
function resultData(action,data){
 if(action==='tracking.start'||action==='tracking.renew'){
  const p=exact(data,['sessionId','serverNowMs','leaseUntilMs','absoluteUntilMs','intervalMs']);uuid(p.sessionId);for(const k of ['serverNowMs','leaseUntilMs','absoluteUntilMs'])timestamp(p[k]);
  if(p.intervalMs!==MOBILE_LIMITS.intervalMs||p.leaseUntilMs<p.serverNowMs||p.leaseUntilMs>p.serverNowMs+MOBILE_LIMITS.leaseMs||p.leaseUntilMs>p.absoluteUntilMs||p.absoluteUntilMs>p.serverNowMs+MOBILE_LIMITS.absoluteMs)fail();return p;
 }
 if(action==='tracking.points'){const p=exact(data,['accepted','latestChanged']);number(p.accepted,1,25);if(typeof p.latestChanged!=='boolean')fail();return p;}
 if(action==='tracking.stop'){const p=exact(data,['sessionId','stopped']);uuid(p.sessionId);if(p.stopped!==true)fail();return p;}
 if(action==='delivery.update'){const p=exact(data,['shipmentId','status','eventId']);id(p.shipmentId);id(p.eventId);if(!['In Transit','Attempt Failed','Delivered','Returned'].includes(p.status))fail();return p;}
 if(action==='evidence.finalise'){const p=exact(data,['evidenceId','sha256']);uuid(p.evidenceId);hash(p.sha256);return p;}
 const p=exact(data,['evidenceId','path','metadata']);uuid(p.evidenceId);text(p.path,1,400);if(!/^evidence\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[a-f0-9-]+$/.test(p.path))fail();
 const m=exact(p.metadata,['actor','stage','evidenceType','captureSource','capturedAtClient','mobilePrepareId','sha256']);id(m.actor);uuid(m.mobilePrepareId);hash(m.sha256);if(m.stage!=='Delivery'||m.evidenceType!=='Proof of Delivery'||m.captureSource!=='file')fail();text(m.capturedAtClient,0,40);return p;
}
export function validateMobileResult(raw,input){
 const request=validateMobileRequest(input),p=exact(raw,['protocol','operationId','action','requestSha256','state','recordId','version','reason','replayed','data']);
 if(p.protocol!==MOBILE_PROTOCOL||p.operationId!==request.operationId||p.action!==request.action||p.requestSha256!==mobileHash(request.payloadJson)||typeof p.replayed!=='boolean')fail();
 if(['Cancelled','Rejected'].includes(p.state)){
  if(p.recordId!==null||p.version!==null||p.data!==null||(p.state==='Cancelled'?p.reason!==null:!['stale_version','assignment_changed','delivery_closed','invalid_clock','expired_capture','evidence_conflict','authority_changed'].includes(p.reason)))fail();
 }else if(p.state==='Committed'||p.state==='Pending'){
  id(p.recordId);number(p.version,1);if(p.reason!==null||(p.state==='Pending'&&p.action!=='evidence.prepare'))fail();resultData(p.action,p.data);
  if(p.action.startsWith('tracking.')&&['tracking.start','tracking.renew','tracking.stop'].includes(p.action)&&p.recordId!==p.data.sessionId)fail();
  if(p.action==='delivery.update'){const data=parseMobilePayload(request);if(p.recordId!==data.shipmentId||p.data.shipmentId!==data.shipmentId||p.data.status!==data.status||p.version!==data.expectedVersion+1)fail();}
 }else fail();
 return p;
}
function time(value){
 if(typeof value==='number')return value;
 if(value&&typeof value.toMillis==='function')return value.toMillis();
 if(value&&Number.isFinite(value.seconds))return value.seconds*1000+(value.nanoseconds||0)/1000000;
 return NaN;
}
export function shouldReplaceLatest(incoming,existing){
 const next=time(incoming?.capturedAtMs);timestamp(next);if(!existing)return true;
 const old=time(existing.capturedAtMs??existing.submittedAtMs??existing.submittedAt);
 if(!Number.isFinite(old))fail();return next>old;
}
export function validateMobileShipment(raw){
 const p=exact(raw,['id','reference','recipient','address','expectedDelivery','shipmentVersion','deliveryVersion','status','assignmentVersion','proofs']);
 id(p.id);text(p.reference,1,120);text(p.recipient,1,180);text(p.address,1,1000);text(p.expectedDelivery,10,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(p.expectedDelivery))fail();number(p.shipmentVersion,1);number(p.deliveryVersion);number(p.assignmentVersion,1);if(!['Dispatched','In Transit','Attempt Failed','Delivered','Returned'].includes(p.status))fail();
 if(!Array.isArray(p.proofs)||p.proofs.length>20)fail();for(const rawProof of p.proofs){const proof=exact(rawProof,['id','name']);id(proof.id);text(proof.name,1,180);}return p;
}
export function validateMobilePage(raw){const p=exact(raw,['items','cursor','verifiedAtMs']);if(!Array.isArray(p.items)||p.items.length>20)fail();p.items.forEach(validateMobileShipment);nullableId(p.cursor);timestamp(p.verifiedAtMs);return p;}
export function validateBridgeEvent(raw){const p=exact(raw,['version','pending','tracking']);number(p.version);number(p.pending,0,2200);if(!['Stopped','Tracking','Expired','Needs review'].includes(p.tracking))fail();return p;}
