import {sessionRecoveryStorage} from '../../../lib/firebaseRuntime';
import {useEffect,useRef,useState} from 'react';
import {collection,onSnapshot,query,where} from 'firebase/firestore';
import {auth,db} from '../../../lib/firebase';
import {getActiveWorkspace,workspaceCommand} from '../../../lib/workspace';
import {canReadParcelAnalysis,canStartParcelAnalysis,parcelAnalysisReasonMessage,toPublicParcelAnalysis,validateParcelAnalysisReview} from '../../../lib/parcelAnalysis';
import type {ParcelAnalysisPublic} from '../../../lib/parcelAnalysis';
import {createParcelAnalysisRetry} from '../../../lib/parcelAnalysisRetry';
import type {ParcelAnalysisCommand,ParcelAnalysisRetry,ParcelAnalysisRetryResult} from '../../../lib/parcelAnalysisRetry';
import type {EvidenceStage} from '../../../lib/parcelEvidence';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
import {evidenceComposerKey} from './parcelCapture';

type Props={member:Membership;shipment:DataRecord;evidence:DataRecord};
const recordedTime=(value:number|null)=>value===null?'Not recorded':new Date(value).toLocaleString();
const knownStage=(value:unknown):value is EvidenceStage=>value==='Pre-dispatch'||value==='Delivery';

/** Remount all async UI state on access, shipment or immutable evidence changes. */
export default function ParcelAnalysis(props:Props){
  const {member,shipment,evidence}=props;
  if(evidence.type!=='Parcel Image'||!canReadParcelAnalysis({account:member,scopeId:member.workspaceId,ownerId:String(evidence.ownerId??'')}))return null;
  const stage=knownStage(evidence.stage)?evidence.stage:'Pre-dispatch';
  const key=JSON.stringify([evidenceComposerKey(member,shipment,stage),evidence.id,evidence.version,evidence.sha256,evidence.stage,evidence.integrityVersion]);
  return <AnalysisContext key={key} {...props} stage={stage}/>;
}

