import {useId,useState,type FormEvent} from 'react';
import {REPORT_RESOURCES} from '../../../lib/reporting';
import {statisticsSourceRequest,type StatisticsRequest} from '../../../lib/reportStatistics';
import {workspaceCommand} from '../../../lib/workspace';
import type {Membership} from '../workspace/WorkspaceGate';
import type {DataRecord} from './Operations';
import ReportExplorer from './ReportExplorer';
import ResearchVerification from './ResearchVerification';
import ReportsDashboard from './reporting/ReportsDashboard';
import StockApprovalDetails from './reporting/StockApprovalDetails';
import {useOperationPage,OperationPager} from './operationsData';
export default function ReportsWorkspace(props:{member:Membership;products:DataRecord[];shipments:DataRecord[]}){const m=props.member;if(!m.active||m.status!=='Approved'||m.role==='Customer')return <p role="alert">Reports are unavailable for this account.</p>;return <ReportsBody key={`${m.uid}:${m.workspaceId}:${m.role}:${m.version}`} {...props}/>;}
function ReportsBody({member,products,shipments}:{member:Membership;products:DataRecord[];shipments:DataRecord[]}){
 const choices=Object.entries(REPORT_RESOURCES).filter(([,c])=>c.roles.includes(member.role)),[resource,setResource]=useState(choices[0]?.[0]??''),[legacy,setLegacy]=useState(false),[reviews,setReviews]=useState(false),[detail,setDetail]=useState(false),[seed,setSeed]=useState<{revision:number;filters:Record<string,string>}|undefined>();
 function source(request:StatisticsRequest){const next=statisticsSourceRequest(request);setResource(next.resource);setSeed(old=>({revision:(old?.revision??0)+1,filters:next.filters}));setDetail(true);}
 return <div className="operations-page reports-workspace"><header className="page-heading"><div><h1>Reports &amp; Statistics</h1><p>Inventory and logistics at a glance.</p></div></header><ReportsDashboard identity={member} execute={workspaceCommand} onOpenSource={source}/>
 <section className="reports-records"><button aria-expanded={detail} onClick={()=>setDetail(v=>!v)}>{detail?'Hide':'Open'} detailed records &amp; CSV</button><div hidden={!detail}><label>Report resource<select aria-label="Report resource" value={resource} onChange={e=>{setResource(e.target.value);setSeed(undefined);}}>{choices.map(([key,c])=><option key={key} value={key}>{c.group} · {c.label}</option>)}</select></label>{resource&&<ReportExplorer member={member} resource={resource} active={detail} seed={seed}/>}</div></section>
 {['Admin','Manager'].includes(member.role)&&<section className="reports-tool-section"><button aria-expanded={reviews} onClick={()=>setReviews(v=>!v)}>{reviews?'Hide':'Open'} stock adjustment &amp; correction reviews</button>{reviews&&<AdjustmentReviews member={member}/>}</section>}
 {member.role!=='Driver'&&choices.length>0&&<section className="reports-tool-section"><button aria-expanded={legacy} onClick={()=>setLegacy(v=>!v)}>{legacy?'Close':'Open'} research and integrity tools</button>{legacy&&<LegacyTools member={member} products={products} shipments={shipments}/>}</section>}</div>;
}
function LegacyTools({member,products,shipments}:{member:Membership;products:DataRecord[];shipments:DataRecord[]}){const evidence=useOperationPage('evidence',member.workspaceId,0);return <><p>Evidence candidates: current 20-record page. Page separately to find an older registered proof.</p>{evidence.error&&<p role="alert" className="error">Evidence candidates unavailable.</p>}<OperationPager page={evidence} label="evidence candidates"/><ResearchVerification member={member} products={products} shipments={shipments} evidence={evidence.rows} evidenceReady={!evidence.loading&&!evidence.error}/></>;}
function AdjustmentReviews({member}:{member:Membership}) {
  const [revision, setRevision] = useState(0);
  const page = useOperationPage('approvals', member.workspaceId, revision);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState('');
  const prefix = useId();

  async function review(event: FormEvent<HTMLFormElement>, record: DataRecord) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await workspaceCommand('approval', {id: record.id, version: record.version, ...input});
      setRevision(value => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review unavailable. Refresh the retained decision before retrying.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="module-card operations-card">
    <h2>Stock adjustment &amp; correction approvals</h2>
    {(error || page.error) && <p role="alert" className="error">{error || page.error}</p>}
    {page.loading && <p role="status">Loading approval page…</p>}
    {!page.loading && !page.error && !page.rows.length && <p>No approvals in this page.</p>}
    {page.rows.map(record => {
      const open = record.id === openId;
      const pending = record.status === 'Pending';
      const ownRequest = record.requestedBy === member.uid;
      const kind = record.kind === 'Correction' ? 'Correction' : 'Adjustment';
      const input = record.input as {quantity?: unknown; reason?: unknown} | undefined;
      const panelId = `${prefix}-${record.id}`;
      return <article className="operations-row stock-approval-row" key={record.id}>
        <b>{kind} · {String(record.status)}</b>
        <p>Requested by {String(record.requestedBy ?? 'Unknown')} · Request {record.id}</p>
        <p>Quantity {String(input?.quantity ?? 'Unknown')} · Reason {String(input?.reason ?? 'Unknown')}</p>
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpenId(open ? '' : record.id)}>
          {open ? 'Hide details' : 'Review details'}
        </button>
        <div id={panelId} hidden={!open}>
          {open && <>
            <StockApprovalDetails key={`${record.id}:${record.version}`} record={record} scope={member.workspaceId}/>
            {pending && ownRequest && <p>A different manager must review your request.</p>}
            {pending && !ownRequest && <form className="operations-form" onSubmit={event => void review(event, record)}>
              <label>{kind} review notes<input name="notes" minLength={3} maxLength={240} required/></label>
              <label>Review decision<select name="decision"><option>Approve</option><option>Reject</option></select></label>
              <button disabled={busy}>Record {kind.toLowerCase()} review</button>
            </form>}
            {!pending && typeof record.notes === 'string' && <p>Review notes {record.notes}</p>}
          </>}
        </div>
      </article>;
    })}
    <OperationPager page={page} label="approvals"/>
  </section>;
}
