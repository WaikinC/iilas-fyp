import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMobileClient} from '../lib/mobilePlatformClient.js';
const access=(uid,mode='Driver')=>({uid,scope:mode==='Waiting'?null:'scope',role:mode==='Driver'?'Driver':mode==='Waiting'?null:'Viewer',mode,verifiedAtMs:1000,online:true});
function fixture(){let nativeUid=null,webUid=null,mode='Driver',opens=0;const calls=[];
 const bridge={async getEnvironment(){calls.push('environment');return {schema:'iilas-mobile-local-1.0',projectId:'fyp-inventory-and-logistics',protocol:'mobile-command-1.0',localOnly:true};},async getSession(){return {uid:nativeUid,access:nativeUid?access(nativeUid,mode):null};},async signIn(){nativeUid='driver';return {uid:nativeUid};},async establishWebSession(){calls.push('mint');return {uid:nativeUid,customToken:'one-use-token'};},async signOut(){nativeUid=null;return {signedOut:true};},async readQueue(){return {items:[],cursor:null,pending:0,needsReview:0,drafts:[]};},async readAssignments(){calls.push('assignments');return {items:[],cursor:null,verifiedAtMs:1000,cached:true};},async chooseProofFile(){return {fileId:'00000000-0000-4000-8000-000000000001',name:'proof.pdf',contentType:'application/pdf',bytes:20};}};
 const client=createMobileClient({bridge,openWebAuth:async()=>{opens++;return {uid:()=>webUid,async signInToken(token){assert.equal(token,'one-use-token');webUid=nativeUid;return webUid;},async signOut(){webUid=null;}};}});
 return {client,bridge,calls,get opens(){return opens;},set nativeUid(x){nativeUid=x;},set webUid(x){webUid=x;},set mode(x){mode=x;}};
}
test('invalid or missing native environment refuses before constructing any web SDK',async()=>{
 const f=fixture();f.bridge.getEnvironment=async()=>({schema:'iilas-mobile-local-1.0',projectId:'other',protocol:'mobile-command-1.0',localOnly:true});await assert.rejects(f.client.initialize());assert.equal(f.opens,0);
 let opened=false;await assert.rejects(createMobileClient({bridge:null,openWebAuth:()=>{opened=true;}}).initialize());assert.equal(opened,false);
});
test('native authority is mirrored once and the custom token never becomes returned state',async()=>{
 const f=fixture();assert.equal((await f.client.initialize()).mode,'Signed out');const state=await f.client.signIn('driver@example.invalid','local-test-input');assert.equal(state.uid,'driver');assert.equal(state.mode,'Driver');assert.equal(f.calls[0],'environment');assert.equal(f.calls.filter(x=>x==='mint').length,1);assert(!JSON.stringify(state).includes('one-use-token'));await f.client.readAssignments();assert(f.calls.includes('assignments'));
});
test('waiting and recovery-only roles cannot read assigned shipments',async()=>{
 for(const mode of ['Waiting','Recovery only']){const f=fixture();await f.client.initialize();f.mode=mode;assert.equal((await f.client.signIn('driver@example.invalid','local-test-input')).mode,mode);await assert.rejects(f.client.readAssignments());assert(!f.calls.includes('assignments'));if(mode==='Recovery only')assert.equal((await f.client.readQueue()).pending,0);else assert(!f.calls.includes('mint'));}
});
test('UID drift or a late reply after account switch cannot return protected data',async()=>{
 const f=fixture();await f.client.initialize();await f.client.signIn('driver@example.invalid','local-test-input');f.bridge.readQueue=async()=>{f.nativeUid='other';return {items:[],cursor:null,pending:0,needsReview:0,drafts:[]};};await assert.rejects(f.client.readQueue());assert.equal(f.client.state().mode,'Signed out');
});
test('native DTO authority fields, arbitrary file paths and oversized drafts are refused',async()=>{
 const f=fixture();await f.client.initialize();await f.client.signIn('driver@example.invalid','local-test-input');f.bridge.readAssignments=async()=>({items:[],cursor:null,verifiedAtMs:1000,cached:true,ownerId:'foreign'});await assert.rejects(f.client.readAssignments());
 f.bridge.chooseProofFile=async()=>({fileId:'00000000-0000-4000-8000-000000000001',name:'proof.pdf',contentType:'application/pdf',bytes:20,path:'/private/other'});await assert.rejects(f.client.chooseProofFile());
});

test('scope drift invalidates cached access even when the UID has not changed',async()=>{const f=fixture();await f.client.initialize();await f.client.signIn('driver@example.invalid','local-test-input');f.bridge.getSession=async()=>({uid:'driver',access:{...access('driver'),scope:'other'}});await assert.rejects(f.client.readAssignments());assert.equal(f.client.state().mode,'Signed out');});

test('an authoritative native failure immediately clears the visible mirrored session',async()=>{const f=fixture();await f.client.initialize();await f.client.signIn('driver@example.invalid','local-test-input');f.bridge.readQueue=async()=>{f.nativeUid=null;throw Error('Authoritative access loss');};await assert.rejects(f.client.readQueue());assert.equal(f.client.state().mode,'Signed out');});
