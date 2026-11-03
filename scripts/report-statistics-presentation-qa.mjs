import test from 'node:test';import assert from 'node:assert/strict';
import {statisticsTone,chooseStatisticsChart,chooseStatisticsTimeChart,formatStatisticsValue,statisticsLabelLines,categoryChartMinWidth} from '../src/features/operations/reporting/reportPresentation.ts';
test('status tones are exact and scoped to their data domain',()=>{
 for(const [r,d,v,t]of [['products','condition','healthy','green'],['products','condition','reorder','amber'],['deliveries','status','Delivered','green'],['purchaseOrders','status','Approved','green'],['inventoryAIExperiments','label','Normal','green'],['integrityChecks','outcome','Verified','green'],['integrityExceptions','status','NeedsFollowUp','amber'],['inventoryAIExperiments','label','Critical Stock Risk','red'],['deliveryAIExperiments','label','High','red'],['predictions','label','Damaged','red'],['shipments','status','Dispatched','blue'],['deliveries','status','In Transit','blue'],['deliveries','status','Normal','grey'],['products','condition','Not healthy','grey'],['deliveries','status','Not Failed','grey'],['integrityChecks','outcome','Unavailable','grey'],['purchaseOrders','status','Cancelled','grey']])assert.equal(statisticsTone(r,d,v),t,`${r}/${d}/${v}`);
});
test('wrapped chart categories preserve the original word order',()=>{
 assert.deepEqual(statisticsLabelLines('At/below reorder level'),['At/below','reorder level']);
 assert.deepEqual(statisticsLabelLines('Above reorder level'),['Above reorder','level']);
});
test('legacy property names remain neutral rather than resolving inherited object values',()=>{
 for(const v of ['constructor','__proto__','toString'])assert.equal(statisticsTone('deliveries','status',v),'grey');
});
test('dense category plots reserve readable label slots inside their own scroll region',()=>{
 for(const n of [2,3,7,15])assert(categoryChartMinWidth(n)>=n*100+64);
 assert.equal(categoryChartMinWidth(0),0);
});
test('doughnuts require a meaningful bounded distribution with visible-sized slices',()=>{
 const d={key:'status',label:'Status',denominator:20,values:[{key:'Draft',label:'Draft',count:3},{key:'Prepared',label:'Prepared',count:5},{key:'Dispatched',label:'Dispatched',count:12}]};assert.equal(chooseStatisticsChart(d),'donut');assert.equal(chooseStatisticsChart({...d,denominator:0,values:[]}), 'columns');assert.equal(chooseStatisticsChart({...d,denominator:100,values:[{key:'small',label:'Small',count:1},{key:'large',label:'Large',count:99}]}),'columns');assert.equal(chooseStatisticsChart({key:'s',label:'s',denominator:2,values:[{key:'Unknown',label:'Unknown',count:2}]}),'columns');
});
test('short time series use bars and zero is not rendered as unavailable',()=>{
 assert.equal(chooseStatisticsTimeChart(3),'bars');assert.equal(chooseStatisticsTimeChart(4),'line');assert.equal(formatStatisticsValue(0),'0');assert.equal(formatStatisticsValue(null),'Unavailable');
});
