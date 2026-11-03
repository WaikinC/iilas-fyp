import {HYBRID_PROTOCOL,HYBRID_LIMITS as L,validateHybridEnvelope} from './hybridGateway.js';
import {validateDemoEnvironment} from './demoEnvironment.js';
import {assertHybridSecret,hybridHash,signHybridRequest,verifyHybridReply} from './hybridSigning.mjs';
import {validateContextPrediction} from './inventoryContextAI.js';
import {validateDeliveryPrediction} from './deliveryRiskDemo.js';
export function assertHybridActionAllowed(action,mode){
 if(['spark-msi','spark-loopback-test'].includes(mode)&&(/parcel/i.test(action)||['predict','startInventoryExperiment','prepareVerification','registerVerification'].includes(action)))throw Object.assign(Error('This legacy or paused research action is disabled.'),{code:'unavailable'});
 if(mode==='cloud-demo'&&(['predict','startInventoryExperiment','prepareVerification','registerVerification'].includes(action)||/^(start|reserve|analyse|cleanup|review).*Parcel/.test(action)))throw Object.assign(Error('This legacy or paused research route is disabled in the cloud demo.'),{code:'unavailable'});
}
export async function readBoundedHybridJSON(response,cap=L.responseBytes){
 const reader=response.body?.getReader();if(!reader)throw Error('Missing MSI response');const chunks=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>cap)throw Error('MSI response cap');chunks.push(Buffer.from(value));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{await reader.cancel().catch(()=>{});}
}
export function createHybridTransport({profile,secret,fetcher=fetch,clock=Date.now}){
 assertHybridSecret(secret);const environment=validateDemoEnvironment(profile.environment,[profile.environment]);
 let url;try{url=new URL(profile.gatewayOrigin);}catch{throw Error('A pinned HTTPS MSI origin is required.');}
 if(environment.mode!=='cloud-demo'||url.protocol!=='https:'||url.origin!==profile.gatewayOrigin||url.username||url.password||['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)||url.hostname.endsWith('.localhost'))throw Error('A pinned HTTPS MSI origin is required.');
 return {async call({operation,actor,scope,requestId,operationExpiresAtMs,bindingSha256,payload}){
  const issuedAtMs=clock(),payloadJson=JSON.stringify(payload),q=validateHybridEnvelope({protocol:HYBRID_PROTOCOL,projectId:environment.projectId,requestId,operation,actor,scope,issuedAtMs,expiresAtMs:issuedAtMs+L.lifetimeMs,operationExpiresAtMs,bindingSha256,payloadJson,payloadSha256:hybridHash(payloadJson)});
  const timeout=Math.min(operation.startsWith('chain.')?15000:25000,operationExpiresAtMs-issuedAtMs);if(timeout<=0)throw Error('The original MSI operation expired.');
  const response=await fetcher(profile.gatewayOrigin+'/v1/operation',{method:'POST',headers:{'content-type':'application/json','x-iilas-signature':signHybridRequest(secret,q)},redirect:'error',body:JSON.stringify(q),signal:AbortSignal.timeout(timeout)});
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw Object.assign(Error('MSI unavailable'),{code:'service_unavailable'});}
  const r=verifyHybridReply(secret,await readBoundedHybridJSON(response),q);if(r.status!=='ok')throw Object.assign(Error('MSI unavailable'),{code:r.status==='busy'?'busy':'service_unavailable'});return JSON.parse(r.resultJson);
 }};
}
export async function inferHybridPrediction({kind,auth,scope,saved,request,configuration}){
 const transport=createHybridTransport({profile:configuration.transportProfile,secret:process.env.IILAS_GATEWAY_SECRET});
 const value=await transport.call({operation:kind+'.predict',actor:auth.uid,scope,requestId:saved.nonce,operationExpiresAtMs:saved.expiresAtMs,bindingSha256:configuration.bindingSha256,payload:request});
 if(kind==='stock')return validateContextPrediction(value,{...configuration.expected,requestId:saved.nonce,inputSha256:request.inputSha256,features:request.features});
 return validateDeliveryPrediction(value,{...configuration.expected,...request});
}
