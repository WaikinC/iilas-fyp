import {createRequire} from 'node:module';
import {sparkHash} from './spark-private-files.mjs';
import {completionCanonical,completionExact} from '../lib/completionWorkflow.js';
const project='fyp-inventory-and-logistics',stages=['firestore:indexes','firestore:rules','hosting'];
const fail=()=>{throw Error('Cloud observation differs from the approved unchanged records and expected deployment stage.');};
const digest=value=>sparkHash(Buffer.from(JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)));
const equal=(a,b)=>completionCanonical(a)===completionCanonical(b);
export function validateSparkCloudTransition({baseline,observed,planned,stage,phase,completed}){
 const keys=['projectId','billingEnabled','documentsSha256','accountsSha256','iamSha256','servicesSha256','primaryAdminUid','adminEmailVerified','systemConfigPresent','userProfiles','indexSettings','rulesSourceSha256','hosting'];
 completionExact(baseline,keys);completionExact(observed,keys);const index=stages.indexOf(stage);
 if(index<0||!['before','after'].includes(phase)||!Array.isArray(completed)||!equal(completed,stages.slice(0,index))||baseline.projectId!==project||baseline.billingEnabled!==false||baseline.adminEmailVerified!==true||baseline.systemConfigPresent!==false||baseline.userProfiles!==0)fail();
 for(const key of keys.filter(k=>!['indexSettings','rulesSourceSha256','hosting'].includes(k)))if(!equal(baseline[key],observed[key]))fail();
 const applied=new Set([...completed,...(phase==='after'?[stage]:[])]);
 if(!equal(observed.indexSettings,applied.has('firestore:indexes')?planned.indexSettings:baseline.indexSettings)||observed.rulesSourceSha256!==(applied.has('firestore:rules')?planned.rulesSourceSha256:baseline.rulesSourceSha256))fail();
 if(applied.has('hosting')){if(!observed.hosting.version||!equal(observed.hosting.files,planned.hostingFiles))fail();}else if(!equal(observed.hosting,baseline.hosting))fail();return digest(baseline);
}
export function normaliseSparkIndexFields(fields){
 if(!Array.isArray(fields)||!fields.length)fail();const last=fields.at(-1),preceding=fields.slice(0,-1),implicitOrder=preceding.reduce((order,f)=>f.order||order,'ASCENDING');
 return structuredClone(last.fieldPath==='__name__'&&last.order===implicitOrder?preceding:fields);
}
export function normaliseSparkIndexes(indexes,fields){
 const composites=(indexes||[]).map(x=>{const match=/\/collectionGroups\/([^/]+)\/indexes\/[^/]+$/.exec(x.name||'');if(!match||x.state!=='READY'||x.apiScope&&x.apiScope!=='ANY_API'||x.density&&x.density!=='SPARSE_ALL'||x.unique||x.multikey||x.shardCount||x.searchIndexOptions)fail();return {collectionGroup:decodeURIComponent(match[1]),queryScope:x.queryScope,fields:normaliseSparkIndexFields(x.fields)};});
 const overrides=(fields||[]).map(field=>{const match=/\/collectionGroups\/([^/]+)\/fields\/([^/]+)$/.exec(field.name||'');if(!match||!field.indexConfig||field.ttlConfig&&field.ttlConfig.state!=='DISABLED')fail();const fieldPath=decodeURIComponent(match[2]);return {collectionGroup:decodeURIComponent(match[1]),fieldPath,indexes:(field.indexConfig.indexes||[]).map(index=>{const f=index.fields.find(f=>f.fieldPath===fieldPath);if(!f)fail();return {...(f.order?{order:f.order}:{arrayConfig:f.arrayConfig}),queryScope:index.queryScope};}).sort((a,b)=>completionCanonical(a).localeCompare(completionCanonical(b)))};});
 return {indexes:composites.sort((a,b)=>completionCanonical(a).localeCompare(completionCanonical(b))),fieldOverrides:overrides.sort((a,b)=>completionCanonical(a).localeCompare(completionCanonical(b)))};
}
export async function waitForSparkIndexes({request,wait=()=>new Promise(r=>setTimeout(r,2000)),maxAttempts=90}){
 if(typeof request!=='function'||typeof wait!=='function'||!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>90)fail();
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  let pageToken;const indexes=[],seen=new Set();do{const q=new URLSearchParams(pageToken?{pageToken}:{}),result=await request('firestore.googleapis.com','/v1/projects/'+project+'/databases/(default)/collectionGroups/-/indexes'+(q.size?'?'+q:''));indexes.push(...(result.indexes||[]));if(indexes.length>200)fail();pageToken=result.nextPageToken;if(pageToken){if(seen.has(pageToken))fail();seen.add(pageToken);}}while(pageToken);
  if(indexes.every(i=>i.state==='READY'))return {ready:true,indexes:indexes.length,observations:attempt};if(indexes.some(i=>!['READY','CREATING'].includes(i.state)))fail();if(attempt<maxAttempts)await wait();
 }throw Object.assign(Error('Observed index creation has not completed; publication remains stopped.'),{code:'indexes-pending'});
}
export async function createSparkCloudReader(){
 const require=createRequire(new URL('../package.json',import.meta.url)),auth=require('firebase-tools/lib/auth.js'),api=require('firebase-tools/lib/apiv2.js'),account=auth.getProjectDefaultAccount(process.cwd());if(!account)fail();auth.setActiveAccount({},account);let calls=0;const started=Date.now();
 return async function request(host,path,{method='GET',body}={}){
  const url=new URL('https://'+host+path),allowed=new Set(['cloudbilling.googleapis.com','cloudresourcemanager.googleapis.com','serviceusage.googleapis.com','firestore.googleapis.com','www.googleapis.com','firebasehosting.googleapis.com','firebaserules.googleapis.com']);
  if(!allowed.has(host)||url.host!==host||++calls>3000||Date.now()-started>10*60*1000||!['GET','POST'].includes(method))fail();
  if(method==='POST'&&!((host==='cloudresourcemanager.googleapis.com'&&url.pathname==='/v1/projects/'+project+':getIamPolicy')||(host==='www.googleapis.com'&&url.pathname==='/identitytoolkit/v3/relyingparty/downloadAccount'&&body?.targetProjectId===project)||(host==='firestore.googleapis.com'&&url.pathname.startsWith('/v1/projects/'+project+'/databases/(default)/documents')&&url.pathname.endsWith(':listCollectionIds'))))fail();
  if(method==='GET'&&(/:(?:enable|disable|commit|batchWrite|import|export)/.test(url.pathname)||host==='cloudbilling.googleapis.com'&&url.pathname!=='/v1/projects/'+project+'/billingInfo'))fail();
  const token=await api.getAccessToken(),r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Object.assign(Error('Read-only cloud observation failed'),{httpStatus:r.status});const data=Buffer.from(await r.arrayBuffer());if(data.length>16*1024*1024)fail();return JSON.parse(data.toString('utf8'));
 };
}
export async function captureSparkCloudState({request,primaryAdminUid}){
 if(typeof request!=='function'||!/^[-A-Za-z0-9_]{1,128}$/.test(primaryAdminUid))fail();
 const query=(path,values)=>{const q=new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined));return path+(q.size?'?'+q:'');};
 async function paged(host,path,key,params={},postBody){let pageToken;const values=[],seen=new Set();do{const body=await request(host,query(path,postBody?{}:{...params,pageToken}),postBody?{method:'POST',body:{...postBody,...(pageToken?{pageToken}:{})}}:{});values.push(...(body[key]||[]));if(values.length>10000)fail();pageToken=body.nextPageToken;if(pageToken){if(seen.has(pageToken))fail();seen.add(pageToken);}}while(pageToken);return values;}
 const billing=await request('cloudbilling.googleapis.com','/v1/projects/'+project+'/billingInfo');if(billing.billingEnabled!==false)fail();
 const metadata=await request('cloudresourcemanager.googleapis.com','/v1/projects/'+project),iam=await request('cloudresourcemanager.googleapis.com','/v1/projects/'+project+':getIamPolicy',{method:'POST',body:{options:{requestedPolicyVersion:3}}});if(metadata.projectId!==project)fail();
 const services=await paged('serviceusage.googleapis.com','/v1/projects/'+metadata.projectNumber+'/services','services',{filter:'state:ENABLED',pageSize:200});
 const root='projects/'+project+'/databases/(default)/documents',rows=[],seen=new Set(),readTime=new Date(Date.now()-10000).toISOString();
 const encoded=path=>path.split('/').map(encodeURIComponent).join('/');
 async function walk(parent){const ids=await paged('firestore.googleapis.com','/v1/'+encoded(parent)+':listCollectionIds','collectionIds',{}, {pageSize:100,readTime});for(const id of ids){if(typeof id!=='string'||id.includes('/'))fail();const docs=await paged('firestore.googleapis.com','/v1/'+encoded(parent)+'/'+encodeURIComponent(id),'documents',{pageSize:100,showMissing:true,readTime});for(const d of docs){if(typeof d.name!=='string'||!d.name.startsWith(parent+'/'+id+'/')||seen.has(d.name)||seen.size>=10000)fail();seen.add(d.name);if(d.createTime||d.updateTime)rows.push(d);await walk(d.name);}}}await walk(root);
 const accounts=await paged('www.googleapis.com','/identitytoolkit/v3/relyingparty/downloadAccount','users',{}, {targetProjectId:project,maxResults:1000}),admin=accounts.find(u=>u.localId===primaryAdminUid);if(!admin||admin.email?.toLowerCase()!=='choongkin6@gmail.com'||admin.disabled===true)fail();
 const database='/v1/projects/'+project+'/databases/(default)/collectionGroups/-',indexes=await paged('firestore.googleapis.com',database+'/indexes','indexes'),fields=await paged('firestore.googleapis.com',database+'/fields','fields',{filter:'indexConfig.usesAncestorConfig=false OR ttlConfig:*'});
 const release=await request('firebaserules.googleapis.com','/v1/projects/'+project+'/releases/cloud.firestore'),ruleset=await request('firebaserules.googleapis.com','/v1/'+release.rulesetName);if(!Array.isArray(ruleset.source?.files)||ruleset.source.files.length!==1)fail();
 const hosting='/v1beta1/projects/-/sites/'+project,latest=await request('firebasehosting.googleapis.com',hosting+'/releases?pageSize=1'),version=latest.releases?.[0]?.version?.name;if(!version)fail();const listed=await paged('firebasehosting.googleapis.com','/v1beta1/'+version+'/files','files',{pageSize:1000}),files={};
 for(const f of listed){if(typeof f.path!=='string'||!f.path.startsWith('/')||f.path.startsWith('//')||f.path.includes('\\')||f.path.split('/').includes('..'))fail();const response=await fetch('https://'+project+'.web.app'+f.path,{redirect:'error',signal:AbortSignal.timeout(45000)});if(!response.ok)fail();const b=Buffer.from(await response.arrayBuffer());if(b.length>32*1024*1024)fail();files[f.path.slice(1)]=sparkHash(b);}
 const confirm=await request('firebasehosting.googleapis.com',hosting+'/releases?pageSize=1');if(confirm.releases?.[0]?.version?.name!==version)fail();
 return {projectId:project,billingEnabled:false,documentsSha256:digest(rows.sort((a,b)=>a.name.localeCompare(b.name))),accountsSha256:digest(accounts.sort((a,b)=>a.localId.localeCompare(b.localId))),iamSha256:digest(iam),servicesSha256:digest(services.sort((a,b)=>a.name.localeCompare(b.name))),primaryAdminUid,adminEmailVerified:admin.emailVerified===true,systemConfigPresent:rows.some(d=>d.name===root+'/system/config'),userProfiles:rows.filter(d=>d.name.startsWith(root+'/users/')).length,indexSettings:normaliseSparkIndexes(indexes,fields),rulesSourceSha256:sparkHash(Buffer.from(ruleset.source.files[0].content)),hosting:{version,files}};
}
export const sparkCloudStateDigest=digest;
