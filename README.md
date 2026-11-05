# IILAS — Integrated Inventory and Logistics Administration System

IILAS brings inventory, warehouse preparation, purchasing and delivery operations into one shared system. Staff use individual accounts and see the shared operational records allowed by their role.

Stock AI experiments can use a fully fictional scenario or a selected demonstration product with recorded balances and explicitly fictional history/demand/supply. With the local demo workflow enabled, a new product-bound risk result creates a separate demo alert and reorder-review item. A different Admin or Manager can review it in Replenishment & Procurement. Staff can explicitly prepare one linked purchase order from an accepted requirement, enter its purchasing details and obtain separate approval. Issue records expected incoming stock; recording partial or full deliveries updates demonstration stock. Saved operations support recovery after a lost reply. See the [purchasing guide](docs/INVENTORY_DEMO_PROCUREMENT_LOCAL_GUIDE_2026-10-24.md).

## Android Driver demonstration

Approved Drivers have a separate local Android build for saved assignments, queued delivery updates and proof files. Its SQLite queue retains work for synchronisation with MSI. Start tracking deliberately with the app open; a visible notification provides Stop. Queued work remains separate from confirmed delivery status, and saved outcomes support recovery. Phone installation, real GPS/background behaviour and native-to-MSI checks remain pending your device trial. Staff and Customers retain the existing web interfaces. See the [Android guide](docs/ANDROID_LOCAL_GUIDE_2026-10-26.md).

