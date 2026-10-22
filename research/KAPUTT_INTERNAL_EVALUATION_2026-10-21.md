# Kaputt crop internal evaluation — 21 October 2026

Status: the once-only internal source comparison completed on MSI. Original process 68500 terminated with exit zero; the finalized report, completed claim and finalization observation exist. A separately implemented, independently reviewed metadata/raw audit reproduces all dispositions, graph statistics, metrics and bootstrap results. Native observation confirms no evaluation process remains. Model quality is weak, both application admission pins remain null, and the full working, evaluated photo/live parcel goal remains incomplete.

## What this experiment answers

The comparison uses the original selected MobileNetV2 with CLAHE and original EfficientNetB0 without CLAHE. The separate tail-only experiment was negative, so its candidate is not selected. PackageDamage remains the earlier separate comparison reference; it is not rerun.

The original development has 633 training and 133 validation crops. There are 147 reserved internal candidates, initially 81 Normal and 66 Damaged, from the publisher's TRAIN split. These are internal source partitions, not the publisher's official test set or independently collected IILAS shipping parcels. Publisher defect labels remain unchanged. Packaging material and source-item identity do not prove visible shipping-carton damage or physical parcel independence.

Admission must retain every candidate's disposition. All 965 known reference nodes remain graph relays; source-item, exact/decoded-image and fixed dHash links propagate exclusions transitively. A component reaching frozen development or the old 100-image sample is excluded. Technical failures exclude the entire affected component without replacement. Both classes must survive before either model is run.

The statistical policy is fixed: ordered raw probabilities, exact-tie abstention, image and equal-component metrics, complete confusion/precision/recall/F1/NLL/coverage, and an always-Normal reference. The seeded 2,000-replicate paired component bootstrap estimates MobileNetV2-minus-EfficientNetB0 mean component correctness. It is not a precision or macro-F1 interval. No post-test threshold, label, model, contrast, split or seed search is allowed.

## Completed comparison

The fixed admission retained **122 images: 66 Normal and 56 Damaged, in 78 dependency components**. It excluded 25 images in four components, without replacement. Recorded reason counts overlap: 23 images touch old100, 18 touch training and two belong to technically failed components. They are not additive. All 147 candidates have a disposition. There are 24 mixed-label admitted components; 51 components contain each class, with overlapping counts. These conservative dependency components do not prove physical parcel identity.

The following figures are unweighted image metrics on the same 122 admitted images. They are the completed internal test findings, distinct from the earlier 133-image validation used for model selection.

| Fixed model/rule | Correct / images | Accuracy | Damaged precision | Damaged recall | Macro F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| MobileNetV2 CLAHE | 69 / 122 | 56.56% | 25 / 47 = 53.19% | 25 / 56 = 44.64% | 0.5548 |
| EfficientNetB0 standard | 64 / 122 | 52.46% | 32 / 66 = 48.48% | 32 / 56 = 57.14% | 0.5246 |
| Always Normal | 66 / 122 | 54.10% | Undefined: no Damaged predictions | 0 / 56 = 0% | 0.3511 |

MobileNetV2 misses 31 damaged images and falsely flags 22 normal images; EfficientNetB0 misses 24 and falsely flags 34. All admitted images received predictions with no exact-tie abstentions. This 100% classifier coverage is conditional on admission; it is not 100% accuracy or full-candidate/real-camera coverage. MobileNetV2's small accuracy advantage over Always Normal does not establish reliable damage detection. PackageDamage remains its earlier separately evaluated reference; it was not rerun on this cohort.

| Model/rule | Equal-component accuracy | Equal-component macro F1 | Damaged precision | Damaged recall | NLL |
| --- | ---: | ---: | ---: | ---: | ---: |
| MobileNetV2 CLAHE | 53.85% | 0.5315 | 53.13% | 42.86% | 0.7240 |
| EfficientNetB0 standard | 52.03% | 0.5195 | 50.58% | 57.58% | 0.7222 |
| Always Normal | 51.39% | 0.3394 | Undefined | 0% | 7.8352 |

The fixed paired component bootstrap gives a MobileNetV2-minus-EfficientNetB0 mean-correctness difference of **+1.82 percentage points**, with a 95% percentile interval of **-10.90 to +14.85 points** (2,000 replicates, seed 42). The interval crosses zero and does not establish a clear winner. It is specific to this source-component estimand, not a damage-precision interval or evidence of independent physical parcels.

All seven native resource receipts report success. Actual reference/acquisition took 125.41/155.67 seconds under their unchanged 512 MiB caps; model worker times were 172.53/192.19 seconds at approximately 850/885 MiB, within 300 seconds/2 GiB each. Actual scoring took 92.62 seconds under 120 seconds/2 GiB. The supervised attempt took 1,298.85 seconds with 1,290.13 MiB peak; its evaluation phase took 891.85 seconds under 1,200. Worker times include integrity verification and setup; dividing them by image count does not establish live-camera throughput. Finalization stayed under the original owner deadline.

