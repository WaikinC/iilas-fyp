# Inventory context experiment v2 — frozen recipe

Protocol `inventory-context-experiment-2.0`; teacher `assistant-context-policy-2.0`.
This document fixes the simulation and analysis before scientific generation.
AI-authored simulated labels measure agreement with a policy, not independent
warehouse accuracy. Independent human review, independent accuracy validation and
operational approval are false. The serving app model is unchanged.

## Source and population

Wong Ric Hang's original report SHA-256:
`5a89babe5d204fbf784c1bb10b3c7634d9012d68d9a294b6574f4d04ed281b93`.
The approved design is [inventory context experiment](../docs/superpowers/specs/2026-10-23-inventory-context-experiment-design.md).
Six existing stock indicators remain; eight factual commitment/supply indicators
are an implementation extension. No prior test observations are read.

Seeds 2001–2005 each create 60 families: twelve strata, five ordinals (0–4).
Stratum index is twice the history index plus buffer index (above, at-below).
History order: same-day, quarter-day, older-than-window, zero-activity,
ninety-days, ordinary. Identity is `IC2-{seed}-{stratum:02}-{ordinal:02}`;
ancestry is `inventory-context-v2-` plus identity.

Stock RNG is Python `random.Random(seed*100000 + stratum*100 + ordinal)`.
Cutoff is 1792728000000 plus `(seed-2001)*60000 + stratum*5000 + ordinal`
milliseconds. These tiny deterministic offsets distinguish otherwise identical
independently constructed zero-stock histories; clocks are not model inputs.
Opening/complete coverage start is 120 days earlier. The designated receipt is
0, 0.25, 31, 45, 90 or a uniform integer 1–29 days old. The ordinary-age RNG draw
occurs for every stratum before quantity draws, as encoded by the generator.

For nonzero families, opening stock is uniform integer 320–2000, reserved 0–60,
receipt 20–80. Except the zero-activity regime, draw 1–5 neutral activity cycles.
Each uses uniform quantity 1–5 and occurs 29 minus cycle-index days ago:
adjustment increase/decrease, reservation/release, transfer A→B→A, in that order.
Only the designated receipt changes net stock. Warehouse-reserved is zero.
For ordinal 0 in each low-buffer stratum (30 families), opening stock/reserved
are zero; a receipt of 20–80 is followed by a full issue at the same time.
No neutral cycles are added, preserving zero stock and older activity dates.

Draw margin 0–100 after events. Above-buffer R is max(0,A-max(1,margin));
low-buffer R is A+margin. Stock is fixed before context and labels. There is no
rejection sampling, replacement seed, class-based stock repair or result-driven retry.

## Twelve contexts for each fixed ledger

Context RNG is `random.Random(seed*1000000 + stratum*1000 + ordinal + 17)`.
Draw deadline 0–14, timely ETA 0–deadline, late ETA deadline plus 1–7,
shortage gap 2–100, sufficient quantity gap plus 0–100, covered demand 0–A.
Thus ETA is 0–21; sufficient quantities can equal the shortfall and timely ETAs
can equal deadlines. Insufficient quantity is exactly gap minus one.
All values are uniform integers and drawn in this stated order.

| Views | Additional demand | Supply |
| --- | --- | --- |
| 1–4 | Covered demand | none, planned, confirmed, disrupted respectively |
| 5 | A+gap | confirmed, timely, sufficient |
| 6 | A+gap | planned, timely, sufficient |
| 7 | A+gap | confirmed, late, sufficient |
| 8 | A+gap | confirmed, timely, insufficient |
| 9 | A+gap | planned, late, sufficient |
| 10 | A+gap | planned, timely, insufficient |
| 11 | A+gap | disrupted, otherwise timely and sufficient |
| 12 | A+gap | none |

No supply means quantity 0 and raw ETA null. Zero demand means raw deadline
null. Other deadlines are known at cutoff; reserved commitments equal ledger
reservations and additional demand excludes them. Unknown fields are rejected.

Teacher: if D<=A, apply current buffer (Reorder if A<=R, else Normal).
If D>A, confirmed timely sufficient supply applies the same buffer; planned
timely sufficient supply is Reorder; all other cases are Critical Stock Risk.
Totals: 300 families, 3600 views, 750 Normal, 1050 Reorder, 1800 Critical.
Every status appears with multiple classes. This balance is constructed.

## Splits and predictors

