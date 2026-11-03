// Existing explicit-project loopback services only. Never starts emulators.
// node --experimental-test-module-mocks scripts/parcel-live-emulator-qa.mjs
// Positive inference uses isolated external module/Storage/HTTP doubles, while
// every Firestore read, transaction, conflict and commit uses the real emulator.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Readable,Writable} from 'node:stream';
import {mock} from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import config from '../firebase-config.json' with {type:'json'};
import {PARCEL_LIVE_POLICY as POLICY,parcelLiveStartReceiptKey,parcelLiveActorLockKey,parcelLiveFrameKey,toSafeParcelLiveModel} from '../lib/parcelLive.js';

assert.equal(config.projectId,'fyp-inventory-and-logistics','Refusing another project.');
for(const [key,value] of Object.entries({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'})){
  assert(!process.env[key]||process.env[key]===value,`Refusing nonconfigured ${key}`);process.env[key]=value;
}
const require=createRequire(new URL('../backend/functions/service.mjs',import.meta.url));
const adminApp=require('firebase-admin/app'),adminStore=require('firebase-admin/firestore');
const app=adminApp.initializeApp({projectId:config.projectId,storageBucket:config.storageBucket});
const db=adminStore.getFirestore(app),systemBefore=(await db.doc('system/config').get()).data();
const scope=systemBefore?.dataScopeId;
assert(scope,'The existing shared emulator must already be initialized.');
const primaryBefore=systemBefore.primaryAdminUid?(await db.doc(`users/${systemBefore.primaryAdminUid}`).get()).data():null;
const mode=process.argv.includes('--storage-precondition-probe')?'storage-precondition-probe':process.argv.includes('--real-storage-worker')?'real-storage-worker':process.argv.includes('--accepted-worker')?'accepted-worker':process.argv.includes('--closed-worker')?'closed-worker':'http-rules';
const root=new URL('../outputs/parcel-live-sessions-20261021/',import.meta.url);
await mkdir(root,{recursive:true});
const paths=new Set(),realStoragePaths=new Set(),authIds=[],clients=[],objects=new Map(),records=[],realNow=Date.now;
const hash=value=>createHash('sha256').update(value).digest('hex');
const handlerSha256=hash(await readFile(new URL('../backend/functions/parcelLive.mjs',import.meta.url)));
// Structurally complete JPEG: parser fixture only, never model quality evidence.
const jpeg=Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
const imageHash=hash(jpeg),encoded=jpeg.toString('base64');
let clock=null,checks=0;
const now=()=>clock??realNow();
const put=async(path,value)=>{paths.add(path);await db.doc(path).set(value);return path;};
const read=async path=>(await db.doc(path).get()).data();
const patch=(path,value)=>db.doc(path).update(value);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const sessionPath=id=>`parcelLiveSessions/${id}`;
const framePath=async f=>`parcelLiveFrames/${await parcelLiveFrameKey(scope,f.sessionId,f.frameId)}`;
const frameReceiptPath=async f=>`parcelLiveFrameRequests/${await parcelLiveFrameKey(scope,f.sessionId,f.frameId)}`;
const lockPath=async f=>`parcelLiveActorLocks/${await parcelLiveActorLockKey(scope,f.actor)}`;
const startPath=async(f,operationId)=>`parcelLiveStartRequests/${await parcelLiveStartReceiptKey(scope,f.actor,operationId)}`;
async function check(name,work){const started=realNow();await work();checks++;records.push({name,passed:true,durationMs:realNow()-started});console.log(`PASS ${name}`);}
const denied=work=>assert.rejects(work,error=>/permission-denied|not-found|failed-precondition|unavailable|unauthorized/.test(error.code||''));
async function fixture({role='Warehouse',status='Prepared',plan=false}={}){
  const base=`live-qa-${randomUUID()}`,f={base,actor:`${base}-actor`,reviewer:`${base}-manager`,viewer:`${base}-viewer`,shipment:`${base}-shipment`,stage:status==='Prepared'?'Pre-dispatch':'Delivery'};
  for(const [uid,userRole] of [[f.actor,role],[f.reviewer,'Manager'],[f.viewer,'Viewer']])await put(`users/${uid}`,{uid,role:userRole,status:'Approved',active:true,version:1});
  await put(`shipments/${f.shipment}`,{ownerId:scope,status,version:7,reference:base,items:[],parcelCount:1,packed:true});
  paths.add(`transportPlans/${f.shipment}`);if(plan)await put(`transportPlans/${f.shipment}`,{ownerId:scope,shipmentId:f.shipment,driverUid:f.actor,version:1});
  paths.add(await lockPath(f));return f;
}
async function trackSession(f,operationId,out){paths.add(await startPath(f,operationId));if(out.state!=='Busy')paths.add(sessionPath(out.sessionId));return out;}
async function clean(){
  Date.now=realNow;
  if(realStoragePaths.size){const bucket=require('firebase-admin/storage').getStorage(app).bucket(process.env.EVIDENCE_BUCKET||config.storageBucket);for(const path of realStoragePaths)await bucket.file(path).delete({ignoreNotFound:true});}
  for(const path of paths)await db.doc(path).delete();
  for(const c of clients)await c.close();
  for(const uid of authIds)await require('firebase-admin/auth').getAuth(app).deleteUser(uid);
  assert(isDeepStrictEqual((await db.doc('system/config').get()).data(),systemBefore),'Shared configuration changed during suite.');
  if(systemBefore.primaryAdminUid)assert(isDeepStrictEqual((await db.doc(`users/${systemBefore.primaryAdminUid}`).get()).data(),primaryBefore),'Primary Admin profile changed during suite.');
  assert.equal(hash(await readFile(new URL('../backend/functions/parcelLive.mjs',import.meta.url))),handlerSha256,'Handler source changed during suite.');
  const refs=[...paths].map(path=>db.doc(path));for(let offset=0;offset<refs.length;offset+=100)assert((await db.getAll(...refs.slice(offset,offset+100))).every(row=>!row.exists),'A generated document survived cleanup.');
  return {deletedGeneratedDocuments:paths.size,deletedGeneratedAuthUsers:authIds.length,deletedRealStorageObjects:realStoragePaths.size,protectedConfigUnchanged:true,primaryAdminUnchanged:true,generatedDocumentsAbsent:true};
}
async function worker(accepted,realStorage=false){
  const pin={model:'MobileNetV2',modelVersion:'a'.repeat(64),selectionSha256:'b'.repeat(64),evaluationSha256:'c'.repeat(64),acceptanceSha256:'d'.repeat(64),preprocessing:'rgb-224-unit',contrast:'none',classOrder:['Normal','Damaged'],intendedUse:'sampled-live',policyVersion:POLICY.version,policySha256:POLICY.sha256};
  const acceptance={...pin,classOrder:[...pin.classOrder]};let writes=0,fetches=0,storageReads=0,writeWork,fetchWork,metadataWork,readWork;
  // Mock external acceptance BEFORE importing any service module. The real
  // acceptance module is never mutated, nor is a service cache reused.
  if(accepted)mock.module(new URL('../backend/functions/parcelLiveAcceptance.mjs',import.meta.url).href,{namedExports:{parcelLiveAcceptance:acceptance,requireParcelLiveAcceptance:value=>toSafeParcelLiveModel(value)}});
  if(!realStorage)mock.method(require('firebase-admin/storage'),'getStorage',()=>({bucket:()=>({file:(path,options)=>{let ack=null;return {
    interceptors:[],
    get metadata(){return ack;},
    createWriteStream(opts){writes++;assert.equal(opts.preconditionOpts.ifGenerationMatch,0);const chunks=[];return new Writable({write(c,_e,cb){chunks.push(Buffer.from(c));cb();},final(cb){Promise.resolve().then(()=>writeWork(path,Buffer.concat(chunks))).then(()=>{const stored=objects.get(path);ack=Object.freeze(Object.fromEntries(['generation','metageneration','size','contentType'].map(key=>[key,stored?.[key]])));cb();},cb);}});},
    async getMetadata(){storageReads++;return [await metadataWork(path,options)];},createReadStream(){storageReads++;return readWork(path,options);},
  };}})}));
  mock.method(globalThis,'fetch',async(...args)=>{fetches++;return fetchWork(...args);});
  process.env.RESEARCH_API_URL='http://127.0.0.1:1';process.env.RESEARCH_API_TOKEN=randomUUID();
  if(realStorage)process.env.EVIDENCE_BUCKET=config.storageBucket||'fyp-inventory-and-logistics.firebasestorage.app';
  const {executeCommand}=await import('../backend/functions/service.mjs');
  const command=(f,action,input,uid=f.actor)=>executeCommand({uid},{action,input,workspaceId:scope});
  const start=async(f,operationId=randomUUID(),shipmentId=f.shipment,stage=f.stage)=>{paths.add(await startPath(f,operationId));return trackSession(f,operationId,await command(f,'startParcelLiveSession',{shipmentId,stage,operationId}));};
  const resolveSession=(f,s,uid=f.viewer)=>command(f,'resolveParcelLiveSession',{sessionId:s.sessionId},uid);
  const resolveFrame=(f,frame,uid=f.viewer)=>command(f,'resolveParcelLiveFrame',{sessionId:frame.sessionId,frameId:frame.frameId},uid);
  const stop=(f,s,uid=f.actor)=>command(f,'stopParcelLiveSession',{sessionId:s.sessionId},uid);
  const noProjection=async(f,s,frame)=>{for(const [field,value] of [['actor',f.actor],['actorUid',f.actor],['sessionId',s.sessionId],['frameId',frame.frameId],['recordId',frame.frameId]])assert.equal((await db.collection('predictions').where(field,'==',value).get()).size,0);};
  const reserve=async(f,s,changes={})=>{const input={sessionId:s.sessionId,frameId:randomUUID(),sequence:s.reservedCount+1,bytes:jpeg.length,sha256:imageHash,width:1,height:1,capturedAtClient:new Date(now()).toISOString(),...changes};paths.add(await framePath(input));paths.add(await frameReceiptPath(input));return command(f,'reserveParcelLiveFrame',input);};
  const analyse=(f,frame,b=encoded)=>command(f,'analyseParcelLiveFrame',{sessionId:frame.sessionId,frameId:frame.frameId,jpegBase64:b});
  const result=body=>({...pin,operationally_approved:true,humanReviewRequired:true,confidenceMeaning:'uncalibrated',evidenceSha256:imageHash,sessionId:body.sessionId,frameId:body.frameId,sequence:body.sequence,probabilities:[.2,.8],confidence:.8,label:'Damaged',status:'predicted',processingTimeMs:2,totalProcessingTimeMs:3,requestId:randomUUID()});
  const response=(body,changes={})=>new Response(JSON.stringify({...result(body),...changes}));
  const reset=()=>{clock=null;for(const key of Object.keys(acceptance))delete acceptance[key];Object.assign(acceptance,pin,{classOrder:[...pin.classOrder]});writeWork=async(path,b)=>{assert(!objects.has(path));objects.set(path,{buffer:b,generation:'123',metageneration:'1',size:String(b.length),contentType:'image/jpeg'});};metadataWork=async path=>objects.get(path)||Promise.reject(Error('private object detail'));readWork=path=>Readable.from([objects.get(path)?.buffer||Buffer.alloc(0)]);fetchWork=async(url,opts)=>{assert.equal(url,'http://127.0.0.1:1/predict/live-parcel');const b=JSON.parse(opts.body);assert.equal(b.intendedUse,'sampled-live');assert.equal(b.imageBase64,encoded);return response(b);};};
  const delayHttp=()=>{const gate=deferred(),entered=deferred();fetchWork=async(_u,o)=>{entered.resolve();await gate.promise;return response(JSON.parse(o.body));};return {gate,entered};};
  const entered=(d,pending)=>Promise.race([d.entered.promise,pending.then(out=>{throw Error(`Expected delayed external I/O was never entered: ${out.state}/${out.reasonCode}/${out.retention}; writes=${writes}, fetches=${fetches}.`);})]);
  Date.now=now;reset();
  if(!accepted){
    await check('actual null pin saves durable Unavailable before any Storage or HTTP',async()=>{const f=await fixture(),op=randomUUID(),s=await start(f,op);assert.equal(s.state,'Unavailable');assert.equal(s.reasonCode,'model-unavailable');assert.equal(s.model,null);assert.equal(await read(await lockPath(f)),undefined);await patch(`users/${f.actor}`,{role:'Viewer',version:2});assert.deepEqual(await start(f,op),s);assert.deepEqual(await resolveSession(f,s),s);await denied(()=>reserve(f,s));await assert.rejects(start(f,op,`${f.shipment}-changed`));assert.equal(writes+fetches+storageReads,0);});
    return {writes,fetches,storageReads,realPin:null};
  }
  if(realStorage){
    let ackFile;
    await check('real SDK write acknowledgment exposes generation/metageneration/CRC before finish resolves',async()=>{
      const path=`parcel-live/${scope}/${randomUUID()}/${randomUUID()}`;realStoragePaths.add(path);const file=require('firebase-admin/storage').getStorage(app).bucket(process.env.EVIDENCE_BUCKET).file(path);ackFile=file;await new Promise((resolve,reject)=>{const stream=file.createWriteStream({resumable:false,validation:'crc32c',metadata:{contentType:'image/jpeg'},preconditionOpts:{ifGenerationMatch:0}});stream.once('error',reject);stream.once('finish',resolve);stream.end(jpeg);});const ack=file.metadata;records.push({name:'real SDK write acknowledgment safe shape',observed:true,generationType:typeof ack?.generation,metagenerationType:typeof ack?.metageneration,sizeType:typeof ack?.size,crc32cType:typeof ack?.crc32c,contentType:ack?.contentType,generationCanonical:typeof ack?.generation==='string'&&/^[1-9][0-9]{0,19}$/.test(ack.generation),metagenerationCanonical:typeof ack?.metageneration==='string'&&/^[1-9][0-9]{0,19}$/.test(ack.metageneration)});assert.equal(ack.contentType,'image/jpeg');assert.equal(Number(ack.size),jpeg.length);assert.match(ack.generation,/^[1-9][0-9]{0,19}$/);assert.match(ack.metageneration,/^[1-9][0-9]{0,19}$/);
    });
    if(mode==='storage-precondition-probe'){
      await check('actual Storage must reject duplicate create-only precondition (known emulator limitation)',async()=>{const before=ackFile.metadata.generation,[duplicate]=await Promise.allSettled([new Promise((resolve,reject)=>{const stream=ackFile.createWriteStream({resumable:false,validation:'crc32c',metadata:{contentType:'image/jpeg'},preconditionOpts:{ifGenerationMatch:0}});stream.once('error',reject);stream.once('finish',resolve);stream.end(jpeg);})]);records.push({name:'real Storage duplicate create-only precondition',observed:true,status:duplicate.status,generationChanged:(await ackFile.getMetadata())[0].generation!==before});assert.equal(duplicate.status,'rejected','Storage emulator accepted duplicate createWriteStream despite ifGenerationMatch=0.');});
      return {realAdminStorage:true};
    }
    await check('real Admin Storage createWriteStream/CRC/generation and review stream preserve exact retained bytes',async()=>{
      const f=await fixture(),s=await start(f),frame=await reserve(f,s),path=`parcel-live/${scope}/${s.sessionId}/${frame.frameId}`;realStoragePaths.add(path);const before=fetches,out=await analyse(f,frame);assert.equal(out.state,'Predicted');assert.equal(out.retention,'Verified');assert.equal(fetches-before,1);const file=require('firebase-admin/storage').getStorage(app).bucket(process.env.EVIDENCE_BUCKET).file(path),[metadata]=await file.getMetadata(),[bytes]=await file.download();assert.equal(hash(bytes),imageHash);assert.equal(metadata.generation,out.image.generation);assert.equal(metadata.metageneration,out.image.metageneration);assert.equal(metadata.contentType,'image/jpeg');assert.equal(Number(metadata.size),jpeg.length);assert.deepEqual(await analyse(f,frame),out);assert.equal(fetches-before,1);
      const reviewed=await command(f,'reviewParcelLiveFrame',{sessionId:s.sessionId,frameId:frame.frameId,version:out.version,decision:'Accepted',notes:'Synthetic retained bytes inspected'},f.reviewer);assert.equal(reviewed.reviewStatus,'Accepted');assert.equal(reviewed.label,out.label);
      await stop(f,s);reset();
    });
    const limitation={preconditionUnsupported:true,providerCreateOnlyCertified:false,emulatorVersion:'firebase-tools 15.30.0',source:'node_modules/firebase-tools/lib/emulator/storage/apis/gcloud.js:230-313 drops ifGenerationMatch; SDK file.js startSimpleUpload_ passes options.preconditionOpts into request query',failingProbe:'--storage-precondition-probe',preservedFailure:'emulator-real-storage-ack-before-fix.json'};records.push({name:'known actual Storage emulator precondition limitation',...limitation});return {fetches,realAdminStorage:true,externalAcceptanceOnly:true,limitation};
  }
  await check('real Firestore concurrent tabs serialize one actor session across shipments and immutable Blocked receipts',async()=>{
    const f=await fixture(),other=`${f.shipment}-other`;await put(`shipments/${other}`,{ownerId:scope,status:'Prepared',version:1});const ops=Array.from({length:6},()=>randomUUID()),out=await Promise.all(ops.map((op,i)=>start(f,op,i%2?other:f.shipment))),s=out.find(r=>r.state==='Open');assert(s);assert.equal(out.filter(r=>r.state==='Open').length,1);
    const blocked=[];for(let i=0;i<ops.length;i++)if(out[i].state==='Busy'){assert.deepEqual(out[i],{state:'Busy',sessionId:s.sessionId,reasonCode:'session-busy'});const p=await startPath(f,ops[i]),r=await read(p);assert.equal(r.state,'Blocked');assert.equal(Object.hasOwn(r,'nonce'),false);blocked.push([i,p,r]);}
    await stop(f,s);await patch(`users/${f.actor}`,{role:'Viewer',version:2});for(const [i,p,r] of blocked){assert.deepEqual(await start(f,ops[i],i%2?other:f.shipment),out[i]);assert.deepEqual(await read(p),r);}await assert.rejects(start(f,ops[0],`${f.shipment}-changed`));reset();
  });
  await check('real Firestore same-operation contention creates one session, reserve slot and one immutable inference',async()=>{
    const f=await fixture(),op=randomUUID(),sessions=await Promise.all(Array.from({length:5},()=>start(f,op)));assert(sessions.every(s=>s.sessionId===sessions[0].sessionId));const s=sessions[0],frame=await reserve(f,s),r=await read(await frameReceiptPath(frame));assert.deepEqual(await command(f,'reserveParcelLiveFrame',r.input),frame);await assert.rejects(command(f,'reserveParcelLiveFrame',{...r.input,width:2}));await denied(()=>reserve(f,s));
    const d=delayHttp(),before=[writes,fetches],pending=analyse(f,frame);await entered(d,pending);const replay=await Promise.all(Array.from({length:4},()=>analyse(f,frame)));assert(replay.every(x=>x.state==='Running'));await assert.rejects(analyse(f,frame,'AQID'));assert.equal(writes-before[0],1);assert.equal(fetches-before[1],1);d.gate.resolve();const saved=await pending;assert.equal(saved.state,'Predicted');assert.equal(saved.reviewStatus,'Pending');assert.equal(saved.retention,'Verified');assert.deepEqual(await analyse(f,frame),saved);assert.deepEqual(await resolveFrame(f,frame),saved);assert.equal(writes-before[0],1);assert.equal(fetches-before[1],1);await noProjection(f,s,frame);for(const token of ['snapshot','nonce','jpegBase64','path','token'])assert(!JSON.stringify(saved).includes(token));await stop(f,s);reset();
  });
  await check('server cadence exact 5000ms, one slot, twelve-frame budget and no queued work',async()=>{
    const f=await fixture();clock=realNow();const s=await start(f);let current=s;for(let sequence=1;sequence<=12;sequence++){const frame=await reserve(f,current,{sequence,sha256:'f'.repeat(64)});await denied(()=>reserve(f,current));assert.equal((await analyse(f,frame)).state,'Failed');current=await resolveSession(f,s);if(sequence<12){clock=frame.reservedAt+4999;await denied(()=>reserve(f,current));clock++;}}
    assert.equal(current.reservedCount,12);clock+=5000;await denied(()=>reserve(f,current,{sequence:12}));await stop(f,s);reset();
  });
  await check('frame expiry boundary releases only slot; session expiry cancels owned frame and lock',async()=>{
    const f=await fixture();clock=realNow();const s=await start(f),frame=await reserve(f,s);clock=frame.expiresAt-1;assert.equal((await resolveFrame(f,frame)).state,'Reserved');clock++;assert.equal((await resolveFrame(f,frame)).state,'Expired');const still=await resolveSession(f,s);assert.equal(still.state,'Open');assert.equal(still.inFlightFrameId,null);const late=await reserve(f,still);assert.equal(late.expiresAt,s.expiresAt);clock=s.expiresAt;assert.equal((await resolveSession(f,s)).state,'Expired');assert.equal((await resolveFrame(f,late)).state,'Expired');assert.equal(await read(await lockPath(f)),undefined);reset();
  });
  await check('session expiry races pending remote completion and predecessor cannot release successor',async()=>{
    const f=await fixture();clock=realNow();const s=await start(f),frame=await reserve(f,s),d=delayHttp(),work=analyse(f,frame);await entered(d,work);clock=s.expiresAt;assert.equal((await resolveSession(f,s)).state,'Expired');const successor=await start(f),next=await read(await lockPath(f));d.gate.resolve();await assert.rejects(work,e=>e.code==='unavailable');const out=await resolveFrame(f,frame);assert.equal(out.state,'Expired');assert.equal(out.label,null);assert.deepEqual(await read(await lockPath(f)),next);assert.equal(next.sessionId,successor.sessionId);await stop(f,successor);reset();
  });
  await check('same frame UUID in different sessions remains isolated by canonical scope/session/frame key',async()=>{
    const first=await fixture(),second=await fixture(),a=await start(first),b=await start(second),frameId=randomUUID(),af=await reserve(first,a,{frameId}),bf=await reserve(second,b,{frameId});assert.notEqual(await framePath(af),await framePath(bf));const out=await analyse(first,af);assert.equal(out.state,'Predicted');assert.equal((await resolveFrame(second,bf)).state,'Reserved');await denied(()=>analyse(first,bf));await stop(first,a);await stop(second,b);reset();
  });
  for(const phase of ['write','HTTP'])await check(`stop races pending ${phase}; immutable null outcome preserves successor lock`,async()=>{
    const f=await fixture(),s=await start(f),frame=await reserve(f,s),gate=deferred(),reached=deferred(),before=fetches;
    if(phase==='write'){writeWork=async(path,b)=>{reached.resolve();await gate.promise;objects.set(path,{buffer:b,generation:'123',metageneration:'1',size:String(b.length),contentType:'image/jpeg'});};}else fetchWork=async(_u,o)=>{reached.resolve();await gate.promise;return response(JSON.parse(o.body));};
    const work=analyse(f,frame);await entered({entered:reached},work);await stop(f,s);const cancelled=await resolveFrame(f,frame);assert.equal(cancelled.state,'Cancelled');assert.equal(cancelled.label,null);assert.equal(cancelled.retention,phase==='write'?'Unknown':'Verified');const successor=await start(f),nextLock=await read(await lockPath(f));gate.resolve();assert.deepEqual(await work,cancelled);assert.deepEqual(await read(await lockPath(f)),nextLock);assert.equal(nextLock.sessionId,successor.sessionId);if(phase==='write')assert.equal(fetches,before);await stop(f,successor);reset();
  });
  const mutations=[
    ['account version',f=>patch(`users/${f.actor}`,{version:2})],
    ['role restored with newer version',async f=>{await patch(`users/${f.actor}`,{role:'Viewer',version:2});await patch(`users/${f.actor}`,{role:'Warehouse',version:3});}],
    ['account revoked',f=>patch(`users/${f.actor}`,{status:'Rejected',active:false,version:2})],
    ['shipment status',f=>patch(`shipments/${f.shipment}`,{status:'Dispatched',version:8})],
    ['shipment version restored status',async f=>{await patch(`shipments/${f.shipment}`,{status:'Dispatched',version:8});await patch(`shipments/${f.shipment}`,{status:'Prepared',version:9});}],
    ['plan absent becomes present',f=>put(`transportPlans/${f.shipment}`,{ownerId:scope,driverUid:f.actor,version:1})],
    ['plan present becomes absent',f=>db.doc(`transportPlans/${f.shipment}`).delete(),{plan:true}],
    ['plan version',f=>patch(`transportPlans/${f.shipment}`,{version:2}),{plan:true}],
    ['Driver assignment restored with newer plan',async f=>{await patch(`transportPlans/${f.shipment}`,{driverUid:f.viewer,version:2});await patch(`transportPlans/${f.shipment}`,{driverUid:f.actor,version:3});},{role:'Driver',status:'Dispatched',plan:true}],
    ['config snapshot mismatch without shared config mutation',async(_f,s)=>{const p=await startPath(_f,s.operationId),r=await read(p);await patch(p,{snapshot:{...r.snapshot,config:{...r.snapshot.config,version:(r.snapshot.config.version??0)+1}}});}],
    ['accepted live pin changes before finalisation',async()=>{acceptance.acceptanceSha256='e'.repeat(64);} ],
  ];
  for(const [name,change,options] of mutations)await check(`real final transaction fences ${name}`,async()=>{
    const f=await fixture(options),s=await start(f),frame=await reserve(f,s),d=delayHttp(),work=analyse(f,frame);await entered(d,work);await change(f,s);d.gate.resolve();let out;try{out=await work;}catch(e){assert.equal(e.code,'permission-denied');out=await read(await framePath(frame));}assert.equal(out.state,'Stale');assert.equal(out.label,null);assert.equal(out.probabilities,null);assert.equal(await read(await lockPath(f)),undefined);assert.equal((await resolveFrame(f,frame)).state,'Stale');reset();
  });
  for(const coordinate of ['ownerId','actorUid','sessionId','startReceiptKey','nonce','generation','expiresAt'])await check(`exact actor-lock ${coordinate} mismatch preserves replacement`,async()=>{
    const f=await fixture(),s=await start(f),frame=await reserve(f,s),d=delayHttp(),work=analyse(f,frame);await entered(d,work);const path=await lockPath(f),r=await read(path),replacement={...r,[coordinate]:['expiresAt','generation'].includes(coordinate)?r[coordinate]+1:coordinate==='sessionId'||coordinate==='nonce'?randomUUID():`changed-${randomUUID()}`};await put(path,replacement);d.gate.resolve();await work.catch(e=>assert(['failed-precondition','unavailable'].includes(e.code)));assert.deepEqual(await read(path),replacement);assert.notEqual((await read(await framePath(frame))).state,'Predicted');reset();
  });
  for(const coordinate of ['frameNonce','frameExpiresAt','generation','frameReceiptKey'])await check(`exact private frame ${coordinate} mismatch cannot commit inference`,async()=>{
    const f=await fixture(),s=await start(f),frame=await reserve(f,s),d=delayHttp(),work=analyse(f,frame);await entered(d,work);const path=await frameReceiptPath(frame),r=await read(path),value=typeof r[coordinate]==='number'?r[coordinate]+1:coordinate==='frameNonce'?randomUUID():'f'.repeat(64);await patch(path,{[coordinate]:value});const before=await read(await lockPath(f));d.gate.resolve();await work.catch(e=>assert(['failed-precondition','unavailable'].includes(e.code)));assert.deepEqual(await read(await lockPath(f)),before);assert.notEqual((await read(await framePath(frame))).state,'Predicted');reset();
  });
  for(const invalid of ['signature','dimensions','hash','truncated JPEG'])await check(`actual ingestion ${invalid} fails before Storage or HTTP in real transaction`,async()=>{
    const f=await fixture(),s=await start(f),bytes=invalid==='signature'?Buffer.from([1,2,3]):invalid==='truncated JPEG'?jpeg.subarray(0,-2):jpeg,changes={bytes:bytes.length,sha256:hash(bytes),...(invalid==='dimensions'?{width:2}:invalid==='hash'?{sha256:'f'.repeat(64)}:{})},frame=await reserve(f,s,changes),before=[writes,fetches],out=await analyse(f,frame,bytes.toString('base64'));assert.equal(out.state,'Failed');assert.equal(out.reasonCode,'invalid-image');assert.equal(out.label,null);assert.deepEqual([writes,fetches],before);assert.deepEqual(await analyse(f,frame,bytes.toString('base64')),out);await stop(f,s);reset();
  });
  await check('canonical encoding and unreserved/wrong-session/after-stop admission reject before external I/O',async()=>{
    const f=await fixture(),s=await start(f),frame=await reserve(f,s),before=[writes,fetches];for(const bytes of ['',encoded+'=', 'AB==','A'.repeat(1398108)])await denied(()=>analyse(f,frame,bytes));await denied(()=>analyse(f,{...frame,frameId:randomUUID()}));await denied(()=>analyse(f,{...frame,sessionId:randomUUID()}));await stop(f,s);await denied(()=>analyse(f,frame));assert.deepEqual([writes,fetches],before);reset();
  });
  for(const invalid of ['response lineage','response coordinates','oversized body','remote unavailable','ambiguous object metadata'])await check(`external ${invalid} saves immutable null result without retry`,async()=>{
    const f=await fixture(),s=await start(f),frame=await reserve(f,s),before=[writes,fetches];if(invalid==='response lineage')fetchWork=async(_u,o)=>response(JSON.parse(o.body),{acceptanceSha256:'e'.repeat(64)});if(invalid==='response coordinates')fetchWork=async(_u,o)=>response(JSON.parse(o.body),{frameId:randomUUID()});if(invalid==='oversized body')fetchWork=async()=>new Response('x'.repeat(16385));if(invalid==='remote unavailable')fetchWork=async()=>new Response('private remote detail',{status:503});if(invalid==='ambiguous object metadata')metadataWork=async path=>({...objects.get(path),generation:undefined});const out=await analyse(f,frame);assert.equal(out.state,invalid==='remote unavailable'?'Unavailable':'Failed');assert.equal(out.label,null);assert.equal(out.probabilities,null);assert(!JSON.stringify(out).includes('private remote'));assert.deepEqual(await analyse(f,frame),out);assert.equal(writes-before[0],1);assert.equal(fetches-before[1],invalid==='ambiguous object metadata'?0:1);await stop(f,s);reset();
  });
  await check('Warehouse Prepared and assigned Driver Delivery; Viewer historical read after reassignment and dispatch',async()=>{
    const f=await fixture({role:'Driver',status:'Dispatched',plan:true}),s=await start(f),frame=await reserve(f,s),out=await analyse(f,frame);await patch(`transportPlans/${f.shipment}`,{driverUid:f.viewer,version:2});await patch(`users/${f.actor}`,{role:'Viewer',version:2});assert.deepEqual(await resolveFrame(f,frame,f.actor),out);assert.deepEqual(await start(f,s.operationId),await resolveSession(f,s));await denied(()=>reserve(f,{...s,reservedCount:1}));await denied(()=>start(f));await stop(f,s);const w=await fixture(),ws=await start(w),wf=await reserve(w,ws),wo=await analyse(w,wf);await patch(`shipments/${w.shipment}`,{status:'Dispatched',version:8});assert.deepEqual(await resolveFrame(w,wf),wo);await denied(()=>start(w));await denied(()=>start({...w,actor:w.viewer}));await stop(w,ws);reset();
  });
  for(const role of ['Admin','Manager'])await check(`${role} review verifies generation and bytes plus final reviewer version`,async()=>{
    const f=await fixture();await patch(`users/${f.reviewer}`,{role});const s=await start(f),frame=await reserve(f,s),out=await analyse(f,frame),input={sessionId:s.sessionId,frameId:frame.frameId,version:out.version,decision:'Accepted',notes:'Synthetic visible packaging inspected'},path=`parcel-live/${scope}/${s.sessionId}/${frame.frameId}`,old=objects.get(path);
    await denied(()=>command(f,'reviewParcelLiveFrame',input,f.viewer));for(const changed of [{...old,generation:'124'},{...old,buffer:Buffer.alloc(jpeg.length)}]){objects.set(path,changed);await assert.rejects(command(f,'reviewParcelLiveFrame',input,f.reviewer));assert.equal((await read(await framePath(frame))).reviewStatus,'Pending');}objects.set(path,old);
    readWork=p=>{const stream=new Readable({read(){}});void patch(`users/${f.reviewer}`,{version:2}).then(()=>{stream.push(objects.get(p).buffer);stream.push(null);});return stream;};await assert.rejects(command(f,'reviewParcelLiveFrame',input,f.reviewer));assert.equal((await read(await framePath(frame))).reviewStatus,'Pending');readWork=p=>Readable.from([objects.get(p).buffer]);const done=await command(f,'reviewParcelLiveFrame',input,f.reviewer);assert.equal(done.reviewStatus,'Accepted');assert.equal(done.label,out.label);assert.deepEqual(done.probabilities,out.probabilities);await assert.rejects(command(f,'reviewParcelLiveFrame',input,f.reviewer));await stop(f,s);reset();
  });
  await check('Abstained review preserves null label and creates no legacy prediction',async()=>{const f=await fixture(),s=await start(f),frame=await reserve(f,s);fetchWork=async(_u,o)=>response(JSON.parse(o.body),{status:'abstained',label:null,probabilities:[.5,.5],confidence:.5});const out=await analyse(f,frame);assert.equal(out.state,'Abstained');const done=await command(f,'reviewParcelLiveFrame',{sessionId:s.sessionId,frameId:frame.frameId,version:3,decision:'Reviewed',notes:'Synthetic visible packaging inspected'},f.reviewer);assert.equal(done.label,null);assert.equal(done.reviewStatus,'Reviewed');await noProjection(f,s,frame);await stop(f,s);reset();});
  await check('elapsed original leases do not block terminal replay, historical resolution or retained-image review',async()=>{
    const f=await fixture();clock=realNow();const s=await start(f),frame=await reserve(f,s),out=await analyse(f,frame),open=await resolveSession(f,s),receipt=await read(await frameReceiptPath(frame)),before=[writes,fetches];clock=s.expiresAt+1;
    assert.deepEqual(await analyse(f,frame),out);assert.deepEqual(await command(f,'reserveParcelLiveFrame',receipt.input),out);assert.deepEqual(await start(f,s.operationId),open);assert.deepEqual([writes,fetches],before);
    const reviewed=await command(f,'reviewParcelLiveFrame',{sessionId:s.sessionId,frameId:frame.frameId,version:out.version,decision:'Accepted',notes:'Historical retained packaging inspected'},f.reviewer);assert.equal(reviewed.reviewStatus,'Accepted');assert.equal(reviewed.label,out.label);assert.equal((await resolveSession(f,s)).state,'Expired');assert.deepEqual(await resolveFrame(f,frame),reviewed);assert.deepEqual(await read(await frameReceiptPath(frame)),receipt);assert.deepEqual([writes,fetches],before);await noProjection(f,s,frame);assert.equal((await stop(f,s)).state,'Expired');reset();
  });
  return {writes,fetches,storageReads,externalAcceptanceOnly:true};
}

async function httpRules(){
  const {initializeApp,deleteApp}=await import('firebase/app');
  const {getAuth,connectAuthEmulator,signInWithEmailAndPassword}=await import('firebase/auth');
  const {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,query,where,setDoc,updateDoc,deleteDoc}=await import('firebase/firestore');
  const {getFunctions,connectFunctionsEmulator,httpsCallable}=await import('firebase/functions');
  const {getStorage,connectStorageEmulator,ref,uploadBytes,updateMetadata,deleteObject,getBytes,getMetadata}=await import('firebase/storage');
  async function client(role,approved=true){
    const uid=`live-http-${randomUUID()}`,password=randomUUID()+randomUUID(),email=`${uid}@example.test`;
    await require('firebase-admin/auth').getAuth(app).createUser({uid,email,password,emailVerified:true});authIds.push(uid);await put(`users/${uid}`,{uid,email,displayName:'Disposable live QA',role,status:approved?'Approved':'Pending',active:approved,version:1});
    const a=initializeApp(config,uid),auth=getAuth(a),store=getFirestore(a),fn=getFunctions(a,'asia-southeast1'),storage=getStorage(a);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(store,'127.0.0.1',8081);connectFunctionsEmulator(fn,'127.0.0.1',5001);connectStorageEmulator(storage,'127.0.0.1',9199);await signInWithEmailAndPassword(auth,email,password);
    const c={uid,db:store,storage,close:()=>deleteApp(a),call:async(action,input,workspaceId=scope)=>{
      if(action==='startParcelLiveSession'){paths.add(`parcelLiveStartRequests/${await parcelLiveStartReceiptKey(workspaceId,uid,input.operationId)}`);paths.add(`parcelLiveActorLocks/${await parcelLiveActorLockKey(workspaceId,uid)}`);}
      if(action==='reserveParcelLiveFrame'){paths.add(await framePath(input));paths.add(await frameReceiptPath(input));}
      const out=(await httpsCallable(fn,'command')({action,input,workspaceId})).data;if(action==='startParcelLiveSession'&&out.sessionId&&out.state!=='Busy')paths.add(sessionPath(out.sessionId));return out;
    }};clients.push(c);return c;
  }
  const warehouse=await client('Warehouse'),driver=await client('Driver'),viewer=await client('Viewer'),admin=await client('Admin'),pending=await client('Logistics',false),disabled=await client('Manager');await patch(`users/${disabled.uid}`,{status:'Disabled',active:false,version:2});
  const f=await fixture();f.actor=warehouse.uid;f.viewer=viewer.uid;f.reviewer=admin.uid;paths.add(await lockPath(f));let saved,operationId;
  await check('actual callable HTTP null pin persists Unavailable and same-operation recovery without any retained object',async()=>{operationId=randomUUID();paths.add(await startPath(f,operationId));saved=await warehouse.call('startParcelLiveSession',{shipmentId:f.shipment,stage:f.stage,operationId});paths.add(sessionPath(saved.sessionId));assert.equal(saved.state,'Unavailable');assert.equal(saved.reasonCode,'model-unavailable');assert.equal(saved.model,null);assert.equal(await read(await lockPath(f)),undefined);await patch(`shipments/${f.shipment}`,{status:'Dispatched',version:8});assert.deepEqual(await warehouse.call('startParcelLiveSession',{shipmentId:f.shipment,stage:f.stage,operationId}),saved);assert.deepEqual(await viewer.call('resolveParcelLiveSession',{sessionId:saved.sessionId}),saved);await assert.rejects(warehouse.call('startParcelLiveSession',{shipmentId:`${f.shipment}-changed`,stage:f.stage,operationId}));await denied(()=>warehouse.call('reserveParcelLiveFrame',{sessionId:saved.sessionId,frameId:randomUUID(),sequence:1,bytes:jpeg.length,sha256:imageHash,width:1,height:1,capturedAtClient:new Date().toISOString()}));});
  await check('actual SDK all private reads/lists/writes and public direct writes denied',async()=>{
    const keys={parcelLiveStartRequests:await parcelLiveStartReceiptKey(scope,f.actor,operationId),parcelLiveActorLocks:await parcelLiveActorLockKey(scope,f.actor),parcelLiveFrameRequests:await parcelLiveFrameKey(scope,saved.sessionId,randomUUID())};
    for(const [kind,key] of Object.entries(keys))for(const c of [admin,viewer,pending,disabled]){paths.add(`${kind}/${key}`);await denied(()=>getDoc(doc(c.db,kind,key)));await denied(()=>getDocs(collection(c.db,kind)));await denied(()=>getDocs(query(collection(c.db,kind),where('ownerId','==',scope))));await denied(()=>setDoc(doc(c.db,kind,key),{ownerId:scope}));await denied(()=>updateDoc(doc(c.db,kind,key),{state:'Open'}));await denied(()=>deleteDoc(doc(c.db,kind,key)));}
    for(const kind of ['parcelLiveSessions','parcelLiveFrames'])for(const c of [admin,viewer,pending,disabled]){const id=kind==='parcelLiveSessions'?saved.sessionId:await parcelLiveFrameKey(scope,saved.sessionId,randomUUID()),forged=randomUUID();paths.add(`${kind}/${id}`);paths.add(`${kind}/${forged}`);await denied(()=>setDoc(doc(c.db,kind,forged),{ownerId:scope,state:'Predicted'}));await denied(()=>updateDoc(doc(c.db,kind,id),{label:'Normal'}));await denied(()=>deleteDoc(doc(c.db,kind,id)));}
    for(const kind of ['parcelLiveSessions','parcelLiveFrames'])for(const c of [admin,viewer,pending,disabled]){const forged=randomUUID();paths.add(kind+'/'+forged);await denied(()=>setDoc(doc(c.db,kind,forged),{ownerId:scope,state:'Predicted',model:{evaluationKind:'local-experimental',evaluationManifestSha256:'f'.repeat(64),acceptanceSha256:null}}));await denied(()=>updateDoc(doc(c.db,'parcelLiveSessions',saved.sessionId),{model:{evaluationKind:'local-experimental',evaluationManifestSha256:'f'.repeat(64),acceptanceSha256:null}}));}
    assert.equal((await getDoc(doc(viewer.db,'parcelLiveSessions',saved.sessionId))).data().state,'Unavailable');assert((await getDocs(query(collection(viewer.db,'parcelLiveSessions'),where('ownerId','==',scope)))).docs.some(r=>r.id===saved.sessionId));await denied(()=>getDocs(collection(viewer.db,'parcelLiveSessions')));for(const c of [pending,disabled])await denied(()=>getDoc(doc(c.db,'parcelLiveSessions',saved.sessionId)));
    const foreign=randomUUID();await put(sessionPath(foreign),{...saved,sessionId:foreign,ownerId:`foreign-${randomUUID()}`});for(const c of [admin,viewer,pending,disabled])await denied(()=>getDoc(doc(c.db,'parcelLiveSessions',foreign)));await denied(()=>admin.call('resolveParcelLiveSession',{sessionId:foreign}));await denied(()=>admin.call('startParcelLiveSession',{shipmentId:f.shipment,stage:f.stage,operationId:randomUUID()},'foreign-scope'));
    // Boundary-only documents contain no model/image/result claims. Rules read
    // authorization is independent of the validator exercised by the worker.
    const frameId=randomUUID(),publicKey=await parcelLiveFrameKey(scope,saved.sessionId,frameId),foreignKey=await parcelLiveFrameKey(scope,foreign,frameId);await put(`parcelLiveFrames/${publicKey}`,{ownerId:scope,syntheticRulesFixture:true});await put(`parcelLiveFrames/${foreignKey}`,{ownerId:`foreign-${randomUUID()}`,syntheticRulesFixture:true});assert((await getDoc(doc(viewer.db,'parcelLiveFrames',publicKey))).exists());assert((await getDocs(query(collection(viewer.db,'parcelLiveFrames'),where('ownerId','==',scope)))).docs.some(row=>row.id===publicKey));await denied(()=>getDocs(collection(viewer.db,'parcelLiveFrames')));for(const c of [admin,viewer,pending,disabled])await denied(()=>getDoc(doc(c.db,'parcelLiveFrames',foreignKey)));for(const c of [pending,disabled])await denied(()=>getDoc(doc(c.db,'parcelLiveFrames',publicKey)));
  });
  await check('actual callable current stage, Warehouse/Driver assignment and Viewer admission',async()=>{await patch(`shipments/${f.shipment}`,{status:'Prepared',version:9});for(const c of [viewer,driver,pending,disabled])await denied(()=>c.call('startParcelLiveSession',{shipmentId:f.shipment,stage:'Pre-dispatch',operationId:randomUUID()}));const delivery=await fixture({role:'Driver',status:'Dispatched',plan:true});await patch(`transportPlans/${delivery.shipment}`,{driverUid:driver.uid});delivery.actor=driver.uid;const op=randomUUID();paths.add(await startPath(delivery,op));const s=await driver.call('startParcelLiveSession',{shipmentId:delivery.shipment,stage:'Delivery',operationId:op});paths.add(sessionPath(s.sessionId));assert.equal(s.state,'Unavailable');await patch(`transportPlans/${delivery.shipment}`,{driverUid:viewer.uid,version:2});await denied(()=>driver.call('startParcelLiveSession',{shipmentId:delivery.shipment,stage:'Delivery',operationId:randomUUID()}));assert.deepEqual(await driver.call('resolveParcelLiveSession',{sessionId:s.sessionId}),s);for(const c of [warehouse,viewer,pending,disabled])await denied(()=>c.call('startParcelLiveSession',{shipmentId:delivery.shipment,stage:'Delivery',operationId:randomUUID()}));});
  await check('actual Storage denies every client create/update/delete and allows only Approved fixed-scope reads',async()=>{
    const session=randomUUID(),frame=randomUUID(),path=`parcel-live/${scope}/${session}/${frame}`,foreignPath=`parcel-live/foreign-${randomUUID()}/${session}/${frame}`,temporaryPaths=new Set([path,foreignPath]);
    // This disposable object is created by Admin SDK only; exact paths cleaned.
    const bucket=require('firebase-admin/storage').getStorage(app).bucket(config.storageBucket);
    try{await bucket.file(path).save(jpeg,{resumable:false,metadata:{contentType:'image/jpeg'}});await bucket.file(foreignPath).save(jpeg,{resumable:false,metadata:{contentType:'image/jpeg'}});
      for(const c of [warehouse,driver,viewer,admin,pending,disabled]){const freshPath=`parcel-live/${scope}/${session}/${randomUUID()}`;temporaryPaths.add(freshPath);const existing=ref(c.storage,path),fresh=ref(c.storage,freshPath);await denied(()=>uploadBytes(fresh,jpeg,{contentType:'image/jpeg'}));await denied(()=>uploadBytes(existing,jpeg,{contentType:'image/jpeg'}));await denied(()=>updateMetadata(existing,{customMetadata:{forged:'yes'}}));await denied(()=>deleteObject(existing));await denied(()=>getBytes(ref(c.storage,foreignPath)));}
      for(const c of [warehouse,driver,viewer,admin]){assert.equal((await getBytes(ref(c.storage,path))).byteLength,jpeg.length);assert.equal((await getMetadata(ref(c.storage,path))).contentType,'image/jpeg');}for(const c of [pending,disabled])await denied(()=>getBytes(ref(c.storage,path)));
    }finally{for(const temporaryPath of temporaryPaths)await bucket.file(temporaryPath).delete({ignoreNotFound:true});}
    const rules=await readFile(new URL('../storage.rules',import.meta.url),'utf8'),approved=rules.slice(rules.indexOf('function approved('),rules.indexOf('function assigned(')),live=rules.slice(rules.indexOf('match /parcel-live/'));assert.equal(new Set([...approved.matchAll(/documents\/([^\n)]+)/g)].map(m=>m[1])).size,2);assert(live.includes('allow create, update, delete: if false'));assert(!/firestore\.(get|exists)/.test(live));
  });
  return {syntheticAccounts:authIds.length,primaryAdminUntouched:true,systemConfigUntouched:true};
}
async function runChild(flag){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--experimental-test-module-mocks',fileURLToPath(import.meta.url),flag],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env},stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Isolated ${flag} exited ${code}`)));});}
let failure=null,metrics,cleanup;
try{metrics=mode==='http-rules'?await httpRules():await worker(mode!=='closed-worker',['real-storage-worker','storage-precondition-probe'].includes(mode));if(mode==='http-rules'){await check('fresh real-null module worker proves no byte I/O',()=>runChild('--closed-worker'));await check('fresh accepted external worker exercises actual Firestore transactions',()=>runChild('--accepted-worker'));await check('fresh accepted external pin and HTTP worker exercises real Admin Storage',()=>runChild('--real-storage-worker'));}}
catch(error){failure=error;console.error(error);process.exitCode=1;}
finally{try{cleanup=await clean();}catch(error){failure??=error;process.exitCode=1;console.error(error);}await adminApp.deleteApp(app);await writeFile(new URL(`emulator-${mode}.json`,root),JSON.stringify({suite:mode,handlerSha256,passed:!failure,checks,records,metrics,cleanup,error:failure?{name:failure.name,message:failure.message}:null},null,2));}
if(!failure)console.log(`Parcel live ${mode} QA passed: ${checks} scenario groups.`);
