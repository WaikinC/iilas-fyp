# IILAS — Integrated Inventory & Logistics System

## Private repository and credential handling — 17 October 2026

The owner requested private visibility and removal of the Google/Firebase web API key from Git. The repository is private, and `firebase-config.json` is removed from all rewritten Git history and ignored locally. The original local configuration is preserved. Use the blank `firebase-config.example.json` when setting up a clone. `npm run dev` and `npm run build` prepare a blank ignored configuration only when absent; fill it locally before signing in. Never commit live keys, private environments, service-account credentials or generated bundles.

Run `npm run security:install-hooks` once per clone to enable staged-file and full reachable-history checks before commits/pushes. `npm run security:scan`, `npm run security:history` and `npm run test:secrets` provide manual verification. The guards include Google API key patterns and private configuration paths and print redacted findings. They supplement review rather than detect every possible secret. Read [the credential review](docs/GITHUB_SECURITY_2026-10-17.md) and [setup instructions](docs/GITHUB_SETUP.md), including the history-rewrite/reclone note.

Firebase web configuration is visible in the built browser application by design. Keeping it out of Git does not turn a browser key into a server secret. Firebase Authentication, rules, key restrictions and applicable App Check controls protect the services. Actual server tokens stay server-side. The Firebase deployment is unchanged.

## GitHub source and local setup

