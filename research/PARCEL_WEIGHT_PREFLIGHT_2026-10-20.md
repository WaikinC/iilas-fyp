# Parcel pretrained-weight source preflight — 20 October 2026

**Later checkpoint:** [The acquisition and offline compatibility report](PARCEL_PRETRAINED_WEIGHTS_2026-10-20.md) supersedes the pending acquisition and blanket local-use block below. Exact weights are now verified for the documented local academic workflow; redistribution remains a separate unresolved scope. Preserve this original preflight as history.

This is a source/version audit on MSI, not an acquired or loaded model. The saved collection sequence keeps weight acquisition after dataset approval. Pending parcel labels are not inferred from the user's continuation.

## Verified now

Installed metadata matches every pinned protocol package: TensorFlow 2.21.0, Keras 3.15.1, h5py 3.14.0, NumPy 2.4.2 and OpenCV headless 4.14.0.94. No TensorFlow runtime was imported for this audit.

Candidate URLs were derived from the installed Keras application source, whose SHA-256 hashes are preserved in ignored `outputs/parcel-weight-readiness-20261020/preflight.json`. Public HEAD requests returned HTTP 200 for both files. The first sandbox attempt failed DNS resolution; a separately permitted metadata-only request succeeded. No model response body was read.

| Backbone | Exact official file | Reported bytes | Publisher/source checksum evidence |
| --- | --- | ---: | --- |
| MobileNetV2, alpha 1.0, 224 input, no classification top | [mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5](https://storage.googleapis.com/tensorflow/keras-applications/mobilenet_v2/mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5) | 9,406,464 | Installed constructor does not pass a file hash. Server ETag is `f1a68526548f7541cda07e19ba6c85f4`; generation `1575584524548281`. This is metadata, not a verified local checksum. |
| EfficientNetB0, no classification top | [efficientnetb0_notop.h5](https://storage.googleapis.com/keras-applications/efficientnetb0_notop.h5) | 16,705,208 | Installed source pins MD5 `50bc09e76180e00e4465e1a485ddc09d`, matching the server ETag; generation `1576709077276379`. Payload verification remains unperformed. |

Combined advertised payload: 26,111,672 bytes. Full response metadata is in `http-metadata-01.json`; response sizes are not actual downloaded bytes. Local weight SHA-256 values remain unset.

## Compatibility checks to preserve

The project constructs both backbones with `weights=None`, then loads an explicit local file. This avoids automatic acquisition during fitting. ImageNet weights supply general visual features, not a trained parcel-condition decision; the new two-class head still needs approved parcel training.

[MobileNetV2's official documentation](https://www.tensorflow.org/api_docs/python/tf/keras/applications/MobileNetV2) requires input scaling to [-1,1]. The project's single Rescaling layer follows that convention. [EfficientNetB0's documentation](https://www.tensorflow.org/api_docs/python/tf/keras/applications/EfficientNetB0) expects [0,255] tensors and includes preprocessing internally. Installed Keras additionally inserts a stateless standard-deviation correction only for its ImageNet construction path. The project's offline local-weight path already inserts that correction after Normalization; preserve it and test numerical equivalence after acquiring real weights.

The browsed TensorFlow reference pages identify version 2.16.1, so they support general input conventions, not proof of compatibility with MSI's 2.21.0 installation. Installed Keras 3.15.1 source was inspected for the exact implementation. Actual checkpoint loading, feature equivalence and trained accuracy remain untested.

The [official Keras v3.15.1 code licence](https://github.com/keras-team/keras/blob/v3.15.1/LICENSE) is Apache-2.0. This audit has not bound checkpoint-specific licence evidence; do not fill the protocol's weight licence fields from the library licence alone. Public availability and HEAD success do not settle that separate provenance record.

## Next execution requirements

1. Complete parcel relevance, condition and family review, and assess independent class support. The first 12 TAMPAR photos remain diagnostic; the new 24 have only N04/N06 human Normal responses so far.
2. Bind exact checkpoint licence/source evidence. Acquire into a new ignored local directory with bounded downloads and exclusive file creation. Retain this preflight and verify live metadata again.
3. Verify byte length, provider checksums and a new local SHA-256. Preserve any failed attempt; do not silently substitute a different file.
4. Run sequential offline loading and synthetic-input compatibility checks under the existing CPU/RAM/time guards. Neither this check nor ImageNet accuracy measures parcel performance.
5. Freeze a separate real protocol with verified weight records only when all data gates pass. The current protocol template remains unchanged and deliberately unusable for real training.

No weight download, parcel prediction, model fit, dependency installation, application change, activation, Git publication or production operation occurred. PackageDamage and the other AI modules remain unchanged.

## Follow-up: licence evidence and actual data readiness

Further primary-source review did not establish an explicit licence tied to both exact HDF5 files. The historical [Keras Applications repository licence](https://github.com/keras-team/keras-applications/blob/master/LICENSE) is MIT for its software and documentation; current Keras uses Apache-2.0. Neither fact alone is recorded here as a checkpoint-specific grant.

The public [TensorFlow issue 13579](https://github.com/tensorflow/models/issues/13579), opened 1 August 2025, asks specifically about `efficientnetb0_notop.h5`. The inspected page shows an open question and no substantive answer. It is evidence of an unresolved question, not an authoritative licence interpretation or a prohibition on use.

The official [Keras EfficientNet model card](https://www.kaggle.com/models/keras/efficientnet/keras/efficientnet_b4_ra2_imagenet/1) explicitly lists Apache-2.0 for that variation. It is a different B4 checkpoint; its terms and bytes cannot be substituted for the selected B0 HDF5. Similarly, the [TensorFlow MobileNet checkpoint page](https://github.com/tensorflow/models/blob/master/research/slim/nets/mobilenet/README.md) lists original checkpoint archives, not proof of identity with the Keras no-top file. No alternative was downloaded or installed. An exact publisher clarification or an explicitly licensed, technically verified alternative remains the way to complete this provenance record; no external message was sent.

Recomputed from existing local human journals, without revising any answer:

| Real-photo panel | Human condition evidence | Training status |
| --- | --- | --- |
| Original TAMPAR primary subset | 10 photos: four Normal parcel groups and one Damaged group | Reserved diagnostic material, excluded from new training |
| Original gift-wrap challenge | Two photos in one group | Separate challenge scope |
| Expanded TAMPAR | 24 photos / 12 source groups; N04 and N06 Normal; 22 conditions pending | No human-confirmed groups or accepted training labels |

The two panels together contain 36 photos, but that is not 36 independent parcels or 36 approved training examples. There are currently zero approved training groups in these panels. The runner's five-groups-per-class intake floor is only a software guard; meeting it would not establish scientific adequacy. Do not count reserved diagnostic examples toward a new training split.

Four focused existing manifest tests passed: pending/invalid review fields, insufficient groups and reserved panel rejection, connected groups crossing splits, and reserved-image renaming. These use software fixtures and demonstrate rejection behaviour, not model quality. Recomputed counts and test output are saved as `data-readiness-02.json` and `readiness-guard-tests-02.txt` in the ignored preflight output directory.

The immediate data work remains visible-image labels, relevance and group confirmation followed by more independent damaged parcels as needed. Further generic licence searches or repeated software smoke runs will not close that gap. Photo/camera capture implementation can be prepared separately with the model unavailable; it must not present simulated scores as AI results.
