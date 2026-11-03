# Inventory stock assessment and review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. The user approved this plan and selected Native execution on 22 October 2026. The execution ledger records verification and recovery-interface amendments.

**Goal:** Make existing inventory checks useful with sparse history, and let authorised staff explicitly capture immutable stock snapshots and record separate, attributable human labels for later data qualification.

**Architecture:** Extend the current Stock Management experience and trusted Firebase command path. Canonical pure JavaScript helpers own stock facts, quality states and input validation; a separate backend module owns transactional source reads, capture/review receipts and versioned review history. The feature works without Python inference and never installs a binary public benchmark as the three-class IILAS model.

**Tech Stack:** Existing React/TypeScript/Vite, Firebase Authentication/Firestore/Functions, canonical JavaScript helpers and Node test scripts; existing Python tooling only for refreshing the local parcel source manifest.

**Spec:** `docs/superpowers/specs/2026-10-22-inventory-stock-assessment-and-review-design.md` — approved by the user on 22 October 2026.

## Global Constraints

- Node 22.13+ within major 22 and JDK 21. Dot-source `../Enter-IILAS.ps1`; use `npm.cmd`/`npx.cmd` in PowerShell. Run Git/npm only inside `iilas-fyp`.
- Local browser origin is literal `http://127.0.0.1:5173` or `http://localhost:5173`. One loopback emulator stack, sequential suites: project `fyp-inventory-and-logistics`, Auth9099/Firestore8081/Storage9199/Functions5001.
- Preserve the dirty worktree, original Admin/data scope, current IDs/balances, personal inventories, Prepared-Shipment Handover, locations/corrections, navy/purple interface and eight-card dashboard.
- No reset, automatic staging/commit/push, existing data migration, production change, dataset acquisition, synthetic generation, automatic harvest/export/training, model activation or camera opening. Retain all new work locally.
- Exactly six prospective features; unknown history-dependent inputs remain null. Rules and human labels are separate from predictions and numerical model confidence. Reviewed records retain `trainingEligibility: NotAssessed`.
- Window `[cutoff - 30 days, cutoff]`; at most 2,000 movement rows plus one overflow sentinel. Receipt search at most 21 candidates; inspect at most the first 20 for the latest non-reversed eligible receipt, otherwise hold the feature unknown. No full-scope scan or silent truncation.
- Snapshot/review writes, receipts and audits are trusted transactions. Current approval/role/scope is checked on replay; frozen features never change with review.
- Preserve all source-bound parcel manifests and evidence. Changing `backend/functions/service.mjs` invalidates its old manifest; refresh into fresh ignored paths rather than patching old pins. Never run a model, consumed TEST or camera to refresh metadata.
- Keep private configuration, datasets, models, emulator exports, captured records, generated receipts and test data out of GitHub. Test cleanup is exact-identity and must not reset shared state.

## Review Focus

