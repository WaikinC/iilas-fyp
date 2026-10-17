# FYP requirements and source review

## Stock/location/correction requirements — 10 October 2026

Inventory FR-17 now uses positive whole-unit transfers between distinct bins, preserving totals and preventing reserved-stock consumption. FR-18 retains safe operation-ID retry/outcome handling and adds correction-claim concurrency protection. FR-30 supports an explicit full original-to-reversal link with independent review and immutable original history. Per-bin picking/cancellation/dispatch preserve the Warehouse-to-Logistics handover. See docs/STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md for exact validation, compatibility, evidence and limits.

Only classified manual receipts/issues/adjustments/transfers can be reversed here. Linked purchase/warehouse/dispatch and unclassified legacy movements require owning-workflow reconciliation. This is not all FR-18 duplicate discovery, all reporting/verification exceptions or full module completion. Persisted reorder/risk source links and both students' remaining logistics/report/research/production requirements remain.

## Procurement/input requirements — 10 October 2026

User-authorised continuation requires realistic input and state validation. New/corrected purchases need active shared suppliers/products, unique stable references, 1–100 distinct whole-unit lines, exact MYR cents and a valid Malaysia expected date. Review/correction/cancellation require remarks and independent versioned approval. Issued contents are locked; each accepted partial delivery uses a unique note and atomically updates outstanding/on-hand quantities and immutable history. Supplier inactivity blocks new approval/issue but permits already-issued receipt. See docs/PROCUREMENT_VALIDATION_2026-10-10.md for boundaries/scenarios/security and local evidence.

Inventory FR-22 and correction/rejection portions of FR-24–FR-25 now have local working code and scenario/browser evidence. FR-21/FR-27 persisted reorder review and source-to-order links remain partial. Shared validators reject malformed/coerced numeric/text/packing/contact inputs; every module's remaining business scenarios still require review. The historical scope notes below are retained as dated starting points, not the current implementation status.

## Latest retry and alert requirements — 9 October 2026

Issued purchase orders remain pending until receipt. Delivered and Returned are terminal for time-based warnings. Manual stock submissions preserve one operation ID through uncertain retries and atomically save a private result receipt with the movement/approval. An outcome check confirms the result or prevents a late unapplied request. Legitimate distinct/partial movements may share business references. See docs/CONTINUATION_REVIEW_2026-10-09.md for checks and boundaries; multi-location/correction/reorder flows and full FR-18 coverage remain partial.

## Latest interface requirement — 9 October 2026

Use the supplied FYPuiDesign.zip prototype's navy blue/purple identity and integrated dashboard: eight summaries, inventory flow and delivery-status charts, alerts, activities and quick links. Display actual shared operational data; explain missing/stale prediction evidence. Keep approved staff access, labelled mobile navigation, accessible forms/dialogs and Prepared-Shipment Handover. See docs/UI_UX_THEME_2026-10-09.md. This supersedes the green direction in the earlier UI refinement.

## UI/UX refinement — 8 October 2026

Operational users need labelled responsive navigation, clear staff-approval steps, discoverable modules, readable balance/status information, searchable/paginated records and recoverable form errors. The local refinement implements those controls while preserving role restrictions and Prepared-Shipment Handover. Browser layout checks cover all 11 modules at desktop/tablet/narrow widths; supervisor usability and production acceptance remain. See docs/UI_UX_REFINEMENT_2026-10-08.md.

## Latest shared access requirement — 8 October 2026

The user selected one shared IILAS installation with registration and Admin approval, replacing the organisation workflow. This implements the supporting FR-1 authentication, FR-2 role checks and FR-3 account approval/role management/disable requirements in both saved reports. Initial Admin/main inventory owner: choongkin6@gmail.com. The new implementation preserves existing record IDs and balances; unrelated personal data is not merged automatically. The Authorised Customer role remains separate from internal Viewer and requires later access-boundary implementation. See docs/ACCOUNT_ACCESS_CONTRACT.md.

## Current delivery status — 8 October 2026

The user's current objective is an integrated project rather than a CRUD-only demonstration. Local implementation now includes shared system with approved staff roles, trusted Firebase commands, stock approvals, warehouse allocations and Prepared-Shipment Handover, procurement, registered fleet/transport, delivery/evidence, explicit latest GPS/maps, reports, research workflows and both local blockchain verification paths. Production deployment and real-data AI evaluation remain pending. The user has no labelled inventory/delivery data or Normal/Damaged parcel images.

The additional combined source folder is https://drive.google.com/drive/folders/1XBhWL_9fNd1OOn_rxkbWY8gOIbR7sqrW. Both original portfolios are saved with metadata/hashes in the context repository's resources/sources/project-1-2026-10-07. The committed React/Firebase/Python/Solidity/Leaflet stack and integration boundaries remain authoritative. Final report reconciliation must preserve those agreed decisions.

