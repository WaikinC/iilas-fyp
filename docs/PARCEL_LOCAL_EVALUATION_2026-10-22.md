# Local experimental parcel evaluation — 22 October 2026

## User-authorised bounded design

The user asked to integrate the existing trained model directly into IILAS and use real camera tests instead of repeating dataset reviews. The user selected **Local IILAS on MSI with Firebase emulators** in response to the proposed existing-interface/frozen-MobileNetV2/human-reviewed experimental design. This is approval for that bounded local integration and user-initiated camera evaluation. It supersedes earlier camera-deferred/pre-admission-only work for controlled local testing. Public datasets remain the training/research source; this permits local functional test captures, not unrelated private-data collection, background recording or production deployment.

Use the existing registered-photo and sampled-camera screens, stage/access controls, evidence storage, trusted request lifecycle and review records. Clearly label every experimental result before and after human review/reload. Functional testing can proceed before an independent intended-use accuracy study; it cannot establish final accuracy or operational acceptance.

## Truthful local authority

- Keep both operational acceptance pins null and the original operational API gates false. Never invent an acceptance certificate or set `operationally_approved:true` for this test.
- Add one explicit experimental model branch: `evaluationKind:'local-experimental'`, `evaluationManifestSha256:<actual local manifest SHA256>`, `acceptanceSha256:null`. Preserve the original model/version/selection/scientific-evaluation/preprocessing/class-order identities. Accepted operational descriptors keep their existing strict contract.
- Only a trusted backend local capability may select the experimental branch. Require `FUNCTIONS_EMULATOR==='true'`, the configured Firebase project/Admin identity, exact loopback Auth9099/Firestore8081/Storage9199, a loopback HTTP research URL with explicit port, nonempty internal service authentication and a server-owned pinned manifest. No client request gains a mode/approval/model field. Missing, partial or nonlocal settings leave the experimental path unavailable.
- Bind the same actual manifest SHA to the service, session/analysis descriptors and returned results. The versioned ignored manifest references unchanged warm bundle03 and exact frozen model lineage, the new local factory source identities and the current live policy. It contains no tokens, passwords, weights, images or synthetic quality certificate. Validate its exact version/paths/digests and all required fields; unknown/mixed settings fail closed. The manifest is local evaluation configuration, not scientific acceptance.
- Outside the full emulator capability, trusted handlers must reject experimental start/replay/resolve/review, including malformed prediction fallback. Safe historical reads may remain under existing shared read rules, visibly experimental; they grant no operational authority. No rule widening or client-writable permission flag.
- Experimental observations, including human-Accepted ones, must not feed operational dashboard damage alerts, verification candidates or other operational decisions. Preserve the navy/purple eight-card layout and the selected Admin/shared-system IDs/balances. Human review records an observation; it never promotes an experiment to an accepted model.

## Runtime and wire contract

Add a local evaluation factory/validator instead of editing `research/api.py`, `serve_parcel.py`, the serving adapter, original runtime, warm model/protocol/worker/runtime or frozen descriptors/bundles. Those source hashes are linked by the existing model guard. Use the unchanged `WarmParcelExecutor` and exact MobileNetV2 artifact SHA256 `2fffa7aa1a8c33c6698a97e38d028858b8433aec84dbd582c01094711a0ae4da`.

Serve the existing `/predict` and `/predict/live-parcel` parcel routes on literal127.0.0.1 only, with authenticated bounded intake and proxy headers disabled. Do not expose the service token to the browser. Keep unrelated tabular behaviour unchanged. Default/unconfigured import or health checks must not import TensorFlow, load weights or spawn a worker. Configured startup may perform the existing bounded integrity audit. Preserve all cancellation/disconnect/deadline handling and await executor cleanup on shutdown, including startup/audit failure.

Worker responses remain false/null. The local service validates the exact existing worker result before adding its server-owned experimental marker/manifest identity; for live it adds the exact trusted policy and request/session/frame/sequence bindings. The backend uses separate strict experimental validators. Operational validators continue rejecting these results. Do not change probabilities, label/tie rules, confidence meaning, model bytes or optimizer state.

Retain existing resource/lifecycle caps:25s per model request; warm worker120s maximum/110s retirement/reuse strictly before90s/12s idle/12 frames;2GiB Job/process limits,3GiB startup requirement,768MiB floor, one CPU, existing output limits and native ownership/cleanup rules. No training, consumed-TEST access or dummy-image preload.

