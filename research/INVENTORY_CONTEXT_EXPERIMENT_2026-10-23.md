# Revised inventory context experiment — completed

23 October 2026. The approved implementation and bounded experiment are complete.
Expanded Random Forest achieved **81.53% accuracy, 0.8080 macro-F1, 79.00% Critical
precision and 87.78% Critical recall** on the new simulated test families.
These are simulation-policy agreement scores, not independent warehouse accuracy.
The application's original six-input model remains unchanged.

The [design](../docs/superpowers/specs/2026-10-23-inventory-context-experiment-design.md),
[plan](../docs/superpowers/plans/2026-10-23-inventory-context-experiment.md) and
[frozen protocol](INVENTORY_CONTEXT_PROTOCOL_2026-10-23.md) define the study.

## Data and evaluation boundary

One new cohort contains 300 fictional stock-ledger families, each with twelve
commitment/supply contexts: 3,600 rows labelled Normal (750), Reorder Risk (1,050)
or Critical Stock Risk (1,800). Development uses 240 families/2,880 rows; testing
uses 60 families/720 rows, with class support 150/210/360. All views and ancestry
remain within one partition, and each grouped development fold holds out 80 families.
Saved ledgers/dossiers were independently replayed and audited for facts, labels,
cutoffs, grouping, duplicates and provenance before training.

Six-input models see stock indicators only. Fourteen-input models additionally see
firm commitment quantity/deadline and incoming quantity/ETA/status, all known at the
cutoff. They receive no teacher decisions or derived shortage label. Every supply
status occurs with multiple labels. Unknown facts are rejected, not filled with zero;
verified absence is explicitly encoded. Reservations are counted once.

All 48 registered CV fits and four final fits completed. Selection used development
macro-F1, then Critical recall and the predefined complexity tie-breaks. Final settings:
RF6: depth 6, minimum leaf 5; RF14: depth 12, minimum leaf 2; DT6: depth 4, minimum leaf 5; DT14: depth 8, minimum leaf 2. Both RFs have 100 trees. All four held-out predictions were
saved before metrics; no tuning or retraining followed exposure. The independent
read-only audit reconstructed metrics and all 500 paired whole-family bootstrap draws
without loading or fitting a model. Predictions and all three completed phase file
inventories were also checked against their frozen hashes.

## Held-out results

Accuracy intervals are 95% percentile intervals from 500 family resamples. The 720
rows are correlated within 60 independent simulated families; they are not 720
independent examples. Critical precision is undefined for RF6/DT6 because neither
predicts Critical. Their stored zero values follow the declared zero-division convention.

| Model | Accuracy (95% family interval) | Macro-F1 | Critical precision | Critical recall | Critical called Normal | Normal given risk alert |
|---|---|---|---|---|---|---|
| RF6 | 45.83% (44.86–46.81%) | 0.4066 | Undefined (no predictions) | 0.00% | 180/360 | 0/150 |
| RF14 | 81.53% (78.54–84.86%) | 0.8080 | 79.00% | 87.78% | 9/360 | 45/150 |
| DT6 | 45.83% (44.86–46.81%) | 0.4066 | Undefined (no predictions) | 0.00% | 180/360 | 0/150 |
| DT14 | 76.94% (74.09–79.93%) | 0.7762 | 80.67% | 73.06% | 19/360 | 33/150 |

RF14 improves macro-F1 over RF6 by **0.4014**, with paired 95% interval
**0.3630–0.4405**, and reduces Critical-as-Normal errors from 180 to 9. This meets
the registered favourable-research rule. RF14 still misses 44/360 Critical cases:
9 become Normal and 35 become Reorder Risk. Of 400 Critical predictions, 84 are
false positives; 45/150 truly Normal cases receive a risk alert.

RF14's 95% intervals are accuracy **78.54–84.86%**, macro-F1 **0.7695–0.8463**,
Critical precision **74.71–83.83%**, and Critical recall **83.61–91.94%**. Although
the accuracy point estimate exceeds 80%, its interval extends below 80%; the study
does not establish a guaranteed 80% floor. RF6/DT6 Critical precision is undefined
in all 500 resamples; no draws were discarded. Other arm/class denominator counts
are retained in the ignored result packet.

The majority and supply-status controls each achieve 50% accuracy/0.2222 macro-F1
by predicting Critical for every row: 100% Critical recall, 50% Critical precision,
and 150/150 Normal false alerts. The exact teacher gets 100% by construction,
because it defines these labels; this is a rule-consistency check, not independent
AI validation. The available<=reorder binary warning gets 70.83% binary accuracy,
100% precision and 63.16% recall for any risk (570 positive rows). Its target differs
from the three-class models, so those accuracies are not interchangeable.

The six-input models see identical stock facts across contexts with different
labels, explaining their inability to separate these risks. This new distribution
is deliberately different from the original app model's 75%/45% Critical-recall
experiment. Do not describe those old and new percentages as a controlled before/after.

## Descriptive RF14 subgroup checks

These overlapping slices are diagnostic, not additional independent tests or a
new tuning set. Critical recall's parenthesized number is its true-class support.

