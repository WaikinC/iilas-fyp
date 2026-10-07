# IILAS website test report

Date: 14 September 2026. Site: https://fyp-inventory-and-logistics.web.app/

## Assessment

The implemented Product Management, Order & Dispatch and Dashboard flows work in the signed-in live website for the tested cases. The prototype still needs stronger database-enforced business validation and several usability fixes. Stock Management, Warehouse Operations and Delivery Monitoring are placeholders, not completed modules.

No application code or deployed rules were changed during this review. A repeatable local review script was added at `scripts/qa-review.mjs`.

## Live browser results

| Test | Result / evidence |
|---|---|
| Login session restoration | Passed after refresh; login form briefly flashes while authentication loads. |
| Create product | Passed with QA-TEST-0914, stock 5 and reorder level 2. |
| Image upload | Passed with the repository's favicon SVG as a harmless fixture; converted preview and saved thumbnail appeared. Other file formats and size-limit edge cases were not exercised live. |
| Custom category | QA Custom Category saved, appeared in the filter and dashboard, and was retained in the edit form. |
| Product persistence | Product and category appeared after reload. |
| Product edit | Name changed from QA Test Pump to QA Test Pump Updated. |
| Product filter/search | Custom-category filter combined with barcode search returned exactly the QA product. |
| Shipment product lookup | Barcode search isolated the QA product, which could be selected with a quantity. |
| Create shipment draft | QA-SHP-0914 saved with its selected product. |
| Insufficient stock | Attempting to dispatch 6 units with 5 available was rejected. |
| Preparation | Prepared status, handover reference and driver saved. Stock remained 5 before dispatch. |
| Dispatch | Dispatching 3 units succeeded; product stock became 2. |
| Delivery search/details | Shipment reference search worked. Dispatched details showed quantity 3 and disabled editing controls. |
| Dashboard | After dispatch: 2 products, 1 at/below reorder level, 0 pending shipments, 1 dispatched record; audit activity and category summary updated. |
| Placeholder navigation | Clicking Stock Management did nothing. Other placeholder handlers are also absent in source. |

The original product OO remained unchanged at 1,777 units. Two labelled QA records remain as test evidence: product QA-TEST-0914 (stock 2) and dispatched shipment QA-SHP-0914 (3 units). No real delivery was initiated. Production record deletion was not tested; deletion was exercised locally.

## Automated checks

- `npm run build`: passed; Vite reported a bundle-size warning (approximately 785 KB uncompressed JavaScript).
- `node scripts/smoke-firestore.mjs`: passed product CRUD, image/category persistence, uniqueness through the app service, linked items, stock deduction, insufficient-stock rejection and account isolation in Firebase emulators.
- `node scripts/qa-review.mjs`: simultaneous dispatches competing for 5 units could not both consume 4; remaining stock was 1. Stale product edits and direct negative-stock writes were rejected.
- Review probes confirmed the business-rule bypass and dangling-reference issues below. These probes used local emulators only.

## Improvements in priority order

### 1. High: enforce business rules at the database/backend boundary

Emulator reproduction: an authenticated direct `setDoc` created a Dispatched shipment with an empty item list, no driver, no preparation, no stock deduction and no audit entry. Direct product writes also created duplicate SKU/barcode records. Current rules mainly enforce ownership; the fuller validation and uniqueness logic live in `lib/firebase.js` and `lib/validation.js` and can be bypassed by another client.

Enforce required fields, allowed statuses, uniqueness-key consistency, audit creation and stock/shipment consistency using a trusted backend and/or appropriately structured Firestore rules. Firebase documents `getAfter()` for validating related atomic writes, subject to document-access limits: https://firebase.google.com/docs/firestore/manage-data/transactions . Retain account-isolation tests, which currently pass; this finding does not demonstrate access to other accounts.

### 2. Medium: preserve product references and historical labels

Emulator testing showed that a product can be deleted while a draft shipment references it. The draft then cannot dispatch. Prefer archiving/deactivation or an enforced reference check.

Source review also found that the locked shipment view prefers the current product name/SKU over the stored shipment snapshot (`app/ShipmentItemsPicker.tsx`). Renaming a catalogue product can therefore change what a historical shipment displays. Use the snapshot for dispatched records. This label issue was identified in source, not reproduced by renaming the live QA product after dispatch.

### 3. Medium: clear stale errors and confirm successful operations

The insufficient-stock error remained visible after successful preparation and dispatch, and even on Dashboard. Clear errors when retrying/succeeding, provide a dismiss action, and show a brief success message. Put validation beside the relevant field or shipment item.

### 4. Medium: fix responsive layout and access

At the browser's narrow width, sidebar branding overflowed into the page header. The mobile CSS also hides the only Sign out control. Provide a compact brand and an accessible account/menu control.

At a 1,366 px test viewport, DOM measurements showed the shipment picker occupying only one 273 px grid column of a 561 px form (`grid-column: auto`). Make it span both columns so product names and stock information are readable. The viewport override was reset after testing; the desktop screenshot was partly clipped by the browser capture surface, so this width finding relies on DOM measurements.

### 5. Medium: clearly identify unfinished modules

Stock Management, Warehouse Operations and Delivery Monitoring look clickable but are placeholders. Label them Coming soon or hide them for the supervisor demo. The separate stock-management module should eventually cover adjustments, receipts and stock history.

### 6. Lower priority: improve workflow and loading feedback

- Add an authentication/data loading state instead of flashing the login form and temporary zero counts.
- Warn before closing a form with unsaved changes; add dialog semantics, focus management and a labelled close button.
- Show stock-shortage feedback as quantities are entered and explain that Draft/Prepared shipments do not reserve stock.
- Let dashboard metric cards open the corresponding filtered list.
- Paginate catalogue/activity queries and avoid loading every embedded product image for large catalogues.
- Add password recovery and user-friendly authentication messages.

## Limits

This was a focused prototype review, not exhaustive browser compatibility, accessibility, load or penetration testing. Live UI deletion, password recovery, every image format, offline recovery and every shipment size were not tested. Security bypass tests were restricted to the local emulator. Findings are not fixed by this report.

## Remediation applied after this review

The later implementation strengthened Firestore rules for field validity, uniqueness-key and audit linkage, and shipment/stock consistency. Products are now archived to preserve linked shipments, and dispatched shipment details display their stored product labels. The UI clears stale errors, shows save feedback, places failed-save errors inside dialogs, warns about unsaved edits, labels unfinished modules, improves the mobile header and shipment picker, adds loading states, and offers password reset.

The emulator smoke and QA scripts passed with a two-product atomic dispatch, concurrent stock protection, and direct invalid-write rejection. Firestore's rule-evaluation limit blocked larger dispatch transactions under these rules, so new shipments are capped at two products in the UI, validation, and database rules. A future trusted backend is needed for larger shipments. The original live-browser findings above remain as historical evidence.

On 14 September 2026 the new Hosting build and Firestore rules were deployed successfully. After reloading the live site, the signed-in dashboard and records loaded, unfinished modules showed Coming soon, and the shipment picker accepted two products with an unsaved-change warning on close. Saving the labelled QA product through the new live rules succeeded and displayed the success notice; its visible fields and stock were unchanged. Bulk catalogue pagination, full keyboard focus trapping, and larger shipment support remain future work.
