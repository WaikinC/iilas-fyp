# Public parcel source expansion — 20 October 2026

## Decision

Three research agents checked academic deposits, open dataset platforms and the licences/access of earlier candidates. **No new collection is yet accepted for training or independent evaluation.** This audit did acquire and visually review eight unchanged, publicly licensed images: two assembled-parcel photographs showing deformation and six cardboard surface examples. They are local review evidence, not eight independent parcels.

The main reviewed TAMPAR panel remains four Normal parcels and one Damaged parcel. Its human decisions, paired groups and diagnostic role are unchanged. PackageDamage remains the frozen comparison baseline. MobileNetV2/EfficientNetB0 training, application activation, inventory/delivery AI and additional features were not advanced.

## Sources and dispositions

| Source | Licence/access checked | Data and grouping findings | Decision |
| --- | --- | --- | --- |
| [Meanwell Packaging photographs on Commons](https://commons.wikimedia.org/wiki/File:Damaged_Cardboard_Box_Labelled_Fragile.jpg), [second photograph](https://commons.wikimedia.org/wiki/File:Damaged_fragile_parcel_delivered_to_doorstep.jpg) | Each image explicitly CC BY 2.0; credited creator and Flickr licence verification recorded. | Two original 4000 × 2667 photographs, 5,527,343 bytes. Visible crushed cardboard. Same photographer/date/doorstep; exact physical-box identity unconfirmed. | Acquired for review. Keep together in one conservative session block; human labels remain blank. Not an independent baseline test. |
| [DefectAtlas-20](https://zenodo.org/records/21719370) | Official record explicitly open, CC BY 4.0; metadata CSV verified. | CSV has 734 defect and 692 no-defect cardboard rows. Six deterministic samples show tight surface crops, including a retail food carton. Two cross-condition pairs look related; no physical object/session IDs released. | Six originals acquired for relevance audit. Do not use as the primary whole-parcel cohort. Preserve as audit evidence; no approved IILAS labels. |
| [Express Parcel Recognition (EPR)](https://www.kaggle.com/datasets/ongkingu1/express-parcel-recognition-epr-dataset) | Publisher Kaggle page displays MIT; author code licence is separately scoped. | Authors report 5,603 images/8,274 objects; release has sidecars and derived names. Mixed Roboflow/Kaggle/web/field sources, without per-file rights or parcel/session map. | Most relevant new large lead, but hold acquisition until an attributable field-photo subset and groups can be identified. |
| [Logistics Modelling damage dataset](https://universe.roboflow.com/logistics-modelling/object-detection-damage-2) | Publisher CC BY 4.0 badge. | 1,723 listed images, physical-defect classes. An opened original preview has explicit Alamy watermarks; repeated filenames span splits. | Hold: badge does not resolve third-party image rights or independent groups. |
| [BoxCondition](https://universe.roboflow.com/ttttt-xe3am/boxcondition-sfato) | Publisher CC BY 4.0 badge. | 3,972 listed images; stock-photo names, rotated derivatives and repeated names. No capture/group provenance. | Hold; do not count augmented or copied views as new parcels. |
| [Amazon Kaputt](https://huggingface.co/datasets/amazon/kaputt) | Full pinned licence now readable; dataset gate remains. Research-only custom terms plus CC BY-NC-ND provisions require a scoped use/access decision. | Large real logistics source, but retail/material labels differ from parcel condition; physical-instance semantics unverified. | Correct prior unread-licence status only. No terms accepted or images acquired. |
| [Corrugated cardboard collection](https://github.com/chanllon/corrugated-cardboard-boxes-dataset) | Unchanged revision; no explicit dataset licence found. | Relevant smartphone boxes, but classification subset and physical groups unresolved. | Hold pending documented reuse permission and group mapping. |
| [CS494 conveyor](https://huggingface.co/datasets/Aagam01/cs494-conveyor-damage) | Anonymous API/README still 401. | Claimed frames are AI-labelled; bundled creator-repository images trace to other sources. | Access, rights and parcel/session truth unresolved. |

Other investigated leads did not solve the gap: KIT Pandemic Package's external share returned 404; HassanBinAli's Hugging Face release contains local path strings rather than photo payloads; FedShufde's Box collection has no verified public release; wine/capsule/sealing datasets target different defects. The serial-number top/side Kaggle lead is Blender-generated pharmaceutical packaging despite a secondary paper describing it as real manufacturing. See the local agent evidence for source-specific distinctions.

## What the eight-image review established

### Commons C01/C02

Both originals were downloaded unchanged from the file links on their Commons pages. Published SHA-1, byte counts and dimensions match; local SHA-256 and decoded-pixel hashes are saved. Attribution: **Meanwell Packaging**, 20 June 2022, [creator](https://meanwell-packaging.co.uk/), [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/). Source titles, individual Flickr links and modification status are in the local acquisition/attribution files.

Root assistant proposals are Damaged: C01 has a compressed upper-right corner and deformed panel; C02 has substantially crushed corners and creased panels. An independent assistant reviewer judged **C01 Uncertain** because severity was ambiguous, and C02 Damaged. Preserve this disagreement; C01 remains on condition hold. These observations do not establish internal contents' condition or damage on unseen faces. No human approval is inferred.

Use proposed leakage block `meanwell-doorstep-20220620` for both. Similar background/date/creator supports keeping them together, but does not prove one physical box. The second photograph's Flickr ID appears in another public dataset's path strings; broader training overlap is unknown. Therefore neither is a defensible blind PackageDamage comparison. A local screen against the previously acquired 581 Roboflow originals found no encoded/decoded exact matches or 64-bit difference-hash candidates at distance ≤10; this limited negative screen does not establish independence from other datasets or transformations.

### DefectAtlas six-image sample

Selection was fixed before viewing: first, middle and last source ID within each cardboard class, three per class. All six 512 × 512 RGB PNGs pass entry CRC, SHA-256 and decode checks. HTTP range extraction read 7,949,483 response bytes including record, CSV and ZIP directory; the full 4,922,506,058-byte archive was not downloaded. Its full-archive MD5 was consequently **not** verified.

The sample contains close-up cardboard faces/edges, one retail frozen-food carton, creases, tears and punctures. None establishes a sufficiently visible complete shipping parcel. This six-image review cannot classify all 1,426 cardboard rows as unsuitable, but it does not justify a bulk primary-cohort download.

Provisional dependency flags: defect `00001` and no-defect `00001` show similar white cardboard and room context; defect `00734` and no-defect `00692` have strikingly matching red stripe, tape and surface. Defect `00367` also shows red-striped corrugated board and should not be assumed independent. These are conservative review flags, not approved physical identities or claims about image manipulation. Source no-defect is not an automatically accepted IILAS Normal label.

## Local evidence and verification

Git-ignored paths:

- `research/datasets/parcel-public-expansion-20261020/`: two originals, acquisition/hash metadata, attribution, assistant observations, blank human-review ledger and scoped overlap screen.
- `research/datasets/defectatlas-parcel-audit-20261020/`: source record/CSV, archive inventory, selection, six originals, acquisition and verification records, visual/family review.
- `outputs/parcel-public-expansion-20261020/`: academic, open-source and licence-refresh reports, consolidated verification.

Final verification is recorded in the ignored `verification.json` under the output folder. It rereads all eight originals, checks metadata hashes/CRC and blanks/holds, confirms all files in these new data/output directories are Git-ignored, checks no dataset/model/output files are tracked, and compares the prior 84-file protection ledger. The documentation secret scan includes untracked nonignored files and the archive handover; no application tests are claimed for this research-only change.

## Next core work

1. Prioritise a **traceable real shipping-parcel cohort with both classes and physical capture groups**, rather than acquiring another large mixed web-image collection. Inspect EPR's file/source metadata for a separable original field-photo subset; if none is documented, retain the hold.
2. Continue the already licensed TAMPAR source-family review beyond the reserved diagnostic parcel IDs, checking whether it supplies additional visible damage. Do not convert tampering annotations into damage labels, or recast the existing diagnostic panel as blind test.
3. If public sources still cannot supply enough independent damaged boxes, document that limit. A later user-authorised original camera collection or source-author clarification could resolve provenance/group gaps, but neither was started here; public-only remains the current instruction.
4. Only after rights, relevance, human condition review, group dependencies and adequate class support are resolved: freeze the real manifest/protocol, acquire official pretrained weights, run bounded development, and evaluate on a sealed group-separated test set. Keep the report's photo and sampled-live-camera validation as later core steps.

More files alone do not establish better precision. Wrong labels, repeated boxes and source-specific backgrounds can increase apparent scores while weakening real camera performance.
