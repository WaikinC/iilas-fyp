# Automatic Locked Business Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create products, shipments and purchase orders with automatic, immutable business codes and recover the same record/code after an uncertain save.

**Architecture:** A trusted transaction allocates a scope/kind counter and commits the record, code assignment, existing uniqueness reservation, creation receipt and audit together. Shared browser recovery preserves the original request; existing record-edit, warehouse, purchasing and access authorities remain. The ordinary and demo-linked purchase paths share one PO sequence.

**Tech Stack:** Existing React/TypeScript, Node 22, Firebase Auth/Firestore/emulators and authenticated Spark/MSI command backend; no new dependency or stack.

**Spec:** `docs/superpowers/specs/2026-11-02-automatic-business-codes-design.md`, approved by the user on 2 November 2026. Native execution is preserved; use `superpowers:executing-plans` after this plan is reviewed.

## Global Constraints

- “Existing stored codes remain exactly as they are and become read-only in these editing workflows; records are not renumbered.”
- “Internal Firestore document IDs remain separate opaque IDs.”
- “Sequences do not reset by year and are separate by kind.”
- “Valid numbers are 1–999,999”; formats are `PRD-000001`, `SHP-000001`, `PO-000001`.
- “The product's barcode remains its existing separate scanned/entered field with the current 8–14 digit validation and uniqueness check.”
- “Client SDK reads/writes to counters, assignments and private creation receipts are denied.”
- “All Firestore transaction reads precede writes, including existing purchase-transition reads.”
- “Successfully issued numbers are never recycled after cancellation, archiving or deletion.”
- Initialization reads at most 2,000 records per kind plus one lookahead, scoped to the selected shared system. Incomplete/ambiguous initialization refuses; no unrelated-cloud census.
- Preserve the selected initial Admin, current IDs/balances, shared staff, Prepared-Shipment Handover, source/proof links, approved navy/purple eight-card dashboard, live Reports graphs and five accepted operational interfaces.
- Run on MSI with Node22.13+ within major22 and JDK21; dot-source outer `Enter-IILAS.ps1`, then explicitly enter this plan's isolated worktree because that helper selects the main app directory. Use `npm.cmd`/`npx.cmd` in PowerShell.
- Local browser origins remain literal `http://127.0.0.1:5173` or `http://localhost:5173`. One explicit loopback emulator stack; run suites sequentially. No wrapper may start a second emulator.
- Keep private configuration, credentials, datasets, actual test records, exports and recovery evidence out of GitHub. Native work remains local/uncommitted under the existing workspace preference; checkpoint exact files and test receipts instead of staging the mixed inherited changes.
- This plan authorizes local implementation, registered fictional emulator writes and exact fixture cleanup after approval. Live counter initialization, deployment, existing MSI source changes/service cutover, IAM, billing, Git publication, model training/evaluation and parcel/physical-phone tests remain excluded.

## Review Focus

1. Two tabs/components replay the same saved operation UUID before either reply arrives: one record/code, not just disabled buttons. Separate intentional requests with different UUIDs remain distinct — Tasks3 and5.
2. A creation succeeds, its reply is lost, then the record is deleted/archived or the actor changes role: recover the original outcome without resurrection or a new number — Tasks3 and5.
3. An old saved linked-purchase request has a reference or a rejected/retried PO: exact historical recovery works, but that payload cannot create a new manual-code order — Task4.
4. Legacy code casing, missing reservations, namespaces near999999, baseline drift or an existing differing numbering policy: refuse or initialize safely without renumbering/resetting — Task2.
5. Validation failure, cancellation and an account/environment switch race with a slow reply: no leaked previous-account data, forgotten pending operation or unproved “not saved” message — Tasks3,5 and6.

## Workspace, file map and interfaces

All product-code paths below are relative to the new execution worktree. Proposed location: `iilas-fyp/.worktrees/automatic-business-codes`; if occupied, choose a fresh task-owned suffix and record its absolute path. Never reuse/delete an unrelated worktree.

