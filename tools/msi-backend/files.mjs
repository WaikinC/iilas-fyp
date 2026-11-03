import {mkdir,lstat,realpath,open,readFile,readdir,rename,unlink,rmdir,statfs} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {msiError} from './limits.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),MAX=10485760;
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=(code='failed-precondition')=>{throw msiError(code,'The private proof file is missing, changed or unavailable.');};
const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export function assertMsiCapacity({committedBytes,inFlightBytes,addedBytes,freeBytes}){
 if(![committedBytes,inFlightBytes,addedBytes,freeBytes].every(n=>Number.isSafeInteger(n)&&n>=0)||committedBytes+inFlightBytes+addedBytes>5*1024**3||freeBytes-inFlightBytes-addedBytes<1024**3)throw msiError('resource-exhausted','The private proof store has insufficient capacity. No proof was removed.');
}
function validIntent(i){
 if(!i||!/^evidence\/[-A-Za-z0-9_]{1,128}\/[-A-Za-z0-9_]{1,128}\/[-A-Za-z0-9_]{1,128}$/.test(i.path)||typeof i.intentId!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(i.intentId)||!Number.isSafeInteger(i.bytes)||i.bytes<1||i.bytes>MAX||!/^[a-f0-9]{64}$/.test(i.sha256)||!['image/jpeg','image/png','image/webp','application/pdf'].includes(i.contentType)||!Number.isSafeInteger(i.expiresAt)||!i.metadata||Object.getPrototypeOf(i.metadata)!==Object.prototype||Object.entries(i.metadata).length>16||Object.entries(i.metadata).some(([k,v])=>!/^[-A-Za-z0-9_]{1,64}$/.test(k)||typeof v!=='string'||v.length>512))fail();
 return {intentId:i.intentId,path:i.path,bytes:i.bytes,sha256:i.sha256,contentType:i.contentType,metadata:structuredClone(i.metadata),expiresAt:i.expiresAt};
}
async function containedFile(path,root,max=MAX){
 const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>max)fail();
 const actual=await realpath(path),rel=relative(root,actual);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();return s;
}
async function exclusive(path,bytes){const h=await open(path,'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}}
async function directory(path,base){await mkdir(path,{recursive:true});const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||resolve(await realpath(path))!==resolve(path)||relative(base,path).startsWith('..'))fail();}
async function totalBytes(root){let bytes=0;for(const e of await readdir(root,{withFileTypes:true})){const p=join(root,e.name),s=await lstat(p);if(s.isSymbolicLink()||s.isFile()&&s.nlink!==1)fail();if(s.isDirectory())bytes+=await totalBytes(p);else if(s.isFile())bytes+=s.size;else fail();}return bytes;}
export async function createMsiEvidenceStore({root,rootId,backendInstanceId,clock=Date.now,diskFree=async p=>{const s=await statfs(p);return Number(s.bavail)*Number(s.bsize);}}){
 root=resolve(root);const rel=relative(ROOT,root),uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
 if(!rel.replaceAll('\\','/').startsWith('outputs/')||isAbsolute(rel)||rel.startsWith('..')||!uuid.test(rootId)||!uuid.test(backendInstanceId))fail();
 let cursor=ROOT;for(const segment of rel.split(/[\\/]/)){cursor=join(cursor,segment);await directory(cursor,ROOT);}
 const markerPath=join(root,'store.json'),identity={schema:'iilas-msi-evidence-store-1.0',rootId,backendInstanceId};
 try{await lstat(markerPath);}catch(e){if(e.code!=='ENOENT')throw e;if((await readdir(root)).length)fail();}
 try{await exclusive(markerPath,canonical(identity));}catch(e){if(e.code!=='EEXIST')throw e;await containedFile(markerPath,root,16384);if(canonical(JSON.parse(await readFile(markerPath,'utf8')))!==canonical(identity))fail();}
 for(const name of ['objects','quarantine'])await directory(join(root,name),root);
 const lockPath=join(root,'store.lock'),lock={pid:process.pid,nonce:randomUUID(),rootId,backendInstanceId};
 try{await exclusive(lockPath,canonical(lock));}catch{throw msiError('unavailable','The proof store is already owned or needs an explicit stale-owner recovery.');}
 let closed=false,used=0,reserved=0;const jobs=new Map(),generations=new Set();
 let accounting=Promise.resolve();
 async function account(work){const previous=accounting;let release;accounting=new Promise(r=>release=r);await previous;try{return await work();}finally{release();}}
 const objectDir=path=>join(root,'objects',sha(path));
 async function checkRoot(){if(closed)fail('unavailable');for(const path of [root,join(root,'objects'),join(root,'quarantine')]){const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||resolve(await realpath(path))!==resolve(path))fail();}await containedFile(lockPath,root,16384);if(await readFile(lockPath,'utf8')!==canonical(lock))fail();}
 async function manifest(path){
  if(typeof path!=='string'||!/^evidence\/[-A-Za-z0-9_]{1,128}\/[-A-Za-z0-9_]{1,128}\/[-A-Za-z0-9_]{1,128}$/.test(path))fail();await checkRoot();
  const dir=objectDir(path);const ds=await lstat(dir);if(!ds.isDirectory()||ds.isSymbolicLink()||resolve(await realpath(dir))!==resolve(dir))fail();
  await containedFile(join(dir,'manifest.json'),root,16384);await containedFile(join(dir,'COMMITTED'),root,128);
  const bytes=await readFile(join(dir,'manifest.json')),marker=await readFile(join(dir,'COMMITTED'),'utf8');if(marker!==sha(bytes))fail();
  const m=JSON.parse(bytes.toString('utf8'));validIntent(m.intent);if(m.schema!=='iilas-msi-evidence-object-1.0'||m.rootId!==rootId||m.intent.path!==path||!/^[1-9][0-9]{0,19}$/.test(m.generation))fail();
  const s=await containedFile(join(dir,'bytes'),root);if(s.size!==m.intent.bytes)fail();return m;
 }
 async function readVerified(path){
  const m=await manifest(path),chunks=[];let length=0;const h=createHash('sha256');for await(const chunk of createReadStream(join(objectDir(path),'bytes'))){length+=chunk.length;if(length>MAX||length>m.intent.bytes)fail();h.update(chunk);chunks.push(chunk);}if(length!==m.intent.bytes||h.digest('hex')!==m.intent.sha256)fail();const after=await manifest(path);if(canonical(after)!==canonical(m))fail();return {m,bytes:Buffer.concat(chunks)};
 }
 function metadata(m){return {path:m.intent.path,size:m.intent.bytes,contentType:m.intent.contentType,generation:m.generation,metadata:structuredClone(m.intent.metadata)};}
 async function commit(original,stream){
  const i=validIntent(original),key=sha(i.path),previous=jobs.get(key)||Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
   await checkRoot();let old;
   try{old=await manifest(i.path);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(old){if(canonical(old.intent)!==canonical(i))fail('already-exists');await readVerified(i.path);return metadata(old);}
   if(i.expiresAt<=clock())fail();const estimate=i.bytes+16384+128;await account(async()=>{const freeBytes=await diskFree(root);assertMsiCapacity({committedBytes:used,inFlightBytes:reserved,addedBytes:estimate,freeBytes});reserved+=estimate;});
   const dir=objectDir(i.path);let created=false;
   try{
    await mkdir(dir);created=true;const h=await open(join(dir,'bytes'),'wx',0o600);let count=0;const digest=createHash('sha256');
    try{for await(const chunk of stream){if(!Buffer.isBuffer(chunk)&&!(chunk instanceof Uint8Array))fail();count+=chunk.length;if(count>MAX||count>i.bytes)fail();digest.update(chunk);await h.writeFile(chunk);}await h.sync();}finally{await h.close();}
    if(count!==i.bytes||digest.digest('hex')!==i.sha256)fail();
    const generation=(BigInt('0x'+randomBytes(8).toString('hex'))||1n).toString(),m={schema:'iilas-msi-evidence-object-1.0',rootId,intent:i,generation};if(generations.has(generation))fail('already-exists');
    // Manifest bytes are immutable; the separately fsynced digest is the publication marker.
    const bytes=Buffer.from(canonical(m));await exclusive(join(dir,'manifest.json'),bytes);await exclusive(join(dir,'COMMITTED'),sha(bytes));generations.add(generation);return metadata(m);
   }catch(e){if(created)await rename(dir,join(root,'quarantine',key+'-'+randomUUID())).catch(()=>{});throw e;}
   finally{await account(async()=>{used=await totalBytes(root);reserved-=estimate;});}
  });jobs.set(key,next);try{return await next;}finally{if(jobs.get(key)===next)jobs.delete(key);}
 }
 async function audit(){
  await checkRoot();let committed=0;for(const entry of await readdir(join(root,'objects'),{withFileTypes:true})){
   if(!/^[a-f0-9]{64}$/.test(entry.name)||!entry.isDirectory()||entry.isSymbolicLink())fail();if(jobs.has(entry.name))continue;
   const dir=join(root,'objects',entry.name);try{await containedFile(join(dir,'manifest.json'),root,16384);const m=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));if(sha(m.intent.path)!==entry.name)fail();await readVerified(m.intent.path);generations.add(m.generation);committed++;}catch{await rename(dir,join(root,'quarantine',entry.name+'-'+randomUUID()));}
  }used=await totalBytes(root);return {committed,quarantined:(await readdir(join(root,'quarantine'))).length,bytes:used};
 }
 async function cleanupOwned(input){
  await checkRoot();if(jobs.has(sha(input.path)))return {removed:false,reason:'changed'};let m;try{m=await manifest(input.path);}catch{return {removed:false,reason:'unknown'};}
  if(canonical(validIntent(input))!==canonical(m.intent)||input.generation!==m.generation)return {removed:false,reason:'changed'};
  if(m.intent.expiresAt>clock())return {removed:false,reason:'not-expired'};
  if(typeof input.isReferenced!=='function'||await input.isReferenced())return {removed:false,reason:'referenced'};
  await readVerified(input.path);if(await input.isReferenced())return {removed:false,reason:'referenced'};
  const dir=objectDir(input.path);for(const name of ['COMMITTED','manifest.json','bytes']){await containedFile(join(dir,name),root,name==='bytes'?MAX:16384);await unlink(join(dir,name));}await rmdir(dir);generations.delete(m.generation);used=await totalBytes(root);return {removed:true,reason:'removed'};
 }
 async function close(){if(closed)return;await Promise.allSettled([...jobs.values()]);await checkRoot();if(await readFile(lockPath,'utf8')!==canonical(lock))fail();await unlink(lockPath);closed=true;}
 const store={commit,audit,cleanupOwned,close,getMetadata:async path=>{try{return metadata((await readVerified(path)).m);}catch(e){if(e.code==='ENOENT')throw msiError('not-found','The proof upload is not present.');throw e;}},download:async path=>(await readVerified(path)).bytes,createReadStream(path){return Readable.from((async function*(){yield (await readVerified(path)).bytes;})());}};
 try{await audit();return store;}catch(e){await unlink(lockPath).catch(()=>{});throw e;}
}
