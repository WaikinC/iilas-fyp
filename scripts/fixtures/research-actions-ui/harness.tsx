import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ResearchVerification from '../../../src/features/operations/ResearchVerification';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/operations/operations.css';
function Harness(){const [ready,setReady]=useState(true),q=window.researchUI;return <main style={{padding:16,maxWidth:1200,margin:'auto'}}><button onClick={()=>setReady(false)}>Make evidence unavailable</button><ResearchVerification member={q.member} products={[]} shipments={[]} evidence={q.evidence} evidenceReady={ready}/></main>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
