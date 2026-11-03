import test from 'node:test';import assert from 'node:assert/strict';
import {validateHybridMobileBuildTask,validateMobileCloudOptions,mobileCloudFixture} from './hybrid-mobile-build.mjs';
import {createMobileClient} from '../lib/mobilePlatformClient.js';
test('cloud native options and debug variants are closed and distinct',()=>{
 assert.deepEqual(validateMobileCloudOptions(mobileCloudFixture()),mobileCloudFixture());
 assert.deepEqual(validateHybridMobileBuildTask('local','assemble'),['assembleLocalDebug']);
 assert.deepEqual(validateHybridMobileBuildTask('cloud-demo','test'),['testCloudDemoDebugUnitTest']);
 for(const [flavour,task]of [['local','release'],['other','assemble'],['cloud-demo','assemble --scan']])assert.throws(()=>validateHybridMobileBuildTask(flavour,task));
 for(const value of [{},{projectId:'fyp-inventory-and-logistics'},{projectId:'iilas-cloud-fixture',apiKey:'emulator-test-only',appId:'bad'}])assert.throws(()=>validateMobileCloudOptions(value));
});
test('native cloud identity must match the packaged expected environment before Web Auth opens',async()=>{
 let opened=false;const expectedEnvironment={schema:'iilas-mobile-cloud-demo-1.0',projectId:'iilas-cloud-fixture',protocol:'mobile-command-1.0',localOnly:false};
 const bridge={getEnvironment:async()=>({...expectedEnvironment,projectId:'other-project'})};
 const client=createMobileClient({bridge,expectedEnvironment,openWebAuth:async()=>{opened=true;return {uid:()=>null,signInToken:async()=>null,signOut:async()=>{}};}});
 await assert.rejects(()=>client.initialize());assert.equal(opened,false);
 const events=[],valid={getEnvironment:async()=>expectedEnvironment,getSession:async()=>({uid:null,access:null})};
 const good=createMobileClient({bridge:valid,expectedEnvironment,openWebAuth:async()=>{events.push('web');return {uid:()=>null,signInToken:async()=>null,signOut:async()=>{}};}});
 assert.equal((await good.initialize()).mode,'Signed out');assert.deepEqual(events,['web']);
});
