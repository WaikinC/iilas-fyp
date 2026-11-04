import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, readdir, rm, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createRequire} from 'node:module';

const app=resolve(import.meta.dirname,'../..'),require=createRequire(join(app,'package.json'));
const {createProvider}=require('hardhat/internal/core/providers/construction.js');
const hre=require('hardhat'),{Wallet,Interface}=require('ethers');
const artifact=require(join(app,'blockchain/artifacts/blockchain/contracts/IntegrityRegistry.sol/IntegrityRegistry.json'));
const wallet=Wallet.fromPhrase(hre.config.networks.hardhat.accounts.mnemonic);
const timestamp=1800000000;
async function provider(){return createProvider({...hre.config,networks:{...hre.config.networks,hardhat:{...hre.config.networks.hardhat,initialDate:new Date(timestamp*1000).toISOString(),loggingEnabled:false}}},'hardhat');}
const rpc=(p,method,params=[])=>p.request({method,params});
const manifestFor=async p=>({schema:'iilas-durable-chain-1.0',chainId:31337,initialDate:new Date(timestamp*1000).toISOString(),genesis:await rpc(p,'eth_getBlockByNumber',['0x0',false])});
async function open(directory,manifest,options={}){const runtime=await import('./durable-chain.mjs').catch(()=>({}));assert.equal(typeof runtime.createDurableChain,'function','durable chain recovery has not been implemented');return runtime.createDurableChain({provider:await provider(),directory,manifest,clock:()=>timestamp*1000+10000,...options});}
async function deployment(){return wallet.signTransaction({type:2,chainId:31337,nonce:0,gasLimit:16777216,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,value:0,data:artifact.bytecode});}
const fixture=async t=>{const root=await mkdtemp(join(tmpdir(),'iilas-durable-test-')),directory=join(root,'journal');await mkdir(directory);t.after(()=>rm(root,{recursive:true,force:true}));const p=await provider();const manifest=await manifestFor(p);return {directory,manifest,root};};

test('signed registry deployment and registration retain exact receipts, blocks, events and lookup after reopening',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest),deploy=await a.request({method:'eth_sendRawTransaction',params:[await deployment()]}),receipt=await a.request({method:'eth_getTransactionReceipt',params:[deploy]});
 const abi=new Interface(artifact.abi),reference='0x'+'11'.repeat(32),digest='0x'+'22'.repeat(32);
 const raw=await wallet.signTransaction({type:2,chainId:31337,nonce:1,gasLimit:100000,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,to:receipt.contractAddress,value:0,data:abi.encodeFunctionData('register',[reference,digest])});
 const tx=await a.request({method:'eth_sendRawTransaction',params:[raw]}),before=await a.request({method:'eth_getTransactionReceipt',params:[tx]}),block=await a.request({method:'eth_getBlockByNumber',params:[before.blockNumber,false]});await a.close();
 const b=await open(f.directory,f.manifest);assert.deepEqual(await b.request({method:'eth_getTransactionReceipt',params:[tx]}),before);assert.deepEqual(await b.request({method:'eth_getBlockByNumber',params:[before.blockNumber,false]}),block);assert.equal(await b.request({method:'eth_call',params:[{to:receipt.contractAddress,data:abi.encodeFunctionData('lookup',[reference])},'latest']}),digest);assert.equal((await b.request({method:'eth_getLogs',params:[{address:receipt.contractAddress,fromBlock:'0x0',toBlock:'latest'}]})).length,1);await b.close();
});

test('duplicate raw submissions mine once and return the original transaction hash',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest),raw=await deployment();const hashes=await Promise.all([a.request({method:'eth_sendRawTransaction',params:[raw]}),a.request({method:'eth_sendRawTransaction',params:[raw]})]);assert.equal(hashes[0],hashes[1]);assert.equal(await a.request({method:'eth_blockNumber'}),'0x1');await a.close();
});

test('an fsynced intent survives interruption before execution and is recovered exactly once',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest,{afterIntent:()=>{throw Error('simulated power loss');}});await assert.rejects(a.request({method:'eth_sendRawTransaction',params:[await deployment()]}));await a.close();
 const b=await open(f.directory,f.manifest);assert.equal(await b.request({method:'eth_blockNumber'}),'0x1');assert.equal((await b.verify()).transactions,1);await b.close();
});

test('a mined revert remains durable rather than being mistaken for an unchanged chain',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest),tx=await a.request({method:'eth_sendRawTransaction',params:[await deployment()]}),r=await a.request({method:'eth_getTransactionReceipt',params:[tx]});
 const raw=await wallet.signTransaction({type:2,chainId:31337,nonce:1,gasLimit:100000,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,to:r.contractAddress,value:0,data:'0xffffffff'});await assert.rejects(a.request({method:'eth_sendRawTransaction',params:[raw]}));const before=await a.request({method:'eth_getBlockByNumber',params:['latest',false]});assert.equal(before.number,'0x2');await a.close();const b=await open(f.directory,f.manifest);assert.deepEqual(await b.request({method:'eth_getBlockByNumber',params:['latest',false]}),before);await b.close();
});

