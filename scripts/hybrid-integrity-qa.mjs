import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createIntegrityHandlers} from '../tools/msi-gateway/integrity.mjs';
import {createHybridIntegrityRPC,validateHybridChainBinding,hybridChainHash,withHybridIntegrityContext} from '../backend/functions/hybridIntegrity.mjs';
import {assertHybridActionAllowed} from '../backend/functions/hybridGateway.mjs';
import {createIntegrityWallet} from '../lib/integrityRegistrationClient.js';
const binding=()=>({rpcUrl:'http://127.0.0.1:8545',chainId:31337,address:'0x'+'1'.repeat(40),deploymentBlock:1,deploymentTransactionHash:'0x'+'2'.repeat(64),runtimeCodeSha256:'3'.repeat(64),deploymentGeneration:'00000000-0000-4000-8000-000000000001'});
const processIdentity={pid:1234,startTicks:'638971200000000000'},source={referenceHash:'4'.repeat(64),digest:'5'.repeat(64)};
function fixture(){const c=binding();let process=processIdentity,observations=0;const rpc={inspect:async()=>{observations++;return {chainId:31337,runtimeCodeSha256:c.runtimeCodeSha256,deploymentTransactionHash:c.deploymentTransactionHash,blockNumber:2,authorisedWallet:'0x'+'6'.repeat(40)};},lookup:async()=>source.digest,receipt:async()=>null,events:async()=>[]};const handlers=createIntegrityHandlers({configuration:()=>({chain:c,processIdentity}),observeProcess:()=>process,rpc});return {c,handlers,rpc,changeProcess:v=>{process=v;},count:()=>observations};}
test('RPC method URL and event range cannot be chosen',async()=>{
 const f=fixture(),context={envelope:{bindingSha256:hybridChainHash(f.c)}};
 assert.equal((await f.handlers['chain.inspect']({},context)).deploymentGeneration,f.c.deploymentGeneration);
 await assert.rejects(()=>f.handlers['chain.inspect']({rpcUrl:'http://example.com'},context));
 await assert.rejects(()=>f.handlers['chain.events']({source,fromBlock:0,toBlock:256},context));
 await assert.rejects(()=>f.handlers['chain.lookup']({source:{...source,method:'eth_sendTransaction'}},context));
 assert.throws(()=>validateHybridChainBinding({...f.c,rpcUrl:'http://192.168.1.1:8545'}));
});
test('same address but new node process or generation cannot verify old binding',async()=>{
 const f=fixture(),context={envelope:{bindingSha256:hybridChainHash(f.c)}};
 f.changeProcess({...processIdentity,startTicks:'638971200000000001'});await assert.rejects(()=>f.handlers['chain.inspect']({},context));
 f.changeProcess(processIdentity);f.c.deploymentGeneration=randomUUID();await assert.rejects(()=>f.handlers['chain.inspect']({},context));
});
test('cloud RPC context carries the actual actor scope and fresh bounded observations',async()=>{
 const c=binding(),sent=[],transport={call:async q=>{sent.push(q);return {chainId:31337};}},rpc=createHybridIntegrityRPC({transport,binding:c});
 await withHybridIntegrityContext({actor:'admin',scope:'scope'},async()=>{await rpc.inspect(c);await rpc.inspect(c);});
 assert.equal(sent[0].actor,'admin');assert.equal(sent[0].scope,'scope');assert.notEqual(sent[0].requestId,sent[1].requestId);
 await assert.rejects(()=>rpc.inspect(c));
 await withHybridIntegrityContext({actor:'admin',scope:'scope'},async()=>assert.rejects(()=>rpc.inspect({...c,deploymentGeneration:randomUUID()})));
});
test('late chain response after process replacement is refused',async()=>{
 const f=fixture();f.rpc.lookup=async()=>{f.changeProcess({...processIdentity,pid:5678});return source.digest;};
 await assert.rejects(()=>f.handlers['chain.lookup']({source},{envelope:{bindingSha256:hybridChainHash(f.c)}}));
});
test('remote browser without MSI deployment proof cannot sign',async()=>{
 assert.equal(createIntegrityWallet(null,{requireDeploymentProof:true}),null);
 let signed=false;const wallet=createIntegrityWallet({request:async({method})=>{if(method==='eth_chainId')return '0x7a69';if(method==='eth_accounts'||method==='eth_requestAccounts')return ['0x'+'6'.repeat(40)];if(method==='eth_sendTransaction')signed=true;return null;}},{requireDeploymentProof:true});
 await assert.rejects(()=>wallet.sign({chainId:31337,authorisedWallet:'0x'+'6'.repeat(40),contract:binding().address,referenceHash:source.referenceHash,digest:source.digest,deploymentGeneration:binding().deploymentGeneration,deploymentTransactionHash:binding().deploymentTransactionHash,runtimeCodeSha256:binding().runtimeCodeSha256}));assert.equal(signed,false);
});
test('legacy integrity cannot bypass pinned claims or manual signing',()=>{
 for(const action of ['prepareVerification','registerVerification'])assert.throws(()=>assertHybridActionAllowed(action,'cloud-demo'));
 assert.doesNotThrow(()=>assertHybridActionAllowed('checkIntegrityRecord','cloud-demo'));
});
