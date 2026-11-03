import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createCompletionClient} from '../lib/completionClient.js';
const context={uid:'manager',scope:'scope',tab:'tab1'},action='updateFleetResource';
const input={id:'v1',expectedVersion:1,data:{status:'Available'}};
const terminal=(request,patch={})=>({state:'Completed',operationId:request.operationId,action,recordId:'v1',version:2,replayed:false,...patch});
function fixture(){let current=true,calls=[],resolver;const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const options={storage,context,resolveActions:{[action]:'resolveFleetResourceUpdate'},isCurrent:()=>current,command:async(name,request)=>{calls.push({name,request});return resolver?resolver(name,request):terminal(request);}};
 return {saved,storage,calls,options,setCurrent:v=>{current=v;},setCommand:v=>{resolver=v;},client:()=>createCompletionClient(options)};
}
test('intent is saved before any send; terminal success clears only its own actor/tab/action slot',async()=>{
 const f=fixture(),c=f.client();f.setCommand((_name,r)=>{assert.equal(f.saved.size,1);assert.equal([...f.saved.keys()][0],'iilas.completion.scope.manager.tab1.updateFleetResource');assert.deepEqual(JSON.parse([...f.saved.values()][0]),r);return terminal(r);});
 await c.start(action,input);assert.equal(f.saved.size,0);assert.equal(f.calls.length,1);
 f.storage.setItem=()=>{throw Error('disk full');};await assert.rejects(c.start(action,input),/disk full/);assert.equal(f.calls.length,1);
});
test('lost reply and reload keep exactly the original intent for retry and named resolve',async()=>{
 const f=fixture(),c=f.client();f.setCommand(()=>{throw Error('response lost');});await assert.rejects(c.start(action,input),/lost/);const original=c.pending(action);assert(original.operationId);
 await assert.rejects(c.start(action,input),/saved|Recover/);f.setCommand((_name,r)=>terminal(r,{replayed:true}));const reloaded=f.client();await reloaded.retry(action);assert.deepEqual(f.calls[1].request,original);assert.equal(f.saved.size,0);
 f.setCommand(()=>{throw Error('lost');});await assert.rejects(c.start(action,input));const request=c.pending(action);f.setCommand((_name,r)=>terminal(r,{state:'Cancelled',recordId:null,version:null}));await f.client().resolve(action);assert.equal(f.calls.at(-1).name,'resolveFleetResourceUpdate');assert.deepEqual(f.calls.at(-1).request,request);
});
test('malformed bytes unsupported actions and uncorrelated outcomes never clear intent',async()=>{
 const f=fixture(),c=f.client(),key='iilas.completion.scope.manager.tab1.'+action;
 await assert.rejects(c.start('unexpected',input));assert.equal(f.calls.length,0);
 f.saved.set(key,'{bad');assert.throws(()=>c.pending(action),/reconcil|saved/i);assert.equal(f.saved.get(key),'{bad');f.saved.delete(key);
 for(const patch of [{operationId:randomUUID()},{action:'other'},{recordId:null},{recordId:'different'},{version:3},{version:'2'},{extra:'no'}]){f.setCommand((_n,r)=>terminal(r,patch));await assert.rejects(c.start(action,input));assert.equal(f.saved.size,1);f.saved.delete(key);}
 await assert.rejects(c.start(action,{...input,operationId:randomUUID()}));assert.equal(f.saved.size,0);
});
test('single flight, changing account/view or stored intent fences late responses',async()=>{
 for(const mode of ['account','dispose','activate','intent']){
  const f=fixture(),c=f.client();let release;f.setCommand((_n,r)=>new Promise(resolve=>{release=()=>resolve(terminal(r));}));const first=c.start(action,input);
  await assert.rejects(c.retry(action),/running/);await assert.rejects(c.resolve(action),/running/);
  if(mode==='account')f.setCurrent(false);if(mode==='dispose')c.dispose();if(mode==='activate')c.activate();if(mode==='intent'){const [k,v]=[...f.saved][0];f.saved.set(k,JSON.stringify({...JSON.parse(v),expectedVersion:9}));}
  release();await assert.rejects(first,/account|view|changed/i);assert.equal(f.saved.size,1);
 }
});
test('35-second observation expiry retains intent and ignores a late successful response',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),c=f.client();let release;f.setCommand((_n,r)=>new Promise(resolve=>{release=()=>resolve(terminal(r));}));
 const promise=c.start(action,input),rejection=assert.rejects(promise,/35 seconds/);t.mock.timers.tick(35000);await rejection;assert.equal(f.saved.size,1);release();await Promise.resolve();assert.equal(f.saved.size,1);
});
