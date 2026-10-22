"""Offline, supervised crop-only development; no test scoring or app model output.

The larger cohort has its own provenance profile, protocol and claim namespace.
Existing full-original pilot sources and results remain immutable. Hash seals are
local reproducibility guards, not protection against an owner editing the files.
"""
import argparse
from collections import Counter
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import parcel_train as base
import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
MiB = 1024 ** 2
ARCHITECTURES = ("mobilenetv2", "efficientnetb0")
CONTRASTS = ("none", "clahe")
FIT_IDS = tuple(f"{architecture}-{contrast}" for architecture in ARCHITECTURES for contrast in CONTRASTS)
CLASS_ORDER = ("Normal", "Damaged")
PROFILE = "kaputt_crop_development"
TEST_ADMISSION = "fixed-technical-and-dhash4-test-quarantine-v1"
TEST_ADMISSION_SHA256 = "2892e2c303f5c019e0024cac605becbbcd40f27822ff8223f4754bee4deb43f1"
CODE_FILES = ("kaputt_crop_train.py", "kaputt_crop_manifest.py", "parcel_train.py",
              "parcel_manifest.py", "parcel_inputs.py", "parcel_models.py", "runner_runtime.py")
PINNED_PACKAGES = {"tensorflow": "2.21.0", "keras": "3.15.1", "h5py": "3.14.0",
                   "numpy": "2.4.2", "opencv-python-headless": "4.14.0.94"}
# Hashes cover every weight metadata field except the relocatable local path.
# They preserve the exact source, scope-limited licence assessment and prior
# acquisition/offline compatibility evidence of the verified pilot.
WEIGHT_METADATA = {
    "mobilenetv2": "785686610c5722a28e92f5296c4011d9c9bd1ae95daa39a5d3e755b6e7a0b75f",
    "efficientnetb0": "7f146799fd429a5161b52d3637e47bc3b7fa2b3e8bae0ed61be1bbd3c73d7772",
}
PROOF_HASHES = {
    "010572de5a61f8a1fd853c4095a983d1a1350880e09cf97c8a1d3ce0b8eaa187",
    "f477f371442b8d0fd7709516ba94dfbb3453d2133131b4c5e56feda703befbe6",
    "8f0c0c1845a4aa03814b947ad1c9f27a4bdc390ce9f63054d02d5c49def41c63",
    "3c4c48d6ad069abacd1381c4374f6e02b7e586809f8013b35dbd56c634a8108c",
}


def phase_limits():
    return runtime.Limits(max_wall_seconds=12300, max_fit_seconds=3000,
                          max_rss_bytes=2048*MiB, min_available_bytes=3072*MiB,
                          min_free_disk_bytes=2048*MiB, max_output_bytes=512*MiB,
                          available_floor_bytes=768*MiB, threads=1)


def code_bindings():
    return {name: runtime.sha256_file(Path(__file__).parent/name) for name in CODE_FILES}


def _research_file_path(path):
    """Pure filesystem guard; manifest admission checks Git once per tree."""
    path = Path(path)
    if ".." in path.parts:
        raise ValueError("Path must remain below research data")
    for node in (path.absolute(),*path.absolute().parents):
        if (node.is_symlink() or (hasattr(node,"is_junction") and node.is_junction())
                or (node.exists() and getattr(node.lstat(),"st_file_attributes",0) & 0x400)):
            raise ValueError("Research link/reparse path forbidden")
        if node == ROOT: break
    path = path.resolve()
    if not path.is_relative_to(ROOT/"research/datasets"):
        raise ValueError("Path must remain below research data")
    return path


