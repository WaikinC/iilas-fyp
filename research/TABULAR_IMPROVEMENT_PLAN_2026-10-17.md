# Tabular benchmark improvement implementation plan

> **For agentic workers:** Use `superpowers:executing-plans`, or `superpowers:subagent-driven-development` when delegation is authorised, to implement this plan task by task. The checkboxes below describe future implementation, not completed training.

**Goal:** Compare bounded development-only improvements to the existing binary backorder and late-delivery benchmarks, addressing poor inventory alert precision and missed late deliveries without reusing the exposed test partitions for selection.

**Architecture:** Add a separate development runner which reuses the existing source/split verifier but never calls the existing full `run_benchmark` evaluation path. Keep source encodings, feature allowlists and group assignments fixed; produce out-of-fold (OOF) inventory probabilities or fixed-validation delivery probabilities, then select a model/threshold pair under the rules below. Write only new, ignored research outputs.

**Tech stack:** Existing Python/scikit-learn/pandas/NumPy environment; no installation or alternate model family.

**Spec:** [Benchmark training](BENCHMARK_TRAINING.md), [preparation and source semantics](BENCHMARK_PREPARATION.md), [report/label alignment](LABELLING_REVIEW_2026-10-17.md). This document is the proposed next preregistration, prepared after the first test results were observed. No implementation, training or new test evaluation is performed by writing it.

## Global constraints

- Public data only; additional features remain deferred. RF and DT remain both comparisons; delivery also retains LR. Dummy remains a diagnostic baseline.
- Preserve original sources, frozen splits, v1 reports/models/curves and native binary outputs. Do not create three-class labels, invent absent primary IILAS features or activate application inference.
- Use `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe`; dot-source `../Enter-IILAS.ps1` from the app directory for terminal work. Node 22.13+ within major 22 and JDK 21 remain workspace requirements.
- All raw/derived data, probabilities, pseudonymous group IDs and model files remain under ignored `research/datasets/`. No dataset upload, production access, deployment, dependency changes or Git publication.
- Operational Admin, record IDs/balances, staff approval, Prepared-Shipment Handover and navy/purple eight-card dashboard are outside this research change.

## Review focus

1. A source/split or code hash changes: refuse the run before fitting; never regenerate a more favourable split.
2. A test row enters a metric, transform fit or prediction call: fail closed; integrity verification may read it, model development may not.
3. A numeric encoding looks unusual: retain documented values; do not infer raw stock units, missing sentinels or post-outcome predictors.
4. Multiple items share an order: keep them together and resample whole orders for uncertainty, preserving item-weighted scoring.
5. A threshold looks better only because recall or precision collapses: publish both classes, alert counts and paired tradeoffs; do not claim operational acceptance.

## Evidence verified for this plan

The following are **already-observed v1 test results**, read from the saved aggregate `report.json` files on 17 October 2026. They were not recomputed by predicting on test rows. The plan was motivated by these results and therefore is not independent of knowledge of the original test performance.

| Saved result | Inventory RF | Delivery RF |
| --- | ---: | ---: |
| Development macro F1 | 0.5441669780 (mean of 3 folds) | 0.7017494284 (validation) |
| Historical test macro F1 | 0.5407970251 | 0.7045676026 |
| Historical positive precision | 0.0675998329 | 0.8954382923 |
| Historical positive recall | 0.8097962102 | 0.5542217155 |
| Historical average precision (AP) | 0.1612482806 | 0.8414040660 |
| Historical confusion matrix, rows=true 0/1, columns=predicted 0/1 | `[[351950,31241],[532,2265]]` | `[[10007,965],[6647,8264]]` |

Local evidence: `datasets/benchmark-runs/inventory-v1/report.json`, `datasets/benchmark-runs/delivery-v1/report.json`, their `selection-before-test.json` and `artifact-verification.json`; preparation counts and hashes come from `datasets/benchmark-splits-v1/{inventory,delivery}/manifest.json`. The prior independent artifact audit is historical evidence, not a new full audit in this plan-writing turn.

