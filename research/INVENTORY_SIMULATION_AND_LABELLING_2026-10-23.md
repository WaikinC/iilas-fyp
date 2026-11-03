# Inventory simulation and labelling plan

Date: 23 October 2026, Asia/Kuala_Lumpur. Protocol: `inventory-simulation-1.0`.
Status: written research protocol; no generator, dataset, labels, split or fitted model produced by this task.

Implementation continuation, 23 October: the user subsequently authorised the offline pilot generator/validator. The [pilot guide](INVENTORY_SIMULATION_PILOT_2026-10-23.md) records that bounded implementation and verification. The original planning boundary above describes the earlier planning task; human labels, main data, splits, fitting and integration remain pending. No public sales dataset was adopted.

## Purpose and authorisation

Prepare an achievable prototype experiment for Wong Ric Hang's Stock Management classification: Normal, Reorder Risk and Critical Stock Risk. Random Forest is the main candidate, Decision Tree the comparison, and existing stock rules remain a separate operational aid. This assesses current stock condition, not future-demand forecasting.

The user explicitly authorised simulated inventory data and requested this plan and verification on 23 October. This supersedes the earlier public-datasets-only restriction **for this inventory simulation work only**. It does not authorise production access, harvesting real business records, changing balances, publishing data, running another AI task or resuming the parcel camera trial. Preparing this protocol does not approve a fitted model for operational use. Dataset generation, human review, fitting and integration remain future stages.

## Report evidence and implementation choices

