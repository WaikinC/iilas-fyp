# Parcel photo and live-camera scope correction — 20 October 2026

Implementation update: [manual capture foundation](PARCEL_CAPTURE_2026-10-20.md) now provides camera preview/one-shot capture and photo review before explicit evidence upload. The historical implementation snapshot below predates that work. Repeated sampled-frame inference, evaluated model integration and stage/session result linkage remain unfinished core requirements.

The current priority is parcel-condition work. Uploaded parcel photographs and live analysis of sampled camera frames are both unfinished core scope in Choong Wai Kin's original report. Live camera analysis must not be classified as an additional feature or treated as completed by the existing image-upload workflow. Inventory-risk and delivery-risk development are deferred under the latest user direction; their existing plans, results and confirmation reservations remain preserved.

## Report evidence and interpretation

Source: [original Choong portfolio](https://drive.google.com/file/d/1XkAGX38tNdql7vEIQI8uVxleqYi3eJGc/view), also retained at `../../fyp-cwk-2/resources/sources/project-1-2026-10-07/Project 1 Portfolio Choong Wai Kin (10).docx`. The local source SHA-256 was rechecked as `84b297547635d6cc2993de3547c696321baaefee5a0b6a1d5a7fae1a6658de6f`. The following section and figure references were checked against the source text; they are report commitments, not evidence of working software.

| Source location | Report scope | Consequence for the roadmap |
|---|---|---|
| FR-7 | Authorised pre-dispatch parcel images, delivery-stage parcel images and proof of delivery, linked to shipment, stage, uploader, time and storage reference | Complete stage-aware photo evidence and clear upload failure handling |
| FR-10 | Authorised image validation and OpenCV preparation; TensorFlow/Keras MobileNetV2 as primary, EfficientNet-B0 comparison; Normal/Damaged output with confidence | Evaluate the specified classifiers and integrate traceable photo analysis |
| FR-11 | Stored result, processing time, model/rule reference and supporting information; low-confidence results require authorised review | Preserve human review and traceability for both acquisition paths |
| Section 3.4.5 and Figure 3.9 | Delivery monitoring ingests webcam video frames in real time and applies parcel-condition classification | Camera-frame analysis is a core workflow |
| Figure 4.10 | Vehicle webcams send sampled parcel frames within an ongoing monitoring loop | Implement and evaluate repeated frame sampling, not just manual file analysis |
| Figures 4.13 and 4.14 | Vehicle webcam deployment and OpenCV frame preprocessing in the architecture | Connect the capture device and vision service through an explicit implementation contract |
| Figure 4.23 | Parcel-inspection UI analyses camera-sampled imagery and shows condition/confidence | Present current frame results and review evidence clearly |

The report establishes live sampled-frame analysis without fixing a frame rate, latency threshold, browser capture mechanism, queue policy or unattended background guarantee. Those engineering choices need a later reviewed implementation and acceptance protocol. This correction does not broaden the existing explicit latest-submitted-location GPS implementation into continuous GPS tracking.

## Current implementation and data limits

`src/features/operations/EvidenceUpload.tsx` provides a file picker and upload action. `src/features/operations/ResearchVerification.tsx` exposes a manual Request analysis action for a selected record. `research/vision.py` contains the MobileNetV2/EfficientNetB0 experiment scaffold and single-image `predict_image` function. These establish partial infrastructure; they do not establish a validated primary model, full staged photo acceptance, live camera capture, an ongoing frame loop or measured live-session performance. No camera-stream implementation was found in the inspected application/research source.

The existing 440-image Parcel3D pool is synthetic. Its 133 proposed family groups, condition proposals and quarantine recommendations remain subject to human approval. Publisher labels and assistant inspection do not replace approved ground truth. Synthetic rendering results would not establish performance on real photographed parcels, motion, changing illumination, occlusion or vehicle-camera sessions.

Real photographed Normal/Damaged examples need source/licence review, visible-condition adjudication and parcel/session provenance. A public image collection without both suitable classes or enough grouping information may be useful for a limited purpose but cannot silently become the final independent evaluation set. Uncertain visibility should remain unresolved or quarantined under the reviewed protocol, rather than being forced into Normal.

The completed bounded [real-source audit](../research/PARCEL_REAL_SOURCE_AUDIT_2026-10-20.md) accepts no new real dataset images: access/terms and label/group provenance remain unresolved. The [label audit](../research/PARCEL_LABEL_AUDIT_2026-10-20.md) verifies 440 original image hashes and reviews 33 difficult originals without approving any labels or families. The [combined human review packet](../research/datasets/parcel-human-review-20261020/review.html) contains all originals and blank decision templates. These audits do not constitute label approval, training acceptance or a model result.

## Ordered parcel work

1. Audit real parcel sources for provenance, licence, class coverage, image quality and physical-parcel/session identity. Document the synthetic-to-real gap and the separate purpose of each source before adoption.
2. Obtain actual human condition/visibility decisions and approve family/parcel/session grouping. Keep unresolved cases quarantined, freeze an evaluation protocol and construct train/validation/test partitions with all related observations together.
3. Evaluate MobileNetV2 against EfficientNetB0 on approved image data with a fixed development budget, train-only augmentation/preprocessing decisions, frozen model selection and held-out confusion matrices, accuracy, per-class precision/recall/F1 and error analysis. Report real and synthetic domains separately; image-count minima are software gates, not adequacy evidence.
4. Complete photo integration: authorised stage-aware upload, traceable evidence/model/result linkage, unavailable/failed analysis states, confidence and human review. Verify the full photo workflow before claiming photo completion.
5. Implement live camera capture and repeated sampled-frame analysis through the same evaluated image pipeline. Define permission/start/stop behaviour, shipment/session identity, timestamp/frame linkage, interruption recovery and bounded resource handling before implementation.
6. Evaluate live sessions for both classification quality and end-to-end latency on the intended hardware/network. Measure session/parcel-level outcomes as well as frame metrics, visibility failures, stale/dropped work, interruptions and recovery. Record actual throughput and resource use before setting or claiming a supported rate.

Every frame from the same recording/session and every view of the same physical parcel must remain in one split; use the connected grouping when sessions contain multiple parcels or a parcel appears across sessions. Synthetic asset-family constraints must also be preserved. Adjacent video frames are correlated observations, not independent test examples. Deduplicate related photos, derived crops and sampled frames before splitting; fit preprocessing/augmentation choices using training/development data only. Define session aggregation before examining held-out results.

## Proposed future acceptance checks

These checks describe work still to implement and validate. They are not current guarantees or report-specified numeric targets.

- Only authorised users can bind captures/results to the correct shipment and stage. Camera permission denial, unavailable devices and user stop actions are explicit; capture resources are released on stop/navigation.
- Sampling and inference have a bounded queue or in-flight limit. Backpressure and a documented drop-stale policy prevent obsolete results from being displayed as current. Capture time, processing time, result age and session/frame identity remain distinguishable.
- Interrupted sessions, failed network requests, duplicate responses, late results and unavailable models produce recoverable states. Failed or unobservable frames do not imply a Normal parcel.
- CPU/RAM, network traffic, inference timing and sustained-session behaviour are measured on the intended environment. Any sampling rate, acceptable result age and resource limits are fixed in a later protocol and then tested.
- Human review remains required for low-confidence or flagged results; predictions do not automatically establish damage responsibility, fraud or compensation. Evidence retention and authorised access follow the existing shared-system contracts.

Existing Admin selection, record IDs/balances, shared staff approval, Prepared-Shipment Handover and navy/purple eight-card dashboard remain authoritative. No automatic personal-inventory merge is authorised. The frozen Olist work and unscored confirmation remain reserved; the proposed joint-confirmation amendment is still unaccepted. FreshRetailNet's resource gate and older tabular plans remain intact while parcel work takes priority.

This correction changes documentation only. It authorises no model fitting, label approval, data modification, application activation, production operation or publication by itself.
