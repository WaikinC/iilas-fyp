# Automatic locked business codes — local acceptance

Approved design/plan: 2 November 2026. Verification continued on MSI on 3 November 2026. Native execution in the isolated `codex/automatic-business-codes` worktree; no commit, push or live activation.

## Staff behaviour

| Module/identity | Behaviour in the prepared update |
|---|---|
| Product SKU | Backend assigns `PRD-000001`; locked during editing. Manufacturer barcode remains a separate unique 8–14 digit scanned/entered field. |
| Shipment reference | Backend assigns `SHP-000001`; locked for draft and prepared edits. Warehouse, scheduling and dispatch locks stay authoritative. |
| Ordinary or stock-AI-linked purchase reference | One shared `PO-000001` sequence. Independent approval, corrections, issue and partial/full receipts retain the reference. |
| Supplier / vehicle / driver / movement / proof / account IDs | Internal database IDs were already automatic; retain them. Vehicle registration, driving licence, supplier delivery notes and physical stock references remain meaningful external inputs. |
| Transport / delivery | Retain the generated shipment reference and existing shipment-linked document identities. |
| Reports, customer views and CSV | Reuse actual stored codes; never infer them from list length or time. |

All sequences are scoped to the existing shared system, never reset by year and support 1–999,999. Deleting/archiving a business record does not reclaim its number or delete its assignment/creation receipt. No existing record is renumbered. Missing/corrupt policies, conflicting reservations or exhausted sequences refuse creation.

## Recovery and historical operations

One provider inside the approved-staff gate owns creation recovery for the header and forms. Each tab retains one pending creation per record kind, isolated by project/environment, scope and actor. Storage/readback and payload-size checks precede sending. Closing a form, navigation, a timeout or an unknown exception does not discard saved work. Check leaves NotFound work pending; server cancellation fences a delayed creation. A repeated UUID returns the original record/code, even after archival/deletion or a change to another approved role. Revoked/unapproved access is denied.

New stock-AI-linked Create requests use contractVersion 2 and contain no reference. Historical version 1 inputs, hashes, receipt shapes, actions, source fingerprints and provenance remain exact. A completed historical request replays; an unknown historical request can be cancelled/resolved but cannot create a new manual reference. A requirement already linked to an order returns that actual order/reference without consuming another number.

## Executed verification

| Check | Result |
|---|---|
| Focused numbering/creation/linked-purchasing/client tests | 85 passed, including final-review regressions |
| Presentation, shipment commands/dispatch and Reports presentation | 29 passed |
| Reports and Spark transport/scenario regression contracts | 47 passed |
| Sequential local suites | smoke-firestore, qa-review, shared-qa, account-access-qa, procurement-qa, stock-locations-qa, stock-retry-qa, record-creation-emulator-qa: all exit 0 |
| Purchasing regression | 111 assertions covering roles, independent approval, totals, concurrent actions, immutable histories and stock receipts |
| Actual new acceptance | Nine scenario groups; all passed; exact cleanup restored 723 pre-existing documents |
| Actual form/browser fixtures | Product create/lost-reply recovery; ordinary PO submit; shipment create; legacy read-only SKU copying/focus; shared consumers/account switch; no overflow at 320/390/768/1440 and 844×390 |
| Final dialog race fixtures | Deferred product-submit and deferred Check replies after opening another product: both second edits remain open and unchanged (RED→GREEN). |
| Standalone initializer | Fresh subprocess with a nonempty legacy baseline: correct maxima, exact legacy preservation, idempotent replay and rejection of six next/later orphan reservations before policy writes; exact fixture cleanup. |
| Build / lint | Passed; existing image lint warnings and unused temporary destructuring warnings remain; no lint errors. Build reports the existing large-chunk advisory. |
| Secret checks | Current files and Git history passed; rechecked before handoff |
| Main/runtime preservation | 792 source hashes, 11 frozen artifact hashes, current chain ID/genesis/Hardhat instance and unchanged release preparation verified |

The new emulator scenarios check parallel staff allocations, exact lost-response replay, changed input, barcode rejection with unchanged counter, role/scope/private-metadata denial, Check/Cancel race, legacy locking, deletion/archive replay, original-actor role change, both purchasing lifecycles and shipment pick→pack→handover→schedule→dispatch→In Transit. Baseline tests cover case/archived maxima, duplicate codes, 2,000 rows accepted and 2,001 refused. Unit transaction tests additionally exercise drift, collision, differing policies and exhaustion. No AI was called: linked purchasing used an explicitly fictional retained lineage fixture.

Evidence is retained privately in `.superpowers/sdd/2026-11-02-automatic-business-codes/`: RED/GREEN logs, source profiles, ordered suite receipt, acceptance/cleanup receipt, browser logs, preservation pins and final review. It is ignored by Git. No datasets, credentials or exports were copied into the worktree.

## Independent review and final fix pass

One fresh reviewer inspected the complete exact-baseline package. No Critical findings; six Important findings were accepted and fixed in a single pass:

