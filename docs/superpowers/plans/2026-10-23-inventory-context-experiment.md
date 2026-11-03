# Revised stock context experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans with the user's preserved Native execution preference to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Use one independent final implementation review, not per-task implementer agents.

**Goal:** Build and evaluate a bounded, reproducible comparison of six-input and fourteen-input RF/DT stock classifiers on a new grouped simulated cohort without replacing the application's current model.

**Architecture:** Add a separate v2 contract/teacher, ledger generator and independent packet validator. A source-bound native runner trains four arms on identical development folds; a separate evaluation command consumes the new test partition once and reports paired family-level evidence. Original v1 code, data, weights, consumed attempts and application serving remain untouched.

**Tech Stack:** Native MSI Windows, Python 3.13.15, scikit-learn 1.8.0, NumPy 2.4.2, SciPy 1.18.1, joblib 1.6.0 and threadpoolctl 3.7.0; existing Windows Job supervision and unittest. No new package, GPU, WSL or service.

**Spec:** `docs/superpowers/specs/2026-10-23-inventory-context-experiment-design.md`, approved by the user on 23 October 2026. The approved substantive document had SHA256 `c2983f043f48d08062934e713ccf79b212a1a573c742a6fd509696fe1004d398`; its status line is subsequently updated to record that approval.

## Global Constraints

- User selected revised simulation and factual context inputs. Preserve Native execution; obtain review of this concrete plan before implementation without asking the execution-method question again.
- Use the existing `iilas-fyp` checkout on branch `codex/native-tabular-runners`, currently HEAD `25680a2b991b797f5aad3e79ae5cfcca0b4aec00`. Capture attributable file hashes and preserve all existing dirty work. No reset, staging, commit, push, new outer repository or copy of old Git history. Verify checkout isolation with the execution skill rather than creating a detached environment without the local scientific evidence.
- Dot-source `../Enter-IILAS.ps1`; Node 22.13+ within major 22/JDK 21; use npm.cmd/npx.cmd. Set `$stockPy = 'C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe'`. Use a fresh short ignored TEMP directory under `outputs/t` for native fixture tests.
- Protocol `inventory-context-experiment-2.0`; exactly 300 new families, seeds 2001–2005, twelve views each, 3,600 rows. Split seed 2042: 240 development families/2,880 rows and 60 test families/720 rows. Three development folds, seed 2043, eighty families each. All views/ancestry of a family stay together.
- Main class totals: Normal 750, Reorder Risk 1,050, Critical Stock Risk 1,800. Test totals: 150/210/360 in that order. These are designed coverage counts, not natural prevalence. All variants sharing stock inputs are intentionally correlated counterfactuals.
- Ordered six features and eight appended fields are exactly those in the spec; class order is Normal, Reorder Risk, Critical Stock Risk. Reject unknown facts rather than impute. Explicit absence alone permits zero encoding of a null deadline. Reservations are subtracted once; additional demand excludes reserved demand.
- Four arms: RF6, RF14, DT6, DT14. Each has four registered settings × three folds, plus one selected final fit: 52 fits maximum. RF100 trees/depth6 or12/leaf2 or5/n_jobs2; DTdepth4 or8/leaf2 or5. Both balanced class weights and random_state42. Select mean fold macro-F1, then Critical recall, smaller depth, larger leaf. No additional tuning, calibration, models or feature search.
- One native training job at a time; two threads, 3 GiB free RAM and 1 GiB free disk at admission, 2 GiB sampled process-tree RSS, 60 seconds per fit, 900 seconds combined development, 100 MiB total cohort/run output. Check cleanup before further admission. Never lower bounds or stop user applications to pass.
- Separate final evaluation is bounded at 120 seconds, two threads/2 GiB RSS and the same startup/free-disk/combined-output caps. Preparation/audit are bounded at 120 seconds with the same memory/disk/output caps. These phase durations are conservative implementation choices within the spec's separate bounded-evaluation requirement, not additions to the fit budget.
- Keep independent_human_review, independent_accuracy_validated and operationally_approved false. A policy approximation score is not warehouse accuracy. Preserve real readiness Unavailable, selected Admin/IDs/balances, approvals, Prepared handover, app theme and parcel experiment. No Firebase writes/restarts, camera/delivery work, current-model replacement or production action.
- Preserve `research/inventory_simulation.py`, `inventory_simulation_main.py`, `inventory_simulation_train.py`, `runner_runtime.py`, `inventory_inference.py`, `lib/inventoryRisk.js`, `lib/locationStock.js`, old protocols, data, registries, weights and serving profiles. Add v2 modules; do not generalise frozen v1 files in place.
- Detailed data/weights/logs/manifests/registries stay under ignored `research/datasets/inventory-simulation-v2/`; execution bookkeeping under ignored `outputs/inventory-context-20261023/`. Refuse links/junctions, traversal, tracked/unignored paths and overwrite. No old test observations or old estimator loading.

