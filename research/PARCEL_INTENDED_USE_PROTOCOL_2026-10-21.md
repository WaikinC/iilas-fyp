# Parcel photo and live intended-use evaluation protocol

Latest implementation checkpoint (22 October): [typed transport verification](PARCEL_TYPED_TRANSPORT_VERIFICATION_2026-10-22.md) now covers actual default-executor audit and one cold prediction (22.942 seconds/500.43 MiB). This replaces the serving-pending checkpoint below. It provides no new quality estimate or intended-use approval; both operational gates remain closed, and independent photo plus actual camera/session evidence are still required.

## Verified checkpoint — 22 October 2026

The original prospective protocol below is retained as history. The [once-only publisher-source evaluation](PARCEL_SOURCE_TEST_EVALUATION_2026-10-22.md) is now complete: primary MobileNetV2 achieved 68/75 correct (90.67%), Damaged precision 38/42 (90.48%) and recall 38/41 (92.68%). The predeclared strict subset scored 43/47 (91.49%). All 102 original TEST dispositions and 27 exclusions remain recorded. This meets the user's 80% point-estimate target for this publisher-source benchmark; it does not establish independent-source or camera quality. The permanently consumed test population must not be rerun, filtered, relabelled or used for further tuning.

The [Windows compatibility comparison](PARCEL_WINDOWS_COMPATIBILITY_2026-10-22.md) also passed independent verification: all 162 exposed validation labels agree across CPU batch one, CPU batch four and GPU batch four, with unchanged model/optimizer state and small probability differences. Its 58.401-second multi-image run is not the final 25-second cold single-photo proof. A new closed serving adapter and that bounded proof are the current implementation step. Both operational pins remain null; the application records Unavailable. No intended-use photo or physical-camera dataset is admitted, the public-only collection restriction persists, and other AI remains deferred. Older unscored/current-development statements below are dated snapshots.

Status: prospective evaluation design for the existing parcel completion goal, not a completed experiment or model acceptance. No new image access, collection, scoring, fit or model activation is performed by this document. Existing internal-test policy and all completed experiments remain unchanged.

Latest checkpoint: [the fixed internal source comparison](KAPUTT_INTERNAL_EVALUATION_2026-10-21.md) has completed with independent audit, weak quality and closed gates. The user now requests a future target of at least80% accuracy and retains public datasets. This is a target for a new, prospectively specified experiment on fresh group-separated evaluation data, not a claim about the completed122-image test or permission to tune/reuse it. Damage precision/recall, denominator, uncertainty, source relevance and actual camera evidence remain required;80% overall accuracy alone does not establish operational acceptance. No owned-box collection was authorised.

Scope: Choong's FR-7/FR-10/FR-11 and camera figures mapped in [the report scope review](../docs/PARCEL_CAMERA_SCOPE_2026-10-20.md). MobileNetV2 is primary; the frozen EfficientNetB0 is the comparator. PackageDamage remains a separately qualified external reference. Other AI and additional features remain deferred.

## Questions and evidence boundaries

| Question | Required evidence | Evidence that cannot answer it |
| --- | --- | --- |
| Does the software obey access, identity, retention and recovery rules? | Actual loopback application/emulator tests, controlled transport failures and independent review | Image classification accuracy |
| Does a model recognise the publisher's packaging labels? | Frozen source benchmark, raw predictions and group-aware scoring under its original protocol | Synthetic browser frames or successful API responses |
| Does it recognise visible shipping-parcel damage from staff photos? | Independent relevant licensed photos, observable condition labels and physical-parcel grouping | Cardboard material alone, retail-item identifiers or the existing development-validation accuracy |
| Does sampled camera analysis work on the intended device? | Real camera sessions with condition/visibility provenance, temporal measurements and measured resources | Replaying a still image, fake media or the source internal test |

Current MobileNetV2 development-validation evidence is 75/133 correct, 21/47 damage precision and 21/53 damage recall. It is inadequate for an acceptance claim. The completed tail-only experiment did not improve the fixed model-selection objective. Neither that result nor this protocol grants a new fit or permission to change source labels.

