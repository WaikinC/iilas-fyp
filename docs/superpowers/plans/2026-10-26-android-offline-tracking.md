# Android Offline Delivery and Background Tracking Implementation Plan

Execution status26October2026: all independent implementation, source-review fix, build/unit/browser/emulator/model-preservation and handover gates verified. Native53/Node36; mobile Firebase5/rules90; original eight suites; broader27; stock11/purchasing-browser5/delivery10; automated acceptance21. Physical Android/native SDK/permission/sensor/actual USB-loss participation remains pending by explicit user choice. No commits/publication/production/parcel tests. The Native ledger and dated Android acceptance record contain receipts, decisions/costs and three deferred UI minors.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Native execution was already selected. Steps use checkbox (`- [ ]`) syntax for tracking. One fresh final source review; no implementer or review agent per task.

**Goal:** Build a local Android driver APK reusing React, with durable SQLite storage, recoverable automatic offline synchronisation and a visible native background location service, preserving the existing IILAS web/backend and data.

**Architecture:** A separate Android entry reuses React controls and styles inside Capacitor. An owned Kotlin bridge provides native Firebase Auth/calls, Room, WorkManager, private file storage and a location foreground service. Trusted mobile commands add immutable receipts and assignment/session fences while sharing existing delivery/evidence business rules.

**Tech Stack:** Existing React19/TypeScript/Vite8/Firebase web and Node22 backend; Capacitor core/android/cli **8.5.3**, Kotlin, Android framework LocationManager, AndroidX Room **2.8.5**, WorkManager **2.11.2**, Firebase Android BoM **35.1.0** (Auth, Functions and Storage only). Native dependency compatibility and generated Gradle/Kotlin tooling are pinned/locked at Task4. No paid plugin is required.

**Spec:** `docs/superpowers/specs/2026-10-26-android-offline-tracking-design.md`, approved26October2026 after fresh builder check returned “nothing important left”.

## Global Constraints

- Full MSI workspace remains together; `iilas-fyp` is the only Git checkout. Read both AGENTS files, latest CHAT_HANDOVER, requirements, scope and contracts. Existing Native preference; no commits, staging, push, branch switch or production/cloud registration.
- Capture a new neutral source/state/protected-file baseline in this plan's own ignored workspace before edits. Never reuse or modify another Native plan's scratch files. Preserve initial Admin, all original IDs/balances, current running stack and unrelated dirty changes.
- Dot-source `../Enter-IILAS.ps1`; Node22.13+within22, JDK21, `npm.cmd`/`npx.cmd`. Research Python remains the existing environment. Android Studio2026.1.3 is installed; discover any custom SDK before installing missing tools.
- Debug-only package `com.iilas.fyp.driverdemo.local`, namespace `com.iilas.fyp.driverdemo`, minimum API24, compile/target API36. No release build, Play publication, Firebase Android cloud app registration, Analytics/Messaging or production endpoint fallback.
- Cache20assignments/page;200pending status/evidence actions;2000pending points;10private evidence files≤10MiB each;120MiB total managed storage. Full storage refuses new work; pending rows are never silently evicted.
- Location target20seconds, one active shipment/device;30minute capture lease, online renewal every5minutes,4hour absolute session maximum. Offline lease expiry stops capture. No restart after reboot/force-stop. OS scheduling/provider variation is explicit.
- GPS batches≤25points/64KiB. Device-reported capture and server receipt time remain distinct. Previously valid captures can be submitted for up to24hours only with current valid actor/assignment/nonterminal delivery. Clock tolerance2minutes and monotonic sequence; older points are history-only.
- Native/web UID equality before protected UI. App-private credential-protected storage, no backup/export. No plaintext persisted passwords, token logging, arbitrary bridge HTTP/SQL/filesystem, direct client business writes, cross-account flushing or new Customer/staff access.
- Preserve all existing frozen studies/models/TEST artefacts/canonical hashes. No parcel image/camera/inference/training/testing, offline AI, stock/procurement queues, public network or blockchain queues. Ordinary PDFs are the evidence fixtures.
- One loopback emulator stack; Firebase suites sequential. Physical phone reaches only5001/8081/9099/9199 via targeted USB adb reverse. Do not use MSI LAN URLs or overwrite existing different device mappings.
- Native build: max2workers,1536MiB Gradle JVM,in-process Kotlin compiler,no persistent daemon. Check RAM/disk first; retain existing research guards. Do not run an Android emulator alongside model services by default.
- Every code task begins with a witnessed RED test, ends GREEN with its named gate and a neutral snapshot/ledger entry. Commit steps are replaced by preserved local snapshots under the user's no-commit instruction.

