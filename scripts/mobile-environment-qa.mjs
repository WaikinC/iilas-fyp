import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateAndroidBuildTask,validateDeviceMappingPlan} from './mobile-build.mjs';
test('build runner accepts only bounded debug tasks and validated unit filters',()=>{
 assert.deepEqual(validateAndroidBuildTask('testDebugUnitTest','*MobileIdentityTest*'),['testDebugUnitTest','--tests','*MobileIdentityTest*']);
 for(const task of ['assembleRelease','clean','help','assembleDebug --scan','test;bad'])assert.throws(()=>validateAndroidBuildTask(task));
 for(const filter of ['a b','--scan','../x','x\nrelease'])assert.throws(()=>validateAndroidBuildTask('testDebugUnitTest',filter));
 assert.throws(()=>validateAndroidBuildTask('assembleDebug','*Test*'));
});
test('USB mappings require explicit authorised serial and never overwrite other ports',()=>{
 const devices=[{serial:'abc123',state:'device'}];assert.equal(validateDeviceMappingPlan('abc123',devices,[]).length,4);
 assert.throws(()=>validateDeviceMappingPlan(undefined,devices,[]));assert.throws(()=>validateDeviceMappingPlan('abc123',[{serial:'abc123',state:'unauthorized'}],[]));
 assert.throws(()=>validateDeviceMappingPlan('abc123',devices,[{local:'tcp:5001',remote:'tcp:9999'}]));
 assert.equal(validateDeviceMappingPlan('abc123',devices,[{local:'tcp:5001',remote:'tcp:5001'}]).some(m=>m.local==='tcp:5001'),false);
});
