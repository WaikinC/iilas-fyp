import {completionExact} from './completionWorkflow.js';
import {REPORT_RESOURCES,validateReportRequest,reportDateWindow} from './reporting.js';
const preset=(resource,tab,label,currentState=false,forcedFilters={})=>Object.freeze({resource,tab,label,currentState,forcedFilters:Object.freeze(forcedFilters)});
export const STATISTICS_PRESETS=Object.freeze({
 stockCondition:preset('products','inventory','Stock condition',true),
 stockMovements:preset('stockMovements','inventory','Stock movement trends'),
 warehouseHandovers:preset('warehouseHandovers','inventory','Warehouse handovers',true),
 purchaseOrders:preset('purchaseOrders','inventory','Purchase order status'),
 expectedIncoming:preset('expectedReplenishments','inventory','Expected incoming stock'),
 shipmentStatus:preset('shipments','logistics','Shipment status'),
 deliveryStatus:preset('deliveries','logistics','Delivery outcomes'),
 deliveryEvents:preset('deliveryEvents','logistics','Delivery event activity'),
 vehicleStatus:preset('vehicles','logistics','Vehicle availability',true),
 driverStatus:preset('drivers','logistics','Driver availability',true),
 transportPlans:preset('transportPlans','logistics','Transport plans'),
 fleetEvents:preset('fleetEvents','logistics','Fuel and maintenance events'),
 stockAi:preset('inventoryAIExperiments','ai','Stock AI labels'),
 deliveryAi:preset('deliveryAIExperiments','ai','Delivery AI labels'),
 stockRules:preset('inventoryRiskSnapshots','ai','Stock assessment review states'),
 deliveryRules:preset('deliveryAbnormalityAssessments','ai','Delivery rule levels'),
 parcelObservations:preset('predictions','ai','Recorded parcel labels',false,{type:'parcel'}),
 inventoryIntegrityChecks:preset('integrityChecks','ai','Inventory integrity observations',false,{type:'inventory'}),
 deliveryIntegrityChecks:preset('integrityChecks','ai','Delivery integrity observations',false,{type:'delivery'}),
 inventoryIntegrityExceptions:preset('integrityExceptions','ai','Inventory exception review',false,{type:'inventory'}),
 deliveryIntegrityExceptions:preset('integrityExceptions','ai','Delivery exception review',false,{type:'delivery'}),
 inventoryRegistrations:preset('verificationRecords','ai','Inventory registrations',false,{type:'inventory'}),
 deliveryRegistrations:preset('verificationRecords','ai','Delivery registrations',false,{type:'delivery'}),
});
export function validateStatisticsRequest(raw){
 const r=completionExact(raw,['preset','filters','interval']);
 if(typeof r.preset!=='string'||!Object.hasOwn(STATISTICS_PRESETS,r.preset)||!['day','week'].includes(r.interval))throw Error('Choose a supported statistics report and interval.');
 const p=STATISTICS_PRESETS[r.preset],checked=validateReportRequest({resource:p.resource,filters:r.filters}),filters={...checked.filters};
 for(const [k,v]of Object.entries(p.forcedFilters)){if(filters[k]!==undefined&&filters[k]!==v)throw Error('The source kind cannot be changed for this report.');filters[k]=v;}
 const dated=reportDateWindow(filters);if(p.currentState?Boolean(dated):!dated)throw Error(p.currentState?'Current-state reports do not reconstruct historical balances.':'Select both Malaysia date boundaries.');
 return {preset:r.preset,filters,interval:r.interval};
}
export function statisticsSourceRequest(raw){const r=validateStatisticsRequest(raw);return {resource:STATISTICS_PRESETS[r.preset].resource,filters:r.filters};}
export function statisticsAllowed(presetId,role){const p=STATISTICS_PRESETS[presetId];return Boolean(p&&REPORT_RESOURCES[p.resource].roles.includes(role));}
export function statisticsDefaultRequest(presetId,nowMs=Date.now()){
 const p=STATISTICS_PRESETS[presetId];if(!p)throw Error('Unknown statistics preset.');
 const day=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
 return validateStatisticsRequest({preset:presetId,filters:p.currentState?{}:{dateFrom:day(nowMs-6*86400000),dateTo:day(nowMs)},interval:'day'});
}
