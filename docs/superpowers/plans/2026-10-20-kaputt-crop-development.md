# Crop-only parcel development implementation plan

Goal: resolve the expanded development cohort's conservative dependencies, freeze truthful crop provenance, and implement/run the next bounded MobileNetV2/EfficientNetB0 research experiment. Full evaluated photo/live parcel AI remains the goal; other AI stays deferred.

Spec and constraints: research/KAPUTT_CROP_INTAKE_2026-10-20.md; ignored verified intake02/selection02/proposal/quality amendment/independent verification under outputs/kaputt-expansion-20261020 and research/datasets/kaputt-crop-expansion-20261020. Current user authorisation covers continuation and agents. Use exclusive new module/test ownership; no sealed pilot source edits, fake original images, operational admission, test extraction, production action or publication. Work in the current dirty checkout because its uncommitted shared dependencies are required; no history/worktree copying.

## Scientific decision fixed before fitting

Publisher defect labels remain unchanged. Treat every coarse dHash<=4 cross-item pair as a conservative dependency edge; union transitively at source-item level. Quarantine every whole connected component that touches an earlier sample candidate or spans proposed train/validation partitions. Do not backfill, rebalance, rerank, or move surviving assignments. Keep all eligible captures for each surviving source item. Remaining within-partition components share statistical weight; they are not asserted to be confirmed physical boxes.

After removing two previously recorded quality groups, this rule should retain766 images: train633(369Normal/264Damaged) and validation133(80Normal/53Damaged),453 source items in449 dependency components. Parent counts are provisional until independent agent reconstruction. Preserve147 internal test candidates as unextracted metadata; no official held-out pixels may be opened. Resolve any later test dependency/technical failure before scoring without tuning on its outcomes.

Fix later internal-test admission before any fit: policy fixed-technical-and-dhash4-test-quarantine-v1. When the147 reserved crops are eventually acquired after model/contrast selection, keep all views of each source item linked, enforce the same64px minimum/16Mpixel/16MiB bounds, and connect items by exact byte/decoded hashes or dHash<=4. Exclude any entire test dependency component touching frozen training/validation or the old100-image sample from scoring. No replacements, relabelling, threshold/model changes or retraining based on test pixels/outcomes. Group remaining views for equal-component scoring; report technical/dependency exclusions and class/material attrition, including insufficient support. Preserve raw outputs. These remain conditional internal TRAIN-source results, not official source-test or actual IILAS photo/live acceptance. Similarity quarantine can preferentially remove plain low-texture packages; report that selection bias and never interpret cleaned validation as general accuracy.

## Task 1: crop manifest and dependency resolution

Owner manifest agent. New research/kaputt_crop_manifest.py and research/test_kaputt_crop_manifest.py only; ignored outputs under outputs/kaputt-crop-development-20261020 and a new ignored cohort folder.

Interface: build_manifest(proposal_path,selection_path,intake_root,verification_path,output_path) -> dict; load_manifest(path,verify_images=False) -> dict; benchmark_context(doc) -> dict. Save exclusive JSON profile kaputt_crop_development, schema_version1, evaluation_scope development_only, operationally_approved false, frozen_development true. No test rows in rows; reserved_test_metadata is separate. Each row: sample_id/capture_id,item_identifier,group_id original source item,dependency_group_id, image_path/image_sha256/decoded_sha256,width,height,label,split(train|validation),official_split train. Runtime load adds _image_path and _group_id=dependency_group_id.

Bind hashes of proposal, selection02, quality amendment, independent verification02, all three intake artifacts and original annotation/licence files. Image root is verified intake02/selected, local ignored only. Validate upstream receipts/allowed filesystem paths, source labels, complete surviving groups, transitive edges, quarantines, disjoint partitions, held-out exclusion and exact counts. Metadata-only loading must never open pixels. verify_images=True hashes/decodes only included development crops under existing limits.

- [x] Write failing behavioural tests for graph transitivity/quarantine, labels/group completeness, altered provenance/image, unsafe paths, split leakage and held-out image-open guard; observe RED.
- [x] Implement helpers/loader, observe GREEN; build real frozen development manifest and independent count verification. Preserve all previous files.

## Task 2: bounded crop-only training runner

Owner training agent. New research/kaputt_crop_train.py and research/test_kaputt_crop_train.py only. Consume Task1 interface; no monkeypatching or edits to old parcel_train/manifest/models/evaluate/runner modules. Reuse their read-only utilities where appropriate. Public interface develop(manifest,protocol,output) -> Path to selection; CLI develop/_phase/_fit like original, all worker entries require Windows supervisor.

Protocol explicit profile kaputt_crop_development and crop-only development scope. Keep seed42,batch4,max10epochs,patience3,learning_rate.001,dropout.2,RGB letterbox224,train-only augmentation,MobileNetV2/EfficientNetB0,none/CLAHE,frozen pretrained backbones,exact official checkpoints and dependency versions from prior verified protocol. New explicit resource amendment for larger data: four serial fits,max3000seconds/fit,12300seconds total,2GiB process-tree RSS,3GiB initial availableRAM,768MiB available floor,2GiB free disk,512MiB outputs,oneCPUthread. No silent timeout increase/replacement fits. These replace the initially proposed1800/7500 caps BEFORE any fit/claim: the supervised read-only timing probe measured0.072879seconds/image MobileNetV2 and0.102761 EfficientNetB0, with3x-forward10epoch estimates1735/2434seconds plus input preparation. Probe receipts under research/datasets/kaputt-crop-development-20261020/timing-probe-01; no training or validation metrics informed the amendment.

Equal dependency-component total weight in training/validation (per-image weight n_images/(n_components*component_image_count)); no majority relabelling of mixed groups. Early stop uses weighted validation loss. Select each architecture by component-weighted macroF1,then component-weighted NLL,then none. Also report unweighted metrics/raw validation probabilities and per-class/component counts. Exact score ties abstain; confidence uncalibrated. No test scoring or active model output.

Bind manifest/protocol/all reused+new source/weights/env hashes into experiment identity and all worker receipts. Claim develop exclusively before fitting, no reruns or automatic replacement, no selection until all four fits succeed. Metadata-only prepare reads no test pixels; offline CPU workers, deterministic batches/prefetch1. Keep models/metrics ignored.

- [x] Write/observe RED tests for profile/protocol/claim/binding, group weighting/metrics/ties, four-fit selection and held-out access rejection.
- [x] Implement and run focused tests GREEN. Parent freezes real local protocol after reviewing Task1 counts and environment, then starts one supervised develop run.

## Task 3: independent review and actual verification

Parent validates graph and manifest independently, reviews code and fixed protocol, preserves old seals, runs affected tests and integrity/secret/exclusion checks. Separate reviewer checks scientific leakage, claims, bounds and actual outputs. Execute only after code/protocol frozen. Record actual fit results/resource failures; never report validation as independent IILAS accuracy or activate development-only models. Update roadmap/handover/completion checklist.

Review focus: hidden transitive links to prior sample; mixed labels in one family; changed provenance after claim; group weighting computed separately within each partition; partial model files after killed fit; model response/schema accidentally admitted by old serving; readable metadata-only reserved test rows do not permit reading test images.

Execution completed: session47658 terminal exit0; all four fits, selection and completed claim verified independently. 299 parent research tests, two privilege skips; phase948.27seconds/peak1242.53MiB. Detailed conditional findings: research/KAPUTT_CROP_DEVELOPMENT_2026-10-20.md. Model quality remains insufficient and serving stays closed. This plan's implementation/execution is complete; the full photo/live parcel goal is not. The separate 147-candidate once-only test plan is next.
