# Accepted demo requirements through purchase orders to incoming stock

24 October 2026. Approved next core stock workflow. The user selected **Use existing purchase orders with clear demo lineage** and approved this written design on 24 October 2026. Native execution remains their preference. Its [implementation plan](../plans/2026-10-24-inventory-demo-procurement.md) was approved by the user on24October; all six Native implementation tasks and local terminal verification are complete.

## Intent and report basis

Complete the demonstration chain from an accepted stock-risk requirement to a staff-prepared purchase order and an expected replenishment record. Staff must see where the order came from, make their own supplier/quantity/cost/date decisions, obtain separate purchase approval and record issue/receipts without losing the original evidence or duplicating an uncertain request.

Wong's original report requires authorised reorder review (FR-13/FR-21), validated purchase details (FR-24), manager approval (FR-25), recorded supplier issue with simulated external communication permitted (FR-26), and an expected replenishment record **after issue**, traceable to the original requirement (FR-27). Source paragraphs1252–1253,1272–1285 and544 were rechecked against the original portfolio SHA256 `5a89babe5d204fbf784c1bb10b3c7634d9012d68d9a294b6574f4d04ed281b93`. The Choong portfolio SHA256 remains `84b297547635d6cc2993de3547c696321baaefee5a0b6a1d5a7fae1a6658de6f`; its shared inventory/logistics boundaries remain intact.

The existing purchase flow already validates suppliers/items/cents/dates, requires a different Admin/Manager for approval, records issue and receives whole-unit partial deliveries atomically with location-aware stock movements. It has no reorder-source field or persisted expected-replenishment collection. Its generic submit helper also has no exact uncertain-response recovery. The previous six-task demo alert/review implementation is complete; do not repeat its approvals, training or consumed evaluation.

The user confirmed all current inventory is demonstration/test data. This step remains local and demonstration-only. It does not qualify the model for genuine stock decisions. No production deployment, migration, supplier email, model retraining, independent-class labelling, camera work or other AI model is included.

## Approaches and selected route

1. **Existing purchase flow with explicit demo lineage — selected by the user.** Reuse the actual Submitted/Rejected/Approved/Issued/PartReceived/Received/Cancelled lifecycle, add a trusted requirement link and expected record, and retain separate human purchase decisions. This closes the application integration without maintaining another purchasing engine.
2. **Separate demo-only purchase lifecycle — not selected.** Isolates the whole simulation, but duplicates approval/receiving logic and gives less evidence that the existing application modules work together.

The calls below about one-product orders, permanent links and recovery were the builder's proposed defaults and are included in the user's written-design approval.

## Staff experience

An approved Admin, Manager or Inventory staff member opens an **Accepted** demo requirement in Replenishment & Procurement and chooses **Create demo purchase order**. This is an explicit action, never a side effect of risk prediction or accepting a requirement. Pending, Rejected, unsupported, stale or already-linked requirements cannot create another order.

The form identifies the accepted requirement, its review and frozen product facts. It uses the existing purchase editor and asks staff for a unique purchase reference, active supplier, quantity, MYR unit cost and expected date. The linked product is fixed; quantity, cost, supplier and date are human-entered and are not filled from an AI risk score, fictional demand or an inferred shortage. No hidden suggested quantity is introduced.

Submission creates a normal **Submitted** purchase order with a prominent **Demo stock-AI source** label. A different Admin/Manager must approve the purchase order under the existing policy, even if the requirement was already accepted. The requirement reviewer and PO reviewer may be the same person when they differ from the PO requester; accepting a requirement does not grant approval of a PO. The original experiment author may perform a role-authorised purchasing action, but cannot approve a PO they submitted.

Issue retains the existing acknowledgement that the approved order has been sent; the prototype records/simulates that event and sends no external message. Only issue creates an expected-incoming record. Partial/full receipts use the existing explicit receiving form and location-aware stock transaction. A receipt changes the selected demonstration product balance only when authorised staff deliberately record delivered units. Requirement acceptance, submission, approval and issue change no stock.

