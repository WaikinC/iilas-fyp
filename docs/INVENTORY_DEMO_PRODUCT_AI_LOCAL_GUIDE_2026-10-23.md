# Demo-product Stock AI: local guide

23 October 2026. The approved product-bound workflow is implemented locally. Actual emulator/model checks (10) and browser/Firebase/model checks (7) pass with exact fixture cleanup. All required sequential Firebase regressions and the fresh independent review passed with no Critical or Important findings. Genuine history qualification and independently labelled intended-use evaluation remain incomplete.

## Use in IILAS

Open http://127.0.0.1:5173 and choose **Stock Management → Stock AI experiment**. The default **Fully fictional scenario** still accepts all eleven facts. To use an existing demonstration product, choose **Scenario source → Selected demo product**, then **Demo inventory product**. The backend reads on-hand quantity, reserved quantity and reorder level from the selected active scoped record. Those three fields are read-only. No extra product scan or inventory merge is performed.

Enter eight fictional context facts: complete 30-day movement count, adjustment count, days since replenishment, additional firm quantity and deadline, incoming quantity and ETA, and supply status. The form starts blank and never infers history from sparse movements. Confirm **I am using demonstration records with fictional context**, then choose **Analyse simulated scenario**. Additional demand excludes existing reservations. Zero demand has no deadline; No incoming batch has zero units and no ETA. Fractional days are supported; zero means due now. Blank is unknown, not zero.

Switching source/product clears prior facts and acknowledgement. A delayed preview cannot fill another product or account. If the selected product changes during analysis, the original experiment is retained as **Unavailable/product_changed** with no prediction. To refresh, choose the placeholder or another product, then reselect the intended product and re-enter fictional context. Explicitly submit a new request if desired. A direct refresh action/clearer in-app instruction is a deferred minor issue. The original source facts remain in history even if the product is later deleted.

## What the result means

The unchanged frozen RF14 produces fourteen numeric features and scores Normal, Reorder Risk and Critical Stock Risk. IDs, names, SKU and version are lineage only and never model predictors. Version3 history retains the compact product snapshot, observation time and verified SHA256 digest, fictional context, exact model lineage and experimental status. Older v1/v2 history remains unchanged; unsupported or invalid-digest data remains retained and visibly unavailable.

The consumed synthetic study scored **81.53% accuracy (587/720)**, macro-F1 **0.8080**, Critical precision **79.00%** and recall **87.78% (316/360)** across 60 held-out simulated families. Accuracy interval **78.54–84.86%**. Nine Critical cases were called Normal; 45/150 Normal cases generated risk alerts. These are synthetic-policy agreement with AI-assisted labels, not independently established warehouse accuracy or an 80% guarantee. Historical six-input results retain their own 75% accuracy/45% Critical recall disclosure from a different cohort.

Scores are uncalibrated. Real inventory history remains unqualified; independent intended-use labels/evaluation and an accepted operational-alert/replenishment handoff remain incomplete. No stock, reservation, purchasing, generic prediction or operational alert is changed. Admin/Manager/Inventory/Warehouse may submit; approved staff may read history. Private receipts deny all client access.

## Recovery

Saved browser requests remain separate for legacy, manual context and demo-product modes. Recovery order is legacy → context → demo-product. Do not convert or delete saved input. A 35-second browser observation deadline releases the busy state without cancelling server work or automatically resending. Use the source-specific Retry/Check outcome controls. Matching recovery uses the original input and current role/scope authority, without needing current model configuration, demo capability or a current product. Unknown resolution creates a durable cancellation; expired running work becomes Unavailable. Malformed saved input is preserved for administrator reconciliation.

## Current local runtime

Dot-source `../Enter-IILAS.ps1`; use Node22, JDK21 and `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe`. There are no new dependencies or training runs. One loopback stack: Vite5173, stock8001, parcel8000, Firebase Auth9099/Firestore8081/Functions5001/Storage9199. Use literal localhost/127.0.0.1 for browser testing.

Private profile: `outputs/inventory-ai-20261023/profile-765ff33f-4046-4129-9b06-8e51a1110092/private.json`. Never display its contents or upload it. Schema3 explicitly enables demonstration-products for the backend only; stock/parcel roles and old profiles disable inherited capability. It still selects the same context Python service/protocol. Source/profile mismatches fail closed.

Stock metadata `research/datasets/inventory-context-serving-v2/manifests/manifest-02.json`, SHA256 `4db35b747ecb8cfdf20ea15bdaded8ec5820db4a45ccdbb7ee572d52b3714e1b`. Parcel metadata `outputs/inventory-ai-20261023/demo-parcel-3b6aac73-b9b3-428c-8e17-a7cb8a8db29f/manifest.json`, SHA256 `a1c374568136cbc922d497a770a30b844ef8070299af0038af43b9ce2b15a655`. The parcel model and warm artifacts are unchanged; only shared-router metadata was refreshed. Old manifests/profiles are untouched.

