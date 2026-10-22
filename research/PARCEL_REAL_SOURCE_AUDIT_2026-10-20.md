# Real parcel source audit — 20 October 2026

## Decision

**Neither candidate is accepted for parcel training or evaluation.** This bounded audit accepted public documentation as evidence and three small annotation files for schema inspection; it accepted **zero dataset images, labels, groups or splits**. Kaputt remains blocked by unaccepted access terms, unread binding terms, unavailable row-level evidence and target compatibility. The corrugated-cardboard repository remains blocked by unresolved reuse permission, classification-subset identity and physical-box grouping.

The user-authorised scope here is parcel data auditing. MobileNetV2 versus EfficientNetB0 and the Normal/Damaged target remain unchanged. Live-camera application integration remains future core work; the parent task is completing the current report-scope and roadmap reconciliation. Other AI work remains deferred. Existing Parcel3D review packets, human decisions, synthetic-data limitations, tabular data and experiments were not changed.

## Acquisition and reproducibility

Local, Git-ignored evidence: `research/datasets/parcel-source-audit-20261020/`. `acquisition.json` records exact URLs, UTC retrieval times, response status, byte counts, SHA-256 and whether each response was complete. `verify_audit.py` independently rereads saved bytes and reconstructs the file counts, sampled schema and source decisions into `verification.json` and `source-selection.json`.

- Total saved HTTP response bodies: **12,968,309 bytes**, within the **20,971,520-byte (20 MiB)** cap. This includes two 123-byte HTTP 401 bodies, clearly recorded as access failures rather than licence/readme contents.
- Fourteen saved responses: twelve successful public documents/metadata responses and two denials. Three initial sandbox-network attempts failed with zero response bytes; subsequent authorised public retrieval succeeded.
- Two publisher paper PDFs contain published example figures. No standalone dataset image, image archive, model or source repository was downloaded. Three small public JSON annotation samples total 1,921 bytes; their embedded `imageData` is null.
- Retrieval used unauthenticated HTTPS requests without account credentials, terms acceptance, access requests, personal-profile submission or author contact. No retrieved source code was executed.
- Hash verification, complete-tree checks, archive-size checks and exact Git-ignore checks pass. No training, inference, label approval, final partitioning or model activation occurred.

The HTTP acquisition manifest hashes the downloaded evidence, including error bodies. It does **not** imply that inaccessible source contents were verified. Source revisions are pinned below; the two publisher PDFs and project page are identified by URL, retrieval time and saved SHA-256.

## Kaputt: useful published structure, inaccessible data