## Review Focus

1. WebView reload/account switch while a native worker has refreshed authentication: no cross-UID display, file access or queued send (Tasks4–6,8).
2. A stale GPS batch arrives after a newer manual web update or a new assignment/session: retain history only where authorised; never regress latest position or accept an old epoch (Task2).
3. Storage upload commits but acknowledgement/finalisation is lost, or the selected file changes: recover the exact original bytes/ID without overwriting another object or closing delivery early (Tasks3,5,6).
4. Airplane mode while USB reverse still reaches MSI: do not mislabel it as a disconnected-backend test; explicitly remove/restore only owned mappings and prove connectivity loss (Tasks9,10).
5. Device reboot, wall-clock change, permissions/authority loss or full disk during offline tracking: obey monotonic lease/caps, stop visibly, preserve queued identities and avoid silent restart (Tasks5,7,10).

## File and interface map

- `lib/mobileDelivery.js/.d.ts`: closed protocol, limits, payload/result validation, staleness/latest ordering and bridge-safe DTOs; generated backend copy through `scripts/prepare-functions.mjs`.
- `backend/functions/mobileDelivery.mjs`: local capability, assigned reads, Auth handoff, leases, exact receipts and mobile delivery/GPS actions; `deliveryWorkflow.mjs`: shared legacy/mobile transition preparation and writes.
- `backend/functions/mobileEvidence.mjs`: reserved upload/finalisation/recovery with bounded original-byte verification; `evidenceRegistration.mjs`: shared existing evidence authorization/registration preparation.
- `android/app/src/main/java/com/iilas/fyp/driverdemo/`: `MobileBridgePlugin`, `MobileEnvironment`, `MobileIdentity`, `MobileRepository`, Room entities/DAO/database, `MobileSyncWorker`, `LocationTrackingService`, `TrackingLease` and small DTO/adapters. Each owns one responsibility; split schema/entity classes as appropriate without renaming public bridge contracts.
- `src/features/mobile/`: platform bootstrap/auth adapter, driver shell, shipment/status/proof/queue/tracking views and styles. Android entry never mounts staff-root subscriptions.
- `scripts/prepare-mobile-local.mjs`, `mobile-build.mjs`, `mobile-device.mjs`, `mobile-*-qa.mjs`: safe source-bound profile/build/device setup, unit/native/browser/emulator acceptance and cleanup.
- Existing `lib/firebase.js`, `lib/workspace.js`, `src/main.tsx`, service/rules/indexes/source binding lists and docs change only at the named seams. Preserve the normal Vite build and web behaviour.

### Shared protocol decisions

`MobileRequest={protocol:'mobile-command-1.0',operationId:UUIDv4,action,payloadJson:string}`. Freeze UTF-8 payload JSON at queue insertion; `requestSha256=SHA256(payloadJson)` binds its exact bytes. The server parses and validates an action-specific closed payload, derives actor/scope and stores the original string/hash. Returning the same request ID/action/hash avoids cross-language float/canonicalisation guessing. No file bytes, passwords or auth tokens appear in payloadJson.

`MobileResult={protocol,operationId,action,requestSha256,state:'Pending'|'Committed'|'Cancelled'|'Rejected',recordId:string|null,version:integer|null,reason:string|null,replayed:boolean,data:closedActionDTO|null}`. Terminal replays match exactly except replayed. Stable safe reasons cover stale_version,assignment_changed,delivery_closed,invalid_clock,expired_capture,evidence_conflict and authority_changed. Authentication/capability/network failures remain transport errors where no new receipt can safely be written. Never widen the existing completion protocol.

Callables routed through the existing `command`: `getMobileAvailability`, `getMobileAccessContext`, `mintMobileWebSession`, `getMobileAssignments`, `getMobileShipment`, `mobileCommand`, `resolveMobileCommand`. Actions: `tracking.start`, `tracking.renew`, `tracking.stop`, `tracking.points`, `delivery.update`, `evidence.prepare`, `evidence.finalise`; exact payload fields are set in Tasks1–3. Private collections: `mobileRequests`, `mobileTrackingSessions`, `mobileEvidenceRequests`; no direct client read/write. Existing locations/locationEvents/evidence/deliveries remain authoritative public sources.

