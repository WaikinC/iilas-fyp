import{createFixtureBusinessRecord,fixtureCreationData}from'./record-creation-fixtures.mjs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {admin,client,scope,suffix,barcode,fixtureDB,snapshot,close} from './access-test-client.mjs';
const inventory=await client('Inventory'),warehouse=await client('Warehouse'),viewer=await client('Viewer');
const {id:productId}=await createFixtureBusinessRecord(admin,'products',fixtureCreationData('products',{name:`Retry pump ${suffix}`,sku:`RETRY-${suffix}`,barcode:barcode(),category:'Pump',location:'A-01',reorderLevel:3,quantityOnHand:20,reservedQuantity:0,status:'Active',imageDataUrl:''}));
const receiptId=(actor,operationId)=>createHash('sha256').update(JSON.stringify([scope,actor,operationId])).digest('hex');
const command=(type,quantity,extra={})=>{
  const operationId=randomUUID();
  return {productId,type,quantity,reference:`RETRY-${suffix}-${operationId}`,reason:'Count independently checked',operationId,...extra};
};
const counts=async()=>({movements:(await fixtureDB.collection('stockMovements').where('productId','==',productId).get()).size,approvals:(await fixtureDB.collection('approvals').where('productId','==',productId).get()).size,audits:(await fixtureDB.collection('auditLogs').where('recordId','==',productId).get()).size});
const denied=fn=>assert.rejects(fn,e=>e.code==='permission-denied'||e.code==='functions/permission-denied');
try {
  // Same logical operation raced twice, then retried after the original result.
  const receipt=command('Receipt',5),before=await counts();
  const raced=await Promise.all([inventory.call('stock',receipt),inventory.call('stock',receipt)]);
  assert.equal(raced[0].id,raced[1].id);assert.equal(raced.filter(r=>r.replayed).length,1);
  const replay=await inventory.call('stock',receipt);assert.equal(replay.id,raced[0].id);assert.equal(replay.replayed,true);
  let product=await snapshot('products',productId);assert.equal(product.quantityOnHand,25);assert.equal(product.version,2);
  assert.deepEqual(await counts(),{...before,movements:before.movements+1,audits:before.audits+1});
  await assert.rejects(()=>inventory.call('stock',{...receipt,quantity:6}),/different stock movement/);
  assert.equal((await snapshot('products',productId)).quantityOnHand,25);
  const resolved=await inventory.call('resolveStock',receipt);assert.equal(resolved.id,replay.id);assert.equal(resolved.replayed,true);

  // Every manual movement type replays without another balance/version/audit.
  for(const [type,quantity,extra] of [['Issue',2,{}],['Reservation',3,{}],['Release',3,{}],['Transfer',23,{locationTo:'B-02'}],['Adjustment',1,{adjustmentDirection:'Increase'}]]) {
    const request=command(type,quantity,extra),first=await admin.call('stock',request),state=await snapshot('products',productId),baseline=await counts();
    const again=await admin.call('stock',request);assert.equal(again.id,first.id);assert.equal(again.replayed,true);
    const final=await snapshot('products',productId);assert.equal(final.version,state.version);assert.equal(final.quantityOnHand,state.quantityOnHand);assert.equal(final.reservedQuantity,state.reservedQuantity);assert.equal(final.location,state.location);assert.deepEqual(await counts(),baseline);
  }
  // An inventory adjustment remains one request even after manager approval.
  const adjustment=command('Adjustment',2,{adjustmentDirection:'Increase'}),baseline=await counts();
  const requests=await Promise.all([inventory.call('stock',adjustment),inventory.call('stock',adjustment)]);
  assert.equal(requests[0].id,requests[1].id);assert.equal(requests[0].pendingApproval,true);assert.equal((await counts()).approvals,baseline.approvals+1);
  await admin.call('approval',{id:requests[0].id,version:1,decision:'Approve',notes:'Physical count checked by administrator'});
  const approvedProduct=await snapshot('products',productId);
  const again=await inventory.call('stock',adjustment);assert.equal(again.id,requests[0].id);assert.equal(again.pendingApproval,true);
  assert.equal((await snapshot('products',productId)).version,approvedProduct.version);assert.equal((await counts()).approvals,baseline.approvals+1);

  // A new operation cannot reuse a manual reference. Separate partials use their own references.
  await assert.rejects(()=>inventory.call('stock',{...receipt,operationId:randomUUID()}),/reference.*already/i);
  const partialBefore=await snapshot('products',productId);
  await inventory.call('stock',command('Receipt',1,{reference:`RETRY-${suffix}-PART-1`}));
  await inventory.call('stock',command('Receipt',1,{reference:`RETRY-${suffix}-PART-2`}));
  assert.equal((await snapshot('products',productId)).quantityOnHand,partialBefore.quantityOnHand+2);
  const bad=command('Issue',1000000);
  await assert.rejects(()=>inventory.call('stock',bad),/Not enough/);
  assert.equal((await fixtureDB.doc(`stockRequests/${receiptId(inventory.uid,bad.operationId)}`).get()).exists,false);
  await inventory.call('stock',{...bad,quantity:1});
  await assert.rejects(()=>inventory.call('stock',{...command('Receipt',1),operationId:''}),/operation ID/);
  await assert.rejects(()=>inventory.call('stock',{...command('Receipt',1),operationId:'invalid'}),/operation ID/);

  // Check outcome closes an uncommitted request and prevents a late send.
  const unknown=command('Receipt',7),state=await snapshot('products',productId),countsBefore=await counts();
  assert.equal((await inventory.call('resolveStock',unknown)).notApplied,true);
  assert.equal((await inventory.call('stock',unknown)).notApplied,true);
  assert.equal((await snapshot('products',productId)).version,state.version);assert.deepEqual(await counts(),countsBefore);
  // Racing resolve against submit must choose exactly one serialised outcome.
  const simultaneous=command('Receipt',4),qBefore=(await snapshot('products',productId)).quantityOnHand;
  const outcomes=await Promise.all([inventory.call('stock',simultaneous),inventory.call('resolveStock',simultaneous)]);
  assert.equal(Boolean(outcomes[0].notApplied),Boolean(outcomes[1].notApplied));
  assert.equal((await snapshot('products',productId)).quantityOnHand,qBefore+(outcomes[0].notApplied?0:4));

  // IDs are actor-scoped, and approval/permission are rechecked before replay.
  const separate=await warehouse.call('stock',{...receipt,reference:''});assert.notEqual(separate.id,replay.id);
  await denied(()=>viewer.call('stock',receipt));await denied(()=>viewer.call('resolveStock',receipt));
  await denied(()=>inventory.call('stock',receipt,'foreign-scope'));
  let account=await snapshot('users',inventory.uid);
  await admin.call('updateAccount',{uid:inventory.uid,version:account.version,step:'Update',role:'Viewer'});
  await denied(()=>inventory.call('stock',receipt));await denied(()=>inventory.call('resolveStock',receipt));
  account=await snapshot('users',inventory.uid);
  await admin.call('updateAccount',{uid:inventory.uid,version:account.version,step:'Update',role:'Inventory'});
  assert.equal((await inventory.call('stock',receipt)).id,replay.id);
  // No client, including Admin, may inspect or forge the private receipt ledger.
  const privateId=receiptId(inventory.uid,receipt.operationId);
  for(const c of [admin,inventory,viewer]) {
    const privateDoc=doc(c.db,'stockRequests',privateId);
    await denied(()=>getDoc(privateDoc));await denied(()=>getDocs(collection(c.db,'stockRequests')));
    await denied(()=>setDoc(doc(c.db,'stockRequests',randomUUID()),{ownerId:scope,result:{id:'forged'}}));
    await denied(()=>updateDoc(privateDoc,{commandHash:'forged'}));await denied(()=>deleteDoc(privateDoc));
  }
  console.log('Stock retry emulator QA passed: six movement types, concurrent/repeated submission, duplicate manual reference denial, distinct partials, approval, actor/role/scope isolation, resolve races and private ledger rules.');
}finally{await close();}
