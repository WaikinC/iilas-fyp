import test from 'node:test';
import assert from 'node:assert/strict';

// Removing the implementation must fail on its contract, rather than an import error.
const implementation = await import('../lib/parcelLiveSession.js').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const {createParcelLiveSession, PARCEL_LIVE_LIMITS} = implementation;
const sessionId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000099';
const timestamp = '2026-10-21T00:00:00.000Z';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(overrides = {}) {
  assert.equal(typeof createParcelLiveSession, 'function', 'live-session factory is required');
  let time = 0, nextTimer = 0, nextId = 0;
  const timers = new Map(), events = [], opens = [], captures = [], submissions = [], closes = [];
  const options = {
    now: () => time,
    setTimer(callback, ms) { const key = ++nextTimer; timers.set(key, {at: time + ms, callback}); return key; },
    clearTimer: key => timers.delete(key),
    createId: () => `20000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`,
    open: async input => { opens.push(input); return {sessionId, state: 'Open'}; },
    capture: async input => { captures.push({...input, at: time}); return {payload: 'SECRET_IMAGE_BYTES', bytes: 1024, capturedAtClient: timestamp}; },
    submit: async input => { submissions.push(input); return {sessionId: input.sessionId, frameId: input.frameId, sequence: input.sequence, state: 'Predicted', label: 'Normal', secret: 'PRIVATE_TOKEN'}; },
    close: async input => { closes.push(input); },
    onEvent: event => events.push(event),
    ...overrides,
  };
  const controller = createParcelLiveSession(options);
  async function advance(ms) {
    const target = time + ms;
    for (;;) {
      let next;
      for (const [key, timer] of timers) if (timer.at <= target && (!next || timer.at < next[1].at)) next = [key, timer];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
    }
    time = target; await flush();
  }
  return {controller, events, opens, captures, submissions, closes, advance, timers, options, setTime: value => { time = value; }};
}

test('explicit start emits only allowlisted results and immutable safe snapshots', async () => {
  const h = harness();
  assert.equal(h.controller.snapshot().state, 'Idle');
  assert.equal(h.opens.length, 0);
  await h.controller.start(); await flush();
  const snapshot = h.controller.snapshot();
  assert.equal(snapshot.state, 'Running'); assert.equal(snapshot.current, true);
  assert.equal(snapshot.attempted, 1); assert.equal(snapshot.completed, 1);
  assert.deepEqual(Object.keys(snapshot.lastResult).sort(), ['frameId', 'label', 'sequence', 'sessionId', 'state']);
  assert.equal(Object.isFrozen(snapshot), true); assert.equal(Object.isFrozen(snapshot.lastResult), true);
  assert.equal(JSON.stringify(h.events).includes('SECRET'), false);
  assert.equal(JSON.stringify(h.events).includes('PRIVATE'), false);
  assert.equal(Object.isFrozen(PARCEL_LIVE_LIMITS), true);
  h.controller.dispose(); await flush();
});

test('busy capture drops cadence slots without overlapping, queuing, or submitting twice', async () => {
  const capture = deferred(); let calls = 0;
  const h = harness({capture: () => { calls++; return capture.promise; }});
  await h.controller.start(); await h.advance(14999);
  assert.equal(calls, 1); assert.equal(h.controller.snapshot().dropped, 2);
  capture.resolve({payload: {}, bytes: 1, capturedAtClient: timestamp}); await flush();
  assert.equal(h.submissions.length, 1);
  await h.advance(1); assert.equal(calls, 1);
  await h.advance(4999); assert.equal(calls, 1);
  await h.advance(1); assert.equal(calls, 2);
  h.controller.stop(); await flush();
});

test('busy submit occupies the same slot and does not queue a replacement', async () => {
  const submit = deferred(); let calls = 0;
  const h = harness({submit: () => { calls++; return submit.promise; }});
  await h.controller.start(); await h.advance(10000);
  assert.equal(h.captures.length, 1); assert.equal(calls, 1); assert.equal(h.controller.snapshot().dropped, 2);
  h.controller.stop(); submit.resolve({sessionId, frameId: otherId, sequence: 1, state: 'Predicted', label: 'Damaged'}); await flush();
  assert.equal(h.controller.snapshot().lastResult, null);
});