def load_protocol(path):
    if Path(path).suffix != ".json":
        raise ValueError("Bounded JSON protocol metadata required")
    path = runtime._validate_output_path(_research_file_path(path))
    if not path.is_file() or not 0 < path.stat().st_size <= MiB:
        raise ValueError("Bounded JSON protocol metadata required")
    data = json.loads(path.read_text(encoding="utf-8"))
    expected = {"schema_version": 1, "benchmark_profile": PROFILE,
                "evaluation_scope": "development_only", "operationally_approved": False,
                "input_scope": "crop_only", "seed": 42, "batch_size": 4,
                "epochs": 10, "patience": 3, "learning_rate": .001, "dropout": .2,
                "architectures": list(ARCHITECTURES), "contrasts": list(CONTRASTS),
                "class_order": list(CLASS_ORDER), "preprocessing": "rgb-letterbox224-v1",
                "weighting": "equal_dependency_component_mean1",
                "selection": "component_macro_f1_desc-nll_asc-none_first",
                "limits": {"develop": vars(phase_limits())}, "packages": PINNED_PACKAGES}
    for key, value in expected.items():
        if data.get(key) != value or type(data.get(key)) is not type(value):
            raise ValueError("Protocol amendment required: " + key)
    policy = data.get("internal_test_admission")
    if (not isinstance(policy,dict) or policy.get("policy_version") != TEST_ADMISSION
            or base.digest(policy) != TEST_ADMISSION_SHA256):
        raise ValueError("Fixed internal test admission policy required before fitting")
    if data["packages"] != base.environment()["packages"]:
        raise ValueError("Installed dependencies differ from pinned protocol")
    if set(data.get("weights", {})) != set(ARCHITECTURES):
        raise ValueError("Both official pretrained weight records required")
    for name, record in data["weights"].items():
        if base.digest({key: value for key,value in record.items() if key != "path"}) != WEIGHT_METADATA[name]:
            raise ValueError("Changed pretrained weight provenance: " + name)
        local = Path(record.get("path", ""))
        if not local.is_absolute(): local = path.parent/local
        local = runtime._validate_output_path(_research_file_path(local))
        if not local.is_file() or runtime.sha256_file(local) != record["sha256"]:
            raise ValueError("Missing or changed pretrained weight: " + name)
        record["path"] = str(local)
    proofs = data.get("weight_proofs", [])
    if len(proofs) != 4 or {r.get("sha256") for r in proofs} != PROOF_HASHES:
        raise ValueError("Exact local licence/acquisition/compatibility proofs required")
    for record in proofs:
        if set(record) != {"path", "sha256"}:
            raise ValueError("Invalid pretrained evidence record")
        local = Path(record["path"])
        if not local.is_absolute(): local = path.parent/local
        local = runtime._validate_output_path(_research_file_path(local))
        if not local.is_file() or runtime.sha256_file(local) != record["sha256"]:
            raise ValueError("Changed local pretrained evidence")
        record["path"] = str(local)
    return data


def component_weights(rows):
    """Each dependency component contributes the same total; mean image weight=1.

    Compute independently for each partition. Mixed labels remain as published;
    no majority vote or class rebalancing is performed.
    """
    if not rows or len({r.get("split") for r in rows}) != 1 or rows[0].get("split") not in ("train", "validation"):
        raise ValueError("A single development partition is required")
    if len({r.get("sample_id") for r in rows}) != len(rows):
        raise ValueError("duplicate sample in partition")
    if any(not r.get("dependency_group_id") or r.get("label") not in CLASS_ORDER for r in rows):
        raise ValueError("Missing dependency component or publisher label")
    counts = Counter(row["dependency_group_id"] for row in rows)
    return [len(rows)/(len(counts)*counts[row["dependency_group_id"]]) for row in rows]


def _scores(truth, scores, weights):
    if not truth or len(scores) != len(truth) or len(weights) != len(truth):
        raise ValueError("Prediction/weight count mismatch")
    for label, probability, weight in zip(truth, scores, weights):
        if label not in (0, 1) or not math.isfinite(weight) or weight <= 0:
            raise ValueError("Invalid label or sample weight")
        if (len(probability) != 2 or any(not math.isfinite(float(p)) or not 0 <= p <= 1 for p in probability)
                or not math.isclose(sum(probability), 1., rel_tol=0, abs_tol=1e-5)):
            raise ValueError("Invalid class probabilities")


def weighted_nll(truth, scores, weights):
    _scores(truth, scores, weights)
    return sum(-weight*math.log(max(1e-7, min(1., scores[index][label])))
               for index,(label,weight) in enumerate(zip(truth,weights)))/sum(weights)


def _metrics(truth, scores, weights, predictions):
    confusion = [[0.,0.,0.],[0.,0.,0.]]
    for label,prediction,weight in zip(truth,predictions,weights):
        confusion[label][prediction if prediction >= 0 else 2] += weight
    per_class = {}
    f1s = []
    for label in (0,1):
        tp = confusion[label][label]
        fp = confusion[1-label][label]
        fn = sum(confusion[label])-tp
        f1 = 2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0.
        per_class[CLASS_ORDER[label]] = {"precision": tp/(tp+fp) if tp+fp else None,
                                       "recall": tp/(tp+fn) if tp+fn else None,
                                       "f1": f1, "support_weight": tp+fn,
                                       "predicted_weight":tp+fp,
                                       "true_positive_weight":tp,"false_positive_weight":fp,
                                       "false_negative_weight":fn}
        f1s.append(f1)
    return {"macro_f1": sum(f1s)/2, "nll": weighted_nll(truth,scores,weights),
            "accuracy": (confusion[0][0]+confusion[1][1])/sum(weights),
            "confusion": confusion, "confusion_columns": [*CLASS_ORDER,"Abstain"],
            "abstention_weight": sum(r[2] for r in confusion), "per_class": per_class,
            "undefined_precision_recall":None,"zero_division_f1":0}


