# IILAS account approval and shared data contract

## Live-session boundary — 21 October 2026

The [live-session implementation](PARCEL_LIVE_FOUNDATION_2026-10-21.md) uses the same protected fixed scope and active Approved accounts. New capture follows the existing shipment stage/role/Driver assignment matrix; original config/account/shipment/transport snapshots, actor lock, frame nonce and generation are rechecked before finalisation. Immutable private start/frame receipts and locks deny every client read/write. Safe public session/frame records permit Approved fixed-scope history reads and no direct writes. All client live Storage writes are denied; trusted ingestion retains bounded exact JPEG samples. Storage shared reads use only the current account and system/config documents.

Creator or current Admin/Manager may explicitly stop; Approved staff can resolve historical records without restoring capture rights. Admin/Manager review requires exact retained-generation/bytes and a final current-authority/version check. A photo acceptance cannot grant live use; both real model pins remain null. Exact timeout/recovery identities survive uncertainty, and no live outcome changes stock, shipment state, initial Admin identity or personal-inventory ownership. Actual application integration, original sequential regressions and bounded-history review are locally verified. Shared history uses20session pages and12selected frames; a separate bounded current-session observer preserves remote-stop checks away from the latest page. Model quality and physical-camera acceptance remain incomplete; no deployment is authorised.

## Parcel photo outcomes — 21 October 2026

The [verified photo lifecycle](PARCEL_PHOTO_OUTCOMES_2026-10-21.md) derives scope/actor from this contract. Private operation/Blocked receipts and locks deny every client read/write; safe public analyses permit existing Approved/active fixed-scope shared reads and no direct writes. New requests follow current evidence stage/role/status/assignment policy. Historical matching replay/resolve remain readable by any Approved staff role after dispatch/reassignment, without granting new-start permission. Final transactions recheck current approval, exact snapshots/model/lease/nonce/lock identity; access loss cannot publish a label. Admin/Manager review updates reciprocal records atomically. No model pin opens and no stock, personal inventory or primary Admin identity is migrated.

Updated 8 October 2026. This replaces the organisation/invitation model. Local implementation and emulator/browser evidence are available; the public site has not been updated.

## Account lifecycle

Users register/sign in with their own Firebase email/password credentials. The authenticated registerAccount command retrieves identity from Firebase Admin, then creates users/{uid} with uid, email, displayName, emailVerified, role:null, status:Pending, active:false, version and timestamps. Registration ignores client-supplied roles, approval flags and email identities. Existing accounts also enter approval unless provisioned by the configured administrator bootstrap.

Only an active approved Admin may approve a Pending, Rejected or Disabled account, assign one of Admin/Manager/Inventory/Warehouse/Logistics/Driver/Viewer, update an approved account's role/display name, decline a pending request, or disable approved access. Production approval checks the current Firebase Authentication emailVerified and disabled flags. Emulator accounts bypass email verification only for local tests. Approval, role changes, rejection and disabling use version checks and append audits in the same transaction. Registration/refresh cannot restore rejected or disabled access.

The interface provides waiting/declined/disabled screens, display-name editing, verification email and refresh controls. Approved staff enter IILAS immediately. User Management is an Admin-only interface. Pending users can read only their own account profile; staff cannot list profiles. All operational client writes are denied and routed through the trusted command backend.

## Initial administrator and existing data

The user selected choongkin6@gmail.com as the initial administrator and source of the main inventory. IILAS_BOOTSTRAP_ADMIN_EMAIL is saved in ignored backend/functions/.env.local for emulators and .env.fyp-inventory-and-logistics for future production deployment. No password is stored there. Keep this configuration available when deploying; a fresh checkout must set it explicitly.

On first registration by that authenticated account, and only while system/config is absent, the server atomically creates the system configuration and approved Admin profile. Production setup requires that account's verified email. Other users cannot initialise the system, choose another owner, or become Admin by being first to register. The initial Admin must remain active Admin; administrators cannot remove their own access through account management.

system/config contains immutable dataScopeId and primaryAdminUid, both initially the configured administrator's Firebase UID. Existing ownerId values, product/stock/shipment IDs, quantities, movement history, handovers, evidence paths and registered hashes are retained. This adopts that owner's records in place; it does not copy, reset or combine stock. Previously created organisation memberships/invitations do not grant access. Their stored documents remain untouched but inaccessible through application rules.

Other accounts' personal data remains stored and protected. It is not automatically merged on approval. A separately reviewed migration must resolve duplicate products, references, reservations and balances before combining any such inventory. Changing the configured email after initialization does not change the existing primary Admin or data source.

## Operational authorisation

Manual stock command receipts are server-private, keyed by fixed scope, actor UID and operation ID. Current approval/role is rechecked before replay or outcome reconciliation. Even Admin cannot read/list/forge those receipts directly. They do not change scope, account approval or inventory ownership. See CONTINUATION_REVIEW_2026-10-09.md.

Every business command derives the one fixed data scope from protected system/config. A client cannot choose another scope. Inside every transaction, the server rechecks Approved status, active flag and the operation's role. Slower evidence, inference and blockchain work rechecks approval in its final transaction. Driver writes require the assigned shipment; warehouse-to-logistics contracts and independent approvals remain intact.

Approved staff read the chosen shared operational records. Read-only Viewer is an internal staff role, not the report's restricted Authorised Customer role; that portal/access boundary remains pending. Firestore and Storage deny pending/disabled/rejected users even if they know a document ID or previously owned a legacy record. Rules deny direct access to old organisation, invitation and membership collections, and direct writes to profiles/configuration/operations.

The internal compatibility property workspaceId in existing UI/repository code means fixed dataScopeId; it is not selectable and no organisation is created. Preserving it avoids unnecessary changes to warehouse, evidence and blockchain formats.

## Verification and release

scripts/account-access-qa.mjs tests pending access, role/identity forgery, deprecated command rejection, approval, role changes, disable/reactivate, rejection, fixed-scope protection and retained stock. The smoke, QA, shared and capacity suites test the combined operational flow under approved accounts. Playwright checks actual signup, waiting, Admin approval, staff access and narrow-screen interfaces.

Deploy backend, rules, indexes and interface together after build/lint/emulator/browser checks pass. Production verification must include the selected existing Admin, verified-email approval, staff roles, disabling and preserved inventory. Functions/Storage billing, research secrets/service and chain configuration remain release dependencies. Do not deploy the new interface against the old backend.