The fixed inventory training partition contains 1,543,947 singleton SKU groups, including 11,184 positives; its exposed test contains 385,988 rows. Delivery retains 120,798 training rows / 44,027 orders, 26,084 validation rows / 9,434 orders, and 25,883 exposed test rows / 9,436 orders. Both native classes remain present. Delivery validation has already supported v1 model selection; it is reusable development data, not fresh confirmation.

Pinned source SHA-256:

- Inventory `bopredict.csv`: `70604707896dc5eb03e68a907962246f786b464d7ba4ccf3964c139de55c4c99`.
- Delivery `dataco-benchmark-minimised.csv`: `facefe4930d1db9f3b0ad7865e6968483427b02afedb5015a49d24bf62ec7091`.
- Inventory split CSV: `0e05b05ef6521686940279ea56669549a964561aee56a181a01049dfaf38594a`.
- Delivery split CSV: `91d64de04ac434d11379ab59e6c91a0d0b8ff394d34eb73001e371535568dc39`.

## 1. Data and preprocessing decisions fixed before execution

Use the existing `benchmark_train.load_verified` checks, including exact schemas, all row/group/label correspondence, pinned bytes and deterministic split reconstruction. Its whole-source integrity reading is permitted; immediately construct a development-only object, discard the full frame and expose no test-prediction/evaluation option in the new CLI. Do not call `run_benchmark`, which automatically evaluates test. The new runner accepts only the two fixed prepared inputs and refuses custom feature lists or alternate split seeds.

Inventory uses exactly `INV,TIM,FOR3,FOR6,FOR9,SAL1,SAL3,SAL6,SAL9,MIN,OVRP,SUP1,SUP2`. Keep these published numerical encodings unchanged. Exclude SKU/group ID, source row, target, cohort flag, INQ, OVRA and RSK1–RSK6. The upstream preprocessing and prediction-time provenance remain incompletely documented; a train-only pipeline cannot repair those historical unknowns.

Delivery uses exactly `payment_type,scheduled_shipping_days,shipping_mode,item_quantity,category_id`. Fit one-hot encoding of payment type, shipping mode and category ID on each fit partition, with unknown categories ignored and their aggregate count reported. Fit numeric standardisation on the fit partition for LR only; RF/DT use numeric passthrough. Preserve valid same-day zero shipping duration and repeated order items. Do not reintroduce actual duration, final statuses, personal/contact fields or excluded cancelled shipments. Continue scoring rows as order items; do not silently change the task to one prediction per order.

The saved audit found no `-99` in INV/TIM/SUP1/SUP2; it did find 6,654 negative INV encodings (5,363 in training). Those are observations, not evidence that all sentinels are resolved. Before fitting, save aggregate development-only minima/maxima, missing/nonfinite counts, zero/negative/`-99` counts for every numeric predictor and category counts/unknown rates for delivery. Do not print rows or group identifiers. Missing/nonfinite values or schema violations already fail verification. Unexpected encoding evidence stops the experiment for a source/protocol revision; it does not authorise guessed replacement, clipping, imputation, outlier removal or adding missingness indicators.

No training-data resampling, feature engineering, feature selection, new predictors or probability calibration is included in this batch. Balanced weights, fitted category vocabularies and LR scaling must be derived inside the relevant fit partition only. Calibration may be proposed later within the same core research scope if development reliability diagnostics justify it, but would require its own held-out calibration design and finite preregistration; it is not an adaptive extra candidate here.

## 2. Finite candidates and resource budget

Fixed seed 42; one fit at a time; `n_jobs=2` for RF and `threadpool_limits(2)` around all fitting. No random search, automatic retries with larger limits, seed search or candidate additions after inspecting scores. Clone the v1 pipelines and override only the tabled parameters. Persist every resolved estimator parameter and package version in a pre-fit protocol file. Current saved runtime versions are scikit-learn 1.8.0, pandas 3.0.1 and NumPy 2.4.2; check actual local versions before execution rather than installing to match online documentation.