def validation_metrics(rows, probabilities):
    weights = component_weights(rows)
    truth = [CLASS_ORDER.index(row["label"]) for row in rows]
    _scores(truth, probabilities, weights)
    predictions = [-1 if p[0] == p[1] else (0 if p[0] > p[1] else 1) for p in probabilities]
    return {"component_weighted": _metrics(truth, probabilities, weights, predictions),
            "image_unweighted": _metrics(truth, probabilities, [1.]*len(rows), predictions),
            "predictions": predictions}


def partition_summary(rows):
    component_weights(rows)
    labels = {label: len({r["dependency_group_id"] for r in rows if r["label"] == label})
              for label in CLASS_ORDER}
    return {"images": len(rows), "source_items": len({r.get("item_identifier",r["dependency_group_id"]) for r in rows}),
            "dependency_components": len({r["dependency_group_id"] for r in rows}),
            "image_classes": dict(Counter(r["label"] for r in rows)),
            "components_with_class": labels,
            "mixed_label_components": sum(len({r["label"] for r in rows if r["dependency_group_id"] == group}) > 1
                                          for group in {r["dependency_group_id"] for r in rows})}


def choose_variant(rows):
    if len(rows) != 2 or {row.get("contrast") for row in rows} != set(CONTRASTS):
        raise ValueError("Two distinct contrast candidates required")
    if any(not math.isfinite(row[key]) or row[key] < 0
           for row in rows for key in ("component_macro_f1","component_nll")):
        raise ValueError("Invalid component validation metric")
    return min(rows,key=lambda row:(-row["component_macro_f1"],row["component_nll"],CONTRASTS.index(row["contrast"])))


def validate_fit_set(results):
    if (len(results) != 4 or {row.get("fit_id") for row in results} != set(FIT_IDS)
            or any(row.get("status") != "success"
                   or row.get("fit_id") != f"{row.get('architecture')}-{row.get('contrast')}"
                   for row in results)):
        raise ValueError("All four unique successful fits required before selection")
    for name in ARCHITECTURES:
        choose_variant([row for row in results if row["architecture"] == name])


def read_image(row, *, allowed):
    if row.get("split") not in ("train", "validation") or row.get("split") not in allowed:
        raise ValueError("Forbidden image partition")
    # The manifest checks the whole ignored/untracked tree at admission. Repeat
    # filesystem containment/link checks here, without two Git processes per
    # decoded example at every epoch.
    path = _research_file_path(row["_image_path"])
    if not 0 < path.stat().st_size <= 16*MiB:
        raise ValueError("Image byte bound exceeded")
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != row["image_sha256"]:
        raise ValueError("Image hash mismatch")
    # The verified manifest binds JPEG dimensions before decode, and each read
    # rechecks immutable bytes. No held-out image path enters this function.
    if (min(row["width"],row["height"]) < 64 or row["width"]*row["height"] > 16_000_000):
        raise ValueError("Image dimension bound exceeded")
    import cv2
    import numpy as np
    original = cv2.imdecode(np.frombuffer(payload,np.uint8),cv2.IMREAD_COLOR|cv2.IMREAD_IGNORE_ORIENTATION)
    if original is None or tuple(original.shape[:2]) != (row["height"],row["width"]):
        raise ValueError("Changed decoded dimensions")
    if hashlib.sha256(original.tobytes()).hexdigest() != row["decoded_sha256"]:
        raise ValueError("Changed decoded pixels")
    del original
    from parcel_inputs import decode_rgb
    return decode_rgb(payload)


