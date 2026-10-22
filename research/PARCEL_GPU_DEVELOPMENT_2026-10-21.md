# Parcel GPU development — 21 October 2026

The corrected two-model GPU development experiment completed on MSI and passed independent source, raw-result, native-resource and statistical review. MobileNetV2 remains primary; EfficientNetB0 is the comparator. Both operational acceptance pins remain closed: these are development-validation findings, not reserved-test, staff-photo or live-camera acceptance.

## Completed corrective result

The fixed experiment used 753 TRAIN and 162 VALID images with unchanged publisher labels. Validation has 107 Normal and 55 Damaged views in 159 conservative dependency components.

| Model | Image accuracy | Damaged precision | Damaged recall | Image macro F1 | Component accuracy |
| --- | ---: | ---: | ---: | ---: | ---: |
| MobileNetV2 / CLAHE, primary | 91.36% (148/162) | 82.54% (52/63) | 94.55% (52/55) | 0.9067 | 91.19% |
| EfficientNetB0 / none, comparator | 93.83% (152/162) | 90.91% (50/55) | 90.91% (50/55) | 0.9312 | 93.71% |
| Always Normal reference | 66.05% (107/162) | Undefined: no Damaged predictions | 0% | 0.3978 | 66.98% |

MobileNetV2 missed three Damaged views and flagged eleven Normal views; EfficientNetB0 missed five and flagged five. All 162 validation rows have recorded outputs with no ties/abstentions. This is validation inference coverage, not application or camera coverage. Component macro F1 is 0.9039 and 0.9289 respectively; the fixed comparison rule ranks EfficientNet first, while the report's primary architecture remains MobileNetV2.

The predeclared 2,000 paired component-bootstrap draws give image-accuracy 95% intervals of 86.88–95.65% for MobileNet and 90.00–97.50% for EfficientNet. The paired accuracy difference is +2.47 percentage points, interval −1.82 to +6.79, so this sample does not establish a clear general advantage. Known components are not verified physical parcels, and this resampling cannot account for unknown source dependencies or domain shift. The 80% target has been exceeded on development validation only.

Both native workers completed with clean shutdown: MobileNet 501.596 seconds/five epochs/best epoch two; EfficientNet 743.218 seconds/eight epochs/best epoch five. The whole controlled phase took 1,305.257 seconds. Actual readback of both saved model archives verifies exactly 945 and 1,512 Adam updates. Stable reconstructed checkpoint loss differs from recorded best loss by 2.91e-8 and 1.79e-8, within the unchanged 1e-4 guard.

The first auxiliary counter verifier expected the display name `adam`; serialized configuration and state consistently use `adam_1`. A separate read-only diagnostic established the class/module/configuration, and a preserved new verifier checks Adam identity and matching state/configuration names while retaining exact artifact/type/shape/count guards. It passed without executing or modifying either model. This diagnostic correction caused no retraining or scientific setting change.

Ignored evidence: development `develop-02/comparison.json`, `development-summary-02.json`, `optimizer-steps-03.json`, and `independent-develop-02-scientific-attestation-01.json` under the locally recorded research/output roots. The earlier failed run and its 93.21% diagnostic remain preserved; they are not substituted for these corrected results. The next [reserved-source audit](PARCEL_SOURCE_TEST_PLAN_2026-10-21.md), serving-artifact compatibility, and actual photo/live acceptance remain incomplete.

## Verified setup and inputs

MSI runs WSL 3.0.3 and Ubuntu 24.04.5 with a separate Python 3.12.3 environment. TensorFlow 2.21.0, Keras 3.15.1, NumPy 2.4.2, h5py 3.14.0 and OpenCV 4.14.0.94 are installed; pip check passes. The resolved CUDA packages and all 64 distribution hashes are recorded locally. The original Windows environment is preserved.

An actual GPU smoke test executed matrix multiplication and convolution on the RTX 3050 Laptop GPU, with soft CPU fallback disabled and a 2 GiB TensorFlow GPU allocator limit. It passed numerical checks in 9.409 seconds. This establishes the environment, not model feasibility or damage accuracy. The outer Enter-IILAS-GPU.sh activates this environment and its CUDA library paths; the WSL VS Code workspace uses it for new terminals.

The portable transport preserves the original reviewed dataset and weight provenance. Windows and Linux independently verified 915 encoded image hashes, both official pretrained weights and four provenance records. All 915 decoded RGB hashes also match between platforms. No TEST image was decoded.

| Partition | Normal | Damaged | Views | Dependency components |
| --- | ---: | ---: | ---: | ---: |
| TRAIN | 385 | 368 | 753 | 696 |
| VALID | 107 | 55 | 162 | 159 |

