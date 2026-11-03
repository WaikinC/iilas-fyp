# Delivery risk AI and abnormality alerts for the FYP demonstration

24 October2026. **Status: approved written design.** The user approved this document after its fresh builder check returned “nothing important left.” The selected route is simulated three-class Random Forest plus separate rules after the [two-report and application audit](../../DELIVERY_RISK_DEMO_AUDIT_2026-10-24.md). Their Native execution preference remains. This is one sequential project: simulated data/labels, bounded model evaluation, then a local demonstration in the existing application. The [eight-task implementation plan](../plans/2026-10-24-delivery-risk-demo.md) is prepared for review before execution.

## Intent and completion target

Demonstrate the report's FR-8 delivery-risk classification, FR-9 explainable abnormality scoring and FR-11 retained results/human review inside **Delivery Monitoring**. A real fitted RF returns Low/Medium/High scores for an authorised active demo shipment. A separate rules assessment reports abnormal conditions and retains its own reasons/version/time. Neither output changes delivery status, assignment, stock or purchasing. Finish with actual local model/Firebase/browser evidence and an honest account of simulated-data evaluation. Real-business deployment and independently established real delivery accuracy are not this project's completion target.

The logistics report specifies RF as main model, DT and Logistic Regression as baselines. The partner report preserves Prepared-Shipment Handover as the operational bridge between inventory and logistics. Keep the completed stock workflow, parcel functionality, original Admin, IDs/balances/shared access and navy/purple dashboard unchanged. No external provider, camera trial or new model family is needed.

## Approaches and selected route

1. **Simulated three-class RF plus separate rules — user selected.** Matches the report classes and existing as-of delivery concepts; supports a complete FYP software demonstration. Its labels and metrics describe an educational simulated policy, not independent delivery outcomes.
2. Public binary lateness model — considered but not selected. DataCo/Olist inputs, prediction time and binary labels differ. Preserve those benchmarks as comparisons; do not rename binary probability bands into three-class ground truth or reopen Olist confirmation.
3. Rules only — considered but not selected. Useful for FR-9 and a clear fallback, but does not demonstrate the trained classifier in FR-8.

## Meaning of the model and label origin

The target is **risk judgement at the observation time**, not a retrospectively assigned final delivery outcome or a calibrated probability of future lateness. Low means normal progress under the synthetic teaching policy; Medium means current attention; High means urgent current review. The class scores are RF class proportions for this simulated classification task. The interface/report must say **Trained on simulated delivery scenarios** and **Human review required**.

The following precise rubric is a builder proposal for the user's design approval, not a threshold supplied by either report. It is AI-authored policy labelling, consistent with the chosen demonstration approach. Preserve `origin=simulated`, `annotationOrigin=AI-authored delivery triage policy`, `independentHumanReview=false`, `independentAccuracyValidated=false`, `operationally_approved=false`, `evaluationOnly=true`, `acceptanceSha256=null`. Manager review never changes these flags.

Let `overdue = elapsedHours - expectedDurationHours`, `progress = elapsedHours / expectedDurationHours`, and `age = hoursSinceLastUpdate`, with a positive expected duration. Evaluate in this order, with equality included:

| Label | Fixed teaching rule |
|---|---|
| High | failedAttempts≥2, **or** overdue≥24hours, **or** age≥48hours while overdue>0 |
| Medium | otherwise overdue>0, **or** failedAttempts=1, **or** age≥24hours, **or** progress≥0.8 |
| Low | all other complete, consistent active snapshots |

Invalid/unknown inputs are **Unavailable**, not Low and not a fourth training class. A failed attempt is an observed event, not a guessed future failure. Proof absence while in transit is normal; the rubric never makes it damage/failure by itself. Status/event/parcel fields can be context without being used by every teaching branch. Record the exact policy version and reasons for every synthetic label.

This deliberately simple teacher is fully reproducible. RF is learning its pattern and may be less accurate than the exact teacher; it is not being shown to outperform the policy or discover genuine logistics risk. Publish the exact teacher as a deterministic reference alongside a majority Dummy and RF/DT/LR. Label-policy agreement is a valid demonstration metric only when disclosed as such. Independent labels/real outcome validation remain limitations, not additional prerequisites to this FYP demonstration.

