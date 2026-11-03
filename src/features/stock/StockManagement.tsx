import { useEffect, useMemo, useRef, useState } from "react";
import {X} from "lucide-react";
import StockWorkspaceView from "./StockWorkspaceView";
import type {StockSection} from "./stockWorkspacePresentation";
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {db} from '@/lib/firebase';
import {getActiveWorkspace} from '@/lib/workspace';
import {locationBalances,locationKey} from '@/lib/locationStock';
import Field from "../../components/FormField";
import {usePagination} from "../../components/Pagination";
import {useDialogFocus} from "../../components/useDialogFocus";
import { pendingStockMovement, resolveStockMovement, saveStockMovement } from "@/lib/firebase";
import InventoryRisk from './InventoryRisk';
import InventoryAIExperiment from './InventoryAIExperiment';
import type {Membership} from '../workspace/WorkspaceGate';

type RecordData = { id: string; [key: string]: unknown };
type MovementType = "Receipt" | "Issue" | "Adjustment" | "Reservation" | "Release" | "Transfer";
type MovementForm = {
  productId: string;
  type: MovementType;
  adjustmentDirection: "Increase" | "Decrease";
  quantity: string;
  locationTo: string;
  locationFrom?: string;
  reference: string;
  reason: string;
};
type SavedCorrection={productId:string;type:'Correction';correctionOf:string;reason:string;reference:string;operationId:string};
type SavedMovement = Omit<MovementForm,"quantity"|"adjustmentDirection"> & {quantity:number;adjustmentDirection:string;operationId:string};
const savedMovement = () => pendingStockMovement() as SavedMovement | SavedCorrection | null;
type Props = {
  member:Membership;
  readOnly?:boolean;
  products: RecordData[];
  movements: RecordData[];
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

const value = (input: unknown) => typeof input === "string" ? input : "";
const number = (input: unknown) => Number(input ?? 0);
const available = (product: RecordData) => Math.max(0, number(product.quantityOnHand) - number(product.reservedQuantity));
const movementTypes: MovementType[] = ["Receipt", "Issue", "Adjustment", "Reservation", "Release", "Transfer"];
function locations(product:RecordData):{location:string;quantity:number;reserved:number;warehouse:number}[]{try{return locationBalances(product);}catch{return [];}}

export default function StockManagement(props:Props){
 const {member}=props;
 return <StockManagementBody key={`${member.uid}:${member.workspaceId}:${member.role}:${member.version}`} {...props}/>;
}
function StockManagementBody({ member, products, movements, onNotice, onError, readOnly=false }: Props) {
  const [section,setSection]=useState<StockSection>('balances');
  const [assessmentSelection,setAssessmentSelection]=useState('');
  const activeProducts = useMemo(() => products.filter(product => product.archived !== true && product.status === "Active"), [products]);
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState("All movements");
  const [correction,setCorrection]=useState<string|null>(null),[correctionLinks,setCorrectionLinks]=useState<RecordData[]>([]);
  const scope=getActiveWorkspace()?.workspaceId;
  useEffect(()=>db&&scope?onSnapshot(query(collection(db,'stockCorrectionLinks'),where('ownerId','==',scope)),s=>setCorrectionLinks(s.docs.map(d=>({id:d.id,...d.data()}))),e=>onError(e.message)):undefined,[scope,onError]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [assessmentProduct,setAssessmentProduct]=useState<string|null>(null);
  const [experimentOpen,setExperimentOpen]=useState(false);
  const filteredProducts = useMemo(() => activeProducts.filter(product => {
    const term = search.trim().toLowerCase();
    return !term || [product.name, product.sku, product.barcode, product.category, product.location, ...locations(product).map(row=>row.location)].some(item => value(item).toLowerCase().includes(term));
  }), [activeProducts, search]);
  const filteredMovements = useMemo(() => movements.filter(movement => movementFilter === "All movements" || movement.type === movementFilter), [movements, movementFilter]);
  const balancesPage = usePagination(filteredProducts), movementsPage = usePagination(filteredMovements);
  const totals = activeProducts.reduce((result, product) => ({
    onHand: result.onHand + number(product.quantityOnHand),
    reserved: result.reserved + number(product.reservedQuantity),
    available: result.available + available(product),
    low: result.low + (available(product) <= number(product.reorderLevel) ? 1 : 0),
  }), {onHand:0,reserved:0,available:0,low:0});
  const openMovement = (productId?: string) => {
    try {
      const pending=savedMovement();if(pending?.type==='Correction'){setCorrection(pending.correctionOf);return;}
      const fallback = pending?.productId || productId || activeProducts[0]?.id;
      if (!fallback) { onError("Add an active product before recording stock movement."); return; }
      onError("");setSelectedProductId(fallback);
    }catch(error){onError(error instanceof Error?error.message:"Unable to open the saved stock movement.");}
  };

  const openCorrection=(id:string)=>{try{const pending=savedMovement();if(pending&&pending.type!=='Correction'){openMovement();return;}setCorrection(pending?.type==='Correction'?pending.correctionOf:id);}catch(e){onError(e instanceof Error?e.message:'Unable to open correction.');}};
  return <>
    <StockWorkspaceView section={section} onSectionChange={setSection} readOnly={readOnly} onRecordMovement={()=>openMovement()}
      balances={{search,onSearch:next=>{setSearch(next);balancesPage.setPage(1);},page:balancesPage,activeCount:activeProducts.length,totals,onRecord:id=>openMovement(id),onAssess:setAssessmentProduct}}
      history={{filter:movementFilter,onFilter:next=>{setMovementFilter(next);movementsPage.setPage(1);},page:movementsPage,correctionLinks,onCorrection:openCorrection}}
      assessment={{products:activeProducts,selectedProductId:assessmentSelection,onSelect:setAssessmentSelection,onAssess:setAssessmentProduct,onExperiment:()=>setExperimentOpen(true)}}/>
    {correction&&<CorrectionModal original={movements.find(m=>m.id===correction)} onClose={()=>setCorrection(null)} onSaved={message=>{setCorrection(null);onNotice(message);}}/>}
    {selectedProductId && <MovementModal products={activeProducts} initialProductId={selectedProductId} onClose={() => setSelectedProductId(null)} onError={onError} onSaved={message => {setSelectedProductId(null);onNotice(message);}}/>}
    {assessmentProduct&&<InventoryRisk key={`${member.uid}.${member.workspaceId}.${assessmentProduct}`} member={member} productId={assessmentProduct} onClose={()=>setAssessmentProduct(null)} onNotice={onNotice} onError={onError}/>}
    {experimentOpen&&<InventoryAIExperiment key={`${member.uid}.${member.workspaceId}`} member={member} products={activeProducts} onClose={()=>setExperimentOpen(false)} onNotice={onNotice}/>}
  </>;
}

function CorrectionModal({original,onClose,onSaved}:{original?:RecordData;onClose:()=>void;onSaved:(message:string)=>void}){
  const initialSaved=savedMovement(),[pending,setPending]=useState(initialSaved?.type==='Correction'?initialSaved:null);
  const [reason,setReason]=useState(pending?.reason||''),[reference,setReference]=useState(pending?.reference||''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const inFlight=useRef(false),dialog=useRef<HTMLElement>(null);
  const close=()=>{if(!inFlight.current){if(!pending&&(reason||reference)&&!confirm('Discard this unsubmitted correction request?'))return;onClose();}};
  useDialogFocus(dialog,close);
  async function send(resolve=false){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try{
      const result=resolve?await resolveStockMovement():await saveStockMovement({productId:pending?.productId||String(original?.productId||''),type:'Correction',correctionOf:pending?.correctionOf||original?.id||'',reason,reference});
      onSaved(result.notApplied?'The saved correction was not submitted.':result.pendingApproval?'Correction submitted for independent manager approval. Stock remains unchanged.':'Correction outcome confirmed.');
    }catch(e){setError(e instanceof Error?e.message:'Unable to request correction.');try{const saved=savedMovement();setPending(saved?.type==='Correction'?saved:null);if(saved?.type==='Correction')setError("We couldn't confirm whether the correction was submitted. Retry the saved correction or check its outcome before starting another.");}catch(e){setError(e instanceof Error?e.message:'Unable to read saved request.');}}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <div className="modal-backdrop"><section ref={dialog} tabIndex={-1} className="modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="correction-title"><header><div><h2 id="correction-title">Request linked correction</h2><p>Reverse a mistaken manual entry with independent approval.</p></div><button className="icon-button" aria-label="Close correction" disabled={busy} onClick={close}><X size={16}/></button></header><p><b>{value(original?.productName)||'Previously selected movement'}</b> · {value(original?.type)} · {number(original?.quantity)} units</p><p className="stock-correction-reference">Original movement: {original?.id||pending?.correctionOf}</p><p>The full original entry is reversed. Stock already used or reserved must be resolved before approval. Record a new correct entry afterwards. The original history remains unchanged.</p>{error&&<p className="error" role="alert">{error}</p>}{pending&&<p role="status">This saved request needs confirmation. Retry it or check its outcome.</p>}<form className="form-grid" onSubmit={e=>{e.preventDefault();void send();}}><Field label="Correction reference (optional)" wide><input value={reference} disabled={busy||Boolean(pending)} maxLength={80} onChange={e=>setReference(e.target.value)}/></Field><Field label="Correction reason" wide><textarea data-dialog-initial-focus value={reason} required minLength={3} maxLength={240} disabled={busy||Boolean(pending)} onChange={e=>setReason(e.target.value)} placeholder="Explain the mistaken entry and the physical checks performed"/></Field><p className="wide">A different Admin or Manager reviews the request in Reporting &amp; Verification.</p><div className="form-actions wide"><button type="button" disabled={busy} onClick={close}>{pending?'Close, keep saved correction':'Cancel'}</button>{pending&&<button type="button" disabled={busy} onClick={()=>void send(true)}>Check outcome</button>}<button className="primary" disabled={busy}>{busy?'Saving…':pending?'Retry saved correction':'Request correction'}</button></div></form></section></div>;
}

function MovementModal({products,initialProductId,onClose,onError,onSaved}:{products:RecordData[];initialProductId:string;onClose:()=>void;onError:(message:string)=>void;onSaved:(message:string)=>void}) {
  const dialog = useRef<HTMLElement>(null);
  const submitting = useRef(false);
  const initial: MovementForm = {productId:initialProductId,type:"Receipt",adjustmentDirection:"Increase",quantity:"1",locationTo:"",locationFrom:value(products.find(p=>p.id===initialProductId)?.location),reference:"",reason:""};
  const [pending, setPending] = useState(()=>{const saved=savedMovement();return saved?.type==='Correction'?null:saved;});
  const [form, setForm] = useState<MovementForm>(()=>pending?{...pending,adjustmentDirection:pending.adjustmentDirection==='Decrease'?'Decrease':'Increase',quantity:String(pending.quantity)}:initial);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const product = products.find(item => item.id === form.productId);
  const typeHelp: Record<MovementType,string> = {
    Receipt:"Adds newly received units to stock on hand.",
    Issue:"Removes available units for internal use, damage, or manual stock-out.",
    Adjustment:"Corrects a verified stock-count difference.",
    Reservation:"Sets available units aside without changing physical stock.",
    Release:"Returns reserved units to the available balance.",
    Transfer:"Moves the entered available quantity between locations. Reserved units stay in their allocated location.",
  };
  const update = <K extends keyof MovementForm>(key:K, next:MovementForm[K]) => setForm(current => ({...current,[key]:next}));
  const close = () => { if(submitting.current)return; if(!pending&&JSON.stringify(form)!==JSON.stringify(initial)&&!confirm("Discard this unrecorded stock movement?"))return;onClose(); };
  useDialogFocus(dialog, close);
  const setType = (type:MovementType) => setForm(current => ({...current,type,locationTo:type === "Transfer" ? current.locationTo : ""}));
  async function record(check=false) {
    if(submitting.current)return;
    submitting.current=true;setSaving(true);setModalError("");onError("");
    try {
      const result=check?await resolveStockMovement():await saveStockMovement({...form,quantity:form.quantity});
      onSaved(result.notApplied?"The saved movement was not applied. You can now enter a new movement.":result.pendingApproval?"Adjustment submitted for manager approval; this submission did not change the balance.":result.replayed||check?"The saved stock movement was already recorded. No additional balance change was made.":"Stock movement recorded successfully.");
    }catch(error){
      setModalError(error instanceof Error?error.message:"Unable to record stock movement.");
      try { const saved=savedMovement();setPending(saved?.type==='Correction'?null:saved);if(saved&&saved.type!=='Correction')setModalError("We couldn't confirm whether the movement was recorded. Retry the saved movement or check its outcome before recording another."); }catch(storageError){setModalError(storageError instanceof Error?storageError.message:"Unable to read the saved request.");}
    }finally{submitting.current=false;setSaving(false);}
  }
  const locked=saving||Boolean(pending);
  const selectedLocation=(form.locationFrom||value(product?.location)).trim().replace(/\s+/g,' ').toUpperCase();
  const selectedBin=product?locations(product).find(row=>locationKey(row.location)===selectedLocation):undefined;
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => {if(event.target===event.currentTarget)close()}}><section ref={dialog} tabIndex={-1} className="modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title"><header><div><h2 id="stock-modal-title">Record stock movement</h2><p>Product balance and audit history will be saved together.</p></div><button type="button" disabled={saving} className="icon-button" onClick={close} aria-label="Close"><X size={16}/></button></header><form className="form-grid" onSubmit={event=>{event.preventDefault();void record();}}>
    {modalError && <div className="error wide" role="alert">{modalError}</div>}
    {pending&&<p className="wide" role="status">A saved movement needs confirmation. Its fields are locked. Retry it or check its outcome. Closing keeps it saved in this tab.</p>}
    <Field label="Inventory product" wide><select aria-label="Inventory product" disabled={locked} value={form.productId} onChange={event => {const next=event.target.value;const selected=products.find(item=>item.id===next);setForm(current=>({...current,productId:next,locationFrom:value(selected?.location)}))}} required>{!product&&pending&&<option value={form.productId}>Previously selected product</option>}{products.map(item => <option key={item.id} value={item.id}>{value(item.name)} · {value(item.sku)} · {available(item)} available</option>)}</select></Field>
    <Field label="Movement type"><select aria-label="Movement type" disabled={locked} value={form.type} onChange={event => setType(event.target.value as MovementType)}>{movementTypes.map(type => <option key={type}>{type}</option>)}</select></Field>
    {form.type === "Adjustment" && <Field label="Adjustment direction"><select aria-label="Adjustment direction" disabled={locked} value={form.adjustmentDirection} onChange={event => update("adjustmentDirection",event.target.value as "Increase"|"Decrease")}><option>Increase</option><option>Decrease</option></select></Field>}
    <Field label="Quantity"><input type="number" min="1" max="1000000" value={form.quantity} disabled={locked} onChange={event => update("quantity",event.target.value)} required/></Field>
    <Field label={form.type==='Transfer'?'Source location':'Stock location'}><input list="stock-location-options" disabled={locked} value={form.locationFrom??value(product?.location)} onChange={event=>update('locationFrom',event.target.value)} maxLength={80} required/></Field><datalist id="stock-location-options">{(product?locations(product):[]).map(row=><option key={row.location} value={row.location}>{row.quantity-row.reserved} available</option>)}</datalist>
    {form.type === "Transfer" && <Field label="Destination location"><input disabled={locked} value={form.locationTo} onChange={event => update("locationTo",event.target.value)} maxLength={80} placeholder="B-02-01" required/></Field>}
    <Field label="Reference (optional)"><input disabled={locked} value={form.reference} onChange={event => update("reference",event.target.value)} maxLength={80} placeholder="PO-2026-001"/></Field>
    <Field label="Reason" wide><textarea disabled={locked} value={form.reason} onChange={event => update("reason",event.target.value)} minLength={3} maxLength={240} placeholder="Explain why this movement is required" required/></Field>
    <div className="movement-preview wide"><b>{value(product?.name) || "Selected product"}</b><span>Selected location: {form.locationFrom||value(product?.location)} · {selectedBin?`${selectedBin.quantity} on hand · ${selectedBin.reserved} reserved · ${selectedBin.quantity-selectedBin.reserved} available`:'New location: receipts and increases only'}</span><small>Product total: {number(product?.quantityOnHand)} on hand · {number(product?.reservedQuantity)} reserved · {product?available(product):0} available</small><small>{typeHelp[form.type]}</small></div>
    <div className="form-actions wide"><button type="button" disabled={saving} onClick={close}>{pending?"Close, keep saved movement":"Cancel"}</button>{pending&&<button type="button" disabled={saving} onClick={()=>void record(true)}>Check outcome</button>}<button className="primary green" disabled={saving}>{saving ? "Checking…" : pending?"Retry saved movement":"Record Movement"}</button></div>
  </form></section></div>;
}
