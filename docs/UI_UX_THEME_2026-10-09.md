# Prototype theme and dashboard restoration — 9 October 2026

## Latest authorised direction

The user requested the blue/purple theme and dashboard used in the saved prototype. This supersedes the green visual direction and workflow-first dashboard in UI_UX_REFINEMENT_2026-10-08.md. The working React application remains C:/Users/choon/Documents/FYP/FYP. One shared system, Admin approval and the Prepared-Shipment Handover remain authoritative.

The exact reference was read from the context archive's resources/design/FYPuiDesign.zip: src/index.css, src/components/AppShell.tsx, src/screens/DashboardScreen.tsx and the saved interface brief. Its static sample numbers were not imported into the operational application.

The installed frontend-design and Playwright skills were applied. The saved frontend-design package and its pinned upstream revision remain in resources/skills and SAVED_SKILLS.json; no additional skill or dependency was installed for this follow-up.

## Design and implementation

| Token | Value | Use |
|---|---|---|
| Prototype navy | #0f2348 | Sidebar, login and theme metadata |
| Prototype blue | #1b3b6f | Primary actions and inventory chart |
| Prototype purple | #6d28d9 | Selection/focus, verification and stock-out chart |
| Canvas | #f0f2f5 | Working background |
| Surface | #ffffff | Forms, cards and tables |
| Supporting text | #626b7c | Readable secondary labels |

Segoe UI/Aptos/Arial keeps the clean sans-serif style using locally available fonts. Status text remains visible alongside semantic green, amber and red. Controls and content are left aligned; charts, tabular balances and smaller captions use a consistent hierarchy. Motion is restrained and charts do not animate.

```text
Desktop: labelled navy navigation | breadcrumb / module search / role
                                  | Dashboard heading
                                  | four inventory/shipment cards
                                  | four delivery/evidence cards
                                  | inventory trend (3/5) | delivery status (2/5)
                                  | recent alerts | recent activity | quick links
Mobile: labelled menu / module / search / role
        two columns of summary cards
        charts and operational panels stacked
```

The deliberate choice is to follow the user's saved prototype layout and palette. The green workflow-first replacement is superseded. The preparation workflow remains in Warehouse Operations and Order & Dispatch, with dashboard links into those modules.

Changes saved:

- Eight dashboard cards: Total products, Low-stock items, Pending purchase orders, Prepared shipments, Active deliveries, High-risk deliveries, Damage alerts and Evidence awaiting verification.
- A six-month receipt/issue area chart, delivery-status donut, recent alerts, four latest saved activities and six module quick links.
- Blue/purple controls, focus, navigation, login, search, forms and table surfaces throughout the application; success/warning/error states retain their semantic colours.
- Labelled mobile navigation, account approval, stable form labels, keyboard dialog focus, search, pagination and existing transaction/permission checks from the earlier refinement remain implemented.
- Dashboard and charts load as a separate chunk. The main production JavaScript chunk is about 824 kB; further bundle optimisation remains pending.
- Dashboard read failures have an explicit alert and Retry dashboard action. Loading/unavailable results use a dash rather than a fabricated count. Chart values are also available in a keyboard-accessible table.

## Data meanings

Counts are calculated from the fixed shared data scope. No writes, schema changes, migrations or security-rule changes were introduced by this theme/dashboard follow-up.

- Products excludes archived records; low stock counts Active products where on-hand minus reserved is at/below reorder level.
- Pending purchase orders includes Submitted, Approved and PartReceived; Prepared shipments requires completed warehouse handover.
- Active deliveries counts dispatched shipments that are neither Delivered nor Returned. The chart separates Delivered, Active, Delayed, Attempt failed and Returned across all stored dispatched shipments. Delay is a date rule using Malaysia's end of the expected delivery day, not an AI prediction. Driver delivery summaries use assigned shipments.
- Risk uses the latest saved prediction per active delivery. Superseded/rejected results, changed shipment versions and results older than the latest delivery update are excluded. No current result displays a dash with an explanation, not a claim of zero risk.
- Parcel alerts use the latest non-rejected Damaged result matching the evidence version. Pending and accepted results are distinguished; no current prediction displays a dash.
- Evidence awaiting verification counts proofs of delivery and parcel images with accepted damage results, excluding stored Verified delivery registrations. It does not claim live chain verification or perform blockchain processing.
- Inventory trend totals immutable Receipt and Issue quantities by Malaysia calendar month. Reservation, Release, Transfer and Adjustment are excluded. Initial catalogue quantities do not invent historical receipts. Future/out-of-window movements are excluded; six months crossing a year boundary are handled.

## Verification

- Emulator/test npm commands now explicitly select fyp-inventory-and-logistics, matching the app configuration and avoiding an unconfigured CLI starting a different demo project. The two original regression scripts were run against that configured local emulator suite.
- npm run build: passed.
- npm run lint: passed with zero errors and four existing image warnings.
- npm run test:dashboard: passed deterministic aggregation checks for balances, purchase stages, delivery buckets, stale/latest/rejected predictions, human review, evidence registration and Malaysia month/year boundaries.
- Both original Firebase emulator regression scripts (smoke-firestore.mjs and qa-review.mjs): passed; expected forged-write denials appeared in negative checks.
- Account-access QA and 100-product warehouse/atomic-dispatch capacity QA: passed against local emulators.
- Playwright browser workflow: 17 assertions passed, from registration and Admin approval through shared product receipt, picking/packing/handover, transport, dispatch and assigned Driver status update. The fixture finishes with 5 on hand / 0 reserved / 5 available.
- Final Playwright responsive/dashboard review: 69 assertions passed across all 11 modules at 1440/768/390/320px. Checks cover prototype palette/eight cards, explicit missing AI results, chart values, status legend/quick links, pagination/search, keyboard focus, mobile navigation and Admin self-disable protection. No page runtime errors occurred. Desktop and mobile screenshots were visually inspected; CLI scripts/results/screenshots are saved in the application's ignored output/playwright folder.

Emulator fixtures are disposable software evidence. No production account/data was changed, no deployment was performed and no real-data AI accuracy or formal accessibility certification is claimed.

## Next task plan

1. Prepare production readiness: verify the initial Admin's email, preserved IDs/balances, backups, Functions/Storage billing and runtime permissions/configuration. Deploy backend, rules, indexes and interface together only after release checks; perform real staff approval/role/revocation acceptance.
2. Record supervisor and both students' usability acceptance of inventory and logistics workflows, including handover and narrow-screen Driver work.
3. Add Firestore query pagination/indexing and workload checks; current UI pagination still subscribes to complete collections. Optimise the large application bundle.
4. Complete restricted Authorised Customer tracking access and remaining report-to-code reconciliation.
5. Collect labelled inventory/delivery records and Normal/Damaged parcel images, train/evaluate the research models with real held-out data and configure authenticated inference. The user currently has no labelled datasets.
6. Complete browser wallet/network signing and matching/mismatch acceptance for both verification workflows; preserve chain state and record assessment evidence.
