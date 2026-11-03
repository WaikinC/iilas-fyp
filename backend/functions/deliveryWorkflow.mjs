import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {randomUUID} from 'node:crypto';
import {inputText} from './procurementValidation.js';
const fail=message=>{throw Object.assign(Error(message),{code:'failed-precondition'});};
const now=()=>FieldValue.serverTimestamp();
export async function prepareDeliveryTransition(tx,{scope,actor,member,command,shipment,plan,old}){
 const db=getFirestore(),key=command.shipmentId,ref=(kind,id)=>db.collection(kind).doc(id);
 if(shipment.ownerId!==scope||shipment.status!=='Dispatched')fail('Dispatch the shipment before updating delivery.');
 if(member.role==='Driver'&&(plan?.ownerId!==scope||plan.driverUid!==actor))throw Object.assign(Error('This delivery is not assigned to you.'),{code:'permission-denied'});
 if(old.version!==command.version)fail('This record changed. Refresh and try again.');
 const allowed={Dispatched:['In Transit'],'In Transit':['Attempt Failed','Delivered','Returned'],'Attempt Failed':['In Transit','Returned']},next=command.status;
 if(!allowed[old.status]?.includes(next))fail('Invalid delivery status sequence.');
 const notes=inputText(command.notes,'Delivery notes',500,3,true),proofId=command.proofId||null;
 if(proofId!==null&&(typeof proofId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(proofId)))fail('Invalid proof ID.');
 const evidence=proofId?(await tx.get(ref('evidence',proofId))).data():null;
 if(proofId&&evidence?.ownerId!==scope)fail('Record not found in the shared system.');
 if(next==='Delivered'&&(!evidence||evidence.shipmentId!==key||evidence.type!=='Proof of Delivery'))fail('Submit proof of delivery before marking Delivered.');
 const version=old.version+1,eventId=randomUUID(),payload={ownerId:scope,shipmentId:key,status:next,notes,proofId,failedAttempts:old.failedAttempts+(next==='Attempt Failed'?1:0),version,updatedAt:now(),updatedBy:actor};
 const audit=(kind,action,revision)=>tx.set(ref('auditLogs',`${kind}_${key}_${revision}`),{ownerId:scope,actor,kind,recordId:key,action,version:revision,label:String(shipment.reference).slice(0,240),at:now()});
 return {result:{recordId:key,version,data:{shipmentId:key,status:next,eventId}},apply(){
  tx.set(ref('deliveries',key),payload);tx.set(ref('deliveryEvents',eventId),{...payload,actor,previousStatus:old.status,createdAt:now()});
  if(['Delivered','Returned'].includes(next)&&plan){tx.delete(ref('resourceAssignments',`${scope}_vehicle_${plan.vehicleId}`));tx.delete(ref('resourceAssignments',`${scope}_driver_${plan.driverId}`));tx.update(ref('transportPlans',key),{status:'Completed',version:plan.version+1,completedAt:now(),updatedAt:now(),updatedBy:actor});audit('transportPlans','Complete',plan.version+1);}
  audit('deliveries',next,version);
 }};
}
