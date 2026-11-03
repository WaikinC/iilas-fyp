# Context-aware stock AI in the local experimental screen

23 October 2026. The user approved this written design on 23 October 2026. Implementation planning is underway; production deployment remains excluded. Existing Native execution preference is retained.

Builder check: a fresh read-only reviewer returned **nothing important left**. Local verification confirms the frozen RF14 checksum, valid document links and clean whitespace. No application, model, dataset, service or private configuration was changed while preparing this design.

## Intent and established choices

Continue the user's stock AI goal by making the evaluated fourteen-input Random Forest usable through the existing local IILAS Stock AI experiment. The user already chose simulated scenarios and experimental app mode while actual inventory history qualifies. Keep that choice; do not ask them to choose simulation versus real inventory again.

The candidate recognises Normal, Reorder Risk and Critical Stock Risk using stock facts plus additional commitments and incoming supply. Preserve shared approved-staff access, exact request recovery, retained history and the distinction between experimental scores and operational inventory decisions. No product selection, balance update, purchase action, independent human annotation claim or real-world approval is introduced.

The previous goal turn made verified progress: the six-task context experiment and its audits completed. This follow-up addresses the remaining app connection. Real-history qualification and independently labelled intended-use evaluation remain separate unfinished parts of the overall stock goal.

## Current evidence and hard boundaries

The [completed experiment](../../../research/INVENTORY_CONTEXT_EXPERIMENT_2026-10-23.md) has 300 fictional families, 52 fits and one consumed evaluation on 720 rows from 60 held-out families. RF14 accuracy is 81.53%, macro-F1 0.8080, Critical precision 79.00% and recall 87.78%. Accuracy's family-bootstrap interval is 78.54–84.86%. Nine Critical cases were called Normal, another 35 Reorder; 45/150 Normal cases received risk alerts. This supports a disclosed simulated prototype, not a guaranteed 80% minimum or warehouse validation.

Use only the frozen RF14, never pick DT after these results:

- Dataset manifest: `research/datasets/inventory-simulation-v2/main-01/manifest.json`, SHA-256 `06b22b1c46e4d0c6dba6439abe4a00363c36be4424062fa678b5a34efd84d414`.
- Weights: `research/datasets/inventory-simulation-v2/development-01/final-RF14.joblib`, SHA-256 `43b5641f6cd6cb045fd6f9ff06463f2e51c9dc759b84dbfa25b041a3942850d0` (1,658,852 bytes).
- Registered selection: 100 trees, maximum depth12, minimum leaf2, balanced class weights, seed42 and two threads.
- Frozen completion receipts are under the v2 dataset `registry/`. All three scientific claims are consumed. No data regeneration, fitting, threshold selection, raw TEST access or repeated scientific evaluation belongs to this integration.

Existing `lib/inventoryAI.js`, `inventoryAIClient.js`, `backend/functions/inventoryAI.mjs` and `InventoryAIExperiment.tsx` implement the six-input protocol. The Python `inventory_inference.py` is itself pinned by both scientific studies. **Do not modify that file, any six v2 scientific modules/protocol, original simulation/runtime sources, or canonical stock/location helpers.** Add a separate inference adapter and service instead. Existing v1 datasets/weights/receipts remain byte-for-byte unchanged.

## Approaches

1. **Extend the existing experimental screen and use RF14 for new submissions — proposed.** This follows the user's selected app mode with one clear form, versioned retained results and explicit old-request recovery. It needs a new closed input/serving contract and controlled local service switch.
2. Add a permanent six-versus-fourteen model selector. It permits comparison in the UI but duplicates input/recovery paths and encourages treating different scenario formats as comparable. The offline study already supplies that comparison; defer this extra feature.
3. Automatically map real products/orders/POs into the candidate. Existing qualified-history count is zero, and commitment/supply semantics are not admitted. This would invent unknown facts or imply readiness. It conflicts with the selected experimental route and is excluded.

The general experimental approach is already selected by the user. The user approved Choice1's concrete integration design on 23 October 2026; implementation follows the separate reviewed plan. This is a multi-component change, not a weight-file replacement.

