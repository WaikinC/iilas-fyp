// Closed context protocol for fictional scenarios; never operational stock action.
import {canonicalInventoryAI,validateScenario,featuresForScenario,validateInventoryPrediction,
 INVENTORY_AI_PROTOCOL,INVENTORY_AI_FEATURES,INVENTORY_AI_PROVENANCE} from './inventoryAI.js';

export const INVENTORY_CONTEXT_PROTOCOL='inventory-context-inference-2.0';
export const INVENTORY_CONTEXT_FEATURES=Object.freeze([...INVENTORY_AI_FEATURES,'additional_firm_quantity','additional_due_days','incoming_quantity','incoming_eta_days','supply_none','supply_planned','supply_confirmed','supply_disrupted']);
export const INVENTORY_CONTEXT_CLASSES=Object.freeze(['Normal','Reorder Risk','Critical Stock Risk']);
export const INVENTORY_CONTEXT_PROVENANCE=Object.freeze({evaluationKind:'synthetic-stock-context-prototype',origin:'simulated-manual',evaluationOnly:true,operationally_approved:false,independentAccuracyValidated:false,acceptanceSha256:null,humanReviewRequired:true});
const STOCK=['quantityOnHand','reservedQuantity','reorderLevel','movementFrequency','adjustmentCount','daysSinceReplenishment'];
const SCENARIO=[...STOCK,'additionalFirmQuantity','additionalDueDays','incomingQuantity','incomingEtaDays','supplyStatus'];
const STATES=['none','planned','confirmed','disrupted'];
const DAYS=new Set(['days_since_replenishment','additional_due_days','incoming_eta_days']);
const HASHES=['modelSha256','servingManifestSha256','datasetSha256','developmentSha256','evaluationSha256'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH=/^[0-9a-f]{64}$/;
const fail=message=>{throw new Error(message);};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('Invalid context stock fields.');}
function number(value,min,max,integer=false){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value)))fail('Invalid context stock units or bounds.');return value===0?0:value;}
function identity(value,pattern){if(typeof value!=='string'||!pattern.test(value))fail('Invalid context stock identity.');}

