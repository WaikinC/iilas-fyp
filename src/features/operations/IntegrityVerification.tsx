import {sessionRecoveryStorage} from '../../../lib/firebaseRuntime';
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {collection,doc,getDoc,getDocs,limit,orderBy,query,startAfter,where,type QueryDocumentSnapshot} from 'firebase/firestore';
import type {Eip1193Provider} from 'ethers';
import {auth,db,demoEnvironment} from '../../../lib/firebase';
import {getActiveWorkspace,workspaceCommand} from '../../../lib/workspace';
import {createCompletionClient} from '../../../lib/completionClient';
import {completionCanonical,type CompletionInput,type CompletionOutcome} from '../../../lib/completionWorkflow';
import {createIntegrityRegistrationClient,createIntegrityWallet,type PreparedIntegrity,type SavedRegistration} from '../../../lib/integrityRegistrationClient';
import {useDialogFocus} from '../../components/useDialogFocus';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
declare global {interface Window {ethereum?:Eip1193Provider}}
const staff=['Admin','Manager','Inventory','Warehouse','Logistics','Driver','Viewer'];
const value=(r:DataRecord,k:string)=>String(r[k]??'Unknown');
const date=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?new Date(v).toLocaleString():'Unknown';
function integrityNotice(result:CompletionOutcome|PreparedIntegrity){
 if(result.state==='Pending')return 'reason' in result&&result.reason==='DeploymentChanged'?'Pending: the local blockchain changed. Keep this request for administrator recovery.':'reason' in result&&result.reason==='ManualReconciliationRequired'?'Pending: this request needs administrator recovery. Do not sign again.':'Pending: awaiting confirmation. Use the saved request below.';
 if(result.state==='Completed')return result.action==='registerIntegrityTransaction'?'Completed: registration saved. Check its hash below.':result.action==='checkIntegrityRecord'?'Completed: hash check saved. See its result below.':'Completed: review saved.';
 return result.state==='Prepared'?'Prepared: continue the saved wallet request.':'Cancelled: the original request was closed.';
}
function tabId(){try{const key='iilas.completion.tab';let tab=sessionStorage.getItem(key);if(!tab){tab=crypto.randomUUID();sessionStorage.setItem(key,tab);}return tab;}catch{return 'storage-unavailable';}}
function useBoundedPage(kind:string,scope:string,refresh:number,openOnly=false,exceptionId:string|null=null){
 const signature=JSON.stringify([kind,scope,refresh,openOnly,exceptionId]);
 const [navigation,setNavigation]=useState({signature:'',page:0});
 const page=navigation.signature===signature?navigation.page:0,requestKey=signature+':'+page;
 const [data,setData]=useState<{key:string;rows:DataRecord[];loading:boolean;error:string}>({key:'',rows:[],loading:true,error:''});
 const trail=useRef<{signature:string;cursors:QueryDocumentSnapshot[];last:QueryDocumentSnapshot|null}>({signature:'',cursors:[],last:null});
 useEffect(()=>{
  let live=true;
  async function load(){
   if(!db)return;
   if(trail.current.signature!==signature)trail.current={signature,cursors:[],last:null};
   setData({key:requestKey,rows:[],loading:true,error:''});
   const constraints=[where('ownerId','==',scope),...(openOnly?[where('status','in',['Open','NeedsFollowUp'])]:[]),...(exceptionId?[where('exceptionId','==',exceptionId)]:[]),orderBy(exceptionId?'reviewVersion':'createdAt','desc'),...(page&&trail.current.cursors[page-1]?[startAfter(trail.current.cursors[page-1])]:[]),limit(20)];
   try{const result=await getDocs(query(collection(db,kind),...constraints));if(live){trail.current.last=result.docs.at(-1)??null;setData({key:requestKey,rows:result.docs.map(d=>({id:d.id,...d.data()} as DataRecord)),loading:false,error:''});}}
   catch(e){if(live)setData({key:requestKey,rows:[],loading:false,error:e instanceof Error?e.message:'History unavailable.'});}
  }
  void load();return()=>{live=false;};
 },[kind,scope,page,openOnly,exceptionId,signature,requestKey]);
 return {rows:data.key===requestKey?data.rows:[],page,loading:data.key!==requestKey||data.loading,error:data.key===requestKey?data.error:'',older:()=>{const cache=trail.current;if(cache.signature===signature&&cache.last){cache.cursors[page]=cache.last;setNavigation({signature,page:page+1});}},newer:()=>setNavigation({signature,page:Math.max(0,page-1)})};
}
type Props={member:Membership;movements:DataRecord[];evidence:DataRecord[]};
export default function IntegrityVerification(props:Props){
 const m=props.member;
 if(!staff.includes(m.role)||m.status!=='Approved'||!m.active)return null;
 return <IntegrityBody key={`${m.uid}:${m.workspaceId}:${m.role}:${m.version}`} {...props}/>;
}
function IntegrityBody({member,movements,evidence}:Props){
 const [kind,setKind]=useState<'inventory'|'delivery'>('inventory'),[recordId,setRecordId]=useState(''),[search,setSearch]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[refresh,setRefresh]=useState(0),[allExceptions,setAllExceptions]=useState(false);
 const [registration,setRegistration]=useState<SavedRegistration|null>(null),[checkIntent,setCheckIntent]=useState<CompletionInput|null>(null),[reviewIntent,setReviewIntent]=useState<CompletionInput|null>(null);
 const [detail,setDetail]=useState<{kind:'check'|'exception';row:DataRecord}|null>(null),[decision,setDecision]=useState(''),[notes,setNotes]=useState('');
 const live=useRef(true),dialog=useRef<HTMLElement>(null),canWrite=['Admin','Manager'].includes(member.role);
 const close=useCallback(()=>{setDetail(null);setDecision('');setNotes('');},[]);useDialogFocus(dialog,close,detail!==null);
 const isCurrent=useCallback(()=>{const current=getActiveWorkspace();return auth?.currentUser?.uid===member.uid&&current?.uid===member.uid&&current?.workspaceId===member.workspaceId&&current?.role===member.role;},[member.uid,member.workspaceId,member.role]);
 const clients=useMemo(()=>{
  const context={uid:member.uid,scope:member.workspaceId,tab:tabId()};
  const command=async(action:string,input:CompletionInput)=>{
   const result=await workspaceCommand(action,input) as CompletionOutcome;
   if(result?.state==='Completed'&&['checkIntegrityRecord','resolveIntegrityCheck'].includes(action)){
    if(!db||result.version!==1)throw Error('The retained observation could not be verified.');
    const saved=await getDoc(doc(db,'integrityChecks',result.recordId!)),row=saved.data();
    if(!row||row.ownerId!==context.scope||completionCanonical(row.input)!==completionCanonical(input)||row.source?.snapshot?.recordId!==input.recordId||row.source?.snapshot?.kind!==input.kind||row.source?.snapshot?.ownerId!==context.scope||!['Verified','Unmatched','NotRegistered','Unavailable'].includes(row.outcome))throw Error('The retained observation does not match its original request. Recover the saved operation.');
   }return result;
  };
  const common=createCompletionClient({storage:sessionRecoveryStorage,context,command,isCurrent,resolveActions:{checkIntegrityRecord:'resolveIntegrityCheck',reviewIntegrityException:'resolveIntegrityReview'}});
  const wallet={verify:async(p:PreparedIntegrity)=>{const adapter=createIntegrityWallet(window.ethereum,{requireDeploymentProof:demoEnvironment.mode!=='local-emulator'});if(!adapter)throw Error('Connect a compatible local Ethereum wallet.');return adapter.verify(p);},sign:async(p:PreparedIntegrity)=>{const adapter=createIntegrityWallet(window.ethereum,{requireDeploymentProof:demoEnvironment.mode!=='local-emulator'});if(!adapter)throw Error('Connect a compatible local Ethereum wallet.');return adapter.sign(p);}};
  const registration=createIntegrityRegistrationClient({storage:sessionRecoveryStorage,context,command:(a,i)=>workspaceCommand(a,i as Record<string,unknown>),isCurrent,wallet});
  return {common,registration};
 },[member.uid,member.workspaceId,isCurrent]);
 const readIntents=useCallback(()=>{try{setRegistration(clients.registration.pending());setCheckIntent(clients.common.pending('checkIntegrityRecord'));setReviewIntent(clients.common.pending('reviewIntegrityException'));}catch(e){setError(e instanceof Error?e.message:'Saved operation unavailable. Keep its data.');}},[clients]);
 useEffect(()=>{live.current=true;clients.common.activate();clients.registration.activate();async function initial(){readIntents();try{const v=await workspaceCommand('getIntegrityAvailability',{});if(live.current&&isCurrent())setEnabled(Boolean((v as {enabled?:boolean})?.enabled));}catch{if(live.current&&isCurrent())setEnabled(false);}}void initial();return()=>{live.current=false;clients.common.dispose();clients.registration.dispose();};},[clients,isCurrent,readIntents]);
 const checks=useBoundedPage('integrityChecks',member.workspaceId,refresh),exceptions=useBoundedPage('integrityExceptions',member.workspaceId,refresh,!allExceptions);
 const events=useBoundedPage('integrityReviewEvents',member.workspaceId,refresh,false,detail?.kind==='exception'?detail.row.id:'no-selection');
 async function run(work:()=>Promise<CompletionOutcome|PreparedIntegrity>){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const result=await work();if(result.state==='Completed'&&'action' in result&&result.action==='reviewIntegrityException'&&db){const snapshot=await getDoc(doc(db,'integrityExceptions',result.recordId!)),row=snapshot.data();if(!row||row.ownerId!==member.workspaceId||Number(row.reviewVersion)<Number(result.version))throw Error('The retained review detail is unavailable. Refresh its history.');if(live.current&&isCurrent())setDetail(previous=>previous?.kind==='exception'&&previous.row.id===result.recordId?{kind:'exception',row:{id:snapshot.id,...row} as DataRecord}:previous);}if(live.current&&isCurrent()){setNotice(integrityNotice(result));setRefresh(v=>v+1);}}
  catch(e){if(live.current&&isCurrent())setError(e instanceof Error?e.message:'Operation failed. Recover the same saved operation.');}
  finally{if(live.current&&isCurrent()){setBusy(false);readIntents();}}
 }
 function review(e:FormEvent){e.preventDefault();if(!detail||detail.kind!=='exception')return;void run(()=>clients.common.start('reviewIntegrityException',{exceptionId:detail.row.id,expectedReviewVersion:detail.row.reviewVersion,decision,notes}));}
 const candidates=(kind==='inventory'?movements:evidence).filter(r=>[r.id,r.reference,r.name,r.type,r.productName].some(x=>String(x??'').toLowerCase().includes(search.toLowerCase()))).slice(0,200);
 const selected=detail?.kind==='exception'?exceptions.rows.find(x=>x.id===detail.row.id)??detail.row:detail?.row;
 const savedSource=registration&&(registration.input.kind==='inventory'?movements:evidence).find(row=>row.id===registration.input.recordId);
 const registrationNeedsRecovery=['DeploymentChanged','ManualReconciliationRequired'].includes(registration?.prepared?.reason??'');
 const registrationStatus=registrationNeedsRecovery?'Administrator recovery needed':registration?({New:'Request saved',Prepared:'Ready for MetaMask',Signing:'Waiting for MetaMask',Submitted:'Checking transaction'} as const)[registration.phase]:null;
 const registrationInstruction=registrationNeedsRecovery?(registration?.prepared?.reason==='DeploymentChanged'?'The local blockchain changed. Keep this saved request for an administrator to check. Do not sign again.':'Keep this saved request for an administrator to check. Do not sign again.'):registration?.phase==='Signing'?'Complete the original request in MetaMask, then check its result here. Do not request another signature.':registration?.phase==='Submitted'?'Your transaction hash is saved. Check its result without signing again.':'Continue this saved request. Keep the original record and wallet selected.';
 return <section className="module-card operations-card integrity-workflow">
  <header className="integrity-heading"><div><h2>SHA-256 blockchain verification</h2><p>Register a record, then check its saved hash.</p></div><span className={`integrity-status ${enabled?'integrity-status--ready':'integrity-status--Unavailable'}`}>{enabled?'Local demo available':'Local demo unavailable'}</span></header>
  <details className="integrity-technical"><summary>About this verification</summary><p>Hashes are stored on the local demonstration blockchain. A matching hash confirms the observed record; it does not prove the original facts or fraud. Full records and files stay off-chain.</p>{demoEnvironment.mode!=='local-emulator'&&<p>Complete signing in MSI Chrome with the configured local wallet. Other devices can read saved results and request checks.</p>}</details>
  {error&&<p className="integrity-feedback integrity-feedback--error" role="alert">{error}</p>}{notice&&<p className={`integrity-feedback ${notice.startsWith('Pending:')?'integrity-feedback--pending':'integrity-feedback--neutral'}`} role="status">{notice}</p>}
  {!enabled&&<p className="integrity-warning">New verification actions are unavailable. Start the configured local demonstration profile. Existing history and saved-outcome recovery remain visible.</p>}
  {!canWrite&&<p>Retained observations are available to approved staff. An Admin or Manager performs new checks and independent reviews.</p>}
  {registration&&<section className="integrity-recovery" aria-label="Saved registration">
   <header className="integrity-heading"><h3>Saved registration</h3><span className="integrity-status integrity-status--Pending">{registrationStatus}</span></header>
   <p className="integrity-source-name">{savedSource?String(savedSource.productName??savedSource.name??savedSource.reference??savedSource.type):registration.input.kind==='inventory'?'Inventory movement':'Delivery evidence'}</p><p>{registrationInstruction}</p>
   <div className="integrity-actions"><button className="primary navy" disabled={busy} onClick={()=>void run(()=>clients.registration.resolve())}>Check registration</button>{registration.phase!=='Signing'&&!registrationNeedsRecovery&&<button className="integrity-secondary" disabled={busy} onClick={()=>void run(()=>clients.registration.retry())}>Retry saved registration</button>}</div>
   {busy&&<p role="status">Checking the saved request…</p>}
   <details className="integrity-technical"><summary>Wallet checklist and technical details</summary><dl><dt>Record ID</dt><dd><code>{registration.input.recordId}</code></dd><dt>Saved request</dt><dd><code>{registration.input.operationId}</code></dd><dt>Transaction</dt><dd><code>{registration.transactionHash??'Not yet acknowledged by wallet'}</code></dd>{registration.prepared&&<><dt>Expected network</dt><dd>MSI local demonstration · Chain {registration.prepared.chainId}</dd><dt>Expected signing account</dt><dd><code>{registration.prepared.authorisedWallet}</code></dd><dt>Expected contract</dt><dd><code>{registration.prepared.contract}</code></dd><dt>Transaction value</dt><dd>0 ETH, plus local test gas</dd><dt>Original source version</dt><dd>{registration.prepared.sourceVersion}</dd><dt>SHA-256 digest</dt><dd><code>{registration.prepared.digest}</code></dd></>}</dl></details>
  </section>}
  {checkIntent&&<div className="integrity-recovery"><p>Saved observation: {String(checkIntent.kind)} · {String(checkIntent.recordId)} · {checkIntent.operationId}</p><button disabled={busy} onClick={()=>void run(()=>clients.common.retry('checkIntegrityRecord'))}>Retry saved observation</button><button disabled={busy} onClick={()=>void run(()=>clients.common.resolve('checkIntegrityRecord'))}>Check saved observation outcome</button></div>}
  {reviewIntent&&<div className="integrity-recovery"><p>Saved exception review: {String(reviewIntent.exceptionId)} · {reviewIntent.operationId}</p><button disabled={busy} onClick={()=>void run(()=>clients.common.retry('reviewIntegrityException'))}>Retry saved integrity review</button><button disabled={busy} onClick={()=>void run(()=>clients.common.resolve('reviewIntegrityException'))}>Check saved integrity review outcome</button></div>}
  {canWrite&&<form className="operations-form" onSubmit={e=>{e.preventDefault();void run(()=>clients.common.start('checkIntegrityRecord',{kind,recordId}));}}>
   <label>Workflow<select aria-label="Integrity workflow" value={kind} onChange={e=>{setKind(e.target.value as 'inventory'|'delivery');setRecordId('');setSearch('');}}><option value="inventory">Inventory movement</option><option value="delivery">Delivery evidence</option></select></label>
   <label>Find source<input aria-label="Find integrity source" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <label>Source record<select aria-label="Integrity source record" required value={recordId} onChange={e=>setRecordId(e.target.value)}><option value="">Select a committed record…</option>{candidates.map(r=><option key={r.id} value={r.id}>{value(r,'type')} · {String(r.productName??r.name??r.reference??r.id)} · {r.id.slice(-8)}</option>)}</select></label>
   <small>Search applies to the loaded candidate page. Use the page controls above for other records. Only eligible committed records can be registered.</small>
   <div className="integrity-action-choices"><div><button className="primary integrity-wallet-action" type="button" disabled={busy||!enabled||!recordId||!!registration} onClick={()=>void run(()=>clients.registration.start({kind,recordId}))}>Register hash with wallet</button><p>Creates a local blockchain transaction in MetaMask.</p></div><div><button className="integrity-secondary" disabled={busy||!enabled||!recordId||!!checkIntent}>Check and retain hash</button><p>Compares the hash and saves a result. Does not register it.</p></div></div>
  </form>}
  <section aria-label="Retained integrity checks"><h3>Retained integrity checks</h3><p>Saved observations at the time of each check.</p>{checks.error&&<p role="alert">{checks.error}</p>}{checks.loading?<p role="status">Loading checks…</p>:checks.rows.length===0?<p>No checks on this page.</p>:checks.rows.map(r=><article className="integrity-row" key={r.id}><div><b className={`integrity-status integrity-status--${value(r,'outcome')}`}>{value(r,'outcome')==='NotRegistered'?'Not registered':value(r,'outcome')}</b><p>{value(r,'kind')} · {value(r,'recordId')}<br/>{date(r.observedAtMs)}</p></div><button onClick={()=>setDetail({kind:'check',row:r})} aria-label={`View integrity check ${r.id}`}>View original observation</button></article>)}<div className="integrity-actions"><button disabled={!checks.page||checks.loading} onClick={checks.newer}>Newer integrity checks</button><button disabled={checks.rows.length<20||checks.loading} onClick={checks.older}>Older integrity checks</button></div></section>
  <section aria-label="Integrity exception queue"><h3>Integrity exception review</h3><label><input type="checkbox" checked={allExceptions} onChange={e=>{setAllExceptions(e.target.checked);close();}}/> Include acknowledged exceptions</label>{exceptions.error&&<p role="alert">{exceptions.error}</p>}{exceptions.loading?<p role="status">Loading exceptions…</p>:exceptions.rows.length===0?<p>No exceptions on this page.</p>:exceptions.rows.map(r=><article className="integrity-row" key={r.id}><div><b>{value(r,'outcome')} · {value(r,'status')}</b><p>{value(r,'kind')} · {value(r,'recordId')} · Review {value(r,'reviewVersion')}</p></div><button onClick={()=>{setDecision('');setNotes('');setDetail({kind:'exception',row:r});}} aria-label={`Review integrity exception ${r.id}`}>View exception and reviews</button></article>)}<div className="integrity-actions"><button disabled={!exceptions.page||exceptions.loading} onClick={exceptions.newer}>Newer integrity exceptions</button><button disabled={exceptions.rows.length<20||exceptions.loading} onClick={exceptions.older}>Older integrity exceptions</button></div></section>
  {detail&&selected&&<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="integrity-detail-title" className="modal integrity-detail">
   <h3 id="integrity-detail-title">{detail.kind==='check'?'Original integrity observation':'Independent integrity review'}</h3><button type="button" aria-label="Close integrity details" onClick={close}>Close</button>
   <p>{value(selected,'kind')} · {value(selected,'recordId')} · {value(selected,'outcome')}</p>
   {detail.kind==='check'?<dl><dt>Source version</dt><dd>{String((selected.source as {snapshot?:{sourceVersion?:number}})?.snapshot?.sourceVersion??'Unknown')}</dd><dt>Expected digest</dt><dd><code>{String((selected.source as {digest?:string})?.digest??'Unavailable')}</code></dd><dt>Observed registry digest</dt><dd><code>{value(selected,'observedDigest')}</code></dd><dt>Original canonical record</dt><dd><pre>{String((selected.source as {canonical?:string})?.canonical??'Unsupported legacy source')}</pre></dd><dt>Chain, contract and block</dt><dd>{String((selected.chain as {chainId?:number})?.chainId??'Unknown')} · {String((selected.chain as {address?:string})?.address??'Unknown')} · {value(selected,'blockNumber')}</dd><dt>Observation time / failure code</dt><dd>{date(selected.observedAtMs)} · {value(selected,'failureCode')}</dd></dl>:<>
    <p>Review version {value(selected,'reviewVersion')}. Decisions change only this review summary. The original observation, source and blockchain hash remain unchanged.</p>
    {canWrite&&selected.checkActor!==member.uid&&<form className="operations-form" onSubmit={review}><label>Decision<select aria-label="Integrity review decision" required value={decision} onChange={e=>setDecision(e.target.value)}><option value="">Choose a decision…</option><option value="Acknowledge">Acknowledge</option><option value="NeedsFollowUp">Needs follow-up</option></select></label><label>Review notes<textarea aria-label="Integrity review notes" minLength={3} maxLength={500} required value={notes} onChange={e=>setNotes(e.target.value)}/></label><button disabled={busy||!enabled||!!reviewIntent||!decision||notes.trim().length<3}>Record integrity review</button></form>}
    {selected.checkActor===member.uid&&<p>A different Admin or Manager must review your observation.</p>}
    <h4>Immutable review revisions</h4>{events.error&&<p role="alert">{events.error}</p>}{events.rows.map(r=><article key={r.id}><b>Review {value(r,'reviewVersion')} · {value(r,'decision')}</b><p>{value(r,'notes')}</p><small>Reviewer {value(r,'actor')}</small></article>)}{!events.loading&&events.rows.length===0&&<p>No review revisions on this page.</p>}<div className="integrity-actions"><button disabled={!events.page||events.loading} onClick={events.newer}>Newer integrity reviews</button><button disabled={events.rows.length<20||events.loading} onClick={events.older}>Older integrity reviews</button></div>
   </>}
  </section></div>}
 </section>;
}
