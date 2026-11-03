import test from 'node:test';
import assert from 'node:assert/strict';
import {sparkHash} from './spark-private-files.mjs';
const load=()=>import('./spark-ngrok.mjs').catch(()=>({}));
const token='fixture-not-a-real-credential-123456789';
test('native ngrok configuration admits only the token and version, never endpoints or alternate trust settings',async()=>{
 const {validateSparkNgrokConfiguration}=await load();assert.equal(typeof validateSparkNgrokConfiguration,'function');
 for(const text of [`version: "3"\nagent:\n    authtoken: ${token}\n`,`version: "2"\nauthtoken: '${token}'\n`]){
  const bytes=Buffer.from(text);assert.equal(validateSparkNgrokConfiguration(bytes,sparkHash(bytes)),true);
  assert.throws(()=>validateSparkNgrokConfiguration(bytes,'f'.repeat(64)));
  for(const extra of ['\nendpoints: []','\nconnect_url: https://wrong.invalid','\nagent:\n  authtoken: duplicate']){
   const changed=Buffer.from(text+extra);assert.throws(()=>validateSparkNgrokConfiguration(changed,sparkHash(changed)));
  }
 }
 const huge=Buffer.alloc(10000);assert.throws(()=>validateSparkNgrokConfiguration(huge,sparkHash(huge)));
});
test('ngrok launch binds the actual runtime approval, configuration hash and installed version to the assigned domain and only port 8011',async()=>{
 const {planSparkNgrok}=await load();assert.equal(typeof planSparkNgrok,'function');
 const preparationSha256='a'.repeat(64),configurationSha256='b'.repeat(64),version='ngrok version 3.39.11-msix-stable',loaded={receipt:{testMode:false},profile:{mode:'spark-msi',projectId:'fyp-inventory-and-logistics',apiOrigin:'https://octagon-magnetism-presoak.ngrok-free.dev',webOrigins:['https://fyp-inventory-and-logistics.web.app'],backendInstanceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},activation:{manifestSha256:'c'.repeat(64),approvedActions:['runtime','public-https']}};
 const approval={schema:'iilas-spark-ngrok-approval-1.0',preparationSha256,configurationSha256,activationSha256:loaded.activation.manifestSha256,agentVersion:version,apiOrigin:loaded.profile.apiOrigin,upstream:'http://127.0.0.1:8011',inspectionEnabled:false,billingMustRemainDisabled:true};
 const input={loaded,preparationSha256,configurationSha256,version,approval,inherited:{PATH:'preserve'}},plan=planSparkNgrok(input);
 assert(plan.args.includes('--inspect=false'));assert(plan.args.includes('--log=false'));assert.equal(plan.args[1],approval.upstream);assert.equal(plan.env.PATH,'preserve');assert(!plan.args.some(a=>a.includes(token)||a.includes('authtoken')));
 assert.equal(plan.args.at(-1),'C:/Users/Home/AppData/Local/Packages/ngrok.ngrok_1g87z0zv29zzc/LocalCache/Local/IILAS/credentials/ngrok.yml');
 for(const patch of [{upstream:'http://127.0.0.1:8545'},{inspectionEnabled:true},{configurationSha256:'d'.repeat(64)},{apiOrigin:'https://other.ngrok-free.dev'},{agentVersion:'ngrok version 1'}])assert.throws(()=>planSparkNgrok({...input,approval:{...approval,...patch}}));
 assert.throws(()=>planSparkNgrok({...input,approval:null}));assert.throws(()=>planSparkNgrok({...input,loaded:{...loaded,activation:{...loaded.activation,approvedActions:['runtime']}}}));assert.throws(()=>planSparkNgrok({...input,inherited:{NGROK_AUTHTOKEN:token}}));
});
