# Remaining IILAS FYP Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Native execution is already selected. Steps use checkbox syntax for tracking.

**Goal:** Complete the remaining local FYP module functionality and demonstration evidence while excluding parcel testing and preserving all existing records and frozen research.

**Architecture:** Extend existing trusted Firebase commands with focused workflow modules, a common recoverable-operation helper, retained integrity checks and review, lock-aware transport/fleet edits, isolated customer grants and bounded reports. Keep the seven internal roles and add a separate Customer account boundary. Final source review precedes metadata-only rebinding and one preserved-state cutover; actual non-parcel scenarios then certify the result.

**Tech Stack:** Existing React/TypeScript/Vite, Firebase Auth/Firestore/Storage/Functions emulators, ethers/Solidity/Hardhat chain31337, Leaflet/OpenStreetMap and the unchanged Python model stack.

**Spec:** `docs/superpowers/specs/2026-10-25-remaining-fyp-completion-design.md`, approved by the user on25October2026 with Native execution. Fresh builder check returned `nothing important left`.

## Global Constraints

- Use MSI, Node22.13+ within major22, JDK21, npm.cmd/npx.cmd and dot-source `../Enter-IILAS.ps1` from the app. Research Python remains `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe`.
- Preserve the selected initial Admin, fixed owner scope, existing IDs/balances, seven staff roles, Prepared-Shipment Handover and navy/purple eight-card dashboard. No personal inventory merge.
- No parcel tests, images, camera capture, inference, training or consumed TEST replay. Metadata-only rebinding may preserve parcel service readiness; do not claim new parcel acceptance.
- No production deployment/data changes, public-chain transactions, real assets, external messages, public tracking links, organisation switching or unrelated features. No stage/commit/push/branch switch; keep neutral snapshots in this plan's own ignored workspace.
- Keep credentials, wallet keys, private configuration, datasets, emulator exports and test evidence ignored. Hardhat node logs contain test keys: never display them. Do not overwrite an existing different private/configuration file.
- Use literal127.0.0.1/localhost5173, one emulator stack and sequential Firebase suites. Before stopping an active stack, verify a fresh then-current export and owned PIDs. Never substitute an older checkpoint over newer data.
- Keep frozen models, canonical hash v1/v2 formats, scientific sources/claims/results, RAM/disk/time/output/cleanup guards and source-bound authentication intact. Missing facts remain unknown.
- Shared request observation35seconds; saved intent clears only on a correlated terminal outcome. Default UI page20, report scan200/request, export2000rows/2MiB/15seconds, query/filter date range at most366days. No silent truncation or full-data claims from partial pages.
- All new completion mutations require the exact emulator/project tuple plus `IILAS_FYP_COMPLETION_MODE=local-demo`. Existing workflows and historical reads remain compatible. Customer reads/downloads require live profile/grant checks and never qualify as shared staff.
- Blockchain RPC is literal`http://127.0.0.1:8545`, chain31337 and a pinned local deployment/code identity. No private keys in request payloads, browser source or public receipts.

## Review Focus

1. A wallet acknowledgement or HTTP response is lost, or configuration/source/role changes during signing: recover the original operation and transaction without another signature, stale success or altered provenance. Tasks1–3 own regression tests.
2. Customer is approved or a grant/role is revoked while views/downloads are open: customer must never mount staff subscriptions, read shared collections or retain an authorised new fetch after revocation. Tasks6–7 own tests.
3. Concurrent dispatch/reassignment/resource edit or duplicate operation races: swap locks atomically, preserve old assignments/balances and reject stale/occupied/disabled choices. Tasks4–5 own tests.
4. Sparse filters, unknown legacy dates, forged cursors, export caps or CSV formulas: bound reads/bytes, preserve scope, display honest continuation/coverage and refuse misleading exports. Tasks8–9 own tests.
5. Shared code changes, midnight, an offline stack or Windows export rename tempt state/model reset: preserve then-current hashes and all old studies; separate controlled-provider/GPS tests from real wallet/device acceptance. Tasks10–12 own tests and certification.

## File map and common interfaces

