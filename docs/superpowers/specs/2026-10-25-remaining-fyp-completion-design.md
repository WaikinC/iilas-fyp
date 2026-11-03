# Remaining IILAS FYP demonstration completion design

25 October 2026. Status: written for builder check and user approval. This document covers the remaining local demonstration scope; it does not claim implementation or acceptance yet.

## Intent and existing decisions

Finish the report-required functionality which remains after the verified inventory and delivery AI demonstrations. The user explicitly asked to complete the remaining tasks with a tracked goal and exclude parcel testing. Their existing Native execution preference, local MSI workload, React/Firebase/Python/Solidity/Leaflet stack, seven shared staff roles, preserved initial Admin and warehouse-to-dispatch boundary remain authoritative.

The original report hashes and the current source gaps are recorded in [the completion audit](../../IILAS_REMAINING_COMPLETION_AUDIT_2026-10-25.md). Wong FR-32–37 and Choong FR-2/3/6/12–15 are the main new requirements here. The original reports prioritise research functions over unrelated logistics expansion. Existing working products/stock/warehouse/purchasing/dispatch and frozen AI studies are preserved.

## Approaches and scope decisions

The previously selected approach is to finish the existing local FYP application. Replacing the stack or deploying a cloud/public-chain system conflicts with the user's instructions and adds no necessary demonstration evidence. A documentation-only finish would leave the identified reporting, customer and review functions unimplemented.

The builder proposes completing the existing application in five dependent batches, with one combined written approval and a detailed Native implementation plan. Each batch gets focused tests; final source review and one preserved-state cutover follow source completion. This order is a builder decision: blockchain/review first, fleet/transport, restricted customers, reports, final demonstration evidence.

Builder decisions open to correction in this written review:

- Local Hardhat chain31337 only; browser wallet signing uses an authorised disposable local test account. No real assets or public network.
- Basic map planning uses explicit waypoints and clearly labelled great-circle distance/time estimates. It sends no addresses to a geocoder or routing API. Actual road distance, traffic ETA and route optimisation are outside this completion scope; existing manually entered operational distance/cost stay available.
- Customer access uses an Admin-approved Customer account and explicit shipment grants, with proof-of-delivery access and optional latest-location sharing. It never uses the internal Viewer role as a substitute.
- CSV exports and report queries have fixed resource caps and honest pagination/completeness labels. No invented counts, risk labels, missing dates or forecasting context.
- Human phone/wallet/supervisor actions are distinguished from automated evidence. A missing participating person is recorded as pending, not simulated and called accepted.

## Non-goals and anti-goals

No parcel tests of any kind, camera access, parcel images, inference, training or consumed TEST replay. No new AI study or attempts to improve metrics in this goal. No production deployment, production data changes, public-chain transactions, cryptocurrency purchases, supplier/customer messages, organisation switching, personal-inventory merging, public tracking URLs or additional features such as continuous GPS, route optimisation, import/scanning or IoT sensors. Do not stage, commit, push or switch the dirty checkout without a later explicit request. Keys, tokens, datasets, emulator exports and test records stay ignored.

## 1. Blockchain registration, retained checks and exception review

### Existing boundary

Preserve `IntegrityRegistry.sol`: authorised registrars can register one nonzero digest per opaque reference; the original cannot be overwritten. Preserve `IILAS-INVENTORY-v1/v2` and `IILAS-DELIVERY-v1/v2` canonical formats and all historical digests. Full operational data remains in Firebase; only reference/digest plus the contract event wallet belong on-chain.

On MSI the existing two contract tests now compile and pass. The local service ports were offline at audit time. Before starting anything, verify current listeners, the newest known export receipt and file hashes. Never overwrite a newer running emulator with an older checkpoint. Create fresh exclusive local-chain deployment/configuration evidence under the new ignored completion output directory; do not overwrite an existing blockchain-local configuration silently.

### Trusted checks and eligibility

