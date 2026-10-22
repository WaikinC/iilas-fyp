# Parcel development error audit — 21 October 2026

The [expanded development experiment](KAPUTT_CROP_DEVELOPMENT_2026-10-20.md) completed, but both selected classifiers have inadequate damage detection. This follow-up audits existing development predictions and original publisher TRAIN annotations only. It opens no images, trains no model, searches no threshold and changes no label, split or previous metric. All 147 internal-test candidates remain untouched.

## Findings

| Development validation result | MobileNetV2 CLAHE | EfficientNetB0 standard |
| --- | ---: | ---: |
| Correct images | 75/133 | 75/133 |
| Damaged images detected | 21/53 | 23/53 |
| Normal images incorrectly flagged | 26/80 | 28/80 |
| Major-defect images detected | 3/7 | 3/7 |
| Damaged images detected in mixed-label source-item components | 6/25 | 6/25 |

Both classifiers miss the same 24 damaged images and falsely flag the same 15 normal images. They disagree on 38 images, with each uniquely correct on 19. This does not establish that an ensemble or switching models would improve application performance.

All validation crops are square with sides 387–1,780 pixels. Only six damaged images belong to the smaller 256–511-pixel group, so their outcomes cannot establish a size effect. Twenty-three mixed-label source-item components contain 60 images; their lower descriptive recall does not prove erroneous labels or justify removing difficult examples.

Publisher defect tags overlap. Deformation has 47 examples, penetration 20, actuation 22, superficial defects 22, deconstruction three and spillage one. These are not independent additive groups; the smallest strata cannot support reliable sensitivity claims. Publisher defect/severity annotations do not by themselves establish visible IILAS shipping-parcel damage. This metadata-only audit cannot judge whether a defect is visible on the photographed face.

Confidence remains uncalibrated: MobileNetV2 assigns a maximum score as high as 0.983 to a wrong case. Overlapping correct/incorrect score distributions do not establish a safe cutoff. Keep the existing decision rule rather than selecting a threshold on these errors.

## Next controlled improvement

Implement one tail-only MobileNetV2 fine-tuning experiment from its exact saved CLAHE baseline. Preserve all 633 training/133 validation rows, publisher labels, component weights, seed 42, batch four, preprocessing, augmentation and decision rule. Keep EfficientNetB0 standard as the fixed comparator without refitting it.

The prospective candidate uses fresh Adam at 1e-5, at most five epochs and patience two on component-weighted validation loss, restoring best weights. Only convolutional weights in blocks 14–16 and Conv_1 plus the existing head may train; every BatchNormalization and earlier backbone layer stays frozen. Verify trainable names/counts, gradients and unchanged frozen weights before fitting.

First run a bounded TRAIN-only gradient feasibility probe with no optimizer updates. Then freeze new source/protocol/lineage and one-use claim before the single real candidate fit. Proposed bounds are 3,000 seconds/fit, 3,300 seconds/phase, 2 GiB aggregate RSS, 3 GiB initially available RAM, a 768 MiB available floor, a 2 GiB disk reserve, 512 MiB output and one compute thread. Finalise these prospectively from feasibility evidence; do not raise them to replace a failed fit.

Compare candidate against frozen MobileNetV2 CLAHE by component macro F1, then NLL, keeping baseline on exact ties. Report all precision/recall and image/component trade-offs, including a worse result. This remains development tuning, not independent accuracy. No additional data, contrast search, EfficientNet refit or test-guided selection is part of this experiment.

Fine-tuning may fail to help and cannot resolve hidden faces, missing parcel/session identity, retail-to-shipping target mismatch, full-photo localisation or live-camera coverage. Preserve all existing results. Keep the 147 candidates unopened until final candidate/comparison and once-only evaluation rules are fixed. Operational acceptance and photo/live evaluation remain incomplete.

## Verification

The independent audit reproduces selected raw and component-weighted metrics and matches the parent's separate disagreement count. The parent independently joins all 133 validation rows to the original SHA-256-verified TRAIN annotation table and reproduces seven major-defect cases and every tag count above. No TensorFlow or pixel access was used for these diagnostics.

Detailed per-image audit, source hashes, fixed strata and scripts remain ignored under `outputs/kaputt-crop-development-20261020/`: `validation-error-audit-01.json/.md`, `parent-selected-disagreement-01.json` and `parent-validation-annotation-check-01.json`. The seven bound development sources and prior pilot remain unchanged. This diagnostic is complete; the new fine-tuning runner/protocol/probe/fit are not yet implemented or run. Other AI modules and additional features remain deferred.
