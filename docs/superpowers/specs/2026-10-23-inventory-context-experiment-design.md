# Inventory context experiment design

23 October 2026. Status: written design and implementation plan approved by the user; implementation, final review fixes and the bounded experiment are complete. See research/INVENTORY_CONTEXT_EXPERIMENT_2026-10-23.md for audited synthetic results and remaining real-world limitations. Protocol: `inventory-context-experiment-2.0`.

## Intent and decision

The user selected **revised simulation and factual context inputs** for the next stock experiment. The aim is to investigate the current Random Forest's missing fulfilment context while retaining Normal, Reorder Risk and Critical Stock Risk. RF stays the main model and Decision Tree stays the comparator, in line with Wong Ric Hang's inventory report. This is a research experiment using AI-assisted simulated labels. It does not replace the model currently serving the local application.

The numerical design, coverage, feature encoding and comparison rules below are proposed engineering choices, not previously stated user requirements. Existing Native execution remains selected. This document is a bounded research project, followed by an implementation plan after design approval.

## Evidence and report alignment

The [development investigation](../../../research/INVENTORY_CRITICAL_DEVELOPMENT_AUDIT_2026-10-23.md) found that the original six predictors omit facts used by the synthetic teacher: additional firm demand, its deadline and incoming supply. All original development Normal cases had confirmed supply, Reorder cases planned supply, and Critical cases disrupted supply. Adding status to that cohort would introduce a trivial shortcut. The selected RF missed 21 of 23 above-reorder Critical development cases as Normal. These are post-selection development findings, not fresh test results.

The existing once-only test remains RF accuracy 75%, Critical precision 69.23%, Critical recall 45%, with nine Critical-as-Normal errors among 20 Critical cases. Those data, models, protocols and consumed-attempt registries stay immutable. The old DT score does not authorise promoting it after seeing that test.

The saved original `Project I Portfolio-WongRicHang.docx`, Chapter 3 section 3.2.5, allows reliable selected stock indicators rather than mandating exactly six predictors. Its verified SHA256 is `5a89babe5d204fbf784c1bb10b3c7634d9012d68d9a294b6574f4d04ed281b93`. Commitment/supply fields are our proposed implementation extension, not a claim that the report explicitly lists every field. This remains inventory condition classification at an observation cutoff; it is not a trained time-series forecast or a new delivery/parcel feature.

## Approaches

1. **Selected: new coherent simulation plus factual context.** Compare six-input and expanded-input models on the same fresh families and partitions. This addresses information omitted by the first experiment and prevents a one-status/one-label construction. It requires a new data contract and prospectively declared evaluation. Synthetic teacher agreement remains its interpretation.
2. **Keep six inputs and compare settings.** This preserves the current input interface but leaves known label-relevant facts unobserved. A larger forest alone cannot reliably distinguish scenarios with identical six inputs and different fulfilment situations. It was not selected.

## Scope and safeguards

Deliver a versioned generator, independent validator, bounded training/evaluation runner and evidence report. No application form, Firebase schema, current serving model, real inventory records, purchasing actions or operational gate changes are included. Real-history readiness remains Unavailable. Missing real history must not be invented from simulated cases. Camera trials, delivery AI, new model families and extra features remain deferred.

Use existing native MSI Python/scikit-learn and the installed environment; no GPU or dependency installation is required for these small tabular fits. Keep all case dossiers, labels, CSVs, model weights, predictions, attempt records and detailed receipts under ignored local paths. Only code, aggregate documentation and tests with deliberately fictional software fixtures may be publishable later. No Git staging, commit, push, production deployment or historical-data restoration is part of this work.

## Observation and feature contract

Each fictional family has one replayable stock ledger and one observation cutoff. Reuse the existing pure stock-assessment semantics without changing their source. All twelve views of that family share its six stock features. Only documented, cutoff-known commitment and supply context varies between views. These are alternate fictional situations, not twelve independent warehouses or observed future outcomes.

The six-input arm retains the exact ordered fields:

`available_quantity, reserved_quantity, movement_frequency, reorder_distance, adjustment_count, days_since_replenishment`.

Available is on hand minus reserved. Reorder distance is available minus reorder level. Movement/adjustment counts require a complete fictional 30-day window and a qualifying actual receipt establishes replenishment age. Never count reservations twice. Additional firm demand explicitly excludes quantities already represented by reservations.

The expanded arm appends eight numeric columns, for fourteen total:

