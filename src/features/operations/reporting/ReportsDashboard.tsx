import {useEffect,useId,useRef,useState} from 'react';
import {createReportStatisticsClient,type StatisticsClientState} from '../../../../lib/reportStatisticsClient';
import {STATISTICS_PRESETS,statisticsAllowed,statisticsDefaultRequest,type StatisticsIdentity,type StatisticsRequest,type StatisticsTab} from '../../../../lib/reportStatistics';
import ReportsTabs from './ReportsTabs';
import ReportsOverview from './ReportsOverview';
import ReportsStatisticsPanel from './ReportsStatisticsPanel';
import './reports.css';
type Client=ReturnType<typeof createReportStatisticsClient>;
export default function ReportsDashboard({identity,execute,onOpenSource}:{identity:StatisticsIdentity;execute:(action:string,input:StatisticsRequest)=>Promise<unknown>;onOpenSource:(request:StatisticsRequest)=>void}){
 const client=useRef<Client|null>(null),exec=useRef(execute);
 const {uid,workspaceId,role,version}=identity;
 useEffect(()=>{exec.current=execute;},[execute]);
 const [state,setState]=useState<StatisticsClientState>(()=>createReportStatisticsClient({identity,execute}).getSnapshot());
 const [period,setPeriod]=useState(()=>{const f=statisticsDefaultRequest('shipmentStatus').filters;return {dateFrom:f.dateFrom!,dateTo:f.dateTo!};}),[dirty,setDirty]=useState(false),prefix=useId();
 useEffect(()=>{const c=createReportStatisticsClient({identity:{uid,workspaceId,role,version},execute:(a,i)=>exec.current(a,i),onChange:setState});client.current=c;setState(c.getSnapshot());return()=>{c.dispose();if(client.current===c)client.current=null;};},[uid,workspaceId,role,version]);
 const choices=Object.keys(STATISTICS_PRESETS).filter(k=>statisticsAllowed(k,identity.role));
 const tabs=(['overview','inventory','logistics','ai'] as StatisticsTab[]).filter(t=>t==='overview'||choices.some(k=>STATISTICS_PRESETS[k].tab===t));
 return <><ReportsTabs value={state.tab} choices={tabs} idPrefix={prefix} onChange={t=>client.current?.setTab(t)}/>
 {tabs.map(t=><section key={t} role="tabpanel" hidden={state.tab!==t} id={`${prefix}-${t}-panel`} aria-labelledby={`${prefix}-${t}-tab`} tabIndex={0}>{state.tab===t&&(t==='overview'?<ReportsOverview state={state} role={identity.role} period={period} dirty={dirty} onPeriodChange={p=>{client.current?.setTab('overview');setPeriod(p);setDirty(true);}} onRefresh={()=>{setDirty(false);void client.current?.refreshOverview(period);}} onOpenSource={onOpenSource}/>:state.draft&&<ReportsStatisticsPanel request={state.draft} load={state.selected} choices={choices.filter(k=>STATISTICS_PRESETS[k].tab===t)} onEdit={r=>client.current?.setDraft(r)} onRun={()=>void client.current?.run()} onOpenSource={onOpenSource}/>)}</section>)}
 <div className="reports-status-guide" aria-label="Status colour guide"><span className="reports-green">Healthy / complete</span><span className="reports-amber">Attention / pending</span><span className="reports-red">Risk / failed</span><span className="reports-blue">Active / in progress</span><span className="reports-grey">Unknown / unavailable</span></div></>;
}
