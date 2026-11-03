import assert from 'node:assert/strict';
import {test,beforeEach,mock} from 'node:test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),als=new AsyncLocalStorage();
let rows,revision,identities,identityHook,readHook,commands;
const clone=x=>x===undefined?undefined:structuredClone(x),ref=path=>({path});
function query(kind,filters=[],after=null,cap=Infinity){return {kind,filters,after,cap,query:true,where:(...f)=>query(kind,[...filters,f],after,cap),orderBy:()=>query(kind,filters,after,cap),startAfter:id=>query(kind,filters,id,cap),limit:n=>query(kind,filters,after,n)};}
const db={doc:ref,collection:kind=>({...query(kind),doc:id=>ref(kind+'/'+id)}),async runTransaction(work){return als.run(true,async()=>{for(let i=0;i<30;i++){
 const version=revision,view=new Map([...rows].map(([k,v])=>[k,clone(v)])),writes=[];
 const snap=(path,data)=>({id:path.split('/').at(-1),ref:ref(path),exists:data!==undefined,data:()=>clone(data)});
 const tx={async get(r){assert.equal(writes.length,0,'read after write');await readHook(r);if(!r.query)return snap(r.path,view.get(r.path));let docs=[...view].filter(([p])=>p.startsWith(r.kind+'/')).map(([p,v])=>snap(p,v));for(const [f,op,v]of r.filters)docs=docs.filter(d=>op==='=='?d.data()[f]===v:op==='in'?v.includes(d.data()[f]):true);docs.sort((a,b)=>a.id.localeCompare(b.id));if(r.after)docs=docs.filter(d=>d.id>r.after);docs=docs.slice(0,r.cap);return {docs,size:docs.length};},create(r,v){assert(!view.has(r.path));writes.push([r.path,v]);},set(r,v){writes.push([r.path,v]);},update(r,v){assert(view.has(r.path));writes.push([r.path,{...view.get(r.path),...v}]);}};
 const result=await work(tx);if(version!==revision)continue;for(const [p,v]of writes)rows.set(p,clone(v));revision++;return result;
 }throw Error('transaction retry exhausted');});}};