- `lib/completionWorkflow.js/.d.ts`: strict UUID/input/outcome validation and canonical operation identity. Generated copy in Functions via the existing prepare script.
- `backend/functions/completionOperations.mjs`: emulator capability, approved scope/roles and atomic recoverable pure mutations; private `completionRequests` receipts.
- `lib/completionClient.js/.d.ts`: actor/tab/scope/action storage,35second observation, exact retry/resolve and epoch fencing.
- Integrity: `lib/integrityWorkflow.js/.d.ts`, `backend/functions/integrityWorkflow.mjs`, `backend/functions/integritySource.mjs`, `src/features/operations/IntegrityVerification.tsx`. Preserve original `lib/integrity.js`, contract and old registration history.
- Fleet/transport: `lib/transportPlanning.js/.d.ts`, `backend/functions/fleetTransport.mjs`, `src/features/operations/FleetManagement.tsx`, `TransportManagement.tsx`.
- Customer: `backend/functions/customerAccess.mjs`, `customerEvidence.mjs`, `src/features/customer/CustomerPortal.tsx`, `src/features/operations/CustomerShipmentAccess.tsx`; narrow edits to access/account gate/AdminPanel/rules/Functions entry.
- Reports: `lib/reporting.js/.d.ts`, `backend/functions/reporting.mjs`, `src/features/operations/ReportsWorkspace.tsx` and `ReportExplorer.tsx`.
- Local composition: `scripts/prepare-fyp-completion-local.mjs`; separate ignored sidecar composes the existing delivery profile and local deployment. No mutable secret file cutover.

Common pure mutation intent contains `operationId:UUIDv4` plus closed action-specific fields. Terminal DTO is exact `{state:'Completed'|'Cancelled',operationId,action,recordId:string|null,version:number|null,replayed:boolean}`. `runCompletionOperation({auth,scope,action,input,roles,resolveOnly,work})` reads authority/receipt, calls read-only `work(tx,member)->{result,apply}`, then applies writes plus receipt/audit. No transaction reads follow `apply()`. Resolve-before-send writes Cancelled. A current Approved original actor can recover its terminal receipt after a role change; new work still checks the action's roles. Foreign/revoked access denies.

## Task 1: Shared strict operation and client recovery foundation

**Create:** common lib/client/backend files above; `scripts/completion-contract-qa.mjs`, `completion-client-qa.mjs`, `completion-operation-qa.mjs`. **Modify:** `scripts/prepare-functions.mjs`, `.gitignore`, `firestore.rules` for generated copy/private receipt denial only.

**Interfaces:** `completionUUID`, `completionExact`, `completionCanonical`, `validateCompletionOutcome(value,{action,input})`; `createCompletionClient({storage,context:{uid,scope,tab},command,isCurrent})->{pending,start(action,input),retry(action),resolve(action),activate,dispose}`; `assertCompletionLocal()`, `runCompletionOperation` as defined above. Storage key `iilas.completion.<scope>.<uid>.<tab>.<action>`; customer read-only portal does not need shared scope or this mutation helper.

- [ ] Write RED tests for unsupported/extra/coerced input, duplicate UUID/receipt action, failed storage-before-send, lost successful reply, reload, mismatched result identity/version, concurrent submit/retry/resolve, changed account/view/intent, malformed saved bytes retained,35second timeout with late result and resolve-before-send tombstone. Pure mutation fake must reject read-after-write and prove exact replay/current authority/foreign/revoked denial.
- [ ] Run `node --test scripts/completion-contract-qa.mjs scripts/completion-client-qa.mjs scripts/completion-operation-qa.mjs`. Expected: genuine missing-module/behavior failures before implementation.
- [ ] Implement minimal shared modules. `assertCompletionLocal` checks FUNCTIONS_EMULATORtrue, both project IDs`fyp-inventory-and-logistics`, Firestore8081/Auth9099/Storage9199 on127.0.0.1 and explicit local-demo capability. Store only bounded canonical intents and safe outcomes, never tokens. Add private receipt rule and generated-copy ignore.
- [ ] Run prepare plus the same tests; expected GREEN. Verify source-copy equality and old stock operation tests. Retain scoped snapshots; no commit.

## Task 2: Trusted blockchain preparation, retained checks and exception review

**Create:** integrity lib/backend/source files; `scripts/integrity-workflow-contract-qa.mjs`, `integrity-workflow-command-qa.mjs`. **Modify:** `backend/functions/service.mjs` registration of new actions, rules/indexes for new collections.

