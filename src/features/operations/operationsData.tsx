import {sessionRecoveryStorage} from '../../../lib/firebaseRuntime';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {collection,documentId,getDocs,limit,orderBy,query,startAfter,where,type QueryDocumentSnapshot} from 'firebase/firestore';
import {auth,db} from '../../../lib/firebase';
import {getActiveWorkspace,workspaceCommand} from '../../../lib/workspace';
import {createCompletionClient} from '../../../lib/completionClient';
import {completionExact,completionIdentifier} from '../../../lib/completionWorkflow';
import type {CompletionInput} from '../../../lib/completionWorkflow';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
export const operationRoles=['Admin','Manager','Logistics'];
export const recordValue=(r:DataRecord,key:string)=>String(r[key]??'Unknown');
export function formFields(form:HTMLFormElement){return Object.fromEntries(new FormData(form));}
export function numericField(value:unknown){return typeof value==='string'&&value.trim()?Number(value):NaN;}
export function useOperationPage(kind:string,scope:string,revision:number,filters:Record<string,string>={}){
 const signature=JSON.stringify([kind,scope,revision,filters]);
 const [navigation,setNavigation]=useState({signature:'',page:0}),[data,setData]=useState<{key:string;rows:DataRecord[];loading:boolean;error:string}>({key:'',rows:[],loading:true,error:''});
 const page=navigation.signature===signature?navigation.page:0,key=signature+':'+page,trail=useRef<{signature:string;cursors:QueryDocumentSnapshot[];last:QueryDocumentSnapshot|null}>({signature:'',cursors:[],last:null});
 useEffect(()=>{let live=true;async function load(){if(!db)return;if(trail.current.signature!==signature)trail.current={signature,cursors:[],last:null};setData({key,rows:[],loading:true,error:''});
  const [, , ,activeFilters]=JSON.parse(signature) as [string,string,number,Record<string,string>];
  try{const s=await getDocs(query(collection(db,kind),where('ownerId','==',scope),...Object.entries(activeFilters).filter(([,v])=>v!=='').map(([k,v])=>where(k,'==',v)),orderBy(documentId()),...(page&&trail.current.cursors[page-1]?[startAfter(trail.current.cursors[page-1])]:[]),limit(20)));if(live){trail.current.last=s.docs.at(-1)??null;setData({key,rows:s.docs.map(d=>({id:d.id,...d.data()} as DataRecord)),loading:false,error:''});}}
  catch(e){if(live)setData({key,rows:[],loading:false,error:e instanceof Error?e.message:'Records unavailable.'});}}
  void load();return()=>{live=false;};
 },[kind,scope,signature,key,page]);
 return {rows:data.key===key?data.rows:[],page,error:data.key===key?data.error:'',loading:data.key!==key||data.loading,older:()=>{const c=trail.current;if(c.signature===signature&&c.last){c.cursors[page]=c.last;setNavigation({signature,page:page+1});}},newer:()=>setNavigation({signature,page:Math.max(0,page-1)})};
}
export function OperationPager({page,label}:{page:ReturnType<typeof useOperationPage>;label:string}){return <div className="integrity-actions"><button type="button" disabled={page.loading||!page.page} onClick={page.newer}>Newer {label}</button><button type="button" disabled={page.loading||page.rows.length<20} onClick={page.older}>Older {label}</button><small>Page {page.page+1}. Up to 20 records per page; other pages are not included in this view.</small></div>;}
export function useAssignments(scope:string,kind:'vehicles'|'drivers',rows:DataRecord[],revision:number){
 const signature=JSON.stringify([scope,kind,rows.map(r=>r.id),revision]),[data,setData]=useState<{signature:string;rows:{id:string;shipmentId:string}[];error:string}>({signature:'',rows:[],error:''});
 useEffect(()=>{let live=true;async function load(){if(!db)return;const [scope,kind,ids]=JSON.parse(signature) as [string,string,string[]];const keys=ids.map(id=>`${scope}_${kind==='vehicles'?'vehicle':'driver'}_${id}`);
  try{let records:{id:string;shipmentId:string}[]=[];if(keys.length){const result=completionExact(await workspaceCommand('getFleetAssignments',{kind,resourceIds:ids}),['kind','resourceIds','rows','observedAtMs']);if(result.kind!==kind||JSON.stringify(result.resourceIds)!==JSON.stringify(ids)||!Array.isArray(result.rows)||result.rows.length>20||typeof result.observedAtMs!=='number'||!Number.isFinite(result.observedAtMs))throw Error('Assignment response differs.');records=result.rows.map(value=>{const r=completionExact(value,['id','shipmentId']);if(typeof r.id!=='string'||!keys.includes(r.id))throw Error('Assignment identity differs.');return {id:r.id,shipmentId:completionIdentifier(r.shipmentId)};});if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('Duplicate assignment.');}if(live)setData({signature,rows:records,error:''});}catch{if(live)setData({signature,rows:[],error:'Current assignment status could not be checked. Refresh this page.'});}}
  void load();return()=>{live=false;};
 },[signature]);
 return {rows:data.signature===signature?data.rows:[],ready:data.signature===signature&&!data.error,error:data.signature===signature?data.error:''};
}
export function effectiveAssignment(resource:DataRecord,kind:'vehicles'|'drivers',assignments:ReturnType<typeof useAssignments>,scope:string,shipments:DataRecord[]){
 if(!assignments.ready)return {label:'Assignment unknown',assigned:true};
 const lock=assignments.rows.find(x=>x.id===`${scope}_${kind==='vehicles'?'vehicle':'driver'}_${resource.id}`);
 if(lock){const shipment=shipments.find(s=>s.id===lock.shipmentId);return {label:`${shipment?.status==='Dispatched'?'In delivery':shipment?.status==='Prepared'?'Scheduled':'Assigned (reconcile status)'} · ${String(shipment?.reference??lock.shipmentId)}`,assigned:true};}
 return {label:String(resource.status??'Unavailable'),assigned:false};
}
function tabId(){const key='iilas.completion.tab';try{let id=sessionStorage.getItem(key);if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}return id;}catch{return 'storage-unavailable';}}
export function useCompletionAction(member:Membership,action:string,resolver:string){
 const [pending,setPending]=useState<CompletionInput|null>(null),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),active=useRef(true),inFlight=useRef(false);
 const current=useCallback(()=>auth?.currentUser?.uid===member.uid&&getActiveWorkspace()?.uid===member.uid&&getActiveWorkspace()?.workspaceId===member.workspaceId&&getActiveWorkspace()?.role===member.role,[member.uid,member.workspaceId,member.role]);
 const client=useMemo(()=>createCompletionClient({storage:sessionRecoveryStorage,context:{uid:member.uid,scope:member.workspaceId,tab:tabId()},command:workspaceCommand,isCurrent:current,resolveActions:{[action]:resolver}}),[member.uid,member.workspaceId,current,action,resolver]);
 const sync=useCallback(()=>{try{setPending(client.pending(action));setBlocked(false);}catch(e){setBlocked(true);setError(e instanceof Error?e.message:'Saved request needs reconciliation.');}},[client,action]);
 useEffect(()=>{active.current=true;client.activate();async function initial(){sync();}void initial();return()=>{active.current=false;client.dispose();};},[client,sync]);
 async function execute(work:()=>Promise<unknown>){if(inFlight.current)return false;inFlight.current=true;setBusy(true);setError('');setNotice('');try{const result=await work();if(!active.current||!current())return false;setNotice(result&&typeof result==='object'&&'state'in result?String(result.state)+': original operation confirmed.':'Saved successfully.');setRevision(v=>v+1);return true;}catch(e){if(active.current&&current())setError(e instanceof Error?e.message:'Unable to save. Recover the same operation.');return false;}finally{inFlight.current=false;if(active.current&&current()){setBusy(false);sync();}}}
 return {pending,blocked,busy,error,notice,revision,start:(input:Record<string,unknown>)=>execute(()=>client.start(action,input)),retry:()=>execute(()=>client.retry(action)),resolve:()=>execute(()=>client.resolve(action)),legacy:(command:string,input:Record<string,unknown>)=>execute(()=>workspaceCommand(command,input)),refresh:()=>setRevision(v=>v+1)};
}
export function OperationMessages({operation,label,hideError=false}:{operation:ReturnType<typeof useCompletionAction>;label:string;hideError?:boolean}){return <>{operation.error&&!hideError&&<p className="error" role="alert">{operation.error}</p>}{operation.notice&&<p className="success-notice" role="status">{operation.notice}</p>}{operation.pending&&<div className="integrity-recovery"><p>Saved {label}: {operation.pending.operationId}. Recover this exact request before starting another.</p><p>Original record: {String(operation.pending.id??operation.pending.shipmentId??'Unknown')} · Original version: {String(operation.pending.expectedVersion??operation.pending.expectedPlanVersion??'Unknown')}</p>{operation.pending.vehicleId!==undefined&&<p>Vehicle {String(operation.pending.vehicleId)} · Driver {String(operation.pending.driverId)} · {String(operation.pending.plannedDate)}<br/>{String(operation.pending.distanceKm)} km · {String(operation.pending.estimatedHours)} hours · MYR {String(operation.pending.cost)}</p>}<div className="integrity-actions"><button disabled={operation.busy} onClick={()=>void operation.retry()}>Retry saved {label}</button><button disabled={operation.busy} onClick={()=>void operation.resolve()}>Check saved {label} outcome</button></div></div>}</>;}