test('fresh result becomes historical at exactly 15000ms, regardless of newer capture starts', async () => {
  const nextCapture = deferred(); let calls = 0;
  const h = harness({capture: () => ++calls === 1 ? Promise.resolve({payload: {}, bytes: 1, capturedAtClient: timestamp}) : nextCapture.promise});
  await h.controller.start(); await flush(); await h.advance(14999);
  assert.equal(h.controller.snapshot().current, true); assert.equal(h.controller.snapshot().resultAgeMs, 14999);
  const before = h.events.length;
  await h.advance(1);
  assert.equal(h.controller.snapshot().current, false); assert.equal(h.controller.snapshot().resultAgeMs, 15000);
  assert.equal(h.events.slice(before).some(event => event.type === 'state' && event.current === false), true);
  h.controller.stop(); nextCapture.resolve({payload: {}, bytes: 1, capturedAtClient: timestamp}); await flush();
});

test('slow but valid results remain historical using capture-start monotonic age', async () => {
  const response = deferred(); let request;
  const h = harness({submit: input => { request = input; return response.promise; }});
  await h.controller.start(); await h.advance(15000);
  response.resolve({...request, state: 'Predicted', label: 'Damaged'}); await flush();
  assert.equal(h.controller.snapshot().current, false); assert.equal(h.controller.snapshot().lastResult.label, 'Damaged');
  h.controller.stop(); await flush();
});

test('maximum 12 attempts stops only after the final result, without a thirteenth capture', async () => {
  const h = harness(); await h.controller.start(); await flush(); await h.advance(100000);
  assert.equal(h.captures.length, 12); assert.equal(h.submissions.length, 12);
  assert.equal(h.controller.snapshot().completed, 12); assert.equal(h.controller.snapshot().reason, 'frame-limit');
  assert.equal(h.controller.snapshot().current, false); assert.equal(h.closes.length, 1);
  assert.equal(h.captures.every((capture, i) => i === 0 || capture.at - h.captures[i - 1].at >= 5000), true);
});

test('lifetime includes unresolved open latency and late opening is closed without capture', async () => {
  const open = deferred(); let calls = 0;
  const h = harness({open: () => { calls++; return open.promise; }});
  const starting = h.controller.start(); await flush(); await h.advance(119999);
  assert.equal(h.controller.snapshot().state, 'Starting');
  await h.advance(1); assert.equal(h.controller.snapshot().reason, 'lifetime-limit');
  await assert.rejects(h.controller.start(), /busy/i); assert.equal(calls, 1);
  open.resolve({sessionId, state: 'Open'}); await starting; await flush();
  assert.equal(h.captures.length, 0); assert.deepEqual(h.closes, [{sessionId, reason: 'lifetime-limit'}]);
  assert.equal(h.events.some(event => event.type === 'closed' && event.acknowledged === true), true);
});

for (const action of ['stop', 'dispose']) test(`${action} during unresolved open fences its late response and closes once`, async () => {
  const open = deferred();
  const h = harness({open: () => open.promise});
  const starting = h.controller.start(); await flush(); h.controller[action]();
  await assert.rejects(h.controller.start(), action === 'dispose' ? /disposed/i : /busy/i);
  open.resolve({sessionId, state: 'Open'}); await starting; await flush();
  assert.equal(h.captures.length, 0); assert.equal(h.closes.length, 1);
  assert.equal(h.closes[0].reason, action === 'dispose' ? 'disposed' : 'user-stop');
});

for (const phase of ['capture', 'submit']) test(`abort-ignoring ${phase} remains outstanding after exact deadline and blocks restart`, async () => {
  const pending = deferred(); let input;
  const h = harness({[phase]: value => { input = value; return pending.promise; }});
  await h.controller.start(); await flush(); await h.advance(59999);
  assert.equal(h.controller.snapshot().state, 'Running');
  await h.advance(1);
  assert.equal(h.controller.snapshot().reason, 'frame-timeout'); assert.equal(input.signal.aborted, true);
  await assert.rejects(h.controller.start(), /busy/i);
  await h.advance(200000); await assert.rejects(h.controller.start(), /busy/i);
  pending.resolve(phase === 'capture' ? {payload: 'SECRET_LATE', bytes: 1, capturedAtClient: timestamp} : {...input, state: 'Predicted', label: 'Normal'});
  await flush(); assert.equal(h.controller.snapshot().lastResult, null);
  assert.equal(h.closes.length, 1);
  await h.controller.start(); await flush(); assert.equal(h.opens.length, 2);
  h.controller.dispose(); await flush();
});

