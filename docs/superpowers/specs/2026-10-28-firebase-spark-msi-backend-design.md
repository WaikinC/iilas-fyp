# Firebase Spark with the application backend on MSI

Date28October2026. The user selected **“Switch to Spark + MSI backend; keep billing disabled”**. Website: `https://fyp-inventory-and-logistics.web.app`. This supersedes the Cloud Functions/Cloud Storage deployment architecture. This document is the revised design for review, not a record of implementation or live deployment. Native execution remains the preference after the written design and subsequent implementation plan are reviewed.

## Purpose and selected approach

Use the existing Firebase project on Spark for static React Hosting, email/password Authentication and Cloud Firestore, within their no-cost quotas. Run the trusted Node backend, private evidence files, frozen stock/delivery RF services and demonstration Hardhat chain on MSI. Keep the full local emulator development setup available separately. MSI must stay awake, connected and running the backend for transactions, uploads/downloads, AI and blockchain operations; website/login availability alone does not mean the full application is available.

The user considered a billing-enabled Firebase backend with only AI/chain on MSI, an all-local emulator demonstration, and this Spark/MSI route. The selected route avoids Cloud Functions/Cloud Storage billing while retaining shared cloud login and database. It requires transport and file adapters; it is not a pricing-setting switch. Do not deploy Cloud Functions, Cloud Run, App Hosting, Cloud Storage or Secret Manager, link a billing account, activate trial credits, or assume a free allowance makes those services available on Spark.

## Current evidence and scope

The existing cloud backup is verified:128Firestore documents/3Auth accounts plus private password hash parameters, rules/index settings, current Hosting assets and additional configuration;0Storage buckets/objects. There are14selected-Admin-owned products/11shipments and one other-owned product. No cloud `system/config` or `users` profiles exist. The selected initial Admin's Firebase email is unverified; the signed-in CLI account has Editor access. See [audit](../../EXISTING_FIREBASE_CLOUD_AUDIT_2026-10-28.md).

The previous existing-project work completed only its offline backup/adoption guard:7tests and the real backup pass, producing a non-executable draft. Session/manifest/native/cutover work from that Cloud Functions plan has not been implemented and is superseded. Preserve the helper/tests and private backup; they remain useful inputs for Spark adoption.

Keep the sole `iilas-fyp` checkout, original portfolios/23saved skills, initial Admin, current local1665documents/116accounts/twoobjects, original cloud128/3, IDs/balances, staff approval, Prepared-Shipment Handover, independent review, Customer grants and navy/purple dashboard. Never merge personal inventories or import the MSI test snapshot into cloud. No new AI model/training, scientific TEST replay, fabricated legacy movements/handovers, automatic blockchain signing or unrelated features. Parcel inference/camera trials stay paused; physical Android/GPS/offline trials stay pending.

## Placement and public addresses

| Component | Location |
| --- | --- |
| Static website | Existing classic Firebase Hosting site and `.web.app` HTTPS URL |
| Login and shared records | Existing Firebase Auth and Standard/native Firestore `(default)`, `asia-southeast1` |
| Trusted command/proof API | New standalone Node process on MSI, proposed loopback `127.0.0.1:8011` |
| Proof files and manifests | A new private, persistent, Git-ignored MSI directory, separate from emulator Storage exports |
| Frozen stock/delivery inference | Existing loopback8001/8002 services, with unchanged model/resource guards |
| Hardhat/wallet | MSI loopback8545; wallet signing remains an explicit on-MSI user action |

Firebase Hosting cannot forward a Spark request to a Windows localhost server through a Functions/Cloud Run rewrite. The website calls the MSI API directly over HTTPS, using an independently pinned API origin and exact CORS policy. The website keeps its Firebase address; the backend requires a separate API address, without buying a custom domain.

**Builder proposal:** use an account-assigned ngrok free HTTPS development domain forwarding only8011. No account/tunnel/domain is created or published by approving this design. Exact provider/account/domain and public exposure are a later concrete deployment gate. Current documented free limits are1GBoutbound/20,000HTTPrequests per month and1development domain; verify them again before setup. Exhaustion means unavailable, never an automatic paid upgrade. Programmatic requests use the documented provider header if needed; HTML interstitials must not be mistaken for successful JSON. No router port forwarding or public emulator/Python/Hardhat ports. The previous signed model gateway8010 can remain unused/private; the browser never receives its secret.

