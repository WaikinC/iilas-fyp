// Read-only actual local app/auth/profile checks with browser-local recovery slots.
// Only exact resolveCustomerOrderOperation responses are mocked. No order writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {closeLocalTestContext} from './local-browser-cleanup.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),directory=join(root,'outputs','customer-orders-20261104'),origin='http://127.0.0.1:5173';
const files=await Promise.all((await readdir(directory)).filter(name=>/^command-fixture-.*\.private\.json$/.test(name)).map(async name=>({name,time:(await stat(join(directory,name))).mtimeMs})));files.sort((a,b)=>b.time-a.time);assert(files.length);
const fixture=JSON.parse(await readFile(join(directory,files[0].name),'utf8'));assert(/^customer-order-[a-f0-9]{8}$/.test(fixture.tag));assert.equal(fixture.actors.customer,fixture.tag+'-customer');assert.equal(typeof fixture.password,'string');
const {chromium}=createRequire(import.meta.url)(process.env.IILAS_PLAYWRIGHT_MODULE||'C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=join(directory,'recovery-browser-'+randomUUID()),failures=[],cases=[],contexts=[],pageErrors=[],unexpected=[],blockedWrites=[];
const redact=value=>String(value).replaceAll(fixture.password,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
let browser,oldOrder;
function requestData(request){try{const body=request.postDataJSON();return body?.data??body;}catch{return null;}}
async function login(){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
 const mocks={operation:null,outcome:null,calls:0,beforeReply:null,active:0,maxActive:0};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(['http:','https:'].includes(url.protocol)&&!['127.0.0.1','localhost'].includes(url.hostname)){unexpected.push(url.origin);return route.abort();}
  const value=requestData(request);
  if(value?.action==='mutateCustomerOrder'){blockedWrites.push({action:value.action,kind:value.input?.kind??null});return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{status:'PERMISSION_DENIED',message:'Order writes are excluded from read-only recovery UI QA.'}})});}
  if(value?.action==='resolveCustomerOrderOperation'){
   assert(mocks.operation&&mocks.outcome,'Unexpected recovery operation must not reach the database.');assert.deepEqual(value.input,{operation:mocks.operation,intent:'Check',expectedActorUid:fixture.actors.customer});mocks.calls++;mocks.active++;mocks.maxActive=Math.max(mocks.maxActive,mocks.active);
   try{if(mocks.beforeReply)await mocks.beforeReply(mocks.calls);return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:mocks.outcome})});}finally{mocks.active--;}
  }
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(redact(error.message)));
 await page.goto(origin+'/customer/orders');await page.getByLabel('Email address',{exact:true}).waitFor({timeout:20000});await page.getByLabel('Email address',{exact:true}).fill(fixture.tag+'-customer@example.test');await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.login-form').waitFor({state:'detached',timeout:20000});
 await page.getByRole('heading',{name:'My orders',exact:true}).waitFor({timeout:20000});
 const identity=await page.evaluate(async()=>{const {auth,demoEnvironment,projectId}=await import('/lib/firebaseRuntime.js');return {uid:auth.currentUser?.uid,mode:demoEnvironment.mode,projectId};});assert.deepEqual(identity,{uid:fixture.actors.customer,mode:'local-emulator',projectId:'fyp-inventory-and-logistics'});
 return {page,context,mocks};
}
async function seed(page,operation){
 return page.evaluate(async operation=>{const {auth,demoEnvironment,projectId}=await import('/lib/firebaseRuntime.js');const environmentKey=JSON.stringify([demoEnvironment.mode,projectId,'backendInstanceId'in demoEnvironment?demoEnvironment.backendInstanceId:null,window.location.origin]),key='iilas.customerOrders.'+JSON.stringify([environmentKey,auth.currentUser.uid])+'.'+operation.kind;localStorage.setItem(key,JSON.stringify(operation));return key;},operation);
}
async function screenshot(page,name){assert.equal(await page.locator('input[type="password"]').count(),0);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(output,name+'.png'),fullPage:true});}
function check(condition,message){if(!condition)failures.push(message);}
async function dirtyGuard(page,recipient,item,label){
 check(new URL(page.url()).pathname==='/customer/orders/new',label+': recovery must retain the new-request route.');
 if(!await page.getByLabel('Recipient name',{exact:true}).count()){failures.push(label+': recovery discarded the visible new-request form.');return;}
 check(await page.getByLabel('Recipient name',{exact:true}).inputValue()===recipient,label+': recipient input must be retained.');check(await page.getByLabel('Requested item 1',{exact:true}).inputValue()===item,label+': requested item input must be retained.');
 let confirmations=0;const listener=async dialog=>{if(dialog.type()==='confirm'){confirmations++;await dialog.dismiss();}else await dialog.dismiss();};page.on('dialog',listener);
 try{await page.getByRole('button',{name:'Back to orders',exact:true}).click();await page.waitForTimeout(100);}finally{page.off('dialog',listener);}
 check(confirmations===1,label+': Back must still ask before discarding the unrelated dirty draft.');check(new URL(page.url()).pathname==='/customer/orders/new',label+': declining discard must retain the form route.');
}
try{
 await mkdir(output,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true});
 const pending=await login(),persisted={kind:'Submit',operationId:randomUUID(),data:{recipient:'Fictional persisted recovery recipient',phone:'0123456789',address:'Fictional persisted recovery destination, Unit 8',requestedDelivery:'2099-12-01',notes:'Fictional saved intent for read-only browser recovery QA',items:[{description:'Persisted original carton request',quantity:4}]}};
 const submitKey=await seed(pending.page,persisted);await pending.page.goto(origin+'/customer/orders/new');await pending.page.getByRole('region',{name:'Saved submit request',exact:true}).waitFor({timeout:15000});
 const recipient=pending.page.getByLabel('Recipient name',{exact:true}),item=pending.page.getByLabel('Requested item 1',{exact:true});await recipient.waitFor();
 check(await recipient.inputValue()===persisted.data.recipient,'A: a saved uncertain Submit must display its exact original recipient after a fresh form mount.');check(await item.inputValue()===persisted.data.items[0].description,'A: a saved uncertain Submit must display its exact original item after a fresh form mount.');
 check(await recipient.isDisabled()||await recipient.getAttribute('readonly')!==null,'A: the persisted recipient must be disabled or read-only during recovery.');check(await item.isDisabled()||await item.getAttribute('readonly')!==null,'A: the persisted item must be disabled or read-only during recovery.');assert.equal(await pending.page.evaluate(key=>localStorage.getItem(key),submitKey),JSON.stringify(persisted));await screenshot(pending.page,'persisted-submit-form');cases.push('saved Submit exact-input hydration and recovery lock');
 oldOrder=await pending.page.evaluate(async()=>{const {workspaceCommand}=await import('/lib/workspace.js');const page=await workspaceCommand('getCustomerOrders',{status:'Submitted'});if(!page.rows.length)throw Error('A retained fictional own Submitted order is required for the read-only Cancel recovery fixture.');return {orderId:page.rows[0].orderId,reference:page.rows[0].reference,version:page.rows[0].version};});
 for(const state of ['NotFound','Completed']){
  const q=await login(),operation={kind:'Cancel',operationId:randomUUID(),orderId:oldOrder.orderId,expectedVersion:oldOrder.version},key=await seed(q.page,operation);q.mocks.operation=operation;q.mocks.outcome={schema:'iilas-customer-order-outcome-1.0',kind:'Cancel',operationId:operation.operationId,state,orderId:state==='Completed'?oldOrder.orderId:null,orderVersion:state==='Completed'?oldOrder.version+1:null,reference:state==='Completed'?oldOrder.reference:null,orderStatus:state==='Completed'?'Cancelled':null,shipmentId:null,shipmentReference:null,replayed:true};
  await q.page.goto(origin+'/customer/orders/new');const recovery=q.page.getByRole('region',{name:'Saved cancel request',exact:true});await recovery.waitFor({timeout:15000});const draftRecipient='Unsent recipient '+state,draftItem='Unsent carton request '+state;await q.page.getByLabel('Recipient name',{exact:true}).fill(draftRecipient);await q.page.getByLabel('Requested item 1',{exact:true}).fill(draftItem);
  await recovery.getByRole('button',{name:'Check saved request',exact:true}).click();await q.page.waitForFunction(({key,state})=>state==='Completed'?localStorage.getItem(key)===null:!Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Check saved request'&&button.disabled),{key,state});await q.page.waitForTimeout(150);assert.equal(q.mocks.calls,1);
  if(state==='NotFound')assert.equal(await q.page.evaluate(key=>localStorage.getItem(key),key),JSON.stringify(operation));
  await dirtyGuard(q.page,draftRecipient,draftItem,'B '+state);await screenshot(q.page,'unrelated-cancel-'+state.toLowerCase());cases.push('old Cancel '+state+' recovery preserves unrelated dirty new draft');
 }
 const locked=await login(),operation={kind:'Cancel',operationId:randomUUID(),orderId:oldOrder.orderId,expectedVersion:oldOrder.version},lockKey=await seed(locked.page,operation);
 locked.mocks.operation=operation;locked.mocks.outcome={schema:'iilas-customer-order-outcome-1.0',kind:'Cancel',operationId:operation.operationId,state:'NotFound',orderId:null,orderVersion:null,reference:null,orderStatus:null,shipmentId:null,shipmentReference:null,replayed:true};
 await locked.page.goto(origin+'/customer/orders');const firstRecovery=locked.page.getByRole('region',{name:'Saved cancel request',exact:true});await firstRecovery.waitFor();
 const second=await locked.context.newPage();second.on('pageerror',error=>pageErrors.push(redact(error.message)));await second.goto(origin+'/customer/orders');const secondRecovery=second.getByRole('region',{name:'Saved cancel request',exact:true});await secondRecovery.waitFor({timeout:15000});
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),observed=new Promise(resolve=>{started=resolve;});locked.mocks.beforeReply=async count=>{if(count===1){started();await gate;}};
 try{
  await firstRecovery.getByRole('button',{name:'Check saved request',exact:true}).click();await observed;
  await secondRecovery.getByRole('button',{name:'Check saved request',exact:true}).click();await secondRecovery.getByRole('alert').filter({hasText:'Another tab is sending this order request'}).waitFor({timeout:10000});
  check(locked.mocks.calls===1,'C: another tab must not issue a second HTTP request while the original slot lock is held.');check(await second.evaluate(key=>localStorage.getItem(key),lockKey)===JSON.stringify(operation),'C: contending recovery must preserve the exact original saved slot.');
  release();await locked.page.getByRole('status').filter({hasText:'No completed result yet. Your current form and saved request are unchanged.'}).waitFor();
  await secondRecovery.getByRole('button',{name:'Check saved request',exact:true}).click();await second.getByRole('status').filter({hasText:'No completed result yet. Your current form and saved request are unchanged.'}).waitFor();check(locked.mocks.calls===2&&locked.mocks.maxActive===1,'C: recovery must become available after release without overlapping resolver requests.');
  check(await second.evaluate(async key=>(await navigator.locks.query()).held.every(lock=>lock.name!==key),lockKey),'C: completed observation must release its browser lock.');cases.push('real browser WebLocks fence two-tab recovery and release after completion');
 }finally{release();}
 assert.deepEqual(blockedWrites,[]);assert.deepEqual(pageErrors,[]);assert.deepEqual(unexpected,[]);
 await writeFile(join(output,'result.private.json'),JSON.stringify({passed:failures.length===0,actualApplication:true,readOnlyBusinessData:true,onlyExactRecoveryResponsesMocked:true,cases,failures,blockedOrderWrites:blockedWrites.length,pageErrors,unexpectedOrigins:unexpected.length},null,2));console.log(JSON.stringify({passed:failures.length===0,cases:cases.length,failures,output}));if(failures.length)process.exitCode=1;
}catch(error){await mkdir(output,{recursive:true});await writeFile(join(output,'result.private.json'),JSON.stringify({passed:false,cases,failures,message:redact(error.message),blockedOrderWrites:blockedWrites.length,pageErrors},null,2));console.error(JSON.stringify({passed:false,cases:cases.length,message:redact(error.message),output}));process.exitCode=1;}
finally{for(const context of contexts){try{await closeLocalTestContext(context);}catch{await context.close().catch(()=>{});}}if(browser)await browser.close();}
