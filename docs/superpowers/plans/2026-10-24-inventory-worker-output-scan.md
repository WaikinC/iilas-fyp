# Stock Worker Output Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user has already selected **Native / executing-plans**; preserve that choice.

**Goal:** Reduce RF14 stock-service response time by replacing repeated serving-output filesystem queries with equivalent fresh accounting, while preserving the frozen classifier, scientific basis and resource controls.

**Architecture:** A serving-only scanner and supervisor subclass provide optimized accounting without editing the frozen generic/legacy runtime. Only RF14 inference/admission adopts them; preparation and other model paths remain unchanged. A fixed before/after measurement and source-bound local cutover verify the result.

**Tech Stack:** Existing native Windows Python3.13/scikit-learn RF14, standard library only, Node22, React/Firebase emulators. No dependencies, GPU, WSL, persistent worker or training.

**Spec:** [Approved serving-output design](../specs/2026-10-24-inventory-worker-output-scan-design.md), approved by the user on24October2026 after its fresh builder check returned “nothing important left.”

## Global Constraints

- Keep AI-assisted prototype labels only; `operationally_approved=false`, `independentAccuracyValidated=false`, `acceptanceSha256=null`. No new accuracy claim, independent labels, refit or consumed TEST replay.
- Do not modify `research/runner_runtime.py`, `research/inventory_inference.py`, or any scientific `inventory_context_artifacts.PIN_FILES`, datasets, completed claims, model weights/hyperparameters/class order/encoding/metrics. Serving-source changes require fresh immutable metadata; scientific identities stay unchanged.
- Keep profile schema5/protocol2, a fresh supervised process per request and existing Job/run/drain/quarantine behavior. Exact RF14 limits remain `max_wall_seconds=15`, `max_fit_seconds=15`, `max_rss_bytes=2*1024**3`, `min_available_bytes=3*1024**3`, `min_free_disk_bytes=1024**3`, `max_output_bytes=10*1024**2`, `poll_seconds=.1`, `threads=2`, existing `available_floor_bytes=0`, and100MiB global serving cap. Startup RAM admission and the existing live-memory-floor option are distinct; do not lower either or reduce monitoring frequency. Do not delete history to improve timings.
- Use native research Python `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe`; dot-source `../Enter-IILAS.ps1` for Node22.13+ within major22/JDK21. Use literal127.0.0.1/localhost and one emulator stack; suites sequentially.
- Keep datasets, profiles/tokens, local inputs, timings, exports and recovery evidence ignored. Do not display private configuration or alter production. No stage/commit/push/merge/worktree switch; preserve current checkout and prior unrelated work.
- Each task checkpoints scoped hashes/snapshots in this plan's own ignored Native workspace. Never read/write another plan's `.superpowers` workspace. Inspected helpers under `outputs/` may be reused, with exclusive new receipts/run IDs.
- Proposed20% median direct-HTTP reduction and five-before/five-after measurement are part of the approved design. They are a local acceptance comparison, not an SLA or accuracy target. A missed target is reported; no sample/model/architecture search until a favourable result appears.
- One fresh final whole-change review after source completion, before binding/cutover, avoids repeated immutable metadata preparation. Parent owns all subsequent terminal runtime/state/scans/docs gates and cannot treat review as runtime proof. Record this ordering and retained-checkout decisions as Native rulings.

## Review Focus

1. A file grows or disappears between scans: fresh growth is counted, a failed enumeration refuses the request, and no stale/partial successful total is substituted. Task1 owns these tests.
2. A Windows junction/symlink/root link or ordinary cloud-file reparse tag appears: reject links without traversing/modifying targets, preserve ordinary non-link file accounting. Task1 owns these tests.
3. A faster implementation drops one of the six base guards or the global cap/reserve: old/new decisions and codes agree, including equality boundaries and resident-RAM option. Tasks1/3 own these tests.
4. A benchmark gets a503, wrong identity, concurrent request or different class scores: stop without retry/replacement and do not accept a faster but different model/result. Task2 owns these tests.
5. Source-bound maintenance or a lost reply crosses profiles: old operation identity/history remains recoverable, no newer emulator data is replaced and no inherited source/creation capability is silently promoted. Tasks3/4 own these tests.

---

## Execution prerequisite