## Verified preclaim failure and repair

The first real invocation ended before any scientific claim or acquisition: its known-reference hierarchy used 562,094,080 bytes against the fixed 536,870,912-byte cap. Native observation confirmed it stopped. Its protocol, request, logs, resource receipts and twelve original source snapshots are preserved locally. A sealed reconciliation records the ordering and both absent claim namespaces. Nothing resumes that failed output.

The cause is two resident metadata-library stacks inside a supervisor-plus-worker budget. Deleting an unused context saved only 4,976,640 bytes; it did not establish a sufficient fix. The repaired supervisor verifies bounded JSON, metadata/model hashes and the existing completed-four-fit/claim proof without importing Parquet libraries. It uses a core-bound derived reference projection. Every pixel-reading leaf independently reconstructs the full original context and compares that exact projection before its builder. Native accounting and the 512 MiB cap are unchanged.

The scoring path also repeated six full admission checks, each reconstructing the original context twice. Its twelve reconstructions presented a preclaim timing risk against the unchanged 120-second score limit; no real timeout or test score was observed. The repaired transaction makes two full admission checks, at start and end, while retaining four complete raw/native/worker checks. Captured canonical document, prediction, receipt and report digests reject late changes before exclusive report staging. No global validation cache or weaker public inference verifier was added.

## Evidence and remaining gates

| Gate | Current evidence |
| --- | --- |
| Intake and evaluator software | Parent combined run: 164 tests in 162.367 seconds, 163 passed and one explicit optional TensorFlow fixture skipped. Focused 47-case checks overlap this suite and are not an extra accuracy denominator. |
| Independent review | Intake, original evaluator, controller repair, scoring transaction and prior prospective protocols have separate read-only reviews. Current evaluator SHA-256 is `15bd2c2e4c0b31a4ab2602a71757e4b1838f8732754cb63248e64c2675568cf3`. |
| Native resource feasibility | Current-source metadata reference leaf passed in 42.41 seconds at 380.14 MiB under the unchanged 180-second/512 MiB limit. Four full metadata reconstructions plus artificial scoring math passed in 85.82 seconds at 380.64 MiB under the unchanged 120-second/2 GiB score limit. The supervisor loaded no heavy metadata/model libraries. These fixtures exclude real JPEG decoding, admitted-graph/journal and actual inference-proof I/O; they establish neither whole-pipeline timing nor model quality. |
| Original research/app preservation | Nine sealed training/runtime sources, five models and previously verified app boundaries remain unchanged; both model pins are null and both Python admission functions remain closed. No private data/model/output is tracked. |
| Credential exclusion | Final expanded check passes 367 tracked/nonignored source files; the reachable-history check remains 246 blobs with no history/index change. Datasets, models, raw labels/results and private configuration remain ignored. |
| Scientific access and closure | Protocol 03 passed independent review, explicit parent preclaim-recovery reconciliation and fresh execution checks. The original scientific claim is now completed and permanently consumed. The independent terminal audit passes all 147 associations/dispositions, reference and graph reconstruction, complete statistics, ordered raw/journals, metrics/bootstrap and recorded native/phase/claim/report chains. The parent separately confirms native process absence and rehashes all nine training/runtime sources and five models. No retuning, relabelling, alternate claim or replacement invocation is allowed. |

Detailed execution evidence is local and ignored under `outputs/kaputt-crop-evaluation-20261021` and `research/datasets/kaputt-crop-evaluation-20261021*`. The [implementation plan](../docs/superpowers/plans/2026-10-20-kaputt-crop-internal-test.md) and its ignored progress ledger identify the authoritative original process handles. A timeout observing a handle never authorizes a replacement run.

This completes the internal benchmark only. The [intended-use protocol](PARCEL_INTENDED_USE_PROTOCOL_2026-10-21.md) still requires relevant independent shipping-parcel/photo evidence, justified acceptance criteria and actual camera/session quality and resource measurements. Public-only collection remains in force unless the user explicitly changes it; a local owned-box pilot has been proposed, with no captures made or permission assumed. Public-source follow-ups have not established a new suitable final photo/live collection. The priority is visibly supported damage labels and known physical parcel/session groups before another prospectively frozen development experiment with fresh independent evaluation. Do not train/tune against these now-observed 122 test images and call a repeated score independent.

Existing photo/live software is locally verified with real inference unavailable; synthetic positive software cases do not establish damage accuracy. Current source backgrounds, retail/package rather than shipping-carton labels, small selected training cohort, unverified physical independence, low-resolution/cropped views and uncalibrated confidence limit the models. Hidden faces and internal damage remain unobserved; multiple Normal frames do not establish an intact whole parcel. Other AI and additional features remain deferred. No publication, deployment or production change is authorised.

The user's subsequent80%target and model/fine-tuning questions are addressed in [the saved diagnosis and proposed approach](PARCEL_ACCURACY_TARGET_2026-10-21.md). It changes no result or completed protocol. Public-only remains in force; no new model was trained or substituted.
