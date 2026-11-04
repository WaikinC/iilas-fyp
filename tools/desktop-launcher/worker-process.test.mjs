import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {hash,createDurableChain,publishJson} from './durable-chain.mjs';

const app=resolve(import.meta.dirname,'../..'),worker=join(import.meta.dirname,'chain-worker.mjs');
const require=createRequire(join(app,'package.json')),hre=require('hardhat');
const {createProvider}=require('hardhat/internal/core/providers/construction.js');
const {HDNodeWallet,Interface}=require('ethers');
const artifact=require(join(app,'blockchain/artifacts/blockchain/contracts/IntegrityRegistry.sol/IntegrityRegistry.json'));
const genesisSeconds=1800000000;
const network={...hre.config.networks.hardhat,initialDate:new Date(genesisSeconds*1000).toISOString(),loggingEnabled:false};
const canonicalNetwork=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?{$bigint:item.toString()}:item instanceof Map?{$map:[...item]}:item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const wallet=HDNodeWallet.fromPhrase(network.accounts.mnemonic,network.accounts.passphrase,network.accounts.path+'/0');
const abi=new Interface(artifact.abi),forbiddenPorts=new Set([8545,8001,8002,8011,4040]);
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const powershell=script=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:10000,stdio:['ignore','pipe','pipe']}).trim();

