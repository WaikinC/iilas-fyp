import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import InventoryAIExperiment from '../../../src/features/stock/InventoryAIExperiment';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/stock/stock.css';
function App(){const [member,setMember]=useState({uid:'staff',workspaceId:'scope',role:'Inventory'}),[open,setOpen]=useState(true);useLayoutEffect(()=>{window.stockUI.member=member;window.stockUI.setMember=setMember;},[member]);return <><button onClick={()=>setOpen(true)}>Open stock experiment</button>{open&&<InventoryAIExperiment key={member.uid} member={member} products={['A','B'].map(id=>({id,name:'Demo '+id,sku:'BOX-'+id,version:1,status:'Active'}))} onClose={()=>setOpen(false)} onNotice={()=>{}}/>}</>;}
createRoot(document.getElementById('root')!).render(<App/>);