## Review Focus

1. Explicitly absent demand/supply and genuinely unknown fields must never collapse to the same accepted zero encoding — Task 1 `test_absence_is_not_unknown`.
2. A renamed or relabelled duplicate ledger must not masquerade as an independent family or cross a partition — Task 2 `test_renamed_ledger_and_cross_partition_ancestry_rejected`.
3. A changed output directory, manifest or leaked path must not bypass a consumed attempt or expose held-out observations during selection — Tasks 3/4 `test_claim_cannot_move_or_change_cohort` and `test_develop_reader_has_no_test_access`.
4. Worker exit does not prove descendants have stopped; a cleanup failure must quarantine the run before another fit — Task 3 `test_delayed_or_unknown_drain_blocks_next_fit`.
5. Correlated views and zero prediction denominators must not produce falsely narrow or selectively filtered uncertainty intervals — Task 5 `test_bootstrap_resamples_whole_families_and_reports_undefined`.

## File map and shared interfaces

Create six focused modules and their matching `research/test_inventory_context_*.py` files:

| Module | Responsibility |
| --- | --- |
| `inventory_context_contract.py` | Exact raw context validation, stock-only compatibility projection, 6/14 encoders and v2 teacher. |
| `inventory_context_data.py` | Deterministic new ledgers/views, grouped partitions, exclusive preparation and independent dossier/CSV validation. |
| `inventory_context_artifacts.py` | Safe artifact reads/writes, source/environment identities, durable phase claims and confirmed native process cleanup. |
| `inventory_context_train.py` | Registered candidates, grouped CV, selection, control fitting and four frozen final estimators. |
| `inventory_context_evaluate.py` | Once-only test predictions, controls, metrics, family bootstrap and read-only saved-evidence audit. |
| `inventory_context_cli.py` | Public bounded commands and hidden supervised phase/fit entrypoints. |

Create `research/INVENTORY_CONTEXT_PROTOCOL_2026-10-23.md` before authoritative generation, then `research/INVENTORY_CONTEXT_EXPERIMENT_2026-10-23.md` for observed results. Update only the research index, roadmap and archive handover with aggregate evidence. `.gitignore` already covers dataset/output trees; do not add blanket ignores for source/tests. Existing full-research discovery automatically includes new `test_*.py` modules.

Use JSON-compatible typed dictionaries (type aliases/TypedDicts defined in their owning module), not serialized Python objects for metadata. Contract constants `PROTOCOL`, `TEACHER`, `FEATURES6`, `FEATURES14`, `CLASSES`, `PROVENANCE` live in the contract module. `TEACHER='assistant-context-policy-2.0'`; provenance names follow the spec exactly. Store ordered feature names beside every matrix and estimator receipt.

`Ledger` has the old case's stock fields but no `context`: sample_id, family_id, ancestor_ids, observed_at_ms, opening_at_ms, opening, events, reorder_level, coverage_start_ms, coverage_complete, pending_corrections. `Context` has exact fields known_at_ms, reserved_commitment_quantity, additional_firm_quantity, additional_due_days, incoming_quantity, incoming_eta_days, supply_status. `Case` has protocol, sample_id, family_id, view_id, history_regime, buffer_regime, source_seed, ledger, context; metadata/template fields never enter matrices.

`assess_ledger(ledger:dict)->dict` preserves the frozen replay semantics by making an in-memory v1-compatible projection for `inventory_simulation.assess_case`. Derive expected reserved quantity from opening reservations and Reservation/Release events, and supply a neutral `sim.make_context(0, reserved, 0, 7, cutoff=cutoff)` only to satisfy v1's legacy context validator. The projection is an internal compatibility argument, never persisted, never displayed as actual v2 evidence and never used for teaching/encoding. Validate actual v2 context independently against the returned stock balance. Do not monkey-patch v1 validation or duplicate its ledger algorithm. Tests prove changes in actual v2 context do not change stock replay and cannot bypass actual-context checks.

