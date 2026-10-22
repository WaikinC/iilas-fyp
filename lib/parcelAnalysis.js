import {canUploadEvidence,validateEvidenceCapture} from './parcelEvidence.js';

// Pure schema/policy helpers. Callers must supply protected scope, authenticated
// identity and server time, and enforce transactions/reciprocal projections.
export const PARCEL_ANALYSIS_STATES=Object.freeze(['Running','Predicted','Abstained','Unavailable','Failed','Stale','Expired']);
export const PARCEL_ANALYSIS_TERMINAL_STATES=Object.freeze(PARCEL_ANALYSIS_STATES.slice(1));
export const PARCEL_ANALYSIS_REVIEW_STATUSES=Object.freeze(['Pending','Accepted','Rejected','Reviewed','NotRequired']);
export const PARCEL_ANALYSIS_LEASE_MS=90000;
const reasons=Object.freeze({
  'model-unavailable':['Unavailable','No evaluated parcel model is available.'],
  'service-unavailable':['Unavailable','Parcel analysis is temporarily unavailable.'],
  'service-failed':['Failed','The parcel analysis could not be completed.'],
  'invalid-response':['Failed','The parcel analysis returned an invalid result.'],
  'invalid-evidence':['Failed','The registered parcel image could not be verified.'],
  'resource-limit':['Failed','The parcel analysis exceeded its resource limit.'],
  'time-limit':['Failed','The parcel analysis exceeded its time limit.'],
  'context-changed':['Stale','The parcel or shipment context changed during analysis.'],
  'access-changed':['Stale','Access changed during parcel analysis.'],
  'model-changed':['Stale','The accepted parcel model changed during analysis.'],
  'lease-expired':['Expired','No authoritative result was saved before this request expired.'],
  'evidence-busy':['Busy','Another parcel analysis is already running for this image.'],
});
export const PARCEL_ANALYSIS_REASON_CODES=Object.freeze(Object.keys(reasons));
export function parcelAnalysisReasonMessage(code) {return Object.hasOwn(reasons,code)?reasons[code][1]:'The parcel analysis outcome is unavailable.';}
const fail=(message='Invalid parcel analysis data.',code='invalid-argument')=>{const error=new Error(message);error.code=code;throw error;};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const serviceUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=(value,min=0)=>Number.isSafeInteger(value)&&value>=min;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const densePair=value=>Array.isArray(value)&&value.length===2&&Object.hasOwn(value,0)&&Object.hasOwn(value,1);
const exact=(input,keys)=>{if(!plain(input)||Reflect.ownKeys(input).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(input,key)))fail('Parcel analysis request contains missing or unsupported fields.');};
function timestamp(value) {if(!integer(value))fail('Invalid parcel analysis timestamp.');return value;}
function reviewNotes(value) {if(typeof value!=='string'||value.trim().length<3||value.length>240||/[\u0000-\u001f\u007f]/.test(value))fail('Enter review notes from 3 to 240 characters.');return value.trim();}

