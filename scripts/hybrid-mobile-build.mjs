import {readFile,writeFile,mkdir,lstat,copyFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {completionExact,completionCanonical} from '../lib/completionWorkflow.js';
import {mobileSourcePins,MOBILE_ROOT} from './prepare-mobile-local.mjs';
import {validateSparkMobileOptions,makeSparkMobileAssets} from './spark-mobile-build.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),fail=()=>{throw Error('The explicit Android debug profile/build is unavailable.');};
export function validateHybridMobileBuildTask(flavour,action){
 if(!['local','cloud-demo'].includes(flavour)||!['assemble','test'].includes(action))fail();return [action==='assemble'?`assemble${flavour==='local'?'Local':'CloudDemo'}Debug`:`test${flavour==='local'?'Local':'CloudDemo'}DebugUnitTest`];
}
export function mobileCloudFixture(){
 const projectId='iilas-cloud-fixture',apiKey='cloud-demo-fixture-not-connectable';return {projectId,apiKey,appId:'1:123456789012:android:1111111111111111',storageBucket:projectId+'.firebasestorage.app',functionsRegion:'asia-southeast1',fixtureOnly:true,web:{projectId,apiKey,appId:'1:123456789012:web:1111111111111111',storageBucket:projectId+'.firebasestorage.app',authDomain:projectId+'.firebaseapp.com'}};
}
export function validateMobileCloudOptions(raw){
 const p=completionExact(raw,['projectId','apiKey','appId','storageBucket','functionsRegion','fixtureOnly','web']),w=completionExact(p.web,['projectId','apiKey','appId','storageBucket','authDomain']);
 if(typeof p.fixtureOnly!=='boolean'||!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(p.projectId)||p.projectId==='fyp-inventory-and-logistics'||![p.projectId+'.firebasestorage.app',p.projectId+'.appspot.com'].includes(p.storageBucket)||!/^[a-z]+-[a-z]+[0-9]$/.test(p.functionsRegion)||w.projectId!==p.projectId||w.storageBucket!==p.storageBucket||w.authDomain!==p.projectId+'.firebaseapp.com')fail();
 if(p.fixtureOnly){if(completionCanonical(p)!==completionCanonical(mobileCloudFixture()))fail();}
 else if(!/^AIza[A-Za-z0-9_-]{35}$/.test(p.apiKey)||!/^AIza[A-Za-z0-9_-]{35}$/.test(w.apiKey)||!/^1:[0-9]+:android:[a-f0-9]{16,40}$/.test(p.appId)||!/^1:[0-9]+:web:[a-f0-9]{16,40}$/.test(w.appId))fail();
 return p;
}
async function ignoredFile(input){
 const p=resolve(MOBILE_ROOT,input),rel=relative(MOBILE_ROOT,p);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();execFileSync('git',['check-ignore','-q','--',rel],{cwd:MOBILE_ROOT,stdio:'pipe'});
 let cursor=MOBILE_ROOT;for(const part of rel.split(/[\\/]/)){cursor=join(cursor,part);const s=await lstat(cursor);if(s.isSymbolicLink()||s.isFile()&&(s.nlink!==1||s.size>16384))fail();}return JSON.parse(await readFile(p,'utf8'));
}
async function exclusiveConfig(path,bytes){try{await writeFile(path,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||!Buffer.from(await readFile(path)).equals(Buffer.from(bytes)))throw Error('Refuse to overwrite a different native profile.');}}
async function runNode(args,env,output,name){
 const child=spawn(process.execPath,args,{cwd:MOBILE_ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});const status=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});await writeFile(join(output,name),log,{flag:'wx'});if(status!==0)fail();
}
export async function buildHybridMobile({flavour,action,cloudOptions,sparkOptions,fixtureOnly=false}){
 if(sparkOptions&&(cloudOptions||flavour!=='cloud-demo'))fail();
 const tasks=validateHybridMobileBuildTask(flavour,action),ram=Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim());if(!Number.isFinite(ram)||ram<3*1024*1024)throw Error('At least 3 GiB of free Windows RAM is required.');
 const output=join(MOBILE_ROOT,'outputs/hybrid-demo-20261027/mobile-'+flavour+'-'+randomUUID());await mkdir(output,{recursive:true});
 const spark=sparkOptions?validateSparkMobileOptions(sparkOptions):null;if(spark&&spark.fixtureOnly!==fixtureOnly)fail();
 const sparkAssets=spark?makeSparkMobileAssets(spark):null;
 const cloud=flavour==='cloud-demo'&&!spark?validateMobileCloudOptions(fixtureOnly?mobileCloudFixture():cloudOptions):null;
 const local={schema:'iilas-mobile-local-1.0',projectId:'fyp-inventory-and-logistics',protocol:'mobile-command-1.0',host:'127.0.0.1',ports:{functions:5001,firestore:8081,auth:9099,storage:9199},apiKey:'emulator-test-only',appId:'1:1234567890:android:0000000000000000',storageBucket:'fyp-inventory-and-logistics.firebasestorage.app'};
 const native=sparkAssets?sparkAssets.native:cloud?{schema:'iilas-mobile-cloud-demo-1.0',projectId:cloud.projectId,protocol:local.protocol,apiKey:cloud.apiKey,appId:cloud.appId,storageBucket:cloud.storageBucket,functionsRegion:cloud.functionsRegion,fixtureOnly:cloud.fixtureOnly}:local;
 const nativeDir=cloud||spark?join(output,'native-assets'):join(MOBILE_ROOT,'android/app/src/local/assets');await mkdir(nativeDir,{recursive:true});await exclusiveConfig(join(nativeDir,'mobile-environment.json'),JSON.stringify(native)+'\n');
 const web=sparkAssets?sparkAssets.web:cloud?cloud.web:{projectId:local.projectId,apiKey:'emulator-test-only',appId:'1:1234567890:web:0000000000000000',authDomain:'localhost'};
 const webPath=join(output,'private-web-options.json');await writeFile(webPath,JSON.stringify(web)+'\n',{flag:'wx'});
 const env={...process.env,ANDROID_HOME:'C:/Users/Home/AppData/Local/Android/Sdk',ANDROID_SDK_ROOT:'C:/Users/Home/AppData/Local/Android/Sdk',IILAS_MOBILE_FLAVOUR:spark?'spark-msi':flavour,IILAS_MOBILE_WEB_CONFIG:webPath,IILAS_MOBILE_WEB_CONFIG_SHA256:hash(await readFile(webPath)),IILAS_MOBILE_FIXTURE_ONLY:String(Boolean(spark?.fixtureOnly||cloud?.fixtureOnly))};if(cloud||spark)env.IILAS_CLOUD_ASSET_DIR=nativeDir;
 const before=await mobileSourcePins();
 if(action==='assemble'){await runNode(['scripts/build-mobile-web.mjs'],env,output,'web-build.log');await runNode(['node_modules/@capacitor/cli/bin/capacitor','copy','android'],env,output,'capacitor-copy.log');}
 const args=[...tasks,'--no-daemon','--max-workers=2','--console=plain','--offline','--write-locks'];
 const child=spawn('cmd.exe',['/d','/s','/c','gradlew.bat '+args.join(' ')],{cwd:join(MOBILE_ROOT,'android'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
 const timer=setTimeout(()=>{if(Number.isSafeInteger(child.pid))try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}catch{child.kill();}},20*60*1000);
 let status;try{status=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});}finally{clearTimeout(timer);await writeFile(join(output,'gradle.log'),log,{flag:'wx'});}
 if(status!==0)throw Error('Native debug build failed; inspect '+join(output,'gradle.log'));
 const after=await mobileSourcePins();for(const [file,pin]of Object.entries(before))if(after[file]!==pin&&!file.endsWith('/gradle.lockfile'))throw Error('Build sources changed during native build.');
 const receipt={passed:true,flavour,mode:spark?'spark-msi':flavour,action,fixtureOnly:Boolean(spark?.fixtureOnly||cloud?.fixtureOnly),phoneAcceptance:false,cloudConnectivity:false,sourcePins:after,nativeConfigSha256:hash(await readFile(join(nativeDir,'mobile-environment.json'))),webConfigSha256:hash(await readFile(webPath)),output};
 if(action==='assemble'){const apk=join(MOBILE_ROOT,'android/app/build/outputs/apk',flavour==='local'?'local':'cloudDemo','debug',`app-${flavour==='local'?'local':'cloudDemo'}-debug.apk`);receipt.apk=join(output,cloud?.fixtureOnly?'iilas-driver-cloud-NOT-CONNECTABLE.apk':`iilas-driver-${flavour}.apk`);await copyFile(apk,receipt.apk);receipt.apkSha256=hash(await readFile(apk));}
 await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,flavour,action,fixtureOnly:receipt.fixtureOnly,output,apk:receipt.apk??null}));return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const get=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};const options=get('--cloud-options');
 Promise.all([options?ignoredFile(options):undefined,get('--spark-options')?ignoredFile(get('--spark-options')):undefined]).then(([cloudOptions,sparkOptions])=>buildHybridMobile({flavour:get('--flavour'),action:get('--action'),fixtureOnly:process.argv.includes('--fixture'),cloudOptions,sparkOptions})).catch(e=>{console.error(e.message);process.exitCode=1;});
}
