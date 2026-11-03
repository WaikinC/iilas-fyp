# MSI Android local guide — 26 October 2026

Keep the full outer workspace together. Run commands inside iilas-fyp after dot-sourcing ../Enter-IILAS.ps1. This app targets Android; existing staff/Customer web access remains at literal http://127.0.0.1:5173. Parcel tests remain paused. No production setup or cloud app registration is required.

## Current status

The Driver UI, native background-service implementation and Room/SQLite queue are implemented. Physical phone checks are pending because the user will connect it later. Use the [acceptance record](ANDROID_ACCEPTANCE_2026-10-26.md) for measured gates and the final ignored APK/profile receipts, rather than older inert build outputs.

Android Studio and SDK are local on MSI at C:/Users/Home/AppData/Local/Android/Sdk. The debug build uses JDK21, API36/min24, Capacitor8.5.3, AGP8.13.0, Gradle8.14.3, Kotlin2.3.21, Room2.8.5, WorkManager2.11.2 and Firebase Android BoM35.1.0. Gradle caps2workers/1536MiB, native test heap1024MiB, and the build runner requires3GiB free Windows RAM. Keep those limits. No Android emulator was started.

## Build and startup

Use npm.cmd run build:mobile, then npx.cmd cap sync android before preparing a fresh mobile profile. scripts/prepare-mobile-local.mjs composes from a current source-bound completion profile and ignored local web configuration. Private profile contents must remain local; safe receipts contain its path/hash. scripts/mobile-build.mjs --profile <private-profile-path> --task assembleDebug rebuilds the mobile assets and emits a new ignored APK receipt. The copied debug APK is the installable result; never upload its signing key/configuration or APK to GitHub.

Start exactly one loopback Firebase stack through scripts/mobile-local-launch.mjs --profile <private-profile-path> --role Backend --checkpoint-receipt <verified-current-export-receipt>. Use StockResearch/DeliveryResearch separately only when needed for web AI demonstrations. The launcher validates current serving metadata and chain identity. It never launches parcel inference. Check listeners first; never start the generic emulator wrapper over an existing stack. Export and hash-verify then-current Firebase state before any future stop/import; do not substitute an older checkpoint over newer work.

The previous Hardhat service was absent after restart. The Android work recreates an explicit fresh local registry/profile; historical Firebase verification records are retained, but previous in-memory blockchain entries are not restored. Old registrations may show unavailable/not registered. Do not claim those hashes were re-anchored or overwrite old records/profiles. Keep chain logs private because Hardhat prints disposable test keys.

## Later phone setup

1. Connect the Android phone by USB, enable Developer options/USB debugging and accept Android's normal computer authorisation. Do not share a password.
2. Run node scripts/mobile-device.mjs to list devices, then node scripts/mobile-device.mjs --serial <explicit-authorised-serial>. It records current mappings and adds only missing compatible loopback reverses for5001/8081/9099/9199; different existing mappings are refused.
3. Install the final debug APK with adb -s <serial> install -r <APK-path> only after verifying its receipt/hash. Open IILAS Driver. Use your normal local approved Driver account; no extra staff/customer subscriptions are mounted. In the web app, Admin approves that account as Driver, and Logistics links it to an active driver/resource assignment on a dispatched shipment. The initial Admin account receives recovery-only access in Android and cannot start Driver tracking.
4. Refresh assignments while connected. Open an assigned dispatched shipment. Queue an In Transit update and an ordinary anonymous proof file. Pending does not mean confirmed. Use the saved queue for retries or Check saved outcome before replacements.
5. Press Start deliberately. Grant location and notification access. Check the persistent notification; Stop/sign-out ends local capture. Background/screen-lock performance must be observed on this device.
6. For a real offline test, save the original reverse mappings, remove only the mappings owned by this test and prove the backend is unreachable. Airplane mode alone is insufficient because USB may still reach MSI. Queue work, then restore exactly the removed owned mappings and verify one receipt/evidence/event per original ID. Never remove unrelated mappings.

Use the participant checklist in the acceptance record. No sensor collection is authorised by simply connecting USB or opening the app. Once a lease expires/Android force-stops or reboots, reopen and press Start again; automatic resume is intentionally absent. MSI must stay awake and the loopback services must remain running. This USB arrangement does not provide internet/public hosting or remote-laptop camera forwarding.

Private copies, SQLite databases, emulator exports, native SDK configuration, signing material, build outputs, datasets and model weights remain ignored. The120MiB limit measures logical managed bytes; SQLite/WAL and installed application overhead need additional free space. Uninstalling/clearing app data destroys pending local work; reconcile the queue first.

## Current debug artefact

The verified APK is in ignored outputs/android-mobile-20261026/build-39b6275c-cf06-4bad-86ff-6f017e8f0af8/iilas-driver-demo.apk. SHA-256:662edb0f60a09434eb7da169f82d73abdda1a1d45b2b606b03f376659fd5c70c. Its sibling receipt.json binds the private mobile profile; apk-privacy-receipt.json records the573-entry scan. Do not use the earlier inert bootstrap APK. The current safe profile pointer is outputs/android-mobile-20261026/development-profile-receipt.json; do not print its referenced private file.

The Backend launcher now caps its owned emulator JVM at1GiB heap/256MiB direct memory. This avoids the large report stress test retaining several GiB and starving the unchanged3GiB model admission guard. The current verified checkpoint pointer is outputs/android-mobile-20261026/latest-export-receipt.json; later current-state export remains required before a stateful stop/import.