1. **Sparse legacy history:** one recent receipt or zero matching movements must not certify a complete 30-day history; Task1 tests observed counts versus null model fields and Task4 checks the displayed distinction.
2. **Stock mutation during capture:** warehouse reservations, procurement receipts and corrections must invalidate/retry stale source observations rather than produce a mixed snapshot; Tasks2/5 test source-version changes and historical immutability.
3. **Lost reply followed by account/role change:** recovery must remain tied to the original actor/scope/action/operation and cannot reopen another user's request; Tasks3/5 test persisted identity and revoked access.
4. **Review correction and duplicate submission:** retry must return the same revision; a later deliberate judgement must append a new version without changing frozen facts; Tasks2/5 test receipt ordering, races and revision links.
5. **Misleading certainty or demand double-counting:** above-reorder stock cannot become an automatic Normal/critical AI label, and reserved demand is subtracted once; Tasks1/4/5 test wording, invariants and absence of prediction/stock/procurement side effects.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `lib/inventoryRisk.js`, `lib/inventoryRisk.d.ts` (new) | Exact validators, versioned facts/quality/reorder calculation, canonical frozen-payload hashing input |
| `backend/functions/inventoryRisk.mjs` (new) | Approved transactional reads, scoped evidence validation, capture/resolve/review operations and public DTOs |
| `backend/functions/service.mjs` | Five command registrations after the reviewed recovery amendment; preserve existing predict/parcel logic |
| `scripts/prepare-functions.mjs` | Copy canonical `inventoryRisk.js` into ignored generated backend helper, as with existing shared helpers |
| `lib/inventoryRiskClient.js`, `.d.ts` (new) | Scope/actor-bound capture/review retry controllers and pending-state validation |
| `src/features/stock/InventoryRisk.tsx` (new) | Existing-style assessment panel and paged snapshot/review history |
| `src/features/stock/StockManagement.tsx`, `app/page.tsx`, `src/features/stock/stock.css` | Add member prop and focused UI entrypoint/styles without changing balance writes or dashboard |
| `firestore.rules`, `firestore.indexes.json` | Explicit shared read/server-only write/private-receipt rules and bounded-query indexes |
| `scripts/inventory-risk-{qa,command-qa,client-qa,emulator-qa,ui-qa}.mjs` (new) | Pure, transaction, browser-state, actual-emulator and browser checks respectively |
| `scripts/inventory-risk-output.mjs` (new) | Exclusive ignored per-run QA directory; never reuse parcel QA output paths |
| `docs/INVENTORY_STOCK_ASSESSMENT_2026-10-22.md` (new) and existing contracts/status docs | Actual usage, definitions, verification and remaining AI/data limits |

## Shared interfaces and exact input decisions

Define the following exported TypeScript declarations in `lib/inventoryRisk.d.ts`; JavaScript implementations use the same property names. IDs use the existing application record-ID constraints, operation IDs use UUIDs, and unknown keys are rejected.

```ts
type RiskLabel = 'Normal' | 'Reorder Risk' | 'Critical Stock Risk';
type Recommendation = 'Reorder review' | 'No reorder warning' | 'Balance needs review';
type CaptureInput = {productId: string; productVersion: number; operationId: string};
type AssessmentInput = {productId: string};
type EvidenceRef = {kind: 'stockMovements' | 'shipments' | 'purchaseOrders'; id: string};
type ReviewInput = {snapshotId: string; version: number; operationId: string;
  decision: RiskLabel | 'Unresolved'; reason: string; evidenceNotes: string;
  fulfilmentImpact: string; evidenceRefs: EvidenceRef[]};
type Features = {available_quantity: number; reserved_quantity: number;
  movement_frequency: number | null; reorder_distance: number;
  adjustment_count: number | null; days_since_replenishment: number | null};
type HistoryObservation = {observedMovementCount: number; observedAdjustmentCount: number;
  observedCorrectionCount: number; coverage: 'Unverified';
  receiptId: string | null; receiptAtMs: number | null; issues: string[]};
type Assessment = {method: 'rules'; productId: string; productVersion: number; observedAtMs: number;
  recommendation: Recommendation; reasons: string[]; features: Features | null;
  history: HistoryObservation; captureAllowed: boolean};
type CaptureResult = {state: 'Captured'; snapshotId: string; replayed: boolean}
  | {state: 'Cancelled'; snapshotId: null; replayed: boolean};
type ReviewResult = {snapshotId: string; reviewId: string; version: number; replayed: boolean}
  | {state: 'Cancelled'; snapshotId: string; reviewId: null; version: null; replayed: boolean};
```

Reason is 20–500 trimmed characters; evidence notes 20–1,000; fulfilment impact is empty or 20–500 and required for Critical; at most 10 unique evidence references. A local evidence note is permitted without attaching a shipment; do not invent that an attached record proves a label. Referenced records must belong to the fixed scope and selected product (movement productId or a matching product line). Reject malformed/foreign/mismatched refs. Label `Unresolved` persists a null human label and explicit unresolved state.

