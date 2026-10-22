# Kaputt publisher-label benchmark decision — 20 October 2026

The user instructed: “continue on what publisher label as i cant really see the image clearly”. For the Kaputt research benchmark, use the publisher's annotations without requiring further human condition review. This supersedes the manual-adjudication prerequisite in the earlier sample audit, including the K04/K11 disagreement holds. It does not change the separate TAMPAR or Parcel3D decisions.

## Follow-through completed

The [real publisher-labelled development pilot](KAPUTT_PUBLISHER_PILOT_2026-10-20.md) now has an explicit provenance profile, verified pretrained checkpoints, a frozen 25/6/5 split, four completed fits and a separate once-only internal test. This supersedes pending implementation/training statements later in this original decision record. Both models missed the one Damaged test example; no operational readiness is established. More independent damaged examples and untouched holdout photos are next. Serving rejects these development-only artifacts and prior human journals remain unchanged.

## Accepted label source

Map publisher `defect=false` to **Normal** and `defect=true` to **Damaged** for this benchmark. Retain severity and defect types as source metadata. The task is explicitly **Kaputt cardboard packaging defects**: the broader source definition includes retail packaging and defects that may differ from visible shipping-box damage.

The local manifest includes all 36 sample cardboard queries: **25 Normal, 11 Damaged**, including three major-defect examples, across 36 publisher item IDs. No condition-based visual exclusion was made. K04 and K11 use publisher Damaged for this benchmark; the user's earlier Normal responses remain unchanged in the human journal and are explicitly flagged as disagreements. This is a choice of benchmark truth, not a claim that reviewers agreed.

## Local evidence and grouping

The ignored `research/datasets/kaputt-intake-20261020/` contains:

- `publisher-label-policy-01.json`: exact instruction, mapping, purpose and source hashes.
- `publisher-benchmark-manifest-01.json`: labels, source item groups, original/crop hashes and earlier human responses.
- `publisher-label-verification-01.json`: 36 rows checked against the original sample and full TRAIN Parquet; all 1,190 pre-existing intake files unchanged.

Use one publisher query crop per capture. Keep the original for evidence; do not count the original, crop and mask as separate examples. Do not use masks as classifier inputs or assume unlabelled reference images are Normal. Keep every capture/derivative/reference sharing a publisher item ID in one partition. These IDs are conservative source groups, not confirmed physical-box/session identities.

## Next experiment

1. Add an explicit publisher-packaging benchmark profile to the cohort loader, then prepare a bounded MobileNetV2 development pilot with shared preprocessing, resource supervision and a recorded random seed. The current loader requires reviewed-label/confirmed-group/single-principal declarations; this intake manifest intentionally does not fabricate them. Preserve the existing human-reviewed parcel profile, distinguish publisher item grouping from physical-box identity, and test both admission paths before freezing. Preserve EfficientNetB0 as the report comparator and PackageDamage as the frozen external reference.
2. Freeze the group partition and selection rule before fitting; report class/group counts, per-class precision/recall/F1, macro-F1, confusion matrix and abstention coverage. Do not duplicate or augment samples across partitions.
3. Treat this small sample as development evidence only. All 36 queries originate in the publisher TRAIN split and have already been screened. An internal pilot holdout is not the publisher's held-out test or a final independent IILAS evaluation.
4. Obtain a suitably bounded official validation/test image cohort before final source-benchmark evaluation. Existing full metadata alone is not image availability. Actual IILAS photo/camera validation remains separate because target packaging, framing and lighting can differ.

The label decision is complete; no training run or frozen split is claimed here. Pretrained checkpoint verification, experiment freeze, real fitting and evaluation remain next. Dataset use stays within the preserved full educational/scientific-research terms; no data or model publication, application activation or production change is authorised by this policy.

Independent read-only review reproduced the 36 labels/groups and all 72 original/crop hashes, confirmed both human disagreements and verified Git exclusion. The existing secret scan passed and `git diff --check` reported no whitespace errors. These checks establish manifest integrity, not model accuracy.
