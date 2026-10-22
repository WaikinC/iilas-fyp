# Parcel review packet and precautionary group proposal

Prepared locally on MSI on 17 October 2026. This continues the [source-informed assistant review](PARCEL_REVIEW_2026-10-17.md) and preserves its 40 original images, publisher labels, assistant assessments and history. Additional features remain deferred. No final labels, approved families, image splits, training or deployment were created.

## Concrete review outcome

The current local packet is [research/datasets/parcel-resolution-v2/review.html](datasets/parcel-resolution-v2/review.html). Open it in a browser with the surrounding dataset folder intact. It references each original image directly, provides original-size links, and orders the six priority cases first. The page is static: it does not save browser edits. The associated [human-decisions.csv](datasets/parcel-resolution-v2/human-decisions.csv) is the editable decision template; save a separately named completed copy and preserve the original.

| Proposed handling | Images | Authority |
| --- | ---: | --- |
| Retain as candidates for human review | 34 | Publisher and prior assistant agree; these are not approved independent labels. |
| Quarantine pending human judgement | 6 | Five uncertain views plus one publisher/assistant disagreement; none is automatically accepted. |
| Human-approved labels/families | 0 | Every final human field remains blank. |

The prior assistant totals remain **14 Normal, 21 Damaged and 5 Uncertain**. The six priority originals were re-inspected at their original 1080 × 720 resolution during this packet preparation without changing those proposals. Two dark views are proposed for exclusion for insufficient visibility, subject to actual human review. A cropped/backlit view and two closure/shape ambiguities remain unresolved. The source-Normal disagreement still needs a visible-defect judgement under the agreed annotation guide. `Uncertain` remains a review state, not a third model class.

The template separates condition, visibility, disposition and reasoning. Use Normal/Damaged only for a retained, resolved image; an excluded or unresolved image can have a blank condition label. Record actual reviewer, date and source exposure. The packet initially collapses prior label evidence to reduce immediate cueing, but this is not a blinded protocol and must not be described as independent ground truth. Review all 40 records; do not approve the other 34 by default.

## Precautionary grouping decision

Preserve all **30 exact asset-root identities** as provenance. For possible future evaluation, propose **27 groups** by keeping every shared-root variant together and co-grouping the two previously flagged cross-root product-series sets (one pair and one trio). These are conservative evaluation constraints, not a claim that distinct source meshes share proven ancestry. The earlier recommendation not to merge without ancestry evidence remains applicable to provenance identities; this proposal does not collapse those identities.

All 40 records occur once, all repeated-root members remain together, and both known suspected cross-root links stay within one proposed group. This removes fragmentation of those known suspected relationships if the grouping is later approved. It does not establish independence among all remaining groups or certify a leakage-free evaluation. Product names, generic cuboid shape, shared texture and simulation-directory suffixes cannot prove ancestry. No partition is assigned and `ready_for_split` remains false.

The [author project page](https://a-nau.github.io/parcel3d/) describes a synthetic GSO-based dataset with intact and simulated-damage parcels. The [publisher record](https://zenodo.org/records/8032204) supplies the source record and resource-use context. Those pages and the [author repository](https://github.com/a-nau/CubeRefine-R-CNN) were checked during this pass; the inspected pages do not provide a complete cross-asset ancestry mapping. This supports provenance context, not a resolution of the six visible-condition cases. No base meshes or additional archive contents were acquired.

## Local artifacts and verification

All six current packet files remain under ignored `research/datasets/parcel-resolution-v2/`. The earlier `parcel-resolution-v1/` remains preserved as history. Its browser check found narrow-screen overflow from unbroken blank writing lines; v2 adds inherited text wrapping, including expanded source names. The decision CSV and group proposals are byte-identical between versions; HTML differs only in that CSS rule.

- `review.html`: all 40 original-image references, six priority anchors, review instructions, blank human decision lines and the 27 proposed groups.
- `human-decisions.csv`: 40 image-hash-bound records, proposed handling and blank human condition/visibility/disposition/reviewer/group fields; split is blank.
- `proposed-groups.json`: root membership, precautionary group reasons, blank human group decisions and explicit pending authority.
- `packet-manifest.json`: prior input hashes, generator/output hashes, proposal counts and false approval/readiness flags.
- `verification.json`: structural, coverage, preservation and hash-check evidence.
- `build-packet.py`: exact one-off generation/verification script. It refuses to overwrite any existing generated packet file; preserve this output rather than rerunning in place.

The script reuses the existing parcel adjudication and queue validators: all **120 source files** were revalidated and all **six prior verified-review artifacts** reproduced byte-for-byte. It then checked all 40 image hashes, CSV round-trip coverage, six priority cases, 30-root coverage, 27-group coverage, absence of fragmented roots/known links, blank human/final fields, no splits, resolved path containment and every local image/link/anchor. HTML text is escaped and the page contains no scripts or image transformations. The existing Windows interpreter emits its known startup-location warning but the generation and validation command exits successfully.

These are local integrity/structure checks, not evidence of human agreement, publisher authenticity or full family independence. All prior artifacts and original image bytes remain unchanged. Per-image identifiers, source asset names, notes and hashes remain only in ignored local artifacts; this document records aggregate results.

Final browser verification: v2 loads all 40 original 1080 × 720 images at 1440px, 390px and 320px viewport widths. All six width/detail-state combinations have no horizontal overflow; expanded review notes also fit. There are no page errors or non-file requests. The first packet exposed an unbroken writing-line overflow on mobile; v2 adds inherited text wrapping while preserving v1 and keeping decision/group bytes identical. Browser evidence is local under ignored `output/playwright/parcel-resolution-v2-*`. The CLI preview wrapper could not access the file/temporary loopback preview, so installed Playwright verified the local file directly in an isolated browser; temporary preview servers were stopped.

Combined verification: 68 research tests pass; the source secret scan passes across 204 tracked/untracked source files and `git diff --check` passes. All 12 files across v1/v2 packets are Git-ignored, with no dataset files tracked. A separate 163-file baseline confirms prior sources, reviews, benchmark artifacts and runner code are unchanged. Independent review found no blocking issues in the packet or accompanying tabular plan. These checks do not confer annotation approval.

Next: a human reviews the six quarantined cases and the remaining candidates, records exclusions or binary labels with reasons, and accepts/revises the proposed group constraints. Validate the completed decisions and unresolved cross-root evidence before considering a fixed image-training protocol. The small synthetic pilot still cannot establish real-world parcel accuracy.