- [ ] Read current workspace/app/archive instructions, approved spec, Native/TDD/workspace/verification skills and current source/contracts. Create `.superpowers/sdd/2026-10-24-inventory-worker-output-scan/` with plan identity, pre-edit working-file snapshots using neutral `.snapshot` suffixes, current HEAD/source/scientific/private/report hashes, listeners/profile and full document/Auth/Storage baseline. Do not reuse the completed procurement ledger. Inspect live operations and serving evidence capacity; do not lower limits or close unrelated apps.

## Task 1: Fresh serving-only counter and guard-equivalent supervisor

**Files:** create `research/inventory_context_runtime.py`, `research/test_inventory_context_runtime.py`. Read but do not modify frozen `runner_runtime.py` and `inventory_inference.py`.

**Interfaces:**

- `measure_output_bytes(directory: str | os.PathLike[str]) -> int` returns total regular-file bytes for the admitted tree; raises `runner_runtime.RuntimeSafetyError` for rejected links, invalid roots or enumeration/stat errors. No caching, mutation, subprocesses or fallback counts.
- `ContextServingSupervisor(directory, limits, root)` subclasses `_StockSupervisor` with the same inherited constructor/run lifecycle. Only override `preflight(self, required_available_bytes=None, include_resident=False) -> dict`.
- Counter/supervisor use the existing100MiB global cap. `preflight` preserves `last_snapshot` and the base order/conditions/codes, then performs the global-root check. `run` must be the inherited `_StockSupervisor.run`, not a new worker lifecycle.

- [ ] Write tests `nested_empty_zero_and_large_file_totals_equal_frozen_counter`, `one_fresh_file_stat_is_reused`, `second_scan_observes_growth`, `growth_after_enumeration_before_stat_is_counted`, `unreadable_or_disappearing_entry_never_returns_partial_total`, `root_or_nested_link_is_refused_without_touching_target`, `ordinary_nonlink_reparse_metadata_is_not_blanket_rejected`, `hardlink_counts_per_path`, `native_windows_junction_is_refused`, `all_base_guards_match_frozen_supervisor`, `global_cap_and_equality_match`, `inherited_run_and_limits_are_unchanged`.

Pin representative assertions, using owned isolated trees and controlled snapshots:

```python
self.assertEqual(measure_output_bytes(tree), frozen_runtime._output_bytes(tree))
self.assertEqual(measure_output_bytes(tree), 17 + 31)  # after a fresh growth scan
self.assertEqual(ContextServingSupervisor.run, frozen_stock._StockSupervisor.run)
self.assertEqual(old_failure_code, new_failure_code)
```

Test available RAM `<required`, RSS `>max`, disk `<min`, run output `>max`, wall time `>max` and root output `>100*1024**2`; equality is accepted. Exercise `include_resident=True`. Include missing/failed native inspection. Test all boundary values on both implementations, not just counts of calls. Assert native junction targets/marker bytes survive rejection and cleanup; optional native-symlink inability is reported rather than silently counted as coverage.

- [ ] Run `python -m unittest discover -s research -p test_inventory_context_runtime.py -v`; expect RED for the missing serving module/interfaces.
- [ ] Implement iterative `os.scandir` traversal with `os.stat(entry.path,follow_symlinks=False)` reused for type/link/size. Do not substitute cached `DirEntry.stat` sizes for this fresh check; the between-enumeration/growth test pins that difference. Check root and directory traversal admission, reject symlink/mount-point junction tags, preserve ordinary file/cloud behavior, and count hardlinks per path. Fail closed on errors. Keep paths inside the admitted tree and never follow a rejected link.
- [ ] Implement only the serving preflight policy using existing native snapshot/Job membership and disk APIs plus the new counter. Do not call the frozen base preflight, since that would retain its expensive scans. Do not globally monkeypatch the frozen runtime. Copy the small guard policy faithfully; tests are its parity gate.
- [ ] Run the new unittest module and `test_runner_runtime.py`; expect GREEN, native cleanup confirmed and frozen source hashes unchanged. Use short owned test paths under `research/datasets/wos-<8hex>` for real supervisor fixtures to meet the existing output-root contract; other pure fixtures may use ignored short TEMP. Record counts/skips/scoped checkpoint without committing.

## Task 2: Registered timing harness and original-worker baseline

**Files:** create `scripts/inventory-context-performance-qa.mjs`, `scripts/inventory-context-performance-contract-qa.mjs`, `research/benchmark_inventory_context_output_scan.py`. Evidence under ignored `outputs/inventory-worker-output-scan-20261024/`.

