import {spawn} from 'node:child_process';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve,join} from 'node:path';import {readMobileProfile,mobileLaunchEnvironment,MOBILE_ROOT} from './prepare-mobile-local.mjs';
const option=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];},profile=option('--profile'),role=option('--role');
try{
 if(!['Backend','StockResearch','DeliveryResearch'].includes(role))throw Error('Choose an approved non-parcel local role.');
 const p=await readMobileProfile(profile),env={...process.env};for(const k of Object.keys(env))if(/^(IILAS_|RESEARCH_API_)/.test(k))delete env[k];Object.assign(env,await mobileLaunchEnvironment(profile,role));env.PYTHONUTF8='1';let executable,argv;
 if(role==='Backend'){
  env.JAVA_TOOL_OPTIONS='-Xms128m -Xmx1024m -XX:MaxDirectMemorySize=256m';
  const receipt=JSON.parse(await readFile(option('--checkpoint-receipt'),'utf8'));if(receipt.passed!==true||!receipt.target||!receipt.files)throw Error('Verified current checkpoint required.');
  const checkpoint=resolve(receipt.target),root=resolve(MOBILE_ROOT,'outputs');if(!checkpoint.startsWith(root+'\\'))throw Error('Checkpoint must be an ignored local output.');
  for(const [name,pin]of Object.entries(receipt.files)){if(name.split(/[\\/]/).includes('..'))throw Error('Invalid checkpoint path');const bytes=await readFile(join(checkpoint,name));if(createHash('sha256').update(bytes).digest('hex')!==pin)throw Error('Checkpoint changed.');}
  executable=process.execPath;argv=['node_modules/firebase-tools/lib/bin/firebase.js','emulators:start','--project',p.projectId,'--only','auth,firestore,functions,storage','--import',checkpoint];
 }else{executable='C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe';argv=['-X','utf8',role==='StockResearch'?'research/serve_inventory_context_local_eval.py':'research/serve_delivery_demo_local_eval.py','serve','--port',role==='StockResearch'?'8001':'8002'];}
 const child=spawn(executable,argv,{cwd:MOBILE_ROOT,env,stdio:'inherit',windowsHide:true});child.on('error',()=>{console.error('Local mobile service could not start.');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}catch{console.error('Local mobile startup refused. Verify source-bound profile, local chain and current checkpoint.');process.exitCode=1;}
