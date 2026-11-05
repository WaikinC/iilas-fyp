import {sessionRecoveryStorage} from '../../../lib/firebaseRuntime';
import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {collection,getDocs,limit,orderBy,query,startAfter,where,QueryDocumentSnapshot,DocumentData} from 'firebase/firestore';
import {db} from '../../../lib/firebase';
import {getActiveWorkspace,workspaceCommand} from '../../../lib/workspace';
import {createDeliveryDemoController,DeliveryAction} from '../../../lib/deliveryRiskDemoClient';
import {DELIVERY_CLASSES,DELIVERY_RULES,type RuleAssessment} from '../../../lib/deliveryRiskDemo';
import RiskScoreBreakdown from '../../components/RiskScoreBreakdown';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
import {deliveryTone} from './delivery/deliveryPresentation';

type RecoveryPresentation={showLocalRecovery?:boolean;onRecoveryChange?:()=>void;refreshKey?:number};
const noRecoveryChange=()=>{};
type Context={snapshot:{observedAtMs:number;currentStatus:string};facts:Record<string,unknown>|null;unavailableReasons:string[];modelConfigured:boolean;canAnalyse:boolean};
type Result=DataRecord&{
 actor:string;shipmentId:string;status?:string;reason?:string;observedAtMs:number;experimentId?:string;
 prediction?:{label:string;probabilities:Record<string,number>;outOfRange:string[];modelSha256:string;processingTimeMs:number;totalProcessingTimeMs:number};
 assessment?:RuleAssessment;
 reviewVersion:number;reviewStatus:string;requiresReview:boolean;policyVersion:string;sourceSha256:string;
 source:{facts:Record<string,unknown>|null;reference?:string;currentStatus?:string};
 aiWarning?:string;review?:{notes:string};
};
const text=(e:unknown)=>e instanceof Error?e.message:'Unable to confirm delivery action. Check its saved outcome.';
const observationTime=new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'});
const observation=(at:number)=>Number.isFinite(at)&&Math.abs(at)<=8640000000000000?`${observationTime.format(at)} MYT`:'Observation time unavailable';
const number=new Intl.NumberFormat('en-MY',{maximumFractionDigits:2});
const factLabels={
 expectedDurationHours:'Planned delivery window',elapsedHours:'Time since dispatch',failedAttempts:'Failed attempts',
 hasProof:'Matching proof recorded',statusEventCount:'Recorded status updates',parcelCount:'Parcels',
 hoursSinceLastUpdate:'Time since last update',currentStatus:'Delivery status',
} as const;
const rangeLabels:Record<string,string>={
 expected_duration_hours:factLabels.expectedDurationHours,elapsed_hours:factLabels.elapsedHours,
 failed_attempts:factLabels.failedAttempts,has_proof:factLabels.hasProof,status_event_count:factLabels.statusEventCount,
 parcel_count:factLabels.parcelCount,hours_since_last_update:factLabels.hoursSinceLastUpdate,
 status_dispatched:factLabels.currentStatus,status_in_transit:factLabels.currentStatus,status_attempt_failed:factLabels.currentStatus,
};
const issueLabels:Record<string,string>={
 currentStatus:'Delivery status',dispatchedAtMs:'Dispatch time',deadlineMs:'Expected delivery time',
 lastUpdateAtMs:'Last delivery update',failedAttempts:'Failed attempt count',proofValid:'Matching delivery proof',
 invalidTransition:'Recorded status sequence',shipment_not_dispatched:'Shipment is awaiting dispatch',
 invalid_dispatch_time:'Dispatch time needs checking',invalid_expected_window:'Expected delivery time needs checking',
 missing_transport_plan:'Transport plan is missing',event_capacity:'Status history exceeds the analysis limit',
 invalid_or_future_event_time:'A status update has an invalid time',missing_delivery_with_events:'Delivery record is missing',
 invalid_failed_count:'Failed attempt count needs checking',inconsistent_last_update:'Last delivery update needs checking',
 unverified_proof_reference:'Delivery proof needs checking',invalid_status_history:'Recorded status sequence needs checking',
 delivery_closed:'Delivery is closed',invalid_feature_units:'Recorded values are outside supported input limits',
 source_unavailable:'Delivery facts are unavailable',source_changed:'Delivery records changed during analysis',
 access_changed:'Delivery access changed during analysis',configuration_changed:'Model configuration changed during analysis',
 busy:'The model service was busy',service_unavailable:'The model service was unavailable',timeout:'The model service timed out',
 invalid_or_unavailable_response:'A valid model response was unavailable',request_expired:'The model request expired',
};
const lookup=(labels:Record<string,string>,key:string,fallback:string)=>Object.hasOwn(labels,key)?labels[key]:fallback;
const issueText=(code:string)=>lookup(issueLabels,code,'A saved delivery detail needs checking');
const knownLevel=(level:unknown):level is 'Low'|'Medium'|'High'=>level==='Low'||level==='Medium'||level==='High';
const reviewLabels:Record<string,string>={Pending:'Awaiting review',NeedsFollowUp:'Follow-up requested',Acknowledge:'Acknowledged'};
const operationNotices:Record<string,string>={
 Predicted:'Model estimate and rule assessment saved.',
 Unavailable:'Model result unavailable. The separate rule assessment was saved.',
 Assessed:'Rule assessment saved.',
 Reviewed:'Independent review saved.',
 Running:'The saved analysis is still running. Check its outcome again shortly.',
 Cancelled:'The saved operation was cancelled.',
};

