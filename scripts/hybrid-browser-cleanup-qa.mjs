import test from 'node:test';import assert from 'node:assert/strict';
test('owned local browser teardown signs out and waits for observer unmount before closing',async()=>{
 const {closeLocalTestContext}=await import('./local-browser-cleanup.mjs'),calls=[],page={isClosed:()=>false,url:()=> 'http://127.0.0.1:5173/',evaluate:async()=>{calls.push('signOut');return true;},waitForFunction:async()=>{calls.push('unmounted');},waitForTimeout:async()=>{calls.push('flush');}},context={pages:()=>[page],close:async()=>{calls.push('close');}};
 await closeLocalTestContext(context);assert.deepEqual(calls,['signOut','unmounted','flush','close']);
 calls.length=0;page.url=()=> 'https://external.example/';await assert.rejects(()=>closeLocalTestContext(context));assert.deepEqual(calls,[]);
});
test('owned inert download tabs are closed without attempting Firebase sign-out',async()=>{
 const {closeLocalTestContext}=await import('./local-browser-cleanup.mjs');let closed=false;
 const context={pages:()=>['about:blank#blocked','blob:http://127.0.0.1:5173/owned-download','chrome-error://chromewebdata/'].map(url=>({url:()=>url,isClosed:()=>false,evaluate:async()=>{throw Error('Inert download tabs have no app SDK');}})),close:async()=>{closed=true;}};
 await closeLocalTestContext(context);assert.equal(closed,true);
});
