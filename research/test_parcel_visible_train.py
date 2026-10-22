"""Visible development software fixtures; never load real data or models."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

try:
    import parcel_visible_train as train
except ModuleNotFoundError:
    train = None


class VisibleTrainingTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(train, 'Restricted visible runner missing')
        base = Path(__file__).parent/'datasets/visible-training-software-tests'
        base.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=base)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def rows(self):
        return [dict(sample_id='a1',split='train',label='Normal',dependency_group_id='a'),
                dict(sample_id='a2',split='train',label='Damaged',dependency_group_id='a'),
                dict(sample_id='b1',split='train',label='Damaged',dependency_group_id='b'),
                dict(sample_id='v1',split='validation',label='Normal',dependency_group_id='v'),
                dict(sample_id='v2',split='validation',label='Damaged',dependency_group_id='w')]

    def manifest(self):
        rows=self.rows()
        for row in rows:
            row.update(path='research/datasets/fixture-only.png',sha256='a'*64,pixel_sha256='b'*64,
                       width=80,height=64,source_family=row['sample_id'])
        return dict(schema_version=1,benchmark_profile='parcel_visible_development',
                    class_order=['Normal','Damaged'],training_admission=True,rows=rows,
                    admission_kind='visible_review_overlay_v1')

    def protocol(self):
        # Reuse the existing metadata-only official-weight fixture. Its hash
        # double never opens a real checkpoint and still detects changed bytes.
        from test_kaputt_crop_train import CropTrainingTests
        fixture = CropTrainingTests.protocol(self)
        value = train.settings_template()
        value.update(weights=fixture['weights'],weight_proofs=fixture['weight_proofs'])
        path = self.root/'protocol.json'
        path.write_text(json.dumps(value),encoding='utf-8')
        return path

    def test_manifest_refuses_test_admission_class_order_and_group_leak(self):
        train.validate_manifest(self.manifest())
        for key,value in [('training_admission',False),('benchmark_profile','kaputt_crop_development'),
                          ('class_order',['Damaged','Normal'])]:
            data=self.manifest(); data[key]=value
            with self.subTest(key=key), self.assertRaises(ValueError): train.validate_manifest(data)
        for mutation in ('test','group','duplicate','missingclass'):
            data=self.manifest()
            if mutation=='test': data['rows'][0]['split']='test'
            if mutation=='group': data['rows'][-1]['dependency_group_id']='a'
            if mutation=='duplicate': data['rows'][-1]['sample_id']='a1'
            if mutation=='missingclass': data['rows'][-1]['label']='Normal'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): train.validate_manifest(data)

    def test_plain_candidate_or_legacy_admission_cannot_bypass_review_overlay(self):
        for marker in (None,'visible_candidate_v1','legacy_training_admission'):
            data=self.manifest()
            if marker is None: data.pop('admission_kind')
            else:data['admission_kind']=marker
            self.assertTrue(data['training_admission'])
            with self.subTest(marker=marker), self.assertRaisesRegex(ValueError,'review'):
                train.validate_manifest(data)

    def test_frozen_loader_uses_review_adapter_instead_of_plain_manifest_loader(self):
        path=self.root/'overlay.json';path.write_text('{}')
        reviewed=self.manifest()
        legacy=dict(reviewed,admission_kind='legacy_training_admission')
        with patch('parcel_visible_review.load_manifest',return_value=reviewed),\
                patch('parcel_visible_manifest.load_manifest',return_value=legacy):
            self.assertEqual(train.load_frozen(path),reviewed)

    def test_order_is_mobile_clahe_then_efficient_none_and_partial_never_selects(self):
        rows=[dict(status='success',fit_id='mobilenetv2-clahe',architecture='mobilenetv2',contrast='clahe',
                   component_macro_f1=.6,component_nll=.7),
              dict(status='success',fit_id='efficientnetb0-none',architecture='efficientnetb0',contrast='none',
                   component_macro_f1=.6,component_nll=.7)]
        train.validate_fit_set(rows)
        self.assertEqual(train.compare_fits(rows)['fit_id'],'mobilenetv2-clahe')
        rows[1]['component_nll']=.6
        self.assertEqual(train.compare_fits(rows)['fit_id'],'efficientnetb0-none')
        for bad in (rows[:1],list(reversed(rows)),[rows[0],rows[0]],rows+[rows[1]]):
            with self.assertRaises(ValueError): train.validate_fit_set(bad)

    def test_component_weights_preserve_mixed_publisher_labels(self):
        self.assertEqual(train.component_weights(self.rows()[:3]),[.75,.75,1.5])
        with self.assertRaises(ValueError): train.component_weights(self.rows())
        result=train.validation_metrics(self.rows()[:3],[[.8,.2],[.5,.5],[.1,.9]])
        self.assertAlmostEqual(result['component_weighted']['macro_f1'],.9)
        self.assertEqual(result['predictions'],[0,-1,1])

    def test_local_weight_and_proof_binding_and_profile_are_checked(self):
        path=self.protocol()
        value=train.load_protocol(path)
        self.assertEqual(value['fit_ids'],['mobilenetv2-clahe','efficientnetb0-none'])
        changed=json.loads(path.read_text()); changed['weights']['mobilenetv2']['pretrained']=False
        path.write_text(json.dumps(changed))
        with self.assertRaisesRegex(ValueError,'provenance'): train.load_protocol(path)
        path=self.protocol(); changed=json.loads(path.read_text())
        Path(changed['weight_proofs'][0]['path']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'evidence'): train.load_protocol(path)

    def test_protocol_template_cannot_run_without_local_weights(self):
        path=self.root/'template.json'; path.write_text(json.dumps(train.settings_template()))
        with self.assertRaisesRegex(ValueError,'weight'): train.load_protocol(path)

    def test_prepare_freezes_metadata_and_detects_membership_and_protocol_drift(self):
        data=self.manifest();manifest=self.root/'manifest.json';manifest.write_text('{}')
        protocol=self.protocol()
        with patch.object(train,'load_frozen',return_value=data):
            prepared=train.prepare(manifest,protocol,self.root/'prepared')
            self.assertTrue(prepared.is_file())
            run=train.read_prepared(prepared)
            self.assertEqual(run['binding']['settings']['fit_ids'],['mobilenetv2-clahe','efficientnetb0-none'])
            data['rows'][0]['sha256']='c'*64
            with self.assertRaisesRegex(ValueError,'identity'):train.read_prepared(prepared)
            data['rows'][0]['sha256']='a'*64;protocol.write_text(protocol.read_text()+' ')
            with self.assertRaisesRegex(ValueError,'protocol'):train.read_prepared(prepared)

    def test_failed_native_probe_consumes_claim_and_preserves_failure(self):
        class FailedSupervisor:
            def __init__(self,*args):pass
            def run(self,*args,**kwargs):return dict(status='failed',reason='rss_limit',returncode=137)
        prepared=dict(key='d'*64,binding={})
        registry=self.root/'registry'
        with patch.object(train,'read_prepared',return_value=prepared),patch.object(train,'REGISTRY',registry),\
                patch.object(train.runtime,'ResourceSupervisor',FailedSupervisor):
            with self.assertRaisesRegex(ValueError,'no replacement'):train.probe('fixture',self.root/'failed-probe')
            with self.assertRaisesRegex(ValueError,'claimed'):train.probe('fixture',self.root/'retry-probe')
        failed=json.loads((registry/('probe-'+'d'*64)/'failed.json').read_text())
        self.assertIn('rss_limit',failed['reason'])
        self.assertTrue((self.root/'failed-probe/request.json').is_file())
        self.assertFalse((registry/'active-job').exists())

    def test_ordered_phase_reconstructs_raw_metrics_and_binds_all_artifacts(self):
        data=self.manifest();prepared=dict(key='e'*64,binding={'manifest':{'path':'fixture'}})
        rows=data['rows'][3:]
        outer=self
        class FixtureSupervisor:
            def __init__(self,*args):pass
            def run(self,*args,**kwargs):
                fit_id=kwargs['fit_id'];target=outer.root/fit_id;target.mkdir()
                raw=[dict(sample_id=r['sample_id'],label=r['label'],dependency_group_id=r['dependency_group_id'],
                          sha256=r['sha256'],pixel_sha256=r['pixel_sha256'],component_weight=1.,probabilities=p)
                     for r,p in zip(rows,[[.8,.2],[.1,.9]])]
                train.runtime.write_json_exclusive(target/'validation-predictions.json',raw)
                train.runtime.write_json_exclusive(target/'history.json',dict(loss=[.8,.7,.6],val_loss=[.6,.164252033486018,.3]))
                (target/'classifier.keras').write_bytes(b'software model placeholder; never loaded')
                architecture,contrast=fit_id.rsplit('-',1)
                receipt=dict(status='success',fit_id=fit_id,architecture=architecture,contrast=contrast,key=prepared['key'],
                    binding_sha256=train.base.digest(prepared['binding']),validation_metrics=train.validation_metrics(rows,[r['probabilities'] for r in raw]),
                    component_macro_f1=1.,component_nll=(-__import__('math').log(.8)-__import__('math').log(.9))/2,
                    best_epoch=2,min_val_loss=.164252033486018,raw_predictions_from='reloaded_classifier.keras',
                    artifact_sha256=train.runtime.sha256_file(target/'classifier.keras'),
                    validation_predictions_sha256=train.runtime.sha256_file(target/'validation-predictions.json'),
                    history_sha256=train.runtime.sha256_file(target/'history.json'))
                train.base.write_sealed(target/'fit.json',receipt)
                train.runtime.write_json_exclusive(outer.root/(fit_id+'.result.json'),dict(status='success'))
                if fit_id=='efficientnetb0-none' and getattr(outer,'mutate_completed',False):
                    (outer.root/'mobilenetv2-clahe/classifier.keras').write_bytes(b'changed by later worker')
                return dict(status='success')
        with patch.object(train.runtime,'require_supervised_worker'),patch.object(train.base,'worker_environment'),\
                patch.object(train,'_request',return_value=dict(prepared=prepared,probe={'path':'fixture'})),\
                patch.object(train,'load_frozen',return_value=data),patch.object(train,'verify_binding',return_value=data),\
                patch.object(train.runtime,'ResourceSupervisor',FixtureSupervisor):
            train._phase(self.root)
            result=train.base.read_sealed(self.root/'selection.json')
            self.assertEqual([r['fit_id'] for r in result['all_fits']],['mobilenetv2-clahe','efficientnetb0-none'])
            self.assertEqual(result['comparison_winner'],'mobilenetv2-clahe')
            self.assertEqual(result['test_metrics'],'Not run')
            fit=result['all_fits'][0]
            history_path=self.root/'mobilenetv2-clahe/history.json'
            history_path.write_text(json.dumps(dict(loss=[.8,.7],val_loss=[.6,.7])))
            fit['history_sha256']=train.runtime.sha256_file(history_path)
            with self.assertRaisesRegex(ValueError,'restored'):train.verify_fit_result(self.root,prepared,fit)
            history_path.write_text(json.dumps(dict(loss=[.8,.7,.6],val_loss=[.6,.164252033486018,.3])))
            fit['history_sha256']=train.runtime.sha256_file(history_path)
            raw_path=self.root/'mobilenetv2-clahe/validation-predictions.json'
            raw=json.loads(raw_path.read_text());raw[0]['probabilities']=[.1,.9]
            raw_path.write_text(json.dumps(raw));fit['validation_predictions_sha256']=train.runtime.sha256_file(raw_path)
            with self.assertRaisesRegex(ValueError,'reconstruct'):train.verify_fit_result(self.root,prepared,fit)
            self.root=self.root/'changed-phase';self.root.mkdir();self.mutate_completed=True
            with self.assertRaisesRegex(ValueError,'artifact'):train._phase(self.root)
            self.assertFalse((self.root/'selection.json').exists())

    def test_restoration_requires_finite_history_and_raw_loss_matching_minimum(self):
        for history,nll in ((dict(loss=[.8,.7],val_loss=[.5,.7]),.7),
                            (dict(loss=[.8,.7],val_loss=[.5,float('nan')]),.5)):
            with self.assertRaises(ValueError):train.restored_validation(history,nll)
        self.assertEqual(train.restored_validation(dict(loss=[.8,.7,.6],val_loss=[.5,.4,.6]),.400001),
                         dict(best_epoch=2,min_val_loss=.4))

    def test_reversed_fits_and_larger_caps_require_protocol_amendment(self):
        path=self.protocol(); data=json.loads(path.read_text()); data['fit_ids'].reverse()
        path.write_text(json.dumps(data))
        with self.assertRaises(ValueError): train.load_protocol(path)
        path=self.protocol(); data=json.loads(path.read_text()); data['limits']['develop']['max_rss_bytes']+=1
        path.write_text(json.dumps(data))
        with self.assertRaises(ValueError): train.load_protocol(path)

    def test_read_image_rejects_test_before_filesystem_or_decoder(self):
        with self.assertRaisesRegex(ValueError,'partition'):
            train.read_image(dict(split='test',path='missing'),allowed=('test',))

    def test_read_image_hashes_oriented_rgb_and_detects_byte_drift(self):
        import cv2
        import numpy as np
        rgb=np.full((64,80,3),(25,130,220),np.uint8)
        payload=cv2.imencode('.png',cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR))[1].tobytes()
        path=self.root/'image.png';path.write_bytes(payload)
        row=dict(split='train',path=path.relative_to(train.ROOT).as_posix(),sha256=hashlib.sha256(payload).hexdigest(),
                 pixel_sha256=hashlib.sha256(rgb.tobytes()).hexdigest(),width=80,height=64)
        np.testing.assert_array_equal(train.read_image(row,allowed=('train',)),rgb)
        path.write_bytes(payload+b'x')
        with self.assertRaisesRegex(ValueError,'hash'): train.read_image(row,allowed=('train',))

    def test_stream_keeps_final_short_batch_and_validation_has_no_augmentation(self):
        import numpy as np
        rows=self.rows()[:3]; rng=np.random.default_rng(42)
        with patch.object(train,'read_image',return_value=np.ones((64,64,3),np.uint8)):
            batches=list(train.batch_stream(rows,'clahe',training=True,rng=rng,batch_size=2))
        self.assertEqual([len(b[0]) for b in batches],[2,1])
        self.assertEqual(sum(float(w) for b in batches for w in b[2]),3)
        with patch.object(train,'read_image',return_value=np.full((64,64,3),80,np.uint8)):
            first=list(train.image_stream(self.rows()[3:],'none',training=False))
            second=list(train.image_stream(self.rows()[3:],'none',training=False))
        np.testing.assert_array_equal(first[0][0],second[0][0])

    def test_early_stopping_restores_best_weighted_validation_loss(self):
        class Early:
            def __init__(self,**kwargs): self.settings=kwargs
        class Model:
            def fit(self,*args,**kwargs):
                callback=kwargs['callbacks'][0]
                if callback.settings != dict(monitor='val_loss',patience=3,restore_best_weights=True):
                    raise AssertionError('Epoch selection changed')
                self.best_restored=callback.settings['restore_best_weights']
                return kwargs
        from types import SimpleNamespace
        tf=SimpleNamespace(keras=SimpleNamespace(callbacks=SimpleNamespace(EarlyStopping=Early)))
        model=Model(); result=train.fit_head(model,'weighted-train','weighted-val',tf)
        self.assertTrue(model.best_restored)
        self.assertEqual(result['epochs'],10)
        self.assertEqual(result['validation_data'],'weighted-val')

    def test_conservative_probe_projection_refuses_over_cap_or_mutated_state(self):
        data=self.manifest()
        record=dict(fit_id='mobilenetv2-clahe',setup_seconds=1.,forward_seconds=.1,
                    gradient_seconds=.2,decode_seconds=.1,save_load_seconds=1.,state_unchanged=True,
                    batch_size=3,train_sample_ids=['a1','a2','b1'])
        result=train.project_probe(record,data)
        self.assertGreaterEqual(result['fit_seconds'],8.)
        record['gradient_seconds']=200.
        with self.assertRaisesRegex(ValueError,'projection'): train.project_probe(record,data)
        record['gradient_seconds']=.2;record['state_unchanged']=False
        with self.assertRaises(ValueError): train.project_probe(record,data)
        record['state_unchanged']=True;record['train_sample_ids']=['v1']
        with self.assertRaises(ValueError): train.project_probe(record,data)

    def test_probe_projection_scales_real_decode_and_preparation_cost(self):
        data=self.manifest()
        record=dict(fit_id='mobilenetv2-clahe',setup_seconds=1.,forward_seconds=.1,
                    gradient_seconds=.2,decode_seconds=150.,save_load_seconds=1.,state_unchanged=True,
                    batch_size=3,train_sample_ids=['a1','a2','b1'])
        with self.assertRaisesRegex(ValueError,'projection'):train.project_probe(record,data)

    def test_probe_projection_counts_full_gradient_batch_once_and_separate_validation_forward(self):
        record=dict(fit_id='mobilenetv2-clahe',setup_seconds=5.,decode_seconds=1.,
                    forward_seconds=2.,gradient_seconds=4.,save_load_seconds=3.,state_unchanged=True,
                    batch_size=3,train_sample_ids=['a1','a2','b1'])
        result=train.project_probe(record,self.manifest())
        # One TRAIN/one VALID batch: 5+2*(10*((1+4)+(1+2)+3)+3)=231.
        # gradient_seconds already measures model-forward + loss + backward.
        self.assertEqual(result['fit_seconds'],231.)
        self.assertEqual(result['maximum_epochs'],10)
        self.assertEqual(result['safety_factor'],2)

    def test_rejected_probe_projection_retains_exclusive_bound_measurement_attempt(self):
        target=self.root/'rejected-probe';target.mkdir()
        record=dict(fit_id='mobilenetv2-clahe',setup_seconds=5.,decode_seconds=1.,
                    forward_seconds=2.,gradient_seconds=200.,save_load_seconds=3.,state_unchanged=True,
                    batch_size=3,train_sample_ids=['a1','a2','b1'])
        prepared=dict(key='f'*64,binding={'fixture':'bound-source'})
        with self.assertRaisesRegex(ValueError,'projection'):
            train.finalize_probe_model(target,record,self.manifest(),prepared)
        path=target/'probe-model-attempt.json'
        attempt=train.base.read_sealed(path)
        self.assertEqual(attempt['gradient_seconds'],200.)
        self.assertEqual(attempt['forward_seconds'],2.)
        self.assertEqual(attempt['train_sample_ids'],['a1','a2','b1'])
        self.assertTrue(attempt['state_unchanged'])
        self.assertEqual(attempt['key'],'f'*64)
        self.assertEqual(attempt['binding_sha256'],train.base.digest(prepared['binding']))
        self.assertFalse((target/'probe-model.json').exists())
        original=path.read_bytes()
        with self.assertRaises(FileExistsError):
            train.finalize_probe_model(target,dict(record,gradient_seconds=1.),self.manifest(),prepared)
        self.assertEqual(path.read_bytes(),original)

    def test_probe_requires_all_three_successful_native_receipts_and_unchanged_binding(self):
        data=self.manifest();prepared=dict(key='c'*64,binding={})
        models=[dict(fit_id=f,setup_seconds=1.,decode_seconds=.1,forward_seconds=.1,
                     gradient_seconds=.2,save_load_seconds=1.,state_unchanged=True,
                     batch_size=3,train_sample_ids=['a1','a2','b1']) for f in train.FIT_IDS]
        native=[]
        for name in ('probe.result.json','mobilenetv2-clahe.result.json','efficientnetb0-none.result.json'):
            path=self.root/name;path.write_text(json.dumps(dict(status='success',returncode=0,elapsed_seconds=10.,peak_rss_bytes=100*1024**2)))
            native.append(dict(name=name,sha256=train.runtime.sha256_file(path)))
        receipt=dict(status='success',key=prepared['key'],binding_sha256=train.base.digest({}),models=models,
                     projections=[train.project_probe(r,data) for r in models],native_records=native)
        path=self.root/'probe.json';train.base.write_sealed(path,receipt)
        with patch.object(train,'verify_binding',return_value=data):
            self.assertEqual(train.verify_probe(path,prepared)['status'],'success')
            failed=self.root/'mobilenetv2-clahe.result.json'
            failed.write_text(json.dumps(dict(status='failed',returncode=137,elapsed_seconds=2.,peak_rss_bytes=3*1024**3)))
            native[1]['sha256']=train.runtime.sha256_file(failed)
            path.write_text(json.dumps(dict(payload=receipt,sha256=train.base.digest(receipt))))
            with self.assertRaisesRegex(ValueError,'native'):train.verify_probe(path,prepared)
            failed.write_text(json.dumps(dict(status='success',returncode=0,elapsed_seconds=float('nan'),peak_rss_bytes=10)))
            native[1]['sha256']=train.runtime.sha256_file(failed)
            path.write_text(json.dumps(dict(payload=receipt,sha256=train.base.digest(receipt))))
            with self.assertRaisesRegex(ValueError,'native'):train.verify_probe(path,prepared)
            prepared['key']='d'*64
            with self.assertRaisesRegex(ValueError,'source-bound'):train.verify_probe(path,prepared)

    def test_fit_leaf_refuses_missing_probe_before_import_or_model_access(self):
        prepared=dict(key='a'*64,binding={})
        with patch.object(train,'_request',return_value=dict(prepared=prepared,probe=None)),patch.object(train.runtime,'require_supervised_worker'):
            with self.assertRaisesRegex(ValueError,'Probe'):
                train._leaf_setup(self.root,'mobilenetv2-clahe',require_probe=True)

    def test_failed_first_native_fit_prevents_second_and_selection(self):
        class FailedSupervisor:
            def __init__(self,*args):pass
            def run(self,*args,**kwargs):return dict(status='failed',reason='rss_limit')
        with patch.object(train.runtime,'require_supervised_worker'),patch.object(train.base,'worker_environment'),\
                patch.object(train,'_request',return_value=dict(prepared={},probe={'path':'unused'})),\
                patch.object(train.runtime,'ResourceSupervisor',FailedSupervisor):
            with self.assertRaisesRegex(ValueError,'no replacement'):train._phase(self.root)
        self.assertFalse((self.root/'selection.json').exists())
        self.assertFalse((self.root/'efficientnetb0-none').exists())

    def test_consumed_probe_and_development_claims_cannot_be_retried(self):
        registry=self.root/'registry'
        for phase in ('probe','develop'):
            claim=train.claim_phase('a'*64,phase,{},registry)
            train.base.finish_claim(claim,'failed',dict(reason='fixture failure'))
            with self.assertRaisesRegex(ValueError,'claimed'):
                train.claim_phase('a'*64,phase,{},registry)
        with self.assertRaises(ValueError):train.claim_phase('a'*64,'test',{},registry)

    def test_exclusive_job_lease_blocks_another_controller_and_releases(self):
        lock=self.root/'job-lock'
        with train.exclusive_job(lock):
            with self.assertRaisesRegex(ValueError,'active'):
                with train.exclusive_job(lock): pass
        self.assertFalse(lock.exists())

    def test_resource_admission_enforces_twenty_gib_disk_and_three_gib_ram(self):
        supervisor=train.runtime.ResourceSupervisor(self.root,train.phase_limits())
        snap=dict(available_bytes=4*1024**3,rss_bytes=100*1024**2)
        from types import SimpleNamespace
        with patch.object(train.runtime,'native_snapshot',return_value=snap),patch.object(train.runtime.shutil,'disk_usage',return_value=SimpleNamespace(free=19*1024**3)):
            with self.assertRaisesRegex(train.runtime.RuntimeSafetyError,'free_disk'):supervisor.preflight()
        snap['available_bytes']=2*1024**3
        with patch.object(train.runtime,'native_snapshot',return_value=snap),patch.object(train.runtime.shutil,'disk_usage',return_value=SimpleNamespace(free=21*1024**3)):
            with self.assertRaisesRegex(train.runtime.RuntimeSafetyError,'available_memory'):supervisor.preflight()

    def test_hidden_workers_fail_without_supervision_and_cold_import_is_light(self):
        for command in ('_phase','_fit','_probe_phase','_probe_model'):
            result=subprocess.run([sys.executable,str(Path(train.__file__)),command,'--output',str(self.root)],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('ResourceSupervisor',result.stderr)
        result=subprocess.run([sys.executable,'-c',"import parcel_visible_train,sys; print(any(x in sys.modules for x in ('tensorflow','numpy','cv2')))"],cwd=Path(__file__).parent,capture_output=True,text=True,check=True)
        self.assertEqual(result.stdout.strip(),'False')


if __name__=='__main__': unittest.main()