**Interfaces:** `createIntegrityCommands({rpc,clock,configuration})` exposes `getIntegrityAvailability`, `prepareIntegrityRegistration`, `registerIntegrityTransaction`, `resolveIntegrityRegistration`, `checkIntegrityRecord`, `resolveIntegrityCheck`, `reviewIntegrityException`, `resolveIntegrityReview`. Registration intent `{operationId,kind:'inventory'|'delivery',recordId}`; submitting adds only `transactionHash` to that saved operation. Check intent same three fields. Review intent `{operationId,exceptionId,expectedReviewVersion,decision:'Acknowledge'|'NeedsFollowUp',notes:3..500chars}`. Prepare returns original source/digest/reference, chain/contract, authorised wallet hint, block window and state; keys never appear. `captureIntegritySource(tx,{scope,kind,recordId})->{snapshot,canonical,digest,referenceHash,eligibility}` preserves canonicalv1/v2 exactly.

- [ ] Write RED tests: deterministic unchanged historical hashes, committed movement/evidence eligibility, malformed legacy refusal, real file-byte versus recorded-file-digest difference, missing file/RPC, absent/matching/different registry digest, wrong deployment/network/receipt/event/digest, changed source/role/config at finalisation, duplicate concurrent operations, lost submitted response and same-transaction replay, expired/unknown pending claim, and independent review version/provenance/old-record immutability.
- [ ] Run the two integrity suites plus common tests; expected RED before new modules.
- [ ] Implement external RPC/file I/O outside transactions, then fenced publication. New public collections `integrityChecks`, `integrityExceptions`, `integrityReviewEvents` and private `integrityRequests`,`integrityLocks`; public writes denied. Preserve existing `verificationRecords` and old handlers for compatibility. Registration lock per scope/kind/record expires after15minutes; it prevents another signature while reconciliation is needed. RPC operations capped15seconds, safe errors only. Events reconciled from saved starting block to at most256blocks; unresolved older/ambiguous outcomes remain Pending/manual reconciliation.
- [ ] Publish check outcome `Verified|Unmatched|NotRegistered|Unavailable`, original source/hash/deployment/observation identity and safe error code. File read limit10MiB; stream hashing. Unmatched/failure review remains separate and never changes source/chain/model acceptance. Private receipt and public shared-read rules/indexes updated together.
- [ ] Run focused suites and existing canonical/contract tests; expected GREEN and unchanged original canonical bytes/contract source.

## Task 3: Wallet UI, saved integrity history and independent exception review

**Create:** `IntegrityVerification.tsx`, `scripts/integrity-workflow-client-qa.mjs`, `integrity-workflow-ui-qa.mjs` and isolated non-parcel browser fixtures. **Modify:** `ResearchVerification.tsx`, `operations.css` for new workflow/history signposting, preserving generic AI history.

**Interfaces:** `IntegrityVerification({member,movements,evidence})` uses Task1client and Task2actions. Browser provider only signs local chain31337 to the prepared registry. Store intent before preparation and tx hash before backend submission. Resolve/retry controls remain outside selection dialogs and show original workflow/record/transaction identity.

- [ ] Write RED provider/client/browser cases for missing wallet, rejected signature, wrong chain before send, successful sign/receipt, lost wallet hash response, lost callable acknowledgement/reload, already registered, source changed after signing, another actor's lock, stale review and read-only staff. Verify no second signature on ordinary retry and no secret/private key fields.
- [ ] Implement three explicit outcome labels, pending/Unavailable warnings, original selected facts/hash/version, retained check pages20, exception queue20 and independent review revisions. Keep old verification history readable. Filter experimental parcel records exactly as existing policy; all new evidence fixtures are ordinary proof PDFs/text, never parcel images.
- [ ] Run client/UI fixtures at1440/390 and source-contract suites; expected GREEN, labelled keyboard controls/no overflow/no unexpected network. Controlled provider fixtures are software evidence, not MetaMask acceptance.

## Task 4: Fleet edits, atomic transport reassignment and map estimate contract

**Create:** transport lib/backend files; `scripts/transport-planning-qa.mjs`, `fleet-transport-command-qa.mjs`. **Modify:** service registration, rules/indexes only as required by existing collections/new private receipts.

