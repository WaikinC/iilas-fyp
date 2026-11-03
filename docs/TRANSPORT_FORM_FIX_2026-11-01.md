**Current update — 2 November 2026:** [restored services and verified live Transport lifecycle](SUPERVISOR_READINESS_2026-11-02.md). Historical quota/stopped-runtime statements below are superseded. New wallet confirmations are pending on the fresh local chain.

# Transport form correction — live release, quota-limited acceptance

The focused correction is deployed to https://fyp-inventory-and-logistics.web.app/. Selecting fictional Prepared shipment `SUP-261101-79F529-SHP05` now retains that shipment and displays **No existing plan**, with no permission error. Live create/edit/cancel acceptance is **pending**, because Firestore reached its free daily read allowance before any plan-save click.

## Change and scope

The old form queried `transportPlans` by shared owner plus exact document ID. Under the existing rules an absent document could not prove ownership, so the selection failed. The corrected query uses shared owner plus the `shipmentId` field, returning an empty result when no plan exists. It reads at most two records and rejects duplicates or a mismatched document/owner/shipment identity. Existing selection-race, unmount, plan-status, version and resource-availability guards remain.

Source is retained in the existing isolated `.worktrees/mobile-driver-usability/src/features/operations/TransportManagement.tsx`, with regression `scripts/transport-plan-query-qa.mjs` in that worktree. The running main checkout remains frozen; its original Transport file was not overwritten. The focused Hosting build combines this Transport component with the exact already-deployed Verification component and scoped CSS. Other unpublished UI changes were excluded. No rules, indexes, backend, roles, credentials, billing or model changes were issued; no Git publication.

## Verified evidence

| Check | Result |
|---|---|
| Original bug reproduction | Actual source query and normal Firebase Web SDK against current loopback rules: owned existing plan allowed; absent plan permission-denied |
| Corrected query regression | Four cases pass: existing plan, absent plan, other-scope isolation and unapproved-account denial |
| Original Firebase regressions | Smoke and QA passed sequentially on a fresh temporary loopback stack |
| Fleet/transport regression | Passed in the same sequential stack; no cloud data or old emulator snapshot imported |
| Exact overlay types / production build | Passed; fifteen staged public assets |
| Lint / secrets / history | Passed; root lint has six existing image warnings and no errors; focused lint clean |
| Independent review | No Critical/Important issue. Minor: duplicate/identity rejection branches are not directly executed by the query regression; they fail closed and remain a future test extension |
| Hosting | CLI exit 0; current public bytes independently match all seventeen expected files, including Firebase reserved assets |
| Live form | SHP05 selection retained; No existing plan shown; original permission error absent |
| Desktop layout | Observed 1440 px, no document-wide overflow. A requested 390 px override left this target at 1440 px; narrow-screen acceptance was not established in this pass |
| Actual live create/revise/cancel | **Blocked**, zero save attempts; resource availability cannot be checked while Firestore rejects reads |
| Before backup | Full current cloud/Hosting/Auth/proof backup verified privately: 723 documents, three accounts, seventeen proof-store files |
| Preservation available after deployment | All seventeen local proof files still hash-match; all 788 pinned source files and eleven frozen artefacts match. No business mutation was issued by this task |
| Full post-deployment database/Auth census | **Pending**; no success claim, and no further full database scans while quota is exhausted |

Current model/API/public health endpoints returned ready during diagnosis, and published bytes matched. Firestore-backed operations remain impaired despite healthy process endpoints. No new blockchain transaction, parcel inference, camera, phone or GPS test occurred.

## Quota blocker

At approximately 23:31–23:34 MYT, 1 November, a bounded read returned HTTP 429 / `RESOURCE_EXHAUSTED` / **Quota exceeded**. The Google Cloud quota console displayed **49,949 / 50,000** daily read operations (**99.9%**) for the default database. Its displayed daily writes were 495 / 20,000 and deletes 6 / 20,000. The Firebase summary showed about 32K reads; that summary is not the authoritative quota counter and may lag/differ. Do not treat cached app data as proof that fresh server operations work.

Repeated full-database verification contributed to consumption. The legacy observer recursively lists collections below every document and repeats complete scans before/after deployment. Do not keep rerunning that observer, the full backup, or the old publication command to troubleshoot this blocker. Reduce repeated scans and use bounded targeted checks after quota recovery, with one deliberate final census rather than repeated whole-database passes. Billing remains disabled; do not enable it or change quota/security controls to bypass this restriction.

[Firebase documents](https://firebase.google.com/docs/firestore/quotas) 50,000 free document reads per day and reset around midnight Pacific time. For this observed period that is approximately 16:00 MYT on 2 November; this is an estimate, not a guaranteed recovery deadline. The actual server response must be checked before resuming.

An automatic approval review rejected a checkpoint helper because it could perform additional database reads. That helper was not run. It was replaced by an offline-only checkpoint with built-in filesystem/crypto imports and no SDK/network/database calls. The offline checkpoint verifies existing evidence and local hashes; it does not manufacture a post-deployment cloud census.

## Resume safely

1. Confirm the daily read allowance has recovered using one bounded observation. Do not poll the app with repeated refreshes or whole-database scans.
2. Refresh the actual current state of SHP05 and its plan before acting. No SHP05 plan was created in this task. If another tester has changed it, reconcile their current state; do not restore this backup or repeat a completed command.
3. Through the live form, create one fictional SHP05 schedule with available supervisor VAN1/driver, manual distance 15 km, time 1.5 hours, cost MYR 25 and an explicit valid date. Leave optional coordinates blank. Verify saved version, two assignment locks and unchanged stock/warehouse allocations.
4. Reopen the saved schedule, revise time to 2 hours once, and verify exact saved-operation recovery without another update.
5. Cancel that fictional schedule with an explicit rehearsal note; verify Cancelled, shipment still Prepared, resource locks released and all stock unchanged. This retains history and leaves resources free for the supervisor. Do not dispatch or delete it.
6. Perform the actual narrow browser check and one final preservation/backup, with bounded read accounting. Keep parcel and physical phone trials deferred.

Ignored receipts/scripts: `outputs/spark-msi-demo-20261028/transport-form-live-20261101/`. The failed broad publication observation is retained separately from the successful CLI/files check. Do not rerun deployment: the corrected package is already live. The unused future `final-observation.mjs` requires completed live acceptance and must not be run during quota exhaustion.

Current private handover: `outputs/spark-msi-demo-20261028/cloud-runtime-transport-quota-blocked-20261101.private.json`. It retains the same preparation, service owners, current stock wrapper and previous wallet receipts, and explicitly marks the live save/final-census work incomplete. Keep MSI awake/online and preserve the current Hardhat process.
