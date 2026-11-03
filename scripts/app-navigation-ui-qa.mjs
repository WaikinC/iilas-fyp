import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';

const require=createRequire(import.meta.url),{chromium}=require(process.env.IILAS_PLAYWRIGHT_MODULE||'C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin='http://127.0.0.1:5173';
const output='outputs/app-navigation-20261103/ui-'+randomUUID(),checks=[],errors=[],externalRequests=[],businessRequests=[];
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  // Preserve Vite's transformed React-refresh preamble while replaying this HTML
  // at real application paths. Raw filesystem HTML cannot initialise dev modules.
  const response=await context.request.get(origin+'/scripts/fixtures/app-navigation/harness.html');
  assert(response.ok(),'The existing worktree Vite server must serve the fixture HTML.');
  const html=await response.text();assert(html.includes('injectIntoGlobalHook'),'Expected Vite-transformed fixture HTML.');
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){externalRequests.push(url.hostname);return route.abort();}
    if(!['GET','HEAD'].includes(request.method())){businessRequests.push({method:request.method(),path:url.pathname});return route.abort();}
    if(request.isNavigationRequest())return route.fulfill({status:200,contentType:'text/html',body:html});
    if(url.pathname==='/@vite/client'){
      // Keep the dev connection and browser errors intact; disable only Vite 8's
      // optional server-console forwarding, which sends before its socket opens.
      const response=await route.fetch(),source=await response.text(),body=source.replace(/const forwardConsole = \{[^\n]+\};/,'const forwardConsole = {"enabled":false};');
      assert.notEqual(body,source,'Expected the configured Vite 8 console-forwarding declaration.');
      return route.fulfill({response,body});
    }
    return route.continue();
  });
  await context.addInitScript(()=>{window.appNavigationFixture={shellMounts:0,shellUnmounts:0,editorMounts:0,editorUnmounts:0,guardChecks:[],busyRefusals:0,lastProceed:null,lastCancel:null};});
  context.on('page',page=>page.on('pageerror',error=>{const message=error.stack||error.message;if(errors.length<20&&!errors.includes(message))errors.push(message);}));
  const page=await context.newPage(),dialog=()=>page.getByRole('dialog',{name:'Discard unsaved changes?',exact:true});
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const path=()=>new URL(page.url()).pathname;
  const at=async(expected,module)=>{await page.waitForURL(origin+expected);await page.locator('[data-current-path]').filter({hasText:expected}).waitFor();assert.equal(path(),expected);assert.equal(await page.locator('[data-current-path]').textContent(),expected);if(module)assert.equal(await page.locator('[data-current-module]').textContent(),module);};
  const go=async(url)=>{await page.goto(origin+url);await page.getByRole('navigation',{name:'Fixture module navigation',exact:true}).waitFor();};
  const clickModule=label=>page.getByRole('navigation',{name:'Fixture module navigation',exact:true}).getByRole('button',{name:label,exact:true}).click();
  const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};

  await check('Every module supports direct entry and keeps the requested URL on reload',async()=>{
    for(const [url,module]of [['/dashboard','dashboard'],['/inventory/products','products'],['/inventory/stock','stock'],['/inventory/warehouse','warehouse'],['/inventory/procurement','procurement'],['/logistics/shipments','shipments'],['/logistics/fleet','fleet'],['/logistics/transport','transport'],['/logistics/deliveries','delivery'],['/reports','reports'],['/users','team'],['/customer','customer']]){
      await go(url);await at(url,module);await page.reload();await at(url,module);
    }
  });
  await check('Immutable shipment purchase and customer record links survive reload',async()=>{
    for(const [url,module,id]of [['/logistics/shipments/fixture-shipment-1','shipments','fixture-shipment-1'],['/inventory/procurement/orders/fixture-order-1','procurement','fixture-order-1'],['/customer/shipments/fixture-customer-shipment-1','customer','fixture-customer-shipment-1']]){
      await go(url);await at(url,module);assert.equal(await page.locator('[data-current-record]').textContent(),id);await page.reload();await at(url,module);assert.equal(await page.locator('[data-current-record]').textContent(),id);
    }
  });
  await check('Unknown paths remain explicitly unavailable without silently opening Dashboard',async()=>{
    await go('/not-an-iilas-module');await at('/not-an-iilas-module');await page.getByRole('heading',{name:'Page unavailable',exact:true}).waitFor();assert.equal(await page.locator('[data-current-record]').textContent(),'none');
  });
  await check('Module clicks keep the account shell mounted and preserve its local state',async()=>{
    await go('/dashboard');await page.getByRole('button',{name:'Increment stable shell state',exact:true}).click();
    await clickModule('Product Management');await at('/inventory/products','products');await clickModule('Stock Management');await at('/inventory/stock','stock');await clickModule('Reports & Statistics');await at('/reports','reports');
    assert.equal(await page.getByLabel('Stable shell count',{exact:true}).textContent(),'1');assert.deepEqual(await page.evaluate(()=>[window.appNavigationFixture.shellMounts,window.appNavigationFixture.shellUnmounts]),[1,0]);
    await page.goBack();await at('/inventory/stock','stock');await page.goBack();await at('/inventory/products','products');await page.goForward();await at('/inventory/stock','stock');await page.goForward();await at('/reports','reports');
    assert.equal(await page.getByLabel('Stable shell count',{exact:true}).textContent(),'1');
  });
  await check('Replace navigation does not add an extra Back destination',async()=>{
    await go('/dashboard');await clickModule('Stock Management');await at('/inventory/stock','stock');await page.getByRole('button',{name:'Replace with Products',exact:true}).click();await at('/inventory/products','products');await page.goBack();await at('/dashboard','dashboard');
  });
  await check('Dirty module exits can be cancelled repeatedly with the draft and URL retained',async()=>{
    await go('/dashboard');await clickModule('Order & Dispatch');await at('/logistics/shipments','shipments');await page.getByLabel('Draft recipient',{exact:true}).fill('Fictional recipient draft');
    for(let attempt=0;attempt<2;attempt++){
      await clickModule('Reports & Statistics');await dialog().waitFor();assert.equal(path(),'/logistics/shipments');await dialog().getByRole('button',{name:'Keep editing',exact:true}).click();await dialog().waitFor({state:'detached'});await at('/logistics/shipments','shipments');assert.equal(await page.getByLabel('Draft recipient',{exact:true}).inputValue(),'Fictional recipient draft');
    }
    await clickModule('Reports & Statistics');await dialog().getByRole('button',{name:'Discard changes',exact:true}).click();await at('/reports','reports');await page.goBack();await at('/logistics/shipments','shipments');assert.equal(await page.getByLabel('Draft recipient',{exact:true}).inputValue(),'');
  });
  await check('Rapid blocked navigation can be cancelled without an old allow callback navigating later',async()=>{
    await go('/logistics/shipments');await page.getByLabel('Draft recipient',{exact:true}).fill('Rapid navigation draft');await clickModule('Reports & Statistics');await dialog().waitFor();await page.evaluate(()=>{window.appNavigationFixture.firstProceed=window.appNavigationFixture.lastProceed;});await clickModule('Product Management');await dialog().waitFor();await dialog().getByRole('button',{name:'Keep editing',exact:true}).click();await dialog().waitFor({state:'detached'});await at('/logistics/shipments','shipments');assert.equal(await page.getByLabel('Draft recipient',{exact:true}).inputValue(),'Rapid navigation draft');await page.evaluate(()=>window.appNavigationFixture.firstProceed());await settle();await at('/logistics/shipments','shipments');
    await clickModule('Stock Management');await dialog().getByRole('button',{name:'Discard changes',exact:true}).click();await at('/inventory/stock','stock');
  });
  await check('Dirty Back cancellation and acceptance retain coherent repeated history traversal',async()=>{
    await go('/dashboard');await clickModule('Stock Management');await clickModule('Order & Dispatch');await at('/logistics/shipments','shipments');await page.getByLabel('Draft recipient',{exact:true}).fill('Back draft');
    for(let attempt=0;attempt<2;attempt++){
      await page.goBack();await dialog().waitFor();await settle();assert.equal(path(),'/logistics/shipments');await dialog().getByRole('button',{name:'Keep editing',exact:true}).click();await at('/logistics/shipments','shipments');assert.equal(await page.getByLabel('Draft recipient',{exact:true}).inputValue(),'Back draft');
    }
    await page.goBack();await dialog().getByRole('button',{name:'Discard changes',exact:true}).click();await at('/inventory/stock','stock');await page.goForward();await at('/logistics/shipments','shipments');await page.goBack();await at('/inventory/stock','stock');await page.goForward();await at('/logistics/shipments','shipments');
  });
  await check('Dirty Forward cancellation and acceptance retain coherent repeated history traversal',async()=>{
    await go('/dashboard');await clickModule('Order & Dispatch');await clickModule('Reports & Statistics');await at('/reports','reports');await page.goBack();await at('/logistics/shipments','shipments');await page.getByLabel('Draft recipient',{exact:true}).fill('Forward draft');
    for(let attempt=0;attempt<2;attempt++){
      await page.goForward();await dialog().waitFor();await settle();assert.equal(path(),'/logistics/shipments');await dialog().getByRole('button',{name:'Keep editing',exact:true}).click();await at('/logistics/shipments','shipments');assert.equal(await page.getByLabel('Draft recipient',{exact:true}).inputValue(),'Forward draft');
    }
    await page.goForward();await dialog().getByRole('button',{name:'Discard changes',exact:true}).click();await at('/reports','reports');await page.goBack();await at('/logistics/shipments','shipments');await page.goForward();await at('/reports','reports');
  });
  await check('Same-module record changes also obey dirty exit decisions',async()=>{
    await go('/logistics/shipments/fixture-shipment-1');await page.getByLabel('Draft recipient',{exact:true}).fill('Same-module draft');await page.getByRole('button',{name:'Open second fictional shipment',exact:true}).click();await dialog().waitFor();await dialog().getByRole('button',{name:'Keep editing',exact:true}).click();await at('/logistics/shipments/fixture-shipment-1','shipments');assert.equal(await page.getByLabel('Draft recipient',{exact:true}).inputValue(),'Same-module draft');
    await page.getByRole('button',{name:'Open second fictional shipment',exact:true}).click();await dialog().getByRole('button',{name:'Discard changes',exact:true}).click();await at('/logistics/shipments/fixture-shipment-2','shipments');assert.equal(await page.locator('[data-current-record]').textContent(),'fixture-shipment-2');
  });
  await check('Busy guard refuses module and Back exits without adding a history entry',async()=>{
    await go('/dashboard');await clickModule('Order & Dispatch');await at('/logistics/shipments','shipments');await page.getByLabel('Request in progress',{exact:true}).check();await clickModule('Reports & Statistics');await settle();await at('/logistics/shipments','shipments');await page.goBack();await settle();await at('/logistics/shipments','shipments');assert.equal(await page.evaluate(()=>window.appNavigationFixture.busyRefusals),2);
    await page.getByLabel('Request in progress',{exact:true}).uncheck();await page.goBack();await at('/dashboard','dashboard');
  });
  await check('Before-unload protection follows the current dirty and busy guard lifetime',async()=>{
    await go('/logistics/shipments');const warned=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});assert.equal(await warned(),false);await page.getByLabel('Draft recipient',{exact:true}).fill('Unload draft');assert.equal(await warned(),true);await page.getByLabel('Draft recipient',{exact:true}).fill('');await page.getByLabel('Request in progress',{exact:true}).check();assert.equal(await warned(),true);await page.getByRole('button',{name:'Unmount editor guard',exact:true}).click();assert.equal(await warned(),false);
  });
  await check('Authority changes retire callbacks from the previous editor guard',async()=>{
    await go('/logistics/shipments');await page.getByLabel('Draft recipient',{exact:true}).fill('Retired authority draft');await clickModule('Reports & Statistics');await dialog().waitFor();await page.getByRole('button',{name:'Change authority version',exact:true}).click();await page.getByLabel('Authority version',{exact:true}).filter({hasText:'2'}).waitFor();await dialog().waitFor({state:'detached'});await at('/logistics/shipments','shipments');
    await page.evaluate(()=>window.appNavigationFixture.lastProceed());await settle();await at('/logistics/shipments','shipments');await clickModule('Product Management');await at('/inventory/products','products');
  });
  await check('Unmounting a guard retires its previously stored allow callback',async()=>{
    await go('/logistics/shipments');await page.getByLabel('Draft recipient',{exact:true}).fill('Unmounted draft');await clickModule('Reports & Statistics');await dialog().waitFor();await page.getByRole('button',{name:'Unmount editor guard',exact:true}).click();await dialog().waitFor({state:'detached'});await at('/logistics/shipments','shipments');await page.evaluate(()=>window.appNavigationFixture.lastProceed());await settle();await at('/logistics/shipments','shipments');await clickModule('Stock Management');await at('/inventory/stock','stock');
  });
  await check('A real record href opens its matching route in a separate tab',async()=>{
    await go('/dashboard');const link=page.getByRole('link',{name:'Open shipment in new tab',exact:true});assert.equal(await link.getAttribute('href'),'/logistics/shipments/fixture-shipment-1');const [popup]=await Promise.all([context.waitForEvent('page'),link.click()]);await popup.getByRole('heading',{name:'Order & Dispatch',exact:true}).waitFor();assert.equal(new URL(popup.url()).pathname,'/logistics/shipments/fixture-shipment-1');assert.equal(await popup.locator('[data-current-record]').textContent(),'fixture-shipment-1');await popup.close();await at('/dashboard','dashboard');
  });
  await check('Narrow-screen fixture retains readable routes and usable guard actions',async()=>{
    await go('/logistics/shipments/fixture-shipment-1');await page.setViewportSize({width:390,height:900});await page.getByLabel('Draft recipient',{exact:true}).fill('Narrow-screen draft');await clickModule('Reports & Statistics');await dialog().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/navigation-narrow.png',fullPage:true});await dialog().getByRole('button',{name:'Keep editing',exact:true}).click();await at('/logistics/shipments/fixture-shipment-1','shipments');await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:output+'/navigation-desktop.png',fullPage:true});
  });
  assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);assert.deepEqual(businessRequests,[]);
  await writeFile(output+'/result.json',JSON.stringify({passed:true,softwareFixturesOnly:true,noCloudWrites:true,checks:checks.length,cases:checks,externalRequests,businessRequests},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,output}));
}catch(error){await writeFile(output+'/result.json',JSON.stringify({passed:false,softwareFixturesOnly:true,checks:checks.length,cases:checks,message:error.message,errors,externalRequests,businessRequests},null,2));console.error(JSON.stringify({failedAfter:checks.length,output}));throw error;}finally{await browser.close();}
