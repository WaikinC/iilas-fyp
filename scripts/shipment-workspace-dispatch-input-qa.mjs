import assert from 'node:assert/strict';import {test} from 'node:test';import * as presentation from '../src/features/shipments/shipmentPresentation.ts';
test('legacy empty shipment driver uses the exact recorded plan name for client validation',()=>{
 assert.equal(typeof presentation.dispatchShipmentInput,'function');
 const row={id:'s',ownerId:'scope',version:1,status:'Prepared',reference:'SHP-LEGACY',recipient:'Receiver',phone:'0123456789',address:'1 Fictional Test Street',expectedDelivery:'2026-11-02',packed:true,handoverReference:'PS-LEGACY',parcelCount:2,driver:'',items:[{productId:'p',quantity:3}]};
 const input=presentation.dispatchShipmentInput(row,{id:'s',ownerId:'scope',status:'Scheduled',driverName:'Recorded Driver'});
 assert.equal(input.driver,'Recorded Driver');assert.equal(input.status,'Dispatched');assert.equal(input.parcelCount,'2');assert.equal(row.driver,'');input.items[0].quantity=9;assert.equal(row.items[0].quantity,3);
});
