# Publisher-labelled parcel development profile

User instruction: continue with the publisher labels because images are unclear. The agreed scope and evidence are in `research/KAPUTT_PUBLISHER_LABELS_2026-10-20.md`. This bounded extension enables an honest research pilot without weakening the existing human-reviewed parcel profile.

## Decisions

- Preserve schema v1 behavior and existing diagnostic reservations.
- Add explicit schema v2 `benchmark_profile=publisher_packaging_development`, `evaluation_scope=development_only`, real domain, publisher labels and source item groups. Do not invent human review, physical box identity or single-principal shipping relevance.
- Bind a local publisher annotation snapshot and policy by SHA-256. Snapshot provenance includes the original annotation-file hashes; its capture records include source ID, item ID, defect boolean, cardboard material, crop path/hash and original path/hash. Validate every cohort row against that snapshot. Verify referenced provenance files remain byte-identical without requiring Parquet dependencies inside the training process.
- Keep path containment, source licence approval, input hashes/dimensions/duplicates, connected groups and split isolation unchanged. Only one query crop per capture, never masks or unlabelled references.
- Carry the exact benchmark context through audit, experiment identity, development selection and evaluation report. Development reports must describe equal-source-item weighting, not assert confirmed physical parcels. Retain existing metrics keys for compatibility but include an explicit grouping interpretation.
- Reject development-profile artifacts from operational serving readiness; this does not prevent development training/evaluation. Real IILAS acceptance remains a separate task.
- Freeze only after the implementation tests and independent review pass. Preserve the source/policy/human journals; write new exclusive local artifacts. Use the existing fixed seed 42 and grouped split algorithm, report its actual counts rather than selecting the nicest split.
- Existing four fits (MobileNetV2/EfficientNetB0 × none/CLAHE), balanced macro-F1 selection and all resource limits stay unchanged. No real fit until verified weights and frozen protocol exist.

## Execution

1. Implement/test the profile in `parcel_manifest.py` and context propagation in `parcel_train.py`, `parcel_evaluate.py`, `parcel_serving.py`; add focused tests. One implementer owns these modules to avoid concurrent interface edits. No API/runtime/backend edits.
2. Independently resolve exact pretrained checkpoint provenance/licence or a technically compatible licensed alternative. No substituted architecture, external contact, agreement acceptance or automatic download by a training worker.
3. Parent generates an annotation snapshot/registry and runner-ready cohort from the verified local sample using actual publisher metadata, verifies all selected crops, freezes an internal development split, and records counts/hashes and limitations. The earlier intake manifest remains unchanged.
4. Parent runs affected tests sequentially and obtains independent review. No public dataset/model files, publication, production operation or inference activation.

Original synthetic outputs bind old source code and must remain unchanged; they are historical software evidence. New tests generate their own source-bound fixtures. Do not relax guards to replay an old sealed run after code changes.
