import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {readSparkPreparation} from '../../scripts/prepare-spark-msi.mjs';
import {verifySparkPins} from '../../scripts/spark-private-files.mjs';
import {installSparkRuntime,validateSparkServerConfig} from '../../backend/functions/sparkRuntime.mjs';
import {readSparkCredential} from '../../scripts/spark-activation.mjs';
import {createMsiEvidenceStore} from './files.mjs';
import {createMsiBackend} from './server.mjs';
import {createSparkCloudAuthority,createSparkApprovedDispatcher,createSparkBootstrapVerifier} from './cutover.mjs';
export function sparkLaunchEnvironment({profile,serving,activation,inherited=process.env}){
 if(profile.mode==='spark-msi'&&Object.keys(inherited).some(k=>k.includes('EMULATOR')||k==='GOOGLE_APPLICATION_CREDENTIALS'))throw Error('Cloud startup refuses inherited emulator or ambient credential settings.');
 const env={...inherited};for(const k of Object.keys(env))if(k.includes('EMULATOR')||/^(IILAS_|RESEARCH_API_|GOOGLE_APPLICATION_CREDENTIALS)/.test(k))delete env[k];
 const allowed=/^(IILAS_(STOCK_|DELIVERY_|REGISTRY_|RPC_URL$|CHAIN_ID$|MOBILE_DEMO$|FYP_COMPLETION_MODE$)|EVIDENCE_BUCKET$)/;
 for(const [k,v]of Object.entries(serving.backendEnvironment))if(allowed.test(k)&&typeof v==='string')env[k]=v;
 Object.assign(env,{IILAS_DEMO_MODE:profile.mode,GCLOUD_PROJECT:profile.projectId,GOOGLE_CLOUD_PROJECT:profile.projectId,IILAS_MOBILE_DEMO:'enabled'});
 if(profile.mode==='spark-msi'&&activation?.approvedActions?.includes('bootstrap'))env.IILAS_BOOTSTRAP_ADMIN_EMAIL='choongkin6@gmail.com';
 if(profile.mode==='spark-loopback-test')Object.assign(env,{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'});
 return env;
}
export async function launchSparkMsi({receiptPath}){
 const loaded=await readSparkPreparation(receiptPath),{receipt,profile,serverConfig,serving}=loaded;
 if(!receipt.testMode&&!loaded.activation)throw Error('Cloud startup requires the exact approved activation packet.');
 if(serving.schema!=='iilas-spark-serving-binding-1.0'||!serving.backendEnvironment||typeof serving.backendEnvironment!=='object')throw Error('Missing private serving bindings.');
 const env=sparkLaunchEnvironment({profile,serving,activation:loaded.activation}),credential=receipt.testMode?null:await readSparkCredential(serverConfig.credentialPath,serverConfig.credentialSha256);
 if(credential)validateSparkServerConfig(serverConfig,profile,{profileSha256:receipt.profile.sha256,credentialSha256:serverConfig.credentialSha256,credentialProjectId:credential.project_id,servingBindingSha256:receipt.serving.sha256,evidenceRootId:receipt.evidenceRootId,env});
 for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);
 installSparkRuntime({profile,allowlist:[profile],serving,verify:()=>verifySparkPins(loaded.sources)&&verifySparkPins(loaded.frozenPins)});
 const adminRequire=createRequire(new URL('../../backend/functions/package.json',import.meta.url));
 const {initializeApp,getApps,cert}=adminRequire('firebase-admin/app');if(getApps().length)throw Error('Refuse a pre-existing Admin app.');const sdkCredential=credential?cert(credential):null;initializeApp({projectId:profile.projectId,...(sdkCredential?{credential:sdkCredential}:{})});
 const {getAuth}=adminRequire('firebase-admin/auth');
 const {installMsiEvidenceProvider}=await import('../../backend/functions/evidenceProvider.mjs'),{createMsiEvidenceRoutes}=await import('../../backend/functions/msiEvidenceUploads.mjs');
 const store=await createMsiEvidenceStore({root:serverConfig.evidenceRoot,rootId:serverConfig.evidenceRootId,backendInstanceId:profile.backendInstanceId});installMsiEvidenceProvider(store);
 const {executeCommand}=await import('../../backend/functions/service.mjs');
 const {getFirestore}=adminRequire('firebase-admin/firestore'),options={profile,activation:loaded.activation,executeCommand,readConfiguration:async()=>{const s=await getFirestore().doc('system/config').get();return s.exists?s.data():null;},verifyBootstrap:receipt.testMode?async()=>true:createSparkBootstrapVerifier({identity:getAuth(),credential:sdkCredential})},authorise=createSparkCloudAuthority(options),dispatch=createSparkApprovedDispatcher({...options,authorise}),routes=createMsiEvidenceRoutes({provider:store});
 const server=createMsiBackend({runtime:profile,verifyIdToken:(token,revoked)=>getAuth().verifyIdToken(token,revoked),executeCommand:dispatch,evidenceRoutes:async context=>{await authorise(context.auth,{action:'evidence',input:{}});return routes(context);}});
 try{await new Promise((yes,no)=>{server.once('error',no);server.listen(8011,'127.0.0.1',yes);});}catch(e){await store.close();throw e;}
 const stop=()=>server.close(()=>store.close().finally(()=>process.exit(0)));process.once('SIGINT',stop);process.once('SIGTERM',stop);
 return {pid:process.pid,port:8011,host:'127.0.0.1',mode:profile.mode,backendInstanceId:profile.backendInstanceId,cloudConnectivity:!receipt.testMode};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const i=process.argv.indexOf('--receipt');launchSparkMsi({receiptPath:i>=0?process.argv[i+1]:null}).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('The private MSI launch failed its bindings or local readiness.');process.exitCode=1;});}
