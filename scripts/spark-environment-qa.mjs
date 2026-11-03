import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_DEMO_ENVIRONMENT, projectRecoveryStorage} from '../lib/demoEnvironment.js';
const load=()=>import('../lib/sparkRuntime.js');
const profile={schema:'iilas-spark-msi-1.0',mode:'spark-msi',projectId:'fyp-inventory-and-logistics',webOrigins:['https://fyp-inventory-and-logistics.web.app'],apiOrigin:'https://iilas-fixture.invalid',backendInstanceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',adoptionSha256:'a'.repeat(64),evidenceStore:'msi-local'};
const loopback={schema:'iilas-spark-loopback-test-1.0',mode:'spark-loopback-test',projectId:profile.projectId,backendInstanceId:profile.backendInstanceId,apiOrigin:'http://127.0.0.1:8011',webOrigins:['http://127.0.0.1:5173'],emulatorHosts:{auth:'127.0.0.1:9099',firestore:'127.0.0.1:8081',storage:'127.0.0.1:9199'}};
test('same_project_different_mode never reuses an emulator SDK',async()=>{
 const m=await load();let storageCalls=0;const factories={initialise:(options,name)=>({options,name}),auth:app=>({app}),firestore:app=>({app}),functions:()=>{storageCalls++;},storage:()=>{storageCalls++;},connect:()=>{}};
 const sdk=m.initialiseSparkSDKs({profile,allowlist:[profile],options:{projectId:profile.projectId},origin:profile.webOrigins[0],factories});
 assert.equal(sdk.app.name,'iilas.spark-msi.fyp-inventory-and-logistics');assert.equal(storageCalls,0);assert.equal(sdk.functions,undefined);assert.equal(sdk.storage,undefined);
 assert.throws(()=>m.initialiseSparkSDKs({profile,allowlist:[profile],options:{projectId:profile.projectId},origin:profile.webOrigins[0],existing:{name:'[DEFAULT]',options:{projectId:profile.projectId}},factories}));
});
test('backend_changed_pending_retained in separate actor and instance namespace',async()=>{
 const m=await load(),memory=new Map([['pending','old-local']]),store={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 assert.equal(projectRecoveryStorage(store,LOCAL_DEMO_ENVIRONMENT),store);
 const one=m.sparkRecoveryKey(profile,'staff_a','pending'),two=m.sparkRecoveryKey({...profile,backendInstanceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},'staff_a','pending');
 store.setItem(one,'original-operation');assert.notEqual(one,two);assert.notEqual(one,m.sparkRecoveryKey(profile,'staff_b','pending'));assert.equal(store.getItem(two),null);assert.equal(store.getItem(one),'original-operation');assert.equal(store.getItem('pending'),'old-local');
 assert.notEqual(one,m.sparkRecoveryKey({...profile,apiOrigin:'https://changed-api.invalid'},'staff_a','pending'));
});
test('mixed_profile_rejected, exact allowlist, accessors and HTTPS origin',async()=>{
 const m=await load();assert(Object.isFrozen(m.validateSparkProfile(profile,[profile])));assert.throws(()=>m.validateSparkProfile(profile,[]));
 for(const change of [{storageBucket:'forbidden'},{mode:'cloud-demo'},{apiOrigin:'http://127.0.0.1:8011'},{webOrigins:['https://fyp-inventory-and-logistics.web.app/path']},{adoptionSha256:'bad'},{backendInstanceId:'bad'}])assert.throws(()=>m.validateSparkProfile({...profile,...change},[profile]));
 const accessor={...profile};Object.defineProperty(accessor,'apiOrigin',{enumerable:true,get:()=>profile.apiOrigin});assert.throws(()=>m.validateSparkProfile(accessor,[profile]));
});
test('loopback test connects only exact emulators and never validates as production',async()=>{
 const m=await load(),seen=[];const factories={initialise:(options,name)=>({options,name}),auth:()=>({}),firestore:()=>({}),connect:(_sdk,endpoint,kind)=>seen.push([kind,endpoint])};
 const sdk=m.initialiseSparkSDKs({profile:loopback,allowlist:[loopback],options:{projectId:profile.projectId},origin:'http://127.0.0.1:5173',factories});
 assert.equal(sdk.profile.mode,'spark-loopback-test');assert.deepEqual(seen,[['auth',{host:'127.0.0.1',port:9099}],['firestore',{host:'127.0.0.1',port:8081}]]);
 assert.throws(()=>m.validateSparkProfile(loopback,[loopback]));assert.throws(()=>m.validateSparkLoopbackTest({...loopback,credentialPath:'forbidden'}));assert.throws(()=>m.validateSparkLoopbackTest({...loopback,emulatorHosts:{...loopback.emulatorHosts,firestore:'192.168.0.5:8081'}}));
});
test('cloud_emulator_env_rejected and credential_project_mismatch',async()=>{
 const m=await import('../backend/functions/sparkRuntime.mjs');
 const config={schema:'iilas-spark-server-1.0',profileSha256:'b'.repeat(64),credentialPath:'private/credential.json',credentialSha256:'c'.repeat(64),evidenceRoot:'private/evidence',evidenceRootId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',servingBindingPath:'private/binding.json',servingBindingSha256:'d'.repeat(64)};
 const evidence={profileSha256:config.profileSha256,credentialProjectId:profile.projectId,credentialSha256:config.credentialSha256,evidenceRootId:config.evidenceRootId,servingBindingSha256:config.servingBindingSha256,env:{}};
 assert.equal(m.validateSparkServerConfig(config,profile,evidence).evidenceRoot,config.evidenceRoot);
 assert.throws(()=>m.validateSparkServerConfig(config,profile,{...evidence,env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081'}}));
 assert.throws(()=>m.validateSparkServerConfig(config,profile,{...evidence,credentialProjectId:'different-project'}));assert.throws(()=>m.validateSparkServerConfig(config,profile,{...evidence,credentialSha256:'e'.repeat(64)}));
});
test('stale_backup_or_existing_config refuses; billing_must_remain_false',async()=>{
 const {readExistingCloudBackup}=await import('./hybrid-existing-adoption.mjs'),{prepareSparkAdoption}=await import('./spark-adoption.mjs');
 const backup=await readExistingCloudBackup('outputs/existing-cloud-audit-20261028/verified-backup-receipt.json');
 const input={backup,observedState:backup.observedState,sourcePins:{'fixture.mjs':'a'.repeat(64)},billingEnabled:false};
 const result=prepareSparkAdoption(input);assert.equal(result.fixtureOnly,true);assert.equal(result.readiness.billingEnabled,false);assert(!result.readiness.blockers.includes('BillingDisabled'));assert(result.readiness.blockers.includes('FreshCutoverBackupRequired'));assert.equal(result.adoption.mergeOtherOwners,false);assert.deepEqual(result.adoption.dataChanges,[]);assert.equal(backup.documentCount,128);
 assert.throws(()=>prepareSparkAdoption({...input,billingEnabled:true}));assert.throws(()=>prepareSparkAdoption({...input,observedState:{...backup.observedState,systemConfigPresent:true}}));assert.throws(()=>prepareSparkAdoption({...input,observedState:{...backup.observedState,documentsSha256:'f'.repeat(64)}}));
});
