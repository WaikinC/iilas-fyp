import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('./spark-cloud-finalize.mjs').catch(()=>({}));
test('final chain checks use the pinned process fence, even if a replacement chain returns matching deployment data',async()=>{
 const {createSparkFinalIntegrityRPC}=await load();assert.equal(typeof createSparkFinalIntegrityRPC,'function');
 const chain={rpcUrl:'http://127.0.0.1:8545',chainId:31337,address:'0x'+'1'.repeat(40),deploymentBlock:1,deploymentTransactionHash:'0x'+'2'.repeat(64),runtimeCodeSha256:'3'.repeat(64),deploymentGeneration:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},processIdentity={pid:123,startTicks:'638000000000000000'};let pid=123;
 const loaded={serving:{chainBinding:chain,chainProcessIdentity:processIdentity}},rpc=await createSparkFinalIntegrityRPC(loaded,{observeProcess:()=>({...processIdentity,pid}),rpc:{inspect:async()=>({chainId:31337,runtimeCodeSha256:chain.runtimeCodeSha256,deploymentTransactionHash:chain.deploymentTransactionHash,blockNumber:2})}});
 assert.equal((await rpc.inspect(chain)).deploymentGeneration,chain.deploymentGeneration);pid=124;await assert.rejects(()=>rpc.inspect(chain));
});
test('completion requires the current proof generation, exact bytes and original manifest identity',async()=>{
 const {validateSparkCurrentProof}=await load();assert.equal(typeof validateSparkCurrentProof,'function');const {sparkHash}=await import('./spark-private-files.mjs');
 const bytes=Buffer.from('original proof'),expected={path:'owned/proof.pdf',generation:'1',bytes:bytes.length,sha256:sparkHash(bytes)},row={ownerId:'scope',path:expected.path,storageGeneration:'1',bytes:bytes.length,sha256:expected.sha256};
 assert.equal(validateSparkCurrentProof({expected,row,bytes,scope:'scope'}),true);
 for(const patch of [{bytes:Buffer.from('modified proof')},{row:{...row,storageGeneration:'2'}},{row:{...row,path:'different/proof.pdf'}},{row:{...row,ownerId:'other'}}])assert.throws(()=>validateSparkCurrentProof({expected,row,bytes,scope:'scope',...patch}));
});
test('cloud completion cannot be certified by software tests alone or by missing/mixed-device evidence',async()=>{
 const {validateSparkAcceptanceEvidence}=await load();assert.equal(typeof validateSparkAcceptanceEvidence,'function');
 const runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',preparationSha256='a'.repeat(64),profile={apiOrigin:'https://octagon-magnetism-presoak.ngrok-free.dev',webOrigins:['https://fyp-inventory-and-logistics.web.app'],backendInstanceId:runId},operationIds=['original-operation'];
 const data={schema:'iilas-cloud-observed-evidence-1.0',runId,preparationSha256,fixtureOnly:false,apiOrigin:profile.apiOrigin,websiteOrigin:profile.webOrigins[0],backendInstanceId:profile.backendInstanceId,gates:[
  {kind:'browser-layouts',method:'observed-browser',passed:true,details:{widths:[1440,390]}},
  {kind:'public-lost-reply',method:'controlled-http-loss',passed:true,details:{originalOperationId:operationIds[0]}},
  {kind:'msi-restart-recovery',method:'observed-runtime',passed:true,details:{unavailableObserved:true,originalOperationId:operationIds[0]}},
  {kind:'model-outage-recovery',method:'observed-runtime',passed:true,details:{models:['stock','delivery'],unavailableObserved:true,originalOperationId:operationIds[0]}},
  {kind:'remote-laptop',method:'human-attested-original-laptop',passed:true,details:{device:'original-laptop'}},
  {kind:'manual-wallet',method:'observed-wallet',passed:true,details:{inventoryCheckId:'inventory-check',deliveryCheckId:'delivery-check'}}
 ].map(g=>({...g,observedAt:'2026-10-29T00:00:00Z',artifacts:[{path:'outputs/spark-msi-demo-20261028/run/evidence.json',sha256:'b'.repeat(64)}]}))};
 const context={runId,preparationSha256,profile,operationIds};assert.equal(validateSparkAcceptanceEvidence(data,context).length,6);
 for(const patch of [{gates:[]},{fixtureOnly:true},{apiOrigin:'http://127.0.0.1:8011'},{preparationSha256:'c'.repeat(64)},{gates:data.gates.filter(g=>g.kind!=='remote-laptop')},{gates:data.gates.map(g=>g.kind==='remote-laptop'?{...g,method:'observed-browser'}:g)},{gates:data.gates.map(g=>({...g,artifacts:[]}))}])assert.throws(()=>validateSparkAcceptanceEvidence({...data,...patch},context));
});
