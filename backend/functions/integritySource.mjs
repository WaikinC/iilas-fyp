import {createHash} from 'node:crypto';
import {getFirestore} from 'firebase-admin/firestore';
import {evidenceFile} from './evidenceProvider.mjs';
import {canonicalRecord} from './integrity.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const text=(value,max=500)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f]/.test(value);
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const integer=(value,min=0,max=1000000000)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const ms=value=>typeof value?.toMillis==='function'?value.toMillis():value&&integer(value.seconds,0,10000000000)&&integer(value.nanoseconds??0,0,999999999)?value.seconds*1000+Math.floor((value.nanoseconds??0)/1000000):null;
export function describeIntegritySource({scope,kind,recordId,record}){
 if(!record||record.ownerId!==scope)throw Object.assign(Error('Integrity source is unavailable in this scope.'),{code:'not-found'});
 if(!identifier(scope)||!identifier(recordId)||!['inventory','delivery'].includes(kind))throw Error('Unsupported integrity source.');
 const sourceVersion=kind==='inventory'?record.productVersion:record.version;
 const snapshot={kind,recordId,ownerId:scope,sourceVersion:Number.isSafeInteger(sourceVersion)?sourceVersion:null,protocol:kind==='inventory'?`IILAS-INVENTORY-v${record.integrityVersion===2?2:1}`:`IILAS-DELIVERY-v${record.integrityVersion===2?2:1}`,observedCreatedAtMs:ms(record.createdAt)};
 let valid=identifier(record.actor)&&integer(sourceVersion,1)&&snapshot.observedCreatedAtMs!==null&&[undefined,1,2].includes(record.integrityVersion);
 if(kind==='inventory'){
  valid&&=identifier(record.productId)&&['Receipt','Issue','Adjustment','Reservation','Release','Transfer','Correction'].includes(record.type)&&['sku','locationFrom','locationTo','reference','reason'].every(k=>text(record[k]))&&['quantity','quantityChange','reservedChange'].every(k=>integer(record[k],-1000000000))&&['quantityBefore','quantityAfter','reservedBefore','reservedAfter'].every(k=>integer(record[k]))&&record.quantity!==0&&record.quantityAfter-record.quantityBefore===record.quantityChange&&record.reservedAfter-record.reservedBefore===record.reservedChange;
  if(record.integrityVersion===2){
   valid&&=['Manual','Warehouse','Procurement','Correction'].includes(record.origin)&&Array.isArray(record.allocations)&&record.allocations.length<=100&&record.allocations.every(a=>a&&text(a.location,80)&&integer(a.quantity,1))&&Array.isArray(record.locationChanges)&&record.locationChanges.length<=100&&record.locationChanges.every(a=>a&&text(a.location,80)&&['quantityBefore','quantityAfter','reservedBefore','reservedAfter','warehouseBefore','warehouseAfter'].every(k=>integer(a[k])));
   for(const k of ['correctionOf','approvalId','shipmentId','purchaseOrderId','purchaseReceiptId'])if(record[k]!==undefined&&record[k]!==null)valid&&=identifier(record[k]);
   if(record.type==='Correction')valid&&=identifier(record.correctionOf)&&identifier(record.approvalId)&&['Receipt','Issue','Adjustment','Reservation','Release','Transfer'].includes(record.reversesType);
  }
 }else {
  valid&&=identifier(record.shipmentId)&&['Parcel Image','Proof of Delivery'].includes(record.type)&&typeof record.sha256==='string'&&/^[a-f0-9]{64}$/.test(record.sha256)&&integer(record.bytes,1,10*1024*1024)&&['image/jpeg','image/png','image/webp','application/pdf'].includes(record.contentType)&&record.path===`evidence/${scope}/${record.shipmentId}/${recordId}`;
  if(record.integrityVersion===2)valid&&=['Pre-dispatch','Delivery'].includes(record.stage)&&['file','camera'].includes(record.captureSource)&&integer(record.shipmentVersionAtRegistration,1)&&(record.captureSource==='file'?record.capturedAtClient===null:typeof record.capturedAtClient==='string'&&Number.isFinite(Date.parse(record.capturedAtClient)));
  snapshot.file={path:record.path??null,sha256:record.sha256??null,bytes:record.bytes??null,contentType:record.contentType??null};
 }
 const experimental=['evaluationKind','evaluationManifestSha256','evaluationOnly','runtimeMode'].some(k=>Object.hasOwn(record,k));
 const eligibility={eligible:Boolean(valid&&!experimental),code:experimental?'ExperimentalExcluded':valid?null:'UnsupportedLegacy'};
 const canonical=eligibility.eligible?canonicalRecord(kind,{...record,id:recordId}):null,digest=canonical===null?null:sha(canonical),referenceHash=sha(`${scope}:${kind}:${recordId}`);
 return {snapshot,canonical,digest,referenceHash,eligibility};
}
export async function captureIntegritySource(tx,{scope,kind,recordId}){
 const db=getFirestore(),snap=await tx.get(db.collection(kind==='inventory'?'stockMovements':'evidence').doc(recordId));
 const source=describeIntegritySource({scope,kind,recordId,record:snap.data()});
 if(kind==='delivery'&&snap.data().type==='Parcel Image'){
  // Preserve the existing experimental exclusion without reading image bytes
  // or invoking any parcel inference. Reaching the cap cannot prove eligibility.
  const predictions=await tx.get(db.collection('predictions').where('ownerId','==',scope).where('kind','==','parcel').where('recordId','==',recordId).limit(200));
  if(predictions.size>=200||predictions.docs.some(d=>{const p=d.data();return ['evaluationKind','evaluationManifestSha256','evaluationOnly','runtimeMode'].some(k=>Object.hasOwn(p,k))||p.acceptanceSha256===null;}))return {...source,canonical:null,digest:null,eligibility:{eligible:false,code:'ExperimentalExcluded'}};
 }
 return source;
}
export async function hashIntegrityStream(stream){
 const hash=createHash('sha256');let bytes=0,timer;
 try{
  timer=setTimeout(()=>stream.destroy(Error('Evidence read time limit exceeded.')),15000);
  for await(const chunk of stream){bytes+=chunk.length;if(bytes>10*1024*1024)throw Error('Evidence exceeds the file size limit.');hash.update(chunk);}
  if(bytes===0)throw Error('Evidence is empty.');return hash.digest('hex');
 }finally{clearTimeout(timer);stream.destroy();}
}
export const integrityFiles={async digest(source){
 const file=evidenceFile(source.snapshot.file.path),[metadata]=await file.getMetadata();
 const bytes=Number(metadata.size);if(!Number.isSafeInteger(bytes)||bytes<1||bytes>10*1024*1024)throw Error('Evidence exceeds the file size limit.');
 if(metadata.contentType!==source.snapshot.file.contentType)throw Error('Evidence content type changed.');
 const sha256=await hashIntegrityStream(file.createReadStream());return {bytes,sha256,generation:String(metadata.generation??'')};
}};
