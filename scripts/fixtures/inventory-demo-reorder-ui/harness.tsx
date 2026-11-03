import React,{useLayoutEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import InventoryDemoReorder from '../../../src/features/stock/InventoryDemoReorder';
import '../../../app/globals.css';
import '../../../app/interface.css';
import '../../../src/features/stock/stock.css';
function App(){const [visible,setVisible]=useState(true);const [member,setMember]=useState({uid:'manager',workspaceId:'scope',role:'Manager'});useLayoutEffect(()=>{window.reorderUI.member=member;window.reorderUI.setMember=setMember;window.reorderUI.setVisible=setVisible;},[member]);return visible&&<InventoryDemoReorder key={member.uid} member={member}/>;}
createRoot(document.getElementById('root')!).render(<App/>);
