# Prepared-Shipment Handover contract — version 3

## Location allocation update — 10 October 2026

Picking now stores `items[].allocations:[{location,quantity}]` in each job, using default-bin available units first then other bins in normalised order. Product per-bin warehouse/reserved balances protect that plan. Cancel/restart uses the saved locations; shipment item snapshots remain unchanged. Dispatch consumes exactly the held plan once, then clears `reservationsHeld` and appends `dispatchConsumedAt`, `dispatchMovementIds`, version and audit; original handover contents/stage evidence remain preserved.

Older held jobs without allocations use the original product/default location. Legacy Prepared jobs without holds allocate current available units. Corrupt/missing held bins fail closed. Manual correction cannot reverse linked warehouse/dispatch history. See [STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md](STOCK_LOCATIONS_CORRECTIONS_2026-10-10.md). This supersedes the older statement that reservationsHeld remains true after dispatch.

Latest access update, 8 October 2026: approved staff share one fixed system. Backend commands derive the preserved ownerId scope from system/config and check users/{uid}, rather than organisation membership. The allocation, packing, cancellation, immutable handover and exactly-once dispatch contract below remains. See ACCOUNT_ACCESS_CONTRACT.md.

## Shared organisation contract — 8 October 2026

Wong Ric Hang's Warehouse Operations owns picking, packing, allocation and completion evidence. Choong Wai Kin's Order & Dispatch consumes Prepared handovers and owns planning/dispatch. Server commands enforce both scopes using workspace ownerId and individual actor UIDs. Shared shipments accept 1–100 distinct products.

Stages proceed Waiting/Cancelled → Picking → Packed → HandedOver. Picking atomically reserves items in total reservedQuantity and warehouseReservedQuantity. Generic releases cannot consume these allocations. Subsequent steps include the job's own stock allocation in their checks; parcel count freezes at packing. Cancellation before HandedOver releases allocations, retains cancellation notes/actor/time/audit and allows Draft editing or restarting with a new version. Completed handovers remain immutable.

Handover atomically updates the warehouse job/audit and shipment/audit, setting Prepared, packed:true, frozen item/count data, handoverId and generated PS-reference. Logistics schedules a registered driver/vehicle afterwards. Cancel a schedule before changing destination/date. Dispatch validates membership, assignment and allocation, deducts quantity, consumes reservations and saves movement/audit history once.

The completed job's reservationsHeld flag records that the original handover carried allocations; shipment status shows whether dispatch consumed them. Historical adopted jobs without allocation flags remain unallocated; availability is checked and no warehouse evidence is invented. The legacy two-product rules path remains only for unconverted accounts. Warehouse roles are Admin/Manager/Warehouse; dispatch roles are Admin/Manager/Logistics. Driver writes require dispatched assignment.

scripts/shared-qa.mjs verifies allocation protection, cancel/restart, ordered handover and exactly-once dispatch. scripts/warehouse-qa.mjs covers the legacy boundary. See SHARED_WORKSPACE_CONTRACT.md for the surrounding contracts.

## Historical version 1 baseline

Implemented 7 October 2026 for the account-owned IILAS prototype.

## Ownership and responsibilities

Wong Ric Hang's Warehouse Operations owns picking, packing, parcel count, and completion evidence. Choong Wai Kin's Order & Dispatch owns shipment destination, delivery expectations, driver assignment, and dispatch. Both use the same account-owned shipment and inventory product IDs.

The planned shared role matrix is:

| Role | Responsibility |
|---|---|
| Administrator | Trusted user/role administration |
| Inventory Staff | Product and stock operations |
| Warehouse Staff | Picking, packing, and prepared handover |
| Inventory Manager | Inventory approvals and procurement review |
| Logistics Staff | Draft shipments, driver assignment, and dispatch |
| Driver/Rider | Delivery events and evidence |
| Logistics Manager | Logistics planning, review, and reporting |
| Customer/Auditor | Limited read-only evidence and reports |

These roles are a contract for future trusted custom claims and security-rule enforcement. They are not currently assigned or enforced. Current access is Firebase-authenticated account ownership; users do not share a warehouse across accounts.

## Data contract

`warehouseHandovers/{shipmentId}` uses the same document ID as `shipments/{shipmentId}`. This gives each shipment at most one warehouse job and one completion. `reference` is generated as `PS-{shipment.reference}`; it is never typed manually. Warehouse records contain:

| Fields | Contract |
|---|---|
| `ownerId`, `shipmentId`, `reference` | Account and linked shipment identity |
| `items` | Exact shipment snapshots: product ID, name, SKU, integer quantity; 1–2 distinct products |
| `status` | `Picking`, `Packed`, or `HandedOver` |
| `parcelCount` | Integer 1–10,000; frozen at packing completion |
| `notes` | Latest stage notes, 3–240 characters |
| `pickedBy`, `pickedAt` | Actor UID and server timestamp at picking start |
| `packedBy`, `packedAt` | Actor UID and server timestamp at packing confirmation |
| `handedOverBy`, `handedOverAt` | Actor UID and server timestamp at completion |
| `version` | Starts at 1, increments for each permitted stage |
| `createdAt`, `updatedAt`, `updatedBy`, `lastEventId` | Server timestamps, actor, and linked immutable audit |

Stages must proceed `Waiting → Picking → Packed → HandedOver`. Packing confirmation attests that listed items have been picked and packed. Each step validates active, non-archived products and current available stock. No stock changes occur during warehouse steps.

Completion atomically writes the warehouse status and its audit, updates the shipment to `Prepared`, sets `packed: true`, copies `parcelCount`, sets `handoverId: shipmentId` and the generated `handoverReference`, and writes the shipment audit. Firestore rules reject either half without the other.

The shipment cannot be edited or deleted once picking starts. Prepared shipments retain locked reference, item quantities/snapshots, and packing data; logistics can update contact/delivery information and assignment, then dispatch. Dispatch deducts stock atomically once and preserves reserved units. Completed handovers, stage audits, and dispatched shipments are immutable.

Existing Prepared/Dispatched shipments without `handoverId` remain historical legacy records; no warehouse evidence is invented for them. New shipments must start as Draft and use this handover before becoming Prepared or Dispatched.

## Prototype limits

- Account isolation is implemented; shared organisations and role enforcement are pending.
- Warehouse work does not create shipment-bound reservations. Stock may change after packing, so completion and dispatch can require replenishment. Generic reservations still protect available stock.
- Cancellation and reopening warehouse jobs are pending; started jobs are preserved.
- Stock-in/out, adjustments, and transfers are handled by Stock Management; products have one location and transfers move the full balance.
- Stage audits retain actions and actors; the warehouse document retains latest notes and all stage actor/timestamp fields.
- The two-product limit remains until a trusted backend supports larger transactions.

## Evidence and verification

`scripts/smoke-firestore.mjs` covers the normal handover and dispatch path with existing stock operations. `scripts/warehouse-qa.mjs`, imported by `scripts/qa-review.mjs`, covers ordering, concurrent packing, forged Prepared writes, incomplete atomic completion, immutable history, frozen parcels/items, reserved-stock checks, duplicate dispatch, and cross-account access. Desktop and narrow-screen Playwright checks are recorded in `QA-WAREHOUSE-2026-10-07.md`.
