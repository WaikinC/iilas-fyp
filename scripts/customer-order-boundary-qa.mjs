// Independent, fictional boundary checks against the one parent-owned loopback stack.
// Run only after the parent gives GO; this file never launches or stops a service.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const project='fyp-inventory-and-logistics',output='outputs/customer-orders-20261104';
const endpoints={auth:9099,firestore:8081,functions:5001,storage:9199};
assert(!process.env.GOOGLE_APPLICATION_CREDENTIALS&&!process.env.FIREBASE_TOKEN&&!process.env.IILAS_DEMO_MODE,'Cloud credentials or a nonlocal runtime are forbidden.');
for(const [key,value] of Object.entries({GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FUNCTIONS_EMULATOR:'true',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'})){
 assert(!process.env[key]||process.env[key]===value,'Mixed project or emulator endpoint.');process.env[key]=value;
}
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url));
const admin=require('firebase-admin/app'),store=require('firebase-admin/firestore'),authAdmin=require('firebase-admin/auth');
const {executeCommand}=await import('../backend/functions/service.mjs');
const {businessCodeCounterId}=await import('../backend/functions/businessCodeAllocation.mjs');
const tag='order-boundary-'+randomUUID().slice(0,8),owned={accounts:[],products:[],orders:[],shipments:[]},clients=[];
let app,db,identity,actors,scope,productId,inactiveId,customerUid,pagingUid,otherUid,sourceProductId;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const call=(uid,action,input={},extra={})=>executeCommand({uid},{action,input:['mutateCustomerOrder','resolveCustomerOrderOperation'].includes(action)?{...input,expectedActorUid:uid}:input,...extra});
const row=async(kind,id)=>(await db.doc(kind+'/'+id).get()).data();
const counter=async()=>row('businessCodeCounters',businessCodeCounterId(scope,'shipments'));
const data=(items=[{description:'Fictional packaging cartons',quantity:3}])=>({recipient:'Fictional boundary receiver',phone:'0123456789',address:'Fictional local boundary demonstration destination',requestedDelivery:'2099-12-01',notes:'Fictional boundary software test '+tag,items});
const mutate=(uid,input)=>call(uid,'mutateCustomerOrder',{operationId:randomUUID(),...input});
async function submit(uid=customerUid,items){const result=await mutate(uid,{kind:'Submit',data:data(items)});owned.orders.push(result.orderId);return result;}
const acceptance=(order,patch={})=>({kind:'Decide',orderId:order.orderId,expectedVersion:1,decision:'Accept',message:'Fictional request accepted for the local boundary test.',expectedDelivery:'2099-12-01',mapping:[{lineIndex:0,productId}],...patch});
async function accept(order,patch={}){const result=await mutate(actors.logistics,acceptance(order,patch));if(result.shipmentId)owned.shipments.push(result.shipmentId);return result;}
async function account(uid,step,role='Customer'){
 const profile=await row('users',uid);return call(actors.admin,'updateAccount',{uid,version:profile.version,step,...(['Update','Approve'].includes(step)?{role}:{})});
}
async function makeCustomer(name){
 const uid=tag+'-'+name;await identity.createUser({uid,email:uid+'@example.test',emailVerified:true,displayName:'Fictional '+name});owned.accounts.push(uid);
 await call(uid,'registerAccount',{displayName:'Fictional boundary '+name});await account(uid,'Approve');return uid;
}
async function makeProduct(status,n){
 const result=await call(actors.inventory,'createBusinessRecord',{operationId:randomUUID(),kind:'products',data:{name:'Fictional '+status+' boundary carton '+tag,barcode:(BigInt(Date.now())*10n+BigInt(n)).toString(),category:'Packaging',location:'BOUNDARY-A',reorderLevel:2,quantityOnHand:20,reservedQuantity:0,status,imageDataUrl:''}});
 owned.products.push(result.recordId);return result.recordId;
}
before(async()=>{
 const hubResponse=await fetch('http://127.0.0.1:4400/emulators',{signal:AbortSignal.timeout(5000)});assert(hubResponse.ok);const hub=await hubResponse.json();
 for(const [name,port] of Object.entries(endpoints)){assert.equal(hub[name]?.host,'127.0.0.1');assert.equal(hub[name]?.port,port);}
 const candidates=await Promise.all((await readdir(output)).filter(name=>/^command-fixture-.*\.private\.json$/.test(name)).map(async name=>({name,mtime:(await stat(join(output,name))).mtimeMs})));
 candidates.sort((a,b)=>b.mtime-a.mtime);assert(candidates.length,'Run the parent command fixture first.');
 const {actors:fixtureActors,scope:fixtureScope,productId:fixtureProductId}=JSON.parse(await readFile(join(output,candidates[0].name),'utf8'));
 actors=fixtureActors;scope=fixtureScope;sourceProductId=fixtureProductId;
 for(const uid of [scope,sourceProductId,actors.admin,actors.inventory,actors.logistics,actors.manager])assert.match(uid,/^[A-Za-z0-9_-]{1,128}$/);
 app=admin.initializeApp({projectId:project});db=store.getFirestore(app);identity=authAdmin.getAuth(app);
 assert.equal((await row('system','config')).dataScopeId,scope);assert.equal((await row('products',sourceProductId)).ownerId,scope);
 customerUid=await makeCustomer('customer');pagingUid=await makeCustomer('paging');otherUid=await makeCustomer('other');
 productId=await makeProduct('Active',1);inactiveId=await makeProduct('Inactive',2);
});
after(async()=>{
 await Promise.all(clients.map(async client=>{const {deleteApp}=await import('firebase/app');await deleteApp(client);}));
 if(app){await writeFile(join(output,'boundary-fixture-'+tag+'.private.json'),JSON.stringify({schema:'iilas-customer-order-boundary-fixtures-1.0',tag,scope,owned,sourceProductId,pendingCases:[]}),{flag:'wx'});await admin.deleteApp(app);}
});