`Assessment` uses the existing return keys features, product, eligible, issues, receipt_id and observed counts. `Context` is known by the same cutoff and reserved_commitment_quantity must equal the replayed reserved quantity. `Annotation` records class, reason, policy version, evidence hash and false provenance. A typed `Row` contains sample_id, family_id, view_id, history_regime, buffer_regime, label, split, fourteen named features and dossier hash; matrix extraction uses only explicit feature tuples. Serialized `Dossier` replaces Case.ledger with ledger_ref and ledger_sha256; a partition-scoped reader verifies and hydrates that ledger into Case before contract validation. Data imports contract/artifact utilities; artifacts imports only contract, not data/train/evaluation, avoiding a module cycle.

`DatasetManifest` binds experiment_id=`context-v2-main-01`, protocol, teacher, seeds, report SHA, source pins, environment versions, preparation_claim_sha256, all relative file hashes/sizes, counts, ordered features/classes and provenance. `ArmSpec` contains arm (RF6/RF14/DT6/DT14), family (RandomForest/DecisionTree), feature_set (six/context), candidate_id, depth, leaf. `PredictionPacket` binds ordered sample/family IDs, class order, labels, three ordered probabilities, input/model hashes and timings. Preserve classifier alphabetical argmax tie semantics when reordering probabilities to report order.

### Task 1: V2 context contract and explicit teaching rules

**Files:** create `research/inventory_context_contract.py`, `research/test_inventory_context_contract.py`.

**Interfaces:** `assess_ledger(ledger)->Assessment`; `validate_context(context, *, cutoff_ms:int, reserved:int)->Context`; `encode_case(case, *, feature_set:str)->tuple[float,...]` for only `six`/`context`; `teach_case(case)->Annotation`; `ledger_fingerprint(ledger)->str`. Later tasks consume these exact signatures and constants.

- [x] Write `test_context_changes_label_without_changing_stock_features`: fixture A=100,R=20,reserved=10; covered demand returns Normal, D=150/Q=50/planned/timely returns Reorder, and the same D with late confirmed supply returns Critical. Assert identical six-feature tuples and distinct fourteen-feature tuples; additional demand is not reduced by reserved units again.
- [x] Write `test_absence_is_not_unknown`: zero demand/null due and no supply/zero quantity/null ETA encode as explicit zeros/none flag; positive demand/null due, non-none/zero batch, none/positive batch, missing status, booleans, numeric strings, nonfinite/negative values, extra label fields and known_at_ms after cutoff reject.
- [x] Write teacher boundary tests: D=A, A=R, ETA=due, A+Q=D, just-late and one-unit-insufficient, disrupted when stock suffices, no supply under shortfall, planned timely insufficient. Check all three false provenance fields and explicit AI-authored-policy origin. Test an ineligible ledger remains rejected, including unverified history, no eligible receipt, pending correction and invalid inverse correction.

```python
# Test-local covered/planned/late cases contain the hand-authored ledger above.
self.assertEqual(teach_case(covered)['label'], 'Normal')
self.assertEqual(teach_case(planned)['label'], 'Reorder Risk')
self.assertEqual(teach_case(late)['label'], 'Critical Stock Risk')
self.assertEqual(encode_case(covered, feature_set='six'), encode_case(late, feature_set='six'))
self.assertEqual(len(encode_case(covered, feature_set='context')), 14)
with self.assertRaises(ValueError):
    validate_context(unknown_due, cutoff_ms=cutoff, reserved=10)
```

- [x] Run `& $stockPy -m unittest discover -s research -p test_inventory_context_contract.py -v`; record RED from missing v2 module/functions or failing specified assertions.
- [x] Implement the named interfaces with existing exact stock replay, strict v2 context and the spec's four ordered teaching branches. Fingerprint concrete openings/history without sample/family/event naming; replace correction references by referenced-event content so renaming IDs cannot defeat duplicate detection. Retain cutoff/timing and stock quantities, but exclude reorder threshold/context to reject reuse of the same stock history under a new policy label.
- [x] Rerun GREEN. Add parameterized hand-calculated cases across the twelve template conditions as expected assertions, independently of generator output. Record source hashes and test result in the Native ledger; no commit.

### Task 2: New grouped cohort and independent validator

**Files:** create `research/inventory_context_data.py`, `research/test_inventory_context_data.py`, `research/INVENTORY_CONTEXT_PROTOCOL_2026-10-23.md`.

**Interfaces:** `build_families()->list[dict]`; `expand_views(family:dict)->list[Case]`; `assign_partitions(families)->dict`; `packet_payloads(families,partitions)->dict[str,bytes]`; `validate_cases(cases,partitions)->dict`; `prepare_cohort(output:Path)->DatasetManifest`; `audit_cohort(source:Path,expected_sha256:str)->dict`. Public scientific preparation is invoked later by Task 6 after all modules/review exist, not during this task's fixture tests.

