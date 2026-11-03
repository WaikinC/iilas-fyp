import {test as baseTest, beforeEach, mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {createParcelAnalysisRetry} from '../lib/parcelAnalysisRetry.js';

// External doubles only: the real command dispatcher, access checks, validators
// and lifecycle run unchanged. Transactions enforce read-before-write and retry
// conflicts against independently committed document revisions.
let rows, revisions, storageReads, calls, clock, fetchWork, streamWork, metadataWork, retryOnce,readHook,orderedMaps;
let localModel=null;
const realNow=Date.now;
const test=(name,fn)=>baseTest(name,{timeout:2000},fn);
const hash=value=>createHash('sha256').update(value).digest('hex');
const bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
const pin={model:'MobileNetV2',intendedUse:'registered-photo',modelVersion:'a'.repeat(64),selectionSha256:'b'.repeat(64),evaluationSha256:'c'.repeat(64),acceptanceSha256:'d'.repeat(64),preprocessing:'rgb-224-unit',contrast:'none',classOrder:['Normal','Damaged']};
const acceptance={...pin};
const doc=path=>({path});
const put=(path,data)=>{rows.set(path,structuredClone(data));revisions.set(path,(revisions.get(path)||0)+1);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const db={doc,collection:kind=>({doc:key=>doc(`${kind}/${key}`)}),async runTransaction(work){
  for(let retry=0;retry<20;retry++){
    const view=new Map([...rows].map(([k,v])=>[k,structuredClone(v)])),versions=new Map(revisions),reads=new Set(),writes=[];
    const tx={async get(ref){assert.equal(writes.length,0,'Firestore forbids reads after writes');readHook?.(ref.path);reads.add(ref.path);const data=view.get(ref.path);return {exists:data!==undefined,data:()=>orderedMaps?sorted(data):structuredClone(data)};},
      set(ref,data){writes.push(['set',ref.path,data]);},create(ref,data){assert(!view.has(ref.path));writes.push(['set',ref.path,data]);},update(ref,data){assert(view.has(ref.path));writes.push(['set',ref.path,{...view.get(ref.path),...data}]);},delete(ref){writes.push(['delete',ref.path]);}};
    const result=await work(tx);
    if(retryOnce){retryOnce=false;continue;}
    if([...reads].some(key=>(versions.get(key)||0)!==(revisions.get(key)||0)))continue;
    for(const [op,key,value] of writes){if(op==='delete'){rows.delete(key);revisions.set(key,(revisions.get(key)||0)+1);}else put(key,value);}
    return result;
  }
  throw new Error('transaction retries exhausted');
}};
const require=createRequire(new URL('../backend/functions/service.mjs',import.meta.url));
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>db);
mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>clock);
mock.method(require('firebase-admin/auth'),'getAuth',()=>({getUser:async uid=>({uid,email:'fixture@example.test',emailVerified:true,disabled:false})}));
mock.method(require('firebase-admin/storage'),'getStorage',()=>({bucket:()=>({file:path=>({async getMetadata(){storageReads++;return [await metadataWork(path)];},createReadStream(){storageReads++;return streamWork(path);}})})}));
mock.module(new URL('../backend/functions/parcelAcceptance.mjs',import.meta.url).href,{namedExports:{parcelAcceptance:acceptance}});
mock.module(new URL('../backend/functions/parcelLocalEvaluation.mjs',import.meta.url).href,{namedExports:{selectParcelLocalEvaluationModel:()=>localModel&&structuredClone(localModel),isParcelLocalEvaluationModel:m=>m?.evaluationKind==='local-experimental',assertParcelLocalEvaluationAuthority(m){if(m&&(Object.hasOwn(m,'evaluationKind')||Object.hasOwn(m,'evaluationManifestSha256')||m.acceptanceSha256===null)&&(!localModel||JSON.stringify(sorted(m))!==JSON.stringify(sorted(localModel))))throw Object.assign(new Error('Local evaluation unavailable'),{code:'unavailable'});}}});
const {executeCommand}=await import('../backend/functions/service.mjs');
const command=(action,input,uid='staff')=>executeCommand({uid},{action,input,workspaceId:'scope'});
const start=(evidenceId='photo',operationId=randomUUID(),uid='staff')=>command('startParcelAnalysis',{evidenceId,operationId},uid);
const records=kind=>[...rows].filter(([key])=>key.startsWith(`${kind}/`)).map(([key,v])=>({id:key.split('/')[1],...v}));
const result=(changes={})=>({operationally_approved:true,humanReviewRequired:true,confidenceMeaning:'uncalibrated',...pin,evidenceSha256:hash(bytes),probabilities:[0.2,0.8],confidence:0.8,label:'Damaged',status:'predicted',requestId:'01234567-1234-4234-8234-0123456789ab',processingTimeMs:12,totalProcessingTimeMs:15,...changes});
const response=value=>new Response(JSON.stringify(value),{status:200});
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{
  localModel=null;
  rows=new Map();revisions=new Map();storageReads=0;calls=0;clock=100000;retryOnce=false;readHook=null;orderedMaps=false;
  Date.now=()=>clock;
  Object.keys(acceptance).forEach(key=>delete acceptance[key]);Object.assign(acceptance,pin);
  process.env.RESEARCH_API_URL='http://fixture.invalid';process.env.RESEARCH_API_TOKEN=randomUUID();
  put('system/config',{dataScopeId:'scope',version:1});
  for(const [uid,role] of [['staff','Warehouse'],['admin','Admin'],['driver','Driver'],['viewer','Viewer']])put(`users/${uid}`,{uid,status:'Approved',active:true,role,version:1});
  put('shipments/shipment',{ownerId:'scope',status:'Prepared',version:3});
  put('evidence/photo',{ownerId:'scope',shipmentId:'shipment',type:'Parcel Image',integrityVersion:2,stage:'Pre-dispatch',captureSource:'file',capturedAtClient:null,shipmentVersionAtRegistration:3,version:1,path:'evidence/scope/shipment/photo',bytes:bytes.length,contentType:'image/png',sha256:hash(bytes)});
  metadataWork=()=>({size:String(bytes.length),contentType:'image/png'});
  streamWork=()=>Readable.from([bytes]);fetchWork=async()=>response(result());
  globalThis.fetch=async(...args)=>{calls++;return fetchWork(...args);};
});

