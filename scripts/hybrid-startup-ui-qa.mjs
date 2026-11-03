import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
export async function runHybridStartupFixture(){
 const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),output='outputs/hybrid-demo-20261027/startup-ui-'+randomUUID();await mkdir(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});let requests=0;
 try{const context=await browser.newContext({viewport:{width:1440,height:900}});await context.route('**/*',route=>{const u=new URL(route.request().url());if(['5001','8081','9099','9199'].includes(u.port)){requests++;return route.abort();}if(['http:','https:'].includes(u.protocol)&&u.hostname!=='127.0.0.1'&&u.hostname!=='localhost')return route.abort();return route.continue();});
  await context.route('**/lib/firebaseRuntime.js*',r=>r.fulfill({contentType:'text/javascript',body:'export const auth=null,db=null,functions=null,storage=null,projectId="fixture",configured=false,demoEnvironment={mode:"local-emulator"},sessionRecoveryStorage={};throw Error("Deliberate software fixture startup failure");'}));
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/');await page.getByRole('heading',{name:'IILAS could not start',exact:true}).waitFor({timeout:12000});assert.equal(await page.getByRole('button',{name:'Reload app',exact:true}).count(),1);
  assert(!(await page.locator('body').innerText()).includes('Deliberate software fixture'));
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/startup-'+width+'.png',fullPage:true});}
  assert.equal(requests,0);await writeFile(output+'/receipt.json',JSON.stringify({passed:true,widths:[1440,390],firebaseRequests:0,fixtureOnly:true,output},null,2),{flag:'wx'});return {passed:true,output};
 }finally{await browser.close();}
}
if(process.argv.includes('--browser-fixture'))runHybridStartupFixture().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error('Startup interface fixture failed:',e.name);process.exitCode=1;});
