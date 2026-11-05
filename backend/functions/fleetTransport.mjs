import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {runCompletionOperation,assertCompletionLocal} from './completionOperations.mjs';
import {approvedTransaction,ROLES} from './access.mjs';
import {completionExact,completionIdentifier} from './completionWorkflow.js';
import {validateFleetUpdate,validateTransportRevision,planningEstimate,fleetScheduleDay,requireFleetEligibility} from './transportPlanning.js';
const roles=['Admin','Manager','Logistics'],deliveryRoles=['Admin','Manager','Logistics','Driver'];
const ref=(kind,id)=>getFirestore().collection(kind).doc(id),sha=value=>createHash('sha256').update(value).digest('hex'),stamp=()=>FieldValue.serverTimestamp();
const fail=(message,code='failed-precondition')=>{throw Object.assign(Error(message),{code});};
function scoped(snapshot,scope){if(!snapshot.exists||snapshot.data().ownerId!==scope)fail('Resource not found in the shared system.','not-found');return snapshot.data();}
function activeDriver(snapshot){const m=snapshot.data();if(!snapshot.exists||m.active!==true||m.status!=='Approved'||!deliveryRoles.includes(m.role))fail('Choose a currently approved active delivery-team account.');}
const resourceKey=(scope,kind,id)=>`${scope}_${kind==='vehicles'?'vehicle':'driver'}_${id}`;
const uniqueKey=(scope,kind,value)=>kind==='vehicles'?`${scope}_vehicle_${sha(value.name.replace(/[\s-]/g,''))}`:`${scope}_driver_${value.userId}`;
export function createFleetTransportCommands(){
 async function getFleetAssignments(auth,scope,value){
  assertCompletionLocal();const input=completionExact(value,['kind','resourceIds']);
  if(!['vehicles','drivers'].includes(input.kind)||!Array.isArray(input.resourceIds)||input.resourceIds.length<1||input.resourceIds.length>20||new Set(input.resourceIds).size!==input.resourceIds.length)fail('Choose up to20 distinct vehicle or driver IDs.');
  input.resourceIds.forEach(completionIdentifier);
  return approvedTransaction(auth,ROLES,async(tx,configuration)=>{
   if(configuration.dataScopeId!==scope)fail('The assignment scope cannot be changed.','permission-denied');
   const rows=[];for(const id of input.resourceIds){scoped(await tx.get(ref(input.kind,id)),scope);const key=resourceKey(scope,input.kind,id),lock=await tx.get(ref('resourceAssignments',key));if(lock.exists){const data=scoped(lock,scope);completionIdentifier(data.shipmentId);rows.push({id:key,shipmentId:data.shipmentId});}}
   assertCompletionLocal();return {kind:input.kind,resourceIds:input.resourceIds,rows,observedAtMs:Date.now()};
  });
 }
 function update(auth,scope,value,resolveOnly){
  const input=validateFleetUpdate(value),action='updateFleetResource';
  return runCompletionOperation({auth,scope,action,input:value,roles,resolveOnly,work:async tx=>{
   const record=ref(input.kind,input.id),snapshot=await tx.get(record),old=scoped(snapshot,scope);if(old.version!==input.expectedVersion)fail('This resource version changed. Refresh before editing.');
   const lock=await tx.get(ref('resourceAssignments',resourceKey(scope,input.kind,input.id)));
   const newKey=uniqueKey(scope,input.kind,input.data),oldKey=uniqueKey(scope,input.kind,old),next=await tx.get(ref('uniqueKeys',newKey)),previous=oldKey===newKey?next:await tx.get(ref('uniqueKeys',oldKey));
   if(lock.exists)fail('Complete or cancel the assigned transport before editing this resource.');
   if(next.exists&&(next.data().recordId!==input.id||next.data().ownerId!==scope))fail('This registration or driver account is already registered.');
   if(previous.exists&&(previous.data().recordId!==input.id||previous.data().ownerId!==scope))fail('The old resource identity needs reconciliation.');
   if(input.kind==='drivers')activeDriver(await tx.get(ref('users',input.data.userId)));
   const version=old.version+1,at=stamp(),after={...old,...input.data,ownerId:scope,version,updatedBy:auth.uid,updatedAt:at};
   return {result:{recordId:input.id,version},apply:()=>{
    if(oldKey!==newKey&&previous.exists)tx.delete(ref('uniqueKeys',oldKey));
    tx.set(ref('uniqueKeys',newKey),{ownerId:scope,kind:input.kind,recordId:input.id});tx.set(record,after);
    tx.create(ref('auditLogs',`fleetRevision_${input.kind}_${input.id}_${version}`),{ownerId:scope,actor:auth.uid,kind:input.kind,recordId:input.id,action:'Update resource',version,label:input.data.name,before:old,after,at});
   }};
  }});
 }
 function revise(auth,scope,value,resolveOnly){
  const input=validateTransportRevision(value),action='reviseTransportPlan';
  return runCompletionOperation({auth,scope,action,input:value,roles,resolveOnly,work:async tx=>{
   const shipmentRef=ref('shipments',input.shipmentId),planRef=ref('transportPlans',input.shipmentId);
   const shipment=scoped(await tx.get(shipmentRef),scope),planSnapshot=await tx.get(planRef),old=planSnapshot.exists?scoped(planSnapshot,scope):null;
   if(shipment.status!=='Prepared'||shipment.version!==input.expectedShipmentVersion)fail('Choose the current prepared shipment before dispatch.');
   if((old?.version??0)!==input.expectedPlanVersion||old&&!['Scheduled','Cancelled'].includes(old.status))fail('The transport plan version or status changed.');
   const vehicle=scoped(await tx.get(ref('vehicles',input.vehicleId)),scope),driver=scoped(await tx.get(ref('drivers',input.driverId)),scope),account=await tx.get(ref('users',driver.userId));activeDriver(account);
   if(vehicle.status!=='Available'||driver.status!=='Available')fail('Choose an available base vehicle and driver.');
   if(!Number.isSafeInteger(vehicle.capacity)||!Number.isSafeInteger(shipment.parcelCount)||vehicle.capacity<shipment.parcelCount)fail('Vehicle capacity is insufficient.');
   requireFleetEligibility(vehicle,driver,fleetScheduleDay(input.plannedDate));
   const nextVehicle=resourceKey(scope,'vehicles',input.vehicleId),nextDriver=resourceKey(scope,'drivers',input.driverId),previousVehicle=old?resourceKey(scope,'vehicles',old.vehicleId):null,previousDriver=old?resourceKey(scope,'drivers',old.driverId):null;
   const lockKeys=[...new Set([nextVehicle,nextDriver,previousVehicle,previousDriver].filter(Boolean))],locks=new Map();
   for(const k of lockKeys)locks.set(k,await tx.get(ref('resourceAssignments',k)));
   if(old?.status==='Scheduled')for(const k of [previousVehicle,previousDriver]){const held=locks.get(k);if(!held?.exists||held.data().ownerId!==scope||held.data().shipmentId!==input.shipmentId)fail('The original assignment lock needs reconciliation.');}
   for(const [k,oldKey]of [[nextVehicle,previousVehicle],[nextDriver,previousDriver]]){const held=locks.get(k);if(held.exists&&!(old?.status==='Scheduled'&&k===oldKey&&held.data().ownerId===scope&&held.data().shipmentId===input.shipmentId))fail('The vehicle or driver is assigned to another delivery.');}
   const version=(old?.version??0)+1,at=stamp(),planning=input.planning?{...input.planning,estimate:planningEstimate(input.planning)}:null;
   const after={ownerId:scope,shipmentId:input.shipmentId,vehicleId:input.vehicleId,vehicleName:vehicle.name,vehicleVersion:vehicle.version,driverId:input.driverId,driverUid:driver.userId,driverName:driver.name,driverVersion:driver.version,origin:input.origin,destination:shipment.address,carrier:input.carrier,plannedDate:input.plannedDate,distanceKm:input.distanceKm,estimatedHours:input.estimatedHours,cost:input.cost,planning,status:'Scheduled',version,createdAt:old?.createdAt??at,updatedAt:at,updatedBy:auth.uid};
   const eventId=`transportPlanRevision_${input.shipmentId}_${version}`;
   return {result:{recordId:input.shipmentId,version},apply:()=>{
    if(old?.status==='Scheduled')for(const k of [previousVehicle,previousDriver])if(k!==nextVehicle&&k!==nextDriver)tx.delete(ref('resourceAssignments',k));
    tx.set(ref('resourceAssignments',nextVehicle),{ownerId:scope,shipmentId:input.shipmentId});tx.set(ref('resourceAssignments',nextDriver),{ownerId:scope,shipmentId:input.shipmentId});
    tx.set(planRef,after);tx.update(shipmentRef,{driver:driver.name,driverUid:driver.userId,version:shipment.version+1,updatedAt:at,updatedBy:auth.uid,lastEventId:eventId});
    tx.create(ref('auditLogs',eventId),{ownerId:scope,actor:auth.uid,kind:'transportPlans',recordId:input.shipmentId,action:old?.status==='Scheduled'?'Revise transport':'Schedule transport',version,label:shipment.reference,before:old,after,at});
   }};
  }});
 }
 return {getFleetAssignments,updateFleetResource:(...args)=>update(...args,false),resolveFleetResourceUpdate:(...args)=>update(...args,true),reviseTransportPlan:(...args)=>revise(...args,false),resolveTransportRevision:(...args)=>revise(...args,true)};
}