test('capture and submit share one deadline, which does not reset on capture completion', async () => {
  const capture = deferred(), submit = deferred(); let request;
  const h = harness({capture: () => capture.promise, submit: input => { request = input; return submit.promise; }});
  await h.controller.start(); await h.advance(50000);
  capture.resolve({payload: {}, bytes: 1, capturedAtClient: timestamp}); await flush(); await h.advance(10000);
  assert.equal(h.controller.snapshot().reason, 'frame-timeout'); assert.equal(request.signal.aborted, true);
  submit.resolve({...request, state: 'Predicted', label: 'Normal'}); await flush();
});

test('overlapping starts do not create replacement operations and a restart needs an explicit call', async () => {
  const open = deferred(); let count = 0;
  const h = harness({open: () => { count++; return open.promise; }});
  const starting = h.controller.start(); await assert.rejects(h.controller.start(), /busy/i);
  assert.equal(count, 1); open.resolve({sessionId, state: 'Open'}); await starting; await flush();
  h.controller.stop(); await flush(); await h.advance(120000); assert.equal(count, 1);
  await h.controller.start(); await flush(); assert.equal(count, 2); h.controller.dispose(); await flush();
});

test('pending close blocks restart until acknowledged and never runs twice', async () => {
  const closed = deferred(); let calls = 0;
  const h = harness({close: () => { calls++; return closed.promise; }});
  await h.controller.start(); await flush(); h.controller.stop(); h.controller.stop(); await flush();
  await assert.rejects(h.controller.start(), /busy/i); assert.equal(calls, 1);
  closed.resolve(); await flush(); await h.controller.start(); await flush(); assert.equal(h.opens.length, 2);
  h.controller.dispose(); await flush();
});

for (const mode of ['reject', 'non-void']) test(`close ${mode} permanently blocks restart and reports safe unacknowledged closure`, async () => {
  const h = harness({close: () => mode === 'reject' ? Promise.reject(new Error('SECRET_FAILURE')) : Promise.resolve({secret: 'SECRET_FAILURE'})});
  await h.controller.start(); await flush(); h.controller.stop('context-changed'); await flush();
  await assert.rejects(h.controller.start(), /reconciliation/i);
  assert.equal(h.controller.snapshot().reason, 'context-changed');
  assert.deepEqual(h.events.filter(event => event.type === 'closed'), [{type: 'closed', sessionId, reason: 'context-changed', acknowledged: false}]);
  assert.equal(JSON.stringify(h.events).includes('SECRET'), false);
});

for (const reason of ['user-stop', 'hidden', 'pagehide', 'track-ended', 'context-changed']) test(`${reason} stops synchronously, aborts, and clears current status`, async () => {
  const h = harness(); await h.controller.start(); await flush();
  h.controller.stop(reason);
  assert.equal(h.controller.snapshot().state, 'Stopped'); assert.equal(h.controller.snapshot().current, false);
  assert.equal(h.opens[0].signal.aborted, true); assert.equal(h.controller.snapshot().reason, reason);
  await flush(); assert.equal(h.closes[0].reason, reason); await h.advance(120000); assert.equal(h.captures.length, 1);
});

test('unrecognised stop reason is replaced with a fixed safe reason', async () => {
  const h = harness(); await h.controller.start(); await flush(); h.controller.stop('SECRET_TOKEN'); await flush();
  assert.equal(h.controller.snapshot().reason, 'invalid-reason'); assert.equal(JSON.stringify(h.events).includes('SECRET'), false);
});

for (const response of [null, {}, {sessionId: 'bad', state: 'Open'}, {sessionId, state: 'secret'}]) test(`invalid open response fails closed (${JSON.stringify(response)})`, async () => {
  const h = harness({open: async () => response}); await h.controller.start(); await flush();
  assert.equal(h.controller.snapshot().reason, 'invalid-open'); assert.equal(h.captures.length, 0);
  if (response?.sessionId === sessionId) assert.equal(h.closes.length, 1);
});

test('unavailable opening closes its known session without transmitting any frame', async () => {
  const h = harness({open: async () => ({sessionId, state: 'Unavailable'})}); await h.controller.start(); await flush();
  assert.equal(h.controller.snapshot().state, 'Unavailable'); assert.equal(h.captures.length, 0);
  assert.deepEqual(h.closes, [{sessionId, reason: 'unavailable'}]);
});

