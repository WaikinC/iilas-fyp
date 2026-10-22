# Parcel backend response and authorization guard — 20 October 2026

The trusted command now refuses parcel predictions unless a separate, server-owned acceptance record exists for the exact evaluated model. No model has that acceptance: `backend/functions/parcelAcceptance.mjs` currently exports `null`. The small Kaputt pilot remains rejected, and Python operational admission remains closed.

## Changed behavior

- `service.mjs` checks the trusted acceptance descriptor before downloading parcel evidence or calling the research service. A remote `operationally_approved: true` flag, client input or environment boolean cannot open this gate.
- `parcelResponse.mjs` validates MobileNetV2 identity, model/selection/evaluation digests, registered evidence digest, preprocessing, contrast, mandatory human review, uncalibrated confidence, two normalized finite scores, label/score consistency, request ID and bounded timings.
- Exact ties require `abstained` with a null label. Until the coordinated UI/persistence contract supports that state, the backend returns a recoverable `failed-precondition` asking for human review and creates no Normal prediction or prediction audit.
- The final transaction rechecks current account approval, activity and role through the existing access boundary, then evidence/source version and current Driver assignment. Reassignment or revocation during the remote call prevents persistence.
- Existing inventory/delivery features and response fields are preserved; they also receive the completion-time Driver assignment check. No tabular model was developed or changed.

The pin's shape validation is not scientific acceptance. A future reviewed acceptance implementation must bind its actual provenance and intended use to the exact model and evaluation, and agree with Python admission. The descriptor is limited to registered photos; it does not certify live camera analysis. No schema, rules or frontend changes were introduced here.

## Verification

All commands used the configured MSI Node 22 toolchain. Existing loopback emulators were reused, with Firebase suites run sequentially.

| Check | Result |
| --- | --- |
| Pure response, real-command external-double and existing shipment-retry tests | 70/70 passed in 2.121 seconds in the parent verification run |
| Dedicated real Firestore transaction tests | 8/8 passed in 6.151 seconds |
| Original Firestore smoke and QA | Passed |
| Shared-system QA | Passed |
| Account-access QA | Passed |
| TypeScript/Vite build | Passed; existing bundle-size warning remains |
| ESLint | Zero errors; five image-element warnings remain |
| Secret scan | Passed for 186 tracked files; extended enumeration passed for 279 tracked/nonignored untracked files before this report |
| Whitespace check | Passed |
| Independent read-only review | No blocking defects found |

The dedicated emulator suite pauses a synthetic remote response, commits reassignment, disablement, approval/role revocation or evidence-version changes to real Firestore, then releases the response and checks rejection with zero prediction/audit writes. A test-only module mock supplies an accepted synthetic descriptor for positive-path testing. The production module remains null; no testing flag or injection hook was added to production.

The implementer recorded the initial failing checks before adding the guard. Fixed disposable test token strings were then replaced with generated UUIDs without weakening the secret scanner. The command tests were rerun after that test-only change. Firebase permission-denied messages during negative tests were expected; metadata lookup warnings did not fail the local suites.

Reproduce focused checks:

```powershell
node --experimental-test-module-mocks --test scripts/parcel-response-qa.mjs scripts/parcel-command-qa.mjs scripts/shipment-retry-qa.mjs
node --experimental-test-module-mocks --test scripts/parcel-guard-emulator-qa.mjs
```

Run the second command only with the configured Firestore emulator and initialized local shared-system fixture. It creates unique fixture records and removes its own records afterward. Model-quality evaluation, actual HTTP/Storage model integration and physical-camera tests are outside those synthetic fixture assertions.

## Remaining core work

The [publisher-labelled pilot](../research/KAPUTT_PUBLISHER_PILOT_2026-10-20.md) is still inadequate: both models missed its only damaged test image. A larger independent source cohort, fixed next protocol and meaningful source/IILAS evaluation remain necessary.

Stage-aware evidence, request identity/idempotency, persisted failure/abstention states, complete result provenance, sampled live sessions and physical-camera quality/latency evaluation remain unfinished. This guard completes task 3 of the existing API integration plan, not the full photo/live feature. Other AI models and additional features remain deferred. No model activation, publication or production operation occurred.
