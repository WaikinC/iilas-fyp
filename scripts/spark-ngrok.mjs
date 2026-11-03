import {readFile,lstat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,parse,join,relative,isAbsolute} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {completionExact} from '../lib/completionWorkflow.js';
import {readSparkPreparation} from './prepare-spark-msi.mjs';
import {assertSparkWindowsPrivateAcl,SPARK_NGROK_CONFIGURATION_PATH} from './spark-activation.mjs';
import {sparkHash,readSparkPrivate,sparkSourcePath,SPARK_ROOT} from './spark-private-files.mjs';
import {verifySparkPublicApi} from './spark-cloud-live-deploy.mjs';
import {sparkPublicationExecutionMode} from './spark-cloud-publication.mjs';

const fail=()=>{throw Error('Ngrok requires its restricted native configuration, exact runtime/HTTPS approval and unchanged MSI bindings.');};
const executable='C:/Users/Home/AppData/Local/Microsoft/WindowsApps/ngrok.exe';
const origin='https://octagon-magnetism-presoak.ngrok-free.dev';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

// Accept only the small token-only YAML emitted by the official add-authtoken command.
// Extra keys (including endpoints, alternate trust roots and remote management) are refused.
export function validateSparkNgrokConfiguration(bytes,expectedHash){
 if(!Buffer.isBuffer(bytes)||bytes.length>8192||!hash(expectedHash)||sparkHash(bytes)!==expectedHash)fail();
 const text=bytes.toString('utf8').replaceAll('\r\n','\n').trimEnd();
 const token="(?:[A-Za-z0-9_-]{20,512}|'[A-Za-z0-9_-]{20,512}'|\"[A-Za-z0-9_-]{20,512}\")";
 const v2=new RegExp('^version: [\"\']?2[\"\']?\nauthtoken: '+token+'$');
 const v3=new RegExp('^version: [\"\']?3[\"\']?\nagent:\n[ ]{2,8}authtoken: '+token+'$');
 if(!v2.test(text)&&!v3.test(text))fail();return true;
}
export async function readSparkNgrokConfiguration(expectedHash){
 if(process.platform!=='win32')fail();const path=resolve(SPARK_NGROK_CONFIGURATION_PATH),root=parse(path).root;let current=root;
 for(const part of path.slice(root.length).split(/[\\/]/)){current=join(current,part);const s=await lstat(current);if(s.isSymbolicLink()||s.isFile()&&(s.nlink!==1||s.size>8192))fail();}
 assertSparkWindowsPrivateAcl(path);const bytes=await readFile(path);validateSparkNgrokConfiguration(bytes,expectedHash);return true;
}
export function planSparkNgrok({loaded,preparationSha256,configurationSha256,version,approval,inherited}){
 const a=completionExact(approval,['schema','preparationSha256','configurationSha256','activationSha256','agentVersion','apiOrigin','upstream','inspectionEnabled','billingMustRemainDisabled']);
 if(!hash(preparationSha256)||!hash(configurationSha256)||!hash(loaded?.activation?.manifestSha256)||loaded.receipt?.testMode!==false||loaded.profile?.mode!=='spark-msi'||loaded.profile.projectId!=='fyp-inventory-and-logistics'||loaded.profile.apiOrigin!==origin||JSON.stringify(loaded.profile.webOrigins)!==JSON.stringify(['https://fyp-inventory-and-logistics.web.app'])||!loaded.activation.approvedActions?.includes('public-https')||a.schema!=='iilas-spark-ngrok-approval-1.0'||a.preparationSha256!==preparationSha256||a.configurationSha256!==configurationSha256||a.activationSha256!==loaded.activation.manifestSha256||a.agentVersion!==version||!/^ngrok version [0-9]+\.[0-9]+\.[0-9]+-msix-stable$/.test(version)||a.apiOrigin!==origin||a.upstream!=='http://127.0.0.1:8011'||a.inspectionEnabled!==false||a.billingMustRemainDisabled!==true||!inherited||Object.keys(inherited).some(k=>/^NGROK_/i.test(k)||/EMULATOR/i.test(k)))fail();
 return {executable,args:['http',a.upstream,'--url',origin,'--inspect=false','--log=false','--config',SPARK_NGROK_CONFIGURATION_PATH],env:{...inherited}};
}
export async function launchSparkNgrok({preparationPath,approvalPath,outputRoot,execute=false}){
 const loaded=await readSparkPreparation(preparationPath),approval=JSON.parse(await readSparkPrivate(approvalPath));
 await readSparkNgrokConfiguration(approval.configurationSha256);
 const version=execFileSync(executable,['version'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 const plan=planSparkNgrok({loaded,preparationSha256:sparkHash(await readSparkPrivate(preparationPath)),configurationSha256:approval.configurationSha256,version,approval,inherited:process.env});
 if(!execute)return {dryRun:true,configurationValidated:true,approvalValidated:true,tunnelStarted:false};
 await verifySparkPublicApi({apiOrigin:'http://127.0.0.1:8011',websiteOrigin:loaded.profile.webOrigins[0],backendInstanceId:loaded.profile.backendInstanceId});
 const output=sparkSourcePath(outputRoot),rel=relative(join(SPARK_ROOT,'outputs/spark-msi-demo-20261028'),output);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();await mkdir(output,{recursive:false});
 await readSparkPreparation(preparationPath);await readSparkNgrokConfiguration(approval.configurationSha256);
 const base={schema:'iilas-spark-ngrok-process-1.0',apiOrigin:origin,backendInstanceId:loaded.profile.backendInstanceId,configurationSha256:approval.configurationSha256,preparationSha256:approval.preparationSha256,agentVersion:version,upstream:approval.upstream,inspectionEnabled:false};
 await writeFile(join(output,'intent.private.json'),JSON.stringify({...base,at:new Date().toISOString()}),{flag:'wx',mode:0o600,flush:true});
 const child=spawn(plan.executable,plan.args,{env:plan.env,cwd:SPARK_ROOT,windowsHide:true,stdio:'ignore'});
 let exited=false;const terminal=new Promise((done,reject)=>{child.once('error',error=>{exited=true;reject(error);});child.once('exit',code=>{exited=true;done(code);});});terminal.catch(()=>{});
 const stop=()=>{if(!exited)child.kill();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  await new Promise((done,reject)=>{child.once('spawn',done);child.once('error',reject);});
  await writeFile(join(output,'owned-process.private.json'),JSON.stringify({...base,pid:child.pid,startedAt:new Date().toISOString()}),{flag:'wx',mode:0o600,flush:true});
  let ready=false;for(let attempt=0;attempt<10;attempt++){if(exited)fail();try{await verifySparkPublicApi({apiOrigin:origin,websiteOrigin:loaded.profile.webOrigins[0],backendInstanceId:loaded.profile.backendInstanceId});ready=true;break;}catch{await wait(2000);}}
  if(!ready||exited)fail();await writeFile(join(output,'ready.private.json'),JSON.stringify({...base,pid:child.pid,ready:true,at:new Date().toISOString()}),{flag:'wx',mode:0o600,flush:true});
  console.log(JSON.stringify({tunnelStarted:true,apiOrigin:origin,pid:child.pid,inspectionEnabled:false}));
  const code=await terminal;await writeFile(join(output,'terminal.private.json'),JSON.stringify({...base,pid:child.pid,exitCode:code,at:new Date().toISOString()}),{flag:'wx',mode:0o600,flush:true});return {tunnelStopped:true,exitCode:code};
 }finally{stop();await terminal.catch(()=>{});process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const get=k=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:null;
 Promise.resolve().then(()=>launchSparkNgrok({preparationPath:get('--profile'),approvalPath:get('--approval'),outputRoot:get('--output'),execute:sparkPublicationExecutionMode(process.argv.slice(2))})).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Ngrok launch refused or stopped. No alternate domain, paid fallback or unrelated process was started.');process.exitCode=1;});
}