async function freePort(){
 const server=createServer();await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
 const port=server.address().port;await new Promise(done=>server.close(done));assert.ok(port>=1024&&!forbiddenPorts.has(port));return port;
}
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'iilas-worker-process-')),state=join(directory,'private');await mkdir(state);
 const children=[];
 t.after(async()=>{for(const child of children)await forceStop(child);assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('iilas-worker-process-'));await rm(directory,{recursive:true,force:true});});
 const provider=await createProvider({...hre.config,networks:{...hre.config.networks,hardhat:network}},'hardhat');
 const genesis=await provider.request({method:'eth_getBlockByNumber',params:['0x0',false]});
 const manifest={schema:'iilas-durable-chain-1.0',chainId:31337,initialDate:network.initialDate,configurationSha256:hash(canonicalNetwork(network)),genesis};
 const engine=await createDurableChain({provider,directory:join(state,'journal'),manifest,clock:()=>genesisSeconds*1000+10000});
 const raw=await wallet.signTransaction({type:2,chainId:31337,nonce:0,gasLimit:16777216,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,value:0,data:artifact.bytecode});
 const deploymentTransactionHash=await engine.request({method:'eth_sendRawTransaction',params:[raw]});
 const receipt=await engine.request({method:'eth_getTransactionReceipt',params:[deploymentTransactionHash]});
 const deployment=await engine.request({method:'eth_getBlockByNumber',params:[receipt.blockNumber,false]});
 const code=await engine.request({method:'eth_getCode',params:[receipt.contractAddress,'latest']});await engine.close();
 const runtimePins=Object.fromEntries(await Promise.all(['chain-worker.mjs','hardhat-provider.mjs','durable-chain.mjs','restart-state.mjs','windows-ownership.mjs'].map(async name=>{const path=join(import.meta.dirname,name);return [path,hash(await readFile(path))];})));
 const config={stateId:randomUUID(),manifest,chain:{chainId:31337,address:receipt.contractAddress,deploymentTransactionHash,deploymentBlock:1,runtimeCodeSha256:hash(Buffer.from(code.slice(2),'hex'))},chainIdentity:{genesisBlockHash:genesis.hash,deploymentBlockHash:deployment.hash},runtimePins};
 await publishJson(join(state,'runtime.private.json'),config,{exclusive:true});
 return {directory,state,config,children,port:await freePort()};
}
async function launch(f){
 const child=spawn(process.execPath,[worker,'--app',app,'--state',f.state,'--port',String(f.port)],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env}});
 child.logs='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{child.logs+=chunk.toString();});
 child.finished=once(child,'exit');await once(child,'spawn');child.ownedState=f.state;child.ownedPort=f.port;f.children.push(child);
 const observed=JSON.parse(powershell(`$p=Get-Process -Id ${child.pid} -ErrorAction Stop;[pscustomobject]@{pid=$p.Id;startTicks=$p.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress`));
 child.ownedStartTicks=observed.startTicks;return child;
}
async function forceStop(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 assert.ok(child.ownedStartTicks&&child.ownedState&&child.pid);
 // Validate both the exact process incarnation and this test's unique arguments immediately before stopping it.
 powershell(`$p=Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue;if($null -eq $p){return};if($p.StartTime.ToUniversalTime().Ticks.ToString() -ne ${quote(child.ownedStartTicks)}){throw 'Test worker identity changed'};$c=Get-CimInstance Win32_Process -Filter ${quote('ProcessId='+child.pid)} -ErrorAction Stop;if(-not $c.CommandLine.Contains(${quote(worker)}) -or -not $c.CommandLine.Contains(${quote(child.ownedState)}) -or -not $c.CommandLine.Contains(${quote('--port '+child.ownedPort)})){throw 'Test worker arguments changed'};Stop-Process -Id ${child.pid} -Force -ErrorAction Stop`);
 await child.finished;
}
async function ready(f,child){
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){
  if(child.exitCode!==null||child.signalCode!==null)assert.fail('Worker exited before readiness: '+child.logs.trim());
  try{const response=await fetch(`http://127.0.0.1:${f.port}/health`,{signal:AbortSignal.timeout(1500)});if(response.ok){const health=await response.json();if(health.ready)return health;}}catch{}
  await delay(100);
 }
 assert.fail('Worker did not become ready: '+child.logs.trim());
}
let rpcId=0;
async function rpc(f,method,params=[]){
 const response=await fetch(`http://127.0.0.1:${f.port}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}),signal:AbortSignal.timeout(5000)});
 assert.equal(response.status,200);const reply=await response.json();assert.equal(reply.error,undefined,'Worker RPC refused '+method);return reply.result;
}
async function journalPins(state){const directory=join(state,'journal');return Object.fromEntries(await Promise.all((await readdir(directory)).sort().map(async name=>[name,hash(await readFile(join(directory,name)))])));}

test('real worker survives abrupt owned-process termination with exact registration history and no duplicate block', {timeout:60000},async t=>{
 const f=await fixture(t),first=await launch(f),initial=await ready(f,first);assert.equal(initial.stateId,f.config.stateId);
 const reference='0x'+'ab'.repeat(32),digest='0x'+'cd'.repeat(32);
 const raw=await wallet.signTransaction({type:2,chainId:31337,nonce:1,gasLimit:100000,maxPriorityFeePerGas:1000000000,maxFeePerGas:3000000000,to:f.config.chain.address,value:0,data:abi.encodeFunctionData('register',[reference,digest])});
 const transaction=await rpc(f,'eth_sendRawTransaction',[raw]),receipt=await rpc(f,'eth_getTransactionReceipt',[transaction]),block=await rpc(f,'eth_getBlockByNumber',[receipt.blockNumber,false]);
 const filter={address:f.config.chain.address,fromBlock:'0x0',toBlock:'latest'},logs=await rpc(f,'eth_getLogs',[filter]);
 assert.equal(receipt.status,'0x1');assert.equal(receipt.blockNumber,'0x2');assert.equal(logs.length,1);assert.equal(abi.parseLog(logs[0]).name,'Registered');
 assert.equal(await rpc(f,'eth_call',[{to:f.config.chain.address,data:abi.encodeFunctionData('lookup',[reference])},'latest']),digest);
 const before=await journalPins(f.state);await forceStop(first);
 const second=await launch(f),restored=await ready(f,second);assert.equal(restored.stateId,initial.stateId);assert.notEqual(restored.instanceId,initial.instanceId);assert.equal(restored.head.blockHash,block.hash);
 assert.deepEqual(await rpc(f,'eth_getTransactionReceipt',[transaction]),receipt);assert.deepEqual(await rpc(f,'eth_getBlockByNumber',[receipt.blockNumber,false]),block);assert.deepEqual(await rpc(f,'eth_getLogs',[filter]),logs);
 assert.equal(await rpc(f,'eth_call',[{to:f.config.chain.address,data:abi.encodeFunctionData('lookup',[reference])},'latest']),digest);
 assert.deepEqual(await journalPins(f.state),before);assert.equal(await rpc(f,'eth_sendRawTransaction',[raw]),transaction);assert.equal(await rpc(f,'eth_blockNumber'),'0x2');assert.deepEqual(await journalPins(f.state),before);
 await forceStop(second);
});

test('real worker refuses a changed runtime manifest without changing saved journal history', {timeout:30000},async t=>{
 const f=await fixture(t),before=await journalPins(f.state);f.config.manifest.genesis.hash='0x'+'ff'.repeat(32);await publishJson(join(f.state,'runtime.private.json'),f.config);
 const child=await launch(f);const [code]=await Promise.race([child.finished,delay(20000,undefined,{ref:false}).then(()=>{throw Error('Changed manifest worker did not exit');})]);assert.equal(code,1);assert.match(child.logs,/startup refused/);assert.deepEqual(await journalPins(f.state),before);
 await assert.rejects(fetch(`http://127.0.0.1:${f.port}/health`,{signal:AbortSignal.timeout(1000)}));
});
