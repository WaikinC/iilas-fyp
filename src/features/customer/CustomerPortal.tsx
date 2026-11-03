import {useCallback,useEffect,useRef,useState} from 'react';
import {signOut} from 'firebase/auth';
import {MapContainer,Marker,Popup,TileLayer} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {auth,demoEnvironment} from '../../../lib/firebase';
import {workspaceCommand} from '../../../lib/workspace';
import {fetchCustomerProof,validateCustomerDetail,validateCustomerList,type CustomerDetail,type CustomerPage} from '../../../lib/customerPortal';
import type {Membership} from '../workspace/WorkspaceGate';
import './customer.css';
import {useAppNavigation} from '../navigation/AppNavigation';
type Profile=Omit<Membership,'workspaceId'>;
const time=(ms:number|null)=>ms===null?'Time unavailable':new Date(ms).toLocaleString();
export default function CustomerPortal({profile}:{profile:Profile}){return <CustomerBody key={`${profile.uid}:${profile.role}:${profile.version}:${profile.active}`} profile={profile}/>;}
function CustomerBody({profile}:{profile:Profile}){
 const routing=useAppNavigation(),routed=Boolean(routing),routeId=routing?.route.module==='customer'?routing.route.recordId:null;
 const [page,setPage]=useState<CustomerPage|null>(null),[pageIndex,setPageIndex]=useState(0),[cursors,setCursors]=useState<(string|null)[]>([null]),[loadedDetail,setDetail]=useState<CustomerDetail|null>(null),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[downloading,setDownloading]=useState(false),[error,setError]=useState('');
 const detail=routed?(loadedDetail?.shipmentId===routeId?loadedDetail:null):loadedDetail;
 const live=useRef(true),lifecycle=useRef(Symbol()),listEpoch=useRef(0),detailEpoch=useRef(0),listBusy=useRef(false),detailBusy=useRef(false),selection=useRef<string|null>(null),listView=useRef({index:0,cursor:null as string|null}),downloads=useRef(new Set<AbortController>()),urls=useRef(new Set<string>()),heading=useRef<HTMLHeadingElement>(null);
 const current=useCallback(()=>live.current&&auth?.currentUser?.uid===profile.uid&&profile.role==='Customer'&&profile.active&&profile.status==='Approved',[profile.uid,profile.role,profile.active,profile.status]);
 const clearProtected=useCallback(()=>{listEpoch.current++;detailEpoch.current++;listBusy.current=false;detailBusy.current=false;setPage(null);setPageIndex(0);setCursors([null]);listView.current={index:0,cursor:null};setDetail(null);selection.current=null;setLoading(false);setDetailLoading(false);for(const controller of downloads.current)controller.abort();},[]);
 const loadPage=useCallback(async(index:number,cursor:string|null)=>{
  if(!current()||listBusy.current)return;const gen=++listEpoch.current,life=lifecycle.current;listBusy.current=true;setLoading(true);setError('');
  try{const result=validateCustomerList(await workspaceCommand('getCustomerShipments',cursor?{cursor}:{}));if(gen!==listEpoch.current||life!==lifecycle.current||!current())return;setPage(result);setPageIndex(index);listView.current={index,cursor};setCursors(old=>{const next=old.slice(0,index+1);if(result.hasMore)next[index+1]=result.cursor;return next;});}
  catch{if(gen===listEpoch.current&&life===lifecycle.current&&current()){clearProtected();setError('Shipment access is unavailable. Refresh your access or contact the IILAS team.');}}
  finally{if(life===lifecycle.current&&gen===listEpoch.current){listBusy.current=false;if(current())setLoading(false);}}
 },[current,clearProtected]);
 const loadDetail=useCallback(async(shipmentId:string)=>{
  if(!current())return;const gen=++detailEpoch.current,life=lifecycle.current;selection.current=shipmentId;detailBusy.current=true;setDetailLoading(true);setDetail(null);setError('');
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
 useEffect(()=>{if(!routed)return;let active=true;if(routeId){/* Retired routes and StrictMode cleanup cancel before starting a read. */void Promise.resolve().then(()=>{if(active)return loadDetail(routeId);});}else{detailEpoch.current++;selection.current=null;for(const controller of downloads.current)controller.abort();}return()=>{active=false;};},[routeId,routed,loadDetail]);
 useEffect(()=>{if(detail)heading.current?.focus();},[detail]);
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
 function closeDetails(){if(routing){routing.go('customer');return;}detailEpoch.current++;selection.current=null;setDetail(null);setDetailLoading(false);for(const controller of downloads.current)controller.abort();}
 return <main className="customer-portal"><header className="customer-header"><div><b className="customer-brand">IILAS</b><h1>Your shipments</h1><p>{profile.displayName} · Customer access</p></div><button onClick={()=>auth&&void signOut(auth)}>Sign out</button></header>
  <p>You can view only shipments explicitly shared with this account. Updates are checked every 30 seconds while this page is visible. Location means the latest submitted point, when sharing is enabled during active delivery.</p>
  {error&&<p role="alert" className="error">{error}</p>}<button disabled={loading} onClick={()=>void loadPage(0,null)}>Refresh shipments</button>
  {loading?<p role="status">Loading your shipment page…</p>:page&&page.rows.length?<section className="customer-shipments" aria-label="Shared shipments">{page.rows.map(row=><article className="customer-shipment" key={row.shipmentId}><div><h2>{row.reference||'Reference unavailable'}</h2><p>{row.status} · Expected {row.expectedDelivery??'date unavailable'}</p></div><button aria-label={`View customer shipment ${row.shipmentId}`} onClick={()=>routing?routing.go('customer',row.shipmentId):void loadDetail(row.shipmentId)}>View shipment</button></article>)}</section>:page?<section className="customer-card"><h2>No shared shipments on this page</h2><p>The IILAS team must grant access to each shipment. Other customers’ shipments are not available.</p></section>:<section className="customer-card"><h2>Shipment list unavailable</h2><p>Refresh your access to check the current shared shipments.</p></section>}
  <nav className="customer-actions" aria-label="Shipment pages"><button disabled={loading||pageIndex===0} onClick={()=>void loadPage(pageIndex-1,cursors[pageIndex-1]??null)}>Previous shipment page</button><button disabled={loading||!page?.hasMore} onClick={()=>void loadPage(pageIndex+1,page?.cursor??null)}>Next shipment page</button><span>Page {pageIndex+1} · Up to 20 active grants checked per page.</span></nav>
  {page&&<p className="customer-caption">Access last checked {time(page.observedAtMs)}. {page.hasMore?'More grants may exist; use the next page.':'This is the end of this page sequence.'}</p>}
  {(!routed||routeId)&&detailLoading&&<p role="status">Checking shipment access…</p>}
  {detail&&<section className="customer-card" aria-label="Selected shipment"><div className="customer-detail-heading"><h2 ref={heading} tabIndex={-1}>Shipment details</h2><button onClick={closeDetails}>Close shipment details</button></div><h3>{detail.reference||'Reference unavailable'} · {detail.status}</h3><p>Expected delivery: {detail.expectedDelivery??'date unavailable'}. Observed {time(detail.observedAtMs)}.</p><button disabled={detailLoading} onClick={()=>void loadDetail(detail.shipmentId)}>Refresh shipment details</button>
   <h3>Delivery updates</h3><p>{detail.timeline.coverage}</p>{detail.timeline.rows.length?<ol className="customer-timeline">{detail.timeline.rows.map((event,i)=><li key={i}><b>{event.status}</b><span>{time(event.atMs)}</span></li>)}</ol>:<p>No timestamped updates are available in this view.</p>}
   {detail.location&&<section><h3>Latest submitted location</h3><p>Received by IILAS {time(detail.location.submittedAtMs)}. {detail.location.capturedAtMs!==undefined&&<>Captured {time(detail.location.capturedAtMs)}. {detail.observedAtMs-detail.location.capturedAtMs>120000?'This saved observation is over two minutes old. ':''}</>}Accuracy {detail.location.accuracy} m. This is a submitted observation, not continuous tracking.</p><MapContainer key={detail.shipmentId+':'+detail.location.submittedAtMs} center={[detail.location.latitude,detail.location.longitude]} zoom={13} className="customer-location-map" scrollWheelZoom={false} zoomAnimation={false} fadeAnimation={false} markerZoomAnimation={false}><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={[detail.location.latitude,detail.location.longitude]} icon={L.divIcon({className:'location-marker',html:'●',iconSize:[20,20]})}><Popup>Latest shared submitted point</Popup></Marker></MapContainer></section>}
   <h3>Current proof of delivery</h3>{detail.proof?<><p>{detail.proof.fileName} · {detail.proof.bytes.toLocaleString()} bytes</p><button disabled={downloading} onClick={()=>void downloadProof()}>Download current proof</button></>:<p>No eligible current proof is available for download.</p>}<p className="customer-caption">Access is checked again for each download. Revoking access blocks later requests; files already downloaded cannot be recalled.</p>
  </section>}
 </main>;
}
