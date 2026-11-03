import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createShipmentCommandRunner} from '../src/features/shipments/shipmentCommands.ts';

const intent=()=>({kind:'save',input:{reference:'SHP-DEMO',items:[{productId:'p',quantity:3}],status:'Dispatched'},original:{id:'s',version:2}});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('overlapping submissions make one real command and freeze nested caller input',async()=>{
 const d=deferred(),calls=[],results=[],current={authorityKey:'a',generation:1,allowed:true};
 const runner=createShipmentCommandRunner({save:(input,original)=>{calls.push({input,original});return d.promise;},remove:async()=>{}},()=>current,r=>results.push(r));
 const input=intent(),first=runner.run(input,current);input.input.items[0].quantity=99;input.original.version=10;
 assert.equal(await runner.run(intent(),current),'ignored');assert.equal(calls.length,1);assert.equal(calls[0].input.items[0].quantity,3);assert.equal(calls[0].original.version,2);
 assert.equal(runner.isBusy(),true);d.resolve('s');assert.equal(await first,'success');assert.equal(results.length,1);assert.equal(runner.isBusy(),false);
});
test('a lost reply retains the original intent without automatic retry',async()=>{
 const results=[];let calls=0;const current={authorityKey:'a',generation:1,allowed:true};
 const runner=createShipmentCommandRunner({save:async()=>{calls++;throw Error('reply lost');},remove:async()=>{}},()=>current,r=>results.push(r));
 assert.equal(await runner.run(intent(),current),'error');assert.equal(calls,1);assert.equal(results[0].kind,'error');assert.equal(results[0].intent.original.version,2);
 assert.match(results[0].message,/reply lost/);
});
for(const field of ['authorityKey','generation','allowed','retire'])test('late command reply is fenced after '+field,async()=>{
 const d=deferred(),results=[],current={authorityKey:'a',generation:1,allowed:true};
 const runner=createShipmentCommandRunner({save:()=>d.promise,remove:async()=>{}},()=>current,r=>results.push(r));
 const pending=runner.run(intent(),{...current});
 if(field==='retire')runner.retire();else current[field]=field==='allowed'?false:field==='generation'?2:'b';
 d.resolve('s');assert.equal(await pending,'ignored');assert.equal(results.length,0);
});
test('own successful source update is not mistaken for authority retirement',async()=>{
 const d=deferred(),results=[],current={authorityKey:'a',generation:1,allowed:true,sourceVersion:2};
 const runner=createShipmentCommandRunner({save:()=>d.promise,remove:async()=>{}},()=>current,r=>results.push(r));
 const pending=runner.run(intent(),{...current});current.sourceVersion=3;d.resolve('s');
 assert.equal(await pending,'success');assert.equal(results.length,1);
});
test('forbidden origin never invokes save or delete',async()=>{
 let calls=0;const current={authorityKey:'a',generation:1,allowed:false};
 const runner=createShipmentCommandRunner({save:async()=>calls++,remove:async()=>calls++},()=>current,()=>{});
 assert.equal(await runner.run(intent(),current),'ignored');assert.equal(await runner.run({kind:'remove',original:{id:'s',version:1}},current),'ignored');assert.equal(calls,0);
});
