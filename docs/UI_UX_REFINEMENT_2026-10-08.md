# IILAS UI and UX refinement — 8 October 2026

## Superseded visual direction — 9 October 2026

The user subsequently requested the original prototype's blue/purple theme and dashboard. See [current theme/dashboard](UI_UX_THEME_2026-10-09.md). The green palette and workflow-first dashboard below record the earlier design and are no longer the current interface. Navigation, pagination, labels, dialogs, account approval and operational form improvements are retained.

## Scope and design direction

This refines the existing React/TypeScript application for approved inventory, warehouse, logistics, Driver and Admin staff. It keeps one shared system and the existing transactional contracts. The browser checks use disposable local Firebase emulator records; the hosted site still has the earlier release.

The official OpenAI skill catalogue and the upstream Anthropic skill repository were searched. Anthropic's frontend-design skill was installed and applied with the existing Playwright skill. The saved copy is pinned to revision 683bc88e56f3e09ba94f7055977f3d3aa499f202 under the context archive's resources/skills/frontend-design. Its package hashes are recorded in SAVED_SKILLS.json. No Figma file was changed and no Flutter implementation was introduced.

The direction is a practical warehouse operations interface: green connects the shared operational areas, amber identifies stock requiring review, and status text accompanies colour. Segoe UI uses the native application font available on the project machine, with Aptos/Arial fallbacks and tabular numbers for balances. No remote font service is required.

| Token | Value | Purpose |
|---|---|---|
| Warehouse green | #173c35 | Main navigation and login identity |
| Action green | #166b55 | Primary actions and selected controls |
| Canvas | #f3f6f5 | Main working surface |
| Surface | #ffffff | Forms and record groups |
| Supporting text | #5c6f69 | Descriptions and secondary record information |
| Reorder amber | #a96512 | Stock requiring attention |

The earlier icon-only mobile navigation was replaced by a labelled drawer. A large catalogue chart was not selected as the main dashboard focus: the preparation/dispatch workflow is the significant integration boundary between both students' modules.

```text
Desktop: navigation | breadcrumb / module search / role
                    | operational heading
                    | warehouse preparation and dispatch stages
                    | stock totals and next actions
                    | catalogue mix and recent activity
Mobile: menu / current module / search / role
        heading and action
        vertical workflow stages
        two-column stock totals
        stacked operational sections
```

## Implemented interface changes

- Desktop navigation groups Inventory, Logistics and Shared services. Each module has an appropriate icon and a visible current-page state. The approved user's role is displayed.
- Mobile/tablet widths use a labelled drawer with a backdrop, Escape dismissal, focus containment and focus restoration. Its navigation scrolls independently, leaving Sign out available.
- Find a module searches module names and descriptions, with Admin-only account management excluded for other roles.
- The dashboard uses actual shipment/handover records for Awaiting picking, Picking, Packed, Prepared and Dispatched counts. Dispatched is a historical dispatch count, not an asserted number of active or completed deliveries. It opens Delivery Monitoring for current delivery events.
- Reorder alerts open the low-stock catalogue filter. Next actions open warehouse preparation and prepared transport. Existing warehouse allocations and Prepared-Shipment Handover remain authoritative.
- The catalogue consolidates product/name/SKU, displays available/reorder quantities together and retains barcode, category, location, stock, status and actions. Search includes location. Product, balance and movement tables display 25 records per page.
- Pending/dispatched queues use search and pagination. Warehouse defaults to Active jobs; All stages remains available for completed/cancelled history. Warehouse jobs show six per page.
- User Management has status counts, search, ten-account pages, role descriptions, approval/rejection/reactivation actions, copy feedback and an explicit disabled button for attempting to disable one's own Admin access. Backend protection remains authoritative.
- Login explains staff approval instead of Firebase implementation details. Password visibility, submit/loading protection, recovery links and plain-language error messages are implemented. Pending access explains verification and approval steps.
- Shared form labels use stable aria-labelledby references, so select options and help text do not become part of a field name. Dialogs contain keyboard focus, close with Escape and restore their opening control. Tables can be focused for horizontal scrolling, a skip link is available, and reduced motion is respected.
- Procurement, fleet, transport, delivery and reports share spacing, headings, form styles and actionable empty-state descriptions.

The theme is in app/interface.css, imported last by the Vite entry point. Operational field labels and dialog focus are reusable components under src/components. Existing rules, data models, role permissions, backend transactions and source report contents are retained.

## Verification

The first Playwright review passed 62 assertions: all 11 modules fit 1440, 768, 390 and 320-pixel viewports; catalogue and movement pagination/filtering work; reorder links, module search, dialog focus, menu dismissal and Admin self-disable protection work. No page runtime errors occurred after reload in that review.

Build and lint passed during implementation. The original smoke/QA scripts and account-access QA passed again against the running Auth/Firestore/Functions/Storage emulators. Deliberate rejected writes in the negative tests produced expected permission-denied logs. Final production build passed; lint reports no errors and the same four existing image warnings. Bundle-size optimisation remains an existing release task. A separate 17-assertion browser workflow passed: understandable sign-in failure, password visibility, Pending registration, Admin approval, role-specific navigation, mobile product creation, receipt and persistence, vehicle/Driver registration, linked shipment creation, picking/packing/Prepared-Shipment Handover, scheduled transport, atomic dispatch and an assigned Driver event. In that fixture, stock rose from 5 to 7 through receipt, reserved 2 during warehouse preparation, and finished at 5 on hand / 0 reserved / 5 available after dispatch.

Screenshots and CLI review scripts are saved in the application's ignored output/playwright folder. They contain local software fixtures, not production acceptance evidence. These checks are not a formal accessibility certification or a substitute for supervisor/staff usability acceptance.

## Remaining acceptance and next work

1. Complete production configuration and deploy backend, rules, indexes and interface together; verify real staff roles, the chosen Admin and retained quantities.
2. Ask the supervisor and both students to perform their real workflows and record usability feedback.
3. Add server-side Firestore query pagination and indexing for larger datasets. Current UI pagination limits rendered rows but still subscribes to complete collections.
4. Complete the restricted customer portal, labelled AI evaluation, configured inference and wallet acceptance already recorded in the roadmap.
