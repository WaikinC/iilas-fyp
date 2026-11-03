import {sparkHash,readSparkPrivate} from '../../scripts/spark-private-files.mjs';
import {sparkCloudStateDigest} from '../../scripts/spark-cloud-observer.mjs';
import {completionExact} from '../../lib/completionWorkflow.js';
const fail=()=>{throw Object.assign(Error('Cloud commands remain gated on the approved completed publication and current selected administrator/data baseline.'),{code:'unavailable'});};
async function pinned(pin,readPrivate){try{const bytes=await readPrivate(pin.path);if(sparkHash(bytes)!==pin.sha256)fail();return JSON.parse(bytes);}catch{fail();}}
export function createSparkCloudAuthority({profile,activation,readConfiguration,verifyBootstrap,readPrivate=readSparkPrivate}){
 if(typeof readConfiguration!=='function'||typeof verifyBootstrap!=='function')fail();
 return async(auth,body)=>{
  if(profile.mode!=='spark-msi')return;
  const cutover=activation?.cutover;if(!activation?.approvedActions?.includes('cloud-commands')||!cutover)fail();
  const publication=await pinned(cutover.publication,readPrivate);completionExact(publication,['passed','completed','manifestSha256','billingEnabled','applicationDataWrites','cloudBootstrap']);
  if(publication.passed!==true||JSON.stringify(publication.completed)!==JSON.stringify(['firestore:indexes','firestore:rules','hosting'])||publication.manifestSha256!==cutover.publication.manifestSha256||publication.billingEnabled!==false||publication.applicationDataWrites!==0||publication.cloudBootstrap!==false)fail();
  const baseline=await pinned(cutover.baseline,readPrivate);completionExact(baseline,['schema','projectId','primaryAdminUid','adoptionSha256','documentsSha256']);
  if(baseline.schema!=='iilas-spark-bootstrap-baseline-1.0'||baseline.projectId!==profile.projectId||baseline.primaryAdminUid!==cutover.primaryAdminUid||baseline.adoptionSha256!==profile.adoptionSha256||!/^[-a-f0-9]{64}$/.test(baseline.documentsSha256))fail();
  const config=await readConfiguration();
  if(config){if(config.primaryAdminUid!==cutover.primaryAdminUid||config.dataScopeId!==cutover.primaryAdminUid)fail();}
  else{
   if(body?.action!=='registerAccount'||!activation.approvedActions.includes('bootstrap'))fail();
   if(auth?.uid!==cutover.primaryAdminUid)throw Object.assign(Error('Only the pinned selected administrator may initialize this demo.'),{code:'permission-denied'});
   await verifyBootstrap(baseline);
  }
 };
}
export function createSparkApprovedDispatcher(options){
 if(typeof options.executeCommand!=='function')fail();const authorise=options.authorise||createSparkCloudAuthority(options);
 return async(auth,body)=>{await authorise(auth,body);return options.executeCommand(auth,body);};
}
export async function readSparkBootstrapDocuments(request){
 const root='projects/fyp-inventory-and-logistics/databases/(default)/documents',readTime=new Date(Date.now()-5000).toISOString(),rows=[],seen=new Set(),encoded=path=>path.split('/').map(encodeURIComponent).join('/');
 async function pages(path,key,body){const values=[],tokens=new Set();let pageToken;do{const query=new URLSearchParams(body?{}:{pageSize:'100',readTime,showMissing:'true',...(pageToken?{pageToken}:{})}),data=await request(path+(query.size?'?'+query:''),body?{...body,...(pageToken?{pageToken}:{})}:null);values.push(...(data[key]||[]));if(values.length>10000)fail();pageToken=data.nextPageToken;if(pageToken){if(tokens.has(pageToken))fail();tokens.add(pageToken);}}while(pageToken);return values;}
 async function walk(parent){for(const id of await pages('/v1/'+encoded(parent)+':listCollectionIds','collectionIds',{pageSize:100,readTime})){if(typeof id!=='string'||!id||id.includes('/'))fail();for(const row of await pages('/v1/'+encoded(parent)+'/'+encodeURIComponent(id),'documents')){if(typeof row.name!=='string'||!row.name.startsWith(parent+'/'+id+'/')||seen.has(row.name)||seen.size>=10000)fail();seen.add(row.name);if(row.createTime||row.updateTime)rows.push(row);await walk(row.name);}}}
 await walk(root);return rows.sort((a,b)=>a.name.localeCompare(b.name));
}
export function createSparkBootstrapVerifier({identity,credential}){
 return async baseline=>{
  const user=await identity.getUser(baseline.primaryAdminUid);if(user.disabled||!user.emailVerified||user.email?.toLowerCase()!=='choongkin6@gmail.com')fail();
  const token=(await credential.getAccessToken()).access_token;if(typeof token!=='string'||!token)fail();let count=0;const started=Date.now();
  const request=async(path,body)=>{
   if(++count>2500||Date.now()-started>55000||!path.startsWith('/v1/projects/fyp-inventory-and-logistics/databases/(default)/documents')||body&&!path.endsWith(':listCollectionIds'))fail();
   const response=await fetch('https://firestore.googleapis.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)fail();const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>16*1024*1024)fail();return JSON.parse(bytes);
  };
  if(sparkCloudStateDigest(await readSparkBootstrapDocuments(request))!==baseline.documentsSha256)fail();return true;
 };
}
