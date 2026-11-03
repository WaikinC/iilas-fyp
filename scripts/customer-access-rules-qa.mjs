import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,query,where,limit,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {getStorage,connectStorageEmulator,ref,getBytes,uploadBytes,deleteObject} from 'firebase/storage';
const projectId='fyp-inventory-and-logistics',bucketName=projectId+'.firebasestorage.app';
if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8081'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Use the exact loopback emulator tuple.');
const require=createRequire(new URL('../backend/functions/package.json',import.meta.url)),adminApps=require('firebase-admin/app'),adminApp=adminApps.initializeApp({projectId,storageBucket:bucketName},'customer-rules-'+randomUUID()),db=require('firebase-admin/firestore').getFirestore(adminApp),bucket=require('firebase-admin/storage').getStorage(adminApp).bucket();
const id='customer_rules_'+randomUUID().replaceAll('-',''),bytes=Buffer.from('%PDF-1.4\nOrdinary customer proof fixture.\n'),sha=value=>createHash('sha256').update(value).digest('hex'),storageOnly=process.argv.includes('--storage-only');
const sharedKinds=['products','stockMovements','shipments','evidence','locations','deliveryEvents','transportPlans','auditLogs','predictions','verificationRecords','inventoryAIExperiments','deliveryAIExperiments','integrityChecks','integrityExceptions','integrityReviewEvents','vehicles','drivers','approvals','purchaseOrders','expectedReplenishments','resourceAssignments'];
const privateKinds=['customerShipmentGrants','completionRequests','integrityRequests','integrityLocks'],roles=['Admin','Manager','Inventory','Warehouse','Logistics','Driver','Viewer','Customer','Pending'];
const owned=[],apps=[];let objectPath,checks=0;
const denied=promise=>assert.rejects(promise,error=>['permission-denied','storage/unauthorized'].includes(error.code));
function client(role){const uid=id+'_'+role,app=initializeApp({projectId,apiKey:'emulator-test-only',storageBucket:bucketName},'customer-rules-'+randomUUID());apps.push(app);const data=getFirestore(app),storage=getStorage(app);connectFirestoreEmulator(data,'127.0.0.1',8081,{mockUserToken:{sub:uid,user_id:uid}});connectStorageEmulator(storage,'127.0.0.1',9199,{mockUserToken:{sub:uid,user_id:uid}});return {uid,data,storage};}
try{
 const scope=(await db.doc('system/config').get()).data().dataScopeId;
 async function create(kind,key,value){const r=db.collection(kind).doc(key);assert.equal((await r.get()).exists,false);await r.create(value);owned.push({r,value});}
 for(const role of roles){const uid=id+'_'+role;await create('users',uid,{uid,role:role==='Pending'?null:role,status:role==='Pending'?'Pending':'Approved',active:role!=='Pending',version:1});}
 for(const kind of [...sharedKinds,...privateKinds])await create(kind,id,{ownerId:scope,version:1,name:'Disposable boundary fixture',status:'Dispatched',shipmentId:id,driverUid:id+'_Driver',customerUid:id+'_Customer',active:true});
 objectPath=`evidence/${scope}/${id}/${id}_proof`;const file=bucket.file(objectPath);assert.equal((await file.exists())[0],false);await file.save(bytes,{resumable:false,metadata:{contentType:'application/pdf',metadata:{actor:id+'_Driver',stage:'Delivery',evidenceType:'Proof of Delivery',captureSource:'file'}}});
 for(const role of roles){const c=client(role),staff=!['Customer','Pending'].includes(role);
  if(!storageOnly){
   assert.equal((await getDoc(doc(c.data,'users',c.uid))).exists(),true);checks++;
   if(staff){assert.equal((await getDoc(doc(c.data,'system','config'))).exists(),true);assert.equal((await getDoc(doc(c.data,'products',id))).exists(),true);checks+=2;}
   else {await denied(getDoc(doc(c.data,'system','config')));await denied(getDocs(collection(c.data,'users')));checks+=2;for(const kind of sharedKinds){await denied(getDoc(doc(c.data,kind,id)));await denied(getDocs(query(collection(c.data,kind),where('ownerId','==',scope),limit(1))));checks+=2;}await denied(getDoc(doc(c.data,'users',id+'_Admin')));checks++;}
   for(const kind of privateKinds){await denied(getDoc(doc(c.data,kind,id)));await denied(getDocs(query(collection(c.data,kind),where('ownerId','==',scope),limit(1))));checks+=2;}
   if(!staff){await denied(setDoc(doc(c.data,'users',id+'_forged'),{uid:id+'_forged',role:'Admin',active:true,status:'Approved'}));await denied(updateDoc(doc(c.data,'users',c.uid),{role:'Admin',active:true}));await denied(deleteDoc(doc(c.data,'users',c.uid)));checks+=3;}
  }
  if(staff){assert.equal(sha(Buffer.from(await getBytes(ref(c.storage,objectPath),1024))),sha(bytes));checks++;}
  else {await denied(getBytes(ref(c.storage,objectPath),1024));await denied(uploadBytes(ref(c.storage,objectPath+'_forged'),bytes,{contentType:'application/pdf',customMetadata:{actor:c.uid,stage:'Delivery',evidenceType:'Proof of Delivery',captureSource:'file'}}));await denied(deleteObject(ref(c.storage,objectPath)));checks+=3;}
 }
 console.log(JSON.stringify({passed:true,checks,storageOnly,staffRolesPreserved:7,customerDirectSharedAccess:false,proofFixturesOnly:true}));
}finally{
 await Promise.all(apps.map(app=>deleteApp(app)));
 if(objectPath){const f=bucket.file(objectPath);if((await f.exists())[0]){assert.equal(sha((await f.download())[0]),sha(bytes),'Refuse to remove changed proof fixture');await f.delete();}assert.equal((await bucket.file(objectPath+'_forged').exists())[0],false);}
 for(const {r,value}of owned.reverse()){assert.deepEqual((await r.get()).data(),value,'Refuse to remove changed rule fixture');await r.delete();}
 await adminApps.deleteApp(adminApp);
}
