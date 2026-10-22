# Bounded parcel worker integration — 22 October 2026

The measured reuse primitive loads once in6.99s and predicts two fixed validation images in0.45s/0.31s. Integrate that mechanism with the existing request flow; do not introduce an unbounded daemon or change scientific acceptance. The user has authorized completing the parcel feature and necessary local implementation. Execute reversible internal work without another permission loop. No deployment, production mutation, Git publication or other-AI work.

## Binding design

- Preserve the existing adapter/runtime/API/scientific sources and descriptor41be. Add separate modules and an explicit server factory; the original cold path and all historical evidence stay intact.
- Keep native `parcel_limits()` exactly:25s Job/request ceiling,2GiB aggregate worker resources,3GiB startup admission,768MiB running floor, one CPU/thread and existing disk/output caps.
- Cache retirement target is20s from parent creation, idle timeout12s, and at most12 frames. Reuse is admitted only before cache age15s, reserving5s before the retirement target. The first frame is committed before loading and may finish under the original25s limit even if startup crosses20s; then retire immediately. No automatic retry of an ambiguous inference.
- One request in flight, zero queue. A cache is one original request UUID/directory/outer Job, one unchanged synchronous manager and one supervised model worker. Native25s containment remains independent of async timers. Idle expiry, cancellation, failure or shutdown terminates/drains before replacement and deletion.
- Hold existing shared GPU/scientific `exclusive_job()` leases for the whole cache lifetime; keep them on uncertain drain/cleanup. Reuse the old manager admission, `_ProcessJob`, `_reap` and bounded `_cleanup`; do not copy those implementations.
- Startup audit remains metadata-only. A model starts on the first admitted `run`, never merely because the currently closed HTTP app starts. Keep both API admission functions false and backend pins null.
- The new factory composes `api.create_app()` with a warm executor and lifespan `aclose`; it never patches a gate/validator or adds a positive bypass route. Old API/source hashes remain unchanged. Actual positive runtime verification precedes intended-use acceptance; closed HTTP remains503 meanwhile.

## Files / owners

1. Worker/protocol agent: new `research/parcel_warm_protocol.py`, `parcel_warm_worker.py` and their tests.
2. Parent: new `research/parcel_warm_runtime.py` and its tests.
3. Factory agent: new `research/serve_parcel.py` and its tests.
4. Fresh review: exact interfaces, lifecycle, races and real verification before completion.

No edits to `parcel_warm_model.py`, `parcel_runtime.py`, `parcel_gpu_serving.py`, `api.py` or scientific sources are needed. All new code is separately pinned by a new local bundle; the old descriptor does not certify new modules.

## Exact protocol shared by implementations

`parcel_warm_protocol.py` exports:

- `policy()`: exact fixed policy above plus `native_limits=asdict(parcel.parcel_limits())`, `operationally_approved=False`.
- frozen `WarmBundle(path, sha256, artifacts, bindings)`; `artifacts` is the existing `ParcelGPUArtifacts`, `bindings` are the existing three identity fields.
- `load_bundle(path:Path, expected_sha256:str) -> WarmBundle`, verifying bounded strict JSON, fixed policy, descriptor41be, current original code bindings and exactly these five current source hashes: `parcel_warm_model.py`, `parcel_warm_protocol.py`, `parcel_warm_worker.py`, `parcel_warm_runtime.py`, `serve_parcel.py`. Re-read before/after actual work. No heavy imports/model bytes or research traversal.
- `create_bundle(output, descriptor_path, descriptor_sha256)`: exclusive ignored metadata output, all current code frozen; no replacement.
- `temporary(directory)`: existing validated request directory's canonical `tmp`, reject links; `read_json(path, limit)` uses existing bounded strict adapter reader.
- `write_json(path, value, limit)`: exclusive `.part` then Windows no-overwrite rename, bounded canonical known file within request/tmp; no overwrite of pending data. Files are `ready.json`, `slot.in.json`, `slot.out.json`, `stop.json`. All remain below existing bounded tmp cleanup.
- `frame_request(request_id,image_base64,artifacts)`: original strict GPU request dict (`requestId, mode='predict', imageBase64, evidenceSha256, bindings, artifactKind, descriptor, descriptorSha256`). No new approval field.
- `frame_envelope(cache_id,bundle,request)` and `parse_frame(envelope,cache_id,bundle)`: exact keys `schema_version=1,kind='parcel_warm_frame_v1',cacheId,bundleSha256,request`; reject foreign/mixed fields, invalid UUIDs, identity/evidence drift and oversized images. `parse_frame` returns the original request dict after validation.

