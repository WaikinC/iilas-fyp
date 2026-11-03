import {mkdir,readFile,writeFile,readdir,copyFile,lstat} from 'node:fs/promises';
import {join,resolve,relative,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {completionExact,completionCanonical} from '../lib/completionWorkflow.js';
import {validateSparkRuntime} from '../lib/sparkRuntime.js';
import {readSparkPreparation} from './prepare-spark-msi.mjs';
import {readExistingCloudBackup} from './hybrid-existing-adoption.mjs';
import {SPARK_ROOT,sparkHash,sparkSourcePath,readSparkPrivate} from './spark-private-files.mjs';
import {normaliseSparkIndexFields} from './spark-cloud-observer.mjs';
const fail=()=>{throw Error('Spark static staging refused mixed, private, changed or billed resources.');};
export function validateSparkStaticBytes(bytes){
 if(!Buffer.isBuffer(bytes)||/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(bytes.toString('utf8'))||bytes.includes(Buffer.from('"private_key"')))fail();return true;
}
export function validateSparkStaticName(name){
 if(typeof name!=='string'||!(/^(?:index\.html|favicon\.svg|file\.svg|globe\.svg|window\.svg)$/.test(name)||/^assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg|png|jpe?g|webp|gif|woff2?|ttf)$/.test(name)))fail();return true;
}
export function validateSparkHostingConfig(raw){
 const c=completionExact(raw,['firestore','hosting']),f=completionExact(c.firestore,['rules','indexes']),h=completionExact(c.hosting,['site','public','ignore','rewrites']);
 if(f.rules!=='firestore.rules'||f.indexes!=='firestore.indexes.json'||h.site!=='fyp-inventory-and-logistics'||h.public!=='public'||JSON.stringify(h.ignore)!==JSON.stringify(['firebase.spark.json','**/.*','**/node_modules/**'])||completionCanonical(h.rewrites)!==completionCanonical([{source:'**',destination:'/index.html'}]))fail();return c;
}
async function indexSettings(backupPath){
 await readExistingCloudBackup(backupPath);const v=JSON.parse(await readSparkPrivate(backupPath)),r=JSON.parse(await readSparkPrivate(v.originalReceipt.receipt)),folder=dirname(v.originalReceipt.receipt);const overrides=[];
 for(const [name]of Object.entries({...r.files,...v.supplementalFiles}).filter(([name])=>/fields.*\.json$/i.test(name))){const data=JSON.parse(await readSparkPrivate(join(folder,name),16777216));for(const field of data.fields||[]){const match=/\/collectionGroups\/([^/]+)\/fields\/([^/]+)$/.exec(field.name||'');if(!match||!field.indexConfig)fail();const collectionGroup=decodeURIComponent(match[1]),fieldPath=decodeURIComponent(match[2]),indexes=[];for(const index of field.indexConfig.indexes||[]){const setting=(index.fields||[]).find(f=>f.fieldPath===fieldPath);if(!setting)fail();const entry={...(setting.order?{order:setting.order}:setting.arrayConfig?{arrayConfig:setting.arrayConfig}:{}),queryScope:index.queryScope};if(Object.keys(entry).length!==2)fail();indexes.push(entry);}if(field.ttlConfig&&field.ttlConfig.state!=='DISABLED')fail();overrides.push({collectionGroup,fieldPath,indexes});}}
 if(!Object.keys({...r.files,...v.supplementalFiles}).some(name=>/fields.*\.json$/i.test(name)))fail();return overrides;
}
export function mergeSparkIndexSettings(required,existing){
 if(!Array.isArray(required?.indexes)||!Array.isArray(existing?.indexes)||!Array.isArray(existing?.fieldOverrides)||required.fieldOverrides?.some(f=>f.collectionGroup==='__default__'))fail();const merged=structuredClone(required);merged.fieldOverrides??=[];merged.indexes=merged.indexes.map(i=>({...i,fields:normaliseSparkIndexFields(i.fields)}));
 for(const raw of existing.indexes){const index={...raw,fields:normaliseSparkIndexFields(raw.fields)};if(!merged.indexes.some(x=>completionCanonical(x)===completionCanonical(index)))merged.indexes.push(structuredClone(index));}
 // Firestore lists this virtual resource when observing database defaults.
 // The CLI deliberately omits it from deployable collection field overrides.
 for(const field of existing.fieldOverrides){if(field.collectionGroup==='__default__'){if(field.fieldPath!=='*')fail();continue;}const old=merged.fieldOverrides.find(f=>f.collectionGroup===field.collectionGroup&&f.fieldPath===field.fieldPath);if(old&&completionCanonical(old)!==completionCanonical(field))fail();if(!old)merged.fieldOverrides.push(structuredClone(field));}return merged;
}
async function compositeSettings(backupPath){
 const v=JSON.parse(await readSparkPrivate(backupPath)),folder=dirname(v.originalReceipt.receipt),indexes=[];
 const names=Object.keys(v.supplementalFiles).filter(name=>/^verified-indexes-.*\.json$/.test(name));if(!names.length)fail();
 for(const name of names){const data=JSON.parse(await readSparkPrivate(join(folder,name),16777216));for(const index of data.indexes||[]){const match=/\/collectionGroups\/([^/]+)\/indexes\/[^/]+$/.exec(index.name||'');if(!match||!Array.isArray(index.fields)||index.state!=='READY'||index.density&&index.density!=='SPARSE_ALL'||index.unique||index.multikey||index.shardCount||index.searchIndexOptions||index.apiScope&&index.apiScope!=='ANY_API')fail();indexes.push({collectionGroup:decodeURIComponent(match[1]),queryScope:index.queryScope,fields:normaliseSparkIndexFields(index.fields)});}}return indexes;
}
async function runBuild(env,output){const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:SPARK_ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});const status=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});await writeFile(join(output,'build.private.log'),log,{flag:'wx'});if(status!==0)fail();}
export async function stageSparkDemo({profilePath,sourceReceiptPath,outputRoot,backupReceiptPath}){
 const source=await readSparkPreparation(sourceReceiptPath,{allowUnactivated:true}),profileBytes=await readSparkPrivate(profilePath),profile=JSON.parse(profileBytes);validateSparkRuntime(profile,[profile]);if(sparkHash(profileBytes)!==source.receipt.profile.sha256)fail();if(profile.mode==='spark-msi'&&!backupReceiptPath)fail();const backupPath=backupReceiptPath||'outputs/existing-cloud-audit-20261028/verified-backup-receipt.json';
 const output=sparkSourcePath(outputRoot),base=resolve(SPARK_ROOT,'outputs/spark-msi-demo-20261028'),rel=relative(base,output);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();await mkdir(output,{recursive:false});const inputs=join(output,'inputs'),publicRoot=join(output,'public');await mkdir(inputs);await mkdir(publicRoot);
 const options=JSON.parse(await readFile(join(SPARK_ROOT,'firebase-config.json'),'utf8'));if(options.projectId!==profile.projectId)fail();const client=Object.fromEntries(['apiKey','appId','projectId','authDomain','messagingSenderId','measurementId'].filter(k=>options[k]!==undefined).map(k=>[k,options[k]]));
 for(const [name,value]of Object.entries({'firebase-config.json':client,'demo-environment.json':profile,'demo-allowlist.json':[profile]}))await writeFile(join(inputs,name),JSON.stringify(value),{flag:'wx'});
 await runBuild({...process.env,IILAS_WEB_BUILD_INPUT:inputs},output);const files={};async function copy(folder,relativeFolder=''){for(const e of await readdir(folder,{withFileTypes:true})){const path=join(folder,e.name),name=relativeFolder?relativeFolder+'/'+e.name:e.name,s=await lstat(path);if(s.isSymbolicLink()||!e.isDirectory()&&s.nlink!==1)fail();if(e.isDirectory()){await mkdir(join(publicRoot,name));await copy(path,name);}else{validateSparkStaticName(name);const bytes=await readFile(path);validateSparkStaticBytes(bytes);await copyFile(path,join(publicRoot,name));files['public/'+name]=sparkHash(bytes);}}}await copy(join(SPARK_ROOT,'dist/client'));
 const config=validateSparkHostingConfig({firestore:{rules:'firestore.rules',indexes:'firestore.indexes.json'},hosting:{site:profile.projectId,public:'public',ignore:['firebase.spark.json','**/.*','**/node_modules/**'],rewrites:[{source:'**',destination:'/index.html'}]}});
 const existing=await indexSettings(backupPath),indexes=mergeSparkIndexSettings(JSON.parse(await readFile(join(SPARK_ROOT,'firestore.indexes.json'),'utf8')),{indexes:await compositeSettings(backupPath),fieldOverrides:existing});
 const staged={'firebase.spark.json':Buffer.from(JSON.stringify(config,null,2)),'firestore.rules':await readFile(join(SPARK_ROOT,'firestore.rules')),'firestore.indexes.json':Buffer.from(JSON.stringify(indexes,null,2))};
 for(const [name,bytes]of Object.entries(staged)){await writeFile(join(output,name),bytes,{flag:'wx'});files[name]=sparkHash(bytes);}
 const fixtureOnly=profile.mode!=='spark-msi',value={schema:'iilas-spark-stage-1.0',projectId:profile.projectId,websiteOrigin:'https://fyp-inventory-and-logistics.web.app',apiOrigin:profile.apiOrigin,backendInstanceId:profile.backendInstanceId,billingEnabled:false,fixtureOnly,activationReady:false,existingIndexSettingsPreserved:true,files,sourceReceipt:sourceReceiptPath,sourceSha256:source.receipt.sources.sha256,profileSha256:sparkHash(profileBytes),backupReceiptPath:backupPath,backupSha256:sparkHash(await readSparkPrivate(backupPath)),configPath:join(output,'firebase.spark.json')};await writeFile(join(output,'stage.private.json'),JSON.stringify(value,null,2),{flag:'wx'});return {path:join(output,'stage.private.json'),sha256:sparkHash(Buffer.from(JSON.stringify(value,null,2))),fixtureOnly,activationReady:false};
}
export function buildSparkActivationManifest({stage,backup,observedResources,identityProposal,httpsProposal}){
 if(stage?.schema!=='iilas-spark-stage-1.0'||backup?.billingEnabled!==false||observedResources?.billingEnabled!==false||httpsProposal?.apiOrigin!==stage.apiOrigin||!identityProposal?.email)fail();return {schema:'iilas-spark-activation-draft-1.0',projectId:stage.projectId,billingEnabled:false,fixtureOnly:true,stage,backupReceiptSha256:backup.receiptSha256,resources:observedResources,primaryAdminUid:backup.admin.uid,dataScopeId:backup.admin.uid,retainExisting:true,mergeOtherOwners:false,importLocalSnapshot:false,identityProposal,httpsProposal,approval:null};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const get=k=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]:undefined;stageSparkDemo({profilePath:get('--profile'),sourceReceiptPath:get('--sources'),outputRoot:get('--output'),backupReceiptPath:get('--backup')}).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Spark static staging failed. No cloud deployment occurred.');process.exitCode=1;});}