## Staff workflow and inputs

Keep **Stock Management → Stock AI experiment**, current navy/purple styling, accessible modal focus, mobile layout and labelled actions. Arrange fields in two labelled groups: **Fictional stock** and **Additional demand and replenishment**. Use existing components rather than redesigning navigation/dashboard.

Keep the six existing entered facts: on-hand quantity, reserved quantity, reorder level, 30-day movement count, 30-day adjustment count and fractional days since replenishment. Add five entered facts:

| Fact | Meaning and validation |
|---|---|
| Additional firm quantity | Whole units needed beyond commitments already represented by reserved quantity; zero explicitly means none. |
| Additional due days | Nonnegative fractional days from the scenario cutoff; required when additional quantity is positive, null when it is explicitly zero. Zero means due now. |
| Incoming quantity | Whole units in one stated incoming batch; positive for planned/confirmed/disrupted, zero only for no batch. |
| Incoming ETA days | Nonnegative fractional days from the same cutoff; required for a stated batch, null for none. Zero means expected now. |
| Supply status | Explicit none/planned/confirmed/disrupted. No automatic default from a blank field or a purchase-order state. |

Eleven entered facts become fourteen features because on-hand/reorder are converted to available/reorder distance, and supply status becomes four one-hot columns. Do not show fourteen confusing form controls. Quantities remain bounded at1,000,000, counts at2,000 and ages/deadlines at36,500days, matching existing numeric constraints and the frozen context validator; fractions remain accepted for day fields. Reservations<=on-hand and adjustments<=movements remain required. The four supply indicators must be exactly one-hot.

Blank means unknown and prevents analysis. Explicitly choosing no incoming batch sets quantity0/ETA null with a visible explanation; it never silently interprets an empty control as absence. Entering additional quantity0 explicitly removes its deadline. Other changes cannot leave stale hidden values in a request. Reject unexpected fields, strings-as-numbers, NaN/Infinity, booleans-as-numbers and inconsistent absence/quantity/deadline combinations on every boundary.

The factual preview shows available quantity and reorder distance once, plus additional demand/deadline and incoming batch/status. Explain that reserved commitments are already deducted and must not be re-entered as additional demand. These are manual fictional facts known at a common scenario cutoff, not inferred timestamps or qualified business history. No synthetic ledger/family ID/teacher label is accepted from the browser.

An explicit disclosure says the model was evaluated against simulated teaching labels, independent accuracy is pending, scores are uncalibrated and no stock/purchasing action follows. Show the RF14 study's counts/metrics and uncertainty for the new mode. For old history, show that record's six-input model and original study metrics; never relabel historical results with81.53%.

## Closed versioned contracts

Add `lib/inventoryContextAI.js` with declarations, copied to the backend by the existing canonical-helper preparation workflow. Keep the v1 helper unchanged. New inference protocol: `inventory-context-inference-2.0`; serving schema: `inventory-context-local-serving-2.0`. Public commands are `startInventoryContextExperiment` and `resolveInventoryContextExperiment`.

New input is exactly `{operationId, scenario}` with the eleven canonical camelCase fields above. Derive the fourteen ordered snake_case features exactly as the frozen context contract. Known absent deadlines encode to0 in the feature vector; retain their null/absence semantics in the scenario record. Include the protocol in deterministic binary64 feature hashing. JavaScript/Python fixture parity covers zero, negative reorder distance, fractional days, null absence and all supply states.

Responses bind protocol, request/server nonce, input hash, feature order/values, three-class order, model/manifest/dataset/development/evaluation hashes, label and probabilities. Preserve sklearn alphabetical argmax ties. Include developmental range warnings for all14columns; numeric range membership does not establish in-distribution validity. Preserve false operational/independent-validation flags, evaluationOnly true, acceptance null, simulated-manual origin and humanReviewRequired true. No teacher output or generated explanation is presented as the model's reasoning.

