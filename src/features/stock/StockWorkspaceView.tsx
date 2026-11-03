import {useId} from 'react';
import StockModuleTabs from './StockModuleTabs';
import {ArrowDownToLine,ArrowUpFromLine,Box,Bookmark,MapPin,Package,Plus,Search,ClipboardCheck,BrainCircuit} from 'lucide-react';
import {locationBalances,locationKey,correctionMovement} from '../../../lib/locationStock';
import Pagination from '../../components/Pagination';
import type {StockRecord,StockWorkspaceViewProps} from './stockWorkspacePresentation';
const value=(input:unknown)=>typeof input==='string'?input:'';
const number=(input:unknown)=>Number(input??0);
const available=(product:StockRecord)=>Math.max(0,number(product.quantityOnHand)-number(product.reservedQuantity));
const movementTypes=['Receipt','Issue','Adjustment','Reservation','Release','Transfer'];
const movementIcon=(type:string)=>type==='Receipt'?<ArrowDownToLine size={15} aria-hidden="true"/>:type==='Issue'?<ArrowUpFromLine size={15} aria-hidden="true"/>:type==='Reservation'||type==='Release'?<Bookmark size={15} aria-hidden="true"/>:type==='Transfer'?<MapPin size={15} aria-hidden="true"/>:<Box size={15} aria-hidden="true"/>;
const timestamp=(input:unknown)=>input&&typeof input==='object'&&'seconds' in input?new Date(Number((input as {seconds:number}).seconds)*1000).toLocaleString():'Pending';
function locations(product:StockRecord):{location:string;quantity:number;reserved:number;warehouse:number}[]{try{return locationBalances(product);}catch{return [];}}
function eligible(movement:StockRecord){try{correctionMovement(movement,'Eligibility check','');return true;}catch{return false;}}
export default function StockWorkspaceView({section,onSectionChange,readOnly,onRecordMovement,balances,history,assessment}:StockWorkspaceViewProps){
 const idPrefix=useId();
 const selectedProduct=assessment.products.find(product=>product.id===assessment.selectedProductId);

  return <div className="stock-page stock-workspace">
    <div className="stock-heading"><div><h1>Stock Management</h1><p>Record every stock change and keep on-hand, reserved, and available quantities in sync.</p></div><button className="stock-main-action" disabled={readOnly} onClick={onRecordMovement}><Plus size={20} aria-hidden="true"/>Record movement</button></div>
    <StockModuleTabs value={section} onChange={onSectionChange} idPrefix={idPrefix}/>
    <details className="stock-status-key"><summary>Status colour guide</summary><ul>
      <li><span className="stock-status" data-status="Healthy">Healthy / completed</span></li>
      <li><span className="stock-status" data-status="Pending">Pending / needs review</span></li>
      <li><span className="stock-status" data-status="Critical">Failed / critical</span></li>
      <li><span className="stock-status" data-status="In progress">In progress</span></li>
      <li><span className="stock-status" data-status="Unknown">Unknown / unavailable</span></li>
    </ul><p>Colour describes the label shown. Experimental AI results remain experimental.</p></details>
    <section id={`${idPrefix}-balances-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-balances-tab`} hidden={section!=='balances'}>
    {section==='balances'&&<>
    <div className="stock-summary">
      <StockMetric label="On hand" value={balances.totals.onHand} detail="Physical units recorded"/>
      <StockMetric label="Reserved" value={balances.totals.reserved} detail="Allocated to future work"/>
      <StockMetric label="Available" value={balances.totals.available} detail="Usable for dispatch"/>
      <StockMetric label="Reorder alerts" value={balances.totals.low} detail="At or below reorder level" warning={balances.totals.low > 0}/>
    </div>
    <section className="module-card stock-card">
      <header className="stock-card-header"><div><h2>Inventory balances</h2><p>Available quantity equals on hand minus reserved.</p></div></header>
      <div className="toolbar"><div className="search"><Search size={20} aria-hidden="true"/><input value={balances.search} aria-label="Search inventory balances" onChange={event=>balances.onSearch(event.target.value)} placeholder="Search name, SKU, barcode or location…"/></div></div>
      <p className="stock-table-hint">Scroll within the table to reach every stock field and action on a smaller screen.</p>
      <div className="table-wrap" role="region" aria-label="Inventory balances table" tabIndex={0}><table><thead><tr>{["Product","SKU","Location","On hand","Reserved","Available","Reorder level","Status","Action"].map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>
        {balances.page.pageItems.map(product => { const free = available(product); const low = free <= number(product.reorderLevel); const bins=locations(product); return <tr key={product.id}><td><span className="stock-product"><span className="stock-product-image">{value(product.imageDataUrl) ? <img src={value(product.imageDataUrl)} alt=""/> : <Package size={17} aria-hidden="true"/>}</span><b>{value(product.name)}</b></span></td><td className="mono">{value(product.sku)}</td><td><details className="stock-location-list"><summary>{bins.length?`${bins.length} location${bins.length===1?'':'s'}`:'Balance needs review'}</summary>{!bins.length&&<p className="error">Location totals need administrator reconciliation before recording stock.</p>}{bins.map(row=><p key={row.location}><b>{row.location}</b>{locationKey(row.location)===locationKey(String(product.location))?' (default receipt location)':''}<br/>{row.quantity} on hand · {row.reserved} reserved · {row.quantity-row.reserved} available</p>)}</details></td><td>{number(product.quantityOnHand).toLocaleString()}</td><td>{number(product.reservedQuantity).toLocaleString()}</td><td><b>{free.toLocaleString()}</b></td><td>{number(product.reorderLevel).toLocaleString()}</td><td><span className={`stock-level stock-status ${low ? "low" : "healthy"}`} data-status={low?"Reorder":"Healthy"}>{low ? "Reorder" : "Healthy"}</span></td><td><div className="stock-row-actions"><button className="stock-action stock-support-action" aria-label={`Record movement for ${value(product.name)}`} disabled={readOnly||!bins.length} onClick={() => balances.onRecord(product.id)}>Record</button>{!readOnly&&<button className="stock-action stock-support-action" aria-label={`Stock assessment for ${value(product.name)}`} onClick={()=>balances.onAssess(product.id)}>Stock assessment</button>}</div></td></tr>; })}
        {balances.page.total === 0 && <tr><td className="empty-cell" colSpan={9}>{balances.activeCount ? "No products match the search." : "No active products are available."}</td></tr>}
      </tbody></table></div><Pagination {...balances.page} label="active products"/>
    </section>
    </>}
    </section>
    <section id={`${idPrefix}-history-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-history-tab`} hidden={section!=='history'}>
    {section==='history'&&<>
    <section className="module-card stock-card">
      <header className="stock-card-header"><div><h2>Movement history</h2><p>Immutable movements and approved linked corrections.</p></div><select aria-label="Movement history type" value={history.filter} onChange={event=>history.onFilter(event.target.value)}><option>All movements</option><option>Correction</option>{movementTypes.map(type => <option key={type}>{type}</option>)}</select></header>
      <p className="stock-table-hint">Scroll within the table for references, reasons and correction actions. Original records stay unchanged.</p>
      <div className="table-wrap" role="region" aria-label="Movement history table" tabIndex={0}><table><thead><tr>{["Date","Movement","Product","Quantity","On hand","Reserved","Location","Reference","Reason","Correction"].map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>
        {history.page.pageItems.map(movement => <tr key={movement.id}><td>{timestamp(movement.createdAt)}</td><td><span className={`movement-type ${value(movement.type).toLowerCase()}`}>{movementIcon(value(movement.type))}{value(movement.type)}</span></td><td><b>{value(movement.productName)}</b><small className="stock-subline mono">{value(movement.sku)}</small></td><td>{number(movement.quantity).toLocaleString()}</td><td>{number(movement.quantityBefore)} → <b>{number(movement.quantityAfter)}</b></td><td>{number(movement.reservedBefore)} → <b>{number(movement.reservedAfter)}</b></td><td>{value(movement.locationFrom) === value(movement.locationTo) ? value(movement.locationTo) : `${value(movement.locationFrom)} → ${value(movement.locationTo)}`}</td><td className="mono">{value(movement.reference) || "—"}</td><td className="stock-reason" title={value(movement.reason)}>{value(movement.reason)}{Boolean(movement.correctionOf)&&<small className="stock-subline">Reverses movement {value(movement.correctionOf)}</small>}</td><td>{movement.correctionOf?'Linked reversal':history.correctionLinks.find(link=>link.id===movement.id&&link.status!=='Rejected')?<span className="stock-state stock-status" data-status={value(history.correctionLinks.find(link=>link.id===movement.id)!.status)}>{value(history.correctionLinks.find(link=>link.id===movement.id)!.status)} correction</span>:!readOnly&&eligible(movement)?<button className="stock-support-action" aria-label={`Request correction for movement ${movement.id}`} onClick={()=>history.onCorrection(movement.id)}>Request correction</button>:<small>Use owning workflow{!movement.origin?' · legacy record':''}</small>}</td></tr>)}
        {history.page.total === 0 && <tr><td className="empty-cell" colSpan={10}>No movements match this view. Choose All movements to see the complete history.</td></tr>}
      </tbody></table></div><Pagination {...history.page} label="movement records"/>
    </section>
    </>}
    </section>
    <section id={`${idPrefix}-assessment-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-assessment-tab`} hidden={section!=='assessment'}>
    {section==='assessment'&&<>
      <p className="stock-section-intro">Choose a recorded-stock check or a separate fictional AI experiment.</p>
      <div className="stock-assessment-entries">
        <section className="module-card stock-card stock-assessment-entry" aria-labelledby={`${idPrefix}-rules-title`}>
          <ClipboardCheck size={24} aria-hidden="true"/><h2 id={`${idPrefix}-rules-title`}>Check recorded stock</h2><p className="stock-entry-kind">Rule-based · recorded product facts</p>
          <p>Review current quantities, reorder rules and recorded history. The existing panel includes saved snapshots and independent staff reviews.</p>
          <label htmlFor={`${idPrefix}-product`}>Product to assess</label>
          <select id={`${idPrefix}-product`} value={selectedProduct?.id??''} disabled={readOnly||!assessment.products.length} onChange={event=>assessment.onSelect(event.target.value)}>
            <option value="">Choose an active product…</option>{assessment.products.map(product=><option key={product.id} value={product.id}>{value(product.name)} · {value(product.sku)}</option>)}
          </select>
          {!assessment.products.length&&<p className="stock-entry-notice">No active product is available for a recorded-stock check.</p>}
          {assessment.selectedProductId&&!selectedProduct&&<p className="stock-entry-notice" role="status">The selected product is no longer active. Choose a current product.</p>}
          {readOnly&&<p className="stock-entry-notice">This account can view stock records. Product assessment actions are unavailable.</p>}
          <button className="stock-support-action" type="button" disabled={readOnly||!selectedProduct} onClick={()=>{if(!readOnly&&selectedProduct)assessment.onAssess(selectedProduct.id);}}>Open stock check</button>
        </section>
        <section className="module-card stock-card stock-assessment-entry" aria-labelledby={`${idPrefix}-ai-title`}>
          <BrainCircuit size={24} aria-hidden="true"/><h2 id={`${idPrefix}-ai-title`}>Stock AI experiment</h2><p className="stock-entry-kind is-experimental">Experimental · simulated inputs</p>
          <p>Try the frozen Random Forest with a fictional scenario, or a demo product with explicitly fictional context. Existing result history and saved-request recovery stay in the experiment.</p>
          <p className="stock-entry-notice">Independent real-inventory accuracy validation is pending. A prediction does not change stock or approve a purchase.</p>
          <button className="stock-main-action" type="button" onClick={assessment.onExperiment}>Open AI experiment</button>
        </section>
      </div>
      <p className="stock-section-intro">Reorder requirement and purchase-order reviews remain in Replenishment &amp; Procurement.</p>
    </>}
    </section>
  </div>;
}

function StockMetric({label,value:metric,detail,warning=false}:{label:string;value:number;detail:string;warning?:boolean}) {
  return <article className={`stock-metric ${warning ? "warning" : ""}`}><small>{label}</small><b>{metric.toLocaleString()}</b><span>{detail}</span></article>;
}
