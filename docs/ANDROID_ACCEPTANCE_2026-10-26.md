# Android acceptance record — 26 October 2026

Status: automated acceptance passed21gates. Android phone acceptance remains pending at the user's request. User explicitly chose to connect the Android phone later. Physical acceptance is **pending**, not passed. No GPS sensor collection or phone installation has occurred.

| Gate | Evidence/status |
|---|---|
| Native Room/queue/tracking software |53 Robolectric/JUnit cases passed, zero failures/errors/skips after six review fixes and the delayed Stop/start fence |
| Platform/session client |7 Node client cases passed, including UID/scope drift and closed native DTO refusal |
| Shared/backend commands |8 contract/11 backend unit scenarios and5 actual Firebase scenarios passed with exact cleanup |
| Proof verification |5 unit scenarios plus actual Storage missing-upload/finalise/replay path passed |
| Driver React UI |Actual Playwright1440/390 fixture checks passed and both screenshots visually inspected; this is a UI test double, not a native SDK/device trial |
| Web/mobile builds and lint |Normal web/mobile builds passed; lint0errors with6original image warnings after review fixes |
| Real Firebase preservation/rules/regressions |All eight original suites,90 mobile-private denials and27 actual workflow/browser checks passed with exact cleanup; frozen stock purchasing11/browser5 and delivery10 compatibility gates passed. Current-state export/reimport preserved1665documents/116Auth/2objects; actual mobile5 cases passed again on the bounded JVM. |
| Final APK/hash/profile/source certification |Debug APK built/hash verified and573entries privacy-scanned; combined certification passed; final APK SHA-256 662edb0f60a09434eb7da169f82d73abdda1a1d45b2b606b03f376659fd5c70c |
| Device/Android API/WebView and normal sign-in |Pending user phone |
| Native SDK→MSI Auth/Functions/Storage |Pending user phone |
| Actual GPS/permissions/background/offline behaviour |Pending user phone |

## Participant checklist for the later phone trial

Record actual Android/API/WebView/device and APK hash; verify approved Driver sign-in and assignment-only view; start explicitly, approve permissions, inspect notification/Stop, then observe Home/screen lock. Record actual capture interval distribution, Android-reported accuracy, oldest/newest capture and receipt, queue duration, duplicates and stop result. No fixed background/accuracy SLA is claimed.

Test deny/revoke permissions; Stop/sign-out; account switch/quarantine; lease expiry, clock anomaly/reboot/force-stop; full queue/storage refusal; assignment change/terminal delivery. Stop must affect sensors immediately even if a request is in flight. Confirm no silent resume. Use anonymous proof files; do not collect parcel images or run AI evaluation.

For loss/reconnect, document saved original USB mappings, explicitly removed owned mappings and proof that MSI cannot be reached. Airplane mode is not proof of disconnection. Save status/proof/multiple admitted points locally, restart as appropriate, restore exact mappings, and verify one outcome per immutable ID. Perform native SDK/token-refresh/lost-ack recovery checks on the phone, not only test transports.

## Preserved boundaries

No model fitting, consumed TEST replay or parcel test/inference; no production data/deployment, cloud registration, stage/commit/push or Git history change. Original portfolios, saved skills, private configuration and prior profiles are protected by hashes. Existing Firebase IDs/balances and normal web staff/Customer workflow must pass preservation checks. Device-pending evidence is generated separately by scripts/mobile-native-integration-qa.mjs; automatedPass is false by design.

## Deferred UI polish from the final source review

Three Minor issues remain: tracking display does not persist reported accuracy (server points retain it); changing away from Delivered can retain a proof selection and refuse that nonterminal submission (reload/reselect); sign-out warning omits the numeric pending count (navigation shows the queue count). These do not count as passed phone acceptance or model accuracy. Six Important lifecycle/recovery findings and the follow-on delayed Stop/start fence were fixed with regressions, with no second review loop.

## Execution decisions and costs

- Ruling: Work in the approved existing non-main checkout with neutral byte snapshots; no worktree, commit, branch change or scratch deletion — preserves approved local dirty work and recoverability — cost if wrong: later source isolation needs the baseline manifest.

- Ruling: No stack is running; defer Task2 real rules/shared checks to the Task9 source-bound startup rather than start an unbound stack — preserves the approved cutover boundary — cost if wrong: an emulator-only defect is found later.

- Ruling: Task4 build profile binds current source/base bytes but cannot enable Backend until Task9 refreshes underlying serving metadata — allows inert debug/unit build without bypassing runtime pins — cost if wrong: native builds may need profile regeneration after edits.

- Ruling: Pin Kotlin2.4.21 instead of Capacitor8 older2.2.20 recommendation; official Kotlin compatibility supports Gradle8.14.3/AGP8.13.0 and FirebaseBoM35.1.0 requires metadata2.4 — cost if wrong: additional native tool compatibility remediation before APK acceptance. Sources: kotlinlang.org/docs/releases.html and gradle-configure-project.html; developer.android.com/build/kotlin-support.