| Candidate order | Model and fixed settings | Benchmarks |
| --- | --- | --- |
| 0 `dummy` | Most frequent native class; threshold stays 0.5 | Both |
| 1 `dt_balanced_leaf2` | DT depth 12, leaf 2, balanced | Both; v1 anchor |
| 2 `dt_none_leaf2` | DT depth 12, leaf 2, no class weighting | Both |
| 3 `dt_balanced_leaf20` | DT depth 12, leaf 20, balanced | Both |
| 4 `rf_balanced_leaf2` | RF 64 trees, depth 12, leaf 2, balanced | Both; v1 anchor |
| 5 `rf_none_leaf2` | RF 64 trees, depth 12, leaf 2, no class weighting | Both |
| 6 `rf_balanced_leaf20` | RF 64 trees, depth 12, leaf 20, balanced | Both |
| 7 `lr_balanced_c1` | LR lbfgs, C=1, balanced, max_iter=1000, tol=0.0001 | Delivery; v1 anchor |
| 8 `lr_balanced_c01` | Same LR, C=0.1 | Delivery |
| 9 `lr_balanced_c10` | Same LR, C=10 | Delivery |

For DT/RF retain minimum split size 2, gini criterion and random state 42. RF retains bootstrap=true, max_features=sqrt and max_samples=None. Other parameters retain the explicit values captured from the corresponding v1 `protocol.json`; verify the clone against that snapshot, including the installed LR regularisation behaviour. Candidate order is numerical as above, not lexical or completion order.

Inventory: reuse the three training-only folds returned by `inventory_folds`, requiring unique SKU groups and no overlap. Every row receives exactly one OOF probability from a model which did not fit that row. Delivery: fit only the fixed training partition and predict only fixed validation. Never combine train and validation for a final fit in this batch.

Budget: inventory 7 candidates x 3 folds = 21 fits; delivery 10 candidates x 1 = 10 fits; the separate inventory sensitivity below adds exactly 3 fits. **Maximum 34 fits; no final full-training refits.** Threshold scoring uses stored development probabilities without fitting. Complete delivery before inventory, then sensitivity. Retain probabilities locally to permit reproducible scoring without repeating training.

Operational ceilings are 12 hours wall time for the whole run and 8 GiB resident memory for the runner plus its child processes; these are resource limits, not model acceptance thresholds. Check elapsed time/RSS at least every 5 seconds using a supervising process with standard-library OS facilities, terminate a fit if the limit is exceeded, mark the output incomplete and stop. An interrupted or failed candidate makes the main comparison incomplete; do not select a winner from the subset that finished. Resume only in a new documented execution with the same frozen protocol and verified completed-artifact hashes, never by silently reducing data/trees or omitting candidates. ConvergenceWarning and nonfinite probabilities are fatal.

## 3. Objectives and threshold selection

The primary scientific comparison retains macro F1 because no stakeholder false-positive/false-negative cost or minimum acceptable recall/precision has been agreed. This objective does **not** assert equal real-world costs or promise that both precision and recall improve.

For each non-Dummy candidate evaluate thresholds `k/200` for integer `k=0..200`, plus `nextafter(1.0,+inf)` as the explicit no-alert comparator: 202 fixed thresholds. Predict class 1 when `p >= threshold`; check positive-probability column by class label, never column position alone. Use `zero_division=0` for numerical scoring and flag undefined precision when no positives are predicted. Keep threshold 0.5 rows in every report.

Inventory selection uses **pooled OOF macro F1** over all training rows, not the v1 arithmetic mean of fold scores. Recompute the v1 anchor's development score in this same pooled framework for fair next-run comparisons; retain per-fold metrics and the old mean in historical context. Delivery selection uses item-weighted validation macro F1. Scores used for model and threshold selection are development scores and are optimistically biased by that selection; they are not independent estimates of the selected procedure's generalisation.

Select a pair separately within RF, DT and delivery LR, then an overall diagnostic pair across those families and Dummy. Compare these lexicographic keys: descending macro F1, descending positive F1, descending positive AP, ascending declared candidate order, ascending distance from 0.5, descending threshold. Round each metric to 12 decimal places for tie comparison only and retain full values in artifacts. Dummy participates only at 0.5. The report-committed RF remains RF even when another family is the best diagnostic comparison.

