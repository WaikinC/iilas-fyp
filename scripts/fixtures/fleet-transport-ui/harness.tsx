import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import FleetManagement from '../../../src/features/operations/FleetManagement';
import TransportManagement from '../../../src/features/operations/TransportManagement';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/operations/operations.css';
function Harness(){const [member,setMember]=useState({uid:'manager',workspaceId:'scope',role:'Manager',version:1,active:true,status:'Approved'}),[revision,setRevision]=useState(0);useLayoutEffect(()=>{window.fleetUI.member=member;window.fleetUI.setMember=setMember;window.fleetUI.changed=()=>setRevision(v=>v+1);},[member]);const shipments=window.fleetUI.records.shipments;return <main data-revision={revision} style={{padding:16,maxWidth:1200,margin:'auto'}}>{location.search.includes('transport')?<TransportManagement member={member} shipments={shipments}/>:<FleetManagement member={member} shipments={shipments}/>}</main>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
