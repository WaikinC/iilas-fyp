# Parcel publisher-source evaluation — 22 October 2026

The fixed held-out publisher-source run completed on MSI and passed independent raw, native, state and statistical verification. **Primary MobileNetV2 scored 90.67% accuracy (68/75), exceeding the requested 80% point-estimate target on this source benchmark.** This is not staff-photo, independent-source or live-camera acceptance. MobileNetV2 remains primary and EfficientNetB0 remains the fixed comparator.

| Model / preprocessing | Correct / images | Accuracy | Damaged precision | Damaged recall | Macro F1 | Equal-component accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MobileNetV2 / CLAHE, primary | 68/75 | 90.67% | 90.48% (38/42) | 92.68% (38/41) | 0.9056 | 90.69% |
| EfficientNetB0 / none, comparator | 69/75 | 92.00% | 94.87% (37/39) | 90.24% (37/41) | 0.9196 | 92.58% |
| Always Normal reference | 34/75 | 45.33% | Undefined: no Damaged predictions | 0% | 0.3119 | 55.83% |

There were no ties, abstentions or inference failures among the 75 admitted images. MobileNetV2 missed three publisher-Damaged images and flagged four Normal images; EfficientNetB0 missed four and flagged two. With rows Normal/Damaged and columns predicted Normal/Damaged/Abstain, their confusion matrices are `[[30,4,0],[3,38,0]]` and `[[32,2,0],[4,37,0]]`.

The predeclared 2,000 paired component-bootstrap draws give image-accuracy 95% intervals of **83.82–96.43%** for MobileNetV2 and **85.71–97.33%** for EfficientNetB0. The comparator-minus-primary difference is +1.33 percentage points, interval −4.17 to +7.41. This does not establish an accuracy advantage or justify changing the primary model. MobileNetV2 damage-precision and recall intervals are 79.07–98.04% and 85.18–100%; confidence scores remain uncalibrated.

## Frozen sensitivity analysis and coverage

The stricter publisher-partition subset was fixed before predictions and uses the same saved outputs, without another inference or model change.

| Model | Strict accuracy | Damaged precision | Damaged recall | Macro F1 |
| --- | ---: | ---: | ---: | ---: |
| MobileNetV2 / CLAHE | 91.49% (43/47) | 78.95% (15/19) | 100% (15/15) | 0.9078 |
| EfficientNetB0 / none | 91.49% (43/47) | 86.67% (13/15) | 86.67% (13/15) | 0.9021 |

Strict support is 32 Normal and 15 Damaged images in 43 components. Always Normal scores 68.09% while detecting no damage. MobileNetV2's perfect observed strict recall has a degenerate bootstrap interval because every observed damaged case was detected; it does not prove perfect future recall.

The primary set has 34 Normal and 41 Damaged images in 60 conservative dependency components. It covers **75/102 original TEST views (73.53%)**. All 102 dispositions remain recorded: 27 unique exclusions, including overlapping rights, exposure and suitability holds. Seven initial rights-held files were never opened. The [prediction-blind audit](PARCEL_SOURCE_TEST_AUDIT_2026-10-21.md) preserves both locked reviewer records, their disagreements and every exclusion. No cases were replaced, relabelled or removed using model errors.

## Execution and verification

The accepted development models were evaluated once, in their predeclared order, using compiled batches of four with a final batch of three. Training was disabled; original artifact hashes, all model/nontrainable/optimizer variables and Adam counters 945/1,512 remained unchanged. All materialized scoring tensors were on GPU:0. Native workers completed in 41.357 and 43.620 seconds, with clean shutdown and peak aggregate charges of 3,212,681,216 and 3,271,372,800 bytes, below the unchanged 4 GiB cap. The whole evaluation and scoring phase took 119.512 seconds against 600.

The evaluator first passed artificial checks on Windows and WSL, a bounded metadata transfer, and an actual no-update GPU preflight on six already-exposed validation images. A transport bug involving six old supporting contact-sheet references was corrected prospectively; the failed metadata attempt and original source are preserved. It caused no TEST model execution. The eventual source evaluation population reservation is permanently consumed; do not rerun it to improve results.

Independent formulas, frozen before reading TEST outputs, reproduce all primary/strict image and component-weighted metrics, losses, baselines, confusion matrices and paired intervals. The full raw predictions and native/state evidence remain local and ignored. Evaluation report SHA-256: `b4f6727ce08630f8289b572e6a9d4ab71d730aff102250aa4af505bc27252fcc`. Independent final review SHA-256: `36008a2743e601e95bf205e7db97e7248db80194d58543239538cc73c0419833`.

## Limits and next core work

The labels are the publisher's Normal/Damaged labels. The collection includes studio and product imagery; visual style or background shortcuts may contribute. Known components are conservative dependencies, not verified physical parcels. Unmatched public previews, unknown physical relationships and individual-asset rights uncertainty remain. Bootstrap intervals cannot correct those gaps or establish generalisation to a different camera/source. The older Kaputt results use different inputs and labels and are not a controlled before/after comparison with this benchmark.

The [Windows validation compatibility run](PARCEL_WINDOWS_COMPATIBILITY_2026-10-22.md) has now passed independent review: all 162 exposed validation decisions agree across CPU batch-one, CPU batch-four and the original GPU path, with small probability differences and unchanged state. It does not add a new independent accuracy result. Next are the closed artifact adapter, a bounded cold photo-inference path and separate intended-use photo/live evidence. Both operational model pins remain closed, and the app continues to record Unavailable. Public-only data collection persists; other AI models and additional features remain deferred. No deployment, production change, dataset/model upload or Git publication occurred.
