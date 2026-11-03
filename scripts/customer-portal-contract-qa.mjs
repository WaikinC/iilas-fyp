import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateCustomerList,validateCustomerDetail,fetchCustomerProof} from '../lib/customerPortal.js';
const summary={shipmentId:'s1',reference:'DEMO-1',expectedDelivery:'2026-10-25',status:'Delivered'},proof={evidenceId:'proof1',fileName:'Proof.pdf',contentType:'application/pdf',bytes:4};
const detail=()=>({...summary,timeline:{rows:[{status:'Delivered',atMs:1000}],hasMore:false,coverage:'Latest timestamped updates only.'},location:null,proof,observedAtMs:2000});
test('native capture time remains distinct and no newer than allowed receipt tolerance',()=>{
 const d={...detail(),status:'In Transit',proof:null,location:{latitude:3,longitude:101,accuracy:10,submittedAtMs:1900,capturedAtMs:1000}};
 assert.equal(validateCustomerDetail(d).location.capturedAtMs,1000);
 assert.throws(()=>validateCustomerDetail({...d,location:{...d.location,capturedAtMs:NaN}}));
 assert.throws(()=>validateCustomerDetail({...d,location:{...d.location,capturedAtMs:122001}}));
});
test('closed customer DTOs reject internal records and keep unknown facts explicit',()=>{
 const list={rows:[summary],cursor:null,hasMore:false,scanned:1,observedAtMs:2000};assert.deepEqual(validateCustomerList(list),list);assert.deepEqual(validateCustomerDetail(detail()),detail());
 for(const key of ['ownerId','actor','items','cost','notes','path','token'])assert.throws(()=>validateCustomerDetail({...detail(),[key]:'private'}));
 assert.throws(()=>validateCustomerList({...list,rows:[{...summary,driverUid:'private'}]}));assert.throws(()=>validateCustomerList({...list,scanned:21}));assert.throws(()=>validateCustomerList({...list,rows:Array(21).fill(summary)}));
 assert.throws(()=>validateCustomerDetail({...detail(),proof:{...proof,path:'private-path'}}));assert.throws(()=>validateCustomerDetail({...detail(),location:{latitude:0,longitude:100,accuracy:1,submittedAtMs:1000}}));
 assert.equal(validateCustomerDetail({...detail(),expectedDelivery:null,proof:null}).expectedDelivery,null);
});
test('download uses only a bearer header and closed IDs against literal local IILAS',async()=>{
 const requests=[],data=new Uint8Array([1,2,3,4]);const result=await fetchCustomerProof({user:{uid:'customer1',getIdToken:async force=>{assert.equal(force,true);return 'private-header-token';}},customerUid:'customer1',shipmentId:'s1',proof,siteUrl:'http://127.0.0.1:5173/',isCurrent:()=>true,fetcher:async(url,options)=>{requests.push({url,options});return new Response(data,{status:200,headers:{'Content-Type':'application/pdf','Content-Length':'4'}});}});
 assert.equal(result.size,4);assert.equal(requests[0].options.headers.Authorization,'Bearer private-header-token');assert(!requests[0].url.includes('private-header-token'));assert(!requests[0].url.includes('ownerId'));assert.equal(new URL(requests[0].url).origin,'http://127.0.0.1:5001');assert.equal(new URL(requests[0].url).searchParams.get('evidenceId'),'proof1');
});
test('wrong account nonlocal site denied response mismatched MIME/size and oversized streams are refused',async()=>{
 const base={user:{uid:'customer1',getIdToken:async()=> 'header-token'},customerUid:'customer1',shipmentId:'s1',proof,siteUrl:'http://localhost:5173',isCurrent:()=>true};
 for(const patch of [{customerUid:'customer2'},{siteUrl:'https://example.test'},{isCurrent:()=>false}])await assert.rejects(fetchCustomerProof({...base,...patch,fetcher:()=>{throw Error('must not fetch');}}));
 for(const response of [new Response('denied',{status:403}),new Response('1234',{headers:{'Content-Type':'text/html'}}),new Response('123',{headers:{'Content-Type':'application/pdf','Content-Length':'3'}}),new Response(new Uint8Array(10*1024*1024+1),{headers:{'Content-Type':'application/pdf'}})])await assert.rejects(fetchCustomerProof({...base,fetcher:async()=>response}));
});
test('account/view changes after token acquisition or body read cannot return a downloadable file',async()=>{
 let current=true;const base={user:{uid:'customer1',getIdToken:async()=>{current=false;return 'header-token';}},customerUid:'customer1',shipmentId:'s1',proof,siteUrl:'http://127.0.0.1:5173',isCurrent:()=>current,fetcher:()=>{throw Error('must not fetch');}};await assert.rejects(fetchCustomerProof(base));
 current=true;await assert.rejects(fetchCustomerProof({...base,user:{uid:'customer1',getIdToken:async()=> 'header-token'},fetcher:async()=>{current=false;return new Response('1234',{headers:{'Content-Type':'application/pdf','Content-Length':'4'}});}}));
});
