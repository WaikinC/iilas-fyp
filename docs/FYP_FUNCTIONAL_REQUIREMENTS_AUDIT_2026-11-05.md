# IILAS functional requirements audit

## Operational gap follow-up on MSI

| Report gap | Local behavior | Remaining scope |
|---|---|---|
| Wong FR-18, duplicate manual movement | A nonblank reference is unique for a product and movement type in the shared system. Exact operation retries recover their first result. Pending reviews hold a reference and rejection releases their own claim. The historical check uses references saved in the application's normalized format. | Staff need a distinct reference for each separate manual receipt. Blank references retain operation-ID protection. |
| Wong FR-27, expected incoming | Issue creates an ordinary expected-incoming record. Partial and full receipts update the per-line and total balances in the same transaction as stock and purchase history. An older issued order with no ledger enters the list at its next receipt using previously recorded quantities. | Ordinary purchases identify their order and purchase event. The original reorder requirement is available on linked demo purchases. |
| Choong §3.5.4, fleet eligibility | Scheduling and reassignment check recorded driver licence expiry, vehicle inspection/insurance expiry and maintenance due date. Dispatch checks again against the current Malaysia date. Legacy resources with unrecorded dates remain eligible under the existing availability rules and show unknown dates. | Licence-class matching needs an agreed class policy and authoritative matching fields. Alternate-carrier selection and road routing remain separate. |

On the MSI loopback Firestore stack, direct trusted-command checks passed for stock reference replay and historical duplicates, ordinary issue and partial/full receipts with report totals, and both scheduling paths and dispatch under expired fleet dates. All 57 fictional records from those checks were removed. The older audit baseline below describes the findings before these changes.

## Local follow-up on stock reviews and dashboard alerts

- **Wong FR-28.** In **Reports & Statistics → Stock adjustment & correction reviews**, open **Review details**. The selected request shows the product and SKU, requested direction and reference, current affected-bin balances, the exact original or resulting movement when linked, and up to five dated movements. Older records can have unavailable fields. Review decisions still use the version-checked approval command.
- **Choong FR-15.** The eight-card dashboard now surfaces recent saved delivery AI risk, separate rule follow-up and open integrity exceptions for Admin and Manager. Delivery records must match the current shipment and delivery versions and status. Each source is limited to 20 recent records. The alerts link to Delivery Monitoring and Reports & Statistics. The remaining parcel and broader dashboard scope below still applies.

These changes were verified against the MSI emulator and are pending Firebase release.

## Audit baseline

5 November 2026. This audit compares the two original Project 1 portfolios with the application source at `0d820cb` and the dated local and hosted test evidence. The report timings section also covers the local optimization prepared with this audit.

- **Wong Ric Hang, Inventory Management System** — *Project I Portfolio-WongRicHang.docx*, §3.2.2, printed pp. 73–77, FR-1 to FR-37.
- **Choong Wai Kin, Logistics Management System** — *Project 1 Portfolio Choong Wai Kin (10).docx*, §3.2.3, printed p. 77 onward, FR-1 to FR-15.

Both original files are in the full workspace at `fyp-cwk-2/resources/sources/project-1-2026-10-07/`. Their SHA-256 checksums match the archive manifest. The **¶** references below count paragraphs in the DOCX document body, including table cells. The two portfolios use separate FR numbering.

**Covered** means the workflow matches the numbered requirement at FYP demo scope. **Partial** identifies a report clause or workflow step that differs. **Demo** means the path works with explicitly simulated inputs or labels. **Check pending** means prior evidence exists and a current manual acceptance step is open.

## Wong Ric Hang — Inventory Management System

