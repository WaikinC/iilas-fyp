# Bounded parcel worker integration — 22 October 2026

## Latest regression checkpoint

After the separately reviewed TAMPAR metadata repair and public-photo qualification, the current isolated research run completed45 modules/866 top-level tests with zero failed modules and existing optional skips retained, original session16684 exit0. Log SHA256ca55a7ba01f65a3908f40f08031414cf16b5cbffdf058b79da8e12d18a98b794. Four ownership markers are absent afterward. The older44-module failure below remains preserved; it did not reproduce and its original cause remains unknown. No warm scientific/serving source or acceptance gate was changed by the TAMPAR repair. The [new data report](TAMPAR_DEVELOPMENT_QUALIFICATION_2026-10-22.md) records20 audited public views and advisory labels, with no new model accuracy or camera acceptance.

## Current profile amendment checkpoint

The separate `parcel_warm_worker_120s_v2` profile is now implemented and independently reviewed. It permits a maximum120-second native worker lifetime, retires at110 seconds, admits reuse strictly before90 seconds and retains the25-second per-request deadline,12-second idle timeout and12-frame maximum. RAM, CPU, disk and output limits remain unchanged; the original cold runtime and scientific sources remain frozen. The41 targeted protocol/worker/runtime checks pass, including watcher-error retention. These fixtures verify profile wiring and artificial age boundaries; they do not measure an elapsed120-second native run.

The revised observer uses per-cache capture paths, accounts for combined output and terminal receipts, writes the exact binary bytes it budgets, and awaits shutdown independently of monitor failure. Both final review findings were reproduced before repair; all11 artificial observer checks now pass and scoped independent review is clear. The complete isolated research suite finished44 modules with43 passing and one runtime-module error (819 top-level tests). In `test_idle_watchdog_drains_without_new_request`, the tiny manager became failed after returning a valid result; production correctly rejected it before ACK or the test's idle-age adjustment. Successful stock cleanup removed the native reason, so this is unresolved rather than an assumed idle bug. Fixture-only bounded diagnostic preservation was added and its artificial check passed; one separate26-test native rerun passed in30.285s with stock cleanup. The failure did not reproduce and its cause remains unknown. Neither that rerun nor the actual measurement below makes the original full suite green. Neither application gate is open.

## Actual profile-v2 reuse measurement

After independent prospective source/request review, one separately qualified default-worker measurement completed successfully, original session68159 exit0. Bundle03 SHA-256 is `dab3da809ca11d287a68ab36f7e55680d15b4f50872819c6243c0858c1b2bd10`; request `e9382d78-206d-4fb3-a0b7-8e5b9e7e7ac4` has SHA-256 `f21eb952cc0c3e87003c2b0250c38af2a5d663dd70da134d04482935f60147f9`. Proof SHA-256 is `dfe69cc301d7739bc273473cc877824b52b2279d25290840fe45ebb60f16596c`.

Both distinct request IDs used the same cache object, native Job, manager PID and readiness identity, and returned the exact earlier CPU probabilities for the same already-exposed VALID image. Metadata/IO-inclusive phases took18.149s cold and5.604s warm; executor durations were17.348s and4.778s, with individual predictions0.547s and0.376s. Sampled parent-plus-Job RSS peaked at760,229,888 bytes (725.01MiB); minimum sampled free RAM was4,266,725,376 bytes. Sampling gaps remain; these are not continuous peaks or actual browser/network timings. No TEST, fitting, new accuracy or camera acceptance was produced.

Shutdown took0.901s and required parent native reap after the graceful wait, yielding manager exit137. The independent retained query observed zero active members, stock cleanup returned, capture errors were empty and all four leases were absent. No native worker-success or manager-success receipt exists for this forced shutdown; do not call it graceful. Independent actual audit receipt SHA-256 `d302ff1dfd01039ca6aab06a90681774e344facbc48077ba3f18f8d8286f2bab` verifies87 assertions and66 physical hashes, including exact native Job absence on the host. Historical attempts and snapshots remain untouched.

