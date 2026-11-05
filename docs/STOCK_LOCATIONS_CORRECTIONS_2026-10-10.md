# Stock locations and linked corrections — 10 October 2026

This local continuation implements Wong Ric Hang's quantity-based location transfers (FR-17), further movement retry/validation controls (FR-18), and explicit original-to-reversal corrections (FR-30). Choong Wai Kin's Order & Dispatch consumes the same location allocations through the Prepared-Shipment Handover. The single shared system, initial Admin, product IDs and balances, and blue/purple eight-card dashboard remain authoritative. No personal inventories were merged and no production deployment occurred.

## Authoritative balance contract

`products/{id}.locationBalances` contains at most 100 distinct `{location, quantity, reserved, warehouse}` rows. Quantities are whole units, each aggregate is at most 1,000,000, and each row satisfies `0 <= warehouse <= reserved <= quantity`. The row sums must equal `quantityOnHand`, `reservedQuantity` and `warehouseReservedQuantity`. `product.location` is the default receipt location and must have a row. Location identity ignores case and repeated whitespace; displayed names retain their stored case. Empty non-default rows are removed.

An existing product without the array is interpreted as all its existing on-hand/reserved/warehouse units in its original location. The next authorised stock or catalogue transaction saves that ledger without changing its ID or inventing movements. Existing arrays with duplicate locations, missing fields or mismatched totals fail closed for administrator reconciliation. Catalogue submissions cannot replace authoritative balances. No bulk migration, automatic inventory merge, physical count or correction of malformed production data is performed.

Receipt and adjustment Increase may create a location. Issue, Reservation, Release, adjustment Decrease and Transfer require a source that exists. Transfer takes a positive quantity of available units at the source and adds the same quantity at a distinct destination; global on-hand and reservations remain constant. It cannot move reserved units. A partial transfer retains the default receipt location. A full transfer of an unreserved default bin changes the default to its destination only when the original bin actually empties. All stock changes, bin deltas, product versions, movement history, operation receipt and audits commit atomically.

## Warehouse and dispatch integration

Picking allocates available units from the default bin first, then other bins in normalised location order. The exact plan is stored in `warehouseHandovers/{shipmentId}.items[].allocations` and protected in the product's warehouse reservation balances. Cancellation releases that saved plan. Packing/handover retain it; shipment item snapshots remain `{productId, name, sku, quantity}`. Dispatch consumes the held units from exactly those bins once, clears `reservationsHeld`, and records `dispatchConsumedAt`, `dispatchMovementIds`, version and audit. The handover's original items, stage actors/times and packing information remain preserved.

Older held jobs without per-bin allocations use their original product/default bin. The hold prevents that bin from emptying through a transfer. Historical Prepared jobs without held reservations allocate currently available bins at dispatch, preserving the existing compatibility path. Corrupt/missing held allocations fail rather than silently substituting other stock. A manual release cannot release warehouse-owned quantities; staff must cancel the owning job before handover.

## Linked correction and review contract

Use **Stock Management → Movement history → Request correction**. The eligible original must be a classified manual Receipt, Issue, Adjustment or Transfer created by the trusted backend. A correction reverses the full original entry, requires a 3–240 character reason, permits an optional reference, and is submitted by Admin/Manager/Inventory/Warehouse. It changes no stock until a different Admin or Manager approves it in Reporting & Verification. Even an Admin cannot approve their own request. Staff then record a separate correct entry if needed; partial reversals and editing/deleting original history are unsupported.

The server derives the inverse type, quantity, direction and locations. Client-supplied balance/status/role/location overrides are rejected. `stockCorrectionLinks/{originalMovementId}` atomically reserves one Pending or Approved correction per original. Rejection releases that claim for a new request while retaining previous approvals/audits. Approval rechecks active/scoped product, original eligibility, claim identity, current bin availability/reservations/capacity and request version. If stock has been used/reserved or capacity changed, the whole transaction fails, leaving the request Pending. Rejection can still close a request for an inactive product.

An approved reversal appends an immutable `stockMovements` record of type/origin `Correction`, with `correctionOf`, `approvalId`, inverse `reversesType`, before/after balances, location deltas, actor/time/version and audit. The original record and any original verification digest remain unchanged. Warehouse/dispatch/PO receipts, Reservation/Release, earlier unclassified records and correction-of-correction are ineligible. Use the owning workflow and reviewed reconciliation for those cases; standalone reversal must not leave a purchase's received quantities or a shipment's allocation inconsistent.

Correction uses the existing actor/scope-scoped UUID operation receipt and saved same-tab retry contract. Lost responses retain the same intent and lock fields. Retry returns the original approval; Check outcome returns it or serialises an unapplied tombstone against an in-flight submission. Approval status is read from the approval record, rather than assuming the replay response is a fresh approval. Separate tabs may submit distinct intents; the correction claim still prevents two reversals of one original. Existing stock commands without `locationFrom` retain their original canonical request shape and receipt hashes.

## Rules and integrity

### Manual movement references

A nonblank staff reference identifies one movement type for one product in the shared system. The server compares trimmed, uppercased references. Separate manual partial receipts can use distinct line references, and a reference can be shared across different products or movement types. A blank reference is still allowed. Stock commands and independent approval write the reference claim atomically with the pending or committed record. A rejection releases its pending claim. Exact saved requests continue to replay their original outcome.

