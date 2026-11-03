import type {KeyboardEvent} from 'react';
import type {ProcurementSection} from './procurementPresentation';
export const procurementSections=[['orders','Purchase orders'],['reorder','Reorder review'],['suppliers','Suppliers'],['incoming','Expected incoming']] as const;
export default function ProcurementTabs({value,onChange,idPrefix}:{value:ProcurementSection;onChange:(v:ProcurementSection)=>void;idPrefix:string}){
 function move(event:KeyboardEvent<HTMLButtonElement>,index:number){const next=event.key==='Home'?0:event.key==='End'?3:event.key==='ArrowRight'?(index+1)%4:event.key==='ArrowLeft'?(index+3)%4:-1;if(next>=0){event.preventDefault();event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}
 return <div className="procurement-tabs" role="tablist" aria-label="Procurement areas">{procurementSections.map(([key,label],i)=><button type="button" role="tab" id={`${idPrefix}-tab-${key}`} aria-controls={`${idPrefix}-panel-${key}`} aria-selected={value===key} tabIndex={value===key?0:-1} key={key} onKeyDown={e=>move(e,i)} onClick={()=>onChange(key)}>{label}</button>)}</div>;
}
