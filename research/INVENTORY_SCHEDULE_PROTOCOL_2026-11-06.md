# Inventory schedule outcome experiment

Study `inventory-schedule-outcome-3.0`, registered 6 November 2026. This is a local comparison on a new synthetic outcome target. The frozen inventory demo and its earlier 720-row test are separate evidence.

## Data and cutoff

Use 240 new simulated stock families in the `IS3` namespace, four related views per family. Families 0–179 are development, split into three non-overlapping validation folds. Families 180–239 are reserved for one evaluation after the development artifacts are sealed. Freeze the generator and seed domains in source. The development command generates only its own families. Both arms train and predict on identical rows.

No previous ledger is copied. Fictional cutoff timestamps start 365 days after the previous simulation epoch. Ledger, recorded schedule and realized outcome use separate seeds 2026110601, 2026110602 and 2026110603. Each seed is multiplied by 10,000 before adding the family number for ledgers, or ten times the family number plus view number for schedules and outcomes. Seed 2026110604 shuffles development family numbers into three groups of 60. The full generator is pinned as experiment source.

Use stock, firm commitments and scheduled replenishment facts available at the scenario cutoff. The baseline receives the established fourteen fields using the first firm commitment and first incoming batch. The schedule arm adds numeric timing and quantity summaries computed from the known schedule. Future receipts, future demands, actual outcomes and label reasons are excluded from model inputs.

The five added predictors are first due day minus earliest incoming ETA, confirmed incoming quantity scheduled by the first due day, total firm quantity due by day seven, total firm quantity due by day fourteen, and confirmed incoming quantity scheduled by day fourteen. Slack is zero when either schedule is absent. These summaries use recorded facts only, with no shortage flag or teacher decision. Available units exclude reservations once. The baseline is refit on these same scenarios because the outcome definition differs from the earlier teacher's labels.

Generate realized future events from a separate random stream. After the 14-day simulated replay, label unmet due demand as Critical Stock Risk. For fulfilled demand, label the scenario Reorder Risk when its ending stock is at or below the recorded reorder level. Label the remaining scenarios Normal. This outcome is a generated research proxy for warehouse decisions.

Confirmed, planned and disrupted batches have 8%, 30% and 70% cancellation probabilities and respectively 0–3, 0–5 and 2–7 days of delay when they arrive. Realized supply ranges from 65% through 100% of planned units, rounded down. There is an independent 35% chance of unplanned demand on days 1–14. Arrivals are credited before the same day's due demand. These AI-assisted simulation choices and generated labels do not measure warehouse accuracy.

## Fixed comparison

Both arms use the same fixed balanced Random Forest settings from the existing RF14 experiment, 100 trees, maximum depth 12 and minimum leaf size 2, with argmax decisions. Run six grouped development fits and two final development fits. Keep the models and scores for both arms. The final fits use only development families. Fix features, labels, groups and hyperparameters before releasing reserve rows. Use the existing development and evaluation resource guards. Store private runs in ignored directories with exclusive phase claims.

The fixed estimator uses Gini, seed 42 and two jobs. There is no threshold or hyperparameter search. Development reserves one native Windows worker at a time, three GiB available RAM, one GiB free disk, two GiB process-tree RSS, 60 seconds per fit, 900 seconds total and 100 MiB output. Preserve failures and do not retry by changing destinations. The frozen output binds source, versions, receipts, grouped choices and both final weights before any holdout generation.

The one-time evaluator verifies the sealed development state, acquires its own claim and then generates the reserved families. Save both sets of predictions before computing metrics. Compare accuracy, macro-F1, Critical precision and recall, Critical cases called Normal and alerts on Normal cases. Report denominators and any undefined precision. Report paired uncertainty by resampling whole families if interval reporting is enabled. Interpret any improvement as performance on this simulator. Real warehouse outcome validation is a separate qualification.