For records created before the claim was introduced, the server checks prior history and pending reviews that already use the canonical reference. Existing movements, approvals and hashes are preserved. Procurement and warehouse-generated movements use their existing workflow identifiers.

Clients cannot write products, stock movements, approvals or correction claims directly, including Admin. Approved active staff may read claims only within the fixed shared scope. Pending/disabled/foreign scope reads and unscoped collection queries are denied. Private operation receipts remain unreadable by clients. Backend transactions recheck the current account/role and system configuration on every mutation and replay.

Historical inventory canonical format `IILAS-INVENTORY-v1` is byte compatible. New movements use `integrityVersion:2` and `IILAS-INVENTORY-v2`: the previous core fields plus origin/reversal type, correction/approval/dispatch/procurement links, allocations and per-bin before/after balances. Both browser and backend use `lib/integrity.js`. Hashes prove consistency with registered content, not that the physical count or original entry was true. Local Hardhat checks are separate from outstanding browser-wallet acceptance.

## Real scenario matrix

| Scenario | Required result |
|---|---|
| Partial transfer; same bin with different case/spacing | Move only entered available units; reject same-bin destination |
| Two transfers exceed source when combined | One commits; the other fails against the new balance |
| Issue/decrease/transfer consumes reserved units | Reject without movement, version or audit change |
| Multi-bin pick, cancel, restart, handover, dispatch | Retain exact bins and quantities; consume warehouse holds once |
| Generic release overlaps a warehouse hold | Reject; release through owning cancellation |
| Older product/job has no new ledger/plan | Preserve ID and totals; use original bin, save ledger transactionally |
| Receipt in another bin; PO partial receipt | Keep aggregate/ledger totals consistent and preserve order links |
| Original mistaken entry needs reversal | Submit unchanged stock; independent reviewer appends linked inverse |
| Duplicate correction or concurrent review | One pending/approved claim and one committed reversal |
| Stock consumed/reserved or capacity full after request | Approval fails atomically and request remains Pending |
| Rejected request | Preserve old decision; permit new independent request |
| Self-review, forged fields, foreign/inactive target | Deny according to role, identity, schema and active-product contract |
| Lost committed response / request never reached server | Same-ID retry / outcome tombstone; no double stock or approval |
| Malformed ledger | Explain need for reconciliation; deny mutation |
| Original or reversal hash verification | Historical format stable; new bin/link tampering changes v2 digest |

## Verification and continuation

Verified locally on 10 October 2026 (Asia/Kuala_Lumpur):

- Build passes. Lint passes with the four retained image-rendering warnings; build retains the existing bundle-size advisory.
- 57 balance/input/reversal/integrity unit checks pass, including a frozen byte-exact v1 canonical fixture.
- 176 new emulator checks pass, including confirmed local v2 manual/correction registry registration and backend verification.
- Original smoke and QA, shared seven-role workflow with both blockchain paths, account access, stock retry, 111 procurement scenarios and 100-product capacity all pass sequentially against the matching emulators.
- Shared primitive validation (159), procurement boundaries (113), stock client recovery, dashboard and delivery-signal deterministic suites pass. Both Solidity registry tests pass.
- Playwright passes 47 general theme/responsive checks and 51 final workflow checks (98 total). All 11 pages fit 1440/768/390/320 px. Transfer/correction forms and review controls fit 390/320 px; keyboard focus, reserved rejection, independent/self-review controls, lost committed response, reload/replay, unchanged original digest and displayed completed bin plans are exercised. No page runtime errors were detected in these runs. Tables retain labelled horizontal scrolling on narrow screens; this is not real-device usability acceptance.

Evidence is in ignored `output/playwright/*-final-locations.log`, `stock-locations-qa.log`, `stock-locations-layout-result.log`, `stock-locations-workflow-result.log` and the stock transfer/correction/bin-handover screenshots. Emulator browser accounts and network configuration remain ignored, disposable fixtures. Parallel early runs exhausted the local emulator's 60-second function timeout; its data was preserved in an ignored snapshot, the emulator restarted, and the affected suites passed sequentially. This is not production load evidence.

Browser checking exposed and fixed two interface defects: whitespace-only locations crashing the preview, and datalist suggestions becoming part of a control's exact label. Recovery now explains uncertain submission and offers retry/outcome actions without showing the internal transport error. Run `npm run test:location-stock` and `npm run test:stock-locations` with emulators stopped; with the matching explicit-project emulators already running, use `node scripts/stock-locations-qa.mjs` directly. Optional `--blockchain` checks confirmed local v2 manual/correction registration using the existing ignored network configuration. Prepare Functions before running. Required regression commands remain build/lint, original smoke/QA, shared/account/stock-retry/procurement checks and desktop/narrow browser verification.

Remaining scope includes persisted reorder/risk-to-purchase links, product/report filters, verification exception review, staged pre-dispatch evidence, persisted abnormality scoring, transport/fleet/customer requirements, server-side query pagination, real staff/phone-GPS and production acceptance. Labelled data/images, evaluated research models and browser-wallet evidence remain unavailable/pending. The Dashboard Receipt/Issue chart continues to show gross recorded movements; corrections are separate ledger entries. Net period/location reports remain in the reporting batch. This continuation does not claim full completion of either student's modules or all input/business scenarios.