## As-of input contract

Use eight canonical facts and ten numeric model columns. Six facts reuse existing vocabulary; add current status and update age rather than pretending event count captures stale/status behaviour. Inputs are server-derived from the selected record/events; HTTP callers cannot choose values or labels. Pure fictional scenarios exist offline for training/software fixtures, not as trusted business facts.

| Canonical fact | Unit and constraint | Model encoding |
|---|---|---|
| expectedDurationHours | finite >0 and≤720 | `expected_duration_hours` |
| elapsedHours | finite0–1440 | `elapsed_hours` |
| failedAttempts | integer0–20 | `failed_attempts` |
| hasProof | Boolean, verified matching existing Proof of Delivery reference at/before observation | `has_proof`0/1 |
| statusEventCount | integer0–1000, complete admitted event set | `status_event_count` |
| parcelCount | integer1–1000 | `parcel_count` |
| hoursSinceLastUpdate | finite0–1440 and≤elapsedHours | `hours_since_last_update` |
| currentStatus | Dispatched / In Transit / Attempt Failed | ordered one-hot `status_dispatched`,`status_in_transit`,`status_attempt_failed` |

Column order is exactly the six existing snake-case columns, update age, then the three status columns above. Display class order Low/Medium/High and serialize class names explicitly; map estimator class ordering by name. Ties use display order Low then Medium then High, fixed in Python/JS tests.

Use server `observedAtMs`, original dispatch time, the expected delivery date's Malaysia end-of-day `23:59:59.999+08:00`, current shipment/delivery versions and the admitted event/proof metadata. Reject deadline≤dispatch, future dispatch, malformed/nonfinite timestamps, update before dispatch/after observation, future evidence, unknown status and contradictory event counts/failed counts. Do not clamp invalid duration to zero. No raw addresses, GPS coordinates, identifiers, notes, labels, rule totals, future events/final duration/final status enter the estimator.

Use all delivery events for the selected shipment up to observation, bounded by1000; reject larger sets rather than truncate. Query/read after-observation rows as source changes requiring a new request, not future predictors. A valid newly dispatched shipment may have no delivery document/events: use Dispatched, zero failed/events and age since dispatch only when this is proven by the complete empty event query. A missing delivery document with existing events is inconsistent. Replay the admitted transition chain from Dispatched and ensure current state/failed count agree. Active proof is optional; if a proof reference exists, validate its shipment/type/time without retrieving private image bytes.

Delivered and Returned are closed: do not start a new RF request, but retain and review previous results and evaluate relevant rules/history. Five existing negative/zero demonstration windows remain untouched and show Unavailable. Other missing or over-limit facts explain why analysis cannot start. This contract is a demo adapter, not a claim that old fixtures are independently qualified training data.

## Synthetic preparation and leakage controls

Create a new ignored area, provisionally `research/datasets/delivery-simulation-v1/`. Never use the existing20 demo shipments as training examples or alter their dates. Do not copy public identities/addresses or mix stock labels into delivery labels. No new external download/licence acceptance is needed.

Proposed cohort:300 independent family IDs, each with four related valid active snapshots,1200 rows. Construct100 normal-progress,100 deadline-pressure and100 retry/staleness families. These are simulation design strata, not risk labels. Vary dispatch/deadline windows, elapsed/update ages, parcels, valid retries and optional preuploaded proof; include counterexamples and exact threshold neighbours. Do not make class a source column or deterministic index/seed feature. Labels follow the frozen teaching policy only after valid ledger replay.

Assign family IDs to TRAIN/VALIDATION/TEST **before fitting**:70/15/15 families within each design stratum, giving210/45/45 families and840/180/180 rows. Fixed generation/split seeds, deterministic manifests and no alternate seed search. Related snapshots, variants and ancestors remain in their original family/partition. Require disjoint family/ancestor IDs, all three classes and at least20 rows per class in each partition. If generation cannot meet those prospective integrity/coverage conditions, retain the failure and revise the protocol before any fit; do not reshuffle to improve scores.

