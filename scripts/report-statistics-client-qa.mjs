import test from 'node:test';import assert from 'node:assert/strict';
import {createReportStatisticsClient} from '../lib/reportStatisticsClient.js';
import {aggregateReportStatistics} from '../lib/reportStatisticsMetrics.js';import {STATISTICS_PRESETS} from '../lib/reportStatistics.js';
import {selection,stockRows,dayFilters} from './report-statistics-fixtures.mjs';
const identity={uid:'manager',workspaceId:'scope',role:'Manager',version:1},request={preset:'stockCondition',filters:{},interval:'day'};
const result=q=>aggregateReportStatistics(q,selection(q.preset==='stockCondition'?stockRows():[],!STATISTICS_PRESETS[q.preset].currentState));
const flush=()=>new Promise(setImmediate);
test('constructor, tab selection and draft edits do not query; explicit run validates and freezes',async()=>{
 const calls=[],c=createReportStatisticsClient({identity,execute:async(a,q)=>{calls.push([a,q]);return result(q);}});
 c.setTab('inventory');c.setDraft(request);assert.equal(calls.length,0);await c.run();assert.equal(calls.length,1);assert.equal(calls[0][0],'queryReportStatistics');assert.equal(c.getSnapshot().selected.status,'ready');assert(Object.isFrozen(c.getSnapshot().selected.result));c.dispose();
});
test('filter edits and identity changes cannot publish an earlier response',async()=>{
 let release;const c=createReportStatisticsClient({identity,execute:()=>new Promise(r=>{release=r;})});c.setDraft(request);const first=c.run();await flush();
 c.setDraft({...request,filters:{sku:'OTHER'}});release(result(request));await first;assert.equal(c.getSnapshot().selected.result,null);assert.equal(c.getSnapshot().selected.status,'idle');
 c.setIdentity({...identity,version:2,role:'Driver'});assert.equal(c.getSnapshot().selected.result,null);assert.throws(()=>c.setDraft(request));c.dispose();
});
test('overview issues at most four sequential requests and isolates a failed source',async()=>{
 let concurrent=0,max=0;const calls=[];const c=createReportStatisticsClient({identity,execute:async(_a,q)=>{concurrent++;max=Math.max(max,concurrent);calls.push(q);await flush();concurrent--;if(q.preset==='purchaseOrders')throw Error('Source unavailable');return result(q);}});
 await c.refreshOverview(dayFilters);assert.equal(max,1);assert.equal(calls.length,4);assert.deepEqual(calls.map(x=>x.preset),['stockCondition','purchaseOrders','shipmentStatus','deliveryStatus']);assert.equal(c.getSnapshot().overview.stockCondition.status,'ready');assert.equal(c.getSnapshot().overview.purchaseOrders.status,'error');assert.equal(c.getSnapshot().overview.deliveryStatus.status,'ready');c.dispose();
});
test('tab change stops remaining overview scheduling and disposes late publications',async()=>{
 let release,calls=0,updates=0;const c=createReportStatisticsClient({identity,onChange:()=>updates++,execute:()=>{calls++;return new Promise(r=>{release=r;});}});
 const p=c.refreshOverview(dayFilters);await flush();c.setTab('inventory');const n=updates;release(result(request));await p;assert.equal(calls,1);assert.equal(updates,n);c.dispose();
});
test('overlapping refreshes retire old generations and never execute concurrently',async()=>{
 let release,active=0,max=0;const seen=[];const c=createReportStatisticsClient({identity,execute:async(_a,q)=>{active++;max=Math.max(max,active);seen.push(q);if(seen.length===1)await new Promise(r=>{release=r;});active--;return result(q);}});
 const old=c.refreshOverview(dayFilters);await flush();const newer=c.refreshOverview({dateFrom:'2026-10-25',dateTo:'2026-10-30'});release();await Promise.all([old,newer]);assert.equal(max,1);assert.equal(seen.length,5);assert.equal(c.getSnapshot().overview.shipmentStatus.result.filters.dateFrom,'2026-10-25');c.dispose();
});
test('unavailable, mismatched and timed-out responses never become zero success',async()=>{
 for(const execute of [async()=>({...result(request),resource:'shipments'}),()=>new Promise(()=>{})]){const c=createReportStatisticsClient({identity,execute,timeoutMs:5});c.setDraft(request);await c.run();assert.equal(c.getSnapshot().selected.status,'error');assert.equal(c.getSnapshot().selected.result,null);c.dispose();}
});
test('role-filtered overview omits inaccessible inventory and invalid dates are reported before fetching',async()=>{
 const calls=[],c=createReportStatisticsClient({identity:{...identity,role:'Driver'},execute:async(_a,q)=>{calls.push(q);return result(q);}});await c.refreshOverview(dayFilters);assert.deepEqual(calls.map(x=>x.preset),['shipmentStatus','deliveryStatus']);
 c.setDraft({preset:'shipmentStatus',filters:{dateFrom:'2026-02-30',dateTo:'2026-03-01'},interval:'day'});await c.run();assert.equal(calls.length,2);assert.equal(c.getSnapshot().selected.status,'error');c.dispose();
});
test('returning to a portfolio retains its selected preset and draft filters',()=>{
 const c=createReportStatisticsClient({identity,execute:async(_a,q)=>result(q)});c.setDraft({preset:'stockMovements',filters:{...dayFilters,productId:'product-1'},interval:'week'});c.setTab('logistics');c.setTab('inventory');assert.equal(c.getSnapshot().selectedPreset,'stockMovements');assert.equal(c.getSnapshot().draft.filters.productId,'product-1');assert.equal(c.getSnapshot().draft.interval,'week');c.dispose();
});