| Slice | Rows | Families | Accuracy | Critical recall (support) |
|---|---|---|---|---|
| buffer:above | 360 | 30 | 79.17% | 92.78% (180) |
| buffer:at-below | 360 | 30 | 83.89% | 82.78% (180) |
| history:ninety-days | 120 | 10 | 85.83% | 86.67% (60) |
| history:older-than-window | 120 | 10 | 79.17% | 81.67% (60) |
| history:ordinary | 120 | 10 | 82.50% | 88.33% (60) |
| history:quarter-day | 120 | 10 | 79.17% | 86.67% (60) |
| history:same-day | 120 | 10 | 75.83% | 91.67% (60) |
| history:zero-activity | 120 | 10 | 86.67% | 91.67% (60) |
| status:confirmed | 240 | 60 | 81.67% | 85.00% (120) |
| status:disrupted | 120 | 60 | 84.17% | 91.67% (60) |
| status:none | 120 | 60 | 87.50% | 96.67% (60) |
| status:planned | 240 | 60 | 77.08% | 84.17% (120) |

Each context view has 60 rows from 60 families. The weakest are planned timely
sufficient replenishment (view6, 60% accuracy) and confirmed timely sufficient
replenishment (view5, 66.67%). Neither slice contains a Critical label, so Critical
recall there is undefined, not a measured 0% detection rate. Timely insufficient
confirmed/planned supply (views8/10) each has 76.67% Critical recall on 60 Critical
cases. These findings describe frozen results only; no test-driven model revision
was made. Complete four-arm subgroup/confusion evidence remains local.

## Runtime, storage and retained evidence

Preparation completed in 16.74s (115.48MiB peak supervised RSS); development in
275.52s (252.32MiB); evaluation in 51.05s (203.71MiB). All phases and 52 fit workers
exited successfully with confirmed native process-tree cleanup. Limits remained
2GiB supervised RSS, two threads, 3GiB startup free RAM, 1GiB free disk, 60s per fit,
900s development and 120s preparation/evaluation. Combined retained v2 evidence
is 26,198,259 bytes (24.98MiB), below the 100MiB cap.

Four final weights use lossless joblib compression. CV retains parameters, inputs,
probabilities, model digests/sizes and native receipts, but not loadable weight
objects. Temporary CV serialization stays in supervised RAM. Conservative admission
reserves remaining space without assuming compression savings. This resolves the
plan's retain-every-estimator wording against the binding 100MiB limit; the cost is
that individual CV models cannot be reloaded from this packet.

One Minor review finding remains: recorded timings combine model loading, encoding
and batch prediction. Separate prediction-only/per-row measurements and complete
timing consistency checks in the public audit are deferred. They are not app response
time or independently audited inference speed. The frozen file inventories were
checked separately during final verification, without changing the audit implementation.

All row-level data, weights and detailed evidence stay ignored under
`research/datasets/inventory-simulation-v2/` and `outputs/inventory-context-20261023/`.
Manifest SHA-256: `06b22b1c46e4d0c6dba6439abe4a00363c36be4424062fa678b5a34efd84d414`.
Completed directories are `main-01`, `development-01`, and `evaluation-01`.
The three fixed phase claims are consumed; never reset, resume, replace a seed or
rerun test evaluation. Read-only audits are available through
`research/inventory_context_cli.py audit-data`, `audit-development`, and
`audit-evaluation` with the exact paths/hash. Final prospective pins are preserved
in `.superpowers/sdd/2026-10-23-inventory-context-experiment/final-source-pins-launcher.json`.

## Software verification and review decisions

The broad research rerun passed 58 modules/997 cases, with 14 optional skips.
Its preceding run exposed an unchanged legacy fixture's 270-character temporary
path; shorter local TEMP fixed that invocation without editing legacy code.
Both logs are retained. Final review's two Important findings—classifier tie
semantics and storage admission—were fixed and regression-tested. A real preparation
attempt then exposed the Windows virtualenv launcher being counted as another run.
It stopped before creating a claim or data. The native regression reproduced that
failure, and the fix excludes only the verified direct launcher with matching
command, executable pair and creation ordering. Independent/sibling training
processes remain blocked. All six affected modules then passed 42 focused tests,
including 11 native artifact tests. The earlier broad total is not relabelled as
a fresh full-suite run after this narrow correction.

Build passes; lint has zero errors and six existing image warnings. Tracked,
historical and expanded-source secret scans pass. Final hash/ignore checks preserve
all ten protected original scientific/serving artifacts, app source and private
configuration. No staged changes, Git publication, Firebase writes, service restart,
production change or app-model replacement was performed.

Native execution used the approved existing dirty checkout and a baseline-scoped
working-file review because no commits were authorised. Existing unrelated changes
were preserved; this is not a whole-checkout review. The reviewer inspected evidence
but did not independently rerun tests; root ran the recorded verification. The
workspace/ledger and failed-admission evidence are retained for reproducibility.

## What remains

The research experiment is complete; the full stock AI feature is not independently
validated or operationally approved. A separately reviewed experimental 14-input
adapter and serving manifest would be needed before using this model in the app.
The existing six-input app must not receive the new weights silently.

Real use still needs genuine qualified history, reliable cutoff-time commitments
and replenishment facts, independent labels and intended-use evaluation. Synthetic
teacher rules can be applied exactly, so this study does not show an advantage over
an independently validated deterministic policy. Twelve templates, one commitment
deadline and one incoming batch cannot establish performance for multiple deadlines,
partial arrivals, uncertain supply or seasonal demand. The local readiness audit's
zero qualified histories remains unchanged. Camera, delivery AI and additional
features stay deferred. No further tuning should reuse this exposed test set.
