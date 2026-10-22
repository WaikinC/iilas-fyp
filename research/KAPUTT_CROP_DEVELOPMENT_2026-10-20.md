# Expanded crop-only parcel experiment — 20 October 2026

The larger publisher-labelled development experiment completed locally on MSI. All four planned fits and independent raw-validation checks passed, but performance remains weak. This is not an independent test evaluation or an accepted IILAS model. MobileNetV2 remains primary and EfficientNetB0 the comparator; PackageDamage remains the separate frozen external reference. Other AI modules and additional features remain deferred.

## Frozen cohort and dependency policy

The verified official crop archive and revised intake supply the source images described in [the intake report](KAPUTT_CROP_INTAKE_2026-10-20.md). All images come from publisher TRAIN. The two technically inadequate item groups removed during intake remain excluded, without replacement.

Before fitting, all 188 cross-item dHash distance-at-most-four candidate pairs were connected transitively at source-item level. Entire connected components were quarantined if they touched an earlier-sample candidate or crossed the proposed training/validation boundary. This removes 99 development images from 55 source items in seven components, without replacing, relabelling or moving surviving assignments. These are conservative dependency groups, not proof of physical parcel identity. Similarity filtering can preferentially remove plain, low-texture packaging.

| Partition | Images | Normal | Damaged | Source items | Dependency components |
| --- | ---: | ---: | ---: | ---: | ---: |
| Training | 633 | 369 | 264 | 377 | 373 |
| Validation | 133 | 80 | 53 | 76 | 76 |
| Development total | 766 | 449 | 317 | 453 | 449 |

Mixed-label components keep every original per-image publisher label. Their presence does not justify a majority label. Each component contributes equal total statistical weight within its partition. Image-level unweighted metrics are retained alongside component-weighted metrics.

The 147 reserved internal-test candidates remain metadata only and unextracted. Their technical and dependency admission policy is fixed in the protocol before training: whole-component exclusions for inadequate images or overlap with development/earlier samples; no replacements, relabelling, retraining or model/threshold changes based on test inspection. They are internal TRAIN-source candidates, not the publisher's official test set or an independent IILAS acceptance set.

## Training protocol

Four serial fits compare MobileNetV2 and EfficientNetB0, each with standard preprocessing and CLAHE. Both use exact verified official ImageNet checkpoints, frozen backbones, RGB letterboxing to 224 pixels, training-only augmentation, seed 42, batch size four, at most ten epochs, and early stopping with patience three on component-weighted validation loss. Contrast is selected separately for each architecture by component-weighted macro F1, then weighted negative log likelihood, then standard preprocessing on an exact tie. Confidence remains uncalibrated and exact score ties abstain.

All four fits must succeed before selection. Exclusive experiment claims prevent a replacement fit or rerun of the same scientific setup. Source, cohort, protocol, environment, checkpoint and output hashes are bound into receipts. The previous pilot and its once-only internal test remain unchanged.

The pre-fit resource amendment permits at most 3,000 seconds per fit and 12,300 seconds for the phase, 2 GiB aggregate process-tree RSS, one compute thread per library, 3 GiB available RAM at admission, a 768 MiB available-RAM floor, a 2 GiB free-disk reserve and 512 MiB output. A supervised read-only hardware probe informed the amendment before any fitting or experiment claim; no validation outcomes informed it. Workers are offline and CPU-only.

## Development findings

The frozen rule selected CLAHE for MobileNetV2 and standard preprocessing for EfficientNetB0. Selection uses component-weighted macro F1, not damage precision alone. All figures below are from the same 133-image development validation set used for selection, not untouched test performance.

| Fit | Epochs | Component-weighted accuracy | Component-weighted macro F1 | Fit seconds |
| --- | ---: | ---: | ---: | ---: |
| MobileNetV2 standard | 4 | 56.36% | 0.5633 | 162.71 |
| MobileNetV2 CLAHE — selected | 5 | 57.13% | 0.5648 | 245.75 |
| EfficientNetB0 standard — selected | 4 | 58.33% | 0.5801 | 241.14 |
| EfficientNetB0 CLAHE | 4 | 56.47% | 0.5586 | 285.03 |