[WaikinC/iilas-fyp](https://github.com/WaikinC/iilas-fyp) contains the combined final-year project by **Choong Wai Kin (logistics)** and **Wong Ric Hang (inventory)**. The repository is private. [Clone/setup and collaboration instructions](docs/GITHUB_SETUP.md) describe the local Firebase emulators, example environment configuration and checks. Backend commands, rules, research workflows, Solidity contracts and documentation are included; private runtime configuration, data and generated outputs remain local.

The implementation status and remaining work are recorded in [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md). Publishing the source does not deploy the newer application, grant Firebase data access, or complete outstanding AI evaluation and browser-wallet acceptance. Dated verification records below retain their original test dates.

## Location balances and linked corrections — 10 October 2026

Quantity-based transfers now keep per-location on-hand/reserved/warehouse balances and protect held units. Picking stores its exact bin allocations; cancellation releases them and dispatch consumes them once. Classified manual mistakes can request a full linked reversal, reviewed by a different Admin/Manager; original movements and hashes remain unchanged. Lost-response correction recovery uses the existing operation receipt. Legacy IDs/totals are preserved through lazy ledger adoption.

See [contract, scenario matrix and evidence](docs/STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md). Checks: `npm run test:location-stock` and `npm run test:stock-locations`; with the existing explicit-project emulators running, use `node scripts/stock-locations-qa.mjs` directly. No production change or automatic inventory merge occurred. Next: persisted reorder/risk-to-purchase links and remaining inventory/logistics/report/acceptance requirements. This supersedes earlier pending full-balance-transfer/correction descriptions below.

## Procurement and validation continuation — 10 October 2026

Supplier editing, independent purchase rejection/remarks, correction/resubmission, cancellation, search/filter/pagination and immutable purchase/receipt history are implemented locally. Purchase references are unique; delivery notes prevent duplicate receipts; quantity/currency/date/role/version validation and atomic stock updates cover partial deliveries and conflicting actions. Existing valid data IDs are retained. Shared product/stock/shipment/warehouse validators now reject coercive numeric inputs, shipment phones require digits, packing is boolean, and account names/command envelopes are type checked.

See [validation contract, real scenarios and evidence](docs/PROCUREMENT_VALIDATION_2026-10-10.md). Run `npm run test:procurement-validation`, `npm run test:input-validation` and `npm run test:procurement` (disposable emulators; use `node scripts/procurement-qa.mjs` if matching emulators already run). Build/lint, existing regressions and 77 browser checks passed locally. Next: linked stock corrections and quantity-based location transfers, reorder integration and both students' remaining requirements. Full module completion, production deployment and final research evidence remain pending. Dated sections below are earlier records; this section supersedes their pending procurement description.

## Latest completed fixes and next work — 9 October 2026

The module-audit defects are fixed locally: Issued purchase orders count as pending, Returned deliveries stop time-based delay alerts, and manual stock movements use transactional operation receipts with saved browser retries and outcome checks. Repeated submission cannot apply the same operation twice. See [continuation review and retry contract](docs/CONTINUATION_REVIEW_2026-10-09.md) for verification and limits. New checks: `npm run test:dashboard`, `npm run test:delivery-signals`, `npm run test:stock-client` and `npm run test:stock-retry` (disposable emulators). Next is supplier editing and purchase rejection/correction/resubmission, followed by both students' remaining report requirements. Full module completion and production deployment remain pending.

## Latest prototype theme and dashboard — 9 October 2026

The user's original navy-blue/purple theme and eight-card prototype dashboard have been restored with stored shared data, six-month receipt/issue and delivery-status charts, alerts, activity and quick links. Missing or stale AI results are explained rather than fabricated. Labelled mobile navigation, staff approval, accessible forms/dialogs and pagination remain. See [theme/dashboard record](docs/UI_UX_THEME_2026-10-09.md) for data meanings, checks and next tasks. The local interface has not been deployed. Emulator/test npm commands explicitly use this app's Firebase project ID; dashboard aggregation checks run with `npm run test:dashboard`.

## UI refinement — 8 October 2026

The local interface now has a workflow-led dashboard, labelled mobile navigation, module search, stock/record pagination, clearer staff approval and consistent operational forms. See [UI/UX refinement and browser evidence](docs/UI_UX_REFINEMENT_2026-10-08.md). UI pagination limits rendered rows; it does not yet reduce Firestore query volume. The public site has not been updated.

## Current local application — 8 October 2026

**Latest access design:** one shared IILAS system with administrator-approved accounts. Organisation setup, switching and invitations have been removed. Registering creates a Pending profile; only an Admin can approve it and assign a role. Pending, rejected and disabled accounts cannot access operational records. Staff retain separate credentials and audit identities.

The user selected **choongkin6@gmail.com** as the initial Admin and existing inventory source. Its email is configured in ignored Functions environment files. On first verified production sign-in, server setup adopts that account's UID-owned records without changing quantities or IDs. Other accounts' existing stock is preserved separately and requires reviewed migration. See [account access contract](docs/ACCOUNT_ACCESS_CONTRACT.md).

Build, lint and emulator/browser checks cover the new approval design. The hosted site remains the earlier release. The operational/research modules below remain; the earlier organisation access description is historical.

## Earlier organisation implementation — superseded

The local project now uses shared organisations, individual staff accounts and trusted Firebase commands. **The hosted site remains the earlier release; these changes have not been deployed.** The historical first-release notes below are retained for context and do not describe the new access model.

An Admin creates an organisation and issues email-bound, seven-day, one-use invitations. Production joining requires verified email. Roles are Admin, Manager, Inventory, Warehouse, Logistics, Driver and Viewer. Admin manages membership; Manager reviews approvals; Inventory manages catalogue/stock/procurement; Warehouse prepares shipments/receives orders; Logistics manages shipments/fleet/transport; Driver writes only assigned delivery events/evidence/positions; Viewer has staff read-only organisation access. Active staff share workspace records; unrelated organisations remain isolated. Creating the organisation adopts its creator's records in place without changing balances. Other accounts' personal stock is not merged automatically.

The new modules include supplier/purchase approval/issue/partial receipts, vehicle/driver registration and assignment locks, fuel/maintenance records, transport scheduling/cancellation, delivery events, immutable evidence, proof-required completion, explicit latest GPS submission with Leaflet/OSM, CSV reports and human prediction review. Picking allocates warehouse stock; cancellation before handover releases it; dispatch consumes it exactly once. Generic releases cannot consume warehouse allocations. Shared shipments support 1–100 distinct products through backend transactions. Completed handovers and dispatched shipments remain locked.

Python/scikit-learn Random Forest workflows include grouped evaluation and Decision Tree/Logistic Regression comparisons. TensorFlow/Keras parcel workflows use MobileNetV2 and EfficientNetB0 comparison. The authenticated internal API and backend inference persist model/version/confidence for human review. The user confirmed no labelled datasets or Normal/Damaged parcel images are available. **No final trained models or real-data accuracy results are claimed.** Synthetic fixtures test software and their metrics are discarded. Missing models/configuration return unavailable. See [research/README.md](research/README.md).

Solidity/Hardhat registry code, fixed versioned SHA-256 formats and Ethers integration support inventory movements and delivery evidence. Both local workflows have passed confirmed receipt and immutable Firestore verification checks. Browser signing requires the configured chain and an authorised wallet. A matching hash proves consistency, not the truth of original content. GPS shows explicitly submitted latest position, not continuous background tracking. Fuel totals represent recorded additions, not sensor-measured tank levels. Returned goods require warehouse inspection and a separate receipt. Products retain a default receipt location and per-location balances, plus small resized catalogue images in Firestore; delivery evidence uses Storage.

## Current setup and verification

Use Node 22, Java for Firebase emulators and Python 3.13 for the tested research environment. Stop emulators before installing or reinstalling dependencies. Install app/backend dependencies with `npm ci` and `npm run functions:install`, then run `npm run functions:prepare` and `npm run emulators`. The backend installer invokes npm directly in its own directory to avoid Windows shell/prefix issues. In another terminal run `npm run dev`.

With emulators running, verify with `npm run build`, `npm run lint`, `node scripts/smoke-firestore.mjs`, `node scripts/qa-review.mjs` and `node scripts/shared-qa.mjs`. With emulators stopped, `npm run test:smoke`, `npm run test:qa` and `npm run test:shared` start their own runs. Prepare backend sources first. Attack tests intentionally produce permission-denied logs. Run `npm run test:blockchain`, install `research/requirements.txt` and run `npm run test:research`. Desktop and narrow-screen browser checks are required before release.

Start `npm run blockchain:node`, then `npm run blockchain:deploy` in another terminal. Configure IILAS_REGISTRY_ADDRESS/IILAS_RPC_URL/IILAS_CHAIN_ID from ignored outputs/blockchain-local.json in ignored backend/functions/.env.local and restart emulators. `node scripts/shared-qa.mjs --blockchain` tests both backend/chain workflows. Optional --browser-fixtures creates disposable emulator accounts in ignored outputs only.

Production preparation requires Functions/Storage billing and service permissions, backend/rules/indexes with the interface, private evidence CORS, verified-email staff approval checks and acceptance testing. Store the inference token in Secret Manager; use an authenticated HTTPS Python endpoint. A cloud function cannot reach this computer's loopback Hardhat node. Configure the intended registry/network endpoint explicitly. Do not deploy the new interface alone. Back up data before conversion; merging another account's stock requires a reviewed migration to avoid double counting. Public Firebase configuration is not a secret; passwords, service accounts, API service tokens and wallet keys must remain outside source control.

See [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md), [docs/SHARED_WORKSPACE_CONTRACT.md](docs/SHARED_WORKSPACE_CONTRACT.md), [docs/PREPARED_SHIPMENT_CONTRACT.md](docs/PREPARED_SHIPMENT_CONTRACT.md) and [docs/RELEASE_STATUS_2026-10-08.md](docs/RELEASE_STATUS_2026-10-08.md).

## Historical first-release notes

Online prototype: https://fyp-inventory-and-logistics.web.app

This supervisor demo contains one database-backed CRUD module for each FYP system:

- **Dashboard:** live product, reorder, shipment-status, category and activity summaries from the signed-in account's Firestore records.
- **Inventory Management → Product Management:** create, search, filter, edit and archive product records, including an optional image, custom category, stock-on-hand quantity and reorder level. SKU and barcode are unique within each signed-in account. Archiving hides a product from the active catalogue while preserving shipment history.
- **Inventory Management → Stock Management:** view on-hand, reserved and available balances; record receipts, issues, adjustments, reservations, releases and full-balance location transfers; filter immutable movement history; and see reorder indicators. Each operation updates the product, movement history and audit log atomically.
- **Inventory Management → Warehouse Operations:** start picking for a Draft shipment, confirm packing and parcel count, and complete an audited Prepared-Shipment Handover. Warehouse completion atomically moves the linked shipment to Prepared. Items and packing details are locked once warehouse work starts.
- **Logistics Management → Order & Dispatch:** search the inventory catalogue and add up to two products with quantities to a shipment. Create and edit drafts, receive prepared handovers from Warehouse Operations, assign a driver, and dispatch. Draft deletion is available before warehouse work starts. Dispatch checks available stock and deducts item quantities atomically. Dispatched records are locked.

The interface follows the supplied `FYPuiDesign.zip` Figma export. Sidebar items for later modules are marked Coming soon. Route optimisation, AI, blockchain, live delivery tracking, and role-based authorisation are not yet claimed. Warehouse picking, packing, and the prepared handover are implemented as an account-owned prototype; cancellation and automatic stock allocation remain future work.

## Supervisor test

1. Open the online link and choose **First visit? Create an account**. Use an email address and a new password of at least six characters. Each account sees only its own test data.
2. In **Product Management**, add a product with a unique SKU and 8–14 digit barcode. Set stock on hand above zero, optionally choose an image and **Other / custom category**, then reload to verify persistence. Edit, search/filter, and archive records as needed.
3. In **Stock Management**, record a receipt and reservation. Confirm that on-hand, reserved and available totals update and that movement history shows the reason, reference and before/after balances. Try an issue above the available balance to see validation block it.
4. In **Order & Dispatch**, create a Draft shipment. Search the inventory products by name, SKU, barcode or category and add one or two with quantities. Save the Draft, then open **Warehouse Operations**. Enter notes and confirm **Start Picking**, **Confirm Packing**, and **Complete Handover** in order. The shipment becomes Prepared automatically. Return to **Order & Dispatch**, assign a driver, select Dispatched, and save. Dispatch deducts the chosen quantities from available stock without consuming reserved units. Drafts can be deleted before picking starts; warehouse jobs and dispatched records remain preserved.
5. Return to **Dashboard** to view updated counts, category breakdown, stock attention and recent activity.

Use non-sensitive demonstration data for recipient names, phone numbers, and addresses.

## Stack and deployment

- React and TypeScript, built as a static Vite app
- Firebase Authentication (Email/Password)
- Cloud Firestore database, with account-owned records and transaction-backed uniqueness keys
- Firebase Hosting

The Firebase project is `fyp-inventory-and-logistics`. Web-app configuration stays in ignored local `firebase-config.json` (copy the blank `firebase-config.example.json`); Firestore rules are in `firestore.rules`. Audit entries are written to `auditLogs`, and stock movement records are written to `stockMovements`. Warehouse jobs and completed handovers use `warehouseHandovers/{shipmentId}`; see `docs/PREPARED_SHIPMENT_CONTRACT.md` for the integration contract and planned role responsibilities.

Product images are resized in the browser to a maximum of 512 pixels and stored as small JPEG data in the product's Firestore document. This keeps the prototype within its existing Firebase services; for a large production catalogue, object storage would be more suitable. Product quantities and locations are changed through Stock Management, while dispatch deducts from available stock. Reservations are explicit stock movements; draft shipments and warehouse work do not reserve automatically. Each warehouse step and dispatch rechecks availability. Stock can change between these steps; warehouse work may need replenishment before completion. The prototype has no warehouse cancellation flow.

```powershell
npm install
npm run dev
npm run build
```

When the app runs on `localhost` or `127.0.0.1`, it connects to the local Firebase Authentication and Firestore emulators. Start them in another terminal:

```powershell
npx firebase emulators:start --only auth,firestore
```

The build writes `dist/client`, which `firebase.json` deploys. To redeploy with the Firebase CLI after signing into the project:

```powershell
npx firebase deploy --only hosting,firestore:rules --project fyp-inventory-and-logistics
```

Firebase Authentication and Firestore are live. Cloud Functions and server-side business workflows are planned later, beyond the required first CRUD prototype. The form and transaction logic validate prototype records; Firestore rules also enforce account ownership, field constraints, uniqueness-key and audit consistency, atomic stock deduction, and locked dispatched records. The two-product limit keeps dispatch transactions within Firestore's rule-evaluation budget; a larger production shipment would need a trusted backend workflow.

The local Firebase emulator smoke and QA tests cover product create/edit/archive, image/category fields, duplicate SKU/barcode rejection, all six stock movement types, reservations, warehouse stage ordering, concurrent packing, forged and partial handover rejection, immutable completed handovers, linked shipment items, two-product atomic deduction, insufficient-stock and invalid direct-write rejection, concurrent dispatch protection, and isolation between two accounts. No real supervisor account credentials are stored in this repository.

See `REQUIREMENTS.md` for the source-document mapping and scope limits.

See `PROJECT_ROADMAP.md` for the completed scope, planned modules, testing strategy, deployment milestones, and final FYP delivery plan.

See `FULL_SCOPE_TRACEABILITY.md` for the source-grounded module ownership, functional requirements, and AI, computer-vision, GPS/map, and blockchain commitments from both Project 1 reports.
