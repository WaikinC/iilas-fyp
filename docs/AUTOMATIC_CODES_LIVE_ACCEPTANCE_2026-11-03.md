# Automatic business codes — live acceptance, 3 November 2026

The user authorised the existing-project update with “ok update them” and requested a supervisor testing guide. The coordinated release is live at [IILAS](https://fyp-inventory-and-logistics.web.app/).

## Published behavior

New products receive locked PRD codes, shipments locked SHP references, and ordinary/linked purchases share locked PO references. Existing business codes remain unchanged; manufacturer barcodes remain separately entered/scanned. Request replay and recovery preserve the original generated record. The updated Driver, Stock, Procurement, Delivery, Order & Dispatch and Reports interfaces remain included.

## Observed verification

- Private backup verified before activation: 757 Firestore documents, three Auth accounts with password-hash parameters, rules/indexes/Hosting, and 17 private local proof/store files. A managed full restore was not tested.
- Exactly one numbering policy and three counters initialized. All 757 prior cloud documents were unchanged after initialization and publication.
- 97 reviewed source/interface files applied; 11 frozen model artifact hashes unchanged. Only API, stock AI and delivery AI restarted. Hardhat generation, both successful human-signed wallet receipts, ngrok address and original proof bytes preserved.
- Firestore rules and Firebase Hosting only deployed. Hosting version: `projects/900826956052/sites/fyp-inventory-and-logistics/versions/adb3131e160eb156`. All 17 application assets downloaded with matching hashes; deployed rules SHA-256 `a250d1af94c9dcad0d053d0f4797e783c77a0398f213f41bba9f25c745e0b330`. Firebase additionally publishes its two standard `__/firebase/init` files; the initial verifier mistakenly counted these as unexpected, then a read-only verification confirmed the exact application package plus those two generated files. No repeat deployment was needed.
- Desktop launcher: five Ready results and SERVICES CONNECTED. Billing disabled; no Functions, Storage, index, IAM or billing changes in this release.
- Hosted Chrome: refreshed dashboard; all three creation fields display Assigned automatically when saved; overview inventory/logistics charts loaded with explicit unknown facts and exact-value/source controls. Browser navigation/form inspection made no business writes.
- Fictional authenticated live rehearsal: 8 checks passed. Product PRD-000001, PO PO-000001, shipment SHP-000001; run SUP-261103-6B5F51. Stock 0→20, reservation 4→available 16, refused Issue 17, release 4, purchase receipts 4+6→30, dispatch 3→27, Delivered with downloaded/hash-verified fictional PDF. Independent approval and self-approval denial verified. Original 757 documents preserved; only the three reviewed scoped counters each advanced once.
- Rehearsal setup correction: duplicate driver creation was correctly refused because the account already had a resource. The same prepared shipment was resumed with a free existing registered driver; no duplicate request, new role or existing profile mutation.

## Limits and retained work

This is FYP demonstration acceptance, not production or independent real-world AI accuracy. No model training/evaluation, fresh wallet signature, parcel/camera trial, phone/GPS/offline trial, cold blockchain recovery, or Git publication was performed. Fictional records remain for inspection and are not silently deleted. The full manual UI session still needs the supervisor/user. Three minor UI notices remain deferred from the local feature review: a recovered Created notice does not separately state current record availability; exhaustion uses a generic public error; simultaneous recovery controls have generic labels.

[Step-by-step supervisor guide](SUPERVISOR_TEST_GUIDE_2026-11-03.md).
