import {procurementTone,purchaseDisplayTotal,purchaseStatusLabel,type ProcurementRow} from './procurementPresentation';
export default function PurchaseOrderList({rows,loading,error,onOpen}:{rows:readonly ProcurementRow[];loading:boolean;error:string;onOpen:(row:ProcurementRow)=>void}){
 if(error)return <p role="alert" className="error">{error}</p>;
 if(loading)return <p role="status">Loading purchase orders…</p>;
 if(!rows.length)return <p>No purchase orders match this view. Create an order or change the filters.</p>;
 return <div className="procurement-order-list">{rows.map(r=><article className="procurement-compact-order" key={r.id} aria-label={`Purchase order ${String(r.reference??r.id)}`}><div><h3>{String(r.reference??'Reference unavailable')}</h3><p>{String(r.supplierName??'Supplier unavailable')}</p></div><span className={`procurement-status tone-${procurementTone('purchase',r.status)}`}>{purchaseStatusLabel(r.status)}</span><div className="procurement-order-date"><small>Expected</small><span>{String(r.expectedDate??'Unavailable')}</span></div><strong>{purchaseDisplayTotal(r)}</strong><button onClick={()=>onOpen(r)} aria-label={`View order ${String(r.reference??r.id)}`}>View order</button></article>)}</div>;
}