- Ruling: Supersede preliminary Kotlin2.4.21 with stable2.3.21, supported by the official Gradle/AGP matrix, so app metadata fits Room2.8.5 while compiler reads Firebase2.4 dependency metadata — cost if wrong: fail closed at native compilation and revisit the narrow compiler/processor compatibility. Do not bypass metadata validation.

- Ruling: WorkManager uses one unique APPEND_OR_REPLACE account chain plus Room lease rather than KEEP; this closes enqueue-versus-worker-exit loss — cost if wrong: extra bounded WorkManager records, still one serial chain.

- Ruling: Automatic uncertain retries replay the identical mobileCommand envelope; its atomic receipt is checked before new work. Explicit resolve retains unknown-operation cancellation fencing. This preserves offline intent without inventing a replacement UUID — cost if wrong: server deduplication failure would duplicate effects; covered by backend atomic/concurrency tests.

- Ruling: Subtract measured request latency from monotonic lease deadlines; five-argument native admission extends the plan signature while retaining four-argument default for pure policy callers — avoids extending capture during slow replies — cost if wrong: conservative early stop.

- Ruling: Derive one UUID-shaped SHA256 stop identity per original Start and durably queue it; owned CAS publication rejects old-service shutdown over a newer Start — makes Stop idempotent under concurrent UI/notification/service calls — cost if wrong: collision or correlation defect refuses the request, never changes its bytes.

- Ruling: Add expectedShipmentVersion and expectedAssignmentVersion to unpublished mobile delivery payload, following the Spec's immutable assignment basis over the plan's omitted fields; legacy web API unchanged — cost if wrong: stale offline actions conservatively require explicit review.

- Ruling: Use a separate mobile entry rather than importing staff workspace/bootstrap — avoids staff subscriptions and preserves normal web behavior — cost if wrong: shared interface changes require explicit mobile updates.

- Ruling: Permit mixed content only in the debug-only local Capacitor container to allow the synthetic web Auth mirror to reach loopback9099; native network policy remains loopback-only and release builds are refused — cost if wrong: device WebView still needs physical verification.

- Final: Ruling: physical/native SDK timing, GPS/OS/permission/USB loss behaviour deferred at user's explicit request — software gates and pending checklist carry no device success claim — cost if wrong: phone-specific defects remain possible until later trial.

- Final: Ruling: final cutover/acceptance/docs were still underway at review — parent completes independent gates and reports their real receipts — cost if wrong: no second source-review seat covers later validation-only code.

- Final: Ruling: production/store/migrations, parcel/AI quality, unrelated pre-existing edits and exhaustive transitive dependency certification remain outside this local FYP task — preserves authorised scope and untouched studies — cost if wrong: those need separately authorised assessment.

- Ruling: No recoverable old Hardhat memory existed after restart; prepare a fresh explicit local registry/profile and retain all historical Firebase records, without claiming old on-chain entries restored — cost if wrong: an older integrity record needs a new explicit demonstration registration/check. Same contract code/address, different deployment transaction; no prior profile overwritten.

- Ruling: Restart own emulator JVM with bounded1GiB heap/256MiB direct memory after the verified current export; retain all research guards and exact import checks — avoids report-test memory retention starving model admission — cost if wrong: an oversized emulator operation can fail visibly and needs a different local resource allocation.

- Ruling: Stateless owned Vite may be cycled without an emulator export; stateful Firebase remains export-first — no application records live in Vite — cost if wrong: an open development page must reload.

## Final runtime and preservation

Current mobile safe profile pointer: ignored outputs/android-mobile-20261026/development-profile-receipt.json; final-evidence.json binds14 actual evidence receipts. Native53, focusedNode36, mobile Firebase5/private rules90, all eight original suites,27 broader browser/emulator scenarios and stock11/purchasing-browser5/delivery10 passed. Final live state exactly1665documents/116accounts/2objects.373protected original/private/report/skill/profile files and27frozen research artefacts remain unchanged; final certification checks these bindings and the unchanged index/HEAD.

The first stock compatibility attempt returned Unavailable when report stress left only2.13GiB free RAM; exact fixture cleanup passed. The current state was exported/11files verified, only owned emulators/frontend were cycled, and the emulator JVM was bounded to1GiB heap/256MiB direct memory. Free RAM recovered to about7GiB and all three compatibility suites then passed. Research admission/CPU/RAM/time/disk limits were never reduced. A Java-options startup banner and existing Admin metadata-lookup warnings were nonfatal; actual rules/proof tests passed on the final runtime.

The final certification receipt is referenced by ignored outputs/android-mobile-20261026/final-verification.json. It verifies APK/profile/source bindings, actual test receipts,373protected files, unchanged index/HEAD, TypeScript, lint0errors/six existing warnings, tracked/history/expanded Android secret scans, generated source equality and Git diff whitespace. No commit, push, merge, deployment, production change or phone capture occurred.
