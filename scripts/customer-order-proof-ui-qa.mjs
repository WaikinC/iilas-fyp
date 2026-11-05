// Actual local proof-button QA. RUN ONLY after the parent authorizes its explicit
// fictional shipment grant; uses existing emulators and never contacts live/cloud.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {closeLocalTestContext} from './local-browser-cleanup.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),directory=join(root,'outputs','customer-orders-20261104'),origin='http://127.0.0.1:5173';
async function latest(pattern){const files=await Promise.all((await readdir(directory)).filter(name=>pattern.test(name)).map(async name=>({name,time:(await stat(join(directory,name))).mtimeMs})));files.sort((a,b)=>b.time-a.time);assert(files.length,'Required disposable fictional fixture is missing.');return JSON.parse(await readFile(join(directory,files[0].name),'utf8'));}
const fixture=await latest(/^command-fixture-.*\.private\.json$/),fulfillment=await latest(/^fulfillment-fixture-.*\.private\.json$/);assert(/^customer-order-[a-f0-9]{8}$/.test(fixture.tag));assert.equal(fulfillment.completed,true);assert.equal(fulfillment.scope,fixture.scope);assert.equal(fulfillment.owned.shipments.length,1);assert.equal(fulfillment.owned.evidence.length,1);
const shipmentId=fulfillment.owned.shipments[0],evidenceId=fulfillment.owned.evidence[0].id,output=join(directory,'proof-browser-'+randomUUID());
const {chromium}=createRequire(import.meta.url)(process.env.IILAS_PLAYWRIGHT_MODULE||'C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const contexts=[],errors=[],unexpected=[],commandCalls=[],checks=[];let browser,grantOutcome;
const redact=value=>String(value).replaceAll(fixture.password,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]');
function requestData(request){try{const body=request.postDataJSON();return body?.data??body;}catch{return null;}}
async function login(role){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&(!['127.0.0.1','localhost'].includes(url.hostname)||url.port==='8545')){unexpected.push(url.origin);return route.abort();}return route.continue();});
 context.on('request',request=>{const value=requestData(request);if(value?.action)commandCalls.push({role,action:value.action});});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(redact(error.message)));await page.goto(origin);await page.getByLabel('Email address',{exact:true}).waitFor({timeout:20000});await page.getByLabel('Email address',{exact:true}).fill(fixture.tag+'-'+role+'@example.test');await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('.login-form').waitFor({state:'detached',timeout:20000});
 const who=await page.evaluate(async()=>{const {auth,demoEnvironment,projectId}=await import('/lib/firebaseRuntime.js');return {uid:auth.currentUser?.uid,mode:demoEnvironment.mode,projectId};});assert.deepEqual(who,{uid:fixture.actors[role],mode:'local-emulator',projectId:'fyp-inventory-and-logistics'});return page;
}
async function command(page,action,input){return page.evaluate(async({action,input})=>{const {workspaceCommand}=await import('/lib/workspace.js');return workspaceCommand(action,input);},{action,input});}
async function sourceSnapshots(page){return page.evaluate(async({shipmentId,evidenceId,productId})=>{const source=await fetch('/lib/firebaseRuntime.js').then(response=>response.text()),dependency=source.match(/from\s*["']([^"']*firebase_firestore\.js[^"']*)["']/)?.[1];if(!dependency)throw Error('The current application SDK dependency is unavailable.');const [{db},{doc,getDocFromServer}]=await Promise.all([import('/lib/firebase.js'),import(dependency)]);const records=[['shipments',shipmentId],['deliveries',shipmentId],['warehouseHandovers',shipmentId],['evidence',evidenceId],['products',productId]],result={};for(const [kind,id] of records){const snapshot=await getDocFromServer(doc(db,kind,id));if(!snapshot.exists())throw Error('The owned fictional source is unavailable.');result[kind]=snapshot.data();}return result;},{shipmentId,evidenceId,productId:fulfillment.owned.products[0]});}
try{
 await mkdir(output,{recursive:true});const hub=await fetch('http://127.0.0.1:4400/emulators').then(response=>response.json());for(const name of ['auth','firestore','functions'])assert.equal(hub[name]?.host,'127.0.0.1');browser=await chromium.launch({channel:'msedge',headless:true});
 const logistics=await login('logistics');await logistics.getByRole('navigation',{name:'Primary navigation',exact:true}).waitFor({timeout:20000});
 const sourceBefore=await sourceSnapshots(logistics);
 const context=await command(logistics,'getCustomerAccessContext',{customerUid:fixture.actors.customer,shipmentId});assert.equal(context.shipment.id,shipmentId);assert.equal(context.customer.uid,fixture.actors.customer);assert.equal(context.customer.eligible,true);
 if(!context.grant.active||context.grant.shareLocation){const operation={operationId:randomUUID(),customerUid:fixture.actors.customer,shipmentId,expectedVersion:context.grant.version,shareLocation:false,notes:'Explicit fictional completed-shipment access for Customer proof button QA.'};await writeFile(join(output,'grant-operation.private.json'),JSON.stringify(operation,null,2));grantOutcome=await command(logistics,'grantCustomerShipment',operation);assert.equal(grantOutcome.state,'Completed');}else grantOutcome={reusedExplicitGrant:true,version:context.grant.version};checks.push('explicit fictional current shipment grant with location sharing off');
 const customer=await login('customer');
 const previewResponse=customer.waitForResponse(response=>response.url().includes('/customerEvidence?')&&response.request().method()==='GET');
 await customer.goto(origin+'/customer/shipments/'+shipmentId);
 await customer.getByRole('heading',{name:'Shipment details',exact:true}).waitFor({timeout:20000});
 const binary=await previewResponse;
 assert.equal(binary.status(),200);
 assert.match(binary.headers()['cache-control'],/no-store/);
 assert.equal(binary.headers()['content-type'],'image/png');
 const photo=customer.getByRole('img',{name:'Saved proof of delivery',exact:true});
 await photo.waitFor({timeout:20000});
 assert.equal(await photo.evaluate(img=>img.src.startsWith('blob:')&&img.naturalWidth===2&&img.naturalHeight===2),true);
 checks.push('granted Customer decodes the saved PNG from the actual protected proof endpoint');
 const proof=await command(customer,'getCustomerShipment',{shipmentId});assert.equal(proof.status,'Delivered');assert.equal(proof.location,null);assert.equal(proof.proof.evidenceId,evidenceId);await customer.getByRole('button',{name:'Download current proof',exact:true}).waitFor();
 const responsePromise=customer.waitForResponse(response=>requestData(response.request())?.action==='checkCustomerProofIntegrity');await customer.getByRole('button',{name:'Check proof integrity',exact:true}).click();const response=await responsePromise;assert.equal(response.status(),200);const request=requestData(response.request());assert.deepEqual(request.input,{shipmentId,evidenceId});const raw=await response.json(),result=raw.result??raw.data;assert.deepEqual(Object.keys(result).sort(),['checkedAtMs','evidenceId','outcome','shipmentId']);assert.equal(result.shipmentId,shipmentId);assert.equal(result.evidenceId,evidenceId);assert.equal(result.outcome,'Unavailable');assert(Number.isSafeInteger(result.checkedAtMs));
 const status=customer.locator('.co-proof-result[role="status"]');await status.getByText('Unavailable',{exact:true}).waitFor();await status.getByText('A current check is unavailable. Refresh and try again.',{exact:true}).waitFor();assert(!JSON.stringify(result).includes(fixture.scope));assert(!await customer.locator('body').innerText().then(text=>/0x[a-fA-F0-9]{40,64}|transactionHash|deploymentGeneration|referenceHash|authorisedWallet|sourceVersion/.test(text)));checks.push('actual Functions proof command displays honest Unavailable without chain metadata');
 for(const width of [1440,390,320]){await customer.setViewportSize({width,height:width===1440?1000:900});await customer.evaluate(()=>window.scrollTo(0,0));assert.equal(await customer.locator('input[type="password"]').count(),0);assert.equal(await customer.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);await customer.screenshot({path:join(output,'customer-proof-unavailable-'+width+'.png'),fullPage:true});}checks.push('proof result is readable at desktop and narrow widths');
 const sourceAfter=await sourceSnapshots(logistics);assert(JSON.stringify(sourceAfter)===JSON.stringify(sourceBefore),'The registered fictional proof, shipment, delivery, handover and stock source must remain unchanged.');checks.push('exact proof and fulfillment sources and product stock remain unchanged');
 const gate=Promise.withResolvers();
 const held=customer.waitForRequest(request=>requestData(request)?.action==='getCustomerShipment');
 await customer.route('**/command',async route=>{
  if(requestData(route.request())?.action!=='getCustomerShipment')return route.fallback();
  await gate.promise;
  await route.continue();
 });
 try{
  await customer.getByRole('button',{name:'Refresh shipment details',exact:true}).click();
  await held;
  await customer.getByRole('button',{name:'Close shipment details',exact:true}).click();
  await customer.waitForURL(origin+'/customer');
  await customer.getByRole('heading',{name:'Your shipments',exact:true}).waitFor();
  const retired=customer.waitForResponse(response=>requestData(response.request())?.action==='getCustomerShipment');
  gate.resolve();
  assert.equal((await retired).status(),200);
  assert.equal(await photo.count(),0);
  checks.push('closing during a refresh returns to the list and retires the image');
 }finally{gate.resolve();await customer.unroute('**/command');}
 assert.equal(commandCalls.filter(call=>call.action==='checkCustomerProofIntegrity').length,1);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 await writeFile(join(output,'result.private.json'),JSON.stringify({passed:true,actualApplication:true,actualFunctions:true,checks,shipmentId,evidenceId,grantOutcome,proofOutcome:result.outcome,sourceAndStockUnchanged:true,noCloud:true,noWallet:true,commandCalls},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,output}));
}catch(error){await mkdir(output,{recursive:true});await writeFile(join(output,'result.private.json'),JSON.stringify({passed:false,checks,message:redact(error.message),errors,unexpected},null,2));console.error(JSON.stringify({passed:false,checks:checks.length,message:redact(error.message),output}));process.exitCode=1;}
finally{for(const context of contexts){try{await closeLocalTestContext(context);}catch{await context.close().catch(()=>{});}}if(browser)await browser.close();}
