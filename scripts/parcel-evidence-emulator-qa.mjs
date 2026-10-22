// Run directly against the existing loopback emulators; never starts services.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {doc,setDoc,updateDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,updateMetadata,deleteObject} from 'firebase/storage';
import {admin,client,scope,fixtureDB,snapshot,close} from './access-test-client.mjs';

const members={Admin:admin};
for(const role of ['Manager','Warehouse','Logistics','Driver','Inventory','Viewer'])members[role]=await client(role);
const otherDriver=await client('Driver'),pending=await client('Viewer',false),disabled=await client('Logistics');
await fixtureDB.doc(`users/${disabled.uid}`).update({active:false,status:'Disabled'});
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
let checks=0;
const reject=async fn=>{await assert.rejects(fn);checks++;};
const storageDenied=async fn=>{await assert.rejects(fn,e=>e.code==='storage/unauthorized');checks++;};
const shipment=async(status='Prepared',ownerId=scope)=>{
  const id=randomUUID();
  await fixtureDB.doc(`shipments/${id}`).set({ownerId,status,version:7,reference:`STAGE-${id.slice(0,8)}`,recipient:'Stage QA recipient',phone:'0123456789',address:'Local emulator fixture',expectedDelivery:'2026-10-21',parcelCount:1,packed:true,handoverReference:`HAND-${id.slice(0,8)}`,items:[],driver:'Stage QA Driver'});
  await fixtureDB.doc(`transportPlans/${id}`).set({ownerId,shipmentId:id,driverUid:members.Driver.uid,version:1});
  return id;
};
const prepared=await shipment(),dispatched=await shipment('Dispatched'),draft=await shipment('Draft'),foreign=await shipment('Prepared','foreign-scope');
function upload(c,shipmentId,{stage='Pre-dispatch',type='Parcel Image',captureSource='file',capturedAtClient=null,contentType='image/png',metadata:extra={},pathScope=scope,id=randomUUID()}={}){
  const path=`evidence/${pathScope}/${shipmentId}/${id}`;
  const input={id,shipmentId,path,name:contentType==='application/pdf'?'proof.pdf':'photo.png',type,stage,captureSource,capturedAtClient};
  const metadata={actor:c.uid,stage,evidenceType:type,captureSource,capturedAtClient:capturedAtClient||'',...extra};
  return {input,object:ref(c.storage,path),save:()=>uploadBytes(ref(c.storage,path),image,{contentType,customMetadata:metadata}),register:()=>c.call('registerEvidence',input)};
}
try{
  const accepted=[];
  for(const role of ['Admin','Manager','Warehouse','Logistics']){
    const item=upload(members[role],prepared);await item.save();await item.register();
    const saved=await snapshot('evidence',item.input.id);
    assert.equal(saved.stage,'Pre-dispatch');assert.equal(saved.integrityVersion,2);
    assert.equal(saved.shipmentVersionAtRegistration,7);assert.equal(saved.capturedAtClient,null);
    assert.equal(saved.sha256,createHash('sha256').update(image).digest('hex'));checks++;
    accepted.push(item.input.id);
  }
  for(const role of ['Admin','Manager','Logistics','Driver']){
    const item=upload(members[role],dispatched,{stage:'Delivery'});await item.save();await item.register();checks++;
  }
  const proof=upload(members.Driver,dispatched,{stage:'Delivery',type:'Proof of Delivery',contentType:'application/pdf'});
  await proof.save();await proof.register();checks++;
  const capturedAtClient=new Date().toISOString(),camera=upload(members.Warehouse,prepared,{captureSource:'camera',capturedAtClient});
  await camera.save();await camera.register();assert.equal((await snapshot('evidence',camera.input.id)).capturedAtClient,capturedAtClient);checks++;
  for(const role of ['Driver','Inventory','Viewer'])await storageDenied(upload(members[role],prepared).save);
  for(const role of ['Warehouse','Inventory','Viewer'])await storageDenied(upload(members[role],dispatched,{stage:'Delivery'}).save);
  for(const c of [pending,disabled,otherDriver])await storageDenied(upload(c,dispatched,{stage:'Delivery'}).save);
  for(const [ship,options]of [
    [draft,{}],[dispatched,{}],[prepared,{stage:'Delivery'}],[foreign,{}],
    [prepared,{pathScope:'foreign-scope'}],[prepared,{type:'Proof of Delivery',contentType:'application/pdf'}],
    [prepared,{contentType:'application/pdf'}],[prepared,{metadata:{actor:'forged'}}],
    [prepared,{metadata:{stage:''}}],[prepared,{metadata:{evidenceType:''}}],[prepared,{metadata:{captureSource:''}}],
    [prepared,{captureSource:'camera',capturedAtClient:'invalid'}],
    [prepared,{captureSource:'camera',capturedAtClient:'2026-02-30T10:00:00.000Z'}],
    [prepared,{captureSource:'camera',capturedAtClient:'2026-10-20T25:00:00.000Z'}],
    [prepared,{captureSource:'camera',capturedAtClient:new Date(Date.now()+10*60*1000).toISOString()}],
    [prepared,{capturedAtClient:'2000-01-01T00:00:00.000Z'}],
  ])await storageDenied(upload(members.Admin,ship,options).save);
  for(const change of [{stage:'Delivery'},{type:'Proof of Delivery'},{captureSource:'camera',capturedAtClient:new Date().toISOString()}]){
    const item=upload(members.Logistics,prepared);await item.save();Object.assign(item.input,change);await reject(item.register);
  }
  const changing=await shipment(),stale=upload(members.Warehouse,changing);await stale.save();
  await fixtureDB.doc(`shipments/${changing}`).update({status:'Dispatched',version:8});await reject(stale.register);
  assert.equal((await fixtureDB.doc(`evidence/${stale.input.id}`).get()).exists,false);checks++;
  const reassigned=await shipment('Dispatched'),driverPhoto=upload(members.Driver,reassigned,{stage:'Delivery'});await driverPhoto.save();
  await fixtureDB.doc(`transportPlans/${reassigned}`).update({driverUid:otherDriver.uid});await reject(driverPhoto.register);
  const disabledPhoto=upload(members.Logistics,prepared);await disabledPhoto.save();
  await fixtureDB.doc(`users/${members.Logistics.uid}`).update({active:false});await reject(disabledPhoto.register);
  await fixtureDB.doc(`users/${members.Logistics.uid}`).update({active:true});
  const immutable=upload(admin,prepared);await immutable.save();await immutable.register();
  await storageDenied(immutable.save);
  await storageDenied(()=>updateMetadata(immutable.object,{customMetadata:{stage:'Delivery'}}));
  await storageDenied(()=>deleteObject(immutable.object));
  await reject(()=>setDoc(doc(admin.db,'evidence',randomUUID()),{ownerId:scope,stage:'Delivery'}));
  await reject(()=>updateDoc(doc(admin.db,'evidence',immutable.input.id),{stage:'Delivery'}));
  assert.equal((await getBytes(ref(members.Viewer.storage,immutable.input.path))).byteLength,image.length);checks++;
  const legacy=randomUUID();await fixtureDB.doc(`evidence/${legacy}`).set({ownerId:scope,shipmentId:dispatched,path:immutable.input.path,name:'legacy.png',type:'Parcel Image',contentType:'image/png',bytes:image.length,sha256:createHash('sha256').update(image).digest('hex'),actor:admin.uid,createdAt:new Date(),version:1});
  await mkdir(new URL('../outputs/parcel-stage-20261020/',import.meta.url),{recursive:true});
  await writeFile(new URL('../outputs/parcel-stage-20261020/browser-fixtures.json',import.meta.url),JSON.stringify({
    prepared,dispatched,legacy,evidence:accepted,camera:camera.input.id,
    accounts:Object.fromEntries(Object.entries(members).map(([role,c])=>[role,{uid:c.uid,email:c.email}])),
  },null,2));
  console.log(`Parcel evidence stage emulator QA passed: ${checks} checks. Disposable fixture IDs saved under ignored outputs.`);
}finally{await close();}
