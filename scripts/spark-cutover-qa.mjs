import test from 'node:test';
import assert from 'node:assert/strict';
import {sparkHash} from './spark-private-files.mjs';
const load=()=>import('../tools/msi-backend/cutover.mjs').catch(()=>({}));
test('runtime and HTTPS approval cannot dispatch cloud commands or bootstrap before the exact publication completes',async()=>{
 const {createSparkApprovedDispatcher}=await load();assert.equal(typeof createSparkApprovedDispatcher,'function');
 const profile={mode:'spark-msi',projectId:'fyp-inventory-and-logistics',adoptionSha256:'a'.repeat(64)},baseline=Buffer.from(JSON.stringify({schema:'iilas-spark-bootstrap-baseline-1.0',projectId:profile.projectId,primaryAdminUid:'selected-admin',adoptionSha256:profile.adoptionSha256,documentsSha256:'b'.repeat(64)})),publication=Buffer.from(JSON.stringify({passed:true,completed:['firestore:indexes','firestore:rules','hosting'],manifestSha256:'c'.repeat(64),billingEnabled:false,applicationDataWrites:0,cloudBootstrap:false}));
 const cutover={primaryAdminUid:'selected-admin',baseline:{path:'baseline',sha256:sparkHash(baseline)},publication:{path:'publication',sha256:sparkHash(publication),manifestSha256:'c'.repeat(64)}};
 let calls=0,checks=0,ready=false,config=null;
 const dependencies={profile,executeCommand:async()=>{calls++;return 'executed';},readPrivate:async path=>{if(path==='baseline')return baseline;if(!ready)throw Error('Not published');return publication;},readConfiguration:async()=>config,verifyBootstrap:async()=>{checks++;}};
 const request={action:'registerAccount',input:{displayName:'Selected Admin'}};
 for(const activation of [{approvedActions:['runtime','public-https'],cutover:null},{approvedActions:['runtime','public-https','cloud-commands','bootstrap'],cutover}])await assert.rejects(()=>createSparkApprovedDispatcher({...dependencies,activation})({uid:'selected-admin'},request),{code:'unavailable'});
 assert.equal(calls,0);assert.equal(checks,0);ready=true;
 const dispatcher=createSparkApprovedDispatcher({...dependencies,activation:{approvedActions:['runtime','public-https','cloud-commands','bootstrap'],cutover}});
 await assert.rejects(()=>dispatcher({uid:'replacement'},request));assert.equal(calls,0);
 assert.equal(await dispatcher({uid:'selected-admin'},request),'executed');assert.equal(checks,1);
 config={primaryAdminUid:'selected-admin',dataScopeId:'selected-admin'};assert.equal(await dispatcher({uid:'staff'},{action:'captureInventoryContext',input:{}}),'executed');assert.equal(checks,1);
 config={primaryAdminUid:'other',dataScopeId:'other'};await assert.rejects(()=>dispatcher({uid:'selected-admin'},request));
});
test('production environment has no bootstrap email for runtime/HTTPS-only approval',async()=>{
 const {sparkLaunchEnvironment}=await import('../tools/msi-backend/launch.mjs'),profile={mode:'spark-msi',projectId:'fyp-inventory-and-logistics'};
 assert.equal(sparkLaunchEnvironment({profile,serving:{backendEnvironment:{}},inherited:{}}).IILAS_BOOTSTRAP_ADMIN_EMAIL,undefined);
 assert.equal(sparkLaunchEnvironment({profile,serving:{backendEnvironment:{}},activation:{approvedActions:['runtime','public-https','cloud-commands','bootstrap']},inherited:{}}).IILAS_BOOTSTRAP_ADMIN_EMAIL,'choongkin6@gmail.com');
});
test('bootstrap baseline uses complete typed document reads including nested collections and refuses paging loops',async()=>{
 const {readSparkBootstrapDocuments}=await load(),root='projects/fyp-inventory-and-logistics/databases/(default)/documents',parent={name:root+'/products/box',createTime:'2026-10-01T00:00:00Z',updateTime:'2026-10-01T00:00:00Z',fields:{onHand:{integerValue:'5'}}},child={...parent,name:parent.name+'/notes/review',fields:{text:{stringValue:'intact'}}},calls=[];
 const request=async(path,body)=>{calls.push({path,body});if(body){if(path==='/v1/'+root+':listCollectionIds')return {collectionIds:['products']};if(path==='/v1/'+parent.name+':listCollectionIds')return {collectionIds:['notes']};return {collectionIds:[]};}if(path.startsWith('/v1/'+root+'/products?'))return {documents:[parent]};if(path.startsWith('/v1/'+parent.name+'/notes?'))return {documents:[child]};throw Error('Unexpected read');};
 assert.deepEqual(await readSparkBootstrapDocuments(request),[parent,child]);assert(calls.every(c=>!c.body||c.path.endsWith(':listCollectionIds')));
 await assert.rejects(()=>readSparkBootstrapDocuments(async()=>({collectionIds:[],nextPageToken:'same'})));
});
