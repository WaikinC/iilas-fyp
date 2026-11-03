import {FormEvent,useState} from 'react';
import IntegrityVerification from './IntegrityVerification';
import {useOperationPage} from './operationsData';
import EvidenceFileComparison from './EvidenceFileComparison';
import {workspaceCommand} from '../../../lib/workspace';
import type {DataRecord} from './Operations';
import type {Membership} from '../workspace/WorkspaceGate';
const value=(r:DataRecord,k:string)=>String(r[k]??'');
export default function ResearchVerification({member,products,shipments,evidence,evidenceReady=true}:{member:Membership;products:DataRecord[];shipments:DataRecord[];evidence:DataRecord[];evidenceReady?:boolean}){
  const [revision,setRevision]=useState(0),predictionPage=useOperationPage('predictions',member.workspaceId,revision),movementPage=useOperationPage('stockMovements',member.workspaceId,revision),registrationPage=useOperationPage('verificationRecords',member.workspaceId,revision);
  const predictions=predictionPage.rows,movements=movementPage.rows,verifications=registrationPage.rows;
  const [kind,setKind]=useState('delivery'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const canReview=['Admin','Manager'].includes(member.role);
  async function run(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work();setRevision(v=>v+1);}catch(e){setError(e instanceof Error?e.message:'Operation failed.');}finally{setBusy(false);}}
  async function predict(e:FormEvent<HTMLFormElement>){e.preventDefault();const input=Object.fromEntries(new FormData(e.currentTarget));await run(async()=>{await workspaceCommand('predict',input);setNotice('Prediction stored for human review.');});}
  const candidates=kind==='inventory'?products:shipments.filter(s=>s.status==='Dispatched');
  const verificationEvidence=evidence.filter(e=>!predictions.some(p=>p.kind==='parcel'&&p.recordId===e.id&&(['evaluationKind','evaluationManifestSha256','evaluationOnly','runtimeMode'].some(key=>Object.hasOwn(p,key))||p.acceptanceSha256===null)));
  return <>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="success-notice" role="status">{notice}</p>}
    <section className="module-card operations-card"><h2>Research inference & human review</h2><p>Action lists use independent 20-record pages in document-ID order. Page through older retained candidates without changing their source. These lists are not totals.</p><p>For simulated stock scenarios, open Stock Management → Stock AI experiment. Real inventory predictions are unavailable until history is qualified. For the simulated delivery Random Forest and separate rule assessments, open Delivery Monitoring → Delivery AI demonstration. Historical generic prediction records remain below. Request parcel photo analysis beside its registered evidence in Warehouse Operations or Delivery Monitoring. Inference requires labelled training data and evaluated model files. Predictions never approve orders or change delivery status.</p>
      {['Admin','Manager','Inventory','Logistics','Driver'].includes(member.role)&&<form className="operations-form" onSubmit={predict}><label>Analysis<select name="kind" aria-label="Research analysis" value={kind} onChange={e=>setKind(e.target.value)}><option value="delivery">Delivery risk</option></select></label><label>Research record<select name="id" aria-label="Research record" required key={kind}><option value="">Select record…</option>{candidates.map(r=><option value={r.id} key={r.id}>{value(r,'name')||value(r,'reference')}</option>)}</select></label><button disabled={busy} className="primary navy">Request analysis</button></form>}
      <ActionPager page={predictionPage} label="prediction actions"/>
      {predictions.map(p=><article className="operations-row" key={p.id}><div><b>{value(p,'kind')}: {value(p,'label')} · {(Number(p.confidence)*100).toFixed(1)}%</b><p>{value(p,'model')} · Version {value(p,'modelVersion')} · {value(p,'reviewStatus')}</p>{(['evaluationKind','evaluationManifestSha256','evaluationOnly','runtimeMode'].some(key=>Object.hasOwn(p,key))||p.kind==='parcel'&&p.acceptanceSha256===null)&&<p className="parcel-review-required">Local experimental observation · No operational acceptance. Human review applies to this image only. Excluded from operational alerts and verification candidates.</p>}<small>{p.kind==='parcel'?'This observation covers visible packaging only. Scores are uncalibrated; human review cannot approve the model.':'Global feature importance describes the model overall; it does not explain a specific prediction.'}</small></div>{canReview&&p.reviewStatus==='Pending'&&<form className="operations-form" onSubmit={e=>{e.preventDefault();const input=Object.fromEntries(new FormData(e.currentTarget));void run(async()=>{await workspaceCommand('reviewPrediction',{...input,id:p.id,version:p.version});setNotice('Human review recorded.');});}}><label>Review notes<input name="notes" required minLength={3} maxLength={p.analysisId?240:500}/></label><select aria-label="Prediction review decision" name="decision">{(p.kind!=='parcel'||Boolean(p.analysisId))&&<option>Accept</option>}<option>Reject</option></select><button disabled={busy}>Record review</button></form>}</article>)}
    </section>
    <ActionPager page={movementPage} label="movement candidates"/>
    <IntegrityVerification member={member} movements={movements} evidence={verificationEvidence}/>
    <section className="module-card operations-card"><h2>Previously recorded registrations</h2><p>Historical registrations retain their original digest and chain receipt. Run a new retained check above to observe the current source and local chain.</p>
      <ActionPager page={registrationPage} label="registration history"/>
      {verifications.map(v=><article key={v.id}><b>{value(v,'kind')} · {value(v,'status')}</b><code className="invitation-code">{value(v,'digest')}</code><small>Chain {value(v,'chainId')} · Transaction {value(v,'transactionHash')}</small></article>)}
      <EvidenceFileComparison evidence={evidence} ready={evidenceReady}/>
    </section>
  </>;
}

function ActionPager({page,label}:{page:ReturnType<typeof useOperationPage>;label:string}){return <div className="integrity-actions">{page.error&&<p role="alert">{label} unavailable.</p>}<button type="button" disabled={page.loading||!page.page} onClick={page.newer}>Previous {label}</button><button type="button" disabled={page.loading||page.rows.length<20} onClick={page.older}>Next {label}</button><small>Page {page.page+1}; up to20 records. {page.loading?"Loading…":"Other pages are not included."}</small></div>;}