Keep live limits unchanged:120s/12 attempts, one in flight/no queue, minimum5s spacing and existing submission cooldown, JPEG long edge960px/max1MiB,60s frame deadline, trusted50s/Storage10s/HTTP30s limits, Current only below15s capture age. A cold result may be Historical. Do not reset capture time or weaken freshness to make a test pass. No continuous video/audio storage or whole-parcel aggregation.

## Required evidence

### Implemented local manifest and Python wire contract (Task1)

The additive modules are `research/parcel_local_eval.py` and
`research/serve_parcel_local_eval.py`; original API/runtime/adapter/warm sources
and bundle03/descriptor02 remain unchanged. Preparation is metadata only: it
does not read model bytes or images, load ML libraries, start a worker or audit
the model artifact. All required backend source files must exist before a real
manifest can be prepared. Backend work and any subsequent reviewed source fix
require a **new version directory** and new actual manifest digest; never edit
an existing manifest to update its identities.

Use the research Python to run:

```text
research/serve_parcel_local_eval.py prepare --output <absolute ignored outputs path>/<new-version>/manifest.json
research/serve_parcel_local_eval.py check --manifest <absolute manifest path> --sha256 <actual digest>
research/serve_parcel_local_eval.py serve --port <explicit port>
```

The output's parent container must already exist. `prepare` exclusively creates
the version directory and `manifest.json`; it refuses replacement. `prepare`
and `check` print only the manifest SHA256. Serving selects the server-owned
pair `IILAS_PARCEL_LOCAL_EVAL_MANIFEST` and
`IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256`, plus the existing nonblank
`IILAS_RESEARCH_TOKEN`. Missing configuration leaves the factory/health closed
without constructing an executor; partial, conflicting, mixed legacy/GPU/warm
settings reject. `serve` requires complete configuration, accepts no host option,
binds `127.0.0.1`, and sets `proxy_headers=False`. HTTP requires literal loopback
peer/server, scheme `http`, and one exact Host `127.0.0.1:<actual server port>`;
forwarding headers cannot supply these identities. The trusted backend must
separately enforce the full emulator/project/Admin capability described above.
Python loopback/auth/manifest validation does not grant that backend capability.

The exact JSON schema has these fields and no others (bounded to 65,536 bytes,
strict unique keys/finite JSON, safe regular files and paths beneath ignored
`outputs/`, exact externally pinned content hash):

- `schema_version`: integer `1`; `kind`: `parcel_local_evaluation_bundle_v1`.
- `warmBundle`: `{repo_path,sha256}` for
  `research/datasets/parcel-warm-serving-20261022/bundle-03/bundle.json`, digest
  `dab3da809ca11d287a68ab36f7e55680d15b4f50872819c6243c0858c1b2bd10`.
- `descriptor`: `{repo_path,sha256}` for
  `research/datasets/parcel-gpu-serving-20261022/descriptor-02/descriptor.json`,
  digest `41be154569ace87d85bae5dc12b77eb7d08ffcb52616bb2e075f00c1300e21eb`.
- `artifact`: `{repo_path,sha256}` with the original MobileNetV2 artifact path
  `research/datasets/parcel-visible-gpu-20261021/develop-02/mobilenetv2-clahe/classifier.keras`
  and digest `2fffa7aa1a8c33c6698a97e38d028858b8433aec84dbd582c01094711a0ae4da`.
- `bindings`: exact original `modelVersion`, `selectionSha256` and
  `evaluationSha256`; evaluation digest is
  `b4f6727ce08630f8289b572e6a9d4ab71d730aff102250aa4af505bc27252fcc`.
- `contract`: the original adapter contract: `class_order:['Normal','Damaged']`,
  `preprocessing:'rgb-letterbox224-v1'`, `contrast:'clahe'`,
  `decision:'larger_probability_exact_tie_abstains'`, `confidence:'uncalibrated'`,
  `human_review_required:true`, `operationally_approved:false`,
  `acceptance_sha256:null`. Boolean/numeric substitutions reject.