Initial root `input.json` is the first original frame request. Cache ID equals its requestId and directory UUID. The worker handles it exactly once, then handles later frames only from `tmp/slot.in.json`. It does not reread root input as a new frame.

Worker `ready.json` exact keys: `schema_version=1, kind='parcel_warm_ready_v1', cacheId, bundleSha256, bindings, operationally_approved=False`. Emit after context load, before first prediction.

Worker `slot.out.json` exact keys: `schema_version=1,kind='parcel_warm_result_v1',cacheId,bundleSha256,requestId,result`. `result` is the unchanged17-field prediction plus requestId, or `{error:'unavailable',requestId}` on failure. Parent validates successful result through unchanged `parcel._validate_result` against the exact original frame request. An error cannot become Normal.

Stop exact keys: `schema_version=1,kind='parcel_warm_stop_v1',cacheId,bundleSha256`. Stop is not permission to delete before drain.

Parent acknowledges by deleting `slot.in.json` FIRST (when present), then `slot.out.json`. Worker never processes input while output exists. This order prevents replay of old input. No next input may be written until both slots are absent. Keep only bounded per-cache UUID history; duplicate request IDs fail.

Worker uses `worker_environment(directory)` before importing/using the reuse model. It checks bundle/source identity before/after load and each prediction, serializes frames, keeps per-frame image/hash/full-state checks, and closes acquired context on every normal/error path. Worker exits after bounded idle/age/frame count or stop. First committed frame is processed once; stale/retiring worker never consumes a later frame. Manager entry calls unchanged `parcel.manage(...worker_command=...)`, limits unchanged.

## Runtime/factory interfaces

`WarmParcelExecutor(bundle_path, bundle_sha256, *, manager_command=None)` matches existing `busy`, `audit(artifacts,cancel_event=None)`, `run(request_id,image_base64,configured_artifacts,cancel_event=None)` and adds `aclose()`. Command injection remains Python-only for small process fixtures. No HTTP input controls it.

Root `input.json/owner.json` use existing exclusive writes and minimal child env, suspended assignment/resume and native controls. Watcher must remain live while cache is retained, retire idle workers and reap terminal managers. `.run` cancellation shield-awaits drain; no replacement while old outcome/drain unknown. `aclose` is idempotent and waits for actual cleanup. Cleanup uncertainty keeps leases and blocks subsequent work.

Factory `serve_parcel.create_app(bundle_path=None,bundle_sha256=None)` obtains explicit arguments or the complete server-owned `IILAS_PARCEL_WARM_BUNDLE`/`IILAS_PARCEL_WARM_BUNDLE_SHA256` pair. Validate bundle first, then capture its GPU descriptor via the existing API config during construction. Reject conflicting existing legacy/GPU config; never change files, print credentials or grant approval. Set `app.state.parcel_executor=WarmParcelExecutor(...)` before lifespan and wrap existing lifespan with finally `await executor.aclose()`. CLI binds only127.0.0.1 with caller port, requires existing token in env; no auto-install/download/production.

## Verification sequence

- [ ] Meaningful RED/GREEN protocol/worker/controller/factory tests, especially duplicate/replayed slots, cache expiry, source drift, no queue, cancellation, timeout, unknown cleanup and shutdown.
- [ ] Native lifecycle fixtures on normal Windows host (`require_escalated` for asyncio); no duplicate invocation while original session live. Sandbox socketpair hangs must be reconciled by verified owned PID, not assumed terminal.
- [ ] Independent cross-component review and source freeze; create fresh source-pinned local bundle.
- [ ] Parent-only one real-model run across TWO distinct request UUIDs through one retained worker, exact old VALID probabilities, measured cold/warm end-to-end timing and resource peak, then zero Job members/stock cleanup/lease absence. No TEST/train/cache purge.
- [ ] Real factory loopback HTTP startup/auth/closed gates/shutdown; neither a positive double nor internal `.run` proves public-route acceptance.
- [ ] Appropriate affected regressions and secret/diff/ignored-data checks; update roadmap/handover with exact scope and limits.