- [x] Write coverage assertions: 300 unique ledger fingerprints/ancestries; five seeds with sixty families each; twelve history×buffer strata with 25 families each; 3,600 unique views, twelve per family; all variants keep identical six features. Class totals 750/1050/1800; all four supply statuses support more than one class. Validator must catch a mislabeled row, stale CSV feature, unknown extra artifact, missing view and changed dossier/hash.
- [x] Write `test_renamed_ledger_and_cross_partition_ancestry_rejected` with a copied ledger whose IDs are changed and a shared ancestor assigned across two families; both fail even if their six inputs or labels differ. Make the validator independent of `build_families`: patch that generator to raise during audit and require audit to still replay/check the saved packet correctly.

```python
families = build_families()
cases = [case for family in families for case in expand_views(family)]
self.assertEqual((len(families), len(cases)), (300, 3600))
self.assertEqual(Counter(teach_case(c)['label'] for c in cases),
                 {'Normal': 750, 'Reorder Risk': 1050, 'Critical Stock Risk': 1800})
with self.assertRaises(ValueError):
    validate_cases(renamed_duplicate_cases, leaked_partitions)
```

- [x] Run the new module RED. Implement fixed generation with seeds 2001–2005, cycling all twelve strata five times per seed. New namespace `inventory-context-v2`; no call to `build_pilot`, old main builders or old observation files. Use a 120-day complete fictional ledger, bounded positive opening stock/events and one designated eligible receipt establishing each spec history regime. Sample new stock quantities before context construction, then choose R above/equal/below A according to the buffer stratum. Do not choose a label first and repair stock to fit it.
- [x] Freeze the exact generation recipe in the protocol before authoritative generation: deterministic quantity ranges, event order and per-family RNG derivation, ordinary receipt ages 1–29 days, older-window receipt 31 days, zero-activity receipt 45 days and no events in the last30days, ninety-day receipt90days, exact0/0.25-day regimes. Include zero available stock in one of every five low-buffer families using a valid receipt followed by full issue, respecting the zero-activity regime's older event times. Cover exact deadline/quantity equality and one-unit/day shortfalls; D deadlines0–14days and ETA0–21days. No rejection sampling, replacement seed or output-driven retry. The protocol records the twelve view mappings before any model results exist.
- [x] Implement split seed2042 independently within each of twelve sorted strata: shuffle25 IDs and take20 development/five test. With seed2043 shuffle each stratum's20 development IDs, assign round-robin folds starting at stratumIndex%3; this yields80 families/fold and balanced per-stratum6/7/7 counts. Persist these assignments; workers do not recompute another random split. Test every family's views stay together and all folds/classes have support.
- [x] Write separate `development/ledgers/`, `development/dossiers/`, `development.csv`, `test/ledgers/`, `test/dossiers/`, `test.csv`, split/fold metadata and manifest. A dossier references its separately hashed family ledger, avoiding twelve copies of history. Metadata-only readers can inspect group IDs/counts/hash declarations without opening test observations. Preparation and audit enforce the exact tree, hashes, replayed features/teacher, false provenance, age regimes and counts; neither validator nor generator imports sklearn or loads a model.
- [x] Tests use temporary ignored fixture roots and small explicit fixtures. The full300-family builder may be checked in memory for counts without retaining an authoritative cohort; no scientific output directory or phase claim is created. Before Task3 exists, test-only injected artifact identities can isolate packet validation; do not add dummy production pins. Full source pinning and public scientific preparation require all final modules/protocol to exist. Rerun contract/data tests GREEN and record protocol/source hashes. Source metadata from v1 may establish old namespace/seeds only; no old test rows are accessed or byte-level old-test uniqueness claim made.

### Task 3: Immutable artifacts, test-access boundaries and native limits

**Files:** create `research/inventory_context_artifacts.py`, `research/test_inventory_context_artifacts.py`.

**Interfaces:** `safe_path(path:Path, *, existing:bool)->Path`; `write_json(path,value)->None` (exclusive); `source_pins()->dict`; `versions()->dict`; `read_manifest(source,expected_sha256)->DatasetManifest`; `read_case(source,manifest,relative,partition)->Case`; `load_rows(source,expected_sha256,partition,*,claim=None)->list[Row]`; `claim_phase(phase,source_sha256:str|None,output)->dict`; `verify_claim(claim,phase,source_sha256,output)->None`; `freeze_run(output,phase,receipt)->dict`; `ContextSupervisor(output,limits,cohort_root).run(command,*,fit_id,cwd=None,enforce_fit_timeout=True)->dict`; `limits(phase)->runtime.Limits`. Phase enums are preparation/development/evaluation; CLI prepare/develop/evaluate maps to these names explicitly.