## Data admission and grouping

Public datasets remain the user's collection restriction. Review the original publisher's complete licence/access terms, provenance and permitted research purpose before acquiring a candidate. Keep images, per-image labels/IDs, manifests, raw results, weights and device/session evidence in ignored local datasets/outputs. Public eligibility does not automatically make data suitable for this task.

Record independently sourced attributes before model scoring: source/version and archive/image hashes; label authority and original label; whether shipping cardboard rather than retail packaging is established; physical parcel identity or its uncertainty; recording/session identity; available views; visible face/region; obstruction/blur/lighting; observable packaging condition versus unknown hidden/internal condition; prior training/development/review exposure. Keep publisher condition and any human visible-condition assessment separate. Never convert Unknown into Normal or infer that all views show the same visible damage.

For a photo classification benchmark, use one visible-condition label per image. An intact visible face on a known damaged box is not automatically a Damaged image; a parcel-level source label needs an explicit visibility qualification. Unobservable/out-of-task cases remain separate challenge/coverage records under a rule frozen before scores. Record all exclusions and reasons; do not remove difficult cases using model errors.

For live evaluation, use a physical-parcel condition record plus per-frame visible-condition/observability records. Do not broadcast a damaged parcel's global label to every frame. Session/parcel identity must be supported by source metadata or actual acquisition provenance; filename similarity, appearance and retail-item IDs alone do not establish it.

All photos, derived crops, faces, recording sessions and frames connected to the same physical parcel stay in one partition. If one recording contains multiple parcels, union its related parcels/sessions into one dependency component. Deduplicate exact/derived/similar images and retain ambiguous dependency edges conservatively before partitioning. Report unknown physical independence explicitly; it prevents a final intended-use generalisation claim.

No new images can be called an independent final set if they have already informed training, model/contrast/threshold selection or condition adjudication guided by predictions. The 147 reserved Kaputt candidates remain unopened and governed by [their once-only plan](../docs/superpowers/plans/2026-10-20-kaputt-crop-internal-test.md); they are not a replacement for an independent shipping-parcel/live set.

## Freeze before new evaluation access

Before an intended-use attempt, bind a dated protocol and exclusive attempt record to the exact model/selection/preprocessing/class order/decision rule, source licences and admitted component manifest, partition purpose, complete exclusions, evaluation code and resource policy. Model comparison, confidence treatment and any scientific acceptance targets must be fixed before new held-out pixels or scores are inspected. Preserve partial failures and reconcile their original attempt rather than silently starting replacements.

Keep the current fixed decision rule. Ties abstain; unavailable/failed/unknown outcomes have no condition. Confidence is an uncalibrated score, not probability that the parcel is undamaged. No post-test threshold search, relabelling, alternative split, repeated fitting or selective reporting. A new data-development experiment requires a separate prospective protocol and fresh independent final evidence.

The report does not specify numeric scientific acceptance targets. The user subsequently requests at least80%accuracy for future work; it is not achieved or promised by the present results. The intended task, fresh evaluation collection, class-specific precision/recall and other acceptance safeguards still need prospective justification before a new independent acceptance experiment. Do not retrofit80%to the completed test, manufacture other targets from current scores or weaken criteria after inspection. Missing relevant data and complete intended-use acceptance keep both operational pins closed.

## Classification reporting

Report photo and camera domains separately. For each model, retain complete ordered raw predictions with image/model hashes, inference outcomes and original ground truth. Show class supports, the Normal/Damaged confusion matrix with an Abstain column, accuracy, per-class precision/recall/F1, macro F1, coverage and operational failure/unobservable counts. Undefined ratios are null with numerator/denominator; they are not zero or 100%. Give both image/frame metrics and group-balanced metrics so long recordings do not dominate the result.

The denominator for conditional model metrics must be explicit: observable successfully inferred images are distinct from all submitted images. Separately count every admitted submitted frame, including unavailable, failure, expiry and abstention; do not claim successful-frame accuracy as end-to-end coverage. Abstention is not a correct Normal or Damaged classification. Preserve comparisons against an always-Normal reference and show damage recall so class imbalance cannot hide a useless detector.