**Interfaces:** `planningEstimate({origin:{latitude,longitude},destination:{latitude,longitude},speedKph})->{method:'great-circle-v1',distanceKm,estimatedHours}`; coordinates finite lat[-90,90]/lon[-180,180], speed5..120, no coercion. Zero distance produces0, not unknown. Applying an estimate below the existing scheduling minimum0.1hours requires an explicit admissible manual planning value; never silently clamp or claim a road ETA. `updateFleetResource` intent `{operationId,kind:'vehicles'|'drivers',id,expectedVersion,data}`; `reviseTransportPlan` intent `{operationId,shipmentId,expectedShipmentVersion,expectedPlanVersion,vehicleId,driverId,origin,carrier,plannedDate,distanceKm,estimatedHours,cost,planning:null|estimateInputs}` with existing numeric/text bounds.

- [ ] Write RED tests for coordinate/unit bounds, identical/antipodal points and symmetry; stale/duplicate identity edits; disabled driver, insufficient capacity, foreign/occupied resources; concurrent dispatch/reassignment/edit; exact saved operation recovery; no partial lock release, stock change or date clamping.
- [ ] Implement existing shared validation and current authority through Task1operations. Read old/new resources, profiles, shipment, plan and all locks before writes. Swap locks and plan/shipment/audits atomically only while Prepared/pre-dispatch. Preserve old IDs/history/versions; scheduled/in-delivery resources cannot be edited unsafely.
- [ ] Run geometry/command/common and existing shared-input/location contracts; expected GREEN. All planning estimates labelled approximate and no routing/geocoding network calls.

## Task 5: Fleet and transport interfaces and filters

**Create:** FleetManagement/TransportManagement components, `scripts/fleet-transport-ui-qa.mjs` and fixtures. **Modify:** `Operations.tsx` to delegate these modes and `operations.css`; remove only superseded inline markup/helpers.

**Interfaces:** components take existing `{member,shipments}`/neededDataRecord props, load bounded resource/assignment pages and Task4commands. Existing entity registration/fuel/maintenance actions remain available. Edit/reassign intent derives current source versions and uses Task1recovery. No real GPS request from planning map.

- [ ] Write RED UI cases for base versus effective availability, editing each resource/status, assignment visibility, lock rejection, search/status/page controls, explicit cancellation versus atomic reassignment, mapwaypoints and estimates/manual override, stale/lost requests and role changes.
- [ ] Implement accessible existing-theme forms/dialogs and current assignment views; map preview draws explicit points/line and labels great-circle estimate. Keep manual distance/time/cost possible. No changes to warehouse/dispatch semantics.
- [ ] Run focused browser/contract checks, TypeScript build and lint; expected GREEN at1440/390 with no new warnings or overflow. Static placeholders do not substitute for later actual command/browser scenarios.

## Task 6: Customer account isolation, grants and scoped projections

**Create:** `backend/functions/customerAccess.mjs`, `scripts/customer-access-command-qa.mjs`, `customer-access-rules-qa.mjs`. **Modify:** `access.mjs`, service dispatch, rules/indexes and account-role declarations.

**Interfaces:** retain `ROLES`seven staff and add `ACCOUNT_ROLES=[...ROLES,'Customer']`. Staff `approvedTransaction`/`approvedScope` never admits Customer. New routing handles `getCustomerShipments({cursor?})`, `getCustomerShipment({shipmentId})` after live CustomerAuth check without accepting workspaceId/ownerId. Staff commands `grantCustomerShipment`/`revokeCustomerShipment` use Task1intents with `{operationId,customerUid,shipmentId,expectedVersion,shareLocation:boolean,notes}`. Private grants/operation receipts; no raw client read of grant/admin collections.

- [ ] Write RED authority/rules tests for pending/self-assignment, Customer versus all seven staff, unknown/foreign/missing grants, guessed ID/forged scope, duplicate/stale grant/revoke, role revocation during read, initial Admin invariants and zero changes to old staff data. Assert Customer cannot read any shared/system/staff/product/AI/verification collections or invoke existing staff commands.
- [ ] Implement Admin role assignment via ACCOUNT_ROLES and separate staff/customer predicates. Grant authority Admin/Manager/Logistics; validate live Customer and scoped shipment, no automatic association. Page20 only the requesting UID's live grants; DTO contains reference/date/status and safe event labels/times, no internal notes/items/costs/staff identifiers. Location off by default and only exposed during active delivery with explicit shareLocation and valid latest point/time/accuracy.
- [ ] Add private all-deny rules and indexes for customerUid/active and scoped staff grant management. Keep staff shared reads unchanged. Run pure/rules contracts and existing account command tests; expected GREEN before actual emulator phase.

