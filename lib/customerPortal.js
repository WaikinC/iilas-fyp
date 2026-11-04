import {completionExact,completionIdentifier} from './completionWorkflow.js';
import {LOCAL_DEMO_ENVIRONMENT,validateDemoEnvironment,getDemoEndpoints} from './demoEnvironment.js';
import {createSparkTransport} from './sparkTransport.js';
const cap=10*1024*1024,statuses=['Preparing','Dispatched','In Transit','Attempt Failed','Delivered','Returned','Status unavailable'],activeStatuses=['Dispatched','In Transit','Attempt Failed'];
const safeError=message=>Object.assign(Error(message),{customerSafe:true});
const finite=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
function summary(value){const s=completionExact(value,['shipmentId','reference','expectedDelivery','status']);completionIdentifier(s.shipmentId);if(!text(s.reference,120)||!statuses.includes(s.status)||s.expectedDelivery!==null&&(typeof s.expectedDelivery!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.expectedDelivery)||!Number.isFinite(Date.parse(s.expectedDelivery))||new Date(s.expectedDelivery).toISOString().slice(0,10)!==s.expectedDelivery))throw safeError('Shipment summary is unavailable. Refresh your access.');return s;}
function proofMetadata(value){const p=completionExact(value,['evidenceId','fileName','contentType','bytes']);completionIdentifier(p.evidenceId);if(!text(p.fileName,180)||!p.fileName||/[\\/]/.test(p.fileName)||!['application/pdf','image/jpeg','image/png','image/webp'].includes(p.contentType)||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>cap)throw safeError('Proof metadata is unavailable. Refresh the shipment.');return p;}
export function validateCustomerList(value){
 const data=completionExact(value,['rows','cursor','hasMore','observedAtMs','scanned']);
 if(!Array.isArray(data.rows)||data.rows.length>20||!Number.isSafeInteger(data.scanned)||data.scanned<0||data.scanned>20||data.rows.length>data.scanned||typeof data.hasMore!=='boolean'||!finite(data.observedAtMs)||data.hasMore&&(data.scanned!==20||typeof data.cursor!=='string'||data.cursor.length>1024||!/^[A-Za-z0-9_-]+$/.test(data.cursor))||!data.hasMore&&data.cursor!==null)throw safeError('Shipment page is unavailable. Refresh your access.');
 return {...data,rows:data.rows.map(summary)};
}
export function validateCustomerDetail(value){
 const data=completionExact(value,['shipmentId','reference','expectedDelivery','status','timeline','location','proof','observedAtMs']);summary(Object.fromEntries(['shipmentId','reference','expectedDelivery','status'].map(k=>[k,data[k]])));if(!finite(data.observedAtMs))throw safeError('Shipment observation time is unavailable.');
 const timeline=completionExact(data.timeline,['rows','hasMore','coverage']);if(!Array.isArray(timeline.rows)||timeline.rows.length>20||typeof timeline.hasMore!=='boolean'||!text(timeline.coverage,300))throw safeError('Shipment updates are unavailable.');
 for(const item of timeline.rows){const event=completionExact(item,['status','atMs']);if(!statuses.slice(1,6).includes(event.status)||event.atMs!==null&&!finite(event.atMs))throw safeError('A shipment update is unavailable.');}
 if(data.location!==null){const p=completionExact(data.location,['latitude','longitude','accuracy','submittedAtMs'],['capturedAtMs']);if(!activeStatuses.includes(data.status)||!finite(p.latitude,-90,90)||!finite(p.longitude,-180,180)||!finite(p.accuracy,0,100000)||!finite(p.submittedAtMs)||p.capturedAtMs!==undefined&&(!Number.isSafeInteger(p.capturedAtMs)||!finite(p.capturedAtMs)||p.capturedAtMs>p.submittedAtMs+120000))throw safeError('Latest submitted location is unavailable.');}
 if(data.proof!==null){if(data.status!=='Delivered')throw safeError('The current delivery proof is unavailable.');proofMetadata(data.proof);}return data;
}
export function validateCustomerProofIntegrity(value){const r=completionExact(value,['shipmentId','evidenceId','outcome','checkedAtMs']);completionIdentifier(r.shipmentId);completionIdentifier(r.evidenceId);if(!['Verified','NotRegistered','Unmatched','Unavailable'].includes(r.outcome)||!Number.isSafeInteger(r.checkedAtMs)||r.checkedAtMs<0)throw safeError('The proof check is unavailable. Refresh this shipment.');return r;}
export async function fetchCustomerProof({user,customerUid,shipmentId,proof,siteUrl,isCurrent,signal,fetcher=fetch,environment=LOCAL_DEMO_ENVIRONMENT}){
 try{
  completionIdentifier(customerUid);completionIdentifier(shipmentId);const p=proofMetadata(proof),site=new URL(siteUrl);
  if(['spark-msi','spark-loopback-test'].includes(environment.mode)){
   if(!environment.webOrigins.includes(site.origin)||user?.uid!==customerUid||!isCurrent())throw safeError('The customer account or view changed.');
   const liveUser={get currentUser(){return isCurrent()?user:null;}},transport=createSparkTransport({profile:environment,auth:liveUser,fetch:fetcher});
   const blob=await transport.customerProof(shipmentId,signal);if(!isCurrent()||user.uid!==customerUid||blob.type!==p.contentType||blob.size!==p.bytes)throw safeError('The current proof changed. Refresh the shipment.');return blob;
  }
  const profile=validateDemoEnvironment(environment,[environment]);if(!profile.webOrigins.includes(site.origin))throw safeError('Open the configured IILAS site for proof downloads.');
  const current=()=>{signal?.throwIfAborted();if(!user||user.uid!==customerUid||!isCurrent())throw safeError('The current customer view changed. Refresh your account.');};current();
  const token=await user.getIdToken(true);current();if(typeof token!=='string'||!token||token.length>16384)throw safeError('Sign in again to download a proof.');
  const url=new URL(getDemoEndpoints(profile,site.origin).customerEvidenceUrl);url.searchParams.set('shipmentId',shipmentId);url.searchParams.set('evidenceId',p.evidenceId);
  const response=await fetcher(url.href,{method:'GET',headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error',signal});current();
  if(!response.ok)throw safeError('Proof access is unavailable. Refresh the shipment before another download.');
  if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!==p.contentType)throw safeError('The proof file type changed. Refresh the shipment.');
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==p.bytes||Number(length)>cap))throw safeError('The proof size changed. Refresh the shipment.');
  const reader=response.body?.getReader();if(!reader)throw safeError('The proof file is unavailable.');const chunks=[];let size=0,finished=false;
  try{while(true){const {done,value}=await reader.read();current();if(done){finished=true;break;}size+=value.byteLength;if(size>cap)throw safeError('The proof exceeds the 10 MiB download limit.');chunks.push(value);}if(size!==p.bytes)throw safeError('The proof size changed. Refresh the shipment.');current();return new Blob(chunks,{type:p.contentType});}
  finally{if(!finished)void reader.cancel().catch(()=>{});reader.releaseLock();}
 }catch(e){if(e.customerSafe)throw e;throw safeError('The proof download could not be completed. Refresh the shipment and sign in again if needed.');}
}
