# TAMPAR qualification acquisition implementation plan

> For agentic workers: use superpowers:subagent-driven-development to implement and review this plan. The parent owns all actual network/image acquisition.

Goal: acquire the twenty prospectively selected public TAMPAR development photographs with provenance and enforced resources, leaving condition labels and model predictions absent.

Architecture: a new standalone acquisition module reads the exact frozen manifest/protocol and an independently reviewed fresh attempt request. It performs three serial bounded range requests per selected member, validates ZIP/JPEG integrity and preserves unchanged originals. A Windows controller assigns a suspended worker to a Job with explicit hard memory/CPU limits before resume, monitors existing resource checks, confirms zero members before releasing shared ownership, and preserves terminal receipts.

Tech stack: Python standard library/urllib/zlib/ctypes, existing runner_runtime/parcel runtime native primitives, OpenCV/NumPy sequential decode. No model framework, new dependencies, Firebase or product-interface changes.

Spec: ignored outputs/parcel-warm-integration-20261022/tampar-next-photo-qualification/qualification-packet-plan/plan.md and prospective-protocol.json. Manifest2702f323de45d2360d49efc488e26ab99fb0759b6e3d7c0edf54a2d1736320ef; protocolfb89b90ef5829888837844f53f34d460e09ea220c8e6f7a678ccc259783033d3. Independent metadata review approved the plan, with846 checks; later code/request/native enforcement still require review.

## Global constraints

- Development qualification only, exactly20 fixed selections. No final-test, accuracy, training, acceptance, new condition label or physical-camera claim.
- Original source category0/literal name remains separate from null IILAS visible-condition and human-approval fields.
- Preserve all732 source dispositions/712 omitted originals, four ID00 extras excluded,07/09 publisher-sample families held; never replace a failed or unsuitable image.
- Rights/group/exposure source authorities stay pinned. CC BY4.0 attribution and modification notes accompany unchanged originals. Same publisher ID remains one provisional family; global untouched/physical independence are not certified.
- Exactly3 range requests maximum/member, no retries/parallelism, publisher archive total6407977888. Strict206 and exact Content-Range; reject200 before body. Reserve request length+1 before each request and preserve actual/partial byte ledger and timing.
- Max128MiB total output and separately128MiB network reservation; originals106506935B. Do not persist compressed payloads beside originals (combined212731576B exceeds cap). Bound all logs/metadata/partial/temp files; reserve terminal receipt capacity.
- Max600s worker,45s socket timeout,1logical CPU/1native/OpenCV thread,3GiB startup free RAM,768MiB running floor,2GiB hard Job memory and monitored aggregate RSS,1GiB free disk,.2s resource sampling.
- Metadata-only parent; worker alone acquires/decodes, one image at a time. No TensorFlow/Torch/Keras imports, model operations, automatic pip installation or credentials in environment/logs.
- Fresh exclusive ignored research/datasets/tampar-development-qualification-20261022/attempt-01. No resume, overwrite, cleanup of other attempts, source changes or automatic retry.
- Original scientific/runtime/API files and failed suite/proofs remain unchanged. No deploy, production, Git stage/commit/push or private data.
- Use existing checkout due absolute provenance/user folder requirement. Standing user authorization for public dataset collection covers this bounded extension of existing acquisition flow; implement reviewable code and tests before actual acquisition, without another permission cycle.

## Review focus

1. Malformed/truncated/local ZIP metadata, mismatched filename/flags/method/CRC, inflate bombs and unsafe path must stop without replacement or relaxed bounds.
2. HTTP full responses, redirects to unrelated hosts, trailing bytes and timeout after partial delivery must remain charged and preserve failure evidence.
3. Native worker assignment/configuration failure, cancellation, timeout or uncertain drain must block successor work and never release ownership early.
4.128MiB output includes partial files, logs and terminal receipts; source hashes remain checked before/after, no compressed/original double storage.
5. Source object class/base view must never become a Normal label, gold annotation, final split or operational approval.

## Task1: acquisition worker and pure tests

Files: new research/tampar_qualification.py; new research/test_tampar_qualification.py.

Interfaces: load_request(path,pin) returns strict source-pinned request and frozen twenty-row allowlist; prepare(output) creates metadata-only immutable request; acquire(request_path,pin) is supervised-worker-only; main CLI prepare/run/_worker has no arbitrary URL/selection/command options.

- [ ] Write failing artificial tests for fixed allowlist/no replacement, strict206/range/header/name checks, encrypted/unsupported ZIP, bounded inflate/CRC/trailing data, partial request charging/output reserve/exclusive writes, source drift and null condition fields.
- [ ] Observe RED without real data/network. Implement minimum strict readers/ledger and serial worker using patterns from old tampar_intake.py; never execute/import its hardcoded CLI.
- [ ] Observe GREEN using in-memory/local synthetic HTTP/ZIP/JPEG fixtures only. Real dataset pixels and network remain reserved to parent.

## Task2: native controller and lifecycle fixtures

Use existing native Job creation/assign/resume/query/drain primitives without editing or monkeypatching frozen scientific/runtime modules. Implement the necessary new controller locally; avoid a generic runner refactor.

- [ ] Write failing native tests using tiny synthetic workers: queried hard Job memory/affinity configured before resume; one CPU; mandatory drain/manager terminal on normal/failure/timeout/cancel; retained ownership on uncertain cleanup; no queue/retry/overwrite.
- [ ] Implement exact Job limit setup and query/readback, suspended launch, minimal environment, monitored existing Limits/preflight and bounded terminal receipts.
- [ ] Run on authorized normal Windows host with require_escalated. Coordinate a single native window; preserve failed receipts, never infer termination from a timeout.
- [ ] Independent code/resource/protocol review, then scoped fixes/re-review. Existing full-suite failure remains separately reported, not relabelled green.

## Task3: freeze, one actual acquisition and independent audit

- [ ] Parent prepares request binding exact code/source/manifest/protocol/resource policy, approved metadata-review receipt and fresh attempt path.
- [ ] Independent prospective request review before any network or decode.
- [ ] Parent confirms no competing native/model work and fresh resource admission, runs one acquisition with no retry.
- [ ] Reconcile all twenty ordered dispositions, encoded/decode hashes/CRC/dimensions, network/partial/output totals, unchanged source/code, native resource and zero-member cleanup evidence. Preserve every failure.
- [ ] Independent result audit before creating a later neutral-ID human/assistant development review. Do not populate human fields, final evidence or model scores.
- [ ] Update roadmap/handover and exclusion/secret checks. Full parcel goal remains incomplete pending positive integrated model transport, independent intended-use quality and authorized real-camera/device evidence.
