// One existing loopback emulator only. Mock rule identities do not create Auth accounts.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {randomUUID} from 'node:crypto';
const assertFails=promise=>assert.rejects(promise,error=>error.code==='permission-denied');
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,query,where,limit,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
const projectId='fyp-inventory-and-logistics';
if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8081')throw Error('Use the configured loopback emulator.');
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),adminApps=require('firebase-admin/app'),adminApp=adminApps.initializeApp({projectId},'completion-rules-'+randomUUID()),adminDB=require('firebase-admin/firestore').getFirestore(adminApp),apps=[];
const env={withSecurityRulesDisabled:work=>work({firestore:()=>adminDB}),async cleanup(){await Promise.all(apps.map(app=>deleteApp(app)));await adminApps.deleteApp(adminApp);}};
function client(uid){const app=initializeApp({projectId,apiKey:'emulator-test-only'},'completion-rules-'+randomUUID());apps.push(app);const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8081,uid?{mockUserToken:{sub:uid,user_id:uid}}:undefined);return db;}
// Only the known disposable fixture paths below are privileged.
const privileged={doc:(kind,key)=>adminDB.collection(kind).doc(key)};
const id='completion_rules_'+randomUUID().replaceAll('-',''),seed={ownerId:'fixture_only',actor:id,state:'Completed',version:1},roles=['Admin','Manager','Inventory','Warehouse','Logistics','Driver','Viewer','Pending'];
const integrity=process.argv.includes('--integrity'),privateKinds=integrity?['completionRequests','integrityRequests','integrityLocks']:['completionRequests'],publicKinds=integrity?['integrityChecks','integrityExceptions','integrityReviewEvents']:[];
const owned=[];let tests=0;
try{
 const scope=(await adminDB.doc('system/config').get()).data()?.dataScopeId;assert.equal(typeof scope,'string');
 await env.withSecurityRulesDisabled(async()=>{
  for(const kind of [...privateKinds,...publicKinds]){const value={...seed,ownerId:publicKinds.includes(kind)?scope:seed.ownerId},r=privileged.doc(kind,id);assert.equal((await r.get()).exists,false);await r.create(value);owned.push([kind,id,value]);}
  for(const role of roles){const uid=id+'_'+role,value={uid,role:role==='Pending'?null:role,status:role==='Pending'?'Pending':'Approved',active:role!=='Pending',version:1};const r=privileged.doc('users',uid);assert.equal((await r.get()).exists,false);await r.create(value);owned.push(['users',uid,value]);}
 });
 for(const role of [null,...roles]){
  const db=client(role?id+'_'+role:null);
  if(role&&role!=='Pending')assert.equal((await getDoc(doc(db,'system','config'))).exists(),true,'Positive staff-read control');
  else await assertFails(getDoc(doc(db,'system','config')));
  for(const kind of [...privateKinds,...publicKinds]){
   const r=doc(db,kind,id),canRead=publicKinds.includes(kind)&&role&&role!=='Pending';
   if(canRead){assert.equal((await getDoc(r)).exists(),true);assert((await getDocs(query(collection(db,kind),where('ownerId','==',scope),limit(1)))).size>0);}
   else {await assertFails(getDoc(r));await assertFails(getDocs(query(collection(db,kind),where('ownerId','==',scope),limit(1))));}
   await assertFails(setDoc(doc(db,kind,id+'_forged'),{...seed,actor:'other',extra:'x'.repeat(100000)}));
   await assertFails(updateDoc(r,{ownerId:'other',version:-1,extra:'pollution'}));await assertFails(deleteDoc(r));tests+=5;
  }
 }
 console.log(JSON.stringify({passed:true,checks:tests,privateCollections:privateKinds.length,publicCollections:publicKinds.length,coverage:'seven staff roles/pending/signed-out; private denied, public staff reads allowed, all direct writes denied'}));
}finally{
 await env.withSecurityRulesDisabled(async()=>{for(const [kind,key,value]of owned.reverse()){const r=privileged.doc(kind,key),now=await r.get();assert.deepEqual(now.data(),value,'Refuse to remove changed fixture');await r.delete();}for(const kind of [...privateKinds,...publicKinds])assert.equal((await privileged.doc(kind,id+'_forged').get()).exists,false);});
 await env.cleanup();
}
