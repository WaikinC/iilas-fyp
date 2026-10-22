# Parcel3D bounded public-source expansion

Acquired and audited locally on MSI on 17 October 2026 following the [dataset expansion review](DATASET_EXPANSION_REVIEW_2026-10-17.md). **400 additional original synthetic training images** are now saved with their original render configurations and annotations. The existing 40-image pilot remains unchanged, giving 440 locally available images. All new labels remain pending human review; no final splits, model training or application changes were made. Additional features remain deferred.

## Source and selection

The source is [Parcel3D version 1.0, Zenodo record 8032204](https://zenodo.org/records/8032204). Its current publisher page was checked: academic research use and the original mixed component restrictions apply. The full archive is 45,838,331,510 bytes; it was not downloaded and its whole-file MD5 was not verified. The source context and published checksum are saved locally. This is an expansion of the same synthetic source, not an independent real-world dataset.

The existing ZIP directory lists 174,211 entries and 13,393 render configurations: 9,193 publisher-training, 2,000 validation and 2,200 test. Only publisher-training members were acquired. Metadata CRC/size fingerprints were used to schedule a small configuration probe, not to establish family identity. The first seeded probe of 138 configurations exposed 138 distinct validated GSO asset roots, including 108 absent from the pilot. A second pass inspected 486 candidate configurations. Those sampled roots are not a proof of complete archive root discovery or independent physical-object families.

Before image transfer, selection was frozen using seed 42. It covers every observed root, favours new roots, limits each new root to four new views and each existing pilot root to two, excludes all 40 pilot image IDs, and balances native publisher flags. No image-quality judgements, model predictions or scores were used for selection. The source flags are candidate labels only.

| Expansion measure | Verified result |
| --- | ---: |
| New original images | 400 |
| Publisher Normal / Damaged flags | 200 / 200 |
| Distinct source asset roots represented | 138 |
| Roots absent from the original pilot | 108 |
| New images from new / existing roots | 340 / 60 |
| Roots with two / three / four new views | 31 / 90 / 17 |
| Selected roots containing both source types | 108 |
| Human-approved new labels | 0 |

All 1,200 required selected image/configuration/annotation members were preflighted as present, nonempty and within the member-size limits. Seven empty training annotations elsewhere in the publisher index were not selected. One quoted Latin-1 model name needed bounded scalar decoding before the existing strict section/asset validators; its exact Unicode identity and original file bytes were preserved.

## Acquisition and validation

The ignored one-off downloader requests exact HTTP byte ranges from the original Zenodo archive. It requires status 206, the exact range/total size, expected response length and unencoded bytes; validates local ZIP member names, compression bounds, decoded size and CRC; and records SHA-256 receipts. Requests are rate-limited with bounded retries for transport/transient-server failures. Verified cached files are reused only when their sizes, CRCs, hashes and receipts agree. Differing existing files are rejected; verified partial files are completed without replacing existing source files.

Each selected sample used a bounded contiguous range covering its configuration, annotation and RGB image, avoiding the large texture/mesh members. The recorded requested-byte reservation was **300,255,952 bytes (about 286.35 MiB)**, including unsuccessful attempts and a separately accounted 1,024-byte diagnostic, below the **2 GiB payload cap**. This is conservative range accounting, not a measurement of HTTP/TLS wire overhead. The 1,200 saved source files total **307,454,186 bytes** after decompression. No original image was cropped, enhanced, resized on disk or regenerated.

Final offline audit verified:

- All 1,200 new source files against ZIP CRC, expected size and SHA-256 receipts.
- All 400 PNGs decode to 1080 × 720; image dimensions, sample IDs, annotation image IDs, category IDs and configuration source types agree.
- All 400 encoded image hashes and all 400 decoded RGB hashes are unique, with no exact encoded/pixel duplicates against the pilot. This does not rule out perceptual near-duplicates or related scenes.
- The frozen 400-record selection, root caps and 200/200 source-label counts reproduce; all label, reviewer, family approval and split fields remain blank/pending.
- All 120 original pilot source files still match their prior manifest hashes.
- Twelve offline guard checks pass, covering unsafe paths, negative/oversized/mismatched/truncated ranges, whole-archive responses, byte/member caps, bad CRC, overwrite refusal, malformed asset metadata and Unicode scalar identity. A cached-sample resume check makes no network request and preserves its three files and receipts.

The sandbox initially could not resolve Zenodo; authorised public downloads then ran through the permitted network escalation. A later interrupted metadata request resumed using the verified cache. The installed OpenCV decoder was used without installing packages. The existing Python startup-location warning remains nonfatal. CRC and local hashes establish consistency with the cached index and saved inputs, not whole-archive authenticity.

## Preserved review constraints and local artifacts

The [original review packet](PARCEL_RESOLUTION_2026-10-17.md) remains current for its 40 images: 34 review candidates and six quarantined cases, all awaiting actual human decisions. Its 27 proposed evaluation groups and both suspected cross-root links remain intact. Extending those existing constraints to the new images by exact asset root produces **135 proposed groups across all 440 images and 138 roots**. This preserves known grouping constraints; it does not certify ancestry, resolve additional cross-root dependencies or assign splits.

All data, per-image identifiers/notes, receipts, metadata caches and acquisition/audit helpers are local under ignored `research/datasets/parcel-expansion-2026-10-17/`. Main artifacts are:

- `source-context.json`, `metadata-probe.json` and `candidate-pool.json`: source context and metadata-selection evidence.
- `selection.json`: frozen deterministic selection, caps and source-label counts, saved before image acquisition.
- `samples/` and `manifest.json`: 400 original image/configuration/annotation sets with per-member receipts.
- `review-queue.csv`: 400 new image-hash-bound records with pending human fields.
- `combined-group-proposals.json`: unapproved grouping constraints covering 440 images, referring to the original pilot without copying or changing it.
- `audit.json`, `boundary-checks.json`, `resume-check.json` and `range-ledger.jsonl`: completed validation and resource evidence.
- `acquire.py` and `verify.py`: exact local helpers; their hashes are recorded in the final audit.

No dataset files are tracked or uploaded to GitHub. This aggregate note contains no raw metadata or per-image records. The original pilot, both historical/current review packets, prior assistant review and all earlier source artifacts remain preserved.

Next, review visibility and visible condition for the new images, preserve exclusion/unresolved states, and investigate related roots before approving group-aware final splits. The synthetic-domain gap, human ground-truth gap and family-independence gap remain. A larger collection alone does not demonstrate improved accuracy or justify training on unreviewed labels.
