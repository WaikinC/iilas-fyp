import assert from 'node:assert/strict';
import {test} from 'node:test';
import {recordedShipmentStatus,validShipmentIdentity,selectShipmentRows,shipmentPermissions,shipmentWorkspaceKey,shipmentTone} from '../src/features/shipments/shipmentPresentation.ts';

const member={uid:'logistics',workspaceId:'scope',role:'Logistics',status:'Approved',active:true,version:1};
const row={id:'s',ownerId:'scope',version:2,status:'Prepared',reference:'SHP-DEMO',recipient:'Receiver',phone:'0123456789',address:'1 Fictional Road',expectedDelivery:'2026-11-02',parcelCount:2,packed:true,handoverReference:'PS-DEMO',items:[{productId:'p',quantity:3,name:'Packed carton',sku:'CARTON'}]};
const sources=Object.fromEntries(['products','shipments','handovers','activities'].map(k=>[k,{loading:false,error:''}]));
const plan={row:{id:'s',ownerId:'scope',version:1,status:'Scheduled',vehicleId:'v',driverId:'d',driverUid:'u',driverName:'Demo Driver',vehicleName:'Demo Van'},loading:false,error:'',revision:1};
const permissions=(overrides={})=>shipmentPermissions({member,shipment:row,handovers:[],sources,plan,...overrides});

test('unrecognised retained statuses never become Draft',()=>{
 for(const x of [undefined,null,{},[],['Prepared'],'constructor','__proto__',7])assert.equal(recordedShipmentStatus(x),null);
 for(const x of ['Draft','Prepared','Dispatched'])assert.equal(recordedShipmentStatus(x),x);
});
test('bad record identity and version cannot authorise actions',()=>{
 for(const v of [NaN,Infinity,0,-1,'2',1.2]){assert.equal(validShipmentIdentity({...row,version:v}),false);assert.equal(permissions({shipment:{...row,version:v}}).dispatch,false);}
 assert.equal(validShipmentIdentity({...row,id:''}),false);
});
test('area filters preserve original order and unknowns stay in All',()=>{
 const rows=[{...row,id:'p1'}, {...row,id:'d1',status:'Draft'}, {...row,id:'x',status:['Prepared']}, {...row,id:'p2'}, {...row,id:'done',status:'Dispatched'}];
 assert.deepEqual(selectShipmentRows(rows,'prepared',{search:'',status:''}).map(r=>r.id),['p1','p2']);
 assert.deepEqual(selectShipmentRows(rows,'all',{search:'',status:'Unknown'}).map(r=>r.id),['x']);
 assert.deepEqual(selectShipmentRows(rows,'preparation',{search:'receiver',status:''}).map(r=>r.id),['d1']);
 assert.deepEqual(rows.map(r=>r.id),['p1','d1','x','p2','done']);
 assert.deepEqual(selectShipmentRows(rows,'dispatched',{search:'fictional',status:'Dispatched'}).map(r=>r.id),['done']);
});
test('authority changes retire module identity and forbid writes',()=>{
 for(const change of [{uid:'other'},{workspaceId:'other'},{role:'Viewer'},{version:2},{status:'Disabled'},{active:false}])assert.notEqual(shipmentWorkspaceKey(member),shipmentWorkspaceKey({...member,...change}));
 for(const change of [{role:'Viewer'},{role:'Driver'},{active:false},{status:'Pending'},{version:NaN}])assert.equal(permissions({member:{...member,...change}}).dispatch,false);
 assert.equal(permissions({shipment:{...row,ownerId:'foreign'}}).edit,null);
});
test('warehouse non-Cancelled jobs lock Draft and cancellation permits editing',()=>{
 const draft={...row,status:'Draft',packed:false,handoverReference:''};
 for(const status of ['Picking','Packed','HandedOver','Waiting','Unknown']){
  const p=permissions({shipment:draft,handovers:[{id:'s',status,ownerId:'scope'}]});assert.equal(p.edit,null);assert.equal(p.delete,false);
 }
 const p=permissions({shipment:draft,handovers:[{id:'s',status:'Cancelled',ownerId:'scope'}],plan:{...plan,row:null}});
 assert.equal(p.edit,'draft');assert.equal(p.delete,true);
});
test('Prepared scheduling locks only destination/date and exposes deliberate dispatch',()=>{
 const p=permissions();assert.equal(p.edit,'delivery');assert.equal(p.addressLocked,true);assert.equal(p.dispatch,true);assert.equal(p.delete,false);
 assert.equal(permissions({plan:{...plan,row:null}}).dispatch,false);
 assert.equal(permissions({plan:{...plan,row:{...plan.row,status:'Cancelled'}}}).addressLocked,false);
 assert.equal(permissions({shipment:{...row,status:'Dispatched'}}).edit,null);
});
test('failed reads stay unavailable, while incomplete activity does not block a valid command',()=>{
 assert.equal(permissions({plan:{...plan,error:'denied'}}).dispatch,false);
 assert.equal(permissions({plan:{...plan,error:'denied'}}).edit,null);
 assert.equal(permissions({plan:{...plan,loading:true}}).dispatch,false);
 for(const key of ['products','shipments','handovers'])assert.equal(permissions({sources:{...sources,[key]:{loading:false,error:'failed'}}}).dispatch,false);
 assert.equal(permissions({sources:{...sources,activities:{loading:false,error:'failed'}}}).dispatch,true);
 assert.equal(permissions({plan:{...plan,error:'failed'}}).create,true);
});
test('legacy absence alone is compatible but packing and valid items remain required',()=>{
 assert.equal(permissions().dispatch,true);
 for(const items of [null,[],[{}],[{productId:'p',quantity:0}],[{productId:'p',quantity:3},{productId:'p',quantity:2}]])assert.equal(permissions({shipment:{...row,items}}).dispatch,false);
 assert.equal(permissions({shipment:{...row,packed:false}}).dispatch,false);
 assert.equal(permissions({plan:{...plan,row:{...plan.row,id:'other'}}}).dispatch,false);
});
test('malformed or foreign transport cannot unlock delivery editing',()=>{
 for(const change of [{status:['Scheduled']},{id:'foreign'},{ownerId:'foreign'}]){
  const p=permissions({plan:{...plan,row:{...plan.row,...change}}});assert.equal(p.edit,null);assert.equal(p.addressLocked,true);
 }
});
test('Draft exceeding available stock does not introduce a new UI save prohibition',()=>{
 const p=permissions({shipment:{...row,status:'Draft',items:[{productId:'p',quantity:9999}]},plan:{...plan,row:null}});
 assert.equal(p.edit,'draft');assert.equal(p.dispatch,false);
});
test('missing immutable Prepared packing evidence cannot expose an unusable editor',()=>{
 for(const change of [{packed:false},{handoverReference:''}])assert.equal(permissions({shipment:{...row,...change}}).edit,null);
});
test('colours distinguish recorded domains without inherited object lookups',()=>{
 assert.equal(shipmentTone('shipment','Prepared'),'green');assert.equal(shipmentTone('transport','Scheduled'),'blue');
 assert.equal(shipmentTone('transport','Cancelled'),'grey');assert.equal(shipmentTone('warehouse','Picking'),'blue');
 assert.equal(shipmentTone('transport','None'),'amber');assert.equal(shipmentTone('shipment','constructor'),'grey');
});
