# Demo stock risk alerts and reorder review

24 October 2026. Local implementation of the approved [design](superpowers/specs/2026-10-23-inventory-demo-reorder-design.md) and [Native plan](superpowers/plans/2026-10-23-inventory-demo-reorder.md). All six approved Native tasks have working implementation and terminal verification evidence, including the single final review and its two Important fixes. The broader stock goal remains active.

## Staff workflow

In **Stock Management → Stock AI experiment**, select an active demonstration product. IILAS captures its on-hand, reserved and reorder quantities; enter the remaining eight fictional history, demand and supply facts. When the local demo workflow is enabled, a new retained Reorder Risk or Critical Stock Risk result atomically creates a **Demo risk alert** and Pending requirement. Normal, Unavailable, manual scenarios and old/replayed experiments create no new items. Separate experiments intentionally create separate items.

Open **Replenishment & Procurement → Demo AI reorder review**. Its separate 20-row pages retain unsupported records as unavailable. View an item to inspect its original product version, all eleven facts including both deadlines, uncalibrated scores and source/model lineage. An approved Admin or Manager other than the experiment author may explicitly Accept or Reject with 10–500 characters of notes. Accept requires the product to match the frozen source; Reject can close a stale valid requirement. Terminal decisions are immutable and include an attributable event.

Acceptance means accepted for demo replenishment review only. It does not order stock, select a supplier/quantity, change balances or approve the model. Existing operational threshold review, purchase orders, warehouse reservations and dashboard alerts remain separate. Experimental provenance remains false/null for operational and independent-model approval.

## Lost replies and access

A review envelope is saved before sending in the current account/scope session-storage key, separate from all three inference keys. After a lost reply or reload, use **Retry saved demo review** or **Check demo review outcome**. A completed operation returns the same event; an unknown outcome is durably cancelled so a delayed send cannot apply. Recovery works with workflow capability disabled and the model unavailable, subject to current authority. Malformed saved intent is preserved for reconciliation. Do not clear it to force another review.

Only schema4 with context protocol, demonstration-products data mode and demo-risk-review workflow mode enables both backend flags. Older profiles and non-backend processes explicitly disable inherited reorder capability. Availability reports configuration, not model health or accuracy.

## Model interpretation and remaining core work

This workflow uses the unchanged frozen fourteen-input Random Forest. Its previous synthetic study scored 81.53% accuracy (587/720), macro-F1 0.8080, Critical precision 79% and recall 87.78% across 60 held-out families. The accuracy interval is 78.54–84.86%. These figures measure agreement with an AI-authored simulation policy, not independently established warehouse accuracy; scores are uncalibrated. No training or consumed scientific TEST replay is included.

FR-12/FR-13/FR-21 are addressed for the demonstration workflow only, with the verification recorded below. FR-27 requirement-to-purchase-order/expected-incoming traceability and qualified genuine history/independent intended-use evaluation remain core work. Camera trials and other AI models remain deferred. See the [previous demo-product guide](INVENTORY_DEMO_PRODUCT_AI_LOCAL_GUIDE_2026-10-23.md) and [readiness audit](INVENTORY_DATA_READINESS_AUDIT_2026-10-23.md).

## Verification and restart checkpoint

The new actual emulator suite passes 9 checks and actual browser suite passes 3, with exact fixture cleanup. All 157 focused JavaScript and 59 affected Python checks pass. The new browser prediction exactly matches its raw worker output. One fictional software request measured 17.46 ms model computation, 5.504 s stock service and 220.43 MiB sampled peak worker RAM, with confirmed cleanup. This is software evidence, not a new accuracy study or latency distribution. All fourteen emulator suites pass: ten original plus demo reorder, demo product, context and legacy; all temporary fixture records are exactly cleaned. The final UI suite covers20 cases plus29 original stock cases. One fresh review found no Critical issues; both Important findings were reproduced/fixed and one Minor is explicitly deferred.

