# Olist conditional basket/geography experiment — 20 October 2026

**Protocol ID:** `olist-conditional-basket-geography-1.0`. **Status:** defined research proposal; not implemented, trained or supervisor-approved. The user requested this protocol after the [error analysis](OLIST_ERROR_ANALYSIS_2026-10-20.md) and [availability audit](OLIST_FEATURE_AVAILABILITY_2026-10-20.md), and explicitly selected **balanced macro F1** for a comparable feature experiment. “V1” below means the existing four-feature experiment, “V2” this proposed ten-feature experiment; both use publisher source version 2.

## Purpose and boundaries

Test whether six additional basket/profile inputs improve the existing retrospective completed-order calendar-lateness benchmark under the same bounded RF/DT/LR selection procedure. The main comparison is **V2 RF minus V1 RF validation macro F1**, accompanied by precision, recall, average precision and false-alert/missed-order counts. This is a feature-set comparison under a common selection procedure; independently selected hyperparameters may differ, so it does not isolate the causal contribution of each new variable. No minimum improvement or operational acceptance threshold is invented.

The V1 validation results and error slices were observed before this proposal. Reusing validation is further development on exposed data. No confirmation scores have been opened. The original [protocol](OLIST_TRAINING_PROTOCOL_2026-10-17.md), runner, shared runtime, 21 fitted models and [sealed development result](NATIVE_DEVELOPMENT_2026-10-20.md) remain unchanged. This proposal does not authorize a training or confirmation invocation. It specifies the next implementation work. Additional application features, product/distance/history predictors and production activation remain outside scope.

Olist still lacks the primary report's complete Low/Medium/High delivery-risk ground truth. A stronger binary model would not complete that requirement.

## Source and explicit availability assumptions

Use the unchanged original local Olist ZIP at `datasets/olist-audit-2026-10-17/olist-v2.zip`, SHA-256 `967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784`, source manifest SHA-256 `2a42c040846d7a6ddbb8b79be818385e54f1ea7e49f88a3b4bcf788f93f957af`. Preserve the publisher attribution and recorded CC BY-NC-SA 4.0 terms. No new download or raw/derived data publication is required.

The proposed interpretation accepts the following **research assumptions**, subject to recording actual operator acceptance before real execution; it does not manufacture historical evidence:

1. Released item records represent the basket known at purchase, despite absent item-revision/seller-reassignment history.
2. `total_item_price` and `total_item_freight` mean sums of the released item-record fields. They are assumed to represent purchase-time amounts. Their precise allocation/finalisation semantics could not be reverified from the publisher dictionary. Do not call them verified invoice totals, revenue, profit or actual logistics cost.
3. Customer/seller states are released profile-location proxies assumed applicable at purchase. They are not proven delivery destination or dispatch origin, and no effective-dated profiles exist.
4. The original estimate-immutability and contemporaneous delivery-recording assumptions remain. Prediction time is purchase, not approval, dispatch or delivery.

No fallback to a different feature set is automatic. Rejecting these assumptions requires a separately versioned proposal before fitting. The [publisher overview](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce) and preserved metadata support broad item/location meanings, not these timing guarantees. The availability audit records the failed fresh dictionary retrievals.

## Cohort, target and temporal boundaries

Retain the original unique-order core: status `delivered`; valid purchase `P`, delivery `D`, estimate `E`; `D >= P`; `date(E) >= date(P)`. Label 1 iff `date(D) > date(E)`. Preserve naive source timestamps, calendar-day deadlines and missing/cancelled exclusions. For each cutoff `C`, require `D < C` and `midnight(date(E)) + 31 days <= C`. A same-day 23:59 delivery is on time; `D == C` is unavailable; maturity equality passes. Never relabel unresolved orders as on time or late.

| Role | Purchase window, start inclusive/end exclusive | Outcome cutoff | Orders | Calendar-late |
| --- | --- | --- | ---: | ---: |
| Train | 2016-09-01 to 2018-01-01 | 2018-01-01 | 32,245 | 1,203 |
| Validation | 2018-01-01 to 2018-03-01 | 2018-05-01 | 13,445 | 1,280 |
| Reserved confirmation | 2018-05-01 to 2018-07-01 | 2018-10-01 | 12,842 | 512 |

