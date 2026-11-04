# Durable demo launcher implementation plan

> **For agentic workers:** Use superpowers:executing-plans (Native). Follow each task's RED/GREEN checks and record progress in the ignored ledger.

**Goal:** One-click MSI startup restores the same journaled blockchain and existing application services.

**Architecture:** A durable loopback Hardhat worker writes signed intents before execution and verifies exact replay. The outer launcher safely recovers ownership and refreshes only local process-bound preparations.

**Tech Stack:** Node 22, installed Hardhat 2.29.1/ethers, current Python services, PowerShell process observation.

**Spec:** ../specs/2026-11-04-durable-demo-launcher-design.md

## Global constraints

- No Firebase deployment/cloud business writes; no parcel or phone tests; preserve all existing data and main app source pins.
- Durable state and backups outside OneDrive/Git; no private values printed.
- Keep Hardhat/registry/chain 31337 and existing MetaMask URL; no automatic business signatures.

## Review focus

Interrupted disk writes, accepted intent before mining, invalid transaction poisoning, duplicate launch/transaction races, and PID reuse must fail safely or recover exactly. Replay must retain full chain and receipt hashes. A head missing from the saved history must never be silently accepted.

### Task 1: Journal and real provider recovery

Files: tools/desktop-launcher/durable-chain.mjs, durable-chain.test.mjs, chain-worker.mjs, hardhat-provider.mjs.

- [x] Add failing real-provider tests for receipt/event/block continuity after a second provider starts from disk, duplicate signed transaction and interrupted intent.
- [x] Implement `createDurableChain({provider, directory, manifest, clock})` with `request`, `verify`, `close` and a separately created provider; persist intent/result before success.
- [x] Add corruption, mutation-RPC and invalid-transaction tests; run the complete launcher suite.

### Task 2: Safe ownership and process-bound preparation

Files: tools/desktop-launcher/restart-state.mjs, restart-state.test.mjs, reconnect.mjs.

- [x] Add failing filesystem tests for exact dead lock archival, live owner refusal, PID reuse, lock/binding races and changed proof objects.
- [x] Implement atomic file publication, proof-tree backup/validation, ownership sidecars and exact rebind preserving all immutable fields.
- [x] Test preservation and original launcher guards together.

### Task 3: One-click integration and bootstrap

Files: tools/desktop-launcher/start-demo.mjs, startup.mjs, README.md; private migration script/output excluded from Git.

- [x] Add startup tests for missing durable chain recovery and blocked mismatches; preserve check-only mode.
- [x] Integrate exclusive launcher ownership, durable worker startup, exact rebind/dead proof-lock recovery and sequential service startup.
- [x] Back up current launcher/binding/proofs; reconstruct the exact stopped deployment into a private journal; compare every saved identity before activation.

### Task 4: Cold-start rehearsal and handover

Files: docs/DEMO_STARTUP_2026-11-04.md; outer launcher installation; MSI_SETUP_STATUS.md and latest CHAT_HANDOVER.md sections.

- [x] Run real worker crash/restart tests, complete focused launcher tests and independent source review.
- [x] Install verified outer files, run actual Desktop wrapper, compare source/model/proof/history pins, rehearse restart of only owned local services, then repeat one-click readiness.
- [x] Record exact tested limits and user reboot instructions. Do not deploy Firebase or run deferred trials.
