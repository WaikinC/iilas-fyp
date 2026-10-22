# Disputed parcel label recommendations — 20 October 2026

This pass produces concrete condition and family-handling recommendations for the 33 disputed Parcel3D images. It does not record human approval or start training. Inventory-risk, delivery-risk and additional features remain deferred. Photo and live sampled-camera-frame analysis remain unfinished core parcel scope.

## Recommended decisions

Two fresh agents inspected 17 and 16 native originals respectively, withholding the prior per-image condition proposals before their first assessments. A separate agent investigated family provenance. Root compared the fresh assessments against the earlier review, viewed all nine condition-disagreement originals, and inspected three further ambiguous originals plus seven same-root companion views. All images were viewed unchanged at native resolution; no crops, relighting or generated substitutes were used.

| Recommended handling | Images | Meaning |
|---|---:|---|
| Candidate condition label | 9 | Seven Damaged and two Normal proposals supported sufficiently for human adjudication; not final ground truth |
| Exclude for inadequate visibility | 13 | Recommend keeping these out of the primary visible-condition benchmark while retaining the original files and an exclusion/challenge log |
| Hold ambiguous condition or eligibility | 11 | Ordinary construction, source geometry, parcel eligibility, lighting or framing prevents a settled binary recommendation |

The [focused decision sheet](datasets/parcel-disputed-resolution-20261020/DECISION_SHEET.md) and [original-image page](datasets/parcel-disputed-resolution-20261020/review.html) list each case, visible evidence, prior/fresh proposals, root reasoning, family hold and the specific unresolved question. [Human decisions](datasets/parcel-disputed-resolution-20261020/human-decisions.csv) are blank. These are static documents, with no automatic save, acceptance or model export.

Fresh reviewers agreed with the earlier condition proposal on 24 images and differed on nine. This is a deliberately difficult, previously selected subset; the fraction is neither model accuracy nor representative annotator agreement. Root had source/prior-label exposure. The exercise is not a fully blinded study, and agreement between assistants is not independent human ground truth.

Root recommends two visible-surface Normal candidates after distinguishing regular closure details from definite damage. Their dark or hidden faces remain unassessed. Seven Damaged candidates rely on visible compression, buckling or panel deformation, including one dark image where gross deformation is visible despite concealed fine detail. Other previously proposed Damaged cases remain on hold because wrapper folds or designed curvature could explain their appearance. All dissenting opinions remain in the packet rather than being overwritten.

## How to complete the decisions

1. Review the nine label candidates using the unchanged originals and the recorded reasons. Record your own condition, visibility, disposition, reason, reviewer and date. A package's visible surfaces can be Normal without certifying unseen faces or internal contents; a dark region must not be treated as evidence of no damage.
2. Review the thirteen proposed visibility exclusions. Retain excluded files and reasons. If a case becomes assessable through legitimate additional evidence, document that evidence and revisit the decision rather than silently replacing the original.
3. Keep the eleven ambiguity cases unresolved until their specific question is answered. Companion renderings share source provenance but are not automatically intact references; a publisher Normal flag does not independently settle condition. Do not manufacture a binary label to balance classes.
4. Decide the family-handling policy separately, then approve the actual family/group records. No image can enter a partition merely because its condition proposal looks clear.

The existing [intake workflow](DATA_COLLECTION.md) requires actual reviewed observations and explicit protocol/group decisions before split preparation. Human fields, accepted `label`, `approved_family_id` and `split` remain blank. All 33 inherited quarantines remain in force; the recommendations have not cleared them.

Excluding poor observations narrows the evaluation population. It must not be presented as improved operational accuracy. Report exclusion rates and reasons, retain low-light/occluded cases for later rejection/challenge evaluation, and evaluate live sessions separately. None of these synthetic decisions establishes real photographed-parcel or camera-session performance.

## Family decision and limits

The [family evidence review](PARCEL_DISPUTED_FAMILIES_2026-10-20.md) maps all 33 disputed images to 28 roots and 27 current groups. It verifies all 440 configuration-root references and preserves all 133 existing proposed groups. Archive size/CRC32 metadata adds provenance context but cannot prove cross-root independence; local mesh payloads were unavailable in the inspected source folders.

The recommended conservative option is a temporary family hold covering 147 images, 48 roots and 45 current groups across eight unresolved broader case sets. Together with the 33 existing condition quarantines, five of which overlap, this would hold 175 images and leave 265 still-unapproved candidates. None of the nine current condition-label candidates matches these eight family holds, but their families still need approval and the case list is not exhaustive.

The quantified alternative is an explicitly optional co-location scenario: keep every suspected case set in one partition using connected closure, yielding 96 blocks across all 440 images. It deliberately over-groups some categories, sacrifices nominal independent units and may still miss relationships between blocks. It is not an adopted family map or an accepted split. Neither option fabricates common ancestry.

## Verification boundary

Per-image evidence, recommendations, blank decisions, acquisition metadata and review helpers remain in Git-ignored local directories. Original images, earlier reviews and source/group artifacts remain immutable. Root verifies input hashes, coverage, group preservation, blank approvals, all packet links and Git exclusion; the family verifier separately reconstructs the optional closure with BFS.

This is data adjudication assistance and documentation, not a change to application logic or model execution. Existing app build/lint/Firebase and training suites are not substitutes for label review and are not rerun without related code changes. Local file-URL browser preview was previously blocked by browser policy; this pass uses disk-level link/HTML checks and makes no browser-rendering claim.

Fresh root verification passes: all 4,079 baseline files (1,233,348,704 bytes) remain hash-identical; all 33 original image/hash bindings, recommendation counts, blank approvals, inherited groups and packet links pass. All 23 new dataset artifacts are ignored, with zero tracked dataset files. An independent integration review found no actionable issues and reconstructed the 96 optional blocks. The reviewer authored one fresh-assessment subset; this is independent checking of integration/family calculations, not independent human annotation.

Evidence is in ignored `outputs/parcel-disputed-review-20261020/`, including `final-verification.json`, `independent-review.json` and the preserved inputs/overrides. The original family verifier writes its first evidence file once; a direct rerun correctly refused to overwrite it. `verify-family-readonly.py` replays its sealed checks without replacing that evidence. Reproducibility helpers remain local research artifacts, not application changes.