The order, its history, requirement detail and expected-incoming view show reciprocal references and the demo source. Historical/manual orders display that they have no linked demo requirement; they are not retroactively attributed to one. Keep the current navy/purple interface, eight-card dashboard, role navigation and existing manual purchase workflow.

## Trusted source and one-order linkage

New creation must verify the reciprocal alert, supported original version3 experiment, Accepted/version2 requirement and its exact immutable Accept event. Check the event ID, operation, actor, decision, notes and timestamp against the requirement review summary, and retain the existing source/scenario/features/prediction/hash comparisons. A plausible ID or a separately valid event shape is insufficient. Reuse this correlation check in the touched requirement-event presentation so contradictory retained events show unavailable for reconciliation; this addresses the previous deferred correlation minor as part of the source-proof boundary.

Capture the current active scoped product at the requirement's original observation time and require its version/compact-fact digest still to match before the first linked order is submitted. A changed product requires a fresh analysis/review; do not rewrite the old accepted requirement or substitute current facts silently. Once the purchase exists, normal product evolution does not invalidate its historical source. Subsequent approval/issue/receipt uses existing current-product/supplier validation, not equality with the original stock balance. Otherwise the first partial receipt would prevent later receipts.

Use one immutable `inventoryDemoProcurementLinks/{requirementId}` record per accepted requirement, pointing to one purchase ID. Keep the original alert/requirement/experiment and review schemas unchanged; do not append purchase fields to their closed records. The PO contains a closed server-built `demoReorderSource` snapshot with the reciprocal IDs, accepted review/event identity, frozen product/source and input/model identities needed to verify the link. Copy no private configuration or whole training data.

Proposed scope is one product line and one PO per requirement. Corrections/resubmission may change supplier, quantity, price and expected date for that same product, following existing reset-of-approval behavior. Additional products cannot be added to a linked order. A cancelled order keeps its permanent link and history; a replacement needs a new explicitly reviewed requirement. Do not silently release the link, substitute another order, split one requirement across orders or merge unrelated requirements in this first implementation.

Different operations or users racing to create from the same requirement cannot create two orders. A matching operation replays its original result. A different operation that finds the permanent link reports that an order already exists and lets authorised staff view it; it cannot adopt another actor's private receipt. The unique purchase-reference and delivery-note locks remain in force, including the existing legacy-reference collision checks.

## Expected replenishment record

For a newly linked PO, create `expectedReplenishments/{purchaseOrderId}` atomically on Issue, with a closed versioned schema. It includes owner/order/link/requirement/review/experiment identity, product and supplier display snapshots, ordered/received/outstanding whole-unit quantities, expected date, current order version, state, timestamps and explicit demo origin. The original model provenance remains nested and false/null for model operational approval, independent validation and acceptance. Human PO status Approved is a separate workflow decision.

States are **Expected**, **PartReceived** and **Received**. Outstanding equals ordered minus received, is never negative, and becomes zero at full receipt. Every receipt updates the PO, stock/location/movement records, PO event, expected record and private operation receipt in the same transaction. Preserve the Received record and its original source; do not delete it. No incoming record exists for Submitted, Rejected, Approved or Cancelled orders. Cancellation is still limited to unissued orders. An inconsistent existing expected record must fail closed, not be repaired or deleted silently.

Present expected incoming as outstanding quantities for linked Issued/PartReceived orders; Received remains historical. An overdue expected date is a display condition, not proof that goods arrived or that a supplier confirmed a real delivery. Do not feed these demonstration records into genuine model-readiness claims or automatically convert them into new model inputs.

No backfill is included for historical or unlinked orders, including already-issued ones. Their existing expectedDate/history behavior remains unchanged. This step covers FR-27 for the selected demo-stock chain, rather than inventing original requirements for legacy purchases.

## Recoverable submission and linked purchase actions

