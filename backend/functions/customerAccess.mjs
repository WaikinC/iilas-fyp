import {getFirestore,FieldValue,FieldPath} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {createHash} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {assertCompletionLocal,completionReceiptId,runCompletionOperation} from './completionOperations.mjs';
import {completionExact,completionUUID,completionIdentifier} from './completionWorkflow.js';
import {inputText} from './procurementValidation.js';
const grantRoles=['Admin','Manager','Logistics'],sha=x=>createHash('sha256').update(x).digest('hex'),stamp=()=>FieldValue.serverTimestamp(),ref=(kind,id)=>getFirestore().collection(kind).doc(id);
const fail=(message='This customer shipment access is unavailable.',code='permission-denied')=>{throw Object.assign(Error(message),{code});};
const idPattern=/^[A-Za-z0-9_-]{1,128}$/;
export const customerGrantId=(scope,customerUid,shipmentId)=>{for(const id of [scope,customerUid,shipmentId])completionIdentifier(id);return sha(JSON.stringify([scope,customerUid,shipmentId]));};
const approvedCustomer=p=>p&&p.role==='Customer'&&p.active===true&&p.status==='Approved';
const millis=t=>typeof t?.toMillis==='function'?t.toMillis():t&&Number.isSafeInteger(t.seconds)&&t.seconds>=0?t.seconds*1000+Math.floor((t.nanoseconds??0)/1000000):null;
function safeDay(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;}
const deliveryStatuses=['Dispatched','In Transit','Attempt Failed','Delivered','Returned'];
function statusFor(shipment,delivery){if(['Draft','Prepared'].includes(shipment.status))return 'Preparing';if(shipment.status!=='Dispatched')return 'Status unavailable';return delivery&&delivery.ownerId===shipment.ownerId&&delivery.shipmentId===shipment.id&&deliveryStatuses.includes(delivery.status)?delivery.status:'Dispatched';}
function summary(shipment,delivery){return {shipmentId:shipment.id,reference:typeof shipment.reference==='string'?shipment.reference.slice(0,120):'Reference unavailable',expectedDelivery:safeDay(shipment.expectedDelivery),status:statusFor(shipment,delivery)};}
export function customerProof({scope,shipmentId,delivery,evidenceId,evidence}){
 if(!delivery||delivery.ownerId!==scope||delivery.shipmentId!==shipmentId||delivery.status!=='Delivered'||delivery.proofId!==evidenceId||!evidence||evidence.ownerId!==scope||evidence.shipmentId!==shipmentId||evidence.type!=='Proof of Delivery'||evidence.stage!=='Delivery'||evidence.path!==`evidence/${scope}/${shipmentId}/${evidenceId}`||!Number.isSafeInteger(evidence.bytes)||evidence.bytes<1||evidence.bytes>10*1024*1024||!/^[a-f0-9]{64}$/.test(evidence.sha256??''))return null;
 const extensions={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'},extension=extensions[evidence.contentType];if(!extension)return null;
 const name=typeof evidence.name==='string'&&evidence.name.length<=180&&!/[\u0000-\u001f\u007f/\\]/.test(evidence.name)&&evidence.name.toLowerCase().endsWith(extension)?evidence.name:`Proof-of-delivery-${evidenceId.slice(0,12)}${extension}`;
 return {evidenceId,fileName:name,contentType:evidence.contentType,bytes:evidence.bytes};
}
function grantInput(value,revoke){const input=completionExact(value,['operationId','customerUid','shipmentId','expectedVersion','shareLocation','notes']);completionUUID(input.operationId);completionIdentifier(input.customerUid);completionIdentifier(input.shipmentId);if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||typeof input.shareLocation!=='boolean'||revoke&&input.shareLocation)fail('Choose a valid grant version and explicit location-sharing option.','failed-precondition');inputText(input.notes,'Access notes',500,3);return input;}
function cursorFor(scope,uid,after){return Buffer.from(JSON.stringify({version:1,binding:sha(JSON.stringify(['customer-list-v1',scope,uid])),after})).toString('base64url');}
function decodeCursor(value,scope,uid){if(value===undefined)return null;if(typeof value!=='string'||value.length>1024||!/^[A-Za-z0-9_-]+$/.test(value))fail('Invalid customer continuation.','failed-precondition');let data;try{data=completionExact(JSON.parse(Buffer.from(value,'base64url').toString('utf8')),['version','binding','after']);}catch{fail('Invalid customer continuation.','failed-precondition');}if(data.version!==1||data.binding!==sha(JSON.stringify(['customer-list-v1',scope,uid]))||!idPattern.test(data.after))fail('This continuation belongs to a different customer.','permission-denied');return data.after;}
export async function liveCustomerIdentity(uid,identity=key=>getAuth().getUser(key)){
 completionIdentifier(uid);try{const user=await identity(uid);if(!user||user.uid!==uid||user.disabled)throw Error('disabled');return user;}catch{fail('The current customer account is unavailable.');}
}
export async function runCustomerTransaction(auth,work,identity=uid=>getAuth().getUser(uid)){
 assertCompletionLocal();await liveCustomerIdentity(auth?.uid,identity);
 return getFirestore().runTransaction(async tx=>{const [configuration,profile]=await Promise.all([tx.get(ref('system','config')),tx.get(ref('users',auth.uid))]);if(!configuration.exists||!approvedCustomer(profile.data())||profile.data().uid!==auth.uid)fail();const scope=configuration.data().dataScopeId;completionIdentifier(scope);return work(tx,scope,profile.data());});
}
export function createCustomerCommands({identity=uid=>getAuth().getUser(uid),clock=Date.now}={}){
 const liveIdentity=uid=>liveCustomerIdentity(uid,identity),customerTransaction=(auth,work)=>runCustomerTransaction(auth,work,identity);
 async function staff(auth,scope,work,roles=grantRoles){assertCompletionLocal();return approvedTransaction(auth,roles,async(tx,c,m)=>{if(c.dataScopeId!==scope)fail('The access-management scope cannot be changed.');return work(tx,m);});}
 async function mutate(auth,scope,value,revoke,resolveOnly){
  assertCompletionLocal();const input=grantInput(value,revoke),action=revoke?'revokeCustomerShipment':'grantCustomerShipment';
  if(!resolveOnly&&!revoke){
   // Avoid a now-missing target identity blocking recovery of an immutable
   // terminal result. New grants still check Auth outside every transaction.
   const existing=await staff(auth,scope,async(tx,member)=>{const old=await tx.get(ref('completionRequests',completionReceiptId({scope,actor:auth.uid,action,operationId:input.operationId})));if(!old.exists&&!grantRoles.includes(member.role))fail('Your role cannot grant customer access.');return old.exists;},ROLES);
   if(!existing)await liveIdentity(input.customerUid);
  }
  return runCompletionOperation({auth,scope,action,input:value,roles:grantRoles,resolveOnly,work:async tx=>{
   const key=customerGrantId(scope,input.customerUid,input.shipmentId),r=ref('customerShipmentGrants',key),snapshot=await tx.get(r),old=snapshot.data(),shipment=await tx.get(ref('shipments',input.shipmentId)),customer=await tx.get(ref('users',input.customerUid));
   if(!shipment.exists||shipment.data().ownerId!==scope)fail('Shipment not found in the shared system.','not-found');
   if(old&&(old.ownerId!==scope||old.customerUid!==input.customerUid||old.shipmentId!==input.shipmentId))fail('The existing grant needs reconciliation.','failed-precondition');
   if((old?.version??0)!==input.expectedVersion)fail('This grant version changed. Refresh its current access.','failed-precondition');
   if(revoke){if(!old?.active)fail('No active grant exists to revoke.','failed-precondition');}
   else if(!approvedCustomer(customer.data())||customer.data().uid!==input.customerUid)fail('Select an approved active Customer account.','failed-precondition');
   const version=(old?.version??0)+1,at=stamp(),after={ownerId:scope,customerUid:input.customerUid,shipmentId:input.shipmentId,active:!revoke,shareLocation:!revoke&&input.shareLocation,notes:input.notes.trim(),version,createdAt:old?.createdAt??at,updatedAt:at,updatedBy:auth.uid};
   return {result:{recordId:key,version},apply:()=>{tx.set(r,after);tx.create(ref('auditLogs',`customerGrant_${key}_${version}`),{ownerId:scope,actor:auth.uid,kind:'customerShipmentGrants',recordId:key,action:revoke?'Revoke customer access':'Grant customer access',version,label:'Explicit shipment access only',before:old??null,after,at});}};
  }});
 }
 async function getCustomerShipments(auth,value){
  const input=completionExact(value,[],['cursor']);return customerTransaction(auth,async(tx,scope)=>{
   const after=decodeCursor(input.cursor,scope,auth.uid),q=getFirestore().collection('customerShipmentGrants').where('ownerId','==',scope).where('customerUid','==',auth.uid).where('active','==',true).orderBy(FieldPath.documentId()),grants=await tx.get((after?q.startAfter(after):q).limit(20)),rows=[];
   for(const snapshot of grants.docs){const g=snapshot.data();if(!idPattern.test(g.shipmentId))continue;const shipment=await tx.get(ref('shipments',g.shipmentId));if(!shipment.exists||shipment.data().ownerId!==scope)continue;const delivery=await tx.get(ref('deliveries',g.shipmentId));rows.push(summary({...shipment.data(),id:g.shipmentId},delivery.data()));}
   return {rows,hasMore:grants.docs.length===20,cursor:grants.docs.length===20?cursorFor(scope,auth.uid,grants.docs.at(-1).id):null,observedAtMs:clock(),scanned:grants.docs.length};
  });
 }
 async function getCustomerShipment(auth,value){
  const input=completionExact(value,['shipmentId']);completionIdentifier(input.shipmentId);return customerTransaction(auth,async(tx,scope)=>{
   const grant=await tx.get(ref('customerShipmentGrants',customerGrantId(scope,auth.uid,input.shipmentId))),g=grant.data();if(!g||g.ownerId!==scope||g.customerUid!==auth.uid||g.shipmentId!==input.shipmentId||g.active!==true)fail();
   const shipment=await tx.get(ref('shipments',input.shipmentId)),deliverySnapshot=await tx.get(ref('deliveries',input.shipmentId));if(!shipment.exists||shipment.data().ownerId!==scope)fail();const source={...shipment.data(),id:input.shipmentId},delivery=deliverySnapshot.data();
   const timeline=await tx.get(getFirestore().collection('deliveryEvents').where('ownerId','==',scope).where('shipmentId','==',input.shipmentId).orderBy('createdAt','desc').limit(20));
   const events=timeline.docs.map(d=>d.data()).filter(d=>deliveryStatuses.includes(d.status)).map(d=>({status:d.status,atMs:millis(d.createdAt)}));
   let location=null,proof=null;
   if(g.shareLocation===true&&source.status==='Dispatched'&&!['Delivered','Returned'].includes(statusFor(source,delivery))){const snapshot=await tx.get(ref('locations',input.shipmentId)),p=snapshot.data(),atMs=millis(p?.submittedAt);if(p?.ownerId===scope&&p.shipmentId===input.shipmentId&&typeof p.latitude==='number'&&Number.isFinite(p.latitude)&&p.latitude>=-90&&p.latitude<=90&&typeof p.longitude==='number'&&Number.isFinite(p.longitude)&&p.longitude>=-180&&p.longitude<=180&&typeof p.accuracy==='number'&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&p.accuracy<=100000&&atMs!==null&&atMs<=clock()+300000){const captured=p.capturedAtMs;if(captured===undefined||Number.isSafeInteger(captured)&&captured>=0&&captured<=atMs+120000)location={latitude:p.latitude,longitude:p.longitude,accuracy:p.accuracy,submittedAtMs:atMs,...(captured!==undefined?{capturedAtMs:captured}:{})};}}
   if(delivery?.status==='Delivered'&&typeof delivery.proofId==='string'&&idPattern.test(delivery.proofId)){const evidence=await tx.get(ref('evidence',delivery.proofId));proof=customerProof({scope,shipmentId:input.shipmentId,delivery,evidenceId:delivery.proofId,evidence:evidence.data()});}
   return {...summary(source,delivery),timeline:{rows:events,hasMore:timeline.docs.length===20,coverage:'Latest up to 20 timestamped updates; older or undated updates may not be included.'},location,proof,observedAtMs:clock()};
  });
 }
 async function getCustomerAccessContext(auth,scope,value){
  const input=completionExact(value,['customerUid','shipmentId']);completionIdentifier(input.customerUid);completionIdentifier(input.shipmentId);assertCompletionLocal();let authEligible=true;try{await liveIdentity(input.customerUid);}catch{authEligible=false;}
  return staff(auth,scope,async tx=>{const [shipment,profile,grant]=await Promise.all([tx.get(ref('shipments',input.shipmentId)),tx.get(ref('users',input.customerUid)),tx.get(ref('customerShipmentGrants',customerGrantId(scope,input.customerUid,input.shipmentId)))]);if(!shipment.exists||shipment.data().ownerId!==scope)fail('Shipment not found.','not-found');const eligible=authEligible&&approvedCustomer(profile.data()),g=grant.data();if(!eligible&&!g)fail('Customer account not found.','not-found');if(g&&(g.ownerId!==scope||g.customerUid!==input.customerUid||g.shipmentId!==input.shipmentId))fail('The grant needs reconciliation.','failed-precondition');return {shipment:{id:shipment.id,reference:String(shipment.data().reference??'Reference unavailable'),status:String(shipment.data().status??'Unknown')},customer:{uid:input.customerUid,displayName:eligible?String(profile.data().displayName??'Customer').slice(0,80):'Unavailable customer account',eligible:Boolean(eligible)},grant:{version:g?.version??0,active:g?.active===true,shareLocation:g?.shareLocation===true,notes:g?.notes??''}};});
 }
 return {getCustomerShipments,getCustomerShipment,getCustomerAccessContext,grantCustomerShipment:(...args)=>mutate(...args,false,false),revokeCustomerShipment:(...args)=>mutate(...args,true,false),resolveCustomerShipmentGrant:(...args)=>mutate(...args,false,true),resolveCustomerShipmentRevocation:(...args)=>mutate(...args,true,true)};
}
