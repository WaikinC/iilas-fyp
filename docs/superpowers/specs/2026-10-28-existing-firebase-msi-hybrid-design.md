# Existing Firebase project with MSI AI and blockchain — revised design

**Superseded architecture28October:** user selected **Spark + MSI backend**, keeping billing disabled. See [Spark design](2026-10-28-firebase-spark-msi-backend-design.md). Only Task1 offline backup/adoption validation was implemented (7passing cases); subsequent Cloud Functions/Storage tasks were not implemented. Retain that guard and the immutable backup; do not execute the billing-dependent phases below.

Date28October2026. The user explicitly chose the existing `fyp-inventory-and-logistics` project, requested cloud inspection/backup and a deployment plan, and prohibited enabling billing. This changes the earlier destination choice; it does not authorise implementation, cloud data migration, resource creation, public exposure or deployment. Native execution remains the preference for a later approved implementation.

## Intent, approach and boundaries

Retain the prepared hybrid architecture: browser/Android → existing Firebase Auth/Firestore/Hosting/Functions/Storage → authenticated HTTPS gateway → frozen stock/delivery models and local Hardhat on MSI. Wallet signing stays on MSI. Ordinary cloud workflows should remain usable if MSI is unavailable; inference/chain operations return unavailable/recovery. The existing project URL and cloud accounts/records are reused instead of creating a new project.

Approaches discussed: a separate cloud project gave stronger default data isolation but was superseded by the user's explicit reuse choice; an in-place, backed-up adoption preserves the existing project and needs explicit compatibility/access checks; Hosting-only Spark would not run the current trusted backend and is not a substitute for this plan. With billing prohibited for this run, only audit, local backups and planning are executed. A later local implementation can prepare a dry-run package without billing; actual Functions/Storage deployment remains gated.

Keep the complete outer workspace, its sole app checkout, current local1665documents/116accounts/twoobjects, original portfolios/skills, private configuration, frozen models/metrics and chain generation. No Git publication/history changes, model training, scientific TEST replay, parcel inference/testing or device participation. No cloud API enablement, Auth verification edits, account deletion/import, grant changes, bucket creation, data writes, billing linking or tunnel startup now.

## Observed cloud state and preservation authority

The [audit](../../EXISTING_FIREBASE_CLOUD_AUDIT_2026-10-28.md) records the verified backup:128typed Firestore documents,3Auth accounts plus hash parameters, current rules/index settings,9deployed Hosting files and release metadata. There are no Storage buckets or Realtime Database instances; Remote Config was captured. Database is Standard/native in Singapore. Functions API is disabled; current CLI role is Editor. The selected Admin exists but its Firebase email is unverified.

There are14Admin-owned products/11shipments, one other-owned product, two ownership groups and no shared system/user profiles. **Preserve**, never merge/reset/backfill these records. A fresh backup and cloud-state digest are required again immediately before any eventual cutover; today's backup must not be treated as authority to restore over later edits. Backups are local typed JSON, not managed-import bundles; restore is not tested and must have a separately reviewed isolated rehearsal.

The backup receipt SHA, current source hashes, existing project identity, expected cloud state/readTime, approved Admin UID (private), resource inventory, role/access changes, gateway origin/chain generation/model hashes and permitted actions bind one future adoption manifest. It must list only creation of approved new resources/profiles/config and later explicitly owned test records. Default `dataChanges` is empty. Any mismatch, missing/partial backup, unsupported destination or unapproved operation refuses execution. No broad removal of the original-project guard.

## Environment isolation and recovery

The existing ID is valid in local mode already. Future cloud mode permits it only through the independent, build/runtime-pinned allowlist produced by an authorised existing-project adoption. Unknown original-project cloud profiles remain rejected by default.

Use distinct named web Firebase applications whose names include mode and project (`iilas-local-fyp-inventory-and-logistics` and `iilas-cloud-fyp-inventory-and-logistics`). Do not reuse an existing default/unmarked SDK solely because project ID/bucket match. Bind an immutable environment identity before creating Auth/DB/Functions/Storage; reject a live instance from the opposite mode and require explicit reload. Backend cloud mode still rejects every emulator variable; local mode still requires the exact loopback tuple. Hostname never changes mode.

Retain all local recovery keys byte-for-byte and the existing cloud `iilas.project.<projectId>.` storage prefix. For the current same-ID target these differ; test both rather than migrate/delete either. Android retains distinct package IDs, named native apps/config hashes, local/cloud DTO `localOnly` markers, same-UID native/web session and queues bound to the packaged environment. A local APK cannot flush its queue using a cloud profile. No implicit GPS start; actual phone trials stay pending. Fix the recorded cloud recovery wording before the real cloud APK is offered.

## Existing cloud adoption and controlled access

Keep the selected initial Admin `choongkin6@gmail.com`. Its existing Firebase UID becomes `dataScopeId` and `primaryAdminUid` via `access.mjs`'s existing `registerAccount` bootstrap transaction, only after normal email verification, later explicit bootstrap authority and an absent configuration/profile precondition. Never set verification flags or manufacture Auth users. Check that the derived scope matches the14existing products/11shipments; a mismatch stops. A new `users/<uid>` profile and bootstrap audit are expected new writes; they are not mistaken for original-data drift.

