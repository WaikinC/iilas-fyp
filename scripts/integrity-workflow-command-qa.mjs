import assert from 'node:assert/strict';
import {test,beforeEach,mock} from 'node:test';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),als=new AsyncLocalStorage();
let rows,rev,time,config,chain,onLookup,onReceipt,onFile,onEvents,onGet,calls,api,withRegistrationTimestamp;
const clone=x=>x===undefined?undefined:structuredClone(x),ref=path=>({path});
const db={doc:ref,collection:kind=>({doc:id=>ref(kind+'/'+id)}),async runTransaction(work){return als.run(true,async()=>{for(let i=0;i<20;i++){
 const before=rev,view=new Map([...rows].map(([k,v])=>[k,clone(v)])),writes=[];
 const tx={async get(r){assert.equal(writes.length,0,'read after write');await onGet(r.path);const v=view.get(r.path);return {exists:v!==undefined,id:r.path.split('/').at(-1),ref:r,data:()=>withRegistrationTimestamp&&v&&r.path.startsWith('verificationRecords/')?{...clone(v),createdAt:require('firebase-admin/firestore').Timestamp.fromMillis(100000)}:clone(v)};},create(r,v){assert(!view.has(r.path),'duplicate create');writes.push([r.path,v]);},set(r,v){writes.push([r.path,v]);},update(r,v){assert(view.has(r.path));writes.push([r.path,{...view.get(r.path),...v}]);},delete(r){writes.push([r.path,undefined]);}};
 const value=await work(tx);if(before!==rev)continue;for(const [p,v]of writes){if(v===undefined)rows.delete(p);else rows.set(p,clone(v));}rev++;return value;
 }throw Error('retry exhausted');});}};
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>db);mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>({seconds:Math.floor(time/1000),nanoseconds:0}));
const {createIntegrityCommands}=await import('../backend/functions/integrityWorkflow.mjs');
const movement={ownerId:'scope',productId:'p',sku:'S',type:'Receipt',quantity:2,quantityChange:2,reservedChange:0,quantityBefore:1,quantityAfter:3,reservedBefore:0,reservedAfter:0,locationFrom:'A',locationTo:'A',reference:'R',reason:'Recorded receipt',actor:'inventory',createdAt:{seconds:100,nanoseconds:0},productVersion:2};
const make=()=>({operationId:randomUUID(),kind:'inventory',recordId:'m1'}),call=(name,input,uid='manager',scope='scope')=>api[name]({uid},scope,input),count=kind=>[...rows.keys()].filter(p=>p.startsWith(kind+'/')).length;
const io=async(name,work)=>{assert(!als.getStore(),'external IO inside transaction');calls.push(name);return work();};
beforeEach(()=>{
 rev=0;time=1000000;calls=[];withRegistrationTimestamp=false;config={rpcUrl:'http://127.0.0.1:8545',chainId:31337,address:'0x'+'1'.repeat(40),deploymentBlock:1,deploymentTransactionHash:'0x'+'2'.repeat(64),runtimeCodeSha256:'3'.repeat(64)};
 chain={chainId:31337,runtimeCodeSha256:config.runtimeCodeSha256,blockNumber:10,authorisedWallet:'0x'+'4'.repeat(40),deploymentTransactionHash:config.deploymentTransactionHash};
 rows=new Map([['system/config',{dataScopeId:'scope'}],['stockMovements/m1',movement],...['Admin','Manager','Viewer','Inventory'].map(role=>['users/'+role.toLowerCase(),{active:true,status:'Approved',role}])]);
 onLookup=()=>null;onReceipt=()=>null;onFile=()=>({sha256:'a'.repeat(64),bytes:12});onEvents=()=>[];onGet=()=>{};
 api=createIntegrityCommands({configuration:()=>clone(config),clock:()=>time,rpc:{inspect:()=>io('inspect',()=>clone(chain)),lookup:(...a)=>io('lookup',()=>onLookup(...a)),receipt:(...a)=>io('receipt',()=>onReceipt(...a)),events:(...a)=>io('events',()=>onEvents(...a))},files:{digest:source=>io('file',()=>onFile(source))}});
 Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'});
});
const goodReceipt=p=>({transactionHash:'0x'+'5'.repeat(64),status:1,to:p.contract,from:p.authorisedWallet,blockNumber:11,referenceHash:p.referenceHash,digest:p.digest});
test('prepare pins unchanged facts and deployment; same operation resumes without another claim',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);assert.equal(p.state,'Prepared');assert.equal(p.chainId,31337);assert.equal(p.sourceVersion,2);assert.equal(p.startingBlock,10);assert.equal(count('integrityRequests'),1);assert.equal(count('integrityLocks'),1);
 config=null;assert.deepEqual(await call('prepareIntegrityRegistration',input),p);await assert.rejects(call('prepareIntegrityRegistration',make()),/pending|lock|reconcil/i);
});
test('registration validates receipt event wallet and lookup then atomically keeps the legacy history',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;onLookup=()=>p.digest;onReceipt=()=>goodReceipt(p);const result=await call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)});assert.equal(result.state,'Completed');assert.equal(count('verificationRecords'),1);
 const old=clone([...rows].filter(([k])=>k.startsWith('verificationRecords/')));config=null;assert.equal((await call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)})).replayed,true);assert.equal((await call('resolveIntegrityRegistration',input)).state,'Completed');assert.deepEqual([...rows].filter(([k])=>k.startsWith('verificationRecords/')),old);
 await assert.rejects(call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'6'.repeat(64)}));
});
test('receipt mismatch network deployment and original source changes never record success',async()=>{
 for(const mode of ['to','from','digest','referenceHash','status','blockNumber','network','code','source','role','configuration']){
  const input=make(); // each subcase uses a fresh in-memory state
  for(const k of [...rows.keys()])if(k.startsWith('integrityLocks/'))rows.delete(k);
  config={rpcUrl:'http://127.0.0.1:8545',chainId:31337,address:'0x'+'1'.repeat(40),deploymentBlock:1,deploymentTransactionHash:'0x'+'2'.repeat(64),runtimeCodeSha256:'3'.repeat(64)};chain.chainId=31337;chain.runtimeCodeSha256=config.runtimeCodeSha256;rows.set('stockMovements/m1',clone(movement));rows.set('users/manager',{active:true,status:'Approved',role:'Manager'});onLookup=()=>null;
  const p=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;onLookup=()=>p.digest;onReceipt=()=>{const receipt=goodReceipt(p);if(['to','from','digest','referenceHash'].includes(mode))receipt[mode]='wrong';if(mode==='status')receipt.status=0;if(mode==='blockNumber')receipt.blockNumber=0;if(mode==='network')chain.chainId=1;if(mode==='code')chain.runtimeCodeSha256='0'.repeat(64);if(mode==='source')rows.set('stockMovements/m1',{...movement,reason:'changed'});if(mode==='role')rows.set('users/manager',{active:false,status:'Approved',role:'Manager'});if(mode==='configuration')config.address='0x'+'9'.repeat(40);return receipt;};
  await assert.rejects(call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)}),undefined,mode);assert.equal(count('verificationRecords'),0);
 }
});
test('missing receipt, expired claim and lost signature acknowledgement remain Pending and do not unlock',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);assert.equal((await call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)})).state,'Pending');time=p.expiresAtMs+1;assert.equal((await call('resolveIntegrityRegistration',input)).state,'Pending');assert.equal(count('verificationRecords'),0);await assert.rejects(call('prepareIntegrityRegistration',make()),/pending|lock|reconcil/i);
});
test('unknown registration or check resolve produces immutable Cancelled without external IO',async()=>{
 for(const [resolve,start]of [['resolveIntegrityRegistration','prepareIntegrityRegistration'],['resolveIntegrityCheck','checkIntegrityRecord']]){const input=make();assert.equal((await call(resolve,input)).state,'Cancelled');assert.equal((await call(start,input)).state,'Cancelled');}assert.equal(calls.length,0);
});
test('immutable check attempts distinguish matching absent different and unavailable chain',async()=>{
 for(const wanted of ['NotRegistered','Verified','Unmatched','Unavailable']){
  onLookup=(_cfg,source)=>wanted==='Verified'?source.digest:wanted==='Unmatched'?'f'.repeat(64):wanted==='Unavailable'?Promise.reject(Error('private RPC error')):null;
  const result=await call('checkIntegrityRecord',make()),check=rows.get('integrityChecks/'+result.recordId);assert.equal(check.outcome,wanted);assert.equal(check.source.snapshot.recordId,'m1');assert.equal(check.source.digest.length,64);assert(!JSON.stringify(check).includes('private RPC error'));assert.equal((await call('resolveIntegrityCheck',check.input)).recordId,result.recordId);
 }
 assert.equal(count('integrityExceptions'),3);assert.equal(count('verificationRecords'),0);
});
test('file bytes mismatching registered digest yield retained Unmatched; missing file stays Unavailable',async()=>{
 const evidence={ownerId:'scope',shipmentId:'s1',type:'Proof of Delivery',sha256:'a'.repeat(64),bytes:12,contentType:'application/pdf',path:'evidence/scope/s1/e1',actor:'driver',createdAt:{seconds:100,nanoseconds:0},version:1};rows.set('evidence/e1',evidence);
 onLookup=(_cfg,source)=>source.digest;onFile=()=>({sha256:'b'.repeat(64),bytes:12});let r=await call('checkIntegrityRecord',{...make(),kind:'delivery',recordId:'e1'});assert.equal(rows.get('integrityChecks/'+r.recordId).outcome,'Unmatched');assert.equal(rows.get('integrityChecks/'+r.recordId).failureCode,'FileDigestMismatch');
 onFile=()=>{throw Error('private bucket path');};r=await call('checkIntegrityRecord',{...make(),kind:'delivery',recordId:'e1'});assert.equal(rows.get('integrityChecks/'+r.recordId).outcome,'Unavailable');assert.equal(rows.get('integrityChecks/'+r.recordId).failureCode,'FileUnavailable');assert(!JSON.stringify(rows.get('integrityChecks/'+r.recordId)).includes('private bucket path'));
 await assert.rejects(call('prepareIntegrityRegistration',{...make(),kind:'delivery',recordId:'e1'}));
});
test('concurrent duplicate checks produce one attempt and independent review never rewrites provenance',async()=>{
 const input=make(),both=await Promise.all([call('checkIntegrityRecord',input),call('checkIntegrityRecord',input)]);assert.equal(count('integrityChecks'),1);const checkId=both.find(x=>x.state==='Completed').recordId,check=clone(rows.get('integrityChecks/'+checkId));
 const review={operationId:randomUUID(),exceptionId:checkId,expectedReviewVersion:0,decision:'NeedsFollowUp',notes:'Check source against original receiving record.'};
 await assert.rejects(call('reviewIntegrityException',review),/different|independent/i);const result=await call('reviewIntegrityException',review,'admin');assert.equal(result.version,1);assert.equal((await call('resolveIntegrityReview',review,'admin')).replayed,true);assert.deepEqual(rows.get('integrityChecks/'+checkId),check);assert.deepEqual(rows.get('stockMovements/m1'),movement);assert.equal(count('integrityReviewEvents'),1);await assert.rejects(call('reviewIntegrityException',{...review,operationId:randomUUID()},'admin'),/version|changed/i);
});
test('role source and configuration changes while a check is running cannot publish stale Verified',async()=>{
 const original=clone(config);for(const mode of ['source','configuration','role']){
  config=clone(original);rows.set('users/manager',{active:true,status:'Approved',role:'Manager'});rows.set('stockMovements/m1',clone(movement));onLookup=(_cfg,source)=>{if(mode==='source')rows.set('stockMovements/m1',{...movement,reason:'changed during RPC'});if(mode==='configuration')config.address='0x'+'9'.repeat(40);if(mode==='role')rows.set('users/manager',{active:false,status:'Approved',role:'Manager'});return source.digest;};
  const callResult=call('checkIntegrityRecord',make());if(mode==='role')await assert.rejects(callResult);else {const r=await callResult;assert.equal(rows.get('integrityChecks/'+r.recordId).outcome,'Unavailable');}
 }
});
test('lost signing acknowledgement can reconcile one exact wallet event within a bounded block window',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);chain.blockNumber=1000;onEvents=(_cfg,source,start,end)=>{assert.equal(start,10);assert.equal(end,265);return [{transactionHash:'0x'+'5'.repeat(64),digest:source.digest,referenceHash:source.referenceHash,actor:p.authorisedWallet,blockNumber:11}];};onReceipt=()=>goodReceipt(p);onLookup=()=>p.digest;
 const result=await call('resolveIntegrityRegistration',input);assert.equal(result.state,'Completed');assert.equal(count('verificationRecords'),1);assert.equal((await call('resolveIntegrityRegistration',input)).replayed,true);
});
test('ambiguous signing events and wrong wallet cannot produce another preparation or success',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;const e={transactionHash:'0x'+'5'.repeat(64),digest:p.digest,referenceHash:p.referenceHash,actor:p.authorisedWallet,blockNumber:11};onEvents=()=>[e,{...e,transactionHash:'0x'+'6'.repeat(64)}];assert.equal((await call('resolveIntegrityRegistration',input)).state,'Pending');onEvents=()=>[{...e,actor:'0x'+'9'.repeat(40)}];assert.equal((await call('resolveIntegrityRegistration',input)).state,'Pending');assert.equal(count('verificationRecords'),0);
});
test('deployment code changing during lookup cannot publish Verified',async()=>{
 onLookup=(_c,source)=>{chain.runtimeCodeSha256='f'.repeat(64);return source.digest;};const r=await call('checkIntegrityRecord',make());assert.equal(rows.get('integrityChecks/'+r.recordId).outcome,'Unavailable');
});
test('registration RPC errors do not expose underlying messages',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;onReceipt=()=>goodReceipt(p);onLookup=()=>{throw Error('private RPC stack and path');};await assert.rejects(call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)}),e=>!e.message.includes('private RPC stack'));
});
test('a lookup that finishes after the IO deadline cannot change the retained timeout into Verified',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release,entered;const atLookup=new Promise(r=>{entered=r;});
 onLookup=(_c,source)=>new Promise(resolve=>{release=()=>resolve(source.digest);entered();});const work=call('checkIntegrityRecord',make());await atLookup;
 let released=false;onGet=async path=>{if(path.startsWith('integrityRequests/')&&!released){released=true;release();await new Promise(resolve=>setImmediate(resolve));}};
 t.mock.timers.tick(15000);const result=await work;assert.equal(rows.get('integrityChecks/'+result.recordId).outcome,'Unavailable');assert.equal(rows.get('integrityChecks/'+result.recordId).failureCode,'IOTimeout');
});
test('an existing successful registration blocks another signature after a local chain reset',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;onReceipt=()=>goodReceipt(p);onLookup=()=>p.digest;await call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)});
 onLookup=()=>null;await assert.rejects(call('prepareIntegrityRegistration',make()),/existing|already|registration/i);
});
test('historical registration keeps its deployment even when a replacement returns the same digest',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;onReceipt=()=>goodReceipt(p);onLookup=()=>p.digest;await call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)});
 const original=clone(rows.get('verificationRecords/'+p.referenceHash));config.deploymentTransactionHash='0x'+'7'.repeat(64);chain.deploymentTransactionHash=config.deploymentTransactionHash;calls.length=0;
 const checked=await call('checkIntegrityRecord',make()),attempt=rows.get('integrityChecks/'+checked.recordId);assert.equal(attempt.outcome,'Unavailable');assert.equal(attempt.failureCode,'DeploymentChanged');assert.deepEqual(attempt.chain,original.chain);assert.deepEqual(rows.get('verificationRecords/'+p.referenceHash),original);assert(!calls.includes('lookup'));
});
test('cloud generation A registration cannot be verified on identical-address generation B',async t=>{
 const fs=require('node:fs'),read=fs.readFileSync,project='iilas-cloud-fixture',environment={schema:'iilas-demo-environment-1.0',mode:'cloud-demo',projectId:project,storageBucket:project+'.firebasestorage.app',functionsRegion:'asia-southeast1',webOrigins:['https://'+project+'.web.app']},keys=[...Object.keys(process.env).filter(k=>k.includes('EMULATOR')), 'IILAS_DEMO_MODE','IILAS_DEMO_PROJECT_ID','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 t.mock.method(fs,'readFileSync',function(path,...rest){return String(path).endsWith('/hybrid-runtime.json')?Buffer.from(JSON.stringify({profile:environment})):read.call(this,path,...rest);});syncBuiltinESMExports();
 try{
  for(const k of keys)delete process.env[k];Object.assign(process.env,{IILAS_DEMO_MODE:'cloud-demo',IILAS_DEMO_PROJECT_ID:project,GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project});config.deploymentGeneration='00000000-0000-4000-8000-000000000001';chain.deploymentGeneration=config.deploymentGeneration;
  const input=make(),prepared=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;onReceipt=()=>goodReceipt(prepared);onLookup=()=>prepared.digest;await call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)});const original=clone(rows.get('verificationRecords/'+prepared.referenceHash));
  config.deploymentGeneration='00000000-0000-4000-8000-000000000002';chain.deploymentGeneration=config.deploymentGeneration;calls.length=0;const result=await call('checkIntegrityRecord',make()),attempt=rows.get('integrityChecks/'+result.recordId);assert.equal(attempt.outcome,'Unavailable');assert.equal(attempt.failureCode,'DeploymentChanged');assert.equal(attempt.chain.deploymentGeneration,original.chain.deploymentGeneration);assert(!calls.includes('lookup'));assert.deepEqual(rows.get('verificationRecords/'+prepared.referenceHash),original);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
test('registration identity is rechecked after observation and cannot silently change',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;onReceipt=()=>goodReceipt(p);onLookup=()=>p.digest;await call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)});
 onLookup=()=>{rows.set('verificationRecords/'+p.referenceHash,{...rows.get('verificationRecords/'+p.referenceHash),chain:{...config,deploymentTransactionHash:'0x'+'7'.repeat(64)}});return p.digest;};const checked=await call('checkIntegrityRecord',make()),attempt=rows.get('integrityChecks/'+checked.recordId);assert.equal(attempt.outcome,'Unavailable');assert.equal(attempt.failureCode,'RegistrationChanged');
});
test('real Firestore Timestamp metadata does not prevent registration identity checks',async()=>{
 const input=make(),p=await call('prepareIntegrityRegistration',input);chain.blockNumber=11;onReceipt=()=>goodReceipt(p);onLookup=()=>p.digest;await call('registerIntegrityTransaction',{...input,transactionHash:'0x'+'5'.repeat(64)});withRegistrationTimestamp=true;
 const checked=await call('checkIntegrityRecord',make());assert.equal(rows.get('integrityChecks/'+checked.recordId).outcome,'Verified');
});
