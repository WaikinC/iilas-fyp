# FreshRetailNet full-source intake audit — 17 October 2026

The user authorised an actual local audit following [the dataset expansion review](DATASET_EXPANSION_REVIEW_2026-10-17.md). Both original FreshRetailNet files were downloaded and all **4,850,000 daily records / 116,400,000 hourly entries** were inspected. Source hashes and aggregate checks pass. This is an intake result, not model evaluation: **training readiness remains false** pending the task, timing and semantic gates below. No model was trained, no IILAS three-class labels were created, and the [34-fit existing-data improvement plan](TABULAR_IMPROVEMENT_PLAN_2026-10-17.md) is unchanged.

## Pinned source and acquisition

Original publisher: [Dingdong-Inc/FreshRetailNet-50K](https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K). Pinned repository revision: `c374e85975c82816c495acfa904cc55ab14a47d3`. The repository API and saved card declare **CC BY 4.0**. The original data files date to the publisher's v1.0 commit; the pinned revision includes the 9 October 2026 README update. The [original paper](https://arxiv.org/html/2505.16319v1) supplies research context; it does not supersede the downloaded file schema.

| Original file | Verified bytes | Verified publisher LFS SHA-256 |
| --- | ---: | --- |
| `data/train.parquet` | 106,436,287 | `6706832db892bbae4969c19d87e07975d2543d2ba7d7d4756360654785de5a3d` |
| `data/eval.parquet` | 8,440,124 | `1b118840664280c6b88bffc84c80ee1f54c05d911e354b7599e5da10995e960e` |

Total original data: **114,876,411 bytes (109.55 MiB)**, below the predeclared 1 GiB data ceiling. Both complete files were acquired, not sampled shards. Acquisition used canonical revision-pinned HTTPS URLs without credentials or a dataset loader. The saved README's byte size and Git-blob SHA-1 also match publisher metadata. API metadata, card, acquisition code and manifest are preserved under ignored `research/datasets/freshretailnet-audit-2026-10-17/`. Signed redirect queries are not recorded in reports.

The existing research and bundled Python environments had no Parquet engine. PyArrow **23.0.1** was installed only into this ignored audit directory's `_deps`, using `--only-binary=:all: --no-deps --target`; shared Python packages and application requirements were not changed. The exact wheel is retained in `_wheels`: 27,540,749 bytes, SHA-256 `cecfb12ef629cf6be0b1887f9f86463b0dd3dc3195ae6224e74006be4736035a`, verified against [official PyPI release metadata](https://pypi.org/pypi/pyarrow/23.0.1/json). `reader-provenance.json` preserves both exact commands. No remote dataset code was executed.

## Actual coverage, identities and time

| Check | Train | Publisher eval |
| --- | ---: | ---: |
| Daily rows | 4,500,000 | 350,000 |
| Store-product series | 50,000 | 50,000 |
| Stores / cities | 898 / 18 | 898 / 18 |
| Unique product IDs | **865** | **865** |
| Dates | 2024-03-28–2024-06-25 | 2024-06-26–2024-07-02 |
| Daily records per series | Exactly 90 | Exactly 7 |
| Duplicate `(store_id, product_id, dt)` keys | 0 | 0 |
| Series with missing days within their span | 0 | 0 |
| Missing scalar/list values / missing hourly elements | 0 / 0 | 0 / 0 |

**865 is the actual distinct product count in this pinned release.** This agrees with the saved dataset card; the paper says 863. The file audit resolves which count to report for these bytes, but not why the paper differs.

All 50,000 series, 898 stores and 865 products appear in both partitions. There are zero common dates and zero overlapping store-product-date keys. Every series' first eval date is exactly one day after its last training date. Thus the publisher split is later-time evaluation of the **same series**, not held-out products, stores or independent series. Row counts cannot be treated as counts of independent products. Store-to-city mapping and each product's category path are consistent within each inspected partition.

