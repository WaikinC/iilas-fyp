import assert from 'node:assert/strict';
import {createStockRetry} from '../lib/stockRetry.js';
const rows=new Map(),storage={getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
const input={productId:'11111111-1111-4111-8111-111111111111',type:'Receipt',quantity:4,reference:'partial-po',reason:'Partial purchase receipt'};
const sent=[];
let client=createStockRetry(storage,'account-a',async(action,data)=>{sent.push({action,data});throw new Error('Response lost');});
await assert.rejects(()=>client.submit(input),/Response lost/);
const saved=client.pending();assert.equal(saved.quantity,4);assert.equal(saved.reference,'PARTIAL-PO');assert.ok(saved.operationId);
// Reload/reopen and changed form values must send the original immutable intent.
client=createStockRetry(storage,'account-a',async(action,data)=>{sent.push({action,data});return {id:'original',replayed:true};});
assert.deepEqual(await client.submit({...input,quantity:99}),{id:'original',replayed:true});
assert.deepEqual(sent[1].data,sent[0].data);assert.equal(client.pending(),null);
const other=createStockRetry(storage,'account-b',async()=>({id:'other'}));assert.equal(other.pending(),null);

const rejected=new Error('Balance rejected');rejected.details={stockRequestNotApplied:true};
client=createStockRetry(storage,'account-a',async()=>{throw rejected;});
await assert.rejects(()=>client.submit(input),/Balance rejected/);assert.equal(client.pending(),null);
// Definitive rejection of a retry cannot erase the uncertain earlier attempt.
storage.setItem('account-a',JSON.stringify(saved));
await assert.rejects(()=>client.submit(input),/Balance rejected/);assert.deepEqual(client.pending(),saved);
client=createStockRetry(storage,'account-a',async(action,data)=>{assert.equal(action,'resolveStock');assert.deepEqual(data,saved);return {notApplied:true};});
assert.deepEqual(await client.resolve(),{notApplied:true});assert.equal(client.pending(),null);
await assert.rejects(()=>client.resolve(),/no saved movement/);

let calls=0;
client=createStockRetry({...storage,setItem:()=>{throw new Error('Quota exceeded');}},'account-a',async()=>{calls++;});
await assert.rejects(()=>client.submit(input),/Enable session storage/);assert.equal(calls,0);
client=createStockRetry(storage,'account-a',async()=>{calls++;});
await assert.rejects(()=>client.submit({...input,quantity:0}),/Quantity/);assert.equal(calls,0);assert.equal(client.pending(),null);
storage.setItem('account-a','invalid');assert.throws(()=>client.pending(),/cannot be read/);storage.removeItem('account-a');
let release;
client=createStockRetry(storage,'account-a',()=>new Promise(resolve=>{release=resolve;}));
const running=client.submit(input);await assert.rejects(()=>client.submit(input),/already running/);
release({id:'one'});await running;assert.equal(client.pending(),null);
console.log('Stock client QA passed: lost response, reload/reopen, immutable retry, account isolation, known rejection, outcome check, storage failure and concurrent submit guard.');
