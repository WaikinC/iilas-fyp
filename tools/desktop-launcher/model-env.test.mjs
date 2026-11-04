import test from 'node:test';import assert from 'node:assert/strict';
import {boundModelEnvironment} from './model-env.mjs';
const input={IILAS_STOCK_API_URL:'http://127.0.0.1:8001',IILAS_STOCK_API_TOKEN:'x'.repeat(43),IILAS_STOCK_MANIFEST_PATH:'C:/fixture/stock.json',IILAS_STOCK_MANIFEST_SHA256:'a'.repeat(64),IILAS_DELIVERY_API_URL:'http://127.0.0.1:8002',IILAS_DELIVERY_API_TOKEN:'y'.repeat(43),IILAS_DELIVERY_MANIFEST_PATH:'C:/fixture/delivery.json',IILAS_DELIVERY_MANIFEST_SHA256:'b'.repeat(64)};
test('current stock capability is mapped with no parcel or emulator settings',()=>{
 const env=boundModelEnvironment(input,'stock',{PATH:'fixture',IILAS_RESEARCH_TOKEN:'OLD',IILAS_STOCK_DEMO_REORDERS:'enabled'});
 assert.equal(env.IILAS_STOCK_SERVICE_TOKEN,input.IILAS_STOCK_API_TOKEN);assert.equal(env.IILAS_STOCK_SERVING_MANIFEST,input.IILAS_STOCK_MANIFEST_PATH);assert.equal(env.IILAS_STOCK_DEMO_REORDERS,'disabled');assert.equal(env.IILAS_RESEARCH_TOKEN,undefined);assert.equal(env.IILAS_DELIVERY_SERVICE_TOKEN,undefined);
});
test('delivery uses only its approved current capability',()=>{
 const env=boundModelEnvironment(input,'delivery',{});assert.equal(env.IILAS_DELIVERY_SERVICE_TOKEN,input.IILAS_DELIVERY_API_TOKEN);assert.equal(env.IILAS_DELIVERY_SERVING_MANIFEST_SHA256,input.IILAS_DELIVERY_MANIFEST_SHA256);assert.equal(env.IILAS_STOCK_SERVICE_TOKEN,undefined);
});
test('ambient emulator and credentials are refused',()=>{
 for(const key of ['FIRESTORE_EMULATOR_HOST','GOOGLE_APPLICATION_CREDENTIALS'])assert.throws(()=>boundModelEnvironment(input,'stock',{[key]:'fixture'}));
});
test('missing token, mismatched endpoint, manifest pin and unknown role refuse',()=>{
 for(const patch of [{IILAS_STOCK_API_TOKEN:''},{IILAS_STOCK_API_URL:'http://0.0.0.0:8001'},{IILAS_STOCK_MANIFEST_SHA256:'bad'}])assert.throws(()=>boundModelEnvironment({...input,...patch},'stock',{}));assert.throws(()=>boundModelEnvironment(input,'parcel',{}));
});