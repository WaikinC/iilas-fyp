# Trusted parcel live server implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Keep actual failing/passing verification and independent review evidence.

**Goal:** Provide recoverable trusted scoped live sessions and bounded retained-frame inference with a separate closed intended-use gate.

**Architecture:** Dedicated live commands use private start/frame receipts and actor locks with public allowlisted sessions/frames. Reserve before authenticated byte ingestion; only trusted server writes retained Storage objects. Completion/stop transact on the same session and exact snapshots/coordinates. No existing photo evidence/projection changes.

**Tech stack:** Existing Firebase Admin/Functions/Firestore/Storage, Node22, Python API; built-in Node tests and existing explicit-project local emulators.

**Spec:** `docs/superpowers/specs/2026-10-21-parcel-live-server-design.md`, parent `2026-10-21-parcel-live-sessions-design.md`.

## Global constraints

- Separate null server-owned live pin with intendedUse=sampled-live; no request/env admission. Existing registered-photo pin and Python admission stay closed.
- Session120000ms, <=12 reservations, >=5000ms between server reservations, one in-flight slot, frame lease<=60000ms and session expiry; deadline<=50000ms inside existing Function60s.
- JPEG<=1048576bytes/960px long edge, canonical base64<=1398104chars; bounded Storage write/read10s, HTTP30s including body<=16KiB.
- No client live Storage writes. Shared reads use only current user/config (two distinct documents maximum).
- Same current private scope/stage/assignment approval and exact version snapshots; no stock/handover/IDs/balances/dashboard/inventory/delivery changes.
- Preserve all nine sealed training sources/cohorts/models/results and147unopened candidates. No ML fit/test scoring/activation, production, deploy/push/history copying or private artifact tracking.
- Reuse existing MSI loopback emulators sequentially; no wrapper/second emulator; Node22.13+within22/JDK21/npm.cmd/current researchPython.

## Review focus

1. Multiple tabs use different start IDs: immutable Blocked receipt/actor lock prevents parallel sessions and later replay from becoming new work.
2. Access/assignment changes then restores: exact snapshot versions and plan-presence semantics still fence finalisation.
3. Stop races stored-byte write or remote completion: null-safe terminal outcome, exact generation/nonce cleanup, no successor lock release.
4. Base64 payload conflict/replay, pathological JPEG headers and stalled object/body I/O: bounded memory/time, no duplicate write/inference or raw-error leakage.
5. Retained frame review loses storage/reviewer authority mid-flight: generation revalidation plus final reviewer/frame/version transaction fails closed.

## Task 1: Shared live validation, policy, DTO and distinct pin

Files: `lib/parcelLive.js`, `.d.ts`; `backend/functions/parcelLiveAcceptance.mjs`; `scripts/parcel-live-qa.mjs`, `scripts/parcel-live-response-qa.mjs`; focused response validator `backend/functions/parcelLiveResponse.mjs`. `prepare-functions.mjs` copies shared validators as existing modules do. Keep these distinct from existing photo validation and response intended-use boundary.

- [x] Write/run failing cases for exact commands/UUIDs/types/time/base64 bounds, session/frame state transitions and public field allowlists/null states/lineage/reviews; photo-only and caller-owned pins rejected.
- [x] Implement pure validation/canonical policy helpers and `requireParcelLiveAcceptance`/`validateParcelLiveResponse` with exact hash/order/score/confidence/timing/service/session/frame bindings. Pin remains exported null. Response requires `intendedUse:'sampled-live'` and matching sessionId/frameId/sequence as well as evidenceSHA and lineage; ties Abstained/null.
- [x] Run focused tests and declarations; independently inspect the policy hash and no sensitivity-bearing public fields.

Task1 pure unit complete:32owned+19independent51passed; parent reran51;121combined regressions, focused lint and strictdeclarations/consumer pass. Inherited-iterator canonical/output-copy defect fixed with observedred/green. Frozenhandoff02/independentreview under ignoredoutputs. Packaging source imports/copy intentionally transfer to Task2, not deployment-ready yet.

## Task 2: Commands, bounded ingestion and rules

Files: `backend/functions/parcelLive.mjs`, dispatch `service.mjs`, `firestore.rules`, `storage.rules`; `scripts/parcel-live-command-qa.mjs`.

Exports/signatures: `startParcelLiveSession(auth,scope,input)`, `reserveParcelLiveFrame`, `analyseParcelLiveFrame`, `resolveParcelLiveSession`, `resolveParcelLiveFrame`, `stopParcelLiveSession`, `reviewParcelLiveFrame`, each same3args returning safe public DTO. Commands and records exactly as spec; no raw exceptions. Helpers may be split by clear responsibility if needed. Existing `approvedTransaction(auth,roles,callback(tx,config,account))` derives authority.