See docs/SHARED_WORKSPACE_CONTRACT.md, docs/PREPARED_SHIPMENT_CONTRACT.md, docs/RELEASE_STATUS_2026-10-08.md and the current PROJECT_ROADMAP.md section. The original prototype descriptions below are historical and do not describe the shared access model or current shipment limit.

## Requested deliverables

1. A supervisor-testable online prototype for both students, with at least one database-connected CRUD module per system.
2. A final Integrated Inventory and Logistics System aligned with both Project 1 reports, including the stated AI, computer-vision, GPS/map, and blockchain research functions.

## Sources reviewed

- Wong Ric Hang Inventory folder: https://drive.google.com/drive/folders/1y-0p3-0pGY9DyDtGwW_nkXdi_8sw4qCr
  - Latest aligned Chapters 1–3 and the available Chapter 4 copy were used.
- Choong Wai Kin Logistics folder: https://drive.google.com/drive/folders/1fQManx342CdtkpqOMEZCU4EPLaDeNXay
  - The latest full portfolio in `final Project 1` and its supporting chapter/diagram files were used.
- Older duplicate, editing, feedback, and shortcut copies were not treated as authoritative when a newer aligned/final copy was available.
- See `FULL_SCOPE_TRACEABILITY.md` for the consolidated module, technology, and functional-requirement mapping.

## Current prototype — Inventory, Wong Ric Hang

Product Management implements FR-4 through FR-6:
- Create products with name, SKU, barcode, category (including a custom category), storage location, stock on hand, reorder level, status and an optional image.
- Read product lists and individual details; search and filter.
- Update with server-side validation and unique SKU/barcode checks.
- Archive test records or mark products Inactive when they should not be selected for a new shipment. Archiving preserves references from shipment history.
- Preserve important action history.

## Current prototype — Logistics, Choong Wai Kin

Order & Dispatch implements shipment management (FR-4) and the prepared/dispatch stages described in the use cases:
- Create shipment records with one or two selected products from the signed-in account's inventory catalogue, quantities and prepared-shipment references.
- Read lists and details; search and filter.
- Update address, expected delivery, assignment and preparation details.
- Delete drafts; preserve confirmed dispatch history.
- Confirm dispatch only when required preparation and assignment are complete.
- Check stock and deduct the selected quantities in the same Firestore transaction that confirms dispatch.
- Warehouse Operations now provides an explicit account-owned picking, packing, and Prepared-Shipment Handover. Completion atomically links the warehouse record and Prepared shipment. It is not an external ODIN connection.

## Architecture and current decision
Both reports specify React.js, Firebase Authentication, Cloud Firestore and trusted backend validation.
The prototype uses React with Firebase Authentication and Cloud Firestore in project `fyp-inventory-and-logistics`. Firebase Hosting serves the static Vite build. Cloud Functions are outside this first CRUD deliverable; Firestore security rules enforce account ownership, record validity, uniqueness-key/audit linkage and atomic dispatch stock changes, while client validation guides form entry. Shipments are limited to two distinct products because larger atomic writes exceeded Firestore's rule-evaluation budget in emulator testing; scaling beyond this requires a trusted backend workflow.

## Full final scope confirmed by the reports

### Wong Ric Hang — Inventory Management System

- Product Management.
- Stock Management with Random Forest stock-risk classification.
- Warehouse Operations and Prepared-Shipment Handover.
- Replenishment & Procurement.
- Inventory Control & Reporting with SHA-256 and Solidity/Hardhat blockchain verification.

### Choong Wai Kin — Logistics Management System

- Order & Dispatch.
- Transport Management.
- Fleet Management.
- Delivery Monitoring with Random Forest delivery-risk prediction, rule-based abnormality detection, MobileNetV2 parcel-condition classification, and browser GPS/map updates.
- Reporting & Verification with SHA-256 and Solidity/Hardhat blockchain evidence verification.

## Outside the current first prototype

Stock movement history and the warehouse picking/packing handover are now implemented. Procurement, transport, fleet, delivery monitoring, AI model training/inference, parcel computer vision, GPS/map updates, and blockchain registration/verification have not yet been implemented. They are outside the first CRUD prototype but inside the documented final FYP scope. Stock Management records traced operational changes; Warehouse Operations hands prepared shipments to Logistics. Cancellation, automatic warehouse allocation, role enforcement, delivery, AI, and blockchain remain incomplete.

## Acceptance checks
1. Create one product and shipment.
2. Reload / reopen and verify persisted records.
3. Edit both and verify the stored values.
4. Reject duplicate SKU/barcode and invalid required values.
5. Archive unused products or delete draft shipments and verify removal from the active list after reload.
6. Preserve dispatched records, including their product-name/SKU snapshots.
7. Reject unauthorised API writes.
8. Verify activity records, responsive forms, empty/loading/error states.
