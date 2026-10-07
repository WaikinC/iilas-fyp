// Review-only probes. All authentication and database traffic goes to local emulators.
import assert from 'node:assert/strict';
import {connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {connectFirestoreEmulator,deleteDoc,doc,getDoc,runTransaction,serverTimestamp,setDoc,updateDoc} from 'firebase/firestore';
import {auth,db,saveRecord,deleteRecord} from '../lib/firebase.js';
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
connectFirestoreEmulator(db,'127.0.0.1',8081);
const tag=crypto.randomUUID().slice(0,8);
await createUserWithEmailAndPassword(auth,`qa-${tag}@example.test`,'LocalEmulatorOnly123!');
const ownerId=auth.currentUser.uid;
const product={name:'QA concurrency product',sku:`QA-${tag}`,barcode:'9912345678901',category:'QA',location:'QA-A',quantityOnHand:5,reorderLevel:1,status:'Active'};
const productId=await saveRecord('products',product);
const base={recipient:'QA recipient',phone:'0123456789',address:'QA test address only',handoverReference:'QA-PREP',driver:'QA Driver',status:'Draft',expectedDelivery:'2026-09-20',parcelCount:1,packed:true,items:[{productId,quantity:4}]};
const first=await saveRecord('shipments',{...base,reference:`QA-A-${tag}`});
const second=await saveRecord('shipments',{...base,reference:`QA-B-${tag}`});
const outcomes=await Promise.allSettled([
  saveRecord('shipments',{...base,reference:`QA-A-${tag}`,status:'Dispatched'},{id:first,version:1}),
  saveRecord('shipments',{...base,reference:`QA-B-${tag}`,status:'Dispatched'},{id:second,version:1})
]);
assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
assert.equal((await getDoc(doc(db,'products',productId))).data().quantityOnHand,1);
console.log('PASS: concurrent dispatches cannot oversell through saveRecord.');
await assert.rejects(()=>saveRecord('products',product,{id:productId,version:1}),/record changed/i);
console.log('PASS: stale product edits are rejected.');
await assert.rejects(()=>updateDoc(doc(db,'products',productId),{quantityOnHand:-1}),/permission/i);
console.log('PASS: rules reject negative stock.');
await deleteRecord('products',{id:productId,version:2});
assert.equal((await getDoc(doc(db,'products',productId))).data().archived,true);
console.log('PASS: product archival preserves the document referenced by shipments.');
const pending=outcomes[0].status==='rejected'?first:second;
await assert.rejects(()=>saveRecord('shipments',{...base,reference:pending===first?`QA-A-${tag}`:`QA-B-${tag}`,status:'Dispatched'},{id:pending,version:1}),/Not enough available stock/);
console.log('PASS: archived product remains referenced, with normal stock checks.');
await assert.rejects(()=>setDoc(doc(db,'shipments',crypto.randomUUID()),{ownerId,updatedBy:ownerId,status:'Dispatched',items:[],driver:'',packed:false}),/permission/i);
console.log('PASS: direct invalid Dispatched shipment write is rejected.');
await assert.rejects(()=>setDoc(doc(db,'products',crypto.randomUUID()),{...product,ownerId,updatedBy:ownerId}),/permission/i);
console.log('PASS: direct product write without uniqueness keys and audit is rejected.');
await assert.rejects(()=>deleteDoc(doc(db,'uniqueKeys',`${ownerId}_sku_${product.sku.toUpperCase()}`)),/permission/i);
console.log('PASS: current SKU reservation cannot be deleted directly.');
const rogueId=crypto.randomUUID();
const rogueRef=`QA-ROGUE-${tag}`;
await assert.rejects(()=>runTransaction(db,async transaction=>{
  const now=serverTimestamp();
  const eventId=`shipments_${rogueId}_1`;
  transaction.set(doc(db,'shipments',rogueId),{...base,reference:rogueRef,status:'Dispatched',items:[{productId,quantity:1,name:product.name,sku:product.sku.toUpperCase()}],ownerId,updatedBy:ownerId,version:1,createdAt:now,updatedAt:now,dispatchedAt:now,lastEventId:eventId});
  transaction.set(doc(db,'uniqueKeys',`${ownerId}_shipment_${rogueRef}`),{ownerId,kind:'shipments',recordId:rogueId});
  transaction.set(doc(db,'auditLogs',eventId),{ownerId,kind:'shipments',recordId:rogueId,action:'Create',actor:ownerId,at:now,version:1,label:rogueRef});
}),/permission/i);
console.log('PASS: direct well-formed dispatch without stock deduction is rejected.');
const dispatchItems=[];
for(let index=0;index<2;index++){
  const sample={...product,name:`QA item ${index}`,sku:`QA5-${tag}-${index}`,barcode:`991234567891${index}`,quantityOnHand:2};
  dispatchItems.push({productId:await saveRecord('products',sample),quantity:1});
}
const dispatchId=await saveRecord('shipments',{...base,reference:`QA-TWO-${tag}`,status:'Dispatched',items:dispatchItems});
assert.equal((await getDoc(doc(db,'shipments',dispatchId))).data().items.length,2);
for(const item of dispatchItems) assert.equal((await getDoc(doc(db,'products',item.productId))).data().quantityOnHand,1);
console.log('PASS: a two-product dispatch deducts every item atomically.');
const preparedReference=`QA-PREPARED-${tag}`;
const preparedId=await saveRecord('shipments',{...base,reference:preparedReference,status:'Prepared',items:dispatchItems});
for(const item of dispatchItems) assert.equal((await getDoc(doc(db,'products',item.productId))).data().quantityOnHand,1);
await saveRecord('shipments',{...base,reference:preparedReference,status:'Dispatched',items:dispatchItems},{id:preparedId,version:1});
for(const item of dispatchItems) assert.equal((await getDoc(doc(db,'products',item.productId))).data().quantityOnHand,0);
console.log('PASS: updating a two-product Prepared shipment to Dispatched deducts stock atomically.');
process.exit(0);
