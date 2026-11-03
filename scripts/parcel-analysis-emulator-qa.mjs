// Existing loopback services only; this script never starts/stops emulators.
// node --experimental-test-module-mocks scripts/parcel-analysis-emulator-qa.mjs
// The accepted-model worker is a fresh process: no cached production imports,
// runtime acceptance flag, model files, datasets or production service access.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {mock} from 'node:test';
import config from '../firebase-config.json' with {type:'json'};

for(const [key,value] of Object.entries({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'})){
  assert(!process.env[key]||process.env[key]===value,`Refusing nonconfigured ${key}`);process.env[key]=value;
}
const require=createRequire(new URL('../backend/functions/service.mjs',import.meta.url));
const adminApp=require('firebase-admin/app'),adminStore=require('firebase-admin/firestore');
const app=adminApp.initializeApp({projectId:config.projectId});
const db=adminStore.getFirestore(app);
const scope=(await db.doc('system/config').get()).data()?.dataScopeId;
assert(scope,'The existing shared-system emulator must already be initialized.');
const root=new URL('../outputs/parcel-photo-outcomes-20261021/',import.meta.url);
await mkdir(root,{recursive:true});
const worker=process.argv.includes('--worker');
const records=[],fixtures=[],accounts=[],operations=[];
const hash=value=>createHash('sha256').update(value).digest('hex');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const digest=hash(image),realNow=Date.now;
let clock=null,checks=0;
const put=async(path,value)=>{await db.doc(path).set(value);return path;};
const read=async path=>(await db.doc(path).get()).data();
const receiptKey=(actor,operationId)=>hash(JSON.stringify([scope,actor,operationId]));
const lockKey=evidence=>hash(JSON.stringify([scope,evidence]));
const lock=f=>read(`parcelAnalysisLocks/${lockKey(f.photo)}`);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function check(name,work){
  const started=realNow();await work();checks++;records.push({name,passed:true,durationMs:realNow()-started});console.log(`PASS ${name}`);
}
async function denied(work){await assert.rejects(work,error=>/permission-denied|not-found|failed-precondition|unavailable/.test(error.code||''));}
async function fixture({role='Warehouse',status='Prepared',plan=false,stage=status==='Prepared'?'Pre-dispatch':'Delivery'}={}){
  const base=`photo-qa-${randomUUID()}`;
  const f={base,actor:`${base}-actor`,reviewer:`${base}-manager`,viewer:`${base}-viewer`,photo:`${base}-image`,shipment:`${base}-shipment`,references:[]};
  fixtures.push(f);
  for(const [uid,userRole]of [[f.actor,role],[f.reviewer,'Manager'],[f.viewer,'Viewer']]){
    f.references.push(await put(`users/${uid}`,{uid,role:userRole,status:'Approved',active:true,version:1}));
  }
  f.references.push(await put(`shipments/${f.shipment}`,{ownerId:scope,status,version:7,reference:base,items:[],parcelCount:1,packed:true}));
  f.references.push(await put(`evidence/${f.photo}`,{ownerId:scope,shipmentId:f.shipment,type:'Parcel Image',integrityVersion:2,stage,captureSource:'file',capturedAtClient:null,shipmentVersionAtRegistration:7,version:1,path:`evidence/${scope}/${f.shipment}/${f.photo}`,bytes:image.length,contentType:'image/png',sha256:digest}));
  f.references.push(`transportPlans/${f.shipment}`);
  if(plan)await put(`transportPlans/${f.shipment}`,{ownerId:scope,shipmentId:f.shipment,driverUid:f.actor,version:1});
  return f;
}
async function ownedRows(f,kind){
  const found=new Map();
  // In HTTP mode f.reviewer is the retained primary Admin. Never query/clean
  // that actor's existing records; only generated identities belong to us.
  const actors=[f.actor,f.reviewer].filter(actor=>actor.startsWith('photo-qa-')||accounts.includes(actor));
  for(const field of ['actor','actorUid'])for(const actor of actors){
    const result=await db.collection(kind).where(field,'==',actor).get();for(const row of result.docs)found.set(row.id,row);
  }
  return [...found.values()];
}
async function clean(){
  Date.now=realNow;
  for(const f of fixtures){
    const refs=new Map(f.references.map(path=>[path,db.doc(path)]));
    for(const kind of ['parcelAnalyses','parcelAnalysisRequests','predictions','auditLogs'])for(const row of await ownedRows(f,kind))refs.set(row.ref.path,row.ref);
    refs.set(`parcelAnalysisLocks/${lockKey(f.photo)}`,db.doc(`parcelAnalysisLocks/${lockKey(f.photo)}`));
    for(const op of operations.filter(op=>op.actor===f.actor))refs.set(`parcelAnalysisRequests/${receiptKey(op.actor,op.operationId)}`,db.doc(`parcelAnalysisRequests/${receiptKey(op.actor,op.operationId)}`));
    for(const ref of refs.values())await ref.delete();
  }
}

async function acceptedWorker(){
  const pin={model:'MobileNetV2',intendedUse:'registered-photo',modelVersion:'a'.repeat(64),selectionSha256:'b'.repeat(64),evaluationSha256:'c'.repeat(64),acceptanceSha256:'d'.repeat(64),preprocessing:'synthetic-rgb224',contrast:'none',classOrder:['Normal','Damaged']};
  const acceptance={...pin,classOrder:[...pin.classOrder]};
  let storageReads=0,fetches=0,fetchWork,streamWork=()=>Readable.from([image]),metadataWork=()=>({size:String(image.length),contentType:'image/png'});
  mock.module(new URL('../backend/functions/parcelAcceptance.mjs',import.meta.url).href,{namedExports:{parcelAcceptance:acceptance}});
  mock.method(require('firebase-admin/storage'),'getStorage',()=>({bucket:()=>({file:()=>({getMetadata:async()=>{storageReads++;return [metadataWork()];},createReadStream:()=>{storageReads++;return streamWork();}})})}));
  // All Firestore calls and transactions below use the real Admin SDK.
  const {executeCommand}=await import('../backend/functions/service.mjs');
  const command=(f,action,input,uid=f.actor)=>executeCommand({uid},{action,input,workspaceId:scope});
  const start=(f,operationId=randomUUID())=>{operations.push({actor:f.actor,operationId});return command(f,'startParcelAnalysis',{evidenceId:f.photo,operationId});};
  const resolve=(f,id,uid=f.viewer)=>command(f,'resolveParcelAnalysis',{analysisId:id},uid);
  const result=(changes={})=>({operationally_approved:true,humanReviewRequired:true,confidenceMeaning:'uncalibrated',...pin,evidenceSha256:digest,probabilities:[0.2,0.8],confidence:0.8,label:'Damaged',status:'predicted',requestId:randomUUID(),processingTimeMs:12,totalProcessingTimeMs:15,...changes});
  const response=changes=>new Response(JSON.stringify(result(changes)),{status:200});
  fetchWork=async()=>response();
  mock.method(globalThis,'fetch',async(...args)=>{fetches++;return fetchWork(...args);});
  Date.now=()=>clock??realNow();
  process.env.RESEARCH_API_URL='http://127.0.0.1:1';process.env.RESEARCH_API_TOKEN=randomUUID();
  const delay=()=>{const gate=deferred(),entered=deferred();fetchWork=async()=>{entered.resolve();await gate.promise;return response();};return {gate,entered};};
  const entered=(d,pending)=>Promise.race([d.entered.promise,pending.then(()=>{throw new Error('Claim completed before reaching the expected delayed HTTP double.');})]);
  const reset=()=>{clock=null;Object.assign(acceptance,pin);fetchWork=async()=>response();streamWork=()=>Readable.from([image]);metadataWork=()=>({size:String(image.length),contentType:'image/png'});};
  await check('real transaction contention: same operation produces one remote call, projection and audit',async()=>{
    const f=await fixture(),d=delay(),operationId=randomUUID(),before=fetches;
    const simultaneous=Array.from({length:6},()=>start(f,operationId));await entered(d,Promise.all(simultaneous));
    const replays=await Promise.all(Array.from({length:5},()=>start(f,operationId)));
    assert(replays.every(row=>row.state==='Running'&&row.analysisId===replays[0].analysisId));
    d.gate.resolve();const outcomes=await Promise.all(simultaneous),saved=outcomes.find(row=>row.state==='Predicted');assert(saved);assert(outcomes.every(row=>row.analysisId===saved.analysisId));
    assert.equal(saved.state,'Predicted');assert.equal(saved.label,'Damaged');assert.equal(fetches-before,1);
    assert.deepEqual(await start(f,operationId),saved);
    const projections=await ownedRows(f,'predictions'),audits=await ownedRows(f,'auditLogs');
    assert.equal(projections.length,1);assert.equal(audits.length,1);assert.equal(projections[0].id,`parcel-${saved.analysisId}`);assert.equal(projections[0].data().analysisId,saved.analysisId);assert.equal(projections[0].data().reviewStatus,'Pending');assert.equal(await lock(f),undefined);
    await assert.rejects(command(f,'startParcelAnalysis',{evidenceId:`${f.photo}-different`,operationId}));
    // Simulated lost HTTP response: only the saved IDs are retained.
    assert.deepEqual(await resolve(f,saved.analysisId),saved);reset();
  });
  await check('concurrent distinct operations persist immutable Blocked replay after terminal blocker/reload',async()=>{
    const f=await fixture(),d=delay(),first=start(f);await entered(d,first);const before=fetches;
    const ids=Array.from({length:4},()=>randomUUID());
    const busy=await Promise.all(ids.map(op=>start(f,op)));
    for(const row of busy){assert.deepEqual(Object.keys(row).sort(),['analysisId','reasonCode','state']);assert.equal(row.state,'Busy');assert.equal(row.reasonCode,'evidence-busy');}
    const receipts=await Promise.all(ids.map(op=>read(`parcelAnalysisRequests/${receiptKey(f.actor,op)}`)));
    for(const receipt of receipts){assert.equal(receipt.state,'Blocked');for(const field of ['nonce','expiresAt','lease'])assert.equal(Object.hasOwn(receipt,field),false);}
    d.gate.resolve();const saved=await first;
    await db.doc(`users/${f.actor}`).update({role:'Viewer',version:2});await db.doc(`shipments/${f.shipment}`).update({status:'Dispatched',version:8});
    for(let i=0;i<ids.length;i++)assert.deepEqual(await start(f,ids[i]),busy[i]);
    assert.deepEqual(await Promise.all(ids.map(op=>read(`parcelAnalysisRequests/${receiptKey(f.actor,op)}`))),receipts);
    assert.equal((await resolve(f,busy[0].analysisId)).analysisId,saved.analysisId);assert.equal(fetches,before);assert.equal((await ownedRows(f,'parcelAnalyses')).length,1);reset();
  });
  await check('expiry is exact at 90 seconds and late predecessor preserves successor lock',async()=>{
    const f=await fixture(),d=delay(),first=start(f);await entered(d,first);
    const running=(await ownedRows(f,'parcelAnalyses'))[0].data();assert.equal(running.expiresAt-running.createdAt,90000);
    clock=running.expiresAt-1;assert.equal((await resolve(f,running.analysisId)).state,'Running');
    clock++;const results=await Promise.all([resolve(f,running.analysisId),resolve(f,running.analysisId)]);assert(results.every(row=>row.state==='Expired'));
    const successorDelay=delay(),successor=start(f);await entered(successorDelay,successor);const successorLock=await lock(f);
    assert.notEqual(successorLock.analysisId,running.analysisId);d.gate.resolve();assert.equal((await first).state,'Expired');assert.deepEqual(await lock(f),successorLock);
    successorDelay.gate.resolve();assert.equal((await successor).state,'Predicted');assert.equal((await ownedRows(f,'predictions')).length,1);reset();
  });
  await check('expiry and completion race has one immutable terminal outcome',async()=>{
    const f=await fixture(),d=delay(),first=start(f);await entered(d,first);const running=(await ownedRows(f,'parcelAnalyses'))[0].data();clock=running.expiresAt;d.gate.resolve();
    const [completed,recovered]=await Promise.all([first,resolve(f,running.analysisId)]);assert.equal(completed.state,'Expired');assert.equal(recovered.state,'Expired');assert.equal((await ownedRows(f,'predictions')).length,0);assert.equal(await lock(f),undefined);reset();
  });
  const mutations=[
    ['account version',async f=>db.doc(`users/${f.actor}`).update({version:2})],
    ['role changed and restored with newer version',async f=>{await db.doc(`users/${f.actor}`).update({role:'Viewer',version:2});await db.doc(`users/${f.actor}`).update({role:'Warehouse',version:3});}],
    ['approval revoked',async f=>db.doc(`users/${f.actor}`).update({status:'Rejected',active:false,version:2})],
    ['account disabled',async f=>db.doc(`users/${f.actor}`).update({active:false,status:'Disabled',version:2})],
    ['shipment status',async f=>db.doc(`shipments/${f.shipment}`).update({status:'Dispatched',version:8})],
    ['shipment version',async f=>db.doc(`shipments/${f.shipment}`).update({version:8})],
    ['evidence version',async f=>db.doc(`evidence/${f.photo}`).update({version:2})],
    ['evidence hash',async f=>db.doc(`evidence/${f.photo}`).update({sha256:'e'.repeat(64)})],
    ['plan absent becomes present',async f=>put(`transportPlans/${f.shipment}`,{ownerId:scope,driverUid:f.actor,version:1})],
    ['plan present becomes absent',async f=>db.doc(`transportPlans/${f.shipment}`).delete(),{plan:true}],
    ['plan version',async f=>db.doc(`transportPlans/${f.shipment}`).update({version:2}),{plan:true}],
    ['Driver reassigned and restored with newer plan',async f=>{await db.doc(`transportPlans/${f.shipment}`).update({driverUid:f.viewer,version:2});await db.doc(`transportPlans/${f.shipment}`).update({driverUid:f.actor,version:3});},{role:'Driver',status:'Dispatched',plan:true}],
    ['model descriptor',async()=>{acceptance.acceptanceSha256='e'.repeat(64);}],
  ];
  for(const [field,value]of Object.entries({ownerId:'foreign-fixture-scope',shipmentId:'foreign-fixture-shipment',path:'evidence/foreign-fixture/path',bytes:image.length+1,contentType:'image/jpeg',type:'Proof of Delivery',integrityVersion:1,stage:'Delivery',captureSource:'camera',capturedAtClient:'2026-01-01T00:00:00.000Z',shipmentVersionAtRegistration:8})){
    mutations.push([`evidence snapshot ${field}`,async f=>db.doc(`evidence/${f.photo}`).update({[field]:value})]);
  }
  for(const [name,change,options]of mutations)await check(`actual completion fences ${name}`,async()=>{
    const f=await fixture(options),d=delay(),pending=start(f);await entered(d,pending);await change(f);d.gate.resolve();
    let saved;try{saved=await pending;}catch(error){assert.equal(error.code,'permission-denied');saved=(await ownedRows(f,'parcelAnalyses'))[0].data();}
    assert.equal(saved.state,'Stale');assert.equal(saved.label,null);assert.equal(saved.probabilities,null);assert.equal((await ownedRows(f,'predictions')).length,0);assert.equal(await lock(f),undefined);
    if(['approval revoked','account disabled'].includes(name))await denied(()=>resolve(f,saved.analysisId,f.actor));
    assert.equal((await resolve(f,saved.analysisId)).state,'Stale');reset();
  });
  for(const coordinate of ['ownerId','evidenceId','analysisId','receiptKey','nonce','expiresAt'])await check(`release verifies lock coordinate ${coordinate}`,async()=>{
    const f=await fixture(),d=delay(),pending=start(f);await entered(d,pending);const original=await lock(f),replacement={...original,[coordinate]:coordinate==='expiresAt'?original.expiresAt+1:`replacement-${randomUUID()}`};
    await put(`parcelAnalysisLocks/${lockKey(f.photo)}`,replacement);d.gate.resolve();
    try{await pending;}catch(error){assert(['failed-precondition','permission-denied'].includes(error.code));}
    assert.deepEqual(await lock(f),replacement);assert.equal((await ownedRows(f,'predictions')).length,0);reset();
  });
  for(const coordinate of ['ownerId','evidenceId','analysisId','receiptKey','nonce','expiresAt'])await check(`completion verifies private receipt coordinate ${coordinate}`,async()=>{
    const f=await fixture(),d=delay(),operationId=randomUUID(),pending=start(f,operationId);await entered(d,pending);
    const path=`parcelAnalysisRequests/${receiptKey(f.actor,operationId)}`,original=await read(path),originalLock=await lock(f);
    const replacement={...original,[coordinate]:coordinate==='expiresAt'?original.expiresAt+1:`replacement-${randomUUID()}`};await put(path,replacement);d.gate.resolve();
    try{await pending;}catch(error){assert(['failed-precondition','permission-denied','not-found'].includes(error.code));}
    assert.equal((await ownedRows(f,'predictions')).length,0);assert.deepEqual(await lock(f),originalLock);reset();
  });
  await check('assigned Driver succeeds; historical replay/read survive reassignment and current role change',async()=>{
    const f=await fixture({role:'Driver',status:'Dispatched',plan:true}),op=randomUUID(),saved=await start(f,op);assert.equal(saved.state,'Predicted');
    await db.doc(`transportPlans/${f.shipment}`).update({driverUid:f.viewer,version:2});await db.doc(`users/${f.actor}`).update({role:'Viewer',version:2});
    assert.deepEqual(await start(f,op),saved);assert.deepEqual(await resolve(f,saved.analysisId,f.actor),saved);await denied(()=>start(f));reset();
  });
  await check('Admin/Manager reciprocal review is atomic under simultaneous decisions and broken provenance',async()=>{
    const f=await fixture(),saved=await start(f),prediction=await read(`predictions/${saved.predictionId}`),before=await read(`parcelAnalyses/${saved.analysisId}`);
    await db.doc(`predictions/${saved.predictionId}`).update({evidenceSha256:'e'.repeat(64)});
    await assert.rejects(command(f,'reviewParcelAnalysis',{analysisId:saved.analysisId,version:2,decision:'Accepted',notes:'Synthetic condition inspected'},f.reviewer));
    assert.deepEqual(await read(`parcelAnalyses/${saved.analysisId}`),before);await put(`predictions/${saved.predictionId}`,prediction);
    const reviews=await Promise.allSettled([
      command(f,'reviewParcelAnalysis',{analysisId:saved.analysisId,version:2,decision:'Accepted',notes:'Synthetic condition inspected'},f.reviewer),
      command(f,'reviewPrediction',{id:saved.predictionId,version:1,decision:'Reject',notes:'Concurrent alternate decision'},f.reviewer),
    ]);
    assert.equal(reviews.filter(r=>r.status==='fulfilled').length,1);
    const a=await read(`parcelAnalyses/${saved.analysisId}`),p=await read(`predictions/${saved.predictionId}`);assert.equal(a.reviewStatus,p.reviewStatus);assert.equal(a.version,3);assert.equal(p.version,2);assert.equal(a.label,saved.label);reset();
  });
  await check('legacy unlinked Accept denied unchanged and clean Reject preserved; Abstained review never creates human label',async()=>{
    const f=await fixture();fetchWork=async()=>response({status:'abstained',label:null,probabilities:[0.5,0.5],confidence:0.5});const saved=await start(f);assert.equal(saved.state,'Abstained');
    await denied(()=>command(f,'reviewParcelAnalysis',{analysisId:saved.analysisId,version:2,decision:'Reviewed',notes:'Image inspected manually'},f.viewer));
    const reviewed=await command(f,'reviewParcelAnalysis',{analysisId:saved.analysisId,version:2,decision:'Reviewed',notes:'Image inspected manually'},f.reviewer);assert.equal(reviewed.label,null);assert.equal(reviewed.predictionId,null);assert.equal(reviewed.reviewStatus,'Reviewed');assert.equal((await ownedRows(f,'predictions')).length,0);
    const legacy=`${f.base}-legacy`;f.references.push(await put(`predictions/${legacy}`,{ownerId:scope,kind:'parcel',recordId:f.photo,label:'Normal',reviewStatus:'Pending',version:1,actor:f.actor}));
    const legacyBefore=await read(`predictions/${legacy}`);
    await assert.rejects(command(f,'reviewPrediction',{id:legacy,version:1,decision:'Accept',notes:'Historical result inspected'},f.reviewer),error=>error.code==='failed-precondition'&&/reciprocal registered-photo/.test(error.message));
    assert.deepEqual(await read(`predictions/${legacy}`),legacyBefore);
    await command(f,'reviewPrediction',{id:legacy,version:1,decision:'Reject',notes:'Historical result rejected'},f.reviewer);
    const old=await read(`predictions/${legacy}`);assert.equal(old.reviewStatus,'Rejected');assert.equal(Object.hasOwn(old,'analysisId'),false);assert.equal((await ownedRows(f,'parcelAnalyses')).length,1);reset();
  });
  await check('Admin linked legacy review accepts both records without changing inference',async()=>{
    const f=await fixture();await db.doc(`users/${f.reviewer}`).update({role:'Admin'});const saved=await start(f);
    await command(f,'reviewPrediction',{id:saved.predictionId,version:1,decision:'Accept',notes:'Administrator inspected fixture'},f.reviewer);
    const analysis=await read(`parcelAnalyses/${saved.analysisId}`),prediction=await read(`predictions/${saved.predictionId}`);assert.equal(analysis.reviewStatus,'Accepted');assert.equal(prediction.reviewStatus,'Accepted');assert.equal(analysis.label,saved.label);assert.deepEqual(analysis.probabilities,saved.probabilities);reset();
  });
  for(const invalid of ['wrong hash','bad response lineage','oversized body','remote unavailable'])await check(`external ${invalid} saves null safe result in real transaction`,async()=>{
    const f=await fixture();
    if(invalid==='wrong hash')streamWork=()=>Readable.from([Buffer.alloc(image.length)]);
    if(invalid==='bad response lineage')fetchWork=async()=>response({acceptanceSha256:'e'.repeat(64)});
    if(invalid==='oversized body')fetchWork=async()=>new Response('x'.repeat(16385));
    if(invalid==='remote unavailable')fetchWork=async()=>new Response('private service detail',{status:503});
    const saved=await start(f);assert(['Failed','Unavailable'].includes(saved.state));assert.equal(saved.label,null);assert.equal(saved.probabilities,null);assert.equal((await ownedRows(f,'predictions')).length,0);assert(!JSON.stringify(saved).includes('private service'));reset();
  });
  assert(storageReads>0);return {storageReads,fetches};
}

async function liveRulesAndHttp(){
  const {admin,client,close}=await import('./access-test-client.mjs');
  const {doc,getDoc,getDocs,collection,query,where,setDoc,updateDoc,deleteDoc}=await import('firebase/firestore');
  const created=[];
  try{
    for(const [role,approved]of [['Warehouse',true],['Driver',true],['Viewer',true],['Inventory',true],['Logistics',false],['Manager',true]]){const c=await client(role,approved);created.push(c);accounts.push(c.uid);}
    const [warehouse,driver,viewer,inventory,pending,disabled]=created;await db.doc(`users/${disabled.uid}`).update({status:'Disabled',active:false});
    const f=await fixture();const ownUserPaths=f.references.filter(path=>path.startsWith('users/'));for(const path of ownUserPaths)await db.doc(path).delete();f.references=f.references.filter(path=>!path.startsWith('users/'));f.actor=warehouse.uid;f.viewer=viewer.uid;f.reviewer=admin.uid;
    await check('actual HTTP closed pin persists Unavailable without requiring any Storage object',async()=>{
      const operationId=randomUUID();operations.push({actor:f.actor,operationId});const saved=await warehouse.call('startParcelAnalysis',{evidenceId:f.photo,operationId});
      assert.equal(saved.state,'Unavailable');assert.equal(saved.reasonCode,'model-unavailable');assert.equal(saved.label,null);assert.equal(saved.model,null);assert.equal(saved.predictionId,null);
      assert.equal((await read(`parcelAnalysisRequests/${receiptKey(f.actor,operationId)}`)).state,'Unavailable');
      const before=await read(`parcelAnalyses/${saved.analysisId}`);
      await db.doc(`shipments/${f.shipment}`).update({status:'Dispatched',version:8});
      assert.deepEqual(await warehouse.call('startParcelAnalysis',{evidenceId:f.photo,operationId}),saved);
      assert.deepEqual(await viewer.call('resolveParcelAnalysis',{analysisId:saved.analysisId}),saved);assert.deepEqual(await read(`parcelAnalyses/${saved.analysisId}`),before);
      await assert.rejects(warehouse.call('startParcelAnalysis',{evidenceId:`${f.photo}-changed`,operationId}));f.saved=saved;
    });
    await check('actual SDK rules deny every private read/list/write and public forgery',async()=>{
      for(const kind of ['parcelAnalysisRequests','parcelAnalysisLocks'])for(const c of [admin,viewer,pending,disabled]){
        const key=kind==='parcelAnalysisRequests'?receiptKey(f.actor,operations[0].operationId):lockKey(f.photo);
        await denied(()=>getDoc(doc(c.db,kind,key)));await denied(()=>getDocs(collection(c.db,kind)));await denied(()=>getDocs(query(collection(c.db,kind),where('ownerId','==',scope))));
        await denied(()=>setDoc(doc(c.db,kind,key),{ownerId:scope}));await denied(()=>updateDoc(doc(c.db,kind,key),{state:'Predicted'}));await denied(()=>deleteDoc(doc(c.db,kind,key)));
      }
      for(const c of [admin,viewer,pending,disabled]){await denied(()=>setDoc(doc(c.db,'parcelAnalyses',`${f.base}-forged`),{ownerId:scope,state:'Predicted',label:'Normal'}));await denied(()=>updateDoc(doc(c.db,'parcelAnalyses',f.saved.analysisId),{label:'Normal'}));await denied(()=>deleteDoc(doc(c.db,'parcelAnalyses',f.saved.analysisId)));}
      for(const c of [admin,viewer,pending,disabled]){await denied(()=>setDoc(doc(c.db,'parcelAnalyses',f.base+'-experimental-forged'),{ownerId:scope,state:'Predicted',label:'Damaged',model:{evaluationKind:'local-experimental',evaluationManifestSha256:'f'.repeat(64),acceptanceSha256:null}}));await denied(()=>updateDoc(doc(c.db,'parcelAnalyses',f.saved.analysisId),{model:{evaluationKind:'local-experimental',evaluationManifestSha256:'f'.repeat(64),acceptanceSha256:null}}));}
      assert.equal((await getDoc(doc(viewer.db,'parcelAnalyses',f.saved.analysisId))).data().state,'Unavailable');
      assert((await getDocs(query(collection(viewer.db,'parcelAnalyses'),where('ownerId','==',scope)))).docs.some(row=>row.id===f.saved.analysisId));
      await denied(()=>getDocs(collection(viewer.db,'parcelAnalyses')));
      const foreign=`${f.base}-foreign`;f.references.push(await put(`parcelAnalyses/${foreign}`,{...f.saved,analysisId:foreign,ownerId:`${f.base}-foreign-scope`}));
      for(const c of [admin,viewer,pending,disabled])await denied(()=>getDoc(doc(c.db,'parcelAnalyses',foreign)));
      for(const c of [pending,disabled]){await denied(()=>getDoc(doc(c.db,'parcelAnalyses',f.saved.analysisId)));await denied(()=>c.call('resolveParcelAnalysis',{analysisId:f.saved.analysisId}));}
      await denied(()=>admin.call('resolveParcelAnalysis',{analysisId:foreign}));await denied(()=>admin.call('startParcelAnalysis',{evidenceId:f.photo,operationId:randomUUID()},'foreign-scope'));
    });
    await check('real HTTP current stage/role/assignment/type/legacy admission is enforced',async()=>{
      const delivery=await fixture({status:'Dispatched',plan:true});await db.doc(`transportPlans/${delivery.shipment}`).update({driverUid:driver.uid});delivery.actor=driver.uid;delivery.viewer=viewer.uid;delivery.reviewer=admin.uid;
      const op=randomUUID();operations.push({actor:driver.uid,operationId:op});assert.equal((await driver.call('startParcelAnalysis',{evidenceId:delivery.photo,operationId:op})).state,'Unavailable');
      for(const c of [warehouse,inventory,viewer,pending,disabled])await denied(()=>c.call('startParcelAnalysis',{evidenceId:delivery.photo,operationId:randomUUID()}));
      await db.doc(`transportPlans/${delivery.shipment}`).update({driverUid:warehouse.uid,version:2});await denied(()=>driver.call('startParcelAnalysis',{evidenceId:delivery.photo,operationId:randomUUID()}));assert.equal((await driver.call('startParcelAnalysis',{evidenceId:delivery.photo,operationId:op})).state,'Unavailable');
      await db.doc(`evidence/${delivery.photo}`).update({type:'Proof of Delivery'});await denied(()=>admin.call('startParcelAnalysis',{evidenceId:delivery.photo,operationId:randomUUID()}));
      await db.doc(`evidence/${delivery.photo}`).update({type:'Parcel Image',integrityVersion:1});await denied(()=>admin.call('startParcelAnalysis',{evidenceId:delivery.photo,operationId:randomUUID()}));
      await assert.rejects(admin.call('predict',{kind:'parcel',id:delivery.photo}),/workflow|parcel|analysis/i);
      await denied(()=>viewer.call('startParcelAnalysis',{evidenceId:f.photo,operationId:randomUUID()}));
    });
  }finally{
    // Only this run's generated fixtures/accounts; never the selected Admin.
    await clean();fixtures.length=0;
    const auth=require('firebase-admin/auth').getAuth(app);
    for(const c of created){const audits=await db.collection('auditLogs').where('recordId','==',c.uid).get();for(const row of audits.docs)await row.ref.delete();await db.doc(`users/${c.uid}`).delete();await auth.deleteUser(c.uid);}
    await close();
  }
  await check('fresh accepted-module worker uses real Firestore, never production acceptance',()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--experimental-test-module-mocks',fileURLToPath(import.meta.url),'--worker'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env},stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Accepted emulator worker exited ${code}`)));
  }));
}

let failure=null,metrics;
try{metrics=worker?await acceptedWorker():await liveRulesAndHttp();}
catch(error){failure=error;console.error(error);process.exitCode=1;}
finally{
  await clean();await adminApp.deleteApp(app);
  await writeFile(new URL(worker?'emulator-accepted-worker.json':'emulator-http-rules.json',root),JSON.stringify({suite:worker?'accepted external test doubles, actual Admin Firestore':'real SDK rules and callable HTTP',passed:!failure,checks,records,metrics,error:failure?{name:failure.name,message:failure.message}:null},null,2));
}
if(!failure)console.log(`Parcel photo ${worker?'accepted-worker':'HTTP/rules'} QA passed: ${checks} scenario groups.`);
