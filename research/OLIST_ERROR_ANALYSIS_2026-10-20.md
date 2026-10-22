# Olist development error analysis — 20 October 2026

The frozen Random Forest generates 1,684 false alerts and misses 1,074 of 1,280 late validation orders. This descriptive follow-up locates those errors within the already observed development data. It introduces no new fit, model inference, threshold search, confirmation scoring or operational acceptance.

Read [the original execution](NATIVE_DEVELOPMENT_2026-10-20.md) and [the frozen protocol](OLIST_TRAINING_PROTOCOL_2026-10-17.md). The outcome remains retrospective binary calendar lateness conditional on recorded completion; it does not fulfil the primary Low/Medium/High IILAS task. The current selection and confirmation seals remain unchanged.

## Exposure and method

Validation outcomes and scores were already used for model/threshold selection before this analysis. These subgroup descriptions are post-selection development evidence, not independent test estimates. Purchase-month, weekday and lead-day groups describe the same validation observations. Lead bands were fixed before this analysis execution at 0–7, 8–14, 15–21, 22–30 and 31+ calendar days. There is no slice ranking, new selection criterion or subgroup threshold.

The script reads only the five necessary original orders columns, selects purchase windows before parsing delivered outcomes, reconstructs the original TRAIN/VALIDATION core, and applies the original delivery-known and promised-date maturity restrictions. Confirmation outcome rows are filtered out before outcome parsing or analysis. Full original source files are hashed for integrity; the existing source manifest and development metadata already disclose aggregate confirmation counts. This work does not turn that previously source-audited retrospective partition into an untouched prospective test.

Validation row order matches the sealed prediction index by order/month/week. For every selected family, reconstructed training labels and ordered training/validation feature matrices match its saved fit input; saved primary probability arrays also match the selected candidate. The original models are never loaded or invoked. Only aggregates are written, with no raw order/customer IDs or row-level predictions in this new artifact.

## Fixed validation comparison

All four families use the same 13,445 validation orders and 1,280 late outcomes (9.52% prevalence). TP/FP/FN/TN use lateness as positive. Precision is undefined when no alerts occur; recall is undefined when no positive outcomes occur.

| Family | Frozen threshold | TP | FP | FN | TN | Precision | Recall | Alert fraction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RF | 0.05 | 206 | 1,684 | 1,074 | 10,481 | 10.90% | 16.09% | 14.06% |
| DT | 0.59 | 6 | 40 | 1,274 | 12,125 | 13.04% | 0.47% | 0.34% |
| LR | 0.54 | 117 | 1,430 | 1,163 | 10,735 | 7.56% | 9.14% | 11.51% |
| Dummy | 0.50 | 0 | 0 | 1,280 | 12,165 | Undefined | 0.00% | 0.00% |

The table reproduces existing selected validation behavior. It supplies no evidence that the thresholds meet staff error costs or alert capacity.

## RF errors by purchase month and promised lead time

The RF threshold remains 0.05 throughout. Each grouping independently sums exactly to the overall counts above; the two groupings must not be added together.

| Purchase month | n | Late | Prevalence | TP | FP | FN | TN | Precision | Recall | Alert fraction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| January 2018 | 7,051 | 398 | 5.64% | 43 | 610 | 355 | 6,043 | 6.58% | 10.80% | 9.26% |
| February 2018 | 6,394 | 882 | 13.79% | 163 | 1,074 | 719 | 4,438 | 13.18% | 18.48% | 19.35% |

February accounts for 719 of the 1,074 missed late orders and 1,074 of the 1,684 false alerts. Its observed prevalence and alert fraction are higher than January's; these associations do not establish what caused the difference or predict a future month's performance.

| Lead days | n | Late | Prevalence | TP | FP | FN | TN | Precision | Recall | Alert fraction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0–7 | 0 | 0 | Unavailable | 0 | 0 | 0 | 0 | Unavailable | Unavailable | Unavailable |
| 8–14 | 507 | 22 | 4.34% | 13 | 289 | 9 | 196 | 4.30% | 59.09% | 59.57% |
| 15–21 | 2,948 | 256 | 8.68% | 109 | 694 | 147 | 1,998 | 13.57% | 42.58% | 27.24% |
| 22–30 | 7,046 | 806 | 11.44% | 72 | 567 | 734 | 5,673 | 11.27% | 8.93% | 9.07% |
| 31+ | 2,944 | 196 | 6.66% | 12 | 134 | 184 | 2,614 | 8.22% | 6.12% | 4.96% |

