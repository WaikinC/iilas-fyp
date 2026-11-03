import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';

const require=createRequire(import.meta.url),{chromium}=require(process.env.IILAS_PLAYWRIGHT_MODULE||'C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='http://127.0.0.1:5173',fixture='/scripts/fixtures/app-url-shell/harness.html';
const state=await readFile(new URL('./fixtures/app-url-shell/state.js',import.meta.url),'utf8');
const response=await fetch(origin+fixture);assert.equal(response.status,200,'The existing worktree Vite server must serve this fixture');
const html=await response.text();assert(html.includes('/@vite/client'),'Use Vite-transformed HTML so the React refresh preamble is present');
const transformedHarness=await(await fetch(origin+'/scripts/fixtures/app-url-shell/harness.tsx')).text();
const reactURL=transformedHarness.match(/\/node_modules\/\.vite\/deps\/react\.js\?v=[^"']+/)?.[0];
assert(reactURL,'Mock modules must use the same optimized React instance as the real application');
const output='outputs/app-url-shell-ui-'+randomUUID();await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),contexts=[],allErrors=[],allExternal=[],checks=[],redEvidence=[];
const js=body=>({contentType:'text/javascript',body});
const react=`import React from ${JSON.stringify(reactURL)};`;
const simpleModule=(name,heading)=>react+`export default function FixtureModule(){React.useEffect(()=>{window.appURL.moduleMounts.push(${JSON.stringify(name)})},[]);return React.createElement('h1',null,${JSON.stringify(heading)});}`;
const environment={schema:'iilas-demo-environment-1.0',mode:'local-emulator',projectId:'fyp-inventory-and-logistics',storageBucket:'fyp-inventory-and-logistics.firebasestorage.app',functionsRegion:'asia-southeast1',webOrigins:[origin,'http://localhost:5173']};
const mocks=new Map([
  ['/lib/firebase.js',`export const configured=true,db={},projectId='fixture-project',demoEnvironment=${JSON.stringify(environment)},auth={get currentUser(){return window.appURL.user}};export const saveRecord=(...x)=>window.appURL.forbidWrite('saveRecord',x),deleteRecord=(...x)=>window.appURL.forbidWrite('deleteRecord',x);`],
  ['/lib/firebaseRuntime.js',`export const demoEnvironment=${JSON.stringify(environment)},projectId='fixture-project',configured=true,db={},storage=null,functions=null,sparkTransport=null,auth={get currentUser(){return window.appURL.user}};export const sessionRecoveryStorage={getItem:k=>sessionStorage.getItem(k),setItem:(k,v)=>sessionStorage.setItem(k,v),removeItem:k=>sessionStorage.removeItem(k)},recordCreationRecoveryStorage=sessionRecoveryStorage;`],
  ['/lib/workspace.js',"export const getActiveWorkspace=()=>window.appURL.activeWorkspace,setActiveWorkspace=x=>window.appURL.activeWorkspace=x,workspaceCommand=(a,i)=>window.appURL.command(a,i);"],
  ['/app/Dashboard.tsx',simpleModule('dashboard','Dashboard')],
  ['/src/features/stock/StockManagement.tsx',simpleModule('stock','Stock Management')],
  ['/src/features/warehouse/WarehouseOperations.tsx',simpleModule('warehouse','Warehouse Operations')],
  ['/src/features/workspace/AdminPanel.tsx',react+"export default function FixtureAdmin(){React.useEffect(()=>{window.appURL.adminMounts++},[]);return React.createElement('h1',null,'User Management');}"],
  ['/src/features/operations/Operations.tsx',react+"import Procurement from '/src/features/operations/Procurement.tsx';const names={fleet:'Fleet Management',transport:'Transport Management',delivery:'Delivery Monitoring',reports:'Reports & Statistics'};export default function FixtureOperations(props){return props.mode==='procurement'?React.createElement(Procurement,props):React.createElement('h1',null,names[props.mode]);}"]
]);
const firestore="export const collection=(_,kind)=>({kind}),doc=(_,kind,id)=>({kind,id}),where=(...x)=>x,orderBy=(...x)=>['order',...x],limit=x=>['limit',x],startAfter=x=>['after',x],documentId=()=>'__name__',query=(ref,...filters)=>({...ref,filters}),onSnapshot=(ref,next,error)=>window.appURL.onSnapshot(ref,next,error),getDocs=ref=>window.appURL.getDocs(ref),getDoc=ref=>window.appURL.getDoc(ref);";
const auth="export const onAuthStateChanged=(_,next)=>{window.appURL.authListeners.add(next);queueMicrotask(()=>next(window.appURL.user));return()=>window.appURL.authListeners.delete(next)},sendEmailVerification=async()=>{},signOut=async()=>window.appURL.setSession(window.appURL.profile.role,false),signInWithEmailAndPassword=(...x)=>window.appURL.forbidWrite('real-login-forbidden',x),createUserWithEmailAndPassword=(...x)=>window.appURL.forbidWrite('real-registration-forbidden',x),sendPasswordResetEmail=(...x)=>window.appURL.forbidWrite('real-password-reset-forbidden',x);";

async function session(options={role:'Admin',signedIn:true}){
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});contexts.push(context);
  await context.addInitScript({content:`window.__appURLFixtureOptions=${JSON.stringify(options)};${state}`});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){allExternal.push({url:url.origin+url.pathname,type:request.resourceType()});return route.abort('blockedbyclient');}
    if(request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:html});
    // Vite 8's optional console forwarding races its websocket on intercepted pages.
    // Disable forwarding only in this response; keep HMR, refresh and styles intact.
    if(url.pathname==='/@vite/client'){const response=await route.fetch();return route.fulfill({response,body:(await response.text()).replace(/const forwardConsole = \{[^;]+;/,'const forwardConsole = {enabled:false};')});}
    if(options.legacySameModule&&url.pathname==='/app/page.tsx'){
      const response=await route.fetch(),source=await response.text();
      const legacy=source.replace(/if\s*\(routing\.route\.path === appRoutePath\(next\)\)\s*\{\s*setNavOpen\(false\);\s*setFinderOpen\(false\);\s*\}/,'');
      assert.notEqual(legacy,source,'The virtual regression must remove the current-module dismissal fix');
      return route.fulfill({response,body:legacy});
    }
    if(mocks.has(url.pathname))return route.fulfill(js(mocks.get(url.pathname)));
    if(url.pathname.endsWith('/firebase_auth.js'))return route.fulfill(js(auth));
    if(url.pathname.endsWith('/firebase_firestore.js'))return route.fulfill(js(firestore));
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>{const message=error.stack||error.message;if(!allErrors.includes(message)&&allErrors.length<30)allErrors.push(message);});
  page.setDefaultTimeout(10000);return page;
}
const heading=(page,name)=>page.getByRole('heading',{name,exact:true}).first().waitFor();
async function path(page,value){await page.waitForURL(origin+value);assert.equal(new URL(page.url()).pathname,value);}
async function clean(page){assert.deepEqual(await page.evaluate(()=>window.appURL.writes),[],'Navigation must not perform record writes or real login');}
function passed(name){checks.push(name);console.log('PASS '+name);}
async function chooseCurrentFinder(page,timeout=10000){
  await page.getByRole('button',{name:'Find a module',exact:true}).click();
  const finder=page.getByRole('dialog',{name:'Find a module',exact:true});await finder.waitFor();
  await finder.getByRole('textbox',{name:'Search modules',exact:true}).fill('Dashboard');
  await finder.getByRole('button',{name:/^Dashboard/}).click();
  await finder.waitFor({state:'detached',timeout});
}
const historyIndex=page=>page.evaluate(()=>history.state.idx);

