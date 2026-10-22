# FreshRetailNet next-day recorded-stockout protocol — 17 October 2026

**Protocol ID:** `freshretailnet-recorded-stockout-dayahead-1.0`. **Status:** prospective author proposal, prepared after source-quality and aggregate-outcome inspection; no supervisor approval is implied. This document fixes a separate public binary research experiment and its future execution gates. This task performed only metadata, eligibility, date-boundary and hash checks: **zero fits, predictions or model-performance calculations**. No training runner was implemented.

The research question is whether Random Forest predicts next-day publisher-recorded stockout more usefully than Decision Tree and a Dummy baseline for the same observed store-product series. It does not evaluate IILAS Normal/Reorder Risk/Critical Stock Risk or infer missing stock balances. Wong's original portfolio specifies RF versus DT, three stock-risk classes and a proposed 80/20 primary-task split; this new source-specific temporal protocol is an author choice, not a replacement for that report commitment. Choong's delivery RF/DT/LR and parcel MobileNetV2/EfficientNet B0 comparisons remain separate. Original portfolio byte hashes were checked against the saved manifest on this date. [Wong original portfolio](https://drive.google.com/file/d/17HlQBr8J4orQIfy-adEUBmuWLTiD5BTM/view), [Choong original portfolio](https://drive.google.com/file/d/1XkAGX38tNdql7vEIQI8uVxleqYi3eJGc/view). See the local [report alignment](LABELLING_REVIEW_2026-10-17.md) and [primary intake contract](DATA_COLLECTION.md) for the continuing primary-task gaps.

The separate [34-fit Backorder/DataCo improvement plan](TABULAR_IMPROVEMENT_PLAN_2026-10-17.md), existing outputs, exposed historical tests and all application behaviour remain unchanged. This protocol adds no product features, production integration, model activation, dependency installation or dataset acquisition.

## 1. Source, target and availability assumptions

Use only the complete unchanged files already in ignored `research/datasets/freshretailnet-audit-2026-10-17/`, pinned to Dingdong-Inc release revision `c374e85975c82816c495acfa904cc55ab14a47d3`:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `train.parquet` | 106,436,287 | `6706832db892bbae4969c19d87e07975d2543d2ba7d7d4756360654785de5a3d` |
| `eval.parquet` | 8,440,124 | `1b118840664280c6b88bffc84c80ee1f54c05d911e354b7599e5da10995e960e` |

The pinned publisher card declares CC BY 4.0. Preserve attribution to Dingdong-Inc and Wang et al., the revision, original hashes and a statement describing the derived binary target and lag features. No original or derived data may be uploaded to GitHub. The publisher release has 865 distinct product IDs; do not substitute the paper's 863 count. [Original publisher card](https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K/blob/c374e85975c82816c495acfa904cc55ab14a47d3/README.md), [original paper](https://arxiv.org/abs/2505.16319).

For store-product series `s` and target calendar date `d`, define:

`y(s,d) = 1 if stock_hour6_22_cnt(s,d) > 0 else 0`.

The observation window is hour indices **6 through 21**, the half-open interval `[06:00,22:00)` in the publisher's date/hour convention. The prior full audit verified that the count equals the sum of `hours_stock_status[6:22] == 1` in every row. Class 1 means at least one recorded flagged hour, and class 0 means no recorded flagged hour in that window. The current count is a target source, never a predictor for that date. No zero-sales proxy, latent-demand reconstruction, stockout-duration severity class or three-class mapping is permitted.

Predict at the boundary after date `d-1` is complete, using records dated at most `d-1`. This is a **retrospective next-day simulation under an explicit prior-day data-availability assumption**. The release does not document posting latency, timezone conversion or whether an hourly flag denotes a full-hour or instantaneous event. Therefore retain publisher date/hour boundaries, assume prior-day summaries are available before the next trading window, and claim only recorded-event prediction under that assumption. Do not claim operational lead time or physically continuous stock unavailability. Operational evaluation would need actual timestamps and availability evidence.

This choice resolves the task definition without pretending that the unresolved hourly measurement process is known. Preserve positive-sales/flag-one observations, including those documented in the audit. Predicting the native recorded status does not require asserting that an entire flagged hour had zero inventory. All discount values, activity/holiday flags and weather measurements are excluded, so their timing/sentinel ambiguities do not need guessed replacements in this experiment. See [intake evidence and limitations](FRESHRETAILNET_AUDIT_2026-10-17.md).

## 2. Exact feature and eligibility contract

Sort by `(store_id,product_id,dt)`; retain those keys and `city_id` solely for joins, chronological checks and dependence accounting. Never feed identity, hierarchy or source-partition codes to the model. Require each included target to have exactly 28 consecutive preceding daily observations from the same series, plus a valid current target count. Missing dates, duplicate keys, nonfinite or negative sales, invalid stockout counts or changed source hashes are integrity failures for this pinned experiment, not invitations to impute, resplit or silently exclude rows.

Exactly **24 numeric features**, in this order:

1. Published daily `sale_amount` at lags 1, 7, 14 and 28: four features.
2. Daily `stock_hour6_22_cnt` at lags 1, 7, 14 and 28: four features.
3. Mean published daily sales over the preceding 7, 14 and 28 dates: three features.
4. Mean daily stockout count over the preceding 7, 14 and 28 dates: three features.
5. Fraction of preceding dates with `stock_hour6_22_cnt > 0`, over windows 7, 14 and 28: three features.
6. Target-date weekday one-hot columns Monday through Sunday in that fixed order: seven features.

A window of length `w` is `[d-w,d-1]`, inclusive. Lag 1 is `d-1`; there is no lag 0, centred window, backward fill or current-day aggregate. Weekday comes solely from `dt`; no external holiday calendar or forecast is acquired. Do not append month, trend, engineered ratios or alternate windows during the run. All features are deterministic and unlearned: the schema is fixed and numeric values pass through unchanged. Compute means in float64 and cast the final matrix once to float32; record dtype and feature order. No scaling, categorical encoder fitting, clipping, feature selection, imputation, resampling or probability calibration is planned.

Sales remain the publisher's globally scaled observations, not reconstructed physical unit counts or uncensored demand. The release's original global normalization is inherited; its coefficient and original calibration population are unknown. No new full-data normalization is allowed and the protocol cannot retrospectively certify that upstream preprocessing used training data only. There are no learned preprocessing parameters here; estimator class weights and all other learned quantities must use only that estimator's fit partition. This follows the train-only processing boundary described in [scikit-learn's leakage guidance](https://scikit-learn.org/1.8/common_pitfalls.html).

Use every eligible row; no balancing or series subsampling. A series is not excluded for having one observed class. Every scoring partition must contain both classes overall. Do not concatenate this source with Backorder or use IILAS primary trainers that require different features/labels.

## 3. Chronological splits and rolling prediction origins

All boundaries below are target dates, fixed before fitting. The initial 28 days supply history only. The same 50,000 series appear in every partition; this is explicitly **later-time performance on known series**, not a test of unseen stores, products, cities or independent series.

| Role | Target dates inclusive | Days | Rows | Recorded-positive | Recorded-negative |
| --- | --- | ---: | ---: | ---: | ---: |
| Warmup only, no fit/scoring targets | 2024-03-28–2024-04-24 | 28 | 1,400,000 | 698,576 | 701,424 |
| Model development fitting | 2024-04-25–2024-06-04 | 41 | 2,050,000 | 845,053 | 1,204,947 |
| Model/threshold development | 2024-06-05–2024-06-25 | 21 | 1,050,000 | 448,377 | 601,623 |
| Publisher confirmation benchmark, gated later phase | 2024-06-26–2024-07-02 | 7 | 350,000 | 143,438 | 206,562 |

There are **3,450,000 eligible targets** and 1,400,000 warmup exclusions from 4,850,000 records. All rows have one role and target keys/dates never overlap. Feature history legitimately overlaps roles. For example, June 5 may use June 4 outcomes as lagged observations, and June 27 may use June 26 observations only after June 26 has completed. This is not training on a later target. The latest fit target on June 4 is available at the June 5 forecast boundary under the stated data-availability assumption; the target horizon does not cross that boundary.

**Rolling daily origins, fixed fitted model per phase:** advance the observation history one completed date at a time; do not update model parameters, feature selection or threshold. It is not a fixed-June-25 seven-day-ahead forecast. Do not construct all seven publisher predictions using later actuals at June 25 or replace unknown future observations with target values. A future runner must emit predictions date by date and admit historical records only when their date is strictly earlier than the current target date.

The three development reporting blocks are June 5–11, June 12–18 and June 19–25, each 350,000 rows, with respectively 143,771 / 153,593 / 151,013 positives. These are descriptive week checks from the same frozen fits; they do not create three cross-validation folds, independent fit replications or additional candidates. Select on pooled development predictions. Do not choose a favourite week or change cutoffs after seeing results.

After complete development selection, a future confirmation phase fits exactly one selected RF, one selected DT and one Dummy on all **3,100,000 eligible publisher-train targets**, April 25–June 25, using the unchanged feature contract. Selected hyperparameters and thresholds are locked before these refits. Fit each once, then score June 26–July 2 once under rolling origins; never refit on publisher-eval targets. No confirmation threshold sweep, reselection, updated calibration or per-day refit is allowed. This phase requires the pre-fit and pre-confirmation gates in section 7; it is specified here but was not executed or authorised by this writing task.

## 4. Bounded candidates, selection and fit accounting

Use the existing MSI Python/scikit-learn runtime. Fixed random seed `42` for every stochastic estimator; no seed search. Candidate order is the integer order below. All tree models use gini, depth 12, `min_samples_split=2`, `min_weight_fraction_leaf=0`, `max_leaf_nodes=4096`, `min_impurity_decrease=0`, `ccp_alpha=0`, `monotonic_cst=None`. DT uses `splitter="best"` and `max_features=None`. RF uses 64 trees, `max_features="sqrt"`, `bootstrap=True`, `max_samples=500000`, `oob_score=False`, `warm_start=False`, `n_jobs=2`, `verbose=0`. The RF per-tree bootstrap draw cap is fixed in advance for resource control; the eligible fit population and all evaluation rows remain intact. Apply ordinary `balanced`, not `balanced_subsample`, where stated. No sample weights beyond that estimator class-weight option. Freeze every resolved `get_params(deep=True)` value and actual installed versions before fitting; refuse an environment mismatch until reviewed. [Official RF parameter definitions](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html).

| Order / candidate | Family | Minimum leaf rows | Class weighting |
| --- | --- | ---: | --- |
| 0 `dummy_most_frequent` | DummyClassifier(strategy="most_frequent", random_state=42) | — | None |
| 1 `dt_balanced_leaf20` | DT | 20 | balanced |
| 2 `dt_none_leaf20` | DT | 20 | None |
| 3 `dt_balanced_leaf100` | DT | 100 | balanced |
| 4 `rf_balanced_leaf20` | RF | 20 | balanced |
| 5 `rf_none_leaf20` | RF | 20 | None |
| 6 `rf_balanced_leaf100` | RF | 100 | balanced |

**Seven development fits + three confirmation refits = at most 10 fits for the complete protocol.** Development-only execution stops at seven. No sensitivity fits, nested CV, full-grid refits or additional overall-winner fit. RF remains the report-aligned model family and DT its comparison even if Dummy or DT performs better; report that outcome honestly. The existing unrelated 34-fit plan is neither consumed nor expanded by this 10-fit proposal.

For each of the six non-Dummy candidates, select a probability threshold using only its fixed development predictions: thresholds `k/200` for `k=0..200`, plus `nextafter(1.0,+inf)` as the no-alert comparator, exactly 202 thresholds. Predict class 1 for `p >= threshold`. Find the positive probability column by class label 1 and require finite probabilities in `[0,1]`. Dummy stays at threshold 0.5 and is never tuned. Always retain the 0.5 comparison, including when its threshold is not selected. Do not tune on fit targets. [Official threshold guidance](https://scikit-learn.org/stable/modules/classification_threshold.html).

Choose the best model/threshold pair separately within RF and DT, then identify an overall descriptive winner among those pairs and Dummy. Primary ranking is descending pooled development macro F1, then descending positive-class F1, descending positive average precision (AP), ascending candidate order, ascending absolute distance of the threshold from 0.5, and finally descending threshold. Round metric values to 12 decimals only for tie comparison; store full precision. Thresholds are not refitted for confirmation. Class-weight changes do not guarantee calibrated probabilities.

Macro F1 is a declared research objective because operational false-alert/missed-event costs and workload limits are unset. No arbitrary precision/recall floor or claimed 90% acceptance target is introduced. Show the full development precision/recall/alert-rate table so the consequences of the selected point are visible. Better threshold precision can reduce recall; AP does not change merely by moving a threshold. Development performance is selection-biased, including any apparent winner.

## 5. Metrics and dependence-aware uncertainty

For all development candidates at 0.5 and their selected thresholds, report accuracy, balanced accuracy, macro F1, both classes' precision/recall/F1/support, confusion matrix in `[0,1]` order, positive AP, prevalence, FP/FN and alert count/rate. Use `zero_division=0` for numerical metrics and explicitly flag undefined precision when no positive predictions occur. Save complete development PR curves; use step-weighted AP and do not call it trapezoidal PR area. On publisher confirmation, report only the locked RF/DT/Dummy comparisons at their locked thresholds and at 0.5, deduplicating identical pairs. Retain per-day metrics and the three development-week metrics as descriptive stability checks.

Daily rows are not IID: stores are nested in cities, products recur across stores/cities, and a series has serial dependence. Use a fixed **paired crossed city/product cluster bootstrap**, inspired by the separate-factor resampling in [Owen's original pigeonhole-bootstrap paper](https://arxiv.org/abs/0712.1111). This adaptation to nonlinear classification metrics is an explicitly descriptive uncertainty procedure; the paper's results for means are not a guarantee of coverage here.

For each phase separately, use `numpy.random.default_rng(20261017)` for development and `default_rng(20261018)` for confirmation. In each of exactly 500 replicates, sample 18 city labels with replacement and independently 865 product labels with replacement, each uniformly over the observed labels. A prediction row's weight is its city's draw multiplicity times its product's draw multiplicity. Include every existing store-product/date row at that weight, preserving the complete temporal trajectory; never manufacture absent city-product pairs or sample individual days/rows independently. Use identical weights across all compared models and thresholds in that phase. No class stratification or retuning occurs inside replicates.

Compute 2.5th/97.5th percentiles for macro F1, positive precision, positive recall, balanced accuracy and alert rate. Also compute paired differences RF-minus-DT and RF-minus-Dummy for the locked selected pairs. Include selected RF/DT at 0.5 as context with deduplication. AP remains a point estimate. Aggregate TP/FP/FN/TN by city-product cell and process one weight vector at a time; no refitting or repeated probability prediction is required.

If a replicate has zero total weight or lacks a true class, record it and mark the phase's interval analysis unavailable rather than discard it or draw replacements. A no-predicted-positive replicate uses the declared zero precision convention and is counted/flagged. Both native classes must exist before bootstrapping. Do not interpret a confidence interval excluding zero as proof of superiority after development selection.

These intervals condition on the realised 21-day or 7-day period, the saved fitted models, chosen thresholds and observed clusters. Whole trajectories preserve within-series serial structure, while city/product resampling acknowledges shared geographical/product effects; it does not estimate uncertainty from unobserved future common time shocks, model retraining, selection, different countries or unseen assortments. Eighteen cities and one confirmation week limit inference regardless of millions of rows. Date/week diagnostics are not independent confidence replications. Claim conditional descriptive uncertainty, not universal significance or reliable long-horizon temporal confidence.

## 6. Exposure and confirmation policy

The prior audit inspected both publisher files, their full integrity/quality distributions and aggregate stockout prevalence. This dry run additionally exposes split and weekly class counts; it computes no model scores. Accordingly the publisher eval is **aggregate-exposed, prediction-unscored** as of this document. Never call it wholly untouched, blind, fresh external evidence or a new independent population. Later results can be described only as a predeclared later-time publisher confirmation benchmark after disclosed aggregate inspection. Both partitions contain the same series.

At development selection, save and hash the complete candidate table, chosen family IDs/thresholds, all development metrics, model parameters and this protocol. Keep publisher labels inaccessible to selection code. A separate confirmation entry point must require that frozen selection record and reject candidate grids, new thresholds or feature overrides. Refit only the three declared models, emit all publisher predictions before exposing aggregate performance, then score the locked comparisons once. Preserve results even if disappointing; no test-driven revision or improved rerun under this version. An integrity failure must be documented before any amended execution.

Record at least `publisher_eval_aggregate_exposed=true`, `publisher_eval_prediction_scores_previously_observed=false` before the first permitted score, `primary_iilas_task_evaluated=false`, `fresh_external_confirmation=false`, and `operational_acceptance=false`. After scoring, set the score-exposure flag true in a new append-only execution record; do not rewrite earlier history. In this writing task also record `model_fits=0`, `predictions=0`, `model_metrics=0`, `confirmation_evaluated_this_run=false`.

Truly fresh confirmation would require separately acquired, compatible, unexamined public outcomes under another dated protocol. No such population exists in this package, and no new acquisition is authorised here. This protocol cannot establish that FreshRetailNet training improves Backorder alert precision, IILAS risk accuracy, procurement outcomes or any production decision.

## 7. Resource limits, readiness gates and required artifacts

Use `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe` after dot-sourcing `../Enter-IILAS.ps1` from the app directory. Read Parquet through the existing isolated audit `_deps` PyArrow 23.0.1; do not alter it. Check the actual scikit-learn version and freeze it before execution; saved project evidence records 1.8.0, whereas the currently served stable RF documentation is newer. Use only parameters verified in the local estimator. All new raw-derived tables, row maps, probability files and models belong in a new ignored child of `research/datasets/`; refuse overwrite or path escape. Keep this protocol's dry-run folder and historical audit outputs immutable.

Resource ceilings for a future full run: **12 hours total wall time, 8 GiB combined runner/child resident memory, 4 GiB newly generated output, at least 10 GiB free disk and 10 GiB available physical RAM at start**. Before each fit require available physical RAM plus the already-resident runner/child memory to remain at least 10 GiB, reserving approximately 2 GiB beyond the maximum process budget. If either preflight fails, stop before fitting and report resource readiness false; do not close unrelated applications automatically. The parent task's current MSI check found 15.71 GiB total physical RAM, 3.31 GiB available and 12 logical CPUs: that observed state fails the 10 GiB initial free-memory gate. Recheck at actual execution time rather than assuming the later state matches this snapshot.

Run one fit at a time, RF `n_jobs=2`, and `threadpool_limits(2)` around fits. Read only necessary columns, predict in batches no larger than 50,000 rows and release completed estimators once saved. A supervisor process must check elapsed time, combined RSS and output bytes at least every five seconds. These ceilings are operational guards, not evidence of sufficient hardware or model quality. Stop on a breach; no automatic row sampling, reduced tree count, silent candidate omission or higher limits. A failed/interrupted candidate makes the comparison incomplete and prevents selection. The seven development fits and three confirmation refits include all permitted fit attempts; replacement attempts after a failure require an append-only reviewed execution decision under an amended execution record.

The choices in sections 1–6 are concrete and ready for review; `protocol_status="proposed"` and **`ready_for_training=false`** remain accurate because the separate runner and execution validation are not implemented. A future training request must first satisfy these gates:

1. Freeze this proposal and the explicit retrospective availability/recorded-event interpretation as the experiment's accepted scope; record actual owner review status without inventing supervisor approval. Do not broaden the claim to operational prediction without availability evidence.
2. Implement and review a separate benchmark runner. Synthetic boundary tests must prove shift-before-roll, same-series joins, exact 24-feature order, target-date cutoff, missing-day/duplicate/source-hash refusal, correct phase counts and train-only learned quantities. Marker targets must show publisher-eval rows cannot reach development fit/threshold/selection calls; the rolling confirmation simulator must not admit future dates. Check the six candidate threshold grids, Dummy exception, exact 7+3 fit accounting, deterministic ties, correct class column, paired cluster weights and invalid-replicate handling.
3. Reverify source hashes, all-row native count/flag consistency using the preserved audit evidence/code, count/range/identity checks and these date counts. Save feature-matrix and split-map hashes; every target appears exactly once in its phase and every lag source precedes it. Compare row-derived aggregate counts against a separately implemented reconstruction before fitting.
4. Freeze runner code hash, this document hash, all source hashes, full estimator parameters, package versions, source attribution, exact feature names, source-to-row mappings and exposure flags in a new immutable local manifest. Check ignored status, output/resource monitor behaviour and no active-inference destination. Run affected research software tests; synthetic success is not data quality or accuracy evidence.
5. Complete all seven development fits and all declared reporting. Lock family choices and thresholds with hashes before unlocking confirmation. Proceed to the three-refit/one-score confirmation phase only within a later explicitly requested execution that includes that phase; a development-only request ends before it.

Required later artifacts are the frozen protocol/manifest, eligibility and exclusion summary, local source-row/split/feature maps, hashes, candidate parameters, saved development probabilities and metrics, selected-pairs record, conditional bootstrap summaries, elapsed-time/peak-memory/output-size log and append-only execution status. Confirmation, if requested later, additionally requires pre-score prediction hashes, the three refit model hashes and locked aggregate reports. Do not save into primary inference model paths or upload IDs/data/probabilities to GitHub. Preserve failures and unavailable analyses explicitly.

## 8. Verification performed for this proposal

Local ignored evidence: `research/datasets/freshretailnet-protocol-2026-10-17/verify_eligibility.py` and `eligibility-verification.json`. The standalone verifier reads only the six necessary source columns, verifies SHA-256 before/after, reconstructs every series' 97 consecutive dates, checks publisher partition chronology, duplicate keys, city mapping across the combined source, native count/sales validity and all declared lag/window boundaries. It checks finite historical means without generating a training feature table or fitting anything. All 4,850,000 rows were covered; target-key overlap, missing dates, duplicate keys, cross-partition store/city conflicts and feature-cutoff violations were zero. All 50,000 series, 898 stores, 865 products and 18 cities were retained. Both classes occur in all three model partitions and all three development weeks.

The exact counts in section 3 were reconstructed from the pinned bytes; source hashes remained unchanged. This verifies the proposed eligibility rules and date arithmetic, not a training runner that does not yet exist. Runtime was Python 3.13.15, pandas 3.0.1, NumPy 2.4.2 and isolated PyArrow 23.0.1. The verifier exits successfully with the existing nonfatal Python startup-location warning. Original hourly consistency evidence is inherited from the preserved full audit, not falsely presented as repeated by this six-column scan.

Outstanding primary IILAS evidence remains independently reviewed three-class stock labels, valid available/reserved stock and replenishment/movement context, separately reviewed delivery-risk data and real parcel-image evaluation. Public recorded-stockout observations do not fill those gaps. No business threshold, operational readiness, supervisor acceptance or measured model improvement is claimed.
