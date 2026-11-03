# Bounded simulated stock training protocol

Date: 23 October 2026. ID: `inventory-bounded-training-1.0`. This implements the approved [AI-assisted prototype methodology](INVENTORY_AI_ASSISTED_PROTOCOL_2026-10-23.md), not an independent warehouse validation study. RF is the proposed main classifier, DT the comparison. All results are agreement with an AI-authored deterministic synthetic teaching policy under constructed assumptions. No model receives operational approval from this experiment.

## Frozen inputs and partitions

Use only main-01 manifest SHA-256 `8ef1f9a86466e63b54349a8cd34c6a62ca50fc4f9f6354be9d317bbd43da3962`. Check original source pins, explicit simulated/assisted provenance and separate development/test file hashes. Feature order: available_quantity, reserved_quantity, movement_frequency, reorder_distance, adjustment_count, days_since_replenishment. Class order: Normal, Reorder Risk, Critical Stock Risk. No IDs, text, intended strata, future supply/commitments or label columns enter the feature matrix. Reject missing/nonfinite values and invalid units/counts; never impute unknown real history.

The preparation audit already qualified all300 families. Development execution reads only240 development rows and group-ID metadata, never test.csv, test dossiers or regenerated main/pilot cases. Metadata/source hashes are not test observations. All parameter selection uses three StratifiedGroupKFold development folds, shuffle true, seed43; verify class support and train/validation family disjointness. Test60 remains reserved until both model-family choices and full-development artefacts are frozen. No re-splitting.

## Candidate and fit budget

DT: max_depth4/8 crossed with min_samples_leaf2/5. RF:100 trees, max_depth6/12 crossed with min_samples_leaf2/5, n_jobs2. Both use balanced class weights and random_state42. Other parameters use the installed scikit-learn defaults, whose version is pinned in the run manifest. No scaling, imputation, feature selection, calibration, oversampling or extra models are included. Eight settings times three folds=24 CV fits; selected DT and RF each receive one full-development fit, totalling26. Workers receive training labels and validation inputs, not validation truth or test observations. Selected full-development fits receive no evaluation rows.

Select within each model family by highest mean validation macro-F1, then highest mean Critical recall, smaller depth, larger leaf. Refuse incomplete/failed/duplicate or nonfinite candidate results. Do not declare RF superior by assumption or change settings based on test outcomes. Preserve all fit receipts, inputs, predictions, native resource evidence, model bytes and source versions; never replace fits or silently resume failures.

## Native resource and attempt controls

Use runner_runtime.ResourceSupervisor for the whole phase and every fit, hidden workers guarded by require_supervised_worker. Limits:900seconds total development plus evaluation,60seconds per fit, aggregate process-tree RSS2GiB, at least3GiB available Windows RAM/1GiB free disk before admission,100MiB output per phase (with combined development/evaluation also checked against100MiB), and two numerical threads. No GPU/WSL/install step. Do not close unrelated apps or lower limits automatically. Native monitoring/job cleanup failures refuse execution.

Each phase creates a fresh ignored directory below research/datasets. Development's cohort-specific registry claim is made only after preflight succeeds, then prevents further development attempts with a different output path. Evaluation requires a complete frozen development inventory/fit ledger and remaining time/output budget; its exclusive cohort-specific claim is made before test data are loaded. Test release is one-use across all output paths. A runtime failure after claiming preserves the attempt and requires deliberate investigation; no automatic retries, extra seeds or replacement data. These are local workflow guards against accidental reuse, not access control against a user editing source/data.

## Evaluation and disclosure

Load only the source-pinned locally fitted selected model artefacts. No refitting during evaluation. Freeze both models' ordered predictions/probabilities and row IDs, with a hash receipt, before computing any test metric. Report per-model accuracy, macro-F1, per-class precision/recall/F1/support, ordered3x3 confusion matrices, Critical-as-Normal misses and false alerts. A separate binary comparison collapses Reorder/Critical to Risk and compares RF/DT against available<=reorder warning; never invent a three-class rule predictor. Include an all-Normal majority reference because the constructed test classes are equal.

Use500 paired family-resampling bootstrap samples, seed44, to report conditional95% intervals for accuracy/macro-F1. No fits occur during resampling. There is one primary row per family; the same sampled indices apply to both models. These intervals describe uncertainty in the constructed synthetic cohort only, not independent people, products or warehouse operations. Keep complete paired arrays for audit. Inference timing is measured for the batch and per row; it is not end-to-end app latency.

Keep data/labels/weights/predictions/native logs and registry records ignored locally. The independent_human_review, independent_accuracy_validated and operationally_approved flags remain false. Missing real app inputs must still cause an explicit unavailable result; do not fill them from this simulation. App integration, independent data evaluation, production deployment, other AI and camera work are separate later stages. Leave this source-bound protocol unchanged after the experiment; write results in a separate guide/report.
