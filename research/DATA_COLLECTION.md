# Collecting data for the three IILAS AI evaluations

This is the Step 2 intake workflow, based on the [evaluation plan](https://docs.google.com/document/d/1fHTr2zE1xBzbWuPpyaDArQaIOYhmJOTVM4fzqoI7QjU/edit). It prepares local observations for later splitting and training. It does not generate labels, infer missing features, download production records, train a model or activate an inference artefact.

## Start and audit a collection

From the application directory, use the research Python selected by `Enter-IILAS.ps1`, or the explicit MSI interpreter:

```powershell
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe research/data_intake.py init
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe research/data_intake.py audit
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe research/data_intake.py audit --kind inventory
```

The default collection is `research/datasets/intake-v1/`, which Git ignores. It contains an empty `observations.csv` and `dataset.json` for each of inventory, delivery and parcel, plus a parcel `images/` directory. `init` refuses an existing destination, including a partially completed collection. To create another collection, supply `--root research/datasets/my-collection`. The CLI limits roots to this ignored dataset area. Do not initialise another Git repository there or force-add data to Git.

Audit exit codes: **0** = eligible for split preparation under the software checks; **2** = data/protocol preparation remains; **1** = the operation could not run. A fresh empty collection intentionally exits 2. Audits print task names, aggregate counts, row numbers, known field names and issue codes, never sample IDs, evidence contents, paths or raw offending values.

`ready_for_split` is not training readiness, sufficient sample size, trustworthy labels, licence approval or model acceptance. The five independent groups per class check is only an early software minimum. The evaluation plan's independent-test-group target and group-separated splits remain to be satisfied. No export to the trainer occurs in this step.

## Dataset metadata

Each `dataset.json` starts with `protocol_status: "proposed"`. After the project owners actually review the observation and labelling procedure, record `"reviewed"`; do not change the flag merely to clear an audit. This records a human declaration, not authenticated supervisor approval. Rubric version `1.0` refers to the proposed rules in the saved evaluation plan. Changed rules need a documented revision and a corresponding validator change; other versions are currently rejected.

Register every source in the `sources` array with these non-empty strings:

- `source_id`: a short local source identifier used in observation rows.
- `reference`: dataset source/version or authorised collection procedure.
- `license_or_permission`: the actual applicable licence or permission record.
- `permitted_use`: what the collected records may be used for.

The source registry is local. Record public dataset restrictions accurately; a downloaded dataset is not automatically suitable for IILAS evaluation. Keep real and simulated observations in separate collections so their results cannot be silently combined. The candidate audit is in `dataset-candidates.json`.

## Common observation fields

| Field | Collection rule |
| --- | --- |
| sample_id | Unique pseudonymous observation ID. Do not use names, phone numbers or addresses. |
| group_id | Stable product ID for inventory, delivery ID for delivery risk, or physical parcel ID for images. Related views and repeated observations share the group. |
| source_id | Must identify one source in dataset.json. |
| origin | `real` or `simulated`. Public synthetic images are simulated. |
| observed_at | ISO 8601 timestamp with timezone, such as the timezone suffix `+08:00`. |
| feature_cutoff_at | Latest timestamp included in input features; cannot be later than observed_at. For images this is capture/observation time. |
| label | Report-defined class only when supported by reviewed evidence. Leave blank during pending labelling. |
| label_status | `pending`, `unresolved`, `reviewed` or `excluded`. Only reviewed rows count as labelled; move excluded cases to a separate exclusion log before split preparation. |
| labeler_id | Pseudonymous reviewer identifier for reviewed labels. |
| evidence_ref | Local reference to the reviewed case dossier, annotation record or verified outcome; do not put evidence bytes into the CSV. |
| rubric_version | `1.0` for this evaluation plan. |
| split | Leave blank during collection. Later: train/test for inventory; train/validation/test for delivery or images. Related groups cannot cross splits. Partial assignments are flagged. |

Use a separate local review log referenced by `evidence_ref` to preserve the two reviewers' original labels, disagreement and adjudication. Pilot 20 independent groups per class where feasible, then independently double-review at least 20% and all ambiguous cases, as proposed in the plan. The software checks that references exist as fields, not that reviewers were independent or that the evidence proves the label.

## Inventory observations owned by Wong

Collect a scheduled stock-review snapshot using the six existing features. The primary task assesses current stock condition, not an evaluated future stockout forecast.

| Feature | Definition and validity |
| --- | --- |
| available_quantity | Nonnegative quantity under the agreed stock-balance definition. Confirm whether reservations are already deducted. |
| reserved_quantity | Nonnegative reserved quantity. |
| movement_frequency | Nonnegative integer count of the agreed movement events during the preceding 30 days. Freeze which events count before collection. |
| reorder_distance | Available quantity minus reorder level. Negative values are valid. |
| adjustment_count | Nonnegative integer adjustment count during the preceding 30 days. |
| days_since_replenishment | Nonnegative elapsed days; missing history is unknown, not zero. |

Label **Normal** when the reviewed dossier supports acceptable operation and routine monitoring; **Reorder Risk** when replenishment should be reviewed or initiated; **Critical Stock Risk** when reviewed stock evidence supports likely fulfilment impact without corrective action. A documented imminent shortfall is sufficient; an already missed commitment is not required. Critical takes precedence. Record evidence and urgency, and leave ambiguous cases unresolved. This corrects the earlier narrower draft to match Wong's report; see [the labelling review](LABELLING_REVIEW_2026-10-17.md). Do not derive labels automatically from the same six features. A duplicate product/timestamp cannot become an additional observation by changing its sample ID.

## Delivery observations owned by Choong

Collect one primary snapshot per delivery halfway through its promised dispatch-to-deadline interval. The proposed allowable capture window is 50–60% of that interval. Include only deliveries still active at observation and record excluded completed/cancelled deliveries separately. The intake tool checks timing, not the actual shipment's terminal state; that requires source review.

Inputs are `expected_duration_hours`, `elapsed_hours`, `failed_attempts`, `has_proof`, `status_event_count` and `parcel_count`. Counts are whole numbers; parcel_count and the expected duration must be positive. Proof is 0 or 1. Missing proof before delivery is not automatically an abnormality. All features describe information available at observation.

Retain `dispatch_at`, `deadline_at` and `outcome_checked_at` as timezone-bearing audit timestamps, not model features. Expected and elapsed durations must match these timestamps to within one second. Reviewed labels require follow-up through deadline plus 24 hours. That 24-hour tolerance is a proposed protocol choice, not a historical report requirement.

- **Low:** on-time delivery, no failed attempt, required proof present by the follow-up cutoff.
- **Medium:** delivered with proof by the cutoff, but late or requiring a failed attempt.
- **High:** terminal failure/return, undelivered at cutoff, or required proof still absent despite complete evidence collection.

High takes precedence. Missing source data, uncertain proof requirements and incomplete follow-up remain unresolved. Future outcomes belong only in the evidence used to assign labels. Do not include them in features.

## Parcel images owned by Choong

Place authorised photographs beneath `parcel/images/`, and use relative `image_path` values beginning `images/`. Both before/after versions and different angles of the same physical parcel share a group ID. Keep customer/address details out of the images consistently.

Label **Normal** for clear images with no visible packaging damage, and **Damaged** for visible tears, crushing, punctures, breakage or wet damage under the annotation guide. Poor lighting, blur, occlusion and non-parcel images need review or recapture; they are not a third trained class.

The audit checks readable PNG/JPEG/WebP images, minimum 64-pixel dimensions, a 16 MB file limit, paths within the image collection, exact decoded duplicates and a simple perceptual near-duplicate screen across different parcel IDs. `possible_related_images` requires manual review. The perceptual screen can produce false positives and cannot find every related image. Pixel dimensions and successful decoding do not establish image quality or parcel identity.

## Next boundary

The user currently selected public datasets only. Collected public sources are kept separately from this primary-task intake; their source labels must not be silently converted into IILAS risk classes. See [the review and acquisition status](LABELLING_REVIEW_2026-10-17.md).

Collect and review actual observations, then create fixed group-level split manifests and complete the report-aligned training preparation. Existing trainers do not consume these extended intake CSVs directly. This step deliberately leaves original training templates and model outputs untouched. Optional models and additional product features remain deferred.
