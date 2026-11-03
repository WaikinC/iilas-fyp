# Local experimental parcel integration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Do not stage/commit/push.

**Goal:** Run the frozen MobileNetV2 through existing IILAS photo/live screens on MSI emulators for truthful, human-reviewed experimental testing.

**Architecture:** Add a local-only false/null experimental service and backend capability. Reuse the unchanged warm runtime and existing app lifecycle; preserve operational default denial and exclude experiments from operational decisions.

**Tech stack:** Existing React/TypeScript, Node22, Firebase emulators/JDK21 and Windows research Python/TensorFlow/OpenCV. No stack change.

**Spec:** [PARCEL_LOCAL_EVALUATION_2026-10-22.md](../../PARCEL_LOCAL_EVALUATION_2026-10-22.md). The direct user selection of local MSI/emulators approves the bounded design. Earlier handover camera deferral is superseded for this local test only.

## Execution status — 22 October 2026

Task1 and Task2 source work and independent reviews are complete. Task3 local software integration/handoff is verified: actual registered-photo model/browser path, sequential emulators, real browser recovery, native cleanup, desktop/320px, build/lint/secret checks and saved restart/usage guidance. Physical-camera/device and independent intended-use evaluation are deferred at the user's instruction and remain outside this completed integration step; the full parcel AI goal is incomplete. Actual-model photo evidence must not be relabelled as real-camera/live-frame evidence.

Task4's earlier application-only checkpoint was published as25680a2b991b797f5aad3e79ae5cfcca0b4aec00; the user excluded this new integration from publication. Current integration remains unstaged/uncommitted/unpushed. Preserve all source and ignored evidence; do not delete this plan's workspace or claim full scientific acceptance.

## Global constraints

- Literal127.0.0.1 frontend5173; Auth9099/Firestore8081/Storage9199; configured project/Admin identity, internal authentication and server-owned manifest. No production/deploy or another emulator instance.
- Frozen model, preprocessing, tie rule and scientific evidence; no training or consumed TEST. Do not edit any original pinned Python source or historical bundle.
- Truthful `evaluationKind:'local-experimental'`, actual manifest hash, false operational approval, null acceptance; exact operational validation unchanged.
- Preserve all access/stage/snapshot/lease/reciprocal review/retention and native resource/session limits from the spec. Keep test data/private configuration/weights outside Git.
- One implementer at a time; source/task package plus fresh scoped review after each task. Record rulings, RED/GREEN logs and verification under ignored outputs/parcel-local-eval-20261022. Do not repeat dataset acquisition/reviews as an execution gate.

## Review focus

- Nonlocal/missing emulator configuration and client-controlled marker fields cannot grant authority.
- Wrong model/manifest/source/policy and true/nonnull worker responses reject without a fabricated certificate.
- Every experimental result remains visibly experimental after reload/human acceptance and cannot become dashboard/verification authority.
- Failure, cancellation, expiry, stale results and shutdown retain evidence and drain native ownership.
- Real device testing is distinct from fixtures, public benchmark scores and independent intended-use accuracy.

## Task1 — Add the local service/manifest contract

- [x] Inspect the runtime design audit and exact original bundle03/descriptor bindings; preserve source hashes and current worktree state.
- [x] Write focused failing tests in new `research/test_parcel_local_eval.py` and `research/test_serve_parcel_local_eval.py` for the spec, using artificial executors/results and no model/pixels.
- [x] Run RED; confirm failures express the missing local-only capability/response/lifecycle, not missing unrelated packages.
- [x] Implement new `research/parcel_local_eval.py` and `research/serve_parcel_local_eval.py`, with a versioned manifest preparation/load command. Use the exact current server model bindings from the original warm bundle, not invented hashes. Define the manifest schema and wire branch in the local spec as implemented. No original API/core edits.
- [x] Run GREEN and affected original API/live/factory tests. Capture source/artifact preservation and default/unconfigured closure.
- [x] Prepare source/diff/test package and obtain independent spec/code review. Resolve findings with scoped reruns before Task2.

