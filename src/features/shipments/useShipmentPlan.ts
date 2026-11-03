import {useEffect,useState} from 'react';
import {onSnapshot} from 'firebase/firestore';
import {shipmentPlanQuery} from './shipmentPlanQuery';
import {db} from '../../../lib/firebase';
import type {ShipmentPlanState} from './shipmentPresentation';
export default function useShipmentPlan(scope:string,id:string|null):ShipmentPlanState{
 const [state,setState]=useState<ShipmentPlanState&{source:string}>({row:null,loading:!!id,error:'',revision:0,source:''}),source=JSON.stringify([scope,id]),validId=typeof id==='string'&&id.length>0&&id.length<=128&&!id.includes('/');
 useEffect(()=>{let live=true;if(!validId||!db)return;
  const stop=onSnapshot(shipmentPlanQuery(db,scope,id),snapshot=>{if(!live)return;const snap=snapshot.docs[0],data=snap?.data();setState(prev=>({row:snap&&data?.ownerId===scope?{...data,id:snap.id}:null,loading:false,error:snap&&data?.ownerId!==scope?'Transport scope is unavailable.':'',revision:prev.revision+1,source}));},()=>{if(live)setState(prev=>({row:null,loading:false,error:'Unable to read the current transport record.',revision:prev.revision+1,source}));});
  return()=>{live=false;stop();setState(previous=>previous.source===source?{...previous,row:null,source:''}:previous);};
 },[scope,id,source,validId]);
 return !id?{row:null,loading:false,error:'',revision:0}:!validId?{row:null,loading:false,error:'Shipment identifier is unavailable.',revision:0}:!db?{row:null,loading:false,error:'Firebase is unavailable.',revision:0}:state.source===source?state:{row:null,loading:true,error:'',revision:0};
}
