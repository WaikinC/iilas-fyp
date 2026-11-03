# Inventory stock assessment and reviewed snapshots

Date: 22 October 2026, Asia/Kuala_Lumpur.
Status: approved by the user on 22 October 2026; Native execution approved and local implementation verified. Final runtime/evidence details are in docs/INVENTORY_STOCK_ASSESSMENT_2026-10-22.md and the execution ledger.

## Intent and scope

The user approved the recommendation to make existing stock checks useful with sparse application records, prepare reviewed stock snapshots, and keep public-data model experiments separate. The immediate deliverable is a transparent inventory assessment and explicit snapshot/review workflow in the existing React/Firebase application. It is not demand forecasting, an automatic purchasing system, or an accepted three-class AI model.

The parcel camera trial stays deferred. Preserve all existing local parcel integration, source-bound manifests, private configuration, model/data artifacts, imported business records and the dedicated parcel test shipment. Do not publish, deploy, retrain, access production or change existing inventory balances. Other AI modules and synthetic training data are outside this change. The current approval allows the explicit snapshot workflow described here; it does not authorize bulk harvesting of existing business records into a training set.

Use the specified Random Forest/Decision Tree research stack later. Neither the public binary Backorder benchmark nor FreshRetailNet supplies the report's exact six inputs and three-class truth. Their results remain separately reported; neither model is installed into application inference by this work.

## Existing implementation and approach selection

- `src/features/stock/StockManagement.tsx` already displays available stock, reorder levels and a warning when available is at or below reorder level. Preserve that boundary and existing balance/movement/location controls.
- `backend/functions/service.mjs` currently prepares six inventory inputs for generic `predict`, requires a receipt, and refuses inference when no evaluated tabular service is configured or a parcel-only service is selected. Preserve that refusal and existing parcel configuration.
- `research/DATA_COLLECTION.md` and `research/LABELLING_REVIEW_2026-10-17.md` define current-stock classification, evidence-backed Normal/Reorder Risk/Critical Stock Risk, six inputs, unknown-history handling and product grouping. These are the scientific boundaries for later data admission.
- `docs/ACCOUNT_ACCESS_CONTRACT.md`, `docs/PREPARED_SHIPMENT_CONTRACT.md` and `docs/STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md` govern current approved shared staff, reservations and corrections. Existing balances remain authoritative.

Considered approaches: immediately connect a binary public model (incompatible target/features); wait for extensive local history before providing any assistance (unnecessary for existing reorder facts); extend the existing checks while preparing reviewed snapshots (selected). The third approach provides honest functionality now and a route to later compatible data without changing the report's task.

## Staff experience

Extend Stock Management with a per-product **Stock assessment** action. Reuse its active-product list, existing controls, theme, dialog/focus helpers and notices. Do not add a dashboard card or new top-level module.

The assessment panel shows the product, the server-observed time, on-hand/reserved/available/reorder quantities, observed history coverage and plain-language reasons. A visible heading identifies **Rule-based stock check**. There is no confidence percentage, AI/model name or prediction record for this result.

There are two independent display dimensions:

1. Balance recommendation: **Reorder review** when valid available quantity is at or below the valid reorder level; **No reorder warning** when above it; **Balance needs review** when balances/locations are inconsistent or malformed. Above-threshold stock is not a guarantee of Normal condition.
2. History quality: **History not verified**, **No replenishment receipt recorded**, or the specifically evidenced observations available. The absence of a receipt blocks an AI-ready replenishment feature, not the display of valid balance facts. Missing history never becomes zero days or a confident absence of activity.

Do not automatically assign Critical Stock Risk from a low quantity, zero quantity, negative available quantity, a reservation, or an arbitrary severity threshold. A human Critical label requires evidence of likely fulfilment impact without corrective action. Do not subtract reserved demand twice or treat all Draft shipment quantities as additional firm demand.

An authorised stock staff member may explicitly select **Save review snapshot**. Viewing a product does not save a snapshot, schedule collection or start training. On uncertain submission, recover the original operation before creating another snapshot.

Show paged saved snapshots below the assessment, labelled **Staff review data — not AI predictions**. A different Admin/Manager can inspect the frozen snapshot, record one of the report's labels or mark it **Unresolved**, and supply an evidence-based reason. Show the reviewer, time and revision history. Human labels may disagree with the rule recommendation; the form must not preselect a risk label or automatically copy the recommendation into a label.

## Snapshot contents and feature meaning

The trusted backend reads application records itself. Client inputs select the product and request identity; they cannot supply balances, features, observation time, history completeness, scope, actor, recommendation, training eligibility or source version.

Each saved snapshot binds:

