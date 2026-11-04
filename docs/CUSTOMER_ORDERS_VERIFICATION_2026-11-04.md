# Customer order extension — local verification

Status: local implementation and verification; Firebase publication remains held. The isolated development checkout is `.worktrees/automatic-business-codes`, based on `47195ea`. The running MSI application/backend, AI artifacts, durable chain, ngrok configuration and cloud records were not switched or deployed. No camera, parcel-model or physical phone trial was performed.

## Implemented behavior

- Customer Orders / Shipments navigation, focused request form/details, labelled status colours, stable URLs and safe private shipment/proof access.
- Closed own-record Customer endpoints, separate Admin/Manager/Logistics review, atomic generated-SHP Draft/link/grant, no acceptance stock change, normal warehouse/transport/dispatch and linked Draft cancellation without resurrection.
- Persist-before-send recovery; originating-UID server precondition; browser Web Locks for atomic same-slot multi-tab coordination; exact saved-input hydration and recovery that preserves unrelated drafts.
- Read-only current delivery-proof integrity result with file/source/config/current-grant reauthorization. No Customer hash registration, wallet permission or internal verification metadata.
- Four private collection denies and four query indexes added locally. No cloud index/rule migration was applied.

## Executed checks

| Check | Result / evidence |
|---|---|
| Shared contracts, recovery, routes and existing Customer/proof/integrity command regressions | 70 tests passed, `outputs/customer-orders-20261104/contracts-final.log` |
| Actual Customer order handlers | 8 passed; own access, decisions/races, deletion/replay, disabled authority, original-UID mismatch and Malaysia-midnight exact recovery/fresh-date refusal |
| Independent actual boundary suite | 7 passed; roles, target eligibility, product mapping, pagination/cursor binding, counters, edit lineage and SDK denials |
| Actual Customer proof boundary suite | 7 passed; closed result, no writes, exact/missing/mismatched registry result, foreign access, grant revocation, proof change, derived hybrid context and revoke/re-grant during I/O |
| Actual full fulfilment | 9 checkpoints passed in one test: one SHP, bin holds, preserved independent reservations, handover, transport locks, exactly-once dispatch, Driver delivery/location policy, real Storage PDF upload and protected bearer-only HTTP download/revocation |
| Existing emulator regressions | Smoke, QA/warehouse, shared-system, account access, 172 stock-location/correction checks, automatic-code workflow/cleanup and 204 Customer Firestore/Storage checks passed sequentially |
| Existing Customer interface | 18 software-fixture checks passed; fixture runtime exports updated for the new imported module |
| Actual application browser | 10 groups plus quantity-error/narrow-action regressions passed after all fixes through fresh actual HTTP workers; 24 status samples, minimum contrast 6.63:1, zero overflow at 1440/390/320px |
| Recovery browser | 4 passed: saved Submit hydration, NotFound/Completed recovery preserving unrelated draft/dirty guard, real two-tab Web Locks with one in-flight resolver and unchanged saved intent |
| Build / lint | Build passed; lint 0 errors / 13 pre-existing warnings. Existing large-chunk advisory remains. |

Final actual browser receipt: `outputs/customer-orders-20261104/browser-54510db9-88aa-4acc-8934-d7b5c5be6e66/result.private.json`. Recovery receipt: `recovery-browser-26d89ff0-166f-4853-be79-d656ea13cf1e/result.private.json` under the same output directory. Actual proof-button receipt: `proof-browser-dd179e1a-1864-4fd2-b26a-97366714c6f2/result.private.json` (4 checks): one real Functions check returns the closed four-field Unavailable outcome, with honest UI/no internal metadata/no live-chain request and exact shipment/delivery/handover/evidence/product preservation. All owned browser contexts are closed. Private fixture accounts, passwords, IDs, screenshots and receipts stay under ignored outputs; no test data or dataset is committed. Registry/file results in the 7 proof boundary cases use injected I/O. Real protected PDF upload/download is separately exercised against the actual loopback Storage/Functions services.

## Final review and fixes

One independent source review found no Critical issue and three Important recovery issues. Each was reproduced RED and corrected in one fix pass:

1. A retiring/account-switched client could dispatch with the new user's token. Dispatch now rechecks lifecycle and every mutation/recovery carries the originally captured UID; the server compares it to authenticated UID before reading/writing order state. SDK token-read timing cannot transfer an intent to another user.
2. Two tabs could overwrite one uncertain localStorage slot. Browser Web Locks now claim and hold the same environment/UID/action slot through dispatch/observation/terminal cleanup; a competing tab is visibly refused without sending or overwriting it. Unsupported browsers fail before sending.
3. Recovery could clear an unrelated draft's dirty flag or navigate away. Recovery now associates a completed action with its original form; unrelated recovery refreshes results while retaining current form values and discard protection.

The saved-input hydration issue was regraded Important because a user must be able to review the exact retry input. It was reproduced in the actual browser, then corrected by loading the saved state before mounting the form and keying it to that operation. Midnight and revoke/re-grant cases were added; the clock is injected only through the existing internal test seam, with real wall-clock behavior by default.

## Decisions and remaining limits

- Free descriptions plus explicit staff mapping preserve the current private inventory boundary. Cost: staff must match requested items; there is no public catalogue, pricing or payment workflow.
- Existing Native execution and the user's explicit waiver of repeated design approvals were applied. Written design/plan remain reviewable; a different preferred flow would require local revisions. Publication is still held.
- Deferred minor: pending staff decisions are keyed by environment/backend/origin/UID, without a separate trusted shared-scope component. The current system has one immutable shared scope. A future same-environment/same-UID scope replacement requires explicit recovery migration; do not silently rebind it while decisions are pending.
- Hosted activation, the live MSI chain, real-account acceptance and physical phone/parcel trials were outside this local review. Cost: these need separate acceptance when their release/trial scope is authorized. A proof check without a configured registry honestly shows Unavailable; this is not evidence of a real blockchain registration.

## Test runtime notes

One fresh empty Standard Firestore/Auth/Functions/Storage stack was started on configured loopback endpoints, without importing historical private data. The fresh fictional emulator Admin credential was normalized to the existing disposable regression harness; no real account credential was changed. Original IDs/balances and live system bindings remained outside these fixtures. The automatic-code suite removed exactly its own fixtures and restored its test counters; other owned fictional review fixtures were retained only in the private emulator session.

The Firebase CLI watcher ignores hidden path segments, including `.worktrees`. After final source edits, an actual HTTP check caught an older cached Functions child. Only the four exact parent/start-time-owned local Functions workers were refreshed; Auth/Firestore/Storage and data stayed running. The final 10-group workflow and 4-check proof UI runs used those fresh workers and passed. This is a development watcher limitation, not a cloud Firebase failure or a live MSI restart.

See [the module-by-module workflow](CUSTOMER_ORDERS_LOCAL_GUIDE_2026-11-04.md), [design](superpowers/specs/2026-11-04-customer-orders-design.md) and [plan](superpowers/plans/2026-11-04-customer-orders.md).
