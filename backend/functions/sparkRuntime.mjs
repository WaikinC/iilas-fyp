import {sparkExact,validateSparkProfile,validateSparkRuntime} from '../../lib/sparkRuntime.js';
const fail=()=>{throw Error('The private Spark/MSI server configuration failed its deployment bindings.');};
export function validateSparkServerConfig(raw,profile,evidence){
 validateSparkProfile(profile,[profile]);
 sparkExact(raw,['schema','profileSha256','credentialPath','credentialSha256','evidenceRoot','evidenceRootId','servingBindingPath','servingBindingSha256']);
 if(raw.schema!=='iilas-spark-server-1.0'||['profileSha256','credentialSha256','servingBindingSha256'].some(k=>!/^[a-f0-9]{64}$/.test(raw[k]))||['credentialPath','evidenceRoot','servingBindingPath'].some(k=>typeof raw[k]!=='string'||!raw[k]||raw[k].length>1024||/[\x00-\x1f]/.test(raw[k]))||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw.evidenceRootId))fail();
 if(!evidence||evidence.credentialProjectId!==profile.projectId||['profileSha256','credentialSha256','servingBindingSha256','evidenceRootId'].some(k=>evidence[k]!==raw[k])||Object.keys(evidence.env||process.env).some(k=>/EMULATOR|FIREBASE_AUTH_EMULATOR|FIREBASE_STORAGE_EMULATOR/.test(k)))fail();
 return Object.freeze({...raw});
}
let installed=null;
function environmentMatches(env,profile){
 if(env.IILAS_DEMO_MODE!==profile.mode||env.GCLOUD_PROJECT!==profile.projectId||env.GOOGLE_CLOUD_PROJECT!==profile.projectId)fail();
 if(profile.mode==='spark-msi'){if(Object.keys(env).some(k=>k.includes('EMULATOR')))fail();}
 else if(env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8081'||env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199'||env.GOOGLE_APPLICATION_CREDENTIALS||env.FUNCTIONS_EMULATOR!==undefined)fail();
}
export function installSparkRuntime({profile,allowlist,env=process.env,verify,serving=null}){
 if(installed||typeof verify!=='function')fail();const checked=validateSparkRuntime(profile,allowlist);environmentMatches(env,checked);if(verify()!==true)fail();installed=Object.freeze({profile:checked,verify,serving:serving?structuredClone(serving):null});return checked;
}
export function trustedSparkRuntime(env=process.env){if(!installed)fail();environmentMatches(env,installed.profile);if(installed.verify()!==true)fail();return installed.profile;}
export function trustedSparkServing(){trustedSparkRuntime();if(!installed.serving)fail();return structuredClone(installed.serving);}