Native bridge methods are named and typed: `getEnvironment`, `signIn`, `establishWebSession`, `getSession`, `signOut`, `refreshAssignments`, `readAssignments`, `readShipment`, `chooseProofFile`, `enqueueProof`, `enqueueStatus`, `readQueue`, `retry`, `discard`, `startTracking`, `stopTracking`, `readTracking`. No generic transport/SQL/path method. `mobileStateChanged` events carry version/counters/state only. The JS adapter completes native/web same-UID sign-in and fences old callbacks; Android is the background session authority.

---

### Task 1: Closed mobile contracts and local capability baseline

**Files:** Create `lib/mobileDelivery.js`, `lib/mobileDelivery.d.ts`, `scripts/mobile-contract-qa.mjs`, `scripts/mobile-test-output.mjs`. Modify `scripts/prepare-functions.mjs`, `.gitignore`. Private baseline under this plan's own `.superpowers/sdd/2026-10-26-android-offline-tracking/` and fresh ignored `outputs/android-mobile-20261026/`.

**Interfaces:** Produces `MOBILE_PROTOCOL`, `MOBILE_LIMITS`, `validateMobileRequest(raw)`, `parseMobilePayload(request)`, `validateMobileResult(raw,request)`, `shouldReplaceLatest(incoming,existing)`, `validateMobilePage`, `validateMobileShipment`, `validateBridgeEvent`; plain closed JSON only. Limits equal Global Constraints. Result hash binds exact payloadJson bytes; string≤32768characters, envelope≤64KiB.

- [ ] Capture current Git HEAD/branch/index listing, nonignored neutral source snapshots, original report/skill/private-file hashes, frozen artefact/profile/checkpoint pins and currently running owned listeners. Read-only state inventory/export preconditions are recorded; do not stop anything.
- [ ] Write RED tests with assertions equivalent to:
  ```js
  assert.equal(MOBILE_LIMITS.pointBatch,25);
  assert.throws(()=>validateMobileRequest({...request,uid:'forged'}));
  assert.throws(()=>parseMobilePayload(requestWith26Points));
  assert.equal(shouldReplaceLatest({capturedAtMs:100}, {submittedAtMs:200}),false);
  assert.throws(()=>validateMobileResult(resultForOtherPayload,request));
  ```
- [ ] Run `node --test scripts/mobile-contract-qa.mjs`. Expected RED missing export/module. Implement closed validators, finite coordinates/accuracy/date/sequence bounds and no accessors/prototype pollution/coercion. Test exact limits, negative zero/Unicode/raw JSON identity and mutation/partial-result mismatches.
- [ ] Add generated copy and ignored Android build/assets/config/database/key patterns without ignoring native source or hiding evidence from the scanner.
- [ ] Run `node scripts/prepare-functions.mjs` and `node --test scripts/mobile-contract-qa.mjs`; expected GREEN and byte-identical generated helper. Preserve baseline and record task evidence; no commit.

### Task 2: Trusted assigned reads, identity handoff, tracking and delivery receipts

**Files:** Create `backend/functions/mobileDelivery.mjs`, `backend/functions/deliveryWorkflow.mjs`, `scripts/mobile-backend-qa.mjs`, `scripts/mobile-rules-qa.mjs`. Modify `backend/functions/service.mjs`, `firestore.rules`, `firestore.indexes.json` and shared contract types as defined below.

**Interfaces:** Consumes Task1. Produces `createMobileCommands({identity,clock})` exposing the seven routed commands. `prepareDeliveryTransition(tx,{scope,actor,member,command,shipment,plan,old}) -> {apply():void,result}` preserves current delivery transitions/versions/proof/locks. All writes including mobile receipt commit in one transaction. Auth SDK I/O stays outside transactions.

Payloads: tracking.start `{shipmentId,installationId}`, renew/stop `{sessionId}`, points `{sessionId,points:[{sampleId,sequence,capturedAtMs,latitude,longitude,accuracy}]}`, delivery.update `{shipmentId,expectedVersion,status,notes,proofId|null}`. Start binds scope/UID/installation/assignment epoch and returns sessionId, serverNowMs, leaseUntilMs, absoluteUntilMs and requested interval. Renew never extends absolute deadline. Points require lease capture bounds,2minute tolerance, monotonic sequence and≤24hour lookback; current authority still required.

