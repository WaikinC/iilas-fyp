# Customer workspace and orders implementation plan

> **For agentic workers:** Use superpowers:executing-plans with the preserved Native preference. Record task evidence and rulings in this plan's ignored ledger.

**Goal:** Complete Customer requests, linked staff fulfillment and readable safe tracking/verification UI locally.

**Architecture:** Closed shared contracts and recoverable trusted transactions create a separate request lifecycle; explicit staff conversion reuses the normal shipment allocator/preparation and private grants. Customer and staff React panels consume separate DTOs; existing warehouse/delivery pipelines remain authoritative.

**Tech stack:** React19/TypeScript/Vite, Firebase Auth/Firestore/Functions emulators, existing Spark/MSI command adapter, Hardhat verification reads.

**Spec:** ../specs/2026-11-04-customer-orders-design.md

## Global constraints

- Work only in isolated development checkout; no live source/profile/journal changes, Firebase deployment or cloud business writes.
- Preserve Admin/IDs/balances/roles, generated SHP codes and Prepared-Shipment Handover.
- 1–20 request lines; quantities1–10,000; page20; closed Customer DTOs; no direct collection access or inventory catalogue disclosure.
- No parcel/camera/phone/model training or scientific evaluation.

## Review focus

Lost replies/account changes, midnight date retries, concurrent accept/cancel, linked Draft deletion and re-granted/revoked proof access must not duplicate shipments, expose another Customer's facts or discard saved operations.

### Task1: Shared contracts and client recovery

Files: lib/customerOrders.js/.d.ts, customerOrderClient.js/.d.ts; scripts/customer-order-contract-qa.mjs and customer-order-client-qa.mjs.

- [x] Write and observe failing tests for exact request/decision/DTO schemas, limits, mapping completeness, safe dates and authority field rejection.
- [x] Implement validation, safe presentation statuses and environment/UID-isolated saved-intent client with Check/Retry/Cancel and stale-response fencing.
- [x] Verify storage-failure, reload, same-op mismatch and midnight replay cases.

### Task2: Trusted requests, conversion and linkage

Files: backend/functions/customerOrders.mjs, service.mjs, generated shared validation; firestore.rules/indexes.json; scripts/customer-order-command-qa.mjs.

- [x] Add RED tests for owning Customer requests/list/detail/cancel, staff accept/reject, exact replay, role/identity denial and concurrent decisions.
- [x] Implement current-authority transactions/private receipts, bounded projections, automatic request reference, atomic SHP allocation/Draft/link/grant and audit. Preserve stock until normal warehouse/dispatch.
- [x] Preserve shipment lineage on edit and cancel linked order on eligible Draft deletion; test no resurrection or duplicate allocation.
- [x] Add explicit denies/indexes and current-authority/foreign-access tests.

### Task3: Safe Customer proof integrity

Files: backend/functions/customerProofIntegrity.mjs, lib/customerPortal.js/.d.ts, service integration; scripts/customer-proof-integrity-qa.mjs.

- [x] Add RED tests for current-granted proof eligibility, exact source/file/registry match, no-registration behavior and revocation/source/config changes during I/O.
- [x] Implement bounded read-only current-proof checking and closed outcome projection.
- [x] Run original Customer/proof/verification contract regressions.

### Task4: Customer and staff interfaces

Files: src/features/customer/CustomerPortal.tsx, CustomerOrders.tsx, CustomerOrderForm.tsx, customer.css; src/features/shipments/CustomerOrderReview.tsx and ShipmentsWorkspace.tsx; lib/appRoutes and route types.

- [x] Build Orders/Shipments navigation, focused requests/details/status chips and field-level forms, recovery/dirty-navigation guards and responsive layouts.
- [x] Build separate staff request queue/detail/mapping and explicit acceptance/rejection, then navigate to the linked shipment. Preserve existing shipment guard/filter/recovery behavior.
- [x] Add Customer order URLs while retaining existing shipment URLs and role gates.
- [x] Verify browser interactions, keyboard/focus, stale views, desktop390/320px and no unauthorized subscriptions.

### Task5: Actual emulator workflow and regressions

Files: scripts/customer-order-emulator-qa.mjs, customer-order-ui-qa.mjs and owned fictional fixtures/output.

- [x] Start one fresh loopback emulator stack only; preserve historical private exports/live MSI services.
- [x] Verify request→staff mapping→one Draft/grant→warehouse→transport→dispatch→Customer tracking/proof; reject/cancel/concurrent/deleted-lineage/role/recovery boundaries and unchanged unrelated stock.
- [x] Run original smoke/QA and affected original suites sequentially. Attribute and clean only this task's exact fictional records.

### Task6: Documentation, final review and save

Files: README, roadmap, customer contract/guide, UI checklist and latest outer/archive handovers.

- [x] Run build/lint/current/history scans and complete required checks; obtain one fresh independent final source review and address Important findings with RED/GREEN regressions.
- [x] Record verified local functionality and hosted-release hold; save code to private GitHub under existing authorisation, excluding private inputs/results/datasets/emulator state.

## Completion evidence

All six Native tasks are verified in [the local verification note](../../CUSTOMER_ORDERS_VERIFICATION_2026-11-04.md). Independent Important review findings were reproduced RED and fixed in one pass; the documented fixed-scope migration minor remains deferred. No Firebase publication, live service switch or physical trials. Source is saved separately to the private repository under the standing user instruction.
