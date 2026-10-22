# Parcel serving adapter — 20 October 2026

`parcel_serving.py` provides a read-only artifact audit and offline inference adapter for the grouped MobileNetV2 research workflow. It does not change `api.py`, activate a model, or establish operational quality.

The validator binds the selected model to its frozen manifest/protocol, completed development and evaluation claims, current held-out image hashes, complete raw predictions and recomputed metrics. Synthetic/random-weight declarations, changed artifacts, incomplete/foreign evaluations and inconsistent reports are rejected. These local integrity checks cannot authenticate human labels, establish unknown parcel independence or replace scientific acceptance criteria.

Inference reuses the training letterbox/selected-contrast preparation and class ordering. It checks model shapes and finite probabilities, abstains on exact ties, returns evidence/model/evaluation hashes and explicitly marks confidence uncalibrated and human review required. Default inference requires the supervised runtime before image decoding or TensorFlow import. Artifact readiness always remains separate from operational approval.

From the application directory with the working toolchain selected:

```powershell
& C:/Users/Home/.venvs/iilas-fyp/Scripts/python.exe research/parcel_serving.py `
  --selection research/datasets/<development-run>/selection.json `
  --test-directory research/datasets/<test-run>
```

This command audits without loading TensorFlow. Exit 0 means artifact-ready; exit 2 means unavailable. It does not start an HTTP service.

Parent verification: `python -m unittest discover -s research -p test_parcel_serving.py -v` passed all 16 tests in 67.908 seconds. An independent agent review found no remaining substantive issues after adding current held-out byte verification and supervision-before-decode regressions. Tests use isolated fixtures/fake model loaders and provide no real-parcel accuracy evidence.

Still required: approved real data and pretrained weights, frozen bounded development/evaluation, quality acceptance, authenticated API integration, stage/access/request traceability and separately verified live-camera analysis.
