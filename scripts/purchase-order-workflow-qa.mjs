import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {procurementStore} from './fixtures/procurement-store.mjs';
import {validatePurchaseCommand,malaysiaDay} from '../lib/procurementValidation.js';
const f=procurementStore();
const api=await import('../backend/functions/purchaseOrderWorkflow.mjs');
const service=await import('../backend/functions/service.mjs');
beforeEach(()=>f.reset());
const input=()=>({reference:'PO-001',supplierId:'supplier',expectedDate:malaysiaDay(Date.now()+86400000),items:[{productId:'demo-p',quantity:10,unitCost:1.25}]});
const stockWrite=(tx,scope,actor,productId,product,input)=>{const movementId=crypto.randomUUID();tx.update(f.db.doc('products/'+productId),{quantityOnHand:product.quantityOnHand+input.quantity,version:product.version+1});tx.create(f.db.doc('stockMovements/'+movementId),{ownerId:scope,actor,productId,...input,origin:'Procurement',integrityVersion:2});return movementId;};
async function execute(raw,actor='staff'){return f.db.runTransaction(async tx=>{const old=raw.id?(await tx.get(f.db.doc('purchaseOrders/'+raw.id))).data():null;const prepared=await api.preparePurchaseTransition(tx,{scope:'scope',actor,member:{role:'Inventory',displayName:actor},command:validatePurchaseCommand(raw),orderId:raw.id||(f.rows.has('purchaseOrders/po')?'po2':'po'),old});assert(!f.trace.some(([type])=>type==='write'),'prepare has no writes');const readCount=f.trace.filter(([type])=>type==='read').length;const result=api.writePurchaseTransition(tx,prepared,{stockWrite});assert.equal(f.trace.filter(([type])=>type==='read').length,readCount,'writer has no reads');return result;});}
async function step(step,actor='staff',extra={}){f.trace=[];const p=f.rows.get('purchaseOrders/po');return execute({id:'po',version:p.version,step,notes:'Explicit action notes',...extra},actor);}
test('unlinked_lifecycle_is_byte_compatible and phase boundaries',async()=>{assert.deepEqual(await execute(input()),{id:'po',status:'Submitted',version:1});await assert.rejects(step('Approve'),/different/);await step('Reject','manager');await step('Resubmit','staff',{supplierId:'supplier',expectedDate:input().expectedDate,items:input().items});assert.equal(f.rows.get('purchaseOrders/po').approvedBy,null);await step('Approve','manager');await step('Issue');await step('Receive','warehouse',{quantities:[4],receiptReference:'DEL-1'});assert.equal(f.rows.get('purchaseOrders/po').status,'PartReceived');await step('Receive','warehouse',{quantities:[6],receiptReference:'DEL-2'});assert.equal(f.rows.get('purchaseOrders/po').status,'Received');assert.equal(f.rows.get('products/demo-p').quantityOnHand,20);assert.equal(f.rows.get('purchaseOrders/po').totalCents,1250);assert.equal([...f.rows].filter(([p])=>p.startsWith('stockMovements/')).length,2);});
test('reference_and_delivery_note_uniqueness_remain',async()=>{await execute(input());f.trace=[];await assert.rejects(execute({...input(),reference:'po-001'}),/registered/);await step('Approve','manager');await step('Issue');await step('Receive','warehouse',{quantities:[4],receiptReference:'DEL-1'});await assert.rejects(step('Receive','warehouse',{quantities:[1],receiptReference:'DEL-1'}),/already received/);});
test('linked_public_bypass_is_denied even for malformed source',async()=>{await execute(input());for(const source of [null,{},'bad']){f.put('purchaseOrders/po',{...f.rows.get('purchaseOrders/po'),demoReorderSource:source});await assert.rejects(service.executeCommand({uid:'manager'},{action:'purchaseOrder',workspaceId:'scope',input:{id:'po',version:1,step:'Approve',notes:'Manager explicit review'}}),/linked|recover/i);}});
test('fault after each receipt write rolls back order, stock and incoming together',async()=>{await execute(input());await step('Approve','manager');await step('Issue');const before=structuredClone([...f.rows]);for(let n=1;n<=7;n++){f.failAt=n;await assert.rejects(step('Receive','warehouse',{quantities:[4],receiptReference:'DEL-1'}),/Injected/);assert.deepEqual([...f.rows],before);}f.failAt=0;await step('Receive','warehouse',{quantities:[4],receiptReference:'DEL-1'});});

const incomingPath = 'expectedReplenishments/po';
const incoming = () => f.rows.get(incomingPath);

test('ordinary multi-line incoming begins at issue and follows partial and full receipts', async () => {
  f.put('products/second', {...f.rows.get('products/demo-p'), name:'Second', sku:'SECOND'});
  await execute({...input(), items:[...input().items, {productId:'second',quantity:2,unitCost:0}]});
  await step('Approve','manager');
  assert.equal(incoming(), undefined);
  await step('Issue');
  assert.equal(incoming()?.state, 'Expected');
  assert.equal(incoming().purchaseEventId, 'po_3');
  assert.equal(incoming().dataOrigin, 'ordinary-purchase');
  assert.equal(incoming().outstandingQuantity, 12);
  assert.equal(f.rows.get('products/demo-p').quantityOnHand, 10);
  const createdAt = incoming().createdAt;
  await step('Receive','warehouse',{quantities:[4,2],receiptReference:'DEL-1'});
  assert.equal(incoming().state, 'PartReceived');
  assert.deepEqual(incoming().items.map(line => [line.received,line.outstanding]), [[4,6],[2,0]]);
  await step('Receive','warehouse',{quantities:[6,0],receiptReference:'DEL-2'});
  assert.equal(incoming().state, 'Received');
  assert.equal(incoming().outstandingQuantity, 0);
  assert.equal(incoming().receivedQuantity, 12);
  assert.equal(incoming().purchaseEventId, 'po_5');
  assert.deepEqual(incoming().createdAt, createdAt);
});

test('the next receipt adopts a legacy partially received order from its retained counts', async () => {
  await execute(input());
  await step('Approve','manager');
  await step('Issue');
  await step('Receive','warehouse',{quantities:[4],receiptReference:'DEL-1'});
  f.rows.delete(incomingPath);
  f.clock += 86400000;
  await step('Receive','warehouse',{quantities:[1],receiptReference:'DEL-2'});
  assert.equal(incoming()?.receivedQuantity, 5);
  assert.equal(incoming().outstandingQuantity, 5);
  assert.deepEqual(incoming().createdAt, f.rows.get('purchaseOrders/po').issuedAt);
  assert.equal(f.rows.get('products/demo-p').quantityOnHand, 15);
});

test('a foreign or inconsistent incoming record refuses a receipt without stock changes', async () => {
  await execute(input());
  await step('Approve','manager');
  await step('Issue');
  assert(incoming());
  for (const changed of [{ownerId:'foreign'}, {orderVersion:0}, {outstandingQuantity:9}]) {
    const original = incoming();
    f.put(incomingPath, {...original,...changed});
    const before = structuredClone([...f.rows]);
    await assert.rejects(step('Receive','warehouse',{quantities:[4],receiptReference:'DEL-1'}), /incoming/i);
    assert.deepEqual([...f.rows], before);
    f.put(incomingPath, original);
  }
});
