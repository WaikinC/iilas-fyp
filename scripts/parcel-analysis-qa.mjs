import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as a from '../lib/parcelAnalysis.js';

const op='12345678-1234-4123-8123-123456789abc';
const hash='a'.repeat(64);
const model={model:'MobileNetV2',modelVersion:hash,selectionSha256:hash,evaluationSha256:hash,acceptanceSha256:hash,preprocessing:'mobilenet-v2',contrast:'clahe',classOrder:['Normal','Damaged']};
const bindings=()=>({ownerId:'scope',analysisId:'analysis',actorUid:'actor',operationId:op,shipmentId:'shipment',evidenceId:'evidence',evidenceVersion:2,evidenceSha256:hash,stage:'Pre-dispatch',shipmentVersion:3,captureSource:'file',capturedAtClient:null,model:null});
const access={account:{status:'Approved',active:true},scopeId:'scope',ownerId:'scope',role:'Warehouse',shipmentStatus:'Prepared',stage:'Pre-dispatch',actorUid:'actor',assignedDriverUid:null,type:'Parcel Image',integrityVersion:2};
const predicted=()=>a.finishParcelAnalysis(a.createRunningParcelAnalysis({...bindings(),model},1000),{state:'Predicted',label:'Damaged',probabilities:[0.2,0.8],confidence:0.8,model,serviceRequestId:op,processingTimeMs:12,totalProcessingTimeMs:20},2000);

test('complete experimental model survives public roundtrip and human review without acceptance',()=>{
  const experimental={...model,acceptanceSha256:null,evaluationKind:'local-experimental',evaluationManifestSha256:hash};
  const running=a.createRunningParcelAnalysis({...bindings(),model:experimental},1000);
  const result=a.finishParcelAnalysis(running,{state:'Predicted',label:'Damaged',probabilities:[0.2,0.8],confidence:0.8,model:experimental,serviceRequestId:op,processingTimeMs:12,totalProcessingTimeMs:20},2000);
  const reviewed=a.reviewParcelAnalysis(result,{analysisId:'analysis',version:2,decision:'Accepted',notes:'Visible face inspected'},{reviewerUid:'admin',role:'Admin',nowMs:3000});
  assert.deepEqual(a.toPublicParcelAnalysis(JSON.parse(JSON.stringify(reviewed))).model,experimental);
  for(const patch of [{evaluationKind:null},{evaluationManifestSha256:null},{acceptanceSha256:hash},{evaluationKind:undefined}])assert.throws(()=>a.createRunningParcelAnalysis({...bindings(),model:{...experimental,...patch}},1000));
  assert.throws(()=>a.createRunningParcelAnalysis({...bindings(),model:{...model,evaluationManifestSha256:hash}},1000));
  for(const patch of [{evaluationOnly:true},{runtimeMode:'local-evaluation'},{operationally_approved:false}])assert.throws(()=>a.createRunningParcelAnalysis({...bindings(),model:{...model,...patch}},1000));
});

