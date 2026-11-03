import test from 'node:test';import assert from 'node:assert/strict';
import {validateHybridLocalAcceptance,makeHybridLocalReceipt} from './hybrid-local-acceptance-qa.mjs';
import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {dirname,join} from 'node:path';import {pathToFileURL} from 'node:url';import {randomUUID,createHash} from 'node:crypto';
test('relocated preservation runner retains its verified output-only preload',async()=>{
 const {prepareHybridPreservationHarness}=await import('./hybrid-local-acceptance-qa.mjs');assert.equal(typeof prepareHybridPreservationHarness,'function');
 const prepared=await prepareHybridPreservationHarness();assert.match(await readFile(prepared.runner,'utf8'),/new URL\('output-redirect.mjs',import.meta.url\)/);
 assert.equal(createHash('sha256').update(await readFile(prepared.preload)).digest('hex'),'24482bcfb2882c54d943a5349aa1da13943cd337392061e04ad75cb762c523c8');
 const env={...process.env,IILAS_TASK3_REPORT_DIR:join(dirname(prepared.runner),'harness-runs','preload-'+randomUUID())};delete env.NODE_OPTIONS;delete env.NODE_TEST_CONTEXT;
 const child=spawnSync(process.execPath,['--import',pathToFileURL(prepared.preload).href,'--input-type=module','-e','console.log("preload-ready")'],{env,encoding:'utf8',windowsHide:true});assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/preload-ready/);
});
test('local acceptance cannot select cloud LAN or outside private input paths',()=>{
 const good={profile:'outputs/android-mobile-20261026/profile-fixture/private.json',outputRoot:'outputs/hybrid-demo-20261027/acceptance-fixture',ownedStack:{projectId:'fyp-inventory-and-logistics',webOrigin:'http://127.0.0.1:5173',completionProfileReceipt:'outputs/hybrid-demo-20261027/completion-profile.json'}};
 assert.doesNotThrow(()=>validateHybridLocalAcceptance(good));
 for(const patch of [{profile:'../private-config/secret.json'},{outputRoot:'outputs/android-mobile-20261026/other'},{ownedStack:{...good.ownedStack,projectId:'iilas-cloud-fixture'}},{ownedStack:{...good.ownedStack,webOrigin:'http://192.168.1.2:5173'}}])assert.throws(()=>validateHybridLocalAcceptance({...good,...patch}));
});
test('local evidence can never certify cloud connectivity device tests or parcel testing',()=>{
 const r=makeHybridLocalReceipt({checks:[{name:'software',passed:true}],preservation:{exact:true},bindings:{},artifactPins:{},cloudConnectivity:true,phoneAcceptance:true,parcelTesting:true});
 assert.equal(r.passed,true);assert.equal(r.cloudConnectivity,false);assert.equal(r.phoneAcceptance,false);assert.equal(r.parcelTesting,false);assert.equal(r.scientificEvaluationReplayed,false);
 assert.equal(makeHybridLocalReceipt({checks:[{name:'failed',passed:false}],preservation:{exact:true},bindings:{},artifactPins:{}}).passed,false);
});
