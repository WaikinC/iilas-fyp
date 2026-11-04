import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {sparkIntegrityConfiguration,createSparkIntegrityRPC} from './sparkIntegrity.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {approvedTransaction,ROLES} from './access.mjs';
import {assertCompletionLocal,runCompletionOperation} from './completionOperations.mjs';
import {completionCanonical,completionExact,validateCompletionOutcome} from './completionWorkflow.js';
import {validateIntegrityInput,validateIntegrityReview,INTEGRITY_PROTOCOL} from './integrityWorkflow.js';
import {captureIntegritySource,integrityFiles} from './integritySource.mjs';
import {cloudIntegrityRPC,validateHybridChainBinding} from './hybridIntegrity.mjs';
import {readHybridRuntime} from './hybridModelBinding.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),stamp=()=>FieldValue.serverTimestamp();
const fail=(message,code='failed-precondition')=>{throw Object.assign(Error(message),{code});};
const roles=['Admin','Manager'],hex=/^[a-f0-9]{64}$/,address=/^0x[0-9a-fA-F]{40}$/;
const ref=(kind,id)=>getFirestore().collection(kind).doc(id);
const baseInput=data=>({operationId:data.operationId,kind:data.kind,recordId:data.recordId});
const key=(scope,actor,action,input)=>sha(completionCanonical({scope,actor,action,operationId:input.operationId}));
async function deadline(work){let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Local integrity IO exceeded 15 seconds.')),15000);})]);}finally{clearTimeout(timer);}}
async function safeIO(work,message){try{return await deadline(work);}catch{fail(message,'unavailable');}}
export function integrityConfiguration(){if(['spark-msi','spark-loopback-test'].includes(process.env.IILAS_DEMO_MODE))return sparkIntegrityConfiguration();if(process.env.IILAS_DEMO_MODE==='cloud-demo')return validateHybridChainBinding(readHybridRuntime().chainBinding);return {
 rpcUrl:process.env.IILAS_RPC_URL,chainId:Number(process.env.IILAS_CHAIN_ID),address:process.env.IILAS_REGISTRY_ADDRESS,
 deploymentBlock:Number(process.env.IILAS_REGISTRY_DEPLOYMENT_BLOCK),deploymentTransactionHash:process.env.IILAS_REGISTRY_DEPLOYMENT_TRANSACTION,
 runtimeCodeSha256:process.env.IILAS_REGISTRY_CODE_SHA256,
};}
function validConfiguration(value){
 if(['cloud-demo','spark-msi','spark-loopback-test'].includes(process.env.IILAS_DEMO_MODE))return validateHybridChainBinding(value);
 const c=completionExact(value,['rpcUrl','chainId','address','deploymentBlock','deploymentTransactionHash','runtimeCodeSha256']);
 if(c.rpcUrl!=='http://127.0.0.1:8545'||c.chainId!==31337||!address.test(c.address)||!Number.isSafeInteger(c.deploymentBlock)||c.deploymentBlock<0||!/^0x[0-9a-f]{64}$/.test(c.deploymentTransactionHash)||!hex.test(c.runtimeCodeSha256))fail('A pinned local integrity deployment is required.','unavailable');return c;
}
const configHash=c=>sha(completionCanonical(c));
const abi=['function lookup(bytes32) view returns (bytes32)','function administrator() view returns(address)','function registrars(address) view returns(bool)','event Registered(bytes32 indexed referenceHash, bytes32 digest, address indexed actor)'];
async function providerCall(config,work){
 const {JsonRpcProvider,FetchRequest,Contract,Interface}=await import('ethers'),request=new FetchRequest(config.rpcUrl);request.timeout=15000;
 const provider=new JsonRpcProvider(request,undefined,{batchMaxCount:1});
 try{return await work(provider,new Contract(config.address,abi,provider),new Interface(abi));}finally{provider.destroy();}
}
const without0x=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v)?v.slice(2):null;
export const localIntegrityRPC={
 inspect:config=>providerCall(config,async(p,contract)=>{
  const [chainId,code,blockNumber,deployment,wallet]=await Promise.all([p.send('eth_chainId',[]),p.getCode(config.address),p.getBlockNumber(),p.getTransactionReceipt(config.deploymentTransactionHash),contract.administrator()]);
  if(!deployment||deployment.status!==1||deployment.contractAddress?.toLowerCase()!==config.address.toLowerCase()||deployment.blockNumber!==config.deploymentBlock||!await contract.registrars(wallet))throw Error('Local deployment identity differs.');
  return {chainId:Number(BigInt(chainId)),runtimeCodeSha256:sha(Buffer.from(code.slice(2),'hex')),blockNumber,authorisedWallet:wallet,deploymentTransactionHash:deployment.hash};
 }),
 lookup:(config,source)=>providerCall(config,async(_p,c)=>{const value=without0x(await c.lookup('0x'+source.referenceHash));return value==='0'.repeat(64)?null:value;}),
 receipt:(config,hash,source)=>providerCall(config,async(p,_c,iface)=>{
  const r=await p.getTransactionReceipt(hash);if(!r)return null;
  const events=r.logs.filter(l=>l.address.toLowerCase()===config.address.toLowerCase()).map(l=>{try{return iface.parseLog(l);}catch{return null;}}).filter(e=>e?.name==='Registered'&&without0x(e.args.referenceHash)===source.referenceHash);
  const e=events.length===1?events[0]:null;return {transactionHash:r.hash,status:r.status,to:r.to,from:r.from,blockNumber:r.blockNumber,referenceHash:without0x(e?.args.referenceHash),digest:without0x(e?.args.digest)};
 }),
 events:(config,source,fromBlock,toBlock)=>providerCall(config,async(p,_c,iface)=>{
  const logs=await p.getLogs({address:config.address,fromBlock,toBlock,topics:[iface.getEvent('Registered').topicHash,'0x'+source.referenceHash]});
  return logs.map(l=>{const e=iface.parseLog(l);return {transactionHash:l.transactionHash,digest:without0x(e.args.digest),referenceHash:without0x(e.args.referenceHash),actor:e.args.actor,blockNumber:l.blockNumber};});
 }),
};
const defaultRPC=Object.fromEntries(['inspect','lookup','receipt','events'].map(method=>[method,(...args)=>(process.env.IILAS_DEMO_MODE==='cloud-demo'?cloudIntegrityRPC():['spark-msi','spark-loopback-test'].includes(process.env.IILAS_DEMO_MODE)?createSparkIntegrityRPC():localIntegrityRPC)[method](...args)]));
export const integrityReaderRPC=defaultRPC,checkIntegrityConfiguration=validConfiguration;
export function createIntegrityCommands({rpc=defaultRPC,clock=Date.now,configuration=integrityConfiguration,files=integrityFiles}={}){
 const configured=()=>validConfiguration(configuration());
 const sameConfig=c=>{try{return configHash(configured())===configHash(c);}catch{return false;}};
 async function registrationSnapshot(tx,scope,source){
  const row=await tx.get(ref('verificationRecords',source.referenceHash));if(!row.exists)return null;const value=row.data();let chain=null;
  try{if(value.ownerId!==scope||value.kind!==source.snapshot.kind||value.recordId!==source.snapshot.recordId||value.referenceHash!==source.referenceHash)throw Error('Registration identity differs');chain=value.chain?.deploymentGeneration?validateHybridChainBinding(value.chain):validConfiguration(value.chain);}catch{/* Incomplete historical identity cannot authorise a different deployment. */}
  // Firestore Timestamp values expose a stable JSON representation, but are
  // intentionally rejected by the plain-input canonicaliser itself.
  return {sha256:sha(completionCanonical(JSON.parse(JSON.stringify(value)))),chain};
 }
 async function access(auth,scope,work){assertCompletionLocal();return approvedTransaction(auth,ROLES,async(tx,c,member)=>{if(c.dataScopeId!==scope)fail('The integrity data scope cannot be changed.','permission-denied');return work(tx,member);});}
 function requireRole(member){if(!roles.includes(member.role))fail('An Admin or Manager is required.','permission-denied');}
 function requestIdentity(saved,auth,scope,action,input){if(saved.actor!==auth.uid||saved.ownerId!==scope||saved.action!==action||saved.commandHash!==sha(completionCanonical(input))||completionCanonical(saved.input)!==completionCanonical(input))fail('The saved integrity operation belongs to different input.');}
 function terminal(saved,action,input){return {...validateCompletionOutcome(saved.result,{action,input}),replayed:true};}
 const result=(state,action,input,id=null)=>({state,operationId:input.operationId,action,recordId:id,version:id?1:null,replayed:false});
 const requestRecord=(auth,scope,action,input)=>({ownerId:scope,actor:auth.uid,action,input,commandHash:sha(completionCanonical(input)),createdAt:stamp(),version:1});
 function view(saved){return {state:saved.phase==='Prepared'?'Prepared':'Pending',operationId:saved.input.operationId,kind:saved.input.kind,recordId:saved.input.recordId,digest:saved.source.digest,referenceHash:saved.source.referenceHash,canonical:saved.source.canonical,sourceVersion:saved.source.snapshot.sourceVersion,chainId:saved.chain.chainId,contract:saved.chain.address,authorisedWallet:saved.wallet,startingBlock:saved.startingBlock,expiresAtMs:saved.expiresAtMs,transactionHash:saved.transactionHash??null,reason:saved.reason??null,...(saved.chain.deploymentGeneration?{deploymentGeneration:saved.chain.deploymentGeneration,deploymentTransactionHash:saved.chain.deploymentTransactionHash,runtimeCodeSha256:saved.chain.runtimeCodeSha256}:{})};}
 async function inspect(c){const info=await rpc.inspect(c);if(info.chainId!==31337||info.runtimeCodeSha256!==c.runtimeCodeSha256||info.deploymentTransactionHash!==c.deploymentTransactionHash||c.deploymentGeneration&&info.deploymentGeneration!==c.deploymentGeneration||!Number.isSafeInteger(info.blockNumber)||info.blockNumber<c.deploymentBlock||!address.test(info.authorisedWallet))throw Error('Local deployment identity differs.');return info;}
 async function fileObservation(source){if(source.snapshot.kind!=='delivery')return null;return files.digest(source);}
 function matchesFile(source,file){return !file||file.sha256===source.snapshot.file.sha256&&file.bytes===source.snapshot.file.bytes;}
 function matchesSource(a,b){return completionCanonical(a)===completionCanonical(b);}
 async function prepareIntegrityRegistration(auth,scope,value){
  const input=validateIntegrityInput(value),action='registerIntegrityTransaction',id=key(scope,auth.uid,action,input),rr=ref('integrityRequests',id),lockId=sha(`${scope}:${input.kind}:${input.recordId}`),lock=ref('integrityLocks',lockId);
  const initial=await access(auth,scope,async(tx,member)=>{
   const old=await tx.get(rr);if(old.exists){const saved=old.data();requestIdentity(saved,auth,scope,action,input);return {existing:saved};}requireRole(member);
   const held=await tx.get(lock);if(held.exists&&held.data().state==='Pending')fail('A registration is pending. Recover its original operation or reconcile manually.');
   const source=await captureIntegritySource(tx,{scope,...input});if(!source.eligibility.eligible)fail('This source is not eligible: '+source.eligibility.code);
   if((await tx.get(ref('verificationRecords',source.referenceHash))).exists)fail('An existing registration is retained. Run a check; do not sign again.');return {source};
  });
  if(initial.existing)return initial.existing.result?terminal(initial.existing,action,input):view(initial.existing);
  const c=configured(),observed=await safeIO(async()=>{const info=await inspect(c),file=await fileObservation(initial.source);if(!matchesFile(initial.source,file))fail('Registered evidence file bytes differ.');const stored=await rpc.lookup(c,initial.source);if(stored!==null)fail('This reference is already on-chain. Run a retained check.');return info;},'Preparation could not verify the local chain and original bytes. Run a retained check before retrying.');
  return access(auth,scope,async(tx,member)=>{
   const old=await tx.get(rr),held=await tx.get(lock);if(old.exists){const saved=old.data();requestIdentity(saved,auth,scope,action,input);return saved.result?terminal(saved,action,input):view(saved);}requireRole(member);
   const source=await captureIntegritySource(tx,{scope,...input});if(!matchesSource(source,initial.source)||!sameConfig(c))fail('The source or deployment changed during preparation.');
   if(held.exists&&held.data().state==='Pending')fail('A registration is pending. Recover its original operation or reconcile manually.');
   const saved={...requestRecord(auth,scope,action,input),phase:'Prepared',state:'Pending',source,chain:c,configurationSha256:configHash(c),wallet:observed.authorisedWallet,startingBlock:observed.blockNumber,expiresAtMs:clock()+15*60*1000,lockId,transactionHash:null,reason:null};
   tx.create(rr,saved);tx.set(lock,{ownerId:scope,requestId:id,actor:auth.uid,state:'Pending',expiresAtMs:saved.expiresAtMs});return view(saved);
  });
 }
 async function registration(auth,scope,value,resolveOnly){
  const submitted=!resolveOnly,data=validateIntegrityInput(value,submitted),input=baseInput(data),action='registerIntegrityTransaction',id=key(scope,auth.uid,action,input),rr=ref('integrityRequests',id);
  let saved=await access(auth,scope,async(tx,member)=>{
   const old=await tx.get(rr);if(!old.exists){requireRole(member);if(!resolveOnly)fail('Prepare this saved registration before submitting its transaction.');const cancelled=result('Cancelled',action,input);tx.create(rr,{...requestRecord(auth,scope,action,input),state:'Cancelled',result:cancelled});return {result:cancelled};}
   const s=old.data();requestIdentity(s,auth,scope,action,input);
   if(submitted&&s.transactionHash&&s.transactionHash!==data.transactionHash)fail('The saved registration uses a different transaction.');
   if(s.result)return {result:terminal(s,action,input)};requireRole(member);
   if(submitted){if(clock()>s.expiresAtMs&&!s.transactionHash)fail('The signing claim expired. Resolve the original registration for manual reconciliation.');tx.update(rr,{transactionHash:data.transactionHash,phase:'Submitted'});return {...s,transactionHash:data.transactionHash,phase:'Submitted'};}return s;
  });
  if(saved.result)return saved.result;
  if(!sameConfig(saved.chain))return {...view(saved),state:'Pending',reason:'DeploymentChanged'};
  let receipt,info;
  try{
   ({receipt,info}=await deadline(async()=>{
    const info=await inspect(saved.chain);if(info.blockNumber<saved.startingBlock)throw Error('Local chain moved behind the signing observation.');
    if(!saved.transactionHash){
     const events=await rpc.events(saved.chain,saved.source,saved.startingBlock,Math.min(info.blockNumber,saved.startingBlock+255));
     const matched=events.filter(e=>e.digest===saved.source.digest&&e.referenceHash===saved.source.referenceHash&&e.actor?.toLowerCase()===saved.wallet.toLowerCase()&&Number.isSafeInteger(e.blockNumber)&&e.blockNumber>=saved.startingBlock&&e.blockNumber<=saved.startingBlock+255);
     if(matched.length!==1)return {receipt:null,info};saved={...saved,transactionHash:matched[0].transactionHash};
    }
    return {receipt:await rpc.receipt(saved.chain,saved.transactionHash,saved.source),info};
   }));
  }catch{fail('The local chain or deployment could not be verified. Recover the same registration.','unavailable');}
  if(!receipt)return {...view(saved),state:'Pending',reason:clock()>saved.expiresAtMs?'ManualReconciliationRequired':'AwaitingConfirmation'};
  if(receipt.transactionHash!==saved.transactionHash||receipt.status!==1||receipt.to?.toLowerCase()!==saved.chain.address.toLowerCase()||receipt.from?.toLowerCase()!==saved.wallet.toLowerCase()||receipt.referenceHash!==saved.source.referenceHash||receipt.digest!==saved.source.digest||!Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<saved.startingBlock)fail('The confirmed transaction does not register the prepared source.');
  const stored=await safeIO(()=>rpc.lookup(saved.chain,saved.source),'The local registry could not be read. Recover the same saved registration.');if(stored!==saved.source.digest)fail('The current registry digest differs from the prepared registration.');
  if(saved.source.snapshot.kind==='delivery'){const file=await safeIO(()=>fileObservation(saved.source),'The original evidence file could not be read. Recover the same saved registration.');if(!matchesFile(saved.source,file))fail('Evidence bytes changed during registration.');}
  info=await safeIO(()=>inspect(saved.chain),'The original local deployment could not be verified. Recover the same saved registration.');if(receipt.blockNumber>info.blockNumber)fail('The confirmed receipt is not on the observed local chain.');
  return access(auth,scope,async(tx,member)=>{
   const current=await tx.get(rr),s=current.data();requestIdentity(s,auth,scope,action,input);if(s.result)return terminal(s,action,input);requireRole(member);
   const lock=await tx.get(ref('integrityLocks',s.lockId)),source=await captureIntegritySource(tx,{scope,...input}),recordKey=s.source.referenceHash,old=await tx.get(ref('verificationRecords',recordKey));
   if(!lock.exists||lock.data().requestId!==id||lock.data().state!=='Pending'||!sameConfig(s.chain)||!matchesSource(source,s.source)||s.transactionHash&&s.transactionHash!==saved.transactionHash)fail('The original source, deployment or signing claim changed.');
   if(old.exists)fail('An existing registration needs manual reconciliation.');
   const done=result('Completed',action,input,recordKey),at=stamp();
   tx.create(ref('verificationRecords',recordKey),{ownerId:scope,kind:input.kind,recordId:input.recordId,referenceHash:source.referenceHash,digest:source.digest,contract:s.chain.address,chainId:31337,transactionHash:saved.transactionHash,blockNumber:receipt.blockNumber,status:'Verified',actor:auth.uid,createdAt:at,version:1,protocol:INTEGRITY_PROTOCOL,source,chain:s.chain,operationId:input.operationId});
   tx.update(rr,{state:'Completed',phase:'Completed',transactionHash:saved.transactionHash,result:done});tx.update(ref('integrityLocks',s.lockId),{state:'Completed'});
   tx.create(ref('auditLogs','integrity_'+id),{ownerId:scope,actor:auth.uid,kind:'verificationRecords',recordId:recordKey,action,version:1,label:'Local blockchain registration confirmed',at});return done;
  });
 }
 async function check(auth,scope,value,resolveOnly){
  const input=validateIntegrityInput(value),action='checkIntegrityRecord',id=key(scope,auth.uid,action,input),rr=ref('integrityRequests',id),lease=randomUUID();
  const initial=await access(auth,scope,async(tx,member)=>{
   const old=await tx.get(rr);if(old.exists){const saved=old.data();requestIdentity(saved,auth,scope,action,input);if(saved.result)return {result:terminal(saved,action,input)};requireRole(member);if(resolveOnly||clock()<saved.leaseUntilMs)return {pending:true};tx.update(rr,{lease,leaseUntilMs:clock()+30000});return {saved:{...saved,lease}};}
   requireRole(member);if(resolveOnly){const cancelled=result('Cancelled',action,input);tx.create(rr,{...requestRecord(auth,scope,action,input),state:'Cancelled',result:cancelled});return {result:cancelled};}
   const source=await captureIntegritySource(tx,{scope,...input}),registration=await registrationSnapshot(tx,scope,source);let c;try{c=configured();}catch{c=null;}
   const saved={...requestRecord(auth,scope,action,input),state:'Pending',source,registration,chain:registration?registration.chain:c,observedAtMs:clock(),lease,leaseUntilMs:clock()+30000};tx.create(rr,saved);return {saved};
  });
  if(initial.result)return initial.result;if(initial.pending)return {state:'Pending',operationId:input.operationId,action,recordId:null,reason:'CheckInProgress'};
  const saved=initial.saved;
  // Return one observation from the bounded IO stage. A timed-out promise may
  // finish later, but cannot mutate values being published by a transaction.
  let observation;
  try{
   observation=await deadline(async()=>{
    let observedDigest=null,blockNumber=null,file=null;
    const unavailable=failureCode=>({outcome:'Unavailable',failureCode,observedDigest,blockNumber,file});
    if(!saved.source.eligibility.eligible)return unavailable(saved.source.eligibility.code);
    if(!saved.chain)return unavailable('DeploymentUnavailable');
    if(!sameConfig(saved.chain))return unavailable('DeploymentChanged');
    let info;try{info=await inspect(saved.chain);}catch{return unavailable('RPCUnavailable');}blockNumber=info.blockNumber;
    if(saved.source.snapshot.kind==='delivery'){
     try{file=await fileObservation(saved.source);}catch{return unavailable('FileUnavailable');}
     if(!matchesFile(saved.source,file))return {outcome:'Unmatched',failureCode:'FileDigestMismatch',observedDigest,blockNumber,file};
    }
    try{observedDigest=await rpc.lookup(saved.chain,saved.source);if(observedDigest!==null&&!hex.test(observedDigest))throw Error('Malformed registry value');}catch{return unavailable('RPCUnavailable');}
    try{const final=await inspect(saved.chain);if(final.blockNumber<blockNumber)throw Error('Local chain reset');blockNumber=final.blockNumber;}catch{return unavailable('DeploymentChanged');}
    const outcome=observedDigest===null?'NotRegistered':observedDigest===saved.source.digest?'Verified':'Unmatched';
    return {outcome,failureCode:outcome==='Unmatched'?'RegistryDigestMismatch':null,observedDigest,blockNumber,file};
   });
  }catch{observation={outcome:'Unavailable',failureCode:'IOTimeout',observedDigest:null,blockNumber:null,file:null};}
  return access(auth,scope,async(tx,member)=>{
   const current=await tx.get(rr),s=current.data();requestIdentity(s,auth,scope,action,input);if(s.result)return terminal(s,action,input);requireRole(member);if(s.lease!==lease)return {state:'Pending',operationId:input.operationId,action,recordId:null,reason:'CheckInProgress'};
   let {outcome,failureCode}=observation;const {observedDigest,blockNumber,file}=observation;
   let source;try{source=await captureIntegritySource(tx,{scope,...input});}catch{source=null;}
   if(!source||!matchesSource(source,s.source)){outcome='Unavailable';failureCode='SourceChanged';}
   else if(s.chain&&!sameConfig(s.chain)){outcome='Unavailable';failureCode='DeploymentChanged';}
   const currentRegistration=await registrationSnapshot(tx,scope,s.source);if(!Object.hasOwn(s,'registration')||!matchesSource(currentRegistration,s.registration)){outcome='Unavailable';failureCode='RegistrationChanged';}
   const done=result('Completed',action,input,id),at=stamp(),attempt={ownerId:scope,actor:auth.uid,input,kind:input.kind,recordId:input.recordId,source:s.source,chain:s.chain,registration:s.registration??null,observedDigest,blockNumber,fileObservation:file,observedAtMs:s.observedAtMs,completedAtMs:clock(),outcome,failureCode,protocol:INTEGRITY_PROTOCOL,createdAt:at,version:1};
   tx.create(ref('integrityChecks',id),attempt);
   if(outcome!=='Verified')tx.create(ref('integrityExceptions',id),{ownerId:scope,checkId:id,kind:input.kind,recordId:input.recordId,checkActor:auth.uid,outcome,failureCode,reviewVersion:0,status:'Open',review:null,createdAt:at,version:1});
   tx.update(rr,{state:'Completed',result:done});tx.create(ref('auditLogs','integrity_'+id),{ownerId:scope,actor:auth.uid,kind:'integrityChecks',recordId:id,action,version:1,label:'Integrity observation: '+outcome,at});return done;
  });
 }
 function review(auth,scope,value,resolveOnly){
  const input=validateIntegrityReview(value),action='reviewIntegrityException';
  return runCompletionOperation({auth,scope,action,input,roles,resolveOnly,work:async(tx)=>{
   const r=ref('integrityExceptions',input.exceptionId),snap=await tx.get(r),old=snap.data();if(!old||old.ownerId!==scope)fail('Integrity exception not found.','not-found');
   const original=await tx.get(ref('integrityChecks',old.checkId));if(!original.exists||original.data().ownerId!==scope||original.data().actor!==old.checkActor||original.data().outcome!==old.outcome||original.data().failureCode!==old.failureCode)fail('The original observation needs reconciliation.');
   if(old.checkActor===auth.uid)fail('A different Admin or Manager must review this observation.','permission-denied');if(old.reviewVersion!==input.expectedReviewVersion)fail('The exception review version changed. Refresh its history.');
   const version=old.reviewVersion+1,eventId=key(scope,auth.uid,action,input),at=stamp(),summary={eventId,actor:auth.uid,decision:input.decision,notes:input.notes,reviewVersion:version,at};
   return {result:{recordId:input.exceptionId,version},apply:()=>{tx.update(r,{reviewVersion:version,review:summary,status:input.decision==='Acknowledge'?'Acknowledged':'NeedsFollowUp',version:old.version+1});tx.create(ref('integrityReviewEvents',eventId),{ownerId:scope,exceptionId:input.exceptionId,checkId:old.checkId,...summary,operationId:input.operationId,originalOutcome:old.outcome});}};
  }});
 }
 return {
  getIntegrityAvailability:(auth,scope,input)=>{completionExact(input,[]);return access(auth,scope,async(_tx,member)=>{let enabled=false;try{configured();enabled=roles.includes(member.role);}catch{/* Missing pins are explicitly unavailable. */}return {enabled,chainId:31337,protocol:INTEGRITY_PROTOCOL};});},
  prepareIntegrityRegistration,
  registerIntegrityTransaction:(auth,scope,input)=>registration(auth,scope,input,false),resolveIntegrityRegistration:(auth,scope,input)=>registration(auth,scope,input,true),
  checkIntegrityRecord:(auth,scope,input)=>check(auth,scope,input,false),resolveIntegrityCheck:(auth,scope,input)=>check(auth,scope,input,true),
  reviewIntegrityException:(auth,scope,input)=>review(auth,scope,input,false),resolveIntegrityReview:(auth,scope,input)=>review(auth,scope,input,true),
 };
}
