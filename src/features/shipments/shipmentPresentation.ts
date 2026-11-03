import type {Membership} from '../workspace/WorkspaceGate';

export type ShipmentRow={id:string;[key:string]:unknown};
export type ShipmentMember=Pick<Membership,'uid'|'workspaceId'|'role'|'status'|'active'|'version'>;
export type ShipmentArea='all'|'preparation'|'prepared'|'dispatched';
export type ShipmentFilters={search:string;status:string};
export type FeedStatus={loading:boolean;error:string};
export type ShipmentSources=Record<'products'|'shipments'|'handovers'|'activities',FeedStatus>;
export type ShipmentPlanState=FeedStatus&{row:ShipmentRow|null;revision:number};
export type ShipmentPermissions={create:boolean;edit:'draft'|'delivery'|null;delete:boolean;dispatch:boolean;addressLocked:boolean;reason:string};
export type ShipmentPermissionInput={member:ShipmentMember;shipment:ShipmentRow|null;handovers:readonly ShipmentRow[];sources:ShipmentSources;plan:ShipmentPlanState};
export type ShipmentItem={productId:string;quantity:number;name?:string;sku?:string};
export type ShipmentInput={reference:string;recipient:string;phone:string;address:string;handoverReference:string;driver:string;status:string;expectedDelivery:string;parcelCount:string;packed:boolean;items:ShipmentItem[]};
export const shipmentText=(value:unknown)=>typeof value==='string'?value:'';
export function recordedShipmentStatus(value:unknown):'Draft'|'Prepared'|'Dispatched'|null{
 return value==='Draft'||value==='Prepared'||value==='Dispatched'?value:null;
}
export function validShipmentIdentity(row:ShipmentRow){return typeof row?.id==='string'&&row.id.length>0&&!row.id.includes('/')&&Number.isSafeInteger(row.version)&&Number(row.version)>0;}
export function shipmentWorkspaceKey(member:ShipmentMember){return JSON.stringify([member.uid,member.workspaceId,member.role,member.status,member.active,member.version]);}
export function selectShipmentRows(rows:readonly ShipmentRow[],area:ShipmentArea,filters:ShipmentFilters){
 const search=filters.search.trim().toLowerCase();
 return rows.filter(row=>{const status=recordedShipmentStatus(row.status);
  if(area==='preparation'&&status!=='Draft'||area==='prepared'&&status!=='Prepared'||area==='dispatched'&&status!=='Dispatched')return false;
  if(filters.status&&(filters.status==='Unknown'?status!==null:status!==filters.status))return false;
  return !search||[row.reference,row.recipient,row.address,row.driver].some(v=>shipmentText(v).toLowerCase().includes(search));
 });
}
function validItems(value:unknown):value is ShipmentItem[]{
 if(!Array.isArray(value)||value.length<1||value.length>100)return false;
 const ids=new Set<string>();
 return value.every(item=>{if(!item||typeof item!=='object'||typeof item.productId!=='string'||!item.productId||item.productId.includes('/')||ids.has(item.productId)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>10000)return false;ids.add(item.productId);return true;});
}
export function shipmentPermissions({member,shipment,handovers,sources,plan}:ShipmentPermissionInput):ShipmentPermissions{
 const p:ShipmentPermissions={create:false,edit:null,delete:false,dispatch:false,addressLocked:true,reason:''};
 const allowed=member.status==='Approved'&&member.active===true&&['Admin','Manager','Logistics'].includes(member.role)&&Number.isSafeInteger(member.version)&&member.version>0&&!!member.uid&&!!member.workspaceId;
 if(!allowed)return {...p,reason:'Your role allows viewing only.'};
 if(['products','shipments','handovers'].some(k=>{const f=sources[k as keyof ShipmentSources];return !f||f.loading||!!f.error;}))return {...p,reason:'Required source records are unavailable. Refresh the records before making changes.'};
 p.create=true;
 if(!shipment)return p;
 if(!validShipmentIdentity(shipment)||shipment.ownerId!==member.workspaceId||!recordedShipmentStatus(shipment.status)||!validItems(shipment.items)||!Number.isSafeInteger(shipment.parcelCount)||Number(shipment.parcelCount)<1||Number(shipment.parcelCount)>10000)return {...p,reason:'This retained record needs review before changes.'};
 if(shipment.status==='Dispatched')return {...p,reason:'Dispatch is recorded. Shipment and stock history are locked.'};
 if(plan.loading||plan.error)return {...p,reason:'Transport records are unavailable. Unable to confirm current editing or dispatch permissions.'};
 if(plan.row&&(plan.row.id!==shipment.id||plan.row.ownerId!==member.workspaceId||!['Scheduled','Cancelled','Completed'].some(status=>plan.row?.status===status)))return {...p,reason:'The retained transport record needs review. Unable to confirm current permissions.'};
 const scheduled=plan.row?.status==='Scheduled';
 if(shipment.status==='Draft'){
  if(handovers.some(h=>h.id===shipment.id&&h.status!=='Cancelled'))return {...p,reason:'Warehouse work has started. Complete or cancel it in Warehouse Operations before editing this draft.'};
  return {...p,edit:'draft',delete:!scheduled,addressLocked:false};
 }
 if(shipment.packed!==true||!shipmentText(shipment.handoverReference))return {...p,reason:'Prepared packing evidence is incomplete. Review this retained record before editing.'};
 p.edit='delivery';p.addressLocked=scheduled;
 const matchingPlan=plan.row?.id===shipment.id&&plan.row?.ownerId===member.workspaceId&&scheduled&&['vehicleId','driverId','driverUid','driverName'].every(k=>!!shipmentText(plan.row?.[k]));
 p.dispatch=!!matchingPlan&&shipment.packed===true&&!!shipmentText(shipment.handoverReference)&&!!shipmentText(shipment.reference);
 p.reason=p.dispatch?'Stock and current resource availability are checked again when dispatch is submitted.':'Schedule registered transport and check the recorded packing details before dispatch.';
 return p;
}
export function shipmentTone(domain:'shipment'|'warehouse'|'transport',value:unknown):'blue'|'green'|'amber'|'red'|'grey'{
 if(domain==='shipment'){if(value==='Prepared')return 'green';if(value==='Dispatched')return 'blue';}
 if(domain==='warehouse'){if(value==='Packed'||value==='HandedOver')return 'green';if(value==='Picking')return 'blue';}
 if(domain==='transport'){if(value==='Scheduled'||value==='Completed')return 'blue';if(value==='None')return 'amber';}
 return 'grey';
}

export function shipmentInput(row:ShipmentRow|null):ShipmentInput{return row?{reference:shipmentText(row.reference),recipient:shipmentText(row.recipient),phone:shipmentText(row.phone),address:shipmentText(row.address),handoverReference:shipmentText(row.handoverReference),driver:shipmentText(row.driver),status:shipmentText(row.status),expectedDelivery:shipmentText(row.expectedDelivery),parcelCount:typeof row.parcelCount==='number'?String(row.parcelCount):'',packed:row.packed===true,items:Array.isArray(row.items)?structuredClone(row.items):[]}:{reference:'',recipient:'',phone:'',address:'',handoverReference:'',driver:'',status:'Draft',expectedDelivery:'',parcelCount:'1',packed:false,items:[]};}
export function dispatchShipmentInput(row:ShipmentRow,plan:ShipmentRow):ShipmentInput{return {...shipmentInput(row),status:'Dispatched',driver:shipmentText(plan.driverName)};}