Retain per-row fictional events, observation cutoff, lineage, policy reasons/label, source/scenario hashes and excluded-case reasons locally. Validators replay timestamps/status/failed count/proof and independently derive features/labels. Deliberately corrupt/missing/future/closed cases are validation fixtures and rule challenges, never training rows. Do not impute unknown facts as zero. No operational Firestore writes from the generator.

## Bounded training and evaluation

Use current native research Python/scikit-learn; no dependency upgrade, WSL or GPU work. Reuse the existing native supervisor pattern without editing frozen stock/Olist/parcel scientific modules. Maximum2GiB worker process-tree RSS,3GiB currently available startup RAM,1GiB free disk,120seconds per fit,30minutes whole development,2RF worker threads with numerical libraries1thread,100MiB training-run output. Preserve failures and stop; never close unrelated apps, lower limits or retry in a new folder to find a favourable result.

Fixed11-fit development registry on TRAIN only:

| Family | Candidates |
|---|---|
| RF (main) |128trees, depth8/12 × min leaf1/3, balanced class weights, fixed seed, `n_jobs=2`:4fits |
| Decision Tree |depth4/8 × min leaf1/3, balanced, fixed seed:4fits |
| Multiclass Logistic Regression |TRAIN-fitted StandardScaler+LR, C0.1/1, balanced, lbfgs, max_iter2000, fixed seed:2fits |
| Dummy |majority label; fixed class tie order:1fit |

Use common partitions/feature order and no resampling. Save each fitted candidate; select within each model family on VALIDATION macro F1, then High recall, then High precision, then smaller declared registry index. No threshold tuning/calibration for this multiclass argmax task. Retain RF as the report's main candidate; report baseline advantages honestly. LR nonconvergence/failed fit makes development incomplete; do not silently drop it or alter max_iter. No train-plus-validation refit or extra seeds.

Freeze selected artefact hashes/feature contract/class mapping, full registry/environment/source metadata and validation results before TEST access. A separate explicit one-time evaluation operation scores the selected RF/DT/LR and Dummy, plus the fixed teaching reference, on the same reserved TEST rows. No fitting/selection follows TEST. Use family-bootstrap uncertainty on stored predictions (fixed seed,1000resamples), no repeated model invocation or refit. Report accuracy, per-class precision/recall/F1/support, macro F1, balanced accuracy, confusion matrices, undefined metrics and class imbalance, naming them **synthetic policy-agreement results**.

Completion requires valid frozen artefacts, honest metrics and working software; no invented80% guarantee. If RF performs poorly or fails to beat Dummy on validation, show the result and stop before application promotion for a decision, rather than tuning against TEST. The exact teacher is expected to be perfect on its own labels; RF has no requirement to beat it. Existing public results/seals and all trained stock/parcel weights stay unchanged.

## Separate abnormality rules

Implement a pure versioned evaluator used by the trusted commands and shared rendering. It stores matched rules, points, total, severity, observation time and reason strings, separately from RF. The report's illustrative weights are adopted here as a builder proposal:

| Condition | Points / applicability |
|---|---|
| Exceeded expected deadline |30, active shipment only; strict observation>deadline |
| At least2recorded failed attempts |25; retained history may remain visible after closure |
| Delivered without matching proof |20, Delivered only; existing normal transactions already prevent it, so test with an explicit corrupt-fixture challenge |
| Invalid recorded transition sequence |15; never create an invalid transaction to trigger it |
| No update for more than24hours |10, active only; closed shipments stop time-based alerts |

Rule severity:Low0–19, Medium20–49, High50–100; show every matched reason even when total remains Low. Any detected data inconsistency also marks the assessment **Needs data review**, distinct from score severity; RF admission is unavailable for inconsistent facts. Future/unknown data cannot be silently called normal. The rule evaluator returns partial known signals plus explicit unknowns; an incomplete assessment cannot claim an all-clear or automatic Low outcome.

