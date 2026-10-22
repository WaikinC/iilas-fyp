# Parcel typed transport verification — 22 October 2026

The accepted MobileNetV2 model now runs through the existing Windows parcel executor using an explicit GPU-trained-artifact descriptor. A real startup audit and one cold prediction completed with the original process, timeout, memory and cleanup controls. This advances local integration; intended-use photo and live-camera acceptance remain incomplete.

| Verification | Result | Scope |
| --- | --- | --- |
| Runtime regressions | 40 passed, including native lifecycle tests | Artifact types, cancellation, timeout, descendants and cleanup |
| API/live/adapter/input/model/legacy regressions | 92 passed | Includes the real native API disconnect case; artificial inputs are software checks |
| Independent proof-harness fixtures | 10 passed | Resource observation and stock cleanup behavior |
| API-proof observation fixtures | 6 passed | Exact manager/Git process classification without saving arguments or credentials |
| Offline evidence reconstruction | 220 metadata roles, 518 explicit relocations | Original scientific evidence preserved; current source identities checked separately |
| Actual executor audit | 2.371 seconds; 161,021,952 bytes peak aggregate RAM | Default manager and worker; no model inference |
| Actual cold prediction | 22.942 seconds; 524,738,560 bytes peak aggregate RAM (500.43 MiB) | One fixed, previously exposed validation photo; default manager/inference path |
| Actual application lifespan and ASGI routes | Startup audit succeeded; health 200; unauthorized 401; photo/live 503 | Actual default executor, no mocked route or approval gate; zero prediction processes |

The source benchmark remains **90.67% accuracy, 90.48% Damaged precision and 92.68% Damaged recall**. This integration run produces no new accuracy estimate. It uses the same first sorted exposed validation image as the earlier compatibility checks, with identical CPU probabilities and a Normal result. No training, TEST rerun, model selection, relabelling or optimizer update occurred.

## Implementation

`ParcelGPUArtifacts` carries a server-owned descriptor path and physical SHA-256. The existing executor serializes an explicit artifact tag and dispatches either the original selection format or the new descriptor format. Mixed, incomplete and malformed configurations fail closed. The API captures one complete configuration at creation; request bodies cannot choose a model or grant approval.

The same Windows Job supervision, minimal child environment, cancellation, ownership, response identity and descendant-drain controls remain in use. The adapter verifies the accepted model, exact RGB/CLAHE/224-pixel preprocessing, class order and immutable model/optimizer state. The original 25-second request limit, 2-GiB aggregate RAM cap, 3-GiB startup admission, 768-MiB running memory floor, one CPU/thread, 2-GiB free-disk floor and 64-MiB output cap were unchanged.

Original code snapshots and a prospective versioned provenance amendment preserve the earlier benchmark and compatibility evidence. Those snapshots are local evidence only and are never imported or executed. A new version-2 descriptor binds current adapter/runtime/API source hashes. Historical source exceptions cannot authorize changes to current code.

## Actual run and limits

Request `34681993-9dc3-4675-8a35-477ed877219e` completed with exit zero. Both audit and prediction independently confirmed zero remaining outer Job members after stock cleanup. The proof observes seven bounded request files before their normal deletion; it does not replace the manager, worker or lifecycle implementation. Mandatory frozen worker checks establish unchanged 263 model variables, six optimizer variables and iteration 945; separate variable inventories were not exported.

Independent review verified the saved request, all seven captured files per phase, resource samples, source/descriptor hashes, exact result and stock cleanup. All four shared workload leases were absent after completion. No second prediction was run for that review.

The prediction consumed about **91.8% of the 25-second budget**. It is a successful single observation with little latency headroom, not a throughput or reliability claim. The older direct adapter measurement of 7.90 seconds used a different execution path/run and must not substitute for the 22.94-second integrated result. The available records do not isolate the reason for that difference. Profile fresh imports, model loading, validation and inference on exposed development inputs before choosing a speed improvement. Do not increase the cap or silently remove state/integrity checks.

This Windows serving request uses CPU; the model was trained on the MSI GPU through WSL. This checkpoint adds no persistent model cache or GPU serving process.

## Actual API boundary check

