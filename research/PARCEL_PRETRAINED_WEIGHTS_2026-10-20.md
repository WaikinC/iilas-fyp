# Parcel pretrained checkpoints acquired and checked — 20 October 2026

Supersedes the acquisition/licence-blocked status in `PARCEL_WEIGHT_PREFLIGHT_2026-10-20.md` for this local educational pilot. No redistribution or production-use clearance is claimed.

## Research-use basis

[Keras Applications](https://keras.io/api/applications/) presents its supplied pretrained models for feature extraction and fine-tuning. [Keras's EfficientNet example](https://keras.io/examples/vision/image_classification_efficientnet_fine_tuning/) specifically uses B0 without its classification top at 224 pixels, while [TensorFlow's tutorial](https://www.tensorflow.org/tutorials/images/transfer_learning) documents MobileNetV2 transfer learning. Installed Keras 3.15.1 binds the selected variants to the exact downloaded files.

The scope-limited decision is to follow those publisher-documented uses for the authorised local academic experiment. This is a reasoned use assessment, not a newly discovered checkpoint-specific SPDX grant. The earlier demand for a bespoke filename-specific licence was too broad as a blocker for this documented local workflow. Formal redistribution terms for the historical HDF5 artifacts remain unestablished. An explicitly Apache-labelled Keras B0 RandAugment alternative was found, but its different training recipe and unverified conversion were not substituted.

The detailed primary-source assessment is preserved with the ignored weights. The source library's licence alone was not used to declare the weight files Apache-2.0.

## Acquisition

Local ignored directory: `research/datasets/parcel-imagenet-20261020`. Exact public URLs, status/headers, generation, elapsed time, bytes and assessment hash are in its `acquisition.json`. Acquisition used exclusive files, identity encoding, bounded bodies/deadlines and no ML imports.

| Backbone | Bytes | MD5 | Local SHA-256 |
| --- | ---: | --- | --- |
| MobileNetV2 alpha 1.0 / 224 / no top | 9,406,464 | `f1a68526548f7541cda07e19ba6c85f4` | `f8aff69536bd77a692c594f559c798c19bf7f3f36668fc9fa00b21c6aab4797c` |
| EfficientNetB0 / no top | 16,705,208 | `50bc09e76180e00e4465e1a485ddc09d` | `0683edcf6151811fb3ddd6f098ac48df644d74592c4919a5acdee1c37554add2` |

Both lengths, provider ETags/MD5s and generations matched the earlier source record; EfficientNet MD5 also matches installed source. Combined successful payload was 26,111,672 bytes. No dataset, model or token was uploaded.

## Offline compatibility

Two sequential Windows Job-supervised checks used synthetic pixels, CPU/one thread, 2 GiB RSS limit, 3 GiB available-memory startup floor and 768 MiB continuing floor. All network connections were disabled in workers; canonical Keras construction used verified local cache copies.

Both backbones loaded with **identical learned tensors** to the canonical ImageNet constructors, frozen backbones and matching save/reload output. With identical input values, backbone feature differences were exactly zero. EfficientNet's embedded normalization correction matched the canonical path exactly.

The first MobileNet probe failed a 1e-5 feature tolerance because NumPy division and the application's equivalent Rescaling multiplication differ by up to 1.1920928955078125e-7 in FP32 input values. The failed run and original probe remain preserved. A separate diagnostic verified identical weights and zero same-input feature difference; the canonical preprocessing comparison had maximum absolute feature difference 4.863739013671875e-5, within the explicitly recorded 1e-4 absolute tolerance. Application preprocessing/model code was not changed to conceal this finding.

Successful runs took 8.119 seconds / 416,808,960 peak RSS bytes for MobileNetV2 and 10.139 seconds / 542,212,096 bytes for EfficientNetB0. Evidence is in ignored `research/datasets/parcel-weight-compatibility-20261020-v2/`; the failed first probe is in the unsuffixed directory.

These checks establish checkpoint loading and numerical compatibility. Their classifier heads are untrained software artifacts and must never be activated. They do not measure parcel accuracy. The separate publisher-labelled pilot protocol binds the verified original weights and compatibility evidence; real fitting/evaluation is recorded separately.