test('current role, profile disabling and live Auth disabling fence fresh and replayed work',async()=>{
 const request={kind:'Submit',operationId:randomUUID(),data:data()},done=await call(customerUid,'mutateCustomerOrder',request);owned.orders.push(done.orderId);
 try{
  await account(customerUid,'Update','Viewer');
  assert.equal((await call(customerUid,'mutateCustomerOrder',request)).orderId,done.orderId);
  assert.equal((await call(customerUid,'resolveCustomerOrderOperation',{operation:request,intent:'Check'})).orderId,done.orderId);
  await assert.rejects(submit(customerUid));await assert.rejects(call(customerUid,'getCustomerOrder',{orderId:done.orderId}));
  await account(customerUid,'Update','Customer');await account(customerUid,'Disable');
  await assert.rejects(call(customerUid,'mutateCustomerOrder',request));await assert.rejects(submit(customerUid));await assert.rejects(call(customerUid,'getCustomerOrders'));
  await account(customerUid,'Approve');await identity.updateUser(customerUid,{disabled:true});
  await assert.rejects(call(customerUid,'mutateCustomerOrder',request));await assert.rejects(submit(customerUid));await assert.rejects(call(customerUid,'getCustomerOrders'));
 }finally{
  await identity.updateUser(customerUid,{disabled:false});const profile=await row('users',customerUid);if(profile.status!=='Approved')await account(customerUid,'Approve');else if(profile.role!=='Customer')await account(customerUid,'Update','Customer');
 }
});

test('target Customer authority is rechecked before staff acceptance without issuing a code',async()=>{
 const order=await submit(otherUid),initial=await counter();
 try{
  await identity.updateUser(otherUid,{disabled:true});await assert.rejects(accept(order));assert.deepEqual(await counter(),initial);
  await identity.updateUser(otherUid,{disabled:false});await account(otherUid,'Disable');await assert.rejects(accept(order));assert.deepEqual(await counter(),initial);
  await account(otherUid,'Approve');await account(otherUid,'Update','Viewer');await assert.rejects(accept(order));assert.deepEqual(await counter(),initial);
  assert.equal((await row('customerOrders',order.orderId)).status,'Submitted');
 }finally{
  await identity.updateUser(otherUid,{disabled:false});const profile=await row('users',otherUid);if(profile.status!=='Approved')await account(otherUid,'Approve');else if(profile.role!=='Customer')await account(otherUid,'Update','Customer');
 }
});

