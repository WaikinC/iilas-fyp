import{PURCHASE_STATUSES}from'./procurementValidation.js';
export function linkedCreateOutcomeMessage(outcome){
 if(outcome?.state==='Cancelled')return 'Saved purchase creation cancelled. No purchase change was made by this operation.';
 if(outcome?.state!=='Completed'||typeof outcome.reference!=='string'||!outcome.reference.trim()||!PURCHASE_STATUSES.includes(outcome.status)||!Number.isSafeInteger(outcome.version)||outcome.version<1)throw Error('The linked purchase outcome needs reconciliation.');
 return `Purchase ${outcome.reference}: ${outcome.status} (recorded version ${outcome.version}). ${outcome.status==='Submitted'?'Independent approval is required.':'Review this existing linked order for its current details.'}`;
}
