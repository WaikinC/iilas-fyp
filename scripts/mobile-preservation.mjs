import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const mobileStable=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const mobileDigest=value=>createHash('sha256').update(mobileStable(value)).digest('hex');
export function requireMobileEmulators(){for(const [k,v]of Object.entries({GCLOUD_PROJECT:'fyp-inventory-and-logistics',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8081',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'}))assert.equal(process.env[k],v,'Exact local emulator environment required');}
export async function mobileInventory({db,identity,bucket}){
 requireMobileEmulators();const docs={},accounts={},objects={};
 async function walk(collection){for(const d of (await collection.get()).docs){assert(Object.keys(docs).length<100000);docs[d.ref.path]=mobileDigest(d.data());for(const child of await d.ref.listCollections())await walk(child);}}
 for(const col of await db.listCollections())await walk(col);
 let next;do{const page=await identity.listUsers(1000,next);for(const user of page.users){const value=user.toJSON();if(value.metadata){delete value.metadata.lastSignInTime;delete value.metadata.lastRefreshTime;}accounts[user.uid]=mobileDigest(value);}next=page.pageToken;}while(next);
 for(const file of (await bucket.getFiles())[0]){const [metadata]=await file.getMetadata();objects[file.name]=mobileDigest(metadata);}return {docs,accounts,objects};
}
export function mobileOriginalsEqual(before,after){for(const kind of ['docs','accounts','objects'])for(const [id,pin]of Object.entries(before[kind]))assert.equal(after[kind][id],pin,'Original '+kind+' changed; refuse cleanup/restore');}
export async function cleanupMobileFixtures(c,before,{actors,shipments,known,proofPaths}){
 const current=await mobileInventory(c);mobileOriginalsEqual(before,current);const additions=Object.keys(current.docs).filter(x=>!Object.hasOwn(before.docs,x));
 const allowed=new Set(['users','shipments','transportPlans','deliveries','deliveryEvents','locations','locationEvents','resourceAssignments','auditLogs','evidence','mobileRequests','mobileEvidenceRequests','mobileTrackingSessions']);
 for(const path of additions){assert(allowed.has(path.split('/')[0]),'Unknown fixture collection');const data=(await c.db.doc(path).get()).data();let ownedSession=false;if(path.startsWith('mobileTrackingSessions/device_')&&typeof data?.sessionId==='string'){const session=(await c.db.doc('mobileTrackingSessions/'+data.sessionId).get()).data();ownedSession=actors.includes(session?.actor)&&shipments.includes(session?.shipmentId);}assert(ownedSession||known.has(path)||actors.includes(data?.actor)||actors.includes(data?.updatedBy)||shipments.includes(data?.shipmentId),'Unattributed new document');}
 assert(Object.keys(current.accounts).filter(x=>!before.accounts[x]).every(x=>actors.includes(x)),'Unattributed Auth user');const objects=Object.keys(current.objects).filter(x=>!before.objects[x]);assert(objects.every(x=>proofPaths.includes(x)),'Unattributed Storage object');
 for(const path of objects){const file=c.bucket.file(path),[metadata]=await file.getMetadata();assert.equal(mobileDigest(metadata),current.objects[path]);await file.delete({ifGenerationMatch:metadata.generation});}
 for(const path of additions)await c.db.runTransaction(async tx=>{const r=c.db.doc(path),snap=await tx.get(r);assert(snap.exists&&mobileDigest(snap.data())===current.docs[path]);tx.delete(r);});
 for(const uid of actors)await c.identity.deleteUser(uid);const after=await mobileInventory(c);assert.deepEqual(after,before);return after;
}
