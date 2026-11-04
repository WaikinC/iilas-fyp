# Customer requests and linked shipments — local development

This extension is local development work. The hosted Firebase application continues using its current release. Do not deploy or switch the running MSI services to these sources until the user's release hold is lifted. Parcel/camera and physical Android trials remain deferred.

## Customer workflow

1. Sign in as an approved Customer. The Customer portal is separate from staff modules. Open **Orders**, then **New order request**.
2. Enter recipient, contact phone, full delivery address, today/future requested delivery date in Malaysia time, and 1–20 item descriptions with whole quantities from 1 to 10,000. An optional message helps staff identify the items. No inventory catalogue or stock balance is exposed.
3. Submit once. The system creates a locked `ORD-` reference and shows **Awaiting review**. Request data is immutable; cancel an unaccepted request and submit a replacement if necessary.
4. Open the order to see the team's decision/message. Once accepted, **View shipment** opens its private tracking page. Independently shared shipments remain under **Shipments**.
5. When the current delivery is Delivered and has an eligible proof, download the proof or select **Check proof integrity**. The read-only check reports Verified, Not registered, Unmatched or Unavailable with the observation time. It cannot register hashes or disclose wallet/source metadata.

Customer URLs: `/customer/orders`, `/customer/orders/new`, `/customer/orders/:id`; existing `/customer` and `/customer/shipments/:id` links remain valid. Customers cannot open staff routes or other customers' orders.

## Staff workflow

1. An approved Admin, Manager or Logistics user opens **Order & Dispatch → Customer orders**.
2. Review the delivery details and requested descriptions. Match every line to an active inventory product. Repeated lines mapped to one product are combined, with at most 10,000 units per product.
3. Choose today/future expected delivery and optionally write a customer-facing message. Select **Accept, create shipment & share tracking**. Acceptance creates exactly one generated `SHP-` Draft, private tracking grant, permanent order linkage and recoverable decision receipt in one transaction. It does not reserve or deduct stock. Location sharing defaults off.
4. Alternatively, write a reason and select **Reject request**. Rejection does not create a shipment or consume an SHP number.
5. Select **Open linked shipment**. Follow the existing **Warehouse Operations → Picking → Packing → Handed over → Transport Management → Order & Dispatch → Review dispatch** flow. Existing reservation, resource-lock and dispatch accounting rules remain authoritative.
6. Complete normal Delivery Monitoring and upload a fictional delivery proof when testing. Customer tracking projects only safe current facts. Staff must explicitly enable location sharing through the existing customer access controls if required; location collection itself remains a separate deliberate action.

Deleting an eligible linked Draft is labelled **Cancel order & delete draft**. It cancels the accepted request, preserves its permanent linkage/tombstone and revokes tracking. Active warehouse or transport work still prevents deletion. Replaying the original acceptance cannot recreate a deleted shipment.

## Recovery and safety

- A mutation is saved locally before transmission. Current Chrome/Edge Web Locks coordinate the same request slot across tabs; unsupported browsers refuse to send and keep saved input. Every send carries the original authenticated UID, checked on the server before work. A lost reply displays **Check saved request**, **Retry saved request** and **Cancel saved request**. Check first; do not create another request to work around an uncertain result.
- Check with no server outcome retains the saved intent. Cancelling an unapplied intent creates a terminal fence; if it already completed, its original result is recovered instead.
- Saved intents are isolated by application environment, project/backend and authenticated UID. The current system has one immutable shared scope. Rebinding another scope under an identical environment/backend/UID is not supported for pending staff decisions; reconcile them before such a migration. No password, token or proof bytes are stored. Browser storage failure prevents sending. Reloaded pending submissions show their exact saved fields; recovering an earlier request preserves unrelated form edits and discard protection.
- Current authority is checked again on the server. An approved original actor can recover their own completed outcome after a role change; fresh actions require the appropriate current role. Disabled/revoked accounts remain denied.
- All four internal order collections deny direct SDK access. Customers receive only bounded own-record projections, never shared inventory or staff subscriptions.
- Lists use pages of 20 and actor/filter-bound cursors. A displayed list is a bounded page, not a global count.

## Report alignment and limits

Choong Wai Kin's report supports limited Customer tracking and safe proof verification. Wong Ric Hang's warehouse preparation/handover boundary remains intact. Self-service free-description requests are the user's later extension; this is not a retail catalogue, payment service or promise of delivery availability. Staff acceptance is explicit and can fail if current access/products/date have changed. Integrity outcomes depend on the current configured registry and proof; absence of a working chain reports Unavailable rather than Verified.

Verification commands/evidence are recorded separately in `CUSTOMER_ORDERS_VERIFICATION_2026-11-04.md`. Fictional emulator identities, passwords and private results remain in ignored local outputs. No cloud data, running live MSI source binding or blockchain history is changed by these tests.
