# Existing Firebase and MSI Hybrid Deployment Implementation Plan

**Superseded architecture28October:** user selected **Spark + MSI backend**, keeping billing disabled. See [Spark design](../specs/2026-10-28-firebase-spark-msi-backend-design.md). Only Task1 offline backup/adoption validation was implemented (7passing cases); subsequent Cloud Functions/Storage tasks were not implemented. Retain that guard and the immutable backup; do not execute the billing-dependent phases below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for later approved implementation. Native execution is retained. Steps use checkbox syntax. This document is a planning deliverable; do not execute it from this request.

**Goal:** Prepare and eventually deploy the existing IILAS Firebase project while preserving its cloud records and keeping frozen AI models/blockchain on MSI.

**Architecture:** Keep the verified gateway and backend adapters. Add explicit existing-project adoption authority and mode-aware SDK isolation; retain current cloud data and bootstrap only the selected verified Admin through the existing server transaction. Billing-free local preparation and later cloud actions are separate phases.

**Tech Stack:** Existing React/TypeScript/Vite, Firebase SDKs/CLI15.30.0, Node22, Python RF services, ethers/Hardhat, Kotlin/Capacitor/Room/WorkManager. No replacement backend, new ML training or new hosting stack.

**Spec:** [Revised design](../specs/2026-10-28-existing-firebase-msi-hybrid-design.md). User has approved the existing-project choice and audit/backup/plan only; product implementation and cloud changes are not yet approved. [Verified audit](../../EXISTING_FIREBASE_CLOUD_AUDIT_2026-10-28.md).

## Global constraints and gates

- Target existing `fyp-inventory-and-logistics` only when a reviewed adoption manifest explicitly allows it. Do not create another project or simply remove the original-project rejection. Preserve earlier new-project fixture readers and historical receipts.
- **Do not enable billing.** Do not enable APIs, create buckets/service accounts/secrets, alter IAM/Auth/records/rules, open a public tunnel or deploy in this planning run. Phase A below requires later plan execution approval; Phase B additionally needs new explicit billing/resource/tunnel/deployment/bootstrap/test authority. No approval is inferred from this document.
- Work in the existing sole app checkout. Read both AGENTS files, latest handover/contracts and audit. Dot-source `../Enter-IILAS.ps1`; Node22.13+ within22, JDK21, npm.cmd/npx.cmd, existing research Python. No stage/commit/push, branch switch, cleanup or history copying; retain this plan's neutral baseline and snapshots.
- New execution ledger: `.superpowers/sdd/2026-10-28-existing-firebase-msi-hybrid/`; ignored outputs: `outputs/existing-cloud-adoption-20261028/`. Do not alter the earlier plan's baseline or the immutable cloud backup. Do not print private backup/configuration/credentials or put any backup/test rows, model artefacts, APKs or keys in Git.
- Preserve local1665documents/116accounts/twoobjects and the cloud128documents/3accounts as distinct baselines. Never import the MSI snapshot into cloud, merge owner groups, overwrite original IDs/balances, or invent missing legacy history/handovers. A fresh cloud snapshot is required at future cutover; do not restore today's backup over newer work.
- Keep selected Admin, approved staff, independent review, Prepared-Shipment Handover, Customer grants and original UI. Use the existing verified-email check; never edit Auth verification flags. Other existing accounts do not automatically become staff and their personal inventories remain outside the selected shared scope.
- Cloud database stays Standard/native `(default)` in `asia-southeast1`; keep existing site/web app. Proposed Functions `command`/`customerEvidence`: min0/max2/concurrency1 each. New proof bucket, scoped identities/secret and HTTPS origin require exact later approval. Current CLI Editor access is not billing/IAM grant authority.
- All model/RPC/emulator ports stay loopback; only fixed signed gateway operation can later be published. Frozen model/scientific hashes and resource guards stay unchanged; manual wallet signing stays on MSI. Parcel testing disabled; physical phone/GPS/offline trials pending without repeated participant prompts.
- One loopback emulator stack; all Firebase suites sequential. Before an owned restart export/verify then-current state and reidentify ownership. Never start an emulators:exec wrapper against an already running stack or restore cloud backup over that stack.

## Review focus

