# One MobileNetV2 tail-only improvement experiment

Goal: implement, verify and run the one controlled improvement specified in research/PARCEL_VALIDATION_DIAGNOSIS_2026-10-21.md. Full evaluated photo/live parcel AI remains the end state. This increment preserves every previous model/result and does not activate a model or access the 147 reserved test images. Other AI/extras remain deferred.

Starting evidence: the expanded development run completed all four fits (session47658 terminal exit0). Frozen selected MobileNetV2 CLAHE and EfficientNetB0 standard both have75/133image accuracy; Mobile detects21/53Damaged. Parent/agent independently verified source/raw/worker/resource/phase/completed-claim links. The validation error audit is complete; it does not establish causes or permit relabelling.

Ruling: use the current dirty codex/native-tabular-runners checkout with exclusive file ownership. Required prior modules are uncommitted here; copying incomplete state/history to a new checkout would risk the experiment's sealed bindings. No main/master work, commit, push, deployment or production operation in this increment. New helpers/runners only; preserve the seven bound development sources and every old pilot artifact.

## Fixed scientific recipe

- Exactly one candidate starts from the exact selected MobileNetV2 CLAHE classifier.keras. Same633TRAIN/133validation rows, source labels, components, mean-one partition component weights, letterbox224 RGB, CLAHE, train-only augmentation, seed42,batch4,dropout.2 and exact-tie-abstains decision.
- Fresh Adam1e-5,maximum5epochs,patience2 on component-weighted validation loss,restore best weights. Unfreeze only Conv2D/DepthwiseConv2D kernels in block_14/15/16 and Conv_1 plus the existing normal_damaged head. All BatchNormalization and earlier backbone weights remain frozen. Baseline architecture must exactly match the existing MobileNetV2 model; reject unexpected layers/weights/shapes.
- Compare candidate with frozen Mobile CLAHE by component macroF1 thenNLL, keep baseline on ties. Preserve the unchanged EfficientNetB0-none comparator; no new EfficientNet fit, extra contrast/threshold/model search, data acquisition or label/split change.
- All metrics remain development tuning evidence; no improved validation result establishes IILAS acceptance. Keep147reservedcandidates unopened until the eventual complete model/comparison protocol is frozen.
- Proposed fit bounds3000seconds/fit3300phase,2GiB process-treeRSS,3GiB initialavailableRAM,768MiB floor,2GiB diskreserve,512MiB outputs,onecompute thread. A bounded no-optimizer-update TRAIN gradient probe informs feasibility BEFORE final protocol/claim. Never enlarge bounds after a failed fit or run replacements.
- Probe: fixed four TRAIN examples (rank by SHA-256 of iilas-tail-gradient-probe-v1:sample_id, select two Normal then two Damaged with unique source items/components; fail if impossible), full-partition component weights, one gradient warmup plus three timed gradient passes. Explicit model(training=False), with gradients enabled, avoids Dropout RNG/BN updates; actual fitting retains the existing training Dropout behavior. Weighted probe CE is sum(weights*per-example loss)/four, never renormalised on this subset. No optimizer construction/step, saved model or validation predictions. All learned weights/BNstatistics unchanged; gradients for the exact permitted variables finite/non-None and some nonzero. Probe cap180seconds/2GiB,initialRAM3GiB,floor768MiB,disk2GiB,outputs32MiB,one thread. Fresh probe directory; preserve failures. No test pixels.

## Task 1 — exact model tail and gradient checks

Exclusive owner helper agent: new research/parcel_finetune.py and research/test_parcel_finetune.py. No other product files.

Interfaces:

- load_candidate(path): supervised-worker-only safe Keras compile=False loading, exact model/input/output/head/backbone shape/name validation. TensorFlow imported only after supervision and caller CPU/offline environment.
- configure_tail(model)->dict: enforce exact allowed Conv2D/DepthwiseConv2D/head trainability, all BN/earlier weights frozen, return stable inventory of layer/variable names, shapes and counts.
- weight_fingerprints(model,frozen_only=False)->dict: learned weights/BN state hashes, distinguishing random-generator state if Keras exposes it separately.
- gradient_probe(model,images,labels,sample_weights)->dict: fixed batch4,onewarmup+threetimedforward/backward calls,no optimizer updates. Return inventory, timings, gradient validity/norm summaries and before/after learned-weight/BN fingerprints; fail on forbidden change or missing/nonfinite permitted gradients.

Write failing behavioral tests before implementation. Test extra/missing/wrong architecture/layer/variable shapes, BN/earlier freezing, exact variable inventory, shape safety and no import-time TensorFlow. Pure tests may use bounded structural fixtures; real supervised TF tests/probe must verify the actual model and gradients before any real fit. Ask parent for the single heavy-TF execution slot; no concurrent ML. Keep tests self-contained without private checkpoints. Observe RED then GREEN; save ignored concise evidence with exact file hashes.

## Task 2 — probe and one-candidate runner

