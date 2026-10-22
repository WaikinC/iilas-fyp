# Visible parcel source TEST audit implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax. This is an outline for review, not an available audit CLI.

**Goal:** Produce a sealed, independently reviewed TEST audit overlay for later once-only evaluation of unchanged publisher Normal/Damaged labels.
**Architecture:** One new module owns metadata preparation, a Windows Job-supervised technical/neutral-render worker, and immutable review admission. Existing development manifests, source inventory, model science and claims remain unchanged; no evaluator or serving adapter is implemented here.
**Tech stack:** Existing research Python, stdlib metadata/controller, frozen OpenCV/RGB input helpers inside the supervised worker, existing Windows Job runtime.
**Design:** [Reserved source TEST plan](../../../research/PARCEL_SOURCE_TEST_PLAN_2026-10-21.md). Exact local provenance is in ignored `outputs/parcel-gpu-setup-20261021/next-evaluation-protocol-draft-01.md`; that appendix remains frozen.
**Status:** Proposal requiring independent implementation/interface review. Actual corrective-fit completion and independent proof are still prerequisites for any TEST pixel access.

## Scope and fixed constraints

- Create exactly `research/parcel_source_test_audit.py` and `research/test_parcel_source_test_audit.py`; no old nine sealed sources or other frozen modules are edited.
- All real audit/protocol/review outputs stay ignored below `research/datasets/parcel-source-test-audit-20261021`; no Git mutation, data upload, private capture, training, model inference or acceptance changes.
- Source is damaged-box-detection v1, archive SHA `b10758ad148b9ad8fc8aac21365da2a62b532af1b9b8441ec0a45366352f9ffc`; retain all4,148 source nodes and all102 TEST dispositions.
- Initial TEST51Normal/51Damaged; seven known rights-held Damaged remain metadata-only. Audit ceiling95=51Normal/44Damaged,84 known components; no backfill, class relabel or resplit.
- Primary eligibility excludes actual development/review/verified-preview exposure; an unused publisher TRAIN/VALID relay alone is not model exposure. Preserve stricter publisher-partition sensitivity flags (initial ceiling60=43Normal/17Damaged).
- Source CC BY4.0 is not an asset rights warranty. No-known-rights-hold is not rights-cleared; unresolved preview/older-reference comparability remains explicit. Components are nonphysical dependencies.
- Worker600s/1GiB aggregate host,3GiB startup RAM,768MiB live floor,oneCPU,20GiB free disk,512MiB outputs; no automatic retry or cap increase. Human review is outside the native compute leaf.
- A fresh protocol binds successful completed corrective fits and their independent audit receipt; never accept the failed model/diagnostic or a live/pending fit as completion.

## Existing dependencies and deliberate boundaries

- `parcel_visible_review.load_manifest(path)` verifies the unchanged reviewed915 development membership, original4,148 dispositions/source bindings and selected encoded bytes, without decoding TEST.
- `parcel_visible_manifest._source_receipt(...,hash_archive=True)`, `_member`, `_dimensions`, `_Union`, `_json`, `_seal`, `_unseal` provide exact source/header/metadata primitives; bind their frozen code hashes.
- `parcel_inputs.decode_rgb` supplies oriented-once RGB. Match frozen `_decode` width/height/RGB-SHA/dHash arithmetic exactly; header limits precede decoder import/call. Keep oriented RGB temporarily for neutral rendering within the worker.
- `runner_runtime.create_run_directory`, `_validate_output_path`, `write_json_exclusive`, `Limits`, `ResourceSupervisor(...).run(...)`, `require_supervised_worker` provide exclusive safe outputs and native Job supervision.
- Do not call old `prepare_manifest`, `_select`, review `_rebuild` or `admit_manifest` to admit TEST: their development-only selection/quarantine policies are different. Seed a new overlay union with existing dependency IDs, including the prior locked review link.
- Do not import GPU training/TF to inspect completion. Consume a hash-bound independent development-proof receipt; validate its exact two fit IDs/key/comparison/native/provenance bindings against completed records. Proof receipt shape below needs parent/reviewer agreement before implementation.

## Proposed interfaces and schemas

All four public functions below live in the new module; Paths are explicit local paths. Controllers/loaders are stdlib-only and never decode images or load ML.

- `prepare_audit(protocol: Path, output: Path) -> Path`: validate metadata/proof gates, exclusively reserve source TEST exposure, run one bounded worker, verify native completion, return `candidate-audit.json`.
- `load_audit(path: Path) -> dict`: verify seal, source/code/proof/reservation/native/review bindings and accepted encoded hashes without decoding; rebuild graph/eligibility from bound metadata and compare; accept pending candidates or admitted overlays distinctly.
- `admit_audit(candidate: Path, review: Path, output: Path) -> Path`: validate complete locked neutral observations/key/rights/links and independent review; create a NEW frozen `admitted-audit.json`, never overwrite candidate/old dispositions.
- `audit_limits() -> runner_runtime.Limits`: exact600s/600s,1GiB,3GiB,20GiB,512MiB,threads1,768MiB floor; no caller cap overrides.