- [x] Write tests rejecting traversal/absolute manifest members, links/junctions at any ancestor, tracked/unignored paths, existing destinations, duplicate JSON keys, changed sources/runtime/teacher or mismatched class/feature order. `test_claim_cannot_move_or_change_cohort` requires an exclusive claim keyed by fixed experiment_id and phase across every output path and dataset hash. A second attempt cannot bypass it by renaming a directory or changing source SHA.
- [x] Write `test_develop_reader_has_no_test_access`: instrument all file opens and fail if a development load opens any test dossier/CSV/ledger or old evaluation artifact. Manifest tests must not hash raw test files during development merely to check their declared metadata. A test reader requires the correct already-persisted evaluation claim and frozen-development identity before the first test open.

```python
claim_phase('development', fixture_sha, first_output)
with self.assertRaises(FileExistsError):
    claim_phase('development', fixture_sha, second_output)
with self.assertRaises(ValueError):
    load_rows(fixture_source, fixture_sha, 'test', claim=None)
self.assertEqual(limits('development').max_wall_seconds, 900)
self.assertEqual(limits('development').max_rss_bytes, 2 * 1024**3)
```

- [x] Run RED. Implement safe readers with bounded files, exact schemas, hash checks and explicit partition access. New source pins bind all six v2 modules, frozen protocol, old replay/runtime sources, imported cleanup helper, canonical stock/location helpers and the verified original report hash. Runtime package versions are pinned from installed metadata; no environment upgrade. Exclude mutable roadmap/results/status prose from scientific source pins.
- [x] Implement exclusive `registry/context-v2-main-01-{preparation,development,evaluation}.json` claims after successful resource admission and before scientific generation/fits/test access. Record output path, phase, UTC timestamp and native owner identity without secrets. Preparation alone uses source_sha256=null and a basis hash over protocol/seeds/source pins/environment because no dataset exists yet. Its separate immutable completion receipt later binds the resulting manifest SHA; never rewrite the initial claim. Development/evaluation require that verified completion and exact non-null dataset SHA. Failures retain claims and partial evidence. A resource refusal before claim consumes no scientific attempt; preserve its diagnostic and retry only after the resource condition changes. No resume/delete/reset/force flag.

Preparation logs go in a separate exclusively created sibling `<output-name>-preparation`, e.g. `main-01-preparation/`; the claimed `main-01/` dataset destination remains absent until the supervised data writer creates it. The frozen preparation receipt binds both paths and the new manifest. This avoids weakening the generator's refusal of existing output directories or mixing supervisor logs into the immutable dataset file inventory. Development/evaluation coordinators own their fresh run directories and workers create individual artifacts exclusively inside those verified directories.
- [x] Implement a v2 supervisor using unchanged `runner_runtime` native Job/monitor primitives and the pinned `_confirm_stock_tree` helper from `inventory_inference` for confirmed drain. Importing that helper must not call serving metadata or load a v1 model. Support registered fit/phase IDs rather than stock service's inference-only ID. Confirm process signals plus empty Job membership before closing the handle and admitting the next fit; three-second cleanup confirmation, sticky failed/quarantined state on ambiguity. Preserve full resource receipts and partial outputs.
- [x] Add native fixture tests for real success, timeout with grandchild, delayed termination and unknown drain; verify no next worker starts before cleanup. Test startup3GiB/1GiB,2GiBRSS,60sfit/900sdevelopment/120spreparation-or-evaluation, two threads, and100MiB combined v2 cohort/phase outputs. Include an exclusive v2 active-job lock and a read-only admission check for already-running known project training processes, excluding only the verified current run's owner/descendants; never terminate unrelated work. Crash-stale locks require verified process identity/terminal state and an explicit retained reconciliation, never age alone.
- [x] Rerun GREEN under native permissions. Fixture time limits can be injected for short tests; public commands expose no weakening switches. Monitor parent plus descendants throughout each phase and during bootstrap/output generation. Missing monitors, output overflow, unknown cleanup or duplicate fit IDs fail closed. Do not modify the original supervisor or serving manifests.

### Task 4: Paired grouped development and frozen controls

**Files:** create `research/inventory_context_train.py`, `research/test_inventory_context_train.py`; create development/fit routing in `research/inventory_context_cli.py` with `research/test_inventory_context_cli.py`.

