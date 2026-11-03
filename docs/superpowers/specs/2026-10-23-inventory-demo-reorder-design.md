# Demo stock risk alerts and reorder review

23 October 2026. Design for the next core stock-AI workflow. The user selected **Demo risk alerts and reorder review** after the verified product-bound RF14 integration. Native execution remains the selected method. The user approved the written design and implementation plan; Native execution is underway.

## Intent and report alignment

Connect a newly retained demo-product risk prediction to a visible demo alert and a persistent requirement that Replenishment & Procurement can review. Staff must be able to see why the item exists, inspect its original facts, accept or reject it for the demonstration workflow, and recover an uncertain review response. Acceptance is a human workflow decision, not an independent class label or model-quality approval.

The original Wong portfolio commits to FR-10 Random Forest classification, FR-11 stored decision-support results, FR-12 risk alerts, FR-13 reorder requirements and FR-21 manager review. Its FR-27 further requires traceability from a reorder requirement through an issued purchase order to expected incoming stock. Paragraph 544 explicitly permits carefully prepared simulated stock scenarios for a student prototype, with limitations disclosed. The Choong report and shared handover contract require existing warehouse reservations, prepared shipments and dispatch ownership to remain intact.

Current software already implements frozen RF14 inference, product-bound facts, version3 experimental history, stale-product rejection and exact recovery. Procurement's current Reorder review is a derived list of products at/below their reorder threshold; it is not a persisted RF-based requirement. This change addresses the demo FR-12/FR-13/FR-21 gap. FR-27 source-to-order linkage and genuine-data/independent quality qualification remain explicit follow-on requirements; this step does not declare the entire stock objective complete.

## Approaches and selected route

The user chose the demo alert/reorder-review route over conducting an independent model evaluation first. It closes an application requirement using the already-confirmed demonstration records and fictional context. Independent evaluation remains useful but needs labels separate from the AI-authored teaching policy; repeating the consumed synthetic TEST would not supply them.

Automatically creating or approving operational purchase orders is unsuitable: the inputs are demonstrative, report decisions require authorised review, and the existing model provenance forbids operational acceptance. The selected design therefore persists separately named demo workflow records and keeps existing stock and purchasing commands unchanged. These are the builder's implementation boundaries, not a claim that the model is qualified for genuine warehouse decisions.

## Risk policy and automatic creation

Use a fixed, versioned demo policy: a verified **Predicted** demo-product result with label **Reorder Risk** or **Critical Stock Risk** creates one demo risk alert and one Pending demo reorder requirement. **Normal**, **Unavailable**, expired, cancelled or unsupported results create neither. Use the selected RF label under its existing argmax/tie rules; introduce no new probability threshold or calibration claim. Model scores remain uncalibrated.

Create the experiment, its private terminal receipt, alert, requirement and audit atomically in the existing finalisation transaction. Source/authority/configuration/nonce/lease/product checks still occur before any write, and model HTTP remains outside transactions. The workflow hook is a static internal demo definition, never a client-selected or injected transaction bypass. Manual-context and legacy finalisation retain their present receipt/public-record shapes.

Both new records use the experiment ID as their document ID. Replaying or concurrently finishing the same operation cannot create duplicates. Distinct experiments intentionally create distinct requirements even for the same product/version, because their fictional context may differ. Do not silently collapse or close another experiment's requirement. No background scan, trigger or backfill of pre-existing results is included.

## Records and lineage

Use separate collections:

- `inventoryDemoRiskAlerts`: immutable risk-notification facts and a reference to the matching requirement/experiment.
- `inventoryDemoReorderRequirements`: immutable source/decision-support facts plus current Pending/Accepted/Rejected review summary and optimistic version.
- `inventoryDemoReorderEvents`: append-only attributable decision event, linked to the original requirement and review operation.
- `inventoryDemoReorderRequests`: server-private Completed/Cancelled command receipts for exact review retry/outcome resolution.

The builder must define closed, versioned schemas in canonical shared validators and TypeScript declarations. Record only the compact frozen product source, original scenario/features and source/model digests required to inspect/revalidate the decision, risk class, uncalibrated class scores, original experiment actor/time, policy version, owning scope and timestamps. Do not copy the whole product, ledger, training data or private configuration. Link ID, frozen source, experiment identity, scenario/feature hash, predicted label/scores and all experimental provenance must agree with the trusted original experiment.

Keep existing v1/v2/v3 experiment records and model wire protocol unchanged. New demo workflow records retain explicit demonstration/fictional origin, `evaluationOnly:true`, `operationally_approved:false`, `independentAccuracyValidated:false` and `acceptanceSha256:null`; accepting a review never changes those values. No new generic `predictions`, independently reviewed stock labels or operational dashboard alerts are created. Show unsupported/corrupt retained records as unavailable with their ID instead of guessing a status or erasing them.

