import {validatePurchaseCommand,PURCHASE_STATUSES,validDay,validatePurchaseDetails} from './procurementValidation.js';
import {verifyDemoReorderLineage,verifyDemoReorderReviewEvent,decodeDemoReorderRequirement} from './inventoryDemoReorder.js';
import {INVENTORY_CONTEXT_PROVENANCE} from './inventoryContextAI.js';
import {canonicalInventoryAI} from './inventoryAI.js';
export const DEMO_PROCUREMENT_POLICY='demo-procurement-1.0';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/,HASH=/^[a-f0-9]{64}$/;
const fail=()=>{throw Error('The demo purchase evidence or saved operation could not be verified. Retain it for reconciliation.');};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();};
const id=(v,pattern=ID)=>{if(typeof v!=='string'||!pattern.test(v))fail();};
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail();};
const timestamp=v=>{if(!v||typeof v!=='object')fail();integer(v.seconds);integer(v.nanoseconds,0,999999999);};
const unavailable=(value,reason='The retained demo purchase record is unavailable for reconciliation.')=>({kind:'unsupported',id:value,reason});
export async function demoProcurementSourceSha256(source){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalInventoryAI(source)));return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');}
function canonicalPurchase(p,automatic=false){
 if(automatic){exact(p,['supplierId','expectedDate','items']);}
 const c=automatic?validatePurchaseDetails(p,'0000-00-00'):validatePurchaseCommand(p,'0000-00-00');
 if(c.items&&c.items.length!==1||c.quantities&&c.quantities.length!==1)fail();
 const result={...c};delete result.totalCents;
 if(c.items)result.items=c.items.map(({productId,quantity,unitCost})=>({productId,quantity,unitCost}));
 return result;
}
export function validateDemoProcurementInput(value){
 if(value?.kind==='Create'){
  exact(value,[...(value.contractVersion===2?['contractVersion']:[]),'operationId','kind','requirementId','expectedRequirementVersion','acceptedEventId','purchase']);id(value.operationId,UUID);id(value.requirementId,UUID);id(value.acceptedEventId,UUID);if(value.expectedRequirementVersion!==2||Object.hasOwn(value.purchase||{},'id'))fail();
 }else if(value?.kind==='Action'){
  exact(value,['operationId','kind','purchase']);id(value.operationId,UUID);if(!value.purchase?.id)fail();
 }else fail();
 return {...value,purchase:canonicalPurchase(value.purchase,value.contractVersion===2)};
}
export function validateDemoProcurementOutcome(value,input){
 const request=validateDemoProcurementInput(input),automatic=request.contractVersion===2;exact(value,['state','operationId','kind','purchaseOrderId','eventId','status','version','replayed',...(automatic?['reference']:[])]);
 if(value.operationId!==request.operationId||value.kind!==request.kind||typeof value.replayed!=='boolean')fail();
 if(value.state==='Completed'){
  id(value.purchaseOrderId);integer(value.version,1);if(!PURCHASE_STATUSES.includes(value.status)||value.eventId!==`${value.purchaseOrderId}_${value.version}`||request.kind==='Action'&&value.purchaseOrderId!==request.purchase.id)fail();
  const statuses=request.kind==='Create'?['Submitted']:{Resubmit:['Submitted'],Approve:['Approved'],Reject:['Rejected'],Issue:['Issued'],Cancel:['Cancelled'],Receive:['PartReceived','Received']}[request.purchase.step];
  const version=request.kind==='Create'?1:request.purchase.version+1;
  if(!automatic&&(value.version!==version||!statuses?.includes(value.status)))fail();
  if(automatic){const reference=validatePurchaseCommand({reference:value.reference,...request.purchase},'0000-00-00').reference;if(reference!==value.reference)fail();}
 }else if(value.state!=='Cancelled'||['purchaseOrderId','eventId','status','version',...(automatic?['reference']:[])].some(k=>value[k]!==null))fail();
 return value;
}
export async function decodeDemoProcurementSource(value){
 exact(value,['version','policyVersion','requirementId','alertId','experimentId','review','basis','provenance']);
 if(value.version!==1||value.policyVersion!==DEMO_PROCUREMENT_POLICY)fail();id(value.requirementId,UUID);
 if(value.requirementId!==value.alertId||value.requirementId!==value.experimentId)fail();
 exact(value.provenance,Object.keys(INVENTORY_CONTEXT_PROVENANCE));for(const [k,v] of Object.entries(INVENTORY_CONTEXT_PROVENANCE))if(value.provenance[k]!==v)fail();
 exact(value.review?.reviewedAt,['seconds','nanoseconds']);
 const decoded=await decodeDemoReorderRequirement({ownerId:'source-proof',basis:value.basis,policyVersion:'demo-risk-review-1.0',createdAt:{seconds:0,nanoseconds:0},version:2,alertId:value.alertId,status:'Accepted',review:value.review,...value.provenance},value.requirementId);
 if(decoded.kind!=='requirement')fail();
 return value;
}
export async function verifyAcceptedDemoProcurementSource({id:identifier,alert,requirement,experiment,event}){
 const g=await verifyDemoReorderLineage({id:identifier,alert,requirement,experiment});
 if(g.requirement.status!=='Accepted'||g.requirement.version!==2)fail();
 verifyDemoReorderReviewEvent({id:identifier,requirement:g.requirement,eventId:g.requirement.review.eventId,event});
 const r=g.requirement.review;
 return decodeDemoProcurementSource({version:1,policyVersion:DEMO_PROCUREMENT_POLICY,requirementId:identifier,alertId:identifier,experimentId:identifier,review:{...r,reviewedAt:{seconds:r.reviewedAt.seconds,nanoseconds:r.reviewedAt.nanoseconds}},basis:g.requirement.basis,provenance:{...INVENTORY_CONTEXT_PROVENANCE}});
}
export function decodeDemoProcurementLink(value,identifier){
 try{
  id(identifier,UUID);exact(value,['version','ownerId','requirementId','purchaseOrderId','sourceSha256','createdBy','createdAt','dataOrigin']);id(value.ownerId);id(value.purchaseOrderId);id(value.createdBy);id(value.sourceSha256,HASH);timestamp(value.createdAt);
  if(value.version!==1||value.requirementId!==identifier||value.dataOrigin!=='demonstration-test')fail();
  return {kind:'link',id:identifier,record:value};
 }catch{return unavailable(identifier);}
}
export async function decodeExpectedReplenishment(value,identifier){
 try{
  id(identifier);exact(value,['version','ownerId','purchaseOrderId','requirementId','source','sourceSha256','product','supplier','orderedQuantity','receivedQuantity','outstandingQuantity','expectedDate','orderVersion','state','createdAt','updatedAt','dataOrigin']);
  id(value.ownerId);id(value.requirementId,UUID);id(value.sourceSha256,HASH);timestamp(value.createdAt);timestamp(value.updatedAt);validDay(value.expectedDate);integer(value.orderVersion,1);
  if(value.version!==1||value.purchaseOrderId!==identifier||value.dataOrigin!=='demonstration-test')fail();
  await decodeDemoProcurementSource(value.source);
  if(value.sourceSha256!==await demoProcurementSourceSha256(value.source)||value.source.requirementId!==value.requirementId)fail();
  exact(value.product,['productId','name','sku']);exact(value.supplier,['supplierId','name','contact']);id(value.product.productId);id(value.supplier.supplierId);
  for(const [record,fields] of [[value.product,['name','sku']],[value.supplier,['name','contact']]])for(const field of fields)if(typeof record[field]!=='string'||!record[field].trim()||record[field].length>120||/[\x00-\x1f\x7f]/.test(record[field]))fail();
  if(value.product.productId!==value.source.basis.sourceProduct.productId)fail();
  integer(value.orderedQuantity,1,1000000);integer(value.receivedQuantity,0,value.orderedQuantity);integer(value.outstandingQuantity,0,1000000);
  if(value.outstandingQuantity!==value.orderedQuantity-value.receivedQuantity||value.state!==(value.receivedQuantity===0?'Expected':value.outstandingQuantity===0?'Received':'PartReceived'))fail();
  return {kind:'expected',id:identifier,record:value};
 }catch{return unavailable(identifier);}
}
