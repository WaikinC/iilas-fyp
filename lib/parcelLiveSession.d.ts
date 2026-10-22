export const PARCEL_LIVE_LIMITS: Readonly<{
  lifetimeMs:120000;maxAttempts:12;cadenceMs:5000;maxLongEdge:960;
  maxBytes:1048576;frameDeadlineMs:60000;resultMaxAgeMs:15000;
}>;
export type ParcelLiveState='Idle'|'Starting'|'Running'|'Stopped'|'Unavailable';
export type ParcelLiveReason='user-stop'|'disposed'|'hidden'|'pagehide'|'track-ended'|'context-changed'|
  'lifetime-limit'|'frame-limit'|'open-failed'|'unavailable'|'capture-failed'|'submit-failed'|
  'invalid-open'|'invalid-capture'|'invalid-result'|'frame-timeout'|'invalid-reason'|'stale-result'|'expired';
export type ParcelLiveResultState='Predicted'|'Abstained'|'Unavailable'|'Failed'|'Stale'|'Expired';
export type ParcelLiveResult={sessionId:string;frameId:string;sequence:number}&(
  {state:'Predicted';label:'Normal'|'Damaged'}|
  {state:Exclude<ParcelLiveResultState,'Predicted'>;label:null}
);
export interface ParcelLiveSnapshot {
  readonly state:ParcelLiveState;
  readonly sessionId:string|null;
  readonly attempted:number;
  readonly completed:number;
  /** Cadence slots skipped while busy; these are not observations. */
  readonly dropped:number;
  readonly lastResult:Readonly<ParcelLiveResult>|null;
  readonly reason:ParcelLiveReason|null;
  readonly current:boolean;
  readonly resultAgeMs:number|null;
}
export type ParcelLiveEvent =
  ({readonly type:'state'}&ParcelLiveSnapshot)|
  {readonly type:'result';readonly result:Readonly<ParcelLiveResult>;readonly current:boolean;readonly resultAgeMs:number}|
  {readonly type:'closed';readonly sessionId:string;readonly reason:ParcelLiveReason;readonly acknowledged:boolean};
export interface ParcelLiveFrameIdentity {sessionId:string;frameId:string;sequence:number;signal:AbortSignal;}
export interface ParcelLiveCapture {payload:unknown;bytes:number;capturedAtClient:string;}
export interface ParcelLiveOptions {
  /** Resolve ambiguous first responses with this SAME operationId; never replace it automatically. */
  open(input:{operationId:string;signal:AbortSignal}):Promise<{sessionId:string;state:'Open'|'Unavailable'}>;
  /** Enforce JPEG and maximum 960px long edge; controller validates bytes/timestamp. No payload is retained in snapshots/events. */
  capture(input:ParcelLiveFrameIdentity):Promise<ParcelLiveCapture>;
  submit(input:ParcelLiveFrameIdentity&ParcelLiveCapture):Promise<ParcelLiveResult>;
  /** Resolve void only after durable acknowledgement/reconciliation. Rejection or a non-void result permanently blocks this controller. */
  close(input:{sessionId:string;reason:ParcelLiveReason}):Promise<void>;
  onEvent(event:ParcelLiveEvent):void;
  now?():number;
  setTimer?(callback:()=>void,ms:number):unknown;
  clearTimer?(handle:unknown):void;
  /** Must yield lowercase UUIDv4 operation/frame IDs. Server session IDs must also be lowercase UUIDv4. */
  createId?():string;
}
export interface ParcelLiveSession {
  /** Resolves after opening/starting sampling, not after the session ends. Rejects busy/disposed/reconciliation-required starts. */
  start():Promise<void>;
  stop(reason?:ParcelLiveReason):void;
  snapshot():ParcelLiveSnapshot;
  dispose():void;
}
export function createParcelLiveSession(options:ParcelLiveOptions):ParcelLiveSession;