The 22–30-day group contains 7,046 orders and 734 missed late orders. The 8–14-day group has only 22 late outcomes: its recall is 13/22, while 289 of its 302 alerts are false. These are descriptive counts, not grounds to deploy different thresholds by lead time. There are no eligible 0–7-day observations, so that group's rates are unavailable.

The JSON flags denominators below 100 total rows, 20 positive outcomes or 20 alerts, fixed before analysis execution. These are display cautions rather than statistical guarantees: the 8–14-day group remains fragile with only 22 positives despite clearing the automatic flag. DT's overall precision rests on only six true alerts among 46 alerts. Empty groups and Dummy's zero alerts are explicitly flagged. Weekday aggregates (Monday=0 through Sunday=6) are retained in JSON without ranking them or inferring a mechanism. No new confidence intervals, significance tests or causal analyses were performed.

## Training versus validation distributions

Training contains 32,245 orders and 1,203 late outcomes (3.73%); validation contains 13,445 and 1,280 (9.52%). This observed prevalence difference is descriptive. It does not diagnose insufficient data, quantify concept drift, isolate a cause of errors or show that adding rows would improve the model.

| Existing feature summary | Train | Validation |
| --- | ---: | ---: |
| Promised lead mean | 25.21 days | 25.86 days |
| Promised lead Q1 / median / Q3 | 20 / 24 / 29 | 21 / 25 / 30 |
| Promised lead range | 8–147 | 8–82 |
| 0–7-day share | 0.00% | 0.00% |
| 8–14-day share | 8.97% | 3.77% |
| 15–21-day share | 22.17% | 21.93% |
| 22–30-day share | 47.82% | 52.41% |
| 31+-day share | 21.04% | 21.90% |

The retained training set spans all month-of-year values; validation is January/February by its fixed calendar design. Counts and fractions for all existing purchase-month, weekday and hour categories, plus the fixed lead bands, are preserved in JSON. No additional features, imputation, reweighting or transformations were fitted. Population restrictions and different calendar windows limit interpretations of these comparisons.

## Reproduction and checks

Local ignored artifact: `research/datasets/olist-error-analysis-20261020/`, containing `analysis.py`, `aggregates.json` and `checks.json`. From the full workspace:

```powershell
. ./Enter-IILAS.ps1
& 'C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe' research/datasets/olist-error-analysis-20261020/analysis.py
```

The command was run twice successfully; reruns verify identical aggregate/check bytes rather than overwrite prior output. Handcomputed metric checks cover confusion counts, inclusive threshold equality, no alerts, no positives and empty groups. All selected confusion matrices match the saved report; month, lead and weekday totals equal the overall result. Numerical libraries are constrained and verified at one thread.

Both runs validated the complete development seal before and after analysis. All 180 original run files and 12 source-manifest entries retained their hashes. No confirmation claim exists. All three new artifact paths are Git-ignored; no runner, model, protocol or original run artifact was changed. Source hashes, original runner/protocol hashes, analysis hash and aggregate hash are recorded in the local JSON.

- Original orders SHA-256: `8df58ef3d2d7e9944010f7beecd9b75367f5588ec6e3c91cec19ae3345ef9ecf`.
- Development seal SHA-256: `92e7a8b4ff122bb318074f4a89a563795dff87bfb522ad1516749e6b78603e7f`.
- Frozen selection SHA-256: `504ead4cd77db5bfe57bb45dc8b11694fa47ef7590009a37b0fd804b6509cbae`.

Exact analysis flags: `no_new_fit=true`, `no_new_model_inference=true`, `no_confirmation_scoring=true`, `no_confirmation_outcome_analysis=true`, `no_threshold_search=true`, `validation_previously_observed=true`, `post_selection_descriptive_only=true`, `primary_iilas_task_evaluated=false`, `operational_acceptance=false`.

The original source remains Olist v2 under its recorded CC BY-NC-SA 4.0 provenance; raw and derived data stay local. Any stronger-predictor proposal requires a new dated development protocol with verified purchase-time availability and an independent evaluation strategy. This analysis makes no such implementation or acceptance claim.
