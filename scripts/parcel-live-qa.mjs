import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const live=await import('../lib/parcelLive.js').catch(()=>({}));
const sessionId='11111111-1111-4111-8111-111111111111';
const frameId='22222222-2222-4222-8222-222222222222';
const operationId='33333333-3333-4333-8333-333333333333';
const now=1800000000000,sha='a'.repeat(64);
const reserve=()=>({sessionId,frameId,sequence:1,bytes:3,sha256:sha,width:960,height:480,capturedAtClient:new Date(now).toISOString()});
const model=()=>({model:'MobileNetV2',modelVersion:sha,selectionSha256:'b'.repeat(64),evaluationSha256:'c'.repeat(64),acceptanceSha256:'d'.repeat(64),preprocessing:'mobilenet_v2',contrast:'clahe',classOrder:['Normal','Damaged'],intendedUse:'sampled-live',policyVersion:live.PARCEL_LIVE_POLICY?.version,policySha256:live.PARCEL_LIVE_POLICY?.sha256});
const session=()=>({ownerId:'scope',sessionId,actorUid:'actor',operationId,shipmentId:'shipment',stage:'Pre-dispatch',policy:live.PARCEL_LIVE_POLICY,model:model(),state:'Open',createdAt:now,updatedAt:now,expiresAt:now+120000,stoppedAt:null,version:1,generation:1,reservedCount:0,completedCount:0,inFlightFrameId:null,lastReservedAt:null,reasonCode:null});
const frame=()=>({ownerId:'scope',sessionId,frameId,sequence:1,actorUid:'actor',shipmentId:'shipment',stage:'Pre-dispatch',policy:live.PARCEL_LIVE_POLICY,model:model(),sha256:sha,bytes:3,width:960,height:480,contentType:'image/jpeg',capturedAtClient:new Date(now).toISOString(),reservedAt:now,expiresAt:now+60000,updatedAt:now,completedAt:null,state:'Reserved',version:1,sessionGeneration:1,label:null,probabilities:null,confidence:null,confidenceMeaning:null,serviceRequestId:null,processingTimeMs:null,totalProcessingTimeMs:null,reasonCode:null,retention:'Unverified',image:null,humanReviewRequired:false,reviewStatus:'NotApplicable',reviewNotes:null,reviewedBy:null,reviewedAt:null});
const verified=()=>({generation:'123',metageneration:'1',sha256:sha,bytes:3,width:960,height:480,contentType:'image/jpeg'});
const predicted=()=>({...frame(),state:'Predicted',version:3,updatedAt:now+20,completedAt:now+20,retention:'Verified',image:verified(),label:'Normal',probabilities:[0.8,0.2],confidence:0.8,confidenceMeaning:'uncalibrated',serviceRequestId:operationId,processingTimeMs:1,totalProcessingTimeMs:2,humanReviewRequired:true,reviewStatus:'Pending'});

