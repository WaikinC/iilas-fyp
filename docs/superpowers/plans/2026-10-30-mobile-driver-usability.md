# Mobile Driver Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user selected **Native**. Steps use checkbox (`- [ ]`) syntax. The written design was approved on 30 October 2026; implementation awaits review of this plan.

**Goal:** Deliver the approved assignment list → delivery details → saved queue interface in the existing Android Driver React components, preserving delivery, evidence, tracking and saved-operation authority.

**Architecture:** Keep `MobileClient` and native/backend contracts unchanged. Reorganise the existing presentation into three views, retain session-only form drafts per shipment and group the current queue page without changing operation identities. Verify actual React components through an isolated fictional-client browser fixture, then build reviewed local/test Android artefacts without changing the running demo.

**Tech Stack:** Existing React 19.2.6, TypeScript, Vite 8, CSS, Capacitor 8.5.3 and Android tooling. Node 22.13+ within major 22, JDK 21; no new application dependencies.

**Spec:** [Approved mobile Driver design](../specs/2026-10-30-mobile-driver-usability-design.md). Approval reference: human reply “Approve design — prepare Native plan (Recommended)”; approved document SHA-256 `de1566e17539196aeef36d8626cceb179b068af0824057544211cb0c08ea0f68`.

## Global Constraints

- Preserve the navy #0f2348, blue #1b3b6f, purple #6d28d9, canvas #f0f2f5 and white surfaces. Use local Segoe UI/Aptos/Arial, approximately 16px main text, 48 CSS px primary controls and at least 8px spacing.
- Preserve the current initial Admin, IDs/balances, role boundaries, Prepared-Shipment Handover and eight-card staff dashboard. Staff/Customer web redesign is outside this pass.
- No Firebase/rules/data, `MobileClient` protocol, Room/SQLite schema, background GPS, leases, upload protocol, models, parcel or blockchain changes. No new cloud fixtures/accounts, wallet actions or sensor collection.
- Network availability, cached verification time, queued status and server-confirmed status are distinct. Existing queue capability flags remain authoritative. Navigation never starts tracking, retries or uploads.
- Work in isolation from the active source-bound demo. Preserve its 788-file source binding and all runtime/profile/checkpoint files. Do not copy old Git history, datasets, models, private configuration, credentials or backups into another checkout.
- Keep current uncommitted application work. Do not stage, commit, push, publish, replace the live APK/profile, restart MSI services or delete demo data under this plan. Preserve the Native ledger because publication is deferred.
- Run build/test commands from the isolated app root with the selected Node/JDK toolchain. Browser fixture uses literal `http://127.0.0.1:5173`; require the port to be free or already owned by this task, and do not start Firebase emulators for presentation tests.
- Retain Android build admission of 3 GiB free Windows RAM, two Gradle workers, current heap/time limits and source/configuration/privacy guards. Insufficient resources mean wait/free resources, not lower guards.
- Browser/component checks are software evidence only. Physical Android keyboard, permissions, notifications, background GPS and offline synchronisation trials remain pending.

## Review Focus

1. A late detail/file reply after another shipment/account is selected must not attach its content to the new selection; old account drafts must disappear. Tasks 1–2.
2. Pending proof or a queued Delivered update must never appear as confirmed delivery. Invalid transitions/notes/proof choices remain refused. Task 2.
3. Recovery-only mode, changed assignment and restricted queue capabilities must retain exact outcome recovery without enabling fresh Driver actions. Tasks 1 and 3.
4. Queue paging, null/loading responses and global pending/review counts must not turn page-local groups into misleading totals. Task 3.
5. Long text, a short viewport, keyboard navigation and active tracking must not hide primary controls or the only Stop action. Tasks 2 and 4.

## File and interface map

| File | Responsibility |
|---|---|
| `src/features/mobile/MobileDriverShell.tsx` | View navigation, account-bound UI lifetime, selected delivery, session-only drafts and existing client calls |
| `src/features/mobile/MobileShipment.tsx` | Focused details, status/proof form, inline feedback and explicit Back |
| `src/features/mobile/MobileQueue.tsx` | Current-page grouping, pending/review summary and existing capability-bound actions |
| `src/features/mobile/MobileTracking.tsx` | Clear phase/lease display and always-accessible active Stop |
| `src/features/mobile/mobile.css` | Scoped theme, vertical rows, persistent labelled navigation, safe areas and responsive layout |
| New `src/features/mobile/mobileDriverPresentation.ts` | Presentation types and pure status/page grouping helpers; no IO or authority |
| New `src/features/mobile/testing/DriverUiFixture.tsx` and `scripts/fixtures/mobile-driver.html` | Real components with an entirely fictional typed client and visible test controls; not imported by production entry points |
| New `scripts/mobile-driver-presentation-qa.mjs` | Meaningful transition/page presentation unit cases |
| New `scripts/mobile-driver-artifact-audit.mjs` | Bounded APK/config/fixture-marker privacy checks tied to build receipts |

