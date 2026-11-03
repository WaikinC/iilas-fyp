# Android delivery application with offline storage and background tracking

**Status:** written design and ten-task implementation plan approved by the user on 26 October 2026. Native execution is underway. Android, React/Capacitor and the limits below are approved. No additional per-task approval is required. Phone installation and physical GPS acceptance are pending at the user's request. Existing no-commit/no-push/no-production boundaries remain.

**Builder check:** a fresh read-only Android/React/Firebase reviewer returned “nothing important left”. Approved choices below guide implementation; this check is not implementation or device evidence.

## Intent and scope

Extend IILAS with an installable local Android driver demonstration that supports three requested capabilities: continued location sampling during an explicitly started active delivery, including while the screen is locked; SQLite-backed cached shipment data and pending work; and automatic queued submission after connectivity returns. Preserve the existing React web application, Firebase backend, shared staff system, Customer portal, inventory balances, Prepared-Shipment Handover and frozen AI studies.

This extends the previously selected responsive-web-only scope. The earlier report-reconciliation note remains a proposal about the old implementation; it must not be used to remove these newly requested features from the final report. After implementation, describe the Android extension and its measured limits in amended supporting material, while retaining both original portfolios unchanged.

### Goals

- Produce a debug Android APK that reuses React components/styles and the existing Firebase project identity through local emulators.
- Give approved assigned Drivers a focused shipment/details/status/proof/queue/tracking interface. Desktop staff and Customers keep their current web interfaces.
- Store bounded cached assignment details, an immutable durable outbox and app-private evidence files. Use Android Room over SQLite; no paid background-location or database plugin is required by this design.
- Recover network losses, process termination and lost successful replies without duplicate delivery events, evidence registrations or location samples.
- Distinguish capture time, server receipt time, pending local intent and confirmed server state. Older queued points cannot replace newer displayed locations.
- Retain existing current-role, current-assignment, delivery-state, evidence and human-control requirements on every server commit.

### Non-goals and anti-goals

No iOS app, app-store release, production deployment/data access, automatic migration or merging, background tracking without explicit Start, boot-time silent tracking, promise of operation after force-stop, route optimisation, geofencing, stock/procurement offline writes, offline AI inference, blockchain signing queues, or new scientific evaluation. No parcel images, camera acquisition, parcel inference/training or parcel testing. Offline proof support uses the existing permitted file types; automated tests use anonymous ordinary PDFs. No native Customer/admin app or rewrite in another frontend framework.

## Approaches and selected route

1. **Selected:** Capacitor around the existing React/Vite build, a focused driver entry, and a small owned Kotlin bridge for native Firebase authentication/calls, Room, WorkManager, files and a location foreground service. This reuses the frontend language and backend while adding the native capabilities the browser cannot reliably provide. Costs include Android tooling, a native bridge and lifecycle/device tests.
2. Separate Kotlin/Compose driver application using the same backend. This can support the same capabilities but duplicates interface work and creates another frontend to maintain. The user selected option 1.

A browser/PWA-only route cannot satisfy the full background-location requirement: the web Geolocation specification restricts position delivery to visible fully active documents. The standard Capacitor geolocation plugin does not directly supply the required background service. Adding a wrapper alone is insufficient.

## Verified current implementation and constraints

- `src/main.tsx` loads `app/page.tsx`; `vite.config.ts` builds to `dist/client`. There is no Android project or Capacitor dependency yet.
- `lib/workspace.js` sends trusted mutations through a callable Function. Direct client business writes are denied. Enabling Firestore offline persistence would not queue these commands, uploads or state transitions.
- Current `location` creates a random history ID and stamps receipt time. It has no immutable sample ID or capture-time ordering, so blindly retrying it would duplicate events and mislabel stale GPS as current.
- Current `delivery` validates state/version and required proof, then writes events and closes resource assignments. It needs a shared transactional preparation/writer seam before adding an atomic mobile receipt.
- Current `registerEvidence` hashes bounded Storage bytes outside the final transaction, rechecks authority and refuses an existing evidence ID. Mobile retries therefore need their own recoverable preparation/finalisation, preserving the existing canonical evidence fields.
- `completionOperations.mjs` provides the existing exact-request principles, but its terminal-only outcome schema does not describe multi-stage mobile uploads. Introduce a separate closed mobile protocol rather than widening or bypassing the existing protocol.
- Source-bound serving profiles include these backend/client files. Any changed serving sources must be explicitly added/rebound at final cutover; frozen models, scientific code and consumed TEST results remain unchanged.
- Android Studio exists on MSI. The default SDK folder and adb-on-PATH were not found; a custom SDK may exist. Discover its configured location/version before installing anything. Use Node 22 and a compatible JDK 21/toolchain. Pin compatible Capacitor 8 dependencies and Android build tools during planning, verify Android Studio compatibility, and support API 24+ unless an actual dependency requires a documented higher minimum.

