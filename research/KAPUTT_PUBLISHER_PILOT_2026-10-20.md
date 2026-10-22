# Kaputt publisher-labelled development pilot — 20 October 2026

The user selected publisher labels because the images are difficult to judge. The first real pretrained MobileNetV2 and EfficientNetB0 development experiment and its separate, once-only internal test are now complete on MSI. **Neither model detected the one damaged test example. This pilot does not establish useful parcel damage detection or operational readiness.**

## Data and boundaries

The explicit `publisher_packaging_development` profile uses the 36 cardboard query crops in the verified official sample: 25 Normal and 11 Damaged. Publisher `defect` supplies condition truth. Earlier human Normal responses for K04/K11 remain unchanged in their original journals; publisher Damaged is used for this experiment with disagreement recorded separately.

All images belong to publisher TRAIN and were previously screened. The internal holdout is neither the official source test nor an independent IILAS test. Source item identifiers provide conservative dependency groups; they do not prove physical parcel or capture-session identity. Retail packaging, visible damage annotations, framing and lighting may differ from IILAS shipping parcels and camera sessions. Reference images were not assigned presumed Normal labels.

The existing seed-42 group splitter was frozen before fitting. No class rebalance, new seed, threshold tuning or repeated test was performed after viewing results.

| Partition | Images / source item groups | Normal | Damaged |
| --- | ---: | ---: | ---: |
| Training | 25 / 25 | 17 | 8 |
| Validation | 6 / 6 | 4 | 2 |
| Internal test | 5 / 5 | 4 | 1 |

Originals, crops, annotations, policy, protocol, weights and outputs remain local and ignored. No data, model or private configuration was uploaded. The preserved full Kaputt terms govern educational/scientific research; this experiment does not authorize production use or redistribution.

## Implementation and training

Schema v2 explicitly binds the publisher annotations and policy, while retaining the existing v1 human-reviewed admission rules. Publisher rows retain capture/item identity, hashes, group provenance and evaluation scope. Metadata-only frozen loading does not open image bytes; path, duplicate, source, dependency and partition controls remain enforced. Benchmark context is included in experiment identity, selection and reports. Serving explicitly rejects this development-only profile.

The exact official ImageNet no-top checkpoints were acquired and verified against publisher object metadata, MD5 and local SHA-256. Offline checks established identical learned tensors and same-input features against canonical Keras models. See [checkpoint evidence](PARCEL_PRETRAINED_WEIGHTS_2026-10-20.md). The initial MobileNet preprocessing tolerance failure is retained: a separate diagnostic isolated a floating-point scaling difference; no training model code or weights were changed.

Four declared fits used frozen backbones, a trained classification head, RGB letterbox 224 input, batch 4, one CPU thread, learning rate 0.001, dropout 0.2, seed 42 and at most 10 epochs. Early stopping used validation loss with patience 3 and restored the best weights. Each architecture compared no contrast adjustment with CLAHE. Selection used validation macro-F1, then loss, then no-contrast preference.

| Architecture / contrast | Completed epochs | Validation macro-F1 | Validation loss | Selected within architecture |
| --- | ---: | ---: | ---: | --- |
| MobileNetV2 / none | 5 | 0.3333 | 1.0051 | No |
| MobileNetV2 / CLAHE | 5 | 0.4000 | 0.9765 | Yes |
| EfficientNetB0 / none | 4 | 0.8286 | 0.5823 | No |
| EfficientNetB0 / CLAHE | 4 | 0.8286 | 0.5479 | Yes |

These validation values cover only six images and are selection evidence, not final performance. MobileNetV2 remains the report-aligned primary architecture; this pilot does not authorize replacing it with the comparator.

## Once-only internal test

Confusion matrices use true rows Normal/Damaged and predicted columns Normal/Damaged/Abstain.

- MobileNetV2: `[[3, 1, 0], [1, 0, 0]]`.
- EfficientNetB0: `[[4, 0, 0], [1, 0, 0]]`.

| Model | Correct | Normal precision / recall / F1 | Damaged precision / recall / F1 | Macro-F1 |
| --- | ---: | --- | --- | ---: |
| MobileNetV2 + CLAHE | 3/5 | 0.75 / 0.75 / 0.75 | 0 / 0 / 0 | 0.3750 |
| EfficientNetB0 + CLAHE | 4/5 | 0.80 / 1.00 / 0.8889 | Undefined / 0 / 0 | 0.4444 |
| Always predict Normal, descriptive reference | 4/5 | 0.80 / 1.00 / 0.8889 | Undefined / 0 / 0 | 0.4444 |

