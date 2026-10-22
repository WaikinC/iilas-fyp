# TAMPAR human label and family review — 20 October 2026

## Recorded outcome

The user inspected all twelve displayed originals and supplied **10 Normal and 2 Damaged** decisions. The user also confirmed all six same-parcel pairs and chose to keep gift-wrapped T07/T08 as separate challenge cases. This records actual human responses, not inferred agreement with assistant proposals.

| Views | User condition, each view | Confirmed source group | Role | Review evidence and limits |
|---|---|---|---|---|
| T01 / T02 | Normal / Normal | ID04 | Main cardboard candidate | User accepts visible condition; assistant retained uncertainty about frayed corners/closure edges. |
| T03 / T04 | Normal / Normal | ID01 | Main cardboard candidate | Straight carton geometry; tape and document-pouch wear are distinct from cardboard damage. |
| T05 / T06 | Normal / Normal | ID05 | Main cardboard candidate | User accepts visible condition; assistant retained uncertainty about closure-edge wear. T06 concerns the large foreground box only. |
| T07 / T08 | Normal / Normal | ID25 | Separate gift-wrap challenge | Human decisions describe visible outer wrapping; they do not establish the condition of hidden cardboard. |
| T09 / T10 | Normal / Normal | ID17 | Main cardboard candidate | Regular circular holes and rectangular slots appear to be manufactured openings. |
| T11 / T12 | Damaged / Damaged | ID10 | Main cardboard candidate | Assistant review identifies an off-seam cardboard split beside the shipping label; user independently selected Damaged in the displayed-image questions. |

Evidence descriptions are assistant observations unless explicitly attributed to the user. The user supplied categorical answers, not written damage explanations. Original question calls, answer text, image SHA-256, source IDs and scope/group decisions are retained in ignored `research/datasets/tampar-label-review-20261020/`.

Main candidates therefore comprise **ten images from five parcels: eight Normal views from four parcels and two Damaged views of one parcel**. Gift-wrap challenge coverage is two Normal views of one further parcel. These are source-supported, user-confirmed dependency groups; they do not establish independence from PackageDamage's training data or all possible external source derivatives.

## What this review permits

The twelve condition responses and six pairing decisions are complete. Preserve both views of each parcel together in every later partition, including any additional captures, derived crops or before/after states linked to that parcel. Never count T11 and T12 as two independent damaged parcels.

This is a small review/diagnostic panel, **not a training-ready dataset**. With one damaged parcel group, a group-separated train/validation/test partition cannot contain independent damaged examples in all three partitions. No split or training approval was inferred, no model ran on these images, and no source COCO label was converted into IILAS ground truth.

Keep these already inspected examples as a diagnostic/reference panel for now. Later decisions influenced by inspecting them must not be portrayed as blind final evaluation. Fresh held-out parcel groups are still needed. The earlier plan's proposed pilot target of 20 groups per class and final target of 50 independent test groups per class remain planning targets, not statistical guarantees or quotations from the original report.

## Review limitations retained

- Borderline corner/closure wear in T01/T02/T05/T06 produced assistant uncertainty versus human Normal decisions. The human answers are preserved; these cases merit the planned second human review and a clear minor-wear rule before a larger benchmark is sealed.
- T07/T08 involve different visibility targets: visible wrapper versus concealed cardboard. Do not treat their Normal decisions as evidence about underlying structural condition.
- Assistant review is not a second independent human annotator. Model predictions were not shown for this panel, but source context and prior assistant screening were available; this is not a fully blinded study.
- Identification markers, backgrounds, limited parcel types and two views per box limit transfer to IILAS camera inputs. Missing faces, contents, actual transit state and damage responsibility cannot be inferred.
- Preserve TAMPAR's source annotation vocabulary and all-category-0 observations separately; its tampering research target is not the IILAS physical-damage target.

## Next step and saved plan

The [MobileNetV2 training plan](../docs/superpowers/plans/2026-10-20-parcel-mobilenetv2.md) retains the report's TensorFlow/Keras MobileNetV2 primary model, EfficientNetB0 comparator and group-separated evaluation. PackageDamage is an additional frozen pretrained reference baseline, with its old diagnostic unchanged and licence/overlap limits retained.

Next work is a bounded runner with data/split gates and preprocessing tests, plus acquisition/review of more independent damaged and normal parcels under the public-data-only constraint. Actual fitting must wait for sufficient approved data and resource preflight. Do not train on these twelve photos merely to produce a model file. Photo integration and separately evaluated live sampled-camera analysis follow later; other AI modules and additional features remain deferred.

Attribution: Alexander Naumann, Felix Hertlein, Laura Dörr and Kai Furmans, TAMPAR, WACV 2024; [source record](https://zenodo.org/records/10057090), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Review annotations are local additions; source JPEG bytes are unchanged.
