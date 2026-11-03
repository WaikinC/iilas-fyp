import type {EvidenceStage} from './parcelEvidence.js';

export interface ParcelLivePolicy {
  readonly version:'parcel-live-v1';
  readonly intendedUse:'sampled-live';
  readonly sha256:'50f4160d21f584110bbb7d68a6ff6552c2efe83bd14b119282d4b7a1e9217121';
  readonly limits:Readonly<{sessionMs:120000;maxFrames:12;minIntervalMs:5000;maxInFlight:1;maxQueued:0;maxBytes:1048576;maxLongEdge:960;maxBase64Chars:1398104;frameLeaseMs:60000;handlerDeadlineMs:50000;storageDeadlineMs:10000;httpDeadlineMs:30000;maxResponseBytes:16384;resultMaxAgeMs:15000;localFrameDeadlineMs:60000;submissionCooldownMs:5000}>;
  readonly profile:Readonly<{contentType:'image/jpeg';retention:'retained-evidence-no-auto-delete';visibility:'approved-fixed-scope';capture:'foreground-sampled-frames';audio:false;continuousVideo:false;automaticTraining:false}>;
}
export const PARCEL_LIVE_POLICY:Readonly<ParcelLivePolicy>;
export type ParcelLiveSessionState='Open'|'Stopped'|'Unavailable'|'Expired'|'Stale';
export type ParcelLiveFrameState='Reserved'|'Running'|'Predicted'|'Abstained'|'Unavailable'|'Failed'|'Stale'|'Expired'|'Cancelled';
export type ParcelLiveTerminalFrameState=Exclude<ParcelLiveFrameState,'Reserved'|'Running'>;
export type ParcelLiveReviewStatus='NotApplicable'|'Pending'|'Accepted'|'Rejected'|'Reviewed';
export type ParcelLiveReviewDecision='Accepted'|'Rejected'|'Reviewed';
export type ParcelLiveReasonCode='model-unavailable'|'service-unavailable'|'invalid-image'|'storage-failed'|'service-failed'|'invalid-response'|'resource-limit'|'time-limit'|'context-changed'|'access-changed'|'model-changed'|'session-expired'|'frame-expired'|'session-stopped'|'user-stop'|'session-busy';
export const PARCEL_LIVE_SESSION_STATES:readonly ParcelLiveSessionState[];
export const PARCEL_LIVE_FRAME_STATES:readonly ParcelLiveFrameState[];
export const PARCEL_LIVE_TERMINAL_FRAME_STATES:readonly ParcelLiveTerminalFrameState[];
export const PARCEL_LIVE_REVIEW_STATUSES:readonly ParcelLiveReviewStatus[];
export const PARCEL_LIVE_REASON_CODES:readonly ParcelLiveReasonCode[];
export function parcelLiveReasonMessage(code:unknown):string;

export interface ParcelLiveStartInput {shipmentId:string;stage:EvidenceStage;operationId:string;}
export interface ParcelLiveSessionInput {sessionId:string;}
export interface ParcelLiveFrameInput extends ParcelLiveSessionInput {frameId:string;}
export interface ParcelLiveReserveInput extends ParcelLiveFrameInput {sequence:number;bytes:number;sha256:string;width:number;height:number;capturedAtClient:string;}
/** Encoded data is transient and must never be persisted in logs/Firestore/UI storage. */
export interface ParcelLiveAnalyseInput extends ParcelLiveFrameInput {jpegBase64:string;}
export interface ParcelLiveReviewInput extends ParcelLiveFrameInput {version:number;decision:ParcelLiveReviewDecision;notes:string;}
export function validateStartParcelLiveSession(input:unknown):ParcelLiveStartInput;
export function validateReserveParcelLiveFrame(input:unknown,nowMs?:number):ParcelLiveReserveInput;
export function validateAnalyseParcelLiveFrame(input:unknown):ParcelLiveAnalyseInput;
export function validateResolveParcelLiveSession(input:unknown):ParcelLiveSessionInput;
export function validateResolveParcelLiveFrame(input:unknown):ParcelLiveFrameInput;
export function validateStopParcelLiveSession(input:unknown):ParcelLiveSessionInput;
export function validateReviewParcelLiveFrame(input:unknown):ParcelLiveReviewInput;
/** Sorted own map fields, dense arrays in order; rejects undefined, symbols,
 * nonfinite/-0 numbers, accessors, cycles and prototype-sensitive keys. */
export function canonicalParcelLiveValue(value:unknown):string;
/** SHA-256 of canonical UTF-8 JSON. Does not provide scientific acceptance. */
export function parcelLiveDigest(value:unknown):Promise<string>;
export function parcelLiveStartReceiptKey(ownerId:string,actorUid:string,operationId:string):Promise<string>;
export function parcelLiveActorLockKey(ownerId:string,actorUid:string):Promise<string>;
export function parcelLiveFrameKey(ownerId:string,sessionId:string,frameId:string):Promise<string>;
/** Immutable canonical ingestion digest compares even terminal replays. */
export function parcelLiveIngestDigest(input:ParcelLiveAnalyseInput):Promise<string>;