1. Same project/bucket with the wrong mode must not reuse an emulator-connected web/native SDK or publish a queued local command to cloud (Tasks2/4).
2. A partial/stale/edited backup or cloud edits after manifest approval must invalidate adoption before any write; no local-emulator receipt can authorise cloud migration (Tasks1/3/6).
3. Existing Admin email unverified, UID different, already-created config/profile, or other owner's legacy product must not be silently adopted/merged (Tasks1/3/7).
4. Deployment partially succeeds while old direct-write browser code remains open: block unauthorised writes and stop safely; no automatic weak-rule rollback or restore over newer data (Tasks3/6/7).
5. Editor login, disabled Functions API or absent Storage bucket must not trigger implicit IAM grants, resource creation, billing activation or fake cloud acceptance (Tasks3/5/6).

## File and interface map

- `lib/demoEnvironment.js/.d.ts`, `lib/firebaseRuntime.js`, generated backend copy: explicit mode/project SDK identity and separately allowlisted existing-target profile.
- New `scripts/hybrid-existing-adoption.mjs` and `scripts/hybrid-existing-adoption-qa.mjs`: verify private backup/state receipts and build a narrow existing-target adoption authority; no cloud writes.
- `scripts/hybrid-demo-manifest.mjs`, `prepare-hybrid-demo.mjs`, `hybrid-demo-deploy.mjs`, `hybrid-demo-fixture.mjs` and deployment tests: versioned target policy, immutable explicit write-set/resource/action authority and non-seeding defaults for existing data.
- `scripts/hybrid-mobile-build.mjs`, `android/.../MobileEnvironment.kt`, native policy tests and cloud recovery labels: same-ID environment separation without weakening local debug/resource restrictions.
- New `scripts/hybrid-existing-cloud-qa.mjs`: later authorised existing-target cloud acceptance, all test additions registered; original snapshot is a preservation baseline, never cleanup input.
- Documentation: this plan/spec, audit, latest roadmap/requirements/traceability, startup guide, outer MSI status and archive handover. Original portfolios/skills remain unchanged.

## Phase A — later approved local preparation, with billing still disabled

### Task 1: Verifiable existing-cloud adoption inputs and compatibility rehearsal

**Files:** Create `scripts/hybrid-existing-adoption.mjs`, `scripts/hybrid-existing-adoption-qa.mjs`. Private fixtures and typed backups stay under ignored outputs. Existing backup scripts/receipts are evidence, not trusted application configuration.

**Interfaces:** `validateExistingCloudAdoption(raw,{backupReceipt,observedState,sourcePins}) -> frozenAdoption`. Closed DTO: `{schema:'iilas-existing-cloud-adoption-1.0',projectId,backupReceiptSha256,cloudStateSha256,observedResourcesSha256,sourcePins,primaryAdminUid,dataScopeId,retainExisting:true,mergeOtherOwners:false,importLocalSnapshot:false,dataChanges:[]}`. Exact target project; `primaryAdminUid===dataScopeId` and both match the privately captured selected Admin. SHA fields are lowercase64hex and verified against actual bytes/canonical inventories. Only relative contained paths in ignored output may locate private inputs. Runtime public assets receive digests/metadata only, never raw backup or hashes/salts.

`prepareExistingCloudAdoption(inputs) -> {adoption,readiness:{emailVerified,billingEnabled,ownerAuthority,blockers:string[]},fixtureOnly:true}` produces a draft when verification/owner/billing prerequisites are unresolved. A structurally valid draft grants no execution authority; Phase B rechecks each live prerequisite.

- [ ] Write failing tests `typed_values_and_original_document_ids_roundtrip`, `emulator_receipt_cannot_authorise_cloud`, `missing_auth_hash_parameters_refuse`, `changed_backup_bytes_or_source_pins_refuse`, `other_owner_never_merged`, `unverified_admin_is_a_reported_blocker`. Use generated minimal software fixtures; no real cloud rows/UIDs or backup fragments in tracked tests. Run `node --test scripts/hybrid-existing-adoption-qa.mjs`; expect meaningful RED.
- [ ] Validate the verified backup plus supplemental metadata, document types, uniqueness and file hashes; distinguish data-capture completeness from restore rehearsal. Derive only a proposed write-set: absent `system/config`, selected new user profile and its standard bootstrap audit; no original product/shipment changes. Collision with any existing config/profile stops preparation for explicit reconciliation.
- [ ] Produce a private dry-run adoption receipt binding fresh cloud observation, selected Admin identity and untouched other-owner rows. Do not import Auth accounts into any running emulator or cloud. Record normal email verification as a participant prerequisite, never change it. A later isolated restore rehearsal needs an owned separate workspace and must not run a second stack while the current one is active.
- [ ] Run focused tests GREEN, offline real-backup validation and secret scan. Expected: no cloud writes, no billing calls that mutate state, exact IDs/types preserved, no claim of tested live restoration.