- `livePolicy`: `{version:'parcel-live-v1',sha256:'50f4160d21f584110bbb7d68a6ff6552c2efe83bd14b119282d4b7a1e9217121'}`.
- `code`: exact current SHA256 mapping for
  `research/parcel_local_eval.py`, `research/serve_parcel_local_eval.py`,
  `backend/functions/parcelLocalEvaluation.mjs`,
  `backend/functions/parcelLocalEvaluationResponse.mjs`,
  `backend/functions/service.mjs`, `backend/functions/parcelAnalysis.mjs`,
  `backend/functions/parcelLive.mjs`, `backend/functions/parcelResponse.mjs`,
  `backend/functions/parcelLiveResponse.mjs`,
  `backend/functions/parcelLiveAcceptance.mjs`, `lib/parcelAnalysis.js` and
  `lib/parcelLive.js`. The unchanged bundle separately checks its original
  source bindings. No secret/config values, weights, images or certificate occur
  in this manifest.

`/predict` uses the existing request model. Its parcel branch requires exactly
`{kind:'parcel',imageBase64:<canonical strict base64>}`. Tabular branches retain
the existing contract. `/predict/live-parcel` uses the unchanged strict
`LiveParcelRequest` (`intendedUse`, `sessionId`, `frameId`, `sequence`,
`imageBase64`). Authentication/streamed body limits run before parsing, and
validation/errors contain no raw input or private path.

The experimental response contains exactly the original safe worker fields
`requestId,status,label,confidence,probabilities,confidenceMeaning,model,modelVersion,preprocessing,contrast,evidenceSha256,selectionSha256,evaluationSha256,processingTimeMs,humanReviewRequired,operationally_approved,classOrder,acceptanceSha256`
plus `evaluationKind:'local-experimental'`,
`evaluationManifestSha256:<actual manifest SHA256>`, `evaluationOnly:true`,
`runtimeMode:'local-evaluation'`, `intendedUse:'registered-photo'`. Live replaces
`intendedUse` with `sampled-live` and adds exact manifest policy
`policyVersion,policySha256` plus validated request `sessionId,frameId,sequence`.
The wire also requires `totalProcessingTimeMs`, measured independently with the
service's monotonic clock from parcel-route entry before local image/base64
preparation through manifest checks, worker execution, result validation and
request-watch cleanup. Authentication/body intake and response serialization
are outside that interval. The measured value must be finite, at least
`processingTimeMs` and at most30,000ms; otherwise the service closes/awaits the
executor and rejects the result. It never increases elapsed time to match a
worker claim or changes the original25s model/native deadline. The optional
raw worker `totalProcessingTimeMs` remains bounded/validated and discarded
before the independently measured service value is added. Unknown raw
worker fields reject; worker-supplied evaluation/policy markers cannot override
the server envelope. False approval, null acceptance, human review, probabilities,
tie abstention and all original identities remain unchanged. Operational
validators continue to reject this branch.

The manifest/source identity is rechecked before and after native work. Drift
or an invalid worker envelope closes/awaits the warm executor before rejecting.
Disconnect, deadline and task cancellation await the executor's native cleanup;
lifespan always awaits close, including audit/startup failure and repeated
shutdown cancellation. Existing native lifetime/resource/ownership rules remain
inside the unchanged warm executor. Busy/timeout/invalid image/unavailable
map to 429/504/422/503 without exposing private details.

1. Meaningful RED/GREEN tests for strict model branches, production/nonlocal rejection, false/null positive results, manifest/source/policy mismatch, role/stage/assignment/lease/revocation and operational-consumer exclusion.
2. Targeted Python/Node regressions, build/lint, secret/private-artifact checks, and required Firebase regressions run sequentially on the one configured emulator set. Preserve baseline documents and the untouched historical snapshot. Do not start a second emulator through npm wrappers.
3. One recorded positive frozen-model loopback request and a real trusted emulator/browser photo path using an already exposed development image, not consumed TEST. Record actual response fields and lineage without claiming new accuracy. Inspect pending/error/recovery and narrow layout.
4. Start the local application/service for the user's physical camera test. User positions parcels and starts capture. Actual permission/device/parcel participation and measured capture-to-render age/resources are required before claiming a real-camera test; fake media verifies software only. Keep all captures/results/test fixtures/weights/configuration ignored and local.

## Scope and execution ruling

This is a bounded extension of the existing parcel flow, not a new application or public deployment. Work in the user's existing complete MSI workspace: the required source, model and provenance paths point into this checkout and its prior uncommitted work belongs to this ongoing task. Preserve snapshots/diffs and edit only this feature; do not create a fresh checkout that loses those dependencies or initialise an outer Git repository. No stage/commit/push/deploy or production writes.

