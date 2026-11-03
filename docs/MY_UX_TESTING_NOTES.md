# My IILAS UX testing notes

Personal observations while testing the application. Record issues here for later review; an entry does not mean a fix has been implemented or published.

## UX-001 — Barcode format is unclear

- **Reported:** 3 November 2026 (Malaysia time).
- **Module:** Product Management → Add New Product → Barcode.
- **Status:** Open — saved for a later update, as requested.
- **Test input:** `week9barcode12`.

**My experience:** I cannot see the accepted barcode format before entering a value. When the value is rejected, the browser only says “Please match the requested format.” It does not explain what I should enter or how to correct it.

**Impact:** The user has to guess the format or ask for help to continue creating a product. The screenshot demonstrates the unclear validation message; it does not establish a failure of the barcode validation rule itself.

**Current rule, confirmed in the source:** Required, **8–14 digits only** (`0–9`). Letters, spaces and punctuation are not accepted. For example, `12345678` matches the format; a matching format does not guarantee the barcode is unique. The shared validation already has the message “Barcode must contain 8–14 digits,” but the browser's pattern check can block submission before that application message appears. See [product form](../app/page.tsx) and [shared validation](../lib/validation.js).

**For the later UX update:** Make “8–14 digits only” visible beside the field and provide a specific correction message for invalid input. Keep the manufacturer barcode separate from the automatically generated SKU.

**Future acceptance checks:**

- [ ] The accepted barcode format is visible before submission.
- [ ] Invalid input explains the problem and how to correct it.
- [ ] Existing valid barcodes and duplicate-barcode protection still work.
- [ ] Check the guidance and error message on desktop and narrow screens.

**Screenshot:** [Local barcode validation evidence](../outputs/ux-testing/2026-11-03/barcode-format.png). The image is retained in an ignored local folder and has not been uploaded to GitHub.

**Implementation:** Deferred. No application code or live website change was made for this observation.

## UX-002 — Completed creation notification stays visible across modules

- **Reported:** 3 November 2026 (Malaysia time).
- **Module:** Product Management; shared creation notification when navigating to other modules.
- **Status:** Open — saved for a later update during the current UX testing session.
- **Screenshot example:** `Created PRD-000003`.

**My experience:** After a product is created, its large success notification stays visible. I report that it remains even when I go to another module, and I cannot see a manual close button. The supplied screenshot shows the completed creation banner in Product Management; the cross-module persistence is a user-reported observation, not a newly reproduced test.

**Impact:** An old success message occupies space and distracts from the module currently being used. It can be unclear whether the message concerns the current action.

**Requested later behavior:**

- Automatically dismiss the completed success notification after a reasonable, accessible interval; final timing is to be decided during implementation.
- Clear that completed success notification when navigating to a different module.
- Provide an obvious manual **Close / ×** control with an accessible label.
- Keep the created product and assigned code available in the product list/history after dismissing the message.
- Apply dismissal to confirmed completed success notices. Preserve pending, failed or uncertain operations and their recovery controls; closing a success notice must not delete records, cancel requests or repeat creation.

**Future acceptance checks:**

- [ ] A confirmed product-created success notice dismisses automatically.
- [ ] The user can close it immediately with mouse or keyboard.
- [ ] Changing modules clears the completed success notice.
- [ ] The product/code remains saved; dismissing causes no duplicate creation.
- [ ] Pending/uncertain work remains recoverable and is not silently hidden or discarded.
- [ ] Check equivalent completed creation notices for shipments and purchase orders.

**Screenshot:** [Local creation notification evidence](../outputs/ux-testing/2026-11-03/product-created-notification.png). Stored locally in an ignored folder; not uploaded to GitHub.

**Implementation:** Deferred. This entry records the requested improvement; no application or live website change was made.

## UX-003 — New shipment accepts a past expected delivery date

- **Reported and fixed live:** 3 November 2026 (Malaysia time).
- **Module:** Order & Dispatch → New shipment → Expected delivery.
- **Status:** Fixed and published; live API and hosted date guidance verified.

**My experience:** I could create a new shipment after choosing a previous day.

**Implemented behavior:** New creation requires today or a future date using Malaysia time. The date picker has a minimum, a visible hint explains the rule, typed past dates are rejected with a specific message, and the trusted server independently refuses the request before committing data or consuming a code. Existing overdue records and saved-request recovery are preserved.

**Verified:** yesterday rejected with no live cloud changes; today created the fictional `SHP-000003` once, with exact replay returning the same record. Fifty focused checks, six sequential emulator suites, build/lint, secret scans and desktop/narrow fixture checks passed. See [date-fix evidence](SHIPMENT_DATE_FIX_2026-11-03.md). This does not mark UX-001 or UX-002 as fixed.

## UX-004 — Fleet and Transport combine too many tasks

- **Reported:** 3 November 2026 (Malaysia time).
- **Modules:** Fleet Management and Transport Management.
- **Status:** Fixed and published live; desktop and 390px browser layouts checked.

**My experience:** Vehicle and driver creation are packed together in one widget, and actions/statuses need clearer colour indicators.

**Implemented live:** Fleet has Vehicles, Drivers and Fuel & Maintenance tabs, with separate add/edit/fuel/maintenance forms. Transport has status tabs, focused plan details, a grouped editor and a collapsed optional map. Labelled status pills distinguish Available/Completed (green), Scheduled/In delivery (blue), Maintenance (amber), Unavailable/Unknown/Cancelled (grey); cancellation actions are red. Pending-operation recovery and assignment checks remain visible and enforced.

**Verified:** 22 desktop/narrow browser checks, including tab contrast, dirty-close Cancel, map-button changes, independent searches/paging and role restrictions. Original Firebase smoke/QA and four actual Fleet/Transport scenarios passed with exact local fixture cleanup. All 17 hosted app assets matched the release; all 876 cloud documents, nine accounts, rules, models, proof files, chain and wallet receipts were preserved. Desktop all five services Ready. See [the release evidence](FLEET_TRANSPORT_UI_LIVE_2026-11-03.md).

UX-001 barcode guidance and UX-002 completed-notification dismissal remain deferred.

## Next observations

Add each new finding with its module, steps/input, actual experience, expected improvement, screenshot if available, and status. Keep passwords, credentials and real customer data out of these notes.
