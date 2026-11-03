import {useRef} from 'react';import type {StatisticsTab} from '../../../../lib/reportStatistics';
const labels={overview:'Overview',inventory:'Inventory',logistics:'Logistics',ai:'AI & Verification'};
export default function ReportsTabs({value,onChange,idPrefix,choices}:{value:StatisticsTab;onChange:(tab:StatisticsTab)=>void;idPrefix:string;choices:StatisticsTab[]}){
 const buttons=useRef<(HTMLButtonElement|null)[]>([]);
 return <div className="reports-tabs" role="tablist" aria-label="Reports and Statistics areas">{choices.map((tab,i)=><button key={tab} type="button" role="tab" id={`${idPrefix}-${tab}-tab`} aria-controls={`${idPrefix}-${tab}-panel`} aria-selected={value===tab} tabIndex={value===tab?0:-1} ref={node=>{buttons.current[i]=node;}} onClick={()=>onChange(tab)} onKeyDown={event=>{const next=event.key==='ArrowRight'?(i+1)%choices.length:event.key==='ArrowLeft'?(i+choices.length-1)%choices.length:event.key==='Home'?0:event.key==='End'?choices.length-1:null;if(next!==null){event.preventDefault();buttons.current[next]?.focus();}}}>{labels[tab]}</button>)}</div>;
}
