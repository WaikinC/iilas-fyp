# Expanded Parcel3D visible-condition review

Prepared locally on MSI on 17 October 2026. All **400 newly acquired images** received actual visual grid screening; **53 selected originals** also received individual 1080 × 720 inspection. The primary assistant proposes **181 Normal, 199 Damaged and 20 Uncertain**, with **26 new images quarantined pending human adjudication**. These are source-informed assistant proposals, not blinded annotation, human approval or ground truth. No final labels, approved families, splits, training, downloads or application changes were made.

| Publisher candidate | Assistant Normal | Assistant Damaged | Assistant Uncertain |
| --- | ---: | ---: | ---: |
| Normal | 181 | 2 | 17 |
| Damaged | 0 | 197 | 3 |
| Total | 181 | 199 | 20 |

Visibility proposals are 258 adequate, 137 limited and five insufficient. Normal describes only assessable visible packaging surfaces; it cannot certify hidden faces, fine defects or contents. Damaged proposals cite visible dents, creases, bowed walls, collapsed corners or irregular edges. Darkness, small size, edge-on views, occlusion and unresolved closure/source geometry remain explicit limitations. Uncertain is a review state, not a third training class. The [existing rubric](LABELLING_REVIEW_2026-10-17.md) remains authoritative.

## Actual inspection coverage and limits

The index is deterministically sorted by sample identifier and binds each image to its encoded SHA-256 and prior decoded RGB hash. The assistant inspected 34 local analysis grids using `view_image`. Each original was represented once by an aspect-preserving 540 × 360 thumbnail, with no crop or condition alteration. The 2160 × 1170 grid images were displayed by the tool at 2048 × 1109, approximately 512 × 341 per image. Source originals remain untouched. Grid images are analysis artifacts, not replacement training images.

The assistant then inspected all 49 grid-uncertain cases and four initial binary source disagreements individually with `view_image`, requesting original detail. All 53 were displayed at their native 1080 × 720 size. **347 images remain grid-only screening.** Every output row records its actual method, visibility, evidence, grid hash and native-view status. The exact 53-image list and hash bindings are retained locally in `summary.json` and `original-review-targets.json`.

**33 of the 53 targeted cases changed condition proposal between grid and original inspection.** This includes resolving uncertain proposals and correcting grid proposals after closer inspection. The original grid assessments remain preserved alongside the subsequent original-size assessments. The targeted subset is not representative, and these changes do not estimate screening precision or model accuracy. All 400 images still require actual human assessment using the originals before acceptance; the 374 non-quarantined candidates are not approved automatically.

Source labels and provenance were available to the primary assistant through the existing source context. Grids showed numeric positions rather than publisher labels, but this does not make the review blinded. Decisions were based on visible pixels; publisher render flags remain separate candidate annotations.

## Cross-review and proposed quarantine

A second assistant independently inspected 15 selected ambiguous/disagreement originals at native resolution and verified their SHA-256 bindings. It avoided reading publisher candidate labels and the primary assistant proposals for that subset. It proposed four Damaged and eleven Uncertain cases. The subset was selected by the source-informed primary reviewer, so this limited masking does not establish a blinded dataset, representative agreement estimate or independent human ground truth.

There are five primary/second-assistant condition disagreements. Both sets of proposals and their visible reasons are preserved; neither automatically overrides the other. The new quarantine recommendation is the union of primary uncertainty, binary publisher disagreement, second-assistant uncertainty and assistant disagreement: **26 images**, leaving **374 candidates pending human review**. The two final binary publisher disagreements are assistant-Damaged proposals against source-Normal flags. Some quarantine reasons overlap.

The original [40-image packet](PARCEL_RESOLUTION_2026-10-17.md), its 14 Normal / 21 Damaged / five Uncertain assistant decisions and its six quarantines are unchanged. Combining counts for context would give 440 available images and 32 proposed quarantine cases, but does not approve any label or create a merged training set.

## Local evidence and integrity verification

All per-image identifiers, paths, notes, hashes, grids and helpers are confined to ignored `research/datasets/parcel-expanded-review-2026-10-17/`:

- `assistant-review.csv`: one uniquely hash-bound row for each of the 400 new images; preserved grid and original proposals, separate second-assistant evidence, source agreement and quarantine recommendations.
- `index.json`, `grid-assessments.json`, `original-assessments.json` and `original-review-targets.json`: deterministic mapping, actual inspection records and preserved proposal history.
- `second-assistant-review.json`: exact copy of the second assistant's evidence, including its selection and source-exposure caveats.
- `summary.json` and `verification.json`: aggregate counts, input/output/code hashes, exact native-view coverage and false readiness flags.
- `preservation-baseline.json`, `build-index.py`, `build-review.py` and `sheets/`: preservation evidence and local analysis helpers. Builders refuse replacement of generated outputs; use a fresh artifact directory for reproduction.

The helper verified all 400 encoded image hashes, all 400 decoded RGB hashes and every native image dimension. It checked complete unique CSV coverage, exact coverage of the 53 original-inspection targets, all 15 second-assistant image bindings, blank human/final-label/reviewer/approval/family/split fields, pending inherited statuses and false split/training readiness. All **3,582 baseline files** across the expansion, original pilot, verified prior review and current original packet remained byte-identical. This includes all 1,200 newly acquired source members and the unchanged 400-row pending source queue. Verification establishes local integrity and structure, not annotation accuracy or publisher authenticity.

The CSV retains the expansion queue's inherited 135-group precautionary identifiers as provenance context. The separate current family review may propose revised constraints; this visible-condition review does not approve or rewrite family groups. Shared texture, generic carton shape, printed branding and nearby rendered objects do not prove common ancestry or independent families. Refer to the parent research batch's family evidence before any grouping decision.

Human condition, visibility, disposition, reviewer/date, approval, family approval and split fields remain blank. `ready_for_split` and `ready_for_training` remain false. Original-resolution human decisions, unresolved family evidence and an accepted image protocol are required before training; synthetic-domain findings cannot establish real-world parcel accuracy.
