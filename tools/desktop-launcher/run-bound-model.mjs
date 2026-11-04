import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {boundModelEnvironment} from './model-env.mjs';
const app=resolve(fileURLToPath(new URL('../iilas-fyp/',import.meta.url)));
const option=name=>process.argv[process.argv.indexOf(name)+1];
try{
 const role=option('--role'),receipt=option('--receipt');if(!process.argv.includes('--role')||!process.argv.includes('--receipt'))throw Error('Startup options missing');
 const {readSparkPreparation}=await import(pathToFileURL(join(app,'scripts/prepare-spark-msi.mjs'))),loaded=await readSparkPreparation(receipt);
 if(loaded.profile.mode!=='spark-msi'||!loaded.activation||loaded.receipt.testMode)throw Error('Cloud model binding required');
 const env=boundModelEnvironment(loaded.serving.backendEnvironment,role,process.env),prefix='IILAS_'+role.toUpperCase(),manifest=resolve(env[prefix+'_SERVING_MANIFEST']),rel=relative(app,manifest),s=await lstat(manifest);
 if(!rel||rel.startsWith('..')||isAbsolute(rel)||s.isSymbolicLink()||!s.isFile()||s.nlink!==1||s.size>65536||resolve(await realpath(manifest))!==manifest||createHash('sha256').update(await readFile(manifest)).digest('hex')!==env[prefix+'_SERVING_MANIFEST_SHA256'])throw Error('Manifest differs');
 const free=Number(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:15000}))*1024;if(!Number.isFinite(free)||free<3*1024**3)throw Error('Free RAM below model floor');
 const child=spawn('C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe',['-X','utf8',role==='stock'?'research/serve_inventory_context_local_eval.py':'research/serve_delivery_demo_local_eval.py','serve','--port',role==='stock'?'8001':'8002'],{cwd:app,env,windowsHide:true,stdio:'inherit'});
 child.once('error',()=>{console.error('Bound model service could not start; details redacted.');process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
}catch{console.error('Bound model startup refused its current source, artifact, environment or RAM checks; private values redacted.');process.exitCode=1;}