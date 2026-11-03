**Current update — 2 November 2026:** [restored services and verified live Transport lifecycle](SUPERVISOR_READINESS_2026-11-02.md). Historical quota/stopped-runtime statements below are superseded. New wallet confirmations are pending on the fresh local chain.

# Live supervisor workflow rehearsal — 1 November 2026

**Later correction:** the [focused transport query fix is now live](TRANSPORT_FORM_FIX_2026-11-01.md); SHP05 selection succeeds. Actual live plan creation/revision/cancellation remains pending because the daily Firestore read quota was exhausted. Historical failures and balances below describe the earlier rehearsal; no plan save or stock mutation was issued during the correction.

The hosted inventory and logistics workflows were exercised using only `SUP-261101-79F529` fictional records. Inventory, warehouse, dispatch, delivery, model integration, proof downloads and filtered reporting passed the checks below. **Transport plan creation has one confirmed live interface failure and needs fixing before an uninterrupted supervisor walkthrough.** Its authenticated backend command passed; this is not a full UI pass.

Website: https://fyp-inventory-and-logistics.web.app/. Keep MSI powered, awake and online. Parcel/camera and physical Android/GPS/offline trials remain deferred. No deployment or Git publication occurred during this rehearsal.

## Test results

| Check | Result | Evidence and coverage |
|---|---|---|
| Catalogue | Pass | Live search found twelve supervisor products. Foam inserts reorder level changed 5 → 6 without changing stock. Duplicate SKU/barcode creation was refused; original uniqueness retained. |
| Manual stock | Pass | Live receipt +20, reserve 6, issue 5, refused over-issue 22, release 6 and transfer 4. Exactly five successful ledger entries. Foam inserts end at 27 on hand, 0 reserved, A1 23 / B1 4. |
| Stock RF | Pass, integration only | Fresh live selected-product analysis of fictional thermal-label context returned Critical Stock Risk. Native/stored result, exact recovery and worker cleanup match. About 13.75 seconds service time for this one request. |
| Risk/reorder review | Pass, API review | Automatic linked alert and Pending requirement created. Admin self-review refused. Existing independent Manager accepted via authenticated app API; exact saved outcome recovered. No account/role changes. |
| Linked purchase | Pass | Live form created `SUP-261101-79F529-REH-AI-PO`, 10 thermal label units, MYR 25.00. Self-approval refused; independent Manager approved through API. |
| Issue and receipts | Pass | Live Issue recorded expected incoming 10, physical stock still 0. Live partial receipt 4 → incoming 6 / stock 4. Final receipt 6 → incoming 0 / stock 10, Received. Exact retry recovery and excess receipt refusal checked through API. |
| Existing delivery SHP07 | Pass | Actual live PDF file selection, upload and Delivered transition. Authenticated download matches bytes. Transport completed and assignments released. |
| Warehouse SHP01 | Pass | Live Picking → Packed → HandedOver, immutable three-unit allocation and Prepared shipment. Physical cartons stayed 74 while reserved rose 12 → 15. Locked edit and protected-allocation release refused through API. |
| Fleet | Pass | Live fictional VAN2 fuel event +5 litres / MYR 10, fuel 30 → 35. Maintenance vehicle scheduling refused through API. |
| Transport creation UI | **Fail** | Selecting Prepared SHP01 displayed “Missing or insufficient permissions”, cleared the shipment and left Save disabled. See diagnosis below. |
| Transport backend | Pass, API only | Existing authenticated recoverable `reviseTransportPlan` created SHP01 schedule with available VAN1/driver; exact saved operation recovered. No permission/rule changes. |
| Dispatch SHP01 | Pass | Actual live dispatch reduced cartons 74 → 71 and reservations 15 → 12 exactly once. One three-unit Issue movement; stale repeat refused through API. |
| Delivery status / RF / rules | Pass | Live In Transit, fresh RF Low and separate Low rule assessment. Saved outcome recovery and native output/worker cleanup verified. Service about 4.41 seconds; displayed worker 4.41 seconds and model prediction 29 ms. These are different measurements. |
| Delivery review | Pass, API review | Self-review refused; independent existing Manager acknowledged result and range warnings; exact recovery verified. |
| Proof requirement | Pass | Delivered without registered proof refused. SHP01 generated fictional PDF used existing authenticated upload/register/download protocol; SHA-256 matches. SHP07 separately covered actual live file UI. |
| Delivered SHP01 | Pass | Actual live Delivered action with SHP01 proof. Transport Completed; vehicle/driver locks released; stock stays 71 / reserved 12. Stale duplicate completion refused. |
| Inventory/logistics reports | Pass | Actual live filtered inventory report: P11 stock 27 / reserved 0 / reorder 6. Delivery report: SHP01 Delivered, correct proof ID. Each shows one row and exhausted selection; complete filtered CSV exports each contain one data row. |
| Existing blockchain proofs | Pass, read-only | Original Document pouches receipt and SHP08 proof remain independently Verified. Current canonical digests match registry and successful receipts in blocks 2 and 3; SHP08 download bytes match. Chain still block 3, no pending/new signatures. |
| Responsive verification | Pass, browser check | At requested 390 × 844 viewport, no document-wide overflow; labelled status badges remain horizontal, about 32.4 px high. Viewport reset afterward. This is not physical phone testing. |
| Dedicated Driver/Customer/restricted login | Not run | Current rehearsal used actual Admin and existing separate Manager. A driver resource linked to Admin is not a Driver login. No account creation/role swapping was performed. |
| Parcel and physical phone trials | Deferred | Excluded by user. No image inference, camera, GPS or background/offline device trial. |

