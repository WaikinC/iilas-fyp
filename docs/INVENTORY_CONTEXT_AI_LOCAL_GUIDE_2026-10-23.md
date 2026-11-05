# Context-aware stock AI: local guide

Current local profile and product-bound workflow are now documented in the [demo-product guide](INVENTORY_DEMO_PRODUCT_AI_LOCAL_GUIDE_2026-10-23.md). The profile/checkpoint below are historical and their old source bindings are intentionally no longer current.

23 October 2026. The approved local integration is implemented and verified. The frozen RF14 service is running locally, existing records were preserved, and the independent review found no blocking code issues. Genuine inventory qualification and independent intended-use validation remain incomplete.

## Use the experiment

Open http://127.0.0.1:5173 and choose **Stock Management → Stock AI experiment**. Admin, Manager, Inventory and Warehouse can submit complete fictional scenarios; approved staff can read shared experimental history. Real products continue to use rule-based stock assessment and explicit unavailable AI readiness.

Enter on-hand units, reserved units, reorder level, complete 30-day movement/adjustment counts and days since replenishment. Then enter additional firm demand and its due date, plus one incoming batch's quantity, ETA and supply status. Eleven facts produce fourteen model features. Additional demand excludes reservations already deducted. Days can be fractional; zero means due now. Explicit zero demand removes its deadline. Explicit **No incoming batch** records zero units and no ETA. Blank means unknown and blocks analysis.

Results show Normal, Reorder Risk and Critical Stock Risk model scores, retained facts, model/source hashes, timing and developmental range warnings. Scores are uncalibrated. No stock adjustment or purchase action follows. A value inside each development range does not prove the whole scenario is representative.

In the MSI development interface, start with the saved label and the suggested staff check. Open **How to read the model scores** to compare the three class scores. A percentage shows model support for that label in this scenario. For an ordinary product, the **stock assessment** instead checks whether on-hand units minus reserved units are at or below the reorder level. Read the saved facts and range warnings before making a purchase decision.

## Evidence and limitations

The frozen Random Forest uses 100 trees, maximum depth 12, minimum leaf size 2, balanced class weights and two threads. A consumed, one-time synthetic evaluation scored **81.53% accuracy (587/720)**, **0.8080 macro-F1**, **79.00% Critical precision** and **87.78% Critical recall (316/360)** across 60 held-out simulated families. Accuracy's family-bootstrap interval is **78.54–84.86%**. Nine Critical cases were called Normal, 35 Reorder; 45/150 Normal cases were flagged at risk.

These measure agreement with AI-assisted teaching labels. They do not establish warehouse accuracy, independent human validation or a guaranteed 80% minimum. Actual inventory history and trustworthy commitment/supply inputs remain unqualified. Independent intended-use labels and evaluation remain required before operational use. No new fitting or scientific test-set replay is part of this integration.

Historical six-input records retain their original facts and original 75% accuracy/45% Critical recall disclosure. Those figures came from a different cohort and must not be presented as a direct before/after comparison with 81.53%. Unsupported records remain visible with an unavailable-format warning and ID.

## Recover an uncertain response

The exact request is saved per account/scope in session storage. After a lost response, reopen the screen and choose **Retry saved experiment** or **Check saved experiment outcome**. The browser releases its busy state after a 35-second observation deadline; that does not cancel server work or automatically submit again. Late replies cannot erase a newer saved request.

A pending old six-input request offers **Check previous experiment outcome** and blocks new submissions until resolved. Its original facts are never converted into context inputs. The public old-start endpoint only recovers an already claimed operation; it cannot start fresh six-input inference. Unknown requests receive durable cancellation, expired work becomes Unavailable, and terminal results are recovered unchanged. Preserve malformed/unknown saved requests for administrator reconciliation instead of deleting them.

## MSI runtime and restart

Dot-source `../Enter-IILAS.ps1`. Use Node 22, JDK 21 and `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe`. No dependencies were added. Stock serves literal 127.0.0.1:8001; parcel stays at 8000. Firebase uses Auth9099, Firestore8081, Functions5001 and Storage9199. Only literal localhost/127.0.0.1 browser access selects these endpoints.

Current private profile: `outputs/inventory-ai-20261023/profile-13dfc0a0-35ac-4034-aae0-0855f0490537/private.json`. Never display its contents or commit it. Its schema2 binds stock protocol `inventory-context-inference-2.0` and selects `serve_inventory_context_local_eval.py`. Schema/protocol/source mismatches fail closed, with no fallback model.

Stock metadata: `research/datasets/inventory-context-serving-v2/manifests/manifest-01.json`, SHA256 `c18ef0939f86a4a9e4b667df53614f3c7af99dbc4993d4894e9e54ddf67843c5`. Parcel metadata: `outputs/inventory-ai-20261023/context-parcel-01/manifest.json`, SHA256 `b1181193fbc14f96bff2af22e9681ddd0e63fbca3c301f72e5f564dd3d5c6366`. The parcel model/descriptor/warm bundle remain unchanged; the shared router requires this fresh metadata binding.

```powershell
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role StockResearch
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role ParcelResearch
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role Backend --import <verified-current-checkpoint>
```