## Runtime identity and credentials

Add an explicit `spark-msi` runtime profile using a new closed schema rather than treating the original project ID as proof of environment. It contains project ID, approved website origins, pinned backend HTTPS origin, persistent backend-instance ID, private-adoption digest and `evidenceStore:'msi-local'`. The Spark profile has no Cloud Functions region or bucket requirement. Keep legacy local-emulator profiles compatible and unknown/mixed profiles refused; hostname never selects cloud mode. Create only Auth/Firestore SDKs in Spark clients—no Functions/Storage SDK initialisation or fallback.

Web Firebase app identity includes mode/project; do not reuse an emulator-connected default SDK merely because cloud has the same project ID. Preserve local recovery keys; Spark pending work also binds runtime mode/project/backend instance and actor, retaining older local/cloud slots for explicit recovery rather than deleting or reissuing them. The same logical operation ID survives network retries. A changed API origin/instance requires deliberate reconfiguration and recovery; never silently send old pending commands elsewhere.

The standalone backend initializes Firebase Admin with the exact existing project and a dedicated least-privileged service identity. It imports `service.mjs`'s command dispatcher directly, not the Cloud Functions entry point. Require explicit `spark-msi` configuration, no emulator variables, a matched credential project, validated file root and source/model/adoption pins before listening. A loopback test mode remains separately bound to emulators and must not accept real cloud credentials accidentally.

**Builder proposal:** a dedicated `iilas-msi-demo` service account with Firestore data access and Firebase Auth read access, plus local signing capability for the existing same-UID native/web custom-token flow. A private service-account credential file on MSI is the practical non-Google-server route; its exact identity, roles and credential creation require later owner/security approval. It stays in ignored private configuration with restricted local access, is never printed/uploaded/bundled, and is rotated/revoked through normal provider controls. Do not use the interactive Editor CLI login as the unattended server identity. No new key/role is created now. Cloud Admin access bypasses rules, so all existing server-side role, scope, version and transaction checks remain mandatory.

## Trusted commands and web transport

Expose a closed API only: proposed `POST /v1/command`, bounded evidence upload/preparation/download routes, Customer proof download and minimal health. Keep the existing `{action,input}` command and returned business result semantics. The wrapper verifies a Firebase ID token for this project, expiry and revocation/disabled status; actor UID comes only from that token. Then existing authoritative commands derive shared scope and check current staff/Customer/assignment authority. Do not accept supplied owner IDs, roles, arbitrary storage paths, file URLs, RPC methods, shell operations or credential overrides. Block paused parcel and legacy inference/signing shortcuts before dispatch.

Use bearer headers, never query tokens or browser-shared backend secrets. Exact approved Hosting origins receive CORS for only the supported methods/headers; browser credentials/cookies are omitted, redirects refused and private responses use no-store. Native HTTP may omit Origin but still requires the same verified bearer identity and protocol. Unknown explicit origins fail. Public health discloses only coarse readiness and cannot trigger model work or database queries.

**Builder limits:**128KiBcommand JSON input,4MiBbounded JSON responses,60second HTTP operation deadline,16active generic requests,60requests/minute per authenticated UID and120/minute globally, with bounded counters and pre-auth throttling. Existing lower action/model limits still apply. No automatic POST retry for commands without durable operation receipts. A timeout or lost response may follow a committed transaction: recover the original saved operation, never assume cancellation undid it. Preserve error codes/recovery details without sending internal paths, request bodies, credentials or stack traces to clients/logs.

MSI calls local model/chain adapters directly with their existing trusted source/configuration/receipt fencing. Cloud-source capture still rechecks facts before retaining output. Only serving source inventories may be refreshed; frozen scientific identity/metrics remain unchanged. Model failures cannot invent results or auto-create purchases/shipments. Manual wallet signing from the website works only in the browser on MSI; other devices receive the existing honest MSI-signing instruction.