Give the new linked workflow exact account/scope-bound operation recovery for creation and subsequent Resubmit/Approve/Reject/Issue/Cancel/Receive actions. Reuse the same purchase transition implementation; do not maintain parallel copies of financial/stock validation. The existing public purchase command must not bypass the linked-order recovery/source checks: route linked orders through the trusted linked path or reject with a clear recovery instruction. Unlinked order inputs/behavior remain compatible.

Use a closed UUID operation envelope discriminating Create from an existing PO action, with canonical input and a server-private `inventoryDemoProcurementRequests` receipt identity. Creation carries the requirement/version/accepted-event expectation and explicit purchase details. An action carries the existing PO ID/version/step-specific fields. Actors, scope, provenance, computed totals, stock balances and source snapshots are server-derived. The builder defines exact names/types consistently with shared validators.

All work is database-only and completes in one authoritative transaction; there is no model HTTP, supplier HTTP or deferred worker inside it. Read the private receipt first after authority checks. Matching Completed/Cancelled replay precedes current PO/product/capability checks; it returns the original outcome even if the current PO later advances. The interface refreshes current state separately and does not present an old replay status as the latest PO status. An altered operation envelope fails.

Resolve with the exact saved envelope recovers a matching terminal result or creates a durable Cancelled tombstone before a delayed original send. Cancellation here means no action for that operation; it is distinct from the PO's Cancel action. It does not cancel an already committed purchase action. Current action-specific role, account approval, fixed scope and local tuple are always required, including replay. Recovery does not require Python, current model metadata, current product, current purchase state or the creation capability.

Use a separate session-storage key from review and all three inference keys. Save before sending; storage failure prevents submission. Preserve the existing35-second observation/recovery behavior, exact-envelope clearing and account/selection/unmount/replaced-key fences, including client activation/disposal epochs. A malformed envelope remains intact and blocks another linked action for reconciliation. A single pending linked operation blocks another in that account/tab until resolved; no cross-device coordination promise is added.

Concurrent different action operations at the same PO version have one winner. The loser cannot repeat stock receipt or issue. Failed transactions roll back the link, order/event, expected record, stock/movements/audits and private result together. All database reads, including new lineage/expected/receipt reads, must finish before the first write. Preserve the existing final authority checks across transaction retries.

## Local capability, authorization and provenance

Prepare a new explicit local profile version for demo procurement, preserving all existing schemas and disabling inherited procurement capability in older/non-backend roles. Recommended schema5 retains context protocol and demonstration-products mode, enables the existing demo-product/reorder flags and a new demo-procurement flag, and selects the same frozen RF14 service. Define a closed workflow mode consistently in the plan.

New linked creation requires the exact local emulator tuple, fixed scope, current Approved active procurement role, Accepted source, no existing link and the creation capability. Recheck creation capability/policy after final reads on every transaction attempt, immediately before writes. Source validation must not require a live Python request. Capability availability describes configuration, not model health or accuracy.

Existing linked PO transitions may continue under their normal action-specific roles and exact local tuple after the creation capability is disabled, so an admitted demonstration order is not orphaned. They require valid original link/source plus current transition checks, but not a functioning AI service. The local tuple is required for every new linked action and recovery; a demo-linked PO cannot be acted on through a production/unlinked bypass.

Approved fixed-scope staff may read public links/expected records under existing navigation permissions. Direct client writes are denied, including Admin; all private receipt access is denied. Preserve all independent-approval policies, the selected initial Admin, current IDs/balances, warehouse allocations and Prepared-Shipment Handover. No mass migration or new user accounts are part of implementation; tests use exactly cleaned disposable fixtures.

The source remains synthetic/demo/evaluation-only after human purchase approval, issue or receiving. No generic prediction, independent human model label, blockchain acceptance or genuine-readiness promotion is created. Existing result/model hashes and scientific files remain immutable; no consumed TEST is reopened.

## Interface, bounded reads and verification

Keep the20-row owner-scoped requirement queue. Fetch accepted source/link/review proof only on selection, with generation/account/lifetime fencing. The new expected-incoming view uses bounded owner-scoped20-row pages and stable cursors. New history/source lookups are by known IDs or bounded scoped queries; do not add another unbounded global subscription or per-row model/history fanout. Existing purchase-list queries are not an unrelated pagination refactor.

