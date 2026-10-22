# Visible Parcel MobileNetV2 Pilot Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Preserve prior experiments and verify actual results before marking tasks complete.

**Goal:** Train and evaluate a bounded Normal/clearly-Damaged parcel-frame development baseline from the selected public export, with MobileNetV2 primary and EfficientNetB0 comparator.

**Architecture:** Add a separate visible-parcel manifest/profile and two-fit controller, reusing unchanged image/model/runtime utilities. Preserve publisher labels, isolate rights/technical holds and dependency components, and admit each actual job through native resource supervision. This plan prepares the experiment; fitting has not started.

**Tech Stack:** Existing research Python, TensorFlow/Keras, OpenCV, NumPy and native Windows resource supervisor. No new framework or hosted training service.

**Spec:** [Selected dataset, actual export evidence and user scope](../../../research/PARCEL_DATASET_SELECTION_2026-10-21.md), existing [accuracy objective](../../../research/PARCEL_ACCURACY_TARGET_2026-10-21.md) and [full photo/live goal](../../PARCEL_AI_COMPLETION_GOAL_2026-10-20.md).

## Global constraints

- MSI; research Python `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe`; dot-source root Enter-IILAS.ps1. Public data only; no production/deployment or other AI/features.
- Keep datasets, models, raw results and local configuration ignored. Use a new ignored `research/datasets/parcel-visible-development-20261021` output and `parcel-visible-run-registry` namespace; never reuse prior consumed claims or overwrite old sources/models.
- Exact folders `damagedpackages` → Damaged=1, `undamagedpackages` → Normal=0. No hyphens in these source names. Ambiguous quality observations remain separate; no prediction-guided labels or agreement-only success cohort.
- Selected ZIP SHA-256 `b10758ad148b9ad8fc8aac21365da2a62b532af1b9b8441ec0a45366352f9ffc`; 4,148 generated files are not independent parcels. Both earlier Kaputt evaluations and the 31-view diagnostic are exposed and cannot become fresh tests.
- A source-only pilot can proceed with disclosed unknown physical/session identity. It cannot establish independent physical-parcel or live-camera accuracy. No arbitrary minimum number of physical boxes is invented here.

## Execution checkpoint — 21 October 2026

Task 1's intake/manifest software and Task 2's restricted runner/template are implemented, with all 51 new artificial fixtures passing parent and independent verification. Five existing input/model contract checks also pass. Independent review resolves conservative conflict/quality propagation, native source-request binding, shape-aware exact-pixel links and restored-checkpoint/artifact verification. The ignored local protocol verifies both existing pretrained records and four provenance proofs; no actual model construction follows from metadata validation.

The real `intake-01` invocation is terminal before worker creation: native preflight reports `available_memory`, 3,036,299,264 bytes below 3 GiB, return code null, 0.007149 seconds. Only request/failure files exist. Preserve it. After measured RAM recovery, a separately declared `intake-02` with identical source/code/policy/caps is allowed as pre-admission recovery, without resuming/overwriting or replacing observed data. The immutable image manifest, fixed 24-image suitability review, independent data admission and actual no-update probe are not complete; no fit has started. The unchecked data/model tasks below remain required.

Implemented interfaces are `prepare_manifest(source_receipt, output)`, `load_manifest(path)` and `admit_manifest(candidate, review)` in the new manifest module. The runner's public CLI is `prepare --manifest --protocol --output`, `probe --prepared --output`, then `develop --prepared --probe --output`. These require concrete accepted local inputs; the tracked blank protocol alone cannot run them. New source is separate from all prior sealed experiments. Detailed logs/reviews and the prospectively fixed sample policy remain ignored in `outputs/parcel-visible-implementation-20261021`.

## Review focus

- Augmented derivatives or similar frames crossing partitions must not be treated as independent examples; filename hints are not proof of exact identity.
- Stock/right flags and uncertain labels must remain explicit holds without watermark removal or automatic relabelling.
- No published TEST/preview-exposed image may silently enter TRAIN/VALID or be called untouched evaluation evidence.
- The current four-fit/Kaputt-only runners must reject rather than accidentally run this new profile; old sealed source remains unchanged.
- Memory, time, short final batches, restored checkpoints and partial/failed claims must be verified with meaningful fixtures and actual supervised evidence, rather than larger caps or replacement fits.

## Task 1: Qualify and freeze the selected development inputs

**Implemented files; actual source admission pending:** `research/parcel_visible_manifest.py`, `research/test_parcel_visible_manifest.py`.

**Consumes:** Actual export metadata completion at `research/datasets/roboflow-box-intake-20261021/metadata-01/completion.json`, its bound inventory/archive identity, source/licence records and the existing exposure records. No accepted training manifest exists yet.

**Produces:** `prepare_manifest(source_receipt: Path, output: Path) -> Path` and `load_manifest(path: Path) -> dict`, a new sealed TRAIN/VALID-only profile with accepted/excluded rows, source and image hashes, immutable publisher labels, quality/rights dispositions, dependency-component IDs, split/exposure summaries and the exact technical policy.

