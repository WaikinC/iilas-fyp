# IILAS Full-Scope Traceability

## Stock/location/correction traceability — 10 October 2026

Inventory FR-17, FR-18 movement retry protection and FR-30 linked corrections have local implementation in lib/locationStock.js, validation.js, trusted stock/approval/warehouse/dispatch transactions, Firestore correction-claim rules, Stock Management and Reporting & Verification. The scenario/emulator/browser evidence and versioned integrity format are recorded in docs/STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md.

Inventory FR-14–FR-20 and Logistics FR-4 retain exact per-bin reservation, cancellation and dispatch through the Prepared-Shipment Handover. Original IDs/totals and historical v1 hashes remain compatible. Full duplicate discovery, all verification exception/report requirements, persisted FR-21/FR-27 reorder links, evaluated stock risk, staged logistics evidence/scoring and production acceptance remain partial. Historical descriptions below are dated baselines.

## Procurement continuation traceability — 10 October 2026

Inventory FR-22 supplier editing and the correction/rejection/remarks portions of FR-24–FR-25 now have a dedicated UI, shared validation, trusted transactions, private uniqueness rules, immutable history and local emulator/browser evidence. Reference/receipt duplicates, inactive records, self-review, stale/concurrent actions, over-receipts and capacity rollback are covered. Receipt movements link to their order and event without altering existing IDs. See docs/PROCUREMENT_VALIDATION_2026-10-10.md.

FR-21/FR-27 persisted reorder requirements and risk-to-reorder-to-purchase linkage remain partial. This does not complete all procurement, stock/location, research, logistics or production requirements. Shared primitive validation also hardens product/stock/shipment/warehouse and common server boundaries; it is not final scenario acceptance of every module. This update supersedes the historical pending supplier-edit/rejection descriptions below.

## Latest manual retry and operational fixes — 9 October 2026

The audit's pending-order and terminal-alert defects are fixed locally. FR-18 is partially strengthened by validated operation IDs, atomic private receipts, immutable replay/outcome-check transactions and tested browser recovery. Internal handover/PO/dispatch contracts remain. Business references may repeat for legitimate partial movements; multi-location transfers, correction links and broader duplicate discovery remain unfinished. See docs/CONTINUATION_REVIEW_2026-10-09.md for new emulator/browser evidence and ordered work for both students. This continuation does not establish full module, production or research completion.

## Detailed module audit — 9 October 2026

See [MODULE_COMPLETION_AUDIT_2026-10-09.md](docs/MODULE_COMPLETION_AUDIT_2026-10-09.md). Reviewing the current source against both saved original portfolios found incomplete functional requirements beyond production and research evaluation: stock-risk/reorder linkage, quantity-based transfers/corrections, purchase rejection/supplier editing, pre-dispatch evidence, persisted abnormality scoring, reporting filters and restricted customer access. Core local workflow tests do not establish full module completion. Prioritise the concrete pending-order/returned-alert defects and movement retry/reference protection, then close required feature gaps alongside data collection and production preparation.

## Latest dashboard evidence — 9 October 2026

The original prototype dashboard/theme has been restored in the React application using shared product, purchase, warehouse-prepared shipment, delivery, prediction, evidence and registration records. Inventory trend derives recorded Receipt/Issue history; Driver summaries filter assigned deliveries. Missing/stale AI results are explicit and no inference or chain processing is performed by the dashboard. See docs/UI_UX_THEME_2026-10-09.md for exact meanings, QA evidence and remaining release/evaluation tasks. This replaces the green UI direction; module ownership and integration contracts are unchanged.

**Reviewed:** 8 October 2026

**Purpose:** Consolidate the final Project 1 scope for Wong Ric Hang and Choong Wai Kin and distinguish it from the deployed CRUD prototype.

## Authoritative source folders

1. **Wong Ric Hang — Inventory Management System**  
   https://drive.google.com/drive/folders/1y-0p3-0pGY9DyDtGwW_nkXdi_8sw4qCr

   Latest aligned documents used: Chapters 1–3 aligned with Chapter 4, plus the available Chapter 4 copy.

2. **Choong Wai Kin — Logistics Management System**  
   https://drive.google.com/drive/folders/1fQManx342CdtkpqOMEZCU4EPLaDeNXay

   Final document used: `final Project 1/Copy of Project 1 Portfolio Choong Wai Kin.docx`, supported by the chapter and diagram files in the same folder.

