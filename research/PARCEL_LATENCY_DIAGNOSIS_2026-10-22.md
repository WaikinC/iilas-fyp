# Parcel response-time diagnosis — 22 October 2026

Latest implementation: [the bounded model-reuse primitive now passes a real two-image feasibility test](PARCEL_MODEL_REUSE_2026-10-22.md), with 0.454/0.311-second image evaluations after a 6.987-second context load. Application worker-lifecycle integration and actual photo/live acceptance remain incomplete.

One supervised diagnostic on MSI identified startup and loading as the main measured cost. The actual model forward call took **0.237 seconds**; the full instrumented request took **12.294 seconds**. The earlier default-path proof took 22.942 seconds. Production code, model, prediction rules and resource limits were unchanged, so these different observations must not be presented as an implemented speedup.

Response time covers everything from request preparation through the returned result and process cleanup. It is different from the neural network's forward calculation alone. Both timings concern one image, not all faces or the contents of a parcel.

| Measured boundary | Wall time | Worker process CPU time |
| --- | ---: | ---: |
| TensorFlow import | 7.173 s | 3.781 s |
| Keras model loading | 0.961 s | 0.703 s |
| Image decode and CLAHE preparation | 0.327 s | 0.203 s |
| Model forward calculation | 0.237 s | 0.188 s |
| Four artifact checks combined | 0.081 s | 0.031 s |
| Two complete state snapshots combined | 0.089 s | 0.078 s |
| Adapter prediction, inclusive | 8.898 s | 5.000 s |
| Instrumented worker scope, inclusive | 9.631 s | 5.203 s |
| Complete measured request | 12.294 s | Not a single worker CPU measurement |

Inclusive boundaries overlap: do not add all rows. TensorFlow import is included in model loading's enclosing function and adapter prediction. CPU timers have the host's resolution and exclude child processes. Wall-minus-CPU time is not proof of a particular filesystem, scheduler or antivirus cause.

The parent resource sampler consumed 2.538 seconds of wall intervals and 1.469 seconds of parent CPU across 148 samples; its log writes consumed 0.007 seconds. Sampling overlaps the worker's elapsed time and cannot simply be subtracted to predict uninstrumented application latency. Peak parent-plus-descendant working set was **527,781,888 bytes (503.33 MiB)**, below the unchanged 2-GiB cap.

## Method and integrity

The diagnostic used the same first sorted, exposed validation image and the original accepted descriptor/model. It used the existing executor and manager supervision with explicit diagnostic manager/worker entry points, rather than replacing the scientific code or validators. Python's [per-code execution monitoring](https://docs.python.org/3.13/library/sys.monitoring.html) observed only seven frozen adapter functions and selected source-line boundaries. It did not record arguments, model variables or return values. Production adapter/runtime/API files were unchanged.

The 25-second request bound, original memory/admission/disk/output limits and one-CPU policy remained. Raw timing logs were bounded to 64 KiB and stored in the already permitted request temporary subtree. Capture followed confirmed Job drain; stock cleanup removed temporary files. Fifteen focused software fixtures passed, including timeout/partial-log handling and retention when cleanup is uncertain.

The actual diagnostic completed with exit zero. Independent review reconstructed all 31 timing events, 148 resource samples, seven captured request-file hashes, source identities, exact prior CPU probabilities and clean shutdown. The original full-state checks returned twice and artifact checks four times; unchanged 263 model variables, six optimizer variables and iteration 945 follow the pinned successful worker checks. Separate variable inventories were not exported. All four shared workload leases were absent after cleanup.

No model training, TEST rerun, threshold change or new accuracy estimate occurred. The existing publisher-source benchmark remains 90.67% accuracy. This one diagnostic is neither a latency distribution nor proof of intended-use photo/live quality.

| Evidence | SHA-256 |
| --- | --- |
| Diagnostic source | `31843424a4545f41c05ab02724aeabd003dbf7029bd26bf090e308b24d9bac77` |
| Request | `3ebc51375276ef58e9be628ddc4bf528761dee1665b5b6d94d8f73ab98fa401e` |
| Completed proof | `c3f2b77e378413728bd8251651d6e36937310704f7d72ccd36e023bf10b6be07` |
| Independent timing review | `90c9cd84bffa383e425040c526f274f58802c48c641680bbab59a10608cd483b` |

## Real loopback HTTP verification

A separate actual uvicorn service bound a preallocated ephemeral port on literal `127.0.0.1`. Its default executor completed startup artifact audit. Real HTTP health returned 200 with artifact readiness and vision false; an invalid credential returned 401. Authenticated photo/live requests returned 503 without labels and started no further subprocesses. Startup used one manager and 12 bounded Git validation subprocesses. The check finished in 2.346 seconds with verified server shutdown and all shared leases absent.

Eight focused HTTP observation/cleanup fixtures passed. Credentials existed only in memory; headers, environment, raw responses and access logs were not saved. Independent review passed. Completed HTTP record SHA-256: `03692ebd8a57c51486749e6bbb79bbe0ed0847c9d6b473939eaefac0108df0a5`; independent review: `d0f64e2eb2d975596271ddc47a8add198dd4cc020cd4781018409c9cf38ec010`.

This closes the earlier ASGI-only network-test gap. It is a closed-route check, not browser/Firebase integration, successful HTTP inference or physical-camera validation. The ephemeral service was stopped afterward.

## Next implementation

The measured bottleneck supports loading TensorFlow and the accepted model once within a supervised worker, then serially reusing the model for images. The next bounded step is an internal reuse primitive that preserves exact preprocessing, artifact bindings, uncalibrated scores, human review, baseline/full per-image state checks and closed approval. It must be compared with the original cold result before application use. Persistent service lifetime, cancellation, native resource ownership and actual frame timing still need their own implementation and verification; they are not established by this diagnostic.

The live workflow marks a result Current only while its age is strictly below 15 seconds. The previous 22.94-second request cannot satisfy that freshness rule even before network/render overhead. This 12.29-second instrumented observation does not prove robust compliance either. Keep the existing freshness rule and request limits; do not redefine them to make a run pass.

## Public-data follow-up

Only [DefectAtlas v1's original overview CSV](https://zenodo.org/records/21719370/files/overview.csv?download=1) was acquired from its [open CC BY 4.0 publisher record](https://zenodo.org/records/21719370). The 2,064,240-byte file matches publisher MD5 `4a2e893c84c52ef58aacb4846d8683ef`; local SHA-256 is `420408bdc0cfcb7c2e2624dbd5f421d9b3a22fd900b63a15104a47dd61d282e7`.

Its 13,233 rows include 1,426 cardboard surface records: 734 defect and 692 no_defect. Its 15-column schema contains no physical-object, parcel, session or reference-pair ID. Sequential filename coincidences do not establish identity. No imagery was downloaded or scored, and shipping-parcel relevance remains unverified. This source stays on hold for intended-use acceptance; it is not another independent parcel test set. The failed initial network attempt is preserved separately from the successful host fallback and does not prove publisher unavailability.

ARMBench access/licence/schema and RoboCOIN condition/group provenance also remain unresolved. Additional public material imagery cannot establish real staff-camera accuracy or hidden/internal damage. Public-only collection remains the constraint; no owned-box collection was authorized.

All datasets, image-level records, models and raw outputs remain ignored and local. Both application admission gates remain false and backend pins null. Other AI modules, additional features, production changes and deployment remain deferred.