The new user direction replaces the earlier decision to withhold every positive prototype result until full intended-use acceptance. It does not alter the frozen90.67% source-benchmark result or assert that real photo/camera quality is established. Original full-feature evaluation remains incomplete until its own evidence exists; avoid further dataset-review loops as a prerequisite to this functional integration.

## Recovery after local configuration changes — reviewed interface decision

A missing or newly versioned local manifest must continue to deny old experimental inference, replay and review authority. It must not permanently strand an original active claim. Two trusted cleanup-only commands are authorised for this recovery: `cleanupParcelAnalysis({analysisId})` and `cleanupParcelLiveSession({sessionId})`, each returning only `{released:boolean}`. They must not return an old prediction or model descriptor.

Only a currently Approved original creator or Admin/Manager in the same protected shared scope may close the original reciprocal Running photo or Open live claim when expired, or when its originally experimental model no longer has matching local authority. Require canonical original records plus exact owner/actor/receipt/nonce/generation/lock/model/policy/context binding; release only the original matching lock. Terminal outcomes are null Expired/Stale, retained images and completed history remain unchanged, and cleanup commits independently of any rejected inference/result request. Malformed or mismatched claims cannot gain cleanup permission.

Existing app recovery controls must reach these commands. Only a true release acknowledgement may clear the corresponding pending intent and show that the interrupted request was closed. No automatic new capture, session, retry or inference follows; the user chooses the next request. A false acknowledgement does not establish successful release. This is a local lifecycle repair, never model acceptance or broader access.



### Reloaded blocked-photo recovery binding

The photo cleanup input may additionally contain `pendingOperationId`, preserving the existing `{analysisId}` call for a caller without pending recovery. When supplied, trusted cleanup must first prove that the exact protected current caller/scope request receipt for that operation is the original target claim or a canonical Blocked receipt bound to that analysis/evidence/operation/command hash. An unknown or unrelated pending operation cannot grant mutation or a successful recovery acknowledgement. The response remains only `{released:boolean}` and grants no old-result authority.

The client keeps its original four-ID persisted intent, sends its captured pending operation when needed, and may finish that recovery only after an exact acknowledgement and unchanged matching local context/intent. A reloaded Blocked intent must recover through that server association without replaying an old model result. Successor or late-context intent remains protected. The notice must distinguish server lock release from successful client recovery when these differ.

The wire acknowledgement remains `{released:boolean}`. The photo retry client reports its separate local outcome as `{released:boolean,recoveryComplete:boolean}`: server release alone is not proof that the matching pending intent was cleared. A false `recoveryComplete` retains or reports the unrelated/changed recovery context; neither outcome starts new work.

### Parcel-only endpoint isolation

Presence of either server environment key `IILAS_PARCEL_LOCAL_EVAL_MANIFEST` or `IILAS_PARCEL_LOCAL_EVAL_MANIFEST_SHA256` selects parcel-only inference configuration for the shared research endpoint. Generic inventory and delivery prediction must return the existing labelled-datasets unavailable error before any HTTP request, even if either value is empty, the pair is partial/malformed, or the manifest target is absent/invalid. This exclusion does not depend on a client flag or valid parcel capability. With neither local parcel key present, the existing separately configured general research URL/token workflow remains unchanged. No local parcel setting grants tabular model authority.

### Canonical private photo model pin

Photo claim, completion and explicit cleanup hash the model descriptor using recursively sorted object keys while preserving array order. Equivalent selector, public-schema and Firestore map ordering must produce the same model identity. Command hashes, operation/request/lock keys and artifact/scientific hashes retain their existing formats. The verified historical local baseline contains no photo-analysis receipts or live sessions; this is not a migration or backward-compatibility claim for manually retained old experimental receipts.

### Actual integration evidence

Version03 manifest SHA256 is `2e0a48040dfa9827dc1a3024fdb1ba417909d58975ad5d3376f722e24230d432`. Its paired local configuration remains ignored. Required sequential emulator suites and actual browser/Functions cleanup passed. One original exposed-VALID JPEG returned the frozen Normal scores through the actual app/service and retained experimental provenance after scripted review/reload; operational consumers excluded it. Observed click-to-render12.927s, service11.694s, model368.4ms. All fixtures were removed before creating one explicitly retained local handoff shipment. Native observation captured two successful managers, absent named Jobs after reap, restored request-root entries, four absent ownership markers and unchanged protected sources. Normal serving was then restarted without the observation hook. Physical-camera/device and independent accuracy evaluation remain deferred/incomplete; no production or publication follows.