export function validateContextScenario(value){
 exact(value,SCENARIO);
 const base=validateScenario(Object.fromEntries(STOCK.map(k=>[k,value[k]])));
 const demand=number(value.additionalFirmQuantity,0,1000000,true),incoming=number(value.incomingQuantity,0,1000000,true);
 if(!STATES.includes(value.supplyStatus))fail('Supply status must be explicitly selected.');
 let due=null,eta=null;
 if(demand>0)due=number(value.additionalDueDays,0,36500);
 else if(value.additionalDueDays!==null)fail('Absent additional demand requires a null deadline.');
 if(value.supplyStatus==='none'){
  if(incoming!==0||value.incomingEtaDays!==null)fail('No incoming batch requires zero quantity and a null ETA.');
 }else{
  if(incoming===0)fail('A stated incoming batch requires positive quantity.');
  eta=number(value.incomingEtaDays,0,36500);
 }
 return {...base,additionalFirmQuantity:demand,additionalDueDays:due,incomingQuantity:incoming,incomingEtaDays:eta,supplyStatus:value.supplyStatus};
}
export function validateContextExperimentInput(value){exact(value,['operationId','scenario']);identity(value.operationId,UUID);return {operationId:value.operationId,scenario:validateContextScenario(value.scenario)};}
export function contextFeaturesForScenario(value){
 const s=validateContextScenario(value),base=Object.fromEntries(STOCK.map(k=>[k,s[k]]));
 return {...featuresForScenario(base),additional_firm_quantity:s.additionalFirmQuantity,additional_due_days:s.additionalDueDays??0,incoming_quantity:s.incomingQuantity,incoming_eta_days:s.incomingEtaDays??0,...Object.fromEntries(STATES.map(k=>['supply_'+k,Number(s.supplyStatus===k)]))};
}
export function validateContextFeatures(value){
 exact(value,INVENTORY_CONTEXT_FEATURES);const f={};
 for(const k of INVENTORY_CONTEXT_FEATURES)f[k]=number(value[k],k==='reorder_distance'?-1000000:0,DAYS.has(k)?36500:k.startsWith('supply_')?1:['movement_frequency','adjustment_count'].includes(k)?2000:1000000,!DAYS.has(k));
 if(f.available_quantity+f.reserved_quantity>1000000||f.adjustment_count>f.movement_frequency||f.available_quantity-f.reorder_distance<0||f.available_quantity-f.reorder_distance>1000000)fail('Inconsistent stock feature totals.');
 if(STATES.reduce((n,k)=>n+f['supply_'+k],0)!==1)fail('Exactly one supply state is required.');
 if(f.additional_firm_quantity===0&&f.additional_due_days!==0)fail('Absent demand has no encoded deadline.');
 if(f.supply_none===1?(f.incoming_quantity!==0||f.incoming_eta_days!==0):f.incoming_quantity===0)fail('Supply state contradicts the batch facts.');
 return f;
}
export function contextFeaturePayload(value){const f=validateContextFeatures(value),bytes=new Uint8Array(8),view=new DataView(bytes.buffer);return INVENTORY_CONTEXT_PROTOCOL+'\n'+INVENTORY_CONTEXT_FEATURES.map(k=>{view.setFloat64(0,f[k],false);return k+'='+Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');}).join('\n')+'\n';}
function validateRanges(ranges,columns){exact(ranges,columns);for(const r of Object.values(ranges)){exact(r,['min','max']);if(typeof r.min!=='number'||typeof r.max!=='number'||!Number.isFinite(r.min)||!Number.isFinite(r.max)||r.min>r.max)fail('Invalid context development ranges.');}return ranges;}
export function validateContextPrediction(value,expected){
 exact(value,['protocol','requestId','inputSha256','features','classOrder','label','probabilities','model',...HASHES,'processingTimeMs','totalProcessingTimeMs','outOfRange',...Object.keys(INVENTORY_CONTEXT_PROVENANCE)]);
 identity(value.requestId,UUID);
 if(value.protocol!==INVENTORY_CONTEXT_PROTOCOL||value.model!=='RandomForest'||value.requestId!==expected.requestId)fail('Context result request or protocol differs.');
 for(const k of ['inputSha256',...HASHES]){identity(value[k],HASH);if(value[k]!==expected[k])fail('Context result lineage differs.');}
 for(const [k,v] of Object.entries(INVENTORY_CONTEXT_PROVENANCE))if(value[k]!==v)fail('Context result provenance differs.');
 const f=validateContextFeatures(value.features);
 if(canonicalInventoryAI(f)!==canonicalInventoryAI(validateContextFeatures(expected.features))||canonicalInventoryAI(value.classOrder)!==canonicalInventoryAI(INVENTORY_CONTEXT_CLASSES))fail('Context features or class order differ.');
 const p=value.probabilities;if(!Array.isArray(p)||p.length!==3)fail('Invalid context scores.');for(const v of p)number(v,0,1);
 if(Math.abs(p.reduce((a,b)=>a+b,0)-1)>1e-6)fail('Context scores must sum to one.');
 const index=[2,0,1].reduce((best,i)=>p[i]>p[best]?i:best,2);
 if(value.label!==INVENTORY_CONTEXT_CLASSES[index])fail('Context label differs from classifier scores.');
 number(value.processingTimeMs,0,15000);number(value.totalProcessingTimeMs,0,20000);
 if(value.totalProcessingTimeMs<value.processingTimeMs)fail('Invalid context result timing.');
 validateRanges(expected.ranges,INVENTORY_CONTEXT_FEATURES);
 const outside=INVENTORY_CONTEXT_FEATURES.filter(k=>f[k]<expected.ranges[k].min||f[k]>expected.ranges[k].max);
 if(canonicalInventoryAI(value.outOfRange)!==canonicalInventoryAI(outside))fail('Context range warning differs.');
 return structuredClone(value);
}
function metrics(value,isContext){
 exact(value,isContext?['accuracy','macroF1','criticalPrecision','criticalRecall','observations','families','accuracyInterval','origin']:['accuracy','criticalRecall','observations','origin']);
 for(const k of isContext?['accuracy','macroF1','criticalPrecision','criticalRecall']:['accuracy','criticalRecall'])number(value[k],0,1);
 number(value.observations,1,1000000,true);
 if(value.origin!=='AI-authored synthetic policy')fail('Unknown study origin.');
 if(isContext){number(value.families,1,value.observations,true);if(!Array.isArray(value.accuracyInterval)||value.accuracyInterval.length!==2)fail('Invalid study interval.');const [lo,hi]=value.accuracyInterval;number(lo,0,1);number(hi,lo,1);}
}
const DEMO_FACTS=SCENARIO.filter(k=>!['quantityOnHand','reservedQuantity','reorderLevel'].includes(k));
const DEMO_SOURCE=['productId','productVersion','name','sku','quantityOnHand','reservedQuantity','reorderLevel','observedAtMs','dataOrigin','factsSha256'];
const RECORD_ID=/^[A-Za-z0-9_-]{1,128}$/;
export function validateDemoProductFacts(value){
 exact(value,DEMO_FACTS);
 const s=validateContextScenario({quantityOnHand:0,reservedQuantity:0,reorderLevel:0,...value});
 return Object.fromEntries(DEMO_FACTS.map(k=>[k,s[k]]));
}
export function validateDemoProductInput(value){
 exact(value,['operationId','productId','productVersion','facts','dataUse']);identity(value.operationId,UUID);identity(value.productId,RECORD_ID);number(value.productVersion,1,Number.MAX_SAFE_INTEGER,true);
 if(value.dataUse!=='demonstration')fail('Explicit demonstration use is required.');
 return {operationId:value.operationId,productId:value.productId,productVersion:value.productVersion,facts:validateDemoProductFacts(value.facts),dataUse:value.dataUse};
}
export function validateDemoProductSource(value){
 exact(value,DEMO_SOURCE);identity(value.productId,RECORD_ID);number(value.productVersion,1,Number.MAX_SAFE_INTEGER,true);number(value.observedAtMs,0,Number.MAX_SAFE_INTEGER,true);identity(value.factsSha256,HASH);
 if(value.dataOrigin!=='demonstration-test'||typeof value.name!=='string'||!value.name.trim()||value.name.length>120||/[\x00-\x1f\x7f]/.test(value.name)||typeof value.sku!=='string'||!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(value.sku))fail('Invalid demo source origin or display facts.');
 for(const key of ['quantityOnHand','reservedQuantity','reorderLevel'])number(value[key],0,1000000,true);
 if(value.reservedQuantity>value.quantityOnHand)fail('Demo source reservations exceed stock.');
 return structuredClone(value);
}
export function demoProductFactsPayload(value){const source=validateDemoProductSource(value);delete source.factsSha256;return canonicalInventoryAI(source);}
export async function verifyDemoProductSource(value){
 const source=validateDemoProductSource(value),bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(demoProductFactsPayload(source)));
 const digest=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
 if(digest!==source.factsSha256)fail('The frozen demo product facts changed.');return source;
}
export function demoScenarioFor(source,facts){
 const s=validateDemoProductSource(source);return validateContextScenario({quantityOnHand:s.quantityOnHand,reservedQuantity:s.reservedQuantity,reorderLevel:s.reorderLevel,...validateDemoProductFacts(facts)});
}
export function validateContextHistoryRecord(value){
 try{
  const isDemo=value?.version===3;
  exact(value,['ownerId','actor','operationId','scenario','features','inputSha256','status','prediction','reason','source','createdAt','requestedAtMs','version','protocol',...Object.keys(INVENTORY_CONTEXT_PROVENANCE),...(isDemo?['scenarioSource','sourceProduct']:[])]);
  const isContext=value.protocol===INVENTORY_CONTEXT_PROTOCOL;
  if(!isContext&&value.protocol!==INVENTORY_AI_PROTOCOL)fail('Unknown history protocol.');
  if(value.version!==(isContext?(isDemo?3:2):1))fail('History version differs.');
  for(const [k,v] of Object.entries(isContext?INVENTORY_CONTEXT_PROVENANCE:INVENTORY_AI_PROVENANCE))if(value[k]!==v)fail('History provenance differs.');
  for(const k of ['ownerId','actor'])if(typeof value[k]!=='string'||!value[k]||value[k].length>128)fail('Invalid history owner.');
  identity(value.operationId,UUID);identity(value.inputSha256,HASH);number(value.requestedAtMs,0,Number.MAX_SAFE_INTEGER,true);
  if(value.createdAt===null||typeof value.createdAt!=='object')fail('History timestamp missing.');
  number(value.createdAt.seconds,0,Number.MAX_SAFE_INTEGER,true);number(value.createdAt.nanoseconds,0,999999999,true);
  const s=isContext?validateContextScenario(value.scenario):validateScenario(value.scenario),f=isContext?contextFeaturesForScenario(s):featuresForScenario(s);
  if(isDemo){if(value.scenarioSource!=='demo-product')fail('Unknown demo scenario source.');const product=validateDemoProductSource(value.sourceProduct);for(const k of ['quantityOnHand','reservedQuantity','reorderLevel'])if(s[k]!==product[k])fail('Scenario differs from the frozen demo product.');}
  if(canonicalInventoryAI(f)!==canonicalInventoryAI(value.features))fail('History feature preview differs.');
  exact(value.source,[...HASHES,'ranges','metrics','model']);
  for(const k of HASHES)identity(value.source[k],HASH);
  if(value.source.model!=='RandomForest')fail('Unknown history model.');
  metrics(value.source.metrics,isContext);validateRanges(value.source.ranges,isContext?INVENTORY_CONTEXT_FEATURES:INVENTORY_AI_FEATURES);
  if(value.status==='Predicted'){
   if(value.reason!==null||!value.prediction)fail('Invalid predicted history.');
   const expected={...value.source,requestId:value.prediction.requestId,inputSha256:value.inputSha256,features:f};
   (isContext?validateContextPrediction:validateInventoryPrediction)(value.prediction,expected);
  }else if(value.status==='Unavailable'){
   exact(value.reason,['code','message']);
   if(value.prediction!==null||typeof value.reason.code!=='string'||!['busy','timeout','invalid_response','service_unavailable','configuration_changed','request_expired',...(isDemo?['product_changed']:[])].includes(value.reason.code)||typeof value.reason.message!=='string'||!value.reason.message||value.reason.message.length>1000)fail('Invalid unavailable history.');
  }else fail('Unknown history status.');
  // Firestore Timestamp is preserved; it need not be structured-cloneable.
  return {kind:isDemo?'demo-product':isContext?'context':'legacy',record:value};
 }catch{return {kind:'unsupported',reason:'This retained experiment has an unsupported or invalid format.'};}
}
export async function decodeInventoryExperimentHistory(value){
 const result=validateContextHistoryRecord(value);
 if(result.kind!=='demo-product')return result;
 try{await verifyDemoProductSource(result.record.sourceProduct);return result;}catch{return {kind:'unsupported',reason:'This retained experiment has invalid frozen demo-product facts. Its data has been retained.'};}
}