Exclusive owner runner agent: new research/kaputt_crop_finetune.py and research/test_kaputt_crop_finetune.py. Consume Task1 API; no edits to helper-owned or old files.

Public API: verify_baseline(selection_path,manifest_path)->dict; probe(selection_path,manifest_path,output)->Path; load_protocol(path)->dict; develop(selection_path,manifest_path,protocol_path,output)->Path. CLI probe/develop/_probe/_phase/_fit. Every hidden worker requires actual Windows Job supervision. Import heavy ML only inside workers.

verify_baseline must validate completed original development, exact source/protocol/environment/checkpoints, all4fit/artifact/raw/history/worker/resource/phase/completed-claim links, selectedvariants and closed scope. Require selectedMobileCLAHE/Effnone and original633/133cohort; never infer a usable baseline from one file. Metadata loading opens no pixels. Check for an already claimed internal test in canonical research/datasets/kaputt-crop-test-registry/test-<baseline_development_key>; if present prohibit new development. Future test tooling must reuse that claim boundary.

probe controls parent ResourceSupervisor, verifies starting lineage, selects fixedTRAINbatch metadata, writes exclusive bound request and invokes _probe. Worker configures offline/CPU/seed, loads exactbaseline and Task1 helpers, reads only specifiedTRAINrows through existing crop read/preparation, runs gradient_probe and seals report. Supervisor resource result plus report/probe request/source/baseline hashes must be rechecked before protocol admission. No fine-tuning claim or optimizer update in probe.

Protocol boundedJSON ignored metadata only, exact recipe fields/packages/startinglineage/fixedtestpolicy, probe request/report/resource hashes and returned trainable inventory. Pure metadata admission rejects nonJSON/outsideignoredroot/links/reparse/>1MiB before reading. Source binding includes new2modules plus unchangedold7. All old checkpoints/proofs remain verified by original protocol. Parent creates final real protocol only after probe feasibility and stable code review.

One-candidate claim namespace research/datasets/kaputt-crop-finetune-registry; claim key is digest of original development key plus fixed recipe version mobilenetv2-tail14-16-conv1-lr1e-5-v1. Paths, probe timestamps/receipts, code or resource changes cannot grant a replacement of this recipe after failure. Bind all actual source/protocol/startingartifact/environment hashes separately into every receipt. Preflight beforeclaim; onceclaimfailed/completed no rerun. Output exclusive and ignored, no resume.

_fit loads baseline anew, configuresexacttail andcomparesinventorywithprobe, snapshots frozen learnedweights/BNstats, compiles freshAdam1e-5, fits streamed weighted data with frozen recipe, confirms frozenweights/BNunchanged and some permittedweightschanged, restoresbestweights, generates all133validation probabilities, records history/model/rawmetrics. All image/label/weight association/source checks remain. _phase verifies completedfit/artifact/resource/workerlinks before writingselection comparingcandidateandoldMobilebaseline, keepingoldEff comparator reference withoutrefitting. Parent verifiesphase/selection/claim linksbeforecompletedstatus. Every result explicitdevelopmentonly/operationally_approvedfalse; no serving output.

Write/observe failing tests for exactprotocol/lineage/claim/noheldoutguards, source/probe mutation, pathrelocation duplicateclaim, candidate-vs-baseline ties/negativefindings, weights/inventory enforcement and partialworkerfailure. Softwarecheckpoint doubles only at externalfixtureboundary; productionoldexacthash guards stay unchanged. Test receipts/protocol binding without importingTF. Heavy fixture/probe slot serialised with parent.

## Task 3 — independent review, real probe, final protocol and fit

Parent owns docs/ledger/real protocol/execution. Read-only reviewer audits both source interfaces and scientific/safety boundaries, with no code edits. Parent independently verifies currentoldseals and source hashes, actual layer counts, TRAIN-only sample selection, no optimizer updates, native resources and all probe links. Exact batchN4/trainable12variables~1,513,282parameters is an expected cross-check, not a number to fake when real inventory differs.

After focused tests/review/source freeze, run one real bounded probe. Review timing/memory before finalisingfitbounds. Final code hash changes after probe require explicit provenance handling; prefer freezing all code before real probe to avoid invalidating its source bindings. Never edit bound code during a real candidate fit.

Run combined affected research tests once stable, no parallelML, then create final ignored protocol and run exactlyonecandidate under the one-use claim. Monitor original processhandle; an observationtimeout is not termination and never triggersrestart. Independently reconstruct metrics/selection/frozenweight/lineage/resourceclaimlinks after terminal status. Preserve negative results withoutextra fits.

Update roadmap/handover/completion evidence, secret/ignore/whitespace/preservation checks. No appcodechange means priorappbuild/emulator/browser evidence remains separate; future photo-outcome implementation still needs its own affected application suites. Full goal remains incomplete until meaningful accepted model, persistent photo outcomes, bounded live sampling and intended-use evaluation exist.
