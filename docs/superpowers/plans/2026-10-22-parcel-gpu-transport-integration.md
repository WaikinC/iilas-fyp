# Closed GPU Descriptor Transport Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans after parent review. Steps use checkbox (`- [x]`) syntax. Parent approved implementation on22October. Adapter, runtime and API have separate file owners; actual model/native execution remains parent-owned.

**Goal:** Add an explicit GPU-descriptor artifact type to the existing parcel executor while photo/live operational admission stays closed.

**Architecture:** Extend the existing artifact union and worker dispatch; preserve the old selection path and all native lifecycle controls. A prospective provenance amendment binds saved original source bytes to historical evidence, while a new descriptor binds the actual updated adapter/runtime/API. No copied runtime implementation or global validator monkeypatch.

**Tech Stack:** Existing stdlib Windows runtime, FastAPI, TensorFlow/Keras and OpenCV; no dependency change.

**Spec:** Parent's22October design request; `2026-10-21-parcel-gpu-serving-compatibility.md`; existing source/photo/live contracts. Completed adapter-only cold proof:7.902s/484368384B under25s/2GiB. That proof does not cover the prospective typed executor.

## Global Constraints

- Parent approved the closed typed transport phase. This agent owns only the GPU adapter/tests and this narrow plan amendment; parent owns actual snapshots/descriptors/model/native execution.
- Both API admission helpers remain unconditionalFalse; both backend pins remainnull; health vision remainsfalse. No UI/Firebase/other AI/publication/deployment/production work.
- Keep accepted MobileNetV2 CLAHE artifact2fffa7aa...0ae4da, Normal/Damaged order,945optimizer steps,263model/6optimizer variables, exact preprocessing, ties abstain, uncalibrated confidence and human review.
- Preserve original training/evaluation/data/Windows-compatibility sources, claims, v1core/receipt/descriptor/cold proof and TEST population. No new fit, TEST inference or relabelling.
- Keep25s/2GiB/3GiB admission/768MiB floor/2GiB disk/64MiB output/one-thread supervision, named admission, cancellation, descendant drain and safe cleanup. Existing photo/live bounds and separate intended-use gates remain unchanged.
- Preserve Admin/shared-system/IDs/balances/Prepared-Shipment Handover and navy/purple eight-card interface.

## Review Focus

- Historical source mappings verify original evidence only; they cannot excuse current code drift.
- Partial/mixed/caller-supplied artifact configurations must not select a fallback branch.
- Descriptor/evidence changes between controller, worker and response must fail closed.
- Existing ownership/drain semantics must survive both artifact types.
- Artifact readiness and the new cold proof cannot activate photo or sampled-live HTTP inference.

## Exact affected files and interfaces

Modify, after approval:

- `research/parcel_gpu_serving.py` and `test_parcel_gpu_serving.py`: provenance-v2 amendment, explicit historical source roles and a compact binding reader.
- `research/parcel_runtime.py` and `test_parcel_runtime.py`: one additional artifact type plus typed serialization/dispatch in the existing executor.
- `research/api.py`, `test_api.py`, `test_live_api.py`: mutually exclusive server configuration and closed-route/startup verification.

No new runtime, backend/client change or scientific-runner edit is needed. Local historical source files are ignored evidence only, never imported/executed.

Add frozen `ParcelGPUArtifacts(descriptor_path: Path, descriptor_sha256: str)` alongside unchanged `ParcelArtifacts(selection_path, test_directory)`. The GPU type contains identity only, with a canonical server-owned path and64lowercase-hex pin.

Add `parcel_gpu_serving.descriptor_bindings(path, expected_sha256) -> {modelVersion,selectionSha256,evaluationSha256}`. Share the compact descriptor/receipt/current-code checks with `validate_descriptor`; omit model hashing/loading and full research traversal in this controller-only reader. The supervised worker retains all actual artifact/state checks.

## Task1: Preserve original identities and prospectively version provenance

Changing runtime/API invalidates old evidence checks: the original Windows request uses `win.code_bindings()` against current runtime bytes, the GPU adapter binds current runtime/adapter, and the independent Windows receipt pins the original API source. Do not rewrite those requests or patch their globals.

| Original source | Exact original SHA256 |
| --- | --- |
| `research/parcel_runtime.py` | `d529fba01dfcce6dc078e6f38219aba97f4fca502401d3742835fd3d1eedfe1b` |
| `research/api.py` | `8b6039659e64609fa0ecba48db535b010067b80fe30172c547982f635f59944a` |
| `research/parcel_gpu_serving.py` | `7d71e3363e1dbd05dcd533e8dd48ecdd38cc15414d20e049fc6884463072d2d3` |

