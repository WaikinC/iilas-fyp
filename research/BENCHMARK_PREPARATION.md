# Public benchmark preparation

Continuation: the runner and first full public tabular benchmark results are now recorded in [BENCHMARK_TRAINING.md](BENCHMARK_TRAINING.md). This document preserves the preparation protocol and its original handoff; its "not trained" statements describe the preparation stage, not the later completed binary benchmark runs.

This implements the next research roadmap step after [source collection and label review](LABELLING_REVIEW_2026-10-17.md). It freezes reproducible splits for the two public **binary** tabular benchmarks. It does not train a model, replace the primary IILAS input contract, create three-class ground truth or activate inference. The user selected public data only; additional features remain deferred.

## Run on MSI

Dot-source the full workspace's `Enter-IILAS.ps1`, which selects the working toolchain and changes to the application directory. Then:

```powershell
python research/benchmark_prepare.py inventory
python research/benchmark_prepare.py delivery
```

Default sources are the verified files in `research/datasets/public-sources-2026-10-17/`. Default outputs are `research/datasets/benchmark-splits-v1/inventory/` and `delivery/`. Outputs already exist from the verified preparation run; rerunning at those destinations intentionally refuses to overwrite. To reproduce, pass a new `--output research/datasets/benchmark-reproduction/inventory` or corresponding delivery folder. The CLI accepts only source/output paths inside the ignored dataset area and requires the pinned source checksum. A new source version needs a deliberate code/protocol revision, not a bypass flag.

Each result has `splits.csv` and `manifest.json`. The split CSV maps a one-based source CSV line (`source_row`, with header on line 1) to pseudonymous group ID, native binary label and split. Inventory also records a negative-inventory cohort flag for sensitivity analysis. **None of these audit columns is a predictor.** Source files remain unchanged. The JSON records source/code/output hashes, selected features, class/group counts, limitations and training constraints. Exit 0 means preparation completed; exit 1 means a schema/hash/group/output problem stopped it. It is not a model acceptance test.

## Split protocol

Protocol `public-benchmark-splits-1.0` uses seed 42. Within each native target class, sort independent group IDs by SHA-256 of `seed + NUL + group_id`, with the group ID as a deterministic tie-breaker. Allocate integer-floor quotas of 80% train for inventory, or 70% train plus 15% validation for delivery; the remainder is test. This is stratification by **group count**, so delivery row percentages can differ slightly because orders contain different numbers of items. Assignments do not depend on CSV row order or Python's random hash seed.

Every source row is represented exactly once. Each group stays in one split. Conflicting targets within a group, missing classes, fewer than 20 independent groups per class, malformed numeric values, nonfinite inputs or unexpected source columns stop preparation. The group minimum is a software guard, not a statistical sufficiency claim. No stratification seed was selected using model performance, and no model has seen the test partitions.

## Inventory source semantics and feature dictionary

