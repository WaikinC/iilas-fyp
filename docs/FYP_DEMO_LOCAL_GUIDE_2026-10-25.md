# MSI local demonstration and recovery guide

Keep the full workspace together. The executable Git checkout is `iilas-fyp`; `fyp-cwk-2` contains the reports and saved skills. The saved Codex project named **fyp cwk 2** already points to the full outer workspace. Run Git and npm only in the application child folder.

## Current startup boundary

Dot-source `Enter-IILAS.ps1` from the outer folder. It selects Node 22 and JDK 21 on MSI. Use the research Python environment documented in AGENTS.md. Open the application only at `http://127.0.0.1:5173` or `http://localhost:5173`; LAN/hostname access chooses different Firebase endpoints.

The current completion profile and newest preserved import are recorded in ignored `outputs/fyp-completion-20261025/cycle-02/completion-profile.json` and `fresh-export-receipt.json`. The private profile itself contains local credentials: do not display, copy into chat or commit it. Launch each service from a separate terminal using `node scripts/prepare-fyp-completion-local.mjs launch --profile <private-profile-path> --role Backend --import <verified-checkpoint-path>`. Use `StockResearch` and `DeliveryResearch` roles separately, without `--import`. The composer validates source, frozen artefact and local chain bindings before launch. Start the app with the root `Start-IILAS.ps1 -Service App` only if 5173 is free.

Do not start the generic emulator wrapper over the running completion stack. Check loopback listeners first. Required ports are 5173, 5001, 8081, 9099, 9199, 8001, 8002 and 8545. Parcel service 8000 is intentionally paused. Preserve native RAM/time/disk guards. Close unused applications rather than reducing model resource limits. OneDrive was temporarily quit with the user's participation for these tests; reopen it after heavy local work if desired.

The Hardhat chain has no real assets and loses state on restart. Keep its private node log private because Hardhat prints disposable test keys. Do not restart or redeploy while registrations are pending. If the chain is lost, retain historical Firebase registrations, treat current verification as unavailable/not registered as appropriate, and create a fresh explicit local deployment/profile. Never silently bind an old record to another chain or overwrite an old profile.

## Demonstration sequence

1. Sign in as approved staff and show the shared dashboard, product identifiers and stock balances.
2. Analyse a selected demo product with explicitly fictional context. Show the independent rule assessment and model provenance. Have a different Admin/Manager review the demo risk requirement.
3. Explicitly prepare a linked purchase order, approve independently, issue it, and record partial then final receipt. Explain each balance change and retained lineage.
4. Create a disposable shipment, complete picking/packing/handover, assign active vehicle and driver, review manual/map estimates, and dispatch once. Show that reassignment is blocked after dispatch.
5. On an assigned delivery, run the experimental risk assessment and inspect separate rules. Use an ordinary proof PDF to complete the proof workflow without parcel testing.
6. In Reporting & Verification, select an eligible movement or ordinary proof, register its hash with the local wallet, and retain a new check. A different reviewer handles any exception without editing the original.
7. Grant an approved Customer explicit access to this shipment. Show the separate portal, current proof download and opt-in latest point, then revoke access and verify a fresh request refuses.
8. Run a filtered report, export its labelled page and explain the full-export refusal cap. Use desktop and narrow layouts.

Use anonymous test records; do not expose passwords, private profiles, addresses from research images or datasets in screenshots. Automated scenarios use disposable actors and clean only their attributed additions. They do not supply persistent demonstration accounts or change the initial Admin's balances.

## Role responsibilities

Admin approves accounts and protects the shared setup. Manager independently reviews purchases, risks and integrity exceptions. Inventory maintains products and purchasing; Warehouse handles picking, packing and receipts. Logistics manages fleet, transport, dispatch and explicit Customer grants. Drivers update assigned deliveries, submit deliberate latest locations and evidence. Viewer reads permitted operational data. Customer sees only explicitly granted shipment projections and its current permitted proof.

## Recovery and troubleshooting

If a response is lost, use Retry saved operation or Check outcome before creating another request. Keep the original browser tab/session intent. An unknown wallet acknowledgement must be reconciled before another signature. A role change can refuse a fresh action while preserving recovery of an exact prior result.

If a service refuses source bindings, prepare new serving-only metadata using the approved setup scripts; do not change a consumed experiment or lower its guards. If RAM is insufficient, leave the failed receipt and free memory before retrying. If a port is occupied, identify its process and command line; never kill arbitrary Node or Java processes.

Before stopping a live stack, capture current full state and request a fresh official export. Windows can fail the final staging rename with EPERM. Retain the staging folder, verify every expected file and hash, copy exclusively to a new checkpoint, then prove the post-import state matches. Never import an older snapshot over newer data.

## Connect from the original laptop

Use Codex Remote Connections if available for the same signed-in account/workspace. On MSI, open Settings → Connections → Control this Mac or PC and complete setup. On the original laptop, use Control other devices and select MSI. Keep MSI awake, online and Codex running; availability can differ by account/rollout. Follow the [official remote connection guide](https://learn.chatgpt.com/docs/remote-connections).

Remote Codex control lets MSI execute work. It does not automatically make MSI's loopback web app reachable in the other laptop's browser or forward that laptop's camera. For this demonstration, use MSI's local browser or a deliberately configured private desktop connection. Do not open Firebase emulators, the model endpoints or wallet RPC to the public internet. A separate laptop clone can develop other modules, but keep datasets, model artefacts, credentials and emulator exports local, and coordinate source changes before refreshing serving bindings.
