# IILAS local release status — 8 October 2026

## Stock/location continuation — 10 October 2026

Quantity-based location balances/transfers, protected per-bin picking/cancel/dispatch and independently approved linked full manual corrections are implemented locally. Historical IDs/totals and original hashes remain preserved. See [STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md](STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md) for the exact contract, new validation/race/rules/browser evidence and limits. Build/lint, original and shared/account/stock/procurement/capacity regressions, 57 unit and 176 new emulator checks pass. Two local registry tests and confirmed v2 manual/correction verification pass. Browser responsive and workflow evidence is recorded in the contract. No deployment, inventory merge or final research evaluation occurred.

Next remains persisted reorder/risk-to-purchase linkage and inventory report/exception requirements, followed by Choong's evidence stages/scoring, planning/fleet/customer scope, acceptance and real-data/wallet research evidence. Both full FYP scopes remain partial; earlier pending location/correction descriptions below are historical.

## Latest continuation fixes — 9 October 2026

Issued purchase orders now count as pending; Delivered/Returned close time-based alerts; manual stock commands use stable operation IDs, private transactional receipts and browser retry/outcome recovery. See [continuation review](CONTINUATION_REVIEW_2026-10-09.md) for contracts, limits and next work. Build/lint (zero errors, four existing image warnings), deterministic checks, stock-retry emulator QA, both original Firebase regressions, shared/account QA, 69 responsive browser checks and 19 recovery checks passed. Recovery testing deliberately lost responses and verified exactly one balance change. No production deployment or real-data evaluation occurred. Next is procurement rejection/correction/resubmission and supplier editing, followed by the remaining audited report requirements.

## Latest update — 9 October 2026

The user's navy blue/purple prototype theme and eight-card dashboard are restored, with actual shared-data charts/alerts/activity/links and explicit missing or stale AI results. This supersedes the green workflow-first dashboard described below. See [9 October theme/dashboard evidence](UI_UX_THEME_2026-10-09.md). Final build/lint, deterministic dashboard QA, both original emulator regressions, account-access QA, capacity QA and the 17-step browser workflow pass. The final blue/purple dashboard review passed 69 browser assertions across all 11 modules at desktop/tablet/narrow widths with no page runtime errors. Production deployment, real-data model evaluation and wallet acceptance remain outstanding.

## Latest UI/UX refinement

The existing React app now has an operational workflow dashboard, labelled mobile navigation, searchable modules, record pagination, consistent forms, accessible labels/dialogs and clearer account approval. See [UI/UX refinement](UI_UX_REFINEMENT_2026-10-08.md). Playwright passed 62 layout/interaction assertions across all 11 modules at 1440/768/390/320px, plus 17 submission/role/workflow assertions from signup through receipt, warehouse handover, transport, dispatch and an assigned Driver delivery event. The current build, lint (four existing image warnings), smoke/QA and account-access suites passed. No database schema or rule change was made for this UI refinement. Production release remains pending; UI pagination still reads full collections.

## Latest access redesign

The user selected one shared system with administrator-approved accounts. Organisation creation/switching/invitations have been removed. Initial Admin/main inventory owner is choongkin6@gmail.com, configured in ignored Functions environment files. First verified production registration securely provisions that Admin and adopts existing UID-owned records in place. New users are Pending until approved; disabled/rejected users cannot restore access by registering again. Old memberships and personal records are retained but do not grant access or merge quantities. See ACCOUNT_ACCESS_CONTRACT.md.

Account, stock, warehouse/dispatch, procurement, GPS/evidence, both blockchain paths and 100-line capacity checks run with the new access model. Signup, pending screen, Admin approval and staff shared-data access are checked through Playwright at desktop/narrow widths. Current test scripts supersede the historical account-owned/invitation checks described below. Research evaluation and production deployment remain pending. The older implementation evidence below is retained as historical context.

Latest verification passed: build; lint with four existing image warnings and no errors; smoke and QA scripts; account-access QA; shared workflow with both local-chain registrations; 100-product capacity. Browser checks also confirmed immediate loss of the protected view after disabling, inability to restore access by refreshing, and visibility of both inventory/delivery verification records to the Admin. Pending and User Management/staff pages fit 390px; Admin was checked at 1440px. Production verified-email joining/setup is not claimed as tested.

Working application: `C:/Users/choon/Documents/FYP/FYP`.

The expanded application is saved locally. The public Firebase Hosting site still serves the earlier release. This is a locally verified operational implementation, with research evaluation and production acceptance remaining; it is not evidence that every final FYP objective is complete.

## Delivered code

