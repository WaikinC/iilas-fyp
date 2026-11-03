export type CompletionInput={operationId:string;[field:string]:unknown};
export type CompletionOutcome={state:'Completed'|'Cancelled';operationId:string;action:string;recordId:string|null;version:number|null;replayed:boolean};
export function completionUUID(value:unknown):string;
export function completionIdentifier(value:unknown):string;
export function completionCanonical(value:unknown):string;
export function completionExact(value:unknown,required:string[],optional?:string[]):Record<string,unknown>;
export function validateCompletionIntent(value:unknown):CompletionInput;
export function validateCompletionOutcome(value:unknown,context:{action:string;input:CompletionInput}):CompletionOutcome;
