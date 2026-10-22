# EPR provenance and new TAMPAR families — 20 October 2026

## Result

**EPR remains on hold; TAMPAR now has a new 24-photo review packet covering 12 additional source parcel IDs.** These are candidates for human condition/relevance review, not an approved training or test cohort. No real model fitting, inference, activation or production operation occurred. Other AI modules and additional features remain deferred.

Three task agents separately audited EPR provenance, acquired/reviewed TAMPAR originals, and checked TAMPAR source grouping plus an independent visual review. The root also inspected all 24 originals before reading the independent per-image decisions. Assistant agreement is not human ground truth.

## EPR: original photographs cannot yet be isolated

Primary evidence: [author paper, Sections 2.1.1–2.1.2 and Data Availability](https://www.mdpi.com/1424-8220/26/19/6036), [author repository](https://github.com/AnqiWuCW/EPR-YOLO/tree/b11858cc4a8c5d8baae7c8da87918a8f081ce4ef), [Kaggle release](https://www.kaggle.com/datasets/ongkingu1/express-parcel-recognition-epr-dataset).

The paper reports 12,798 raw images: 7,269 public-dataset, 4,774 web-crawled and 755 field photographs. Filtering retained 5,603 images. **No mapping was found in the inspected public resources identifying which released files are surviving field photographs**, and 755 raw images is not a count of independent parcels or damaged boxes.

The complete public metadata listing was retrieved across 105 pages:

| Release inventory | Count |
| --- | ---: |
| Image candidates | 5,603 |
| Matching annotation filename stems | 5,603 |
| `._` sidecar-named files | 9,649 |
| Total entries | 20,855 |

Metadata sizes total 467,364,663 bytes, matching the release. All entries sit under images/labels; no separate provenance, licence-attribution, original-capture, physical-parcel or session manifest was found. Image, label and sidecar payloads were not fetched, so file contents and image decoding are not certified.

The publisher's API and page both declare MIT. That declaration does not resolve the rights chain of mixed third-party photographs. There are 1,674 Getty-style names and 3,147 names containing the Roboflow-style `.rf.` component; other filename families suggest messaging downloads and video frames. These are audit flags, not findings of infringement or reliable creator/session identities.

There are 82 shared normalized filenames with the earlier held 581-image Roboflow collection after removing export hashes. No EPR image bytes were downloaded, so this is **naming overlap only**, not proof of identical images or PackageDamage training contamination. Unknown original sources still prevent independent baseline-test claims.

The pinned author repository contains figures and implementation placeholders, without the missing mapping. The paper offers raw data on request; no author was contacted. Local `epr/report.md` contains an unsent clarification checklist: retained field-photo filenames/hashes, original ownership/licence scope, parcel/session and derivative links, reused-source URLs, and label-review provenance. The inspected metadata does not justify a bulk download to guess those mappings; payload contents remain uninspected.

EPR evidence: ignored `outputs/epr-tampar-followup-20261020/epr/`. Direct HTTP metadata acquisition was 8,538,962 bytes under a 15 MiB cap; browser-rendering traffic was not measured. No EPR images or model files were acquired.

## TAMPAR: new originals and grouping

Licence: [TAMPAR record 10057090](https://zenodo.org/records/10057090) and its archive README explicitly state [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: Alexander Naumann, Felix Hertlein, Laura Dörr and Kai Furmans, *TAMPAR: Visual Tampering Detection for Parcel Logistics in Postal Supply Chains*, WACV 2024. Acquired JPEG bytes are unchanged; local review IDs and audit notes are additions.

The selection was frozen before viewing: SHA-256-ranked source families, four publisher validation IDs and eight test IDs, with a base photograph and a scene photograph per ID. Scene cycling covers gravel, carpet, table, floor, cobblestone and stairs. Publisher partitions are source metadata, not adopted IILAS splits.

| Review pair | Source parcel ID |
| --- | --- |
| N01/N02 | 02 |
| N03/N04 | 08 |
| N05/N06 | 03 |
| N07/N08 | 06 |
| N09/N10 | 12 |
| N11/N12 | 26 |
| N13/N14 | 21 |
| N15/N16 | 29 |
| N17/N18 | 13 |
| N19/N20 | 19 |
| N21/N22 | 15 |
| N23/N24 | 11 |

All six reserved IDs **01, 04, 05, 10, 17, 25** were excluded as complete families. Their previous 12-photo diagnostic set and human decisions remain unchanged. This step inspects 12 of the 24 previously unreviewed source IDs; the other 12 remain unsampled here.

The paper and [pinned publisher code](https://github.com/a-nau/tampar/tree/77c1230b0b775504431b37bc38c815c9b6e19c32) establish reference/later-scene comparisons for the same parcel. Keep **all dates, views, appearance-change states and UV derivatives of a source ID together**. The independent reviewer found visual support for all 12 selected pairs; human family confirmation remains blank.

Source changes include labels, tape and writing. They are not equivalent to physical damage. Base does not imply Normal, and scene does not imply Damaged. UV maps and predicted normalized views were excluded from acquisition. A source inconsistency concerning the number of changed faces is retained in the group audit rather than silently corrected.

## Visible-condition review priorities

Root proposals: 12 Normal, six Damaged and six Uncertain. The independent group reviewer proposed 12 Normal, five Damaged and seven Uncertain. Their single condition disagreement is **N05: root Damaged versus independent Uncertain**. These counts concern visible-image proposals, not accepted classes or six damaged parcels.

The acquisition agent separately proposed ten Normal, five Damaged and nine Uncertain. Across all three reviewers, retain disagreements on **N05, N13 and N14**; N13/N14 were Normal for root/group reviewer and Uncertain for the acquisition reviewer. `review-comparison.json` preserves all three decisions. There is no majority-vote label acceptance.

1. **N03/N04, source ID 08:** torn/frayed upper seams and corner damage on a shipping carton. Both reviewers propose Damaged.
2. **N05/N06, source ID 03:** flap-edge and corner damage; N06 has agreement on Damaged, N05 needs adjudication.
3. **N21/N22, source ID 15:** torn/frayed corners on a printed product carton; damage proposals agree, but primary shipping-parcel relevance needs a scope decision.
4. **N07/N08, N15/N16, N23/N24:** borderline wear, small corner openings or frayed seams. Preserve Uncertain until the damage threshold is applied by a human.

The independent reviewer additionally flags N01/N02, N17/N18 and N19/N20 for retail/presentation/electronics-box relevance review. A branded carton is not automatically excluded, and source inclusion alone does not approve its fit to IILAS. Labels, tape, writing, construction flaps and unseen contents must not drive physical-condition labels. Large identification markers obscure surfaces and remain a domain limitation.

No uncertain case was discarded or relabelled to improve a score. Different views of one parcel may legitimately receive different visible-condition labels while remaining in one group. These deliberately reviewed photographs cannot later be called a blind final test.

## Acquisition, evidence and verification

Ignored local packet: `research/datasets/tampar-family-expansion-20261020/`, with unchanged N01–N24 originals, source-linked selection/acquisition records, attribution, neutral `REVIEW.md`, blank `human-review.csv`, and separate assistant observations. Research reports, source evidence and verification live in `outputs/epr-tampar-followup-20261020/`.

The 24 originals total **111,095,524 bytes**, each 4032 × 3024; all pass archive-entry CRC, SHA-256 and decoding checks. No exact encoded or decoded duplicates were found within the new panel. A truncated N24 response was rejected and successfully retried; its exact partial transfer count was not captured. Logged complete responses total 110,600,082 bytes; conservative charged request bytes are **113,778,993**, below 150 MiB. Do not call this conservative bound an exact transfer measurement. The full 6.4 GB archive was not acquired or MD5-verified.

Final `verification.json` independently checks the selection, reserved-family exclusion, hashes/CRC/decode, prior-file preservation, blank human/accepted/split fields, Git exclusion, and expanded secret scan. This is research-data/documentation verification; no new application build or model-performance claim is made.

## Next core step

Review the new shipping-parcel damage candidates first, then borderline conditions, relevance and pair identities. Append actual human responses without overwriting source or assistant history. Recalculate eligible independent groups only after those decisions. EPR stays on hold unless an attributable field-photo mapping and parcel/session records become available.

Even approval of every damage proposal would leave a small, single-source development panel. Adequate independent class support, a frozen real protocol and separate sealed evaluation are still required before fitting. Photo integration and sampled live-camera validation remain later core work; public stills do not establish motion robustness, latency, six-face coverage or concealed damage detection.