Completion of this plan is bounded worker integration only. Full parcel goal still requires intended-use photo/live quality, actual camera/browser/device evidence and justified separate acceptance. Preserve public-only data, human review, live Current<15s and all other project constraints.

## Actual verification amendment — implementation now in verification

Latest checkpoint: the separate120s profile and revised observer below are implemented and independently reviewed.41 targeted production-module fixtures and11 artificial observer checks pass. Full isolated run44modules/819tests failed one runtime case;43 other modules and a separate26-test diagnostic rerun passed, original cause unknown. Bundle03 actual same-worker reuse and real factory HTTP02 both completed and passed independent result audits. Cold/warm phases18.149s/5.604s preserve exact old VALID outputs; forced137 shutdown has confirmed zero members/stock cleanup/lease absence. See the warm report for pins and scope. Historical proposed/unimplemented wording below is superseded. The unresolved full-suite failure, positive real-model application transport, independent intended-use quality and physical-device evidence remain explicit limitations.

The original profile was implemented and passed the complete isolated research suite (44 files,812 top-level tests). Real attempts01/02 remain failed and preserved. Attempt01 exposed idle retirement during active loading; the reproduced correction passes. Attempt02 returned two exact CPU results through different cold Jobs: the first request plus metadata/IO left the15s reuse window before the next request. Its observer also collided with its first capture directory; independent native/process checks and an explicit evidence-preserving stock cleanup reconciled its files/empty leases. See `research/PARCEL_WARM_WORKER_2026-10-22.md` for the full limits and receipts.

The next implementation needs a separately declared warm-worker profile, rather than another blind attempt under the original short lifetime. This amendment is prospective; the current code/bundle02 still implements the original25s profile.

1. Keep the original cold `parcel_limits()`, descriptor, API and scientific sources unchanged. Preserve frozen five-source snapshots for bundles01/02 and both failed request directories.
2. Define a new explicit warm-worker profile:120s maximum native worker/manager lifetime,110s retirement target,90s reuse admission,12s genuinely idle timeout and12 frames maximum. Preserve25s per-request deadlines, one in flight/zero queue,2GiB aggregate worker RAM,3GiB startup admission,768MiB running floor, one CPU/thread and existing disk/output limits. Apply the new lifetime only through the warm manager's explicit limits argument; the original cold path remains25s. Source-pin this distinction in a fresh bundle. Review before execution; a longer worker maximum is not proof of a120s camera workflow.
3. Replace worker hardcoded lifetime values with the exact new policy. Retain the immediate post-decode reuse-age check, active-versus-idle distinction, per-frame full model integrity, serial identities, no ambiguous retry, shutdown and confirmed drain. Add artificial/native boundary tests for90/110/120 separately from25s request timeout. Do not increase the live freshness threshold.
4. Create a NEW ignored measurement harness revision. Use per-cache UUID capture directories so an unexpected rotation cannot collide with earlier captures. Observation failures must be recorded without interrupting original native reap or stock cleanup. Preserve all attempts and source hashes. Save each returned measurement before the same-cache assertion, so a failed reuse claim retains its complete first-phase evidence. Test these diagnostic failures with artificial fixtures before freezing.
5. Independently review the profile, tests and prospective new bundle/request, then make one separately qualified default-worker attempt on the same fixed exposed VALID input with two distinct request IDs. Measure cold/warm whole-request times separately, report sampled resources and forced versus graceful shutdown honestly. No TEST/training/cache clearing or operational activation.
6. Update the existing ignored factory-HTTP probe to pin the reviewed fresh bundle, preserving its previous source and prospective review. Verify real factory startup/auth/closed routes/shutdown only after the model/lifecycle proof and resource admission. Keep both operational gates closed pending separate intended-use acceptance.

All work above remains core parcel work under the existing authorization. The resource-profile distinction must be explicit in code, reports and reviews; never relabel it as unchanged whole-worker limits. Other AI models, production and additional features remain deferred.
