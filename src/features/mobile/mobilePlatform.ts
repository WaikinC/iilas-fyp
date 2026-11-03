import {Capacitor,registerPlugin} from '@capacitor/core';
import {createMobileClient,type MobileClient} from '../../../lib/mobilePlatformClient.js';
declare const __IILAS_MOBILE_MODE__:'local'|'cloud-demo'|'spark-msi';
declare const __IILAS_MOBILE_OPTIONS__:{projectId:string;apiKey:string;appId:string;authDomain:string;apiOrigin?:string;backendInstanceId?:string};
declare const __IILAS_MOBILE_FIXTURE_ONLY__:boolean;

export function createAndroidClient():MobileClient {
 if(!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='android')throw Error('Open this build in the local IILAS Android app.');
 const bridge=registerPlugin('IilasMobile');
 if(typeof __IILAS_MOBILE_MODE__==='undefined')throw Error('The packaged mobile environment is missing.');
 const local=__IILAS_MOBILE_MODE__==='local',options=__IILAS_MOBILE_OPTIONS__;
 const spark=__IILAS_MOBILE_MODE__==='spark-msi';const expectedEnvironment={schema:spark?'iilas-mobile-spark-msi-1.0':local?'iilas-mobile-local-1.0':'iilas-mobile-cloud-demo-1.0',projectId:options.projectId,protocol:'mobile-command-1.0',localOnly:local,...(spark?{mode:'spark-msi' as const,apiOrigin:options.apiOrigin,backendInstanceId:options.backendInstanceId}:{})};
 return createMobileClient({bridge,expectedEnvironment,openWebAuth:async()=>{
  if(__IILAS_MOBILE_FIXTURE_ONLY__)throw Error('This offline packaging fixture cannot connect to Firebase.');
  // The client calls this factory only after the native local environment has
  // passed validation. No transferred private Firebase key enters the APK.
  const [{initializeApp,getApps},{getAuth,connectAuthEmulator,signInWithCustomToken,signOut}]=await Promise.all([import('firebase/app'),import('firebase/auth')]);
  const name=spark?'iilas-driver-spark-web':__IILAS_MOBILE_MODE__==='local'?'iilas-driver-local-web':'iilas-driver-cloud-web';const old=getApps().find(app=>app.name===name);if(old&&old.options.projectId!==options.projectId)throw Error('The mobile Firebase project changed.');const app=old||initializeApp(options,name);
  const auth=getAuth(app);if(__IILAS_MOBILE_MODE__==='local')connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});await auth.authStateReady();
  return {uid:()=>auth.currentUser?.uid??null,signInToken:async(token:string)=>(await signInWithCustomToken(auth,token)).user.uid,signOut:()=>signOut(auth)};
 }});
}
