# Parcel model reuse feasibility — 22 October 2026

The new internal reuse primitive completed a real MSI test: load the accepted model once, evaluate the same fixed exposed validation photograph twice serially, close the context and drain the native Job. The image evaluations took **0.454 seconds** and **0.311 seconds** after a **6.987-second context load**. Both outputs exactly match the original CPU probabilities. The application has not yet been connected to this reuse path.

| Boundary | Observed wall time |
| --- | ---: |
| Context creation, including TensorFlow/model loading and baseline checks | 6.987 s |
| First image evaluation, including per-image checks | 0.454 s |
| Second image evaluation, including per-image checks | 0.311 s |
| Context close | 0.009 s |
| Whole measured worker sequence | 7.993 s |
| Whole measured request, including supervision and cleanup | 11.356 s |

Peak parent-plus-descendant RAM was **543,014,912 bytes (517.86 MiB)**. The original 25-second whole-job limit, 2-GiB aggregate RAM cap, 3-GiB startup admission, 768-MiB running floor, one CPU/thread, disk/output limits and native process controls were unchanged. The worker exited successfully; the parent confirmed zero Job members and stock request cleanup. All four shared workload leases were absent afterward.

These are two observations of one already exposed image inside one disposable Job. They are not actual HTTP response times, a live-camera session, a latency distribution or a new accuracy result. Startup remains necessary for a fresh worker. The earlier cold/default-path and timing-diagnostic runs are different scopes and are not paired speed benchmarks.

## Implementation and checks

`research/parcel_warm_model.py` adds `load_context`, `predict` and `close_context`. It imports no ML library at module import. Creation requires existing supervised CPU/offline worker setup, canonical ignored `tmp` containment and an exactly matching cached temporary directory. The original compiled/safe-mode loader may be entered only once in a process, including after close or failed loading. Another context then requires a fresh worker.

Opaque handles and a nonblocking per-context lock reject foreign, unloaded, closed, concurrent and reentrant use. The immutable initial snapshot is compared with the complete pre-image snapshot; each prediction also compares the complete post-image snapshot. Each image retains the original four artifact hashes and two full model/optimizer snapshots, exact RGB/CLAHE/224-pixel preparation, CPU output, shape/probability checks, class order and tie abstention. Source/descriptor/artifact drift or state mutation fails closed.

The 17-field result remains uncalibrated, requires human review, carries operational approval false and acceptance null, and binds exact image/model/descriptor/evaluation identities. Neither a handle nor a request can grant approval. Close drops Python references; only process termination and confirmed Job drain establish release of the TensorFlow allocator.

Twenty artificial module tests and eight host-side probe fixtures pass. The unchanged cold adapter's 31 fixtures also passed. Independent review identified and verified a correction to the temporary-directory precondition before real execution. Sandbox-only asyncio fixture stalls were separately preserved and their specifically identified test processes terminated before one successful host fixture run; no stalled attempt is counted as passing.

Final secret checks passed for 186 tracked files, 246 reachable history blobs and 410 current tracked/untracked files. `git diff --check` passed, with zero tracked datasets, outputs or private-configuration files. Frontend, Firebase and browser suites were not rerun for this internal Python-only addition; the application has not been switched to it.

## Actual evidence

The prospective request fixed exactly two serial calls on the first sorted exposed validation image, with externally pinned new module and harness hashes. No warmup, cache purge, TEST access, training, threshold change or operational activation occurred. The new module is independently pinned by this request; the original descriptor alone does not certify it. Original adapter/runtime/API and scientific sources remain unchanged.

Local call observation reconstructed **one original loader**, one loading baseline, then exactly **two full snapshots and four artifact checks per image**. Both 17-field results were Normal with probabilities `[0.9840923547744751, 0.015907661989331245]`, exactly equal to the previous CPU result. These uncalibrated probabilities are not a new accuracy estimate. Successful frozen checks enforce 263 model variables, six optimizer variables and iteration 945; separate variable inventories were not exported.

Independent review checked all 34 raw call events, 146 resource samples, seven captured request files, source identities, results, context close, Job drain and cleanup without rerunning inference or reading image/model bytes.

| Record | SHA-256 |
| --- | --- |
| New reuse module | `828845bd2d3dd5dc4de4c403eedb9fbc395a16b26dce553f9bef07bfa1edc302` |
| Module tests | `3138f543837d90169682f20ad75536867ca90198abf032e0b87c908e6a31f9e5` |
| Probe harness | `0a0a47c4c0da9a80d820ff66338d4aa0f4bc7a57591801299cfb8997a2edb0ed` |
| Request | `94d01b70bece91a691a3e34270403b41bdb7cce82b34ed6367f5cff2d50a164d` |
| Completed proof | `66e0437daf1271352d0ba24ea56bf67a4d8794579332d48c92e3a20c8f8e4f7a` |
| Independent actual review | `fba40c92c4ebe5eb38b4d66b348c20ff9669a06a01fb6d53e45ab44be284d7b1` |

## Next core work

Integrate reuse into a bounded application worker lifecycle with serial admission, expiry, per-request deadlines, cancellation, recovery and verified drain. This probe processes both images inside one 25-second Job; it does not implement persistence across HTTP requests or the 120-second camera workflow. Any prospective worker-lifetime profile must distinguish the Job lifetime from the unchanged request deadline and must not silently relax current caps.

Then verify positive photo and sampled-frame transport through the application, intended-use quality and actual camera/device behavior. Live Current age remains strictly below 15 seconds; subsecond internal prediction alone cannot establish end-to-end freshness. Both API gates remain false and backend pins null. The public benchmark remains 90.67% accuracy; independent photo/camera limitations and the public-only data restriction remain.

Datasets, weights, raw predictions and private configuration remain ignored and local. No deployment, production mutation, Git staging, commit or push occurred. Other AI models and additional features remain deferred.
