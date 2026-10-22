import {useEffect, useState} from 'react';
import {collection, onSnapshot, query, where} from 'firebase/firestore';
import {db} from '../../../lib/firebase';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
import EvidenceUpload from './EvidenceUpload';

/** A focused Prepared-shipment view, separate from active picking jobs and delivery events. */
export default function PreDispatchEvidence({member,shipments,evidence}:{
  member:Membership;shipments:DataRecord[];evidence?:DataRecord[];
}){
  const [selected,setSelected]=useState('');
  const [saved,setSaved]=useState<{scope:string;records:DataRecord[]}>({scope:'',records:[]});
  const [error,setError]=useState('');
  useEffect(()=>{
    if(evidence!==undefined||!db)return;
    return onSnapshot(query(collection(db,'evidence'),where('ownerId','==',member.workspaceId)),snapshot=>{
      setSaved({scope:member.workspaceId,records:snapshot.docs.map(doc=>({id:doc.id,...doc.data()} as DataRecord))});
      setError('');
    },()=>setError('Unable to load parcel evidence. Check your connection and account access.'));
  },[member.workspaceId,evidence]);
  const prepared=shipments.filter(shipment=>shipment.status==='Prepared');
  const shipment=prepared.find(shipment=>shipment.id===selected);
  const records=evidence??(saved.scope===member.workspaceId?saved.records:[]);
  return <section className="module-card operations-card pre-dispatch-evidence">
    <h2>Pre-dispatch parcel evidence</h2>
    <p>Photograph the prepared parcel after warehouse handover and before dispatch. This optional record documents its visible condition at this stage.</p>
    {prepared.length ? <label className="field">Prepared shipment
      <select aria-label="Prepared shipment for evidence" value={shipment?.id??''} onChange={event=>setSelected(event.target.value)}>
        <option value="">Select a prepared shipment…</option>
        {prepared.map(record=><option key={record.id} value={record.id}>{String(record.reference)} · {String(record.recipient)}</option>)}
      </select>
    </label> : <p>No Prepared shipments. Complete the warehouse handover to add pre-dispatch parcel photos.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {shipment&&<div className="pre-dispatch-detail"><h3>{String(shipment.reference)} · Prepared</h3>
      <EvidenceUpload shipment={shipment} member={member} stage="Pre-dispatch" evidence={records.filter(record=>record.shipmentId===shipment.id)}/>
    </div>}
  </section>;
}