export function validateStartParcelAnalysis(input) {
  exact(input,['evidenceId','operationId']);
  if(!id(input.evidenceId)||!uuid(input.operationId))fail('Choose registered evidence and a valid parcel operation UUID.');
  return {evidenceId:input.evidenceId,operationId:input.operationId};
}
export function validateResolveParcelAnalysis(input) {
  exact(input,['analysisId']);if(!id(input.analysisId))fail('Choose a saved parcel analysis.');return {analysisId:input.analysisId};
}
export function validateParcelAnalysisReview(input) {
  exact(input,['analysisId','version','decision','notes']);
  if(!id(input.analysisId)||!integer(input.version,1)||!['Accepted','Rejected','Reviewed'].includes(input.decision))fail('Choose a valid versioned parcel review.');
  return {analysisId:input.analysisId,version:input.version,decision:input.decision,notes:reviewNotes(input.notes)};
}
export function canReadParcelAnalysis({account,scopeId,ownerId}={}) {
  return !!(account?.status==='Approved'&&account.active===true&&id(scopeId)&&scopeId===ownerId);
}
export function canStartParcelAnalysis(input={}) {
  return canReadParcelAnalysis(input)&&id(input.actorUid)&&input.type==='Parcel Image'&&input.integrityVersion===2&&canUploadEvidence(input);
}
export function parcelAnalysisLeaseExpiresAt(nowMs) {
  timestamp(nowMs);if(!integer(nowMs+PARCEL_ANALYSIS_LEASE_MS))fail('Invalid parcel analysis lease.');return nowMs+PARCEL_ANALYSIS_LEASE_MS;
}
export function canCompleteParcelAnalysis(record,nowMs) {
  return validRunningLease(record)&&integer(nowMs)&&nowMs>=record.createdAt&&nowMs<record.expiresAt;
}
export function isParcelAnalysisExpired(record,nowMs) {
  return validRunningLease(record)&&integer(nowMs)&&nowMs>=record.expiresAt;
}
function validRunningLease(record) {return record?.state==='Running'&&integer(record.createdAt)&&integer(record.expiresAt)&&record.expiresAt===record.createdAt+PARCEL_ANALYSIS_LEASE_MS;}
export function matchesParcelAnalysisClaim(claim,lock) {
  const keys=['ownerId','evidenceId','analysisId','receiptKey','nonce','expiresAt'];
  return !!(plain(claim)&&plain(lock)&&keys.every(key=>key==='expiresAt'?integer(claim[key],1)&&claim[key]===lock[key]:id(claim[key])&&claim[key]===lock[key]));
}
function safeModel(value) {
  if(value===null)return null;
  if(!plain(value)||value.model!=='MobileNetV2'||!['modelVersion','selectionSha256','evaluationSha256','acceptanceSha256'].every(key=>digest(value[key]))
    ||typeof value.preprocessing!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9_. -]{0,255}$/).test(value.preprocessing)
    ||!['none','clahe'].includes(value.contrast)||!densePair(value.classOrder)||value.classOrder[0]!=='Normal'||value.classOrder[1]!=='Damaged')fail('Invalid accepted parcel model lineage.');
  return {model:value.model,modelVersion:value.modelVersion,selectionSha256:value.selectionSha256,evaluationSha256:value.evaluationSha256,acceptanceSha256:value.acceptanceSha256,preprocessing:value.preprocessing,contrast:value.contrast,classOrder:['Normal','Damaged']};
}
const sameModel=(left,right)=>JSON.stringify(safeModel(left))===JSON.stringify(safeModel(right));
function bindings(record) {
  if(!plain(record)||!['ownerId','analysisId','actorUid','shipmentId','evidenceId'].every(key=>id(record[key]))||!uuid(record.operationId)||!integer(record.evidenceVersion,1)||!integer(record.shipmentVersion,1)||!digest(record.evidenceSha256))fail('Invalid parcel analysis evidence binding.');
  const capture=validateEvidenceCapture({stage:record.stage,type:'Parcel Image',captureSource:record.captureSource,capturedAtClient:record.capturedAtClient});
  return {ownerId:record.ownerId,analysisId:record.analysisId,actorUid:record.actorUid,operationId:record.operationId,shipmentId:record.shipmentId,evidenceId:record.evidenceId,evidenceVersion:record.evidenceVersion,evidenceSha256:record.evidenceSha256,stage:capture.stage,shipmentVersion:record.shipmentVersion,captureSource:capture.captureSource,capturedAtClient:capture.capturedAtClient,model:safeModel(record.model)};
}
function inferenceFields(record) {
  const inference=['Predicted','Abstained'].includes(record.state);
  if(inference){
    const p=record.probabilities;
    if(!record.model||!densePair(p)||!finite(p[0])||!finite(p[1])||p[0]<0||p[0]>1||p[1]<0||p[1]>1||Math.abs(p[0]+p[1]-1)>1e-6
      ||!finite(record.confidence)||record.confidence<0||record.confidence>1||Math.abs(record.confidence-Math.max(...p))>1e-6||record.confidenceMeaning!=='uncalibrated'
      ||!serviceUuid(record.serviceRequestId)||!finite(record.processingTimeMs)||record.processingTimeMs<0||record.processingTimeMs>25000
      ||!finite(record.totalProcessingTimeMs)||record.totalProcessingTimeMs<record.processingTimeMs||record.totalProcessingTimeMs>30000||record.reasonCode!==null)fail('Invalid parcel inference outcome.');
    if(record.state==='Predicted'){
      const label=p[0]===p[1]?null:p[0]>p[1]?'Normal':'Damaged';
      if(!label||record.label!==label||record.predictionId!==`parcel-${record.analysisId}`)fail('Invalid parcel prediction label or projection.');
    }else if(record.label!==null||p[0]!==p[1]||record.predictionId!==null)fail('Abstained analysis cannot carry a label or projection.');
  }else{
    if(['label','probabilities','confidence','confidenceMeaning','serviceRequestId','processingTimeMs','totalProcessingTimeMs','predictionId'].some(key=>record[key]!==null))fail('A missing inference cannot carry a model result.');
    if(record.state==='Running'?record.reasonCode!==null:!Object.hasOwn(reasons,record.reasonCode)||reasons[record.reasonCode][0]!==record.state)fail('Invalid safe parcel outcome reason.');
  }
  return {label:record.label,probabilities:inference?[...record.probabilities]:null,confidence:record.confidence,confidenceMeaning:record.confidenceMeaning,serviceRequestId:record.serviceRequestId,processingTimeMs:record.processingTimeMs,totalProcessingTimeMs:record.totalProcessingTimeMs,predictionId:record.predictionId,reasonCode:record.reasonCode};
}
export function toPublicParcelAnalysis(record) {
  const safe=bindings(record);
  if(!PARCEL_ANALYSIS_STATES.includes(record.state)||!integer(record.version,1)||!integer(record.createdAt)||!integer(record.updatedAt)||record.updatedAt<record.createdAt||record.expiresAt!==parcelAnalysisLeaseExpiresAt(record.createdAt))fail('Invalid parcel analysis state or lease.');
  if(record.state==='Running'){
    if(record.completedAt!==null||record.version!==1||record.updatedAt!==record.createdAt)fail('Invalid running parcel analysis.');
  }else if(!integer(record.completedAt)||record.completedAt<record.createdAt||record.updatedAt<record.completedAt||record.version<2||(record.state==='Expired'?record.completedAt<record.expiresAt:record.completedAt>=record.expiresAt))fail('Invalid terminal parcel analysis.');
  const needsReview=['Predicted','Abstained'].includes(record.state);
  const allowed=record.state==='Predicted'?['Pending','Accepted','Rejected']:record.state==='Abstained'?['Pending','Reviewed']:['NotRequired'];
  if(!allowed.includes(record.reviewStatus)||record.humanReviewRequired!==(needsReview&&record.reviewStatus==='Pending'))fail('Invalid parcel analysis review state.');
  const reviewed=needsReview&&record.reviewStatus!=='Pending';
  if(reviewed){if(!id(record.reviewedBy)||!integer(record.reviewedAt)||record.reviewedAt<record.completedAt||record.reviewedAt!==record.updatedAt||record.version!==3)fail('Invalid parcel analysis reviewer.');reviewNotes(record.reviewNotes);}
  else if(record.reviewedBy!==null||record.reviewedAt!==null||record.reviewNotes!==null||record.version!==(record.state==='Running'?1:2))fail('Invalid unreviewed parcel analysis.');
  return {...safe,state:record.state,version:record.version,createdAt:record.createdAt,updatedAt:record.updatedAt,expiresAt:record.expiresAt,completedAt:record.completedAt,...inferenceFields(record),reviewStatus:record.reviewStatus,reviewNotes:record.reviewNotes,reviewedBy:record.reviewedBy,reviewedAt:record.reviewedAt,humanReviewRequired:record.humanReviewRequired};
}
export function createRunningParcelAnalysis(serverBindings,nowMs) {
  const safe=bindings(serverBindings);
  return toPublicParcelAnalysis({...safe,state:'Running',version:1,createdAt:timestamp(nowMs),updatedAt:nowMs,expiresAt:parcelAnalysisLeaseExpiresAt(nowMs),completedAt:null,label:null,probabilities:null,confidence:null,confidenceMeaning:null,serviceRequestId:null,processingTimeMs:null,totalProcessingTimeMs:null,predictionId:null,reasonCode:null,reviewStatus:'NotRequired',reviewNotes:null,reviewedBy:null,reviewedAt:null,humanReviewRequired:false});
}
export function finishParcelAnalysis(record,outcome,nowMs) {
  const current=toPublicParcelAnalysis(record);
  if(!plain(outcome)||Reflect.ownKeys(outcome).some(key=>!['state','label','probabilities','confidence','reasonCode','model','serviceRequestId','processingTimeMs','totalProcessingTimeMs'].includes(key))||!PARCEL_ANALYSIS_TERMINAL_STATES.includes(outcome.state))fail('Invalid terminal parcel outcome.');
  if(outcome.state==='Expired'?!isParcelAnalysisExpired(current,nowMs):!canCompleteParcelAnalysis(current,nowMs))fail('Parcel analysis is terminal or its lease does not permit completion.','failed-precondition');
  const inference=['Predicted','Abstained'].includes(outcome.state);
  if(inference&&!sameModel(current.model,outcome.model))fail('Parcel model changed during analysis.','failed-precondition');
  if(!inference&&(['label','probabilities','confidence','model','serviceRequestId','processingTimeMs','totalProcessingTimeMs'].some(key=>outcome[key]!==undefined&&outcome[key]!==null)))fail('A failed inference cannot carry model output.');
  return toPublicParcelAnalysis({...current,state:outcome.state,version:2,updatedAt:timestamp(nowMs),completedAt:nowMs,label:inference?outcome.label:null,probabilities:inference?outcome.probabilities:null,confidence:inference?outcome.confidence:null,confidenceMeaning:inference?'uncalibrated':null,serviceRequestId:inference?outcome.serviceRequestId:null,processingTimeMs:inference?outcome.processingTimeMs:null,totalProcessingTimeMs:inference?outcome.totalProcessingTimeMs:null,predictionId:outcome.state==='Predicted'?`parcel-${current.analysisId}`:null,reasonCode:inference?null:outcome.reasonCode,reviewStatus:inference?'Pending':'NotRequired',humanReviewRequired:inference});
}
export function reviewParcelAnalysis(record,input,{reviewerUid,role,nowMs}={}) {
  const current=toPublicParcelAnalysis(record),review=validateParcelAnalysisReview(input);
  if(!['Admin','Manager'].includes(role)||!id(reviewerUid))fail('An administrator or manager must review this result.','permission-denied');
  if(current.analysisId!==review.analysisId||current.version!==review.version||current.reviewStatus!=='Pending'||!(current.state==='Predicted'?['Accepted','Rejected'].includes(review.decision):current.state==='Abstained'&&review.decision==='Reviewed'))fail('The parcel review is stale or does not match this outcome.','failed-precondition');
  return toPublicParcelAnalysis({...current,version:current.version+1,updatedAt:timestamp(nowMs),reviewStatus:review.decision,reviewNotes:review.notes,reviewedBy:reviewerUid,reviewedAt:nowMs,humanReviewRequired:false});
}
