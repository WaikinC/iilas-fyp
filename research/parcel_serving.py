"""Read-only parcel artifact audit and offline inference; never activates a model.

Integrity readiness is not scientific acceptance or operational approval. Local
seals and provenance declarations cannot authenticate human review or prove that
someone has not relabelled random weights as pretrained. Source/weight audits,
performance acceptance, and real-camera validation remain separate requirements.
No models, claims, exports or configuration are written by this module.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import time

import numpy as np
import parcel_evaluate as evaluate
import parcel_train as train
from parcel_inputs import decode_rgb, prepare_image

UNAVAILABLE = "Parcel artifacts unavailable"
LIMITATIONS = (
    "Hash consistency and declared provenance only; human source/weight audit, "
    "scientific acceptance and live-session validation remain required."
)


def _path(value):
    return train.runtime._validate_output_path(value)


def _json(path):
    value = json.loads(_path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Expected an object")
    return value


def validate_weight_provenance(settings):
    """Reject missing or explicitly non-pretrained declarations, not attest them."""
    weights = settings.get("weights")
    if not isinstance(weights, dict) or set(weights) != set(train.ARCHITECTURES):
        raise ValueError("Both pretrained weight records required")
    for name, record in weights.items():
        if not isinstance(record, dict):
            raise ValueError("Invalid pretrained weight record")
        for key in ("path", "sha256", "source", "licence_evidence"):
            value = record.get(key)
            if (not isinstance(value, str) or not value.strip()
                    or value.strip().lower() in {"none", "null", "false", "pending", "unknown", "todo", "n/a"}):
                raise ValueError("Explicit pretrained weight provenance required: " + name)
        declaration = " ".join(str(v) for k, v in record.items() if k != "path")
        if re.search(r"random|fixture|synthetic|smoke|no pretrained", declaration, re.I):
            raise ValueError("Software/random weight artifacts cannot be served")
        if record.get("pretrained") is False:
            raise ValueError("Pretrained weights required")
    if re.search(r"random|fixture|synthetic|smoke", str(settings.get("purpose", "")), re.I):
        raise ValueError("Software-only protocol cannot be served")


def _completed(key, phase, output, hash_field, expected_hash):
    claim = _path(train.ROOT / "research/datasets/parcel-run-registry" / f"{phase}-{key}")
    if (claim / "failed.json").exists():
        raise ValueError("Failed research phase cannot be served")
    started = _json(claim / "started.json")
    complete = _json(claim / "completed.json")
    if (started.get("key") != key or started.get("phase") != phase
            or _path(started["output"]) != output or complete.get(hash_field) != expected_hash):
        raise ValueError("Completed research claim does not bind this original run")
    return started


def validate_run(selection_path, test_directory):
    """Validate original completed research artifacts without fitting or loading ML."""
    try:
        selection_path, test_directory = _path(selection_path), _path(test_directory)
        initial = train.read_sealed(selection_path)
        manifest = _path(initial["binding"]["manifest"]["path"])
        data = train.load_frozen(manifest)
        if data.get("schema_version") == 2 or data.get("evaluation_scope") == "development_only":
            raise ValueError("Publisher packaging development-only artifacts cannot be served")
        if data.get("domain") != "real" or any(r.get("origin") != "real" for r in data["rows"]):
            raise ValueError("Only an independently evaluated real-parcel cohort is eligible")
        validate_weight_provenance(initial["binding"]["settings"])
        selection = evaluate.verify_selection(selection_path, manifest)
        if selection.get("confidence") != "uncalibrated":
            raise ValueError("Unsupported confidence contract")
        key = selection["development_key"]
        if train.experiment_identity(data, selection["binding"]) != key:
            raise ValueError("Experiment identity differs from frozen cohort/protocol")
        for fit in selection["all_fits"]:
            if (fit["fit_id"] != f"{fit['architecture']}-{fit['contrast']}"
                    or fit["weights_sha256"] != selection["binding"]["settings"]["weights"][fit["architecture"]]["sha256"]):
                raise ValueError("Fit does not bind the declared pretrained weights")
        selection_hash = train.runtime.sha256_file(selection_path)
        started = _completed(key, "develop", selection_path.parent, "selection_sha256", selection_hash)
        if started.get("fit_ids") != list(train.FIT_IDS):
            raise ValueError("Development budget identity differs")
        run = train.read_sealed(_path(test_directory / "test-run.json"))
        if _path(run["selection"]) != selection_path or _path(run["manifest"]) != manifest:
            raise ValueError("Foreign test run selection or manifest")
        report_path = _path(test_directory / "report.json")
        report = train.read_sealed(report_path)
        report_hash = train.runtime.sha256_file(report_path)
        started = _completed(key, "test", test_directory, "report_sha256", report_hash)
        if started.get("selection_sha256") != selection_hash:
            raise ValueError("Test claim belongs to another selection")
        if (report.get("status") != "complete" or report.get("class_order") != list(evaluate.CLASSES)
                or report.get("confidence") != "uncalibrated"
                or set(report.get("models", {})) != set(train.ARCHITECTURES)):
            raise ValueError("Incomplete or incompatible held-out report")
        rows = [r for r in data["rows"] if r["split"] == "test"]
        evaluate.validate_rows(rows)
        for row in rows:
            if train.runtime.sha256_file(_path(row["_image_path"])) != row["image_sha256"]:
                raise ValueError("Changed original test image")
        groups = {c: len({r["_group_id"] for r in rows if r["label"] == c}) for c in evaluate.CLASSES}
        if report.get("groups_per_class") != groups:
            raise ValueError("Report cohort support differs from held-out manifest")
        for fit in selection["selected"]:
            raw = train.read_sealed(_path(test_directory / (fit["architecture"] + "-raw.json")))
            if raw.get("status") != "complete" or raw.get("artifact_sha256") != fit["artifact_sha256"]:
                raise ValueError("Incomplete or foreign held-out model outputs")
            predictions = evaluate.validate_raw(rows, raw["predictions"])
            metrics = dict(image_weighted=evaluate.metrics(rows, predictions),
                           equal_parcel_weighted=evaluate.metrics(rows, predictions, True))
            if train.digest(metrics) != train.digest(report["models"][fit["architecture"]]):
                raise ValueError("Report metrics differ from complete held-out predictions")
        fit = next(f for f in selection["selected"] if f["architecture"] == "mobilenetv2")
        return dict(model="MobileNetV2", modelVersion=fit["artifact_sha256"],
            artifact=str(_path(fit["artifact"])), contrast=fit["contrast"],
            preprocessing=selection["binding"]["settings"]["preprocessing"],
            class_order=list(evaluate.CLASSES), decision=selection["decision"],
            confidence="uncalibrated", selection_sha256=selection_hash,
            report_sha256=report_hash, manifest_sha256=train.runtime.sha256_file(manifest),
            protocol_sha256=selection["binding"]["protocol"]["sha256"], development_key=key,
            operationally_approved=False, limitations=LIMITATIONS)
    except (OSError, KeyError, TypeError, AttributeError, StopIteration,
            train.runtime.RuntimeSafetyError, ValueError) as error:
        raise ValueError(f"{UNAVAILABLE}: {error}") from error


def audit(selection_path, test_directory):
    """Readiness inspection suitable for CLI; never imports TensorFlow."""
    try:
        metadata = validate_run(selection_path, test_directory)
        return dict(status="artifact_ready", operationally_approved=False, model=metadata)
    except ValueError as error:
        return dict(status="unavailable", operationally_approved=False, reason=str(error))


def _load_model(path):
    train.runtime.require_supervised_worker()
    import tensorflow as tf
    return tf.keras.models.load_model(path, compile=False, safe_mode=True)


def predict_image(data, selection_path, test_directory, *, loader=None):
    """Supervised offline inference; injected software loaders still validate runs."""
    if loader is None:
        train.runtime.require_supervised_worker()
    metadata = validate_run(selection_path, test_directory)
    started = time.perf_counter()
    if not isinstance(data, bytes) or not 0 < len(data) <= 10 * 1024 * 1024:
        raise ValueError("Provide nonempty encoded parcel image bytes up to 10 MiB")
    rgb = decode_rgb(data)
    if rgb.shape[0] * rgb.shape[1] > 24_000_000:
        raise ValueError("Parcel image exceeds 24 megapixels")
    tensor = prepare_image(rgb, metadata["contrast"])
    model = (loader or _load_model)(metadata["artifact"])
    if train.runtime.sha256_file(metadata["artifact"]) != metadata["modelVersion"]:
        raise ValueError("Model artifact changed while loading")
    if model.input_shape != (None, 224, 224, 3) or model.output_shape != (None, 2):
        raise ValueError("Invalid parcel model input/output shape")
    scores = np.asarray(model(np.expand_dims(tensor, 0), training=False))
    if scores.shape != (1, 2):
        raise ValueError("Invalid parcel prediction shape")
    probabilities = scores[0].tolist()
    label = evaluate.decide(probabilities)
    return dict(status="abstained" if label is None else "predicted", label=label,
        confidence=max(probabilities), probabilities=probabilities,
        confidenceMeaning="uncalibrated", model=metadata["model"],
        modelVersion=metadata["modelVersion"], preprocessing=metadata["preprocessing"],
        contrast=metadata["contrast"], evidenceSha256=hashlib.sha256(data).hexdigest(),
        selectionSha256=metadata["selection_sha256"], evaluationSha256=metadata["report_sha256"],
        classOrder=list(metadata["class_order"]), acceptanceSha256=None,
        processingTimeMs=(time.perf_counter() - started) * 1000,
        humanReviewRequired=True, operationally_approved=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--test-directory", type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.selection, args.test_directory)
    print(json.dumps(result, indent=2, allow_nan=False))
    return 0 if result["status"] == "artifact_ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
