"""Fabricated metadata fixtures exercise integrity, never model quality.

No TensorFlow, real model, dataset download or network is used. Only the registry
root is relocated; production seal/protocol/manifest/selection checks stay real.
"""
import copy
import builtins
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np
import parcel_evaluate as evaluate
import parcel_train as train
from parcel_inputs import decode_rgb, prepare_image

if importlib.util.find_spec("parcel_serving"):
    import parcel_serving as serving
else:
    serving = None


class ServingTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(serving, "read-only parcel serving adapter is missing")
        base = Path(__file__).parent / "datasets" / "parcel-software-tests"
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root_patch = patch.object(train, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.dev = self.root / "development"
        self.test = self.root / "evaluation"
        self.dev.mkdir()
        self.test.mkdir()
        self.manifest = self.root / "frozen.json"
        self.protocol = self.root / "protocol.json"
        self.selection = self.dev / "selection.json"
        self.json(self.root / "sources.json", {
            "source": dict(approved=True, licence="CC BY", provenance="Reviewed collection",
                           licence_evidence="Reviewed source licence"),
        })
        rows = []
        for split in ("train", "validation", "test"):
            for i, label in enumerate(("Normal", "Damaged")):
                name = f"{split}-{i}"
                image = self.root / (name + ".png")
                image.write_bytes(name.encode())  # Metadata validation never decodes these.
                rows.append(dict(sample_id=name, group_id=name, image_path=image.name,
                    image_sha256=train.runtime.sha256_file(image), label=label,
                    label_status="reviewed", review_evidence="Reviewer reference",
                    source_id="source", origin="real", group_status="confirmed",
                    role="primary", target_status="single_principal", split=split))
        self.document = dict(schema_version=1, domain="real", image_root=str(self.root),
            source_registry="sources.json",
            source_registry_sha256=train.runtime.sha256_file(self.root / "sources.json"),
            original_manifest_sha256="a" * 64, rows=rows)
        self.json(self.manifest, self.document)
        self.json(Path(str(self.manifest) + ".audit.json"),
            dict(verify_images=True, manifest_sha256=train.runtime.sha256_file(self.manifest),
                 source_registry_sha256=self.document["source_registry_sha256"]))
        settings = json.loads(train.DEFAULT_PROTOCOL.read_text())
        settings["packages"] = train.environment()["packages"]
        for architecture in train.ARCHITECTURES:
            weight = self.root / (architecture + ".weights.h5")
            weight.write_bytes(architecture.encode())
            settings["weights"][architecture] = dict(path=str(weight),
                sha256=train.runtime.sha256_file(weight), source="Declared ImageNet transfer weights",
                licence_evidence="Reviewed upstream weight terms")
        self.json(self.protocol, settings)
        self.binding = dict(manifest=self.bound(self.manifest), protocol=self.bound(self.protocol),
            settings=train.load_protocol(self.protocol), code=train.code_bindings(),
            environment=train.environment())
        self.key = train.experiment_identity(train.load_frozen(self.manifest), self.binding)
        self.fits = []
        for architecture in train.ARCHITECTURES:
            for contrast in train.CONTRASTS:
                artifact = self.dev / f"{architecture}-{contrast}.keras"
                artifact.write_bytes(f"{architecture}-{contrast}".encode())
                self.fits.append(dict(status="success", architecture=architecture,
                    contrast=contrast, fit_id=f"{architecture}-{contrast}", macro_f1=.5,
                    validation_loss=.2 if contrast == "clahe" else .3,
                    artifact=str(artifact), artifact_sha256=train.runtime.sha256_file(artifact),
                    weights_sha256=settings["weights"][architecture]["sha256"]))
        selected = [self.fits[1], self.fits[3]]
        self.selected = dict(status="complete", development_key=self.key,
            binding=self.binding, all_fits=self.fits, selected=selected,
            class_order=["Normal", "Damaged"], decision="argmax-exact-tie-abstains",
            confidence="uncalibrated", test_metrics="Not run")
        self.seal(self.selection, self.selected)
        registry = self.root / "research/datasets/parcel-run-registry"
        self.develop_claim = train.claim_phase(self.key, "develop",
            dict(output=str(self.dev), fit_ids=list(train.FIT_IDS)), registry)
        train.finish_claim(self.develop_claim, "completed",
            dict(selection_sha256=train.runtime.sha256_file(self.selection)))
        self.test_claim = train.claim_phase(self.key, "test",
            dict(output=str(self.test), selection_sha256=train.runtime.sha256_file(self.selection)), registry)
        self.seal(self.test / "test-run.json",
            dict(selection=str(self.selection), manifest=str(self.manifest), baseline_export=None))
        test_rows = [r for r in train.load_frozen(self.manifest)["rows"] if r["split"] == "test"]
        models = {}
        for fit in selected:
            raw = [dict(sample_id=r["sample_id"], image_sha256=r["image_sha256"],
                        probabilities=[.8, .2] if r["label"] == "Normal" else [.1, .9])
                   for r in test_rows]
            self.seal(self.test / (fit["architecture"] + "-raw.json"),
                dict(status="complete", artifact_sha256=fit["artifact_sha256"], predictions=raw))
            models[fit["architecture"]] = dict(
                image_weighted=evaluate.metrics(test_rows, ["Normal", "Damaged"]),
                equal_parcel_weighted=evaluate.metrics(test_rows, ["Normal", "Damaged"], True))
        self.report = dict(status="complete", class_order=["Normal", "Damaged"],
            confidence="uncalibrated", models=models, groups_per_class={"Normal": 1, "Damaged": 1})
        self.seal(self.test / "report.json", self.report)
        train.finish_claim(self.test_claim, "completed",
            dict(report_sha256=train.runtime.sha256_file(self.test / "report.json")))

    def json(self, path, value):
        path.write_text(json.dumps(value), encoding="utf-8")

    def seal(self, path, value):
        if path.exists():
            path.unlink()
        train.write_sealed(path, value)

    def bound(self, path):
        return dict(path=str(path), sha256=train.runtime.sha256_file(path))

    def test_completed_bound_artifacts_are_not_operational_approval(self):
        result = serving.audit(self.selection, self.test)
        self.assertEqual(result["status"], "artifact_ready")
        self.assertFalse(result["operationally_approved"])
        self.assertEqual(result["model"]["contrast"], "clahe")
        self.assertEqual(result["model"]["modelVersion"], self.fits[1]["artifact_sha256"])

    def test_missing_evaluation_is_unavailable_without_loading_model(self):
        (self.test / "report.json").unlink()
        self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")
        with self.assertRaises(ValueError):
            serving.predict_image(b"invalid", self.selection, self.test,
                loader=lambda _: self.fail("loader ran before integrity validation"))

    def test_changed_current_heldout_image_is_unavailable(self):
        (self.root / "test-0.png").write_bytes(b"changed original bytes")
        result = serving.audit(self.selection, self.test)
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("test image", result["reason"])

    def test_default_inference_requires_supervisor_before_decode(self):
        with patch.dict(os.environ, {"IILAS_RUNNER_JOB": ""}), \
             patch.object(serving, "decode_rgb",
                          side_effect=lambda _: self.fail("decode preceded supervisor guard")), \
             self.assertRaises(train.runtime.RuntimeSafetyError):
            serving.predict_image(b"not decoded", self.selection, self.test)

    def test_changed_model_and_changed_evaluation_seals_rejected(self):
        model = Path(self.fits[1]["artifact"])
        model.write_bytes(b"modified")
        self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")
        model.write_bytes(b"mobilenetv2-clahe")
        wrapped = json.loads((self.test / "report.json").read_text())
        wrapped["payload"]["status"] = "failed"
        self.json(self.test / "report.json", wrapped)
        self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")

    def test_copied_or_foreign_test_run_is_not_original_completed_evaluation(self):
        run = train.read_sealed(self.test / "test-run.json")
        run["selection"] = str(self.root / "foreign.json")
        self.seal(self.test / "test-run.json", run)
        self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")

    def test_failed_claim_or_other_output_cannot_be_served(self):
        self.json(self.test_claim / "failed.json", {"reason": "interrupted"})
        self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")
        (self.test_claim / "failed.json").unlink()
        started = json.loads((self.test_claim / "started.json").read_text())
        started["output"] = str(self.root / "other")
        self.json(self.test_claim / "started.json", started)
        self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")

    def test_sealed_raw_predictions_must_match_images_and_report(self):
        path = self.test / "mobilenetv2-raw.json"
        raw = train.read_sealed(path)
        raw["predictions"][0]["image_sha256"] = "0" * 64
        self.seal(path, raw)
        self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")

    def test_resealed_report_metrics_cannot_override_raw_results(self):
        report = copy.deepcopy(self.report)
        report["models"]["mobilenetv2"]["image_weighted"]["accuracy"]["value"] = .25
        self.seal(self.test / "report.json", report)
        self.json(self.test_claim / "completed.json",
            dict(report_sha256=train.runtime.sha256_file(self.test / "report.json")))
        result = serving.audit(self.selection, self.test)
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("metrics differ", result["reason"])

    def test_malformed_raw_payload_returns_unavailable(self):
        path = self.test / "mobilenetv2-raw.json"
        for predictions in (None, [None, None], [{"sample_id": "test-0"}, {"sample_id": "test-1"}]):
            with self.subTest(predictions=predictions):
                self.seal(path, dict(status="complete",
                    artifact_sha256=self.fits[1]["artifact_sha256"], predictions=predictions))
                self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")

    def test_class_order_and_tie_policy_cannot_be_redeclared(self):
        for field, value in (("class_order", ["Damaged", "Normal"]), ("decision", "argmax")):
            candidate = dict(self.selected, **{field: value})
            self.seal(self.selection, candidate)
            self.assertEqual(serving.audit(self.selection, self.test)["status"], "unavailable")

    def test_real_domain_and_pretrained_declarations_are_required(self):
        synthetic = copy.deepcopy(self.document)
        synthetic["domain"] = "synthetic"
        for row in synthetic["rows"]:
            row["origin"] = "synthetic"
        self.json(self.manifest, synthetic)
        self.json(Path(str(self.manifest) + ".audit.json"),
            dict(verify_images=True, manifest_sha256=train.runtime.sha256_file(self.manifest),
                 source_registry_sha256=synthetic["source_registry_sha256"]))
        result = serving.audit(self.selection, self.test)
        self.assertEqual(result["status"], "unavailable")
        self.assertIn("real-parcel", result["reason"])
        # Exercise provenance checks independently of unrelated hash-seal failure.
        for value in (None, "", "random weights", "generated SOFTWARE FIXTURE", "pending", "unknown"):
            with self.subTest(value=value):
                record = dict(self.binding["settings"]["weights"]["mobilenetv2"], source=value)
                with self.assertRaises(ValueError):
                    serving.validate_weight_provenance({"weights": {"mobilenetv2": record,
                        "efficientnetb0": self.binding["settings"]["weights"]["efficientnetb0"]}})

    def test_inference_uses_selected_letterbox_clahe_and_preserves_evidence_hash(self):
        rgb = np.zeros((80, 160, 3), dtype=np.uint8)
        rgb[:, :80] = [240, 80, 10]
        data = cv2.imencode(".png", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))[1].tobytes()
        expected = prepare_image(decode_rgb(data), "clahe")
        class Model:
            input_shape = (None, 224, 224, 3)
            output_shape = (None, 2)
            def __call__(self, batch, training):
                np.testing.assert_array_equal(batch[0], expected)
                if training:
                    raise AssertionError("inference enabled training augmentation")
                return np.array([[.15, .85]])
        result = serving.predict_image(data, self.selection, self.test, loader=lambda _: Model())
        self.assertEqual(result["label"], "Damaged")
        self.assertEqual(result["evidenceSha256"], hashlib.sha256(data).hexdigest())
        self.assertTrue(result["humanReviewRequired"])
        self.assertFalse(result["operationally_approved"])

        self.assertEqual(result["classOrder"], ["Normal", "Damaged"])
        self.assertIn("acceptanceSha256", result)
        self.assertIsNone(result["acceptanceSha256"])

    def test_ties_abstain_and_bad_probabilities_fail(self):
        data = cv2.imencode(".png", np.zeros((64, 64, 3), dtype=np.uint8))[1].tobytes()
        class Model:
            input_shape = (None, 224, 224, 3)
            output_shape = (None, 2)
            scores = [.5, .5]
            def __call__(self, batch, training):
                return np.array([self.scores])
        result = serving.predict_image(data, self.selection, self.test, loader=lambda _: Model())
        self.assertIsNone(result["label"])
        self.assertEqual(result["status"], "abstained")
        for scores in ([float("nan"), .5], [.8, .8], [-.1, 1.1]):
            Model.scores = scores
            with self.subTest(scores=scores), self.assertRaises(ValueError):
                serving.predict_image(data, self.selection, self.test, loader=lambda _: Model())

    def test_invalid_shape_and_changed_artifact_during_load_fail(self):
        data = cv2.imencode(".png", np.zeros((64, 64, 3), dtype=np.uint8))[1].tobytes()
        class Model:
            input_shape = (None, 224, 224, 3)
            output_shape = (None, 3)
        with self.assertRaises(ValueError):
            serving.predict_image(data, self.selection, self.test, loader=lambda _: Model())
        def changing_loader(path):
            Path(path).write_bytes(b"changed while loading")
            return Model()
        with self.assertRaises(ValueError):
            serving.predict_image(data, self.selection, self.test, loader=changing_loader)


class LoaderSafetyTests(unittest.TestCase):
    def test_default_loader_requires_supervisor_before_tensorflow_import(self):
        real_import = builtins.__import__
        def guarded_import(name, *args, **kwargs):
            if name == "tensorflow":
                self.fail("TensorFlow import occurred before the supervisor guard")
            return real_import(name, *args, **kwargs)
        with patch.dict(os.environ, {"IILAS_RUNNER_JOB": ""}), \
             patch.object(builtins, "__import__", side_effect=guarded_import), \
             self.assertRaises(train.runtime.RuntimeSafetyError):
            serving._load_model("never-loaded.keras")


if __name__ == "__main__":
    unittest.main()
