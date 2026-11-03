# Report requirement and evidence matrix

The requirement groups below follow the two original portfolios as reconciled in [full scope traceability](../FULL_SCOPE_TRACEABILITY.md). Every report FR is covered by a listed range. Grouping does not invent more precise original FR wording. Current runtime results are recorded separately in the completion audit; a test filename alone is not evidence of a passing run.

| Report and FRs | Implemented boundary | Verification sources | Remaining qualification |
|---|---|---|---|
| Both FR 1–3 | Shared approved staff accounts, protected initial Admin, explicit Customer role and isolated portal | account-access-qa; customer-access-foundation-qa; actual Customer scenarios | Account approvals are deliberate Admin actions |
| Wong FR 4–6 | Product validation, unique identifiers, lifecycle and exact identifier/status/category filtering | smoke-firestore; qa-review; catalogue-filter-qa; actual browser report/catalogue scenario | Existing product images remain prototype storage |
| Wong FR 7–13 | Stock balances/reservations, rule assessment, RF14 demo analysis, independent review, demo alert/reorder lineage | stock-retry-qa; stock-locations-qa; inventory-demo-procurement-emulator-qa and browser-qa | 81.53% measures synthetic-policy agreement; no independent warehouse accuracy |
| Wong FR 14–20 | Stock movements/locations/corrections, picking/packing and Prepared-Shipment Handover | shared-qa; stock-locations-qa; capacity-qa; actual dispatch race | No automatic merge of other personal inventory |
| Wong FR 21–27 | Supplier/purchase workflow, independent approval, expected incoming stock, partial/full receipts | procurement-qa; inventory-demo-procurement-emulator-qa and browser-qa | No supplier message or automatic AI approval |
| Wong FR 28–31 | Role controls, correction/review history, operational reporting and audit | account-access-qa; reporting-foundation-qa; reporting-emulator-qa | Bounded page/export coverage, not unlimited analytics |
| Wong FR 32–37 | Inventory canonical hash, local registration, retained integrity checks and independent exception review | integrity-workflow-foundation-qa; original Solidity tests; actual chain/browser scenarios | Real MetaMask participant acceptance remains separate |
| Choong FR 4 | Draft/Prepared/Dispatched shipment data, capacity and assigned resources | shared-qa; capacity-qa; fleet-transport-emulator-qa | Route estimates are not road optimisation |
| Choong FR 5 | Controlled status transitions, events and required proof | shared-qa; actual delivery closure scenario | Real business delivery performance is unvalidated |
| Choong FR 6 | Explicit browser geolocation and latest submitted map point | delivery software scenarios and actual app controlled GPS tests | Physical device/permission acceptance needs participation |
| Choong FR 7 | Stage-linked evidence; current proof-only Customer download | existing evidence contract; customer-access-emulator-qa | Parcel photo/camera testing paused by user |
| Choong FR 8 | Frozen three-class delivery RF and independent manager review | delivery-demo-emulator-qa | 98.33% synthetic-policy agreement, not real forecasting accuracy |
| Choong FR 9 | Separate explicit abnormal-delivery rules | delivery-demo-emulator-qa; prior delivery study receipts | First-failure Medium policy case predicted High remains disclosed |
| Choong FR 10–11 | Existing photo and sampled-camera integration and retained experimental review | Historical parcel implementation/evaluation receipts only | No parcel tests in this goal; intended-use photo/live acceptance pending |
| Choong FR 12–14 | Original evidence hash/canonical formats, pinned local chain, retained checks, independent exception review | integrity-workflow-foundation-qa; actual delivery proof/hash scenarios | Local chain is volatile; hashing does not establish source truth |
| Choong FR 15 | Eight-card dashboard, alerts, bounded filters/reports/CSV, fleet schedules | reporting-interface-qa; actual report/browser scenarios | Page totals are not system totals |

Optional Isolation Forest, continuous GPS, road routing, IoT, production deployment and external publication are outside the approved completion scope. Physical wallet/GPS and supervisor acceptance are recorded as participant dependencies rather than automated passes.
