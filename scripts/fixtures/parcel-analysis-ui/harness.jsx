import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import '/app/globals.css';
import '/app/interface.css';
import '/src/features/operations/operations.css';
import '/src/features/operations/parcelCapture.css';
let ParcelAnalysis;
const research=new URLSearchParams(location.search).get('view')==='research';
const componentPath=research?'/src/features/operations/ResearchVerification.tsx':'/src/features/operations/ParcelAnalysis.tsx';
try {ParcelAnalysis=(await import(/* @vite-ignore */ componentPath)).default;}catch{ParcelAnalysis=function MissingAnalysis(){return <p>Parcel analysis controls are missing.</p>;};}
const hash='a'.repeat(64);
function Harness(){
  const [role,setRole]=useState('Warehouse'),[version,setVersion]=useState(1),[status,setStatus]=useState('Prepared'),[stage,setStage]=useState('Pre-dispatch'),[type,setType]=useState('Parcel Image'),[uid,setUid]=useState('actor');
  const member={uid,workspaceId:'scope',role,version,status:'Approved',active:true};
  window.uiQA.member=member;
  const evidence={id:'evidence',ownerId:'scope',version:2,integrityVersion:2,shipmentId:'shipment',type,stage,captureSource:'file',capturedAtClient:null,sha256:hash};
  return <main style={{maxWidth:900,margin:'24px auto',padding:16}}><h1>Parcel analysis component fixture</h1><p>Synthetic software checks; no real inference or production model acceptance.</p>
    <div className="evidence-actions"><button onClick={()=>setRole('Viewer')}>Viewer fixture</button><button onClick={()=>setRole('Inventory')}>Inventory fixture</button><button onClick={()=>setRole('Manager')}>Manager fixture</button><button onClick={()=>setRole('Warehouse')}>Warehouse fixture</button><button onClick={()=>{setRole('Driver');setStage('Delivery');setStatus('Dispatched');}}>Driver fixture</button><button onClick={()=>setUid('other-driver')}>Unassigned driver fixture</button><button onClick={()=>setVersion(v=>v+1)}>Change access version</button><button onClick={()=>setStatus('Dispatched')}>Dispatch fixture</button><button onClick={()=>setStage(undefined)}>Legacy fixture</button><button onClick={()=>setType('Proof of Delivery')}>Proof fixture</button></div>
    <section className="module-card operations-card">{research?<ParcelAnalysis member={member} products={[{id:'product',name:'Fixture stock',version:1}]} shipments={[{id:'shipment',reference:'Fixture delivery',status:'Dispatched',version:4}]} evidence={[evidence]}/>:<ParcelAnalysis key={JSON.stringify([role,version,status,stage,type,uid])} member={member} shipment={{id:'shipment',version:4,status,driverUid:'actor'}} evidence={evidence}/>}</section>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
