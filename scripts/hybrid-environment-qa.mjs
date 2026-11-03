import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDemoEnvironment,demoEnvironmentKey,getDemoEndpoints,initialiseDemoSDKs,LOCAL_DEMO_ENVIRONMENT} from '../lib/demoEnvironment.js';
import {assertDemoRuntime} from '../backend/functions/demoEnvironment.mjs';

const local=()=>structuredClone(LOCAL_DEMO_ENVIRONMENT);
const cloud=()=>({...local(),mode:'cloud-demo',projectId:'iilas-cloud-fixture',storageBucket:'iilas-cloud-fixture.firebasestorage.app',webOrigins:['https://iilas-cloud-fixture.web.app']});
const env=()=>({FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:'fyp-inventory-and-logistics',GOOGLE_CLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'});
test('local_tuple_stays_exact',()=>{
 assert.deepEqual(validateDemoEnvironment(local(),[local()]),local());
 for(const patch of [{projectId:'other'},{storageBucket:'other.bucket'},{functionsRegion:'other'},{extra:true},{webOrigins:['http://192.168.1.2:5173']}])assert.throws(()=>validateDemoEnvironment({...local(),...patch},[{...local(),...patch}]));
 assert.equal(assertDemoRuntime(env(),local()).mode,'local-emulator');
 for(const key of ['FUNCTIONS_EMULATOR','GCLOUD_PROJECT','FIRESTORE_EMULATOR_HOST','IILAS_FYP_COMPLETION_MODE'])assert.throws(()=>assertDemoRuntime({...env(),[key]:'other'},local()));
});
test('reject_unknown_or_mixed_project_before_sdk_init',()=>{
 let initialised=0;
 const factories={initialise:()=>{initialised++;return {};},auth:()=>({}),firestore:()=>({}),functions:()=>({}),storage:()=>({}),connect:()=>{}};
 assert.throws(()=>initialiseDemoSDKs({profile:cloud(),allowlist:[local()],options:{projectId:cloud().projectId,storageBucket:cloud().storageBucket},origin:cloud().webOrigins[0],factories}));
 assert.throws(()=>initialiseDemoSDKs({profile:cloud(),allowlist:[cloud()],options:{projectId:local().projectId,storageBucket:cloud().storageBucket},origin:cloud().webOrigins[0],factories}));
 assert.equal(initialised,0);
 const good={GCLOUD_PROJECT:cloud().projectId,IILAS_DEMO_MODE:'cloud-demo',IILAS_DEMO_PROJECT_ID:cloud().projectId};
 assert.equal(assertDemoRuntime(good,cloud()).projectId,cloud().projectId);
 for(const key of ['FUNCTIONS_EMULATOR','FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','FIREBASE_DATABASE_EMULATOR_HOST','FIREBASE_EMULATOR_HUB'])assert.throws(()=>assertDemoRuntime({...good,[key]:''},cloud()));
 assert.throws(()=>assertDemoRuntime({...good,GOOGLE_CLOUD_PROJECT:local().projectId},cloud()));
});
test('hostname_cannot_select_cloud',()=>{
 const make=(profile,origin)=>initialiseDemoSDKs({profile,allowlist:[profile],options:{projectId:profile.projectId,storageBucket:profile.storageBucket},origin,factories:{initialise:()=>({}),auth:()=>({}),firestore:()=>({}),functions:()=>({}),storage:()=>({}),connect:()=>{}}});
 assert.throws(()=>make(local(),'https://example.com'));
 assert.throws(()=>make(cloud(),'http://127.0.0.1:5173'));
 assert.throws(()=>make(cloud(),'https://unapproved.example'));
 assert.equal(getDemoEndpoints(cloud()).customerEvidenceUrl,'https://iilas-cloud-fixture.web.app/api/customer-evidence');
 assert.equal(getDemoEndpoints(local()).emulators.functions.port,5001);
});
test('reject_cross_project_recovery_key',()=>{
 assert.notEqual(demoEnvironmentKey(local()),demoEnvironmentKey(cloud()));
 const profile=cloud(),app={options:{projectId:local().projectId,storageBucket:local().storageBucket}};
 assert.throws(()=>initialiseDemoSDKs({profile,allowlist:[profile],options:{projectId:profile.projectId,storageBucket:profile.storageBucket},origin:profile.webOrigins[0],existing:app,factories:{}}));
});
test('all_local_sdks_bound_before_use_and_profile_is_immutable',()=>{
 const calls=[],profile=local(),factories={initialise:()=>({}),auth:()=>({kind:'auth'}),firestore:()=>({kind:'firestore'}),functions:()=>({kind:'functions'}),storage:()=>({kind:'storage'}),connect:(sdk,endpoint)=>calls.push([sdk.kind,endpoint.port])};
 const result=initialiseDemoSDKs({profile,allowlist:[local()],options:{projectId:profile.projectId,storageBucket:profile.storageBucket},origin:'http://127.0.0.1:5173',factories});
 assert.deepEqual(calls,[['auth',9099],['firestore',8081],['functions',5001],['storage',9199]]);
 profile.projectId='changed';assert.equal(result.profile.projectId,local().projectId);assert(Object.isFrozen(result.profile.webOrigins));
});