Use the same public `inventoryAIExperiments` history collection with explicit protocol/schema discrimination and separate private context request receipts `inventoryContextAIRequests`. Public records remain trusted-server-only writes and Approved fixed-scope reads; new private receipts deny all client access. The history reader supports both exact known versions and refuses unsupported/malformed records without inventing missing context. Existing indexes/paging order remain unless an actual query change requires an index.

## Recovery, old requests and permissions

Keep Admin/Manager/Inventory/Warehouse submission and Approved shared-history reads. Recheck active membership, role and fixed scope before claims and final retention, using existing trusted transactions. Hold actor/scope/operation/canonical input in an immutable private request. HTTP work stays outside the transaction. Retain45s running leases, server nonce/configuration fingerprint fencing, bounded response parsing,25s backend fetch deadline and35s browser observation deadline. A timeout retains exact intent; no automatic fresh request or retry.

A new `inventoryContextAIClient` uses a distinct versioned session-storage key. It also checks for a pending v1 request at the existing key and blocks a new context request until that old operation is resolved. Do not delete or reinterpret the old request. The existing v1 resolver remains callable offline: existing terminal outcome is returned, still-running returns Pending, expired becomes Unavailable, unknown operation becomes Cancelled. The migrated UI offers **Check previous experiment outcome**, not a new six-input run. Existing v1 retry endpoints may recover already-claimed operations, but must not start fresh v1 inference after the switch. Enforce this in trusted routing, not only in a hidden button. Retain nonce/role checks for late completions.

Current v1 results remain readable with their original facts, scores and provenance. New history entries contain all11facts and source metrics bound to the selected manifest. Old inputs do not get synthetic context defaults. Real-product rule assessment and its readiness contract stay unchanged; its reasons must continue to state that real inputs/history are unqualified. Viewing a product never invokes this model.

## Separate Python adapter and bounded service

Add `research/inventory_context_inference.py` and `serve_inventory_context_local_eval.py`. Preserve original inference/scientific modules. Reuse unchanged low-level native process primitives and the already verified cleanup helper; do not modify frozen modules just to share an interface. The new service occupies the existing stock loopback slot8001 after a controlled stop/start. Parcel remains8000. No extra always-running comparison service or GPU dependency is needed.

Preparation writes a fresh immutable manifest beneath ignored `research/datasets/inventory-context-serving-v2/`, binding the exact model, all scientific source/environment pins, consumed claims/completion receipts, selected RF14 spec, fourteen-column development ranges, aggregate evaluation evidence, app/server source pins and library versions. Metadata preparation may audit development inputs and recorded evaluation artifacts; it must never open raw test dossiers/CSV, run test prediction, fit or alter scientific receipts. Use metadata-only loaders with explicit file-open guards in tests.

Avoid redoing the costly full development audit on each inference request. Preparation verifies the full frozen development evidence once. Runtime checks pinned compact manifest/reference/source hashes, the frozen selected-model identity and bounded metadata; a replaced source, completion receipt or model fails closed. Development ranges come only from development rows. Recorded evaluation scores are displayed metadata, not freshly recomputed accuracy. Define all file-size caps explicitly in the plan using measured artifacts.

Only the supervised worker deserializes the trusted, hash-verified model from the same byte buffer it hashes. Validate actual model class/features/parameters against frozen selection. Do not accept arbitrary model paths, objects or uploaded pickles. A request uses fifteen seconds, two threads,2GiB supervised RSS,3GiB free startup RAM and1GiB free disk; retain a separate three-second confirmed-drain budget, one active job, bounded input/output and100MiB total serving evidence. Ambiguous termination leaves the executor unavailable until owned workers are verified stopped. Do not weaken limits or close unrelated apps to make checks pass.

Retain loopback-only host/client/server checks, service-token authentication before body parsing,4096-byte request cap, duplicate-header/invalid-JSON/nonfinite rejection and a20s HTTP deadline with bounded native drain after disconnect/cancellation. Keep service credentials in ignored private profiles, never frontend variables/logs. Measure prediction-only time separately from total service time for this new adapter; do not rewrite the original research timing evidence or equate either with complete app response time.

