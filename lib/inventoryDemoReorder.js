import {INVENTORY_CONTEXT_PROTOCOL,INVENTORY_CONTEXT_PROVENANCE,decodeInventoryExperimentHistory,contextFeaturePayload} from './inventoryContextAI.js';
import {canonicalInventoryAI} from './inventoryAI.js';

export const DEMO_REORDER_POLICY='demo-risk-review-1.0';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const BASIS=['experimentId','experimentActor','operationId','sourceProduct','scenario','features','inputSha256','prediction','source','requestedAtMs'];
const COMMON=['ownerId','basis','policyVersion','createdAt','version',...Object.keys(INVENTORY_CONTEXT_PROVENANCE)];
const fail=()=>{throw Error('The demo reorder data could not be verified. Retain it for reconciliation.');};
const exact=(value,keys)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail();};
const identity=(value,pattern=ID)=>{if(typeof value!=='string'||!pattern.test(value))fail();};
const integer=(value,min=0)=>{if(!Number.isSafeInteger(value)||value<min)fail();};
const timestamp=value=>{if(!value||typeof value!=='object')fail();integer(value.seconds);integer(value.nanoseconds);if(value.nanoseconds>999999999)fail();};
const provenance=value=>{for(const [key,expected] of Object.entries(INVENTORY_CONTEXT_PROVENANCE))if(value[key]!==expected)fail();};
async function sha(text){const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
export const isDemoRiskLabel=label=>label==='Reorder Risk'||label==='Critical Stock Risk';

export function validateDemoReorderReviewInput(value){
 exact(value,['operationId','requirementId','expectedVersion','decision','notes']);identity(value.operationId,UUID);identity(value.requirementId,UUID);integer(value.expectedVersion,1);
 if(!['Accept','Reject'].includes(value.decision)||typeof value.notes!=='string'||/[\x00-\x1f\x7f]/.test(value.notes)||value.notes.trim().length<10||value.notes.trim().length>500)fail();
 return {...value,notes:value.notes.trim()};
}
export function validateDemoReorderOutcome(value,input){
 const request=validateDemoReorderReviewInput(input);exact(value,['state','operationId','requirementId','eventId','decision','replayed']);
 if(value.operationId!==request.operationId||value.requirementId!==request.requirementId||typeof value.replayed!=='boolean')fail();
 if(value.state==='Completed'){identity(value.eventId,UUID);if(value.decision!==request.decision)fail();}
 else if(value.state!=='Cancelled'||value.eventId!==null||value.decision!==null)fail();
 return value;
}
function historyView(value){
 const b=value.basis;exact(b,BASIS);identity(b.experimentId,UUID);identity(b.experimentActor);identity(b.operationId,UUID);
 return {ownerId:value.ownerId,actor:b.experimentActor,operationId:b.operationId,sourceProduct:b.sourceProduct,scenario:b.scenario,features:b.features,inputSha256:b.inputSha256,prediction:b.prediction,source:b.source,requestedAtMs:b.requestedAtMs,createdAt:value.createdAt,status:'Predicted',reason:null,version:3,protocol:INVENTORY_CONTEXT_PROTOCOL,scenarioSource:'demo-product',...INVENTORY_CONTEXT_PROVENANCE};
}
const unsupported=(id,reason='This retained demo reorder record has an unsupported or invalid format.')=>({kind:'unsupported',id,reason});
async function decode(value,id,kind){
 try{
  identity(id,UUID);exact(value,[...COMMON,...(kind==='alert'?['requirementId']:['alertId','status','review'])]);identity(value.ownerId);timestamp(value.createdAt);provenance(value);
  if(value.policyVersion!==DEMO_REORDER_POLICY)fail();
  const history=await decodeInventoryExperimentHistory(historyView(value));
  if(history.kind!=='demo-product'||!isDemoRiskLabel(history.record.prediction?.label)||value.basis.experimentId!==id||await sha(contextFeaturePayload(history.record.features))!==history.record.inputSha256)fail();
  if(kind==='alert'){if(value.version!==1||value.requirementId!==id)fail();}
  else{
   if(value.alertId!==id)fail();
   if(value.status==='Pending'){if(value.version!==1||value.review!==null)fail();}
   else{
    if(!['Accepted','Rejected'].includes(value.status)||value.version!==2)fail();
    const r=value.review;exact(r,['operationId','eventId','decision','notes','reviewedBy','reviewedAt']);identity(r.eventId,UUID);identity(r.reviewedBy);timestamp(r.reviewedAt);
    const input=validateDemoReorderReviewInput({operationId:r.operationId,requirementId:id,expectedVersion:1,decision:r.decision,notes:r.notes});
    if(input.notes!==r.notes||r.reviewedBy===value.basis.experimentActor||r.decision!==(value.status==='Accepted'?'Accept':'Reject'))fail();
   }
  }
  return {kind,id,record:value};
 }catch{return unsupported(id);}
}
export const decodeDemoRiskAlert=(value,id)=>decode(value,id,'alert');
export const decodeDemoReorderRequirement=(value,id)=>decode(value,id,'requirement');
export function decodeDemoReorderEvent(value,id){
 try{
  identity(id,UUID);exact(value,['ownerId','requirementId','experimentId','operationId','actor','decision','notes','fromVersion','toVersion','at','version',...Object.keys(INVENTORY_CONTEXT_PROVENANCE)]);
  identity(value.ownerId);identity(value.actor);timestamp(value.at);provenance(value);identity(value.experimentId,UUID);
  const input=validateDemoReorderReviewInput({operationId:value.operationId,requirementId:value.requirementId,expectedVersion:value.fromVersion,decision:value.decision,notes:value.notes});
  if(value.requirementId!==value.experimentId||value.version!==1||value.fromVersion!==1||value.toVersion!==2||input.notes!==value.notes)fail();
  return {kind:'event',id,record:value};
 }catch{return unsupported(id);}
}
export function verifyDemoReorderReviewEvent({id,requirement,eventId,event}){
 const decoded=decodeDemoReorderEvent(event,eventId),review=requirement?.review;
 if(decoded.kind!=='event'||!review||requirement.version!==2||!['Accepted','Rejected'].includes(requirement.status)||requirement.alertId!==id||eventId!==review.eventId||event.ownerId!==requirement.ownerId||event.requirementId!==id||event.experimentId!==id||event.operationId!==review.operationId||event.actor!==review.reviewedBy||event.decision!==review.decision||event.notes!==review.notes||event.at.seconds!==review.reviewedAt?.seconds||event.at.nanoseconds!==review.reviewedAt?.nanoseconds||review.decision!==(requirement.status==='Accepted'?'Accept':'Reject'))fail();
 return event;
}
export async function verifyDemoReorderLineage({id,alert,requirement,experiment}){
 const [a,r,e]=await Promise.all([decodeDemoRiskAlert(alert,id),decodeDemoReorderRequirement(requirement,id),decodeInventoryExperimentHistory(experiment)]);
 if(a.kind!=='alert'||r.kind!=='requirement'||e.kind!=='demo-product'||e.record.status!=='Predicted'||a.record.ownerId!==r.record.ownerId||e.record.ownerId!==r.record.ownerId)fail();
 const b={experimentId:id,experimentActor:e.record.actor,operationId:e.record.operationId,sourceProduct:e.record.sourceProduct,scenario:e.record.scenario,features:e.record.features,inputSha256:e.record.inputSha256,prediction:e.record.prediction,source:e.record.source,requestedAtMs:e.record.requestedAtMs};
 if(canonicalInventoryAI(a.record.basis)!==canonicalInventoryAI(b)||canonicalInventoryAI(r.record.basis)!==canonicalInventoryAI(b))fail();
 return {id,alert:a.record,requirement:r.record,experiment:e.record};
}
