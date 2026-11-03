import {completionCanonical,completionExact,completionUUID,completionIdentifier} from './completionWorkflow.js';
export const HYBRID_PROTOCOL='iilas-msi-gateway-1.0';
export const HYBRID_OPERATIONS=Object.freeze(['stock.predict','delivery.predict','chain.inspect','chain.lookup','chain.receipt','chain.events']);
export const HYBRID_LIMITS=Object.freeze({port:8010,bodyBytes:131072,responseBytes:131072,lifetimeMs:30000,clockSkewMs:5000,cacheEntries:256,cacheMs:120000,cacheBytes:33554432,connections:32});
const hash=/^[a-f0-9]{64}$/;
const fail=()=>{throw Error('The signed MSI operation is invalid or unavailable.');};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
function json(value){if(typeof value!=='string')fail();const p=JSON.parse(value);completionCanonical(p);return p;}
export function validateHybridEnvelope(value){
 const q=completionExact(value,['protocol','projectId','requestId','operation','actor','scope','issuedAtMs','expiresAtMs','operationExpiresAtMs','bindingSha256','payloadJson','payloadSha256']);
 if(q.protocol!==HYBRID_PROTOCOL||typeof q.projectId!=='string'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(q.projectId)||!HYBRID_OPERATIONS.includes(q.operation)||![q.issuedAtMs,q.expiresAtMs,q.operationExpiresAtMs].every(integer)||q.expiresAtMs<=q.issuedAtMs||q.expiresAtMs-q.issuedAtMs>HYBRID_LIMITS.lifetimeMs||!hash.test(q.bindingSha256)||!hash.test(q.payloadSha256))fail();
 completionUUID(q.requestId);completionIdentifier(q.actor);completionIdentifier(q.scope);json(q.payloadJson);return q;
}
export function validateHybridReply(value,request){
 const r=completionExact(value,['protocol','projectId','requestId','operation','bindingSha256','payloadSha256','status','resultJson','resultSha256']);
 if(['protocol','projectId','requestId','operation','bindingSha256','payloadSha256'].some(k=>r[k]!==request[k])||!['ok','busy','unavailable'].includes(r.status)||!hash.test(r.resultSha256))fail();json(r.resultJson);return r;
}
