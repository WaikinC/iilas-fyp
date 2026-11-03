# Module URLs — local verification and release hold

The web application now has module URLs and immutable-record links in the isolated development checkout. **This update is not published to Firebase.** The user explicitly requested holding publication until after the supervisor session. The current live app and MSI runtime stay unchanged. A GitHub source-code push is authorized separately; it must not deploy Hosting.

| Area | URL path |
|---|---|
| Dashboard | /dashboard |
| Product Management | /inventory/products |
| Stock Management | /inventory/stock |
| Warehouse Operations | /inventory/warehouse |
| Replenishment & Procurement | /inventory/procurement |
| Purchase-order details | /inventory/procurement/orders/:id |
| Order & Dispatch | /logistics/shipments |
| Shipment details | /logistics/shipments/:id |
| Fleet Management | /logistics/fleet |
| Transport Management | /logistics/transport |
| Delivery Monitoring | /logistics/deliveries |
| Reports & Statistics | /reports |
| User Management | /users |
| Customer portal | /customer |
| Shared Customer shipment | /customer/shipments/:id |

These paths apply after the update is installed/published. Do not use them as evidence that the current hosted app has changed. The placeholders use immutable database document IDs rather than recipient details or business codes. Links still require normal sign-in, account approval and existing permissions. Customer URLs never open the staff interface; User Management remains Admin-only. Root resolves to the account's home. Unavailable records and unknown URLs have explicit recovery paths.

Refresh retains the requested page. The sidebar provides real links for bookmarks/new tabs, and browser Back/Forward follow navigation. Shipment dirty/busy guards support both module exits and detail changes, with explicit Keep editing/Discard decisions. Purchasing forms retain values after a cancelled exit and prevent leaving during a submission. Native reload/close warnings protect registered active edits. Saved creation recovery remains above module switching and is not retried or erased by navigation.

## Local verification

- Nine pure route/access tests,16 router-browser groups,18 actual authenticated-shell groups,18 existing Customer UI groups and46 focused/original software cases pass.
- The actual-shell suite includes real shipment dirty Back/Forward, pending-confirmation/account snapshots, copied detail links, missing records, Customer isolation, purchase-form cancellation/acceptance and390px layout. The same-module Finder regression was reproduced against virtually served pre-fix behavior and passes with the correction.
- Build passes. Full lint has zero errors and the same14 existing warnings. Tracked/history/expanded source secret scans pass. Independent final source review has no remaining important finding.
- The older procurement UI harness initially failed before assertions because its runtime mocks and account/provider/code assumptions predated the accepted app. QA-only compatibility was corrected; its16 checks now pass. Product authority and validation were not weakened.
- Browser fixtures block non-loopback services and do not write live records. No scientific model inference/evaluation, wallet signing, parcel or physical phone test was run for this feature.

The current main checkout's pinned application files, models, proof store, chain and public service binding remain unchanged. No Firebase deployment, cloud business write, account/billing change or automatic release is authorized. Original Firebase regressions must pass at the later publication gate; any local regression results recorded subsequently are local-only.

Implementation: React Router7.18.5 in the current Vite SPA, with a closed route codec and existing account/record controllers. Firebase Hosting already has the required catch-all index rewrite; no backend or rules change is required by these URLs. Four router dependencies were added without changing existing dependency versions.

Private local QA outputs and execution ledger stay ignored. They are not application datasets and must not be uploaded. The full workspace's documentation/report archive and private-config folder remain outside the application Git checkout.
