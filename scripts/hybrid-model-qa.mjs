import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHybridTransport} from '../backend/functions/hybridGateway.mjs';
import {validateCloudModelBinding} from '../backend/functions/hybridModelBinding.mjs';
import {createModelHandlers} from '../tools/msi-gateway/models.mjs';
import {createGatewayAuthenticator} from '../tools/msi-gateway/authentication.mjs';
import {LOCAL_DEMO_ENVIRONMENT} from '../lib/demoEnvironment.js';
import {completionCanonical} from '../lib/completionWorkflow.js';
import {contextFeaturesForScenario,contextFeaturePayload,INVENTORY_CONTEXT_PROTOCOL,INVENTORY_CONTEXT_CLASSES,INVENTORY_CONTEXT_FEATURES,INVENTORY_CONTEXT_PROVENANCE} from '../lib/inventoryContextAI.js';
import {SOURCE_FILES} from '../backend/functions/inventoryContextAI.mjs';
import {DELIVERY_SOURCE_FILES} from '../backend/functions/deliveryDemoAI.mjs';
import {DELIVERY_FEATURES,DELIVERY_PROVENANCE} from '../lib/deliveryRiskDemo.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const profile={environment:{...LOCAL_DEMO_ENVIRONMENT,mode:'cloud-demo',projectId:'iilas-cloud-fixture',storageBucket:'iilas-cloud-fixture.firebasestorage.app',webOrigins:['https://iilas-cloud-fixture.web.app']},gatewayOrigin:'https://msi-bridge-fixture.example'};
const expected={modelSha256:'43b5641f6cd6cb045fd6f9ff06463f2e51c9dc759b84dbfa25b041a3942850d0',servingManifestSha256:'b'.repeat(64),datasetSha256:'06b22b1c46e4d0c6dba6439abe4a00363c36be4424062fa678b5a34efd84d414',developmentSha256:'0eb1350894bd9d4b4f66364d6dd98755cfd0af455b5dcc8cedb2b6c9cfa440cc',evaluationSha256:'846a30cf4a301fd695e6dd9dab17c6575b61cee7050239dbb91d969223aa4a5a',ranges:Object.fromEntries(INVENTORY_CONTEXT_FEATURES.map(k=>[k,{min:-100,max:1000}]))};
test('same_frozen_prediction_through_bridge and response identity binding',async()=>{
 const secret=randomBytes(32).toString('base64url'),bindingSha256='a'.repeat(64),nonce=randomUUID();
 const features=contextFeaturesForScenario({quantityOnHand:120,reservedQuantity:20,reorderLevel:25,movementFrequency:12,adjustmentCount:1,daysSinceReplenishment:.25,additionalFirmQuantity:30,additionalDueDays:2,incomingQuantity:10,incomingEtaDays:1,supplyStatus:'confirmed'});
 const payload={protocol:INVENTORY_CONTEXT_PROTOCOL,requestId:nonce,inputSha256:hash(contextFeaturePayload(features)),features};
 const prediction={protocol:payload.protocol,requestId:nonce,inputSha256:payload.inputSha256,features,classOrder:[...INVENTORY_CONTEXT_CLASSES],label:'Normal',probabilities:[.7,.2,.1],model:'RandomForest',...Object.fromEntries(Object.entries(expected).filter(([k])=>k!=='ranges')),processingTimeMs:1,totalProcessingTimeMs:2,outOfRange:[],...INVENTORY_CONTEXT_PROVENANCE};
 const handlers=createModelHandlers({bindingSha256,stockConfiguration:()=>({url:'http://127.0.0.1:8001',token:'fixture-only',expected}),deliveryConfiguration:()=>null,fetcher:async(url,options)=>{assert.equal(url,'http://127.0.0.1:8001/predict/stock-experiment');assert.deepEqual(JSON.parse(options.body),payload);assert.equal(options.redirect,'error');return new Response(JSON.stringify(prediction));}});
 const a=createGatewayAuthenticator({secret,projectId:profile.environment.projectId});let tamper=false;
 const transport=createHybridTransport({profile,secret,fetcher:async(url,options)=>{
  assert.equal(url,profile.gatewayOrigin+'/v1/operation');assert.equal(options.redirect,'error');const q=JSON.parse(options.body),accepted=a.admit(q,options.headers['x-iilas-signature']);
  const result=await handlers[q.operation](JSON.parse(q.payloadJson),{envelope:q,signal:options.signal});const resultJson=JSON.stringify(result),r={protocol:q.protocol,projectId:q.projectId,requestId:q.requestId,operation:q.operation,bindingSha256:q.bindingSha256,payloadSha256:q.payloadSha256,status:'ok',resultJson,resultSha256:hash(resultJson)};a.complete(accepted.identity,r);
  const signed=a.signReply(r);if(tamper)signed.reply.resultJson='{}';return new Response(JSON.stringify(signed));
 }});
 const input={operation:'stock.predict',actor:'inventory',scope:'scope',requestId:nonce,operationExpiresAtMs:Date.now()+45000,bindingSha256,payload};
 assert.deepEqual(await transport.call(input),prediction);
 const second=randomUUID();tamper=true;await assert.rejects(()=>transport.call({...input,requestId:second,payload:{...payload,requestId:second}}));
 await assert.rejects(()=>handlers['stock.predict'](payload,{envelope:{bindingSha256:'c'.repeat(64)}}));
 assert.throws(()=>createHybridTransport({profile:{...profile,gatewayOrigin:'http://127.0.0.1:8001'},secret}));
});
test('cloud model binding cannot introduce different model, rows or local paths',()=>{
 const delivery={modelSha256:'fddad08e87facde391a3acca68ad3da92579577e9a30bc3396759c01fce3527b',servingManifestSha256:'f'.repeat(64),datasetSha256:'be2bd72da306b1e1d1de73f9cb8beb22e0e952565d4e3a207d085eee2418bbda',developmentSha256:'919c038ef689078471ed8071070f262981657b6f60a406e5c6a391ab090ad6b8',evaluationSha256:'7d0f751bb784a85517757289923430082a0c9bbb5d71e121b825395abe7381cb',ranges:{}};
 const binding={schema:'iilas-cloud-model-binding-1.0',stock:{expected,metrics:{},provenance:INVENTORY_CONTEXT_PROVENANCE},delivery:{expected:delivery,metrics:{},provenance:{}},sourceManifestSha256:'1'.repeat(64)};
 assert.throws(()=>validateCloudModelBinding(binding,hash(completionCanonical(binding))),'Unverified disclosures are rejected');
 for(const change of [{rows:[]},{path:'C:/private'},{modelSha256:'0'.repeat(64)}]){const bad={...binding,stock:{...binding.stock,...change}};assert.throws(()=>validateCloudModelBinding(bad,hash(completionCanonical(bad))));}
 const source=readFileSync(new URL('../backend/functions/hybridModelBinding.mjs',import.meta.url),'utf8');assert(!source.includes('research/datasets/'));
});
test('both serving inventories bind the new trusted environment and bridge seams',()=>{
 for(const files of [SOURCE_FILES,DELIVERY_SOURCE_FILES])for(const name of ['lib/demoEnvironment.js','backend/functions/demoEnvironment.js','backend/functions/demoEnvironment.mjs','lib/hybridGateway.js','backend/functions/hybridGateway.js','backend/functions/hybridGateway.mjs','backend/functions/hybridSigning.mjs','backend/functions/hybridModelBinding.mjs','lib/firebaseRuntime.js','tools/msi-gateway/models.mjs','tools/msi-gateway/authentication.mjs','tools/msi-gateway/server.mjs'])assert(files.includes(name),name+' must be source-bound');
});
test('validated metadata preserves the exact frozen disclosure and forbids inflation',async()=>{
 const stockMetrics={accuracy:0.8152777777777778,accuracyInterval:[0.7853819444444444,0.8486111111111111],criticalPrecision:0.79,criticalRecall:0.8777777777777778,families:60,macroF1:0.8080105925190334,observations:720,origin:'AI-authored synthetic policy'};
 const deliveryMetrics={accuracy:0.9833333333333333,balancedAccuracy:0.9863528481012658,classOrder:['Low','Medium','High'],confusionMatrix:[[63,1,0],[1,77,1],[0,0,37]],macroF1:0.9839777954706298,perClass:{High:{f1:0.9866666666666666,precision:0.9736842105263158,precisionUndefined:false,recall:1,recallUndefined:false,support:37},Low:{f1:0.984375,precision:0.984375,precisionUndefined:false,recall:0.984375,recallUndefined:false,support:64},Medium:{f1:0.980891719745223,precision:0.9871794871794872,precisionUndefined:false,recall:0.9746835443037974,recallUndefined:false,support:79}}};
 const deliveryExpected={modelSha256:'fddad08e87facde391a3acca68ad3da92579577e9a30bc3396759c01fce3527b',servingManifestSha256:'f'.repeat(64),datasetSha256:'be2bd72da306b1e1d1de73f9cb8beb22e0e952565d4e3a207d085eee2418bbda',developmentSha256:'919c038ef689078471ed8071070f262981657b6f60a406e5c6a391ab090ad6b8',evaluationSha256:'7d0f751bb784a85517757289923430082a0c9bbb5d71e121b825395abe7381cb',ranges:Object.fromEntries(DELIVERY_FEATURES.map(k=>[k,{min:0,max:1000}]))};
 const b={schema:'iilas-cloud-model-binding-1.0',stock:{expected,metrics:stockMetrics,provenance:INVENTORY_CONTEXT_PROVENANCE},delivery:{expected:deliveryExpected,metrics:deliveryMetrics,provenance:DELIVERY_PROVENANCE},sourceManifestSha256:'1'.repeat(64)};
 assert.deepEqual(validateCloudModelBinding(b,hash(completionCanonical(b))),b);
 const {exportCloudModelBinding}=await import('../backend/functions/hybridModelBinding.mjs');
 assert.equal(typeof exportCloudModelBinding,'function');
 const exported=exportCloudModelBinding({stock:()=>b.stock,delivery:()=>b.delivery});
 assert.deepEqual(exported.binding.stock,b.stock);assert.deepEqual(validateCloudModelBinding(exported.binding,exported.sha256),exported.binding);assert(!JSON.stringify(exported).includes('fixture-only'));
 b.stock.metrics.criticalPrecision=1;assert.throws(()=>validateCloudModelBinding(b,hash(completionCanonical(b))));
});
test('authority product edits timeout and saved outcome regressions remain green',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--test','scripts/inventory-context-command-qa.mjs','scripts/inventory-demo-command-qa.mjs','scripts/delivery-demo-command-qa.mjs'],{env,encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/# fail 0/);
});
test('legacy predict and parcel routes have no cloud bypass',async()=>{
 const {assertHybridActionAllowed}=await import('../backend/functions/hybridGateway.mjs');
 for(const action of ['predict','startInventoryExperiment','startParcelAnalysis','startParcelLiveSession','analyseParcelLiveFrame','reserveParcelLiveFrame'])assert.throws(()=>assertHybridActionAllowed(action,'cloud-demo'));
 assert.doesNotThrow(()=>assertHybridActionAllowed('startInventoryDemoProductExperiment','cloud-demo'));
 assert.doesNotThrow(()=>assertHybridActionAllowed('startParcelAnalysis','local-emulator'));
});