Confirmation counts above are already disclosed historical aggregates, not newly computed. Development must filter purchase windows before parsing outcomes or enriching inputs; no confirmation profiling/association/score enters implementation choices. A development preparation checks old/new **train and validation order sets, ordering, labels and weights exactly**, including 36,765/15,342 linked item records. Keep original exclusion accounting. No March–April supplementation, new random split, balancing, row duplication or train-plus-validation refit.

The audit's 539/83 itemless purchases use all-purchase-window denominators; the retained modelling cohorts already have items. Missing-enrichment behavior below is still explicit and tested. Missing data never changes cohort membership. Customer/product/seller recurrence and existing known-entity limitations remain.

## Exactly ten source-derived predictors

The ordered raw schema is fixed. No IDs, outcomes, source split markers, product lookup attributes, ZIP coordinates, absolute date/year, historical targets or extra numeric missing indicators enter the matrix.

| # | Column | Exact definition |
| ---: | --- | --- |
| 1 | `purchase_month` | Month 1–12 from `P`, categorical. |
| 2 | `purchase_weekday` | Monday=0 through Sunday=6 from `P`, categorical. |
| 3 | `purchase_hour` | Hour 0–23 from `P`, categorical. |
| 4 | `promised_calendar_lead_days` | Integer `date(E)-date(P)`, numeric; zero remains valid. |
| 5 | `item_record_count` | Number of unique item records for the order; no items means missing, not zero. |
| 6 | `total_item_price` | Exact sum of all item-record prices when all are valid; otherwise missing. |
| 7 | `total_item_freight` | Exact sum of all item-record freight values when all are valid; otherwise missing, independently of price validity. |
| 8 | `customer_state` | Valid source state code or `UNKNOWN`. |
| 9 | `seller_state` | Sole distinct state if all required sellers have known states; `MULTIPLE` if there are two or more states; otherwise `UNKNOWN`. |
| 10 | `all_sellers_same_state_as_customer` | `SAME` if all known seller states equal the known customer state; `DIFFERENT` if all are known and at least one differs; otherwise `UNKNOWN`. |

**Joins and monetary rules.** Require unique order/customer/seller lookup keys and `(order_id, order_item_id)` pairs; duplicate keys fail preparation. Filter allowed order IDs first, join item sellers many-to-one, aggregate before the order join, then assert one row/one unit weight per retained order. Count records, not maximum item index. Repeated products/sellers on separate item records remain separate items. Missing seller lookup values affect geography only; no product lookup is needed. Broken customer identity linkage still fails the original grouping contract; missing customer state is allowed.

Strip surrounding whitespace from amount strings, parse directly with `Decimal`, require finite nonnegative values, and preserve zero. Missing/unparseable/negative/nonfinite values make that order's corresponding total missing with an aggregate diagnostic reason; they do not remove its row. Never sum only the known items. Sum exactly using common-exponent integer coefficients (or an equivalently exact decimal implementation), without currency conversion, clipping or rounding to cents. Convert the completed sum once to float64; a nonfinite conversion makes that total missing and is reported. No item-level imputation. Source hashes and the pinned cohort prevent silent replacement of source bytes; invalid-value treatment is a modelling convention, not data repair.