These components capture known dependencies; they are not verified physical parcel identities. Dataset suitability and rights limitations remain those in [the source selection](PARCEL_DATASET_SELECTION_2026-10-21.md).

## Preserved first GPU probe

The first GPU profile was prepared under key 77506da9ddfe4b967078a4ebee9d94e2faa70a5deba4e39c6dabf5bca191970a. Its no-update MobileNetV2 worker stopped after approximately 51 seconds at the conservative host-memory guard. The cgroup charge reached 2 GiB and the controller used another 58 MB. About 5.0 GB of Windows RAM remained available.

The service and all descendants were cleaned up. No successful probe timing/state receipt, fitted model or validation prediction was produced, and the EfficientNet worker was not started. The failed claim, original preparation and four source/test snapshots remain preserved. This failure does not measure accuracy. Its missing memory breakdown also prevents attributing the charge to a particular library or file cache.

## Prospective GPU memory amendment

The separately reviewed second profile allows a 4 GiB host cgroup and aggregate charge/controller budget. Both Windows and WSL must initially have at least 6 GiB available, with 2 GiB live floors. The actual 4 GiB service controls passed a stdlib-only native smoke test. Memory-charge categories and process RSS will be recorded separately; cached pages are not subtracted to evade the guard.

The GPU allocator stays at 2 GiB. One CPU, zero swap, a 180-second whole probe, 3,000 seconds per fit, a 6,300-second development phase, and 128 MiB probe/512 MiB development output ceilings remain fixed. Data, labels, groups, pretrained weights, preprocessing, seed, optimizer, early stopping and comparison rules remain unchanged. A distinct preparation/key is required before any new model probe; the first claim is not resumed or overwritten.

Metadata profiling found a separate bottleneck: a full transport verification took 36.661 seconds, with 33.300 seconds spent repeatedly checking paths on the Windows mount. The new Linux descriptor loader passed actual equivalence: all 915 images, two weights and four provenance records were checked, and the complete returned dictionaries matched. Verification took 1.928 seconds versus 35.623 seconds for the original loader. Linux safety fixtures cover real symbolic links, hard links and FIFOs; the artificial files use Linux /tmp because the mounted Windows filesystem cannot create FIFOs. The original transport and loader remain unchanged.

## Second probe and environment correction

The separately prepared second probe completed MobileNetV2's no-update numerical work on GPU:0 and verified unchanged learned, BatchNorm and optimizer state. Three steady replicates measured maximum four-image decode 0.2993 seconds, forward 0.01381 seconds and complete head-gradient calculation 0.01839 seconds. These timings are feasibility evidence, not accuracy or training results.

The worker then failed its final environment comparison. A separate import-only diagnostic established that OpenCV prepends its own library directory to LD_LIBRARY_PATH; package records, GPU identity and all other bound environment fields stayed unchanged. The correction accepts exactly that single prefix from the pinned OpenCV package with its loaded module origin verified. Unexpected paths, duplicate prefixes and changed suffixes still fail. An actual Linux before/after import check passed with equal full environment identities.

The failed second probe and its original source snapshots remain preserved. Its native worker took 21.243 seconds, stayed below the 4 GiB aggregate host limit, and cleaned up all descendants. EfficientNet was not started, no fit ran, and no validation predictions were produced. A new source-bound preparation is required for the corrective attempt.

## Third probe and prospective cache preflight

With that environment correction, the third probe's full MobileNetV2 worker passed in 24.086 seconds and cleaned up. The comparison worker was never launched: its 45-second readiness wait recorded Windows available RAM below 6 GiB throughout. Linux retained roughly 2.2 GiB of file cache. The phase remains failed and preserved; no fitted model or validation score came from it.

The separately declared v3 resource profile performs one fixed clean-Linux-cache operation before each worker while no GPU worker is registered. It uses the existing Windows-to-WSL root route with an inner seven-second timeout and one-second forced-stop allowance, inside a ten-second outer bound. It refuses to start without enough remaining phase time. Failure prevents model launch, and uncertain administrative cleanup retains the execution lease. This is an administrative resource amendment: it clears global Linux file cache and changes cold-cache I/O conditions; it neither deletes data nor changes model parameters or memory thresholds.

An actual pair of serial stdlib workers passed this preflight and all native controls, with clean descendant shutdown. Cache preflights took 2.944 and 2.242 seconds; both admitted with more than 6 GiB Windows RAM. The Linux fixture suite ran 82 cases with one Windows-only skip, and the six reporting-helper fixtures passed. The fourth preparation and metrics/bootstrap policy were frozen before model results. Its two-model probe passed, including independent metadata reconstruction; projected fits were 1,598.177 and 1,661.561 seconds. All previous failed claims remain preserved.

## First fit and verified correction requirements

