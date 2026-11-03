import React,{useState,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import IntegrityVerification from '../../../src/features/operations/IntegrityVerification';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/operations/operations.css';
function Harness(){const [member,setMember]=useState({uid:'manager',workspaceId:'scope',role:'Manager',version:1,active:true,status:'Approved'});useLayoutEffect(()=>{window.integrityUI.member=member;window.integrityUI.setMember=setMember;},[member]);return <main style={{padding:16,maxWidth:1200,margin:'auto'}}><IntegrityVerification member={member} movements={[{id:'m1',type:'Receipt',productName:'Demo item',reference:'DEMO-1'}]} evidence={[{id:'e1',name:'Proof.pdf',type:'Proof of Delivery'}]}/></main>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