try{
  // Confirm this assertion detects the former behavior using served JavaScript only.
  const legacy=await session({role:'Admin',signedIn:true,legacySameModule:true});
  await legacy.goto(origin+'/dashboard');await heading(legacy,'Dashboard');
  await assert.rejects(()=>chooseCurrentFinder(legacy,750),/Timeout 750ms exceeded/);
  redEvidence.push({case:'Selecting the current module closes Module Finder',virtualChange:'Removed only same-path setNavOpen/setFinderOpen from served app/page.tsx',observedFailure:'Finder remained open after selecting Dashboard',sourceFilesChanged:false});
  await clean(legacy);await legacy.context().close();console.log('RED confirmed current-module finder dismissal against virtual pre-fix source');

  const page=await session();
  await page.goto(origin+'/inventory/products');await heading(page,'Product Management');await path(page,'/inventory/products');
  await page.reload();await heading(page,'Product Management');await path(page,'/inventory/products');passed('direct module entry and refresh');
  const links=page.getByRole('navigation',{name:'Primary navigation'});
  assert.equal(await links.getByRole('link',{name:'Stock Management',exact:true}).getAttribute('href'),'/inventory/stock');
  await links.getByRole('link',{name:'Stock Management',exact:true}).click();await heading(page,'Stock Management');await path(page,'/inventory/stock');
  await links.getByRole('link',{name:'Reports & Statistics',exact:true}).click();await heading(page,'Reports & Statistics');await path(page,'/reports');
  await page.goBack();await heading(page,'Stock Management');await path(page,'/inventory/stock');
  await page.goBack();await heading(page,'Product Management');await path(page,'/inventory/products');
  await page.goForward();await heading(page,'Stock Management');await path(page,'/inventory/stock');passed('sidebar hrefs and browser Back/Forward');
  await page.goto(origin+'/');await heading(page,'Dashboard');await path(page,'/dashboard');passed('root redirects to dashboard');
  const finderIndex=await historyIndex(page);await chooseCurrentFinder(page);await path(page,'/dashboard');assert.equal(await historyIndex(page),finderIndex);passed('selecting the current module closes Module Finder without a history entry');
  await page.setViewportSize({width:390,height:900});await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.locator('#app-navigation.is-open').waitFor();
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Dashboard',exact:true}).click();await page.locator('#app-navigation.is-open').waitFor({state:'detached'});
  assert.equal(await page.getByRole('button',{name:'Open menu',exact:true}).getAttribute('aria-expanded'),'false');await path(page,'/dashboard');await page.setViewportSize({width:1440,height:1000});passed('selecting the current module closes the mobile navigation drawer');
  await clean(page);

  const signedOut=await session({role:'Admin',signedIn:false});
  await signedOut.goto(origin+'/logistics/shipments/s1');await heading(signedOut,'Welcome back');await path(signedOut,'/logistics/shipments/s1');
  assert.deepEqual(await signedOut.evaluate(()=>window.appURL.subscriptions),[]);
  await signedOut.evaluate(()=>window.appURL.setSession('Admin'));await heading(signedOut,'SHP-000001');await path(signedOut,'/logistics/shipments/s1');
  await clean(signedOut);passed('signed-out request survives simulated authentication');

  const viewer=await session({role:'Viewer',signedIn:true});await viewer.goto(origin+'/users');await heading(viewer,'Access unavailable');await path(viewer,'/users');
  assert.equal(await viewer.evaluate(()=>window.appURL.adminMounts),0);assert.equal(await viewer.getByRole('link',{name:'User Management',exact:true}).count(),0);
  assert.equal(await viewer.evaluate(()=>window.appURL.subscriptions.filter(ref=>ref.kind==='users'&&!ref.id).length),0);await clean(viewer);passed('Viewer cannot mount user administration');

  const customer=await session({role:'Customer',signedIn:true});await customer.goto(origin+'/inventory/products');await heading(customer,'Your shipments');await path(customer,'/customer');
  assert((await customer.evaluate(()=>window.appURL.subscriptions)).every(ref=>ref.kind==='users'&&ref.id==='fixture-customer'));
  assert.equal(await customer.evaluate(()=>window.appURL.activeWorkspace),null);assert.equal(await customer.evaluate(()=>window.appURL.adminMounts),0);await clean(customer);passed('Customer staff URL redirects without staff subscriptions');
  await customer.goto(origin+'/customer/shipments/s1');await heading(customer,'Shipment details');await path(customer,'/customer/shipments/s1');
  assert.equal(await customer.evaluate(()=>window.appURL.calls.filter(call=>call.action==='getCustomerShipment').length),1,'StrictMode must not start a stale or duplicate routed detail request');
  assert.equal(await customer.getByText('Fictional destination',{exact:true}).count(),0);await clean(customer);passed('Customer deep link uses restricted shipment endpoint');

  const guarded=await session();await guarded.goto(origin+'/inventory/products');await heading(guarded,'Product Management');
  await guarded.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Order & Dispatch',exact:true}).click();await heading(guarded,'Order & Dispatch');
  await guarded.locator('[data-shipment-open="s1"]').click();await heading(guarded,'SHP-000001');await path(guarded,'/logistics/shipments/s1');
  const detailIndex=await historyIndex(guarded),historyLength=await guarded.evaluate(()=>history.length);
  await guarded.getByRole('button',{name:'Edit draft',exact:true}).click();const editor=guarded.getByRole('dialog',{name:'Edit draft',exact:true});
  await editor.getByLabel('Recipient',{exact:true}).fill('Unsaved backward edit');
  await guarded.evaluate(()=>{window.addEventListener('popstate',()=>{window.appURL.profile={...window.appURL.profile,displayName:'Fictional Admin refreshed'};window.appURL.profileChanged();},{once:true});history.back();});
  const discard=guarded.getByRole('dialog',{name:'Discard unsaved changes?',exact:true});await discard.waitFor();await path(guarded,'/logistics/shipments/s1');
  await discard.getByRole('button',{name:'Keep editing',exact:true}).click();await discard.waitFor({state:'detached'});
  assert.equal(await editor.getByLabel('Recipient',{exact:true}).inputValue(),'Unsaved backward edit');assert.equal(await historyIndex(guarded),detailIndex);assert.equal(await guarded.evaluate(()=>history.length),historyLength);await path(guarded,'/logistics/shipments/s1');
  await guarded.evaluate(()=>history.back());await discard.waitFor();await discard.getByRole('button',{name:'Discard changes',exact:true}).click();await editor.waitFor({state:'detached'});await path(guarded,'/logistics/shipments');assert.equal(await historyIndex(guarded),detailIndex-1);passed('real shipment dirty Back keeps input and history or discards after same-version profile refresh');
  await guarded.getByRole('button',{name:'New shipment',exact:true}).click();const newEditor=guarded.getByRole('dialog',{name:'Create draft',exact:true});await newEditor.getByLabel('Recipient',{exact:true}).fill('Unsaved forward edit');
  await guarded.evaluate(()=>history.forward());await discard.waitFor();await path(guarded,'/logistics/shipments');
  await discard.getByRole('button',{name:'Keep editing',exact:true}).click();await discard.waitFor({state:'detached'});
  assert.equal(await newEditor.getByLabel('Recipient',{exact:true}).inputValue(),'Unsaved forward edit');assert.equal(await historyIndex(guarded),detailIndex-1);assert.equal(await guarded.evaluate(()=>history.length),historyLength);
  await guarded.evaluate(()=>history.forward());await discard.waitFor();await discard.getByRole('button',{name:'Discard changes',exact:true}).click();await newEditor.waitFor({state:'detached'});await path(guarded,'/logistics/shipments/s1');await heading(guarded,'SHP-000001');assert.equal(await historyIndex(guarded),detailIndex);await clean(guarded);passed('real shipment dirty Forward keeps input and history or discards to the requested detail');

  await page.goto(origin+'/logistics/shipments/s1');await heading(page,'SHP-000001');await path(page,'/logistics/shipments/s1');
  await page.evaluate(()=>{window.appURL.records.shipments[0].recipient='Updated fictional recipient';window.appURL.records.shipments[0].version=2;window.appURL.changed();});
  await page.getByText('Updated fictional recipient',{exact:true}).waitFor();await page.reload();await heading(page,'SHP-000001');await path(page,'/logistics/shipments/s1');passed('real shipment controller resolves current record on direct entry and refresh');
  await page.goto(origin+'/logistics/shipments/missing');await page.getByRole('alert').filter({hasText:'The selected shipment is no longer available'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Edit draft',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Delete draft',exact:true}).count(),0);await clean(page);passed('missing shipment deep link has no record actions');

  await page.goto(origin+'/inventory/procurement/orders/po1');await page.getByRole('dialog',{name:'Purchase order details',exact:true}).getByRole('heading',{name:'PO-000001',exact:true}).waitFor();await path(page,'/inventory/procurement/orders/po1');
  await page.reload();await page.getByRole('dialog',{name:'Purchase order details',exact:true}).getByRole('heading',{name:'PO-000001',exact:true}).waitFor();passed('purchase order deep link and refresh');
  await page.goto(origin+'/inventory/procurement/orders/missing');await page.getByRole('alert').filter({hasText:/purchase.*(unavailable|found|loading)|order.*(unavailable|found|loading)/i}).waitFor();await clean(page);passed('missing purchase order deep link has an explicit unavailable state');

  await page.goto(origin+'/inventory/procurement');await heading(page,'Replenishment & Procurement');
  await page.getByRole('button',{name:'New purchase order',exact:true}).click();const purchaseEditor=page.getByRole('dialog',{name:'Submit purchase order',exact:true});
  await purchaseEditor.getByLabel('Supplier',{exact:true}).selectOption('supplier');await purchaseEditor.getByLabel('Expected replenishment',{exact:true}).fill('2099-02-01');
  await purchaseEditor.getByLabel('Purchase quantity 1',{exact:true}).fill('7');const purchaseIndex=await historyIndex(page);
  const stockLink=page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Stock Management',exact:true});
  const dismissedPrompt=page.waitForEvent('dialog'),dismissedNavigation=stockLink.evaluate(link=>link.click());
  const dismiss=await dismissedPrompt;assert.equal(dismiss.type(),'confirm');assert.match(dismiss.message(),/Leave the purchasing form/);await dismiss.dismiss();await dismissedNavigation;
  await path(page,'/inventory/procurement');assert.equal(await purchaseEditor.getByLabel('Supplier',{exact:true}).inputValue(),'supplier');assert.equal(await purchaseEditor.getByLabel('Expected replenishment',{exact:true}).inputValue(),'2099-02-01');assert.equal(await purchaseEditor.getByLabel('Purchase quantity 1',{exact:true}).inputValue(),'7');assert.equal(await historyIndex(page),purchaseIndex);await clean(page);passed('declining procurement navigation retains the dirty form, values, URL and history');
  const acceptedPrompt=page.waitForEvent('dialog'),acceptedNavigation=stockLink.evaluate(link=>link.click());
  const accept=await acceptedPrompt;assert.equal(accept.type(),'confirm');assert.match(accept.message(),/Leave the purchasing form/);await accept.accept();await acceptedNavigation;
  await path(page,'/inventory/stock');await heading(page,'Stock Management');await purchaseEditor.waitFor({state:'detached'});assert.equal(await historyIndex(page),purchaseIndex+1);
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Replenishment & Procurement',exact:true}).click();await heading(page,'Replenishment & Procurement');
  await page.getByRole('button',{name:'View order PO-000001',exact:true}).click();await path(page,'/inventory/procurement/orders/po1');await page.getByRole('dialog',{name:'Purchase order details',exact:true}).waitFor();
  await page.goBack();await path(page,'/inventory/procurement');await page.getByRole('dialog',{name:'Purchase order details',exact:true}).waitFor({state:'detached'});await clean(page);passed('accepting procurement navigation opens Stock and order detail Back still returns to its list');

  await page.goto(origin+'/logistics/shipments/s1');await heading(page,'SHP-000001');await page.screenshot({path:output+'/shipment-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/shipment-narrow.png',fullPage:true});passed('shipment deep link fits narrow viewport');
  assert.deepEqual(allErrors,[]);assert.deepEqual(allExternal,[],'No fixture requested external resources');
  await writeFile(output+'/result.json',JSON.stringify({passed:true,softwareFixturesOnly:true,checks,redEvidence,externalRequests:allExternal,pageErrors:allErrors},null,2));
  console.log(JSON.stringify({passed:true,checks:checks.length,output}));
}catch(error){
  const pages=await Promise.all(contexts.flatMap(context=>context.pages()).map(async page=>({url:page.url(),body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000)})));
  await writeFile(output+'/failure.json',JSON.stringify({checks,redEvidence,error:error.stack||String(error),externalRequests:allExternal,pageErrors:allErrors,pages},null,2));throw error;
}finally{await Promise.all(contexts.map(context=>context.close()));await browser.close();}
