# Continuation review and stock retry contract — 9 October 2026

## Completed in this continuation

The user authorised continuing the module audit and reporting completed work and next tasks. This batch fixes its three concrete defects. Neither student's full scope is complete; no release was deployed.

| Change | Result |
|---|---|
| Pending purchase orders | Dashboard includes Submitted, Approved, Issued and PartReceived; Received and Cancelled are excluded. |
| Closed delivery alerts | Delivered and Returned stop overdue-date and 24-hour staleness warnings. The deadline includes the entire expected day in Malaysia time. Repeated failed attempts remain historical review information. |
| Manual stock retry | All six manual movement types use a stable operation ID and a private server receipt committed with the balance, movement and audit, or the pending adjustment request. Replays return the original result without another stock change or approval. |
| Recovery interface | The browser saves before sending, locks uncertain requests, restores them after close/reopen or reload, and provides Retry saved movement and Check outcome. Recovery actions fit narrow dialogs. |
| Repeatable shared QA | Assignment-release checks assert that the test's completed delivery releases its own resources. Other active shipments in the emulator do not invalidate the test. |

The blue/purple identity, eight-card dashboard, approved staff design and Prepared-Shipment Handover remain. No production IDs/balances were migrated, reset or merged.

## Data and command contract

Manual `stock` and `resolveStock` inputs require validated movement fields plus a UUID v4 `operationId`. Validation normalises whitespace/reference casing and irrelevant direction/destination values before computing a SHA-256 command fingerprint. Internal warehouse, purchase receipt, approval and dispatch paths retain their existing transaction contracts.

The private collection is `stockRequests/{SHA256(JSON.stringify([dataScopeId, actorUid, operationId]))}`. Immutable receipts contain `ownerId`, `actor`, `operationId`, `commandHash`, `state` (Completed or Cancelled), `result` and `createdAt`. Rules deny client get/list/create/update/delete, including Admin. The backend derives the fixed scope and checks current approval/active role before each replay.

The receipt is read before product reads/writes. A matching completed request returns the original movement/approval ID with `replayed:true`. Changing its payload is rejected. Different actors have separate operation namespaces. Adjustment replay does not create another request, reopen an approved request or apply its stock change again.

`resolveStock` checks the same receipt transactionally. If completed, it returns the recorded result. If absent, it writes a Cancelled receipt and returns `notApplied:true`. A concurrent submit/resolve serialises: either the movement exists or the cancelled request cannot apply later. An unapplied outcome check creates no stock movement or balance update.

Only a first submission explicitly rejected before commit clears its saved intent immediately. Network/commit errors retain it. An uncertain earlier request remains saved even if a later retry is rejected, until successful retry/reconciliation.

The browser uses `sessionStorage`, keyed by project, fixed scope and authenticated UID, for one unresolved request per tab. Saving must succeed before sending. Fields remain immutable during recovery; an inactive/archived product does not prevent reopening its saved request. Reload and modal navigation retain it; closing/clearing the tab can remove it. This is not a cross-device queue. Server receipts persist independently. A new operation ID represents a new movement; references are not uniqueness keys because legitimate partial receipts share them. Cross-tab duplicate discovery, durable unresolved-request listing, partial-location balances and linked corrections remain separate work. FR-18 is partially addressed, not universally complete.

## Verification

- Build passed; existing large-bundle warning remains (main JS about 826 KB before gzip). Lint: zero errors, four existing image-element warnings.
- Dashboard, delivery-signal and stock-client scripts passed: terminal states, Malaysia deadline, failed-attempt history, reload/reopen intent, storage failure and simultaneous-submit guard.
- Stock retry emulator QA passed: six types; concurrent/repeated replay; one adjustment and post-approval replay; changed payload; failed requests; actor/role/scope isolation; resolve races; late cancelled retries; receipt get/list/create/update/delete denial.
- Both original Firebase regression scripts, shared-system QA and account-access QA passed against the running explicit-project Auth/Firestore/Functions/Storage emulators. Expected permission-denied output is negative-test evidence. A shared-test assumption that all assignments should be empty was corrected to check only its own shipment and then passed.
- Playwright: 69 responsive/navigation/data checks passed across all 11 pages at 1440/768/390/320 px, with no page runtime errors after reload.
- Playwright recovery workflow: 19 checks passed, deliberately losing responses after commit and before server receipt. The final fixture went from 34 to 36 units exactly once. Reopen/reload and retry retained the original payload; Check outcome closed an unapplied request; a late retry remained cancelled. Narrow dialogs at 390/320 px have no internal horizontal overflow and the outcome button is reachable. Deliberate network-error console entries are expected.
- Local script/screenshots: `output/playwright/stock-retry-review.js`, `stock-retry-desktop.png`, `stock-retry-mobile.png`, `stock-retry-actions-mobile.png`. The frontend-design, Firestore/rules and Playwright skills guided the implementation and checks.

Repeat deterministic checks with `npm run test:dashboard`, `npm run test:delivery-signals`, `npm run test:stock-client`. `npm run test:stock-retry` starts disposable emulators; when the matching project emulators are already running, execute `node scripts/stock-retry-qa.mjs` instead. Backend validation is prepared with `npm run functions:prepare`.

## Next tasks in order

1. **Wong: procurement completion.** Supplier editing; explicit rejection with remarks; correction/resubmission with version/role checks; cancellation interface; status/date/supplier filters and pagination. Preserve independent approval and partial receipt accounting. Update validation, transactions, rules, emulator tests and browser checks together.
2. **Wong: stock and reports.** Catalogue identifier/status filters; quantity-based multi-location transfers consistent with warehouse allocations; linked correction transactions; persistent reorder review/purchase traceability; inventory/approval/movement/verification report filters and exception review.
3. **Choong: delivery/evidence.** Pre-dispatch evidence with stage permissions; persisted abnormality scores with documented points, thresholds, matched rules and calculation time; contextual review, evidence preview/timeline and logistics report filters. Reconcile the webcam design with image-input requirements.
4. **Choong/shared: planning and restricted access.** Route preview and distance/ETA support; driver/vehicle editing and assignment visibility; searchable lists; customer-specific delivery/POD/location access. Internal Viewer is not the customer role.
5. **Release acceptance.** Verify the selected Admin's email and retained inventory; backups; billing/runtime/service permissions; combined backend/rules/indexes/UI release after required checks; real staff/supervisor and phone-GPS acceptance. Larger datasets need query pagination and bundle optimisation.
6. **Research/final evidence alongside feature work.** Obtain labelled inventory/delivery data and Normal/Damaged images; evaluate both Random Forest workflows and MobileNetV2 with committed baselines; configure reviewed authenticated inference; complete browser-wallet acceptance for both verification paths and reconcile reports to evidence. No labelled datasets/images are available yet; final accuracy claims remain unavailable.

The next implementation batch is item 1. No new procurement feature, customer portal, partial-location transfer, production deployment or real-model evaluation was completed by this continuation.