Receipt keys bind canonical `[action,scope,actor,operationId]`; capture/resolve share the logical capture action namespace, review uses a different namespace. The canonical command hash includes the exact validated input. Snapshot IDs may be random UUIDs allocated once per invocation outside transaction retries, but no identity is committed before the transaction succeeds. Each snapshot stores frozen facts, source references/digest, rule/feature/rubric versions, creator/time, current human summary, review version and `trainingEligibility: NotAssessed`. Each immutable review binds snapshot ID, next version, previous review ID, actor/role/time, human label/null, reason and evidence. No changes to product or prediction collections.

### Task1: Canonical assessment, quality and validation

**Files:** create `lib/inventoryRisk.js`, `.d.ts`, `scripts/inventory-risk-qa.mjs`.

**Interfaces:** produce `validateAssessmentInput(input)`, `validateCaptureInput(input)`, `validateReviewInput(input)`, `buildInventoryAssessment({productId,product,movements,receiptCandidates,correctionLinks,cutoffMs,overflow}) -> Assessment`, and `canonicalInventoryRisk(value) -> string`. Records are trusted-source DTOs with document IDs and timestamps converted to finite epoch milliseconds, not live Firebase objects. Malformed historical records produce explicit issues and disallow capture; validation throws for invalid command schemas.

- [x] Write failing Node assertions named `reserved stock is subtracted once`, `equality requests reorder review`, `above reorder is not Normal`, `partial counts are not complete history`, `missing or reversed receipt is not zero days`, `future/malformed time blocks capture`, `window overflow is never truncated`, `invalid locations are not clamped healthy`, and exact command/evidence bounds. Pin `available=100-30=70`, `reorder_distance=70-80=-10`, `recommendation='Reorder review'`, null history-count features with unverified coverage, `trainingEligibility` absent from client input, and no Critical/Normal label generated by balance calculation.
- [x] Run `node --test scripts/inventory-risk-qa.mjs`; retain the meaningful RED output in a fresh ignored inventory QA directory.
- [x] Implement the interfaces using existing `locationBalances` consistency validation and numeric conventions. Do not rewrite current `predict` feature preparation. Compute counts from committed ledger rows in the fixed window; classify incomplete coverage honestly and derive only supported receipt information. Keep exact canonical ordering deterministic.
- [x] Run the same suite GREEN, then `node scripts/location-stock-qa.mjs` and `node scripts/input-validation-qa.mjs`; inspect failures instead of weakening old checks.
- [x] Save task source hashes/results for later review; leave changes unstaged.

### Task2: Trusted transactional snapshot and review lifecycle

**Files:** create `backend/functions/inventoryRisk.mjs`, `scripts/inventory-risk-command-qa.mjs`; modify `backend/functions/service.mjs`, `scripts/prepare-functions.mjs`.

**Interfaces:** consume Task1 helpers; export exactly `getInventoryAssessment(auth,scope,input)`, `captureInventorySnapshot(auth,scope,input)`, `resolveInventorySnapshot(auth,scope,input)` and `reviewInventorySnapshot(auth,scope,input)`. Register these four handlers in the existing dispatch; reuse `approvedTransaction` and fixed-scope checks, with capture/assessment roles Admin/Manager/Inventory/Warehouse and review roles Admin/Manager. Public returns are Assessment/CaptureResult/ReviewResult above.