MobileNetV2 completed five full epochs and saved its classifier; its native worker took 509.240 seconds and cleaned up within all resource limits. The final loss consistency check failed, so EfficientNetB0 was never started. Full history and raw predictions were written after that guard and were lost from memory; only rounded epoch losses survive. The old claim cannot be retroactively accepted.

A bounded no-update replay verified that the saved model reproduces the rounded best checkpoint loss: compiled validation loss was 0.2051440. Raw batch-four NLL was 0.2050884, within the unchanged 0.0001 guard; batch-one NLL was 0.2052995, outside it. Maximum probability difference between the batch shapes was 0.006827. No probability clipping occurred in this artifact, and model and optimizer state stayed unchanged during the replay. This establishes a scoring-path discrepancy, rather than lost checkpoint restoration.

The saved optimizer counter was 950 instead of the intended 945 updates. An actual artificial GPU experiment reproduced the cause: an unknown-length three-batch dataset over two epochs produced eight counter increments; declaring the exact three-batch cardinality produced six. It also verified that cached logits and stable per-image cross-entropy are available inside a compiled GPU scoring function. These artificial checks establish software behavior, not parcel accuracy.

The prospective v4 correction will declare exact TRAIN/VALID batch counts, score validation in the same four-image/short-final-batch shape, and persist history/raw diagnostics before any success guard. Checkpoint loss will use independently reconstructed stable logit cross-entropy with the same 0.0001 tolerance. The existing clipped-probability NLL remains separately labelled for the unchanged comparison and bootstrap rules. No TF32 toggle, dataset, architecture, learning-rate, seed, augmentation, early-stopping or resource-limit change is planned. A new source-bound preparation/probe and corrective two-fit experiment are required.

## Next execution

The v4 correction is now frozen and independently reviewed. The current Windows suite ran 109 cases (four Linux-only skips), and the Linux suite ran 93 (one Windows-only skip), both passing. An actual artificial GPU fixture verified the production compiled scorer, including its short final batch and extreme-logit cross-entropy. These are software checks, not new parcel accuracy results.

A separate mounted-file read issue was reproduced: complete source bytes and identity/size/mtime stayed unchanged while access and change timestamps advanced together. The new loader permits only that observed advancing, equal-timestamp pattern, retains every full-content hash and critical metadata check, and parses JSON from the exact hashed bytes. Actual slow/new-fast full-return equality passed for all 915 images, both weights and four provenance files: 37.419 seconds versus 1.911 seconds. The original loader and transport remain preserved.

Preparation 05 binds the corrected sources under key `7d941fe4becf07dccf3fdc07957e069364d0946064b06f5a61d187a39e219469`. Its probe failed at the unchanged 6 GiB RAM admission check before any model worker was armed or spawned. A separately tested and reviewed one-use metadata recovery preserves that failed claim and binds all ten provenance records. Removing the recovery extension from preparation 06 gives the exact original binding; no source, scientific or resource setting changed. An initial recovery metadata check also stopped at the existing filesystem guard before writing anything; a bounded complete guarded read then passed, and identical preparation succeeded. The cause of that transient file-metadata rejection was not established.

The recovered preparation uses key `aef72c6d16f6c23424533e801821ab37a1bd006ebe6d359030ce3a9f55c02507`. Probe 06 passed for both models: MobileNetV2 native runtime 24.824 seconds and EfficientNetB0 28.933 seconds, with GPU execution, unchanged learned/optimizer state and clean shutdown. Parent full verification and independent reconstruction passed; conservative projected fits are 1,657.404 and 1,783.893 seconds, within the unchanged limits.

Metrics policy 06 and reporting-helper binding 03 were recorded before results, including the fixed always-Normal reference. Corrective development 02 is now completed, with the verified result above; original exec56182 terminated with exit0. All earlier failed claims and diagnostics remain preserved. Neither training success nor development validation grants photo/live acceptance.

Freeze the reviewed GPU profile, run its TRAIN-only no-update feasibility probe, and proceed to the two ordered fits only after both native and scientific probe evidence pass. The probe uses the first four sorted TRAIN IDs, their weights from the full TRAIN partition, dynamic-batch compiled functions and the maximum of three steady measurements. Learned, BatchNorm and optimizer state must remain unchanged.

The fits retain frozen backbones, batch four, seed 42, float32, Adam 0.001, at most ten epochs and patience-three restoration of best weighted validation loss. Predictions must come from saved and reloaded classifiers, cover all 162 validation rows and reproduce the recorded metrics and restored loss. Both image and component-weighted metrics will be reported. The 80% target remains prospective; validation performance alone will not establish live-camera or operational acceptance.

Raw data, weights, models, reviews and diagnostics remain ignored and local. Other AI models, additional features and production operations remain deferred.
