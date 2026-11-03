# Fleet and Transport usability release — 3 November 2026

**Status: published and verified on the live Firebase Hosting website.** Open https://fyp-inventory-and-logistics.web.app/ and refresh the page to load this release.

## Fleet Management

- **Vehicles:** independent search/base-status filter and paging; **Add vehicle** opens only vehicle fields.
- **Drivers:** its own search/filter/paging; **Add driver** opens only driver fields and links an existing approved delivery-team account.
- **Fuel & Maintenance:** service history, with separate **Record fuel** and **Record maintenance** forms.
- Current assignment is prominent. Base Available does not establish that a resource is free. Unknown/assigned resources explain why editing is unavailable.

## Transport Management

- **All plans / Scheduled / Completed / Cancelled** tabs apply exact query selections.
- **Open plan** shows route, resources, schedule, estimates and the permitted actions.
- **Plan prepared shipment** and **Edit / reassign** use grouped Shipment, Vehicle and driver, Route and schedule, and Estimates sections.
- **Optional planning map** starts collapsed. Opening/calculating a map does not overwrite manually entered estimates. No GPS is requested.
- **Cancel schedule** is a separate red action with an explicit confirmation form.

## Colours and interaction

Navy indicates the main save/add action; purple indicates a selected task or emphasis; red indicates cancellation. Statuses retain text labels: green Available/Completed, blue Scheduled/In delivery, amber Maintenance, grey Unavailable/Unknown/Cancelled. Disabled actions include a reason. Seven tab types passed 56 immediate/settled/hover contrast measurements, minimum 7.10:1. Scoped tabs switch foreground/background together to avoid the global background-only transition temporarily hiding text.

Forms retain their existing actor/version/assignment checks and recovery identities. Cancel on a dirty-close prompt retains edits. Busy operations cannot be dismissed; saved recoverable requests remain above the tabs after closing an editor or changing tabs. Legacy create/event/cancel operations still require inspecting history after a lost response; this UI change does not add retry guarantees to them.

## Verification

- Four presentation/availability tests and 22 mocked browser groups passed, including 1440px/390px layouts, role restrictions, dirty Cancel, parent recovery, independent filters/cursors, query races, bounded missing-plan lookup and non-submitting pagers.
- Browser fixtures blocked nonloopback requests; map tiles were fulfilled locally; GPS calls were zero.
- TypeScript and production build passed. Full lint: 0 errors, 14 existing warnings. Existing bundle-size warning remains.
- Current-file/history secret scans passed. No Git publication was requested.
- Original Firebase smoke and QA passed. The affected actual Fleet/Transport suite passed four groups with exact cleanup: changed-role replay, resource locks, explicit reassignment and exactly-once dispatch stock accounting. Foundation tests passed 59 cases, plus 159 input checks and 57 stock/location checks.
- Fresh independent product/release review cleared both findings after fixes: map-button dirty tracking and exact runtime-pointer validation. Seventeen release/Auth guards passed.

Parcel/camera and physical Android/GPS/offline trials remain deferred. No model training, accuracy claim, new role grant, balance change or billing change belongs to this release.

## Published acceptance

Hosting version: `071e49fb6d97b1c3`. All 17 application assets downloaded from the live site matched the staged hashes. Deployed Firestore rules were unchanged; all 876 existing documents and nine Authentication accounts were preserved. No cloud business/account writes were made. Billing remains disabled.

The exact five UI files were applied; overall source binding is 856. Official serving preparation changed only the two existing Fleet/Transport view pins in the 109/86-key stock/delivery manifests. All scientific fields and 11 frozen artifacts were preserved; there was no training or model evaluation. Three exact application service owners restarted. The chain, tunnel, evidence root, 19 immutable proofs and two successful wallet receipts remained intact. The Desktop binding uses this release, and all five readiness checks passed afterward.

Actual hosted-browser checks opened separate vehicle/driver dialogs, service history, cancelled-plan details and the grouped Transport editor without submitting changes. A 390px browser check showed no horizontal overflow in Transport or the vehicle dialog. These are responsive browser checks, not physical-phone acceptance. Screenshots and private receipts are in the ignored release folder.

Current app-relative private pointer: `outputs/spark-msi-demo-20261028/fleet-transport-ui-live-20261103/cloud-runtime-fleet-transport-ui-published-20261103.private.json`. Use the existing Desktop launcher for normal startup; do not rerun one-time release helpers. Keep MSI awake/online. Full shutdown/chain recovery is still a separate unverified trial.

The new presentation/browser regression scripts and original QA evidence are retained in the isolated `.worktrees/automatic-business-codes` task workspace. No commit or Git publication was requested; integrating additional test/source files later requires matching runtime bindings.

See the updated [module-by-module supervisor guide](SUPERVISOR_MODULE_TEST_GUIDE_2026-11-03.md). UX-001 barcode guidance and UX-002 completed-notification dismissal remain open.
