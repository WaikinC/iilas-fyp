# Local simulated delivery-risk contract — 24 October 2026

The report-aligned experimental path is separate from generic prediction history and the existing inline delivery warnings. RF protocol `delivery-demo-inference-1.0`, triage policy `delivery-triage-policy-1.0`, rule policy `delivery-abnormality-rules-1.0`. Current local demonstration records contain no genuine independent risk labels.

## Trusted source

Only Approved Admin, Manager, Logistics and the currently assigned Driver may request new model/rule analyses. Driver assignment must match shipment and transport plan. All Approved shared staff can read retained public results. The server reads shipment, plan, delivery, bounded1001-event query and matching evidence at one observation time; more than1000 events refuses model facts. Empty delivery plus proven-empty event query is a legitimate newly Dispatched state. Missing delivery with events, invalid/future event history, inconsistent counters/time or nonpositive expected window cannot become a model input. No silent clamping or fabricated zero history.

The eight facts produce ten columns including three active-status indicators. Closed Delivered/Returned records support history/rules only. Proof must be matching registered Proof of Delivery with an admitted timestamp. Weather, traffic and route providers are not called or invented.

## Exact requests and publication

New intents contain only operationId(UUIDv4), shipmentId and demoAcknowledged:true. The backend derives all inputs. A45-second claim prevents duplicate inference; a25-second outbound deadline and35-second client observation preserve uncertain intent. Native execution is15seconds with confirmed Job cleanup. The final transaction checks source/configuration/lease and current authority. Terminal outcomes remain recoverable by their original currently Approved actor after assignment/role/profile changes. Unknown resolves create cancellation tombstones. Revoked or foreign-scope access remains denied.

One atomic publication writes `deliveryAIExperiments`, source-aligned `deliveryAbnormalityAssessments`, private terminal receipt and audit. Private `deliveryAIRequests`, `deliveryAssessmentRequests`, `deliveryReviewRequests` are unreadable/unwritable to all clients. Public result collections permit only approved shared reads; all direct writes are denied. No stock, order or delivery status changes follow from analysis.

## Separate rules and review

Rules score overdue30, repeated failure25, missing delivered proof20, invalid sequence15 and stale active update10. Low<20, Medium20–49, High>=50. Unknown facts yield null score/severity with known matches retained. Invalid sequence explicitly requires data review even at Low15. Closed records stop time-based alerts. RF timeout/range warnings and data-review flags remain visible independently of manager acknowledgement.

A different Admin/Manager reviews exact AI/Rules target and expected review version with Acknowledge or NeedsFollowUp plus notes. Append-only review events preserve original source, class, probabilities and provenance. Acknowledge clears queue eligibility; NeedsFollowUp retains it. Human review never promotes simulated labels to independently validated accuracy or operational model acceptance.

## Presentation and recovery

Delivery Monitoring retains all three named uncalibrated scores, original observation facts/model/source/policy identity and separate rule reasons/unknowns. History and queue use20-record bounded pages. Saved actor/tab/scope/action recovery appears above the filtered shipment list, including after Driver reassignment; malformed saved data remains for reconciliation. Current context and original result facts are distinct.

## Local capabilities

Delivery8002 has its own token/source manifest; stock8001 and parcel8000 preserve separate authentication and frozen models. A fresh delivery sidecar binds an unchanged schema5 base profile byte hash. Research launch roles do not inherit other service tokens/capabilities. Only emulator/demonstration execution is admitted; no production action is authorised.
