import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
const api=await import('./inventory-context-performance-qa.mjs').catch(()=>null);
const helper='research/inventory_context_runtime.py';
function pair(){
 const run='worker-scan-'+randomUUID(),sources=Array.from({length:39},(_,i)=>'source-'+i).sort();
 function summary(phase,ms){return {schema:'inventory-context-performance-1.0',phase,run,count:5,scenarioSha256:'1'.repeat(64),inputSha256:'2'.repeat(64),modelSha256:'3'.repeat(64),datasetSha256:'4'.repeat(64),developmentSha256:'5'.repeat(64),evaluationSha256:'6'.repeat(64),manifestSha256:(phase==='before'?'7':'8').repeat(64),sourceFiles:phase==='before'?sources:[...sources,helper].sort(),accuracyMeasured:false,operationallyApproved:false,samples:Array.from({length:5},(_,i)=>({index:i+1,requestId:randomUUID(),label:'Normal',probabilities:[.7,.2,.1],outOfRange:[],predictionTimeMs:10,workerTimeMs:ms*.5,nativeTimeMs:ms*.6,serviceTimeMs:ms*.8,httpTimeMs:ms,peakRssBytes:100,observedAvailableBytes:5*1024**3,treeBefore:{files:10+i*5,bytes:100+i*100},treeAfter:{files:15+i*5,bytes:200+i*100},nativeStatus:'success',cleanupConfirmed:true}))};}
 return [summary('before',1000),summary('after',800)];
}
test('import has no side effects and exposes only a script collector',async()=>{assert(api);const original=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('Import performed network IO');};try{const fresh=await import('./inventory-context-performance-qa.mjs?side-effects='+randomUUID());assert.equal(typeof fresh.collectPerformanceSamples,'function');assert.equal(calls,0);}finally{globalThis.fetch=original;}});
test('five samples median and exact twenty percent boundary',()=>{assert(api);assert.equal(api.performanceMedian([9,1,4,3,2]),3);const [before,after]=pair();assert.equal(api.compareStockPerformance(before,after).passed,true);for(const sample of after.samples)sample.httpTimeMs=801;assert.equal(api.compareStockPerformance(before,after).passed,false);});
test('nonfinite missing or replaced samples fail',()=>{assert(api);for(const values of [[1,2],[1,2,3,4,NaN],[1,2,3,4,-1]])assert.throws(()=>api.performanceMedian(values));let [before,after]=pair();after.samples.pop();assert.throws(()=>api.compareStockPerformance(before,after));[before,after]=pair();after.samples[1].requestId=after.samples[0].requestId;assert.throws(()=>api.compareStockPerformance(before,after));});
test('identity or score change rejects even when faster',()=>{assert(api);for(const change of [a=>a.modelSha256='a'.repeat(64),a=>a.scenarioSha256='a'.repeat(64),a=>a.samples[0].label='Reorder Risk',a=>a.samples[0].probabilities=[.7-1e-10,.2+1e-10,.1],a=>a.samples[0].cleanupConfirmed=false]){const [before,after]=pair();change(after);assert.equal(api.compareStockPerformance(before,after).passed,false);}const [before,after]=pair();after.samples[0].probabilities=[.7-1e-13,.2+1e-13,.1];assert.equal(api.compareStockPerformance(before,after).passed,true);assert(api.compareStockPerformance(before,after).maxProbabilityDelta>0);});
test('HTTP failure or busy stops without retry',async()=>{assert(api);for(const code of [429,503]){let calls=0;await assert.rejects(api.collectPerformanceSamples(async()=>{calls++;throw Object.assign(Error('HTTP failure'),{status:code});}));assert.equal(calls,1);}let calls=0;const rows=await api.collectPerformanceSamples(async index=>{calls++;return index;});assert.equal(calls,5);assert.deepEqual(rows,[1,2,3,4,5]);});
test('wrong endpoint or profile never sends',async()=>{assert(api);assert.throws(()=>api.parsePerformanceArguments(['--phase','before','--profile','x','--run','worker-scan-'+randomUUID(),'--endpoint','https://example.test']));const original=globalThis.fetch;let sends=0;globalThis.fetch=()=>{sends++;throw Error('Network must not be reached');};try{await assert.rejects(api.runPerformancePhase({phase:'before',profile:'outside/private.json',run:'worker-scan-'+randomUUID()}));assert.equal(sends,0);}finally{globalThis.fetch=original;}});
test('concurrent output directory change refuses comparison',()=>{assert(api);assert.equal(api.matchRequestDirectory(['old'],['old','new']),'new');for(const after of [['new'],['old'],['old','a','b']])assert.throws(()=>api.matchRequestDirectory(['old'],after));});

test('orchestration stops at first prediction drift in either phase',async()=>{
 for(const phase of ['before','after'])for(const change of [s=>s.label='Reorder Risk',s=>s.probabilities=[.7-1e-10,.2+1e-10,.1],s=>s.outOfRange=['available_quantity']]){
  const [before,after]=pair(),identities=Object.fromEntries(['scenarioSha256','inputSha256','modelSha256','datasetSha256','developmentSha256','evaluationSha256'].map(k=>[k,before[k]]));let sends=0;
  await assert.rejects(api.collectPerformanceSamples(async i=>{sends++;const s=structuredClone((phase==='before'?before:after).samples[i-1]);if(i===2)change(s);return s;},{identities,baseline:phase==='after'?before:null}));
  assert.equal(sends,2,'A third request must never be sent after drift');
 }
});

test('orchestration rejects changed identities and invalid baseline before any request',async()=>{
 for(const key of ['scenarioSha256','inputSha256','modelSha256','datasetSha256','developmentSha256','evaluationSha256']){
  const [before]=pair(),identities=Object.fromEntries(['scenarioSha256','inputSha256','modelSha256','datasetSha256','developmentSha256','evaluationSha256'].map(k=>[k,before[k]]));identities[key]='a'.repeat(64);let sends=0;
  await assert.rejects(api.collectPerformanceSamples(async()=>{sends++;return before.samples[0];},{identities,baseline:before}));assert.equal(sends,0);
 }
 const [before]=pair(),identities=Object.fromEntries(['scenarioSha256','inputSha256','modelSha256','datasetSha256','developmentSha256','evaluationSha256'].map(k=>[k,before[k]]));before.samples[1].probabilities=[.6,.3,.1];let sends=0;
 await assert.rejects(api.collectPerformanceSamples(async()=>{sends++;return before.samples[0];},{identities,baseline:before}));assert.equal(sends,0);
});
