import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {getActiveWorkspace} from '../../../../lib/workspace';
import type {Membership} from '../../workspace/WorkspaceGate';
import Field from '../../../components/FormField';
import EvidenceUpload from '../EvidenceUpload';
import DeliveryRiskDemo from '../DeliveryRiskDemo';
import {deliverySignals} from '../deliverySignals';
import DeliveryDetailView from './DeliveryDetailView';
import LatestLocationMap from './LatestLocationMap';
import {canUpdateDelivery,deliveryWorkspaceKey,nextDeliveryStatuses,recordedLocation,type DeliveryQueueEntry,type DeliveryRow,type DeliveryTask} from './deliveryPresentation';
import {blocksDeliveryNavigation,deliveryContextCurrent,deliveryOutcomeCurrent,type DeliveryContextIdentity,type EvidenceActivity} from './deliveryActivity';
export default function DeliveryShipmentContext({entry,location,evidence,member,visible,busy,onBack,command,onActivityChange,onRecoveryChange,refreshKey}:{entry:DeliveryQueueEntry;location?:DeliveryRow;evidence:DeliveryRow[];member:Membership;visible:boolean;busy:boolean;onBack:()=>void;command:(action:string,input:object,current:()=>boolean,publish?:()=>boolean)=>Promise<boolean>;onActivityChange:(key:string,activity:EvidenceActivity|null)=>void;onRecoveryChange:()=>void;refreshKey:number}){
 const {shipment,delivery,status}=entry;
 const [tasks,setTasks]=useState<ReadonlySet<DeliveryTask>>(()=>new Set(['progress']));
 const [activity,setActivity]=useState<EvidenceActivity|null>(null),[geoError,setGeoError]=useState(''),[currentTime,setCurrentTime]=useState(()=>Date.now());
 const activityCallback=useCallback((key:string,next:EvidenceActivity|null)=>{setActivity(old=>next===null&&old?.contextKey!==key?old:next);onActivityChange(key,next);},[onActivityChange]);
 const current=useRef<DeliveryContextIdentity|null>(null),generation=useRef(0);
 useLayoutEffect(()=>{const activation=++generation.current;return()=>{generation.current=activation+1;};},[member.uid,member.workspaceId,member.role,member.version,shipment.id,shipment.version,shipment.driverUid,visible]);
 useLayoutEffect(()=>{current.current={workspaceKey:deliveryWorkspaceKey(member),shipmentId:shipment.id,shipmentVersion:shipment.version,deliveryVersion:delivery?.version??0,driverUid:String(shipment.driverUid??''),visible,generation:generation.current};return()=>{current.current=null;};},[member,shipment.id,shipment.version,shipment.driverUid,delivery?.version,visible]);
 useEffect(()=>{const timer=setInterval(()=>setCurrentTime(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const capture=()=>{const identity=current.current;return ()=>{const workspace=getActiveWorkspace();return !!identity&&identity===current.current&&workspace?.uid===member.uid&&workspace.workspaceId===member.workspaceId&&deliveryContextCurrent(identity,current.current);};};
 const capturePublication=(expectedVersion:number)=>{const identity=current.current;return ()=>{const workspace=getActiveWorkspace();return !!identity&&workspace?.uid===member.uid&&workspace.workspaceId===member.workspaceId&&deliveryOutcomeCurrent(identity,current.current,expectedVersion);};};
 const allowed=canUpdateDelivery(member,shipment,delivery),signals=deliverySignals(shipment,delivery,currentTime);
 function task(key:DeliveryTask,open:boolean){if(key==='evidence'&&!open&&blocksDeliveryNavigation(activity))return;setTasks(old=>{const next=new Set(old);if(open)next.add(key);else next.delete(key);return next;});}
 function submitPosition(){const isCurrent=capture();setGeoError('');if(!navigator.geolocation){setGeoError('Location is unavailable in this browser.');return;}navigator.geolocation.getCurrentPosition(position=>{if(isCurrent())void command('location',{shipmentId:shipment.id,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy},isCurrent);},error=>{if(isCurrent())setGeoError(error.code===1?'Location permission was denied. You can continue without sharing it.':'Unable to obtain your location.');},{enableHighAccuracy:true,timeout:15000,maximumAge:0});}
 return <div hidden={!visible}><DeliveryDetailView entry={entry} active={visible} onBack={onBack} openTasks={tasks} onTaskChange={task} blockingActivity={activity} sections={{
 progress:<>{signals.length>0&&<p className="delivery-attention">Review alerts: {signals.join(' · ')}. These are rule checks, not AI predictions.</p>}{allowed?<form className="operations-form" onSubmit={e=>{e.preventDefault();const input={...Object.fromEntries(new FormData(e.currentTarget)),shipmentId:shipment.id,version:delivery?.version??0};const isCurrent=capture();const publish=capturePublication((delivery?.version??0)+1);if(isCurrent())void command('delivery',input,isCurrent,publish);}}><Field label="Next delivery status"><select name="status" required>{nextDeliveryStatuses(status).map(s=><option key={s}>{s}</option>)}</select></Field><Field label="Delivery notes"><input name="notes" minLength={3} maxLength={500} required/></Field><Field label="Proof of delivery"><select name="proofId"><option value="">Choose evidence when delivered</option>{evidence.filter(e=>e.type==='Proof of Delivery').map(e=><option key={e.id} value={e.id}>{String(e.name??e.id)}</option>)}</select></Field><button className="primary" disabled={busy}>Record delivery event</button></form>:<p>{status==='Delivered'||status==='Returned'?'This delivery is closed. Its saved records remain available.':'Your current role or recorded status allows viewing only.'}</p>}</>,
 evidence:<EvidenceUpload shipment={shipment} member={member} stage="Delivery" evidence={evidence} onActivityChange={activityCallback}/>,
 risk:<DeliveryRiskDemo member={member} shipment={shipment} delivery={delivery} showLocalRecovery={false} onRecoveryChange={onRecoveryChange} refreshKey={refreshKey}/>,
 location:<>{allowed&&<button disabled={busy} onClick={submitPosition}>Share my current location</button>}{geoError&&<p role="alert">{geoError}</p>}{visible&&tasks.has('location')&&(location&&recordedLocation(location)?<LatestLocationMap location={location}/>:<p>No valid recorded location is available.</p>)}</>
 }}/></div>;
}
