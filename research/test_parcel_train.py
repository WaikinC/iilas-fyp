"""Workflow tests use no real data or TensorFlow import."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import parcel_train as train


class DevelopmentSafetyTests(unittest.TestCase):
    def setUp(self):
        base = Path(__file__).parent / "datasets" / "parcel-software-tests"
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_claim_survives_failure_and_new_destination(self):
        claim = train.claim_phase("a" * 64, "develop", {"output": "first"}, self.root)
        train.finish_claim(claim, "failed", {"reason": "worker_exit"})
        with self.assertRaisesRegex(ValueError, "already claimed"):
            train.claim_phase("a" * 64, "develop", {"output": "second"}, self.root)
        self.assertTrue((claim / "failed.json").exists())

    def test_experiment_identity_ignores_copied_input_locations(self):
        doc = {"domain": "synthetic", "source_registry_sha256": "r" * 64,
               "rows": [{"sample_id": "s1", "image_path": "a.png", "_image_path": "C:/a.png",
                         "_group_id": "g1", "group_id": "g1", "label": "Normal",
                         "image_sha256": "1" * 64, "split": "train"}]}
        binding = {"manifest": {"path": "first", "sha256": "a"},
                   "protocol": {"path": "first", "sha256": "a"},
                   "settings": {"weights": {"mobilenetv2": {"path": "first", "sha256": "b"}}},
                   "code": {"runner": "c"}, "environment": {"packages": {"x": "1"}}}
        before = train.experiment_identity(doc, binding)
        binding["manifest"]["path"] = "copy"
        binding["protocol"]["path"] = "copy"
        binding["settings"]["weights"]["mobilenetv2"]["path"] = "copy"
        doc["rows"][0]["image_path"] = "copy.png"
        doc["rows"][0]["_image_path"] = "C:/copy.png"
        self.assertEqual(train.experiment_identity(doc, binding), before)
        doc["rows"][0]["label"] = "Damaged"
        self.assertNotEqual(train.experiment_identity(doc, binding), before)

    def test_test_image_never_read_by_development(self):
        row = {"split": "test", "_image_path": str(self.root / "private-test.png"),
               "image_sha256": "0" * 64}
        with patch.object(Path, "read_bytes", side_effect=AssertionError("pixel access")):
            with self.assertRaisesRegex(ValueError, "partition"):
                train.read_image(row, allowed=("train", "validation"))

    def test_hash_changed_image_refused_before_decode(self):
        p = self.root / "image"; p.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "hash"):
            train.read_image({"split": "train", "_image_path": str(p),
                              "image_sha256": "0" * 64}, allowed=("train",))

    def test_selection_follows_f1_loss_then_none(self):
        rows = [{"architecture": "mobilenetv2", "contrast": c,
                 "macro_f1": f, "validation_loss": loss}
                for c, f, loss in [("none", .6, .3), ("clahe", .6, .2)]]
        self.assertEqual(train.choose_variant(rows)["contrast"], "clahe")
        rows[0]["validation_loss"] = .2
        self.assertEqual(train.choose_variant(rows)["contrast"], "none")
        rows[1]["macro_f1"] = .7
        self.assertEqual(train.choose_variant(rows)["contrast"], "clahe")

    def test_protocol_template_cannot_run_without_local_weights(self):
        with self.assertRaisesRegex(ValueError, "weight"):
            train.load_protocol(train.DEFAULT_PROTOCOL)

    def test_seal_detects_mutation(self):
        p = self.root / "selection.json"
        train.write_sealed(p, {"status": "complete", "value": 1})
        self.assertEqual(train.read_sealed(p)["value"], 1)
        data = json.loads(p.read_text()); data["payload"]["value"] = 2
        p.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, "seal"):
            train.read_sealed(p)

    def test_invalid_output_and_repeat_output(self):
        with self.assertRaises(train.runtime.RuntimeSafetyError):
            train.runtime.create_run_directory(Path(__file__).parent / "models" / "active")
        with self.assertRaises(train.runtime.RuntimeSafetyError):
            train.runtime.create_run_directory(self.root)

    def test_failure_blocks_selection(self):
        with self.assertRaisesRegex(ValueError, "four"):
            train.validate_fit_set([{"fit_id": "mobilenetv2-none", "status": "failed"}])

    def test_low_ram_preflight_preserves_failure_without_claim_or_worker(self):
        manifest = self.root / "manifest.json"; manifest.write_text("{}")
        protocol = self.root / "protocol.json"; protocol.write_text("{}")
        out = self.root / "low-memory"
        with patch.object(train, "load_frozen", return_value={"rows": []}), \
             patch.object(train, "load_protocol", return_value={}), \
             patch.object(train, "code_bindings", return_value={}), \
             patch.object(train.runtime.ResourceSupervisor, "preflight",
                          side_effect=train.runtime.RuntimeSafetyError("available_memory")), \
             patch.object(train, "claim_phase") as claim:
            with self.assertRaisesRegex(train.runtime.RuntimeSafetyError, "available_memory"):
                train.prepare_development(manifest, protocol, out)
            claim.assert_not_called()
        self.assertEqual(json.loads((out / "preflight-failed.json").read_text())["reason"],
                         "available_memory")

    def test_sealed_selection_requires_all_fits_success(self):
        rows = [{"fit_id": fit_id, "status": "success"} for fit_id in train.FIT_IDS]
        train.validate_fit_set(rows)
        rows[3]["fit_id"] = rows[0]["fit_id"]
        with self.assertRaises(ValueError):
            train.validate_fit_set(rows)

    def test_cpu_configuration_before_tensorflow(self):
        with patch.dict("sys.modules", {"tensorflow": object()}):
            with self.assertRaisesRegex(ValueError, "precede"):
                train.configure_cpu()

    def test_missing_receipt_rejected_without_image_open(self):
        manifest = self.root / "manifest.json"; manifest.write_text("{}")
        with self.assertRaises(FileNotFoundError):
            train.load_frozen(manifest)

    def test_template_resource_amendment_rejected(self):
        protocol = json.loads(train.DEFAULT_PROTOCOL.read_text())
        protocol["limits"]["develop"]["available_floor_bytes"] = 0
        path = self.root / "amended.json"; path.write_text(json.dumps(protocol))
        with self.assertRaisesRegex(ValueError, "limits"):
            train.load_protocol(path)


if __name__ == "__main__":
    unittest.main()