**Interfaces:** the Node script exports `performanceMedian(values:number[]):number` and `compareStockPerformance(before,after):{passed:boolean,medianBeforeMs:number,medianAfterMs:number,reductionFraction:number,maxProbabilityDelta:number,reasons:string[]}`; importing it causes no profile reads/network/model calls. CLI:

```text
node scripts/inventory-context-performance-qa.mjs --phase before|after --profile <private-profile-path> --run <worker-scan-UUID> [--baseline <before-summary-path>]
```

Exactly five serial direct requests; output exclusively to `outputs/inventory-worker-output-scan-20261024/performance/<run>/<phase>/`. No automatic retry or overwrite. `--baseline` is required only for `after`. Run identifiers use `worker-scan-` plus UUIDv4; refuse unsafe/extra/duplicate arguments and any non-loopback/unexpected project profile. Reuse `inventoryAILaunchEnvironment(profile,'StockResearch')`; tokens remain in memory and never enter reports.

`PerformanceSummary` has schema `inventory-context-performance-1.0`, phase/run/count5, scenarioSha256, modelSha256/datasetSha256/developmentSha256/evaluationSha256, manifestSha256, sourceFiles, samples and provenance/limitations. `scenarioSha256` hashes `canonicalInventoryAI(fixedScenario)`; `sourceFiles` is sorted `Object.keys(manifest.sourcePins)`. Before must contain39unique paths; after the same paths plus `research/inventory_context_runtime.py`, total40. Each sample stores requestId, label, probabilities, outOfRange, prediction/worker/native/service/HTTP milliseconds, peakRssBytes, observedAvailableBytes, treeBefore/treeAfter `{files,bytes}`, native cleanup/status and request/output identity. Private per-probe request/response/native/worker receipts are retained. No class truth label or accuracy field is calculated.

Use one fixed fictional eleven-fact fixture: on-hand600, reserved20, reorder500, movement18, adjustments1, receipt-age10days, additional demand50 due in2days, incoming0/null ETA/statusnone. Derive fourteen features and input SHA with existing helpers. This builder-selected fixture is within the recorded individual-feature ranges; that does not establish typicality or joint-distribution coverage. The earlier three descriptive probes used reorder80 and correctly retained a reorder-distance range warning; they are not the registered baseline. Before any new timing run, verify/record that the new fixture has no per-feature range warnings; never adjust it after observing timings/scores. Fresh UUIDs only; do not use scientific TEST rows.

- [ ] Write Node tests `import_has_no_side_effects`, `five_samples_median_and_exact_twenty_percent_boundary`, `nonfinite_missing_or_replaced_samples_fail`, `identity_or_score_change_rejects_even_when_faster`, `HTTP_failure_or_busy_stops_without_retry`, `wrong_endpoint_or_profile_never_sends`, `concurrent_output_directory_change_refuses_comparison`. Pin medians1000→800 as passing and1000→801 as failing; altered scientific SHA/label/scenario or missing native cleanup always fails. Across independent calls, require all ten samples' labels/range warnings to agree and probability vectors to match the first baseline sample with relative tolerance0/absolute tolerance1e-12, recording maximum delta. This follows existing RF14 native parity tests and accommodates parallel floating-point accumulation;1e-10 changes fail. Within each request, the service/worker probability values must still match exactly.
- [ ] Run `node --test scripts/inventory-context-performance-contract-qa.mjs`; expect RED for missing exports/collector behavior.
- [ ] Implement helpers/CLI. Require health `artifact_ready` before each call, explicit22-second client timeout, current protocol/model/scientific/source identity, full `validateContextPrediction` (including ranges/provenance), and one matching new native request directory. Stop on failed/busy/timeout/unconfirmed cleanup; retain failure evidence, do not continue to another sample. Record last native observed RAM distinctly from admission. Compare direct HTTP medians with `after<=before*0.8`; preserve unchanged scientific identity/numerical scores while allowing fresh request/serving-manifest IDs.
- [ ] Implement `run_output_scan_benchmark(output:Path)->dict` and CLI `python research/benchmark_inventory_context_output_scan.py --output <exclusive-ignored-directory>`. Create one owned fixed tree of1024files×1024bytes plus16zero-byte files and empty directories, without copying project datasets. Both counters must return1,048,576bytes. Record five paired runs, alternating old/new order, exact counts and timings. Keep the fixture/evidence; no history deletion. Micro timing is descriptive; HTTP median defines the acceptance target.
- [ ] Run the Node contract suite and the microbenchmark; expect GREEN/exact equal bytes, retained timings and no source/runtime changes. The new module is not yet wired into serving.
- [ ] **Before Task3 pinned edits**, run the `before` phase against the then-current verified39-source RF14 profile. Current safe receipt is `outputs/inventory-demo-procurement-20261024/profile-receipt-03.json`; verify it still matches live service rather than forcing stale settings. Capture five successful serial samples and an exclusive baseline summary. Record source pins/tree counts/caps and first complete batch selection before implementation. Stop for infrastructure failure and retain it; any replacement batch needs a ledgered reason fixed before observing new results, never a latency-based choice. Checkpoint the valid baseline and do not rerun it to seek a faster/slower comparator.

