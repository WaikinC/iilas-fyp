// Closed synthetic-stock protocol. This never admits real history or stock action.
export const INVENTORY_AI_PROTOCOL='inventory-synthetic-inference-1.0';
export const INVENTORY_AI_FEATURES=Object.freeze(['available_quantity','reserved_quantity','movement_frequency','reorder_distance','adjustment_count','days_since_replenishment']);
export const INVENTORY_AI_CLASSES=Object.freeze(['Normal','Reorder Risk','Critical Stock Risk']);
export const INVENTORY_AI_PROVENANCE=Object.freeze({evaluationKind:'synthetic-stock-prototype',origin:'simulated-manual',evaluationOnly:true,operationally_approved:false,independentAccuracyValidated:false,acceptanceSha256:null,humanReviewRequired:true});
const SCENARIO=['quantityOnHand','reservedQuantity','reorderLevel','movementFrequency','adjustmentCount','daysSinceReplenishment'];
const HASHES=['modelSha256','servingManifestSha256','datasetSha256','developmentSha256','evaluationSha256'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const fail=message=>{throw new Error(message);};
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Invalid stock experiment fields.');
}
function number(value,min,max,integer=false){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value)))fail('Stock experiment values have invalid units or bounds.');
 return value===0?0:value;
}
export function validateScenario(value){
 exact(value,SCENARIO);
 const result={};
 for(const key of SCENARIO)result[key]=number(value[key],0,key==='movementFrequency'||key==='adjustmentCount'?2000:key==='daysSinceReplenishment'?36500:1000000,key!=='daysSinceReplenishment');
 if(result.reservedQuantity>result.quantityOnHand||result.adjustmentCount>result.movementFrequency)fail('Reservations or Adjustment count exceed their totals.');
 return result;
}
export function validateExperimentInput(value){
 exact(value,['operationId','scenario']);
 if(typeof value.operationId!=='string'||!UUID.test(value.operationId))fail('Invalid stock experiment operation ID.');
 return {operationId:value.operationId,scenario:validateScenario(value.scenario)};
}
export function featuresForScenario(value){
 const s=validateScenario(value),available=s.quantityOnHand-s.reservedQuantity;
 return {available_quantity:available,reserved_quantity:s.reservedQuantity,movement_frequency:s.movementFrequency,reorder_distance:available-s.reorderLevel,adjustment_count:s.adjustmentCount,days_since_replenishment:s.daysSinceReplenishment};
}
function validateFeatures(value){
 exact(value,INVENTORY_AI_FEATURES);
 const f={};
 for(const key of INVENTORY_AI_FEATURES)f[key]=number(value[key],key==='reorder_distance'?-1000000:0,key==='days_since_replenishment'?36500:key==='movement_frequency'||key==='adjustment_count'?2000:1000000,key!=='days_since_replenishment');
 if(f.available_quantity+f.reserved_quantity>1000000||f.adjustment_count>f.movement_frequency||f.available_quantity-f.reorder_distance<0||f.available_quantity-f.reorder_distance>1000000)fail('Inconsistent stock model features.');
 return f;
}
export function canonicalInventoryAI(value){
 function canonical(v){
  if(v===null||typeof v==='string'||typeof v==='boolean')return v;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(Array.isArray(v))return Array.from(v,canonical);
  if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype)return Object.fromEntries(Object.keys(v).sort().map(key=>[key,canonical(v[key])]));
  fail('Unsupported stock experiment value.');
 }
 return JSON.stringify(canonical(value));
}
export function inventoryAIFeaturePayload(value){
 const f=validateFeatures(value),buffer=new ArrayBuffer(8),view=new DataView(buffer),bytes=new Uint8Array(buffer);
 return INVENTORY_AI_PROTOCOL+'\n'+INVENTORY_AI_FEATURES.map(key=>{view.setFloat64(0,f[key]===0?0:f[key],false);return key+'='+Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');}).join('\n')+'\n';
}
export function validateInventoryPrediction(value,expected){
 const keys=['protocol','requestId','inputSha256','features','classOrder','label','probabilities','model',...HASHES,'processingTimeMs','totalProcessingTimeMs','outOfRange',...Object.keys(INVENTORY_AI_PROVENANCE)];
 exact(value,keys);
 if(value.protocol!==INVENTORY_AI_PROTOCOL||value.model!=='RandomForest'||typeof value.requestId!=='string'||!UUID.test(value.requestId)||value.requestId!==expected.requestId)fail('Stock result request/protocol differs.');
 for(const key of ['inputSha256',...HASHES])if(typeof value[key]!=='string'||!HASH.test(value[key])||value[key]!==expected[key])fail('Stock result lineage differs.');
 for(const [key,wanted] of Object.entries(INVENTORY_AI_PROVENANCE))if(value[key]!==wanted)fail('Stock result experimental provenance differs.');
 const f=validateFeatures(value.features);
 if(canonicalInventoryAI(f)!==canonicalInventoryAI(validateFeatures(expected.features)))fail('Stock result inputs differ.');
 if(canonicalInventoryAI(value.classOrder)!==canonicalInventoryAI(INVENTORY_AI_CLASSES))fail('Stock class order differs.');
 const p=value.probabilities;
 if(!Array.isArray(p)||p.length!==3)fail('Invalid stock model scores.');
 for(const v of p)number(v,0,1);
 if(Math.abs(p.reduce((a,b)=>a+b,0)-1)>1e-6)fail('Stock model scores must sum to one.');
 // sklearn argmax resolves equal probabilities in its alphabetical class order.
 const index=[2,0,1].reduce((best,i)=>p[i]>p[best]?i:best,2);
 if(value.label!==INVENTORY_AI_CLASSES[index])fail('Stock label does not match model scores.');
 number(value.processingTimeMs,0,15000);number(value.totalProcessingTimeMs,0,20000);
 if(value.totalProcessingTimeMs<value.processingTimeMs)fail('Stock result timing differs.');
 exact(expected.ranges,INVENTORY_AI_FEATURES);
 const out=INVENTORY_AI_FEATURES.filter(key=>{
  const range=expected.ranges[key];exact(range,['min','max']);
  if(typeof range.min!=='number'||typeof range.max!=='number'||!Number.isFinite(range.min)||!Number.isFinite(range.max)||range.min>range.max)fail('Stock development range is unavailable.');
  return f[key]<range.min||f[key]>range.max;
 });
 if(canonicalInventoryAI(value.outOfRange)!==canonicalInventoryAI(out))fail('Stock range warning differs.');
 return structuredClone(value);
}
export function inventoryAIReadiness(assessment){
 if(!assessment||typeof assessment.productId!=='string'||!Number.isSafeInteger(assessment.productVersion)||assessment.productVersion<1||!Number.isSafeInteger(assessment.observedAtMs)||assessment.observedAtMs<0)fail('Stock readiness requires a trusted assessment.');
 const missingFeatures=INVENTORY_AI_FEATURES.filter(key=>typeof assessment.features?.[key]!=='number'||!Number.isFinite(assessment.features[key]));
 const reasons=['Real inventory history is not qualified for this experimental model.'];
 if(missingFeatures.length)reasons.push('Required model inputs are unknown: '+missingFeatures.join(', ')+'.');
 for(const issue of assessment.history?.issues??[])if(typeof issue==='string'&&!reasons.includes(issue))reasons.push(issue);
 return {status:'Unavailable',missingFeatures,reasons,productId:assessment.productId,productVersion:assessment.productVersion,observedAtMs:assessment.observedAtMs};
}
