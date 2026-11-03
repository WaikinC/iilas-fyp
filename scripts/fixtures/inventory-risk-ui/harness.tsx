import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import InventoryRisk from '../../../src/features/stock/InventoryRisk';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/stock/stock.css';
function App(){const [member,setMember]=useState({uid:'staff',workspaceId:'scope',role:'Inventory'}),[open,setOpen]=useState(true),[notice,setNotice]=useState('');useLayoutEffect(()=>{window.inventoryUI.member=member;window.inventoryUI.setMember=setMember;},[member]);return <><h1>Inventory assessment component fixture</h1><p role="status">{notice}</p>{open?<InventoryRisk key={member.uid} member={member} productId="product" onClose={()=>setOpen(false)} onNotice={setNotice} onError={setNotice}/>:<button onClick={()=>setOpen(true)}>Reopen assessment</button>}</>;}
createRoot(document.getElementById('root')!).render(<App/>);
