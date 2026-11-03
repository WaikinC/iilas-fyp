# Faster output accounting for the stock inference worker

24 October 2026. **Approach selected by the user: optimize the existing worker.** The user also selected AI-assisted prototype labels only. The user approved this written design on24October after a fresh builder check returned **nothing important left**. No application/runtime implementation has started. Preserve the existing Native execution preference and local/no-publication boundary.

## Intent and measured problem

Reduce RF14 stock-analysis response time without changing the classifier, inputs, scores, data provenance or safeguards. This addresses the partner report's NFR-3 performance measurement alongside the completed FR-9–13/24–27 demo workflow. It creates no new AI feature.

The [completion audit](../../INVENTORY_STOCK_AI_COMPLETION_AUDIT_2026-10-24.md) records three successful serial probes of one fictional scenario: RF probability calculation16.69–27.95ms, worker2.248–2.423s and full service6.894–7.505s. These measurements exclude Firebase and browser time and are not accuracy evaluation.

One further unchanged, supervised executor request was profiled. It completed in8.460s with native cleanup confirmed. Fifteen output-size scans accumulated6.888s; filesystem stat calls accumulated5.773s across21,556 calls. Two manifest validations accumulated1.021s. These cumulative times overlap and must not be added. Profiler overhead and uncontrolled MSI/filesystem load prevent treating them as general latency estimates, but they identify output traversal as the first optimization target. Evidence stays ignored under `outputs/inventory-stock-gap-audit-20261024/executor-profile.json`.

Current `runner_runtime._output_bytes` uses `Path.rglob` and separate symlink/junction/file/size queries for each entry. RF14 invokes the stock supervisor's per-run/global accounting repeatedly and also performs a serving-root admission scan. Counts must remain fresh; deleting retained evidence or trusting cached totals would change the safeguards.

## Approaches

1. **Optimize the existing per-request worker — selected.** Reduce repeated filesystem calls in serving-only output accounting. Keep a fresh supervised child for each request, all metadata/model checks and existing failure/recovery behavior. Smaller scope than a persistent model process; imports and model loading still cost time.
2. **Persistent model worker — not selected.** Could amortize startup/loading, but adds model residency, crash recovery and timeout/memory lifecycle work. It is unnecessary for the measured directory-scanning defect.
3. **Keep current performance — not selected.** Retains the verified prototype and documents its delay without improving the measured bottleneck.

This is a contained serving change with broader preservation verification. No GPU, dependency installation, WSL work, new model, retraining, scientific TEST replay, label review, UI redesign or production deployment is included.

## Frozen boundaries

Do not change `research/runner_runtime.py`, `research/inventory_inference.py`, the v2 scientific `PIN_FILES`, scientific protocol, datasets, completed phase claims, weights, hyperparameters, class order, input encoding, scores or synthetic metrics. Those original runtime sources are part of the consumed study's scientific basis. Changing a generic scanner would invalidate that basis.

Keep serving protocol2, profile schema5, the RF14 model SHA and all scientific dataset/development/evaluation identities. Only the serving-source manifest identity changes. All outcomes retain experimental false/null provenance. Human purchasing decisions cannot promote model accuracy. Preserve original Admin, IDs, balances, approvals, locations, Prepared-Shipment Handover and manual/linked purchasing recovery.

## Serving-only implementation

Create a small standard-library module, provisionally `research/inventory_context_runtime.py`:

- `measure_output_bytes(directory)` walks iteratively with `os.scandir`, fresh non-following stat information and no cross-scan cache. Count the same regular-file bytes at all nested paths, including zero-byte files. Count a hardlinked file per path, as the current scanner does; do not deduplicate or start accepting links.
- Reject symlinks and Windows junctions before descending or counting. Use the fresh stat mode/reparse tag to distinguish them; do not reject every reparse point, because ordinary OneDrive cloud files must retain their existing treatment. Recheck a directory at traversal admission so a detected replacement/link fails closed. Never follow a rejected link or modify its target.
- Use at most one fresh stat result for each ordinary file's type/link/size decisions, rather than separate Path predicates. Directory traversal-admission checks may add calls. Do not reuse stale file sizes between resource polls, skip old request directories, exclude files by extension, or follow arbitrary paths outside the admitted serving root.
- Propagate unreadable/disappearing/changed paths and invalid metadata as controlled resource-monitoring failure. No fallback to zero, partial totals or the old expensive algorithm after a failed safety check. This may reject a request during concurrent external filesystem mutation; it must not return a falsely low successful total.
- Root/directory validation must account for symlinks/junctions too. Temporary test trees must be owned and inside the workspace; tests must prove rejected-link targets remain intact.

`ContextServingSupervisor` subclasses the unchanged `_StockSupervisor`, retaining its `run`, Job creation/assignment/resume, two-thread environment, native monitoring, confirmed drain and quarantine behavior. Override only `preflight` to use the optimized counter. Preserve the existing signature including `required_available_bytes` and `include_resident`.

Because the frozen base supervisor has no counter-injection interface, reproduce its small preflight policy locally rather than editing or globally monkeypatching that scientific module. A parity test must exercise every existing guard and its decision/code: available RAM (including the resident option), aggregate RSS, free disk, per-run output, wall time and global serving-output cap. Preserve `last_snapshot`, native Job membership inspection and fail-closed monitoring. Keep per-run accounting and the100MiB global cap; the admission reserve remains one maximum request output. All current15-second/2GiB/two-thread/3GiB-startup and disk/output limits remain unchanged. Do not reduce poll frequency or replace native process-tree accounting.

