import test from 'node:test';import assert from 'node:assert/strict';
import {call,products,put,state,changeBeforeRead} from './report-statistics-command-harness.mjs';
const input={preset:'stockCondition',filters:{},interval:'day'};
const rows=r=>r.summary.find(m=>m.key==='records').value;
test('complete statistics count 21 rows while original page still displays 20',async()=>{
 products(21,{status:'Active',reservedQuantity:0,reorderLevel:1,imageDataUrl:'NOEXPORT',password:'NOEXPORT'});
 assert.equal((await call('queryReport',{resource:'products',filters:{}})).rows.length,20);
 const result=await call('queryReportStatistics',input);assert.equal(rows(result),21);assert.equal(result.coverage.complete,true);assert(!JSON.stringify(result).includes('NOEXPORT'));assert(!Object.hasOwn(result,'rows'));
});
test('complete statistics minimize query round trips while preserving read accounting',async()=>{
 products(2000);
 const report=await call('queryReportStatistics',input);
 assert.equal(rows(report),2000);
 assert.equal(report.coverage.scanned,2000);
 assert.equal(report.coverage.readCount,2003);
 assert.equal(state().queries.length,11);
 assert.equal(state().queries.at(-1).cap,1);
});
test('exact cap requires exhaustion and cap plus one or sparse scans refuse',async()=>{
 products(2000);assert.equal(rows(await call('queryReportStatistics',input)),2000);
 products(2001);await assert.rejects(call('queryReportStatistics',input),/complete|limit|narrow/i);
 await assert.rejects(call('queryReportStatistics',{...input,filters:{search:'never-matches'}}),/complete|limit|narrow/i);
});
test('statistics retain source role/scope/current account and Driver restrictions',async()=>{
 products(1);await assert.rejects(call('queryReportStatistics',input,'customer'));await assert.rejects(call('queryReportStatistics',input,'driver'));await assert.rejects(call('queryReportStatistics',input,'manager','foreign'));
 changeBeforeRead(r=>{if(r.path==='users/manager')put('users/manager',{uid:'manager',role:'Manager',status:'Disabled',active:false});});await assert.rejects(call('queryReportStatistics',input));
});
test('assigned Driver children exclude unrelated shipment data',async()=>{
 put('shipments/s1',{ownerId:'scope',driverUid:'driver'});put('shipments/s2',{ownerId:'scope',driverUid:'other'});
 const updatedAt={seconds:Math.floor(Date.parse('2026-10-25T00:00:00+08:00')/1000),nanoseconds:0};
 put('deliveries/d1',{ownerId:'scope',shipmentId:'s1',status:'Delivered',updatedAt});put('deliveries/d2',{ownerId:'scope',shipmentId:'s2',status:'Failed',updatedAt});
 const r=await call('queryReportStatistics',{preset:'deliveryStatus',filters:{dateFrom:'2026-10-25',dateTo:'2026-10-25'},interval:'day'},'driver');assert.equal(rows(r),1);assert.equal(r.coverage.assignedOnly,true);assert(!r.distributions[0].values.some(v=>v.label==='Failed'));
});
test('Malaysia indexed dates retain the last nanosecond and cannot count undated exclusions',async()=>{
 const start=Date.parse('2026-10-25T00:00:00+08:00')/1000;
 for(const [id,createdAt]of [['before',{seconds:start-1,nanoseconds:999999999}],['start',{seconds:start,nanoseconds:0}],['end',{seconds:start+86400-1,nanoseconds:999999999}],['after',{seconds:start+86400,nanoseconds:0}],['undated',undefined]])put('stockMovements/'+id,{ownerId:'scope',type:'Receipt',...(createdAt?{createdAt}:{})});
 const r=await call('queryReportStatistics',{preset:'stockMovements',filters:{dateFrom:'2026-10-25',dateTo:'2026-10-25'},interval:'day'});assert.equal(rows(r),2);assert.equal(r.exclusions.undatedExcludedCount,null);
});
test('cancelled/deadline/read-limited work never returns a partial statistic',async()=>{
 products(1);const controller=new AbortController();controller.abort();await assert.rejects(call('queryReportStatistics',input,'manager','scope',{signal:controller.signal}),/cancel/i);
 let n=0;await assert.rejects(call('queryReportStatistics',input,'manager','scope',{clock:()=>++n*15000}),/deadline/i);
 assert(state().reads<10000);
});
