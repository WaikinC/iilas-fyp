# Firebase cloud and MSI demo preparation — 27 October 2026

Latest destination update28October: the user chose the **existing** Firebase project, requested audit/backup/plan only and prohibited billing activation. See [existing cloud audit](EXISTING_FIREBASE_CLOUD_AUDIT_2026-10-28.md) and [revised plan](superpowers/plans/2026-10-28-existing-firebase-msi-hybrid.md). The local evidence below remains valid; its separate-project staging packet cannot deploy to the existing project until later adoption changes are approved and verified. No current runtime switch was made.

The approved Native plan implements local preparation in Tasks 1–8. Tasks 9–10 still require a separate, exact resource/billing/tunnel/deployment authorisation. No new Firebase project, billing link, public tunnel, cloud deployment or Git publication has occurred. The existing cloud project is excluded from the new deployment tooling.

## Implemented locally

- Explicit local/cloud profiles bind Authentication, Firestore, Functions and Storage to one project. Unknown or mixed profiles fail before SDK startup and show a reload screen. Hostname alone cannot select cloud mode. Cloud pending-operation storage is project-qualified; existing local recovery keys are retained.
- Cloud Functions can call a signed MSI gateway for the frozen stock/delivery models and bounded chain observations. The gateway exposes only `POST /v1/operation` on loopback port 8010. HMAC request/reply binding, expiry, bounded duplicate recovery, model/deployment identities, request/output caps and admission controls are implemented. It cannot forward arbitrary URLs, read files or sign blockchain transactions.
- Authoritative Firebase transactions still recheck staff access, source facts, versions and model configuration before retaining results. Ordinary workflows do not require MSI. An unavailable MSI model produces Unavailable/recovery rather than an invented prediction.
- Customer proofs use current grants, revoked-token checks, exact object generation/hash and private/no-store responses. Cloud Hosting routes the proof API before its SPA catch-all. Web Storage and callable commands share the selected environment.
- Android local and cloud-demo debug flavours have distinct package IDs. Both disable backups and cleartext by default; only the local flavour supplies loopback network exceptions. The cloud fixture APK deliberately refuses Firebase startup. Real cloud registration/configuration and physical-phone acceptance are not established by an offline build.
- Staging copies an explicit backend/rules/index/Hosting allowlist, verifies every payload hash and rejects additional payload files. Deployment defaults to dry-run. Exact manifest digest, project, actions, billing and transport gates precede execution. The proposed seed contains three zero-balance products, one anonymous supplier and a proof recipe; stock/history/accounts are not imported from the existing emulator.

## Verification and interpretation

Local acceptance checks passed on 28 October 2026: 75 focused software tests; all eight original Firebase suites; affected mobile/Customer/completion rule denials and five mobile scenarios; and 53 final workflow checks (27 broader, 11 stock/purchasing, five purchasing-browser and ten delivery), with exact fixture cleanup. Both Android flavours passed 54 native tests and APK privacy checks; the fixture cloud APK remains non-connectable. Web/mobile builds passed; lint has zero errors and six existing warnings. Source/history privacy checks passed. Evidence stays under ignored `outputs/hybrid-demo-20261027/` and this plan's retained Native ledger. Final preservation is recorded in `final-verification.json`, separately from actual cloud acceptance.

The final direct-versus-gateway software probe returned identical labels and probabilities for one fictional stock scenario and one fictional delivery scenario (maximum difference 0). Exact lost-reply recovery, wrong model/chain bindings, read-only current-chain inspection and gateway-offline refusal passed. There was no scientific TEST replay or retraining. These two probes measure transport parity, not model accuracy or an SLA. Observed stock direct/gateway HTTP times were 7.884/8.253 seconds, with 28.05/17.88 milliseconds in prediction; delivery was 3.663/3.722 seconds, with 27.50/27.53 milliseconds in prediction. Filesystem verification and worker startup dominate this small sample; the order is not a controlled latency benchmark.

The single fresh source review found two Important defects: historical chain registrations could be checked against a replacement deployment, and incomplete fixture ownership receipts could pass equality checks. Both were reproduced with failing tests and fixed, including a real Firestore Timestamp regression. One Minor item is deferred: some Android cloud recovery text still mentions MSI/local/USB. Correct that wording before a cloud-phone demonstration. The complete ordered execution rulings and their costs are retained in the audit appendix below.

