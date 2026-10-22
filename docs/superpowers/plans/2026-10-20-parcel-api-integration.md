# Authenticated bounded parcel API implementation plan

**Execution checkpoint:** Tasks 1 and 2 are implemented and independently reviewed; see [verification evidence](../../../research/PARCEL_API_IMPLEMENTATION_2026-10-20.md). Task 3 is also implemented and verified; see [backend guard evidence](../../PARCEL_BACKEND_GUARD_2026-10-20.md). Operational model acceptance and subsequent photo/live contracts remain unfinished. The unchecked steps below preserve the original plan; they are not the latest execution ledger.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare an authenticated, resource-bounded parcel inference transport using the validated MobileNetV2 adapter, with truthful readiness and abstention contracts, while preserving existing inventory/delivery interfaces and keeping operational parcel inference unavailable until acceptance is recorded.

**Architecture:** FastAPI authenticates and bounds incoming requests; a single admitted parcel request launches a disposable manager process. That manager uses the existing Windows `ResourceSupervisor` to run one inference worker, which calls `parcel_serving.predict_image`. The API terminates the manager on disconnect/deadline; Windows Job handle cleanup terminates its worker descendants. No TensorFlow or image decoder runs in the HTTP process.

**Tech Stack:** Existing Python/FastAPI/Uvicorn, Windows stdlib process/Job APIs, `runner_runtime.py`, OpenCV, TensorFlow/Keras MobileNetV2, existing Firebase trusted-command boundary.

**Spec:** [Parcel AI completion goal](../../PARCEL_AI_COMPLETION_GOAL_2026-10-20.md), [camera scope](../../PARCEL_CAMERA_SCOPE_2026-10-20.md), [account access](../../ACCOUNT_ACCESS_CONTRACT.md), [Prepared-Shipment Handover](../../PREPARED_SHIPMENT_CONTRACT.md).

## Global constraints

- This is a plan, not evidence of implemented API changes, a usable model, or permission to activate one.
- Work locally on MSI. Dot-source outer `Enter-IILAS.ps1`; use Node major 22, JDK 21 and `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe`.
- Keep MobileNetV2 primary and EfficientNetB0 comparator. Other AI development remains deferred; preserve current tabular interfaces.
- No training, downloads, active-model writes, production operations, deployment or publication in this increment.
- Preserve Admin/shared staff approval, IDs/balances, handover contracts and interface theme.
- Existing `parcel_serving.py` validates research artifacts; `artifact_ready` does not mean scientifically accepted or operationally approved.
- Inputs, request work directories and model/data artifacts remain ignored. Never write service tokens, image bodies or private absolute paths to HTTP errors or application logs.
- Existing training/evaluation source bindings must remain intact. Do not modify `runner_runtime.py`, `parcel_train.py` or `parcel_evaluate.py` merely to add API cancellation.
- Run Firebase suites sequentially only if a later task changes backend persistence/rules; do not start another emulator wrapper around running services.

## Verified current starting point

- `research/api.py:7` still imports legacy `vision.predict_image`; `:18` treats one file's existence as vision readiness. `:21` authenticates inside the endpoint after FastAPI may already have parsed its body.
- `research/parcel_serving.py:73` validates original completed research artifacts and held-out evidence. `:156` requires supervision before default inference, uses shared preprocessing and returns explicit `predicted`/`abstained` with `operationally_approved: false`.
- `research/runner_runtime.py:211` verifies real Windows Job membership. `:253` launches suspended, assigns the worker before resume, monitors resources, and terminates the Job. It has no public cancellation event.
- `backend/functions/service.mjs:523` has a 30-second HTTP deadline. `:525` accepts only Normal/Damaged parcel labels; `:531` saves results without examining `operationally_approved`.
- There is no `research/parcel_runtime.py` yet. This plan proposes it as a new HTTP-to-supervisor adapter; the existing resource implementation is `runner_runtime.py`.

## Review focus

1. Unauthorized/chunked oversized bodies must be rejected before JSON/image decoding or worker launch.
2. A disconnected or timed-out caller must not leave a hidden worker running or release the execution slot before descendants terminate.
3. Missing, tampered, synthetic or merely integrity-ready artifacts must never become an operationally approved prediction.
4. Late/foreign worker results and malformed probability/output envelopes must not be returned as current valid results.
5. Tabular requests must retain their existing labels/features/result semantics and authentication behavior.

## File responsibilities

| File | Change |
| --- | --- |
| `research/parcel_runtime.py` | New bounded request executor, manager/worker CLI, cancellation, output validation and cleanup. Import heavy ML modules only inside the supervised worker. |
| `research/test_parcel_runtime.py` | New tiny-process lifecycle tests; no TensorFlow or parcel model required. |
| `research/api.py` | Authenticate before body parsing, enforce body cap, preserve tabular routing, add truthful parcel health/error contract and invoke runtime only after operational admission exists. |
| `research/test_api.py` | HTTP/ASGI contract tests with in-process transport and injected runtime doubles; no real model or Firebase required. |
| `research/README.md` | Local startup, transport contract, limits, acceptance dependency and no FPS/quality claims. |
| `backend/functions/service.mjs` plus a small pure response validator/test | Later compatibility boundary: reject unapproved results and distinguish abstention; persistence/UI/schema changes are a subsequent reviewed task. |

