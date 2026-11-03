import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {randomUUID} from 'node:crypto';
const api=await import('../lib/inventoryContextAIClient.js').catch(()=>null);
let store,calls,current,work,client;
const scenario={quantityOnHand:3,reservedQuantity:1,reorderLevel:4,movementFrequency:2,adjustmentCount:0,daysSinceReplenishment:.25,additionalFirmQuantity:0,additionalDueDays:null,incomingQuantity:0,incomingEtaDays:null,supplyStatus:'none'};
const key='iilas.inventoryAI.scope.user.contextExperiment';
const result=(input,state='Predicted')=>({state,operationId:input.operationId,experimentId:['Predicted','Unavailable'].includes(state)?randomUUID():null,replayed:false});
beforeEach(()=>{store=new Map();calls=[];current=true;work=async input=>result(input);client=api?.createInventoryContextAIClient({storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},context:{uid:'user',scope:'scope'},isCurrent:()=>current,command:async(action,input)=>{calls.push({action,input});return work(input);}});});
const need=()=>{assert(client,'Stock experiment client missing');return client;};
test('stores exact input before RPC, clears correlated terminal only',async()=>{work=async input=>{assert.deepEqual(JSON.parse(store.get(key)),input);return result(input);};const r=await need().start(scenario);assert.equal(r.state,'Predicted');assert.equal(store.has(key),false);assert.equal(calls[0].action,'startInventoryContextExperiment');});
test('storage failure prevents model command',async()=>{const c=api?.createInventoryContextAIClient({storage:{getItem:()=>null,setItem:()=>{throw Error('full');},removeItem:()=>{}},context:{uid:'user',scope:'scope'},isCurrent:()=>true,command:async()=>{throw Error('must not call');}});assert(c);await assert.rejects(c.start(scenario),/full/);});
test('lost acknowledgement reload retry and resolve keep exact operation and scenario',async()=>{work=async()=>{throw Error('lost');};await assert.rejects(need().start(scenario));const saved=need().pending();work=async input=>result(input,'Pending');await need().retry();assert.deepEqual(need().pending(),saved);await assert.rejects(need().start({...scenario,quantityOnHand:10}));work=async input=>result(input,'Cancelled');await need().resolve();assert.equal(calls.at(-1).action,'resolveInventoryContextExperiment');assert.deepEqual(calls.at(-1).input,saved);assert.equal(need().pending(),null);});
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
  const recovery=need().resolve();assert.equal(calls.length,2);assert.deepEqual(calls[1].input,saved);assert.equal(calls[1].action,'resolveInventoryContextExperiment');
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

const legacyKey='iilas.inventoryAI.scope.user.experiment';
function legacyInput(){return {operationId:randomUUID(),scenario:Object.fromEntries(Object.entries(scenario).filter(([k])=>!['additionalFirmQuantity','additionalDueDays','incomingQuantity','incomingEtaDays','supplyStatus'].includes(k))) };}
test('legacy intent blocks new inference and resolves only through the old resolver',async()=>{
 const old=legacyInput();store.set(legacyKey,JSON.stringify(old));assert.deepEqual(need().legacyPending(),old);
 await assert.rejects(need().start(scenario),/previous|legacy/i);assert.equal(calls.length,0);assert.equal(store.has(key),false);
 work=async input=>result(input,'Cancelled');await need().resolveLegacy();assert.equal(calls[0].action,'resolveInventoryExperiment');assert.deepEqual(calls[0].input,old);assert(!store.has(legacyKey));
 await need().start(scenario);assert.equal(calls[1].action,'startInventoryContextExperiment');
});
test('simultaneous saved versions are not migrated or erased together',async()=>{
 const old=legacyInput(),next={operationId:randomUUID(),scenario};store.set(legacyKey,JSON.stringify(old));store.set(key,JSON.stringify(next));
 assert.deepEqual(need().pending(),next);assert.deepEqual(need().legacyPending(),old);
 await assert.rejects(need().retry(),/previous|legacy/i);work=async input=>result(input,'Cancelled');await need().resolveLegacy();assert.deepEqual(need().pending(),next);await need().resolve();assert(!store.has(key));
});
test('malformed old intent is retained and prevents new context calls',async()=>{
 store.set(legacyKey,'{"unknownVersion":3}');assert.throws(()=>need().legacyPending(),/reconciliation/);await assert.rejects(need().start(scenario));assert.equal(store.get(legacyKey),'{"unknownVersion":3}');assert.equal(calls.length,0);
});
test('a replaced stored context intent cannot be cleared by an old terminal reply',async()=>{
 const replacement={operationId:randomUUID(),scenario:{...scenario,quantityOnHand:4}};work=async input=>{store.set(key,JSON.stringify(replacement));return result(input);};
 await assert.rejects(need().start(scenario),/changed/);assert.deepEqual(need().pending(),replacement);
});
