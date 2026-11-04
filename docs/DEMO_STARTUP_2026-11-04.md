# Start IILAS after restarting MSI

1. Sign into Windows on MSI and connect to the internet. Keep MSI plugged in.
2. Double-click **Start IILAS Demo** on the Desktop once.
3. Leave the console open while it restores the saved blockchain and starts the services. Wait for **READY** beside Blockchain, Inventory AI, Delivery AI, Application backend and Website connection, followed by **SERVICES CONNECTED**.
4. Use the website that opens: https://fyp-inventory-and-logistics.web.app/. Your original laptop can use that same website while MSI stays awake and online.
5. When signing a new hash, unlock MetaMask yourself on MSI, select IILAS Local Demo (31337), and use the imported local test account. New wallet confirmations remain manual.

Closing the launcher console leaves the services running. There is no need to start separate terminal commands for AI or blockchain. If a second launcher reports another startup is running, leave the first one to finish.

## What survives a restart

The same Hardhat registry, chain generation, transaction/block hashes, registered digests and receipts are rebuilt from a private durable journal. Signed transactions are written before execution; exact block/receipt digests and a separate high-water marker are saved before success. Repeated signed submissions do not create duplicate transactions. Unsupported reset/mining/state-edit RPCs are refused.

The restricted state folder is `C:\Users\Home\IILAS-demo-runtime`, outside OneDrive and Git. Do not delete it or restore only part of an older backup. Existing proof files remain in the configured application store, with verified private backups before recovery. Only confirmed-dead ownership is archived. Model/source checks and the 3 GiB model admission floor remain active.

If the launcher reports Needs attention, keep the logs and ask for the specific failed service to be checked. Do not run a separate empty Hardhat node or repeatedly press Register in the app. A corrupt or missing history fails safely.

## Verified on 4 November 2026

- 45 focused launcher/recovery tests, including a real worker forcibly stopped and reopened with identical registration receipts, block hashes, events and lookups.
- Current stopped registry recovered with identical genesis, deployment transaction and deployment block; no new chain generation.
- All five actual MSI services stopped under exact ownership checks, then restarted through the real Desktop command wrapper. All five Ready; public authenticated API health and hosted website reachable.
- All 25 existing non-lock proof-store files, 856 runtime source pins and 11 frozen artifacts preserved. No cloud business writes, Firebase deployment, billing changes or new business signatures.
- Application build, launcher lint and secret checks passed. Existing large-bundle build advisory remains.

An actual Windows reboot was not initiated automatically; the full local service stop/start rehearsal passed. Older chain generations already lost before this fix remain historical. This update preserves the reconstructed current generation and subsequent journaled transactions; it cannot invent missing old signatures. Current human wallet acceptance remains pending as it was before this change. Parcel/camera and physical phone tests stay deferred. The newer module URL interface is still held from Firebase publication until after the supervisor session.
