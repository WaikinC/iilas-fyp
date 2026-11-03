# IILAS supervisor testing — module by module

## Computer-use AI and location walkthrough — 3 November 2026

The demonstrated order was **Stock AI → fresh fictional product/draft → warehouse handover → transport schedule → dispatch → Delivery AI → In Transit → separate rule assessment → Latest location**. The practice shipment remains active; exact codes/results are in the ignored local walkthrough receipt (outputs/supervisor-ai-walkthrough-20261103-FnaYjr/result.private.json). Existing examples were preserved.

One explicitly approved MSI browser-location point was saved and read in a second tab. This verifies one submitted point only; it does not certify continuous tracking, reported positional accuracy or the Android app. Camera/parcel and physical phone trials remain deferred. The AI result warnings and Pending independent reviews remain visible. The ordinary result tables below are not blanket-marked Pass by this bounded walkthrough.


Prepared 3 November 2026 (Malaysia time). Website: [IILAS](https://fyp-inventory-and-logistics.web.app/).

Use this as the main manual testing checklist. Each module has its own steps and expected result. The [longer workflow guide](SUPERVISOR_TEST_GUIDE_2026-11-03.md) contains additional AI, purchasing and wallet recovery details. Preparing this document does not run the tests: all session results below start as **Not run**.

## Before the session

1. On MSI, open the Desktop **Start IILAS Demo** shortcut. Wait for **READY** for Blockchain, Inventory AI, Delivery AI, Application backend and Website connection, followed by **SERVICES CONNECTED**. Keep MSI awake, plugged in and online.
2. Open the hosted website and press **Ctrl+Shift+R**. You can present from the original laptop while MSI runs the services. New MetaMask signing requires MSI Chrome.
3. Use separate browser profiles/browsers for Admin and Manager. Ordinary tabs in one profile share sign-in. Sign in privately using the existing Admin and Manager accounts; check the displayed account before approving anything.

   Six additional verified/approved role logins are now prepared. See [Role-testing accounts](ROLE_TEST_ACCOUNTS_2026-11-03.md) for the aliases, private password-sheet location and Driver/Customer prerequisites.
4. Use a fresh session name, such as `SUP-20261103-B7K2`. Put it in new fictional product/supplier names, notes and receipt references. Never reset existing examples to their original balances.
5. Prepare a harmless valid PDF labelled **FICTIONAL FYP TEST — NO REAL DELIVERY**. Parcel images, camera, phone/GPS/background/offline trials remain deferred.
6. If startup reports a missing/different blockchain or a binding problem, mark the affected tests **Blocked**. Do not reset Hardhat, delete locks or rerun old setup/seed scripts. Cold-start blockchain recovery is not certified.

### Shared test data

| Item | Enter/use |
|---|---|
| Main product | `<SESSION> Test cartons` |
| Barcode | A unique **8–14 digit** number; no letters, spaces or punctuation |
| Storage location | `<SESSION>-A` |
| Opening stock / reserved | **0 / 0** |
| Reorder level | **10** |
| Manual stock receipt | **20 units** |
| Reservation / release | **4 / 4 units** |
| Purchase order | **10 units**, fictional unit cost **MYR 2.50** |
| Purchase receipts | **4 units**, then **6 units**, each with a different delivery note |
| Shipment | **3 units**, **1 parcel**, fictional recipient/address/contact |
| Transport example | Distance **10 km**, duration **1 hour**, estimated cost **MYR 10** |

Record the codes actually generated below. Product SKU, purchase reference and shipment reference are automatic and locked. Barcode, supplier details, vehicle registration/licence and supplier delivery-note references remain separately entered business information.

| Record | Code generated during your session |
|---|---|
| Product | ____________________ |
| Purchase order | ____________________ |
| Shipment | ____________________ |
| Optional separate stock-AI product / linked purchase | ____________________ |

## Testing order

| Order | Module | Main test |
|---:|---|---|
| 1 | Dashboard | Baseline overview and navigation |
| 2 | User Management | Read-only account/role check |
| 3 | Product Management | Create product with automatic SKU |
| 4 | Stock Management | Receive, reserve and release stock |
| 5 | Replenishment & Procurement | Independent approval and partial/final receipt |
| 6 | Fleet Management | Confirm free driver and suitable vehicle |
| 7 | Order & Dispatch — Part A | Create a Draft shipment |
| 8 | Warehouse Operations | Pick, pack and complete handover |
| 9 | Transport Management | Schedule the Prepared shipment |
| 10 | Order & Dispatch — Part B | Confirm dispatch and stock deduction |
| 11 | Delivery Monitoring | Active-delivery AI/rules, events and PDF proof |
| 12 | Reports & Statistics | Graphs, source records, CSV and integrity observations |

Order & Dispatch needs **two visits**: creating the draft comes before warehouse work; dispatch comes after handover and transport scheduling. This is one module with two workflow stages.

## 1. Dashboard — shared

**Account:** Admin. **Starting point:** signed in, services Ready.

1. Open **Dashboard** and confirm the navy/purple layout and eight summary cards.
2. Read the current product, low-stock, purchasing, shipment and delivery totals. Record the starting values; retained examples mean totals will not start at zero.
3. Open a card/quick link, confirm it reaches the relevant module, then return.
4. Inspect inventory/delivery charts and recent activity. Missing predictions should remain explicit; the dashboard does not run AI automatically.

**Expected:** authorised shared overview, readable status labels and working navigation. Do not interpret historical AI counts as model accuracy.

**Result:** Not run. **UX notes:** ____________________

## 2. User Management — shared

**Account:** Admin. **Scope for this session:** read-only.

1. Open **User Management** and use **All accounts**, status filters and **Search accounts**.
2. Confirm the selected initial Admin remains active/Approved/Admin and the second participant remains active/Approved/Manager.
3. Inspect account/email status and **Copy account ID** if needed to identify an already registered driver resource. Do not copy passwords or verification links into the test log.
4. In the Manager browser profile, check that Admin-only account-management actions are unavailable.

**Expected:** the intended separate accounts and access boundaries. Do not approve strangers, change roles, disable accounts or replace the initial Admin to make a test pass. New-account approval is an optional separate test using an agreed fictional account, not required here.

**Result:** Not run. **UX notes:** ____________________

## 3. Product Management — inventory

**Account:** Admin. **Starting stock:** 0.

1. Select **Add Product**. Enter the main product name, category, location, opening stock **0**, reorder level **10**, Active status and a unique **8–14 digit barcode**.
2. Confirm SKU displays **Assigned automatically when saved** and cannot be typed over. Select **Create Product** once and record the returned `PRD-…`.
3. Search by the exact SKU/barcode. Confirm **0 on hand / 0 reserved / 0 available**.
4. Open Edit, confirm the SKU is locked, then cancel. Existing balances should be changed through stock workflows, not by editing an opening quantity.
5. Optional validation checks: try letters in the barcode, then correct it; try a duplicate barcode with another fictional name and cancel after refusal. A refused attempt must not create another product.
6. Observe the completed creation notification, then move to Stock Management. Record whether it clears and whether a manual close is available.

**Expected:** one saved product, unique valid barcode and a generated locked SKU. The barcode hint/generic error is logged as **UX-001**; the persistent Created banner/missing dismissal is **UX-002**. These are known open UX findings, not implemented improvements. Do not wait for a missing close action to proceed; do not create a second product merely because the success message persists.

**Result:** Not run. **UX notes:** [Personal UX journal](MY_UX_TESTING_NOTES.md).

## 4. Stock Management — inventory

**Account:** Admin. **Starting balance:** **0 / 0 / 0** (on hand / reserved / available).

1. Open **Stock balances**, find the main product, then **Record movement** or the row's **Record** button. The opened dialog is titled **Record stock movement**.
2. Record **Receipt 20**, with `<SESSION>-OPEN` and a fictional reason. Expect **20 / 0 / 20**.
3. Record **Reservation 4**. Expect **20 / 4 / 16**.
4. Optional negative check: attempt **Issue 17** while only 16 are available. Expect refusal; cancel. Balance must remain **20 / 4 / 16**.
5. Record **Release 4**. Expect **20 / 0 / 20**.
6. In **Movement history**, inspect quantities, location, actor/time, reference/reason and before/after values. Refresh; no movement should repeat.

**Expected:** reservation changes availability without reducing physical stock; release restores availability. Finish with **20 units** available for the purchase test.

**AI subtest, optional:** In **Assessment & AI**, use **Open stock check** for rules or **Open AI experiment** for the experimental RF. Inspect a retained result, or use a **separate fictional AI product** and explicit fictional context following the [extended stock-AI procedure](SUPERVISOR_TEST_GUIDE_2026-11-03.md#8-extended-stock-ai-selected-demo-product-to-a-linked-purchase). Keep its quantities separate from the main product. Analysis must not directly alter stock or create a PO. Reported evaluation uses simulated/AI-assisted labels, not independently validated real warehouse accuracy.

**Result:** Not run. **AI subtest:** Not run. **UX notes:** ____________________

## 5. Replenishment & Procurement — inventory

**Accounts:** Admin submits/operates; a **different Manager** approves. **Starting balance:** **20 / 0 / 20**.

1. In **Suppliers**, choose a clearly fictional Active supplier or create `<SESSION> Fictional supplier` with an `example.test` contact.
2. Select **New purchase order**. Choose the main product, quantity **10**, unit cost **MYR 2.50**, and a valid expected replenishment date. Submit once; record the generated `PO-…`. Expect **Submitted**, total **MYR 25.00**, stock still **20**.
3. In the submitting Admin profile, confirm self-approval is unavailable/refused.
4. In the separate Manager profile, open that exact PO, check its details and select **Approve purchase**. Expect **Approved** and the different reviewer in history.
5. Return to Admin. Select **Issue order**, confirm **Issue purchase order**, and expect **Issued**. Physical stock stays **20**.
6. Select **Record receipt**. Receive **4** with delivery note `<SESSION>-DN1`. Expect **Part received**, stock **24**, and **6** still outstanding.
7. Receive the remaining **6** with `<SESSION>-DN2`. Expect **Received**, 10/10 received, 0 outstanding, stock **30 / 0 / 30**.
8. Open **View purchase history**, verify both receipt entries, and refresh. No duplicate stock increase should occur.

**Expected sequence:** Submitted → Approved → Issued → Part received → Received. Approval/Issue do not increase physical stock. The **Expected incoming** demo-lineage view applies to linked demo orders; do not require an ordinary manual PO to appear there. Use the PO's receipt totals/history for this ordinary test.

**Optional linked-AI branch:** An eligible selected-product risk can feed **Reorder review**, independent acceptance and **Prepare or view demo purchase**. This is a separate product/PO with explicit demo lineage. Accepting an AI review does not itself approve a purchase. Follow the longer guide if exercising this branch.

**Result:** Not run. **UX notes:** ____________________

## 6. Fleet Management — logistics

**Account:** Admin. **Goal:** prepare resources before scheduling.

1. Inspect the separate **Vehicles** and **Drivers** tabs, using their own search, page controls and base-status filters. Switching tabs preserves each tab's selection.
2. Choose a fictional vehicle with enough capacity for **1 parcel**, an appropriate maintenance date and **Available** base status. Check its current assignment separately.
3. Choose a **free existing registered driver** whose linked delivery-team account remains active. A base Available label alone does not prove that the resource is unassigned.
4. If a new fictional vehicle is needed, select **Vehicles → Add vehicle**. Enter a unique test Registration, capacity **10**, Available status, maintenance due date and fuel litres, then **Create vehicle** once. Its internal ID is automatic; the registration is entered separately. **Drivers → Add driver** is a different form linking an existing approved delivery-team account; do not create a duplicate driver resource for an already registered account.
5. Optional: open **Fuel & Maintenance** and choose **Record fuel** or **Record maintenance** for your new unassigned vehicle. Inspect the saved history. Do not edit unrelated or assigned resources. If the reply is uncertain, inspect history before another submission.
6. Check the labelled status colours: green Available, blue Scheduled/In delivery, amber Maintenance, grey Unavailable/Unknown. Unknown assignment disables editing even if base status is Available. A navy button is the primary action; a red action indicates cancellation. Optional local form check: type a fictional value, press Close, then Cancel on the discard prompt; the form and value must remain. Close and deliberately discard afterward.

**Expected:** sufficient free resources exist. One login can have only one driver resource; duplicate driver registration is correctly refused. Registering a driver does not approve its login or change its role. If no free approved driver exists, mark scheduling **Blocked**, rather than altering another assignment or creating an account/role as a workaround.

**Result:** Not run. **Vehicle/driver used:** ____________________ **UX notes:** ____________________

## 7. Order & Dispatch — Part A: create a draft

**Account:** Admin. **Starting main stock:** **30 / 0 / 30**.

1. Select **New shipment** and complete **Recipient & delivery** with fictional contact/address and an expected delivery date of **today or later in Malaysia time**. Confirm the visible date guidance. Optional validation check: try yesterday, expect refusal with no new shipment/code, then correct it to today/future.
2. In **Products & parcels**, select the exact main product, quantity **3**, parcel count **1**.
3. In **Review**, check all details, then **Create draft** once. Record the generated locked `SHP-…` reference.
4. Open that shipment under **All shipments** / **Preparation**. Confirm **Draft**, correct product/quantity and stock still **30**.

**Expected:** draft creation does not deduct stock. Do not dispatch now; continue to Warehouse Operations and Transport Management first.

**Result:** Not run. **UX notes:** ____________________

## 8. Warehouse Operations — inventory-to-logistics handover

**Account:** Admin or an already approved authorised warehouse account. **Prerequisite:** your Draft shipment.

1. Find the exact `SHP-…` in the active jobs.
2. Enter **Warehouse notes**, tick the stage confirmation and select **Start Picking**. Inspect the **3-unit** storage allocation.
3. Enter the packing notes, confirm the stage and select **Confirm Packing**. Check parcel count **1**.
4. Enter the handover notes, confirm the stage and select **Complete Handover**.
5. Use **All stages** to find the completed job; it may leave the Active jobs selection. Inspect the retained handover and the shipment's **Prepared** status.
6. Check stock: on hand **30**, total reserved/warehouse held **3**, available **27**. Inspect warehouse-held stock separately from manual reservations.

**Expected:** Waiting → Picking → Packed → HandedOver, then shipment Prepared. Preparation holds stock; it does not consume it. Do not use a generic manual Release to release warehouse-owned holds.

**Result:** Not run. **UX notes:** ____________________

## 9. Transport Management — logistics

**Account:** Admin. **Prerequisites:** Prepared shipment and free registered resources.

1. Use **All plans / Scheduled / Completed / Cancelled** to browse existing plans. Select **Plan prepared shipment**, then the exact `SHP-…` in **Shipment**, and the vehicle and driver in **Vehicle and driver**.
2. In **Route and schedule**, enter Origin, Carrier and Planned date. In **Estimates**, enter **Distance (km): 10**, **Estimated hours: 1** and **Estimated cost (MYR): 10**. The minimum estimated hours is **0.1**. Leave **Optional planning map** collapsed; coordinates are unnecessary for this test.
3. Select **Save transport plan**. Expect **Scheduled** with the chosen resources and destination.
4. Select its **Open plan** button. Confirm values persisted and inspect its labelled status. **Edit / reassign** is available only when allowed; **Cancel schedule** is a separate red action. Do not cancel it before the next dispatch step. Stock remains on hand **30**, held **3**, available **27**.

**Expected:** one saved schedule on the correct Prepared shipment. Assigned/unavailable resources should not be selectable/accepted for a conflicting schedule. Map/duration estimates are not live traffic measurements or GPS evidence.

**Result:** Not run. **UX notes:** ____________________

## 10. Order & Dispatch — Part B: dispatch

**Account:** Admin. **Prerequisites:** completed handover and Scheduled transport.

1. Return to **Prepared & dispatch** and open the exact shipment.
2. Review the handover, product quantity **3**, driver, vehicle and saved transport plan.
3. Open **Confirm dispatch**, tick **I have checked this shipment and its recorded transport**, then select **Dispatch shipment** once.
4. Confirm **Dispatched**, one linked 3-unit stock issue and **27 / 0 / 27** remaining stock. Refresh and confirm it stays **27**.

**Expected:** dispatch consumes the held units once and clears its warehouse hold. Do not dispatch an unrelated prepared example just to demonstrate the button.

**Result:** Not run. **UX notes:** ____________________

## 11. Delivery Monitoring — logistics

**Account:** Admin for staff workflow; separate approved assigned Driver only for the optional restricted view. **Prerequisite:** your Dispatched shipment.

1. Open the exact shipment in Delivery Monitoring. Inspect its focused details and progress.
2. **Before completing delivery**, open **AI & rules → Delivery AI demonstration and rule assessment**. Read the observed context/demo notice; analyse once if demonstrating fresh AI, or inspect a retained result. Inspect the separate rule assessment. Record Unavailable reasons honestly if present.
3. If reviewing the new AI/rule result, use a different Admin/Manager with notes. Review must not change the delivery status. The model demonstrates simulated policy agreement, not proven real delivery forecasting accuracy.
4. In **Progress**, record **In Transit** with a fictional note.
5. In **Proof & parcel records**, select **Proof of Delivery**, choose the harmless fictional PDF and select **Upload evidence**. Open/download it and confirm its label and shipment association.
6. Return to **Progress**, select **Delivered**, select the uploaded PDF in **Proof of delivery**, and select **Record delivery event**.
7. Confirm Delivered and ordered event/proof history. Main stock remains **27**; delivery completion must not deduct it again. Inspect resource assignment release before assuming it is available for the next run.

**Expected:** Dispatched → In Transit → Delivered, with required linked proof. Delivered/Returned shipments stop new active-delivery predictions, so perform AI first. No parcel/camera or location capture is required here.

**Result:** Not run. **AI/rules:** Not run. **UX notes:** ____________________

## 12. Reports & Statistics — both portfolios

**Account:** Admin or authorised Manager. **Prerequisite:** completed module records.

1. In **Overview**, set Malaysia dates and select **Refresh overview**. Wait for the sequential requests to finish. Include the shipment's **expected delivery date** in the window if you want it in that shipment chart.
2. Inspect the large inventory/logistics graphs, labelled status colours and expandable exact-value data. Current stock is a snapshot; expected-delivery and activity-date charts use different documented dates.
3. In **Inventory**, inspect stock movements and purchasing. Confirm the main product's receipts **20 + 4 + 6**, dispatch issue **3**, current balance **27**, and correct purchase status/history.
4. In **Logistics**, inspect shipment/delivery/transport selections and open **View source records**. Confirm the same shipment and date/status filters.
5. Expand **Open detailed records & CSV**, export the permitted current page and check headers/rows. Do not describe a page as a complete export; respect the selection limits and explicit unknown/invalid facts.
6. In **AI & Verification**, distinguish retained stock/delivery predictions, rule assessments and review states. Counts/class scores are not independent model accuracy.
7. Expand **Open research and integrity tools** and locate **SHA-256 blockchain verification**. Inspect existing retained **Verified** inventory and delivery observations using **View original observation**. An old observation is dated evidence, not a newly performed check.
8. Optional fresh registration: only on MSI Chrome with the existing local test wallet, use the [wallet procedure](SUPERVISOR_TEST_GUIDE_2026-11-03.md#9-optional-new-blockchain-registration--human-signing-on-msi). Human confirmation is required. After a timeout use **Check registration** for the same request, never repeated Register clicks. Do not register already registered sources again.

**Expected:** readable graphs/status colours, correct date captions, source/CSV consistency and clear retained integrity details for both portfolios. Hash consistency does not establish physical stock/delivery truth. Keep new wallet signing optional for the session.

**Result:** Not run. **Blockchain read-only / optional new signing:** ____________________ **UX notes:** ____________________

## Optional role-specific web views

- **Driver:** use an existing approved Driver login assigned to an agreed test shipment. Check only assigned deliveries and allowed progress/proof actions. A registered driver resource alone is not a Driver login. Phone installation, GPS, background tracking and offline queue/synchronisation remain **Not run — deferred**.
- **Customer:** use an existing approved Customer login with an explicit test shipment grant. Check only the granted customer-safe shipment/proof. A matching recipient name/email is not access permission. Keep location sharing off. Access/revocation changes need an agreed separate test; downloaded files cannot be recalled.
- **Viewer/restricted staff:** with a prepared approved account, inspect permitted reads and refused/unavailable writes. Do not swap the main Manager's role just to create these views.

If those accounts/grants are not already prepared, mark their checks **Blocked**, not Failed. These are optional access branches, not prerequisites for the two-participant core workflow.

## Balance checkpoints

These values assume a fresh main product, no optional transfer and no concurrent edits to it.

| Checkpoint | On hand | Total reserved/held | Available |
|---|---:|---:|---:|
| Product created | 0 | 0 | 0 |
| Manual receipt 20 | 20 | 0 | 20 |
| Reservation 4 | 20 | 4 | 16 |
| Release 4 | 20 | 0 | 20 |
| Purchase approved/issued | 20 | 0 | 20 |
| Partial purchase receipt 4 | 24 | 0 | 24 |
| Final purchase receipt 6 | 30 | 0 | 30 |
| Draft shipment | 30 | 0 | 30 |
| Warehouse holds 3 / handover / scheduling | 30 | 3 | 27 |
| Dispatch 3 | 27 | 0 | 27 |
| Delivered | 27 | 0 | 27 |

## Result and UX log

Use **Pass**, **Fail**, **Blocked** or **Not run**. Expected validation refusal counts as Pass when no unwanted change occurs. A missing account/service/resource is Blocked. An uncertain saved operation is unresolved until its original outcome is checked; do not submit a replacement.

| Order/module | Result | Assigned record/code | Actual observation / UX issue |
|---|---|---|---|
| 1 Dashboard | Not run | — | |
| 2 User Management | Not run | — | |
| 3 Product Management | Not run | | UX-001 / UX-002 already logged |
| 4 Stock Management | Not run | | |
| 5 Replenishment & Procurement | Not run | | |
| 6 Fleet Management | Not run | | |
| 7 Order & Dispatch — Draft | Not run | | |
| 8 Warehouse Operations | Not run | | |
| 9 Transport Management | Not run | | |
| 10 Order & Dispatch — Dispatch | Not run | | |
| 11 Delivery Monitoring | Not run | | |
| 12 Reports & Statistics | Not run | | |
| Optional stock AI / linked reorder | Not run | | |
| Optional new wallet registration | Not run | | |
| Optional Driver / Customer / Viewer web view | Not run | | |
| Parcel/camera and physical phone/GPS/offline | Not run — deferred | — | |

For each finding, add the module, Malaysia date/time, role/browser, exact code, steps, expected versus actual result, and a redacted screenshot to [My UX Testing Notes](MY_UX_TESTING_NOTES.md). Keep passwords, private configuration, real personal data and wallet keys out. UX findings are recorded for later work; this guide does not apply UI changes.

For a read-only fallback, the completed fictional rehearsal **SUP-261103-6B5F51** has **PRD-000001**, **PO-000001**, **SHP-000001** and final stock **27**. These are already completed examples; inspect them rather than resetting/repeating their actions. Use a fresh session/product to repeat the numbered flow. See [dated live acceptance](AUTOMATIC_CODES_LIVE_ACCEPTANCE_2026-11-03.md) for what was previously verified.
