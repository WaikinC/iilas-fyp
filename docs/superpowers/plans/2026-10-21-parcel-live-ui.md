# Parcel live camera interface implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans; preserve observed red/green and independent review.

**Goal:** Connect explicit foreground camera sessions to trusted recoverable frame commands while retaining the existing manual-photo workflow.

**Architecture:** A pure same-tab recovery/transport adapter serialises actual pending work and maps verified server records to the tested controller. A focused camera component owns tracks/preview/retained image URLs. Connection to EvidenceUpload waits for actual handler review/emulator verification.

**Tech stack:** Current React/TypeScript/Firebase browser SDK, pure JS/declarations, Node tests and existing Playwright/Edge.

**Spec:** `docs/superpowers/specs/2026-10-21-parcel-live-ui-design.md` plus parent live/server specs.

## Global constraints

- Existing controller limits:120000ms/12attempts/one in-flight/no queue/5000ms start and post-submit cooldown/60000ms frame deadline/15000ms current age; JPEG<=960px/1MiB.
- Preview transmits nothing; explicit retained-sample/shared-read disclosure before Start; no continuous video/audio/automatic training/session aggregate.
- Persist only8minimal identity/context fields; originalstage retained, no bytes/hash/time/config/results. Same IDs through uncertainty; no implicit retries/replacements.
- Distinct real live pin/Python gate closed, no model activation. Other AI/extras and all sealed research/147testpixels untouched.
- Current role/stage/approval and remount fences, navy-purple/eight cards/manual photos/Admin/IDs/balances preserved; no production/push/deploy.

## Review focus

1. Lost start after dispatch/reload replays original stage/UUID rather than new input.
2. Same actor changes shipment or remounts while raw promise/encoding is pending: replacement remains blocked.
3. Lost reserve/analyse/stop acknowledgement keeps IDs and stops; explicit resolve can recover without bytes/re-execution.
4. Busy from another tab has fixed blocker from another shipment, never becomes own active session.
5. Media permission/encoding/result arrives after hidden/context change: no upload/current result/intent clearing.

## Task 1: Adapter and camera component fixtures

Create `lib/parcelLiveClient.js`, `.d.ts`, `scripts/parcel-live-client-qa.mjs`, `src/features/operations/ParcelLiveCamera.tsx` and browser fixtures/test runner as needed; extend capture CSS without altering existing appearance. Actual evidence composer stays disconnected in this task.

- [x] Define exact adapter signatures/declarations; TDD five review-focus groups plus payload exclusion, malformed storage/DTO, raw pending ownership, stage/role and review version/canonical encoding bounds; preserve red before implementation.
- [x] Implement adapter, then controller/capture/media lifecycle component and external-fixture browser tests. Run focused tests, strict types, lint and desktop/mobile synthetic browser; independently review both transport and media ownership before connection.

## Task 2: Actual application connection and regression verification

Modify `EvidenceUpload.tsx` only after server handler review+actual emulator checks pass. Keep manual Start camera/file controls; offer separate live preview and mutually exclusive media modes. Use canonical workspaceCommand adapter/current scope, no bypass.

- [x] TDD/verify actual Warehouse Prepared/assigned Driver Delivery versus proof/View-only, closed-pin Unavailable with zero frames, lost-response/reload/check/stop, scope/stage/context transitions and preserved manual photo workflow.
- [x] Run affected Node/server/emulator original suites sequentially, build/lint/security/history/ignore/research seals, desktop320px actual browser and independent integration review. Document real local findings/limitations, not accepted AI.

## Task 3: Completion boundary

- [x] Update README/roadmap/access/evidence contracts/handover and full goal with actual workflow/evidence. Keep unaccepted model, public data gaps, unopened147testcandidates and physical-camera quality/latency/resources outstanding until proven. Production remains unauthorised.

Software plan verified on 21 October. Client26focused cases, parent28synthetic browser groups,12actual-app workflow checks and five native history checks pass. Two reviewed P2 defects (older history unreachable; repeated selection clearing retained frames) have observedred/green and final independentreview02. UI freeze04 hashes match; final build03/lint03 pass, original seven suites passed sequentially, credential checks and preservation05 pass. All1,238baseline documents unchanged. See docs/PARCEL_LIVE_FOUNDATION_2026-10-21.md. This completes the software plan, not the full evaluated photo/live goal; real model pins stay null.

Existing bounded encoder has28owned+23independent tests and synthetic browser real-JPEG checks; controller and pure server/API units are separately reviewed. Do not redo or substitute these proofs for actual interface/server sessions.
