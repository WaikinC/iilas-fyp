# IILAS manual application test guide

Use this guide to test the inventory and logistics FYP demonstration. Begin with Part 1, which inspects retained records. Part 2 creates new fictional records and changes their stock/shipment state. Mark every case Pass, Fail, Blocked or Not run; this document does not claim you have performed the tests.

Website: https://fyp-inventory-and-logistics.web.app

## Preparation

- Keep MSI awake and online with the existing API, stock/delivery services, ngrok and private blockchain running. The other laptop needs only a browser for ordinary web operations. See [current startup and recovery instructions](SPARK_MSI_CLOUD_STATUS_2026-10-29.md).
- Use separate browser profiles or separate browsers for Admin and Manager. Two tabs in the same browser profile normally share sign-in. Existing Admin: choongkin6@gmail.com; existing Manager: wakkin666@gmail.com. Use your normal private passwords.
- Driver, Customer and restricted-staff checks require suitable approved test accounts. Mark those cases Blocked if none are prepared. Do not change the initial Admin's role or convert the main Manager account simply to complete a checklist.
- Use fresh identifiers such as `MANUAL-20261029-A-STOCK`, `MANUAL-20261029-A-PO` and `MANUAL-20261029-A-SHIP`; replace the date/suffix for later sessions. Use fictional products, suppliers, destinations and a harmless valid PDF for proof. Keep real customer data and credentials out of screenshots/results.
- Retained `CLOUD-00e13bd5` and `CLOUD-2ebad048` records are demonstration evidence. Inspect them in Part 1; create separate records for Part 2. Cleanup is a separate decision, not a test step.
- Wait for loading indicators to finish. Initial cached values can update when cloud records arrive. Record the final loaded value.

## Part 1 — Inspect the completed demonstration

These cases should not change application records. Browsing/login may update ordinary account session metadata.

| ID | Screen and action | Expected result | Result |
|---|---|---|---|
| V01 | Sign in as Admin; open Dashboard. | Approved access and eight summary cards. Cards describe saved data; an empty AI/damage card is not an accuracy result. | Not run |
| V02 | Stock Management: find `Cloud demo stock CLOUD-00e13bd5`. | On-hand 10, reserved 0, available 10. History contains the 4-unit partial and 6-unit final purchase receipts. If someone legitimately changes the record later, use its current traceable history rather than restoring it. | Not run |
| V03 | Open Stock AI experiment and inspect Experimental history. | Retained product-bound Critical Stock Risk result, original context/model information and simulated-study disclosure. The adjustment-count range warning remains visible. Do not press Analyse for this viewing case. | Not run |
| V04 | Procurement: inspect the Accepted demo requirement and `CLOUD-00E13BD5-PO`; open View purchase history. | Received, 10/10 received, 0 outstanding. History shows Admin submission, different Manager approval, Issue, partial receipt and final receipt. | Not run |
| V05 | Delivery Monitoring: find `CLOUD-00E13BD5-SHIP`. | Final loaded status Delivered and registered fictional proof metadata. The small historical proof is a software fixture, not a real customer's delivery document. | Not run |
| V06 | Reporting & Verification: choose `Logistics · Retained delivery AI experiments`, clear filters and Run report. | Retained simulated results and review status load. Unknown fields remain Unknown; a report page is not necessarily the full system total. | Not run |
| V07 | Open research and integrity tools; inspect retained checks and registration history. | Inventory and delivery checks are Verified with transaction references. Viewing history needs no wallet signature. | Not run |
| V08 | Open the website from the original laptop and a narrow browser window. | Normal sign-in/navigation and authorised data load; labels and controls remain usable. A narrow browser window does not certify native Android behaviour. | Not run |

## Part 2 — Test new fictional records

Every action in this part can create records, audit entries or stock changes. Use only your fresh `MANUAL-...` records. Record the created IDs/references before continuing. The sample stock arithmetic below assumes no other person changes this test product during the sequence.

### Product and stock — partner's scope

Create one active fictional product with a unique SKU/barcode, category, location `MANUAL-A`, reorder level 10 and opening quantity 0. If the product form does not offer an opening quantity, confirm the saved balance before using the calculations below.

