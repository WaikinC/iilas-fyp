import test from 'node:test';
import assert from 'node:assert/strict';
const acceptanceModule=await import('../backend/functions/parcelLiveAcceptance.mjs').catch(()=>({}));
const responseModule=await import('../backend/functions/parcelLiveResponse.mjs').catch(()=>({}));
const live=await import('../lib/parcelLive.js').catch(()=>({}));
const sha='a'.repeat(64),sessionId='11111111-1111-4111-8111-111111111111',frameId='22222222-2222-4222-8222-222222222222';
const acceptance=()=>({model:'MobileNetV2',intendedUse:'sampled-live',modelVersion:sha,selectionSha256:'b'.repeat(64),evaluationSha256:'c'.repeat(64),acceptanceSha256:'d'.repeat(64),preprocessing:'mobilenet_v2',contrast:'clahe',classOrder:['Normal','Damaged'],policyVersion:live.PARCEL_LIVE_POLICY?.version,policySha256:live.PARCEL_LIVE_POLICY?.sha256});
const result=()=>({...acceptance(),operationally_approved:true,humanReviewRequired:true,confidenceMeaning:'uncalibrated',evidenceSha256:sha,sessionId,frameId,sequence:1,probabilities:[0.8,0.2],confidence:0.8,label:'Normal',status:'predicted',processingTimeMs:1,totalProcessingTimeMs:2,requestId:'33333333-3333-4333-8333-333333333333'});
const context=()=>({acceptance:acceptance(),evidenceSha256:sha,sessionId,frameId,sequence:1});

test('real live acceptance starts null and validator exports exist',()=>{assert.equal(acceptanceModule.parcelLiveAcceptance,null);assert.equal(typeof acceptanceModule.requireParcelLiveAcceptance,'function');assert.equal(typeof responseModule.validateParcelLiveResponse,'function');});
test('trusted live descriptor binds immutable policy, lineage, order and intended use',()=>{
  assert.deepEqual(acceptanceModule.requireParcelLiveAcceptance(acceptance()),acceptance());
  for(const input of [null,{}, {...acceptance(),intendedUse:'registered-photo'},{...acceptance(),policyVersion:'other'},{...acceptance(),policySha256:'b'.repeat(64)},{...acceptance(),classOrder:['Damaged','Normal']},{...acceptance(),classOrder:new Array(2)},{...acceptance(),modelVersion:'x'},{...acceptance(),operationally_approved:true},Object.create(acceptance())])assert.throws(()=>acceptanceModule.requireParcelLiveAcceptance(input),error=>error.code==='unavailable');
});
test('response binds intended use, every lineage digest and service/session/frame/sequence/evidence identity',()=>{
  assert.equal(responseModule.validateParcelLiveResponse(result(),context()).label,'Normal');
  for(const [key,values] of Object.entries({intendedUse:['registered-photo',null],model:['EfficientNetB0'],policyVersion:['other'],policySha256:['b'.repeat(64)],modelVersion:['b'.repeat(64)],selectionSha256:['c'.repeat(64)],evaluationSha256:['d'.repeat(64)],acceptanceSha256:['e'.repeat(64)],preprocessing:['other'],contrast:['none'],classOrder:[['Damaged','Normal'],new Array(2)],sessionId:[frameId],frameId:[sessionId],sequence:[2,'1'],evidenceSha256:['b'.repeat(64)],operationally_approved:[false],humanReviewRequired:[false],requestId:['bad'],confidenceMeaning:['calibrated']}))for(const value of values)assert.throws(()=>responseModule.validateParcelLiveResponse({...result(),[key]:value},context()),`${key}:${value}`);
});
test('response rejects sparse/NaN/out of range scores, incorrect confidence and timing',()=>{
  for(const changes of [{probabilities:new Array(2)},{probabilities:[NaN,0.2]},{probabilities:[Infinity,0.2]},{probabilities:[1.1,-0.1],confidence:1.1},{probabilities:[0.7,0.2]},{confidence:0.9},{label:'Damaged'},{status:'abstained'},{processingTimeMs:-1},{processingTimeMs:25001},{totalProcessingTimeMs:0},{totalProcessingTimeMs:30001}])assert.throws(()=>responseModule.validateParcelLiveResponse({...result(),...changes},context()));
});
test('ties produce only Abstained/null and response returns safe copied allowlist',()=>{
  const tie={...result(),probabilities:[0.5,0.5],confidence:0.5,label:null,status:'abstained'};
  const safe=responseModule.validateParcelLiveResponse(tie,context());assert.equal(safe.label,null);assert.equal(safe.status,'abstained');
  assert.throws(()=>responseModule.validateParcelLiveResponse({...tie,label:'Normal'},context()));
  assert.throws(()=>responseModule.validateParcelLiveResponse({...result(),rawException:'private',jpegBase64:'private'},context()));
  safe.classOrder.reverse();assert.deepEqual(tie.classOrder,['Normal','Damaged']);
});
test('wire arrays use validated own indices rather than inherited iterator output',()=>{
  const prototype=Object.create(Array.prototype);
  Object.defineProperty(prototype,Symbol.iterator,{value:function*(){yield 'PRIVATE';yield 'LEAK';}});
  const probabilities=Object.setPrototypeOf([0.8,0.2],prototype);
  const classOrder=Object.setPrototypeOf(['Normal','Damaged'],prototype);
  const safe=responseModule.validateParcelLiveResponse({...result(),probabilities,classOrder},context());
  assert.deepEqual(safe.probabilities,[0.8,0.2]);assert.deepEqual(safe.classOrder,['Normal','Damaged']);
  assert.throws(()=>responseModule.validateParcelLiveResponse({...result(),probabilities,confidence:0.9},context()));
});
test('caller flags and missing context cannot authorize response',()=>{
  assert.throws(()=>responseModule.validateParcelLiveResponse(result(),{...context(),acceptance:null}),error=>error.code==='unavailable');
  for(const key of ['sessionId','frameId','sequence','evidenceSha256']){const input=context();delete input[key];assert.throws(()=>responseModule.validateParcelLiveResponse(result(),input));}
});
