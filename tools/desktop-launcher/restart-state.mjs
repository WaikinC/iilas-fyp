import {readFile,mkdir,lstat,realpath,readdir,open,rename,unlink} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {canonical,hash,readPrivateJson,publishJson} from './durable-chain.mjs';
import {acquireWindowsMutex} from './windows-ownership.mjs';
const fail=()=>{throw Error('Local ownership or saved proof data changed; nothing was removed.');};
export function observeProcess(pid){
 if(!Number.isSafeInteger(pid)||pid<1)fail();
 const script=`$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue;if($null -eq $p){'null'}else{[pscustomobject]@{pid=$p.Id;startTicks=$p.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress}`;
 return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim());
}
export async function archiveStaleLock({path,archiveDirectory,observe=observeProcess,isPortAbsent,expected={},sidecar}){
 const mutex=await acquireWindowsMutex('reclaim:'+resolve(path).toLowerCase());try{
 const bytes=await readFile(path),lock=await readPrivateJson(path,16384);
 if(!Number.isSafeInteger(lock.pid)||lock.pid<1||typeof lock.nonce!=='string'||Object.entries(expected).some(([k,v])=>lock[k]!==v))fail();
 const corroborated=sidecar?.pid===lock.pid&&sidecar.nonce===lock.nonce&&sidecar.lockSha256===hash(bytes)&&typeof sidecar.startTicks==='string';
 const dead=async()=>{const current=await observe(lock.pid);return current===null||Boolean(corroborated&&current.startTicks!==sidecar.startTicks);};
 if(!await isPortAbsent()||!await dead())fail();
 await mkdir(archiveDirectory,{recursive:true});const dir=await lstat(archiveDirectory);if(!dir.isDirectory()||dir.isSymbolicLink()||resolve(await realpath(archiveDirectory))!==resolve(archiveDirectory))fail();
 // Check again immediately before rename; a concurrent replacement must stay untouched.
 if(!await dead()||!await isPortAbsent()||hash(await readFile(path))!==hash(bytes))fail();await readPrivateJson(path,16384);
 const archived=join(archiveDirectory,'retired-'+randomUUID()+'.lock.json');await rename(path,archived);if(hash(await readFile(archived))!==hash(bytes))fail();return archived;
 }finally{await mutex.release();}
}
export async function acquireOwnedLock({path,archiveDirectory,role,observe=observeProcess}){
 const mutex=await acquireWindowsMutex('owner:'+resolve(path).toLowerCase());try{
 const identity=await observe(process.pid);if(!identity||!identity.startTicks)fail();const value={schema:'iilas-owned-lock-1.0',...identity,nonce:randomUUID(),role};
 for(let attempt=0;attempt<2;attempt++){
  try{const h=await open(path,'wx',0o600);try{await h.writeFile(canonical(value));await h.sync();}finally{await h.close();}
   return {identity:value,async release(){try{const current=await readPrivateJson(path);if(canonical(current)!==canonical(value))fail();await unlink(path);}finally{await mutex.release();}}};
  }catch(e){if(e.code!=='EEXIST'||attempt)throw e;const old=await readPrivateJson(path,16384);await archiveStaleLock({path,archiveDirectory,observe,isPortAbsent:async()=>true,sidecar:old.startTicks?{...old,lockSha256:hash(await readFile(path))}:undefined});}
 }
 fail();
 }catch(e){await mutex.release();throw e;}
}
export async function proofTree(root){
 root=resolve(root);const entries={};
 async function walk(folder){const ds=await lstat(folder);if(!ds.isDirectory()||ds.isSymbolicLink()||resolve(await realpath(folder))!==resolve(folder))fail();for(const item of await readdir(folder,{withFileTypes:true})){const path=join(folder,item.name),s=await lstat(path),rel=relative(root,path).replaceAll('\\','/');if(s.isSymbolicLink()||s.nlink!==1&&s.isFile()||rel.startsWith('..')||isAbsolute(rel))fail();if(s.isDirectory())await walk(path);else if(s.isFile()&&s.size<=16*1024*1024)entries[rel]=hash(await readFile(path));else fail();}}
 await walk(root);return entries;
}
export async function backupProofTree({root,backupDirectory,rootId,backendInstanceId}){
 root=resolve(root);const files=await proofTree(root),marker=await readPrivateJson(join(root,'store.json'),16384);
 if(canonical(marker)!==canonical({schema:'iilas-msi-evidence-store-1.0',rootId,backendInstanceId}))fail();
 const objects=await readdir(join(root,'objects'),{withFileTypes:true});for(const object of objects){
  if(!object.isDirectory()||!/^[a-f0-9]{64}$/.test(object.name))fail();const dir=join(root,'objects',object.name),names=(await readdir(dir)).sort();if(canonical(names)!==canonical(['COMMITTED','bytes','manifest.json']))fail();
  const m=await readPrivateJson(join(dir,'manifest.json'),16384),bytes=await readFile(join(dir,'bytes')),manifestBytes=await readFile(join(dir,'manifest.json'));
  const i=m.intent;
  if(!i||!/^evidence\/[-A-Za-z0-9_]{1,128}\/[-A-Za-z0-9_]{1,128}\/[-A-Za-z0-9_]{1,128}$/.test(i.path)||typeof i.intentId!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(i.intentId)||!Number.isSafeInteger(i.bytes)||i.bytes<1||i.bytes>10485760||!/^[a-f0-9]{64}$/.test(i.sha256)||!['image/jpeg','image/png','image/webp','application/pdf'].includes(i.contentType)||!Number.isSafeInteger(i.expiresAt)||!i.metadata||Object.getPrototypeOf(i.metadata)!==Object.prototype||Object.entries(i.metadata).length>16||Object.entries(i.metadata).some(([k,v])=>!/^[-A-Za-z0-9_]{1,64}$/.test(k)||typeof v!=='string'||v.length>512))fail();
  if(m.schema!=='iilas-msi-evidence-object-1.0'||m.rootId!==rootId||typeof m.generation!=='string'||!/^[1-9][0-9]{0,19}$/.test(m.generation)||hash(i.path)!==object.name||i.bytes!==bytes.length||i.sha256!==hash(bytes)||(await readFile(join(dir,'COMMITTED'),'utf8'))!==hash(manifestBytes))fail();
 }
 await mkdir(backupDirectory,{recursive:false});for(const [name,digest]of Object.entries(files)){const bytes=await readFile(join(root,name));if(hash(bytes)!==digest)fail();const target=join(backupDirectory,name);await mkdir(dirname(target),{recursive:true});const h=await open(target,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}if(hash(await readFile(target))!==digest)fail();}
 if(canonical(await proofTree(root))!==canonical(files))fail();await publishJson(join(backupDirectory,'backup.receipt.json'),{schema:'iilas-proof-backup-1.0',rootId,backendInstanceId,pins:files});return {files:Object.keys(files).filter(x=>x!=='store.lock').length,pins:files,backupDirectory};
}
export async function replaceBinding({target,expectedBytes,next,backup}){
 if(hash(await readFile(target))!==hash(expectedBytes))fail();const h=await open(backup,'wx',0o600);try{await h.writeFile(expectedBytes);await h.sync();}finally{await h.close();}await readPrivateJson(target);if(hash(await readFile(target))!==hash(expectedBytes))fail();await publishJson(target,next);
}
