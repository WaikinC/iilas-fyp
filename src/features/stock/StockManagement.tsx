import { FormEvent, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Box, Bookmark, MapPin, Package, Plus, Search, X } from "lucide-react";
import { saveStockMovement } from "@/lib/firebase";

type RecordData = { id: string; [key: string]: unknown };
type MovementType = "Receipt" | "Issue" | "Adjustment" | "Reservation" | "Release" | "Transfer";
type MovementForm = {
  productId: string;
  type: MovementType;
  adjustmentDirection: "Increase" | "Decrease";
  quantity: string;
  locationTo: string;
  reference: string;
  reason: string;
};
type Props = {
  products: RecordData[];
  movements: RecordData[];
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

const value = (input: unknown) => typeof input === "string" ? input : "";
const number = (input: unknown) => Number(input ?? 0);
const available = (product: RecordData) => Math.max(0, number(product.quantityOnHand) - number(product.reservedQuantity));
const movementTypes: MovementType[] = ["Receipt", "Issue", "Adjustment", "Reservation", "Release", "Transfer"];
const movementIcon = (type: string) => type === "Receipt" ? <ArrowDownToLine size={15}/> : type === "Issue" ? <ArrowUpFromLine size={15}/> : type === "Reservation" || type === "Release" ? <Bookmark size={15}/> : type === "Transfer" ? <MapPin size={15}/> : <Box size={15}/>;
const timestamp = (input: unknown) => input && typeof input === "object" && "seconds" in input ? new Date(Number((input as {seconds:number}).seconds) * 1000).toLocaleString() : "Pending";

export default function StockManagement({ products, movements, onNotice, onError }: Props) {
  const activeProducts = useMemo(() => products.filter(product => product.archived !== true && product.status === "Active"), [products]);
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState("All movements");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const filteredProducts = useMemo(() => activeProducts.filter(product => {
    const term = search.trim().toLowerCase();
    return !term || [product.name, product.sku, product.barcode, product.category, product.location].some(item => value(item).toLowerCase().includes(term));
  }), [activeProducts, search]);
  const filteredMovements = useMemo(() => movements.filter(movement => movementFilter === "All movements" || movement.type === movementFilter), [movements, movementFilter]);
  const totals = activeProducts.reduce((result, product) => ({
    onHand: result.onHand + number(product.quantityOnHand),
    reserved: result.reserved + number(product.reservedQuantity),
    available: result.available + available(product),
    low: result.low + (available(product) <= number(product.reorderLevel) ? 1 : 0),
  }), {onHand:0,reserved:0,available:0,low:0});
  const openMovement = (productId?: string) => {
    const fallback = productId || activeProducts[0]?.id;
    if (!fallback) { onError("Add an active product before recording stock movement."); return; }
    onError("");
    setSelectedProductId(fallback);
  };

  return <div className="stock-page">
    <div className="stock-heading"><div><h1>Stock Management</h1><p>Record every stock change and keep on-hand, reserved, and available quantities in sync.</p></div><button className="primary green" onClick={() => openMovement()}><Plus size={15}/>Record Movement</button></div>
    <div className="stock-summary">
      <StockMetric label="On hand" value={totals.onHand} detail="Physical units recorded"/>
      <StockMetric label="Reserved" value={totals.reserved} detail="Allocated to future work"/>
      <StockMetric label="Available" value={totals.available} detail="Usable for dispatch"/>
      <StockMetric label="Reorder alerts" value={totals.low} detail="At or below reorder level" warning={totals.low > 0}/>
    </div>
    <section className="module-card stock-card">
      <header className="stock-card-header"><div><h2>Inventory balances</h2><p>Available quantity equals on hand minus reserved.</p></div></header>
      <div className="toolbar"><div className="search"><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, SKU, barcode or location…"/></div></div>
      <div className="table-wrap"><table><thead><tr>{["Product","SKU","Location","On hand","Reserved","Available","Reorder level","Status","Action"].map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>
        {filteredProducts.map(product => { const free = available(product); const low = free <= number(product.reorderLevel); return <tr key={product.id}><td><span className="stock-product"><span className="stock-product-image">{value(product.imageDataUrl) ? <img src={value(product.imageDataUrl)} alt=""/> : <Package size={17}/>}</span><b>{value(product.name)}</b></span></td><td className="mono">{value(product.sku)}</td><td>{value(product.location)}</td><td>{number(product.quantityOnHand).toLocaleString()}</td><td>{number(product.reservedQuantity).toLocaleString()}</td><td><b>{free.toLocaleString()}</b></td><td>{number(product.reorderLevel).toLocaleString()}</td><td><span className={`stock-level ${low ? "low" : "healthy"}`}>{low ? "Reorder" : "Healthy"}</span></td><td><button className="stock-action" onClick={() => openMovement(product.id)}>Record</button></td></tr>; })}
        {filteredProducts.length === 0 && <tr><td className="empty-cell" colSpan={9}>{activeProducts.length ? "No products match the search." : "No active products are available."}</td></tr>}
      </tbody></table></div><footer>Showing {filteredProducts.length} of {activeProducts.length} active products</footer>
    </section>
    <section className="module-card stock-card">
      <header className="stock-card-header"><div><h2>Movement history</h2><p>Immutable receipts, issues, adjustments, reservations, releases, and transfers.</p></div><select value={movementFilter} onChange={event => setMovementFilter(event.target.value)}><option>All movements</option>{movementTypes.map(type => <option key={type}>{type}</option>)}</select></header>
      <div className="table-wrap"><table><thead><tr>{["Date","Movement","Product","Quantity","On hand","Reserved","Location","Reference","Reason"].map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>
        {filteredMovements.map(movement => <tr key={movement.id}><td>{timestamp(movement.createdAt)}</td><td><span className={`movement-type ${value(movement.type).toLowerCase()}`}>{movementIcon(value(movement.type))}{value(movement.type)}</span></td><td><b>{value(movement.productName)}</b><small className="stock-subline mono">{value(movement.sku)}</small></td><td>{number(movement.quantity).toLocaleString()}</td><td>{number(movement.quantityBefore)} → <b>{number(movement.quantityAfter)}</b></td><td>{number(movement.reservedBefore)} → <b>{number(movement.reservedAfter)}</b></td><td>{value(movement.locationFrom) === value(movement.locationTo) ? value(movement.locationTo) : `${value(movement.locationFrom)} → ${value(movement.locationTo)}`}</td><td className="mono">{value(movement.reference) || "—"}</td><td className="stock-reason" title={value(movement.reason)}>{value(movement.reason)}</td></tr>)}
        {filteredMovements.length === 0 && <tr><td className="empty-cell" colSpan={9}>No stock movements recorded yet.</td></tr>}
      </tbody></table></div><footer>Showing {filteredMovements.length} of {movements.length} movement records</footer>
    </section>
    {selectedProductId && <MovementModal products={activeProducts} initialProductId={selectedProductId} onClose={() => setSelectedProductId(null)} onError={onError} onSaved={() => {setSelectedProductId(null);onNotice("Stock movement recorded successfully.");}}/>}
  </div>;
}

function StockMetric({label,value:metric,detail,warning=false}:{label:string;value:number;detail:string;warning?:boolean}) {
  return <article className={`stock-metric ${warning ? "warning" : ""}`}><small>{label}</small><b>{metric.toLocaleString()}</b><span>{detail}</span></article>;
}

function MovementModal({products,initialProductId,onClose,onError,onSaved}:{products:RecordData[];initialProductId:string;onClose:()=>void;onError:(message:string)=>void;onSaved:()=>void}) {
  const initial: MovementForm = {productId:initialProductId,type:"Receipt",adjustmentDirection:"Increase",quantity:"1",locationTo:"",reference:"",reason:""};
  const [form, setForm] = useState<MovementForm>(initial);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const product = products.find(item => item.id === form.productId);
  const typeHelp: Record<MovementType,string> = {
    Receipt:"Adds newly received units to stock on hand.",
    Issue:"Removes available units for internal use, damage, or manual stock-out.",
    Adjustment:"Corrects a verified stock-count difference.",
    Reservation:"Sets available units aside without changing physical stock.",
    Release:"Returns reserved units to the available balance.",
    Transfer:"Relocates the product's full balance because each product currently has one storage location.",
  };
  const update = <K extends keyof MovementForm>(key:K, next:MovementForm[K]) => setForm(current => ({...current,[key]:next}));
  const close = () => { if (JSON.stringify(form) !== JSON.stringify(initial) && !confirm("Discard this unrecorded stock movement?")) return; onClose(); };
  const setType = (type:MovementType) => setForm(current => ({...current,type,quantity:type === "Transfer" ? String(number(product?.quantityOnHand)) : current.quantity,locationTo:type === "Transfer" ? current.locationTo : ""}));
  async function submit(event:FormEvent) {
    event.preventDefault(); setSaving(true); setModalError(""); onError("");
    try { await saveStockMovement({...form,quantity:Number(form.quantity)}); onSaved(); }
    catch (error) { setModalError(error instanceof Error ? error.message : "Unable to record stock movement."); }
    finally { setSaving(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => {if(event.target===event.currentTarget)close()}}><section className="modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title"><header><div><h2 id="stock-modal-title">Record stock movement</h2><p>Product balance and audit history will be saved together.</p></div><button type="button" className="icon-button" onClick={close} aria-label="Close"><X size={16}/></button></header><form className="form-grid" onSubmit={submit}>
    {modalError && <div className="error wide" role="alert">{modalError}</div>}
    <label className="field wide"><span>Inventory product</span><select value={form.productId} onChange={event => {const next=event.target.value;const selected=products.find(item=>item.id===next);setForm(current=>({...current,productId:next,quantity:current.type==="Transfer"?String(number(selected?.quantityOnHand)):current.quantity}))}} required>{products.map(item => <option key={item.id} value={item.id}>{value(item.name)} · {value(item.sku)} · {available(item)} available</option>)}</select></label>
    <label className="field"><span>Movement type</span><select value={form.type} onChange={event => setType(event.target.value as MovementType)}>{movementTypes.map(type => <option key={type}>{type}</option>)}</select></label>
    {form.type === "Adjustment" && <label className="field"><span>Adjustment direction</span><select value={form.adjustmentDirection} onChange={event => update("adjustmentDirection",event.target.value as "Increase"|"Decrease")}><option>Increase</option><option>Decrease</option></select></label>}
    <label className="field"><span>Quantity</span><input type="number" min="1" max="1000000" value={form.type === "Transfer" ? String(number(product?.quantityOnHand)) : form.quantity} disabled={form.type === "Transfer"} onChange={event => update("quantity",event.target.value)} required/></label>
    {form.type === "Transfer" && <label className="field"><span>Destination location</span><input value={form.locationTo} onChange={event => update("locationTo",event.target.value)} maxLength={80} placeholder="B-02-01" required/></label>}
    <label className="field"><span>Reference (optional)</span><input value={form.reference} onChange={event => update("reference",event.target.value)} maxLength={80} placeholder="PO-2026-001"/></label>
    <label className="field wide"><span>Reason</span><textarea value={form.reason} onChange={event => update("reason",event.target.value)} minLength={3} maxLength={240} placeholder="Explain why this movement is required" required/></label>
    <div className="movement-preview wide"><b>{value(product?.name) || "Selected product"}</b><span>On hand: {number(product?.quantityOnHand)} · Reserved: {number(product?.reservedQuantity)} · Available: {product ? available(product) : 0}</span><small>{typeHelp[form.type]}</small></div>
    <div className="form-actions wide"><button type="button" onClick={close}>Cancel</button><button className="primary green" disabled={saving}>{saving ? "Recording…" : "Record Movement"}</button></div>
  </form></section></div>;
}