## Private evidence storage

Introduce one explicit evidence-provider boundary for normal registration, mobile proof finalisation, Customer proof downloads and integrity hashing. The local emulator keeps its current Firebase Storage implementation. Spark uses a local immutable-file provider; parcel analysis/live paths remain disabled before they can access either provider.

Retain the logical `evidence/<scope>/<shipment>/<evidenceId>` identity and registered metadata, size/content-type/SHA-256/capture declarations. Clients never choose filesystem paths. The server maps validated identifiers to a private root; reject traversal, symlinks/reparse escapes and unexpected hardlinks. Files are not served through a public static directory or token-bearing download URL.

Web uploads gain a trusted preparation/intent bound to actor, scope, shipment/version, stage, allowed type, byte count and SHA-256. Native uploads reuse their existing `mobileEvidenceRequests` preparation and assignment/version checks. A bounded authenticated upload writes only that intent, streams at most10MiB into an owned temporary file, hashes/verifies it and commits immutable bytes plus a private manifest. Repeating the same successful intent returns its exact existing generation; different bytes or metadata conflict. Never overwrite a registered object. Use a persistent opaque numeric generation compatible with current metadata/validators and exact-retry recovery.

**Builder limits:**5GiBfile-store quota,1GiBminimum free disk before admitting an upload and existing10MiBper-file bounds/types. Keep manifests per logical object, atomically committed with exclusive creation and fsync; do not add a new general database. On crash/restart, expose only fully verified committed manifests; quarantine inconsistencies and retain unregistered partial files for bounded owned-intent cleanup. Cleanup checks current Firestore references and may remove only expired, unchanged, unregistered files owned by this store. It must never delete original emulator files, historical exports or registered/unknown objects.

Registration/finalisation retains the existing Firestore transactions and rechecks current identity, role, assignment, source versions, file generation/bytes/hash after external I/O. File existence does not grant shipment/proof access. Staff downloads require current evidence access; Customer downloads retain active explicit grants and current delivery-proof linkage, with a final grant/version/file recheck before returning bytes. Integrity verification hashes those same registered bytes/generation. Preserve no-store, content-disposition/type/length and bounded-read controls. No signature or current-chain claim is fabricated for old evidence.

Back up MSI manifests and committed bytes alongside the relevant cloud evidence metadata. The cloud currently has no bucket files to migrate; leave the two existing emulator objects and all historical snapshots untouched. Cloud record backup alone will no longer be a full proof-file backup. File backups do not automatically upload to GitHub, Firebase Storage or a new cloud provider.

## Android and offline behaviour

Keep the existing distinct local/cloud debug package IDs and Room/SQLite data separation. Add a packaged Spark mode that uses real cloud Firebase Auth plus authenticated HTTP commands/uploads to the pinned MSI origin. Native cloud transport must not initialise or call Firebase Functions/Storage. Preserve same-UID native/web session mirroring, server-issued authority, durable original operation IDs, immutable evidence bytes, source versions, logout/revocation checks, original-owner queue draining and conflict handling. Extend failure mapping for the bounded HTTP protocol without relabelling conflicts as transient successes.

A background worker refreshes the actual native user's Firebase ID token when connected and checks UID/mode/backend identity before each upload/retry. Never silently move local-emulator queues to Spark. Offline caching, explicit tracking Start/Stop,20second target sampling and30minute lease remain unchanged; expired leases stop capture as currently specified. No GPS starts as part of configuration or sign-in. Software/build checks do not certify physical auth/permissions/background/offline behaviour; the user postponed those trials.

## Existing cloud adoption, publication and quotas

Reuse the completed backup/adoption guard. Before live cutover, take a fresh cloud backup and verify the original records, selected UID/ownership, current Hosting release and absence of conflicting shared configuration. Use the normal verified-email requirement; never set `emailVerified` manually. Existing trusted bootstrap creates only `system/config`, the selected Admin profile and its standard audit. Other accounts remain Pending until explicitly approved; the other owner's product remains unmerged. No automatic seed/import of local balances, legacy history or Auth users.

