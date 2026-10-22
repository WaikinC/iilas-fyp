import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PARCEL_LIVE_POLICY as policy} from '../lib/parcelLive.js';
const {createParcelLiveClient:create}=await import('../lib/parcelLiveClient.js').catch(()=>({}));
const op='33333333-3333-4333-8333-333333333333',sid='11111111-1111-4111-8111-111111111111',fid='22222222-2222-4222-8222-222222222222';
const ctx={scopeId:'scope',actorUid:'actor',shipmentId:'shipment',stage:'Pre-dispatch'};
const now=Date.now(),sha=createHash('sha256').update(Buffer.from([255,216,255])).digest('hex');
const model={model:'MobileNetV2',modelVersion:sha,selectionSha256:sha,evaluationSha256:sha,acceptanceSha256:sha,preprocessing:'mobilenet_v2',contrast:'clahe',classOrder:['Normal','Damaged'],intendedUse:'sampled-live',policyVersion:policy.version,policySha256:policy.sha256};
const session=(patch={})=>({ownerId:'scope',sessionId:sid,actorUid:'actor',operationId:op,shipmentId:'shipment',stage:'Pre-dispatch',policy,model,state:'Open',createdAt:now,updatedAt:now,expiresAt:now+120000,stoppedAt:null,version:1,generation:1,reservedCount:0,completedCount:0,inFlightFrameId:null,lastReservedAt:null,reasonCode:null,...patch});
const frame=(patch={})=>({ownerId:'scope',sessionId:sid,frameId:fid,sequence:1,actorUid:'actor',shipmentId:'shipment',stage:'Pre-dispatch',policy,model,sha256:sha,bytes:3,width:3,height:1,contentType:'image/jpeg',capturedAtClient:new Date(now).toISOString(),reservedAt:now,expiresAt:now+60000,updatedAt:now,completedAt:null,state:'Reserved',version:1,sessionGeneration:1,label:null,probabilities:null,confidence:null,confidenceMeaning:null,serviceRequestId:null,processingTimeMs:null,totalProcessingTimeMs:null,reasonCode:null,retention:'Unverified',image:null,humanReviewRequired:false,reviewStatus:'NotApplicable',reviewNotes:null,reviewedBy:null,reviewedAt:null,...patch});
const terminal=()=>session({state:'Stopped',version:2,generation:2,stoppedAt:now,reasonCode:'user-stop'});
const predicted=()=>frame({state:'Predicted',version:3,updatedAt:now+20,completedAt:now+20,retention:'Verified',image:{generation:'1',metageneration:'1',sha256:sha,bytes:3,width:3,height:1,contentType:'image/jpeg'},label:'Normal',probabilities:[0.8,0.2],confidence:0.8,confidenceMeaning:'uncalibrated',serviceRequestId:op,processingTimeMs:1,totalProcessingTimeMs:2,humanReviewRequired:true,reviewStatus:'Pending'});
const storage=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const setup=(command=async name=>name==='startParcelLiveSession'?session():terminal(),s=storage(),context=ctx)=>({s,client:create({storage:s,context,command})});
const signal=()=>new AbortController();
const capture=()=>({payload:{blob:new Blob([new Uint8Array([255,216,255])],{type:'image/jpeg'}),width:3,height:1},bytes:3,capturedAtClient:new Date(now).toISOString()});
const input=(controller=signal())=>({sessionId:sid,frameId:fid,sequence:1,signal:controller.signal,...capture()});
test('client interface exists before implementation',()=>assert.equal(typeof create,'function'));
test('write-before-send contains exactly eight identity fields; unavailable never reserves',async()=>{
 const s=storage(),calls=[];const {client}=setup(async name=>{calls.push(name);assert.equal(JSON.parse([...s.data.values()][0]).operationId,op);assert.deepEqual(Object.keys(JSON.parse([...s.data.values()][0])).sort(),['actorUid','blockedSessionId','frameId','operationId','scopeId','sessionId','shipmentId','stage']);return session({state:'Unavailable',model:null,reasonCode:'model-unavailable',stoppedAt:null});},s);
 assert.deepEqual(await client.open({operationId:op,signal:signal().signal}),{sessionId:sid,state:'Unavailable'});assert.equal(client.pending(),null);assert.deepEqual(calls,['startParcelLiveSession']);
});
test('lost start reload after dispatch replays original stage UUID without replacement',async()=>{
 const s=storage(),a=setup(async()=>{throw Error('private token');},s).client;await assert.rejects(a.open({operationId:op,signal:signal().signal}));a.dispose();const calls=[];
 const b=setup(async(name,p)=>{calls.push([name,p]);return session({state:'Unavailable',model:null,reasonCode:'model-unavailable',stoppedAt:null});},s,{...ctx,stage:'Delivery'}).client;
 await b.recover();assert.deepEqual(calls,[['startParcelLiveSession',{shipmentId:'shipment',stage:'Pre-dispatch',operationId:op}]]);assert.equal(b.pending(),null);
});
test('Busy fixed blocker may belong to another shipment; explicit resolve only then replacement',async()=>{
 let calls=[];const {client}=setup(async(name,p)=>{calls.push([name,p]);return name==='startParcelLiveSession'?{state:'Busy',sessionId:sid,reasonCode:'session-busy'}:terminalWithOtherShipment();});
 function terminalWithOtherShipment(){return {...terminal(),shipmentId:'other-shipment',operationId:fid,stage:'Delivery'};}
 await assert.rejects(client.open({operationId:op,signal:signal().signal}));assert.equal(client.pending().sessionId,null);assert.equal(client.pending().blockedSessionId,sid);
 const saved=await client.recover();assert.equal(saved.session.shipmentId,'other-shipment');assert.equal(client.pending(),null);assert.equal(calls[1][0],'resolveParcelLiveSession');
});
test('raw pending open survives instance/shipment replacement; stale result cannot clear intent',async()=>{
 const d=defer(),s=storage(),a=setup(()=>d.promise,s).client,p=a.open({operationId:op,signal:signal().signal});a.dispose();const b=setup(undefined,s,{...ctx,shipmentId:'other'}).client;
 await assert.rejects(b.open({operationId:fid,signal:signal().signal}));d.resolve(session({state:'Unavailable',model:null,reasonCode:'model-unavailable',stoppedAt:null}));await assert.rejects(p);assert.equal(b.pending().operationId,op);
});
test('actual encoder and close remain owned across remount even after cancellation',async()=>{
 const d=defer(),s=storage(),a=setup(undefined,s).client;await a.open({operationId:op,signal:signal().signal});const c=signal(),p=a.capture({...input(c)},()=>d.promise);c.abort();await a.close({sessionId:sid,reason:'user-stop'});a.dispose();const b=setup(undefined,s).client;
 await assert.rejects(b.open({operationId:fid,signal:signal().signal}));d.resolve(capture());await assert.rejects(p);assert.equal(b.snapshot().busy,false);
});
test('canonical in-memory encoding reserves then analyses same frame once and strips result payload',async()=>{
 const calls=[];const {client,s}=setup(async(name,p)=>{calls.push([name,p]);if(name==='startParcelLiveSession')return session();if(name==='reserveParcelLiveFrame'){assert.equal(client.pending().frameId,fid);assert.equal(p.sha256,sha);return frame();}return {...predicted(),private:'secret'};});
 await client.open({operationId:op,signal:signal().signal});const result=await client.submit(input());assert.deepEqual(result,{sessionId:sid,frameId:fid,sequence:1,state:'Predicted',label:'Normal'});assert.equal(calls[2][1].jpegBase64,'/9j/');assert.equal(client.pending().frameId,null);assert.doesNotMatch([...s.data.values()][0],/sha256|bytes|private|Normal|capturedAt/);
});
test('lost reservation stops without analyse/retry and explicit resolve preserves same frame',async()=>{
 let calls=[];const {client}=setup(async(name,p)=>{calls.push([name,p]);if(name==='startParcelLiveSession'||name==='resolveParcelLiveSession')return session();if(name==='reserveParcelLiveFrame')throw Error('lost');return frame();});await client.open({operationId:op,signal:signal().signal});await assert.rejects(client.submit(input()));assert.equal(client.pending().frameId,fid);await assert.rejects(client.submit(input()));const recovered=await client.recover();assert.equal(recovered.frame.state,'Reserved');assert.equal(client.pending().frameId,fid);assert.equal(calls.filter(([n])=>n==='reserveParcelLiveFrame').length,1);assert.equal(calls.some(([n])=>n==='analyseParcelLiveFrame'),false);
});
test('Running analyse response is uncertain; Cancelled maps to Stale null',async()=>{
 for(const state of ['Running','Cancelled']){const {client}=setup(async name=>name==='startParcelLiveSession'?session():name==='reserveParcelLiveFrame'?frame():frame(state==='Cancelled'?{state,version:2,completedAt:now,reasonCode:'session-stopped'}:{state,version:2}));await client.open({operationId:op,signal:signal().signal});if(state==='Running'){await assert.rejects(client.submit(input()));assert.equal(client.pending().frameId,fid);}else assert.equal((await client.submit(input())).state,'Stale');}
});
test('abort/context during Blob read/hash/reservation prevents every later upload',async()=>{
 for(const fence of ['blob','reserve']){const d=defer(),c=signal(),calls=[];const {client}=setup(async name=>{calls.push(name);if(name==='startParcelLiveSession')return session();if(name==='reserveParcelLiveFrame'){await d.promise;return frame();}return predicted();});await client.open({operationId:op,signal:c.signal});const f=input(c);if(fence==='blob')f.payload.blob.arrayBuffer=()=>d.promise;const p=client.submit(f);await new Promise(r=>setTimeout(r,10));c.abort();client.setContext({...ctx,stage:'Delivery'});client.setContext(ctx);d.resolve(fence==='blob'?new Uint8Array([255,216,255]).buffer:undefined);await assert.rejects(p);assert.equal(calls.includes('analyseParcelLiveFrame'),false);if(fence==='blob')assert.equal(calls.includes('reserveParcelLiveFrame'),false);}
});
test('lost stop retains IDs; raw cleanup blocks replacement until authoritative recovery',async()=>{
 const d=defer(),s=storage();let mode='open';const a=setup(async name=>name==='startParcelLiveSession'?session():mode==='pending'?d.promise:mode==='lost'?Promise.reject(Error('lost')):terminal(),s).client;await a.open({operationId:op,signal:signal().signal});mode='pending';const p=a.close({sessionId:sid,reason:'user-stop'});const b=setup(async()=>terminal(),s).client;await assert.rejects(b.open({operationId:fid,signal:signal().signal}));d.reject(Error('private'));await assert.rejects(p);assert.equal(b.pending().sessionId,sid);await b.recover();assert.equal(b.pending(),null);
});
test('malformed/unwritable storage and wrong DTOs block safely without allocating replacements',async()=>{
 for(const bad of ['{}','null','{"token":"secret"}']){const s=storage();s.data.set('iilas:parcel-live:["scope","actor"]',bad);const a=setup(undefined,s).client;assert.throws(()=>a.pending());await assert.rejects(a.open({operationId:op,signal:signal().signal}));}
 const s=storage();s.setItem=()=>{throw Error('secret');};const a=setup(undefined,s).client;await assert.rejects(a.open({operationId:op,signal:signal().signal}),e=>!e.message.includes('secret'));
 for(const patch of [{ownerId:'other'},{shipmentId:'other'},{actorUid:'other'},{operationId:fid},{state:'Normal'},{stage:'Delivery'}]){const {client}=setup(async()=>session(patch));await assert.rejects(client.open({operationId:op,signal:signal().signal}));assert.equal(client.pending().operationId,op);}
});
test('review uses strict version notes verified retained frame and exact seven-command input',async()=>{
 const calls=[];const {client}=setup(async(name,p)=>{calls.push([name,p]);return {...predicted(),version:4,updatedAt:now+30,reviewStatus:p.decision,reviewNotes:p.notes,reviewedBy:'actor',reviewedAt:now+30,humanReviewRequired:false};});
 await assert.rejects(client.review({...predicted(),retention:'Unknown',image:null},{decision:'Accepted',notes:'checked'}));await assert.rejects(client.review(predicted(),{decision:'Accepted',notes:'x'}));await client.review(predicted(),{decision:'Accepted',notes:'checked'});assert.deepEqual(calls[0],['reviewParcelLiveFrame',{sessionId:sid,frameId:fid,version:3,decision:'Accepted',notes:'checked'}]);
});
test('review rejects binding override fields before any command side effect',async()=>{
 const calls=[];const {client}=setup(async(...args)=>{calls.push(args);return predicted();});
 for(const extra of [{sessionId:fid},{frameId:sid},{version:99},{token:'private'}])await assert.rejects(client.review(predicted(),{decision:'Accepted',notes:'checked',...extra}));
 assert.equal(calls.length,0);
});
test('caller mutation during Blob await cannot reserve a different persisted frame identity',async()=>{
 const d=defer(),calls=[];const {client}=setup(async(name,p)=>{calls.push([name,p]);if(name==='startParcelLiveSession')return session();if(name==='reserveParcelLiveFrame')return frame();return predicted();});
 await client.open({operationId:op,signal:signal().signal});const raw=input();raw.payload.blob.arrayBuffer=()=>d.promise;const work=client.submit(raw);raw.frameId=op;raw.sessionId=fid;raw.sequence=12;raw.bytes=1;raw.capturedAtClient='2000-01-01T00:00:00.000Z';d.resolve(new Uint8Array([255,216,255]).buffer);await work.catch(()=>{});
 for(const [,payload] of calls.filter(([name])=>name==='reserveParcelLiveFrame'))assert.deepEqual([payload.sessionId,payload.frameId,payload.sequence,payload.bytes,payload.capturedAtClient],[sid,fid,1,3,new Date(now).toISOString()]);
});
test('replacement observer is notified when predecessor actual encoder finally settles',async()=>{
 const d=defer(),s=storage(),a=setup(undefined,s).client;await a.open({operationId:op,signal:signal().signal});const p=a.capture(input(),()=>d.promise),states=[];let b;
 b=create({storage:s,context:ctx,command:async()=>terminal(),onChange:()=>states.push(b.snapshot().busy)});
 await b.recover();assert.equal(states.at(-1),true);d.resolve(capture());await assert.rejects(p);assert.equal(states.at(-1),false);
});
test('controller close acknowledges already authoritative Unavailable without replacement stop',async()=>{
 const calls=[];const {client}=setup(async name=>{calls.push(name);return session({state:'Unavailable',model:null,reasonCode:'model-unavailable'});});
 await client.open({operationId:op,signal:signal().signal});assert.equal(await client.close({sessionId:sid,reason:'unavailable'}),undefined);assert.deepEqual(calls,['startParcelLiveSession']);
});
test('simultaneously mounted idle sibling does not invalidate first panel; actor work/intent still serializes both',async()=>{
 const d=defer(),s=storage(),calls=[];
 const a=setup(async name=>{calls.push(name);return d.promise;},s).client;
 const b=setup(async()=>session({shipmentId:'other'}),s,{...ctx,shipmentId:'other'}).client;
 const work=a.open({operationId:op,signal:signal().signal});await assert.rejects(b.open({operationId:fid,signal:signal().signal}));d.resolve(session());assert.equal((await work).state,'Open');assert.equal(a.pending().sessionId,sid);await assert.rejects(b.open({operationId:fid,signal:signal().signal}));assert.deepEqual(calls,['startParcelLiveSession']);
});
test('invalid capture declarations are rejected before reservation or analysis',async()=>{
 for(const patch of [{bytes:0},{bytes:4},{sequence:0},{sequence:13},{capturedAtClient:'invalid'},{capturedAtClient:new Date(Date.now()+600000).toISOString()},{payload:{blob:new Blob([new Uint8Array([1,2,3])],{type:'image/png'}),width:3,height:1}},{payload:{blob:capture().payload.blob,width:961,height:1}}]){
  const calls=[];const {client}=setup(async name=>{calls.push(name);return session();});await client.open({operationId:op,signal:signal().signal});await assert.rejects(client.submit({...input(),...patch}));assert.deepEqual(calls,['startParcelLiveSession']);
 }
});
