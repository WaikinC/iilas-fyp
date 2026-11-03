export type RecordKind='products'|'shipments'|'purchaseOrders';
export const BUSINESS_CODE_POLICY:'iilas-business-codes-1.0';
export const BUSINESS_CODE_KINDS:readonly RecordKind[];
export function assertBusinessCodeKind(kind:unknown):RecordKind;
export function formatBusinessCode(kind:RecordKind,sequence:number):string;
export function parseBusinessCode(kind:RecordKind,code:unknown):number|null;