Both models missed the only damaged image. MobileNetV2 also falsely flagged one Normal image. EfficientNetB0 predicted every image Normal, so its 80% accuracy equals the trivial reference and its damage precision is undefined because it made zero positive predictions. No abstentions occurred; coverage is 5/5. Scores are uncalibrated. Image and equal connected-source-group metrics coincide because each test group has one image.

The paired uncertainty calculation reports insufficient support (four Normal groups, one Damaged group); no bootstrap interval or superiority claim is justified. PackageDamage was not rerun on this broader packaging target; its previous frozen diagnostic remains separate.

## Verification and resource evidence

Development completed once with exit 0 in 137.47 seconds; supervised process-tree peak RSS was 786,894,848 bytes (about 750.4 MiB). Separate test completed once with exit 0 in 46.45 seconds; peak RSS was 551,927,808 bytes (about 526.4 MiB). Existing CPU, RAM, time, free-disk and output caps stayed in force. All four fit receipts report success. Windows used CPU TensorFlow; this is not GPU or live-camera latency evidence.

The profile change initially ran 75 checks: 73 passed, one Windows symlink-privilege skip and one guard-order error. Moving the new profile check after existing selection/artifact integrity checks fixed that error. The corrected affected evaluator/profile/serving suite passed all 43 checks; the unchanged manifest/train suites had 31 passes and one skip. The receipt explicitly records transcribed tool output rather than claiming to be a raw test log.

Parent verification additionally exercised the actual cohort and frozen metadata-only image-open guard. The real serving audit returns `unavailable`, `operationally_approved: false`, with the reason that publisher development-only artifacts cannot be served. No API model was activated. Application build/emulator suites were not rerun for this research-only increment; frontend/backend/rules were unchanged.

An independent read-only agent verified ten seals, code/protocol/weight/provenance and artifact hashes, validation loss/F1 and selection, all test metrics, reconstructed disjoint groups, completed claims and nine successful resource receipts. It independently reproduced serving refusal without loading TensorFlow. Standard secret checks passed for 186 tracked files; the same scanner extended in memory to tracked and nonignored untracked files passed for 274 files. All 1,276 files across the intake, pilot, checkpoints and compatibility directories were verified Git-ignored, with zero tracked files. Whitespace validation passed. No commit, push or deployment occurred.

## Reproducibility pointers

All following data/model/result paths are ignored, relative to the application checkout:

- `research/datasets/kaputt-intake-20261020/publisher-frozen-01.json`, SHA-256 `c6d48b1fdf0528b36a98d98874035c822dff5a6047abac02c9966afd7fb4338a`.
- `research/datasets/kaputt-publisher-pilot-20261020/protocol.json`, SHA-256 `c5c5f8e5748e15511834e711cad4dccc67f42eb37049e85d7fd2679d9e920464`.
- `research/datasets/kaputt-publisher-pilot-20261020/development-01/selection.json`, sealed payload digest `ec7a17010081704ff0dc3fed4fa005d951459f50f814159bd1e42e3bc93d1bc4`.
- `research/datasets/kaputt-publisher-pilot-20261020/test-01/report.json`, sealed payload digest `9ae81b048691bcfd93c6f6e513973fcb546ce051e291bcd18a45f8c5ace84255`.
- Per-fit histories, raw validation/test predictions, resource receipts and run-registry claims are retained beside these artifacts. Do not overwrite or automatically rerun these claims.
- `outputs/publisher-profile-verification-20261020-final.json` records the software checks and correction.

## Next core work

1. Obtain a bounded, more representative official image cohort, especially independent damaged cardboard items, with source annotations and groups. Existing metadata alone is not image availability. Keep publisher validation/test data separate and unseen for final source evaluation.
2. Fix the next development protocol before fitting; review target mismatch and class balance using training data. Preserve this failed pilot and do not tune on its internal test or relabel disagreements to improve scores.
3. Complete trusted backend evidence/model acceptance, assignment rechecks, explicit unavailable/abstained states and stage/request/result traceability. The current API transport does not complete these application contracts.
4. Evaluate actual IILAS photos and bounded live camera sessions before claiming readiness. Sampling, cancellation, stale-result rejection, latency and physical-camera quality remain uncompleted.

Other AI modules and additional features remain deferred. The full parcel AI goal remains active.
