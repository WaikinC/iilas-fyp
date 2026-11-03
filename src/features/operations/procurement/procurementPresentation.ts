import type {ReactNode} from 'react';
export type ProcurementRow={id:string;version:number;[key:string]:unknown};
export type ProcurementSection='orders'|'reorder'|'suppliers'|'incoming';
export type PurchaseAction='History'|'Approve'|'Reject'|'Resubmit'|'Issue'|'Cancel'|'Receive';
export type ProcurementFeed={records:readonly ProcurementRow[];loading:boolean;error:string};
export type SummaryKey='submitted'|'issued'|'partial'|'suppliers';
export type ProcurementSummary={key:SummaryKey;label:string;value:number|null;state:'ready'|'loading'|'error'};
export type ProcurementPanels={orders:ReactNode;reorder:ReactNode;suppliers:ReactNode;incoming:ReactNode;overlays:ReactNode};
type Tone='green'|'amber'|'red'|'blue'|'grey';
const tones:Record<'purchase'|'supplier'|'incoming',Record<string,Tone>>={purchase:{Submitted:'amber',Rejected:'red',Approved:'green',Issued:'blue',PartReceived:'amber',Received:'green',Cancelled:'grey'},supplier:{Active:'green',Inactive:'grey'},incoming:{Expected:'blue',PartReceived:'amber',Received:'green'}};
export function procurementTone(domain:keyof typeof tones,value:unknown):Tone{return typeof value==='string'&&Object.hasOwn(tones[domain],value)?tones[domain][value]:'grey';}
export function purchaseStatusLabel(value:unknown):string{return typeof value==='string'&&Object.hasOwn(tones.purchase,value)?value==='PartReceived'?'Part received':value:'Unknown';}
export function procurementActions(role:string,uid:string,order:ProcurementRow):PurchaseAction[]{
 const actions:PurchaseAction[]=['History'],writable=['Admin','Manager','Inventory'].includes(role),reviewer=['Admin','Manager'].includes(role),receiver=writable||role==='Warehouse',status=order.status;
 if(status==='Submitted'&&reviewer&&order.requestedBy!==uid)actions.push('Approve','Reject');
 if((status==='Submitted'||status==='Rejected')&&writable)actions.push('Resubmit');
 if(status==='Approved'&&writable)actions.push('Issue');
 if((status==='Submitted'||status==='Rejected'||status==='Approved')&&writable)actions.push('Cancel');
 if((status==='Issued'||status==='PartReceived')&&receiver)actions.push('Receive');
 return actions;
}
export function procurementSummary(orders:ProcurementFeed,suppliers:ProcurementFeed):ProcurementSummary[]{
 return ([['submitted','Submitted orders','Submitted',orders],['issued','Issued orders','Issued',orders],['partial','Part-received orders','PartReceived',orders],['suppliers','Active suppliers','Active',suppliers]] as const).map(([key,label,status,feed])=>({key,label,state:feed.error?'error':feed.loading?'loading':'ready',value:feed.error||feed.loading?null:feed.records.filter(r=>r.status===status).length}));
}
export function procurementSummaryTarget(key:SummaryKey):{section:'orders'|'suppliers';status:string}{return key==='suppliers'?{section:'suppliers',status:'Active'}:{section:'orders',status:key==='submitted'?'Submitted':key==='issued'?'Issued':'PartReceived'};}
export function purchaseDisplayTotal(order:ProcurementRow):string{
 let cents:unknown=order.totalCents;
 if(cents==null){if(!Array.isArray(order.items)||!order.items.length)return 'Unavailable';let sum=0;for(const line of order.items){if(!line||typeof line.quantity!=='number'||!Number.isFinite(line.quantity)||typeof line.unitCost!=='number'||!Number.isFinite(line.unitCost)||line.quantity<0||line.unitCost<0)return 'Unavailable';sum+=line.quantity*Math.round(line.unitCost*100);}cents=sum;}
 return typeof cents==='number'&&Number.isFinite(cents)&&cents>=0?new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(cents/100):'Unavailable';
}

export function purchaseActionClass(action:string):string{return action==='Approve'?'procurement-positive':['Reject','Cancel'].includes(action)?'procurement-danger':['Issue','Receive'].includes(action)?'primary':'';}
