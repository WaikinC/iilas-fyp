import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {resolve,relative,isAbsolute,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {inventoryAILaunchEnvironment,inventoryAIStockService} from './prepare-inventory-ai-local.mjs';
import {DELIVERY_SOURCE_FILES} from '../backend/functions/deliveryDemoAI.mjs';
import {DELIVERY_PROTOCOL,DELIVERY_FEATURES,DELIVERY_CLASSES,DELIVERY_PROVENANCE} from '../lib/deliveryRiskDemo.js';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),BASE=resolve(ROOT,'outputs/delivery-ai-20261024'),HASH=/^[a-f0-9]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
async function safe(value,base=ROOT){
 if(typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value)||value.split(/[\\/]/).includes('..'))throw Error('Invalid local metadata path.');
 const p=resolve(ROOT,value),rel=relative(base,p);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Metadata is outside its allowed local area.');
 execFileSync('git',['check-ignore','-q','--',relative(ROOT,p)],{cwd:ROOT,stdio:'pipe'});
 let cursor=ROOT;for(const part of relative(ROOT,p).split(/[\\/]/)){cursor=join(cursor,part);try{if((await lstat(cursor)).isSymbolicLink())throw Error('Linked local metadata refused.');}catch(e){if(e.code!=='ENOENT')throw e;}}return p;
}
async function bound(binding,base=ROOT){if(!binding||!HASH.test(binding.sha256))throw Error('Invalid metadata binding.');const p=await safe(binding.path,base),s=await lstat(p);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('Invalid metadata file.');const bytes=await readFile(p);if(sha(bytes)!==binding.sha256)throw Error('Local metadata changed.');return JSON.parse(bytes);}
async function deliveryBinding(binding){
 const m=await bound(binding,resolve(ROOT,'research/datasets/delivery-demo-serving-v1'));
 if(m.protocol!==DELIVERY_PROTOCOL||JSON.stringify(m.features)!==JSON.stringify(DELIVERY_FEATURES)||JSON.stringify(m.classes)!==JSON.stringify(DELIVERY_CLASSES)||!m.provenance)throw Error('Invalid delivery protocol.');
 for(const [k,v]of Object.entries(DELIVERY_PROVENANCE))if(m.provenance[k]!==v)throw Error('Delivery provenance changed.');
 if(!m.sourcePins||JSON.stringify(Object.keys(m.sourcePins).sort())!==JSON.stringify([...DELIVERY_SOURCE_FILES].sort()))throw Error('Delivery source list differs.');
 for(const file of DELIVERY_SOURCE_FILES)if(sha(await readFile(resolve(ROOT,file)))!==m.sourcePins[file])throw Error('Delivery source changed. Prepare fresh immutable metadata.');return m;
}
async function baseProfile(binding){const p=await bound(binding);if(p.schema!=='inventory-local-profile-5.0')throw Error('Delivery demo requires the preserved schema5 base profile.');await inventoryAILaunchEnvironment(binding.path,'Backend');return p;}
async function checked(profile){
 const file=await safe(profile,BASE),s=await lstat(file);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('Invalid delivery profile file.');const p=JSON.parse(await readFile(file,'utf8'));
 if(p.schema!=='delivery-local-profile-1.0'||p.url!=='http://127.0.0.1:8002'||p.projectId!=='fyp-inventory-and-logistics'||p.mode!=='simulated'||!/^[-_A-Za-z0-9]{43}$/.test(p.token||''))throw Error('Invalid delivery local capability.');
 await baseProfile(p.base);await deliveryBinding(p.delivery);return p;
}
export async function prepareDeliveryAIProfile({output,baseProfile:basePath,delivery}){
 const directory=await safe(output,BASE);if(!/^profile-[a-f0-9-]{36}$/.test(basename(directory)))throw Error('A fresh profile UUID directory is required.');
 const base={path:await safe(basePath),sha256:sha(await readFile(await safe(basePath)))};await baseProfile(base);await deliveryBinding(delivery);
 await mkdir(directory,{recursive:false});const p={schema:'delivery-local-profile-1.0',projectId:'fyp-inventory-and-logistics',mode:'simulated',url:'http://127.0.0.1:8002',token:randomBytes(32).toString('base64url'),base,delivery:{path:resolve(delivery.path),sha256:delivery.sha256}};
 await writeFile(join(directory,'private.json'),JSON.stringify(p,null,2)+'\n',{flag:'wx',mode:0o600});const receipt={schema:p.schema,profile:join(directory,'private.json'),baseProfileSha256:base.sha256,deliveryManifestSha256:delivery.sha256,operationallyApproved:false};await writeFile(join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt;
}
export async function deliveryAILaunchEnvironment(profile,role){
 const p=await checked(profile);
 if(role==='DeliveryResearch')return {IILAS_DELIVERY_SERVICE_TOKEN:p.token,IILAS_DELIVERY_SERVING_MANIFEST:p.delivery.path,IILAS_DELIVERY_SERVING_MANIFEST_SHA256:p.delivery.sha256};
 const env=await inventoryAILaunchEnvironment(p.base.path,role);
 if(role!=='Backend')return env;
 return {...env,IILAS_DELIVERY_DEMO_MODE:'simulated',IILAS_DELIVERY_API_URL:p.url,IILAS_DELIVERY_API_TOKEN:p.token,IILAS_DELIVERY_MANIFEST_PATH:p.delivery.path,IILAS_DELIVERY_MANIFEST_SHA256:p.delivery.sha256};
}
async function main(){
 const [command,...args]=process.argv.slice(2),o={};for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1]||Object.hasOwn(o,args[i].slice(2)))throw Error('Use unique named local options.');o[args[i].slice(2)]=args[i+1];}
 if(command==='prepare'){console.log(JSON.stringify(await prepareDeliveryAIProfile({output:o.output,baseProfile:o['base-profile'],delivery:{path:o['delivery-manifest'],sha256:o['delivery-sha256']}})));return;}
 if(command!=='launch'||!['Backend','DeliveryResearch','StockResearch','ParcelResearch'].includes(o.role))throw Error('Choose a valid local launch role.');
 const env={...process.env};for(const name of Object.keys(env))if(/^(IILAS_(DELIVERY_|STOCK_|PARCEL_|RESEARCH_TOKEN)|RESEARCH_API_)/.test(name))delete env[name];Object.assign(env,await deliveryAILaunchEnvironment(o.profile,o.role));
 let executable,argv;
 if(o.role==='Backend'){const checkpoint=await safe(o.import);await lstat(join(checkpoint,'firebase-export-metadata.json'));executable=process.execPath;argv=[join(ROOT,'node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:start','--project','fyp-inventory-and-logistics','--only','auth,firestore,functions,storage','--import',checkpoint];}
 else{executable='C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe';const p=await checked(o.profile);argv=[join(ROOT,o.role==='DeliveryResearch'?'research/serve_delivery_demo_local_eval.py':o.role==='StockResearch'?await inventoryAIStockService(p.base.path):'research/serve_parcel_local_eval.py'),'serve','--port',o.role==='DeliveryResearch'?'8002':o.role==='StockResearch'?'8001':'8000'];}
 const child=spawn(executable,argv,{cwd:ROOT,env,stdio:'inherit',windowsHide:true});child.on('error',()=>{console.error('Local service could not start.');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Local delivery profile operation failed. Check ignored metadata and source bindings.');process.exitCode=1;});
