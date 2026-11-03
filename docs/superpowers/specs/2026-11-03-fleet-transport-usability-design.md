# Fleet and Transport focused interfaces

3 November 2026. The user explicitly requests live UI/UX improvements for these two modules, status/action colours and separating packed functions, specifically vehicle and driver creation. Apply the already selected navy/purple internal-tab/focused-panel pattern used by Stock, Procurement and Delivery. This continues the user's existing design choice; it does not ask them to select that pattern again.

## Approach and scope

Keeping the combined disclosure would leave the reported problem. Separate pages would add top-level navigation and disrupt the existing module arrangement. Use focused internal tabs and dialogs within each module, the same approach previously selected by the user. Keep the existing React/Firebase command contracts, permissions and data; no new APIs, schema, account changes, status transitions or model evaluation.

Fleet: Vehicles / Drivers / Fuel & Maintenance. Vehicles and Drivers retain independent loaded-page searches, filters and cursors. Each has one specific Add action and a separate create/edit dialog. Fuel/maintenance history has separate Record fuel and Record maintenance dialogs. Assignment status is prominent, base status secondary; unknown assignment continues to disable edits. Existing pending operation recovery stays outside all tab panels.

Transport: All plans / Scheduled / Completed / Cancelled, using the existing exact-status query. Each record has one Open plan action and a focused details dialog. Editing/reassignment and cancellation are explicit separate actions there. The editor groups Shipment, Vehicle/Driver, Route/Schedule and Estimates. The optional map is collapsed and mounts only when opened; stored/manual estimates and deliberate application controls remain unchanged. Preserve corrected owner+shipment query, selection epochs, versions, locks and all recovery identities.

## Visual and interaction rules

Preserve the existing navy/purple theme and system font. Navy primary actions, purple emphasis/selected tabs, neutral secondary actions, red cancellation confirmation, visible disabled reasons. Status pills always include text: Available/Completed green, Scheduled/In delivery blue, Maintenance amber, Unavailable/Unknown grey; errors red. Base Available never implies an unknown/assigned resource is free. Rounded dialog/list surfaces follow existing modules, without additional decorative widgets. Use labelled fields, keyboard focus, minimum44px controls and narrow-screen wrapping.

Close is disabled during a request; Escape follows the same guard. Unsaved local edits require discard confirmation, with Cancel retaining values. A pending recoverable request remains available after closing its editor or changing tabs. Legacy create/fleet-event/cancel paths retain the explicit lost-reply warning and history-refresh procedure rather than inventing recovery receipts.

## Verification and live update

Add focused status/availability tests and extend the established mocked browser harness for separation, colours, filters/cursors, dirty Cancel, pending recovery, read-only views, query/pager safety, map/manual separation and390px layout. Run affected backend tests and original sequential Firebase regressions, build/lint and secret checks. One final fresh review, then exact reviewed source/Hosting publication with the current verified backup and preserved MSI source/model/chain/proof/Desktop bindings. User's current live-update request authorises this release. Billing, original records/accounts, parcel/phone testing and Git publication remain unchanged/deferred.

Installed UI/UX Pro Max search verified colour+text and visible-label guidance. Its disclosure search and one narrowed retry returned unrelated typography guidance; the disclosure structure comes from the already accepted project pattern, not that search result.