| Finding | Fix and regression evidence |
|---|---|
| Named initializer app was unavailable to a bare default Firestore lookup | Pass the same Firestore instance through initialization/metadata reads. Actual standalone CLI failed before the fix and passes afterward. |
| A rebound Spark API address/instance hid saved creation | Creation alone uses a stable project/mode/actor namespace; existing recovery protocols retain their original binding. Lost-response tests recover the original ID/code after instance and HTTPS-origin changes, with scope/account/environment isolation. |
| Orphaned code reservations could leave initialization immediately blocked | Complete bounded private reservation projections, exact ownership/path checks, hashed foreign-PO verification and permanent-evidence checks refuse inconsistent initialization/bootstrap before writes. Next/later product/shipment/PO and overflow regressions passed. |
| Cloud first-Admin registration could initialize zero counters | Automatic zero initialization requires the exact disposable emulator tuple and local-demo mode. Mocked verified cloud Admin registration still succeeds without numbering writes. |
| A late product or Check response could close another product's unsaved edits | Dialog and recovery callback epochs fence disposed views. Both actual delayed-response browser orderings failed before their guards and pass afterward. |
| Linked-PO notices claimed a new submission for a reused Issued order | Format the returned reference/status/version. Unit/wiring checks and the actual reused-Issued emulator path verify accurate messages and no second allocation. |

Deferred Minor findings: a recovered “Created” notice does not separately report present record availability; the MSI HTTP boundary uses generic wording for the rare exhausted-sequence error; multiple pending recovery panels share generic visible action names. These do not change numbering/transaction correctness, but remain UI/error polish before a broader release claim.

## Rulings and trade-offs

1. Used Git's worktree fallback after the native worktree API rejected the outer non-Git workspace. Cost if wrong: accidental live edits; mitigated by 792 unchanged main-source pins.
2. Kept the branch and ignored evidence uncommitted, as the approved plan requires. Cost: local changes need preserving until a later approved integration/publication; no destructive cleanup was performed.
3. Copied only the ten hash-verified accepted Reports QA inputs absent from the runtime projection. Cost: this is bounded regression coverage, not a claim that every historical script was run.
4. Added a space to local Task headings for the skill brief parser. Formatting only; the approved main plan remains unchanged.
5. Retained the catalogue canonical image limit while enforcing the existing HTTP command cap before browser persistence/send. Cost: a large product image needs reducing before creation; no oversized request is silently sent.
6. Made saved PO input validation calendar-independent; new submissions still use the authoritative current-date policy. Cost if wrong: recovery could be blocked at midnight; specific old-request tests cover it.
7. Used a typed 2 MiB baseline projection and immutable initialization floor rather than the smaller generic operation budget. Cost: oversized/incomplete baselines refuse initialization instead of being sampled.
8. Migrated historical QA via explicit fixture-creation calls, preserving intentional manual-route rejection and action/history/accounting checks. Cost: old manual-create race assertions now describe the replacement automatic protocol, not the removed manual route.
9. Used fictional retained AI lineage and exact emulator-only fixture rollback, including the three test-mutated counters. Cost: these establish software correctness only, not scientific model accuracy or physical-device behaviour.
10. Prepared an uncommitted exact-baseline change package when the review helper refused an empty commit range. Cost: review depends on the verified file manifest rather than committed diff provenance.
11. The reviewer declined live activation/IAM/billing/publication and physical phone/parcel/model execution because they are explicitly excluded. They remain pending; the cloud-bootstrap source finding was still fixed locally.
12. The reservation reconciliation pass projects at most 10,000 entries per private key collection with lookahead and refuses unresolved ownership, including foreign hashed PO claims. Cost: a larger or inconsistent legacy key store requires a separate reconciliation; no claims are silently repaired or deleted.

## Verification limits and decisions

- Physical phone and parcel/camera tests remain deferred. No model was retrained or evaluated.
- Model-dependent historical suites were updated where they create records and syntax/contract checked; they were not represented as new model-inference passes. Large fleet/completion/capacity suites outside the approved ordered runner were not executed.
- Existing manual-reference race tests now explicitly verify rejection of that old route and separate intentional creations receiving distinct generated codes. Existing PO action/legacy-reference checks remain.
- The disposable acceptance test restores only registered new fixture documents/users and the exact three test-mutated counters after proving other pre-existing documents unchanged. This is test-fixture rollback; the application has no counter decrement/reset route.
- Product canonicalization retains the existing image limit, while the browser refuses an actual command above the existing HTTP limit before persisting/sending. No placeholder code is persisted. The initializer uses a bounded typed metadata digest to support the approved 2,000 rows per kind.
- The initializer CLI supports explicit loopback only. No live initializer was run or silently added. Cloud activation needs its own reviewed exact baseline/action package.

## Future live activation checklist — not performed

1. Refresh and verify a private cloud backup; close old app sessions for cutover.
2. Read all scoped product/shipment/PO code/version projections, including archived/all statuses, with 2,001 lookahead, plus the bounded complete private-key reservation reconciliation. Refuse incomplete coverage, duplicates, conflicting/unowned/orphaned claims or changed observations. Review maxima and the exact initialization digest.
3. Obtain explicit approval for that exact live counter/settings initialization and reviewed cloud actions. Reobserve/compare before committing; preserve any existing policy and advanced counters.
4. Build one coordinated trusted backend, UI and private-deny rules package. Review future cloud fixture ownership/retention for new receipt/assignment/counter collections. Refresh scientific serving source bindings without changing any frozen model, dataset, evaluation or scientific metadata hash.
5. Review/update MSI API, Desktop launcher and tunnel bindings plus fallback/rollback instructions. Preserve the current local chain and existing wallet registrations/proof root; never reset Hardhat as part of this release.
6. Review the exact deployment subject and obtain the separately required live cutover approval. Keep billing disabled. Test fictional live creation/recovery and stock/handover/receipt accounting only within that approved scope.

The hosted website continues using its existing release until this coordinated activation. Existing hosted codes and records are untouched.
