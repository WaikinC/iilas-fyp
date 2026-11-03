# Mobile Driver usability design

Status: visual preview prepared; product implementation awaits written-design approval.

## Intent and selected approach

Improve the existing React/Capacitor Android Driver interface so a driver can find an assignment, record its next permitted update and understand saved work on a small screen. The user selected mobile/Driver first, then chose assignment list → delivery details → saved queue with a visual preview.

The alternative was to keep the current long page and improve spacing/labels only. The selected task flow gives delivery details their own focused screen and avoids a horizontal assignment strip above the status/proof/tracking forms. This is a bounded first pass on existing Driver presentation, not a new backend or a redesign of every staff module.

## Screens and interaction

- **Assigned deliveries:** vertical, full-width assignment rows with reference, recipient, destination, confirmed status and a clear open action. Distinguish cached data and its verification time. Retain assignment paging/refresh; do not describe a page count as the total assignment count unless the existing response provides that total.
- **Delivery details:** explicit Back to deliveries, confirmed status and permitted next actions. Separate locally queued status from server-confirmed status. Keep notes, proof requirement and primary save action together. Preserve required proof/notes validation and all existing transition/capability checks; the server/native client remains authoritative. Navigating back should preserve usable draft context within the active session without adding a new durable store or leaking it across accounts.
- **Saved queue:** persistent labelled navigation with the real pending/review counts. Prioritise items needing attention, then pending/recent work on the current page. Keep original operation IDs and existing canCheck/canRetry/canDiscard flags authoritative. Keep discard behind the existing confirmation. Explain how to check/retry the original action instead of starting a replacement. Page groups must not imply that all queue items have been loaded.
- **Connectivity:** show network availability separately from last successful assignment verification. Network availability is not proof that MSI is reachable or a queued operation succeeded. Never label a pending action Delivered/Uploaded/Confirmed merely because it is saved locally.
- **Tracking:** user-controlled Start/Stop and existing notification/lease rules remain. Stop stays prominent when tracking is active; progressive disclosure must not hide the only Stop action. No GPS, permissions or automatic tracking starts from navigation.

## Visual system and accessibility

Keep the approved navy #0f2348, blue #1b3b6f, purple #6d28d9, canvas #f0f2f5 and white surfaces. Use the existing local Segoe UI/Aptos/Arial family, approximately 16px primary mobile text, readable secondary text, restrained borders and explicit text labels alongside status colours. Aim for 48 CSS px primary controls with at least 8px spacing; this is a usability target, not a claim that CSS pixels are a universal native accessibility unit.

Provide visible keyboard focus, meaningful control names, heading focus on screen changes, sufficient contrast, reduced-motion handling and safe-area padding for notches/gesture navigation. Reserve content space for navigation/actions so controls do not cover notes, proof choices or errors. Test narrow/short layouts and long references/addresses. Field errors belong beside the relevant controls.

## Existing implementation boundary

Expected presentation files: `src/features/mobile/MobileDriverShell.tsx`, `MobileShipment.tsx`, `MobileQueue.tsx`, `MobileTracking.tsx` and `mobile.css`. Reuse `MobileClient` and its existing typed responses. Preserve recovery-only access and queue recovery after role/assignment changes, session isolation and original saved-operation behaviour.

No changes to Firebase data/rules, service authority, native Room/SQLite schema, background GPS implementation, upload protocol, leases, frozen models, parcel functionality or blockchain. Staff/Customer web screens and the eight-card dashboard remain outside this first pass. The live source-bound demo must keep its existing files/bindings while an isolated implementation and local build are reviewed. A changed APK/profile requires matching source/configuration checks; live publication is a separate action.

## Guidance and preview

Installed UI/UX Pro Max 2.15.0 from NextLevelBuilder, MIT licence, pinned revision `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03`. It supplies touch-spacing/target and loading-feedback guidance; the offline-specific search had no match, so queue semantics come from IILAS's existing contract. The app remains React/Capacitor with existing CSS; no new UI library or application dependency is proposed.

The isolated visual companion under `.superpowers/brainstorm/175-1793289409/` contains fictional assignments and local-only interactions. It makes no IILAS API/Firebase requests, chooses no real file, starts no sensor and confirms no real delivery. It is a throwaway layout reference, not completed Android integration. Its tracking/proof/network controls illustrate states only.

## Verification and completion

After design approval, prepare the Native implementation plan. Verify navigation/back behaviour, draft handling, permitted transitions/proof validation, pending-versus-confirmed display, queue capability controls, recovery-only access and tracking Stop visibility. Use synthetic typed UI fixtures for presentation tests; do not create cloud accounts or mutate the preserved demonstration records for styling work.

Check 320/390/768px layouts, a short phone viewport, keyboard focus, long labels and no page-wide horizontal overflow. Run the applicable build/lint and mobile component/contract checks; build/privacy-audit the updated Android artefact when the approved implementation scope reaches that step. Real Android touch/keyboard, notification/background GPS and offline synchronisation acceptance still require the user's phone. Do not represent browser-preview checks as physical-device acceptance.

Success: the three-screen flow is easier to navigate, queued work is unmistakable and original business/recovery controls remain intact. A visually polished preview alone does not satisfy this completion condition.