**Interfaces:** `candidates()->list[ArmSpec]`; `fit_ids()->tuple[str,...]`; `estimator(spec)->classifier`; `matrix(rows,feature_set)->list[list[float]]`; `select(records)->dict[str,ArmSpec]`; `fit_controls(rows)->dict`; `predict_controls(controls,rows)->dict`; `fit_worker(job:Path,expected_sha256:str)->None`; `develop(source,source_sha256,output,supervisor)->dict`; `validate_development(path,source_sha256)->dict`. CLI exact commands are in Task 6.

- [x] Write assertions: sixteen candidate settings,48CV plus4final IDs; identical groups/rows for all arms; matrix width6/14; IDs/labels/reasons/template names cannot enter a matrix. A fixture with unseen validation-only extremes must not affect training controls. Match the spec grids, balanced weights, seed42 and two threads; reject any unregistered parameter.
- [x] Write selection tests requiring all three unique folds per candidate and all sixteen candidates. Equal metrics choose smaller depth then larger leaf; choose independently per RF6/RF14/DT6/DT14. No class threshold tuning or test metrics are accepted. Deliberately corrupted fold coverage/row order or probabilities fail before selection.

```python
self.assertEqual((len(candidates()), len(fit_ids())), (16, 52))
self.assertEqual(len(set(fit_ids())), 52)
choices = select(equal_score_records)  # Complete test-local 16 x 3 records.
self.assertEqual((choices['RF14']['depth'], choices['RF14']['leaf']), (6, 5))
self.assertEqual((choices['DT6']['depth'], choices['DT6']['leaf']), (4, 5))
with self.assertRaises(ValueError):
    select(equal_score_records[:-1])
```

- [x] Run RED. Implement fixed folds from Task2 and strict worker payload `{fit_id,spec,features,source_sha256,phase_claim_sha256,x_train,y_train,x_evaluate}`. Validation labels stay in the coordinator; test rows are never loaded. Parent passes the exclusive job file's expected SHA using hidden `_fit --job <path> --job-sha256 <sha>`. Worker first verifies its live named Windows Job, registered ID, exact job bytes and source/phase-claim identities, then fits under threadpool_limits(2). Save exclusive estimator, ordered probabilities and exact input/job/model lineage receipt; verify class order and argmax tie behavior. A mutated job between scheduling and consumption is rejected before fitting.
- [x] Compute majority and status-only lookup from training folds only, with ties by declared class order. Freeze corresponding full-development tables after CV. Direct teaching policy is a clearly identified deterministic control; do not count it as an independently trained model. Persist matched-setting feature comparisons, fold metrics and per-status class support along with the four selected final choices. No preprocessing fit or calibration is introduced.
- [x] Seal the exact52-entry ledger only after every fit/cleanup succeeds. Freeze four full-development estimators, parameter dictionaries, source/data/input hashes, folds/controls and native phase receipt. Validate all ledger entries and estimator metadata rather than accepting a success flag alone. Tests prove incomplete/repeated fits, tampered model/selection/controls and false provenance refuse freeze/evaluation.
- [x] Rerun focused tests GREEN using disposable software estimators only, including one real native worker fit/prediction on hand-authored software rows and a fixture-only registry rooted in a temporary ignored directory. Test dependency injection must remain inside the test harness; public CLI has no fixture/smaller-cohort or bypass flag. No authoritative v2 cohort/fit is run yet. CLI has `prepare`, `audit-data`, `develop`, `audit-development`, `evaluate`, `audit-evaluation`; hidden `_phase`/`_fit` verify Job and phase claims. Audit commands are read-only and do not fit or predict.

### Task 5: Once-only evaluation, grouped uncertainty and independent saved-result audit

**Files:** create `research/inventory_context_evaluate.py`, `research/test_inventory_context_evaluate.py`; complete routing/tests in `research/inventory_context_cli.py` and its test module.

**Interfaces:** `evaluate(source,source_sha256,development,output,supervisor)->dict`; `score(truth,predicted)->dict`; `family_bootstrap(rows,predictions,*,samples=500,seed=2044)->dict` returning draws/intervals/undefined_counts, each draw carrying family_ids, row_indices, metrics (exactly the four arm keys) and paired_differences (separate from metrics); `audit_evaluation(source,source_sha256,development,evaluation)->dict`; CLI `main(argv=None)->int`.

