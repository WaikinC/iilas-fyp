# Demo-product stock AI design

23 October 2026. Proposed next core implementation; not implemented. The user confirmed all current local inventory is demonstration/test data and selected **connect selected demo products next**. Existing Native execution preference remains selected. The user approved this written design on23October2026 after its fresh builder check returned nothing important left. Its implementation plan is being prepared; the completed context integration is not being reopened.

## Intent

Make the existing stock classifier useful while testing the actual IILAS product workflow. Staff select an active demo product, use its trusted recorded balance facts, enter the missing fictional history/demand/supply context and receive a retained RF14 result tied to that frozen product version. The distinction between a complete experimental scenario and qualified real inventory stays explicit.

Wong's report describes stock-risk decision support using structured stock indicators, RF as the main model and DT as a comparison; carefully prepared simulation supports the student prototype. Choong's report shares product/warehouse/dispatch contracts. Neither permits counting reservations twice or inventing complete history from an empty ledger. This design advances the product-to-model connection. It does not claim independent warehouse quality or complete report-level alert/procurement acceptance.

## Current evidence and selected approach

The [read-only audit](../../INVENTORY_DATA_READINESS_AUDIT_2026-10-23.md) found 44 active products with valid recorded balances, zero verified 30-day windows, eligible recorded receipts for 25 products and zero saved human-labelled snapshots/review revisions. The user explicitly identified the data as demonstration/test. All source hashes matched across the audit; no database records changed.

The local [context experiment](../../INVENTORY_CONTEXT_AI_LOCAL_GUIDE_2026-10-23.md) works for eleven entirely entered fictional facts. The evaluated RF14 remains frozen: 81.53% synthetic accuracy, Critical precision79%, recall87.78%, accuracy interval78.54–84.86%. This design neither retrains nor replays the consumed scientific evaluation.

Approaches considered:

1. **Selected demo product plus explicitly fictional context — selected by the user.** Reuse actual app balances and authority/version checks, while the eight missing context facts remain clearly entered fictional values. This supports the app workflow now, without certifying history or using fabricated business facts.
2. Keep the existing standalone manual scenario screen and prepare independent review first. It avoids a new product binding but leaves the product-to-model interaction unimplemented and needs an independent reviewer/data source for new quality evidence.
3. Automatically map current ledger/shipments/POs to all model inputs. Rejected: coverage is unverified, absent commitments are not proven, PO status does not establish supply confidence and reserved demand could be counted twice.

The previous manually entered mode remains available. No product is silently selected on opening the experiment.

## Staff workflow

Keep **Stock Management → Stock AI experiment**, the existing navy/purple styling, modal accessibility, role restrictions and paged history. Add a clear scenario source choice: **Fully fictional scenario** or **Selected demo product**. Choosing a product uses the current approved shared product list; it does not introduce new navigation or a second dashboard.

For selected-product mode, a trusted read-only command returns the active product's ID, version, display name/SKU, on-hand quantity, reserved quantity and reorder level, plus server observation time and a digest of those frozen facts. Validate the existing balance/location contract. Selecting, refreshing or viewing the product creates no experiment or snapshot. Show these three balance facts read-only and derive available/reorder distance once.

The remaining eight facts start blank and are explicitly labelled **fictional context for this demo**: 30-day movement count, 30-day adjustment count, days since replenishment, additional firm quantity/due days, incoming quantity/ETA and supply status. Do not fill them from observed incomplete ledger counts or substitute zero. All existing constraints apply: adjustments<=movements, finite fractional days, explicit zero demand/null deadline, explicit none supply/zero quantity/null ETA, positive stated batch and exactly one supply state. Additional demand excludes reservations already deducted.

Require an explicit demonstration-use acknowledgement before submitting a selected-product experiment. The server independently enforces local demo capability; the acknowledgement cannot enable production mode. The UI identifies the origin of each fact and states that entered context is not an assertion about the product's actual history. Always include both deadlines and explicit not-applicable wording in the factual preview. This also resolves the previously deferred preview omission when this source-pinned UI is next changed.

