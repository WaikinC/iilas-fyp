# Spark + MSI local acceptance — 28 October 2026

The approved local Tasks1–9 are complete. The actual application runs on MSI at `http://127.0.0.1:5173` with one Firebase emulator stack and the authenticated MSI backend. The hosted release and real cloud connection are still pending; the currently prepared Hosting package is a loopback test fixture, not a connected cloud deployment.

| Verification | Observed result |
|---|---|
| Focused Spark contracts/HTTP/files/recovery |53/53 |
| Existing hybrid/integrity compatibility |82/82 |
| Original Firebase suites and affected gates |8original suites;19aggregate gates pass |
| Baseline application workflows |53cases:27broader,11stock,5purchasing-browser,10delivery |
| Actual MSI-route model workflows |Stock11,purchasing-browser5,delivery10; saved/native predictions agree |
| Final new API/browser/proof-chain cases |18/18; desktop1440/narrow390, expired/stale recovery and exact cleanup |
| Android local/cloud test flavours |59tests each; both debug builds pass |
| Final APK privacy |573/569entries checked; no recognised live keys/private credentials/datasets/SQLite |
| Web/static bundle |Build passes;18-file immutable fixture preserves backed-up field settings |
| Lint/secrets/history |0errors,6existing lint warnings; all scans pass including untracked source |
| Preservation |1665documents,116accounts,2original Storage objects; frozen11files;21generated copies; original portfolios/23skills/config protected |
| Recovery evidence |Fresh11-file checkpoint and43-file private immutable-proof backup, hash verified; restore rehearsal remains pending |

The independent gpt-6-astra review found two Important issues and two Minor issues. Capacity concurrency was regraded Important because it could bypass the promised resource limits. All three Important issues were fixed in one RED→GREEN pass: authoritative expired/stale proof reconciliation before replacement, permission checks after all file I/O, and atomic cross-path capacity accounting. No second reviewer was dispatched. The remaining unused cleanup helper is documented below and stays unwired.

Private certificate and current owner/profile/checkpoint pointers: `outputs/spark-msi-demo-20261028/final-local-verification.json` and `runtime-final.private.json`. Do not display their referenced private profiles. Original cloud128documents/3accounts and backups remain separate from local test data; no cloud resource, IAM, credential, billing, Hosting, rules, index or business-data change occurred. No code was staged/committed/pushed. Raw Git index and HEAD are unchanged; the exact baseline/final snapshots remain available for review/rollback.

## Remaining demonstration work

Follow the [Hosting-first activation review](SPARK_MSI_ACTIVATION_REVIEW_2026-10-28.md) for the existing Firebase website. Real activation still needs a fresh cloud preflight/backup, exact reviewed private identity/credential and MSI HTTPS address, production launch/deployment wiring, separately approved publication/bootstrap/test actions, and remote-laptop acceptance. Billing stays disabled. Firebase Hosting serves the website; the full connected app depends on MSI being awake and online. The user deferred ngrok setup. Current fixtures must not be published as a working cloud app.

Physical Android/Firebase/GPS/background/offline trials and parcel camera testing remain deferred. Frozen model scores remain synthetic-policy prototype evidence, not independent real-world accuracy. The private backup does not establish tested restore or Windows power-loss durability. See the [operations guide](SPARK_MSI_DEMO_GUIDE_2026-10-28.md) for paired startup, preserved pending work and coordinated backups.

## Rulings I made

- Ruling: Preserve the approved existing dirty checkout and Git index; use source snapshots instead of commits/worktrees — the full running workspace and private data must stay together and Git changes were excluded — rollback depends on preserved snapshots.
- Ruling: Git Bash helper execution is unavailable (MSYS named-object access denied); equivalent task briefs/baselines/results are written with native Python in this plan-only workspace — avoids unnecessary escalation and does not change product requirements — helper bookkeeping parity is verified manually.
- Task2: Ruling: Loopback HTTP tests require sandbox escalation on MSI (EACCES); the same unchanged tests pass with scoped permission — this is test-host access, no public endpoint or cloud credential — running without that permission cannot prove HTTP behavior.
- Task4: Ruling: Native preparations have no expiry in the existing protocol; their immutable-file manifest uses Number.MAX_SAFE_INTEGER until explicit invalidation, preserving offline queue behavior — introducing a30minute proof expiry would reject valid old pending uploads — quota may require manual reconciliation of abandoned native preparations.
- Ruling: The local Hardhat process is absent; start a new loopback demonstration chain and deploy a fresh disposable local contract, with a new deployment generation/process identity — no cloud or business signing is involved, and existing verification rows are retained as historical — old chain observations cannot be represented as current.
- Ruling: Executable/configuration pins exclude human Markdown/text/report documents; those retain separate preservation hashes — editing an operating guide must not disable a working backend — missed executable content disguised as prose would require a separate review, and no such runtime imports exist.
- Ruling: Task8 prepares/tests the closed deployment executor with injected observers; its CLI intentionally refuses real execute until Task10 connects approved live preflight/identity/HTTPS actions — local approval does not authorise publication — a prematurely asserted deployment-ready state would be false; all current stages remain fixtureOnly.
- Task9: Ruling: Original browser lost-reply harness reads the legacy Functions envelope/raw storage key; adapt it to both command envelopes and the application recovery-storage adapter while preserving original IDs and all assertions — Spark intentionally isolates its recovery namespace — an incorrect adapter could miss a recovery defect, so actual browser/lost-reply assertions remain mandatory.
- Final: Ruling: Regrade concurrent quota admission/accounting from Minor to Important — ordinary concurrent uploads can bypass the advertised5GiB/1GiB resource boundary, explicitly required by this demo — leaving it unfixed would invalidate resource-limit claims.
- Final: Ruling: Actual credential/IAM/HTTPS/cloud cutover and remote acceptance remain outside this local review — separately gatedTask10 and billing prohibited — local success cannot prove a hosted demo.
- Final: Ruling: Physical Android/GPS/parcel trials and model accuracy remain outside these software changes — user deferred trials and froze research — hardware and real-world accuracy remain unvalidated.
- Final: Ruling: Exclude unrelated pre-existing dirty changes from this review — exact baseline snapshots isolate this task — prior work is not newly certified by this review.
- Final: Ruling: Update final guide/certificate after fix verification rather than treating drafts as final evidence — avoids premature completion claims — stale handover would mislead restart/deployment work.
- Final: Ruling: Windows power-loss durability is not established by process restart/fsync evidence — keep this as an explicit limitation — a machine/disk failure may require coordinated backup recovery.
- Final: Ruling: Recover the Windows CLI export move failure only by exclusively copying its single fresh official staging tree and verifying all11file hashes/account/object IDs — preserves the requested snapshot without overwrite — an unverified or ambiguous candidate would be unsafe to import and is refused.

## Deferred minors

- Final: minor (deferred): cleanupOwned has no production caller and needs a transactional registration fence before wiring or manual use; no deletion/auto-eviction route is enabled.

Automatic approval review rejected printing a private log tail because partial redaction could expose secrets. No such log was printed; fixed safe diagnostics and private receipts supplied the evidence instead.
