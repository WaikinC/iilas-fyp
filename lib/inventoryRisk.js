import {locationBalances} from './locationStock.js';

export const INVENTORY_RISK_VERSIONS=Object.freeze({rules:'inventory-reorder-check-1.0',features:'inventory-stock-snapshot-1.0',rubric:'inventory-stock-rubric-1.0'});
export const INVENTORY_RISK_LABELS=Object.freeze(['Normal','Reorder Risk','Critical Stock Risk']);
const DAY=86400000,TYPES=['Receipt','Issue','Adjustment','Reservation','Release','Transfer','Correction'];
const fail=message=>{throw new Error(message);};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))fail('Invalid inventory assessment fields.');}
function recordId(v){if(typeof v!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(v))fail('Invalid record ID.');return v;}
function version(v){if(!Number.isSafeInteger(v)||v<1)fail('Invalid record version.');return v;}
function operation(v){if(typeof v!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))fail('Invalid operation ID.');return v.toLowerCase();}
function text(v,min,max,label){if(typeof v!=='string')fail(`Invalid ${label}.`);const s=v.trim();if(s.length<min||s.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))fail(`Invalid ${label}.`);return s;}
export function validateAssessmentInput(input){exact(input,['productId']);return {productId:recordId(input.productId)};}
export function validateCaptureInput(input){exact(input,['productId','productVersion','operationId']);return {productId:recordId(input.productId),productVersion:version(input.productVersion),operationId:operation(input.operationId)};}
export function validateReviewInput(input){
 exact(input,['snapshotId','version','operationId','decision','reason','evidenceNotes','fulfilmentImpact','evidenceRefs']);
 if(![...INVENTORY_RISK_LABELS,'Unresolved'].includes(input.decision))fail('Choose a stock condition or Unresolved.');
 const impact=text(input.fulfilmentImpact,0,500,'fulfilment impact');if((impact.length&&impact.length<20)||(input.decision==='Critical Stock Risk'&&impact.length<20))fail('Describe the likely fulfilment impact for Critical risk.');
 if(!Array.isArray(input.evidenceRefs)||input.evidenceRefs.length>10)fail('Choose at most ten evidence references.');
 const evidenceRefs=input.evidenceRefs.map(r=>{exact(r,['kind','id']);if(!['stockMovements','shipments','purchaseOrders'].includes(r.kind))fail('Invalid evidence kind.');return {kind:r.kind,id:recordId(r.id)};});
 if(new Set(evidenceRefs.map(r=>`${r.kind}/${r.id}`)).size!==evidenceRefs.length)fail('Evidence references must be distinct.');
 return {snapshotId:recordId(input.snapshotId),version:version(input.version),operationId:operation(input.operationId),decision:input.decision,reason:text(input.reason,20,500,'review reason'),evidenceNotes:text(input.evidenceNotes,20,1000,'evidence notes'),fulfilmentImpact:impact,evidenceRefs};
}
export function canonicalInventoryRisk(value){
 function canonical(v){if(v===null||typeof v==='string'||typeof v==='boolean')return v;if(typeof v==='number'&&Number.isFinite(v))return v;if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));fail('Invalid frozen inventory value.');}
 return JSON.stringify(canonical(value));
}
export function buildInventoryAssessment({productId,product,movements=[],receiptCandidates=[],correctionLinks={},cutoffMs,overflow=false}){
 recordId(productId);version(product.version);if(!Number.isSafeInteger(cutoffMs)||cutoffMs<0)fail('Invalid server observation time.');
 const issues=['30-day history completeness is not verified'];let invalid=false,features=null,recommendation='Balance needs review';const reasons=[];
 try{for(const k of ['quantityOnHand','reorderLevel','reservedQuantity','warehouseReservedQuantity']){const v=product[k]??(['reservedQuantity','warehouseReservedQuantity'].includes(k)?0:null);if(!Number.isSafeInteger(v)||v<0||v>1000000)fail('Invalid balance.');}locationBalances(product);const available=product.quantityOnHand-(product.reservedQuantity??0);features={available_quantity:available,reserved_quantity:product.reservedQuantity??0,movement_frequency:null,reorder_distance:available-product.reorderLevel,adjustment_count:null,days_since_replenishment:null};recommendation=available<=product.reorderLevel?'Reorder review':'No reorder warning';reasons.push(`${available} available; reorder level ${product.reorderLevel}. ${recommendation==='Reorder review'?'Review replenishment.':'Above the reorder level; this does not certify overall stock condition.'}`);}catch{invalid=true;reasons.push('Stock or location balances need administrator reconciliation.');}
 const history={observedMovementCount:0,observedAdjustmentCount:0,observedCorrectionCount:0,coverage:'Unverified',receiptId:null,receiptAtMs:null,issues};
 const validTime=r=>r&&Number.isSafeInteger(r.atMs)&&r.atMs>=0&&r.atMs<=cutoffMs;
 if(!Array.isArray(movements)||movements.length>2000||overflow){invalid=true;issues.push('Movement limit reached');}
 else{const ids=new Set();for(const row of movements){if(!validTime(row)||!TYPES.includes(row.type)||typeof row.id!=='string'||ids.has(row.id)){invalid=true;issues.push('Movement history contains invalid or future records');continue;}ids.add(row.id);if(row.atMs<cutoffMs-30*DAY)continue;history.observedMovementCount++;if(row.type==='Adjustment')history.observedAdjustmentCount++;if(row.type==='Correction')history.observedCorrectionCount++;}}
 if(!Array.isArray(receiptCandidates)||receiptCandidates.length>21){invalid=true;issues.push('Invalid receipt search');}
 else{
  // Preserve the exact query order: millisecond conversion loses nanosecond
  // precision, and re-sorting ties can promote the uninspected sentinel row.
  const receipts=receiptCandidates;let found=false,held=false;
  for(const r of receipts.slice(0,20)){
   if(!validTime(r)||r.type!=='Receipt'||typeof r.id!=='string'){invalid=true;issues.push('Receipt history contains invalid or future records');held=true;break;}
   const correction=correctionLinks[r.id];if(correction?.status==='Approved')continue;
   if(correction&&correction.status!=='Rejected'){issues.push('Receipt correction needs review');if(correction.status!=='Pending')invalid=true;held=true;break;}
   history.receiptId=r.id;history.receiptAtMs=r.atMs;if(features)features.days_since_replenishment=(cutoffMs-r.atMs)/DAY;found=true;break;
  }
  if(!found&&!held)issues.push(receipts.length>20?'Receipt search limit reached':'No replenishment receipt recorded');
 }
 return {method:'rules',productId,productVersion:product.version,observedAtMs:cutoffMs,recommendation,reasons,features,history,captureAllowed:!invalid};
}
