import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AccountGate from '../../../src/features/workspace/WorkspaceGate';
import CustomerShipmentAccess from '../../../src/features/operations/CustomerShipmentAccess';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/operations/operations.css';
function StaffChild({role}:{role:string}){useLayoutEffect(()=>{window.customerUI.staffMounts++;},[]);return <p>Staff child mounted for {role}</p>;}
function Harness(){const [revision,setRevision]=useState(0);useLayoutEffect(()=>{window.customerUI.changed=()=>setRevision(v=>v+1);},[]);const q=window.customerUI;return <div data-revision={revision}>{location.search.includes('staff')?<CustomerShipmentAccess member={{...q.profile,workspaceId:'scope'}} shipments={[{id:'s1',version:1,reference:'DEMO-1',status:'Dispatched'}]}/>:<AccountGate user={q.user}>{member=><StaffChild role={member.role}/>}</AccountGate>}</div>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
