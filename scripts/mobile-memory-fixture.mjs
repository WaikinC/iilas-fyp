// Test-only Firestore adapter: transactions reject reads after writes and retry
// concurrent revisions. Production authorization and command code remain real.
import assert from 'node:assert/strict';
export function mobileMemory(initial={}){
 let rows=new Map(Object.entries(structuredClone(initial))),revision=0;
 const ref=path=>({path,id:path.split('/').at(-1)});
 function query(kind,filters=[],after=null,count=100){return {kind,filters,after,count,where(field,op,value){return query(kind,[...filters,[field,op,value]],after,count);},orderBy(){return this;},startAfter(value){return query(kind,filters,typeof value==='string'?value:value.id,count);},limit(n){return query(kind,filters,after,n);},doc(key){return ref(kind+'/'+key);},async get(){return snapshot(this,rows);}};}
 function snapshot(r,view){
  if(r.kind){const docs=[...view].filter(([path,value])=>path.split('/').length===2&&path.startsWith(r.kind+'/')&&(!r.after||path.split('/')[1]>r.after)&&r.filters.every(([field,op,x])=>op==='=='&&value[field]===x)).sort(([a],[b])=>a.localeCompare(b)).slice(0,r.count).map(([path])=>snapshot(ref(path),view));return {docs,empty:!docs.length,size:docs.length};}
  const data=view.get(r.path);return {exists:data!==undefined,id:r.id,ref:r,data:()=>structuredClone(data)};
 }
 const db={doc:ref,collection:kind=>query(kind),async runTransaction(work){for(let i=0;i<30;i++){
  const version=revision,view=new Map(structuredClone([...rows])),writes=[];
  const tx={async get(r){assert.equal(writes.length,0,'read after write');return snapshot(r,view);},create(r,v){assert(!view.has(r.path),'duplicate create');writes.push([r.path,v]);},set(r,v){writes.push([r.path,v]);},update(r,v){assert(view.has(r.path),'missing update');writes.push([r.path,{...view.get(r.path),...v}]);},delete(r){writes.push([r.path,undefined]);}};
  const result=await work(tx);if(version!==revision)continue;for(const [key,value]of writes){if(value===undefined)rows.delete(key);else rows.set(key,structuredClone(value));}revision++;return result;
 }throw Error('Transaction retry budget exhausted');}};
 return {db,get rows(){return rows;},reset(value){rows=new Map(Object.entries(structuredClone(value)));revision++;}};
}
