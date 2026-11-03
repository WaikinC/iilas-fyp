# Accepted UI Hosting rollout — 2 November 2026

The user approved publishing the compatible interfaces now and updating Reports next. The release is live at https://fyp-inventory-and-logistics.web.app/. Refresh with Ctrl+Shift+R to load the new files.

## Published

- Stock Management: balance, movement-history and assessment tabs, focused forms and labelled status colours.
- Replenishment & Procurement: purchase orders, reorder review, suppliers and expected incoming panels.
- Order & Dispatch: preparation/dispatch tabs, focused details and confirmation controls.
- Delivery Monitoring: delivery queue, risk/follow-up, pre-dispatch and customer-access panels, including the website's Driver delivery view.
- Existing Reporting & Verification clarity/responsive fixes and the Transport no-plan query correction remain included.

The separate Android Driver application is not updated by Firebase Hosting. Its interface was checked with a fictional browser fixture only; installation and physical phone trials remain deferred. The new Reports & Statistics graphs remain local: their coordinated trusted-backend/model-binding/proof-root release is the next separate deployment task. Current reporting remains available.

## Verification and preservation

The exact 46-file overlay passed TypeScript and production build, with 45 overlays consumed. Lint passed with zero errors (six existing base warnings; four warnings in the overlay scan). Both tracked-source and history secret checks passed. All 88 targeted tests passed. A fresh isolated loopback stack passed the original Firestore smoke and QA regressions plus 111 procurement cases. No live backend/model source was modified to run these checks.

Five fictional component screens were checked at 1440px and 390px, including internal tabs and horizontal-overflow checks. Ten screenshots were captured; mobile Stock, Procurement, Order and Driver layouts and the desktop Delivery layout were visually inspected. The hosted sign-in page then passed at both widths without page runtime errors. This release did not repeat authenticated end-to-end business workflows on the live records.

All 16 published static assets were fetched and matched to the exact staged hashes; two managed Firebase initialization files were preserved. The eight protected cloud documents and all 16 immutable proof-store files match their pre-release snapshots. This is targeted preservation evidence, not a full cloud census. Firebase billing is disabled.

The existing backend binding, 788 source pins, 11 frozen artifacts, public API identity/access checks and both retained current-chain verification receipts were preserved. The chain, model services, API and tunnel were not restarted. No business data, accounts, roles, rules, indexes or IAM were changed; no Git publication or parcel/phone test was performed.

Private evidence is in ignored `outputs/spark-msi-demo-20261028/ui-five-release-20261102/`; do not upload it. Current runtime pointer: `cloud-runtime-ui-five-20261102.private.json` within that folder. The Desktop launcher keeps its existing valid service binding. The previous website and proofs are backed up outside OneDrive/Git under the Windows user's local IILAS supervisor-backups folder.

## Before the supervisor session

Open the hosted website and refresh once. Keep MSI awake, plugged in and online; use the existing Desktop demo launcher to check services. Preserve the current in-memory chain and its confirmed registrations. The original laptop can use the hosted website while MSI runs the workload. MetaMask signing stays on MSI. Parcel/camera and physical Android GPS/offline trials remain deferred.