| Module | FR / source ¶ | Requirement | Status and evidence |
|---|---|---|---|
| Shared access | FR-1 / 1225 | Sign in and load the approved user profile | **Covered.** Firebase Auth, neutral sign-in errors and approval checks. |
| Shared access | FR-2 / 1227 | Restrict data and actions by role | **Partial.** Module access, commands and report queries check roles. Legacy shared staff collections still permit broader approved-staff reads than the strict report wording. |
| Shared access | FR-3 / 1229 | Administer user access and retain changes | **Covered.** Admin can approve registered accounts, change roles, disable and restore access. Changes are audited. |
| Product Management | FR-4 / 1233 | Maintain product master fields | **Covered.** Staff can add and edit product details. The application assigns the record ID and locked SKU. |
| Product Management | FR-5 / 1235 | Validate fields and prevent duplicate codes | **Covered.** Required fields, barcode format and uniqueness are enforced. The barcode format hint is a separate UX item. |
| Product Management | FR-6 / 1237 | Search, filter and deactivate products | **Covered.** Name, exact ID/SKU/barcode, category and status filters are available. Archival retains historical references. |
| Stock Management | FR-7 / 1241 | Show current, reserved and available quantities | **Covered.** Trusted stock commands maintain the balances, including warehouse-held quantities. |
| Stock Management | FR-8 / 1243 | Reserve and release stock safely | **Covered.** Reserve/release validates available quantities and respects warehouse holds. |
| Stock Management | FR-9 / 1245 | Prepare inventory features from recorded facts | **Partial.** Selected demo products supply on-hand, reserved and reorder values. Eight history, demand and supply facts are entered as fictional context. Real-history readiness is checked separately. |
| Stock Management | FR-10 / 1247 | Classify stock condition using Random Forest and compare a baseline | **Demo.** RF14 classifies Normal, Reorder and Critical. Decision Tree is the research comparator. |
| Stock Management | FR-11 / 1249 | Retain a traceable stock prediction | **Demo.** Results retain input facts, class probabilities, version, time and provenance. Stock changes use a separate transaction. |
| Stock Management | FR-12 / 1251 | Surface stock risk alerts | **Demo.** Reorder and Critical demo results generate risk items. Ordinary products have rule-based threshold warnings. |
| Stock Management | FR-13 / 1253 | Create a reviewable reorder requirement | **Demo.** A Manager decision and accepted reorder requirement link to the experimental result. Staff explicitly create the PO. |
| Warehouse Operations | FR-14 / 1257 | Record stock receipts | **Covered.** A validated receipt records product, quantity, location and movement history. |
| Warehouse Operations | FR-15 / 1259 | Record stock issues | **Covered.** An issue cannot consume more than available stock or bypass reserved balances. |
| Warehouse Operations | FR-16 / 1261 | Record controlled adjustments | **Covered.** The adjustment captures reason and reference, with independent review when required. |
| Warehouse Operations | FR-17 / 1263 | Transfer stock between locations | **Covered.** Transfers validate the source, destination and movable quantity. |
| Warehouse Operations | FR-18 / 1265 | Validate movements and prevent duplicates | **Partial.** Commands enforce role, type, location and quantity and recover an exact retry. A separate manual request ID can reuse the same business reference. |
| Warehouse Operations | FR-19 / 1267 | Record pick and pack completion before handover | **Covered.** A warehouse job records these stages and its parcel count. Per-line scanning is a possible extension beyond this clause. |
| Warehouse Operations | FR-20 / 1269 | Hand a prepared shipment to logistics | **Covered.** Prepared-Shipment Handover freezes the contents and reservations. Dispatch consumes the held stock exactly once. |
| Procurement | FR-21 / 1273 | Review reorder alerts before purchasing | **Demo.** Ordinary low stock has a threshold list. Persisted acceptance/rejection linked to a purchase is available through the experimental flow. |
| Procurement | FR-22 / 1275 | Maintain and select suppliers | **Covered.** Staff can create, view, edit and select validated supplier records. |
| Procurement | FR-23 / 1277 | Prepare a purchase order | **Covered.** A draft links a supplier, items, quantities, expected date and generated reference. |
| Procurement | FR-24 / 1279 | Validate and correct purchase requests | **Covered.** Validation, rejection and correction/resubmission are supported. |
| Procurement | FR-25 / 1281 | Approve or reject independently | **Covered.** A separate reviewer decides, with reviewer, time and notes retained. |
| Procurement | FR-26 / 1283 | Issue an approved PO | **Covered.** The app records issue after approval. The report permits simulated supplier communication. |
| Procurement | FR-27 / 1285 | Retain expected incoming stock and its reorder link | **Partial.** Linked demo POs create expected-replenishment records. Ordinary POs retain expected dates and receipt totals without that separate linked record. |
| Inventory Control & Reporting | FR-28 / 1289 | Review pending exceptions with product, warehouse and history context | **Partial.** The queue shows requester, reason, quantity and original record reference. Product, bin and movement history are not shown together at decision time. |
| Inventory Control & Reporting | FR-29 / 1291 | Approve or reject a stock correction | **Covered.** Independent decisions are recorded, with atomic stock updates for approved corrections. |
| Inventory Control & Reporting | FR-30 / 1293 | Record a linked reversal and retain the original | **Covered.** The reversal references the original movement and retains its history. |
| Inventory Control & Reporting | FR-31 / 1295 | Keep attributable audit records | **Covered.** Trusted workflow changes retain actor, record, action and time. |
| Inventory Control & Reporting | FR-32 / 1297 | Hash an eligible stock movement deterministically | **Covered.** The service hashes a canonical, versioned representation with SHA-256. |
| Inventory Control & Reporting | FR-33 / 1299 | Register the stock hash with an authorized wallet | **Check pending.** Prior hosted human confirmation is recorded. The current restored registry still needs a fresh human signing acceptance check. |
| Inventory Control & Reporting | FR-34 / 1301 | Recompute and compare a stock hash | **Check pending.** Verified, Unmatched, Not Registered and recovery paths exist. Current-chain human acceptance is tracked with FR-33. |
| Inventory Control & Reporting | FR-35 / 1303 | Retain and review integrity exceptions | **Covered.** Unmatched or unavailable outcomes can open exceptions for independent review. Controlled scenarios cover the workflow. |
| Inventory Control & Reporting | FR-36 / 1305 | Present role-appropriate dashboard summaries and reports | **Covered.** Charts, scoped detailed reports and CSV are available. Hosted response time is open. |
| Inventory Control & Reporting | FR-37 / 1307 | Filter and find operational and integrity records | **Covered.** Supported filters vary by source and include record/product, risk, type, date, approval, supplier and integrity. |

