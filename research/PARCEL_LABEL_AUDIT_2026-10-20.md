# Combined parcel label audit — 20 October 2026

The local audit combines all **440 existing Parcel3D synthetic image records** with the current **133 proposed family groups**, retaining **138 distinct source asset roots**. All 440 original encoded image hashes match their prior reviews, all originals decode at 1080 × 720, and all 400 expanded decoded RGB hashes match the prior review. Forty pilot decoded hashes are newly recorded for integrity; they are not claimed as comparisons against prior decoded hashes. No encoded or decoded exact duplicates occur among the 440 images.

The assistant actually inspected **33 originals at native 1080 × 720 resolution** using `view_image` with original detail: all 32 earlier quarantine cases and one additional prior-Normal image flagged for an irregular lower-left edge. The latter has visible compression, wrinkling and an uneven corner along its short edge, so the new assistant proposal is Damaged. It becomes an additional quarantine case; the earlier 32 are all retained. **407 images were not visually reassessed in this audit**, and their current proposal fields are blank. Hash verification and successful decoding do not count as visual review.

| Measure | Result |
| --- | ---: |
| Current native inspections | 33 |
| Current proposals on inspected subset | 8 Damaged, 25 Uncertain, 0 Normal |
| Current visibility proposals | 11 adequate, 12 limited, 10 insufficient |
| Differences from prior condition proposals | 5 |
| Earlier quarantines retained | 32 |
| Additional quarantine | 1 |
| Combined quarantine recommendations | 33 |
| Other candidates still pending human review | 407 |
| Human approvals / approved families / split assignments | 0 / 0 / 0 |

The five proposal differences comprise one Normal-to-Damaged edge-deformation case, two Uncertain-to-Damaged cases with visible corner/edge buckles, and two Damaged-to-Uncertain cases whose occlusion/visibility prevent a confident decision. Earlier proposals, reasons and selected second-assistant evidence remain in separate columns. They are preserved as history rather than silently replaced. The prior combined totals remain 195 Normal, 220 Damaged and 25 Uncertain; the new 33-image assessment is not a complete relabelling of the collection.

This is a source-informed assistant review with prior proposals available, not blinded annotation, independent human review or ground truth. The targeted subset is deliberately difficult and cannot estimate dataset accuracy or representative agreement. The source render flag is provenance, not a visible-condition label. Normal requires clear assessable packaging without visible damage; Damaged requires visible tears, crushing, punctures, breakage or wet damage under the existing [collection rubric](DATA_COLLECTION.md). Uncertain is a review state, never a third trained class. Hidden surfaces and contents cannot be certified from these images. Ambiguous ordinary closures, designed notches, source geometry, nonstandard package forms and inadequate lighting remain unresolved.

Quarantine is the union of every inherited quarantine plus current uncertainty, disagreement with an earlier assistant proposal, binary disagreement with a source flag, or insufficient visibility. A new assistant opinion never clears an inherited quarantine. Actual human condition, visibility, disposition, reasoning, reviewer/date/source exposure and family approval are required before acceptance. Every human and final-label field stays blank; statuses remain pending, split stays blank, and both readiness flags stay false.

All per-image identifiers, source names, hashes, notes and local paths are confined to ignored [parcel-label-audit-20261020](datasets/parcel-label-audit-20261020/):

- `combined-review.csv`: 440 unique rows, original paths and hashes, source provenance, current 133-group mapping, preserved prior evidence, current proposals only for 33 viewed targets, quarantine reasons and blank human decision fields.
- `native-assessments.json` and `original-review-targets.json`: exact native-view scope, visible reasons and image-hash bindings.
- `source-integrity.json`: SHA-256 hashes and sizes for 1,320 existing original RGB/config/annotation files. Sidecar hashes are recorded for preservation, not presented as a fresh publisher-authenticity check.
- `summary.json` and `verification.json`: counts, input/output hashes, inspection boundaries and false readiness.
- `build-audit.py`: deterministic builder that refuses to overwrite generated output; `--verify` rebuilds in memory, rechecks image hashes and compares all sealed output bytes without writing.
- `verify-family-and-fields.py`: separate read-only check that all 135 earlier group constraints fit wholly inside the current 133 proposals, with exact 440-member coverage and blank human/approval/split fields.

The family CSV matches the existing current group manifest for every image. Shared roots remain unfragmented and all 135 earlier grouping constraints remain intact. This uses the existing family proposal; it does not approve ancestry or establish that the 133 groups are independent. The eight unresolved broader family cases remain governed by the [17 October family review](PARCEL_FAMILY_REVIEW_2026-10-17.md).

Reproduce the local checks from the application directory after dot-sourcing `Enter-IILAS.ps1`:

```powershell
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe research/datasets/parcel-label-audit-20261020/build-audit.py --verify
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe research/datasets/parcel-label-audit-20261020/verify-family-and-fields.py
```

Both checks passed. Original image bytes and prior review files were only read. No new training, image splits, family merges, human approvals, application changes, inference activation, production changes or publication were performed. Synthetic image review cannot establish real-world parcel accuracy.
