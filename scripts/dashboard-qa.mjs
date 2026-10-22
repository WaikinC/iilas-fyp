import assert from 'node:assert/strict';
import {dashboardSummary, inventoryTrend} from '../src/features/dashboard/dashboardData.ts';

const now = Date.parse('2026-10-09T10:00:00+08:00');
const time = value => ({seconds: Date.parse(value) / 1000});
const stamp = time('2026-10-09T09:00:00+08:00');
const products = [
  {id:'low',status:'Active',quantityOnHand:9,reservedQuantity:5,reorderLevel:4},
  {id:'healthy',status:'Active',quantityOnHand:20,reservedQuantity:0,reorderLevel:4},
  {id:'inactive',status:'Inactive',quantityOnHand:0,reorderLevel:4},
];
const shipment = (id, expectedDelivery='2026-10-10') => ({id,status:'Dispatched',version:3,expectedDelivery});
const shipments = [shipment('active'),shipment('delayed','2026-10-08'),shipment('failed','2026-10-08'),
  shipment('returned','2026-10-08'),shipment('delivered','2026-10-08'),{id:'prepared',status:'Prepared'},
  {id:'draft',status:'Draft'},{id:'cancelled',status:'Cancelled'}];
const records = {
  purchases:['Submitted','Approved','Issued','PartReceived','Received','Cancelled'].map(status=>({id:status,status})),
  deliveries:[{id:'failed',status:'Attempt Failed'},{id:'returned',status:'Returned'},{id:'delivered',status:'Delivered'},
    {id:'active',status:'In Transit',updatedAt:time('2026-10-09T08:30:00+08:00')}],
  evidence:[{id:'proof',version:1,type:'Proof of Delivery'},{id:'registered',version:1,type:'Proof of Delivery'},
    {id:'image',version:1,type:'Parcel Image'},{id:'unreviewed',version:1,type:'Parcel Image'},{id:'normal',version:1,type:'Parcel Image'}],
  predictions:[
    {id:'old',kind:'delivery',recordId:'active',sourceVersion:3,label:'High',reviewStatus:'Pending',createdAt:time('2026-10-09T08:00:00+08:00')},
    {id:'current',kind:'delivery',recordId:'active',sourceVersion:3,label:'Low',reviewStatus:'Pending',createdAt:stamp},
    {id:'high',kind:'delivery',recordId:'delayed',sourceVersion:3,label:'High',reviewStatus:'Accepted',createdAt:stamp},
    {id:'closed',kind:'delivery',recordId:'delivered',sourceVersion:3,label:'High',createdAt:stamp},
    {id:'stale',kind:'delivery',recordId:'failed',sourceVersion:2,label:'High',createdAt:stamp},
    {id:'damage',kind:'parcel',recordId:'image',sourceVersion:1,label:'Damaged',reviewStatus:'Accepted',createdAt:stamp},
    {id:'pending',kind:'parcel',recordId:'unreviewed',sourceVersion:1,label:'Damaged',reviewStatus:'Pending',createdAt:stamp},
    {id:'normal',kind:'parcel',recordId:'normal',sourceVersion:1,label:'Normal',reviewStatus:'Accepted',createdAt:stamp},
  ],
  verifications:[{id:'verified',kind:'delivery',recordId:'registered',status:'Verified'}],
};
let summary=dashboardSummary(products,shipments,records,now);
assert.deepEqual(summary.lowStock.map(p=>p.id),['low']);
assert.deepEqual(summary.pendingPurchases.map(p=>p.status),['Submitted','Approved','Issued','PartReceived']);
assert.equal(summary.prepared.length,1);
assert.equal(summary.activeDeliveries.length,3);
assert.deepEqual(summary.statusCounts,{Delivered:1,Active:1,Delayed:1,Failed:1,Returned:1});
assert.equal(summary.currentDeliveryPredictions.length,2);
assert.deepEqual(summary.highRisk.map(p=>p.id),['high']);
assert.deepEqual(summary.pendingVerification.map(e=>e.id),['proof']);
assert.equal(summary.damageAlerts.length,0,'Legacy unlinked parcel results remain historical only');
summary=dashboardSummary(products,shipments,{...records,deliveries:[...records.deliveries.filter(d=>d.id!=='active'),{id:'active',status:'In Transit',updatedAt:time('2026-10-09T09:30:00+08:00')}]},now);
assert.equal(summary.currentDeliveryPredictions.length,1,'New delivery progress invalidates older risk results');
summary=dashboardSummary(products,shipments,{...records,predictions:[...records.predictions,{id:'rejected',kind:'delivery',recordId:'delayed',sourceVersion:3,label:'High',reviewStatus:'Rejected',createdAt:time('2026-10-09T09:30:00+08:00')}]},now);
assert.equal(summary.highRisk.length,0,'Rejecting a newer result does not resurrect an old alert');
summary=dashboardSummary([],[],{purchases:[],deliveries:[],predictions:[],evidence:[],verifications:[]},now);
assert.equal(summary.currentDeliveryPredictions.length,0);
assert.equal(summary.currentParcelPredictions.length,0);
assert.equal(summary.pendingVerification.length,0);

const movements=[
  {id:'receipt',type:'Receipt',quantity:7,createdAt:time('2026-09-30T17:00:00Z')}, // 1 October in Malaysia.
  {id:'issue',type:'Issue',quantity:2,createdAt:time('2026-10-08T01:00:00Z')},
  {id:'reserve',type:'Reserve',quantity:99,createdAt:stamp},
  {id:'adjustment',type:'Adjustment',quantity:99,createdAt:stamp},
  {id:'old',type:'Receipt',quantity:99,createdAt:time('2026-01-01T01:00:00Z')},
  {id:'future',type:'Receipt',quantity:99,createdAt:time('2026-10-10T01:00:00Z')},
];
const trend=inventoryTrend(movements,now);
assert.equal(trend.length,6);
assert.deepEqual(trend.map(r=>r.key),['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);
assert.equal(trend.at(-1).stockIn,7);assert.equal(trend.at(-1).stockOut,2);
assert.equal(trend.reduce((sum,r)=>sum+r.stockIn,0),7);
assert.deepEqual(inventoryTrend([],Date.parse('2026-01-01T00:00:00+08:00')).map(r=>r.key),['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01']);
console.log('Dashboard QA passed: stock availability, PO stages, delivery buckets, current predictions, human review, evidence registration and Malaysia monthly receipt/issue totals.');