## Task 7: Customer portal and authenticated proof download

**Create:** CustomerPortal/CustomerShipmentAccess components, `backend/functions/customerEvidence.mjs`, `scripts/customer-portal-ui-qa.mjs`, `customer-evidence-qa.mjs`. **Modify:** WorkspaceGate before staff subscriptions, AdminPanel account dropdown, Functions index for `customerEvidence`, account wording and styles.

**Interfaces:** portal receives own approved profile/UID, not shared scope. Staff grant panel receives member+scoped shipments+explicit Customer candidates. Endpoint GET/OPTIONS with fresh Firebase ID token in Authorization header; closed query only `{shipmentId,evidenceId}`, never private-token URLs. `authoriseCustomerEvidence` rechecks live account, grant and matching current delivery.proofId, owner/shipment/type/stage each request. Stream at most10MiB within15seconds; no-store, safe content disposition, exact allowed local CORS origins and no redirects/public signed URLs.

- [ ] Write RED tests for customer staff-subscription prevention, portal empty/denied/granted/revoked views, cross-customer IDs, metadata redaction, location off/closed, absent/wrong-type proof, malformed paths/content types, large/slow file and scope/role/grant changes. Reject nonGET and unexpected origins. Already downloaded bytes cannot be recalled; subsequent requests must deny revoked access.
- [ ] Implement separate account route and read/download UI with current-account/epoch fencing, objectURL cleanup and no local persistence of private files. Disable/reject/role changes clear protected content. No Parcel Image/photo route, wallet or staff controls in CustomerPortal.
- [ ] Run UI/download/account/rules suites; expected GREEN at both widths and no new warnings. Actual downloads later use disposable non-parcel proof bytes only.

## Task 8: Bounded report queries, coverage and safe export

**Create:** reporting lib/backend files, `scripts/reporting-contract-qa.mjs`, `reporting-command-qa.mjs`. **Modify:** service/indexes/generated copy script.

**Interfaces:** `validateReportRequest({resource,filters,cursor?})`; `queryReport(auth,scope,input)->{rows,cursor,hasMore,scanned,coverage,observedAtMs}`; `exportReport(auth,scope,{resource,filters,mode:'page'|'filtered',cursor?})->{fileName,csv,rowCount,coverage,observedAtMs}`. Closed resource registry covers products, movements, purchasing/incoming, approvals/audit, shipments/events, fleet/transport and retained inventory/delivery/rule/integrity results. Read-only existing parcel history may be linked without invoking/testing parcel functionality. Allowlisted columns only. Filters include relevant ID/SKU/category/status/type/product/supplier/actor/driver/vehicle/risk/verification/date fields; reject inapplicable keys rather than silently ignoring them.

- [ ] Write RED tests for wrong-role/resource/scope, extra/coerced filters, invalid/overnight/Malaysia dates, max366day range, identifier normalisation, forged/mismatched cursors, sparse pages, missing legacy dates, unknown risk/provenance, stable ordering, read/scan limits and cancellation. CSV cases include formulas preceded by whitespace, quotes/newlines/Unicode, byte/row/deadline overflow and no silent full-export truncation.
- [ ] Implement per-resource indexed scope/identifier/time queries and bounded matching where legacy fields need it. Page20, scan200/request; return honest continuation when scan cap reached. Default order includes undated legacy records via document identity; dated filters explicitly disclose undated exclusion. No source backfill or invented model classification. Driver views restrict current assignments, Customer refuses.
- [ ] Export page explicitly or bounded selected-data filtered export up to2000rows,2MiB,15seconds; when completeness cannot be established within caps, refuse filtered export and ask for narrower filters. Escape dangerous CSV cells and allowlist filenames/columns. No dataset/model/private configuration columns.
- [ ] Run reporting/common/source contract tests; expected GREEN and no operational mutations. Add indexes for supported query shapes, not an unrestricted dynamic collection/field API.

## Task 9: Reporting workspace, product filters and exception history