function Facts({facts}:{facts:Record<string,unknown>}){
 return <dl className="delivery-risk-facts">{Object.entries(factLabels).map(([key,label])=>{
  const value=facts[key];
  let display='Unavailable';
  if(typeof value==='number'&&Number.isFinite(value))display=`${number.format(value)}${key.endsWith('Hours')||key==='hoursSinceLastUpdate'?' hours':''}`;
  if(typeof value==='boolean')display=value?'Yes':'No';
  if(typeof value==='string'&&value)display=value;
  return <div key={key}><dt>{label}</dt><dd>{display}</dd></div>;
 })}</dl>;
}

function completeRuleScore(assessment:RuleAssessment|undefined):assessment is RuleAssessment&{score:number;level:'Low'|'Medium'|'High'}{
 return assessment?.complete===true&&typeof assessment.score==='number'&&Number.isSafeInteger(assessment.score)&&assessment.score>=0&&knownLevel(assessment.level);
}

function RulePoints({assessment}:{assessment:RuleAssessment}){
 const complete=completeRuleScore(assessment);
 return <>
  {!complete&&<p className="delivery-risk-warning">Rule total unavailable</p>}
  {assessment.dataReviewRequired&&complete&&<p className="delivery-risk-warning">The recorded delivery history needs review.</p>}
  {assessment.matches.length>0?<div className="delivery-rule-matches">
   <b>{complete?'Matched rules':'Known matches from the incomplete check'}</b>
   <ul>{assessment.matches.map(({code,points,reason})=><li key={code}><span>{reason}</span><strong>+{points}</strong></li>)}</ul>
  </div>:<p>{complete?'None of the delivery rules matched.':'The available facts did not show any matches.'}</p>}
  {assessment.unknowns.length>0&&<div className="delivery-risk-warning">
   <b>Missing or inconsistent facts</b>
   <ul>{[...new Set(assessment.unknowns.map(issueText))].map(issue=><li key={issue}>{issue}</li>)}</ul>
  </div>}
  <details className="delivery-risk-disclosure">
   <summary>How rule points work</summary>
   <p>Each matched delivery rule adds points. The total is available when the required facts can be checked.</p>
   {assessment.ruleVersion===DELIVERY_RULES&&<>
    <dl className="delivery-rule-bands" aria-label="Rule score bands">
     <div><dt>Low</dt><dd>0–19 points</dd></div>
     <div><dt>Medium</dt><dd>20–49 points</dd></div>
     <div><dt>High</dt><dd>50 or more points</dd></div>
    </dl>
    <ul className="delivery-rule-guide" aria-label="Delivery checks and point values">
     <li>Active delivery past its expected date · 30 points</li>
     <li>Two or more failed attempts · 25 points</li>
     <li>Delivered without matching proof · 20 points</li>
     <li>Invalid recorded status sequence · 15 points</li>
     <li>Active delivery with no update for more than 24 hours · 10 points</li>
    </ul>
   </>}
  </details>
 </>;
}