test('invalid nonce is durably rejected without preventing later valid work or restart',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest);const invalid=await wallet.signTransaction({type:2,chainId:31337,nonce:5,gasLimit:21000,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,to:wallet.address,value:0});await assert.rejects(a.request({method:'eth_sendRawTransaction',params:[invalid]}));const hash=await a.request({method:'eth_sendRawTransaction',params:[await deployment()]});await a.close();const b=await open(f.directory,f.manifest);assert.equal((await b.request({method:'eth_getTransactionReceipt',params:[hash]})).status,'0x1');await b.close();
});

test('clients cannot reset, mine, impersonate or submit unlocked transactions',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest);for(const method of ['hardhat_reset','evm_mine','hardhat_setBalance','hardhat_impersonateAccount','eth_sendTransaction'])await assert.rejects(a.request({method,params:[]}));assert.equal(await a.request({method:'eth_blockNumber'}),'0x0');await a.close();
});

test('tampering or a missing result cannot erase acknowledged transactions',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest);await a.request({method:'eth_sendRawTransaction',params:[await deployment()]});await a.close();const files=await readdir(f.directory),name=files.find(x=>x.endsWith('.result.json'));assert.ok(name);const bytes=await readFile(join(f.directory,name));await writeFile(join(f.directory,name),bytes.subarray(0,bytes.length-5));await assert.rejects(open(f.directory,f.manifest));
});

test('wrong genesis never starts a replacement history',async t=>{
 const f=await fixture(t);f.manifest.genesis.hash='0x'+'ff'.repeat(32);await assert.rejects(open(f.directory,f.manifest));
});

test('failed replay never replaces the saved head with a shorter acknowledged history',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest);await a.request({method:'eth_sendRawTransaction',params:[await deployment()]});const second=await wallet.signTransaction({type:2,chainId:31337,nonce:1,gasLimit:21000,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,to:wallet.address,value:0});await a.request({method:'eth_sendRawTransaction',params:[second]});await a.close();const head=await readFile(join(f.directory,'head.json'));
 await rm(join(f.directory,'00000002.intent.json'));await rm(join(f.directory,'00000002.result.json'));await assert.rejects(open(f.directory,f.manifest));assert.deepEqual(await readFile(join(f.directory,'head.json')),head);await assert.rejects(open(f.directory,f.manifest));
});
test('a separate high-water mark refuses loss of both head and the last acknowledged transaction',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest);await a.request({method:'eth_sendRawTransaction',params:[await deployment()]});const second=await wallet.signTransaction({type:2,chainId:31337,nonce:1,gasLimit:21000,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,to:wallet.address,value:0});await a.request({method:'eth_sendRawTransaction',params:[second]});await a.close();for(const name of ['head.json','00000002.intent.json','00000002.result.json'])await rm(join(f.directory,name));await assert.rejects(open(f.directory,f.manifest));
});
test('a failed checkpoint never acknowledges a duplicate and leaves the engine unavailable',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest,{afterIntent:async()=>mkdir(join(f.directory,'head.json'))}),raw=await deployment();await assert.rejects(a.request({method:'eth_sendRawTransaction',params:[raw]}));await assert.rejects(a.request({method:'eth_sendRawTransaction',params:[raw]}));await assert.rejects(a.verify());await a.close();
});
test('a previously rejected nonce can be retried after its preceding transaction is mined',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest),later=await wallet.signTransaction({type:2,chainId:31337,nonce:1,gasLimit:21000,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,to:wallet.address,value:0});await assert.rejects(a.request({method:'eth_sendRawTransaction',params:[later]}));await a.request({method:'eth_sendRawTransaction',params:[await deployment()]});const hash=await a.request({method:'eth_sendRawTransaction',params:[later]});assert.equal((await a.request({method:'eth_getTransactionReceipt',params:[hash]})).blockNumber,'0x2');assert.equal((await a.verify()).transactions,2);await a.close();
});
test('a large valid receipt is stored compactly and replays without a reader size failure',async t=>{
 const f=await fixture(t),a=await open(f.directory,f.manifest),raw=await wallet.signTransaction({type:2,chainId:31337,nonce:0,gasLimit:14000000,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,value:0,data:'0x614e205b5f5fa060019003806003575000'}),hash=await a.request({method:'eth_sendRawTransaction',params:[raw]}),receipt=await a.request({method:'eth_getTransactionReceipt',params:[hash]});assert.equal(receipt.logs.length,20000);await a.close();assert.ok((await readFile(join(f.directory,'00000001.result.json'))).length<10000);const b=await open(f.directory,f.manifest);assert.deepEqual(await b.request({method:'eth_getTransactionReceipt',params:[hash]}),receipt);await b.close();
});