- Fixed scope, generated snapshot ID, product ID/group, product version, minimal product name/SKU reference, server observation/cutoff time, rubric `inventory-stock-rubric-1.0`, feature definition `inventory-stock-snapshot-1.0` and rules `inventory-reorder-check-1.0`.
- Validated on-hand, reserved, reorder level and location-consistency facts; exact `available_quantity = quantityOnHand - reservedQuantity` and `reorder_distance = available_quantity - reorderLevel`. Do not clamp an inconsistent negative balance into a reassuring zero.
- The preceding 30-day interval `[cutoff - 30 days, cutoff]`, observed movement/adjustment counts, last eligible receipt reference/time where established, quality issues and immutable references/digest of the inputs used. No customer details, credentials, file bytes or free-form whole-record exports.
- Exactly the six prospective model fields: available quantity, reserved quantity, movement frequency, reorder distance, adjustment count and days since replenishment. Unknown history-dependent fields are `null`, with explicit reasons. Observed partial counts live separately from certified model features.
- `method: rules`, the balance recommendation and reasons, initial human label `null`, initial review state `Pending`, and `trainingEligibility: NotAssessed`.

For observed movement frequency, freeze the current application convention: count committed ledger records in the window, including Receipt, Issue, Adjustment, Reservation, Release, Transfer and Correction. Adjustment count counts `type === Adjustment`; corrections are disclosed separately and do not silently rewrite old events. These describe recorded activity, not sales or inferred demand. A future feature-definition change requires a versioned dataset protocol.

Days since replenishment may be derived only from a valid, non-reversed actual Receipt at or before the cutoff. Missing/malformed timestamps, ambiguous legacy entries and receipt corrections remain explicit quality holds. A newly recorded receipt does not certify the earlier 30-day window. The earliest available event, product creation date and a zero query count do not prove complete history. This phase does not introduce a staff checkbox that can silently promote history to verified.

The 30-day history query has a limit of 2,000 records for the selected product and time window. Read one extra row to detect overflow; never silently truncate into a complete feature vector. To find the latest eligible receipt outside that window, query at most 21 Receipt candidates in descending timestamp order and inspect their scoped correction links; accept the first valid non-reversed receipt within the first 20, or mark the replenishment feature unknown if that bounded search is exhausted. The extra candidate detects incomplete search, not permission to select a convenient older receipt. An overflow in the movement window or corrupt source stops snapshot capture with an actionable explanation, while valid current-balance display can remain available. Query cost, timestamp bounds and any required indexes are verified before implementation is accepted. Capturing one product must not scan every stock movement or every shipment in the system.

## Trusted operations and storage

Use a separate backend module and canonical validation/calculation helpers, called through the existing `workspaceCommand`/trusted command entrypoint. Proposed operations:

| Operation | Purpose | Roles |
| --- | --- | --- |
| `getInventoryAssessment` | Read current facts, history quality and recommendation, without a business write | Admin, Manager, Inventory, Warehouse |
| `captureInventorySnapshot` | Atomically create the frozen snapshot and idempotent operation receipt | Admin, Manager, Inventory, Warehouse |
| `resolveInventorySnapshot` | Recover only the caller's exact capture operation; never create a fresh capture | Same currently authorised roles |
| `reviewInventorySnapshot` | Append an evidence-backed human review revision with optimistic concurrency | Admin, Manager; reviewer differs from snapshot creator |
| esolveInventoryReview (execution amendment) | Recover or close the original human-review operation without creating a replacement label | Admin, Manager |

All operations derive current approval, actor and fixed data scope from protected configuration. Recheck active Approved membership and role inside transactions, including replay/review. Reject foreign-scope, inactive/archived/missing products, unknown fields and client-forged facts. Review of an old snapshot concerns that time only; it does not assert that the present stock is unchanged.

Use `inventoryRiskSnapshots` for public safe frozen payloads plus current review summary, `inventoryRiskReviews` for immutable review revisions and `inventoryRiskRequests` for server-private capture/review operation receipts. Receipt keys bind action, scope, actor and operation ID so capture and review cannot alias. Shared reads use current Approved fixed-scope rules, consistent with the operational stock records; all direct client writes are denied. Private receipt reads/lists/writes are denied even to Admin clients. Add explicit rules and only the required compound indexes.

Capture input is an exact product ID, expected product version and UUID operation ID. The receipt binds scope/actor/operation plus canonical command hash; replay returns the same snapshot, mismatched reuse fails, and an unknown outcome never silently becomes a replacement snapshot. Persist the pending capture identity scoped to account/system in the browser; changing account/scope must not reuse it.

Perform coherent source reads and the snapshot/receipt/audit commit transactionally, with a fixed observation cutoff for the successful attempt and no reads after writes. Concurrent product/ledger mutations must retry or reject stale capture rather than combine incompatible versions. All stock and warehouse mutation paths currently increment product version; tests must confirm this assumption for the paths used by capture. Keep command payload/output bounds explicit and fail closed if the transaction's read budget cannot support the query.