def image_stream(rows, contrast, *, training, rng=None):
    """Stream immutable JPEGs without caching decoded images or held-out paths."""
    import numpy as np
    from parcel_inputs import prepare_image,augment_image
    weights = component_weights(rows)
    split = "train" if training else "validation"
    if rows[0]["split"] != split:
        raise ValueError("Training flag differs from image partition")
    rng = rng if rng is not None else np.random.default_rng(42)
    indices = rng.permutation(len(rows)) if training else range(len(rows))
    for index in indices:
        row = rows[int(index)]
        image = prepare_image(read_image(row,allowed=(split,)),contrast)
        if training: image = augment_image(image,rng,training=True)
        yield image,np.int32(CLASS_ORDER.index(row["label"])),np.float32(weights[int(index)])


def load_frozen(path):
    from kaputt_crop_manifest import load_manifest
    path = runtime._validate_output_path(Path(path))
    data = load_manifest(path,verify_images=False)
    if (data.get("profile") != PROFILE or data.get("schema_version") != 1
            or data.get("evaluation_scope") != "development_only"
            or data.get("operationally_approved") is not False or data.get("frozen_development") is not True
            or {row.get("split") for row in data["rows"]} != {"train","validation"}
            or any(row.get("official_split") != "train" for row in data["rows"])):
        raise ValueError("Frozen crop-only development manifest required")
    for split in ("train","validation"):
        component_weights([row for row in data["rows"] if row["split"] == split])
    train_groups = {r["dependency_group_id"] for r in data["rows"] if r["split"] == "train"}
    if train_groups & {r["dependency_group_id"] for r in data["rows"] if r["split"] == "validation"}:
        raise ValueError("Dependency component crosses partitions")
    return data


def experiment_identity(data,binding):
    settings = copy.deepcopy(binding["settings"])
    for record in settings.get("weights",{}).values(): record.pop("path",None)
    for record in settings.get("weight_proofs",[]): record.pop("path",None)
    if "weight_proofs" in settings:
        settings["weight_proofs"] = sorted(settings["weight_proofs"],key=lambda record:record["sha256"])
    context = {key:value for key,value in binding["benchmark_context"].items()
               if key != "manifest_sha256"}
    source_hashes = {role: record["sha256"] if isinstance(record,dict) else record
                     for role,record in data.get("source_hashes",{}).items()}
    # Path relocation cannot permit another fit of the same scientific setup.
    rows = [{key:value for key,value in row.items() if key not in ("image_path","_image_path")}
            for row in data["rows"]]
    return base.digest({"profile": data.get("profile"), "source_hashes": source_hashes,
                        "rows": sorted(rows,key=lambda row:row["sample_id"]),
                        "settings": settings, "code": binding["code"],
                        "environment": binding["environment"],
                        "benchmark_context": context})


def claim_development(key, detail, registry=None):
    return base.claim_phase(key,"develop",detail,
                            registry or ROOT/"research/datasets/kaputt-crop-run-registry")


def prepare_development(manifest,protocol,output):
    from kaputt_crop_manifest import benchmark_context
    data = load_frozen(manifest)  # Metadata only. Never decode reserved test candidates.
    settings = load_protocol(protocol)
    binding = {"manifest": {"path": str(Path(manifest).resolve()),"sha256":runtime.sha256_file(manifest)},
               "protocol": {"path": str(Path(protocol).resolve()),"sha256":runtime.sha256_file(protocol)},
               "settings":settings,"code":code_bindings(),"environment":base.environment(),
               "benchmark_context":benchmark_context(data)}
    key = experiment_identity(data,binding)
    out = runtime.create_run_directory(output)
    supervisor = runtime.ResourceSupervisor(out,phase_limits())
    try: supervisor.preflight()
    except Exception as error:
        runtime.write_json_exclusive(out/"preflight-failed.json",{"reason":str(error)})
        raise
    claim = claim_development(key,{"output":str(out),"fit_ids":list(FIT_IDS),"profile":PROFILE})
    base.write_sealed(out/"development.json",{"binding":binding,"key":key,
                                            "claim":str(claim),"output":str(out)})
    return out,claim,supervisor


def verify_binding(binding):
    from kaputt_crop_manifest import benchmark_context
    for name in ("manifest","protocol"):
        record = binding[name]
        if name == "manifest": runtime._validate_output_path(record["path"])
        if runtime.sha256_file(record["path"]) != record["sha256"]:
            raise ValueError("Changed "+name)
    if binding["code"] != code_bindings() or binding["environment"] != base.environment():
        raise ValueError("Changed code or dependency environment")
    if binding["settings"] != load_protocol(binding["protocol"]["path"]):
        raise ValueError("Changed protocol/weight evidence")
    if binding["benchmark_context"] != benchmark_context(load_frozen(binding["manifest"]["path"])):
        raise ValueError("Changed crop provenance context")


