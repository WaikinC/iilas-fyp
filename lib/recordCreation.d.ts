import type{RecordKind}from'./businessCodes';
export type{RecordKind};
export type RecordCreateInput={operationId:string;kind:RecordKind;data:Record<string,unknown>};
export type RecordCreateOutcome={schema:'iilas-record-create-outcome-1.0';state:'Created'|'Cancelled'|'NotFound';kind:RecordKind;operationId:string;recordId:string|null;code:string|null;version:number|null;replayed:boolean};
export type RecordCreateResolveInput={creation:RecordCreateInput;intent:'Check'|'Cancel'};
export function recordCreationCanonical(raw:unknown):string;
export function validateRecordCreationInput(raw:unknown):RecordCreateInput;
export function validateRecordCreationResolveInput(raw:unknown):RecordCreateResolveInput;
export function validateRecordCreationOutcome(raw:unknown,expected:RecordCreateInput):RecordCreateOutcome;
