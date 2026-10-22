# Olist source and lateness feasibility audit — 17 October 2026

The original Olist version 2 release is acquired and audited locally. It supports a plausible **separate completed-order lateness benchmark**, subject to a fixed protocol and source-semantic decisions. It does not supply the full IILAS Low/Medium/High risk rubric, and no improved model performance is claimed. No model was trained/evaluated, no final split or row-level target file was created, and no data were merged with DataCo.

**The calendar-date rule below is an exploratory audit interpretation, not an approved target.** All 99,441 estimated delivery timestamps are at midnight. Treating those values as precise midnight deadlines changes 1,292 classifications in the principal eligible cohort. That interpretation must be settled before modelling, rather than selected for favourable scores.

## Acquisition and integrity

- Original publisher: [Olist dataset and selected orders dictionary](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce?select=olist_orders_dataset.csv).
- Metadata: [Kaggle public dataset API](https://www.kaggle.com/api/v1/datasets/view/olistbr/brazilian-ecommerce), reference `olistbr/brazilian-ecommerce`, dataset ID 55151, version 2, last updated `2021-10-01T19:08:27.97Z`, licence **CC BY-NC-SA 4.0**. The API version is authoritative for this acquisition; older descriptive version references on the web page are not substituted.
- Download: [version-pinned original public API](https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce?datasetVersionNumber=2). It succeeded without login, credentials, cookies or third-party mirrors. The response redirected to the publisher's HTTPS Google Cloud Storage host; its temporary signed URL was not printed or retained.
- Compressed archive: **44,717,580 bytes**, below the declared **300 MiB** cap. The nine members total **126,186,995 bytes**, matching publisher metadata and also below the extraction cap. Archive SHA-256: `967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784`.
- All nine members were completely streamed for CRC and SHA-256 verification. The extractor rejects absolute/traversal/nested/duplicate-case paths, encrypted members and symlinks; resolved extraction paths must remain inside the new source folder. Existing destinations are refused.

Only original orders, order-items and products CSVs were extracted. Customer linkage was inspected in memory using `customer_id` and `customer_unique_id`; no customer extract was saved. Reviews, geolocation, sellers, payments and category translation remain unextracted inside the ignored archive. Raw values, identifiers, review text and location records were not displayed or included in this document. Hashes establish consistency of acquired bytes, not independent verification of publisher truth; no separately published archive checksum was available in the inspected metadata.

The local artifact is ignored `research/datasets/olist-audit-2026-10-17/`. It holds the original ZIP, selected CSVs, raw public metadata, `provenance.json`, aggregate `audit.json`, independent `verification.json`, `manifest.json`, and exact acquisition/audit/verification Python scripts. The manifest records relative paths, byte lengths, hashes and source/version context; it excludes itself. No existing research source or benchmark artifact was changed.

## Actual schema, keys and dates

| Table inspected | Rows | Grain / finding |
| --- | ---: | --- |
| Orders | 99,441 | Unique order ID; eight columns: order/customer IDs, final status, purchase, approval, carrier-handover, customer-delivery and estimated-delivery dates. |
| Order items | 112,650 | Unique `(order_id, order_item_id)`; product/seller IDs, shipping-limit date, price and freight value. |
| Products | 32,951 | Unique product ID; category, descriptive counts, weight and dimensions. |
| Customer keys | 99,441 | Unique per-order customer ID; maps to 96,096 distinct underlying customer IDs. |

There are no duplicated order/item rows or duplicated declared keys, missing customer links, orphan item-order links or orphan item-product links in these inspected tables. This does not establish independence of different keys or absence of duplicate business events.

| Order date | Missing | Observed minimum | Observed maximum |
| --- | ---: | --- | --- |
| Purchase | 0 | 2016-09-04 21:15:19 | 2018-10-17 17:30:18 |
| Approval | 160 | 2016-09-15 12:16:38 | 2018-09-03 17:40:06 |
| Carrier handover | 1,783 | 2016-10-08 10:34:01 | 2018-09-11 19:48:28 |
| Customer delivery | 2,965 | 2016-10-11 13:46:32 | 2018-10-17 13:22:46 |
| Estimated delivery | 0 | 2016-09-30 00:00:00 | 2018-11-12 00:00:00 |

Every nonempty order timestamp parses with the saved second-resolution format. No timezone is encoded; the audit preserves naive source dates and makes no UTC conversion. All estimated dates, and no actual customer-delivery dates, fall exactly at midnight. The publisher dictionary describes the estimate as the date communicated at purchase and customer delivery as the actual outcome; the snapshot does not independently prove immutability of those values.

Chronology flags overlap: 166 carrier dates precede purchase, 1,359 precede approval, 61 delivery dates precede approval, and 23 precede carrier handover. No approval precedes purchase, no actual delivery precedes purchase, and no estimated calendar date precedes the purchase date. There are **1,382 orders with at least one flag**, including 1,373 with Delivered status and nine Shipped. These may reflect timestamp semantics or source errors; they were not repaired or automatically declared invalid ground truth.

Item shipping-limit dates have no missing/parse failures but extend to **2020-04-09**, beyond the observed purchase period. This is a seller-shipping field, not the customer's promised arrival deadline; omit it from the proposed initial predictor set until its meaning and outliers are resolved. Product categories/descriptive fields are missing for 610 products; weight/dimensions for two, and four products have zero weight. Price/freight values are nonnegative, with 383 zero-freight item rows. No values were imputed, clipped or corrected.

## Outcome eligibility and interpretation sensitivity

Final source statuses are Delivered 96,478; Shipped 1,107; Canceled 625; Unavailable 609; Invoiced 314; Processing 301; Created five; Approved two. Eight Delivered orders have no actual delivery timestamp. Six Canceled orders have a delivery timestamp. Neither a missing outcome nor a cancellation was assigned to a late/on-time or High-risk class.

The exploratory **core cohort** requires Delivered status, parseable purchase/actual/estimated dates, actual delivery no earlier than purchase, and an estimated calendar date no earlier than purchase. It excludes **2,963 non-Delivered orders and eight Delivered orders lacking actual delivery**, leaving 96,470. Fourteen eligible orders lack approval dates and one lacks carrier handover; those optional dates were not invented or silently required for a purchase-time experiment.

For the calendar interpretation, delivery is late when its source calendar date is later than the estimated calendar date; delivery on the estimated day is on time. The exact-timestamp sensitivity instead compares full naive timestamps, including the estimate's midnight. Neither rule is a primary three-class risk label.

| Audit cohort | Orders | Calendar on time | Calendar late | Exact-timestamp late | Changed by deadline interpretation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core completed orders | 96,470 | 89,936 | 6,534 (6.77%) | 7,826 | 1,292 |
| Additional sensitivity excluding all known chronology flags | 95,097 | 88,587 | 6,510 (6.85%) | 7,793 | 1,283 |

The second row excludes 1,373 additional core orders; it is a sensitivity analysis, not a claim that deleting them is correct. The same 14 missing approval dates and one missing carrier date remain in that sensitivity cohort. No condition was chosen using model scores. These counts describe **lateness conditional on recorded completion**; they cannot measure delivery failure, full-population risk or performance on missing/unresolved outcomes. Complete required-proof, failed-attempt and deadline-plus-follow-up histories are absent from the inspected schema.

## Unit of analysis, cutoff and prospective predictor boundary

There are 98,666 orders with items and 775 without; all 95,097 orders in the chronology sensitivity have item records. Item-bearing orders contain 1–21 rows, with 9,803 multi-item, 3,236 multi-product and 1,278 multi-seller orders. Different item rows must not acquire independent splits or duplicated order-level outcome weight through an unchecked join. A future order-level experiment should aggregate eligible item information once per order under a declared rule.

Customer linkage finds **2,997 repeat customers spanning 6,342 orders**; 1,797 customers recur across purchase months, and the maximum is 17 orders per customer. The chronology sensitivity contains 92,039 unique customers, including 2,745 repeat customers spanning 5,803 eligible orders. Also, 13,387 products and 2,524 sellers recur across orders. A random order split alone does not test unseen-customer, unseen-product or unseen-seller generalisation. Define the deployment question, chronological cutoff and customer/entity overlap policy before assigning any split. Fit any historical aggregates exclusively from information before the prediction time and inside training boundaries.

An initial **purchase-time cutoff is a proposal**, not an approved protocol. Possible future predictors are the purchase timestamp/calendar context, promised calendar lead time and order-item price/freight/counts plus product category/physical attributes, conditional on verifying their availability at purchase. These are candidate native-source inputs for a new benchmark, not additions to the active IILAS feature contract. Snapshot product fields are not versioned at purchase, so their temporal availability remains a limitation. Payment fields were not extracted/audited and are not approved predictors by this audit.

Exclude final status, actual delivery time, future carrier/approval events, post-delivery reviews, outcome-derived delay and the item shipping-limit field from that proposed purchase-time feature set. IDs are for joins, grouping and audit only. Missing product attributes need a predeclared training-only preprocessing rule; they must not be fabricated as measured zeros. Customer-location fields were not read into the audit analysis. No candidate features or row-level labels were saved.

Olist's schema and category meanings differ from DataCo's five-feature benchmark. It is an independent-source **new experiment candidate**, not a ready external test of the existing fitted model and not an instruction to concatenate the datasets. RF/DT/LR comparison, target eligibility, chronology sensitivity, grouping, preprocessing, resource limits and an untouched confirmation partition need their own recorded protocol. The existing development-only plan and exposed DataCo test remain unchanged.

## Verification and decision

The pandas audit was independently reconstructed using the standard-library CSV/datetime implementation: all 99,441 orders, status totals, both eligibility cohorts and both deadline interpretations agree. Eight hand-computable boundary cases cover same-day/next-day delivery, missing outcome, cancellation, reversed chronology and optional missing event dates. Both acquisition and audit scripts reject reruns without changing existing output; errors remain redacted. All nine archive members were rechecked for CRC/SHA-256, and the three extracted files still match their original archive bytes. These checks validate the audit calculation and preservation, not model accuracy or target authority.

**Decision:** retain this pinned release for a separately preregistered binary completed-order lateness experiment. Resolve the calendar deadline convention and chronology handling first, then define temporal/grouped validation and a compatible purchase-time feature set. Preserve unresolved outcomes rather than treating them as failures or successes. No final protocol approval, training readiness of the primary IILAS task, final split, model training/evaluation, application change, deployment or publication is claimed.
