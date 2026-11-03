import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
const api=await import('../lib/inventoryAI.js').catch(()=>null);
const outputs=await import('./inventory-ai-output.mjs').catch(()=>null);
const need=()=>assert(api,'The approved stock AI contract helper is missing.');
const scenario=()=>({quantityOnHand:120,reservedQuantity:20,reorderLevel:25,movementFrequency:12,adjustmentCount:1,daysSinceReplenishment:.25});
const op='00000000-0000-4000-8000-000000000001';
const features=()=>({available_quantity:100,reserved_quantity:20,movement_frequency:12,reorder_distance:75,adjustment_count:1,days_since_replenishment:.25});
const hashes={modelSha256:'a'.repeat(64),servingManifestSha256:'b'.repeat(64),datasetSha256:'c'.repeat(64),developmentSha256:'d'.repeat(64),evaluationSha256:'e'.repeat(64)};
function expected(){return {requestId:op,inputSha256:'f'.repeat(64),features:features(),...hashes,ranges:Object.fromEntries(Object.keys(features()).map(k=>[k,{min:0,max:200}]))};}
function wire(){return {protocol:'inventory-synthetic-inference-1.0',requestId:op,inputSha256:'f'.repeat(64),features:features(),classOrder:['Normal','Reorder Risk','Critical Stock Risk'],label:'Normal',probabilities:[.7,.2,.1],model:'RandomForest',...hashes,processingTimeMs:2.5,totalProcessingTimeMs:5,outOfRange:[],evaluationKind:'synthetic-stock-prototype',origin:'simulated-manual',evaluationOnly:true,operationally_approved:false,independentAccuracyValidated:false,acceptanceSha256:null,humanReviewRequired:true};}