The FYP web demonstration is available at [IILAS](https://fyp-inventory-and-logistics.web.app). Firebase Spark hosts the website, login and database; MSI runs trusted commands, proof files, the frozen stock/delivery AI and the private demonstration blockchain. Keep MSI awake and online when using the app from another laptop. Billing remains disabled. Fictional records are retained for presenting the workflows. See the [current demonstration guide](docs/SPARK_MSI_CLOUD_STATUS_2026-10-29.md) for verified checks, startup and remaining limitations.

## Customer order requests (local development)

The Customer portal includes Orders and a Delivery monitor. Customers request items by description. Admin, Manager or Logistics staff match them in Order & Dispatch and accept the request to create a linked shipment. The monitor shows delivery status, updates, any shared location and the current proof after delivery. Customers can view saved proof images, download proof files and check their integrity. [Customer workflow guide](docs/CUSTOMER_ORDERS_LOCAL_GUIDE_2026-11-04.md)

## What the app does

**Reports & Statistics** provides large inventory/logistics charts, labelled status colours, exact-value tables and links to the underlying records. Open **Overview** and select **Refresh overview**, or choose a focused report in Inventory, Logistics or AI & Verification. Date captions distinguish current stock from dated activity; statistics use complete bounded selections and explain unavailable facts. See the [reporting guide](docs/REPORTS_STATISTICS_LIVE_2026-11-02.md).

For the local FYP demonstration, Fleet Management includes protected resource edits and Transport Management supports explicit pre-dispatch reassignment and labelled map estimates. Reporting & Verification offers bounded filters, safe CSV exports, local blockchain registration, retained integrity observations and independent exception review. An Admin-approved Customer has a separate portal for explicitly granted shipments and current proof downloads. See the [workflow guide](docs/FYP_LOCAL_WORKFLOWS_2026-10-25.md).

| Area | What you can do |
|---|---|
| Dashboard | View stock, purchasing and shipment summaries, alerts, recent activity and quick links. |
| Product Management | Create and update products, SKUs, barcodes, categories, images and reorder levels. |
| Stock Management | Record receipts, issues and adjustments; view available and reserved quantities; transfer units between storage locations; request review of eligible movement corrections. |
| Warehouse Operations | Pick shipment items from storage locations, confirm packing and complete the Prepared-Shipment Handover. |
| Replenishment and Procurement | Manage suppliers and purchase orders, review requests, correct rejected orders and receive partial or complete deliveries. |
| Order and Dispatch | Create shipments with expected delivery today or later in Malaysia time, then dispatch after warehouse handover and transport scheduling. Existing historical dates remain preserved. |
| Fleet and Transport | Maintain vehicle and driver records, assign delivery resources and record fuel, maintenance and transport activity. |
| Delivery Monitoring | Record delivery events, upload parcel evidence and submit the latest delivery location. |
| Reports and Verification | Review operational reports, export available CSV reports and inspect configured prediction and hash-verification results. |
| User Management | Let administrators approve staff accounts, assign roles and disable access. |

## Try the stock AI experiment locally

In Stock Management, open **Stock AI experiment** and enter a complete fictional stock scenario. Enter the six stock facts plus additional firm demand/deadline and incoming batch quantity/ETA/status. Explicit zero/no incoming batch means absence; blanks mean unknown. The local frozen fourteen-input Random Forest returns three stock-condition scores and retains an experimental history. Admin, Manager, Inventory and Warehouse can submit; approved staff can read shared results. If a reply is lost, reopen the screen and retry or check the saved operation.

The context prototype scored 81.53% accuracy, 79.00% Critical precision and 87.78% Critical recall across 720 simulated scenarios/60 held-out families; its accuracy interval is 78.54–84.86%, not an 80% guarantee. Historical six-input results retain their original study figures. Its scores are not independently validated warehouse accuracy. Prediction alone cannot change stock or create purchase orders; the linked demo purchasing workflow requires explicit staff actions and separate approval. Real products retain rule-based Stock assessment and explain why AI inputs are unavailable. See the [local guide](docs/INVENTORY_CONTEXT_AI_LOCAL_GUIDE_2026-10-23.md) for limits and recovery.

## Try the delivery AI demonstration locally

In **Delivery Monitoring**, open a dispatched shipment's **Delivery AI demonstration and rule assessment**. Check the server-observed facts, confirm demonstration data, then analyse. The frozen Random Forest returns Low/Medium/High scores with original source facts and explicit warnings. Inspect the **separate rule assessment** independently. A different Admin/Manager can acknowledge or request follow-up in the queue; reviews change no delivery status and cannot approve the model. Recover lost replies with **Check outcome** above the shipment list, including after reassignment.

The model scored 98.33% agreement on held-out simulated policy cases. It has no independently validated real-delivery accuracy; one predeclared first-failure workflow case was rated High rather than the policy's Medium. See the [delivery demo guide](docs/DELIVERY_RISK_DEMO_LOCAL_GUIDE_2026-10-24.md) for interpretation, recovery and limits.

## Sign in and get access

1. Open the IILAS address provided by your administrator.
2. Create an account with your name, email and password, or sign in with your existing account.
3. Verify your email when prompted. New staff accounts wait for administrator approval.
4. An administrator approves the account and assigns its role. Refresh your access after approval.
5. Use the navigation menu to open the modules available to your role. On a phone, open the labelled menu button.

Use **Forgot password** on the sign-in screen if you need to reset your password. Each staff member should use their own account so actions remain attributable to the correct person.

## Roles and shared inventory

All approved staff work in one shared IILAS system. You do not need to create or switch organisations. Newly approved accounts do not automatically import stock from another personal inventory.

| Role | Main responsibilities |
|---|---|
| Admin | Approve accounts, manage roles and oversee operations. |
| Manager | Review purchases and eligible stock corrections, and oversee operations. |
| Inventory | Maintain products, stock, suppliers and purchase requests. |
| Warehouse | Pick and pack shipments and receive purchase deliveries. |
| Logistics | Manage shipments, dispatch, fleet and transport activities. |
| Driver | Update assigned deliveries, evidence and delivery locations. |
| Viewer | Read permitted operational information without changing records. |

Customer is a separate account role. Staff explicitly grant individual shipments; Customers do not see shared inventory, internal reports or staff data. Optional location sharing shows only the latest submitted point during active delivery. Revoking a grant blocks later protected requests.

Buttons and actions depend on your role and each record's current status. Accounts awaiting approval, rejected accounts and disabled accounts cannot access operational records.

## Everyday workflows

### Receive and manage stock

1. Create or find the product in **Product Management**.
2. For a purchase delivery, use the issued purchase order's receipt action in **Replenishment and Procurement**. Enter the delivery note and the quantities actually received.
3. For an eligible manual receipt, issue or adjustment, use **Stock Management** and select the product, quantity, location and business reference.
4. Check the resulting balances and movement history. Use a location transfer to move available units between bins.
5. If an eligible manual movement was wrong, submit a correction request with a reason. A different authorised reviewer must approve it; the original record remains in history.

Reserved units cannot be consumed as freely available stock. If a submission has an uncertain result, use its saved retry or outcome-check action before creating another movement.

### Purchase replenishment

### Review stock condition

In **Stock Management**, select **Stock assessment** for an active product. The rule-based check explains the available quantity and reorder warning, and identifies missing or unverified history. It is separate from an AI prediction and displays no model confidence.

Admin, Manager, Inventory and Warehouse staff can explicitly **Save review snapshot**. A different Admin or Manager can record a Normal, Reorder Risk, Critical Stock Risk or Unresolved judgement with evidence notes. Saved facts remain historical; review corrections retain their previous revisions. Use the saved-request recovery controls if a response is lost. Saving or reviewing changes no stock and does not automatically train an AI model.

The separate experimental classifier is available for complete fictional scenarios. Qualified real-inventory inputs and independent accuracy evaluation remain pending. See [stock assessment and review](docs/INVENTORY_STOCK_ASSESSMENT_2026-10-22.md) for history limits and data qualification.

### Purchase replenishment

1. Select an active supplier and create a purchase request with products, quantities, prices, reference and expected date.
2. An authorised independent reviewer approves or rejects the request. Correct and resubmit rejected requests with the required remarks.
3. Issue the approved order. Receive each delivery against that order using its own delivery note.
4. Review outstanding quantities until the order is fully received. Use the cancellation action only when the order's state allows it.

### Prepare and deliver a shipment

1. Create a Draft shipment in **Order and Dispatch** with its recipient, contact, address, expected date and product lines.
2. In **Warehouse Operations**, start picking, confirm the allocated storage locations and quantities, then confirm packing and parcel count.
3. Complete the **Prepared-Shipment Handover**. To document the parcel before dispatch, choose it under **Pre-dispatch parcel evidence** in Warehouse Operations. Admin, Manager and Logistics staff can also use this section in Delivery Monitoring. Logistics can then assign the required delivery resources and dispatch the prepared shipment.
4. During delivery, record status events and upload the required evidence. Submit location updates when appropriate and allow browser location access.
5. Complete delivery only after the required proof and status conditions are satisfied. Returned goods need warehouse inspection and a separate stock receipt.

For parcel photos, select **Parcel Image**, then choose a JPG, PNG or WebP, or select **Start camera** and **Capture photo**. Review the photo before choosing **Upload evidence**, or discard it and try again. The form shows **Pre-dispatch** for a prepared parcel or **Delivery** for a dispatched shipment. Saved evidence shows its stage, declared source and registration time; older evidence may have no recorded stage. Camera capture time comes from the device clock.

Closing the preview or leaving the module stops the camera. Camera access requires a supported browser on HTTPS or localhost; file selection remains available if camera access fails. A photo documents only the visible faces of the parcel. Physical-camera evaluation remains pending.

After registering a Parcel Image, eligible staff can select **Request analysis** beside that photo. The saved outcome identifies its image and original stage. MSI's configured local experimental runtime can return **Normal**, **Damaged** or **Abstained** using the trained MobileNetV2. Results remain labelled **Local experimental observation · No operational acceptance**, including after human review. The default operational route remains **Unavailable** until model acceptance. If a response is lost, use **Check outcome** to recover the same request. Approved staff can read historical outcomes after dispatch or reassignment.

For a later deliberate local camera test, choose **Parcel Image**, then **Open live camera**. This opens a local preview. **Start live analysis** is a separate action and uses the configured experimental runtime; physical-camera performance has not been measured. Without the local configuration or accepted live model, the route records **Unavailable**. **Start camera** remains the separate manual-photo action. Finish or discard a selected photo before opening live analysis.

The live workflow discloses its limits before starting: up to 12 sampled JPEG images over two minutes, retained with the shipment and readable by all Approved shared staff. It records no continuous video or audio. **Stop live analysis**, closing the camera or leaving the foreground stops local sampling; work already transmitted may still need an outcome check. Opening another account or shipment context requires an explicit new start.

If a response is lost, use **Check saved session** or **Stop saved session** to reconcile its original request. These actions do not start replacement inference. Recorded sessions and frames remain historical after reload or stop. Use **Older sessions**, **Newer sessions** or **Latest sessions** to find a saved session, then select **View saved session**. Authorised staff can inspect retained frames; a frame describes only the visible packaging and cannot establish hidden-face or internal condition.

Every predicted condition requires Admin/Manager review. **Abstained** keeps the AI label empty and requires inspection notes. Reviewing an experimental observation does not approve its model or promote it into operational alerts or verification candidates. Results never approve a shipment or change stock automatically. Independent intended-use quality and physical-camera evaluation remain incomplete. See the [local parcel test guide](docs/PARCEL_LOCAL_TEST_GUIDE_2026-10-22.md).

## Understanding results

- Delivery location is the latest position explicitly submitted by the driver; it is not continuous background tracking.
- AI predictions require configured, trained and evaluated models. Missing or stale predictions are shown as unavailable or out of date and need human review.
- Blockchain verification requires the configured network and an authorised wallet. A matching hash checks that recorded content is consistent; it does not prove the original information was true.

These instructions describe the repository version. The currently hosted demonstration may run an earlier release. Final model evaluation, production acceptance and some report-specified features remain pending.

For local installation, see [Developer setup](docs/GITHUB_SETUP.md). Current development status is recorded in the [project roadmap](PROJECT_ROADMAP.md).
