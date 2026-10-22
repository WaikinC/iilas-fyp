# Stage-linked parcel evidence verification — 20 October 2026

Implements the [stage contract](PARCEL_EVIDENCE_STAGE_CONTRACT_2026-10-20.md) for the [full parcel AI goal](PARCEL_AI_COMPLETION_GOAL_2026-10-20.md). This closes the current pre-dispatch/delivery acquisition increment, not evaluated photo/live AI.

## Behaviour

Approved Warehouse staff can select a Prepared shipment in Warehouse Operations and record a Pre-dispatch parcel photo. Admin, Manager and Logistics can use the same prepared-shipment panel in Delivery Monitoring. Dispatched shipments retain Delivery evidence for Admin, Manager, Logistics and the currently assigned Driver. Prepared accepts Parcel Image only; Delivery also accepts Proof of Delivery. Other approved staff retain shared reads under the existing policy.

Storage creation and trusted registration enforce current scope, approval, role, stage/status, assignment, type and capture declarations. The command checks authorization before object access and again in its final transaction. A dispatch, reassignment or access revocation between upload and registration rejects the stale registration. Evidence remains immutable. Registration stores server time, stage, declared file/camera source, optional untrusted client capture time and the observed shipment version. Client time is not proof of when an image was taken.

Version-2 integrity binds the new provenance fields; old version-1 canonical bytes remain unchanged. Legacy records display Stage not recorded / Source not recorded. The UI resets a pending selection/camera when the acting account, permission or shipment context changes. Camera and file selection still require explicit review and upload.

## Verification on MSI

Parent observed the following against the current working tree and existing loopback emulators:

| Check | Result |
| --- | --- |
| Shared policy, capture, registration, v1/v2 integrity, model-response/authorization and dispatch-retry tests | 97/97 passed |
| Real Storage plus registration stage suite | 48 checks passed, including invalid February 30/hour 25, role/status/scope denials, metadata mismatch, state changes during upload, immutable objects and denied client record writes |
| Original smoke | Passed catalogue, movements, handover and atomic dispatch |
| Original QA including warehouse | Passed stale/concurrent/tampered operations and ordered handover |
| Shared-system regression | Passed seven roles, transport, concurrent dispatch, GPS, immutable proof and delivery |
| Account-access regression | Passed approval, revocation, fixed scope and preserved stock |
| Parcel guard with real Firestore transactions | 8/8 passed |
| Actual application browser workflows | Six passed: Warehouse prepared file/camera uploads, Logistics prepared access/delivery upload, truthful legacy display and Viewer read-only behaviour; no runtime errors |
| Browser layout | Actual desktop and 390px evidence records inspected; no narrow-page overflow |
| Existing component camera/browser checks | 18 passed before final CSS spacing adjustment; actual app run subsequently verifies the final interface |
| Production build | Passed; existing large-chunk warning |
| ESLint | Zero errors; five native-image warnings |
| Secret checks | 186 tracked files, 290 tracked/untracked nonignored files and 246 reachable history blobs passed |
| Exclusion and experiment preservation | No local dataset/model/output/private Firebase config paths tracked; six sealed research modules, manifest and protocol match the completed pilot |

One parent focused run and the parcel guard invocation initially omitted Node's required module-mocking flag. They failed before those mock-dependent tests could execute. Corrected commands passed; no application fix or weakened assertion was needed.

Reproduce focused checks with:

```powershell
node --experimental-test-module-mocks --experimental-strip-types --test scripts/parcel-capture-qa.mjs scripts/parcel-evidence-qa.mjs scripts/parcel-evidence-command-qa.mjs scripts/parcel-command-qa.mjs scripts/parcel-response-qa.mjs scripts/shipment-retry-qa.mjs
node scripts/parcel-evidence-emulator-qa.mjs
node --experimental-test-module-mocks scripts/parcel-guard-emulator-qa.mjs
```

Run emulator suites sequentially; do not start duplicate wrappers. Ignored local evidence is in outputs/parcel-stage-20261020 and output/playwright/parcel-stages-20261020. Browser camera images are synthetic software fixtures. No physical camera or model quality was evaluated. Independent integrated review found no blocking defect; the additional calendar cases subsequently passed in the parent run.

## Remaining work

Model acceptance remains closed and no prediction was generated. Next implement persistent photo-analysis request/outcome identity, safe retries and recovery, evidence/stage/model result binding and human review. Then implement bounded live sampled-frame sessions with stale-result rejection and measured real-camera evaluation. The failed tiny publisher pilot remains frozen; stronger grouped training and untouched evaluation data are still required.

The user confirmed starting the official crop download. At this verification checkpoint MSI Downloads still held only a zero-byte partial file; no completed payload or live download handle was verified. Do not restart it merely from that observation. Validate the final size and publisher SHA-256 before any intake.

No production changes, model activation, dataset publication, commit or push were performed.