for (const bytes of [0, -1, 1.5, '1', 1048577, NaN, Infinity]) test(`invalid capture byte count is never submitted (${bytes})`, async () => {
  const h = harness({capture: async () => ({payload: 'SECRET', bytes, capturedAtClient: timestamp})});
  await h.controller.start(); await flush(); assert.equal(h.submissions.length, 0); assert.equal(h.controller.snapshot().reason, 'invalid-capture');
});

for (const capturedAtClient of [null, '', '2026-10-21', '2026-10-21T00:00:00Z', '2026-02-30T00:00:00.000Z']) test(`noncanonical capture time fails closed (${capturedAtClient})`, async () => {
  const h = harness({capture: async () => ({payload: {}, bytes: 1, capturedAtClient})}); await h.controller.start(); await flush();
  assert.equal(h.submissions.length, 0); assert.equal(h.controller.snapshot().reason, 'invalid-capture');
});

test('exact 1MiB frame is accepted and its payload is passed through only to submit', async () => {
  const payload = new Uint8Array([1, 2]);
  const h = harness({capture: async () => ({payload, bytes: 1048576, capturedAtClient: timestamp})});
  await h.controller.start(); await flush(); assert.equal(h.submissions[0].payload, payload); assert.equal(h.controller.snapshot().completed, 1);
  assert.equal('payload' in h.controller.snapshot().lastResult, false); h.controller.dispose(); await flush();
});

for (const change of [{sessionId: otherId}, {frameId: otherId}, {sequence: 2}, {sequence: '1'}, {state: 'Running'}, {label: null}, {label: 'secret'}, {state: 'Abstained', label: 'Normal'}]) test(`mismatched or invalid result rejected (${JSON.stringify(change)})`, async () => {
  const h = harness({submit: async input => ({...input, state: 'Predicted', label: 'Normal', ...change})});
  await h.controller.start(); await flush(); assert.equal(h.controller.snapshot().reason, 'invalid-result');
  assert.equal(h.controller.snapshot().lastResult, null); assert.equal(h.controller.snapshot().completed, 0);
});

for (const state of ['Abstained', 'Unavailable', 'Failed', 'Stale', 'Expired']) test(`${state} requires a null label and is safely retained`, async () => {
  const h = harness({submit: async input => ({...input, state, label: null})}); await h.controller.start(); await flush();
  assert.equal(h.controller.snapshot().lastResult.state, state); assert.equal(h.controller.snapshot().lastResult.label, null);
  assert.equal(h.controller.snapshot().completed, 1);
  if (state === 'Abstained') assert.equal(h.controller.snapshot().current, true);
  else assert.equal(h.controller.snapshot().current, false);
  h.controller.dispose(); await flush();
});

for (const phase of ['open', 'capture', 'submit']) test(`${phase} rejection stops without exposing raw errors or retrying`, async () => {
  let calls = 0;
  const h = harness({[phase]: () => { calls++; throw new Error('SECRET_CREDENTIAL'); }});
  await h.controller.start(); await flush(); await h.advance(120000);
  assert.equal(h.controller.snapshot().reason, `${phase}-failed`); assert.equal(calls, 1);
  assert.equal(JSON.stringify(h.events).includes('SECRET'), false);
});

test('throwing listeners cannot prevent abort, close, or result-age cleanup', async () => {
  const h = harness({onEvent: () => { throw new Error('SECRET_LISTENER'); }});
  await h.controller.start(); await flush(); h.controller.dispose(); await flush();
  assert.equal(h.opens[0].signal.aborted, true); assert.equal(h.closes.length, 1); assert.equal(h.timers.size, 0);
  await assert.rejects(h.controller.start(), /disposed/i);
});

test('malicious result getter fails safely and unknown getters are never inspected', async () => {
  const h = harness({submit: async input => ({sessionId: input.sessionId, frameId: input.frameId, sequence: input.sequence, state: 'Predicted', label: 'Normal', get secret() { throw Error('SECRET'); }})});
  await h.controller.start(); await flush(); assert.equal(h.controller.snapshot().completed, 1); h.controller.stop(); await flush();
  const bad = harness({submit: async () => ({get sessionId() { throw Error('SECRET'); }})});
  await bad.controller.start(); await flush(); assert.equal(bad.controller.snapshot().reason, 'invalid-result');
});

test('bad generated IDs prevent open/frame work and do not leak arbitrary values', async () => {
  const h = harness({createId: () => 'SECRET_BAD_ID'}); await h.controller.start(); await flush();
  assert.equal(h.opens.length, 0); assert.equal(h.controller.snapshot().reason, 'invalid-open');
  assert.equal(JSON.stringify(h.events).includes('SECRET'), false);
});

