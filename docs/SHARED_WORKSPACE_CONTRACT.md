# Shared workspace and operational contracts

**Superseded access design:** the latest user-approved model is one shared system with administrator-approved accounts. Read [ACCOUNT_ACCESS_CONTRACT.md](ACCOUNT_ACCESS_CONTRACT.md). Organisation creation, invitations and switching are removed. The operational warehouse/procurement/delivery/hash contracts remain, using the fixed protected data scope. The organisation description below is historical.

Updated 8 October 2026. Local implementation; production deployment pending.

`workspaces/{creatorUid}` owns the organisation. `members/{workspaceId}_{uid}` stores workspace/user IDs, active flag, role, display name and version. Membership and invitations are server-managed. Operational `ownerId` now means workspace ID; actor and updatedBy retain the individual employee UID. Creating an organisation adopts its creator's records without copying/resetting balances. Joining does not transfer personal records. Account merging requires a reviewed migration.

Invitations are random, stored by SHA-256, tied to an email, expire after seven days and are one-use. Production email verification is required; emulator test accounts bypass verification. Admin manages roles/revocation; the organisation creator must remain active Admin. Roles are Admin, Manager, Inventory, Warehouse, Logistics, Driver and Viewer. All active staff can read organisation records. Driver writes require delivery assignment. Viewer is staff read-only access, not an external customer portal.

## Trusted write boundary

The authenticated callable `command` in asia-southeast1 validates schemas, role, state and optimistic versions in `backend/functions/service.mjs`. Shared browser writes are denied; backend transactions commit records/audits together. Membership is rechecked after slower inference, file hashing or chain calls. Legacy direct writes remain only until an account creates its organisation. Rules permit reads only for active workspace members or unconverted legacy owners.

## Inventory, procurement and handover

Products retain on-hand, reserved and warehouse-reserved quantities. Warehouse allocations are included in total reserved quantity; generic releases cannot consume them. SKU/barcode, physical vehicle registration and driver account keys are unique per workspace. Products with reservations or open shipments cannot be archived. Warehouse allocations must finish/cancel before product deactivation.

Stock changes create immutable movement snapshots and update product/audit records atomically. Inventory/Warehouse adjustments await independent manager approval. Procurement follows Submitted → Approved → Issued → PartReceived/Received. Self-approval, over-receipt and stale versions are rejected. Warehouse staff can receive orders, committing quantity, movement, audit and purchase state together. The form and backend accept up to 100 distinct purchase lines; client and server reject duplicate products.

`PREPARED_SHIPMENT_CONTRACT.md` defines picking allocation, packing, handover and cancellation. Shared shipments accept up to 100 distinct products. Transport scheduling requires Prepared status, an active registered driver, an available vehicle with sufficient capacity, and free assignment locks. Cancel a schedule before changing destination/date or resources. Dispatch consumes stock/allocation once and preserves immutable history.

Delivery follows Dispatched → In Transit → Attempt Failed/Delivered/Returned. Failed attempts can restart transit or return. Delivered requires registered proof for that shipment. Terminal events complete the transport plan and release driver/vehicle assignments. Returned goods require warehouse inspection and a separately recorded receipt; no automatic replenishment is assumed.

## Evidence, location, inference and integrity

Evidence objects use `evidence/{workspaceId}/{shipmentId}/{uuid}`. Uploads require delivery roles/assignment and a dispatched shipment. JPEG/PNG/WebP/PDF are accepted up to 10 MB; Parcel Image must be an image. The backend hashes downloaded bytes and registers metadata once. Storage replacement/deletion and direct client evidence-document writes are denied. Browser retrieval uses authenticated blob access rather than bearer-token download URLs.

Coordinates/accuracy are validated; latest position and appended history use server timestamps. Only active deliveries accept updates. The map shows explicitly submitted position/age/accuracy, not continuous tracking.

Inference requires evaluated local model artefacts and an authenticated internal Python service. Backend-derived features, source version, model/version/confidence and human-review state are saved. Models cannot approve workflows. Missing labelled data/models/configuration return unavailable.

`lib/integrity.js` fixes array field order, format version and millisecond timestamps. On-chain data contains opaque SHA-256 references and content digests. The backend validates configured chain/address, successful receipt, matching Registered event, registry lookup and unchanged canonical content before writing verification. Client-supplied contract addresses are not trusted. Hash consistency does not prove the truth of original content.
