import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {completionExact,completionCanonical,completionUUID} from './completionWorkflow.js';
import {hybridHash} from './hybridSigning.mjs';
import {readHybridRuntime} from './hybridModelBinding.mjs';
import {trustedDemoEnvironment} from './demoEnvironment.mjs';
import {createHybridTransport} from './hybridGateway.mjs';
const context=new AsyncLocalStorage(),fail=()=>{throw Error('The pinned MSI deployment is unavailable.');};
export function validateHybridChainBinding(raw){
 const c=completionExact(raw,['rpcUrl','chainId','address','deploymentBlock','deploymentTransactionHash','runtimeCodeSha256','deploymentGeneration']);
 if(c.rpcUrl!=='http://127.0.0.1:8545'||c.chainId!==31337||!/^0x[a-fA-F0-9]{40}$/.test(c.address)||!Number.isSafeInteger(c.deploymentBlock)||c.deploymentBlock<0||!/^0x[a-f0-9]{64}$/.test(c.deploymentTransactionHash)||!/^[a-f0-9]{64}$/.test(c.runtimeCodeSha256))fail();completionUUID(c.deploymentGeneration);return c;
}
export const hybridChainHash=raw=>hybridHash(completionCanonical(validateHybridChainBinding(raw)));
export function withHybridIntegrityContext(value,work){const c=completionExact(value,['actor','scope']);return context.run(c,work);}
export function createHybridIntegrityRPC({transport,binding}){
 const checked=validateHybridChainBinding(binding);
 const call=async(operation,c,payload)=>{
  if(hybridChainHash(c)!==hybridChainHash(checked))fail();const current=context.getStore();if(!current)fail();
  // Chain observations must be fresh across phases/retries; unlike inference they do not mutate anything.
  return transport.call({operation,...current,requestId:randomUUID(),operationExpiresAtMs:Date.now()+15000,bindingSha256:hybridChainHash(checked),payload});
 };
 const source=s=>({referenceHash:s.referenceHash,digest:s.digest});
 return {inspect:c=>call('chain.inspect',c,{}),lookup:(c,s)=>call('chain.lookup',c,{source:source(s)}),receipt:(c,transactionHash,s)=>call('chain.receipt',c,{transactionHash,source:source(s)}),events:(c,s,fromBlock,toBlock)=>call('chain.events',c,{source:source(s),fromBlock,toBlock})};
}
export function cloudIntegrityRPC(){
 const raw=readHybridRuntime(),environment=trustedDemoEnvironment();
 return createHybridIntegrityRPC({binding:raw.chainBinding,transport:createHybridTransport({profile:{environment,gatewayOrigin:raw.gatewayOrigin},secret:process.env.IILAS_GATEWAY_SECRET})});
}