To address the practical tradeoffs without inventing stakeholder targets, also freeze these **secondary, nonselecting** analyses:

- Inventory: show the precision/recall/alert-rate Pareto frontier of every candidate-threshold pair. Mark the highest-precision point whose pooled OOF recall is at least the v1 RF anchor's newly computed OOF recall at 0.5. For ties use recall, macro F1, candidate order, then larger threshold. This empirical reference is not a required business recall floor.
- Delivery: show the frontier and mark the highest-recall point whose validation precision is at least the v1 RF anchor's validation precision at 0.5. For ties use precision, macro F1, candidate order, then smaller threshold. This reference is not a stakeholder precision requirement.
- In secondary comparisons round metrics to 12 decimal places too; lower candidate order wins. If no pair is feasible, record that fact and retain the anchor for context. Do not lower a floor to obtain a favourable result. Reference values come only from the development anchor, never the historical test numbers above.

Save the chosen IDs, thresholds, complete score table, reference values, selection key and protocol hash in `development-selection.json` once all main candidates complete. Do not replace the primary selection with a more appealing secondary point. Business deployment remains unapproved until acceptable missed-case cost, alert workload and error tradeoff are supplied by the relevant supervisor/stakeholders.

## 4. Metrics, uncertainty and source sensitivity

For every candidate at 0.5 and its primary selected threshold, report both classes' precision/recall/F1/support, confusion matrix with labels `[0,1]`, macro F1, balanced accuracy, accuracy, positive AP, prevalence, number/rate flagged, FP and FN. Save the complete development PR curve, and distinguish step-weighted AP from trapezoidal PR area. AP assesses scores and cannot be improved merely by changing a decision threshold. [scikit-learn AP definition](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.average_precision_score.html)

Bootstrap design is a fixed descriptive analysis, not a selection rule: 500 paired stratified group-bootstrap replicates, RNG seed 20261017. Within each native class sample the observed number of groups with replacement; include all item rows of each sampled order, with group multiplicity as row weight. Inventory groups are singletons. Use identical sampled group multiplicities across all compared models/thresholds. Compute 2.5th/97.5th percentile intervals for macro F1, positive precision/recall, balanced accuracy and alert rate, and paired differences from the v1 RF development anchor at 0.5. Compute these for the selected RF/DT/LR pairs, overall pair and the two applicable secondary tradeoff points, deduplicating identical pairs. AP remains a point estimate in this bounded batch.

Keep thresholds and candidate choices fixed inside bootstrap replicates; do not tune again or refit. Process one replicate at a time and use group-level confusion contributions to keep memory bounded. Require both native classes in the input group table; otherwise report uncertainty unavailable and stop that analysis. Class-stratified sampling must retain both classes in every replicate: a class-absent replicate is an implementation/integrity failure, never silently discarded or replaced. Preserve whole-group multiplicities and record no-predicted-positive replicate counts. Precision intervals with such replicates are flagged because zero is a scoring convention. Class stratification conditions on the observed class-group composition; these intervals do not model prevalence shift. OOF predictions share fitted models, and selection used the same development data: bootstrap intervals describe conditional variation of the saved predictions, **not** fresh validation, full training/selection uncertainty, causal superiority or a guarantee of significance. Report inventory per-fold scores as a separate diagnostic, not as confidence intervals or independent random-seed stability runs.

Negative-INV sensitivity is separate from the main candidate competition. Use only `rf_balanced_leaf2` at fixed threshold 0.5. In each existing inventory fold, exclude negative-INV rows from that fold's fit and held-out subsets without reallocating groups; generate OOF predictions only for retained rows. Compare against the main anchor's already-stored OOF predictions restricted to exactly those same held-out rows. Report aggregate removed/retained class counts, common-row metrics and the same paired bootstrap design. This adds three fits; do not tune its threshold, use it to replace the main population result, infer negative values are invalid, or score the test partition. Missing either class after restriction stops the sensitivity and records it unavailable; the separately completed main protocol can still be reported with sensitivity explicitly incomplete.