## Task2 — Trusted emulator path, safe public schema and existing UI

- [x] Read the backend audit, Task1 manifest/wire contract and canonical shared schemas. Add failing tests for the local capability, false/null photo/live responses, trusted replay/review fencing, strict production rejection, projection roundtrip and dashboard/verification exclusion.
- [x] Implement server-only `backend/functions/parcelLocalEvaluation.mjs` and, if needed, a separate strict response helper. Load a server-owned ignored local manifest and exact SHA; never accept a request flag. Match the full emulator tuple and Admin project/bucket identity.
- [x] Extend canonical `lib/parcelAnalysis.js`/`.d.ts` and `lib/parcelLive.js`/`.d.ts` with the explicit discriminated experimental model branch. Keep accepted branch requirements unchanged. Regenerate backend copies through prepare-functions; do not hand-edit generated copies.
- [x] Integrate the separate branch into trusted photo/live claim/complete/resolve/review and service prediction fallback. Preserve all original context and failure/recovery rules. Assert no direct client-write or private-read rule widening; add affected negative emulator cases.
- [x] Update `ParcelAnalysis.tsx`, `ParcelLiveCamera.tsx`, `ResearchVerification.tsx` and dashboard consumers so markers persist after human review/reload and experiments never drive operational alerts/verification. Reuse existing layouts/routes; no new portal.
- [x] Run Node/shared/client/consumer tests and build/lint. Prepare exact diff/test package and independent review; resolve findings.

## Task3 — Local launch and real positive integration verification

- [x] Add a documented local preparation/start workflow using the existing toolchain and manifest generator; preserve different existing private configuration and never print tokens. Add exact ignore entries for generated local configuration. Use existing API URL/port where safe; report any required incompatible existing value rather than overwrite it silently.
- [x] Verify local port/process/resource state; reuse or start one emulator set only. Preserve baseline IDs/balances and the historical export; fixtures use new local-only test IDs.
- [x] Run affected and required Firebase suites sequentially via direct scripts, then appropriate isolated research checks/build/lint/secrets/diff. Do not rerun passing suites without a new change/concern.
- [x] Generate the actual versioned manifest after reviewed code, start the loopback-only experimental service, and run one positive request with an exposed development image. Preserve raw response lineage/timings and clean failure evidence; never reinterpret this as model accuracy.
- [x] Verify a real trusted emulator-to-service-to-browser photo result and both desktop/narrow UI states. Verify experimental outputs remain excluded from operational consumers.
- [x] Open the local app for the user; provide precise shipment/stage/photo/camera steps. Actual real-camera evaluation needs the user's ready parcels and deliberate Start action. Capture actual device evidence only then; report functional versus statistical scope honestly.
- [x] Independent whole-change review; update user-facing README, local contract, roadmap/setup/handover with actual results and limitations. Leave the original complete parcel goal unachieved if real-camera/independent quality evidence is still missing.


## Task4 — Publish verified application source (new direct user instruction)

The user additionally requested the application code on GitHub to develop other features on another laptop. This explicitly authorises an ordinary source commit and push by the parent after verification; the earlier no-stage/commit/push restriction still applies to workers and is superseded for this publication step only.

- [ ] Inventory tracked/new nonignored source and review the final changes; exclude private configuration, data, weights, captures, test records, logs/exports, local manifests and recovery archives. Include reusable software fixtures only, without real records or images.
- [ ] Finish relevant code checks and independent review before staging. Run expanded source, staged-content and reachable-history credential scans plus diff checks. Preserve the protected model/runtime byte identities.
- [ ] Commit the source in the application checkout only. Fetch/recheck the existing private origin; publish to main only by a normal fast-forward, never force or copy old history. If remote main advanced, preserve it and reconcile deliberately.
- [ ] Verify the exact remote commit and report the repository/commit and other-laptop development guide. Do not publish the outer workspace/report/private bundle or deploy anything.
