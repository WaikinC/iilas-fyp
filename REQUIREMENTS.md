# FYP requirements and source review

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
- A prepared-shipment reference is not a live connection to ODIN or a completed warehouse module.

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

Full stock-movement history, procurement, transport, fleet, delivery monitoring, AI model training/inference, parcel computer vision, GPS/map updates, and blockchain registration/verification have not yet been implemented. They are outside the first CRUD prototype but inside the documented final FYP scope. The current prototype tracks manually maintained stock-on-hand and deducts it at dispatch; it does not yet provide a complete stock, warehouse, delivery, AI, or blockchain workflow.

## Acceptance checks
1. Create one product and shipment.
2. Reload / reopen and verify persisted records.
3. Edit both and verify the stored values.
4. Reject duplicate SKU/barcode and invalid required values.
5. Archive unused products or delete draft shipments and verify removal from the active list after reload.
6. Preserve dispatched records, including their product-name/SKU snapshots.
7. Reject unauthorised API writes.
8. Verify activity records, responsive forms, empty/loading/error states.
