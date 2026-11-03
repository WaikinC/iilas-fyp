import {useRef,type ReactNode} from 'react';
import {useDialogFocus} from '../../components/useDialogFocus';
export default function ShipmentDialog({title,children,onClose,busy=false,trap=true}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean;trap?:boolean}){
 const ref=useRef<HTMLElement>(null);useDialogFocus(ref,()=>{if(!busy)onClose();},trap);
 return <div className="modal-backdrop shipment-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="shipment-dialog"><header><h2>{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>Close</button></header>{children}</section></div>;
}
