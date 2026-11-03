import {execFileSync} from 'node:child_process';
import {completionExact,completionCanonical} from '../../lib/completionWorkflow.js';
import {hybridChainHash,validateHybridChainBinding} from '../../backend/functions/hybridIntegrity.mjs';
const fail=()=>{throw Error('The pinned MSI deployment is unavailable.');};
export function observeLocalChainProcess(){
 if(process.platform!=='win32')fail();
 // Fixed code only. No user-controlled script, path, PID or RPC endpoint interpolation.
 const script="$taskConnections=@(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 8545 -ErrorAction Stop); if($taskConnections.Count -ne 1){throw 'Chain listener unavailable'}; $taskProcess=Get-Process -Id $taskConnections[0].OwningProcess -ErrorAction Stop; [pscustomobject]@{pid=$taskProcess.Id;startTicks=$taskProcess.StartTime.ToUniversalTime().Ticks.ToString()} | ConvertTo-Json -Compress";
 const value=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:8000,windowsHide:true,stdio:['ignore','pipe','pipe']});return JSON.parse(value);
}
export function createIntegrityHandlers({configuration,rpc,observeProcess=observeLocalChainProcess}){
 function verify(envelope){
  const {chain,processIdentity}=configuration(),c=validateHybridChainBinding(chain),identity=completionExact(processIdentity,['pid','startTicks']);
  if(!Number.isSafeInteger(identity.pid)||identity.pid<1||!/^\d{17,19}$/.test(identity.startTicks)||envelope.bindingSha256!==hybridChainHash(c)||completionCanonical(observeProcess())!==completionCanonical(identity))fail();return c;
 }
 function source(raw){const s=completionExact(raw,['referenceHash','digest']);if(![s.referenceHash,s.digest].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)))fail();return s;}
 function handler(operation){return async(raw,{envelope})=>{
  const c=verify(envelope);let value;
  if(operation==='inspect'){
   completionExact(raw,[]);const info=await rpc.inspect(c);
   if(info.chainId!==c.chainId||info.runtimeCodeSha256!==c.runtimeCodeSha256||info.deploymentTransactionHash!==c.deploymentTransactionHash||!Number.isSafeInteger(info.blockNumber)||info.blockNumber<c.deploymentBlock)fail();value={...info,deploymentGeneration:c.deploymentGeneration};
  }else if(operation==='lookup'){const p=completionExact(raw,['source']);value=await rpc.lookup(c,source(p.source));}
  else if(operation==='receipt'){const p=completionExact(raw,['source','transactionHash']);if(!/^0x[a-f0-9]{64}$/.test(p.transactionHash))fail();value=await rpc.receipt(c,p.transactionHash,source(p.source));}
  else{const p=completionExact(raw,['source','fromBlock','toBlock']);if(!Number.isSafeInteger(p.fromBlock)||!Number.isSafeInteger(p.toBlock)||p.fromBlock<0||p.toBlock<p.fromBlock||p.toBlock-p.fromBlock>255)fail();value=await rpc.events(c,source(p.source),p.fromBlock,p.toBlock);if(!Array.isArray(value)||value.length>256)fail();}
  if(hybridChainHash(verify(envelope))!==hybridChainHash(c))fail();return value;
 };}
 return {'chain.inspect':handler('inspect'),'chain.lookup':handler('lookup'),'chain.receipt':handler('receipt'),'chain.events':handler('events')};
}