### Task 2: Same-project web/backend mode isolation

**Files:** Modify `lib/demoEnvironment.js/.d.ts`, `lib/firebaseRuntime.js`, `backend/functions/demoEnvironment.mjs`, affected environment/web/startup tests; regenerate through `scripts/prepare-functions.mjs`.

**Interfaces:** `demoEnvironmentKey` remains `mode:projectId`; `initialiseDemoSDKs` binds the validated environment and named app identity before using any SDK. Factory initialisation gains explicit `appName`. Names: `iilas-local-fyp-inventory-and-logistics` and `iilas-cloud-fyp-inventory-and-logistics`. Original-project cloud permission comes only from the separately generated reviewed allowlist/adoption digest; no new submitted field can disable validation.

Legacy default-app persistence is not copied to the named app. One normal local sign-in may be needed; saved command keys and data remain intact.

- [ ] RED tests `same_project_opposite_mode_existing_sdk_refused`, `unmarked_default_app_never_adopted`, `original_project_cloud_requires_approved_build_allowlist`, `local_tuple_and_recovery_keys_unchanged`, `cloud_rejects_all_emulator_variables`, `invalid_profile_load_has_no_sdk_calls`. Run `node --test scripts/hybrid-environment-qa.mjs scripts/hybrid-web-qa.mjs scripts/hybrid-startup-ui-qa.mjs`.
- [ ] Replace project-ID-only instance reuse with mode-bound named SDKs and a closed environment identity. Reject cross-mode/unknown cached instances before Auth/Firestore/Functions/Storage creation. Keep explicit origins/ports and backend fail-closed checks; root local config/allowlist are not overwritten. Existing users may need one normal sign-in after named-app migration; do not migrate tokens, clear pending operations or change their IDs.
- [ ] Preserve local key bytes and cloud project-prefixed slots; verify reload, lost successful replies and opposite-mode browser state. Keep existing customer bearer/grant/hash/no-store checks.
- [ ] Run focused GREEN, generated-copy equality, web build/lint and privacy scan. No live cloud config switch or current local service restart in this task.

### Task 3: Explicit existing-target deployment and data-write authority

**Files:** Modify `scripts/hybrid-demo-manifest.mjs`, `prepare-hybrid-demo.mjs`, `hybrid-demo-deploy.mjs`, `hybrid-demo-fixture.mjs`, deployment/launcher tests; consume Task1 helper.

**Interfaces:** New executable manifest schema `iilas-hybrid-deployment-2.0` adds closed `targetPolicy:{kind:'existing-project',adoptionReceiptSha256}` or `{kind:'new-project'}`. Existing-project execution also verifies Task1 DTO, current cloud-state/resource hashes, immutable payload hashes, exact approved destination and per-action authority. Historical v1 payloads remain offline-verifiable; v1 never authorises an existing target. Deployment remains dry-run by default. `seed` is not implicit: empty existing-target fixture write-set is the default.

- [ ] RED tests `original_target_still_denied_without_adoption`, `fresh_complete_backup_required_before_write`, `manifest_change_invalidates_approval`, `wrong_project_or_unknown_resource_never_deleted`, `editor_or_billing_disabled_never_auto_escalates`, `partial_release_does_not_restore_data_or_weaken_rules`. Run `node --test scripts/hybrid-existing-adoption-qa.mjs scripts/hybrid-deployment-qa.mjs scripts/hybrid-gateway-launch-qa.mjs`.
- [ ] Bind exact resource/IAM/API list, two Functions, bucket/location, secret name, source/model/chain identities, HTTPS origin, approved bootstrap additions and exact new test-fixture registry. Never place backup contents/credentials/models in payload. Keep curating stage files from the reviewed allowlist and detecting extra/reforged files.
- [ ] Add separate action receipts for `resources`, `iam`, `billing`, `tunnel`, `deploy`, `bootstrap`, `cloud-tests`; absence means refusal before side effects. Target selection approval alone grants none. Use explicit `--project`/staged config on every later CLI command. Remove no resources by wildcard and grant no role automatically on failure.
- [ ] Implement a staged cutover checkpoint ledger. It records each completed step and detects inconsistent deployment; recovery stops for inspection and never automatically rolls back rules/data or deletes partial resources. No cloud SDK mutation is called by tests/dry-run.
- [ ] GREEN tests and staged payload audit; expected no API enablement, cloud records, external tunnel, billing, dependency drift or publication. Save proposed resource/permission list and unresolved owner/domain/billing prerequisites.