Current private profile (never display its contents): outputs/inventory-ai-20261023/profile-1c1ef848-a692-4f28-b0cd-1a54c805c946/private.json. Stock manifest05 SHA256:41a6215c9e0920ac053af2d2aaa1289d34569157d722205da99d7b9bc62aa950. Parcel metadata SHA256:170f50550f8c5cd2bde0cacc2af98e92ff2ccd39650c94238ce082f3f80cc713; its path is in the ignored parcel-binding.json receipt. The unchanged model remains on 8001; parcel on 8000; Vite on 5173.

Fresh checkpoint: outputs/inventory-demo-reorder-20261023/emulator-checkpoint-03. Eleven official export files were hash-verified after the known Windows final-rename failure. Import preserved 1,665 documents, 116 accounts and two objects; only normal Auth tokensValidAfterTime import changes were permitted. Export then-current state before any future restart; never overwrite newer state with this checkpoint.

Use separate app PowerShell terminals, dot-source ../Enter-IILAS.ps1, then run the role launcher:

```powershell
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role StockResearch
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role ParcelResearch
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role Backend --import <verified-current-checkpoint>
```

Run only one emulator stack. Use literal http://127.0.0.1:5173 or http://localhost:5173. Reidentify owned processes before stopping services. Limits remain one native worker/two threads, 15s execution/3s drain, 2GiB sampled RSS, 3GiB free startup RAM and 1GiB free disk. Browser/backend recovery bounds remain unchanged. Evidence is private under outputs/inventory-demo-reorder-20261023; retain the ignored Native ledger because this work is not committed or published. Datasets, weights, private profiles, outcomes, emulator exports and test data remain out of GitHub.

## Final review fixes and deferred issue

The single fresh independent review found no Critical issues and two Important issues. Both were reproduced and fixed with RED→GREEN checks: a late reply from an unmounted same-account client now preserves saved review intent, including account-away-and-back; finalisation rechecks capability/source configuration after transaction reads on every retry, immediately before writes. Terminal replay still precedes current configuration. The expanded browser fixture passes 20 cases; the affected command suites pass 59.

Deferred Minor: a closed-shape retained decision event is checked against its selected requirement ID but not every field in the terminal review summary. Contradictory corrupt retained history could therefore be displayed. Trusted commands atomically create matching event/summary records and ordinary clients cannot write them. Stronger reconciliation presentation remains a follow-up; this does not change stock or promote the model.

Final software verification:157 focused JS checks,59 affected Python checks,49 fixture-browser scenarios,actual reorder emulator9/browser3,demo-product emulator10/browser7,context7 andlegacy6. Original ten-suite preservation run stock-reorder-02 is terminal GREEN. After the final lint adaptation, manifest05 differs from04 only for the queue and request client; all actual affected suites and a fresh smoke/parcel-local preservation run pass again. Build passes with its existing bundle warning; lint has zero errors/six existing image warnings. All33 protected/five private hashes remain unchanged; secret scans cover429 tracked files/516 history blobs/563 expanded files. Current restart sessions:backend25275,stock56695,parcel5725,Vite1200. Listener observations:backend22172,Firestore5252,stock13508,parcel17664,Vite19088; reidentify before stopping.

Following an overnight service interruption, checkpoint02 was the newest recoverable export; its source/file identities were reverified and restored before unfinished tests resumed. There was no surviving stack or newer export. Preservation of any unexported intervening edits cannot be claimed. Current checkpoint03 was subsequently exported from the restored, verified then-current state.

## Execution decisions and their limits

- Ruling: Keep the approved existing checkout with a fresh scoped baseline; no stage/commit/push/deploy. Preserve ignored ledger/evidence because no new Git commit records them. Cost if wrong: unrelated dirty work could be conflated; final review is scoped against this baseline.

- Ruling: Private/public demo lineage stays experimental after manager Accept. No operational write or independent label is produced. Cost if wrong: workflow review could be misread as model qualification; closed false/null provenance is verified throughout.

- Task 3: Ruling: New public rules grant only existing fixed-scope reads; all writes and private receipt access are denied. Client create/update validator grant patterns are inapplicable. Emulator execution waits for Task6 fresh source bindings; syntax is checked now. Cost if wrong: actual integration defects are found at cutover; the full task is not claimed before those checks.

- Task 4: Ruling: The fixture initially asserted an experiment ID in innerText while its lineage details were collapsed. Expand the actual user-facing lineage section before asserting that identity; keep IDs out of the main flow. Cost if wrong: a test could pass against hidden metadata rather than the visible selection; the explicit expanded identity now verifies it.

