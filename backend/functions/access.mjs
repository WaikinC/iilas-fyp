import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {inputText,inputNumber} from './procurementValidation.js';
import {prepareEmptyBusinessCodeBootstrap} from './businessCodeInitialization.mjs';

import {STAFF_ROLES as ROLES,ACCOUNT_ROLES} from './accountRoles.js';
export {ROLES,ACCOUNT_ROLES};
const fail=(message,code='failed-precondition')=>{const error=new Error(message);error.code=code;throw error;};
const now=()=>FieldValue.serverTimestamp();
const label=value=>inputText(value,'Display name',80);
const userRef=uid=>getFirestore().collection('users').doc(uid);
const configRef=()=>getFirestore().doc('system/config');
function event(tx,uid,actor,scope,version,action){tx.set(getFirestore().doc(`auditLogs/users_${uid}_${version}`),{ownerId:scope,actor,kind:'users',recordId:uid,version,action,label:'Account access updated',at:now()});}

export async function registerAccount(auth,input){
  const identity=await getAuth().getUser(auth.uid);
  if(identity.disabled||!identity.email)fail('An active email account is required.','permission-denied');
  const email=identity.email.toLowerCase(),emulator=Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const isBootstrap=email===String(process.env.IILAS_BOOTSTRAP_ADMIN_EMAIL||'').trim().toLowerCase();
  return getFirestore().runTransaction(async tx=>{
    const config=await tx.get(configRef()),saved=await tx.get(userRef(auth.uid)),old=saved.data();
    if(!config.exists&&isBootstrap){
      if(!emulator&&!identity.emailVerified)fail('Verify the configured administrator email before initial setup.');
      const localNumbering=process.env.FUNCTIONS_EMULATOR==='true'&&process.env.GCLOUD_PROJECT==='fyp-inventory-and-logistics'&&process.env.GOOGLE_CLOUD_PROJECT==='fyp-inventory-and-logistics'&&process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8081'&&process.env.FIREBASE_AUTH_EMULATOR_HOST==='127.0.0.1:9099'&&process.env.FIREBASE_STORAGE_EMULATOR_HOST==='127.0.0.1:9199'&&process.env.IILAS_FYP_COMPLETION_MODE==='local-demo';
      const initializeNumbers=localNumbering?await prepareEmptyBusinessCodeBootstrap(tx,auth.uid):null;
      tx.create(configRef(),{dataScopeId:auth.uid,primaryAdminUid:auth.uid,version:1,createdAt:now()});
      if(initializeNumbers)initializeNumbers();
      const version=(old?.version||0)+1;
      tx.set(userRef(auth.uid),{uid:auth.uid,email,displayName:label(input.displayName===undefined?(old?.displayName||'Administrator'):input.displayName),role:'Admin',status:'Approved',active:true,emailVerified:identity.emailVerified,version,createdAt:old?.createdAt||now(),updatedAt:now(),reviewedBy:auth.uid});
      event(tx,auth.uid,auth.uid,auth.uid,version,'Initial administrator');
      return {initialized:true};
    }
    if(old){
      // Registration/profile refresh never grants, restores or changes access.
      const displayName=label(input.displayName===undefined?old.displayName:input.displayName);
      if(displayName!==old.displayName||old.email!==email||old.emailVerified!==identity.emailVerified){
        tx.update(userRef(auth.uid),{displayName,email,emailVerified:identity.emailVerified,version:old.version+1,updatedAt:now()});
      }
    }else{
      tx.create(userRef(auth.uid),{uid:auth.uid,email,displayName:label(input.displayName===undefined?email.split('@')[0]:input.displayName),role:null,status:'Pending',active:false,emailVerified:identity.emailVerified,version:1,createdAt:now(),updatedAt:now()});
    }
    return {initialized:config.exists};
  });
}

export async function approvedTransaction(auth,roles,work,guard){
  // Optional server-owned operation fencing. Existing callers retain identical
  // semantics; live commands use it for retries, protected reads and scheduling.
  return getFirestore().runTransaction(async original=>{
    const tx=guard?guard(original):original;
    const config=await tx.get(configRef()),profile=await tx.get(userRef(auth.uid));
    const account=profile.data();
    if(!config.exists||!account||account.status!=='Approved'||!account.active||!ROLES.includes(account.role)||!roles.includes(account.role))fail('Your account is not approved for this operation.','permission-denied');
    if(guard)guard(original);
    const result=await work(tx,config.data(),account);
    if(guard)guard(original);
    return result;
  });
}

export async function approvedScope(auth,guard){
  return approvedTransaction(auth,ROLES,async(_tx,config)=>config.dataScopeId,guard);
}

export async function updateAccount(auth,input){
  const uid=inputText(input.uid,'Account ID',128),inputVersion=inputNumber(input.version,'account version',1,Number.MAX_SAFE_INTEGER,true);if(!/^[a-zA-Z0-9_-]{1,128}$/.test(uid))fail('Select a valid account.');
  // Auth metadata is authoritative. Do not trust a submitted verified-email flag.
  const identity=await getAuth().getUser(uid);
  return approvedTransaction(auth,['Admin'],async(tx,config)=>{
    const saved=await tx.get(userRef(uid)),old=saved.data();
    if(!old)fail('Account not found.','not-found');
    if(old.version!==inputVersion)fail('This account changed. Refresh and try again.');
    if(!['Approve','Reject','Disable','Update'].includes(input.step))fail('Choose a valid account action.');
    if(uid===config.primaryAdminUid&&(input.step!=='Update'||input.role!=='Admin'))fail('The primary administrator must remain active Admin.');
    if(uid===auth.uid&&(input.step!=='Update'||input.role!=='Admin'))fail('Administrators cannot remove their own access.');
    let status=old.status,active=old.active,role=old.role;
    if(input.step==='Approve'){
      if(old.status==='Approved'&&old.active)fail('This account is already approved.');
      if(identity.disabled||(!process.env.FIREBASE_AUTH_EMULATOR_HOST&&!identity.emailVerified))fail('The account must be enabled and its email verified before approval.');
      if(!ACCOUNT_ROLES.includes(input.role))fail('Choose a valid account role.');
      role=input.role;status='Approved';active=true;
    }else if(input.step==='Reject'){
      if(old.status!=='Pending')fail('Only pending accounts can be rejected.');status='Rejected';active=false;
    }else if(input.step==='Disable'){
      if(old.status!=='Approved'||!old.active)fail('Only approved accounts can be disabled.');status='Disabled';active=false;
    }else{
      if(old.status!=='Approved'||!old.active||!ACCOUNT_ROLES.includes(input.role))fail('Choose an approved account and valid role.');role=input.role;
    }
    const version=old.version+1;
    tx.update(userRef(uid),{displayName:label(input.displayName===undefined?old.displayName:input.displayName),role,status,active,email:identity.email.toLowerCase(),emailVerified:identity.emailVerified,version,reviewedBy:auth.uid,reviewedAt:now(),updatedAt:now()});
    event(tx,uid,auth.uid,config.dataScopeId,version,input.step);
    return {id:uid};
  });
}
