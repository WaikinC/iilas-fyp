# Module URL Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the selected Native execution. Steps use checkbox syntax.

**Goal:** Give every web module a persistent URL and safe shipment/purchase detail links, with working browser history.

**Architecture:** A pure allowlisted route codec and a single React Router Data router surround the existing authenticated application. A navigation context centralizes guards while existing module controllers retain business authority and recovery.

**Tech Stack:** React19, TypeScript, Vite8, React Router7.18.5, unchanged Firebase SDK/backend.

**Spec:** docs/superpowers/specs/2026-11-03-module-url-navigation-design.md

## Global Constraints

- Use the existing isolated automatic-business-codes worktree; preserve all earlier uncommitted work.
- Node22/JDK21; no main checkout/source or live service changes during local work.
- No credentials, private configuration, datasets or test evidence in GitHub; no commits/push/deployment.
- Preserve account gates, immutable IDs/balances, Prepared handover and recoverable operations.
- Phone and parcel tests remain deferred; fixtures never call non-loopback services.

## Review Focus

- Cancelled Back/Forward must preserve both URL and unsaved shipment form.
- Account/role changes must retire stale confirmation callbacks and never mount unauthorized modules.
- A missing or foreign detail ID must not open a different row or enable an action.
- Direct login/deep reload must preserve the target without external redirects or sensitive URL data.
- Route changes must not remount the record-creation provider or lose pending-write recovery.

### Task1: Route codec and navigation service

Files: lib/appRoutes.js, lib/appRoutes.d.ts; src/features/navigation/AppNavigation.tsx; scripts/app-routes-qa.mjs; package.json/package-lock.json.

Interfaces: parseAppRoute(pathname), appRoutePath(module,recordId?), appRouteAccess(route,role); AppRouter; useAppNavigation; useNavigationGuard.

- [ ] Write and observe failing parser/access tests, including malformed encoding, unknown routes and prohibited detail IDs.
- [ ] Implement the closed route table and Data-router provider with blocker cancellation, callback fencing and beforeunload handling.
- [ ] Verify unit tests, dependency compatibility and browser history/guard cases.

### Task2: Authenticated shell and module URLs

Files: app/page.tsx; src/features/workspace/WorkspaceGate.tsx; app/navigation.css; routing browser fixture/QA.

- [ ] Observe missing URL navigation in a fictional shell fixture before integration.
- [ ] Replace local Tab authority with the parsed route; retain account and recovery providers; make sidebar links copyable/openable in a new tab.
- [ ] Add role home canonicalization, safe forbidden/missing page, document title and focus treatment; preserve module actions/filters.
- [ ] Verify direct entry/reload, login target, browser history, non-Admin Users and Customer staff-URL isolation, desktop/390px.

### Task3: Shipment, purchase and Customer detail URLs

Files: ShipmentWorkspaceController.tsx; Procurement.tsx; CustomerPortal.tsx; focused fixture QA.

- [ ] Observe failing detail/deep reload and dirty Back tests.
- [ ] Bridge route selection into existing controllers without changing business commands, request identities or authority keys.
- [ ] Add explicit guard cancellation/busy outcomes, current-row lookup, missing/loading states and safe Customer detail reads.
- [ ] Verify accepted/cancelled same-module and module exits, stale callbacks, missing/foreign IDs, recovery preservation and zero navigation writes.

### Task4: Verification, independent review and handover

- [ ] Run focused route/browser and existing shipment/customer/procurement checks; build, lint, current/history secret scans.
- [ ] Run original Firebase regressions sequentially against one isolated configured emulator stack if the integrated read/command flow is affected; no parallel or nested emulator wrappers.
- [ ] Obtain fresh independent review; fix important findings with regression evidence, rerun affected checks.
- [ ] Record exact changed files, results, limitations and a concrete coordinated release proposal. Keep the running supervisor services unchanged.

No commit steps: publication and Git changes are outside this request's local implementation boundary. The user's standing approval waiver authorizes choosing sensible implementation details without additional plan questions.
