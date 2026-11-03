import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {join} from 'node:path';
import {validateHybridDeploymentManifest,createHybridManifest,hybridManifestHash,assertHybridAuthorisation,assertOwnedFixtureResource} from './hybrid-demo-manifest.mjs';
import {planDemoFixture} from './hybrid-demo-fixture.mjs';
import {prepareHybridDemo} from './prepare-hybrid-demo.mjs';
import {verifyHybridStaging,deployHybridDemo} from './hybrid-demo-deploy.mjs';
import {hybridModelMetadataFixture} from './fixtures/hybrid-model-metadata.mjs';
import {LOCAL_DEMO_ENVIRONMENT} from '../lib/demoEnvironment.js';
const environment={...LOCAL_DEMO_ENVIRONMENT,mode:'cloud-demo',projectId:'iilas-cloud-fixture',storageBucket:'iilas-cloud-fixture.firebasestorage.app',webOrigins:['https://iilas-cloud-fixture.web.app','https://iilas-cloud-fixture.firebaseapp.com']};
const chain={rpcUrl:'http://127.0.0.1:8545',chainId:31337,address:'0x'+'1'.repeat(40),deploymentBlock:1,deploymentTransactionHash:'0x'+'2'.repeat(64),runtimeCodeSha256:'3'.repeat(64),deploymentGeneration:'00000000-0000-4000-8000-000000000001'};
const profile=()=>({environment,gateway:{provider:'provided-https',origin:'https://msi-bridge-fixture.example',route:'/v1/operation',localTarget:'http://127.0.0.1:8010'},firestoreLocation:'asia-southeast1',storageLocation:'ASIA-SOUTHEAST1',chainBinding:chain,fixtureOnly:true});
test('original project is forbidden and limits origins and resources are closed',()=>{
 const m=createHybridManifest({profile:profile(),modelBindings:hybridModelMetadataFixture(),fixturePlan:planDemoFixture({runId:randomUUID(),primaryAdminUid:'fixture-admin'}),sourcePins:{'fixture.js':'a'.repeat(64)}});
 assert.equal(validateHybridDeploymentManifest(m).environment.projectId,environment.projectId);
 assert(m.requiredApis.includes('iamcredentials.googleapis.com'));assert(m.requiredApis.includes('secretmanager.googleapis.com'));
 for(const p of [{...m,environment:LOCAL_DEMO_ENVIRONMENT},{...m,extra:true},{...m,limits:{...m.limits,maxInstances:10}},{...m,secretName:'RESEARCH_API_TOKEN'}])assert.throws(()=>validateHybridDeploymentManifest(p));
 assert.throws(()=>assertHybridAuthorisation({manifest:m,approvedSha256:hybridManifestHash(m),phase:'deploy',actualProject:environment.projectId,authorisedActions:['deploy']}),'A fixture can never deploy');
});
test('missing permission and changed manifest invalidate authorisation',()=>{
 const m=createHybridManifest({profile:{...profile(),fixtureOnly:false},modelBindings:hybridModelMetadataFixture(),fixturePlan:planDemoFixture({runId:randomUUID(),primaryAdminUid:'fixture-admin'}),sourcePins:{'fixture.js':'a'.repeat(64)}}),digest=hybridManifestHash(m);
 assert.throws(()=>assertHybridAuthorisation({manifest:m,approvedSha256:digest,phase:'deploy',actualProject:environment.projectId}));
 assert.throws(()=>assertHybridAuthorisation({manifest:m,approvedSha256:digest,phase:'deploy',actualProject:'fyp-inventory-and-logistics',authorisedActions:['deploy']}));
 assert.throws(()=>assertHybridAuthorisation({manifest:{...m,storageLocation:'OTHER'},approvedSha256:digest,phase:'deploy',actualProject:environment.projectId,authorisedActions:['deploy']}));
 const changed={...m,gateway:{...m.gateway,origin:'https://second-bridge.example'}};assert.doesNotThrow(()=>validateHybridDeploymentManifest(changed));assert.throws(()=>assertHybridAuthorisation({manifest:changed,approvedSha256:digest,phase:'deploy',actualProject:environment.projectId,authorisedActions:['deploy','billing']}));
 assert.doesNotThrow(()=>assertHybridAuthorisation({manifest:m,approvedSha256:digest,phase:'deploy',actualProject:environment.projectId,authorisedActions:['deploy','billing']}));
 assert.throws(()=>assertHybridAuthorisation({manifest:m,approvedSha256:digest,phase:'billing',actualProject:environment.projectId,authorisedActions:['deploy']}));
});
test('unknown retained or changed resources cannot be cleaned up',()=>{
 const registry={schema:'iilas-hybrid-owned-fixtures-1.0',projectId:environment.projectId,manifestSha256:'c'.repeat(64),resources:[{kind:'document',path:'products/fixture',sha256:'a'.repeat(64),generation:null,retained:false}]};
 assert.doesNotThrow(()=>assertOwnedFixtureResource({registry,manifestSha256:'c'.repeat(64),actualProject:environment.projectId,path:'products/fixture',sha256:'a'.repeat(64),generation:null}));
 for(const patch of [{path:'products/unknown'},{sha256:'b'.repeat(64)},{generation:'2'},{actualProject:'other-project'}])assert.throws(()=>assertOwnedFixtureResource({registry,manifestSha256:'c'.repeat(64),actualProject:environment.projectId,path:'products/fixture',sha256:'a'.repeat(64),generation:null,...patch}));
 registry.resources[0].retained=true;assert.throws(()=>assertOwnedFixtureResource({registry,manifestSha256:'c'.repeat(64),actualProject:environment.projectId,path:'products/fixture',sha256:'a'.repeat(64),generation:null}));
});
test('incomplete cleanup receipts cannot supply ownership through missing fields',()=>{
 const good={schema:'iilas-hybrid-owned-fixtures-1.0',projectId:environment.projectId,manifestSha256:'b'.repeat(64),resources:[{kind:'document',path:'products/fixture',sha256:'a'.repeat(64),generation:null,retained:false}]},observed={registry:good,actualProject:environment.projectId,manifestSha256:'b'.repeat(64),path:'products/fixture',sha256:'a'.repeat(64),generation:null};
 assert.throws(()=>assertOwnedFixtureResource({registry:{projectId:environment.projectId,resources:[{path:'products/fixture',retained:false}]},actualProject:environment.projectId,path:'products/fixture'}));
 assert.throws(()=>assertOwnedFixtureResource({registry:{resources:[{path:'products/fixture',sha256:'a'.repeat(64),generation:null,retained:false}]},path:'products/fixture',sha256:'a'.repeat(64),generation:null}));
 assert.doesNotThrow(()=>assertOwnedFixtureResource(observed));
 for(const field of ['actualProject','manifestSha256','sha256','generation']){const v={...observed};delete v[field];assert.throws(()=>assertOwnedFixtureResource(v));}
 for(const patch of [{manifestSha256:'c'.repeat(64)},{registry:{...good,unreviewed:true}},{registry:{...good,resources:[{...good.resources[0],generation:'7'}]}}])assert.throws(()=>assertOwnedFixtureResource({...observed,...patch}));
 assert.doesNotThrow(()=>assertOwnedFixtureResource({...observed,registry:{...good,resources:[{kind:'object',path:'evidence/fixture',sha256:'a'.repeat(64),generation:'123',retained:false}]},path:'evidence/fixture',generation:'123'}));
});
test('curated fixture is deterministic anonymous and starts with zero balances',()=>{
 const runId=randomUUID(),f=planDemoFixture({runId,primaryAdminUid:'fixture-admin'});assert.deepEqual(f,planDemoFixture({runId,primaryAdminUid:'fixture-admin'}));
 assert.equal(f.expectedCounts.documents,4);assert.equal(f.documents.filter(x=>x.collection==='products').length,3);assert.equal(f.documents.filter(x=>x.collection==='suppliers').length,1);
 assert(f.documents.filter(x=>x.collection==='products').every(x=>x.data.quantityOnHand===0&&x.data.reservedQuantity===0));assert(!JSON.stringify(f).includes('password'));
});
test('staging is isolated source allowlist only and API rewrite precedes SPA',async()=>{
 const outputRoot='outputs/hybrid-demo-20261027/staging-test-'+randomUUID();const f=planDemoFixture({runId:randomUUID(),primaryAdminUid:'fixture-admin'});
 const p=await prepareHybridDemo({profile:profile(),bindings:hybridModelMetadataFixture(),fixturePlan:f,outputRoot});assert.equal(p.readyForCloud,false);
 const config=JSON.parse(await readFile(p.configPath,'utf8'));assert.equal(config.hosting.rewrites[0].source,'/api/customer-evidence');assert.equal(config.hosting.rewrites.at(-1).destination,'/index.html');
 const files=await readdir(join(outputRoot,'functions'));assert(files.includes('hybrid-runtime.json'));assert(files.includes('package-lock.json'));assert(!files.some(x=>x==='research'||x==='node_modules'||x==='.env.local'||/private|joblib|\.py$/.test(x)));
 const runtime=JSON.parse(await readFile(join(outputRoot,'functions/hybrid-runtime.json'),'utf8'));assert.equal(runtime.profile.projectId,environment.projectId);assert(!JSON.stringify(runtime).includes('apiKey'));assert(!JSON.stringify(runtime).includes('token'));
 assert.equal(validateHybridDeploymentManifest(JSON.parse(await readFile(p.manifestPath,'utf8'))).fixtureOnly,true);
 await verifyHybridStaging(p.manifestPath);
 const dry=await deployHybridDemo({manifestPath:p.manifestPath});assert.equal(dry.dryRun,true);assert.equal(dry.willCreateResources,false);await assert.rejects(()=>deployHybridDemo({manifestPath:p.manifestPath,execute:true}));
 await writeFile(join(outputRoot,'functions/unreviewed-extra.json'),'{}',{flag:'wx'});await assert.rejects(()=>verifyHybridStaging(p.manifestPath));
});
test('a fixture plan cannot smuggle additional records or private configuration',async()=>{
 const f={...planDemoFixture({runId:randomUUID(),primaryAdminUid:'fixture-admin'}),unreviewedRecords:[{note:'software-only invalid fixture'}]};
 await assert.rejects(()=>prepareHybridDemo({profile:profile(),bindings:hybridModelMetadataFixture(),fixturePlan:f,outputRoot:'outputs/hybrid-demo-20261027/invalid-fixture-'+randomUUID()}));
});
