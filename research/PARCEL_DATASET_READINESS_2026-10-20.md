# What the current parcel data can support — 20 October 2026

The existing Parcel3D subset is a potentially useful source for a small exploratory synthetic-image experiment after condition and grouping decisions are completed. It has not demonstrated model accuracy on real parcel photographs or live camera sessions. No model has been trained or activated by the review work.

## Provisional experiment size

Root and a separate agent recalculated the saved proposed family/condition holds without changing any records or assigning a partition.

| Candidate scenario | Normal proposals | Damaged proposals | Images | Nominal groups |
|---|---:|---:|---:|---:|
| After the proposed eight-case family hold and existing 33 condition quarantines | 125 | 140 | 265 | 88 |
| If all nine condition candidates were later accepted, with the same family policy | 127 | 147 | 274 | 88 |

The second row is hypothetical, not permission to release quarantines. Both rows use prior assistant condition proposals for the broader collection. Human decisions on selected images do not validate all other rows. In the first row, 68 groups have examples of both classes, ten have only Normal proposals and ten only Damaged. Each class occurs in 78 groups. Neither those groups nor the optional 96-block alternative have proven full independence.

Subsequent human responses do not accept the all-nine scenario: P21 and P27 were judged Normal, and P17 received a "no parcel box" relevance objection instead of a condition label. Preserve that hypothetical calculation as historical context only. P17's original matches its recorded DVD retail asset; a retail package cannot automatically stand in for a shipping parcel. Target relevance needs checking across the broader collection before a pilot cohort is accepted.

At approximately 70/15/15 by group, 88 nominal groups would leave only about 13 groups total in the test partition. This is an illustration, not a split assignment. The saved evaluation plan proposes at least **50 independent test groups per class**, plus development data; that is a planning target, not a report requirement or statistical guarantee. See `../../fyp-cwk-2/docs/evaluation-2026-10-17/build_plan.py:89` and its generated evaluation-plan DOCX. More renderings of the same source asset do not increase independent evidence.

## What “works” means here

| Purpose | Current judgement |
|---|---|
| Read and preprocess original images | File hashes, decoding and native dimensions have been verified by the existing audits |
| Explore MobileNetV2 versus EfficientNetB0 | Potentially useful after reviewed labels/groups and a frozen small-study protocol; no performance result yet |
| Meet the saved final evaluation target | Current conservative subset is too small under the proposed split |
| Establish real parcel-photo accuracy | Unfulfilled: synthetic renders differ from real packaging, capture conditions and damage |
| Establish live-camera reliability | Unfulfilled: no independent labelled live sessions, temporal evaluation or latency/resource evidence |

The recommended use is a clearly disclosed pilot, preserving a separate final real-world evaluation. Keep quality exclusions and ambiguous cases visible in the report; removing difficult images does not establish better operational accuracy.

Kaputt and the corrugated-cardboard source remain candidates for further intake, not accepted training data. The [source audit](PARCEL_REAL_SOURCE_AUDIT_2026-10-20.md) records access/terms, subset mapping and physical-group gaps. The [family review](PARCEL_DISPUTED_FAMILIES_2026-10-20.md) gives the conservative hold and optional co-location choices. Neither public metadata nor a dataset title resolves these issues.

## Current continuation

Human review is proceeding in batches of three actual originals from the nine label candidates. Explicit user choices are recorded in append-only, Git-ignored `datasets/parcel-human-adjudication-20261020/batch-*.json`, with image hashes, source exposure and separate fields for still-unanswered decisions. Earlier assistant proposals and blank historical templates are preserved. A condition choice does not silently approve a family or create a training split.

All nine candidate responses are recorded: P01/P14 Damaged; P02/P21/P27/P33 Normal; P30/P31 Uncertain and on hold; P17 relevance objection with no condition label. Uncertain is a review state, not a third model class. All inherited quarantines remain. The first six questions exposed assistant proposals; the last three did not suggest a condition, but prior proposals remained accessible. These responses are not a fully blinded independent study.

After this focused review, decide the family policy and finish the remaining original-image decisions. Then prepare a modest synthetic pilot with appropriate limitations. Acquire more independent, permitted real-photo examples and, later, labelled camera sessions for final validation. Inventory/delivery AI and additional features remain deferred.

The read-only feasibility calculation is saved in ignored `outputs/parcel-disputed-review-20261020/dataset-feasibility.json`. No data was uploaded, no model fitting occurred and no production state changed.