The file contains 19 fields: seven encoded identity/hierarchy integers; a date string; `sale_amount`; hourly sales; daily trading-hour stockout count; hourly stockout flags; discount; holiday/activity flags; and four weather fields. Both hourly lists have exactly **24 elements in every row**. Actual Parquet types are `hours_sale: list<double>` and `hours_stock_status: list<int64>`; the README describes the latter as int32. Values remain binary, so that storage-type discrepancy is recorded rather than silently changing the source. Full schema, numeric ranges and null counts are in `audit-summary.json`.

## Stockout encoding and sales relationships

For **every one of the 4,850,000 rows**:

`stock_hour6_22_cnt == sum(hours_stock_status[6:22] == 1)`

The slice covers hour indices **6 through 21**, excluding 22. Its count is always an integer from 0 through 16. Together with the publisher's definition of the count field, this verifies the file convention: **1 denotes recorded out-of-stock status; 0 denotes no recorded stockout**. The paper's mathematical availability mask uses the opposite orientation and must not be copied as the file encoding. This is a consistency finding, not independent physical validation of the publisher's stock records.

| Aggregate observation | Train | Publisher eval |
| --- | ---: | ---: |
| Out-of-stock trading hours | 14,311,536 / 72,000,000 | 1,014,031 / 5,600,000 |
| Fraction of trading hours flagged | 19.8771% | 18.1077% |
| Days with at least one trading-hour flag | 1,992,006 (44.2668%) | 143,438 (40.9823%) |
| Days with all 16 trading hours flagged | 181,791 | 12,541 |
| Positive-sales hours also flagged out of stock, all 24 hours | 772,426 | 59,300 |
| Positive-sales hours also flagged, trading hours only | 417,269 | 31,277 |
| Zero-sales hours with flag 0, all 24 hours | 57,893,146 | 4,485,099 |

The card's approximately 20% stockout description is consistent with the training **hour-level** fraction; it must not be described as a 20% daily-positive prevalence. Positive sales and a stockout flag coexist in **831,726 hourly entries** overall. An hour could include sales before depletion, but that explanation is unverified: flag sampling time and aggregation semantics remain open. Do not erase those observations or relabel them based on zero/positive sales. Conversely, zero sales with flag 0 demonstrates why zero sales alone cannot label stockouts.

All hourly flags are 0/1. Hourly sales contain no negative, nonfinite or missing values. Daily sales equal the sum of all 24 hourly sales within absolute tolerance `1e-8` for every row. These checks establish internal consistency, not causal validity or completeness of demand.

## Scaling and unresolved encodings

The pinned card explicitly says daily/hourly sales quantities have been multiplied by a global coefficient. Observed daily sales range from 0 to 44.9 in train and 0 to 49.9 in eval; 4,036,741 training and 312,215 eval daily values are fractional. The coefficient and raw units are not supplied. Preserve published values; do not infer physical item counts, invert scaling by guessing, or populate IILAS stock balances from them. There are no negative/nonfinite scalar measurements, but that does not establish that every encoded sentinel is documented.

Discount is 0 in **16,039 train / 1,300 eval** rows; **34 train** values exceed 1, with maximum **1.088** (eval maximum 1). The card describes 1 as no discount and 0.9 as a 10% discount. Zero and values above 1 require interpretation before use; they are not automatically missing or invalid. No clipping, imputation or removal occurred. Holiday/activity fields are binary. Numeric quality tables preserve all aggregate ranges for later review.

The released fields do not include on-hand unit balances, reserved stock, supplier lead times, purchase/receipt events or independently reviewed Normal/Reorder Risk/Critical Stock Risk labels. No field observes true lost demand during a stockout. The original paper reconstructs latent demand; those estimates cannot be treated as observed labels or evidence of actual lost sales. The dataset describes real publisher retail observations, while the audit verifies downloaded consistency and provenance, not the source's physical data-collection process. [Publisher paper](https://arxiv.org/html/2505.16319v1)