### Task 4: Native cloud adoption and real-configuration packaging

**Files:** Modify `scripts/hybrid-mobile-build.mjs`, `android/app/src/main/java/com/iilas/fyp/driverdemo/MobileEnvironment.kt`, `android/app/src/test/java/com/iilas/fyp/driverdemo/MobileEnvironmentTest.kt`, packaged profile generation/Gradle fields and cloud recovery captions. Tests: `scripts/hybrid-mobile-qa.mjs`, native policy/session/outbox cases.

**Interfaces:** Existing target can pass cloud policy only when the packaged project/app/options and adoption digest match the reviewed build identity. Keep `localOnly` in environment DTO, separate `com.iilas.fyp.driverdemo.local`/`.cloud` packages and named native apps. Do not move Room records between variants. Native/web mirroring must match both UID and environment.

- [ ] RED tests `same_project_local_native_session_cannot_mirror_to_cloud`, `local_outbox_refuses_cloud_flush`, `fixture_cloud_apk_stays_non_connectable`, `original_cloud_config_without_adoption_digest_refused`, `logout_revocation_and_reload_keep_queue_owner`, `no_implicit_tracking`. Keep existing test floor/resource limits.
- [ ] Update only original-project cloud guards covered by the adoption policy; local remains exact. Fix previously deferred local/USB wording in cloud recovery. Real ignored options are read only through explicit config generation after later authorised app registration; no invented app IDs/API keys.
- [ ] Run bounded native unit tests for both flavours and focused Node tests; build/audit offline local and explicitly non-connectable cloud fixture APKs. Keep max2workers/1536MiB/in-process Kotlin/no daemon, no backup/cleartext in cloud, no private assets. Do not install, map USB or start GPS.
- [ ] GREEN checks, privacy audit and recorded hashes. Real cloud APK rebuild remains Phase B if registration is needed. Physical acceptance remains pending by user choice.

### Task 5: Preserved local acceptance and a reviewable existing-project packet

**Files:** Existing `scripts/hybrid-local-acceptance-qa.mjs`, new adoption tests/receipts, source-bound profile preparation, handover/operator guide.

- [ ] Resolve the explicit `scripts/hybrid-*-qa.mjs` list and run all affected JS/native tests, `npm.cmd run build`, `npm.cmd run build:mobile`, `npm.cmd run lint`, tracked/expanded secret scans, history scan and generated-copy equality. Expected0failures; report actual warnings, no invented counts.
- [ ] If serving-source pins change, export/verify then-current emulator state, reidentify owned processes, deliberately refresh composed profile and restart only owned services. Run original8Firebase suites sequentially using the approved preservation harness (capacity is the eighth; warehouse checks are imported by qa-review), affected rules/mobile scenarios and broader27/stock11/purchasing-browser5/delivery10 gates. Exact original IDs/balances/credentials/objects must remain preserved after every fixture run. Retain the WebChannel stress-fixture ordering mitigation and native resource guards.
- [ ] Compare direct/gateway RF outputs on fixed fictional software inputs, test outage/replay/wrong bindings/chain-generation drift and desktop/narrow layouts. No consumed scientific TEST replay, parcel inference or actual phone operation.
- [ ] One fresh final source review under Native; fix Important findings RED→GREEN and record minors. Produce an immutable existing-project deployment proposal with backup/source/resource/role/access/billing/HTTPS prerequisites, no executable authority. Billing stays disabled. Present it for review, preserving the current branch and local runtime.

## Phase B — blocked until later exact approval and billing decision

### Task 6: Approved resource preparation and controlled cloud cutover

**Files:** Task3 deployment tooling; ignored exact adoption/resource/approval manifests and per-step receipts. No new project creation.

