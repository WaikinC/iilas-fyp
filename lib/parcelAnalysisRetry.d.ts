import type {EvidenceStage} from './parcelEvidence.js';
import type {ParcelAnalysisStartInput,ParcelAnalysisResolveInput,ParcelAnalysisPublic} from './parcelAnalysis.js';
export interface ParcelAnalysisIntent {scopeId:string;actorUid:string;evidenceId:string;operationId:string;}
/** Stage fences the active UI but is never persisted. */
export interface ParcelAnalysisRetryContext {scopeId:string;actorUid:string;evidenceId:string;stage:EvidenceStage;}
export interface ParcelAnalysisBusy {state:'Busy';analysisId:string;reasonCode:'evidence-busy';}
export type ParcelAnalysisRetryResult=ParcelAnalysisPublic|ParcelAnalysisBusy;
export interface ParcelAnalysisCommand {
  (name:'startParcelAnalysis',input:ParcelAnalysisStartInput):Promise<ParcelAnalysisRetryResult>;
  (name:'resolveParcelAnalysis',input:ParcelAnalysisResolveInput):Promise<ParcelAnalysisPublic>;
}
export interface ParcelAnalysisSessionStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;}
export interface ParcelAnalysisRetry {
  pending():ParcelAnalysisIntent|null;
  /** Explicitly submit or discover an unresolved operation using the SAME UUID.
   * If an analysis ID is already known, resolves it instead. Never auto-retries. */
  submit():Promise<ParcelAnalysisRetryResult>;
  /** Known ID -> resolve. Lost first response/reload -> replay same start UUID
   * to discover the authoritative public ID; backend must replay before new-work
   * stage/role checks. No saved intent -> rejects without a command. */
  check():Promise<ParcelAnalysisRetryResult>;
  /** Call on actor/scope/evidence/stage changes, including permission remounts.
   * Late responses reject even if context subsequently changes back. */
  setContext(context:ParcelAnalysisRetryContext):void;
  /** Only acknowledges a known terminal UI result; never clears unresolved IDs. */
  dismissTerminal():void;
}
/** Supply SAME TAB sessionStorage (never localStorage). The four identity IDs
 * are saved before sending; no payload/image/token/config/result is stored.
 * Controllers sharing that storage object serialize per identity. An ambiguous
 * first response preserves its UUID. Terminal responses clear only that intent.
 * REQUIRED backend contract: Busy atomically records an immutable private
 * Blocked receipt for scope/actor/op+command hash -> blocker public ID. Replaying
 * that same start must return the same Busy even after blocker completion,
 * never execute inference. After reload, one explicit check rediscovers Busy;
 * the next resolves its blocker. No extra persisted analysis fields are needed.
 * This client cannot provide server idempotency, approval or nonce guarantees. */
export function createParcelAnalysisRetry(options:{storage:ParcelAnalysisSessionStorage;context:ParcelAnalysisRetryContext;command:ParcelAnalysisCommand;createOperationId?:()=>string}):ParcelAnalysisRetry;