## Transport issue to fix next

The live Transport form looks up a plan with `ownerId` plus exact document ID. The deployed rules permit reading an existing owned plan, but reject this lookup when no document exists. The form therefore never retains a newly selected shipment.

A fresh normal Admin Web SDK server-read comparison under the current deployed rules confirmed:

| Lookup | Actual result |
|---|---|
| Owner + existing SHP07 plan document ID | Allowed, one record |
| Owner + absent SHP01 plan document ID, before plan creation | Permission denied |
| Owner + `shipmentId` field for the same absent SHP01 plan | Allowed, zero records |

Recommended focused correction: use the owner/shipment-field query, validate the returned plan identity and retain the no-plan case. Test absent, existing and inaccessible plans before a coordinated live UI release. Keep current access rules. **No fix or deployment is claimed by this rehearsal.** SHP01 was scheduled through the app API only after the diagnostic captured the empty-plan case. Remaining unscheduled SHP05/SHP06 are available for a later real form test after correction.

Minor usability findings: refused catalogue/stock operations use a generic recovery error instead of the business reason. Success notifications can cover an action in the narrow layout until dismissed. The already completed flows remained usable; these are separate from the transport blocker.

## Current fictional balances and demonstration choices

| Item/reference | End of rehearsal |
|---|---|
| P01 Shipping cartons | On hand 71, reserved 12, available 59; three units dispatched for SHP01 |
| P07 Thermal label rolls | On hand 10, reserved 0; linked AI purchase Received, expected incoming 0 |
| P11 Foam inserts | On hand 27, reserved 0; A1 23 / B1 4; reorder 6 |
| `REH-AI-PO` | Received, 4 + 6 units, MYR 25.00 |
| SHP01 / SHP07 | Delivered with separate marked fictional PDFs; transport Completed |
| SHP08 / Document pouches receipt | Existing current-chain Verified sources, unchanged; do not register again |
| SHP02 / SHP03 / SHP04 | Original Draft / Picking / Packed examples unchanged |
| SHP05 / SHP06 | Original Prepared, unscheduled examples unchanged |
| Original PO01–PO06 | Unchanged; retain their staged examples for the supervisor |

Do not rerun the seed to reset these records. For another stock action, record its current starting balance and use a new clearly fictional reference. Show the retained RF inputs/provenance and separate rules: both stock/delivery models learn simulated policies, with no independent real-business accuracy claim. SHP01 Low prediction flagged `elapsed_hours` and `hours_since_last_update` outside training ranges; acknowledging it does not validate forecasting quality.

## Preservation and operator handover

Fresh before/after census: 636 → 723 documents. Exactly seven selected original business records changed; 627 original records including their metadata remain unchanged. Two transient resource-assignment locks were released through normal completion. Eighty-nine new related workflow/audit/request/proof records were classified and verified. All three account identities, roles, verification and credential flags remain unchanged; volatile sign-in/refresh times alone are excluded. No original business record was deleted.

All eleven original proof-store files are unchanged. Two new PDF objects added six files (bytes, manifest and commit marker each), giving seventeen files including the existing lock. Every file was hash-verified into a restricted after-test backup outside OneDrive/Git. Runtime source/model pins, Hosting release and public origin remain unchanged. Stock/delivery/API/public health pass; billing remains disabled. No model retraining or evaluation-test reuse occurred.

Ignored evidence folder: `outputs/spark-msi-demo-20261028/supervisor-rehearsal-20261101/`. `completed.private.json` binds the verified backup; per-command journals retain original requests and exact recovery. Two verifier implementation mismatches (ledger collection/filter and original operation identity) and proof-format accounting were corrected without repeating their business actions or prediction. Failed observations remain distinguishable from completed receipts.

Latest private handover: `outputs/spark-msi-demo-20261028/cloud-runtime-after-supervisor-workflow-20261101.private.json`. It retains the same preparation, owners, stock token wrapper and two wallet receipts. Do not restart healthy Hardhat, overwrite pinned main application sources, expose private ports or use old service-token launchers. The user-facing report is left open in the browser. A complete uninterrupted live UI walkthrough remains pending the transport form correction; role-specific browser and deferred physical trials are not certified by this report.
