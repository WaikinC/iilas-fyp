import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createConnection} from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {hostname} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {runStartup} from './startup.mjs';
import {assertChainGeneration} from './chain-generation.mjs';
import {reconnectChain,validateRestoredChain,requiresReconnection} from './reconnect.mjs';
import {acquireOwnedLock,archiveStaleLock,backupProofTree,observeProcess} from './restart-state.mjs';
import {publishJson,readPrivateJson} from './durable-chain.mjs';
import {stopProcessIdentity} from './windows-ownership.mjs';
const workspaceIndex=process.argv.indexOf('--workspace');
const workspace=workspaceIndex>=0?resolve(process.argv[workspaceIndex+1]):resolve(fileURLToPath(new URL('../',import.meta.url))),app=join(workspace,'iilas-fyp');
const home=join(app,'outputs/spark-msi-demo-20261028/desktop-launcher-20261102');
const checkOnly=process.argv.includes('--check-only'),noOpen=process.argv.includes('--no-open');
const names={chain:'Blockchain',stock:'Inventory AI',delivery:'Delivery AI',api:'Application backend',tunnel:'Website connection'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report=(name,status)=>console.log(`[${status.toUpperCase()}] ${names[name]||name}`);
const ps=source=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',source],{encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
async function portState(port){return new Promise(done=>{
 const socket=createConnection({host:'127.0.0.1',port});
 socket.setTimeout(1500);socket.once('connect',()=>{socket.destroy();done('occupied');});
 socket.once('timeout',()=>{socket.destroy();done('blocked');});
 socket.once('error',e=>done(e.code==='ECONNREFUSED'?'absent':'blocked'));
});}
async function request(url,options={}){
 return fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(5000)});
}
async function json(url,options={}){const response=await request(url,options);if(!response.ok)throw Error('Unavailable');return response.json();}
async function rpc(method,params=[]){
 const reply=await json('http://127.0.0.1:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 if(reply.error||reply.result===undefined)throw Error('RPC unavailable');return reply.result;
}
async function main(){
 console.log('\nIILAS DEMO - MSI\nChecking the current approved services. Please leave this window open until checks finish.\n');
 if(process.platform!=='win32'||hostname().toUpperCase()!=='MSI'||Number(process.versions.node.split('.')[0])!==22)throw Error('MSI / Node 22 required');
 if(Object.keys(process.env).some(k=>k.includes('EMULATOR')||k==='GOOGLE_APPLICATION_CREDENTIALS'||/^NGROK_/i.test(k)))throw Error('Use a normal desktop session');
 const bindingPath=join(home,'binding.private.json');let binding=JSON.parse(await readFile(bindingPath,'utf8'));
 if(binding.schema!=='iilas-desktop-launcher-1.0'||binding.projectId!=='fyp-inventory-and-logistics'||binding.website!=='https://fyp-inventory-and-logistics.web.app'||binding.apiOrigin!=='https://octagon-magnetism-presoak.ngrok-free.dev')throw Error('Binding changed');
 for(const [path,digest]of Object.entries(binding.pins))if(sha(await readFile(path))!==digest)throw Error('Current startup references changed');
 const {readSparkPreparation}=await import(pathToFileURL(join(app,'scripts/prepare-spark-msi.mjs')));
 let loaded=await readSparkPreparation(binding.preparationPath);
 if(loaded.profile.backendInstanceId!==binding.backendInstanceId)throw Error('Backend binding differs');
 let env=loaded.serving.backendEnvironment,owner=JSON.parse(await readFile(binding.chainOwner,'utf8'));
 const services={};
 services.chain={inspect:async()=>{
  if(await portState(8545)==='absent')return {state:'absent'};
  try{
   const p=JSON.parse(ps(`$listeners=@(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 8545 -ErrorAction Stop);if($listeners.Count -ne 1){throw 'Missing listener'};$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${Number(owner.pid)}' -ErrorAction Stop; if($null -eq $p){throw 'Missing'}; [pscustomobject]@{listenerPid=$listeners[0].OwningProcess;started=$p.CreationDate.ToUniversalTime().ToString('o');command=$p.CommandLine}|ConvertTo-Json -Compress`));
   if(!p.command?.includes(binding.durable?.workerPath??'node_modules/hardhat/internal/cli/cli.js')||Math.abs(Date.parse(p.started)-Date.parse(owner.startedAt))>2000)throw Error('Chain process differs');
   if(binding.durable)validateRestoredChain({binding,health:await json('http://127.0.0.1:8545/health')});
   const chainId=Number(BigInt(await rpc('eth_chainId'))),genesis=await rpc('eth_getBlockByNumber',['0x0',false]),deploymentBlock=await rpc('eth_getBlockByNumber',['0x'+binding.chain.deploymentBlock.toString(16),false]),metadata=await rpc('hardhat_metadata');
   assertChainGeneration({expected:{chainId:binding.chain.chainId,...binding.chainIdentity},chainId,processPid:owner.pid,listenerPid:p.listenerPid,startedAt:p.started,ownerStartedAt:owner.startedAt,genesisHash:genesis?.hash,deploymentBlockHash:deploymentBlock?.hash,instanceId:metadata.instanceId});
   const code=await rpc('eth_getCode',[binding.chain.address,'latest']);
   if(sha(Buffer.from(code.slice(2),'hex'))!==binding.chain.runtimeCodeSha256)throw Error('Contract differs');
   for(const hash of [binding.chain.deploymentTransactionHash,...binding.walletTransactions]){
    const receipt=await rpc('eth_getTransactionReceipt',[hash]);
    if(!receipt||receipt.status!=='0x1')throw Error('History missing');
    if(hash===binding.chain.deploymentTransactionHash&&receipt.contractAddress?.toLowerCase()!==binding.chain.address.toLowerCase())throw Error('Deployment differs');
    if(hash!==binding.chain.deploymentTransactionHash&&receipt.to?.toLowerCase()!==binding.chain.address.toLowerCase())throw Error('Registry differs');
    const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]);
    if(block?.hash!==receipt.blockHash)throw Error('History changed');
   }
   return {state:'ready'};
  }catch{return {state:'blocked'};}
 }};
 async function modelInspect(name,port,protocol,token){
  const occupancy=await portState(port);if(occupancy==='absent')return {state:'absent'};
  try{
   const h=await json(`http://127.0.0.1:${port}/health`);
   if(h.protocol!==protocol||h.status!=='artifact_ready'||h.model!=='RandomForest'||!token)throw Error('Model unavailable');
   // An invalid empty request proves credential compatibility without running inference.
   const auth=await request(`http://127.0.0.1:${port}/predict/${name}-experiment`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
   return {state:auth.status===422?'ready':'blocked'};
  }catch{return {state:'blocked'};}
 }
 services.stock={inspect:()=>modelInspect('stock',8001,'inventory-context-inference-2.0',env.IILAS_STOCK_API_TOKEN)};
 services.delivery={inspect:()=>modelInspect('delivery',8002,'delivery-demo-inference-1.0',env.IILAS_DELIVERY_API_TOKEN)};
 async function apiHealth(origin){
  const r=await request(origin+'/health',{headers:{Origin:binding.website,'ngrok-skip-browser-warning':'iilas-fyp'}});
  if(r.status!==200||r.headers.get('x-iilas-backend')!==binding.backendInstanceId||r.headers.get('x-iilas-protocol')!=='iilas-msi-api-1.0'||r.headers.get('access-control-allow-origin')!==binding.website||(await r.json()).ready!==true)throw Error('API unavailable');
 }
 services.api={inspect:async()=>{
  if(await portState(8011)==='absent')return {state:'absent'};
  try{await apiHealth('http://127.0.0.1:8011');return {state:'ready'};}catch{return {state:'blocked'};}
 }};
 services.tunnel={inspect:async()=>{
  try{await apiHealth(binding.apiOrigin);return {state:'ready'};}catch{}
  try{const count=Number(ps("@(Get-Process -Name ngrok -ErrorAction SilentlyContinue).Count"));return {state:count===0?'absent':'blocked'};}catch{return {state:'blocked'};}
 }};
 let runDir,held;const lock=join(home,'launch.lock');
 if(!checkOnly){
  try{held=await acquireOwnedLock({path:lock,archiveDirectory:join(home,'retired-launch-locks'),role:'desktop-launcher'});}
  catch{console.log('[NEEDS ATTENTION] Another launcher is running, or a previous launch was interrupted. No service was changed.');process.exitCode=1;return;}
 }
 const children=[];
 async function proofRecovery(){
  const backup=join(binding.durable.directory,'backups',randomUUID());await mkdir(resolve(backup,'..'),{recursive:true});
  await backupProofTree({root:binding.proofRoot,backupDirectory:backup,rootId:loaded.serverConfig.evidenceRootId,backendInstanceId:binding.backendInstanceId});
  try{await readFile(join(binding.proofRoot,'store.lock'));let sidecar;try{sidecar=await readPrivateJson(join(binding.durable.directory,'api-owner.private.json'));}catch(e){if(e.code!=='ENOENT')throw e;}await archiveStaleLock({path:join(binding.proofRoot,'store.lock'),archiveDirectory:join(backup,'retired-locks'),expected:{rootId:loaded.serverConfig.evidenceRootId,backendInstanceId:binding.backendInstanceId},sidecar,isPortAbsent:async()=>await portState(8011)==='absent'});}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 async function captureApiOwner(){
  if(!binding.durable)return;const bytes=await readFile(join(binding.proofRoot,'store.lock')),value=JSON.parse(bytes),identity=observeProcess(value.pid);
  if(!identity||value.rootId!==loaded.serverConfig.evidenceRootId||value.backendInstanceId!==binding.backendInstanceId)throw Error('Backend ownership differs');
  const listener=Number(ps("(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 8011 -ErrorAction Stop).OwningProcess"));if(listener!==identity.pid)throw Error('Backend listener differs');
  await publishJson(join(binding.durable.directory,'api-owner.private.json'),{...identity,nonce:value.nonce,lockSha256:sha(bytes)});
 }
 async function stopOwnedApi(){
  const sidecar=await readPrivateJson(join(binding.durable.directory,'api-owner.private.json'));
  const bytes=await readFile(join(binding.proofRoot,'store.lock')),value=JSON.parse(bytes),actual=observeProcess(sidecar.pid);
  const listener=Number(ps("(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 8011 -ErrorAction Stop).OwningProcess"));
  if(listener!==sidecar.pid||JSON.stringify(actual)!==JSON.stringify({pid:sidecar.pid,startTicks:sidecar.startTicks})||value.nonce!==sidecar.nonce||sha(bytes)!==sidecar.lockSha256)throw Error('Unproven backend ownership');
  await apiHealth('http://127.0.0.1:8011');stopProcessIdentity(sidecar);
  for(let n=0;n<30;n++){if(await portState(8011)==='absent')return;await delay(200);}throw Error('Backend still present');
 }
 async function adoptWorker(health,expectedPid){
  validateRestoredChain({binding,health});const processInfo=JSON.parse(ps("$c=@(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 8545 -ErrorAction Stop);if($c.Count -ne 1){throw 'Listener'};$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$c[0].OwningProcess) -ErrorAction Stop;[pscustomobject]@{pid=$p.ProcessId;command=$p.CommandLine}|ConvertTo-Json -Compress"));
  if(processInfo.pid!==health.process.pid||expectedPid&&processInfo.pid!==expectedPid||!processInfo.command?.includes(binding.durable.workerPath)||!processInfo.command.includes(binding.durable.directory)||JSON.stringify(observeProcess(processInfo.pid))!==JSON.stringify(health.process))throw Error('Different durable worker');
  binding=await reconnectChain({workspace,bindingPath,health,isApiAbsent:async()=>await portState(8011)==='absent',stopOwnedApi});loaded=await readSparkPreparation(binding.preparationPath);env=loaded.serving.backendEnvironment;owner=JSON.parse(await readFile(binding.chainOwner));
 }
 async function start(name,args){
  if(name==='stock'||name==='delivery'){
   const free=Number(ps('(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'))*1024;
   if(free<3*1024**3)throw Error('Free at least 3 GiB RAM');
  }
  if(name==='api'){
   if(binding.durable)await proofRecovery();
   try{await access(join(binding.proofRoot,'store.lock'));throw Error('Proof store ownership needs recovery');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  if(!runDir){runDir=join(home,'run-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());await mkdir(runDir);}
  const stdout=openSync(join(runDir,name+'.stdout.private.log'),'wx'),stderr=openSync(join(runDir,name+'.stderr.private.log'),'wx');
  let child;
  try{child=spawn(process.execPath,args,{cwd:app,env:{...process.env},detached:true,windowsHide:true,stdio:['ignore',stdout,stderr]});}
  finally{closeSync(stdout);closeSync(stderr);}
  let exited=false;child.once('exit',()=>{exited=true;});child.once('error',()=>{exited=true;});
  await new Promise((yes,no)=>{child.once('spawn',yes);child.once('error',no);});
  children.push({service:name,pid:child.pid,args,startedAt:new Date().toISOString()});
  await writeFile(join(runDir,'owners.private.json'),JSON.stringify(children,null,2));child.unref();
  for(let n=0;n<40;n++){
   if(exited)throw Error('Service refused startup');
   if(name==='chain'){
    let health;try{health=await json('http://127.0.0.1:8545/health');}catch{}
    if(health)await adoptWorker(health,child.pid);
   }
   if((await services[name].inspect()).state==='ready'){if(name==='api')await captureApiOwner();return;}
   if(n%5===0)console.log(`  Waiting for ${names[name]}...`);
   await delay(2000);
  }
  throw Error('Startup deadline reached');
 }
 if(binding.durable)services.chain.start=()=>start('chain',[binding.durable.workerPath,'--app',app,'--state',binding.durable.directory,'--port','8545']);
 services.stock.start=()=>start('stock',[binding.boundModelRunner,'--receipt',binding.preparationPath,'--role','stock']);
 services.delivery.start=()=>start('delivery',[binding.boundModelRunner,'--receipt',binding.preparationPath,'--role','delivery']);
 services.api.start=()=>start('api',['tools/msi-backend/launch.mjs','--receipt',binding.preparationPath]);
 services.tunnel.start=()=>start('tunnel',['scripts/spark-ngrok.mjs','--profile',binding.ngrokPreparation,'--approval',binding.ngrokApproval,'--output',join(home,'tunnel-'+randomUUID()),'--execute']);
 try{
  if(binding.durable&&!checkOnly&&await portState(8545)==='occupied'){
   const health=await json('http://127.0.0.1:8545/health');if(requiresReconnection({binding,health,owner}))await adoptWorker(health);
  }
  const result=await runStartup({services,report,checkOnly,recoverChain:Boolean(binding.durable)});
  if(result.servicesReady&&!checkOnly)await captureApiOwner();
  console.log('\n'+(result.servicesReady?'SERVICES CONNECTED':'ACTION NEEDED'));
  if(result.blockedAt==='chain')console.log('Saved blockchain recovery could not be verified. No replacement registry was created; preserved history needs attention.');
  else if(result.blockedAt)console.log(`Please check ${names[result.blockedAt]}. Existing services were left running. Private startup logs are kept in the project outputs folder.`);
  console.log('\nWebsite: '+binding.website);
  console.log('Service checks do not measure AI accuracy or complete workflow acceptance.');
  if(binding.transportAcceptancePending)console.log('Transport save/edit/cancel acceptance still needs its live check.');
  if(binding.walletVerificationPending)console.log('Wallet verification is pending for this demo chain. Earlier saved checks remain historical.');
  console.log('Keep MSI plugged in, awake and online. Unlock MetaMask yourself when signing. Parcel and phone tests remain deferred.');
  console.log('Closing this launcher window leaves the services running.');
  if(!checkOnly)await writeFile(join(home,'last-check.private.json'),JSON.stringify({at:new Date().toISOString(),...result,databaseChecked:false,cloudBusinessWrites:0,chainReset:false},null,2));
  if(result.servicesReady&&!checkOnly&&!noOpen){
   const browser=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Start-Process -FilePath 'https://fyp-inventory-and-logistics.web.app/'"],{windowsHide:true,detached:true,stdio:'ignore'});browser.once('error',()=>console.log('Open the website using the address above.'));browser.unref();
  }
  if(!result.servicesReady)process.exitCode=1;
 }finally{
  if(held){try{await held.release();}catch{}}
 }
}
main().catch(()=>{console.error('\n[NEEDS ATTENTION] Startup settings are missing, changed or unavailable. No secrets are displayed. Ask for the current demo startup binding to be checked.');process.exitCode=1;});
