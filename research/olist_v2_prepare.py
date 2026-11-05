"""Prepare Olist V2 development inputs without fitting or reading confirmation outcomes."""
import argparse
from collections import Counter, defaultdict
import csv
from decimal import Decimal, InvalidOperation
from fractions import Fraction
import io
import json
from pathlib import Path
import subprocess
import sys
import zipfile

from runner_runtime import Limits, ResourceSupervisor, create_run_directory, require_supervised_worker

PROTOCOL = Path(__file__).with_name("OLIST_CONDITIONAL_EXPERIMENT_2026-10-20.md")
PARTITIONS = ("train", "validation")
BASE_FEATURES = ["purchase_month", "purchase_weekday", "purchase_hour", "promised_calendar_lead_days"]
FEATURES = BASE_FEATURES + [
    "item_record_count", "total_item_price", "total_item_freight",
    "customer_state", "seller_state", "all_sellers_same_state_as_customer",
]
STATES = frozenset("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SE SP TO".split())
BASELINE_SEAL = "92e7a8b4ff122bb318074f4a89a563795dff87bfb522ad1516749e6b78603e7f"
BASELINE_SELECTION = "504ead4cd77db5bfe57bb45dc8b11694fa47ef7590009a37b0fd804b6509cbae"
SOURCE_ARCHIVE = "967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784"
RUN_DIRECTORY = "olist-v2-preparation-20261106"


def development_orders(orders):
    from olist_train import parse, window_for

    for raw in orders:
        split = window_for(parse(raw["order_purchase_timestamp"]))
        if split in PARTITIONS:
            yield split, raw


def development_cohort(orders):
    from olist_train import assess, exclusion

    rows = []
    seen = set()
    counts = {split: Counter() for split in PARTITIONS}
    for split, raw in development_orders(orders):
        order_id = raw["order_id"]
        if not order_id or order_id in seen:
            raise ValueError("Duplicate or missing development order ID")
        seen.add(order_id)
        outcome = assess(raw)
        reason = exclusion(outcome, split)
        counts[split][reason or "retained"] += 1
        if reason:
            continue
        purchase, estimate = outcome["p"], outcome["e"]
        rows.append(dict(split=split, order_id=order_id, customer_id=raw["customer_id"],
                         calendar=outcome["calendar"], weight=1, purchase_month=purchase.month,
                         purchase_weekday=purchase.weekday(), purchase_hour=purchase.hour,
                         promised_calendar_lead_days=(estimate.date() - purchase.date()).days))
    return sorted(rows, key=lambda row: (PARTITIONS.index(row["split"]), row["order_id"])), counts


def state_for(raw, role, diagnostics):
    state = (raw or "").strip()
    if state in STATES:
        return state
    diagnostics[f"{role}_state_{'invalid' if state else 'blank'}"] += 1
    return "UNKNOWN"


def amount_total(items, field, diagnostics):
    values = []
    for item in items:
        value = (item[field] or "").strip()
        if not value:
            diagnostics[f"{field}_blank"] += 1
            return None
        try:
            amount = Decimal(value)
        except InvalidOperation:
            diagnostics[f"{field}_invalid"] += 1
            return None
        if not amount.is_finite() or amount < 0:
            diagnostics[f"{field}_invalid"] += 1
            return None
        values.append(Fraction(amount))
    try:
        return float(sum(values))
    except OverflowError:
        diagnostics[f"{field}_float_overflow"] += 1
        return None


def enrich_rows(rows, customers, items, sellers):
    from olist_train import unique_map

    order_ids = {row["order_id"] for row in rows}
    customer_ids = {row["customer_id"] for row in rows}
    customer_states = unique_map(
        (row for row in customers if row["customer_id"] in customer_ids), "customer_id", "customer_state",
    )
    if set(customer_states) != customer_ids:
        raise ValueError("Development customer join failure")
    item_keys = set()
    baskets = defaultdict(list)
    seller_ids = set()
    for item in items:
        order_id = item["order_id"]
        if order_id not in order_ids:
            continue
        key = (order_id, item["order_item_id"])
        if not all(key) or key in item_keys:
            raise ValueError("Duplicate or missing development item key")
        item_keys.add(key)
        baskets[order_id].append(item)
        seller_ids.add(item["seller_id"])
    seller_states = unique_map(
        (row for row in sellers if row["seller_id"] in seller_ids), "seller_id", "seller_state",
    )
    features = []
    diagnostics = Counter()
    for row in rows:
        basket = baskets[row["order_id"]]
        customer_state = state_for(customer_states[row["customer_id"]], "customer", diagnostics)
        if not basket:
            diagnostics["order_without_items"] += 1
        states = {state_for(seller_states.get(seller_id), "seller", diagnostics)
                  for seller_id in {item["seller_id"] for item in basket}}
        seller_state = "UNKNOWN"
        relation = "UNKNOWN"
        if states and "UNKNOWN" not in states:
            seller_state = next(iter(states)) if len(states) == 1 else "MULTIPLE"
            if customer_state != "UNKNOWN":
                relation = "SAME" if states == {customer_state} else "DIFFERENT"
        features.append({
            **{column: row[column] for column in BASE_FEATURES},
            "item_record_count": len(basket) if basket else None,
            "total_item_price": amount_total(basket, "price", diagnostics) if basket else None,
            "total_item_freight": amount_total(basket, "freight_value", diagnostics) if basket else None,
            "customer_state": customer_state,
            "seller_state": seller_state,
            "all_sellers_same_state_as_customer": relation,
        })
    return features, diagnostics