## Application layout and local build boundary

Keep `iilas-fyp` as the only Git checkout. Add `android/` native source and a Capacitor config there, native plugins under the Android source tree, and React mobile features under `src/features/mobile/`. Share ordinary controls, validators and styles. Do not import the full staff dashboard/root collection subscriptions into the driver shell merely to reuse the screen. Expose only bounded assigned-shipment DTOs to the mobile cache.

The web entry stays the default. A dedicated build-time/runtime marker selects the Android local-demo entry and must be validated by the native bridge. Android builds fail closed without an explicit generated ignored local profile. No fallback from failed emulator connection to cloud endpoints.

Use an app-specific debug package, proposed `com.iilas.fyp.driverdemo`. Keep generated native Firebase options, APKs, SDK paths, Gradle caches, signing material, logs, SQLite databases, outbox files and screenshots ignored. The exact package name is a builder choice and must be recorded in the plan. Do not register a new cloud Firebase Android app or obtain production configuration. Use explicit emulator-only native Firebase options with a synthetic Android application ID accepted by the SDK; validate this in the first local native integration gate. Firebase Analytics, Messaging and automatic external service registration are excluded.

For a physical phone, the selected default is USB debugging plus targeted `adb reverse` mappings for the existing loopback ports 5001, 8081, 9099 and 9199. Both native SDKs and the WebView must connect through those mapped loopback endpoints, independently of the virtual asset origin. Package the compiled React assets; do not depend on a Vite LAN server. Any necessary cleartext allowance is debug-only and restricted to loopback. There is no public tunnel, LAN Firebase endpoint or open firewall rule. The user approves USB authorisation and any runtime permissions on the phone. If the selected phone needs a different transport, return to the user rather than silently choosing production.

## Identity and bridge

Use native Firebase Auth as the Android session authority so a background worker can refresh its own ID token without relying on a running WebView or persisted passwords. Reuse the login presentation with a platform adapter: email/password goes directly to the native SDK in memory and is never saved by application code or logged.

After native sign-in, a local-only authenticated `mintMobileWebSession` callable verifies live Auth/account identity and returns a short-lived custom sign-in token for that same UID, with no caller-supplied claims or alternate UID. The WebView signs in through its Firebase SDK using that token to reuse existing own-profile/react-auth lifecycle. Do not persist or log the bridge token; native and web UID must match before protected UI mounts. Account creation/approval remains on the web. A non-approved/non-Driver account gets an access/recovery-only screen rather than the operational driver shell. Original approved actors may still resolve exact prior terminal operations after a staff-role change; they cannot start fresh driver actions.

All commands/uploads from native background work use the native Firebase SDK session. JS never supplies an authoritative actor, raw server token, arbitrary URL, arbitrary file path, role or scope. The bridge exposes named operations, not generic HTTP, SQL, filesystem or code execution. Native-to-JS responses are closed DTOs. On sign-out, UID mismatch, rejected access or permission loss, stop tracking, cancel active workers/downloads and clear protected views. Pending items stay quarantined to their original account unless the user explicitly discards them; another login cannot read or submit them. The UI explains the pending count before normal sign-out. Revoked accounts cannot automatically flush their old queue.

## Durable local data

Partition Room rows and private file access by project, fixed shared scope, original UID and device installation identity. Store assignment projection/cache, tracking sessions/leases, immutable actions, immutable location samples and file descriptors. SQL is parameterised and migrations are versioned. Use app-private credential-protected storage, disable backup/export of private runtime data, and do not describe Room itself as an encrypted database. Cache only facts needed for the assigned delivery; no staff directory, whole inventory, other-driver or Customer records.

Each mutation has a UUID generated and durably committed before any transmission, a fixed payload hash, original actor/scope, shipment/assignment basis, capture time, monotonically increasing local sequence and dependencies. Each selected evidence file is copied from its content URI into an immutable app-private file within its size cap, then hashed before the action becomes queueable; do not rely on continued access to the original picker URI. SQLite stores its private relative reference and metadata, not a large binary blob or public URL.

Proposed builder limits for the FYP demo: at most 20 assignments per cached page, 200 pending status/evidence actions, 2000 pending location points, 10 evidence files of at most 10 MiB each, and 120 MiB total local managed storage. A full queue refuses new capture with an explicit message and stops tracking if samples cannot be durably stored; it never silently drops data. Retain confirmed queue summaries for up to seven days, purge confirmed private file copies after registration and acknowledgement, and expose explicit original-account discard for pending files. Superseded read caches may be evicted; pending work may not.

