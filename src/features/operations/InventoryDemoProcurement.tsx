import {sessionRecoveryStorage} from '../../../lib/firebaseRuntime';
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {collection,doc,documentId,getDoc,getDocs,limit,orderBy,query,startAfter,where,type QueryDocumentSnapshot} from 'firebase/firestore';
import {auth,db} from '../../../lib/firebase';
import {getActiveWorkspace,workspaceCommand} from '../../../lib/workspace';
import {locationBalances} from '../../../lib/locationStock';
import {decodePurchaseIncoming} from '../../../lib/procurementValidation';
import {verifyDemoProductSource} from '../../../lib/inventoryContextAI';
import {createInventoryDemoProcurementClient} from '../../../lib/inventoryDemoProcurementClient';
import {DEMO_PROCUREMENT_POLICY,verifyAcceptedDemoProcurementSource,decodeDemoProcurementLink,decodeExpectedReplenishment,demoProcurementSourceSha256,type DemoProcurementSource,type ProcurementInput,type ProcurementOutcome,type CreateDraft,type ActionDraft,type ExpectedReplenishment} from '../../../lib/inventoryDemoProcurement';
import type {Decoded} from '../../../lib/inventoryDemoReorder';
import {procurementTone} from './procurement/procurementPresentation';
import type {Membership} from '../workspace/WorkspaceGate';
export type DemoPurchaseWorkflow={pending:ProcurementInput|null;blocked:boolean;busy:boolean;start:(input:CreateDraft|ActionDraft)=>Promise<ProcurementOutcome>;prepare:(requirementId:string)=>Promise<void>;cancelPreparation:()=>void;refreshIncoming:()=>void};
export type DemoPurchasePanels={feedback:ReactNode;recovery:ReactNode;incoming:ReactNode};
type IncomingRow=Decoded<ExpectedReplenishment,'expected'>|ReturnType<typeof decodePurchaseIncoming>;
type DemoPurchaseProps={member:Membership;onCreateReady:(source:DemoProcurementSource)=>void;onOpenOrder:(id:string)=>void}&({children:(workflow:DemoPurchaseWorkflow)=>ReactNode;renderLayout?:never}|{children?:never;renderLayout:(workflow:DemoPurchaseWorkflow,panels:DemoPurchasePanels)=>ReactNode});
export default function InventoryDemoProcurement({member,onCreateReady,onOpenOrder,children,renderLayout}:DemoPurchaseProps){
 const [pending,setPending]=useState<ProcurementInput|null>(null),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [rows,setRows]=useState<IncomingRow[]>([]),[loading,setLoading]=useState(true),[cursors,setCursors]=useState<(QueryDocumentSnapshot|null)[]>([null]),[last,setLast]=useState<QueryDocumentSnapshot|null>(null),[more,setMore]=useState(false);
 const lifetime=useRef(0),selection=useRef(0),inFlight=useRef(false);
 const current=useCallback(()=>auth?.currentUser?.uid===member.uid&&getActiveWorkspace()?.uid===member.uid&&getActiveWorkspace()?.workspaceId===member.workspaceId,[member.uid,member.workspaceId]);
 const client=useMemo(()=>createInventoryDemoProcurementClient({storage:sessionRecoveryStorage,context:{uid:member.uid,scope:member.workspaceId},command:workspaceCommand,isCurrent:current}),[member.uid,member.workspaceId,current]);
 const sync=useCallback(()=>{try{setPending(client.pending());setBlocked(false);}catch(e){setPending(null);setBlocked(true);setError(e instanceof Error?e.message:'Saved purchase operation needs reconciliation.');}},[client]);
 const load=useCallback(async(after:QueryDocumentSnapshot|null=null)=>{
  const gen=lifetime.current;
  if(!db||!current())return;
  setLoading(true);
  try{
   const result=await getDocs(query(collection(db,'expectedReplenishments'),where('ownerId','==',member.workspaceId),
    orderBy('createdAt','desc'),orderBy(documentId(),'desc'),limit(20),...(after?[startAfter(after)]:[])));
   const decoded=await Promise.all(result.docs.map(d=>{
    const data=d.data();
    return data.dataOrigin==='ordinary-purchase' ? decodePurchaseIncoming(data,d.id,member.workspaceId) : decodeExpectedReplenishment(data,d.id);
   }));
   if(gen===lifetime.current&&current()){setRows(decoded);setLast(result.docs.at(-1)??null);setMore(result.docs.length===20);}
  }finally{if(gen===lifetime.current&&current())setLoading(false);}
 },[member.workspaceId,current]);
 useEffect(()=>{client.activate();const gen=++lifetime.current;async function initialize(){await Promise.resolve();if(gen!==lifetime.current||!current())return;sync();await load().catch(()=>{if(gen===lifetime.current&&current())setError('Expected incoming could not be loaded. Refresh this view.');});}void initialize();void workspaceCommand('getInventoryDemoProcurementAvailability',{}).then(value=>{if(gen!==lifetime.current||!current())return;const v=value as {enabled?:unknown;policyVersion?:unknown};setEnabled(Boolean(v&&Object.keys(v).length===2&&v.enabled===true&&v.policyVersion===DEMO_PROCUREMENT_POLICY));}).catch(()=>{if(gen===lifetime.current&&current())setEnabled(false);});return()=>{client.dispose();lifetime.current=gen+1;selection.current=-1;};},[client,current,load,sync]);
 async function run<T,>(work:()=>Promise<T>):Promise<T>{if(inFlight.current)throw Error('A demo purchase operation is already running.');inFlight.current=true;const gen=lifetime.current;setBusy(true);setError('');try{return await work();}catch(e){if(gen===lifetime.current&&current())setError(e instanceof Error?e.message:'The purchase operation could not be confirmed.');throw e;}finally{inFlight.current=false;if(gen===lifetime.current&&current()){setBusy(false);sync();}}}
 function refreshIncoming(){
  if(loading||inFlight.current)return;
  void run(async()=>{setCursors([null]);await load();}).catch(()=>{});
 }
 async function confirmed(result:ProcurementOutcome){setNotice(result.state==='Cancelled'?'Cancelled: this saved operation made no purchase change.':`Recorded purchase outcome: ${result.status}, version ${result.version}. Latest order state is shown separately below.`);setCursors([null]);await load();}
 async function start(input:CreateDraft|ActionDraft){return run(async()=>{const gen=lifetime.current;if(blocked)throw Error('Retain the malformed saved operation for reconciliation.');if(input.kind==='Create'&&!enabled)throw Error('New demo purchase creation is disabled.');const result=await client.start(input);if(gen===lifetime.current&&current())await confirmed(result);return result;});}
 async function recover(resolve:boolean){await run(async()=>{const gen=lifetime.current,result=resolve?await client.resolve():await client.retry();if(gen===lifetime.current&&current())await confirmed(result);}).catch(()=>{});}
 async function prepare(id:string){const chosen=++selection.current;await run(async()=>{
  if(!db||blocked||pending)throw Error('Recover the saved purchase operation before preparing another.');
  const gen=lifetime.current,[r,a,e,l]=await Promise.all(['inventoryDemoReorderRequirements','inventoryDemoRiskAlerts','inventoryAIExperiments','inventoryDemoProcurementLinks'].map(kind=>getDoc(doc(db!,kind,id))));
  if(!r.exists()||!a.exists()||!e.exists()||r.data().ownerId!==member.workspaceId)throw Error('Original accepted demo evidence is unavailable.');
  const review=r.data().review;if(!review?.eventId)throw Error('An independently accepted requirement is required.');const event=await getDoc(doc(db,'inventoryDemoReorderEvents',review.eventId));
  if(!event.exists())throw Error('The accepted review event is unavailable.');
  const source=await verifyAcceptedDemoProcurementSource({id,requirement:r.data(),alert:a.data(),experiment:e.data(),event:event.data()});
  if(l.exists()){const link=decodeDemoProcurementLink(l.data(),id);if(link.kind!=='link'||link.record.ownerId!==member.workspaceId||link.record.sourceSha256!==await demoProcurementSourceSha256(source))throw Error('The permanent purchase link needs reconciliation.');if(gen===lifetime.current&&chosen===selection.current&&current())onOpenOrder(link.record.purchaseOrderId);return;}
  if(!enabled||!['Admin','Manager','Inventory'].includes(member.role))throw Error('New demo purchase creation is unavailable for this account/profile.');
  const original=source.basis.sourceProduct,p=await getDoc(doc(db,'products',original.productId));if(!p.exists())throw Error('The selected product is unavailable.');const value=p.data();if(value.ownerId!==member.workspaceId||value.status!=='Active'||value.archived)throw Error('The original product is unavailable.');locationBalances(value);await verifyDemoProductSource({...original,productVersion:value.version,name:value.name,sku:value.sku,quantityOnHand:value.quantityOnHand,reservedQuantity:value.reservedQuantity??0,reorderLevel:value.reorderLevel});
  if(gen===lifetime.current&&chosen===selection.current&&current())onCreateReady(source);
 }).catch(()=>{});}
 const recoveryRole=pending?.kind==='Action'&&['Approve','Reject'].includes(pending.purchase.step)?['Admin','Manager']:pending?.kind==='Action'&&pending.purchase.step==='Receive'?['Admin','Manager','Inventory','Warehouse']:['Admin','Manager','Inventory'];
 const feedback=<>{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success-notice">{notice}</p>}</>;
 const recovery=<>{pending&&<section className="module-card inventory-risk-recovery"><h2>Recover saved demo purchase</h2><p>Check the original operation before another linked action. A replay reports its recorded version; the current order may have advanced.</p><code>{pending.operationId}</code><div className="inventory-risk-actions"><button disabled={busy||blocked||!recoveryRole.includes(member.role)} onClick={()=>void recover(false)}>Retry saved demo purchase</button><button disabled={busy||blocked||!recoveryRole.includes(member.role)} onClick={()=>void recover(true)}>Check demo purchase outcome</button></div></section>}</>;
 const incoming=<section className="module-card operations-card demo-expected-incoming"><div className="procurement-section-heading"><h2>Expected incoming stock</h2><button disabled={busy||loading} onClick={refreshIncoming}>Refresh expected incoming</button></div><p>Track issued purchase orders through their receipts. Expected units become available stock after staff record the delivery. Earlier issued orders enter this list with their next receipt.</p>
   {!enabled&&<p>New demo purchase creation is disabled. Existing order actions and saved-operation recovery use their normal staff permissions.</p>}
   {loading?<p role="status">Loading expected incoming…</p>:!rows.length?<p>No expected records on this page.</p>:rows.map(row=>{
    if(row.kind==='unsupported')return <article key={row.id}><h3>Retained incoming record unavailable</h3><p>{row.reason}</p><code>{row.id}</code></article>;
    const record=row.record;
    return <article key={row.id} className="operations-row">
     <div>
      <b>{row.kind==='ordinary'?row.record.reference:row.record.product.name}</b>
      <p><span className={`procurement-status tone-${procurementTone('incoming',record.state)}`}>{record.state==='PartReceived'?'Part received':record.state}</span> · {record.outstandingQuantity} outstanding · {record.receivedQuantity}/{record.orderedQuantity} received</p>
      <p>{row.kind==='ordinary'?row.record.supplierName??row.record.supplierId:row.record.supplier.name} · expected {record.expectedDate} · {row.kind==='ordinary'?'Ordinary purchase order':'Demo stock-AI source'}</p>
      {row.kind==='ordinary'?<details><summary>View incoming lines</summary><ul>{row.record.items.map(line=>
       <li key={line.productId}>{line.name??line.productId}{line.sku?` · ${line.sku}`:''} · {line.outstanding} outstanding · {line.received}/{line.quantity} received</li>
      )}</ul></details>:<small>Requirement {row.record.requirementId} · Purchase version {record.orderVersion}</small>}
     </div>
     <button onClick={()=>onOpenOrder(row.id)}>{row.kind==='ordinary'?`View purchase history ${row.record.reference}`:`View linked purchase ${row.id}`}</button>
    </article>;
   })}
   <div className="inventory-risk-actions"><button disabled={busy||loading||cursors.length===1} onClick={()=>void run(async()=>{const next=cursors.slice(0,-1);await load(next.at(-1)??null);setCursors(next);}).catch(()=>{})}>Newer expected records</button><button disabled={busy||loading||!more||!last} onClick={()=>void run(async()=>{await load(last);setCursors([...cursors,last]);}).catch(()=>{})}>Older expected records</button></div>
  </section>;
 // Both render modes share one mounted client and event-only workflow closures.
 // eslint-disable-next-line react-hooks/refs
 return renderLayout?renderLayout({pending,blocked,busy,start,prepare,refreshIncoming,cancelPreparation:()=>{selection.current++;}},{feedback,recovery,incoming}):<>{feedback}{recovery}{children({pending,blocked,busy,start,prepare,refreshIncoming,cancelPreparation:()=>{selection.current++;}})}{incoming}</>;
}
