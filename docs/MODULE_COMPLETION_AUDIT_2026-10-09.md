# Module completion audit — 9 October 2026

## Latest stock/location closure — 10 October 2026

Quantity-based multi-location transfers, exact per-bin warehouse holds and linked independently approved manual corrections are implemented locally. Stock/correction replay, original immutability and legacy compatibility are covered by the dedicated contract and checks in [STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md](STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md).

The pending FR-17 transfer and FR-30 original-link findings below are superseded for this implemented scope. Full duplicate discovery, broader reports/verification exception review, persisted reorder/risk links, Choong's staged evidence/scoring/transport/customer requirements and real acceptance/research evidence remain. Neither student's full scope is claimed complete.

## Latest closure update — 10 October 2026

The pending supplier-edit, rejection/remarks, correction/resubmission, cancellation UI and order-filter work is implemented and locally tested. Inactive/unarchived-product checks and concurrent reference uniqueness are enforced by the backend. Receipts have delivery-note duplicate protection, atomic stock accounting and immutable revision history/links. Shared malformed-input validation was strengthened. See [PROCUREMENT_VALIDATION_2026-10-10.md](PROCUREMENT_VALIDATION_2026-10-10.md) for exact evidence and limits.

Procurement still needs persisted reorder review/risk-to-order source links (FR-21/FR-27), larger-volume queries and final acceptance. Both students' remaining stock/location/correction, logistics/evidence/scoring/customer, report, research and production work remain. Findings below are dated historical evidence; supplier-edit/rejection and the two procurement backend gaps are no longer outstanding.

## Source recheck after the continuation

The user requested another check of what is lacking. Current source still confirms the missing supplier edit UI, purchase rejection/correction/resubmission, partial-location transfers, linked corrections/reorder requirements, staged pre-dispatch evidence, richer reports and restricted customer access. The previously fixed dashboard, delivery-card and manual retry defects are not counted as outstanding.

Additional concrete procurement findings in backend/functions/service.mjs:

- Purchase creation rejects archived products but does not require product.status to be Active. The interface filters inactive products, but the backend should enforce the same condition. Add a negative command test with an inactive, unarchived product.
- Purchase references have length validation but no normalisation/uniqueness reservation. Define a unique purchase-order reference policy and test concurrent duplicate creation. This is a data-quality recommendation; do not confuse it with stock movement references, which legitimately repeat for partial receipts against one order.

The exported abnormality helper has no call site in the application/backend/scripts, and its overdue condition still excludes only Delivered. The live DeliveryCard uses the corrected deliverySignals helper. Before enabling persisted scoring, consolidate these rules, include Returned as terminal, and save score/level/matched rules/calculation time with evaluation evidence. The unused helper is not a completed abnormality feature or a regression in the corrected live card.

This recheck inspected code and the saved requirements/evidence; it did not rerun the previous 88 browser checks or change application logic. Next remains procurement completion, including the two backend validation gaps above. Real-data models, browser-wallet acceptance, real-phone GPS and production/staff acceptance remain outstanding.

## Follow-up implementation

The three concrete defects below have now been addressed by [CONTINUATION_REVIEW_2026-10-09.md](CONTINUATION_REVIEW_2026-10-09.md): Issued orders count as pending; Returned/Delivered close time-based warnings; manual movements have atomic operation receipts and tested browser retry/outcome checks. Build/lint, emulator regressions and browser checks passed. The audit below preserves the reviewed pre-fix findings; other required features remain partial. Next is supplier editing and purchase rejection/correction/resubmission. No production deployment or final AI evaluation occurred.

## Outcome and evidence boundary

Neither student's full final FYP scope is complete. The ten module areas have operational code, but research capabilities, several report requirements and production acceptance remain partial. A screen existing or a passing workflow test is not full functional-requirement completion. The current public site still serves the earlier release.

