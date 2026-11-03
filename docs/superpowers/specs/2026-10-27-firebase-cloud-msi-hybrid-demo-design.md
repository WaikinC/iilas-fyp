# Separate Firebase cloud project with MSI research services

**Superseding destination choice28October2026:** existing `fyp-inventory-and-logistics`; read-only backup and revised planning only, billing activation prohibited. See [new design](2026-10-28-existing-firebase-msi-hybrid-design.md). This historical separate-project design remains the record of completed local preparation; its destination guards have not been removed.

Date: 27 October 2026. Status: **design and ten-task Native plan approved by the user**. Local Phase A acceptance checks passed on 28 October; see the [preparation audit](../../HYBRID_DEMO_LOCAL_PREPARATION_2026-10-27.md). The user selected a **separate cloud demo project**. These approvals do not authorise project creation, billing, publication or deployment; Phase B Tasks9–10 remain gated. Native execution remains the user's preference.

## Purpose and boundaries

Make the existing IILAS FYP demonstration accessible from another laptop and an Android phone without keeping Firebase emulators or USB forwarding in the normal demonstration path. Run Firebase Hosting, Authentication, Firestore, Storage and trusted Functions in a new isolated cloud project. Keep frozen Python AI services and the Solidity/Hardhat demonstration chain on MSI. Retain the working emulator mode for development and recovery.

This is an FYP demonstration, with disclosed synthetic stock/delivery evaluations and a local demonstration blockchain. No new model, retraining, scientific TEST replay, accuracy claim, real business migration, production change, customer notification, app-store release or parcel/camera testing is included. Parcel device testing remains paused. Android physical-device tests remain pending until the user chooses to participate; software/build checks cannot substitute for them.

Keep the full outer workspace together, with iilas-fyp as its only checkout. Keep both original portfolios, saved skills, private configuration, current local accounts, IDs, balances, evidence and historical snapshots untouched. Preserve the selected initial Admin, approved-staff shared system, Prepared-Shipment Handover, Customer grants, existing independent approvals and navy/purple eight-card web interface. Do not merge other personal inventories.

## Approaches and decisions

The discussed hybrid route is retained: **web/phone → Firebase backend → authenticated HTTPS bridge → MSI**. An all-cloud AI/chain service would require different deployment/resource work; an all-emulator demonstration would retain MSI/USB dependency for ordinary application access. Neither is selected here.

The user explicitly selected a separate Firebase demo project rather than reuse of the original cloud project. Everything else labelled a builder call below is a concrete proposal for review, not an already configured resource.

### Component placement

| Component | Location and responsibility |
| --- | --- |
| React staff and Customer website | Firebase Hosting; existing roles, grants and workflows |
| Identity, operational records, files | New project's Auth, Firestore and Storage |
| Trusted business commands | Cloud Functions; authoritative access checks, transactions, receipts and audits |
| Stock RF14 and delivery RF | MSI loopback Python services with existing frozen manifests and resource guards |
| Parcel MobileNetV2 | Remains on MSI; preserve its adapter/configuration, but leave it disabled in cloud until the separately paused parcel work resumes |
| Solidity registry | MSI Hardhat chain; gateway exposes bounded read/receipt observations only |
| Wallet signing | Explicit Admin/Manager wallet confirmation in a browser on MSI, using its loopback chain |
| Android driver | Packaged React/Capacitor app; native Auth/commands/uploads, Room SQLite, WorkManager and visible GPS service |

**Builder call:** keep wallet signing on MSI for this first hybrid demo. Remote staff may use ordinary workflows and verification reads; registration shows a clear instruction to complete wallet signing on MSI. No automated/custodial signer or remote-wallet RPC is added. This preserves the existing manual-signature requirement while keeping raw port 8545 private.

## Verified changes required by the existing code

- lib/firebase.js currently selects emulator connections from the browser hostname. Replace implicit selection with a validated explicit environment profile, shared across Auth, Firestore, Functions and Storage. Local mode must still require literal loopback browser testing. A missing/mixed profile must fail closed rather than silently choose cloud.
- completionOperations.mjs, inventoryExperimentLifecycle.mjs and mobileDelivery.mjs explicitly require the old emulator project/hosts. Add an allowlisted cloud-demo mode alongside those checks; do not simply delete the guards or make arbitrary projects acceptable.
- integrityWorkflow.mjs pins RPC to 127.0.0.1:8545 and deployment identity; integritySource.mjs contains the old bucket identity. Introduce environment-specific adapters while preserving canonical source hashing, bounded byte verification, signing claims, deployment checks and final transaction revalidation.
- MobileEnvironment.kt accepts only the local debug project, synthetic options and emulator ports. Add a distinct cloud-demo debug build/configuration while retaining the emulator build. A cloud build must not contain emulator connection calls, loopback cleartext allowances or fabricated native Firebase app IDs. The native SDK remains session authority and the WebView mirror must have the same UID.
- Existing MSI serving profiles pin backend/client sources. Rebind serving-only integration metadata after approved changes. Frozen scientific artefacts, model weights, training code and consumed evaluation evidence remain unchanged.