- [ ] Hand over the exact manifest and access changes for approval. Obtain normal verified-email completion by the selected initial Admin, owner/IAM participation and a separate explicit billing decision. If billing remains disabled, **stop cloud execution here** and keep the local demo. No API/bucket/service identity/secret/tunnel/role change precedes its authority.
- [ ] Refresh the cloud data/config/IAM/Hosting inventory, backup hashes and original-state snapshot immediately before the agreed maintenance window; check expected changes against the approved manifest. Stop old direct-write clients, record the current Hosting release and verify `system/config` remains absent and selected cloud UID owns the expected legacy scope. Never substitute the local export or use old backup contents to replace current records.
- [ ] If separately authorised, the owner/billing administrator enables billing and grants only manifest-scoped resource/IAM actions; configure exact approved APIs, two runtime identities/secret, proof bucket and approved HTTPS provider/domain. Configure function limits and monitor actual usage; ordinary budget alerts are not a project-wide cap. No downloaded service-account key or public model/RPC port.
- [ ] Follow the reviewed deployment stage order: prepare/verify backend; perform exactly authorised selected-Admin bootstrap additions through the existing trusted server contract; apply matching reviewed rules/indexes and Hosting; record each result and verify current destination. Every stage rechecks authority/preconditions. Never claim this multi-resource sequence is atomic. If bootstrap or any step fails, stop with stage receipt and restrict recovery to separately approved coherent actions; do not automatically restore data or downgrade rules.
- [ ] Read approved real SDK options into new ignored cloud files, preserving local root config. Register the distinct native cloud package only if needed and authorised, rebuild/audit APK. No phone installation implied. Retain all original cloud documents/Auth accounts and unknown resources; new profiles/config are retained application additions.

### Task 7: Existing-cloud acceptance, owned-fixture cleanup and operator guide

**Files:** Create `scripts/hybrid-existing-cloud-qa.mjs` and `docs/HYBRID_EXISTING_PROJECT_DEMO_GUIDE_2026-10-28.md`; update roadmap/requirements/traceability/outer status/handover with measured results.

**Interfaces:** `runExistingCloudAcceptance({deploymentManifest,approval,adoption,originalState,ownedFixtureRegistry}) -> receipt`. Verify exact project/mode, digest, allowed actions, fresh original baseline and approved principal before fixture writes. Cleanup requires exact registered IDs, expected versions/hashes/Storage generations; preserve original rows, bootstrap profiles/config, retained demos and unknown concurrent additions. Local backup and production baseline are never deletion registries.

- [ ] First run destination/authority refusal tests. Then authorised cloud Auth/staff/Customer denials/allowance, evidence upload/download and independent role review; do not auto-approve other legacy users or touch their product.
- [ ] Independent-review cloud trials require a second distinct verified, enabled and explicitly role-approved participant account. Use normal user sign-in and approvals, never administratively mark existing accounts verified or invent a passing reviewer. If the necessary actors are unavailable, report those cases pending and do not certify complete cloud acceptance.
- [ ] Fresh registered demonstration products/shipments alone exercise stock analysis→independent risk/reorder review→PO→independent approval→issue→partial/full receipt, and delivery RF/rules→independent manager review. Preserve synthetic labels/disclosures; no original product/shipment stock action as a test. Retain legitimate demo records only if explicitly approved.
- [ ] Test actual HTTPS gateway, MSI offline/busy/restart, wrong model/chain identities and exact dropped-reply recovery while ordinary cloud reads/writes remain available. Blockchain observations stay read-only unless an explicitly participating MSI user signs. Never reset the user's chain. Check Customer proof grant revocation and1440px/390px Hosting views.
- [ ] Assert exact original128record/3account preservation against the fresh authorised cutover baseline, allowing only enumerated normal verification/sign-in metadata and explicit new additions. Save hashed evidence and exact cleanup; preserve later unknown writes. Physical Android/GPS/offline and parcel testing remain pending/paused, not passed.
- [ ] Document website URL, cloud sign-in/approval, MSI model/gateway/HTTPS startup, sleep/network dependency, wallet-on-MSI step, logs/rotation/cost monitoring and coherent recovery. The original laptop uses Hosting URL after actual acceptance. No Git push or further cloud deployment from documentation work.

## Planning verification and handoff

Audit and backups were executed read-only on28October. The companion design and this plan are prepared at the user's request; no product code, destination guard, local active profile or cloud resource has been changed. Native preference remains. A fresh builder check and root self-review must cover the five Review Focus cases and every design requirement before handoff. This plan is ready for review, not execution authority; billing remains explicitly prohibited until the user changes that instruction.

Fresh read-only builder check28October2026: **nothing important left**. Root self-review covers every design section and the five Review Focus cases; no product/cloud implementation is authorised by this planning check. The explicit request to prepare the plan was fulfilled without adding another design-approval round; execution remains a later decision.