Protocol JSON schema1: `kind='parcel_source_test_audit_protocol_v1'`, `source_receipt`, `development_manifest`, `development_proof`, `exposure_ledger`, `reference_bindings`, `policy`, `code_bindings`; every file binding is `{path,sha256}`.
`development_proof` binds independently verified metadata: `status='verified_complete'`, `development_key`, `comparison`, `completed_claim`, `fit_ids=['mobilenetv2-clahe','efficientnetb0-none']`, `fit_records`, `native_records`, `independent_review`; each referenced file has path/SHA, and both records must have successful terminal/clean native and scientific guards. Preserve original Linux paths as provenance; any local copies need explicit hash-bound relocation, not guessed paths.
`exposure_ledger`: `schema_version=1`, `entries[{reference_id,sample_id?,sha256,width?,height?,pixel_sha256?,dhash?,fingerprint_convention,kind,evidence}]`, `known_links[]`, `unresolved_preview_status`; `kind` names actual_train,actual_validation,human_review,preview,prior_evaluation. Optional sample IDs refer to existing source nodes; other references are external relay nodes, not new source inventory members.
Only compatible oriented-RGB fingerprints get decoded/perceptual comparisons. Old unoriented BGR fingerprints support encoded joins only until separately harmonized; retain that limitation.

Candidate/final envelope uses frozen `{payload,sha256}` sealing. Payload fields: `schema_version=1`, `kind='parcel_source_test_audit_v1'`, `class_order=['Normal','Damaged']`, `source_closed=true`, `training_admission=false`, `audit_admission`, `evaluation_status='not_run'`, `bindings`, `code_bindings`, `reservation`, `native`, `source_inventory`, `dispositions`, `graph`, `rows`, `summary`, `neutral_review`.
`source_inventory` copies all4,148 original records. `dispositions` preserves every original record/reason and adds `original_dependency_group_id`, `audit_dependency_group_id`, `audit_disposition`, `audit_reasons`, `audit_rights`, `audit_exposure`, `technical_status`; do not reinterpret old TEST training-quarantine reasons as automatic evaluation holds.
Each eligible `rows` record has `sample_id,member,split='test',publisher_class,label,source_family,dependency_group_id,path,sha256,pixel_sha256,width,height,dhash,strict_publisher_partition_eligible,quality_basis='publisher_label_not_independently_verified'`.
Seven initial rights-held records get no new image path/pixel/dHash. Native technical failures get explicit dispositions and no rendered case; final rows are a subset of the original95, never replacements.
`summary` retains original4148/TEST102/initial95/rights7 counts, every exclusion/overlap, attempted/decoded/rendered/accepted counts, class/component supports, strict subset support and unresolved exposure/rights; `independent_physical_parcel_accuracy_established=false`.

Neutral outputs: `neutral-manifest.json` lists only `{case_id,neutral_path,image_sha256,technical_status}`; `private-key.json` binds `{case_id,sample_id,sha256,split,label,dependency_group_id}` and source/candidate identity. Deterministic case rank is SHA256(`visible-source-test-neutral-v1|42|`+sample_id). Inspect every technically valid candidate, never an outcome-selected sample.
Review JSON schema1: `candidate_sha256`, `source_sha256`, `decision='accept'`, `independent_reviewer`, `bindings{policy,neutral_manifest,sample_key,observations,lock,independent_review}`, `sampled_reviews[{case_id,sample_id,sha256,quality,observed_condition,notes}]`, `rights_holds[{sample_id,sha256,reason}]`, `dependency_links[{left_sample_id,right_sample_id,left_sha256,right_sha256,basis,strength='conservative_review_dependency'}]`.
`sampled_reviews` is a complete census of rendered cases despite the inherited name; quality is suitable/ambiguous/irrelevant, condition Normal/Damaged/Uncertain. Lock observations SHA before key access; require exact complete key/case/SHA matches, semantic observation matches, and every locked rights/link finding represented. Condition disagreement alone neither holds nor relabels a suitable case.

## Task1 — proof gates, source closure and once-exposure reservation

- [ ] Write fixtures1–3 below and observe actual RED before implementation.
- [ ] Implement `prepare_audit` metadata/proof validation; instantiate `ResourceSupervisor` and call its actual `preflight()` before reserving exposure. Preserve a failed-preflight receipt in the new output without consuming a reservation when no Job/member read was attempted. `run()` rechecks the identical limits.
- [ ] After successful preflight, reserve before any archive member read using atomic exclusive directory creation under ignored `parcel-source-test-audit-registry`.
- [ ] Reservation identity is archiveSHA+version+sorted all102 `(sample_id,sha256)` pairs; output/protocol/code renames do not evade it. Persist `reserved.json` plus worker access-start/progress records. Any existing reservation vetoes a new attempt; failures remain preserved, with no automatic recovery.
- [ ] Run fixture-only tests GREEN. Independently review receipt/relocation shape and reservation ordering before native work; no model bytes are necessary for this audit gate.

