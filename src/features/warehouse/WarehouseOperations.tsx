import {allocateLocations} from '@/lib/locationStock';
import { FormEvent, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import Field from "../../components/FormField";
import Pagination, {usePagination} from "../../components/Pagination";
import { advanceWarehouse } from "@/lib/firebase";
import {workspaceCommand} from '@/lib/workspace';

type RecordData = { id: string; version: number; [key: string]: unknown };
type Item = { allocations?:{location:string;quantity:number}[]; productId: string; name: string; sku: string; quantity: number };
type Props = {
  readOnly?:boolean;
  products:RecordData[];
  shipments: RecordData[];
  handovers: RecordData[];
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onDispatch: () => void;
};
const timestamp = (input: unknown) => input && typeof input === "object" && "seconds" in input ? new Date(Number(input.seconds) * 1000).toLocaleString() : "—";

export default function WarehouseOperations({shipments, handovers, products, onNotice, onError, onDispatch,readOnly=false}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Active jobs");
  const jobs = shipments.map(shipment => ({shipment, handover:handovers.find(record => record.id === shipment.id)}))
    .filter(({shipment,handover}) => shipment.status === "Draft" || handover)
    .filter(({shipment,handover}) => (filter === "All stages" || (filter === "Active jobs" ? ["Waiting","Picking","Packed"].includes(String(handover?.status ?? "Waiting")) : (handover?.status ?? "Waiting") === filter))
      && [shipment.reference,shipment.recipient,handover?.reference].some(value => String(value ?? "").toLowerCase().includes(search.trim().toLowerCase())));
  const pages=usePagination(jobs,6);
  return <div className="warehouse-page">
    <div className="stock-heading"><div><h1>Warehouse Operations</h1><p>Pick and pack Draft shipments, then hand them over to Order & Dispatch.</p></div><button className="primary navy" onClick={onDispatch}>Open Order & Dispatch</button></div>
    <div className="locked-note">Create a Draft shipment in Order & Dispatch to start. Picking allocates its stock; dispatch consumes that allocation. Cancel before handover to release it. Stock receipts, issues, adjustments, and transfers are recorded in Stock Management.</div>
    <section className="module-card"><div className="toolbar"><div className="search"><Search size={15}/><input aria-label="Search warehouse jobs" placeholder="Search shipment or recipient…" value={search} onChange={event => {setSearch(event.target.value);pages.setPage(1);}}/></div><select aria-label="Warehouse stage" value={filter} onChange={event => {setFilter(event.target.value);pages.setPage(1);}}>{["Active jobs","All stages","Waiting","Picking","Packed","HandedOver","Cancelled"].map(stage => <option key={stage}>{stage}</option>)}</select></div></section>
    <div className="warehouse-jobs">{pages.pageItems.map(({shipment,handover}) => <WarehouseJob key={`${shipment.id}-${handover?.version ?? 0}`} shipment={shipment} handover={handover} products={products} readOnly={readOnly} onNotice={onNotice} onError={onError}/>)}</div>
    {jobs.length>0&&<Pagination {...pages} label="warehouse jobs"/>}
    {!jobs.length && <section className="module-card warehouse-empty"><ClipboardList size={30}/><p>No jobs in this view. Create a Draft shipment to begin, or choose All stages to review completed handovers.</p></section>}
  </div>;
}

function WarehouseJob({shipment,handover,products,onNotice,onError,readOnly=false}: Omit<Props,"shipments"|"handovers"|"onDispatch"> & {shipment:RecordData;handover?:RecordData}) {
  const [notes,setNotes] = useState(String(handover?.notes ?? ""));
  const [parcels,setParcels] = useState(String(handover?.parcelCount ?? shipment.parcelCount));
  const [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const status = String(handover?.status ?? "Waiting");
  const step = ["Waiting","Cancelled"].includes(status) ? "Picking" : status === "Picking" ? "Packed" : "HandedOver";
  const action = ["Waiting","Cancelled"].includes(status) ? "Start Picking" : status === "Picking" ? "Confirm Packing" : "Complete Handover";
  async function cancel(){setBusy(true);setError('');try{await workspaceCommand('cancelWarehouse',{shipmentId:shipment.id,version:handover?.version,notes});onNotice(`${shipment.reference}: warehouse work cancelled and allocations released.`);}catch(e){setError(e instanceof Error?e.message:'Unable to cancel.');}finally{setBusy(false);}}
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);setError("");onError("");
    try {
      await advanceWarehouse(shipment.id,{step,notes,parcelCount:parcels},handover?.version ?? 0);
      onNotice(step === "HandedOver" ? `${shipment.reference} is Prepared and ready for driver assignment and dispatch.` : `${shipment.reference}: ${step} recorded.`);
    } catch (failure) {setError(failure instanceof Error ? failure.message : "Unable to record warehouse work.");}
    finally {setBusy(false);}
  }
  return <article className="module-card warehouse-job">
    <header><div><h2>{String(shipment.reference)}</h2><p>{String(shipment.recipient)}</p></div><span className={`status ${status.toLowerCase()}`}>{status === "HandedOver" ? "Handed over" : status}</span></header>
    <ol className="warehouse-stages" aria-label="Warehouse progress">{["Picking","Packed","HandedOver"].map((stage,index) => <li key={stage} className={["Picking","Packed","HandedOver"].indexOf(status) >= index ? "complete" : ""}>{stage === "HandedOver" ? "Handed over" : stage}</li>)}</ol>
    <ul className="warehouse-items">{((handover?.items||shipment.items) as Item[]).map(item => <li key={item.productId}><b>{item.name}</b><span>{item.sku} · {item.quantity} units{item.allocations&&<small className="stock-subline">Pick from {item.allocations.map(a=>`${a.location}: ${a.quantity}`).join('; ')}</small>}{!item.allocations&&products.find(p=>p.id===item.productId)&&<small className="stock-subline">{allocationPreview(products.find(p=>p.id===item.productId)!,item.quantity)}</small>}</span></li>)}</ul>
    {handover && <dl className="warehouse-evidence"><div><dt>Picked</dt><dd>{timestamp(handover.pickedAt)}</dd></div><div><dt>Packed</dt><dd>{timestamp(handover.packedAt)}</dd></div><div><dt>Handed over</dt><dd>{timestamp(handover.handedOverAt)}</dd></div></dl>}
    {status === "HandedOver" ? <div className="success-notice"><div><b>{String(handover?.reference)}</b><p>{String(handover?.parcelCount)} parcels · {String(handover?.notes)}</p><small>Recorded by {String(handover?.handedOverBy)}</small></div></div> : readOnly?<p>Your role can view this warehouse job.</p>:<form onSubmit={submit}>
      {error && <p className="error" role="alert">{error}</p>}
      <Field label="Warehouse notes"><textarea required minLength={3} maxLength={240} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record the checks performed for this step"/></Field>
      <Field label="Parcel count"><input type="number" required min="1" max="10000" disabled={status === "Packed"} value={parcels} onChange={event => setParcels(event.target.value)}/></Field>
      <label className="check"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>{["Waiting","Cancelled"].includes(status) ? "I have checked the items and will begin picking." : status === "Picking" ? "All listed items are picked and securely packed." : "Packing is complete and these parcels are ready for logistics."}</label>
      <button className="primary green" disabled={busy || !confirmed}>{busy ? "Saving…" : action}</button>
      {['Picking','Packed'].includes(status)&&<button type="button" disabled={busy||notes.trim().length<3} onClick={cancel}>Cancel warehouse work</button>}
    </form>}
  </article>;
}

function allocationPreview(product:RecordData,quantity:number){try{return 'Planned pick: '+allocateLocations(product,quantity).map(a=>`${a.location}: ${a.quantity}`).join('; ');}catch{return 'Insufficient stock — review location balances before picking.';}}