A separate real application instance captured the configured descriptor once and successfully audited it through the default executor. Changing its environment afterward did not change the captured identity. Startup took 1.998 seconds and started one manager plus 12 bounded Git path-validation processes, with no unknown subprocesses. Health reported artifact readiness with vision and operational approval false.

An unauthorized request returned 401 without reading its body. Authenticated, structurally valid photo and sampled-live requests returned 503 without labels or any additional subprocess. Their placeholder image bytes were never decoded; this checks closed-route behavior, not image quality. A caller-supplied descriptor or approval flag could not open the photo gate. The generated authentication credential existed only in memory and was not saved.

This used the actual ASGI application and lifespan directly. It did not start a network HTTP server, exercise the browser/Firebase chain or access a physical camera. Those distinctions remain part of the outstanding integrated verification.

Independent result review verified matching source/result/log hashes, the authentication and closed-route outcomes, absence of saved credentials and all four workload leases absent. Current secret checks passed for 186 tracked files, 246 reachable history blobs and 406 current tracked/untracked files; `git diff --check` also passed, with zero tracked dataset/output/private-configuration files.

## Evidence identities

| Record | SHA-256 |
| --- | --- |
| Current GPU adapter | `724c26fb91f3cdb8a4c8b012b4499c1e7f95404d99d2d28ee74f48713af47de8` |
| Current runtime | `8dccf6ac8ffecb68724a4d9f528aba90c279265bc17888c6f4ab9cf8be51dcc4` |
| Current API | `a4531e14185693392c6b8cb953c683925b865e3e4a4506cfec8057308f07d254` |
| Version-2 descriptor | `41be154569ace87d85bae5dc12b77eb7d08ffcb52616bb2e075f00c1300e21eb` |
| Prepared request | `308a94a676cd89e4e6a6af69e2889a5eebbadb4b42411328e80811d943a250d9` |
| Completed actual proof | `62c74a53a5c311707622ecd450146ae8037b15c8756438118177d90b08203888` |
| Independent actual proof review | `e13a33d1ba617e94992bf9ebde1de009ef32b9f2f924cac665282d25ec2ccc52` |
| Actual closed API result | `65493619ef9690f073e8be02930a719de38caa2739b483fffe937290f65ef7b2` |
| Independent closed API review | `6e3bb1ed6145aba83184d48da02c84282425beea87e44937b7ae4994b09ed91e` |

Detailed records, image bytes, per-image results, weights, snapshots and private configuration remain ignored and local. No Git staging, commit, push, deployment or production write is part of this change.

## Next latency experiment

Source and saved-timing review localizes 13.692 seconds of the 15.040-second difference between the two runs inside the unchanged adapter timer (6.210 seconds previously, 19.901 seconds now). That accounts for about 91% of the observed difference. Transport startup, capture and cleanup alone cannot explain it. The adapter timer includes descriptor validation, artifact hashing, decode/CLAHE, TensorFlow import, model load, full state snapshots, forward execution and scheduling delays. The records do not separate those stages; filesystem/import delays, machine load and same-CPU resource sampling remain unmeasured possibilities.

The next experiment should use one separately pinned development timing build through the same default executor. Record bounded wall/process-CPU timings around those stages, separate TensorFlow import from model loading, and measure parent resource-sampler duration. Use the same fixed exposed validation image, fresh processes and unchanged 25-second/2-GiB limits. Preserve every integrity/state check and any failure; do not rerun TEST or introduce caching, a new service or higher limits before identifying the bottleneck. This profiling experiment has not been executed.

## Remaining work

1. Diagnose integrated latency using development-only inputs and preserve all lifecycle/integrity protections.
2. Admit a genuinely independent, appropriately licensed visible shipping-parcel photo evaluation set with labels, visibility and parcel-group provenance. Existing publisher-source results do not prove staff-photo quality.
3. Measure real camera sessions and device/browser behavior, including blur, lighting, obscured faces, cancellation and sampled-frame latency. Public still images cannot establish physical-camera accuracy or hidden/internal damage.
4. Bind justified photo and live acceptance separately to exact artifacts after their evidence passes. Both API admission functions are still false, backend acceptance pins are null, and normal application outcomes remain Unavailable.

Public datasets only remains the collection constraint; owned-box collection has not been authorized. Other AI modules and additional features remain deferred. Frontend, Firebase and browser suites were not rerun for this closed Python-only amendment.
