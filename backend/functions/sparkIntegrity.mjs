import {createIntegrityHandlers} from '../../tools/msi-gateway/integrity.mjs';
import {hybridChainHash,validateHybridChainBinding} from './hybridIntegrity.mjs';
import {localIntegrityRPC} from './integrityWorkflow.mjs';
import {trustedSparkServing} from './sparkRuntime.mjs';
export const sparkIntegrityConfiguration=()=>validateHybridChainBinding(trustedSparkServing().chainBinding);
export function createSparkIntegrityRPC({configuration=()=>{const s=trustedSparkServing();return {chain:s.chainBinding,processIdentity:s.chainProcessIdentity};},rpc=localIntegrityRPC,observeProcess}={}){
 const handlers=createIntegrityHandlers({configuration,rpc,...(observeProcess?{observeProcess}:{})});
 const call=(method,c,payload)=>handlers['chain.'+method](payload,{envelope:{bindingSha256:hybridChainHash(c)}}),source=s=>({referenceHash:s.referenceHash,digest:s.digest});
 return {inspect:c=>call('inspect',c,{}),lookup:(c,s)=>call('lookup',c,{source:source(s)}),receipt:(c,transactionHash,s)=>call('receipt',c,{transactionHash,source:source(s)}),events:(c,s,fromBlock,toBlock)=>call('events',c,{source:source(s),fromBlock,toBlock})};
}
