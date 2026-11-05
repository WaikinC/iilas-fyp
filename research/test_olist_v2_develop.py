"""Focused synthetic checks for the conditional Olist development protocol."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

import olist_v2_develop as development
import olist_v2_model as modeling
import olist_v2_prepare as prep
from test_olist_v2_prepare import ProtectedFields, item, order


def features(price=10.0, seller="SP"):
    return dict(purchase_month=1, purchase_weekday=0, purchase_hour=10, promised_calendar_lead_days=3,
                item_record_count=2, total_item_price=price, total_item_freight=2.5,
                customer_state="SP", seller_state=seller, all_sellers_same_state_as_customer="SAME")


class ProtocolTests(unittest.TestCase):
    def test_fixed_registry_and_no_dummy_threshold_search(self):
        specs = modeling.registry()
        self.assertEqual([spec["id"] for spec in specs],
                         [f"v2-{i:02d}-{name}" for i, name in enumerate(["RF"] * 4 + ["DT"] * 4 + ["LR"] * 4 + ["Dummy"])])
        self.assertEqual([spec["params"]["min_samples_leaf"] for spec in specs[:4]], [5, 5, 20, 20])
        self.assertEqual([spec["params"]["C"] for spec in specs[8:12]], [0.1, 0.1, 1.0, 1.0])
        scores = modeling.choose_models(specs, {spec["id"]: np.array([0.1, 0.9]) for spec in specs}, [0, 1])[1]
        self.assertEqual(len(scores), 12 * 202 + 1)
        self.assertEqual(scores[-1]["threshold"], 0.5)

    def test_unknown_validation_does_not_learn_new_state_or_replace_train_median(self):
        model = modeling.pipeline(modeling.registry()[4])
        train = pd.DataFrame([features(10.0), features(30.0)])
        validation = pd.DataFrame([features(None, "RJ"), features(99999, "RJ")])
        model.fit(modeling.feature_frame(train, training=True), [0, 1])
        probabilities = model.predict_proba(modeling.feature_frame(validation))
        metadata = modeling.preprocessing_metadata(model, validation)
        self.assertEqual(metadata["training_medians"]["total_item_price"], 20.0)
        self.assertEqual(metadata["categories"]["seller_state"], ["SP"])
        self.assertEqual(metadata["validation_unseen_counts"]["seller_state"], 2)
        self.assertTrue(np.isfinite(probabilities).all())
        self.assertFalse(any("order_id" in name for name in metadata["encoded_feature_order"]))

    def test_feature_allowlist_and_all_missing_training_inputs(self):
        for bad in ([features(None)], [{**features(), "calendar": 1}], [features(seller="invalid")]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                modeling.feature_frame(pd.DataFrame(bad), training=True)

    def test_paired_comparison_shares_cluster_draws(self):
        labels = np.array([0, 1, 0, 1, 0, 1])
        scores = np.array([0.2, 0.8, 0.3, 0.6, 0.3, 0.8])
        groups = np.array(["a", "a", "b", "b", "c", "c"])
        result = modeling.paired_bootstrap(labels, {"V1_RF": scores, "V2_RF": scores},
                                           {"V1_RF": 0.5, "V2_RF": 0.5}, groups)
        delta = result["paired_differences"]["V2_RF-minus-V1_RF"]["macro_f1"]
        self.assertEqual(delta["interval"], [0.0, 0.0])
        self.assertEqual(delta["valid_replicates"], 500)

    def test_clusters_without_both_classes_suppress_uncertainty(self):
        result = modeling.paired_bootstrap(np.array([0, 0]), {"V1_RF": np.array([0.0, 0.0])},
                                           {"V1_RF": 0.5}, np.array(["a", "b"]))
        self.assertIsNone(result["models"]["V1_RF"]["macro_f1"]["interval"])
        self.assertIsNone(result["models"]["V1_RF"]["alert_rate"]["interval"])
        self.assertEqual(result["models"]["V1_RF"]["no_alert_replicates"], 500)

    def test_baseline_score_validation_rejects_invalid_vectors(self):
        for scores in ([0.2], [0.1, float("nan")], [-0.1, 0.7]):
            with self.subTest(scores=scores), self.assertRaises(ValueError):
                modeling.valid_probabilities(scores, 2)

    def test_report_keeps_empty_slices_and_both_operating_points(self):
        frame = pd.DataFrame({"calendar": [0, 1], "promised_calendar_lead_days": [3, 3],
                              "month": ["2018-01", "2018-01"], "week": ["2018-01-01", "2018-01-01"],
                              "customer": ["a", "a"], "unseen_customer": [True, False],
                              "mature60": [True, True]})
        probabilities = {f"V{v}_{f}": [0.1, 0.9] for v in (1, 2) for f in modeling.v1.FAMILIES}
        report = modeling.validation_report(frame, probabilities, dict.fromkeys(probabilities, 0.2))
        self.assertEqual(report["primary_contrast"], "V2_RF-minus-V1_RF")
        self.assertEqual(report["slices"]["purchase_month_2018-02"]["V2_RF"]["selected"]["denominator"], 0)
        self.assertEqual(report["overall"]["V2_RF"]["at_05"]["threshold"], 0.5)
        self.assertEqual(report["precision_recall_curves"]["V2_RF"]["thresholds"], [0.1, 0.9])

    def test_prepared_rows_and_earlier_excluded_customer_history_reconstruct(self):
        from olist_train import digest

        orders = [
            order("train-0", "2017-10-01 10:00:00", "2017-10-04 00:00:00", "2017-10-04 23:59:59"),
            order("train-1", "2017-10-01 10:00:00", "2017-10-04 00:00:00", "2017-10-05 23:59:59"),
            order("validation-0", delivered="2018-01-04 23:59:59", customer="customer-2"),
            order("validation-1", customer="customer-3"),
            ProtectedFields(order_purchase_timestamp="2016-01-01 00:00:00", customer_id="before-window"),
            ProtectedFields(order_purchase_timestamp="2018-05-01 00:00:00"),
        ]
        customers = [{"customer_id": key, "customer_unique_id": group, "customer_state": "SP"}
                     for key, group in (("customer-1", "a"), ("customer-2", "b"), ("customer-3", "c"),
                                        ("before-window", "b"))]
        rows, counts = prep.development_cohort(orders)
        items = [item("1", "seller-1", "3.50", "0", order_id=row["order_id"]) for row in rows]
        sellers = [{"seller_id": "seller-1", "seller_state": "SP"}]
        expanded, diagnostics = prep.enrich_rows(rows, customers, items, sellers)
        report = dict(source_hashes={}, counts=counts, diagnostics=diagnostics, ordered_rows_sha256=digest(rows),
                      ordered_features_sha256=digest(expanded))
        original = {"source": {"source_hashes": {}, "entity_overlap": {"validation": {
            "unseen_at_window_origin_orders": 1, "unseen_at_window_origin_customers": 1,
            "unseen_at_window_origin_calendar_late": 1,
        }}}}
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory)
            (baseline / "selection.json").write_text(json.dumps({"choices": {
                name: {"threshold": threshold} for name, threshold in modeling.V1_THRESHOLDS.items()
            }}), encoding="utf-8")
            (baseline / "prediction-index.csv").write_text(
                "order_id,customer,month,week\nvalidation-0,b,2018-01,2018-01-01\n"
                "validation-1,c,2018-01,2018-01-01\n", encoding="utf-8")
            np.savez(baseline / "predictions.npz", **{f"primary__{f}": [0.1, 0.9] for f in modeling.v1.FAMILIES})
            with (patch.object(prep, "verify_v1_baseline", return_value=original),
                  patch.object(modeling.v1, "source_hashes", return_value={}),
                  patch.object(prep, "csv_rows", side_effect=lambda _, name: orders if "orders" in name else items),
                  patch.object(prep, "zip_rows", side_effect=lambda _, name: customers if "customers" in name else sellers)):
                train, labels, validation, metadata, _ = development.development_data(baseline, baseline, report)
        self.assertEqual(train.columns.tolist(), prep.FEATURES)
        self.assertEqual(validation.columns.tolist(), prep.FEATURES)
        self.assertEqual(labels.tolist(), [0, 1])
        self.assertEqual(metadata["unseen_customer"].tolist(), [False, True])

    def test_development_refuses_to_forget_preparation_elapsed_time(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            for name, obj in [("frozen.json", {"charged_preparation_seconds": 8.0}),
                              ("prepare.result.json", {"elapsed_seconds": 9.0, "status": "success",
                                                       "returncode": 0})]:
                (path / name).write_text(json.dumps(obj), encoding="utf-8")
            with self.assertRaises(ValueError):
                development.verified_preparation(path, path / "claim.json")


if __name__ == "__main__":
    unittest.main()
