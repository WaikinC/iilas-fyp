import {beforeEach,mock} from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url));
let rows,reads,queries,clock,afterRead;
const ref=path=>({path}),field=f=>typeof f==='string'?f:f.toString();
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

export {call,products};
export const put=(path,value)=>rows.set(path,value);
export const state=()=>({reads,queries});
export const changeBeforeRead=fn=>{afterRead=fn;};
export const setClock=value=>{clock=value;};
