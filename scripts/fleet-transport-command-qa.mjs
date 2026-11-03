import assert from 'node:assert/strict';
import {test,beforeEach,mock} from 'node:test';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url));
let rows,rev,failWrite,onRead;
const clone=x=>x===undefined?undefined:structuredClone(x),ref=path=>({path}),sha=x=>createHash('sha256').update(x).digest('hex');
const db={doc:ref,collection:kind=>({doc:id=>ref(kind+'/'+id)}),async runTransaction(work){for(let i=0;i<20;i++){
 const revision=rev,view=new Map([...rows].map(([k,v])=>[k,clone(v)])),writes=[];
 const tx={async get(r){assert.equal(writes.length,0,'read after write');await onRead(r.path);const v=view.get(r.path);return {exists:v!==undefined,id:r.path.split('/').at(-1),ref:r,data:()=>clone(v)};},create(r,v){assert(!view.has(r.path));if(failWrite&&r.path.startsWith(failWrite))throw Error('fixture rollback');writes.push([r.path,v]);},set(r,v){writes.push([r.path,v]);},update(r,v){assert(view.has(r.path));writes.push([r.path,{...view.get(r.path),...v}]);},delete(r){writes.push([r.path,undefined]);}};
 const result=await work(tx);if(rev!==revision)continue;for(const [k,v]of writes){if(v===undefined)rows.delete(k);else rows.set(k,clone(v));}rev++;return result;
 }throw Error('retry exhausted');}};
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>db);mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>({seconds:100,nanoseconds:0}));
const {createFleetTransportCommands}=await import('../backend/functions/fleetTransport.mjs');
const vehicle={ownerId:'scope',name:'ABC-1',capacity:20,status:'Available',maintenanceDate:'2026-10-25',fuelLitres:0,version:1,createdAt:{seconds:1}},driver={ownerId:'scope',name:'Driver One',userId:'driver1',licence:'L1',status:'Available',version:1,createdAt:{seconds:1}};
const call=(action,input,uid='manager',scope='scope')=>createFleetTransportCommands()[action]({uid},scope,input),plan=(patch={})=>({operationId:randomUUID(),shipmentId:'s1',expectedShipmentVersion:2,expectedPlanVersion:1,vehicleId:'v2',driverId:'d2',origin:'Warehouse A',carrier:'Internal',plannedDate:'2026-10-25',distanceKm:20,estimatedHours:1,cost:10,planning:null,...patch});
const edit=(patch={})=>({operationId:randomUUID(),kind:'vehicles',id:'v2',expectedVersion:1,data:{name:'ABC-3',capacity:25,status:'Available',maintenanceDate:'2026-10-25',fuelLitres:0},...patch});
const owned=kind=>[...rows.keys()].filter(k=>k.startsWith(kind+'/'));
beforeEach(()=>{
 rev=0;failWrite=null;onRead=()=>{};rows=new Map([
  ['system/config',{dataScopeId:'scope'}],...['Manager','Viewer','Logistics','Admin'].map(role=>['users/'+role.toLowerCase(),{role,active:true,status:'Approved'}]),
  ['users/driver1',{role:'Driver',active:true,status:'Approved'}],['users/driver2',{role:'Driver',active:true,status:'Approved'}],
  ['products/p',{ownerId:'scope',quantityOnHand:100,reservedQuantity:0,version:1}],['shipments/s1',{ownerId:'scope',status:'Prepared',version:2,parcelCount:4,address:'Recorded destination',reference:'S1',driverUid:'driver1',driver:'Driver One'}],
  ['vehicles/v1',vehicle],['vehicles/v2',{...vehicle,name:'ABC-2'}],['drivers/d1',driver],['drivers/d2',{...driver,userId:'driver2',name:'Driver Two',licence:'L2'}],
  ['transportPlans/s1',{ownerId:'scope',shipmentId:'s1',vehicleId:'v1',driverId:'d1',driverUid:'driver1',status:'Scheduled',version:1,distanceKm:10,estimatedHours:1,createdAt:{seconds:1}}],
  ['resourceAssignments/scope_vehicle_v1',{ownerId:'scope',shipmentId:'s1'}],['resourceAssignments/scope_driver_d1',{ownerId:'scope',shipmentId:'s1'}],
  ['uniqueKeys/scope_vehicle_'+sha('ABC1'),{ownerId:'scope',recordId:'v1'}],['uniqueKeys/scope_vehicle_'+sha('ABC2'),{ownerId:'scope',recordId:'v2'}],
  ['uniqueKeys/scope_driver_driver1',{ownerId:'scope',recordId:'d1'}],['uniqueKeys/scope_driver_driver2',{ownerId:'scope',recordId:'d2'}],
 ]);
 Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'});
});
test('atomic reassignment swaps both locks, uses recorded address and preserves stock',async()=>{
 const before=clone(rows.get('products/p')),request=plan(),result=await call('reviseTransportPlan',request);assert.equal(result.recordId,'s1');assert.equal(result.version,2);assert.equal(rows.has('resourceAssignments/scope_vehicle_v1'),false);assert.equal(rows.has('resourceAssignments/scope_driver_d1'),false);assert.equal(rows.get('resourceAssignments/scope_vehicle_v2').shipmentId,'s1');assert.equal(rows.get('shipments/s1').version,3);assert.equal(rows.get('shipments/s1').driverUid,'driver2');assert.equal(rows.get('transportPlans/s1').destination,'Recorded destination');assert.deepEqual(rows.get('products/p'),before);assert.equal((await call('reviseTransportPlan',request)).replayed,true);
});
test('same resources may change manual planning values without releasing their locks',async()=>{
 const r=plan({vehicleId:'v1',driverId:'d1',planning:{origin:{latitude:0,longitude:0},destination:{latitude:0,longitude:0},speedKph:60},distanceKm:0,estimatedHours:.1});await call('reviseTransportPlan',r);assert.equal(rows.get('resourceAssignments/scope_vehicle_v1').shipmentId,'s1');assert.equal(rows.get('transportPlans/s1').planning.estimate.distanceKm,0);assert.equal(rows.get('transportPlans/s1').estimatedHours,.1);
});
test('stale versions dispatched shipments occupied or foreign resources and disabled drivers leave every lock unchanged',async()=>{
 const original=clone([...rows]);for(const mode of ['shipment-version','plan-version','dispatch','occupied','foreign','capacity','disabled','pending','old-lock']){
  rows=new Map(clone(original));let request=plan();if(mode==='shipment-version')request.expectedShipmentVersion=1;if(mode==='plan-version')request.expectedPlanVersion=0;if(mode==='dispatch')rows.get('shipments/s1').status='Dispatched';if(mode==='occupied')rows.set('resourceAssignments/scope_vehicle_v2',{ownerId:'scope',shipmentId:'other'});if(mode==='foreign')rows.get('vehicles/v2').ownerId='foreign';if(mode==='capacity')rows.get('vehicles/v2').capacity=1;if(mode==='disabled')rows.get('users/driver2').active=false;if(mode==='pending')rows.get('users/driver2').status='Pending';if(mode==='old-lock')rows.get('resourceAssignments/scope_vehicle_v1').shipmentId='other';const before=clone([...rows]);await assert.rejects(call('reviseTransportPlan',request),undefined,mode);assert.deepEqual([...rows],before);
 }
});
test('concurrent revisions and a dispatch racing a read produce at most one safe outcome',async()=>{
 const pair=await Promise.allSettled([call('reviseTransportPlan',plan()),call('reviseTransportPlan',plan({vehicleId:'v1',driverId:'d1'}))]);assert.equal(pair.filter(r=>r.status==='fulfilled').length,1);
 const before=clone(rows.get('products/p'));let dispatched=false;onRead=path=>{if(!dispatched&&path==='transportPlans/s1'){dispatched=true;rows.get('shipments/s1').status='Dispatched';rows.get('shipments/s1').version++;rev++;}};const s=rows.get('shipments/s1'),p=rows.get('transportPlans/s1');await assert.rejects(call('reviseTransportPlan',plan({expectedShipmentVersion:s.version,expectedPlanVersion:p.version})));assert.deepEqual(rows.get('products/p'),before);
});
test('failed receipt writing rolls back reassignment and all audits',async()=>{const before=clone([...rows]);failWrite='completionRequests/';await assert.rejects(call('reviseTransportPlan',plan()),/rollback/);assert.deepEqual([...rows],before);});
test('initial scheduling and cancelled-plan reactivation store explicit estimate provenance',async()=>{
 rows.delete('transportPlans/s1');rows.delete('resourceAssignments/scope_vehicle_v1');rows.delete('resourceAssignments/scope_driver_d1');await call('reviseTransportPlan',plan({expectedPlanVersion:0}));assert.equal(rows.get('transportPlans/s1').version,1);
 const p=rows.get('transportPlans/s1');p.status='Cancelled';p.version=2;rows.delete('resourceAssignments/scope_vehicle_v2');rows.delete('resourceAssignments/scope_driver_d2');await call('reviseTransportPlan',plan({expectedShipmentVersion:3,expectedPlanVersion:2,vehicleId:'v1',driverId:'d1'}));assert.equal(rows.get('transportPlans/s1').version,3);
});
test('resource edit updates its uniqueness claim and retains original registration timestamps',async()=>{
 const request=edit(),before=clone(rows.get('vehicles/v2').createdAt);await call('updateFleetResource',request);assert.equal(rows.get('vehicles/v2').version,2);assert.equal(rows.has('uniqueKeys/scope_vehicle_'+sha('ABC2')),false);assert.equal(rows.get('uniqueKeys/scope_vehicle_'+sha('ABC3')).recordId,'v2');assert.deepEqual(rows.get('vehicles/v2').createdAt,before);assert.equal((await call('resolveFleetResourceUpdate',request)).replayed,true);
});
test('assigned stale duplicate-account/registration and disabled-driver edits fail atomically',async()=>{
 for(const input of [edit({id:'v1'}),edit({expectedVersion:2}),edit({data:{...edit().data,name:'ABC-1'}}),edit({kind:'drivers',id:'d2',data:{name:'Two',userId:'driver1',licence:'L2',status:'Available'}}),edit({kind:'drivers',id:'d2',data:{name:'Two',userId:'disabled',licence:'L2',status:'Available'}})]){const before=clone([...rows]);await assert.rejects(call('updateFleetResource',input));assert.deepEqual([...rows],before);}
});
test('fleet edit and new assignment race cannot schedule a stale or disabled resource',async()=>{
 const pair=await Promise.allSettled([call('updateFleetResource',edit({data:{...edit().data,status:'Unavailable'}})),call('reviseTransportPlan',plan())]);assert.equal(pair.filter(r=>r.status==='fulfilled').length,1);const lock=rows.get('resourceAssignments/scope_vehicle_v2');if(lock)assert.equal(rows.get('vehicles/v2').status,'Available');else assert.equal(rows.get('vehicles/v2').status,'Unavailable');
});
test('scope role malformed data and unknown resolution are fenced without stock mutations',async()=>{
 const request=plan(),before=clone(rows.get('products/p'));await assert.rejects(call('reviseTransportPlan',request,'viewer'));await assert.rejects(call('reviseTransportPlan',request,'manager','foreign'));assert.equal((await call('resolveTransportRevision',request)).state,'Cancelled');assert.equal((await call('reviseTransportPlan',request)).state,'Cancelled');assert.equal(owned('completionRequests').length,1);assert.deepEqual(rows.get('products/p'),before);
});
test('even equivalent-looking changed text cannot replay a different saved intent',async()=>{
 const request=edit();await call('updateFleetResource',request);await assert.rejects(call('updateFleetResource',{...request,data:{...request.data,name:' abc-3 '}}),/different|input/);
 const revision=plan({vehicleId:'v1',driverId:'d1'});await call('reviseTransportPlan',revision);await assert.rejects(call('reviseTransportPlan',{...revision,origin:' Warehouse A '}),/different|input/);
});

