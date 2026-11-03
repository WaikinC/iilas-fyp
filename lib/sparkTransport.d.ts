import type {SparkRuntime} from './sparkRuntime.js';
export type EvidenceMetadata={path:string;size:number;contentType:string;generation:string;metadata:Record<string,string>};
export type SparkTransport={command:(action:string,input:unknown)=>Promise<unknown>;upload:(kind:'web'|'mobile',intentId:string,blob:Blob)=>Promise<EvidenceMetadata>;download:(evidenceId:string)=>Promise<Blob>;customerProof:(shipmentId:string,signal?:AbortSignal)=>Promise<Blob>};
export function createSparkTransport(input:{profile:SparkRuntime;auth:{currentUser:{uid:string;getIdToken:(force?:boolean)=>Promise<string>}|null}|null;fetch?:typeof fetch}):SparkTransport;