This review compared the current React/Firebase/Python/Solidity source with the locally saved original Project 1 portfolios (Choong Wai Kin and Wong Ric Hang), FULL_SCOPE_TRACEABILITY.md and release/UI evidence. It is a source-based gap review, not a new comprehensive test run. Earlier successful build/lint, emulator, 100-line capacity, 69 browser UI checks and 17 browser workflow checks remain software evidence only.

Sources: context archive resources/sources/project-1-2026-10-07/Project 1 Portfolio Choong Wai Kin (10).docx and Project I Portfolio-WongRicHang.docx. Those original files were read but not edited.

## Wong Ric Hang — Inventory Management

| Module | Working locally | Remaining report requirements / improvements |
|---|---|---|
| Product Management | Create/edit/archive, required-field validation, unique SKU/barcode, image/category/location and searchable paginated catalogue | FR-6: add explicit status filtering and identifier search. Barcode scanning and CSV import are optional usability improvements, not established missing core requirements. |
| Stock Management | On-hand/reserved/available balances, Receipt/Issue/Adjustment/Reservation/Release/Transfer history, reorder threshold checks and protected warehouse reservations | FR-9–FR-13: evaluate/install Random Forest and baseline; display current risk in Stock Management, store and review risk alerts, connect prediction-based reorder requirements to procurement. Research inference/review currently lives in the shared reports screen; simple threshold alerts do not fulfil the AI/reorder workflow. |
| Warehouse Operations | Picking allocation, packing, audited Prepared-Shipment Handover, cancellation/restart, exactly-once dispatch consumption; stock movements are available in Stock Management | FR-17: quantity-based transfers between locations; current model holds one location per product and transfers its full balance. FR-18: define duplicate/reference validation and safe retry/idempotency rules for movements. Keep location, allocation and transaction histories consistent. |
| Replenishment & Procurement | Add/select suppliers; validated 1–100-line purchase orders; independent approval, issue, expected date and partial/full receipts | FR-22: supplier edit interface. FR-24–FR-25: correction/resubmission and explicit rejection with decision remarks. FR-21/FR-27: persistent reorder review and traceable reorder-to-purchase-to-incoming-stock links. Backend cancellation exists but is not exposed by this screen. Add status/date/supplier filters and pagination. |
| Inventory Control & Reporting | Independent adjustment approval/rejection, immutable stock/audit records, basic inventory CSV and local SHA-256/Hardhat workflow | FR-30: explicit correction workflow linking original and corrected transactions. FR-35–FR-37: auditable verification exception review, fuller history/audit/approval/risk filters and inventory-specific report views. Finish browser wallet acceptance and assessment evidence. Valuation and movement-performance charts are additional prototype/report presentation improvements; valuation is not asserted as a standalone numbered requirement here. |

## Choong Wai Kin — Logistics Management