## Task 3: Wire RF14 inference and forty-source binding

**Files:** modify `research/inventory_context_inference.py`, `research/test_inventory_context_inference.py`, `backend/functions/inventoryContextAI.mjs`, `scripts/inventory-ai-profile-qa.mjs`, `scripts/inventory-context-command-qa.mjs`. No frozen scientific file, UI, rules or Firestore schema changes.

**Interfaces:** `ContextExecutor(manifest,output_root=None,*,_command=None,_supervisor=None)` stays unchanged. Its default supervisor becomes `ContextServingSupervisor`; test-only `_supervisor` injection remains internal. Its inference admission global-size check uses `measure_output_bytes(ROOT/SERVING_REL)` with the unchanged reserve:

```python
if measured_bytes + inference_limits().max_output_bytes > TOTAL_OUTPUT_BYTES:
    raise StockUnavailable('Context serving evidence capacity reached')
```

`native_prepare` continues using the original `_StockSupervisor` and frozen `runtime._output_bytes`; no preparation shortcut. Append `research/inventory_context_runtime.py` to both identical ordered serving `SOURCE_FILES` arrays, total40. Profiles remain schema5 and wire protocol2; old result decoding/recovery stays supported.

- [ ] Add/run RED tests `RF14_default_uses_serving_only_supervisor`, `admission_uses_fresh_counter_and_reserves_ten_MiB`, `preparation_still_uses_original_supervisor`, `serving_helper_tamper_refuses_binding`, and Node source-list assertion for40identical unique paths including the new helper. Pin90MiB+10MiB admission equality accepted and one byte over refused before launch. Adapt existing aggregate-refusal mocks to the actual new counter, preserving their refusal/busy/launch assertions.
- [ ] Add compatibility regression `completed_old_manifest_outcome_replays_after_source40_profile_cutover`: finish an operation under one configuration, then change token/fingerprint/serving-manifest SHA while retaining the model/scientific identities. Resolve/retry must return its original experiment/result/source SHA without another model call, new record or provenance change. Expect GREEN on existing correct recovery before and after wiring; do not mislabel this as a newly failing behavior or change the recovery contract.
- [ ] Make only the wiring/list changes. Keep manifest checks, estimator loading/prediction, metadata preparation, error/recovery and limits intact. Do not optimize other observed costs in this pass.
- [ ] Run new runtime tests; `test_inventory_context_inference.py`, `test_serve_inventory_context_local_eval.py`, `test_inventory_inference.py`, `test_serve_inventory_local_eval.py`; and Node profile/stock contract/command/client suites. Expect GREEN, all native cleanup confirmed, strict helper tamper rejection and unchanged scientific hashes. Required actual metadata-audit tests retain no-fit/no-unpickle/no-TEST guards. Use current `scripts/prepare-functions.mjs` and verify generated copies where relevant; no generated helper enters Git.
- [ ] Capture source-complete scoped package for final review. Keep the old baseline immutable; source-bound live services may now refuse until the deliberate fresh-binding cutover. Do not misreport health/source admission or request another performance baseline.

## Task 4: Reviewed cutover, acceptance comparison and handover

**Files:** create `docs/INVENTORY_WORKER_OUTPUT_SCAN_2026-10-24.md`; update stock completion audit, existing local guide, research README, PROJECT_ROADMAP.md, outer MSI_SETUP_STATUS.md and archive CHAT_HANDOVER.md. Private helpers/receipts under the new output directory; this plan's own Native ledger.

**Interfaces:** consume Task2 immutable `before` summary and Task3 source40 code. New profile receipt exposes only safe paths/hashes/schema/provenance. `after` phase emits its own five samples, summary and comparison; do not modify the old summary or frozen study.