**States.** Strip whitespace, but do not uppercase, repair, infer from ZIP/city or look up live APIs. Accept exactly `AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO`; all other values become `UNKNOWN` with blank/nonmember diagnostics. This fixed 27-code membership set, including DF, was verified on 20 October 2026 against the [official IBGE locality API](https://servicodados.ibge.gov.br/api/v1/localidades/estados). It validates codes, not historical locations. Seller grouping uses distinct seller references and then distinct states. Two sellers both in SP yield `SP`. Any unknown required seller state takes precedence over `MULTIPLE` and over `DIFFERENT`; no items yields unknown seller geography.

## Frozen preprocessing

Each candidate owns a pipeline fitted only on the retained training cohort:

- Categorical columns 1–3 and 8–10: train-discovered `OneHotEncoder(handle_unknown='ignore')`, no category dropping/merging/frequency grouping. A valid unseen state remains that code; record unseen counts separately. A token absent from training is handled by the same unknown-category rule, not by refitting the encoder.
- Numeric column 4 must already be valid and passes through. Columns 5–7 use medians learned from training only, with no extra missing-indicator predictors. An entirely missing training column fails preparation; do not drop it or invent a fallback. Freeze medians and output order.
- RF/DT/Dummy use imputed numeric values without scaling. LR uses a training-fitted `StandardScaler` over all four numeric columns after imputation. Numerical outputs must be finite. Retain the declared numeric order alongside encoded names.
- No resampling, SMOTE, calibration, feature selection, logarithms, clipping, alternate geography encoding, product features or seller history.

The one-hot dimensions depend only on training categories; ten refers to source-derived columns, not expanded encoded width. Missing/unseen diagnostics are reporting fields, not extra predictors. These boundaries follow [scikit-learn 1.8 leakage guidance](https://scikit-learn.org/1.8/common_pitfalls.html), [encoder behavior](https://scikit-learn.org/1.8/modules/generated/sklearn.preprocessing.OneHotEncoder.html) and [imputer behavior](https://scikit-learn.org/1.8/modules/generated/sklearn.impute.SimpleImputer.html).

## Fixed development budget and selection

Exactly **13 additional fits**, sequential, seed `20261017`, in the order RF then DT then LR then Dummy. Within each Cartesian grid, the first listed parameter is the outer loop. Freeze installed sklearn 1.8.0 defaults and complete estimator parameters in the manifest.

| Family | Fixed settings | Ordered grid | Fits |
| --- | --- | --- | ---: |
| RF | 200 trees, Gini, depth 16, sqrt features, bootstrap, `n_jobs=1` | leaf `[5,20]` × weight `[None,balanced_subsample]` | 4 |
| DT | Gini, depth 8 | leaf `[5,20]` × weight `[None,balanced]` | 4 |
| LR | lbfgs, L2, intercept, max_iter 2000, tol 0.0001 | C `[0.1,1.0]` × weight `[None,balanced]` | 4 |
| Dummy | prior strategy, threshold 0.5 | No grid | 1 |

Candidate IDs are `v2-00-RF` through `v2-03-RF`, `v2-04-DT` through `v2-07-DT`, `v2-08-LR` through `v2-11-LR`, and `v2-12-Dummy`. No new sensitivity fits, repeated seeds, extra feature variants, cross-validation fits or confirmation refits. This budget does not reopen V1's 21 fits or the separate Backorder/DataCo plan. A failed candidate makes the experiment incomplete; no candidate replacement/removal or opportunistic higher iterations.

Use the original 202 thresholds: `k/200` for `k=0..200` plus `nextafter(1,+infinity)`; late iff class-1 probability `>= threshold`. Dummy stays at 0.5. Select within family using descending macro F1, positive F1, average precision; ascending candidate index, absolute distance from 0.5; then descending threshold. Round metrics to 12 decimals only for ties; use exact decimal threshold distance. Check class-label order, finite probabilities and both classes. Report every family at selected threshold and 0.5. The user explicitly retained this balanced rule; there is **no minimum-recall constraint or precision-maximising secondary selection**.

Reuse V1's sealed primary choices and probabilities for paired validation comparison; do not retrain, reselect or overwrite them. Preserve its RF threshold 0.05, DT 0.59, LR 0.54 and Dummy 0.5. A descriptive overall V2 winner may be recorded, but RF remains the primary reported family. Save all candidate scores and freeze choices before any confirmation operation.

## Required reporting and uncertainty

Publish all primary families for both experiments: denominator, prevalence, accuracy, balanced accuracy, macro F1, both classes' precision/recall/F1/support, step-weighted AP, `[0,1]` confusion matrix, alerts/rate, FP/FN and undefined-precision flags. AP stays a point estimate. No-alert precision is numerically zero for scoring and explicitly undefined for interpretation. Missing-class metrics are unavailable, not grounds to alter rows/dates. Preserve complete validation PR curves without selecting an extra operating point.

Prespecify purchase-month and lead-day bands `0–7,8–14,15–21,22–30,31+`; empty groups remain visible. Retain original unseen-at-window-origin customer and 60-day-maturity slices, with no extra fitting or selection. Reuse the original customer novelty definition, including earlier excluded/unused purchases without their outcomes. Report V1/V2 on identical row sets. No new exact-label or chronology diagnostic/sensitivity scoring is required for V2; retain V1's existing historical development evidence unchanged.

For validation and any agreed joint confirmation, compute separate paired customer-cluster and Monday-start purchase-week analyses: 500 replicates each, seed 20261017, same sampled cluster multiplicities across V1/V2/families, 2.5th/97.5th percentiles for macro F1, positive precision/recall, balanced accuracy and alert rate. Prespecify V2-minus-V1 differences within each family, with RF macro F1 the primary contrast, plus V2 RF-minus-DT/LR context. No refitting, redraws, class balancing or AP intervals. Suppress an affected interval if fewer than 475 class-complete valid replicates; count invalid/no-alert replicates. These separate dependence analyses condition on fitted selected models and do not correct repeated validation use, selection uncertainty or multiple reporting contrasts. No causal/superiority/operational claim follows solely from an interval excluding zero.

## Proposed one-time confirmation amendment

**This is a specified proposal, not acceptance or execution authorization.** Until separately accepted, V1's reserved confirmation stays under its original policy and V2 stops after development. The recommended amendment is one fixed joint retrospective report on the same 12,842 reserved orders, after both development records are sealed. Do not search other Olist windows for favourable confirmation.

If accepted before any confirmation scores are opened, freeze both canonical run paths, source/selection/seal hashes, all required arrays and reporting contrasts. Generate **12 V1 arrays** (four primary, four original exact-label sensitivity, four original chronology sensitivity) and **four V2 primary arrays**, with zero fitting. V1's original sensitivity reports remain separate and cannot choose the V2 design. Persist and hash all 16 arrays with row mapping before any model-performance metric. The main V1/V2 contrast uses calendar labels and identical primary rows. Report the prespecified comparison regardless of its outcome; confirmation cannot select a winner for further tuning, repair thresholds, justify a third feature experiment on the same cohort, or activate an app model. Afterwards mark this cohort score-exposed in a new record.

A later separate wrapper must validate both seals and unchanged old code/protocol/runtime. Acquire a fixed pair-level exclusive claim independent of output-folder choice, bound to canonical paths/hashes; then exclusively create V1's supported `confirmation.claim` and V2's corresponding claim before confirmation data access or prediction. Any pre-existing claim, partial acquisition or failure stops the attempt and preserves all claims. Never delete claims, invoke the old `confirm()` alongside it, or change old source/seals. Old inventory validation already excludes its canonical claim file. Its legacy protection is path-local: manual copied runs can evade it, so forbid copied-path invocations and do not claim adversarial/global enforcement by the unchanged legacy CLI. This protects against accidental replay, not an administrator altering files.

If the amendment is not accepted, V2 remains development evidence pending another explicitly designed evaluation route. No acceptance or confirmation claim is created by this document.

## Resources, integrity and later implementation

Use MSI's existing `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe` after dot-sourcing `Enter-IILAS.ps1`, with the current pinned environment recorded and no dependency upgrades. Read only needed tables/columns; keep datasets, matrices, IDs, models, predictions and failure evidence under fresh ignored `research/datasets/` children. Never save into operational inference paths. Preserve old code hashes; implement separate `olist_conditional_features.py`, `olist_conditional_train.py` and tests later, reusing only read-only verified helpers from V1.

Limits: one numerical thread/RF job, **3 GiB currently available RAM** at phase start and before each fit, **2 GiB combined process-tree RSS**, **600 seconds/fit**, **1 GiB free disk**, **2 GiB output per phase**. Native Windows Job supervision covers preparation, fits, predictions and reporting, polling every second. Missing monitoring, LR convergence warning, invalid output, source/cohort mismatch or a resource breach fails closed. Fresh destinations and exclusive development claims prohibit retries by changing output paths.

V2 has a separate **5,400-second cumulative supervised budget**. Charge any real-source preparation, development and joint confirmation to it; synthetic implementation tests are separate software checks. A successful optional preparation does not consume a fit attempt but its immutable elapsed record must be included at development preflight. Standalone preparation is optional: development may perform the preparation checks once internally. No unrecorded/repeated real-source preparatory invocation can reset time. Failed execution is preserved; any recovery needs an append-only reviewed decision accounting for attempts and exposure.

Joint confirmation, if accepted later, has timeout `min(5400 - sealed_V1_elapsed, 5400 - cumulative_V2_elapsed)`. Charge its entire supervised wall time to both ledgers. Derive V1 elapsed from its validated outer result, not rounded report text. Refuse nonpositive remaining time; no borrowing/resetting V1's limit. Require 3 GiB available before loading/predicting each next saved model, process sequentially and release it afterwards. No silent sample reduction or lower tree count.

Required V2 artifacts: assumption/decision record, source and code hashes, protocol hash, exact ten-feature/missingness/category contract, ordered train/validation row-map and feature hashes, learned preprocessing metadata, fixed registry/versions, fit ledger, saved probabilities, full metrics/PR curves, immutable selection, resource logs and final parent-completion seal. Bind V1 seal SHA-256 `92e7a8b4ff122bb318074f4a89a563795dff87bfb522ad1516749e6b78603e7f` and selection SHA-256 `504ead4cd77db5bfe57bb45dc8b11694fa47ef7590009a37b0fd804b6509cbae`. Preserve all inputs and prior evidence even if V2 performs worse.

Exposure/status fields must distinguish `v1_validation_scores_observed_before_v2_protocol=true`, `v2_validation_reused=true`, `confirmation_source_aggregates_previously_observed=true`, actual confirmation score exposure, `primary_iilas_task_evaluated=false` and `operational_acceptance=false`. This planning task records zero new fits, feature matrices, predictions and confirmation scores; `runner_implemented=false` and `ready_for_training=false`.

## Acceptance cases for later implementation

| Case | Required result |
| --- | --- |
| Two items, prices 10.10/2.20, freight 1.00/0, sellers both SP, customer SP | Count 2, totals 12.30/1.00, `SP/SP/SAME`; exact decimal aggregation. |
| Same basket, sellers SP/RJ | Same totals, seller `MULTIPLE`, relation `DIFFERENT`. |
| One missing/invalid price, valid freight | Price total missing; freight/count retained; no partial price sum. |
| Item IDs 1 and 3 | Count 2, not 3. |
| Duplicate item or lookup key | Fail preparation; no silent deduplication. |
| No items, customer SP | All three item numerics missing; `SP/UNKNOWN/UNKNOWN`; row retained. |
| Sellers SP and unknown, customer RJ | Seller/relation both `UNKNOWN`; numeric aggregates independently valid. |
| Valid unseen state or token | Frozen encoder handles it without fitting; unseen count reported. |
| Entire new numeric training column missing | Fail preparation; no guessed fallback or column removal. |
| Validation-only extreme/missing values | Training medians/scalers/vocabularies unchanged; no clipping/retraining. |
| Added enrichment | Exact baseline train/validation IDs, labels, order and unit weights; ten raw columns only. |
| Confirmation sentinel records during development | Never parsed for outcomes, enriched, fitted, selected or scored. |
| Missing candidate / failed convergence / exhausted resource limit | Incomplete run, no successful final selection seal. |
| Changed source/code/selection or existing/partial claim | Refuse confirmation before prediction/scoring; preserve evidence. |
| Joint prediction failure after some arrays | No metrics until all 16 arrays complete; attempt remains consumed. |

A later implementation must run meaningful synthetic tests for these cases, a bounded no-fit train/validation integrity check, independent review and current preservation/Git/secret checks before real training. The original research suite provides historical software evidence only; it has not verified this unimplemented runner. Actual runtime feasibility and any precision/accuracy improvement remain unmeasured.
