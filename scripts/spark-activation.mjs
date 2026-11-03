import {readFile,lstat} from 'node:fs/promises';
import {resolve,parse,join} from 'node:path';
import {createPrivateKey} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {sparkExact,validateSparkProfile} from '../lib/sparkRuntime.js';
import {sparkHash,readSparkPrivate} from './spark-private-files.mjs';
import {completionCanonical} from '../lib/completionWorkflow.js';
const fail=()=>{throw Error('Spark cloud activation requires exact approved identities, private credential and unchanged bindings.');};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const SPARK_CREDENTIAL_PATH='C:/Users/Home/AppData/Local/IILAS/credentials/firebase-msi-demo.json';
// The Microsoft Store agent redirects the logical AppData path here. Use the
// physical path for both the native agent and Node so they verify the same bytes.
export const SPARK_NGROK_CONFIGURATION_PATH='C:/Users/Home/AppData/Local/Packages/ngrok.ngrok_1g87z0zv29zzc/LocalCache/Local/IILAS/credentials/ngrok.yml';
export function sparkRuntimeActivationDigest(raw){const payload={...raw};delete payload.manifestSha256;return sparkHash(Buffer.from(completionCanonical(payload)));}
export function validateSparkActivation(packet,{profile,pins,approval}){
 validateSparkProfile(profile,[profile]);
 sparkExact(packet,['schema','projectId','backendInstanceId','apiOrigin','webOrigin','adoptionSha256','billingMustRemainDisabled','pins','manifestSha256','approvedActions','fixtureOnly','cutover']);
 sparkExact(pins,['profileSha256','sourcesSha256','credentialSha256','servingSha256','frozenSha256','evidenceRootId']);sparkExact(packet.pins,Object.keys(pins));
 if(packet.schema!=='iilas-spark-runtime-activation-1.0'||packet.fixtureOnly!==false||packet.billingMustRemainDisabled!==true||!hash(packet.manifestSha256)||packet.projectId!==profile.projectId||packet.backendInstanceId!==profile.backendInstanceId||packet.apiOrigin!==profile.apiOrigin||packet.webOrigin!==profile.webOrigins[0]||packet.adoptionSha256!==profile.adoptionSha256||Object.keys(pins).some(k=>pins[k]!==packet.pins[k])||Object.entries(pins).some(([k,v])=>k!=='evidenceRootId'&&!hash(v)))fail();
 sparkExact(approval,['schema','manifestSha256','approvedActions','billingMustRemainDisabled']);
 if(approval.schema!=='iilas-spark-cutover-approval-1.0'||approval.manifestSha256!==packet.manifestSha256||packet.manifestSha256!==sparkRuntimeActivationDigest(packet)||approval.billingMustRemainDisabled!==true||!Array.isArray(packet.approvedActions)||!packet.approvedActions.includes('runtime')||new Set(packet.approvedActions).size!==packet.approvedActions.length||packet.approvedActions.some(a=>!['runtime','public-https','cloud-commands','bootstrap'].includes(a))||JSON.stringify(approval.approvedActions)!==JSON.stringify(packet.approvedActions))fail();
 if(packet.approvedActions.includes('cloud-commands')){
  const c=sparkExact(packet.cutover,['primaryAdminUid','baseline','publication']);if(typeof c.primaryAdminUid!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(c.primaryAdminUid))fail();
  for(const [name,pin]of Object.entries({baseline:c.baseline,publication:c.publication})){sparkExact(pin,name==='publication'?['path','sha256','manifestSha256']:['path','sha256']);if(typeof pin.path!=='string'||!hash(pin.sha256)||name==='publication'&&!hash(pin.manifestSha256))fail();}
 }else if(packet.cutover!==null||packet.approvedActions.includes('bootstrap'))fail();
 return Object.freeze(structuredClone(packet));
}
export function validateSparkCredential(bytes,expectedHash){
 if(!Buffer.isBuffer(bytes)||bytes.length>32768||!hash(expectedHash)||sparkHash(bytes)!==expectedHash)fail();let c;try{c=JSON.parse(bytes.toString('utf8'));}catch{fail();}
 if(c.type!=='service_account'||c.project_id!=='fyp-inventory-and-logistics'||c.client_email!=='iilas-msi-demo@fyp-inventory-and-logistics.iam.gserviceaccount.com'||typeof c.private_key_id!=='string'||!c.private_key_id||c.token_uri!=='https://oauth2.googleapis.com/token')fail();
 try{const key=createPrivateKey(c.private_key);if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)fail();}catch{fail();}return c;
}
export async function readSparkCredential(path,expectedHash){
 if(process.platform!=='win32'||typeof path!=='string'||resolve(path)!==resolve(SPARK_CREDENTIAL_PATH))fail();
 const absolute=resolve(path),root=parse(absolute).root;let current=root;
 for(const piece of absolute.slice(root.length).split(/[\\/]/)){current=join(current,piece);const s=await lstat(current);if(s.isSymbolicLink()||s.isFile()&&(s.nlink!==1||s.size>32768))fail();}
 assertSparkWindowsPrivateAcl(path);
 return validateSparkCredential(await readFile(absolute),expectedHash);
}
export function assertSparkWindowsPrivateAcl(path){
 if(process.platform!=='win32'||![SPARK_CREDENTIAL_PATH,SPARK_NGROK_CONFIGURATION_PATH].some(p=>resolve(p)===resolve(path)))fail();
 const check="$ErrorActionPreference='Stop'; $p='"+resolve(path)+"'; $allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18'); foreach($target in @((Split-Path -Parent $p),$p)){ $a=Get-Acl -LiteralPath $target; $r=$a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]); if($r.Count -ne 2 -or @($r|Where-Object {$_.IdentityReference.Value -notin $allowed -or $_.AccessControlType -ne 'Allow'}).Count -ne 0){throw 'Restricted credential ACL required'} }; Write-Output 'OK'";
 if(execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',check],{encoding:'utf8',windowsHide:true,env:{...process.env,PSModulePath:'C:/Windows/System32/WindowsPowerShell/v1.0/Modules'},stdio:['ignore','pipe','pipe']}).trim()!=='OK')fail();
 return true;
}
export function sparkActivationPins(receipt,config){return {profileSha256:receipt.profile.sha256,sourcesSha256:receipt.sources.sha256,credentialSha256:config.credentialSha256,servingSha256:receipt.serving.sha256,frozenSha256:receipt.frozenPins.sha256,evidenceRootId:receipt.evidenceRootId};}
export async function readSparkActivation(binding,{receipt,profile,serverConfig}){
 sparkExact(binding,['packet','approval']);for(const p of [binding.packet,binding.approval]){sparkExact(p,['path','sha256']);if(!hash(p.sha256))fail();}
 const pb=await readSparkPrivate(binding.packet.path),ab=await readSparkPrivate(binding.approval.path);if(sparkHash(pb)!==binding.packet.sha256||sparkHash(ab)!==binding.approval.sha256)fail();
 return validateSparkActivation(JSON.parse(pb),{profile,pins:sparkActivationPins(receipt,serverConfig),approval:JSON.parse(ab)});
}