Inventory evidence includes the [account access contract](ACCOUNT_ACCESS_CONTRACT.md), [stock and correction contract](STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md), [Prepared-Shipment Handover](PREPARED_SHIPMENT_CONTRACT.md), [inventory model audit](INVENTORY_STOCK_AI_COMPLETION_AUDIT_2026-10-24.md), [live automatic codes](AUTOMATIC_CODES_LIVE_ACCEPTANCE_2026-11-03.md) and [hosted reporting verification](REPORTS_STATISTICS_LIVE_2026-11-02.md). Relevant source includes `firestore.rules`, `backend/functions/access.mjs`, `backend/functions/service.mjs`, `backend/functions/purchaseOrderWorkflow.mjs`, `backend/functions/inventoryDemoProcurement.mjs`, `src/features/operations/ReportsWorkspace.tsx` and `lib/reporting.js`.

The inventory RF14 scored **81.53%** on 720 simulated examples with AI-assisted labels. Critical precision was **79.00%** and recall was **87.78%**. These results measure agreement with the simulated labels. Independent warehouse accuracy is unmeasured. [Evaluation details](INVENTORY_CONTEXT_AI_LOCAL_GUIDE_2026-10-23.md)

## Choong Wai Kin — Logistics Management System

| Module | FR / source ¶ | Requirement | Status and evidence |
|---|---|---|---|
| Shared access | FR-1 / 1394 | Authenticate users and protect the workspace | **Covered.** Firebase sign-in, verified access, sign-out and neutral errors. |
| Shared access | FR-2 / 1397 | Enforce staff, Driver and Customer permissions | **Partial.** Trusted operations, assigned Driver access and customer grants are enforced. The legacy staff-read caveat from Wong FR-2 applies to this shared system. |
| Shared access | FR-3 / 1400 | Administer users and maintain access history | **Covered.** Approval, role and profile changes, disable/restore and audit. |
| Order & Dispatch | FR-4 / 1403 | Create, view and update authorized shipment records | **Covered.** Destination, schedule, assignment and status are maintained. Dispatch enforces prepared stock and a valid transport assignment. |
| Driver / Delivery Monitoring | FR-5 / 1406 | Record authorized delivery status, actor, time and failed attempt detail | **Covered.** Assigned status transitions record actor/time and require a failure note or delivery proof where applicable. Delayed is derived, and failed-delivery details use one required notes field. |
| Transport / Fleet / Delivery Monitoring | FR-6 / 1409 | Record GPS and display the latest reported location | **Covered for browser GPS.** An authorized MSI location point was saved and read in a second tab. Physical Android background and offline trials are deferred. |
| Delivery Proof | FR-7 / 1412 | Capture authorized stage images and delivery evidence with protected storage | **Partial.** Evidence and metadata are stage-bound and protected. The approved Spark deployment uses a private MSI file store in place of the Firebase Storage named in the report. Richer saved-proof previews are local. |
| Delivery Risk | FR-8 / 1415 | Classify delivery risk with RF, compare DT/LR and retain contributing factors | **Demo.** Staff can run the three-class model, see inputs and retain a result for review. Inputs are visible. Per-result factor attribution and evaluation against real delivery outcomes remain open. |
| Abnormal Delivery | FR-9 / 1418 | Score rule matches, retain the time and alert on anomalies | **Covered for the rule demo.** Separate scored assessments retain rule matches and support review for overdue, failed, missing-proof and status anomalies. Isolation Forest is optional in the report. |
| Parcel Condition | FR-10 / 1421 | Analyze parcel images using OpenCV and MobileNetV2 with an EfficientNet-B0 comparison | **Partial.** Local experimental photo and sampled-camera software and comparison evidence exist. The hosted classifier gate is closed. User photo and camera acceptance is deferred. |
| Delivery Risk / Parcel Condition | FR-11 / 1424 | Retain and review attributed AI and rule results | **Partial.** Delivery AI and rule review are demonstrated. The parcel path remains local and experimental. |
| Proof Verification | FR-12 / 1427 | Hash evidence and limit the data written on-chain | **Covered.** SHA-256 binds the stored proof bytes. Minimal registry data stays on-chain and the protected file stays off-chain. |
| Proof Verification | FR-13 / 1429 | Register proof with authorized MetaMask and retain the transaction reference | **Check pending.** Prior hosted human proof signing passed. The current restored registry still needs its fresh human signing acceptance check. |
| Proof Verification | FR-14 / 1432 | Compare current proof against the registered digest and retain the outcome | **Check pending.** Staff comparison and retained outcomes are implemented. The Customer-safe result is local. Current-chain human acceptance is tracked with FR-13. |
| Dashboard / Reports | FR-15 / 1436 | Summarize shipments, risks, parcel condition and verification with search and detail | **Partial.** Reports and queues expose current status, AI, rules and integrity data with filters and detail. The main dashboard still reads legacy prediction summaries and lacks one view for the current delivery alerts, parcel and integrity outcomes. |