Build the starting source from the current792-file main runtime snapshot plus the exact67 presentation overlays in `outputs/spark-msi-demo-20261028/reports-live-20261102/candidate-01/stage.private.json`. Verify every source/overlay hash before copying. Include current Markdown contracts separately. This retains published Reports and UI without importing unrelated `.superpowers` previews or private output/data trees. Use the installed worktree skill at execution time; initialize only dummy emulator browser configuration. Existing source-bound MSI services continue unchanged in main.

| Files | Responsibility |
|---|---|
| New `lib/businessCodes.js`, `.d.ts` | Closed kind registry, formatting/parsing and validated numbering metadata |
| New `lib/recordCreation.js`, `.d.ts`; modify `lib/validation.js`, `lib/procurementValidation.js` | Code-free creation inputs, exact outcomes and shared ordinary-field validation |
| New `backend/functions/businessCodeAllocation.mjs`, `businessCodeInitialization.mjs`; mirrored `businessCodes.js`, `recordCreation.js` | Transactional allocation, complete bounded initialization and private schemas |
| New `backend/functions/recordCreation.mjs`; modify `service.mjs`, `access.mjs`, `purchaseOrderWorkflow.mjs` | Recoverable ordinary creation, narrowly factored existing save logic, empty bootstrap and locked edits |
| Modify `lib/inventoryDemoProcurement.js`, its backend mirror, `backend/functions/inventoryDemoProcurement.mjs`, `lib/inventoryDemoProcurementClient.js` | Version2 code-free linked creation with exact version1 recovery |
| New `lib/recordCreationClient.js`, `.d.ts`, `src/features/records/RecordCreationProvider.tsx`, `RecordCreationRecovery.tsx` | One controller per environment/account/kind, pending/retry/check/cancel and accessible recovery UI |
| Modify `app/page.tsx`, `lib/firebase.js`, shipment workspace/editor/controller/commands/presentation, `Procurement.tsx`, `InventoryDemoProcurement.tsx` | Read-only code fields and recovered create integration; preserve focused modules |
| Modify `firestore.rules`, `scripts/prepare-functions.mjs`, `scripts/prepare-hybrid-demo.mjs` | Explicit private denials and exact shared backend staging |
| New `scripts/business-code-*-qa.mjs`, `record-creation-*-qa.mjs`, fixture/runner files listed by tasks | Contract, concurrency, recovery, rules and actual local UI evidence |
| README, roadmap, new acceptance guide | Usage, limitations and later activation requirements |

Use these interfaces consistently; internal implementation choices not fixed here remain with the Native implementer:

```ts
type RecordKind = 'products' | 'shipments' | 'purchaseOrders';
type RecordCreateInput = {
  operationId:string; kind:RecordKind; data:Record<string,unknown>;
};
type RecordCreateOutcome = {
  schema:'iilas-record-create-outcome-1.0';
  state:'Created'|'Cancelled'|'NotFound'; kind:RecordKind;
  operationId:string; recordId:string|null; code:string|null;
  version:number|null; replayed:boolean;
};
type RecordCreateResolveInput = {
  creation:RecordCreateInput; intent:'Check'|'Cancel';
};
```

For Created, code/ID are nonempty and version is the creation version1; otherwise all three are null. Later record deletion/archival is separate from this immutable creation result. Backend action names are `createBusinessRecord` and `resolveBusinessRecordCreation`. Creation payloads have no `sku`, `reference`, document ID, scope, role or code override; ordinary product barcode remains a data field. Resolver input preserves the full original creation identity/data. Unknown business exceptions keep the saved request for resolution; no generic exception clears it or asserts that it was not applied.

Private collection names are `businessCodeSettings`, `businessCodeCounters`, `businessCodeAssignments`, `recordCreationRequests`. Settings use scope as ID; other IDs use SHA-256 of canonical identity tuples to avoid length/collision issues. Settings schema is `iilas-business-codes-1.0`. Counters include ownerId, kind, policyVersion, lastIssued, version and initialization digest. Assignments include ownerId/kind/code/sequence/recordId/original actor/operation/policy and server creation time. Request receipts bind scope/actor/kind/operationId and canonical input hash to a terminal Created or Cancelled outcome; they are retained independently of the business record.