test('malformed mappings, inactive, missing and foreign products fail without consuming shipment numbers',async()=>{
 const order=await submit(),initial=await counter(),productBefore=await row('products',productId);
 const foreignId=tag+'-foreign-product',foreignRef=db.doc('products/'+foreignId),foreign={...productBefore,ownerId:'foreign-'+tag,name:'Fictional foreign boundary carton',barcode:'foreign-'+tag};
 assert(!(await foreignRef.get()).exists);await foreignRef.create(foreign);const createdHash=hash((await foreignRef.get()).data());
 try{
  const cases=[{mapping:[]},{mapping:[{lineIndex:0,productId},{lineIndex:0,productId}]},{mapping:[{lineIndex:1,productId}]},{mapping:[{lineIndex:0,productId:inactiveId}]},{mapping:[{lineIndex:0,productId:tag+'-missing'}]},{mapping:[{lineIndex:0,productId:foreignId}]}];
  for(const patch of cases){await assert.rejects(accept(order,patch));assert.deepEqual(await counter(),initial);assert.equal((await row('customerOrders',order.orderId)).status,'Submitted');}
  const oversized=await submit(customerUid,[{description:'First fictional carton line',quantity:6000},{description:'Second fictional carton line',quantity:6000}]);
  await assert.rejects(accept(oversized,{mapping:[{lineIndex:0,productId},{lineIndex:1,productId}]}));assert.deepEqual(await counter(),initial);
  await assert.rejects(call(actors.logistics,'getCustomerOrdersForStaff',{}, {workspaceId:'foreign-'+tag}));
  await assert.rejects(call(customerUid,'getCustomerOrder',{orderId:order.orderId},{workspaceId:scope}));
  assert.deepEqual(await row('products',productId),productBefore);
 }finally{
  await db.runTransaction(async tx=>{const current=await tx.get(foreignRef);assert(current.exists&&hash(current.data())===createdHash,'Refuse to remove a changed foreign fixture.');tx.delete(foreignRef);});assert(!(await foreignRef.get()).exists);
 }
});

test('rejection, Customer cancellation and unsent-operation fencing allocate no shipment code',async()=>{
 const initial=await counter(),first=await submit(),second=await submit();
 const rejected=await mutate(actors.manager,acceptance(first,{decision:'Reject',message:'Fictional item needs clarification.',expectedDelivery:'',mapping:[]}));assert.equal(rejected.orderStatus,'Rejected');
 const cancelled=await mutate(customerUid,{kind:'Cancel',orderId:second.orderId,expectedVersion:1});assert.equal(cancelled.orderStatus,'Cancelled');
 const request={kind:'Submit',operationId:randomUUID(),data:data()};
 assert.equal((await call(customerUid,'resolveCustomerOrderOperation',{operation:request,intent:'Cancel'})).state,'Cancelled');assert.equal((await call(customerUid,'mutateCustomerOrder',request)).state,'Cancelled');
 assert.deepEqual(await counter(),initial);for(const id of [first.orderId,second.orderId])assert.equal((await row('customerOrders',id)).shipmentId,null);
});

test('ordinary Draft editing preserves customer lineage, trusted item snapshots and immutable business reference',async()=>{
 const order=await submit(),accepted=await accept(order),before=await row('shipments',accepted.shipmentId),productBefore=await row('products',productId),linkBefore=await row('customerOrderShipmentLinks',accepted.shipmentId);
 const editable={reference:before.reference,recipient:'Updated fictional receiver',phone:before.phone,address:before.address,expectedDelivery:before.expectedDelivery,parcelCount:before.parcelCount,packed:before.packed,handoverReference:before.handoverReference,driver:before.driver,status:before.status,items:before.items.map(({productId,quantity})=>({productId,quantity}))};
 await call(actors.logistics,'save',{kind:'shipments',existing:{id:accepted.shipmentId,version:before.version},data:{...editable,items:editable.items.map(item=>({...item,name:'Forged item snapshot',sku:'FORGED'})),customerOrderId:'forged-order-id',ownerId:'forged-owner',updatedBy:'forged-actor',createdAt:'forged-time',version:9000}});
 const saved=await row('shipments',accepted.shipmentId);
 assert.equal(saved.customerOrderId,order.orderId);assert.equal(saved.ownerId,scope);assert.equal(saved.updatedBy,actors.logistics);assert.equal(saved.reference,before.reference);assert.equal(saved.createdAt.toMillis(),before.createdAt.toMillis());assert.equal(saved.status,'Draft');assert.equal(saved.recipient,editable.recipient);assert.equal(saved.version,before.version+1);assert.deepEqual(saved.items,before.items);assert.deepEqual(await row('customerOrderShipmentLinks',accepted.shipmentId),linkBefore);assert.deepEqual(await row('products',productId),productBefore);
 await assert.rejects(call(actors.logistics,'save',{kind:'shipments',existing:{id:accepted.shipmentId,version:saved.version},data:{...editable,reference:'SHP-999999'}}));
 assert.equal((await call(customerUid,'getCustomerOrder',{orderId:order.orderId})).shipment.shipmentId,accepted.shipmentId);
});

