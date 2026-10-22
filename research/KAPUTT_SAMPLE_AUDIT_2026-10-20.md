# Kaputt metadata and sample audit — 20 October 2026

The user completed the Hugging Face access flow and downloaded the two official archives on MSI. Both match the publisher's SHA-256 values. The sample is usable for further research review; it is **not an approved IILAS training cohort or an independent test set**.

## Acquisition and verification

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `datasets.tar.gz` | 24,437,422 | `50299fe0fcfd3b4567ed35e6fc6dc5e019c64821ac6aa6e53e8a63b318e87281` |
| `sample-data.tar.gz` | 525,919,493 | `2ba43dec177611e9febb5fa82cf292bb3093506702ed1592315261d9e8597329` |
| Revision-pinned `LICENSE` | 22,347 | `71f3952ed4e7f88b3256bdcea19509d4b78984bd436dc0bc17c991e6c5264cd0` |

Publisher sources: [metadata](https://huggingface.co/datasets/amazon/kaputt/blob/main/kaputt-release/datasets.tar.gz), [sample](https://huggingface.co/datasets/amazon/kaputt/blob/main/kaputt-release/sample-data.tar.gz), [licence](https://huggingface.co/datasets/amazon/kaputt/resolve/a6e68b09e4ec0f42f6d198b4ec6d842c6c2b9d6c/LICENSE).

The licence states CC BY-NC-ND 4.0 plus superseding terms limiting use to computer-vision education/scientific research. The verified full text is preserved locally. This audit does not establish commercial deployment or redistribution permission, nor checkpoint-specific permissions.

All files remain ignored below `research/datasets/kaputt-intake-20261020/`. Downloads were copied without changing the originals. Archive paths/types, case-insensitive collisions and expansion limits were checked before exclusive extraction. The sample has 1,166 regular files: two Parquets, 776 JPEGs and 388 PNG masks. All extracted bytes were independently rehashed; every image decoded, with zero failures. Every image artifact resolves from sample metadata; no missing/extraneous artifacts or exact byte duplicates were found. Different encodings/crops and perceptual duplicates still require separate consideration.

## Full annotation results

| Publisher split | Query images | Item IDs | Cardboard images | Cardboard nondefective | Cardboard defective | Cardboard major defect |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Train | 85,326 | 41,162 | 25,797 | 16,347 | 9,450 | 1,445 |
| Validation | 4,874 | 2,399 | 1,471 | 929 | 542 | 65 |
| Test | 10,067 | 4,815 | 3,212 | 1,951 | 1,261 | 214 |
| Total | 100,267 | 48,376 | 30,480 | 19,227 | 11,253 | 1,724 |

These are publisher material/defect counts, not reviewed shipping-parcel counts. No item ID, capture stem or image path overlaps across the official splits. Query/reference item sets match within each split. No nulls, duplicate records/paths or contradictory defect flags were found.

There are 11,025 item IDs spanning different severity states and 3,953 spanning materials. Preserve each capture's condition annotation and keep all occurrences of an item ID together. Item IDs do not certify a unique physical box or capture session. References are 1–3 separate rows per item, not necessarily Normal; joining them naively multiplies query rows without creating independent samples.

## Official sample and visual screening

The sample contains **100 query photos across 100 item IDs and 288 reference captures**. All sample captures and annotations match the full **training** release, with no validation/test overlap. It cannot be presented as the publisher's held-out test set.

Of the 100 query photos, 36 carry cardboard material metadata: 25 nondefective and 11 defective, including three major defects. Three agents and the parent screened the unchanged publisher crops; the parent also inspected four full originals. These were assistant relevance screens, not blinded human ground truth.

Many defect-labelled examples are retail cartons, display/hang-card packaging or ordinary/open closures. K01 contains multiple distinct objects. The large grey tray and its handholes are background, not the target parcel. Cardboard material and a publisher defect flag alone do not establish IILAS shipping-parcel damage.

Priority relevance/condition review candidates are **K04, K11, K17, K18, K22, K30 and K36**. K04/K11 have publisher defect labels but ambiguous visible condition; the other five have publisher nondefective labels. Other cases remain available for scope review, including product cases and branded mailers. No source label was replaced, no human label was inferred and no new physical group or training split was approved.

The local read-only `review.html` shows all 36 candidates, with the seven priorities first, full-original links and collapsed publisher annotations. All 109 local image/licence links were checked. The page was rendered and visually checked through the loopback review server at `http://127.0.0.1:8767/review.html`. This separate gallery does not change the application or its Firebase endpoints.

Human questions for K04/K11 are pending at this checkpoint. Future answers belong in a separate append-only response record; the initial gallery and source annotations must remain reproducible.

## Superseding publisher-label decision

After this audit, the user answered Normal for K04/K11 and then explicitly chose to continue with publisher labels because the images were unclear. The append-only human responses remain preserved. Follow [KAPUTT_PUBLISHER_LABELS_2026-10-20.md](KAPUTT_PUBLISHER_LABELS_2026-10-20.md) for the current benchmark policy; manual condition adjudication below is historical and no longer blocks this Kaputt research benchmark.

## Decision and next action at the original audit checkpoint

1. Review the priority candidates' relevance and visible condition. Preserve disagreements and uncertain cases rather than forcing agreement with publisher metadata.
2. Review the scope of retail cartons/mailers against the report and existing benchmark definition before broadening eligibility. Do not silently substitute retail-product defects for shipping-parcel damage.
3. Keep the sample in development/source-screening use. Additional relevant independent damaged groups and an unexamined evaluation cohort remain necessary; reference views must not inflate the sample count.
4. Do not download the full 328 GB collection based only on headline counts. Choose any further acquisition from evidence of target relevance and resource cost.
5. Continue the separately saved authenticated API integration plan while data decisions are pending. No fitting, model activation, live inference or production change occurred in this audit.

Local evidence: `acquisition.json`, `metadata-summary.json`, `independent-group-audit.json`, `sample-acquisition.json`, `sample-image-verification.json`, `sample-group-audit.json`, `cardboard-review.json` and the four assistant visual-screen JSON files beneath the ignored intake directory.