## Authorised review and stale facts

Admin and Manager may review a Pending requirement. The reviewer must differ from the original experiment actor, including for Admin. Existing account approval, active status, fixed data scope and server-side roles apply on every new submission and replay. Other approved roles can read permitted shared demo history but gain no review action or new module-navigation permission.

The closed review input includes one UUID operation ID, requirement ID, expected positive requirement version, an explicit Accept/Reject decision and substantive notes of 10–500 characters. Do not preselect a decision. Clients cannot supply model labels, balances, source hashes, review actors, provenance or timestamps. The builder may choose exact command/type names consistently with current patterns.

Before a new Accept, the transaction reads and validates the requirement, reciprocal alert, original supported demo experiment and current active scoped product. Their lineage must match, and the product version/compact facts digest must still equal the original snapshot using its original observation time. A changed, inactive, missing or corrupt product blocks acceptance with a refresh/new-experiment explanation. Acceptance cannot rewrite old facts or substitute the product's new balances. A Reject may close a stale/deleted-product requirement, retaining the original evidence; it still requires valid original experiment/requirement lineage and current authority. Corrupt lineage is unavailable for administrator reconciliation rather than force-rejected.

A valid decision changes Pending/version1 to Accepted or Rejected/version2, saves the notes/reviewer/time and an immutable decision event, and completes its private receipt/audit in one transaction. Terminal requirements cannot be reviewed again or silently revised. A new scenario creates a new experiment/requirement. Different concurrent review operations cannot both decide the same version. An original matching completed operation replays unchanged after later product changes; a different-input reuse fails.

Acceptance means **accepted for demo replenishment review only**. It does not approve a supplier, quantity, purchase order, model, operational forecast or genuine stock condition. No stock, reservation, movement, shipment, supplier, purchase order, expected replenishment or blockchain record is changed.

## Review response recovery

Use a distinct account/scope session-storage key for pending demo reorder reviews; do not migrate or clear any legacy/context/demo inference key. Persist the exact envelope before the command. Storage failure prevents sending. A 35-second observation deadline releases the browser busy state without automatic resend or cancelling server work; late replies cannot erase replaced intent or update a different account/dialog.

Offer **Retry saved demo review** and **Check demo review outcome**. Their command identities must recover the original decision/event or create a durable cancellation tombstone if no review was committed, preventing a delayed original send from applying. Matching recovery requires current local tuple and authority but not the Python service, current product or newly enabled workflow capability. A fresh review requires the capability. Malformed saved input remains intact and blocks another review until reconciled. Independent concurrent inference intent remains untouched.

## Local capability and immutable runtime bindings

Introduce an explicit local demo-reorder capability in a fresh versioned profile, separate from existing demo-product inference admission. Recommended exact form: schema `inventory-local-profile-4.0`, stock protocol `inventory-context-inference-2.0`, stock data mode `demonstration-products` and workflow mode `demo-risk-review`. Backend sets `IILAS_STOCK_DEMO_REORDERS=enabled` only for that exact schema/mode combination. Existing schema1/2/3 profiles and non-backend roles explicitly disable inherited reorder capability; no client acknowledgement can enable it.

New schema4 still selects the same context Python executable and unchanged RF14. Bind capability/policy to the serving configuration fingerprint and freeze whether automatic demo creation was admitted when claiming inference. Removal/change during HTTP produces Unavailable with no alert or requirement. Old receipts lacking this new internal admission state retain existing recovery behavior and never gain retroactive alerts. A fresh schema3 inference-only profile may still run product experiments without creating workflow records; its UI must not promise automatic alerts. A read-only trusted workflow-availability query or equivalent server-owned response supplies current availability without exposing tokens or changing data.

Extend source bindings identically in Node/Python to all changed/new workflow helpers and relevant UI/launcher files. Only the context adapter's serving source list may change in Python; do not modify model/scientific/native supervision bodies, consumed evaluations, resource limits or metrics. Create new immutable stock/parcel metadata and an exclusive profile; preserve old artifacts. Before restarting the one local stack, export and hash-verify then-current emulator state, confirm no active requests, reidentify owned processes, then compare documents/accounts/objects after import. Never restore an older snapshot over newer work.

## Interface

Preserve the navy/purple eight-card dashboard and existing operational alerts. Put a separate **Demo AI reorder review** section in Replenishment & Procurement, alongside the existing threshold-based review. Display the demo origin prominently and do not merge its counts into operational dashboards. Use bounded, owner-scoped 20-row pages with stable timestamp/document-ID ordering and explicit loading/error/empty states; no global unbounded listener. Detail/event reads must also be scoped and bounded.

Each item shows product name/SKU, risk class, original observation/version, Pending/Accepted/Rejected status and the original recorded/fictional input distinction. Details show all eleven facts including both deadlines, model scores, original model/study identifiers, and a link/reference to its experiment and immutable alert. Show the unchanged synthetic study disclosure where model quality is discussed; do not describe model score as probability of a real shortage.

