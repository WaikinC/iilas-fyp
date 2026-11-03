**Current update — 2 November 2026:** [restored services and verified live Transport lifecycle](SUPERVISOR_READINESS_2026-11-02.md). Historical quota/stopped-runtime statements below are superseded. New wallet confirmations are pending on the fresh local chain.

# Supervisor session readiness — 1 November 2026

**Latest transport update:** [the form correction is deployed](TRANSPORT_FORM_FIX_2026-11-01.md) and selecting a new Prepared shipment works. Firestore now returns “Quota exceeded”; the quota console shows 49,949 / 50,000 daily reads. Live create/edit/cancel and final post-release census remain pending quota recovery. Do not present the hosted app as ready for fresh server-backed workflows until that check passes. Billing stays disabled; no plan save, stock change, parcel or phone trial was attempted in this correction. This supersedes the earlier “transport form needs fixing” statement below.

**Latest live workflow rehearsal:** [test results and current balances](SUPERVISOR_WORKFLOW_REHEARSAL_2026-11-01.md). Inventory → AI/review → purchase → partial/final receipt and warehouse → dispatch → delivery/proof/report checks passed. Transport plan creation has a confirmed live permission-query UI bug; its backend/API passed, but the form needs correction before an uninterrupted session. Current census is 723 documents / three unchanged accounts / seventeen proof-store files, including eleven original files preserved. Both existing blockchain proofs still match. This supersedes the earlier balances/counts below. Parcel and phone trials remain deferred.