function guidance(kind:'AI'|'Rules',level:unknown,needsDataReview:boolean){
 if(needsDataReview)return 'Check the missing or inconsistent shipment details and refresh the source.';
 if(level==='High')return 'Review delivery progress and failed attempts, then agree on follow-up with the delivery team.';
 if(level==='Medium')return kind==='AI'?'Confirm the expected delivery time and watch for the next update.':'Check the matched rules and confirm the next delivery action.';
 if(level==='Low')return kind==='AI'?'Continue normal monitoring and check for recorded exceptions.':'Continue normal monitoring and review any matched items.';
 return kind==='AI'?'Check the reason below and use the separate rule assessment.':'Refresh the source or review the recorded delivery facts.';
}
function tabIdentity(){let v=sessionStorage.getItem('iilas.deliveryDemo.tab');if(!v){v=crypto.randomUUID();sessionStorage.setItem('iilas.deliveryDemo.tab',v);}return v;}
function useController(member:Membership){
 const controller=useMemo(()=>createDeliveryDemoController({scope:member.workspaceId,uid:member.uid,tab:tabIdentity(),storage:sessionRecoveryStorage,command:workspaceCommand,isCurrent:()=>getActiveWorkspace()?.workspaceId===member.workspaceId&&getActiveWorkspace()?.uid===member.uid}),[member.uid,member.workspaceId]);
 useEffect(()=>{controller.activate();return()=>controller.dispose();},[controller]);return controller;
}
function usePage(kind:string,scope:string,shipmentId:string|null,queued:boolean,refresh:number){
 const [rows,setRows]=useState<Result[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[cursor,setCursor]=useState<QueryDocumentSnapshot<DocumentData>|null>(null),[page,setPage]=useState(0);
 useEffect(()=>{let live=true;void Promise.resolve().then(()=>{if(live){setCursor(null);setPage(0);}});return()=>{live=false;};},[scope,shipmentId,queued,refresh]);
 useEffect(()=>{let live=true;if(!db)return;void Promise.resolve().then(()=>{if(live)setBusy(true);});const clauses=[where('ownerId','==',scope),...(shipmentId?[where('shipmentId','==',shipmentId)]:[]),...(queued?[where('requiresReview','==',true)]:[]),orderBy('createdAt','desc'),...(cursor?[startAfter(cursor)]:[]),limit(20)];void getDocs(query(collection(db,kind),...clauses)).then(s=>{if(live){setRows(s.docs.map(d=>({id:d.id,...d.data()} as Result)));setMore(s.size===20);setError('');last.current=s.docs.at(-1)??null;}}).catch(e=>{if(live)setError(text(e));}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};},[kind,scope,shipmentId,queued,refresh,cursor]);
 const last=useRef<QueryDocumentSnapshot<DocumentData>|null>(null);
 return {rows,error,busy,more,page,next:()=>{setCursor(last.current);setPage(p=>p+1);},first:()=>{setCursor(null);setPage(0);}};
}
function ResultCard({row,kind,member,review,relatedRule}:{row:Result;kind:'AI'|'Rules';member:Membership;review:(row:Result,kind:'AI'|'Rules',decision:string,notes:string)=>void;relatedRule?:RuleAssessment}){
 const prediction=kind==='AI'?row.prediction:undefined;
 const assessment=kind==='Rules'?row.assessment:undefined;
 const ruleScore=completeRuleScore(assessment)?assessment:null;
 const level=kind==='AI'?prediction?.label:ruleScore?.level;
 const headline=knownLevel(level)?`${level} risk`:kind==='AI'?'Model result unavailable':'Incomplete rule check';
 const rangeWarnings=[...new Set((prediction?.outOfRange??[]).map(key=>lookup(rangeLabels,key,'A model input')))];
 return <article className="delivery-risk-result" data-shipment-id={row.shipmentId}>
  <h4>{kind==='AI'?'Random Forest estimate':'Rule assessment'} <span className={`delivery-tag tone-${deliveryTone('risk',level)}`}>{headline}</span></h4>
  <p>Shipment {row.source?.reference||row.shipmentId} · {observation(row.observedAtMs)}</p>
  {ruleScore&&<p className="delivery-rule-total">{ruleScore.score} points</p>}
  <p><b>Next step</b> {guidance(kind,level,assessment?.dataReviewRequired===true)}</p>
  {kind==='AI'&&<>
   {row.reason&&<p className="delivery-risk-warning">{row.reason.split(',').map(issueText).join('. ')}.</p>}
   {rangeWarnings.length>0&&<p className="delivery-risk-warning">Outside the model’s training ranges · {rangeWarnings.join(', ')}. Treat this estimate with extra care.</p>}
   {prediction&&<RiskScoreBreakdown scores={DELIVERY_CLASSES.map(label=>({label,value:prediction.probabilities?.[label]??Number.NaN}))} selectedLabel={prediction.label}/>}
   {relatedRule&&<p>{completeRuleScore(relatedRule)
    ?`Separate rule check for this observation · ${relatedRule.level} risk, ${relatedRule.score} points.`
    :'The separate rule check for this observation needs more complete facts.'}</p>}
  </>}
  {assessment&&<RulePoints assessment={assessment}/>}
  {kind==='Rules'&&row.aiWarning&&<p>Model result unavailable for this observation. The rule check is separate.</p>}
  <details className="delivery-risk-disclosure">
   <summary>Recorded inputs and technical details</summary>
   {row.source?.facts?<Facts facts={row.source.facts}/>:<p>Model input values are unavailable for this observation.</p>}
   <dl className="delivery-risk-facts">
    <div><dt>Shipment record ID</dt><dd>{row.shipmentId}</dd></div>
    <div><dt>Policy version</dt><dd>{row.policyVersion}</dd></div>
    <div><dt>Source identity</dt><dd><code>{row.sourceSha256}</code></dd></div>
    {assessment&&<div><dt>Rule version</dt><dd>{assessment.ruleVersion}</dd></div>}
    {prediction&&<><div><dt>Model identity</dt><dd><code>{prediction.modelSha256}</code></dd></div>
     <div><dt>Model time</dt><dd>{number.format(prediction.processingTimeMs)} ms</dd></div>
     <div><dt>Worker total time</dt><dd>{number.format(prediction.totalProcessingTimeMs)} ms</dd></div></>}
    {(row.reason||row.aiWarning)&&<div><dt>Model service reason</dt><dd>{row.reason||row.aiWarning}</dd></div>}
   </dl>
  </details>
  <p>Review <span className={`delivery-tag tone-${deliveryTone('review',row.reviewStatus)}`}>{lookup(reviewLabels,row.reviewStatus,row.reviewStatus)}</span> · revision {row.reviewVersion}{row.requiresReview?' · Follow-up required':''}</p>
  {row.review&&<p>{row.review.notes}</p>}
  {['Admin','Manager'].includes(member.role)&&row.actor!==member.uid&&<form className="operations-form" onSubmit={(event:FormEvent<HTMLFormElement>)=>{
   event.preventDefault();const values=new FormData(event.currentTarget);
   review(row,kind,String(values.get('decision')),String(values.get('notes')));
  }}><label>Review decision<select name="decision"><option value="Acknowledge">Acknowledge</option><option value="NeedsFollowUp">Request follow-up</option></select></label>
   <label>Review notes<input name="notes" required minLength={3} maxLength={500}/></label>
   <button className="primary">Save independent review</button>
  </form>}
  {kind==='AI'&&<small>Simulated training · Experimental delivery estimate · Independent accuracy validation pending.</small>}
 </article>;
}
export default function DeliveryRiskDemo({member,shipment,delivery,onNotice=()=>{},showLocalRecovery=true,onRecoveryChange=noRecoveryChange,refreshKey=0}:{member:Membership;shipment:DataRecord;delivery?:DataRecord;onNotice?:(v:string)=>void}&RecoveryPresentation){
 const [open,setOpen]=useState(false);return <details className="delivery-risk-demo" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Delivery AI demonstration and rule assessment</summary>{open&&<DeliveryPanel member={member} shipment={shipment} delivery={delivery} onNotice={onNotice} showLocalRecovery={showLocalRecovery} onRecoveryChange={onRecoveryChange} refreshKey={refreshKey}/>}</details>;
}
function DeliveryPanel({member,shipment,delivery,onNotice,showLocalRecovery=true,onRecoveryChange=noRecoveryChange,refreshKey=0}:{member:Membership;shipment:DataRecord;delivery?:DataRecord;onNotice:(v:string)=>void}&RecoveryPresentation){
 const controller=useController(member),[context,setContext]=useState<Context|null>(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const ai=usePage('deliveryAIExperiments',member.workspaceId,shipment.id,false,refresh+refreshKey),rules=usePage('deliveryAbnormalityAssessments',member.workspaceId,shipment.id,false,refresh+refreshKey);
 const allowed=['Admin','Manager','Logistics'].includes(member.role)||member.role==='Driver'&&shipment.driverUid===member.uid;
 useEffect(()=>{let live=true;void Promise.resolve().then(()=>{if(live)setContext(null);});if(allowed)void workspaceCommand('getDeliveryDemoContext',{shipmentId:shipment.id}).then(x=>{if(live)setContext(x as Context);}).catch(e=>{if(live)setError(text(e));});return()=>{live=false;};},[shipment.id,shipment.version,delivery?.version,allowed,refresh,refreshKey]);
 async function run(work:()=>Promise<unknown>){setBusy(true);setError('');try{const promise=work();onRecoveryChange();const r=await promise as {state:string};const n=lookup(operationNotices,r.state,'Delivery operation received.');setNotice(n);onNotice(n);setRefresh(v=>v+1);}catch(e){setError(text(e));}finally{setBusy(false);onRecoveryChange();}}
 const pending:DeliveryAction[]=[];let savedError='';for(const k of ['AI','Rules','Review'] as DeliveryAction[]){try{if(controller.pending(k))pending.push(k);}catch(e){savedError=text(e);}}
 const review=(r:Result,k:'AI'|'Rules',decision:string,notes:string)=>{void run(()=>controller.review({targetKind:k,targetId:r.id,expectedReviewVersion:r.reviewVersion,decision,notes}));};
 return <section aria-label="Delivery risk demonstration"><h3>Delivery risk demonstration</h3>
  <p>Review what may need attention before deciding the next delivery action.</p>
  <div className="delivery-risk-methods">
   <div><b>Model estimate</b><p>A Random Forest uses the recorded shipment inputs to estimate Low, Medium or High risk. Simulated training supports this demonstration.</p></div>
   <div><b>Rule assessment</b><p>Recorded facts trigger specific checks such as overdue delivery or repeated failed attempts. Each match adds points.</p></div>
  </div>
  {error&&<p role="alert">{error}</p>}{savedError&&<p role="alert">{savedError}</p>}{notice&&<p role="status">{notice}</p>}{showLocalRecovery&&pending.map(k=><div className="delivery-risk-recovery" key={k}><p>Saved {k} operation needs confirmation. Recover it before starting another.</p><button disabled={busy} onClick={()=>void run(()=>controller.checkOutcome(k))}>Check outcome · {k}</button><button disabled={busy} onClick={()=>void run(()=>controller.retry(k))}>Retry saved {k}</button></div>)}
 {context&&<>
  <p><b>Shipment status</b> {context.snapshot.currentStatus} · Checked {observation(context.snapshot.observedAtMs)}</p>
  {context.facts&&<details className="delivery-risk-disclosure"><summary>Recorded shipment inputs</summary><Facts facts={context.facts}/></details>}
  {context.unavailableReasons.length>0&&<div className="delivery-risk-warning">
   <b>Model input checks</b>
   <ul>{[...new Set(context.unavailableReasons.map(issueText))].map(issue=><li key={issue}>{issue}</li>)}</ul>
  </div>}
  {!context.modelConfigured&&<p className="delivery-risk-warning">Model service unavailable. You can save a separate rule assessment.</p>}
 </>}
 {allowed&&<><label className="delivery-risk-ack"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>These are demonstration records; the model was trained on simulated scenarios.</label><div className="delivery-risk-actions"><button disabled={busy||!ack||!!pending.length||!context?.canAnalyse} onClick={()=>void run(()=>controller.analyse(shipment.id))}>Analyse delivery demo</button><button disabled={busy||!ack||!!pending.length||!context} onClick={()=>void run(()=>controller.assessRules(shipment.id))}>Save separate rule assessment</button><button disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Refresh source and history</button></div></>}
 {[{data:ai,kind:'AI' as const},{data:rules,kind:'Rules' as const}].map(({data,kind})=>
  <section key={kind} aria-label={kind==='AI'?'Saved model results':'Saved rule assessments'}>
   <h4>{kind==='AI'?'Random Forest history':'Rule assessment history'}</h4>
   {data.error&&<p role="alert">{data.error}</p>}{data.busy&&<p role="status">Loading results…</p>}
   {!data.busy&&!data.rows.length&&<p>No saved {kind==='AI'?'model estimates':'rule assessments'} for this shipment.</p>}
   {data.rows.map(row=>{
    const relatedRule=kind==='AI'&&row.sourceSha256&&rules.rows.find(rule=>rule.experimentId===row.id&&rule.shipmentId===row.shipmentId&&rule.sourceSha256===row.sourceSha256);
    return <ResultCard key={row.id} row={row} kind={kind} member={member} review={review} relatedRule={relatedRule?relatedRule.assessment:undefined}/>;
   })}
   <button disabled={!data.page||data.busy} onClick={data.first}>First page</button>
   <button disabled={!data.more||data.busy} onClick={data.next}>Next page · {kind}</button>
  </section>)}
 </section>;
}
export function DeliveryRiskReviewQueue({member,showLocalRecovery=true,onRecoveryChange=noRecoveryChange,refreshKey=0}:{member:Membership}&RecoveryPresentation){
 const [refresh,setRefresh]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),controller=useController(member),ai=usePage('deliveryAIExperiments',member.workspaceId,null,true,refresh+refreshKey),rules=usePage('deliveryAbnormalityAssessments',member.workspaceId,null,true,refresh+refreshKey);
 const review=(r:Result,k:'AI'|'Rules',decision:string,notes:string)=>{setBusy(true);setError('');const promise=controller.review({targetKind:k,targetId:r.id,expectedReviewVersion:r.reviewVersion,decision,notes});onRecoveryChange();void promise.then(()=>setRefresh(v=>v+1)).catch(e=>setError(text(e))).finally(()=>{setBusy(false);onRecoveryChange();});};
 let pending=false;try{pending=!!controller.pending('Review');}catch{/* retained; reconciliation shown by recovery action */}
 return <section className="module-card operations-card" aria-label="Delivery risk review queue">{showLocalRecovery&&<DeliveryRiskRecovery member={member} onRecovered={()=>setRefresh(v=>v+1)}/>}<h2>Delivery risk follow-up queue</h2><p>High or data-review results. A different Admin or Manager can acknowledge or request follow-up.</p>{error&&<p role="alert">{error}</p>}{pending&&<p role="status">Recover the saved review above before another decision.</p>}<button disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Refresh review queue</button>{[{data:ai,kind:'AI' as const},{data:rules,kind:'Rules' as const}].map(({data,kind})=><div key={kind}>{data.error&&<p role="alert">{data.error}</p>}{data.busy&&<p role="status">Loading follow-up records…</p>}{!data.busy&&!data.error&&!data.rows.length&&<p>No {kind} results currently require follow-up.</p>}{data.rows.map(r=><ResultCard key={r.id} row={r} kind={kind} member={member} review={review}/>)}<button disabled={!data.page||data.busy} onClick={data.first}>First page</button><button disabled={!data.more||data.busy} onClick={data.next}>Next page · {kind} queue</button></div>)}</section>;
}
export function DeliveryRiskRecovery({member,onRecovered=()=>{}}:{member:Membership;onRecovered?:()=>void}){
 const controller=useController(member),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const saved: {kind:DeliveryAction;target:string}[]=[];let malformed='';for(const kind of ['AI','Rules','Review'] as DeliveryAction[]){try{const input=controller.pending(kind);if(input)saved.push({kind,target:input.shipmentId??`${input.targetKind} result ${input.targetId}`});}catch(e){malformed=text(e);}}
 async function recover(kind:DeliveryAction,retry=false){setBusy(true);setError('');try{const r=await (retry?controller.retry(kind):controller.checkOutcome(kind));setNotice(`Recovered ${kind}: ${r.state} · result ${r.experimentId??r.assessmentId??r.reviewId??'No result created'}.`);onRecovered();}catch(e){setError(text(e));}finally{setBusy(false);}}
 return <div aria-label="Saved delivery operations">{error&&<p role="alert">{error}</p>}{malformed&&<p role="alert">{malformed}</p>}{notice&&<p role="status">{notice}</p>}{saved.map(({kind,target})=><section className="delivery-risk-recovery" key={kind}><p>Original {kind} operation · shipment/target {target}. Recovery remains available after reassignment.</p><button disabled={busy} onClick={()=>void recover(kind)}>Check outcome · {kind}</button><button disabled={busy} onClick={()=>void recover(kind,true)}>Retry saved {kind}</button></section>)}</div>;
}