## Task 1: Assignment navigation and isolated real-component fixture

**Files:** Modify `MobileDriverShell.tsx`, `MobileShipment.tsx`; create the two fixture files above. Use this plan's own `.superpowers/sdd/2026-10-30-mobile-driver-usability/` ledger/evidence area at execution time.

**Interfaces:** Keep `MobileDriverShell({client: MobileClient})`. Use a local view union `'assignments' | 'delivery' | 'queue'`; `openDelivery(id: string): Promise<void>` and `backToAssignments(): void` operate only on presentation/reads. Add `onBack: () => void` to the existing `MobileShipment` props. The fixture exports `createDriverUiFixture(): {client: MobileClient}` and exposes labelled controls/call history in its own test panel.

- [ ] **1. Establish isolation and baseline.** Apply using-git-worktrees at execution time. Reuse a suitable managed worktree or create one, then overlay an explicit hash-manifested source-only snapshot of the current application, including its required uncommitted/untracked code. HEAD alone is insufficient: recent Driver/Spark files are not all committed. Exclude private/output/native-build/data trees. Keep dependencies separate or deliberately reuse only the existing dependency installation without modifying it. Record original HEAD/index, source pins and protected roots. Do not reset/stash the live checkout.
- [ ] **2. Prepare a safe fixture.** Its entry imports `MobileDriverShell` and `mobile.css`, never `MobileBootstrap`, `mobilePlatform` or Firebase. Provide two different deliveries, cached/fresh/null pages, recovery-only access and manually resolvable slow replies. Visible fixture controls change these states and show client call counts. Block non-loopback requests in browser testing. In the isolated root only, use blank example web configuration/empty allowlists where a full static build needs local JSON; never copy live keys.
- [ ] **3. Observe RED through CUA.** Serve the fixture with the existing Vite config, strict loopback port 5173. Assert that opening a delivery removes the assignment list from the active view and provides an explicit Back action. Existing split-pane presentation must fail that expectation. Record the failure, not just the new fixture loading.
- [ ] **4. Implement navigation.** Render one view at a time with vertical assignment rows; preserve refresh/cursor, cached timestamp and empty/loading states. Keep persistent Deliveries/Saved queue labels and counts. Focus the destination heading on explicit view changes; return focus to the selected assignment on Back where it is still present. Do not move focus on five-second polling refreshes.
- [ ] **5. Verify GREEN and races.** Through visible fixture controls, select A then B, resolve A late and require B to remain selected. Switch Driver → Recovery only → different account; no old details/drafts or fresh Driver controls may survive. No enqueue/start/stop call is allowed from navigation. Preserve the existing stale-reply/UID client guards.

**Deliverable:** Real-component list/detail/queue navigation with recorded passing fixture evidence and the live application sources untouched.

## Task 2: Session drafts, status/proof clarity and tracking controls

**Files:** Modify `MobileDriverShell.tsx`, `MobileShipment.tsx`, `MobileTracking.tsx`; create `mobileDriverPresentation.ts` and its Node QA file.

**Interfaces:** Export `ShipmentFormDraft = {selection: string; notes: string; proofId: string; selectedFile: DriverDraft | null}` and `nextDriverStatuses(detail: DriverDetail): readonly string[]`. Add controlled `draft` and `onDraftChange(next: ShipmentFormDraft): void` props to `MobileShipment`, preserving its existing client-action callback signatures. The workspace retains drafts by shipment ID in memory only and is remounted/cleared on account/access identity changes.

