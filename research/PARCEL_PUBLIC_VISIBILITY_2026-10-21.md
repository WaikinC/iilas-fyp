# Public parcel TRAIN visibility audit — 21 October 2026

Status: the separately frozen, qualified 31-view follow-up and two blinded assistant reviews are complete. Both reviews were validated and hash-locked before joining publisher labels. The original balanced 32-view intake remains failed, with its one technical exclusion retained in every denominator. No training, inference, label change or new model accuracy result occurred.

The purpose is to investigate whether public training views can support the report's **visible parcel-condition** task before another model experiment. It does not replace the completed [internal comparison](KAPUTT_INTERNAL_EVALUATION_2026-10-21.md), establish human ground truth, or satisfy the [80% objective](PARCEL_ACCURACY_TARGET_2026-10-21.md).

## Selection and technical findings

The settings were frozen before new metadata selection or image access. Exact publisher TRAIN metadata, licence, existing archive, earlier selection/exclusion sources, rubric, code and resource bounds are hash-bound. All 600 earlier proposal item IDs and all 100 earlier sample item IDs were excluded, including previously unseen sibling captures of those items. No official validation/test images are selected.

Fixed hash ranking selected eight Normal-only source groups, eight Damaged-only groups and eight mixed groups. Single-class groups contribute one view; mixed groups contribute one per publisher class: **32 views, 24 source-item groups, 16 Normal and 16 Damaged publisher labels**. These are deliberate diagnostic quotas. Source-item IDs do not establish different physical cartons or recording sessions, and the sample cannot estimate population label noise or field accuracy.

| Actual stage | Outcome | Resource evidence |
| --- | --- | --- |
| Original metadata preparation | Failed before selection: Windows/Pandas requested a local hostname, which the offline guard blocked | 2.07 seconds; 64.70 MiB peak; terminal exit 1 |
| Repaired metadata preparation | Completed; exact original quotas and 700 whole-item exclusions retained | 4.09 seconds; 272.86 MiB peak; terminal exit 0 |
| Original 32-view extraction | Failed the unchanged JPEG dimension bound; no successful receipt or image admission | 81.02 seconds; 118.05 MiB peak; terminal exit 1 |
| Complete header-only diagnosis | All 32 retained files checked without pixel decoding; one 17 × 17 crop fails the minimum 64-pixel side | 2.07 seconds; 54.89 MiB peak; terminal exit 0 |
| Separate qualified follow-up intake | Full archive identity/hash/31,564,000,506 bytes and exact 100,267-member inventory verified; all 31 retained images decoded and admitted for qualitative review only | 85.08 seconds; 116.00 MiB peak; terminal exit 0 |

Exactly one source group is affected, and it contributes only that one selected view. There are no propagated sibling exclusions in this selection. The separate follow-up subsequently verifies strict decoding for the other 31; this does **not** establish semantic suitability or independence. The single failure is a sample finding, not an estimated corpus failure rate.

The guard repair permits only the exact local `socket.gethostname` event. Socket creation, address resolution and other socket events remain blocked. Seven helper fixtures pass, including a fresh-process Windows regression; the header diagnostic's three boundary fixtures pass. Independent source reviews cover both changes. Original failed roots, protocols, logs and selected files remain preserved locally and ignored.

## Separately declared follow-up

The original balanced 32-view audit cannot be called successful. An independently reviewed policy permits a **post-failure amendment** for a separately named qualitative follow-up: retain the original selection and case IDs, mechanically exclude every source group touching a fixed technical failure, make no replacements, and preserve all 32 views/24 groups in the reported sampling denominator. The resulting 31-view/23-group subset must not be called the original balanced audit.

Before review, the follow-up bound the original selection, failed intake, complete header diagnosis, exact survivors and its new protocol. Its one supervised intake completed the complete-archive, exact-allowlist, unchanged image-limit/decode and native resource checks. The parent independently rehashed all 31 admitted image files and confirmed zero remaining workers. V20 remains explicitly technically unreviewed; no replacement restored the original quotas. This separate success does not change the original failed audit's status.

Two assistants independently inspected all 31 original admitted views with publisher labels, strata, group relationships, model scores and each other's notes withheld. Each also recorded V20 as technically unreviewed, preserving 32 records. The parent validated exact IDs, all image hashes, required fields and localized evidence for positive judgments, then exclusively hash-locked both JSON/Markdown pairs before opening the private publisher key. Reviewer A's interrupted final-check turn resumed with own-file validation only; no observations changed. Visible-condition observations remain separate from immutable publisher labels.

## Locked descriptive findings

