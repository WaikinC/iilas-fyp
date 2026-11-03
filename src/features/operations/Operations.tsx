import type {Membership} from '../workspace/WorkspaceGate';
import ReportsWorkspace from './ReportsWorkspace';
import Procurement from './Procurement';
import FleetManagement from './FleetManagement';
import TransportManagement from './TransportManagement';
import DeliveryMonitoring from './DeliveryMonitoring';

export type DataRecord={id:string;version:number;[key:string]:unknown};
type OperationsProps={mode:'procurement'|'fleet'|'transport'|'delivery'|'reports';member:Membership;products:DataRecord[];shipments:DataRecord[]};
export default function Operations(props:OperationsProps){return props.mode==='procurement'?<Procurement member={props.member} products={props.products}/>:props.mode==='reports'?<ReportsWorkspace member={props.member} products={props.products} shipments={props.shipments}/>:props.mode==='fleet'?<FleetManagement member={props.member} shipments={props.shipments}/>:props.mode==='transport'?<TransportManagement member={props.member} shipments={props.shipments}/>:<DeliveryMonitoring member={props.member} shipments={props.shipments}/>;}