function AnalysisContext({member,shipment,evidence,stage}:Props&{stage:EvidenceStage}){
  const [records,setRecords]=useState<ParcelAnalysisPublic[]>([]),[result,setResult]=useState<ParcelAnalysisRetryResult|null>(null);
  const [error,setError]=useState(db?'':'Saved analyses are unavailable. Check your connection and account access.'),[loading,setLoading]=useState(!!db),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const active=useRef(true),inFlight=useRef(false);
  const [recovery]=useState<{client:ParcelAnalysisRetry|null;error:string}>(()=>{
    if(!knownStage(evidence.stage))return {client:null,error:''};
    try{
      const client=createParcelAnalysisRetry({storage:sessionRecoveryStorage,context:{scopeId:member.workspaceId,actorUid:member.uid,evidenceId:evidence.id,stage},command:workspaceCommand as ParcelAnalysisCommand});
      client.pending();
      return {client,error:''};
    }catch{return {client:null,error:'Saved parcel requests cannot be read. Enable session storage and reconcile saved outcomes before requesting analysis.'};}
  });
  useEffect(()=>{
    active.current=true;
    const context={scopeId:member.workspaceId,actorUid:member.uid,evidenceId:evidence.id,stage};
    recovery.client?.setContext(context);
    return()=>{
      active.current=false;
      // Invalidate the retry generation before a late terminal response can
      // remove the original intent. Stage is a UI fence and is never persisted.
      recovery.client?.setContext({...context,stage:stage==='Pre-dispatch'?'Delivery':'Pre-dispatch'});
    };
  },[member.workspaceId,member.uid,evidence.id,stage,recovery]);
  useEffect(()=>{
    if(!db)return;
    let live=true;
    const stop=onSnapshot(query(collection(db,'parcelAnalyses'),where('ownerId','==',member.workspaceId)),snapshot=>{
      if(!live)return;
      const safe:ParcelAnalysisPublic[]=[];
      let invalid=false;
      for(const document of snapshot.docs){
        const raw=document.data();
        if(raw.evidenceId!==evidence.id)continue;
        try{
          const record=toPublicParcelAnalysis(raw);
          if(record.analysisId!==document.id||record.ownerId!==member.workspaceId||record.shipmentId!==shipment.id)throw new Error();
          safe.push(record);
        }catch{invalid=true;}
      }
      setRecords(safe);setLoading(false);
      if(invalid)setError('A saved analysis could not be verified. Reconcile this evidence before relying on its results.');
    },()=>{if(live){setRecords([]);setLoading(false);setError('Saved analyses could not be loaded. Check your connection and account access.');}});
    return()=>{live=false;stop();};
  },[member.workspaceId,evidence.id,shipment.id]);

  const allowed=knownStage(evidence.stage)&&canStartParcelAnalysis({account:member,scopeId:member.workspaceId,ownerId:String(evidence.ownerId??''),role:member.role,shipmentStatus:String(shipment.status??''),stage:evidence.stage,actorUid:member.uid,assignedDriverUid:String(shipment.driverUid??''),type:String(evidence.type),integrityVersion:evidence.integrityVersion===2?2:undefined});
  let pending=false;
  try{pending=!!recovery.client?.pending();}catch{pending=true;}
  function stillCurrent(){
    const current=getActiveWorkspace();
    return active.current&&auth?.currentUser?.uid===member.uid&&current&&evidenceComposerKey(current,shipment,stage)===evidenceComposerKey(member,shipment,stage);
  }
  function safeSavedOutcome(raw:unknown,analysisId:string){
    const saved=toPublicParcelAnalysis(raw);
    if(saved.ownerId!==member.workspaceId||saved.evidenceId!==evidence.id||saved.shipmentId!==shipment.id||saved.analysisId!==analysisId)throw new Error('Analysis context does not match.');
    return saved;
  }
  async function run(work:()=>Promise<ParcelAnalysisRetryResult>,review=false){
    if(inFlight.current||!stillCurrent())return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const saved=await work();
      if(!stillCurrent())return;
      setResult(saved);
      if(review)setNotice('Human review recorded.');
    }catch{
      if(stillCurrent())setError(review?'Review could not be confirmed. Check the saved outcome before reviewing again.':'The outcome could not be confirmed. Keep this saved request and select Check outcome.');
    }finally{inFlight.current=false;if(active.current)setBusy(false);}
  }
  async function closeInterrupted(record:ParcelAnalysisPublic){
    if(!recovery.client||inFlight.current||!stillCurrent())return;
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{const ack=await recovery.client.cleanup(record);if(!stillCurrent())return;if(!ack.released)throw new Error();setResult(null);setNotice(ack.recoveryComplete?'Interrupted request closed. Starting another analysis requires an explicit request.':'Server claim released. Saved request recovery is incomplete; check the remaining saved request before starting again.');}
    catch{if(stillCurrent())setError('This interrupted request could not be closed. Its saved identity remains available for another explicit check.');}
    finally{inFlight.current=false;if(active.current)setBusy(false);}
  }
  const saved=new Map(records.map(record=>[record.analysisId,record]));
  if(result&&result.state!=='Busy'){
    const previous=saved.get(result.analysisId);
    if(!previous||result.version>=previous.version)saved.set(result.analysisId,result);
  }
  const analyses=[...saved.values()].sort((left,right)=>right.createdAt-left.createdAt);
  const canReview=member.active&&member.status==='Approved'&&['Admin','Manager'].includes(member.role);
  return <section className="parcel-analysis" aria-label="Parcel photo analysis">
    <h4>Parcel photo analysis</h4>
    <p>Operational parcel analysis requires an evaluated, accepted model. Local evaluation records experimental observations for this registered photo. Every inference needs human review; a photo shows only visible parcel faces.</p>
    {recovery.error&&<p className="error" role="alert">{recovery.error}</p>}
    {loading&&<p role="status">Loading saved analyses…</p>}
    <div className="evidence-actions">
      {allowed&&!pending&&recovery.client&&<button type="button" disabled={busy||loading} onClick={()=>void run(()=>recovery.client!.submit())}>{busy?'Requesting…':'Request analysis'}</button>}
      {pending&&recovery.client&&<button type="button" disabled={busy} onClick={()=>void run(()=>recovery.client!.check())}>{busy?'Checking…':'Check outcome'}</button>}
    </div>
    {pending&&<p role="status">A saved request needs an outcome check. Its operation ID is preserved in this tab; checking does not automatically start a replacement.</p>}
    {!allowed&&<p>{knownStage(evidence.stage)?'Historical results remain readable. Your current role, assignment or shipment stage does not allow a new analysis.':'Stage not recorded. This legacy photo cannot start a new analysis.'}</p>}
    {result?.state==='Busy'&&<p role="status">{parcelAnalysisReasonMessage(result.reasonCode)} Check outcome to inspect saved analysis {result.analysisId}.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!loading&&analyses.length===0&&!pending&&<p>No saved analysis for this photo.</p>}
    {analyses.map(record=><article className="parcel-analysis-outcome" key={`${record.analysisId}:${record.version}`}>
      <h5>{record.state}{record.label!==null?`: ${record.label}`:''}</h5>
      {record.model?.evaluationKind==='local-experimental'&&<p className="parcel-review-required">Local experimental observation · No operational acceptance. Human review records this image only; it does not approve the model or trigger operational decisions.</p>}
      {record.reasonCode&&<p>{parcelAnalysisReasonMessage(record.reasonCode)}</p>}
      {record.state==='Running'&&<p role="status">Analysis is running. Select Check outcome to refresh; no background retry is scheduled.</p>}
      <dl className="parcel-evidence-details">
        <div><dt>Analysis</dt><dd>{record.analysisId}</dd></div><div><dt>Evidence / version</dt><dd>{record.evidenceId} / {record.evidenceVersion}</dd></div>
        <div><dt>Recorded stage</dt><dd>{record.stage}</dd></div><div><dt>Source</dt><dd>{record.captureSource==='camera'?'Camera (declared)':'File selection (declared)'}</dd></div>
        <div><dt>Requested</dt><dd>{recordedTime(record.createdAt)}</dd></div><div><dt>Completed</dt><dd>{recordedTime(record.completedAt)}</dd></div>
        <div><dt>Lease expires</dt><dd>{recordedTime(record.expiresAt)}</dd></div>
        {record.capturedAtClient&&<div><dt>Client capture time</dt><dd>{new Date(record.capturedAtClient).toLocaleString()} (unverified device clock)</dd></div>}
      </dl>
      <code>Image SHA-256: {record.evidenceSha256}</code>
      {!(record.stage==='Pre-dispatch'&&shipment.status==='Prepared'||record.stage==='Delivery'&&shipment.status==='Dispatched')&&<p>Historical stage assessment; this does not describe the shipment’s current condition.</p>}
      {record.model&&<details><summary>Model and result provenance</summary>
        <p>{record.model.model} · {record.model.preprocessing} · Contrast: {record.model.contrast}</p>
        <dl className="parcel-evidence-details"><div><dt>Model version</dt><dd>{record.model.modelVersion}</dd></div><div><dt>Selection SHA-256</dt><dd>{record.model.selectionSha256}</dd></div><div><dt>Evaluation SHA-256</dt><dd>{record.model.evaluationSha256}</dd></div><div><dt>Acceptance SHA-256</dt><dd>{record.model.acceptanceSha256??'No operational acceptance'}</dd></div>{record.model.evaluationKind==='local-experimental'&&<div><dt>Local evaluation manifest SHA-256</dt><dd>{record.model.evaluationManifestSha256}</dd></div>}<div><dt>Service request</dt><dd>{record.serviceRequestId}</dd></div></dl>
        {record.probabilities&&<p>Normal score {(record.probabilities[0]*100).toFixed(1)}%; Damaged score {(record.probabilities[1]*100).toFixed(1)}%. Confidence is uncalibrated, not a measured probability of correctness.</p>}
        <p>Model processing: {record.processingTimeMs} ms. Service total: {record.totalProcessingTimeMs} ms.</p>
      </details>}
      {record.humanReviewRequired&&<p className="parcel-review-required">Human review required</p>}
      <p>Review: {record.reviewStatus}</p>
      {record.reviewNotes&&<p>Review notes: {record.reviewNotes}</p>}
      {record.reviewedBy&&<p>Reviewed by {record.reviewedBy} · {recordedTime(record.reviewedAt)}</p>}
      {record.state==='Running'&&!pending&&<button type="button" disabled={busy} onClick={()=>void run(async()=>safeSavedOutcome(await workspaceCommand('resolveParcelAnalysis',{analysisId:record.analysisId}),record.analysisId))}>Check saved outcome</button>}
      {recovery.client&&(record.actorUid===member.uid||canReview)&&(record.state==='Running'||pending&&['Expired','Stale'].includes(record.state))&&<button type="button" disabled={busy} onClick={()=>void closeInterrupted(record)}>Close interrupted request</button>}
      {canReview&&record.reviewStatus==='Pending'&&['Predicted','Abstained'].includes(record.state)&&<form className="parcel-analysis-review" onSubmit={event=>{
        event.preventDefault();const input=Object.fromEntries(new FormData(event.currentTarget));
        void run(async()=>{
          const review=validateParcelAnalysisReview({analysisId:record.analysisId,version:record.version,decision:record.state==='Abstained'?'Reviewed':input.decision,notes:input.notes});
          return safeSavedOutcome(await workspaceCommand('reviewParcelAnalysis',review),record.analysisId);
        },true);
      }}>
        <label>Parcel review notes<textarea aria-label="Parcel review notes" name="notes" required minLength={3} maxLength={240} disabled={busy}/></label>
        {record.state==='Predicted'?<label>Decision<select aria-label="Parcel review decision" name="decision" disabled={busy}><option value="Accepted">Accept</option><option value="Rejected">Reject</option></select></label>:<p>Record manual inspection notes. Review keeps the AI label empty.</p>}
        <button disabled={busy}>Record human review</button>
      </form>}
    </article>)}
  </section>;
}