test('encoding jitter cannot start another capture until 5000ms after submit completion', async () => {
  const capture = deferred(); let calls = 0;
  const h = harness({capture: () => ++calls === 1 ? capture.promise : Promise.resolve({payload: {}, bytes: 1, capturedAtClient: timestamp})});
  await h.controller.start(); await h.advance(4999);
  capture.resolve({payload: {}, bytes: 1, capturedAtClient: timestamp}); await flush();
  await h.advance(1); assert.equal(calls, 1); assert.equal(h.controller.snapshot().dropped, 0);
  await h.advance(4999); assert.equal(calls, 1);
  await h.advance(1); assert.equal(calls, 2); h.controller.dispose(); await flush();
});

test('synchronous abort listeners cannot replace a session before close is pending', async () => {
  let nestedStart;
  const h = harness(); await h.controller.start(); await flush();
  h.opens[0].signal.addEventListener('abort', () => { nestedStart = h.controller.start(); });
  h.controller.stop();
  await assert.rejects(nestedStart, /busy/i); await flush();
  assert.equal(h.opens.length, 1); assert.equal(h.controller.snapshot().state, 'Stopped');
});

test('valid returned session ID is closed even when another open field getter throws', async () => {
  const h = harness({open: async () => ({sessionId, get state() { throw Error('SECRET'); }})});
  await h.controller.start(); await flush();
  assert.deepEqual(h.closes, [{sessionId, reason: 'invalid-open'}]);
  assert.equal(JSON.stringify(h.events).includes('SECRET'), false);
});

test('rejected asynchronous event listeners are contained like synchronous listeners', async () => {
  const h = harness({onEvent: async () => { throw Error('SYNTHETIC_LISTENER_FAILURE'); }});
  await h.controller.start(); await flush(); h.controller.dispose(); await flush();
  assert.equal(h.closes.length, 1); assert.equal(h.timers.size, 0);
  await new Promise(resolve => setImmediate(resolve));
});

test('running lifetime stops a later pending frame at exactly 120000ms', async () => {
  const first = deferred(), second = deferred(); let input, calls = 0;
  const h = harness({submit: value => { input = value; return ++calls === 1 ? first.promise : second.promise; }});
  await h.controller.start(); await h.advance(59000);
  first.resolve({...input, state: 'Predicted', label: 'Normal'}); await flush();
  await h.advance(60999); assert.equal(h.controller.snapshot().state, 'Running'); assert.equal(calls, 2);
  await h.advance(1); assert.equal(h.controller.snapshot().reason, 'lifetime-limit');
  second.resolve({...input, state: 'Predicted', label: 'Normal'}); await flush();
  assert.equal(h.controller.snapshot().completed, 1); assert.equal(h.closes.length, 1);
});

test('throttled timer delivery cannot accept a frame beyond its deadline', async () => {
  const response = deferred(); let input;
  const h = harness({submit: value => { input = value; return response.promise; }});
  await h.controller.start(); await flush(); h.setTime(60000);
  response.resolve({...input, state: 'Predicted', label: 'Normal'}); await flush();
  assert.equal(h.controller.snapshot().reason, 'frame-timeout'); assert.equal(h.controller.snapshot().completed, 0);
});

test('throttled timer delivery cannot activate an opened session beyond its lifetime', async () => {
  const response = deferred(); const h = harness({open: () => response.promise});
  const starting = h.controller.start(); h.setTime(120000); response.resolve({sessionId, state: 'Open'});
  await starting; await flush(); assert.equal(h.captures.length, 0);
  assert.equal(h.controller.snapshot().reason, 'lifetime-limit'); assert.equal(h.closes.length, 1);
});

test('missing capture payload fails before submission', async () => {
  const h = harness({capture: async () => ({bytes: 1, capturedAtClient: timestamp})});
  await h.controller.start(); await flush(); assert.equal(h.submissions.length, 0);
  assert.equal(h.controller.snapshot().reason, 'invalid-capture');
});

test('all negative terminal submit states stop sampling rather than continuing', async () => {
  for (const state of ['Unavailable', 'Failed', 'Stale', 'Expired']) {
    const h = harness({submit: async input => ({...input, state, label: null})});
    await h.controller.start(); await flush(); await h.advance(120000);
    assert.equal(h.captures.length, 1); assert.equal(h.closes.length, 1);
    assert.equal(h.controller.snapshot().state, state === 'Unavailable' ? 'Unavailable' : 'Stopped');
  }
});