test('scenario_units_and_reservations: six facts derive six ordered model inputs once',()=>{
 need();assert.deepEqual(api.validateScenario(scenario()),scenario());
 assert.deepEqual(api.featuresForScenario(scenario()),features());
 assert.equal(api.featuresForScenario({...scenario(),reorderLevel:100}).reorder_distance,0);
 assert.equal(api.featuresForScenario({...scenario(),quantityOnHand:20,reservedQuantity:20,reorderLevel:10}).reorder_distance,-10);
 assert.equal(api.featuresForScenario({...scenario(),daysSinceReplenishment:0}).days_since_replenishment,0);
 assert.deepEqual(Object.keys(api.featuresForScenario(scenario())),api.INVENTORY_AI_FEATURES);
});
test('scenario rejects unknown, omitted, nonfinite, coerced and inconsistent units',()=>{
 need();for(const key of Object.keys(scenario())){
  const omitted=scenario();delete omitted[key];assert.throws(()=>api.validateScenario(omitted));
  for(const v of [true,false,null,'1',NaN,Infinity,-Infinity,-1])assert.throws(()=>api.validateScenario({...scenario(),[key]:v}));
 }
 for(const s of [{...scenario(),productId:'real'},{...scenario(),model:'RF'},{...scenario(),operationally_approved:true},{...scenario(),reservedQuantity:121},{...scenario(),quantityOnHand:1.2},{...scenario(),movementFrequency:2001},{...scenario(),adjustmentCount:13},{...scenario(),daysSinceReplenishment:36501}])assert.throws(()=>api.validateScenario(s));
 assert.throws(()=>api.validateScenario(Object.create(scenario())));
});
test('experiment input is exact and bound to a UUIDv4',()=>{
 need();assert.deepEqual(api.validateExperimentInput({operationId:op,scenario:scenario()}),{operationId:op,scenario:scenario()});
 for(const v of [{scenario:scenario()},{operationId:'not-an-id',scenario:scenario()},{operationId:op.replace('4000','1000'),scenario:scenario()},{operationId:op,scenario:scenario(),actor:'someone'}])assert.throws(()=>api.validateExperimentInput(v));
});
test('feature payload uses exact big-endian binary64 hex including fractional/scientific/signed zero',()=>{
 need();const f=features();const payload=api.inventoryAIFeaturePayload(f);
 assert.equal(payload,'inventory-synthetic-inference-1.0\navailable_quantity=4059000000000000\nreserved_quantity=4034000000000000\nmovement_frequency=4028000000000000\nreorder_distance=4052c00000000000\nadjustment_count=3ff0000000000000\ndays_since_replenishment=3fd0000000000000\n');
 assert.equal(api.inventoryAIFeaturePayload({...f,days_since_replenishment:-0}),api.inventoryAIFeaturePayload({...f,days_since_replenishment:0}));
 assert.match(api.inventoryAIFeaturePayload({...f,days_since_replenishment:1e-7}),/days_since_replenishment=3e7ad7f29abcaf48\n$/);
 assert.throws(()=>api.inventoryAIFeaturePayload({...f,label:'Normal'}));
 assert.throws(()=>api.inventoryAIFeaturePayload({...f,days_since_replenishment:null}));
});
test('canonical scenario JSON is ordered and rejects unsupported/nonfinite values',()=>{
 need();assert.equal(api.canonicalInventoryAI({z:1,a:{z:0,a:.25}}),'{"a":{"a":0.25,"z":0},"z":1}');
 for(const v of [{a:undefined},{a:NaN},new Date()])assert.throws(()=>api.canonicalInventoryAI(v));
});
test('prediction exact lineage, class order, scores and false provenance',()=>{
 need();assert.deepEqual(api.validateInventoryPrediction(wire(),expected()),wire());
 for(const key of ['protocol','requestId','inputSha256',...Object.keys(hashes),'model','evaluationKind','origin'])assert.throws(()=>api.validateInventoryPrediction({...wire(),[key]:'wrong'},expected()));
 for(const key of ['evaluationOnly','humanReviewRequired'])assert.throws(()=>api.validateInventoryPrediction({...wire(),[key]:false},expected()));
 for(const key of ['operationally_approved','independentAccuracyValidated'])assert.throws(()=>api.validateInventoryPrediction({...wire(),[key]:true},expected()));
 for(const extra of [{extra:'x'},{acceptanceSha256:'a'.repeat(64)},{classOrder:['Critical Stock Risk','Normal','Reorder Risk']},{features:{...features(),reserved_quantity:21}},{probabilities:[.7,.2,.2]},{label:'Critical Stock Risk'},{processingTimeMs:Infinity},{totalProcessingTimeMs:1},{totalProcessingTimeMs:20001}])assert.throws(()=>api.validateInventoryPrediction({...wire(),...extra},expected()));
});
test('equal model scores use classifier alphabetical tie order, not display order',()=>{
 need();const w={...wire(),label:'Critical Stock Risk',probabilities:[.5,0,.5]};
 assert.equal(api.validateInventoryPrediction(w,expected()).label,'Critical Stock Risk');
 assert.throws(()=>api.validateInventoryPrediction({...w,label:'Normal'},expected()));
});
test('out-of-development-range features are independently derived and ordered',()=>{
 need();const e=expected();e.ranges.available_quantity.max=90;e.ranges.days_since_replenishment.min=1;
 const w={...wire(),outOfRange:['available_quantity','days_since_replenishment']};
 assert.deepEqual(api.validateInventoryPrediction(w,e).outOfRange,w.outOfRange);
 assert.throws(()=>api.validateInventoryPrediction(wire(),e));
 assert.throws(()=>api.validateInventoryPrediction({...w,outOfRange:[...w.outOfRange].reverse()},e));
});
test('readiness never promotes partial zero counts or a receipt into complete history',()=>{
 need();const a={productId:'p',productVersion:1,observedAtMs:1,features:{...features(),movement_frequency:null,adjustment_count:null,days_since_replenishment:null},history:{coverage:'Unverified',observedMovementCount:0,observedAdjustmentCount:0,issues:['History not verified']}};
 const original=structuredClone(a),r=api.inventoryAIReadiness(a);
 assert.equal(r.status,'Unavailable');assert.deepEqual(r.missingFeatures,['movement_frequency','adjustment_count','days_since_replenishment']);assert.deepEqual(a,original);
 const partial=api.inventoryAIReadiness({...a,features:features()});assert.equal(partial.status,'Unavailable');assert(partial.reasons.some(v=>/history|coverage/i.test(v)));
});
test('QA outputs refuse traversal, existing destinations and outside/unignored bases',async()=>{
 assert(outputs,'The ignored stock AI evidence helper is missing.');
 for(const kind of ['../x','bad/name',''])await assert.rejects(()=>outputs.createInventoryAIOutput(kind));
 await assert.rejects(()=>outputs.createInventoryAIOutput('test',{base:'.git'}));
 await assert.rejects(()=>outputs.createInventoryAIOutput('test',{id:'../x'}));
 const id=randomUUID(),dir=await outputs.createInventoryAIOutput('contract',{id});assert(dir.includes('inventory-ai-20261023'));
 await assert.rejects(()=>outputs.createInventoryAIOutput('contract',{id}));
});
test('wire constants cannot be mutated; payload hashing is deterministic',()=>{
 need();assert(Object.isFrozen(api.INVENTORY_AI_FEATURES));assert(Object.isFrozen(api.INVENTORY_AI_CLASSES));assert(Object.isFrozen(api.INVENTORY_AI_PROVENANCE));
 const f=features(),reversed=Object.fromEntries(Object.entries(f).reverse());
 const h=v=>createHash('sha256').update(api.inventoryAIFeaturePayload(v)).digest('hex');assert.equal(h(f),h(reversed));
});