Stage a static Spark Hosting build and explicit Firestore rules/indexes only. No Functions/Run rewrite, `pinTag`, function source/deploy hooks, Storage section, billing link, trial activation or paid-service provisioning in the staging config/CLI command. Secrets/private backups/models/server files cannot enter Hosting assets. The browser's required Firebase client options remain observable at runtime but ignored in Git; no server credential is bundled. The deployment tool refuses an enabled billing account or unexpected resources rather than trying to change billing itself.

Later exact approval covers the server identity/credential, public MSI endpoint, Hosting/rules/indexes cutover, bootstrap additions and owned acceptance fixtures. Prefer a coherent maintenance window so old direct-write clients stop. Deployments are not atomic: record each stage and stop on mismatch; no automatic old-rule downgrade, data restore, wildcard cleanup or deletion of unknown resources. A provider/account/permission failure never enables billing or purchases a plan.

Stay within Spark and tunnel quotas; missing quota stops work honestly. The current Editor permission does not establish authority to create/grant the proposed server identity. After approval, confirm actual capabilities and ask the appropriate owner only for the exact missing action. Verify billing remains disabled before and after publication. Do not automatically convert to Blaze if the CLI refuses a resource.

## Verification and completion

Implement under Native only after the written design and implementation plan are reviewed. Use TDD for profile/transport changes, token/CORS/project refusal, role loss, malformed/oversized requests, file traversal/overwrites/restarts/disk caps, replay/conflict/finalisation, Customer grant revocation and native queue isolation. Build web/mobile/native variants and inspect actual bundles/APKs. Run secret/history scans and generated-copy equality; no unrelated Git integration.

Run original Firebase suites and affected command/rules/native cases sequentially on one loopback stack, with exact cleanup and original local data preservation. If serving sources require restart, export/verify then-current state first and stop only reidentified owned processes; keep all research guards. Compare direct model predictions on fictional software fixtures without reusing scientific TEST rows. Use owned disposable file roots; never restore the cloud backup over the existing emulator.

Only after concrete publication authority, use registered fresh cloud demo IDs and approved distinct accounts for actual remote browser/client checks: login/roles/Customer isolation; inventory→independent review→PO→receipt; delivery RF/rules/review; proof upload/download/integrity; dropped replies; MSI/model outage and restart. Preserve original128records/3accounts and other-owner stock, except explicit bootstrap additions and normal verified-email/sign-in metadata. Cleanup requires exact unchanged owned fixture records/generations. Report participant-dependent wallet/phone checks pending if absent; parcel trials remain paused.

Completion means the Firebase Hosting site uses the real Spark Auth/Firestore project and the actual authenticated MSI command/file service, original data is preserved, billing remains disabled, and remote workflow evidence exists. Provide a startup/backup/restore/endpoint-quota guide for MSI and the original laptop. Today this architecture is selected and designed, not implemented or deployed.

## Builder calls for review

Proposed defaults are loopback8011, ngrok free assigned API domain, a dedicated locally held server credential, versioned Spark profiles, immutable per-object file manifests, and the stated HTTP/file/disk limits. These are builder proposals, not user-supplied settings or measured capacity. Exact credential creation/public origin/cloud-write authorisation remains a later deployment gate. No extra research or phone participation is needed to approve the software design.

Official references: [Spark quotas and available products](https://firebase.google.com/pricing), [Firebase Admin on a non-Google server](https://firebase.google.com/docs/admin/setup), [ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Hosting rewrite targets](https://firebase.google.com/docs/hosting/full-config), [Cloud Storage billing requirement](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [ngrok free limits](https://ngrok.com/docs/pricing-limits/free-plan-limits).

Fresh builder check28October2026: **nothing important left**. The independent read-only reviewer checked command authority/recovery, file fidelity/crash handling, Spark exclusion of billed services, native isolation, credentials and public HTTPS. The user approved this written design on28October2026 and requested the Native implementation plan. The [ten-task plan](../plans/2026-10-28-firebase-spark-msi-backend.md) is prepared/self-reviewed and awaits human plan review before implementation. No new runtime, credential, tunnel or cloud deployment has been created.
