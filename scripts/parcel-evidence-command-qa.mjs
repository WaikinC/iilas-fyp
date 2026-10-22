// External Firebase boundaries only are faked; executeCommand and approval logic are real.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mock,test} from 'node:test';
const require=createRequire(new URL('../backend/functions/service.mjs',import.meta.url));
let database,object,reads;
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>database);
mock.method(require('firebase-admin/storage'),'getStorage',()=>({bucket:()=>({file:()=>object})}));
const {executeCommand}=await import('../backend/functions/service.mjs');
function fixture({stage='Pre-dispatch',role='Warehouse',status='Prepared'}={}){
  reads=0;
  const records=new Map(Object.entries({
    'system/config':{dataScopeId:'scope'},
    'users/actor':{role,active:true,status:'Approved'},
    'shipments/shipment':{ownerId:'scope',status,version:7,reference:'SHIP'},
    'transportPlans/shipment':{ownerId:'scope',driverUid:'actor'},
  }));
  const snapshot=path=>({exists:records.has(path),data:()=>records.get(path)});
  const reference=path=>({path,get:async()=>snapshot(path)});
  database={doc:reference,collection:kind=>({doc:key=>reference(`${kind}/${key}`)}),
    async runTransaction(work){const writes=[];const result=await work({get:async ref=>snapshot(ref.path),set:(ref,value)=>writes.push([ref.path,value])});for(const [key,value]of writes)records.set(key,value);return result;}};
  const metadata={size:'3',contentType:'image/png',metadata:{actor:'actor',stage,evidenceType:'Parcel Image',captureSource:'file',capturedAtClient:''}};
  object={getMetadata:async()=>{reads++;return [metadata];},download:async()=>{reads++;return [Buffer.from('png')];}};
  const input={id:'photo',shipmentId:'shipment',path:'evidence/scope/shipment/photo',type:'Parcel Image',name:'photo.png',stage,captureSource:'file',capturedAtClient:null};
  return {records,metadata,input,command:()=>executeCommand({uid:'actor'},{action:'registerEvidence',input}),change:(path,value)=>records.set(path,{...records.get(path),...value})};
}
test('Prepared warehouse registration saves explicit provenance and final shipment version',async()=>{
  const state=fixture();await state.command();
  const saved=state.records.get('evidence/photo');
  assert.equal(saved.stage,'Pre-dispatch');assert.equal(saved.captureSource,'file');
  assert.equal(saved.capturedAtClient,null);assert.equal(saved.shipmentVersionAtRegistration,7);assert.equal(saved.integrityVersion,2);
});
for(const [name,options,path,change]of [
  ['wrong status',{role:'Admin'},'shipments/shipment',{status:'Dispatched'}],
  ['foreign shipment',{role:'Admin'},'shipments/shipment',{ownerId:'foreign'}],
  ['pre-dispatch driver',{role:'Driver'},null,null],
  ['unassigned driver',{role:'Driver',stage:'Delivery',status:'Dispatched'},'transportPlans/shipment',{driverUid:'other'}],
  ['revoked approval',{},'users/actor',{status:'Rejected'}],
]){
  test(`${name} is denied before accessing object metadata or bytes`,async()=>{
    const state=fixture(options);if(path)state.change(path,change);
    await assert.rejects(state.command());assert.equal(reads,0);assert.equal(state.records.has('evidence/photo'),false);
  });
}
for(const [name,path,change]of [
  ['dispatch','shipments/shipment',{status:'Dispatched'}],
  ['disabled account','users/actor',{active:false}],
  ['scope switch','system/config',{dataScopeId:'foreign'}],
  ['role change','users/actor',{role:'Viewer'}],
]){
  test(`${name} during download prevents evidence and audit writes`,async()=>{
    const state=fixture({role:'Admin'});let downloaded=false;object.download=async()=>{downloaded=true;state.change(path,change);return [Buffer.from('png')];};
    await assert.rejects(state.command());assert.equal(state.records.has('evidence/photo'),false);
    assert.equal(downloaded,true);
    assert.equal([...state.records.keys()].some(key=>key.startsWith('auditLogs/')),false);
  });
}
test('driver reassignment during download blocks Delivery registration',async()=>{
  const state=fixture({stage:'Delivery',status:'Dispatched',role:'Driver'});
  object.download=async()=>{state.change('transportPlans/shipment',{driverUid:'other'});return [Buffer.from('png')];};
  await assert.rejects(state.command());assert.equal(state.records.has('evidence/photo'),false);
});
for(const [field,value]of [['stage','Delivery'],['evidenceType','Proof of Delivery'],['captureSource','camera'],['capturedAtClient','2026-10-20T10:00:00.000Z'],['actor','other']]){
  test(`Storage ${field} mismatch cannot register evidence`,async()=>{
    const state=fixture({stage:'Delivery',status:'Dispatched',role:'Logistics'});
    state.metadata.metadata[field]=field==='stage'?'Pre-dispatch':value;
    await assert.rejects(state.command());assert.equal(state.records.has('evidence/photo'),false);
  });
}