- [x] Reuse the existing immutable13-source catalog `research/datasets/parcel-gpu-serving-20261022/frozen-proof-code-01/manifest.json`, SHA256 `39ddd0f1259f1ee0f62058834d9f33f78818b38779f61b343e1f6a5a7173404f`, with exact `{original_repo_path,snapshot_repo_path,sha256,bytes}` records. Never modify that manifest or execute its snapshots. It already contains original runtime, adapter and cold harness. One explicit gap is `research/api.py`, which is an original protected physical role but absent from those13records: preserve its unchanged bytes as a separate hash-pinned supplemental record before editing API. The exclusive prospective `parcel_gpu_transport_provenance_amendment_v1` binds the existing catalog plus that single API record, original accepted core/audit/descriptor/cold records, allowed current changes, unchanged science/resource policy and false/null acceptance. Original descriptor SHA is397037bbc46123528990db625388ac93951615ec8ab24044d1fc4e11d2a83ccd; resolve original artifact paths from accepted production/cold review receipts, not guessed folder names.
- [x] Add RED fixtures for missing/extra/foreign mappings, changed snapshots, an historical snapshot used as a current source pin and unlisted source drift.
- [x] Implement a finite original-identity resolver in the GPU adapter. Original Windows request code compares unchanged members to unchanged sources and only original runtime identity to its explicit snapshot; do not call current `win.code_bindings()` as the historical oracle. Original independent physical map uses runtime/API snapshots only for those exact logical keys. V1cold evidence uses original adapter/runtime identities where bound. All other historical checks remain strict.
- [x] Bump the GPU core/receipt/descriptor contract explicitly to schema2/v2 kinds. New core physically binds the amendment, original scientific evidence and **current** adapter/runtime/API hashes; add API to current code bindings. No snapshot exception applies to current code checks. Do not rewrite a v1document or call it current readiness after code changes. Original legacy selection serving remains supported.
- [x] Preserve the accepted raw/native/state/independent scientific checks, narrow metadata limits and reviewed numeric comparisons. Reconstruct all original metadata without TEST/model inference; no claim is reissued.

Acyclic order: snapshots+prospective amendment -> implementation freeze -> v2core -> v2offline receipt -> v2descriptor -> new native/API proof -> completion report. No new proof result points back into its descriptor.

## Task2: Typed serialization and explicit worker branch

- [x] Add RED tests for both supported dataclasses, unknown/mixed types, malformed pins/branch fields, pre/post binding drift, evidence changes, supervision-before-import and safe result fields.
- [x] Extend `_bindings(artifacts)` by explicit type. Legacy behavior stays intact; GPU calls the lightweight binding reader and returns the existing three binding names.
- [x] Add a private `_artifact_request(artifacts)` helper. Executor requests carry `artifactKind:'legacy-selection-v1'` with selection/testDirectory, or `artifactKind:'gpu-descriptor-v2'` with descriptor/descriptorSha256. Reject mixed/foreign GPU branch fields and missing GPU tags. Existing historical legacy-only internal fixture envelopes may keep their old interpretation; never infer GPU type from its shape.
- [x] `_execute` merges that branch into the existing request and keeps the same binding fences, manager, minimal environment,25s timeout, ownership/cancel/admission and cleanup.
- [x] `infer(directory)` retains supervision first and `parcel_train.worker_environment(directory)` before adapter/decoder imports. Lazily dispatch the selected legacy or GPU audit/predict function with exact configured paths/pin, preserving UUID/evidence checks and runtime-added requestId.
- [x] Keep `_safe_audit` and the false/null result contract. For GPU `_validate_result`, additionally pin exact RGB-letterbox224/CLAHE. Preserve the adapter's existing17fields; do not fabricate sampled-live approval/policy fields.
- [x] Run existing lifecycle/admission/cancellation/drain regressions plus new typed cases. Do not copy/subclass the whole executor or introduce a second manager/supervisor.

## Task3: Server configuration and closed API behavior

Add a small `_configured_parcel_artifacts() -> (typed_artifacts_or_none, configured)` helper:

- Existing complete `IILAS_PARCEL_SELECTION`/`IILAS_PARCEL_TEST_DIRECTORY` pair selects legacy.
- New complete `IILAS_PARCEL_GPU_DESCRIPTOR`/`IILAS_PARCEL_GPU_DESCRIPTOR_SHA256` pair selects GPU identity.
- Empty configuration remains not_configured. Partial/mixed/malformed pairs are configured/unavailable with no fallback or raw values in errors. HTTP bodies never supply this identity; environment approval booleans remain ineffective.

- [x] RED fixtures cover valid/empty/partial/mixed configuration, changed config after app creation, safe startup audit failure, readiness still unapproved and closed photo/live routes with zero inference worker calls.
- [x] `create_app()` captures typed configuration once; existing lifespan calls the same executor audit. Keep health visionfalse, both admission functionsFalse, `_parcel_run` approval checks and existing live worker-origin policy checks unchanged. Both real inference routes still return503; live remains gated before image decoding.
- [x] Preserve authentication, request schemas, streamed byte limits and disconnect handling. No backend or UI change follows.