Show `Queued`, `Sending`, `Awaiting confirmation`, `Synced`, `Needs review` or `Refused`. A pending Delivered action is displayed as pending; it does not change the confirmed server status or release resources. Process restart turns uncertain Sending items into reconciliation work using the same UUID/payload. Offline cached views show last verification time and cannot claim current assignment authority.

## Server contracts and synchronisation

Add a local-only mobile capability, proposed `IILAS_MOBILE_DEMO=enabled`, composed through a new ignored source-bound sidecar. Every mobile command derives scope from system/config and checks live Auth/current profile, original request identity, current assignment and current delivery state. Existing staff/Customer permissions and private-receipt denial stay unchanged.

The closed mobile command protocol has terminal `Committed`, `Cancelled` or `Rejected` results and nonterminal `Pending`, with stable request IDs, payload hashes, fixed action names and safe reason codes. Exact matching terminal recovery precedes fresh action-role checks, using the existing approved-original-actor recovery policy. Unknown submitted-operation resolution may create a cancellation tombstone to fence a late send; never resolve never-sent Queued work merely to inspect it. Do not manufacture a new UUID after timeout.

Core routes comprise bounded assigned lists/details; native/web identity handoff; start/renew/stop tracking; submit/resolve immutable location batches; submit/resolve delivery updates; and prepare/finalise/resolve evidence. Exact names and collection schemas are builder choices for the plan, but transaction, identity, limits and recovery behaviour are binding. New private sessions/receipts deny every direct client read/write. Any public source/history projection retains its existing scope and Customer disclosure restrictions.

WorkManager owns one durable drain per account, constrained to available network and backed by Room. Drain each shipment's actions in local sequence, observing dependencies. GPS batches contain at most 25 immutable points and 64 KiB; do not reshape an in-flight batch on retry. Upload must finish and proof registration must be confirmed before a dependent Delivered command can commit. Preserve each expected delivery version across an offline action chain. A conflicting server version, reassignment, expired authority or closed shipment becomes an explicit refusal/review state; never silently rebase intent or change the requested status.

Extract shared delivery-transition preparation/writes so legacy and mobile callers perform the same status, proof and resource-lock changes. The mobile receipt and business event are written atomically in one Firestore transaction. Network, hashing and Storage work stay outside transactions, with authority/source rechecked at final publication. Preserve existing canonical hash formats, record IDs and original registrations.

Evidence uses a multi-stage immutable request bound to UID, scope, shipment, capture declaration, byte count/hash and evidence UUID. Prepare reserves its target, native Storage upload writes only that target, then finalisation verifies actual MIME/size/hash/metadata/generation and commits registration plus its receipt atomically. Replays return the original outcome. Existing different bytes are never overwritten; a lost upload acknowledgement triggers target reconciliation. Keep generation/hash-bound attribution for any abandoned owned upload cleanup and never delete other evidence. Retries after completion must resolve the receipt even if delivery has since closed.

On reconnect, native Auth refreshes tokens as needed and the server rechecks current authority; Firestore offline cache alone is not the sync engine. Retry only transient failures with capped exponential backoff and stable IDs. Stop automatic retries for authentication, authority, input, stale-state and byte-conflict errors. Report WorkManager scheduling honestly: reconnect triggers an attempt when Android permits it, not a guaranteed instant background deadline. Opening the app also requests a bounded drain; the foreground service and worker share a durable single-flight guard.

## Background location and ordering

Only an approved assigned Driver deliberately starts one active shipment session per device. Start requires online server authorisation, an active Dispatched nonterminal shipment and a bound assignment/session epoch. Start the Android location foreground service while the activity is visible, obtain the permissions required by the actual Android version, and show an ongoing notification with shipment reference and Stop. The screen has clear Start/Stop, permission state, last capture/sync and offline queue count.

Proposed demo sampling target is once every 20 seconds, subject to OS/provider behaviour; this is not an accuracy or delivery-time guarantee. Use Android native location facilities rather than a WebView watch callback. Store every admitted sample durably before sending. Browser tracking remains its existing deliberate foreground behaviour.

Proposed lease policy: a 30-minute capture lease renewed online every five minutes while authority remains valid, with a four-hour absolute session maximum. Device monotonic time anchored at lease receipt controls expiry so changing the wall clock cannot extend it. Offline capture stops at expiry. Explicit Stop, app sign-out/access loss, a known terminal delivery, permission revocation, full storage or session timeout stops capture. A queued terminal action stops local collection immediately even before it synchronises. Do not auto-start after reboot or promise survival of force-stop; resume requires deliberate user action and fresh authority. An offline device cannot learn an immediate server-side revocation, so state this bounded lease limitation.