Show pending recovery outside dialogs and keep it available when source/product/capability is unavailable. Show unsupported or inconsistent saved records as unavailable without erasing evidence. New actions require explicit confirmation and required fields; preserve keyboard focus, escape/busy behavior and390px layout. Clear labels distinguish submitted purchase, approved purchase, issued/expected incoming and physically received units.

Verification covers closed source/envelope schemas, accepted-event correlation, stale creation, one link/order under concurrent creates, uniqueness, roles/scope/self-approval, altered/late/replayed operations, unmount/account-roundtrip, disabled-capability recovery, all linked transitions and partial/full receipts. Inject failures at each write boundary to prove atomic rollback and enforce reads-before-writes. Test legacy/unlinked compatibility and that no original record is backfilled.

Actual emulator/browser evidence must include a frozen-RF demo risk result, independent accepted requirement, explicit linked PO preparation, separate PO approval, issue, expected record, partial/full receipt with exact balances/locations/quantities/source hashes, lost-successful-ack/reload/exact same operation, private/direct-write denials and exact fixture cleanup. This is software evidence, not a new accuracy sample.

Bind changed/new runtime helpers and relevant UI/client/profile code identically in Node/Python serving-source arrays. If shared router pins change, prepare metadata-only parcel bindings too. Use fresh immutable manifests/exclusive profiles and export/hash-verify then-current emulator state before the controlled one-stack cutover. Reidentify processes; never overwrite old profiles/checkpoints or restore older state over newer work.

Run build/lint/no-new-warning gate, affected unit/HTTP/runtime tests, actual new and prior stock workflows, original sequential Firebase regressions, desktop/narrow checks, tracked/history/expanded/outer secret scans, protected/private hashes, generated-copy/ignore/doc-link checks and one final independent review. Select the affected Python/full-suite scope from actual runtime-body changes; do not repeat scientific evaluation for application verification. Preserve the approved local checkout/no-publication preference and the ignored Native evidence.

## Builder latitude and approval status

The builder owns helper/file extraction, exact closed field/command names, indexes, shared transaction factoring, test harness layout and error wording. They may not change the selected existing-PO route, one-product/permanent-link default, human-only purchasing decisions, exactly-once recovery, expected-record timing, local/demo boundary or legacy compatibility silently. Reflect material changes back in this design before planning.

The fresh read-only builder check returned **nothing important left**. The user approved this written design on 24 October 2026. The six-task Native implementation plan is prepared and self-reviewed; the user approved the plan and Native implementation is underway. No product code, dependency, model, profile or business data was changed to prepare these documents. Do not repeat the already approved design, selected route or execution preference. The full stock objective remains incomplete, with independent intended-use evaluation and genuine-history qualification still outstanding.

## Current-state audit and verification of this design

A scoped read-only audit on24October verified47products,192movements,26purchase orders and91purchase events. Orders are9Received/4Submitted/9Cancelled/4Approved; none has a reorder-source field. There are zero retained AI experiments, demo reorder requirements, proposed procurement links or expected replenishment records in the selected scope. These are current baseline records, not new test fixtures. Two reads produced the same digest; no database write occurred. The current purchase validator explicitly rejects a sourceRequirementId field, confirming that source-linked creation needs an implementation rather than UI prefill alone. Evidence stays ignored under outputs/inventory-demo-procurement-20261024/audit-24cf701e-0f25-4da2-83f4-72ee5bab154c/.

Current contracts: [demo reorder guide](../../INVENTORY_DEMO_REORDER_LOCAL_GUIDE_2026-10-23.md), [account access](../../ACCOUNT_ACCESS_CONTRACT.md), [stock locations/corrections](../../STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md) and [Prepared-Shipment Handover](../../PREPARED_SHIPMENT_CONTRACT.md). No current service/profile/weight or product source was changed during design.