- Shared organisations, seven staff roles, email-bound expiring invitations, membership revocation and server-authorised writes. Staff use separate credentials and the same workspace inventory. Unrelated organisations remain isolated.
- Product and stock transactions, independent adjustment approval, immutable movement/audit records, supplier/purchase approval/issue/partial receipt workflows. Purchase forms support 1–100 distinct product lines with duplicate validation.
- Warehouse picking allocates reserved stock. Cancellation before handover releases allocations; restarting preserves history. Packing and Prepared-Shipment Handover integrate with dispatch, which consumes allocation and deducts stock exactly once. Shared shipments accept up to 100 distinct product lines.
- Fleet/driver records, fuel/maintenance logs, transport capacity/assignment locks, cancellation and reassignment before dispatch, assigned-driver delivery events, proof-required completion and latest submitted GPS position on Leaflet/OpenStreetMap.
- Private Storage evidence with server-verified SHA-256 and immutable registration; CSV reporting and staff-reviewed predictions.
- Python/scikit-learn Random Forest training/inference, grouped evaluation and baselines; TensorFlow/Keras MobileNetV2 and EfficientNetB0 workflows; authenticated internal inference API with explicit unavailable responses when models are absent.
- Solidity/Hardhat registry, versioned canonical hashing, wallet interface and backend receipt validation for inventory movements and delivery evidence.

## Verification evidence

All checks below used disposable local emulator fixtures, not real customer records.

| Check | Result / scope |
|---|---|
| Production build | Passed; bundle-size warning remains |
| ESLint | No errors; four existing image-element warnings |
| Dependency checks | App runtime and Functions npm audits report zero advisories after patch updates; this is not a complete security certification |
| Firestore smoke script | Passed current rules and original account-owned regression checks |
| Firestore QA script | Passed concurrency, uniqueness, tampering, stock and warehouse regression checks |
| Shared-workspace QA | Passed seven roles, invitations/revocation, cross-workspace isolation, direct-write denial, independent approval, partial receipts, cancellation/allocation, transport/dispatch, GPS validation and Storage evidence controls |
| 100-line capacity QA | Passed actual picking, handover and dispatch for 100 products; 101 lines rejected |
| Solidity tests | Two tests passed for both registry workflows, immutability and registrar permissions |
| Backend + local chain | Both workflows passed confirmed receipt validation and immutable Firestore registration |
| Python workflow tests | Four tests passed: missing data/models, synthetic grouped Random Forest/baselines, MobileNetV2 graph execution and parcel leakage guards |
| Inference HTTP checks | Health correctly reports absent models; unconfigured service and missing models return 503, wrong credentials 401, invalid analysis 422 |
| Playwright | Separate staff accounts shared the same stock; desktop reports at 1440px; nine modules at 390px without horizontal overflow; evidence upload and submitted GPS/map; denied and unavailable location messages; two-line purchase saved, duplicate rejected and new form width checked |

Scripts are in `scripts/`; research tests in `research/test_workflows.py`; contracts/tests in `blockchain/`. Screenshots and disposable fixtures are ignored under `outputs/`. Intentional attack cases produce permission-denied logs.

Synthetic research metrics are discarded. The image graph test uses untrained weights; neither test establishes classification accuracy. Browser geolocation tests use emulated coordinates; they establish permission handling and integration, not physical GPS accuracy. Backend blockchain tests do not establish that browser wallet signing has been accepted by the supervisor.

## Boundaries and remaining release work

1. The user has no labelled inventory/delivery data or Normal/Damaged parcel images. Obtain provenance-reviewed data, label independently, train and evaluate on held-out physical product/delivery/parcel groups, and retain metrics/model versions and error analysis. Do not present rule alerts or synthetic fixtures as trained AI results.
2. Configure Firebase Functions/Storage billing and service permissions, indexes, authenticated evidence CORS, Secret Manager token and an authenticated HTTPS Python inference endpoint. Deploy backend, rules, indexes and interface together only after checks pass; complete production acceptance including verified-email joining and role revocation.
3. Choose the assessment chain/network, preserve chain state, configure RPC/registry and authorised wallets, and record browser signing plus matching/mismatching checks for both verification workflows. Production Functions cannot reach this computer's loopback node.
4. Review organisation ownership and back up existing records before migration. Creating a workspace adopts its creator's records without changing stock; another account's stock requires an explicitly reviewed migration to prevent double counting. Staff join the same organisation rather than creating separate organisations.
5. Complete both students' final requirement-to-evidence and report reconciliation, including the newly saved portfolio copies and supervisor usability testing.

Current scope limits: latest user-submitted location rather than continuous background tracking; recorded fuel additions rather than tank sensors; one location per product; warehouse inspection and a separate receipt for returns; staff roles rather than a customer portal. Large-volume pagination and remaining bundle optimisation need workload testing before broad rollout.

See [shared contracts](SHARED_WORKSPACE_CONTRACT.md), [prepared shipment contract](PREPARED_SHIPMENT_CONTRACT.md), [research instructions](../research/README.md) and [ordered roadmap](../PROJECT_ROADMAP.md).
