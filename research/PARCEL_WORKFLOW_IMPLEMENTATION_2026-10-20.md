# Parcel research workflow — 20 October 2026

This implementation prepares the report-backed MobileNetV2 primary model and EfficientNetB0 comparison. It does not install a model into IILAS. PackageDamage remains the frozen pretrained reference. Inventory and delivery models remain deferred.

## Data readiness

The reviewed TAMPAR panel is reserved for diagnostic/reference use. Its primary cohort contains ten photographs of five parcels: four Normal parcels and one Damaged parcel. Two gift-wrapped photos form a separate challenge parcel. No split or training permission is inferred from the human labels.

Actual model training and accuracy/precision/recall/F1 evaluation: **Not run**. More independently reviewed real parcels are needed, particularly damaged parcels. Public data still needs licence evidence, visible-condition review, an unambiguous target and confirmed parcel/session relationships. Repeated views increase image count without increasing the number of independent parcels.

## Implemented boundaries

- `parcel_manifest.py` validates local source records, human-review references, targets and connected parcel/session/derived-image groups. It rejects source/class confounding, unknown licences, diagnostic/challenge rows, modified images and exact decoded duplicates. Its minimum group count is an early software gate, not evidence of scientific adequacy.
- `parcel_inputs.py` provides shared EXIF-aware RGB decoding, full-frame 224×224 letterboxing and the fixed no-enhancement/CLAHE variants. Only training applies random augmentation.
- `parcel_models.py` constructs frozen MobileNetV2 and EfficientNetB0 backbones with a two-class head. Local pretrained weights require separate acquisition/provenance and version verification; workers cannot download missing weights.
- `parcel_train.py` separates development from test pixels and claims the four declared fits before execution. Validation selects one contrast variant per architecture. Changed or copied output locations cannot silently reset an experiment allowance.
- `runner_runtime.py` now supports a continuous available-memory floor as well as initial memory, working-set, time, disk and output limits. Process Jobs terminate descendants on failure.
- `parcel_evaluate.py` verifies the frozen selection and completed development record, then claims test access once. It saves predictions before scoring and reports image-weighted and equal-parcel-weighted metrics, explicit abstentions and conditional metrics. Paired group bootstrap covers the difference in accuracy; macro-F1 is a point estimate. Fewer than five groups per class suppresses bootstrap, fewer than twenty warns, and degenerate intervals are flagged.

Manifest JSON and its source registry belong under ignored `research/datasets/`, together with all image files, split receipts, weights and results. The schema is documented in `parcel_manifest.py`. The split writer produces a new manifest and an audit receipt; both are required. Hash receipts detect accidental modification; they do not authenticate human decisions or prove unknown parcels independent.

The protocol template in `protocols/parcel_mobilenetv2_v1.json` intentionally has blank weight records. Do not fill those with arbitrary weights or lower resource limits to make a run start. Once an eligible cohort and approved local weights exist, the intended commands are:

```powershell
. ..\Enter-IILAS.ps1
& C:\Users\Home\.venvs\iilas-fyp\Scripts\python.exe research/parcel_train.py develop `
  --manifest research/datasets/<cohort>/frozen.json `
  --protocol research/datasets/<experiment>/protocol.json `
  --output research/datasets/<new-development-run>
```

The development budget is four sequential head-only fits, batch four, at most ten epochs each, one CPU thread, 900 seconds per fit and 3,900 seconds overall. Limits are 2,048 MiB combined RSS, 3,072 MiB available at startup, a continuous 768 MiB available floor, 512 MiB output and 2 GiB free disk. A failed run stays failed; changing the protocol is an explicit new experiment, not an automatic retry.

After a successful development phase, the separate command is:

```powershell
& C:\Users\Home\.venvs\iilas-fyp\Scripts\python.exe research/parcel_evaluate.py test `
  --selection research/datasets/<development-run>/selection.json `
  --manifest research/datasets/<cohort>/frozen.json `
  --output research/datasets/<new-test-run>
```

Test inference and scoring run sequentially inside a 900-second phase, with 600 seconds per worker and a 256 MiB output limit. The memory and disk guards remain in force. Exact score ties abstain; no confidence threshold is tuned on test data. Missing predictions cannot silently become Normal or disappear from the denominator.

PackageDamage comparison is **Not run** in this workflow. An optional export adapter can score a separately authorized, supervised baseline run on exactly the same reviewed targets. It does not run or retrain PackageDamage. Existing nine-image diagnostics stay frozen, and upstream licence/unknown training-overlap restrictions remain unresolved for application integration.

## Software verification

Independent task reviews and the final review passed after correcting source/class admission, location-dependent retry identity, EfficientNet's local-weight normalization and baseline import validation.

Seventy-three focused tests completed: **71 passed and two skipped** because Windows did not permit creating symbolic links. Runtime tests exercised live-worker timeout, RSS, output and available-memory termination, including descendant cleanup. The remaining checks cover grouping, source approval, preprocessing, test separation, immutable claims, modified artifacts and abstention metrics.

A complete synthetic/random-weight development run completed all four fits and all ten epochs per fit. Development took **150.25 seconds**, with **714.5 MiB** peak combined RSS. The separate sealed test command completed in **23.17 seconds**, with **523.1 MiB** peak combined RSS. Validation and test sample identities were disjoint; both phase claims completed; all three synthetic test targets were retained. Bootstrap correctly reported insufficient group support. These figures measure software execution, not real-parcel prediction quality.

Local ignored evidence: [workflow verification](datasets/parcel-workflow-smoke-31a90da6/verification.json), [development selection](datasets/parcel-workflow-smoke-31a90da6/development/selection.json), and [test report](datasets/parcel-workflow-smoke-31a90da6/test/report.json). **Every model in this smoke cohort has random fixture weights and must not be installed into IILAS.** Its synthetic scores are deliberately not presented as model evaluation results.

Earlier isolated smoke failures remain preserved: a Keras save attempted the inaccessible system temporary directory, and a combined helper attempted to configure CPU settings after importing TensorFlow. Both were corrected; the final combined model smoke and complete workflow passed. Keras emitted an unknown-dataset-cardinality warning during development; saved histories and logs confirm all four fits completed ten epochs with the expected batches. No shortened real-data experiment or replacement real-data fit occurred.

All 84 protected files, including reviewed originals/journals, frozen PackageDamage material and active vision code, remained hash-identical. No datasets, models or output artifacts are tracked by Git. The new workflow does not alter the application, Firebase configuration or production data.

## Remaining core work

1. Obtain sufficient, licensed public real-parcel data with independently reviewed damaged examples and reliable parcel/session groups. Complete review before assigning partitions.
2. Acquire official pretrained weights separately, record their hashes and permissions, freeze the cohort and protocol, then execute the bounded development comparison.
3. Evaluate selected frozen artifacts on the held-out cohort once, with abstentions and parcel-level uncertainty reported. Keep baseline overlap and licensing limitations explicit.
4. Integrate photo analysis with shipment/stage/user evidence, failures and human review.
5. Implement and evaluate the report's sampled live-camera workflow, including start/stop, session identity, stale-frame handling and measured latency.

No photo or camera accuracy claim follows from passing the research software tests.
