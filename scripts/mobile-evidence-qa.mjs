import {beforeEach,test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {mobileMemory} from './mobile-memory-fixture.mjs';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),memory=mobileMemory();
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>memory.db);mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>({seconds:1793000000,nanoseconds:0}));
let object,afterDownload,downloadOptions;const bytes=Buffer.from('%PDF-1.4\nAnonymous proof fixture\n'),sha=createHash('sha256').update(bytes).digest('hex');
mock.method(require('firebase-admin/storage'),'getStorage',()=>({bucket:()=>({file:()=>({async getMetadata(){if(!object)throw Object.assign(Error('No object'),{code:404});return [structuredClone(object)];},async download(options){downloadOptions=options;if(afterDownload)afterDownload();return [bytes];}})})}));
const {createMobileCommands}=await import('../backend/functions/mobileDelivery.mjs');
const identity={getUser:async uid=>({uid,disabled:false,email:'demo@example.invalid'})},api=()=>createMobileCommands({identity,clock:()=>1793000000000});
const auth={uid:'driver'},req=(action,payload)=>({protocol:'mobile-command-1.0',operationId:randomUUID(),action,payloadJson:JSON.stringify(payload)});
const call=input=>api().mobileCommand(auth,'scope',input);
const prepare=()=>req('evidence.prepare',{shipmentId:'s',evidenceId:randomUUID(),type:'Proof of Delivery',stage:'Delivery',name:'proof.pdf',contentType:'application/pdf',bytes:bytes.length,sha256:sha,captureSource:'file',capturedAtClient:null});
beforeEach(()=>{
 object=null;afterDownload=null;downloadOptions=null;Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo',IILAS_MOBILE_DEMO:'enabled'});
 memory.reset({'system/config':{dataScopeId:'scope'},'users/driver':{active:true,status:'Approved',role:'Driver'},'shipments/s':{ownerId:'scope',status:'Dispatched',version:2,reference:'S1'},'transportPlans/s':{ownerId:'scope',driverUid:'driver',driverId:'d',vehicleId:'v',version:1}});
});
test('reserved immutable target and repeated finalisation register one proof after lost replies',async()=>{
 const input=prepare(),prepared=await call(input);assert.equal(prepared.state,'Pending');assert.equal((await call(input)).replayed,true);
 object={size:String(bytes.length),contentType:'application/pdf',generation:'1',metadata:prepared.data.metadata};
 const finish=req('evidence.finalise',{prepareOperationId:input.operationId}),result=await call(finish);assert.equal(result.state,'Committed');assert.equal(result.data.sha256,sha);
 assert.deepEqual(downloadOptions,{start:0,end:bytes.length,validation:false},'Hash reads at most declared bytes plus one, even if the object changes');
 memory.rows.set('deliveries/s',{status:'Delivered',version:1});assert.equal((await call(finish)).replayed,true);
 assert.equal([...memory.rows.keys()].filter(k=>k.startsWith('evidence/')).length,1);assert.equal([...memory.rows.keys()].filter(k=>k.startsWith('auditLogs/')).length,1);
});
test('missing upload returns a safe not-found without cancelling the immutable finalisation',async()=>{
 const input=prepare(),prepared=await call(input),finish=req('evidence.finalise',{prepareOperationId:input.operationId});
 await assert.rejects(call(finish),e=>e.code==='not-found');
 object={size:String(bytes.length),contentType:'application/pdf',generation:'1',metadata:prepared.data.metadata};assert.equal((await call(finish)).state,'Committed');
});
test('changed object bytes, metadata or source version cannot publish evidence',async()=>{
 const input=prepare(),prepared=await call(input),finish=req('evidence.finalise',{prepareOperationId:input.operationId});
 object={size:String(bytes.length),contentType:'application/pdf',generation:'1',metadata:{...prepared.data.metadata,sha256:'b'.repeat(64)}};
 assert.equal((await call(finish)).reason,'evidence_conflict');assert.equal([...memory.rows.keys()].filter(k=>k.startsWith('evidence/')).length,0);
});
test('actor and authority are checked before hash and again before registration',async()=>{
 const input=prepare(),prepared=await call(input);object={size:String(bytes.length),contentType:'application/pdf',generation:'1',metadata:prepared.data.metadata};
 afterDownload=()=>memory.rows.set('users/driver',{active:false,status:'Disabled',role:'Driver'});
 await assert.rejects(call(req('evidence.finalise',{prepareOperationId:input.operationId})));assert.equal([...memory.rows.keys()].filter(k=>k.startsWith('evidence/')).length,0);
});
test('new finalisation after assignment change refuses; different existing evidence is never overwritten',async()=>{
 const input=prepare(),prepared=await call(input);object={size:String(bytes.length),contentType:'application/pdf',generation:'1',metadata:prepared.data.metadata};
 const id=JSON.parse(input.payloadJson).evidenceId;memory.rows.set('evidence/'+id,{ownerId:'foreign',sha256:'different'});
 assert.equal((await call(req('evidence.finalise',{prepareOperationId:input.operationId}))).reason,'evidence_conflict');assert.equal(memory.rows.get('evidence/'+id).ownerId,'foreign');
});
