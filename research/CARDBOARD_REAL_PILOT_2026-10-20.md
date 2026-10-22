# Cardboard source audit: excluded from primary parcel cohort — 20 October 2026

The user authorised selecting a suitable source and proceeding. **Do not select Gabriel8 / Cardboard Box Anomaly Detection as the primary IILAS parcel dataset.** The completed visual screen supersedes the preliminary metadata-only recommendation: its representative images show flat, unassembled cardboard blanks, not closed shipping parcels. Preserve this acquisition as off-target research evidence. No row is approved for training. Retain Parcel3D separately and preserve all human decisions.

## Source and permitted scope

- Creator: Gabriel8; the source acknowledges collection/preparation support from Ondupress Embalagens.
- Source: <https://huggingface.co/datasets/Gabriel8/cardboard-box-anomaly-detection>
- Pinned revision: `a1c01d16c4131ba049d3adace44b870495c25dd3`.
- Source declares CC BY-NC-SA 4.0. Preserve its credit and notices, link the licence, and identify modifications. Use here is local noncommercial FYP research. No dataset redistribution or commercial deployment is included. Licence text: <https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en>.
- Originals, source card, hashes, review tables and visual review aids remain under ignored `research/datasets/cardboard-real-20261020/`. No credentials or account-gated download were needed.

The source offers identifiable cardboard objects and real phone photography, but these advantages do not resolve its subject mismatch. Root inspected 86 deterministic thumbnail representatives spanning all 43 source IDs and two larger originals; the independent reviewer inspected 24 representatives plus two originals. This is sufficient to reject it as the primary cohort, but is not a native-resolution review of all 553 photographs or a new condition annotation.

## Verified acquisition and metadata

Downloaded all 555 source files, including 553 JPEG photographs and two documentation/configuration files: **2,042,885,721 bytes**. Each file matches its pinned publisher LFS SHA-256 or Git blob hash; a local SHA-256 manifest is retained.

| Item | Actual source evidence |
|---|---|
| Source image classes | 167 `good`, 386 `bad` |
| Box identifiers | 43: 14 entirely source-good, 29 entirely source-bad |
| Card discrepancy | Card says 13 normal / 30 anomalous boxes; preserve actual file labels and the discrepancy |
| Original split | One good train image; 552 test images |
| Box overlap in original split | Box15 has the one train image and 13 test images |
| Cameras | Every box appears under both cam1 and cam2 |
| Locations | Floor (`chao`) and conveyor settings (`b1`, `b2`) |
| Position coverage | Source values 01–04, plus one position00 image of box11; not six named faces |
| Observations per box | 4–22 photographs; they are correlated views, not independent parcels |

The supplied split is for a one-class anomaly task, not our proposed unseen-box supervised evaluation. Preserve it as source metadata. Do not describe it as an error in that different research task, and do not reuse it as an independent-box split for IILAS.

Location coverage is uneven. `b2` has only four boxes: bad29/bad30 and good32/good33; the latter appear only there. Five bad boxes appear only in b1. This can create background shortcuts, though metadata alone does not show that a model uses them. All environments contain both source classes. Three disjoint partitions cannot each contain both b2 classes when only two boxes per class exist there.

## Label preparation

Keep `source_label` separate from `reviewed_image_condition`. The card describes good/bad boxes without a detailed visible-damage adjudication procedure. A side of a bad box may hide its damage. Likewise, unfinished flaps, printing, normal folds and manufacturing construction must not become damage merely because they look irregular.

Review images for a relevant box, sufficient visibility and actual evidence of tear, puncture, crush or deformation under the saved IILAS labelling rules. Record Normal only for sufficiently observable packaging without visible damage. Record uncertain visibility or ambiguous construction as a review hold, not a third model class. Preserve disagreements and source labels. Image decisions and family decisions are separate.

All 43 source box identities define mandatory grouping constraints across cameras, positions, versions and locations. Any additional duplicate or related-box evidence can enlarge these groups. Do not split by filename, photograph count or source folders. Position/version values are not reliable timestamps or semantic face labels.

## Implementation boundary

No split, training or inference integration should proceed with this source as the primary parcel cohort. The current candidate decision and implementation sequence are in [PARCEL_SOURCE_DECISION_2026-10-20.md](PARCEL_SOURCE_DECISION_2026-10-20.md).

## Existing scaffold boundaries

Do not invoke `research/vision.py` CLI directly for this intake. Its current training function defaults to the active inference model directory and evaluates test data during the training invocation. It lacks review/hash acceptance, a separately sealed confirmation phase, the planned fine-tuning stage and a resource supervisor. Its five-image-per-class gate does not establish independent-box sufficiency.

Inference currently reloads the model per image and uses a different decoding/resize route from training. Verify preprocessing parity, model-file/hash consistency and confidence/review behaviour before repeated camera use. Softmax output alone is not a demonstrated calibrated probability of damage.

The completed intake decoded all 553 images, found no exact encoded/decoded duplicate sets, and flagged one cross-box perceptual similarity pair for review (box06/box07; not proof of shared identity). Hashes, screen index, blank review tables and the separate visual exclusion decision are local audit evidence. This task does not fit or activate a model, create final partitions, change Firebase/production data, or implement camera capture. Inventory/delivery model development and additional features remain deferred.
