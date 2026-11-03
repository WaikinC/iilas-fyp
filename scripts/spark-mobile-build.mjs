import {completionExact} from '../lib/completionWorkflow.js';
import {validateSparkProfile} from '../lib/sparkRuntime.js';
const fail=()=>{throw Error('The source-bound Spark Android packaging options are invalid.');};
export function validateSparkMobileOptions(raw){
 const p=completionExact(raw,['schema','profile','apiKey','appId','fixtureOnly','web']),w=completionExact(p.web,['projectId','apiKey','appId','authDomain']);validateSparkProfile(p.profile,[p.profile]);
 if(p.schema!=='iilas-mobile-spark-build-1.0'||typeof p.fixtureOnly!=='boolean'||w.projectId!==p.profile.projectId||w.authDomain!==p.profile.projectId+'.firebaseapp.com'||!/^1:[0-9]+:android:[a-f0-9]{16,40}$/.test(p.appId)||!/^1:[0-9]+:web:[a-f0-9]{16,40}$/.test(w.appId))fail();
 if(p.fixtureOnly){if(p.apiKey!=='spark-fixture-not-connectable'||w.apiKey!==p.apiKey||!p.profile.apiOrigin.endsWith('.invalid'))fail();}else if(!/^AIza[A-Za-z0-9_-]{35}$/.test(p.apiKey)||!/^AIza[A-Za-z0-9_-]{35}$/.test(w.apiKey))fail();return p;
}
export function makeSparkMobileAssets(raw){const p=validateSparkMobileOptions(raw);return {native:{schema:'iilas-mobile-spark-msi-1.0',projectId:p.profile.projectId,protocol:'mobile-command-1.0',apiKey:p.apiKey,appId:p.appId,fixtureOnly:p.fixtureOnly,apiOrigin:p.profile.apiOrigin,backendInstanceId:p.profile.backendInstanceId},web:{...p.web,apiOrigin:p.profile.apiOrigin,backendInstanceId:p.profile.backendInstanceId}};}