Logistics evidence includes [Fleet and Transport live acceptance](FLEET_TRANSPORT_UI_LIVE_2026-11-03.md), the [supervisor module walkthrough](SUPERVISOR_MODULE_TEST_GUIDE_2026-11-03.md), [delivery risk model evaluation](DELIVERY_RISK_DEMO_LOCAL_GUIDE_2026-10-24.md), [parcel capture scope](PARCEL_CAMERA_SCOPE_2026-10-20.md), [Android acceptance](ANDROID_ACCEPTANCE_2026-10-26.md), [MSI startup and wallet status](DEMO_STARTUP_2026-11-04.md) and [Customer order and proof verification](CUSTOMER_ORDERS_VERIFICATION_2026-11-04.md). Relevant source includes `app/Dashboard.tsx`, `src/features/dashboard/dashboardData.ts`, `lib/reporting.js` and `backend/functions/integrityWorkflow.mjs`.

The delivery RF scored **98.33%** on 180 held-out simulated snapshots. The Decision Tree scored **99.44%** and logistic regression scored **92.78%** on the same test. These are agreement scores against the synthetic triage policy. Delivery forecasting accuracy remains unmeasured. [Evaluation details](DELIVERY_RISK_DEMO_LOCAL_GUIDE_2026-10-24.md)