### Task 1: Code and creation contracts in the isolated baseline

**Files:** Create shared modules above, `scripts/business-code-contract-qa.mjs`, `scripts/record-creation-contract-qa.mjs`; modify shared validation only as required for code-free creation.

**Interfaces:** Export `formatBusinessCode(kind, sequence):string`, `parseBusinessCode(kind, code):number|null`, `validateRecordCreationInput(raw):RecordCreateInput`, `validateRecordCreationResolveInput(raw):RecordCreateResolveInput`, `validateRecordCreationOutcome(raw, expected):RecordCreateOutcome`, `validateProductCreation(data)`, `validateShipmentCreation(data,maxItems=100)`. Existing full-record validators retain their output/constraints.

- [ ] Establish the isolated source/overlay baseline and a task-owned ignored `.superpowers/sdd/2026-11-02-automatic-business-codes/` ledger with approved design/plan hashes, source pins, current MSI preparation and frozen-artifact preservation references. Do not copy credentials, production configs or datasets. Verify MSI and toolchain.
- [ ] Write RED tests: format kinds1/999999 exactly; reject0/1000000/fractions/unsafe kinds; parse normalized ` prd-000017 ` as17 and a nonmatching legacy SKU as null. Assert code-free product/shipment/PO input rejects even blank `sku`/`reference`, extra authority fields, malformed UUIDs, accessors/nonplain objects and invalid numeric/date/barcode facts. Created/Cancelled/NotFound exact outcome shapes must reject identity mismatches.
- [ ] Run `node --test scripts/business-code-contract-qa.mjs scripts/record-creation-contract-qa.mjs`; capture the expected missing-function/module failure.
- [ ] Implement the declared contracts using current canonicalization and existing ordinary-field validators. Factor validation to avoid two versions of stock/shipment limits; never persist a placeholder identity. Product creation still requires a unique valid barcode and zero initial reserved quantity; shipments start Draft with1–100 distinct active-product lines.
- [ ] Rerun the same command; expect zero failures. Checkpoint exact task files and RED/GREEN evidence in the local ledger.

### Task 2: Bounded initialization and transaction-only allocation

**Files:** Create `businessCodeAllocation.mjs`, `businessCodeInitialization.mjs`, `scripts/prepare-business-codes-local.mjs`, `scripts/business-code-allocation-qa.mjs`, `business-code-initialization-qa.mjs`; modify `access.mjs`, `firestore.rules`, preparation/staging allowlists.

**Interfaces:** `prepareBusinessCode(tx,{scope,kind,recordId,actor,operationId}):Promise<{code:string,sequence:number,apply:()=>void}>` performs reads only until apply. `readBusinessCodeBaseline(db,scope):Promise<Baseline>` projects `{id,code,version}` for each kind with complete-or-refuse coverage. `planBusinessCodeInitialization(baseline):InitializationPlan` computes normalized maxima and digest. `applyBusinessCodeInitialization(tx,plan):Promise<()=>void>` verifies complete re-observation/source digest, settings/counters and then returns a write closure. The local CLI permits explicit loopback only, with no cloud-execution flag.

