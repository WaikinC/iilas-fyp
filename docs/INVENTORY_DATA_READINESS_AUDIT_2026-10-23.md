# Stock AI data-readiness audit — 23 October 2026

## Later status — 24 October 2026

The demo-product, risk/review and linked purchasing implementations below are now complete and verified locally. The user retains AI-assisted prototype labels only; independent quality remains deferred. See the [current completion/readiness/timing audit](INVENTORY_STOCK_AI_COMPLETION_AUDIT_2026-10-24.md). The23October findings and next-step wording below are historical.

The user confirmed that current local IILAS records are **demonstration/test data only**. This audit does not qualify them as warehouse evidence or change their database records. The user then selected **connect selected demo products next**, using recorded balances plus explicitly entered fictional history/demand/supply facts. The new workflow needs its separate written design/implementation; this document records current findings.

## Current evidence

A bounded, read-only selected-scope audit examined 47 products, 192 movement records, five correction links, 26 purchase orders and 20 shipments. Of these products, 44 are active. It read no Auth credentials or private service settings. Source hashes matched across before/after reads, including system configuration. Nothing was added to Firestore.

| Readiness item | Verified finding |
| --- | --- |
| Active products with valid recorded balance assessment | 44/44 |
| Products eligible for explicitly saving a rule-based review snapshot | 44/44; none was saved by this audit |
| Verified complete 30-day history windows | 0/44 |
| Products with an eligible recorded replenishment receipt | 25/44 |
| Known movement-frequency / adjustment-count model features | 0/44; observed events do not certify complete coverage |
| Existing saved stock-review snapshots / review revisions | 0 / 0 |
| Existing experimental stock outcomes in this selected scope | 0; previous automated test outcomes were cleaned |
| Real-product AI readiness | Unavailable for all 44 |
| Independent intended-use labels | None established |
| Dataset origin | Demonstration/test, explicitly confirmed by the user |

No corruption, invalid balance assessment or movement overflow was encountered. Valid recorded demo balances are still not independently reconciled physical stock.

## Mapping the model inputs

| Model inputs | Possible application evidence | Current limitation / required handling |
| --- | --- | --- |
| available_quantity, reserved_quantity, reorder_distance | Product on-hand, reservation and reorder values; existing location-balance contract | All 44 have valid recorded demo values. Derive available as on-hand minus reserved exactly once. Freeze product ID/version and factual digest at the request cutoff. |
| movement_frequency, adjustment_count | Committed product movement events within the full 30-day window | No verified coverage certificate exists. Never replace these unknown model inputs with observed counts or zero. Demo mode may accept explicitly fictional entered values. |
| days_since_replenishment | Latest eligible recorded Receipt, respecting correction links and bounded search | Known for 25 products; missing for 19. A known receipt does not qualify whole-window history. Any fictional demo age must be clearly identified as entered context. |
| additional_firm_quantity, additional_due_days | Cutoff-known additional firm demand and deadline, excluding existing reservations | Existing shipments do not by themselves prove complete additional demand or absence. Draft work is not a firm commitment. Do not count reserved units twice. |
| incoming_quantity, incoming_eta_days | One explicitly stated incoming batch known at cutoff | A PO expected date does not prove an actual ETA or batch completeness. Keep quantity/ETA unknown until supported or explicitly fictional in demo mode. |
| supply_none, supply_planned, supply_confirmed, supply_disrupted | One explicit supply-status statement, one-hot encoded | No automatic PO-status mapping is qualified. Explicit none requires zero units/null ETA; an empty query is not evidence of absence. |

Eleven entered/captured facts yield fourteen model features. In the proposed demo-product workflow, three facts come from the selected demo product and eight remain explicitly entered fictional context. Current manually entered eleven-fact scenarios continue to work.

## What the frozen model evidence supports

The verified RF14 synthetic study remains unchanged: 81.53% accuracy, 0.8080 macro-F1, 79.00% Critical precision and 87.78% Critical recall on 720 scenarios/60 held-out fictional families. The accuracy interval is 78.54–84.86%. Reusing demo records or model suggestions as labels cannot establish independent accuracy. No new fit, TEST replay, seed, label or quality measurement follows from this audit.

The next functional step selected by the user is linking a complete experimental scenario to a demo product, with trusted recorded balances and protected stale-product/recovery behaviour. It does not make existing history complete or enable operational inventory inference. Report-level stock-risk alerts and procurement handoff still require a separately defined accepted decision workflow; the current experiment creates no stock or purchase action.

## Requirements for future independent evaluation

A future cohort must declare its origin and usage rights before admission. Demonstration, AI-labelled synthetic and genuine business cases must remain distinct populations. For a genuine observation, retain a cutoff, verified opening/closing reconciliation and complete movement capture, eligible receipt/correction evidence, additional commitment quantities/deadlines and the stated incoming batch/status. Missing information must remain unknown. Later records must not be used to invent cutoff-known predictors.

Independent reviewers must label frozen cases without seeing the model prediction or AI teaching label. Use Normal, Reorder Risk, Critical Stock Risk or Unresolved, with evidence and a specific likely fulfilment impact for Critical. Repeated observations of the same product/family stay grouped, and related supplier/commitment ancestry must be checked. Freeze sampling/splits, exclusions and metrics before running the frozen model once on the admitted evaluation cohort. AI-assisted prototype labels are not silently promoted to independent labels. A future independent synthetic review could establish only that synthetic population, not warehouse accuracy.

No numeric sample-size guarantee, real-world approval or new 80% claim is inferred. Define precision/recall and uncertainty at the appropriate product/family level before a future study; source scores alone do not approve procurement actions.

## Sources and local evidence

- [Current context integration guide](INVENTORY_CONTEXT_AI_LOCAL_GUIDE_2026-10-23.md).
- [Stock snapshot/history/review contract](INVENTORY_STOCK_ASSESSMENT_2026-10-22.md).
- [Original report-derived simulation scope](../research/INVENTORY_SIMULATION_AND_LABELLING_2026-10-23.md).
- [Prepared-Shipment Handover](PREPARED_SHIPMENT_CONTRACT.md) and [location/correction contract](STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md).

Both saved original reports were re-read for relevant stock/shared-handover requirements. Wong portfolio SHA256: 5a89babe5d204fbf784c1bb10b3c7634d9012d68d9a294b6574f4d04ed281b93. Choong portfolio SHA256: 84b297547635d6cc2993de3547c696321baaefee5a0b6a1d5a7fae1a6658de6f.

Ignored evidence: `outputs/inventory-readiness-20261023/audit-20b0212d-c9d0-47de-8e51-b7808f05318f/audit.json` and its exclusive `origin-confirmation.json`. Only hashed product IDs/aggregate structural findings are retained in the audit; no record values, passwords or private configuration are printed. The audit is bounded to ten 250-row pages per collection and refuses a completeness claim if any read cap is reached. This is a data-readiness audit, not an application release or new model evaluation.