- [x] Write failing transactional checks for unauthorised/disabled callers, scope/feature forgery, inactive products, wrong expected version, two concurrent identical captures, changed-input operation reuse, lost commit reply, unknown resolve versus late submit, read-before-write ordering, concurrent product/ledger change, independent reviewer, Critical evidence requirements, review version race, repeated review receipt and unchanged frozen digest. In a stock-change race accept only a coherent successful snapshot or a clean rejection, never a partial write.
- [x] Run `node --test scripts/inventory-risk-command-qa.mjs` RED without connecting to production. Use a controlled transaction fixture here; real SDK/rules coverage belongs to Task5.
- [x] Implement bounded per-product/window and receipt queries, correction-link inspection and evidence-reference reads. All transaction reads precede snapshot/receipt/review/audit writes. Check current membership before replay, then receipt before product/review-version checks so an exact historical replay remains recoverable after later stock changes. Unknown capture resolution writes a Cancelled tombstone that serialises with late submit. No snapshot exists for a cancelled capture.
- [x] Implement deterministic revision IDs from snapshot/version or operation receipt, exact replay, immutable previous revision, current-summary/version update and audit in one transaction. A revision changes no frozen feature or product field; self-review is denied even for Admin. Derive times/cutoff from the server; do not accept client features or time.
- [x] Run `npm.cmd run functions:prepare`, both Task1/2 suites GREEN and affected existing pure command checks. Record which bound backend bytes changed, immediately regard the old parcel capability as stale, and preserve the old manifest/config. Do not patch its SHA or extend its source allowlist to excuse the edit.

### Task3: Recoverable client commands and explicit data access

**Files:** create `lib/inventoryRiskClient.js`, `.d.ts`, `scripts/inventory-risk-client-qa.mjs`; modify `firestore.rules`, `firestore.indexes.json`.

**Interfaces:** produce `createInventoryRiskClient({storage,context,command})`, where context is `{uid,scope}` and command matches existing `workspaceCommand(action,input)`. Returned methods are `pendingCapture()`, `capture({productId,productVersion})`, `resolveCapture()`, `pendingReview()`, `review(inputWithoutOperationId)`, `retryReview()`. Save exact validated payload plus generated UUID before sending; separate actor/scope/action storage keys. Task4 consumes this interface rather than generating UUIDs in JSX.

- [x] Write failing tests for storage-write failure before send, reload plus exact capture/review replay, changed UI fields while a request is pending, concurrent button presses, late acknowledgements after account/scope change, malformed saved payload, uncertain network error, and Cancelled capture resolution. Assert no request is replaced merely because a response is lost and no old actor's data is displayed in a new context.
- [x] Run `node --test scripts/inventory-risk-client-qa.mjs` RED, implement the controller and rerun GREEN. A review retry resends the same review operation; it never invents a new revision. Denied access does not automatically clear uncertain pending work.
- [x] Add explicit read-only shared rules for `inventoryRiskSnapshots`/`inventoryRiskReviews` and total client read/write denial for `inventoryRiskRequests`. Keep the generic allowlist unchanged for those private receipts; all direct public writes remain denied.
- [x] Add only required indexes: stockMovements ownerId/productId/createdAt ascending for the window; ownerId/productId/type/createdAt descending for receipts; snapshots ownerId/productId/observedAt descending; reviews ownerId/snapshotId/version descending. Confirm field names match persisted schemas. Query snapshots 20 at a time and selected review history 10 at a time, using document-ID tie-break cursors where times match; no hidden unbounded subscription.
- [x] Run existing `node scripts/stock-client-qa.mjs` and new client/helper suites GREEN; defer actual rule proof to Task5 and preserve all old rules/index entries.

### Task4: Existing Stock Management assessment and review UI

**Files:** create `src/features/stock/InventoryRisk.tsx`, `scripts/inventory-risk-ui-qa.mjs`; modify `StockManagement.tsx`, `stock.css`, `app/page.tsx`.

**Interfaces:** `InventoryRisk({member,productId,onClose,onNotice,onError})` uses Membership and Task3 client, Task2 commands and paged readonly snapshot/review queries. Add `member: Membership` to StockManagement props and pass the existing member from `app/page.tsx`. Existing `readOnly` still protects stock movement actions; current role separately gates assessment/capture/review.

