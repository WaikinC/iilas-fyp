import {readFileSync} from 'node:fs';
import {validateDemoEnvironment,LOCAL_DEMO_ENVIRONMENT} from './demoEnvironment.js';
import {trustedSparkRuntime} from './sparkRuntime.mjs';
const unavailable=()=>{throw Object.assign(new Error('The trusted IILAS demo environment is unavailable.'),{code:'unavailable'});};
export function assertDemoRuntime(env,profile){
 try{
  const checked=validateDemoEnvironment(profile,[profile]);
  if(checked.mode==='local-emulator'){
   const p=checked.projectId,expected={FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:p,GOOGLE_CLOUD_PROJECT:p,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',IILAS_FYP_COMPLETION_MODE:'local-demo'};
   if(Object.entries(expected).some(([k,v])=>env[k]!==v))unavailable();
  }else{
   if(Object.keys(env).some(k=>k==='FUNCTIONS_EMULATOR'||k.includes('EMULATOR'))||env.IILAS_DEMO_MODE!=='cloud-demo'||env.IILAS_DEMO_PROJECT_ID!==checked.projectId||(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT)!==checked.projectId||[env.GCLOUD_PROJECT,env.GOOGLE_CLOUD_PROJECT].some(p=>p&&p!==checked.projectId))unavailable();
  }
  return checked;
 }catch{unavailable();}
}
export function trustedDemoEnvironment(env=process.env){
 if(['spark-msi','spark-loopback-test'].includes(env.IILAS_DEMO_MODE))return trustedSparkRuntime(env);
 if(env.IILAS_DEMO_MODE!=='cloud-demo')return assertDemoRuntime(env,LOCAL_DEMO_ENVIRONMENT);
 try{
  // Fixed deployment asset, never a caller-selected path or URL. Generated and ignored.
  const bytes=readFileSync(new URL('./hybrid-runtime.json',import.meta.url));if(bytes.length>16384)unavailable();
  return assertDemoRuntime(env,JSON.parse(bytes.toString('utf8')).profile);
 }catch{unavailable();}
}
export function demoEvidenceBucket(env=process.env){
 const bucket=env.IILAS_DEMO_MODE==='cloud-demo'?trustedDemoEnvironment(env).storageBucket:LOCAL_DEMO_ENVIRONMENT.storageBucket;
 if(env.EVIDENCE_BUCKET!==undefined&&env.EVIDENCE_BUCKET!==bucket)unavailable();return bucket;
}
