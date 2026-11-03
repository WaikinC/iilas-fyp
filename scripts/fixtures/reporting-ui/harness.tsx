import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {REPORT_RESOURCES} from '../../../lib/reporting';
import ReportExplorer from '../../../src/features/operations/ReportExplorer';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/operations/operations.css';
function Harness(){const [resource,setResource]=useState('products'),[role,setRole]=useState('Manager');useLayoutEffect(()=>{window.reportUI.resources=REPORT_RESOURCES;window.reportUI.change=setResource;window.reportUI.setRole=(r:string)=>{window.reportUI.role=r;setRole(r);};},[]);return <main style={{padding:20,maxWidth:1400,margin:'auto'}}><ReportExplorer resource={resource} member={{uid:'manager',workspaceId:'scope',role,status:'Approved',active:true,version:1,email:'manager@example.test',displayName:'Manager',emailVerified:true}}/></main>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