- [ ] Write failing tests for assigned-only20-row pages, closed projection/private-column exclusion, forged scope/UID, non-Driver reads, same-UID custom token with no extra claims and every Auth/profile/capability denial. Expected `node --test scripts/mobile-backend-qa.mjs` RED missing factory.
- [ ] Add local capability tuple matching the existing project/emulators plus `IILAS_MOBILE_DEMO=enabled`. `mintMobileWebSession` returns only matching UID/customToken in memory; no password/token logs or persistent receipt for the token. Access context supports waiting/role-blocked and exact old-operation recovery without mounting staff data.
- [ ] Extract the existing delivery transition seam; run legacy shared/input/location suites before mobile writes. New delivery action reproduces existing transitions and atomically writes its immutable receipt. Tests assert duplicate failed-attempt submission increments once; Delivered requires registered matching proof and releases each lock once; stale version rejects without partial writes.
- [ ] Implement leased sessions and deterministic point history IDs from scope/session/sample identity. Reject changed payload for an existing sample/request; accept older authorised captures as history-only. Compare latest effective capture time, falling back to legacy submittedAt; equal times retain the existing latest. Session/assignment mismatch and terminal shipment refuse.
- [ ] Tests pin lost successful acknowledgement, changed-role terminal recovery, unknown-operation cancellation fencing, reused UUID with changed bytes, backwards/future timestamps, new session after reassignment and a manual web point newer than a queued batch. Keep expected source/model semantics unchanged.
- [ ] Add private receipt/session denials and assigned query indexes. Run `node --test scripts/mobile-backend-qa.mjs`, `node scripts/mobile-rules-qa.mjs`, `node scripts/input-validation-qa.mjs`, `node scripts/location-stock-qa.mjs`. Expected GREEN, no independent emulator startup and exact rule-fixture cleanup.

### Task 3: Recoverable mobile proof uploads and registration

**Files:** Create `backend/functions/mobileEvidence.mjs`, `backend/functions/evidenceRegistration.mjs`, `scripts/mobile-evidence-qa.mjs`. Modify service routing/shared evidence preparation only; retain existing evidence validators/canonical formats and storage access policy.

**Interfaces:** Consumes Task1/2. Evidence prepare payload `{shipmentId,evidenceId,type:'Proof of Delivery',stage:'Delivery',name,contentType,bytes,sha256,captureSource:'file',capturedAtClient:null|string}`. Finalise payload `{prepareOperationId}` binds the saved preparation; resolution binds the original request. Prepared DTO returns only the reserved target/required metadata and immutable evidence identity, with Pending state. Source bytes≤10MiB and allowed MIME JPEG/PNG/WebP/PDF.

- [ ] Write RED tests: preparation refuses foreign/closed/unassigned inputs; a different actor cannot finish another preparation; changed Storage bytes/generation refuse; retry after committed registration/closed delivery returns the same receipt; receipt and evidence cannot diverge. Run `node --test scripts/mobile-evidence-qa.mjs`, expected missing module RED.
- [ ] Extract/reuse current authorize/hash/registration seams without changing old registerEvidence semantics. Reserve target in private request, upload outside transaction, verify bounded MIME/metadata/hash/generation outside final transaction, then recheck current authority and commit evidence/receipt/audit atomically. Never put network inside a transaction.
- [ ] Pin multi-stage recovery: upload acknowledgement lost, registration acknowledgement lost, different object already at target, stale prepared request, concurrent finalisation and role change during hash. Existing different bytes are never overwritten; eligible orphan cleanup has exact request/actor/hash/generation attribution.
- [ ] Run `node --test scripts/mobile-evidence-qa.mjs` plus `node scripts/customer-access-foundation-qa.mjs` or its existing unit/rules gate when no other Firebase suite is active. Expected GREEN; ordinary PDFs only, original canonical/evidence hashes and Customer proof protection unchanged.

### Task 4: Android debug build, local transport and native identity bridge

**Files:** Create `capacitor.config.ts`, `vite.mobile.config.ts`, `src/features/mobile/MobileBootstrap.tsx` (inert local-build entry), `scripts/prepare-mobile-local.mjs`, `scripts/mobile-build.mjs`, `scripts/mobile-device.mjs`, `scripts/mobile-profile-qa.mjs`, `scripts/mobile-environment-qa.mjs`; scaffold `android/` with pinned Capacitor8.5.3. Native files `MobileEnvironment.kt`, `MobileIdentity.kt`, `MobileBridgePlugin.kt`, `MainActivity.java`/bridge registration and tests under the namespace path above. Modify package/lock, TypeScript inclusion and ignores; no default web-entry change until Task8.