## Actual warm-factory loopback HTTP

The separately reviewed HTTP02 probe, source SHA-256 `ce26c76e409166eb40f62ac027389911dec11fb71e720d3a5f6336c857c371ee`, completed once (original242a32, exit0) in3.921s. It used the real warm factory/executor and a prebound ephemeral literal127.0.0.1 port. Health returned200, wrong authentication401, and both closed photo/live routes503 with no labels. Startup used one cold metadata-audit manager plus18 expected Git checks; request handling started no subprocesses and loaded no model. The executor closed with an empty cache and the server cleanup was verified. Independent receipt SHA-256 a72ad4ed6669f63662c01fc1503d4ecba6f6a007833c6facfba7a516c9ec2596 verifies66 assertions and21 physical hashes, with request directories and all four markers absent. This is actual HTTP lifecycle evidence, not positive application inference, Firebase/browser testing or physical-camera evaluation. Tokens, headers and environment were not saved.

## Original short-profile history

The application-compatible warm executor and loopback server factory are implemented. The complete isolated research suite passes all44 files, covering812 top-level tests. **Two real attempts did not establish reuse across two requests**: the first exposed an idle-timer bug; the second showed insufficient reuse headroom after a correct cold response. The feature remains incomplete and both operational gates remain closed.

## What changed

`parcel_warm_protocol.py` binds a separately hashed five-source bundle to the original serving descriptor, exact image/request identities and bounded, exclusive request slots. `parcel_warm_worker.py` loads one context, handles the initial request once and accepts serial later frames through those slots. Every prediction retains the original artifact hashes, full model-state checks, preprocessing and human-review requirement.

`parcel_warm_runtime.py` admits one request with no queue, owns the shared research leases, expires idle workers, handles cancellation and deadlines, and confirms native Job drain before stock request cleanup. Failed or unconfirmed cleanup blocks replacement. Exclusive directory creation never authorizes deletion of an existing request. Known manager failures cannot be replaced by a successful cached result.

`serve_parcel.py` composes the original API factory and closes the executor on lifespan exit. It captures only server-owned artifact configuration, restores the temporary construction environment, requires existing authentication and binds the CLI to literal `127.0.0.1`. It grants no operational acceptance and starts no model merely because the closed app starts.

The original adapter, runtime, API, reuse primitive and scientific sources remain unchanged. The original descriptor does not certify the new modules; each prospective bundle separately pins them. No frontend or Firebase data contract changed.

## Real attempt and correction

The first attempt used bundle `f4ea13b7520a34048f03891432191fd95ce3ec367b4991cf12bde9cb673b7949` and request `7a3740bbfddb3f75b1159fc54a745a29156ab373568654bd0c190fb8f4f5fc21`. Original process session41256 is terminal exit1. The failed proof remains preserved, SHA `134a44480e77aacd903d7c8b7bad0409866e5decc2f8dca502aa2d6ffb271d00`.

The first response reported **14.532 seconds** inside the executor and **0.428 seconds** for its image prediction. Its probabilities exactly matched the previous CPU reference. These timings have different boundaries from the earlier internal reuse probe. Only the first request ran; no second response exists. The raw first-phase monitor has185 samples, maximum sampled parent-plus-Job RSS533,209,088 bytes and last elapsed14.880s. Metadata/IO checks leave sampling gaps, so this is a sampled maximum.

The controller counted active initial loading as idle time and marked the cache for retirement after12s. A tiny artificial worker reproduced that error before the correction. Idle retirement now applies only when no request is active; the20s retirement target, reuse-before15s rule and native25s cap remain unchanged. The regression and genuine-idle-expiry check both pass. All five bundle-01 sources were copied to an ignored snapshot before this repair; its failed attempt is not rewritten or retried.

