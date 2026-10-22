# Stage-linked parcel evidence implementation plan

Spec: ../../PARCEL_EVIDENCE_STAGE_CONTRACT_2026-10-20.md.
Use subagent-driven development with exclusive file ownership, then independent integrated review. Existing dirty feature checkout contains required changes; preserve all history, sealed experiments and uncommitted work. No production/model activation. Prior goal turn is progress: backend guard verified. Dataset download remains unconfirmed, not a live wait.

## Task 1 — Shared policy, trusted registration, Storage and integrity

Owner: backend agent. Files: new lib/parcelEvidence.js plus declaration if needed, backend/functions/service.mjs, storage.rules, firestore.rules comments only if schema documentation needed, lib/integrity.js, scripts/prepare-functions.mjs and focused pure/command/emulator tests. Update old test upload fixtures to required explicit metadata, preserving their assertions.

Implement contract exactly; share pure stage/source policy with UI. Add failing tests first. Preserve version-1 canonical strings, add evidence v2 fields. Maintain initial/final authorization and metadata consistency. Do not run emulator suites concurrently or restart services. Send shared helper API to frontend agent before it depends on it. No unrelated operations or research changes.

## Task 2 — Stage-aware acquisition interface

Owner: frontend agent. Files: src/features/operations/EvidenceUpload.tsx, a focused reusable pre-dispatch evidence panel if useful, Operations.tsx, WarehouseOperations.tsx, app/page.tsx only for needed props, parcel capture helpers/tests and existing CSS only as necessary.

Show fixed stage, permitted types and current permission. Add warehouse and logistics access under the role policy. Preserve explicit review/upload and camera ownership/cleanup. Record client source/time truthfully; legacy evidence remains unstaged. Test stale composer invalidation, file/camera source and readable legacy display. Match existing navy/purple UI. No service/rules/shared helper edits.

## Task 3 — Integration review and verification

Parent coordinates actual sequential emulator suites and desktop/mobile browser review; independent reviewer checks the shared policy against actual Storage/backend/UI and legacy canonical compatibility. Fix important findings through owning agents, then rerun only affected checks. Update user workflow README, roadmap, handover and completion checklist with honest evidence and remaining full goal.

### Review focus

1. Prepared becomes Dispatched after upload: registration must fail without relabelling.
2. Driver reassigned/disabled or scope changed: both object create and final registration must deny.
3. User spoofs capture metadata/type/stage or uploads PDF as Parcel Image: deny consistently.
4. Historical evidence integrity: unchanged v1 digest; explicit missing-stage display.
5. Camera capture/selected file outlives permission/stage changes: clear or unmount it; no stale upload.