**Interfaces:** `prepareMobileProfile({baseProfile,output,webConfig}) -> safeReceipt` and `mobileLaunchEnvironment(profile,role)` never disclose secrets; schema `iilas-mobile-local-1.0` binds base bytes, native/shared protocol, project/ports and compatible serving metadata. Debug config is generated ignored; native `MobileEnvironment.requireLocalDebug()` runs before SDK creation. Identity implements `signIn`, `establishWebSession`, `getSession`, `signOut` using native Auth/Functions and same-UID result validation.

- [ ] Write RED profile tests for wrong project/port/cloud URL, linked/hardlinked/overwritten config, changed source/base, release build, arbitrary bridge method and native/web UID drift. Run `node --test scripts/mobile-profile-qa.mjs scripts/mobile-environment-qa.mjs`, expected RED before implementation.
- [ ] Discover SDK/JDK/Studio versions, available disk/RAM and active build processes. Pin Capacitor dependencies with exact8.5.3; install only missing Android tools/SDK36/platform-tools after compatibility checks. Retain user-interactive SDK terms where required. Pin generated compatible Gradle/Kotlin versions and native dependency locks (Room2.8.5,WorkManager2.11.2,FirebaseBoM35.1.0); no `+`, alpha, RC or automatic latest updates. Use Android framework LocationManager instead of another location dependency.
- [ ] Add debug-only Android source/config/manifest, synthetic local Firebase app options, emulator mappings before any Auth/Functions/Storage operation, no Google-services cloud registration/plugin or release fallback. Exclude generated config/assets/APKs/keystores/Gradle state from Git. Any tool incompatibility gets a documented minimal compatible pin decision, not an unrelated stack upgrade.
- [ ] Build an inert React Android entry and native sign-in/UID bridge. The custom token exists only in the bridge response and immediate web sign-in memory; current UID checks fence reload/switch. No generic URLs/SQL/paths exposed.
- [ ] The bounded build runner accepts only assembleDebug,testDebugUnitTest,connectedDebugAndroidTest and lintDebug plus validated test-name filters; release and arbitrary tasks refuse. Task4 tests use injected native SDK transports and an inert APK; they do not claim real Auth-to-MSI integration before Task9's source-bound cutover.
- [ ] Implement targeted device mapping setup: require one explicitly selected authorised serial, record current mappings, refuse different existing mappings and change only5001/8081/9099/9199. Setup does not install/run on a phone until the user completes normal USB authorisation.
- [ ] Run profile/environment tests and `node scripts/mobile-build.mjs --profile <ignored-profile> --task assembleDebug`. Expected GREEN, debug APK/hash/build receipt in ignored outputs; release task refuses, default web build unaffected, no production requests. Preserve source snapshot and evidence without committing.

### Task 5: Room cache, immutable outbox and private file persistence

**Files:** Create `MobileDatabase.kt`, `MobileEntities.kt`, `MobileDao.kt`, `MobileRepository.kt`, `MobileFiles.kt`; tests `MobileRepositoryTest.kt`, `MobileFilesTest.kt`, `MobileMigrationTest.kt`. Add immutable schema exports containing schema only under Android test source; never commit databases.

**Interfaces:** Repository `cacheAssignments(context,page)`, `readAssignments(context,cursor)`, `queue(context,request,dependencies)`, `claimNext(context)`, `markAwaiting/markResult`, `readQueue`, `discardUnsent`, `quarantineAccount`. File picker returns an opaque original-account draftFileId; `enqueueProof` consumes that ID, not a JS-supplied path/URI. Persist envelope/hash before any send.

- [ ] Write failing native tests:200actions/2000points/10files/120MiB exact caps, account partitions, request immutability, pending-vs-confirmed status, content URI permission loss after copy, copied file mutation/hash mismatch, crash between write/claim/ack and recovery of Sending→Awaiting confirmation. Expected RED at `node scripts/mobile-build.mjs --profile <profile> --task testDebugUnitTest --tests '*MobileRepositoryTest*'`.
- [ ] Implement Room transactions and app-private copied evidence. No public-storage paths, raw blob in SQLite or automatic backup. Incoming drafts count against caps; failure cleans only that exact unqueued owned draft. Cache TTL/eviction cannot evict pending work; confirmed file cleanup happens after registration acknowledgement.
- [ ] Add atomic local sequence/dependency allocation. Expected delivery version for queued later transitions derives from the last confirmed version plus its earlier pending chain; never claim a server commit locally. Native account mismatch stops claims and quarantines original rows/files. Normal sign-out explains pending work; explicit discard only for safe unsent work, uncertain sends reconcile first.
- [ ] Run repository/file/migration tests through the bounded build runner. Expected GREEN, restart retains byte-identical IDs/payloads, schema upgrade preserves pending work and caches disclose last validation time.