New server commands prepare an eligible selection, record a confirmed registration, perform a retained verification check, review an exception and resolve exact saved operations. They derive fixed shared scope and current staff authority. Inputs identify workflow and record; they do not supply authoritative digest, status, role or source contents. Existing committed stock movements and registered delivery evidence remain the source. Missing/malformed/unsupported legacy eligibility is explicit and blocks new registration until reconciled; historical verification reads remain available.

Preparation captures source version/digest, protocol, contract address, chain31337 and observation time. The backend independently validates the RPC chain, successful receipt, intended registry, exact Registered event/reference/digest and current lookup before retaining registration. Final transactions recheck source and authority. A matching hash never proves original truth, damage liability or fraud.

A verification check saves an immutable attempt with workflow/record, original observation/source version, expected and observed digests, chain/contract/block identity, outcome and a safe failure code. Outcomes remain `Verified`, `Unmatched`, `NotRegistered` or `Unavailable`; Pending describes an unfinished operation, not a fabricated verification result. For evidence, check the bounded original Storage object bytes against its registered file digest as well as canonical record identity; missing/unreadable files remain explicit. Keep current experimental parcel exclusions intact; use non-parcel disposable proof files for all new tests.

`Unmatched` and qualifying failed/unavailable checks create a separate exception item. A different Admin/Manager may record `Acknowledge` or `NeedsFollowUp` with required notes and expected review version. Append review revisions and audit entries; change only review summary/queue status. No original movement, evidence, digest or chain reference is rewritten. Only an authoritative later check can produce a new Verified observation.

### Recovery and wallet boundary

Use UUIDv4 actor/scope/action-bound immutable private receipts for check, registration and review. Persist browser intent before wallet/RPC work; once obtained, persist the transaction hash before calling the backend. Retry a submitted hash without requesting another signature. Resolve unknown unsent commands to a tombstone, retain malformed saved intent for reconciliation, and permit original currently Approved actors to recover exact terminal outcomes after role/configuration changes. New writes/final publication still require current authority. No blockchain or HTTP call inside a Firestore transaction.

If signing acknowledgement is lost before a transaction hash is known, reconcile the selected reference/digest and authorised wallet against a bounded local block/event window before offering another signature. If that cannot prove an outcome, show Pending/manual reconciliation. The contract's once-only reference rule is an additional guard, not a reason to submit duplicate transactions automatically. A wallet rejection and wrong network produce no recorded success. Never enter or display wallet secrets; normal wallet onboarding/unlock/terms prompts may require the user.

Public shared collections: verification attempts, exception items and immutable review events. Private request receipts deny every direct client read/write. Public writes remain trusted-command-only. Preserve old successful `verificationRecords` and generic history; add new traceability without fabricating backfill.

## 2. Fleet and transport completion

Reuse existing `entity` validation/version checks, unique vehicle/driver identities and assignment locks. Add accessible edit dialogs for vehicle capacity/status/registration and driver name/licence/status/account association. Validate current active delivery-team account and duplicate identity again on commit. Active assignments prevent unsafe resource edits. User account disabling remains an Admin action; a driver resource's availability is distinct from account access.

Display effective assignment from `resourceAssignments`/current transport and shipment state, labelled Available, Scheduled, In delivery or Unavailable/Maintenance as appropriate. Preserve original base status and locks; do not manufacture availability when source is unknown. Provide search/status filters and bounded pages.

Transport editing/reassignment is explicit and allowed only before dispatch. A trusted versioned transaction reads the shipment, old plan/locks and proposed vehicle/driver/account, validates capacity/availability, updates plan and shipment assignment/audits and swaps locks atomically. Any concurrent dispatch, stale version, foreign resource, disabled account or occupied resource fails without partially releasing the old assignment. Dispatched/historical assignments remain protected; cancellation still follows the existing contract.

