import {Interface} from 'ethers';
import {completionExact,completionCanonical,completionIdentifier,validateCompletionOutcome} from './completionWorkflow.js';
import {validateIntegrityInput} from './integrityWorkflow.js';
const hashPattern=/^0x[0-9a-f]{64}$/,hex=/^[a-f0-9]{64}$/,address=/^0x[0-9a-fA-F]{40}$/;
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function observe(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No confirmed response within 35 seconds. Recover the same saved registration.')),35000);})]);}finally{clearTimeout(timer);}}
export function createIntegrityWallet(provider,{requireDeploymentProof=false}={}){
 if(!provider||typeof provider.request!=='function')return null;
 async function verify(prepared,requestAccounts=false){
  const network=await provider.request({method:'eth_chainId'});if(typeof network!=='string'||!/^0x[0-9a-f]+$/i.test(network)||BigInt(network)!==31337n||prepared.chainId!==31337)throw Error('Switch your wallet to local chain 31337.');
  const accounts=await provider.request({method:requestAccounts?'eth_requestAccounts':'eth_accounts'});
  if(!Array.isArray(accounts)||typeof accounts[0]!=='string'||accounts[0].toLowerCase()!==prepared.authorisedWallet.toLowerCase())throw Error('Select the authorised local registry wallet account.');
  if(requireDeploymentProof){
   if(!hashPattern.test(prepared.deploymentTransactionHash||'')||!hex.test(prepared.runtimeCodeSha256||'')||!prepared.deploymentGeneration)throw Error('Complete signing on MSI with its current deployment profile.');
   const receipt=await provider.request({method:'eth_getTransactionReceipt',params:[prepared.deploymentTransactionHash]}),code=await provider.request({method:'eth_getCode',params:[prepared.contract,'latest']});
   if(!receipt||receipt.status!=='0x1'||receipt.transactionHash!==prepared.deploymentTransactionHash||receipt.contractAddress?.toLowerCase()!==prepared.contract.toLowerCase()||typeof code!=='string'||!/^0x(?:[a-fA-F0-9]{2})+$/.test(code)||code.length>131074)throw Error('The wallet is not connected to the pinned MSI deployment.');
   const bytes=Uint8Array.from(code.slice(2).match(/../g),v=>parseInt(v,16)),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
   if(digest!==prepared.runtimeCodeSha256)throw Error('The wallet deployment differs from MSI.');
  }
  return accounts[0];
 }
 return {verify:p=>verify(p,true),sign:async prepared=>{
  const from=await verify(prepared);if(!address.test(prepared.contract)||!hex.test(prepared.referenceHash)||!hex.test(prepared.digest))throw Error('Prepared local contract data is unavailable.');
  const data=new Interface(['function register(bytes32,bytes32)']).encodeFunctionData('register',['0x'+prepared.referenceHash,'0x'+prepared.digest]);
  const hash=await provider.request({method:'eth_sendTransaction',params:[{from,to:prepared.contract,data}]});if(!hashPattern.test(hash))throw Error('The wallet did not confirm a transaction hash. Resolve the saved registration.');return hash;
 }};
}
function preparedShape(value,input){
 const p=completionExact(value,['state','operationId','kind','recordId','digest','referenceHash','canonical','sourceVersion','chainId','contract','authorisedWallet','startingBlock','expiresAtMs','transactionHash','reason'],['deploymentGeneration','deploymentTransactionHash','runtimeCodeSha256']);
 if(['deploymentGeneration','deploymentTransactionHash','runtimeCodeSha256'].some(k=>Object.hasOwn(p,k))&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.deploymentGeneration||'')||!hashPattern.test(p.deploymentTransactionHash||'')||!hex.test(p.runtimeCodeSha256||'')))throw Error('The prepared deployment proof is incomplete.');
 if(!['Prepared','Pending'].includes(p.state)||p.operationId!==input.operationId||p.kind!==input.kind||p.recordId!==input.recordId||!hex.test(p.digest)||!hex.test(p.referenceHash)||typeof p.canonical!=='string'||p.canonical.length>32768||p.chainId!==31337||!address.test(p.contract)||!address.test(p.authorisedWallet)||!Number.isSafeInteger(p.sourceVersion)||p.sourceVersion<1||!Number.isSafeInteger(p.startingBlock)||p.startingBlock<0||!Number.isSafeInteger(p.expiresAtMs)||p.expiresAtMs<0||p.transactionHash!==null&&!hashPattern.test(p.transactionHash)||p.reason!==null&&(typeof p.reason!=='string'||p.reason.length>100))throw Error('Prepared registration does not match its saved source.');return p;
}
export function createIntegrityRegistrationClient({storage,context,command,isCurrent,wallet}){
 for(const k of ['uid','scope','tab'])completionIdentifier(context?.[k]);if(!storage||typeof command!=='function'||typeof isCurrent!=='function')throw Error('A current integrity account context is required.');
 const key=`iilas.completion.${context.scope}.${context.uid}.${context.tab}.integrityRegistration`;let active=true,epoch=0,inFlight=false;
 const current=()=>{if(!active)throw Error('The original registration view closed. Recover its saved intent.');if(!isCurrent())throw Error('The active account changed. Recover in the original account.');};
 function read(){
  const raw=storage.getItem(key);if(raw===null||raw===undefined)return null;
  try{
   const saved=completionExact(JSON.parse(raw),['input','phase','prepared','transactionHash']);validateIntegrityInput(saved.input);
   if(!['New','Prepared','Signing','Submitted'].includes(saved.phase))throw Error('phase');
   if(saved.phase==='New'){if(saved.prepared!==null||saved.transactionHash!==null)throw Error('new');}
   else {preparedShape(saved.prepared,saved.input);if(saved.phase==='Submitted'?!hashPattern.test(saved.transactionHash):saved.transactionHash!==null)throw Error('hash');}
   return saved;
  }catch{throw Error('Saved registration needs administrator reconciliation. Keep the saved data.');}
 }
 function write(saved){storage.setItem(key,JSON.stringify(saved));if(completionCanonical(read())!==completionCanonical(saved))throw Error('The registration intent could not be saved.');}
 function unchanged(saved){const latest=read();if(!latest||completionCanonical(latest)!==completionCanonical(saved))throw Error('The saved registration changed. Recover its original intent.');}
 async function verifyPrepared(p,input){preparedShape(p,input);if(await sha(p.canonical)!==p.digest||await sha(`${context.scope}:${input.kind}:${input.recordId}`)!==p.referenceHash)throw Error('The prepared source hashes could not be verified.');}
 async function execute(mode,newInput){
  current();if(inFlight)throw Error('A registration request is already running.');let saved=read();
  if(mode==='start'){
   if(saved)throw Error('Recover the saved registration before starting another.');const clean=completionExact(newInput,['kind','recordId']);saved={input:validateIntegrityInput({...clean,operationId:crypto.randomUUID()}),phase:'New',prepared:null,transactionHash:null};write(saved);
  }
  if(!saved)throw Error('No saved registration to recover.');const started=epoch;inFlight=true;
  const fence=()=>{if(started!==epoch)throw Error('The original registration view changed. Recover its saved intent.');current();};
  async function accept(value,sent){
   fence();unchanged(sent);
   if(value?.state==='Completed'||value?.state==='Cancelled'){
    const result=validateCompletionOutcome(value,{action:'registerIntegrityTransaction',input:sent.input});
    if(result.state==='Completed'&&(result.recordId!==await sha(`${context.scope}:${sent.input.kind}:${sent.input.recordId}`)||result.version!==1))throw Error('The registration outcome belongs to a different source.');
    fence();unchanged(sent);storage.removeItem(key);return result;
   }
   await verifyPrepared(value,sent.input);fence();unchanged(sent);
   if(sent.transactionHash&&value.transactionHash!==sent.transactionHash)throw Error('The original transaction identity changed.');
   saved={input:sent.input,phase:value.transactionHash?'Submitted':value.state==='Prepared'?'Prepared':'Signing',prepared:value,transactionHash:value.transactionHash};write(saved);return value;
  }
  try{
   if(mode==='resolve'||saved.phase==='Signing')return accept(await observe(command('resolveIntegrityRegistration',saved.input)),saved);
   if(saved.phase==='New'){
    if(!wallet)throw Error('Connect a compatible local Ethereum wallet, then retry the saved registration.');
    const value=await observe(command('prepareIntegrityRegistration',saved.input)),outcome=await accept(value,saved);if(outcome.state!=='Prepared')return outcome;
   }
   if(saved.phase==='Prepared'){
    if(Date.now()>saved.prepared.expiresAtMs)throw Error('The signing claim expired. Check the saved registration outcome before any further signature.');
    if(!wallet)throw Error('Connect a compatible local Ethereum wallet.');await verifyPrepared(saved.prepared,saved.input);await observe(wallet.verify(saved.prepared));fence();unchanged(saved);
    saved={...saved,phase:'Signing'};write(saved);const signing=saved,raw=storage.getItem(key);
    const promise=Promise.resolve().then(()=>wallet.sign(signing.prepared)).then(hash=>{
     if(!hashPattern.test(hash))throw Error('The wallet did not confirm a transaction hash. Resolve this registration.');
     // A broadcast hash is useful even if its view closed. Enrich only the exact
     // unchanged original slot; never clear it or send a new backend action here.
     if(storage.getItem(key)!==raw)throw Error('Saved signing intent changed. Resolve the original operation.');
     const submitted={...signing,phase:'Submitted',transactionHash:hash};write(submitted);return submitted;
    });
    saved=await observe(promise);fence();unchanged(saved);
   }
   if(saved.phase==='Submitted'){const sent=saved;return accept(await observe(command('registerIntegrityTransaction',{...sent.input,transactionHash:sent.transactionHash})),sent);}
   throw Error('Resolve the original saved registration before signing again.');
  }finally{inFlight=false;}
 }
 return {pending:()=>{current();return read();},start:input=>execute('start',input),retry:()=>execute('retry'),resolve:()=>execute('resolve'),activate:()=>{active=true;epoch++;},dispose:()=>{active=false;epoch++;}};
}
