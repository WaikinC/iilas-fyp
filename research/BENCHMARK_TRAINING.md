# Public tabular benchmark training

## Scope and protocol fixed before the first run

This continuation implements the training handoff in [BENCHMARK_PREPARATION.md](BENCHMARK_PREPARATION.md). It uses the existing public native binary targets and frozen group partitions. It does not evaluate the primary three-class IILAS tasks or install models into application inference. Additional features remain deferred.

The first run uses **all rows** in the prepared inventory and delivery benchmarks. The inventory source has 1,929,935 records, with 1,543,947 train and 385,988 test. The minimised delivery source has 172,765 rows, with 120,798 train, 26,084 validation and 25,883 test. The existing sources and partitions are preserved; no sampling, relabelling or test-driven seed selection is permitted.

| Decision | Fixed protocol |
| --- | --- |
| Inventory comparisons | Majority Dummy, Decision Tree, Random Forest |
| Delivery comparisons | Majority Dummy, Decision Tree, Random Forest, Logistic Regression |
| Forest size and resource bounds | 64 trees, maximum depth 12, two worker threads; sequential fits |
| Tree settings | Maximum depth 12, minimum samples per leaf 2, minimum samples per split 2 |
| Logistic Regression | Balanced class weights, lbfgs, C=1, max_iter=1000, tolerance 0.0001 |
| Imbalance | Balanced class weights for RF/DT/LR; no resampling |
| Randomness | Fixed seed 42 |
| Inventory development | Three-fold StratifiedKFold within training, allowed only after verifying each row is an independent unique SKU group; explicit group-overlap checks in every fold |
| Delivery development | Fixed validation partition, with training rows only used for fitting |
| Comparison rule | Inventory arithmetic mean of three fold macro-F1 scores; delivery validation macro F1; exact ties use fixed order Majority, Decision Tree, Random Forest, Logistic Regression. Record selection before held-out test evaluation |
| Threshold | Fixed probability threshold 0.5; no test-set threshold optimisation |
| Preprocessing | Strict feature allowlist; delivery category ID categorical; fit encoders/scalers inside each training pipeline only |
| Test reporting | All predeclared comparisons on the same held-out rows; do not select a different winner after viewing test results |
| Outputs | Aggregate reports, precision-recall evidence and optional local benchmark models under ignored `research/datasets/benchmark-runs/` |

The Random Forest remains the report-committed model; a better benchmark baseline is reported honestly rather than silently replacing that commitment. These conservative fixed hyperparameters establish a reproducible first benchmark; they are not a claim of optimal tuning. Any future development-only tuning requires a new recorded protocol and a clear account of previous test-set exposure.

The inventory CV uses a verified singleton-group specialisation: the pinned source has exactly one row per SKU, so stratifying rows also stratifies independent groups. This avoids a general grouped-split implementation iterating over 1.54 million singleton groups. Repeated groups must fail this specialised path rather than silently leak across folds. A future longitudinal dataset requires an explicitly reviewed grouped-CV protocol.

## Integrity and evaluation requirements

The runner must verify pinned source bytes, split CSV checksum, protocol/kind/features, complete row correspondence, native labels/groups and deterministic split assignments before fitting. Output paths must stay in the ignored benchmark-run area and refuse overwrite. Identifiers, source-row numbers, cohort flags and labels cannot become predictors. No raw rows, personal data or credential values should appear in diagnostics.

Record per-class precision/recall/F1 and support, macro F1, balanced accuracy, confusion matrices, average precision and precision-recall evidence. Accuracy alone is insufficient for the rare backorder class. Delivery metrics weight order-item rows; grouped splits prevent repeated-order leakage but do not establish customer-level or temporal generalisation. Group-level or repeated-run uncertainty estimates remain separate future analysis, not implied by point scores.

The inventory source already contains upstream transformations whose full provenance is unavailable. Training-only preprocessing in this runner cannot undo that limitation. Negative published inventory encodings remain in the main benchmark. The predeclared negative-INV sensitivity comparison in the preparation document remains a separate future analysis and must not be used to choose the most favourable test result.

## Implementation and checks

Work is divided between a tabular runner agent and a parcel review agent, followed by independent review and combined verification. Meaningful tests cover source/split tampering, feature leakage, group separation, training-only preprocessing, metrics and output protections. Small synthetic test fixtures verify software only; their scores are never FYP results.

Run from the application directory after dot-sourcing the workspace's `Enter-IILAS.ps1`:

```powershell
python research/benchmark_train.py delivery --save-models
python research/benchmark_train.py inventory --save-models
```

Default destinations are `research/datasets/benchmark-runs/delivery-v1/` and `inventory-v1/`. Existing run directories refuse overwrite. A deliberately reviewed rerun needs a new `--output` path beneath `research/datasets/benchmark-runs/`; repeating the test evaluation is recorded exposure, not a fresh holdout. `--source` and `--splits` permit alternate local paths to exactly the pinned source and verified protocol, not arbitrary replacement data. The CLI returns 2 on redacted validation/runtime failure.

