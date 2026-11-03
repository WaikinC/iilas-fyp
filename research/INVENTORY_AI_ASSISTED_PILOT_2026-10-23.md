# AI-assisted inventory pilot assessments

Date: 23 October 2026. Scope: draft assessment of existing simulated pilot cases, not training-label admission or an evaluated model.

Later user decision: AI-assisted labels are approved for the provisional simulated-data prototype, with independent accuracy still pending. The [method amendment](INVENTORY_AI_ASSISTED_PROTOCOL_2026-10-23.md) and [main-cohort guide](INVENTORY_MAIN_COHORT_2026-10-23.md) supersede the earlier pending-choice wording below. Original draft files remain historical and unchanged; approval does not make them independent human labels or admit pilot families into main evaluation.

The user directly delegated the first case's label to the assistant. Its original local assessment is preserved as Reorder Risk. Under the continuing stock-AI goal, the assistant also prepared advisory assessments of the other 59 cases, with reasons and source evidence hashes. These additional drafts are not submitted human decisions. Whether to adopt AI-assisted annotation for a provisional simulated-data prototype is a pending methodological choice, because the current [protocol](INVENTORY_SIMULATION_AND_LABELLING_2026-10-23.md) specifies human pilot review.

## Draft result and provenance

| Draft label | Cases |
| --- | --- |
| Normal | 8 |
| Reorder Risk | 32 |
| Critical Stock Risk | 20 |

Cases were assessed against the actual cutoff-known stock, commitments and replenishment assumptions, without reading the sealed generator intentions. Decisions were explicitly selected case by case, with a local script materialising reasons and verifying that each selection matched the inspected evidence. This is one assistant's reasoning about fictional facts, not independent annotation or a trained classifier. The uneven distribution is retained rather than relabelling cases to match intended class balance.

Normal drafts require adequate recorded stock and commitment/supply context under the stated assumptions. Reorder drafts identify policy-buffer replenishment needs or a timely but unconfirmed supply plan. Critical drafts identify specific additional firm demand lacking timely stated supply because replenishment is disrupted. Reservations are counted once. An unconfirmed plan's actual reliability is unknown; that uncertainty can change the appropriate Reorder/Critical judgement and must remain visible.

All 60 records carry assistant provenance, per-case evidence and manifest hashes, a reason, assumptions and a revision identity. Human labels remain null, independent human review false, training eligibility NotAssessed and operational approval false. The original case01 file is unchanged and referenced by its preserved hash. Original observations stay unlabelled, and no independent reviewer or human agreement statistic is invented.

## Local files

All row-level content is ignored locally beneath `research/datasets/inventory-simulation-v1/assistant-reviews-02/`: `assessments.jsonl`, `summary.json` and `review.html`. The single original case01 assessment remains in assistant-reviews-01. The frozen pilot-01 packet is unchanged and still passes its source/report-bound audit. No data, model, review rows, commit or deployment is published.

The rendering is an inspection aid; it does not save user decisions, merge labels into observations or qualify data for a trainer. Later human decisions may disagree and must be preserved separately rather than replacing these drafts. An approval to use an AI-assisted prototype would change the annotation method; it would not retrospectively make the labels independent human truth.

## Effect on the stock-AI goal

There is still no main cohort, fixed main split or fitted RF/DT classifier. The six existing inputs omit some commitment and replenishment context used for these assessments; a model's ability to reproduce these labels must not be assumed. Receipt/activity coverage gaps identified in the [readiness audit](INVENTORY_PILOT_REVIEW_PREPARATION_2026-10-23.md) also remain for the next qualified generator version. Preserve the original pilot when making later revisions.

If AI-assisted annotation is adopted, write that limitation into the next dataset/model protocol and report any eventual test score as agreement with AI-assisted simulated labels, not independent real warehouse accuracy. The separate operational rule checks and real snapshot-review workflow remain unchanged. Main-data preparation and fitting should follow the chosen method and the existing resource/leakage controls; no gate is satisfied merely by generating a label file. Parcel camera, delivery AI and additional features remain deferred.