## Prediction-time boundary for the next protocol

No target table, train/validation/test redesign or candidate model was created. A possible next task is forecasting whether a store-product will have a recorded stockout during the next trading day, using information available by the preceding day-end. That would be a **new binary stockout task**, not the existing backorder outcome or the primary IILAS three-class task. Its target window, threshold (any flagged hour versus another predeclared definition) and operational meaning need preregistration first.

For that proposed day-ahead cutoff:

- Candidate historical inputs are prior-day-or-earlier sales and recorded availability summaries, plus calendar information derivable in advance. Any lag/window transformation must respect the cutoff and be fitted within training folds only.
- Same-day stockout count/status and sales for the forecast day are outcomes/post-cutoff measurements and must be excluded from predictors. They cannot be used to forecast themselves.
- Forecast-day realised precipitation, temperature, humidity and wind are unavailable at the proposed cutoff. Use historical weather only unless separately verified archived forecasts are obtained; none were acquired.
- Forecast-day discount/activity values cannot be presumed known plans. Their availability time and unusual discount semantics must be established before use. Calendar holidays also require a documented known-in-advance source/definition.
- Encoded store/product/category IDs establish grouping and hierarchy; an initial conservative protocol should keep raw entity IDs out of predictors and explicitly distinguish same-series temporal performance from unseen-product/store performance. Shared products and cities can induce dependencies beyond a store-product pair.

Do not randomly split daily rows across time or concatenate these scaled records with Backorder. Freeze a future chronological development design and an honest confirmation policy before fitting. The publisher eval's aggregate outcome distribution and quality were inspected in this audit, as explicitly authorised; **no predictive test metrics were computed**. Record that exposure rather than presenting the partition as never examined. A truly fresh external confirmation claim requires separate unseen evidence. The present audit does not establish that a new-source model would increase precision on Backorder or production IILAS.

## Verification and artifacts

Ignored local directory: `research/datasets/freshretailnet-audit-2026-10-17/`.

- `train.parquet`, `eval.parquet`: complete unchanged publisher files.
- `source-metadata.json`, `source-tree.json`, `source-README.md`, `acquisition-manifest.json`: pinned release, licence and download provenance.
- `acquire.py`, `audit.py`, `test_audit.py`, `verify_audit.py`, `record_reader_provenance.py`: exact acquisition/audit/verification source snapshots; no application entrypoint imports these helpers.
- `audit-summary.json`: all-record schema, scalar/array quality, counts, grouping and date checks, runtime versions and source/code hashes.
- `verification.json`: independent Arrow aggregation of row counts, stock flags and sales totals, plus source hashes and supplemental discount/hour diagnostics. It does not import the audit's calculation helper.
- `reader-provenance.json`, `pyarrow-release-metadata.json`, `_wheels/`, `_deps/`: isolated reader installation and checksum evidence.

Six synthetic audit-helper tests pass, covering the half-open trading window, invalid flags, positive sales during flagged hours, zero sales without stockouts, malformed array lengths and nonfinite/negative sales. These are software checks, not model results. The full audit completed; a second scan independently reconstructed aggregate hour/sales counts. Both original file hashes were checked before and after the audit and again by the verifier. Runtime: Python 3.13.15, pandas 3.0.1, NumPy 2.4.2 and isolated PyArrow 23.0.1. The root batch separately reran all 68 research tests and independently recalculated all-row mask/count/sales relationships; see [the batch record](README.md). Build, lint, Firebase and application-browser suites were not rerun for this isolated data/documentation batch.

Remaining preregistration gates: resolve hourly flag measurement semantics and discount handling; specify prediction cutoff and feature availability; choose native stockout target/window; define temporal/group dependence and uncertainty; define development-only model/threshold selection and confirmation disclosure. Until those decisions are recorded, **`ready_for_training=false`**. No primary inference file, original dataset, existing run or operational record was modified; no production access, deployment, commit, push or dataset upload occurred.
