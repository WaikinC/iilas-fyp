# IILAS supervisor testing workflow — 3 November 2026

For the ordered **module-by-module checklist**, start with [Supervisor Module Test Guide](SUPERVISOR_MODULE_TEST_GUIDE_2026-11-03.md). This document remains the companion for extended workflow, AI and wallet details. Record usability findings in [My UX Testing Notes](MY_UX_TESTING_NOTES.md).

**Live update verified.** Automatic locked product, shipment and purchase codes are published at the website below. All 17 application assets and the deployed Firestore rules match the prepared release; billing is disabled. The Desktop launcher reports all five services Ready. The fictional live API rehearsal passed 8 checks, with existing records, chain and proof bytes preserved. Browser checks confirmed the three locked code fields and loaded inventory/logistics graphs. This rehearsal is separate from your supervisor's manual UI session: the result checklist below starts as **Not run**. No fresh parcel, phone or wallet-signing trial was performed.

Website: [IILAS](https://fyp-inventory-and-logistics.web.app/).

Firebase Spark provides Hosting, Authentication and Firestore. The authenticated API, proof files, two frozen stock/delivery AI services and private demonstration blockchain run on MSI. Keep MSI plugged in, awake and online even when the supervisor uses another laptop. Billing remains disabled. These are fictional workflow demonstrations, with experimental AI limitations stated below.

## Choose the session length

| Route | Suggested time | Coverage |
|---|---|---|
| Essential | 20–30 minutes, once accounts and services are ready | Start/access, retained evidence, one new product, stock 0→20, reserve/release, independently approved PO with 4+6 receipts, graphs and source report. Stop with quantity 30. |
| Extended | A further 30–60 minutes; choose branches that fit the presentation | Duplicate-barcode prevention, location transfer, warehouse handover and three-unit dispatch, delivery events/PDF, selected-product AI and independent review, optional new wallet registration, role-specific checks. |

If time is short, inspect retained purchasing/delivery/AI/verification history and run only the new product/stock steps. Mark omitted cases **Not run**. Existing accounts, an available driver/vehicle and MSI wallet readiness are prerequisites, not promises about the duration.

## 1. Start and prepare two account sessions

1. On MSI, double-click **Start IILAS Demo** on the Desktop. Wait for five **Ready** lines: private blockchain, stock AI, delivery AI, authenticated backend and website connection. The shortcut reuses the configured healthy services; do not run old one-time release/seed helpers or start another emulator stack.
2. If it reports **Blockchain recovery needed**, a binding problem or an unavailable service, stop the affected branch and record **Blocked**. Ask the project owner to recover the approved runtime. Do not reset Hardhat, delete locks or create a replacement chain as a checklist action. The chain is held in memory; a full shutdown, power loss or process loss can remove its history. Durable cold-start recovery is not certified. The same chain ID/address alone does not establish the same chain generation.
3. Open the website, press **Ctrl+Shift+R**, and wait for loading to finish. Use the hosted address on the original laptop. An ordinary remote browser can use the web workflows; new MetaMask signing belongs on MSI Chrome.
4. Use **separate browser profiles or separate browsers**, labelled Admin and Manager. Two ordinary tabs in one profile share sign-in. Sign in privately as Admin **choongkin6@gmail.com** and Manager **wakkin666@gmail.com**. Check the displayed account before each approval. Do not share passwords or change roles to make a case pass.
5. Confirm approved access, the navy/purple dashboard and eight summary cards. New staff normally need verified email and administrator approval. The app is one shared system; no organisation switching or personal-inventory merge is part of the demonstration.
6. Choose a unique session token, for example `SUP-20261103-A7K2` (replace the date/suffix for your session). Use it in product/supplier names, fictional recipient details, movement reasons/references and delivery notes. Use only fictional business facts and a harmless valid PDF labelled **FICTIONAL FYP TEST — NO REAL DELIVERY**.

**Expected:** both profiles show the correct separate accounts and shared authorised records; the startup check has five Ready results. Health checks establish service availability, not completion of a business or AI test.

### Record the codes the app assigns

New product SKUs, shipment references and purchase references display **Assigned automatically when saved**. Their formats are `PRD-000001`, `SHP-000001` and `PO-000001` (examples only). Record the actual returned values; do not assume the next number or type your session token into a locked code field. Existing legacy codes are preserved and read-only. Editing a product or correcting/resubmitting a purchase keeps its original code.

A manufacturer barcode remains separate from the SKU. Scan a unique 8–14 digit barcode using a reader that enters text into the **Barcode** field, or type a unique fictional 8–14 digit number. This does not require a parcel camera test.

| Session record | Assigned business code | Record ID if needed |
|---|---|---|
| Main test product | Fill after save | Fill after save |
| Main ten-unit purchase | Fill after submit | Fill after submit |
| Optional three-unit shipment | Fill after save | Fill after save |
| Optional separate AI product / linked purchase | Fill after save | Fill after save |

If creation shows **Creation awaiting confirmation**, use **Check outcome**. If it is still unapplied, **Retry saved creation** preserves the original intent. Do not submit a new form in another tab to replace an uncertain request. **Cancel saved creation** is an explicit cancellation of that saved intent, not deletion of a committed record. Stock, AI, linked purchasing and verification have their own saved-outcome controls; use those when a reply is uncertain.

## 2. Inspect retained examples before changing anything

1. Search Product Management/Stock Management for **SUP-261101-79F529** or the older **CLOUD-00e13bd5** demonstration. Read the current loaded balances and movement history. The 1 November pack has been exercised since seeding: the original starting-balance table is historical. Do not restore a product to an old number or rerun its seed script.
2. In **Replenishment & Procurement → Purchase orders**, inspect a retained Received order and **View purchase history**. Identify submission, a different Manager's approval, Issue, partial receipt and final receipt. Read staged Submitted/Rejected/Approved/Issued examples without advancing them during this inspection.
3. In **Delivery Monitoring**, inspect a retained Delivered fictional shipment and its PDF proof. Inspect its retained delivery AI result and separate rule assessment if present.
4. In **Reports & Statistics → AI & Verification**, open the research/integrity tools and inspect retained integrity checks with **View original observation**. The 3 November release independently rechecked the same chain generation and both successful human-confirmed transactions. The retained observations remain dated checks; no new signature is needed to view them.

Useful retained source IDs for the release owner to confirm:

| Workflow | Retained fictional source |
|---|---|
| Inventory receipt: thermal-label purchase | `bf19d6d5-7277-44a2-89a7-3561edc97849` |
| Delivery evidence: SHP01 fictional PDF | `b158fe2f-e7da-4116-b9dc-f925df28c80d` |

**Expected:** traceable history, actor/time, source links, current balances and saved outcomes. Viewing an old Verified observation does not recheck today's chain or prove a physical delivery. If the supervisor's wallet is not ready, this retained read-only route is the verification fallback. Do not register these already registered sources again.

## 3. Create the main product and test stock

Work in the Admin profile. Keep other testers away from this product while using the arithmetic below.

1. Open **Product Management → Add Product**. Name it `<SESSION> Test cartons`; choose a category, storage location `<SESSION>-A`, **Stock on hand 0**, **Reorder level 10**, **Active**, and a unique numeric barcode. Leave the automatic SKU field alone and choose **Create Product**. Record the assigned `PRD-…` code. Refresh and search by that exact SKU or barcode; confirm on-hand/reserved/available are **0/0/0**. Reopen Edit and confirm the SKU is locked; cancel without changing balances.
2. Open **Stock Management → Stock balances → Record movement** (or **Record** on the product row). The opened dialog is titled **Record stock movement**. Select the exact product. Record **Receipt 20** into `<SESSION>-A`, with a fictional reference such as `<SESSION>-OPEN` and a reason. Confirm **20 on hand, 0 reserved, 20 available**.
3. Record **Reservation 4** at that location. Confirm **20/4/16**. Reservation changes availability, not physical on-hand.
4. Optionally attempt an **Issue 17** while only 16 are available. Expect refusal or a disabled submission; cancel. Confirm no new committed movement and still **20/4/16**.
5. Record **Release 4**. Confirm **20/0/20**. In **Movement history**, inspect the receipt, reservation and release: correct product, quantity, location, reference/reason, actor, time and before/after balances.
6. Optional duplicate check: open Add Product with a different fictional name but the same barcode. The duplicate must be refused. Cancel the form and confirm the original remains unchanged. Automatic SKUs are not manually chosen for a duplicate-SKU test.

| Checkpoint | On hand | Reserved | Available |
|---|---:|---:|---:|
| Saved new product | 0 | 0 | 0 |
| Receipt 20 | 20 | 0 | 20 |
| Reserve 4 | 20 | 4 | 16 |
| Rejected Issue 17, if attempted | 20 | 4 | 16 |
| Release 4 | 20 | 0 | 20 |

**Expected:** one committed effect per confirmed movement; refresh does not repeat it. If a response is uncertain, use **Check outcome** / **Retry saved movement** for that original request before doing anything else. An unresolved timeout is not a confirmed failure and is not permission to create a replacement.

## 4. Purchase ten more units with independent approval

This is the essential purchasing route. It is a manual purchase; it does not claim AI-to-purchase lineage.

1. In **Replenishment & Procurement → Suppliers**, select an existing clearly fictional Active supplier, or create `<SESSION> Fictional supplier` with a reserved example email and Active status. Do not alter real suppliers.
2. In **Purchase orders**, submit a new purchase for the main product: quantity **10**, a fictional MYR unit cost such as **2.50**, and a valid expected replenishment date. The reference is assigned automatically. Record the returned `PO-…` reference and verify **Submitted**. On-hand remains **20**.
3. In the submitting Admin session, inspect approval. Self-approval must be unavailable/refused. A hidden/disabled action or a clear denial is a successful prevention result; do not change accounts/roles within that profile to bypass it.
4. In the separate Manager profile, find the exact `PO-…`, verify product, quantity, supplier, cost and date, and select **Approve purchase** with fictional review notes. Confirm **Approved** and that the history identifies the different reviewer.
5. Back in the authorised operating profile, select **Issue order**, then confirm in **Issue purchase order**. Confirm Issued and on-hand still **20**; issue records an order sent to the supplier, not goods physically received.
6. Select **Record receipt**, then enter **4** units in **Record purchase receipt** with delivery note `<SESSION>-DN1`. Confirm **Part received**, 4/10 received, 6 outstanding, and main stock **24/0/24**.
7. Record the remaining **6** with a different note `<SESSION>-DN2`. Confirm **Received**, 10/10 received, 0 outstanding, and stock **30/0/30**. Refresh and check purchase history plus the two linked receipt movements; refresh must not add another ten.

**Expected:** 0→20→24→30 on-hand across creation, manual receipt and the two PO receipts. Submission/approval/Issue never increase on-hand. Duplicate delivery notes and over-receipt are prevented. Use saved-operation recovery if displayed; do not receive the same physical fictional note under a new note merely because a reply was slow.

## 5. Show reports, graphs, sources and CSV

1. Open **Reports & Statistics → Overview**, choose activity dates covering this session in Malaysia time, and select **Refresh overview**. Wait for sequential loading to finish.
2. Inspect the inventory stock-condition chart and logistics shipment-state chart. Expand a chart's exact-value data table. Explain that current stock is a snapshot; the logistics overview uses selected **expected-delivery dates**, while dated movement/event reports use their documented activity dates. An unfiltered dashboard total need not equal a filtered chart.
3. Open **Inventory** for movements/purchasing and **Logistics** for shipment/transport/delivery reports. Use the main product or purchase's exact code/ID and appropriate dates/status. Select **View source records** to drill down to the underlying selection. Show the 20-unit receipt and 4+6 purchase receipts, and check that the balances/current order agree with their histories.
4. Export the permitted **current-page CSV** where offered and inspect its headers, filters and rows. Use complete export only within its stated selection limits. A refused oversized selection is preferable to an incomplete chart/export; do not present one page as the whole system.
5. In **AI & Verification**, distinguish experimental predictions, human reviews and retained integrity observations. Historical AI labels and chart counts are not accuracy measurements. Unknown/unavailable values should remain explicit.

**Expected:** authorised data, readable graphs/tables, correct scope/date captions and source/CSV consistency. Existing totals include retained records from other fictional sessions; this guide does not prescribe a fixed system-wide count.

## 6. Extended logistics: transfer, handover and dispatch three units

Start only after the main product is **30/0/30**. Keep the essential result at 30 if this branch is omitted.

1. Optional **Transfer 5** from `<SESSION>-A` to `<SESSION>-B`. Confirm total still **30/0/30**, with bins A=25 and B=5. Transfer relocates free units; it does not create or consume stock.
2. In **Order & Dispatch**, create a new Draft for **3** units of the main product. Follow **Recipient & delivery → Products & parcels → Review**. Use a fictional recipient/destination/contact, valid date and parcel count 1. Record the assigned `SHP-…` reference. Confirm Draft and on-hand still **30**.
3. In **Warehouse Operations**, select that exact shipment. At each stage enter **Warehouse notes** (3–240 characters), tick its confirmation and select **Start Picking → Confirm Packing → Complete Handover**. Inspect the three-unit bin allocation. After handover, select **All stages** to find the completed job; it leaves the default Active jobs view. Follow Waiting → Picking → Packed → HandedOver; the shipment becomes **Prepared**. On-hand remains **30**, warehouse-held reserved becomes **3**, available **27**. Do not try to release warehouse allocations using a generic stock Release. The owning pre-handover cancellation is the proper release path; completed handovers remain traceable.
4. In **Fleet Management**, inspect a suitable fictional driver resource and vehicle. Verify actual assignment availability and capacity; a base Available label does not guarantee an unoccupied resource. A driver resource alone is not a separately approved Driver login.
5. In **Transport Management**, choose **Plan prepared shipment**, select the shipment and available registered driver/vehicle, and enter Origin, Carrier, Planned date, **Distance (km)**, Estimated hours (at least 0.1) and Estimated cost (MYR). Select **Save transport plan** and confirm **Scheduled**. Reuse a free registered driver; each login has one driver resource, so creating another for the same account is correctly refused. Optional map values are planning estimates, not live traffic or proven road routing. Inspect the saved plan. A scheduled shipment's destination/date may require schedule cancellation before editing.
6. In **Order & Dispatch → Prepared & dispatch**, open **Confirm dispatch**, tick **I have checked this shipment and its recorded transport**, then select **Dispatch shipment** once. Confirm Dispatched and stock **27/0/27**, with exactly one linked three-unit dispatch issue. Refresh; it must remain 27. Inspect the handover and saved allocation/history.

**Expected:** warehouse preparation reserves three units without changing on-hand; dispatch consumes those held units once. The warehouse and logistics modules share the same product/shipment and immutable handover. If no suitable available resources exist, mark scheduling/dispatch **Blocked** and preserve the prepared state rather than changing unrelated assignments.

## 7. Extended delivery: risk, status and fictional PDF proof

Use the newly dispatched active test shipment. Admin/Manager/Logistics can perform allowed staff actions. Test an assigned Driver's restricted experience only with a suitable approved Driver account; mark that distinct branch Blocked if one is unavailable.

1. In **Delivery Monitoring**, open the exact shipment. Open **AI & rules**, then expand **Delivery AI demonstration and rule assessment**. Read the server-observed facts and acknowledgement about simulated demonstration data before analysing once. Missing facts may correctly produce **Unavailable**; record the reason instead of inventing delivery history.
2. Inspect the retained Random Forest **Low/Medium/High** result, class scores, model/source identity, timing and warnings. Inspect/save the **separate rule assessment** independently. They can disagree. The reported 98.33% held-out simulated-policy agreement is not independently validated real-delivery accuracy; a retained policy disagreement is not hidden by the guide.
3. If review is required, use a different Admin/Manager to acknowledge or request follow-up with notes. A review does not approve the model or change delivery status. Delivered/Returned shipments intentionally stop new active-delivery prediction; analyse while the test delivery is active.
4. Record the next permitted status: **Dispatched → In Transit**. Use a clear fictional event note. Open **Proof & parcel records**, select **Proof of Delivery**, choose a harmless valid PDF explicitly marked fictional, then select **Upload evidence**. Inspect the shipment link, file name/type, actor, time and hash; open the PDF to verify its label.
5. Return to **Progress**, select **Delivered** and select the uploaded PDF in **Proof of delivery**, then select **Record delivery event**. Complete **In Transit → Delivered** only after the required proof is present. Confirm final loaded Delivered status and ordered events. Invalid transitions/missing required proof must be refused. Stock stays **27**; delivery completion does not deduct it again. Returned goods require a separately inspected warehouse receipt, not an automatic stock reversal.

**Expected:** retained risk/rule/review facts stay separate from operational status, and proof is linked to this shipment. Do not use parcel images, camera capture, browser GPS or phone tracking in this session.

## 8. Extended stock AI: selected demo product to a linked purchase

Use a **separate new fictional AI product**, opening 0, reorder 10, and a different unique barcode. Its automatic SKU and any linked purchase are separate from the main product's 30/27-unit ledger.

1. In **Stock Management → Assessment & AI**, distinguish **Stock assessment** (explainable rules) from **Stock AI experiment** (experimental Random Forest). Select **Open AI experiment** and choose **Scenario source → Selected demo product**. Select the new AI product and wait for its recorded balances/version.
2. Tick **I am using demonstration records with fictional context**. Explicitly enter a complete fictional scenario, for example 30-day movement count 6, adjustment count 0, days since replenishment 30, additional firm quantity 4 due in 1 day, and **No incoming batch** (explicitly 0 incoming, no ETA). State aloud that the product balances are recorded, while history/demand/supply are invented for this experiment. These inputs are not claims about a real warehouse.
3. Read **Derived scenario inputs**, then select **Analyse simulated scenario** once. Record the saved Normal/Reorder Risk/Critical Stock Risk class, all scores, provenance, range warnings and any Unavailable reason. The context study's 81.53% result is from simulated held-out scenarios; it does not guarantee 80% or establish real warehouse accuracy. Do not force a chosen class.
4. Analysis alone must leave quantity 0 and create no purchase order. A new product-bound Reorder Risk/Critical Stock Risk may create a separate demo alert/requirement. Normal, Unavailable, fully fictional manual scenarios and historical results do not provide this new linked-risk branch.
5. In **Replenishment & Procurement → Reorder review**, find the exact product/result and inspect lineage. The experiment's own actor must not accept it. In the different Manager profile, choose **Accept for demo review only**, enter review notes of at least ten characters and **Record demo decision**. Confirm Accepted, unchanged stock and no automatic PO. Acceptance does not validate the model or establish a real shortage.
6. As the operating Admin, open **Prepare or view demo purchase** from the accepted requirement. Enter an Active fictional supplier, your own quantity **10**, MYR cost and expected date. The new `PO-…` is automatic/locked; the model does not choose its purchase quantity. Record the product/result/requirement/PO links. Reopening the same accepted requirement should lead to that linked order, not create a second one.
7. Obtain independent Manager purchase approval again, explicitly Issue, then receive 4 and 6 using two unique AI-branch delivery notes. This separate product should finish **10/0/10**. In **Expected incoming**, linked Issue means 10 expected and no physical increase; partial receipt means 4 received/6 outstanding; final means 10 received/0 outstanding. Inspect the preserved experimental source throughout.

If the result is Normal/Unavailable, record the observed outcome and mark the risk-trigger/review/link branch **Not run** or **Blocked** with its reason. Inspect the retained linked example instead. A manually created PO demonstrates purchasing but does not substitute for AI lineage. Refresh/reselect if product facts change; use **Check saved demo-product outcome**, **Check demo review outcome** or **Check demo purchase outcome** for uncertain replies.

## 9. Optional new blockchain registration — human signing on MSI

Skip new signing if the human wallet is not ready; use section 2's retained observations. No wallet import, signature or transaction was performed while preparing this guide.

1. On **MSI Chrome**, use the existing imported public local test account **0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266** (`0xf39F…92266`) and **IILAS Local Demo, chain 31337**. The current recorded registry is **0x5FbDB2315678afecb367f032d93F642f64180aa3** (`0x5FbD…0aa3`). The release checks preserved the same approved generation and both successful wallet transactions; check startup again before new signing. Use fake local test ETH only. Stop if network, account, registry or generation differs; setup/recovery is separate work.
2. In **Reports & Statistics → AI & Verification**, open **Open research and integrity tools** (below the dashboard) and find **SHA-256 blockchain verification**. Expect **Local demo available**.
3. Choose **Workflow: Inventory movement** for an eligible committed purchase receipt, or **Delivery evidence** for the fresh fictional PDF. Select the exact source, comparing its ID/name/type. **Find source** searches the loaded candidate page; use the page controls for other records. Do not assume a search across all records.
4. Click **Register hash with wallet** once. The human reviews the original request in MetaMask: same public test account, chain 31337, expected registry, **0 ETH transaction value plus fake local gas**. Personally confirm once. Never enter wallet passwords, keys or recovery phrases into chat or the result log.
5. Return to IILAS and use **Check registration** for that saved request. A timeout, expired timer or delayed response is not a reason to press Register again or request another signature. Keep the source/request intact for reconciliation if it remains pending or reports deployment/manual recovery needed.
6. After Completed registration, choose **Check and retain hash**, then **View original observation**. Expect Verified for the unchanged registered source, with matching expected/observed digests and chain/contract/block details. Record public transaction/source references if needed. Not registered, Unmatched or Unavailable is an explicit result to investigate, not a label to overwrite.

**Expected:** one human-authorised registration and a separately retained observation. A matching hash proves consistency with the registered content, not the truth of a stock count, fraud absence, parcel condition or real delivery. Service health and an old Verified row alone do not prove a new wallet transaction succeeded. Do not re-register the retained thermal-label/PDF sources just to demonstrate the button.

## 10. Optional permission checks and deliberate deferrals

Use already prepared approved accounts for role-specific trials. A Viewer/restricted staff account should have permitted read access and unavailable/refused write actions. A Customer should see only an explicitly granted test shipment and customer-safe proof, then lose future protected access after revocation. Downloaded files cannot be recalled. Do not change the initial Admin or main Manager role, or create grants on unrelated shipments, simply to complete a case. Mark missing account prerequisites **Blocked**.

Keep **parcel-image/camera analysis**, **Android phone installation**, **real browser/phone GPS**, **background tracking**, **offline queue/reconnection**, and **full shutdown/restore** as **Not run — deferred**. A narrow desktop window tests web layout only. Do not deliberately kill services, disconnect a stock write or reboot MSI during an ordinary supervisor session. Independent intended-use AI accuracy and physical-device acceptance remain separate work.

## Session result checklist

Use **Pass** when the observed result matches the expectation, including expected validation refusal; **Fail** for an observed software mismatch; **Blocked** for an unmet service/account/resource prerequisite; **Not run** for an omitted/deferred case. Keep an uncertain saved operation unresolved until its original outcome is recovered.

| Case | Expected checkpoint | Result |
|---|---|---|
| S01 | Five startup checks Ready; correct separate Admin/Manager sessions; eight-card dashboard | Not run |
| S02 | Retained purchase, fictional proof, AI/review and integrity history readable | Not run |
| S03 | New product saved once, assigned/locked PRD code, unique barcode, 0/0/0 | Not run |
| S04 | Receipt 20 → 20/0/20; reserve 4 → 20/4/16; release 4 → 20/0/20 | Not run |
| S05 | Optional Issue 17 and duplicate barcode refused without unwanted change | Not run |
| S06 | Assigned/locked PO; self-approval prevented; different Manager approval | Not run |
| S07 | Issue leaves 20; receipts 4+6 → 24 then 30; 10/10 received once | Not run |
| S08 | Graph captions/exact tables/source drilldown/CSV match the selected scope | Not run |
| X01 | Optional transfer preserves total 30; bin deltas match | Not run |
| X02 | Assigned/locked SHP Draft; warehouse handover holds 3; on-hand 30 | Not run |
| X03 | Available resources scheduled; dispatch once → 27/0/27 | Not run |
| X04 | Active delivery RF and separate rules retained honestly; independent review if applicable | Not run |
| X05 | In Transit, fictional PDF, Delivered; quantity stays 27 | Not run |
| X06 | Separate selected-product AI context/provenance; no automatic stock/PO | Not run |
| X07 | Eligible risk → independent review → one linked PO → independent approval → 4+6 receipts | Not run |
| X08 | Optional MSI human wallet registration once, original recovery, retained hash result | Not run |
| X09 | Prepared restricted-role/Customer checks enforce their permitted scope | Not run |
| D01 | Parcel/camera; physical Android/GPS/background/offline; reboot/restore | Not run — deferred |

For each exercised case record: Malaysia date/time, tester/role, browser/device, exact assigned code/record ID, starting balances, steps, expected result, actual loaded result/final balances, status, and redacted screenshot/error. For recovery include the saved original operation and its confirmed outcome. Do not include credentials, private configuration, private datasets, real customer information or precise location details. Leave original records/history intact; cleanup is a separate reviewed activity.

## Verified rehearsal examples — inspect, do not reset

The retained fictional run is **SUP-261103-6B5F51**. Search its name or exact code. It already completed the sequence, so create a fresh product/session token if the supervisor wants to repeat the arithmetic.

| Example | Actual code | Current result |
|---|---|---|
| Test cartons | PRD-000001 | 27 on hand, 0 reserved, 27 available |
| Ten-unit purchase | PO-000001 | Received after independent Manager approval and 4+6 receipts |
| Three-unit shipment | SHP-000001 | Delivered, with a fictional PDF proof |

The rehearsal exercised authenticated live API commands, not mouse clicks through every form. It also verified duplicate-barcode/manual-code refusal, oversell refusal, exact creation replay, complete report responses, private numbering access denial and preservation of all 757 earlier cloud documents. Existing driver profiles/roles were unchanged; an available registered driver was reused. New fictional records remain for inspection. The proof has not been newly blockchain-registered; use retained Verified examples unless you deliberately choose section 9.

Role-specific Driver/Customer/Viewer testing requires suitable approved accounts. This release used only the existing Admin and Manager and changed no roles. Free resources can change as others test; check current assignment availability rather than assuming a fixed driver/vehicle.

Release evidence: [Automatic-code live acceptance](AUTOMATIC_CODES_LIVE_ACCEPTANCE_2026-11-03.md). The verified private backup and full request journals remain outside Git. Do not share their contents.