test('uppercase session IDs are rejected at the open boundary', async () => {
  const h = harness({open: async () => ({sessionId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', state: 'Open'})});
  await h.controller.start(); await flush(); assert.equal(h.captures.length, 0);
  assert.equal(h.controller.snapshot().reason, 'invalid-open');
});

test('uppercase generated operation IDs never reach open', async () => {
  const h = harness({createId: () => 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'});
  await h.controller.start(); await flush(); assert.equal(h.opens.length, 0);
  assert.equal(h.controller.snapshot().reason, 'invalid-open');
});

test('uppercase generated frame IDs never reach capture', async () => {
  let calls = 0;
  const h = harness({createId: () => ++calls === 1 ? otherId : 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'});
  await h.controller.start(); await flush(); assert.equal(h.captures.length, 0);
  assert.equal(h.controller.snapshot().reason, 'invalid-capture');
});

for (const field of ['bytes', 'capturedAtClient', 'payload']) test(`capture ${field} getter stopping the generation prevents submission`, async () => {
  let h;
  h = harness({capture: async () => {
    const value = {bytes: 1, capturedAtClient: timestamp, payload: 'SYNTHETIC_PRIVATE_FRAME'};
    Object.defineProperty(value, field, {get() {
      h.controller.stop('context-changed');
      return field === 'bytes' ? 1 : field === 'capturedAtClient' ? timestamp : 'SYNTHETIC_PRIVATE_FRAME';
    }});
    return value;
  }});
  await h.controller.start(); await flush();
  assert.equal(h.submissions.length, 0); assert.equal(h.controller.snapshot().attempted, 1);
  assert.equal(h.controller.snapshot().completed, 0); assert.equal(h.controller.snapshot().lastResult, null);
  assert.equal(h.controller.snapshot().reason, 'context-changed'); assert.equal(h.closes.length, 1); assert.equal(h.timers.size, 0);
});

for (const field of ['sessionId', 'frameId', 'sequence', 'state', 'label']) test(`result ${field} getter stopping the generation prevents commit and timers`, async () => {
  let h;
  h = harness({submit: async input => {
    const value = {sessionId: input.sessionId, frameId: input.frameId, sequence: input.sequence, state: 'Predicted', label: 'Normal'};
    const original = value[field];
    Object.defineProperty(value, field, {get() { h.controller.stop('context-changed'); return original; }});
    return value;
  }});
  await h.controller.start(); await flush();
  assert.equal(h.controller.snapshot().completed, 0); assert.equal(h.controller.snapshot().lastResult, null);
  assert.equal(h.events.some(event => event.type === 'result'), false);
  assert.equal(h.controller.snapshot().reason, 'context-changed'); assert.equal(h.closes.length, 1); assert.equal(h.timers.size, 0);
});

for (const phase of ['open', 'capture']) test(`createId callback stopping before ${phase} prevents adapter work`, async () => {
  let h, calls = 0;
  h = harness({createId() {
    calls++;
    if (phase === 'open' || calls === 2) h.controller.stop('context-changed');
    return calls === 1 ? otherId : sessionId;
  }});
  await h.controller.start(); await flush();
  assert.equal(h.opens.length, phase === 'open' ? 0 : 1);
  assert.equal(h.captures.length, 0); assert.equal(h.submissions.length, 0);
  assert.equal(h.controller.snapshot().attempted, 0); assert.equal(h.timers.size, 0);
});

for (const phase of ['capture', 'submit']) test(`${phase} field decoding crossing deadline prevents further work or result commit`, async () => {
  let h;
  h = harness(phase === 'capture' ? {capture: async () => ({bytes: 1, capturedAtClient: timestamp, get payload() { h.setTime(60000); return {}; }})} :
    {submit: async input => ({sessionId: input.sessionId, frameId: input.frameId, sequence: input.sequence, state: 'Predicted', get label() { h.setTime(60000); return 'Normal'; }})});
  await h.controller.start(); await flush();
  if (phase === 'capture') assert.equal(h.submissions.length, 0);
  assert.equal(h.controller.snapshot().reason, 'frame-timeout'); assert.equal(h.controller.snapshot().completed, 0);
  assert.equal(h.controller.snapshot().lastResult, null); assert.equal(h.timers.size, 0);
});