Sort history/buffer tuple strata lexically; sort family IDs within stratum.
One RNG seed 2042 shuffles each successive stratum of 25: first 20 development,
last 5 test. One independent RNG seed 2043 shuffles each stratum's development
list; assign round-robin starting at stratum index modulo 3. Persist assignments.
Development: 240 families/2880 views. Test: 60/720, class counts 150/210/360.
Each validation fold has 80 families; train has 160. All twelve views and
ancestors remain together. No content-identical renamed ledgers cross families.

Ordered six: available_quantity, reserved_quantity, movement_frequency,
reorder_distance, adjustment_count, days_since_replenishment.
Append: additional_firm_quantity, additional_due_days, incoming_quantity,
incoming_eta_days, supply_none, supply_planned, supply_confirmed, supply_disrupted.
Verified absence deadlines encode as zero; unknown data never does. Both arms
use the same fully eligible rows. Metadata, labels, reasons and derived shortage
flags never enter the matrices. No scaling or learned encoder.

## Fit and evaluation budget

RF6/RF14: 100 trees, depths 6/12, minimum leaves 2/5, balanced weights,
seed 42, two jobs. DT6/DT14: depths 4/8, leaves 2/5, balanced weights, seed 42.
16 settings × 3 folds = 48 fits plus four final fits = maximum 52.
Select mean-fold macro-F1, then Critical recall, then smaller depth, then larger
leaf. Controls: synthetic teacher, training-majority, training-status lookup
(ties in Normal/Reorder/Critical order); binary A<=R is separate.
Estimator predictions preserve sklearn's alphabetical class tie order
(Critical Stock Risk, Normal, Reorder Risk), even though probabilities are displayed
in the report's Normal/Reorder/Critical order. Controls retain their separate rule.

Freeze four models and training controls before one-time test release. Persist
all four predictions before metrics. Report accuracy, macro-F1, per-class
precision/recall/F1/support, confusion matrices, Critical-as-Normal, false alerts
and history/buffer/supply subgroups. Primary paired comparison: RF14 minus RF6;
DT is descriptive. Zero denominators use zero and explicit undefined counts.
Family bootstrap: 500 draws, seed 2044, sample 60 family IDs with replacement;
retain each family's 12 rows together and use common draws for all arms.
Store all metrics and paired differences; linear 2.5/97.5 percentiles.
No test-based tuning, calibration, threshold selection or app promotion.

One native job at a time, 3 GiB free RAM and 1 GiB free disk admission,
2 GiB parent/descendant RSS, two threads, 60 seconds per fit, 900 seconds
development, 120 seconds preparation/evaluation, 100 MiB combined outputs.
Confirm signalled process handles and empty Windows Job membership within
three seconds before reuse. Unknown cleanup quarantines execution. Exclusive
phase claims persist on failure. Public commands have no resume/force/limit bypass.

Storage strategy fixed before scientific generation: serialize every estimator
losslessly with joblib zlib level3 in supervised process RAM. Retain only the four
final estimator files. CV retains input/parameter lineage, compressed-model digest
and byte count, probabilities, metrics and native receipts; CV serialized bytes
are temporary RAM, never temporary disk files. This preserves four-model evaluation
and all selection evidence while avoiding retention of48 unneeded CV weight files.
The approved design's100MiB ceiling takes precedence over the plan's broader
per-fit estimator-retention wording; this resolution is recorded in the Native ledger.

Before consuming development, reserve the existing cohort/registry bytes plus the
four final models' worst-case50,760,336 array bytes (pinned sklearn nodes64B plus
three float64 values24B),8MiB for serialization overhead, and8MiB each for jobs,
predictions, ledger/bootstrap analysis, and logs/registry/headroom. No compression
savings are assumed. The current job-matrix projection is6,941,884 bytes and cohort
payload5,564,193 bytes; manifest/registry bytes are measured at admission. At7MiB
already present, the reserved peak is100,043,408 bytes, below104,857,600. A larger
existing footprint that exceeds the ceiling refuses before claiming or fitting.
The live combined-byte and process-RSS guards remain active throughout.

The implementation is pinned with installed Python/package versions, all six
v2 modules, this protocol, unchanged ledger/runtime/cleanup helpers, stock/location
helpers and the original report hash. Cohort/model/prediction artifacts stay ignored.
Final interpretation remains synthetic policy agreement; real history, multiple
commitments/batches, uncertainty, seasonality and independent labels are not covered.