- [x] TDD all five review-focus groups with controlled external doubles and actual transaction semantics. No external I/O in transaction retry callbacks.
- [x] Implement immutable start/Blocked/frame receipts, actor lock, exact snapshots, slot/budgets, terminal replay, final clock checks and server-only null cleanup; use canonical map comparison preserving arrays.
- [x] Implement strict canonical base64 decode/JPEG actual dimensions/hash, create-only streamed/abortable Storage write with object generation pin and separately bounded revalidation for review. Use fixed error messages; no base64 in logs/docs/receipts.
- [x] Implement bounded live API request to `/predict/live-parcel`; explicit live wire requires session/frame/sequence/intendedUse so the photo endpoint cannot authorise it. Null pin/service returns durable Unavailable before bytes/Storage/HTTP.
- [x] Deny all private reads/writes, public direct writes, and all client live Storage writes; Approved fixed-scope public/image reads only. Preserve existing photo namespaces/rules, recording existing production lookup-budget issue separately.
- [x] Run focused tests, lint, generated copy equality, independent review/fix loop.

Task2 boundary verified on frozen04: parent/independent71 focused checks pass; native emulator52 direct groups cover actual Firestore/rules/Storage plus external accepted-model HTTP fixtures, with exact cleanup/config/Admin preservation. Generation, overall/known-lease observer and initial-scope safe-error findings fixed with preserved red/green. An already submitted native commit remains uncertain after timeout and requires same-ID reconciliation. Storage emulator's missing generation-precondition enforcement is explicitly not certified; mandatory SDK precondition is retained. Parent changed only unit-fixture token generation afterward;71 focused tests still pass and expanded360-file credential guard passes. Runtime source hashes remain frozen04. Required original application regressions and final documentation/preservation in Task4 remain outstanding.

## Task 3: Python distinct closed live transport

Files: `research/api.py`, `research/test_api.py`, new pure transport module/test only if isolation helps. None of the nine sealed training sources changes.

- [x] TDD strict live request/session/frame/sequence/image validation and authentication/resource controls; photo route behavior unchanged.
- [x] Add `/predict/live-parcel` reusing existing bounded one-worker executor and image pipeline only after separate trusted `_operational_live_admission` succeeds; default remains unconditionally false. No request/env switch enables it. Null/closed returns503 without executor or pixels. Accepted positive software tests use external injected fixtures only, never alter real artifacts.
- [x] Require explicit wire intendedUse/session/frame/sequence plus existing order/digest/hash/timings. Verify pure/API/serving/runtime tests using native MSI Python escalation as needed for Windows asyncio.

Task3 locally verified:12new+9independentASGI,19originalAPI,16serving and27runtime tests pass; Python-to-Node externalwire/policy compatibilitypass. Serving/runtime commands accidentally overlapped after an ongoing handle was returned; bothoriginaljobs inspected/polledterminalexit0, no restart or realML. Photo/live gates remainFalse, pinsnull. Research preservation02 confirms9sources/5models/oldcohort/protocolselection,147testclaimabsent and0privateartifacts tracked; API is explicitly reviewed permitted newsource outside9sealedfiles. No real operational acceptance or appconnection implied.

## Task 4: Real local integration verification and documentation

Files: `scripts/parcel-live-emulator-qa.mjs`; relevant README/roadmap/access/parcel contracts; `docs/PARCEL_LIVE_SERVER_2026-10-21.md` and ignored outputs.

- [x] Reuse exact existing emulator process; real Firestore contention/stop/expiry/access/rules negative scenarios and real callable null pin. Positive workers use external live doubles with actual Firestore and isolated names, never activate app model.
- [x] Run original smoke/QA, shared/account, affected stage/photo suites sequentially; build/lint/security; verify bounded new Storage read rule uses <=2distinctdocs and allclientwritesdeny. Cleanup only generated exact IDs.
- [x] Verify previous research sources/artifacts/testclaim/model gates/private exclusion and publish truthful local-only evidence. Record no physical-camera/model-quality acceptance; Task3 of parent plan still required for app connection.

Task4 verified21October: all seven original suites passed once sequentially, protected1,238documents unchanged/no fixture records, final integrated build03/lint03 exit0, tracked186/history246/expanded363checks pass, preservation05 keeps9sealed sources/5models/oldprotocol/cohort/selection/147testclaimabsent/closedpinsandgates. Named docs/PARCEL_LIVE_SERVER_2026-10-21.md created. Parent Task3 subsequently connected and verified the actual interface; its bounded-history fixes also passed independent review and parent28synthetic groups. Server software plan complete; full evaluated photo/live goal remains incomplete. No production operation, activation or publication.

Parent server implementation is only complete after all four tasks and independent review; controller unit testing cannot establish this boundary. Continuous execution proceeds with independent units when their interfaces are frozen. No automatic commit/push/deployment.