### Task 6: Native synchronisation and exact recovery

**Files:** Create `MobileTransport.kt`, `MobileSyncWorker.kt`, `MobileUpload.kt`, `MobileSyncCoordinator.kt`; tests `MobileSyncWorkerTest.kt`, `MobileUploadTest.kt`, `MobileIdentityFenceTest.kt`.

**Interfaces:** Consumes Tasks1–5. Coordinator `requestDrain(context)` uses one unique worker plus a Room-backed account lease so foreground service and WorkManager cannot send concurrently. Native transport calls only named local Functions/Storage operations with native Auth. Worker reads frozen request bytes, preserves UUID/hash and dependencies, reconciles uncertain work first and stores closed matching results.

- [ ] Write failing tests for duplicate worker start, lost committed delivery/GPS/evidence replies, reboot/process kill during Sending, token refresh and simultaneous JS logout/account change, active file upload cancellation, worker timeout and late callbacks. Assert one business event/object identity, no second request UUID and no cross-account access. Run named worker/upload/identity unit tests, expected RED.
- [ ] Implement network-constrained unique WorkManager drain with capped exponential backoff: initial30seconds,max6hours,8automatic transient attempts then NeedsReview; opening app/user Retry can explicitly resume the same request. No auto retry for401after one SDK refresh,403,current-role/state/input/byte conflicts. WorkManager's actual OS minimum timing applies; show scheduling, never promise immediate execution.
- [ ] Drain per shipment in sequence; acknowledge valid older point batches before dependent status/proof transitions. Keep batch membership frozen once claimed. A failed dependency blocks later Delivered; another shipment may progress within one bounded worker.
- [ ] Implement upload reconciliation without overwrite: confirm target bytes/metadata through saved preparation/resolver, then finalise; same ID after lost reply. Verify copied private file hash before upload and do not delete a file in use. Revoke/stop/switch cancels transfers; late results can update only the unchanged original queue slot.
- [ ] Run native worker/upload/identity tests and shared contract tests. Expected GREEN; bounded worker storage/network activity and no business calls while the local capability/environment is invalid.

### Task 7: Visible Android tracking service and leased capture

**Files:** Create `LocationTrackingService.kt`, `TrackingLease.kt`, `TrackingState.kt`, `LocationSource.kt`; manifest permissions/foreground service/notification; tests `TrackingLeaseTest.kt`, `LocationTrackingServiceTest.kt`. Bridge start/stop/readTracking implementation.

**Interfaces:** `startTracking(shipmentId)` obtains the server session while visible; `TrackingLease.accept(serverNow,leaseUntil,absoluteUntil,elapsedRealtime)` anchors expiry to monotonic time. `capture(location)` validates/bounds and durably queues before sync. `stopTracking(sessionId,reason)` is idempotent, stops sensor callbacks immediately and queues or confirms server stop without depending on network.

- [ ] RED tests pin20second requested interval,30minute monotonic lease/5minute online renewal/4hour absolute cap, changed wall clock, reversed clock observations, storage full, permission removal, explicit Stop, queued terminal action, sign-out, known reassignment and duplicate Start. Assert no automatic boot or force-stop restart. Run named service/lease tests, expected RED.
- [ ] Implement foreground service started only from visible explicit Start, required permissions by API level, non-dismissable ongoing tracking indication as the OS permits and a working Stop action. Notification contains state/reference only, no secrets. Use native LocationManager; no basic Capacitor watch loop pretending to be background support.
- [ ] Persist admitted observations before sending; at lease/cap/access failure stop and show why. Renewal requires online fresh authority and can never extend absolute session lifetime. No cached wall-clock value can renew itself. If network is lost, capture only within the existing lease; expiry needs deliberate restart and fresh authority.
- [ ] Run service/lease/repository tests. Expected GREEN; label all simulated location inputs as software fixtures, with no phone sensor collection yet.

### Task 8: React Android driver interface and platform isolation