- [ ] **1. Observe RED.** Enter different notes for A/B, navigate list → details → queue → details, and assert each retains its own unsent text/file choice. Resolve a file-picker response after changing selection; it must not bind to the new delivery. Record the failing unmount/late-response case before implementing draft ownership.
- [ ] **2. Add unit cases and watch RED.** In `mobile-driver-presentation-qa.mjs`, assert Dispatched permits only In Transit; effective queued In Transit permits the existing next states; Delivered/Returned permit none. Run `node --experimental-strip-types --test scripts/mobile-driver-presentation-qa.mjs`; expect the new helper import/cases to fail before implementation.
- [ ] **3. Implement minimal presentation changes.** Lift form drafts into the account-bound workspace and guard file/detail callbacks with selection/lifetime identity. Keep existing 3–500-character notes, valid proof references, 10 MiB file contract and authoritative client validation. Show field-adjacent errors/help; never clear a saved native draft by cosmetic navigation. Revalidate a selected proof/status against refreshed context before offering a new action.
- [ ] **4. Preserve truthful outcomes.** Render `detail.shipment.status` as confirmed; render `queuedStatus` separately with pending wording. Keep registered/pending proof distinctions. Label network state separately from the existing verification time. Do not add a new reachability poll or claim that network availability means MSI accepted an operation.
- [ ] **5. Verify GREEN.** Test missing notes, missing proof for Delivered, pending proof, queued status and resolved server status. Each click invokes at most the existing client operation once; queued does not update confirmed status. Unit command above must pass.
- [ ] **6. Verify tracking.** Preserve Starting/Tracking/Expired/Needs review/Stopped explanations. Start only after explicit user action. While Starting/Tracking, Stop remains outside any collapsed optional detail and stays reachable on a short screen. A fixture Start/Stop pair invokes the matching methods once; navigation/polling invokes neither. No physical sensor test is claimed.

**Deliverable:** Preserved per-delivery draft context and clear next actions without new delivery/upload/tracking rules.

## Task 3: Honest queue grouping, capability controls and recovery

**Files:** Modify `MobileQueue.tsx`, `MobileDriverShell.tsx`; extend `mobileDriverPresentation.ts`, the Node QA file and typed fixture scenarios.

**Interfaces:** Export `groupDriverQueuePage(items: readonly DriverQueueItem[]): {needsReview: DriverQueueItem[]; remaining: DriverQueueItem[]}`. Group only state `Needs review` into the first group; retain all other supported states and original order/IDs in the second. `DriverQueue.pending`, `needsReview`, `cursor` and drafts retain their existing meaning.

- [ ] **1. Observe RED.** Provide a mixed current page where a Needs review item follows ordinary rows. Require the attention group first, but preserve original order within each group. Include a non-null cursor with more items outside the page. Add failing helper assertions before implementation.
- [ ] **2. Implement presentation.** Show the supplied pending/review counts separately from current-page groups. Retain loading/empty states, saved unqueued files, original reason explanations and existing confirmation before discard. Do not invent a global total from `items.length`.
- [ ] **3. Verify exact capabilities.** For each row, expose only `canCheck`, `canRetry`, `canDiscard` actions. Clicking check/retry uses the original operation ID and original checkOnly flag. It must not enqueue a replacement or fabricate Synced. Offline state does not independently override authoritative capabilities.
- [ ] **4. Verify page/role/error cases.** Check cursor paging, empty current page with continuation, null response, unknown reason text rendered safely, Awaiting confirmation, changed assignment and Recovery only. Account switch removes the prior user's visible queue/drafts. Recovery-only supports its original saved outcomes and offers no assignment/tracking creation.
- [ ] **5. Verify GREEN.** Run the presentation unit command and the corresponding CUA fixture cases, recording before/after call history and rendered states.

**Deliverable:** Actionable page-local queue groups with unchanged retry/recovery authority.

## Task 4: Mobile layout, focus and accessibility verification

**Files:** Modify `mobile.css` and the four presentation components only as needed for semantic labels/layout. Extend fixture content and collect screenshots/DOM/geometry under ignored outputs.

**Interfaces:** CSS stays scoped to `.mobile-driver`; there are no new public interfaces. Persistent navigation reserves its own content space. Controls retain their accessible names, active-page/step state and explicit text status.

- [ ] **1. Observe RED where applicable.** Capture current 320px and short-height fixture layouts, long unbroken references/addresses, keyboard focus and active tracking. Record the specific failures: horizontally hidden assignments, obscured action/focus, undersized primary controls or hidden Stop. Do not invent a failing case if the existing property already passes.
- [ ] **2. Apply approved tokens/layout.** Use the spec's exact palette, local typography, vertical rows and approximately 16px primary text. Primary controls target at least 48 CSS px with 8px spacing. Add safe-area padding on all relevant edges and avoid fixed overlays covering form/error content. Preserve reduced-motion handling.
- [ ] **3. Verify all three screens at 320/390/768px, plus 390×600.** Require document scroll width no greater than viewport width; long labels wrap without cutting action text. Ensure vertical scrolling reaches every field/action. Keep table/gesture/native unit claims separate from these web measurements.
- [ ] **4. Verify interaction accessibility.** Use keyboard navigation to open/back, select status/proof, queue action and dismiss existing confirmations. Check visible focus, appropriate heading focus, no polling focus theft, no navigation-created sensor/action calls and live feedback without repeatedly announcing unchanged state. Check text contrast against actual backgrounds; screenshots are not formal accessibility certification.
- [ ] **5. Record evidence and restore the browser.** Save labelled screenshots and observed geometry/results; reset temporary viewport overrides and leave no pending real workflow or browser permission prompt.