test('start only accepts evidence and a UUID v4, never caller-owned outcome or scope',()=>{
  assert.deepEqual(a.validateStartParcelAnalysis({evidenceId:'evidence',operationId:op}),{evidenceId:'evidence',operationId:op});
  for(const value of [null,[],{evidenceId:'../file',operationId:op},{evidenceId:'evidence',operationId:'123'}, {evidenceId:'evidence',operationId:op,ownerId:'scope'},{evidenceId:'evidence',operationId:op,label:'Normal'}])assert.throws(()=>a.validateStartParcelAnalysis(value));
});
test('resolve and review reject stale/coerced versions, missing notes and extra fields',()=>{
  assert.deepEqual(a.validateResolveParcelAnalysis({analysisId:'analysis'}),{analysisId:'analysis'});
  assert.throws(()=>a.validateResolveParcelAnalysis({analysisId:'analysis',nonce:'private'}));
  assert.deepEqual(a.validateParcelAnalysisReview({analysisId:'analysis',version:2,decision:'Reviewed',notes:'Needs physical inspection'}),{analysisId:'analysis',version:2,decision:'Reviewed',notes:'Needs physical inspection'});
  for(const input of [{version:'2'},{version:0},{notes:''},{decision:'Normal'},{label:'Normal'}])assert.throws(()=>a.validateParcelAnalysisReview({analysisId:'analysis',version:2,decision:'Reviewed',notes:'Inspect parcel',...input}));
});
test('cleanup accepts only an analysis ID and optional strict pending UUID without caller authority fields',()=>{
  assert.deepEqual(a.validateCleanupParcelAnalysis({analysisId:'analysis'}),{analysisId:'analysis'});assert.deepEqual(a.validateCleanupParcelAnalysis({analysisId:'analysis',pendingOperationId:op}),{analysisId:'analysis',pendingOperationId:op});
  for(const patch of [{pendingOperationId:undefined},{pendingOperationId:'invalid'},{pendingOperationId:1},{evaluationKind:'local-experimental'},{ownerId:'scope'}])assert.throws(()=>a.validateCleanupParcelAnalysis({analysisId:'analysis',...patch}));
  let accessed=false;const getter={analysisId:'analysis'};Object.defineProperty(getter,'pendingOperationId',{get(){accessed=true;return op;},enumerable:true});assert.throws(()=>a.validateCleanupParcelAnalysis(getter));assert.equal(accessed,false);
});
test('new analysis uses current stage matrix while approved historical readers retain access',()=>{
  assert.equal(a.canStartParcelAnalysis(access),true);
  for(const delta of [{role:'Viewer'},{role:'Inventory'},{role:'Driver'},{shipmentStatus:'Dispatched'},{stage:null},{type:'Proof of Delivery'},{integrityVersion:1},{ownerId:'other'},{account:{status:'Disabled',active:false}}])assert.equal(a.canStartParcelAnalysis({...access,...delta}),false);
  assert.equal(a.canStartParcelAnalysis({...access,stage:'Delivery',shipmentStatus:'Dispatched',role:'Driver',assignedDriverUid:'actor'}),true);
  assert.equal(a.canStartParcelAnalysis({...access,stage:'Delivery',shipmentStatus:'Dispatched',role:'Driver',assignedDriverUid:'other'}),false);
  assert.equal(a.canReadParcelAnalysis({...access,role:'Viewer',stage:null,shipmentStatus:'Delivered'}),true);
  assert.equal(a.canReadParcelAnalysis({...access,account:{status:'Pending',active:true}}),false);
});
test('lease admits completion just before 90 seconds and only expiry at the exact boundary',()=>{
  const running=a.createRunningParcelAnalysis(bindings(),1000);
  assert.equal(running.expiresAt,91000);
  assert.equal(a.canCompleteParcelAnalysis(running,90999),true);
  assert.equal(a.canCompleteParcelAnalysis(running,91000),false);
  assert.equal(a.isParcelAnalysisExpired(running,90999),false);
  assert.equal(a.isParcelAnalysisExpired(running,91000),true);
  assert.throws(()=>a.finishParcelAnalysis(running,{state:'Expired',reasonCode:'lease-expired'},90999));
  assert.equal(a.finishParcelAnalysis(running,{state:'Expired',reasonCode:'lease-expired'},91000).label,null);
  assert.throws(()=>a.finishParcelAnalysis(running,{state:'Unavailable',reasonCode:'model-unavailable'},91000));
});
test('all nonprediction terminals carry null labels, no fabricated scores and fixed safe reasons',()=>{
  for(const [state,reasonCode] of [['Unavailable','model-unavailable'],['Failed','service-failed'],['Stale','context-changed'],['Expired','lease-expired']]){
    const r=a.finishParcelAnalysis(a.createRunningParcelAnalysis(bindings(),1000),{state,reasonCode},state==='Expired'?91000:2000);
    assert.equal(r.label,null);assert.equal(r.probabilities,null);assert.equal(r.model,null);
    assert.throws(()=>a.finishParcelAnalysis(a.createRunningParcelAnalysis(bindings(),1000),{state,reasonCode,label:'Normal'},state==='Expired'?91000:2000));
  }
  assert.throws(()=>a.finishParcelAnalysis(a.createRunningParcelAnalysis(bindings(),1000),{state:'Failed',reasonCode:'https://private-service/token'},2000));
  assert.throws(()=>a.finishParcelAnalysis(a.createRunningParcelAnalysis(bindings(),1000),{state:'Failed',reasonCode:'service-failed',probabilities:[1,0]},2000));
});
test('predictions preserve exact model binding, valid scores and separate service ID',()=>{
  const r=predicted();
  assert.equal(r.state,'Predicted');assert.equal(r.label,'Damaged');assert.equal(r.reviewStatus,'Pending');assert.equal(r.predictionId,'parcel-analysis');assert.equal(r.humanReviewRequired,true);
  const running=a.createRunningParcelAnalysis({...bindings(),model},1000);
  const result={state:'Predicted',label:'Damaged',probabilities:[0.2,0.8],confidence:0.8,model,serviceRequestId:op,processingTimeMs:12,totalProcessingTimeMs:20};
  for(const delta of [{label:'Normal'},{probabilities:[0.2,0.2]},{confidence:0.2},{model:{...model,acceptanceSha256:'b'.repeat(64)}},{model:{...model,classOrder:['Damaged','Normal']}},{totalProcessingTimeMs:30001}])assert.throws(()=>a.finishParcelAnalysis(running,{...result,...delta},2000));
});
test('abstention has no projection or AI label and can be acknowledged without training labels',()=>{
  const r=a.finishParcelAnalysis(a.createRunningParcelAnalysis({...bindings(),model},1000),{state:'Abstained',label:null,probabilities:[0.5,0.5],confidence:0.5,model,serviceRequestId:op,processingTimeMs:12,totalProcessingTimeMs:20},2000);
  assert.equal(r.label,null);assert.equal(r.predictionId,null);assert.equal(r.reviewStatus,'Pending');
  const reviewed=a.reviewParcelAnalysis(r,{analysisId:'analysis',version:2,decision:'Reviewed',notes:'Inspect parcel manually'},{reviewerUid:'manager',role:'Manager',nowMs:3000});
  assert.equal(reviewed.label,null);assert.equal(reviewed.reviewStatus,'Reviewed');assert.equal(reviewed.version,3);assert.equal(reviewed.humanReviewRequired,false);
  assert.throws(()=>a.reviewParcelAnalysis(r,{analysisId:'analysis',version:2,decision:'Accepted',notes:'Looks normal'},{reviewerUid:'manager',role:'Manager',nowMs:3000}));
});
test('terminal inference cannot be replaced and review changes only separate versioned review fields',()=>{
  const r=predicted();const before=structuredClone(r);
  assert.throws(()=>a.finishParcelAnalysis(r,{state:'Failed',reasonCode:'service-failed'},3000));
  const input={analysisId:'analysis',version:2,decision:'Accepted',notes:'Confirmed visible condition'};
  for(const delta of [{role:'Warehouse'},{reviewerUid:''}])assert.throws(()=>a.reviewParcelAnalysis(r,input,{reviewerUid:'manager',role:'Manager',nowMs:3000,...delta}));
  assert.throws(()=>a.reviewParcelAnalysis(r,{...input,version:1},{reviewerUid:'manager',role:'Manager',nowMs:3000}));
  const reviewed=a.reviewParcelAnalysis(r,input,{reviewerUid:'manager',role:'Manager',nowMs:3000});
  assert.equal(reviewed.reviewStatus,'Accepted');assert.equal(reviewed.label,'Damaged');assert.deepEqual(reviewed.model,before.model);assert.equal(reviewed.completedAt,2000);assert.deepEqual(r,before);
  assert.throws(()=>a.reviewParcelAnalysis(reviewed,{...input,version:3},{reviewerUid:'manager',role:'Manager',nowMs:4000}));
});
test('public DTO is fixed, rejects corrupt records and cannot leak nested private service fields',()=>{
  const r=predicted();const dto=a.toPublicParcelAnalysis({...r,nonce:'private',storagePath:'private',receiptKey:'private',error:new Error('private'),model:{...r.model,token:'private'}});
  assert.equal(JSON.stringify(dto).includes('private'),false);
  dto.model.classOrder[0]='Changed';assert.equal(r.model.classOrder[0],'Normal');
  assert.throws(()=>a.toPublicParcelAnalysis({...r,state:'Unavailable'}));
  assert.throws(()=>a.toPublicParcelAnalysis({...r,evidenceSha256:'bad'}));
});
test('claim coordinate check fences a predecessor from successor locks',()=>{
  const claim={ownerId:'scope',evidenceId:'evidence',analysisId:'analysis',receiptKey:'receipt',nonce:op,expiresAt:91000};
  assert.equal(a.matchesParcelAnalysisClaim(claim,{...claim}),true);
  for(const key of Object.keys(claim))assert.equal(a.matchesParcelAnalysisClaim(claim,{...claim,[key]:key==='expiresAt'?92000:'successor'}),false);
  assert.equal(a.matchesParcelAnalysisClaim({},{}),false);
});
test('a new request requires an authenticated actor even for privileged roles',()=>{
  assert.equal(a.canStartParcelAnalysis({...access,actorUid:''}),false);
  assert.equal(a.canStartParcelAnalysis({...access,actorUid:undefined}),false);
});
test('confidence cannot cross a probability boundary through numeric tolerance',()=>{
  const running=a.createRunningParcelAnalysis({...bindings(),model},1000);
  assert.throws(()=>a.finishParcelAnalysis(running,{state:'Predicted',label:'Normal',probabilities:[1,0],confidence:1.0000001,model,serviceRequestId:op,processingTimeMs:12,totalProcessingTimeMs:20},2000));
});
test('stage role matrix keeps Logistics Prepared and rejects every unsupported stage',()=>{
  for(const role of ['Admin','Manager','Warehouse','Logistics','Driver','Inventory','Viewer']){
    assert.equal(a.canStartParcelAnalysis({...access,role}),['Admin','Manager','Warehouse','Logistics'].includes(role));
    assert.equal(a.canStartParcelAnalysis({...access,role,stage:'Delivery',shipmentStatus:'Dispatched',assignedDriverUid:'actor'}),['Admin','Manager','Logistics','Driver'].includes(role));
  }
  assert.equal(a.canStartParcelAnalysis({...access,stage:'Legacy'}),false);
});
test('lease helpers fail closed on missing, invalid or forged creation/expiry coordinates',()=>{
  for(const record of [{state:'Running',expiresAt:91000},{state:'Running',createdAt:'1000',expiresAt:91000},{state:'Running',createdAt:1000,expiresAt:92000},{state:'Running',createdAt:NaN,expiresAt:91000}]){
    assert.equal(a.canCompleteParcelAnalysis(record,2000),false);
    assert.equal(a.isParcelAnalysisExpired(record,100000),false);
  }
  assert.equal(a.canCompleteParcelAnalysis({state:'Running',createdAt:1000,expiresAt:91000},999),false);
});
test('inference rejects sparse scores and inherited or missing own probability indices',()=>{
  const inherited=Array(2);Object.setPrototypeOf(inherited,Object.assign(Object.create(Array.prototype),{0:0.2,1:0.8}));
  const partlyInherited=[0.2,,];Object.setPrototypeOf(partlyInherited,Object.assign(Object.create(Array.prototype),{1:0.8}));
  for(const [probabilities,state,label,confidence] of [[Array(2),'Abstained',null,0.5],[[,0.8],'Predicted','Damaged',0.8],[[0.2,,],'Predicted','Damaged',0.8],[inherited,'Predicted','Damaged',0.8],[partlyInherited,'Predicted','Damaged',0.8]]){
    const running=a.createRunningParcelAnalysis({...bindings(),model},1000);
    assert.throws(()=>a.finishParcelAnalysis(running,{state,label,probabilities,confidence,model,serviceRequestId:op,processingTimeMs:12,totalProcessingTimeMs:20},2000));
  }
});
test('model class order rejects sparse arrays whose labels are inherited',()=>{
  const classOrder=Array(2);Object.setPrototypeOf(classOrder,Object.assign(Object.create(Array.prototype),{0:'Normal',1:'Damaged'}));
  assert.throws(()=>a.createRunningParcelAnalysis({...bindings(),model:{...model,classOrder}},1000));
  const partlyInherited=['Normal',,];Object.setPrototypeOf(partlyInherited,Object.assign(Object.create(Array.prototype),{1:'Damaged'}));
  assert.throws(()=>a.createRunningParcelAnalysis({...bindings(),model:{...model,classOrder:partlyInherited}},1000));
});
