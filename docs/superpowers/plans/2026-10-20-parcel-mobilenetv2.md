# Parcel MobileNetV2 Training Implementation Plan

**Implementation update, 20 October 2026:** Tasks 1–4 software is implemented and independently reviewed; Task 5's current software evidence and remaining data gate are recorded in the [implementation report](../../../research/PARCEL_WORKFLOW_IMPLEMENTATION_2026-10-20.md). Seventy-one focused tests passed, two symlink-privilege checks skipped, and complete bounded synthetic/random-weight development plus separate evaluation passed. The original checklist below is retained as the design specification. Official pretrained acquisition and real-parcel fitting/evaluation remain **Not run**. Do not use the software smoke models in IILAS. PackageDamage comparison supports a strict separately authorized raw-export adapter; no new detector inference or retraining was performed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a bounded research training/evaluation path for report-backed Normal/Damaged classification, without installing a model into the active IILAS application.

**Architecture:** A manifest audit freezes approved parcel groups and separate train/validation/test inputs. A shared OpenCV input pipeline feeds two sequential TensorFlow/Keras experiments; a separate sealed test command evaluates frozen artifacts. PackageDamage remains a separately executed pretrained reference with fixed detector settings.

**Tech Stack:** Python, TensorFlow/Keras MobileNetV2 and EfficientNetB0, OpenCV, NumPy, scikit-learn metrics, existing native Windows resource supervisor.

**Spec:** Choong's original Project 1 portfolio, sections 2.2.3.3, 2.2.4, FR-10/11 and 3.3.2.5; [camera scope](../../PARCEL_CAMERA_SCOPE_2026-10-20.md), [label review](../../../research/TAMPAR_LABEL_REVIEW_2026-10-20.md), [collection contract](../../../research/DATA_COLLECTION.md). This document specifies a proposed implementation; no training or runtime code is implemented by writing it.

## Report alignment and current decision

