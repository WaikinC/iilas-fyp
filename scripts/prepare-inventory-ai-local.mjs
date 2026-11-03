import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {resolve,relative,isAbsolute,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),BASE=resolve(ROOT,'outputs/inventory-ai-20261023'),HASH=/^[a-f0-9]{64}$/;
const sha=x=>createHash('sha256').update(x).digest('hex');
async function safePath(value,{output=false}={}){
 if(typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value)||value.split(/[\\/]/).includes('..'))throw Error('Invalid private profile path.');
 const path=resolve(ROOT,value),rel=relative(output?BASE:ROOT,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Private profile path is outside its local area.');
 execFileSync('git',['check-ignore','-q','--',relative(ROOT,path)],{cwd:ROOT,stdio:'pipe'});
 let current=ROOT;for(const part of relative(ROOT,path).split(/[\\/]/)){current=join(current,part);try{if((await lstat(current)).isSymbolicLink())throw Error('Linked private profile refused.');}catch(e){if(e.code!=='ENOENT')throw e;}}
 return path;
}
async function boundFile(binding){if(!binding||!HASH.test(binding.sha256))throw Error('Invalid manifest hash.');const path=await safePath(binding.path),s=await lstat(path);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('Invalid private metadata file.');const bytes=await readFile(path);if(sha(bytes)!==binding.sha256)throw Error('Private metadata changed.');return JSON.parse(bytes);}
async function stockBinding(binding){const m=await boundFile(binding);if(!m.sourcePins||typeof m.sourcePins!=='object')throw Error('Missing stock source pins.');for(const [file,pin] of Object.entries(m.sourcePins)){const path=resolve(ROOT,file),rel=relative(ROOT,path);if(!rel||rel.startsWith('..')||isAbsolute(rel)||!HASH.test(pin)||sha(await readFile(path))!==pin)throw Error('Stock source changed. Prepare a new immutable profile.');}return m;}
function stockVersion(m){if(m.schema==='inventory-context-local-serving-2.0'&&m.protocol==='inventory-context-inference-2.0')return 2;if(m.schema==='inventory-local-serving-1.0'&&m.protocol==='inventory-synthetic-inference-1.0')return 1;throw Error('Unsupported stock manifest protocol.');}
async function checkedProfile(path){
 const p=await boundProfile(path),version=stockVersion(await stockBinding(p.stock));
 const procurement=p.schema==='inventory-local-profile-5.0',workflow=procurement||p.schema==='inventory-local-profile-4.0',demo=workflow||p.schema==='inventory-local-profile-3.0';
 if(workflow?p.stockWorkflowMode!==(procurement?'demo-risk-review-and-procurement':'demo-risk-review'):Object.hasOwn(p,'stockWorkflowMode'))throw Error('Mixed stock workflow profile.');
 if(demo?(version!==2||p.stockProtocol!=='inventory-context-inference-2.0'||p.stockDataMode!=='demonstration-products'):(p.schema!==`inventory-local-profile-${version}.0`||Object.hasOwn(p,'stockDataMode')||(version===2?p.stockProtocol!=='inventory-context-inference-2.0':Object.hasOwn(p,'stockProtocol'))))throw Error('Mixed stock profile and manifest.');
 await boundFile({path:p.targetManifest,sha256:p.manifestSha256});return p;
}
async function boundProfile(path){const file=await safePath(path),s=await lstat(file);if(!s.isFile()||s.nlink!==1||s.size>65536)throw Error('Invalid private profile file.');const p=JSON.parse(await readFile(file,'utf8'));if(p.projectId!=='fyp-inventory-and-logistics'||p.storageBucket!=='fyp-inventory-and-logistics.firebasestorage.app'||p.researchUrl!=='http://127.0.0.1:8000'||typeof p.token!=='string'||!p.token||!/^[A-Za-z0-9_-]{43}$/.test(p.stockToken||''))throw Error('Invalid local stock profile.');return p;}
export async function inventoryAIStockService(path){return ['inventory-local-profile-2.0','inventory-local-profile-3.0','inventory-local-profile-4.0','inventory-local-profile-5.0'].includes((await checkedProfile(path)).schema)?'research/serve_inventory_context_local_eval.py':'research/serve_inventory_local_eval.py';}
export async function prepareInventoryAIProfile({output,previous,stock,parcel,demoProducts=false,demoReorders=false,demoProcurement=false}){
 if(typeof demoProcurement!=='boolean'||(demoProcurement&&(!demoProducts||!demoReorders)))throw Error('Demo procurement requires explicit products and reorders.');
 if(typeof demoReorders!=='boolean'||(demoReorders&&!demoProducts))throw Error('Demo reorders require explicit demo products.');
 if(typeof demoProducts!=='boolean')throw Error('Choose an explicit demo-products boolean.');
 const directory=await safePath(output,{output:true});if(!/^profile-[0-9a-f-]{36}$/.test(basename(directory)))throw Error('Fresh profile UUID directory required.');
 const prior=JSON.parse(await readFile(await safePath(previous),'utf8'));
 if(prior.projectId!=='fyp-inventory-and-logistics'||prior.storageBucket!=='fyp-inventory-and-logistics.firebasestorage.app'||prior.researchUrl!=='http://127.0.0.1:8000'||typeof prior.token!=='string'||!prior.token)throw Error('Existing local parcel configuration is incomplete.');
 const version=stockVersion(await stockBinding(stock));if(demoProducts&&version!==2)throw Error('Demo products require the context stock protocol.');await boundFile(parcel);await mkdir(directory,{recursive:false});
 const privateConfig={schema:`inventory-local-profile-${demoProcurement?5:demoReorders?4:demoProducts?3:version}.0`,...(demoProducts?{stockDataMode:'demonstration-products'}:{}),...(demoReorders?{stockWorkflowMode:demoProcurement?'demo-risk-review-and-procurement':'demo-risk-review'}:{}),...(version===2?{stockProtocol:'inventory-context-inference-2.0'}:{}),projectId:prior.projectId,storageBucket:prior.storageBucket,researchUrl:prior.researchUrl,token:prior.token,targetManifest:resolve(ROOT,parcel.path),manifestSha256:parcel.sha256,stock:{path:resolve(ROOT,stock.path),sha256:stock.sha256},stockToken:randomBytes(32).toString('base64url')};
 await writeFile(join(directory,'private.json'),JSON.stringify(privateConfig,null,2)+'\n',{flag:'wx',mode:0o600});
 const receipt={schema:privateConfig.schema,profile:join(directory,'private.json'),stockManifestSha256:stock.sha256,parcelManifestSha256:parcel.sha256,operationallyApproved:false,demoProductsEnabled:demoProducts,demoReordersEnabled:demoReorders,demoProcurementEnabled:demoProcurement};
 await writeFile(join(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 return receipt;
}
export async function inventoryAILaunchEnvironment(profile,role){
 const p=await checkedProfile(profile);
 if(role==='StockResearch')return {IILAS_STOCK_DEMO_PROCUREMENT:'disabled',IILAS_STOCK_DEMO_PRODUCTS:'disabled',IILAS_STOCK_DEMO_REORDERS:'disabled',IILAS_STOCK_SERVICE_TOKEN:p.stockToken,IILAS_STOCK_SERVING_MANIFEST:p.stock.path,IILAS_STOCK_SERVING_MANIFEST_SHA256:p.stock.sha256};
 const parcel={IILAS_PARCEL_LOCAL_EVAL_MANIFEST:p.targetManifest,IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256:p.manifestSha256};
 if(role==='ParcelResearch')return {...parcel,IILAS_STOCK_DEMO_PROCUREMENT:'disabled',IILAS_STOCK_DEMO_PRODUCTS:'disabled',IILAS_STOCK_DEMO_REORDERS:'disabled',IILAS_RESEARCH_TOKEN:p.token};
 if(role!=='Backend')throw Error('Choose Backend, StockResearch or ParcelResearch.');
 return {...parcel,IILAS_STOCK_DEMO_PROCUREMENT:p.schema==='inventory-local-profile-5.0'?'enabled':'disabled',IILAS_STOCK_DEMO_PRODUCTS:['inventory-local-profile-3.0','inventory-local-profile-4.0','inventory-local-profile-5.0'].includes(p.schema)?'enabled':'disabled',IILAS_STOCK_DEMO_REORDERS:['inventory-local-profile-4.0','inventory-local-profile-5.0'].includes(p.schema)?'enabled':'disabled',GCLOUD_PROJECT:p.projectId,GOOGLE_CLOUD_PROJECT:p.projectId,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_BOOTSTRAP_ADMIN_EMAIL:'choongkin6@gmail.com',RESEARCH_API_URL:p.researchUrl,RESEARCH_API_TOKEN:p.token,IILAS_STOCK_API_URL:'http://127.0.0.1:8001',IILAS_STOCK_API_TOKEN:p.stockToken,IILAS_STOCK_MANIFEST_PATH:p.stock.path,IILAS_STOCK_MANIFEST_SHA256:p.stock.sha256};
}
async function main(){
 const [command,...args]=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Use named local profile options.');options[args[i].slice(2)]=args[i+1];}
 if(options['demo-products']!==undefined&&!['enabled','disabled'].includes(options['demo-products']))throw Error('Choose enabled or disabled for demo-products.');
 if(options['demo-reorders']!==undefined&&!['enabled','disabled'].includes(options['demo-reorders']))throw Error('Choose enabled or disabled for demo-reorders.');
 if(options['demo-procurement']!==undefined&&!['enabled','disabled'].includes(options['demo-procurement']))throw Error('Choose enabled or disabled for demo-procurement.');
 if(command==='prepare'){const receipt=await prepareInventoryAIProfile({demoProcurement:options['demo-procurement']==='enabled',demoProducts:options['demo-products']==='enabled',demoReorders:options['demo-reorders']==='enabled',output:options.output,previous:options.previous,stock:{path:options['stock-manifest'],sha256:options['stock-sha256']},parcel:{path:options['parcel-manifest'],sha256:options['parcel-sha256']}});console.log(JSON.stringify(receipt));return;}
 if(command!=='launch')throw Error('Use prepare or launch.');
 const env={...process.env,...await inventoryAILaunchEnvironment(options.profile,options.role)};
 // Stock-only launch inherits no parcel/old factory settings; service factories stay separate.
 if(options.role==='StockResearch')for(const name of Object.keys(env))if(name.startsWith('IILAS_PARCEL_')||['RESEARCH_API_TOKEN','RESEARCH_API_URL','IILAS_RESEARCH_TOKEN'].includes(name))delete env[name];
 let executable,argv;
 if(options.role==='Backend'){
  const checkpoint=await safePath(options.import);await lstat(join(checkpoint,'firebase-export-metadata.json'));
  executable=process.execPath;argv=[join(ROOT,'node_modules/firebase-tools/lib/bin/firebase.js'),'emulators:start','--project','fyp-inventory-and-logistics','--only','auth,firestore,functions,storage','--import',checkpoint];
 }else{executable='C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe';argv=[join(ROOT,options.role==='StockResearch'?await inventoryAIStockService(options.profile):'research/serve_parcel_local_eval.py'),'serve','--port',options.role==='StockResearch'?'8001':'8000'];}
 const child=spawn(executable,argv,{cwd:ROOT,env,stdio:'inherit',windowsHide:true});child.on('error',()=>{console.error('Local service could not start.');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Local profile operation failed. Check ignored metadata paths and current source bindings.');process.exitCode=1;});
