import {dirname,join} from 'node:path';
import {readExistingCloudBackup} from './hybrid-existing-adoption.mjs';
import {readSparkPrivate,sparkHash} from './spark-private-files.mjs';
import {sparkCloudStateDigest,normaliseSparkIndexes} from './spark-cloud-observer.mjs';
const fail=()=>{throw Error('The verified backup does not match the approved current cloud baseline. Capture a fresh backup; do not restore old data.');};
const keys=['projectId','billingEnabled','documentsSha256','accountsSha256','iamSha256','servicesSha256','primaryAdminUid','adminEmailVerified','systemConfigPresent','userProfiles','indexSettings','rulesSourceSha256','hosting'];
export function assertSparkBackupMatchesObservation(backupState,baseline){
 if(!backupState||!baseline||Object.keys(backupState).length!==keys.length||Object.keys(baseline).length!==keys.length||keys.some(k=>!Object.hasOwn(backupState,k)||!Object.hasOwn(baseline,k)||sparkCloudStateDigest(backupState[k])!==sparkCloudStateDigest(baseline[k]))||baseline.projectId!=='fyp-inventory-and-logistics'||baseline.billingEnabled!==false)fail();return true;
}
export async function readSparkBackupObservation(path){
 const backup=await readExistingCloudBackup(path),verification=JSON.parse(await readSparkPrivate(path)),rawBytes=await readSparkPrivate(verification.originalReceipt.receipt),raw=JSON.parse(rawBytes),folder=dirname(verification.originalReceipt.receipt);
 if(sparkHash(rawBytes)!==verification.originalReceipt.sha256||raw.components.firestore.databases.length!==1||raw.components.firestore.databases[0].database!=='projects/fyp-inventory-and-logistics/databases/(default)')fail();
 const values={};for(const [name,pin]of Object.entries({...raw.files,...verification.supplementalFiles})){if(!name.endsWith('.json'))continue;const bytes=await readSparkPrivate(join(folder,name),16*1024*1024);if(sparkHash(bytes)!==pin.sha256||bytes.length!==pin.bytes)fail();values[name]=JSON.parse(bytes);}
 const users=values['auth-users.private.json']?.users,services=values['enabled-services.private.json']?.services,iam=values['iam-policy.private.json'],release=values['rules-releases.private.json']?.releases?.find(r=>r.name==='projects/fyp-inventory-and-logistics/releases/cloud.firestore'),hosting=values['hosting-assets-fyp-inventory-and-logistics.private.json'];
 if(!Array.isArray(users)||!Array.isArray(services)||!iam||!release||hosting?.stableReleaseDuringCapture!==true||!Array.isArray(hosting.files))fail();
 const rules=values['ruleset-'+sparkHash(Buffer.from(release.rulesetName)).slice(0,16)+'.private.json'];if(rules?.source?.files?.length!==1)fail();
 const indexes=[],fields=[];let indexFiles=0,fieldFiles=0;for(const [name,data]of Object.entries(values)){if(/^verified-indexes-.*\.json$/.test(name)){indexFiles++;indexes.push(...data.indexes);}if(/^verified-fields-.*\.json$/.test(name)){fieldFiles++;fields.push(...data.fields);}}if(indexFiles!==1||fieldFiles!==1)fail();
 const hostingFiles={};for(const file of hosting.files){if(typeof file.path!=='string'||!file.path.startsWith('/')||typeof file.downloadSha256!=='string'||hostingFiles[file.path.slice(1)])fail();hostingFiles[file.path.slice(1)]=file.downloadSha256;}
 return {projectId:'fyp-inventory-and-logistics',billingEnabled:backup.billingEnabled,documentsSha256:sparkCloudStateDigest([...backup.documents].sort((a,b)=>a.name.localeCompare(b.name))),accountsSha256:sparkCloudStateDigest([...users].sort((a,b)=>a.localId.localeCompare(b.localId))),iamSha256:sparkCloudStateDigest(iam),servicesSha256:sparkCloudStateDigest([...services].sort((a,b)=>a.name.localeCompare(b.name))),primaryAdminUid:backup.admin.uid,adminEmailVerified:backup.admin.emailVerified,systemConfigPresent:false,userProfiles:0,indexSettings:normaliseSparkIndexes(indexes,fields),rulesSourceSha256:sparkHash(Buffer.from(rules.source.files[0].content)),hosting:{version:hosting.versionName,files:hostingFiles}};
}
