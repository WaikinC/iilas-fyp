import assert from 'node:assert/strict';
import {beforeEach,test,mock} from 'node:test';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {INVENTORY_CONTEXT_PROTOCOL,INVENTORY_CONTEXT_CLASSES,INVENTORY_CONTEXT_FEATURES,INVENTORY_CONTEXT_PROVENANCE} from '../lib/inventoryContextAI.js';
const require=createRequire(new URL('../backend/functions/service.mjs',import.meta.url)),contexts=new AsyncLocalStorage();
let rows,revision,clock,configuration,network,commands,calls;
const clone=v=>v===undefined?undefined:structuredClone(v),put=(path,value)=>{rows.set(path,clone(value));revision++;};
const ref=path=>({path});
function query(kind,filters=[],orders=[],cap=Infinity){return {kind,filters,orders,cap,query:true,where:(...f)=>query(kind,[...filters,f],orders,cap),orderBy:(...o)=>query(kind,filters,[...orders,o],cap),limit:n=>query(kind,filters,orders,n)};}
const db={doc:ref,collection:kind=>({...query(kind),doc:id=>ref(`${kind}/${id}`)}),async runTransaction(work){
 return contexts.run(true,async()=>{for(let attempt=0;attempt<15;attempt++){
  const start=revision,view=new Map([...rows].map(([p,v])=>[p,clone(v)])),writes=[];
  const snap=(path,data)=>({id:path.split('/').at(-1),ref:ref(path),exists:data!==undefined,data:()=>clone(data)});
  const tx={async get(r){assert.equal(writes.length,0,'Transaction read after write');if(!r.query)return snap(r.path,view.get(r.path));let list=[...view].filter(([p])=>p.startsWith(r.kind+'/')).map(([p,v])=>snap(p,v));for(const [f,op,v] of r.filters){const n=v?.toMillis?.()??v;list=list.filter(s=>op==='=='?s.data()[f]===n:op==='>='?s.data()[f]>=n:s.data()[f]<=n);}for(const [f,d] of [...r.orders].reverse())list.sort((a,b)=>(a.data()[f]>b.data()[f]?1:a.data()[f]<b.data()[f]?-1:0)*(d==='desc'?-1:1));list=list.slice(0,r.cap);return {docs:list,size:list.length};},create(r,v){assert(!view.has(r.path));writes.push([r.path,v]);},set(r,v){writes.push([r.path,v]);},update(r,v){assert(view.has(r.path));writes.push([r.path,{...view.get(r.path),...v}]);}};
  const result=await work(tx);if(start!==revision)continue;for(const [p,v] of writes)put(p,v);return result;
 }throw Error('fixture retry limit');});
}};
mock.method(require('firebase-admin/firestore'),'getFirestore',()=>db);
mock.method(require('firebase-admin/firestore').FieldValue,'serverTimestamp',()=>clock);
const api=await import('../backend/functions/inventoryContextAI.mjs').catch(()=>null);
const input=()=>({operationId:randomUUID(),scenario:{quantityOnHand:120,reservedQuantity:20,reorderLevel:25,movementFrequency:12,adjustmentCount:1,daysSinceReplenishment:.25,additionalFirmQuantity:30,additionalDueDays:2,incomingQuantity:10,incomingEtaDays:1,supplyStatus:'confirmed'}});
const kind=name=>[...rows].filter(([p])=>p.startsWith(name+'/'));
const call=(action,value,uid='inventory',scope='scope')=>{assert(commands,'Trusted stock AI handlers are missing');return commands[action]({uid},scope,value);};
function response(request,changes={}){return new Response(JSON.stringify({protocol:INVENTORY_CONTEXT_PROTOCOL,requestId:request.requestId,inputSha256:request.inputSha256,features:request.features,classOrder:[...INVENTORY_CONTEXT_CLASSES],label:'Normal',probabilities:[.7,.2,.1],model:'RandomForest',...configuration.expected,processingTimeMs:1,totalProcessingTimeMs:2,outOfRange:[],...INVENTORY_CONTEXT_PROVENANCE,...changes},(key,value)=>key==='ranges'?undefined:value),{status:200});}
const waitCalls=async n=>{for(let i=0;i<100&&calls.length<n;i++)await new Promise(r=>setImmediate(r));assert.equal(calls.length,n);};
beforeEach(()=>{
 rows=new Map();revision=0;clock=1000000;calls=[];
 Object.assign(process.env,{FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_STOCK_API_URL:'http://127.0.0.1:8001'});
 put('system/config',{dataScopeId:'scope',primaryAdminUid:'admin'});
 for(const [uid,role] of [['admin','Admin'],['inventory','Inventory'],['manager','Manager'],['warehouse','Warehouse'],['viewer','Viewer']])put('users/'+uid,{uid,role,status:'Approved',active:true});
 put('products/p',{ownerId:'scope',version:1,quantityOnHand:100,reservedQuantity:30,warehouseReservedQuantity:0,reorderLevel:80,location:'A',name:'Fixture',sku:'FIX',status:'Active'});
 configuration={url:'http://127.0.0.1:8001',token:'fixture-only-value',fingerprint:createHash('sha256').update('fixture configuration').digest('hex'),expected:{modelSha256:'a'.repeat(64),servingManifestSha256:'b'.repeat(64),datasetSha256:'c'.repeat(64),developmentSha256:'d'.repeat(64),evaluationSha256:'e'.repeat(64),ranges:Object.fromEntries(INVENTORY_CONTEXT_FEATURES.map(k=>[k,{min:-100,max:1000}]))},metrics:{accuracy:587/720,macroF1:.8080105925190334,criticalPrecision:.79,criticalRecall:316/360,observations:720,families:60,accuracyInterval:[.7853819444444444,.8486111111111111],origin:'AI-authored synthetic policy'}};
 network=async request=>response(request);
 commands=api?.createInventoryContextCommands?.({configuration:()=>configuration,clock:()=>clock,fetcher:async(url,options)=>{assert(!contexts.getStore(),'Model HTTP must not run inside a transaction');const request=JSON.parse(options.body);calls.push(request);assert.equal(url,'http://127.0.0.1:8001/predict/stock-experiment');return network(request);}});
});
test('exact input and local tuple refuse before writes/model call',async()=>{
 const before=clone([...rows]);await assert.rejects(async()=>call('startInventoryContextExperiment',{...input(),actor:'forged'}));
 delete process.env.FUNCTIONS_EMULATOR;await assert.rejects(async()=>call('startInventoryContextExperiment',input()));assert.deepEqual([...rows],before);assert.equal(calls.length,0);
});
test('viewer, revoked status and foreign scope cannot start/read/recover',async()=>{
 for(const [uid,scope] of [['viewer','scope'],['inventory','foreign']])await assert.rejects(async()=>call('startInventoryContextExperiment',input(),uid,scope));
 put('users/inventory',{uid:'inventory',role:'Inventory',status:'Pending',active:true});await assert.rejects(async()=>call('startInventoryContextExperiment',input()));assert.equal(kind('inventoryContextAIRequests').length,0);
});
test('one prediction is retained, exact replay does not call Python and business data is untouched',async()=>{
 const before=clone(rows.get('products/p')),request=input(),one=await call('startInventoryContextExperiment',request);
 assert.equal(one.state,'Predicted');assert.equal((await call('startInventoryContextExperiment',request)).experimentId,one.experimentId);assert.equal((await call('resolveInventoryContextExperiment',request)).experimentId,one.experimentId);
 assert.equal(calls.length,1);assert.equal(kind('inventoryAIExperiments').length,1);assert.equal(kind('inventoryContextAIRequests').length,1);assert.deepEqual(rows.get('products/p'),before);
 for(const name of ['predictions','inventoryRiskSnapshots','inventoryRiskReviews','purchaseOrders','stockMovements'])assert.equal(kind(name).length,0);
 const saved=rows.get('inventoryAIExperiments/'+one.experimentId);assert.equal(saved.operationally_approved,false);assert.equal(saved.prediction.label,'Normal');assert(!JSON.stringify([...rows]).includes(configuration.token));
 assert.equal(saved.version,2);assert.equal(saved.protocol,INVENTORY_CONTEXT_PROTOCOL);assert.equal(Object.keys(saved.features).length,14);assert.equal(saved.scenario.additionalFirmQuantity,30);assert.deepEqual(saved.source.metrics,configuration.metrics);
 await assert.rejects(async()=>call('startInventoryContextExperiment',{...request,scenario:{...request.scenario,quantityOnHand:121}}));
});
test('concurrent starts return Pending and invoke only one external worker',async()=>{
 let release;network=request=>new Promise(r=>{release=()=>r(response(request));});const request=input(),first=call('startInventoryContextExperiment',request);await waitCalls(1);
 const second=await call('startInventoryContextExperiment',request);assert.equal(second.state,'Pending');assert.equal(second.experimentId,null);assert.equal(calls.length,1);release();assert.equal((await first).state,'Predicted');
});
test('unknown resolution creates a cancellation tombstone before a late start',async()=>{
 const request=input();assert.equal((await call('resolveInventoryContextExperiment',request)).state,'Cancelled');assert.equal((await call('startInventoryContextExperiment',request)).state,'Cancelled');assert.equal(calls.length,0);assert.equal(kind('inventoryAIExperiments').length,0);
});
test('running request resolves Pending then expiry fences the late prediction',async()=>{
 let release;network=request=>new Promise(r=>{release=()=>r(response(request));});const request=input(),first=call('startInventoryContextExperiment',request);await waitCalls(1);
 assert.equal((await call('resolveInventoryContextExperiment',request)).state,'Pending');clock+=45001;const expired=await call('resolveInventoryContextExperiment',request);assert.equal(expired.state,'Unavailable');
 const saved=clone(rows.get('inventoryAIExperiments/'+expired.experimentId));release();assert.equal((await first).experimentId,expired.experimentId);assert.deepEqual(rows.get('inventoryAIExperiments/'+expired.experimentId),saved);assert.equal(calls.length,1);
});
test('resolution works with configuration/service absent and exact retry preserves result',async()=>{
 const request=input(),one=await call('startInventoryContextExperiment',request);configuration=null;assert.equal((await call('resolveInventoryContextExperiment',request)).experimentId,one.experimentId);assert.equal((await call('startInventoryContextExperiment',request)).experimentId,one.experimentId);
});
test('completed old manifest outcome replays after source40 profile cutover',async()=>{
 const request=input(),one=await call('startInventoryContextExperiment',request),saved=clone(rows.get('inventoryAIExperiments/'+one.experimentId)),count=calls.length,store=clone([...rows]);
 configuration={...configuration,token:'fresh-fixture-only',fingerprint:'f'.repeat(64),expected:{...configuration.expected,servingManifestSha256:'9'.repeat(64)}};
 assert.equal((await call('resolveInventoryContextExperiment',request)).experimentId,one.experimentId);
 assert.equal((await call('startInventoryContextExperiment',request)).experimentId,one.experimentId);
 assert.equal(calls.length,count);assert.deepEqual(rows.get('inventoryAIExperiments/'+one.experimentId),saved);assert.deepEqual([...rows],store);
});
test('permission revocation before finalisation cannot persist a result',async()=>{
 network=async request=>{put('users/inventory',{uid:'inventory',role:'Inventory',status:'Approved',active:false});return response(request);};const request=input();await assert.rejects(async()=>call('startInventoryContextExperiment',request));assert.equal(kind('inventoryAIExperiments').length,0);await assert.rejects(async()=>call('resolveInventoryContextExperiment',request));
});
test('changed server configuration and expired nonce cannot overwrite a terminal outcome',async()=>{
 network=async request=>{configuration={...configuration,fingerprint:'f'.repeat(64)};return response(request);};const one=await call('startInventoryContextExperiment',input());assert.equal(one.state,'Unavailable');assert.equal(rows.get('inventoryAIExperiments/'+one.experimentId).reason.code,'configuration_changed');
});
test('forged response, busy, timeout and oversized output remain unavailable',async()=>{
 for(const mode of ['forged','busy','timeout','oversized']){
  network=async request=>{if(mode==='busy')return new Response('',{status:429});if(mode==='timeout')throw Object.assign(new Error('fixture'),{name:'TimeoutError'});if(mode==='oversized')return new Response('x'.repeat(20000));return response(request,{operationally_approved:true});};
  const one=await call('startInventoryContextExperiment',input());assert.equal(one.state,'Unavailable');assert.equal(rows.get('inventoryAIExperiments/'+one.experimentId).prediction,null);
 }
 assert.equal(kind('predictions').length,0);
});
test('scope change during transport fences final output and old recovery',async()=>{
 let release;network=request=>new Promise(resolve=>{release=()=>resolve(response(request));});const request=input(),work=call('startInventoryContextExperiment',request);await waitCalls(1);put('system/config',{dataScopeId:'new-scope',primaryAdminUid:'admin'});release();await assert.rejects(work,/data source/);assert.equal(kind('inventoryAIExperiments').length,0);await assert.rejects(call('resolveInventoryContextExperiment',request),/data source/);
});
test('stale server nonce cannot publish over a later lease',async()=>{
 let release;network=request=>new Promise(resolve=>{release=()=>resolve(response(request));});const request=input(),work=call('startInventoryContextExperiment',request);await waitCalls(1);const [path,saved]=kind('inventoryContextAIRequests')[0];put(path,{...saved,nonce:randomUUID()});release();assert.equal((await work).state,'Pending');assert.equal(kind('inventoryAIExperiments').length,0);clock+=45001;assert.equal((await call('resolveInventoryContextExperiment',request)).state,'Unavailable');
});
test('generic inventory inference refuses before any source product/history read',async()=>{
 const {executeCommand}=await import('../backend/functions/service.mjs');rows.delete('products/p');const before=clone([...rows]);await assert.rejects(executeCommand({uid:'inventory'},{action:'predict',input:{kind:'inventory',id:'p'}}),e=>e.code==='unavailable'&&/Stock AI experiment/.test(e.message));assert.deepEqual([...rows],before);assert.equal(calls.length,0);
});
