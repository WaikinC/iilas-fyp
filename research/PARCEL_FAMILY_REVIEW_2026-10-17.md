# Expanded parcel family review — 17 October 2026

The expanded collection retains **138 distinct source asset roots and 440 original images**. The current assistant proposal adds two precautionary alias links to the [existing expansion constraints](PARCEL_EXPANSION_2026-10-17.md), producing **133 proposed evaluation groups**, down from 135. This is a grouping proposal for review, not approved families, proven common ancestry or permission to split/train. All human decisions, approved family IDs and split fields remain blank.

## Evidence and decisions

All 138 source names and metadata identities were reviewed. Nine local comparison grids were visually inspected, covering one representative image for each of 53 potentially related roots at 400 × 267 thumbnail resolution. These were packaging/family comparisons, not original-resolution condition adjudication. Representative selection favoured the publisher-normal flag where available and was source-informed; it was not blinded. The separate expanded condition review determines visible-condition proposals image by image.

Two pairs have identical product names except for an 11-character instance suffix. The conservative proposal keeps each pair in one evaluation group while preserving both original root identities. The suffix and product-name match do not prove shared meshes, and their rendered views do not resolve ancestry. Co-grouping avoids assuming independence where the metadata raises a specific dependency concern.

Eight broader cases remain unresolved without new merges: retailer cartridge packaging, drink multipack variants, portable-drive variants, hair-colour lines, motherboard series, themed calendars and two candy product ranges. Existing pair/trio constraints within those cases remain intact. Shared brand, generic cuboid shape or similar packaging alone is insufficient to certify a common family. The case ledger is not an exhaustive list of every possible dependency.

The representative images show substantial retexturing, lighting and distractor variation. In the 400-image expansion, publisher-damaged flags have 88 original-GSO-texture and 112 cardboard-texture configurations; publisher-normal flags have 75 and 125 respectively. These are source metadata counts, not human labels or feature-performance analyses. A shared generic texture or background does not establish asset ancestry; family grouping also does not guarantee independence from scene/style effects. The [authors' project page](https://a-nau.github.io/parcel3d/) describes the GSO base, simulated damage and synthetic cardboard textures. The inspected [author repository](https://github.com/a-nau/CubeRefine-R-CNN) does not establish a complete cross-root ancestry map for this review. No meshes or new data were downloaded.

| Review measure | Result |
| --- | ---: |
| Preserved original images | 440: 400 expanded + 40 pilot |
| Preserved provenance roots | 138 |
| Prior group constraints retained without fragmentation | 135 |
| New precautionary alias links | 2 |
| Proposed groups after transitive closure | 133 |
| Broader unresolved cases recorded | 8 |
| Prior quarantined images preserved | 6 |
| Human family approvals / final split assignments | 0 / 0 |

## Local artifacts and validation

All per-root/per-image data remain in ignored `research/datasets/parcel-family-review-2026-10-17/`:

- `root-catalog.json` and `comparison-grids.json`: stable root positions, representative image/hash bindings and exact comparison coverage; nine PNG grids are analysis previews only.
- `family-cases.json`: two proposed alias constraints and eight unresolved cases, evidence limits and blank human decision fields.
- `proposed-groups.json`: the new pending 133-group proposal, original root identities, old-constraint/input hashes and false approval/readiness flags.
- `image-group-proposals.csv`: exactly one pending group row for each of the 440 images.
- `build-family-review.py` and `verification.json`: exact builder and integrity evidence; output destinations refuse overwrite.

The original 135-group expansion artifact and all earlier review packets remain unchanged. Every shared root stays in one proposed group, every prior group is wholly contained in a new group, and all 440 unique image IDs appear exactly once. The six old quarantine decisions retain their original file hash. Representative image hashes were checked for all 138 catalog entries. Output fields do not approve labels or resolve visibility.

An independent agent reconstructed the graph using a separate root-adjacency/BFS method rather than importing the builder. It confirmed the 133 components, exactly two additional edges, all inherited constraints, blank approval/split fields, source/output hashes and the 53-root thumbnail coverage. It also inspected the alias comparison grid and found no basis to claim common meshes. Evidence is in ignored `outputs/parcel-family-independent-review-20261017.json`.

Next: a human accepts or revises these precautionary constraints alongside the condition/visibility decisions, and unresolved cross-root evidence is investigated before any group-aware split. Keep the 138 provenance roots distinct even if grouping is accepted. Do not treat the 133 proposals as 133 proven independent physical families, or synthetic performance as real-world parcel accuracy. Additional features remain deferred.
