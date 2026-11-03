import {createHash} from 'node:crypto';
import {validateCloudFixtureDelta} from './spark-cloud-scenarios.mjs';
import {completionUUID,completionExact} from '../lib/completionWorkflow.js';
const fail=()=>{throw Error('Fixture cleanup refused original, unknown, changed or unregistered records. No data restore or file deletion is permitted.');};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const sparkCloudRowHash=value=>createHash('sha256').update(JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v)).digest('hex');
export async function sparkCloudInventory(db){
 const hashes={},rows={};let count=0;
 async function walk(collection){for(const ref of await collection.listDocuments()){if(++count>10000)fail();const snapshot=await ref.get();if(snapshot.exists){rows[ref.path]=snapshot.data();hashes[ref.path]=sparkCloudRowHash(snapshot.data());}for(const child of await ref.listCollections())await walk(child);}}
 for(const collection of await db.listCollections())await walk(collection);return {hashes,rows};
}
const rootKinds=new Set(['products','shipments','suppliers','purchaseOrders','vehicles','drivers']);
export function sealSparkCloudFixtureRegistry({before,current,intent}){
 const paths=validateCloudFixtureDelta({before,after:current.hashes,records:current.rows,intent}),declared=new Set(intent.recordPaths);
 if(paths.some(path=>rootKinds.has(path.split('/')[0])&&!declared.has(path)))fail();
 return Object.freeze(Object.fromEntries(paths.sort().map(path=>[path,current.hashes[path]])));
}
export function mergeSparkCloudFixtureRegistry(base,registration,intent){
 const r=completionExact(registration,['schema','runId','preparationSha256','records']);
 if(r.schema!=='iilas-cloud-fixture-registration-1.0'||r.runId!==intent.runId||r.preparationSha256!==intent.preparationSha256||!base||!r.records||typeof r.records!=='object'||Array.isArray(r.records)||Object.entries(base).some(([p,h])=>r.records[p]!==h)||Object.keys(r.records).some(p=>!Object.hasOwn(base,p)&&rootKinds.has(p.split('/')[0])))fail();
 return Object.freeze({...r.records});
}
export function validateSparkCleanupApproval(approval,plan){
 const a=completionExact(approval,['schema','runId','preparationSha256','planSha256','deleteOnlyRegisteredUnchangedFixtures','billingMustRemainDisabled']);
 if(a.schema!=='iilas-cloud-cleanup-approval-1.0'||a.runId!==plan.runId||a.preparationSha256!==plan.preparationSha256||a.planSha256!==sparkCloudRowHash(plan)||a.deleteOnlyRegisteredUnchangedFixtures!==true||a.billingMustRemainDisabled!==true)fail();return true;
}
export function planSparkCloudCleanup({before,current,intent}){
 completionUUID(intent.runId);if(!hash(intent.preparationSha256)||!before||!Object.keys(before).length||Object.values(before).some(h=>!hash(h))||!current?.rows||!current?.hashes||Object.keys(current.hashes).length>2000||Object.keys(current.rows).length!==Object.keys(current.hashes).length)fail();
 for(const [path,pin]of Object.entries(current.hashes))if(!hash(pin)||!Object.hasOwn(current.rows,path)||sparkCloudRowHash(current.rows[path])!==pin)fail();
 const pins=intent.fixturePins;if(!pins||typeof pins!=='object'||Array.isArray(pins))fail();const paths=Object.keys(pins).sort(),retained=new Set(intent.retainedPaths);
 if(paths.length>500||paths.some(p=>p.split('/').length!==2||!hash(pins[p])||Object.hasOwn(before,p)||retained.has(p)||current.hashes[p]!==pins[p]))fail();
 const additions=Object.keys(current.hashes).filter(p=>!Object.hasOwn(before,p)&&!retained.has(p)).sort();if(JSON.stringify(additions)!==JSON.stringify(paths))fail();
 // Registration is explicit and frozen. References to a fixture never extend
 // this deletion set, and changed rows cannot be adopted by replanning.
 validateCloudFixtureDelta({before,after:current.hashes,records:current.rows,intent:{...intent,recordIds:paths.map(p=>p.split('/')[1]),recordPaths:paths}});
 return Object.freeze({schema:'iilas-spark-cloud-cleanup-1.0',runId:intent.runId,preparationSha256:intent.preparationSha256,beforeSha256:sparkCloudRowHash(before),registrySha256:sparkCloudRowHash(pins),observedHashes:Object.freeze({...current.hashes}),paths:Object.freeze(paths),retainedPaths:Object.freeze([...intent.retainedPaths].sort()),proofFilesRetainedPrivately:true});
}
export async function deleteSparkCloudFixtures({db,plan,before,current,intent}){
 const expected=planSparkCloudCleanup({before,current,intent});if(sparkCloudRowHash(expected)!==sparkCloudRowHash(plan))fail();
 const paths=Object.keys(plan.observedHashes).sort();
 // Verify all originals and all candidates within the same transaction before
 // scheduling any deletion. A changed fixture is kept, never restored.
 await db.runTransaction(async tx=>{
  const snapshots=await tx.getAll(...paths.map(path=>db.doc(path)));if(snapshots.length!==paths.length)fail();
  for(let i=0;i<paths.length;i++)if(!snapshots[i].exists||sparkCloudRowHash(snapshots[i].data())!==plan.observedHashes[paths[i]])fail();
  for(const path of plan.paths)tx.delete(db.doc(path));
 });
 return {deleted:plan.paths.length,originalRecordsDeleted:0,proofFilesRetainedPrivately:true};
}
