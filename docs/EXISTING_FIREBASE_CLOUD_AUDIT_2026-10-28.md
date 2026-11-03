# Existing Firebase project audit and local backup — 28 October 2026

The user selected **reuse of `fyp-inventory-and-logistics`**, superseding the earlier separate-project destination. This run was authorised only to inspect, back up and plan. Billing was disabled before and after the audit. No application records, Auth accounts, rules, IAM policy, enabled APIs, deployments or public tunnels were changed. Normal Firebase CLI sign-in on MSI was completed by the user; credentials were not printed or embedded in commands.

## Verified cloud inventory

| Component | Observed and captured |
| --- | --- |
| Firestore | Standard edition / native mode, existing `(default)` database in `asia-southeast1`;128documents across4collections |
| Products |15 total;14owned by the selected initial Admin and1owned by another account |
| Shipments |11, all owned by the selected initial Admin |
| Audit logs / uniqueness records |61 /41; preserved at their original document resource names |
| Shared access configuration |No `system/config` and no `users` profiles; current cloud data predates the approved shared-system account workflow |
| Authentication |3accounts with password hashes/salts; project `signIn.hashConfig` including required hash parameters captured privately; no multi-tenant Auth enabled |
| Initial Admin |The existing selected account is present; its Firebase email-verification flag is currently false |
| Rules / indexes |1current ruleset captured;0composite indexes and1explicit field override/TTL entry captured |
| Hosting |1site,8release metadata entries,9files from the current deployed version copied; current-release identity checked again after downloads |
| Cloud Storage |Successful bucket listing found0buckets and0objects; no bucket was created |
| Realtime Database |Successful instance listing found0instances |
| Remote Config |Current template captured privately;0top-level parameters |
| Cloud Functions |API is not enabled; the list request returned403. No API was enabled to work around that result |
| Operator permissions |The signed-in CLI account has project Editor, not an observed project Owner/billing-administrator grant |

These are **cloud** records. The previous MSI emulator certification covered1,665documents/116accounts/twoobjects. It is a separate data set and was not used as a cloud backup or imported into Firebase. Two cloud owner groups remain separate; no personal inventories were merged.

## Private backup and verification

Local ignored directory: `outputs/existing-cloud-audit-20261028/`. The safe pointer `latest-backup-receipt.json` locates the immutable `backup-<UUID>` directory. Actual accounts, hashes, recipient/contact fields, images, deployed client configuration, rule sources and raw provider responses are private; never publish this directory or paste its contents into chat.

`verified-backup-receipt.json` verifies27original files plus2index/field supplements. The original receipt retains its conservative incomplete flag; the separate verification receipt resolves the two capture issues below without rewriting history. `additional-inventory-receipt.json` pins the two further private Realtime Database/Remote Config responses. All saved file hashes/lengths were checked after writing. Final offline verification also rechecks these receipts, typed values, document identities and Git preservation.

Firestore uses the official REST typed document representation with original names, nested value types, create/update timestamps and a fixed snapshot `readTime` (`2026-10-27T17:40:40.319Z`,28October in Malaysia). Collection and document listing use that same time, recurse through subcollections, include missing parents and refuse duplicate identities. Three sampled documents were re-read at the same time and matched. This is a local logical backup, **not** the billing-dependent managed-export/import format.

Auth users and full configuration were copied without signing in as any application user. Raw account hashes/salts and the project hash parameters remain private. Hosting backup contains deployed assets/configuration, not recovered original source; release metadata and provider file hashes are retained alongside local download hashes. No Hosting rollback occurred. Auth/configuration and Hosting were captured sequentially, so the whole project is not one cross-service atomic snapshot.

Two operational issues were corrected transparently: index/field endpoints rejected an explicit `pageSize`, so the supplement follows the installed Firebase CLI's default query and its explicit field-override filter; Auth hash configuration was already present at `signIn.hashConfig`, rather than the initially checked top-level property. Original failures and successful supplemental receipts are retained. There was no billing workaround, fabricated export or restoration over existing data.

**Restore has not been rehearsed.** A later restore requires separate approval and an isolated rehearsal; it must not be attempted against live cloud or the current MSI emulator state. Access tokens, active sessions, provider secrets and the original source/build environment are not recoverable from an Auth/Hosting data download alone. Functions resources could not be inventoried while their API is disabled. Other Google Cloud services outside this application's inventory are not certified as backed up.

## Consequences for deployment

1. Keep existing Admin-owned IDs, quantities, shipment state, uniqueness records and audit history. Never import the MSI test snapshot or overwrite cloud with it.
2. Verify the initial Admin's email through the normal user flow; do not set `emailVerified` administratively or bypass the existing cloud requirement. CLI Google sign-in does not verify an unrelated Firebase application account.
3. Adopt the existing cloud UID as `system/config.dataScopeId`/`primaryAdminUid` through the existing trusted bootstrap, after explicit future authorisation. Other users must register and receive explicit approved roles; the other inventory remains unmerged.
4. Current cloud rules enforce the older owner model and differ from the current app's shared-role rules. Replacing them changes access behaviour: old direct-write clients must stop; their writes may be denied after cutover. This needs a controlled, approved compatibility cutover.
5. Current web/native/deployment guards intentionally reject this project in cloud mode. A later local implementation must add a narrow backed-up-existing-project adoption policy. It must not remove the protections globally or turn localhost into cloud automatically.
6. The same project ID is used for local emulators and cloud. SDK identity must therefore bind **mode plus project**, not just project ID/bucket. Recovery storage, native outbox identity and server environment rejection must remain isolated.
7. Cloud Functions and a new proof-file bucket require Blaze. The user explicitly said **do not enable billing**: this task therefore ends at backup and a reviewable plan. The current Editor login does not establish billing/IAM grant authority.

See [revised design](superpowers/specs/2026-10-28-existing-firebase-msi-hybrid-design.md) and [deployment implementation plan](superpowers/plans/2026-10-28-existing-firebase-msi-hybrid.md). The current application code and destination guards remain unchanged until that plan is approved for execution.

Official references: [managed export billing requirements](https://firebase.google.com/docs/firestore/manage-data/export-import), [typed document listing and readTime](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/list), [collection listing and readTime](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/listCollectionIds), [Auth export and sensitive hash parameters](https://firebase.google.com/docs/cli/auth), [Auth configuration shape](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config), [Functions billing requirement](https://firebase.google.com/docs/functions/get-started), [Storage billing requirement](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
