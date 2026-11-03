export const BUSINESS_CODE_POLICY='iilas-business-codes-1.0';
export const BUSINESS_CODE_KINDS=Object.freeze(['products','shipments','purchaseOrders']);
const prefixes=Object.freeze({products:'PRD',shipments:'SHP',purchaseOrders:'PO'});
export function assertBusinessCodeKind(kind){if(typeof kind!=='string'||!Object.hasOwn(prefixes,kind))throw Error('Choose a supported business record kind.');return kind;}
export function formatBusinessCode(kind,sequence){assertBusinessCodeKind(kind);if(!Number.isSafeInteger(sequence)||sequence<1||sequence>999999)throw Error('Automatic numbering is exhausted or invalid. Contact the administrator.');return prefixes[kind]+'-'+String(sequence).padStart(6,'0');}
export function parseBusinessCode(kind,code){assertBusinessCodeKind(kind);if(typeof code!=='string')return null;const match=new RegExp('^'+prefixes[kind]+'-([0-9]{6})$').exec(code.trim().toUpperCase());return match&&Number(match[1])>0?Number(match[1]):null;}
