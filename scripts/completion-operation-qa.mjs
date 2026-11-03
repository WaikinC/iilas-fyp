import assert from 'node:assert/strict';
import {beforeEach,test,mock} from 'node:test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url));
let rows,revision,failReceipt;
const clone=x=>x===undefined?undefined:structuredClone(x),ref=path=>({path});
const db={doc:ref,collection:kind=>({doc:id=>ref(kind+'/'+id)}),async runTransaction(work){for(let attempt=0;attempt<20;attempt++){
 const seen=revision,view=new Map([...rows].map(([k,v])=>[k,clone(v)])),writes=[];
 const tx={async get(r){assert.equal(writes.length,0,'read after write');const v=view.get(r.path);return {exists:v!==undefined,id:r.path.split('/').at(-1),data:()=>clone(v)};},create(r,v){assert(!view.has(r.path),'duplicate create');if(failReceipt&&r.path.startsWith('completionRequests/'))throw Error('receipt write failed');writes.push([r.path,v]);},update(r,v){assert(view.has(r.path));writes.push([r.path,{...view.get(r.path),...v}]);}};
 const value=await work(tx);if(seen!==revision)continue;for(const [k,v]of writes)rows.set(k,clone(v));revision++;return value;
 }throw Error('retry exhausted');}};
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>db);
mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>({seconds:1,nanoseconds:0}));
const {runCompletionOperation,assertCompletionLocal}=await import('../backend/functions/completionOperations.mjs');
const request=()=>({operationId:randomUUID(),id:'v1',expectedVersion:1});
const run=(input,options={})=>runCompletionOperation({auth:{uid:'manager'},scope:'scope',action:'updateFleetResource',input,roles:['Manager'],work:async(tx,member)=>{
 assert.equal(member.role,'Manager');const saved=await tx.get(ref('vehicles/v1')),v=saved.data();assert.equal(v.version,input.expectedVersion,'stale version');
 return {result:{recordId:'v1',version:v.version+1},apply:()=>tx.update(ref('vehicles/v1'),{version:v.version+1})};},...options});
const count=kind=>[...rows.keys()].filter(k=>k.startsWith(kind+'/')).length;
beforeEach(()=>{revision=0;failReceipt=false;rows=new Map([['system/config',{dataScopeId:'scope'}],['users/manager',{active:true,status:'Approved',role:'Manager'}],['vehicles/v1',{ownerId:'scope',version:1}]]);Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'});});
test('exact local capability required before transaction or recovery',async()=>{
 assertCompletionLocal();for(const key of ['FUNCTIONS_EMULATOR','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','IILAS_FYP_COMPLETION_MODE']){const old=process.env[key];process.env[key]='wrong';assert.throws(assertCompletionLocal);await assert.rejects(run(request()));process.env[key]=old;}assert.equal(count('completionRequests'),0);
});
test('single atomic write, audit and receipt; exact replay never redoes work',async()=>{
 const input=request(),result=await run(input);assert.equal(result.recordId,'v1');assert.equal(result.version,2);assert.equal(result.state,'Completed');assert.equal(rows.get('vehicles/v1').version,2);assert.equal(count('auditLogs'),1);assert.equal(count('completionRequests'),1);
 const replay=await run(input,{work:()=>{throw Error('must not run');}});assert.deepEqual(replay,{...result,replayed:true});assert.equal(count('auditLogs'),1);
 await assert.rejects(run({...input,id:'other'}),/different|input/i);
});
test('current Approved actor can recover after role change; revoked, foreign and new unauthorised work denied',async()=>{
 const input=request();await run(input);rows.set('users/manager',{active:true,status:'Approved',role:'Viewer'});
 assert.equal((await run(input)).replayed,true);await assert.rejects(run(request()));await assert.rejects(run(input,{scope:'foreign'}));
 rows.set('users/manager',{active:false,status:'Approved',role:'Manager'});await assert.rejects(run(input));rows.delete('users/manager');await assert.rejects(run(input));
});
test('resolve-before-send cancels exactly once and prevents all later writes',async()=>{
 const input=request(),result=await run(input,{resolveOnly:true,work:()=>{throw Error('must not run');}});assert.equal(result.state,'Cancelled');assert.equal(result.recordId,null);assert.equal(result.version,null);assert.equal((await run(input)).state,'Cancelled');assert.equal(rows.get('vehicles/v1').version,1);assert.equal(count('auditLogs'),0);
});
test('concurrent duplicate operations replay one result; unrelated operations compete on version',async()=>{
 const input=request(),r=await Promise.all([run(input),run(input)]);assert.equal(r.filter(x=>x.replayed).length,1);assert.equal(count('completionRequests'),1);
 rows.set('vehicles/v1',{ownerId:'scope',version:1});const next=await Promise.allSettled([run(request()),run(request())]);assert.equal(next.filter(x=>x.status==='fulfilled').length,1);assert.equal(count('auditLogs'),2);
});
test('receipt failure or read-after-write rolls back every write',async()=>{
 const before=clone([...rows]);failReceipt=true;await assert.rejects(run(request()),/receipt/);assert.deepEqual([...rows],before);failReceipt=false;
 await assert.rejects(run(request(),{work:async tx=>{tx.update(ref('vehicles/v1'),{version:9});await tx.get(ref('vehicles/v1'));}}),/read after write/);assert.deepEqual([...rows],before);
});
test('invalid inputs and forged work outcomes cannot persist a receipt',async()=>{
 for(const patch of [{operationId:'bad'},{ownerId:'foreign'},{actor:'admin'},{value:NaN}])await assert.rejects(run({...request(),...patch}));
 for(const result of [{recordId:'v1',version:'2'},{recordId:null,version:null},{recordId:'v1',version:2,token:'hidden'}])await assert.rejects(run(request(),{work:async()=>({result,apply:()=>{}})}));assert.equal(count('completionRequests'),0);
});
test('action binding separates one UUID reused across different command names',async()=>{
 const input=request();await run(input);const other=await run({...input,expectedVersion:2},{action:'reviseTransportPlan'});assert.equal(other.action,'reviseTransportPlan');assert.equal(other.version,3);assert.equal(count('completionRequests'),2);
});
