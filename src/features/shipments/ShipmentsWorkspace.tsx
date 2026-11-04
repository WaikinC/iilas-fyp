import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useRecordCreation} from '../workspace/RecordCreationProvider';
import {deleteRecord,saveRecord} from '../../../lib/firebase';
import ShipmentWorkspaceController,{type ShipmentControllerProps,type ShipmentExitGuard} from './ShipmentWorkspaceController';
import CustomerOrderReview from './CustomerOrderReview';
import {useAppNavigation} from '../navigation/AppNavigation';
import useShipmentPlan from './useShipmentPlan';
import type {ShipmentCommandPorts} from './shipmentCommands';
const existingCommands={save:(input:Parameters<ShipmentCommandPorts['save']>[0],original:Parameters<ShipmentCommandPorts['save']>[1])=>saveRecord('shipments',input,original),remove:(original:Parameters<ShipmentCommandPorts['remove']>[0])=>deleteRecord('shipments',original)};
export default function ShipmentsWorkspace(props:Omit<ShipmentControllerProps,'commands'|'usePlan'>){
 const creation=useRecordCreation('shipments'),navigation=useAppNavigation(),[view,setView]=useState<'shipments'|'orders'>('shipments'),active=useRef(view),shipmentGuard=useRef<ShipmentExitGuard>(null),orderGuard=useRef<ShipmentExitGuard>(null);
 useLayoutEffect(()=>{active.current=view;},[view]);
 const registerShipment=useCallback((guard:ShipmentExitGuard)=>{shipmentGuard.current=guard;},[]),registerOrder=useCallback((guard:ShipmentExitGuard)=>{orderGuard.current=guard;},[]),registerParent=props.registerExitGuard;
 useEffect(()=>{const guard=Object.assign((proceed:()=>void,cancel?:()=>void)=>{const inner=active.current==='orders'?orderGuard.current:shipmentGuard.current;if(inner)inner(proceed,cancel);else proceed();},{beforeUnload:()=>Boolean((active.current==='orders'?orderGuard.current:shipmentGuard.current)?.beforeUnload?.())});registerParent(guard);return()=>registerParent(null);},[registerParent]);
 const start=creation.start,commands=useMemo<ShipmentCommandPorts>(()=>({...existingCommands,create:input=>{const {reference:_locked,...data}=input;void _locked;return start({...data,items:data.items.map(({productId,quantity})=>({productId,quantity}))});}}),[start]);
 function change(next:'shipments'|'orders'){if(next===view)return;const guard=view==='orders'?orderGuard.current:shipmentGuard.current;const proceed=()=>setView(next);if(guard)guard(proceed);else proceed();}
 return <div className="shipment-module"><nav className="co-module-tabs" aria-label="Order and dispatch workspace"><button className={view==='shipments'?'active':''} aria-pressed={view==='shipments'} onClick={()=>change('shipments')}>Shipments</button><button className={view==='orders'?'active':''} aria-pressed={view==='orders'} onClick={()=>change('orders')}>Customer orders</button></nav><div hidden={view!=='shipments'}><ShipmentWorkspaceController {...props} registerExitGuard={registerShipment} commands={commands} usePlan={useShipmentPlan} creationBlocked={creation.busy||Boolean(creation.pending)}/></div>{view==='orders'&&<CustomerOrderReview key={props.member.uid+':'+props.member.version} profile={props.member} products={props.products} registerExitGuard={registerOrder} onOpenShipment={id=>{setView('shipments');navigation?.go('shipments',id);}}/>}</div>;
}