## Environment and data isolation

Use explicit local-emulator and cloud-demo profiles. Each profile binds its project ID, bucket, Functions region, allowed web origins, mode and protocol identities. Do not switch an already initialised SDK into another project; require a clean reload/build. Distinct project-qualified browser recovery/cache keys and distinct Android application IDs prevent outbox or pending-operation reuse across environments. Existing local pending slots must remain recoverable in local mode, with no silent renaming or dropping.

**Builder call:** the new project starts with a small, separately generated demonstration fixture, not an import of the current emulator or private historical snapshot. Use the same configured initial Admin email, authenticated and verified in the new project, with the existing protected bootstrap process. A new cloud UID/scope is independent of the original local UID/scope. Staff use their own sign-in/approval; never copy old passwords, Auth hashes or all 116 test accounts. Record fixture identity/counts and dependencies before upload. Preserve the original local records and balances exactly. Importing particular existing records later is a separate reviewed migration.

Disable outbound email/SMS/notification integrations other than normal user-requested Auth verification/reset. Seed no real customer details, shipping labels, private parcel photos, addresses or research datasets. Any verification document/file used as a fixture must be anonymous, purpose-created and clearly a demo. Mark synthetic model provenance in results and supporting reports as today.

## Narrow MSI gateway

Run one small owned Node gateway on MSI loopback. It maps fixed versioned operations to the existing stock/delivery loopback service adapters and integrity inspect/lookup/receipt/event-range observations. The public-facing transport is an outbound HTTPS tunnel to that gateway; no router port forwarding is needed. Do not expose Python ports, Hardhat JSON-RPC, Firebase emulators, arbitrary files, arbitrary URLs, shell execution or a generic proxy.

The application contract is provider-independent: a single pinned HTTPS origin, no redirects, strict fixed paths and bounded bodies. A tunnel provider/account and stable hostname are deployment prerequisites, to be selected from what the user can supply before installing/starting a public tunnel. Building the adapter, local gateway and local contract tests does not require that account. The eventual deployment review must name the provider, exact exposed paths, external URL and any costs; no tunnel is opened by design approval alone.

Cloud Functions authenticate the Firebase user and derive current scope/role/assignment server-side. They sign a canonical gateway envelope containing protocol, demo project ID, request ID, named operation, actor/scope, payload digest, issue/expiry times and deployment/model identity. Use a dedicated high-entropy HMAC secret shared only by Secret Manager and an ignored local MSI file, timing-safe comparison and a short validity window. Clients never receive this credential. Gateway replay handling is bounded: exact request/digest may return a retained response; changed input under an existing identity is rejected; expired identities cannot start work. Reject arbitrary timestamp skew, project, operation, URL, path, model or chain selection.

Sign responses over request identity, payload digest, status and response digest; Functions verify them and closed schemas before use. Limit unauthenticated bodies before parsing, bound authenticated concurrency and cache size/expiry, redact logs and rotate the bridge credential independently of existing local Python tokens. The tunnel supplies transport only; gateway authentication remains required even if the tunnel also offers access control.

Preserve existing Python admission thresholds, per-model single-work/resource limits, deadlines and output verification. The gateway cannot lower a guard or queue unbounded work. Functions use conservative maxInstances/concurrency and existing per-operation leases; retries retain the original operation ID. A timeout or bridge outage becomes an explicit Pending/Unavailable/recovery outcome under the existing protocol, never an invented label or duplicate business action. Final Firebase transactions recheck current authorisation, product/shipment/evidence version and frozen model/chain identity after external work.

**Builder call:** stock and delivery are enabled first because they already have actual local integration evidence. Parcel configuration remains closed/off, with no image acquisition, image transfer or inference test in this scope. Enabling that route later needs the resumed parcel task; do not describe all three as cloud-tested.

## Integrity and restart behaviour

Cloud Functions retain authoritative source capture, evidence-byte hashing, claims, receipt publication and independent review. Only bounded chain observations cross the gateway. The existing MSI browser wallet submits a manually confirmed registration directly to its local chain. Verify exact sender, contract, digest, reference, deployment, receipt and source snapshot before publication. Never place files, addresses or AI predictions on the chain as a side effect of this integration.

Preserve chain ID, contract address, deployment transaction/block, runtime code digest and an explicit local deployment-generation identity in every claim/record. An MSI restart may lose the in-memory Hardhat state: the previous restart already required a fresh registry. Do not promise persistence from ordinary filesystem backup. Write a restart/reconciliation procedure that checks the actual deployment first. If it is lost, disable registration and show old records as unavailable against their original deployment; a deliberate new deployment gets a new identity. No silent re-anchor, rewriting historical records or automatic repeat signature is allowed. Durable chain persistence is outside this first demonstration design; a restart can require explicit recovery before the next blockchain demonstration.