test('live contract exports exist before any implementation',()=>{
  for(const name of ['validateStartParcelLiveSession','toPublicParcelLiveSession','toPublicParcelLiveFrame','parcelLiveIngestDigest'])assert.equal(typeof live[name],'function',`${name} is required`);
});
test('all seven exact commands validate independent canonical inputs',()=>{
  assert.deepEqual(live.validateStartParcelLiveSession({shipmentId:'shipment',stage:'Pre-dispatch',operationId}),{shipmentId:'shipment',stage:'Pre-dispatch',operationId});
  assert.deepEqual(live.validateReserveParcelLiveFrame(reserve(),now),reserve());
  assert.deepEqual(live.validateAnalyseParcelLiveFrame({sessionId,frameId,jpegBase64:'/9j/'}),{sessionId,frameId,jpegBase64:'/9j/'});
  assert.deepEqual(live.validateResolveParcelLiveSession({sessionId}),{sessionId});
  assert.deepEqual(live.validateResolveParcelLiveFrame({sessionId,frameId}),{sessionId,frameId});
  assert.deepEqual(live.validateStopParcelLiveSession({sessionId}),{sessionId});
  assert.deepEqual(live.validateReviewParcelLiveFrame({sessionId,frameId,version:3,decision:'Accepted',notes:'  visible face checked  '}),{sessionId,frameId,version:3,decision:'Accepted',notes:'visible face checked'});
});
test('every command rejects unknown, inherited, symbol, accessor and missing fields',()=>{
  for(const [fn,input] of [[live.validateStartParcelLiveSession,{shipmentId:'shipment',stage:'Delivery',operationId}],[live.validateReserveParcelLiveFrame,reserve()],[live.validateAnalyseParcelLiveFrame,{sessionId,frameId,jpegBase64:'/9j/'}],[live.validateResolveParcelLiveSession,{sessionId}],[live.validateResolveParcelLiveFrame,{sessionId,frameId}],[live.validateStopParcelLiveSession,{sessionId}],[live.validateReviewParcelLiveFrame,{sessionId,frameId,version:3,decision:'Reviewed',notes:'checked'}]]){
    assert.throws(()=>fn({...input,acceptance:model()},now));
    assert.throws(()=>fn(Object.create(input),now));
    assert.throws(()=>fn({...input,[Symbol('secret')]:true},now));
    const missing={...input};delete missing[Object.keys(input)[0]];assert.throws(()=>fn(missing,now));
    const accessor={...input};Object.defineProperty(accessor,Object.keys(input)[0],{enumerable:true,get(){throw new Error('must not read');}});assert.throws(()=>fn(accessor,now),error=>error.code==='invalid-argument');
  }
});
test('IDs have strict lowercase v4 and safe shipment syntax with no coercion',()=>{
  for(const value of ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA','11111111-1111-1111-8111-111111111111','../bad',1,null])assert.throws(()=>live.validateStartParcelLiveSession({shipmentId:'shipment',stage:'Delivery',operationId:value}));
  for(const value of ['../bad','', 'x'.repeat(129),1])assert.throws(()=>live.validateStartParcelLiveSession({shipmentId:value,stage:'Delivery',operationId}));
  assert.throws(()=>live.validateStartParcelLiveSession({shipmentId:'shipment',stage:'Unknown',operationId}));
});
test('reservation rejects fractional, sparse, oversized and noncanonical declarations',()=>{
  for(const [key,values] of Object.entries({sequence:[0,13,1.5,'1'],bytes:[0,1048577,1.5,'3'],width:[0,961,1.1],height:[0,961],sha256:[sha.toUpperCase(),'short'],capturedAtClient:[null,'2026-01-01',new Date(now+300001).toISOString(),'2026-02-30T00:00:00.000Z']}))for(const value of values)assert.throws(()=>live.validateReserveParcelLiveFrame({...reserve(),[key]:value},now),`${key}:${value}`);
  assert.doesNotThrow(()=>live.validateReserveParcelLiveFrame({...reserve(),bytes:1048576,sequence:12,capturedAtClient:new Date(now+300000).toISOString()},now));
});
test('ingestion canonical base64 validates pad bits and decoded one MiB bound before allocation',()=>{
  for(const value of ['', '/9j/\n','data:image/jpeg;base64,/9j/','YQ','YR==','YWJ=','====','a'.repeat(1398108),'A'.repeat(1398104)])assert.throws(()=>live.validateAnalyseParcelLiveFrame({sessionId,frameId,jpegBase64:value}));
  for(const value of ['YQ==','YWI=','/9j/',Buffer.alloc(1048576).toString('base64')])assert.equal(live.validateAnalyseParcelLiveFrame({sessionId,frameId,jpegBase64:value}).jpegBase64,value);
});
test('review requires safe notes and positive integer version',()=>{
  for(const value of ['', 'ab','a'.repeat(241),'abc\nsecret',null])assert.throws(()=>live.validateReviewParcelLiveFrame({sessionId,frameId,version:3,decision:'Accepted',notes:value}));
  for(const version of [0,1.2,'3'])assert.throws(()=>live.validateReviewParcelLiveFrame({sessionId,frameId,version,decision:'Accepted',notes:'checked'}));
});
test('canonical policy hash binds the fixed full profile and has no controller import dependency',()=>{
  const policy=live.PARCEL_LIVE_POLICY;
  assert.equal(policy.intendedUse,'sampled-live');
  assert.equal(createHash('sha256').update(live.canonicalParcelLiveValue({version:policy.version,intendedUse:policy.intendedUse,limits:policy.limits,profile:policy.profile})).digest('hex'),policy.sha256);
  assert.ok(Object.isFrozen(policy)&&Object.isFrozen(policy.limits)&&Object.isFrozen(policy.profile));
  assert.equal(policy.limits.sessionMs,120000);assert.equal(policy.limits.maxFrames,12);assert.equal(policy.limits.minIntervalMs,5000);assert.equal(policy.limits.maxBytes,1048576);
});
test('canonical maps ignore insertion order, preserve array order and reject unsafe values',async()=>{
  assert.equal(live.canonicalParcelLiveValue({b:[2,1],a:1}),' {"a":1,"b":[2,1]}'.trim());
  assert.equal(await live.parcelLiveDigest({b:2,a:1}),createHash('sha256').update('{"a":1,"b":2}').digest('hex'));
  for(const value of [{x:undefined},{x:NaN},new Date(),[,,],{[Symbol('x')]:1}])assert.throws(()=>live.canonicalParcelLiveValue(value));
  assert.notEqual(await live.parcelLiveDigest([1,2]),await live.parcelLiveDigest([2,1]));
});
test('canonical arrays use dense indexed entries despite inherited custom iterators',async()=>{
  const prototype=Object.create(Array.prototype);
  Object.defineProperty(prototype,Symbol.iterator,{value:function*(){yield 'PRIVATE';yield 'LEAK';}});
  const values=Object.setPrototypeOf([0.8,0.2],prototype);
  assert.equal(live.canonicalParcelLiveValue(values),'[0.8,0.2]');
  assert.notEqual(await live.parcelLiveDigest(values),await live.parcelLiveDigest(['PRIVATE','LEAK']));
});
test('scoped receipt keys and ingestion digests bind every coordinate without keeping bytes',async()=>{
  const key=await live.parcelLiveStartReceiptKey('scope','actor',operationId);
  assert.notEqual(key,await live.parcelLiveStartReceiptKey('other','actor',operationId));
  assert.notEqual(key,await live.parcelLiveStartReceiptKey('scope','other',operationId));
  assert.notEqual(await live.parcelLiveActorLockKey('scope','actor'),key);
  assert.notEqual(await live.parcelLiveFrameKey('scope',sessionId,frameId),await live.parcelLiveFrameKey('scope',operationId,frameId));
  assert.notEqual(await live.parcelLiveIngestDigest({sessionId,frameId,jpegBase64:'YQ=='}),await live.parcelLiveIngestDigest({sessionId,frameId,jpegBase64:'Yg=='}));
  assert.match(key,/^[a-f0-9]{64}$/);
});
test('actor locks and frame claims match every original coordinate including generation',()=>{
  const lock={ownerId:'scope',actorUid:'actor',sessionId,startReceiptKey:sha,nonce:operationId,generation:1,expiresAt:now+120000};
  assert.equal(live.matchesParcelLiveActorLock(lock,{...lock}),true);
  for(const key of Object.keys(lock))assert.equal(live.matchesParcelLiveActorLock(lock,{...lock,[key]:key==='generation'?2:key==='expiresAt'?now:frameId}),false,key);
  assert.equal(live.matchesParcelLiveActorLock({},{}),false);
  const claim={...lock,frameId,frameReceiptKey:'b'.repeat(64),sequence:1,frameNonce:frameId,frameExpiresAt:now+60000};
  assert.equal(live.matchesParcelLiveFrameClaim(claim,{...claim}),true);
  for(const key of Object.keys(claim))assert.equal(live.matchesParcelLiveFrameClaim(claim,{...claim,[key]:null}),false,key);
});
test('current read and capture policies retain shared historical reads and stage restrictions',()=>{
  const input={account:{status:'Approved',active:true},scopeId:'scope',ownerId:'scope',role:'Warehouse',actorUid:'actor',shipmentStatus:'Prepared',stage:'Pre-dispatch'};
  assert.equal(live.canReadParcelLive(input),true);assert.equal(live.canStartParcelLive(input),true);
  assert.equal(live.canStartParcelLive({...input,stage:'Delivery',shipmentStatus:'Dispatched'}),false);
  assert.equal(live.canStartParcelLive({...input,role:'Driver',stage:'Delivery',shipmentStatus:'Dispatched',assignedDriverUid:'actor'}),true);
  assert.equal(live.canStartParcelLive({...input,role:'Driver',stage:'Delivery',shipmentStatus:'Dispatched',assignedDriverUid:'other'}),false);
  assert.equal(live.canReadParcelLive({...input,account:{status:'Disabled',active:false}}),false);
});
test('session DTO strips private fields, freezes policy binding and returns independent lineage',()=>{
  const raw={...session(),nonce:'private',snapshots:{private:true},jpegBase64:'private',error:'private',model:{...model(),serviceKey:'private'}};
  const dto=live.toPublicParcelLiveSession(raw);
  assert.equal(JSON.stringify(dto).includes('private'),false);dto.model.classOrder.reverse();assert.deepEqual(raw.model.classOrder,['Normal','Damaged']);
  for(const changes of [{policy:{...live.PARCEL_LIVE_POLICY,sha256:'b'.repeat(64)}},{state:'Open',model:null},{expiresAt:now+120001},{inFlightFrameId:frameId},{completedCount:1},{reasonCode:'raw error'},{generation:0}])assert.throws(()=>live.toPublicParcelLiveSession({...session(),...changes}));
});
test('session unavailable and terminal states have safe reasons and no active slot',()=>{
  assert.equal(live.toPublicParcelLiveSession({...session(),state:'Unavailable',model:null,reasonCode:'model-unavailable'}).model,null);
  for(const [state,reasonCode] of [['Stopped','user-stop'],['Stale','context-changed'],['Expired','session-expired']]){
    const value={...session(),state,reasonCode,generation:2,version:2,updatedAt:now+(state==='Expired'?120000:10),stoppedAt:state==='Stopped'?now+10:null};
    assert.equal(live.toPublicParcelLiveSession(value).state,state);
    assert.throws(()=>live.toPublicParcelLiveSession({...value,inFlightFrameId:frameId}));
  }
});
test('reservation budget, cadence, lease and expiry use strict server boundaries',()=>{
  const s=session();assert.equal(live.parcelLiveSessionExpiresAt(now),now+120000);assert.equal(live.parcelLiveFrameExpiresAt(now+100000,s.expiresAt),s.expiresAt);
  assert.equal(live.canReserveParcelLiveFrame(s,now),true);
  const used={...s,reservedCount:1,completedCount:1,lastReservedAt:now};
  assert.equal(live.canReserveParcelLiveFrame(used,now+4999),false);assert.equal(live.canReserveParcelLiveFrame(used,now+5000),true);
  assert.equal(live.canReserveParcelLiveFrame({...used,reservedCount:12,completedCount:12},now+5000),false);
  assert.equal(live.canReserveParcelLiveFrame({...used,inFlightFrameId:frameId,completedCount:0},now+5000),false);
  assert.equal(live.canReserveParcelLiveFrame(s,now+120000),false);
  assert.equal(live.isParcelLiveSessionExpired(s,now+120000),true);assert.equal(live.isParcelLiveFrameExpired(frame(),now+60000),true);
  const active={...s,reservedCount:1,lastReservedAt:now,inFlightFrameId:frameId};
  assert.equal(live.canCompleteParcelLiveFrame(active,{...frame(),state:'Running',version:2},now+59999),true);
  assert.equal(live.canCompleteParcelLiveFrame(active,frame(),now+60000),false);
  assert.equal(live.canCompleteParcelLiveFrame({...active,generation:2},frame(),now+1),false);
});
test('completion rejects frames with unbound session lease, reservation time or lineage',()=>{
  const active={...session(),reservedCount:1,lastReservedAt:now,inFlightFrameId:frameId};
  const running={...frame(),state:'Running',version:2};
  for(const changes of [{expiresAt:now+59999},{reservedAt:now+1,updatedAt:now+1},{model:null},{model:{...model(),selectionSha256:'f'.repeat(64)}}])assert.equal(live.canCompleteParcelLiveFrame(active,{...running,...changes},now+10),false);
});
test('all admitted frame states and previously open sessions retain selected model lineage',()=>{
  assert.throws(()=>live.toPublicParcelLiveFrame({...frame(),model:null}));
  assert.throws(()=>live.toPublicParcelLiveSession({...session(),state:'Stopped',reasonCode:'user-stop',model:null,generation:2,version:2,stoppedAt:now+10,updatedAt:now+10}));
});
test('canonical identity helpers reject prototype pollution, cycles and invalid coordinate scopes',async()=>{
  const polluted=Object.create(null);polluted.__proto__='bad';assert.throws(()=>live.canonicalParcelLiveValue(polluted));
  const cyclic={};cyclic.self=cyclic;assert.throws(()=>live.canonicalParcelLiveValue(cyclic));
  assert.throws(()=>live.canonicalParcelLiveValue({zero:-0}));
  assert.throws(()=>live.canonicalParcelLiveValue(Object.defineProperty({},'data',{enumerable:true,get(){throw new Error('private');}})),error=>error.code==='invalid-argument');
  await assert.rejects(()=>live.parcelLiveStartReceiptKey('../scope','actor',operationId));
  await assert.rejects(()=>live.parcelLiveFrameKey('scope',sessionId,'bad'));
});
test('frame DTO strips secrets and retains declared metadata separately from verified image identity',()=>{
  const dto=live.toPublicParcelLiveFrame({...frame(),nonce:'private',path:'private',jpegBase64:'private'});
  assert.equal(JSON.stringify(dto).includes('private'),false);assert.equal(dto.retention,'Unverified');assert.equal(dto.image,null);
  for(const changes of [{label:'Normal'},{probabilities:[0.5,0.5]},{image:verified()},{retention:'Verified'},{reviewStatus:'Pending'},{reasonCode:'raw error'},{expiresAt:now+60001},{sessionGeneration:0}])assert.throws(()=>live.toPublicParcelLiveFrame({...frame(),...changes}));
});
test('predicted DTO binds verified identity, score winner, times and Pending review',()=>{
  assert.equal(live.toPublicParcelLiveFrame(predicted()).label,'Normal');
  for(const changes of [{retention:'Unknown',image:null},{image:{...verified(),generation:'0123'}},{image:{...verified(),sha256:'b'.repeat(64)}},{label:'Damaged'},{probabilities:[0.5,0.5],confidence:0.5},{probabilities:new Array(2)},{confidence:0.9},{processingTimeMs:25001},{totalProcessingTimeMs:30001},{completedAt:now+60000,updatedAt:now+60000},{reviewStatus:'NotApplicable'},{reasonCode:'invalid-response'}])assert.throws(()=>live.toPublicParcelLiveFrame({...predicted(),...changes}));
});
test('frame DTO uses indexed scores for confidence and safe copies despite inherited iterators',()=>{
  const prototype=Object.create(Array.prototype);
  Object.defineProperty(prototype,Symbol.iterator,{value:function*(){yield 'PRIVATE';yield 'LEAK';}});
  const probabilities=Object.setPrototypeOf([0.8,0.2],prototype);
  const dto=live.toPublicParcelLiveFrame({...predicted(),probabilities});
  assert.deepEqual(dto.probabilities,[0.8,0.2]);
  assert.throws(()=>live.toPublicParcelLiveFrame({...predicted(),probabilities,confidence:0.9}));
});
test('Abstained tie stays null, Verified and reviewable only as Reviewed',()=>{
  const abstained={...predicted(),state:'Abstained',label:null,probabilities:[0.5,0.5],confidence:0.5};
  assert.equal(live.toPublicParcelLiveFrame(abstained).label,null);
  assert.throws(()=>live.toPublicParcelLiveFrame({...abstained,label:'Normal'}));
  assert.throws(()=>live.toPublicParcelLiveFrame({...abstained,probabilities:[0.4,0.6],confidence:0.6}));
  assert.throws(()=>live.toPublicParcelLiveFrame({...abstained,version:4,reviewStatus:'Accepted',humanReviewRequired:false,reviewNotes:'checked',reviewedBy:'manager',reviewedAt:now+30,updatedAt:now+30}));
});
test('every non-inference terminal is null-safe including retained or ambiguous stopped bytes',()=>{
  for(const [state,reasonCode] of [['Unavailable','model-unavailable'],['Failed','invalid-image'],['Stale','context-changed'],['Expired','frame-expired'],['Cancelled','session-stopped']])for(const retention of ['Unverified','Unknown','Verified']){
    const value={...frame(),state,reasonCode,version:3,completedAt:now+(state==='Expired'?60000:10),updatedAt:now+(state==='Expired'?60000:10),retention,image:retention==='Verified'?verified():null};
    const dto=live.toPublicParcelLiveFrame(value);assert.equal(dto.label,null);assert.equal(dto.reviewStatus,'NotApplicable');
    assert.throws(()=>live.toPublicParcelLiveFrame({...value,label:'Normal'}));
  }
});
test('review validates current frame version and preserves all original inference and image fields',()=>{
  const input={sessionId,frameId,version:3,decision:'Accepted',notes:'Visible parcel inspected'};
  const dto=live.reviewParcelLiveFrameRecord(predicted(),input,{role:'Manager',reviewerUid:'manager',nowMs:now+30});
  assert.equal(dto.version,4);assert.equal(dto.reviewStatus,'Accepted');assert.equal(dto.humanReviewRequired,false);assert.deepEqual(dto.probabilities,[0.8,0.2]);assert.deepEqual(dto.image,verified());
  assert.throws(()=>live.reviewParcelLiveFrameRecord(dto,input,{role:'Manager',reviewerUid:'manager',nowMs:now+40}));
  assert.throws(()=>live.reviewParcelLiveFrameRecord(predicted(),input,{role:'Driver',reviewerUid:'driver',nowMs:now+30}));
});