| Field | Meaning at cutoff |
| --- | --- |
| `additional_firm_quantity` | Non-negative whole units of additional firm demand not already reserved. |
| `additional_due_days` | Days from cutoff to its deadline; finite and non-negative when demand exists. |
| `incoming_quantity` | Non-negative whole units in the one explicitly represented incoming batch. |
| `incoming_eta_days` | Days from cutoff to its stated arrival; finite and non-negative when a batch exists. |
| `supply_none` | One-hot flag: explicitly no incoming batch. |
| `supply_planned` | One-hot flag: a stated unconfirmed supply plan. |
| `supply_confirmed` | One-hot flag: stated confirmed supply. |
| `supply_disrupted` | One-hot flag: known disruption of the stated batch. |

Raw dossiers use null deadlines for explicitly absent demand/batches. The model encoder maps those absent deadlines to zero only when quantity is zero and the corresponding absence semantics are verified. `supply_none` requires zero incoming quantity and null raw ETA; other statuses require positive quantity and a known ETA. Zero demand requires a null raw due time; positive demand requires a known due time. This is explicit absence encoding, not missing-value imputation. Unknown quantities, deadlines or status are ineligible. Reject NaN/infinity, negative or contradictory values and extra fields capable of carrying labels. Keep quantities within existing safe integer limits and days within the existing 36,500-day bound.

No family/sample IDs, scenario template names, intended label, teacher reason, derived shortage/risk flag, future actual arrival, realised stockout or post-cutoff data enter either feature matrix. The categorical order is fixed in the protocol; do not learn an encoder from the complete dataset. Both arms require the same eligible context-complete records even though the six-input arm does not consume context.

This first experiment represents one deadline and one incoming batch. Multiple commitments/deadlines, partial arrivals, lead-time uncertainty, seasonal demand and supplier reliability are limitations, not silently aggregated facts. Later real use needs a separate documented adapter and validation.

## Versioned synthetic teaching policy

Implement a new, inspectable v2 policy; do not edit the frozen v1 teacher. Let A be available quantity, R the reorder level, D additional firm quantity, Q incoming quantity, and timely mean ETA is at or before the additional deadline. Equality counts as timely.

1. When D <= A, there is no additional firm shortfall. Return Reorder Risk if A <= R, otherwise Normal, irrespective of incoming status.
2. When D > A and confirmed timely supply provides A + Q >= D, return the same current-buffer decision: Reorder Risk if A <= R, otherwise Normal.
3. When D > A and a planned timely batch would provide A + Q >= D, return Reorder Risk because confirmation is required.
4. Otherwise return Critical Stock Risk: additional firm demand has no adequate stated timely coverage. This includes no incoming batch, disrupted supply, late supply and an explicitly insufficient confirmed or planned batch.

Compared with v1, this explicitly handles known absence of supply and a known insufficient plan. Those are coherent inputs, unlike unknown or contradictory evidence. The broader treatment is declared before new data generation. The rule is an AI-authored teaching assumption, not an independently validated business policy. Confirmed future supply is still an assumption of this prototype, not a guarantee of arrival. Being called Normal does not predict all future demand or guarantee warehouse safety.

Keep the policy itself as a transparent reference control. A model matching this deterministic rule is approximating a policy; the reference can apply it directly when all facts are available. The study must not claim ML is more accurate or preferable merely because it reproduces that rule. All outputs retain `independent_human_review: false`, `independent_accuracy_validated: false`, `operationally_approved: false` and explicit synthetic-policy annotation provenance.

## Prospective cohort and groups

Propose exactly 300 new fictional ledger families, generated from fixed seeds 2001–2005, sixty families per seed. No reused pilot/main observations or ancestry, and no regeneration with a favourable seed. Reuse pure replay/validation routines where compatible, not old case outputs or label-stratum constructors. Record a new namespace, generator/policy/source/environment hashes and ancestry identifiers; audit ledger fingerprints and old-family disjointness without loading old test observations. Exact duplicate new ledger families are a hard failure, not silently renamed families.

Cross six known history regimes with two buffer regimes, giving twelve strata of 25 families: receipt at cutoff, quarter-day receipt age, latest receipt just outside the 30-day window, a fully observed zero-event window, a 90-day-old receipt, and ordinary history; each crossed with A > R or A <= R. All ledgers remain replayable and complete; a zero-event recent window still has an eligible older receipt. Opening balances, valid event quantities and policy thresholds are constructed prospectively, never repaired in response to model scores.