- [x] Write a two-family/twelve-views-each fixture whose sampled-index groups make row-wise resampling visibly wrong. `test_bootstrap_resamples_whole_families_and_reports_undefined` verifies500paired draws/seed2044, complete twelve-row blocks including repeated family draws, identical draws for every arm, zero_division=0 and an explicit count of undefined precision/recall/F1 denominators. All draws remain in saved arrays and percentiles; no selective removal.
- [x] Write `test_all_predictions_saved_before_any_metric`: instrument metric calls to reject execution until all four packets and control predictions have been persisted/hash-bound. Wrong frozen choice, changed source/environment/model, missing claim, malformed probabilities, inconsistent ID order or pre-existing evaluation must fail before test prediction. Missing evaluator denominator support is reported, not hidden.

```python
result = family_bootstrap(two_family_rows, fixture_predictions)
self.assertEqual(len(result['draws']), 500)
for draw in result['draws']:
    self.assertEqual(len(draw['family_ids']), 2)
    self.assertEqual(len(draw['row_indices']), 24)
    self.assertEqual(set(draw['metrics']), {'RF6', 'RF14', 'DT6', 'DT14'})
self.assertGreater(result['undefined_counts']['RF6']['critical_precision'], 0)
```

- [x] Run RED. Implement final evaluation without any `.fit`, old source/test access or parameter changes. Freeze estimator bundles and controls before loading the new720test rows, then emit exact ordered predictions first. Compute accuracy/macro-F1/class metrics/confusion/Critical-as-Normal/false alerts and subgroup descriptions by known status/context/history/buffer. Include row and independent-family support; undefined subgroup metrics carry support and denominator flags.
- [x] Compute family bootstrap confidence intervals for accuracy, macro-F1, Critical precision/recall and primary RF14-minus-RF6 paired differences. Use NumPy percentile with method='linear',2.5/97.5percentiles, and persist all500paired arrays plus sampled family IDs. Report DT comparisons descriptively, all four arms and fixed controls. Score available<=reorder separately as a binary risk warning; never fabricate a third rule class.
- [x] Implement `audit_evaluation` independently from the metric-producing functions: reconstruct confusion counts, class/aggregate scores and bootstrap arrays from saved predictions using stdlib arithmetic, verify packet hashes/lineage and that sampled families carry all twelve views. Do not import sklearn, load weights or predict in this audit path. Its scientific test access is read-only after an already-consumed evaluation; it cannot drive another fit.
- [x] Rerun focused CLI/evaluation tests GREEN, including mocked `.fit`/estimator loader traps for read-only audits. Freeze comparisons before final scoring. Use the spec's favourable-research rule (RF macro-F1 gain and no extra Critical-as-Normal errors), with uncertainty and no operational admission or imported parcel80%target. Timing is model/batch timing, not app response time.

### Task 6: Verify the implementation, execute the bounded experiment and document evidence

**Files:** create `research/INVENTORY_CONTEXT_EXPERIMENT_2026-10-23.md`; update `research/README.md`, `PROJECT_ROADMAP.md`, `../fyp-cwk-2/docs/CHAT_HANDOVER.md`; create ignored Native ledger/evidence under `outputs/inventory-context-20261023/`. No other product/configuration files are changed.

- [x] Run each new `test_inventory_context_*.py` module separately in a fresh interpreter and require terminal exit0. Then run `& $stockPy research/run_research_tests.py` once; record actual modules/cases/skips/failures, never repeat merely to manufacture a green total. Run a disposable command-routing flow with supervisor doubles to check claims, packet validation, selection and evaluation order. Real native Job/cleanup/worker behavior is exercised by Tasks3/4; do not describe the doubled flow as an actual scientific run. Fixture roots and registries cannot consume the authoritative experiment_id or claim independent accuracy.
- [x] Run `npm.cmd run build`, `npm.cmd run lint`, `npm.cmd run security:scan`, `npm.cmd run security:history`, the existing expanded nonignored-file secret scanner and `git diff --check`. Record existing warnings separately. App/Firebase code and service profiles are unchanged, so retain the already verified browser/emulator evidence rather than starting another stack or rerunning all Firebase suites. Verify original scientific source/model/registry and serving metadata hashes from the captured baseline without opening old test observations.
- [x] Request the single fresh final implementation review after all code/fixture checks are complete and **before authoritative data/training/test release**. This is the Native final code review; actual experiment execution below adds results only. Supply design/plan, scoped baseline/diff, tests and the five Review Focus cases. Use the most capable available reviewer as required by the Native workflow. Address substantive findings with regression tests, rerun affected checks and one full research collection only if changed code warrants it; no per-task agents or second review loop. Do not execute scientific phases while an Important issue remains unresolved.
- [x] Freeze the final protocol/source/environment pins, quantify projected cohort+52fit outputs and confirm available resources. Capture only metadata/hashes for protected v1/scientific/serving files and selected root private-configuration state, never values. Prepare once through the bounded command below; audit the resulting packet and save its actual manifest SHA as `$cohortSha`. No hypothetical SHA or placeholder goes into a real invocation.

