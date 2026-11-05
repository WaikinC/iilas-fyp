"""Safety and feature-contract checks for Olist V2 no-fit preparation."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd

import olist_v2_prepare as prep


def order(order_id, purchase="2018-01-01 10:00:00", estimate="2018-01-04 00:00:00",
          delivered="2018-01-05 12:00:00", customer="customer-1"):
    return dict(order_id=order_id, customer_id=customer, order_status="delivered",
                order_purchase_timestamp=purchase, order_estimated_delivery_date=estimate,
                order_delivered_customer_date=delivered)


def item(item_id, seller, price, freight, order_id="validation"):
    return dict(order_id=order_id, order_item_id=item_id, seller_id=seller,
                price=price, freight_value=freight)


class ProtectedFields(dict):
    """A sentinel whose attributes must never be interpreted in development."""
    def __getitem__(self, key):
        if key not in self:
            raise AssertionError(f"An out-of-scope field was accessed: {key}")
        return super().__getitem__(key)

    def get(self, key, *default):
        return self[key]


class CohortTests(unittest.TestCase):
    def test_only_development_purchase_windows_access_outcomes(self):
        rows, counts = prep.development_cohort([
            ProtectedFields(order_purchase_timestamp="2018-05-01 00:00:00"),
            ProtectedFields(order_purchase_timestamp="2018-03-01 00:00:00"),
            order("validation"),
            order("train", "2017-10-01 10:00:00", "2017-10-04 00:00:00", "2017-10-04 23:59:59"),
            order("too-late", delivered="2018-05-01 00:00:00"),
        ])
        self.assertEqual([(row["split"], row["order_id"], row["calendar"], row["weight"]) for row in rows],
                         [("train", "train", 0, 1), ("validation", "validation", 1, 1)])
        self.assertEqual(counts["validation"]["outcome_at_or_after_cutoff"], 1)

    def test_duplicate_development_order_id_fails(self):
        with self.assertRaises(ValueError):
            prep.development_cohort([order("validation"), order("validation")])

    def test_v1_validation_ids_and_ordered_features_and_train_labels_must_match(self):
        rows, _ = prep.development_cohort([
            order("train", "2017-10-01 10:00:00", "2017-10-04 00:00:00", "2017-10-04 23:59:59"),
            order("validation"),
        ])
        baseline = dict(
            x_train=pd.DataFrame([{"purchase_month": 10, "purchase_weekday": 6, "purchase_hour": 10,
                                   "promised_calendar_lead_days": 3}]),
            y_train=[0],
            x_evaluation=pd.DataFrame([{"purchase_month": 1, "purchase_weekday": 0, "purchase_hour": 10,
                                        "promised_calendar_lead_days": 3}]),
        )
        prep.verify_baseline(rows, ["validation"], baseline)
        for wrong_ids, wrong_baseline in [
            (["another-id"], baseline),
            (["validation"], {**baseline, "y_train": [1]}),
            (["validation"], {**baseline, "x_evaluation": baseline["x_evaluation"] * 2}),
        ]:
            with self.subTest(wrong_ids=wrong_ids, wrong_baseline=wrong_baseline), self.assertRaises(ValueError):
                prep.verify_baseline(rows, wrong_ids, wrong_baseline)
        with self.assertRaises(ValueError):
            prep.verify_baseline([{**rows[0], "weight": 2}, rows[1]], ["validation"], baseline)


class LegacyBaselineTests(unittest.TestCase):
    def test_preparation_binds_scientific_source_but_allows_current_supervisor(self):
        import olist_train as v1

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            path.joinpath("frozen.json").write_text("seal", encoding="utf-8")
            path.joinpath("selection.json").write_text("selection", encoding="utf-8")
            current = v1.code_hashes()
            current["runner_runtime.py"] = "legacy-supervisor"
            manifest = dict(code_hashes=current, versions=v1.versions(), features=prep.BASE_FEATURES)
            path.joinpath("manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with patch.multiple(prep, BASELINE_SEAL=v1.sha(path / "frozen.json"),
                                BASELINE_SELECTION=v1.sha(path / "selection.json")):
                with patch.object(v1, "verify_inventory", return_value={"phase": "development", "fit_count": 21}):
                    self.assertEqual(prep.verify_v1_baseline(path), manifest)
                    path.joinpath("confirmation.claim").touch()
                    with self.assertRaisesRegex(ValueError, "confirmation claim"):
                        prep.verify_v1_baseline(path)


class EnrichmentTests(unittest.TestCase):
    def setUp(self):
        self.rows, _ = prep.development_cohort([order("validation")])
        self.customers = [dict(customer_id="customer-1", customer_state="SP")]
        self.sellers = [dict(seller_id="a", seller_state="SP"), dict(seller_id="b", seller_state="RJ"),
                        dict(seller_id="c", seller_state="sp")]

    def test_exact_aggregation_item_record_count_and_order(self):
        features, diagnostics = prep.enrich_rows(
            self.rows, self.customers, [item("1", "a", "10.10", "1.00"), item("3", "a", "2.20", "0")],
            self.sellers,
        )
        self.assertEqual(list(features[0]), prep.FEATURES)
        self.assertEqual(list(features[0].values())[-6:], [2, 12.3, 1.0, "SP", "SP", "SAME"])
        self.assertEqual(dict(diagnostics), {})

    def test_multiple_and_unknown_seller_precedence_and_amounts_are_independent(self):
        for basket, expected in [
            ([item("1", "a", "10.10", "1"), item("2", "b", "-1", "0")],
             [2, None, 1.0, "SP", "MULTIPLE", "DIFFERENT"]),
            ([item("1", "a", "10", "1"), item("2", "b", "0", "0"), item("3", "c", "0", "NaN")],
             [3, 10.0, None, "SP", "UNKNOWN", "UNKNOWN"]),
            ([], [None, None, None, "SP", "UNKNOWN", "UNKNOWN"]),
        ]:
            with self.subTest(basket=basket):
                features, diagnostics = prep.enrich_rows(self.rows, self.customers, basket, self.sellers)
                self.assertEqual(list(features[0].values())[-6:], expected)
                self.assertTrue(diagnostics)

    def test_excluded_item_and_lookup_rows_are_not_enriched(self):
        features, _ = prep.enrich_rows(
            self.rows,
            [*self.customers, ProtectedFields(customer_id="excluded")],
            [item("1", "a", "0", "0"), ProtectedFields(order_id="reserved")],
            [*self.sellers, ProtectedFields(seller_id="excluded")],
        )
        self.assertEqual(list(features[0].values())[-6:], [1, 0.0, 0.0, "SP", "SP", "SAME"])

    def test_duplicate_item_or_lookup_fails(self):
        one = item("1", "a", "0", "0")
        for customers, items, sellers in [
            (self.customers, [one, one], self.sellers),
            (self.customers * 2, [one], self.sellers),
            (self.customers, [one], self.sellers * 2),
        ]:
            with self.subTest(items=items), self.assertRaises(ValueError):
                prep.enrich_rows(self.rows, customers, items, sellers)


if __name__ == "__main__":
    unittest.main()
