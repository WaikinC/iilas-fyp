import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {canUploadEvidence} from './parcelEvidence.js';
import {inputText} from './procurementValidation.js';
const fail=()=>{throw Object.assign(Error('Evidence stage, shipment status or assignment no longer permits this upload.'),{code:'permission-denied'});};
export async function authorizeEvidence(tx,{scope,actor,member,shipmentId,capture}){
 const db=getFirestore(),shipment=(await tx.get(db.doc('shipments/'+shipmentId))).data();
 const plan=member.role==='Driver'?(await tx.get(db.doc('transportPlans/'+shipmentId))).data():null;
 if(shipment?.ownerId!==scope||(member.role==='Driver'&&plan?.ownerId!==scope)||!canUploadEvidence({role:member.role,shipmentStatus:shipment?.status,stage:capture.stage,actorUid:actor,assignedDriverUid:plan?.driverUid}))fail();return shipment;
}
export async function prepareEvidenceRegistration(tx,{scope,actor,member,shipmentId,key,path,name,capture,contentType,bytes,sha256,generation}){
 const db=getFirestore(),shipment=await authorizeEvidence(tx,{scope,actor,member,shipmentId,capture}),target=db.doc('evidence/'+key),existing=await tx.get(target);
 if(existing.exists)throw Object.assign(Error('evidence_conflict'),{code:'failed-precondition'});
 const record={ownerId:scope,shipmentId,path,name:inputText(name,'Evidence filename',180,1,true),...capture,shipmentVersionAtRegistration:shipment.version,integrityVersion:2,contentType,bytes,sha256,actor,createdAt:FieldValue.serverTimestamp(),version:1,...(generation?{storageGeneration:generation}:{})};
 return {result:{recordId:key,version:1,data:{evidenceId:key,sha256}},apply(){tx.set(target,record);tx.set(db.doc(`auditLogs/evidence_${key}_1`),{ownerId:scope,actor,kind:'evidence',recordId:key,action:'Submit',version:1,label:`${capture.type}: ${shipment.reference}`.slice(0,240),at:FieldValue.serverTimestamp()});}};
}
