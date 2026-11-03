export type StatusTone='positive'|'info'|'warning'|'negative'|'neutral';
export function statusTone(label:string):StatusTone{
 const status=label.split(' · ')[0];
 if(['Available','Completed'].includes(status))return'positive';
 if(['Scheduled','In delivery','Fuel'].includes(status))return'info';
 if(['Maintenance','Assigned (reconcile status)'].includes(status))return'warning';
 if(['Failed','Error'].includes(status))return'negative';
 return'neutral';
}
export function resourceEditReason({ready,assigned,operationLocked}:{ready:boolean;assigned:boolean;operationLocked:boolean}){
 if(operationLocked)return'Confirm or recover the saved request before starting another.';
 if(!ready)return'Assignment could not be confirmed. Refresh before editing.';
 if(assigned)return'Complete or cancel its current assignment before editing.';
 return'';
}
export function transportEditable(plan:Record<string,unknown>,shipment:Record<string,unknown>|null|undefined,allowed:boolean){return allowed&&shipment?.status==='Prepared'&&['Scheduled','Cancelled'].includes(String(plan.status));}