- Task 4: Ruling: Edge/Playwright isDisabled returned false for an option whose native disabled property and disabled attribute were true. Assert the native option.disabled property instead; no application gate was weakened. Cost if wrong: UI automation could misdescribe native option state; backend stale-Accept tests independently enforce the decision boundary.

- Task 4: Ruling: Extend the two existing actual demo-product fixture cleanup allowlists to reciprocal demo alert/requirement records only when fixed scope and original fixture experiment actor match. New valid risk outcomes otherwise leave expected fixture records behind. Cost if wrong: cleanup could remove unrelated data; exact before/after hashes and actor/scope gates remain mandatory.

- Task 4: Ruling: The first gate accepted eslint exit0 despite six new unused imports in the prepared browser proof. That completion did not meet the no-new-warning contract. Removed the unused copied imports and tightened the gate to max-warnings6; the repeated full Task4 gate below is authoritative. Cost if wrong: a future warning could be overlooked against the known baseline; final paths/counts are inspected.

- Task 6: Ruling: Parcel metadata creation requires a nonexistent version directory; the first orchestration precreated it and failed safely before writing a manifest. Keep that empty directory and retry with a fresh UUID without mkdir. No runtime code change or overwrite. Cost if wrong: a path mistake could invalidate configuration; exact metadata checks remain required.

- Task 6: Ruling: The commit-range review helper rejects the approved no-commit empty range. Use the captured 545-file pre-edit hashes and explicit 23 changed/18 added file package for one fresh final review; earlier dirty work is context only. Cost if wrong: unrelated earlier changes are not newly certified. Review runs after implementation/actual proof while remaining preservation suites finish; Task6 completion waits for both review and all terminal gates.

- Final: Ruling: Parent, not the read-only reviewer, certifies test counts, state preservation, remaining regressions and documentation/scans from terminal evidence. Completion waits for every gate. Cost if wrong: a code review could be mistaken for runtime proof.

- Final: Ruling: Earlier dirty changes remain outside the captured545-file continuation scope. Cost if wrong: unrelated pre-existing defects are not newly certified.

- Final: Ruling: Keep production/private-value/remote-host readiness outside this local verification; no deployment or publication. Cost if wrong: local success could be mistaken for deployed readiness.

- Final: Ruling: Keep independent intended-use model quality and genuine-history qualification incomplete, with frozen science/consumed TEST unchanged. Cost if wrong: synthetic agreement could be mistaken for warehouse accuracy.

- Final: Ruling: FR-27 requirement→PO→expected incoming is later core work; demo Accept does not approve or create operational orders. Cost if wrong: the broader stock objective would be falsely marked complete.

- Task 6: Ruling: Review fixes changed pinned backend/UI sources, so use new stockmanifest04, an exclusive profile and fresh checkpoint02. Shared parcel-pinned sources did not change; retain its unchanged manifest/service and Vite, restart only owned backend/stock. Rerun all actual workflow/recovery suites and original ten regressions against reviewed bindings. Cost if wrong: an unrelated service could be disturbed or stale metadata trusted; exact source/health/state gates remain required.

- Task 6: Ruling: The local services stopped during the overnight interruption, so a new export cannot be taken from their vanished in-memory state. The newest checkpoint02 and last completed fixture receipts prove the original baseline; restore it, verify every document/account/object, and do not claim preservation of unexported intervening edits. Cost if wrong: any unexported intervening user changes would be unavailable; no newer recoverable export or surviving stack was found.

- Task 6: Ruling: Final lint adaptation changes only the queue/request-client lifetime implementation; backend, rules, model and native bodies are unchanged since the complete stock-reorder-02 ten-suite run. Bind sources in manifest05/profile/checkpoint03; rerun actual reorder/browser and all demo/context/legacy suites plus smoke/parcel-local transport preservation. Retain all ten-suite results rather than rerunning unrelated operational scenarios again. Cost if wrong: an indirect cross-module UI effect could escape those old scenarios; full157 unit,49 fixture-browser and actual Procurement browser coverage remain required.
