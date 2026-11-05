import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';

const {chromium}=createRequire(import.meta.url)('C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output='outputs/delivery-ai-20261024/ui-fixture';
const app='http://127.0.0.1:5173';
const harness=app+'/scripts/fixtures/delivery-demo-ui/harness.html';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[];
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const externalRequests=[];
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===app)return route.continue();
    externalRequests.push(url.hostname);
    return route.abort();
  });
  await context.addInitScript(()=>{
    const q=window.deliveryUI={
      member:{uid:'driver',role:'Driver',workspaceId:'scope',active:true,status:'Approved',version:1},
      queries:[],calls:[],mode:'ok',records:[],
    };
    const facts={expectedDurationHours:80,elapsedHours:123,failedAttempts:0,hasProof:false,statusEventCount:1,
      parcelCount:2,hoursSinceLastUpdate:3,currentStatus:'In Transit'};
    for(let index=0;index<21;index++){
      const incomplete=index===1;
      q.records.push({
        id:'row'+index,ownerId:'scope',shipmentId:'shipment',actor:'logistics',experimentId:'row'+index,
        status:incomplete?'Unavailable':'Predicted',reason:incomplete?'timeout':null,
        prediction:incomplete?null:{label:'High',probabilities:{Low:.1,Medium:.2,High:.7},outOfRange:['elapsed_hours'],
          modelSha256:'b'.repeat(64),processingTimeMs:2,totalProcessingTimeMs:70},
        observedAtMs:Date.now(),createdAt:{seconds:21-index},reviewVersion:0,reviewStatus:'Pending',requiresReview:incomplete,
        policyVersion:'delivery-triage-policy-1.0',sourceSha256:'a'.repeat(64),source:{reference:'SHP-001',facts},
        aiWarning:incomplete?'timeout':null,assessment:{dataReviewRequired:incomplete,ruleVersion:index===2?'retained-unknown-version':'delivery-abnormality-rules-1.0',
          score:incomplete?null:30,level:incomplete?null:'Medium',complete:!incomplete,unknowns:incomplete?['lastUpdateAtMs']:[],
          matches:[{code:'overdue',points:30,reason:'Expected delivery date exceeded'}]},
      });
    }
    q.command=async(action,input)=>{
      q.calls.push({action,input});
      if(action==='getDeliveryDemoContext')return {
        snapshot:{observedAtMs:Date.now(),currentStatus:'Dispatched'},facts:{...facts,elapsedHours:1},
        unavailableReasons:[],modelConfigured:q.mode!=='off',canAnalyse:q.mode!=='off',
      };
      if(q.mode==='lost'){q.mode='ok';throw Error('Lost successful reply; check outcome.');}
      return {state:'Cancelled',operationId:input.operationId,experimentId:null,replayed:false};
    };
    q.getDocs=async ref=>{
      q.queries.push(ref);
      const after=ref.filters.find(x=>x[0]==='after')?.[1];
      const list=after?q.records.slice(q.records.findIndex(r=>r.id===after.id)+1):q.records;
      const cap=ref.filters.find(x=>x[0]==='limit')?.[1];
      const docs=list.slice(0,cap).map(r=>({id:r.id,data:()=>ref.kind==='deliveryAIExperiments'
        ?{...r,assessment:undefined,aiWarning:undefined}:{...r,prediction:undefined,...(r.id==='row2'?{sourceSha256:'c'.repeat(64)}:{})}}));
      return {docs,size:docs.length};
    };
  });
  await context.route('**/lib/firebase.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const db={};'}));
  await context.route('**/lib/firebaseRuntime.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const sessionRecoveryStorage=sessionStorage;'}));
  await context.route('**/lib/workspace.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const getActiveWorkspace=()=>window.deliveryUI.member;export const workspaceCommand=(a,i)=>window.deliveryUI.command(a,i);'}));
  await context.route('**/firebase_firestore.js*',r=>r.fulfill({contentType:'text/javascript',body:"export const collection=(_,kind)=>({kind});export const where=(...v)=>v;export const orderBy=(...v)=>['order',...v];export const limit=v=>['limit',v];export const startAfter=v=>['after',v];export const query=(ref,...filters)=>({...ref,filters});export const getDocs=ref=>window.deliveryUI.getDocs(ref);"}));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(harness);
  await page.getByText('Delivery AI demonstration and rule assessment',{exact:true}).click();
  const ai=page.getByRole('region',{name:'Saved model results'});
  const rules=page.getByRole('region',{name:'Saved rule assessments'});
  await ai.getByText('High risk',{exact:true}).first().waitFor();
  assert.equal(await ai.locator('article').count(),20);
  await ai.getByText('Model result unavailable',{exact:true}).waitFor();
  await ai.getByText('The model service timed out.',{exact:true}).waitFor();
  const firstModel=ai.locator('article').first();
  await firstModel.getByText('How to read the model scores',{exact:true}).click();
  for(const score of ['10.0%','20.0%','70.0%'])await firstModel.getByText(score,{exact:true}).waitFor();
  await firstModel.getByText('Model choice',{exact:true}).waitFor();
  await firstModel.getByText('Separate rule check for this observation · Medium risk, 30 points.',{exact:true}).waitFor();
  assert.equal(await ai.locator('article').nth(2).getByText(/Separate rule check for this observation/).count(),0);
  await firstModel.getByText('Recorded inputs and technical details',{exact:true}).click();
  await firstModel.getByText('Time since dispatch',{exact:true}).waitFor();
  await firstModel.getByText('123 hours',{exact:true}).waitFor();
  await firstModel.getByText('3 hours',{exact:true}).waitFor({timeout:5000});
  checks.push('model classification, score explanation, human units and unavailable state');

  const firstRule=rules.locator('article').first();
  await firstRule.getByText('30 points',{exact:true}).waitFor();
  await firstRule.getByText('Expected delivery date exceeded',{exact:true}).waitFor();
  await firstRule.getByText('How rule points work',{exact:true}).click();
  for(const range of ['0–19 points','20–49 points','50 or more points']){
    await firstRule.getByText(range,{exact:true}).waitFor();
  }
  await firstRule.getByRole('list',{name:'Delivery checks and point values'}).getByText('Two or more failed attempts · 25 points',{exact:true}).waitFor();
  const partial=rules.locator('article').nth(1);
  await partial.getByText('Rule total unavailable',{exact:true}).waitFor();
  await partial.getByText('Last delivery update',{exact:true}).waitFor();
  await partial.getByText('Expected delivery date exceeded',{exact:true}).waitFor();
  assert.equal(await partial.getByText('Low risk',{exact:true}).count(),0);
  const retained=rules.locator('article').nth(2);
  await retained.getByText('How rule points work',{exact:true}).click();
  assert.equal(await retained.getByRole('list',{name:'Delivery checks and point values'}).count(),0);
  checks.push('rule totals and thresholds, with incomplete observations kept separate');

  await page.screenshot({path:output+'/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:output+'/mobile.png',fullPage:true});
  await firstModel.screenshot({path:output+'/model-result-390.png'});
  await firstRule.screenshot({path:output+'/rule-result-390.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Next page · AI',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Saved model results"] article').length===1);
  await ai.getByRole('button',{name:'First page',exact:true}).click();
  checks.push('20-item history pages and 390px layout');

  await page.getByRole('checkbox').check();
  await page.evaluate(()=>window.deliveryUI.mode='lost');
  await page.getByRole('button',{name:'Analyse delivery demo',exact:true}).click();
  await page.getByRole('button',{name:'Check outcome · AI',exact:true}).waitFor();
  await page.goto(harness+'?reassigned');
  assert.equal(await page.locator('.delivery-card').count(),0);
  await page.getByRole('button',{name:'Check outcome · AI',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Cancelled'}).waitFor();
  assert(await page.evaluate(()=>window.deliveryUI.queries.every(q=>q.filters.some(x=>x[0]==='limit'&&x[1]===20))));
  assert.deepEqual(errors,[]);
  assert.deepEqual(externalRequests,[]);
  checks.push('lost reply and reassignment recovery with only local mocked requests');
  await writeFile(output+'/result.json',JSON.stringify({passed:true,checks},null,2));
  console.log(JSON.stringify({passed:true,checks}));
}finally{
  await browser.close();
}