Each completed directory contains a pre-fit `protocol.json`, `selection-before-test.json`, `report.json`, exact runner/preparation source snapshots, per-model test precision-recall CSVs and, with `--save-models`, benchmark-only joblib files. No primary inference files are installed. A directory without `report.json` is incomplete and must not be cited as completed evaluation. Load only these operator-controlled local model files, never arbitrary uploaded pickle/joblib files.

Delivery completed using all 172,765 rows. Validation selected Random Forest (macro F1 0.701749), before evaluating the common 25,883-row test set. Its test macro F1 is 0.704568, positive precision 0.895438 and positive recall 0.554222. The classifiers are close in macro F1; these point estimates do not establish statistical superiority. Late-case recall shows a substantial missed-positive limitation at the predeclared threshold. These are native binary public benchmark scores, not primary IILAS Low/Medium/High risk evaluation.

| Delivery model | Validation macro F1 | Test macro F1 | Test late recall | Test average precision |
| --- | ---: | ---: | ---: | ---: |
| Majority | 0.363588 | 0.365519 | 1.000000 | 0.576092 |
| Decision Tree | 0.701251 | 0.703934 | 0.554222 | 0.817358 |
| Random Forest | 0.701749 | 0.704568 | 0.554222 | 0.841404 |
| Logistic Regression | 0.701645 | 0.704378 | 0.553350 | 0.841809 |

Inventory completed using all 1,929,935 rows. Mean training-CV macro F1 selected Random Forest (0.544167), before evaluating the common 385,988-row test set. Its test macro F1 is 0.540797, positive precision 0.067600 and positive recall 0.809796. It caught 2,265 of 2,797 backorders but also produced 31,241 false positives. The majority classifier's high raw accuracy would hide zero backorder recall; macro F1, minority metrics and precision-recall evidence make that limitation explicit. The current forest is a reproducible baseline with poor alert precision, not a basis for automatic replenishment decisions.

| Inventory model | Mean training-CV macro F1 | Test macro F1 | Test backorder recall | Test average precision |
| --- | ---: | ---: | ---: | ---: |
| Majority | 0.498182 | 0.498182 | 0.000000 | 0.007246 |
| Decision Tree | 0.518123 | 0.518354 | 0.828030 | 0.130968 |
| Random Forest | 0.544167 | 0.540797 | 0.809796 | 0.161248 |

No parameters, class weights or thresholds were changed after these results. Before any later optimisation, record a development-only protocol and the fact that these test scores have been observed. Improved development metrics alone will not prove improved primary IILAS performance; the missing primary features and three-class ground truth still need to be resolved.

## Final verification — 17 October 2026

All **68 research tests** pass on MSI, including 16 new benchmark-runner tests and nine parcel-adjudication tests. Independent review found and verified fixes for resolved queue-child paths and YAML asset-section scope. The first combined run exposed older test assumptions about temporary-directory placement and Python bootstrap stderr; tests now use an explicit outside boundary and distinguish the exact independently observed interpreter prefix from application diagnostics. Exit-code, redaction and JSON checks remain enforced. Production training code and measured scores were not changed by these test fixes.

Build passes with the existing bundle-size advisory. Lint reports zero errors and four existing image warnings. The normal source secret scan passes across 186 tracked files; the expanded scan including untracked source passes across 202 files. All 39 generated benchmark/review artifacts are ignored and no dataset files are tracked. Secret checks recognise specific patterns, not every possible credential. The initial parcel artifact is preserved; use `research/datasets/parcel-review-v2-verified/` for the completed review.

Independent artifact audits reconstructed confusion-matrix metrics and average precision from the saved PR curves for both benchmarks. Source/code/protocol/model/curve hashes match, all comparisons share their benchmark's held-out rows, and selection agrees with development scores. Local `artifact-verification.json` files retain aggregate checks. No model refit or threshold change followed the reported results.

Firebase/browser suites were not rerun because operational application code and data contracts were unchanged. No deployment, production access, commit or push occurred. Final primary three-class IILAS evaluation, independent human parcel labels/family approval, parcel training and operational acceptance remain incomplete. See [the parcel review](PARCEL_REVIEW_2026-10-17.md) for its precise evidence boundary.

## Primary implementation references

- [scikit-learn: avoiding data leakage with pipelines](https://scikit-learn.org/stable/common_pitfalls.html)
- [scikit-learn: StratifiedGroupKFold](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.StratifiedGroupKFold.html)
- [scikit-learn: average precision](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.average_precision_score.html)

The installed environment reports scikit-learn 1.8.0, pandas 3.0.1 and NumPy 2.4.2. Save actual runtime versions with every run; current online documentation can describe a later version.
