import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CameraSession, validateEvidenceFile, captureDimensions} from '../src/features/operations/parcelCapture.ts';
import * as capture from '../src/features/operations/parcelCapture.ts';

function stream() {
  const tracks = [{stopped: 0, stop() { this.stopped++; }}, {stopped: 0, stop() { this.stopped++; }}];
  return {getTracks: () => tracks, tracks};
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

test('camera released after stop, including a permission response arriving late', async () => {
  const session = new CameraSession(), request = deferred(), media = stream();
  const started = session.start(() => request.promise);
  session.stop();
  request.resolve(media);
  assert.equal(await started, null);
  assert.deepEqual(media.tracks.map(t => t.stopped), [1, 1]);
  assert.equal(session.isCurrent(media), false);
});

test('a superseded camera cannot replace the current stream', async () => {
  const session = new CameraSession(), first = deferred(), old = stream(), current = stream();
  const pending = session.start(() => first.promise);
  assert.equal(await session.start(async () => current), current);
  first.resolve(old);
  assert.equal(await pending, null);
  assert.equal(session.isCurrent(current), true);
  assert.deepEqual(old.tracks.map(t => t.stopped), [1, 1]);
  session.stop();
  session.stop();
  assert.deepEqual(current.tracks.map(t => t.stopped), [1, 1]);
});

test('obsolete permission failures are ignored; active failures remain actionable', async () => {
  const session = new CameraSession(), request = deferred();
  const pending = session.start(() => request.promise);
  session.stop();
  request.reject(new Error('Permission denied'));
  assert.equal(await pending, null);
  await assert.rejects(session.start(async () => { throw new Error('Permission denied'); }), /Permission denied/);
});

test('evidence type, emptiness and byte limits are enforced', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.doesNotThrow(() => validateEvidenceFile({type, size: 100}, 'Parcel Image'));
  }
  assert.doesNotThrow(() => validateEvidenceFile({type: 'application/pdf', size: 100}, 'Proof of Delivery'));
  assert.throws(() => validateEvidenceFile({type: 'application/pdf', size: 100}, 'Parcel Image'), /image/);
  assert.throws(() => validateEvidenceFile({type: 'image/svg+xml', size: 100}, 'Parcel Image'), /JPG/);
  assert.throws(() => validateEvidenceFile({type: 'image/jpeg', size: 0}, 'Parcel Image'), /empty/);
  assert.throws(() => validateEvidenceFile({type: 'image/png', size: 10 * 1024 * 1024 + 1}, 'Parcel Image'), /10 MB/);
});

test('camera canvas is bounded and preserves aspect ratio without upscaling', () => {
  assert.deepEqual(captureDimensions(3840, 2160), {width: 1920, height: 1080});
  assert.deepEqual(captureDimensions(1080, 1920), {width: 1080, height: 1920});
  assert.deepEqual(captureDimensions(640, 480), {width: 640, height: 480});
  for (const width of [0, -1, NaN, Infinity]) assert.throws(() => captureDimensions(width, 480), /ready/);
});

test('file selection never invents a capture time and camera preserves the frame declaration', () => {
  assert.equal(typeof capture.captureDeclaration, 'function');
  assert.deepEqual(capture.captureDeclaration('file'), {captureSource: 'file', capturedAtClient: null});
  assert.deepEqual(capture.captureDeclaration('camera', '2026-10-20T10:00:00.000Z'), {
    captureSource: 'camera', capturedAtClient: '2026-10-20T10:00:00.000Z',
  });
  assert.throws(() => capture.captureDeclaration('camera'), /capture time/);
});

test('composer identity invalidates a pending selection for actor, scope, permission, stage or shipment changes', () => {
  assert.equal(typeof capture.evidenceComposerKey, 'function');
  const member = {uid:'staff-a', workspaceId:'scope-a', role:'Warehouse', status:'Approved', active:true, version:1};
  const shipment = {id:'shipment-a', status:'Prepared', version:4, driverUid:'driver-a'};
  const initial = capture.evidenceComposerKey(member, shipment, 'Pre-dispatch');
  assert.equal(capture.evidenceComposerKey({...member}, {...shipment}, 'Pre-dispatch'), initial);
  for (const patch of [{uid:'staff-b'}, {workspaceId:'scope-b'}, {role:'Viewer'}, {status:'Disabled'}, {active:false}, {version:2}]) {
    assert.notEqual(capture.evidenceComposerKey({...member,...patch}, shipment, 'Pre-dispatch'), initial);
  }
  for (const patch of [{id:'shipment-b'}, {status:'Dispatched'}, {version:5}, {driverUid:'driver-b'}]) {
    assert.notEqual(capture.evidenceComposerKey(member, {...shipment,...patch}, 'Pre-dispatch'), initial);
  }
  assert.notEqual(capture.evidenceComposerKey(member, shipment, 'Delivery'), initial);
});

test('legacy evidence display does not infer stage or source from a shipment or filename', () => {
  assert.equal(typeof capture.evidenceProvenance, 'function');
  assert.deepEqual(capture.evidenceProvenance({name:'parcel-camera-123.jpg'}), {
    stage:'Stage not recorded', source:'Source not recorded', capturedAtClient:null,
  });
  assert.deepEqual(capture.evidenceProvenance({stage:'Pre-dispatch', captureSource:'file', capturedAtClient:null}), {
    stage:'Pre-dispatch', source:'File selection (declared)', capturedAtClient:null,
  });
  assert.deepEqual(capture.evidenceProvenance({stage:'Delivery', captureSource:'camera', capturedAtClient:'2026-10-20T10:00:00.000Z'}), {
    stage:'Delivery', source:'Camera (declared)', capturedAtClient:'2026-10-20T10:00:00.000Z',
  });
});
