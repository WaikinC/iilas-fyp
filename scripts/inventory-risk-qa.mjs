import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
const api=await import('../lib/inventoryRisk.js').catch(()=>null);
const need=()=>{assert.ok(api,'Canonical inventory assessment helper is not implemented');return api;};
const cutoffMs=Date.parse('2026-10-22T12:00:00Z'),day=86400000;
const product={version:3,name:'Fixture',sku:'FIXTURE',quantityOnHand:100,reservedQuantity:30,reorderLevel:80,warehouseReservedQuantity:0,location:'A',status:'Active'};
const base=extra=>({productId:'fixture',product:{...product},movements:[],receiptCandidates:[],correctionLinks:{},cutoffMs,overflow:false,...extra});
test('equal-time receipt sentinel cannot be promoted ahead of the inspected twenty',()=>{
 const receiptCandidates=Array.from({length:21},(_,i)=>({id:`r${String(21-i).padStart(2,'0')}`,type:'Receipt',atMs:cutoffMs-day}));const correctionLinks=Object.fromEntries(receiptCandidates.slice(0,20).map(r=>[r.id,{status:'Approved'}]));const r=need().buildInventoryAssessment(base({receiptCandidates,correctionLinks}));assert.equal(r.history.receiptId,null);assert.equal(r.features.days_since_replenishment,null);
});
test('reserved stock is subtracted once; rules never emit a risk label or confidence',()=>{
 const r=need().buildInventoryAssessment(base());assert.equal(r.method,'rules');assert.equal(r.features.available_quantity,70);assert.equal(r.features.reorder_distance,-10);assert.equal(r.recommendation,'Reorder review');assert.equal(r.captureAllowed,true);assert.equal(Object.hasOwn(r,'label'),false);assert.equal(Object.hasOwn(r,'confidence'),false);
});
test('reorder equality warns, above reorder is not an automatic Normal',()=>{
 assert.equal(need().buildInventoryAssessment(base({product:{...product,reorderLevel:70}})).recommendation,'Reorder review');
 assert.equal(api.buildInventoryAssessment(base({product:{...product,reorderLevel:69}})).recommendation,'No reorder warning');
});
test('zero quantity and reorder level are valid and do not imply Critical',()=>{
 const r=need().buildInventoryAssessment(base({product:{...product,quantityOnHand:0,reservedQuantity:0,reorderLevel:0}}));assert.equal(r.recommendation,'Reorder review');assert.equal(r.captureAllowed,true);
});
test('partial movement observations never certify complete history',()=>{
 const r=need().buildInventoryAssessment(base({movements:[{id:'m1',type:'Issue',atMs:cutoffMs-day},{id:'m2',type:'Adjustment',atMs:cutoffMs-2*day}]}));
 assert.equal(r.history.observedMovementCount,2);assert.equal(r.history.observedAdjustmentCount,1);assert.equal(r.history.coverage,'Unverified');assert.equal(r.features.movement_frequency,null);assert.equal(r.features.adjustment_count,null);assert.equal(r.features.days_since_replenishment,null);
});
test('window boundaries are inclusive and older records do not enter counts',()=>{
 const r=need().buildInventoryAssessment(base({movements:[{id:'a',type:'Receipt',atMs:cutoffMs-30*day},{id:'b',type:'Issue',atMs:cutoffMs},{id:'c',type:'Issue',atMs:cutoffMs-30*day-1}]}));assert.equal(r.history.observedMovementCount,2);
});
test('eligible receipt days are recorded separately from unverified window',()=>{
 const r=need().buildInventoryAssessment(base({receiptCandidates:[{id:'receipt',type:'Receipt',atMs:cutoffMs-2*day}]}));assert.equal(r.history.receiptId,'receipt');assert.equal(r.features.days_since_replenishment,2);assert.equal(r.features.movement_frequency,null);
});
test('reversed and ambiguous receipt corrections are never treated as valid replenishment',()=>{
 for(const status of ['Approved','Pending','Corrupt']){const r=need().buildInventoryAssessment(base({receiptCandidates:[{id:'r1',type:'Receipt',atMs:cutoffMs-day},{id:'r2',type:'Receipt',atMs:cutoffMs-3*day}],correctionLinks:{r1:{status}}}));assert.equal(r.features.days_since_replenishment,status==='Approved'?3:null);}
});
test('receipt search exhaustion never selects the twenty-first candidate',()=>{
 const receiptCandidates=Array.from({length:21},(_,i)=>({id:`r${i}`,type:'Receipt',atMs:cutoffMs-(i+1)*day}));const correctionLinks=Object.fromEntries(receiptCandidates.slice(0,20).map(r=>[r.id,{status:'Approved'}]));const r=need().buildInventoryAssessment(base({receiptCandidates,correctionLinks}));assert.equal(r.features.days_since_replenishment,null);assert.ok(r.history.issues.includes('Receipt search limit reached'));
});
test('future or malformed timestamps block capture',()=>{
 for(const atMs of [cutoffMs+1,NaN,null,-1]){const r=need().buildInventoryAssessment(base({movements:[{id:'m',type:'Issue',atMs}]}));assert.equal(r.captureAllowed,false);}
});
test('window overflow cannot silently truncate a snapshot',()=>{
 const r=need().buildInventoryAssessment(base({overflow:true}));assert.equal(r.captureAllowed,false);assert.ok(r.history.issues.includes('Movement limit reached'));
});
test('inconsistent balances and bins do not become healthy after clamping',()=>{
 for(const patch of [{reservedQuantity:101},{quantityOnHand:-1},{quantityOnHand:NaN},{locationBalances:[{location:'A',quantity:1,reserved:0,warehouse:0}]},{reorderLevel:null}]){const r=need().buildInventoryAssessment(base({product:{...product,...patch}}));assert.equal(r.recommendation,'Balance needs review');assert.equal(r.captureAllowed,false);assert.equal(r.features,null);}
});
test('string reservations and unknown correction states cannot enter a frozen feature vector',()=>{
 const stringBalance=need().buildInventoryAssessment(base({product:{...product,reservedQuantity:'30'}}));assert.equal(stringBalance.captureAllowed,false);assert.equal(stringBalance.features,null);
 const corruptLink=api.buildInventoryAssessment(base({receiptCandidates:[{id:'r',type:'Receipt',atMs:cutoffMs-day}],correctionLinks:{r:{status:'Corrupt'}}}));assert.equal(corruptLink.captureAllowed,false);
});
test('capture exact schema forbids client facts and invalid identities',()=>{
 const good={productId:'p',productVersion:2,operationId:randomUUID()};assert.deepEqual(need().validateCaptureInput(good),good);
 for(const patch of [{scope:'foreign'},{features:{}},{productVersion:0},{productId:'../p'},{operationId:'bad'}])assert.throws(()=>api.validateCaptureInput({...good,...patch}));assert.throws(()=>api.validateAssessmentInput({productId:'p',label:'Normal'}));
});
const review=extra=>({snapshotId:'s',version:1,operationId:randomUUID(),decision:'Normal',reason:'Reviewed current balance evidence carefully.',evidenceNotes:'Stock review dossier is available for inspection.',fulfilmentImpact:'',evidenceRefs:[],...extra});
test('review labels, Critical impact, substantive notes and evidence bounds are explicit',()=>{
 assert.equal(need().validateReviewInput(review()).decision,'Normal');assert.equal(api.validateReviewInput(review({decision:'Unresolved'})).decision,'Unresolved');
 for(const patch of [{decision:'Low'},{reason:'ok'},{evidenceNotes:''},{decision:'Critical Stock Risk'},{evidenceRefs:[{kind:'users',id:'u'}]},{evidenceRefs:Array(11).fill({kind:'shipments',id:'x'})},{trainingEligibility:'Ready'}])assert.throws(()=>api.validateReviewInput(review(patch)));
 assert.equal(api.validateReviewInput(review({decision:'Critical Stock Risk',fulfilmentImpact:'Confirmed commitment cannot be fulfilled from stock.'})).decision,'Critical Stock Risk');
});
test('canonical frozen input ordering is deterministic and refuses undefined/nonfinite',()=>{
 assert.equal(need().canonicalInventoryRisk({b:2,a:{y:1,x:0}}),api.canonicalInventoryRisk({a:{x:0,y:1},b:2}));assert.throws(()=>api.canonicalInventoryRisk({a:undefined}));assert.throws(()=>api.canonicalInventoryRisk({a:Infinity}));
});