Switching product/source clears the prior trusted balance snapshot and fictional context, prevents stale read replies from repopulating another selection, and preserves all pending requests. A stale or malformed saved request blocks new submission until reconciled. Closing/reopening does not discard saved intent; account/scope switching fences stale replies.

## Trusted command and product binding

Proposed commands: `getInventoryDemoProductContext`, `startInventoryDemoProductExperiment`, `resolveInventoryDemoProductExperiment`. Final helper filenames/signatures follow the established contracts; names are builder choices. Approved active Admin/Manager/Inventory/Warehouse can read product context or submit/recover. Approved shared staff retain permitted history reads. No new membership/role capability is granted.

New start input is a closed envelope containing operation ID, product ID, expected product version, the eight entered fictional facts and an explicit demonstration-use marker. Do not accept client balance facts, scope, label, source digest, model identity, acceptance or permission flags. Trusted transactions read the current scoped active product, validate its version/balances and assemble the eleven-fact scenario from server balance values plus validated entered context. The product read shown in the form is a preview; the claim transaction remains authoritative.

A private receipt binds actor, fixed scope, operation, canonical input, frozen product facts/digest, feature digest, serving fingerprint and server nonce. The slow authenticated HTTP call stays outside transactions. Final retention rechecks current approval/role/scope, nonce, lease, serving configuration and the selected product's existence, active state, version and frozen balance identity. If the product changed, was archived or removed during inference, retain a clearly explained **Unavailable** outcome against the original claim; do not publish a predicted label or auto-resubmit. A fresh user-confirmed request may use refreshed facts and a new operation later.

An already-claimed operation with matching input recovers its original terminal result even if the product later changes or disappears; current authority still applies. Still-running returns Pending; expired work becomes Unavailable; unknown resolution creates a durable cancellation tombstone without inference. Altered-input reuse fails. Concurrent submissions yield one retained result. No operational collection is written except the new experiment receipt, public experimental outcome and existing audit log.

## Preserve history and request recovery

Keep the same public `inventoryAIExperiments` history collection, with an explicitly discriminated new record version for demo-product outcomes. Extend the history decoder to recognise the existing exact v1/v2 forms and the new exact form; unsupported data stays retained and visibly unavailable. The new record contains the frozen scenario, trusted compact product snapshot/digest, scenario-source marker, original RF14 study metadata, model prediction if valid, reason if unavailable and false/null operational/independent-validation provenance. Do not copy the entire product document. Product IDs, display values and versions are lineage, never predictor columns.

The new version may use `version:3` with `scenarioSource:'demo-product'` and a closed `sourceProduct` object; the builder must choose and document the exact closed schema consistently. Existing v1/v2 records are not rewritten or reclassified. New public records remain approved fixed-scope readable and no-client-write. A separate `inventoryDemoProductAIRequests` collection denies all client reads/writes, including Admin.

Use a separate browser pending-request key for this envelope. Inspect legacy six-input, manual-context and demo-product keys before any new start. Recover each through its matching command; never convert, erase or retry an old operation through the new protocol. Existing legacy start remains recovery-only. Preserve35-second observation, late-reply fencing, exact operation/input matching and current-account checks. UI exposes the source-specific recovery action without making the user re-enter saved facts.

## Frozen model and serving metadata

The native worker still receives the exact fourteen-feature `inventory-context-inference-2.0` protocol. Keep the selected RF14 bytes, scientific modules/receipts, feature order, binary64 digest, probabilities/argmax, study figures and uncertainty unchanged. Product metadata never reaches the feature matrix or changes model selection. No `.fit`, raw scientific TEST access, additional threshold choice, new dataset or weight download is required.

Reuse/refactor the existing trusted context lifecycle so claim/fetch/finalisation protections remain authoritative for both request variants. Do not introduce an injected transaction bypass or weaken old command tests. The exact shared-helper structure is the builder's call, provided old contract behaviour is unchanged and the product finalisation fence is proven.

