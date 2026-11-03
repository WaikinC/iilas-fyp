# Automatic business-code audit — 2 November 2026

Update: the user selected **Always generate and lock the codes**, superseding the optional-override recommendation below, and approved the [written design](superpowers/specs/2026-11-02-automatic-business-codes-design.md). It specifies locked generated product SKUs and shipment/PO references, preserving existing codes and factual barcode entry. Its independent builder check found nothing important left. The [seven-task Native plan](superpowers/plans/2026-11-02-automatic-business-codes.md) is prepared and self-reviewed; human plan review remains pending. No product implementation or activation has occurred.

The user requested automatic codes across modules, then prioritised publishing Reports graphs. Reports is now published; the code-generation change has not been implemented. Existing IDs, balances and historical references remain unchanged.

The key distinction is between hidden database IDs and staff-facing business codes. Database IDs are already created by the backend or Firebase Authentication. The manual fields the user encounters are chiefly product SKU/barcode, shipment reference and purchase-order reference.

| Area | Current identity behaviour | Proposed next treatment |
|---|---|---|
| Product Management | Backend creates a UUID for a new product; staff enter SKU and an 8–14 digit barcode. SKU/barcode uniqueness is checked transactionally. | Generate an internal SKU/item code by default. Decide how to retain existing business codes. Keep a real manufacturer's barcode distinct from any generated internal label. |
| Order & Dispatch | Backend creates the shipment UUID; staff enter a unique shipment reference. Prepared reference/items/counts are protected. | Generate a shipment reference for new drafts and preserve all existing Prepared/Dispatched references and links. |
| Replenishment & Procurement | Backend creates the purchase-order UUID; staff enter its business reference. | Generate an internal PO reference; keep independent approval, retry recovery and supplier document references intact. |
| Stock Management | Movement/request IDs are generated; a staff reference supplies documentary context. | Retain generated identity. An optional readable internal movement number must remain separate from an invoice or external document reference. |
| Warehouse Operations | Handover is linked to the shipment and its PS-reference is generated from the shipment reference. | Retain the existing automatic contract; do not renumber completed handovers. |
| Fleet Management | The backend creates resource/event record identities. Staff supply vehicle, licence and linked-driver facts. | Retain automatic database IDs. Do not invent physical registration plates, licences or employee identities. |
| Transport Management | Plans and assignments link existing shipment/resource identities; command recovery IDs are generated. | Reuse the generated shipment reference consistently; preserve schedule/version authority. |
| Delivery Monitoring / evidence | Delivery history and proof records use generated identities and existing shipment links. | Show the shipment's readable reference consistently; retain generated event/proof IDs and immutable evidence links. |
| User Management / Customer access | Firebase creates account UIDs; grants link explicit existing account/shipment IDs. | Keep UIDs and access grants automatic. Email, name and customer facts remain entered or selected normally. |
| AI, reports and verification | Experiment/request, retained-check and generated-export identities are already produced by their respective workflows. | Preserve them. Do not treat hashes, predictions or source IDs as manually assigned catalogue codes. |

Evidence reviewed includes app/page.tsx ProductModal; lib/validation.js; backend/functions/service.mjs save/entity/purchaseOrder/stock/warehouse handlers; deliveryWorkflow.mjs; and the currently hosted overlay's ShipmentEditor and Procurement forms. The report/warehouse/account contracts remain authoritative.

Recommendation under discussion: generate internal codes on the trusted backend, with a clearly labelled option for pre-existing business codes. Allocate and reserve codes transactionally with the record so simultaneous staff actions and retry recovery cannot create duplicates. Exact prefixes/numbering, external-code fields, barcode semantics and edit rules belong in the approved design; they are not implemented by this audit. The user's generated-versus-editable preference is pending.

No cloud data was changed by this audit. The Reports release and current startup bindings are documented separately in REPORTS_STATISTICS_LIVE_2026-11-02.md. Parcel/phone testing remains deferred.
