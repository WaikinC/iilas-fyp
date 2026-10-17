# IILAS research workflows

Updated 8 October 2026. The user has no labelled data or parcel images. These are executable research workflows, not final evaluated classifiers. Software fixtures are synthetic, created in temporary folders and deleted; their metrics must not enter the FYP results.

## Structured data

Supply CSV observations with numeric features, independently assigned `label`, and `group_id`. Repeated observations of one product or delivery must share a group ID. Do not label a row from a deterministic rule on the same input features and claim independent AI validation. Record provenance, consent/access conditions, labelling procedure and disagreements. Each class needs at least five independent groups; that is a software minimum, not proof that the dataset is sufficient.

Inventory columns: available_quantity, reserved_quantity, movement_frequency (last 30 days), reorder_distance (available minus reorder level), adjustment_count (last 30 days), days_since_replenishment, label, group_id. Labels: Normal, Reorder Risk, Critical Stock Risk.

Delivery columns: expected_duration_hours (dispatch to expected delivery date deadline, Malaysia time), elapsed_hours (at the prediction observation), failed_attempts, has_proof (0/1 at observation), status_event_count, parcel_count, label, group_id. Labels: Low, Medium, High. Features must be measured at the prediction time; future actual outcome/duration must not leak into inputs.

`data/inventory-template.csv` and `data/delivery-template.csv` contain headers only. Training rejects missing values, nonfinite features, duplicate observations, unexpected labels and insufficient groups. A fixed seeded grouped split holds out approximately one fifth; grouped cross-validation uses training data only. Reports contain class counts, split groups, confusion matrices, accuracy/precision/recall/F1, baseline results, provenance and environment/model versions. Random Forest is the selected committed model; compare Decision Tree and delivery Logistic Regression honestly.

```powershell
python -m pip install -r research/requirements.txt
python research/models.py inventory path/to/labelled-inventory.csv --provenance "Dataset origin and independent labelling method"
python research/models.py delivery path/to/labelled-deliveries.csv --provenance "Dataset origin and independent labelling method"
```

Artefacts/evaluation JSON are written to ignored research/models. Preserve reviewed assessment results in an approved non-sensitive report folder. Load only operator-controlled joblib files; never accept uploaded pickle/joblib models. Model/global feature importance is not a local causal explanation.

## Parcel images

Provide train, validation and test folders, each containing Normal and Damaged subfolders. Split by physical parcel, keeping related angles/duplicates in the same split. Supply manifest.csv columns `path,parcel_id,label`, where path is relative to the dataset root. The manifest must cover every image and keep each parcel in one split. Exact decoded duplicates, corrupt images and dimensions below 64 pixels are rejected. Five images per class/split are a software minimum; determine meaningful data sufficiency separately.

OpenCV verifies/decodes images and resizes inference input. MobileNetV2 uses 224×224 RGB with scaling to [-1,1]. Training uses ImageNet transfer learning, realistic training-only augmentation and validation early stopping. EfficientNetB0 provides the comparison. The independent test set is used for final reporting, not early stopping or parameter selection.

```powershell
python research/vision.py path/to/parcel-dataset --provenance "Image provenance, labels and parcel-level split method"
```

No labelled images exist yet, so no trained parcel model or real-image performance is claimed. Architecture execution with random weights checks software only.

## Internal inference service

Set a strong `IILAS_RESEARCH_TOKEN` in the Python process environment and run `python -m uvicorn api:app --app-dir research --host 127.0.0.1 --port 8000` for local work. Do not commit the token. `/health` reports installed model availability. `/predict` requires a matching bearer token and returns 503 when a trained model is absent. No invented fallback prediction exists.

Configure the backend's RESEARCH_API_URL and RESEARCH_API_TOKEN through secure runtime configuration. Use an authenticated HTTPS endpoint and Secret Manager for production; it cannot use this computer's loopback address. The browser invokes Firebase commands, not the Python API directly. The backend checks membership/assignment, derives features, verifies parcel bytes against evidence SHA-256, then stores model/version/confidence/source version and Pending human-review status. Admin/Manager acceptance/rejection and notes are audited; predictions cannot approve purchases or mark deliveries complete.

`npm run test:research` verifies grouped tabular training/inference and MobileNetV2 graph execution using synthetic/random-weight fixtures, with no production model installation. See release status for evidence and limitations.

Primary implementation references: [scikit-learn cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html), [TensorFlow MobileNetV2](https://www.tensorflow.org/api_docs/python/tf/keras/applications/MobileNetV2), [Hardhat contract testing](https://v2.hardhat.org/hardhat-runner/docs/guides/test-contracts).