export interface ParcelLiveReadPolicy {account?:{status?:string;active?:boolean}|null;scopeId?:string;ownerId?:string;}
export interface ParcelLiveStartPolicy extends ParcelLiveReadPolicy {role?:string|null;shipmentStatus?:string;stage?:string|null;actorUid?:string;assignedDriverUid?:string|null;}
/** Shape/policy only; caller must derive authority from current protected records. */
export function canReadParcelLive(input?:ParcelLiveReadPolicy):boolean;
export function canStartParcelLive(input?:ParcelLiveStartPolicy):boolean;
export function parcelLiveSessionExpiresAt(nowMs:number):number;
export function parcelLiveFrameExpiresAt(nowMs:number,sessionExpiresAt:number):number;
export interface ParcelLiveActorLock {ownerId:string;actorUid:string;sessionId:string;startReceiptKey:string;nonce:string;generation:number;expiresAt:number;}
export interface ParcelLiveFrameClaim extends ParcelLiveActorLock {frameId:string;frameReceiptKey:string;sequence:number;frameNonce:string;frameExpiresAt:number;}
/** Compare every original coordinate before release, never just session ID. */
export function matchesParcelLiveActorLock(claim:unknown,lock:unknown):boolean;
export function matchesParcelLiveFrameClaim(claim:unknown,lock:unknown):boolean;

/** Shape validation cannot grant admission; real pin is server-owned null in
 * parcelLiveAcceptance.mjs. Photo descriptors cannot satisfy this shape. */
export type ParcelLiveModel=import('./parcelAnalysis.js').ParcelAnalysisModel & {intendedUse:'sampled-live';policyVersion:'parcel-live-v1';policySha256:ParcelLivePolicy['sha256'];};
export function toSafeParcelLiveModel(value:null):null;
export function toSafeParcelLiveModel(value:unknown):ParcelLiveModel|null;
export interface ParcelLiveBindings {ownerId:string;sessionId:string;actorUid:string;shipmentId:string;stage:EvidenceStage;policy:ParcelLivePolicy;model:ParcelLiveModel|null;}
/** Public fields only. All times are safe integer Unix milliseconds. No private
 * snapshots/nonce/path/service settings/errors, encoded bytes or current=true. */
export interface ParcelLiveSessionPublic extends ParcelLiveBindings {operationId:string;state:ParcelLiveSessionState;createdAt:number;updatedAt:number;expiresAt:number;stoppedAt:number|null;version:number;generation:number;reservedCount:number;completedCount:number;inFlightFrameId:string|null;lastReservedAt:number|null;reasonCode:ParcelLiveReasonCode|null;}
export interface ParcelLiveImageIdentity {generation:string;metageneration:string;sha256:string;bytes:number;width:number;height:number;contentType:'image/jpeg';}
/** Unverified means no trusted object identity was obtained. Unknown explicitly
 * preserves ambiguous/stop-raced write uncertainty; neither means absent bytes.
 * Verified binds exact canonical decimal generation/metageneration and bytes. */
export type ParcelLiveRetention='Unverified'|'Unknown'|'Verified';
export interface ParcelLiveFramePublic extends ParcelLiveBindings {model:ParcelLiveModel;frameId:string;sequence:number;sha256:string;bytes:number;width:number;height:number;contentType:'image/jpeg';capturedAtClient:string;reservedAt:number;expiresAt:number;updatedAt:number;completedAt:number|null;state:ParcelLiveFrameState;version:number;sessionGeneration:number;label:'Normal'|'Damaged'|null;probabilities:[number,number]|null;confidence:number|null;confidenceMeaning:'uncalibrated'|null;serviceRequestId:string|null;processingTimeMs:number|null;totalProcessingTimeMs:number|null;reasonCode:ParcelLiveReasonCode|null;retention:ParcelLiveRetention;image:ParcelLiveImageIdentity|null;humanReviewRequired:boolean;reviewStatus:ParcelLiveReviewStatus;reviewNotes:string|null;reviewedBy:string|null;reviewedAt:number|null;}
/** Validates state/time/identity/review invariants, strips unknown top-level and
 * nested model/image fields and copies nested structures independently. */
export function toPublicParcelLiveSession(record:unknown):ParcelLiveSessionPublic;
export function toPublicParcelLiveFrame(record:unknown):ParcelLiveFramePublic;
/** These do not check protected authority, acceptance or private receipts. */
export function canReserveParcelLiveFrame(record:unknown,nowMs:number):boolean;
export function isParcelLiveSessionExpired(record:unknown,nowMs:number):boolean;
export function isParcelLiveFrameExpired(record:unknown,nowMs:number):boolean;
export function canCompleteParcelLiveFrame(session:unknown,frame:unknown,nowMs:number):boolean;
/** Caller must preauthorise and reverify retained object generation/hash/bytes
 * outside the transaction, then recheck authority/result versions in final tx. */
export function reviewParcelLiveFrameRecord(record:ParcelLiveFramePublic,input:ParcelLiveReviewInput,reviewer:{role:string;reviewerUid:string;nowMs:number}):ParcelLiveFramePublic;