| Selected model | Component-weighted Damaged precision | Component-weighted Damaged recall | Unweighted image accuracy | Unweighted Damaged precision / recall |
| --- | ---: | ---: | ---: | ---: |
| MobileNetV2 CLAHE | 57.42% | 46.17% | 56.39% | 44.68% / 39.62% |
| EfficientNetB0 standard | 58.25% | 50.90% | 56.39% | 45.10% / 43.40% |

MobileNetV2 detects 21 of 53 damaged validation images, misses 32 and flags 26 normal images as damaged. EfficientNetB0 detects 23, misses 30 and falsely flags 28 normal images. A constant Normal answer would score 80/133, or 60.15%, on unweighted accuracy while detecting no damage. The models' higher macro F1 than that trivial answer does not make their error rates acceptable for reliable parcel inspection. Component weighting changes the contribution of multi-view groups, explaining differences from image-level figures.

Do not compare these numbers directly with the earlier five-image pilot test as an improvement estimate: the cohort, partition role and weighting differ. Do not select a different contrast or threshold after inspecting the reserved test set. No uncertainty or IILAS generalisation claim is established by development validation.

## Verification and terminal execution

Parent combined verification ran 299 research tests in 219.639 seconds: no failures, two Windows symlink-privilege skips. The explicit supervised TensorFlow software check verified weighted loss including a short last batch. This is software evidence, not parcel-model accuracy. Manifest tests, source review, independent cohort reconstruction and actual protocol/preservation checks also passed.

The single development process, session `47658`, terminated with exit 0 after 948.27 seconds of supervised phase time, about 15 minutes 48 seconds. Aggregate peak process-tree RSS was 1,242.53 MiB, within the 2 GiB cap; outputs occupy about 51.35 MiB. Every fit succeeded within its own cap. Its ignored output is `research/datasets/kaputt-crop-development-20261020/development-01`. The completed one-use claim prevents another copy of this experiment.

The parent independently verified all fit/model/history/raw-prediction/worker/resource/phase/claim links and reconstructed confusion, precision/recall/F1, accuracy, NLL, component weights and both selected variants from raw probabilities. Restored-model raw NLL reproduces each fit's best validation loss. All 17 logged epochs completed the expected 159 training batches. Keras emitted finite-dataset exhaustion and ignored-shuffle warnings; full epoch counts were checked, and the generator itself supplies deterministic training permutations. No warning was hidden or treated alone as a failure.

Ignored evidence: `outputs/kaputt-crop-development-20261020/parent-terminal-audit-01.json`, its audit script/log, `preservation-after-fit-01.json` and the independent terminal review. All old pilot source/manifest/protocol/selection/test seals remain unchanged. The reserved test paths remain absent; no test pixels were acquired or scored.

Datasets, labels, split records, models and detailed outputs remain local and Git-ignored. The server acceptance pin remains null. No model was activated, uploaded or deployed and no production data changed.

## Next core work

The [development error/label-fit audit](PARCEL_VALIDATION_DIAGNOSIS_2026-10-21.md) is now complete without pixel access or retraining. Next implement its one-candidate tail-only MobileNetV2 improvement route, beginning with a bounded no-update TRAIN gradient probe. The present error rates do not justify spending an untouched test set merely to search for a better result. Keep current models, labels and partitions frozen; the later experiment must be separately declared and must not use test pixels/outcomes to choose its model or threshold.

The [separate once-only internal-test implementation plan](../docs/superpowers/plans/2026-10-20-kaputt-crop-internal-test.md) is prepared, not executed. Freeze its complete model/comparison set and protocol before eventual test acquisition/scoring under the predeclared admission policy. Retail packaging, uncertain physical identity and controlled source backgrounds limit transfer to shipping parcels. No test claim or acquisition has started.

The full goal still requires relevant independent IILAS photo/session evidence, an accepted model, persistent stage/evidence-bound photo request outcomes, bounded live camera sampling and actual camera quality/latency/resource testing. The data archive and working capture interface alone do not complete parcel AI.

The [photo request/outcome design](../docs/superpowers/specs/2026-10-20-parcel-photo-outcomes-design.md) was prepared and independently reviewed during training. It addresses stage-aware Warehouse access, durable operation identity/recovery, null-label unavailable/abstained states, lease fencing, bounded I/O and review provenance. It is a design, not implemented application behavior.
