// Real local Auth/Functions/Firestore/rules; no model, camera, production or public data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithCustomToken} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,setDoc,updateDoc} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {createInventoryAIOutput} from './inventory-ai-output.mjs';
import {featuresForScenario,inventoryAIFeaturePayload,INVENTORY_AI_PROVENANCE} from '../lib/inventoryAI.js';
const project='fyp-inventory-and-logistics',bucketName=`${project}.firebasestorage.app`;
for(const [key,value] of Object.entries({GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'})){assert(!process.env[key]||process.env[key]===value,`Unexpected ${key}`);process.env[key]=value;}
const config=JSON.parse(await readFile(new URL('../firebase-config.json',import.meta.url),'utf8'));assert.equal(config.projectId,project);assert.equal(config.storageBucket,bucketName);
const require=createRequire(new URL('../backend/functions/service.mjs',import.meta.url)),admin=require('firebase-admin/app'),server=admin.initializeApp({projectId:project,storageBucket:bucketName},`inventory-${randomUUID()}`),database=require('firebase-admin/firestore').getFirestore(server),identity=require('firebase-admin/auth').getAuth(server),bucket=require('firebase-admin/storage').getStorage(server).bucket();
const out=await createInventoryAIOutput('legacy-recovery'),tag=`stockai-${randomUUID()}`,actorIds=[`${tag}-inventory`,`${tag}-manager`,`${tag}-viewer`],apps=[],ownedDocs=new Set(),checks=[];
const sha=v=>createHash('sha256').update(v).digest('hex'),stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x),hash=v=>sha(stable(v));
const save=(name,data)=>writeFile(join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
let before,scope,failure,cleanupComplete=false,browser;
async function inventory(){
 const docs={},accounts={},objects={};let active=0;const waiting=[];async function rpc(work){if(active>=6)await new Promise(r=>waiting.push(r));else active++;try{return await work();}finally{if(waiting.length)waiting.shift()();else active--;}}
 async function walk(col){const refs=await rpc(()=>col.listDocuments());await Promise.all(refs.map(async ref=>{const snap=await rpc(()=>ref.get());if(snap.exists)docs[ref.path]=hash(snap.data());for(const sub of await rpc(()=>ref.listCollections()))await walk(sub);}));}
 for(const col of await database.listCollections())await walk(col);
 let next;do{const page=await identity.listUsers(1000,next);for(const user of page.users){const record=user.toJSON();if(record.metadata){delete record.metadata.lastSignInTime;delete record.metadata.lastRefreshTime;}accounts[user.uid]=hash(record);}next=page.pageToken;}while(next);
 const [files]=await bucket.getFiles();for(const f of files){const [m]=await f.getMetadata();objects[f.name]=hash(m);}return {docs,accounts,objects};
}
function protectedEqual(a,b){for(const k of ['docs','accounts','objects'])for(const [id,value] of Object.entries(a[k]))assert.equal(b[k][id],value,`Existing ${k} changed; refusing cleanup.`);}
async function put(path,value){assert(!before.docs[path]);await database.doc(path).create(value);ownedDocs.add(path);}
async function client(uid,role){await identity.createUser({uid,email:`${uid}@example.test`,password:randomUUID()+randomUUID()});await put(`users/${uid}`,{uid,email:`${uid}@example.test`,displayName:`Local QA ${role}`,emailVerified:false,role,status:'Approved',active:true,version:1});const app=initializeApp(config,uid),auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,'asia-southeast1');apps.push(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8081);connectFunctionsEmulator(functions,'127.0.0.1',5001);await signInWithCustomToken(auth,await identity.createCustomToken(uid));return {uid,auth,db,call:async(action,input,foreign)=>(await httpsCallable(functions,'command')({action,input,...(foreign?{workspaceId:foreign}:{})})).data};}
const denied=work=>assert.rejects(work,e=>/permission-denied|failed-precondition|invalid-argument|not-found/.test(String(e.code)));
const check=async(name,work)=>{await work();checks.push(name);console.log(`PASS ${name}`);};
const scenario={quantityOnHand:137,reservedQuantity:29,reorderLevel:47,movementFrequency:19,adjustmentCount:2,daysSinceReplenishment:1e-7};
let operation;
try{
 scope=(await database.doc('system/config').get()).data()?.dataScopeId;assert(scope);
 before=await inventory();await save('before-inventory.json',before);await save('intent.json',{actorIds,actualCamera:false,actualModel:false,scenarioOrigin:'legacy recovery software fixtures only'});
 const inv=await client(actorIds[0],'Inventory'),manager=await client(actorIds[1],'Manager'),viewer=await client(actorIds[2],'Viewer');
 await check('fresh public six-input inference is rejected without a receipt',async()=>{
  const fresh={operationId:randomUUID(),scenario};await assert.rejects(()=>inv.call('startInventoryExperiment',fresh),e=>/unavailable/.test(String(e.code)));
  assert(!(await database.doc('inventoryAIRequests/'+hash({action:'inventoryExperiment',actor:inv.uid,scope,operationId:fresh.operationId})).get()).exists);
 });
 await check('unknown legacy resolution remains a durable cancellation',async()=>{
  const input={operationId:randomUUID(),scenario};assert.equal((await inv.call('resolveInventoryExperiment',input)).state,'Cancelled');assert.equal((await inv.call('startInventoryExperiment',input)).state,'Cancelled');
 });
 const features=featuresForScenario(scenario),inputSha256=sha(inventoryAIFeaturePayload(features));
 const binding={modelSha256:'a'.repeat(64),servingManifestSha256:'b'.repeat(64),datasetSha256:'c'.repeat(64),developmentSha256:'d'.repeat(64),evaluationSha256:'e'.repeat(64),ranges:Object.fromEntries(Object.keys(features).map(k=>[k,{min:-1000,max:1000}])),metrics:{accuracy:.75,criticalRecall:.45,observations:60,origin:'AI-authored synthetic policy'},model:'RandomForest'};
 operation={operationId:randomUUID(),scenario};const id=randomUUID(),requestId=randomUUID(),receiptId=hash({action:'inventoryExperiment',actor:inv.uid,scope,operationId:operation.operationId});
 const prediction={protocol:'inventory-synthetic-inference-1.0',requestId,inputSha256,features,classOrder:['Normal','Reorder Risk','Critical Stock Risk'],label:'Normal',probabilities:[.7,.2,.1],model:'RandomForest',...Object.fromEntries(Object.entries(binding).filter(([k])=>k.endsWith('Sha256'))),processingTimeMs:1,totalProcessingTimeMs:2,outOfRange:[],...INVENTORY_AI_PROVENANCE};
 const result={state:'Predicted',operationId:operation.operationId,experimentId:id,replayed:false};
 await put('inventoryAIExperiments/'+id,{ownerId:scope,actor:inv.uid,operationId:operation.operationId,scenario,features,inputSha256,status:'Predicted',prediction,reason:null,source:binding,requestedAtMs:Date.now(),createdAt:require('firebase-admin/firestore').FieldValue.serverTimestamp(),version:1,protocol:'inventory-synthetic-inference-1.0',...INVENTORY_AI_PROVENANCE});
 await put('inventoryAIRequests/'+receiptId,{ownerId:scope,actor:inv.uid,input:operation,commandHash:hash(operation),state:'Predicted',result,version:2});
 await check('legacy terminal result and history remain exact under offline recovery',async()=>{
  const beforeResult=(await database.doc('inventoryAIExperiments/'+id).get()).data();
  assert.equal((await inv.call('startInventoryExperiment',operation)).experimentId,id);assert.equal((await inv.call('resolveInventoryExperiment',operation)).experimentId,id);
  assert.deepEqual((await database.doc('inventoryAIExperiments/'+id).get()).data(),beforeResult);
  await denied(()=>inv.call('startInventoryExperiment',{...operation,scenario:{...scenario,quantityOnHand:138}}));
 });
 await check('legacy pending then expiry uses its original features and source',async()=>{
  const input={operationId:randomUUID(),scenario},key=hash({action:'inventoryExperiment',actor:inv.uid,scope,operationId:input.operationId});
  await put('inventoryAIRequests/'+key,{ownerId:scope,actor:inv.uid,input,commandHash:hash(input),state:'Running',nonce:randomUUID(),features,inputSha256,binding,startedAtMs:Date.now(),expiresAtMs:Date.now()+45000,version:1});
  assert.equal((await inv.call('startInventoryExperiment',input)).state,'Pending');
  await database.doc('inventoryAIRequests/'+key).update({expiresAtMs:Date.now()-1});const expired=await inv.call('resolveInventoryExperiment',input);assert.equal(expired.state,'Unavailable');
  const saved=(await database.doc('inventoryAIExperiments/'+expired.experimentId).get()).data();assert.deepEqual(saved.scenario,scenario);assert.deepEqual(saved.source,binding);assert.equal(saved.reason.code,'request_expired');
 });
 await check('legacy public history remains readable and client writes/private reads denied',async()=>{
  assert((await getDoc(doc(viewer.db,'inventoryAIExperiments',id))).exists());await denied(()=>setDoc(doc(inv.db,'inventoryAIExperiments',tag),{ownerId:scope}));await denied(()=>updateDoc(doc(manager.db,'inventoryAIExperiments',id),{operationally_approved:true}));
  await denied(()=>getDocs(collection(inv.db,'inventoryAIRequests')));await denied(()=>getDoc(doc(inv.db,'inventoryAIRequests',receiptId)));await denied(()=>setDoc(doc(inv.db,'inventoryAIRequests',tag),{}));
  await denied(()=>viewer.call('startInventoryExperiment',operation));await denied(()=>inv.call('startInventoryExperiment',operation,'foreign'));
 });
 await check('revoked legacy actor cannot recover a retained outcome',async()=>{await database.doc('users/'+inv.uid).update({active:false});await denied(()=>inv.call('resolveInventoryExperiment',operation));await database.doc('users/'+inv.uid).update({active:true});});
}catch(e){failure={name:e.name,code:e.code??null,message:String(e.message).slice(0,1500)};process.exitCode=1;console.error('Stock AI emulator QA failed:',failure.code??failure.name);}
finally{
 try{if(browser)await browser.close();if(before){const current=await inventory();protectedEqual(before,current);for(const [path] of Object.entries(current.docs)){if(before.docs[path])continue;const data=(await database.doc(path).get()).data(),kind=path.split('/')[0];assert(ownedDocs.has(path)||data?.ownerId===scope&&['inventoryAIRequests','inventoryAIExperiments','auditLogs'].includes(kind)&&actorIds.includes(data.actor),'Unexpected new document; cleanup refused.');ownedDocs.add(path);}for(const uid of Object.keys(current.accounts))assert(before.accounts[uid]||actorIds.includes(uid));assert.deepEqual(current.objects,before.objects);await save('pre-cleanup-inventory.json',current);for(const path of ownedDocs)await database.doc(path).delete();for(const uid of actorIds)try{await identity.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}const after=await inventory();assert.deepEqual(after,before);cleanupComplete=true;await save('after-inventory.json',after);}}catch(e){process.exitCode=1;failure??={name:e.name,message:String(e.message).slice(0,1500)};console.error('Stock AI cleanup could not be verified.');}
 await save('result.json',{passed:!failure,cleanupComplete,actualEmulators:true,actualModel:false,actualCamera:false,checks,error:failure??null});await Promise.all(apps.map(deleteApp));await admin.deleteApp(server);console.log(JSON.stringify({passed:!failure,cleanupComplete,checks:checks.length,output:out}));
}
