// Actual application + existing loopback emulator browser QA. No services are started.
// Uses only disposable command-fixture identities; credentials stay in memory.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {closeLocalTestContext} from './local-browser-cleanup.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fixtureDirectory=join(root,'outputs','customer-orders-20261104');
const origin='http://127.0.0.1:5173',project='fyp-inventory-and-logistics';
const files=await Promise.all((await readdir(fixtureDirectory)).filter(x=>/^command-fixture-.*\.private\.json$/.test(x)).map(async name=>({name,time:(await stat(join(fixtureDirectory,name))).mtimeMs})));
files.sort((a,b)=>b.time-a.time);assert(files.length,'Create the disposable command fixture before this browser suite.');
const fixture=JSON.parse(await readFile(join(fixtureDirectory,files[0].name),'utf8'));
assert(/^customer-order-[a-f0-9]{8}$/.test(fixture.tag));
assert.equal(typeof fixture.password,'string');assert(fixture.password.length>=8);
for(const role of ['customer','other','logistics'])assert.equal(fixture.actors[role],fixture.tag+'-'+role);
assert.equal(typeof fixture.productId,'string');
const output=join(fixtureDirectory,'browser-'+randomUUID());
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.IILAS_PLAYWRIGHT_MODULE||'C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const checks=[],contexts=[],observations=[],pageErrors=[],unexpectedOrigins=[],regressionFailures=[];
const regressionsOnly=process.argv.includes('--regressions-only');
const runTag='browser-order-'+randomUUID().slice(0,8),recipient='Fictional receiver '+runTag;
const requestData={recipient,phone:'0123456789',address:'Fictional QA destination, Unit 12 '+runTag,requestedDelivery:'2099-12-01',notes:'Fictional browser order '+runTag,description:'Fictional cartons '+runTag,quantity:'3'};
const redact=value=>String(value).replaceAll(fixture.password,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/(?:idToken|refreshToken|accessToken)["\s:=]+[^,\s"}]+/gi,'[redacted token]');
let browser,currentCheck='preflight',createdOrder,acceptedShipment;
function commandRequest(request){
 try{const body=request.postDataJSON(),data=body?.data??body;return data&&typeof data.action==='string'?data:null;}catch{return null;}
}
async function check(name,work){currentCheck=name;await work();checks.push(name);}
async function named(page,name){
 for(let attempt=0;attempt<100;attempt++){
  for(const role of ['tab','button','link']){const matches=page.getByRole(role,{name,exact:true});for(let i=0;i<await matches.count();i++)if(await matches.nth(i).isVisible())return matches.nth(i);}
  await page.waitForTimeout(100);
 }
 throw Error('Visible labelled control unavailable: '+name);
}
async function click(page,name){await (await named(page,name)).click();}
async function commandResult(page,kind,work){
 const pending=page.waitForResponse(response=>{const q=commandRequest(response.request());return q?.action==='mutateCustomerOrder'&&q.input?.kind===kind;},{timeout:30000});
 const [response]=await Promise.all([pending,work()]),body=await response.json();assert.equal(response.status(),200,'The actual order command must succeed. '+String(body.error?.status??'')+': '+String(body.error?.message??''));
 const result=body.result??body.data;assert(result&&!body.error,'Actual order mutation returned an error.');return result;
}
async function readCommand(page,action,input={}){
 return page.evaluate(async({action,input})=>{const {workspaceCommand}=await import('/lib/workspace.js');return workspaceCommand(action,input);},{action,input});
}
async function serverFacts(page,shipmentId=null){
 return page.evaluate(async({productId,shipmentId})=>{
  // Vite's exact versioned SDK URL is required: an unversioned second SDK copy
  // cannot accept the Firestore instance created by the running application.
  const source=await fetch('/lib/firebaseRuntime.js').then(response=>response.text());
  const dependency=source.match(/from\s*["']([^"']*firebase_firestore\.js[^"']*)["']/)?.[1];
  if(!dependency)throw Error('The running application Firestore dependency is unavailable.');
  const [{db},{doc,getDocFromServer}]=await Promise.all([import('/lib/firebase.js'),import(dependency)]);
  const productSnapshot=await getDocFromServer(doc(db,'products',productId));if(!productSnapshot.exists())throw Error('Fictional product unavailable.');
  const p=productSnapshot.data(),stock={quantityOnHand:p.quantityOnHand,reservedQuantity:p.reservedQuantity,warehouseReservedQuantity:p.warehouseReservedQuantity??0};
  if(!shipmentId)return {stock};
  const shipmentSnapshot=await getDocFromServer(doc(db,'shipments',shipmentId));if(!shipmentSnapshot.exists())throw Error('Linked fictional shipment unavailable.');const s=shipmentSnapshot.data();
  return {stock,status:s.status,orderId:s.customerOrderId,items:s.items.map(({productId,quantity})=>({productId,quantity}))};
 },{productId:fixture.productId,shipmentId});
}
async function newContext(role){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),observation={role,commands:[],forbiddenSubscriptions:[],profileSubscriptionObserved:false,listenRequests:0,sensorCalls:0};contexts.push(context);observations.push(observation);
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(['http:','https:'].includes(url.protocol)&&!['127.0.0.1','localhost'].includes(url.hostname)){
   if(/(?:^|\.)tile.openstreetmap.org$/.test(url.hostname))return route.fulfill({status:204,body:''});
   unexpectedOrigins.push(url.origin);return route.abort();
  }return route.continue();
 });
 context.on('request',request=>{
  const q=commandRequest(request);if(q)observation.commands.push({action:q.action,kind:q.input?.kind??null});
  if(!['customer','other'].includes(role)||!request.url().includes('Listen/channel'))return;
  observation.listenRequests++;
  let text=request.postData()??'';for(let i=0;i<2;i++){try{text=decodeURIComponent(text.replace(/\+/g,' '));}catch{break;}}
  if(text.includes('/documents/users/'+fixture.actors[role]))observation.profileSubscriptionObserved=true;
  const unescaped=text.replaceAll('\\"','"');
  for(const kind of ['products','stockMovements','shipments','warehouseHandovers','purchaseOrders','suppliers','auditLogs','predictions','integrityChecks','verificationRecords']){
   if(new RegExp('"collectionId"\\s*:\\s*"'+kind+'"').test(unescaped)||new RegExp('/documents/'+kind+'(?:/|"|\\\\)').test(text))observation.forbiddenSubscriptions.push(kind);
  }
 });
 await context.addInitScript(()=>{
  window.__customerOrderQASensorCalls=0;
  navigator.geolocation.getCurrentPosition=()=>{window.__customerOrderQASensorCalls++;throw Error('GPS capture is excluded from this browser suite.');};
  if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__customerOrderQASensorCalls++;throw Error('Camera capture is excluded from this browser suite.');};
 });
 const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(redact(error.message)));
 await page.goto(origin);await page.getByLabel('Email address',{exact:true}).waitFor({timeout:20000});
 // The normal login form is exercised, but is never included in screenshots or traces.
 await page.getByLabel('Email address',{exact:true}).fill(fixture.tag+'-'+role+'@example.test');
 await page.getByLabel('Password',{exact:true}).fill(fixture.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.locator('.login-form').waitFor({state:'detached',timeout:20000});
 const identity=await page.evaluate(async()=>{const {auth,demoEnvironment,projectId}=await import('/lib/firebase.js');return {uid:auth?.currentUser?.uid,projectId,mode:demoEnvironment.mode};});
 assert.equal(identity.uid,fixture.actors[role]);assert.equal(identity.projectId,project);assert.equal(identity.mode,'local-emulator');
 return {page,context,observation};
}
async function staffNavigate(page,label){
 const menu=page.getByRole('button',{name:'Open menu',exact:true});if(await menu.isVisible())await menu.click();await click(page,label);
}
async function findRequest(page,reference){
 const button=page.getByRole('button',{name:'View request '+reference,exact:true});
 for(let i=0;i<100;i++){
  if(await button.isVisible())return button;
  const next=page.getByRole('button',{name:/Next (?:customer )?(?:order|request)s? page/i});
  if(!await next.count()||!await next.first().isEnabled()){await page.waitForTimeout(100);continue;}
  const response=page.waitForResponse(r=>commandRequest(r.request())?.action==='getCustomerOrdersForStaff');await next.first().click();await response;await page.waitForTimeout(100);
 }throw Error('The fictional request was not reachable through the staff request pages.');
}
async function statusContrast(page,status){
 const label=status==='Submitted'?'Awaiting review':status,candidates=page.getByText(label,{exact:true}),ratios=[];
 for(let i=0;i<await candidates.count();i++){
  const element=candidates.nth(i);if(!await element.isVisible())continue;
  const sample=await element.evaluate(node=>{
   const rect=node.getBoundingClientRect();if(rect.width<1||rect.height<1||['OPTION','TITLE'].includes(node.tagName))return null;
   const parse=text=>{const m=text.match(/[\d.]+/g);return m?m.map(Number):[0,0,0,0];};
   const blend=(front,back)=>{const a=front[3]??1;return front.slice(0,3).map((c,i)=>c*a+back[i]*(1-a));};
   const ancestors=[];let cursor=node;while(cursor){ancestors.push(cursor);cursor=cursor.parentElement;}
   let background=[255,255,255];for(const ancestor of ancestors.reverse())background=blend(parse(getComputedStyle(ancestor).backgroundColor),background);
   const style=getComputedStyle(node),foreground=blend(parse(style.color),background);
   const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
   const a=luminance(foreground),b=luminance(background);return {contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),text:node.textContent.trim()};
  });
  if(sample){assert(sample.contrast>=4.5,`${status} text contrast must reach 4.5:1; observed ${sample.contrast.toFixed(2)}.`);ratios.push(Number(sample.contrast.toFixed(2)));}
 }assert(ratios.length,'Visible text status unavailable: '+status);return ratios;
}
const contrastSamples=[];
async function fit(page,name,status){
 assert.equal(await page.locator('input[type="password"]').count(),0,'Never capture an authentication form.');
 if(status){const label=status==='Submitted'?'Awaiting review':status;await page.locator('.co-badge,.shipment-badge').filter({hasText:new RegExp('^'+label+'$')}).first().waitFor({timeout:15000});}
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:width===1440?1000:900});
  await page.evaluate(()=>window.scrollTo(0,0));
  const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));assert.equal(overflow,0,`${name} must have no document overflow at ${width}px.`);
  if(status)contrastSamples.push({screen:name,width,status,ratios:await statusContrast(page,status)});
  await page.screenshot({path:join(output,name+'-'+width+'.png'),fullPage:true});
 }await page.setViewportSize({width:1440,height:1000});
}
async function fillRequest(page,data=requestData){
 await page.getByLabel('Recipient name',{exact:true}).fill(data.recipient);await page.getByLabel('Phone number',{exact:true}).fill(data.phone);
 await page.getByLabel('Delivery address',{exact:true}).fill(data.address);await page.getByLabel('Requested delivery date',{exact:true}).fill(data.requestedDelivery);
 await page.getByLabel('Message to IILAS',{exact:true}).fill(data.notes);await page.getByLabel('Requested item 1',{exact:true}).fill(data.description);await page.getByLabel('Quantity 1',{exact:true}).fill(data.quantity);
}
async function submitNew(page,extra=''){
 await page.goto(origin+'/customer/orders');await click(page,'New order request');await fillRequest(page,{...requestData,recipient:recipient+extra,notes:requestData.notes+extra});
 const result=await commandResult(page,'Submit',()=>click(page,'Submit order request'));assert.equal(result.orderStatus,'Submitted');return result;
}