The teaching label and rule severity may differ: they answer a synthetic classification policy and an additive abnormality policy respectively. The UI labels each source clearly; never substitute one into the other's retained history. A rule score is not an ML probability. Keep previous three inline signals consistent for timing/closure while extending the retained assessment rather than duplicating contradicting overdue logic.

A High rule assessment or High RF result enters an in-app manager review queue; no email/push/external message is sent. A model timeout/unavailable result may retain/display the separate rule assessment with an AI-unavailable warning. It must not write a Predicted RF result, invent confidence or silently fall back inside Python. Unknown/inconsistent source facts do not invoke RF at all.

## Local application and service contracts

Add the action to an eligible delivery card in **Delivery Monitoring**, using existing styles/access controls. Show source facts, as-of time, required availability, explicit demonstration acknowledgement, Analyse button, processing state and retained history. Results display RF label, all three scores, model/policy version, timing, source facts and **simulated training** disclosure. Present rule score/reasons in a distinct panel. High results link to the manager queue. Existing generic research history remains readable but cannot start this new demo workflow through its older generic `predict` handler.

Provisional public result collections: `deliveryAIExperiments`, `deliveryAbnormalityAssessments`, `deliveryRiskReviews`. Private actor-bound operation receipts: `deliveryAIRequests`, `deliveryAssessmentRequests`, `deliveryReviewRequests`. Public collections permit Approved shared-scope reads and no client writes. Private receipts deny all client access. Every result carries immutable original actor/shipment/source/observed-time/version/hash/feature/model or rule provenance; review appends a separate event and never changes prediction scores/provenance. Paginate history20results and queue20items with bounded queries/indexes; no unbounded dashboard subscription for the new collections.

Start roles:Approved active Admin/Manager/Logistics, plus Driver only on the currently assigned shipment. Approved shared staff may read history. Reviews require a different Admin/Manager from the original analyst; decision Acknowledge or NeedsFollowUp with3–500character notes and immutable review event, without relabelling/retraining or automatic delivery action. A later review correction appends a revision under expected review version; old events remain. A role/scope/assignment change during inference fences publication; authorised historical recovery remains possible without granting new-start rights.

Use dedicated delivery commands/service rather than bypassing the current parcel-only generic guard. Provisional API:authenticated loopback `127.0.0.1:8002`, health plus `POST /predict/delivery-experiment`; closed protocol, request UUID, exact feature payload/digest, manifest/model/scientific identities and all class scores. No caller-supplied output root, limits, Python command, model path or arbitrary pickle. Manifest preparation verifies local frozen artefacts; model bytes are hashed before deserialisation, prediction validation binds all IDs/scores/ranges/provenance, and unknown/tampered/unavailable inputs refuse. CPU inference uses a fresh bounded native process, one request at a time with Busy status,15second wall/fit,2GiB RSS,3GiB startup RAM,1GiB disk,10MiB run/100MiB aggregate evidence and confirmed descendant cleanup/quarantine. Do not add a persistent worker in this project.

New immutable delivery profile/launcher composes the existing verified stock/parcel profile rather than editing old private JSON. It has a separate delivery token and source/artifact binding and explicit local demo enablement. Backend capability must require the exact local emulator tuple/project. Preserve the stock and parcel service settings. Changes in their pinned shared sources require fresh metadata/base profile and a verified then-current export/import cutover; no model retraining or older-checkpoint substitution. Keep tokens/fixtures/manifests/logs/weights/exports ignored. Loopback-only Firebase suites remain sequential.

## Request recovery and source consistency

One client operation UUID plus exact actor/tab/scope/shipment/canonical intent is saved before send. Trusted claim captures `observedAtMs`, feature/source hashes, shipment/delivery versions and bounded event/proof digest. Backend calls Python outside Firestore transactions under a45second lease; HTTP timeout25seconds, client uncertainty after35seconds. Transactions read current account, scope, assignment, source versions and source digest before retaining the result; a conflicting update/configuration change/expired claim becomes a retained Unavailable outcome, never a new computation inside transaction retries.

