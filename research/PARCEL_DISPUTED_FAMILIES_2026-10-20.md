# Parcel disputed-family evidence and handling options — 20 October 2026

The **133 current proposed groups remain unchanged** across all 440 images and 138 source roots. All 33 disputed images are mapped to 28 roots and 27 of those groups. This review verified every selected image hash and the publisher's local model-root references; it did not approve families, labels, splits or training.

## What the local evidence resolves

The 440 saved render configurations consistently identify each sample's model name and OBJ, MTL and BINVOX source paths. YAML escapes were decoded before comparison: three Pokémon names use `\xE9`, which correctly matches the stored accented spelling. Shared source-root assignment is therefore supported by actual provenance references rather than a filename-prefix guess. It does not prove byte-identical meshes or physical-box identity.

No mesh payloads are present in the two selected-source folders inspected. The saved publisher archive directory contains OBJ and BINVOX size/CRC32 metadata for all 440 selected samples: each has 425 distinct fingerprints, with no matching fingerprint spanning different roots. This is not proof of independence. Deformations, scaling, vertex order and serialization can change bytes while retaining common ancestry; CRC32 is also not a verified cryptographic digest of locally read mesh bytes. Material fingerprints repeat across 137 roots, and four texture fingerprints cross roots, demonstrating why appearance assets must not be treated as mesh-family evidence.

Four originals were viewed at 1080 × 720: the two disputed Pure Life alias-root images and two disputed Archive HDD images. The Pure Life views do not resolve common mesh ancestry. The HDD views repeat a notch, edge tabs and a scored contour, and their configurations share one root while referring to different model variants. This is context for condition adjudication; it does not establish that every irregularity is intentional or approve a Normal label. This pass was source-informed assistant review.

## Recommended temporary handling

Retain the current pair/trio/alias constraints and temporarily **exclude all eight unresolved broader case sets from evaluation candidates**, expanding each hold to complete inherited groups. This is an explicit assistant recommendation awaiting a human protocol decision, not a saved human exclusion or removal of dataset files.

| Unresolved case | Roots | Images | Current groups | Recommended handling |
| --- | ---: | ---: | ---: | --- |
| Office Depot cartridge packaging | 23 | 70 | 22 | Hold the case; retain its existing pair. Multiple manufacturers, models and pack counts do not support a blanket shared-mesh claim. |
| Pepsi pack variants | 6 | 18 | 4 | Hold the case; retain its existing trio. Related twelve-can formats may share package ancestry. |
| Seagate variants | 5 | 15 | 5 | Hold the case. Backup Plus colour/platform variants are a tighter concern; Wireless Plus and Archive HDD remain distinct unresolved products. |
| Hair-colour variants | 5 | 15 | 5 | Hold the case. Two beard-colour and three shampoo-colour variants span two lines with unknown relationships. |
| Sabertooth motherboard series | 2 | 6 | 2 | Hold the case. Different board/socket names do not establish independent package geometry. |
| Advent calendar themes | 3 | 11 | 3 | Hold the case. Shared product format and changed artwork do not settle ancestry. |
| Crunch Girl Scouts flavours | 2 | 6 | 2 | Hold the case. Same product range and stated box size support a dependency concern. |
| Nips flavours | 2 | 6 | 2 | Hold the case. Related product variants lack a verified scan/mesh relationship. |

The family hold covers **147 images, 48 roots and 45 current groups**, leaving 293 images, 90 roots and 88 current groups outside that hold. Five of the 33 condition-quarantine images overlap it. Applying both recommended family holds and the existing condition quarantines therefore holds **175 images**, leaving **265 images still awaiting human approvals**. These counts describe available candidates, not an accepted dataset or independent sample size. Human condition decisions may later change the condition-hold counts.

Both existing alias pairs remain precautionary co-groups with unverified ancestry. No constraint is removed, no root is renamed and no new primary merge is proposed.

## Quantified alternative for human protocol review

An explicitly optional sensitivity scenario co-locates every root within each of the eight case sets, then takes connected closure over **all 138 roots and all 133 inherited groups**. It produces **96 blocks covering all 440 images**, a reduction of 37 nominal units. Every old constraint remains intact. This is not an adopted family map or final split.

The Office Depot block deliberately over-groups a broad retailer-packaging category, and the Seagate/hair-colour blocks deliberately span distinct product lines. Their purpose in this scenario is to measure the cost of avoiding separation inside all eight suspected sets without excluding their images. Such a conservative block is weaker evidence than proven independence: it can combine unrelated objects, leaves possible dependencies between blocks, and does not resolve condition quarantines. The eight case sets are not exhaustive. The recommended disposition remains temporary exclusion pending provenance and human protocol review.

## Local evidence and verification

All row-level evidence stays in ignored `research/datasets/parcel-disputed-family-review-20261020/`:

- `case-evidence.json` records all ten existing cases, including both retained aliases and the eight broader holds, with reasons, exact members and blank human decisions.
- `disputed-evidence.json` and `disputed33-family-mapping.csv` cover every disputed ID, same-root peers, source references and current/optional grouping.
- `all440-handling-options.csv` preserves current primary group IDs and records both recommended holds and optional co-location blocks.
- `optional-colocation-scenario.json` contains the complete optional 96-block closure and false adoption/readiness flags.
- `source-provenance.json`, `input-manifest.json` and `visual-evidence.json` bind the inspected local evidence.
- `build_review.py`, `verify_review.py`, `build-verification.json` and `self-verification.json` provide reproducibility and integrity checks. The verifier reconstructs components with a separate BFS method, without importing the union-find builder; this is the same agent's self-verification, not independent human review.

The builder refuses to overwrite outputs and rechecks its source hashes. Final family IDs, human decisions and split fields remain blank; all readiness flags remain false. No downloads, model training, application changes, production operations, commits or uploads were performed.
