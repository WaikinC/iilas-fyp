# Stock-history readiness audit

23 October 2026. Read-only inspection of the running MSI Firebase emulators for `fyp-inventory-and-logistics`, at 10:14:21–10:14:26 UTC (18:14 Malaysian time). This is a local-record audit, not an inspection of production or proof that the records represent genuine warehouse activity.

## Findings

| Evidence in the fixed shared scope | Observed result | Interpretation |
| --- | --- | --- |
| Product records | 47 total; 44 active, 3 inactive | Only the 44 active products were assessed. |
| Balance-derived predictors | Available quantity, reserved quantity and reorder distance known for all 44 | Consistent recorded values; physical stock was not counted. |
| Recorded movements | 192; all in the current 30-day window; 16 Adjustments | Observed counts do not prove all activity was recorded. Every active product has some observed movement. |
| Verified 30-day coverage | 0 of 44 | Movement frequency and adjustment count correctly remain null in model inputs. No product has a recorded movement older than the window; an older timestamp alone would still not establish coverage. |
| Eligible recorded replenishment | 25 of 44 | Receipt age is available for these products; it does not qualify the entire history. The remaining 19 have no eligible receipt recorded. |
| Recorded consistency / capture eligibility | 44 of 44 | No detected error prevents capture. This is not dataset admission. |
| Rule-based reorder check | 8 Reorder review; 36 No reorder warning | Neither result is an independently reviewed three-class condition label. |
| Saved stock snapshots / review revisions | 0 / 0 | No local snapshot-based label cohort is available for qualification. |
| Operational stock-AI readiness | Unavailable for all 44 | Current code deliberately keeps this route closed pending history and model qualification. |

The raw scoped ledger audit found zero non-Firestore/missing timestamps, future timestamps at the audit cutoff, unsupported movement types, missing scoped product references or missing positive product versions among these 192 records. These checks inspect rows a date-filtered assessment might omit. They establish only the listed checks, not exhaustive replay/reconciliation or complete provenance.

The scope also contains five correction links, 20 shipments and 26 purchase orders. Their presence establishes neither a commitment/supply label nor its timing, authenticity, completeness or relevance at a historical cutoff. Other personal inventories were not queried or merged. This document includes no raw business values, names, IDs, private configuration, labels or datasets.

## Qualification evidence register

| Required evidence | Current status | Next evidence needed |
| --- | --- | --- |
| Genuine activity and permitted research use | Unverified | Documented source/owner declaration and collection procedure. Emulator residence and realistic names are insufficient. |
| Opening position and complete event coverage | Missing | Reconciled starting position and evidence of every relevant Receipt, Issue, Adjustment, Reservation, Release, Transfer and Correction through the full 30-day cutoff, including zero-activity periods and import/outage exceptions. |
| Correct balances and actual replenishment | Partially supported by stored consistency checks | Reconcile physical/source records, preserve corrections and establish the latest eligible actual Receipt. Opening stock or a planned purchase cannot substitute for a Receipt. |
| Independent current-condition labels | Missing | Evidence-backed Normal, Reorder Risk or Critical Stock Risk; retain Unresolved. Critical requires likely fulfilment impact, not low quantity alone. Keep model scores and teaching-policy labels out of independent judgement. |
| Research grouping and prospective evaluation | Not admitted | Group repeated product observations, prevent duplicate/cutoff leakage, freeze admission, split, rubric, reviewer/adjudication procedure and acceptance criteria before evaluation. |
| Operational model acceptance | Not established | Independently evaluate the appropriate frozen model, including Critical recall and Critical-as-Normal errors, then separately authorise integration/acceptance. |

An old creation date, clean query, successful snapshot capture or review does not certify complete history. Existing snapshots retain `trainingEligibility: NotAssessed`. The current review screen is an operational evidence workflow, not blinded evaluation. Separate accounts do not prove independent expertise; scope/product checks of references do not prove evidentiary sufficiency.

If historical coverage cannot be established, genuine collection starts at a reconciled observation boundary and continues through a complete window. Do not backdate that boundary, mark unknown values zero, synthesize missing real movements or change stock to create training cases. Row counts or thirty elapsed days alone cannot guarantee qualification.

## Next stock work

The approved simulation route remains useful while genuine history is unavailable. The integrated RF experiment stays available for complete fictional scenarios. Its frozen synthetic result remains 75% accuracy and 45% Critical recall, with nine Critical cases classified Normal. This audit adds no model-quality measurement and does not promote the Decision Tree into the main model.

Two core work streams remain:

1. Prepare a prospective Critical-risk improvement experiment using development evidence. Investigate the mismatch between the six predictors and commitment/supply context used by teaching labels. Agree any feature/rubric change and evaluation protocol before fitting or releasing fresh evaluation. Do not retune against consumed TEST or generate new seeds until a favourable score appears.
2. For actual-inventory use, complete the register above, obtain genuine coverage and independent labels, then implement a separately specified qualification/admission procedure. Do not merely switch `Unavailable` or `Unverified` flags.

Camera testing, delivery AI and additional features remain deferred. The full stock-AI goal is incomplete; this audit completes only the local readiness investigation.

## Verification and evidence

The script and row-level evidence remain ignored under `outputs/inventory-readiness-20261023/`. The successful run is `audit-e5728889-70db-485e-ad37-ce0ebcc2a632`. Its summary, verification receipt, per-product readiness and source-document hashes preserve the findings. The script sets explicit loopback addresses, reads the configured fixed scope and uses the existing trusted assessment/readiness functions. It issues no database writes, login/account changes, inference or training requests.

All 290 queried source documents were hash-identical before and after across seven scoped collections. The system config, selected Admin profile and ten relevant source files also remained unchanged. Combined source-document digest: `5dce90e876dd781004531ce70785ddaeef404f6e28f6901dbfd01e2d9a15d308`. This comparison covers the queried scope/collections, not all Auth accounts, Storage objects or unrelated records.

An independent agent reviewed current source/contracts and qualification criteria without accessing data or executing models. Its findings about unconditional readiness refusal, unqualified coverage, bounded receipt search, reviewer limitations and cutoff relevance are incorporated above. Application source, schema, rules, models, datasets, source-pinned manifests and runtime configuration were unchanged. Build/emulator/model regressions were not rerun for this read-only audit and documentation update; previous integration evidence remains separately dated in the local guide.

Contracts: [stock assessment](../docs/INVENTORY_STOCK_ASSESSMENT_2026-10-22.md), [approved design](../docs/superpowers/specs/2026-10-23-inventory-experimental-inference-design.md), [data collection](DATA_COLLECTION.md), [simulation and labels](INVENTORY_SIMULATION_AND_LABELLING_2026-10-23.md), [frozen experiment](INVENTORY_STOCK_EXPERIMENT_2026-10-23.md).