def verify_baseline(rows, validation_ids, baseline):
    from olist_train import feature_frame
    import numpy as np
    import pandas as pd

    train = [row for row in rows if row["split"] == "train"]
    validation = [row for row in rows if row["split"] == "validation"]
    if validation_ids != [row["order_id"] for row in validation] or any(row["weight"] != 1 for row in rows):
        raise ValueError("Ordered V1 validation IDs or unit weights differ")
    for partition, key in ((train, "x_train"), (validation, "x_evaluation")):
        actual = feature_frame(pd.DataFrame(partition, columns=BASE_FEATURES)).to_numpy()
        expected = feature_frame(baseline[key]).to_numpy()
        if not np.array_equal(actual, expected):
            raise ValueError("Ordered V1 base predictors differ")
    if not np.array_equal([row["calendar"] for row in train], baseline["y_train"]):
        raise ValueError("Ordered V1 training labels differ")


def csv_rows(source, name):
    with (source / "source" / name).open(encoding="utf-8", newline="") as stream:
        yield from csv.DictReader(stream)


def zip_rows(archive, name):
    with zipfile.ZipFile(archive) as data, data.open(name) as raw:
        with io.TextIOWrapper(raw, encoding="utf-8", newline="") as stream:
            yield from csv.DictReader(stream)


def verify_v1_baseline(baseline_path):
    import olist_train as v1

    if (v1.sha(baseline_path / "frozen.json") != BASELINE_SEAL
            or v1.sha(baseline_path / "selection.json") != BASELINE_SELECTION):
        raise ValueError("V1 frozen development pins differ")
    if (baseline_path / "confirmation.claim").exists():
        raise ValueError("Reserved confirmation claim already exists")
    sealed = v1.verify_inventory(baseline_path)
    manifest = json.loads((baseline_path / "manifest.json").read_text(encoding="utf-8"))
    if sealed["phase"] != "development" or sealed["fit_count"] != 21:
        raise ValueError("V1 development seal does not identify the completed experiment")
    # V1 is a read-only reference. Its archived supervisor hash remains in its sealed manifest.
    # V2 uses the current native supervisor and records that hash separately.
    current_hashes = v1.code_hashes()
    science = ("olist_train.py", v1.PROTOCOL.name)
    if (manifest["features"] != BASE_FEATURES or manifest["versions"] != v1.versions()
            or any(manifest["code_hashes"][name] != current_hashes[name] for name in science)):
        raise ValueError("V1 scientific reference or research environment changed")
    return manifest