## 5. Test exposure and stopping rules

The original test is exposed. This batch has **no test evaluation phase**, no reading saved test PR curves to pick thresholds, and no prediction/threshold sweep on test rows. Hash verification and citation of existing aggregate reports are not new evaluation. Record `test_previously_observed=true`, `test_evaluated_this_run=false`, `primary_iilas_task_evaluated=false`, `operational_acceptance=false` in every report.

Stop after the fixed candidates, sensitivity, selection and uncertainty artifacts are complete, even if development results disappoint. Do not expand the grid, alter weights/threshold resolution, drop source cohorts, switch seeds or add features in response to outcomes. A later hypothesis requires a new dated plan acknowledging this development history. Integrity violations, leaked rows, changed feature semantics, invalid probabilities, class/group conflicts, convergence/resource failures or missing required artifacts stop the relevant run and prohibit a completion claim.

Fresh confirmation requires an independently sourced or prospectively held-out compatible population under a new, predeclared protocol and public-only constraint. Reshuffling these data, holding out a previously viewed subset, or changing a seed does not make an untouched test. If an explicitly authorised later report repeats evaluation on the old test, label it **reused/exposed benchmark evaluation**, record that exposure, and never present it as fresh confirmation. This plan does not authorise that repeat. Neither improved development scores nor future binary benchmark results fulfil the missing three-class IILAS feature/label requirements.

## 6. Concrete implementation and test checklist

All listed source files below are **future work**. Preserve `benchmark_prepare.py`, `benchmark_train.py` and their historical outputs unchanged; use their public helpers without invoking full benchmark training.

### Task 1: Development-only boundary and immutable protocol

**Create:** `research/tabular_development.py`, `research/tabular_development_protocol.json`, `research/test_tabular_development.py`.

**Interfaces:** `load_development(kind: str) -> DevelopmentData` returns only train and optional validation frames, immutable allowlisted features, and verified provenance hashes. `DevelopmentData` has `train`, `validation`, `features`, `hashes`; it has no test frame. `run_development(kind: str, output: Path) -> dict` accepts only a new resolved child of `research/datasets/tabular-development-runs/`.

- [ ] Add tests for source/split tampering, repeated inventory groups, path traversal/symlink escape, existing destinations and forbidden split names. Verify they fail before implementing the boundary.
- [ ] Reuse `load_verified`, assert this plan's source/split hashes, project into development-only frames, release the complete frame and reject CLI test/full-evaluation flags. Save protocol/code hashes, explicit candidate registry, runtime versions and source-history references before fitting.
- [ ] Use synthetic marker rows and spy estimators/metric functions to assert test markers never reach `fit`, transform fitting, `predict_proba` or scoring. Test-only fixtures may substitute verifier results; production must not expose a hash bypass.
- [ ] Verify emitted JSON contains only aggregate diagnostics and intended local artifact metadata; failure messages must not expose raw rows or identities.

### Task 2: Fixed candidate fitting and probability artifacts

**Same files. Interfaces:** `make_candidates(kind: str) -> ordered mapping[str, Pipeline]`; `collect_development_predictions(data: DevelopmentData, candidates: mapping) -> mapping[str, PredictionTable]`. A `PredictionTable` has local-only `source_row,group_id,label,fold,probability`; delivery fold is the fixed value `validation`.

- [ ] Test exact candidate order/count/parameters, fold uniqueness/class coverage, numeric/categorical allowlists, category ID categorical treatment, unknown-category handling, LR scaling trained only on fit rows, and correct class-1 probability extraction with reversed estimator class order.
- [ ] Implement sequential clones, fixed folds/validation, 31 main fits total, candidate/fold progress and local probability checksums. Assert probability coverage exactly once per development row. No final refit or active-inference model path is allowed.
- [ ] Test the supervising resource limits using a synthetic sleeper and memory-accounting stub, plus convergence-warning failure and an interrupted candidate. Incomplete runs must have no successful selection/report status.

### Task 3: Deterministic selection and honest reporting

