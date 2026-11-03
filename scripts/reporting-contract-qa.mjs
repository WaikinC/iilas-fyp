import assert from 'node:assert/strict';
import {test} from 'node:test';
import {REPORT_RESOURCES,validateReportRequest,reportDateWindow,csvCell,buildReportCSV} from '../lib/reporting.js';
test('report registry is closed and filters reject extra/coerced/inapplicable fields',()=>{
 for(const resource of ['products','stockMovements','purchaseOrders','shipments','transportPlans','inventoryAIExperiments','deliveryAIExperiments','integrityChecks'])assert(REPORT_RESOURCES[resource]);
 assert.equal(validateReportRequest({resource:'products',filters:{sku:' sku-1 '}}).filters.sku,'SKU-1');
 for(const input of [{resource:'users',filters:{}},{resource:'../private-config',filters:{}},{resource:'products',filters:{ownerId:'foreign'}},{resource:'products',filters:{vehicleId:'v1'}},{resource:'products',filters:{status:1}},{resource:'products',filters:{dateFrom:'2026-10-25'}},{resource:'products',filters:{dateFrom:'2026-10-25',dateTo:'2026-10-24'}},{resource:'products',filters:{dateFrom:'2026-02-30',dateTo:'2026-03-01'}},{resource:'products',filters:{dateFrom:'2025-01-01',dateTo:'2026-10-25'}},{resource:'products',filters:{},scope:'other'}])assert.throws(()=>validateReportRequest(input));
});
test('Malaysia date boundaries include the whole local day and at most 366 inclusive days',()=>{
 const day=reportDateWindow({dateFrom:'2026-10-25',dateTo:'2026-10-25'});assert.equal(new Date(day.fromMs).toISOString(),'2026-10-24T16:00:00.000Z');assert.equal(new Date(day.toMs).toISOString(),'2026-10-25T15:59:59.999Z');
 assert.equal(reportDateWindow({dateFrom:'2024-01-01',dateTo:'2024-12-31'}).days,366);assert.throws(()=>reportDateWindow({dateFrom:'2024-01-01',dateTo:'2025-01-01'}));
});
test('CSV escapes formulas after whitespace/formatting while preserving literal numbers quotes newlines and Unicode',()=>{
 for(const value of ['=HYPERLINK("bad")','  +SUM(1,2)','\n\t@command','\uFEFF-evil','\u200B=unsafe'])assert.equal(csvCell(value),`"'${value.replaceAll('"','""')}"`);
 assert.equal(csvCell(-2),'"-2"');assert.equal(csvCell('A,"B"\n箱子'),'"A,""B""\n箱子"');assert.equal(csvCell(null),'""');
 const csv=buildReportCSV({resource:'products',filters:{sku:'SKU-1'},rows:[{id:'p1',name:'  =unsafe',sku:'SKU-1'}],coverage:{scope:'page',complete:false,scanned:20},observedAtMs:0});assert.match(csv,/Current refreshed page/);assert.match(csv,/SKU-1/);assert.match(csv,/"'  =unsafe"/);assert(!csv.includes('imageDataUrl'));
});
