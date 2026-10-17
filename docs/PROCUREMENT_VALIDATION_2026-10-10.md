# Procurement continuation and input/scenario validation — 10 October 2026

Checked locally in Asia/Kuala_Lumpur. This record supersedes the earlier pending supplier-edit and purchase-review work. It does not establish completion of either student's full module scope. No production deployment, inventory merge or production migration was performed.

## Implemented

- Supplier add/edit, Active/Inactive status, contact validation, duplicate identity protection and version conflict checks.
- Submitted purchase review with independent approval or rejection and mandatory decision remarks.
- Correction/resubmission of Submitted/Rejected orders: same reference, a new revision, reset approval and a new requester identity. A manager who corrects an order cannot approve that revision.
- Cancellation with mandatory reason before issue; retained reference and history.
- Approval/issue recheck active suppliers and active/unarchived products. Supplier inactivity does not block receipt of goods already issued.
- Partial/full receipts require a delivery-note reference and accepted whole-unit quantities per line. Over-receipts, duplicate notes, zero receipts, inactive products and excessive resulting stock are rejected atomically.
- Search, status/supplier/expected-date filters and client pagination for supplier, reorder and purchase lists.
- Purchase history displays immutable revision/status/line/cost snapshots, reasons, delivery notes and actor name/role. Receipt movements link to the order and immutable receipt event.
- Navy blue/purple interface, labelled controls, trapped/restored dialog focus and narrow-screen purchase/receipt forms. Corrections focus an enabled field rather than the locked reference.

## Input boundaries

`lib/procurementValidation.js` is shared by the browser and Functions. The browser validates raw form data; Functions validate the raw command again and derive authoritative totals/status/identity. Clients cannot submit status, balances, received totals, approval identity, event metadata or extra purchase fields.

| Input | Accepted boundary / handling |
|---|---|
| Supplier name | Trimmed text, 1–120 readable characters; Unicode names supported |
| Supplier contact | Text up to 120 characters; an email address or phone with 7–15 digits; no embedded line breaks/control characters |
| Supplier status | Active or Inactive; omitted new status defaults Active, explicit invalid/null status fails |
| Supplier duplicate | Same normalised name **and** contact conflicts, including concurrent creation and legacy scoped records. Phone punctuation is ignored; email hyphens are preserved. Different branches/contacts are allowed |
| Record ID | Text 1–128 letters/digits/underscore/hyphen; validated scoped lookup. Existing valid imported IDs are supported without rewriting them |
| Order reference | Trimmed uppercase 3–40 letters/digits/underscore/hyphen/dot/slash; starts with a letter/digit; unique per fixed scope, retained after cancellation |
| Expected replenishment | Real ISO date, on/after today's Malaysia date for new/corrected submissions. Earlier issued records remain receivable when overdue |
| Purchase lines | 1–100 distinct active/unarchived products belonging to the fixed shared scope |
| Ordered quantity | Whole units, 1–1,000,000; numbers or decimal numeric form strings. Blank, null, boolean, objects/arrays, hex, nonfinite, negative and fractional values fail |
| Unit cost | MYR 0–1,000,000, representable in whole cents without rounding a fractional cent. Zero explicitly allows no-charge goods |
| Monetary totals | Derived from integer cents; safe-integer total required. Browser totals are previews; server totals are authoritative. These are goods estimates, not a tax/payment ledger |
| Action/version | Explicit allowed transition; positive safe integer version; conflict rejects the command rather than overwriting newer data |
| Review/correction/cancellation notes | Trimmed readable text, 3–500 characters; multiline allowed. Issue/receipt notes optional, maximum 500 |
| Delivery note | Uppercase normalised 3–80 reference characters; unique **per order**. Every physical delivery to that order must have its own note |
| Received quantities | One integer 0–1,000,000 per saved line; exact line count; at least one positive; each no greater than its outstanding quantity; resulting on-hand <=1,000,000 |
| Filters | Search reference/supplier/product/SKU; exact status/supplier; real expected-date range with From <= To. Filters/pagination affect display, not database access control |

The same strict primitive validation now protects product, stock, shipment and warehouse input types in `lib/validation.js`, plus numeric/text inputs handled by common server helpers (including location and fleet inputs). Shipment phones require actual digits, packing input must be boolean, and record IDs accept valid legacy identifiers. Explicit null/boolean/array/object/blank numeric values cannot become zero or one through JavaScript coercion. Account display names reject non-text, empty names and controls; command envelopes reject arrays/non-object inputs and inherited object-property action names.

This is not a completed input-by-input business audit of every module. More module-specific date relationships, evidence stages, transfer/correction rules, fuel/planning semantics and customer boundaries remain in the next validation batches. Numeric syntax may use scientific notation when its resulting value meets the same exact bounds.

## Workflow and real scenarios

| Current state | Allowed progression | Practical checks |
|---|---|---|
| Submitted | Independent Approve/Reject; Correct & resubmit; Cancel | Warehouse/Viewer/Logistics cannot submit/review; requester's own manager approval/rejection denied; mandatory remarks; stale version denied |
| Rejected | Correct & resubmit or Cancel | Correct date/products/supplier/cost and explain changes; approval resets; old revision and rejection remarks remain in history |
| Approved | Issue or Cancel | No silent edit after approval. Recheck supplier/product availability before sending order |
| Issued | Receive | Contents/cancellation locked. Accepted goods may arrive in separate deliveries even when supplier later becomes Inactive |
| PartReceived | Receive outstanding units | Reject duplicate note/case variations, excess units and stale parallel edits; failed multi-line receipt changes no stock/PO/movement/history |
| Received / Cancelled | Read history | No further receipt, correction, cancellation or reference reuse |

