import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {db} from '../../../lib/firebase';
import {workspaceCommand} from '../../../lib/workspace';
import type {Membership} from '../workspace/WorkspaceGate';
import Pagination,{usePagination} from '../../components/Pagination';
import CustomerShipmentAccess from './CustomerShipmentAccess';
import PreDispatchEvidence from './PreDispatchEvidence';
import {DeliveryRiskRecovery,DeliveryRiskReviewQueue} from './DeliveryRiskDemo';
import DeliveryWorkspaceView from './delivery/DeliveryWorkspaceView';
import DeliveryQueue from './delivery/DeliveryQueue';
import DeliveryShipmentContext from './delivery/DeliveryShipmentContext';
import {deliveryWorkspaceKey,selectDeliveryRows,type DeliveryArea,type DeliveryRow} from './delivery/deliveryPresentation';
import {blocksDeliveryNavigation,type EvidenceActivity} from './delivery/deliveryActivity';
function useRecords(kind:string,scope:string){const [records,setRecords]=useState<DeliveryRow[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);useEffect(()=>db?onSnapshot(query(collection(db,kind),where('ownerId','==',scope)),s=>{setRecords(s.docs.map(d=>({id:d.id,...d.data()} as DeliveryRow)));setLoading(false);setError('');},e=>{setError(e.message);setLoading(false);}):undefined,[kind,scope]);return {records,error,loading};}
export default function DeliveryMonitoring(props:{member:Membership;shipments:DeliveryRow[]}){const m=props.member;if(!m.active||m.status!=='Approved'||!['Admin','Manager','Inventory','Warehouse','Logistics','Driver','Viewer'].includes(m.role))return <p role="status">Approved staff access is required for Delivery Monitoring.</p>;return <DeliveryBody key={deliveryWorkspaceKey(m)} {...props}/>;}
function DeliveryBody({member,shipments}:{member:Membership;shipments:DeliveryRow[]}){
 const deliveries=useRecords('deliveries',member.workspaceId),locations=useRecords('locations',member.workspaceId),approvals=useRecords('approvals',member.workspaceId),evidence=useRecords('evidence',member.workspaceId);
 const [area,setArea]=useState<DeliveryArea>('deliveries'),[selected,setSelected]=useState(''),[filters,setFilters]=useState({search:'',status:''}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[activities,setActivities]=useState<Record<string,EvidenceActivity>>({});
 const busyRef=useRef(false),queueHeading=useRef<HTMLHeadingElement>(null),opener=useRef('');
 const refresh=useCallback(()=>setRevision(v=>v+1),[]);
 const report=useCallback((key:string,next:EvidenceActivity|null)=>setActivities(old=>{if(next===null){if(!old[key])return old;const copy={...old};delete copy[key];return copy;}if(old[key]&&JSON.stringify(old[key])===JSON.stringify(next))return old;return {...old,[key]:next};}),[]);
 const all=useMemo(()=>selectDeliveryRows(shipments,deliveries.records,member,{search:'',status:''}),[shipments,deliveries.records,member]);
 const rows=useMemo(()=>selectDeliveryRows(shipments,deliveries.records,member,filters),[shipments,deliveries.records,member,filters]),page=usePagination(rows,10);
 const blocker=Object.values(activities).find(blocksDeliveryNavigation)??null;
 function chooseArea(next:DeliveryArea){if(blocker){setNotice('Finish the active evidence task before leaving.');return;}setArea(next);}
 function open(id:string){if(blocker)return;opener.current=`delivery-open-${id}`;setSelected(id);}
 function back(){if(blocker)return;setSelected('');requestAnimationFrame(()=>{const button=document.getElementById(opener.current);if(button&&button.getClientRects().length)button.focus();else queueHeading.current?.focus();});}
 async function command(action:string,input:object,current:()=>boolean,publish=current){if(busyRef.current||!current())return false;busyRef.current=true;setBusy(true);setError('');setNotice('');try{await workspaceCommand(action,input);if(publish())setNotice('Saved successfully.');return true;}catch(e){if(publish())setError(e instanceof Error?e.message:'Unable to save.');return false;}finally{busyRef.current=false;setBusy(false);}}
 const sourceError=[deliveries,locations,approvals,evidence].some(x=>x.error),hasSelection=all.some(x=>x.shipment.id===selected);
 return <DeliveryWorkspaceView area={area} onAreaChange={chooseArea} idPrefix="delivery" feedback={<>{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success-notice">{notice}</p>}{sourceError&&<p role="alert" className="error">Unable to load some records. Check your connection and account access.</p>}{blocker&&<p className="delivery-attention" role="status">An evidence task is active. <button onClick={()=>{setArea(blocker.stage==='Pre-dispatch'?'prepared':'deliveries');if(blocker.stage==='Delivery')setSelected(blocker.shipmentId);}}>Return to active evidence</button></p>}</>} recovery={<DeliveryRiskRecovery member={member} onRecovered={refresh}/>} panels={{
 deliveries:<><section className="module-card operations-card" hidden={hasSelection}><h2 ref={queueHeading} tabIndex={-1}>Deliveries</h2><div className="delivery-filters"><label>Search deliveries<input value={filters.search} onChange={e=>{setFilters(f=>({...f,search:e.target.value}));page.setPage(1);}} placeholder="Reference, recipient or destination"/></label><label>Delivery status<select value={filters.status} onChange={e=>{setFilters(f=>({...f,status:e.target.value}));page.setPage(1);}}><option value="">All statuses</option>{['Dispatched','In Transit','Attempt Failed','Delivered','Returned','Unknown'].map(s=><option key={s}>{s}</option>)}</select></label></div><DeliveryQueue rows={page.pageItems} loading={deliveries.loading} error={deliveries.error?'Unable to load delivery records. Check your connection and account access.':''} onOpen={open}/><Pagination {...page} label="Deliveries"/></section>{selected&&!hasSelection&&<p role="status">The selected shipment is no longer available in your authorised deliveries.</p>}{all.map(entry=><DeliveryShipmentContext key={entry.shipment.id} entry={entry} location={locations.records.find(l=>l.id===entry.shipment.id)} evidence={evidence.records.filter(e=>e.shipmentId===entry.shipment.id)} member={member} visible={area==='deliveries'&&entry.shipment.id===selected} busy={busy} onBack={back} command={command} onActivityChange={report} onRecoveryChange={refresh} refreshKey={revision}/>)}</>,
 reviews:<DeliveryRiskReviewQueue member={member} showLocalRecovery={false} onRecoveryChange={refresh} refreshKey={revision}/>,
 prepared:['Admin','Manager','Logistics'].includes(member.role)?<PreDispatchEvidence member={member} shipments={shipments} evidence={evidence.records} onActivityChange={report}/>:<p>Your role allows viewing delivery records. Pre-dispatch evidence is managed by Logistics.</p>,
 customers:['Admin','Manager','Logistics'].includes(member.role)?<CustomerShipmentAccess member={member} shipments={shipments}/>:<p>Customer access is managed by Logistics, an Admin or a Manager.</p>
 }}/>;
}