**Files:** Create `src/features/mobile/mobilePlatform.ts`, `MobileDriverShell.tsx`, `MobileShipment.tsx`, `MobileQueue.tsx`, `MobileTracking.tsx`, `mobile.css`; `lib/mobilePlatformClient.js/.d.ts`; scripts `mobile-ui-qa.mjs`, `mobile-platform-client-qa.mjs`. Modify Task4's `src/features/mobile/MobileBootstrap.tsx`, `src/main.tsx`, `lib/firebase.js`, `lib/workspace.js`, mobile Vite config and package build script at explicit seams only.

**Interfaces:** Native driver entry consumes the named bridge contract from File Map. Web entry retains existing Home/staff/Customer paths. Bootstrap verifies native local environment before importing/initialising Firebase. Sign-in mirrors the same native UID into the web SDK using the bridge token; stale callbacks never open another account's data. React displays repository-confirmed cache/queue/tracking state, not a fabricated success.

- [ ] Write failing platform/UI tests for wrong/native-missing profile refusal before network, normal web entry unchanged, no staff-root subscriptions in Driver shell, role-blocked recovery-only UI, UID drift/late replies, draft-file ownership and cached/offline/pending/confirmed distinctions. Expected `node --test scripts/mobile-platform-client-qa.mjs` and `node scripts/mobile-ui-qa.mjs` RED.
- [ ] Build touch-accessible1440/390 layouts preserving navy/purple shared controls. Show assignment pages/details, queued status form/proof picker, dependency reason, last verified/cache state, tracking permission/start/stop/lease/sync state and original-account retry/reconciliation. Confirm destructive pending discard explicitly; do not display other-account queue entries.
- [ ] Keep Customer/admin native features excluded; their existing web UI remains. Native view contains no parcel camera/analysis imports or actions. Use normal file selection for proof; no new capture consent is assumed.
- [ ] Run platform/UI tests, `npm.cmd run build`, mobile web build and `npm.cmd run lint`. Expected GREEN desktop/narrow screenshots with no overflow/new warnings, six original lint image warnings only; no actual device acceptance claim.

### Task 9: Final source review, preserved cutover and actual integration

**Files:** Create `scripts/mobile-runtime-qa.mjs`, `mobile-emulator-qa.mjs`, `mobile-native-integration-qa.mjs`, `mobile-preservation.mjs`; native instrumented fixtures/tests for Auth/Room/Functions/Storage. Extend preparation/profile tools and only necessary serving source lists/metadata. Evidence exclusively under fresh ignored UUID directories.

**Interfaces:** Compose mobile sidecar from the current completion profile and source-complete serving metadata. Native profile generation embeds project/ports/protocol only plus ignored local SDK config; build receipt hashes the resulting APK outside the APK to avoid a self-hash cycle. Do not loosen the existing profile/path/link protections.

- [ ] Capture one neutral final source package against this plan's snapshots, excluding unrelated pre-existing dirty edits. Native's one fresh final reviewer checks Spec/Review Focus/rulings. Fix Important/Critical once RED→GREEN with affected gates; defer Minor and record decisions/costs. No re-review loop.
- [ ] Before any service stop, export and hash-verify the then-current full emulator state, allowing only the established normal Auth import timestamp variance. Preserve chain identity and unknown processes. Never import an older checkpoint over newer live state. Refresh serving metadata without altering model/scientific/consumed TEST bytes; parcel binding is metadata-only.
- [ ] Start exactly one current-profile loopback stack and required existing services. Verify original documents/Auth/Storage identities/hashes after import, local capability and old staff/Customer behaviour. Native model service calls remain on MSI; no weights/configuration are copied into the APK.
- [ ] Execute real local backend scenarios and native integration against the physical device only after normal USB authorisation/explicit selected serial. Verify Auth handoff, assigned-only cache, atomic command/GPS receipts, proof upload/finalisation, delayed ack/restart/token refresh and snapshot cleanup. Use supplied anonymous fixture accounts through normal UI/custom tokens in the isolated harness; never expose passwords/keys.
- [ ] Save current device reverse mappings. For actual loss tests, remove only mappings created/owned by this task for the selected serial, demonstrate failure to reach MSI, queue at least one status/proof and multiple admitted locations, restore exact owned mappings and confirm one server outcome per immutable ID. Airplane mode alone is insufficient because USB may remain reachable. Record this distinction explicitly.
- [ ] Run original smoke/QA/shared/account/stock-retry/procurement/location/capacity and affected Customer/report/integrity suites sequentially through fresh preservation gates; no parcel suites. Run native integration tests and structured-model compatibility once after binding. Expected GREEN, exact fixture cleanup and unchanged originals/frozen studies, no public outbound project requests.

### Task 10: Physical Android acceptance, report alignment and final handover

