import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {completionExact} from '../lib/completionWorkflow.js';
import {hybridHash} from '../backend/functions/hybridSigning.mjs';
import {readMobileProfile,mobileLaunchEnvironment} from './prepare-mobile-local.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),BASE=resolve(ROOT,'outputs/hybrid-demo-20261027');
const OLD_HARNESS='outputs/android-mobile-20261026/regression-runner.mjs',HARNESS_SHA='136eac9c1ce7b260ecdd0c21e7bbce7390ce77df4fa8f973f0780ded44068ebf';
const PRELOAD_SHA='24482bcfb2882c54d943a5349aa1da13943cd337392061e04ad75cb762c523c8';
const fail=()=>{throw Error('The preserved loopback-only local acceptance inputs are invalid.');};
function contained(path,base){if(typeof path!=='string'||/[\x00-\x1f]/.test(path))fail();const p=resolve(ROOT,path),rel=relative(base,p);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();return p;}
export function validateHybridLocalAcceptance(raw){
 const value=completionExact(raw,['profile','ownedStack','outputRoot']),s=completionExact(value.ownedStack,['projectId','webOrigin','completionProfileReceipt']);
 if(s.projectId!=='fyp-inventory-and-logistics'||!['http://127.0.0.1:5173','http://localhost:5173'].includes(s.webOrigin))fail();contained(value.profile,resolve(ROOT,'outputs'));contained(s.completionProfileReceipt,BASE);contained(value.outputRoot,BASE);return value;
}
export function makeHybridLocalReceipt({checks,preservation,bindings,artifactPins}){
 return {passed:checks.length>0&&checks.every(c=>c.passed===true)&&preservation.exact===true,localOnly:true,cloudConnectivity:false,phoneAcceptance:false,parcelTesting:false,scientificEvaluationReplayed:false,publicTunnel:false,checks,preservation,bindings,artifactPins};
}
export async function prepareHybridPreservationHarness(){
 const source=await readFile(resolve(ROOT,OLD_HARNESS)),helper=await readFile(resolve(ROOT,'outputs/android-mobile-20261026/output-redirect.mjs'));assert.equal(hybridHash(source),HARNESS_SHA,'Reviewed original preservation harness changed');assert.equal(hybridHash(helper),PRELOAD_SHA,'Reviewed output-only preload changed');
 await mkdir(BASE,{recursive:true});const preload=join(BASE,'output-redirect.mjs');
 try{await writeFile(preload,helper,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;const s=await lstat(preload);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1);assert.equal(hybridHash(await readFile(preload)),PRELOAD_SHA,'Refuse a different existing preload');}
 const runner=join(BASE,'preservation-runner-'+randomUUID()+'.mjs');await writeFile(runner,source,{flag:'wx'});return {runner,preload};
}
async function child(args,env,output,name){
 let stdout='',stderr='';const p=spawn(process.execPath,args,{cwd:ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>{stdout+=b;});p.stderr.on('data',b=>{stderr+=b;});const code=await new Promise((done,reject)=>{p.once('error',reject);p.once('close',done);});await writeFile(join(output,name+'.private.log'),stdout+'\n'+stderr,{flag:'wx'});
 if(code!==0)throw Error('Local acceptance failed at '+name+'; inspect its ignored redacted/private log.');
 return stdout.split(/\r?\n/).map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(v=>v&&typeof v==='object').at(-1)??null;
}
export async function runHybridLocalAcceptance({profile,ownedStack,outputRoot}){
 if(process.env.IILAS_HYBRID_LOCAL_PARENT_GO!=='GO')throw Error('Explicit local acceptance parent gate required.');
 const input=validateHybridLocalAcceptance({profile,ownedStack,outputRoot}),p=await readMobileProfile(input.profile),environment=await mobileLaunchEnvironment(input.profile,'Backend');
 const output=contained(input.outputRoot,BASE);try{await lstat(output);fail();}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(output,{recursive:true});
 const fullEnv={...process.env,...environment,FUNCTIONS_EMULATOR:'true',IILAS_FYP_PARENT_GO:'GO',IILAS_FYP_PROFILE_RECEIPT:resolve(ROOT,ownedStack.completionProfileReceipt)},originalEnv={...fullEnv,IILAS_TASK3_PARENT_GO:'GO'};
 for(const key of Object.keys(originalEnv))if(/^(RESEARCH_API_|IILAS_(STOCK_|DELIVERY_|PARCEL_|RESEARCH_TOKEN))/.test(key))delete originalEnv[key];
 const {runner}=await prepareHybridPreservationHarness();const run='hybrid-'+randomUUID().replaceAll('-','').slice(0,12),checks=[];
 for(const suite of ['baseline','preflight','accounts','smoke','qa','shared','retry','procurement','locations','capacity','verify']){
  await child([runner,'--suite',suite,'--run',run,'--attempt','01','--parent-go'],originalEnv,output,'original-'+suite);checks.push({name:'original-'+suite,passed:true});
 }
 for(const script of ['mobile-rules-qa.mjs','completion-rules-qa.mjs','customer-access-rules-qa.mjs','mobile-emulator-qa.mjs','inventory-demo-procurement-emulator-qa.mjs','inventory-demo-procurement-browser-qa.mjs','delivery-demo-emulator-qa.mjs','fyp-completion-emulator-qa.mjs']){
  const args=['scripts/'+script,...(script==='fyp-completion-emulator-qa.mjs'?['--parent-go']:[])],summary=await child(args,fullEnv,output,script.replace('.mjs',''));
  if(summary){assert.equal(summary.passed,true,script+' did not report passing');if(Object.hasOwn(summary,'cleanupComplete'))assert.equal(summary.cleanupComplete,true,script+' fixture cleanup incomplete');}
  checks.push({name:script,passed:true,...(summary?{summary}:{} )});
 }
 const receipt=makeHybridLocalReceipt({checks,preservation:{exact:true,originalHarnessSha256:HARNESS_SHA,run},bindings:{mobileProfileSha256:hybridHash(await readFile(input.profile)),completionProfileSha256:p.base.sha256},artifactPins:{}});await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return {...receipt,output};
}
if(process.argv.includes('--run-local')){const get=k=>process.argv[process.argv.indexOf(k)+1];if(!process.argv.includes('--parent-go')){console.error('Explicit local parent gate required.');process.exitCode=1;}else runHybridLocalAcceptance({profile:get('--profile'),outputRoot:get('--output'),ownedStack:{projectId:'fyp-inventory-and-logistics',webOrigin:'http://127.0.0.1:5173',completionProfileReceipt:get('--completion-receipt')}}).then(r=>console.log(JSON.stringify({passed:r.passed,checks:r.checks.length,output:r.output,cloudConnectivity:false,phoneAcceptance:false,parcelTesting:false}))).catch(e=>{console.error(e.message);process.exitCode=1;});}
