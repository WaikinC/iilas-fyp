export const HYBRID_PROTOCOL:'iilas-msi-gateway-1.0';
export const HYBRID_OPERATIONS:readonly string[];
export const HYBRID_LIMITS:Readonly<{port:number;bodyBytes:number;responseBytes:number;lifetimeMs:number;clockSkewMs:number;cacheEntries:number;cacheMs:number;cacheBytes:number;connections:number}>;
export type HybridEnvelope={protocol:typeof HYBRID_PROTOCOL;projectId:string;requestId:string;operation:string;actor:string;scope:string;issuedAtMs:number;expiresAtMs:number;operationExpiresAtMs:number;bindingSha256:string;payloadJson:string;payloadSha256:string};
export type HybridReply=Pick<HybridEnvelope,'protocol'|'projectId'|'requestId'|'operation'|'bindingSha256'|'payloadSha256'>&{status:'ok'|'busy'|'unavailable';resultJson:string;resultSha256:string};
export function validateHybridEnvelope(raw:unknown):HybridEnvelope;
export function validateHybridReply(raw:unknown,request:HybridEnvelope):HybridReply;
