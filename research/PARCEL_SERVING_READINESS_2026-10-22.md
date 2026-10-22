# Parcel serving and cold-photo proof — 22 October 2026

Latest: [typed executor integration is now verified](PARCEL_TYPED_TRANSPORT_VERIFICATION_2026-10-22.md), including an actual 22.942-second/500.43-MiB cold prediction through the stock manager/inference path. The earlier adapter-only results below are preserved history, not current integrated latency. Both operational gates remain closed; intended-use acceptance is incomplete.

The accepted MobileNetV2/CLAHE model now has a verified local serving adapter on MSI. One fresh Windows CPU photo request completed in **7.90 seconds**, below the unchanged 25-second limit, with **461.93 MiB peak aggregate RAM** against 2 GiB and confirmed process cleanup. Independent review verified the saved request, response, resources and provenance. This completes the closed local artifact/one-photo execution step; the IILAS application still records Unavailable until its integration and intended-use acceptance are complete.

| Check | Verified result | Interpretation |
| --- | --- | --- |
| New adapter fixtures | 22 pass | Software checks with fabricated metadata and tensors |
| Existing input/model/serving regressions | 4 + 1 + 16 pass | Existing behavior preserved; no real model training in these tests |
| Existing runtime wire contract | 2 pass | Class order, null acceptance and rejection of self-declared approval preserved |
| Cold-proof harness fixtures | 7 pass | Prospective resource/lifecycle contract checks |
| Offline provenance audit | 196 roles, 447 explicit metadata relocations | Accepted development, once-only source evaluation and Windows compatibility records verified |
| One native cold photo request | 7.902 seconds total; 7.472 seconds native worker | Includes request validation, fresh child imports, decode/preparation, model load/inference, saved response and confirmed Job drain |
| Peak aggregate working set | 484,368,384 bytes / 461.93 MiB | Below the unchanged 2-GiB limit; one CPU/thread |
| Result on the fixed exposed validation image | Normal; exact prior CPU probabilities | One compatibility observation, not a new accuracy estimate |

The measurement ends after the persisted response, worker proof, cleanup receipt and final resource check. Writing the final audit receipt is subsequent bookkeeping. The input was fixed before execution as the first sorted image in the existing 162-image validation set; no TEST image, speed-based input search, warmup, persistent model cache or retry was used. The request retains the original 3-GiB RAM admission requirement, 768-MiB live floor, 2-GiB free-disk floor and 64-MiB output limit. All shared workload leases are absent after verified cleanup.

The 52 distinct focused software checks above pass. Current tracked-file, reachable-history and expanded tracked/untracked secret checks also pass, with no datasets or outputs tracked. No frontend, emulator or browser suite was rerun for this research-only checkpoint; application code and operational gates were unchanged.

## What the adapter does

`research/parcel_gpu_serving.py` separates a full offline provenance audit from compact per-request checks against an externally supplied physical descriptor hash. The core, offline audit receipt and final descriptor have acyclic bindings. A descriptor is local integrity evidence; it cannot approve a model or open an application gate.

The supervised prediction branch verifies the accepted model and helper hashes, uses the existing OpenCV RGB/CLAHE/224-pixel letterbox preparation, safely loads the original compiled Keras artifact and makes one CPU call with training disabled. Mandatory checks compare all 263 model variables and six optimizer variables before and after inference, preserve Adam iteration 945 and verify unchanged artifact bytes. The actual cold worker succeeded through these checks; separate variable inventories were not exported by this request. Its encoded input was hashed; decoded-pixel identity relies on the earlier pinned compatibility mapping and unchanged decoder, without a second decode.

The response retains the existing 17 fields, exact evidence/model/descriptor/evaluation identities, uncalibrated scores and mandatory human review. Exact score ties abstain. Invalid, unavailable or failed inputs do not become Normal. Operational approval remains false and the acceptance hash remains null.

## Corrections and retained evidence

The full audit uses narrow 32-MiB bounds for two exact existing admission/candidate metadata roles and their approved aliases; ordinary roles remain bounded at 8 MiB and the compact descriptor/receipt at 256 KiB. These are metadata parser limits, not changes to the native request's memory or time limits.

Cross-platform reconstruction produced a one-ULP interval difference. The separately implemented independent weighted estimator also represents quantities such as 26.5 with slightly different floating sums, up to about 1.42e-14. Only declared finite scientific metric/interval values and the pinned independent receipt's known derived component-weight fields use fixed 1e-12 relative/absolute comparison tolerances. Original integer counts, image confusion counts, memberships, labels, hashes and source reconstruction support values remain exact. No source report or model output was edited. Failed checks, earlier source snapshots and a superseded review receipt remain preserved locally.

Final adapter source SHA-256: `7d71e3363e1dbd05dcd533e8dd48ecdd38cc15414d20e049fc6884463072d2d3`. Final descriptor SHA-256: `397037bbc46123528990db625388ac93951615ec8ab24044d1fc4e11d2a83ccd`. Actual cold proof SHA-256: `a94a053d3b7b523b16af65d3b0d2aaea00efed62e2f89c2568afab8bc925bfb1`. Independent actual-result review SHA-256: `1c4b675fbef8b02aa3cbdb980d94940082fe31b25acf68efac04b885b6ca8c95`. Detailed records, datasets and model files remain ignored and local.

## What remains

The [publisher-source benchmark](PARCEL_SOURCE_TEST_EVALUATION_2026-10-22.md) remains MobileNetV2 90.67% accuracy, 90.48% Damaged precision and 92.68% recall. The [Windows comparison](PARCEL_WINDOWS_COMPATIBILITY_2026-10-22.md) supports compatibility on exposed validation images. Neither result establishes staff-photo or physical-camera quality, and one cold request does not establish robust latency or live throughput.

Next is explicit typed integration of the new descriptor into the existing photo/live transport while keeping both API gates false and backend pins null. That amendment must preserve original scientific code evidence, existing resource/cancellation/identity checks and all historical results; changing the current runtime must not silently invalidate or rewrite an earlier compatibility proof. Intended-use independent photo and real-camera/session evidence, justified acceptance criteria and integrated device/browser verification remain incomplete under the user's public-only collection restriction. Do not rerun or tune against the consumed source TEST population. Other AI and additional features remain deferred. No deployment, production change or Git publication occurred.
