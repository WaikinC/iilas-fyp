# Parcel evidence stage contract — 20 October 2026

## Separate live sessions — 21 October 2026

The [live workflow](PARCEL_LIVE_FOUNDATION_2026-10-21.md) now uses this same Pre-dispatch/Delivery role/status/assignment policy for new sampled-frame sessions. It retains its own session/frame records and exact JPEG namespace, separate from registered photo evidence and v1/v2 integrity. Original requested stage and operation IDs survive lost responses, reload and dispatch; recovery does not relabel the original capture or grant new acquisition rights. Live preview and manual acquisition are mutually exclusive within the shipment composer, while authorised historical reads remain accessible outside its acquisition branch.

Both real model pins remain null, so current actual starts save Unavailable without sending frames. These software workflows do not establish condition accuracy, physical-camera acceptance or a parcel-level decision. Local history indexes were added without deployment; current integrated regression status is recorded in the live verification report.

## Saved photo outcomes update — 21 October 2026

The [photo request lifecycle](PARCEL_PHOTO_OUTCOMES_2026-10-21.md) now uses this same stage matrix for registered v2 Parcel Images. It preserves original stage/source/hash/version, snapshots current account/shipment/plan versions and stores recoverable outcomes with human review. Unknown-stage legacy evidence and Proof of Delivery cannot start analysis. Historical reads/replay remain allowed after lifecycle changes without inventing a stage or certifying current condition. Dashboard current assessments require accepted reciprocal results matching known current stage and evidence. Live sessions and model acceptance remain incomplete; the acquisition-only status below is historical.

This implements the stage-linked acquisition portion of logistics FR-7, preparing traceable photo/live analysis without opening model admission. The full parcel goal, original report source and limitations remain in PARCEL_AI_COMPLETION_GOAL_2026-10-20.md and PARCEL_CAMERA_SCOPE_2026-10-20.md.

## Stage and role policy

| Stored stage | Current shipment status required at upload and registration | Evidence type | Approved write roles |
| --- | --- | --- | --- |
| Pre-dispatch | Prepared | Parcel Image only | Admin, Manager, Warehouse, Logistics |
| Delivery | Dispatched | Parcel Image or Proof of Delivery | Admin, Manager, Logistics; Driver only while currently assigned |

Prepared means the existing completed warehouse handover; this does not change picking, packing, stock, transport or dispatch. No new mandatory photo blocks dispatch. Delivery evidence remains permitted after delivery completion as under the existing dispatched-shipment contract. Drivers cannot upload pre-dispatch evidence. Other approved staff retain existing shared read access.

Stage is explicit metadata, not inferred later from the shipment's current status. New Storage uploads require actor, stage, evidenceType and captureSource metadata and current authorization. New registerEvidence inputs require matching stage, captureSource and optional capturedAtClient; metadata/command mismatch is rejected. The existing immutable object path evidence/{scope}/{shipment}/{id} remains. Parcel Image accepts JPEG/PNG/WebP; Proof of Delivery may also use PDF. Existing 10 MiB bounds and immutable objects remain.

Backend authorization is checked before accessing object bytes and again in the final registration transaction. Both checks enforce scope, approval, current stage/status and Driver assignment. Dispatch between upload and registration rejects a pre-dispatch registration; it never silently relabels it Delivery. Storage creates, writes and deletes cannot bypass the policy.

## New immutable record

Retain current identity, storage path, hash, type, bytes, content type, actor and server createdAt. Add:

- stage: Pre-dispatch or Delivery.
- captureSource: file or camera, a client declaration.
- capturedAtClient: null for file selection; a valid bounded ISO timestamp for camera capture, treated only as an untrusted device-clock declaration.
- shipmentVersionAtRegistration: current shipment version observed in the final transaction.
- integrityVersion: 2.

Use server createdAt as registration time. Client capture time is never authorization or proof of actual capture time; reject invalid/future-beyond-five-minutes timestamps and require metadata consistency. Do not reject legitimately older uploaded photos merely because file metadata is old; file selection does not declare a capture time.

Legacy records keep their bytes and version-1 canonical integrity representation unchanged. Missing stage displays Stage not recorded; missing capture provenance displays Source not recorded. Never backfill historical stage from current shipment state. Version-2 delivery canonicalization binds the new stage/source/client-time/shipment-version fields in addition to existing evidence fields, preserving the v1 hash for old records.

## User workflow

Approved Warehouse staff can submit Pre-dispatch parcel images for Prepared shipments in Warehouse Operations. Admin/Manager/Logistics can also access a pre-dispatch evidence section in Delivery Monitoring. Existing dispatched delivery cards submit Delivery evidence. The composer shows a fixed stage, filters permitted evidence types, previews before explicit upload, and records file versus camera selection. Changes to stage/status/permission remount or clear a pending composer so stale captured photos cannot be registered under a different stage silently.

Show recorded stage, declared capture source, registration time and client capture time when available alongside existing evidence. Keep preview/camera cleanup, keyboard labels, mobile layout and existing visual theme. Continue explaining that only visible parcel faces can be reviewed and AI analysis is unavailable.

## Boundaries and verification

Do not change research model sources, sealed pilot artifacts, production configuration or acceptance pins. Request/result idempotency, persisted analysis outcomes and live sampled sessions remain subsequent core tasks, not completed by this stage increment.

Verify pure role/status/type/source and integrity compatibility cases; actual Storage creates plus trusted registration for both stages; every denied role/status/assignment, cross-scope and metadata mismatch; state changes between object upload and registration; immutable updates/deletes and forged Firestore writes. Run original smoke/QA, shared/access scenarios and capture/integrity regressions sequentially on existing loopback emulators, then build/lint, secret checks and desktop/mobile browser checks. Keep all fixtures/images/local accounts ignored; no production changes.