## Response and admission contract

Preserve `POST /predict` with existing `kind`, `features`, `imageBase64` fields. Do not let callers supply filesystem/model paths, operational approval, or resource limits. Local server configuration selects the original selection/test directory; this task does not populate it.

Parcel successful transport envelope, when operational admission eventually exists:

```text
status: predicted | abstained
label: Normal | Damaged | null
confidence: finite [0,1], explicitly uncalibrated
probabilities: two finite normalized scores in Normal/Damaged order
model: MobileNetV2
modelVersion, evidenceSha256, selectionSha256, evaluationSha256: SHA-256
preprocessing, contrast, humanReviewRequired
requestId, processingTimeMs, totalProcessingTimeMs
operationally_approved: boolean from a trusted acceptance decision
```

Exact ties remain `abstained` with `label: null`; never coerce them to Normal or a service failure. The adapter's `processingTimeMs` currently excludes artifact validation; add separate total request timing rather than silently changing its meaning.

HTTP outcomes: 401 invalid/missing credentials when service authentication is configured; 503 authentication unconfigured; 413 body limit; 422 malformed input/base64/image; 503 model/acceptance/runtime unavailable or resource failure; 429 parcel slot busy with no waiting queue; 504 execution deadline. Worker output corruption is a sanitized 503. A client disconnect terminates work and produces no later response.

`GET /health` stays cheap and does not start ML workers or rehash the dataset on each poll. Preserve existing `models.inventory`/`models.delivery` booleans. Keep `vision: false` unless the full operational parcel gate is ready. Add a `parcel` object distinguishing `not_configured`, `unavailable`, `artifact_ready`, `busy`, and eventually `ready`, with `operationallyApproved` and an optional safe model digest. Expose no private paths, tokens or raw validation exceptions. Readiness snapshots must be timestamped and cannot replace validation during inference.

**Operational-acceptance dependency:** no accepted real model or acceptance protocol exists now. Keep production admission closed; do not add an `ALLOW_UNEVALUATED`, `FORCE_READY`, or arbitrary `approved=true` environment bypass. The later acceptance task must bind actual scientific/provenance review to the exact selected model, evaluation and intended photo/live use. Integrity-ready metadata alone never opens `/predict`. Transport success/abstention tests may inject an acceptance/runtime double in the test harness; production must have no test bypass.

## Task 1 — Disposable bounded execution

**Interface:** `ParcelExecutor.run(request_id, image_base64, configured_artifacts, cancel_event) -> result`, with typed busy/unavailable/timeout/invalid-input failures. Request IDs are server-generated UUIDs. One admitted parcel request at a time, no pending queue.

- [ ] Write failing tests for exclusive admission, successful tiny worker, timeout, disconnect cancellation, manager crash, worker/descendant cleanup, malformed/foreign output, cleanup on every outcome, and inability to select output paths outside the ignored request root.
- [ ] Add a Windows named mutex keyed by the repository path, acquired/released by the manager's same OS thread, so a second service process cannot accidentally multiply parcel execution. Admission is nonblocking; a losing manager returns busy without starting inference. Retain ownership until worker/descendant termination. Test abandoned ownership after a manager crash. Do not use a semaphore whose count can remain consumed after its owner crashes, or rely solely on an HTTP-process thread lock.
- [ ] Implement a request manager subprocess using only existing stdlib/runtime facilities. It constructs `ResourceSupervisor` with a fresh ignored directory below `research/datasets/parcel-api-requests/`; it launches a separate `_infer` worker. No training-phase registry claims are created.
- [ ] The worker verifies supervision before importing NumPy/OpenCV/TensorFlow, configures one CPU thread using the existing worker environment helper, reads the bounded input, decodes base64 strictly, and calls the existing adapter with no injected loader.
- [ ] Initial safety ceilings: 25 seconds total API parcel execution, 25 seconds manager wall/worker time, 2,048 MiB combined manager/worker RSS, 3,072 MiB initially available RAM, 768 MiB continuous available floor, 2 GiB free disk, 64 MiB request-directory output. These are fail-closed ceilings, not latency/FPS promises. Measure later; do not silently relax them to make a model pass.
- [ ] The HTTP parent uses asynchronous process waiting. On cancellation/deadline it terminates and reaps the manager. Existing Job kill-on-close must terminate the inference worker and descendants. Prove this through a real tiny subprocess fixture, not a mocked `kill()` assertion.
- [ ] Validate exclusive `response.json`: matching request ID, byte hash, model/evaluation hashes, allowed status/label and finite normalized probabilities. Never trust a stale file from another request; fresh directories and exclusive writes are mandatory.
- [ ] Delete only the known request input/output/log files after process termination, checking resolved containment first; remove the now-empty request directory. Preserve a compact sanitized failure summary only if needed, with no image bytes or credentials. Cancellation/crash cleanup needs a bounded startup sweep of abandoned request directories; do not recursively delete an unchecked path.
- [ ] Run `test_parcel_runtime.py` plus affected existing runtime tests. Record process/timing/resource evidence without fitting a real model.

