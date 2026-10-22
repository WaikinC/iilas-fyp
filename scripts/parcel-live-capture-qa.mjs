import assert from 'node:assert/strict';
import {test} from 'node:test';

let unit;
try { unit = await import('../src/features/operations/parcelLiveCapture.ts'); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

test('exports a bounded dimension helper and single-frame encoder', () => {
  assert.equal(typeof unit?.liveFrameDimensions, 'function');
  assert.equal(typeof unit?.captureParcelLiveFrame, 'function');
});

const captureTest = (name, run) => test(name, {skip: !unit}, run);
const jpeg = size => new Blob([new Uint8Array(size)], {type: 'image/jpeg'});

// A controlled DOM boundary is necessary to hold the actual encoder callback
// outstanding; real browser encoding cannot deterministically create these races.
function fixture(t, overrides = {}) {
  const controller = new AbortController();
  let current = true;
  const calls = {create: 0, context: 0, draw: [], encode: []};
  const canvas = {
    width: 0, height: 0,
    getContext(kind) {
      calls.context++;
      assert.equal(kind, '2d');
      overrides.onContext?.();
      if (overrides.noContext) return null;
      return {drawImage(...args) {calls.draw.push(args); overrides.onDraw?.();}};
    },
    toBlob(callback, type, quality) {
      calls.encode.push({callback, type, quality});
      overrides.onEncode?.(callback);
    },
  };
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {configurable: true, value: {
    createElement(tag) {
      calls.create++;
      assert.equal(tag, 'canvas');
      overrides.onCreate?.();
      return canvas;
    },
  }});
  t.after(() => {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
    else delete globalThis.document;
  });
  const video = {readyState: 2, videoWidth: 1920, videoHeight: 1080};
  const options = {signal: controller.signal, isCurrent: () => current};
  return {
    video, options, controller, calls, canvas,
    stale() {current = false;},
    start() {return unit.captureParcelLiveFrame(video, options);},
    finish(blob = jpeg(40)) {assert.equal(calls.encode.length, 1); calls.encode[0].callback(blob);},
  };
}

captureTest('downscales landscape, portrait, square and extreme aspect ratios without upscaling', () => {
  for (const [width, height, want] of [
    [1920, 1080, {width: 960, height: 540}],
    [1080, 1920, {width: 540, height: 960}],
    [961, 961, {width: 960, height: 960}],
    [641, 479, {width: 641, height: 479}],
    [1000000, 1, {width: 960, height: 1}],
    [1, 1000000, {width: 1, height: 960}],
  ]) assert.deepEqual(unit.liveFrameDimensions(width, height), want);
});

captureTest('rejects nonpositive, fractional, unsafe or nonnumeric dimensions', () => {
  for (const bad of [0, -1, 0.1, 1.5, NaN, Infinity, '1920', null, undefined, 2 ** 53]) {
    assert.throws(() => unit.liveFrameDimensions(bad, 100));
    assert.throws(() => unit.liveFrameDimensions(100, bad));
  }
});

captureTest('encodes exactly one JPEG at 0.8 with bounded geometry and a canonical device timestamp', async t => {
  const f = fixture(t);
  const before = Date.now();
  const pending = f.start();
  assert.deepEqual([f.canvas.width, f.canvas.height], [960, 540]);
  assert.deepEqual(f.calls.draw, [[f.video, 0, 0, 960, 540]]);
  assert.equal(f.calls.encode.length, 1);
  assert.equal(f.calls.encode[0].type, 'image/jpeg');
  assert.equal(f.calls.encode[0].quality, 0.8);
  const blob = jpeg(1048576);
  f.finish(blob);
  const result = await pending;
  assert.deepEqual(result.payload, {blob, width: 960, height: 540});
  assert.equal(result.bytes, 1048576);
  assert.equal(new Date(result.capturedAtClient).toISOString(), result.capturedAtClient);
  assert.ok(Date.parse(result.capturedAtClient) >= before && Date.parse(result.capturedAtClient) <= Date.now());
  assert.deepEqual(Object.keys(result).sort(), ['bytes', 'capturedAtClient', 'payload']);
  assert.deepEqual([f.canvas.width, f.canvas.height], [0, 0]);
});

captureTest('refuses unready video before allocating or encoding', async t => {
  const f = fixture(t);
  for (const readyState of [0, 1, undefined, NaN]) {
    f.video.readyState = readyState;
    await assert.rejects(f.start());
  }
  assert.equal(f.calls.create, 0);
});