Review input contains snapshot ID, expected review version, UUID operation ID, one of the three labels or Unresolved, a reason and evidence references. Use optimistic version checks and exact idempotent replay: duplicate delivery cannot append duplicate review revisions, and reused request IDs with changed content fail. Preserve frozen features and previous revisions. Updating a label requires a new append-only review revision; it must not erase the original judgement. Evidence references are selected from scoped existing records or bounded local review notes, and do not claim automatic truth verification.

The review stores `labelSource: human`, reviewer identity/role, rubric version, evidence/reason and server review time. Require a substantive reason and a reason describing likely fulfilment impact for Critical. This is a recorded declaration, not proof that a reviewer is an independent expert. No label changes stock, reservations, shipments, purchases, AI acceptance or operational predictions.

## Training and evaluation boundary

Reviewed snapshots are candidate data only. This phase implements no automatic trainer, background harvest, synthetic generator, dataset export, model activation or numerical accuracy claim. Leave `trainingEligibility: NotAssessed` after review; later admission checks rights, historical completeness, label adjudication, class support and product/time separation.

Before future fitting, define and review the population, labels, evidence quality and evaluation plan; keep repeated snapshots of a product in their declared groups. Split before fitting/tuning, keep future information out of earlier features, evaluate Normal/Reorder/Critical separately and compare RF, DT and the rule baseline. Do not evaluate the model solely against labels generated by the same reorder rule. Public Backorder/FreshRetailNet results remain separate source-task evidence.

## Preservation and verification requirements

Implementation must preserve the current dirty worktree; no reset, automatic staging/commit/push, original history merge, existing data migration or production change. Backend changes overlap parcel `service.mjs`, so inspect its manifest source binding first: changing a bound source must not be papered over by editing an existing manifest or old evidence. Preserve old configuration/artifacts; if local parcel readiness is affected, prepare a reviewed fresh immutable manifest/config and a state-preserving controlled restart, or leave the parcel service explicitly unavailable with that consequence reported. Never report the old pin valid after source edits.

Required meaningful verification:

- Calculation/validation checks for reservation subtraction, equality at reorder level, zero values, malformed/negative/inconsistent balances, location integrity, missing receipt, partial/unknown window, corrected receipt, future timestamp and record-cap overflow.
- Trusted command and real emulator checks for current roles/scope, direct-write/private-receipt denial, atomicity, concurrent stock change, exact replay/mismatched reuse, uncertain-response recovery, review version races, self-review denial, append-only revisions and immutable frozen features.
- Verify labels cannot become generic AI predictions, confidence scores, purchases, stock changes or automatic training admission. Prove the existing tabular Unavailable gate and parcel experimental boundaries remain intact.
- Run original smoke and QA scripts plus affected shared/account/stock/retry suites sequentially against one configured loopback emulator stack. Do not start a second stack through npm wrappers. Preserve a before/after hashed inventory and remove only attributable synthetic fixtures; retain original Admin IDs, balances, accounts, objects and the parcel handoff fixture.
- Browser checks at desktop and 320px for sparse histories, valid reorder warnings, explicit snapshot creation, unresolved/independent review, reload/replay, readable reasons, keyboard focus and no camera opening.
- Build, lint, expanded source credential checks and diff checks. Run history/staged checks only if later publication is separately requested. No full research retraining or consumed TEST replay is needed for this application change.

Update the account/data contract, relevant requirements/traceability, README staff instructions, roadmap and MSI/archive handover with actual results and remaining scientific limits after implementation. Reuse existing navy/purple components and the eight-card dashboard. Keep test records, local data, private configuration and artifacts out of GitHub.

## Completion criteria for this change

The change is ready when staff can obtain an honest current-stock check with sparse history, explicitly capture an immutable recoverable snapshot, obtain an attributable independent staff review, and retain that distinction from AI under the tested role/race/replay rules. It must work without Python/tabular model configuration and make no automatic inventory or procurement change.

This completes the sparse-record application preparation. It does not complete the report's trained three-class inventory AI or its independent accuracy evaluation. Those remain a later evidence-qualified training and integration task.

## Design self-review

Checked against the source contracts and existing screens: balance advice and model labels are separate; unknown history is preserved; review is not automatic training admission; reservation demand is not counted twice; replay and append-only review have explicit rules; no new dataset acquisition or synthetic permission is inferred; parcel source-binding consequences and baseline preservation are included. No unresolved placeholder, invented success metric or required cloud service is introduced. User review of this written design precedes implementation planning under the selected architectural workflow.

## Execution amendment: explicit human-review outcome resolution

Independent review found that a stale-version/evidence rejection could strand a saved human review because retry alone cannot close an unapplied operation. The Native executor added `resolveInventoryReview` with the exact original validated ReviewInput and existing Admin/Manager authority. It recovers the original committed revision or atomically creates a Cancelled receipt, fencing late retries without recording a label or changing frozen facts. The UI exposes Check saved review outcome. This is a ledgered correction to the approved recovery intent, not a new AI feature or a claim of additional user approval. Covering failures were observed before the fix; actual Functions/browser verification includes the resolved path.
