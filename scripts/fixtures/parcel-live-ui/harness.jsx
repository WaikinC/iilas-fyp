import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PARCEL_LIVE_POLICY as policy,parcelLiveFrameKey} from '/lib/parcelLive.js';
import '/app/globals.css';
import '/app/interface.css';
import '/src/features/operations/operations.css';
import '/src/features/operations/parcelCapture.css';
let Component;const componentPath='/src/features/operations/ParcelLiveCamera.tsx';
try{Component=(await import(/* @vite-ignore */ componentPath)).default;}catch{Component=function MissingLiveCamera(){return <p>Live camera component missing.</p>;};}
const q=window.liveQA,op='33333333-3333-4333-8333-333333333333',sid='11111111-1111-4111-8111-111111111111',fid='22222222-2222-4222-8222-222222222222',sha='a'.repeat(64),now=Date.now();
const retainedCanvas=document.createElement('canvas');retainedCanvas.width=3;retainedCanvas.height=1;
q.retained=await new Promise(resolve=>retainedCanvas.toBlob(resolve,'image/jpeg'));
const retainedSha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await q.retained.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
q.model={model:'MobileNetV2',modelVersion:sha,selectionSha256:sha,evaluationSha256:sha,acceptanceSha256:sha,preprocessing:'mobilenet_v2',contrast:'clahe',classOrder:['Normal','Damaged'],intendedUse:'sampled-live',policyVersion:policy.version,policySha256:policy.sha256};
q.session=(patch={})=>({ownerId:'scope',sessionId:sid,actorUid:'actor',operationId:op,shipmentId:'shipment',stage:'Pre-dispatch',policy,model:q.model,state:'Open',createdAt:now,updatedAt:now,expiresAt:now+120000,stoppedAt:null,version:1,generation:1,reservedCount:0,completedCount:0,inFlightFrameId:null,lastReservedAt:null,reasonCode:null,...patch});
q.frame=(patch={})=>({ownerId:'scope',sessionId:sid,frameId:fid,sequence:1,actorUid:'actor',shipmentId:'shipment',stage:'Pre-dispatch',policy,model:q.model,sha256:retainedSha,bytes:q.retained.size,width:3,height:1,contentType:'image/jpeg',capturedAtClient:new Date(now).toISOString(),reservedAt:now,expiresAt:now+60000,updatedAt:now+20,completedAt:now+20,state:'Predicted',version:3,sessionGeneration:1,label:'Damaged',probabilities:[0.2,0.8],confidence:0.8,confidenceMeaning:'uncalibrated',serviceRequestId:op,processingTimeMs:1,totalProcessingTimeMs:2,reasonCode:null,retention:'Verified',image:{generation:'1',metageneration:'1',sha256:retainedSha,bytes:q.retained.size,width:3,height:1,contentType:'image/jpeg'},humanReviewRequired:true,reviewStatus:'Pending',reviewNotes:null,reviewedBy:null,reviewedAt:null,...patch});
q.frameKey=parcelLiveFrameKey;
q.publish=(sessions,frames=[])=>{q.sessions=sessions;q.frames=frames;q.listeners.forEach(fn=>fn());};
q.history=(count=41,publish=true)=>{
 const base=now-100000,id=index=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
 const sessions=Array.from({length:count},(_,index)=>{const createdAt=base+Math.floor(index/2)*100;return q.session({sessionId:id(index),operationId:id(index),model:null,state:'Unavailable',reasonCode:'model-unavailable',createdAt,updatedAt:createdAt,expiresAt:createdAt+120000});});
 sessions[0]=q.session({sessionId:id(0),operationId:id(0),state:'Stopped',version:3,generation:2,createdAt:base,updatedAt:base+2000,expiresAt:base+120000,stoppedAt:base+2000,reasonCode:'user-stop',reservedCount:1,completedCount:1,lastReservedAt:base+100});
 q.oldestSession=id(0);q.historyIds=sessions.map(s=>s.sessionId);
 const frames=[q.frame({sessionId:id(0),reservedAt:base+100,capturedAtClient:new Date(base+100).toISOString(),expiresAt:base+60100,completedAt:base+1000,updatedAt:base+1000})];if(publish)q.publish(sessions,frames);return {sessions,frames};
};
q.command=async(name,input)=>{
 q.calls.push({name,input});
 if(q.mode==='lost'){q.mode='unavailable';throw Error('private raw error');}
 if(q.mode==='delayed'){await new Promise(resolve=>{q.release=resolve;});}
 if(name==='startParcelLiveSession'){
  if(q.mode==='busy')return {state:'Busy',sessionId:sid,reasonCode:'session-busy'};
  q.original={...input};
  const r=q.session({...input,model:q.mode==='open'?q.model:null,state:q.mode==='open'?'Open':'Unavailable',reasonCode:q.mode==='open'?null:'model-unavailable'});q.publish([r]);return r;
 }
 if(name==='resolveParcelLiveSession'||name==='stopParcelLiveSession'){
  const r=q.session({...q.original,state:'Stopped',version:2,generation:2,stoppedAt:now+100,updatedAt:now+100,reasonCode:'user-stop',...(q.mode==='busy'?{shipmentId:'other-shipment',stage:'Delivery',operationId:fid}:{})});return r;
 }
 if(name==='reserveParcelLiveFrame'){
  q.reservation={...input};return q.frame({...input,state:'Reserved',version:1,updatedAt:now,completedAt:null,label:null,probabilities:null,confidence:null,confidenceMeaning:null,serviceRequestId:null,processingTimeMs:null,totalProcessingTimeMs:null,retention:'Unverified',image:null,humanReviewRequired:false,reviewStatus:'NotApplicable'});
 }
 if(name==='analyseParcelLiveFrame'){
  if(q.holdAnalysis)await new Promise(resolve=>q.releaseAnalysis=resolve);
  const p=q.reservation;const r=q.frame({...p,image:{generation:'1',metageneration:'1',sha256:p.sha256,bytes:p.bytes,width:p.width,height:p.height,contentType:'image/jpeg'}});q.publish([q.session({...q.original})],[r]);return r;
 }
 if(name==='resolveParcelLiveFrame')return q.frames.find(f=>f.frameId===input.frameId);
 if(name==='reviewParcelLiveFrame')return q.frame({...q.frames[0],version:4,updatedAt:now+100,reviewedAt:now+100,reviewedBy:'actor',reviewStatus:input.decision,reviewNotes:input.notes,humanReviewRequired:false});
 throw Error('Unexpected synthetic command');
};
function Harness(){
 const [role,setRole]=useState('Warehouse'),[version,setVersion]=useState(1),[status,setStatus]=useState('Prepared'),[stage,setStage]=useState('Pre-dispatch'),[active,setActive]=useState(false),[uid,setUid]=useState('actor'),[sibling,setSibling]=useState(new URLSearchParams(location.search).has('sibling')),[siblingActive,setSiblingActive]=useState(false),[acquisitionDisabled,setAcquisitionDisabled]=useState(false);
 const member={uid,workspaceId:'scope',role,version,status:'Approved',active:true,email:'fixture@example.invalid',emailVerified:true,displayName:'Fixture'};q.member=member;
 return <main style={{maxWidth:900,margin:'24px auto',padding:16}}><h1>Parcel live camera component fixture</h1><p>Synthetic software only; no physical camera or accepted model.</p><div className="evidence-actions">
 <button onClick={()=>setRole('Viewer')}>Viewer fixture</button><button onClick={()=>setRole('Manager')}>Manager fixture</button><button onClick={()=>setVersion(v=>v+1)}>Change access version</button><button onClick={()=>setStatus('Dispatched')}>Dispatch fixture</button><button onClick={()=>{setRole('Driver');setStage('Delivery');setStatus('Dispatched');}}>Driver fixture</button><button onClick={()=>setUid('other-driver')}>Unassigned driver fixture</button><button onClick={()=>setSibling(true)}>Mount sibling fixture</button><button onClick={()=>setAcquisitionDisabled(value=>!value)}>Toggle acquisition disabled fixture</button><button onClick={()=>setActive(false)}>Parent deactivate fixture</button></div>
 <section className="module-card operations-card" aria-label="First shipment fixture"><Component member={member} shipment={{id:'shipment',status,version:4,driverUid:'actor'}} stage={stage} active={active} acquisitionDisabled={acquisitionDisabled} onOpen={()=>setActive(true)} onClose={()=>setActive(false)}/></section>
 {sibling&&<section className="module-card operations-card" aria-label="Second shipment fixture"><Component member={member} shipment={{id:'other-shipment',status,version:4,driverUid:'actor'}} stage={stage} active={siblingActive} onOpen={()=>setSiblingActive(true)} onClose={()=>setSiblingActive(false)}/></section>}</main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