Other existing accounts remain in Auth. Their profiles start Pending until the Admin explicitly approves a role after normal verified-email checks; no role is inferred from Editor IAM or ownership of old records. Other owners' products, uniqueness records and audits remain untouched/unmerged and outside the new shared system. The access consequence must be approved: an old account may lose direct legacy-app access until approved; approval still does not merge its personal stock.

Do not invent missing warehouse handovers, reservations, movements, snapshots, location history, proof objects or blockchain registrations for old shipments. Retain compatibility reads; only an explicit future app action may make its usual validated lazy updates. Existing cloud data is the cutover source of truth, not newer MSI test balances. The optional demonstration fixture is an exact new-ID manifest, never a whole-snapshot seed, and requires separate data-write authority.

## Cloud and MSI resources

Retain the existing Firestore location and Hosting site/web app. Before a later implementation, read the existing web app options into a separate ignored output configuration; never replace the working local configuration or commit keys. Proposed region for the two Functions (`command`, `customerEvidence`) is existing `asia-southeast1`; min0/max2/concurrency1 per function. A new proof Storage bucket in Singapore, Secret Manager bridge secret and scoped command/proof service identities require a later exact resource/IAM manifest and approval. Editor access does not imply permission to grant these roles or link billing; an authorised owner/billing administrator participates at that step.

MSI keeps models on8001/8002, Hardhat8545, and the signed gateway on loopback8010. Only its fixed authenticated `POST /v1/operation` is published via a later approved HTTPS provider/domain. Raw model/RPC/emulator ports stay loopback; there is no arbitrary proxy, filesystem, shell or automatic wallet-signing route. Preserve expiry/replay/admission limits, source/model hashes and chain generation; never reset/reanchor historical entries automatically. Parcel cloud routes remain disabled.

Keep Blaze disabled now. Later approval must cover billing separately from resource/IAM changes, tunnel publication, deployment, bootstrap and test-fixture writes. Account/provider/domain and exact charges remain unresolved. Budget alerts are notifications; optional service spend caps have limited coverage, not a project-wide guarantee. If billing remains prohibited, the complete Firebase backend cannot be deployed; the working local demonstration remains available without changing architecture.

## Verification, cutover and recovery

Before implementation, validate the typed backup and hashes offline; do not restore to live cloud/current emulator. Local TDD must cover same-project cross-mode SDK leakage, native/session/outbox isolation, denied unapproved existing-project manifests, stale/incomplete backups, preserved personal stock, missing/unverified Admin, old profile collisions and closed field schemas. Then run existing tests/builds/privacy checks and preserved workflow suites sequentially against the single current loopback stack. A source-bound profile refresh may be needed; export/verify then-current local state before any owned restart. Do not replay scientific evaluations.

A future reviewed cutover specifies a short maintenance window so old direct-write clients stop. Refresh backup/state and refuse unexpected changes. Deployment is not atomic: inventory and verify each Functions/rules/indexes/Hosting step, run only explicitly approved bootstrap/profile actions and check both denied and allowed access before declaring success. Freeze legacy record actions during acceptance; all smoke data uses fresh registered IDs and explicit users. Original128records/3accounts remain unchanged except separately enumerated normal user verification/sign-in metadata. New profiles/config/audits are recorded as authorised additions, not deletable test fixtures.

Partial failure stops with a resource ledger. Do not automatically restore cloud data, downgrade rules, grant broad access, delete unknown resources or switch users back to an old bundle against incompatible rules. Retain the old Hosting release and original rules/config; any rollback requires checking schema/access compatibility and new authority. Cleanup only exact unchanged test-owned records/generations; preserve bootstrap, original data and later user edits.

Actual cloud acceptance includes staff/Customer grants/proofs, stock analysis→independent reorder/PO review→issue→receipts, delivery RF/rules/review, lost replies, MSI outage/restart, frozen model bindings and read-only chain identity checks. Chain observations may use software fixtures but wallet signing remains a participant action. Verify desktop/narrow Hosting UI and real cloud Android configuration without installing a phone or starting GPS. Scientific accuracy claims remain disclosed synthetic-policy agreement.

## Builder discretion and current delivery

Builder choices: exact internal helper decomposition, immutable receipt encoding, private output naming and test double details within existing contracts. Fixed choices: existing project, selected Admin, no merge/import of local test data, explicit mode isolation, preserved original records, no billing now, frozen model/chain signing custody and paused parcel/phone scope.

The user requested this design and a concrete plan together; both are planning deliverables, not approvals to execute product/resource changes. The current separate-project destination guard stays intact until a later reviewed implementation is authorised. A fresh builder check is recorded with the companion plan before handoff.

Fresh read-only builder check28October2026: **nothing important left**. Root self-review covers every design section and the five Review Focus cases; no product/cloud implementation is authorised by this planning check. The explicit request to prepare the plan was fulfilled without adding another design-approval round; execution remains a later decision.