**Same files. Interfaces:** `score_thresholds(table: PredictionTable) -> list[dict]`; `select_pairs(scores: list[dict], kind: str) -> dict`; `group_bootstrap(tables: mapping, pairs: list[dict], seed=20261017, replicates=500) -> dict`.

- [ ] Pin confusion matrices and per-class metrics with tiny hand-computable fixtures. Test `p == threshold`, all-alert/no-alert cases, all 202 thresholds, fixed Dummy threshold, 12-decimal ties, candidate-order precedence and finite/nonfinite rejection.
- [ ] Test pooled OOF selection differs correctly from an unweighted fold average, and test secondary floors use the development anchor with no historical-test input. Verify that AP/PR scores are invariant under threshold-only changes.
- [ ] Implement candidate, family and overall choices; write all scores and the two secondary frontiers with flags explaining selection optimism and business constraints. Render no test-result section except clearly labelled historical citation.
- [ ] Test paired bootstrap uses identical whole-order multiplicities across models, retains all order items, rejects absent input/replicate classes, counts undefined precision, reproduces the same seed, and leaves selected thresholds fixed.

### Task 4: Negative-INV sensitivity and bounded execution

**Same files. Interfaces:** `run_negative_inventory_sensitivity(data: DevelopmentData, anchor: PredictionTable) -> dict`; delivery must reject this function.

- [ ] Test exclusion occurs only in the separate three-fit sensitivity, original fold assignments survive, and anchor comparison uses identical retained held-out rows. Verify the main population and native labels remain unchanged.
- [ ] Add sensitivity metrics/paired intervals without making it a selectable candidate. Test missing-class restriction records unavailable sensitivity and cannot silently substitute an altered fold.
- [ ] Run `python -m unittest discover -s research -p 'test_*.py'` with the existing MSI interpreter; all existing and new tests must pass. Synthetic tests verify software only, not model quality.
- [ ] Before later real execution, freeze and hash this plan plus protocol/source snapshots; verify the ignored output destination and zero tracked datasets. Use the new development runner only. Do not run `benchmark_train.py` to execute this plan.
- [ ] Run delivery, inventory and sensitivity sequentially within the 34-fit budget; validate probability/metric reconstruction, selection determinism, input/output hashes and all exposure flags. Completion requires required reports and artifact verification, not merely an exit code.
- [ ] Retain aggregate report, development PR/threshold tables, local probability tables, bootstrap summaries, source/protocol/code hashes, exact environment and an append-only execution-status record in the new ignored directory. Save no primary model and make no production/API integration change.

Suggested future CLI after implementation: `python research/tabular_development.py delivery --output research/datasets/tabular-development-runs/delivery-v2` followed by the inventory equivalent. These commands do not exist yet. New protocol version: `public-binary-tabular-development-2.0`. The inventory command includes its separate sensitivity; aggregate budget applies across both commands.

## Ready choices and remaining decisions

Ready for implementation review: exact data boundary, feature lists, finite model candidates, sequential resource limits, folds, thresholds, primary/secondary ranking, ties, bootstrap design and output/tests above. No new model performance is claimed. Supervisor/business choices still outstanding are acceptable missed-backorder/late-case costs, alert workload, minimum precision/recall and a compatible independent confirmation population. Those gaps block operational acceptance, not development-only implementation under this fixed protocol.

The technical approach follows scikit-learn's separation of score learning from decision thresholds and its warning against tuning thresholds on classifier-fit data; OOF or fixed-validation predictions are required here. [Threshold guidance](https://scikit-learn.org/stable/modules/classification_threshold.html) Train-only preprocessing follows its pipeline/data-leakage guidance. [Common pitfalls](https://scikit-learn.org/stable/common_pitfalls.html) The currently served official pages describe 1.9.1; implementation must remain compatible with the recorded local runtime, without adopting newer helpers by assumption.

Plan verification on 17 October 2026: cited result values and partition/source hashes were read from saved JSON; current runner/feature schema and relevant report-alignment documents were inspected. Self-review checked that every review-focus item maps to a named test/checklist task. This writing step performed no training, test scoring, model/source modification or production action.