- [ ] Write RED tests for existingPRD17→lastIssued17/next18; all three namespaces; lowercase legacy prefixes; archived records; missing old reservations; duplicate/invalid claims;2000 exact and2001 refusal; baseline drift; identical policy replay versus differing policy refusal;999999 exhaustion. Assert an aborted transaction/collision/validation failure leaves counters unchanged, and read/write ordering is enforced.
- [ ] Run `node --test scripts/business-code-allocation-qa.mjs scripts/business-code-initialization-qa.mjs`; verify relevant RED failures.
- [ ] Implement private versioned settings/counters/assignments and allocation closures. Preserve existing uniqueKeys/procurementKeys authorities. A corrupt/missing policy or claim fails closed. Assignments and lastIssued survive record deletion; no gaps are recycled.
- [ ] Integrate empty trusted bootstrap: before initializing zero counters, query each scoped business collection with limit1 and prove it is empty. Existing system registration/refresh must never manufacture/reset counters; existing-data initialization stays an explicit guarded local preparation. Initial Admin/account/audit semantics remain unchanged.
- [ ] Add explicit `allow read, write: if false` for all four private collections. Mirror shared modules byte-for-byte through `prepare-functions.mjs`; add exact required files to `HYBRID_FUNCTION_FILES` in `prepare-hybrid-demo.mjs`. No new index is assumed; investigate any required query/index without enabling or deploying it.
- [ ] Rerun tests; expect zero failures and unchanged non-numbering state. Checkpoint the exact changes and results.

### Task 3: Recoverable ordinary creation and immutable existing codes

**Files:** New `backend/functions/recordCreation.mjs`; modify `service.mjs`, `purchaseOrderWorkflow.mjs`; new `scripts/record-creation-command-qa.mjs`, `record-creation-retry-qa.mjs`.

**Interfaces:** `createRecordCreationCommands({prepareRecordSave,preparePurchaseCreate})` exposes the two named backend actions. Narrowly factor `prepareRecordSave(tx,{scope,actor,kind,recordId,data,existing}):Promise<{apply:()=>{id:string}}>` from current product/shipment save logic within service.mjs. `preparePurchaseCreate` adapts existing purchase transition preparation/writing to a trusted allocation; neither callback commits before all reads finish.

- [ ] Write RED tests: two staff concurrently create distinct codes; the same actor/request submitted twice produces one ID/code/audit/assignment; different input with the same UUID is refused; cancelled request cannot later create; cancellation/creation race has one terminal winner. Cover replay after deletion/archival and changed approved role, foreign actor/scope and unapproved/disabled accounts.
- [ ] Run `node --test scripts/record-creation-command-qa.mjs scripts/record-creation-retry-qa.mjs`; capture the missing-handler/behaviour failures.
- [ ] Implement the receipt transaction around the allocation and existing record preparation. Derive scope from approved system configuration. Product creation roles stay Admin/Manager/Inventory; shipment creation Admin/Manager/Logistics; ordinary PO creation Admin/Manager/Inventory. Resolution accepts the original actor with current approved staff access, including a changed approved role, without widening create permission. Check returns NotFound without writing when absent; Cancel writes a terminal cancellation receipt without allocation.
- [ ] Keep creation ID stable across transaction retries. Preserve product location/balance setup, shipment item snapshots and all existing PO totals/approvals. Generated PO preparation may omit the old unbounded legacy-reference scan only through the private verified allocation path; ordinary action/resubmission and historical protection remain correct. Never accept a client boolean that bypasses uniqueness.
- [ ] Reject creation through legacy `save` or reference-bearing ordinary `purchaseOrder` after the update, with an explicit refresh/new-form instruction. Preserve generic edit/action paths and require exact stored SKU/shipment reference on edits, including legacy codes. PO resubmission retains its stored reference. Draft deletion may retain its current public behaviour, but must not delete the permanent code assignment/creation receipt or decrement counters.
- [ ] Rerun tests; verify stock/warehouse and purchase transition reads still precede writes, allocation is atomic with failure and outcome replay does not mutate the record. Checkpoint.

### Task 4: Automatic linked POs with exact historical recovery

**Files:** Modify `lib/inventoryDemoProcurement.js`, backend mirror, `backend/functions/inventoryDemoProcurement.mjs`, `lib/inventoryDemoProcurementClient.js`; add `scripts/business-code-demo-procurement-qa.mjs`; update relevant existing linked-purchasing contract/client/command tests.

