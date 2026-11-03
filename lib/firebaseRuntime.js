import {initializeApp,getApps} from 'firebase/app';
import {getAuth,connectAuthEmulator} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator} from 'firebase/functions';
import {getStorage,connectStorageEmulator} from 'firebase/storage';
import config from '../firebase-config.json' with {type:'json'};
import profile from '../demo-environment.json' with {type:'json'};
import allowlist from '../demo-allowlist.json' with {type:'json'};
import {validateDemoEnvironment,initialiseDemoSDKs,projectRecoveryStorage} from './demoEnvironment.js';
import {validateSparkRuntime,initialiseSparkSDKs,sparkRecoveryKey,sparkRecordCreationRecoveryKey} from './sparkRuntime.js';
import {createSparkTransport} from './sparkTransport.js';
const spark=['spark-msi','spark-loopback-test'].includes(profile.mode);
export const demoEnvironment=spark?validateSparkRuntime(profile,allowlist):validateDemoEnvironment(profile,allowlist);
export const configured=Boolean(config.apiKey&&config.projectId&&config.appId);
export const projectId=config.projectId;
const origin=typeof window==='undefined'?profile.webOrigins[0]:window.location.origin;
const factories={initialise:initializeApp,auth:getAuth,firestore:getFirestore,functions:getFunctions,storage:getStorage,connect:(sdk,point,kind)=>{
 if(kind==='auth')connectAuthEmulator(sdk,`http://${point.host}:${point.port}`,{disableWarnings:true});
 else if(kind==='firestore')connectFirestoreEmulator(sdk,point.host,point.port);
 else if(kind==='functions')connectFunctionsEmulator(sdk,point.host,point.port);
 else connectStorageEmulator(sdk,point.host,point.port);
}};
const sdk=configured?(spark?initialiseSparkSDKs({profile,allowlist,options:config,origin,existing:getApps().find(a=>a.name===`iilas.${profile.mode}.${profile.projectId}`),factories}):initialiseDemoSDKs({profile,allowlist,options:config,origin,existing:getApps().find(a=>a.name==='[DEFAULT]'),factories})):null;
export const auth=sdk?.auth||null,db=sdk?.db||null,functions=sdk?.functions||null,storage=sdk?.storage||null;
export const sparkTransport=spark&&auth?createSparkTransport({profile:demoEnvironment,auth}):null;
function recoveryKey(key){if(!auth?.currentUser?.uid)throw Error('Sign in with the original account before recovering saved work.');return sparkRecoveryKey(demoEnvironment,auth.currentUser.uid,key);}
export const sessionRecoveryStorage={getItem:key=>spark?window.sessionStorage.getItem(recoveryKey(key)):projectRecoveryStorage(window.sessionStorage,demoEnvironment).getItem(key),setItem:(key,value)=>spark?window.sessionStorage.setItem(recoveryKey(key),value):projectRecoveryStorage(window.sessionStorage,demoEnvironment).setItem(key,value),removeItem:key=>spark?window.sessionStorage.removeItem(recoveryKey(key)):projectRecoveryStorage(window.sessionStorage,demoEnvironment).removeItem(key)};
function creationKey(key){if(!auth?.currentUser?.uid)throw Error('Sign in with the original account before recovering saved creation.');return sparkRecordCreationRecoveryKey(demoEnvironment,auth.currentUser.uid,key);}
export const recordCreationRecoveryStorage={getItem:key=>spark?window.sessionStorage.getItem(creationKey(key)):projectRecoveryStorage(window.sessionStorage,demoEnvironment).getItem(key),setItem:(key,value)=>spark?window.sessionStorage.setItem(creationKey(key),value):projectRecoveryStorage(window.sessionStorage,demoEnvironment).setItem(key,value),removeItem:key=>spark?window.sessionStorage.removeItem(creationKey(key)):projectRecoveryStorage(window.sessionStorage,demoEnvironment).removeItem(key)};
