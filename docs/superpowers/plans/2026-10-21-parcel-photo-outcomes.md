# Stage-bound parcel photo outcomes implementation plan

Status: Tasks 1–4 implemented and locally verified; see `docs/PARCEL_PHOTO_OUTCOMES_2026-10-21.md` and the plan ledger. This closes the photo request/outcome software increment, not real-model or live-camera acceptance. The real app persists Unavailable with its gate closed. The tail experiment is terminal with baseline retained; no reserved pixels or fitting were added. Next is bounded live sampled-frame/session implementation and scientific/intended-use evaluation. Preserve the reviewed spec, durable Blocked recovery, stock/access contracts and closed experiment artifacts. Other AI/extras and production remain deferred.

## Existing boundaries

- `backend/functions/service.mjs` owns trusted commands. `approvedTransaction(auth,roles,work)` in access.mjs passes protected config/account to a Firestore transaction and rechecks current approval/activity. Use that real interface; it does not take a scope argument.
- `lib/parcelEvidence.js` supplies Pre-dispatch/Prepared and Delivery/Dispatched role/status/Driver policy. Existing immutable v2 evidence records bind stage/source/shipment version; legacy records stay unchanged and cannot be assigned an invented stage.
- `lib/workspace.js` sends authenticated callable commands. Shared reads use ownerId queries and the fixed member.workspaceId compatibility field, never caller-selected scope.
- `EvidenceUpload.tsx` is used by `PreDispatchEvidence.tsx` in Warehouse/Delivery and delivery cards in Operations.tsx. `ResearchVerification.tsx` currently exposes a generic parcel submission that must be removed when trusted legacy parcel predict is rejected.
- DashboardData currently counts parcel predictions from evidence version/non-Rejected state alone; the spec requires reciprocal accepted/current-stage analyses for current parcel alerts. Preserve the eight-card interface and unrelated inventory/delivery predicates.
- Model acceptance remains null. New production paths must save a truthful Unavailable outcome without downloading images or calling Python. Positive inference software tests use external test-only module doubles, never production flags.

## Task 1 — shared validation, state and browser recovery

Exclusive files: new `lib/parcelAnalysis.js`, `.d.ts`, `lib/parcelAnalysisRetry.js`, `.d.ts`, `scripts/parcel-analysis-qa.mjs`, `scripts/parcel-analysis-retry-qa.mjs`.

1. Observe failing tests for strict start/resolve/review inputs, stage-aware start policy versus historical shared-read policy, immutable terminal inference fields, review-only versioned changes, exact lease boundary and safe public DTO/reasons. Then implement.
2. Define explicit state/reason/review enums and schema: Running; Predicted/Abstained/Unavailable/Failed/Stale/Expired. Only Predicted carries a model label. Mandatory evidence/shipment/stage/version/model lineage fields are server-derived. Private receipt/lock structures cannot enter a public DTO.
3. Observe failing saved-intent tests for same-operation replay, lost response, reload, context/account switch, in-flight outcome checks and no implicit new call after expiry. Implement a small persisted same-tab client keyed by fixed scope/actor/evidence, containing only IDs. Ambiguous outcomes preserve the original operation ID. No image/config/token storage or background retry.
4. Keep test fixture data generated and transient. Run `node --test scripts/parcel-analysis-qa.mjs scripts/parcel-analysis-retry-qa.mjs` until GREEN.

## Task 2 — trusted operation lifecycle and bounded inference

Exclusive files: new `backend/functions/parcelAnalysis.mjs`, `scripts/parcel-analysis-command-qa.mjs`; owned integration edits to `backend/functions/service.mjs`, `parcelResponse.mjs`, `scripts/prepare-functions.mjs`, `firestore.rules`. Do not overlap UI ownership. Read Firebase Firestore/rules skills for these changes.

