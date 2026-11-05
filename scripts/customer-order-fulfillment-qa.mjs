// Fictional full fulfillment regression on the one parent-owned loopback stack.
// No service lifecycle, cloud, research, camera or blockchain operations.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const project='fyp-inventory-and-logistics',output='outputs/customer-orders-20261104';
assert(!process.env.GOOGLE_APPLICATION_CREDENTIALS&&!process.env.FIREBASE_TOKEN&&!process.env.IILAS_DEMO_MODE,'Cloud credentials or a nonlocal profile are forbidden.');
for(const [key,value] of Object.entries({GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FUNCTIONS_EMULATOR:'true',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'})){
 assert(!process.env[key]||process.env[key]===value,'Mixed project or emulator endpoint.');process.env[key]=value;
}
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url));
const admin=require('firebase-admin/app'),store=require('firebase-admin/firestore'),adminAuth=require('firebase-admin/auth');
const {executeCommand}=await import('../backend/functions/service.mjs');
const {customerGrantId}=await import('../backend/functions/customerAccess.mjs');
const {businessCodeCounterId}=await import('../backend/functions/businessCodeAllocation.mjs');
const {LOCAL_DEMO_ENVIRONMENT}=await import('../lib/demoEnvironment.js');
const {validateCustomerDetail}=await import('../lib/customerPortal.js');
const tag='order-fulfillment-'+randomUUID().slice(0,8),checks=[],clients=[],owned={accounts:[],products:[],orders:[],shipments:[],vehicles:[],drivers:[],evidence:[]};
let app,db,identity,actors,scope,sourceProductId,customerUid,otherUid,driverUid,productId;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const call=(uid,action,input={},extra={})=>executeCommand({uid},{action,input:['mutateCustomerOrder','resolveCustomerOrderOperation'].includes(action)?{...input,expectedActorUid:uid}:input,...extra});
const row=async(kind,id)=>(await db.doc(kind+'/'+id).get()).data();
const mutate=(uid,input)=>call(uid,'mutateCustomerOrder',{operationId:randomUUID(),...input});
async function makeAccount(name,role){
 const uid=tag+'-'+name;await identity.createUser({uid,email:uid+'@example.test',emailVerified:true,displayName:'Fictional '+name});owned.accounts.push(uid);
 await call(uid,'registerAccount',{displayName:'Fictional fulfillment '+name});const profile=await row('users',uid);
 await call(actors.admin,'updateAccount',{uid,version:profile.version,step:'Approve',role});return uid;
}
async function session(uid){
 const {initializeApp}=await import('firebase/app'),{getAuth,connectAuthEmulator,signInWithCustomToken}=await import('firebase/auth'),{getStorage,connectStorageEmulator}=await import('firebase/storage');
 const client=initializeApp({projectId:project,apiKey:'emulator-only-key',authDomain:'localhost',storageBucket:LOCAL_DEMO_ENVIRONMENT.storageBucket},tag+'-'+uid);clients.push(client);
 const auth=getAuth(client),storage=getStorage(client);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectStorageEmulator(storage,'127.0.0.1',9199);
 await signInWithCustomToken(auth,await identity.createCustomToken(uid));return {auth,storage};
}
async function customerShipment(shipmentId){return validateCustomerDetail(await call(customerUid,'getCustomerShipment',{shipmentId}));}
function assertSafeShipment(value){
 const forbidden=new Set(['ownerId','customerUid','actor','driverUid','driver','recipient','phone','address','items','cost','notes','path','sha256','model','score','updatedBy','createdBy']);
 const walk=x=>{if(!x||typeof x!=='object')return;for(const [key,item] of Object.entries(x)){assert(!forbidden.has(key),'Unexpected Customer shipment field: '+key);walk(item);}};walk(value);
 const serialized=JSON.stringify(value);for(const uid of [scope,actors.inventory,actors.logistics,actors.warehouse,driverUid])assert(!serialized.includes(uid),'Internal actor leaked into the Customer projection.');
}
async function proofRequest(auth,shipmentId,evidenceId){
 const token=await auth.currentUser.getIdToken(true),url=new URL(`http://127.0.0.1:5001/${project}/asia-southeast1/customerEvidence`);url.searchParams.set('shipmentId',shipmentId);url.searchParams.set('evidenceId',evidenceId);
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token,Origin:'http://127.0.0.1:5173'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});
 assert.match(response.headers.get('cache-control')??'',/no-store/);return response;
}
before(async()=>{
 const response=await fetch('http://127.0.0.1:4400/emulators',{signal:AbortSignal.timeout(5000)});assert(response.ok);const hub=await response.json();
 for(const [name,port] of Object.entries({auth:9099,firestore:8081,functions:5001,storage:9199})){assert.equal(hub[name]?.host,'127.0.0.1');assert.equal(hub[name]?.port,port);}
 const candidates=await Promise.all((await readdir(output)).filter(name=>/^command-fixture-.*\.private\.json$/.test(name)).map(async name=>({name,mtime:(await stat(join(output,name))).mtimeMs})));
 candidates.sort((a,b)=>b.mtime-a.mtime);assert(candidates.length,'The parent command fixture is required.');
 const {actors:fixtureActors,scope:fixtureScope,productId:fixtureProductId}=JSON.parse(await readFile(join(output,candidates[0].name),'utf8'));
 actors=fixtureActors;scope=fixtureScope;sourceProductId=fixtureProductId;
 for(const uid of [scope,sourceProductId,actors.admin,actors.inventory,actors.warehouse,actors.logistics])assert.match(uid,/^[A-Za-z0-9_-]{1,128}$/);
 app=admin.initializeApp({projectId:project,storageBucket:LOCAL_DEMO_ENVIRONMENT.storageBucket});db=store.getFirestore(app);identity=adminAuth.getAuth(app);
 assert.equal((await row('system','config')).dataScopeId,scope);assert.equal((await row('products',sourceProductId)).ownerId,scope);
 customerUid=await makeAccount('customer','Customer');otherUid=await makeAccount('other','Customer');driverUid=await makeAccount('driver','Driver');
});
after(async()=>{
 const {deleteApp}=await import('firebase/app');await Promise.all(clients.map(client=>deleteApp(client)));
 if(app){await writeFile(join(output,'fulfillment-fixture-'+tag+'.private.json'),JSON.stringify({schema:'iilas-customer-order-fulfillment-fixtures-1.0',tag,scope,sourceProductId,owned,checks,completed:checks.length===9}),{flag:'wx'});await admin.deleteApp(app);}
});

