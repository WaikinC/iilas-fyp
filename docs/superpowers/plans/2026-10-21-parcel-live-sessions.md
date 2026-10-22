# Parcel live sampled-frame sessions implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execute tasks in order; retain incomplete tasks, evidence and review rulings.

**Goal:** Implement genuine bounded, traceable live camera analysis, then verify software and intended-use evidence without mistaking photo acceptance for live acceptance.

**Architecture:** Separate a pure foreground controller from browser capture and trusted session/frame commands. Its injected adapter provides server identity and admission; the controller limits local sampling, rejects stale results and fences cancellation. Wire into the existing stage-aware interface only after the trusted contract is verified.

**Tech stack:** React/TypeScript, existing Firebase Functions/Firestore/Storage, Python OpenCV/TensorFlow MobileNetV2 pipeline; Node built-in tests and existing Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-parcel-live-sessions-design.md`.

## Global constraints

- Foreground only; 120000 ms lifetime, 12 attempted frames, 5000 ms minimum capture-start cadence and post-submission cooldown, one capture/submission in flight, zero queued frames.
- JPEG 960px maximum long edge, 1 MiB maximum, 60000 ms local frame deadline, results historical at age >=15000 ms.
- Explicit start/stop; abort and generation fencing; no automatic retries, replacement operations or session condition aggregation.
- Separate trusted live acceptance; registered-photo acceptance never grants live use. No production/model activation.
- Preserve shared roles/stages/Admin/IDs/balances/handover/navy-purple eight cards, all research seals and unopened 147 candidates; other AI/extras deferred.
- Node22.13+ within22/JDK21; npm.cmd; current dirty authorised checkout, no push/deploy/history copying/private artifact tracking.

## Review focus

1. Stop during unresolved open then late valid session: close it without starting any frame.
2. Aborted transport that never settles: no replacement work and no overlapping start.
3. Fresh displayed result without later frames: age timer revokes current status at exact boundary.
4. External callback throws or returns malformed sensitive data: safe cleanup and no payload/error leakage.
5. Close loses its acknowledgement: distinguish local stop from server confirmation; do not permit real adapter replacement before reconciliation.

## Task 1: Pure foreground session controller

Files: create `lib/parcelLiveSession.js`, `lib/parcelLiveSession.d.ts`, `scripts/parcel-live-session-qa.mjs`.

Interfaces: exact options/methods/events/limits in spec. No Firebase/React imports, no image/string persistence or unbounded queue. A frame covers capture and submit in one in-flight slot; retain pending work through timeout until transport settles. Only one current safe lastResult.

- [x] Write controlled-promise/fake-clock tests for all five review-focus cases plus cadence/backpressure, lifecycle/resource/identity/null-label limits and stop/dispose/context-equivalent reasons.
- [x] Run `node --test scripts/parcel-live-session-qa.mjs` and preserve observed failing output before implementation.
- [x] Implement controller and declarations, safe allowlisting and monotonic timers per spec.
- [x] Run focused tests, focused lint and strict declaration checking, independently review with adversarial probes, fix concrete findings and rerun affected checks.

Task1 locally verified:83owned+17independent tests pass; independent additional28probes pass. Parent independently reproduced first review failures and final100pass. Three getter/UUID-callback stop-fencing defects resolved with observed red/green; focused lint and strict declarations/consumer pass. See ignored `outputs/parcel-live-sessions-20261021/task1-report.md` and `controller-review-round2-*`. This pure controller is not connected to the application/server/camera and grants no model acceptance.

## Task 2: Trusted live-session/frame protocol and commands

Files anticipated: new focused `backend/functions/parcelLive.mjs`, pure live record validators/declarations/tests; integrate `service.mjs`, `prepare-functions.mjs`, Firestore/Storage rules as required. **Before code**, add a focused server spec defining retained image evidence versus ephemeral bytes, durable start/frame/stop recovery, exact DTOs/claims/leases, independent authority snapshots and live admission. Task 1's adapter is the boundary, not permission to reuse photo acceptance.

- [x] Resolve retention and exact server contract in a focused spec/plan, using read-only independent review.
- [x] TDD strict inputs, role/stage/assignment/authority/races, immutable operations, budget enforcement, stopped/expired finalisation, unavailable before I/O and separate intended-use acceptance.
- [x] Implement actual trusted commands/rules with no photo/tabular regression; verify real emulator scenarios sequentially and independent review.

## Task 3: Camera acquisition and actual app adapter

Files anticipated: new focused live component/adapter, `ParcelCamera.tsx` or separate camera component, `EvidenceUpload.tsx`, existing capture CSS and scoped subscriptions. Follow Task 2's exact verified server DTOs.

- [x] TDD adapter encoding/bounds/start/frame/close recovery and live UI with synthetic media; preserve explicit preview versus transmission, current/historical age, interruption, role/stage changes and mobile controls.
- [x] Integrate real commands only after Task 2; never show simulated condition or treat server Unavailable as Normal.
- [x] Verify actual local app/browser and required original scenarios/build/lint/security/preservation; update README, roadmap and relevant access/evidence contracts together.

Tasks2/3 software verified21October: backend71focused/52native groups; client26cases; parent28synthetic groups;12native-app workflow+5native history groups; seven original sequential regressions; final build03/lint03, credential checks and preservation05 pass. Two history/selection P2 findings fixed with observedred/green and independent final review02. All1,238baseline documents unchanged. See docs/PARCEL_LIVE_FOUNDATION_2026-10-21.md and docs/PARCEL_LIVE_SERVER_2026-10-21.md. These software tasks do not complete Task4 or open real acceptance.

## Task 4: Intended-use evaluation and completion audit

- [ ] Fix relevant physical-parcel/session evaluation protocol and scientific acceptance separately from client resource policy; keep related views/frames together.
- [ ] Obtain appropriate independent evidence without violating public-only/licence constraints or retuning on reserved tests; report any collection dependency.
- [ ] Measure actual device/session condition quality, visible-face limits, latency, age, drops, interruption/recovery and CPU/RAM before claiming supported operation.
- [ ] Audit full photo/live goal requirements; unavailable software workflow is insufficient. Never relax acceptance to claim completion.

Each task is a reviewable deliverable, not the full goal. No automatic commits/push: keep existing authorised work and ignored evidence intact. Remaining tasks must continue after Task 1, without redoing completed research experiments.
