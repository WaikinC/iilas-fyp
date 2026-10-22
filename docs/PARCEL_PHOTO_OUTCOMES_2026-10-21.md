# Recoverable parcel photo outcomes — 21 October 2026

The stage-bound photo request/outcome workflow is implemented and verified locally on MSI, completing Tasks 2–4 of the [photo outcomes plan](superpowers/plans/2026-10-21-parcel-photo-outcomes.md). Model acceptance remains closed: the actual application saves Unavailable with a null label. Positive inference tests use external synthetic doubles, not an activated model or evidence of accuracy. The [full evaluated photo/live goal](PARCEL_AI_COMPLETION_GOAL_2026-10-20.md) remains incomplete.

## Staff behavior

Eligible staff select Request analysis beside a registered Parcel Image. New requests follow the existing stage matrix: Warehouse can analyse Prepared/Pre-dispatch evidence; Admin/Manager/Logistics retain their stage permissions; a Driver can analyse Delivery evidence while assigned to a Dispatched shipment. Proof of Delivery and unknown-stage legacy evidence cannot start analysis.

Saved outcomes identify the image hash/version, original stage/source, times and available model provenance. Unavailable, Failed, Stale, Expired and Abstained never become Normal. A lost response retains the same four-ID intent in the tab; Check outcome recovers that operation without a replacement. Approved staff can read historical results after dispatch or reassignment without acquiring new-start permission.

Admin/Manager review updates reciprocal Predicted analysis/projection records atomically. Abstained review records inspection notes while retaining a null label and creating no training label. Unlinked historical predictions keep their previous review contract. The generic parcel predict command/form now rejects; inventory/delivery Random Forest behavior is preserved.

## Trusted contracts

- Commands: `startParcelAnalysis({evidenceId,operationId})`, `resolveParcelAnalysis({analysisId})`, `reviewParcelAnalysis({analysisId,version,decision,notes})`. Scope/actor come from protected configuration/current Approved account state.
- Private `parcelAnalysisRequests` and `parcelAnalysisLocks` deny all client access. Public `parcelAnalyses` permits only existing Approved/active fixed-scope shared reads, with no direct writes.
- Scope/actor/UUID receipts bind an immutable validated command. Historical matching replay precedes NEW-work permissions. Busy saves an immutable Blocked receipt; replay always returns the same blocker even after completion.
- Running has a 90-second lease. Completion is strictly before expiry; explicit resolution expires at/after the boundary. Every lock release checks scope/evidence/analysis/receipt/nonce/expiry. Expired locks require explicit resolution before a separately explicit new operation.
- Final transactions compare protected configuration/account, shipment, evidence and plan absence/presence/version/driver snapshots, plus the model descriptor. They check the authority clock after all reads. Internal cleanup saves only a null outcome and never releases a successor lock.
- Predicted creates at most one deterministic reciprocal projection/audit. Missing or corrupt links fail closed. Abstained creates no labelled projection. Review checks current authority, Pending versions and original provenance.
- Missing acceptance/service returns Unavailable before bytes or HTTP. Admitted-path software tests cover streamed Storage under 10 MiB/10 seconds with length/type/signature/SHA checks, HTTP under 30 seconds including body reads, a 16 KiB response cap, abort/cancellation and a 50-second handler budget within the existing 60-second Function limit.

Python serving/runtime now declare explicit Normal/Damaged `classOrder` and null `acceptanceSha256` while unapproved. API admission remains unconditionally false. Future approved response fixtures require explicit order/digest, checked against the trusted backend pin. Request fields or environment booleans cannot grant acceptance. The nine bound training sources, cohorts and experiment artifacts remain unchanged.

Current dashboard parcel assessments require reciprocal Predicted/Accepted results matching current known stage and evidence hash/version. Pending, Rejected, null, stale and unlinked history are excluded. Eight cards, theme, unrelated risk predicates, primary Admin, IDs/balances and warehouse handover are preserved.

## Verification

