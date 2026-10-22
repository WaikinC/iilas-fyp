"""Artificial closed-adapter fixtures; no TensorFlow, model assets or native jobs."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

if importlib.util.find_spec('parcel_gpu_serving'):
    import parcel_gpu_serving as serving
else:
    serving=None


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(serving,'Closed GPU serving adapter missing')
        base=Path(__file__).parent/'datasets/parcel-gpu-serving-fixtures';base.mkdir(parents=True,exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=base);self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.patch=patch.object(serving,'ROOT',self.root);self.patch.start();self.addCleanup(self.patch.stop)
        self.artifact=self.root/serving.MODEL_PATH;self.artifact.parent.mkdir(parents=True);self.artifact.write_bytes(b'artificial model fixture')
        self.model_sha=hashlib.sha256(self.artifact.read_bytes()).hexdigest()
        self.model_patch=patch.object(serving,'MODEL_SHA',self.model_sha);self.model_patch.start();self.addCleanup(self.model_patch.stop)
        self.code_patch=patch.object(serving,'current_code',return_value={'parcel_gpu_serving.py':'c'*64,'parcel_inputs.py':'d'*64})
        self.code_patch.start();self.addCleanup(self.code_patch.stop)
        self.projection=dict(model=dict(name='MobileNetV2',fit_id='mobilenetv2-clahe',artifact=dict(repo_path=serving.MODEL_PATH,
            sha256=self.model_sha),optimizer_iterations=945,model_variable_count=263,optimizer_variable_count=6),
            contract=serving.contract(),evaluation_sha256=serving.REPORT_SHA,code=serving.current_code(),environment=serving.environment(),
            provenance_amendment=copy.deepcopy(serving.AMENDMENT))
        self.receipt=dict(schema_version=2,kind='parcel_gpu_serving_offline_audit_v2',status='verified_complete',core_sha256='a'*64,
            projection=self.projection,role_catalog_sha256='b'*64,verified=dict(development=True,source_evaluation=True,windows_compatibility=True),
            operationally_approved=False)
        self.receipt_path=self.root/'research/datasets/serving/receipt.json'
        self.receipt_sha=self.write(self.receipt_path,self.receipt)
        self.descriptor=dict(schema_version=2,kind='parcel_gpu_serving_descriptor_v2',core_sha256='a'*64,projection=self.projection,
            offline_audit=dict(repo_path=self.receipt_path.relative_to(self.root).as_posix(),sha256=self.receipt_sha))
        self.descriptor_path=self.root/'research/datasets/serving/descriptor.json'
        self.descriptor_sha=self.write(self.descriptor_path,self.descriptor)

    def write(self,path,value):
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,sort_keys=True),encoding='utf-8')
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def test_compact_descriptor_uses_external_pin_without_research_traversal(self):
        result=serving.validate_descriptor(self.descriptor_path,self.descriptor_sha)
        self.assertEqual(result['modelVersion'],self.model_sha)
        self.assertEqual(result['selection_sha256'],self.descriptor_sha)
        with patch.object(serving,'audit_core',side_effect=AssertionError('Research traversal forbidden')):
            self.assertEqual(serving.audit_descriptor(self.descriptor_path,self.descriptor_sha)['status'],'artifact_ready')
        with self.assertRaises(ValueError):serving.validate_descriptor(self.descriptor_path,'0'*64)

    def test_v1_descriptor_cannot_be_called_current_transport_readiness(self):
        value=copy.deepcopy(self.descriptor);value['schema_version']=1;value['kind']='parcel_gpu_serving_descriptor_v1'
        with self.assertRaises(ValueError):
            serving.validate_descriptor(self.descriptor_path,self.write(self.descriptor_path,value))

    def test_controller_bindings_need_current_pins_but_never_read_model_or_research(self):
        self.assertTrue(callable(getattr(serving,'descriptor_bindings',None)),'Compact GPU binding reader missing')
        self.artifact.unlink()
        with patch.object(serving,'audit_core',side_effect=AssertionError('Research traversal forbidden')):
            result=serving.descriptor_bindings(self.descriptor_path,self.descriptor_sha)
        self.assertEqual(result,dict(modelVersion=self.model_sha,selectionSha256=self.descriptor_sha,
            evaluationSha256='b4f6727ce08630f8289b572e6a9d4ab71d730aff102250aa4af505bc27252fcc'))
        with self.assertRaises((ValueError,OSError)):serving.validate_descriptor(self.descriptor_path,self.descriptor_sha)
        with patch.object(serving,'current_code',return_value={}):
            with self.assertRaises(ValueError):serving.descriptor_bindings(self.descriptor_path,self.descriptor_sha)

    def test_resealed_receipt_cannot_change_core_or_projection(self):
        for change in ('core','model','verified','approval'):
            receipt=copy.deepcopy(self.receipt)
            if change=='core':receipt['core_sha256']='e'*64
            elif change=='model':receipt['projection']['model']['optimizer_iterations']=946
            elif change=='verified':receipt['verified']['source_evaluation']=False
            else:receipt['operationally_approved']=True
            descriptor=copy.deepcopy(self.descriptor);descriptor['offline_audit']['sha256']=self.write(self.receipt_path,receipt)
            pin=self.write(self.descriptor_path,descriptor)
            with self.subTest(change=change),self.assertRaises(ValueError):serving.validate_descriptor(self.descriptor_path,pin)

    def test_no_descriptor_field_can_approve_photo_or_live(self):
        for field,value in [('operationally_approved',True),('acceptance_sha256','f'*64),('intended_use','sampled-live')]:
            descriptor=copy.deepcopy(self.descriptor);descriptor['projection']['contract'][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                serving.validate_descriptor(self.descriptor_path,self.write(self.descriptor_path,descriptor))

    def test_code_environment_and_model_drift_fail_closed(self):
        for kind in ('code','environment','artifact'):
            with self.subTest(kind=kind):
                if kind=='code':
                    with patch.object(serving,'current_code',return_value={}):
                        with self.assertRaises(ValueError):serving.validate_descriptor(self.descriptor_path,self.descriptor_sha)
                elif kind=='environment':
                    with patch.object(serving,'environment',return_value={}):
                        with self.assertRaises(ValueError):serving.validate_descriptor(self.descriptor_path,self.descriptor_sha)
                else:
                    self.artifact.write_bytes(b'changed')
                    with self.assertRaises(ValueError):serving.validate_descriptor(self.descriptor_path,self.descriptor_sha)

    def test_safe_audit_does_not_leak_private_paths(self):
        result=serving.audit_descriptor(self.root/'private-secret-path.json','a'*64)
        self.assertEqual(result,dict(status='unavailable',operationally_approved=False,reason='Parcel artifacts unavailable'))

    def historical_fixture(self):
        """Controlled source snapshots; no actual historical artifacts are read."""
        source_names=('parcel_gpu_serving.py','parcel_inputs.py','parcel_models.py','parcel_train.py','runner_runtime.py',
            'parcel_runtime.py','parcel_windows_valid_compat.py','parcel_source_test_evaluate.py','parcel_gpu_train.py',
            'parcel_gpu_runtime.py','parcel_source_test_audit.py','parcel_gpu_data.py')
        rows=[]
        for original in ['research/'+name for name in source_names]+['outputs/parcel-gpu-setup-20261021/parcel-cold-photo-proof-01.py']:
            relative='research/datasets/parcel-gpu-serving-20261022/frozen-proof-code-01/'+Path(original).name
            data=('original '+original).encode();path=self.root/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
            rows.append(dict(original_repo_path=original,snapshot_repo_path=relative,sha256=hashlib.sha256(data).hexdigest(),bytes=len(data)))
        api_data=b'original API';api_relative='research/datasets/parcel-gpu-serving-20261022/frozen-proof-api-01/api.py'
        path=self.root/api_relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(api_data)
        catalog=dict(kind='parcel_serving_original_proof_source_snapshot_v1',git_history_copied=False,
            models_or_datasets_copied=False,operationally_approved=False,records=rows,
            source_cold_request_sha256='e'*64,source_core_sha256='a'*64)
        catalog_record=dict(repo_path=serving.ORIGINAL_CATALOG['repo_path'],sha256=self.write(self.root/serving.ORIGINAL_CATALOG['repo_path'],catalog))
        api=dict(kind='parcel_serving_original_api_source_snapshot_v1',git_history_copied=False,models_or_datasets_copied=False,
            operationally_approved=False,original_repo_path='research/api.py',snapshot_repo_path=api_relative,
            sha256=hashlib.sha256(api_data).hexdigest(),bytes=len(api_data),source_catalog_sha256=catalog_record['sha256'])
        api_record=dict(repo_path=serving.ORIGINAL_API['repo_path'],sha256=self.write(self.root/serving.ORIGINAL_API['repo_path'],api))
        proofs={name:dict(repo_path='research/datasets/old/'+name+'.json',sha256=('e' if name=='cold_request' else 'a')*64)
            for name in ('core','descriptor','offline_audit','cold_request','cold_proof','independent_cold_review','production_completed')}
        unchanged=dict(class_order=['Normal','Damaged'],contrast='clahe',development_key=serving.DEV_KEY,evaluation_sha256=serving.REPORT_SHA,
            model_sha256=self.model_sha,model_variable_count=263,optimizer_iterations=945,optimizer_variable_count=6,
            preprocessing='rgb-letterbox224-v1',source_test_inference=False,training=False,native_limits=dict(
                available_floor_bytes=805306368,max_fit_seconds=25,max_output_bytes=67108864,max_rss_bytes=2147483648,
                max_wall_seconds=25,min_available_bytes=3221225472,min_free_disk_bytes=2147483648,poll_seconds=.05,threads=1))
        amendment=dict(schema_version=1,kind='parcel_gpu_transport_provenance_amendment_v1',acceptance_sha256=None,
            operationally_approved=False,historical_source_execution=False,purpose='closed_typed_gpu_transport',serving_gates='closed',
            allowed_current_source_changes=['research/parcel_gpu_serving.py','research/parcel_runtime.py','research/api.py'],
            original_sources=dict(catalog=catalog_record,supplemental_api=api_record),original_proofs=proofs,unchanged=unchanged)
        amendment_record=dict(repo_path=serving.AMENDMENT['repo_path'],sha256=self.write(self.root/serving.AMENDMENT['repo_path'],amendment))
        for name,value in [('AMENDMENT',amendment_record),('ORIGINAL_CATALOG',catalog_record),('ORIGINAL_API',api_record)]:
            handle=patch.object(serving,name,value);handle.start();self.addCleanup(handle.stop)
        originals={row['original_repo_path']:row for row in rows};originals['research/api.py']=api
        current={Path(path).name:row['sha256'] for path,row in originals.items() if path.startswith('research/')}
        current.update({'parcel_runtime.py':'1'*64,'parcel_gpu_serving.py':'2'*64,'api.py':'3'*64})
        self.code_patch.stop()
        handle=patch.object(serving,'current_code',return_value=current);handle.start();self.addCleanup(handle.stop)
        records={'historical.source.'+Path(path).name:dict(repo_path=row['snapshot_repo_path'],sha256=row['sha256']) for path,row in originals.items()}
        return amendment,catalog,originals,records,current

    def test_historical_snapshots_never_exempt_current_code_or_science_drift(self):
        self.assertTrue(callable(getattr(serving,'_historical_sources',None)),'Historical source verifier missing')
        amendment,catalog,originals,records,current=self.historical_fixture()
        found=serving._historical_sources(serving._Reader(),records)
        self.assertEqual(found['research/parcel_runtime.py']['sha256'],hashlib.sha256(b'original research/parcel_runtime.py').hexdigest())
        self.assertNotEqual(found['research/parcel_runtime.py']['sha256'],current['parcel_runtime.py'])
        with patch.object(serving,'current_code',return_value=dict(current,parcel_inputs_py='f'*64)):
            with self.assertRaises(ValueError):serving._historical_sources(serving._Reader(),records)
        bad=dict(current);bad['parcel_inputs.py']='f'*64
        with patch.object(serving,'current_code',return_value=bad):
            with self.assertRaises(ValueError):serving._historical_sources(serving._Reader(),records)
        snapshot=self.root/originals['research/parcel_runtime.py']['snapshot_repo_path'];snapshot.write_bytes(b'changed snapshot')
        with self.assertRaises(ValueError):serving._historical_sources(serving._Reader(),records)

    def test_foreign_missing_or_alias_historical_mappings_rejected_even_if_resealed(self):
        self.assertTrue(callable(getattr(serving,'_provenance_metadata',None)),'Prospective amendment verifier missing')
        amendment,catalog,originals,records,current=self.historical_fixture()
        serving._provenance_metadata()
        for kind in ('missing','foreign','alias','extra'):
            bad=copy.deepcopy(catalog)
            if kind=='missing':bad['records'].pop()
            elif kind=='foreign':bad['records'][0]['original_repo_path']='research/foreign.py'
            elif kind=='alias':bad['records'][0]['snapshot_repo_path']=bad['records'][1]['snapshot_repo_path']
            else:bad['records'].append(copy.deepcopy(bad['records'][0]))
            catalog_pin=self.write(self.root/serving.ORIGINAL_CATALOG['repo_path'],bad)
            bad_amendment=copy.deepcopy(amendment);bad_amendment['original_sources']['catalog']['sha256']=catalog_pin
            api=self.root/serving.ORIGINAL_API['repo_path'];api_value=json.loads(api.read_text());api_value['source_catalog_sha256']=catalog_pin
            api_pin=self.write(api,api_value);bad_amendment['original_sources']['supplemental_api']['sha256']=api_pin
            with patch.object(serving,'ORIGINAL_CATALOG',dict(serving.ORIGINAL_CATALOG,sha256=catalog_pin)),\
                patch.object(serving,'ORIGINAL_API',dict(serving.ORIGINAL_API,sha256=api_pin)),\
                patch.object(serving,'AMENDMENT',dict(serving.AMENDMENT,sha256=self.write(self.root/serving.AMENDMENT['repo_path'],bad_amendment))):
                with self.subTest(kind=kind),self.assertRaises(ValueError):serving._provenance_metadata()

    def test_historical_windows_identity_uses_only_original_runtime_exception(self):
        self.assertTrue(callable(getattr(serving,'_windows_code',None)),'Explicit Windows identity resolver missing')
        amendment,catalog,originals,records,current=self.historical_fixture()
        bindings=serving._windows_code(originals)
        self.assertEqual(set(bindings),{'parcel_windows_valid_compat.py','runner_runtime.py','parcel_runtime.py','parcel_inputs.py',
            'parcel_models.py','parcel_train.py','parcel_gpu_train.py','parcel_gpu_data.py','parcel_source_test_audit.py'})
        self.assertEqual(bindings['parcel_runtime.py'],hashlib.sha256(b'original research/parcel_runtime.py').hexdigest())
        self.assertEqual(bindings['parcel_inputs.py'],current['parcel_inputs.py'])
        with patch.object(serving,'current_code',return_value=dict(current,**{'parcel_inputs.py':'f'*64})):
            self.assertEqual(serving._windows_code(originals)['parcel_inputs.py'],'f'*64)

    def test_current_core_builder_emits_v2_and_binds_prospective_amendment(self):
        request=self.root/'request.json';request_sha=self.write(request,dict(environment=serving.environment()))
        with patch.object(serving,'role_catalog',return_value={'windows.request':'request.json'}),\
            patch.object(serving,'_relocations',return_value=[]),patch.dict(serving.PINS,{'windows.request':request_sha}):
            result=serving.build_core()
        self.assertEqual((result['schema_version'],result['kind']),(2,'parcel_gpu_serving_core_v2'))
        self.assertEqual(result['projection']['provenance_amendment'],serving.AMENDMENT)

    def test_offline_audit_cannot_skip_original_evidence_authentication(self):
        core=dict(schema_version=2,kind='parcel_gpu_serving_core_v2',projection=self.projection,roles={},metadata_relocations=[])
        path=self.root/'research/datasets/serving/core.json';pin=self.write(path,core)
        with patch.object(serving,'role_catalog',return_value={}),patch.object(serving,'_relocations',return_value=[]),\
            patch.object(serving,'_development',return_value={}),patch.object(serving,'_source'),patch.object(serving,'_windows'):
            with self.assertRaises((ValueError,KeyError,OSError)):serving.audit_core(path,pin)

    def test_compact_projection_cannot_replace_amendment_with_historical_code(self):
        value=copy.deepcopy(self.descriptor);value['projection']['provenance_amendment']['sha256']='f'*64
        with self.assertRaises(ValueError):serving.descriptor_bindings(self.descriptor_path,self.write(self.descriptor_path,value))

    def test_complete_historical_chain_authenticates_original_not_current_sources(self):
        amendment,catalog,originals,records,current=self.historical_fixture()
        projection=copy.deepcopy(self.projection);projection['code']=current
        old_projection=copy.deepcopy(projection);old_projection.pop('provenance_amendment')
        old_projection['code']={Path(path).name:row['sha256'] for path,row in originals.items()
            if path.startswith('research/') and path!='research/api.py'}
        proofs=amendment['original_proofs']
        def save(name,value):proofs[name]['sha256']=self.write(self.root/proofs[name]['repo_path'],value)
        save('core',dict(schema_version=1,kind='parcel_gpu_serving_core_v1',projection=old_projection))
        save('offline_audit',dict(schema_version=1,kind='parcel_gpu_serving_offline_audit_v1',projection=old_projection,
            core_sha256=proofs['core']['sha256'],status='verified_complete',operationally_approved=False))
        save('descriptor',dict(schema_version=1,kind='parcel_gpu_serving_descriptor_v1',projection=old_projection,
            core_sha256=proofs['core']['sha256'],offline_audit=copy.deepcopy(proofs['offline_audit'])))
        cold_code={name:old_projection['code'][name] for name in ('parcel_gpu_data.py','parcel_gpu_serving.py','parcel_gpu_train.py',
            'parcel_inputs.py','parcel_models.py','parcel_runtime.py','parcel_source_test_audit.py','parcel_train.py',
            'parcel_windows_valid_compat.py','runner_runtime.py')}
        cold_code['parent_harness']=originals['outputs/parcel-gpu-setup-20261021/parcel-cold-photo-proof-01.py']['sha256']
        save('cold_request',dict(code=cold_code,environment=projection['environment'],descriptor=dict(
            sha256=proofs['descriptor']['sha256'],core_sha256=proofs['core']['sha256'],evaluation_sha256=serving.REPORT_SHA)))
        save('cold_proof',dict(status='success',operationally_approved=False,descriptor_sha256=proofs['descriptor']['sha256'],
            request_sha256=proofs['cold_request']['sha256']))
        save('independent_cold_review',dict(status='pass',operationally_approved=False,acceptance_sha256=None,
            descriptor_sha256=proofs['descriptor']['sha256'],evaluation_sha256=serving.REPORT_SHA,model_sha256=self.model_sha,
            adapter=dict(sha256=old_projection['code']['parcel_gpu_serving.py']),harness=dict(sha256=cold_code['parent_harness'])))
        save('production_completed',dict(status='success',operationally_approved=False,core_sha256=proofs['core']['sha256'],
            descriptor_sha256=proofs['descriptor']['sha256'],offline_audit_sha256=proofs['offline_audit']['sha256'],
            adapter_sha256=old_projection['code']['parcel_gpu_serving.py']))
        catalog['source_core_sha256']=proofs['core']['sha256'];catalog['source_cold_request_sha256']=proofs['cold_request']['sha256']
        catalog_record=dict(serving.ORIGINAL_CATALOG,sha256=self.write(self.root/serving.ORIGINAL_CATALOG['repo_path'],catalog))
        api=json.loads((self.root/serving.ORIGINAL_API['repo_path']).read_text());api['source_catalog_sha256']=catalog_record['sha256']
        api_record=dict(serving.ORIGINAL_API,sha256=self.write(self.root/serving.ORIGINAL_API['repo_path'],api))
        amendment['original_sources']=dict(catalog=catalog_record,supplemental_api=api_record)
        amendment_record=dict(serving.AMENDMENT,sha256=self.write(self.root/serving.AMENDMENT['repo_path'],amendment))
        records.update({'historical.proof.'+name:record for name,record in proofs.items()})
        records.update({'historical.amendment':amendment_record,'historical.catalog':catalog_record,'historical.api_record':api_record})
        with patch.object(serving,'AMENDMENT',amendment_record),patch.object(serving,'ORIGINAL_CATALOG',catalog_record),\
            patch.object(serving,'ORIGINAL_API',api_record):
            found=serving._historical_evidence(serving._Reader(),records,projection)
            self.assertEqual(found['research/api.py']['sha256'],hashlib.sha256(b'original API').hexdigest())
            bad=copy.deepcopy(records);bad['historical.proof.cold_request']['sha256']='f'*64
            with self.assertRaises(ValueError):serving._historical_evidence(serving._Reader(),bad,projection)

    def test_path_links_traversal_and_duplicate_json_keys_rejected(self):
        for path in ('../elsewhere','/absolute','research/datasets/../bad','research/datasets/x\\file.json'):
            with self.subTest(path=path),self.assertRaises(ValueError):serving.safe_path(path)
        path=self.root/'research/datasets/duplicate.json';path.write_text('{"a":1,"a":2}')
        with self.assertRaises(ValueError):serving.read_json(path)
        path.write_text('{"a":NaN}')
        with self.assertRaises(ValueError):serving.read_json(path)

    def test_metadata_bounds_are_narrow_for_large_admission_roles(self):
        self.assertEqual(serving.role_limit('source_metadata.00000'),32*1024**2)
        self.assertEqual(serving.role_limit('source_metadata.00049'),32*1024**2)
        self.assertEqual(serving.role_limit('source_metadata.00048'),8*1024**2)
        path=self.root/'research/datasets/bounded.json';path.write_text('{"padding":"abcdefgh"}')
        with self.assertRaises(ValueError):serving.read_json(path,maximum=8)

    def test_unknown_roles_or_wrong_fixed_paths_rejected(self):
        expected={'source.report':serving.REPORT_PATH}
        for roles in ({},{'source.report':dict(repo_path='research/datasets/foreign.json',sha256='a'*64)},
            {'source.report':dict(repo_path=serving.REPORT_PATH,sha256='a'*64),'unexpected':dict(repo_path='x',sha256='b'*64)}):
            with self.subTest(roles=roles),self.assertRaises(ValueError):serving.validate_roles(roles,expected)

    def test_source_native_command_must_use_original_frozen_linux_identity(self):
        from test_parcel_gpu_runtime import GpuRuntimeTests
        helper=GpuRuntimeTests();record=helper.successful_record();unit='iilas-gpu-source-19c60ed96fcc-0.service'
        record['unit_name']=unit
        request=dict(record,command=['/linux/python','/original/app/research/parcel_source_test_evaluate.py','_worker','--output',
            '/original/app/research/datasets/parcel-source-test-evaluation-20261021/evaluate-01','--fit-id','mobilenetv2-clahe','--purpose','evaluation'],
            output='/original/app/research/datasets/parcel-source-test-evaluation-20261021/evaluate-01/mobilenetv2-clahe',
            output_tree='/original/app/research/datasets/parcel-source-test-evaluation-20261021/evaluate-01',code_sha256='d'*64,activation_sha256='e'*64)
        record['output_tree']=request['output_tree']
        prepared=dict(key=serving.EVAL_KEY,binding=dict(environment=dict(executable='/linux/python'),code={'parcel_gpu_runtime.py':'d'*64},
            activation_helper={'sha256':'e'*64}))
        envelope=dict(request_sha256='c'*64,proof=dict(unit_name=unit,properties=record['properties']))
        terminal=dict(returncode=0)
        hashes={'request.json':'c'*64,'worker-envelope.json':'a'*64,'worker-terminal.json':'b'*64}
        serving.verify_source_native(request,record,envelope,terminal,prepared,'mobilenetv2-clahe','/original/app',hashes)
        for change in ('executable','quota','unit','exit'):
            bad=copy.deepcopy(request);end=copy.deepcopy(terminal)
            if change=='executable':bad['command'][0]='C:/Windows/python.exe'
            elif change=='quota':bad['max_output_bytes']=128*1024**2
            elif change=='unit':bad['unit_name']='foreign.service'
            else:end['returncode']=1
            with self.subTest(change=change),self.assertRaises(ValueError):
                serving.verify_source_native(bad,record,envelope,end,prepared,'mobilenetv2-clahe','/original/app',hashes)

    def test_supervision_precedes_descriptor_assets_and_heavy_imports(self):
        with patch.object(serving.runtime,'require_supervised_worker',side_effect=RuntimeError('not supervised')),\
            patch.object(serving,'validate_descriptor',side_effect=AssertionError('must not read assets')):
            with self.assertRaisesRegex(RuntimeError,'not supervised'):serving.predict_image(b'image',self.descriptor_path,self.descriptor_sha)

    def test_cold_import_is_stdlib_only(self):
        result=subprocess.run([sys.executable,'-c','import parcel_gpu_serving,sys; assert not set(sys.modules)&{"numpy","cv2","tensorflow"}'],
            cwd=Path(__file__).parent,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_only_scientific_float_roundoff_is_tolerated(self):
        serving.same_science({'count':75,'accuracy':.906666666666667,'missing':None},
            {'count':75,'accuracy':.9066666666666669,'missing':None})
        for bad in ({'count':75.,'accuracy':.906666666666667,'missing':None},
            {'count':76,'accuracy':.906666666666667,'missing':None},
            {'count':75,'accuracy':.907,'missing':None},
            {'count':75,'accuracy':float('nan'),'missing':None}):
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                serving.same_science({'count':75,'accuracy':.906666666666667,'missing':None},bad)
        with self.assertRaises(ValueError):serving.same_science({'support_weight':60.0},{'support_weight':60.00000000000001})

    def test_independent_component_roundoff_is_narrow_and_keeps_image_counts_exact(self):
        weights=dict(f1_denominator=26.5,false_negative_weight=26.5,false_positive_weight=0.,
            predicted_weight=0.,support_weight=26.5,true_positive_weight=0.)
        point=dict(count=75,confusion=[[0.,0.,0.],[26.5,0.,0.]],total_weight=60.,abstention_weight=0.,
            per_class={label:copy.deepcopy(weights) for label in ('Normal','Damaged')})
        expected=dict(support=dict(images=75,components=60),always_normal=dict(component=copy.deepcopy(point),image=copy.deepcopy(point)),
            point_estimates={fid:dict(component=copy.deepcopy(point),image=copy.deepcopy(point)) for fid in serving.FITS})
        rounded=copy.deepcopy(expected);rounded['point_estimates'][serving.FITS[0]]['component']['confusion'][1][0]+=1e-14
        serving._same_independent_section(expected,rounded)
        for kind in ('large','integer','image','type'):
            bad=copy.deepcopy(expected)
            if kind=='large':bad['always_normal']['component']['total_weight']+=1e-6
            elif kind=='integer':bad['support']['images']=76
            elif kind=='image':bad['always_normal']['image']['confusion'][1][0]+=1e-14
            else:bad['always_normal']['component']['total_weight']=60
            with self.subTest(kind=kind),self.assertRaises(ValueError):serving._same_independent_section(expected,bad)

    def fake_model(self,scores=(.8,.2)):
        import numpy as np
        class Variable:
            def __init__(self,name,value=0):self.path=name;self.value=value
            def numpy(self):return np.asarray(self.value)
        class Tensor:
            device='/device:CPU:0'
            def numpy(self):return np.asarray([scores])
        class Model:
            input_shape=(None,224,224,3);output_shape=(None,2)
            def __init__(self):
                self.variables=[Variable('model/'+str(i)) for i in range(263)]
                self.optimizer=type('Optimizer',(),{})()
                self.optimizer.variables=[Variable('optimizer/'+str(i)) for i in range(6)]
                self.optimizer.iterations=Variable('iterations',945);self.calls=[];self.mutate=None
            def __call__(self,images,training):
                self.calls.append((images.shape,training))
                if self.mutate:self.mutate()
                return Tensor()
        return Model(),np.full((224,224,3),127,dtype=np.float32)

    def invoke(self,model,tensor,data=b'artificial encoded image'):
        with patch.object(serving.runtime,'require_supervised_worker'),\
            patch.object(serving,'_load_model',return_value=model,create=True),\
            patch.object(serving,'_decode_prepare',return_value=tensor,create=True):
            return serving.predict_image(data,self.descriptor_path,self.descriptor_sha)

    def test_prediction_uses_exact_closed_seventeen_field_wire_contract(self):
        model,tensor=self.fake_model();result=self.invoke(model,tensor)
        expected={'status','label','confidence','probabilities','confidenceMeaning','model','modelVersion','preprocessing','contrast',
            'evidenceSha256','selectionSha256','evaluationSha256','classOrder','acceptanceSha256','processingTimeMs','humanReviewRequired','operationally_approved'}
        self.assertEqual(set(result),expected)
        self.assertEqual(result['label'],'Normal');self.assertEqual(result['evidenceSha256'],hashlib.sha256(b'artificial encoded image').hexdigest())
        self.assertEqual(result['selectionSha256'],self.descriptor_sha);self.assertIsNone(result['acceptanceSha256'])
        self.assertFalse(result['operationally_approved']);self.assertTrue(result['humanReviewRequired'])
        self.assertEqual(model.calls,[((1,224,224,3),False)])

    def test_tie_abstains_and_invalid_scores_never_become_normal(self):
        model,tensor=self.fake_model((.5,.5));result=self.invoke(model,tensor)
        self.assertEqual(result['status'],'abstained');self.assertIsNone(result['label'])
        for scores in ((True,False),(.9,.9),(float('nan'),.2),(-.1,1.1)):
            model,tensor=self.fake_model(scores)
            with self.subTest(scores=scores),self.assertRaises(ValueError):self.invoke(model,tensor)

    def test_model_shape_optimizer_state_and_artifact_mutation_fail(self):
        for kind in ('shape','optimizer','inventory','state','artifact'):
            model,tensor=self.fake_model()
            if kind=='shape':model.input_shape=(None,128,128,3)
            elif kind=='optimizer':model.optimizer.iterations.value=946
            elif kind=='inventory':model.variables.pop()
            elif kind=='state':model.mutate=lambda:setattr(model.variables[0],'value',1)
            else:model.mutate=lambda:self.artifact.write_bytes(b'changed artifact')
            with self.subTest(kind=kind),self.assertRaises(ValueError):self.invoke(model,tensor)

    def test_unknown_or_oversized_bytes_rejected_before_loader(self):
        with patch.object(serving.runtime,'require_supervised_worker'),\
            patch.object(serving,'_load_model',side_effect=AssertionError('loader must not run'),create=True):
            for data in (None,'base64',bytearray(b'x'),b'',b'x'*(10*1024**2+1)):
                with self.subTest(type=type(data)),self.assertRaises(ValueError):
                    serving.predict_image(data,self.descriptor_path,self.descriptor_sha)

    def test_offline_audit_needs_exact_core_pin_and_canonical_role_catalog(self):
        core=self.root/'research/datasets/serving/core.json'
        core.write_text('{"schema_version":1,"kind":"parcel_gpu_serving_core_v1","roles":{}}')
        with self.assertRaises(ValueError):serving.audit_core(core,'f'*64)
        with self.assertRaises(ValueError):serving.audit_core(core,hashlib.sha256(core.read_bytes()).hexdigest())

    def test_descriptor_schema_rejects_boolean_integer_and_float_counter_substitutions(self):
        for kind in ('schema','counter','contract'):
            value=copy.deepcopy(self.descriptor)
            if kind=='schema':value['schema_version']=True
            elif kind=='counter':value['projection']['model']['optimizer_iterations']=945.0
            else:value['projection']['contract']['operationally_approved']=0
            with self.subTest(kind=kind),self.assertRaises(ValueError):
                serving.validate_descriptor(self.descriptor_path,self.write(self.descriptor_path,value))

    def test_offline_record_cache_still_rejects_different_hash_for_alias(self):
        path=self.root/'research/datasets/cache.json';sha=self.write(path,{'proof':'fixture'})
        reader=serving._Reader();record=dict(repo_path=path.relative_to(self.root).as_posix(),sha256=sha)
        self.assertEqual(reader.object(record,'source.fixture'),{'proof':'fixture'})
        with self.assertRaises(ValueError):reader.object(dict(record,sha256='f'*64),'source.fixture')

    def test_prediction_rejects_non_cpu_output_and_foreign_output_shape(self):
        model,tensor=self.fake_model()
        class Wrong:
            device='/device:GPU:0'
            def numpy(self):raise AssertionError('wrong-device output must not be read')
        class Foreign:
            input_shape=model.input_shape;output_shape=model.output_shape;variables=model.variables;optimizer=model.optimizer
            def __call__(self,*args,**kwargs):return Wrong()
        with self.assertRaises(ValueError):self.invoke(Foreign(),tensor)

    def test_decoder_failure_and_model_loader_errors_do_not_leak_paths(self):
        with patch.object(serving.runtime,'require_supervised_worker'),\
            patch.object(serving,'_decode_prepare',side_effect=ValueError('secret/path/inside/decoder')):
            with self.assertRaisesRegex(ValueError,'^Parcel prediction unavailable$'):
                serving.predict_image(b'artificial',self.descriptor_path,self.descriptor_sha)


if __name__=='__main__':unittest.main()
