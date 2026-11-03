const fail=message=>{throw Error(message);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function completionUUID(value){if(typeof value!=='string'||!uuid.test(value))fail('A canonical operation UUID is required.');return value;}
export function completionIdentifier(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))fail('A valid record identifier is required.');return value;}
// Do not evaluate getters, custom prototypes or toJSON when checking an intent.
export function completionCanonical(value){
 const ancestors=new Set();let nodes=0;
 function visit(item,depth){
  if(++nodes>4000||depth>12)fail('Operation input is too complex.');
  if(item===null||typeof item==='boolean')return item;
  if(typeof item==='number'){if(!Number.isFinite(item))fail('Operation numbers must be finite.');return item;}
  if(typeof item==='string'){if(item.length>32768)fail('Operation text is too long.');return item;}
  if(typeof item!=='object'||ancestors.has(item))fail('Operation input must be plain JSON without cycles.');
  const array=Array.isArray(item);if(!array&&Object.getPrototypeOf(item)!==Object.prototype)fail('Operation input must use plain objects.');
  const keys=Reflect.ownKeys(item);if(array&&item.length>1000)fail('Operation list is too long.');
  if(keys.some(k=>typeof k!=='string'||['__proto__','prototype','constructor'].includes(k)))fail('Unsafe operation field.');
  const descriptors=Object.getOwnPropertyDescriptors(item);
  if(keys.some(k=>!('value' in descriptors[k])||(!array&&!descriptors[k].enumerable)))fail('Operation input must not use accessors or hidden fields.');
  ancestors.add(item);let result;
  if(array){if(keys.length!==item.length+1)fail('Operation lists must be dense JSON arrays.');result=Array.from({length:item.length},(_,i)=>visit(descriptors[i]?.value,depth+1));}
  else {result={};for(const k of keys.sort())result[k]=visit(descriptors[k].value,depth+1);}
  ancestors.delete(item);return result;
 }
 const encoded=JSON.stringify(visit(value,0));if(new TextEncoder().encode(encoded).length>65536)fail('Operation input exceeds its byte limit.');return encoded;
}
export function completionExact(value,required,optional=[]){
 const clean=JSON.parse(completionCanonical(value));
 if(!clean||Array.isArray(clean)||typeof clean!=='object'||required.some(k=>!Object.hasOwn(clean,k))||Object.keys(clean).some(k=>![...required,...optional].includes(k)))fail('Unexpected or missing operation input fields.');
 return clean;
}
export function validateCompletionIntent(value){
 const clean=JSON.parse(completionCanonical(value));
 if(!clean||typeof clean!=='object'||Array.isArray(clean))fail('A plain operation intent is required.');
 completionUUID(clean.operationId);
 if(['scope','ownerId','actor','role','status','replayed','state'].some(k=>Object.hasOwn(clean,k)))fail('Operation authority fields cannot be supplied.');
 return clean;
}
export function validateCompletionOutcome(value,{action,input}){
 completionIdentifier(action);completionUUID(input.operationId);
 const clean=completionExact(value,['state','operationId','action','recordId','version','replayed']);
 if(clean.action!==action||clean.operationId!==input.operationId||typeof clean.replayed!=='boolean')fail('Operation outcome does not match the saved intent.');
 if(clean.state==='Cancelled'){
  if(clean.recordId!==null||clean.version!==null)fail('Cancelled operations cannot contain a completed record.');
 }else if(clean.state==='Completed'){
  completionIdentifier(clean.recordId);if(!Number.isSafeInteger(clean.version)||clean.version<1)fail('A completed record version is required.');
  // recordId may identify the source of a newly created observation, rather
  // than its output document. Only mutation identifiers are output identities.
  const expectedId=action==='reviseTransportPlan'?input.shipmentId:input.id??input.exceptionId;
  if(expectedId!==undefined&&clean.recordId!==expectedId)fail('Operation record identity changed.');
  const expectedVersion=action==='reviseTransportPlan'?input.expectedPlanVersion:input.expectedVersion??input.expectedReviewVersion;
  if(expectedVersion!==undefined&&clean.version!==expectedVersion+1)fail('Operation record version changed.');
 }else fail('No correlated terminal operation outcome was received.');
 return clean;
}
