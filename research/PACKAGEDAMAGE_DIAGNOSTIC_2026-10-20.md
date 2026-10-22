# PackageDamage local diagnostic — 20 October 2026

## Outcome and decision

The external pretrained PackageDamage YOLO11n checkpoint runs on MSI in a separate CPU-only research environment. On six previously recorded human Normal/Damaged decisions it produced **three matching image summaries, one disagreement and two abstentions**. Three additional uncertainty/relevance cases received no binary score. Do not activate this model in IILAS from these results.

This is a selected synthetic diagnostic, not accuracy on six independent real parcels. The six cases span five proposed groups (P01/P27 share one), and relevance/family approval remains unresolved. P14 is DVD-derived packaging and P21 is food retail packaging; other asset roots are also retail-derived. No new human label, final acceptance, family approval or partition was inferred.

## Checkpoint, licence and provenance

- Publisher: [cvtechniques/PackageDamage](https://huggingface.co/cvtechniques/PackageDamage).
- Pinned revision: `fd5c4690b6c81b3ed9658b61ee690d8478f0ccdf`.
- `best.pt`: 5,472,026 bytes; SHA-256 `84c9b943672e676f32c97dc36a81aae8766bdd96646e1b5e552de17aebca289c`.
- Checkpoint and card/config/results files match publisher LFS SHA-256 or Git blob hashes. Model metadata, tree, original files and manifest are preserved locally.
- Actual checkpoint mapping is **0 = Damaged, 1 = Normal**. Publisher runtime version is Ultralytics 8.4.21.

The Hugging Face card declares MIT but its repository contains no separate licence file. It describes fine-tuning an Ultralytics YOLO11n COCO checkpoint. Therefore its MIT metadata does not resolve all upstream software/weight rights. The installed Ultralytics 8.4.21 distribution includes AGPL-3.0; its exact licence is saved with this audit. AGPL section 2 permits running and nonconveyed works, supporting this private local evaluation. Ultralytics' [licensing position](https://www.ultralytics.com/license) also asserts requirements for trained/fine-tuned models and closed-source usage. Resolve that licence chain before service integration or redistribution; noncommercial status alone is not an exemption. This task neither accepts a commercial licence nor uploads or distributes the model.

The card links two Roboflow training sources but does not establish precise source versions, original-image permissions, physical-box grouping or their overlap with our inputs. Its stated approximate validation count (~557) differs from its metric table (499 images/538 objects). Its source-to-final treatment of `Open_package` is undocumented. Published validation precision/recall/mAP are not reproduced here and are not IILAS accuracy evidence.

## Fixed diagnostic protocol

The user authorised testing these reviewed images; prior training/quarantine restrictions remain intact. Inputs and their provenance are bound by `outputs/packagedamage-20261020-cohort/cohort.json`, including the six recorded binary choices and separate P17/P30/P31 cases. All originals remain unchanged.

One configuration was fixed before predictions: image size 640, confidence cutoff 0.25, NMS IoU 0.7, maximum 300 returned detections, batch one, CPU FP32, one compute thread, seed zero, no augmentation and fixed square letterbox preprocessing. These are a single exploratory configuration, not calibrated settings. No threshold search, training, fine-tuning or calibration was performed.

Every returned box, class, confidence and pixel/normalized coordinates is saved. Image summaries are:

- `damage_only`: at least one Damaged detection, no Normal detection.
- `intact_only`: at least one Normal detection, no Damaged detection.
- `mixed`: both classes; abstain from binary classification.
- `no_supported_detection` or unknown class: abstain, never infer Normal.

There is no human bounding-box ground truth or formally verified detection-to-target association, so this pass reports neither mAP nor localization accuracy. Scores attached to boxes are detector outputs, not calibrated probabilities that a parcel is damaged. An intact-only summary does not certify unseen faces or contents.

## Per-image results

| Case | Recorded human choice | Detector output at frozen cutoff | Interpretation |
|---|---|---|---|
| P01 | Damaged | Normal 0.914 | Disagreement; visible damage was not recognised as Damaged |
| P02 | Normal | Normal 0.899 | Matching image summary |
| P14 | Damaged | No detection | Needs review; no damage verdict |
| P21 | Normal | Normal 0.625 and Damaged 0.281 | Mixed; needs review |
| P27 | Normal | Normal 0.821 | Matching image summary |
| P33 | Normal | Normal 0.874 | Matching image summary |
| P17 | Relevance objection; no condition label | No detection | Separate diagnostic; no correctness score |
| P30 | Uncertain, hold | No detection | Separate diagnostic; no correctness score |
| P31 | Uncertain, hold | No detection | Separate diagnostic; no correctness score |

Do not report 3/4 decisive results as “75% accuracy” or use the unscored cases as correct negatives. There is no defensible operational accuracy or precision estimate from this selected, tiny cohort. No Damaged-only summary was produced for either human-Damaged case.

Raw predictions were saved before comparison. Annotated overlays are available in ignored `research/datasets/packagedamage-external-20261020/run-02/`. Root visually inspected P01/P14/P21 overlays: P01 has a Normal box around the reviewed parcel, P14 has no detection, and P21 has overlapping class predictions. Overlapping labels in the standard P21 overlay obscure part of the text; the JSON retains both exact scores.

## Execution and resource evidence

Commands ran on host MSI. Python 3.13.15, torch 2.9.1+cpu, torchvision 0.24.1+cpu and Ultralytics 8.4.21 were installed into the separate ignored `outputs/packagedamage-runtime-20261020/.venv`. Full package versions and wheel download hashes are preserved in environment/install reports. The established research environment and application dependency manifests were not changed.

The checkpoint was inspected statically, then loaded with `torch.load(weights_only=True)` and an explicit allowlist of installed library classes. There is no unrestricted-pickle fallback. This reduces checkpoint-loading risk; a virtual environment and Python socket guard are not an OS security boundary.

Inference ran through the existing Windows Job supervisor: 1,536 MiB maximum observed RSS budget, 1,800 MiB available-memory preflight, 240-second worker limit, 300-second overall limit, output/disk bounds and descendant-process cleanup. Python network connection attempts were blocked; none were recorded. Model sync and automatic installation were disabled.

The first attempt stopped on a class-name case guard before image inference: checkpoint names were capitalised. Static opcode inspection verified the exact mapping, and a narrowly scoped fix preserved original labels while normalising only summary comparisons. The failed logs, script and protocol are retained. The second attempt used identical inputs and inference settings and completed all nine images successfully. No rerun followed inspection of predictions.

Successful supervised execution took **6.590 seconds**, with observed peak combined RSS **415,125,504 bytes (about 396 MiB)**. The first image call took 0.199 seconds and subsequent calls approximately 0.065–0.071 seconds. These figures cover this small CPU diagnostic; they do not establish camera FPS, sustained load, backend latency or end-to-end application performance.

## Next core step

Retain this checkpoint as an external baseline, with current failures preserved. Complete relevant parcel label/family review and obtain an independently labelled assembled-parcel evaluation cohort before comparing generalisation. Any future preprocessing or threshold experiment needs a separately declared development protocol; do not tune against these nine outputs and call the result held-out evaluation.

The report-backed MobileNetV2/EfficientNetB0 work remains intact. Photo integration, live sampling and multi-view/session evaluation remain unfinished. Other AI modules and extra features remain deferred. No app model was activated, no production data changed, and no model, image, dependency environment or prediction was committed or uploaded.
