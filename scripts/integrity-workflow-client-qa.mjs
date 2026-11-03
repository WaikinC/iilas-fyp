import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {createIntegrityRegistrationClient,createIntegrityWallet} from '../lib/integrityRegistrationClient.js';
const context={uid:'manager',scope:'scope',tab:'tab1'},hash='0x'+'5'.repeat(64),sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const saved=new Map(),calls=[];let signCalls=0,current=true,mode='ok';const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const makePrepared=input=>({state:'Prepared',operationId:input.operationId,kind:input.kind,recordId:input.recordId,digest:sha('canonical fixture'),referenceHash:sha(`scope:${input.kind}:${input.recordId}`),canonical:'canonical fixture',sourceVersion:2,chainId:31337,contract:'0x'+'1'.repeat(40),authorisedWallet:'0x'+'4'.repeat(40),startingBlock:10,expiresAtMs:Date.now()+900000,transactionHash:null,reason:null});
 const done=input=>({state:'Completed',operationId:input.operationId,action:'registerIntegrityTransaction',recordId:sha(`scope:${input.kind}:${input.recordId}`),version:1,replayed:false});
 let terminal;
 const options={context,storage,isCurrent:()=>current,wallet:{verify:async()=>{if(mode==='wallet')throw Error('Missing compatible wallet');if(mode==='network')throw Error('Switch to chain 31337');},sign:async()=>{signCalls++;if(mode==='reject')throw Error('Wallet rejected');if(mode==='lost-hash')throw Error('Wallet response lost');return hash;}},command:async(action,input)=>{
  calls.push({action,input});assert.equal(saved.size,1,'intent saved before preparation');
  if(action==='prepareIntegrityRegistration')return makePrepared(input);
  if(action==='resolveIntegrityRegistration')return terminal??{...makePrepared(input),state:'Pending',reason:'ManualReconciliationRequired'};
  assert.equal(JSON.parse([...saved.values()][0]).transactionHash,hash,'hash saved before backend submission');terminal=done(input);if(mode==='lost-callable'){mode='ok';throw Error('Lost successful acknowledgement');}if(mode==='changed-source')throw Error('Source changed');return terminal;
 }};
 return {saved,storage,calls,options,signs:()=>signCalls,setMode:v=>{mode=v;},setCurrent:v=>{current=v;},client:()=>createIntegrityRegistrationClient(options)};
}
test('intent then prepared facts then transaction hash precede the backend call',async()=>{
 const f=fixture(),c=f.client(),r=await c.start({kind:'inventory',recordId:'m1'});assert.equal(r.state,'Completed');assert.equal(f.signs(),1);assert.equal(f.saved.size,0);assert.deepEqual(f.calls.map(c=>c.action),['prepareIntegrityRegistration','registerIntegrityTransaction']);
});
test('missing wallet and wrong network preserve intent and do not request a signature',async()=>{
 for(const mode of ['wallet','network']){const f=fixture();f.setMode(mode);await assert.rejects(f.client().start({kind:'inventory',recordId:'m1'}));assert.equal(f.signs(),0);assert.equal(f.saved.size,1);}
});
test('rejected or lost wallet response never causes another signature on retry or resolve',async()=>{
 for(const mode of ['reject','lost-hash']){const f=fixture(),c=f.client();f.setMode(mode);await assert.rejects(c.start({kind:'inventory',recordId:'m1'}));assert.equal(c.pending().phase,'Signing');const r=await f.client().retry();assert.equal(r.state,'Pending');await c.resolve();assert.equal(f.signs(),1);assert.equal(f.saved.size,1);}
});
test('lost callable acknowledgement reload recovers the same transaction without signing again',async()=>{
 const f=fixture(),c=f.client();f.setMode('lost-callable');await assert.rejects(c.start({kind:'inventory',recordId:'m1'}));const original=c.pending();assert.equal(original.transactionHash,hash);assert.equal((await f.client().retry()).state,'Completed');assert.equal(f.signs(),1);assert.equal(f.calls.at(-1).input.operationId,original.input.operationId);assert.equal(f.saved.size,0);
});
test('changed source and malformed or mismatched outcomes keep recovery data',async()=>{
 const f=fixture(),c=f.client();f.setMode('changed-source');await assert.rejects(c.start({kind:'delivery',recordId:'e1'}));assert.equal(c.pending().transactionHash,hash);
 const key=[...f.saved.keys()][0];f.saved.set(key,'{bad');assert.throws(()=>c.pending(),/reconcil/i);assert.equal(f.saved.get(key),'{bad');
 const g=fixture();g.options.command=async(_a,input)=>({state:'Prepared',operationId:input.operationId,kind:input.kind,recordId:'other'});await assert.rejects(g.client().start({kind:'inventory',recordId:'m1'}));assert.equal(g.signs(),0);
});
test('in-flight account changes keep a broadcast hash in only the unchanged original slot',async()=>{
 const f=fixture(),c=f.client();let release,entered;const signing=new Promise(resolve=>{entered=resolve;});f.options.wallet.sign=()=>new Promise(resolve=>{release=()=>resolve(hash);entered();});const work=c.start({kind:'inventory',recordId:'m1'});await signing;await assert.rejects(c.retry(),/running/);c.dispose();f.setCurrent(false);release();await assert.rejects(work,/account|view/);assert.equal(f.calls.filter(c=>c.action==='registerIntegrityTransaction').length,0);f.setCurrent(true);assert.equal(f.client().pending().transactionHash,hash);
});
test('the actual EIP-1193 adapter checks chain and wallet before sending only public contract data',async()=>{
 const requests=[];let chain='0x7a69',account='0x'+'4'.repeat(40);
 const provider={request:async req=>{requests.push(req);if(req.method==='eth_chainId')return chain;if(['eth_requestAccounts','eth_accounts'].includes(req.method))return [account];if(req.method==='eth_sendTransaction')return hash;throw Error('Unexpected request');}};
 const wallet=createIntegrityWallet(provider),prepared={chainId:31337,contract:'0x'+'1'.repeat(40),authorisedWallet:account,digest:'a'.repeat(64),referenceHash:'b'.repeat(64)};
 await wallet.verify(prepared);assert.equal(await wallet.sign(prepared),hash);const tx=requests.find(x=>x.method==='eth_sendTransaction').params[0];assert.deepEqual(Object.keys(tx).sort(),['data','from','to']);assert(tx.data.startsWith('0x'));assert.equal(tx.to,prepared.contract);
 chain='0x1';await assert.rejects(wallet.sign(prepared),/31337/);chain='0x7a69';account='0x'+'9'.repeat(40);await assert.rejects(wallet.sign(prepared),/wallet|account/i);assert.equal(requests.filter(x=>x.method==='eth_sendTransaction').length,1);
});
test('an expired prepared claim cannot request a new wallet signature',async()=>{
 const f=fixture(),original=f.options.command;f.options.command=async(a,input)=>{const result=await original(a,input);return a==='prepareIntegrityRegistration'?{...result,expiresAtMs:1}:result;};const c=f.client();await assert.rejects(c.start({kind:'inventory',recordId:'m1'}),/expired/i);assert.equal(f.signs(),0);assert.equal(f.saved.size,1);
});
