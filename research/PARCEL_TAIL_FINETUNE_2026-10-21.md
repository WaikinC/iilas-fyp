# Controlled MobileNetV2 tail fine-tuning — 21 October 2026

## Current checkpoint

The single real candidate completed locally on MSI: session91790 is terminal exit0. Parent and independent reviewer reproduced the raw validation metrics and receipt/resource graph. The candidate did not improve the predeclared selection score, so the existing MobileNetV2 CLAHE remains selected; EfficientNetB0 standard remains the unchanged comparator. All147reserved internal-test candidates remain unopened, operational acceptance stays null, and other AI models/additional features remain deferred.

This implements the improvement specified by [the validation diagnosis](PARCEL_VALIDATION_DIAGNOSIS_2026-10-21.md) and [fixed implementation plan](../docs/superpowers/plans/2026-10-21-parcel-tail-finetune.md). It does not complete the [photo/live parcel goal](../docs/PARCEL_AI_COMPLETION_GOAL_2026-10-20.md).

## Fixed experiment

The candidate starts from the exact selected MobileNetV2 CLAHE classifier. It reuses633training/133validation images, unchanged publisher labels/dependency groups and partition-specific mean-one component weights. Input remains224px RGB letterbox/CLAHE, with the original train-only augmentation, seed42, batch4 and dropout0.2. Exact probability ties abstain. No data, threshold or contrast search is added.

Only convolution/depthwise kernels in blocks14–16 and Conv_1, plus the existing classification head, may change:12variables/1,513,282parameters. All BatchNormalization parameters/statistics and earlier backbone weights stay frozen. A fresh Adam optimizer uses learning rate0.00001 for at most five epochs, patience2 on weighted validation loss, restoring the best weights. Selection compares component-weighted macroF1, then negative log likelihood; the baseline wins exact ties. EfficientNetB0 is compared without refitting.

Fit limits were frozen before the candidate:3000seconds per fit,3300seconds for the phase,2GiB process-tree RSS,3GiB available RAM at start,768MiB available floor,2GiB disk reserve,512MiB output cap and one compute thread. The one-use claim is keyed to the original development experiment and fixed recipe, so changing paths or limits cannot permit a replacement fit after failure.

## Verification before fitting

- Helper:9pure behavioral tests; runner:20metadata tests, with observed failing stages before implementation.
- Actual supervised software fixture:15.06seconds,800.22MiB peak RSS; exact trainable inventory, finite gradients and permitted updates with frozen learned/BN state. Random/software fixtures establish behavior, not parcel accuracy.
- Combined research suite:328tests in229.251seconds, no failures and two Windows symlink-privilege skips. The real TensorFlow weighted-loss fixture was explicitly enabled.
- Actual TRAIN-only no-update probe:fixed four examples, one warmup and three timed gradient passes, full-partition weights, zero optimizer updates. All learned weights, BN statistics and RNG state stayed unchanged. Resource receipt:37.35seconds,968.71MiB peak RSS. Its conservative five-epoch estimate was1354.33seconds, within the frozen3000second fit cap.
- Independent review admitted the exact protocol/source/probe lineage. Protocol SHA-256:`50399d7f39998f68eb810faf714d8979adb344555f6eb8300c9d76f5fb3f20f7`.

Private execution and audit evidence remains ignored in `research/datasets/parcel-tail-finetune-20261021/` and `outputs/parcel-tail-finetune-20261021/`. No model, dataset, raw labels, split manifests or predictions are intended for Git.

## Terminal findings

Three epochs completed all159batches each; validation losses were0.76605445,0.78588665 and0.82197624. The fixed early-stopping rule restored the first epoch. The dataset-exhaustion warning did not truncate these epochs: all633TRAIN examples, including the final short batch, were represented by the159steps per epoch. Training-only shuffle remains supplied by the existing generator.

| Model | Component-weighted macro F1 | Component-weighted NLL (lower is better) | Image accuracy | Image Damaged precision | Image Damaged recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Frozen MobileNetV2 CLAHE, retained | 0.564825 | 0.765672 | 75/133 (56.39%) | 21/47 (44.68%) | 21/53 (39.62%) |
| Tail candidate, not selected | 0.557018 | 0.766055 | 71/133 (53.38%) | 29/67 (43.28%) | 29/53 (54.72%) |
| Frozen EfficientNetB0 standard | 0.580102 | 0.673169 | 75/133 (56.39%) | 23/51 (45.10%) | 23/53 (43.40%) |

The candidate finds eight additional damaged images but falsely flags12additional Normal images (38versus26). Component-weighted Damaged recall also rises, from46.17% to57.21%, while precision falls from57.42% to54.27%. This is a sensitivity trade-off, not an improvement under the fixed balanced macroF1 rule. Do not select it after the fact because one metric improved, change thresholds, run replacement fits or relabel errors.

Fit resource receipt:259.38seconds,974.90MiB peak RSS. Supervised phase:348.21seconds,1169.71MiB aggregate peak RSS. All12permitted learned variables changed; starting learned/BN state matches the actual probe, and all frozen learned/BN state remained unchanged. Original nine source bindings, protocol/probe, all four earlier fit artifacts, original cohort and comparator remain unchanged. The canonical one-use claim is completed, with selection SHA-256`f18dd5bf30dd5d1f9e037856b1476fb357ff0794a367176ae225676817434e52`.

Parent independent evidence: `parent-terminal-metrics-01.json` and `parent-terminal-lineage-01.json`; separate reviewer evidence: `independent-terminal-audit-01.json` and `independent-terminal-review-01.md`, all ignored under `outputs/parcel-tail-finetune-20261021/`. Parent metric reconstruction matches the saved scores; Keras float32 best loss differs from float64 raw NLL by only7.58e-8. The initial overly strict1e-8 cross-runtime audit check was corrected to1e-6 in the ignored auditor; product code, outputs and experiment were not changed or rerun.

## Remaining work

This experiment is closed with a negative result. It does not establish useful real shipping-parcel damage detection. Source-label/visibility and intended-use mismatch remain unresolved, and no accepted model or field accuracy is claimed.

The reserved once-only internal evaluation, relevant independent IILAS evaluation, persistent stage-bound photo-analysis outcomes and bounded live sampled-frame/session implementation remain unfinished. The separate [photo-outcomes foundation](../docs/PARCEL_PHOTO_FOUNDATION_2026-10-21.md) is implemented and verified; backend/UI integration is still pending. No acceptance setting or production data is changed by this experiment.
