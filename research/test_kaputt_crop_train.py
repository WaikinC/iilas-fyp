"""Crop development safety tests; no real fit or held-out image access."""
import copy
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

try:
    import kaputt_crop_train as train
except ModuleNotFoundError:
    train = None

# Metadata only: no checkpoint or dataset bytes are checked into this fixture.
LICENCE_EVIDENCE = ("Publisher-documented pretrained transfer-learning use for local educational research: "
    "https://keras.io/api/applications/ and https://keras.io/examples/vision/image_classification_efficientnet_fine_tuning/ "
    "and https://www.tensorflow.org/tutorials/images/transfer_learning . Scope-limited assessment preserved at "
    r"C:\Users\Home\OneDrive\Documents\FYP CWK project full\iilas-fyp\research\datasets\parcel-imagenet-20261020\research-use-assessment.md "
    "SHA256 010572de5a61f8a1fd853c4095a983d1a1350880e09cf97c8a1d3ce0b8eaa187. "
    "Formal redistribution licence for historical HDF5 artifact not established; no distribution or production use in this experiment.")
POLICY = {
    "version":"fixed-technical-and-dhash4-test-quarantine-v1",
    "policy_version":"fixed-technical-and-dhash4-test-quarantine-v1",
    "scope":"147 preselected internal test candidates from official TRAIN; official validation/test remain separate and unacquired",
    "test_images_acquired_after_development_selection":True,
    "technical_rules":{"minimum_side":64,"maximum_pixels":16000000,"maximum_encoded_bytes":16777216,
                       "valid_jpeg_and_verified_source_archive":True},
    "dependency_rules":{"same_source_item_all_views_linked":True,"exact_byte_or_decoded_hash_link":True,
                        "dhash_maximum_hamming_distance":4,"transitive_components":True,
                        "exclude_entire_test_component_touching_frozen_train_or_validation":True,
                        "exclude_entire_test_component_touching_old_100_image_sample":True},
    "after_test_pixels_opened":{"replace_excluded_groups":False,"change_labels":False,"change_thresholds":False,
                                "change_or_retrain_model":False,"change_contrast":False,"search_new_split_seed":False},
    "report":{"all_exclusions_and_reasons":True,"attrition_by_publisher_class_and_material":True,
              "equal_dependency_component_metrics":True,"unweighted_image_metrics":True,
              "raw_predictions_and_input_hashes":True,"both_classes_required_for_comparative_scoring":True,
              "bootstrap_minimum_components_per_class":5,"small_group_warning_below":20},
    "claim_boundary":"Conditional cleaned-crop internal source benchmark, not official source-test accuracy, physical-parcel independence, commercial permission or IILAS photo/live acceptance. Similarity filtering may preferentially remove low-texture packages. Failure/insufficient support is reported without tuning or replacement."}


class CropTrainingTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(train, "Crop-only development runner is missing")
        base = Path(__file__).parent / "datasets" / "crop-training-software-tests"
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def rows(self):
        return [dict(sample_id="a1", split="train", dependency_group_id="a", label="Normal"),
                dict(sample_id="a2", split="train", dependency_group_id="a", label="Damaged"),
                dict(sample_id="b1", split="train", dependency_group_id="b", label="Damaged")]

    def protocol(self):
        data={"schema_version":1,"seed":42,"batch_size":4,"epochs":10,"patience":3,
              "learning_rate":.001,"dropout":.2,"architectures":["mobilenetv2","efficientnetb0"],
              "contrasts":["none","clahe"],"class_order":["Normal","Damaged"],
              "preprocessing":"rgb-letterbox224-v1","benchmark_profile":"kaputt_crop_development",
              "evaluation_scope":"development_only","operationally_approved":False,"input_scope":"crop_only",
              "weighting":"equal_dependency_component_mean1","selection":"component_macro_f1_desc-nll_asc-none_first",
              "limits":{"develop":vars(train.phase_limits())},"internal_test_admission":copy.deepcopy(POLICY),
              "packages":{"tensorflow":"2.21.0","keras":"3.15.1","h5py":"3.14.0","numpy":"2.4.2",
                          "opencv-python-headless":"4.14.0.94"},"weights":{}}
        metadata={
            "mobilenetv2":("f8aff69536bd77a692c594f559c798c19bf7f3f36668fc9fa00b21c6aab4797c",
                           "https://storage.googleapis.com/tensorflow/keras-applications/mobilenet_v2/mobilenet_v2_weights_tf_dim_ordering_tf_kernels_1.0_224_no_top.h5",
                           "8f0c0c1845a4aa03814b947ad1c9f27a4bdc390ce9f63054d02d5c49def41c63"),
            "efficientnetb0":("0683edcf6151811fb3ddd6f098ac48df644d74592c4919a5acdee1c37554add2",
                              "https://storage.googleapis.com/keras-applications/efficientnetb0_notop.h5",
                              "3c4c48d6ad069abacd1381c4374f6e02b7e586809f8013b35dbd56c634a8108c")}
        hashes={}
        for name,(sha,source,compatibility) in metadata.items():
            path=(self.root/(name+".h5")).resolve();payload=b"software checkpoint placeholder; never loaded"
            path.write_bytes(payload);hashes[path]=(payload,sha)
            data["weights"][name]={"path":str(path),"sha256":sha,"source":source,"pretrained":True,
                                   "licence_evidence":LICENCE_EVIDENCE,
                                   "acquisition_receipt_sha256":"f477f371442b8d0fd7709516ba94dfbb3453d2133131b4c5e56feda703befbe6",
                                   "offline_compatibility_sha256":compatibility}
        data["weight_proofs"] = []
        for index,sha in enumerate(sorted(train.PROOF_HASHES)):
            path=(self.root/("proof-"+str(index)+".txt")).resolve();payload=b"software provenance placeholder"
            path.write_bytes(payload);hashes[path]=(payload,sha)
            data["weight_proofs"].append({"path":str(path),"sha256":sha})
        original=train.runtime.sha256_file
        def fixture_hash(path):
            key=Path(path).resolve()
            if key in hashes and key.read_bytes()==hashes[key][0]: return hashes[key][1]
            return original(path)
        # Only the costly official checkpoint/proof acquisition boundary is
        # doubled. Real files, changed bytes, protocol parsing and all admission
        # branches remain real. No placeholder is passed into a model builder.
        reader=patch.object(train.runtime,"sha256_file",side_effect=fixture_hash)
        reader.start();self.addCleanup(reader.stop)
        return data

    def save_protocol(self, data):
        path = self.root / "protocol.json"
        path.write_text(json.dumps(data))
        return path

    def test_each_mixed_label_component_has_equal_total_weight(self):
        rows = self.rows()
        weights = train.component_weights(rows)
        self.assertEqual(weights, [.75, .75, 1.5])
        self.assertEqual(sum(weights), 3)
        self.assertEqual(rows[1]["label"], "Damaged")

    def test_weights_cannot_be_computed_across_partitions_or_duplicate_images(self):
        rows = self.rows(); rows[1]["split"] = "validation"
        with self.assertRaisesRegex(ValueError, "partition"):
            train.component_weights(rows)
        rows = self.rows(); rows[1]["sample_id"] = "a1"
        with self.assertRaisesRegex(ValueError, "duplicate"):
            train.component_weights(rows)

    def test_weighted_metrics_keep_ties_as_abstentions(self):
        rows = self.rows()
        result = train.validation_metrics(rows, [[.8, .2], [.5, .5], [.1, .9]])
        self.assertAlmostEqual(result["component_weighted"]["macro_f1"], .9)
        self.assertAlmostEqual(result["image_unweighted"]["macro_f1"], 5 / 6)
        self.assertEqual(result["predictions"], [0, -1, 1])
        self.assertEqual(result["component_weighted"]["confusion"], [[.75, 0, 0], [0, 1.5, .75]])
        expected = (-.75*math.log(.8)-.75*math.log(.5)-1.5*math.log(.9))/3
        self.assertAlmostEqual(result["component_weighted"]["nll"], expected)

    def test_invalid_probabilities_and_heldout_metrics_fail_closed(self):
        for probabilities in ([[float("nan"), .5]]*3, [[.2, .2]]*3, [[-.2, 1.2]]*3, [[.8, .2]]):
            with self.assertRaises(ValueError):
                train.validation_metrics(self.rows(), probabilities)
        rows = self.rows(); rows[0]["split"] = "test"
        with self.assertRaisesRegex(ValueError, "partition"):
            train.validation_metrics(rows, [[.8, .2]]*3)

    def test_never_predicted_class_precision_is_explicitly_undefined(self):
        result=train.validation_metrics(self.rows(),[[.8,.2]]*3)
        damaged=result["component_weighted"]["per_class"]["Damaged"]
        self.assertIsNone(damaged["precision"])
        self.assertEqual(damaged["predicted_weight"],0)
        self.assertEqual(damaged["support_weight"],2.25)
        self.assertEqual(damaged["f1"],0)

    def test_variant_selection_uses_component_metrics_not_image_accuracy(self):
        rows = [{"contrast": "none", "component_macro_f1": .6, "component_nll": .4,
                 "macro_f1": .99}, {"contrast": "clahe", "component_macro_f1": .7,
                                    "component_nll": .5, "macro_f1": .1}]
        self.assertEqual(train.choose_variant(rows)["contrast"], "clahe")
        rows[0]["component_macro_f1"] = .7
        self.assertEqual(train.choose_variant(rows)["contrast"], "none")
        rows[0]["component_nll"] = .5
        self.assertEqual(train.choose_variant(rows)["contrast"], "none")

    def test_no_partial_duplicate_or_wrong_architecture_fit_selection(self):
        rows = [{"fit_id": name, "architecture": name.rsplit("-",1)[0], "contrast": name.rsplit("-",1)[1],
                 "status": "success", "component_macro_f1": .5, "component_nll": .7}
                for name in train.FIT_IDS]
        train.validate_fit_set(rows)
        for bad in (rows[:3], rows[:3]+[rows[0]], [dict(r,status="failed") for r in rows],
                    [dict(r,architecture="mobilenetv2") for r in rows]):
            with self.assertRaises(ValueError): train.validate_fit_set(bad)

    def test_protocol_preserves_weight_proof_and_fixed_larger_resource_limits(self):
        protocol = self.protocol()
        result = train.load_protocol(self.save_protocol(protocol))
        self.assertEqual(result["input_scope"], "crop_only")
        self.assertEqual(result["limits"]["develop"]["max_fit_seconds"], 3000)
        for key, value in (("operationally_approved",True), ("seed",43), ("input_scope","full_frame")):
            changed = copy.deepcopy(protocol); changed[key] = value
            with self.assertRaises(ValueError): train.load_protocol(self.save_protocol(changed))
        changed = copy.deepcopy(protocol); changed["limits"]["develop"]["max_fit_seconds"] = 3600
        with self.assertRaises(ValueError): train.load_protocol(self.save_protocol(changed))
        changed = copy.deepcopy(protocol); changed["weight_proofs"][0]["sha256"] = "0"*64
        with self.assertRaises(ValueError): train.load_protocol(self.save_protocol(changed))
        changed = copy.deepcopy(protocol); changed["weights"]["mobilenetv2"]["source"] = "other"
        with self.assertRaises(ValueError): train.load_protocol(self.save_protocol(changed))

    def test_same_version_cannot_disable_test_quarantine_or_change_test_after_open_rules(self):
        protocol=self.protocol()
        for group,field,value in (("dependency_rules","exclude_entire_test_component_touching_frozen_train_or_validation",False),
                                  ("dependency_rules","exclude_entire_test_component_touching_old_100_image_sample",False),
                                  ("after_test_pixels_opened","change_or_retrain_model",True),
                                  ("technical_rules","minimum_side",1)):
            changed=copy.deepcopy(protocol);changed["internal_test_admission"][group][field]=value
            with self.assertRaisesRegex(ValueError,"test admission"):
                train.load_protocol(self.save_protocol(changed))

    def test_protocol_path_cannot_open_jpeg_or_nonignored_file_as_metadata(self):
        path=self.root/"heldout.jpg";path.write_bytes(b"not opened")
        with patch.object(Path,"read_text",side_effect=AssertionError("image opened as protocol")):
            with self.assertRaises(ValueError): train.load_protocol(path)
            with self.assertRaises(ValueError): train.load_protocol(Path(__file__))

    def test_claim_survives_failure_and_copied_destination(self):
        claim = train.claim_development("a"*64, {"output":"first"}, self.root)
        train.base.finish_claim(claim,"failed",{"reason":"worker_exit"})
        with self.assertRaisesRegex(ValueError,"already claimed"):
            train.claim_development("a"*64,{"output":"second"},self.root)

    def test_identity_binds_labels_components_code_and_provenance_not_paths(self):
        data = {"profile":"kaputt_crop_development","rows":self.rows(),"source_hashes":{"annotation":"a"*64}}
        binding = {"settings":{"weights":{"mobilenetv2":{"path":"old","sha256":"b"*64}},
                               "weight_proofs":[{"path":"old","sha256":"c"*64}]},
                   "code":{"runner":"d"*64},"environment":{"python":"3"},
                   "benchmark_context":{"provenance":"a"*64}}
        key = train.experiment_identity(data,binding)
        binding["settings"]["weights"]["mobilenetv2"]["path"] = "copy"
        binding["settings"]["weight_proofs"][0]["path"] = "copy"
        self.assertEqual(train.experiment_identity(data,binding),key)
        for field,value in (("label","Damaged"),("dependency_group_id","new")):
            changed = copy.deepcopy(data); changed["rows"][0][field] = value
            self.assertNotEqual(train.experiment_identity(changed,binding),key)
        binding["code"]["runner"] = "e"*64
        self.assertNotEqual(train.experiment_identity(data,binding),key)

    def test_relocated_frozen_manifest_and_source_paths_cannot_create_new_claim_key(self):
        data={"profile":"kaputt_crop_development","rows":self.rows(),
              "image_root":"C:/old/root", "manifest_sha256":"a"*64,
              "source_hashes":{"annotations":{"path":"old/meta.parquet","sha256":"b"*64,"bytes":10}}}
        binding={"settings":{"weight_proofs":[{"path":"old/license","sha256":"c"*64}]},
                 "code":{"runner":"d"*64},"environment":{"python":"3"},
                 "benchmark_context":{"manifest_sha256":"a"*64,"source_hashes":{"annotations":"b"*64}}}
        key=train.experiment_identity(data,binding)
        data["image_root"]="D:/copy/root";data["manifest_sha256"]="e"*64
        data["source_hashes"]["annotations"]["path"]="copy/meta.parquet"
        binding["benchmark_context"]["manifest_sha256"]="e"*64
        self.assertEqual(train.experiment_identity(data,binding),key)
        data["source_hashes"]["annotations"]["sha256"]="f"*64
        self.assertNotEqual(train.experiment_identity(data,binding),key)

    def test_image_partition_rejected_before_any_bytes_open(self):
        row={"split":"test","_image_path":str(self.root/"heldout.png")}
        with patch.object(Path,"read_bytes",side_effect=AssertionError("test pixels opened")):
            with self.assertRaisesRegex(ValueError,"partition"):
                train.read_image(row,allowed=("train","validation"))

    def test_worker_entry_requires_real_supervisor_before_loading_inputs(self):
        with patch.dict("os.environ",{},clear=True):
            for method,args in ((train._phase,(self.root,)),(train._fit,(self.root,"mobilenetv2-none"))):
                with self.assertRaises(train.runtime.RuntimeSafetyError): method(*args)

    def test_software_fixture_has_real_weighted_loss_contract(self):
        self.assertAlmostEqual(train.weighted_nll([0,1],[[.8,.2],[.1,.9]],[.5,1.5]),
                               (-.5*math.log(.8)-1.5*math.log(.9))/2)

    def image_row(self):
        import cv2
        import hashlib
        import numpy as np
        bgr = np.zeros((64,80,3),np.uint8); bgr[:,:] = [13,71,199]
        payload = cv2.imencode(".jpg",bgr)[1].tobytes()
        path = self.root/"image.jpg"; path.write_bytes(payload)
        decoded = cv2.imdecode(np.frombuffer(payload,np.uint8),cv2.IMREAD_COLOR|cv2.IMREAD_IGNORE_ORIENTATION)
        return {"sample_id":"image", "split":"validation", "dependency_group_id":"one",
                "label":"Normal", "_image_path":path,"image_sha256":hashlib.sha256(payload).hexdigest(),
                "decoded_sha256":hashlib.sha256(decoded.tobytes()).hexdigest(),"width":80,"height":64}

    def test_real_software_jpeg_preserves_bgr_receipt_and_returns_rgb(self):
        row = self.image_row()
        image = train.read_image(row,allowed=("validation",))
        self.assertEqual(image.shape,(64,80,3))
        self.assertGreater(int(image[0,0,0]),int(image[0,0,2]))
        row["decoded_sha256"] = "0"*64
        with self.assertRaisesRegex(ValueError,"decoded"):
            train.read_image(row,allowed=("validation",))

    def test_changed_image_bytes_are_refused_before_decode(self):
        row = self.image_row(); row["_image_path"].write_bytes(b"changed")
        with patch("parcel_inputs.decode_rgb",side_effect=AssertionError("decode reached")):
            with self.assertRaisesRegex(ValueError,"hash"):
                train.read_image(row,allowed=("validation",))

    def test_per_image_guard_rejects_untracked_tree_escape_without_git_processes(self):
        row=self.image_row()
        with patch.object(train.runtime,"_validate_output_path",side_effect=AssertionError("per-image Git guard")):
            image=train.read_image(row,allowed=("validation",))
            self.assertEqual(image.shape,(64,80,3))
        row["_image_path"]=Path(__file__).resolve()
        with self.assertRaisesRegex(ValueError,"research data"):
            train.read_image(row,allowed=("validation",))

    def test_training_stream_keeps_mixed_labels_and_component_weights(self):
        row = self.image_row()
        rows = [dict(row,sample_id="a",label="Normal"),dict(row,sample_id="b",label="Damaged"),
                dict(row,sample_id="c",dependency_group_id="two",label="Damaged")]
        output = list(train.image_stream(rows,"none",training=False))
        self.assertEqual([int(y) for _,y,_ in output],[0,1,1])
        self.assertEqual([float(w) for _,_,w in output],[.75,.75,1.5])
        self.assertEqual(output[0][0].shape,(224,224,3))

    def test_manifest_mutation_invalidates_worker_binding_before_loading(self):
        path = self.root/"manifest.json"; path.write_text("old")
        binding = {"manifest":{"path":str(path),"sha256":train.runtime.sha256_file(path)}}
        path.write_text("changed")
        with self.assertRaisesRegex(ValueError,"Changed manifest"):
            train.verify_binding(binding)

    def test_fit_receipt_rejects_partial_files_and_changed_binding(self):
        target=self.root/"mobilenetv2-none"; target.mkdir()
        run={"key":"a"*64,"binding":{"one":"two"}}
        result={"fit_id":"mobilenetv2-none","development_key":run["key"],
                "binding_sha256":train.base.digest(run["binding"])}
        with self.assertRaisesRegex(ValueError,"artifact"):
            train.verify_fit_result(self.root,run,result)
        result["binding_sha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"binding"):
            train.verify_fit_result(self.root,run,result)

    def phase_fixture(self):
        run={"key":"a"*64,"binding":{"benchmark_context":{"profile":"kaputt_crop_development"}}}
        train.base.write_sealed(self.root/"development.json",run)
        for fit_id in train.FIT_IDS:
            target=self.root/fit_id;target.mkdir()
            architecture,contrast=fit_id.rsplit("-",1)
            result={"fit_id":fit_id,"architecture":architecture,"contrast":contrast,"status":"success",
                    "component_macro_f1":.5,"component_nll":.7,"development_key":run["key"],
                    "binding_sha256":train.base.digest(run["binding"]),"artifact":str(target/"classifier.keras")}
            for name,key in (("classifier.keras","artifact_sha256"),
                             ("validation-predictions.json","validation_predictions_sha256"),
                             ("history.json","history_sha256")):
                file=target/name;file.write_text("software fixture; no trained model")
                result[key]=train.runtime.sha256_file(file)
            train.base.write_sealed(target/"fit.json",result)
        return run

    def phase_patches(self,failed=None,mutate_completed=False):
        # Only process execution and admission are substituted. Files, receipts,
        # result verification, four-fit validation and selection writes are real.
        class Supervisor:
            def __init__(inner,*args): pass
            def run(inner,command,*,fit_id,**kwargs):
                if fit_id==failed: return {"status":"failed","reason":"worker_exit"}
                train.runtime.write_json_exclusive(self.root/(fit_id+".result.json"),
                                                  {"status":"success","reason":None})
                if mutate_completed and fit_id=="efficientnetb0-clahe":
                    (self.root/"mobilenetv2-none/classifier.keras").write_text("changed after fit")
                return {"status":"success","reason":None}
        return (patch.object(train.runtime,"require_supervised_worker"),
                patch.object(train.base,"worker_environment"),
                patch.object(train,"verify_binding"),
                patch.object(train.runtime,"ResourceSupervisor",Supervisor))

    def test_phase_failure_preserves_no_selection_and_never_replaces_fit(self):
        self.phase_fixture()
        a,b,c,d=self.phase_patches(failed="efficientnetb0-none")
        with a,b,c,d:
            with self.assertRaisesRegex(ValueError,"no replacement"):
                train._phase(self.root)
        self.assertFalse((self.root/"selection.json").exists())
        self.assertFalse((self.root/"efficientnetb0-clahe.result.json").exists())

    def test_phase_persists_bound_selection_only_after_four_valid_artifacts(self):
        run=self.phase_fixture()
        a,b,c,d=self.phase_patches()
        with a,b,c,d: train._phase(self.root)
        selection=train.base.read_sealed(self.root/"selection.json")
        self.assertEqual(selection["development_key"],run["key"])
        self.assertEqual([r["fit_id"] for r in selection["selected"]],["mobilenetv2-none","efficientnetb0-none"])
        self.assertEqual(selection["test_metrics"],"Not run")
        self.assertFalse(selection["operationally_approved"])

    def test_completed_fit_changed_during_later_fit_cannot_enter_selection(self):
        self.phase_fixture()
        a,b,c,d=self.phase_patches(mutate_completed=True)
        with a,b,c,d:
            with self.assertRaisesRegex(ValueError,"artifact"):
                train._phase(self.root)
        self.assertFalse((self.root/"selection.json").exists())

    def test_receipt_cannot_redirect_selected_artifact_to_unverified_path(self):
        run=self.phase_fixture()
        result=train.base.read_sealed(self.root/"mobilenetv2-none/fit.json")
        result["artifact"]=str(self.root/"different.keras")
        with self.assertRaisesRegex(ValueError,"artifact path"):
            train.verify_fit_result(self.root,run,result)

    def test_low_memory_preflight_does_not_consume_training_claim(self):
        manifest=self.root/"manifest.json";manifest.write_text("{}")
        protocol=self.root/"protocol.json";protocol.write_text("{}")
        out=self.root/"low-memory"
        data={"profile":"kaputt_crop_development","rows":self.rows(),"source_hashes":{}}
        with patch.object(train,"load_frozen",return_value=data), \
             patch.object(train,"load_protocol",return_value={}), \
             patch.object(train,"code_bindings",return_value={}), \
             patch("kaputt_crop_manifest.benchmark_context",return_value={}), \
             patch.object(train.runtime.ResourceSupervisor,"preflight",side_effect=train.runtime.RuntimeSafetyError("available_memory")):
            with self.assertRaisesRegex(train.runtime.RuntimeSafetyError,"available_memory"):
                train.prepare_development(manifest,protocol,out)
        self.assertEqual(json.loads((out/"preflight-failed.json").read_text())["reason"],"available_memory")
        self.assertFalse((out/"development.json").exists())

    def test_frozen_loader_keeps_reserved_metadata_without_reading_pixels(self):
        rows=self.rows()+[{"sample_id":"v","split":"validation","dependency_group_id":"v","label":"Normal"}]
        rows=[dict(row,official_split="train") for row in rows]
        doc={"profile":"kaputt_crop_development","schema_version":1,"evaluation_scope":"development_only",
             "operationally_approved":False,"frozen_development":True,"rows":rows,
             "reserved_test_metadata":[{"image_path":"never-read.jpg","split":"test"}]}
        path=self.root/"manifest.json";path.write_text("{}")
        with patch("kaputt_crop_manifest.load_manifest",return_value=doc), \
             patch.object(Path,"read_bytes",side_effect=AssertionError("pixel access")):
            result=train.load_frozen(path)
            self.assertEqual(len(result["rows"]),4)
            doc["rows"][3]["dependency_group_id"]="a"
            with self.assertRaisesRegex(ValueError,"crosses"):
                train.load_frozen(path)

    def test_code_mutation_invalidates_receipt(self):
        manifest=self.root/"manifest.json";manifest.write_text("{}")
        protocol=self.root/"protocol.json";protocol.write_text("{}")
        binding={"manifest":{"path":str(manifest),"sha256":train.runtime.sha256_file(manifest)},
                 "protocol":{"path":str(protocol),"sha256":train.runtime.sha256_file(protocol)},
                 "code":{"old":"a"*64},"environment":train.base.environment()}
        with self.assertRaisesRegex(ValueError,"Changed code"):
            train.verify_binding(binding)

    @unittest.skipUnless(os.environ.get("IILAS_CROP_TF_FIXTURE")=="1","Explicit supervised TensorFlow software check")
    def test_actual_keras_weighted_loss_including_short_last_batch(self):
        out=self.root/"tf-fixture";out.mkdir()
        limits=train.runtime.Limits(max_wall_seconds=120,max_fit_seconds=120,max_rss_bytes=1280*1024**2,
                                    min_available_bytes=3072*1024**2,min_free_disk_bytes=2048*1024**2,
                                    max_output_bytes=16*1024**2,available_floor_bytes=768*1024**2,threads=1)
        supervisor=train.runtime.ResourceSupervisor(out,limits)
        result=supervisor.run([sys.executable,str(Path(__file__).resolve()),"--weighted-loss-worker",str(out)],
                              fit_id="software-loss",cwd=train.ROOT)
        self.assertEqual(result["status"],"success",result)
        report=json.loads((out/"weighted-loss.json").read_text())
        self.assertAlmostEqual(report["keras_loss"],(-.75*math.log(.8)-.75*math.log(.5)-1.5*math.log(.9))/3,places=6)
        self.assertAlmostEqual(report["epoch_loss"],report["keras_loss"],places=6)


def weighted_loss_worker(output):
    train.runtime.require_supervised_worker()
    train.base.worker_environment(output)
    os.environ["KERAS_HOME"]=str(output/"keras-cache")
    import numpy as np
    import tensorflow as tf
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    probabilities=np.array([[.8,.2],[.5,.5],[.1,.9]],dtype=np.float32)
    labels=np.array([0,1,1],dtype=np.int32)
    weights=np.array([.75,.75,1.5],dtype=np.float32)
    loss=float(tf.keras.losses.SparseCategoricalCrossentropy()(labels,probabilities,sample_weight=weights))
    inputs=tf.keras.Input((2,));outputs=tf.keras.layers.Activation("linear")(inputs)
    model=tf.keras.Model(inputs,outputs)
    model.compile(loss="sparse_categorical_crossentropy")
    dataset=tf.data.Dataset.from_tensor_slices((probabilities,labels,weights)).batch(2)
    options=tf.data.Options();options.threading.private_threadpool_size=1
    options.threading.max_intra_op_parallelism=1;options.experimental_deterministic=True
    epoch=float(model.evaluate(dataset.with_options(options).prefetch(1),verbose=0))
    train.runtime.write_json_exclusive(output/"weighted-loss.json",{"keras_loss":loss,"epoch_loss":epoch,
                                                                  "scope":"software probabilities only; no fit"})


if __name__ == "__main__":
    if len(sys.argv)==3 and sys.argv[1]=="--weighted-loss-worker":
        weighted_loss_worker(Path(sys.argv[2]))
    else: unittest.main()