- [x] Write failing browser/state scenarios for no history, reorder equality, above-threshold wording, invalid balance display, explicit Save versus opening-only, no preselected human label, reviewer different from creator, Critical impact validation, Unresolved null label, pending capture/review after reload, changing selected product/account during in-flight work, and snapshot history after stock has changed.
- [x] Implement **Stock assessment** in the existing balance row and a focused accessible panel/dialog. Use current navy/purple components, labelled controls, `useDialogFocus`, errors and status notices. Show Rule-based stock check and Staff review data labels; display recorded observations separately from null model-ready history. Do not add confidence, auto-Normal/Critical, AI result badges, dashboard cards, prediction records or procurement actions.
- [x] Implement explicit Save, Retry/Check outcome, pending-review retry, paged history and independent human review. Display historical product/cutoff/version and review revisions without asserting they represent the current balance. Only capture/review commands write new records; opening/reloading a panel does not.
- [x] Run `npm.cmd run build`, focused UI/state checks and lint. Use purpose-built Playwright checks for 1440px and 320px after Task5 enables local queries; ensure labels, dialogs and buttons remain keyboard usable and camera controls are never invoked.

### Task5: Fresh local source capability and real emulator/browser evidence

**Files:** create `scripts/inventory-risk-output.mjs`, `scripts/inventory-risk-emulator-qa.mjs`; preserve unique evidence beneath ignored `outputs/inventory-risk-20261022/`. No existing parcel proof file may be overwritten.

**Interfaces:** output helper creates a new exclusive UUID/run directory beneath ignored outputs, rejects existing/linked/traversal paths and never prints secrets. Emulator QA requires the exact loopback environment, uses genuine Functions/SDK/rules, tracks exact generated fixtures/receipts/audits and compares complete baseline hashes after cleanup. Distinguish pure/mocked/UI/actual emulator evidence in saved reports.

- [x] Before any local service mutation, inventory current ports/process handles, active parcel sessions/photo requests and ownership markers. Preserve baseline source hashes and complete recursive Firestore/Auth/Storage inventory including the dedicated parcel handoff. The old recorded baseline is 1665documents/116Auth/twoobjects, but current authoritative state must be inspected; unexpected changes are not permission to reset it.
- [x] Prepare source-reviewed fresh parcel manifest/config in unused ignored paths using existing `serve_parcel_local_eval.py prepare/check` and selector validation, with no inference or TEST pixels. Never display private tokens. If a controlled emulator restart is needed for rules/indexes/backend environment, first obtain a verified current export; preserve the Windows EPERM export-rename failure and verify any official temporary-export copy byte-for-byte before import. Account import token timestamps may change and require a separately disclosed post-import baseline; never silently weaken Auth hash checks.
- [x] Reuse the one verified emulator stack and current Vite. If a restart is required, stop/restart only owned handles after proving no active user work, restore the fresh metadata-only parcel capability and normal loopback service, and recheck false operational approval/null acceptance. Do not run a parcel camera or model request for this inventory task. A source-binding failure is a real failure to fix/report, not grounds to disable integrity checks.
- [x] Run actual new emulator scenarios for shared reads, all relevant role denials, direct-write/private-receipt denial, capture/resolve concurrency, stock mutation coherence, independent review/revision replay, old-snapshot immutability, archive/access changes and null unknown features. Assert no new predictions, product changes, procurement actions or training admission. Clean only exact owned fixtures with generation/hash fences and preserve any unexpected mutation for diagnosis.
- [x] Run required original suites sequentially via direct Node commands: `scripts/smoke-firestore.mjs`, `scripts/qa-review.mjs`, `scripts/shared-qa.mjs`, `scripts/account-access-qa.mjs`, `scripts/stock-retry-qa.mjs`, `scripts/stock-locations-qa.mjs`, `scripts/procurement-qa.mjs`. Use existing preservation harnesses when they wrap these commands without weakening assertions; do not use npm wrappers that create a second emulator. Run affected parcel pure capability/generic-isolation checks after service registration changes; do not replay known images or consumed research tests.
- [x] Execute actual local UI capture/review/reload/recovery on disposable fixtures with different staff identities at desktop/320px. Confirm app freshness after changes, no runtime errors, no off-loopback service calls, no camera requests, and exact post-cleanup baseline. Save real versus synthetic evidence labels and any warnings honestly.

