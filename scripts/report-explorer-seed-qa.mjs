import test from 'node:test';import assert from 'node:assert/strict';import {consumeReportSeed} from '../lib/reportExplorerSeed.js';
test('source filter seeds are normalised once, without inventing derived predicates',()=>{
 assert.deepEqual(consumeReportSeed('products',{revision:1,filters:{sku:' box-1 '}},0),{revision:1,filters:{sku:'BOX-1'}});
 assert.equal(consumeReportSeed('products',{revision:1,filters:{sku:'NEW'}},1),null);
 assert.throws(()=>consumeReportSeed('products',{revision:2,filters:{condition:'below-reorder'}},1));assert.throws(()=>consumeReportSeed('products',{revision:-1,filters:{}},0));
});
