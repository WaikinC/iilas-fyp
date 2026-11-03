# Reports & Statistics live release — 2 November 2026

The user requested publication of the new Reports graphs before the automatic item-code/reference work. The accepted Reports design v3 and Native implementation are now live at https://fyp-inventory-and-logistics.web.app/.

## Use the graphs

1. Refresh the website with **Ctrl+Shift+R** and sign in normally.
2. Open **Reports & Statistics**.
3. In **Overview**, set the activity dates and select **Refresh overview**. Sources load sequentially; keep the page open while loading completes.
4. Use **Inventory**, **Logistics**, or **AI & Verification** for focused reports. Refresh the selected report when requested.
5. Expand a chart's data table for exact values, or select **View source records** for the underlying complete source selection and available CSV controls.

Large stock-condition columns and shipment-state doughnut charts cover both portfolios. Detailed presets include movements, warehouse stages, purchasing/incoming stock, deliveries/events, fleet/transport and separate AI/integrity histories. Labelled colours distinguish completed/healthy, pending/attention, failed/risk, active and unavailable states. The interface supports 23 closed statistics presets and retains the 31 role-filtered detailed reports.

Stock condition describes current recorded stock. Logistics overview uses the selected **expected-delivery dates**; it may differ from an unfiltered shipment total. Historical AI labels are not accuracy measurements, and retained integrity outcomes do not establish current source truth or physical parcel condition. Unknown facts remain visible. Oversized selections are refused rather than charting a truncated sample.

## Release and verification

Seven reporting/preparation files were applied to the main MSI application. The accepted presentation remains in an isolated Hosting overlay alongside all five previously published operational interfaces. The generic authenticated API serves the new read-only statistics command; no new public route, rule/index deployment, billing, role or credential change was needed.

The exact overlay TypeScript/production build and lint passed. All 39 focused Reports tests, four source-restoration tests and 22 launcher/environment/chain/nonce tests passed. The original Firestore smoke and QA suites plus 111 procurement cases passed sequentially on a fresh loopback stack. Six statistics acceptance groups verified all 23 presets against their source aggregates, Malaysia date boundaries, CSV/source consistency, role/Driver isolation, revocation and exact fictional-fixture cleanup.

Desktop1440px and narrow390px fictional visual checks passed for all four tabs. Both overview charts rendered at roughly641×350px on desktop and322×330px on mobile. The hosted sign-in page passed at both widths. An authenticated, in-memory Admin test exercised four actual public statistics/source-report pairs without business-record writes, new accounts or role changes. This was not a repeat of all authenticated browser business workflows.

All17 published static assets were fetched and matched their staged hashes; the two managed Firebase initialization files were preserved. Eight protected cloud documents and16 immutable proof-store files remained unchanged. These are targeted preservation checks, not a full cloud census. Both tracked-source and reachable-history secret scans passed. Root lint retains six existing image warnings and the build retains its nonfatal bundle-size advisory.

## MSI services and recovery

The API and two AI services were deliberately stopped and restarted with fresh immutable serving metadata. Every scientific manifest field except the reviewed source pins remains identical: no training, model replacement or scientific reevaluation occurred. All11 frozen artifact pins are preserved. Main runtime now pins792 source files. Model health and authenticated invalid-input compatibility checks pass; this release did not perform a new accuracy evaluation.

The blockchain process/generation, current wallet registrations, ngrok process/address, proof-root identity, credential and service tokens were retained. The Desktop binding was atomically updated, including its tunnel-startup fallback. The real Desktop check reports all five services Ready. Both current inventory/delivery wallet receipts remain pinned and there is no pending-wallet warning. Keep MSI awake and preserve this in-memory chain.

Private release evidence, source preimages and the new pointer are in ignored `outputs/spark-msi-demo-20261028/reports-live-20261102/`. Current pointer: `cloud-runtime-reports-published-20261102.private.json`. Previous Hosting assets/proofs are backed up outside OneDrive/Git in the user's local IILAS supervisor-backups folder. Rollback safeguards and recovery tests were prepared before cutover; no rollback was needed. Do not rerun the one-time release scripts as ordinary startup commands.

Parcel/camera, physical Android/GPS/background/offline trials and Git publication remain deferred. The next requested product task is the audit/design for automatic SKU/item codes and shipment/purchase references, preserving all existing IDs and balances.