try{await (async()=>{
 const hub=await fetch('http://127.0.0.1:4400/emulators').then(r=>r.json());for(const name of ['auth','firestore','functions'])assert.equal(hub[name]?.host,'127.0.0.1','Use only the existing explicit loopback emulator stack.');
 await mkdir(output,{recursive:true});browser=await chromium.launch({channel:'msedge',headless:true});
 const customer=await newContext('customer');
 await check('Customer Orders and the Delivery monitor remain isolated from the staff application',async()=>{
  await (await named(customer.page,'Orders')).waitFor();await (await named(customer.page,'Delivery monitor')).waitFor();
  assert.equal(await customer.page.getByRole('navigation',{name:'Primary navigation',exact:true}).count(),0);
  assert.equal(await customer.page.getByText('Product Management',{exact:true}).count(),0);await click(customer.page,'Orders');
  await customer.page.waitForURL(origin+'/customer/orders');await customer.page.waitForFunction(()=>{const root=document.querySelector('.co-workspace');return root&&!root.textContent.includes('Loading your orders')&&Boolean(root.querySelector('.co-order-list,.co-empty'));});await fit(customer.page,'customer-orders');
 });
 await check('Keyboard-accessible request fields reject missing and invalid input without writes',async()=>{
  await click(customer.page,'New order request');await customer.page.waitForURL(origin+'/customer/orders/new');
  const before=customer.observation.commands.filter(x=>x.action==='mutateCustomerOrder').length;await click(customer.page,'Submit order request');
  await fillRequest(customer.page,{...requestData,phone:'bad',quantity:'0'});await customer.page.getByLabel('Recipient name',{exact:true}).focus();await customer.page.keyboard.press('Tab');
  assert(await customer.page.getByLabel('Phone number',{exact:true}).evaluate(el=>el===document.activeElement),'Tab moves from recipient to phone.');
  await click(customer.page,'Submit order request');await customer.page.waitForTimeout(150);
  assert.equal(customer.observation.commands.filter(x=>x.action==='mutateCustomerOrder').length,before);assert(await customer.page.getByRole('alert').count()||await customer.page.locator(':invalid').count(),'Validation must be visible or associated with native invalid fields.');
  await fillRequest(customer.page);
  const quantity=customer.page.getByLabel('Quantity 1',{exact:true}),quantityError=quantity.locator('..').locator('.co-field-error');
  if(await quantity.getAttribute('aria-invalid')==='true'||await quantityError.count()&&await quantityError.first().isVisible())regressionFailures.push('Correcting quantity 0 to 3 must immediately clear its aria-invalid state and inline quantity error.');
  if(!regressionsOnly)assert.deepEqual(regressionFailures,[]);
  await fit(customer.page,'customer-new-request');
 });
 await check('Customer submission creates one bookmarked own request',async()=>{
  createdOrder=await commandResult(customer.page,'Submit',()=>click(customer.page,'Submit order request'));assert.equal(createdOrder.orderStatus,'Submitted');assert.match(createdOrder.reference,/^ORD-[A-F0-9]{12}$/);
  await customer.page.waitForURL(origin+'/customer/orders/'+createdOrder.orderId);await customer.page.getByText(recipient,{exact:true}).waitFor();await fit(customer.page,'customer-submitted','Submitted');
  await customer.page.reload();await customer.page.getByText(recipient,{exact:true}).waitFor();await click(customer.page,'Back to orders');
  await click(customer.page,'View order '+createdOrder.reference);await customer.page.waitForURL(origin+'/customer/orders/'+createdOrder.orderId);
 });
 const staff=await newContext('logistics');
 await check('Order & Dispatch keeps Shipments and adds the Customer orders queue',async()=>{
  await staffNavigate(staff.page,'Order & Dispatch');await (await named(staff.page,'Shipments')).waitFor();await click(staff.page,'Customer orders');
  await (await findRequest(staff.page,createdOrder.reference)).click();await staff.page.getByText(recipient,{exact:true}).waitFor();
  await fit(staff.page,'staff-request-review','Submitted');
  await staff.page.setViewportSize({width:320,height:900});
  const acceptance=await named(staff.page,'Accept, create shipment & share tracking'),rejection=await named(staff.page,'Reject request');
  const primary=await acceptance.boundingBox(),secondary=await rejection.boundingBox(),parentWidth=await acceptance.locator('..').evaluate(node=>node.getBoundingClientRect().width);
  if(!primary||!secondary||primary.width<parentWidth-2||primary.height>120||secondary.y<primary.y+primary.height-1)regressionFailures.push('At 320px the staff acceptance and rejection actions must stack at full width, with acceptance no taller than 120px.');
  await staff.page.setViewportSize({width:1440,height:1000});
  if(!regressionsOnly)assert.deepEqual(regressionFailures,[]);
 });
 if(regressionsOnly){await writeFile(join(output,'result.private.json'),JSON.stringify({passed:regressionFailures.length===0,actualApplication:true,regressionsOnly:true,checks:checks.length,cases:checks,regressionFailures,contrastSamples},null,2));console.log(JSON.stringify({passed:regressionFailures.length===0,regressionsOnly:true,regressionFailures,output}));if(regressionFailures.length)process.exitCode=1;return;}
 await check('Explicit acceptance maps inventory and opens one normal linked Draft without reserving stock',async()=>{
  const {stock:before}=await serverFacts(staff.page);
  await staff.page.getByLabel('Inventory product for item 1',{exact:true}).selectOption(fixture.productId);await staff.page.getByLabel('Expected delivery date',{exact:true}).fill(requestData.requestedDelivery);
  await staff.page.getByLabel('Message to customer',{exact:true}).fill('Accepted fictional browser request '+runTag);
  acceptedShipment=await commandResult(staff.page,'Decide',()=>click(staff.page,'Accept, create shipment & share tracking'));assert.equal(acceptedShipment.orderStatus,'Accepted');assert(acceptedShipment.shipmentId);assert.match(acceptedShipment.shipmentReference,/^SHP-\d{6}$/);
  await (await named(staff.page,'Open linked shipment')).waitFor();await fit(staff.page,'staff-accepted-request','Accepted');await click(staff.page,'Open linked shipment');
  await staff.page.waitForURL(origin+'/logistics/shipments/'+acceptedShipment.shipmentId);await staff.page.getByRole('heading',{name:acceptedShipment.shipmentReference,exact:true}).waitFor();await staff.page.locator('.shipment-badge').filter({hasText:/^Draft$/}).waitFor();
  const facts=await serverFacts(staff.page,acceptedShipment.shipmentId);
  assert.equal(facts.status,'Draft');assert.equal(facts.orderId,createdOrder.orderId);assert.deepEqual(facts.items,[{productId:fixture.productId,quantity:3}]);assert.deepEqual(facts.stock,before);await fit(staff.page,'linked-staff-draft','Draft');
 });
 await check('Customer sees Accepted and only the safe linked shipment tracking',async()=>{
  await customer.page.reload();await customer.page.getByText('Accepted',{exact:true}).waitFor();await (await named(customer.page,'View shipment')).waitFor();
  assert.equal(await customer.page.getByRole('button',{name:'Cancel request',exact:true}).count(),0);await fit(customer.page,'customer-accepted','Accepted');
  await click(customer.page,'View shipment');await customer.page.waitForURL(origin+'/customer/shipments/'+acceptedShipment.shipmentId);await customer.page.getByRole('heading',{name:'Shipment details',exact:true}).waitFor();
  await customer.page.getByText(acceptedShipment.shipmentReference,{exact:false}).first().waitFor();assert.equal(await customer.page.getByText('Latest submitted location',{exact:true}).count(),0);
  assert.equal(await customer.page.getByRole('button',{name:'Download current proof',exact:true}).count(),0);await fit(customer.page,'customer-linked-shipment');
  const projection=await readCommand(customer.page,'getCustomerShipment',{shipmentId:acceptedShipment.shipmentId});assert.equal(projection.status,'Preparing');assert.equal(projection.location,null);assert.equal(projection.proof,null);
 });
 await check('Customer can cancel a Submitted request and sees a labelled Cancelled state',async()=>{
  const order=await submitNew(customer.page,' cancellation');await customer.page.waitForURL(origin+'/customer/orders/'+order.orderId);
  customer.page.once('dialog',dialog=>dialog.accept());const result=await commandResult(customer.page,'Cancel',()=>click(customer.page,'Cancel request'));assert.equal(result.orderStatus,'Cancelled');await customer.page.getByText('Cancelled',{exact:true}).waitFor();await fit(customer.page,'customer-cancelled','Cancelled');
 });
 await check('Staff rejection returns its customer-safe message without creating a shipment',async()=>{
  const order=await submitNew(customer.page,' rejection');await staff.page.goto(origin+'/logistics/shipments');await click(staff.page,'Customer orders');await (await findRequest(staff.page,order.reference)).click();
  const message='Please clarify the fictional carton size '+runTag;await staff.page.getByLabel('Message to customer',{exact:true}).fill(message);
  const result=await commandResult(staff.page,'Decide',()=>click(staff.page,'Reject request'));assert.equal(result.orderStatus,'Rejected');assert.equal(result.shipmentId,null);await fit(staff.page,'staff-rejected','Rejected');
  await customer.page.goto(origin+'/customer/orders/'+order.orderId);await customer.page.getByText('Rejected',{exact:true}).waitFor();await customer.page.getByText(message,{exact:true}).waitFor();await fit(customer.page,'customer-rejected','Rejected');
 });
 const other=await newContext('other');
 await check('Another Customer cannot open the foreign order or shipment bookmarks',async()=>{
  for(const path of ['/customer/orders/'+createdOrder.orderId,'/customer/shipments/'+acceptedShipment.shipmentId]){
   await other.page.goto(origin+path);await other.page.getByRole('alert').filter({hasText:/unavailable|access|cannot/i}).first().waitFor({timeout:20000});
   const body=await other.page.locator('body').innerText();assert(!body.includes(recipient));assert(!body.includes(acceptedShipment.shipmentReference));assert(!body.includes(requestData.address));
  }await fit(other.page,'foreign-customer-bookmark-denied');
  await other.page.goto(origin+'/inventory/products');await other.page.waitForURL(url=>url.pathname.startsWith('/customer'));assert.equal(await other.page.getByRole('navigation',{name:'Primary navigation',exact:true}).count(),0);
 });
 await check('Customer pages mount no inventory subscriptions or sensor capture and issue no staff commands',async()=>{
  for(const q of [customer,other]){q.observation.sensorCalls=await q.page.evaluate(()=>window.__customerOrderQASensorCalls);assert.equal(q.observation.sensorCalls,0);assert(q.observation.listenRequests>0);assert(q.observation.profileSubscriptionObserved,'Network observer must detect the real own-profile subscription.');assert.deepEqual(q.observation.forbiddenSubscriptions,[]);assert(q.observation.commands.every(x=>!['getCustomerOrdersForStaff','getCustomerOrderForStaff'].includes(x.action)));}
  assert.deepEqual(unexpectedOrigins,[]);assert.deepEqual(pageErrors,[]);
 });
 await writeFile(join(output,'result.private.json'),JSON.stringify({passed:true,actualApplication:true,loopbackEmulators:true,checks:checks.length,cases:checks,viewports:[1440,390,320],createdOrderId:createdOrder.orderId,shipmentId:acceptedShipment.shipmentId,contrastSamples,observations,noCloudWrites:true,noProductionChanges:true,noSensors:true},null,2));
 console.log(JSON.stringify({passed:true,checks:checks.length,output}));
})();}catch(error){
 await mkdir(output,{recursive:true});await writeFile(join(output,'result.private.json'),JSON.stringify({passed:false,actualApplication:true,checks:checks.length,cases:checks,failedCheck:currentCheck,message:redact(error.message),pageErrors,unexpectedOrigins,contrastSamples},null,2));
 console.error(JSON.stringify({passed:false,checks:checks.length,failedCheck:currentCheck,output}));process.exitCode=1;
}finally{
 for(const context of contexts){try{await closeLocalTestContext(context);}catch{await context.close().catch(()=>{});}}
 if(browser)await browser.close();
}