**Files:** Create `scripts/mobile-acceptance-qa.mjs`, `docs/ANDROID_DELIVERY_CONTRACT_2026-10-26.md`, `docs/ANDROID_LOCAL_GUIDE_2026-10-26.md`, `docs/ANDROID_ACCEPTANCE_2026-10-26.md`. Update README workflows, requirements/scope/roadmap, MSI setup status, archive handover and a new mobile report addendum in `../fyp-cwk-2/docs/final-demo-20261025/`; retain original portfolios and prior26October reconciliation proposal as historical context.

- [ ] Prepare a participant checklist with expected observations before starting phone trials: actual Android/API/WebView/device, explicit Start/permission, Home/screen lock, deny/revoke, offline queue after actual backend disconnection, restore/retry, process restart, account switch/quarantine, terminal closure/reassignment and lease expiry. Starting sensor capture remains a visible user action; do not simulate and call it physical evidence.
- [ ] Observe the real phone session with user participation; record capture intervals, reported accuracy, oldest/newest capture vs receipt, queue duration, duplicate count and stop/recovery outcomes. No fixed accuracy/background SLA. Lack of USB/phone/permission participation leaves named acceptance items pending while independent gates/docs proceed; never claim them passed.
- [ ] Document SDK/adb local-only setup, APK path/hash/serial mapping receipts, correct normal sign-in, pending/synced/review states, queue/storage caps and recovery, lease/force-stop/OS limits. Separate native app support from web foreground geolocation and explain preserved web Customer access. Keep cached data/uploads/configuration/signing/SQLite/exports out of Git.
- [ ] Align the report's mobile/GPS/offline language with the new measured implementation. Do not promise continuous background survival, untested native features, offline AI or automatic stock effects. Original report bytes remain unchanged; use an addendum/amended copies only.
- [ ] Run `node scripts/mobile-acceptance-qa.mjs`: verifies actual receipts, device acceptance status, byte-pinned APK/profile/source/model/report/private files, documentation links, generated source equality and exact final state; verifies build/lint/no-new-warning plus tracked/history/expanded/Android-artifact secret and ignore checks and `git diff --check`. Expected GREEN automated gates with truthful separately named physical pending items if any; no stage/commit/push/deploy.
- [ ] Use finishing-a-development-branch with the existing keep-local preference. Keep this plan's snapshots/ledger because no commits are authorised. Final handover states what works, observed limits, any phone participation still needed, all decisions/costs and deferred minors. Do not create or reopen a goal unless the user requests it.

## Self-review and execution handoff

Spec coverage: protocol/resource/privacy→1; authority/leases/delivery/latest ordering→2; proof recovery→3; Android/toolchain/profile/auth/USB→4; SQLite/files/isolation→5; automatic drain/retry/dependencies→6; native service/permission/stop policy→7; reused React driver UX/web isolation→8; final review/source binding/preserved real integration→9; physical observations/report correction/documented limitations/final scans→10. All five Review Focus cases have explicit owning tests.

Boundary decisions: raw immutable payloadJson hashes avoid cross-language number formatting; the native SDK owns authentication; same-UID custom-token handoff keeps existing web lifecycle; Android current-role reads remain closed/assigned; server transaction helpers preserve legacy state semantics; current authority fences historical queued data; USB disconnection is verified independently of airplane mode. Exact method/action names and limits agree across tasks. Build/tool locks and phone conditions are evidence, not presumed success.

Native remains selected. Plan review confirms these ten tasks capture the approved design before scaffolding/dependency installation or product implementation. No new per-task approvals are planned; normal SDK/device/permission participation is requested only when necessary.

Self-review completed: every design section maps to a task above, all five Review Focus cases have owning tests, shared method/action names and protocol states agree, and the early inert native bootstrap is explicitly created in Task4 then completed in Task8. Real native/emulator acceptance waits for Task9's cutover; unit/mock evidence is not substituted. No second design/reviewer dispatch was used for this plan self-review.

## Version references

Capacitor8.5.3 was read from the npm registry on26October2026. [AndroidX stable release records](https://developer.android.com/jetpack/androidx/versions) identify the pinned Room2.8.5/WorkManager2.11.2 releases; newer releases need not be adopted. [Firebase Android release notes](https://firebase.google.com/support/release-notes/android) identify BoM35.1.0. These pins are for a bounded reproducible local build; resolve their declared transitive versions and generated Gradle/Kotlin compatibility rather than upgrading the application wholesale.