**Create:** ReportsWorkspace/ReportExplorer components, `scripts/reporting-ui-qa.mjs` and fixtures. **Modify:** Operations reports delegation, ResearchVerification integration, product status/identifier filter controls in `app/page.tsx`, shared styles.

**Interfaces:** `ReportExplorer({member,resource})` consumes Task8DTOs; current page, query identity and coverage remain explicit. ReportsWorkspace embeds existing adjustment/correction and historical verification/prediction views plus Task3exception/review workflow. Product filter extends existing catalogue search/status without balance changes.

- [ ] Write RED UI cases for every relevant filter family, role-gated resources, no-data versus incomplete sparse page, clear filters/new cursor, lost export response, current-page versus complete filtered export labels, legacy-date disclosure, stale account/role/filter result suppression, original model provenance and private-field exclusion.
- [ ] Implement accessible bounded pages/CSV controls, observed-at/source/coverage labels and original retained history. Preserve eight-card dashboard. Add filters where the catalogue is missing them without replacing product IDs or changing stock.
- [ ] Run UI/report/TypeScript/lint gates; expected GREEN at1440/390. Do not label a filtered page sum as a total inventory valuation or system-wide statistic.

## Task 10: One final source review, deployment-bound local profile and preserved cutover

**Create:** `scripts/prepare-fyp-completion-local.mjs`, `scripts/fyp-completion-profile-qa.mjs`. **Modify only serving bindings as necessary:** stock/delivery Python/Node source lists and parcel metadata source bindings; no scientific source/model/claims or parcel test edits. **Ignored evidence:** `outputs/fyp-completion-20261025/`.

**Interfaces:** sidecar schema`fyp-completion-local-profile-1.0` binds existing delivery profile bytes, source-complete serving manifests and `{rpcUrl,chainId,address,deploymentTransactionHash,deploymentBlock,runtimeCodeSha256}`; independent role launch environment returns Backend/local completion+registry or the unchanged individual model roles. Private profiles exclusive `profile-UUID/private.json`; safe receipt has no tokens/keys. `IILAS_FYP_COMPLETION_MODE=local-demo` only on Backend.

- [ ] Write RED profile tests for path/link/hardlink/exclusive output, project/URL/chain/code/deployment pin drift, changed base, separate role capabilities, no research token leakage and no file values in errors. Implement composer/launcher preserving existing base schema/capabilities and native limits.
- [ ] Capture final source review package against this plan's pre-edit neutral snapshots, not unrelated HEAD dirty work. Dispatch Native's one fresh final reviewer on the most capable permitted model with spec, plan, Review Focus and ledger. Fix Important/Critical once with RED→GREEN plus affected suites; defer Minors and record all rulings/declined judgements. No second source review. No consumed scientific change may be hidden by rebinding.
- [ ] Verify all frozen/private/report/model hashes. Prepare fresh metadata-only source lists/descriptors and sidecar after source fixes. Static list equality and health may confirm readiness; no parcel test/inference is run.
- [ ] Capture then-current full state/export before any owned service stop. Verify fresh Windows staging export if final rename fails. Import one stack, start required model services/app/chain with the sidecar and verify existing documents/Auth/Storage identities/hashes, allowing only established normal Auth import timestamp variance. Expected: source/authentication/capabilities ready, no original state loss or guard relaxation.

## Task 11: Actual non-parcel end-to-end scenarios and participant-dependent checks

**Create:** `scripts/fyp-completion-emulator-qa.mjs`, `fyp-completion-browser-qa.mjs`, `customer-access-emulator-qa.mjs`, `integrity-workflow-emulator-qa.mjs`, `fleet-transport-emulator-qa.mjs`, `reporting-emulator-qa.mjs`, `scripts/fyp-completion-output.mjs`. Fixtures/evidence only in ignored exclusive kind-UUID directories.

