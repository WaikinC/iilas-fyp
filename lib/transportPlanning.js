import {completionExact,completionIdentifier,completionUUID} from './completionWorkflow.js';
import {inputText,inputNumber,malaysiaDay,validDay} from './procurementValidation.js';
const complianceFields = {
 vehicles: [['inspectionExpiryDate','Vehicle inspection'], ['insuranceExpiryDate','Vehicle insurance']],
 drivers: [['licenceExpiryDate','Driver licence']],
};
export function fleetComplianceDates(kind, data, previous = {}) {
 const dates = {};
 for (const [field, label] of complianceFields[kind]) {
  if (!Object.hasOwn(data, field)) {
   if (Object.hasOwn(previous, field)) dates[field] = previous[field];
   continue;
  }
  const value = data[field];
  dates[field] = value === '' || value === null ? null : validDay(value, label + ' expiry date');
 }
 return dates;
}
export function fleetScheduleDay(plannedDate, today = malaysiaDay()) {
 return plannedDate && plannedDate > today ? plannedDate : today;
}
export function fleetResourceEligibility(kind, resource, day) {
 const blocked = [], unknown = [];
 const fields = kind === 'vehicles'
  ? [['maintenanceDate','Vehicle maintenance'], ...complianceFields.vehicles] : complianceFields.drivers;
 for (const [field, label] of fields) {
  const value = resource[field];
  if (value === undefined || value === null || value === '') {
   unknown.push(label);
   continue;
  }
  try {
   if (validDay(value, label) !== value) throw Error('Noncanonical recorded date.');
  } catch {
   blocked.push(label + ' date is invalid.');
   continue;
  }
  if (value < day) blocked.push(field === 'maintenanceDate'
   ? `${label} is overdue (due ${value}).` : `${label} expired on ${value}.`);
 }
 return {blocked, unknown};
}
export function requireFleetEligibility(vehicle, driver, day) {
 const [reason] = [
  ...fleetResourceEligibility('vehicles', vehicle, day).blocked,
  ...fleetResourceEligibility('drivers', driver, day).blocked,
 ];
 if (reason) throw Object.assign(Error(reason), {code:'failed-precondition'});
}
const number=(value,label,min,max,integer=false)=>{if(typeof value!=='number')throw Error(label+' must be numeric.');return inputNumber(value,label,min,max,integer);};
function waypoint(value){const point=completionExact(value,['latitude','longitude']);return {latitude:number(point.latitude,'Latitude',-90,90),longitude:number(point.longitude,'Longitude',-180,180)};}
export function validatePlanningInputs(value){const input=completionExact(value,['origin','destination','speedKph']);return {origin:waypoint(input.origin),destination:waypoint(input.destination),speedKph:number(input.speedKph,'Planning speed',5,120)};}
export function planningEstimate(value){
 const {origin:a,destination:b,speedKph}=validatePlanningInputs(value),radians=x=>x*Math.PI/180;
 const hav=Math.sin(radians(b.latitude-a.latitude)/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(radians(b.longitude-a.longitude)/2)**2;
 const distanceKm=6371.0088*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,hav))));
 return {method:'great-circle-v1',distanceKm,estimatedHours:distanceKm/speedKph};
}
export function validateFleetUpdate(value){
 const input=completionExact(value,['operationId','kind','id','expectedVersion','data']);completionUUID(input.operationId);completionIdentifier(input.id);number(input.expectedVersion,'Resource version',1,Number.MAX_SAFE_INTEGER,true);
 if(input.kind==='vehicles'){
  const v=completionExact(input.data,['name','capacity','status','maintenanceDate','fuelLitres'],complianceFields.vehicles.map(([field])=>field));
  if(!['Available','Maintenance','Unavailable'].includes(v.status))throw Error('Choose a valid base vehicle status.');
  input.data={name:inputText(v.name,'Registration',40).toUpperCase(),capacity:number(v.capacity,'Capacity',1,100000,true),status:v.status,maintenanceDate:validDay(v.maintenanceDate,'Maintenance date'),fuelLitres:number(v.fuelLitres,'Fuel litres',0,10000),...fleetComplianceDates('vehicles',v)};
 }else if(input.kind==='drivers'){
  const d=completionExact(input.data,['name','userId','licence','status'],complianceFields.drivers.map(([field])=>field));completionIdentifier(d.userId);
  if(!['Available','Unavailable'].includes(d.status))throw Error('Choose a valid base driver status.');
  input.data={name:inputText(d.name,'Driver name',120),userId:d.userId,licence:inputText(d.licence,'Licence',80),status:d.status,...fleetComplianceDates('drivers',d)};
 }else throw Error('Choose vehicles or drivers.');return input;
}
export function validateTransportRevision(value){
 const input=completionExact(value,['operationId','shipmentId','expectedShipmentVersion','expectedPlanVersion','vehicleId','driverId','origin','carrier','plannedDate','distanceKm','estimatedHours','cost','planning']);
 completionUUID(input.operationId);for(const k of ['shipmentId','vehicleId','driverId'])completionIdentifier(input[k]);
 number(input.expectedShipmentVersion,'Shipment version',1,Number.MAX_SAFE_INTEGER,true);number(input.expectedPlanVersion,'Plan version',0,Number.MAX_SAFE_INTEGER,true);
 return {...input,origin:inputText(input.origin,'Origin',240),carrier:inputText(input.carrier,'Carrier',120),plannedDate:validDay(input.plannedDate,'Planned date'),distanceKm:number(input.distanceKm,'Distance kilometres',0,100000),estimatedHours:number(input.estimatedHours,'Estimated hours',.1,1000),cost:number(input.cost,'Cost',0,1000000),planning:input.planning===null?null:validatePlanningInputs(input.planning)};
}