Before any future restart, export and verify the then-current emulator state. The current recovery checkpoint is `outputs/inventory-context-integration-20261023/emulator-checkpoint-01`: 11 official export files copied and hash-verified after the known Windows export-finalisation failure. Restart preserved 1,665 documents, 116 accounts and two Storage objects. The sole permitted import difference was Auth token-validity timestamp; all other compared account fields, IDs, document hashes and object metadata matched. Never restore the historical private snapshot over current work. Retain old immutable profiles/manifests; source changes intentionally invalidate old serving bindings.

A stock request runs in one supervised native Windows Job with a 15-second execution deadline, two threads, 2 GiB sampled process-tree RSS, 3 GiB free startup RAM and 1 GiB free disk. Confirmed cleanup has a separate three-second drain budget. Ambiguous termination quarantines the executor; verify owned workers have stopped before restarting. HTTP/backend/browser/receipt bounds are 20/25/35/45 seconds. Metadata preparation has a separate 120-second budget. Each request permits 10 MiB of evidence, total serving output 100 MiB. Preparation audits frozen development evidence; runtime verifies compact source/artifact identities, and only the supervised worker loads hash-verified trusted model bytes.

Prediction computation, total service time and browser-to-backend response time are different measurements. Functional fixture timings are not a new accuracy evaluation or latency distribution.

All datasets, model weights, scenarios, private settings, emulator exports and generated evidence stay ignored. No production changes, camera trials, Git publication or other-model development are included.

## Verified integration evidence

Actual frozen RF14/Firebase command checks: 7 passed. Actual browser→Firebase→RF14 checks: 7 passed, including lost successful acknowledgement, reload/exact-operation recovery, matching native worker scores/hash lineage and old-request resolution. Legacy-only recovery: 6 passed. All fixtures were removed after exact state comparison. The original 10 sequential Firebase suites also passed (smoke,QA,shared,stockretry,accounts,procurement,locations,stockassessment,parcelphoto,parcellocal), with unchanged 1,665-document/116-account/two-object baseline after each suite. This is functional integration evidence, not a new accuracy study.

The actual browser scenario measured 17.56 ms model computation and 4.132 seconds total stock service time, with 223.47 MiB sampled worker peak RSS and confirmed cleanup. Lost-reply/recovery was deliberately exercised, so a direct end-to-end browser latency distribution was not measured. The underlying model and scientific evaluation are unchanged.

Current focused evidence: 77 JavaScript checks,59 affected Python cases,19 fixture-browser scenarios plus a section-layout regression; build passes, lint zero errors/six existing image warnings and existing bundle-size warning. The first affected native run caught an overly strict bitwise comparison between independent two-thread RF predictions. That software parity assertion now requires 1e-12 absolute/zero relative tolerance and exact predicted class. Retained worker-to-Firebase scores are still compared exactly. No resource limit, model or scientific result was changed.

A fresh independent reviewer found no Critical/Important issues. Deferred P3: the preview line omits demand deadline/incoming ETA; the form and saved history retain both and absence validation is enforced. Full isolated research collection: 60 modules, 1036 top-level test executions, 14 existing optional skips, zero failed modules. Final secret/file/link checks and preservation audits passed; the ignored final-verification.json records terminal totals.

Evidence root: `outputs/inventory-context-integration-20261023/`; original-regression preservation receipts: `outputs/inventory-ai-20261023/harness-runs/stock-context-01/`. Actual browser evidence: `outputs/inventory-ai-20261023/context-browser-b077e981-f5b3-463f-b182-d15d6966bda2/`. All are ignored local outputs. Source/artifact preservation audit confirms 22 protected hashes and three prior-private-file hashes unchanged, five representative sensitive paths ignored,generated backend helper identical and 183 documentation links resolving.

## Implementation decisions and review boundaries

- Kept the approved existing checkout and captured its pre-task file/artifact hashes; no new worktree or commit. Risk of mixing earlier work is controlled by the scoped baseline review.
- Reused only the original canonical JSON utility, never the original six-input feature protocol or data conversion. Wrong reuse would corrupt schema/digest compatibility; cross-language tests cover it.
- Derived runtime range warnings from the frozen final RF14 development-job matrix bound by its completion hash, avoiding a full 52-fit audit per request. Incorrect derivation would misstate warnings; source/job hashes and software parity protect the boundary.
- Kept existing configuration/fetcher/clock injection and authoritative approved transactions; removed the plan's stale optional run override. Tests intercept the Admin SDK boundary rather than adding a production transaction bypass.
- The review-package helper cannot use an empty commit range under the no-commit plan. The fresh reviewer used the 515-file baseline and explicit 20 changed/15 added inventory. Unrelated dirty changes were excluded; their broader quality is not certified.
- Independent warehouse accuracy, real-history qualification, operational deployment and other AI/camera work remain outside this integration. Overreading synthetic 81.53% is the main risk; explicit experimental/false-approval disclosures remain.
- The reviewer deliberately did not inspect private configuration values or raw scientific TEST observations. Code boundaries, artifact hashes and actual local transport were checked; no secret-content or new scientific evaluation certification is claimed.
- The reviewer saw full-suite/documentation checks still running. Parent completion requires terminal results, not inference from the review verdict.
- Keep the branch and ignored Native ledger/evidence in place because the approved plan excludes commits/publication; deleting the ledger would discard evidence not preserved in Git history. No merge/push-choice question is needed under that existing instruction.

Deferred minor: include demand deadline and incoming ETA in the factual preview summary. Both are already required/validated in the form and preserved in history.
