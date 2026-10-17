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
3. Complete the **Prepared-Shipment Handover**. Logistics can then assign the required delivery resources and dispatch the prepared shipment.
4. During delivery, record status events and upload the required evidence. Submit location updates when appropriate and allow browser location access.
5. Complete delivery only after the required proof and status conditions are satisfied. Returned goods need warehouse inspection and a separate stock receipt.

## Understanding results

- Delivery location is the latest position explicitly submitted by the driver; it is not continuous background tracking.
- AI predictions require configured, trained and evaluated models. Missing or stale predictions are shown as unavailable or out of date and need human review.
- Blockchain verification requires the configured network and an authorised wallet. A matching hash checks that recorded content is consistent; it does not prove the original information was true.

These instructions describe the repository version. The currently hosted demonstration may run an earlier release. Final model evaluation, production acceptance and some report-specified features remain pending.

For local installation, see [Developer setup](docs/GITHUB_SETUP.md). Current development status is recorded in the [project roadmap](PROJECT_ROADMAP.md).