- [ ] Predeclare disposable product/stock receipt, warehouse/dispatch, non-parcel proof PDF and separate staff/customer actors. Test real chain registration/check/Unmatched/absent/error and immutable original; independent exception reviews/revisions; lost signing/callable acknowledgements and exact replay; wrong network/rejection/permission negatives. Controlled-provider evidence is labelled separately from actual MetaMask acceptance.
- [ ] Test resource edits/atomic plan reassignment and concurrent dispatch with exact balance/lock preservation; customer grants/revoke and all direct shared-read/staff-command/file isolation cases; filtered report/query/export caps and safe CSV. Test GPS software permission/denied/unavailable/closure/assignment without physical location capture or parcel routes.
- [ ] Inspect and run original smoke/QA/shared/account/location/stock/procurement and affected new suites sequentially through an explicit parent-GO preservation harness. Omit every parcel suite and inspect shared suites for hidden parcel paths. Keep original failures/receipts; fix only proven causes. Avoid midnight fixtures by using explicit future test dates while preserving application validation.
- [ ] Actual browser at1440/390 covers new staff workflows and CustomerPortal using separate identities, signed local-chain registration when an authorised wallet is available, exception review, role/grant revocation, lost replies/reload, downloads, filters/export and no unexpected sensitive outbound requests. Test source changed during operations and pending views after role changes. Save screenshots and inspect visually.
- [ ] Complete real MetaMask onboarding/unlock/required terms/signing and any actual phone/location capture only through allowed normal user participation/consent. Do not read/store/display their wallet secret or invent device evidence. Continue independent tests/docs while these are pending; record exact pending user action instead of claiming acceptance.
- [ ] Clean only proven owned fixture identities/objects after proving originals unchanged. Verify full baseline exact, current initial Admin/config/balances, zero orphaned operations and unchanged frozen studies. Expected: all automated gates green and clear separate wallet/device acceptance status.

## Task 12: Final report reconciliation, guides, diagrams and demonstration package

**Create/update:** `docs/FYP_COMPLETION_AUDIT_2026-10-25.md`, requirement-to-test matrix, blockchain/customer/fleet/transport/report contracts/local guides, README workflows, REQUIREMENTS/FULL_SCOPE_TRACEABILITY/PROJECT_ROADMAP, outer MSI_SETUP_STATUS and archive CHAT_HANDOVER. Academic drafts/diagrams/slides/script in `../fyp-cwk-2/docs/final-demo-20261025/`; original portfolios unchanged. Apply installed document/presentation skills when those artefact formats are authored.

- [ ] Reconcile all report FRs with completed code/test/evidence or an explicit agreed exclusion/human acceptance dependency. Retain actual81.53% stock and98.33% delivery synthetic-policy interpretation and known first-failure disagreement. Do not fabricate physical parcel/GPS/real-delivery accuracy.
- [ ] Prepare current architecture, use-case, data model and key sequence diagrams; Chapter4 implementation/testing material and Chapters1–3 alignment notes; local setup/recovery/troubleshooting and role-specific user instructions; slides/demonstration script with anonymous fixtures and screenshots. Render/inspect exported artefacts and verify links/readability. No original report overwrite or external upload/message.
- [ ] Run final build/lint/no-new-warning, appropriate non-parcel unit/actual suites, generated/source-list equality, model/scientific/private/report hashes, tracked/history/expanded/outer secret scans, ignored output checks and `git diff --check`. Verify final data/chain/service receipts and no publication. Do not repeat expensive successful checks without a new concern/change.
- [ ] Record Native task completion only from real final receipts. Preserve own ignored ledger/snapshots because no commits are authorised. Use finishing-a-development-branch with the existing keep-local preference; no redundant merge/push decision is needed.
- [ ] Final report: what works, measured limits, exact remaining participant actions/exclusions, current startup/checkpoint pointers, exhaustive rulings/costs and deferred Minors. Mark the goal complete only when its required completion criteria are met; otherwise continue independent work and keep the participant dependency accurate.

## Plan self-review and handoff

Spec coverage: common authority/recovery→1; chain/eligibility/checks/review→2/3; fleet/transport/map→4/5; customer isolation/files/location projection→6/7; reports/filters/CSV→8/9; immutable bindings/review/state→10; actual non-parcel evidence/participant boundaries→11; final academic/runtime handover/privacy→12. Shared access, profile/source and query interfaces make this one dependent completion plan rather than independent implementers editing the same files.

The five Review Focus failures have owning tests above. New canonical operation outcome and action names are consistent; old hash/scientific formats are unchanged. Exact report resources/index details and UI layout remain bounded builder decisions explicitly permitted by the spec; privacy and coverage behavior are not optional. The design's owner-scope/customer separation occurs before staff subscriptions. Native execution and the no-commit preference are preserved. Request review that this consolidated plan captures the approved design, then execute all12tasks without per-module approval prompts.
