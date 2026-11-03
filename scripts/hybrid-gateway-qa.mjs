import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {HYBRID_LIMITS,validateHybridEnvelope} from '../lib/hybridGateway.js';
import {createGatewayAuthenticator,signHybridRequest,verifyHybridReply} from '../tools/msi-gateway/authentication.mjs';
import {createGatewayServer} from '../tools/msi-gateway/server.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex'),secret=randomBytes(32).toString('base64url'),projectId='iilas-cloud-fixture';
function request(now=100000){const payloadJson=JSON.stringify({message:'箱📦'});return {protocol:'iilas-msi-gateway-1.0',projectId,requestId:randomUUID(),operation:'stock.predict',actor:'actor',scope:'scope',issuedAtMs:now,expiresAtMs:now+30000,operationExpiresAtMs:now+45000,bindingSha256:'a'.repeat(64),payloadJson,payloadSha256:hash(payloadJson)};}
function reply(q){const resultJson=JSON.stringify({label:'fixture'});return {protocol:q.protocol,projectId,requestId:q.requestId,operation:q.operation,bindingSha256:q.bindingSha256,payloadSha256:q.payloadSha256,status:'ok',resultJson,resultSha256:hash(resultJson)};}
test('forged expired future and mismatched requests fail closed',()=>{
 const a=createGatewayAuthenticator({secret,projectId,clock:()=>100000}),q=request();
 assert.throws(()=>a.admit(q,'0'.repeat(64)));
 for(const patch of [{projectId:'wrong-project'},{issuedAtMs:105001},{expiresAtMs:99999},{payloadSha256:'0'.repeat(64)},{operation:'shell'},{path:'/other'},{expiresAtMs:140000}]){const p={...q,...patch};assert.throws(()=>a.admit(p,signHybridRequest(secret,p)));}
 assert.throws(()=>validateHybridEnvelope({...q,payloadJson:'not json'}));
 assert.equal(a.admit(q,signHybridRequest(secret,q)).replayed,false);
});
test('exact identities replay, changed payload or binding never rerun',()=>{
 const a=createGatewayAuthenticator({secret,projectId,clock:()=>100000}),q=request(),first=a.admit(q,signHybridRequest(secret,q));
 assert.equal(a.admit(q,signHybridRequest(secret,q)).pending,true);
 const r=reply(q);a.complete(first.identity,r);
 assert.deepEqual(a.admit(q,signHybridRequest(secret,q)).reply,r);
 for(const patch of [{bindingSha256:'b'.repeat(64)},{operationExpiresAtMs:140000},{payloadJson:'{}',payloadSha256:hash('{}')}]){const p={...q,...patch};assert.throws(()=>a.admit(p,signHybridRequest(secret,p)));}
 const signed=a.signReply(r);assert.deepEqual(verifyHybridReply(secret,signed,q),r);
 assert.throws(()=>verifyHybridReply(secret,{...signed,reply:{...r,status:'busy'}},q));
});
test('bounded cache refuses new work, restart cannot start an expired identity',()=>{
 let now=100000;const a=createGatewayAuthenticator({secret,projectId,clock:()=>now}),q=request(now);
 for(let i=0;i<HYBRID_LIMITS.cacheEntries;i++){const p={...q,requestId:randomUUID()};a.admit(p,signHybridRequest(secret,p));}
 assert.throws(()=>a.admit(q,signHybridRequest(secret,q)));
 now=150000;const b=createGatewayAuthenticator({secret,projectId,clock:()=>now}),fresh={...q,issuedAtMs:now,expiresAtMs:now+10000};assert.throws(()=>b.admit(fresh,signHybridRequest(secret,fresh)));
});
test('real local HTTP routes are fixed, signed and size bounded',async t=>{
 const now=Date.now(),a=createGatewayAuthenticator({secret,projectId}),q=request(now);let calls=0;
 const server=createGatewayServer({authenticate:a,handlers:{'stock.predict':async payload=>{calls++;return {message:payload.message};}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));const url=`http://127.0.0.1:${server.address().port}`;
 const send=(body,path='/v1/operation',method='POST')=>fetch(url+path,{method,headers:{'content-type':'application/json','x-iilas-signature':signHybridRequest(secret,q)},body:method==='GET'?undefined:body});
 assert.equal((await send(JSON.stringify(q),'/wrong')).status,404);
 assert.equal((await send('',undefined,'GET')).status,405);
 assert.equal((await send('x'.repeat(HYBRID_LIMITS.bodyBytes+1))).status,413);
 const response=await send(JSON.stringify(q));assert.equal(response.status,200);const signed=await response.json();assert.equal(JSON.parse(verifyHybridReply(secret,signed,q).resultJson).message,'箱📦');
 assert.equal((await send(JSON.stringify(q))).status,200);assert.equal(calls,1);
 assert(!JSON.stringify(signed).includes(secret));
});
