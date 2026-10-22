# Parcel photo outcome foundation — 21 October 2026

Task 1 of the [photo outcomes plan](superpowers/plans/2026-10-21-parcel-photo-outcomes.md) is implemented and independently reviewed. This provides shared validation, state transitions and browser recovery helpers. The trusted backend commands, database rules and evidence-level interface are still pending; there is no new working photo-analysis action in the application yet. The full evaluated photo/live parcel goal remains active and model acceptance stays null.

## Implemented behavior

- Exact start, resolve and review command schemas reject caller-supplied identity, model and result fields. New analysis follows the existing stage/role policy; approved historical reading is separate and remains possible after dispatch or reassignment.
- Public outcomes use an explicit allowlist and fixed safe reasons. Only Predicted can contain Normal/Damaged. Abstained retains a null label and no prediction projection; unavailable, failure, stale and expired outcomes contain no invented scores or labels. Model lineage, evidence binding, class order, confidence and timing are validated.
- A Running record has a 90-second lease. Completion is strictly before expiry; expiry begins at the boundary. Terminal inference is immutable. Admin/Manager review changes separate versioned review fields, preserving the original inference.
- Same-tab recovery persists only scope, actor, evidence and operation IDs before sending. A lost response or reload retains the same UUID. Known IDs resolve an existing outcome. No timers, background retries or automatic replacement operations are created. In-flight operations are serialized and late responses are fenced when context changes.

The six files are `lib/parcelAnalysis.js`, its declaration file, `lib/parcelAnalysisRetry.js`, its declaration file, and the two corresponding `scripts/parcel-analysis-*-qa.mjs` suites. These helpers do not obtain protected scope, authenticate users, transact Firestore, call a model or authorize a saved result.

## Review findings resolved

Independent review identified a recovery contract gap: after a Busy response and reload, a same-operation check must never become new inference merely because the blocker has since completed. The spec now requires an immutable private server Blocked receipt binding the original operation/command/evidence to the same blocker ID. A replay returns that Busy reference; a later explicit check resolves it. The helper test models this required server behavior. Implementing it in real transactions remains Task 2.

A separate independent probe found that sparse score arrays could bypass `Array.every` and NaN comparisons. New tests failed before the fix. Scores and class order now require their own two array entries; each probability must be finite before arithmetic. Raw or nested private fields are removed from public responses. Historical Pre-dispatch recovery after a current Delivery-stage change remains covered.

## Verification

| Check | Final evidence |
| --- | --- |
| Parent focused tests | 40 passed: 29 new state/recovery tests and 11 existing evidence/capture tests; no skips |
| Independent audit | 45 passed, including five additional boundary-probe groups; no remaining Task 1 blocker |
| Strict standalone TypeScript declarations | Passed independently and by parent |
| Application build | Passed; existing bundle-size warning remains |
| Application lint | Passed, zero errors and five existing image warnings |
| Secret checks | Standard scan and reachable-history scan passed; expanded scan covers new untracked source as well |
| Private artifacts | No tracked datasets, models, outputs or plan scratch artifacts; exact experiment artifacts remain ignored |

Ignored evidence is under `outputs/parcel-photo-outcomes-20261021/`: `parent-focused-02.log`, `parent-build-02.log`, `parent-lint-02.log`, `parent-types-01.log`, `task1-independent-review.md`, and final `task1-independent-sha256.txt`. Earlier logs and hashes are preserved as earlier snapshots. The sparse-array fix has its own observed failing/passing logs.

No database or UI integration changed, so this increment has no new emulator or browser acceptance claim. Tasks 2–4 must implement and verify real transactions/rules, stage-bound UI, reciprocal review, unavailable/reload workflows, original regressions and desktop/mobile browser behavior together. Accepted model quality, independent intended-use photo evaluation, bounded live sampling and physical-camera evaluation remain separate requirements.
