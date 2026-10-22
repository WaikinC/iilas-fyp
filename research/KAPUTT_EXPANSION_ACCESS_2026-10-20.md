# Kaputt expansion access checkpoint — 20 October 2026

Latest checkpoint: the user confirmed completion. The final archive now matches the full publisher size and SHA-256. The [verified crop intake](KAPUTT_CROP_INTAKE_2026-10-20.md) acquired 865 development images after two whole-group technical-quality exclusions, with no model training or activation. Internal/official test images remain unextracted; similarity dependencies and a separate crop-only experiment profile remain pre-fit gates. The download-pending/browser-attempt account below is historical.

The official release provides a separate **31,564,000,506-byte query-crop archive**, about 31.6 GB or 29.4 GiB. The 328 GB figure covers the complete collection, including large full-image and reference archives. For this classifier's next data step, acquire only the crop archive and selectively extract a controlled cohort.

The authenticated [publisher file page](https://huggingface.co/datasets/amazon/kaputt/blob/main/kaputt-release/query-crop.tar.gz) displays SHA-256 `de3fe46bac181ec1a369bd957e56d8c6f595669fc3f5c8df42ca12434995ccc1`, Xet hash `70f92206e0b73609d97c366c10c2795773bd000bf415c0d08870810d9fb90921`, and file commit `48864dec277b51dd43d3bf5a9f49993c9ec3549d`. Full repository metadata is pinned at `a6e68b09e4ec0f42f6d198b4ec6d842c6c2b9d6c`. A Git pointer object ID must not be substituted for the payload SHA-256.

A complete public file-inventory audit found no individual image objects, split-specific image archives or gzip seek index. Unauthenticated archive/range/viewer requests returned 401. A browser sign-in does not authenticate a separate shell process. Random byte ranges into gzip cannot be assumed to provide arbitrary desired images. A capped sequential prefix would have unknown selection bias and yield, and would not verify the full archive checksum.

The normal authenticated Chrome download control was attempted, but subsequent checks found no crop file or partial download in MSI Downloads. Chrome's internal downloads page is unavailable through the browser tool's URL policy. No workaround or credential-store access was attempted. The official file page is left available and a user action request asks to start/confirm the download, without duplicating any already-running transfer. **The archive is not yet verified acquired.** MSI had 123,336,110,080 bytes free before this attempt.

## Available metadata, not acquired photos

The existing verified metadata was re-read using the already present Parquet dependency directory. No validation/test image pixels were viewed. Exclude all 100 source item IDs from the earlier sample, not merely its 36 cardboard crops: those IDs account for 82 cardboard captures in the full training metadata.

| Official split | Cardboard captures | Source item IDs | Normal captures | Damaged captures |
| --- | ---: | ---: | ---: | ---: |
| TRAIN excluding all earlier sample item IDs | 25,715 | 16,395 | 16,291 | 9,424 |
| Validation | 1,471 | 941 | 929 | 542 |
| Test | 3,212 | 2,015 | 1,951 | 1,261 |

The remaining training damage captures span 8,282 source item IDs. Item groups can contain both conditions; class-specific item counts overlap and must not be added as if independent. These are source item groups, not verified physical parcel/session identities.

## Intake after the download

1. Require the final archive size and full publisher SHA-256 to match before using images. Preserve the original archive outside Git; do not duplicate 31.6 GB unnecessarily.
2. Read actual tar member layout under resource and extraction bounds. Reject traversal, links, duplicate/conflicting paths and unexpected entries; avoid unrestricted extraction.
3. Select a reproducible, bounded development cohort from eligible official TRAIN groups. Preserve old sample exclusions and all item/dependency groups. Fix resource budget and selection rules before any new fit.
4. Keep official validation/test pixels inaccessible to development. Define their distinct selection/evaluation roles and a final protocol before use; do not turn their availability into repeated tuning.
5. Verify selected image hashes/decode, material/condition annotations and split/group mapping. Publisher labels remain the chosen source truth. Retail-packaging versus shipping-parcel and photo versus live-camera limitations remain explicit.

No new images were acquired or trained in this access audit. No other archives, new gate terms or production use were authorized or performed. Detailed source/probe evidence and metadata counts are retained in ignored `outputs/kaputt-expansion-20261020/access-research.md`. The existing full dataset licence and use limits continue to apply.
