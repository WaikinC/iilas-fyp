import test from 'node:test';import assert from 'node:assert/strict';
import {aggregateReportStatistics} from '../lib/reportStatisticsMetrics.js';import {STATISTICS_PRESETS} from '../lib/reportStatistics.js';
import {validateReportStatistics} from '../lib/reportStatisticsResponse.js';
import {selection,stockRows,dayFilters,observed} from './report-statistics-fixtures.mjs';
const req=(preset,filters)=>({preset,filters:filters??(STATISTICS_PRESETS[preset].currentState?{}:dayFilters),interval:'day'});
const metric=(r,k)=>r.summary.find(x=>x.key===k)?.value;
const dist=(r,key)=>Object.fromEntries(r.distributions.find(x=>x.key===key).values.map(x=>[x.key,x.count]));
test('stock zeros, missing facts, reservations and lifecycle remain distinct',()=>{
 const r=aggregateReportStatistics(req('stockCondition'),selection(stockRows()));
 assert.equal(metric(r,'activeProducts'),3);assert.deepEqual(dist(r,'condition'),{healthy:1,reorder:1,unknown:1});
 assert.equal(metric(r,'archivedProducts'),1);assert.equal(metric(r,'inactiveProducts'),1);
 assert.deepEqual(r.productBalances.find(p=>p.id==='zero-reserved'),{id:'zero-reserved',sku:'SKU-1',name:'Demo item',onHand:10,reserved:0,available:10});
 assert.equal(r.productBalances.find(p=>p.id==='reorder').available,2);assert.equal(r.exclusions.unknownFacts,1);
});
test('invalid/string/negative/overflow stock facts never receive a healthy label',()=>{
 for(const patch of [{reservedQuantity:11},{quantityOnHand:-1},{reservedQuantity:'0'},{reorderLevel:NaN},{quantityOnHand:Infinity},{warehouseReservedQuantity:2,reservedQuantity:1}]){
  const r=aggregateReportStatistics(req('stockCondition'),selection([{...stockRows()[0],...patch}]));assert.equal(dist(r,'condition').healthy??0,0);assert.equal(r.exclusions.invalidFacts,1);
 }
});
test('bounded SKU display is deterministic and never sums unrelated stock',()=>{
 const rows=Array.from({length:12},(_,i)=>({...stockRows()[0],id:'p'+i,sku:'SKU-'+String(12-i).padStart(2,'0')}));
 const r=aggregateReportStatistics(req('stockCondition'),selection(rows));assert.equal(r.productBalances.length,10);assert.equal(r.remainingProducts,2);assert.equal(r.productBalances[0].sku,'SKU-01');assert(!r.summary.some(m=>m.key==='totalUnits'));
});
test('empty complete result and incomplete result are not interchangeable',()=>{
 const r=aggregateReportStatistics(req('shipmentStatus'),selection([],true));assert.equal(metric(r,'records'),0);assert.equal(r.distributions[0].denominator,0);assert.equal(r.exclusions.undatedExcludedCount,null);
 assert.throws(()=>aggregateReportStatistics(req('shipmentStatus'),{...selection([],true),coverage:{...selection([],true).coverage,complete:false}}));
});
test('Malaysia date buckets count repeated events rather than unique shipments',()=>{
 const from=Date.parse('2026-10-24T00:00:00+08:00');
 const r=aggregateReportStatistics(req('deliveryEvents'),selection([{id:'e1',shipmentId:'s1',status:'Delivered',createdAtMs:from},{id:'e2',shipmentId:'s1',status:'Delivered',createdAtMs:from+1}],true));
 assert.equal(metric(r,'records'),2);assert.equal(r.timeSeries.buckets[0].day,'2026-10-24');assert.equal(Object.values(r.timeSeries.buckets[0].values).reduce((a,b)=>a+b,0),2);
 assert.equal(r.timeSeries.buckets.length,7);assert.equal(r.exclusions.undatedExcludedCount,null);
});
test('366-day weekly selection stays within 53 buckets and source date bases are honoured',()=>{
 const r=aggregateReportStatistics({...req('shipmentStatus',{dateFrom:'2024-01-07',dateTo:'2025-01-06'}),interval:'week'},selection([{id:'s',status:'Draft',expectedDelivery:'2024-01-07',createdAtMs:observed}],true));
 assert.equal(r.timeSeries.buckets.length,53);assert.equal(r.timeSeries.buckets[0].day,'2024-01-07');assert.equal(Object.values(r.timeSeries.buckets[0].values)[0],1);
});
test('invalid legacy calendar days stay in source totals but cannot become normalised activity',()=>{
 for(const preset of ['shipmentStatus','transportPlans','fleetEvents']){
  const field=({shipmentStatus:'expectedDelivery',transportPlans:'plannedDate',fleetEvents:'date'})[preset];
  const request=req(preset,{dateFrom:'2026-02-28',dateTo:'2026-03-02'});
  const r=aggregateReportStatistics(request,selection([{id:'bad-day',status:'Draft',type:'Fuel',[field]:'2026-02-30'}],true));
  assert.equal(r.summary[0].value,1,preset);assert.equal(r.exclusions.invalidFacts,1,preset);assert.equal(r.exclusions.unknownFacts,0,preset);
  assert.deepEqual(r.timeSeries.keys,[],preset);assert(r.timeSeries.buckets.every(b=>Object.values(b.values).every(n=>n===0)),preset);
  assert.deepEqual(validateReportStatistics(r,request),r);
 }
});
test('AI states are separate from labels and recorded rules cannot masquerade as AI',()=>{
 const r=aggregateReportStatistics(req('stockAi'),selection([{id:'p1',status:'Predicted',label:'Normal',createdAtMs:observed},{id:'p2',status:'Failed',label:null,createdAtMs:observed},{id:'p3',status:'Predicted',label:'Legacy label',createdAtMs:observed}],true));
 assert.equal(r.distributions.find(x=>x.key==='label').denominator,2);assert.equal(r.distributions.find(x=>x.key==='status').denominator,3);assert(r.distributions.find(x=>x.key==='label').values.some(x=>x.label==='Legacy label'));
 const rules=aggregateReportStatistics(req('stockRules'),selection([{id:'r',reviewState:'Pending',humanLabel:'Critical Stock Risk',createdAtMs:observed}],true));assert(!rules.distributions.some(x=>x.key==='label'));
});
test('every preset accepts a bounded empty selection; units and unsafe sums stay honest',()=>{
 for(const id of Object.keys(STATISTICS_PRESETS))assert.equal(metric(aggregateReportStatistics(req(id),selection([],!STATISTICS_PRESETS[id].currentState)),'records'),0);
 const fuel=aggregateReportStatistics(req('fleetEvents'),selection([{id:'f',type:'Fuel',litres:5,date:'2026-10-25'},{id:'bad',type:'Fuel',litres:'9',date:'2026-10-25'}],true));assert.equal(metric(fuel,'litres'),5);assert.equal(fuel.summary.find(x=>x.key==='litres').unknownCount,1);
 assert(!fuel.summary.some(m=>/cost|profit|revenue|accuracy|onTime/i.test(m.key)));
});
test('legacy category names cannot address inherited dictionary properties',()=>{
 const r=aggregateReportStatistics(req('deliveryEvents'),selection([{id:'e1',status:'__proto__',createdAtMs:observed},{id:'e2',status:'constructor',createdAtMs:observed}],true));
 const last=r.timeSeries.buckets.at(-1).values;assert.equal(last.__proto__,1);assert.equal(last.constructor,1);assert.equal(Object.values(last).reduce((a,b)=>a+b,0),2);
});
test('unknown facts count distinct affected rows even when a row lacks two facts',()=>{
 const r=aggregateReportStatistics(req('deliveryEvents'),selection([{id:'e',status:null,createdAtMs:null}],true));assert.equal(r.exclusions.unknownFacts,1);
});