def prepare(source, baseline_path):
    import joblib
    import olist_train as v1

    manifest = verify_v1_baseline(baseline_path)
    source_hashes = v1.source_hashes(source)
    archive = source / "olist-v2.zip"
    if source_hashes.get(archive.name) != SOURCE_ARCHIVE or manifest["source"]["source_hashes"] != source_hashes:
        raise ValueError("Olist source pins differ")

    orders_file = "olist_orders_dataset.csv"
    customers_file = "olist_customers_dataset.csv"
    items_file = "olist_order_items_dataset.csv"
    sellers_file = "olist_sellers_dataset.csv"
    orders = [row for _, row in development_orders(csv_rows(source, orders_file))]
    rows, counts = development_cohort(orders)
    order_ids = {row["order_id"] for row in orders}
    customer_ids = {row["customer_id"] for row in orders}
    customers = [row for row in zip_rows(archive, customers_file) if row["customer_id"] in customer_ids]
    items = [row for row in csv_rows(source, items_file) if row["order_id"] in order_ids]
    reference, summary = v1.prepare_rows(orders, customers, items)
    columns = ["split", "order_id", "calendar"]
    reference_rows = list(reference[columns].itertuples(index=False, name=None))
    if reference_rows != [tuple(row[column] for column in columns) for row in rows]:
        raise ValueError("Ordered V1 development IDs or calendar labels differ")
    for split in PARTITIONS:
        original = manifest["source"]["partitions"][split]
        for key in ("purchase_window_orders", "noncore_excluded", "outcome_at_or_after_cutoff_excluded",
                    "immature_after_known_excluded", "retained", "calendar_late", "joined_item_rows"):
            if original[key] != summary["partitions"][split][key]:
                raise ValueError("V1 development cohort counts differ")
        for reason in ("noncore", "outcome_at_or_after_cutoff", "immature_after_known", "retained"):
            key = reason if reason == "retained" else reason + "_excluded"
            if counts[split][reason] != original[key]:
                raise ValueError("V2 development exclusion counts differ")

    with (baseline_path / "prediction-index.csv").open(encoding="utf-8", newline="") as stream:
        validation_ids = [row["order_id"] for row in csv.DictReader(stream)]
    # The exact pinned development seal validates this local fit-input file before loading it.
    verify_baseline(rows, validation_ids, joblib.load(baseline_path / "primary-00-RF" / "input.joblib"))
    features, diagnostics = enrich_rows(rows, customers, items, zip_rows(archive, sellers_file))
    train = [feature for row, feature in zip(rows, features, strict=True) if row["split"] == "train"]
    if not all(any(feature[column] is not None for feature in train) for column in FEATURES[4:7]):
        raise ValueError("Expanded training numeric column entirely missing")
    if v1.source_hashes(source) != source_hashes or verify_v1_baseline(baseline_path) != manifest:
        raise ValueError("Source or baseline changed during preparation")

    return {
        "protocol_id": "olist-conditional-basket-geography-1.0", "no_fit": True, "no_model_scoring": True,
        "v1_validation_scores_observed_before_v2_protocol": True, "v2_validation_reused": True,
        "confirmation_source_aggregates_previously_observed": True, "confirmation_scored": False,
        "primary_iilas_task_evaluated": False, "operational_acceptance": False, "ready_for_training": False,
        "retrospective_assumptions": "conditional_unverified", "training_authorized": False,
        "source_hashes": source_hashes, "baseline_seal_sha256": BASELINE_SEAL,
        "baseline_selection_sha256": BASELINE_SELECTION, "protocol_sha256": v1.sha(PROTOCOL),
        "runner_sha256": v1.sha(Path(__file__)), "v1_code_sha256": manifest["code_hashes"],
        "preparation_supervisor_sha256": v1.code_hashes()["runner_runtime.py"],
        "versions": v1.versions(), "features": FEATURES, "counts": counts,
        "diagnostics": diagnostics, "ordered_rows_sha256": v1.digest(rows),
        "ordered_features_sha256": v1.digest(features), "baseline_cohort_matches": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["prepare", "_worker"])
    parser.add_argument("--acknowledge-retrospective-assumptions", action="store_true")
    args = parser.parse_args()
    if not args.acknowledge_retrospective_assumptions:
        parser.error("Review the assumptions in the Olist V2 protocol before using --acknowledge-retrospective-assumptions")

    common_git_dir = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=Path(__file__).resolve().parent, capture_output=True, text=True, check=True,
    ).stdout.strip()
    canonical_datasets = Path(common_git_dir).resolve().parent / "research" / "datasets"
    output = Path(__file__).resolve().parent / "datasets" / RUN_DIRECTORY
    claim = canonical_datasets / (RUN_DIRECTORY + ".claim.json")
    from runner_runtime import sha256_file, write_json_exclusive

    binding = {"output": str(output), "runner_sha256": sha256_file(__file__)}
    if args.phase == "_worker":
        require_supervised_worker()
        if json.loads(claim.read_text(encoding="utf-8")) != binding:
            raise ValueError("Preparation claim does not bind this worker and output")
        result = prepare(canonical_datasets / "olist-audit-2026-10-17",
                         canonical_datasets / "olist-development-20261020")
        write_json_exclusive(output / "preparation.json", result)
        return

    output = create_run_directory(output)
    write_json_exclusive(claim, binding)
    limits = Limits(max_wall_seconds=5400, max_fit_seconds=600, max_rss_bytes=2 * 1024**3,
                    min_available_bytes=3 * 1024**3, min_free_disk_bytes=1024**3,
                    max_output_bytes=2 * 1024**3, threads=1)
    write_json_exclusive(output / "invocation.json", {
        "phase": "prepare", "retrospective_assumptions": "conditional_unverified",
        "preparation_acknowledged": True, "training_authorized": False, "fit_budget_consumed": 0,
        "limits": vars(limits),
    })
    command = [sys.executable, str(Path(__file__).resolve()), "_worker", "--acknowledge-retrospective-assumptions"]
    result = ResourceSupervisor(output, limits).run(command, fit_id="prepare", enforce_fit_timeout=False)
    if (result["status"] != "success" or result.get("returncode") != 0
            or not (output / "preparation.json").is_file()):
        raise RuntimeError("Olist V2 preparation did not complete; preserve this attempt")
    if (json.loads((output / "prepare.result.json").read_text(encoding="utf-8")) != result
            or not 0 < result["elapsed_seconds"] <= limits.max_wall_seconds):
        raise RuntimeError("Native preparation receipt is inconsistent")
    artifacts = ("invocation.json", "preparation.json", "prepare.result.json",
                 "prepare.stdout.log", "prepare.stderr.log")
    write_json_exclusive(output / "frozen.json", {
        "status": "success", "phase": "prepare", "fit_count": 0, "training_authorized": False,
        "charged_preparation_seconds": result["elapsed_seconds"],
        "cumulative_budget_seconds": limits.max_wall_seconds,
        "canonical_claim_sha256": sha256_file(claim),
        "artifacts": {name: sha256_file(output / name) for name in artifacts},
    })
    print(json.dumps({"status": "success", "phase": "prepare", "fit_count": 0, "output": str(output)}))


if __name__ == "__main__":
    main()