| ID | Action | Expected result | Result |
|---|---|---|---|
| I01 | Save the new product, refresh and search by its exact SKU. | Exactly the intended product is retrievable; its saved fields remain correct. | Not run |
| I02 | Attempt another product with the same SKU or barcode. | Duplicate is refused; the existing product remains unchanged. Cancel the rejected form. | Not run |
| I03 | Stock Management: Receipt 20 into MANUAL-A with a fresh reference and reason. | On-hand 20, reserved 0, available 20; one receipt history entry. | Not run |
| I04 | Reservation 6. | On-hand 20, reserved 6, available 14. | Not run |
| I05 | Manual Issue 5. | On-hand 15, reserved 6, available 9. | Not run |
| I06 | Attempt to Issue more than the 9 available units. | Validation refuses it; balances and committed history stay unchanged. A disabled submit is a valid prevention result. | Not run |
| I07 | Release the 6 reserved units. | On-hand 15, reserved 0, available 15. | Not run |
| I08 | Transfer 4 from MANUAL-A to valid location MANUAL-B. | Total stock stays 15; location quantities become A=11 and B=4. Transfer history identifies both locations. | Not run |
| I09 | On an eligible manual movement, inspect Request correction. Use a different reviewer if you submit a correction request. | Original entry remains traceable; any review/reversal has its own history. Linked purchase/warehouse/dispatch movements use their owning workflow. Run this on a separate test product if completing it would disrupt the arithmetic above. | Not run |

For all movements, check product, quantity, actor, time, reason/reference and before/after balances. Do not use a second new operation to compensate for an uncertain first reply.

### Inventory AI and purchasing — partner's scope

| ID | Action | Expected result | Result |
|---|---|---|---|
| I10 | Stock AI experiment: choose Selected demo product, select a fresh fictional product and explicitly enter its fictional history, additional demand/deadline and incoming-supply facts. Read the derived inputs, then analyse once. | A retained result or explicit Unavailable explanation. A successful prediction has one of Normal, Reorder Risk or Critical Stock Risk, scores and provenance. Analysis alone changes no stock or purchase order. | Not run |
| I11 | If the result is Reorder Risk/Critical Stock Risk, inspect its demo alert/reorder requirement in Procurement. | Product/result linkage is retained. A different Admin/Manager can review with notes. Normal/Unavailable should not create an unnecessary risk item. | Not run |
| I12 | Accept an eligible test requirement with the independent reviewer, then explicitly prepare its linked PO. Alternatively create a separate manual PO to test purchasing alone. | At most one source-linked PO for the accepted requirement; a manual PO must not pretend to have AI lineage. No automatic supplier purchase occurs. | Not run |
| I13 | For a test PO, choose a valid test supplier, order 10 units, set cost/date/reference and submit. | Submitting actor cannot independently approve their own submission. A different Manager/Admin can approve or reject with traceable remarks. | Not run |
| I14 | After independent approval, explicitly Issue the order. | Status/history records issue. For the linked demo purchase, expected incoming is 10; physical on-hand is unchanged by Issue. | Not run |
| I15 | Record a partial receipt of 4 with a unique delivery note, then a final receipt of 6 with another note. | First: PartReceived, 4 received/6 outstanding, stock +4. Then: Received, 10 received/0 outstanding, stock +6. Incoming linkage exists for the source-linked demo path. | Not run |

Do not force the model to produce a particular class. A predicted class is not a manually calculated pass/fail oracle. If the AI returns Normal, I11–I12's risk-trigger branch is not exercised; record that honestly or inspect Part 1's retained example. These tests establish software behaviour, not prediction accuracy. A manual PO does not test AI-to-reorder lineage.

### Warehouse, fleet, transport and delivery — shared handover and your scope

Use a stocked fresh product, a fresh shipment reference and fictional destination. Use a dedicated approved Driver account for driver-bound actions; otherwise mark that branch Blocked.

| ID | Action | Expected result | Result |
|---|---|---|---|
| L01 | Order & Dispatch: create a Draft shipment with 3 units of your test product, valid dates and required parcel details. | Required values are validated and the draft is retained. Creating a draft must not silently dispatch/deduct stock. | Not run |
| L02 | Warehouse Operations: allocate/pick 3 units from a location with sufficient free stock, confirm packing and complete handover. | Allocated stock is protected, stages/history are retained and the shipment becomes Prepared only after the required checks. | Not run |
| L03 | Fleet Management: create or select available fictional vehicle/driver resources with adequate capacity. Inspect fuel/maintenance history or record a clearly fictional entry on your new resource. | Valid resource/event details persist; occupied/unavailable or insufficient-capacity resources cannot be assigned unsafely. | Not run |
| L04 | Transport Management: schedule the Prepared shipment, selecting driver, vehicle, carrier, date, estimated time/cost and origin. | A traceable plan/assignment is saved. Optional map values are labelled planning estimates, not live traffic/road routing. | Not run |
| L05 | Dispatch once, note the result, then refresh and inspect stock/history. | Dispatched with one matching stock issue of 3 units; reservation/assignment state is consistent. Refreshing must not deduct another 3. | Not run |
| L06 | On the active test delivery, expand the `Delivery AI demonstration and rule assessment` disclosure, acknowledge simulated training and analyse once. Save the separate rule assessment if required. | RF Low/Medium/High or a clear Unavailable reason; separate explainable rules; model identity/timing/warnings retained. Analysis changes neither stock nor delivery status. | Not run |
| L07 | If a result requires follow-up, use a different Admin/Manager to acknowledge or request follow-up with notes. | Review history identifies the reviewer and preserves the original model/rule result. No automatic delivery-status change. | Not run |
| L08 | As the assigned authorised actor, record the next allowed delivery status, upload a harmless valid proof PDF and complete delivery using the required proof. | Valid ordered status events, shipment-linked proof, actor/time/file hash and Delivered status. Missing required proof/invalid transitions are refused. | Not run |

