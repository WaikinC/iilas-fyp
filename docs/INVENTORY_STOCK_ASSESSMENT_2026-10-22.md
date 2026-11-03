# Inventory stock checks and reviewed snapshots

22 October 2026, Asia/Kuala_Lumpur. Local implementation is verified on MSI; no production deployment or publication is authorised.

## Purpose

This workflow helps staff use existing inventory facts when transaction history is sparse. It extends the existing reorder warning and prepares explicit human-reviewed candidate snapshots. It does not activate a trained Random Forest, forecast demand, estimate model accuracy, automatically order stock or change quantities.

Open Stock Management, find an active product and select **Stock assessment**. Admin, Manager, Inventory and Warehouse staff can request the trusted assessment and explicitly save a snapshot. Existing Viewer stock access remains read-only; it does not grant assessment/capture commands. Approved shared staff can read permitted saved snapshot/review records under the same fixed data scope.

## Current stock check

The backend reads the product and bounded ledger itself. The client supplies no balance or feature values. Available stock is on hand minus reserved; reorder distance is available minus reorder level. At or below the reorder level produces **Reorder review**. Above it produces **No reorder warning**, not a certified Normal condition. Inconsistent balances or bins produce **Balance needs review** and prevent capture until reconciled. Reservations are subtracted once and unrelated Draft shipments are not counted as firm additional demand.

The panel identifies this as a **Rule-based stock check**, with reasons and observation/product-version information, rather than an AI label or confidence score. Viewing, refreshing or reopening the panel creates no snapshot.

## Sparse history and six prospective model inputs

| Field | Meaning in this version |
| --- | --- |
| available_quantity | Valid recorded on-hand minus reserved quantity |
| reserved_quantity | Valid recorded reservation quantity |
| reorder_distance | Available quantity minus reorder level; a negative distance is valid |
| movement_frequency | Null until complete window coverage is qualified; observed ledger count is shown separately |
| adjustment_count | Null until complete window coverage is qualified; observed Adjustment count is shown separately |
| days_since_replenishment | Days since the latest eligible recorded Receipt if established, otherwise null |

The 30-day window includes committed Receipt, Issue, Adjustment, Reservation, Release, Transfer and Correction records. These are movement events, not demand/sales quantities. Corrections are shown separately and do not silently erase original history. Missing or ambiguous replenishment history remains Unknown, rather than zero days. A valid receipt today does not establish complete earlier history.

Current coverage is explicitly **Unverified**. Neither an old product creation date nor an empty query certifies complete history. A future dataset-admission procedure must qualify the observation window; this workflow supplies no checkbox that can silently make records training-ready.

Window reads are scoped to a product and limited to 2,000 records, with an extra row detecting overflow. Overflow/corrupt source blocks snapshot capture instead of silently sampling. The latest eligible receipt search is separately bounded. No global ledger or shipment scan is used for the assessment.

## Save and recover a snapshot

1. Inspect the displayed stock facts/history quality; refresh if the product has changed.
2. Select **Save review snapshot**. This freezes the server-observed facts, source references/digest, product/group/version, cutoff, rule/feature/rubric versions and creator.
3. If the reply is uncertain, keep the pending request. Use **Check saved snapshot outcome** before creating another. The same actor/system/operation identity recovers its original capture; an uncommitted operation is closed so a late send cannot create replacement data.
4. Saved snapshots remain historical after later receipts, reservations or adjustments. They do not change existing products, ledger entries, purchases or shipments.

Browser session storage holds only the pending command identity/content for safe retry. If storage is unavailable or the saved request is malformed, stop and reconcile it; do not clear browser data as a substitute for checking the outcome. Changing account or scope does not grant access to another staff member's pending request.

## Human labels

A different Admin or Manager selects **Review snapshot**, examines the frozen observation and records a condition with a substantive reason/evidence notes. The condition is not preselected. Optional references must be scoped stock movements, shipments or purchase orders related to that product.

- **Normal:** evidence supports acceptable current stock operation and routine monitoring.
- **Reorder Risk:** evidence supports reviewing or initiating replenishment without sufficient evidence for urgent fulfilment impact.
- **Critical Stock Risk:** evidence supports likely fulfilment impact without corrective action; describe that impact explicitly. Low quantity alone does not establish it.
- **Unresolved:** available evidence does not support a definitive condition. The model label stays null.

Review changes append an attributable revision and update the current review summary without changing frozen facts or erasing previous judgements. Each revision has its own exact retry identity/version. If the reply is uncertain or the request was rejected, use **Check saved review outcome**: it recovers the original revision or closes an unapplied operation without recording a label. Refresh the snapshot before submitting a new judgement. A late retry cannot reopen a closed operation. Self-review is denied even for Admin. A staff judgement is a recorded observation, not proof of expertise, supervisor approval or model correctness.

All reviewed records retain **Training eligibility: NotAssessed**. No trainer, export, background collection or inference activation runs automatically. Later research must qualify rights/coverage/labels, keep related product observations in declared groups, choose splits prospectively and compare RF/DT against the rule baseline on independently labelled evaluation data. Public Backorder and FreshRetailNet scores remain separate binary research results.

## Trusted data and preservation

The backend owns inventoryRiskSnapshots, inventoryRiskReviews and private inventoryRiskRequests. Clients cannot directly write any of them or read/list private receipts. Current approval, role, scope and concurrency conditions are checked in trusted transactions, including replay. Human-label review does not produce generic AI predictions or operational damage/risk alerts.

Existing Admin IDs, stock balances, personal inventories, warehouse allocations and Prepared-Shipment Handover remain authoritative. Software tests use disposable local records and compare complete before/after hashes. Captured business records, exports, datasets, models, private configuration and QA receipts stay out of GitHub.

The shared backend is also included in the parcel experimental source manifest. A backend change invalidates that old manifest; preserve it and create a fresh reviewed metadata pin/config before claiming parcel runtime readiness again. This task does not run a physical camera, retrain a model or replay consumed research TEST images.

## Verification record

The execution ledger and immutable local reports are under `.superpowers/sdd/2026-10-22-inventory-stock-assessment-and-review/` and `outputs/inventory-risk-20261022/` respectively. Controlled helper/transaction/client checks and synthetic browser tests are separate from real Auth/Functions/Firestore/rules/browser evidence. See the final handoff status for terminal regression/review outcomes and any remaining limitations; an implemented screen alone is not evidence of complete three-class AI.
