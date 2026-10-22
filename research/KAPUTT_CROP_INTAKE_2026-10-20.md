# Verified Kaputt crop intake — 20 October 2026

The user completed the official download on MSI. The original query-crop.tar.gz in Downloads matches the publisher's **31,564,000,506 bytes** and full SHA-256 **de3fe46bac181ec1a369bd957e56d8c6f595669fc3f5c8df42ca12434995ccc1**. A bounded development extraction is now independently verified. No model was trained or activated in this increment.

Source: [official crop archive](https://huggingface.co/datasets/amazon/kaputt/blob/main/kaputt-release/query-crop.tar.gz). The locally preserved full licence limits use to computer-vision education/scientific research under its superseding terms. The archive stays in Downloads; extracted photos, annotations, selections, exclusions, logs and receipts remain Git-ignored. No second 31.6 GB archive copy was created.

## Selection and technical quality

An agent proposed a deterministic, metadata-only cohort of 200 Normal-only, 200 Damaged-only and 200 mixed-condition source-item groups from official TRAIN. It excludes all 100 earlier sample item IDs and retains every eligible cardboard capture of each chosen item. Parent independently reconstructed the exact selection and proposed partitions from source Parquets and verified all input hashes before new images were decoded. Publisher defect annotations remain the selected benchmark truth; prior human responses and the completed pilot are preserved.

The first intake correctly failed the existing 64-pixel minimum: one selected crop was 1×1 and another 20×20. Both affected source-item groups were withdrawn without replacement, seed changes, reranking, label changes or movement of surviving partitions. Five associated reference rows remain excluded/reserved with those groups. The original proposal, selection and failed extraction are retained as unadmitted evidence. The minimum dimension and resource limits were not relaxed.

| Proposed partition after quality exclusions | Source-item groups | Images | Normal | Damaged | Acquired now |
| --- | ---: | ---: | ---: | ---: | --- |
| Internal training | 418 | 703 | 397 | 306 | Yes |
| Internal validation | 90 | 162 | 96 | 66 | Yes |
| Internal test candidates | 90 | 147 | 81 | 66 | No; metadata only |
| Total candidates | 598 | 1,012 | 574 | 438 | 865 development crops |

The extracted 865 crops span 508 source-item groups and occupy **248,479,122 image bytes**, about 237 MiB. Fifty-one major-defect annotations remain across the complete candidate metadata. The retained group dependencies also reserve 44 non-cardboard query rows and 1,729 reference metadata rows; those are not extra classifier examples or presumed Normal photographs.

## Verification

The new research/kaputt_crop_intake.py streams the archive through strict header checks and an exact TRAIN allowlist. It rejects unsafe paths, duplicate names, links, unsupported extended/sparse headers, overlarge members and incomplete/corrupt streams. It verifies the complete compressed SHA/length, tar ending and gzip CRC before validating the selected JPEGs with OpenCV. The application image pipeline's 64-pixel minimum remains in force.

The revised supervised intake completed with exit 0 in **104.57 seconds**, measured process-tree peak RSS **144,384,000 bytes** (about 137.7 MiB). It stayed within the 512 MiB RSS, 1 GiB output, 20 GiB free-disk reserve and 1,800-second limits, using one OpenCV thread and the existing Windows Job supervisor. Only about 245 MiB of outputs including the inventory receipt were retained for this successful attempt. The earlier failed attempt remains separate.

All **100,267** archive JPEG paths exactly match official query metadata: 85,326 TRAIN, 4,874 validation and 10,067 test. Only the 865 exact selected TRAIN paths were extracted/decoded. Official validation/test images and the proposed 147 internal test candidates remain unextracted and undecoded. Mechanically streaming compressed bytes for integrity does not expose held-out images to model development.

Parent independently rehashed and decoded all 865 outputs and reproduced byte hashes, decoded-pixel hashes, dimensions, labels, groups and proposed partition counts. A second reviewer verified the linked source/selection/exclusion hashes, filesystem inventory and resource results. Intake admission requires all three artifacts together: completed extraction receipt, metadata-verification.json and successful stream.result.json. A completed extraction receipt alone is insufficient.

The new tool's 12 crafted-archive tests pass, covering corrupt/truncated input, unsafe paths/types, independent resource caps, missing selections, wrong hashes/sizes, existing output preservation, dimension limits and no held-out decoding. Existing sealed pilot source modules, protocol, manifest and results were not changed. Application source, production configuration and acceptance pins were unchanged by this research increment.

Final secret checks passed for 186 tracked files, 294 tracked/untracked nonignored files and 246 reachable history blobs. Dataset/model/output/config paths are untracked and excluded. Six sealed research modules plus the completed pilot manifest and protocol still match their recorded hashes. Whitespace checks passed. No application build/emulator rerun was needed for this isolated research intake; their preceding stage-verification evidence remains separate.

## Remaining gates before fitting

No exact cross-item byte/decoded duplicates were found in the 865 crops, and none exactly match the old 100-image development sample. A coarse dHash screen nevertheless flagged **188** cross-item pairs (56 cross-partition, 132 within-partition) and **20** candidate matches to the old sample. These are review flags, not confirmed shared parcels. Resolve conservative dependency groups or documented exclusions before freezing a training experiment; do not claim independence from the absence of exact duplicates.

This is crop-only data. Existing sealed schema v2 requires full original images; do not insert fake originals or rewrite that pilot to admit the expansion. Next prepare a separate explicit crop-provenance adapter/protocol, preserving source hashes, all connected dependencies, the quality withdrawals and untouched evaluation boundaries. Fix the resource/selection protocol before the next fit and do not retune on the earlier failed pilot's internal test.

Cardboard material and source item IDs do not prove shipping-parcel relevance, unique physical boxes or camera-session identity. Publisher packaging-defect labels can differ from visible transit damage in IILAS. More examples do not by themselves establish higher precision. MobileNetV2 remains primary, EfficientNetB0 the comparator; PackageDamage remains the frozen external reference. Actual IILAS photo/live evaluation, persistent analysis outcomes and bounded live sessions are still required. Other AI models remain deferred.

Local reproducibility evidence: ignored outputs/kaputt-expansion-20261020 and research/datasets/kaputt-crop-expansion-20261020/intake-02. Read the acquisition, original selection, quality amendment, independent verification and review together. Preserve failed intake-01; do not automatically resume or overwrite it.
