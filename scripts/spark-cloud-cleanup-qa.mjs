import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('./spark-cloud-cleanup.mjs').catch(()=>({}));
const context={runId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',preparationSha256:'a'.repeat(64)};
const intent={...context,scope:'scope',runTag:'run-fixture',secondUid:'manager',recordIds:['new'],recordPaths:['products/new'],operationIds:[],retainedPaths:[]};
test('follow-up registration cannot replace terminal fingerprints or add another staff business record',async()=>{
 const {mergeSparkCloudFixtureRegistry}=await load(),base={'products/new':'a'.repeat(64)},registration={schema:'iilas-cloud-fixture-registration-1.0',...context,records:{...base,'integrityChecks/owned':'b'.repeat(64)}};
 assert.deepEqual(mergeSparkCloudFixtureRegistry(base,registration,intent),registration.records);
 assert.throws(()=>mergeSparkCloudFixtureRegistry(base,{...registration,records:{...registration.records,'products/new':'f'.repeat(64)}},intent));
 assert.throws(()=>mergeSparkCloudFixtureRegistry(base,{...registration,records:{...registration.records,'shipments/unrelated':'c'.repeat(64)}},intent));
});
test('destructive cleanup requires approval of the exact final frozen plan',async()=>{
 const {validateSparkCleanupApproval,sparkCloudRowHash}=await load(),plan={...context,paths:['products/new'],registrySha256:'a'.repeat(64)},approval={schema:'iilas-cloud-cleanup-approval-1.0',...context,planSha256:sparkCloudRowHash(plan),deleteOnlyRegisteredUnchangedFixtures:true,billingMustRemainDisabled:true};
 assert.equal(validateSparkCleanupApproval(approval,plan),true);assert.throws(()=>validateSparkCleanupApproval(approval,{...plan,paths:['products/new','shipments/unrelated']}));assert.throws(()=>validateSparkCleanupApproval({...approval,schema:'iilas-cloud-cleanup-approval-draft-1.0'},plan));
});
test('cleanup never adopts a later linked shipment or a fixture changed before planning',async()=>{
 const {planSparkCloudCleanup,sparkCloudRowHash}=await load();const original={ownerId:'scope',name:'Original'},fixture={ownerId:'scope',sku:'run-fixture',version:1},before={'products/original':sparkCloudRowHash(original)},rows={'products/original':original,'products/new':fixture},frozen={...intent,fixturePins:{'products/new':sparkCloudRowHash(fixture)}};
 const capture=records=>({rows:records,hashes:Object.fromEntries(Object.entries(records).map(([p,r])=>[p,sparkCloudRowHash(r)]))});
 assert.throws(()=>planSparkCloudCleanup({before,current:capture({...rows,'products/new':{...fixture,version:99}}),intent:frozen}));
 assert.throws(()=>planSparkCloudCleanup({before,current:capture({...rows,'shipments/later-staff-shipment':{ownerId:'scope',productId:'new'}}),intent:frozen}));
});
test('cleanup plan preserves all originals and retains only exact registered unchanged fixture rows',async()=>{
 const {planSparkCloudCleanup,sparkCloudRowHash}=await load();assert.equal(typeof planSparkCloudCleanup,'function');
 const original={ownerId:'scope',name:'Original',version:1},fixture={ownerId:'scope',sku:'run-fixture',version:1},before={'products/original':sparkCloudRowHash(original)},rows={'products/original':original,'products/new':fixture},current={rows,hashes:Object.fromEntries(Object.entries(rows).map(([p,r])=>[p,sparkCloudRowHash(r)]))};
 const registered={...intent,fixturePins:{'products/new':sparkCloudRowHash(fixture)}},plan=planSparkCloudCleanup({before,current,intent:registered});assert.deepEqual(plan.paths,['products/new']);assert.equal(plan.observedHashes['products/original'],before['products/original']);
 assert.throws(()=>planSparkCloudCleanup({before,current:{...current,hashes:{...current.hashes,'products/original':'f'.repeat(64)}},intent}));
 assert.throws(()=>planSparkCloudCleanup({before,current:{rows:{...rows,'products/foreign':{ownerId:'scope',name:'Other'}},hashes:{...current.hashes,'products/foreign':'b'.repeat(64)}},intent}));
});
test('transaction cleanup refuses a concurrent change before scheduling any deletes',async()=>{
 const {planSparkCloudCleanup,deleteSparkCloudFixtures,sparkCloudRowHash}=await load();assert.equal(typeof deleteSparkCloudFixtures,'function');
 const original={ownerId:'scope',name:'Original'},fixture={ownerId:'scope',sku:'run-fixture',version:1},rows={'products/original':original,'products/new':fixture},before={'products/original':sparkCloudRowHash(original)},current={rows,hashes:Object.fromEntries(Object.entries(rows).map(([p,r])=>[p,sparkCloudRowHash(r)]))},registered={...intent,fixturePins:{'products/new':sparkCloudRowHash(fixture)}},plan=planSparkCloudCleanup({before,current,intent:registered});
 let deletes=[];const db={doc:path=>({path}),runTransaction:async work=>work({getAll:async(...refs)=>refs.map(ref=>({exists:true,data:()=>ref.path==='products/new'?{...fixture,version:2}:original})),delete:ref=>deletes.push(ref.path)})};
 await assert.rejects(()=>deleteSparkCloudFixtures({db,plan,before,current,intent:registered}));assert.deepEqual(deletes,[]);
 db.runTransaction=async work=>work({getAll:async(...refs)=>refs.map(ref=>({exists:true,data:()=>rows[ref.path]})),delete:ref=>deletes.push(ref.path)});
 assert.equal((await deleteSparkCloudFixtures({db,plan,before,current,intent:registered})).deleted,1);assert.deepEqual(deletes,['products/new']);
});
if(process.argv.includes('--emulator'))test('actual Firestore transaction keeps a changed fixture and then removes only its reverified owned rows',async()=>{
 const {createRequire}=await import('node:module'),{randomUUID}=await import('node:crypto'),{writeFile}=await import('node:fs/promises');
 const {sparkCloudInventory,planSparkCloudCleanup,deleteSparkCloudFixtures,sealSparkCloudFixtureRegistry}=await import('./spark-cloud-cleanup.mjs');
 assert(!process.env.GOOGLE_APPLICATION_CREDENTIALS);assert(!process.env.FIRESTORE_EMULATOR_HOST||process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8081');process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8081';
 const require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),admin=require('firebase-admin/app'),app=admin.initializeApp({projectId:'fyp-inventory-and-logistics'},'cleanup-local-'+randomUUID()),db=require('firebase-admin/firestore').getFirestore(app);
 try{
  const before=await sparkCloudInventory(db),scope=(await db.doc('system/config').get()).data().dataScopeId,id='cleanup-'+randomUUID(),product='products/'+id,audit='auditLogs/'+id;
  const {cloudProductFixture}=await import('./spark-cloud-scenarios.mjs');await db.doc(product).create({...cloudProductFixture('CLOUD-'+randomUUID().slice(0,8),'stock'),ownerId:scope,version:1});await db.doc(audit).create({ownerId:scope,recordId:id,action:'Disposable cleanup verification'});
  const intent={...context,scope,runTag:id,secondUid:'unused',recordIds:[id],recordPaths:[product],operationIds:[],retainedPaths:[]},current=await sparkCloudInventory(db);intent.fixturePins=sealSparkCloudFixtureRegistry({before:before.hashes,current,intent});const plan=planSparkCloudCleanup({before:before.hashes,current,intent});
  assert.equal(plan.paths.length,2);await db.doc(product).update({version:2});await assert.rejects(()=>deleteSparkCloudFixtures({db,plan,before:before.hashes,current,intent}));assert.equal((await db.doc(product).get()).exists,true);assert.equal((await db.doc(audit).get()).exists,true);
  const changed=await sparkCloudInventory(db);assert.throws(()=>planSparkCloudCleanup({before:before.hashes,current:changed,intent}));
  // Undo only this test's deliberate edit to its own disposable fixture. The
  // cleanup library cannot restore data or adopt the changed version.
  await db.doc(product).update({version:1});const revised=await sparkCloudInventory(db),revisedPlan=planSparkCloudCleanup({before:before.hashes,current:revised,intent}),result=await deleteSparkCloudFixtures({db,plan:revisedPlan,before:before.hashes,current:revised,intent});assert.equal(result.deleted,2);const after=await sparkCloudInventory(db);assert.deepEqual(after.hashes,before.hashes);
  await writeFile('outputs/spark-cloud-activation-20261028-9aabba08/actual-cleanup-emulator-'+randomUUID()+'.private.json',JSON.stringify({passed:true,originalDocuments:Object.keys(before.hashes).length,changedFixtureRefused:true,onlyOwnedRowsDeleted:2,originalsExact:true,cloudWrites:0}),{flag:'wx',mode:0o600});
 }finally{await admin.deleteApp(app);}
});