The failed attempt independently confirmed zero native Job members, manager exit137 after forced parent reap, request-directory removal and absence of all four shared/native markers. It does **not** establish graceful shutdown or a successful native worker receipt. Independent failure audit SHA `c67757617ea3e3f51b89013205e6006d83d54593675071bb9951523d356fac88` records these limits.

## Verification status

Before the timer repair,34 runtime/factory checks and12 protocol/worker checks passed. Independent code review found and resolved terminal-result, contention and final-decode expiry defects. The measurement harness's six artificial tests pass. After the timer repair, its targeted active-versus-idle checks pass; complete verification and a separately prepared source-pinned follow-up remain pending.

Build passed. Lint passed with six existing image warnings. Credential scans passed for186 tracked files,246 history blobs and419 expanded current files; no datasets, outputs or private configuration were tracked at that checkpoint.

The original shared-process full research command failed:806 tests, two failures,66 errors and seven skips. An existing intake fixture invokes the real offline worker setup in the test process, leaving socket, temporary-directory and imported-module state that contaminates later tests. A minimal artificial reproduction confirmed the socket denial causes Windows asyncio initialization failure. The replacement `test:research` runner executes every existing test file serially in a fresh interpreter, preserving the original assertions, skips and offline guards. Its five focused checks pass. The parent-owned complete isolated run, original session22519, is now terminal exit0: **44 files,812 top-level tests**, with the existing optional skips retained. The failed shared-process run remains preserved and is not counted as passing.

## Separately qualified follow-up

After independent review and the complete isolated suite, bundle02 `ed35ecf4eb6c9852c6fc95d901d593c609040e013e03fccf1f7d233ced35d43f` and request `90c918ff3c03aa25bf2789a939586b67a102eedef12be2531b6264442f373e5c` ran once. Original session80598 is terminal exit1. Both returned results matched the exact CPU reference, in **14.408s** and **14.893s** inside the executor, with image predictions0.455s and0.409s. These were **two cold workers with different Jobs**, not successful warm reuse. Metadata/IO after the first response crossed the15s reuse window.

The observer then tried to capture the replacement cache into the first cache's exclusive filenames. That diagnostic collision occurred after successful native drain and caused filesystem cleanup and lease release to remain unconfirmed. The original failed proof is preserved. Independent review `2f082ed8b3e6e9bee0c3f5b00f3ccf88c7024590b1e219d6e67ecf688a904ece` confirmed both exact Jobs and all original owner/manager processes were absent; later PID reuse belonged to unrelated processes and was not terminated.

The parent preserved the second cache's files in a new ignored reconciliation directory, ran the stock known-file cleanup on its exact verified-dead UUID, and removed only its two empty owned lease directories. Reconciliation receipt SHA `bc07a408756880aef9504de3a72eb5d2b8cac65f0bc2a16dc678d9814abdcdea` records completion. No model/native process remains active from either attempt. Future diagnostic captures must use per-cache directories and must never prevent stock cleanup when observation itself fails.

## Remaining core work

The25s whole-worker profile leaves too little reuse headroom after measured cold startup. Prepare and review a **separate bounded warm-worker lifetime profile**, keeping the25s per-request deadline and existing RAM/CPU/disk/output constraints distinct. The proposed120s worker maximum is not implemented or admitted yet; do not silently apply it to the original cold or scientific runners. Preserve both failed attempts and source snapshots. Repair the measurement observer, add native lifecycle boundary checks, freeze a fresh bundle and prospectively verify actual reuse before another model attempt.

Then verify the actual factory's loopback HTTP startup, authentication, closed-route behavior and shutdown. Its separate ignored probe and three artificial checks are ready and prospectively reviewed, but the real HTTP invocation has not run. Positive application transport, justified exact-artifact acceptance, independent intended-use quality and physical-camera/browser/device evidence remain required. Internal prediction speed alone does not prove live Current age below15s.

No new accuracy, test-set reuse, fitting, operational activation, deployment, production mutation or Git publication occurred. Public-only data collection and deferral of the other AI models remain in force. Datasets, weights, raw results and private configuration remain local and ignored.
