# IILAS FYP prototype

Online prototype: https://fyp-inventory-and-logistics.web.app

This supervisor demo contains one database-backed CRUD module for each FYP system:

- **Dashboard:** live product, reorder, shipment-status, category and activity summaries from the signed-in account's Firestore records.
- **Inventory Management → Product Management:** create, search, filter, edit and archive product records, including an optional image, custom category, stock-on-hand quantity and reorder level. SKU and barcode are unique within each signed-in account. Archiving hides a product from the active catalogue while preserving shipment history.
- **Inventory Management → Stock Management:** view on-hand, reserved and available balances; record receipts, issues, adjustments, reservations, releases and full-balance location transfers; filter immutable movement history; and see reorder indicators. Each operation updates the product, movement history and audit log atomically.
- **Logistics Management → Order & Dispatch:** search the inventory catalogue and add up to two products with quantities to a shipment. Create and edit drafts, confirm preparation and driver assignment, dispatch them, and delete drafts. Dispatch checks available stock and deducts item quantities atomically. Dispatched records are locked.

The interface follows the supplied `FYPuiDesign.zip` Figma export. Sidebar items for later modules are marked Coming soon. Route optimisation, AI, blockchain, live delivery tracking, and the full warehouse handover are not yet claimed.

## Supervisor test

1. Open the online link and choose **First visit? Create an account**. Use an email address and a new password of at least six characters. Each account sees only its own test data.
2. In **Product Management**, add a product with a unique SKU and 8–14 digit barcode. Set stock on hand above zero, optionally choose an image and **Other / custom category**, then reload to verify persistence. Edit, search/filter, and archive records as needed.
3. In **Stock Management**, record a receipt and reservation. Confirm that on-hand, reserved and available totals update and that movement history shows the reason, reference and before/after balances. Try an issue above the available balance to see validation block it.
4. In **Order & Dispatch**, create a Draft shipment. Search the inventory products by name, SKU, barcode or category and add one or two with quantities. Set a prepared-shipment reference, confirm picking and packing, and assign a driver. Move it to Prepared or Dispatched. Dispatch deducts the chosen quantities from available stock without consuming reserved units. Drafts can be deleted; dispatched records remain visible and locked.
5. Return to **Dashboard** to view updated counts, category breakdown, stock attention and recent activity.

Use non-sensitive demonstration data for recipient names, phone numbers, and addresses.

## Stack and deployment

- React and TypeScript, built as a static Vite app
- Firebase Authentication (Email/Password)
- Cloud Firestore database, with account-owned records and transaction-backed uniqueness keys
- Firebase Hosting

The Firebase project is `fyp-inventory-and-logistics`. Public web-app configuration is in `firebase-config.json`; Firestore rules are in `firestore.rules`. Audit entries are written to `auditLogs`, and stock movement records are written to `stockMovements`.

Product images are resized in the browser to a maximum of 512 pixels and stored as small JPEG data in the product's Firestore document. This keeps the prototype within its existing Firebase services; for a large production catalogue, object storage would be more suitable. Product quantities and locations are changed through Stock Management, while dispatch deducts from available stock. Reservations are explicit stock movements; draft shipments do not reserve automatically.

```powershell
npm install
npm run dev
npm run build
```

When the app runs on `localhost` or `127.0.0.1`, it connects to the local Firebase Authentication and Firestore emulators. Start them in another terminal:

```powershell
npx firebase emulators:start --only auth,firestore
```

The build writes `dist/client`, which `firebase.json` deploys. To redeploy with the Firebase CLI after signing into the project:

```powershell
npx firebase deploy --only hosting,firestore:rules --project fyp-inventory-and-logistics
```

Firebase Authentication and Firestore are live. Cloud Functions and server-side business workflows are planned later, beyond the required first CRUD prototype. The form and transaction logic validate prototype records; Firestore rules also enforce account ownership, field constraints, uniqueness-key and audit consistency, atomic stock deduction, and locked dispatched records. The two-product limit keeps dispatch transactions within Firestore's rule-evaluation budget; a larger production shipment would need a trusted backend workflow.

The local Firebase emulator smoke and QA tests cover product create/edit/archive, image/category fields, duplicate SKU/barcode rejection, all six stock movement types, reservations, linked shipment items, two-product atomic deduction, insufficient-stock and invalid direct-write rejection, concurrent dispatch protection, and isolation between two accounts. No real supervisor account credentials are stored in this repository.

See `REQUIREMENTS.md` for the source-document mapping and scope limits.

See `PROJECT_ROADMAP.md` for the completed scope, planned modules, testing strategy, deployment milestones, and final FYP delivery plan.

See `FULL_SCOPE_TRACEABILITY.md` for the source-grounded module ownership, functional requirements, and AI, computer-vision, GPS/map, and blockchain commitments from both Project 1 reports.
