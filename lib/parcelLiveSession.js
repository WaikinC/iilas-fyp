/** Local resource policy only; this grants neither authority nor model acceptance. */
export const PARCEL_LIVE_LIMITS = Object.freeze({
  lifetimeMs: 120000,
  maxAttempts: 12,
  cadenceMs: 5000,
  maxLongEdge: 960,
  maxBytes: 1048576,
  frameDeadlineMs: 60000,
  resultMaxAgeMs: 15000,
});

const reasons = new Set([
  'user-stop', 'disposed', 'hidden', 'pagehide', 'track-ended', 'context-changed',
  'lifetime-limit', 'frame-limit', 'open-failed', 'unavailable', 'capture-failed',
  'submit-failed', 'invalid-open', 'invalid-capture', 'invalid-result',
  'frame-timeout', 'invalid-reason', 'stale-result', 'expired',
]);
const resultStates = new Set(['Predicted', 'Abstained', 'Unavailable', 'Failed', 'Stale', 'Expired']);
const isId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isTimestamp = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
};

/**
 * Foreground controller with no image storage, retry queue, or backend authority.
 * Adapters must reconcile ambiguous open/close commands durably. A controller
 * whose close was not acknowledged must be replaced only after reconciliation.
 */
export function createParcelLiveSession(options) {
  for (const name of ['open', 'capture', 'submit', 'close', 'onEvent']) {
    if (typeof options?.[name] !== 'function') throw new TypeError('Invalid live-session adapter');
  }
  const {open, capture, submit, close, onEvent} = options;
  const now = options.now ?? (() => performance.now());
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle));
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
  let context = null;
  let disposed = false;
  let state = 'Idle';
  let reason = null;
  let attempted = 0, completed = 0, dropped = 0;
  let lastResult = null, resultCapturedAt = null;

  function snapshot() {
    const resultAgeMs = resultCapturedAt === null ? null : Math.max(0, now() - resultCapturedAt);
    const current = state === 'Running' && lastResult !== null &&
      lastResult.sessionId === context?.sessionId && resultAgeMs < PARCEL_LIVE_LIMITS.resultMaxAgeMs;
    return Object.freeze({state, sessionId: context?.sessionId ?? null, attempted, completed, dropped,
      lastResult, reason, current, resultAgeMs});
  }
  function emit(event) {
    try {
      // JS/TypeScript void callbacks can still return rejected promises.
      // Consume those failures as well, without inspecting their contents.
      Promise.resolve(onEvent(Object.freeze(event))).catch(() => {});
    } catch { /* Listener failures cannot stop owned cleanup. */ }
  }
  const emitState = () => emit({type: 'state', ...snapshot()});
  function clearTimers(ctx) {
    for (const key of ['lifetimeTimer', 'cadenceTimer', 'deadlineTimer', 'ageTimer']) {
      if (ctx[key] !== null) clearTimer(ctx[key]);
      ctx[key] = null;
    }
  }
  function requestClose(ctx) {
    if (ctx.sessionId === null || ctx.closeStarted) return;
    ctx.closeStarted = true;
    ctx.closePending = true;
    const closeReason = ctx.reason;
    // No frame AbortSignal: stopping local work must not cancel server cleanup.
    Promise.resolve().then(() => close({sessionId: ctx.sessionId, reason: closeReason})).then(
      value => finishClose(value === undefined),
      () => finishClose(false),
    );
    function finishClose(acknowledged) {
      ctx.closePending = false;
      ctx.reconciliationRequired = !acknowledged;
      emit({type: 'closed', sessionId: ctx.sessionId, reason: closeReason, acknowledged});
    }
  }
  function terminate(ctx, stopReason, terminalState = 'Stopped') {
    if (!ctx.active) return;
    ctx.active = false;
    ctx.reason = stopReason;
    state = terminalState;
    reason = stopReason;
    clearTimers(ctx);
    // Fence the generation and publish terminal state before abort listeners run.
    requestClose(ctx);
    ctx.abort.abort();
    emitState();
  }
  function stop(stopReason = 'user-stop') {
    if (context?.active) terminate(context, reasons.has(stopReason) ? stopReason : 'invalid-reason');
  }
  function dispose() {
    disposed = true;
    stop('disposed');
  }
  function stillRunning(ctx, capturedAt = null) {
    if (context !== ctx || !ctx.active) return false;
    const time = now();
    if (context !== ctx || !ctx.active) return false;
    if (time - ctx.startedAt >= PARCEL_LIVE_LIMITS.lifetimeMs) {
      terminate(ctx, 'lifetime-limit');
      return false;
    }
    if (capturedAt !== null && time - capturedAt >= PARCEL_LIVE_LIMITS.frameDeadlineMs) {
      terminate(ctx, 'frame-timeout');
      return false;
    }
    return true;
  }
  function readOpen(value) {
    if (!isRecord(value)) return {sessionId: null, valid: false};
    let sessionId = null;
    try {
      const returnedId = value.sessionId;
      sessionId = isId(returnedId) ? returnedId : null;
      const state = value.state;
      return {sessionId, valid: sessionId !== null && (state === 'Open' || state === 'Unavailable'), state};
    } catch { return {sessionId, valid: false}; }
  }
  function safeResult(value, ctx, frameId, sequence) {
    if (!isRecord(value)) return null;
    // Read only known fields once. Unknown fields/getters are never traversed.
    const {sessionId, frameId: returnedFrameId, sequence: returnedSequence, state: resultState, label} = value;
    if (sessionId !== ctx.sessionId || returnedFrameId !== frameId || returnedSequence !== sequence ||
        !resultStates.has(resultState) ||
        (resultState === 'Predicted' ? label !== 'Normal' && label !== 'Damaged' : label !== null)) return null;
    return Object.freeze({sessionId, frameId: returnedFrameId, sequence: returnedSequence, state: resultState, label});
  }
  function scheduleCadence(ctx) {
    if (!ctx.active) return;
    ctx.cadenceTimer = setTimer(() => {
      ctx.cadenceTimer = null;
      if (!ctx.active) return;
      // Check hard boundaries even when a browser delays timer delivery.
      if (now() - ctx.startedAt >= PARCEL_LIVE_LIMITS.lifetimeMs) return terminate(ctx, 'lifetime-limit');
      if (ctx.framePending) { dropped++; emitState(); }
      else if (attempted < PARCEL_LIVE_LIMITS.maxAttempts && now() >= ctx.nextCaptureAt) beginFrame(ctx);
      scheduleCadence(ctx);
    }, PARCEL_LIVE_LIMITS.cadenceMs);
  }
  function beginFrame(ctx) {
    if (!stillRunning(ctx) || ctx.framePending) return;
    if (attempted >= PARCEL_LIVE_LIMITS.maxAttempts) return terminate(ctx, 'frame-limit');
    let frameId;
    try { frameId = createId(); } catch { return terminate(ctx, 'invalid-capture'); }
    if (!stillRunning(ctx)) return;
    if (!isId(frameId)) return terminate(ctx, 'invalid-capture');
    const capturedAt = now();
    if (!stillRunning(ctx)) return;
    const sequence = ++attempted;
    ctx.framePending = true;
    ctx.deadlineTimer = setTimer(() => {
      ctx.deadlineTimer = null;
      terminate(ctx, 'frame-timeout');
    }, PARCEL_LIVE_LIMITS.frameDeadlineMs);
    emitState();
    // Keep the actual async task pending through abort/timeout. Never race it
    // against a timeout and forget its unsettled transport.
    void runFrame();
    async function runFrame() {
      let phase = 'capture';
      try {
        if (!stillRunning(ctx, capturedAt)) return;
        const captured = await capture({sessionId: ctx.sessionId, frameId, sequence, signal: ctx.abort.signal});
        if (!ctx.active) return;
        if (now() - ctx.startedAt >= PARCEL_LIVE_LIMITS.lifetimeMs) return terminate(ctx, 'lifetime-limit');
        if (now() - capturedAt >= PARCEL_LIVE_LIMITS.frameDeadlineMs) return terminate(ctx, 'frame-timeout');
        let bytes, capturedAtClient, payload;
        try {
          if (!isRecord(captured) || !Object.hasOwn(captured, 'payload')) return terminate(ctx, 'invalid-capture');
          ({bytes, capturedAtClient, payload} = captured);
          if (!Number.isInteger(bytes) || bytes <= 0 || bytes > PARCEL_LIVE_LIMITS.maxBytes || !isTimestamp(capturedAtClient)) {
            return terminate(ctx, 'invalid-capture');
          }
        } catch { return terminate(ctx, 'invalid-capture'); }
        // Decoding external getters can synchronously stop/dispose this
        // generation or consume its remaining time. Fence before transmission.
        if (!stillRunning(ctx, capturedAt)) return;
        phase = 'submit';
        const response = await submit({sessionId: ctx.sessionId, frameId, sequence, bytes, capturedAtClient, payload, signal: ctx.abort.signal});
        // The trusted adapter reserves at submission, after variable encoding
        // latency. A completion cooldown also bounds server claim cadence.
        ctx.nextCaptureAt = now() + PARCEL_LIVE_LIMITS.cadenceMs;
        if (!ctx.active) return;
        if (now() - ctx.startedAt >= PARCEL_LIVE_LIMITS.lifetimeMs) return terminate(ctx, 'lifetime-limit');
        if (now() - capturedAt >= PARCEL_LIVE_LIMITS.frameDeadlineMs) return terminate(ctx, 'frame-timeout');
        let result;
        try { result = safeResult(response, ctx, frameId, sequence); } catch { result = null; }
        // Never commit or allocate timers for a generation stopped by a getter.
        if (!stillRunning(ctx, capturedAt)) return;
        if (result === null) return terminate(ctx, 'invalid-result');
        completed++;
        lastResult = result;
        resultCapturedAt = capturedAt;
        if (ctx.ageTimer !== null) clearTimer(ctx.ageTimer);
        ctx.ageTimer = null;
        const age = now() - capturedAt;
        if (age < PARCEL_LIVE_LIMITS.resultMaxAgeMs) {
          ctx.ageTimer = setTimer(() => { ctx.ageTimer = null; if (ctx.active) emitState(); }, PARCEL_LIVE_LIMITS.resultMaxAgeMs - age);
        }
        if (result.state === 'Unavailable') terminate(ctx, 'unavailable', 'Unavailable');
        else if (result.state === 'Failed') terminate(ctx, 'submit-failed');
        else if (result.state === 'Stale') terminate(ctx, 'stale-result');
        else if (result.state === 'Expired') terminate(ctx, 'expired');
        else if (attempted >= PARCEL_LIVE_LIMITS.maxAttempts) terminate(ctx, 'frame-limit');
        const status = snapshot();
        emit({type: 'result', result, current: status.current, resultAgeMs: status.resultAgeMs});
        emitState();
      } catch { if (ctx.active) terminate(ctx, phase === 'capture' ? 'capture-failed' : 'submit-failed'); }
      finally {
        if (ctx.deadlineTimer !== null) clearTimer(ctx.deadlineTimer);
        ctx.deadlineTimer = null;
        ctx.framePending = false;
      }
    }
  }
  async function start() {
    if (disposed) throw new Error('Live session is disposed');
    if (context?.reconciliationRequired) throw new Error('Live session requires server reconciliation');
    if (context && (context.active || context.openPending || context.framePending || context.closePending)) {
      throw new Error('Live session is busy');
    }
    const ctx = {active: true, startedAt: now(), nextCaptureAt: 0, sessionId: null, reason: null,
      abort: new AbortController(), openPending: true, framePending: false, closePending: false,
      closeStarted: false, reconciliationRequired: false,
      lifetimeTimer: null, cadenceTimer: null, deadlineTimer: null, ageTimer: null};
    context = ctx;
    state = 'Starting'; reason = null; attempted = 0; completed = 0; dropped = 0;
    lastResult = null; resultCapturedAt = null;
    ctx.lifetimeTimer = setTimer(() => { ctx.lifetimeTimer = null; terminate(ctx, 'lifetime-limit'); }, PARCEL_LIVE_LIMITS.lifetimeMs);
    emitState();
    try {
      if (!ctx.active) return;
      let operationId;
      try { operationId = createId(); } catch { return terminate(ctx, 'invalid-open'); }
      if (!stillRunning(ctx)) return;
      if (!isId(operationId)) return terminate(ctx, 'invalid-open');
      let response;
      try { response = await open({operationId, signal: ctx.abort.signal}); }
      catch { if (ctx.active) terminate(ctx, 'open-failed'); return; }
      let opened;
      try { opened = readOpen(response); } catch { opened = {sessionId: null, valid: false}; }
      ctx.sessionId = opened.sessionId;
      if (!ctx.active) { requestClose(ctx); return; }
      if (!opened.valid) return terminate(ctx, 'invalid-open');
      if (now() - ctx.startedAt >= PARCEL_LIVE_LIMITS.lifetimeMs) return terminate(ctx, 'lifetime-limit');
      if (opened.state === 'Unavailable') return terminate(ctx, 'unavailable', 'Unavailable');
      state = 'Running';
      emitState();
      beginFrame(ctx);
      scheduleCadence(ctx);
    } finally { ctx.openPending = false; }
  }
  return Object.freeze({start, stop, snapshot, dispose});
}
