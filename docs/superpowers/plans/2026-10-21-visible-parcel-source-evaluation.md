# Visible Parcel Source Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Evaluate the independently admitted publisher TEST exactly once, MobileNetV2 CLAHE first and EfficientNetB0 none second, retaining auditable raw evidence and all 102 original dispositions without activating serving.

**Architecture:** One new stdlib controller/scientific module consumes the frozen audit admission and independent development proof. A new leaf adapter reuses the unchanged GPU runtime and compiled batch-four forward function; it does not alter the old training/data/runtime sources or rewrite TEST rows as VALID. The controller freezes metadata, then obtains an exclusive population reservation before any model execution; failed reservations stay consumed.

**Tech Stack:** Python 3.12.3 on verified WSL GPU environment; TensorFlow 2.21/Keras 3.15.1 only inside the native worker; artificial stdlib fixtures for this implementation.

**Spec:** `research/PARCEL_SOURCE_TEST_PLAN_2026-10-21.md`, current audit `load_audit`, accepted GPU development proof.

## Global Constraints

- New files only: `research/parcel_source_test_evaluate.py`, `research/test_parcel_source_test_evaluate.py`, this plan. No commit/push/deploy/upload; no real images, archives, models or native jobs by implementing agent.
- Exact accepted development key `aef72c6d16f6c23424533e801821ab37a1bd006ebe6d359030ce3a9f55c02507`; both fixed fit IDs, primary MobileNetV2; class order Normal, Damaged; exact probability ties abstain.
- 4 GiB host, 2 GiB GPU allocator, 6 GiB admission, 2 GiB live floor, one CPU, zero swap, 20 GiB free disk, 512 MiB total output, 180 seconds per model and 600 seconds for whole evaluation including scoring.
- Exact batch four with short final batch; unchanged `compiled_validation_forward` and preprocessing. No fit, updates, augmentation, thresholds or selection. Model file and all model/optimizer variables must match before/after; optimizer counters bind accepted development proof.
- Restore the serialized optimizer with `load_model(..., compile=True)`; a missing optimizer is a rejection. Never use `gpu.verify_native_files(...,180)`, whose180-second path is probe-specific; the new verifier uses unchanged `native.validate_native_result(...,180)` plus evaluator-specific512MiB command/request/tree bindings.
- Raw probabilities/logits/per-image CE, exact membership/order, devices, batch sizes, file/model/optimizer state evidence persist before scientific guards. Native evidence persists before controller guards; partial/failure evidence retained.
- Final audit admission, all dispositions, source identity, models, development proof, current code, environment, activation helper, fixed policy and successful preflight are frozen before predictions. Atomic reservation key derives full original source TEST population and fixed evaluation purpose, independent of filename/code/protocol/model key.
- Preflight must be artificial or already-exposed VALID, bound to exact code/environment/model artifacts and limits; parent performs actual proof. Serving pins remain null and evaluation is not operational acceptance.
- Report image/component-weighted accuracy, Damaged precision/recall, both F1, macro F1, confusion incl abstention, clipped-probability NLL and stable-logit CE, coverage/failures/all102 dispositions, always-Normal and strict same-output sensitivity. Bootstrap 2000 paired sorted-component draws, seed42, multiplicities retained, linear percentile; undefined replicates counted.

## Review Focus

- Concurrent or changed-code/protocol attempts on the same population cannot repeat model exposure (Task 1).
- Reordered/duplicate/missing/foreign predictions, changing model/optimizer state and native identity are rejected after preserving evidence (Task 2).
- Exact ties, absent predicted classes, one-class strict support and empty strict support retain null metrics with denominators (Task 3).
- Mixed-label components and resampled duplicate components preserve image and equal-component weights and paired bootstrap draws (Task 3).
- Audit, model artifact, environment/helper, proof and code drift between preparation and leaf/controller verification fail closed (Tasks 1/2).

---

### Task 1: Metadata protocol and permanent population reservation

**Files:** Create module and test file above.

**Interfaces:** `evaluation_policy() -> dict`; `validate_admission(admission: dict) -> list[dict]`; `population_key(source_sha256: str, admission: dict) -> str`; `reserve_population(source_sha256: str, admission: dict, protocol: dict, output: Path, registry: Path | None = None) -> Path`; `freeze_admission(admitted: Path, output: Path) -> Path`; `prepare(source_transport: Path, models: dict[str, Path], preflight: Path, output: Path) -> Path`; `read_prepared(path: Path) -> tuple[dict, dict]`.

