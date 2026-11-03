# Fleet and Transport usability implementation plan

> **For agentic workers:** Use superpowers:executing-plans under the existing Native execution choice. Keep one final fresh-context review. Root implements product code; independent support audits/QA remain separate.

**Goal:** Publish focused Fleet/Transport interfaces with semantic status/action colours and separate forms.

**Architecture:** Preserve existing parent data/command hooks and backend contracts. Add shared presentation helpers/status badges/scoped styles, reorganise Fleet dialogs/tabs and Transport list/details/grouped editor.

**Tech stack:** Existing React/TypeScript/CSS, Firebase/Spark MSI adapter and local Playwright fixture. No dependencies added.

**Spec:** ../specs/2026-11-03-fleet-transport-usability-design.md

## Constraints and review focus

- Main live runtime must remain untouched until exact verified cutover; work in existing isolated worktree.
- Unknown assignment is unavailable; base status is never treated as assignment proof.
- Keep all pending recovery/actor/version guards, page-local coverage and separate search/cursors.
- Dirty Cancel preserves input; busy Close/Escape cannot discard an in-flight operation.
- Preserve map/manual values, late-query fences, corrected missing-plan query and pager type=button.
- No cloud business/account writes, billing, model evaluation, parcel/phone or Git publication.

### Task 1: Presentation rules and controls

- [x] Write failing meaningful status/availability presentation tests; implement small helpers and shared labelled badges/tab controls.
- [x] Add scoped semantic action/status colours and responsive dialog/list styles; confirm tests green.

### Task 2: Fleet task separation

- [x] Keep data hooks/recovery in parent; add three focused panels and separate vehicle/driver/fleet-event forms.
- [x] Preserve original command payloads, independent page state, permission/assignment locks and close guards.
- [x] Prove separation, dirty cancellation, pending recovery and read-only/unknown-assignment behaviour with browser fixtures.

### Task 3: Transport task separation

- [x] Add four exact-query tabs and focused plan details; keep explicit edit/reassign/cancel paths.
- [x] Group editor fields and collapse optional map with no GPS or implicit estimate changes.
- [x] Prove existing query, stale reply, saved-operation recovery and pager/submit safeguards remain intact.

### Task 4: Verify and publish

- [x] Run affected Node/browser tests, original sequential Firebase regressions, build/lint and current/history secret checks.
- [x] Perform one fresh final review and one necessary fix pass.
- [x] Bind fresh876-document/9-Auth backup and current runtime to exact UI delta; preserve models/chain/proofs/roles/numbering/billing.
- [x] Publish exact Hosting package and verify assets, live desktop/narrow UI, runtime readiness and unchanged records.
- [x] Update testing guide, UX checklist and handover; leave code/evidence uncommitted because Git publication was not requested.
