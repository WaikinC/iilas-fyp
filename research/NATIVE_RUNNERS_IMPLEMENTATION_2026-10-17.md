# Native tabular runner implementation plan — 17 October 2026

Implement the saved FreshRetailNet and Olist protocols as separate research commands. The user's continuation authorises implementation and verification, not full-data fits or confirmation scoring. The two dated training protocols are the experiment specifications; retain their hashes and historical proposal wording. No application inference, primary three-class claim, parcel changes, new dataset acquisition or additional features.

## Workspace and execution

Keep the complete MSI folder structure and existing uncommitted research work. Work on a local implementation branch in the existing app checkout; do not copy datasets, initialise another repository, commit, push, or change production. Preserve all old dataset artifacts. Synthetic fixtures and run artifacts stay in ignored research/datasets children or outputs. Progress/review evidence stays in ignored outputs/native-runners-implementation-20261017/.

Use three implementation agents with disjoint ownership, test-first development, followed by independent spec/code review and root integration. The report-specific protocols, rather than generic trainers, define exact candidates, limits, cutoffs, selection and diagnostics. No score-driven protocol changes.

## Task 1: shared execution safeguards

Own research/runner_runtime.py and research/test_runner_runtime.py. Supply a stdlib resource supervisor appropriate to Windows MSI, immutable JSON/hash/path helpers, native free-memory/process-tree RSS queries, fresh ignored destination checks, subprocess termination on limits and a fit ledger. No dependency upgrades. Expose a small documented interface promptly to the two runner agents. The supervisor checks at most five-second intervals, includes parent/worker descendants, enforces wall/fit-time/memory/output limits, records failures and prohibits overwrite/retry-by-resume. Stop when resource monitoring is unavailable. Preserve actual failure evidence and no successful selection after incomplete fits.

Tests must trigger low available memory, wall/fit timeout, RSS and disk/output limits, verify worker termination, check escaping/symlink/existing/tracked destinations, and prove incomplete fit ledgers cannot seal. Use small synthetic workers; never manufacture full-dataset acceptance.

## Task 2: FreshRetailNet runner

Own research/freshretailnet_train.py, research/test_freshretailnet_train.py and any freshretailnet-prefixed helper files. Implement source-hash validation, immutable protocol/runtime manifests, exact 24-feature ordering with shift-before-roll and same-series consecutive dates, fixed development/confirmation phases, 7+3 fit registry, exact thresholds/ties, native binary metrics and city/product paired bootstrap. Use the existing isolated PyArrow reader directory. Stream/read necessary columns and bound predictions to 50,000 rows. Confirmation requires frozen successful development selection, no parameter/threshold overrides, and separate explicit invocation. Read publisher evaluation labels only after development choices are locked. Freeze all predictions before confirmation scoring; do not activate models.

Use synthetic tests for current/future-marker noninterference, shuffled series, missing dates/duplicates, lag/window boundaries, selection isolation, class-column ordering, tie rules, incomplete-fit refusal, confirmation tampering/replay, paired bootstrap invalid classes and exact registry count. Full-source prepare/check may run without fitting when resources permit and must reproduce saved counts. No real fit in this implementation task.

## Task 3: Olist runner

Own research/olist_train.py, research/test_olist_train.py and any olist-prefixed helpers. Implement source/hash and one-order-grain checks, purchase-time four-feature allowlist, core/as-of/maturity/chronology rules, customer novelty slices, train-only pipelines, 13 primary plus 4+4 sensitivity fits, deterministic 202-threshold selection and unchanged-model confirmation. Freeze primary selections before sensitivities; preserve all reports including unsuccessful comparisons. Add exact-label and chronology comparisons, calendar/month and predefined slices, separate paired customer/week bootstraps and exposure disclosures. Confirmation is separate and cannot refit or retune. Use the shared supervised execution and immutable outputs.

Tests must prove same-day/next-day labels, cutoff/maturity equalities, cancelled/missing outcomes, optional chronology, one-order weight/item duplicates, unseen-at-origin customers, no validation category/scaler fitting, no forbidden predictors, registry/fit count, selection isolation, sensitivity threshold retention and confirmation tampering/replay. Real-source prepare/check without fitting must match the independently saved cohort counts.

## Integration and review

Root owns shared requirements/package commands if necessary, research README, roadmap and archive handover. Review agents must check each implementation against its protocol and tests, including adversarial leakage/limit cases. Root runs the combined research suite, CLI help/preflight/prepare checks, source/hash preservation, tracked+untracked secret scan, and git diff --check. Full application build/lint only if application tooling changes; no Firebase operations needed for standalone research Python.

## Preflight consistency review

| Tasks/interfaces | Decision |
| --- | --- |
| Runtime → both runners | Shared runtime API frozen by runtime owner before integration; all fit subprocesses use it. Dataset-specific feature/metrics code remains separately owned. |
| Fresh → Olist | No shared source files, models, splits, thresholds or labels; only the runtime contract is shared. |
| All → root | No agent edits shared docs/package/requirements or old protocols; root integrates after review. |
| Task 1 self-check | Supervisor must enforce limits during work, not merely report preflight; tests include live small subprocess breaches. |
| Task 2 self-check | Rolling history may use completed prior eval days, never same/future days; confirmation phase has no new candidate search. |
| Task 3 self-check | Sensitivities use primary selected settings/thresholds; confirmation never refits the January model. |

Review focus: hidden evaluation-label access, child processes surviving a resource breach, output replay/tampering, full-data learned preprocessing, and an incomplete candidate registry being reported as complete. Record any implementation limitations explicitly; do not claim training readiness solely from synthetic tests.
