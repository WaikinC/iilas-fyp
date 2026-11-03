import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';import {mkdir,writeFile} from 'node:fs/promises';
import {validateGatewayProfile,loadGatewayProfile,GATEWAY_SOURCE_FILES} from '../tools/msi-gateway/launch.mjs';
import {hybridHash} from '../backend/functions/hybridSigning.mjs';import {completionCanonical} from '../lib/completionWorkflow.js';import {hybridModelMetadataFixture} from './fixtures/hybrid-model-metadata.mjs';
function profile(){const bindings=hybridModelMetadataFixture();return {schema:'iilas-msi-gateway-profile-1.0',fixtureOnly:true,projectId:'iilas-cloud-fixture',secret:randomBytes(32).toString('base64url'),stockToken:randomBytes(32).toString('base64url'),deliveryToken:randomBytes(32).toString('base64url'),stockManifest:{path:'research/datasets/inventory-context-serving-v2/fixture.json',sha256:'a'.repeat(64)},deliveryManifest:{path:'research/datasets/delivery-demo-serving-v1/fixture.json',sha256:'b'.repeat(64)},modelBindings:bindings,modelBindingsSha256:hybridHash(completionCanonical(bindings)),chainBinding:null,chainProcessIdentity:null,sourcePins:Object.fromEntries(GATEWAY_SOURCE_FILES.map(name=>[name,'c'.repeat(64)]))};}
test('gateway private profile is closed with explicit project and every source pin',()=>{
 const p=profile();assert.deepEqual(validateGatewayProfile(p),p);
 for(const patch of [{projectId:'fyp-inventory-and-logistics'},{rpcUrl:'http://other.example'},{secret:'not-a-secret'},{sourcePins:{}},{chainProcessIdentity:{pid:1,startTicks:'1'}}])assert.throws(()=>validateGatewayProfile({...p,...patch}));
});
test('outside private paths and changed source pins refuse before service startup',async()=>{
 await assert.rejects(()=>loadGatewayProfile('../private-config/never-read.json'));
 const dir='outputs/hybrid-demo-20261027/gateway-profile-test-'+randomUUID();await mkdir(dir,{recursive:true});await writeFile(dir+'/private.json',JSON.stringify(profile()),{flag:'wx'});await assert.rejects(()=>loadGatewayProfile(dir+'/private.json'));
});