test('accepted Customer order follows existing held-bin handover, transport, dispatch and protected proof contracts',async()=>{
 const originalProduct=await row('products',sourceProductId),systemBefore=await row('system','config');
 const created=await call(actors.inventory,'createBusinessRecord',{operationId:randomUUID(),kind:'products',data:{name:'Fictional fulfillment carton '+tag,barcode:(BigInt(Date.now())*10n+7n).toString(),category:'Packaging',location:'FULFILL-A',reorderLevel:2,quantityOnHand:20,reservedQuantity:0,status:'Active',imageDataUrl:''}});
 productId=created.recordId;owned.products.push(productId);
 await call(actors.inventory,'stock',{operationId:randomUUID(),productId,type:'Transfer',quantity:18,locationFrom:'FULFILL-A',locationTo:'FULFILL-B',reference:tag,reason:'Fictional two-bin fulfillment arrangement'});
 await call(actors.inventory,'stock',{operationId:randomUUID(),productId,type:'Reservation',quantity:4,locationFrom:'FULFILL-B',reference:tag,reason:'Fictional independent reservation to preserve'});
 const stockBefore=await row('products',productId),counterRef=db.doc('businessCodeCounters/'+businessCodeCounterId(scope,'shipments')),counterBefore=(await counterRef.get()).data();
 const submitted=await mutate(customerUid,{kind:'Submit',data:{recipient:'Fictional fulfillment receiver',phone:'0123456789',address:'Fictional local fulfillment demonstration destination',requestedDelivery:'2099-12-01',notes:'Fictional fulfillment request; no real customer data.',items:[{description:'First fictional carton request',quantity:2},{description:'Second fictional carton request',quantity:3}]}});
 owned.orders.push(submitted.orderId);assert.equal(submitted.orderStatus,'Submitted');assert.deepEqual(await row('products',productId),stockBefore);assert.deepEqual((await counterRef.get()).data(),counterBefore);
 const acceptance={kind:'Decide',operationId:randomUUID(),orderId:submitted.orderId,expectedVersion:1,decision:'Accept',message:'Your fictional request is accepted for preparation.',expectedDelivery:'2099-12-01',mapping:[{lineIndex:0,productId},{lineIndex:1,productId}]};
 const accepted=await call(actors.logistics,'mutateCustomerOrder',acceptance),sid=accepted.shipmentId;owned.shipments.push(sid);assert.equal(accepted.orderStatus,'Accepted');assert.match(accepted.shipmentReference,/^SHP-\d{6}$/);assert.equal((await counterRef.get()).data().lastIssued,counterBefore.lastIssued+1);
 assert.equal((await call(actors.logistics,'mutateCustomerOrder',acceptance)).shipmentId,sid);assert.deepEqual(await row('products',productId),stockBefore);
 let shipment=await row('shipments',sid);assert.equal(shipment.status,'Draft');assert.equal(shipment.customerOrderId,submitted.orderId);assert.deepEqual(shipment.items.map(({productId,quantity})=>({productId,quantity})),[{productId,quantity:5}]);
 assert.equal((await row('customerOrderShipmentLinks',sid)).orderId,submitted.orderId);const grantId=customerGrantId(scope,customerUid,sid);assert.equal((await row('customerShipmentGrants',grantId)).shareLocation,false);
 assert.equal((await call(customerUid,'getCustomerOrder',{orderId:submitted.orderId})).shipment.status,'Preparing');await assert.rejects(call(otherUid,'getCustomerOrder',{orderId:submitted.orderId}));await assert.rejects(call(otherUid,'getCustomerShipment',{shipmentId:sid}));checks.push('request acceptance creates one Draft/code/link/grant without stock mutation');

 await assert.rejects(call(actors.logistics,'save',{kind:'shipments',existing:{id:sid,version:shipment.version},data:{...shipment,status:'Dispatched'}}));
 await assert.rejects(call(customerUid,'warehouse',{shipmentId:sid,version:0,data:{step:'Picking',notes:'Customer cannot prepare warehouse stock.',parcelCount:1}}));
 for(const [version,step] of ['Picking','Packed','HandedOver'].entries()){
  await call(actors.warehouse,'warehouse',{shipmentId:sid,version,data:{step,notes:'Fictional fulfillment '+step,parcelCount:2}});
  const current=await row('products',productId);assert.equal(current.quantityOnHand,20);assert.equal(current.reservedQuantity,9);assert.equal(current.warehouseReservedQuantity,5);
 }
 const handover=await row('warehouseHandovers',sid);shipment=await row('shipments',sid);
 assert.equal(handover.status,'HandedOver');assert.equal(handover.reference,'PS-'+accepted.shipmentReference);assert.equal(handover.reservationsHeld,true);assert.deepEqual(handover.items[0].allocations,[{location:'FULFILL-A',quantity:2},{location:'FULFILL-B',quantity:3}]);
 assert.equal(shipment.status,'Prepared');assert.equal(shipment.customerOrderId,submitted.orderId);assert.equal(shipment.handoverId,sid);assert.equal(shipment.parcelCount,2);assert.equal(shipment.packed,true);
 await assert.rejects(mutate(customerUid,{kind:'Cancel',orderId:submitted.orderId,expectedVersion:2}));assert.equal((await customerShipment(sid)).status,'Preparing');checks.push('warehouse holds exact two-bin units and completes linked Prepared handover');

 const vehicle=await call(actors.logistics,'entity',{kind:'vehicles',data:{name:'FQ-'+tag.slice(-8),capacity:10,status:'Available',maintenanceDate:'2099-12-01',fuelLitres:20}});owned.vehicles.push(vehicle.id);
 const driver=await call(actors.logistics,'entity',{kind:'drivers',data:{name:'Fictional fulfillment driver '+tag.slice(-8),userId:driverUid,licence:'FICTIONAL-'+tag.slice(-8),status:'Available'}});owned.drivers.push(driver.id);
 const plan={operationId:randomUUID(),shipmentId:sid,expectedShipmentVersion:shipment.version,expectedPlanVersion:0,vehicleId:vehicle.id,driverId:driver.id,origin:'Fictional fulfillment warehouse',carrier:'Fictional local test carrier',plannedDate:'2099-12-01',distanceKm:8,estimatedHours:1,cost:20,planning:null};
 const planned=await call(actors.logistics,'reviseTransportPlan',plan);assert.equal(planned.version,1);assert.equal((await call(actors.logistics,'resolveTransportRevision',plan)).version,1);
 for(const [kind,id] of [['vehicle',vehicle.id],['driver',driver.id]])assert.equal((await row('resourceAssignments',scope+'_'+kind+'_'+id)).shipmentId,sid);
 shipment=await row('shipments',sid);assert.equal(shipment.customerOrderId,submitted.orderId);assert.equal(shipment.driverUid,driverUid);assert.equal(shipment.reference,accepted.shipmentReference);checks.push('existing recoverable transport schedule holds both assigned resources');

 const dispatch={kind:'shipments',existing:{id:sid,version:shipment.version},data:{...shipment,status:'Dispatched'}};
 await call(actors.logistics,'save',dispatch);let afterDispatch=await row('products',productId);assert.equal(afterDispatch.quantityOnHand,15);assert.equal(afterDispatch.reservedQuantity,4);assert.equal(afterDispatch.warehouseReservedQuantity,0);
 const consumed=await row('warehouseHandovers',sid);assert.equal(consumed.reservationsHeld,false);assert(consumed.dispatchConsumedAt);assert.equal(consumed.dispatchMovementIds.length,1);assert.deepEqual(consumed.items,handover.items);
 assert.equal((await row('shipments',sid)).customerOrderId,submitted.orderId);await assert.rejects(call(actors.logistics,'save',dispatch));assert.deepEqual(await row('products',productId),afterDispatch);
 const issues=await db.collection('stockMovements').where('ownerId','==',scope).where('shipmentId','==',sid).where('type','==','Issue').get();assert.equal(issues.size,1);assert.equal(issues.docs[0].data().quantity,5);assert.deepEqual(issues.docs[0].data().allocations,[{location:'FULFILL-A',quantity:2},{location:'FULFILL-B',quantity:3}]);
 assert.equal((await customerShipment(sid)).status,'Dispatched');checks.push('dispatch consumes held stock once and preserves the independent reservation');

 await assert.rejects(call(customerUid,'delivery',{shipmentId:sid,version:0,status:'In Transit',notes:'Customer cannot write delivery events.'}));
 await call(driverUid,'delivery',{shipmentId:sid,version:0,status:'In Transit',notes:'Fictional driver began the route.'});
 await call(driverUid,'location',{shipmentId:sid,latitude:0,longitude:0,accuracy:5});let customerDetail=await customerShipment(sid);assert.equal(customerDetail.status,'In Transit');assert.equal(customerDetail.location,null);assertSafeShipment(customerDetail);
 await call(actors.logistics,'grantCustomerShipment',{operationId:randomUUID(),customerUid,shipmentId:sid,expectedVersion:1,shareLocation:true,notes:'Explicit fictional active-delivery point sharing.'});
 customerDetail=await customerShipment(sid);assert.equal(customerDetail.location.latitude,0);assert.equal(customerDetail.location.longitude,0);assertSafeShipment(customerDetail);
 assert.equal((await call(customerUid,'getCustomerOrder',{orderId:submitted.orderId})).shipment.status,'In Transit');checks.push('delivery status propagates safely and location requires explicit opt-in');

 await assert.rejects(call(driverUid,'delivery',{shipmentId:sid,version:1,status:'Delivered',notes:'Missing proof must reject.'}));
 const driverSession=await session(driverUid),customerSession=await session(customerUid),otherSession=await session(otherUid),{ref,uploadBytes,getBytes}=await import('firebase/storage');
 const evidenceId=randomUUID(),path=`evidence/${scope}/${sid}/${evidenceId}`;
 const proofBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGMwTpsJRAwQCgAf7gTJ/qZDUgAAAABJRU5ErkJggg==','base64');
 const fileName='Fictional-fulfillment-proof.png',contentType='image/png';
 await uploadBytes(ref(driverSession.storage,path),proofBytes,{contentType,customMetadata:{actor:driverUid,stage:'Delivery',evidenceType:'Proof of Delivery',captureSource:'file',capturedAtClient:''}});
 const evidence=await call(driverUid,'registerEvidence',{id:evidenceId,shipmentId:sid,path,name:fileName,type:'Proof of Delivery',stage:'Delivery',captureSource:'file',capturedAtClient:null});owned.evidence.push({id:evidenceId,path,sha256:sha(proofBytes)});assert.equal(evidence.sha256,sha(proofBytes));
 assert.equal((await customerShipment(sid)).proof,null);const beforeDelivered=await proofRequest(customerSession.auth,sid,evidenceId);assert.notEqual(beforeDelivered.status,200);
 await assert.rejects(getBytes(ref(customerSession.storage,path),1024),error=>error.code==='storage/unauthorized');checks.push('assigned Driver uploads and registers non-parcel proof while premature/direct Customer access refuses');

 await call(driverUid,'delivery',{shipmentId:sid,version:1,status:'Delivered',notes:'Fictional route completed with current proof.',proofId:evidenceId});
 customerDetail=await customerShipment(sid);assert.equal(customerDetail.status,'Delivered');assert.equal(customerDetail.location,null);assert.deepEqual(customerDetail.proof,{evidenceId,fileName,contentType,bytes:proofBytes.length});assertSafeShipment(customerDetail);
 assert(customerDetail.timeline.rows.some(event=>event.status==='Delivered'));assert(customerDetail.timeline.rows.some(event=>event.status==='In Transit'));
 const deliveredOrder=await call(customerUid,'getCustomerOrder',{orderId:submitted.orderId});assert.equal(deliveredOrder.status,'Accepted');assert.equal(deliveredOrder.shipment.status,'Delivered');assert.equal(deliveredOrder.shipment.shipmentId,sid);
 for(const [kind,id] of [['vehicle',vehicle.id],['driver',driver.id]])assert.equal(await row('resourceAssignments',scope+'_'+kind+'_'+id),undefined);assert.equal((await row('transportPlans',sid)).status,'Completed');
 const downloaded=await proofRequest(customerSession.auth,sid,evidenceId);assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('content-type')?.split(';')[0],contentType);assert.match(downloaded.headers.get('content-disposition')??'',/attachment/);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),proofBytes);
 const foreignDownload=await proofRequest(otherSession.auth,sid,evidenceId);assert.notEqual(foreignDownload.status,200);assert.deepEqual(await row('products',productId),afterDispatch);checks.push('Delivered releases transport resources and serves only the current Customer proof');

 const lastLocation=await row('locations',sid);await assert.rejects(call(driverUid,'location',{shipmentId:sid,latitude:1,longitude:1,accuracy:5}));assert.deepEqual(await row('locations',sid),lastLocation);
 await assert.rejects(call(actors.logistics,'remove',{kind:'shipments',existing:{id:sid,version:(await row('shipments',sid)).version}}));
 const grant=await row('customerShipmentGrants',grantId);await call(actors.logistics,'revokeCustomerShipment',{operationId:randomUUID(),customerUid,shipmentId:sid,expectedVersion:grant.version,shareLocation:false,notes:'Fictional completed fulfillment access revoked.'});
 await assert.rejects(call(customerUid,'getCustomerShipment',{shipmentId:sid}));const revokedDownload=await proofRequest(customerSession.auth,sid,evidenceId);assert.notEqual(revokedDownload.status,200);const historicalOrder=await call(customerUid,'getCustomerOrder',{orderId:submitted.orderId});assert.equal(historicalOrder.status,'Accepted');assert.equal(historicalOrder.shipment,null);assert.equal(historicalOrder.shipmentUnavailable,true);checks.push('terminal delivery and grant revocation block later location, delete and proof access');

 assert.deepEqual(await row('products',sourceProductId),originalProduct);assert.deepEqual(await row('system','config'),systemBefore);assert.equal((await row('customerOrderShipmentLinks',sid)).deleted,false);assert.equal((await row('customerOrders',submitted.orderId)).shipmentReference,accepted.shipmentReference);assert.equal((await row('shipments',sid)).customerOrderId,submitted.orderId);assert.deepEqual(await row('products',productId),afterDispatch);checks.push('original product/system and permanent fulfillment lineage remain unchanged');
 assert.equal(checks.length,9);
});