States Running→Predicted/Unavailable; unknown unsent resolve creates a Cancelled tombstone. Resolve/retry uses the original operation, not a new ID; a completed replay returns its original result/model/source identity across later profile changes. A pending claim reports Running until lease expiry, then resolves to Unavailable. Client retains the saved operation until a terminal outcome. Do not claim a call failed merely because its successful acknowledgement was lost.

Rules assessments and manager review use their own exact input/version-bound recoverable commands. A successful RF request retains its source-aligned rules assessment atomically with the experiment; an RF Unavailable outcome may retain known rule signals and its warning. A rule-only request must work for closed shipments or missing model configuration without masquerading as an RF start. Review conflicts use explicit versioning and retain prior review events. No saved intent is silently discarded on reload, role switch or malformed reply.

## Verification and demonstration

Before implementation, capture the new plan's own working-tree/protected/private/report hashes and ledger in the existing checkout; do not reuse completed plans' `.superpowers` state. Native execution and no commit/push/merge/deploy are already selected. Keep all dataset/output roots ignored and explicit; no outer Git repository.

Verify generator replay, bounds, missing/negative windows, timestamp/equality/closure cases, teacher labels/reasons, family/ancestor separation, feature leakage and TRAIN-only preprocessing. Run small synthetic software fixtures before the single registered full development/evaluation. Verify genuine-model receipts/source pins, frozen parameters/provenance, resource refusal, tamper/timeout/busy and confirmed native cleanup without relaxing limits.

Verify trusted role/assignment/source/version fences, direct-write denial, exact retry/resolve and independent review. Browser demonstration uses fresh disposable product/warehouse/handover/transport/dispatch fixtures through existing controls. Show Low→one observed failed attempt/Medium→retry/second failure/High on a coherent shipment, separate manager acknowledgement, rule reasons, model-unavailable fallback, saved reply/reload recovery and terminal rules-only history. Use non-scientific software fixtures, not consumed TEST rows, to demonstrate the interface. Take desktop/390px screenshots, check overflow and errors, then delete only owned fixtures and prove existing documents/Auth/Storage/configuration/balances unchanged.

Preserve then-current emulator state before any owned service restart. Run both original smoke/QA and affected stock/parcel/delivery suites sequentially against one stack, appropriate native/contract tests, generated-copy/source-pin checks, build/lint with no new warnings, tracked/history/expanded/outer secret scans, ignored-artifact and local-link checks. One fresh final code review and bounded fixes accompany Native implementation. Update roadmap, user guide, report traceability, MSI setup and handover with measured metrics/latency, demo instructions and limitations. No production or external messaging.

## Explicit gaps and exclusions

No actual weather/traffic feed, distance-to-destination derivation, route-history model, continuous GPS-triggered prediction, paid API or external manager notification is included. UC-DM-04's richer context remains a documented demo limitation; this design implements the narrower selected-field FR-8/FR-9/FR-11 prototype. Missing facts are never invented from an address or treated as zero. Parcel camera evaluation, inventory retraining, Olist confirmation/richer features, Isolation Forest, Gradient Boosting and additional features remain for later.

The project demonstrates policy-trained risk classification, not scientifically established forecasting. Real-world accuracy, calibrated probabilities and independent labels are not claimed. The report must disclose this target interpretation and any difference from the broader use-case description. Acknowledging a demo risk does not establish physical truth or assign fault/compensation.

## Builder choices and approval boundary

Builder proposals to approve in this document:as-of judgement target/AI-authored rubric,10-column feature contract and bounds,300families×4snapshots/grouped70/15/15 split,11-fit registry/resource caps, separate rule weights/thresholds, dedicated local service and recoverable review flow. These are not presented as user-supplied numbers. File/module names, index layout, low-level serializers and fixtures may be refined within the stated contracts. Dataset/model/protocol identities must be frozen before fitting; no changes after exposed validation/TEST without a separately versioned prospective decision.

The fresh builder check returned **nothing important left**, and the user approved the written design. The Native implementation plan is now prepared for review. No generation, training, source-bound service change or application functionality was implemented during design/planning. The route/data/design choices are settled; do not ask again about simulation, model family, written-design approval, Native execution or production qualification.