Record device-reported capture time separately from server receipt time and accuracy; GPS/time values are observations, not independently verified truth. Reconnection may submit previously captured points from the original valid lease for up to 24 hours, only if current account/assignment/delivery authority still permits them. Current authority failure rejects them. Capture time must fit its recorded lease/sequence with bounded clock tolerance, and impossible/future or backward times are refused/flagged; the plan must define exact validators.

Deduplicate history by immutable session/sample identity. Retain older admitted points as history without replacing a newer latest point. Update the latest pointer only when its effective capture time is newer; legacy records use their server submittedAt as the fallback observation time. Use a deterministic tie rule. A renewed/new session cannot use an old assignment epoch. Customer sharing continues to expose only the latest authorised point while active, with capture/receipt time and staleness clearly labelled; no route history is added to the Customer portal.

## Verification and acceptance

1. Contract/transaction tests: bounds, cross-UID/scope requests, revoked/non-Driver/reassigned/terminal cases, duplicate status/evidence/GPS, tombstones, receipt recovery, monotonic latest selection, legacy records and proof dependencies.
2. Native unit tests: Room persistence/migrations/account isolation, bounded storage, immutable file hashing, restart recovery, native/web UID fencing, worker ordering/dependencies/backoff, lease/clock expiry, permission and lifecycle stops. Use bounded local fixtures; do not claim these as real-device evidence.
3. Real emulator integration: native Auth and custom-token web handoff, closed assigned projections, current status/proof writes and exact recovery through Auth/Functions/Firestore/Storage. Use ordinary PDFs and disposable driver/shipment fixtures, preserving all pre-existing documents/Auth/objects exactly.
4. Browser regression: desktop and 390px mobile layouts, original staff/Customer flows and unaffected native-disabled web entry. Run original Firebase regressions sequentially, never launch a second emulator stack. Existing six lint image warnings remain the baseline, with no new warnings.
5. Physical Android participation: USB authorisation, install debug APK, sign in through the normal UI, grant/deny permissions, start/stop tracking, press Home/lock screen, airplane mode/reconnect, restart the app, duplicate retry, logout/account switch and stale assignment/closed-delivery refusal. Do not collect a real movement trace before the user deliberately starts the trial. Record Android/API/WebView/device conditions, observed intervals, queue delay and known failure cases; no guaranteed background/accuracy claim without those observations.

Use the physical phone rather than running a large Android emulator alongside MSI's model services. Proposed Gradle limit: two workers, no long-lived daemon and 1536 MiB JVM heap, with native tests/inference suites sequential. Inspect available RAM/disk before dependency installation or builds; keep all existing model guards. User interaction may be needed for SDK terms, USB/debug prompts and runtime permissions; never request passwords or keys in chat.

Before any backend cutover, capture then-current full state and a fresh verified export. Preserve the selected initial Admin and all IDs/balances. Refresh only serving metadata for the changed runtime source surface; keep model/scientific/evaluation bytes pinned. Verify exact post-import state, both structured-model readiness/compatibility and existing local chain identity. Parcel work is metadata-only binding when needed, with no parcel tests/inference. Build/lint, source-copy checks, secret/history/expanded scans and ignored Android artefact checks precede a completion claim. Keep incomplete phone acceptance explicitly pending if participation is unavailable.

## Documentation and builder decisions

Update current scope/contracts, roadmap, local setup/recovery, report alignment and full-workspace handover after implementation. Explain the new Android/React/native boundary, SQLite cache/outbox, automatic retry conditions and tracking lease/OS limits. Preserve both original portfolios, earlier receipts and frozen studies. No stage/commit/push/deploy is part of this design.

Left to the builder: compatible exact dependency/tool versions; Kotlin/plugin/class names; closed DTO field names; indexes; deterministic sample ID/tie mechanics; unit-test tooling and accessible form placement. The proposed sampling, lease, storage/build caps and USB/local-only transport above are explicit builder calls for user review, not pre-existing measured performance.

## Primary references checked on 26 October 2026

- [Capacitor overview and existing web integration](https://capacitorjs.com/docs)
- [Capacitor Android support](https://capacitorjs.com/docs/android) and [environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Standard geolocation plugin background limitation](https://capacitorjs.com/docs/apis/geolocation)
- [Android foreground location service restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
- [Android location permission and foreground notification guidance](https://developer.android.com/training/permissions/requesting)
- [Android Room over SQLite](https://developer.android.com/training/data-storage/room)
- [Android offline-first queues and WorkManager](https://developer.android.com/topic/architecture/data-layer/offline-first)
- [Web Geolocation visible-document requirement](https://www.w3.org/TR/geolocation/)
- [Firestore offline persistence and its limits](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