The planning map accepts explicit valid origin/destination waypoints. Great-circle kilometres and a user-entered bounded planning speed produce an approximate time; label both as estimates, not road routing or traffic prediction. Coordinates are optional and unknown remains unknown. Staff deliberately apply estimates to the existing distance/estimated-hours fields, review manual carrier/cost/date and schedule. Stored map context records method/version/waypoints/input speed and preserves manual values. No geocoding, address transmission, automatic dispatch or load/route optimiser. Schedule views include relevant reference, status, driver/vehicle and date filters.

## 3. Customer isolation

### Accounts and server boundary

Keep `ROLES` as the seven internal staff roles; introduce a distinct account role `Customer` through an explicit account-role union. Only Admin can approve or assign it. Pending registration cannot self-select a role or infer customer rights from email/recipient text. Preserve the initial Admin's non-removable role and all existing staff profiles.

Separate the staff `approved()` Firestore predicate from an approved customer predicate. Customer must never qualify for shared operational reads, system/config, staff directories, product/stock/audit/AI/verification collections or existing staff commands. All seven existing staff roles keep their current shared-system policy. Route an active Approved Customer to a separate portal before mounting staff data subscriptions; disable/reject/role changes clear its protected view.

Customer command routing checks the live Auth UID, current profile and private grant inside the server; it does not pass through a staff scope path or accept a client ownerId. Queries are bounded to the current UID's active grants. Admin/Manager/Logistics explicitly grants or revokes an existing scoped shipment to an approved Customer, with attributable versioned/recoverable commands and required notes. Do not automatically associate existing shipments or expose public bearer links.

### Customer projection and files

The portal shows only each granted shipment's reference, expected date, controlled status and a limited public event timeline. Exclude stock/items/costs/internal notes, other customers, staff identities/UIDs/contact details, AI scores, audit evidence and unselected files. Missing/closed data remains explicit. The customer cannot update delivery, register evidence, review results, manage users or sign blockchain registrations.

Proof access is limited to the current matching delivery-stage Proof of Delivery referenced by the granted shipment. No parcel-analysis/photo route is added or tested. Return safe metadata only through the customer command. File bytes use a separate authenticated download endpoint with fresh Auth/profile/grant/owner/type checks on every request, bounded original size (existing upload maximum), streaming/time limits and `Cache-Control: private, no-store`. No public download tokens, long-lived signed URLs or private token-bearing query strings. A revoked grant or role denies subsequent requests; already downloaded bytes cannot be recalled and the UI does not claim otherwise.

Latest-location sharing is an explicit grant option, off by default, and available only during active delivery. It returns only a valid latest submitted point/time/accuracy with a clear periodic-update label. Do not share driver history or silently request geolocation. The staff GPS permission remains a deliberate user action; customer access never triggers a new GPS capture.

## 4. Reports, filters and exports

Add role-appropriate Inventory and Logistics report panels using existing source collections, not copied operational data. Cover product/status/category/identifier, stock movements/type/product/actor/date, purchasing/supplier/status/date, delivery/status/driver/date, transport/fleet/assignment and retained AI/rules/verification/review states. Product catalogue status/identifier filtering is included where the current page lacks it. Keep the navy/purple dashboard and its eight cards; do not relabel page totals as system-wide totals.

Trusted report queries derive scope and permissions. Driver report views restrict to assigned records; Customer is refused entirely. Each resource has a closed filter schema, bounded strings/date ranges and explicit allowlisted output columns. Defaults use20-record pages, stable cursor identity and appropriate composite indexes. Cursors bind resource/filter/order; a forged cursor cannot change scope or read foreign record contents. Do not require a broad new search provider or backfill every old record merely to enable search.

Use indexed owner/identifier/time predicates where possible. Any additional matching over legacy data has a strict per-request scan/read/time cap, stable continuation and explicit `hasMore`, `scanned` and completeness metadata. An empty intermediate page cannot be called a globally empty result. Date filters explain exclusion of undated legacy records; defaults preserve access to undated historical records. Aggregate values are labelled for their actual page/export coverage; missing values are not converted to zero risk or verified status.