```powershell
. ../Enter-IILAS.ps1
$stockPy = 'C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe'
& $stockPy research/inventory_context_cli.py prepare --output research/datasets/inventory-simulation-v2/main-01
$cohortSha = (Get-FileHash -Algorithm SHA256 -LiteralPath research/datasets/inventory-simulation-v2/main-01/manifest.json).Hash.ToLowerInvariant()
& $stockPy research/inventory_context_cli.py audit-data --source research/datasets/inventory-simulation-v2/main-01 --source-sha256 $cohortSha
```

- [x] Require the original preparation handle terminal-success, exact300/3600 counts, expected class/stratum totals, valid cutoff facts, duplicate/ancestry/group checks and complete source hashes before fitting. A timeout in observing the tool is not permission to restart a phase; resume its same live handle. On an actual failed claim, preserve evidence and diagnose; no replacement cohort, seed or registry deletion. Record the audit in the aggregate result guide.

```powershell
& $stockPy research/inventory_context_cli.py develop --source research/datasets/inventory-simulation-v2/main-01 --source-sha256 $cohortSha --output research/datasets/inventory-simulation-v2/development-01
& $stockPy research/inventory_context_cli.py audit-development --source research/datasets/inventory-simulation-v2/main-01 --source-sha256 $cohortSha --development research/datasets/inventory-simulation-v2/development-01
```

- [x] Inspect the terminal development receipt,52fit ledger, exact group/input matrices, four chosen settings/models, controls, resource peaks and confirmed drain. Development audits may read only development observations and saved development predictions. Do not change choices because of promising/disappointing scores. Final release requires a completely verified frozen development packet, not just a model file.

```powershell
& $stockPy research/inventory_context_cli.py evaluate --source research/datasets/inventory-simulation-v2/main-01 --source-sha256 $cohortSha --development research/datasets/inventory-simulation-v2/development-01 --output research/datasets/inventory-simulation-v2/evaluation-01
& $stockPy research/inventory_context_cli.py audit-evaluation --source research/datasets/inventory-simulation-v2/main-01 --source-sha256 $cohortSha --development research/datasets/inventory-simulation-v2/development-01 --evaluation research/datasets/inventory-simulation-v2/evaluation-01
```

- [x] Require the once-only evaluation's original handle terminal-success, all prediction-before-metric evidence, independent saved-result audit,720rows/60families and500paired family draws. Record failures and regressions honestly; do not train a replacement after exposure. Check all dataset/output paths remain ignored, no data/model/secret is tracked/staged, original protected hashes remain unchanged and current stock serving still binds the original v1 model. No current app inference is necessary to prove an unchanged model hash.
- [x] Write results with four-arm metrics, control results, Critical mistakes, intervals, subgroup supports, fit/resource/time evidence and limitations. Distinguish old75%/45% from the new distribution rather than claiming a directly comparable improvement. Update research index/roadmap/handover with actual evidence, next prerequisites and exact restart-free current app boundary. Full stock goal remains incomplete for qualified real history/independent labels and eventual separately reviewed adoption; the study's success does not silently expand scope.
- [x] Verify document links, source pins, final secret/ignore/diff checks and the Native ledger. Leave the reviewed checkout as-is with no Git publication or cleanup of retained experiment evidence. Report what works, actual model findings and what remains; do not guarantee an accuracy target.

## Self-review and handoff

All spec sections map to Tasks1–6: input/policy and report semantics→1/2; coverage/partitions→2; safe artifacts/resources→3; paired selection/controls→4; one-time evaluation/uncertainty→5; independent implementation review, actual execution and evidence→6. Every Review Focus item has a named negative test. Later tasks use the Interfaces defined above; source/runtime originals are read-only. Dataset preparation does not import training, development does not read test, and read-only audit does not invoke estimators. The new compatibility projection handles v1's inability to represent null/none without altering original evidence.

The user approved this implementation plan on 23 October 2026. Native execution completed all six tasks, final review fixes and the bounded experiment. The result guide records the successful data/development/evaluation audits, full regression evidence and focused launcher correction; the ledger records storage/retention rulings and the deferred Minor timing item. Checked steps include those explicitly resolved by these documented rulings. Do not ask for plan or Native approval again. The plan-specific ignored ledger records exact test evidence and rulings.
