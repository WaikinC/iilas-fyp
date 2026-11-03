import {assertParcelLocalEvaluationAuthority,isParcelLocalEvaluationModel} from './parcelLocalEvaluation.mjs';
const base=['requestId','status','label','confidence','probabilities','confidenceMeaning','model','modelVersion','preprocessing','contrast','evidenceSha256','selectionSha256','evaluationSha256','processingTimeMs','humanReviewRequired','operationally_approved','classOrder','acceptanceSha256','evaluationKind','evaluationManifestSha256','evaluationOnly','runtimeMode','intendedUse','totalProcessingTimeMs'];
const invalid=()=>{throw Object.assign(new Error('The service returned an invalid experimental parcel result.'),{code:'failed-precondition'});};
const own=(v,k)=>{const d=Object.getOwnPropertyDescriptor(v,k);return d&&Object.hasOwn(d,'value')&&d.enumerable;};
const pair=v=>Array.isArray(v)&&v.length===2&&own(v,'0')&&own(v,'1')&&Reflect.ownKeys(v).length===3;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function validate(result,{model,evidenceSha256,sessionId,frameId,sequence}={},live){
  assertParcelLocalEvaluationAuthority(model);if(!isParcelLocalEvaluationModel(model))invalid();
  const keys=live?[...base,'policyVersion','policySha256','sessionId','frameId','sequence']:base;
  if(!result||typeof result!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(result))||Reflect.ownKeys(result).length!==keys.length||keys.some(k=>!own(result,k)))invalid();
  if(result.operationally_approved!==false||result.acceptanceSha256!==null||result.humanReviewRequired!==true||result.evaluationOnly!==true||result.runtimeMode!=='local-evaluation'||result.confidenceMeaning!=='uncalibrated'||result.intendedUse!==(live?'sampled-live':'registered-photo')||typeof evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(evidenceSha256)||result.evidenceSha256!==evidenceSha256||!Object.keys(model).filter(k=>k!=='classOrder').every(k=>result[k]===model[k])||!pair(result.classOrder)||result.classOrder[0]!=='Normal'||result.classOrder[1]!=='Damaged')invalid();
  if(live&&(!uuid(sessionId)||!uuid(frameId)||!Number.isSafeInteger(sequence)||sequence<1||sequence>12||result.sessionId!==sessionId||result.frameId!==frameId||result.sequence!==sequence))invalid();
  const p=result.probabilities;if(!pair(p)||!p.every(x=>finite(x)&&x>=0&&x<=1)||Math.abs(p[0]+p[1]-1)>1e-6||!finite(result.confidence)||result.confidence<0||result.confidence>1||Math.abs(result.confidence-Math.max(...p))>1e-6)invalid();
  const label=p[0]===p[1]?null:p[0]>p[1]?'Normal':'Damaged';if(result.label!==label||result.status!==(label===null?'abstained':'predicted')||!uuid(result.requestId)||!finite(result.processingTimeMs)||result.processingTimeMs<0||result.processingTimeMs>25000||!finite(result.totalProcessingTimeMs)||result.totalProcessingTimeMs<result.processingTimeMs||result.totalProcessingTimeMs>30000)invalid();
  return Object.fromEntries(keys.map(k=>[k,Array.isArray(result[k])?[...result[k]]:result[k]]));
}
export const validateParcelLocalEvaluationResponse=(result,context)=>validate(result,context,false);
export const validateParcelLocalEvaluationLiveResponse=(result,context)=>validate(result,context,true);
