# Parcel live-session foundation — 21 October 2026

The foreground controller, trusted commands/records/rules, closed Python live transport, bounded encoder and camera client/component are implemented and connected to the application. The backend passes independent review and52direct native emulator scenario groups. Twelve actual-app workflow checks, five focused native history checks,28parent-reproduced synthetic browser groups and all seven original application regression suites pass. **The local software checkpoint is verified; model and physical-camera acceptance remain incomplete.** The complete photo/live goal stays active.

Plans: [live workflow](superpowers/plans/2026-10-21-parcel-live-sessions.md), [trusted server](superpowers/plans/2026-10-21-parcel-live-server.md). Report scope remains [photo/live requirements](PARCEL_CAMERA_SCOPE_2026-10-20.md). Other AI and additional features remain deferred.

## Latest integration checkpoint

Trusted start/Blocked receipts/actor locks, frame reserve/ingest/stop/resolve/review and public/private rules now run locally. Exact acknowledged Storage generation is pinned before inference. The server operation starts before approval lookup and is bounded to 50 seconds, tightened monotonically once a new frame/session lease is validated. Delayed database reads/retries cannot schedule new positive work after expiry. An already submitted native commit remains ambiguous and requires explicit recovery with the same IDs; timeout cannot recall it. Initial approval failures use fixed safe messages.

Parent final focused verification:71/71 pass, including independent lease, clock, generation, review and safe-error probes. Independent final review finds no remaining blocker in that scope. Frozen04 native run7746 exited0:45 accepted-fixture real-Firestore groups,2 real Admin Storage groups,1 closed-null group and4 direct HTTP/SDK/rules groups =52 direct groups. The main orchestration count includes child groups and is not added again. Exact generated fixtures were cleaned; shared configuration and primary Admin remained unchanged. These positive inference cases use external accepted-model/HTTP doubles, not a real accepted classifier.

The camera client/component has26 focused tests and20 parent-reproduced real-Edge synthetic workflow groups, including delayed transport/encoder ownership, current-to-historical age, remote stop, multiple simultaneously mounted shipment panels, roles, recovery and exact retained-image byte/generation verification. After connection, the expanded22-group synthetic suite and12actual-app browser checks passed. The latter reuse real loopback Auth/Firestore/Storage/commands with disposable fixtures and synthetic camera media: manual file/camera flows, Warehouse and assigned Driver closed-pin starts with zero frames, real committed-response loss/reload/dispatch recovery using the original ID/stage, authority stop, sibling shipment panels, Proof acquisition exclusion and Viewer/mobile history. Four generated accounts,24documents and3objects were removed exactly; baseline records remained unchanged. Local-only history indexes were added without deployment.

Independent UI review found two P2 defects, both corrected with observed red/green: the latest20session limit hid older outcomes without navigation; reselecting the same saved session cleared frames without restarting its unchanged listener. Older/Newer/Latest now keeps20records per page and constant cursor state, preserves timestamp ties, empty-boundary return and failed-page recovery. A dedicated single-document current-session observer preserves remote-stop fencing while viewing history. Selected frames stay separately bounded to12, and repeated same-ID selection preserves imagery, review notes and its listener without another query. Independent final review02 finds no remaining blocker in this scope; all12frozen04file hashes match.

Native focused history checks use21Unavailable session metadata records plus one unrelated-shipment record, not an accepted model or positive predicted frames. Original handle34412 exited0: five groups pass, with2generated accounts/26documents removed exactly and no objects. Parent reproduced all28external-fixture browser groups independently on original handle53279, terminalexit0, under `outputs/parcel-live-ui-20261021/parent-review-04`. This includes the positive older Pending-review and repeated-selection scenarios; those positives remain synthetic only.

The expanded credential guard initially rejected one disposable unit-fixture token assignment; an ephemeral generated value fixes it without an exception. Final integrated build03 and lint03 exit0 after both UI fixes (six native-image warnings, no errors; bundle-size warning). Fresh tracked186/history246blob and expanded363file checks pass. Research preservation05 confirms9sealed training sources,5model artifacts, old cohort/protocol/selection, both closed gates, absent147test claim and0tracked private artifacts. All seven original application suites passed sequentially. Whole-database hash checkpoint `emulator-after-history-02.json` confirms1,238existing documents unchanged and zero remaining fixture documents after actual browser/history/regression work. The [trusted-server report](PARCEL_LIVE_SERVER_2026-10-21.md) records runtime hashes, evidence and provider limits. Later research implementation changes require their own fresh checks.

The [intended-use evaluation protocol](../research/PARCEL_INTENDED_USE_PROTOCOL_2026-10-21.md) records the separate source/photo/live evidence and visibility/grouping/resource requirements. Relevant independent public evidence and scientific acceptance decisions remain unresolved; implementation progress does not improve the measured classifier accuracy.

## Implemented and verified

