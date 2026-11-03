import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateDeviceMappingPlan} from './mobile-build.mjs';
import {mobileEvidenceDirectory} from './mobile-test-output.mjs';
const adb='C:/Users/Home/AppData/Local/Android/Sdk/platform-tools/adb.exe';
export function androidDevices(){return execFileSync(adb,['devices'],{encoding:'utf8',windowsHide:true}).split(/\r?\n/).slice(1).filter(x=>x.trim()).map(x=>{const [serial,state]=x.trim().split(/\s+/);return {serial,state};});}
export async function prepareDevice(serial){
 const devices=androidDevices();if(!serial||!devices.some(d=>d.serial===serial&&d.state==='device'))throw Error('USB authorisation and explicit device serial are required.');
 const before=execFileSync(adb,['-s',serial,'reverse','--list'],{encoding:'utf8',windowsHide:true}),mappings=before.trim().split(/\r?\n/).filter(Boolean).map(x=>{const p=x.trim().split(/\s+/);return {local:p.at(-2),remote:p.at(-1)};}),owned=validateDeviceMappingPlan(serial,devices,mappings),directory=await mobileEvidenceDirectory('usb-mappings');
 await writeFile(resolve(directory,'before.json'),JSON.stringify({serial,mappings,planned:owned},null,2)+'\n',{flag:'wx'});
 for(const m of owned)execFileSync(adb,['-s',serial,'reverse',m.local,m.remote],{windowsHide:true});await writeFile(resolve(directory,'receipt.json'),JSON.stringify({serial,owned},null,2)+'\n',{flag:'wx'});return {mapped:owned.length,directory};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const index=process.argv.indexOf('--serial');if(index<0)console.log(JSON.stringify({devices:androidDevices(),mappingChanged:false}));else prepareDevice(process.argv[index+1]).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1;});}