function enableLocal(){for(const k of Object.keys(acceptance))delete acceptance[k];const base={...pin};delete base.intendedUse;localModel={...base,acceptanceSha256:null,evaluationKind:'local-experimental',evaluationManifestSha256:'f'.repeat(64)};fetchWork=async()=>response(result({...localModel,intendedUse:'registered-photo',operationally_approved:false,evaluationOnly:true,runtimeMode:'local-evaluation'}));}
test('local false/null analysis persists reciprocal experimental prediction and human review',async()=>{enableLocal();const op=randomUUID(),out=await start('photo',op);assert.equal(out.state,'Predicted');assert.equal(out.model.acceptanceSha256,null);assert.equal(records('predictions')[0].evaluationKind,'local-experimental');assert.deepEqual(await start('photo',op),out);const reviewed=await command('reviewParcelAnalysis',{analysisId:out.analysisId,version:2,decision:'Accepted',notes:'Visible packaging inspected'},'admin');assert.equal(reviewed.model.evaluationKind,'local-experimental');assert.equal(reviewed.reviewStatus,'Accepted');});
test('disabled local capability rejects saved replay, resolve, linked review, abstention review and Blocked replay',async()=>{enableLocal();const op=randomUUID(),out=await start('photo',op),model=localModel;localModel=null;await assert.rejects(start('photo',op));await assert.rejects(command('resolveParcelAnalysis',{analysisId:out.analysisId}));await assert.rejects(command('reviewParcelAnalysis',{analysisId:out.analysisId,version:2,decision:'Accepted',notes:'Visible packaging inspected'},'admin'));assert.equal(records('predictions')[0].reviewStatus,'Pending');localModel=model;const entered=deferred(),gate=deferred();fetchWork=async()=>{entered.resolve();await gate.promise;return response(result({...model,intendedUse:'registered-photo',operationally_approved:false,evaluationOnly:true,runtimeMode:'local-evaluation'}));};const running=start();await entered.promise;const blockedOp=randomUUID();assert.equal((await start('photo',blockedOp)).state,'Busy');localModel=null;await assert.rejects(start('photo',blockedOp));gate.resolve();assert.equal((await running).state,'Stale');});
test('malformed parcel or experimental projection cannot use generic review fallback',async()=>{for(const p of [{kind:'parcel'},{kind:'parcel',evaluationKind:'local-experimental',acceptanceSha256:null},{kind:'inventory',evaluationManifestSha256:'f'.repeat(64)}]){put('predictions/malformed',{ownerId:'scope',version:1,reviewStatus:'Pending',...p});await assert.rejects(command('reviewPrediction',{id:'malformed',version:1,decision:'Accept',notes:'Visible face inspected'},'admin'));assert.equal(rows.get('predictions/malformed').reviewStatus,'Pending');}});
test('unlinked parcel Reject rejects each partial experimental wire marker without any mutation',async()=>{
  assert.equal(localModel,null);
  for(const marker of [{evaluationOnly:true},{runtimeMode:'local-evaluation'},{operationally_approved:false},{operationally_approved:true}]){
    const original={ownerId:'scope',kind:'parcel',recordId:'photo',label:'Normal',reviewStatus:'Pending',version:1,...marker};put('predictions/partial-marker',original);
    const auditBefore=records('auditLogs');
    await assert.rejects(command('reviewPrediction',{id:'partial-marker',version:1,decision:'Reject',notes:'Do not bypass experimental review'},'admin'));
    assert.deepEqual(rows.get('predictions/partial-marker'),original);assert.deepEqual(records('auditLogs'),auditBefore);
  }
});
async function orphanPhoto(select=enableLocal){
  select();let orphan;
  fetchWork=async()=>{orphan=new Map([...rows].map(([k,v])=>[k,structuredClone(v)]));throw new Error('Synthetic lost process');};
  await start();rows=orphan;revisions=new Map([...rows.keys()].map(k=>[k,1]));return records('parcelAnalyses')[0];
}
function enableSelectorOrderLocal(){
  enableLocal();const selected=localModel;
  // The real selector spreads sorted manifest bindings before safeModel copies
  // its fixed public field order. These maps are semantically identical.
  localModel={model:selected.model,evaluationSha256:selected.evaluationSha256,...selected};
}
for(const reorder of [false,true]){
  test(`photo model digest: healthy selector-order orphan cleanup is unchanged with recursive map sorting ${reorder}`,async()=>{
    const original=await orphanPhoto(enableSelectorOrderLocal);orderedMaps=reorder;
    const receipt=records('parcelAnalysisRequests')[0];
    assert.notEqual(JSON.stringify(receipt.model),JSON.stringify(original.model));assert.deepEqual(sorted(receipt.model),sorted(original.model));
    const before=structuredClone([...rows]),work=[storageReads,calls];
    assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId}),{released:false});
    assert.deepEqual([...rows],before);assert.deepEqual([storageReads,calls],work);
    assert.equal(receipt.pinHash,hash(JSON.stringify(sorted(original.model))));
    assert.equal(receipt.commandHash,hash(JSON.stringify({evidenceId:'photo',operationId:original.operationId})));
    assert.equal(receipt.receiptKey,hash(JSON.stringify(['scope','staff',original.operationId])));
  });
  for(const reason of ['authority loss','expiry'])test(`photo model digest: selector-order ${reason} releases only null outcome with recursive map sorting ${reorder}`,async()=>{
    const original=await orphanPhoto(enableSelectorOrderLocal);orderedMaps=reorder;
    const evidence=structuredClone(rows.get('evidence/photo')),work=[storageReads,calls];
    if(reason==='expiry')clock=original.expiresAt;else localModel=null;
    assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId}),{released:true});
    const saved=rows.get(`parcelAnalyses/${original.analysisId}`);assert.equal(saved.state,reason==='expiry'?'Expired':'Stale');
    for(const key of ['label','confidence','probabilities','predictionId'])assert.equal(saved[key],null);
    assert.equal(records('parcelAnalysisLocks').length,0);assert.equal(records('predictions').length,0);assert.deepEqual(rows.get('evidence/photo'),evidence);assert.deepEqual([storageReads,calls],work);
    assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId}),{released:true});
    if(reason==='authority loss'){
      await assert.rejects(start('photo',original.operationId),e=>e.code==='unavailable');
      await assert.rejects(command('resolveParcelAnalysis',{analysisId:original.analysisId}),e=>e.code==='unavailable');
      await assert.rejects(command('reviewParcelAnalysis',{analysisId:original.analysisId,version:2,decision:'Accepted',notes:'Old authority remains denied'},'admin'),e=>e.code==='unavailable');
    }
  });
  test(`photo model digest: normal completion survives reordered selector and recursive map sorting ${reorder}`,async()=>{
    enableSelectorOrderLocal();orderedMaps=reorder;
    fetchWork=async()=>{localModel=sorted(localModel);return response(result({...localModel,intendedUse:'registered-photo',operationally_approved:false,evaluationOnly:true,runtimeMode:'local-evaluation'}));};
    const saved=await start();assert.equal(saved.state,'Predicted');assert.equal(records('predictions').length,1);assert.equal(records('parcelAnalysisLocks').length,0);
    assert.equal(records('parcelAnalysisRequests')[0].pinHash,hash(JSON.stringify(sorted(saved.model))));
  });
}
test('photo model digest: recursive map sorting preserves null Unavailable completion',async()=>{
  delete acceptance.acceptanceSha256;orderedMaps=true;const saved=await start();
  assert.equal(saved.state,'Unavailable');assert.equal(saved.model,null);assert.equal(saved.label,null);assert.equal(records('parcelAnalysisRequests')[0].pinHash,null);assert.equal(records('parcelAnalysisLocks').length,0);assert.equal(storageReads,0);assert.equal(calls,0);
});
test('photo model digest: reordered descriptors still reject changed model or pin hash without mutation',async()=>{
  const original=await orphanPhoto(enableSelectorOrderLocal),pristine=structuredClone([...rows]),receipt=records('parcelAnalysisRequests')[0];orderedMaps=true;localModel=null;clock=original.expiresAt;
  for(const target of ['public model','receipt model','pin hash']){
    rows=new Map(structuredClone(pristine));revisions=new Map([...rows.keys()].map(k=>[k,1]));
    const path=target==='public model'?`parcelAnalyses/${original.analysisId}`:`parcelAnalysisRequests/${receipt.receiptKey}`,value=rows.get(path);
    put(path,target==='pin hash'?{...value,pinHash:'0'.repeat(64)}:{...value,model:{...value.model,modelVersion:'e'.repeat(64)}});
    const before=structuredClone([...rows]);await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId}));assert.deepEqual([...rows],before);assert.equal(records('parcelAnalysisLocks').length,1);
  }
});
test('expired orphaned experimental photo cleanup drains only its original lock after authority transition',async()=>{
  const original=await orphanPhoto(),evidence=structuredClone(rows.get('evidence/photo'));
  localModel={...localModel,evaluationManifestSha256:'e'.repeat(64)};clock=original.expiresAt;
  await assert.rejects(command('resolveParcelAnalysis',{analysisId:original.analysisId}));await assert.rejects(start());
  const before=[storageReads,calls];assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId}),{released:true});assert.deepEqual([storageReads,calls],before);
  assert.equal(records('parcelAnalysisLocks').length,0);assert.equal(rows.get(`parcelAnalyses/${original.analysisId}`).state,'Expired');assert.equal(rows.get(`parcelAnalyses/${original.analysisId}`).label,null);assert.deepEqual(rows.get('evidence/photo'),evidence);
  await assert.rejects(command('resolveParcelAnalysis',{analysisId:original.analysisId}),e=>e.code==='unavailable');await assert.rejects(start('photo',original.operationId),e=>e.code==='unavailable');await assert.rejects(command('reviewParcelAnalysis',{analysisId:original.analysisId,version:2,decision:'Accepted',notes:'Old authority still denied'},'admin'),e=>e.code==='unavailable');
  fetchWork=async()=>response(result({...localModel,intendedUse:'registered-photo',operationally_approved:false,evaluationOnly:true,runtimeMode:'local-evaluation'}));assert.equal((await start()).state,'Predicted');
});
test('Admin can close an exact stale orphan photo without restoring old authority',async()=>{const original=await orphanPhoto();localModel=null;assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId},'admin'),{released:true});assert.equal(rows.get(`parcelAnalyses/${original.analysisId}`).state,'Stale');assert.equal(records('parcelAnalysisLocks').length,0);});
test('reloaded four-ID Blocked photo intent recovers through its durable receipt after authority loss',async()=>{
  enableLocal();const oldModel=structuredClone(localModel),entered=deferred(),gate=deferred(),enteredC=deferred(),gateC=deferred(),opA=randomUUID(),opB=randomUUID(),opC=randomUUID(),context={scopeId:'scope',actorUid:'staff',evidenceId:'photo',stage:'Pre-dispatch'};
  const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};},storageA=memory(),storageB=memory(),sent=[];
  const dispatch=async(name,input)=>{sent.push({name,input:structuredClone(input)});return command(name,input);};
  fetchWork=async()=>{entered.resolve();await gate.promise;return response(result({...oldModel,intendedUse:'registered-photo',operationally_approved:false,evaluationOnly:true,runtimeMode:'local-evaluation'}));};
  try{const clientA=createParcelAnalysisRetry({storage:storageA,context,command:dispatch,createOperationId:()=>opA}),work=clientA.submit().then(value=>({value}),error=>({error}));await entered.promise;
  let clientB=createParcelAnalysisRetry({storage:storageB,context,command:dispatch,createOperationId:()=>opB});assert.equal((await clientB.submit()).state,'Busy');
  assert.deepEqual(JSON.parse([...storageB.data.values()][0]),{scopeId:'scope',actorUid:'staff',evidenceId:'photo',operationId:opB});
  clientB=createParcelAnalysisRetry({storage:storageB,context,command:dispatch,createOperationId:()=>opC});const original=records('parcelAnalyses')[0];localModel={...localModel,evaluationManifestSha256:'e'.repeat(64)};clock=original.expiresAt;
  await assert.rejects(clientB.check());assert.equal(clientB.pending().operationId,opB);const startsBefore=sent.filter(s=>s.name==='startParcelAnalysis').length;
  assert.deepEqual(await clientB.cleanup(original),{released:true,recoveryComplete:true});assert.equal(clientB.pending(),null);assert.equal(records('parcelAnalysisLocks').length,0);assert.equal(sent.filter(s=>s.name==='startParcelAnalysis').length,startsBefore);assert.deepEqual(sent.at(-1),{name:'cleanupParcelAnalysis',input:{analysisId:original.analysisId,pendingOperationId:opB}});
  await assert.rejects(start('photo',opB),e=>e.code==='unavailable');await assert.rejects(command('resolveParcelAnalysis',{analysisId:original.analysisId}),e=>e.code==='unavailable');await assert.rejects(command('reviewParcelAnalysis',{analysisId:original.analysisId,version:2,decision:'Accepted',notes:'Old authority remains denied'},'admin'),e=>e.code==='unavailable');
  gate.resolve();assert((await work).error);fetchWork=async()=>{enteredC.resolve();await gateC.promise;return response(result({...localModel,intendedUse:'registered-photo',operationally_approved:false,evaluationOnly:true,runtimeMode:'local-evaluation'}));};const next=clientB.submit();await enteredC.promise;const successor=records('parcelAnalysisLocks')[0];await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId,pendingOperationId:opC}));assert.equal(clientB.pending().operationId,opC);assert.deepEqual(records('parcelAnalysisLocks')[0],successor);gateC.resolve();assert.equal((await next).state,'Predicted');}finally{gate.resolve();gateC.resolve();}
});
test('pending photo operation association rejects unknown/unrelated or malformed Blocked receipts before release',async()=>{
  const original=await orphanPhoto(),opB=randomUUID();assert.equal((await start('photo',opB)).state,'Busy');const key=hash(JSON.stringify(['scope','staff',opB])),path=`parcelAnalysisRequests/${key}`,blocked=structuredClone(rows.get(path));localModel=null;
  for(const operationId of [randomUUID(),original.operationId]){const caller=operationId===original.operationId?'admin':'staff';await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId,pendingOperationId:operationId},caller));assert.equal(rows.get(`parcelAnalyses/${original.analysisId}`).state,'Running');}
  for(const patch of [{ownerId:'other'},{actorUid:'other'},{evidenceId:'other'},{operationId:randomUUID()},{analysisId:'other'},{commandHash:'b'.repeat(64)},{state:'Running'},{extra:true}]){put(path,{...blocked,...patch});await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId,pendingOperationId:opB}));assert.equal(rows.get(`parcelAnalyses/${original.analysisId}`).state,'Running');assert.equal(records('parcelAnalysisLocks').length,1);}put(path,blocked);
  assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId,pendingOperationId:opB}),{released:true});assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId,pendingOperationId:opB}),{released:true});
});
test('matching original pending operation can use receipt-only cleanup without a Blocked receipt',async()=>{const original=await orphanPhoto();localModel=null;assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId,pendingOperationId:original.operationId}),{released:true});assert.equal(records('parcelAnalysisLocks').length,0);});
test('photo null cleanup retains actor, scope, receipt/model/context and nonce fences with strict acknowledgement',async()=>{
  const original=await orphanPhoto();assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId}),{released:false});
  localModel=null;put('users/other',{uid:'other',role:'Warehouse',status:'Approved',active:true,version:1});await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId},'other'));
  await assert.rejects(executeCommand({uid:'staff'},{action:'cleanupParcelAnalysis',input:{analysisId:original.analysisId},workspaceId:'wrong-scope'}));
  await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId,evaluationKind:'local-experimental'}));
  const lock=records('parcelAnalysisLocks')[0],path=`parcelAnalysisLocks/${hash(JSON.stringify(['scope','photo']))}`;put(path,{...lock,nonce:randomUUID()});await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId},'admin'));assert.equal(rows.get(`parcelAnalyses/${original.analysisId}`).state,'Running');put(path,lock);
  const receipt=records('parcelAnalysisRequests').find(r=>r.analysisId===original.analysisId),receiptPath=`parcelAnalysisRequests/${receipt.receiptKey}`;put(receiptPath,{...receipt,model:{...receipt.model,evaluationManifestSha256:'b'.repeat(64)}});await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId},'admin'));put(receiptPath,receipt);
  put(receiptPath,{...receipt,snapshot:{...receipt.snapshot,evidence:{...receipt.snapshot.evidence,shipmentId:'other'}}});await assert.rejects(command('cleanupParcelAnalysis',{analysisId:original.analysisId},'admin'));put(receiptPath,receipt);
  put('users/manager',{uid:'manager',role:'Manager',status:'Approved',active:true,version:1});assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId},'manager'),{released:true});assert.equal(rows.get(`parcelAnalyses/${original.analysisId}`).state,'Stale');assert.deepEqual(await command('cleanupParcelAnalysis',{analysisId:original.analysisId},'admin'),{released:true});
});