## Task4: Minimum verification and fresh parent proof

- [x] Independently verify original snapshot hashes, exact new source diff, finite amended provenance/current pins and full metadata reconstruction; preserve failures.
- [x] Run new GPU adapter and existing input/legacy-serving/API/live-API tests, then affected native `test_parcel_runtime.py` sequentially with the selected toolchain. Parent controls actual native/model jobs. No Firebase/browser work is required for this closed Python-only change.
- [x] After source freeze, parent produces new v2core/receipt/descriptor and independently audits them. Keep original v1evidence intact; bracket checks with current source hashes.
- [x] Parent runs real `ParcelExecutor.audit(ParcelGPUArtifacts(...))` and one `ParcelExecutor.run(newUUID,base64,typedGPUArtifacts)` on the same firstsorted exposedVALID row through the actual manager/infer path. Measure complete parent/manager/child timing, aggregate peak memory, unchanged945/263/6state, exact response/evidence hashes and descendant drain under unchanged25s/2GiB. Old adapter-only proof cannot substitute for this new path; no TEST and no automatic cap increase/retry after failure.
- [x] Check actual local authenticated health and closed photo/live503 boundaries with typed configuration; distinguish startup audit from route inference. Independent final review binds code/provenance/native/API evidence and unchanged gates.

This completes closed typed transport readiness only. Meaningful intended-photo/live model acceptance and physical-camera evidence remain separate requirements.


## Approved phase checkpoint

Parent preserved the13-source catalog above, the supplemental API record at `research/datasets/parcel-gpu-serving-20261022/frozen-proof-api-01/record.json` SHA `6c395d91594b6729cba98c81d44e47601965bbec3daf548090a6585c8cd10cca`, and the prospective amendment at `research/datasets/parcel-gpu-serving-20261022/transport-amendment-01/amendment.json` SHA `f3447893ded20d1b463b5d24cb1fd3d4a38aa9a4a20ed61068a8ff77811739d2`. No additional archival step is needed.

Adapter implementation is frozen at `724c26fb91f3cdb8a4c8b012b4499c1e7f95404d99d2d28ee74f48713af47de8`; tests at `b5e6bf1dcc6c4294cc44e5b2fd482e214ae1a1abe587aa67c037661070f3ec0e`.31 artificial tests pass3.357s (`gpu-transport-adapter-green-05.log`); RED02/03/04/05 logs are retained. Core/receipt/descriptor use schema2/v2 kinds. Projection adds the exact `provenance_amendment` record; current code includes API. The finite offline catalog includes the three mapping documents, seven accepted proof documents and14source snapshots. Historical Windows comparisons resolve original runtime/API identities only; unchanged scientific sources and current code pins remain strict. `descriptor_bindings` returns only the existing three transport identity fields, without model bytes or offline traversal.

Fresh full metadata replay waits for all three source owners to freeze. Actual v2production, native executor proof and API boundary verification remain parent-owned and pending; no actual images/models/native jobs were read or run by this agent.


## Parent completion checkpoint — 22 October 2026

All closed typed-transport tasks above are verified. Parent full native/runtime40 and combined API/live/adapter/input/model/legacy92 tests pass; new proof-harness10 and API-observer6 fixtures pass. Actual descriptor02 binds frozen current sources724c/8dcc/a453. Typed proof62c74a53a5c311707622ecd450146ae8037b15c8756438118177d90b08203888 independently verifiede13a33d1ba617e94992bf9ebde1de009ef32b9f2f924cac665282d25ec2ccc52: audit2.371s, coldpredict22.942s/524738560B, zero outer Job members and no remaining leases. Actual API result65493619ef9690f073e8be02930a719de38caa2739b483fffe937290f65ef7b2 independently verified6e3bb1ed6145aba83184d48da02c84282425beea87e44937b7ae4994b09ed91e: real default startup audit, health200, wrongauth401 beforebody, photo/live503 without further subprocesses. API verification is direct in-process ASGI/lifespan, not network HTTP/browser/camera evidence.

Original unused API observer assumption (all Popen calls are managers) was corrected before actual execution; exactmanager/Git categories now distinguish12 startup Git checks from1manager. Six artificial RED/GREEN fixtures cover the correction; no production source change followed the132-check freeze.

Fullreport: research/PARCEL_TYPED_TRANSPORT_VERIFICATION_2026-10-22.md. Limited2.058s latency headroom needs development-only stage profiling. Independent photo/live intended-use quality, real camera/device/browser verification and separate acceptance remain outside this completed closed integration plan. Both API gatesFalse/backendpinsnull, sourceTEST consumed/no rerun, goalACTIVE/incomplete/public-only/otherAI deferred. No staging, commits, publication, deployment or production writes.