**Deliverable:** Reviewed real-component mobile layouts and interaction evidence matching the approved visual direction.

## Task 5: Regression checks, test APKs, final review and handover

**Files:** Create `mobile-driver-artifact-audit.mjs`; update applicable existing `mobile-ui-qa.mjs` selectors/expectations for the new view structure; document observed results in `docs/MOBILE_DRIVER_USABILITY_ACCEPTANCE_2026-10-30.md` and amend the appropriate current roadmap/handover section without rewriting original portfolios.

**Interfaces:** `mobile-driver-artifact-audit.mjs --receipt <build-receipt> --output <fresh-ignored-directory>` validates the receipt's APK hash/source pins and bounded ZIP entries/assets using available standard-library tooling. It emits a private result, never credential contents. The test harness is not reachable from production mobile entry points and its marker must be absent from built app assets/APKs.

- [ ] **1. Run applicable pure regressions.** `node --test scripts/mobile-platform-client-qa.mjs scripts/mobile-contract-qa.mjs scripts/mobile-environment-qa.mjs scripts/mobile-source-binding-qa.mjs scripts/hybrid-mobile-qa.mjs scripts/spark-mobile-qa.mjs`, plus the new presentation unit command. Expected: no failures. Use CUA for browser interaction checks; do not claim a legacy headless UI runner passed unless it was actually run through an authorised workflow.
- [ ] **2. Build/lint the isolated source.** Run `npm.cmd run build`, `npm.cmd run build:mobile`, `npm.cmd run lint`, `npm.cmd run security:scan` and `npm.cmd run security:history`. Record exact outputs; distinguish existing warnings from new failures. Never use live private config to make the isolated static build pass.
- [ ] **3. Build bounded Android test artefacts when RAM admission passes.** Run `node scripts/hybrid-mobile-build.mjs --flavour local --action test`, then `--flavour cloud-demo --action test --fixture`; build with `--flavour local --action assemble` and `--flavour cloud-demo --action assemble --fixture`. Preserve current source/config checks, offline Gradle and resource limits. Keep local debug and non-connectable cloud fixture outputs clearly labelled; do not prepare a live Spark credential-bound package or install to the user's phone here.
- [ ] **4. Audit artefacts.** Verify hash/source receipt, expected mode/configuration and absence of live API keys, service-account material, datasets/models, SQLite/user files and test-harness marker/entry. Inspect bounded relevant assets without dumping secrets. Debug certificate/public signing metadata is not a private key. No APK is published or copied into Git.
- [ ] **5. One Native final review.** Use requesting-code-review for one fresh whole-change reviewer after implementation. Fix Important findings once with failing-then-passing affected checks, record Minor/deferred items, and rerun only affected gates. Reverify the original live checkout's source pins, HEAD/index, protected roots and runtime files. No cloud writes or service restart is necessary for presentation acceptance.
- [ ] **6. Handover the concrete result.** Record source diff location, source/artefact hashes, passing/failed checks, read-only runtime preservation and screenshots. Keep the isolated working source/ledger and original live application separate. State that connectable APK/profile activation, live cutover/publication and physical Android tests remain subsequent actions. No silent copying of changed UI files into the active source-bound demo.

**Deliverable:** Verified isolated implementation and locally audited test artefacts, ready for review, with the running demonstration intact.

## Self-review and execution handoff

Reviewed 30 October 2026 against the approved design: navigation/paging and session isolation → Task 1; per-shipment draft/proof/status/tracking → Task 2; queue flags/counts/recovery → Task 3; tokens, safe areas, focus and layouts → Task 4; source preservation, builds/privacy/review/handover → Task 5. All five Review Focus conditions have named fixture/unit checks. New types/signatures are defined in their owning task; no backend/native/public API change is hidden in the presentation work.

Native remains selected. Plan review authorises these five local implementation/verification tasks, not cloud data writes, source-bound live cutover, deployment, billing, phone installation, sensors or Git publication. Product implementation starts after the human confirms this plan captures the approved design.