Use uncertainty calculations resampled by independent dependency component, never individual adjacent frames. Freeze the estimator, seed, replicate count and interval construction in the actual experiment protocol. Label insufficient independent class support and degenerate intervals instead of giving unsupported precision. Existing Kaputt bootstrap settings remain specific to its predeclared internal estimand and must not be silently reused as a confidence interval for damage precision or macro F1.

There is no application session-level condition aggregation in this implementation. Do not turn many Normal frame outputs into a Normal parcel decision. An evaluation may describe visible damaged opportunities and missed/flagged frames, but a future parcel/session decision rule would require separate prospective design; it cannot be invented after viewing held-out sequences.

## Intended-device session measurements

Use the actual integrated application and intended camera/network/device after separate research execution is supported; do not bypass real admission using request or environment flags. External positive doubles remain software tests. Physical test evidence cannot be obtained solely by playing public photographs into a synthetic webcam.

Before acquisition, record device/camera/browser versions, input resolution, selected camera, lighting/view procedure and network path without credentials. MSI compute and a remote laptop camera are separate measurement configurations. HTTPS/loopback restrictions and current authentication/access must be satisfied. User-authorised new private physical captures would require changing the public-only collection constraint first; none are collected here.

Retain per-session monotonic event measurements: explicit start/open acknowledgement, capture start, JPEG encode end, reserve/ingest start, response, render, loss of Current, stop/track release and terminal server acknowledgement. Only compute durations between clocks with a shared monotonic origin; do not subtract browser wall-clock declarations from server clocks. Preserve server processing durations separately. Report observed end-to-end latency/result age distributions and maxima, completed/attempted/dropped counts and failure/recovery outcomes. Never infer invisible dropped-frame condition labels.

Current software limits are 120 seconds/session, at most 12 attempts, minimum 5 seconds between capture starts and after submission completion, one actual capture/submission in flight, zero queue, JPEG at most 960 pixels/1 MiB, local frame deadline 60 seconds and Current age strictly below 15 seconds. Trusted ingestion has its own 50-second overall observation deadline, 10-second Storage and 30-second HTTP bounds. These are limits to verify, not promised throughput, quality or hardware capability. Record insufficient timing support rather than changing the limits after a failure.

Measure browser and MSI service CPU/RAM before, during and after sessions; distinguish processes and include child inference processes. Record actual network bytes, session duration and cleanup, preserving peak usage rather than only a final idle snapshot. Run condition-quality measurement separately from deliberate network/failure injection and identify which configuration produced each result.

Exercise stop, tab hidden/pagehide, track ended, permission denial, context/role/stage/assignment changes, lost start/frame/stop responses, offline/reconnect and reload. Pending actual work and ambiguous server acknowledgement must keep their original IDs and prevent replacement work. No old result may become Current after stop, context change, reload or its age boundary. Check retained evidence generation/bytes, authorised shared reads and human review; no automatic stock/delivery changes.

## Current disposition and next evidence

1. Finish reviewed trusted handlers, client/component and actual application/emulator/browser verification with the real pins still null. This establishes a recoverable software workflow only.
2. Complete the relevant public-source/label/group audit and freeze a new data-development proposal only if it addresses shipping-parcel/visibility gaps. Do not rerun the completed negative candidate.
3. Once all comparison choices are final, execute the separately preserved once-only internal-test plan. Report its conditional source-benchmark finding, including a failure; do not call it IILAS field acceptance.
4. Secure independent relevant photo and real-camera/session evidence under the user's data constraints and fix scientific acceptance decisions before scoring. No suitable final intended-use collection is currently admitted; physical-camera evaluation remains unavailable under the existing evidence.
5. Review the complete licence, quality, hardware, resource, access and human-review evidence before any separately authorised model-admission change. This protocol authorises no deployment, production changes, external sharing or private capture.

No completion claim follows from preparing this protocol. The full working/evaluated photo and live-camera goal remains active.
