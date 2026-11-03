import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateMobileRequest,parseMobilePayload,validateMobileResult,shouldReplaceLatest,validateMobilePage,validateMobileShipment,validateBridgeEvent} from '../lib/mobileDelivery.js';
const uuid='00000000-0000-4000-8000-000000000001';
const request=(action,payload)=>({protocol:'mobile-command-1.0',operationId:uuid,action,payloadJson:JSON.stringify(payload)});
const point={sampleId:uuid,sequence:1,capturedAtMs:1793000000000,latitude:3.12,longitude:101.5,accuracy:8};
const start=request('tracking.start',{shipmentId:'shipment_1',installationId:uuid});
const sha=value=>createHash('sha256').update(value).digest('hex');
test('authority injection, accessors, prototypes and malformed envelopes are refused without executing code',()=>{
 assert.equal(validateMobileRequest(start).payloadJson,start.payloadJson);
 for(const bad of [{...start,uid:'forged'},{...start,action:'sql'},{...start,operationId:'x'},{...start,payloadJson:'x'.repeat(32769)}])assert.throws(()=>validateMobileRequest(bad));
 let called=false;assert.throws(()=>validateMobileRequest(Object.defineProperty({},'protocol',{get(){called=true;}})));assert.equal(called,false);
 assert.throws(()=>validateMobileRequest(Object.assign(Object.create({x:1}),start)));
 assert.throws(()=>parseMobilePayload({...start,payloadJson:'{"shipmentId":"s","installationId":"'+uuid+'","__proto__":{}}'}));
});
test('GPS rejects oversized, invalid, duplicate or backwards samples',()=>{
 const valid=request('tracking.points',{sessionId:uuid,points:[point]});assert.equal(parseMobilePayload(valid).points[0].latitude,3.12);
 for(const points of [[],Array(26).fill(point),[point,point],[{...point,latitude:91}],[{...point,longitude:Infinity}],[{...point,accuracy:-1}],[{...point,sequence:0}],[point,{...point,sampleId:'00000000-0000-4000-8000-000000000002',sequence:2,capturedAtMs:1}]])assert.throws(()=>parseMobilePayload(request('tracking.points',{sessionId:uuid,points})));
});
test('status payload cannot silently rebase or supply forged authority',()=>{
 const data={shipmentId:'s',expectedVersion:0,expectedShipmentVersion:2,expectedAssignmentVersion:1,status:'In Transit',notes:'Leaving depot',proofId:null};
 assert.deepEqual(parseMobilePayload(request('delivery.update',data)),data);
 for(const patch of [{expectedVersion:-1},{status:'Delivered',proofId:null},{actor:'x'},{notes:''}])assert.throws(()=>parseMobilePayload(request('delivery.update',{...data,...patch})));
});
test('proof is bounded, closed and limited to existing file evidence types',()=>{
 const data={shipmentId:'s',evidenceId:uuid,type:'Proof of Delivery',stage:'Delivery',name:'proof.pdf',contentType:'application/pdf',bytes:100,sha256:'a'.repeat(64),captureSource:'file',capturedAtClient:null};
 assert.equal(parseMobilePayload(request('evidence.prepare',data)).bytes,100);
 for(const patch of [{bytes:10485761},{contentType:'text/html'},{captureSource:'camera'},{path:'/elsewhere'},{sha256:'x'}])assert.throws(()=>parseMobilePayload(request('evidence.prepare',{...data,...patch})));
});
test('matching immutable results are required and rejection/cancellation cannot pretend success',()=>{
 const result={protocol:start.protocol,operationId:uuid,action:start.action,requestSha256:sha(start.payloadJson),state:'Committed',recordId:uuid,version:1,reason:null,replayed:false,data:{sessionId:uuid,serverNowMs:100,leaseUntilMs:1800100,absoluteUntilMs:14400100,intervalMs:20000}};
 assert.equal(validateMobileResult(result,start).data.intervalMs,20000);
 for(const patch of [{requestSha256:'b'.repeat(64)},{action:'tracking.stop'},{state:'Cancelled'},{data:{...result.data,token:'secret'}},{version:-1},{extra:true}])assert.throws(()=>validateMobileResult({...result,...patch},start));
 assert.equal(validateMobileResult({...result,state:'Rejected',recordId:null,version:null,data:null,reason:'assignment_changed'},start).state,'Rejected');
});
test('raw Unicode and negative-zero payload bytes remain unchanged for correlation',()=>{
 const value={...start,payloadJson:'{ "shipmentId":"s", "installationId":"'+uuid+'" }'};
 assert.equal(validateMobileRequest(value).payloadJson,value.payloadJson);
 assert.notEqual(sha(value.payloadJson),sha(start.payloadJson));
 const gps=request('tracking.points',{sessionId:uuid,points:[{...point,longitude:-0}]});assert.equal(parseMobilePayload(gps).points[0].longitude,0);
});
test('late GPS never replaces a newer legacy/manual point, and ties retain existing',()=>{
 assert.equal(shouldReplaceLatest({capturedAtMs:100},{submittedAtMs:200}),false);
 assert.equal(shouldReplaceLatest({capturedAtMs:200},{submittedAt:{seconds:0,nanoseconds:200000000}}),false);
 assert.equal(shouldReplaceLatest({capturedAtMs:201},{submittedAtMs:200}),true);
 assert.equal(shouldReplaceLatest({capturedAtMs:201},null),true);
 assert.throws(()=>shouldReplaceLatest({capturedAtMs:NaN},null));
});
test('cache projections and bridge events reject extra protected data',()=>{
 const shipment={id:'s',reference:'S-1',recipient:'Demo',address:'Demo address',expectedDelivery:'2026-10-26',shipmentVersion:1,deliveryVersion:0,status:'Dispatched',assignmentVersion:1,proofs:[]};
 assert.equal(validateMobileShipment(shipment).id,'s');
 assert.throws(()=>validateMobileShipment({...shipment,staffDirectory:[]}));
 assert.equal(validateMobilePage({items:[shipment],cursor:null,verifiedAtMs:100}).items.length,1);
 assert.throws(()=>validateMobilePage({items:Array(21).fill(shipment),cursor:null,verifiedAtMs:100}));
 assert.deepEqual(validateBridgeEvent({version:1,pending:2,tracking:'Stopped'}),{version:1,pending:2,tracking:'Stopped'});
 assert.throws(()=>validateBridgeEvent({version:1,pending:2,tracking:'Stopped',token:'bad'}));
});
