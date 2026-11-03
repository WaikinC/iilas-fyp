import {readFile,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {completionExact,completionCanonical} from '../lib/completionWorkflow.js';
import {hybridHash} from '../backend/functions/hybridSigning.mjs';

export const EXISTING_CLOUD_PROJECT='fyp-inventory-and-logistics';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),knownBackups=new WeakSet(),pin=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
// Backup content is already JSON/typed-value validated and can exceed command DTO limits.
// Only its digest is placed in an adoption DTO; command validation keeps its existing bounds.
const digest=v=>{const text=JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);if(Buffer.byteLength(text)>16*1024*1024)fail();return hybridHash(text);};
const fail=()=>{throw Error('Existing cloud adoption refused incomplete, changed or unauthorised inputs.');};
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function sourcePins(v){if(!v||typeof v!=='object'||Array.isArray(v)||!Object.keys(v).length||Object.entries(v).some(([name,p])=>!/^[-A-Za-z0-9_./]+$/.test(name)||name.startsWith('/')||name.split('/').some(s=>!s||s==='.'||s==='..')||!pin(p)))fail();return v;}
async function privateFile(input){
 if(typeof input!=='string')fail();const p=resolve(ROOT,input),rel=relative(ROOT,p);if(!rel||rel.startsWith('..')||isAbsolute(rel)||!rel.replaceAll('\\','/').startsWith('outputs/'))fail();
 let current=ROOT;for(const part of rel.split(/[\\/]/)){current=join(current,part);const s=await lstat(current);if(s.isSymbolicLink()||s.isFile()&&(s.nlink!==1||s.size>16*1024*1024))fail();}execFileSync('git',['check-ignore','-q','--',rel],{cwd:ROOT,stdio:'pipe'});return p;
}
function typedValue(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1)fail();const type=Object.keys(value)[0],v=value[type];
 if(type==='mapValue'){if(!v||typeof v!=='object'||Object.keys(v).some(k=>k!=='fields')||v.fields&&typeof v.fields!=='object')fail();for(const x of Object.values(v.fields||{}))typedValue(x);}
 else if(type==='arrayValue'){if(!v||typeof v!=='object'||Object.keys(v).some(k=>k!=='values')||v.values&&!Array.isArray(v.values))fail();for(const x of v.values||[])typedValue(x);}
 else if(type==='integerValue'){if(typeof v!=='string'||!/^[-]?[0-9]+$/.test(v))fail();const n=BigInt(v);if(n<-(2n**63n)||n>2n**63n-1n)fail();}
 else if(type==='timestampValue'){if(typeof v!=='string'||Number.isNaN(Date.parse(v)))fail();}
 else if(type==='nullValue'){if(v!==null)fail();}
 else if(type==='booleanValue'){if(typeof v!=='boolean')fail();}
 else if(type==='doubleValue'){if(!(typeof v==='number'&&Number.isFinite(v))&&!['NaN','Infinity','-Infinity'].includes(v))fail();}
 else if(['stringValue','bytesValue','referenceValue'].includes(type)){if(typeof v!=='string')fail();}
 else if(type==='geoPointValue'){if(!v||typeof v.latitude!=='number'||typeof v.longitude!=='number'||Math.abs(v.latitude)>90||Math.abs(v.longitude)>180)fail();}
 else fail();
}
export async function readExistingCloudBackup(verificationReceiptPath){
 const path=await privateFile(verificationReceiptPath),bytes=await readFile(path),v=JSON.parse(bytes.toString('utf8'));
 if(v.passed!==true||v.projectId!==EXISTING_CLOUD_PROJECT||v.localEmulatorDataUsed!==false||v.hashConfigVerified!==true||v.firestoreTypedValuesPreserved!==true||v.cloudWrites!==0||v.billingChanged!==false||!pin(v.originalReceipt?.sha256))fail();
 const originalPath=await privateFile(v.originalReceipt.receipt),originalBytes=await readFile(originalPath);if(hybridHash(originalBytes)!==v.originalReceipt.sha256)fail();const r=JSON.parse(originalBytes.toString('utf8')),folder=dirname(originalPath);
 if(r.projectId!==EXISTING_CLOUD_PROJECT||r.mode!=='read-only'||r.cloudWrites!==0||r.billingChanged!==false||['firestore','rules','hosting','storage'].some(k=>r.components?.[k]?.complete!==true))fail();
 const values={},files={...r.files,...v.supplementalFiles};if(!Object.keys(files).length)fail();
 for(const [name,record]of Object.entries(files)){if(!/^[a-zA-Z0-9_.-]+$/.test(name)||!pin(record.sha256))fail();const data=await readFile(await privateFile(join(folder,name)));if(data.length!==record.bytes||hybridHash(data)!==record.sha256)fail();if(name.endsWith('.json'))values[name]=JSON.parse(data.toString('utf8'));}
 const users=values['auth-users.private.json']?.users,config=values['auth-config.private.json'],hash=config?.signIn?.hashConfig;
 if(!Array.isArray(users)||new Set(users.map(u=>u.localId)).size!==users.length||!hash?.algorithm||users.some(u=>u.passwordHash&&hash.algorithm==='SCRYPT'&&(!hash.signerKey||typeof hash.rounds!=='number'||typeof hash.memoryCost!=='number')))fail();
 const admins=users.filter(u=>u.email?.toLowerCase()==='choongkin6@gmail.com');if(admins.length!==1||typeof admins[0].localId!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(admins[0].localId)||admins[0].disabled===true)fail();
 const documents=[],seen=new Set();for(const database of r.components.firestore.databases||[]){const raw=values[database.file];if(!raw||raw.database!==database.database||!raw.database.startsWith(`projects/${EXISTING_CLOUD_PROJECT}/databases/`)||!Array.isArray(raw.documents)||Number.isNaN(Date.parse(raw.readTime)))fail();for(const doc of raw.documents){
   if(typeof doc.name!=='string'||!doc.name.startsWith(raw.database+'/documents/')||seen.has(doc.name)||!doc.createTime||!doc.updateTime)fail();seen.add(doc.name);for(const x of Object.values(doc.fields||{}))typedValue(x);documents.push(doc);
 }}if(documents.length!==r.components.firestore.documents)fail();
 if(documents.some(d=>/\/documents\/system\/config$/.test(d.name)||/\/documents\/users\/[^/]+$/.test(d.name)))fail();
 documents.sort((a,b)=>a.name.localeCompare(b.name));const admin=admins[0],resources={files:Object.fromEntries(Object.entries(files).filter(([name])=>!name.startsWith('firestore-')&&name!=='auth-users.private.json').map(([name,x])=>[name,x.sha256]))},observedState={projectId:EXISTING_CLOUD_PROJECT,documentsSha256:digest(documents),accountsSha256:digest(users),resourcesSha256:digest(resources),systemConfigPresent:false,selectedAdminUid:admin.localId};
 const b=freeze({receiptSha256:hybridHash(bytes),documentCount:documents.length,documents:structuredClone(documents),admin:{uid:admin.localId,emailVerified:admin.emailVerified===true},billingEnabled:r.billingEnabledAtEnd===true,ownerAuthority:false,resources,observedState,proposedBootstrapPaths:['system/config',`users/${admin.localId}`,`auditLogs/users_${admin.localId}_1`]});knownBackups.add(b);return b;
}
export function validateExistingCloudAdoption(raw,{backupReceipt:b,observedState,sourcePins:pins}){
 if(!knownBackups.has(b))fail();sourcePins(pins);const a=completionExact(raw,['schema','projectId','backupReceiptSha256','cloudStateSha256','observedResourcesSha256','sourcePins','primaryAdminUid','dataScopeId','retainExisting','mergeOtherOwners','importLocalSnapshot','dataChanges']);
 if(a.schema!=='iilas-existing-cloud-adoption-1.0'||a.projectId!==EXISTING_CLOUD_PROJECT||a.backupReceiptSha256!==b.receiptSha256||a.cloudStateSha256!==digest(b.observedState)||digest(observedState)!==a.cloudStateSha256||a.observedResourcesSha256!==digest(b.resources)||completionCanonical(sourcePins(a.sourcePins))!==completionCanonical(pins)||a.primaryAdminUid!==b.admin.uid||a.dataScopeId!==b.admin.uid||a.retainExisting!==true||a.mergeOtherOwners!==false||a.importLocalSnapshot!==false||!Array.isArray(a.dataChanges)||a.dataChanges.length)fail();
 return freeze(structuredClone(a));
}
export function prepareExistingCloudAdoption(inputs){
 const b=inputs.backupReceipt;if(!knownBackups.has(b))fail();const adoption=validateExistingCloudAdoption({schema:'iilas-existing-cloud-adoption-1.0',projectId:EXISTING_CLOUD_PROJECT,backupReceiptSha256:b.receiptSha256,cloudStateSha256:digest(b.observedState),observedResourcesSha256:digest(b.resources),sourcePins:inputs.sourcePins,primaryAdminUid:b.admin.uid,dataScopeId:b.admin.uid,retainExisting:true,mergeOtherOwners:false,importLocalSnapshot:false,dataChanges:[]},inputs);
 const blockers=['FreshCutoverBackupRequired','SeparateResourceAndDeploymentApprovalRequired','MsiHttpsEndpointRequired'];if(!b.admin.emailVerified)blockers.push('AdminEmailVerificationRequired');if(!b.billingEnabled)blockers.push('BillingDisabled');if(!b.ownerAuthority)blockers.push('OwnerIamAuthorityRequired');
 return freeze({adoption,readiness:{emailVerified:b.admin.emailVerified,billingEnabled:b.billingEnabled,ownerAuthority:b.ownerAuthority,blockers},fixtureOnly:true});
}