## Task 2 — Authenticated HTTP boundary and truthful readiness

- [ ] Write failing ASGI tests for unconfigured token, missing/wrong token, malformed JSON, malformed base64, missing/empty image, oversized Content-Length, oversized chunked body, and auth rejection before the body is consumed.
- [ ] Authenticate `/predict` in middleware before FastAPI/Pydantic body parsing; retain constant-time token comparison. Limit streamed JSON request bytes to 14,100,000, including envelopes, independently of Content-Length. Retain `imageBase64` field length limit and decoded 10 MiB limit.
- [ ] Configure documented local startup with one Uvicorn worker and `--limit-concurrency 4`; the manager's cross-process parcel mutex remains the second boundary. Bound body residency and execution separately. Keep literal loopback host and do not expose a browser CORS/token path.
- [ ] Keep tabular dispatch unchanged after authenticated validation. Tests assert inventory/delivery inputs arrive unchanged and existing result fields remain unchanged.
- [ ] Remove parcel dispatch to legacy `vision.predict_image`; connect the new executor behind the closed operational-admission gate. Missing configuration, artifact failure or absent acceptance returns sanitized 503; no synthetic fallback.
- [ ] When original artifact paths are configured, obtain the initial readiness snapshot through the same bounded manager in audit-only mode. Audit calls `parcel_serving.audit` and never loads TensorFlow; timeout/failure means unavailable. Reuse the immutable configuration snapshot for cheap health reads, while inference still validates actual artifacts again. An artifact change invalidates a subsequent request; a prior health snapshot is never admission authority.
- [ ] Add tests for current no-model health, artifact-ready-but-unapproved health, unavailable operational prediction, busy/timeout mapping, and successful predicted/abstained envelopes through injected test runtime. Tests must prove unapproved output cannot be emitted as an operational prediction.
- [ ] Add disconnect test proving the HTTP cancellation signal reaches real manager termination; do not let `asyncio.to_thread` cancellation leave `ResourceSupervisor.run` alive in an abandoned thread.
- [ ] Run API/runtime/serving tests. Prefer existing ASGI facilities; if `httpx` is absent, use a small direct ASGI harness instead of installing dependencies for these tests.
- [ ] Update research README with fields, startup limits, unavailable behavior and acceptance dependency. Do not configure/start an operational model service as part of implementation.

## Task 3 — Backend compatibility guard before any successful activation

This task is required before returning any operational parcel result to the existing application. It does not add stage/live persistence.

- [ ] Extract/test a small parcel response validator: exact model identifier, 64-hex model/evidence/evaluation hashes, returned evidence hash equals registered bytes, permitted status/label pairs, finite scores/timing, mandatory review, and explicit trusted operational acceptance. Reject unapproved or missing approval fields for parcel only; preserve tabular compatibility.
- [ ] Define an explicit abstention result at the backend boundary. Until prediction/UI schemas support it, return a clear recoverable `failed-precondition`/review-required outcome without creating a Normal prediction. Do not present this temporary behavior as completed photo integration.
- [ ] Add pure tests for mismatched evidence/model version, non-finite scores, ties, missing approval, declared approval from the wrong pinned model, unsupported status, and unchanged tabular behavior.
- [ ] Recheck Driver assignment after inference in the final transaction, in addition to existing account approval/role and evidence-version checks. Test reassignment/revocation during a delayed service response.
- [ ] If persistence/schema changes are required here, stop treating it as pure transport: update contract/client/rules/emulator suites together and run all affected checks sequentially. Do not mix unrelated stock/handover changes into it.

## Subsequent core tasks and explicit dependencies

- **Operational acceptance:** freeze the real-data protocol and quality criteria, run reviewed real MobileNetV2/EfficientNetB0 development/evaluation, then record human acceptance bound to exact hashes. Decide how trusted acceptance evidence is represented before opening production-path admission. Photo acceptance does not certify live-session quality.
- **Stage-aware photo integration:** implement pre-dispatch/delivery-stage roles consistently in UI, Storage and trusted commands; retain legacy stage truthfulness. Persist request identity/idempotency, source/stage/capture times, result/model/evidence hashes, timings, failed/unavailable/abstained states and review.
- **Live sampling:** add session/frame identity and captured timestamps to the trusted application contract, one frame in flight, stale-result invalidation, stop/access-loss cancellation and bounded retention. API request ID is correlation only; it cannot certify shipment access or freshness.
- **Performance:** this first executor loads/audits in a disposable worker. It establishes safe one-shot transport, not sustained camera throughput. Measure cold request timing before choosing a persistent supervised worker or a sampling rate. A warm worker requires its own artifact invalidation, lifecycle and session tests.
- **Physical acceptance:** real MSI/phone camera sessions, visibility failures, quality, latency, dropped/stale frames, interruption/recovery and resource measurements remain mandatory.

No implementation, model activation, download, data change or production action is performed by saving this plan.
