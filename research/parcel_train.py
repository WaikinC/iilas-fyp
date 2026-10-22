"""Offline, bounded parcel development. No active application model writes.

The public entrypoint prepares metadata and a durable claim before starting a
Windows Job-contained phase. Only fit workers import TensorFlow. Test pixels are
never read by development. Hash seals detect accidental edits, not hostile users
who can edit code and regenerate seals.
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import sys

import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROTOCOL = Path(__file__).parent / "protocols/parcel_mobilenetv2_v1.json"
ARCHITECTURES = ("mobilenetv2", "efficientnetb0")
CONTRASTS = ("none", "clahe")
FIT_IDS = tuple(f"{a}-{c}" for a in ARCHITECTURES for c in CONTRASTS)
DEPENDENCIES = ("tensorflow", "keras", "h5py", "numpy", "opencv-python-headless")
CODE_FILES = ("parcel_manifest.py", "parcel_inputs.py", "parcel_models.py",
              "parcel_train.py", "parcel_evaluate.py", "runner_runtime.py")
MiB = 1024 ** 2


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def write_sealed(path, payload):
    runtime.write_json_exclusive(path, {"payload": payload, "sha256": digest(payload)})


def read_sealed(path):
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if set(value) != {"payload", "sha256"} or digest(value["payload"]) != value["sha256"]:
        raise ValueError("Invalid hash seal")
    return value["payload"]


def claim_phase(key, phase, detail, registry=None):
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("Invalid experiment digest")
    if phase not in ("develop", "test"):
        raise ValueError("Invalid experiment phase")
    base = runtime._validate_output_path(registry or ROOT / "research/datasets/parcel-run-registry")
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{phase}-{key}"
    try:
        path.mkdir()
    except FileExistsError as error:
        raise ValueError("Experiment already claimed; automatic rerun forbidden") from error
    runtime.write_json_exclusive(path / "started.json",
                                 {"key": key, "phase": phase, **detail})
    return path


def finish_claim(path, status, details):
    if status not in ("failed", "completed"):
        raise ValueError("Invalid final claim state")
    runtime.write_json_exclusive(Path(path) / f"{status}.json", details)


def configure_cpu():
    if "tensorflow" in sys.modules:
        raise ValueError("CPU configuration must precede TensorFlow import")
    os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
    os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
    os.environ["TF_DETERMINISTIC_OPS"] = "1"
    for name in ("TF_NUM_INTRAOP_THREADS", "TF_NUM_INTEROP_THREADS", "OMP_NUM_THREADS",
                 "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
        os.environ[name] = "1"


def offline():
    """No download fallback or hosted inference from experiment workers."""
    import socket
    def denied(*args, **kwargs):
        raise RuntimeError("Network prohibited in parcel experiments")
    socket.create_connection = denied
    socket.socket.connect = denied
    socket.socket.connect_ex = denied


def worker_environment(output):
    """Keras serialization must use the bounded, ignored output tree for temp."""
    import tempfile
    target = runtime._validate_output_path(output) / "tmp"
    target.mkdir(exist_ok=True)
    os.environ["TEMP"] = os.environ["TMP"] = str(target)
    tempfile.tempdir = str(target)
    configure_cpu()
    offline()


def phase_limits(test=False):
    return runtime.Limits(
        max_wall_seconds=900 if test else 3900,
        max_fit_seconds=600 if test else 900, max_rss_bytes=2048 * MiB,
        min_available_bytes=3072 * MiB, min_free_disk_bytes=2048 * MiB,
        max_output_bytes=(256 if test else 512) * MiB,
        available_floor_bytes=768 * MiB, threads=1)


def environment():
    return {"python": platform.python_version(), "platform": platform.platform(),
            "packages": {name: importlib.metadata.version(name) for name in DEPENDENCIES}}


def code_bindings():
    return {name: runtime.sha256_file(Path(__file__).parent / name) for name in CODE_FILES}


def load_protocol(path):
    path = Path(path).resolve()
    data = json.loads(path.read_text(encoding="utf-8"))
    expected = {"schema_version": 1, "seed": 42, "batch_size": 4, "epochs": 10,
                "patience": 3, "learning_rate": .001, "dropout": .2,
                "architectures": list(ARCHITECTURES), "contrasts": list(CONTRASTS),
                "class_order": ["Normal", "Damaged"], "preprocessing": "rgb-letterbox224-v1",
                "selection": "macro_f1_desc-loss_asc-none_first"}
    for key, value in expected.items():
        if data.get(key) != value:
            raise ValueError("Protocol amendment required: " + key)
    if data.get("limits") != {
        "develop": vars(phase_limits()), "test": vars(phase_limits(True))
    }:
        raise ValueError("Protocol amendment required: limits")
    if data.get("packages") != environment()["packages"]:
        raise ValueError("Installed dependency versions differ from pinned protocol")
    weights = data.get("weights", {})
    if set(weights) != set(ARCHITECTURES):
        raise ValueError("Both pretrained weight records required")
    for name in ARCHITECTURES:
        record = weights[name]
        if not record.get("path") or not record.get("licence_evidence") or not record.get("source"):
            raise ValueError("Missing local pretrained weight/provenance record: " + name)
        weight = Path(record["path"])
        if not weight.is_absolute():
            weight = path.parent / weight
        weight = runtime._validate_output_path(weight)
        if not weight.is_file() or runtime.sha256_file(weight) != record.get("sha256"):
            raise ValueError("Missing or changed pretrained weight: " + name)
        record["path"] = str(weight)
    return data


def read_image(row, *, allowed):
    if row["split"] not in allowed:
        raise ValueError("Forbidden image partition")
    path = Path(row["_image_path"])
    runtime._validate_output_path(path)
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != row["image_sha256"]:
        raise ValueError("Image hash mismatch")
    from parcel_inputs import decode_rgb
    return decode_rgb(data)


def load_frozen(path):
    from parcel_manifest import load_manifest, audit_manifest, benchmark_context
    path = Path(path).resolve()
    runtime._validate_output_path(path)
    receipt_path = Path(str(path) + ".audit.json")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if (receipt.get("verify_images") is not True
            or receipt.get("manifest_sha256") != runtime.sha256_file(path)):
        raise ValueError("Frozen manifest receipt mismatch")
    data = load_manifest(path, verify_images=False)
    if receipt.get("source_registry_sha256") != data["source_registry_sha256"]:
        raise ValueError("Frozen source receipt mismatch")
    if data["schema_version"] == 2 and receipt.get("benchmark_context") != benchmark_context(data):
        raise ValueError("Frozen benchmark context mismatch")
    if not data.get("original_manifest_sha256"):
        raise ValueError("Split was not frozen")
    audit_manifest(path, verify_images=False)
    if {r["split"] for r in data["rows"]} != {"train", "validation", "test"}:
        raise ValueError("Complete frozen partitions required")
    return data


def choose_variant(rows):
    if {r["contrast"] for r in rows} != set(CONTRASTS) or len(rows) != 2:
        raise ValueError("Two contrast candidates required")
    if any(not math.isfinite(r[k]) for r in rows for k in ("macro_f1", "validation_loss")):
        raise ValueError("Invalid validation metric")
    return min(rows, key=lambda r: (-r["macro_f1"], r["validation_loss"],
                                    CONTRASTS.index(r["contrast"])))


def validate_fit_set(results):
    if (len(results) != 4 or {r.get("fit_id") for r in results} != set(FIT_IDS)
            or any(r.get("status") != "success" for r in results)):
        raise ValueError("All four successful fits required before selection")


def experiment_identity(data, binding):
    """Content identity, independent of copied manifest/weight/output locations."""
    from parcel_manifest import benchmark_context
    context = {"benchmark_context": benchmark_context(data)} if data.get("schema_version") == 2 else {}
    settings = json.loads(json.dumps(binding["settings"]))
    for record in settings.get("weights", {}).values():
        record.pop("path", None)
    rows = [{k: v for k, v in row.items()
             if k not in ("image_path", "_image_path")} for row in data["rows"]]
    return digest({"domain": data.get("domain"), **context,
                   "source_registry_sha256": data.get("source_registry_sha256"),
                   "rows": sorted(rows, key=lambda r: r["sample_id"]),
                   "settings": settings, "code": binding["code"],
                   "environment": binding["environment"]})


def prepare_development(manifest, protocol, output):
    from parcel_manifest import benchmark_context
    data = load_frozen(manifest)  # metadata only; never decode test images here
    settings = load_protocol(protocol)
    binding = {"manifest": {"path": str(Path(manifest).resolve()),
                            "sha256": runtime.sha256_file(manifest)},
               "protocol": {"path": str(Path(protocol).resolve()),
                            "sha256": runtime.sha256_file(protocol)},
               "settings": settings, "code": code_bindings(), "environment": environment()}
    if data.get("schema_version") == 2:
        binding["benchmark_context"] = benchmark_context(data)
    key = experiment_identity(data, binding)
    out = runtime.create_run_directory(output)
    supervisor = runtime.ResourceSupervisor(out, phase_limits())
    try:
        supervisor.preflight()
    except Exception as error:
        runtime.write_json_exclusive(out / "preflight-failed.json", {"reason": str(error)})
        raise
    claim = claim_phase(key, "develop", {"output": str(out), "fit_ids": list(FIT_IDS)})
    write_sealed(out / "development.json", {"binding": binding, "key": key,
                                          "claim": str(claim), "output": str(out)})
    return out, claim, supervisor


def verify_binding(binding):
    for kind in ("manifest", "protocol"):
        record = binding[kind]
        runtime._validate_output_path(record["path"]) if kind == "manifest" else None
        if runtime.sha256_file(record["path"]) != record["sha256"]:
            raise ValueError("Changed " + kind)
    if binding["code"] != code_bindings() or binding["environment"] != environment():
        raise ValueError("Changed code or dependency environment")
    if load_protocol(binding["protocol"]["path"]) != binding["settings"]:
        raise ValueError("Changed protocol or weights")
    if "benchmark_context" in binding:
        from parcel_manifest import benchmark_context
        if binding["benchmark_context"] != benchmark_context(load_frozen(binding["manifest"]["path"])):
            raise ValueError("Changed benchmark context")


def develop(manifest, protocol, output):
    out, claim, supervisor = prepare_development(manifest, protocol, output)
    try:
        result = supervisor.run(
            [sys.executable, str(Path(__file__).resolve()), "_phase", "--output", str(out)],
            fit_id="development", cwd=ROOT, enforce_fit_timeout=False)
        if result["status"] != "success" or not (out / "selection.json").is_file():
            raise ValueError("Development incomplete: " + str(result["reason"]))
        finish_claim(claim, "completed", {"selection_sha256": runtime.sha256_file(out / "selection.json")})
    except Exception as error:
        finish_claim(claim, "failed", {"reason": str(error)})
        raise
    return out / "selection.json"


def _phase(out):
    runtime.require_supervised_worker()
    run = read_sealed(out / "development.json")
    verify_binding(run["binding"])
    supervisor = runtime.ResourceSupervisor(out, phase_limits())
    results = []
    for fit_id in FIT_IDS:
        record = supervisor.run(
            [sys.executable, str(Path(__file__).resolve()), "_fit", "--output", str(out),
             "--fit-id", fit_id], fit_id=fit_id, cwd=ROOT)
        if record["status"] != "success":
            raise ValueError("Fit failed; no replacement fit: " + fit_id)
        results.append(read_sealed(out / fit_id / "fit.json"))
    validate_fit_set(results)
    selected = [choose_variant([r for r in results if r["architecture"] == name])
                for name in ARCHITECTURES]
    write_sealed(out / "selection.json", {
        "status": "complete", "development_key": run["key"], "binding": run["binding"],
        **({"benchmark_context": run["binding"]["benchmark_context"]}
           if "benchmark_context" in run["binding"] else {}),
        "selected": selected, "all_fits": results, "class_order": ["Normal", "Damaged"],
        "decision": "argmax-exact-tie-abstains", "confidence": "uncalibrated",
        "test_metrics": "Not run"})


def _fit(out, fit_id):
    runtime.require_supervised_worker()
    if fit_id not in FIT_IDS:
        raise ValueError("Unknown fit")
    run = read_sealed(out / "development.json")
    verify_binding(run["binding"])
    data = load_frozen(run["binding"]["manifest"]["path"])
    settings = run["binding"]["settings"]
    architecture, contrast = fit_id.rsplit("-", 1)
    target = out / fit_id
    target.mkdir(exist_ok=False)
    worker_environment(target)
    import numpy as np
    import tensorflow as tf
    from parcel_inputs import prepare_image, augment_image
    from parcel_models import build_classifier
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    tf.keras.utils.set_random_seed(42)
    tf.keras.mixed_precision.set_global_policy("float32")
    rows = {s: [r for r in data["rows"] if r["split"] == s] for s in ("train", "validation")}

    def dataset(split):
        def stream():
            for row in rows[split]:
                image = prepare_image(read_image(row, allowed=(split,)), contrast)
                yield image, np.int32(["Normal", "Damaged"].index(row["label"]))
        ds = tf.data.Dataset.from_generator(
            stream, output_signature=(tf.TensorSpec((224, 224, 3), tf.float32),
                                       tf.TensorSpec((), tf.int32)))
        if split == "train":
            # Shuffle indices upstream rather than retaining decoded image buffers.
            rng = np.random.default_rng(42)
            # Per-iteration deterministic generator produces repeatable epoch order.
            def augmented():
                for index in rng.permutation(len(rows[split])):
                    row = rows[split][int(index)]
                    image = prepare_image(read_image(row, allowed=("train",)), contrast)
                    image = augment_image(image, rng, training=True)
                    yield image, np.int32(["Normal", "Damaged"].index(row["label"]))
            ds = tf.data.Dataset.from_generator(
                augmented, output_signature=(tf.TensorSpec((224, 224, 3), tf.float32),
                                               tf.TensorSpec((), tf.int32)))
        options = tf.data.Options()
        options.threading.private_threadpool_size = 1
        options.threading.max_intra_op_parallelism = 1
        options.experimental_deterministic = True
        return ds.batch(4).with_options(options).prefetch(1)

    model = build_classifier(architecture, Path(settings["weights"][architecture]["path"]))
    model.compile(optimizer=tf.keras.optimizers.Adam(.001),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    history = model.fit(dataset("train"), validation_data=dataset("validation"), epochs=10,
                        callbacks=[tf.keras.callbacks.EarlyStopping(
                            monitor="val_loss", patience=3, restore_best_weights=True)], verbose=2)
    # Separate iteration after restoration, same immutable validation order.
    probabilities = []
    for row in rows["validation"]:
        x = prepare_image(read_image(row, allowed=("validation",)), contrast)
        probabilities.append(model(np.expand_dims(x, 0), training=False).numpy()[0].tolist())
    raw = [{"sample_id": r["sample_id"], "label": r["label"], "probabilities": p}
           for r, p in zip(rows["validation"], probabilities)]
    runtime.write_json_exclusive(target / "validation-predictions.json", raw)
    truth = np.array([["Normal", "Damaged"].index(r["label"]) for r in rows["validation"]])
    scores = np.asarray(probabilities)
    prediction = scores.argmax(axis=1)
    prediction[scores[:, 0] == scores[:, 1]] = -1
    f1s = []
    for label in (0, 1):
        tp = int(((truth == label) & (prediction == label)).sum())
        fp = int(((truth != label) & (prediction == label)).sum())
        fn = int(((truth == label) & (prediction != label)).sum())
        f1s.append(2 * tp / (2 * tp + fp + fn))
    loss = float(-np.log(np.clip(scores[np.arange(len(truth)), truth], 1e-7, 1)).mean())
    artifact = target / "classifier.keras"
    model.save(artifact)
    runtime.write_json_exclusive(target / "history.json", history.history)
    write_sealed(target / "fit.json", {
        "status": "success", "fit_id": fit_id, "architecture": architecture, "contrast": contrast,
        "macro_f1": float(np.mean(f1s)), "validation_loss": loss,
        "artifact": str(artifact), "artifact_sha256": runtime.sha256_file(artifact),
        "validation_predictions_sha256": runtime.sha256_file(target / "validation-predictions.json"),
        "seed": 42, "weights_sha256": settings["weights"][architecture]["sha256"]})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("develop", "_phase", "_fit"))
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--protocol", type=Path, default=DEFAULT_PROTOCOL)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fit-id")
    args = parser.parse_args()
    if args.command == "develop":
        if args.manifest is None:
            parser.error("--manifest required")
        print(develop(args.manifest, args.protocol, args.output))
    elif args.command == "_phase":
        _phase(args.output)
    else:
        _fit(args.output, args.fit_id)


if __name__ == "__main__":
    main()