Older duplicate, editing, feedback, and shortcut copies were not treated as the main requirements when a newer aligned or final copy was available.

Supplementary combined folder: <https://drive.google.com/drive/folders/1XBhWL_9fNd1OOn_rxkbWY8gOIbR7sqrW>. Both original Word portfolios are saved with SHA-256 metadata in the context archive. Their contents still require final reconciliation with the previously reviewed requirements; filenames alone do not establish that they supersede this baseline.

## Integrated system boundary

The overall product is an **Integrated Inventory and Logistics System** with three ownership areas:

- **Shared services:** authentication, role-based access, common database services, dashboards, audit support, and agreed integration contracts.
- **Wong Ric Hang:** Inventory Management System.
- **Choong Wai Kin:** Logistics Management System.

The principal operational handover is:

```text
Inventory Warehouse Operations
        ↓ picking and packing completed
Prepared-Shipment Handover
        ↓
Logistics Order & Dispatch
```

## Inventory Management System — Wong Ric Hang

### Final research objectives

1. Maintain validated and consistent product master records.
2. Monitor available and reserved stock and use **Random Forest** to classify stock risk.
3. Validate warehouse stock-in, stock-out, adjustment, transfer, picking, and packing operations.
4. Convert reorder requirements into supplier and purchase-order workflows.
5. Manage approvals, audit records, reports, and **blockchain hash verification** for approved inventory transactions.

### Required modules

| Module | Functional scope | New technology |
|---|---|---|
| Product Management | Product CRUD, validation, unique SKU/barcode, lifecycle, search, filtering | Shared Firebase services |
| Stock Management | Available/reserved stock, indicators, alerts, reorder requirements | Random Forest stock-risk classification |
| Warehouse Operations | Stock-in/out, adjustments, transfers, picking, packing, prepared handover | Transaction validation and controlled integration |
| Replenishment & Procurement | Reorder review, suppliers, purchase orders, approval, issue, expected replenishment | Workflow automation |
| Inventory Control & Reporting | Approvals, corrections, audit history, dashboards, integrity checks | SHA-256 and Solidity/Hardhat blockchain verification |

### Functional-requirement groups

- **FR-1–FR-3:** Authentication, role-based access, and user-account management.
- **FR-4–FR-6:** Product Management.
- **FR-7–FR-13:** Stock Management and Random Forest stock-risk classification.
- **FR-14–FR-20:** Warehouse Operations and Prepared-Shipment Handover.
- **FR-21–FR-27:** Replenishment & Procurement.
- **FR-28–FR-37:** Inventory Control, approval, reporting, audit, and blockchain verification.

### Inventory AI commitment

- Primary model: **Random Forest**; comparison model: Decision Tree.
- Optional experiment: Isolation Forest only if justified by the available data.
- Output classes: Normal, Reorder Risk, Critical Stock Risk.
- Candidate features: available quantity, reserved quantity, movement frequency, reorder-level distance, adjustments, and time since replenishment.
- Tools: Python, Pandas, NumPy, Scikit-learn, and FastAPI or Flask.
- Evaluation: confusion matrix, accuracy, precision, recall, F1-score, and cross-validation where appropriate.
- Human control: predictions support review and must not automatically approve purchase orders or accuse a user of wrongdoing.

### Inventory blockchain commitment

- Generate a deterministic SHA-256 hash from approved transaction fields in a fixed format.
- Keep complete operational records in Firestore and place only the hash plus minimum references on-chain.
- Use a Solidity smart contract on a local Hardhat Ethereum-compatible network.
- Use Ethers.js for integration and MetaMask for the authorised test account.
- Show `Verified`, `Unmatched`, or `Not Registered/Pending` results.
- Treat a mismatch as changed data requiring human review, not automatic proof of fraud.

## Logistics Management System — Choong Wai Kin

### Final research objectives

1. Develop AI delivery-risk prediction and abnormal-delivery detection.
2. Develop AI vision-based parcel-condition checking.
3. Develop blockchain-based verification of delivery records and proof-of-delivery evidence.

### Required modules

| Module | Functional scope | New technology |
|---|---|---|
| Order & Dispatch | Prepared handover, shipment record, driver/rider assignment, dispatch | Integrated inventory handover |
| Transport Management | Route/load planning, carrier selection, ETA, cost, transport schedule | Mapping support where applicable |
| Fleet Management | Vehicles, drivers/riders, assignments, availability, maintenance, fuel, status | Operational monitoring |
| Delivery Monitoring | Status events, evidence, GPS updates, risk, abnormality, parcel condition | Random Forest, rule scoring, MobileNetV2, HTML5 Geolocation |
| Reporting & Verification | Dashboards, alerts, searches, reports, evidence-integrity verification | SHA-256 and Solidity/Hardhat blockchain verification |

