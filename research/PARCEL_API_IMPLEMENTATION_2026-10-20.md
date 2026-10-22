# Parcel API transport implementation — 20 October 2026

## Distinct closed live transport — 21 October 2026

The [live foundation](../docs/PARCEL_LIVE_FOUNDATION_2026-10-21.md) adds `/predict/live-parcel` with separate unconditionalFalse admission, service authentication before body, tighter streamed/decoded bounds, strict session/frame/sequence/input and worker-origin live policy wire. New12 and independent9ASGI tests pass; existingAPI19/serving16/runtime27 pass. External Python-to-Node wire and policy compatibility pass. No real model/held-out pixel or scientific acceptance; trusted session handlers and app camera integration remain in progress. Existing photo admission stays closed and cannot grant live use.

## Photo outcome wire update — 21 October 2026

The [verified photo lifecycle](../docs/PARCEL_PHOTO_OUTCOMES_2026-10-21.md) requires explicit Normal/Damaged class order and an acceptance digest at the backend boundary. Python serving/runtime expose `classOrder` and null `acceptanceSha256` while approval remains false. API admission is still unconditionally closed; positive transport fixtures need valid order/digest and cannot grant production acceptance. Parent wire/API/serving 37 tests and full native-runtime 27 tests pass (two pure tests overlap). No bound training source/artifact changed and no model activated.

Implemented tasks 1 and 2 of the [integration plan](../docs/superpowers/plans/2026-10-20-parcel-api-integration.md). This prepares transport; it does not activate a model or complete application photo/live analysis.

## Behavior

- `api.py` authenticates before reading bodies, independently caps streamed JSON and decoded base64, and sanitizes errors. Inventory/delivery request/result semantics are covered by compatibility tests.
- Parcel paths use `parcel_runtime.py` and the shared serving adapter. Legacy `vision.py` is no longer the HTTP parcel path. Heavy image/model imports stay in a supervised disposable worker.
- One admitted parcel request uses bounded Windows Jobs, CPU/RAM/disk/output limits and a deadline. Cancellation, disconnect, failure and completion drain descendants before releasing local admission.
- Cross-process admission retains the prior Job identity through manager death. A persistent marker prevents an abandoned mutex from admitting a successor before the previous Job drains. An unqueryable stale marker requires local investigation; recovery is documented in the research README.
- Results bind request, image, selected model and evaluation hashes; ties remain abstentions. Integrity-ready artifacts retain `operationally_approved: false`. HTTP operational admission stays closed even after a successful integrity audit.
- Health is a cheap timestamped snapshot, with no private paths and no claim of usable parcel inference.

Independent review found and corrected descendant-drain and transient marker-read races; final reread reported no outstanding actionable findings. Tests use disposable software fixtures, not a real parcel model.

## Verification

Parent command on MSI, using the research Python from `research/`:

```powershell
python -m unittest test_parcel_runtime test_api test_parcel_serving test_runner_runtime -v
```

**81 tests in 103.569 seconds: 80 passed, one skipped** because Windows symlink creation privilege was unavailable. After the last narrow marker-read correction, five focused tests passed in 8.745 seconds: the new regression plus asynchronous Job drain, abandoned-mutex exclusion, manager-crash cleanup and cross-process recovery. A subsequent scan flagged a literal disposable test value; replacing it with a generated fixture value retained the environment-isolation test, which passed separately in 1.243 seconds. No production credential was involved.

Ignored `.superpowers/sdd/2026-10-20-parcel-api-integration/parent-verification-01.log`, `parent-verification-02.log` and `parent-verification-03.log` preserve the runs. Windows asyncio tests required execution outside the restricted socket sandbox; no production endpoint was used. These tests do not measure model quality or camera performance.

The normal tracked-file secret scan passed for 186 files. Reusing the same scanner in memory with Git's tracked plus nonignored-untracked enumeration passed for 270 files, including the new implementation files; the scanner source was not modified. `git diff --check` passed. All 1,193 Kaputt intake files were separately verified ignored and none tracked.

## Remaining core work

Follow [the Kaputt publisher-label decision](KAPUTT_PUBLISHER_LABELS_2026-10-20.md): implement explicit publisher-provenance support, verify pretrained checkpoints, freeze/run a development pilot and obtain independent evaluation evidence. Manual condition adjudication is no longer required for that source benchmark.

Before successful operational activation, task 3 still requires backend acceptance/hash/abstention validation and completion-time Driver assignment checks. Real-model acceptance, stage/request/result traceability, live sampling and physical-camera validation remain. No frontend/backend persistence/rules changed in this increment, so build/emulator suites were not repeated. No inference service was started, no production data changed, and no dataset/model was published.