Authoritative saved source: [Wong's original portfolio](../../fyp-cwk-2/resources/sources/project-1-2026-10-07/Project%20I%20Portfolio-WongRicHang.docx). Resolve this source from the outer workspace as `fyp-cwk-2/resources/sources/project-1-2026-10-07/Project I Portfolio-WongRicHang.docx`; the link above is relative to this research directory.

Source SHA-256: `5A89BABE5D204FBF784C1BB10B3C7634D9012D68D9A294B6574F4D04ED281B93`.
Connected source: [Wong portfolio on Drive](https://drive.google.com/file/d/17HlQBr8J4orQIfy-adEUBmuWLTiD5BTM/view). Evidence here refers to the saved original, not an assertion that the online document has not changed.

| Report section | Requirement | Protocol decision |
| --- | --- | --- |
| Chapter 2, Inventory Data and Feature Preparation | Carefully prepared simulated stock scenarios can train/test a student prototype; disclose limitations. | Use a separate, entirely simulated event ledger and reviewed case dossiers. Never mix scores with public or real-record cohorts. |
| Chapter 2, selected technique; Chapter 3 FR-10 | RF main model, DT baseline; three stock-risk classes. | Compare both on identical partitions, plus the existing binary rule warning as a limited baseline. |
| Chapter 3 section 3.2.5 | Use available, reliable indicators; do not invent unavailable real features. | Keep the existing six-feature contract for this first experiment. Complete simulated history is known by construction; this does not certify real application history. |
| Chapter 2, Model Training and Evaluation | Proposed 80/20 split; accuracy, precision, recall, F1 and confusion matrix; emphasise risk recall/F1. | Grouped approximately 80/20 development/test, with validation inside development and one final test release. |
| Chapter 2 risk definitions; Chapter 3 use cases | Risk is decision support; no automatic procurement approval. | Critical needs documented likely fulfilment impact; keep human decisions and rules separate from model output. |

The report does not mandate the exact six-column list, the cohort sizes, seeds, simulation ranges, review percentages or resource limits below. These are explicit project protocol choices. No numeric performance guarantee or supervisor approval is inferred from the report.

## Data design and simulation constraints

Use fresh local-only paths beneath `research/datasets/inventory-simulation-v1/`, with pilot and main subdirectories. These paths must be untracked and ignored before any write. Refuse existing destinations, symlinks/junctions and paths outside the allowed tree; never overwrite earlier datasets or artefacts. Do not copy real products, accounts, SKUs, customer data, timestamps or emulator exports as scenario seeds.

Generate fictional whole-unit products, an opening balance, events and a single stock-review cutoff per independent family. Retain a valid Receipt at or before the cutoff, including receipts older than 30 days. Record complete events since opening, which must precede the 30-day window. An opening balance alone is not a replenishment receipt. Main classification candidates require a complete window and known eligible receipt; missing-receipt, corrupt, future-dated and incomplete-history cases belong in a separate software challenge set, with no forced risk label or zero imputation.

Initial finite pilot envelope: opening age 45-180 days; on-hand and reserved balances 0-5,000 units; reorder level 0-1,000 units; eligible last-receipt age 0-120 days, always within the simulated lifetime; at most 200 committed ledger events in the preceding 30 days. Replenishment lead time and planning context are fictional and recorded explicitly. Draw magnitudes and activity across all intended risk regimes rather than encoding the target through disjoint ranges. These are engineering bounds, not empirical demand estimates; pilot review can revise them before the main version is frozen.

Replay events in deterministic `(timestamp, event_id)` order. Enforce the real accounting rules after every event: `0 <= warehouseReserved <= reserved <= onHand`, nonnegative per-bin balances and aggregate agreement, maximum 1,000,000 units per quantity. Available is on-hand minus reserved **once**. Receipt adds stock; an unreserved Issue reduces stock only within available units; reservation/release change commitments without adding or removing stock; internal Transfer changes bins without changing total on-hand; Adjustment uses signed units and preserves protected stock. Corrections reference originals and retain both original and reversal ledger entries rather than deleting history. Implement event semantics against the existing stock/location contract, not a new accounting interpretation.

All input features use only events at or before the cutoff. Never use realised future deliveries, subsequent actual stockouts, future receipts or final outcomes as predictors or as disguised feature fields. A dossier may show firm commitments, documented replenishment plans and lead-time assumptions already known at cutoff. Mark planned and confirmed receipts distinctly; a future plan is not the last actual Receipt.

### Fixed first-experiment feature dictionary

Feature definition: `inventory-simulation-features-1.0`, with explicit alignment to `inventory-stock-snapshot-1.0`. Synthetic coverage is declared in dataset metadata; it must not update application coverage flags.

| Input | Calculation at cutoff | Validation |
| --- | --- | --- |
| available_quantity | on-hand minus reserved | Finite nonnegative whole units; no double subtraction. |
| reserved_quantity | Existing confirmed reservation balance | Finite nonnegative whole units, at most on-hand. |
| movement_frequency | Count committed Receipt, Issue, Adjustment, Reservation, Release, Transfer and Correction records in inclusive `[cutoff - 30 days, cutoff]` | Whole count, not sales volume; unique event IDs. |
| reorder_distance | available minus reorder level | Signed whole units; negative values are valid. |
| adjustment_count | Count records whose type is Adjustment in the same window | Whole count, at most movement_frequency; Correction counted separately in dossier. |
| days_since_replenishment | `(cutoff - latest eligible actual Receipt time) / 86400000` | Finite nonnegative days, retain fractional days; ignore reversed receipts and hold pending/ambiguous corrections. |

IDs, family/regime names, filenames, evidence text, labels, reviewer fields, scope, future plans/outcomes and split indicators are metadata, not model inputs. Exact model-column order is the table order above, matching `research/models.py`.

### Scenario coverage

Cover these eight regimes with overlapping stock magnitudes and varied reservations/activity: acceptable stable operation; high activity with adequate coverage; low activity with modest stock; replenishment review near/below reorder; sustained depletion requiring replenishment; high reservations with plausible recovery; likely near-term fulfilment shortfall; disrupted replenishment with likely fulfilment impact. They are design strata, not automatically assigned gold labels.

Include counterexamples to shortcut learning: zero available stock with no current commitments versus zero with urgent uncovered demand; low stock with a dependable timely replenishment versus delayed/uncertain replenishment; high stock with high commitments; high adjustment frequency with explained reconciliation. Distinguish current known context from future realised facts.

Where a commitment is already represented in reserved units, compare it with on-hand/allocated supply once; do not subtract it again from available. Any additional unreserved firm commitment must be identified separately and justified. Unrelated Draft shipments are not firm demand. New prototype simulation uses fictional equivalents only.

## Labelling rubric and evidence

Store a cutoff-time dossier for each case containing frozen stock facts, full simulated history/receipt lineage, coverage proof, known commitments and timing, replenishment confidence/lead time, uncertainty and source hashes. Reviewer sees the evidence, not the generator's intended class, regime name, rule recommendation, split assignment or model prediction. Use randomised case IDs/order; keep intended regimes in a separate sealed design manifest.

| Decision | Required evidence | Insufficient on its own |
| --- | --- | --- |
| Normal | Documented current stock/commitment/replenishment context supports acceptable operation and routine monitoring. | Stock above reorder; zero activity; generator says Normal. |
| Reorder Risk | Evidence supports reviewing or initiating replenishment without enough evidence of likely fulfilment impact for Critical. | Blindly mapping every negative reorder distance to this class. |
| Critical Stock Risk | Specific known commitment/time or justified depletion/replenishment context supports likely fulfilment impact without corrective action; record impact and urgency. Already missed fulfilment is not required. | Zero/low stock, high reservations or a delayed PO alone. |
| Unresolved | Missing context, conflicting evidence or a judgement that cannot be defended. | Never turn uncertainty into Normal or a fourth trained class. |

Critical takes precedence when justified. Reorder is next; Normal requires affirmative evidence. Labels describe the scenario assumptions, not measured warehouse truth. A formula may tag an intended regime for sampling, but may not populate accepted labels or adjudicate disagreement. Model predictions and existing threshold rules cannot serve as ground truth.

Record `sample_id`, `family_id`, `reviewer_id`, rubric version `inventory-simulation-rubric-1.0`, label or null, review status, rationale, evidence references, likely impact when Critical, review timestamp and immutable revision ID. The observation row's `labeler_id` identifies the reviewer/adjudicator of its accepted revision and its `evidence_ref` points to that preserved review/dossier; the review log retains all original reviewers. Preserve individual original judgements and subsequent adjudication. No label preselection. A second assistant pass is advisory, not an independent human review.

### Pilot, review effort and independence

1. Begin with 60 candidate independent families, aiming to expose roughly 20 intended examples per class. Intended balance is not a promised final class distribution. One primary cutoff per family keeps review manageable. No fitting on this pilot.
2. Human reviewer examines every pilot dossier. Independently double-review all pilot cases if a second reviewer is available; otherwise record single-review status and hold claims of independent annotation. User/partner/supervisor identities remain pseudonymous in data.
3. Review all ambiguous/disputed cases; retain Unresolved when evidence cannot settle them. Report raw agreement and a confusion table, not just final adjudicated agreement. Do not invent second-review approval.
4. Use the pilot to freeze ranges, rubric, feature formulas, scenario construction and generator version. Exclude all pilot families/variants and reused base histories from the main evaluation cohort.
5. Only after pilot review, prepare up to 300 new main candidate families, aiming at approximately 100 per intended regime-class bucket. This is a bounded experiment budget, not proof of sufficient sample size. One primary row per family; all variants share that family.
6. Review every main candidate before split assignment. Independently double-review every eventual test dossier and at least 20% of development dossiers, selected prospectively, plus all disputes. Freeze adjudication before test prediction release. If the second reviewer is unavailable, keep the evaluation explicitly provisional rather than silently claiming independence.

No automatic replenishment of rejected cases until a desired score is reached. Before opening test predictions, report accepted/unresolved/excluded counts by design stratum and class. If class support is too small, publish the feasibility result or predeclare a new version; do not repeatedly reseed until a convenient split appears. No arbitrary number of generated rows guarantees accuracy.

## Leakage, identifiability and splitting

Family identity follows the underlying fictional product/base trajectory. Repeated cutoffs, copied histories, rescaled/mutated variants, corrected versions and counterfactuals of that base stay in one connected family, even with different IDs/seeds. Generic generator code or a broad regime alone does not make all independent trajectories one family, but reused concrete histories do. Audit ancestry and exact/near-duplicate trajectories before split.

Keep legitimate identical-six-feature cases with differing reviewed context/labels, and report their frequency. They reveal a limit of the inputs, not permission to delete inconvenient cases. Exact duplicate observations add no independent sample and are deduplicated with an exclusion log; different scenario contexts must not be silently collapsed. If six features cannot represent the intended risk distinctions, stop and document the gap. A later feature/design revision requires a new protocol; do not fabricate real app fields or claim high accuracy by relabelling cases to match thresholds.

After labelling and excluding unresolved/invalid cases, generate one immutable group-level approximately 80/20 development/test split (seed 42). Attempt stratification at family level and verify all three classes. Reserve at least 20 independent accepted test families per class for the proposed main evaluation, or hold final evaluation and report inadequate support. Do not borrow pilot families or oversample test to meet this gate. This minimum is a reporting gate, not a power calculation or proof of generalisation.

Within development use 3-fold stratified group cross-validation (seed 43), with at least three independent families per class in each training/validation fold; if infeasible, hold fitting and revise before exposure. Any preprocessing, class weighting, selection or resampling is fitted on training folds only. Test features/labels stay outside fitting/tuning scripts, protected by separate paths and hashes; local operator access is a procedural separation, not a cryptographic claim that files are inaccessible.

Freeze all candidates and development decisions, then save both final models' test prediction arrays before releasing any test scores. One final test evaluation per version; no test-guided feature edits, threshold tuning, extra seeds or replacement fits. Subsequent revisions require genuinely new reserved families and report the consumed test as historical evidence. Never mix Backorder, FreshRetailNet, parcel or actual operational snapshots into this cohort.

## Later bounded training experiment

No fitting is authorised or executed by this documentation deliverable. Proposed subsequent experiment uses Python/scikit-learn on native MSI CPU: the six frozen inputs, DT and RF, seeds 42, no scaling or missing-value imputation required for accepted complete synthetic inputs. Candidate grid: DT `max_depth` 4 or 8, `min_samples_leaf` 2 or 5; RF 100 trees, `max_depth` 6 or 12, `min_samples_leaf` 2 or 5; `class_weight='balanced'`, `n_jobs=2` for RF. Eight candidates times three folds = 24 development fits, then one full-development fit for the selected candidate of each model family = 26 maximum. No nested parallelism. Select within each family by mean development macro-F1, break ties by Critical recall then smaller depth then larger leaf. Report the paired test comparison without choosing new settings from test results.

Keep RF as the report's proposed primary candidate; do not assert it must outperform DT. If it does not, report the evidence and hold operational adoption rather than silently substituting the main model. A majority-class dummy is analytical only and needs no additional learned candidate.

Compare the existing rule `available <= reorder level` as a **binary warning**, not a fabricated three-class predictor: collapse reviewed Reorder/Critical to Risk for a separate binary comparison of rules/DT/RF. Never assign Critical from the binary rule or combine binary and three-class metrics in one score. Main model evaluation reports accuracy, macro-F1, per-class precision/recall/F1/support, ordered 3x3 confusion matrices, Critical-as-Normal misses and false alerts. Include group counts, class prevalence, majority baseline, development variability, fit/inference latency, memory and dataset/model/version hashes. For uncertainty, report family-level resampling intervals with a fixed analysis seed; small-class estimates remain imprecise and synthetic-only.

No report-based promise of 80% accuracy exists in this protocol. Freeze any later operational acceptance thresholds before evaluating genuinely independent intended-use data. Simulated-test metrics alone cannot admit a model for normal business decisions, even if they exceed 80%.

Proposed native limits: one training job at a time; at least 3 GiB free Windows RAM and 1 GiB free disk at start; aggregate process-tree RSS at most 2 GiB; 15 minutes total and 60 seconds per fit; two CPU threads; at most 100 MiB generated data/results. Enforce with `research/runner_runtime.py` or a reviewed compatible supervisor; fail closed on an unavailable monitor. Refuse on insufficient resources, preserve failure evidence and never lower limits automatically. Do not stop unrelated apps, parcel services or emulators to create capacity without direction. No GPU/WSL setup is needed for this small experiment.

### Existing code boundaries

`research/models.py` already knows the six fields and three classes, but its current trainer makes its own split, uses unconstrained RF `n_jobs=-1`, and scores test inside the fitting function. It does **not** implement this protocol. Do not run its CLI against these new data and call the experiment compliant. `research/data_intake.py` validates intake structure but does not certify accounting, independent review or scientific eligibility. Its audit currently supports rubric `1.0` only and will reject this simulation's distinct rubric; sharing column names is not a claim of drop-in compatibility. The new simulation validator must explicitly own and validate `inventory-simulation-rubric-1.0`; do not rename it to `1.0` or weaken the existing intake checks to obtain a pass. A later bounded runner must consume the frozen manifests, enforce the above caps and separate development fitting from final test release. No existing trainer is modified here.

Stage paths: generator/validator `research/inventory_simulation.py` and focused checks `research/test_inventory_simulation.py` were implemented in the authorised continuation. Bounded experiment runner `research/inventory_simulation_train.py` and its checks `research/test_inventory_simulation_train.py` remain proposed and unimplemented. Native execution remains the previously selected preference.

## Local artefact contract and Git boundary

| Future local artefact | Contents |
| --- | --- |
| `pilot/` | Ledger histories, dossiers, separate intended-regime manifest and append-only reviews; no model/test cohort. |
| `main/source-manifest.json` | Protocol/generator/rubric/feature hashes, simulated origin, seeds, bounds, dates and lineage. |
| `main/events.jsonl`, `main/dossiers/`, `main/reviews.jsonl` | Fictional evidence and attributable review revisions, all local. |
| `main/observations.csv` | Existing intake common columns plus six features; `origin=simulated`, source registered as project-created simulation. `group_id` equals family ID. Unreviewed labels/splits remain blank. |
| `main/exclusions.jsonl`, `main/ancestry.json` | All exclusions, unresolved cases, corrections, duplicates and connected family decisions. |
| `main/splits/` | Separate frozen development/test ID manifests and review selection manifests with hashes. |
| `runs/<new-run-id>/` | Exclusive run config, metrics, model artefacts, predictions, software/resource records and terminal status. |

Everything in this table lives beneath ignored `research/datasets/inventory-simulation-v1/`; do not put it into `research/data/` tracked templates, Firebase, the outer reports folder or GitHub. Model/prediction/review/case rows stay local even though fictional. No publication licence for a new dataset is granted here; project-created provenance does not permit importing restricted third-party data.

Track only this prose protocol and concise source/status links. Before any future stage, verify `git check-ignore --no-index` for proposed artefact paths and that `git ls-files -- research/datasets datasets research/models` contains no private dataset/model files. Never use `git add -f`, merge old history, auto-commit existing dirty work or push as part of this plan.

## Verification and staged handoff

Completed by this task: source hash/report alignment check; review of existing six-feature, stock-accounting, intake and trainer contracts; written protocol; dated authorisation notices; Git exclusion and source-preservation checks recorded separately under ignored `outputs/inventory-simulation-plan-20261023/`. Documentary verification does not certify a generator that does not exist.

Future stage checks, required before fitting:

- [x] Implement an offline exclusive-output pilot generator/validator; add meaningful tests for accounting invariants, reserved-demand double counting, inclusive window boundaries, reversed/pending receipts, feature order, unknown history, cutoff leakage and repeat-family ancestry. No Firebase SDK/network/credentials dependency.
- [x] Demonstrate same-seed deterministic hashes, refusal to overwrite/escape paths, bounded output and class labels initially blank. Match canonical application helper results for valid cases while preserving its real-history Unverified behaviour; do not mark application snapshots qualified.
- [ ] Generate only the 60-family pilot, inspect dossiers and record real reviewer responses. Resolve rubric ambiguities before any main generation; document reviewer availability and simulation bias.
- [ ] Freeze the main protocol/config, create and review the bounded main cohort, audit feature collisions/ancestry/duplicates, then freeze split manifests and support counts. Test labels may be reviewed for annotation quality before scoring; they must not guide model selection.
- [ ] Implement/test the bounded manifest-driven runner: development-only selection, test unavailable during development, exact 26-fit cap, process-tree limits, failure cleanup and exclusive versioned outputs. Do not run the old unbounded trainer.
- [ ] After development selection, perform the single paired held-out evaluation and issue a simulation-only report with full class metrics and limitations. Any failed admission remains visible; no auto-activation.

Application integration is a separate later design. Current rule checks and independent snapshot review remain available; real records retain `trainingEligibility: NotAssessed`, missing history stays null, and generic inventory inference remains closed. A model trained on complete simulations does not make incomplete real inputs usable. Keep parcel camera testing and delivery AI deferred, preserve Admin/IDs/balances and Prepared handover, and do not deploy or change production.

## Limitations to carry into the FYP report

Synthetic labels inherit designer assumptions; human review cannot turn a fictional process into observed business truth. Balanced intended classes do not estimate deployment prevalence. The six inputs omit some commitment/lead-time context that reviewers may require, so classification may have an unavoidable ceiling. Closely related generator trajectories can inflate scores despite different IDs. Small test classes have wide uncertainty. A public-data benchmark measures a different target; high simulated accuracy is neither real-warehouse accuracy nor evidence that missing real history can be fabricated.

Method references: [scikit-learn leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html) and [grouped evaluation](https://scikit-learn.org/stable/modules/cross_validation.html). Fit preprocessing only within training folds and keep related families on one side of each split. Report evidence and project-specific choices are distinguished above.