test('no pin saves truthful Unavailable without Storage/HTTP, exact replay survives stage/role change',async()=>{
  delete acceptance.acceptanceSha256;const operationId=randomUUID();
  const saved=await start('photo',operationId);assert.equal(saved.state,'Unavailable');assert.equal(saved.reasonCode,'model-unavailable');assert.equal(saved.label,null);assert.equal(saved.model,null);assert.equal(storageReads,0);assert.equal(calls,0);
  put('users/staff',{...rows.get('users/staff'),role:'Viewer',version:2});put('shipments/shipment',{...rows.get('shipments/shipment'),status:'Dispatched',version:4});
  assert.deepEqual(await start('photo',operationId),saved);assert.equal(records('parcelAnalyses').length,1);
  await assert.rejects(start('other',operationId),/different|operation/i);
  assert.equal((await command('resolveParcelAnalysis',{analysisId:saved.analysisId},'viewer')).state,'Unavailable');
});
test('strict schemas, fixed scope, current approval and legacy parcel bypass reject',async()=>{
  await assert.rejects(command('startParcelAnalysis',{evidenceId:'photo',operationId:randomUUID(),label:'Normal'}));
  await assert.rejects(start('photo','not-a-uuid'));
  await assert.rejects(start('photo',randomUUID(),'viewer'));
  await assert.rejects(executeCommand({uid:'staff'},{action:'startParcelAnalysis',input:{evidenceId:'photo',operationId:randomUUID()},workspaceId:'foreign'}));
  await assert.rejects(command('predict',{kind:'parcel',id:'photo'}),/parcel.*workflow|evidence.*analysis/i);
  put('users/staff',{...rows.get('users/staff'),active:false});await assert.rejects(start());assert.equal(records('parcelAnalyses').length,0);
});
test('concurrent same operation and transaction retry make one remote call and one atomic projection/audit',async()=>{
  retryOnce=true;const gate=deferred(),entered=deferred();fetchWork=async()=>{entered.resolve();await gate.promise;return response(result());};const operationId=randomUUID();
  const first=start('photo',operationId);await entered.promise;const replay=await start('photo',operationId);assert.equal(replay.state,'Running');gate.resolve();
  const saved=await first;assert.equal(saved.state,'Predicted');assert.equal(saved.label,'Damaged');assert.equal(saved.predictionId,`parcel-${saved.analysisId}`);assert.equal(calls,1);
  const prediction=rows.get(`predictions/${saved.predictionId}`);assert.equal(prediction.analysisId,saved.analysisId);assert.equal(prediction.evidenceSha256,hash(bytes));assert.equal(prediction.reviewStatus,'Pending');assert.equal(records('predictions').length,1);assert.equal(records('auditLogs').length,1);assert.equal(records('parcelAnalysisLocks').length,0);
  assert.deepEqual(await start('photo',operationId),saved);
});
test('six simultaneous first submissions retry conflicting claims without duplicate inference',async()=>{
  const operationId=randomUUID(),saved=await Promise.all(Array.from({length:6},()=>start('photo',operationId)));
  assert.equal(calls,1);assert.equal(records('parcelAnalyses').length,1);assert.equal(records('predictions').length,1);assert.equal(records('auditLogs').length,1);assert.equal(new Set(saved.map(row=>row.analysisId)).size,1);
});
test('Firestore map ordering cannot change equal snapshot/model identity across claim, completion and replay',async()=>{
  orderedMaps=true;const operationId=randomUUID(),saved=await start('photo',operationId);assert.equal(saved.state,'Predicted');assert.equal(calls,1);assert.deepEqual(await start('photo',operationId),saved);
});
test('Blocked receipt forever replays its fixed Busy reference after terminal blocker and role change',async()=>{
  const gate=deferred(),entered=deferred();fetchWork=async()=>{entered.resolve();await gate.promise;return response(result());};
  const first=start();await entered.promise;const op=randomUUID(),busy=await start('photo',op);assert.equal(busy.state,'Busy');assert.equal(busy.reasonCode,'evidence-busy');assert.deepEqual(Object.keys(busy).sort(),['analysisId','reasonCode','state']);
  gate.resolve();const terminal=await first;put('users/staff',{...rows.get('users/staff'),role:'Viewer',version:2});assert.deepEqual(await start('photo',op),busy);assert.equal(calls,1);assert.equal(records('parcelAnalyses').length,1);assert.equal((await command('resolveParcelAnalysis',{analysisId:busy.analysisId})).analysisId,terminal.analysisId);
});
test('Abstained is reviewed with notes only and never creates a labelled projection',async()=>{
  fetchWork=async()=>response(result({status:'abstained',label:null,probabilities:[0.5,0.5],confidence:0.5}));const saved=await start();assert.equal(saved.state,'Abstained');assert.equal(saved.label,null);assert.equal(saved.humanReviewRequired,true);assert.equal(records('predictions').length,0);
  const reviewed=await command('reviewParcelAnalysis',{analysisId:saved.analysisId,version:2,decision:'Reviewed',notes:'Inspected image manually'},'admin');assert.equal(reviewed.reviewStatus,'Reviewed');assert.equal(reviewed.label,null);assert.equal(records('predictions').length,0);
  await assert.rejects(command('reviewParcelAnalysis',{analysisId:saved.analysisId,version:2,decision:'Reviewed',notes:'Again inspected'},'admin'));
});
test('Predicted review atomically validates reciprocal provenance and preserves old unlinked review',async()=>{
  const saved=await start(),input={id:saved.predictionId,version:1,decision:'Accept',notes:'Visible condition reviewed'};
  const prediction=rows.get(`predictions/${saved.predictionId}`);put(`predictions/${saved.predictionId}`,{...prediction,evidenceSha256:'f'.repeat(64)});await assert.rejects(command('reviewPrediction',input,'admin'));assert.equal(rows.get(`parcelAnalyses/${saved.analysisId}`).reviewStatus,'Pending');
  put(`predictions/${saved.predictionId}`,prediction);await command('reviewPrediction',input,'admin');assert.equal(rows.get(`parcelAnalyses/${saved.analysisId}`).reviewStatus,'Accepted');assert.equal(rows.get(`parcelAnalyses/${saved.analysisId}`).version,3);assert.equal(rows.get(`predictions/${saved.predictionId}`).version,2);
  put('predictions/old',{ownerId:'scope',kind:'parcel',recordId:'photo',label:'Normal',reviewStatus:'Pending',version:1});await command('reviewPrediction',{id:'old',version:1,decision:'Reject',notes:'Old result reviewed'},'admin');assert.equal(rows.get('predictions/old').reviewStatus,'Rejected');
});
for(const change of ['account-version','shipment-version','evidence-hash','plan-presence','model-pin','access'])test(`completion fences ${change} without inferred output`,async()=>{
  fetchWork=async()=>{
    if(change==='account-version')put('users/staff',{...rows.get('users/staff'),version:2});
    if(change==='shipment-version')put('shipments/shipment',{...rows.get('shipments/shipment'),version:4});
    if(change==='evidence-hash')put('evidence/photo',{...rows.get('evidence/photo'),sha256:'f'.repeat(64)});
    if(change==='plan-presence')put('transportPlans/shipment',{ownerId:'scope',driverUid:'driver',version:1});
    if(change==='model-pin')acceptance.acceptanceSha256='e'.repeat(64);
    if(change==='access')put('users/staff',{...rows.get('users/staff'),active:false,version:2});
    return response(result());
  };
  let saved;try{saved=await start();}catch(error){assert.equal(change,'access');assert.equal(error.code,'permission-denied');saved=records('parcelAnalyses')[0];}
  assert.equal(saved.state,'Stale');assert.equal(saved.label,null);assert.equal(saved.probabilities,null);assert.equal(records('predictions').length,0);assert.equal(records('parcelAnalysisLocks').length,0);
});
test('exact expiry resolves across roles and late predecessor cannot release successor lock',async()=>{
  const entered=deferred(),gate=deferred();fetchWork=async()=>{entered.resolve();await gate.promise;return response(result());};const first=start();await entered.promise;
  const running=records('parcelAnalyses')[0];clock=running.expiresAt-1;assert.equal((await command('resolveParcelAnalysis',{analysisId:running.analysisId},'viewer')).state,'Running');clock++;
  const expired=await command('resolveParcelAnalysis',{analysisId:running.analysisId},'viewer');assert.equal(expired.state,'Expired');assert.equal(records('parcelAnalysisLocks').length,0);
  const successorGate=deferred(),successorEntered=deferred();fetchWork=async()=>{successorEntered.resolve();await successorGate.promise;return response(result());};const successor=start();await successorEntered.promise;const lock=records('parcelAnalysisLocks')[0];gate.resolve();assert.equal((await first).state,'Expired');assert.deepEqual(records('parcelAnalysisLocks')[0],lock);successorGate.resolve();assert.equal((await successor).state,'Predicted');
});
test('Driver delivery requires assignment while historical resolve survives reassignment',async()=>{
  put('shipments/shipment',{ownerId:'scope',status:'Dispatched',version:4});put('evidence/photo',{...rows.get('evidence/photo'),stage:'Delivery'});put('transportPlans/shipment',{ownerId:'scope',driverUid:'other',version:1});await assert.rejects(start('photo',randomUUID(),'driver'));
  put('transportPlans/shipment',{ownerId:'scope',driverUid:'driver',version:2});const saved=await start('photo',randomUUID(),'driver');put('transportPlans/shipment',{ownerId:'scope',driverUid:'other',version:3});assert.equal((await command('resolveParcelAnalysis',{analysisId:saved.analysisId},'driver')).state,'Predicted');
});
test('terminal prediction resolves fail closed if projection or original audit is missing or corrupt',async()=>{
  const saved=await start(),path=`predictions/${saved.predictionId}`,original=rows.get(path);
  rows.delete(path);await assert.rejects(command('resolveParcelAnalysis',{analysisId:saved.analysisId},'viewer'));
  put(path,{...original,analysisId:'different'});await assert.rejects(command('resolveParcelAnalysis',{analysisId:saved.analysisId},'viewer'));
  put(path,original);rows.delete(`auditLogs/predictions_${saved.predictionId}_1`);await assert.rejects(command('resolveParcelAnalysis',{analysisId:saved.analysisId},'viewer'));
});
test('cleanup terminalises only original claim when access is revoked and cannot delete a successor lock',async()=>{
  let successor;
  fetchWork=async()=>{const lock=records('parcelAnalysisLocks')[0];successor={...lock,analysisId:randomUUID(),nonce:randomUUID()};put(`parcelAnalysisLocks/${lock.id}`,successor);put('users/staff',{...rows.get('users/staff'),active:false,version:2});return response(result());};
  await assert.rejects(start(),{code:'permission-denied'});assert.equal(records('parcelAnalyses')[0].state,'Stale');assert.equal(records('parcelAnalyses')[0].label,null);assert.deepEqual(records('parcelAnalysisLocks')[0],successor);
});
test('fifty-second overall budget fences a result even when individual operations return on time',async()=>{
  metadataWork=()=>{clock+=9000;return {size:String(bytes.length),contentType:'image/png'};};
  fetchWork=async()=>{clock+=41000;return response(result());};const saved=await start();assert.equal(saved.state,'Failed');assert.equal(saved.reasonCode,'time-limit');assert.equal(saved.label,null);assert.equal(records('predictions').length,0);
});
test('lease boundary crossed during final transaction reads cannot publish a late label',async()=>{
  fetchWork=async()=>{readHook=path=>{if(path==='transportPlans/shipment')clock=190000;};return response(result());};
  const saved=await start();assert.equal(saved.state,'Expired');assert.equal(saved.label,null);assert.equal(records('predictions').length,0);
});
test('changed receipt identity cannot inherit a committed claim or publish its model output',async()=>{
  fetchWork=async()=>{const receipt=records('parcelAnalysisRequests')[0],record=rows.get(`parcelAnalyses/${receipt.analysisId}`);put(`parcelAnalysisRequests/${receipt.id}`,{...receipt,actorUid:'admin'});put(`parcelAnalyses/${receipt.analysisId}`,{...record,actorUid:'admin'});return response(result());};
  const saved=await start();assert.notEqual(saved.state,'Predicted');assert.equal(saved.label,null);assert.equal(records('predictions').length,0);
});
test('dedicated Predicted review returns exactly the atomically saved DTO after delayed transaction reads',async()=>{
  const saved=await start();readHook=path=>{if(path.endsWith('_2'))clock++;};
  const changed=await command('reviewParcelAnalysis',{analysisId:saved.analysisId,version:2,decision:'Rejected',notes:'Image assessment reviewed'},'admin');assert.deepEqual(changed,rows.get(`parcelAnalyses/${saved.analysisId}`));
});
for(const phase of ['metadata','storage-stream','http-headers','http-body'])test(`hard deadline closes stalled ${phase} and persists safe failure`,async()=>{
  const entered=deferred();let destroyed=false,cancelled=false;
  mock.timers.enable({apis:['setTimeout']});
  try{
    if(phase==='metadata')metadataWork=()=>{entered.resolve();return new Promise(()=>{});};
    if(phase==='storage-stream')streamWork=()=>{const stream=new Readable({read(){entered.resolve();}});stream.on('close',()=>{destroyed=true;});return stream;};
    if(phase==='http-headers')fetchWork=async(_url,options)=>{options.signal.addEventListener('abort',()=>{cancelled=true;});entered.resolve();return new Promise(()=>{});};
    if(phase==='http-body')fetchWork=async()=>new Response(new ReadableStream({pull(){entered.resolve();},cancel(){cancelled=true;}}));
    const pending=start();await entered.promise;mock.timers.tick(phase.startsWith('http')?30000:10000);const saved=await pending;
    assert.equal(saved.state,'Failed');assert.equal(saved.reasonCode,'time-limit');assert.equal(saved.label,null);assert.equal(records('parcelAnalysisLocks').length,0);
    if(phase==='storage-stream'){await new Promise(resolve=>setImmediate(resolve));assert.equal(destroyed,true);}
    if(phase.startsWith('http'))assert.equal(cancelled,true);
  }finally{mock.timers.reset();}
});
for(const corruption of ['hash','length','type','oversize','model','class-order','acceptance','sparse-scores','body-size','invalid-json','http-busy','http-failed','stream-error','fetch-error'])test(`safe null outcome for ${corruption}`,async()=>{
  if(corruption==='hash')streamWork=()=>Readable.from([Buffer.alloc(bytes.length)]);
  if(corruption==='length')streamWork=()=>Readable.from([bytes.subarray(1)]);
  if(corruption==='type')metadataWork=()=>({size:String(bytes.length),contentType:'application/pdf'});
  if(corruption==='oversize')streamWork=()=>Readable.from([Buffer.alloc(10*1024*1024+1)]);
  if(corruption==='model')fetchWork=async()=>response(result({modelVersion:'e'.repeat(64)}));
  if(corruption==='class-order')fetchWork=async()=>response(result({classOrder:['Damaged','Normal']}));
  if(corruption==='acceptance')fetchWork=async()=>response(result({acceptanceSha256:'e'.repeat(64)}));
  if(corruption==='sparse-scores')fetchWork=async()=>response(result({probabilities:[null,null]}));
  if(corruption==='body-size')fetchWork=async()=>new Response('x'.repeat(16385));
  if(corruption==='invalid-json')fetchWork=async()=>new Response('private secret path');
  if(corruption==='http-busy')fetchWork=async()=>new Response('private',{status:429});
  if(corruption==='http-failed')fetchWork=async()=>new Response('private',{status:500});
  if(corruption==='stream-error')streamWork=()=>Readable.from((async function*(){throw new Error('private path token');})());
  if(corruption==='fetch-error')fetchWork=async()=>{throw new Error('private token url');};
  const saved=await start();assert(['Unavailable','Failed'].includes(saved.state));assert.equal(saved.label,null);assert.equal(saved.probabilities,null);assert.equal(records('predictions').length,0);assert(!JSON.stringify(saved).includes('private'));assert.equal(records('parcelAnalysisLocks').length,0);
});

process.on('exit',()=>{Date.now=realNow;});
