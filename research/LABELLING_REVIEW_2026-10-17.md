# Report alignment and public dataset collection

## Later inventory decision — 23 October 2026

The user has now authorised simulated inventory data. The [new protocol](INVENTORY_SIMULATION_AND_LABELLING_2026-10-23.md) uses Wong's permission for carefully prepared scenarios while preserving reviewed three-class evidence, simulated provenance and separate grouped evaluation. Earlier public-only wording below records the 17 October decision and no longer excludes this inventory simulation scope. The protocol is written only: no new data, labels, training or operational model acceptance is claimed. Public benchmarks remain separate; parcel camera and delivery work are deferred.

Reviewed on MSI on 17 October 2026. The user selected **public datasets only for now**. This review preserves the three report-required models and defers all additional features. Public benchmark results must remain separate from claims about the deployed IILAS tasks.

## Report evidence and labelling decisions

The review uses the two original Word portfolios in the combined [project Drive folder](https://drive.google.com/drive/folders/1XBhWL_9fNd1OOn_rxkbWY8gOIbR7sqrW). Their local copies match the SHA-256 values in `fyp-cwk-2/resources/sources/project-1-2026-10-07/SOURCE_MANIFEST.md`.

| Model | Report requirement | Review decision |
| --- | --- | --- |
| Inventory Random Forest, Decision Tree comparison | Wong: Normal, Reorder Risk, Critical Stock Risk; stock-condition classification; proposed 80/20 split | Retain all three labels. Correct the earlier overly narrow Critical definition. A binary backorder target is a separate benchmark. |
| Delivery Random Forest, Decision Tree and Logistic Regression comparisons | Choong: Low, Medium, High delivery risk; proposed 70/15/15 split | Retain the three risk classes. The detailed outcome rubric, halfway snapshot and 24-hour tolerance are proposed operational definitions, not report quotations. DataCo supports a separate binary late-delivery benchmark. |
| Parcel MobileNetV2, EfficientNet B0 comparison | Choong: Normal/Damaged parcel images, transfer learning and proposed 70/15/15 split | Retain binary visible-condition labels. Synthetic parcel labels support a synthetic-domain pilot; they cannot establish real-world image accuracy. |

Wong's **Inventory Data and Feature Preparation**, **Model Training and Evaluation**, and section **3.2.5 Artificial Intelligence Training and Evaluation Requirements** are the relevant passages. His exact Critical definition is: “The available stock condition is likely to affect fulfilment if corrective action is not taken.” The report also says unavailable features must not be invented solely to match a proposed feature list. Carefully prepared simulated stock scenarios are permitted in the report with disclosed limitations, but are outside the user's current public-only collection choice.

Choong's sections **2.2.3**, **2.2.4** and **2.2.5** discuss risk prediction, model selection and evaluation. They distinguish learned delivery risk from rule-based abnormal-delivery scoring. The latter is scenario-tested and does not become a fourth trained model in this task. Parcel3D is discussed as synthetic research evidence with a real-world domain gap.

Sources: [Wong portfolio](https://drive.google.com/file/d/17HlQBr8J4orQIfy-adEUBmuWLTiD5BTM/view), [Choong portfolio](https://drive.google.com/file/d/1XkAGX38tNdql7vEIQI8uVxleqYi3eJGc/view), [evaluation plan](https://docs.google.com/document/d/1fHTr2zE1xBzbWuPpyaDArQaIOYhmJOTVM4fzqoI7QjU/edit).

## Clarified inventory rubric

- **Normal:** reviewed available/reserved-stock evidence supports acceptable operation and routine monitoring.
- **Reorder Risk:** replenishment should be reviewed or initiated, without sufficient evidence for likely fulfilment impact requiring urgent correction.
- **Critical Stock Risk:** reviewed evidence supports that stock is likely to affect fulfilment without corrective action. A documented imminent shortfall is sufficient; an already missed commitment is not required. Record the evidence and urgency, rather than assigning Critical from an arbitrary universal quantity threshold.

Critical takes precedence. Ambiguous or incomplete evidence remains unresolved. Keep the stock-balance definition and the movement-history window explicit. A low quantity is not automatically Critical: product demand, reservations and replenishment context matter. Never turn `BO=1` into Critical and `BO=0` into Normal; that omits Reorder Risk and changes the task.

The 30-day feature windows, minimum group counts and detailed adjudication procedure are evaluation-plan choices. Software validation does not certify the labels or supervisor approval. The clarified prose does not change the intake CSV schema or its implemented timestamp rules.

## Delivery rubric status

The existing proposed outcome rubric remains a candidate protocol: Low for on-time, no-failed-attempt completion with required proof; Medium for late/reattempt completion with required proof by the cutoff; High for confirmed terminal failure, non-completion at cutoff or required proof still absent after complete follow-up. Missing or uncertain evidence remains unresolved. Proof must actually be required for the delivery; an absent field is not proof of failure.

The 50–60% dispatch-to-deadline observation window and deadline-plus-24-hour follow-up are **not approved report requirements**. They need protocol acceptance and sensitivity analysis before primary evaluation. Actual completion time, final status and later proof must not enter features for an earlier prediction. Repeated snapshots of one delivery cannot cross splits.

DataCo does not contain the complete failed-attempt/proof/status-event history needed for this proposed protocol. Do not convert early/on-time/late/cancelled source statuses into Low/Medium/High. Cancellation is not necessarily delivery failure, and late delivery alone does not establish High risk under the proposed rubric.

## Parcel rubric status

**Normal** means no visible packaging damage in a sufficiently clear view; it does not certify internal contents. **Damaged** means visible packaging damage under the agreed annotation guide. Blur, occlusion, non-parcel inputs and uncertain condition are review/exclusion states, not a third model class. A model-render flag is a source annotation, not an independent human judgement of visible damage.

For Parcel3D, retain `PARCEL_TYPE` from each publisher render configuration as the candidate label. Keep the source model name, rendering configuration, source split and annotation file. Inspect image visibility before accepting labels. Group related base models, deformations and views together; a different rendering UUID is not sufficient proof of independence. Never mix synthetic and real evaluation results without separate reporting.

## Collected public sources and exact limits

All raw files, derived tables, image subsets and acquisition helpers are local under ignored `research/datasets/public-sources-2026-10-17/`. No data was added to Git. Source links and aggregate suitability notes are safe project documentation; downloaded rows and images are not.

| Source | Collected data and role | Limit for the report task |
| --- | --- | --- |
| [Backorder Prediction v1](https://data.mendeley.com/datasets/krnbcxksn3/1), Rodrigo Santis, DOI 10.17632/krnbcxksn3.1, CC BY 4.0 | Original `bopredict.csv`: 1,929,935 rows, 23 columns, 1,929,935 distinct SKUs. Native BO counts: 1,915,954 negative and 13,981 positive. | Binary backorder, not three stock-risk classes. Inventory level and minimum-stock fields are relevant; reservations, adjustments and replenishment timestamps are not fully available. Preserve original feature meanings. |
| [DataCo v5](https://data.mendeley.com/datasets/8gx2fvg2k6/5), Constante, Silva and Pereira, DOI 10.17632/8gx2fvg2k6.5, CC BY 4.0 | Original: 180,519 order-item rows, 53 columns, 65,752 orders. A minimised benchmark table contains 172,765 rows across 62,897 order groups after excluding 7,754 cancelled-shipping rows. | Binary late-delivery target, not Low/Medium/High. Missing proof and attempt history cannot be filled with fabricated zeros. Source order-item quantity is not parcel count. |
| [Parcel3D v1](https://zenodo.org/records/8032204), Naumann et al. | 40 synthetic RGB images: 20 source Normal and 20 source Damaged, all from the publisher's training partition; render configurations and annotations retained. All decode at 1080 x 720 and have distinct image hashes. | Academic research only, with mixed source-resource restrictions. The 40 renderings have 30 distinct source model names, not 40 verified independent parcel families. No real-world test data is supplied. |

Backorder prevalence is about 0.72%; an all-negative classifier would exceed 99% accuracy. Report class recall, precision, F1, confusion matrices and a precision-recall summary for that benchmark. No model scores have been measured.

The parcel pilot was selected reproducibly: seed 42, shuffle sorted source training configurations, inspect the first 80 and take the first 20 of each source type. Each downloaded ZIP member passed its stored CRC, and each saved file has a SHA-256 hash. The whole 45.8 GB archive was not downloaded, so its whole-file MD5 was not verified. Contact-sheet inspection found low-light or small-object cases (including pilot positions 16, 19, 21, 29 and 37); these require full-resolution review before labels are accepted. Synthetic backgrounds, product packaging and deformation patterns differ from real shipping photos. The pilot remains labelled `pending`, not human-adjudicated ground truth.

The DataCo minimised file uses a fixed allowlist: pseudonymous order group, payment type, scheduled shipping days, shipping mode, item quantity, category ID and the native late-delivery target. Actual duration and final statuses are excluded from input columns. Names, contact fields, password fields, addresses, customer identifiers, precise coordinates and image URLs are excluded. Treat the original source CSV as restricted local data; do not preview rows in screenshots or upload it. Pseudonymous group IDs preserve grouping and are not a claim of irreversible anonymisation. The derived target agrees with the eligible source delivery status, and no order group has conflicting targets in this downloaded version.

Checksums, byte counts, target counts, missing-value counts and processing choices are recorded in `tabular-profile.json` and the parcel pilot manifest. A missing-value count of zero does not rule out encoded sentinels or semantic errors. A targeted check found no -99 values in INV, TIM, SUP1 or SUP2, but found **6,654 negative INV values**. Confirm their source meaning before training; do not silently clip them to satisfy IILAS's nonnegative quantity validator. Other possible encoded missing values and feature availability at prediction time still need review.

The native Google Drive plan is updated to version 1.1 and read back to verify the correction and collection note. The previously generated local version 1.0 Word/PDF files remain historical snapshots; use this review and the current Drive document for the continuation.

## Alternatives assessed

UCI Online Retail II provides sales transactions without complete stock balances or risk labels. LaDe is useful for timing research but does not resolve the required proof/attempt/deadline gap. The Moratuwa Roboflow source is a small damage-detection set without verified Normal coverage. Other Roboflow detection sources need licence/provenance and object-to-image label review. A Hugging Face damaged-box candidate exposed image-path strings rather than a verified set of usable image bytes; it was not adopted. No extra task or architecture was added.

## Next research work within the current scope

1. Validate source data semantics and sentinels; freeze a benchmark-specific dictionary, target and exclusion log. Do not feed these tables directly into the current six-feature IILAS trainers.
2. Review the parcel pilot's visibility, source labels and shared base models; expand the synthetic training subset only after this audit. Keep a future real-image evaluation gap explicit under the public-only constraint.
3. Prepare reproducible stock benchmark splits and grouped DataCo splits, retaining the reports' intended proportions where feasible and documenting any departures. Apply cleaning and resampling within training data only. Compare the already selected architectures on identical splits; do not train or tune on the test set.
4. Report these as public-data benchmark experiments. Full IILAS three-class stock and delivery evaluation remains unfulfilled unless a compatible labelled source is found or a separately accepted report/protocol revision defines another target. Additional features remain deferred.

Review status: report-alignment review complete; human annotation/adjudication and final protocol approval are not claimed. No model was trained, activated or deployed in this collection step.