The [publisher dataset page](https://data.mendeley.com/datasets/krnbcxksn3/1) and [linked original paper](https://ieeexplore.ieee.org/document/8285684) identify a backorder classification problem. The accessible material does not document the complete encoding/preprocessing of the downloaded CSV. Observed INV values span -1 to 1, while many amount columns use fractional scales. Therefore **do not interpret this file as raw IILAS stock units**, derive reorder distance from it or reverse-engineer raw quantities without evidence.

| Fields | Benchmark use |
| --- | --- |
| INV | Published inventory encoding, retained unchanged including negative values |
| TIM | Registered transit-time field; no new unit or missing-value interpretation imposed |
| FOR3, FOR6, FOR9 | Published forecast features; not actual future realised sales |
| SAL1, SAL3, SAL6, SAL9 | Published historical sales encodings; preserve names because source prose inconsistently describes the intermediate history window |
| MIN | Published minimum-stock encoding; not directly converted into a raw reorder threshold |
| OVRP | Published overdue-supply feature |
| SUP1, SUP2 | Published supplier-performance encodings |
| BO | Native binary target only |
| SKU | Pseudonymised group identity only |
| INQ, OVRA, RSK1–RSK6 | Excluded from predictors in version 1.0 because their precise meaning/timing is insufficiently established for this benchmark protocol |

No value is clipped, imputed, rescaled or relabelled during split preparation. No -99 values were found in the earlier focused INV/TIM/SUP1/SUP2 audit. This does not rule out other upstream missing-value treatment. All 6,654 negative-INV rows are retained: 5,617 native negatives and 1,037 positives. Dropping them would change the target distribution and could remove meaningful source behaviour. Predeclare a later sensitivity comparison using the same split assignments with those rows excluded; report it separately and never select the more favourable test result as the main result.

The source's full preprocessing provenance and prediction-time availability remain limitations. Benchmark scores may describe performance on this published encoding; they cannot establish leakage-free raw-data preprocessing, temporal generalisation or the primary three-class stock task.

## Delivery source semantics and feature dictionary

The [publisher's DataCo dictionary](https://data.mendeley.com/public-files/datasets/8gx2fvg2k6/files/29dc7b05-dda6-4834-8354-5b5cc44430df/file_downloaded) describes the native target as late versus not late. This task uses the previously minimised, hash-pinned derivative, not the original personal/contact fields.

| Predictor | Source mapping and treatment |
| --- | --- |
| payment_type | Source Type, the transaction category; categorical |
| scheduled_shipping_days | Scheduled delivery days; zero is valid for same-day service, not automatically missing |
| shipping_mode | Source service category; categorical |
| item_quantity | Source order-item quantity, not parcel count |
| category_id | Source product-category code; treat categorically in the benchmark model |

The derivative excludes 7,754 cancelled-shipping rows under the previously documented eligibility rule. Remaining rows preserve the original binary target. Repeated order-item rows are retained and assigned by shared order ID; identical feature values alone do not prove that two item records are duplicates. Actual duration, final delivery/order status, customer identity, contacts, password fields and precise coordinates are not predictors. This benchmark does not establish customer-level or future-time generalisation; customer IDs were deliberately omitted.

## Verified tabular partitions

These are preparation counts, not measured model results.

| Benchmark | Partition | Rows | Independent groups | Native positive rows |
| --- | --- | ---: | ---: | ---: |
| Inventory | Train | 1,543,947 | 1,543,947 | 11,184 |
| Inventory | Test | 385,988 | 385,988 | 2,797 |
| Delivery | Train | 120,798 | 44,027 | 69,164 |
| Delivery | Validation | 26,084 | 9,434 | 14,902 |
| Delivery | Test | 25,883 | 9,436 | 14,911 |

## Parcel boundary

The 40-image synthetic pilot has 30 distinct source model names. Repeated renderings of the same exact model name must share a candidate group, but that alone does not certify independence between related model assets. Source flags remain candidate Normal/Damaged labels. Visibility concerns and potential related base-model families require review. A review queue may record candidate groups and source integrity; it must leave final split and human-review fields pending. No 70/15/15 image evaluation is claimed from this small, unadjudicated pilot.

The implemented queue is generated with:

```powershell
python research/parcel_review.py --source research/datasets/public-sources-2026-10-17/parcel3d-pilot --output research/datasets/benchmark-splits-v1/parcel-review
```

That output already exists; choose a new ignored destination to reproduce without overwriting. The CLI verifies local file bytes/SHA-256, manifest/config/triage consistency, exact model grouping, source path containment and unique image hashes. It writes `review-queue.csv`, `review-summary.json` and `verified-files.json`; the summary retains hashes of three input metadata files. Verified: 40 samples, 20/20 source candidate labels, 30 exact-model candidate groups, 120 source files and 40 distinct image hashes. All 40 labels remain pending; approved family IDs and splits are blank. Five inherited low-light/small-object flags require closer inspection. Exit 2 reports a redacted input/output failure.

This tool checks local consistency, not publisher authenticity, fresh decoding, full-resolution human review or the entire upstream archive. Review the images and related model assets before accepting any labels/groups. The 40-image synthetic pilot is a review exercise, not a sufficient final real-parcel evaluation dataset.

## Verification evidence

On MSI, all 43 research tests passed, including 8 new tabular and 13 new parcel preparation tests. The production build passed; lint reported zero errors and four existing image warnings. Real tabular manifests were independently checked for complete source-row coverage, both classes per partition, zero group overlap and matching source/code/output hashes. The exact executed tabular source snapshot and aggregate `verification.json` are retained locally with each output. Tests use temporary synthetic fixtures only; their results are software evidence, not FYP model performance. Firebase/browser tests were not rerun for this research-only batch.

## Training handoff

Independent review found a parcel YAML ambiguity: quoted duplicate fields could previously hide behind an accepted value. The parser now detects relevant keys/sections before value validation; six malformed-configuration cases pass and the reviewer confirmed resolution. The final expanded secret scan passed across 196 tracked/untracked source files. All 11 generated benchmark files are ignored and no dataset files are tracked. Secret checks recognise specific patterns and are not universal credential detection.

Next implement a benchmark-specific runner that reads and verifies these manifests. It must select exactly the listed predictors, fit encoders/scalers and any resampling on training data only, use grouped training cross-validation for inventory and the fixed validation partition for delivery, and evaluate all selected model comparisons on the same held-out data. Keep the native binary targets and clear benchmark names. Do not pass these manifests to the primary six-feature trainers or save benchmark artefacts into their active inference directory.

Retain a majority-class baseline and per-class precision/recall/F1, macro F1, confusion matrices and precision-recall evidence for imbalanced stock data. A training runner and actual benchmark results are still pending. No deployment, production data access or additional feature work is included.