**Transport amendment for review:** Windows audit metadata contains absolute Windows paths, while GPU environment verification is Linux-only. Add `freeze_admission(admitted: Path, output: Path) -> Path` on Windows: run unchanged `audit.load_audit`, bind complete admitted payload and original metadata bytes with explicit portable relocations, accepted development proof and all102population. WSL `prepare` consumes this snapshot and verifies all transported metadata and image encoded hashes, without decoding or rerunning Windows-path audit routines. No frozen loader monkeypatching or rewriting original metadata. Parent actual coldproof must exercise this exact transport and full protocol verification within the declared limits.

- [x] Write artificial tests for changed admission/order/denominators, duplicate/foreign/non-test rows and immutable source population identity.
- [x] Run tests with research Python; observe missing implementation RED.
- [x] Implement metadata-only binding/validation, proof extraction through unchanged audit validator, exact development model hashes and preflight bindings, current environment/helper/code policy comparison and exclusive permanent population directory.
- [x] Run tests GREEN, including same population with changed protocol/code/output rejection and metadata drift rejection.

### Task 2: No-update compiled TEST adapter and serial native controller

**Interfaces:** `validate_attempt(attempt: dict, rows: list[dict], model: dict) -> None`; `persist_attempt(target: Path, attempt: dict, rows: list[dict], model: dict) -> Path`; `evaluate(prepared: Path, output: Path) -> Path`; internal `_worker(output: Path, fit_id: str) -> None`; `verify_native(target: Path, prepared: dict, fit_id: str, native: dict) -> dict`.

- [x] Write artificial tests proving raw evidence remains after state/order/logit/count/batch/device guards fail; test file/optimizer/model hashes and full variable state.
- [x] Run RED before implementation.
- [x] Implement TEST-specific safe decode/batch adapter, reused compiled scorer, exact sealed request identity, containment proof before imports, file and full variable snapshots/counters, pre-guard incremental evidence and no-update checks.
- [x] Implement one controller with unchanged `exclusive_job` and `run_worker`, serial180-second native leaves,600-second whole deadline, native sidecar/request/envelope/terminal hash/command identity checks, permanent completed/failed reservation records.
- [x] Run GREEN using artificial metadata/array stand-ins only. Parent separately proves real GPU cold cost and verifies native transport before any TEST execution.

### Task 3: Deterministic metrics and paired uncertainty

**Interfaces:** `metrics(rows: list[dict], predictions: list[dict], component_weighted: bool = False) -> dict`; `summarize(admission: dict, attempts: list[dict]) -> dict`; `paired_bootstrap(rows: list[dict], attempts: list[dict], *, draws: int = 2000, seed: int = 42) -> dict`.

- [x] Write hand-computed fixtures covering ties, damage misses, undefined precision, weighted mixed-label components, strict filtering from identical raw outputs, all102 coverage, empty sensitivity and bootstrap pairing/multiplicity.
- [x] Run RED.
- [x] Implement image/equal-component confusion metrics with denominators, NLL definitions, always-Normal, full original disposition support and paired bootstrap with sorted groups and linear percentiles. Keep80%target descriptive/prospective and serving closed.
- [x] Run GREEN and affected source-audit/GPU scientific fixture suites sequentially. Record tests and limitations; do not run actual inference or change frozen sources.

## Review and execution

Plan must receive independent parent-arranged review before implementation. Parent owns actual preflight, final membership acceptance, actual bounded inference and independent raw/native/statistical reconstruction. The implementing agent supplies code/tests and artificial verification only. No commits are authorised.

## Implementation and parent handoff

Independent plan review passed through the existing `gpu_runner` agent before code. Parent approved the Windows freeze/WSL portable-byte verification amendment and separately bounded metadata preparation. Artificial RED preceded the initial implementation and the two review regressions (changed source header and post-comparator first-attempt replacement); subsequent fixes also bind incremental batches/full state files and native/controller fixed costs.

Prospective Windows metadata freeze02, executed by parent in the original configured app shell using its separately reviewed bounded helper:

```powershell
. ../Enter-IILAS.ps1
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe outputs/parcel-gpu-setup-20261021/freeze-source-evaluation-02.py e45672d1ea54447bfbc5149848447d4fe73307a428c16a9a8630f05550a812d3
```

