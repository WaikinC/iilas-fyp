import {completionExact,completionCanonical} from '../lib/completionWorkflow.js';
import {sparkHash,readSparkPrivate,verifySparkPins,sparkSourcePath} from './spark-private-files.mjs';
import {readSparkPreparation} from './prepare-spark-msi.mjs';
import {readExistingCloudBackup} from './hybrid-existing-adoption.mjs';
import {readSparkBackupObservation} from './spark-backup-observation.mjs';
import {validateSparkStaticName,validateSparkStaticBytes,validateSparkHostingConfig} from './spark-demo-stage.mjs';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {dirname,join,relative,isAbsolute,resolve} from 'node:path';
const fail=()=>{throw Error('Spark publication refused changed sources, artifacts, cloud resources or missing exact approval.');};
const stages=['firestore:indexes','firestore:rules','hosting'];
export function sparkPublicationExecutionMode(args){if(!Array.isArray(args)||args.filter(x=>x==='--execute'||x==='--dry-run').length!==1||args.includes('--force'))fail();return args.includes('--execute');}
export function publicationDigest(raw){const value={...raw};delete value.manifestSha256;return sparkHash(Buffer.from(completionCanonical(value)));}
export function validateSparkPublication(raw,approval){
 const p=completionExact(raw,['schema','projectId','websiteOrigin','apiOrigin','backendInstanceId','stage','sourceSha256','backupSha256','resourcesSha256','credentialSha256','profileSha256','adoptionSha256','billingEnabled','fixtureOnly','actions','manifestSha256']);
 const a=completionExact(approval,['manifestSha256','actions','billingMustRemainDisabled']);completionExact(p.stage,['path','sha256']);let api;try{api=new URL(p.apiOrigin);}catch{fail();}
 if(p.schema!=='iilas-spark-publication-1.0'||p.projectId!=='fyp-inventory-and-logistics'||p.websiteOrigin!=='https://fyp-inventory-and-logistics.web.app'||api.origin!==p.apiOrigin||api.protocol!=='https:'||!api.hostname.endsWith('.ngrok-free.dev')||p.billingEnabled!==false||p.fixtureOnly!==false||!/^[-a-f0-9]{36}$/.test(p.backendInstanceId)||p.manifestSha256!==publicationDigest(p)||a.manifestSha256!==p.manifestSha256||a.billingMustRemainDisabled!==true||JSON.stringify(p.actions)!==JSON.stringify(stages)||JSON.stringify(a.actions)!==JSON.stringify(stages)||[p.stage.sha256,...['sourceSha256','backupSha256','resourcesSha256','credentialSha256','profileSha256','adoptionSha256'].map(k=>p[k])].some(h=>!/^[a-f0-9]{64}$/.test(h)))fail();return p;
}
export async function verifySparkPublicationBackup(stage,packet,{readPrivate=readSparkPrivate,validateBackup=readExistingCloudBackup}={}){
 if(typeof stage.backupReceiptPath!=='string'||stage.backupSha256!==packet.backupSha256||sparkHash(await readPrivate(stage.backupReceiptPath))!==packet.backupSha256)fail();
 await validateBackup(stage.backupReceiptPath);return true;
}
export function validateSparkPublicationBindings({packet,stage,loaded,folder}){
 const configPath=join(folder,'firebase.spark.json');
 if(typeof stage.configPath!=='string'||resolve(stage.configPath)!==resolve(configPath)||loaded.receipt.sources.sha256!==packet.sourceSha256||loaded.receipt.profile.sha256!==packet.profileSha256||loaded.profile.projectId!==packet.projectId||loaded.profile.backendInstanceId!==packet.backendInstanceId||loaded.profile.apiOrigin!==packet.apiOrigin||JSON.stringify(loaded.profile.webOrigins)!==JSON.stringify([packet.websiteOrigin]))fail();return configPath;
}
export async function verifySparkPublicationFiles(packet){
 const bytes=await readSparkPrivate(packet.stage.path);if(sparkHash(bytes)!==packet.stage.sha256)fail();const stage=JSON.parse(bytes),folder=dirname(sparkSourcePath(packet.stage.path));
 if(stage.schema!=='iilas-spark-stage-1.0'||stage.fixtureOnly!==false||stage.projectId!==packet.projectId||stage.apiOrigin!==packet.apiOrigin||stage.websiteOrigin!==packet.websiteOrigin||stage.backendInstanceId!==packet.backendInstanceId||stage.sourceSha256!==packet.sourceSha256||stage.profileSha256!==packet.profileSha256||stage.backupSha256!==packet.backupSha256)fail();
 await verifySparkPublicationBackup(stage,packet);
 const loaded=await readSparkPreparation(stage.sourceReceipt,{allowUnactivated:true});if(loaded.serverConfig.credentialSha256!==packet.credentialSha256||loaded.profile.adoptionSha256!==packet.adoptionSha256)fail();verifySparkPins(loaded.sources);verifySparkPins(loaded.frozenPins);
 const configPath=validateSparkPublicationBindings({packet,stage,loaded,folder}),backupObservation=await readSparkBackupObservation(stage.backupReceiptPath);
 const config=validateSparkHostingConfig(JSON.parse(await readFile(configPath)));if(config.hosting.site!==packet.projectId)fail();
 const actual=[];async function walk(directory,prefix){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name),name=prefix+'/'+entry.name,s=await lstat(path);if(s.isSymbolicLink()||!s.isDirectory()&&s.nlink!==1)fail();if(s.isDirectory())await walk(path,name);else{validateSparkStaticName(name.slice(7));actual.push(name);}}}await walk(join(folder,'public'),'public');
 if(completionCanonical(actual.sort())!==completionCanonical(Object.keys(stage.files).filter(k=>k.startsWith('public/')).sort()))fail();
 for(const [name,hash]of Object.entries(stage.files)){if(!['firebase.spark.json','firestore.rules','firestore.indexes.json'].includes(name)&&!name.startsWith('public/'))fail();const path=join(folder,name),rel=relative(folder,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail();const data=await readFile(path);if(sparkHash(data)!==hash)fail();if(name.startsWith('public/'))validateSparkStaticBytes(data);}
 return {stage,loaded,folder,configPath,backupObservation};
}
export async function executeSparkCloudPublication({packet,approval,observe,verifyFiles=verifySparkPublicationFiles,run,record}){
 const p=validateSparkPublication(packet,approval);if([observe,verifyFiles,run,record].some(x=>typeof x!=='function'))fail();const completed=[];
 for(const stage of stages){
  const check=async phase=>{const o=await observe({stage,phase,completed:[...completed]});if(o?.projectId!==p.projectId||o.billingEnabled!==false||o.resourcesSha256!==p.resourcesSha256)fail();};
  await check('before');if(!await verifyFiles(p))fail();
  try{await run(stage);await check('after');await record({stage,passed:true});completed.push(stage);}catch(error){await record({stage,passed:false});throw error;}
 }return completed;
}
