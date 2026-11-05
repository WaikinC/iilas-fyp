import{createFixtureBusinessRecord,fixtureCreationData}from'./record-creation-fixtures.mjs';
// Isolated emulator scenarios. Never migrate personal inventories or production data.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {doc,getDoc,getDocs,collection,query,where,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {admin,client,scope,suffix,barcode,fixtureDB,snapshot,close} from './access-test-client.mjs';
import {canonicalRecord} from '../lib/integrity.js';
import {validateStockRequest} from '../lib/validation.js';
const {FieldValue}=createRequire(new URL('../backend/functions/package.json',import.meta.url))('firebase-admin/firestore');
let checks=0,ordinal=120;
const check=async fn=>{await fn();checks++;};
const bad=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const denied=fn=>bad(fn,e=>/permission-denied/.test(e.code));
const inventory=await client('Inventory'),manager=await client('Manager'),warehouse=await client('Warehouse'),viewer=await client('Viewer'),logistics=await client('Logistics'),driver=await client('Driver'),outsider=await client('Outsider',false);
const product=async(name,quantityOnHand=20)=>{
 const {id}=await createFixtureBusinessRecord(inventory,'products',fixtureCreationData('products',{name:`${name} ${suffix}`,sku:`LOC-${suffix}-${ordinal}`,barcode:barcode(ordinal++),category:'QA',location:'A-01',reorderLevel:3,quantityOnHand,reservedQuantity:0,status:'Active',imageDataUrl:''}));return id;
};
const command=(productId,type,quantity,extra={})=>{
 const operationId=randomUUID();
 return {productId,type,quantity,reason:'Physical count and location checked',reference:`LOC-${suffix}-${operationId}`,operationId,...extra};
};
const move=(id,type,quantity,extra={},actor=inventory)=>actor.call('stock',command(id,type,quantity,extra));
const correction=(productId,correctionOf,extra={})=>({productId,type:'Correction',correctionOf,reason:'Duplicate manual entry independently counted',reference:`FIX-${suffix}`,operationId:randomUUID(),...extra});
const review=(id,decision='Approve',actor=manager)=>actor.call('approval',{id,version:1,decision,notes:'Independent physical balance and entry reviewed'});
const rows=async id=>(await snapshot('products',id)).locationBalances.map(r=>[r.location,r.quantity,r.reserved,r.warehouse]);
const digest=r=>createHash('sha256').update(canonicalRecord('inventory',r)).digest('hex');
const movementCount=async id=>(await fixtureDB.collection('stockMovements').where('productId','==',id).get()).size;
const draft=async(id,quantity,label)=>{const {id:key}=await createFixtureBusinessRecord(logistics,'shipments',fixtureCreationData('shipments',{reference:`LOC-${suffix}-${label}`,recipient:'Location QA receiver',phone:'0123456789',address:'Warehouse A Kuala Lumpur',expectedDelivery:'2099-12-01',driver:'',handoverReference:'',packed:false,status:'Draft',parcelCount:1,items:[{productId:id,quantity}]}));return key;};
const step=(shipmentId,stage,version)=>warehouse.call('warehouse',{shipmentId,version,data:{step:stage,notes:'Bin quantities physically checked',parcelCount:1}});
let registeredDriver;
async function dispatch(shipmentId){
 const vehicle=await logistics.call('entity',{kind:'vehicles',data:{name:`LOC-${suffix}-${ordinal++}`,capacity:10,status:'Available',maintenanceDate:'2099-12-01',fuelLitres:40}});
 registeredDriver??=await logistics.call('entity',{kind:'drivers',data:{name:`Location driver ${ordinal}`,userId:driver.uid,licence:`LOC-${suffix}-${ordinal++}`,status:'Available'}});
 await logistics.call('planTransport',{shipmentId,vehicleId:vehicle.id,driverId:registeredDriver.id,origin:'Warehouse A',carrier:'IILAS Fleet',distanceKm:20,estimatedHours:1,cost:35,plannedDate:'2026-10-10'});
 const ready=await snapshot('shipments',shipmentId);
 await logistics.call('save',{kind:'shipments',data:{...ready,status:'Dispatched'},existing:ready});
 // Release resource locks for the next isolated dispatch scenario.
 await driver.call('delivery',{shipmentId,version:0,status:'In Transit',notes:'QA dispatch departed warehouse'});
 await driver.call('delivery',{shipmentId,version:1,status:'Returned',notes:'QA dispatch returned to receiver workflow'});
}
try{
 const p=await product('Location pump');
 await check(async()=>assert.equal((validateStockRequest(command(p,'Receipt',1))).locationFrom,undefined));
 await move(p,'Transfer',8,{locationFrom:' a-01 ',locationTo:'B-02'});
 await check(async()=>assert.equal((await snapshot('products',p)).quantityOnHand,20));
 await check(async()=>assert.equal((await snapshot('products',p)).location,'A-01'));
 assert.deepEqual(await rows(p),[['A-01',12,0,0],['B-02',8,0,0]]);checks++;
 await move(p,'Reservation',5,{locationFrom:'B-02'});
 for(const [type,extra] of [['Transfer',{locationTo:'C-03'}],['Issue',{}],['Adjustment',{adjustmentDirection:'Decrease'}]])await bad(()=>move(p,type,4,{locationFrom:'B-02',...extra},admin),/available stock/);
 await bad(()=>move(p,'Transfer',1,{locationFrom:'B-02',locationTo:' b-02 '}),/different destination/);
 await bad(()=>move(p,'Issue',1,{locationFrom:'MISSING'}),/existing stock location/);
 await move(p,'Receipt',2,{locationFrom:' b-02 '});assert.deepEqual(await rows(p),[['A-01',12,0,0],['B-02',10,5,0]]);checks++;
 const transfers=await Promise.allSettled([move(p,'Transfer',8,{locationFrom:'A-01',locationTo:'C-03'}),move(p,'Transfer',8,{locationFrom:'A-01',locationTo:'D-04'})]);
 await check(async()=>assert.equal(transfers.filter(r=>r.status==='fulfilled').length,1));
 await check(async()=>assert.match(transfers.find(r=>r.status==='rejected').reason.message,/available stock/));
 await check(async()=>assert.equal((await snapshot('products',p)).quantityOnHand,22));
 // Saving catalogue data cannot forge authoritative bin balances.
 let saved=await snapshot('products',p),beforeRows=await rows(p);
 await inventory.call('save',{kind:'products',existing:saved,data:{...saved,name:`Location pump edited ${suffix}`,locationBalances:[{location:'FORGED',quantity:999,reserved:0,warehouse:0}]}});
 assert.deepEqual(await rows(p),beforeRows);checks++;
 for(const c of [admin,inventory,warehouse,viewer])await denied(()=>updateDoc(doc(c.db,'products',p),{locationBalances:[]}));

 // Multi-bin picking, release protection, cancellation and exact dispatch allocation.
 const picked=await product('Split-bin picking',10);await move(picked,'Transfer',6,{locationTo:'B-02'});await move(picked,'Reservation',1,{locationFrom:'A-01'});
 const shipment=await draft(picked,7,'SPLIT');await step(shipment,'Picking',0);
 let job=await snapshot('warehouseHandovers',shipment);
 await check(async()=>assert.deepEqual(job.items[0].allocations,[{location:'A-01',quantity:3},{location:'B-02',quantity:4}]));
 assert.deepEqual(await rows(picked),[['A-01',4,4,3],['B-02',6,4,4]]);checks++;
 await bad(()=>move(picked,'Release',2,{locationFrom:'A-01'}),/Warehouse allocations/);
 await bad(()=>move(picked,'Transfer',3,{locationFrom:'B-02',locationTo:'C-03'}),/available stock/);
 await warehouse.call('cancelWarehouse',{shipmentId:shipment,version:1,notes:'Cancel the exact bins after physical check'});
 assert.deepEqual(await rows(picked),[['A-01',4,1,0],['B-02',6,0,0]]);checks++;
 await step(shipment,'Picking',2);await step(shipment,'Packed',3);await step(shipment,'HandedOver',4);
 await dispatch(shipment);
 assert.deepEqual(await rows(picked),[['A-01',1,1,0],['B-02',2,0,0]]);checks++;
 job=await snapshot('warehouseHandovers',shipment);
 await check(async()=>{assert.equal(job.reservationsHeld,false);assert.equal(job.version,6);assert.ok(job.dispatchConsumedAt);assert.equal(job.dispatchMovementIds.length,1);});
 const dispatchMove=await snapshot('stockMovements',job.dispatchMovementIds[0]);
 await check(async()=>{assert.equal(dispatchMove.origin,'Warehouse');assert.equal(dispatchMove.shipmentId,shipment);assert.equal(dispatchMove.locationChanges.length,2);});
 await bad(()=>inventory.call('stock',correction(picked,dispatchMove.id)),/owning workflow/);

 // Older products and held jobs without ledger/allocations preserve their IDs and totals.
 for(const mode of ['cancel','dispatch']){
  const legacy=await product(`Legacy ${mode}`,8),legacyShipment=await draft(legacy,3,`LEGACY-${mode}`);
  await step(legacyShipment,'Picking',0);
  await fixtureDB.doc(`products/${legacy}`).update({locationBalances:FieldValue.delete()});
  const legacyJob=await snapshot('warehouseHandovers',legacyShipment);
  await fixtureDB.doc(`warehouseHandovers/${legacyShipment}`).update({items:legacyJob.items.map(item=>{const copy={...item};delete copy.allocations;return copy;})});
  await bad(()=>move(legacy,'Transfer',8,{locationTo:'B-02'}),/available stock/);
  if(mode==='cancel'){
   await warehouse.call('cancelWarehouse',{shipmentId:legacyShipment,version:1,notes:'Release original legacy default location'});
   assert.deepEqual(await rows(legacy),[['A-01',8,0,0]]);checks++;
  }else{
   await step(legacyShipment,'Packed',1);await step(legacyShipment,'HandedOver',2);await dispatch(legacyShipment);
   assert.deepEqual(await rows(legacy),[['A-01',5,0,0]]);checks++;
  }
  await check(async()=>assert.equal((await snapshot('products',legacy)).id,legacy));
 }

 // Full reversals of each eligible manual movement, immutable originals and linked v2 hashes.
 for(const [type,quantity,extra] of [['Receipt',3,{}],['Issue',2,{}],['Adjustment',2,{adjustmentDirection:'Increase'}],['Adjustment',2,{adjustmentDirection:'Decrease'}],['Transfer',4,{locationTo:'B-02'}]]){
  const id=await product(`Correction ${type}`),base=await rows(id),originalResult=await move(id,type,quantity,extra,admin),original=await snapshot('stockMovements',originalResult.id),hashBefore=digest(original),stockBefore=await snapshot('products',id),countBefore=await movementCount(id);
  const request=correction(id,original.id),created=await inventory.call('stock',request);
  await check(async()=>assert.equal(created.pendingApproval,true));
  await check(async()=>assert.equal((await snapshot('products',id)).version,stockBefore.version));
  await denied(()=>review(created.id,'Approve',inventory));
  await bad(()=>inventory.call('stock',correction(id,original.id)),/pending or approved/);
  const parallel=await Promise.allSettled([review(created.id),review(created.id)]);
  await check(async()=>assert.equal(parallel.filter(r=>r.status==='fulfilled').length,1));
  assert.deepEqual(await rows(id),base);checks++;
  const approved=await snapshot('approvals',created.id),reversal=await snapshot('stockMovements',approved.movementId),link=await snapshot('stockCorrectionLinks',original.id);
  await check(async()=>{assert.equal(reversal.type,'Correction');assert.equal(reversal.origin,'Correction');assert.equal(reversal.correctionOf,original.id);assert.equal(reversal.approvalId,created.id);assert.equal(reversal.quantityChange,original.quantityChange===0?0:-original.quantityChange);assert.equal(reversal.integrityVersion,2);assert.equal(link.status,'Approved');assert.equal(link.movementId,reversal.id);});
  await check(async()=>assert.equal(await movementCount(id),countBefore+1));
  await check(async()=>assert.equal(digest(await snapshot('stockMovements',original.id)),hashBefore));
  const prepared=await admin.call('prepareVerification',{kind:'inventory',id:reversal.id});
  await check(async()=>{assert.equal(prepared.digest,digest(reversal));assert.equal(prepared.canonical,canonicalRecord('inventory',reversal));});
  await check(async()=>assert.notEqual(digest({...reversal,correctionOf:'tampered'}),digest(reversal)));
  const replay=await inventory.call('stock',request);await check(async()=>{assert.equal(replay.id,created.id);assert.equal(replay.replayed,true);});
  await bad(()=>inventory.call('stock',{...request,reason:'Changed request with the same operation'}),/different stock movement/);
  await bad(()=>inventory.call('stock',correction(id,original.id)),/pending or approved/);
  await bad(()=>inventory.call('stock',correction(id,reversal.id)),/owning workflow/);
 }

 // Any request, including one by Admin, requires a different reviewer.
 const independent=await product('Independent correction'),original=await move(independent,'Receipt',4),request=correction(independent,original.id);
 const created=await admin.call('stock',request);await bad(()=>review(created.id,'Approve',admin),/Another manager/);
 await review(created.id,'Reject');await check(async()=>assert.equal((await snapshot('products',independent)).quantityOnHand,24));
 await check(async()=>assert.equal((await snapshot('stockCorrectionLinks',original.id)).status,'Rejected'));
 const simultaneous=await Promise.allSettled([inventory.call('stock',correction(independent,original.id)),warehouse.call('stock',correction(independent,original.id))]);
 await check(async()=>assert.equal(simultaneous.filter(r=>r.status==='fulfilled').length,1));
 const pending=simultaneous.find(r=>r.status==='fulfilled').value;
 await review(pending.id);await check(async()=>assert.equal((await snapshot('products',independent)).quantityOnHand,20));
 // Reservation changes after submission must make approval fail atomically and remain pending.
 const conflict=await product('Correction consumed',0),received=await move(conflict,'Receipt',5),conflictRequest=await inventory.call('stock',correction(conflict,received.id));
 await move(conflict,'Reservation',1);const conflictBefore=await snapshot('products',conflict),conflictCount=await movementCount(conflict);
 await bad(()=>review(conflictRequest.id),/available stock/);
 await check(async()=>{assert.equal((await snapshot('approvals',conflictRequest.id)).status,'Pending');assert.equal((await snapshot('stockCorrectionLinks',received.id)).status,'Pending');assert.equal((await snapshot('products',conflict)).version,conflictBefore.version);assert.equal(await movementCount(conflict),conflictCount);});
 await move(conflict,'Release',1);await move(conflict,'Issue',5);await bad(()=>review(conflictRequest.id),/available stock/);await review(conflictRequest.id,'Reject');
 // An inverse receipt cannot exceed aggregate capacity even if its bin has room.
 const capacity=await product('Correction capacity',1000000),issued=await move(capacity,'Issue',1),capacityRequest=await inventory.call('stock',correction(capacity,issued.id));await move(capacity,'Receipt',1,{locationFrom:'B-02'});
 await bad(()=>review(capacityRequest.id),/invalid resulting balance/);await check(async()=>assert.equal((await snapshot('approvals',capacityRequest.id)).status,'Pending'));
 // Correction validation, ownership, role and target eligibility.
 const target=await product('Correction validation'),manual=await move(target,'Receipt',2),reserved=await move(target,'Reservation',1),foreignId=`foreign_${suffix}`;
 await fixtureDB.doc(`stockMovements/${foreignId}`).set({...((await fixtureDB.doc(`stockMovements/${manual.id}`).get()).data()),ownerId:outsider.uid});
 for(const c of [viewer,logistics,driver,outsider])await denied(()=>c.call('stock',correction(target,manual.id)));
 await bad(()=>inventory.call('stock',correction(p,manual.id)),/another product/);
 await bad(()=>inventory.call('stock',correction(target,foreignId)),/not found/);
 await bad(()=>inventory.call('stock',correction(target,reserved.id)),/owning workflow/);
 for(const fields of [{quantity:2},{locationFrom:'A-01'},{status:'Approved'},{adjustmentDirection:'Decrease'},{ownerId:scope}])await bad(()=>inventory.call('stock',correction(target,manual.id,fields)),/unsupported fields/);
 for(const input of [{correctionOf:''},{reason:' '},{reference:'x'.repeat(81)},{correctionOf:'bad/id'},{operationId:'bad'}])await bad(()=>inventory.call('stock',correction(target,manual.id,input)),/movement|reason|Reference|reference|Record ID|operation ID/);
 for(const origin of [undefined,'Procurement','Warehouse']){
  const legacyId=randomUUID(),data={...((await fixtureDB.doc(`stockMovements/${manual.id}`).get()).data())};delete data.id;if(origin===undefined)delete data.origin;else data.origin=origin;
  await fixtureDB.doc(`stockMovements/${legacyId}`).set(data);await bad(()=>inventory.call('stock',correction(target,legacyId)),/owning workflow/);
 }
 await fixtureDB.doc(`products/${target}`).update({status:'Inactive'});await bad(()=>inventory.call('stock',correction(target,manual.id)),/active product/);
 await fixtureDB.doc(`products/${target}`).update({status:'Active',archived:true});await bad(()=>inventory.call('stock',correction(target,manual.id)),/active product/);await fixtureDB.doc(`products/${target}`).update({archived:false});
 // Precommit outcome tombstone and old canonical receipt compatibility.
 const cancelled=correction(target,manual.id);await check(async()=>assert.equal((await inventory.call('resolveStock',cancelled)).notApplied,true));await check(async()=>assert.equal((await inventory.call('stock',cancelled)).notApplied,true));
 const oldCommand=command(target,'Receipt',1),canonical=validateStockRequest(oldCommand),receiptId=createHash('sha256').update(JSON.stringify([scope,inventory.uid,oldCommand.operationId])).digest('hex');
 await check(async()=>assert.equal(Object.hasOwn(canonical,'locationFrom'),false));
 await fixtureDB.doc(`stockRequests/${receiptId}`).set({ownerId:scope,actor:inventory.uid,commandHash:createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),result:{id:'preserved-legacy-result'}});
 await check(async()=>assert.equal((await inventory.call('stock',oldCommand)).id,'preserved-legacy-result'));
 // Corrupt bins fail closed without replacing IDs or changing quantities.
 const corrupt=await product('Corrupt ledger');await fixtureDB.doc(`products/${corrupt}`).update({locationBalances:[{location:'A-01',quantity:19,reserved:0,warehouse:0}]});await bad(()=>move(corrupt,'Receipt',1),/totals do not match/);await check(async()=>assert.equal((await snapshot('products',corrupt)).quantityOnHand,20));

 // Correction claims are scoped readable records, with all direct writes denied.
 for(const c of [admin,inventory,warehouse,viewer]){
  await check(async()=>assert.equal((await getDoc(doc(c.db,'stockCorrectionLinks',original.id))).data().status,'Approved'));
  await check(async()=>assert.ok((await getDocs(query(collection(c.db,'stockCorrectionLinks'),where('ownerId','==',scope)))).size>0));
  await denied(()=>getDocs(collection(c.db,'stockCorrectionLinks')));
  await denied(()=>setDoc(doc(c.db,'stockCorrectionLinks',randomUUID()),{ownerId:scope}));
  await denied(()=>updateDoc(doc(c.db,'stockCorrectionLinks',original.id),{status:'Rejected'}));
  await denied(()=>deleteDoc(doc(c.db,'stockCorrectionLinks',original.id)));
 }
 await denied(()=>getDoc(doc(outsider.db,'stockCorrectionLinks',original.id)));
 await fixtureDB.doc(`stockCorrectionLinks/${foreignId}`).set({ownerId:outsider.uid,status:'Pending'});await denied(()=>getDoc(doc(viewer.db,'stockCorrectionLinks',foreignId)));
 // A disposable product/movement supports actual browser form, approval and retry checks.
 const browserProduct=await product('Browser location product',20),browserOriginal=await move(browserProduct,'Receipt',5);
 if(process.argv.includes('--blockchain')){
  const {readFile}=await import('node:fs/promises'),{JsonRpcProvider,Contract}=await import('ethers');
  const network=JSON.parse(await readFile(new URL('../outputs/blockchain-local.json',import.meta.url),'utf8'));
  const abi=['function register(bytes32 referenceHash,bytes32 digest)','function lookup(bytes32) view returns(bytes32)'];
  const provider=new JsonRpcProvider(network.rpcUrl);
  try{
   const registry=new Contract(network.address,abi,await provider.getSigner());
   for(const key of [browserOriginal.id,(await snapshot('stockCorrectionLinks',original.id)).movementId]){
    const prepared=await admin.call('prepareVerification',{kind:'inventory',id:key});
    await check(async()=>{assert.equal(prepared.contract,network.address);assert.equal(JSON.parse(prepared.canonical)[0],'IILAS-INVENTORY-v2');});
    const transaction=await registry.register(`0x${prepared.referenceHash}`,`0x${prepared.digest}`);await transaction.wait();
    await admin.call('registerVerification',{kind:'inventory',id:key,transactionHash:transaction.hash});
    await check(async()=>assert.equal(await registry.lookup(`0x${prepared.referenceHash}`),`0x${prepared.digest}`));
   }
   console.log('V2 manual and linked correction hashes passed confirmed local registry/backend verification.');
  }finally{provider.destroy();}
 }
 await mkdir(new URL('../outputs/',import.meta.url),{recursive:true});
 await writeFile(new URL('../outputs/stock-locations-browser-fixtures.json',import.meta.url),JSON.stringify({emulatorOnly:true,scope,suffix,productId:browserProduct,originalMovementId:browserOriginal.id,accounts:Object.fromEntries(Object.entries({Admin:admin,Inventory:inventory,Manager:manager,Warehouse:warehouse}).map(([role,c])=>[role,{email:c.email,uid:c.uid}])),password:'LocalTestPassword123!'},null,2));
 console.log(`Stock locations/corrections emulator QA passed: ${checks} bin, race, reservation, legacy, independent correction, retry, immutable history, scope and security checks.`);
}finally{await close();}