**Interfaces:** New Create envelopes add `contractVersion:2` to the existing top-level fields; `purchase` contains supplierId/expectedDate/items and no reference. Existing version1 Create/Action envelopes and source policy `demo-procurement-1.0` retain their exact canonical form. Version2 Create outcomes retain the old outcome fields plus `reference:string|null`; version1 outcomes remain byte-shape compatible. Existing source/link/expected-incoming decoders and provenance stay unchanged.

- [ ] Write RED tests showing ordinary and linked creation share one `PO-` sequence; repeated linked operation allocates once; an already-linked accepted requirement opens/returns its existing PO without another allocation. Validate reference-bearing version1 Completed replay, absent version1 resolution→Cancelled, refusal of a new version1 Create, and unchanged version1 Action/resubmission/receipt behaviour.
- [ ] Run `node --test scripts/business-code-demo-procurement-qa.mjs scripts/inventory-demo-procurement-contract-qa.mjs scripts/inventory-demo-procurement-client-qa.mjs scripts/inventory-demo-procurement-command-qa.mjs`; establish RED.
- [ ] Version the creation envelope and client storage decoder without rewriting an old saved request. Look up old receipts under their exact existing key/hash before deciding eligibility; unknown version1 creation can be resolved/cancelled but cannot start a manually numbered PO. Continue original actor, accepted requirement/event/source and one-order-link checks.
- [ ] Allocate via Task2 only for a genuinely new linked PO, in the same transaction as its existing link, receipt and audit. Version2's returned reference is its actual stored PO reference; validate it with the existing purchase-reference validator so a pre-existing linked legacy PO remains recoverable. Do not change source fingerprints, quantity advice, independent approval or expected incoming/partial/full receipt accounting.
- [ ] Rerun all listed tests; require no extra number on replay/source mismatch/old resolution. Checkpoint.

### Task 5: One browser recovery controller per identity and record kind

**Files:** New `lib/recordCreationClient.js`, `.d.ts`, `RecordCreationProvider.tsx`, `RecordCreationRecovery.tsx`; new `scripts/record-creation-client-qa.mjs` and provider fixture checks.

**Interfaces:** `createRecordCreationClient({storage,context:{uid,scope,environmentKey},command,isCurrent})` returns `pending(kind)`, `start({kind,data})`, `retry(kind)`, `check(kind)`, `cancel(kind)`, `activate()`, `dispose()`. It owns operation UUID creation. `<RecordCreationProvider member={member}>` is inside approved-staff WorkspaceGate; `useRecordCreation(kind)` returns shared `{pending,busy,error,outcome,start,retry,check,cancel}`. Use existing project-isolated `sessionRecoveryStorage`; namespace by mode/project, scope, actor and kind, not changing backend PID or role. One pending request is retained per kind per browser tab. A copied/replayed saved UUID is idempotent across tabs; independently created UUIDs are distinct intentions, not deduplicated by identical address/items.

- [ ] Write RED tests for two provider consumers attempting the same-kind save and two tabs replaying a copied saved UUID, persistence/readback failure before sending, lost reply, reload/reopen, NotFound retained until retry/cancel, immutable pending data, account/environment change and late old response. Created/Cancelled clears only the matching saved request; any unknown exception retains it. Current approved role change can resolve its original request. Distinct independent-tab UUIDs receive distinct codes rather than an unjustified content-based merge.
- [ ] Run `node --test scripts/record-creation-client-qa.mjs`; record RED.
- [ ] Implement the current-identity/epoch/in-flight guards and35-second observation timeout using the established clients as reference. Persist and read back canonical input before issuing the command; all retries reuse it. Provider owns one controller per kind so a header and modal cannot create competing controllers. Mounting/changing tabs must not allocate or make a creation request.
- [ ] Add labelled Check outcome, Retry saved creation and Cancel saved creation controls. Cancellation uses the server resolver; never silently clear unknown work on modal dismissal, generic error or navigation. Avoid displaying another account's pending input. Expose restored original data while pending rather than starting an editable replacement form.
- [ ] Rerun tests and provider fixture; assert no duplicate send and no lost pending request. Checkpoint.

### Task 6: Product, shipment and purchasing form integration

