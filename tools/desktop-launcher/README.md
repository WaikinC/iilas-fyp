# MSI one-click demo launcher

Double-click **Start IILAS Demo** on MSI's Desktop after signing into Windows and connecting to the internet. Wait for all five **READY** lines and **SERVICES CONNECTED**. The website then opens. Keep MSI awake, plugged in and online while using the remote website. Closing the launcher console leaves the services running.

The launcher restores the same Hardhat chain from a private disk journal after process loss. It saves signed transactions before execution, keeps compact exact block/receipt digests and checks a separate high-water marker against rollback. A signed intent saved just before a crash is recovered once. It never invents another registry or resets the chain. MetaMask still uses http://127.0.0.1:8545, chain31337. Human confirmation remains necessary for new business signatures.

The stopped 3November generation is reconstructed with identical genesis, deployment transaction and deployment block. Older generations already recorded as historical remain historical; this launcher cannot invent their missing signatures. Its journal and proof backups live in restricted local storage outside OneDrive/Git. Keep that directory and the current ignored Desktop binding; do not replace a journal with an older backup or start an unrelated Hardhat process on8545.

OS-owned mutexes prevent simultaneous launch/recovery. PID and creation-time checks protect unrelated processes. After exact replay, only local process identity and prepared activation hashes change. Source/artifact pins, frozen models, tokens, evidence roots, chain generation and wallet history flags remain unchanged. An exact dead proof-store lock is archived only after read-only proof validation and a verified backup. A still-running owned backend may briefly restart to reconnect to a restored chain.

All existing model RAM floors and resource checks remain. Startup checks do not measure AI accuracy or replace workflow/wallet acceptance. Firebase deployment, cloud business writes, billing changes, parcel trials and physical phone tests are outside this launcher. No automatic Windows-login startup is installed.

Check only without starting services:

    "C:\Program Files\nodejs\node.exe" demo-launcher\start-demo.mjs --check-only --no-open

If it reports Needs attention, retain the private logs and stop repeated retries. Missing/corrupt data or changed sources fail safely rather than discarding history. Implementation source and isolated tests are in the application's development checkout under tools/desktop-launcher. No persistent PowerShell execution-policy change is required.
