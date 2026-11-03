import test from 'node:test';import assert from 'node:assert/strict';
import {validateReportStatistics} from '../lib/reportStatisticsResponse.js';import {aggregateReportStatistics} from '../lib/reportStatisticsMetrics.js';
import {selection,stockRows} from './report-statistics-fixtures.mjs';
const request={preset:'stockCondition',filters:{},interval:'day'},valid=()=>aggregateReportStatistics(request,selection(stockRows()));
test('validated results are immutable and bound to exact request/source/coverage',()=>{
 const good=validateReportStatistics(valid(),request);assert(Object.isFrozen(good));assert(Object.isFrozen(good.distributions[0].values));
 for(const patch of [{preset:'shipmentStatus'},{resource:'shipments'},{filters:{sku:'OTHER'}},{interval:'week'},{schema:'other'},{coverage:{...valid().coverage,complete:false}},{extra:'private'}])assert.throws(()=>validateReportStatistics({...valid(),...patch},request));
});
test('malformed counts, duplicate keys, nested private values and overlarge payloads refuse',()=>{
 const bad=[];let r=valid();r.distributions[0].denominator=99;bad.push(r);r=valid();r.distributions[0].values[0].count=-1;bad.push(r);r=valid();r.distributions[0].values.push({...r.distributions[0].values[0]});bad.push(r);r=valid();r.summary[0].value=Infinity;bad.push(r);r=valid();r.productBalances[0].token='private';bad.push(r);r=valid();r.productBalances[0].name='x'.repeat(2200000);bad.push(r);
 for(const raw of bad)assert.throws(()=>validateReportStatistics(raw,request));
 let called=false;const raw=valid();Object.defineProperty(raw,'resource',{enumerable:true,get(){called=true;return 'products';}});assert.throws(()=>validateReportStatistics(raw,request));assert.equal(called,false);
});
