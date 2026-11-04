# Customer workspace and linked orders

The user resumed the paused Customer extension and requested a complete UI/function flow linked to Order & Dispatch. Earlier permission to choose sensible implementation details without repeated approval remains applicable. Native execution; no Firebase publication or live cloud writes; parcel/phone trials stay deferred.

## Scope and report boundary

Both original reports retain staff-controlled shipment creation and Warehouse Picking → Packing → Prepared Handover → Transport → Dispatch. Choong's report permits approved Customer tracking and safe verification, but prohibits customer evidence registration/user management. Self-service requests are the user's new extension; do not claim the reports require shopping, payments or public inventory access.

Customer requests contain recipient/contact/address, requested date, notes and 1–20 item descriptions/quantities (1–10,000). Customers see no raw product catalogue, inventory balances, staff directory, AI output, internal notes or cryptographic metadata. Staff map requested descriptions to active inventory products. This is the agent's chosen logistics request approach; a separate retail catalogue would add disclosure and publishing workflows unrelated to this demo.

## Flow

1. Approved Customer opens Orders, submits a request, and receives an automatic locked ORD reference. Inputs are immutable after submission; an unaccepted request can be cancelled and replaced.
2. Admin/Manager/Logistics opens Customer orders within Order & Dispatch, reviews contact/request details, maps every request line to an active product, selects a valid expected delivery date and enters a message intended for the Customer.
3. An explicit **Accept, create shipment & share tracking** action atomically creates one generated SHP Draft, permanent order/shipment linkage, private access grant to the authenticated request creator with location sharing off, review, audit and private recovery receipt. Rejection allocates no SHP code.
4. Request acceptance changes no stock. Existing warehouse reservations/packing/handover, scheduled transport, dispatch deductions, delivery events and proof workflow remain authoritative.
5. Customer order details show the linked shipment's safe current projection, with a link to existing shared tracking/proof. Manually granted independent shipments remain available under Shipments.

States: Submitted → Accepted / Rejected / Cancelled. Only the owning Customer may cancel Submitted. Normal staff deletion of an eligible linked Draft explicitly cancels its order and marks the permanent link deleted; recovery never recreates it. Ordinary shipment edits retain customerOrderId. Staff cannot choose Customer identity by recipient/email.

## Trusted data and recovery

- New customerOrders, customerOrderOperations, customerOrderReferences and customerOrderShipmentLinks collections deny all direct SDK access. Server commands project only own Customer or authorized staff data. Bounded pages20 with scope/actor/filter-bound continuation; no whole-collection Customer subscriptions.
- Server derives scope and actor from current Auth and approved profile. Customer never becomes a staff role or reads system/config. All mutations have UUID+canonical-input private receipts; concurrent conversion/cancellation/rejection/version changes are atomic. Replay returns original terminal outcome, including after a linked shipment is deleted.
- Persist original mutation intent before network transmission; read it back before sending. Keys isolate environment/project/backend/UID, with trusted scope only for staff. Check/Retry/Cancel saved request actions retain uncertain results across reload. Storage failure sends nothing; role/account/lifecycle changes suppress stale UI results. No token/proof bytes in storage.
- Current Customer role starts new requests/cancellation; approved original actors may recover their own terminal receipts after role change. Missing operation cancellation needs its original action role. Disabled/revoked accounts remain denied.
- Request references are server-generated ORD plus12 UUID hexadecimal characters, with a private atomic reservation. No new shared counter migration. Conversion reuses existing SHP numbering/prepareRecordSave inside the same transaction.

## Customer proof checking

Add a read-only **Check proof integrity** action for the current granted delivery-stage PoD. Reuse source canonicalization, file digest and pinned registry reads; recheck current account/grant/proof/source/config after bounded external I/O. Return only outcome Verified/NotRegistered/Unmatched/Unavailable and check time. Never grant Customer registration, internal verification-record access, wallet controls or file paths/digests. This creates no business data and preserves proof download reauthorization.

## UI

Preserve navy/purple tokens and native Segoe UI. Customer workspace has Orders / Shipments tabs, prominent New order request, readable status chips with text/icons, focused form/detail views and mobile stacked cards. Staff workspace separates Shipments / Customer orders, with a focused review panel and clear mapped items. Use 44–48px controls, visible field guidance/errors, keyboard focus/dialog recovery, dirty-close protection and explicit loading/empty/error/saved-request states. Keep permission and recovery controls visible; avoid packing unrelated functions into one widget.

## Verification and limits

Contract/client RED→GREEN tests; actual emulator request/review/conversion/recovery/race/denial/stock accounting; original smoke and QA plus affected account/customer/creation/warehouse/dispatch suites sequentially on one loopback stack. Desktop/390px/320px browser tests include Customer→staff→warehouse→dispatch→Customer tracking and current proof checks with fictional fixtures. No real cloud records, MSI live sources/services or journals are changed. Build/lint/secret/history checks and fresh independent final source review precede Git publication. Local preview is reviewable; actual hosted activation remains on hold.