### Logistics use cases beyond the numbered requirements

| Original report | Current application and remaining difference |
|---|---|
| Transport planning, §3.4.3 and §3.5.3 | Scheduling, reassignment, capacity checks, straight-line estimates and entered costs are available. Road-network multi-stop optimization, route-based ETA/cost, shift checks and a separate transport approval step are open. |
| Fleet resources, §3.5.4 | Driver and vehicle records, status, capacity, maintenance and fuel records are available. Automatic licence-class, inspection/insurance-expiry and maintenance-calendar enforcement and alternative-carrier selection were not demonstrated. |
| Dispatch, §3.5.2(c) | Prepared handover, assigned transport and exactly-once stock consumption are enforced. A physical barcode-to-manifest check was not demonstrated. Driver tracking begins after an explicit Start action. |
| Mobile tracking, §3.5.5(a) | Native GPS capture, a SQLite queue and reconnect upload have software verification. Actual phone/background/offline acceptance is deferred. |
| Telemetry-driven risk, §3.5.5(b) | The staff-triggered demo and separate rule score work. Weather and route history, automatic scoring from telemetry, automatic priority notification and timeout fallback remain open. |
| Proof collection, §3.5.6(a) | Photo/PDF evidence and delivery notes work. Dedicated recipient signature capture and contactless designation were not demonstrated. Actual offline upload acceptance is deferred. |
| Customer tracking and verification | The hosted demo uses explicit shipment grants. Locally verified Customer orders can be accepted into a linked shipment, with scoped tracking and delivered-proof access. The order creation workflow extends the original report. |

## Reports & Statistics response time

Both portfolios require measuring response under prototype conditions. Wong §3.2.3 NFR-3 (¶1325) covers common product, stock, warehouse and dashboard operations. Choong §3.2.4 NFR-3 (¶1481–1482) covers normal pages, shipment lists and summaries and asks for feedback during long operations. Neither portfolio gives a numerical target.

- **Overview.** The Logistics chart waited for a purchase-order count. The local client now requests the two chart sources first and still runs one source at a time. In a controlled test with artificial source delays, both charts became ready in about **0.22 s**, compared with **0.54 s** before. The full four-source refresh still performs the same work.
- **Generate statistics.** The trusted query now reads batches of 200 instead of 50 for statistics. The 2,000-record regression reduced Firestore query calls from **41 to 11**, including the final completeness check, with the same totals and **2,003** accounted document reads. Report paging and CSV use their existing batch size. The existing caps, deadlines, role scope and assigned-Driver checks still apply.
- **MSI loopback.** The actual reporting module returned all four Overview statistics and consistent source results against the configured Firestore emulator. That read-only check bypassed the hosted network and browser login. A before/after timing on Firebase Hosting through the MSI API is still required to measure the user-facing speedup. [Original hosted reporting evidence](REPORTS_STATISTICS_LIVE_2026-11-02.md)

The 55 focused report tests and the build passed. Lint reported 13 existing warnings and zero errors. A browser fixture at 1440 px and 390 px confirmed that both charts became ready while the purchase-order request was held. The broader legacy reporting wrapper still stops at the Research & Verification fixture because its Firebase mock lacks the existing `demoEnvironment` export. The affected statistics tests and the separate Report Explorer browser fixture pass.

## Follow-up order for the FYP

1. Measure **Overview refresh**, **Generate statistics** and **View source records** on the hosted release after the supervisor hold, using fixed roles, dates and selections. Record the time to each chart and the time until all results finish.
2. Include the locally verified stock approval details and dashboard alerts in the post-session release review.
3. Decide which detailed design differences to implement or document explicitly. The largest differences are ordinary reorder-to-incoming lineage, strict role-scoped legacy reads, road-network planning and fleet eligibility.
4. Record the existing simulated AI results as research evidence and run the current-chain wallet acceptance when scheduled. Parcel/camera and physical Android tests remain deferred.
