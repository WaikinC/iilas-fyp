import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {randomUUID} from 'node:crypto';
const api=await import('../lib/inventoryAIClient.js').catch(()=>null);
let store,calls,current,work,client;
const scenario={quantityOnHand:3,reservedQuantity:1,reorderLevel:4,movementFrequency:2,adjustmentCount:0,daysSinceReplenishment:.25};
const key='iilas.inventoryAI.scope.user.experiment';
const result=(input,state='Predicted')=>({state,operationId:input.operationId,experimentId:['Predicted','Unavailable'].includes(state)?randomUUID():null,replayed:false});
beforeEach(()=>{store=new Map();calls=[];current=true;work=async input=>result(input);client=api?.createInventoryAIClient({storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},context:{uid:'user',scope:'scope'},isCurrent:()=>current,command:async(action,input)=>{calls.push({action,input});return work(input);}});});
const need=()=>{assert(client,'Stock experiment client missing');return client;};
test('stores exact input before RPC, clears correlated terminal only',async()=>{work=async input=>{assert.deepEqual(JSON.parse(store.get(key)),input);return result(input);};const r=await need().start(scenario);assert.equal(r.state,'Predicted');assert.equal(store.has(key),false);assert.equal(calls[0].action,'startInventoryExperiment');});
test('storage failure prevents model command',async()=>{const c=api?.createInventoryAIClient({storage:{getItem:()=>null,setItem:()=>{throw Error('full');},removeItem:()=>{}},context:{uid:'user',scope:'scope'},isCurrent:()=>true,command:async()=>{throw Error('must not call');}});assert(c);await assert.rejects(c.start(scenario),/full/);});
test('lost acknowledgement reload retry and resolve keep exact operation and scenario',async()=>{work=async()=>{throw Error('lost');};await assert.rejects(need().start(scenario));const saved=need().pending();work=async input=>result(input,'Pending');await need().retry();assert.deepEqual(need().pending(),saved);await assert.rejects(need().start({...scenario,quantityOnHand:10}));work=async input=>result(input,'Cancelled');await need().resolve();assert.equal(calls.at(-1).action,'resolveInventoryExperiment');assert.deepEqual(calls.at(-1).input,saved);assert.equal(need().pending(),null);});
test('double click cannot create a second operation',async()=>{let release;work=input=>new Promise(resolve=>{release=()=>resolve(result(input));});const first=need().start(scenario);await assert.rejects(need().start(scenario),/already/);assert.equal(calls.length,1);release();await first;});
test('malformed saved data is preserved',async()=>{store.set(key,'{"broken":true}');assert.throws(()=>need().pending(),/reconciliation/);await assert.rejects(need().start(scenario));assert.equal(store.get(key),'{"broken":true}');assert.equal(calls.length,0);});
test('closed state, identity and id validators preserve uncertain requests',async()=>{for(const change of [{state:'Accepted'},{operationId:randomUUID()},{experimentId:null},{experimentId:[randomUUID()]},{replayed:'yes'},{extra:true}]){store.clear();work=async input=>({...result(input),...change});await assert.rejects(need().start(scenario),/confirmed/);assert(store.has(key));}});
test('account change before and after response cannot clear pending input',async()=>{current=false;await assert.rejects(need().start(scenario),/account/);assert.equal(calls.length,0);current=true;work=async input=>{current=false;return result(input);};await assert.rejects(need().start(scenario),/account/);assert(store.has(key));});
test('cancelled and Pending require null record IDs',async()=>{work=async input=>({...result(input,'Pending'),experimentId:randomUUID()});await assert.rejects(need().start(scenario));assert(store.has(key));work=async input=>result(input,'Unavailable');await need().resolve();assert.equal(store.has(key),false);});
test('35-second observation deadline retains exact request and ignores late terminal while resolving',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release,releaseResolve,state='pending',observed;
 work=input=>new Promise(resolve=>{release=()=>resolve(result(input));});
 const first=need().start(scenario).then(()=>{state='fulfilled';},error=>{state='rejected';observed=error;});
 try{
  const saved=need().pending();t.mock.timers.tick(34999);await new Promise(setImmediate);assert.equal(state,'pending');
  t.mock.timers.tick(1);await new Promise(setImmediate);assert.equal(state,'rejected');assert.match(observed.message,/35 seconds/);assert.deepEqual(need().pending(),saved);
  work=input=>new Promise(resolve=>{releaseResolve=()=>resolve(result(input,'Cancelled'));});
  const recovery=need().resolve();assert.equal(calls.length,2);assert.deepEqual(calls[1].input,saved);assert.equal(calls[1].action,'resolveInventoryExperiment');
  release();await new Promise(setImmediate);assert.deepEqual(need().pending(),saved);
  releaseResolve();await recovery;assert.equal(need().pending(),null);
 }finally{release?.();releaseResolve?.();await first;}
});
test('retry and outcome check deadlines preserve the saved operation without automatic resend',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});work=async()=>{throw Error('lost');};await assert.rejects(need().start(scenario));
 const saved=need().pending();
 for(const method of ['retry','resolve']){
  let release,state='pending';work=input=>new Promise(resolve=>{release=()=>resolve(result(input,'Pending'));});
  const before=calls.length,attempt=need()[method]().then(()=>{state='fulfilled';},()=>{state='rejected';});
  try{t.mock.timers.tick(35000);await new Promise(setImmediate);assert.equal(state,'rejected');assert.deepEqual(need().pending(),saved);assert.equal(calls.length,before+1);}
  finally{release();await attempt;}
 }
});
