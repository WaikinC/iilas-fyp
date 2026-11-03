import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {canonicalRecord} from '../lib/integrity.js';
import {validateIntegrityInput,validateIntegrityReview} from '../lib/integrityWorkflow.js';
import {describeIntegritySource,hashIntegrityStream} from '../backend/functions/integritySource.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export const movement={ownerId:'scope',productId:'p',sku:'S',type:'Receipt',quantity:2,quantityChange:2,reservedChange:0,quantityBefore:1,quantityAfter:3,reservedBefore:0,reservedAfter:0,locationFrom:'A',locationTo:'A',reference:'R',reason:'Recorded receipt',actor:'inventory',createdAt:{seconds:100,nanoseconds:0},productVersion:2};
test('closed operation inputs prevent authoritative overrides and coerced fields',()=>{
 const input={operationId:randomUUID(),kind:'inventory',recordId:'m1'};assert.deepEqual(validateIntegrityInput(input),input);
 for(const patch of [{kind:'parcel'},{digest:'a'.repeat(64)},{recordId:'../bad'},{operationId:1},{transactionHash:'0x'+'a'.repeat(64)}])assert.throws(()=>validateIntegrityInput({...input,...patch}));
 const hash='0x'+'a'.repeat(64);assert.equal(validateIntegrityInput({...input,transactionHash:hash},true).transactionHash,hash);
 const review={operationId:randomUUID(),exceptionId:'e',expectedReviewVersion:0,decision:'Acknowledge',notes:'Checked source.'};assert.deepEqual(validateIntegrityReview(review),review);
 for(const patch of [{expectedReviewVersion:'0'},{expectedReviewVersion:-1},{decision:'Verified'},{notes:'x'},{digest:'override'}])assert.throws(()=>validateIntegrityReview({...review,...patch}));
});
test('historical inventory and delivery canonical v1/v2 formats are unchanged',()=>{
 for(const record of [movement,{...movement,integrityVersion:2,origin:'Manual',allocations:[],locationChanges:[]}]){
  const description=describeIntegritySource({scope:'scope',kind:'inventory',recordId:'m1',record});assert.equal(description.eligibility.eligible,true);assert.equal(description.canonical,canonicalRecord('inventory',{id:'m1',...record}));assert.equal(description.digest,sha(description.canonical));assert.equal(description.referenceHash,sha('scope:inventory:m1'));assert.equal(description.snapshot.sourceVersion,2);
 }
 for(const integrityVersion of [1,2]){
  const record={ownerId:'scope',shipmentId:'s1',type:'Proof of Delivery',sha256:'a'.repeat(64),bytes:12,contentType:'application/pdf',path:'evidence/scope/s1/e1',actor:'driver',createdAt:{seconds:100,nanoseconds:0},version:1,...(integrityVersion===2?{integrityVersion,stage:'Delivery',captureSource:'file',capturedAtClient:null,shipmentVersionAtRegistration:3}:{})};
  const d=describeIntegritySource({scope:'scope',kind:'delivery',recordId:'e1',record});assert.equal(d.eligibility.eligible,true);assert.equal(d.canonical,canonicalRecord('delivery',{id:'e1',...record}));
 }
});
test('missing committed facts and unsupported legacy formats are explicit, never fabricated',()=>{
 for(const patch of [{quantityBefore:undefined},{quantityChange:'2'},{productVersion:0},{integrityVersion:3},{createdAt:null},{type:'Pending'},{quantityAfter:NaN}]){const r={...movement,...patch};const d=describeIntegritySource({scope:'scope',kind:'inventory',recordId:'m1',record:r});assert.equal(d.eligibility.eligible,false);assert.equal(d.canonical,null);assert.equal(d.digest,null);}
 assert.throws(()=>describeIntegritySource({scope:'foreign',kind:'inventory',recordId:'m1',record:movement}),/scope|source/i);
});
test('bounded file hashing uses actual bytes and refuses over-limit or unreadable streams',async()=>{
 const bytes=Buffer.from('ordinary proof pdf fixture');assert.equal(await hashIntegrityStream(Readable.from([bytes])),sha(bytes));
 await assert.rejects(hashIntegrityStream(Readable.from([Buffer.alloc(10*1024*1024),Buffer.from('x')])),/large|limit/i);
 const broken=Readable.from((async function*(){yield Buffer.from('a');throw Error('read failed');})());await assert.rejects(hashIntegrityStream(broken),/read failed/);
});