def develop(manifest,protocol,output):
    out,claim,supervisor = prepare_development(manifest,protocol,output)
    try:
        result = supervisor.run([sys.executable,str(Path(__file__).resolve()),"_phase","--output",str(out)],
                                fit_id="development",cwd=ROOT,enforce_fit_timeout=False)
        if result["status"] != "success" or not (out/"selection.json").is_file():
            raise ValueError("Development incomplete; no replacement: "+str(result["reason"]))
        selection = base.read_sealed(out/"selection.json")
        run = base.read_sealed(out/"development.json")
        if (selection.get("development_key") != run["key"]
                or selection.get("binding") != run["binding"]):
            raise ValueError("Selection belongs to a different experiment")
        verify_binding(selection["binding"])
        validate_fit_set(selection["all_fits"])
        for receipt in selection["all_fits"]: verify_fit_result(out,run,receipt)
        base.write_sealed(out/"phase-receipt.json",{
            "development_key":run["key"],"binding_sha256":base.digest(run["binding"]),
            "resource_result_sha256":runtime.sha256_file(out/"development.result.json"),
            "selection_sha256":runtime.sha256_file(out/"selection.json")})
        base.finish_claim(claim,"completed",{"selection_sha256":runtime.sha256_file(out/"selection.json")})
    except Exception as error:
        base.finish_claim(claim,"failed",{"reason":str(error)})
        raise
    return out/"selection.json"


def verify_fit_result(out,run,result):
    if result.get("development_key") != run["key"] or result.get("binding_sha256") != base.digest(run["binding"]):
        raise ValueError("Fit provenance binding mismatch")
    fit_id = result.get("fit_id")
    if fit_id not in FIT_IDS: raise ValueError("Unknown fit receipt")
    target = Path(out)/fit_id
    if Path(result.get("artifact","")).absolute() != (target/"classifier.keras").absolute():
        raise ValueError("Unverified artifact path in fit receipt")
    for name,key in (("classifier.keras","artifact_sha256"),("validation-predictions.json","validation_predictions_sha256"),
                     ("history.json","history_sha256")):
        path = runtime._validate_output_path(target/name)
        if not path.is_file() or runtime.sha256_file(path) != result.get(key):
            raise ValueError("Missing/changed fit artifact: "+name)


def _phase(out):
    runtime.require_supervised_worker()
    out = runtime._validate_output_path(out)
    base.worker_environment(out)
    run = base.read_sealed(out/"development.json")
    verify_binding(run["binding"])
    supervisor = runtime.ResourceSupervisor(out,phase_limits())
    results = []
    for fit_id in FIT_IDS:
        record = supervisor.run([sys.executable,str(Path(__file__).resolve()),"_fit","--output",str(out),"--fit-id",fit_id],
                                fit_id=fit_id,cwd=ROOT)
        if record["status"] != "success": raise ValueError("Fit failed; no replacement fit: "+fit_id)
        result = base.read_sealed(out/fit_id/"fit.json")
        if result.get("fit_id") != fit_id: raise ValueError("Wrong fit receipt")
        verify_fit_result(out,run,result)
        base.write_sealed(out/fit_id/"worker-receipt.json",{
            "development_key":run["key"],"binding_sha256":base.digest(run["binding"]),"fit_id":fit_id,
            "fit_receipt_sha256":runtime.sha256_file(out/fit_id/"fit.json"),
            "resource_result_sha256":runtime.sha256_file(out/(fit_id+".result.json"))})
        results.append(result)
    validate_fit_set(results)
    verify_binding(run["binding"])
    for result in results: verify_fit_result(out,run,result)
    selected = [choose_variant([row for row in results if row["architecture"] == name]) for name in ARCHITECTURES]
    base.write_sealed(out/"selection.json",{
        "status":"complete","development_key":run["key"],"binding":run["binding"],
        "benchmark_context":run["binding"]["benchmark_context"],"selected":selected,"all_fits":results,
        "class_order":list(CLASS_ORDER),"decision":"argmax-exact-tie-abstains","confidence":"uncalibrated",
        "evaluation_scope":"development_only","operationally_approved":False,"input_scope":"crop_only",
        "test_metrics":"Not run","interpretation":"Internal validation selection; not independent IILAS accuracy"})


