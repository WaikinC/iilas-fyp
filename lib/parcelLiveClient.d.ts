import type {EvidenceStage} from './parcelEvidence.js';
import type {ParcelLiveStartInput,ParcelLiveSessionInput,ParcelLiveReserveInput,ParcelLiveAnalyseInput,ParcelLiveFrameInput,ParcelLiveReviewInput,ParcelLiveSessionPublic,ParcelLiveFramePublic} from './parcelLive.js';
import type {ParcelLiveFrameIdentity,ParcelLiveResult,ParcelLiveReason} from './parcelLiveSession.js';
export interface ParcelLiveClientContext {scopeId:string;actorUid:string;shipmentId:string;stage:EvidenceStage;}
/** The complete persisted allowlist. Stage is the ORIGINAL requested stage. */
export interface ParcelLiveIntent extends ParcelLiveClientContext {operationId:string;sessionId:string|null;blockedSessionId:string|null;frameId:string|null;}
export interface ParcelLiveBusy {state:'Busy';sessionId:string;reasonCode:'session-busy';}
export interface ParcelLiveCommand {
  (name:'startParcelLiveSession',input:ParcelLiveStartInput):Promise<ParcelLiveSessionPublic|ParcelLiveBusy>;
  (name:'reserveParcelLiveFrame',input:ParcelLiveReserveInput):Promise<ParcelLiveFramePublic>;
  (name:'analyseParcelLiveFrame',input:ParcelLiveAnalyseInput):Promise<ParcelLiveFramePublic>;
  (name:'resolveParcelLiveSession'|'stopParcelLiveSession',input:ParcelLiveSessionInput):Promise<ParcelLiveSessionPublic>;
  (name:'resolveParcelLiveFrame',input:ParcelLiveFrameInput):Promise<ParcelLiveFramePublic>;
  (name:'reviewParcelLiveFrame',input:ParcelLiveReviewInput):Promise<ParcelLiveFramePublic>;
}
export interface ParcelLiveClientStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;}
export interface ParcelLiveClientCapture {payload:{blob:Blob;width:number;height:number};bytes:number;capturedAtClient:string;}
export interface ParcelLiveClientSnapshot {readonly pending:ParcelLiveIntent|null;readonly busy:boolean;readonly session:ParcelLiveSessionPublic|null;readonly frame:ParcelLiveFramePublic|null;readonly blocked:ParcelLiveBusy|null;}
export interface ParcelLiveRecovery {session:ParcelLiveSessionPublic|ParcelLiveBusy;frame:ParcelLiveFramePublic|null;}
export interface ParcelLiveClient {
  pending():ParcelLiveIntent|null;
  snapshot():ParcelLiveClientSnapshot;
  open(input:{operationId:string;signal:AbortSignal}):Promise<{sessionId:string;state:'Open'|'Unavailable'}>;
  /** Holds actual work, including an abort-ignoring encoder, across remounts. */
  capture(input:ParcelLiveFrameIdentity,work:()=>Promise<ParcelLiveClientCapture>):Promise<ParcelLiveClientCapture>;
  submit(input:ParcelLiveFrameIdentity&ParcelLiveClientCapture):Promise<ParcelLiveResult>;
  /** Resolves void only after authoritative terminal acknowledgement. */
  close(input:{sessionId:string;reason:ParcelLiveReason}):Promise<void>;
  /** Explicit only: unknown session replays original start; known IDs resolve. */
  recover():Promise<ParcelLiveRecovery>;
  stopSaved():Promise<ParcelLiveRecovery>;
  review(frame:ParcelLiveFramePublic,input:Omit<ParcelLiveReviewInput,'sessionId'|'frameId'|'version'>):Promise<ParcelLiveFramePublic>;
  /** Invalidates late work even when context subsequently changes back. */
  setContext(context:ParcelLiveClientContext):void;
  dispose():void;
}
/** Same-tab sessionStorage only. Shared WeakMap guards scope+actor across
 * shipments/controllers/remounts until actual work and cleanup settle. Epoch
 * fences are shipment/stage-local: unrelated idle panels coexist, whereas a
 * new same-context owner invalidates its predecessor. No
 * timers/retry/race, bytes/results/tokens/config persisted. UI must fence
 * current authority versions and enforce current acquisition/review policy.
 * Busy's blocker may bind a DIFFERENT shipment; it is never adopted as own.
 * Server receipts/locks remain authoritative when storage is lost or cleared. */
export function createParcelLiveClient(options:{storage:ParcelLiveClientStorage;context:ParcelLiveClientContext;command:ParcelLiveCommand;onChange?:()=>void}):ParcelLiveClient;