If a source fact needed by delivery AI is missing, an explicit Unavailable result is correct. Record what is missing rather than inventing history. Expand the disclosure before expecting its AI controls to appear.

### Reporting, permissions and integrity — both scopes

| ID | Action | Expected result | Result |
|---|---|---|---|
| C01 | Run inventory and logistics reports using your exact fresh product/shipment references and suitable date/status filters. Export the current page if useful. | Only permitted matching data; correct page/filter labels and readable CSV. Complete export may refuse a selection beyond its stated limits. | Not run |
| C02 | With a prepared restricted staff/Viewer session, inspect the relevant modules. | Actions outside that role are unavailable/refused. Do not share Admin credentials to bypass the restriction. | Not run |
| C03 | With a prepared Customer account, grant only the new test shipment explicitly. Check its portal, then revoke the grant. | Only granted customer-safe data/current permitted proof; no internal inventory, AI or staff reports. Later protected requests fail after revocation; a downloaded file cannot be recalled. | Not run |
| C04 | On MSI only, optionally register an eligible receipt from the independently approved test PO and/or the fresh delivery proof. Select the exact committed source and personally review the MetaMask request. | Current approved local chain 31337 and pinned registry, 0 ETH value with fake test gas. Confirm once; registration has its own transaction reference. Stop if deployment/network differs. | Not run |
| C05 | Check and retain the selected source's hash; inspect the original observation. | Verified for the unchanged registered source; explicit missing/unavailable/mismatch state otherwise. A match proves consistency with the registered source, not truth/fraud/packaging condition. | Not run |

Part 1 already demonstrates both completed registrations without new signatures. The active local registry is recorded in the current private runtime; the last verified address was `0x5FbDB2315678afecb367f032d93F642f64180aa3`. Do not reuse that address after a different deployment without verifying the new binding. If signing/reply is uncertain, use Check saved outcome; never sign again merely because a timer expired. Keep wallet keys and recovery phrases private.

## Part 3 — Deferred and supervised checks

| Test | How to approach it | Current boundary |
|---|---|---|
| Browser GPS | When ready, deliberately grant permission for a fresh active test shipment; submit a point and inspect the latest map/time. Also try denial. | Uses real device location; do not include exact coordinates in shared screenshots. Continuous background tracking is a different test. |
| Android | With the prepared APK/account/device connection, check assignments, permissions, deliberate Start/Stop, offline queue, reconnection and absence of duplicate events/proofs. | Requires your phone; physical acceptance pending. |
| Parcel photos/live camera | When you resume this work, use permitted reviewed public images first, then an agreed device protocol for photo/camera quality, latency and interruptions. | Paused. This guide does not change the public-datasets-only restriction or approve new personal image collection. |
| Lost replies/connectivity | First inspect a saved result. If a real timeout occurs, recover the same saved operation after connection returns and check one committed effect. | Do not deliberately interrupt a stock write or stop processes without a supervised recovery test. |
| Full restart/restore | Use a separate reviewed rehearsal and isolated restore destination. | API/model service restarts passed; Windows/tunnel/Hardhat restart and backup restoration are not certified. Do not reboot MSI as an ordinary checklist step: Hardhat memory and source/process bindings require explicit recovery handling. |

## Record your results

Use one entry per case. An expected validation refusal counts as Pass; missing accounts/devices/configuration counts as Blocked, not a software failure. A loading/timeout message with no confirmed outcome remains unresolved until recovered.

```text
Case ID:
Date/time (Malaysia):
Tester and role:
Browser/device:
Fresh test reference/record ID:
Starting state/balances:
Steps performed:
Expected result:
Actual result and final balances:
Pass / Fail / Blocked / Not run:
Screenshot or error text (redacted):
Saved-operation outcome, if relevant:
```

For a failure, record the exact error, case/reference and whether the operation is Pending or confirmed. Leave original records/history intact. Avoid putting passwords, tokens, private configuration, wallet information or real customer details in the result log.