def _fit(out,fit_id):
    runtime.require_supervised_worker()
    out = runtime._validate_output_path(out)
    if fit_id not in FIT_IDS: raise ValueError("Unknown fit")
    run = base.read_sealed(out/"development.json")
    verify_binding(run["binding"])
    data = load_frozen(run["binding"]["manifest"]["path"])
    settings = run["binding"]["settings"]
    architecture,contrast = fit_id.rsplit("-",1)
    target = out/fit_id
    target.mkdir(exist_ok=False)
    base.worker_environment(target)
    os.environ["KERAS_HOME"] = str(target/"keras-cache")
    import numpy as np
    import tensorflow as tf
    from parcel_models import build_classifier
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    tf.keras.utils.set_random_seed(42)
    tf.keras.mixed_precision.set_global_policy("float32")
    rows = {split:[row for row in data["rows"] if row["split"] == split] for split in ("train","validation")}
    weights = {split:component_weights(value) for split,value in rows.items()}

    def dataset(split):
        rng = np.random.default_rng(42)
        def stream():
            yield from image_stream(rows[split],contrast,training=split == "train",rng=rng)
        ds = tf.data.Dataset.from_generator(stream,output_signature=(
            tf.TensorSpec((224,224,3),tf.float32),tf.TensorSpec((),tf.int32),tf.TensorSpec((),tf.float32)))
        options = tf.data.Options()
        options.threading.private_threadpool_size = 1
        options.threading.max_intra_op_parallelism = 1
        options.experimental_deterministic = True
        return ds.batch(4).with_options(options).prefetch(1)

    model = build_classifier(architecture,Path(settings["weights"][architecture]["path"]))
    model.compile(optimizer=tf.keras.optimizers.Adam(.001),loss="sparse_categorical_crossentropy")
    history = model.fit(dataset("train"),validation_data=dataset("validation"),epochs=10,
                        callbacks=[tf.keras.callbacks.EarlyStopping(monitor="val_loss",patience=3,
                                                                    restore_best_weights=True)],verbose=2)
    from parcel_inputs import prepare_image
    probabilities = []
    for row in rows["validation"]:
        image = prepare_image(read_image(row,allowed=("validation",)),contrast)
        probabilities.append(model(np.expand_dims(image,0),training=False).numpy()[0].tolist())
    metrics = validation_metrics(rows["validation"],probabilities)
    verify_binding(run["binding"])
    raw = [{"sample_id":row["sample_id"],"capture_id":row["capture_id"],"label":row["label"],
            "item_identifier":row["item_identifier"],"dependency_group_id":row["dependency_group_id"],
            "component_weight":weight,"probabilities":probability,
            "prediction":"Uncertain" if prediction < 0 else CLASS_ORDER[prediction]}
           for row,weight,probability,prediction in zip(rows["validation"],weights["validation"],probabilities,metrics["predictions"])]
    runtime.write_json_exclusive(target/"validation-predictions.json",raw)
    runtime.write_json_exclusive(target/"history.json",history.history)
    artifact = target/"classifier.keras"
    model.save(artifact)
    base.write_sealed(target/"fit.json",{
        "status":"success","fit_id":fit_id,"architecture":architecture,"contrast":contrast,
        "development_key":run["key"],"binding_sha256":base.digest(run["binding"]),
        "component_macro_f1":metrics["component_weighted"]["macro_f1"],
        "component_nll":metrics["component_weighted"]["nll"],"validation_metrics":metrics,
        "partition_counts":{split:partition_summary(value) for split,value in rows.items()},
        "artifact":str(artifact),"artifact_sha256":runtime.sha256_file(artifact),
        "validation_predictions_sha256":runtime.sha256_file(target/"validation-predictions.json"),
        "history_sha256":runtime.sha256_file(target/"history.json"),
        "seed":42,"weights_sha256":settings["weights"][architecture]["sha256"],
        "loss_reduction":"sum_over_batch_size; mean-one component weights within partition",
        "early_stopping":"component-weighted val_loss; patience3; restore_best_weights",
        "benchmark_context":run["binding"]["benchmark_context"],"operationally_approved":False})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command",choices=("develop","_phase","_fit"))
    parser.add_argument("--manifest",type=Path)
    parser.add_argument("--protocol",type=Path)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--fit-id")
    args = parser.parse_args()
    if args.command == "develop":
        if args.manifest is None or args.protocol is None: parser.error("--manifest and --protocol required")
        print(develop(args.manifest,args.protocol,args.output))
    elif args.command == "_phase": _phase(args.output)
    else: _fit(args.output,args.fit_id)


if __name__ == "__main__": main()
