import {test,beforeEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mobileMemory} from './mobile-memory-fixture.mjs';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url));
const memory=mobileMemory();mock.method(require('firebase-admin/firestore'),'getFirestore',()=>memory.db);mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>({seconds:1793000000,nanoseconds:0}));
const {createMobileCommands}=await import('../backend/functions/mobileDelivery.mjs');
let now,disabled,identity;
const auth={uid:'driver'};
const request=(action,payload,operationId=randomUUID())=>({protocol:'mobile-command-1.0',operationId,action,payloadJson:JSON.stringify(action==='delivery.update'?{expectedShipmentVersion:2,expectedAssignmentVersion:1,...payload}:payload)});
const command=input=>createMobileCommands({identity,clock:()=>now}).mobileCommand(auth,'scope',input);
const api=()=>createMobileCommands({identity,clock:()=>now});
const count=kind=>[...memory.rows.keys()].filter(k=>k.startsWith(kind+'/')).length;
beforeEach(()=>{
 now=1793000000000;disabled=false;identity={getUser:async uid=>({uid,disabled,email:'demo@example.invalid'}),createCustomToken:async (...args)=>{assert.deepEqual(args,['driver']);return 'disposable-test-token';}};
 Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo',IILAS_MOBILE_DEMO:'enabled'});
 memory.reset({'system/config':{dataScopeId:'scope'},'users/driver':{active:true,status:'Approved',role:'Driver'},'shipments/s':{ownerId:'scope',status:'Dispatched',version:2,reference:'S1',recipient:'Demo',address:'Demo address',expectedDelivery:'2026-10-26'},'transportPlans/s':{ownerId:'scope',driverUid:'driver',driverId:'d1',vehicleId:'v1',version:1,status:'Scheduled'}});
});
test('assigned closed reads and same-UID token refuse authority injection or lost access',async()=>{
 const page=await api().getMobileAssignments(auth,'scope',{});assert.equal(page.items.length,1);assert.equal(page.items[0].id,'s');assert.equal(page.items[0].ownerId,undefined);
 assert.deepEqual(await api().mintMobileWebSession(auth,'scope',{}),{uid:'driver',customToken:'disposable-test-token'});
 await assert.rejects(api().getMobileShipment(auth,'scope',{shipmentId:'foreign'}));await assert.rejects(api().mintMobileWebSession(auth,'scope',{uid:'other'}));
 memory.rows.set('users/driver',{active:true,status:'Approved',role:'Viewer'});await assert.rejects(api().getMobileAssignments(auth,'scope',{}));
 assert.equal((await api().getMobileAccessContext(auth,'scope',{})).mode,'Recovery only');
 disabled=true;await assert.rejects(api().getMobileAccessContext(auth,'scope',{}));
});
test('local capability and fixed scope are mandatory before business writes',async()=>{
 const input=request('tracking.start',{shipmentId:'s',installationId:randomUUID()});
 await assert.rejects(api().mobileCommand(auth,'foreign',input));process.env.IILAS_MOBILE_DEMO='no';await assert.rejects(command(input));assert.equal(count('mobileRequests'),0);
});
test('delivery result and business writes commit once, including failed attempts and resource release',async()=>{
 const first=request('delivery.update',{shipmentId:'s',expectedVersion:0,status:'In Transit',notes:'On route',proofId:null});
 assert.equal((await command(first)).version,1);assert.equal((await command(first)).replayed,true);assert.equal(count('deliveryEvents'),1);
 const failed=request('delivery.update',{shipmentId:'s',expectedVersion:1,status:'Attempt Failed',notes:'No answer',proofId:null});await Promise.all([command(failed),command(failed)]);assert.equal(memory.rows.get('deliveries/s').failedAttempts,1);
 const stale=await command(request('delivery.update',{shipmentId:'s',expectedVersion:0,status:'In Transit',notes:'Stale action',proofId:null}));assert.equal(stale.reason,'stale_version');assert.equal(count('deliveryEvents'),2);
 await command(request('delivery.update',{shipmentId:'s',expectedVersion:2,status:'In Transit',notes:'Retry route',proofId:null}));
 const noProof=request('delivery.update',{shipmentId:'s',expectedVersion:3,status:'Delivered',notes:'Delivered item',proofId:'proof'});await assert.rejects(command(noProof));
 memory.rows.set('evidence/proof',{ownerId:'scope',shipmentId:'s',type:'Proof of Delivery'});memory.rows.set('resourceAssignments/scope_driver_d1',{});memory.rows.set('resourceAssignments/scope_vehicle_v1',{});
 await command(noProof);await command(noProof);assert.equal(count('resourceAssignments'),0);assert.equal(memory.rows.get('transportPlans/s').status,'Completed');assert.equal(count('deliveryEvents'),4);
});
test('terminal replay survives staff-role change; revocation and changed bytes never recover',async()=>{
 const input=request('delivery.update',{shipmentId:'s',expectedVersion:0,status:'In Transit',notes:'On route',proofId:null});await command(input);
 memory.rows.set('users/driver',{active:true,status:'Approved',role:'Viewer'});assert.equal((await command(input)).replayed,true);await assert.rejects(command(request('tracking.start',{shipmentId:'s',installationId:randomUUID()})));
 await assert.rejects(command({...input,payloadJson:input.payloadJson+' '}));disabled=true;await assert.rejects(command(input));
});
test('unknown uncertain operation is cancelled and fences late submit',async()=>{
 const input=request('delivery.update',{shipmentId:'s',expectedVersion:0,status:'In Transit',notes:'On route',proofId:null});assert.equal((await api().resolveMobileCommand(auth,'scope',input)).state,'Cancelled');assert.equal((await command(input)).state,'Cancelled');assert.equal(count('deliveryEvents'),0);
});
async function start(){return command(request('tracking.start',{shipmentId:'s',installationId:randomUUID()}));}
test('foreign delivery or latest-location records cannot be overwritten at a shared shipment ID',async()=>{
 memory.rows.set('deliveries/s',{ownerId:'foreign',status:'Dispatched',version:0,failedAttempts:0});
 assert.equal((await command(request('delivery.update',{shipmentId:'s',expectedVersion:0,status:'In Transit',notes:'On route',proofId:null}))).reason,'authority_changed');
 assert.equal(memory.rows.get('deliveries/s').ownerId,'foreign');memory.rows.delete('deliveries/s');const session=await start();
 memory.rows.set('locations/s',{ownerId:'foreign',submittedAt:{seconds:1,nanoseconds:0}});
 assert.equal((await command(request('tracking.points',{sessionId:session.recordId,points:[{sampleId:randomUUID(),sequence:1,capturedAtMs:now,latitude:3,longitude:101,accuracy:0}]}))).reason,'authority_changed');
 assert.equal(memory.rows.get('locations/s').ownerId,'foreign');
});
test('lease-limited GPS is immutable and old batches cannot regress latest manual observation',async()=>{
 const session=await start(),sessionId=session.recordId;assert.equal(session.data.leaseUntilMs-now,1800000);
 const point={sampleId:randomUUID(),sequence:1,capturedAtMs:now+1000,latitude:3.1,longitude:101.5,accuracy:10};now+=2000;
 memory.rows.set('locations/s',{ownerId:'scope',submittedAt:{seconds:now/1000,nanoseconds:0}});
 const input=request('tracking.points',{sessionId,points:[point]});assert.equal((await command(input)).data.latestChanged,false);assert.equal((await command(input)).replayed,true);assert.equal(count('locationEvents'),1);
 assert.equal((await command(request('tracking.points',{sessionId,points:[{...point,latitude:4}]}))).reason,'invalid_clock');
 now+=5000;assert.equal((await command(request('tracking.points',{sessionId,points:[{...point,sampleId:randomUUID(),sequence:2,capturedAtMs:now}]}))).data.latestChanged,true);
 assert.equal(memory.rows.get('locations/s').capturedAtMs,now);
});
test('expired, future, backwards and reassigned GPS are rejected without history writes',async()=>{
 const session=await start(),sessionId=session.recordId,p={sampleId:randomUUID(),sequence:1,capturedAtMs:now+120001,latitude:3,longitude:101,accuracy:0};
 assert.equal((await command(request('tracking.points',{sessionId,points:[p]}))).reason,'invalid_clock');
 now+=1900000;assert.equal((await command(request('tracking.points',{sessionId,points:[{...p,sampleId:randomUUID(),capturedAtMs:now}]}))).reason,'expired_capture');
 const plan=memory.rows.get('transportPlans/s');memory.rows.set('transportPlans/s',{...plan,version:2});assert.equal((await command(request('tracking.points',{sessionId,points:[{...p,sampleId:randomUUID()}]}))).reason,'assignment_changed');assert.equal(count('locationEvents'),0);
});
test('one installation can start a new assigned delivery after the previous source closes',async()=>{
 const installationId=randomUUID(),first=await command(request('tracking.start',{shipmentId:'s',installationId}));
 memory.rows.set('deliveries/s',{ownerId:'scope',status:'Delivered',version:1});
 memory.rows.set('shipments/next',{ownerId:'scope',status:'Dispatched',version:2,reference:'S2'});memory.rows.set('transportPlans/next',{ownerId:'scope',driverUid:'driver',driverId:'d1',vehicleId:'v1',version:1,status:'Scheduled'});
 const next=await command(request('tracking.start',{shipmentId:'next',installationId}));assert.equal(next.state,'Committed');assert.equal(memory.rows.get('mobileTrackingSessions/'+first.recordId).active,false);
});

test('queued delivery refuses a changed assignment or shipment basis without rebasing',async()=>{
 for(const patch of [{expectedShipmentVersion:1},{expectedAssignmentVersion:0}]){const result=await command(request('delivery.update',{shipmentId:'s',expectedVersion:0,status:'In Transit',notes:'On route',proofId:null,...patch}));assert.equal(result.reason,'stale_version');}assert.equal(count('deliveryEvents'),0);
});

test('the assigned Driver can verify a terminal delivery without gaining new write authority',async()=>{memory.rows.set('deliveries/s',{ownerId:'scope',status:'Delivered',version:2,failedAttempts:0});memory.rows.set('transportPlans/s',{...memory.rows.get('transportPlans/s'),status:'Completed',version:2});const detail=await api().getMobileShipment(auth,'scope',{shipmentId:'s'});assert.equal(detail.status,'Delivered');assert.equal(detail.deliveryVersion,2);assert.equal((await command(request('tracking.start',{shipmentId:'s',installationId:randomUUID()}))).reason,'delivery_closed');});