Use [the hosted application](https://fyp-inventory-and-logistics.web.app/) and search `SUP-261101-79F529`. Keep MSI awake, connected to power and online. The original laptop can use the hosted website; trusted commands, AI analysis, proof downloads and blockchain checks depend on MSI.

## Current checks

| Area | Current evidence |
|---|---|
| Hosted application connection | Local and public authenticated API health return 200 with the expected backend/protocol binding |
| Stock AI | Actual hosted frozen RF14 inference returned Critical Stock Risk for the fictional thermal-label product; native/stored output, saved recovery and worker cleanup match |
| Delivery AI | Actual hosted frozen RF inference returned Low for supervisor SHP07; native/stored output, saved recovery and worker cleanup match |
| Separate delivery rules | A retained explainable assessment was generated independently of the model |
| AI response time | One initial stock service call took about 14.5 seconds; delivery took about 3.8 seconds. These are individual service observations, not performance guarantees or accuracy measurements |
| Private blockchain | Current chain 31337 and pinned registry are running; inventory and delivery supervisor records are independently Verified in blocks 2 and 3. Earlier-generation observations remain historical |
| Wallet acceptance | Both signatures were confirmed by the human in MSI MetaMask. Receipt, exact payload, signing account, contract/value, canonical SHA-256, event and registry match; both have retained Verified observations |
| Preservation | Final census: 636 documents. Of the 629 before this release, 627 are byte/metadata unchanged; only the exact expired request and its shared lock changed through audited recovery. Seven owned integrity/audit records were added. Three stable accounts and all 11 proof-store files (including lock) are preserved; restricted before/after backups are verified |
| Billing and privacy | Billing remains disabled. Model files, data, credentials, private configurations and operational receipts remain out of GitHub |

This restores current services; it does not restore the previous in-memory blockchain history. Earlier saved registrations remain historical records. AI outputs are experimental simulated-policy demonstrations, not independently validated real warehouse/delivery accuracy. Parcel/camera and physical Android/GPS/offline trials remain deferred. The focused Reporting & Verification clarity update is now live; other local UI work was excluded from this Hosting-only release.

## Current wallet status

Use **normal Chrome on MSI**, where MetaMask is installed. Sign into the hosted application as Admin. The Codex in-app browser can display the form but does not provide the Chrome wallet.

The Document pouches receipt `e16bea27-1a22-40ac-8588-bb006737b3b1` is complete: human-confirmed transaction `0xe40ce8fe587757d56a7f0541fcde0862d34e2bfcc8d386886329be1fc9b74948`, current-chain block2, exact canonical SHA-256/payload/event/registry match and a retained Verified observation. Do not register it again.

The SHP08 fictional delivery PDF `cd4d11da-ce79-44d7-be52-0ad59cf191d5` is complete: human-confirmed transaction `0xbf88a8ca77667eccbc17898e3fb913bbd335543a2899de8cb56239cdbb5d68bf`, current-chain block 3 and a fresh retained Verified observation. Do not register it again. Its expired original request `ba85d44e-c19e-45ba-8174-33572113a0ee` was preserved and terminally cancelled after the user confirmed no pending wallet popup and repeated process/chain/event/nonce checks proved no broadcast. The normal Check registration action resolved Cancelled before fresh request `0b666b70-e499-407c-a3c7-b52d4c7f6f59` was created and human-confirmed. The browser's 35-second wallet wait expired; the same request was recovered successfully without another signature.

Both transactions must use imported local development account `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, **IILAS Local Demo / chain 31337**, registry `0x5FbDB2315678afecb367f032d93F642f64180aa3`, and **0 ETH plus fake local test gas**. Stop if the network or registry differs. No real funds are required. Keep passwords and keys out of chat.

The user reported that the hosted verification page was hard to read. The focused correction is now deployed, with purple registration, outlined checking, blue recovery controls, labelled status colours and collapsed technical details. Actual hosted checks at 390/600/1440px confirm no panel overflow, readable status rows and 48px action buttons. The fixture preview remains fictional and separate; use the hosted website for the demonstration. Build/overlay types, exact overlay lint, scoped root lint, privacy/history scans, 31 integrity tests and both original sequential Firebase regressions pass.

## Demonstration order

1. Dashboard and products: filter the supervisor pack and show ordinary, low-stock and zero-stock examples.
2. Stock AI: show the retained thermal-label result and clearly explain its simulated factual context.
3. Purchasing: use a fictional order and the separate Manager login; explain approval, issue and partial/full receipt. Issuing an order alone must not increase stock.
4. Warehouse and logistics: show Picking, Packed, Prepared, In Transit and Delivered examples and their handover locks.
5. Delivery AI and rules: show the retained SHP07 Low model result and the separate rule assessment.
6. Proof and blockchain: open the marked fictional SHP08 PDF and, after the two wallet checks pass, show its current-chain Verified result alongside the receipt workflow.

Use the [test-pack guide](SUPERVISOR_TEST_DATA_2026-11-01.md) and [manual test checklist](MANUAL_APP_TEST_GUIDE_2026-10-29.md). Record expected/actual balances before performing a new receipt. The supervisor pack is retained; do not rerun the seed script or delete records by substring.

## Operator handover

The current private runtime pointer is `outputs/spark-msi-demo-20261028/cloud-runtime-after-supervisor-workflow-20261101.private.json`. It retains the unchanged current preparation/owners and current stock wrapper, plus the focused Hosting manifest, both wallet receipts and the workflow rehearsal backup. Latest evidence is in `outputs/spark-msi-demo-20261028/supervisor-rehearsal-20261101/`; the earlier Hosting evidence remains in `reporting-ui-live-20261101/`. Historical pointers and failed observations are retained.

The live frontend was built over the pinned main source with only the reviewed component and scoped CSS overrides from `.worktrees/mobile-driver-usability`; it is not the entire worktree. Keep this exact release manifest when reproducing the website. Do not overwrite active pinned main source just to mirror the deployed presentation; source consolidation requires a coordinated future runtime rebind.

The stock service credential was rotated after a diagnostic exposed the previous local service token. Revocation is verified; user passwords and Firebase credentials are unchanged. For this cloud binding, use the current pointer's **launch-current-stock.mjs** when a verified restart is needed, not the historical StockResearch launcher with its old token. The delivery launcher retains its unchanged profile; the API uses the preparation named in the current pointer. Neither service needs restarting while healthy.

Do not blindly restart Hardhat: a fresh process loses its in-memory registry history and requires a newly verified generation/process binding. Do not kill all Node/Python processes, delete an unknown evidence-store lock, open private model/RPC ports publicly or import emulator data into cloud. The chain and model ports remain loopback-only; only the existing authenticated API is tunneled. This release changed Hosting only; rules, indexes, backend, IAM/services, public origins, billing and Git publication were unchanged.
