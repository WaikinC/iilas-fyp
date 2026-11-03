// Run: node --test scripts/shipment-retry-qa.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mock, test} from 'node:test';

// Exercise the real command, approval, validation and stock logic. Only the
// Firestore boundary is replaced so an aborted commit can be replayed reliably.
const require = createRequire(new URL('../backend/functions/service.mjs', import.meta.url));
let database;
// Firebase Admin's ESM facade reads these CommonJS exports on first import.
mock.method(require('firebase-admin/firestore'), 'getFirestore', () => database);
const {executeCommand} = await import('../backend/functions/service.mjs');

function fixture() {
  const shipment = {
    ownerId: 'scope', version: 2, reference: 'RETRY-SHIPMENT', recipient: 'Receiver',
    phone: '0123456789', address: '1 Test Road, Kuala Lumpur', expectedDelivery: '2026-10-21',
    status: 'Prepared', packed: true, parcelCount: 1, handoverReference: 'PS-RETRY',
    handoverId: 'shipment', driver: 'Assigned driver', driverUid: 'driver',
    items: [{productId: 'product', quantity: 3, name: 'Packed product', sku: 'PACKED-SKU'}],
  };
  const records = new Map(Object.entries({
    'system/config': {dataScopeId: 'scope', primaryAdminUid: 'actor'},
    'users/actor': {uid: 'actor', role: 'Admin', active: true, status: 'Approved'},
    'users/driver': {uid: 'driver', role: 'Driver', active: true, status: 'Approved'},
    'shipments/shipment': shipment,
    'products/product': {
      ownerId: 'scope', version: 4, name: 'Renamed product', sku: 'NEW-SKU',
      status: 'Active', archived: false, location: 'A-01',
      quantityOnHand: 10, reservedQuantity: 3, warehouseReservedQuantity: 3,
      locationBalances: [{location: 'A-01', quantity: 10, reserved: 3, warehouse: 3}],
    },
    'warehouseHandovers/shipment': {
      ownerId: 'scope', version: 3, status: 'HandedOver', reservationsHeld: true,
      items: [{productId: 'product', quantity: 3, allocations: [{location: 'A-01', quantity: 3}]}],
    },
    'transportPlans/shipment': {
      ownerId: 'scope', status: 'Scheduled', vehicleId: 'vehicle', driverId: 'driver-record',
      driverUid: 'driver', driverName: 'Assigned driver',
    },
    'vehicles/vehicle': {ownerId: 'scope', status: 'Available', capacity: 10},
    'drivers/driver-record': {ownerId: 'scope', status: 'Available'},
    'uniqueKeys/scope_shipment_RETRY-SHIPMENT': {ownerId: 'scope', kind: 'shipments', recordId: 'shipment'},
  }));
  const reference = path => ({path});
  let abortNextWrite = true;
  const aborted = [];
  const db = {
    doc: reference,
    collection: kind => ({doc: id => reference(`${kind}/${id}`)}),
    async runTransaction(work) {
      for (;;) {
        const writes = [];
        const tx = {
          async get(ref) {
            const value = structuredClone(records.get(ref.path));
            return {ref, exists: records.has(ref.path), data: () => structuredClone(value)};
          },
          set: (ref, data) => writes.push({kind: 'set', path: ref.path, data: structuredClone(data)}),
          update: (ref, data) => writes.push({kind: 'update', path: ref.path, data: structuredClone(data)}),
        };
        const result = await work(tx);
        // A retryable commit abort: discard every staged write, then invoke the
        // SAME callback again against the unchanged committed records.
        if (writes.length && abortNextWrite) {
          abortNextWrite = false;
          aborted.push(writes);
          continue;
        }
        for (const write of writes) {
          if (write.kind === 'update') assert.ok(records.has(write.path), 'Cannot update a missing record');
          records.set(write.path, write.kind === 'update'
            ? {...records.get(write.path), ...write.data} : write.data);
        }
        return result;
      }
    },
  };
  return {db, records, aborted, shipment: structuredClone(shipment)};
}

function dispatch(shipment) {
  return executeCommand({uid: 'actor'}, {
    action: 'save', workspaceId: 'scope',
    input: {kind: 'shipments', existing: {id: 'shipment', version: 2}, data: {...shipment, status: 'Dispatched'}},
  });
}

test('dispatch survives an aborted enriched attempt and commits exactly one stock deduction', async () => {
  const state = fixture();
  database = state.db;
  await dispatch(state.shipment);
  assert.equal(state.aborted.length, 1, 'The write attempt must actually be replayed');
  const abandonedShipment = state.aborted[0].find(w => w.path === 'shipments/shipment').data;
  assert.equal(abandonedShipment.status, 'Dispatched');
  assert.deepEqual(abandonedShipment.items, state.shipment.items, 'Abort occurs after item enrichment');
  assert.equal(state.records.get('shipments/shipment').status, 'Dispatched');
  assert.equal(state.records.get('shipments/shipment').version, 3);
  assert.deepEqual(state.records.get('shipments/shipment').items, state.shipment.items);
  const product = state.records.get('products/product');
  assert.equal(product.quantityOnHand, 7);
  assert.equal(product.version, 5);
  assert.equal(product.reservedQuantity, 0);
  assert.equal(product.warehouseReservedQuantity, 0);
  assert.deepEqual(product.locationBalances, [{location: 'A-01', quantity: 7, reserved: 0, warehouse: 0}]);
  const movements = [...state.records].filter(([path]) => path.startsWith('stockMovements/'));
  assert.equal(movements.length, 1);
  assert.equal(movements[0][1].quantityBefore, 10);
  assert.equal(movements[0][1].quantityAfter, 7);
  assert.equal(movements[0][1].shipmentId, 'shipment');
  const handover = state.records.get('warehouseHandovers/shipment');
  assert.equal(handover.reservationsHeld, false);
  assert.deepEqual(handover.dispatchMovementIds, [movements[0][0].split('/')[1]]);
  await assert.rejects(dispatch(state.shipment), /record changed|Dispatched shipments are locked/);
  assert.equal(state.records.get('products/product').quantityOnHand, 7);
  assert.equal([...state.records.keys()].filter(path => path.startsWith('stockMovements/')).length, 1);
});

for (const [label, changes] of [
  ['items', {items: [{productId: 'product', quantity: 2}]}],
  ['parcel count', {parcelCount: 2}],
  ['reference', {reference: 'DIFFERENT-REFERENCE'}],
]) {
  test(`Prepared ${label} remain locked without any committed writes`, async () => {
    const state = fixture();
    database = state.db;
    const before = structuredClone(state.records);
    await assert.rejects(dispatch({...state.shipment, ...changes}), label==='reference'?/stored business code is locked/:/Prepared items and packing details are locked/);
    assert.deepEqual(state.records, before);
  });
}