| Observation | Reviewer A | Reviewer B |
| --- | ---: | ---: |
| Shown surfaces judged Normal | 13 | 16 |
| Localized visible damage judged Damaged | 8 | 6 |
| Uncertain visible condition | 10 | 9 |
| Technical, not reviewed | 1 | 1 |
| Retail/product-carton appearance, among 31 reviewed | 21 | 22 |
| Outer shipping-carton appearance, among 31 reviewed | 5 | 4 |
| Mixed/both appearance | 2 | 1 |
| Unclear appearance | 3 | 4 |

Both reviewers completed all 31 admitted cases and agreed on visible condition in **26 cases**: 13 Normal, six Damaged and seven Uncertain. Five judgments differ: three Normal/Uncertain and two Damaged/Uncertain. Their explanations concern closure construction, edge detail, glare and whether a localized physical break can confidently be distinguished. There are no direct Normal/Damaged disagreements in these two passes. This is agreement between assistant observations, **not model accuracy, independent human validation or evidence that the 80% target has been met**.

After technical attrition, publisher labels are **16 Normal and 15 Damaged** across 23 source groups. The excluded 17 × 17 view is publisher-Damaged, leaving eight Normal-only, seven Damaged-only and eight mixed source groups. The mixed stratum contributes 16 reviewed views; each single-class group contributes one. The original 32-view/24-group sampling denominator remains visible.

| Publisher label / reviewed views | A: Normal | A: Damaged | A: Uncertain | B: Normal | B: Damaged | B: Uncertain |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal / 16 | 10 | 1 | 5 | 12 | 1 | 3 |
| Damaged / 15 | 3 | 7 | 5 | 4 | 5 | 6 |

Among the 15 reviewed publisher-Damaged views, both assistants judged five visibly Damaged, three Normal on shown surfaces and four Uncertain; their judgments differ on the other three. One publisher-Normal view is judged Damaged by both. These comparisons do not establish label errors: the publisher may describe a whole item, another surface or a different defect definition, and assistants may be mistaken. Do not replace publisher truth with these observations or estimate a population mislabelling rate, noise ceiling or model-performance limit from them.

Within the deliberately oversampled eight mixed source items, A judges both opposite-publisher-label views Normal in one item, and B does so in two. Source-item identity still does not prove the same physical carton or independent capture sessions. This finding motivates checking label scope and shown-face visibility; it is not an instruction to force complementary labels.

## Consequence for the next model step

This broader diagnostic strengthens the case for checking **input/label fit before another model recipe**: most reviewed views look like retail/product cartons, uncertainty is common, and some item-level source labels are not clearly supported by the shown surfaces. It does not prove the sole cause of the weak classifier results. A different backbone, higher resolution or more training cannot be assumed to resolve these gaps, although a separately tested model change may still help.

1. Preserve Kaputt as a publisher-labelled research benchmark with its documented limits. Keep this exposed diagnostic out of untouched final evaluation; do not create an apparently successful benchmark by retaining only assistant/publisher agreements.
2. Qualify public shipping-parcel sources for shown-face labels, licensing, adequate image area, real physical-box/session grouping and both conditions. The two explicitly licensed public-photo leads in the local feasibility note are candidates for a small provenance/relevance review, not an adequate training or final evaluation set. Existing dataset-access/licence/group holds remain in force.
3. Once a suitable development collection exists, prospectively freeze one expanded-data MobileNetV2 baseline using TRAIN/VAL only. Preserve the report's EfficientNetB0 comparison and balanced macro-F1 development selection. Any later fine-tuning or specialised pretrained comparator needs its own bounded proposal and licence/input/overlap checks. No such new experiment has been executed or selected.
4. Judge the final fixed choice once on fresh relevant groups, reporting the 80% accuracy objective alongside damage precision, recall, macro F1, coverage and uncertainty. The consumed 122-image internal test stays consumed. Actual photo/live camera performance remains a separate incomplete requirement.

The complete per-case judgments, source associations, lock and descriptive arithmetic are local and ignored under `outputs/parcel-public-visibility-20261021`. The descriptive analysis writes no model prediction or training label. An independent implementation recomputed all 32 associations, review/key hashes, crosstabs, source-group/stratum and mixed-group totals, and checked native/report bindings without opening images or models; it found no arithmetic discrepancy. Its source review read an earlier documentation snapshot; the completed counts above supersede that pending status. Expanded credential checks cover 368 tracked/nonignored files, and no dataset/model/output is tracked. No application runtime code changed in this step.

All detailed metadata, images, keys and diagnostic artifacts remain local and ignored. Public-only data remains in force. Both operational model gates remain closed. Photo/live model quality and actual camera evaluation remain incomplete; other AI modules, additional features, production and deployment remain deferred.
