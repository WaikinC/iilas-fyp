import assert from 'node:assert/strict';
import {doc,updateDoc} from 'firebase/firestore';
export async function warehouseChecks(staff,productId,reference,snapshot){
  const {id}=await staff.call('save',{kind:'shipments',data:{reference,recipient:'Warehouse receiver',phone:'0123456789',address:'Warehouse QA address',expectedDelivery:'2026-10-09',driver:'',handoverReference:'',packed:false,status:'Draft',parcelCount:1,items:[{productId,quantity:1}]}});
  const step=(stage,version)=>staff.call('warehouse',{shipmentId:id,version,data:{step:stage,notes:'Warehouse QA validation',parcelCount:1}});
  await assert.rejects(()=>step('HandedOver',0),/in order/);
  await step('Picking',0);
  await assert.rejects(async()=>staff.call('save',{kind:'shipments',data:{...await snapshot('shipments',id),address:'Attempted edit'},existing:await snapshot('shipments',id)}),/started/);
  const outcomes=await Promise.allSettled([step('Packed',1),step('Packed',1)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  await staff.call('cancelWarehouse',{shipmentId:id,version:2,notes:'Cancellation count checked'});
  assert.equal((await snapshot('products',productId)).warehouseReservedQuantity,0);
  await step('Picking',3);await step('Packed',4);await step('HandedOver',5);
  const job=await snapshot('warehouseHandovers',id),shipment=await snapshot('shipments',id);
  assert.equal(shipment.status,'Prepared');assert.equal(shipment.handoverId,id);assert.deepEqual(shipment.items,job.items.map(item=>{const copy={...item};delete copy.allocations;return copy;}));assert.ok(job.items.every(item=>item.allocations.length));
  await assert.rejects(()=>step('HandedOver',6),/Draft|completed/);
  await assert.rejects(()=>updateDoc(doc(staff.db,'warehouseHandovers',id),{parcelCount:999}),/permission/i);
  console.log('Warehouse QA passed: ordered stages, concurrent packing, allocation/cancellation/restart, audited handover and immutable completion.');
  return shipment;
}