Only physically counted and accepted goods are entered in receipts. Enter 0 for an undelivered/unaccepted line. Supplier identity, references and operational dates do not prove physical receipt; staff must check the delivery note and actual goods. An excess delivery requires resolving the order discrepancy before receipt. Damaged/short shipments must not be silently marked fully received.

Expected date restrictions apply to new/corrected procurement submissions, not universally to historical business dates. Delivery, fleet and warehouse dates need their own documented policies rather than a blanket prohibition of past dates. A stale command should be reopened from current data; it is not automatically retried with a new version.

## Storage/security contract

- Existing `suppliers` and `purchaseOrders` retain their IDs, fixed `ownerId` and versioned commands. No personal inventories are merged.
- `procurementKeys/{sha256-key}` is server-only: supplier identity locks; order reference locks; delivery-note locks. Client get/list/create/update/delete are denied, including Admin. Superseded supplier identity keys are released on edit; purchase/delivery-note references remain reserved.
- `purchaseOrderEvents/{orderId_version}` stores an immutable snapshot plus step, actor/name/role, timestamp, notes, receipt reference and linked movement IDs. Approved staff can read only the shared scope. All direct client writes are denied. Older orders show the preserved audit instead of fabricated historical events.
- Each receipt commits product balances/versions, stock movements, product audits, PO state/version, PO event and delivery-note lock in one Firestore transaction. Role/account/scope checks occur inside the transaction. Concurrent same-version actions serialize; exactly one commits.
- A lost successful receipt response cannot add stock again using the saved old version or the same delivery note. Reopen the order/history to confirm the outcome. Other purchase actions use optimistic versions; this is not the manual-stock saved-intent protocol or a general offline queue.
- Uniqueness checks read existing scoped collections to protect legacy records without migration. This remains a scaling limitation; pagination is client-side. Future indexed uniqueness migration/query pagination must preserve existing data and handle ambiguous duplicates through review.

## Verification evidence

- `npm run build` passed. Lint has zero errors and four existing image-element warnings; the main bundle warning remains (~832 KB before gzip).
- `npm run test:procurement-validation`: 113 boundary/type/currency/date/legacy-ID/filter checks passed.
- `npm run test:input-validation`: 159 shared product/stock/shipment/phone/packing/warehouse checks passed.
- `scripts/procurement-qa.mjs`: 111 emulator checks passed, including malformed product/manual-stock quantities, concurrent PO references, legacy reference/ID preservation, independent manager correction, role isolation/revocation, capacity rollback, partial/full receipt races, linked movements, immutable history and private-key rules.
- Both original Firebase scripts (`smoke-firestore.mjs`, `qa-review.mjs`), shared-system QA, account-access QA and stock-retry QA passed against explicit-project Auth/Firestore/Functions/Storage emulators. Account QA includes malformed names/envelopes and inherited action names. Negative tests intentionally log permission denied.
- Dashboard, delivery-signal and stock-client deterministic regression scripts passed.
- Playwright purchasing workflow: 77 checks passed through supplier edit, Inventory submission, Manager rejection, Inventory correction, Manager approval, issue, Warehouse partial/full receipt, duplicate-note rejection, Viewer history and keyboard focus. All 11 module pages fit 1440/768/390/320 px; purchase/receipt dialog content fits 390/320 px. No page runtime errors. A follow-up verified Inventory/Manager/Warehouse actor names in history and history dialog content at 390/320 px. The deliberately rejected duplicate-note callable logs expected HTTP 400.
- Ignored local artifacts: `output/playwright/procurement-review.js`, `procurement-browser-result.log`, `procurement-create-mobile.png`, `procurement-receipt-mobile.png`, `procurement-history-desktop.png`, `procurement-completed-mobile.png`, `procurement-history-mobile.png` and `procurement-history-review.js`; emulator logs alongside them. Disposable credentials stay in ignored local QA outputs, not production configuration or report sources.

With matching emulators already running, use `node scripts/procurement-qa.mjs`; otherwise `npm run test:procurement` starts its own disposable explicit-project emulators. Prepare shared Functions files first with `npm run functions:prepare`. Do not start a second emulator suite on occupied ports.

## Remaining and next implementation

1. **Wong:** define linked stock corrections and quantity-based location balances/transfers with warehouse reservation protection. Review every affected input/state boundary and rollback/retry scenario together.
2. **Wong:** persisted reorder requirements/review, purchase source links and stock-risk context. PO receipt movements now have purchase links; threshold review alone still does not fulfil inventory FR-21/FR-27 or evaluated Random Forest requirements. Expand product/report filters and verification exceptions.
3. **Choong:** pre-dispatch evidence/stage permissions, contextual preview/timeline, persisted abnormality points/rules/thresholds/calculation time and logistics report filters. Consolidate the unused backend abnormality helper with corrected terminal-state rules.
4. **Choong/shared:** route/distance/ETA support, vehicle/driver editing and assignment visibility, customer-specific delivery/evidence/location boundaries. Internal Viewer is not an Authorised Customer.
5. **Operational hardening:** indexed/query pagination, workload testing, confirmed receipt close-out/short-shipment and supplier return handling if approved in scope, supervisor usability, real-phone GPS and real staff acceptance. These workflows are not implemented by this batch.
6. **Release/research:** preserved Admin data and backups, combined backend/rules/indexes/UI release and acceptance; labelled inventory/delivery data and Normal/Damaged images, held-out baseline/model evaluation, configured authenticated inference and both browser-wallet paths. No labelled datasets/images are currently available, so final accuracy claims remain unavailable.
