import {completionCanonical} from '../../lib/completionWorkflow.js';
import {validateHybridEnvelope,validateHybridReply,HYBRID_LIMITS as L} from '../../lib/hybridGateway.js';
import {hybridHash,assertHybridSecret,checkHybridSignature,signHybridRequest,signHybridReply} from '../../backend/functions/hybridSigning.mjs';
export {hybridHash,signHybridRequest,signHybridReply,verifyHybridReply} from '../../backend/functions/hybridSigning.mjs';
const fail=()=>{throw Error('The signed MSI operation is invalid or unavailable.');};
export function createGatewayAuthenticator({secret,projectId,clock=Date.now,cache=new Map()}){
 assertHybridSecret(secret);if(typeof projectId!=='string'||projectId==='fyp-inventory-and-logistics')fail();
 function prune(){const now=clock();for(const [id,row]of cache)if(row.keepUntilMs<=now)cache.delete(id);}
 function total(){let size=0;for(const row of cache.values())size+=row.bytes;return size;}
 function admit(raw,signature){
  const q=validateHybridEnvelope(raw);checkHybridSignature(signature,signHybridRequest(secret,q));const now=clock();
  if(q.projectId!==projectId||q.issuedAtMs>now+L.clockSkewMs||q.expiresAtMs<=now||hybridHash(q.payloadJson)!==q.payloadSha256)fail();
  prune();const id=hybridHash(completionCanonical([q.projectId,q.actor,q.scope,q.operation,q.requestId])),binding=hybridHash(completionCanonical([q.payloadSha256,q.bindingSha256,q.operationExpiresAtMs])),old=cache.get(id);
  if(old){if(old.binding!==binding)fail();return {identity:{id,binding},envelope:q,replayed:true,pending:!old.reply,reply:old.reply?structuredClone(old.reply):null};}
  if(q.operationExpiresAtMs<=now||q.operationExpiresAtMs>q.issuedAtMs+45000)fail();
  const bytes=Buffer.byteLength(completionCanonical(q));if(cache.size>=L.cacheEntries||total()+bytes>L.cacheBytes)fail();
  cache.set(id,{binding,request:q,bytes,keepUntilMs:now+L.cacheMs,reply:null});return {identity:{id,binding},envelope:q,replayed:false,pending:false,reply:null};
 }
 function complete(identity,raw){
  const row=cache.get(identity.id);if(!row||row.binding!==identity.binding)fail();const r=validateHybridReply(raw,row.request);if(hybridHash(r.resultJson)!==r.resultSha256)fail();
  if(row.reply){if(completionCanonical(row.reply)!==completionCanonical(r))fail();return;}
  const bytes=Buffer.byteLength(completionCanonical(r));if(total()+bytes>L.cacheBytes)fail();row.reply=r;row.bytes+=bytes;
 }
 return {admit,complete,signReply:r=>signHybridReply(secret,r)};
}