Each family has the following twelve context views. Quantities and deadlines vary deterministically within each condition; templates do not enter predictors.

| Views | Context | Purpose |
| --- | --- | --- |
| 1–4 | D <= A with each of none/planned/confirmed/disrupted supply | All four statuses can accompany Normal or ordinary threshold Reorder. Include explicit zero additional demand and positive fully covered demand where A permits. |
| 5 | D > A, confirmed timely sufficient supply | Confirmation can cover a genuine additional shortfall. |
| 6 | D > A, planned timely sufficient supply | Replenishment review without labelling an unconfirmed plan Normal. |
| 7 | D > A, confirmed late supply | Confirmed status alone cannot establish safety. |
| 8 | D > A, confirmed timely insufficient supply | Timeliness alone cannot establish adequate quantity. |
| 9 | D > A, planned late supply | A stated plan may still miss the deadline. |
| 10 | D > A, planned timely insufficient supply | A plan may still fail to cover quantity. |
| 11 | D > A, disrupted otherwise timely sufficient batch | Disruption matters when the stock is actually needed. |
| 12 | D > A, explicitly no incoming batch | Known absence of supply under a firm shortfall. |

This yields 3,600 correlated rows, **300 independent constructed families**, not 3,600 independent products. The planned rubric implies 750 Normal, 1,050 Reorder and 1,800 Critical rows across the complete cohort; these are designed coverage counts, not warehouse prevalence. The intentionally identical six-input contexts expose its information limit by construction. An improvement on this comparison therefore does not estimate how frequently the missing facts matter in actual IILAS use.

Choose quantity scales, boundary cases and fixed generation schedule before generation in the implementation protocol. Default generated commitments are within fourteen days and supply ETA within twenty-one days; include exact equality and adjacent integer quantity/time boundaries. Out-of-range, incomplete, contradictory, post-cutoff and absent-history cases form a separate software challenge suite with expected refusal; never force them into Normal or include them in three-class accuracy. Do not dynamically reject or replace valid main cases to achieve a desired score.

## Partitioning and leakage controls

Freeze 80/20 by family, seed 2042: twenty development and five test families from each of the twelve strata. All twelve views and any later software renderings of a family stay together. Expected totals are 240 development families/2,880 rows and 60 test families/720 rows. Test class support follows the coverage plan: 150 Normal, 210 Reorder, 360 Critical; this is not balanced natural prevalence.

Freeze three development folds, seed 2043, eighty families each with balanced history/buffer stratum allocation. Every view appears in validation exactly once and no family/ancestry crosses train, validation or test. Save group assignments and verify all classes have independent family support. Exclude IDs, exact ledger duplicates and future observations from the matrices. The source audit checks provenance and structural correctness before any fit; development workers must never open held-out rows or dossiers. Initial preparation/validation may inspect all generated cases to enforce the fixed contract, but neither model selection nor manual error analysis may inspect held-out cases before final release.

Use exclusive new source-bound attempts under ignored `research/datasets/inventory-simulation-v2/`. Preparation writes separate development/test dossiers and matrices, a frozen manifest and checksums. Training can verify test-file metadata only. Do not read old test observations to compare ancestry; verify original namespace/seed metadata and fingerprints of the new ledgers instead. Preserve v1 and its consumed tests. This study uses a different constructed distribution, so old and new test percentages are not a paired comparison.

## Models, controls and selection

Four paired arms use identical rows and folds: six-input RF, fourteen-input RF, six-input DT and fourteen-input DT. The expanded RF is the designated research candidate; DT remains a comparator regardless of test ranking.

Use the original small grid in each arm: RF 100 trees, depth 6/12 and minimum leaf 2/5; DT depth 4/8 and minimum leaf 2/5. Balanced class weights, random_state 42, RF n_jobs 2. No scaling, oversampling, calibration, threshold optimisation or extra learned feature selection. Pin installed package versions and parameters. Four arms × four settings × three folds = 48 CV fits, plus four selected full-development fits = **52 fits maximum**.

Select within each arm by mean fold macro-F1, then Critical recall, then smaller depth, then larger minimum leaf. Freeze all four choices and model hashes before final evaluation. Also retain matched-setting development comparisons so differences are not described solely as a feature effect when selected settings differ.

