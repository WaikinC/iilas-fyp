import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../backend/functions/service.mjs',import.meta.url));
export function procurementStore(){
 const f={rows:new Map(),revision:0,failAt:0,trace:[],onRead:null,clock:1800000000000};
 const clone=v=>v===undefined?undefined:structuredClone(v),ref=path=>({path});
 const query=(kind,filters=[],cap=Infinity,fields=null)=>({kind,filters,cap,fields,query:true,where:(...args)=>query(kind,[...filters,args],cap,fields),limit:n=>query(kind,filters,n,fields),select:(...v)=>query(kind,filters,cap,v),get:async()=>f.db.runTransaction(tx=>tx.get(query(kind,filters,cap,fields)))});
 f.put=(path,value)=>{f.rows.set(path,clone(value));f.revision++;};
 f.db={doc:ref,collection:kind=>({...query(kind),doc:id=>ref(`${kind}/${id}`)}),async runTransaction(work){for(let retry=0;retry<30;retry++){
  const revision=f.revision,view=new Map([...f.rows].map(([k,v])=>[k,clone(v)])),writes=[];let writeCount=0;
  const snap=(path,value)=>({id:path.split('/').at(-1),ref:ref(path),exists:value!==undefined,data:()=>clone(value)});
  const write=(mode,r,v)=>{f.trace.push(['write',r.path]);if(++writeCount===f.failAt)throw Error('Injected transaction write failure');if(mode==='create')assert(!view.has(r.path),'duplicate document');if(mode==='update')assert(view.has(r.path),'missing update');writes.push([r.path,mode==='update'?{...view.get(r.path),...v}:v]);};
  const tx={async get(r){assert.equal(writes.length,0,'Read after write');f.trace.push(['read',r.path||r.kind]);if(f.onRead)await f.onRead(r,retry);if(!r.query)return snap(r.path,view.get(r.path));let docs=[...view].filter(([p])=>p.startsWith(r.kind+'/')).map(([p,v])=>snap(p,v));for(const [key,operator,value] of r.filters){assert.equal(operator,'==');docs=docs.filter(d=>d.data()[key]===value);}docs=docs.slice(0,r.cap);if(r.fields)docs=docs.map(d=>snap(d.ref.path,Object.fromEntries(r.fields.filter(k=>Object.hasOwn(d.data(),k)).map(k=>[k,d.data()[k]]))));return {docs,size:docs.length,empty:docs.length===0};},create:(r,v)=>write('create',r,v),set:(r,v)=>write('set',r,v),update:(r,v)=>write('update',r,v)};
  const result=await work(tx);if(revision!==f.revision)continue;for(const [p,v] of writes)f.put(p,v);return result;
 }throw Error('Transaction retry limit');}};
 mock.method(require('firebase-admin/firestore'),'getFirestore',()=>f.db);
 mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>({seconds:Math.floor(f.clock/1000),nanoseconds:(f.clock%1000)*1000000}));
 f.reset=()=>{f.rows=new Map();f.revision=0;f.failAt=0;f.trace=[];f.onRead=null;f.put('system/config',{dataScopeId:'scope'});for(const [uid,role] of Object.entries({staff:'Inventory',manager:'Manager',admin:'Admin',warehouse:'Warehouse',viewer:'Viewer'}))f.put('users/'+uid,{status:'Approved',active:true,role,displayName:uid});f.put('suppliers/supplier',{ownerId:'scope',name:'Supplier',contact:'supplier@example.com',status:'Active'});f.put('products/demo-p',{ownerId:'scope',version:1,status:'Active',archived:false,name:'Demo parcel',sku:'DEMO-001',quantityOnHand:10,reservedQuantity:3,warehouseReservedQuantity:0,reorderLevel:8,location:'A'});};
 f.reset();return f;
}