### Functional-requirement groups

- **FR-1–FR-3:** Authentication, role-based access, and user-account management.
- **FR-4:** Shipment information management.
- **FR-5:** Controlled delivery-status management.
- **FR-6:** User-approved GPS location update and map display.
- **FR-7:** Parcel and proof-of-delivery evidence submission.
- **FR-8:** Random Forest delivery-risk prediction.
- **FR-9:** Rule-based abnormal-delivery detection.
- **FR-10–FR-11:** MobileNetV2 parcel-condition analysis, result storage, and human review.
- **FR-12–FR-14:** Evidence hashing, blockchain registration, and integrity verification.
- **FR-15:** Dashboard, search, filters, and alerts.

### Logistics AI commitment

#### Delivery-risk prediction

- Primary model: **Random Forest**.
- Baselines: Decision Tree and Logistic Regression.
- Output: Low, Medium, or High risk with confidence and contributing factors.
- Candidate features: expected/actual duration, failed-attempt count, proof availability, status patterns, and shipment history.

#### Abnormal-delivery detection

- Primary technique: explainable rule-based scoring.
- Example signals: excessive delay, repeated failed attempts, missing proof, invalid status sequence, and stale updates.
- Optional experiment: Isolation Forest when enough suitable data are available.

#### Parcel-condition computer vision

- Primary model: **MobileNetV2 transfer learning**; comparison model: EfficientNet-B0.
- Preprocessing: OpenCV resizing, normalisation, quality checks, and realistic augmentation.
- Output: Normal or Damaged with confidence.
- Tools: Python, TensorFlow/Keras, and OpenCV.
- Evaluation: confusion matrix, accuracy, precision, recall, and F1-score.

All AI results require authorised human review and must not independently assign responsibility, fraud, employee fault, or customer compensation.

### GPS and mapping commitment

- Use the HTML5 Geolocation API after explicit device permission.
- Store shipment ID, coordinates, timestamp, and submitting user in Firestore.
- Display the latest submitted position with Leaflet.js and OpenStreetMap.
- Describe it as the **latest submitted location** unless continuous tracking is actually implemented and validated.
- Provide a responsive web interface; a separate native mobile application is not required by the report.

This is browser geolocation. It should not be described as a complete IoT implementation unless physical devices, sensors, gateways, and telemetry are later designed and tested.

### Logistics blockchain commitment

- Store parcel images and detailed evidence in Firebase Storage/Firestore.
- Generate a SHA-256 hash for selected delivery evidence.
- Register the hash, shipment reference, evidence type, timestamp, and limited user reference through Solidity.
- Use Hardhat local EVM as the primary environment; Ganache is only a backup.
- Store the blockchain transaction reference with the Firestore verification record.
- Explain that a hash match proves consistency with registered bytes, not the truth of the original evidence.

## UI/UX evidence — 8 October 2026

Inventory FR-14–FR-20 and Logistics FR-4 remain connected by the warehouse/dispatch workflow. The refined dashboard and navigation expose that boundary. Search/filter/pagination, account approval and responsive access are implemented locally; 11 module screens fit 1440, 768, 390 and 320px in Playwright. Client pagination is not server-side query pagination. See docs/UI_UX_REFINEMENT_2026-10-08.md.

## Local implementation coverage — 8 October 2026

| Area | Current evidence/state |
|---|---|
| Shared accounts/roles — FR-1–FR-3 | One shared system, Pending registration, Admin approval/roles/disable/reactivate, protected initial Admin, fixed data source and old-record preservation; organisation/invitation flow removed |
| Products/stock | Catalogue, six movements, protected warehouse allocations, adjustment approval and transactional audits |
| Warehouse/handover | Picking allocation, packing, audited Prepared handover, cancellation/restart before completion and exactly-once dispatch |
| Procurement | Supplier edits, independent approval/rejection remarks, correction/revision, cancellation, unique references/notes, partial/full atomic receipts, immutable history, filters/pagination; persisted reorder source links remain |
| Transport/fleet | Unique vehicle/driver registration, capacity/availability, assignment locks, schedules/cancellation, maintenance/fuel |
| Delivery/evidence/maps | Ordered events, proof-required completion, immutable hashed Storage evidence, validated explicit locations, Leaflet/OSM latest-position display |
| Research AI/vision | Training/inference/evaluation code, baselines and software tests; no labelled data or final evaluated models available |
| Blockchain | Solidity registry, fixed SHA-256 formats, contract tests and both confirmed-receipt backend/Firestore workflows tested locally |
| Reporting/review | CSV exports, adjustments and human prediction review; larger-volume pagination remains an extension |
| Production | Earlier hosted release remains; shared release not yet deployed or accepted |

