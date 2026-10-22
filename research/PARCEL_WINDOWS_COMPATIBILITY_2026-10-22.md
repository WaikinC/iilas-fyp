# Parcel Windows inference compatibility — 22 October 2026

The exact accepted MobileNetV2/CLAHE artifact runs on MSI's native Windows CPU environment. On all 162 already-exposed validation images, direct batch-one CPU inference, compiled batch-four CPU inference and the original GPU reference produced the same class decisions. Independent raw/state/native reconstruction passed. This supports numerical compatibility on these inputs; it is not a new independent accuracy result or operational acceptance.

| Path on the same exposed VALID set | Correct / images | Damaged precision | Damaged recall |
| --- | ---: | ---: | ---: |
| Windows CPU, direct batch one | 148/162 (91.36%) | 52/63 (82.54%) | 52/55 (94.55%) |
| Windows CPU, compiled batch four | 148/162 (91.36%) | 52/63 (82.54%) | 52/55 (94.55%) |
| Original WSL GPU, compiled batch four | 148/162 (91.36%) | 52/63 (82.54%) | 52/55 (94.55%) |

CPU batch-one versus CPU batch-four probabilities differ by at most 0.000001252. CPU batch-one versus the original GPU reference differs by at most 0.003758252, with mean absolute difference 0.000367865. Outputs are not numerically identical. No labels flipped on these 162 images; that does not prove identical decisions on future inputs or assign batch-one the GPU source-test accuracy.

The fixed cohort has 107 Normal and 55 Damaged views in 159 conservative dependency groups. It is the unchanged development validation set; no TEST inputs were used. Four complete snapshots agree across 263 model variables and six optimizer variables, including Adam iteration 945. All artifact hashes remain the accepted `2fffa7aa1a8c33c6698a97e38d028858b8433aec84dbd582c01094711a0ae4da`. CPU placement, one-CPU affinity, prepared tensor hashes, compiled logits/losses, complete order and progress were checked.

The native worker completed in 55.030 seconds with 534,110,208 bytes peak aggregate RSS. The controller, worker and confirmed Job drain completed in 58.401 seconds, within the prospective 600-second/2-GiB research limits. This multi-image comparison is **not a 25-second single-photo cold-request proof**. It does not measure browser capture, upload, end-to-end latency or live-camera quality.

Independent source review corrected two lifecycle gaps before execution: a stale native GPU lease must block Windows launch, and a missing Job drain monitor after possible worker creation must retain the research locks with unconfirmed cleanup. The original source and RED fixtures remain preserved. The actual run terminated cleanly after the GPU source evaluation; the two model jobs did not overlap.

Local ignored evidence: summary SHA-256 `9a4e9dd21fad5bc991c99efabd6761189fd974774782c646c91ea8e503448b4d`; independent result receipt SHA-256 `98748d0dcef41bbb4a3feba1a4601e37501c8701ac5b088a15bb553bdc9e7802`. The reviewer checked raw/tensor/state/artifact receipts and source without independently decoding pixels or loading model binaries.

Next is a separately reviewed, closed artifact descriptor/adapter, followed by an actual bounded cold request on a fixed already-exposed validation image. Full offline provenance review and compact per-request integrity checks have different costs. Both operational API gates and server pins stay closed until intended-use acceptance is complete. WSL/GPU remains the verified training/source-evaluation environment; this result establishes a native Windows CPU inference path for the saved model. Other AI and additional features remain deferred.