Keep15-second native execution, separate3-second confirmed drain, one worker/two threads/2GiB RSS/3GiB free startup RAM/1GiB disk,4096-byte HTTP body and bounded outputs. HTTP/backend/browser/receipt limits remain20/25/35/45seconds. New profile metadata may bind an explicit local-only demonstration-product capability; prefer a fresh profile schema/version over silently treating a changed old profile as compatible. Production, another project, hostname/LAN endpoint, missing capability or mismatched source must refuse this path.

Extending pinned client/server sources requires fresh immutable stock source metadata, a new private launch profile and refreshed parcel metadata because the shared router changes. Preserve all prior metadata/weights/descriptors/warm bundles/profile values; never patch historical hashes. Before restarting, freshly export/hash-verify the then-current emulator state, confirm no active request and reidentify owned listeners/processes. Start one loopback stack from that verified current checkpoint and audit exact IDs, balances, accounts and Storage, allowing only the documented normal Auth import timestamp difference. Do not reuse a historical checkpoint merely because its totals match.

## Scope boundaries

The current user confirmed this local collection is demo data. The capability and source markers make that explicit; they are not proof that another installation contains demo data. Real-product stock assessment/readiness remains unchanged and unqualified. A future genuine-input path needs independently justified history, commitment/supply semantics and evaluation; this feature cannot qualify it.

This design creates no stock movement, reservation, purchase order, supplier action, automatic alert into operational dashboards, real-product AI acceptance or new training eligibility. A model score is decision support inside the experimental workflow. Existing Admin IDs/balances, personal inventories, warehouse/Prepared-Shipment Handover, stock snapshot/review system and eight-card dashboard stay authoritative. Other AI/camera/extra features remain deferred.

## Required verification

Use the existing Native execution preference, TDD for meaningful contracts and one fresh final whole-change review. No staging/commit/push/deployment is required.

- Strict envelopes, integer/count/fractional/absence rules and JS/Python feature parity; source IDs never enter predictors. Missing facts never become zero.
- Trusted balance derivation and rejection of forged balances, foreign products, disabled roles and inactive/stale versions. Read-only preview creates no records.
- Product version/balance/archive/delete changes while HTTP is in flight produce Unavailable; exact terminal recovery survives later product changes. Configuration/nonce/role fencing, duplicate/racing submissions, timeout/cancellation, changed-input retries and request recovery across all three browser keys.
- v1/v2/new history decoding preserves original facts/metrics, strict source snapshot digest and unsupported rows. Private receipt reads/direct writes denied; no product, stock, procurement, snapshot-review, generic prediction or operational alert writes.
- Fixture desktop/390px UI checks cover clearing fields/selections, late preview replies, acknowledgement, source-specific recovery and full factual preview. Then actual local browser→Firebase→frozen RF14 with disposable demo-product fixtures, lost acknowledgement/reload recovery, one retained outcome and exact raw worker feature/model/score lineage.
- Preserve all existing emulator data and exactly clean temporary accounts/products/records. Run original/affected Firebase suites sequentially on the one stack; run affected Python/client/command tests, build/lint, tracked/history/expanded secret checks, ignore/source/hash/link checks. Broaden the research suite when changed serving/shared lifecycle code warrants it; no scientific rerun.
- Publish only source/docs if separately requested later. Weights, entered cases, datasets, private profiles, emulator exports and generated evidence remain ignored. Record new actual request timings separately from synthetic quality.

## Builder choices and handoff

The builder may choose compact helper names, exact new envelope/history types, versioned private profile names, layout spacing and test fixture IDs. The builder may not change the selected model, feature semantics, product finalisation fencing, historical recovery, permissions, metrics disclosure or no-operational-write boundary.

A fresh read-only builder check returned **nothing important left**. No new app code, service restart or profile change was performed. The user approved the written design on23October2026. Prepare the implementation plan using the already-selected Native method. Do not ask the user to reconfirm demo origin or select the approach/execution method again.
