import test from 'node:test';
import assert from 'node:assert/strict';
import {runStartup} from './startup.mjs';
function fixture(states, overrides = {}) {
 const starts = [], reports = [];
 const services = Object.fromEntries(['chain','stock','delivery','api','tunnel'].map(name => [name, {
  inspect: async () => ({state: states[name] ?? 'ready'}),
  start: async () => { starts.push(name); states[name] = 'ready'; },
 }]));
 return {services,starts,reports,options:{services,report:(...args)=>reports.push(args),...overrides}};
}
test('healthy services are reused without any launch', async()=>{
 const f=fixture({}); assert.equal((await runStartup(f.options)).servicesReady,true); assert.deepEqual(f.starts,[]);
});
test('missing blockchain stops startup and never creates a replacement chain',async()=>{
 const f=fixture({chain:'absent',stock:'absent'}); const r=await runStartup(f.options);
 assert.equal(r.servicesReady,false); assert.equal(r.blockedAt,'chain'); assert.deepEqual(f.starts,[]);
});
test('a different blockchain also blocks startup',async()=>{
 const f=fixture({chain:'blocked'}); assert.equal((await runStartup(f.options)).blockedAt,'chain'); assert.deepEqual(f.starts,[]);
});
test('stopped supported services start sequentially and are rechecked',async()=>{
 const f=fixture({stock:'absent',delivery:'absent',api:'absent',tunnel:'absent'});
 assert.equal((await runStartup(f.options)).servicesReady,true); assert.deepEqual(f.starts,['stock','delivery','api','tunnel']);
});
test('an occupied but invalid service is never replaced or killed',async()=>{
 const f=fixture({stock:'blocked',delivery:'absent'}); assert.equal((await runStartup(f.options)).blockedAt,'stock'); assert.deepEqual(f.starts,[]);
});
test('check-only mode never starts a missing service',async()=>{
 const f=fixture({delivery:'absent'},{checkOnly:true}); assert.equal((await runStartup(f.options)).servicesReady,false); assert.deepEqual(f.starts,[]);
});
test('startup failure is redacted and blocks dependent launches',async()=>{
 const f=fixture({api:'absent',tunnel:'absent'}); f.services.api.start=async()=>{throw Error('SECRET-FIXTURE');};
 assert.equal((await runStartup(f.options)).blockedAt,'api'); assert.deepEqual(f.starts,[]); assert.ok(!JSON.stringify(f.reports).includes('SECRET-FIXTURE'));
});
test('a launch is not ready until subsequent inspection passes',async()=>{
 const f=fixture({api:'absent'}); f.services.api.start=async()=>{}; assert.equal((await runStartup(f.options)).blockedAt,'api');
});
test('a configured durable chain restores before dependent services without a reset',async()=>{
 const f=fixture({chain:'absent',stock:'absent',api:'absent'},{recoverChain:true});const r=await runStartup(f.options);assert.equal(r.servicesReady,true);assert.deepEqual(f.starts,['chain','stock','api']);
});