- [ ] Add meaningful failing fixtures for the exact folder mapping, unknown classes/unsafe ZIP paths, conflicting labels on verified duplicates, derivative links, cross-partition components, source/hash drift, rights holds, missing classes and forbidden TEST access.
- [ ] Implement bounded TRAIN/VALID extraction and image verification. Keep TEST unextracted in this development step; encoded metadata/hashes may establish known overlap without exposing its pixels to fitting. Do not claim complete unseen-holdout separation before the later full audit.
- [ ] Decode and verify admitted development images under fixed 64-pixel minimum side, 16-million-pixel/16-MiB per-file bounds; preserve every original disposition and propagate technical holds through verified related assets. A separate conservative hint decision must not be mislabeled an exact duplicate.
- [ ] Audit candidate filename/source-series families, exact encoded/decoded hashes and fixed perceptual candidates before model outputs exist. Preserve publisher TRAIN/VALID assignments; quarantine components touching both, or touching published TEST, instead of moving related views until a favourable split appears. Record review-exposed IDs/derivatives and unknown grouping.
- [ ] Keep stock/right-flagged assets and verified derivatives out of fitting until documented upstream basis is present. Preserve publisher truth; review clear bend/crush/tear/puncture against the stated visible-only rule, holding ambiguity without forced binary observations.
- [ ] Prefer genuine originals if the official source supplies them. If only the transformed v1 export is available, select at most one deterministic representative per known augmentation family and explicitly call it an exported derivative. Do not claim original geometry was recovered from the 640-square stretch.
- [ ] Freeze at most 1,600 TRAIN and 400 VALID views, with no more than four ranked distinct source-family representatives per component and no component divided across partitions. These are ceilings, not targets; actual VALID has only 302 files before attrition. Apply stable seed-42 component/view ranking before fitting. Require both classes for metrics and disclose actual component support; if TRAIN has fewer than 634 images, do not call it a numerical expansion over the prior 633.
- [ ] Run the new manifest fixture suite and independently review the frozen membership/dispositions before any fit. Retain the full original 4,148-file source denominator and each exclusion reason.

## Task 2: Add the restricted two-fit profile and resource probe

**Implemented files; actual feasibility/fit evidence pending:** `research/parcel_visible_train.py`, `research/test_parcel_visible_train.py`, `research/protocols/parcel_visible_pilot_v1.json`.

**Consumes:** Task 1's admitted TRAIN/VALID manifest, exact existing local pretrained-weight/licence/compatibility receipts and frozen proposal settings below.

**Produces:** Public `prepare`, `probe`, `develop` commands for this profile only, exact flags documented and tested when implemented; hidden workers require a native Job. Do not invent currently runnable CLI commands. Existing `parcel_train.py` and `kaputt_crop_train.py` hard-require four fits and their original manifest contracts; changing JSON alone cannot implement this plan.

- [ ] Add failing fixtures for profile/membership/weight binding, exactly two ordered fits, no TEST decode/model access, preserved global class order, component weights, best-VAL-loss restoration, forbidden unsupervised workers, resource termination and exclusive consumed claims/partial results.
- [ ] Reuse unchanged `parcel_inputs.decode_rgb`, `prepare_image`, `augment_image`, `parcel_models.build_classifier` and `runner_runtime` through explicit bindings and compatibility fixtures. Do not edit the nine previously sealed training/runtime sources to make the new profile fit.
- [ ] Implement exactly two serial fits: **MobileNetV2/CLAHE**, then **EfficientNetB0/none**. These retain previously selected preprocessing choices; no four-way contrast search or tail fine-tuning is bundled in.
- [ ] Start each from its verified official ImageNet backbone and a fresh two-class head. Freeze backbone and BatchNormalization state; call the backbone with `training=False`. Use existing GlobalAveragePooling, Dropout 0.2 and Dense(2, softmax), sparse categorical cross-entropy, Adam 0.001, seed 42, batch 4, maximum 10 epochs.
- [ ] Preserve RGB, one-time orientation, full exported-frame 224 letterboxing/gray-127 padding and architecture-specific scaling. Training-only horizontal flip and existing contrast jitter remain fixed; no random crop that could remove a defect. Already stretched source exports stay documented as stretched.
- [ ] Stream images with bounded prefetch and no whole-dataset decoded cache. Weight each image `N/(G*n_component)` separately inside TRAIN/VALID. This balances dependency components, not class prevalence.
- [ ] Preserve weighted `val_loss` early stopping with patience 3 and restored best weights. Reconstruct final VALID metrics from raw probabilities; balanced component macro F1 is the post-fit comparison rule, followed by component NLL and retained baseline on exact ties. Do not quietly change epoch selection to macro F1 or tune confidence against an observed test.
- [ ] Implement a fixed TRAIN-only no-update probe before fitting: cold construction/forward/gradient and save/load timing, unchanged learned/BN state, bounded decode and a conservative fit-cost estimate. At most 180 seconds and 128 MiB probe output; it is not a fit or accuracy result. Require at least 2× measured batch cost plus setup/VALID/checkpoint cost to fit within the unchanged fit/phase bounds.
- [ ] Enforce CPU/offline/one compute thread, one actual research job, 2 GiB aggregate process-tree RSS, 3 GiB free RAM at admission, 768 MiB RAM floor, 20 GiB free-disk reserve, 512 MiB generated output, 3,000 seconds per fit and 6,300 seconds for the proposed two-fit phase. A failed probe/fit remains preserved; no automatic replacement, higher cap or post-result cohort thinning.
- [ ] Run the focused new suites plus affected existing input/model compatibility fixtures once. Read optional heavy-test switches before enabling them; do not run previous real development/test commands.