MSI being asleep/offline must not stop cloud sign-in, inventory, purchasing, dispatch, Customer reads or ordinary driver synchronisation. AI/chain panels show explicit service/deployment unavailability and offer exact saved-operation recovery. An available gateway health response alone does not prove model admission or correct chain identity.

## Android cloud-demo extension

Register a separate Android app in the new Firebase demo project only during approved provisioning. Keep its generated config ignored; preserve the user's API-key exclusion from Git even though app configuration is observable in a distributed build. Use a distinct cloud-demo debug package/database namespace so emulator and cloud queues cannot mix. Show the selected environment in sign-in/settings without adding developer details to routine staff workflows.

Keep existing native/web UID fencing, live account checks, assignment checks, immutable action IDs, exact retry recovery, capture/receipt timestamps, bounded cache/outbox, stop-on-revocation and explicit foreground tracking. Use HTTPS cloud SDK endpoints; normal use no longer needs USB or MSI emulator ports. AI and blockchain are accessed through the backend, never directly from the phone. Automated native tests and a build are in scope; native sign-in, proof upload, GPS permissions, background/locked-screen behaviour and offline reconnection on the actual phone remain pending participant checks until the user connects it. No tracking starts merely by installation or login.

## Cloud resources, costs and deployment gates

The project ID, region, resource names, Auth authorised domains, actual service accounts, tunnel hostname and billing account are not created or inferred by this document. Before any cloud mutation, prepare an exact resource/configuration manifest for the new project, confirm its isolation from the original project and obtain explicit provisioning/deployment authorisation. Billing linking/enabling requires its own explicit user instruction. Use compatible nearby Functions/Firestore/Storage locations after checking current available locations; the exact choice belongs in that manifest because location choices can be permanent.

Current Firebase documentation requires Blaze for Functions deployment and Cloud Storage. Free quotas do not guarantee zero cost. Configure budget alerts, small instance/concurrency limits, bounded queries/files and least-privilege service accounts, but do not describe budget alerts as a hard spending cap. Keep gateway secrets in Secret Manager and local private configuration, not client bundles or Git. Keep actual generated browser/native configuration ignored. No cloud project selection/login/deploy should silently target the original project; commands must include the explicit new project ID and verify it before writes.

Official references: [Functions setup](https://firebase.google.com/docs/functions/get-started), [Storage billing changes](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Functions secrets](https://firebase.google.com/docs/functions/config-env), [Firebase pricing](https://firebase.google.com/pricing).

## Verification and evidence

1. Preserve the Native baseline/ledger and current local state. Test explicit environment rejection/mixed profiles, project-qualified recovery and local compatibility before cutover. Run build/lint, secret/history checks and affected software tests. Preserve frozen model hashes and existing scientific metrics.
2. Run original Firebase regressions and affected new suites sequentially against the existing single loopback stack, with exact fixture cleanup and state preservation. Verify current roles, pending/disabled users, Customer isolation, assignments, independent approvals, lost successful replies and receipts.
3. Gateway contract tests cover forged/expired/mismatched requests and responses, replay, resource admission, oversized/malformed input, timeout, model drift, chain reset, bounded event windows and no arbitrary proxy access. Assert raw service/RPC ports remain loopback.
4. Check desktop and narrow web UI; compare model outputs through the gateway to the frozen direct service on software fixtures without rerunning a consumed scientific TEST set. Measure latency separately from accuracy. Parcel tests are excluded.
5. Once separately authorised/provisioned, run isolated cloud smoke tests only against manifest-owned demo fixtures: Auth/approval, rules, upload, stock-to-purchase/receipt, delivery risk/review, Customer grants, bridge outage/recovery and MSI-wallet registration/check. No original cloud/local mutation. Preserve evidence of exact destination, fixture cleanup and source/model/deployment identities. Local tests alone cannot certify cloud connectivity.
6. Build both Android environment variants and verify bundled config/permissions/private-file exclusions. Document actual device checks as pending until performed, rather than blocking unrelated software verification or claiming them passed.

Completion means the approved cloud web workflow and stock/delivery bridge have actual isolated cloud evidence, the existing local setup still works, the Android cloud-demo build exists, and known participant/deployment limitations are clearly recorded. Parcel trial, real phone acceptance and real-world AI qualification remain distinct pending items. Update roadmap, environment/startup guide, MSI setup status and report addendum with truthful evidence; retain both original reports unchanged.

## Builder discretion and review status

The builder may choose file/module layout, typed closed DTO names, compatible SDK versions, local test doubles and exact bounded cache constants within existing limits. They may not change project isolation, model identities, scientific claims, signing custody, role/assignment contracts, billing/publication authorisation or paused testing scope.

Fresh builder check: a separate read-only Firebase/Android/gateway reviewer returned **“nothing important left”** on 27 October 2026. Written-design approval: received on 27 October 2026 (“Approve design — prepare Native plan”). This is a planning check and approval, not implementation or cloud connectivity evidence. No implementation, provisioning, tunnel publication, billing change or deployment has occurred for this design.
