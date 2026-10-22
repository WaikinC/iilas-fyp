"""Artificial fixtures only; no TensorFlow, native jobs or real assets."""
import copy
from contextlib import nullcontext
import hashlib
import importlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest

try:
    import parcel_windows_valid_compat as compat
except ModuleNotFoundError:
    compat = None


def rows(count=6):
    return [dict(sample_id=str(i), split='validation', label='Normal' if i % 2 == 0 else 'Damaged',
        dependency_group_id='g'+str(i), sha256='a'*64, pixel_sha256='b'*64,
        width=224, height=224, path='research/datasets/artificial/'+str(i)+'.jpg') for i in range(count)]


def raw(source):
    return [dict(sample_id=r['sample_id'], label=r['label'], dependency_group_id=r['dependency_group_id'],
        sha256=r['sha256'], pixel_sha256=r['pixel_sha256'], probabilities=[.8,.2] if r['label']=='Normal' else [.2,.8]) for r in source]


class CompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(compat, 'New compatibility harness is not implemented')

    def test_import_does_not_load_ml_or_image_stack(self):
        result=subprocess.run([sys.executable,'-c',
            'import sys; import parcel_windows_valid_compat; assert not set(sys.modules)&{"tensorflow","numpy","cv2"}'],
            cwd=Path(__file__).parent,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_validation_membership_rejects_train_and_wrong_support(self):
        source=rows(162)
        for i,r in enumerate(source):
            r['label']='Normal' if i<107 else 'Damaged'
        for i in range(3):source[159+i]['dependency_group_id']=source[i]['dependency_group_id']
        self.assertEqual(len(compat.validate_rows(source)),162)
        for change in ('partition','duplicate','support','groups'):
            bad=copy.deepcopy(source)
            if change=='partition':bad[0]['split']='test'
            elif change=='duplicate':bad[-1]['sample_id']=bad[0]['sample_id']
            elif change=='support':bad[0]['label']='Damaged'
            else:bad[-1]['dependency_group_id']='new-group'
            with self.subTest(change=change),self.assertRaises(ValueError):compat.validate_rows(bad)

    def test_metrics_keep_ties_and_undefined_precision_explicit(self):
        source=rows(4);pred=raw(source)
        for p in pred:p['probabilities']=[.5,.5]
        measured=compat.metrics(source,pred)
        self.assertEqual(measured['accuracy'],0.)
        self.assertEqual(measured['coverage'],0.)
        self.assertIsNone(measured['damaged_precision'])
        self.assertEqual(measured['damaged_recall'],0.)
        self.assertEqual(measured['confusion'],[[0,0,2],[0,0,2]])
        self.assertAlmostEqual(measured['nll'],.6931471805599453)

    def test_metrics_use_original_clipped_probability_nll(self):
        source=rows(2);pred=raw(source);pred[1]['probabilities']=[1.,0.]
        result=compat.metrics(source,pred)
        self.assertAlmostEqual(result['nll'],8.170619601142806)
        self.assertEqual(result['accuracy'],.5)

    def test_comparison_retains_every_decision_disagreement(self):
        source=rows(2);gpu=raw(source);one=copy.deepcopy(gpu);four=copy.deepcopy(gpu)
        one[1]['probabilities']=[.6,.4];four[0]['probabilities']=[.5,.5]
        result=compat.compare_paths(source,one,four,gpu)
        self.assertEqual([r['sample_id'] for r in result['cpu_batch1_vs_cpu_batch4']['disagreements']],['0','1'])
        self.assertAlmostEqual(result['cpu_batch1_vs_gpu_batch4']['max_absolute_probability_difference'],.4)
        self.assertEqual(result['operationally_approved'],False)

    def test_raw_rejects_reorder_boolean_nonfinite_and_invalid_sum(self):
        source=rows(2)
        for kind in ('order','boolean','nan','sum','missing'):
            pred=raw(source)
            if kind=='order':pred.reverse()
            elif kind=='boolean':pred[0]['probabilities']=[True,False]
            elif kind=='nan':pred[0]['probabilities']=[float('nan'),.2]
            elif kind=='sum':pred[0]['probabilities']=[.9,.9]
            else:pred.pop()
            with self.subTest(kind=kind),self.assertRaises(ValueError):compat.metrics(source,pred)

    def test_state_snapshot_captures_full_model_and_optimizer_content(self):
        class Array:
            shape=(2,);dtype='float32'
            def tobytes(self):return b'original variable bytes'
        variable=types.SimpleNamespace(path='bn/moving_mean',numpy=lambda:Array())
        model=types.SimpleNamespace(variables=[variable],optimizer=types.SimpleNamespace(
            variables=[variable],iterations=types.SimpleNamespace(numpy=lambda:945)))
        result=compat.snapshot_state(model)
        self.assertEqual(result['optimizer_iterations'],945)
        self.assertEqual(result['model_variables'][0]['sha256'],hashlib.sha256(b'original variable bytes').hexdigest())
        self.assertEqual(result['optimizer_variables'][0]['shape'],[2])

    def test_no_update_guard_rejects_each_path_mutation(self):
        state=dict(optimizer_iterations=945,model_variables=[dict(name='0:a',shape=[1],dtype='float32',sha256='a'*64)],
            optimizer_variables=[dict(name='0:b',shape=[],dtype='int64',sha256='b'*64)])
        attempt=dict(artifact_hashes=[compat.MODEL_SHA]*4,states=[copy.deepcopy(state) for _ in range(4)])
        compat.validate_no_update(attempt)
        for index in range(4):
            bad=copy.deepcopy(attempt);bad['states'][index]['optimizer_iterations']=946
            with self.subTest(index=index),self.assertRaises(ValueError):compat.validate_no_update(bad)
        for field in ('model_variables','optimizer_variables'):
            bad=copy.deepcopy(attempt);bad['states'][2][field][0]['sha256']='c'*64
            with self.assertRaises(ValueError):compat.validate_no_update(bad)

    def test_persist_attempt_keeps_raw_before_failed_state_guard(self):
        fixture_root=compat.ROOT/'research/datasets/parcel-windows-valid-compat-fixtures'
        fixture_root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=fixture_root) as folder:
            path=Path(folder)/'attempt.json'
            value=dict(cpu_batch1=[dict(probabilities=[.2,.8])],states=[],artifact_hashes=[])
            with self.assertRaises(ValueError):compat.persist_attempt(path,value)
            self.assertEqual(json.loads(path.read_text())['cpu_batch1'][0]['probabilities'],[.2,.8])

    def test_cpu_batch_adapter_keeps_four_plus_two_and_order(self):
        source=rows();calls=[]
        def prepare(row):return int(row['sample_id'])
        def forward(images,labels):
            calls.append((images,labels))
            return [[.8,.2] if x%2==0 else [.2,.8] for x in images]
        actual=compat.score_batches(source,4,prepare,forward,lambda event:None)
        self.assertEqual([len(images) for images,_ in calls],[4,2])
        self.assertEqual([p['sample_id'] for p in actual],[str(i) for i in range(6)])

    def test_policy_rejects_altered_resource_and_cache_profiles(self):
        policy=compat.policy();compat.validate_policy(policy)
        for key,value in [('wall_seconds',601),('memory_limit_bytes',3*1024**3),('cache_policy','clear_cache')]:
            bad=copy.deepcopy(policy);bad[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):compat.validate_policy(bad)

    def test_worker_refuses_before_request_assets_or_heavy_imports(self):
        from unittest.mock import patch
        with patch.object(compat.runtime,'require_supervised_worker',side_effect=RuntimeError('no native job')):
            with self.assertRaisesRegex(RuntimeError,'no native job'):compat.worker(Path('missing'), 'a'*64)

    def test_request_rejects_arbitrary_data_path_before_reading(self):
        value=dict(schema_version=1,kind=compat.KIND,policy=compat.policy(),assets={})
        for role,path in compat.PATHS.items():value['assets'][role]=dict(path=path,sha256='a'*64,bytes=1)
        value['assets']['artifact']['path']='research/datasets/elsewhere/model.keras'
        with self.assertRaises(ValueError):compat.validate_asset_roles(value['assets'])

    def test_output_identity_rejects_non_uuid_or_wrong_root(self):
        for path in (compat.OUTPUT_ROOT/'replay',compat.ROOT/'research/datasets/wrong/00000000-0000-4000-8000-000000000000'):
            with self.subTest(path=path),self.assertRaises(ValueError):compat.output_path(path)

    def test_compiled_diagnostics_reject_bad_logits_and_ce(self):
        source=rows(2);pred=raw(source)
        logits=[[-.2231435513142097,-1.6094379124341003],[-1.6094379124341003,-.2231435513142097]]
        diagnostics=[dict(logits=z,keras_sparse_ce=.2231435513142097) for z in logits]
        compat.validate_compiled(source,pred,diagnostics)
        for key,value in [('logits',[0.,0.]),('keras_sparse_ce',99.)]:
            bad=copy.deepcopy(diagnostics);bad[0][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):compat.validate_compiled(source,pred,bad)

    def test_progress_retains_partial_rows_when_later_batch_fails(self):
        persisted=[];calls=0
        def forward(images,labels):
            nonlocal calls
            calls+=1
            if calls==2:raise RuntimeError('artificial stopped batch')
            return [[.8,.2] for _ in images]
        with self.assertRaises(RuntimeError):compat.score_batches(rows(),4,lambda row:row,forward,persisted.append)
        self.assertEqual([p['sample_id'] for p in persisted[0]['predictions']],['0','1','2','3'])

    def test_exact_request_hash_is_checked_against_parsed_bytes(self):
        fixture_root=compat.ROOT/'research/datasets/parcel-windows-valid-compat-fixtures'
        fixture_root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=fixture_root) as folder:
            path=Path(folder)/'record.json';path.write_text('{"a":1}',encoding='utf-8')
            with self.assertRaises(ValueError):compat.json_file(path,expected_sha='a'*64)
            with self.assertRaises(ValueError):
                path.write_text('{"a":1,"a":2}',encoding='utf-8');compat.json_file(path)

    def test_native_drain_deadline_fails_closed_and_closes_query_handle(self):
        closed=[]
        supervisor=types.SimpleNamespace(_query_handle=42,_kernel=types.SimpleNamespace(CloseHandle=closed.append))
        with self.assertRaises(RuntimeError):compat.drain_job(supervisor,1.,active=lambda:True,clock=lambda:2.)
        self.assertEqual(closed,[42]);self.assertIsNone(supervisor._query_handle)

    def test_native_drain_confirms_no_members_before_success(self):
        closed=[];supervisor=types.SimpleNamespace(_query_handle=42,_kernel=types.SimpleNamespace(CloseHandle=closed.append))
        compat.drain_job(supervisor,1.,active=lambda:False,clock=lambda:0.)
        self.assertEqual(closed,[42]);self.assertIsNone(supervisor._query_handle)

    def test_possible_started_worker_without_monitor_is_never_clean(self):
        supervisor=types.SimpleNamespace(_query_handle=None,native_run_invoked=True)
        with self.assertRaises(RuntimeError):compat.drain_job(supervisor,1.)

    def test_proven_no_native_run_returns_not_started(self):
        supervisor=types.SimpleNamespace(_query_handle=None,native_run_invoked=False)
        self.assertEqual(compat.drain_job(supervisor,1.)['status'],'not_started')

    def test_existing_linux_lease_blocks_before_supervisor_creation_and_retains_locks(self):
        from unittest.mock import patch
        import parcel_gpu_train as gpu
        import parcel_gpu_runtime as native
        import parcel_runtime as parcel
        fixture_root=compat.ROOT/'research/datasets/parcel-windows-valid-compat-fixtures'
        fixture_root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=fixture_root) as folder:
            out=Path(folder);lease_root=out/'linux';lease_root.mkdir();(lease_root/'active-runtime').mkdir()
            guard={'retain':False};created=[]
            fake=types.SimpleNamespace(_query_handle=None,preflight=lambda:{},
                run=lambda *a,**k:dict(status='success',returncode=0))
            def supervisor(*args):created.append(True);return fake
            with patch.object(compat,'output_path',return_value=out),patch.object(compat,'load_request',return_value=({},None,out)),\
                patch.object(compat,'cpu_affinity',return_value=1),patch.object(gpu,'exclusive_job',return_value=nullcontext(guard)),\
                patch.object(native,'REGISTRY',lease_root),patch.object(parcel,'REQUEST_ROOT',out/'api'),\
                patch.object(parcel,'_Mutex',return_value=nullcontext()),patch.object(parcel,'_DrainingSupervisor',side_effect=supervisor),\
                patch.object(compat,'new_supervisor',side_effect=supervisor,create=True):
                with self.assertRaises(ValueError):compat.run(out/'request.json','a'*64)
            self.assertEqual(created,[]);self.assertTrue(guard['retain'])
            self.assertEqual(json.loads((out/'native-lease-blocked.json').read_text())['status'],'unconfirmed')

    def test_controller_missing_monitor_after_invocation_retains_locks_and_uncertain_receipt(self):
        from unittest.mock import patch
        import parcel_gpu_train as gpu
        import parcel_gpu_runtime as native
        import parcel_runtime as parcel
        fixture_root=compat.ROOT/'research/datasets/parcel-windows-valid-compat-fixtures'
        fixture_root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=fixture_root) as folder:
            out=Path(folder);guard={'retain':False}
            fake=types.SimpleNamespace(_query_handle=None,native_run_invoked=False,native_job_name='unknown',
                preflight=lambda:{},run=lambda *a,**k:dict(status='failed',returncode=1))
            with patch.object(compat,'output_path',return_value=out),patch.object(compat,'load_request',return_value=({},None,out)),\
                patch.object(compat,'cpu_affinity',return_value=1),patch.object(gpu,'exclusive_job',return_value=nullcontext(guard)),\
                patch.object(native,'REGISTRY',out/'linux'),patch.object(parcel,'REQUEST_ROOT',out/'api'),\
                patch.object(parcel,'_Mutex',return_value=nullcontext()),patch.object(parcel,'_DrainingSupervisor',return_value=fake),\
                patch.object(compat,'new_supervisor',return_value=fake,create=True):
                with self.assertRaises((ValueError,RuntimeError)):compat.run(out/'request.json','a'*64)
            self.assertTrue(guard['retain'])
            self.assertEqual(json.loads((out/'cleanup.json').read_text())['status'],'unconfirmed')
            self.assertTrue((out/'native-run-invoked.json').exists())

    def test_job_identity_is_persisted_before_inherited_monitor_open_failure(self):
        from unittest.mock import patch
        import parcel_runtime as parcel
        fixture_root=compat.ROOT/'research/datasets/parcel-windows-valid-compat-fixtures'
        fixture_root.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=fixture_root) as folder:
            out=Path(folder)
            def initialize(supervisor,*args):
                supervisor._job=types.SimpleNamespace(name='Local\\IILASNativeRunner-artificial')
                supervisor._query_handle=None
            with patch.object(parcel._DrainingSupervisor,'__init__',initialize),\
                patch.object(parcel._DrainingSupervisor,'preflight',side_effect=RuntimeError('monitor open failed')):
                supervisor=compat.new_supervisor(out);supervisor.native_run_invoked=True
                with self.assertRaises(RuntimeError):supervisor.preflight()
            evidence=json.loads((out/'native-job-observed.json').read_text())
            self.assertEqual(evidence['job_name'],'Local\\IILASNativeRunner-artificial')
            self.assertTrue(evidence['worker_may_have_started'])


if __name__=='__main__':unittest.main()
