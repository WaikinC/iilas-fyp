# Delivery-risk FYP demonstration — 24 October 2026

## Meaning and inputs

The approved demonstration uses a fitted Random Forest with Low, Medium and High **as-of triage policy** classes. It learns an explicit AI-authored synthetic policy, not future actual delivery outcomes. The generator creates1,200 causal snapshots in300 shipment families; related views remain together in210/45/45 train/validation/test families. The frozen model uses ten columns derived from eight facts: expected duration, elapsed time, failed attempts, verified proof, event count, parcel count, age of last update and current active status. It does not use shipment IDs, outcome labels or future events.

The original reports request delivery-risk RF, separate abnormality detection and human review. The broader weather, traffic, route and intended-use forecasting inputs are not available in this demonstration. The public Olist purchase-time binary experiment remains a separate historical benchmark.

## Staff workflow

1. Use literal `http://127.0.0.1:5173` or `http://localhost:5173` with the configured local emulators.
2. Prepare, pick, pack and hand over a demonstration shipment, assign transport and dispatch normally. AI analysis does not bypass these steps.
3. In Delivery Monitoring, open **Delivery AI demonstration and rule assessment**. Check the trusted server-observed facts and explicit unknowns. Confirm that the records are demonstration data.
4. **Analyse delivery demo** requests the frozen local RF. All three scores are uncalibrated class proportions; the selected class and original input snapshot are retained. Missing or changed source, timeout or invalid output retains Unavailable, never an invented Low.
5. **Save separate rule assessment** retains known abnormality reasons independently of the model. Incomplete facts produce unknown score/severity. High and data-review items enter the follow-up queue.
6. A different Admin or Manager can record Acknowledge or NeedsFollowUp with notes. Each review has a version and immutable event; model class, scores and synthetic provenance remain unchanged. No notification, supplier message, delivery action or stock change follows automatically.
7. When a response is lost, check the same saved operation before creating another. Saved operations belong to the original actor, shared system, tab and action. Do not delete malformed saved data; reconcile it.

Closed Delivered/Returned shipments retain history and separate rules but have no new RF facts. Legacy generic prediction history remains in Reports and Verification.

### Reading the scores

The MSI development interface gives each saved result its own label and next step. Open **How to read the model scores** to compare the Random Forest’s Low, Medium and High class scores for the same observation. A high model score is a prompt for staff to inspect the saved facts.

The separate rule assessment adds **30** points for an overdue active delivery, **25** for two or more failed attempts, **20** for a delivered shipment without matching proof, **15** for invalid status history and **10** for an active delivery whose last update is over 24 hours old. With complete facts, **0–19** points is Low, **20–49** is Medium and **50+** is High. With incomplete facts, the record shows the rules that could be matched and leaves the total unavailable. An invalid status sequence can independently require review.

## Frozen study and interpretation

One bounded development phase fits four RF, four DT, two logistic-regression and one majority-Dummy candidates. Selection uses validation macro-F1; there is no refit on validation or TEST. One held-out evaluation on180 snapshots/45 families measured RF98.33% accuracy, macro-F1.9840, High precision97.37% and recall100%. DT accuracy99.44%, LR92.78%, Dummy43.89%. DT performed better than RF on this synthetic test; RF remains the report's main model. These values measure agreement with the generating policy, not genuine forecasting accuracy or an accuracy guarantee. The family-bootstrap95% accuracy interval is96.11–100%; High precision91.67–100%, recall100–100% in this synthetic sample. These intervals reflect the45 held-out families, not uncertainty under real-world domain shift. Full per-class/confusion evidence remains in ignored study metadata.

## Local runtime and evidence

Dedicated loopback delivery port8002 uses its own token and immutable source/model bindings. Stock8001 and parcel8000 retain their own frozen models and capabilities. The delivery sidecar composes an unchanged schema5 stock/parcel base profile. No secrets, models, datasets, emulator exports or private evidence belong in GitHub.

The Windows supervised worker retains15-second execution,2GiB RSS,3GiB free-RAM startup,1GiB free-disk and bounded-output controls. HTTP may time out while native cleanup drains; Busy/Unavailable remains distinct from a prediction. Never relax a limit to make a test pass.

Ten actual model/Firebase/browser checks pass with exact cleanup, including independent manager revision and lost-reply recovery. Predeclared Low/Medium/High cases predicted Low/High/High; the first-failure disagreement is retained. Early dispatch minute-level inputs can fall outside TRAIN ranges; the UI warns explicitly. These three cases are not an independent accuracy study. Three callable probes took 3.034–3.059 seconds, including 27.17–28.63 milliseconds of RF prediction. Current safe receipt: `outputs/delivery-ai-20261024/delivery-profile-01.json`. Verified checkpoint: `outputs/delivery-ai-20261024/emulator-checkpoint-01`. See outer MSI_SETUP_STATUS.md for restart commands. Export then-current state before any future stop. Physical camera work and other new features remain deferred.