const identity=async uid=>{assert(!als.getStore(),'Auth IO inside transaction');await identityHook(uid);const user=identities.get(uid);if(!user)throw Error('missing identity');return clone(user);};
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>db);mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>({seconds:1000,nanoseconds:0}));mock.method(require('firebase-admin/auth'),'getAuth',()=>({getUser:identity}));
const {createCustomerCommands,customerGrantId}=await import('../backend/functions/customerAccess.mjs');
const access=await import('../backend/functions/access.mjs');
const call=(name,input={},uid='customer1',scope='scope')=>['getCustomerShipments','getCustomerShipment'].includes(name)?commands[name]({uid},input):commands[name]({uid},scope,input);
const request=(patch={})=>({operationId:randomUUID(),customerUid:'customer1',shipmentId:'s1',expectedVersion:0,shareLocation:false,notes:'Explicit demonstration shipment access.',...patch});
const grant=async(patch={})=>{const input=request(patch);await call('grantCustomerShipment',input,'manager');return input;};
const forbidden=['ownerId','workspaceId','actor','driverUid','recipient','phone','address','items','cost','notes','sha256','path','score','model'];
beforeEach(()=>{
 revision=0;identityHook=()=>{};readHook=()=>{};rows=new Map([['system/config',{dataScopeId:'scope',primaryAdminUid:'admin'}],
  ...['Admin','Manager','Inventory','Warehouse','Logistics','Driver','Viewer'].map(role=>['users/'+role.toLowerCase(),{uid:role.toLowerCase(),displayName:role,role,status:'Approved',active:true,version:1}]),
  ['users/customer1',{uid:'customer1',displayName:'Customer One',role:'Customer',status:'Approved',active:true,version:1}],['users/customer2',{uid:'customer2',displayName:'Customer Two',role:'Customer',status:'Approved',active:true,version:1}],['users/pending',{uid:'pending',displayName:'Pending',role:null,status:'Pending',active:false,version:1}],
  ['shipments/s1',{ownerId:'scope',reference:'DEMO-1',status:'Dispatched',expectedDelivery:'2026-10-25',recipient:'internal-recipient',address:'private-address',phone:'private-phone',items:[{productId:'p',quantity:1}],version:2}],['shipments/s2',{ownerId:'scope',reference:'DEMO-2',status:'Prepared',expectedDelivery:'2026-10-26',version:1}],['shipments/foreign',{ownerId:'other',reference:'FOREIGN',status:'Dispatched'}],
  ['products/p',{ownerId:'scope',quantityOnHand:100,version:1}],['deliveries/s1',{ownerId:'scope',shipmentId:'s1',status:'In Transit',proofId:null,notes:'private-delivery-note',version:1}],['deliveryEvents/event1',{ownerId:'scope',shipmentId:'s1',status:'In Transit',createdAt:{seconds:1000,nanoseconds:0},actor:'private-driver-id',notes:'private-event-note'}],['locations/s1',{ownerId:'scope',shipmentId:'s1',latitude:0,longitude:101,accuracy:4,submittedAt:{seconds:1000,nanoseconds:0},actor:'private-driver-id'}],
 ]);
 identities=new Map([...rows.keys()].filter(p=>p.startsWith('users/')).map(p=>[p.slice(6),{uid:p.slice(6),disabled:false,email:p.slice(6)+'@example.test',emailVerified:true}]));
 commands=createCustomerCommands({identity,clock:()=>1000000});
 Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'});
});
test('Customer account role is separate from seven staff and cannot acquire staff scope',async()=>{
 assert.equal(access.ROLES.length,7);assert(!access.ROLES.includes('Customer'));assert.deepEqual(access.ACCOUNT_ROLES,[...access.ROLES,'Customer']);
 await assert.rejects(access.approvedScope({uid:'customer1'}),e=>e.code==='permission-denied');for(const role of access.ROLES)assert.equal(await access.approvedScope({uid:role.toLowerCase()}),'scope');
 await assert.rejects(access.approvedTransaction({uid:'customer1'},['Customer'],()=>{throw Error('Customer must never enter staff transactions');}),e=>e.code==='permission-denied');
});
test('Admin alone assigns Customer while primary/self Admin invariants remain intact',async()=>{
 await access.updateAccount({uid:'admin'},{uid:'pending',version:1,step:'Approve',role:'Customer'});assert.equal(rows.get('users/pending').role,'Customer');
 await assert.rejects(access.updateAccount({uid:'manager'},{uid:'customer2',version:1,step:'Update',role:'Admin'}));
 await assert.rejects(access.updateAccount({uid:'admin'},{uid:'admin',version:1,step:'Update',role:'Customer'}));assert.equal(rows.get('users/admin').role,'Admin');
 const before=clone(rows.get('users/customer1'));await access.registerAccount({uid:'customer1'},{role:'Admin',status:'Approved',active:true});assert.equal(rows.get('users/customer1').role,before.role);
});
test('explicit staff grant yields only allowed own-customer summaries and public updates',async()=>{
 const original=clone(rows.get('products/p'));await grant();const list=await call('getCustomerShipments');assert.equal(list.rows.length,1);assert.deepEqual(Object.keys(list.rows[0]).sort(),['expectedDelivery','reference','shipmentId','status']);assert.equal(list.rows[0].reference,'DEMO-1');
 const detail=await call('getCustomerShipment',{shipmentId:'s1'});assert.equal(detail.status,'In Transit');assert.equal(detail.location,null);assert.equal(detail.proof,null);assert.equal(detail.timeline.rows[0].status,'In Transit');
 const serialized=JSON.stringify(detail);for(const term of ['private-','internal-recipient','private-address'])assert(!serialized.includes(term));for(const key of forbidden)assert(!Object.hasOwn(detail,key));assert.deepEqual(rows.get('products/p'),original);
});
test('missing guessed foreign cross-customer scope and extra fields never expose a shipment',async()=>{
 await grant();await assert.rejects(call('getCustomerShipment',{shipmentId:'s1'},'customer2'));for(const shipmentId of ['s2','foreign','missing'])await assert.rejects(call('getCustomerShipment',{shipmentId}));
 for(const input of [{ownerId:'scope'},{workspaceId:'scope'},{customerUid:'customer1'},{cursor:'bad'}])await assert.rejects(call('getCustomerShipments',input));assert.equal((await call('getCustomerShipments',{},'customer2')).rows.length,0);
});
test('every staff role, pending disabled and Auth-disabled customer is denied customer projections',async()=>{
 await grant();for(const uid of ['admin','manager','inventory','warehouse','logistics','driver','viewer','pending'])await assert.rejects(call('getCustomerShipments',{},uid));
 identities.get('customer1').disabled=true;await assert.rejects(call('getCustomerShipment',{shipmentId:'s1'}));identities.get('customer1').disabled=false;rows.get('users/customer1').active=false;await assert.rejects(call('getCustomerShipments'));
});
test('location opt-in returns only a valid latest active-delivery observation and closes with delivery',async()=>{
 await grant({shareLocation:true});let detail=await call('getCustomerShipment',{shipmentId:'s1'});assert.deepEqual(Object.keys(detail.location).sort(),['accuracy','latitude','longitude','submittedAtMs']);assert.equal(detail.location.latitude,0);
 rows.get('locations/s1').latitude=91;assert.equal((await call('getCustomerShipment',{shipmentId:'s1'})).location,null);rows.get('locations/s1').latitude=0;rows.get('deliveries/s1').status='Delivered';assert.equal((await call('getCustomerShipment',{shipmentId:'s1'})).location,null);
});
test('queued mobile location exposes capture time separately from receipt without session or driver identity',async()=>{
 await grant({shareLocation:true});Object.assign(rows.get('locations/s1'),{capturedAtMs:900000,sessionId:'private-session',sampleId:'private-sample',sequence:5});
 const detail=await call('getCustomerShipment',{shipmentId:'s1'});assert.equal(detail.location.capturedAtMs,900000);assert.equal(detail.location.submittedAtMs,1000000);assert.equal(detail.location.sessionId,undefined);assert.equal(detail.location.actor,undefined);
});
test('only the currently linked delivery-stage proof exposes bounded safe metadata',async()=>{
 await grant();rows.get('deliveries/s1').status='Delivered';rows.get('deliveries/s1').proofId='proof1';rows.set('evidence/proof1',{ownerId:'scope',shipmentId:'s1',type:'Proof of Delivery',stage:'Delivery',path:'evidence/scope/s1/proof1',name:'Proof.pdf',contentType:'application/pdf',bytes:12,sha256:'a'.repeat(64),actor:'private-driver-id'});
 const detail=await call('getCustomerShipment',{shipmentId:'s1'});assert.deepEqual(detail.proof,{evidenceId:'proof1',fileName:'Proof.pdf',contentType:'application/pdf',bytes:12});rows.get('evidence/proof1').shipmentId='s2';assert.equal((await call('getCustomerShipment',{shipmentId:'s1'})).proof,null);
});
test('immutable exact grant/revoke receipts and stale changes preserve stock and old staff records',async()=>{
 const staffBefore=clone([...rows].filter(([p])=>!p.startsWith('customerShipmentGrants/')&&!p.startsWith('auditLogs/'))),input=await grant();assert.equal((await call('grantCustomerShipment',input,'manager')).replayed,true);await assert.rejects(call('grantCustomerShipment',{...input,notes:'different input'},'manager'));
 await assert.rejects(call('revokeCustomerShipment',request(),'manager'));const revoke=request({expectedVersion:1,shareLocation:false});const result=await call('revokeCustomerShipment',revoke,'logistics');assert.equal(result.version,2);assert.equal((await call('revokeCustomerShipment',revoke,'logistics')).replayed,true);await assert.rejects(call('getCustomerShipment',{shipmentId:'s1'}));
 assert.deepEqual([...rows].filter(([p])=>staffBefore.some(([key])=>key===p)),staffBefore);
});
test('concurrent grants produce one version; a revoke racing a detail read prevents stale disclosure',async()=>{
 const pair=await Promise.allSettled([call('grantCustomerShipment',request(),'manager'),call('grantCustomerShipment',request(),'logistics')]);assert.equal(pair.filter(x=>x.status==='fulfilled').length,1);
 let revoked=false;readHook=r=>{if(!revoked&&r.path==='shipments/s1'){revoked=true;const key=customerGrantId('scope','customer1','s1');rows.get('customerShipmentGrants/'+key).active=false;revision++;}};
 await assert.rejects(call('getCustomerShipment',{shipmentId:'s1'}));
});
test('role changes during reads and malformed DTO authority never gain access',async()=>{
 await grant();identityHook=uid=>{if(uid==='customer1')rows.get('users/customer1').role='Viewer';};await assert.rejects(call('getCustomerShipments'));
 for(const input of [request({shareLocation:'true'}),request({expectedVersion:'0'}),{...request(),ownerId:'other'},request({notes:'x'}),request({shipmentId:'foreign'})])await assert.rejects(call('grantCustomerShipment',input,'manager'));
});
test('pagination remains bound to the customer and scans at most twenty active grants per page',async()=>{
 for(let i=0;i<25;i++){const id='shipment'+String(i).padStart(2,'0');rows.set('shipments/'+id,{ownerId:'scope',reference:'DEMO-'+i,status:'Prepared',expectedDelivery:'2026-10-25'});const key=customerGrantId('scope','customer1',id);rows.set('customerShipmentGrants/'+key,{ownerId:'scope',customerUid:'customer1',shipmentId:id,active:true,shareLocation:false,version:1});}
 const first=await call('getCustomerShipments');assert.equal(first.rows.length,20);assert.equal(first.hasMore,true);assert(first.cursor);const next=await call('getCustomerShipments',{cursor:first.cursor});assert.equal(next.rows.length,5);assert.equal(next.hasMore,false);await assert.rejects(call('getCustomerShipments',{cursor:first.cursor},'customer2'));assert.equal(new Set([...first.rows,...next.rows].map(x=>x.shipmentId)).size,25);
});
test('staff context confirms one explicit Customer and current grant version without directory exposure',async()=>{
 const input={customerUid:'customer1',shipmentId:'s1'},context=await call('getCustomerAccessContext',input,'manager');assert.equal(context.customer.uid,'customer1');assert.equal(context.grant.version,0);assert.equal(context.grant.shareLocation,false);assert(!JSON.stringify(context).includes('example.test'));await grant();assert.equal((await call('getCustomerAccessContext',input,'logistics')).grant.version,1);await assert.rejects(call('getCustomerAccessContext',input,'viewer'));
});
test('service routes own customer reads separately and refuses guessed scope or old staff commands',async()=>{
 const {executeCommand}=await import('../backend/functions/service.mjs');await grant();const own=await executeCommand({uid:'customer1'},{action:'getCustomerShipments',input:{}});assert.equal(own.rows.length,1);
 await assert.rejects(executeCommand({uid:'customer1'},{action:'getCustomerShipments',input:{},workspaceId:'scope'}));
 for(const action of ['save','stock','planTransport','delivery','location','prepareVerification','predict','registerEvidence'])await assert.rejects(executeCommand({uid:'customer1'},{action,input:{}}),e=>e.code==='permission-denied');
});
test('terminal grant recovery survives target deletion, while new grants require live Auth',async()=>{
 const input=await grant();identities.delete('customer1');rows.delete('users/customer1');assert.equal((await call('grantCustomerShipment',input,'manager')).replayed,true);assert.equal((await call('resolveCustomerShipmentGrant',input,'manager')).replayed,true);await assert.rejects(call('grantCustomerShipment',request({shipmentId:'s2'}),'manager'));
 const revoke=request({expectedVersion:1});assert.equal((await call('revokeCustomerShipment',revoke,'manager')).state,'Completed');
});
test('resolve-before-send creates a grant tombstone without changing access',async()=>{
 const input=request();assert.equal((await call('resolveCustomerShipmentGrant',input,'manager')).state,'Cancelled');assert.equal((await call('grantCustomerShipment',input,'manager')).state,'Cancelled');assert.equal((await call('getCustomerShipments')).rows.length,0);
});
test('a missing or foreign current source cannot be used through an otherwise active grant',async()=>{
 await grant();rows.get('shipments/s1').ownerId='foreign';await assert.rejects(call('getCustomerShipment',{shipmentId:'s1'}));assert.equal((await call('getCustomerShipments')).rows.length,0);
});