## Task 3: Freeze, run and report the development experiment

**Future artifacts:** Source-bound protocol, exclusive claim/output, native worker receipts, restored model hashes, loss histories, ordered VALID raw probabilities and reproducible component/image metrics. All remain ignored.

- [ ] Once Tasks 1–2 and the resource probe pass, freeze actual source/membership/protocol/weight/environment/code hashes before the real run. Preserve old four fits, negative fine-tune and every consumed evaluation claim.
- [ ] Run the two fits once, sequentially, through the new controller. Record original process handles and actual terminal evidence; an observation timeout is not permission to restart.
- [ ] Independently reproduce confusion matrices, Normal/Damaged precision/recall/F1, balanced macro F1, NLL, accuracy, abstention/coverage and class/component denominators from ordered VALID outputs. Include an always-Normal reference and uncertainty appropriate to the available dependency groups.
- [ ] Report this as a publisher-source **development** result. MobileNetV2 remains primary; the comparator cannot silently replace it. Different-source old/new numbers do not isolate a causal data gain. Any later low-rate fine-tune is a separate fixed comparison on this same cohort.
- [ ] Define any future fresh once-only evaluation after known preview/derivative/exposure and grouping gaps are resolved. Report the 80% accuracy objective with precision, recall, macro F1, coverage and uncertainty; no majority-class or conditional-coverage shortcut. Keep model activation separate from a development score.
- [ ] Evaluate accepted photo predictions and actual sampled-camera behavior through the existing app later: quality, visible-surface limits, latency/result age, drops, interruptions and CPU/RAM. A still-image training set does not certify video/camera performance, and no separate video dataset is needed merely to train this frame classifier.

## Current completion boundary

Source selection, public previews, official ZIP acquisition and native metadata audit are complete. The new manifest/runner software and artificial fixture verification are complete. Actual image extraction/integrity, rights/label/derivative review, admitted development manifest, native no-update probe and training remain incomplete after intake failed at RAM preflight. The implemented commands need those concrete prerequisites; no real experiment has executed. Other AI and additional features remain deferred; both serving gates stay closed.


## Current checkpoint: reviewed data admitted; GPU setup in progress — 21 October 2026

The reviewed development manifest now contains **915 views: 753 TRAIN (385 Normal, 368 Damaged) and 162 VALID (107 Normal, 55 Damaged)**. Independent reconstruction verifies its membership and all 4,148 original dispositions. The review overlay excludes new watermark/quality holds and a cross-partition same-source photo dependency; ten candidates were removed with no replacements or label changes. Component IDs remain conservative dependencies, not verified physical parcel identities. All 102 TEST images remain unextracted.

The new CPU training path has not fitted either model. Two no-update feasibility attempts are preserved as failed. A verified projection bug was corrected; the corrected second probe still projected 3,600.68 seconds against the unchanged 3,000-second fit limit. Its state checks passed, and no validation predictions or new accuracy were produced. Current focused fixtures: 28 intake, 20 review-overlay and 27 runner checks passed; these are software checks.

User-authorised GPU setup is now the next step. MSI has an NVIDIA RTX 3050 Laptop GPU with 4 GiB VRAM and driver 610.78. Current native Windows TensorFlow 2.21 is CPU-only; the supported GPU route is WSL2. Official VS Code WSL, Python and Pylance extensions are installed, and the outer Windows/WSL workspace files include both application and report folders. After the user's manual MSI restart, WSL 3.0.3 and Ubuntu 24.04.5 installed successfully. A separate Linux Python 3.12.3 environment has the pinned TensorFlow 2.21/CUDA dependencies, and pip check passes. An actual bounded GPU:0 matrix/convolution check passed in 9.409 seconds with CPU fallback disabled. Enter-IILAS-GPU.sh supplies verified CUDA library paths for the WSL workspace. The portable data adapter and Linux GPU runner are being implemented/reviewed; no new model fit or accuracy result exists yet. The existing Windows Job wrapper and CPU-forcing runner are not a verified GPU training path. See the outer MSI_SETUP_STATUS.md and Setup-IILAS-GPU.ps1 for bootstrap status. No automatic restart is authorised.

Next: finish WSL setup, verify TensorFlow actually sees the GPU, prepare and verify a separately recorded GPU execution profile, then run the fixed MobileNetV2 experiment and EfficientNet comparison. Keep the 80% target prospective; no new result exists yet. Datasets, model files and diagnostic outputs stay ignored. Photo/live model acceptance remains closed; other AI models and additional features remain deferred.