1. Write command tests RED with external mocked storage/HTTP/acceptance modules and realistic transaction boundaries; no runtime testing bypass. Test all spec transitions and preserved inventory/delivery behavior.
2. Start transaction: validate current Approved scope/read; replay matching actor operation before NEW-work permissions; reject same-ID/different-input; validate stage/role/status/assignment only for a new claim. Snapshot account/shipment/evidence/plan versions and accepted-model descriptor. Claim private request and evidence lock plus safe public Running record atomically. Busy response exposes only blocking public analysis ID. Atomically persist a private immutable Blocked operation receipt for Busy: scope/actor/operation/command/evidence bindings and the fixed blocker ID, with no own lease/nonce/lock. Same-operation replay must keep returning that same Busy reference after blocker completion and can never claim new inference. Test Busy/reload/terminal blocker/replay/explicit resolve before integration; four-ID client storage cannot supply this server guarantee.
3. Canonical receipt/lock IDs include protected scope; lock records include exact request/analysis/nonce/expiry coordinates. Model acceptance/config absence terminalises Unavailable before any Storage/HTTP access. No external work inside Firestore retry callbacks.
4. For admitted models, implement streamed 10 MiB/10-second Storage verification, one authenticated 30-second HTTP call including bounded 16 KiB response read, and a 50-second total handler budget inside the existing 60-second Function limit. Abort/close on limits; sanitise all errors. Coordinate explicit classOrder and acceptanceSha256 fields at the Python wire boundary before any future activation, with old tabular contracts unchanged.
5. Completion checks exact matching Running receipt/lock/nonce, serverNow<expiry and all current access/snapshot/model bindings. Atomically save Predicted or Abstained; create exactly one deterministic legacy prediction projection/audit only for Predicted. Missing/corrupt projections fail closed. Separate server-internal null-result cleanup handles access/context loss without publishing model output or restoring user privileges.
6. Resolve by public analysis ID uses Approved fixed-scope historical read policy across staff roles. It never calls inference. At serverNow>=expiry, transactionally expire only the matching original claim and release only its lock. No automatic replacement execution; late completion cannot write.
7. Extend linked prediction review atomically across reciprocal analysis/projection Pending records, preserving historic unlinked review. Add Admin/Manager notes acknowledgment for Abstained; keep its AI label null and create no human-labelled dataset.
8. Add explicit handlers; reject legacy `predict(kind='parcel')` so no bypass remains. Preserve inventory/delivery commands. Copy shared validators through prepare-functions. Rules deny private receipts/locks and all direct writes; public analyses permit only existing approved fixed-scope shared reads.
9. Run focused Node tests with `--experimental-test-module-mocks`, then Task4 real emulator scenarios. Leave acceptance null and preserve stock/shipment balances/IDs.

## Task 3 — stage-aware photo interface and current summaries

Exclusive files: new `src/features/operations/ParcelAnalysis.tsx`; UI-owned edits to EvidenceUpload.tsx, ResearchVerification.tsx, parcelCapture.css, dashboardData.ts and corresponding scoped query owners/tests. Use installed frontend-design guidance; preserve current theme/layout and existing capture cleanup.

1. Write failing component/client tests for Request analysis, saved-intent recovery, in-flight serialisation, busy/expired link recovery, account/evidence/stage changes, late responses and null-label states. Implement using Task1 APIs and trusted commands.
2. Integrate per registered parcel image in both Prepared and Dispatched views; display historical stage/source provenance and exact image/result linkage. New requests require current stage-aware policy; historical outcomes remain viewable after stage changes. Warehouse must work for Prepared pre-dispatch; assigned Driver for Dispatched delivery. Proof-of-Delivery files cannot be analysed as parcels.
3. Query safe scoped public analyses and render saved timestamps/model provenance/uncalibrated scores, explicit unavailable/failure/abstained states and mandatory review. Remove generic parcel submission while keeping historic prediction review and unrelated workflows.
4. Current parcel dashboard summaries require reciprocal Predicted/Accepted analysis+projection, matching evidence version/hash and current known shipment stage. Keep legacy/null/Pending/Rejected/stale results historical/review-only; preserve inventory/delivery summary logic and all eight cards.
5. Verify keyboard/desktop/390/320px layouts, pending-recovery and camera context cleanup. Do not imply live sampled inference is implemented by these photo controls.

## Task 4 — actual local integration and evidence

Parent/reviewer owns `scripts/parcel-analysis-emulator-qa.mjs`, integration review, docs and final verification. Keep fixtures/images/emulator state local and ignored. Reuse running loopback emulators and run Firebase suites sequentially; never start a second wrapper.

1. Independently review claim/nonce/lease/version/access and legacy-bypass invariants. Test private read/write denial, forged public writes, cross-scope requests, duplicate concurrent submissions, different-input replay, lost responses, absent acceptance without image reads, busy lock discovery and exact expiry race. Real transactions must prove at-most-one prediction/audit and no result after reassign/revoke/status/version/model changes.
2. Test Warehouse Prepared start and assigned Driver delivery start; late completion after expiry/successor cannot release successor locks. Confirm resolution remains possible through approved historical access after stage/assignment changes and revoked users regain no access.
3. Verify paired review consistency, abstention notes keeping null labels, legacy prediction preservation and current dashboard filtering. Run original Firestore smoke/QA, shared/account and affected stage/guard scenarios sequentially using direct scripts against configured emulators.
4. Run build/lint, secret/current-history scans and desktop/narrow browser checks at literal127.0.0.1:5173. Exercise actual unavailable outcome/reload/recovery; use explicitly synthetic external doubles for positive result software scenarios, with production acceptance still null.
5. Update README staff workflow, roadmap, evidence/access contracts and a dated verification report together. Record exact failures/limits and verify no model/data/private configuration is tracked. No production action or publication.

This completes a software photo request/outcome increment only after working code and evidence exist. Accepted model quality, genuine intended-use photo evaluation, bounded repeated live sampling and actual camera latency/resource/session testing remain full-goal requirements.
