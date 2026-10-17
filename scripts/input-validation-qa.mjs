import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateProduct,validateStockRequest,validateShipment,validateWarehouseStep} from '../lib/validation.js';
let checks=0;const reject=fn=>{assert.throws(fn);checks++;},accept=fn=>{fn();checks++;};
const productId=randomUUID(),product={name:'Water pump',sku:'PUMP-001',barcode:'1234567890123',category:'Pump',location:'A-01',status:'Active',reorderLevel:0,quantityOnHand:10,reservedQuantity:0,imageDataUrl:''};
const stock={productId,operationId:randomUUID(),type:'Receipt',quantity:1,reference:'DN-001',reason:'Counted accepted goods'};
const shipment={reference:'SHP-001',recipient:'Receiver',phone:'+60 12 345 6789',address:'1 Test Road, Kuala Lumpur',status:'Draft',expectedDelivery:'2026-10-10',parcelCount:1,packed:false,items:[{productId,quantity:1}]};
const warehouse={step:'Picking',notes:'Physical quantity checked',parcelCount:1};
for(const invalid of [null,true,false,[],{},'', ' ', '0x10',NaN,Infinity,-1,1.5,1000001]){
 for(const key of ['reorderLevel','quantityOnHand','reservedQuantity'])reject(()=>validateProduct({...product,[key]:invalid}));
 reject(()=>validateStockRequest({...stock,quantity:invalid}));
 reject(()=>validateShipment({...shipment,parcelCount:invalid}));
 reject(()=>validateShipment({...shipment,items:[{productId,quantity:invalid}]}));
 reject(()=>validateWarehouseStep({...warehouse,parcelCount:invalid}));
}
for(const invalid of [null,123,true,{},'abc\0def']){
 for(const key of ['name','sku','barcode','category','location','status','imageDataUrl'])reject(()=>validateProduct({...product,[key]:invalid}));
 reject(()=>validateStockRequest({...stock,reason:invalid}));
 reject(()=>validateShipment({...shipment,recipient:invalid}));
 reject(()=>validateWarehouseStep({...warehouse,notes:invalid}));
}
for(const invalid of ['        ','--------','(       )','123456',true])reject(()=>validateShipment({...shipment,phone:invalid}));
for(const invalid of [null,'true',1,{}])reject(()=>validateShipment({...shipment,packed:invalid}));
reject(()=>validateProduct({...product,reservedQuantity:11}));
reject(()=>validateShipment({...shipment,items:[...shipment.items,...shipment.items]}));
reject(()=>validateShipment({...shipment,expectedDelivery:'2026-02-29'}));
accept(()=>validateProduct(product));accept(()=>validateStockRequest(stock));accept(()=>validateShipment(shipment));accept(()=>validateWarehouseStep(warehouse));
accept(()=>assert.equal(validateProduct({...product,quantityOnHand:'1e3'}).quantityOnHand,1000));
accept(()=>validateShipment({...shipment,address:'Warehouse A\n1 Test Road, Kuala Lumpur',items:[{productId:'legacy_product_01',quantity:1}]}));
console.log(`Shared input validation passed: ${checks} product, stock, shipment, phone, packing and warehouse checks.`);
