import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
if(process.env.GCLOUD_PROJECT!=='fyp-inventory-and-logistics'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8081')throw Error('Exact local emulator tuple required.');
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),admin=require('firebase-admin/app'),app=admin.initializeApp({projectId:'fyp-inventory-and-logistics'},'mobile-rules-'+randomUUID()),db=require('firebase-admin/firestore').getFirestore(app);
const kinds=['mobileRequests','mobileTrackingSessions','mobileEvidenceRequests'],roles=['Admin','Driver','Viewer','Customer','Pending'],prefix='mobile_rules_'+randomUUID().replaceAll('-',''),owned=[],clients=[];
let checks=0;
try{
 const scope=(await db.doc('system/config').get()).data().dataScopeId;
 for(const role of roles){const uid=prefix+'_'+role,r=db.doc('users/'+uid),value={uid,role:role==='Pending'?null:role,status:role==='Pending'?'Pending':'Approved',active:role!=='Pending',version:1};assert.equal((await r.get()).exists,false);await r.create(value);owned.push({r,value});}
 for(const kind of kinds){const r=db.doc(kind+'/'+prefix),value={ownerId:scope,actor:prefix+'_Driver',version:1};assert.equal((await r.get()).exists,false);await r.create(value);owned.push({r,value});}
 for(const role of [...roles,null]){
  const client=initializeApp({projectId:'fyp-inventory-and-logistics',apiKey:'emulator-test-only'},'mobile-rules-'+randomUUID());clients.push(client);const data=getFirestore(client),uid=role?prefix+'_'+role:null;
  connectFirestoreEmulator(data,'127.0.0.1',8081,uid?{mockUserToken:{sub:uid,user_id:uid}}:{});
  const denied=p=>assert.rejects(p,e=>e.code==='permission-denied');
  for(const kind of kinds){const target=doc(data,kind,prefix);await denied(getDoc(target));await denied(getDocs(collection(data,kind)));await denied(setDoc(doc(data,kind,prefix+'_forged'),{ownerId:scope,actor:uid}));await denied(updateDoc(target,{actor:uid,extra:'x'.repeat(1000)}));await denied(deleteDoc(target));checks+=5;}
 }
 console.log(JSON.stringify({passed:true,checks,privateCollections:3,directAccess:false}));
}finally{
 await Promise.all(clients.map(deleteApp));for(const {r,value}of owned.reverse()){assert.deepEqual((await r.get()).data(),value,'Refuse changed fixture cleanup');await r.delete();}await admin.deleteApp(app);
}