test('bounded trusted assignment read distinguishes absent locks while retaining staff/scope/resource authority',async()=>{
 const before=clone([...rows]),result=await call('getFleetAssignments',{kind:'vehicles',resourceIds:['v1','v2']});assert.equal(result.kind,'vehicles');assert.deepEqual(result.resourceIds,['v1','v2']);assert.deepEqual(result.rows,[{id:'scope_vehicle_v1',shipmentId:'s1'}]);assert.deepEqual([...rows],before);
 for(const input of [{kind:'users',resourceIds:['manager']},{kind:'vehicles',resourceIds:Array(21).fill('v1')},{kind:'vehicles',resourceIds:['v1','v1']},{kind:'vehicles',resourceIds:['missing']},{kind:'vehicles',resourceIds:['v1'],ownerId:'foreign'}])await assert.rejects(call('getFleetAssignments',input));
 await assert.rejects(call('getFleetAssignments',{kind:'vehicles',resourceIds:['v1']},'manager','foreign'));rows.set('users/customer',{role:'Customer',status:'Approved',active:true});await assert.rejects(call('getFleetAssignments',{kind:'vehicles',resourceIds:['v1']},'customer'));rows.get('vehicles/v2').ownerId='foreign';await assert.rejects(call('getFleetAssignments',{kind:'vehicles',resourceIds:['v2']}));
});
