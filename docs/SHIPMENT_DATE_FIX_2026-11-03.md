# New-shipment expected delivery dates — live fix, 3 November 2026

The user reported that a new shipment could be created with a previous day's expected delivery date and explicitly requested a live update.

New shipments now require **today or a future date in Malaysia time (UTC+8)**. The form shows **Today or later (Malaysia time)**, sets the calendar minimum, checks typed input on submission and focuses the date field on an error. The trusted server independently checks a genuinely new creation before committing any record, counter allocation or receipt.

Historical records are preserved. General shipment validation and canonical saved-request decoding remain time independent, so overdue existing shipments remain readable/editable and the same successful creation can be recovered/replayed after midnight. This fix does not introduce a new rescheduling/edit-date policy or rewrite stored dates. The earlier barcode guidance and success-notification UX findings remain deferred.

## Verification

- Regression tests first reproduced the missing rejection, then passed after the fix.
- 50 focused shipment/creation/recovery tests passed, including Malaysia midnight, unchanged overdue edits, cancellation, and exact replay without a new code.
- 159 shared input-validation checks passed. Six sequential real emulator suites passed: original Firestore smoke, QA review, shared access, stock locations/warehouse, capacity and procurement. A fresh disposable local stack was explicitly initialized; no historical/private snapshot was imported.
- Build passed. Lint passed with zero errors and 14 existing warnings. Current and reachable-history secret scans passed.
- Browser fixture: typed yesterday was rejected with zero creation calls/records; today reached creation, and saved-outcome recovery retained exactly one record. The 390px form had no document-wide horizontal overflow. Viewport override was removed and the temporary server stopped.
- Fresh private backup captured 859 then-current cloud documents, three then-current Auth accounts, current rules/indexes/Hosting and 20 local proof/store files. All current record hashes matched the backup.
- Four reviewed source files applied, all 11 frozen scientific artifact hashes unchanged. Only API/stock/delivery services restarted; original 19 immutable proof/store files, current chain generation, both wallet receipts and ngrok address were retained. Desktop launcher reports all five Ready.
- Firebase Hosting only published. All 17 app assets were downloaded and hash-verified plus exactly the two standard Firebase-generated initialization files. Existing Firestore rules remained unchanged and billing stayed disabled.
- Four live acceptance checks passed: past-date create rejected with no cloud changes; today's fictional **SHP-000003** created once and exact UUID replayed; prior business records preserved with only its shipment counter advancing once; current chain/tunnel/wallet/proof bytes preserved. The retained test shipment is Draft with expected delivery **3 November 2026**. It does not change product stock.
- Hosted Chrome displays the new minimum and visible date guidance. No parcel/camera, phone/GPS/offline, new wallet signature or Git publication was performed.

## Manual recheck

Refresh [IILAS](https://fyp-inventory-and-logistics.web.app/) with **Ctrl+Shift+R**. Open Order & Dispatch → New shipment. Complete fictional valid details and select yesterday; Create draft must refuse it with the date message and no new code. Change to today/future and submit once. Use the original saved outcome controls if the response is uncertain. Do not create extra records just to replace an unconfirmed request.

Role-testing accounts were provisioned afterward as a separate user-authorised action; their new profiles/approval history are expected additions to the cloud database. See [role account guide](ROLE_TEST_ACCOUNTS_2026-11-03.md) for their verification and access prerequisites.