captureTest('refuses invalid source dimensions before allocation', async t => {
  const f = fixture(t);
  f.video.videoWidth = 0;
  await assert.rejects(f.start());
  assert.equal(f.calls.create, 0);
});

captureTest('rejects extended-year device timestamps that the session protocol cannot accept', async t => {
  const f = fixture(t);
  const NativeDate = globalThis.Date;
  globalThis.Date = class extends NativeDate {
    constructor() {super('+010000-01-01T00:00:00.000Z');}
  };
  t.after(() => {globalThis.Date = NativeDate;});
  const pending = f.start();
  if (f.calls.encode.length) f.finish();
  await assert.rejects(pending);
  assert.equal(f.calls.create, 0);
});

for (const stop of ['abort', 'stale']) {
  captureTest(`refuses ${stop} before capture without allocation`, async t => {
    const f = fixture(t);
    if (stop === 'abort') f.controller.abort(); else f.stale();
    await assert.rejects(f.start());
    assert.equal(f.calls.create, 0);
  });

  captureTest(`waits for encoder settlement after ${stop}, then rejects and releases pixels`, async t => {
    const f = fixture(t);
    let settled = false;
    const pending = f.start().finally(() => {settled = true;});
    const rejection = assert.rejects(pending);
    if (stop === 'abort') f.controller.abort(); else f.stale();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.deepEqual([f.canvas.width, f.canvas.height], [960, 540]);
    f.finish();
    await rejection;
    assert.deepEqual([f.canvas.width, f.canvas.height], [0, 0]);
  });
}

for (const [name, blob] of [
  ['null encoder result', null], ['empty JPEG', jpeg(0)],
  ['wrong MIME type', new Blob(['x'], {type: 'image/png'})],
  ['oversized JPEG', jpeg(1048577)], ['forged blob shape', {type: 'image/jpeg', size: 1}],
]) captureTest(`rejects ${name} without returning a payload`, async t => {
  const f = fixture(t);
  const pending = f.start();
  f.finish(blob);
  await assert.rejects(pending);
  assert.deepEqual([f.canvas.width, f.canvas.height], [0, 0]);
});

for (const boundary of ['onCreate', 'onContext', 'onDraw']) {
  captureTest(`rechecks cancellation after ${boundary} before starting encoder`, async t => {
    let f;
    f = fixture(t, {[boundary]: () => f.controller.abort()});
    await assert.rejects(f.start());
    assert.equal(f.calls.encode.length, 0);
    assert.deepEqual([f.canvas.width, f.canvas.height], [0, 0]);
  });
}

captureTest('rechecks signal after the external currency predicate reentrantly aborts', async t => {
  const f = fixture(t);
  f.options.isCurrent = () => {f.controller.abort(); return true;};
  await assert.rejects(f.start());
  assert.equal(f.calls.create, 0);
});

captureTest('normalizes throwing currency, draw, context and encoder errors without leaking their text', async t => {
  for (const boundary of ['predicate', 'onDraw', 'onContext', 'onEncode']) {
    await t.test(boundary, async t => {
      const fail = () => {throw new Error('PRIVATE_RAW_ERROR');};
      const f = fixture(t, boundary === 'predicate' ? {} : {[boundary]: fail});
      if (boundary === 'predicate') f.options.isCurrent = fail;
      await assert.rejects(f.start(), error => error instanceof Error && !String(error).includes('PRIVATE_RAW_ERROR') && error.cause === undefined);
      assert.deepEqual([f.canvas.width, f.canvas.height], [0, 0]);
    });
  }
});

captureTest('rejects unavailable canvas context and releases pixels', async t => {
  const f = fixture(t, {noContext: true});
  await assert.rejects(f.start());
  assert.equal(f.calls.encode.length, 0);
  assert.deepEqual([f.canvas.width, f.canvas.height], [0, 0]);
});

captureTest('handles synchronous callback plus abort before encoder returns', async t => {
  let f;
  f = fixture(t, {onEncode(callback) {callback(jpeg(40)); f.controller.abort();}});
  await assert.rejects(f.start());
  assert.deepEqual([f.canvas.width, f.canvas.height], [0, 0]);
});

captureTest('does not create a second encoder when a defective callback fires twice', async t => {
  const f = fixture(t);
  const pending = f.start();
  const blob = jpeg(40);
  f.finish(blob);
  f.finish(null);
  assert.equal((await pending).payload.blob, blob);
  assert.equal(f.calls.encode.length, 1);
});
