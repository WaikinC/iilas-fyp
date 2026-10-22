# Parcel pilot assistant review — 17 October 2026

All 40 original 1080 × 720 RGB images were inspected individually at original resolution with `view_image`. The review also inspected all 40 render configurations, including the source model, OBJ, MTL, BINVOX and texture references. Images were not enhanced, cropped, regenerated or relabelled in the source collection. A second assistant spot-checked nine originals, including the uncertain views and source-label disagreement.

This is a **source-informed assistant review**, not blinded annotation, human approval or independent ground truth. Source labels were available during inspection. Human condition/visibility adjudication, final family approval and final image splits remain pending. No parcel model was trained or activated.

| Publisher candidate | Assistant Normal | Assistant Damaged | Assistant Uncertain |
| --- | ---: | ---: | ---: |
| Normal | 14 | 1 | 5 |
| Damaged | 0 | 20 | 0 |
| Total | 14 | 21 | 5 |

The five uncertain views comprise two severely dark images, one cropped/backlit image, and two images where closure folds or shape irregularity cannot confidently be distinguished from damage. One source-Normal image shows visible bowing/deformation and is flagged Damaged by the assistant for human adjudication. This disagreement does not change its publisher label. The five inherited contact-sheet flags were examined: two remain insufficiently visible, while three show deformation at original resolution despite limited visibility.

Visibility assessments are 29 adequate, nine limited and two insufficient. A limited view can still show a decisive deformation; a Normal assessment describes only sufficiently assessable visible faces and does not certify hidden faces, fine defects or contents. Each row contains an explicit reason and visibility limitation. `Uncertain` is a review state, not a third training class. All final `label`, `approved_family_id` and `split` fields remain blank; all original approval fields remain pending.

## Family evidence and remaining decision

The configurations reference 30 distinct Google Scanned Objects asset roots. Seven roots recur across 17 images; the other 23 roots occur once. The repeated roots encompass base, scaled and deformed OBJ variants sharing their corresponding MTL and BINVOX root. This provides concrete evidence for keeping those variants together, beyond equality of an image UUID or render name.

Two possible cross-root product-series relationships are recorded locally: a pair of related ink-cartridge boxes and a trio of related beverage cartons. Their names and original appearances warrant further inspection, but the supplied references use distinct asset roots. The proposals remain unmerged and unapproved. Similar product names or cuboid shapes do not establish shared mesh ancestry; different names or paths do not establish independence either. The review does not rule out additional relationships among the other roots.

A cardboard texture recurs across different roots, and several simulation-run directory names occur under different model roots. Neither shared texture nor a shared run-directory suffix is used as a family identity. No underlying GSO base meshes, complete provenance mapping or entire publisher archive was downloaded or independently verified in this review. **All 30 proposed root families remain provisional; the pilot is not ready for final group splits or image-model evaluation.** Resolve cross-root ancestry using the actual base assets/provenance and human review before applying the proposed 70/15/15 protocol.

The [publisher record](https://zenodo.org/records/8032204) identifies the dataset as synthetic and for academic research use with mixed resource restrictions. The [author project page](https://a-nau.github.io/parcel3d/) explains its GSO basis and simulated damage. The linked [author repository](https://github.com/a-nau/CubeRefine-R-CNN) was also checked; the reviewed pages do not supply a complete cross-asset family mapping. These sources support provenance context, not the assistant's per-image judgements. The paper page/PDF was unavailable through the web reader in this session, so no new detailed claim is attributed to it.

## Local artifact and reproduction

The current artifact is under ignored `research/datasets/parcel-review-v2-verified/`:

- `assistant-review.csv`: 40 image-bound assessments, reasons, visibility, original candidate labels, asset references and provisional family IDs.
- `family-proposals.json`: shared-root memberships and the two possible cross-root links, explicitly unapproved and unmerged.
- `assistant-input.json`: exact supplied review decisions and the pinned original queue hash.
- `summary.json`: aggregate counts, input/output/code hashes and explicit pending authority/readiness fields.
- `adjudication-code-snapshot.py` and `queue-code-snapshot.py`: exact executed source snapshots.

The original review queue and source collection are unchanged. `parcel-review-v2/` preserves the earlier artifact before two validator boundary fixes; use **`parcel-review-v2-verified/`** for this review. The editable review input is also retained locally as ignored `research/datasets/parcel-review-input-v2.json`. Image IDs, per-image notes, asset names/references and family hashes remain only in ignored local data artifacts; this document contains aggregate evidence.

Dot-source the outer workspace's `Enter-IILAS.ps1`, then run with the research interpreter, choosing a new output path because overwrites are refused:

```powershell
& 'C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe' research/parcel_adjudication.py --source research/datasets/public-sources-2026-10-17/parcel3d-pilot --queue research/datasets/benchmark-splits-v1/parcel-review --review research/datasets/parcel-review-input-v2.json --output research/datasets/parcel-review-reproduction
```

The stdlib CLI reuses `parcel_review.prepare` to revalidate all 120 saved source files and reproduce all three original queue files byte-for-byte. It checks review coverage and image hashes, confines each input including resolved queue children, requires the correct YAML section for asset references/dimensions, checks PNG header dimensions, and writes a fresh deterministic artifact. It rejects human-approval fields and never assigns final labels or splits. The CLI does **not** decode pixels or prove that visual inspection occurred; the image review described above was performed separately through `view_image`. Local hashes establish consistency with saved sources, not publisher authenticity.

Nine focused synthetic software tests pass, including deterministic replay, non-overwrite, tampering, incomplete/duplicate reviews, incorrect image binding, human-approval injection, malformed/incorrectly scoped asset metadata, resolved child-path containment and redacted errors. The two independent-review findings were demonstrated with failing regressions before correction. The Windows interpreter emits the existing nonfatal real-location warning; the tests and real run return success. No packages were installed. Combined project checks are reported by the parent research batch; these tests are software evidence, not model-performance or label-quality evidence.
