import type {EvidenceStage,EvidenceCaptureSource} from './parcelEvidence.js';

export type ParcelAnalysisState='Running'|'Predicted'|'Abstained'|'Unavailable'|'Failed'|'Stale'|'Expired';
export type ParcelAnalysisTerminalState=Exclude<ParcelAnalysisState,'Running'>;
export type ParcelAnalysisReviewStatus='Pending'|'Accepted'|'Rejected'|'Reviewed'|'NotRequired';
export type ParcelAnalysisReasonCode='model-unavailable'|'service-unavailable'|'service-failed'|'invalid-response'|'invalid-evidence'|'resource-limit'|'time-limit'|'context-changed'|'access-changed'|'model-changed'|'lease-expired'|'evidence-busy';
export type ParcelAnalysisReviewDecision='Accepted'|'Rejected'|'Reviewed';
export const PARCEL_ANALYSIS_STATES:readonly ParcelAnalysisState[];
export const PARCEL_ANALYSIS_TERMINAL_STATES:readonly ParcelAnalysisTerminalState[];
export const PARCEL_ANALYSIS_REVIEW_STATUSES:readonly ParcelAnalysisReviewStatus[];
export const PARCEL_ANALYSIS_REASON_CODES:readonly ParcelAnalysisReasonCode[];
export const PARCEL_ANALYSIS_LEASE_MS:90000;
export function parcelAnalysisReasonMessage(code:unknown):string;

/** Shape validation never supplies scientific model acceptance. The trusted
 * backend must select its operational pin or trusted local evaluation capability
 * and validate the corresponding response branch. */
export interface ParcelAnalysisModelBase {
  model:'MobileNetV2';
  modelVersion:string;
  selectionSha256:string;
  evaluationSha256:string;
  preprocessing:string;
  contrast:'none'|'clahe';
  classOrder:['Normal','Damaged'];
}
export type ParcelAnalysisModel=ParcelAnalysisModelBase & (
  {acceptanceSha256:string;evaluationKind?:never;evaluationManifestSha256?:never} |
  {acceptanceSha256:null;evaluationKind:'local-experimental';evaluationManifestSha256:string}
);
export interface ParcelAnalysisBindings {
  ownerId:string;
  analysisId:string;
  actorUid:string;
  operationId:string;
  shipmentId:string;
  evidenceId:string;
  evidenceVersion:number;
  evidenceSha256:string;
  stage:EvidenceStage;
  shipmentVersion:number;
  captureSource:EvidenceCaptureSource;
  capturedAtClient:string|null;
  model:ParcelAnalysisModel|null;
}
/** Public allowlisted shape. All timestamps are safe integer Unix milliseconds;
 * convert Firestore timestamps at the backend boundary. No private receipt,
 * lock/nonce, Storage path, raw service response or service configuration. */
export interface ParcelAnalysisPublic extends ParcelAnalysisBindings {
  state:ParcelAnalysisState;
  version:number;
  createdAt:number;
  updatedAt:number;
  expiresAt:number;
  completedAt:number|null;
  label:'Normal'|'Damaged'|null;
  probabilities:[number,number]|null;
  confidence:number|null;
  confidenceMeaning:'uncalibrated'|null;
  serviceRequestId:string|null;
  processingTimeMs:number|null;
  totalProcessingTimeMs:number|null;
  predictionId:string|null;
  reasonCode:Exclude<ParcelAnalysisReasonCode,'evidence-busy'>|null;
  reviewStatus:ParcelAnalysisReviewStatus;
  reviewNotes:string|null;
  reviewedBy:string|null;
  reviewedAt:number|null;
  humanReviewRequired:boolean;
}
export interface ParcelAnalysisStartInput {evidenceId:string;operationId:string;}
export interface ParcelAnalysisResolveInput {analysisId:string;}
export interface ParcelAnalysisCleanupInput extends ParcelAnalysisResolveInput {pendingOperationId?:string;}
export interface ParcelAnalysisReviewInput {analysisId:string;version:number;decision:ParcelAnalysisReviewDecision;notes:string;}
export function validateStartParcelAnalysis(input:unknown):ParcelAnalysisStartInput;
export function validateResolveParcelAnalysis(input:unknown):ParcelAnalysisResolveInput;
export function validateCleanupParcelAnalysis(input:unknown):ParcelAnalysisCleanupInput;
export function validateParcelAnalysisReview(input:unknown):ParcelAnalysisReviewInput;
export interface ParcelAnalysisReadPolicy {
  account?:{status?:string;active?:boolean}|null;
  /** Server-derived protected system/config dataScopeId. */
  scopeId?:string;
  ownerId?:string;
}
export interface ParcelAnalysisStartPolicy extends ParcelAnalysisReadPolicy {
  role?:string|null;
  shipmentStatus?:string;
  stage?:string|null;
  actorUid?:string;
  assignedDriverUid?:string|null;
  type?:string;
  integrityVersion?:number;
}
/** These policy helpers are not transaction/authentication or scope lookup. */
export function canReadParcelAnalysis(input?:ParcelAnalysisReadPolicy):boolean;
export function canStartParcelAnalysis(input?:ParcelAnalysisStartPolicy):boolean;
export function parcelAnalysisLeaseExpiresAt(nowMs:number):number;
export function canCompleteParcelAnalysis(record:unknown,nowMs:number):boolean;
export function isParcelAnalysisExpired(record:unknown,nowMs:number):boolean;
export interface ParcelAnalysisClaimCoordinates {ownerId:string;evidenceId:string;analysisId:string;receiptKey:string;nonce:string;expiresAt:number;}
/** Match every original coordinate before releasing a private lock. */
export function matchesParcelAnalysisClaim(claim:unknown,lock:unknown):boolean;
export function createRunningParcelAnalysis(serverBindings:ParcelAnalysisBindings,nowMs:number):ParcelAnalysisPublic;
/** Strips unknown top-level/nested fields, rejects invalid state/result shapes,
 * and returns independent copies. Never pass a raw service result directly. */
export function toPublicParcelAnalysis(record:unknown):ParcelAnalysisPublic;
export type ParcelAnalysisOutcome={state:'Predicted'|'Abstained';label:'Normal'|'Damaged'|null;probabilities:[number,number];confidence:number;model:ParcelAnalysisModel;serviceRequestId:string;processingTimeMs:number;totalProcessingTimeMs:number}
  |{state:'Unavailable'|'Failed'|'Stale'|'Expired';reasonCode:Exclude<ParcelAnalysisReasonCode,'evidence-busy'>};
/** Running -> one terminal only. Predicted projection ID is parcel-{analysisId}.
 * Backend must atomically create reciprocal projection/audit, enforce exact
 * receipt/lock/nonce and current access/snapshots/model identity before saving. */
export function finishParcelAnalysis(record:ParcelAnalysisPublic,outcome:ParcelAnalysisOutcome,nowMs:number):ParcelAnalysisPublic;
/** Separate review-only change. Backend must check current approval/fixed scope,
 * reciprocal Pending prediction and bindings and atomically update both records. */
export function reviewParcelAnalysis(record:ParcelAnalysisPublic,input:ParcelAnalysisReviewInput,reviewer:{reviewerUid:string;role:string;nowMs:number}):ParcelAnalysisPublic;
