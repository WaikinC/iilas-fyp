import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {completionExact} from '../lib/completionWorkflow.js';
import {validateSparkRuntime} from '../lib/sparkRuntime.js';
import {SPARK_ROOT,sparkHash,sparkSourcePath,readSparkPrivate,collectSparkSources,verifySparkPins} from './spark-private-files.mjs';
import {readSparkActivation,readSparkCredential} from './spark-activation.mjs';
import {validateSparkServerConfig} from '../backend/functions/sparkRuntime.mjs';
const fail=()=>{throw Error('The MSI preparation is incomplete, changed or not approved for activation.');};
const pin=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validateSparkLaunchReceipt(raw,{allowUnactivated=false}={}){
 const r=completionExact(raw,['schema','testMode','profile','serverConfig','serving','sources','frozenPins','evidenceRootId','backendInstanceId','activation','outputRoot']);
 if(r.schema!=='iilas-spark-preparation-1.0'||typeof r.testMode!=='boolean'||!r.testMode&&!r.activation&&!allowUnactivated||r.testMode&&r.activation)fail();
 for(const k of ['profile','serverConfig','serving','sources','frozenPins']){completionExact(r[k],['path','sha256']);if(!pin(r[k].sha256))fail();sparkSourcePath(r[k].path);}return r;
}
export async function prepareSparkMsi({profilePath,serverConfigPath,outputRoot,testMode}){
 const profileBytes=await readSparkPrivate(profilePath),profile=JSON.parse(profileBytes),checked=validateSparkRuntime(profile,[profile]),configBytes=await readSparkPrivate(serverConfigPath),config=JSON.parse(configBytes);
 if(typeof testMode!=='boolean'||testMode!==(checked.mode==='spark-loopback-test'))fail();
 if(testMode){completionExact(config,['schema','profileSha256','evidenceRoot','evidenceRootId','servingBindingPath','servingBindingSha256']);if(config.schema!=='iilas-spark-loopback-launch-input-1.0'||config.profileSha256!==sparkHash(profileBytes))fail();}
 else {const credential=await readSparkCredential(config.credentialPath,config.credentialSha256);validateSparkServerConfig(config,checked,{credentialProjectId:credential.project_id,profileSha256:sparkHash(profileBytes),credentialSha256:config.credentialSha256,servingBindingSha256:config.servingBindingSha256,evidenceRootId:config.evidenceRootId,env:{}});}
 const servingBytes=await readSparkPrivate(config.servingBindingPath),serving=JSON.parse(servingBytes);if(sparkHash(servingBytes)!==config.servingBindingSha256||serving.schema!=='iilas-spark-serving-binding-1.0')fail();
 const frozen=JSON.parse(await readSparkPrivate('outputs/hybrid-demo-20261027/source-preservation-final.json'));if(frozen.passed!==true||Object.keys(frozen.frozenArtefacts||{}).length!==11)fail();verifySparkPins(frozen.frozenArtefacts);
 const output=sparkSourcePath(outputRoot);if(!output.startsWith(resolve(SPARK_ROOT,'outputs/spark-msi-demo-20261028')+'/')&&!output.startsWith(resolve(SPARK_ROOT,'outputs/spark-msi-demo-20261028')+'\\'))fail();await mkdir(output,{recursive:false});
 const sourceBytes=Buffer.from(JSON.stringify(collectSparkSources())),frozenBytes=Buffer.from(JSON.stringify(frozen.frozenArtefacts));await writeFile(join(output,'sources.private.json'),sourceBytes,{flag:'wx'});await writeFile(join(output,'frozen.private.json'),frozenBytes,{flag:'wx'});
 const receipt={schema:'iilas-spark-preparation-1.0',testMode,profile:{path:sparkSourcePath(profilePath),sha256:sparkHash(profileBytes)},serverConfig:{path:sparkSourcePath(serverConfigPath),sha256:sparkHash(configBytes)},serving:{path:sparkSourcePath(config.servingBindingPath),sha256:sparkHash(servingBytes)},sources:{path:join(output,'sources.private.json'),sha256:sparkHash(sourceBytes)},frozenPins:{path:join(output,'frozen.private.json'),sha256:sparkHash(frozenBytes)},evidenceRootId:config.evidenceRootId,backendInstanceId:checked.backendInstanceId,activation:null,outputRoot:output};
 await writeFile(join(output,'preparation.private.json'),JSON.stringify(receipt,null,2),{flag:'wx'});return {path:join(output,'preparation.private.json'),sha256:sparkHash(Buffer.from(JSON.stringify(receipt,null,2))),testMode,activationReady:false};
}
export async function readSparkPreparation(path,{allowUnactivated=false}={}){const receipt=validateSparkLaunchReceipt(JSON.parse(await readSparkPrivate(path)),{allowUnactivated}),values={};for(const kind of ['profile','serverConfig','serving','sources','frozenPins']){const bytes=await readSparkPrivate(receipt[kind].path);if(sparkHash(bytes)!==receipt[kind].sha256)fail();values[kind]=JSON.parse(bytes);}validateSparkRuntime(values.profile,[values.profile]);verifySparkPins(values.sources);verifySparkPins(values.frozenPins);if(receipt.backendInstanceId!==values.profile.backendInstanceId||receipt.testMode!==(values.profile.mode==='spark-loopback-test')||receipt.evidenceRootId!==values.serverConfig.evidenceRootId||values.serverConfig.profileSha256!==receipt.profile.sha256||values.serverConfig.servingBindingSha256!==receipt.serving.sha256)fail();if(!receipt.testMode&&receipt.activation)values.activation=await readSparkActivation(receipt.activation,{receipt,...values});return {receipt,...values};}
