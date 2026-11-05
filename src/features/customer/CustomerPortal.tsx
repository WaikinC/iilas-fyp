import {useCallback,useEffect,useRef,useState} from 'react';
import {signOut} from 'firebase/auth';
import {Package,ShoppingBag,Truck,LogOut,ShieldCheck} from 'lucide-react';
import {MapContainer,Marker,Popup,TileLayer} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {auth,demoEnvironment} from '../../../lib/firebase';
import {workspaceCommand} from '../../../lib/workspace';
import {fetchCustomerProof,validateCustomerDetail,validateCustomerList,validateCustomerProofIntegrity,type CustomerDetail,type CustomerPage,type CustomerProof,type CustomerProofIntegrity} from '../../../lib/customerPortal';
import SavedProofImage, {isProofImage} from '../../components/SavedProofImage';
import type {Membership} from '../workspace/WorkspaceGate';
import './customer.css';
import {useAppNavigation} from '../navigation/AppNavigation';
import CustomerOrders from './CustomerOrders';
import {OrderBadge,type OrderExitGuard} from './OrderElements';
type Profile=Omit<Membership,'workspaceId'>;
const time=(ms:number|null)=>ms===null?'Time unavailable':new Date(ms).toLocaleString();
export default function CustomerPortal({profile}:{profile:Profile}){return <CustomerSession key={`${profile.uid}:${profile.role}:${profile.version}:${profile.active}`} profile={profile}/>;}
function CustomerSession({profile}:{profile:Profile}){
 const navigation=useAppNavigation(),[localTab,setLocalTab]=useState<'orders'|'shipments'>('shipments'),tab=navigation?(navigation.route.module==='customerOrders'?'orders':'shipments'):localTab,exit=useRef<OrderExitGuard|null>(null);
 const registerExitGuard=useCallback((guard:OrderExitGuard|null)=>{exit.current=guard;},[]);
 const leave=(work:()=>void)=>{if(exit.current)exit.current(work);else work();};
 const select=(next:'orders'|'shipments')=>leave(()=>{if(navigation)navigation.go(next==='orders'?'customerOrders':'customer');else setLocalTab(next);});
 return <main className="customer-portal customer-workspace"><header className="customer-header"><div className="co-brand-lockup"><span className="co-logo"><Package size={24} aria-hidden="true"/></span><div><b className="customer-brand">IILAS</b><h1>Customer portal</h1><p>{profile.displayName}</p></div></div><button onClick={()=>leave(()=>{if(auth)void signOut(auth);})}><LogOut size={17} aria-hidden="true"/>Sign out</button></header><nav className="co-main-tabs" aria-label="Customer workspace"><button aria-current={tab==='orders'?'page':undefined} className={tab==='orders'?'active':''} onClick={()=>select('orders')}><ShoppingBag size={19} aria-hidden="true"/>Orders</button><button aria-current={tab==='shipments'?'page':undefined} className={tab==='shipments'?'active':''} onClick={()=>select('shipments')}><Truck size={19} aria-hidden="true"/>Delivery monitor</button></nav>{tab==='orders'?<CustomerOrders profile={profile} registerExitGuard={registerExitGuard}/>:<CustomerBody profile={profile}/>}<footer className="co-privacy-footer"><ShieldCheck size={16} aria-hidden="true"/>Your account shows only your own requests and shipments shared with you.</footer></main>;
}
function CustomerBody({profile}:{profile:Profile}){
 const routing=useAppNavigation(),routed=Boolean(routing),routeId=routing?.route.module==='customer'?routing.route.recordId:null;
 const [page,setPage]=useState<CustomerPage|null>(null),[pageIndex,setPageIndex]=useState(0),[cursors,setCursors]=useState<(string|null)[]>([null]),[loadedDetail,setDetail]=useState<CustomerDetail|null>(null),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[downloading,setDownloading]=useState(false),[error,setError]=useState('');
 const detail=routed?(loadedDetail?.shipmentId===routeId?loadedDetail:null):loadedDetail;
 const showingShipment=routed?Boolean(routeId):Boolean(detailLoading||detail);
 const [checking,setChecking]=useState(false),[proofCheck,setProofCheck]=useState<CustomerProofIntegrity|null>(null),checkEpoch=useRef(0);
 const live=useRef(true),lifecycle=useRef(Symbol()),listEpoch=useRef(0),detailEpoch=useRef(0),listBusy=useRef(false),detailBusy=useRef(false),selection=useRef<string|null>(null),listView=useRef({index:0,cursor:null as string|null}),downloads=useRef(new Set<AbortController>()),urls=useRef(new Set<string>()),heading=useRef<HTMLHeadingElement>(null);
 const current=useCallback(()=>live.current&&auth?.currentUser?.uid===profile.uid&&profile.role==='Customer'&&profile.active&&profile.status==='Approved',[profile.uid,profile.role,profile.active,profile.status]);
 const clearDetail=useCallback(()=>{
  detailEpoch.current++;
  checkEpoch.current++;
  detailBusy.current=false;
  selection.current=null;
  for(const controller of downloads.current)controller.abort();
  setDetail(null);
  setDetailLoading(false);
  setChecking(false);
  setProofCheck(null);
 },[]);
 const clearProtected=useCallback(()=>{listEpoch.current++;listBusy.current=false;setPage(null);setPageIndex(0);setCursors([null]);listView.current={index:0,cursor:null};setLoading(false);clearDetail();},[clearDetail]);
 const loadPage=useCallback(async(index:number,cursor:string|null)=>{
  if(!current()||listBusy.current)return;const gen=++listEpoch.current,life=lifecycle.current;listBusy.current=true;setLoading(true);setError('');
  try{const result=validateCustomerList(await workspaceCommand('getCustomerShipments',cursor?{cursor}:{}));if(gen!==listEpoch.current||life!==lifecycle.current||!current())return;setPage(result);setPageIndex(index);listView.current={index,cursor};setCursors(old=>{const next=old.slice(0,index+1);if(result.hasMore)next[index+1]=result.cursor;return next;});}
  catch{if(gen===listEpoch.current&&life===lifecycle.current&&current()){clearProtected();setError('Shipment access is unavailable. Refresh your access or contact the IILAS team.');}}
  finally{if(life===lifecycle.current&&gen===listEpoch.current){listBusy.current=false;if(current())setLoading(false);}}
 },[current,clearProtected]);
 const loadDetail=useCallback(async(shipmentId:string)=>{
  if(!current())return;
  const gen=++detailEpoch.current,life=lifecycle.current;
  if(selection.current!==shipmentId)for(const controller of downloads.current)controller.abort();
  selection.current=shipmentId;
  detailBusy.current=true;
  checkEpoch.current++;
  setProofCheck(null);
  setChecking(false);
  setDetailLoading(true);
  setDetail(previous=>previous?.shipmentId===shipmentId?previous:null);
  setError('');
  try{const result=validateCustomerDetail(await workspaceCommand('getCustomerShipment',{shipmentId}));if(gen!==detailEpoch.current||life!==lifecycle.current||!current())return;if(result.shipmentId!==shipmentId)throw Error('Different shipment');setDetail(result);}
  catch{if(gen===detailEpoch.current&&life===lifecycle.current&&current()){clearProtected();setError('This shipment access is unavailable. Refresh your shipments before continuing.');}}
  finally{if(life===lifecycle.current&&gen===detailEpoch.current){detailBusy.current=false;if(current())setDetailLoading(false);}}
 },[current,clearProtected]);
 useEffect(()=>{
  live.current=true;async function initial(){await loadPage(0,null);}void initial();
  const refresh=()=>{if(document.visibilityState!=='visible'||!current())return;const view=listView.current;if(!listBusy.current)void loadPage(view.index,view.cursor);if(selection.current&&!detailBusy.current)void loadDetail(selection.current);};
  const interval=setInterval(refresh,30000);window.addEventListener('focus',refresh);
  const controllers=downloads.current,objectUrls=urls.current;
  return()=>{live.current=false;lifecycle.current=Symbol();listBusy.current=false;detailBusy.current=false;clearInterval(interval);window.removeEventListener('focus',refresh);for(const controller of controllers)controller.abort();for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls.clear();};
 },[current,loadPage,loadDetail]);
 useEffect(()=>{
  if(!routed)return;
  let active=true;
  void Promise.resolve().then(()=>{
   if(!active)return;
   if(routeId)return loadDetail(routeId);
   clearDetail();
  });
  return()=>{active=false;};
 },[routeId,routed,loadDetail,clearDetail]);
 const focusedShipment=detail?.shipmentId;
 useEffect(()=>{if(focusedShipment)heading.current?.focus();},[focusedShipment]);
 async function downloadProof(){
  if(!detail?.proof||!auth?.currentUser||!current()||downloading)return;const original=detail,gen=detailEpoch.current,life=lifecycle.current,controller=new AbortController();downloads.current.add(controller);setDownloading(true);setError('');
  const timer=setTimeout(()=>controller.abort(),20000);let rejectAbort:((reason:Error)=>void)|undefined;
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;}),onAbort=()=>rejectAbort?.(Error('Download closed.'));controller.signal.addEventListener('abort',onAbort,{once:true});
  try{
   const blob=await Promise.race([fetchCustomerProof({user:auth.currentUser,customerUid:profile.uid,shipmentId:original.shipmentId,proof:original.proof!,environment:demoEnvironment,siteUrl:window.location.href,isCurrent:current,signal:controller.signal}),aborted]);
   if(gen!==detailEpoch.current||life!==lifecycle.current||!current())return;const url=URL.createObjectURL(blob);urls.current.add(url);const link=document.createElement('a');link.href=url;link.download=original.proof!.fileName;document.body.append(link);link.click();link.remove();setTimeout(()=>{if(urls.current.delete(url))URL.revokeObjectURL(url);},0);
  }catch{if(gen===detailEpoch.current&&life===lifecycle.current&&current()){clearProtected();setError('The current proof could not be authorised or downloaded. Refresh your shipments.');}}
  finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);downloads.current.delete(controller);if(current())setDownloading(false);}
 }
 function closeDetails(){clearDetail();routing?.go('customer');}
 async function checkIntegrity(){if(!detail?.proof||checking||!current())return;const selected=detail,gen=detailEpoch.current,life=lifecycle.current,epoch=++checkEpoch.current;setChecking(true);setProofCheck(null);setError('');try{const result=validateCustomerProofIntegrity(await workspaceCommand('checkCustomerProofIntegrity',{shipmentId:selected.shipmentId,evidenceId:selected.proof!.evidenceId}));if(epoch!==checkEpoch.current||gen!==detailEpoch.current||life!==lifecycle.current||!current())return;if(result.shipmentId!==selected.shipmentId||result.evidenceId!==selected.proof!.evidenceId)throw Error('Different proof');setProofCheck(result);}catch{if(epoch===checkEpoch.current&&gen===detailEpoch.current&&life===lifecycle.current&&current()){clearProtected();setError('The current proof could not be authorised for checking. Refresh your shipments.');}}finally{if(epoch===checkEpoch.current&&current())setChecking(false);}}
 return <section className="customer-shipments-view">
  <header className="co-view-heading">
   <div><h2>Delivery monitoring</h2><p>Track your shipments, check delivery updates and view saved proof.</p></div>
  </header>
  {error&&<p role="alert" className="error">{error}</p>}
  {!showingShipment&&<>
   <div className="customer-monitor-heading"><h3>Your shipments</h3><button disabled={loading} onClick={()=>void loadPage(0,null)}>Refresh shipments</button></div>
   {loading?<p role="status">Loading your shipment page…</p>:page&&page.rows.length?
    <section className="customer-shipments" aria-label="Shared shipments">
     {page.rows.map(row=><article className="customer-shipment" key={row.shipmentId}>
      <div><h4>{row.reference||'Reference unavailable'}</h4><OrderBadge status={row.status}/><p>Expected {row.expectedDelivery??'date unavailable'}</p></div>
      <button aria-label={`View customer shipment ${row.shipmentId}`} onClick={()=>routing?routing.go('customer',row.shipmentId):void loadDetail(row.shipmentId)}>View customer shipment</button>
     </article>)}
    </section>:page?<section className="customer-card"><h4>No shared shipments on this page</h4><p>Shipments appear here once the IILAS team shares access with your account.</p></section>:
    <section className="customer-card"><h4>Shipment list unavailable</h4><p>Refresh your shipments to check your current access.</p></section>}
   <nav className="customer-actions" aria-label="Shipment pages">
    <button disabled={loading||pageIndex===0} onClick={()=>void loadPage(pageIndex-1,cursors[pageIndex-1]??null)}>Previous shipment page</button>
    <button disabled={loading||!page?.hasMore} onClick={()=>void loadPage(pageIndex+1,page?.cursor??null)}>Next shipment page</button>
    <span>Page {pageIndex+1} · Up to 20 active grants checked per page.</span>
   </nav>
   {page&&<p className="customer-caption">Access last checked {time(page.observedAtMs)}.</p>}
  </>}
  {showingShipment&&!detail&&<button onClick={closeDetails}>Close shipment details</button>}
  {showingShipment&&detailLoading&&!detail&&<p role="status">Checking shipment access…</p>}
  {detail&&<section aria-label="Selected shipment" className="customer-delivery-monitor">
   <div className="customer-card">
    <div className="customer-detail-heading">
     <h2 ref={heading} tabIndex={-1}>Shipment details</h2>
     <button onClick={closeDetails}>Close shipment details</button>
    </div>
    <div className="customer-monitor-heading"><h3>{detail.reference||'Reference unavailable'}</h3><OrderBadge status={detail.status}/></div>
    <p>Expected delivery {detail.expectedDelivery??'date unavailable'}</p>
    <div className="customer-actions">
     <button disabled={detailLoading} onClick={()=>void loadDetail(detail.shipmentId)}>Refresh shipment details</button>
     <span className="customer-caption">Last checked {time(detail.observedAtMs)}</span>
    </div>
   </div>
   <div className="customer-monitor-grid">
    <section className="customer-card">
     <h3>Delivery updates</h3>
     {detail.timeline.rows.length?<ol className="customer-timeline">
      {detail.timeline.rows.map((event,i)=><li key={i}><b>{event.status}</b><span>{time(event.atMs)}</span></li>)}
     </ol>:<p>No timestamped updates are available yet.</p>}
     <p className="customer-caption">{detail.timeline.coverage} The monitor refreshes every 30 seconds while visible.</p>
    </section>
    <div className="customer-monitor-side">
     <section className="customer-card">
      <h3>{detail.location?'Latest submitted location':'Delivery location'}</h3>
      {detail.location?<><p>Received by IILAS {time(detail.location.submittedAtMs)}. {detail.location.capturedAtMs!==undefined&&<>Captured {time(detail.location.capturedAtMs)}. {detail.observedAtMs-detail.location.capturedAtMs>120000?'This saved observation is over two minutes old. ':''}</>}Accuracy {detail.location.accuracy} m.</p>
       <MapContainer key={detail.shipmentId+':'+detail.location.submittedAtMs} center={[detail.location.latitude,detail.location.longitude]} zoom={13} className="customer-location-map" scrollWheelZoom={false} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false}>
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        <Marker position={[detail.location.latitude,detail.location.longitude]} icon={L.divIcon({className:'location-marker',html:'●',iconSize:[20,20]})}><Popup>Latest shared submitted point</Popup></Marker>
       </MapContainer></>:<p>No location is currently shared for this delivery.</p>}
     </section>
     <section className="customer-card">
      <h3>Current proof of delivery</h3>
      {detail.proof?<>
       {isProofImage(detail.proof.contentType)?
        <CustomerProofPhoto key={JSON.stringify([detail.shipmentId,detail.proof.evidenceId,detail.proof.contentType,detail.proof.bytes,detail.proof.fileName])} shipmentId={detail.shipmentId} proof={detail.proof} customerUid={profile.uid} isCurrent={current}/>:
        <p>{detail.proof.fileName} · PDF</p>}
       <div className="co-actions">
        <button className="co-primary" disabled={downloading} onClick={()=>void downloadProof()}>Download current proof</button>
        <button disabled={checking} onClick={()=>void checkIntegrity()}>{checking?'Checking proof…':'Check proof integrity'}</button>
       </div>
       {proofCheck&&<div className="co-proof-result" role="status"><OrderBadge status={proofCheck.outcome}/><p>{proofCheck.outcome==='Verified'?'The current proof matches its registered hash.':proofCheck.outcome==='NotRegistered'?'This proof has not been registered. The IILAS team can register it.':proofCheck.outcome==='Unmatched'?'The check found a mismatch. Contact the IILAS team.':'A current check is unavailable. Refresh and try again.'}</p><small>Checked {time(proofCheck.checkedAtMs)}</small></div>}
      </>:<p>The current proof appears here once the delivery is complete and the proof is shared.</p>}
     </section>
    </div>
   </div>
  </section>}
 </section>;
}

function CustomerProofPhoto({shipmentId, proof, customerUid, isCurrent}: {shipmentId: string; proof: CustomerProof; customerUid: string; isCurrent: () => boolean}) {
 const {evidenceId, fileName, contentType, bytes} = proof;
 const load = useCallback(async (signal: AbortSignal) => {
  const user = auth?.currentUser;
  if (!user) throw Error('Proof access is unavailable.');
  return fetchCustomerProof({
   user, customerUid, shipmentId, proof: {evidenceId, fileName, contentType, bytes},
   environment: demoEnvironment, siteUrl: window.location.href, isCurrent, signal,
  });
 }, [customerUid, shipmentId, evidenceId, fileName, contentType, bytes, isCurrent]);
 return <SavedProofImage fileName={fileName} contentType={contentType} bytes={bytes} load={load}/>;
}
