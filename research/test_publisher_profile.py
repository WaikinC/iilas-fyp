"""Synthetic byte/image fixtures only; no scientific or publisher-data evidence."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import parcel_manifest as pm
import parcel_train as train
import parcel_evaluate as evaluate
import parcel_serving as serving
import test_parcel_manifest as fixtures


class PublisherProfileTests(unittest.TestCase):
    sha = staticmethod(fixtures.ManifestTests.sha)
    save = fixtures.ManifestTests.save
    tearDown = fixtures.ManifestTests.tearDown

    def setUp(self):
        fixtures.ManifestTests.setUp(self)
        registry = json.loads(self.registry.read_text())
        registry["kaputt"] = registry.pop("fixture")
        self.registry.write_text(json.dumps(registry))
        annotation = self.root / "query-train.parquet"
        annotation.write_bytes(b"Synthetic annotation bytes, not a real Parquet dataset")
        self.policy = {
            "mapping": {"defect=false": "Normal", "defect=true": "Damaged"},
            "human_relabelling_required_for_this_benchmark": False,
            "source_hashes": {annotation.name: self.sha(annotation)},
        }
        self.snapshot = {"schema_version": 1,
                         "annotation_files": dict(self.policy["source_hashes"]),
                         "captures": []}
        self.doc.update(schema_version=2, domain="real",
                        benchmark_profile="publisher_packaging_development",
                        evaluation_scope="development_only",
                        publisher_annotations="annotations.json",
                        publisher_policy="policy.json",
                        source_registry_sha256=self.sha(self.registry))
        for n, row in enumerate(self.doc["rows"]):
            original = self.root / f"original-{n}.png"
            original.write_bytes((self.root / row["image_path"]).read_bytes())
            record = dict(capture_id=f"capture-{n}", source_id="kaputt",
                          source_item_identifier=f"item-{n}", publisher_defect=bool(n % 2),
                          item_material="cardboard", publisher_split="train",
                          crop_image=row["image_path"], crop_sha256=row["image_sha256"],
                          original_image=original.name, original_sha256=self.sha(original))
            self.snapshot["captures"].append(record)
            row.pop("review_evidence")
            row.update({k: record[k] for k in ("capture_id", "source_id", "source_item_identifier",
                        "publisher_defect", "item_material", "publisher_split")})
            row.update(origin="real", label_status="publisher", group_status="publisher_item",
                       group_id=f"kaputt:item:item-{n}", role="query_crop", target_status="packaging")
        self.save_provenance()

    def save_provenance(self):
        for key, content in (("publisher_annotations", self.snapshot),
                             ("publisher_policy", self.policy)):
            path = self.root / self.doc[key]
            path.write_text(json.dumps(content), encoding="utf-8")
            self.doc[key + "_sha256"] = self.sha(path)

    def test_publisher_labels_admitted_without_human_or_physical_identity_claims(self):
        audit = pm.audit_manifest(self.save())
        self.assertEqual(audit["images"], 20)
        self.assertEqual(audit["benchmark_context"]["evaluation_scope"], "development_only")
        self.assertEqual(audit["benchmark_context"]["grouping_basis"], "publisher_item_identifier")
        self.assertEqual(audit["benchmark_context"]["publisher_policy_sha256"],
                         self.doc["publisher_policy_sha256"])
        self.assertNotIn("review_evidence", pm.load_manifest(self.path)["rows"][0])

    def test_profile_must_be_explicit_real_development_only(self):
        for key, value in (("benchmark_profile", "parcel"), ("evaluation_scope", "final"),
                           ("domain", "synthetic"), ("schema_version", 1)):
            with self.subTest(key=key):
                old = self.doc[key]
                self.doc[key] = value
                with self.assertRaises(ValueError):
                    pm.load_manifest(self.save(), verify_images=False)
                self.doc[key] = old

    def test_row_must_match_snapshot_and_publisher_mapping(self):
        changes = (("label", "Damaged"), ("publisher_defect", True),
                   ("source_item_identifier", "wrong"), ("group_id", "physical-box"),
                   ("capture_id", "missing"), ("role", "reference"),
                   ("target_status", "single_principal"), ("label_status", "reviewed"),
                   ("group_status", "confirmed"), ("publisher_split", "test"),
                   ("item_material", "plastic"), ("image_path", "original-0.png"),
                   ("image_sha256", "0" * 64))
        for key, value in changes:
            with self.subTest(key=key):
                original = self.doc["rows"][0][key]
                self.doc["rows"][0][key] = value
                with self.assertRaises(ValueError):
                    pm.load_manifest(self.save(), verify_images=False)
                self.doc["rows"][0][key] = original

    def test_snapshot_and_policy_hashes_and_annotation_bytes_are_bound(self):
        self.save()
        for name in ("annotations.json", "policy.json", "query-train.parquet"):
            with self.subTest(name=name):
                path = self.root / name
                original = path.read_bytes()
                path.write_bytes(original + b" ")
                with self.assertRaises(ValueError):
                    pm.load_manifest(self.path, verify_images=False)
                path.write_bytes(original)

    def test_snapshot_provenance_and_capture_types_cannot_be_forged(self):
        original = copy.deepcopy(self.snapshot)
        for change in ("annotation_hash", "missing_annotation", "non_boolean", "duplicate_capture",
                       "original_escape", "crop_escape", "source", "material"):
            with self.subTest(change=change):
                self.snapshot = copy.deepcopy(original)
                if change == "annotation_hash":
                    self.snapshot["annotation_files"]["query-train.parquet"] = "0" * 64
                elif change == "missing_annotation":
                    self.snapshot["annotation_files"] = {}
                elif change == "duplicate_capture":
                    self.snapshot["captures"].append(dict(self.snapshot["captures"][0]))
                else:
                    key, value = {
                        "non_boolean": ("publisher_defect", 0),
                        "original_escape": ("original_image", "../escape.png"),
                        "crop_escape": ("crop_image", "../escape.png"),
                        "source": ("source_id", "other"),
                        "material": ("item_material", "plastic"),
                    }[change]
                    self.snapshot["captures"][0][key] = value
                self.save_provenance()
                with self.assertRaises(ValueError):
                    pm.load_manifest(self.save(), verify_images=False)

    def test_original_hash_verified_but_metadata_only_never_reads_pixels(self):
        self.save()
        original = Path.read_bytes
        original_open = Path.open
        with patch.object(Path, "read_bytes", lambda p: (
                self.fail("metadata-only loader read pixels") if p.suffix == ".png"
                else original(p))), patch.object(Path, "open", lambda p, *a, **kw: (
                self.fail("metadata-only loader opened pixels") if p.suffix == ".png"
                else original_open(p, *a, **kw))):
            self.assertEqual(len(pm.load_manifest(self.path, verify_images=False)["rows"]), 20)
        (self.root / "original-0.png").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "original"):
            pm.load_manifest(self.path)

    def test_policy_provenance_cannot_read_heldout_image_as_metadata(self):
        for name in ("0.png", "renamed-image.json"):
            with self.subTest(name=name):
                image = self.root / name
                if name != "0.png":
                    image.write_bytes((self.root / "0.png").read_bytes())
                    self.doc["rows"][0]["image_path"] = name
                    self.snapshot["captures"][0]["crop_image"] = name
                    del self.policy["source_hashes"]["0.png"]
                self.policy["source_hashes"][name] = self.sha(image)
                self.save_provenance()
                self.save()
                original_open = Path.open
                with patch.object(Path, "open", lambda p, *a, **kw: (
                        self.fail("policy provenance opened pixels") if p == image
                        else original_open(p, *a, **kw))):
                    with self.assertRaises(ValueError):
                        pm.load_manifest(self.path, verify_images=False)

    def test_connected_source_items_and_dependencies_cannot_cross_partitions(self):
        self.doc["rows"][0].update(split="train", dependency_ids=["source-session"])
        self.doc["rows"][1].update(split="test", dependency_ids=["source-session"])
        with self.assertRaisesRegex(ValueError, "connected group"):
            pm.load_manifest(self.save(), verify_images=False)

    def test_freeze_preserves_provenance_and_receipt_context(self):
        frozen = pm.freeze_split(self.save(), self.root / "frozen.json")
        doc = train.load_frozen(frozen)
        self.assertEqual(doc["publisher_policy_sha256"], self.doc["publisher_policy_sha256"])
        receipt = json.loads(Path(str(frozen) + ".audit.json").read_text())
        self.assertEqual(receipt["benchmark_context"]["benchmark_profile"],
                         "publisher_packaging_development")
        receipt["benchmark_context"]["evaluation_scope"] = "final"
        Path(str(frozen) + ".audit.json").write_text(json.dumps(receipt))
        with self.assertRaisesRegex(ValueError, "context"):
            train.load_frozen(frozen)

    def test_experiment_identity_binds_benchmark_scope_and_provenance(self):
        binding = dict(settings={}, code={}, environment={})
        original = train.experiment_identity(self.doc, binding)
        for key in ("publisher_policy_sha256", "publisher_annotations_sha256", "evaluation_scope",
                    "benchmark_profile"):
            changed = copy.deepcopy(self.doc)
            changed[key] = "changed"
            self.assertNotEqual(train.experiment_identity(changed, binding), original, key)

    def prepare_software_run(self):
        """Generate bounded metadata artifacts; replace only costly worker execution."""
        frozen = pm.freeze_split(self.save(), self.root / "frozen.json")
        settings = json.loads(train.DEFAULT_PROTOCOL.read_text())
        settings["packages"] = train.environment()["packages"]
        for name in train.ARCHITECTURES:
            weights = self.root / (name + ".h5")
            weights.write_bytes(b"synthetic software weight placeholder")
            settings["weights"][name] = dict(path=str(weights), sha256=self.sha(weights),
                source="Synthetic software fixture", licence_evidence="CC0 fixture")
        protocol = self.root / "protocol.json"
        protocol.write_text(json.dumps(settings))
        self.addCleanup(patch.stopall)
        patch.object(train, "ROOT", self.root).start()
        with patch.object(train.runtime.ResourceSupervisor, "preflight"):
            out, claim, _ = train.prepare_development(frozen, protocol, self.root / "development")
        for architecture in train.ARCHITECTURES:
            for contrast in train.CONTRASTS:
                fit_id = f"{architecture}-{contrast}"
                target = out / fit_id
                target.mkdir()
                artifact = target / "classifier.keras"
                artifact.write_bytes(b"synthetic software classifier placeholder")
                train.write_sealed(target / "fit.json", dict(status="success", fit_id=fit_id,
                    architecture=architecture, contrast=contrast, macro_f1=.5,
                    validation_loss=.5, artifact=str(artifact), artifact_sha256=self.sha(artifact),
                    weights_sha256=settings["weights"][architecture]["sha256"]))
        with patch.object(train.runtime, "require_supervised_worker"), \
             patch.object(train.runtime.ResourceSupervisor, "run", return_value={"status": "success"}):
            train._phase(out)
        train.finish_claim(claim, "completed", dict(selection_sha256=self.sha(out / "selection.json")))
        return frozen, out

    def test_development_selection_and_evaluation_retain_scope_without_serving(self):
        frozen, out = self.prepare_software_run()
        run = train.read_sealed(out / "development.json")
        expected = run["binding"]["benchmark_context"]
        self.assertEqual(expected["evaluation_scope"], "development_only")
        selection_path = out / "selection.json"
        selection = evaluate.verify_selection(selection_path, frozen)
        self.assertEqual(selection["benchmark_context"], expected)
        test = self.root / "evaluation"
        test.mkdir()
        train.write_sealed(test / "test-run.json", dict(selection=str(selection_path),
            manifest=str(frozen), baseline_export=None))
        rows = [r for r in train.load_frozen(frozen)["rows"] if r["split"] == "test"]
        for fit in selection["selected"]:
            raw = [dict(sample_id=r["sample_id"], image_sha256=r["image_sha256"],
                        probabilities=[.8, .2] if r["label"] == "Normal" else [.1, .9])
                   for r in rows]
            train.write_sealed(test / (fit["architecture"] + "-raw.json"),
                dict(status="complete", artifact_sha256=fit["artifact_sha256"], predictions=raw))
        with patch.object(train.runtime, "require_supervised_worker"), \
             patch.object(train, "worker_environment"):
            evaluate._score(test)
        report = train.read_sealed(test / "report.json")
        self.assertEqual(report["benchmark_context"], expected)
        self.assertIn("equal_parcel_weighted", report["models"]["mobilenetv2"])
        self.assertEqual(report["models"]["mobilenetv2"]["image_weighted"]["accuracy"]["value"], 1)
        rejected = serving.audit(selection_path, test)
        self.assertEqual(rejected["status"], "unavailable")
        self.assertIn("development-only", rejected["reason"])
        selection["benchmark_context"]["evaluation_scope"] = "final"
        selection_path.unlink()
        train.write_sealed(selection_path, selection)
        with self.assertRaisesRegex(ValueError, "context"):
            evaluate.verify_selection(selection_path, frozen)

    def test_publisher_bootstrap_names_source_item_estimand(self):
        rows = pm.load_manifest(self.save(), verify_images=False)["rows"]
        predictions = [r["label"] for r in rows]
        result = evaluate.bootstrap(rows, predictions, predictions,
                                    benchmark_context=pm.benchmark_context(self.doc))
        self.assertEqual(result["estimand"],
                         "paired equal-connected-source-item-group accuracy difference left minus right")

    def test_weighting_names_connected_source_item_groups(self):
        self.doc["rows"][0]["dependency_ids"] = ["shared-session"]
        self.doc["rows"][1]["dependency_ids"] = ["shared-session"]
        rows = pm.load_manifest(self.save(), verify_images=False)["rows"]
        predictions = [r["label"] if i < 2 else None for i, r in enumerate(rows)]
        result = evaluate.metrics(rows, predictions, True)
        self.assertEqual(result["accuracy"]["numerator"], 1)
        self.assertEqual(result["accuracy"]["denominator"], 19)
        self.assertIn("Equal connected source-item groups", pm.benchmark_context(self.doc)["grouping_interpretation"])

    def test_packaging_targets_need_explicit_validated_evaluation_context(self):
        rows = pm.load_manifest(self.save(), verify_images=False)["rows"]
        with self.assertRaises(ValueError):
            evaluate.validate_rows(rows)
        evaluate.validate_rows(rows, benchmark_context=pm.benchmark_context(self.doc))
        rows[0]["target_status"] = "single_principal"
        with self.assertRaises(ValueError):
            evaluate.validate_rows(rows, benchmark_context=pm.benchmark_context(self.doc))


if __name__ == "__main__":
    unittest.main()
