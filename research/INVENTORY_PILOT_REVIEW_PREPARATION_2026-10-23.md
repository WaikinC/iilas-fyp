# Inventory pilot readiness and human review preparation

Date: 23 October 2026. This continues the active stock-AI goal after the [offline pilot implementation](INVENTORY_SIMULATION_PILOT_2026-10-23.md). The previous goal turn made verified implementation progress; this continuation audits actual generated evidence rather than assuming that a passing generator proves representative training data.

## Current evidence

The existing pilot-01 manifest SHA-256 is `B099F7AFEE74E05134DD86B1196BC2BE8AF3DAB758F0B899D078370459BD9E84`. Its full source/report-bound audit passes: 60 fictional families, 60 observation rows, 127 files, no reviewed labels, no split/model and no training eligibility. No submitted review files were present when this check ran.

A separate read-only analysis inspected all 60 unlabelled dossiers without reading sealed-design.json. Results and simplified case summaries are local under ignored `research/datasets/inventory-simulation-v1/review-preparation-01/`; the analysis script/log is in ignored `outputs/inventory-simulation-pilot-20261023/`. All original 127 file hashes were equal before and after analysis. No original event, feature, template or label changed.

## Measured coverage and limits

| Observed item | Pilot result | Interpretation |
| --- | --- | --- |
| Available quantity | 0-948; four cases at zero | Zero alone must not become an automatic Critical label. |
| Movement frequency in 30 days | 9-75 | No zero-activity window is represented in this pilot. |
| Adjustment count in 30 days | 0-6 | Variation exists; reversals remain recorded separately. |
| Reorder distance | -599 to 582; 36 at/below reorder | The binary rule warning is not three-class truth. |
| Days since latest eligible replenishment | Approximately 13-28 days | No same-day, very recent, or latest-receipt-older-than-30-day cases are represented. Older historical Receipt entries do not fill that feature-coverage gap. |
| Known planned supply status | 26 confirmed, 14 planned, 20 disrupted | These context fields are available in dossiers but are not model predictors. Counts are not accepted class counts. |

The simulator's permitted ranges are broader than this realised pilot. Finite bounds alone do not demonstrate coverage. The latest-receipt range and absence of zero activity must be considered during pilot review, before freezing a main generator. Preserve pilot-01; any later generator/protocol change needs a fresh version/destination and must not silently replace reviewed cases. A dataset expansion is not started here.

The six existing inputs also omit additional firm demand, its deadline and the confidence/lead time/quantity of incoming supply. Reviewers may legitimately use those facts to distinguish risks. No identical feature rows were found in the original audit, but uniqueness of rows does not prove that the inputs contain sufficient predictive information. Do not fit a classifier on generator intentions to conceal this limitation or report an arbitrary 80% target as met.

## Human decisions in progress

Three questions were presented for the first three existing cases, using only actual frozen stock and cutoff-known commitment/supply facts, with no suggested risk label. Possible decisions are Normal, Reorder Risk, Critical Stock Risk or Unresolved. Human answers are pending; a displayed or preselected option is not a submitted answer.

These initial decisions are pilot rubric feedback, not independent double-review, complete case annotation, family/split approval, trainer eligibility or acceptance of a generated class distribution. Original cases and observation labels remain untouched. Later recorded decisions must preserve the actual respondent and exact case IDs, their evidence/reasons, uncertainty and disagreements. Never claim a second reviewer merely because another assistant inspected the software.

The review checklist is: reservations are deducted once; additional firm commitments are separate; incoming supply is not current stock; confirmed and merely planned supply carry different evidence; Critical needs likely fulfilment impact, not just a threshold crossing. Where the dossier is insufficient, retain Unresolved.

## Next core work and completion boundary

Use the first human decisions to test whether the rubric is understandable, then review the remaining pilot cases. Resolve missing feature-context and receipt/activity coverage before main generation. Prepare a separately reviewed label-import/adjudication mechanism if needed; the current HTML page does not save answers and this audit does not implement one. Only after that qualification should grouped main-data splits, the bounded RF/DT runner and later application integration proceed.

The stock-AI goal remains active and incomplete. The missing evidence is human-labelled suitable data, a compliant fitted/evaluated three-class model and qualified application behaviour; a valid simulated packet or an existing rule check cannot substitute for those requirements. No model fitting, production/Firebase access, camera use, publication or operational history promotion occurred in this continuation.
