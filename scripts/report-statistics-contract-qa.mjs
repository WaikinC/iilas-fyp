import test from 'node:test';import assert from 'node:assert/strict';
import {STATISTICS_PRESETS,validateStatisticsRequest,statisticsSourceRequest} from '../lib/reportStatistics.js';
import {REPORT_RESOURCES} from '../lib/reporting.js';import {dayFilters} from './report-statistics-fixtures.mjs';
test('closed preset registry maps both portfolios to existing authorised resources',()=>{
 assert.equal(Object.keys(STATISTICS_PRESETS).length,23);
 for(const c of Object.values(STATISTICS_PRESETS)){assert(REPORT_RESOURCES[c.resource]);assert(['inventory','logistics','ai'].includes(c.tab));assert(Object.isFrozen(c));}
 assert.equal(STATISTICS_PRESETS.stockCondition.resource,'products');assert.equal(STATISTICS_PRESETS.shipmentStatus.resource,'shipments');
});
test('requests reject scope/cursor/formula/accessor/prototype/unknown/invalid date input',()=>{
 const request={preset:'stockCondition',filters:{},interval:'day'};
 for(const raw of [{...request,cursor:'old'},{...request,formula:'x'},{...request,filters:{ownerId:'foreign'}},{...request,preset:'StockCondition'},{...request,interval:'year'},[],Object.create(request),{...request,filters:{dateFrom:'2026-10-24',dateTo:'2026-10-30'}}])assert.throws(()=>validateStatisticsRequest(raw));
 let called=false;assert.throws(()=>validateStatisticsRequest({get preset(){called=true;return 'stockCondition';},filters:{},interval:'day'}));assert.equal(called,false);
 for(const filters of [{},{dateFrom:'2026-02-30',dateTo:'2026-03-01'},{dateFrom:'2025-01-01',dateTo:'2026-10-30'}])assert.throws(()=>validateStatisticsRequest({preset:'shipmentStatus',filters,interval:'day'}));
});
test('forced kind is closed and dated sources keep exactly their normalised filters',()=>{
 const request=validateStatisticsRequest({preset:'parcelObservations',filters:{...dayFilters},interval:'day'});
 assert.deepEqual(statisticsSourceRequest(request),{resource:'predictions',filters:{...dayFilters,type:'parcel'}});
 assert.throws(()=>validateStatisticsRequest({...request,filters:{...dayFilters,type:'delivery'}}));
 assert.equal(statisticsSourceRequest(validateStatisticsRequest({preset:'inventoryIntegrityChecks',filters:dayFilters,interval:'week'})).filters.type,'inventory');
 assert.equal(validateStatisticsRequest({preset:'stockCondition',filters:{sku:' box-1 '},interval:'day'}).filters.sku,'BOX-1');
});
