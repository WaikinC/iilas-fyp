import test from 'node:test';
import assert from 'node:assert/strict';
import {readSparkPreparation} from './prepare-spark-msi.mjs';
import {validateSparkProfile} from '../lib/sparkRuntime.js';
import {readSparkPrivate,sparkHash,verifySparkPins} from './spark-private-files.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function sparkCloudAcceptanceExecutionMode(args){
 if(!Array.isArray(args)||args.includes('--force')||args.filter(x=>x==='--execute'||x==='--dry-run').length>1)throw Error('Cloud acceptance requires one unambiguous execution mode.');
 return args.includes('--execute');
}
export function validateSparkCloudAcceptance(profile,{activation,fixtureOnly,participants}){
 validateSparkProfile(profile,[profile]);if(fixtureOnly!==false||activation?.schema!=='iilas-spark-runtime-activation-1.0'||activation.projectId!==profile.projectId||activation.backendInstanceId!==profile.backendInstanceId||!Array.isArray(participants)||participants.length<2||new Set(participants.map(p=>p.uid)).size!==participants.length||participants.some(p=>!/^[-A-Za-z0-9_]{1,128}$/.test(p.uid)||p.emailVerified!==true||p.approved!==true))throw Error('Cloud acceptance requires activated real profile and distinct normally verified approved participants.');return true;
}
export async function inspectSparkCloudAcceptance({preparationPath,participantsPath}){
 const loaded=await readSparkPreparation(preparationPath),participants=JSON.parse(await readSparkPrivate(participantsPath));validateSparkCloudAcceptance(loaded.profile,{activation:loaded.activation,fixtureOnly:false,participants});verifySparkPins(loaded.sources);verifySparkPins(loaded.frozenPins);return {profile:loaded.profile,participants,preparationSha256:sparkHash(await readSparkPrivate(preparationPath))};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--profile')){const get=k=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:null;Promise.resolve().then(()=>{const execute=sparkCloudAcceptanceExecutionMode(process.argv.slice(2));return inspectSparkCloudAcceptance({preparationPath:get('--profile'),participantsPath:get('--participants')}).then(()=>execute);}).then(async execute=>{
  if(!execute){console.log(JSON.stringify({preflightValidated:true,cloudWrites:0,actualScenariosRun:false}));return;}
  if(get('--output')&&get('--receipt'))throw Error('Choose one receipt output.');
  const {runSparkCloudAcceptance}=await import('./spark-cloud-acceptance-runner.mjs');const result=await runSparkCloudAcceptance({preparationPath:get('--profile'),participantsPath:get('--participants'),approvalPath:get('--approval'),runId:get('--run-id'),outputRoot:get('--output')||get('--receipt')});console.log(JSON.stringify({passed:result.passed,softwareStepsPassed:result.softwareStepsPassed,completedChecks:result.checks.length,pending:result.pending,output:result.output}));if(!result.passed)process.exitCode=result.softwareStepsPassed?2:1;
 }).catch(()=>{console.error('Actual cloud acceptance refused unactivated/fixture inputs, missing approval/participants, or changed runtime. No fallback or automatic replay.');process.exitCode=1;});}
 else test('real cloud acceptance refuses emulator fixtures, missing activation and unverified participants',()=>{const p={schema:'iilas-spark-msi-1.0',mode:'spark-msi',projectId:'fyp-inventory-and-logistics',webOrigins:['https://fyp-inventory-and-logistics.web.app'],apiOrigin:'https://fixture.ngrok-free.dev',backendInstanceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',adoptionSha256:'a'.repeat(64),evidenceStore:'msi-local'},a={schema:'iilas-spark-runtime-activation-1.0',projectId:p.projectId,backendInstanceId:p.backendInstanceId},people=[{uid:'one',emailVerified:true,approved:true},{uid:'two',emailVerified:true,approved:true}];assert.equal(validateSparkCloudAcceptance(p,{activation:a,fixtureOnly:false,participants:people}),true);for(const patch of [{fixtureOnly:true},{activation:null},{participants:[people[0],people[0]]},{participants:[people[0],{...people[1],emailVerified:false}]}])assert.throws(()=>validateSparkCloudAcceptance(p,{activation:a,fixtureOnly:false,participants:people,...patch}));assert.throws(()=>validateSparkCloudAcceptance({...p,mode:'spark-loopback-test'},{activation:a,fixtureOnly:false,participants:people}));});
}
