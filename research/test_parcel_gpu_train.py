"""Artificial metadata fixtures only: never import TensorFlow or read datasets."""
import copy
from contextlib import ExitStack,nullcontext
import json
import math
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock

import parcel_gpu_train as gpu

FIXTURES=Path(__file__).resolve().parents[1]/'outputs/parcel-gpu-setup-20261021/runner-fixtures'
FIXTURES.mkdir(parents=True,exist_ok=True)


def manifest():
    rows=[]
    for split,counts in [('train',(385,368)),('validation',(107,55))]:
        for label,count in zip(('Normal','Damaged'),counts):
            for index in range(count):
                sample=f'{split}-{label}-{index:04}'
                rows.append(dict(sample_id=sample,split=split,label=label,
                    dependency_group_id=sample,sha256='a'*64,pixel_sha256='b'*64,
                    width=224,height=224,path='research/datasets/fixture/'+sample+'.jpg'))
    return dict(rows=rows)


def timing(data=None):
    data=data or manifest()
    return dict(fit_id=gpu.FIT_IDS[0],state_unchanged=True,batch_size=4,
        train_sample_ids=[r['sample_id'] for r in gpu.fixed_probe_rows(data)],
        train_component_weights=gpu.probe_weights(data),
        gpu_execution=dict(forward_devices=['/device:GPU:0'],head_gradient_devices=['/device:GPU:0'],head_gradient_count=2),
        setup_seconds=1.,decode_seconds=.01,forward_seconds=.02,gradient_seconds=.03,
        save_load_seconds=.1,replicates=3,steady_forward_seconds=[.01,.02,.015],
        steady_gradient_seconds=[.02,.03,.025],steady_decode_seconds=[.005,.01,.006],
        cold_forward_seconds=.2,cold_gradient_seconds=.3,
        probe_kind=gpu.PROBE_KIND,optimizer_state_unchanged=True)


def logits_fixture(rows,scores):
    return [[math.log(p) for p in probability] for probability in scores],[-math.log(p[gpu.science.CLASS_ORDER.index(r['label'])]) for r,p in zip(rows,scores)]


def write_fit_fixture(target,fit_id,data,prepared):
    target.mkdir()
    rows=[r for r in data['rows'] if r['split']=='validation']
    scores=[[.8,.2] if row['label']=='Normal' else [.2,.8] for row in rows]
    metrics=gpu.validation_metrics(rows,scores);loss=metrics['component_weighted']['nll']
    logits,ce=logits_fixture(rows,scores);stable=gpu.stable_validation_loss(rows,scores,logits,ce)
    (target/'classifier.keras').write_bytes(b'artificial serialized-model fixture; not a model')
    history={'loss':[.5],'val_loss':[stable]};gpu.write_json(target/'history.json',history)
    _,_,diagnostic=gpu.finalize_fit_validation(target,prepared,fit_id,rows,history,scores,logits,ce,
        ['/device:GPU:0'],gpu.batch_sizes(len(rows)),189,True)
    architecture,contrast=fit_id.rsplit('-',1)
    result=dict(status='success',fit_id=fit_id,architecture=architecture,contrast=contrast,
        key=prepared['key'],binding_sha256=gpu.digest(prepared['binding']),validation_metrics=metrics,
        component_macro_f1=1.,component_nll=loss,best_epoch=1,min_val_loss=stable,
        checkpoint_component_stable_ce=stable,optimizer_iterations=189,expected_optimizer_iterations=189,
        scoring='compiled_validation_batch4_partial_v1',validation_batch_sizes=gpu.batch_sizes(len(rows)),
        validation_output_devices=['/device:GPU:0'],raw_predictions_from='reloaded_classifier.keras',
        artifact_sha256=gpu.sha256_file(target/'classifier.keras'),
        validation_predictions_sha256=gpu.sha256_file(target/'validation-predictions.json'),
        history_sha256=gpu.sha256_file(target/'history.json'),validation_diagnostic_sha256=gpu.sha256_file(target/'validation-diagnostic.json'))
    gpu.write_sealed(target/'fit.json',result)
    return result


