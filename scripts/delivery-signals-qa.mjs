import assert from 'node:assert/strict';
import {deliverySignals} from '../src/features/operations/deliverySignals.ts';
const shipment={expectedDelivery:'2026-10-08'};
const now=Date.parse('2026-10-09T10:00:00+08:00');
const updatedAt={seconds:Date.parse('2026-10-07T08:00:00+08:00')/1000};
for(const status of ['Dispatched','In Transit','Attempt Failed'])assert.deepEqual(deliverySignals(shipment,{status,updatedAt,failedAttempts:2},now),['Expected delivery date exceeded','Repeated failed delivery attempts','No delivery update for 24 hours']);
for(const status of ['Delivered','Returned']) {
  assert.deepEqual(deliverySignals(shipment,{status,updatedAt},now),[]);
  assert.deepEqual(deliverySignals(shipment,{status,updatedAt,failedAttempts:2},now),['Repeated failed delivery attempts']);
}
assert.deepEqual(deliverySignals(shipment,undefined,now),['Expected delivery date exceeded']);
const deadline=Date.parse('2026-10-08T23:59:59.999+08:00');
assert.deepEqual(deliverySignals(shipment,undefined,deadline),[]);
assert.deepEqual(deliverySignals(shipment,undefined,deadline+1),['Expected delivery date exceeded']);
assert.deepEqual(deliverySignals({expectedDelivery:'2026-10-10'},{updatedAt:{seconds:(now-86400000)/1000}},now),[]);
console.log('Delivery signal QA passed: active, delivered and returned states, historical failures, Malaysia deadline and 24-hour boundary.');