### Task6: Whole-change verification, independent review and handoff

**Files:** create `docs/INVENTORY_STOCK_ASSESSMENT_2026-10-22.md`; update README, PROJECT_ROADMAP, REQUIREMENTS, FULL_SCOPE_TRACEABILITY, account contract, approved design/plan status, root MSI setup status and sibling report CHAT_HANDOVER with current facts only.

**Interfaces:** final report links exact source diffs/hashes and Task1–5 evidence, preservation checks, local restart/config locations without values, actual readiness and unresolved scientific tasks. It distinguishes rule outputs, human labels and future learned predictions.

- [x] Run new pure/client/command suites, `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd run security:scan`, an expanded untracked-source scan, and `git diff --check`. The current scanner has no `--include-untracked` flag: for the expanded check, create a fresh ignored copy of `scripts/check-secrets.mjs` with only `git('ls-files','-z')` changed to `git('ls-files','--cached','--others','--exclude-standard','-z')`; verify that exact single diff and run the copy from the app root. Preserve all canonical credential patterns, private-path exclusions and redacted reporting. No staging or scanner-policy change is needed. Tests already passed after unchanged code need not be repeated absent new concerns. Record actual warning counts and run failures rather than promising green results.
- [x] Request one independent whole-change source review against the preserved pre-inventory dirty-state baseline and approved spec. Supply exact bounded diff/current-source hashes, test evidence and source-bound parcel consequences. Resolve demonstrated Important/Critical findings with focused RED/GREEN and rerun only affected checks. No unrequested model/effort override is needed.
- [x] Update staff instructions for Stock assessment, explicit capture, independent review, sparse-history reasons and recovery; explain that these are candidate snapshots with no trained three-class AI accuracy. Keep separate public Backorder/FreshRetailNet research and parcel limits truthful. Do not publish user records or embed private configuration.
- [x] Verify source/artifacts remain in their intended tracked/ignored areas, current original baseline is preserved, the existing Admin and Prepared handover work, parcel experimental metadata is valid if restored, and no finite QA/native job is left running. Leave normal local services available only as documented. No automatic commit, push, deployment or evidence cleanup.
- [x] Hand off the working local feature and list remaining training-data qualification, independent labels/evaluation and future model integration. Leave the camera trial deferred and do not mark the broader parcel or inventory AI scientifically complete.

## Coverage and plan self-review

Spec mapping: intent/approach -> header/constraints; staff UI -> Task4; six features/quality/limits -> Task1/2; operation/storage/permissions -> Task2/3/5; training boundary -> all task assertions and Task6; preservation/source pin -> Task5; meaningful verification -> Tasks1–6; completion -> Task6. Each Review Focus line has an owning RED/GREEN scenario. Shared method/property names are declared above; no additional model, workflow or dataset is required.

Execution is deliberately sequential because backend, rules, client recovery and UI share the same contracts and one live local emulator stack. Recommended method: **Native**, with one fresh independent final review, to avoid repeated context loading and simultaneous edits to the shared backend. Subagent-driven implementation remains available if the user prefers review after each task. No worker is dispatched and no application implementation starts until the plan/execution-method response arrives.

Plan self-review completed: source paths were inspected, query/index field names and interface consumers are explicit, capture resolve tombstones and review receipts cannot alias, sparse-history/receipt limits and current-source parcel rebinding are covered. No placeholder or speculative accuracy target is introduced. This is a plan, not evidence that tests, schema changes or runtime restarts have happened.

Execution status: local Tasks1–6 implemented; final handoff ledger is authoritative for terminal evidence, warnings and limitations. Independent review findings were reproduced and fixed in one pass; no claim of a second reviewer approval is made. No commit/push/deployment, model fitting or camera trial occurred.
