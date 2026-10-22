# Real-parcel review preparation — 20 October 2026

## Decision

Prepare a small **review-only TAMPAR panel** of twelve original photographs: paired base/scene views for six publisher parcel-ID tokens. This is a useful next step for assessing assembled-parcel relevance, visible condition and repeated views. It is not an approved damage benchmark, training set or live-camera test. No new PackageDamage inference or threshold tuning belongs to this step.

The existing PackageDamage diagnostic remains frozen. Its three matches, one disagreement and two abstentions on six human binary choices do not establish application accuracy. Keep the report-backed MobileNetV2/EfficientNetB0 comparison; other AI modules and additional features remain deferred.

## Sources checked

| Source | Verified finding | Decision |
|---|---|---|
| [CS494 conveyor candidate](https://huggingface.co/datasets/Aagam01/cs494-conveyor-damage) | Anonymous dataset API and README requests returned HTTP 401. The [creator](https://github.com/itsJvmes/Edge-Based-Damaged-Box-Detection/blob/de73e1ff5727f11ae3276671a0efb037830b2f15/README.md) describes 20,107 camera frames labelled by Qwen2.5-VL, not independent human ground truth. Public image access, image licence and physical-parcel/session identities could not be verified. | Do not acquire from an unverified mirror or treat the frame count as independent parcels. Access status does not distinguish private, removed, renamed or gated. |
| [TAMPAR, record 10057090](https://zenodo.org/records/10057090) | CC BY 4.0 is stated both by the record and the archive README. Real assembled parcels, repeat views and source ID tokens. Its research target is appearance tampering relative to a reference. | Bounded local human-review panel only. Do not convert tampering into physical damage. |
| [Package Damage Recognition (AIDL), v1](https://universe.roboflow.com/onkars-workspace-ae34o/package-damage-recognition-aidl/dataset/1) | Public page lists 229 original images and a 355-image version with augmentation. Original provenance, physical identities and overlap with PackageDamage training remain unverified. | Metadata lead only; no acquisition or endorsement. Augmented counts are not independent parcels. |

TAMPAR attribution: Alexander Naumann, Felix Hertlein, Laura Dörr and Kai Furmans, “TAMPAR: Visual Tampering Detection for Parcel Logistics in Postal Supply Chains,” WACV 2024. [Project](https://a-nau.github.io/tampar/), [paper](https://arxiv.org/abs/2311.03124), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Acquired JPEG bytes are unchanged; locally assigned review IDs are additions.

## Actual archive findings

The published ZIP is 6,407,977,888 bytes. Bounded HTTP byte ranges retrieve the directory, three metadata files and the selected originals without downloading the whole archive. Verify each acquired entry against the ZIP directory's CRC32, record SHA-256 and decode every image. CRC32 checks transfer integrity; it is not a cryptographic provenance guarantee. The full archive MD5 is **not verified**, and this is not a complete dataset audit.

The directory contains 2,777 entries, including unlabelled originals and derived UV maps. The two downloaded COCO annotation files contain **247 validation images and 485 test images**, with publisher ID tokens 00–09 and 10–29 respectively. All 732 annotations use category 0, despite the vocabulary declaring both “normal box” and “damaged box.” Neither the vocabulary nor category 0 establishes IILAS physical-condition truth. Preserve this finding rather than filling absent damage labels or reconciling paper counts by assumption.

## Fixed selection and review

Selection is recorded before image acquisition in ignored `research/datasets/real-parcel-readiness-20261020/selection-plan.json`. Rank eligible source IDs using SHA-256 with the declared fixed prefix and record ID; choose three from each publisher partition. Within each ID, select one annotated base image and one annotated non-base image by the same deterministic path ranking. No source condition, model output or visual impression is used for selection, and difficult examples are not replaced.

The six publisher tokens are 04, 01, 05, 25, 17 and 10. They define **provisional within-source dependency groups**, not six certified independent IILAS evaluation parcels. Source partitions are provenance, not adopted training/test splits. Image IDs restart in each annotation file and must never be used as global parcel identities.

All twelve originals were acquired (53,066,037 bytes), CRC/SHA-256 checked and decoded at 4032 × 3024. No exact encoded or decoded duplicate sets occur within this panel. This does not imply independence: each parcel deliberately appears twice. The six non-base scenes cover table, carpet and stairs, two each; gravel, cobblestone and floor are absent from this selection. The independent agent reproduced all twelve selected paths from the frozen ranking.

Assistant screening inspected every original. All show assembled box-shaped packages; T07/T08 are gift-wrapped, obscuring the cardboard beneath, and T06 includes a partial background box in addition to its principal target. Large identification markers, shipping labels and tape introduce another difference from unrestricted IILAS camera inputs. Regular construction openings appear in T09/T10. Some images show edge wear requiring actual human judgement. No condition or family approval was entered from these observations.

The local review packet uses neutral T01–T12 identifiers and unchanged originals. Human decisions remain blank. For each image record:

1. Relevance: assembled shipping parcel, retail packaging, non-parcel or uncertain.
2. Visibility: adequate for the visible target, partial/occluded, blurred/dark or insufficient.
3. Visible condition: Normal, Damaged or Uncertain, plus a short description of evidence and its location. Uncertain is a review state, not a third trained class.
4. Target association: identify the parcel being judged; multiple targets require a separate target record before scoring.
5. Family review: inspect paired views for supporting identity evidence; keep conflicting/uncertain identities on hold.

Use actual crushing, tearing, puncture or structural deformation as physical damage evidence. Ordinary tape, labels, printing, deliberate construction slots and an opened flap alone do not establish damage. A Normal decision applies only to adequately visible packaging; it cannot certify unseen faces or contents. Different views or different times of the same box can legitimately receive different visible-condition decisions and must remain grouped.

Publisher labels and detector outputs are excluded from the review sheet. Source metadata remains available for auditing, so do not describe the study as fully blinded. Assistant observations cannot fill human fields or approve training eligibility.

## Completion gates and next implementation

After human review, retain exclusions and uncertain cases, bind accepted decisions to original hashes, and complete the family policy. Establish whether both physical-condition classes are present before considering a damage benchmark. With no damaged cases, a limited normal-view diagnostic cannot estimate damaged-parcel recall, balanced accuracy or full classifier performance.

Before any independent benchmark, audit source overlap with PackageDamage's stated Roboflow training collections and derivatives. A different source name or absence of exact duplicate files does not prove independence. Freeze the eligible cohort, target-association method and scoring/abstention policy before another model run; keep development decisions separate from later evaluation.

Remaining core work: suitable reviewed damaged-parcel examples, sufficient distinct parcels, report-backed bounded CNN runner and comparison, photo-result integration, then separately validated live sampled-camera and multi-view session analysis. Public stills support initial view testing but do not establish live motion, latency, coverage, camera generalisation or six-face completeness. No new capture is requested in this public-data-only step; if public data cannot fill these gaps, a later consented IILAS capture study will be necessary.

All originals, source metadata, human-review templates and acquisition helpers stay ignored locally. No app model, dependency manifest, production data or existing human decision is changed.