CSV export uses the same filters/authority and allowlisted columns. Set a fixed maximum row/byte/time budget. Export either the explicitly labelled current page or a bounded consistent selected-data export; when a full filtered export exceeds its cap, require narrower filters rather than silently truncating it. Escape CSV formulas, quotes and newlines, use safe filenames and include filter/coverage metadata. Exporting creates no operational changes. New query subscriptions and joins remain bounded. Whole-project large-scale analytics/rewriting every old dashboard query is outside this local FYP completion scope.

## 5. Runtime, verification and final handover

### Preservation and source bindings

Capture a neutral pre-edit baseline of current tracked/untracked nonignored source and hashes of private configuration, original reports, frozen studies/models and current serving descriptors. Keep ignored snapshots in this goal's own workspace. Do not read/write other Native plan workspaces. Before any future stop of an active stack, export and byte-verify the then-current full emulator state, or if services are offline verify the most recent known checkpoint before import. Reidentify PIDs/listeners; stop only owned services after confirming no active operations. Handle the Windows export-rename defect only through its fresh complete official staging export, exclusive copy and hash receipt.

After final source review, refresh affected metadata-only stock/parcel/delivery bindings and compose a new exclusive local profile, preserving the three frozen models and scientific identities. No refitting, threshold changes or consumed TEST replay. Parcel metadata may be rebound to shared code, but no parcel test or inference is run under this goal. Record that exclusion explicitly rather than claiming new parcel acceptance. Keep source/authentication/resource guards and one loopback emulator stack.

### Verification and evidence

Use deterministic meaningful tests for validators/contracts, trusted transactional/race/recovery/role boundaries, rules isolation, CSV/query caps and map estimates. Exercise actual Firebase emulators and the real local blockchain with disposable explicitly owned records and test wallets. Prove existing documents, accounts, object metadata, initial Admin/config and balances are unchanged after cleanup. Run original smoke/QA and affected non-parcel suites sequentially; inspect scripts before invoking any suite that might exercise a parcel path. No camera/parcel route is allowed as a hidden regression dependency.

Browser checks at1440px and390px cover new reporting/fleet/transport/customer/review workflows, keyboard labels/focus, lost replies, role changes, wrong network/rejection and no overflow. Separate actual MetaMask signing from controlled provider software tests. GPS software checks cover successful/emulated, denied, timeout/unavailable, assignment and closed-state cases with no automatic real-location capture. Real phone/location accuracy and a supervisor's judgement cannot be supplied by automation; record them as participant-dependent if unavailable.

Build includes TypeScript checking and Vite; lint permits only existing warnings. Run generated-copy/source-list equality, protected/private/model/report hashes, tracked/history/expanded/outer secret scans, Markdown links and `git diff --check`. Do not close unrelated apps or lower RAM/disk/native cleanup limits to pass tests. Make resource limitations actionable and continue independent work.

### Documents and demonstration

Update README staff/customer workflows, requirements/traceability/roadmap and account/transport/fleet/blockchain/report contracts together. Prepare current architecture/use-case/data/sequence diagrams, requirement-to-test matrix, local startup/recovery guide, user/troubleshooting guide, demonstration script, assessment screenshots and a presentation draft in the full workspace's documentation archive. Use disposable anonymous data and measured evidence. Original portfolios remain untouched; chapter updates are reconciled draft material, not a claim of supervisor approval. Keep code-only future GitHub transfer separate from private assets; no push is authorised here.

The final audit must name implemented requirements, test receipts, exact outstanding human actions and every excluded feature. The goal is complete only when the agreed implementable local scope and required verification are done; do not mark it complete merely because planning is finished, a browser test uses a mock, or human acceptance remains unavailable.

## Builder-facing open choices

The implementation plan may settle module/file names, exact DTO/index shapes, form layout within the existing theme, bounded cursor encoding, request timeouts consistent with current resource guards and the organisation of test fixtures. It must preserve the authority/recovery/privacy/immutability boundaries above. Those routine choices do not require separate user questions. If the source audit finds a report-required behavior incompatible with a frozen scientific contract, do not silently rebind or change that study; report the conflict and continue unaffected work.
