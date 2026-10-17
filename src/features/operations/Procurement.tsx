import {FormEvent,ReactNode,useEffect,useMemo,useRef,useState} from 'react';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {Plus,X} from 'lucide-react';
import {db} from '../../../lib/firebase';
import {workspaceCommand} from '../../../lib/workspace';
import {filterPurchases,malaysiaDay,PURCHASE_STATUSES,validatePurchaseCommand,validateSupplier} from '../../../lib/procurementValidation';
import Field from '../../components/FormField';
import Pagination,{usePagination} from '../../components/Pagination';
import {useDialogFocus} from '../../components/useDialogFocus';
import {Membership} from '../workspace/WorkspaceGate';

type Row={id:string;version:number;[key:string]:unknown};
type Line={productId:string;name:string;sku?:string;quantity:number;received:number;unitCost:number;unitCostCents?:number};
type EditorLine={key:string;productId:string;quantity:string;unitCost:string};
type Dialog={kind:'supplier';record?:Row}|{kind:'purchase';record?:Row}|{kind:'action';record:Row;step:string}|{kind:'history';record:Row};
const value=(r:Row,key:string)=>String(r[key]??'');
const money=(cents:number)=>new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(cents/100);
const total=(p:Row)=>Number(p.totalCents??(p.items as Line[]).reduce((sum,line)=>sum+line.quantity*Math.round(line.unitCost*100),0));
const timestamp=(input:unknown)=>input&&typeof input==='object'&&'seconds' in input?new Date(Number(input.seconds)*1000).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'}):'Pending';
function useData(kind:string,scope:string){
  const [records,setRecords]=useState<Row[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>db?onSnapshot(query(collection(db,kind),where('ownerId','==',scope)),s=>{setRecords(s.docs.map(d=>({id:d.id,...d.data()} as Row)));setLoading(false);},e=>{setError(e.message);setLoading(false);}):undefined,[kind,scope]);
  return {records,error,loading};
}
export default function Procurement({member,products}:{member:Membership;products:Row[]}){
  const suppliers=useData('suppliers',member.workspaceId),orders=useData('purchaseOrders',member.workspaceId),events=useData('purchaseOrderEvents',member.workspaceId);
  const [dialog,setDialog]=useState<Dialog|null>(null),[notice,setNotice]=useState('');
  const [supplierSearch,setSupplierSearch]=useState(''),[supplierStatus,setSupplierStatus]=useState('');
  const [filters,setFilters]=useState({search:'',status:'',supplierId:'',from:'',to:''});
  const writable=['Admin','Manager','Inventory'].includes(member.role),reviewer=['Admin','Manager'].includes(member.role),receiver=['Admin','Manager','Inventory','Warehouse'].includes(member.role);
  const supplierRows=useMemo(()=>suppliers.records.filter(s=>(!supplierStatus||s.status===supplierStatus)&&`${s.name} ${s.contact}`.toLowerCase().includes(supplierSearch.trim().toLowerCase())).sort((a,b)=>value(a,'name').localeCompare(value(b,'name'))),[suppliers.records,supplierSearch,supplierStatus]);
  const filtered=useMemo(()=>{try{return {rows:filterPurchases(orders.records,filters).sort((a:Row,b:Row)=>Number((b.updatedAt as {seconds:number})?.seconds||0)-Number((a.updatedAt as {seconds:number})?.seconds||0)),error:''};}catch(e){return {rows:[],error:e instanceof Error?e.message:'Check the order filters.'};}},[orders.records,filters]);
  const supplierPage=usePagination(supplierRows,10),orderPage=usePagination<Row>(filtered.rows,10);
  const low=products.filter(p=>!p.archived&&p.status==='Active'&&Number(p.quantityOnHand)-Number(p.reservedQuantity||0)<=Number(p.reorderLevel));
  const lowPage=usePagination(low,10);
  function filter(key:keyof typeof filters,next:string){setFilters(current=>({...current,[key]:next}));orderPage.setPage(1);}
  const saved=(message:string)=>{setDialog(null);setNotice(message);};
  return <div className="operations-page procurement-page">
    <header className="page-heading"><div><h1>Replenishment &amp; Procurement</h1><p>Review purchasing, obtain independent approval and record each supplier delivery.</p></div>{writable&&<button className="primary" onClick={()=>setDialog({kind:'purchase'})}><Plus size={16}/>New purchase order</button>}</header>
    {notice&&<p role="status" className="success-notice">{notice}</p>}
    {[suppliers,orders,events].some(source=>source.error)&&<p role="alert" className="error">Unable to load procurement records. Check your connection and account access.</p>}
    <section className="module-card operations-card"><h2>Reorder review</h2><p>These products are at or below their available-stock reorder threshold.</p>{!low.length&&<p>No products currently need threshold review.</p>}{lowPage.pageItems.map(p=><p key={p.id}><b>{value(p,'name')}</b> · {Number(p.quantityOnHand)-Number(p.reservedQuantity||0)} available · reorder level {value(p,'reorderLevel')}</p>)}<Pagination {...lowPage} label="reorder products"/></section>
    <section className="module-card operations-card"><div className="procurement-section-heading"><h2>Suppliers</h2>{writable&&<button onClick={()=>setDialog({kind:'supplier'})}>Add supplier</button>}</div>
      <div className="procurement-filters"><Field label="Search suppliers"><input value={supplierSearch} onChange={e=>{setSupplierSearch(e.target.value);supplierPage.setPage(1);}} placeholder="Name or email/phone"/></Field><Field label="Supplier status"><select value={supplierStatus} onChange={e=>{setSupplierStatus(e.target.value);supplierPage.setPage(1);}}><option value="">All statuses</option><option>Active</option><option>Inactive</option></select></Field></div>
      {suppliers.loading?<p role="status">Loading suppliers…</p>:!supplierRows.length?<p>No suppliers match this view. Add a supplier or change the filters.</p>:supplierPage.pageItems.map(s=><article className="operations-row" key={s.id}><div><b>{value(s,'name')}</b><p>{value(s,'contact')} · {value(s,'status')}</p></div>{writable&&<button aria-label={`Edit supplier ${value(s,'name')}`} onClick={()=>setDialog({kind:'supplier',record:s})}>Edit supplier</button>}</article>)}<Pagination {...supplierPage} label="suppliers"/>
    </section>
    <section className="module-card operations-card"><h2>Purchase orders</h2>
      <div className="procurement-filters"><Field label="Search purchase orders"><input value={filters.search} onChange={e=>filter('search',e.target.value)} placeholder="Reference, supplier, product or SKU"/></Field><Field label="Purchase status"><select value={filters.status} onChange={e=>filter('status',e.target.value)}><option value="">All statuses</option>{PURCHASE_STATUSES.map(s=><option key={s}>{s}</option>)}</select></Field><Field label="Filter by supplier"><select value={filters.supplierId} onChange={e=>filter('supplierId',e.target.value)}><option value="">All suppliers</option>{suppliers.records.map(s=><option key={s.id} value={s.id}>{value(s,'name')}</option>)}</select></Field><Field label="Expected date from"><input type="date" value={filters.from} onChange={e=>filter('from',e.target.value)}/></Field><Field label="Expected date to"><input type="date" value={filters.to} onChange={e=>filter('to',e.target.value)}/></Field><button type="button" onClick={()=>{setFilters({search:'',status:'',supplierId:'',from:'',to:''});orderPage.setPage(1);}}>Clear order filters</button></div>
      {filtered.error&&<p role="alert" className="error">{filtered.error}</p>}
      {orders.loading?<p role="status">Loading purchase orders…</p>:!filtered.rows.length?<p>No purchase orders match this view. Create an order or change the filters.</p>:orderPage.pageItems.map(p=>{
        const status=value(p,'status'),own=p.requestedBy===member.uid,lines=p.items as Line[];
        return <article className="procurement-order" key={p.id} aria-label={`Purchase order ${value(p,'reference')}`}><div className="procurement-order-header"><div><h3>{value(p,'reference')} · {status}</h3><p>{value(p,'supplierName')} · Expected {value(p,'expectedDate')}</p></div><b>{money(total(p))}</b></div>
          {['Submitted','Approved','Issued','PartReceived'].includes(status)&&value(p,'expectedDate')<malaysiaDay()&&<p className="procurement-warning">Expected replenishment is overdue. Confirm the supplier&apos;s delivery arrangements.</p>}
          {status==='Rejected'&&<p><b>Rejection notes:</b> {value(p,'reviewNotes')}</p>}{status==='Cancelled'&&<p><b>Cancellation notes:</b> {value(p,'cancellationNotes')}</p>}
          <div className="table-wrap" role="region" aria-label={`Purchase lines ${value(p,'reference')}`} tabIndex={0}><table><thead><tr><th>Product</th><th>Ordered</th><th>Received</th><th>Outstanding</th><th>Unit cost</th></tr></thead><tbody>{lines.map(line=><tr key={line.productId}><td>{line.name}</td><td>{line.quantity}</td><td>{line.received}</td><td>{line.quantity-line.received}</td><td>{money(line.unitCostCents??Math.round(line.unitCost*100))}</td></tr>)}</tbody></table></div>
          <div className="procurement-actions"><button onClick={()=>setDialog({kind:'history',record:p})}>View purchase history</button>
            {status==='Submitted'&&reviewer&&!own&&<><button className="primary" onClick={()=>setDialog({kind:'action',record:p,step:'Approve'})}>Approve purchase</button><button onClick={()=>setDialog({kind:'action',record:p,step:'Reject'})}>Reject purchase</button></>}
            {status==='Submitted'&&reviewer&&own&&<span>A different manager must review your submission.</span>}
            {['Submitted','Rejected'].includes(status)&&writable&&<button onClick={()=>setDialog({kind:'purchase',record:p})}>Correct &amp; resubmit</button>}
            {status==='Approved'&&writable&&<button className="primary" onClick={()=>setDialog({kind:'action',record:p,step:'Issue'})}>Issue order</button>}
            {['Submitted','Rejected','Approved'].includes(status)&&writable&&<button onClick={()=>setDialog({kind:'action',record:p,step:'Cancel'})}>Cancel order</button>}
            {['Issued','PartReceived'].includes(status)&&receiver&&<button className="primary" onClick={()=>setDialog({kind:'action',record:p,step:'Receive'})}>Record receipt</button>}
          </div>
        </article>;
      })}<Pagination {...orderPage} label="purchase orders"/>
    </section>
    {dialog?.kind==='supplier'&&<SupplierDialog existing={dialog.record} onClose={()=>setDialog(null)} onSaved={saved}/>}
    {dialog?.kind==='purchase'&&<PurchaseDialog existing={dialog.record} suppliers={suppliers.records} products={products} onClose={()=>setDialog(null)} onSaved={saved}/>}
    {dialog?.kind==='action'&&<ActionDialog order={dialog.record} step={dialog.step} onClose={()=>setDialog(null)} onSaved={saved}/>}
    {dialog?.kind==='history'&&<HistoryDialog order={dialog.record} events={events.records} loading={events.loading} onClose={()=>setDialog(null)}/>}
  </div>;
}