Both original portfolio files were checked against `fyp-cwk-2/resources/sources/project-1-2026-10-07/SOURCE_MANIFEST.md`. [Choong's report](https://drive.google.com/file/d/1XkAGX38tNdql7vEIQI8uVxleqYi3eJGc/view) specifies MobileNetV2 transfer learning as primary and EfficientNetB0 as comparator, OpenCV preparation, Normal/Damaged outputs with confidence, proposed 70/15/15 evaluation, train-only realistic augmentation and classification metrics. Its use case specifies 224×224 and mentions contrast enhancement; its training prose allows preprocessing choices. The exact enhancement algorithm must therefore be evaluated on development data and recorded before test use.

[Wong's report](https://drive.google.com/file/d/17HlQBr8J4orQIfy-adEUBmuWLTiD5BTM/view) supplies the inventory and Prepared-Shipment integration boundary, not another parcel-model specification. Sampled live camera frames are explicit in Choong's workflow figures; still-photo training is only the first stage. No FPS, accuracy guarantee, fixed epoch count or batch size is specified by those reports.

TAMPAR review now contains ten primary candidate images from five confirmed parcel groups (four Normal groups, one Damaged), plus one gift-wrap challenge group. **Do not split or fit this panel.** Keep it as reviewed diagnostic evidence. More independent groups are required, with both classes represented across sources/backgrounds. The earlier evaluation plan proposes 20 pilot groups per class and 50 independent final-test groups per class; these are collection goals, not mandatory report numbers or guarantees. A smaller justified study must be explicitly described as exploratory.

## Global constraints

- MSI; dot-source outer `Enter-IILAS.ps1`. Run Git/npm in `iilas-fyp` only.
- Public datasets only for now. Keep raw/derived images, labels, splits, weights, predictions, environments and run evidence in ignored local directories.
- No active-model writes, production changes, deployment or automatic publication.
- Preserve all existing human decisions, confirmed same-parcel pairs, synthetic-family holds and frozen PackageDamage outputs.
- Human condition labels do not by themselves certify relevance, target association, independent double review, acceptable licences or training eligibility.
- Keep synthetic training/evaluation separate from real evidence. Do not create a classifier where source/domain determines class.
- MobileNetV2 primary; EfficientNetB0 required comparator; PackageDamage additional pretrained reference with **no local retraining or tuning**.
- The six reviewed TAMPAR groups are reserved as diagnostic/reference material in this plan, not newly designated blind test data.
- Pin and verify actual dependency/weight versions before execution. Research environment metadata currently lists TensorFlow 2.21.0; that is not a successful runtime-import or fit check.

## Review focus

1. Same parcel with different views, conditions, crops or recordings: keep the connected dependency group together (Task 1).
2. Wrong RGB order, EXIF orientation, resizing or double normalization: identical train/inference input semantics (Task 2).
3. Failed run, low memory or repeat command: terminate descendants, preserve failure evidence, never silently start replacement fits (Task 3).
4. Test access during development or fitting on challenge rows: reject before loading image tensors (Tasks 1, 3, 4).
5. Detector abstention or a background-box prediction: preserve target association and denominator; never turn no detection into Normal (Task 4).

## Proposed experiment settings

These are implementation proposals, not report quotations or measured optimal settings.

| Item | First bounded experiment |
|---|---|
| Main/comparison | ImageNet MobileNetV2 / ImageNet EfficientNetB0, frozen backbones |
| Head | Global average pooling, dropout 0.2, Dense(2, softmax); class order `[Normal, Damaged]` |
| Input | RGB, EXIF-normalized once, full-frame aspect-preserving letterbox to 224×224; no automatic detector crop |
| Numeric preprocessing | MobileNetV2: one conversion from [0,255] to [-1,1]. EfficientNetB0: [0,255] into its built-in rescaling. Do not reuse MobileNet scaling for both. |
| Head training | Adam 0.001; sparse categorical cross-entropy; batch 4; maximum 10 epochs per candidate |
| Early stop | Validation loss, patience 3, restore best weights; no test access |
| Train augmentation | Horizontal flip p=0.5, contrast factor uniform [0.9,1.1], clipped [0,255]; no random crops or synthetic damage |
| Contrast experiment | Two predetermined variants per architecture: no deterministic enhancement, and OpenCV LAB-L CLAHE clipLimit=2.0/tileGridSize=(8,8) before letterbox. Select by highest validation macro-F1, then lowest validation loss, then no enhancement for an exact tie. |
| Fit budget | Four head-only fits total, one per architecture × contrast variant. Reset seed 42 per fit; no seed search. Optional deeper fine-tuning is a later declared amendment, not an automatic retry. |
| Decision | Argmax of two scores, exact tie abstains. Confidence is uncalibrated. Do not select a low-confidence cutoff on the test set. |
| Hardware | CPU FP32, one TensorFlow intra-op and one inter-op thread, tf.data private thread pool 1, prefetch 1, no decoded-image RAM cache |
| Per-fit guard | 900 seconds; combined worker/descendant RSS cap 2,048 MiB; initial available RAM at least 3,072 MiB; available RAM floor during execution 768 MiB |
| Whole development phase | 3,900 seconds including startup/serialization; 512 MiB output cap; at least 2 GiB free disk; sequential fits only |
| Separate test phase | 900 seconds overall, 600 seconds per supervised worker; 2,048 MiB combined RSS, 3,072 MiB available at each preflight, continuous 768 MiB available floor, 256 MiB output cap and 2 GiB free disk. Covers inference, serialization, scoring and bootstrap; models run sequentially. |

The initial available-RAM snapshot was approximately 2,800 MiB, below the proposed start threshold. A later user-requested native Windows API recheck found **4,042 MiB available**, 11.76 GiB used of 15.71 GiB (74.9% used), which passes that memory start threshold. These are changing snapshots, not reserved memory or a successful TensorFlow fit. Recheck before every run; do not lower the threshold to force execution. Bounded synthetic/random-weight software smoke tests must establish feasibility before dataset training. If a candidate exceeds the declared resource budget, record incomplete comparison and amend the plan before a new experiment; do not quietly reduce only one model's data.

Training runs use the same approved original targets and split for both architectures. Full-frame classification is initially restricted to an unambiguous principal parcel; unresolved multi-target images remain challenge cases. Preserve original images. Investigate the loss of tiny defects at 224×224 using development images only. Do not claim that this design localizes damage.

## Files and implementation tasks

All paths below are relative to `iilas-fyp`. New runner files are proposed, not already present. Existing `research/vision.py` remains unchanged in this phase: its training function defaults to the active model directory and immediately scores test data, so **do not invoke it for this experiment**.

### Task 1: Approved cohort and split audit

**Create:** `research/parcel_manifest.py`, `research/test_parcel_manifest.py`.

**Interface:** `audit_manifest(path: Path) -> dict` returns aggregate counts and accepted manifest hash or raises `ValueError`; `freeze_split(manifest_path: Path, output: Path, seed: int = 42) -> Path` writes a new immutable split manifest.

- [ ] Test missing human evidence, unknown licence, challenge rows in fit input, hash mismatch, path traversal/symlink escapes, duplicate decoded images, and a group appearing in multiple partitions. Require clear rejection.
- [ ] Accept fields `sample_id`, `image_path`, `image_sha256`, `label`, `label_status`, `review_evidence`, `source_id`, `origin`, `group_id`, `group_status`, `role`, `target_status`, `split`; accepted labels only Normal/Damaged, reviewed/confirmed group and single principal target. Link a separate source registry with licence/provenance evidence.
- [ ] Implement connected grouping for physical parcels, sessions and derived images; retain reviewer identity/evidence separately. Near-duplicate flags require a documented decision; absence of exact duplicates does not prove independence.
- [ ] Allocate approximately 70/15/15 by group within a declared domain. Deterministically rank groups by SHA-256 of seed plus group ID; allocate to minimize class/group ratio shortfall with stable train/validation/test tie order. Report achieved image and group counts; never split a mixed-condition group to improve balance.
- [ ] Reject any split lacking either class in any partition. Retain the intake minimum of five reviewed groups per class as an early check only; do not call that scientifically adequate. The current TAMPAR panel must fail training-readiness tests.
- [ ] Verify with `python -m unittest discover -s research -p test_parcel_manifest.py`. Expected: all tests pass, including deliberate TAMPAR insufficient-group rejection.

### Task 2: Common image pipeline and model construction

**Create:** `research/parcel_inputs.py`, `research/parcel_models.py`, `research/test_parcel_inputs.py`, `research/test_parcel_models.py`.

**Interfaces:** `decode_rgb(data: bytes) -> numpy.ndarray`; `prepare_image(rgb, contrast: str) -> numpy.ndarray` returns float32 224×224×3 in [0,255]; `build_classifier(name: str, weights_path: Path | None) -> keras.Model`.

- [ ] Pin OpenCV EXIF decode behaviour with an orientation fixture. Explicitly convert BGR to RGB once. Test red/blue channel identity, corrupt input, images smaller than 64 pixels and identical train/inference preparation.
- [ ] Implement letterbox with scale=min(224/w,224/h), rounded dimensions at least one pixel, INTER_AREA downsampling/INTER_LINEAR upsampling, centered padding RGB(127,127,127), odd residual on right/bottom. Apply declared CLAHE only in its contrast variant.
- [ ] Verify pixel bounds, geometry and contrast variants using synthetic fixtures. Verify augmentation is train-only and validation/test are repeatable.
- [ ] Build both frozen-backbone models with the stated head and correct architecture-specific normalization. Keep BatchNormalization in inference mode. Test class order and score shape with random weights; those tests are not model-performance evidence.
- [ ] Verify via unittest discovery for each named file in the resource-controlled smoke environment. Download official pretrained weights only in a separate logged acquisition step, record hashes/permissions, and prohibit network fallback during fitting.

### Task 3: Supervised development runner and durable run record

**Create:** `research/parcel_train.py`, `research/test_parcel_train.py`, `research/protocols/parcel_mobilenetv2_v1.json` (configuration only, no dataset rows).
**Reuse:** `research/runner_runtime.py`; modify it only with focused regression tests if continuous available-RAM monitoring requires an extension.

**CLI:** `python research/parcel_train.py develop --manifest <approved-split> --protocol <frozen-json> --output research/datasets/<new-run>`.

- [ ] Test before implementation: active-model output rejection, non-ignored/existing destination rejection, missing weights, resource preflight failure, test-path access rejection, and persistent fit claim reuse after process failure.
- [ ] Bind code, dependencies, weights, reviewed manifest, split, preprocessing, seed and limits in a protocol digest. Use exclusive creation of a durable experiment claim under ignored `research/datasets/parcel-run-registry/`; claim all four planned fit IDs before execution, preserving started/failed/completed status. A new destination must not bypass the same experiment claim.
- [ ] Configure CPU visibility and all thread/pipeline limits before TensorFlow import. Use Windows Job descendant containment, RSS/wall/output bounds and the continuous available-memory floor; preflight each fit.
- [ ] Run four sequential declared fits; development process reads only train/validation images. Save histories, validation probabilities, best artifact hashes, environment, seeds, time/RSS and failure evidence. Compare the two contrast variants within each architecture using validation macro-F1, then validation loss, then no-enhancement tie preference.
- [ ] Freeze one selected artifact per architecture and the input/decision policy. Keep MobileNetV2 primary; a noisy small-sample score alone does not authorize model replacement.
- [ ] Run `python -m unittest discover -s research -p test_parcel_train.py` and existing `test_runner_runtime.py`; verify a bounded synthetic smoke run cannot create or overwrite any active model. Do not perform real training until data and resource gates pass.

### Task 4: Separate test evaluation and PackageDamage comparison

**Create:** `research/parcel_evaluate.py`, `research/test_parcel_evaluate.py`.

**CLI:** `python research/parcel_evaluate.py test --selection <sealed-selection> --manifest <same-frozen-split> --output research/datasets/<new-test-run>`.

- [ ] Test modified manifests/artifacts/protocols, unselected models, repeated test claims, missing-class data, undefined precision, mixed predictions and missing target association. Reject invalid seals; preserve undefined metrics as null with denominators.
- [ ] Apply the separately declared test-phase budget above through the Windows supervisor to CNN inference, PackageDamage comparison and bootstrap/scoring. Configure CPU/thread limits before imports and check the continuous available-memory floor. Add failure-path tests for timeout, RSS, memory-floor and output-cap termination. Preserve partial raw evidence as incomplete, do not score a completed-looking subset or automatically rerun after a budget failure.
- [ ] Claim the test phase durably before image access. Save raw predictions and artifact hashes before scoring. Report accuracy, per-class precision/recall/F1, macro-F1, confusion matrix, abstention count and coverage on every eligible target. Abstentions count as misses for all-case recall; also provide explicitly labelled conditional metrics for decisive predictions. A Normal-only panel cannot establish damaged recall.
- [ ] Report both image-weighted and equal-parcel-weighted summaries; show independent groups per class. Use paired group bootstrap (seed42, 2,000 replicates) only when support permits; flag degenerate/small-group intervals. Never treat repeated views as independent confidence-interval samples.
- [ ] Keep PackageDamage checkpoint `84c9b943672e676f32c97dc36a81aae8766bdd96646e1b5e552de17aebca289c`, 640/conf0.25/IoU0.7/batch1/CPU/no augmentation and frozen image-summary abstention rules. Its old nine-image diagnostic remains immutable.
- [ ] For a future authorised external comparison, evaluate the same approved targets and preserve architecture-specific input resolutions. Obtain reviewed target regions for multi-object frames or exclude them from the matched comparison. Record target association before model outputs; never pick the box that best matches the answer.
- [ ] PackageDamage mixed/no-detection remains abstention. Report its coverage and classification metrics separately from CNN metrics; YOLO mAP is not classifier accuracy. Do not automatically use its detections to crop the CNN inputs or generate labels.
- [ ] Exclude known PackageDamage training sources/derivatives from an independent external test; disclose remaining unknown overlap. Resolve upstream licensing separately before application integration.
- [ ] Verify with `python -m unittest discover -s research -p test_parcel_evaluate.py`; test command must not train, tune, activate models or send images to hosted inference.

### Task 5: Research report and later integration boundary

**Update after actual experiments:** `research/README.md`, `PROJECT_ROADMAP.md`; create a dated research result report with evidence links and limitations.

- [ ] Report source/domain, reviewer disagreements, exclusions, group counts, chosen preprocessing, all attempted fits and resource failures. Leave scores “Not run” until produced.
- [ ] Verify Git exclusion for every new artifact, run secret checks including untracked documentation, and confirm unchanged active model/configuration. No commit/push is implicit in this plan.
- [ ] Make an explicit readiness decision from real-parcel coverage and errors. Do not promise improvement from extra training alone.
- [ ] Plan subsequent photo integration with shipment/stage/user linkage and human review, then a separate live-camera protocol with bounded sampling, stale-response handling, stop/release behaviour and measured end-to-end latency. These are report-backed core work, not validated by this training plan.

## Verification and handoff

Implementation is complete only when manifest leakage tests, shared preprocessing tests, bounded smoke execution and separate sealed evaluation all pass with saved evidence. Actual AI evaluation additionally needs sufficient reviewed data; passing software tests does not close that gap.

No fit, weight download, PackageDamage rerun, model activation or app change occurred in this planning step. The next implementable task is the manifest/input/supervision code and synthetic software tests while public-data review continues. All tabular AI work and additional features remain deferred.

Primary implementation references: [MobileNetV2 input requirements](https://www.tensorflow.org/api_docs/python/tf/keras/applications/MobileNetV2), [EfficientNetB0 input requirements](https://www.tensorflow.org/api_docs/python/tf/keras/applications/EfficientNetB0), [transfer learning and BatchNormalization](https://www.tensorflow.org/guide/keras/transfer_learning).
