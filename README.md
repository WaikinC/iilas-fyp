# IILAS — Integrated Inventory and Logistics Administration System

IILAS brings inventory, warehouse preparation, purchasing and delivery operations into one shared system. Staff use individual accounts and see the shared operational records allowed by their role.

## What the app does

| Area | What you can do |
|---|---|
| Dashboard | View stock, purchasing and shipment summaries, alerts, recent activity and quick links. |
| Product Management | Create and update products, SKUs, barcodes, categories, images and reorder levels. |
| Stock Management | Record receipts, issues and adjustments; view available and reserved quantities; transfer units between storage locations; request review of eligible movement corrections. |
| Warehouse Operations | Pick shipment items from storage locations, confirm packing and complete the Prepared-Shipment Handover. |
| Replenishment and Procurement | Manage suppliers and purchase orders, review requests, correct rejected orders and receive partial or complete deliveries. |
| Order and Dispatch | Prepare customer shipments and dispatch them after warehouse handover. |
| Fleet and Transport | Maintain vehicle and driver records, assign delivery resources and record fuel, maintenance and transport activity. |
| Delivery Monitoring | Record delivery events, upload parcel evidence and submit the latest delivery location. |
| Reports and Verification | Review operational reports, export available CSV reports and inspect configured prediction and hash-verification results. |
| User Management | Let administrators approve staff accounts, assign roles and disable access. |

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

Closing the preview or leaving the module stops the camera. Camera access requires a supported browser on HTTPS or localhost; file selection remains available if camera access fails. AI condition analysis is currently unavailable, and a photo only documents the visible faces of the parcel.

After registering a Parcel Image, eligible staff can select **Request analysis** beside that photo. The saved outcome identifies its image and original stage. Currently this records **Unavailable** because no parcel model has passed acceptance; it does not assign Normal or Damaged. If a response is lost, use **Check outcome** to recover the same request. Approved staff can read historical outcomes after dispatch or reassignment.

For live sessions, choose **Parcel Image**, then **Open live camera**. This opens a local preview. **Start live analysis** is a separate action. Currently it saves **Unavailable** and stops without sending sampled frames because no live parcel model has passed acceptance. **Start camera** remains the separate manual-photo action. Finish or discard a selected photo before opening live analysis.

The live workflow discloses its limits before starting: up to 12 sampled JPEG images over two minutes, retained with the shipment and readable by all Approved shared staff. It records no continuous video or audio. **Stop live analysis**, closing the camera or leaving the foreground stops local sampling; work already transmitted may still need an outcome check. Opening another account or shipment context requires an explicit new start.

If a response is lost, use **Check saved session** or **Stop saved session** to reconcile its original request. These actions do not start replacement inference. Recorded sessions and frames remain historical after reload or stop. Use **Older sessions**, **Newer sessions** or **Latest sessions** to find a saved session, then select **View saved session**. Authorised staff can inspect retained frames; a frame describes only the visible packaging and cannot establish hidden-face or internal condition.

When an evaluated model becomes available, every predicted condition will require Admin/Manager review. **Abstained** keeps the AI label empty and requires inspection notes. Results never approve a shipment or change stock automatically. Real-model quality and physical-camera evaluation remain incomplete.

## Understanding results

- Delivery location is the latest position explicitly submitted by the driver; it is not continuous background tracking.
- AI predictions require configured, trained and evaluated models. Missing or stale predictions are shown as unavailable or out of date and need human review.
- Blockchain verification requires the configured network and an authorised wallet. A matching hash checks that recorded content is consistent; it does not prove the original information was true.

These instructions describe the repository version. The currently hosted demonstration may run an earlier release. Final model evaluation, production acceptance and some report-specified features remain pending.

For local installation, see [Developer setup](docs/GITHUB_SETUP.md). Current development status is recorded in the [project roadmap](PROJECT_ROADMAP.md).
