# Durable MSI demo launcher

User authorisation: fix one-click startup after restarting MSI, preserve blockchain history and existing data; no Firebase deployment; parcel and phone trials deferred. Existing delegation of implementation choices and Native execution applies.

## Decision

Keep Hardhat 2.29.1, the existing registry, chain 31337, Firebase Spark configuration and all frozen models. Put a small loopback JSON-RPC server around an in-process Hardhat provider and retain an fsynced, hash-linked write-ahead journal outside Git/OneDrive. Persist each signed transaction and its deterministic mining timestamp before forwarding; preserve its resulting block and receipt before acknowledging. Replay on startup and compare every saved block/receipt, genesis, deployment and runtime bytecode. Refuse corruption or an unexplained competing listener. No reset, fresh registry or automatic business signing.

Alternatives considered: a new empty chain at each boot would lose verification continuity; a different chain database would replace the report's Hardhat stack. The selected journal keeps the current implementation and gives deterministic restart recovery. This is an agent implementation choice under the user's delegated preference.

## Existing stopped generation

The current saved generation has one registry deployment and no business broadcasts. Isolated reconstruction matched the saved genesis, signed deployment transaction hash and deployment block hash using the original fixed initial date and deployment timestamp. Bootstrap durability from those exact bytes, never by silently redeploying a different registry. Older generations already classified as historical stay historical; this change cannot invent their missing signatures.

## Durability contract

- Only loopback RPC; no chain RPC through ngrok. Existing MetaMask URL stays http://127.0.0.1:8545.
- Expose bounded read RPCs plus signed raw transactions. Block reset, impersonation, state edits, mining controls and unlocked transaction submission from clients.
- Serialize requests that can affect chain state; use deterministic block timestamps. Persist signed intent before mining and result before success. A durable intent left by a crash is replayed once; duplicates return the same transaction hash. Malformed or invalid nonce/signature transactions must not poison the log.
- Immutable numbered intent/result records with content hashes; append-only, bounded sizes, no secret output. Preserve incomplete writes for diagnosis; do not discard acknowledged history.
- Hold exclusive ownership, identify processes by PID plus creation ticks, tolerate PID reuse only with corroboration, never kill unrelated processes. Recover interrupted launcher locks conservatively.
- Verify and back up all proof files before reclaiming an exact dead backend lock. Validate committed proof objects before starting the backend, because its own audit can quarantine invalid objects.
- After replay, retain the chain binding/deployment generation, profile/tokens, source/artifact pins, evidence root, wallet receipt list and acceptance flags. Update only process identity, regenerated local activation/preparation/ngrok hashes and Desktop binding atomically.
- Keep RAM floors, source/model checks, website origin and ngrok credential handling unchanged.

## Verification

Isolated real Hardhat tests register synthetic hashes, abruptly terminate and restart the worker, then compare transaction hashes, block hashes, events, lookups and receipts. Cover a crash after durable intent, duplicate submissions, corrupt/truncated records, forbidden RPC, stale/live/PID-reused ownership and changed binding/proof files. Verify actual MSI services through the same Desktop command, stop/restart only this fix's owned workers as a cold-start rehearsal, and compare all existing proof bytes. A physical Windows reboot remains a user action; do not reboot MSI automatically.