| Check | Result |
| --- | --- |
| Parent backend/state/response/legacy run | 131 tests passed |
| Parent affected dashboard/evidence/capture | 31 tests passed |
| Independent command/response review | 97 tests passed |
| Independent boundary run | 55 passed, including 15 additional probes; no remaining concrete blocker |
| New real emulator suite | 48 accepted-worker scenario groups plus 4 callable/SDK-rules groups passed |
| Sequential existing-emulator regressions | Original smoke/QA, shared system, account access, evidence-stage (48 checks) and legacy guard (2 tests) all passed |
| Repeatable real-component browser fixtures | 16 scenarios passed, including recovery, Busy, context changes, reviews, note limits and mobile |
| Actual application browser | 8 checks passed: eight cards; real Warehouse request; committed response loss/reload/dispatch recovery; 390/320px layouts; assigned Driver versus proof files; Viewer read-only; no page errors |
| Python wire/API/serving | 37 tests passed; separate full native runtime run passed 27 (two pure wire tests overlap) |
| Integrated build/lint | Passed; zero lint errors, five existing image warnings and the existing bundle warning |

Final secret verification passed for 327 tracked/untracked nonignored files, 186 tracked files and 246 reachable Git blobs. Two static test-only tokens were replaced with runtime UUIDs without adding scanner exceptions; 131 focused tests and all 52 emulator groups passed again. Private configuration, datasets, models, outputs and scratch artifacts remain untracked/ignored. No commit, push or deployment was performed.

Positive accepted-worker checks use external pin/Storage/HTTP doubles with actual Firestore transactions. Production callable tests use the real null pin. Browser component doubles and actual app checks are separate evidence. No model execution/accuracy or physical-camera acceptance is claimed.

Review resolved map-order equality, clock expiry after final reads, original receipt identity, predecessor cleanup, corrupt projection replay, late UI intent cleanup and 240-character linked review notes (unlinked history retains 500). Relevant failing/passing tests were observed.

Execution failures are preserved: restricted Windows asyncio blocked in socketpair setup; traceback and targeted termination preceded the successful elevated run. Browser attempt 1 had a named-Admin-app cleanup error; attempt 2 counted Driver controls before the separate evidence snapshot arrived. Corrected attempt 3 passed and cleaned up. The first run's three generated accounts were subsequently identified by generated suffix and precise run window, removed, and protected config verified unchanged. These were harness/environment failures, not replacement fits.

Ignored evidence is in `outputs/parcel-photo-outcomes-20261021/`: parent focused/build/lint logs, emulator JSON reports/run02, independent integration report/probes, final UI note-limit logs, `actual-browser-03.json` and screenshots, cleanup receipt and final security/preservation checkpoint. Earlier failing snapshots are retained.

## Reproduction and remaining work

Dot-source the outer `Enter-IILAS.ps1`. Reuse existing loopback emulators; never run a second wrapper. New suites:

```powershell
node scripts/prepare-functions.mjs
node --experimental-test-module-mocks --test scripts/parcel-analysis-command-qa.mjs scripts/parcel-response-qa.mjs scripts/parcel-analysis-qa.mjs scripts/parcel-analysis-retry-qa.mjs scripts/parcel-command-qa.mjs
node --experimental-test-module-mocks scripts/parcel-analysis-emulator-qa.mjs
node scripts/parcel-analysis-ui-qa.mjs
```

The UI fixture runner needs literal `http://127.0.0.1:5173`. Actual app evidence separately uses the real loopback Auth/Firestore/Functions/Storage stack. No production deployment or broad-sharing acceptance is implied.

Next implement bounded live sampled-frame sessions: explicit start/stop, session/frame identity, stale-result rejection, cancellation and resource limits. Accepted model quality, relevant independent data, once-only reserved evaluation after final choices and physical-camera quality/latency/resource tests remain required. Photo acceptance cannot certify live use. The 147 reserved candidates remain unopened; other AI modules/extras stay deferred.
