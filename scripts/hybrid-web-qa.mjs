import test from 'node:test';import assert from 'node:assert/strict';
import {projectRecoveryStorage,LOCAL_DEMO_ENVIRONMENT} from '../lib/demoEnvironment.js';
import {fetchCustomerProof} from '../lib/customerPortal.js';
import {customerEvidenceOrigin} from '../backend/functions/customerEvidence.mjs';
import {demoEvidenceBucket} from '../backend/functions/demoEnvironment.mjs';
const cloud={...LOCAL_DEMO_ENVIRONMENT,mode:'cloud-demo',projectId:'iilas-cloud-fixture',storageBucket:'iilas-cloud-fixture.firebasestorage.app',webOrigins:['https://iilas-cloud-fixture.web.app']};
test('local pending slots stay recoverable and cloud slots are project separated',()=>{
 const rows=new Map(),storage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};
 rows.set('pending','original');const local=projectRecoveryStorage(storage,LOCAL_DEMO_ENVIRONMENT),remote=projectRecoveryStorage(storage,cloud);
 assert.equal(local.getItem('pending'),'original');assert.equal(remote.getItem('pending'),null);remote.setItem('pending','cloud');assert.equal(local.getItem('pending'),'original');remote.removeItem('pending');assert.equal(local.getItem('pending'),'original');
});
test('Customer cloud proof uses same origin with bearer token and bounded bytes',async()=>{
 let sent;const bytes=new Uint8Array([37,80,68,70]);
 const user={uid:'customer',getIdToken:async()=>['fixture','signed','token'].join('.')};
 await fetchCustomerProof({user,customerUid:'customer',shipmentId:'shipment',proof:{evidenceId:'proof',fileName:'proof.pdf',contentType:'application/pdf',bytes:4},environment:cloud,siteUrl:cloud.webOrigins[0]+'/',isCurrent:()=>true,fetcher:async(url,options)=>{sent={url,options};return new Response(bytes,{headers:{'content-type':'application/pdf','content-length':'4'}});}});
 assert.equal(new URL(sent.url).origin,cloud.webOrigins[0]);assert.equal(new URL(sent.url).pathname,'/api/customer-evidence');assert.equal(sent.options.redirect,'error');assert.equal(sent.options.cache,'no-store');assert(!sent.url.includes('token'));
 await assert.rejects(()=>fetchCustomerProof({user,customerUid:'customer',shipmentId:'shipment',proof:{evidenceId:'proof',fileName:'proof.pdf',contentType:'application/pdf',bytes:4},environment:cloud,siteUrl:'https://foreign.example',isCurrent:()=>true}));
});
test('Customer origin and bucket selection refuse foreign destinations',()=>{
 assert.equal(customerEvidenceOrigin(cloud.webOrigins[0],cloud),cloud.webOrigins[0]);assert.equal(customerEvidenceOrigin(undefined,cloud),null);
 assert.throws(()=>customerEvidenceOrigin('https://other.example',cloud));assert.throws(()=>customerEvidenceOrigin(undefined,LOCAL_DEMO_ENVIRONMENT));
 assert.equal(demoEvidenceBucket({}),LOCAL_DEMO_ENVIRONMENT.storageBucket);assert.throws(()=>demoEvidenceBucket({EVIDENCE_BUCKET:'other.bucket'}));
});