**Files:** Modify `app/page.tsx`, `lib/firebase.js`, `src/features/shipments/{ShipmentsWorkspace,ShipmentWorkspaceController,ShipmentEditor,ShipmentDetail}.tsx`, `shipmentCommands.ts`, `shipmentPresentation.ts`, `src/features/operations/{Procurement,InventoryDemoProcurement}.tsx`; create `scripts/fixtures/record-creation/` with its software-only harness, `scripts/record-creation-presentation-qa.mjs`.

**Interfaces:** All reachable ordinary create paths call Task5 with code-free data. `saveRecord(kind,input,existing)` becomes edit-only and rejects missing existing identity instead of silently creating an unrecoverable record. Shipment command ports distinguish `create` from `save/remove`; existing edit/dispatch commands retain authority lifetime/version/plan checks. Linked purchasing uses Task4's version2 Create.

- [ ] Write RED presentation/fixture cases for **Assigned automatically when saved**, no editable code input during creation, legacy/generated code read-only during editing, exact actual code in success/details and correct focus on non-code errors. Assert the barcode still accepts/scans real8–14digit input and is not replaced by the SKU. Preserve supplier receipt references and vehicle/licence inputs.
- [ ] Run `node --experimental-strip-types --test scripts/record-creation-presentation-qa.mjs` and the affected shipment presentation/command tests; capture RED.
- [ ] Integrate the shared provider with module-level recovery outside transient dialogs. Product editing keeps current stock/location safeguards. Shipment creation sends no reference, prepared edit/dispatch preserves the stored reference and handover. PO creation removes reference typing on ordinary and linked forms; correction/actions preserve current code and independent approval. Clear “choose another reference” copy that is impossible under locked codes.
- [ ] Keep current focused tabs, filters, page selections, plan-query fix, graphs, verification clarity and original-actor recovery. Read the actual code from the returned result or trusted record; never derive it from list length/time/random client values. Reports/CSV/customer views reuse stored fields, not an alternate ID.
- [ ] Rerun focused tests. With Playwright check actual fixture flows at320/390/768/1440px and short landscape: create/recover, reopen, account change, read-only copying, keyboard focus, status colours, and no document overflow. Fixtures must not activate camera/GPS or contact cloud. Checkpoint.

### Task 7: Full local verification, preserved-state evidence and release handoff

**Files:** New `scripts/record-creation-emulator-qa.mjs`, `record-creation-local-qa.mjs`, `record-creation-fixtures.mjs`, `scripts/fixtures/record-creation/` verification support, `docs/AUTOMATIC_BUSINESS_CODES_ACCEPTANCE_2026-11-02.md`; modify README/roadmap and existing creation-dependent QA fixtures listed below.

**Interfaces:** Explicit `createFixtureBusinessRecord(client,kind,data)` uses the new normal creation API and returns the actual ID/code, while `createLegacyFixture` writes exact registered legacy records through the explicit loopback-only fixture Admin. No transparent command-rewriting shim or production compatibility bypass. `record-creation-local-qa.mjs --profile <owned-local-profile> --parent-go` only runs against an already verified stack; it never starts one. Its profile pins the worktree root, current functions/shared code, dummy emulator browser config, explicit project/endpoints and a creation time no older than24 hours; profile/Hub validation occurs before SDK imports. A source-bound local profile is generated in this plan's ignored output area immediately before the run.