Checkpoint: `outputs/inventory-demo-product-20261023/emulator-checkpoint-01`. The fresh official staging export was copied/hash-verified after the known Windows final-rename failure:11 files, 116 accounts, two objects. Restart preserved all 1,665 documents, accountIDs and object hashes. The only allowed normal import difference is Auth tokensValidAfterTime. Before any later restart, export/verify then-current state; never restore an old checkpoint over new work.

```powershell
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role StockResearch
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role ParcelResearch
node scripts/prepare-inventory-ai-local.mjs launch --profile <private-profile-path> --role Backend --import <verified-current-checkpoint>
```

Limits remain one native worker, two threads, 15s execution plus 3s confirmed drain, 2GiB sampled process-tree RSS, 3GiB free startup RAM and 1GiB free disk; 20/25/35/45-second HTTP/backend/browser/receipt bounds. No limit override or other application termination occurred. Source-list-only Python changes do not alter inference/native supervision. All 59 affected inference/HTTP checks pass. The previous 60-module/1036-case research checkpoint remains historical; no scientific TEST replay occurred.

## Verification checkpoint

117 focused JavaScript tests pass. Fixture browser checks 29 scenarios; build passes, lint zero errors and six existing image warnings, with the existing bundle-size warning. Tracked 429/history 516/expanded 543 secret scans pass at this checkpoint. Actual emulator 10 and browser 7 checks include trusted read-only preview, real frozen-model probabilities/feature digest, product mutation during inference, lost acknowledgement/reload/exact recovery, private receipt/direct-write denials and exact cleanup. Detailed outcomes/scenarios stay ignored under `outputs/inventory-ai-20261023/demo-*`; cutover and final evidence under `outputs/inventory-demo-product-20261023/`.

Datasets, weights, private configuration, entered scenarios, emulator exports and generated evidence stay out of GitHub. No staging, commit, push, merge, deployment, production write, camera trial or other-model development is included. Final evidence is recorded below.

## Final verification and decisions

All 13 local Firebase suites passed: ten original suites plus demo-product, manual-context and legacy recovery. All temporary fixtures were exactly cleaned against the 1,665-document/116-account/two-object baseline. The actual browser request measured 17.61 ms model computation, 4.483 seconds stock service and 232.51 MiB sampled worker peak RSS, with confirmed cleanup. This is one functional software scenario, not a new accuracy study or browser latency distribution. All 24 protected scientific/artifact hashes and four private-file hashes remain unchanged; generated helper copies match, eight sensitive paths are ignored and 209 checked documentation links resolve.

The one fresh independent review found no Critical or Important issue. Deferred minor: selecting the current product option does not trigger another preview. The two-step refresh workaround above is safe; no stale submission is allowed.

Rulings made during execution, with practical costs:

- Used the approved current checkout and scoped baseline instead of a new worktree/commit. Earlier unrelated work is not certified; local evidence must be retained.
- Gated new preview/claims by capability while preserving matching saved recovery. Removing capability fences in-flight results; it does not erase original intent.
- Added a deny-all private rule, so client grant validators do not apply. A rules regression would expose private receipts; actual client denials were checked.
- Used the captured 533-file baseline and explicit 20 changed/10 added file package when the commit-range helper rejected an empty range. This review excludes earlier unrelated dirty changes.

- Independent warehouse accuracy/calibration/history qualification remains unfinished; keep synthetic-only disclosures. Cost if wrong: Mistaking simulation agreement for warehouse accuracy could cause bad stock decisions.

- Frozen science and consumed TEST remain untouched; this integration does not certify training correctness anew. Cost if wrong: Any pre-existing scientific defect remains outside this verification.

- Unchanged native worker/supervision/resource code relies on affected59 checks and prior full research checkpoint. Cost if wrong: Unrelated pre-existing runtime defects are not newly certified.

- Local-only implementation excludes production/deployment/private-value review/remote-host readiness. Cost if wrong: It must not be treated as a deployed or remotely qualified service.

- Source SHA256 is consistency evidence, not an administrator-proof signature; clients cannot write history. Cost if wrong: A malicious privileged administrator could forge and rehash records.

- Preserve malformed browser intent for administrator reconciliation, with no automatic repair. Cost if wrong: New requests remain blocked until the original saved data is reconciled.

- Keep account-scoped session storage; no new cross-device/global-cross-tab coordination guarantee. Cost if wrong: Another device cannot recover this tab’s saved intent automatically.

- Keep results experimental; operational alert/procurement acceptance and genuine prediction remain separate work. Cost if wrong: The broader stock goal remains incomplete.

- Do not alter camera/parcel quality/unrelated workflows or earlier dirty work. Cost if wrong: This review certifies only the scoped change, not unrelated application quality.

- Parent verifies terminal original regressions, exact state cleanup and screenshots; reviewer remains read-only. Cost if wrong: A review verdict alone cannot prove runtime preservation.

- Keep branch/checkout/ignored ledger as approved; no finishing menu, commit, push or deletion. Cost if wrong: Local evidence has no Git-history backup; retain it for continuation.