## Local startup and preservation

The shared backend router is pinned by the existing parcel manifest. Adding commands changes that hash, so preparing a **new parcel metadata manifest** is necessary compatibility work, not new parcel training/camera testing. Preserve the original parcel model, descriptors, warm bundle and all old manifests. Refresh only the current app-source binding through its existing metadata preparation command. Do not patch historical hashes.

Create a fresh versioned private profile binding new stock metadata and the refreshed parcel metadata, preserving the existing parcel configuration without displaying its values. Update the launcher to explicitly choose the context service for this profile; reject schema/protocol mismatch. Preserve existing profiles/artifacts; do not claim old source-bound profiles remain startable after changed app sources. No automatic fallback to the old model: new-mode failure is Unavailable with recoverable intent.

Before any emulator restart, re-identify actual listeners/process identities and export the current state. The known MSI Windows export-finalisation issue may leave a valid official staging export: copy only a verified complete current export to a fresh ignored checkpoint, hash every file and audit documents/accounts/Storage. Never replace current state with the historical `private-config` snapshot. Do not stop services if a complete current checkpoint is unavailable. After restart preserve IDs, balances, selected Admin, profiles, documents and objects; document only the known import-related Auth timestamp exception if observed. Check for active work and drain owned stock requests before switching; never force-kill an unconfirmed job.

Run only one emulator stack at the configured explicit-project tuple. Browser verification uses literal `http://127.0.0.1:5173`. Any temporary test accounts/scenarios/records are fixture-labelled, ignored and exactly cleaned after testing. Keep current operational records and every existing experiment outcome intact.

## Verification and acceptance of this integration

Use existing Native execution and a fresh final review, with TDD for meaningful changed contracts and recovery paths. No commit, push, merge, deployment or dependency upgrade is needed. The implementation plan must include:

1. Cross-language input/digest parity and schema rejection, no reserved-demand double counting, null-versus-unknown handling and tied-score label parity.
2. Metadata-only preparation/audit tests trapping raw TEST opens, training and untrusted deserialization; frozen-artifact mutation rejection and unchanged scientific hashes.
3. Actual native RF14 inference on deliberately hand-authored software scenarios, compared with the same frozen estimator's outputs as a software parity check. These checks are not new accuracy samples or a test-set replay. Verify time/memory limits, real descendant cleanup, busy/refused admission and sticky unavailable state.
4. Request nonce/configuration/role fencing, duplicate submission, altered-input retries, stale/late replies,35s observation timeout, disconnection and recovery. Include v1 Pending/Predicted/Unavailable/unknown-operation recovery and rejection of fresh v1 runs after switching.
5. Direct-write/private-read denial and scoped permissions for both result versions; zero writes to stock, purchases, generic predictions or human-review labels. Run original smoke/QA, affected stock suites and the established sequential emulator regressions against the one current stack.
6. Desktop and390px browser form/history/recovery tests, followed by actual browser→Firebase→new Python model proof. Verify model/input hashes and scores against retained worker evidence. Do not count intercepted fixture responses as proof of real model transport.
7. Build/lint, tracked/history/expanded secret scans, Git-ignore checks, protected artifact hashes, document links and exact fixture/state preservation. Run affected Python modules first, then the isolated full research collection when final changes warrant it. Keep optional skips/pre-existing warnings separate.

Update app README workflows, requirements, scope traceability, account contract, local guide, roadmap and archive handover with actual results, not an implementation promise. Completion means a user can submit a complete fictional context scenario, see the actual frozen RF14 result and recover it safely; real-product AI remains unavailable. The full stock goal remains unfinished for qualified genuine inputs and independent intended-use validation.

## Decisions left to the builder

Choose helper names, test fixture IDs, exact layout spacing and immutable manifest/profile filenames consistent with existing conventions. Do not change model selection, input semantics, scientific pins, roles, record recovery, production boundaries or resource limits. If a measured artifact or runtime cannot fit the stated bounds, report that constraint rather than silently weakening it.
