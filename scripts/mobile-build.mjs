import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {readMobileProfile,MOBILE_ROOT} from './prepare-mobile-local.mjs';
const PORTS=[5001,8081,9099,9199];
export function validateAndroidBuildTask(task,filter){
 if(!['assembleDebug','testDebugUnitTest','connectedDebugAndroidTest','lintDebug'].includes(task))throw Error('Only bounded debug tasks are allowed.');
 if(filter!==undefined&&(task!=='testDebugUnitTest'||typeof filter!=='string'||!(/^[A-Za-z0-9_.*$]{1,180}$/).test(filter)))throw Error('Invalid unit test filter.');
 return filter?[task,'--tests',filter]:[task];
}
export function validateDeviceMappingPlan(serial,devices,mappings){
 if(typeof serial!=='string'||!(/^[A-Za-z0-9_.:-]{1,128}$/).test(serial)||!devices.some(d=>d.serial===serial&&d.state==='device'))throw Error('Select an explicitly authorised Android serial.');
 const planned=[];for(const port of PORTS){const local='tcp:'+port,old=mappings.find(m=>m.local===local);if(old&&old.remote!==local)throw Error('Refuse a different existing device mapping.');if(!old)planned.push({local,remote:local});}return planned;
}
export async function buildMobile({profile,task,filter}){
 const tasks=validateAndroidBuildTask(task,filter),p=await readMobileProfile(profile),output=join(MOBILE_ROOT,'outputs/android-mobile-20261026/build-'+randomUUID());await mkdir(output,{recursive:true});
 const ram=Number(execFileSync('powershell.exe',['-NoProfile','-Command','(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'],{encoding:'utf8',windowsHide:true}).trim());if(!Number.isFinite(ram)||ram<3*1024*1024)throw Error('At least 3 GiB free Windows RAM is required before Android build.');
 const config={schema:p.schema,projectId:p.projectId,protocol:p.protocol,host:'127.0.0.1',ports:p.ports,apiKey:'emulator-test-only',appId:'1:1234567890:android:0000000000000000',storageBucket:p.projectId+'.firebasestorage.app'};
 const asset=join(MOBILE_ROOT,'android/app/src/local/assets');await mkdir(asset,{recursive:true});await writeFile(join(asset,'mobile-environment.json'),JSON.stringify(config)+'\n');
 if(task==='assembleDebug'){
  for(const argv of [['scripts/build-mobile-web.mjs'],['node_modules/@capacitor/cli/bin/capacitor','copy','android']]){const run=spawn(process.execPath,argv,{cwd:MOBILE_ROOT,stdio:'ignore',windowsHide:true});const code=await new Promise((done,reject)=>{run.on('error',reject);run.on('close',done);});if(code!==0)throw Error('Source-bound mobile assets could not be prepared.');}
  await readMobileProfile(profile);
 }
 const args=[tasks[0].replace('Debug','LocalDebug'),...tasks.slice(1),'--no-daemon','--max-workers=2','--console=plain','--write-locks','--stacktrace'];
 // Every argument is fixed or validated above and contains no whitespace or
 // cmd metacharacters. Extra quotes are passed literally through gradlew.bat.
 const child=spawn('cmd.exe',['/d','/s','/c','gradlew.bat '+args.join(' ')],{cwd:join(MOBILE_ROOT,'android'),env:{...process.env,ANDROID_HOME:'C:/Users/Home/AppData/Local/Android/Sdk',ANDROID_SDK_ROOT:'C:/Users/Home/AppData/Local/Android/Sdk'},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',b=>{log+=b.toString();});child.stderr.on('data',b=>{log+=b.toString();});
 const timeout=setTimeout(()=>{if(Number.isSafeInteger(child.pid))try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});}catch{child.kill();}},20*60*1000);const status=await new Promise((done,reject)=>{child.on('error',reject);child.on('close',done);});clearTimeout(timeout);await writeFile(join(output,'gradle.log'),log);
 if(status!==0){console.error(log.slice(-6000));throw Error('Android debug build/test failed; full log retained locally.');}
 const receipt={passed:true,task,profileSha256:createHash('sha256').update(await readFile(profile)).digest('hex'),output};
 if(task==='assembleDebug'){const apk=join(MOBILE_ROOT,'android/app/build/outputs/apk/local/debug/app-local-debug.apk');receipt.apk=join(output,'iilas-driver-demo.apk');await copyFile(apk,receipt.apk);receipt.apkSha256=createHash('sha256').update(await readFile(apk)).digest('hex');}
 await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const get=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};buildMobile({profile:get('--profile'),task:get('--task'),filter:get('--tests')}).catch(e=>{console.error(e.message);process.exitCode=1;});}
