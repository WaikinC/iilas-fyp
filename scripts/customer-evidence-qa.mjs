import assert from 'node:assert/strict';
import {test,beforeEach,mock} from 'node:test';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {AsyncLocalStorage} from 'node:async_hooks';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),als=new AsyncLocalStorage();
let rows,revision,identities,metadataHook,streamHook,authHook,verifyHook,calls,api;
const clone=x=>x===undefined?undefined:structuredClone(x),ref=path=>({path}),bytes=Buffer.from('%PDF-1.4\nOrdinary proof fixture.\n'),sha=x=>createHash('sha256').update(x).digest('hex');
const db={doc:ref,collection:kind=>({doc:id=>ref(kind+'/'+id)}),async runTransaction(work){return als.run(true,async()=>{for(let i=0;i<20;i++){const version=revision,view=new Map([...rows].map(([k,v])=>[k,clone(v)]));const result=await work({get:async r=>{const data=view.get(r.path);return {exists:data!==undefined,id:r.path.split('/').at(-1),data:()=>clone(data)};}});if(version===revision)return result;}throw Error('retry exhausted');});}};
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>db);
const {createCustomerEvidence}=await import('../backend/functions/customerEvidence.mjs');
const {customerGrantId}=await import('../backend/functions/customerAccess.mjs');
const grantPath=()=> 'customerShipmentGrants/'+customerGrantId('scope','customer1','s1');
function packet(patch={}){const req=Object.assign(new EventEmitter(),{method:'GET',query:{shipmentId:'s1',evidenceId:'proof1'},headers:{origin:'http://127.0.0.1:5173',authorization:'Bearer fixture.header.signature'},...patch});req.get=name=>req.headers[name.toLowerCase()];const res=Object.assign(new EventEmitter(),{statusCode:200,headers:{},writableEnded:false,headersSent:false,body:null});res.setHeader=(name,value)=>{res.headers[name.toLowerCase()]=value;};res.set=(name,value)=>{res.setHeader(name,value);return res;};res.status=code=>{res.statusCode=code;return res;};res.end=body=>{res.body=body===undefined?Buffer.alloc(0):Buffer.from(body);res.writableEnded=true;res.headersSent=true;res.emit('close');return res;};res.send=body=>res.end(body);res.json=body=>res.end(JSON.stringify(body));return {req,res};}
beforeEach(()=>{
 revision=0;calls=[];authHook=()=>{};metadataHook=()=>({size:String(bytes.length),contentType:'application/pdf',generation:'1'});streamHook=()=>Readable.from([bytes]);verifyHook=()=>({uid:'customer1'});
 rows=new Map([['system/config',{dataScopeId:'scope'}],['users/customer1',{uid:'customer1',role:'Customer',status:'Approved',active:true,version:1}],['users/customer2',{uid:'customer2',role:'Customer',status:'Approved',active:true,version:1}],['shipments/s1',{ownerId:'scope',status:'Dispatched',version:2}],['deliveries/s1',{ownerId:'scope',shipmentId:'s1',status:'Delivered',proofId:'proof1',version:2}],['evidence/proof1',{ownerId:'scope',shipmentId:'s1',type:'Proof of Delivery',stage:'Delivery',path:'evidence/scope/s1/proof1',name:'Proof.pdf',bytes:bytes.length,contentType:'application/pdf',sha256:sha(bytes),version:1}]]);
 rows.set(grantPath(),{ownerId:'scope',customerUid:'customer1',shipmentId:'s1',active:true,shareLocation:false,version:1});identities=new Map([['customer1',{uid:'customer1',disabled:false}],['customer2',{uid:'customer2',disabled:false}]]);
 api=createCustomerEvidence({identity:async uid=>{assert(!als.getStore(),'Auth IO inside transaction');await authHook(uid);return clone(identities.get(uid));},verifyToken:async(token,revoked)=>{assert(!als.getStore());assert.equal(token,'fixture.header.signature');assert.equal(revoked,true);return verifyHook();},fileFor:path=>{assert(!als.getStore(),'Storage IO inside transaction');assert.equal(path,'evidence/scope/s1/proof1');calls.push('file');return {getMetadata:async()=>{assert(!als.getStore());calls.push('metadata');return [await metadataHook()];},createReadStream:()=>{assert(!als.getStore());calls.push('stream');return streamHook();}};}});
 Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'});
});
test('current customer proof is checked twice and sent as a bounded no-store attachment',async()=>{
 const p=packet();await api.handler(p.req,p.res);assert.equal(p.res.statusCode,200);assert.deepEqual(p.res.body,bytes);assert.equal(p.res.headers['content-type'],'application/pdf');assert.match(p.res.headers['content-disposition'],/attachment/);assert.match(p.res.headers['cache-control'],/no-store/);assert.equal(p.res.headers['x-content-type-options'],'nosniff');assert.equal(p.res.headers['access-control-allow-origin'],'http://127.0.0.1:5173');assert.deepEqual(calls,['file','metadata','stream']);
});
test('cross-customer guessed proof missing/revoked grant and disabled/changed roles never send bytes',async()=>{
 const original=clone([...rows]);for(const mode of ['other-customer','other-proof','no-grant','revoked','role','disabled']){
  rows=new Map(clone(original));identities.get('customer1').disabled=false;verifyHook=()=>({uid:mode==='other-customer'?'customer2':'customer1'});const p=packet();if(mode==='other-proof')p.req.query.evidenceId='other';if(mode==='no-grant')rows.delete(grantPath());if(mode==='revoked')rows.get(grantPath()).active=false;if(mode==='role')rows.get('users/customer1').role='Viewer';if(mode==='disabled')identities.get('customer1').disabled=true;await api.handler(p.req,p.res);assert([401,403,404].includes(p.res.statusCode),mode);assert(!p.res.body.equals(bytes));
 }
});
test('wrong owner/shipment/stage/type/path/content type and unlinked delivery evidence cannot stream',async()=>{
 const original=clone(rows.get('evidence/proof1'));for(const patch of [{ownerId:'foreign'},{shipmentId:'s2'},{stage:'Other'},{type:'Unrelated document'},{path:'evidence/scope/s2/proof1'},{contentType:'text/html'},{bytes:0}]){rows.set('evidence/proof1',{...original,...patch});const p=packet();await api.handler(p.req,p.res);assert.notEqual(p.res.statusCode,200);assert(!p.res.body.equals(bytes));}assert.equal(calls.length,0);
});
test('malformed requests unexpected origins and non-GET cannot trigger protected IO',async()=>{
 for(const patch of [{method:'POST'},{headers:{origin:'https://example.test',authorization:'Bearer fixture.header.signature'}},{query:{shipmentId:'s1',evidenceId:'proof1',token:'no-token-in-urls'}},{query:{shipmentId:['s1','s2'],evidenceId:'proof1'}},{query:{shipmentId:'../s1',evidenceId:'proof1'}}]){const p=packet(patch);await api.handler(p.req,p.res);assert([400,403,405].includes(p.res.statusCode));}assert.equal(calls.length,0);
});
test('only the explicit local GET preflight is accepted without exposing a proof',async()=>{
 const p=packet({method:'OPTIONS',headers:{origin:'http://localhost:5173','access-control-request-method':'GET','access-control-request-headers':'authorization'}});await api.handler(p.req,p.res);assert.equal(p.res.statusCode,204);assert.equal(p.res.body.length,0);assert.equal(calls.length,0);
 const wrong=packet({method:'OPTIONS',headers:{origin:'http://localhost:5173','access-control-request-method':'POST'}});await api.handler(wrong.req,wrong.res);assert.notEqual(wrong.res.statusCode,204);
});
test('source metadata mismatch and oversized/changed bytes are rejected before any response bytes',async()=>{
 for(const hook of [()=>({size:String(10*1024*1024+1),contentType:'application/pdf'}),()=>({size:String(bytes.length),contentType:'text/html'})]){metadataHook=hook;const p=packet();await api.handler(p.req,p.res);assert([409,413].includes(p.res.statusCode));assert(!p.res.body.equals(bytes));}
 metadataHook=()=>({size:String(bytes.length),contentType:'application/pdf'});streamHook=()=>Readable.from([Buffer.from('different private bytes')]);let p=packet();await api.handler(p.req,p.res);assert.equal(p.res.statusCode,409);assert(!p.res.body.includes(Buffer.from('different private bytes')));
 streamHook=()=>Readable.from([Buffer.alloc(10*1024*1024+1)]);p=packet();await api.handler(p.req,p.res);assert.equal(p.res.statusCode,413);
});
test('revocation or role/source change during file IO denies publication and next requests',async()=>{
 const original=clone([...rows]);for(const mode of ['grant','role','source']){rows=new Map(clone(original));metadataHook=()=>{if(mode==='grant')rows.get(grantPath()).active=false;if(mode==='role')rows.get('users/customer1').role='Viewer';if(mode==='source')rows.get('evidence/proof1').sha256='a'.repeat(64);revision++;return {size:String(bytes.length),contentType:'application/pdf'};};const p=packet();await api.handler(p.req,p.res);assert([403,404,409].includes(p.res.statusCode));assert(!p.res.body.equals(bytes));}
});
test('slow file IO is aborted at fifteen seconds and its late reply cannot send bytes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let entered,release;const atMetadata=new Promise(r=>{entered=r;});metadataHook=()=>new Promise(resolve=>{release=()=>resolve({size:String(bytes.length),contentType:'application/pdf'});entered();});const p=packet(),work=api.handler(p.req,p.res);await atMetadata;t.mock.timers.tick(15000);await work;assert.equal(p.res.statusCode,504);const before=Buffer.from(p.res.body);release();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(p.res.body,before);assert(!calls.includes('stream'));
});
test('raw Auth/Storage errors and tokens are never reflected in safe error responses',async()=>{
 verifyHook=()=>{throw Error('private token and Auth stack');};let p=packet();await api.handler(p.req,p.res);assert.equal(p.res.statusCode,401);assert(!p.res.body.toString().includes('private token'));verifyHook=()=>({uid:'customer1'});metadataHook=()=>{throw Error('private bucket and filesystem path');};p=packet();await api.handler(p.req,p.res);assert.equal(p.res.statusCode,503);assert(!p.res.body.toString().includes('private bucket'));assert(!p.res.body.toString().includes('fixture.header.signature'));
});
