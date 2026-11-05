"""Run the bounded Olist V2 development comparison. Confirmation is unavailable."""
import argparse
import csv
from datetime import timedelta
import json
from pathlib import Path
import subprocess
import sys

import olist_v2_prepare as prep
from runner_runtime import (
    FitLedger, Limits, ResourceSupervisor, create_run_directory, require_supervised_worker,
    sha256_file, write_json_exclusive,
)

DEVELOPMENT_DIRECTORY = "olist-v2-development-20261106"
PREPARATION_SEAL = "e0da7b495b87bf65ccf2651d46dab245bee51d08348a6b45dceca7bec3d2fd8e"
TOTAL_BUDGET = 5400
ASSUMPTIONS = (
    "Released item records represent the basket known at purchase despite absent revision history.",
    "Released item price and freight amounts are assumed to be purchase-time inputs.",
    "Released customer and seller states are purchase-time profile proxies, not proven route endpoints.",
    "The initial promise did not change and delivery was contemporaneously recorded.",
)
FLAGS = {
    "v1_validation_scores_observed_before_v2_protocol": True, "v2_validation_reused": True,
    "confirmation_source_aggregates_previously_observed": True, "confirmation_scored": False,
    "primary_iilas_task_evaluated": False, "operational_acceptance": False,
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verified_preparation(path, claim_path):
    seal_path = path / "frozen.json"
    sealed = read_json(seal_path)
    receipt = read_json(path / "prepare.result.json")
    charged = sealed.get("charged_preparation_seconds")
    if (receipt.get("status") != "success" or receipt.get("returncode") != 0
            or charged != receipt.get("elapsed_seconds") or not isinstance(charged, (int, float))
            or not 0 < charged < TOTAL_BUDGET):
        raise ValueError("Invalid sealed preparation time")
    if (sha256_file(seal_path) != PREPARATION_SEAL or sealed["phase"] != "prepare"
            or sealed["status"] != "success" or sealed["fit_count"] != 0
            or sealed["training_authorized"] is not False or sealed["cumulative_budget_seconds"] != TOTAL_BUDGET):
        raise ValueError("Preparation seal does not match the verified no-fit attempt")
    for name, expected in sealed["artifacts"].items():
        if sha256_file(path / name) != expected:
            raise ValueError("Sealed preparation artifact changed")
    claim = read_json(claim_path)
    if sha256_file(claim_path) != sealed["canonical_claim_sha256"] or Path(claim["output"]) != path:
        raise ValueError("Sealed preparation claim changed")
    report = read_json(path / "preparation.json")
    if (report["runner_sha256"] != sha256_file(Path(prep.__file__))
            or claim["runner_sha256"] != report["runner_sha256"]
            or report["protocol_sha256"] != sha256_file(prep.PROTOCOL)
            or report["preparation_supervisor_sha256"] != sha256_file(Path(__file__).with_name("runner_runtime.py"))
            or report["baseline_seal_sha256"] != prep.BASELINE_SEAL
            or report["baseline_selection_sha256"] != prep.BASELINE_SELECTION
            or report["features"] != prep.FEATURES or report["baseline_cohort_matches"] is not True
            or report["no_fit"] is not True or report["no_model_scoring"] is not True
            or report["training_authorized"] is not False or report["confirmation_scored"] is not False):
        raise ValueError("Preparation code, protocol or cohort pins changed")
    return charged, report


def development_data(source, baseline, report):
    import numpy as np
    import pandas as pd

    import olist_train as v1
    from olist_v2_model import V1_THRESHOLDS, feature_frame, valid_probabilities

    original = prep.verify_v1_baseline(baseline)
    hashes = v1.source_hashes(source)
    archive = source / "olist-v2.zip"
    if hashes != report["source_hashes"] or hashes != original["source"]["source_hashes"]:
        raise ValueError("Pinned Olist source differs")
    orders, previous_customer_ids = {}, set()
    validation_start, _, validation_cutoff = v1.WINDOWS["validation"]
    for raw in prep.csv_rows(source, "olist_orders_dataset.csv"):
        purchase = v1.parse(raw["order_purchase_timestamp"])
        if purchase is None:
            continue
        if purchase < validation_start:
            # Earlier excluded purchases can establish customer history; their outcomes are unused.
            previous_customer_ids.add(raw["customer_id"])
        if v1.window_for(purchase) not in prep.PARTITIONS:
            continue
        order_id = raw["order_id"]
        if not order_id or order_id in orders:
            raise ValueError("Duplicate or missing development order ID")
        orders[order_id] = raw
    rows, counts = prep.development_cohort(orders.values())
    needed = previous_customer_ids | {row["customer_id"] for row in rows}
    customers = [row for row in prep.zip_rows(archive, "olist_customers_dataset.csv") if row["customer_id"] in needed]
    groups = v1.unique_map(customers, "customer_id", "customer_unique_id")
    if set(groups) != needed or not all(groups.values()):
        raise ValueError("Development customer-history join failed")
    features, diagnostics = prep.enrich_rows(
        rows, customers, prep.csv_rows(source, "olist_order_items_dataset.csv"),
        prep.zip_rows(archive, "olist_sellers_dataset.csv"),
    )
    if (v1.digest(rows) != report["ordered_rows_sha256"] or v1.digest(features) != report["ordered_features_sha256"]
            or counts != report["counts"] or diagnostics != report["diagnostics"]):
        raise ValueError("Reconstructed cohort, labels or features differ from sealed preparation")

    metadata, earlier_groups = [], {groups[customer_id] for customer_id in previous_customer_ids}
    for row in rows:
        source_order = orders[row["order_id"]]
        purchase = v1.parse(source_order["order_purchase_timestamp"])
        promise = v1.parse(source_order["order_estimated_delivery_date"])
        group = groups[row["customer_id"]]
        metadata.append({
            "order_id": row["order_id"], "customer": group, "split": row["split"],
            "month": purchase.strftime("%Y-%m"),
            "week": (purchase - timedelta(days=purchase.weekday())).strftime("%Y-%m-%d"),
            "calendar": row["calendar"], "promised_calendar_lead_days": row["promised_calendar_lead_days"],
            "unseen_customer": group not in earlier_groups, "mature60": v1.mature(promise, validation_cutoff, 60),
        })
    metadata = pd.DataFrame(metadata)
    train_mask = metadata["split"] == "train"
    validation_mask = metadata["split"] == "validation"
    validation = metadata.loc[validation_mask].reset_index(drop=True)
    retained = original["source"]["entity_overlap"]["validation"]
    if (int(validation["unseen_customer"].sum()) != retained["unseen_at_window_origin_orders"]
            or validation.loc[validation["unseen_customer"], "customer"].nunique() != retained["unseen_at_window_origin_customers"]
            or int(validation.loc[validation["unseen_customer"], "calendar"].sum()) != retained["unseen_at_window_origin_calendar_late"]):
        raise ValueError("Original validation customer-novelty slice differs")
    if list(csv_rows_for_file(baseline / "prediction-index.csv")) != validation[
            ["order_id", "customer", "month", "week"]].to_dict("records"):
        raise ValueError("Ordered validation metadata differ from V1")
    baseline_selection = read_json(baseline / "selection.json")
    if {family: choice["threshold"] for family, choice in baseline_selection["choices"].items()} != V1_THRESHOLDS:
        raise ValueError("V1 thresholds changed")
    with np.load(baseline / "predictions.npz", allow_pickle=False) as arrays:
        baseline_scores = {
            f"V1_{family}": valid_probabilities(arrays[f"primary__{family}"], len(validation))
            for family in v1.FAMILIES
        }
    data = pd.DataFrame(features, columns=prep.FEATURES)
    x_train = feature_frame(data.loc[train_mask].reset_index(drop=True), training=True)
    x_validation = feature_frame(data.loc[validation_mask].reset_index(drop=True))
    y_train = metadata.loc[train_mask, "calendar"].to_numpy(dtype=int)
    if set(y_train.tolist()) != {0, 1} or set(validation["calendar"].tolist()) != {0, 1}:
        raise ValueError("Both classes required in both development partitions")
    return x_train, y_train, x_validation, validation, baseline_scores


def csv_rows_for_file(path):
    with path.open(encoding="utf-8", newline="") as stream:
        yield from csv.DictReader(stream)


def fit_worker(job, candidate):
    import warnings

    import joblib
    import numpy as np
    from sklearn.exceptions import ConvergenceWarning
    from threadpoolctl import threadpool_limits

    import olist_train as v1
    from olist_v2_model import feature_frame, pipeline, preprocessing_metadata, registry

    spec = next(spec for spec in registry() if spec["id"] == candidate)
    receipt = read_json(job / "input.json")
    if receipt != {"candidate": candidate, "sha256": sha256_file(job / "input.joblib")}:
        raise ValueError("Fit input does not match the bound candidate")
    write_json_exclusive(job / "fit.claim.json", receipt)
    data = joblib.load(job / "input.joblib")
    if set(data) != {"x_train", "y_train", "x_validation"}:
        raise ValueError("A fit worker may not receive validation labels or identifiers")
    train = feature_frame(data["x_train"], training=True)
    validation = feature_frame(data["x_validation"])
    labels = np.asarray(data["y_train"])
    if labels.shape != (len(train),) or set(labels.tolist()) != {0, 1}:
        raise ValueError("Invalid fit labels")
    model = pipeline(spec)
    with threadpool_limits(limits=1), warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        model.fit(train, labels)
        probabilities = v1.positive_probability(model, validation)
    if model.classes_.tolist() != [0, 1]:
        raise ValueError("Unexpected fitted class order")
    with (job / "probabilities.npy").open("xb") as stream:
        np.save(stream, probabilities, allow_pickle=False)
    joblib.dump(model, job / "model.joblib")
    write_json_exclusive(job / "fit.json", {
        "spec": spec, "classes": model.classes_.tolist(),
        "estimator_parameters": model.named_steps["estimator"].get_params(),
        "preprocessing": preprocessing_metadata(model, validation),
    })


def limits(seconds):
    return Limits(max_wall_seconds=seconds, max_fit_seconds=600, max_rss_bytes=2 * 1024**3,
                  min_available_bytes=3 * 1024**3, min_free_disk_bytes=1024**3,
                  max_output_bytes=2 * 1024**3, threads=1)


def develop(output, canonical, charged, prepared):
    import joblib
    import numpy as np

    import olist_train as v1
    from olist_v2_model import V1_THRESHOLDS, choose_models, registry, valid_probabilities, validation_report

    source = canonical / "olist-audit-2026-10-17"
    baseline = canonical / "olist-development-20261020"
    run_manifest = {
        "protocol_id": prepared["protocol_id"], "flags": FLAGS,
        "versions": v1.versions(), "preparation_seal_sha256": PREPARATION_SEAL,
        "source_hashes": prepared["source_hashes"], "ordered_rows_sha256": prepared["ordered_rows_sha256"],
        "ordered_features_sha256": prepared["ordered_features_sha256"], "features": prep.FEATURES,
        "v1_seal_sha256": prep.BASELINE_SEAL, "v1_selection_sha256": prep.BASELINE_SELECTION,
        "code_sha256": code_hashes(), "seed": v1.SEED,
        "fit_registry": [{**spec, "installed_parameters": v1.estimator(spec).get_params()} for spec in registry()],
        "thresholds": v1.thresholds(), "fit_count_limit": 13,
    }
    write_json_exclusive(output / "manifest.json", run_manifest)
    x_train, y_train, x_validation, validation, probabilities = development_data(source, baseline, prepared)
    specs = registry()
    ledger = FitLedger([spec["id"] for spec in specs])
    supervisor = ResourceSupervisor(output, limits(TOTAL_BUDGET - charged))
    candidate_scores = {}
    for spec in specs:
        candidate = spec["id"]
        job = output / candidate
        job.mkdir()
        joblib.dump({"x_train": x_train, "y_train": y_train, "x_validation": x_validation}, job / "input.joblib")
        write_json_exclusive(job / "input.json", {"candidate": candidate, "sha256": sha256_file(job / "input.joblib")})
        result = supervisor.run(worker_command("_fit", candidate), fit_id=candidate)
        ledger.record(candidate, result)
        if result["status"] != "success" or result["returncode"] != 0:
            raise RuntimeError(f"Candidate {candidate} incomplete. Preserve this attempt.")
        fit = read_json(job / "fit.json")
        if fit["spec"] != spec or fit["classes"] != [0, 1] or not (job / "model.joblib").is_file():
            raise ValueError("Worker result does not match frozen candidate")
        candidate_scores[candidate] = valid_probabilities(
            np.load(job / "probabilities.npy", allow_pickle=False), len(validation),
        )
    write_json_exclusive(output / "fit-ledger.json", ledger.seal())
    labels = validation["calendar"].to_numpy(dtype=int)
    choices, scores = choose_models(specs, candidate_scores, labels)
    write_json_exclusive(output / "selection.json", {
        "choices": choices, "all_candidate_scores": scores, "v1_thresholds": V1_THRESHOLDS, "flags": FLAGS,
        "manifest_sha256": sha256_file(output / "manifest.json"),
    })
    probabilities.update({f"V2_{name}": candidate_scores[choice["candidate_id"]] for name, choice in choices.items()})
    thresholds = {f"V1_{name}": threshold for name, threshold in V1_THRESHOLDS.items()}
    thresholds.update({f"V2_{name}": choice["threshold"] for name, choice in choices.items()})
    validation[["order_id", "customer", "month", "week"]].to_csv(output / "prediction-index.csv", index=False, mode="x")
    with (output / "predictions.npz").open("xb") as stream:
        np.savez_compressed(stream, **probabilities)
    report = validation_report(validation, probabilities, thresholds)
    if v1.source_hashes(source) != prepared["source_hashes"] or prep.verify_v1_baseline(baseline)["source"]["source_hashes"] != prepared["source_hashes"]:
        raise ValueError("Original source or V1 evidence changed during development")
    write_json_exclusive(output / "validation-report.json", {**report, "flags": FLAGS})
    write_json_exclusive(output / "completion.json", {
        "status": "success", "phase": "development", "fit_count": len(specs), "flags": FLAGS,
        "selection_sha256": sha256_file(output / "selection.json"),
        "manifest_sha256": sha256_file(output / "manifest.json"),
    })


def code_hashes():
    here = Path(__file__).resolve().parent
    return {name: sha256_file(here / name) for name in (
        "olist_v2_develop.py", "olist_v2_model.py", "olist_v2_prepare.py", "olist_train.py", "runner_runtime.py",
        prep.PROTOCOL.name,
    )}


def worker_command(phase, candidate=None):
    command = [sys.executable, str(Path(__file__).resolve()), phase, "--accept-conditional-research-assumptions"]
    if candidate:
        command += ["--candidate", candidate]
    return command


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("develop", "_phase", "_fit"))
    parser.add_argument("--accept-conditional-research-assumptions", action="store_true",
                        help="record operator acceptance of the four unverified historical assumptions for development only")
    parser.add_argument("--candidate", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if not args.accept_conditional_research_assumptions:
        parser.error("Review the protocol's four conditional assumptions before starting the single development attempt")
    if (args.phase == "_fit") != bool(args.candidate):
        parser.error("Candidate is only valid for a supervised fit worker")
    if args.phase != "develop":
        require_supervised_worker()

    here = Path(__file__).resolve().parent
    common_dir = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                                cwd=here, capture_output=True, text=True, check=True).stdout.strip()
    canonical = Path(common_dir).resolve().parent / "research" / "datasets"
    output = here / "datasets" / DEVELOPMENT_DIRECTORY
    claim = canonical / (DEVELOPMENT_DIRECTORY + ".claim.json")
    prep_path = here / "datasets" / prep.RUN_DIRECTORY
    prep_claim = canonical / (prep.RUN_DIRECTORY + ".claim.json")
    binding = {"output": str(output), "preparation_seal_sha256": PREPARATION_SEAL, "code_sha256": code_hashes()}
    if args.phase != "develop" and read_json(claim) != binding:
        raise ValueError("Development claim does not bind this output and code")
    if args.phase == "_fit":
        from olist_v2_model import registry

        if args.candidate not in {spec["id"] for spec in registry()}:
            parser.error("Unknown candidate")
        fit_worker(output / args.candidate, args.candidate)
        return
    charged, prepared = verified_preparation(prep_path, prep_claim)
    if args.phase == "_phase":
        develop(output, canonical, charged, prepared)
        return

    if claim.exists():
        raise RuntimeError("The fixed development claim already exists. Preserve the attempt.")
    output = create_run_directory(output)
    write_json_exclusive(claim, binding)
    caps = limits(TOTAL_BUDGET - charged)
    write_json_exclusive(output / "invocation.json", {
        "phase": "development", "operator_decision": "conditional research development only",
        "unverified_retrospective_assumptions": ASSUMPTIONS, "factual_assumptions_verified": False,
        "confirmation_authorized": False, "flags": FLAGS,
        "preparation_seconds": charged, "preparation_seal_sha256": PREPARATION_SEAL, "limits": vars(caps),
    })
    result = ResourceSupervisor(output, caps).run(worker_command("_phase"), fit_id="develop", enforce_fit_timeout=False)
    if (result["status"] != "success" or result["returncode"] != 0
            or read_json(output / "develop.result.json") != result
            or not 0 < result["elapsed_seconds"] <= caps.max_wall_seconds):
        raise RuntimeError("Development did not complete under supervision. Preserve the attempt.")
    completion = read_json(output / "completion.json")
    if (completion["status"] != "success" or completion["fit_count"] != 13 or completion["flags"] != FLAGS
            or not (output / "validation-report.json").is_file() or read_json(claim) != binding
            or code_hashes() != binding["code_sha256"]):
        raise RuntimeError("Development completion evidence is inconsistent")
    verified_preparation(prep_path, prep_claim)
    write_json_exclusive(output / "frozen.json", {
        **completion, "canonical_claim_sha256": sha256_file(claim), "confirmation_authorized": False,
        "preparation_seconds": charged, "development_seconds": result["elapsed_seconds"],
        "charged_cumulative_seconds": charged + result["elapsed_seconds"],
        "artifacts": {path.relative_to(output).as_posix(): sha256_file(path)
                      for path in sorted(output.rglob("*")) if path.is_file()},
    })
    print(json.dumps({"status": "success", "phase": "development", "fit_count": 13, "output": str(output)}))


if __name__ == "__main__":
    main()
