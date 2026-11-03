// Local RF14 timing only: no truth labels, Firebase commands, fitting or TEST.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {inventoryAILaunchEnvironment} from './prepare-inventory-ai-local.mjs';
import {canonicalInventoryAI} from '../lib/inventoryAI.js';
import {contextFeaturesForScenario,contextFeaturePayload,validateContextPrediction} from '../lib/inventoryContextAI.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url)),BASE=join(ROOT,'outputs/inventory-worker-output-scan-20261024/performance');
const SERVING=join(ROOT,'research/datasets/inventory-context-serving-v2'),REQUESTS=join(SERVING,'requests');
const HELPER='research/inventory_context_runtime.py',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,HASH=/^[a-f0-9]{64}$/;
const IDS=['scenarioSha256','inputSha256','modelSha256','datasetSha256','developmentSha256','evaluationSha256'];
const FIXTURE=Object.freeze({quantityOnHand:600,reservedQuantity:20,reorderLevel:500,movementFrequency:18,adjustmentCount:1,daysSinceReplenishment:10,additionalFirmQuantity:50,additionalDueDays:2,incomingQuantity:0,incomingEtaDays:null,supplyStatus:'none'});
const sha=v=>createHash('sha256').update(v).digest('hex'),readJSON=async p=>JSON.parse(await readFile(p,'utf8'));
const save=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
export function performanceMedian(values){assert(Array.isArray(values)&&values.length===5);for(const n of values)assert(typeof n==='number'&&Number.isFinite(n)&&n>=0);return [...values].sort((a,b)=>a-b)[2];}
function validateSummary(value,phase){
 assert(value?.schema==='inventory-context-performance-1.0'&&value.phase===phase&&value.count===5);
 assert(typeof value.run==='string'&&value.run.startsWith('worker-scan-')&&UUID.test(value.run.slice(12)));
 for(const key of [...IDS,'manifestSha256'])assert(HASH.test(value[key]));
 assert(Array.isArray(value.sourceFiles)&&new Set(value.sourceFiles).size===value.sourceFiles.length&&value.sourceFiles.length===(phase==='before'?39:40));
 assert(value.accuracyMeasured===false&&value.operationallyApproved===false);
 assert(Array.isArray(value.samples)&&value.samples.length===5);const ids=new Set();
 for(const [i,s] of value.samples.entries()){
  assert(s.index===i+1&&UUID.test(s.requestId)&&!ids.has(s.requestId));ids.add(s.requestId);
  assert(['Normal','Reorder Risk','Critical Stock Risk'].includes(s.label));
  assert(Array.isArray(s.probabilities)&&s.probabilities.length===3&&s.probabilities.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1));
  assert(Math.abs(s.probabilities.reduce((a,b)=>a+b,0)-1)<=1e-6&&Array.isArray(s.outOfRange));
  for(const k of ['predictionTimeMs','workerTimeMs','nativeTimeMs','serviceTimeMs','httpTimeMs','peakRssBytes','observedAvailableBytes'])assert(typeof s[k]==='number'&&Number.isFinite(s[k])&&s[k]>=0);
  assert(s.predictionTimeMs<=s.workerTimeMs&&s.workerTimeMs<=s.nativeTimeMs&&s.nativeTimeMs<=s.serviceTimeMs&&s.serviceTimeMs<=s.httpTimeMs);
  for(const t of [s.treeBefore,s.treeAfter])assert(Number.isSafeInteger(t?.files)&&t.files>=0&&Number.isSafeInteger(t?.bytes)&&t.bytes>=0);
  assert(s.treeAfter.files>=s.treeBefore.files&&s.treeAfter.bytes>=s.treeBefore.bytes);
 }
 return value;
}
export function compareStockPerformance(before,after){
 validateSummary(before,'before');validateSummary(after,'after');assert(before.run===after.run);
 const reasons=[];for(const k of IDS)if(before[k]!==after[k])reasons.push(k+' differs');
 assert(after.sourceFiles.includes(HELPER)&&!before.sourceFiles.includes(HELPER));
 assert.deepEqual([...before.sourceFiles,HELPER].sort(),[...after.sourceFiles].sort());
 const all=[...before.samples,...after.samples];assert.equal(new Set(all.map(s=>s.requestId)).size,10);
 const first=before.samples[0];let maxProbabilityDelta=0;
 for(const s of all){
  if(s.label!==first.label||JSON.stringify(s.outOfRange)!==JSON.stringify(first.outOfRange))reasons.push('Prediction values differ');
  maxProbabilityDelta=Math.max(maxProbabilityDelta,...s.probabilities.map((v,i)=>Math.abs(v-first.probabilities[i])));
  if(s.nativeStatus!=='success'||s.cleanupConfirmed!==true)reasons.push('Native cleanup/status differs');
 }
 if(maxProbabilityDelta>1e-12)reasons.push('Prediction scores differ');
 const medianBeforeMs=performanceMedian(before.samples.map(s=>s.httpTimeMs)),medianAfterMs=performanceMedian(after.samples.map(s=>s.httpTimeMs));assert(medianBeforeMs>0);
 if(medianAfterMs>medianBeforeMs*.8)reasons.push('Twenty-percent median reduction not met');
 return {passed:reasons.length===0,medianBeforeMs,medianAfterMs,reductionFraction:1-medianAfterMs/medianBeforeMs,maxProbabilityDelta,reasons:[...new Set(reasons)]};
}
export async function collectPerformanceSamples(collect,{identities,baseline=null}={}){
 const samples=[];
 const samePrediction=(s,reference)=>{
  assert.equal(s.label,reference.label,'Prediction label changed; phase stopped');
  assert.deepEqual(s.outOfRange,reference.outOfRange,'Prediction ranges changed; phase stopped');
  assert(Array.isArray(s.probabilities)&&s.probabilities.length===3);
  assert(s.probabilities.every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v-reference.probabilities[i])<=1e-12),'Prediction scores changed; phase stopped');
  assert(s.nativeStatus==='success'&&s.cleanupConfirmed===true,'Native cleanup/status changed; phase stopped');
 };
 if(identities){
  for(const k of IDS){assert(HASH.test(identities[k]));if(baseline)assert.equal(identities[k],baseline[k],k+' differs before requests');}
  if(baseline){validateSummary(baseline,'before');for(const s of baseline.samples)samePrediction(s,baseline.samples[0]);}
 }
 for(let index=1;index<=5;index++){
  const sample=await collect(index);
  if(identities)samePrediction(sample,baseline?.samples[0]??samples[0]??sample);
  samples.push(sample);
 }
 return samples;
}
export function matchRequestDirectory(before,after){assert(before.every(name=>after.includes(name)),'Request evidence removed concurrently');const added=after.filter(name=>!before.includes(name));assert.equal(added.length,1,'Concurrent request evidence changed');return added[0];}
export function parsePerformanceArguments(args){
 const options={};for(let i=0;i<args.length;i+=2){const key=args[i];assert(['--phase','--profile','--run','--baseline'].includes(key)&&!Object.hasOwn(options,key.slice(2))&&args[i+1]);options[key.slice(2)]=args[i+1];}
 assert(['before','after'].includes(options.phase)&&options.profile&&typeof options.run==='string'&&options.run.startsWith('worker-scan-')&&UUID.test(options.run.slice(12)));
 assert(options.phase==='after'?Boolean(options.baseline):!options.baseline);return options;
}
async function treeInfo(directory){
 const pending=[directory];let files=0,bytes=0;while(pending.length){const p=pending.pop(),s=await lstat(p);assert(!s.isSymbolicLink(),'Linked timing evidence refused');if(s.isDirectory()){for(const name of await readdir(p))pending.push(join(p,name));}else if(s.isFile()){files++;bytes+=s.size;}}
 return {files,bytes};
}
async function health(){const r=await fetch('http://127.0.0.1:8001/health',{signal:AbortSignal.timeout(12000)});assert.equal(r.status,200);const b=await r.json();assert.equal(b.status,'artifact_ready');assert.equal(b.operationallyApproved,false);}
export async function runPerformancePhase(input){
 const opts=parsePerformanceArguments(Object.entries(input).flatMap(([k,v])=>['--'+k,v]));
 const env=await inventoryAILaunchEnvironment(opts.profile,'StockResearch');
 assert.equal((await readJSON(opts.profile)).schema,'inventory-local-profile-5.0');
 const manifest=await readJSON(env.IILAS_STOCK_SERVING_MANIFEST),sourceFiles=Object.keys(manifest.sourcePins).sort();
 assert.equal(manifest.protocol,'inventory-context-inference-2.0');assert.equal(sourceFiles.length,opts.phase==='before'?39:40);assert.equal(sourceFiles.includes(HELPER),opts.phase==='after');
 const baselinePath=join(BASE,opts.run,'before','summary.json');if(opts.baseline)assert.equal(resolve(opts.baseline),baselinePath);
 const baseline=opts.baseline?validateSummary(await readJSON(baselinePath),'before'):null;
 const out=join(BASE,opts.run,opts.phase);await mkdir(join(BASE,opts.run),{recursive:true});await mkdir(out,{recursive:false});
 const features=contextFeaturesForScenario(FIXTURE),inputSha256=sha(contextFeaturePayload(features));
 assert.deepEqual(Object.keys(features).filter(k=>features[k]<manifest.ranges[k].min||features[k]>manifest.ranges[k].max),[],'Registered fixture range changed');
 const identities={scenarioSha256:sha(canonicalInventoryAI(FIXTURE)),inputSha256,modelSha256:manifest.model.sha256,...Object.fromEntries(['dataset','development','evaluation'].map(k=>[k+'Sha256',manifest[k].sha256]))};
 await save(join(out,'started.json'),{phase:opts.phase,run:opts.run,fixture:FIXTURE,identities,sourceFiles,accuracyMeasured:false});
 let completed=0;
 try{
  const samples=await collectPerformanceSamples(async index=>{
   await health();const treeBefore=await treeInfo(SERVING),before=await readdir(REQUESTS),request={protocol:manifest.protocol,requestId:randomUUID(),inputSha256,features};
   const began=performance.now(),response=await fetch('http://127.0.0.1:8001/predict/stock-experiment',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+env.IILAS_STOCK_SERVICE_TOKEN},body:JSON.stringify(request),signal:AbortSignal.timeout(22000)}),body=await response.json(),httpTimeMs=performance.now()-began;
   assert.equal(response.status,200,'HTTP failure; phase stopped without retry');
   validateContextPrediction(body,{...identities,servingManifestSha256:env.IILAS_STOCK_SERVING_MANIFEST_SHA256,requestId:request.requestId,features,ranges:manifest.ranges});
   assert.deepEqual(body.outOfRange,[]);
   const name=matchRequestDirectory(before,await readdir(REQUESTS)),directory=join(REQUESTS,name),rel=relative(REQUESTS,directory);assert(rel&&!rel.startsWith('..')&&!isAbsolute(rel));
   const saved=await readJSON(join(directory,'request.json')),native=await readJSON(join(directory,'inference.result.json')),worker=await readJSON(join(directory,'prediction.json'));assert.deepEqual(saved,request);assert.equal(native.status,'success');assert.equal(native.cleanup_confirmed,true);
   for(const k of ['probabilities','label','inputSha256','modelSha256','features','servingManifestSha256','outOfRange'])assert.deepEqual(body[k],worker[k]);
   assert(native.peak_rss_bytes<=2*1024**3);
   const sample={index,requestId:request.requestId,label:body.label,probabilities:body.probabilities,outOfRange:body.outOfRange,predictionTimeMs:body.processingTimeMs,workerTimeMs:worker.totalProcessingTimeMs,nativeTimeMs:native.elapsed_seconds*1000,serviceTimeMs:body.totalProcessingTimeMs,httpTimeMs,peakRssBytes:native.peak_rss_bytes,observedAvailableBytes:native.last_snapshot.available_bytes,treeBefore,treeAfter:await treeInfo(SERVING),nativeStatus:native.status,cleanupConfirmed:native.cleanup_confirmed};
   await save(join(out,`probe-${index}.json`),{request,response:body,native,worker,sample});completed++;console.log(JSON.stringify({phase:opts.phase,probe:index,httpMs:Math.round(httpTimeMs),cleanupConfirmed:true}));return sample;
  },{identities,baseline});
  await health();const summary={schema:'inventory-context-performance-1.0',phase:opts.phase,run:opts.run,count:5,...identities,manifestSha256:env.IILAS_STOCK_SERVING_MANIFEST_SHA256,sourceFiles,samples,accuracyMeasured:false,operationallyApproved:false,scenarioOrigin:'fictional-software-fixture',limitations:['One fixed case; five serial observations, not population percentiles or an SLA','Direct service HTTP excludes Firebase/browser; cache/MSI load uncontrolled','Observed RAM is the last native sample, not the startup admission snapshot']};validateSummary(summary,opts.phase);await save(join(out,'summary.json'),summary);
  const comparison=baseline?compareStockPerformance(baseline,summary):null;if(comparison)await save(join(out,'comparison.json'),comparison);
  console.log(JSON.stringify({phase:opts.phase,completed,summary:join(out,'summary.json'),comparison}));return {summary,comparison};
 }catch(error){await save(join(out,'failure.json'),{failed:true,completed,name:error.name,code:error.code??null,message:'Phase stopped; retained evidence requires investigation. No retry or replacement performed.'});throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runPerformancePhase(parsePerformanceArguments(process.argv.slice(2))).then(({comparison})=>{if(comparison&&!comparison.passed)process.exitCode=1;}).catch(()=>{console.error('Stock timing phase failed; inspect ignored evidence. No private values printed.');process.exitCode=1;});
