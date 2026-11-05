import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {beforeEach, test} from 'node:test';
import {all, fingerprint, get, put} from './record-creation-command-harness.mjs';

const {executeCommand} = await import('../backend/functions/service.mjs');
const call = (action, input, uid = 'inventory') => executeCommand({uid}, {action, input});
const request = (overrides = {}) => ({
  productId: 'p1',
  type: 'Receipt',
  quantity: 2,
  reference: 'COUNT-1',
  reason: 'Fictional stock check',
  operationId: randomUUID(),
  ...overrides,
});
const stock = (input, uid) => call('stock', input, uid);
const review = (id, decision = 'Approve') =>
  call('approval', {id, version: 1, decision, notes: 'Independent count review'}, 'manager');
const duplicate = /reference.*(already|pending)/i;
const claims = () => all('uniqueKeys').filter(key => key.kind === 'manualStockReference');
const legacy = overrides => ({
  ownerId: 'scope', productId: 'p1', type: 'Receipt', reference: 'COUNT-1', ...overrides,
});

beforeEach(() => {
  for (const id of ['p1', 'p2']) {
    put('products/' + id, {
      ownerId: 'scope', name: 'Fictional pump', sku: id, location: 'A-01',
      quantityOnHand: 20, reservedQuantity: 0, status: 'Active', version: 1,
    });
  }
});

test('different staff and operation IDs cannot apply the same canonical manual reference twice', async () => {
  const first = request({reference: ' count-1 '});
  const second = request();
  const results = await Promise.allSettled([stock(first), stock(second, 'warehouse')]);
  const successful = results.findIndex(result => result.status === 'fulfilled');
  const refused = results.filter(result => result.status === 'rejected');
  assert.equal(refused.length, 1);
  assert.match(refused[0].reason.message, duplicate);
  assert.match(refused[0].reason.publicMessage, /distinct reference/i);
  assert.equal(refused[0].reason.stockRequestNotApplied, true);
  const original = results[successful].value;
  const [saved, actor] = successful === 0 ? [first, 'inventory'] : [second, 'warehouse'];
  assert.deepEqual(await stock(saved, actor), {...original, replayed: true});
  assert.deepEqual(await call('resolveStock', saved, actor), {...original, replayed: true});
  assert.equal(get('products/p1').quantityOnHand, 22);
  assert.equal(all('stockMovements').length, 1);
  assert.equal(claims().length, 1);
});

test('distinct references, products and movement types stay independent and blank references stay optional', async () => {
  await stock(request());
  await stock(request({reference: 'COUNT-1-PART-2'}));
  await stock(request({productId: 'p2'}));
  await stock(request({type: 'Issue'}));
  await stock(request({reference: ''}));
  await stock(request({reference: '  '}));
  assert.equal(all('stockMovements').length, 6);
  assert.equal(claims().length, 4);
});

test('normalized legacy manual history blocks a duplicate without rewriting any historical record', async () => {
  put('stockMovements/legacy', legacy({}));
  const before = fingerprint();
  await assert.rejects(stock(request({reference: ' count-1 '})), duplicate);
  assert.equal(fingerprint(), before);
});

test('foreign and linked workflow histories do not consume a manual reference', async () => {
  put('stockMovements/foreign', legacy({ownerId: 'foreign', origin: 'Manual'}));
  put('stockMovements/procurement', legacy({origin: 'Procurement', purchaseOrderId: 'po'}));
  put('stockMovements/old-dispatch', legacy({shipmentId: 'shipment'}));
  await stock(request());
  assert.equal(all('stockMovements').length, 4);
});

test('an oversized set of same-reference legacy matches fails without changing stock', async () => {
  for (let i = 0; i < 26; i++) {
    put('stockMovements/linked' + i, legacy({origin: 'Procurement', purchaseOrderId: 'po'}));
  }
  const before = fingerprint();
  await assert.rejects(stock(request()), /too much linked movement history/i);
  assert.equal(fingerprint(), before);
});

test('pending adjustment references block other requests, release on rejection and remain reserved after approval', async () => {
  const first = request({type: 'Adjustment', adjustmentDirection: 'Increase'});
  const pending = await stock(first);
  await assert.rejects(stock({...first, operationId: randomUUID()}, 'manager'), duplicate);
  await review(pending.id, 'Reject');
  assert.equal(claims().length, 0);
  const second = {...first, operationId: randomUUID()};
  const submitted = await stock(second);
  await review(submitted.id);
  assert.equal(get('products/p1').quantityOnHand, 22);
  assert.equal((await stock(first)).id, pending.id);
  assert.equal((await stock(second)).id, submitted.id);
  await assert.rejects(stock({...first, operationId: randomUUID()}), duplicate);
});

test('a legacy pending adjustment is protected before approval and does not block rejection', async () => {
  const input = request({type: 'Adjustment', adjustmentDirection: 'Increase'});
  put('approvals/legacy', {
    ownerId: 'scope', kind: 'Adjustment', status: 'Pending',
    productId: 'p1', input, requestedBy: 'inventory', version: 1,
  });
  await assert.rejects(stock(input, 'manager'), duplicate);
  await review('legacy', 'Reject');
  assert.equal(claims().length, 0);
  await stock(input, 'manager');
  assert.equal(get('products/p1').quantityOnHand, 22);
});

test('a legacy duplicate adjustment cannot be approved but can still be rejected', async () => {
  const input = request({type: 'Adjustment', adjustmentDirection: 'Increase'});
  await stock(input, 'manager');
  put('approvals/legacy', {
    ownerId: 'scope', kind: 'Adjustment', status: 'Pending',
    productId: 'p1', input, requestedBy: 'inventory', version: 1,
  });
  const before = fingerprint();
  await assert.rejects(review('legacy'), duplicate);
  assert.equal(fingerprint(), before);
  await review('legacy', 'Reject');
  assert.equal(get('approvals/legacy').status, 'Rejected');
  assert.equal(claims().length, 1);
  assert.equal(get('products/p1').quantityOnHand, 22);
});

test('correction references are tracked separately and rejection preserves the original movement', async () => {
  const first = await stock(request());
  const other = await stock(request({reference: 'COUNT-2'}));
  const original = get('stockMovements/' + first.id);
  const correction = correctionOf => ({
    productId: 'p1', type: 'Correction', correctionOf,
    reference: 'COUNT-1', reason: 'Fictional reversal', operationId: randomUUID(),
  });
  const pending = await stock(correction(first.id));
  await assert.rejects(stock(correction(other.id)), duplicate);
  await review(pending.id, 'Reject');
  const next = await stock(correction(other.id));
  await review(next.id);
  assert.deepEqual(get('stockMovements/' + first.id), original);
  assert.equal(get('products/p1').quantityOnHand, 22);
});

test('resolving an unapplied request creates no business reference claim', async () => {
  const cancelled = request();
  assert.equal((await call('resolveStock', cancelled)).notApplied, true);
  assert.equal((await stock(cancelled)).notApplied, true);
  assert.equal(claims().length, 0);
  await stock(request());
  assert.equal(claims().length, 1);
});
