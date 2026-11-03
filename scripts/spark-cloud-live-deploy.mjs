import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {readSparkPrivate,sparkSourcePath,SPARK_ROOT} from './spark-private-files.mjs';
import {validateSparkPublication,verifySparkPublicationFiles,executeSparkCloudPublication,sparkPublicationExecutionMode} from './spark-cloud-publication.mjs';
import {createSparkCloudReader,captureSparkCloudState,validateSparkCloudTransition,sparkCloudStateDigest,waitForSparkIndexes} from './spark-cloud-observer.mjs';
import {readSparkCredential} from './spark-activation.mjs';
import {sparkDeployCommands} from './spark-demo-deploy.mjs';
import {completionCanonical} from '../lib/completionWorkflow.js';
import {assertSparkBackupMatchesObservation} from './spark-backup-observation.mjs';
const fail=()=>{throw Error('The real Spark cutover refused missing approval, changed files, cloud drift or unavailable MSI.');};
const sorted=values=>structuredClone(values).sort((a,b)=>completionCanonical(a).localeCompare(completionCanonical(b)));
export function plannedSparkDeployment(indexes,stage,baselineIndexSettings={fieldOverrides:[]}){
 if((indexes.fieldOverrides||[]).some(f=>f.collectionGroup==='__default__'))fail();
 // Database defaults are observation-only: preserve and verify them exactly,
 // without asking the collection-field API to write a virtual resource.
 const defaults=(baselineIndexSettings.fieldOverrides||[]).filter(f=>f.collectionGroup==='__default__');
 return {indexSettings:{indexes:sorted(indexes.indexes||[]),fieldOverrides:sorted([...(indexes.fieldOverrides||[]),...defaults].map(f=>({...f,indexes:sorted(f.indexes||[])})))},rulesSourceSha256:stage.files['firestore.rules'],hostingFiles:Object.fromEntries(Object.entries(stage.files).filter(([name])=>name.startsWith('public/')).map(([name,hash])=>[name.slice(7),hash]))};
}
export async function verifySparkPublicApi(packet){
 for(const origin of [packet.websiteOrigin,'https://not-iilas.invalid']){
  const r=await fetch(packet.apiOrigin+'/health',{redirect:'error',headers:{Origin:origin,'ngrok-skip-browser-warning':'iilas-fyp'},signal:AbortSignal.timeout(15000)});
  if(origin===packet.websiteOrigin){if(r.status!==200||r.headers.get('x-iilas-backend')!==packet.backendInstanceId||r.headers.get('x-iilas-protocol')!=='iilas-msi-api-1.0'||r.headers.get('access-control-allow-origin')!==origin||(await r.json()).ready!==true)fail();}else if(r.status!==403)fail();
 }
 const denied=await fetch(packet.apiOrigin+'/v1/command',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','ngrok-skip-browser-warning':'iilas-fyp','x-iilas-protocol':'iilas-msi-api-1.0','x-iilas-backend':packet.backendInstanceId},body:JSON.stringify({action:'captureInventoryContext',input:{}}),signal:AbortSignal.timeout(15000)});if(denied.status!==401)fail();
}
export async function runApprovedSparkCloudPublication({manifestPath,approvalPath,baselinePath,outputRoot,execute=false}){
 const packet=JSON.parse(await readSparkPrivate(manifestPath)),approval=JSON.parse(await readSparkPrivate(approvalPath));validateSparkPublication(packet,approval);
 const verified=await verifySparkPublicationFiles(packet),baseline=JSON.parse(await readSparkPrivate(baselinePath));if(sparkCloudStateDigest(baseline)!==packet.resourcesSha256||baseline.adminEmailVerified!==true||baseline.systemConfigPresent!==false||baseline.userProfiles!==0)fail();assertSparkBackupMatchesObservation(verified.backupObservation,baseline);
 await readSparkCredential(verified.loaded.serverConfig.credentialPath,packet.credentialSha256);
 const planned=plannedSparkDeployment(JSON.parse(await readFile(join(verified.folder,'firestore.indexes.json'))),verified.stage,baseline.indexSettings);if(!execute)return {dryRun:true,filesVerified:true,approvalValidated:true,cloudWrites:0,publicRequests:0};
 const output=sparkSourcePath(outputRoot);if(!output.startsWith(join(SPARK_ROOT,'outputs','spark-msi-demo-20261028')+'\\')&&!output.startsWith(join(SPARK_ROOT,'outputs','spark-msi-demo-20261028')+'/'))fail();await mkdir(output,{recursive:false});
 await verifySparkPublicApi(packet);const records=[];
 async function record(value){records.push({...value,at:new Date().toISOString()});await writeFile(join(output,'stage-'+records.length+'.private.json'),JSON.stringify({manifestSha256:packet.manifestSha256,records},null,2),{flag:'wx',mode:0o600});}
 const observe=async context=>{const request=await createSparkCloudReader();if(context.stage==='firestore:indexes'&&context.phase==='after')await waitForSparkIndexes({request});const observed=await captureSparkCloudState({request,primaryAdminUid:baseline.primaryAdminUid});const resourcesSha256=validateSparkCloudTransition({baseline,observed,planned,...context});await writeFile(join(output,'observation-'+context.stage.replaceAll(':','-')+'-'+context.phase+'.private.json'),JSON.stringify(observed,null,2),{flag:'wx',mode:0o600});return {projectId:observed.projectId,billingEnabled:observed.billingEnabled,resourcesSha256};};
 const run=async stage=>{
  const args=sparkDeployCommands(verified.configPath).find(a=>a.at(-1)===stage);if(!args)fail();const child=spawn(process.execPath,[join(SPARK_ROOT,'node_modules/firebase-tools/lib/bin/firebase.js'),...args,'--non-interactive'],{cwd:SPARK_ROOT,env:{...process.env},windowsHide:true,stdio:['ignore','pipe','pipe']});let log='',size=0;for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{size+=b.length;if(size>8*1024*1024)child.kill();else log+=b;});
  const code=await new Promise((yes,no)=>{child.once('error',no);child.once('close',yes);});await writeFile(join(output,stage.replaceAll(':','-')+'.private.log'),log,{flag:'wx',mode:0o600});if(code!==0)fail();
 };
 const completed=await executeSparkCloudPublication({packet,approval,observe,verifyFiles:async p=>{await readSparkCredential(verified.loaded.serverConfig.credentialPath,p.credentialSha256);return verifySparkPublicationFiles(p);},run,record});const result={passed:true,completed,manifestSha256:packet.manifestSha256,billingEnabled:false,applicationDataWrites:0,cloudBootstrap:false};await writeFile(join(output,'publication.private.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600});return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const get=k=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:undefined;Promise.resolve().then(()=>runApprovedSparkCloudPublication({manifestPath:get('--manifest'),approvalPath:get('--approval'),baselinePath:get('--baseline'),outputRoot:get('--output'),execute:sparkPublicationExecutionMode(process.argv.slice(2))})).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Spark cloud cutover stopped; inspect its private stage receipts. No automatic rollback, data restore or billing fallback.');process.exitCode=1;});}