Long browser/stress runs exposed the Firestore emulator 1.22.0 closed-WebChannel queue leak described in [upstream issue 11290](https://github.com/firebase/firebase-tools/issues/11290). Signing out alone did not resolve it. The passing harness validates and removes only its owned bulk-report stress fixtures before opening browser sessions, and signs out owned sessions before closing them. The upstream issue remains a limitation; failed trials and fresh recovery exports are retained. No model/RAM guard was lowered. Vite ignores research/output/Android build trees while normal frontend edits remain watched.

The existing stock study remains 81.53% agreement with AI-assisted synthetic stock labels. Delivery remains 98.33% agreement with its synthetic risk policy. Neither becomes independent real-world accuracy through integration. Parcel testing, camera/image inference and physical Android/GPS/offline trials remain pending or paused as previously selected.

## Current local operator entry points

Use the complete outer workspace. Dot-source `Enter-IILAS.ps1`, then run npm/Git only inside `iilas-fyp`. The current safe profile receipt is `outputs/hybrid-demo-20261027/development-profile-final.json`; it references ignored private files, never print them. The companion completion profile receipt is `outputs/hybrid-demo-20261027/completion-profile-final.json`. Model launchers are recorded in `owned-services-final.json`, the latest Backend launcher in `owned-backend-last-recovery.json`, and Vite in `vite-process.json`. Always reidentify ancestry/start time before stopping anything; recorded PIDs can be reused.

Open only <http://127.0.0.1:5173> or <http://localhost:5173>. One local Firebase stack uses 5001/8081/9099/9199, stock uses 8001, delivery 8002 and Hardhat 8545. Parcel 8000 remains off. The temporary parity gateway closed its listener after testing; no public transport is running.

Before any emulator restart, export and verify **then-current** records/accounts/objects. The clean end-of-run checkpoint is referenced by `outputs/hybrid-demo-20261027/exit-export-receipt.json`; it is evidence of this run, not permission to overwrite newer work. The earlier `last-recovery-export-receipt.json` contains in-progress test fixtures and is not the clean restart checkpoint. A normal Auth emulator import changes token-valid-after timestamps and can require signing in again. No original IDs, balances, password hashes, role/disabled fields or proof objects may be replaced with older state. Final certification compares all 1,665 original documents, 116 accounts and two objects; 466 protected files are unchanged, with only this run's archive handover amendment separately recorded. Both portfolios, saved skills, private configuration, frozen scientific artefacts and 21 generated backend copies are preserved/verified.

For an approved current checkpoint and a still-valid chain/profile, use `scripts/mobile-local-launch.mjs --profile <receipt.profile> --role Backend --checkpoint-receipt <fresh-export-receipt>`, and separate StockResearch/DeliveryResearch roles without the checkpoint argument. Launch hidden through the owned startup helper or a terminal you control; do not start a second emulator stack. JVM bounds remain 1 GiB heap/256 MiB direct memory. Model RAM/time/output limits remain unchanged. After source changes or a Hardhat restart, refresh bindings/profile deliberately; deterministic address reuse cannot revive historical chain entries. Do not auto-sign or reset a running chain.

Offline Android packaging uses `node scripts/hybrid-mobile-build.mjs --flavour local --action assemble` or `--flavour cloud-demo --action assemble --fixture`. The latter is labelled **NOT-CONNECTABLE**. Keep APKs/configuration/SQLite/proofs out of GitHub. Real phone installation and sensor/background testing still require the later participant session.

## Cloud readiness packet and remaining choices

The local packet is `outputs/hybrid-demo-20261027/cloud-readiness-final.json`. It pins the current offline payload and reviewed source, frozen bindings and anonymous seed. Its fixture deployment manifest is **not executable**. The verified fixture payload has 85 files and 2,013,983 public bytes; its manifest SHA-256 is `b2b93b4f8e738d454dbb86c1b86b26e1c28f2565d55c75a058925449506aef44`. Actual project identity, registered web/Android options, approved transport origin and service bindings produce a different manifest for explicit review before any cloud action.

Proposed resources are a **new** Firebase project, Functions/Firestore `asia-southeast1`, Storage `ASIA-SOUTHEAST1`, email/password Auth, Hosting and the fixed secret `IILAS_GATEWAY_SECRET`. Two dedicated runtime identities receive the manifest's scoped permissions; no downloaded service-account key is required. Function limits are min 0/max 2 instances and concurrency 1 **per function**. Required API and IAM lists are in the manifest, not implied project-wide owner access.

Proposed transport is an account-assigned ngrok HTTPS domain forwarding only the gateway. The provider/domain/account are unapproved; no tunnel has been installed or opened. Model ports, Hardhat and Firebase emulators remain loopback. MSI must stay awake for inference/chain observations, and wallet signing stays on MSI. If MSI is off, ordinary cloud app functions continue after cloud acceptance; model and chain operations report unavailable.

Unresolved inputs: the new project ID/display name, owning Google account, approved region, transport account/assigned HTTPS domain and billing account consent. Provider/account quotas and project-ID availability must be checked at that later step. Do not paste passwords, API keys, wallet secrets, billing details or tunnel tokens into chat.

Firebase Functions and current Cloud Storage setup require Blaze. Charge categories include function CPU/memory/invocations/network, builds and Artifact Registry storage, Firestore reads/writes/storage, Storage operations/bytes/egress, Hosting transfer/storage, Secret Manager and any tunnel overages. There is no zero-cost guarantee or hard spending cap from a budget alert. Set budget alerts and retain instance limits, then inspect actual usage during the small demo. Exact monetary estimates require the selected account/traffic and current rates. Sources: [Functions setup](https://firebase.google.com/docs/functions/get-started), [Storage billing changes](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [pricing](https://firebase.google.com/pricing), [quotas](https://firebase.google.com/docs/functions/quotas), [secrets](https://firebase.google.com/docs/functions/config-env), [managed signing](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [Hosting rewrites](https://firebase.google.com/docs/hosting/full-config), [private caching](https://firebase.google.com/docs/hosting/manage-cache), [ngrok free-plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits).

After provisioning/deployment is separately approved, run real cloud deny/allow/recovery/outage/proof checks and verify the actual native Firebase identity before claiming hybrid acceptance. Your original laptop would then open the approved Hosting URL while MSI runs the private workloads. This local-only verification has not created that URL or published the code.

## Execution audit appendix

These ordered decisions include their reasons and costs if wrong. The existing checkout and neutral Native snapshots are retained; no Git integration was authorised.

- Ruling: Work in the existing non-main checkout and retain neutral source snapshots/index hash instead of new worktree/commits — approved plan preserves this dirty integrated workspace — cost if wrong: manual recovery depends on retained snapshots.

- Ruling: Retain this plan workspace after review because no commits are authorised — neutral snapshots are the recovery record — cost if wrong: extra ignored disk space.

- Task 3: Ruling: Share request/response signing in backend/functions/hybridSigning.mjs, imported by the MSI authenticator — prevents shipping outside-root tooling imports in Cloud Functions — cost if wrong: an extra small server-only module.

- Task 3: Ruling: Cloud transport profile is {environment,gatewayOrigin}; SDK environment remains closed — avoids adding transport fields to the shared Firebase environment schema — cost if wrong: callers must provide the wrapper explicitly.

- Task 4: Ruling: Chain reads use a fresh observation UUID per IO stage/retry, within the authenticated actor/scope — cached inspect replies could hide a reset between prepare/finalise — cost if wrong: extra bounded read requests, not additional chain transactions.

- Task 4: Ruling: Pin the native Windows listener PID/start ticks as well as explicit deployment generation and receipt/code — a deterministic Hardhat restart can reuse address/chain ID/deployment transaction — cost if wrong: restarting an equivalent chain still requires explicit profile recovery.

- Task 4: Ruling: Browser code cannot attest the physical computer name; require wallet-side deployment receipt/code proof plus authoritative MSI receipt checks and instruct signing on MSI — avoids a false hostname-security claim — cost if wrong: users must configure their wallet correctly; no remote RPC/signing path is provided.

- Task 5: Ruling: Accept an absent Origin only for cloud bearer-token GETs, with no CORS allowance; require an approved explicit Origin for preflight — same-origin browser GET may omit Origin, while current token/grant/bytes checks remain mandatory — cost if wrong: non-browser authorised clients can download their already-authorised proof.

- Task 5: Ruling: Wrap injected recovery storage centrally and preserve local keys byte-for-byte; cloud slots receive project prefix — avoids migrating/deleting old local intents — cost if wrong: new cloud recovery has a distinct storage namespace, as intended.

- Task 6: Ruling: Add a separate source-bound native-build helper for offline unit/APK tasks; keep full service-bound local launcher validation intact — mobile code changes invalidate the old integrated profile before final Task8 cutover — cost if wrong: one extra build helper/profile receipt to maintain.

- Task 6: Ruling: Cloud APK fixture is intentionally non-connectable at both native and web startup, with a visibly named output — real cloud options require later app registration — cost if wrong: fixture cannot be used for the actual demonstration.

- Task 7: Ruling: Curated seed starts three products at zero rather than inventing stock/history; real demo receipt/dispatch/purchasing occur through app commands — preserves truthful lineage — cost if wrong: operator performs initial stock receipts in the demonstration.

- Task 7: Ruling: Provision separate command/proof service identities and narrowly scoped own-service-account signing permission for native/web same-UID custom tokens — current official Admin SDK documentation requires signBlob — cost if wrong: IAM setup adds two service identities and may require a revised least-privilege role after live verification.

- Task 7: Ruling: Supply an account-assigned ngrok HTTPS domain as the proposed transport, with quotas/account/provider still unapproved — avoids requiring a purchased custom domain for this FYP — cost if wrong: user can choose another provider before the deployment manifest is approved.

- Task 7: Ruling: A source-bound loopback-only MSI launcher is necessary to make the bridge usable; add tools/msi-gateway/launch.mjs with profile/source/manifest checks — server factory alone is not an operator startup path — cost if wrong: one additional small launcher to maintain.

- Task 8: Ruling: Run capacity as the actual eighth original standalone suite; warehouseChecks is imported and executed by qa-review, not a standalone runner — corrects the plan’s mistaken list — cost if wrong: relying on the existing reviewed preservation harness rather than a no-op export-only module.

- Task 8: Ruling: Add a small module-load failure fallback at the web entry — explicit profile rejection previously left a blank page — cost if wrong: Home loads through a dynamic import; normal workflow browser regressions must still pass. Witnessed browser RED→GREEN with no Firebase requests and1440/390 views.

- Task 8: Ruling: Rebind parcel metadata/source inventories only to keep the composed local profile valid; do not launch or test the parcel model — preserves original frozen identity and paused camera scope — cost if wrong: actual parcel runtime compatibility still requires its later resumed testing task.

- Task 8: Ruling: Exclude research datasets, ignored outputs, Native scratch and Android build trees from Vite watching — owned Vite grew to1355MiB working set and browser inference hit the unchanged3GiB guard — cost if wrong: changes placed in those non-frontend trees require explicit reload/restart; ordinary frontend edits remain watched. Real watcher regression witnessed RED→GREEN. Only owned Vite was restarted; free RAM rose to5.28GiB, no Firebase restart or guard lowering.

- Task 8: Ruling: Use the neutral before/current review package instead of an empty Git range; the installed helper correctly rejects unchanged HEAD — no commits are authorised and the dirty baseline must remain intact — cost if wrong: review depends on retained neutral snapshots. Dispatch the single source reviewer during Task8 as its brief explicitly requires, while the independent last acceptance checks finish; completion remains gated on both, with no per-task or second review.

- Final: Ruling: retain cloud/IAM/billing/tunnel verification for separately authorised Tasks9–10 — user approval explicitly excludes those actions — cost if wrong: no remotely accessible cloud demo yet.

- Final: Ruling: leave physical Android auth/upload/GPS/offline/lock-screen trials pending — participant explicitly deferred the phone — cost if wrong: native device behaviour is not certified.

- Final: Ruling: leave parcel inference/camera evaluation paused — user excluded parcel testing — cost if wrong: parcel device acceptance remains incomplete.

- Final: Ruling: retain frozen scientific accuracy evidence without replay/refit — this integration tests software, not generalisation — cost if wrong: prototype agreement remains unqualified real-world accuracy.

- Final: Ruling: exclude unrelated pre-existing dirty changes from this final delta — the approved neutral baseline preserves earlier work — cost if wrong: this review cannot certify that older implementation.

- Final: Ruling: root must independently finish/certify live preservation after the read-only source review — reviewer was prohibited from touching services/data — cost if wrong: operational evidence has author verification rather than a second live reviewer.

- Task8: Ruling: isolate completed bulk-report stress fixtures before browser sessions and remove only prevalidated owned rows before opening browsers — emulator1.22.0 leaks closed WebChannel targets and mass subsequent changes exhausted the unchanged1GiB heap — cost if wrong: this acceptance no longer tests that pathological vendor-specific session ordering; the upstream limitation and all failed attempts remain documented. Original records were always preserved through fresh official exports and exact attributed cleanup.

Deferred minors:

- Final: minor (deferred): cloud Android retains some MSI/local/USB recovery wording outside the updated caption; software-only fixture remains non-connectable and physical/cloud acceptance is pending. Correct before a cloud-phone demonstration.
