# Trusted parcel live server — 21 October 2026

The local server supports recoverable, stage-bound live sessions and retained sampled frames. The real live acceptance pin is null and Python live admission returns false: the running application records **Unavailable**, without reserving frames, transmitting images or assigning a condition. This is verified software infrastructure, not accepted parcel AI.

See the [server plan](superpowers/plans/2026-10-21-parcel-live-server.md), [server contract](superpowers/specs/2026-10-21-parcel-live-server-design.md), [integrated foundation](PARCEL_LIVE_FOUNDATION_2026-10-21.md) and [full completion requirements](PARCEL_AI_COMPLETION_GOAL_2026-10-20.md). Other AI models and additional features remain deferred.

## Implemented boundary

Seven trusted commands start/resolve/stop sessions, reserve/analyse/resolve frames and review retained outcomes. Private immutable start/Blocked/frame receipts and actor locks preserve original IDs through uncertain responses and prevent concurrent work from becoming a replacement inference. Public sessions/frames use allowlisted fields, with fixed safe errors and no private configuration, image payloads or raw exceptions.

New work checks current Approved staff, fixed shared scope, shipment stage, Driver assignment, exact authority/shipment/plan/model snapshots and session/frame coordinates. Final transactions repeat the relevant checks. Historical replay and explicit resolution remain available after capture leases expire; replay never schedules fresh inference. Human review revalidates the retained object and version and preserves the inferred label.

Sessions allow at most 12 frame reservations within 120 seconds, with at least five seconds between reservations and one in-flight slot. Frames require canonical base64, actual JPEG dimensions, SHA-256, at most 1 MiB and a 960-pixel long edge. Clients cannot create/update/delete live Storage objects. Trusted ingestion uses CRC checking and a mandatory create-only generation precondition; only the acknowledged object generation is eligible for inference/review.

The operation starts before approval lookup. Its 50-second observer tightens monotonically to a validated new frame/session lease and cannot extend on transaction retries or backward wall-clock movement. Protected reads, write scheduling and callback completion use the same deadline fence. Storage I/O is separately bounded to ten seconds and live HTTP to 30 seconds with a 16 KiB response body. A commit already submitted to Firestore cannot be recalled by a local timeout: its result is uncertain until explicit same-ID resolution.

`/predict/live-parcel` requires the separate sampled-live intended use, matching policy/model lineage, session/frame/sequence and evidence digest. Registered-photo acceptance cannot authorize live analysis. Both Python admission helpers remain unconditional false; neither an environment variable nor a request flag opens them.

## Verification evidence

Evidence is local and ignored under `outputs/parcel-live-sessions-20261021/`; positive model/HTTP fixtures are external software doubles.

| Scope | Evidence and result |
| --- | --- |
| Focused command/deadline/generation/error checks | `parent-handler-final-04.log`: 71 passed, zero failed. Independent final review: `deadline-review-final-02.md`. |
| Native server integration | `emulator-run-05-freeze04.log`, original handle 7746, exit 0: 52 direct scenario groups. This is 45 external accepted-worker groups using real Firestore, two real Admin Storage groups, one real closed-pin group and four HTTP/SDK/rules groups. Child orchestration is not counted again. |
| Historical lease behavior | Frozen04 verifies elapsed-lease terminal replay/review/resolve/stop without another image write/inference or legacy prediction projection. |
| Original application regressions | `original-regressions-aggregate-01.json`: all seven original smoke, QA, shared, account, parcel-evidence, parcel-analysis and guard suites passed once sequentially. Original entry/helper sources unchanged; generated fixtures removed exactly. |
| Existing local records | `emulator-after-history-02.json`: all 1,238 baseline documents unchanged, zero new fixture documents, configuration and primary Admin unchanged after original suites and actual browser/history checks. Earlier checkpoint01 is preserved. |
| Final integrated build/lint | `parent-integrated-build-03.log` and `parent-integrated-lint-03.log`: both exit0 after the two history/selection fixes; six native-image lint warnings, zero errors and a bundle-size warning. |
| Credential exclusion | Standard tracked scan:186files; reachable history:246blobs. Unchanged rules expanded to tracked plus nonignored files:363passed in `parent-expanded-scan-04.log`. The flagged disposable unit token was replaced with an ephemeral generated value; no guard exception was added. Later research changes require fresh checks. |
| Research preservation | `preservation-05.json`: nine sealed training sources, five model artifacts and original cohort/protocol/selection preserved;147-candidate test claim absent, both real pins null, both Python admission helpers false, zero tracked private artifacts. |

Frozen04 runtime SHA-256 values:

- `backend/functions/parcelLive.mjs`: `e5f4fd2c6d48888ca563d70b709974e183a5253e4520f2fd64d242d0b8f4a699`
- `backend/functions/parcelLiveDeadline.mjs`: `f32c7ca119a7aa4bcac28ce3c3cd288af95e2f021a9d31630f0f47cb03d9de7d`
- `backend/functions/service.mjs`: `fabb5c16bdcb0f1d144df7fa936a0a05393f60be141163a4777175e229118405`
- `backend/functions/access.mjs`: `846a0ded9d5418a68e8e8ecd42dee91e6f0060de0d9d2eb6e0b35f16d8a76e16`

The owned unit-fixture token-generation change occurred after the runtime freeze. Its test-file hash therefore differs from the historical freeze list; runtime hashes remain fixed and the 71 focused tests passed again. Earlier failing probes and harness attempts remain preserved.

## Limits and remaining work

Firebase Tools 15.30.0 Storage emulator ignores generation-precondition queries. A strict duplicate-write probe failed because the emulator accepted a replacement despite `ifGenerationMatch:0`; the failing proof remains preserved. Passing real Storage scenarios explicitly record `providerCreateOnlyCertified:false`. They verify bytes, acknowledgement metadata, generation-pinned reads, replay and rules, not production-provider create-only enforcement. The SDK precondition remains mandatory.

Live shared Storage reads use only the current user and shared configuration, respecting the two-distinct-document budget; all client live writes are denied. Existing photo-create rules exceed that production lookup budget. Local emulator success does not remove that separate deployment limitation. No deployment or production change is authorized here.

Actual app connection passed12closed-pin browser checks and five native history checks. The bounded Older/Newer/Latest history fix and repeated-selection frame/review preservation pass independent final UI review and28parent-reproduced external-fixture browser groups. A separate bounded current-session observer preserves remote-stop fencing while historical pages are open. These software checks remain distinct from scientific and physical-device acceptance.

Model quality is insufficient: the selected MobileNetV2 correctly classifies 75/133 development validation images (56.39%), with Damaged precision 21/47 (44.68%) and recall 21/53 (39.62%). Suitable independent shipping-parcel/photo/live evidence, scientific acceptance, the controlled unopened internal test and physical-camera quality/latency/resources remain incomplete. The full photo/live goal remains active.