class GPUProtocolTests(unittest.TestCase):
    def test_v4_stable_logits_ce_matches_training_quantity_without_legacy_clip(self):
        rows=[dict(sample_id='x',split='validation',dependency_group_id='g',label='Damaged')]
        p=math.exp(-25)/(1+math.exp(-25));probabilities=[[1-p,p]]
        stable=25+math.log1p(math.exp(-25))
        self.assertAlmostEqual(gpu.stable_validation_loss(rows,probabilities,[[0.,-25.]],[stable]),stable)
        legacy=gpu.validation_metrics(rows,probabilities)['component_weighted']['nll']
        self.assertAlmostEqual(legacy,-math.log(1e-7));self.assertGreater(stable-legacy,8)
        history={'loss':[stable],'val_loss':[stable]}
        self.assertEqual(gpu.restored_validation(history,stable)['best_epoch'],1)
        with self.assertRaises(ValueError):gpu.restored_validation(history,legacy)
        for logits,ce in [([[0.,-24.]],[stable]),([[0.,-25.]],[stable+1]),([[0.,-24.]],[24+math.log1p(math.exp(-24))])]:
            with self.assertRaises(ValueError):gpu.stable_validation_loss(rows,probabilities,logits,ce)
        self.assertAlmostEqual(gpu.stable_validation_loss(rows,[[.5,.5]],[[1e20,1e20]],[math.log(2)]),math.log(2))

    def test_v4_dataset_declares_exact_batched_cardinality(self):
        for size,expected in [(753,189),(162,41)]:
            dataset=mock.Mock();dataset.apply.return_value=dataset
            dataset.with_options.return_value=dataset;dataset.prefetch.return_value=dataset
            options=types.SimpleNamespace(threading=types.SimpleNamespace())
            tf=types.SimpleNamespace(data=types.SimpleNamespace(
                Dataset=types.SimpleNamespace(from_generator=mock.Mock(return_value=dataset)),Options=lambda:options,
                experimental=types.SimpleNamespace(assert_cardinality=mock.Mock(return_value='cardinality-transform'))),
                TensorSpec=lambda *args:args,float32='f32',int32='i32')
            with mock.patch.dict('sys.modules',numpy=types.SimpleNamespace(random=types.SimpleNamespace(default_rng=lambda seed:seed))):
                gpu.dataset([{}]*size,'clahe',{},False,tf)
            tf.data.experimental.assert_cardinality.assert_called_once_with(expected)
            dataset.apply.assert_called_once_with('cardinality-transform')

    def test_v4_validation_scoring_preserves_order_and_four_plus_two_batch_shape(self):
        rows=[dict(sample_id=str(i),split='validation',label='Normal' if i%2==0 else 'Damaged') for i in range(6)]
        observed=[]
        class Tensor:
            device='/device:GPU:0'
            def __init__(self,values):self.values=values
            def numpy(self):return types.SimpleNamespace(tolist=lambda:self.values)
        def model(images,training):
            self.assertFalse(training);observed.append(list(images))
            output=Tensor([[(i+1)/10,1-(i+1)/10] for i in images])
            output._keras_logits=Tensor([[math.log(p) for p in row] for row in output.values])
            return output
        compilations=[]
        def compile_function(**kwargs):compilations.append(kwargs);return lambda operation:operation
        tf=types.SimpleNamespace(function=compile_function,
            TensorSpec=lambda *args:args,float32='f32',int32='i32',convert_to_tensor=lambda value:value,
            keras=types.SimpleNamespace(losses=types.SimpleNamespace(sparse_categorical_crossentropy=
                lambda labels,output:Tensor([-math.log(p[label]) for label,p in zip(labels,output.values)]))))
        batches=[([0,1,2,3],[0,1,0,1],[1.]*4),([4,5],[0,1],[1.]*2)]
        with mock.patch.object(gpu,'batch_stream',return_value=iter(batches)):
            probabilities,logits,ce,devices,sizes=gpu.validation_probabilities(model,rows,'clahe',{},tf)
        self.assertEqual(observed,[[0,1,2,3],[4,5]])
        self.assertEqual(probabilities,[[(i+1)/10,1-(i+1)/10] for i in range(6)])
        self.assertEqual((devices,sizes),(['/device:GPU:0'],[4,2]))
        self.assertEqual(compilations[0]['input_signature'],[((None,224,224,3),'f32'),((None,),'i32')])
        self.assertFalse(compilations[0]['jit_compile'])
        with mock.patch.object(gpu,'batch_stream',return_value=iter(batches)):
            with self.assertRaisesRegex(ValueError,'Cached classifier logits'):
                gpu.validation_probabilities(lambda images,training:Tensor([[.5,.5] for _ in images]),rows,'clahe',{},tf)
        with mock.patch.object(Tensor,'device','/device:CPU:0'),mock.patch.object(gpu,'batch_stream',return_value=iter(batches)):
            with self.assertRaisesRegex(ValueError,'CPU fallback'):
                gpu.validation_probabilities(model,rows,'clahe',{},tf)
        batches[1]=([4,5],[1,0],[1.]*2)
        with mock.patch.object(gpu,'batch_stream',return_value=iter(batches)):
            with self.assertRaisesRegex(ValueError,'membership/order'):
                gpu.validation_probabilities(model,rows,'clahe',{},tf)

    def test_v4_failed_loss_guard_preserves_complete_diagnostics(self):
        data=manifest();rows=[r for r in data['rows'] if r['split']=='validation']
        probabilities=[[.8,.2] if row['label']=='Normal' else [.2,.8] for row in rows]
        logits,ce=logits_fixture(rows,probabilities)
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            target=Path(directory);(target/'classifier.keras').write_bytes(b'artificial model bytes')
            history={'loss':[.5],'val_loss':[.05]};gpu.write_json(target/'history.json',history)
            with self.assertRaisesRegex(ValueError,'best checkpoint'):
                gpu.finalize_fit_validation(target,{'key':'a'*64,'binding':{}},gpu.FIT_IDS[0],rows,history,
                    probabilities,logits,ce,['/device:GPU:0'],[4]*40+[2],189,True)
            self.assertEqual(gpu.transport._json(target/'history.json'),history)
            self.assertEqual(len(gpu.transport._json(target/'validation-predictions.json')),162)
            diagnostic=gpu.transport._json(target/'validation-diagnostic.json')
            self.assertEqual(diagnostic['optimizer_iterations'],189)
            self.assertGreater(diagnostic['raw_component_nll'],diagnostic['minimum_val_loss'])
            self.assertFalse((target/'fit.json').exists())

    def test_v4_optimizer_extra_attempt_is_rejected_after_diagnostic_saved(self):
        data=manifest();rows=[r for r in data['rows'] if r['split']=='validation']
        probabilities=[[.8,.2] if row['label']=='Normal' else [.2,.8] for row in rows]
        logits,ce=logits_fixture(rows,probabilities)
        nll=gpu.validation_metrics(rows,probabilities)['component_weighted']['nll']
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            target=Path(directory);(target/'classifier.keras').write_bytes(b'artificial model bytes')
            history={'loss':[.5]*5,'val_loss':[nll]*5};gpu.write_json(target/'history.json',history)
            with self.assertRaisesRegex(ValueError,'optimizer iteration'):
                gpu.finalize_fit_validation(target,{'key':'a'*64,'binding':{}},gpu.FIT_IDS[0],rows,history,
                    probabilities,logits,ce,['/device:GPU:0'],[4]*40+[2],950,True)
            diagnostic=gpu.transport._json(target/'validation-diagnostic.json')
            self.assertEqual((diagnostic['optimizer_iterations'],diagnostic['expected_optimizer_iterations']),(950,945))
            self.assertFalse((target/'fit.json').exists())

    def fake_prepare(self,directory):
        root=Path(directory);incoming=root/'transport.json';incoming.write_text('{}',encoding='utf-8')
        check=root/'check.json';check.write_text('{}',encoding='utf-8')
        helper=root/'helper.sh';helper.write_text('fixture',encoding='utf-8')
        loaded={'manifest':manifest(),'settings':{'fixed':'original'},'resolved':{}}
        env={'nvidia':dict(name='fixture',uuid='fixture',driver_version='1',total_mib=4096)}
        stack=ExitStack()
        stack.enter_context(mock.patch.object(gpu.fast_transport,'load_transport',return_value=loaded))
        stack.enter_context(mock.patch.object(gpu.transport,'_git_check'))
        stack.enter_context(mock.patch.object(gpu,'environment',return_value=env))
        stack.enter_context(mock.patch.object(gpu,'verify_gpu_check',return_value=env))
        stack.enter_context(mock.patch.object(gpu,'code_bindings',return_value={'fixture.py':'a'*64}))
        stack.enter_context(mock.patch.object(gpu,'GPU_CHECK',check))
        stack.enter_context(mock.patch.object(gpu,'HELPER',helper))
        return stack,incoming,root/'prepared',loaded

    def test_distinct_prospective_fixed_profile(self):
        settings=gpu.gpu_protocol()
        self.assertEqual(settings['fit_ids'],['mobilenetv2-clahe','efficientnetb0-none'])
        self.assertNotEqual(gpu.PROFILE,'parcel_visible_development')
        self.assertFalse(settings['operationally_approved'])
        self.assertEqual(settings['gpu_allocator_mib'],2048)
        self.assertFalse(settings['soft_device_placement'])
        self.assertFalse(settings['jit_compile'])
        self.assertEqual(settings['max_output_bytes'],{'probe':128*gpu.MiB,'develop':512*gpu.MiB})

    def test_v4_cache_profile_keeps_unchanged_memory_gpu_and_scientific_caps(self):
        settings=gpu.gpu_protocol()
        self.assertEqual(gpu.PROFILE,'parcel_visible_gpu_development_v4')
        self.assertEqual(settings['resource_profile'],'parcel_gpu_memory_v3')
        self.assertEqual(settings['root_cache_policy'],'fixed_root_linux_cache_once_v1')
        self.assertEqual(settings['root_cache_attempts'],1)
        self.assertEqual(settings['root_cache_precondition'],'before_admission_no_registered_gpu_units')
        self.assertEqual(settings['root_cache_timeout_seconds'],10)
        self.assertEqual(settings['root_cache_required_phase_seconds'],10)
        self.assertEqual(settings['max_rss_bytes'],4096*gpu.MiB)
        self.assertEqual(settings['memory_limit_bytes'],4096*gpu.MiB)
        self.assertEqual(settings['admission_memory_bytes'],6144*gpu.MiB)
        self.assertEqual(settings['live_memory_floor_bytes'],2048*gpu.MiB)
        self.assertEqual((settings['gpu_allocator_mib'],settings['probe_seconds'],settings['fit_seconds'],settings['phase_seconds']),
                         (2048,180,3000,6300))
        self.assertEqual((settings['seed'],settings['batch_size'],settings['epochs'],settings['patience']),
                         (42,4,10,3))
        key=gpu.experiment_identity({'same':'metadata'})
        with mock.patch.object(gpu,'PROFILE','parcel_visible_gpu_development_v3'):
            self.assertNotEqual(key,gpu.experiment_identity({'same':'metadata'}))

    def test_v2_native_aggregate_peak_above_old_cap_but_below_four_gib(self):
        native=types.SimpleNamespace(validate_native_result=mock.Mock())
        record=dict(status='success',returncode=0,elapsed_seconds=1.,peak_rss_bytes=3072*gpu.MiB)
        with mock.patch.dict('sys.modules',parcel_gpu_runtime=native):
            gpu.validate_native(record,180)
            record['peak_rss_bytes']=4096*gpu.MiB+1
            with self.assertRaisesRegex(ValueError,'resource proof'):gpu.validate_native(record,180)

    def test_startup_activation_is_exact_without_importing_opencv(self):
        startup='/gpu/cuda/lib:/usr/lib/wsl/lib'
        with mock.patch.object(gpu,'STARTUP_ACTIVATION_LIBRARIES',startup),\
             mock.patch.dict('os.environ',LD_LIBRARY_PATH=startup),\
             mock.patch.object(gpu.importlib.metadata,'distribution') as metadata:
            self.assertEqual(gpu.activation_libraries(),startup)
            metadata.assert_not_called()

    def test_only_one_exact_pinned_loaded_cv2_prefix_is_accepted(self):
        startup='/gpu/cuda/lib:/usr/lib/wsl/lib';origin=Path('C:/fixture/site-packages/cv2/__init__.py').absolute()
        prefix=str(origin.parent/'../../lib64')+':'
        distribution=types.SimpleNamespace(version=gpu.CORE_PACKAGES['opencv-python-headless'],locate_file=lambda name:origin)
        loaded=types.SimpleNamespace(__file__=str(origin),__spec__=types.SimpleNamespace(origin=str(origin)))
        with mock.patch.object(gpu,'STARTUP_ACTIVATION_LIBRARIES',startup),\
             mock.patch.object(gpu.importlib.metadata,'distribution',return_value=distribution):
            with mock.patch.dict('os.environ',LD_LIBRARY_PATH=prefix+startup),\
                 mock.patch.dict('sys.modules',cv2=loaded):
                self.assertEqual(gpu.activation_libraries(),startup)
            cases=[(prefix+prefix+startup,loaded),(prefix+startup+':/foreign',loaded),
                   ('/foreign:'+startup,loaded),(prefix+'/usr/lib/wsl/lib:/gpu/cuda/lib',loaded),
                   (prefix+startup,None),
                   (prefix+startup,types.SimpleNamespace(__file__='foreign',__spec__=loaded.__spec__)),
                   (prefix+startup,types.SimpleNamespace(__file__=str(origin),__spec__=types.SimpleNamespace(origin='foreign')))]
            for live,module in cases:
                with self.subTest(live=live,module=module),\
                     mock.patch.dict('os.environ',LD_LIBRARY_PATH=live),\
                     mock.patch.dict('sys.modules',cv2=module):
                    with self.assertRaisesRegex(ValueError,'activation'):gpu.activation_libraries()
            distribution.version='changed'
            with mock.patch.dict('os.environ',LD_LIBRARY_PATH=prefix+startup),mock.patch.dict('sys.modules',cv2=loaded):
                with self.assertRaisesRegex(ValueError,'activation'):gpu.activation_libraries()

    def test_environment_identity_survives_only_verified_cv2_bootstrap_mutation(self):
        startup='/gpu/cuda/lib:/usr/lib/wsl/lib';site=Path('C:/fixture/site-packages').absolute()
        def distribution(name,version):
            return types.SimpleNamespace(metadata={'Name':name},version=version,
                files=[name+'.dist-info/METADATA',name+'.dist-info/RECORD'],
                locate_file=lambda name:site/name)
        packages=[distribution(name,version) for name,version in {**gpu.CORE_PACKAGES,'nvidia-fixture':'1'}.items()]
        opencv=next(row for row in packages if row.metadata['Name']=='opencv-python-headless')
        origin=site/'cv2/__init__.py';prefix=str(origin.parent/'../../lib64')+':'
        loaded=types.SimpleNamespace(__file__=str(origin),__spec__=types.SimpleNamespace(origin=str(origin)))
        with mock.patch.object(gpu,'STARTUP_ACTIVATION_LIBRARIES',startup),\
             mock.patch.object(gpu.sys,'version_info',(3,12,3)),\
             mock.patch.object(gpu.platform,'system',return_value='Linux'),\
             mock.patch.object(gpu.importlib.metadata,'distributions',return_value=packages),\
             mock.patch.object(gpu.importlib.metadata,'distribution',return_value=opencv),\
             mock.patch.object(gpu,'sha256_file',return_value='a'*64),\
             mock.patch.object(gpu.subprocess,'run',return_value=types.SimpleNamespace(returncode=0,stdout='Fixture GPU, uuid, 1, 4096\n')):
            with mock.patch.dict('os.environ',LD_LIBRARY_PATH=startup):before=gpu.environment()
            with mock.patch.dict('os.environ',LD_LIBRARY_PATH=prefix+startup),mock.patch.dict('sys.modules',cv2=loaded):
                after=gpu.environment()
            self.assertEqual(before,after)
            self.assertEqual(after['activation_libraries'],startup)

    def test_exact_membership_and_split(self):
        data=manifest();gpu.validate_cohort(data)
        for amend in ('test','relabel','drop','group'):
            changed=copy.deepcopy(data)
            if amend=='test':changed['rows'][0]['split']='test'
            elif amend=='relabel':changed['rows'][0]['label']='Damaged'
            elif amend=='drop':changed['rows'].pop()
            else:changed['rows'][-1]['dependency_group_id']=changed['rows'][0]['dependency_group_id']
            with self.assertRaises(ValueError):gpu.validate_cohort(changed)

    def test_probe_max_and_correct_formula(self):
        data=manifest();record=timing(data)
        projected=gpu.project_probe(record,data)
        expected=1+2*(10*(189*(.01+.03)+41*(.01+.02)+.1)+.1)
        self.assertAlmostEqual(projected['fit_seconds'],expected)
        record['gradient_seconds']=.02
        with self.assertRaisesRegex(ValueError,'MAX'):gpu.project_probe(record,data)

    def test_probe_no_updates_training_only_three_replicates(self):
        for key,value in [('state_unchanged',False),('optimizer_state_unchanged',False),
                          ('replicates',2),('train_sample_ids',['test'])]:
            record=timing();record[key]=value
            with self.assertRaises(ValueError):gpu.project_probe(record,manifest())

    def test_overbudget_probe_still_saved(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            record=timing();record['gradient_seconds']=10.
            record['steady_gradient_seconds']=[10.]*3
            prepared={'key':'a'*64,'binding':{}}
            with self.assertRaisesRegex(ValueError,'cap'):
                gpu.finalize_probe(Path(directory),record,manifest(),prepared)
            self.assertTrue((Path(directory)/'probe-attempt.json').is_file())
            self.assertFalse((Path(directory)/'probe-model.json').exists())

    def test_claim_once_and_separate_registry(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            registry=Path(directory)
            gpu.claim_phase('a'*64,'probe',{},registry=registry)
            with self.assertRaisesRegex(ValueError,'retry'):
                gpu.claim_phase('a'*64,'probe',{},registry=registry)
            self.assertIn('gpu',str(gpu.REGISTRY))

    def test_native_failure_never_succeeds(self):
        good=dict(status='success',returncode=0,elapsed_seconds=1.,peak_rss_bytes=10)
        native=types.SimpleNamespace(validate_native_result=mock.Mock())
        with mock.patch.dict('sys.modules',parcel_gpu_runtime=native):
            gpu.validate_native(good,180)
            native.validate_native_result.assert_called_once_with(good,180)
            for key,value in [('status','failed'),('returncode',1),('elapsed_seconds',181.),
                              ('peak_rss_bytes',4096*gpu.MiB+1)]:
                changed=dict(good);changed[key]=value
                with self.assertRaises(ValueError):gpu.validate_native(changed,180)

    def test_native_exact_properties_required_by_runtime(self):
        native=types.SimpleNamespace(validate_native_result=mock.Mock(side_effect=ValueError('cgroup proof missing')))
        with mock.patch.dict('sys.modules',parcel_gpu_runtime=native):
            with self.assertRaisesRegex(ValueError,'cgroup'):
                gpu.validate_native(dict(status='success',returncode=0,elapsed_seconds=1.,peak_rss_bytes=10),180)

    def test_gpu_missing_fails_without_cpu_fallback(self):
        config=mock.Mock();config.list_physical_devices.return_value=[]
        with self.assertRaisesRegex(ValueError,'CPU fallback'):
            gpu.configure_gpu(types.SimpleNamespace(config=config))
        config.list_logical_devices.assert_not_called()

    def test_model_outputs_and_gradients_cannot_fallback_to_cpu(self):
        for device in ('/device:CPU:0','/device:GPU:1',None):
            with self.assertRaisesRegex(ValueError,'CPU fallback'):
                gpu.require_gpu_tensor(types.SimpleNamespace(device=device))
        self.assertEqual(gpu.require_gpu_tensor(types.SimpleNamespace(device='/device:GPU:0')),'/device:GPU:0')
        record=timing();record['gpu_execution']['head_gradient_devices']=['/device:CPU:0']
        with self.assertRaisesRegex(ValueError,'head gradients'):gpu.project_probe(record,manifest())

    def test_compiled_probe_accepts_full_and_partial_batches_without_new_signature(self):
        calls=[]
        def function(**kwargs):
            calls.append(kwargs)
            return lambda operation:operation
        fake=types.SimpleNamespace(function=function,TensorSpec=lambda shape,dtype:(shape,dtype),
                                   float32='float32',int32='int32')
        gpu.compiled_probe_functions(fake,None)
        self.assertEqual([c['input_signature'] for c in calls],[
            [((None,224,224,3),'float32')],
            [((None,224,224,3),'float32'),((None,),'int32'),((None,),'float32')]])
        self.assertEqual([c['jit_compile'] for c in calls],[False,False])

    def test_worker_proof_precedes_tensorflow_or_file_access(self):
        native=types.SimpleNamespace(require_worker=mock.Mock(side_effect=ValueError('native envelope')))
        with mock.patch.dict('sys.modules',parcel_gpu_runtime=native),mock.patch.object(gpu,'read_sealed') as read:
            with self.assertRaisesRegex(ValueError,'native envelope'):
                gpu._leaf_setup(Path('unused'),gpu.FIT_IDS[0],'probe')
            read.assert_not_called()

    def test_outputs_guard_and_escape(self):
        self.assertEqual(gpu.output_path(FIXTURES),FIXTURES)
        with self.assertRaises(ValueError):gpu.output_path(gpu.ROOT/'../elsewhere')
        with self.assertRaises(ValueError):gpu.output_path(gpu.ROOT/'src/fixture')

    def test_probe_validation_rows_cannot_replace_training_batch(self):
        record=timing();record['train_sample_ids']=[r['sample_id'] for r in manifest()['rows'][-4:]]
        with self.assertRaisesRegex(ValueError,'membership'):gpu.project_probe(record,manifest())

    def test_cold_trace_must_be_positive(self):
        record=timing();record['cold_gradient_seconds']=0
        with self.assertRaisesRegex(ValueError,'Cold'):gpu.project_probe(record,manifest())

    def test_probe_maps_full_train_component_weights_without_subset_renormalizing(self):
        data=manifest();train=[r for r in data['rows'] if r['split']=='train']
        # Make a conservative three-view component among the fixed first rows.
        fixed=gpu.fixed_probe_rows(data)
        for row in fixed[:3]:row['dependency_group_id']='shared-fixed-group'
        lookup={r['sample_id']:w for r,w in zip(train,gpu.component_weights(train))}
        self.assertEqual(gpu.probe_weights(data),[lookup[r['sample_id']] for r in fixed])
        self.assertNotEqual(gpu.probe_weights(data),gpu.component_weights(fixed))
        record=timing(data);record['train_component_weights']=gpu.component_weights(fixed)
        with self.assertRaisesRegex(ValueError,'full-TRAIN'):gpu.project_probe(record,data)

    def test_fixtures_do_not_import_ml_libraries(self):
        import sys
        self.assertFalse(set(('tensorflow','numpy','cv2'))&set(sys.modules))

    def test_claim_key_and_phase_validation(self):
        for key,phase in [('a'*63,'probe'),('A'*64,'probe'),('a'*64,'test')]:
            with self.assertRaises(ValueError):gpu.claim_phase(key,phase,{})

    def test_no_test_read_even_with_resolved_path(self):
        row=dict(split='test',sample_id='sealed')
        with self.assertRaisesRegex(ValueError,'Forbidden image partition'):
            gpu.read_image(row,{'resolved':{'images':{'sealed':'unused'}}},allowed=('test',))

    def test_native_receipt_requires_complete_artifacts(self):
        with self.assertRaisesRegex(ValueError,'Incomplete native'):
            gpu.verify_native_files(Path('unused'),{'native-result.json':'a'*64},180)

    def test_native_armed_request_and_phase_quota_are_bound(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            root=Path(directory);target=root/gpu.FIT_IDS[0];target.mkdir()
            request=dict(command=gpu.worker_command('probe',root,gpu.FIT_IDS[0]),
                         max_output_bytes=128*gpu.MiB,output_tree=str(root))
            gpu.write_json(target/'request.json',request)
            request_sha=gpu.sha256_file(target/'request.json')
            gpu.write_json(target/'worker-envelope.json',{'request_sha256':request_sha})
            gpu.write_json(target/'worker-terminal.json',{'returncode':0})
            result=dict(worker_envelope_sha256=gpu.sha256_file(target/'worker-envelope.json'),
                        worker_terminal_sha256=gpu.sha256_file(target/'worker-terminal.json'),
                        request_sha256=request_sha,max_output_bytes=128*gpu.MiB,output_tree=str(root))
            gpu.write_json(target/'native-result.json',result)
            records=gpu.native_bindings(target)
            with mock.patch.object(gpu,'validate_native'):
                gpu.verify_native_files(target,records,180)
                result['max_output_bytes']=512*gpu.MiB
                (target/'native-result.json').write_text(json.dumps(result),encoding='utf-8')
                records['native-result.json']=gpu.sha256_file(target/'native-result.json')
                with self.assertRaisesRegex(ValueError,'quota'):gpu.verify_native_files(target,records,180)

    def test_all_runtime_resource_source_is_bound(self):
        self.assertIn('parcel_gpu_check.py',gpu.CODE_FILES)
        self.assertIn('parcel_gpu_runtime.py',gpu.CODE_FILES)

    def test_fast_full_verification_loader_is_bound_and_never_falls_back(self):
        self.assertIn('parcel_gpu_data_fast.py',gpu.CODE_FILES)
        with mock.patch.object(gpu.fast_transport,'load_transport',side_effect=ValueError('full asset verification failed')),\
             mock.patch.object(gpu.transport,'load_transport') as old_loader:
            with self.assertRaisesRegex(ValueError,'full asset verification'):
                gpu.prepare(Path('unused'),Path('unused'))
            old_loader.assert_not_called()
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            stack,incoming,out,_=self.fake_prepare(directory)
            with stack:
                prepared=gpu.prepare(incoming,out)
                with mock.patch.object(gpu.fast_transport,'load_transport',side_effect=ValueError('full asset verification failed')),\
                     mock.patch.object(gpu.transport,'load_transport') as old_loader:
                    with self.assertRaisesRegex(ValueError,'full asset verification'):
                        gpu.read_prepared(prepared)
                    old_loader.assert_not_called()

    def test_prepare_is_metadata_only_and_rejects_binding_drift(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            stack,incoming,out,_=self.fake_prepare(directory)
            with stack,mock.patch.object(gpu,'read_image',side_effect=AssertionError('must not decode')):
                prepared_path=gpu.prepare(incoming,out)
                prepared=gpu.read_prepared(prepared_path)
                self.assertEqual(prepared['binding']['execution'],gpu.gpu_protocol())
                with mock.patch.object(gpu,'code_bindings',return_value={'fixture.py':'b'*64}):
                    with self.assertRaisesRegex(ValueError,'source code'):gpu.read_prepared(prepared_path)
                with mock.patch.object(gpu,'environment',return_value={'changed':True}):
                    with self.assertRaisesRegex(ValueError,'environment'):gpu.read_prepared(prepared_path)
                incoming.write_text('{"changed":true}',encoding='utf-8')
                with self.assertRaisesRegex(ValueError,'bound transport'):gpu.read_prepared(prepared_path)

    def test_original_membership_and_settings_binding(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            stack,incoming,out,loaded=self.fake_prepare(directory)
            with stack:
                prepared_path=gpu.prepare(incoming,out)
                loaded['settings']['fixed']='amended'
                with self.assertRaisesRegex(ValueError,'original protocol'):gpu.read_prepared(prepared_path)

    def test_failure_claim_persisted_without_automatic_second_job(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            root=Path(directory);prepared={'key':'a'*64,'binding':{}}
            native=types.SimpleNamespace(run_worker=mock.Mock(return_value={'status':'failed','returncode':1}))
            with mock.patch.dict('sys.modules',parcel_gpu_runtime=native),\
                 mock.patch.object(gpu,'read_prepared',return_value=prepared),\
                 mock.patch.object(gpu,'verify_binding',return_value={'manifest':manifest()}),\
                 mock.patch.object(gpu,'exclusive_job',return_value=nullcontext()),\
                 mock.patch.object(gpu.time,'monotonic',return_value=100.),\
                 mock.patch.object(gpu,'REGISTRY',root/'registry'),\
                 mock.patch.object(gpu.transport,'_git_check'):
                with self.assertRaisesRegex(ValueError,'Native worker failed'):
                    gpu.probe(root/'unused',root/'attempt1')
                self.assertEqual(native.run_worker.call_count,1)
                self.assertEqual(native.run_worker.call_args.kwargs['phase_deadline_monotonic'],280.)
                self.assertEqual(native.run_worker.call_args.args[3],180)
                self.assertEqual(native.run_worker.call_args.kwargs['max_output_bytes'],128*gpu.MiB)
                self.assertTrue((root/'registry'/('probe-'+'a'*64)/'failed.json').is_file())
                with self.assertRaisesRegex(ValueError,'retry'):gpu.probe(root/'unused',root/'attempt2')
                self.assertEqual(native.run_worker.call_count,1)

    def test_unconfirmed_native_cleanup_retains_shared_cpu_and_gpu_locks(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            root=Path(directory);native=types.SimpleNamespace(REGISTRY=root/'native')
            with mock.patch.dict('sys.modules',parcel_gpu_runtime=native),\
                 mock.patch.object(gpu,'REGISTRY',root/'gpu'),\
                 mock.patch.object(gpu.science,'REGISTRY',root/'cpu'):
                with gpu.exclusive_job() as guard:guard['retain']=True
                for label in ('gpu','cpu'):
                    self.assertTrue((root/label/'active-job/cleanup-unconfirmed.json').is_file())
                with self.assertRaisesRegex(ValueError,'stale'):
                    with gpu.exclusive_job():pass

    def test_native_lease_retains_locks_even_on_controller_exception(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            root=Path(directory);native=types.SimpleNamespace(REGISTRY=root/'native')
            with mock.patch.dict('sys.modules',parcel_gpu_runtime=native),\
                 mock.patch.object(gpu,'REGISTRY',root/'gpu'),\
                 mock.patch.object(gpu.science,'REGISTRY',root/'cpu'):
                with self.assertRaisesRegex(ValueError,'fixture failure'):
                    with gpu.exclusive_job():
                        (root/'native/active-runtime').mkdir(parents=True)
                        raise ValueError('fixture failure')
                self.assertTrue((root/'gpu/active-job').is_dir())
                self.assertTrue((root/'cpu/active-job').is_dir())

    def test_clean_controller_error_releases_shared_locks(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            root=Path(directory);native=types.SimpleNamespace(REGISTRY=root/'native')
            with mock.patch.dict('sys.modules',parcel_gpu_runtime=native),\
                 mock.patch.object(gpu,'REGISTRY',root/'gpu'),\
                 mock.patch.object(gpu.science,'REGISTRY',root/'cpu'):
                with self.assertRaisesRegex(ValueError,'fixture failure'):
                    with gpu.exclusive_job():raise ValueError('fixture failure')
                self.assertFalse((root/'gpu/active-job').exists())
                self.assertFalse((root/'cpu/active-job').exists())

    def test_second_worker_cannot_change_first_artifact_before_comparison(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            root=Path(directory);prepared={'key':'a'*64,'binding':{}};data=manifest();out=root/'develop'
            (root/'probe.json').write_text('{}',encoding='utf-8')
            def worker(command,target,unit,cap,**kwargs):
                fit_id=command[-1];write_fit_fixture(target,fit_id,data,prepared)
                if fit_id==gpu.FIT_IDS[1]:(out/gpu.FIT_IDS[0]/'classifier.keras').write_bytes(b'fixture tamper during second worker')
                return dict(status='success',cleanup={'status':'clean'})
            native=types.SimpleNamespace(run_worker=mock.Mock(side_effect=worker))
            with mock.patch.dict('sys.modules',parcel_gpu_runtime=native),\
                 mock.patch.object(gpu,'read_prepared',return_value=prepared),\
                 mock.patch.object(gpu,'verify_binding',return_value={'manifest':data}),\
                 mock.patch.object(gpu,'verify_probe'),mock.patch.object(gpu,'validate_native'),\
                 mock.patch.object(gpu,'verify_native_files'),mock.patch.object(gpu,'native_bindings',return_value={}),\
                 mock.patch.object(gpu,'exclusive_job',return_value=nullcontext({'retain':False})),\
                 mock.patch.object(gpu,'REGISTRY',root/'registry'),\
                 mock.patch.object(gpu.transport,'_git_check'):
                with self.assertRaisesRegex(ValueError,'Changed fit artifact'):
                    gpu.develop(root/'prepared.json',root/'probe.json',out)
                self.assertEqual(native.run_worker.call_count,2)
                self.assertFalse((out/'comparison.json').exists())

    def test_raw_artifact_hash_tampering_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=FIXTURES) as directory:
            root=Path(directory);target=root/gpu.FIT_IDS[0];target.mkdir()
            result={'fit_id':gpu.FIT_IDS[0]}
            for filename,key in [('classifier.keras','artifact_sha256'),('validation-predictions.json','validation_predictions_sha256'),('history.json','history_sha256')]:
                (target/filename).write_text('{}',encoding='utf-8');result[key]=gpu.sha256_file(target/filename)
            (target/'classifier.keras').write_text('tampered artificial bytes',encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'Changed fit artifact'):
                gpu.verify_fit_result(root,{'key':'a'*64,'binding':{}},result,{'manifest':manifest()})

    def test_partial_fit_and_order_are_rejected(self):
        rows=[dict(status='success',fit_id=f,architecture=f.rsplit('-',1)[0],
                   contrast=f.rsplit('-',1)[1],component_macro_f1=.5,component_nll=.6)
              for f in gpu.FIT_IDS]
        self.assertEqual(gpu.compare_fits(rows)['fit_id'],gpu.FIT_IDS[0])
        for changed in (rows[:1],rows[::-1]):
            with self.assertRaises(ValueError):gpu.compare_fits(changed)

    def test_raw_artifacts_restore_best_and_provenance(self):
        data=manifest();rows=[r for r in data['rows'] if r['split']=='validation']
        scores=[[.8,.2] if r['label']=='Normal' else [.2,.8] for r in rows]
        metrics=gpu.validation_metrics(rows,scores)
        loss=metrics['component_weighted']['nll']
        logits,ce=logits_fixture(rows,scores);stable=gpu.stable_validation_loss(rows,scores,logits,ce)
        raw=[dict(sample_id=r['sample_id'],label=r['label'],dependency_group_id=r['dependency_group_id'],
                  sha256=r['sha256'],pixel_sha256=r['pixel_sha256'],component_weight=1.,probabilities=p,logits=z,keras_sparse_ce=c)
             for r,p,z,c in zip(rows,scores,logits,ce)]
        result=dict(key='a'*64,binding_sha256=gpu.digest({}),fit_id=gpu.FIT_IDS[0],
            validation_metrics=metrics,component_macro_f1=1.,component_nll=loss,
            best_epoch=2,min_val_loss=stable,raw_predictions_from='reloaded_classifier.keras',
            checkpoint_component_stable_ce=stable,optimizer_iterations=378,expected_optimizer_iterations=378,
            scoring='compiled_validation_batch4_partial_v1',validation_batch_sizes=gpu.batch_sizes(len(rows)),
            validation_output_devices=['/device:GPU:0'])
        history={'loss':[.7,.4],'val_loss':[.5,stable]}
        gpu.validate_raw_result(result,raw,history,data,{'key':'a'*64,'binding':{}})
        raw[0]['sha256']='c'*64
        with self.assertRaisesRegex(ValueError,'membership'):gpu.validate_raw_result(result,raw,history,data,{'key':'a'*64,'binding':{}})

    def test_best_checkpoint_is_required(self):
        with self.assertRaisesRegex(ValueError,'best checkpoint'):
            gpu.restored_validation({'loss':[.5,.4],'val_loss':[.3,.4]},.4)


if __name__=='__main__':unittest.main()