- [ ] Update direct create calls in `smoke-firestore`, `qa-review`, `shared-qa`, `account-access-qa`, `procurement-qa`, `stock-locations-qa`, `stock-retry-qa`, `warehouse-qa`, `capacity-qa`, `fleet-transport-emulator-qa`, `fyp-completion-emulator-qa`, `delivery-demo-emulator-qa`, `inventory-demo-procurement-emulator-qa`, `spark-web-qa` and `spark-cloud-scenarios` only where they create records. Preserve each suite's original assertions and add explicit manual-create refusal assertions; use returned codes rather than hardcoded expected manual numbers. Do not run scripts capable of cloud writes, physical tests or model inference in this plan. Record deferred parcel-fixture compatibility work without running parcel tests.
- [ ] Write RED actual-emulator acceptance: parallel staff create; duplicate barcode refusal with no consumed number; exact lost-reply replay; changed-input and cancelled-create races; role/account/source isolation; private counter/assignment/receipt denial; existing legacy-code edit refusal; archive/delete replay; initialization max/case/bound/drift tests; ordinary→linked PO sequence; exact version1 recovery. Count records/audits/assignments/counters before/after rather than accepting only response text.
- [ ] Start one disposable explicit-project emulator stack after checking no conflicting loopback stack exists. Set both `GCLOUD_PROJECT` and `GOOGLE_CLOUD_PROJECT` to `fyp-inventory-and-logistics`, `FUNCTIONS_EMULATOR=true`, completion mode `local-demo`, and loopback Auth9099/Firestore8081/Functions5001/Storage9199. Refuse ambient credentials/cloud profiles. The direct runner's ordered suite list is `smoke-firestore.mjs`, `qa-review.mjs`, `shared-qa.mjs`, `account-access-qa.mjs`, `procurement-qa.mjs`, `stock-locations-qa.mjs`, `stock-retry-qa.mjs`, `record-creation-emulator-qa.mjs`. Smoke establishes the disposable local scope. For a fresh start, invoke the installed Firebase CLI once with `emulators:exec --project fyp-inventory-and-logistics --config firebase.json --only auth,firestore,functions,storage` and the direct runner/profile command as its child. Against an already verified matching stack, invoke the direct runner only. Large model-dependent historical suites get contract/fixture checks only, clearly recorded, rather than a false model-inference pass.
- [ ] Implement/fix only demonstrated issues. Run `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd run security:scan`, `npm.cmd run security:history`; rerun the exact focused commands from Tasks1–6 and the ordered runner above. Expected: each exit code0 with no failing tests; build succeeds, lint has no errors, both privacy checks pass, and the acceptance receipt reports every declared scenario and cleanup complete. Actual acceptance must include create→pick→pack→handover→transport→dispatch→delivery-status and ordinary/linked PO approval→issue→partial/full receipt with unchanged authoritative stock accounting. Use approved fictional lineage fixtures instead of running the frozen AI. Prove exact registered-fixture cleanup and preservation of pre-existing emulator state.
- [ ] Verify published source main remains untouched:792 source and11 frozen artifact pins, current chain/proof-root/wallet/Reports state. Record isolated-worktree changes, all tests actually run/skipped, documentation, and a future activation checklist. The checklist must require fresh backup and complete scoped numbering baseline, exact counter-init approval, coordinated backend/UI/rules package, unchanged scientific model metadata after source-pin refresh, Desktop/tunnel fallback update and preserved current-chain registrations. Do not perform any of those live changes now.
- [ ] Request one fresh whole-change review under the preserved Native method. Fix Important/Critical findings with a demonstrated regression and rerun affected checks. Record remaining minor findings and local acceptance. No unrelated staging, commit, push or cloud publication; retain the task workspace/recovery evidence for the later reviewed release.

## Self-review and execution handoff

Self-review completed before handoff: all design sections map to Tasks1–7. Kind names, action names, outcomes, provider methods and version2 creation fields are consistent across tasks. All five Review Focus cases have owned RED/GREEN checks. Global numbering/uniqueness, initialization, legacy locking, original-actor recovery, ordinary/linked purchasing, browser clarity, role/rules, existing stock/handover/report contracts and deferred activation are covered. The plan leaves ordinary implementation bodies and private helper organization to the implementer rather than prescribing a second application.

The user's **Native** execution choice is already supplied. Ask them to review this complete plan and confirm it captures the approved design; wait for that review before implementation. Confirmation authorizes all seven local tasks and their registered fictional emulator tests/cleanup, without per-module prompts. It does not authorize live initialization/deployment/cutover, credentials/IAM/billing, Git publication or parcel/phone trials.
