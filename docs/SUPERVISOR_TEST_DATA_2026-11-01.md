# Supervisor test data — 1 November 2026

**Latest rehearsal supersedes starting balances below:** see [live workflow results](SUPERVISOR_WORKFLOW_REHEARSAL_2026-11-01.md). P01 now 71/reserved12, P07 now10, P11 now27/reserved0, SHP01 and SHP07 Delivered, new `REH-AI-PO` Received. Original PO01–PO06 and SHP02–SHP06 staged examples are retained. Transport plan creation UI failed; authenticated API scheduling passed. Current census723 / three unchanged accounts / seventeen proof files; billing disabled and both existing chain proofs preserved. Do not rerun the seed.

The hosted Firebase application now contains an additive fictional testing pack. Open https://fyp-inventory-and-logistics.web.app/ and search **SUP-261101-79F529**. Product names start with **[Supervisor test]**. This is workflow test data, not independent AI evaluation data or real business activity.

## What was added

| Area | New examples |
|---|---|
| Products | 12 products across Packaging, Stationery, Equipment, Storage and Safety; ordinary, low-stock and zero-stock examples |
| Suppliers | 3 fictional suppliers: two Active and one Inactive |
| Purchasing | 6 orders: Submitted, Rejected, Approved, Issued, PartReceived and Received |
| Shipments | 8 examples: two editable Drafts, Picking, Packed, two Prepared, one In Transit and one Delivered |
| Fleet | 3 vehicles: two with Available base status and one in Maintenance; one new fictional driver resource |
| Proof | One valid PDF explicitly labelled fictional, attached to the completed test delivery |

All records were created through the existing authenticated API and real command transitions. Approvals were made by the existing separate Manager account. No direct Firestore data writes, new Auth accounts, role/password changes, fake predictions, wallet transactions, camera images or GPS points were used. The driver resource links to the existing Admin account for demonstration assignment; it does not create or grant a Driver login.

The operation added 253 documents including audit, movement, allocation, receipt and request records. The database now contains 597 documents. All 344 pre-existing documents, three Auth identities/credential flags/roles and seven original proof-store files remained unchanged. Only volatile Auth sign-in/refresh times are excluded from the account comparison. Before/after cloud backups and proof backup are private, restricted to the local Windows account and SYSTEM, outside OneDrive/Git. Operational plans, journals, IDs and screenshots are ignored under `outputs/`; none were published to GitHub.

## Suggested tests

| Reference suffix | Starting position | Next test |
|---|---|---|
| P01 | Shipping cartons: on-hand 74, reserved 12, available 62, reorder 20; two bins | Inspect ledger/movement history; try a valid free-stock movement on this fictional product |
| P02 | Bubble wrap: on-hand 45, reserved 6, available 39 | Test reservation/release controls |
| P05 / P06 / P07 | Mailer bags 10/reorder10; stretch film 4/reorder6; thermal labels 0/reorder15 | Inspect low/zero-stock alerts; missing history must not become a fabricated AI input |
| P12 | Document pouches: on-hand 104 | Follow the real partial/full receipt history; record the balance before each new receipt test |
| PO01 | Submitted | Sign in as the separate Manager and review; self-approval must be refused |
| PO02 | Rejected | Correct and resubmit as the original submitting account |
| PO03 | Approved | Explicitly Issue; this alone must not increase stock |
| PO04 | Issued, none received | Receive a partial quantity, then verify stock and outstanding units |
| PO05 | PartReceived, 4 received / 6 outstanding | Receive the remaining six; stock must increase by six once |
| PO06 | Received, 10 received / 0 outstanding | Inspect completed history and prevention of over-receipt |
| SHP01 / SHP02 | Draft | Edit, inspect validation or start warehouse work |
| SHP03 | Picking | Finish packing and handover; observe edit locks |
| SHP04 | Packed | Complete handover |
| SHP05 / SHP06 | Prepared, unscheduled | Schedule with available registered resources; items/parcels stay fixed |
| SHP07 | Dispatched, In Transit | Continue a fictional delivery through the permitted sequence and proof requirements |
| SHP08 | Delivered | Open the clearly marked proof PDF and inspect retained delivery/transport history |

Use the full prefix plus suffix, e.g. `SUP-261101-79F529-PO05` or `SUP-261101-79F529-SHP07`. Product SKUs use `-P01` through `-P12`. New stock movements use actual server timestamps on 1 November; no past movement history was invented to fill graphs. Counts on the dashboard include existing records as well as this pack.

The active test delivery occupies its assigned driver/vehicle; base Available is not the same as currently unassigned. Complete it or use another genuinely available resource before scheduling another shipment. Do not change original staff roles to work around an assignment constraint. Customer and restricted Driver login trials still require normally created/verified/approved role-specific accounts.

## Current readiness and preservation

Seven seeding verification groups and six offline scope/duplicate guards pass. The actual hosted Dashboard and filtered Product Management list were inspected; the list shows 12 matching products with the expected carton and document-pouch balances. A subsequent full cloud/account/proof census is unchanged by those browser reads. Billing remains disabled; application/configuration source bindings remain unchanged. No UI deployment or Git publication occurred.

MSI's original authenticated API and assigned ngrok endpoint were restored. The old API owner was confirmed dead; its exact stale proof-store lock was preserved after verifying/backing up every original proof file, then the unchanged launcher acquired a new lock. No proof data was removed or quarantined.

**Latest readiness update — 1 November, 21:35 MYT:** the [current supervisor guide](SUPERVISOR_READINESS_2026-11-01.md) records healthy AI/API services and both human-signed supervisor records independently Verified on the current private chain: inventory block 2 and delivery block 3. The expired delivery request was retained and audited Cancelled before one fresh human-confirmed request completed. Do not register either source again. The focused Reporting & Verification UI update is live; other local UI passes were excluded. Final census is 636 documents, with three stable accounts and all 11 proof-store files preserved and restricted verified backups. Historical counts above describe the original seeding operation. Old chain history is not restored. Parcel and physical Android trials remain deferred.

Current private runtime handover: `outputs/spark-msi-demo-20261028/cloud-runtime-supervisor-two-wallets-20261101.private.json`. Earlier pointers remain historical checkpoints. Keep MSI awake and online. Do not blindly restart Hardhat and assume it restores old registry history.

The test pack is retained for your session. Do not rerun its seed script to reset it or delete records by a name substring. Any later cleanup requires a newly checked exact list because your testing will change these records and their hashes. Record Pass/Fail/Blocked and expected/actual balances using the [manual test guide](MANUAL_APP_TEST_GUIDE_2026-10-29.md).
