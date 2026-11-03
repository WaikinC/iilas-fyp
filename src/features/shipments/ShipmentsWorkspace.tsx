import {useMemo} from 'react';
import {useRecordCreation} from '../workspace/RecordCreationProvider';
import {deleteRecord,saveRecord} from '../../../lib/firebase';
import ShipmentWorkspaceController,{type ShipmentControllerProps} from './ShipmentWorkspaceController';
import useShipmentPlan from './useShipmentPlan';
import type {ShipmentCommandPorts} from './shipmentCommands';
const existingCommands={save:(input:Parameters<ShipmentCommandPorts['save']>[0],original:Parameters<ShipmentCommandPorts['save']>[1])=>saveRecord('shipments',input,original),remove:(original:Parameters<ShipmentCommandPorts['remove']>[0])=>deleteRecord('shipments',original)};
export default function ShipmentsWorkspace(props:Omit<ShipmentControllerProps,'commands'|'usePlan'>){const creation=useRecordCreation('shipments');const start=creation.start;const commands=useMemo<ShipmentCommandPorts>(()=>({...existingCommands,create:input=>{const {reference:_locked,...data}=input;return start({...data,items:data.items.map(({productId,quantity})=>({productId,quantity}))});}}),[start]);return <ShipmentWorkspaceController {...props} commands={commands} usePlan={useShipmentPlan} creationBlocked={creation.busy||Boolean(creation.pending)}/>;}
