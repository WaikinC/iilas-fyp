import assert from 'node:assert/strict';
import {test,beforeEach,mock} from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url));
let rows,reads,queries,clock,afterRead;
const clone=x=>x===undefined?undefined:structuredClone(x),ref=path=>({path}),field=f=>typeof f==='string'?f:f.toString();
function value(record,key,id){return key==='__name__'?id:key.split('.').reduce((v,k)=>v?.[k],record);}
function scalar(v){return v?.toMillis?.()??(v&&typeof v==='object'&&Number.isFinite(v.seconds)?v.seconds*1000+(v.nanoseconds??0)/1e6:v);}
function query(kind,filters=[],orders=[],after=null,cap=Infinity,fields=[]){return {kind,filters,orders,after,cap,fields,query:true,where:(k,...f)=>query(kind,[...filters,[field(k),...f]],orders,after,cap,fields),orderBy:(k,d='asc')=>query(kind,filters,[...orders,[field(k),d]],after,cap,fields),startAfter:(...v)=>query(kind,filters,orders,v,cap,fields),limit:n=>query(kind,filters,orders,after,n,fields),select:(...f)=>query(kind,filters,orders,after,cap,f.map(field))};}
const db={doc:ref,collection:kind=>({...query(kind),doc:id=>ref(kind+'/'+id)}),async runTransaction(work){
 const snapshot=(path,data)=>({exists:data!==undefined,id:path.split('/').at(-1),ref:ref(path),data:()=>data}),tx={async get(r){await afterRead(r);if(!r.query){reads++;return snapshot(r.path,rows.get(r.path));}queries.push(r);let list=[...rows].filter(([p])=>p.startsWith(r.kind+'/')).map(([p,v])=>snapshot(p,v));
 for(const [f,op,v]of r.filters){list=list.filter(d=>{const a=scalar(value(d.data(),f,d.id)),b=scalar(v);return op==='=='?a===b:op==='>='?a!==undefined&&a>=b:op==='<='?a!==undefined&&a<=b:op==='<'?a!==undefined&&a<b:op==='in'?b.includes(a):false;});}
 const cmp=(a,b)=>{for(const [f,d]of r.orders){const av=scalar(value(a.data(),f,a.id)),bv=scalar(value(b.data(),f,b.id)),n=av>bv?1:av<bv?-1:0;if(n)return n*(d==='desc'?-1:1);}return 0;};list.sort(cmp);
 if(r.after)list=list.filter(d=>{for(let i=0;i<r.orders.length;i++){const [f,dir]=r.orders[i],a=scalar(value(d.data(),f,d.id)),b=scalar(r.after[i]),n=a>b?1:a<b?-1:0;if(n)return dir==='desc'?n<0:n>0;}return false;});
 const selected=list.slice(0,r.cap);reads+=selected.length||1;return {docs:selected,size:selected.length};},create(){throw Error('Report attempted a write');},set(){throw Error('Report attempted a write');},update(){throw Error('Report attempted a write');}};return work(tx);
}};
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>db);
const {createReportingCommands}=await import('../backend/functions/reporting.mjs');
const call=(action,input,uid='manager',scope='scope',options={})=>createReportingCommands({clock:()=>clock,...options})[action]({uid},scope,input);
beforeEach(()=>{reads=0;queries=[];clock=Date.parse('2026-10-25T04:00:00Z');afterRead=()=>{};rows=new Map([['system/config',{dataScopeId:'scope'}],...['Admin','Manager','Inventory','Warehouse','Logistics','Driver','Viewer','Customer'].map(role=>['users/'+role.toLowerCase(),{uid:role.toLowerCase(),role,status:'Approved',active:true,version:1}])]);Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'});});
function products(n,patch={}){for(let i=0;i<n;i++)rows.set('products/p'+String(i).padStart(4,'0'),{ownerId:'scope',name:'Product '+i,sku:'SKU-'+i,status:'Active',quantityOnHand:i,version:1,...patch});}
test('closed role/scope/resource checks and allowlisted columns prevent private-data exports',async()=>{
 products(1,{imageDataUrl:'private-image',apiToken:'NOEXPORT',password:'NOEXPORT'});const result=await call('queryReport',{resource:'products',filters:{}});assert.equal(result.rows.length,1);for(const key of ['ownerId','imageDataUrl','apiToken','password'])assert(!Object.hasOwn(result.rows[0],key));
 for(const [uid,resource]of [['customer','products'],['driver','products'],['inventory','auditLogs']])await assert.rejects(call('queryReport',{resource,filters:{}},uid));await assert.rejects(call('queryReport',{resource:'products',filters:{}},'manager','foreign'));await assert.rejects(call('queryReport',{resource:'users',filters:{}}));assert(queries.every(q=>q.fields.length>0),'Queries must project only selected report fields');
});
test('default stable pages preserve undated legacy records and cursor binds query/account',async()=>{
 products(25);const first=await call('queryReport',{resource:'products',filters:{}});assert.equal(first.rows.length,20);assert.equal(first.coverage.undatedExcluded,false);assert.equal(first.hasMore,true);assert(first.cursor);const next=await call('queryReport',{resource:'products',filters:{},cursor:first.cursor});assert.equal(next.rows.length,5);assert.equal(next.hasMore,false);
 await assert.rejects(call('queryReport',{resource:'products',filters:{status:'Inactive'},cursor:first.cursor}));await assert.rejects(call('queryReport',{resource:'products',filters:{},cursor:first.cursor},'admin'));assert.equal(new Set([...first.rows,...next.rows].map(x=>x.id)).size,25);
});
test('sparse residual matching stops at the scan cap and returns continuation instead of global-empty claims',async()=>{
 products(230);rows.get('products/p0220').name='Needle';const first=await call('queryReport',{resource:'products',filters:{search:'needle'}});assert.equal(first.rows.length,0);assert(first.scanned<=200);assert.equal(first.hasMore,true);assert.equal(first.coverage.complete,false);const next=await call('queryReport',{resource:'products',filters:{search:'needle'},cursor:first.cursor});assert.equal(next.rows.length,1);assert.equal(next.rows[0].id,'p0220');assert.equal(next.hasMore,false);
});
test('Malaysia date predicates include midnight/end boundaries and disclose undated exclusion',async()=>{
 for(const [id,date]of [['before','2026-10-24T15:59:59.999Z'],['start','2026-10-24T16:00:00Z'],['end','2026-10-25T15:59:59.999Z'],['after','2026-10-25T16:00:00Z']]){const ms=Date.parse(date);rows.set('stockMovements/'+id,{ownerId:'scope',type:'Receipt',productId:'p1',quantity:1,createdAt:{seconds:Math.floor(ms/1000),nanoseconds:ms%1000*1000000}});}rows.set('stockMovements/undated',{ownerId:'scope',type:'Receipt',productId:'p1',quantity:1});
 const result=await call('queryReport',{resource:'stockMovements',filters:{dateFrom:'2026-10-25',dateTo:'2026-10-25'}});assert.deepEqual(result.rows.map(x=>x.id),['start','end']);assert.equal(result.coverage.undatedExcluded,true);assert.match(result.coverage.dateBasis,/Malaysia/);
});
test('Driver shipments and joined delivery rows require current assignment, not a supplied driver ID',async()=>{
 rows.set('shipments/mine',{ownerId:'scope',driverUid:'driver',status:'Dispatched',reference:'MINE'});rows.set('shipments/theirs',{ownerId:'scope',driverUid:'other',status:'Dispatched',reference:'THEIRS'});rows.set('deliveryEvents/e1',{ownerId:'scope',shipmentId:'mine',status:'In Transit'});rows.set('deliveryEvents/e2',{ownerId:'scope',shipmentId:'theirs',status:'Delivered'});
 const s=await call('queryReport',{resource:'shipments',filters:{}},'driver');assert.deepEqual(s.rows.map(x=>x.id),['mine']);const e=await call('queryReport',{resource:'deliveryEvents',filters:{}},'driver');assert.deepEqual(e.rows.map(x=>x.id),['e1']);await assert.rejects(call('queryReport',{resource:'shipments',filters:{driverUid:'other'}},'driver'));
});
test('missing retained risk/provenance stays unknown and original synthetic provenance is not promoted',async()=>{
 rows.set('inventoryAIExperiments/unknown',{ownerId:'scope',status:'Failed',version:1});rows.set('inventoryAIExperiments/known',{ownerId:'scope',status:'Predicted',prediction:{label:'Reorder Risk',model:'RandomForest'},evaluationKind:'simulated-prototype',operationally_approved:false,independentAccuracyValidated:false});
 const r=await call('queryReport',{resource:'inventoryAIExperiments',filters:{}});const unknown=r.rows.find(x=>x.id==='unknown'),known=r.rows.find(x=>x.id==='known');assert.equal(unknown.label,null);assert.equal(known.label,'Reorder Risk');assert.equal(known.operationally_approved,false);assert.equal(known.evaluationKind,'simulated-prototype');
});
test('filtered export refuses incomplete row/scan/byte selections without any writes',async()=>{
 products(2001);await assert.rejects(call('exportReport',{resource:'products',filters:{},mode:'filtered'}),/narrow|limit|complete/i);rows=new Map([...rows].filter(([p])=>!p.startsWith('products/')));products(1900,{name:'箱'.repeat(500)});await assert.rejects(call('exportReport',{resource:'products',filters:{},mode:'filtered'}),/byte|size|limit|narrow/i);
});
test('page export is explicit and full filtered export uses the same authority/filter snapshot',async()=>{
 products(25);const before=clone([...rows]),page=await call('exportReport',{resource:'products',filters:{},mode:'page'});assert.equal(page.rowCount,20);assert.equal(page.coverage.scope,'page');assert.equal(page.coverage.complete,false);assert.match(page.csv,/Current refreshed page/);const full=await call('exportReport',{resource:'products',filters:{},mode:'filtered'});assert.equal(full.rowCount,25);assert.equal(full.coverage.complete,true);assert.match(full.csv,/Complete filtered selection/);assert.deepEqual([...rows],before);
});
test('deadline/cancellation refuses rather than returning a partial result or writing state',async()=>{
 products(50);afterRead=()=>{clock+=8000;};await assert.rejects(call('queryReport',{resource:'products',filters:{search:'absent'}}),/time|deadline/i);afterRead=()=>{};const abort=new AbortController();abort.abort();await assert.rejects(call('queryReport',{resource:'products',filters:{}},'manager','scope',{signal:abort.signal}),/cancel|abort/i);
});
test('forged cursor cannot trigger a foreign document read and read limits stay bounded',async()=>{
 products(230);await assert.rejects(call('queryReport',{resource:'products',filters:{},cursor:Buffer.from(JSON.stringify({version:1,after:'foreign',binding:'forged'})).toString('base64url')}));assert(reads<=2);reads=0;const result=await call('queryReport',{resource:'products',filters:{search:'absent'}});assert(reads<=1000);assert(result.scanned<=200);assert.equal(result.coverage.readCap,1000);
});