`lib/parcelLiveSession.js` plus declarations provides explicit start/stop/dispose, one actual capture/submission in flight, no queue/retry, safe identities,120-second lifetime and at most12attempts. Capture-start and post-submission cooldown are at least5seconds; encoder bounds are1MiB/960px. Combined local frame deadline is60seconds. Results lose current status at15seconds from monotonic capture start; stop/context change makes them historical immediately. These are prospective software limits, not measured capability/FPS.

Pending open/capture/submit remains owned when abort is ignored, preventing replacement overlap. Late valid opens close. Unacknowledged close blocks restart until explicit durable adapter reconciliation. Synchronous callback/getter stop is fenced before opening/submitting/committing results. Events retain one allowlisted result and counters, never bytes/arbitrary data/raw errors. Predicted/Abstained may continue; failure/unavailable/stale/expiry stops.

`lib/parcelLive.js` plus declarations defines exact seven-command inputs, canonical policy/digests/keys, complete claim coordinates, time/resource/state/review helpers and safe DTOs. Retention Unverified/Unknown/Verified distinguishes missing identity from proof no bytes were saved. `parcelLiveAcceptance.mjs` remains null; `parcelLiveResponse.mjs` requires exact sampled-live policy/model/hash/order/score/timing/service/session/frame bindings. Photo-only acceptance cannot satisfy it. Functions preparation copies the exact shared validator into its ignored backend package; local acceptance/response imports consume that copy.

`research/api.py` adds authenticated `/predict/live-parcel`: streamed body<=1,410,000bytes, strict UUIDv4/sequence1..12/schema, canonical decoded bytes<=1MiB after admission. `_operational_live_admission` is independently unconditionalFalse; photo/request/env flags cannot enable it. Closed admission returns503 before decode/executor. External positive fixtures require worker-origin live intended-use/policy and existing approval/order/acceptance; route binds session/frame/sequence and reuses supervised executor cancellation. Real serving/runtime remain unapproved.

## Verification

| Scope | Actual result |
| --- | --- |
| Controller owned + original independent probes |83+17=100passed; parent reran100 |
| Additional independent controller probes |28passed |
| Combined controller/photo regression invocation |189passed; overlapping groups |
| Pure server contract owned + independent probes |32+19=51passed; parent reran51 |
| Combined pure live/photo regression invocation |121passed; overlaps above |
| Strict declarations/positive-negative consumers |Passed, no skipLibCheck |
| New Python live / independent ASGI probes |12/9passed |
| Existing Python API / serving / native runtime |19/16/27passed; software fixtures only |
| External Python-to-Node wire/controller-policy compatibility |Passed; real pin null/photo rejects live descriptor |
| Foundation build/lint |Passed; five existing image warnings/bundle warning |
| Foundation expanded credential check |341tracked/nonignoredfiles passed; integration needs fresh scan |

Ignored evidence: `outputs/parcel-live-sessions-20261021/`. Controller review found three stop-fencing defects (six failing probes), resolved with observed red/green and independent checks. Contract review found inherited array iterators changing canonical values/response copies after indexed validation; indexed traversal/copy fixes pass independent probes. These in-process findings are not demonstrated HTTP exploits. Failing artifacts remain.

Serving/runtime commands overlapped after serving yielded an ongoing handle; both original jobs were polled to terminal exit0 without restart. They used isolated temporary software fixtures; no fitting/real images/emulator suite ran in parallel. Later Firebase suites remain sequential.

## Remaining integration and acceptance

The bounded history correction, independent review, focused actual browser, final build/lint/security and preservation checks are verified. UI discloses retained/shared Approved access before explicit transmission, separates preview, and stops on hide/navigation/track/context change. No continuous video/audio/automatic training. No client live Storage writes; trusted commands enforce current authority and bounded create-only writes. Next core work is the separately planned once-only internal evaluation implementation and relevant public-data audit; real test access remains gated on reviewed code and a frozen prospective protocol.

Installed Storage emulator ignores generation-precondition queries. A preserved strict duplicate-write probe fails even though the SDK sends ifGenerationMatch0. The successful real Storage scenarios prove acknowledged metadata/CRC/bytes/review/replay, with providerCreateOnlyCertified=false; they do not certify the production provider's create-only enforcement. Keep the actual precondition mandatory.

Firebase permits at most two Firestore-document accesses per Storage Rules request. The live design was corrected to server ingestion and a user/config-only shared read policy. [Official Firebase limit](https://firebase.google.com/docs/rules/rules-behavior#security_rules_limits_2). Existing photo-create rules also exceed this production lookup budget; prior local emulator tests do not establish deployment feasibility. Resolve before any production deployment, which remains outside authorisation.

Scientific findings remain unchanged: inadequate damaged detection, closed negative improvement experiment,147reserved candidates unopened, no operational model acceptance. All nine sealed training sources/models/cohorts remain frozen. Independent intended-use data/scoring and physical-camera quality/latency/age/drop/interruption/resource evaluation are required. This foundation and Unavailable software behavior cannot complete the full goal.