| Module | Working locally | Remaining report requirements / improvements |
|---|---|---|
| Order & Dispatch | Draft create/edit, warehouse-prepared queue, assignment prerequisites, 100-item capacity, atomic dispatch/stock consumption, protected dispatch history, search/pagination | Core integrated workflow is locally tested. Finish production/staff acceptance; improve handover detail and operational history presentation. Pre-dispatch parcel evidence required by FR-7 is currently unavailable. |
| Transport Management | Origin/destination, registered driver/vehicle assignment, capacity and assignment locks, manual distance/ETA/cost, scheduled plans and cancellation before dispatch | Planning map/route preview and calculated distance/ETA/cost support are unfinished; existing Leaflet map is the latest-location map in Delivery Monitoring. Add schedule search/filters, clear editing/reassignment flow and acceptance tests. Advanced route optimisation is outside the report's basic tracking scope unless separately authorised. |
| Fleet Management | Vehicle/driver registration, vehicle status changes, capacity/availability validation, fuel additions, maintenance records and assignment locks | Improve driver/vehicle editing, driver activation/status controls, searchable paginated lists and assignment display. Show actual allocated/in-delivery state rather than relying only on base Available status. Fuel additions are recorded data, not a sensor measurement of remaining tank fuel. |
| Delivery Monitoring | Controlled assigned-driver events, failed attempts/reasons, proof-required completion, file upload/download, server-verified evidence hashes, explicit permission-based GPS/latest Leaflet map, inline delay/failure/staleness checks | FR-7: pre-dispatch evidence and explicit stage metadata/permissions. FR-8/FR-10–FR-11: evaluated Random Forest/MobileNetV2 models, configured inference and contextual human-review panels. FR-9: documented points/thresholds, persisted abnormality score, matched rules and calculation time; current inline signals are not the full scoring workflow. Live webcam/frame sampling and confirmed-damage retention described in the design remain unimplemented; reconcile diagram versus image-input FR scope. Test GPS on real phones; latest submitted location is permitted by FR-6 and continuous tracking is not mandatory. |
| Reporting & Verification | Basic shipment CSV, saved prediction review, evidence/file hash comparison, Solidity registration/check interface and both backend/local-chain workflows | FR-15: date/status/risk/parcel/driver/vehicle/verification filters and fuller delivery/fleet/failure/return reports. Add evidence preview/timeline and clear selection/registration status; complete authorised browser wallet signing, missing/matching/mismatch/network-failure acceptance. Customer-safe delivery/POD/location access remains unimplemented. |

## Shared platform and release

- Dashboard uses the prototype's blue/purple identity with eight cards, stored-data charts, alerts, activity and links.
- One fixed shared system with Pending registration, Admin approval, seven internal roles, disable/reactivate and trusted backend/rule checks is locally tested. choongkin6@gmail.com remains the chosen initial Admin; IDs and balances are retained and unrelated personal inventories are not merged.
- Authorised Customer is still absent. Internal Viewer must not be used as a substitute because it can read shared staff records.
- All pages need real staff/supervisor acceptance, production deployment/configuration and repeatable assessment evidence. Main bundle optimisation and Firestore query pagination/indexing remain; UI pagination currently reads complete collections.
- The user has no labelled datasets/images. Research code and synthetic tests do not constitute final AI accuracy evidence. Browser wallet and real-device GPS acceptance are separate from local backend/emulated-location tests.

## Concrete issues identified in this review

1. Dashboard pendingPurchases excludes the Issued status even though those orders still await receipt. It currently counts Submitted, Approved and PartReceived only. Fix and add a regression check.
2. DeliveryCard's date-exceeded condition excludes Delivered but not Returned, so a returned shipment can continue showing a delay alert. Dashboard status buckets already treat Returned as closed. Align the conditions and test terminal states.
3. Movement commands allocate a new movement ID for each call without an operation idempotency key. The UI prevents simultaneous submission but a user retry after an uncertain network response can repeat a logical operation. Define operation/reference contracts before adding duplicate protection, since legitimate partial purchase receipts share one purchase reference.

## Recommended next work

1. Resolve the concrete dashboard/terminal-alert defects and movement retry/reference protection; add meaningful regression coverage.
2. Complete missing non-AI report requirements: purchase rejection/correction and supplier editing, stock correction/transfer contracts, pre-dispatch evidence, persisted abnormality scoring and role-appropriate reporting/filtering. Keep client validation, trusted transactions, rules and emulator tests aligned for database changes.
3. Implement restricted customer tracking and improve transport/fleet planning and maintenance interfaces without adding unrelated technology.
4. Prepare production configuration/backups, verify the initial Admin's retained inventory, deploy backend/rules/indexes/interface together after checks and perform staff/supervisor/real-phone acceptance.
5. Obtain independently labelled data/images, train/evaluate/install models and connect authenticated inference; complete browser-wallet verification and final report-to-test reconciliation. Data collection can proceed alongside the functional work.

The original audit itself made no code changes. Its three issues were fixed in the subsequent continuation linked above; deployment and remaining module features are still outstanding.
