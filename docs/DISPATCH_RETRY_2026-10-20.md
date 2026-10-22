# Prepared-shipment dispatch retry fix — 20 October 2026

While verifying parcel capture, a repeated shared-system emulator suite failed at its concurrent dispatch assertion: both callers received “Prepared items and packing details are locked.” The earlier complete suite had passed. This exposed an existing transaction-retry defect, independent of camera capture.

`save` validated the input once outside its transaction callback. A dispatch attempt then enriched `data.items` with product names/SKUs. Firestore may discard that attempt and invoke the same callback again. The retry reused the enriched array and compared it with the stripped `{productId, quantity}` form of the Prepared shipment. Valid unchanged input could therefore fail the lock check.

The fix creates freshly validated data inside each callback invocation. The generated record ID remains outside the callback and stable across retries. Prepared item/reference/parcel-count locks, permissions, handover requirements, stock accounting and audit semantics are unchanged. No schema, security-rule or client-validation changes are required.

`npm.cmd run test:shipment-retry` uses the real command, approval, validation and stock logic with a deterministic Firestore boundary. It discards the first fully staged dispatch and replays the same callback. Before the fix the replay failed with the exact observed lock error. After the fix all four tests pass: one committed stock deduction, released reservations and matching handover linkage, duplicate-dispatch protection, plus three independent Prepared-lock rejection cases. The input-validation suite (159 checks), location-stock suite (57 checks) and targeted ESLint also passed.

After the fix, the original smoke/QA (including warehouse) and shared-system scripts passed sequentially against the local emulators. The shared run included concurrent dispatch and the three-product browser-fixture branch. No production records, deployments or Git publication are involved.