Final research completion requires genuine labelled datasets, held-out evaluation, configured inference and assessment evidence. Refer to docs/RELEASE_STATUS_2026-10-08.md and PROJECT_ROADMAP.md. The original coverage table below is retained as the historical starting point.

## Historical prototype coverage

| Area | Current state |
|---|---|
| Authentication | Implemented with Firebase email/password authentication |
| Product Management | Implemented and database-backed |
| Order & Dispatch | Implemented through dispatch with atomic stock deduction |
| Dashboard | Implemented for current products, shipments, and audit activity |
| Security rules | Implemented for the current prototype data model |
| Stock Management | Receipt, issue, adjustment, reservation, release, full-balance transfer, movement history, availability, reorder indicators, and audit enforcement are implemented; Random Forest stock risk remains |
| Warehouse Operations | Picking → Packed → HandedOver workflow, actors/timestamps, frozen shipment contents, immutable completion, and atomic Prepared handover into dispatch are implemented; stock operations use Stock Management. Cancellation and automatic allocation remain |
| Replenishment & Procurement | Not implemented |
| Transport Management | Not implemented |
| Fleet Management | Not implemented |
| Delivery Monitoring | Not implemented |
| Inventory and logistics AI | Not implemented |
| Parcel computer vision | Not implemented |
| GPS/map updates | Not implemented |
| Blockchain verification | Not implemented |
| Role administration | Not implemented |

The deployed site is a valid first CRUD prototype, but it does not yet satisfy the complete Project 1 research scope.

## Recommended implementation order

1. Stabilise shared user profiles, roles, IDs, audit records, and integration contracts.
2. Implement Stock Management and traceable stock movements.
3. Implement Warehouse Operations and the Prepared-Shipment Handover.
4. Implement delivery events, evidence upload, and latest-location mapping.
5. Implement Replenishment & Procurement, Transport, and Fleet minimum workflows.
6. Prepare datasets and train/evaluate the two structured Random Forest models.
7. Prepare the parcel-image dataset and train/evaluate MobileNetV2.
8. Integrate inference through trusted Python services and store model/version metadata.
9. Implement the two hash-registration and verification smart-contract workflows.
10. Complete end-to-end, security, AI, blockchain, usability, and acceptance testing.

## Evidence required for final assessment

- Requirements-to-test traceability for every final FR.
- Dataset provenance, cleaning, labels, splits, and class distribution.
- Baseline-versus-selected-model evaluation tables and confusion matrices.
- Saved model version, confidence, factors, and prediction timestamp.
- Smart-contract source, deployment steps, address, automated tests, and transactions.
- Demonstration of matching and mismatching blockchain verification results.
- GPS permission, success, denied, and unavailable test cases.
- Role and unauthorised-access tests.
- Evidence that Prepared-Shipment Handover feeds Order & Dispatch.
- Clear limitations covering local blockchain, datasets, browser GPS, AI uncertainty, and human review.

## Scope-control decisions

- AI and blockchain are **core final-scope requirements** in both reports.
- Browser GPS/map tracking is a required logistics supporting feature.
- A separate native mobile app is not required.
- Ganache is a backup; Hardhat is the primary blockchain environment.
- Isolation Forest is optional experimentation, not a required production model.
- Route optimisation, continuous background GPS, public blockchain, cryptocurrency, and automatic punitive decisions are outside the committed minimum.
- IoT remains optional unless the reports are formally revised to specify an actual sensor/device use case.

## Warehouse milestone evidence (7 October 2026)

Inventory FR-14–FR-20 integration is supported by `docs/PREPARED_SHIPMENT_CONTRACT.md`, the warehouse feature, transactional Firestore writes/rules, and `scripts/warehouse-qa.mjs` (included in the QA suite). This demonstrates the prepared handover into Logistics FR-4. Access remains account-based; the shared role matrix is a planned contract, not implemented role authorisation.
