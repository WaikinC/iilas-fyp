# Delivery risk AI for the FYP demonstration

24 October 2026. Read-only report, application and local-data audit. **Recommendation: build an explicitly simulated three-class Random Forest prototype inside Delivery Monitoring, with separate explainable abnormality rules.** Retain the existing public binary benchmarks as comparisons. This audit does not approve a simulation protocol, fit a classifier or activate inference.

## Findings from both reports

The current Google Drive Word files were read through the connected Google Drive plugin. Their modified dates remain7October2026. The saved originals were also parsed read-only and match the registered SHA256 values. Paragraph references below are reproducible XML paragraph indices in the saved originals, including table cells; they are not printed page numbers.

| Source | Relevant requirement | Implication for this demo |
|---|---|---|
| [Choong Wai Kin report](https://drive.google.com/file/d/1XkAGX38tNdql7vEIQI8uVxleqYi3eJGc/view), FR-8, paragraphs1415–1416 | Retrieve authorised delivery facts, validate availability, classify Low/Medium/High with RF, compare DT/LR, retain shipment/time and contributing information for human review | A real fitted three-class classifier is needed to demonstrate this requirement. Renaming a binary lateness score is insufficient. |
| Same report, FR-9, paragraphs1418–1419 and methodology paragraphs820–829/884 | Separate documented abnormality rules and points, risk thresholds, retained reasons/time and review alerts | Keep the rule score separate from the RF probability and explain both. The report's30/25/20/15/10 points are illustrative; thresholds need a prospective documented choice. |
| Same report, FR-11, paragraphs1424–1425, evaluation paragraph1504 | Retain shipment-linked results, processing/model/rule references and review information; compare accuracy, precision, recall, F1 and confusion matrix | Display and retain the result and its provenance; test the full browser/callable/model/review chain. No cancellation, reassignment or stock update from a prediction. |
| Same report, methodology paragraphs882–888 | Separate training/validation/testing, preprocessing and RF/DT/LR comparisons, with attention to High recall and false alerts | Freeze labels/splits before fitting; report per-class metrics and macro F1 rather than only accuracy. |
| Same report, UC-DM-04/Table3.12(b), paragraphs1905–1917; Figure4.24 explanation paragraph2199 | In-transit updates; references distance, weather, route-delay history and traffic; manager priority alert; explicit rule-based timeout fallback | These contextual inputs/providers are absent in current data. A first demo must disclose that gap. A rule fallback must be visibly labelled as rules with an AI-unavailable warning, never presented as an RF result. |
| [Wong Ric Hang report](https://drive.google.com/file/d/17HlQBr8J4orQIfy-adEUBmuWLTiD5BTM/view), Warehouse use cases paragraphs1643–1651 and component paragraph1800 | Warehouse validates movements/picking/packing and submits Prepared-Shipment Handover; inventory AI belongs within Stock Management | Delivery AI belongs on the logistics side after handover/dispatch. It must not introduce another inventory-to-logistics operational bridge or alter existing reservations/balances. |

The functional requirements permit selected duration/status/history fields; the detailed use-case and screen descriptions describe richer context. Supporting the core FR-8 demo with recorded fields is reasonable, but it does not silently fulfil all weather/traffic/route-history details. Any narrower demo scope must be stated in the report/demo limitations. Isolation Forest and Gradient Boosting are optional experiments, not prerequisites.

Saved source hashes: Choong `84b297547635d6cc2993de3547c696321baaefee5a0b6a1d5a7fae1a6658de6f`; Wong `5a89babe5d204fbf784c1bb10b3c7634d9012d68d9a294b6574f4d04ed281b93`. [Original source manifest](../../fyp-cwk-2/resources/sources/project-1-2026-10-07/SOURCE_MANIFEST.md).

## What the application already implements

- `backend/functions/service.mjs` derives six legacy delivery features: expected duration from dispatch to the Malaysia end-of-day deadline, elapsed hours, failed attempts, proof-reference presence, event count and parcel count. It checks source versions and current authority when retaining a prediction.
- `research/models.py` declares Low/Medium/High and RF/DT/LR support. Its generic training helper is older scaffolding, with unconstrained `n_jobs=-1` and no newer bound serving-artifact/provenance contract. Do not invoke it directly as the recommended demo pipeline.
- `ResearchVerification.tsx` already has a delivery research selector and generic review display. A completed, report-positioned Delivery Monitoring AI workflow is still missing.
- `deliverySignals.ts` displays overdue/repeated-failure/stale-update reasons as rules, not AI. The backend `abnormality()` helper uses four equal25-point checks and the active UI does not consume its full scoring output. Neither is the completed retained FR-9 scoring/review workflow. Existing valid delivery transactions reject impossible transitions and require matching proof before Delivered.
- The current local deployment deliberately uses a parcel-only profile for the original research URL. Its backend guard refuses generic delivery inference. `research/models/delivery.joblib` is absent; the running health response also reports the generic delivery model unavailable. The stock RF14 runs separately and remains ready. There is no working delivery prediction to activate merely by clicking the existing selector.

Implementing the later recommendation will touch source-bound shared files. Reuse the safe local metadata/profile cutover and then-current export/import preservation process if affected stock/parcel pins need refreshing. Do not weaken the parcel-only guard or overwrite old profiles to make delivery appear enabled.

## Current local demonstration data

Explicit project `fyp-inventory-and-logistics`, Firestore emulator `127.0.0.1:8081`. No production connection, login, data write, new model load or training occurred. All records were previously confirmed by the user as demonstration/test data.

| Read-only observation | Count / result |
|---|---:|
| Shared shipments | 20:3 Draft,7 Prepared,10 Dispatched |
| Current delivery records | 6:2 Delivered,4 Returned |
| Current In Transit / Attempt Failed delivery records | 0 |
| Dispatched shipments with no delivery record/history | 4 |
| Delivery events | 12:6 In Transit,2 Delivered,4 Returned |
| Recorded failed-attempt events / deliveries with2+failures | 0 /0 |
| Latest location records | 2 |
| Matched delivered proof references | 2 |
| Retained delivery predictions | 0 |
| Independent delivery-risk label fields / dedicated label collections found | 0 /0 |
| Dispatched shipments with dispatch and expected date | 10 /10 |
| Positive expected dispatch-to-deadline window | 5 |
| Zero/negative expected window | 5 |
| Positive window plus existing delivery history | 4, all terminal |
| Weather / traffic / historical route-delay fields found | 0 /0 /0 |

Before/after hashes match across all75 documents in the nine inspected collections. The label/history addendum also used read-only local queries. Event timestamps/previous states are present; recorded transitions and failed counts agree for these fixtures. This does not make their history complete or independently labelled.

The five nonpositive expected windows are existing demonstration timelines, not newly introduced errors. The legacy feature builder clamps them to zero. New training/serving preparation should instead reject or explicitly mark such snapshots unavailable. This audit changes none of those records. New fresh demo fixtures can demonstrate valid timelines without rewriting the selected Admin's existing records.

Twenty shipments, zero current transit histories, zero failure examples and no independent risk labels are insufficient to train the report's classifier. Do not label Returned automatically High or Delivered automatically Low: terminal outcomes are not an as-of risk judgement and would not repair the missing feature history.

## Why the public models are not a direct replacement

The existing DataCo benchmark is binary late/on-time with different source features and evaluation population. Olist is a purchase-time completed-order calendar-lateness benchmark with four inputs: purchase month, weekday, hour and promised lead days. IILAS needs an in-transit three-class snapshot with elapsed time, failures, status and evidence/history. Neither public target supplies all three report classes or the required as-of features.

The frozen Olist RF's already exposed validation precision is10.90%, recall16.09% and macro F1 0.506848. These are validation-selection results, not final-test or IILAS performance. The proposed richer Olist experiment remains a proposal. More work on that binary feature set would not itself implement FR-8. Preserve the sealed development artefacts and confirmation reservation; no confirmation scoring or relabelling is authorised by this recommendation.

Sources: [Olist development](../research/NATIVE_DEVELOPMENT_2026-10-20.md), [availability audit](../research/OLIST_FEATURE_AVAILABILITY_2026-10-20.md), [conditional proposal](../research/OLIST_CONDITIONAL_EXPERIMENT_2026-10-20.md), [public benchmark protocol](../research/BENCHMARK_TRAINING.md). Original/derived datasets and model files remain ignored; no new acquisition or licence acceptance is needed for this audit.

## Implementation options

| Approach | Benefit | Main trade-off |
|---|---|---|
| Simulated three-class RF plus separate rules — recommended for this FYP demo | Matches the report labels, current application concepts and required RF/DT/LR comparison; can demonstrate a real fitted model without waiting for business records | Needs an approved simulation/label protocol; evaluation measures simulated scenarios and label policy, not real delivery accuracy |
| Integrate a public binary lateness model | Reuses a public-data research model | Mismatched inputs/prediction time; lacks Medium risk; relabelling probability bands would not create three-class ground truth; current Olist discrimination is weak |
| Implement rules only | Fast, clear and useful for demonstrating FR-9 | Does not fulfil the trained Random Forest part of FR-8; keep it as a distinct function |

The user selected **simulated three-class RF plus separate rules** after reading this recommendation. This explicitly extends simulation to delivery. The precise label rubric, model inputs and integration controls are prospective design choices; the written design records them before generation or fitting.

## Recommended scope to agree before implementation

1. Define Low/Medium/High as a **delivery-risk judgement at an explicit observation time** for the simulated prototype. Draft the judgement rubric separately from anomaly points. Do not call the RF probabilities calibrated probabilities of future lateness. The report does not supply complete label thresholds; those are prospective project choices.
2. Prepare varied fictional shipment/event timelines outside Firestore and Git. Include normal progress, approaching/exceeded deadlines, first/repeated failures, sparse/stale updates and boundary cases. Related timeline views and scenario variants share one family and split. Completed/returned snapshots belong in rule/history cases, not new in-transit RF requests. Missing proof is normal while in transit; only the separate post-delivery rule treats delivered-without-proof as abnormal.
3. Start from the existing six-input vocabulary, review whether the model also needs current-status encoding and time since last update, then freeze the exact feature contract before generation. Preserve whole-unit/count bounds, Malaysia deadline/time semantics and event cutoffs. An unknown value is not zero. Do not use final duration, later proof, future events, final status or the assigned risk label as input to an earlier snapshot.
4. AI-assisted policy labels may be proposed for consistency with the inventory demonstration preference, but delivery label origin must be explicitly selected and retained. If labels are rule-derived, report that the fitted model reproduces a simulated policy. A separate rule baseline shows how much the RF adds; it is not independent external accuracy. Keep ambiguous scenarios on hold rather than forcing labels.
5. Use RF as the main model, DT and multiclass LR as report baselines; freeze a compact fit budget and the group-aware TRAIN/VALIDATION/TEST partitions before fitting. The report's70/15/15 is a proposal; implement it by independent family with enough examples per class, not random frame/snapshot rows. Select on validation macro F1 with High precision/recall and a fixed tie rule, freeze once, then evaluate TEST once. Report accuracy, per-class precision/recall/F1/support and confusion matrix; no80% guarantee or test-guided model switching. Reuse existing CPU/native resource supervision with bounded trees/threads/RSS/time and no dependency upgrades.
6. Put the experimental action beside a selected valid demo delivery in **Delivery Monitoring**. Load trusted snapshot facts, show missing/invalid inputs, retain source versions/observation time, result/class scores/model and duration, and a clear simulated-training label. Retain explicit independent Manager review and history without changing delivery status, dispatch, stock or assignment. Use dedicated authenticated delivery inference and recoverable commands, preserving the completed stock and parcel paths.
7. Complete the separate abnormality workflow: documented rule versions/weights/thresholds, matched reasons, stored score/time and manager review. Use an in-app High/review queue for the demo. Any timeout fallback is visibly a rule assessment with an AI warning. No supplier/customer messages, paid weather service, automatic route change, Isolation Forest or new model family is needed for the first demo.
8. Create fresh disposable demo shipments with valid event timelines for local browser testing through the existing handover/dispatch controls. Demonstrate Low/Medium/High examples, timeout/unavailable/retry recovery, stale-source rejection, separate rule reasons and manager review. Verify exact cleanup and unchanged existing stock/shipment/configuration state, then collect screenshots and report evidence.

Distance-to-destination, actual weather/traffic, historical route-delay rates, continuous GPS-triggered prediction and external priority notifications remain explicit richer-use-case gaps. Do not invent values from addresses or add provider calls silently. If these are required for the assessed demonstration, the design must either add clearly fictional demo context or separately scope their collection; they are not prerequisites to the narrower FR-8/FR-9 prototype described here.

## Verification and next decision

This task performs analysis/recommendation only. Audit scripts and aggregate receipts are under ignored `outputs/delivery-demo-audit-20261024-fe2d4201-167c-4f15-9376-9b9e8b1876cf/`. The original reports, inspected application/research sources, current trained models and emulator records remain unchanged. No model was fitted, test cohort reopened, service restarted, dependency installed or production data touched.

The route decision is resolved. Prepare the written simulation/labelling and integration design for review before generating data or building functionality. This is the FYP demonstration path; genuine-business deployment is not the current completion target.