Publisher sources: [Hugging Face dataset page](https://huggingface.co/datasets/amazon/kaputt), [public metadata API](https://huggingface.co/api/datasets/amazon/kaputt), [project page](https://www.kaputt-dataset.com/) and [original paper](https://www.kaputt-dataset.com/assets/kaputt.pdf), especially Sections 3.1–3.4. Inspected revision: `a6e68b09e4ec0f42f6d198b4ec6d842c6c2b9d6c`.

The API confirms `gated: auto`, a custom `kaputt-defect-dataset-terms` licence identifier, and **327,979,920,017 bytes** of declared storage. Public metadata is accessible without making the underlying dataset publicly reusable. An API size tag says fewer than 1,000, while the card's own size category says 100,000–1,000,000; neither is used as a verified row count.

### Access and terms

The public card says CC BY-NC-ND 4.0 applies with additional terms that take precedence, and use is restricted to education and scientific research in computer vision. It also describes no warranties, the user's responsibility for third-party intellectual property, and King County, Washington dispute jurisdiction. These are **publisher summaries**, not this audit's legal interpretation or a review of the complete binding licence.

The gate requests full name, affiliation, country, intended use and age/terms checkboxes, and states that requesting access shares the Hugging Face username and email with the authors. No request was submitted. Both the revision-pinned raw `LICENSE` and `README.md` endpoints returned **HTTP 401**. The full 22,347-byte licence is listed in the public tree but was not retrieved; the saved `kaputt-license.txt` is the 123-byte denial response, **not the licence**. The normal public licence-page link also failed through the web reader.

This is an access/terms-review block, not a claim that all scientific training is prohibited. The public summary is compatible in purpose with a research project, but does not establish permission for this precise subset, preprocessing, derived artifacts, redistribution or deployment. No approval is inferred from the dataset title or CC shorthand.

### Published schema and compatibility

The paper describes **100,267 labelled query images**, including **29,316 defective**, within **238,421 images** of **48,376 unique items**. These are paper counts, not counts reproduced from downloaded records. Query metadata is described as item identifier, defect severity, one or more defect types, outer material and segmentation mask. Reference images have item identifiers and masks, are unlabelled and are not guaranteed non-defective.

Severity labels are no defect, minor and major. Defect types cover penetration, deformation, actuation, deconstruction, spillage, superficial damage and missing units. Outer materials include cardboard, several plastic forms, paper, books and other materials. **Cardboard is a material filter, not proof that an image depicts a shipping parcel.**

A possible future mapping would use reviewed parcel query images with no visible defect as Normal and visible parcel damage as Damaged. Automatically converting every minor/major retail defect would be invalid: an opened book, missing retail unit, acceptable packaging crease or product spillage does not necessarily satisfy the parcel rubric. Crops can also remove relevant context. Reference images must not be assigned Normal by default. These mapping suggestions are not approved labels.

The source is real retail-logistics imagery captured by a fixed top-down camera in a controlled, illuminated tray. This differs from handheld phone views, varying backgrounds, motion, occlusion and repeated camera frames. It therefore cannot establish live-camera performance.

### Groups, splits and acquisition bounds

The paper reports item-ID-exclusive partitions, approximately **85% train / 5% validation / 10% test**. Actual ID semantics, physical-instance linkage, row schema, class/material counts, duplicates and cross-split overlaps remain unverified. An item identifier is not automatically a certified physical-box identity. Keep query/reference/crop/mask variants linked. Do not silently replace the project's proposed 70/15/15 parcel protocol with publisher proportions, or resplit without an explicit protocol decision.

The public tree exposes these relevant sizes:

| File | Bytes | Audit action |
| --- | ---: | --- |
| `kaputt-release/datasets.tar.gz` | 24,437,422 | Metadata archive alone exceeds the entire 20 MiB cap; not fetched. |
| `kaputt-release/sample-data.tar.gz` | 525,919,493 | Exceeds cap; not fetched. |
| `kaputt-rare/datasets.tar.gz` | 18,750,105 | Separate variant; no substitution or download. Its README is listed but not audited. |
| `kaputt-release/query-image.tar.gz` | 106,767,837,334 | No image acquisition. |

**To reopen:** obtain the complete binding licence for review. Accepting binding terms and sharing profile details requires separate user authorisation; neither is included in this audit request. Once legitimate access and permitted use are established, routine bounded metadata checks remain within the authorised audit scope: verify exact fields and ID relationships, identify a compatible parcel subset and both classes, and document unresolved review needs. Any larger acquisition requires an explicit increased budget rather than exceeding this audit's cap. Dataset acceptance still requires visible-condition and physical-group review plus a frozen evaluation protocol; this audit does not authorise training or confer human label approval.

## Corrugated cardboard: close subject match, missing acceptance evidence

Sources: [publisher repository](https://github.com/chanllon/corrugated-cardboard-boxes-dataset), [pinned README](https://raw.githubusercontent.com/chanllon/corrugated-cardboard-boxes-dataset/d014d6655c9998771078045e05d7eaf729f4ed38/README.md), [complete recursive tree](https://api.github.com/repos/chanllon/corrugated-cardboard-boxes-dataset/git/trees/d014d6655c9998771078045e05d7eaf729f4ed38?recursive=1) and [TPMN paper](https://thesai.org/Downloads/Volume15No2/Paper_84-TPMN_Texture_Prior_Aware_Multi_Level_Feature_Fusion_Network.pdf), Section IV.A and Table II. Inspected commit: `d014d6655c9998771078045e05d7eaf729f4ed38`; the saved public branch metadata identifies its Git tree as `ee8cf8efb57e65dc65d6009fd3a2af79d7f9eda0`.

### Actual released inventory and schema

The API tree is complete (`truncated: false`): 2,373 entries, comprising two directories and 2,371 files.

| Folder | JPEG paths | JSON annotations | Verified interpretation |
| --- | ---: | ---: | --- |
| `dataset3_resize` | 990 | 990 | Every annotation stem has a matching JPEG path. |
| `post_station` | 390 | 0 | No binary labels, group map or split manifest supplied in this folder. |
| Root | 0 | 0 | One README; no other root files. |

Thus the current tree contains **1,380 JPEG paths**, not the paper's 1,210-image collection or 797-image adjudicated classification subset. No released manifest was found connecting those subsets to these paths.

Three deterministic endpoint samples were inspected: `01_1_1.json`, `01_1_2.json` and `52_3_6.json`. They use LabelMe-style `version`, `flags`, `shapes`, `imagePath`, `imageData`, `imageHeight` and `imageWidth`. All describe 1512×2016 images with rectangle shapes and null shape `group_id`. Two contain only `box`; one contains `box` and `damage`. These are geometry/region labels, not the paper's final per-image classification decisions. No condition field, physical-box identity, capture session, natural/staged flag or split field appears in the three samples.

This small purposive schema sample does not establish the vocabulary or completeness of all 990 annotations. A missing `damage` rectangle cannot automatically become Normal; ambiguous or excluded images could remain in the detection release. A region-level `group_id`, even if populated elsewhere, would need semantics before use as an independent physical-box ID.

### Realism, grouping and splits

The README describes head-on smartphone captures of purchased parcels/courier surroundings and deliberate damage. The paper describes naturally delivered and deliberately damaged examples, expert adjudication, and a final **350 non-defective / 447 defective** classification pool. Its **478/160/159** train/validation/test split is random at roughly 60/20/20; the inspected release supplies no matching split files or demonstrated physical-box separation.

Filename prefixes range over **52 values**, but this is a filename pattern, **not 52 verified independent boxes**. Before/after states and multiple views may be related. Source Git blob IDs reveal **four exact duplicate pairs** among JPEG paths, leaving **1,376 distinct image blob IDs**:

- `02_1_5.jpg` / `02_2_5.jpg`
- `07_3_6.jpg` / `07_4_6.jpg`
- `18_2_3.jpg` / `18_3_3.jpg`
- `39_1_6.jpg` / `39_3_6.jpg`

All four pairs are inside `dataset3_resize`. This is equality of publisher Git blob identifiers; image bytes were not downloaded or decoded, so this is not an independently hashed pixel/perceptual duplicate audit. It is enough to reject naive random path splitting. Missing links between folders, physical boxes, staged variants and near-duplicates remain open. Smartphone capture is relevant, but staged damage and unverified view/session diversity cannot establish natural operational or continuous-camera accuracy.

### Reuse terms and reopening gates

The GitHub API reports `license: null`. The complete tree contains no licence, COPYING, terms or notice file. The README requests research citation but supplies no explicit dataset reuse licence. **This audit found no explicit reuse terms; it did not establish an explicit prohibition.** Public visibility, a citation request, or the article's publication licence does not settle reuse of the dataset photographs and annotations.

**To reopen:** obtain documented permission/licence covering the intended research use without assuming it from public hosting; separately authorise any author contact. Identify the precise binary classification subset or establish a permitted independent labelling process. Resolve physical-box/session/before-after links, natural versus staged provenance, duplicate families, and visible-condition adjudication before freezing group-disjoint partitions. No images should be imported for training on the basis of the current evidence.

## Scope retained and verification limits

DefectAtlas was not expanded: neither a third source nor a new architecture is needed to explain the concrete blocks in the two prioritised candidates. Existing Parcel3D remains explicitly synthetic and subject to its existing human-review gates; no automatic merge or replacement is proposed.

Rerun the metadata verifier from the application directory with the configured research Python:

```powershell
& 'C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe' research/datasets/parcel-source-audit-20261020/verify_audit.py
```

The verifier checks downloaded bytes/hashes, limits, source tree counts, sample schema and ignored evidence paths. It does not certify rights, independently validate publisher paper claims, inspect images, prove physical independence, or approve data. Final `accepted_sources` is an empty list and `accepted_image_count` is zero. Broader pre-existing artifact preservation is verified by the parent task against its separate baseline.
