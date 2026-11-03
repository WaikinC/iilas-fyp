import {useRef} from 'react';
import type {ShipmentArea} from './shipmentPresentation';
export const shipmentAreas:readonly [ShipmentArea,string][]=[['all','All shipments'],['preparation','Preparation'],['prepared','Prepared & dispatch'],['dispatched','Dispatched']];
export default function ShipmentTabs({value,onChange,idPrefix}:{value:ShipmentArea;onChange:(area:ShipmentArea)=>void;idPrefix:string}){
 const refs=useRef<(HTMLButtonElement|null)[]>([]);
 return <div className="shipment-tabs" role="tablist" aria-label="Shipment areas">{shipmentAreas.map(([key,label],i)=><button key={key} ref={node=>{refs.current[i]=node;}} role="tab" id={`${idPrefix}-${key}`} aria-controls={`${idPrefix}-panel`} aria-selected={value===key} tabIndex={value===key?0:-1} onClick={()=>onChange(key)} onKeyDown={e=>{let next=i;if(e.key==='ArrowRight')next=(i+1)%4;else if(e.key==='ArrowLeft')next=(i+3)%4;else if(e.key==='Home')next=0;else if(e.key==='End')next=3;else return;e.preventDefault();refs.current[next]?.focus();}}>{label}</button>)}</div>;
}
