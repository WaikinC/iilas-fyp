export const INTEGRITY_PROTOCOL:string;
export type IntegrityInput={operationId:string;kind:'inventory'|'delivery';recordId:string;transactionHash?:string};
export function validateIntegrityInput(value:unknown,submitted?:boolean):IntegrityInput;
export type IntegrityReview={operationId:string;exceptionId:string;expectedReviewVersion:number;decision:'Acknowledge'|'NeedsFollowUp';notes:string};
export function validateIntegrityReview(value:unknown):IntegrityReview;
