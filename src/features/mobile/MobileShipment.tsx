import {useState} from 'react';
import type {DriverDetail,DriverDraft,DriverTracking} from '../../../lib/mobilePlatformClient.js';
import MobileTracking from './MobileTracking';
const next:Record<string,string[]>={Dispatched:['In Transit'],'In Transit':['Attempt Failed','Delivered','Returned'],'Attempt Failed':['In Transit','Returned']};
export default function MobileShipment({detail,tracking,drafts,busy,onVerify,onStatus,onChoose,onProof,onStart,onStop}:{detail:DriverDetail;tracking:DriverTracking|null;drafts:DriverDraft[];busy:boolean;onVerify:()=>void;onStatus:(status:string,notes:string,proofId:string|null)=>void;onChoose:()=>Promise<DriverDraft|null>;onProof:(file:DriverDraft)=>void;onStart:()=>void;onStop:()=>void}){
 const [selection,setSelection]=useState('');const [notes,setNotes]=useState('');const [proofId,setProofId]=useState('');const [selectedFile,setSelectedFile]=useState<DriverDraft|null>(null);
 const shipment=detail.shipment,effective=detail.queuedStatus??shipment.status,options=next[effective]??[],status=options.includes(selection)?selection:options[0]??'';
 const proofs=[...shipment.proofs,...detail.pendingProofs.filter(p=>!['Needs review','Discarded'].includes(p.state)).filter(p=>!shipment.proofs.some(s=>s.id===p.evidenceId)).map(p=>({id:p.evidenceId,name:p.name+' (pending registration)'}))];
 return <article className="mobile-shipment"><header><div><p className="mobile-reference">{shipment.reference}</p><h2>Delivery details</h2></div><button disabled={busy} onClick={onVerify}>Verify shipment</button></header>
  <p className="mobile-confirmed">Confirmed status: {shipment.status}</p>{detail.queuedStatus&&<p className="mobile-pending" role="status">Queued status: {detail.queuedStatus}</p>}
  <p className="mobile-caption">{detail.cached?'Saved on this phone.':'Checked with MSI.'} Last checked {new Date(detail.verifiedAtMs).toLocaleString()}.</p>
  <dl><dt>Recipient</dt><dd>{shipment.recipient}</dd><dt>Delivery address</dt><dd>{shipment.address}</dd><dt>Expected delivery</dt><dd>{shipment.expectedDelivery}</dd></dl>
  <section aria-labelledby="delivery-update-title"><h2 id="delivery-update-title">Record delivery progress</h2>{options.length?<form onSubmit={event=>{event.preventDefault();onStatus(status,notes,proofId||null);}}>
   <label htmlFor="mobile-delivery-status">Next delivery status</label><select id="mobile-delivery-status" value={status} disabled={busy} onChange={event=>setSelection(event.target.value)}>{options.map(option=><option key={option}>{option}</option>)}</select>
   <label htmlFor="mobile-delivery-notes">Delivery notes</label><textarea id="mobile-delivery-notes" value={notes} maxLength={500} disabled={busy} onChange={event=>setNotes(event.target.value)} required minLength={3}/>
   {status==='Delivered'&&<><label htmlFor="mobile-proof-id">Delivery proof</label><select id="mobile-proof-id" value={proofId} disabled={busy} onChange={event=>setProofId(event.target.value)}><option value="">Choose registered or queued proof</option>{proofs.map(proof=><option key={proof.id} value={proof.id}>{proof.name}</option>)}</select></>}
   <p className="mobile-caption">Queued updates stay separate from confirmed status. Delivery completes only after its proof and update are confirmed.</p>
   <button className="mobile-primary" disabled={busy||notes.trim().length<3||status==='Delivered'&&!proofId}>Queue delivery update</button>
  </form>:<p>No further delivery transition is available for this status.</p>}</section>
  <section aria-labelledby="mobile-proof-title"><h2 id="mobile-proof-title">Delivery proof</h2><p>Select a PDF or an existing JPG, PNG or WebP, up to 10 MB.</p>
   <button disabled={busy||['Delivered','Returned'].includes(effective)} onClick={()=>void onChoose().then(file=>{if(file)setSelectedFile(file);})}>Choose proof file</button>
   {drafts.length>0&&<><label htmlFor="mobile-saved-draft">Saved proof files</label><select id="mobile-saved-draft" value={selectedFile?.fileId??''} disabled={busy} onChange={event=>setSelectedFile(drafts.find(d=>d.fileId===event.target.value)??null)}><option value="">Choose a saved file</option>{drafts.map(file=><option key={file.fileId} value={file.fileId}>{file.name}</option>)}</select></>}
   {selectedFile&&<div className="mobile-file"><p>{selectedFile.name} · {selectedFile.bytes.toLocaleString()} bytes</p><button disabled={busy||['Delivered','Returned'].includes(effective)} onClick={()=>{onProof(selectedFile);setSelectedFile(null);}}>Queue proof upload</button></div>}
  </section>
  <MobileTracking value={tracking} busy={busy} disabled={['Delivered','Returned'].includes(effective)} onStart={onStart} onStop={onStop}/>
 </article>;
}
