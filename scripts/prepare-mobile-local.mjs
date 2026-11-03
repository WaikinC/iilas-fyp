import {readFile,writeFile,mkdir,lstat,readdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {completionExact,completionCanonical} from '../lib/completionWorkflow.js';
export const MOBILE_ROOT=fileURLToPath(new URL('../',import.meta.url));
const OUTPUT=resolve(MOBILE_ROOT,'outputs/android-mobile-20261026'),sha=x=>createHash('sha256').update(x).digest('hex');
const fail=()=>{throw Error('Local Android profile validation failed. Check ignored configuration and source bindings.');};
async function safePath(input,ignored=true){
 if(typeof input!=='string'||/[\x00-\x1f]/.test(input)||input.split(/[\\/]/).includes('..'))fail();
 const path=resolve(MOBILE_ROOT,input),rel=relative(MOBILE_ROOT,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();
 if(ignored)execFileSync('git',['check-ignore','-q','--',rel],{cwd:MOBILE_ROOT,stdio:'pipe'});
 let current=MOBILE_ROOT;for(const part of rel.split(/[\\/]/)){current=join(current,part);try{const s=await lstat(current);if(s.isSymbolicLink()||(s.isFile()&&s.nlink!==1))fail();}catch(e){if(e.code!=='ENOENT')throw e;}}
 return path;
}
async function bytes(path,ignored=true){const p=await safePath(path,ignored),before=await lstat(p);if(!before.isFile()||before.nlink!==1||before.size<1||before.size>1048576)fail();const data=await readFile(p),after=await lstat(p);if(after.ino!==before.ino||after.mtimeMs!==before.mtimeMs||data.length!==before.size)fail();return data;}
export async function mobileSourcePins(){
 const names=['lib/mobileDelivery.js','lib/mobileDelivery.d.ts','lib/mobilePlatformClient.js','lib/mobilePlatformClient.d.ts','lib/completionWorkflow.js','scripts/prepare-mobile-local.mjs','scripts/mobile-build.mjs','scripts/hybrid-mobile-build.mjs','scripts/build-mobile-web.mjs','scripts/mobile-local-launch.mjs','scripts/mobile-device.mjs','capacitor.config.ts','vite.mobile.config.ts','mobile.html','android/gradlew','src/mobile-main.tsx','package.json','package-lock.json'];
 names.push('scripts/spark-mobile-build.mjs','lib/sparkRuntime.js','lib/sparkRuntime.d.ts');
 async function scan(folder){let entries;try{entries=await readdir(resolve(MOBILE_ROOT,folder),{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const entry of entries){if(['build','.gradle','.kotlin','.idea','assets','node_modules'].includes(entry.name))continue;const name=folder+'/'+entry.name;if(entry.isSymbolicLink())fail();if(entry.isDirectory())await scan(name);else if(/\.(kt|java|xml|gradle|properties|tsx|ts|css|lockfile|jar|bat)$/.test(name)&&!name.endsWith('/local.properties'))names.push(name);}}
 await scan('android');await scan('src/features/mobile');
 return Object.fromEntries(await Promise.all([...new Set(names)].sort().map(async name=>[name,sha(await bytes(name,false))])));
}
const sourcePins=mobileSourcePins;
export async function prepareMobileProfile({baseProfile,output,webConfig}){
 const out=await safePath(output),rel=relative(OUTPUT,out);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();
 try{await lstat(out);fail();}catch(e){if(e.code!=='ENOENT')throw e;}
 const baseBytes=await bytes(baseProfile),base=JSON.parse(baseBytes),webBytes=await bytes(webConfig),web=JSON.parse(webBytes);
 completionExact(web,['projectId','apiKey','appId','storageBucket'],['authDomain','messagingSenderId','measurementId']);
 if(base.schema!=='fyp-completion-local-profile-1.0'||base.projectId!=='fyp-inventory-and-logistics'||web.projectId!==base.projectId||web.storageBucket!==base.projectId+'.firebasestorage.app')fail();
 const profile={schema:'iilas-mobile-local-1.0',projectId:base.projectId,base:{path:resolve(MOBILE_ROOT,baseProfile),sha256:sha(baseBytes)},web:{path:resolve(MOBILE_ROOT,webConfig),sha256:sha(webBytes)},ports:{functions:5001,firestore:8081,auth:9099,storage:9199},protocol:'mobile-command-1.0',sourcePins:await sourcePins()};
 await mkdir(out,{recursive:true});const path=join(out,'private.json');await writeFile(path,JSON.stringify(profile,null,2)+'\n',{flag:'wx'});
 return {schema:profile.schema,profile:path,profileSha256:sha(await readFile(path)),operationallyApproved:false};
}
export async function readMobileProfile(path){
 const p=completionExact(JSON.parse(await bytes(path)),['schema','projectId','base','web','ports','protocol','sourcePins']);
 if(p.schema!=='iilas-mobile-local-1.0'||p.projectId!=='fyp-inventory-and-logistics'||p.protocol!=='mobile-command-1.0'||completionCanonical(p.ports)!==completionCanonical({functions:5001,firestore:8081,auth:9099,storage:9199}))fail();
 for(const binding of [p.base,p.web]){completionExact(binding,['path','sha256']);if(sha(await bytes(binding.path))!==binding.sha256)fail();}
 if(JSON.stringify(await sourcePins())!==JSON.stringify(p.sourcePins))fail();return p;
}
export async function mobileLaunchEnvironment(path,role){
 const p=await readMobileProfile(path);if(!['Backend','StockResearch','DeliveryResearch','ParcelResearch'].includes(role))fail();
 const {createCompletionLocalProfiles}=await import('./prepare-fyp-completion-local.mjs'),env=await createCompletionLocalProfiles().environment(p.base.path,role);
 return role==='Backend'?{...env,IILAS_MOBILE_DEMO:'enabled'}:env;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const get=key=>process.argv[process.argv.indexOf(key)+1];prepareMobileProfile({baseProfile:get('--base'),webConfig:get('--web-config'),output:get('--output')}).then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Could not prepare local Android profile.');process.exitCode=1;});
}