## Task2 — bounded technical audit, full graph and neutral review artifacts

- [ ] Write fixtures4–7 and observe RED; then implement the private supervised worker in the same module.
- [ ] Validate full ZIP directory against source inventory before any read: no unsafe paths, duplicate/unknown members, links/encryption, inventory/CRC/size drift. Open only the fixed95 candidates; initial seven rights-held member reads are forbidden.
- [ ] Apply16MiB encoded,64px minimum side,16MP,strict PNG/JPEG/truncation/header bounds before decode; compute exact oriented RGB/dHash metadata and bounded neutral sheets. Persist all102 technical dispositions and native progress before success checks.
- [ ] Build union from all4,148 existing nodes/components plus bound external exposure relays; add encoded/shape-aware decoded exact edges, dHash<=4 conservative edges and declared review links. Keep verified-conflict evidence distinct from conservative propagation.
- [ ] Record actual-exposure/rights/technical/verified-conflict candidate holds component-wide. Unused publisher DEV alone sets strict sensitivity false, not actual-trained exposure. Existing915 fitted membership is fixed; do not admit TEST for training or rewrite the original graph.
- [ ] Run fixture-only tests GREEN; independently reconstruct all graph edges/reasons and require native request/limit/code/source/result/completion consistency. Pending candidate has `audit_admission=false`, no inference permission.

## Task3 — immutable full-census review admission and handoff

- [ ] Write fixtures8–10 and observe RED; implement `admit_audit` and the full `load_audit` reconstruction checks.
- [ ] Preserve publisher labels; propagate explicit ambiguous/irrelevant/rights/new actual-exposure holds across merged components, preserve separately observed rights status, no backfill. Do not impose development one-family/four-view caps on the TEST census.
- [ ] Require both publisher classes for final audit admission, without invented physical/group quota; otherwise preserve a blocked audit outcome. Freeze strict subset membership before scores.
- [ ] Run fixture-only tests GREEN and obtain independent source/fixture review. Parent alone runs bounded artificial native/cold-cost checks and, only after completed-fit proof and final protocol review, the actual one-shot audit.
- [ ] Final accepted overlay is audit evidence only: `audit_admission=true`, `training_admission=false`, `evaluation_status='not_run'`; a later separately reviewed evaluator consumes exactly these frozen rows and all102 dispositions. No evaluator CLI is promised here.

## Ten meaningful RED fixtures / review focus

| # | Test name and required assertion |
| --- | --- |
| 1 | `test_fit_proof_pending_failed_foreign_or_one_model_rejected`: no reservation/member open before exact successful two-fit/key/native/independent-proof bindings validate. |
| 2 | `test_reservation_is_source_population_scoped_and_exclusive`: simultaneous/same-source new-output or code-name attempts cannot reserve twice; access/failure records survive. |
| 3 | `test_source_inventory_and_safe_paths_before_member_reads`: traversal, Windows absolute, symlink/junction output, duplicate/link/encrypted ZIP or source/receipt drift fail before read/decode. |
| 4 | `test_seven_initial_rights_members_never_opened`: spy archive raises on those reads; all102 dispositions and4,148 nodes remain, exactly95 maximum attempts, no replacement. |
| 5 | `test_header_corruption_and_dimension_bombs_precede_decoder`: malformed/truncated PNG/JPEG,17px,>16MP/>16MiB reject with decoder spy untouched; valid artificial boundary succeeds. |
| 6 | `test_encoded_and_shape_aware_pixels_and_conservative_links`: re-encoded identical RGB joins exact; same byte stream/different dimensions does not pixel-join; dHash/review links remain nonphysical and a verified opposite-label conflict propagates a conservative family hold. |
| 7 | `test_exposure_uses_full_graph_relays_without_falsely_training_unused_dev`: TEST->excluded DEV->actual915/review holds entire TEST component; unused-DEV-only link keeps primary eligible/strict false; old BGR hash is not compared as RGB. |
| 8 | `test_neutral_complete_case_key_lock_and_native_bindings`: missing/duplicate cases, wrong SHA/key/lock, omitted locked rights/link, native request/result/source/code/limit mismatch reject; deterministic full census rank matches. |
| 9 | `test_suitable_rights_hold_and_label_disagreement_remain_distinct`: suitable stock is excluded for rights without quality lie; suitable label disagreement remains publisher-labelled; ambiguity/rights/review-linked exposure propagates with no backfill. |
| 10 | `test_load_reconstructs_admission_and_detects_drift`: tampered review/source/encoded image/seal/code/reservation/native membership fails; final rows subset95, all102/full4148 retained, both-class shortfall blocks admission, no training/evaluation claim is granted. |

Fixture verification command after implementation, from `research/`: `C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe -B -m unittest test_parcel_source_test_audit -v`; use only artificial data. Record actual RED/GREEN logs, then independent review. No Git commits/worktree changes are authorized by this outline.
