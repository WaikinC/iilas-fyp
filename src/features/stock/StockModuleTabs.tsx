import {useRef} from 'react';
import {Boxes,History,ClipboardCheck} from 'lucide-react';
import type {StockSection} from './stockWorkspacePresentation';

const sections=[
 {value:'balances',label:'Stock balances',Icon:Boxes},
 {value:'history',label:'Movement history',Icon:History},
 {value:'assessment',label:'Assessment & AI',Icon:ClipboardCheck},
] as const;

export default function StockModuleTabs({value,onChange,idPrefix}:{value:StockSection;onChange:(next:StockSection)=>void;idPrefix:string}){
 const buttons=useRef<(HTMLButtonElement|null)[]>([]);
 return <div className="stock-module-tabs" role="tablist" aria-label="Stock Management sections">
  {sections.map(({value:section,label,Icon},index)=><button key={section} ref={node=>{buttons.current[index]=node;}}
   type="button" role="tab" id={`${idPrefix}-${section}-tab`} aria-controls={`${idPrefix}-${section}-panel`}
   aria-selected={value===section} tabIndex={value===section?0:-1} onClick={()=>onChange(section)}
   onKeyDown={event=>{
    const next=event.key==='ArrowRight'?(index+1)%sections.length:event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:event.key==='Home'?0:event.key==='End'?sections.length-1:null;
    if(next!==null){event.preventDefault();buttons.current[next]?.focus();}
   }}><Icon size={20} aria-hidden="true"/><span>{label}</span></button>)}
 </div>;
}
