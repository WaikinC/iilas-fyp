"""One exact MobileNetV2 tail; no ML import or checkpoint access on import.

The graph seal is builtin architecture metadata from the selected classifier,
not a weight/data seal. The caller separately binds the exact starting artifact.
Only trainability and Keras' transient shared-object identifiers are excluded.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import time


_GRAPH_SHA256 = "86d0085ddaada69b2b7862161e7ab1e778bf8bd44b035029b75ca542e4ea8187"
_TAIL = frozenset(f"block_{i}_{part}" for i in (14, 15, 16)
                  for part in ("expand", "depthwise", "project")) | {"Conv_1"}


def _normalise(value):
    if isinstance(value, dict):
        return {key: _normalise(item) for key, item in value.items()
                if key not in ("trainable", "shared_object_id")}
    if isinstance(value, (list, tuple)):
        return [_normalise(item) for item in value]
    return value


def _weight_shapes():
    """MobileNetV2 alpha=1.0, include_top=False; fixed existing Dense(2)."""
    result = {}

    def convolution(name, shape):
        result[name] = [("kernel", shape)]

    def batch_norm(name, channels):
        result[name] = [(name, (channels,)) for name in
                        ("gamma", "beta", "moving_mean", "moving_variance")]

    convolution("Conv1", (3, 3, 3, 32))
    batch_norm("bn_Conv1", 32)
    convolution("expanded_conv_depthwise", (3, 3, 32, 1))
    batch_norm("expanded_conv_depthwise_BN", 32)
    convolution("expanded_conv_project", (1, 1, 32, 16))
    batch_norm("expanded_conv_project_BN", 16)
    previous = 16
    outputs = (24, 24, 32, 32, 32, 64, 64, 64, 64, 96, 96, 96,
               160, 160, 160, 320)
    for index, channels in enumerate(outputs, 1):
        prefix = f"block_{index}_"
        expanded = previous * 6
        convolution(prefix + "expand", (1, 1, previous, expanded))
        batch_norm(prefix + "expand_BN", expanded)
        convolution(prefix + "depthwise", (3, 3, expanded, 1))
        batch_norm(prefix + "depthwise_BN", expanded)
        convolution(prefix + "project", (1, 1, expanded, channels))
        batch_norm(prefix + "project_BN", channels)
        previous = channels
    convolution("Conv_1", (1, 1, 320, 1280))
    batch_norm("Conv_1_bn", 1280)
    result["normal_damaged"] = [("kernel", (1280, 2)), ("bias", (2,))]
    return result


def _name(variable):
    return str(getattr(variable, "path", variable.name))


def _record(layer, variable):
    shape = [int(size) for size in variable.shape]
    return {"layer": layer.name, "name": _name(variable), "shape": shape,
            "dtype": str(variable.dtype), "parameters": math.prod(shape)}


def _validate_model(model):
    config = model.get_config()
    digest = hashlib.sha256(json.dumps(_normalise(config), sort_keys=True,
                                      separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    if digest != _GRAPH_SHA256:
        raise ValueError("Unexpected MobileNetV2 classifier architecture/configuration")
    if (model.name != "mobilenetv2_parcel" or tuple(model.input_shape) != (None, 224, 224, 3)
            or tuple(model.output_shape) != (None, 2)):
        raise ValueError("Unexpected classifier name/input/output shape")
    shapes = _weight_shapes()
    leaves = []

    def check(layers, specifications):
        if len(layers) != len(specifications):
            raise ValueError("Missing or extra layer")
        for layer, specification in zip(layers, specifications):
            if (layer.name != specification["config"]["name"]
                    or layer.__class__.__name__ != specification["class_name"]):
                raise ValueError("Unexpected layer type/name")
            if specification["class_name"] == "Functional":
                check(layer.layers, specification["config"]["layers"])
                continue
            leaves.append(layer)
            expected = shapes.get(layer.name, [])
            if len(layer.weights) != len(expected):
                raise ValueError("Unexpected layer variable count")
            for variable, (name, shape) in zip(layer.weights, expected):
                if (_name(variable) != layer.name + "/" + name
                        or tuple(variable.shape) != shape or str(variable.dtype) != "float32"):
                    raise ValueError("Unexpected variable name/shape/dtype")

    check(model.layers, config["layers"])
    variables = [variable for layer in leaves for variable in layer.weights]
    if (len({id(variable) for variable in variables}) != len(variables)
            or [id(variable) for variable in model.weights] != [id(variable) for variable in variables]):
        raise ValueError("Unexpected shared, missing or additional classifier weights")
    return leaves


def _supervised_environment():
    from runner_runtime import require_supervised_worker
    require_supervised_worker()
    required = {"CUDA_VISIBLE_DEVICES": "-1", "TF_ENABLE_ONEDNN_OPTS": "0",
                "TF_DETERMINISTIC_OPS": "1", "TF_NUM_INTRAOP_THREADS": "1",
                "TF_NUM_INTEROP_THREADS": "1", "OMP_NUM_THREADS": "1",
                "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"}
    if any(os.environ.get(key) != value for key, value in required.items()):
        raise ValueError("Caller must configure deterministic CPU/thread environment before TensorFlow")
    # Installing the existing deny guard is idempotent and precedes ML loading.
    from parcel_train import offline
    offline()


def load_candidate(path):
    """Safe load only under the native Job; caller verifies artifact provenance."""
    _supervised_environment()
    path = Path(path)
    if not path.is_file() or path.suffix != ".keras":
        raise ValueError("Expected existing local .keras classifier")
    import tensorflow as tf
    model = tf.keras.models.load_model(str(path), compile=False, safe_mode=True)
    _validate_model(model)
    return model


def configure_tail(model):
    """Expose exactly ten convolution kernels and the two existing head weights."""
    leaves = _validate_model(model)
    # Parent flags propagate recursively, so always set them before leaf flags.
    model.trainable = True
    model.layers[2].trainable = True
    for layer in leaves:
        layer.trainable = layer.name in _TAIL or layer.name == "normal_damaged"
    expected = [variable for layer in leaves if layer.trainable for variable in layer.weights]
    actual = list(model.trainable_weights)
    if [id(variable) for variable in actual] != [id(variable) for variable in expected]:
        raise ValueError("Effective trainable variables differ from permitted tail/head")
    permitted = {id(variable) for variable in expected}
    trainable, frozen, bn = [], [], []
    layers = []
    for layer in leaves:
        layers.append({"name": layer.name, "class_name": layer.__class__.__name__,
                       "trainable": bool(layer.trainable),
                       "weight_names": [_name(variable) for variable in layer.weights]})
        for variable in layer.weights:
            record = _record(layer, variable)
            (trainable if id(variable) in permitted else frozen).append(record)
            if layer.__class__.__name__ == "BatchNormalization":
                bn.append(record)
    if len(trainable) != 12 or sum(record["parameters"] for record in trainable) != 1513282:
        raise ValueError("Tail inventory count/parameter cross-check failed")
    return {"schema_version": 1, "architecture": "mobilenetv2_parcel",
            "trainable_variables": trainable, "trainable_variable_count": len(trainable),
            "trainable_parameter_count": sum(record["parameters"] for record in trainable),
            "frozen_variables": frozen, "batch_normalization_variables": bn, "layers": layers}


def weight_fingerprints(model, frozen_only=False):
    """Hash all learned and BN state; expose non-weight RNG state separately."""
    import numpy as np
    leaves = _validate_model(model)
    trainable = {id(variable) for variable in model.trainable_weights}
    learned, bn, random = {}, {}, {}

    def fingerprint(variable):
        value = np.asarray(variable.numpy())
        if tuple(value.shape) != tuple(variable.shape):
            raise ValueError("Variable value shape mismatch")
        return {"sha256": hashlib.sha256(value.tobytes(order="C")).hexdigest(),
                "shape": list(value.shape), "dtype": str(value.dtype)}

    for layer in leaves:
        for variable in layer.weights:
            if frozen_only and id(variable) in trainable:
                continue
            name = _name(variable)
            learned[name] = fingerprint(variable)
            if layer.__class__.__name__ == "BatchNormalization":
                bn[name] = learned[name]
    weights = {id(variable) for variable in model.weights}
    for variable in model.variables:
        if id(variable) not in weights:
            name = _name(variable)
            if name.rsplit("/", 1)[-1] != "seed_generator_state" or name in random:
                raise ValueError("Unexpected non-weight model state")
            random[name] = fingerprint(variable)
    return {"learned_weights": learned, "batch_normalization": bn,
            "random_generator_state": random, "frozen_only": bool(frozen_only)}


def _probe_arrays(images, labels, sample_weights):
    import numpy as np
    x, y, weights = np.asarray(images), np.asarray(labels), np.asarray(sample_weights)
    if x.shape != (4, 224, 224, 3) or x.dtype.kind != "f" or not np.isfinite(x).all():
        raise ValueError("Probe requires exactly four finite float RGB224 images")
    if y.shape != (4,) or y.dtype.kind not in "iu" or not np.isin(y, (0, 1)).all():
        raise ValueError("Probe requires four integer Normal/Damaged labels")
    if (weights.shape != (4,) or weights.dtype.kind not in "fiu"
            or not np.isfinite(weights).all() or not (weights > 0).all()):
        raise ValueError("Probe requires four finite positive full-partition component weights")
    # Retain supplied full-partition weights; do not normalise this small batch.
    return x, y, weights


def _gradient_summary(variables, gradients):
    """Reject absent/malformed/nonfinite gradients before returning diagnostics."""
    import numpy as np
    if len(variables) != len(gradients):
        raise ValueError("Gradient inventory length mismatch")
    records = []
    for variable, gradient in zip(variables, gradients):
        if gradient is None:
            raise ValueError("Missing permitted gradient: " + _name(variable))
        value = np.asarray(gradient.numpy() if hasattr(gradient, "numpy") else gradient)
        if (tuple(value.shape) != tuple(variable.shape) or value.dtype.kind != "f"
                or not np.isfinite(value).all()):
            raise ValueError("Malformed/non-finite permitted gradient: " + _name(variable))
        norm = float(np.linalg.norm(value.astype("float64", copy=False).reshape(-1)))
        if not math.isfinite(norm):
            raise ValueError("Non-finite permitted gradient norm: " + _name(variable))
        records.append({"name": _name(variable), "finite": True,
                        "nonzero": bool(np.any(value != 0)), "l2_norm": norm})
    if not any(record["nonzero"] for record in records):
        raise ValueError("No nonzero permitted gradients")
    return records


def gradient_probe(model, images, labels, sample_weights):
    """One warmup + three timed inference-mode gradients, no optimizer or update."""
    _supervised_environment()
    x, y, weights = _probe_arrays(images, labels, sample_weights)
    supplied_weights = [float(value) for value in weights]
    inventory = configure_tail(model)
    before = weight_fingerprints(model)
    import tensorflow as tf
    x = tf.convert_to_tensor(x, dtype=tf.float32)
    y = tf.convert_to_tensor(y, dtype=tf.int32)
    weights = tf.convert_to_tensor(weights, dtype=tf.float32)
    variables = list(model.trainable_weights)
    diagnostics, elapsed = [], []
    for _ in range(4):
        began = time.perf_counter()
        with tf.GradientTape() as tape:
            # The saved backbone already has training=False; outer False also
            # disables Dropout/RNG transitions while retaining convolution grads.
            probabilities = model(x, training=False)
            tf.debugging.assert_all_finite(probabilities, "Non-finite probe probabilities")
            losses = tf.keras.losses.sparse_categorical_crossentropy(y, probabilities)
            loss = tf.reduce_sum(weights * losses) / 4.0
        gradients = tape.gradient(loss, variables)
        records = _gradient_summary(variables, gradients)
        numeric_loss = float(loss.numpy())
        if (not math.isfinite(numeric_loss) or len(records) != 12
                or not any(record["nonzero"] for record in records)):
            raise ValueError("Invalid loss or no nonzero permitted gradients")
        elapsed.append(time.perf_counter() - began)
        diagnostics.append({"loss": numeric_loss, "variables": records,
                            "all_finite_and_present": True, "any_nonzero": True})
    after = weight_fingerprints(model)
    if before != after:
        raise ValueError("No-update probe changed learned weights, BN or RNG state")
    if inventory != configure_tail(model):
        raise ValueError("Probe changed trainable inventory")
    return {"schema_version": 1, "inventory": inventory,
            "timings_seconds": {"warmup": elapsed[0], "timed_passes": elapsed[1:]},
            "gradients": diagnostics, "before": before, "after": after,
            "no_optimizer_updates": True, "learned_weights_unchanged": True,
            "batch_normalization_unchanged": True, "random_generator_state_unchanged": True,
            "training": False, "loss_reduction": "sum_weighted_sparse_ce_divided_by_batch4",
            "sample_weights": supplied_weights}
