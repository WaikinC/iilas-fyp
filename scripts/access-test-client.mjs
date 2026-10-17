// Disposable emulator clients only. Never provision production accounts here.
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getStorage,connectStorageEmulator} from 'firebase/storage';
import config from '../firebase-config.json' with {type:'json'};

process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8081';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url));
const adminApp=require('firebase-admin/app'),adminStore=require('firebase-admin/firestore');
const fixtureApp=adminApp.initializeApp({projectId:config.projectId},`fixture-${randomUUID()}`);
export const fixtureDB=adminStore.getFirestore(fixtureApp);
export const suffix=randomUUID().slice(0,8);
export const barcode=(n=0)=>`${parseInt(suffix,16)}${String(n).padStart(4,'0')}`.padStart(13,'0');
const clients=[];
async function connect(name,email){
  const app=initializeApp(config,`${name}-${randomUUID()}`),auth=getAuth(app),db=getFirestore(app),fn=getFunctions(app,'asia-southeast1'),storage=getStorage(app);
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8081);connectFunctionsEmulator(fn,'127.0.0.1',5001);connectStorageEmulator(storage,'127.0.0.1',9199);
  let credentials;try{credentials=await createUserWithEmailAndPassword(auth,email,'LocalTestPassword123!');}catch(e){if(e.code!=='auth/email-already-in-use')throw e;credentials=await signInWithEmailAndPassword(auth,email,'LocalTestPassword123!');}
  const c={app,auth,db,storage,email,uid:credentials.user.uid,call:async(action,input={},workspaceId)=>(await httpsCallable(fn,'command')({action,input:action==='stock'&&!Object.hasOwn(input,'operationId')?{...input,operationId:randomUUID()}:input,...(workspaceId?{workspaceId}:{})})).data};clients.push(c);return c;
}
export const admin=await connect('PrimaryAdmin','choongkin6@gmail.com');
await admin.call('registerAccount',{displayName:'IILAS Administrator'});
export const scope=(await getDoc(doc(admin.db,'system','config'))).data().dataScopeId;
export async function client(role,approved=true){
  const c=await connect(role,`${role.toLowerCase()}-${suffix}-${randomUUID().slice(0,4)}@example.test`);
  await c.call('registerAccount',{displayName:`QA ${role}`});
  if(approved){const profile=(await getDoc(doc(admin.db,'users',c.uid))).data();await admin.call('updateAccount',{uid:c.uid,version:profile.version,step:'Approve',role:role==='Outsider'?'Viewer':role});}
  return c;
}
export const snapshot=async(kind,key,c=admin)=>({id:key,...(await getDoc(doc(c.db,kind,key))).data()});
export async function close(){await Promise.all(clients.map(c=>deleteApp(c.app)));await adminApp.deleteApp(fixtureApp);}
