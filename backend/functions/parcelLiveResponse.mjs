import {requireParcelLiveAcceptance} from './parcelLiveAcceptance.mjs';
import {validateResolveParcelLiveFrame} from './parcelLive.js';

const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const keys=['model','modelVersion','selectionSha256','evaluationSha256','acceptanceSha256','preprocessing','contrast','classOrder','intendedUse','policyVersion','policySha256','operationally_approved','humanReviewRequired','confidenceMeaning','evidenceSha256','sessionId','frameId','sequence','probabilities','confidence','label','status','processingTimeMs','totalProcessingTimeMs','requestId'];
const invalid=()=>{const error=new Error('The service returned an invalid or unapproved live parcel result.');error.code='failed-precondition';throw error;};
const own=(value,key)=>{const d=Object.getOwnPropertyDescriptor(value,key);return !!d&&Object.hasOwn(d,'value')&&d.enumerable;};
const pair=value=>Array.isArray(value)&&value.length===2&&own(value,'0')&&own(value,'1')&&Reflect.ownKeys(value).length===3;

export function validateParcelLiveResponse(result,{acceptance,evidenceSha256,sessionId,frameId,sequence}={}){
  const model=requireParcelLiveAcceptance(acceptance);
  try{validateResolveParcelLiveFrame({sessionId,frameId});}catch{invalid();}
  if(!sha(evidenceSha256)||!Number.isSafeInteger(sequence)||sequence<1||sequence>12||!result||typeof result!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(result))||Reflect.ownKeys(result).length!==keys.length||keys.some(key=>!own(result,key)))invalid();
  if(result.intendedUse!=='sampled-live'||result.operationally_approved!==true||result.humanReviewRequired!==true||result.confidenceMeaning!=='uncalibrated'||result.evidenceSha256!==evidenceSha256||result.sessionId!==sessionId||result.frameId!==frameId||result.sequence!==sequence||!Object.keys(model).filter(key=>key!=='classOrder').every(key=>result[key]===model[key])||!pair(result.classOrder)||result.classOrder[0]!=='Normal'||result.classOrder[1]!=='Damaged')invalid();
  const p=result.probabilities;
  if(!pair(p)||!finite(p[0])||!finite(p[1])||p[0]<0||p[0]>1||p[1]<0||p[1]>1||Math.abs(p[0]+p[1]-1)>1e-6||!finite(result.confidence)||result.confidence<0||result.confidence>1||Math.abs(result.confidence-Math.max(p[0],p[1]))>1e-6)invalid();
  const label=p[0]===p[1]?null:p[0]>p[1]?'Normal':'Damaged';
  if(result.label!==label||result.status!==(label===null?'abstained':'predicted')||!finite(result.processingTimeMs)||result.processingTimeMs<0||result.processingTimeMs>25000||!finite(result.totalProcessingTimeMs)||result.totalProcessingTimeMs<result.processingTimeMs||result.totalProcessingTimeMs>30000||typeof result.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(result.requestId))invalid();
  return Object.fromEntries(keys.map(key=>[key,key==='classOrder'?['Normal','Damaged']:key==='probabilities'?[p[0],p[1]]:result[key]]));
}
