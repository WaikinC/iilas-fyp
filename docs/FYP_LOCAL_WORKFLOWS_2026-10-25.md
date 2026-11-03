# Local FYP workflow contracts

This document describes the approved local demonstration implementation. It supplements the existing account, stock, procurement and Prepared-Shipment contracts. It does not approve production deployment or replace the original reports.

## Integrity registration and review

An Admin or Manager selects an eligible committed inventory movement or registered delivery evidence in Reporting & Verification. Preparation derives its canonical source and SHA-256 digest on the server. The wallet must use the pinned local Hardhat chain 31337 and registry. Only an opaque reference and digest are registered; operational fields and files remain in Firebase. Existing canonical formats and Solidity code are unchanged.

The browser retains the original operation before signing and retains a returned transaction hash before asking the server to register the outcome. Retry and Check outcome recover that same operation. Never request another signature merely because a response was lost. An unresolved signing claim remains Pending and may require reconciliation, even after its observation window expires.

Checks retain a separate immutable Verified, Unmatched, NotRegistered or Unavailable observation. Delivery checks also hash the original bounded Storage file. An unavailable file or chain cannot be presented as a match. A mismatch establishes a difference from registered bytes, not fraud or the truth of the original record. A different Admin or Manager can acknowledge or request follow-up with notes. Review revisions do not rewrite the source, original digest or chain registration.

## Fleet and transport

Fleet Management has bounded vehicle and driver lists, effective assignment information and versioned edit dialogs. Unknown assignment availability disables unsafe edits. The local trusted assignment read accepts at most twenty known resources, checks their scope and current staff authority, and reads their optional locks without granting new direct Firestore rights.

Before dispatch, an explicit transport edit atomically validates the shipment, plan version, capacity, current driver account and both old and proposed locks. Occupied resources, stale versions and a concurrent dispatch refuse without partially releasing an assignment. Dispatched assignments remain protected.

The planning map accepts explicit waypoints and a planning speed from 5 to 120 km/h. Great-circle distance uses a 6371.0088 km Earth radius. Staff deliberately apply the resulting distance and duration estimates to the form; manual operational values remain available. These are planning estimates, not road routes, traffic ETA or optimisation. No address is sent to a geocoder.

## Customer isolation

Customer is separate from the seven internal staff roles. An Admin approves the account. Staff with grant authority must know its UID and explicitly grant a particular shipment; email and recipient text never create access automatically. Customer sessions mount a separate portal and never mount staff operational subscriptions.

The server returns at most twenty granted shipment summaries with a limited event timeline. Internal inventory, prices, staff identities, AI results and audit data are excluded. Latest submitted location is opt-in per grant, off by default, and available only while delivery is active. It is not continuous tracking.

Only the current matching delivery-stage Proof of Delivery can be downloaded. The separate endpoint requires a bearer header and rechecks current Auth, profile, grant and proof. It verifies and buffers at most 10 MiB within the time limit before a final authority check. Responses are private and no-store; no token-bearing URL or public link is issued. Revocation refuses later requests but cannot recall a file already downloaded.

## Reports and catalogue filters

Report queries derive role and shared scope on the server. Drivers see assigned records; Customers cannot use staff reports. Filters and returned columns are allowlisted. Defaults include undated legacy records in stable document order. Date filters use Malaysia time, paired dates and a maximum 366-day range; undated records are excluded explicitly.

A page returns up to twenty rows within 200 scanned candidates and 1000 document reads. A sparse empty page can still have a continuation. Selected-data CSV export is complete or refused within 2000 candidates/rows, 10000 reads, 2 MiB and fifteen seconds. Page export describes only that page. Formula prefixes, quotes and newlines are escaped. Report response validation permits the bounded read payload without widening mutation-intent limits.

Research and integrity action candidates/history also use twenty-record pages. File comparison requires selecting one ready evidence record; it never interprets an unmatched current page as a system-wide mismatch. Some older pagers still say Newer/Older although their order is by document ID; do not infer chronology from those labels.

## Recovery and compatibility

New writes use actor/scope/tab/action-bound UUID operations with private immutable receipts and a 35-second observation window. A timeout is an unknown result until resolved. Role changes can prevent a new action while allowing the original approved actor to recover its exact terminal outcome. Client-supplied IDs, roles, digests or scores do not replace trusted facts.

The selected initial Admin, current IDs and balances, shared staff system, navy/purple dashboard and Prepared-Shipment Handover remain in place. Demo AI is advisory and explicitly experimental. Parcel testing is excluded from this completion work.