- [ ] Use Native's one fresh whole-change reviewer at source completion, with approved spec/plan, scoped pre-edit baseline, Review Focus cases and ledger. Fix Critical/Important findings RED→GREEN plus the affected suite; record Minor deferrals and all declined-judgment rulings. No second review. Parent must still certify every terminal gate below.
- [ ] Verify protected scientific/private/report hashes, then create exclusive fresh RF14 metadata and schema5 profile from the then-current profile. The launcher-approved private profile location remains `outputs/inventory-ai-20261023/profile-<UUID>/private.json`; this plan's safe receipt/logs belong under its new output directory. Stock manifests remain under the serving root's `manifests/`. Keep the RF14/scientific SHA identities unchanged, source count40, explicit demo capabilities and parcel authentication. Inspect parcel manifest pins; refresh its metadata-only binding if and only if affected, without retraining, label/evaluation work or camera tests.
- [ ] Confirm no active operations. Export/hash-verify **then-current** emulator state before any stop; handle the known Windows rename error only through the fresh complete official staging export and exclusive verified copy. Reidentify/stop owned services only. Import into one stack and restore stock/parcel/app as required. Verify all documents/accounts/objects exactly, permitting only established normal Auth import timestamp variance. No older-state substitution, password reset, unrelated app closure or limit reduction.
- [ ] Check health/source pins and run Task2 `after` with the same run ID, new profile and original baseline. Require five samples, exact fixture labels/model/scientific IDs and numerical score parity as specified in Task2, successful native cleanup and at least20% lower median direct HTTP time. Report tree/caching/load differences, all raw timings and limitations. If the target is missed, finish unaffected correctness/state gates to make the result reviewable, then report it without new models/parameters/sample selection and seek a decision before claiming acceptance or broadening implementation. No automatic persistent worker or older-state rollback.
- [ ] Run actual RF14/Firebase/browser recovery and affected workflows sequentially: `inventory-demo-procurement-emulator-qa.mjs`, `inventory-demo-procurement-browser-qa.mjs`, `inventory-demo-reorder-emulator-qa.mjs`, `inventory-demo-emulator-qa.mjs`, `inventory-demo-browser-qa.mjs`, `inventory-context-emulator-qa.mjs`, `inventory-ai-emulator-qa.mjs`. Use disposable fixtures/exact cleanup and current profile; old completed outcomes and source-linked operations retain original provenance/identity. Run original `smoke-firestore.mjs` and `qa-review.mjs` through the inspected preservation harness with fresh baseline/run/parent-GO gates. Include the stock-assessment regression if source/contract inspection shows an affected path. Never start a second emulator. Stop and diagnose any failure before continuing.
- [ ] Run affected unit/native/profile gates, build, lint/no-new-warning, tracked/history/expanded/outer secret scans, generated-copy equality,40-source parity, immutable scientific/private/report hashes, ignored datasets/evidence, Markdown links and `git diff --check`. Recheck final1665/116/2 or the **then-current captured** full baseline, not a hardcoded replacement target. Reidentify final listeners and preserve safe restart pointers. No source edit after fresh binding without regenerating affected immutable metadata and repeating actual checks.
- [ ] Save measured before/after medians/reduction, microbenchmark, resource/cleanup receipts, changed source versus unchanged model identity, failures/limitations, final review/rulings and remaining genuine-history/independent-accuracy gaps. Update guide/roadmap/handover and complete the Native task gate only after all evidence passes. Keep branch/ignored workspace/evidence local; no commit/push/deploy. Camera/otherAI/extras remain deferred.

## Self-review and execution handoff

Spec coverage: fresh exact accounting/link/error/growth semantics→Task1; native guard parity/inherited lifecycle→1/3; fixed-tree and registered five-before/five-after evidence→2/4; RF14-only wiring and unchanged preparation/scientific basis→3; source40/immutable schema5 and old recovery→3/4; then-current preservation, real application checks, review and handover→4. Every Review Focus case has an owning test. No spec requirement is intentionally omitted.

Type consistency: scanner returns integer bytes or a resource error; supervisor retains the old constructor/preflight/run contract; RF14 constructor/wire protocol are unchanged. The benchmark's median helper requires exactly five complete finite nonnegative samples, with a positive baseline median; identity comparison allows only request/serving-source changes. Task2 produces the baseline path consumed by Task4. No HTTP-caller counter/bypass argument exists.

The user approved this four-task plan on24October2026; Native implementation is authorised. **Native execution is already selected.** No product code, source-bound runtime, model, dataset or current service was changed to prepare the plan. Do not repeat the approach/design/label-origin/execution-method questions. Do not repeat plan confirmation; execute all four approved tasks.