Use the new supervisor and counter only in RF14 `ContextExecutor` inference/admission. Metadata preparation continues through the original audited supervisor. Legacy six-input inference, parcel inference, generic research supervision and scientific preparation/training/evaluation remain unchanged. No output-counter hooks, bypass flags or runtime options are accepted from HTTP callers.

Add the helper to the matching Python/Node RF14 serving source lists and profile tests, bringing39 sources to40. The Node list lives in `backend/functions/inventoryContextAI.mjs`; the Python list lives in `research/inventory_context_inference.py`. Current token-bearing profiles and old manifests remain immutable. New exclusive metadata/profile files must bind the new source. Inspect parcel binding dependencies and refresh metadata only if an affected pin requires it; preserve parcel authentication and frozen model identity.

Do not remove duplicate manifest checks or introduce metadata/model/prediction caches in this change. The measured scan is the single optimization hypothesis.

## Correctness and performance acceptance

Write failing tests before product changes. Test nested/empty/zero-byte/large-file trees, exact byte equivalence against the frozen counter on stable ordinary trees, hardlink-per-path behavior, link/junction rejection and untouched targets, errors/races, current-growth observations and all cap boundaries. Include native Windows junction coverage; record any unavailable optional native-symlink capability explicitly rather than treating it as exercised.

Run the old/new preflight policy against the same controlled native snapshots and tree sizes for every guard, with equal failure decisions/codes and unchanged limits. Retain inherited native cleanup/failure tests. The new module must be covered by source-pin parity and tamper refusal. Existing successful saved operations, prior model outcomes and source-linked purchases retain their historical identities and recovery semantics.

Before changing pinned source, capture **five sequential direct-service timing requests** of the same complete fictional fixture, with fresh IDs and no accuracy labels. After the fresh source-bound cutover, capture five equivalent requests. No inference overlaps, no history deletion or cache/result substitution, no app closing by the agent, and no resource relaxation. Record available RAM, existing tree files/bytes, model/scientific hashes, prediction/worker/native/service/HTTP timings and cleanup. Keep the currently measured three probes as earlier descriptive evidence, not the registered five-request baseline.

Also compare frozen/optimized counters on one owned fixed representative tree, verifying exact counts before comparing timings. This isolates the traversal from estimator startup. Do not copy private datasets into the fixture or claim a generic filesystem speedup from one tree.

**Proposed acceptance target (builder's call):** all correctness/preservation checks pass and the optimized five-request median direct HTTP time is at least20% lower than the registered baseline, with identical labels/probabilities for the unchanged fixture and the same model/scientific hashes. This is a local comparison, not an SLA, population percentile or accuracy improvement. Do not promise the target before measurement. If missed, report it, do not keep changing samples/model parameters until it passes, and seek a decision before claiming the optimization accepted or broadening scope.

## Cutover and verification

Capture the new plan's own pre-edit ledger/baseline in the existing dirty checkout. Preserve prior ledgers/evidence without reusing another plan's workspace. No stage/commit/push/merge is authorised. Check for active operations before source-bound maintenance.

Generate new immutable serving metadata and a schema5 profile from the then-current profile. Verify scientific source/phase/model hashes are unchanged. Export/hash-verify then-current emulator state before reidentifying/stopping only owned services; if official Windows export rename fails, verify and exclusively copy the fresh complete staging export. Never substitute an older checkpoint over newer work.

Restore one loopback stack, current stock/parcel bindings and the application. Verify exact document/account/object preservation, allowing only the established normal Auth import timestamp variance. Check readiness without printing private values. Run actual stock model/callable/browser recovery, affected demo/reorder/purchasing and legacy compatibility, both original Firebase regressions and relevant native/unit/profile tests sequentially. Include unavailable/cap/tamper/timeout/unconfirmed-cleanup behavior; no second emulator wrapper.

Build/lint, no-new-warning check, secret scans, source-list/generated-copy parity, protected/private/report hashes, ignored evidence, Markdown links and `git diff --check` remain required. One fresh final review under Native execution, fixes with RED→GREEN, and updated guide/roadmap/handover complete the change. Keep the full stock intended-use qualification open: the user still authorises AI-assisted prototype labels only. Camera, other AI and additional features remain deferred.

## Builder decisions and open approval

The module name, iterative traversal details and fixture layout may be refined by the builder within these constraints. The20%/five-request performance target is proposed here, not supplied by the user. No dependency, model or persistent worker may be substituted if it is inconvenient. Existing Native execution and no-publication preferences are settled and must not be asked again.

The user approved the approach and this written design on24October. The [four-task Native implementation plan](../plans/2026-10-24-inventory-worker-output-scan.md) is saved and self-reviewed for plan confirmation before product changes. The plan clarifies numerical parity using the existing RF14 native tolerance (relative0/absolute1e-12 across independent calls; exact transport values within each request), and declares its fresh five-request fixture before timing begins. These are implementation calls, not claims that the user supplied those details. Do not repeat the approach/design/execution-method choices.
