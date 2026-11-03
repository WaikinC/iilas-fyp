import{createFixtureBusinessRecord,fixtureCreationData}from'./record-creation-fixtures.mjs';
import assert from 'node:assert/strict';
import {getDoc,doc} from 'firebase/firestore';
import {client,suffix,barcode,close} from './access-test-client.mjs';
const admin=await client('Admin'),db=admin.db,user={uid:admin.uid},call=admin.call;
const products=[];
for(let start=0;start<100;start+=10){
  const batch=await Promise.all(Array.from({length:10},(_,index)=>{const n=start+index;return createFixtureBusinessRecord(admin,'products',fixtureCreationData('products',{name:`Capacity product ${n}`,sku:`CAP-${suffix}-${n}`,barcode:barcode(n),category:'QA',location:'A-01',reorderLevel:1,quantityOnHand:5,reservedQuantity:0,status:'Active',imageDataUrl:''}));}));products.push(...batch);
}
const vehicle=await call('entity',{kind:'vehicles',data:{name:`CAP-${suffix}`,capacity:100,status:'Available',maintenanceDate:'2026-12-01',fuelLitres:20}}),driver=await call('entity',{kind:'drivers',data:{name:'Capacity driver',userId:user.uid,licence:'CAP-QA',status:'Available'}});
const data={reference:`CAP-${suffix}`,recipient:'Software test',phone:'0123456789',address:'Warehouse software test address',driver:'',handoverReference:'',status:'Draft',expectedDelivery:'2099-12-01',parcelCount:100,packed:false,items:products.map(p=>({productId:p.id,quantity:1}))};
await assert.rejects(()=>createFixtureBusinessRecord(admin,'shipments',fixtureCreationData('shipments',{...data,items:[...data.items,{productId:'extra-product',quantity:1}]})),/100/);
const shipment=await createFixtureBusinessRecord(admin,'shipments',fixtureCreationData('shipments',data));
for(const [version,step] of ['Picking','Packed','HandedOver'].entries())await call('warehouse',{shipmentId:shipment.id,version,data:{step,parcelCount:100,notes:'Capacity software test completed'}});
await call('planTransport',{shipmentId:shipment.id,vehicleId:vehicle.id,driverId:driver.id,origin:'Warehouse QA',carrier:'QA fleet',plannedDate:'2026-10-09',distanceKm:10,estimatedHours:1,cost:20});
const ready={id:shipment.id,...(await getDoc(doc(db,'shipments',shipment.id))).data()};await call('save',{kind:'shipments',data:{...ready,status:'Dispatched'},existing:ready});
for(const product of products){const saved=(await getDoc(doc(db,'products',product.id))).data();assert.equal(saved.quantityOnHand,4);assert.equal(saved.reservedQuantity,0);assert.equal(saved.warehouseReservedQuantity,0);}
await close();console.log('Capacity QA passed: 100-product picking, handover and atomic dispatch; 101 products rejected.');