Admin/Manager sees **Review demo requirement**, an unselected decision, notes and **Record demo decision**. Self-review and stale acceptance have clear explanations. Other roles remain read-only under existing navigation. Display accepted/rejected notes, actor/time and immutable event. A risk alert is labelled Demo risk alert; its current review status is derived from its matching requirement so no duplicated mutable status can drift.

The Stock AI screen explains that automatic demo alerts/review items apply only to newly admitted product-bound risk results while the workflow is enabled. It must not claim old results, manual scenarios, Normal or Unavailable outcomes generated an item. Keep existing history/recovery available independently of workflow availability. Desktop, keyboard/dialog focus and 390px layouts retain current patterns. No unrelated UI redesign or extra AI features.

## Verification and acceptance of this step

Contract tests cover exact shapes, false/null provenance, unsupported records, reciprocal lineage, source/feature digests, risk-only policy and no label/ID leakage into predictors. Backend tests cover atomic creation, rollback, duplicate/racing inference, Normal/Unavailable exclusions, missing capability, manual/legacy compatibility, stale/deleted products, roles/scope/self-review, review version races and exact receipt/tombstone recovery. No operational collection may change.

Client/browser fixtures cover explicit decision/notes, storage failure, uncertain response/reload, late/replaced/account responses, all existing inference keys, unsupported rows, pagination, read-only roles, self-review/staleness and desktop/narrow accessibility. Rules tests deny all private receipt access and all direct public writes, including Admin, while preserving existing fixed-scope reads.

Actual local browser → Firebase → frozen RF14 tests must create an owned disposable demo product/risk scenario, verify one reciprocal alert/requirement and worker score/hash lineage, then use a different approved manager to review it with a deliberately lost successful reply/reload/exact recovery. Include Normal/no-item and in-flight product/configuration mutation/no-item outcomes, stale Accept rejection and stale Reject closure. Pick fictional software fixtures without inspecting reserved scientific TEST rows or changing thresholds until a test passes. Exactly clean owned temporary accounts/records and prove baseline preservation.

Run affected contract/client/command/profile/Python tests, all required sequential Firebase regressions on the one configured stack, build/lint, tracked/history/expanded/outer secret checks, source/private artifact hashes, ignore checks and documentation links. Broaden runtime verification only for changed code/failures, never replay the consumed scientific evaluation. Use one fresh final whole-change review under Native execution. Retain local branch/evidence; no staging, commit, push, deployment or production changes.

## Remaining completion requirements

After this step, demo risk notification and manager review can be verified against FR-12/FR-13/FR-21. The full stock goal still needs a separately specified accepted requirement → explicitly created purchase order → issued expected replenishment source link for FR-27, and a declared evaluation/acceptance boundary for the intended population. Synthetic policy agreement must remain separate from independently labelled quality and genuine inventory readiness. Missing real history remains unknown. Camera, delivery AI, optional models and additional features stay deferred.

## Builder choices and review status

The builder chooses compact schema/type/command names, static lifecycle hook placement, reusable compact fact validation, bounded query indexes, pagination/component arrangement and exact private profile/evidence destinations. The builder may not change the risk-only trigger, atomicity, original source/score lineage, independent review, stale-accept fence, durable recovery, demo-only provenance or no-operational-write boundary. Existing stale-product refresh UX can be clarified only where touched; no unrelated cleanup is included.

The fresh read-only builder check returned “nothing important left”. The user approved this written design on23October2026. The six-task Native implementation plan is written/self-reviewed and approved; Native execution is underway. Do not ask again about demo-data origin, design approval, chosen route or execution method.

## Evidence

- [Verified demo-product integration](../../INVENTORY_DEMO_PRODUCT_AI_LOCAL_GUIDE_2026-10-23.md).
- [Current data readiness audit](../../INVENTORY_DATA_READINESS_AUDIT_2026-10-23.md).
- [Stock snapshot and independent label review](../../INVENTORY_STOCK_ASSESSMENT_2026-10-22.md).
- [Account access contract](../../ACCOUNT_ACCESS_CONTRACT.md), [Prepared-Shipment Handover](../../PREPARED_SHIPMENT_CONTRACT.md) and [stock/location correction contract](../../STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md).

Original report hashes remain Wong `5a89babe5d204fbf784c1bb10b3c7634d9012d68d9a294b6574f4d04ed281b93` and Choong `84b297547635d6cc2993de3547c696321baaefee5a0b6a1d5a7fae1a6658de6f`. The saved report paragraphs 1240–1253, 1272–1273 and 1284–1285 supply the inventory FR-7–FR-13/FR-21/FR-27 wording; paragraph544 permits simulated prototype scenarios. No cloud report edit, new dataset or scientific evaluation follows from writing this design.