function DialogFrame({title,children,onClose,busy=false}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean}){
  const dialog=useRef<HTMLElement>(null);const close=()=>{if(!busy)onClose();};useDialogFocus(dialog,close);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section className="modal procurement-modal" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="procurement-dialog-title"><header><h2 id="procurement-dialog-title">{title}</h2><button type="button" disabled={busy} className="icon-button" aria-label="Close" onClick={close}><X size={16}/></button></header>{children}</section></div>;
}
function useSubmit(onSaved:(message:string)=>void){
  const inFlight=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const send=async(action:string,input:object,message:string)=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try{await workspaceCommand(action,input);onSaved(message);}catch(e){setError(e instanceof Error?e.message:'Unable to save. Review the fields and try again.');}finally{inFlight.current=false;setBusy(false);}
  };
  return {busy,error,setError,send};
}
function SupplierDialog({existing,onClose,onSaved}:{existing?:Row;onClose:()=>void;onSaved:(message:string)=>void}){
  const [form,setForm]=useState({name:existing?value(existing,'name'):'',contact:existing?value(existing,'contact'):'',status:existing?value(existing,'status'):'Active'});
  const task=useSubmit(onSaved),update=(key:keyof typeof form,next:string)=>setForm(current=>({...current,[key]:next}));
  async function submit(e:FormEvent){e.preventDefault();try{const data=validateSupplier(form);await task.send('entity',{kind:'suppliers',data,...(existing?{id:existing.id,version:existing.version}:{})},existing?'Supplier updated.':'Supplier added.');}catch(e){task.setError(e instanceof Error?e.message:'Check supplier details.');}}
  return <DialogFrame title={existing?'Edit supplier':'Add supplier'} onClose={onClose} busy={task.busy}><form onSubmit={submit}>{task.error&&<p role="alert" className="error">{task.error}</p>}<fieldset disabled={task.busy} className="procurement-editor"><Field label="Supplier name"><input data-dialog-initial-focus value={form.name} onChange={e=>update('name',e.target.value)} required maxLength={120}/></Field><Field label="Supplier email or phone"><input value={form.contact} onChange={e=>update('contact',e.target.value)} required maxLength={120} placeholder="supplier@example.com or +60 12 345 6789"/></Field><Field label="Supplier status"><select value={form.status} onChange={e=>update('status',e.target.value)}><option>Active</option><option>Inactive</option></select></Field><p>Inactive suppliers cannot be selected or have new orders approved/issued. Previously issued goods can still be received.</p><div className="form-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">{task.busy?'Saving…':'Save supplier'}</button></div></fieldset></form></DialogFrame>;
}
function PurchaseDialog({existing,suppliers,products,onClose,onSaved}:{existing?:Row;suppliers:Row[];products:Row[];onClose:()=>void;onSaved:(message:string)=>void}){
  const [form,setForm]=useState({reference:existing?value(existing,'reference'):'',supplierId:existing?value(existing,'supplierId'):'',expectedDate:existing?value(existing,'expectedDate'):'',notes:''});
  const [lines,setLines]=useState<EditorLine[]>(()=>existing?(existing.items as Line[]).map(i=>({key:crypto.randomUUID(),productId:i.productId,quantity:String(i.quantity),unitCost:String(i.unitCost)})):[{key:crypto.randomUUID(),productId:'',quantity:'1',unitCost:''}]);
  const task=useSubmit(onSaved),update=(key:keyof typeof form,next:string)=>setForm(current=>({...current,[key]:next}));
  const editLine=(key:string,field:'productId'|'quantity'|'unitCost',next:string)=>setLines(current=>current.map(line=>line.key===key?{...line,[field]:next}:line));
  async function submit(e:FormEvent){e.preventDefault();try{
    const details={supplierId:form.supplierId,expectedDate:form.expectedDate,items:lines.map(({productId,quantity,unitCost})=>({productId,quantity,unitCost}))};
    const input=existing?{...details,id:existing.id,version:existing.version,step:'Resubmit',notes:form.notes}:{...details,reference:form.reference};
    validatePurchaseCommand(input);await task.send('purchaseOrder',input,existing?'Corrected order resubmitted. Independent approval is required again.':'Purchase order submitted for independent approval.');
  }catch(e){task.setError(e instanceof Error?e.message:'Check the purchase fields.');}}
  const preview=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0)*Math.round((Number(line.unitCost)||0)*100),0);
  return <DialogFrame title={existing?'Correct & resubmit purchase':'Submit purchase order'} onClose={onClose} busy={task.busy}><form onSubmit={submit}>{task.error&&<p role="alert" className="error">{task.error}</p>}<fieldset disabled={task.busy} className="procurement-editor">
    <Field label="Purchase reference"><input data-dialog-initial-focus={existing?undefined:true} value={form.reference} disabled={Boolean(existing)} onChange={e=>update('reference',e.target.value)} required minLength={3} maxLength={40}/></Field><p>References are unique and retained after cancellation. Corrections keep the same reference and create a new revision.</p>
    <Field label="Supplier"><select data-dialog-initial-focus={existing?true:undefined} value={form.supplierId} onChange={e=>update('supplierId',e.target.value)} required><option value="">Select supplier…</option>{suppliers.filter(s=>s.status==='Active'||s.id===form.supplierId).map(s=><option key={s.id} value={s.id} disabled={s.status!=='Active'}>{value(s,'name')}{s.status!=='Active'?' (Inactive — choose another)':''}</option>)}</select></Field>
    <Field label="Expected replenishment"><input type="date" min={malaysiaDay()} value={form.expectedDate} onChange={e=>update('expectedDate',e.target.value)} required/></Field>
    <div className="purchase-lines">{lines.map((line,n)=><fieldset key={line.key} className="purchase-line"><legend>Item {n+1}</legend><Field label={`Purchase product ${n+1}`}><select value={line.productId} onChange={e=>editLine(line.key,'productId',e.target.value)} required><option value="">Select product…</option>{products.filter(p=>(p.status==='Active'&&!p.archived)||p.id===line.productId).map(p=><option value={p.id} key={p.id} disabled={Boolean(p.archived)||p.status!=='Active'||lines.some(other=>other.key!==line.key&&other.productId===p.id)}>{value(p,'name')} · {value(p,'sku')}{p.archived||p.status!=='Active'?' (Unavailable)':''}</option>)}</select></Field><Field label={`Purchase quantity ${n+1}`}><input type="number" min="1" max="1000000" step="1" value={line.quantity} onChange={e=>editLine(line.key,'quantity',e.target.value)} required/></Field><Field label={`Unit cost (MYR) ${n+1}`}><input type="number" min="0" max="1000000" step="0.01" value={line.unitCost} onChange={e=>editLine(line.key,'unitCost',e.target.value)} required/></Field><button type="button" disabled={lines.length===1} aria-label={`Remove purchase item ${n+1}`} onClick={()=>setLines(current=>current.filter(i=>i.key!==line.key))}>Remove item</button></fieldset>)}</div>
    <button type="button" disabled={lines.length>=100} onClick={()=>setLines(current=>[...current,{key:crypto.randomUUID(),productId:'',quantity:'1',unitCost:''}])}>Add purchase item</button><p>Use whole units and up to two decimal places for MYR. Zero cost is allowed for no-charge goods. Estimated total: <b>{money(preview)}</b>.</p>
    {existing&&<Field label="Correction notes"><textarea value={form.notes} onChange={e=>update('notes',e.target.value)} minLength={3} maxLength={500} required placeholder="Explain what changed and why"/></Field>}
    <div className="form-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">{task.busy?'Saving…':existing?'Resubmit purchase order':'Submit purchase order'}</button></div>
  </fieldset></form></DialogFrame>;
}
function ActionDialog({order,step,onClose,onSaved}:{order:Row;step:string;onClose:()=>void;onSaved:(message:string)=>void}){
  const task=useSubmit(onSaved),[notes,setNotes]=useState(''),[receipt,setReceipt]=useState(''),[quantities,setQuantities]=useState<string[]>(()=>(order.items as Line[]).map(()=> '0'));
  const title={Approve:'Approve purchase',Reject:'Reject purchase',Issue:'Issue purchase order',Cancel:'Cancel purchase order',Receive:'Record purchase receipt'}[step]||'Review purchase';
  async function submit(e:FormEvent){e.preventDefault();try{
    const input={id:order.id,version:order.version,step,notes,...(step==='Receive'?{quantities,receiptReference:receipt}:{})};
    validatePurchaseCommand(input);await task.send('purchaseOrder',input,step==='Receive'?'Purchase receipt recorded; stock and receipt history updated together.':`${value(order,'reference')}: ${step==='Reject'?'rejected with review notes':step==='Cancel'?'cancelled':step==='Issue'?'issued to supplier':'approved'}.`);
  }catch(e){task.setError(e instanceof Error?e.message:'Check the action fields.');}}
  return <DialogFrame title={title} onClose={onClose} busy={task.busy}><p><b>{value(order,'reference')}</b> · {value(order,'supplierName')} · {money(total(order))}</p><p>{step==='Receive'?'Record quantities physically accepted on this delivery note. Enter 0 for products not delivered.':step==='Cancel'?'Cancellation is permanent. This reference and its history remain reserved.':step==='Issue'?'This confirms the approved order has been sent to the supplier. Its contents become locked.':'Your decision and notes are retained in the purchase history.'}</p><form onSubmit={submit}>{task.error&&<p role="alert" className="error">{task.error}</p>}<fieldset disabled={task.busy} className="procurement-editor">
    {step==='Receive'&&<><Field label="Supplier delivery note reference"><input data-dialog-initial-focus value={receipt} onChange={e=>setReceipt(e.target.value)} minLength={3} maxLength={80} required/></Field><p>Use a unique note for each physical delivery to this order. Previously received notes cannot be recorded twice.</p>{(order.items as Line[]).map((line,n)=><Field key={line.productId} label={`Receive ${line.name} (remaining ${line.quantity-line.received})`}><input type="number" min="0" max={line.quantity-line.received} step="1" value={quantities[n]} onChange={e=>setQuantities(current=>current.map((q,i)=>i===n?e.target.value:q))} required/></Field>)}</>}
    <Field label={step==='Receive'?'Receipt notes (optional)':step==='Issue'?'Issue notes (optional)':'Decision notes'}><textarea value={notes} onChange={e=>setNotes(e.target.value)} minLength={['Approve','Reject','Cancel'].includes(step)?3:undefined} maxLength={500} required={['Approve','Reject','Cancel'].includes(step)}/></Field>
    <div className="form-actions"><button type="button" onClick={onClose}>Back</button><button className="primary">{task.busy?'Saving…':title}</button></div>
  </fieldset></form></DialogFrame>;
}
function HistoryDialog({order,events,loading,onClose}:{order:Row;events:Row[];loading:boolean;onClose:()=>void}){
  const history=events.filter(e=>e.orderId===order.id).sort((a,b)=>a.version-b.version);
  return <DialogFrame title={`Purchase history ${value(order,'reference')}`} onClose={onClose}>{loading?<p>Loading purchase history…</p>:!history.length?<p>This order predates detailed purchase history. Its existing audit records are preserved.</p>:history.map(event=><article className="purchase-event" key={event.id}><h3>{value(event,'step')} · {value(event,'status')} · revision {value(event,'revision')||'1'}</h3><p>{timestamp(event.at)} · {value(event,'actorName')||value(event,'actor')} {value(event,'actorRole')&&`(${value(event,'actorRole')})`}</p><p>{value(event,'supplierName')} · expected {value(event,'expectedDate')}</p>{Boolean(event.notes)&&<p>{value(event,'notes')}</p>}{Boolean(event.receiptReference)&&<p>Delivery note: <b>{value(event,'receiptReference')}</b></p>}<p>{money(total(event))} · {(event.items as Line[]).map(line=>`${line.name}: ${line.received}/${line.quantity} received`).join(' · ')}</p></article>)}<div className="form-actions"><button onClick={onClose}>Close purchase history</button></div></DialogFrame>;
}