The freeze is metadata-only but calls the original audit validator, which hashes the source archive and encoded admitted/neutral assets. The parent helper applies the separately declared600seconds/1GiB metadata job; this module does not start another Windows native job. It reads the fixed `admission-01/admitted-audit.json` and writes `freeze-02/transport/transport.json`. Only validated `.json/.md/.txt/.log/.py/.sh` authoritative metadata is copied; other authoritative path/SHA edges reject before copying. Images, weights and archives are never copied. `/mnt/<drive>/...` aliases require exact mounted-Windows provenance under the original repository (the named activation helper is the sole parent-folder exception).

The original bounded freeze01 failed before any model job or evaluation reservation: the untyped closure misinterpreted `sheet-01.png` inside the legacy development review's rendered document as authoritative metadata. Preserve failedfreeze01 and the byte-exact original evaluator/tests/plan in `outputs/parcel-gpu-setup-20261021/source-evaluator-v1-preserved` (source`d37568bb9b172ce6c05528c3f83c5a29e6938cde66582f2776e58d08d67f7179`, tests`40e52c6a873e465698bbd89253f2be50ed9a5766d6995162dafa56a1fdb373fa`, plan`6e582f8d8bb3bf1fe23b0e9392260bd4d36df2b3c508cadfdfe25ab09d534ff6`).

The prospective correction changes only `_walk_records`: the exact legacy review policy and six-binding ancestry grant its `bindings.rendered` document a narrow supporting-visual role. The first dereferenced JSON must itself satisfy the fixed blind-rendered contract. Its six PNG sheet references remain opaque, unchanged content in the original hashed JSON; neither relative nor absolute supporting PNG paths are resolved, read, copied or added as metadata mappings. All other path/SHA references still require explicit absolute authoritative metadata provenance. Relative metadata, missing/foreign authoritative JSON, untyped authoritative PNG and rendered proxy-JSON indirection fail closed. The75 admitted encoded-asset checks, scientific logic, native runtime, caps and population reservation are unchanged. Metadata-only replay of all freeze roots passed77metadata edges without touching binary assets. Artificial29fixtures and independent29fixtures pass; independent AST comparison confirms only `_walk_records` changed against the preserved source. This clears only the new metadata freeze02, with actual GPU coldproof and once-only evaluation still separate.

After source/tests are frozen and WSL is activated with the current helper, the parent runs this narrow Python interface from the app root (a new ignored parent-owned script may supply these exact arguments):

```python
from pathlib import Path
import sys
sys.path.insert(0, 'research')
import parcel_source_test_evaluate as evaluation

source = Path('research/datasets/parcel-source-test-evaluation-20261021/freeze-02/transport/transport.json')
# These must be the exact two develop02 artifacts and the original accepted
# development GPU transport; build_context verifies their accepted hashes.
models = {'mobilenetv2-clahe': Path('research/datasets/parcel-visible-gpu-20261021/develop-02/mobilenetv2-clahe/classifier.keras'),
          'efficientnetb0-none': Path('research/datasets/parcel-visible-gpu-20261021/develop-02/efficientnetb0-none/classifier.keras')}
development_transport = Path('research/datasets/parcel-visible-gpu-20261021/transport-01/transport.json')
preflight = evaluation.run_preflight(source, models, development_transport,
    Path('research/datasets/parcel-source-test-evaluation-20261021/preflight-01'))
prepared = evaluation.prepare(source, models, preflight,
    Path('research/datasets/parcel-source-test-evaluation-20261021/prepared-01'))
# Run only after independent actual coldproof/native/cost review:
result = evaluation.evaluate(prepared,
    Path('research/datasets/parcel-source-test-evaluation-20261021/evaluation-01'))
```

Keep `run_preflight`, `prepare` and `evaluate` as separate parent commands/steps so the actual preflight is independently reviewed before population reservation. Preflight uses exactly six sorted accepted VALID rows, batch4 then short2, same decoder/preparation/compiled scorer and restored optimizer/full-variable checks as TEST. No TEST row is relabelled or decoded in preflight. Projection is measured native fixed cost (including imports and post-score verification), plus first cold forward, plus twice projected pixel-based decode and steady forward costs. Whole projection adds twice measured controller overhead (cache/admission/cleanup/verification) and twice the actual artificial102-row primary+strict2000-bootstrap cost. All original180/600/resource limits remain unchanged.

The metadata preparation calls are outside the600-second execution/scoring deadline and must remain separately bounded by the parent. The evaluation deadline includes both native admissions/workers, raw/native rechecks, final context verification, primary+strict scoring/bootstrap and final output checks. A reserved population remains consumed on any failure; no automatic retry, output overwrite or serving activation exists.
