import {getFirestore} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {deliveryFeaturesForFacts,validateDeliveryFacts,evaluateDeliveryRules} from './deliveryRiskDemo.js';
export const stableDelivery=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const deliveryHash=v=>createHash('sha256').update(typeof v==='string'?v:stableDelivery(v)).digest('hex');
export function deliveryMillis(value){let n;if(value&&typeof value.toMillis==='function')n=value.toMillis();else if(value&&Number.isInteger(value.seconds)&&Number.isInteger(value.nanoseconds)&&value.nanoseconds>=0&&value.nanoseconds<1e9)n=value.seconds*1000+value.nanoseconds/1e6;return Number.isFinite(n)&&n>=0&&n<=8640000000000000?Math.floor(n):null;}
function deadline(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)return null;const n=Date.parse(value+'T23:59:59.999+08:00');return Number.isFinite(n)?n:null;}
export function analyseDeliveryRecords({shipmentId,shipment:s,delivery:d,events,proof,plan,observedAtMs}){
 const issues=[],closed=['Delivered','Returned'].includes(d?.status),start=deliveryMillis(s.dispatchedAt),due=deadline(s.expectedDelivery),status=d?.status??'Dispatched';
 const problem=x=>issues.push(x),time=observedAtMs;
 if(s.status!=='Dispatched')problem('shipment_not_dispatched');if(start===null||start>time)problem('invalid_dispatch_time');if(!closed&&(due===null||start===null||due<=start))problem('invalid_expected_window');
 if(!plan)problem('missing_transport_plan');
 let previous='Dispatched',failed=0,last=start,invalid=false;
 const sorted=[...events].sort((a,b)=>(a.version??0)-(b.version??0)||String(a.id).localeCompare(String(b.id)));if(sorted.length>1000)problem('event_capacity');
 const allowed={Dispatched:['In Transit'],'In Transit':['Attempt Failed','Delivered','Returned'],'Attempt Failed':['In Transit','Returned']};
 for(const [i,e]of sorted.entries()){
  const at=deliveryMillis(e.createdAt);if(at===null||start===null||at<start||at>time||last!==null&&at<last)problem('invalid_or_future_event_time');
  if(e.version!==i+1||e.previousStatus!==previous||!allowed[previous]?.includes(e.status))invalid=true;
  previous=e.status;failed+=Number(e.status==='Attempt Failed');last=at;
 }
 if(!d&&events.length)problem('missing_delivery_with_events');
 if(d&&(d.status!==previous||d.version!==events.length||d.failedAttempts!==failed))invalid=true;
 if(!Number.isInteger(d?.failedAttempts??0)||(d?.failedAttempts??0)<0||(d?.failedAttempts??0)>20)problem('invalid_failed_count');
 if(d){const updated=deliveryMillis(d.updatedAt);if(updated===null||updated!==last)problem('inconsistent_last_update');}
 const proofValid=!!(d?.proofId&&proof&&proof.ownerId===s.ownerId&&proof.shipmentId===shipmentId&&proof.type==='Proof of Delivery'&&deliveryMillis(proof.createdAt??proof.submittedAt)!==null&&deliveryMillis(proof.createdAt??proof.submittedAt)<=time);
 if(d?.proofId&&!proofValid&&!closed)problem('unverified_proof_reference');
 let assessment=evaluateDeliveryRules({observedAtMs:time,deadlineMs:due,dispatchedAtMs:start,lastUpdateAtMs:last,currentStatus:status,failedAttempts:d?.failedAttempts??0,proofValid,invalidTransition:invalid});
 if(issues.length)assessment={...assessment,complete:false,unknowns:[...new Set([...assessment.unknowns,...issues])],dataReviewRequired:true,score:null,level:null};
 const reasons=[...issues,...(invalid?['invalid_status_history']:[]),...(closed?['delivery_closed']:[])];let facts=null;
 if(!reasons.length){try{facts=validateDeliveryFacts({expectedDurationHours:(due-start)/3600000,elapsedHours:(time-start)/3600000,failedAttempts:failed,hasProof:proofValid,statusEventCount:events.length,parcelCount:s.parcelCount,hoursSinceLastUpdate:(time-last)/3600000,currentStatus:status});}catch{reasons.push('invalid_feature_units');}}
 const source={shipmentId,reference:String(s.reference??shipmentId),shipmentVersion:s.version,deliveryVersion:d?.version??0,planVersion:plan?.version??null,driverUid:s.driverUid??null,planDriverUid:plan?.driverUid??null,observedAtMs:time,dispatchedAtMs:start,deadlineMs:due,currentStatus:status,eventDigest:deliveryHash(sorted.map(e=>({id:e.id,version:e.version,status:e.status,previousStatus:e.previousStatus,atMs:deliveryMillis(e.createdAt)}))),proofDigest:deliveryHash({id:d?.proofId??null,valid:proofValid,version:proof?.version??null,atMs:deliveryMillis(proof?.createdAt??proof?.submittedAt)}),facts};
 return {snapshot:source,facts,features:facts?deliveryFeaturesForFacts(facts):null,sourceSha256:deliveryHash(source),unavailableReasons:[...new Set(reasons)],assessment};
}
export async function captureDeliverySource(tx,{scope,shipmentId,observedAtMs}){
 const db=getFirestore(),snapshot=await tx.get(db.doc('shipments/'+shipmentId)),shipment=snapshot.data();
 if(!snapshot.exists||shipment.ownerId!==scope)throw Object.assign(Error('Shipment unavailable in this shared system.'),{code:'not-found'});
 const delivery=(await tx.get(db.doc('deliveries/'+shipmentId))).data()??null,plan=(await tx.get(db.doc('transportPlans/'+shipmentId))).data()??null;
 if(delivery&&delivery.ownerId!==scope||plan&&plan.ownerId!==scope)throw Object.assign(Error('Shared delivery source differs.'),{code:'not-found'});
 const query=db.collection('deliveryEvents').where('ownerId','==',scope).where('shipmentId','==',shipmentId).limit(1001),events=(await tx.get(query)).docs.map(d=>({id:d.id,...d.data()}));
 let proof=null;if(delivery?.proofId&&/^[a-zA-Z0-9_-]{1,128}$/.test(delivery.proofId))proof=(await tx.get(db.doc('evidence/'+delivery.proofId))).data()??null;
 return analyseDeliveryRecords({shipmentId,shipment,delivery,events,proof,plan,observedAtMs});
}
export async function recheckDeliverySource(tx,binding){const current=await captureDeliverySource(tx,{scope:binding.ownerId,shipmentId:binding.input.shipmentId,observedAtMs:binding.source.snapshot.observedAtMs});return current.sourceSha256===binding.source.sourceSha256?null:'source_changed';}