Controls are the transparent v2 policy, a development-majority constant class, and a supply-status-only development lookup. For the lookup, choose the most frequent training class per status, ties by the declared class order; derive it within each development fold and freeze the full-development table for test. These controls require no extra estimator fits or tuning. Show per-status/class counts to demonstrate that status does not uniquely determine the label. Keep the current available<=reorder rule as a separately scored binary warning, collapsing Reorder/Critical to Risk; it is not a fabricated three-class classifier.

## Evaluation and interpretation

Claim the final-evaluation attempt before the first test observation is opened. Validate frozen development choices, inputs and hashes, save all four ordered prediction/score arrays and the fixed control predictions before calculating test metrics. No model promotion, new seed, altered policy, additional tuning or repeat scoring to reach a target follows test exposure. A failed execution retains its consumed attempt and partial evidence; source-bound repair requires explicit recorded review, not deletion of the registry or changing output paths.

Report accuracy, macro-F1, per-class precision/recall/F1, class and family support, full confusion matrices, Critical-as-Normal counts, false risk alerts and per-status/context/history/buffer subgroup descriptions. The primary comparison is expanded RF minus six-input RF on the same fresh test families. Secondary DT comparisons remain descriptive; disclose all four results, including regressions. No score is promised and the earlier parcel 80% target is not silently reused as an inventory acceptance threshold.

Use 500 paired family-bootstrap samples, seed 2044, resampling all twelve rows of each sampled family together. Report conditional 95% intervals for accuracy, macro-F1, Critical precision/recall and paired differences. Resamples with undefined per-class denominators are reported explicitly under a fixed convention; do not drop them to improve intervals. Do not bootstrap individual correlated views as independent cases. Record whole-batch and per-row inference timing separately from app/service latency.

A valid experiment is complete even if the expanded model fails to improve. Describe evidence as favourable for further research only when macro-F1 improves and Critical-as-Normal errors do not increase on the paired test; include uncertainty and any precision/recall trade-off. This is a reporting rule, not operational admission or a statistical guarantee. Since the teacher sees the same factual context, a high score demonstrates synthetic policy approximation. Independent labels, realistic prevalence and qualified real history remain necessary before business-quality claims.

## Resource and artifact boundaries

One native training job at a time, two CPU threads, at least 3 GiB free RAM and 1 GiB free disk at admission, 2 GiB sampled process-tree RSS, 60 seconds per fit, 900 seconds for the combined development phase and 100 MiB total generated run outputs. Check limits throughout and stop owned workers on violation. Refuse unavailable monitoring or insufficient resources; do not lower limits, stop user applications or run alongside another training job. Include the family-expanded dataset in size preflight; fail before fitting if the planned outputs cannot fit. Keep inference/evaluation bounded separately under the existing native supervisor pattern.

Do not modify original `runner_runtime.py`, the pure app stock/location helpers, original generators/trainers/protocols, consumed registries or serving manifests. Use additive v2 modules and tests. Preserve selected Admin, balances, approvals, Prepared-Shipment Handover and the navy/purple app. Application verification remains intact because this stage has no app/backend or service-profile mutation.

## Verification and deliverables

Before real generation, verify ledger replay, reservation accounting, the twelve contexts, teacher boundaries, explicit absence versus unknown, feature ordering, group disjointness, duplicate detection, source tampering, immutable output/attempt rules, test-read fencing, model-selection ties, bootstrap grouping and resource cleanup with small fictional fixtures. Include a deliberately duplicated family and a leaked held-out path as negative tests. Distinguish software fixture results from scientific performance.

Deliver an aggregate cohort audit, the prospectively frozen experiment protocol, verified development report, once-only final report and clear limitations. Generated dossiers, fitted models and per-case outputs remain ignored and must pass path/secret checks before any future publication. Update roadmap/handover with evidence and next prerequisites; do not mark the full stock AI goal complete.

Implementation can choose module names, internal validation helpers and CLI layout, while preserving these data, metric, fit-budget and admission contracts. Any substantive cohort/feature/teacher/selection change after approval must be recorded before generation, never retrofitted to observed performance. A later app integration is a separate task and must not automatically activate from a high synthetic score.

## Review status

Approach and written design approved by the user on 23 October 2026. The required fresh builder check completed with "nothing important left". The [implementation plan](../plans/2026-10-23-inventory-context-experiment.md) is written and self-reviewed; its review is pending with the user's existing Native execution preference preserved. No new cohort, weights, test evaluation or current-model change has occurred.