test('order paging is bounded at twenty and cursors bind actor, staff view and status filter',async()=>{
 const expected=[];for(let i=0;i<21;i++)expected.push((await submit(pagingUid,[{description:'Fictional page item '+i,quantity:1}])).orderId);
 await mutate(pagingUid,{kind:'Cancel',orderId:expected[0],expectedVersion:1});
 await mutate(actors.manager,acceptance({orderId:expected[1]},{decision:'Reject',message:'Fictional pagination rejection.',expectedDelivery:'',mapping:[]}));
 const first=await call(pagingUid,'getCustomerOrders');assert.equal(first.rows.length,20);assert.equal(first.hasMore,true);assert(first.cursor);
 const next=await call(pagingUid,'getCustomerOrders',{cursor:first.cursor});assert.equal(next.rows.length,1);assert.equal(next.hasMore,false);assert.equal(next.cursor,null);
 assert.deepEqual([...new Set([...first.rows,...next.rows].map(item=>item.orderId))].sort(),[...expected].sort());
 for(const status of ['Submitted','Rejected','Cancelled']){const filtered=await call(pagingUid,'getCustomerOrders',{status});assert.equal(filtered.rows.length,status==='Submitted'?19:1);assert(filtered.rows.every(item=>item.status===status));assert.equal(filtered.hasMore,false);}
 await assert.rejects(call(otherUid,'getCustomerOrders',{cursor:first.cursor}));await assert.rejects(call(pagingUid,'getCustomerOrders',{cursor:first.cursor,status:'Submitted'}));
 await assert.rejects(call(actors.logistics,'getCustomerOrdersForStaff',{cursor:first.cursor}));
 const staff=await call(actors.logistics,'getCustomerOrdersForStaff');assert.equal(staff.rows.length,20);assert(staff.cursor);await assert.rejects(call(pagingUid,'getCustomerOrders',{cursor:staff.cursor}));
 await assert.rejects(call(pagingUid,'getCustomerOrders',{status:'Dispatched'}));
});

test('Customer and staff SDK sessions cannot directly read, list or write any new collection',async()=>{
 const {initializeApp}=await import('firebase/app'),{getAuth,connectAuthEmulator,signInWithCustomToken}=await import('firebase/auth'),{getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,setDoc}=await import('firebase/firestore');
 const privateKinds=['customerOrders','customerOrderOperations','customerOrderReferences','customerOrderShipmentLinks'];
 for(const uid of [customerUid,actors.logistics]){
  const client=initializeApp({projectId:project,apiKey:'emulator-only-key',authDomain:'localhost'},tag+'-'+uid);clients.push(client);const auth=getAuth(client),clientDB=getFirestore(client);
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(clientDB,'127.0.0.1',8081);await signInWithCustomToken(auth,await identity.createCustomToken(uid));
  for(const kind of privateKinds){const existing=(await db.collection(kind).limit(1).get()).docs[0];assert(existing,'A fixture must exist for '+kind);await assert.rejects(getDoc(doc(clientDB,kind,existing.id)),error=>error.code==='permission-denied');await assert.rejects(getDocs(collection(clientDB,kind)),error=>error.code==='permission-denied');const forbidden=tag+'-forged-'+uid;await assert.rejects(setDoc(doc(clientDB,kind,forbidden),{ownerId:scope,customerUid:uid}),error=>error.code==='permission-denied');assert(!(await db.doc(kind+'/'+forbidden).get()).exists);}
 }
});
