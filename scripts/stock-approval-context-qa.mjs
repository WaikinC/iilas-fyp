import test from 'node:test';
import assert from 'node:assert/strict';
import {approvalBins, linkedApprovalMovement} from '../src/features/operations/reporting/stockApprovalContext.ts';

const product = {
  id: 'product', ownerId: 'scope', location: 'A-01', quantityOnHand: 12, reservedQuantity: 3,
  locationBalances: [
    {location: 'A-01', quantity: 8, reserved: 3, warehouse: 0},
    {location: 'B-02', quantity: 4, reserved: 0, warehouse: 0},
  ],
};

test('a reversal identifies both affected bins in request order using current recorded balances', () => {
  assert.deepEqual(approvalBins({locationFrom: 'b-02', locationTo: 'A-01'}, product), [
    {location: 'B-02', quantity: 4, reserved: 0},
    {location: 'A-01', quantity: 8, reserved: 3},
  ]);
});

test('legacy default bins show their recorded balance and unknown bins remain unknown', () => {
  const legacy = {...product, locationBalances: undefined};
  assert.deepEqual(approvalBins({locationFrom: 'a-01', locationTo: 'B-02'}, legacy), [
    {location: 'A-01', quantity: 12, reserved: 3},
    {location: 'B-02', quantity: null, reserved: null},
  ]);
  assert.deepEqual(approvalBins({locationFrom: 'A-01'}, {...product, locationBalances: []}), [
    {location: 'A-01', quantity: null, reserved: null},
  ]);
  assert.deepEqual(approvalBins({}, product), []);
});

test('original and resulting movements must belong to the selected approval product and scope', () => {
  const row = {id: 'movement', ownerId: 'scope', productId: 'product'};
  assert.equal(linkedApprovalMovement(row, 'product', 'scope'), row);
  assert.equal(linkedApprovalMovement({...row, productId: 'different'}, 'product', 'scope'), null);
  assert.equal(linkedApprovalMovement({...row, ownerId: 'different'}, 'product', 'scope'), null);
  assert.equal(linkedApprovalMovement(null, 'product', 'scope'), null);
});
