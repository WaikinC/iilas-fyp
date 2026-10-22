"""Artificial metadata only; never executes models, native jobs or source assets."""
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

if importlib.util.find_spec('parcel_source_test_evaluate'):
    import parcel_source_test_evaluate as ev
else:
    ev = None


def h(value):
    return hashlib.sha256(value.encode()).hexdigest()


def fixture():
    rows=[]
    for i,label in enumerate(('Normal','Damaged','Damaged','Normal','Damaged')):
        rows.append(dict(sample_id=f's{i}',split='test',label=label,sha256=h(str(i)),
            pixel_sha256=h('pixel'+str(i)),width=64,height=64,path=f'research/datasets/images/{i}.png',
            dependency_group_id=('g0' if i<2 else f'g{i}'),audit_dependency_group_id=('g0' if i<2 else f'g{i}'),
            technical_status='decoded',audit_reasons=[],strict_publisher_partition_eligible=i>=2,
            quality_basis='publisher_label_not_independently_verified'))
    dispositions=copy.deepcopy(rows)
    for i in range(5,102):
        dispositions.append(dict(sample_id=f's{i}',split='test',label='Normal' if i<53 else 'Damaged',
            sha256=h(str(i)),technical_status='not_attempted',audit_reasons=['fixture_hold']))
    # Three Normal among the first five, adjusted publisher TEST support51/51 below.
    for i,row in enumerate(dispositions):row['label']='Normal' if i in (0,3) or 5<=i<54 else 'Damaged'
    for row in rows:row['label']=dispositions[int(row['sample_id'][1:])]['label']
    for i in range(102,4148):
        dispositions.append(dict(sample_id=f's{i}',split='train',label='Normal',sha256=h(str(i))))
    return dict(schema_version=1,kind='parcel_source_test_audit_v1',class_order=['Normal','Damaged'],
        source_closed=True,training_admission=False,audit_admission=True,evaluation_status='not_run',
        admission_blockers=[],rows=rows,dispositions=dispositions)


def predictions(rows, probabilities):
    result=[]
    for row,p in zip(rows,probabilities):
        z=[math.log(v) if v else -1000. for v in p]
        maximum=max(z);ce=maximum-z[('Normal','Damaged').index(row['label'])]+math.log(sum(math.exp(v-maximum) for v in z))
        result.append(dict(**{k:row[k] for k in ('sample_id','label','dependency_group_id','sha256','pixel_sha256')},
            probabilities=p,logits=z,keras_sparse_ce=ce))
    return result


class EvaluatorTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(ev,'source evaluator implementation missing')
        self.data=fixture();self.rows=self.data['rows']
        self.tmp=tempfile.TemporaryDirectory(prefix='source-eval-fixture-',dir=Path(__file__).resolve().parents[1]/'outputs')
        self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.scores=predictions(self.rows,[[.8,.2],[.7,.3],[.1,.9],[.5,.5],[.2,.8]])

    def test_admission_rejects_missing_held_denominator_and_foreign_rows(self):
        self.assertEqual(len(ev.validate_admission(self.data)),5)
        for change in ('missing','foreign','reordered','duplicate','held','label'):
            value=copy.deepcopy(self.data)
            if change=='missing':value['dispositions'].pop(100)
            if change=='foreign':value['rows'][0]['sample_id']='foreign'
            if change=='reordered':value['rows'].reverse()
            if change=='duplicate':value['rows'].append(value['rows'][0])
            if change=='held':value['rows'][0]['audit_reasons']=['rights']
            if change=='label':value['rows'][0]['label']='Damaged'
            with self.subTest(change=change),self.assertRaises(ValueError):ev.validate_admission(value)

    def test_population_claim_is_shared_across_protocol_model_and_output_changes(self):
        first=ev.reserve_population(h('source'),self.data,{'code':'first'},self.root/'one',self.root/'registry')
        self.assertTrue((first/'reserved.json').is_file())
        with self.assertRaises(ValueError):
            ev.reserve_population(h('source'),self.data,{'code':'changed','model':'other'},self.root/'two',self.root/'registry')
        self.assertFalse((self.root/'two').exists())

    def test_population_identity_uses_unadmitted_held_members(self):
        before=ev.population_key(h('source'),self.data)
        value=copy.deepcopy(self.data);value['rows']=value['rows'][:2]
        self.assertEqual(ev.population_key(h('source'),value),before)
        value['dispositions'][90]['sha256']=h('changed')
        self.assertNotEqual(ev.population_key(h('source'),value),before)

    def attempt(self):
        state=dict(model_variables=[dict(name='bn',shape=[2],dtype='float32',sha256=h('bn'))],
            optimizer_variables=[dict(name='adam',shape=[2],dtype='float32',sha256=h('adam'))],optimizer_iterations=945)
        return dict(fit_id=ev.FIT_IDS[0],raw=copy.deepcopy(self.scores),batch_sizes=[4,1],
            output_devices=['/job:localhost/replica:0/task:0/device:GPU:0'],
            artifact_before_sha256=h('artifact'),artifact_after_sha256=h('artifact'),
            state_before=state,state_after=copy.deepcopy(state),scoring='compiled_validation_batch4_partial_v1')

    def model(self):return dict(fit_id=ev.FIT_IDS[0],sha256=h('artifact'),optimizer_iterations=945)

    def test_raw_persists_before_state_and_order_guards(self):
        for change in ('order','missing','duplicate','batch','device','artifact','optimizer','bn','logit','ce','probability'):
            attempt=self.attempt()
            if change=='order':attempt['raw'].reverse()
            if change=='missing':attempt['raw'].pop()
            if change=='duplicate':attempt['raw'][1]=attempt['raw'][0]
            if change=='batch':attempt['batch_sizes']=[1]*5
            if change=='device':attempt['output_devices']=['CPU:0']
            if change=='artifact':attempt['artifact_after_sha256']=h('changed')
            if change=='optimizer':attempt['state_after']['optimizer_iterations']=946
            if change=='bn':attempt['state_after']['model_variables'][0]['sha256']=h('changed')
            if change=='logit':attempt['raw'][0]['logits']=[0.,0.]
            if change=='ce':attempt['raw'][0]['keras_sparse_ce']=100.
            if change=='probability':attempt['raw'][0]['probabilities']=[float('nan'),.5]
            target=self.root/change;target.mkdir()
            with self.subTest(change=change),self.assertRaises(ValueError):
                ev.persist_attempt(target,attempt,self.rows,self.model())
            self.assertTrue((target/'attempt.json').is_file())
            self.assertTrue((target/'guard-failed.json').is_file())

    def test_no_update_accepts_complete_batch4_short_final_and_exact_states(self):
        ev.validate_attempt(self.attempt(),self.rows,self.model())
        for field in ('optimizer_variables','model_variables'):
            bad=self.attempt();bad['state_before'][field]=[];bad['state_after'][field]=[]
            with self.subTest(field=field),self.assertRaises(ValueError):ev.validate_attempt(bad,self.rows,self.model())

    def test_metrics_count_ties_damage_misses_and_component_weights(self):
        image=ev.metrics(self.rows,self.scores)
        self.assertEqual(image['confusion'],[[1.,0.,1.],[1.,2.,0.]])
        self.assertAlmostEqual(image['accuracy'],.6)
        self.assertEqual(image['per_class']['Damaged']['precision'],1.)
        self.assertAlmostEqual(image['per_class']['Damaged']['recall'],2/3)
        self.assertEqual(image['abstention_weight'],1.)
        component=ev.metrics(self.rows,self.scores,component_weighted=True)
        self.assertEqual(component['total_weight'],4.)
        self.assertAlmostEqual(component['accuracy'],.625)
        self.assertAlmostEqual(component['per_class']['Damaged']['recall'],.8)

    def test_undefined_precision_and_empty_strict_support_are_explicit(self):
        normal=predictions(self.rows,[[1.,0.]]*5)
        point=ev.metrics(self.rows,normal)
        self.assertIsNone(point['per_class']['Damaged']['precision'])
        self.assertEqual(point['per_class']['Damaged']['predicted_weight'],0.)
        self.assertEqual(point['per_class']['Damaged']['recall'],0.)
        self.assertEqual(point['per_class']['Damaged']['f1'],0.)
        empty=ev.metrics([],[])
        self.assertIsNone(empty['accuracy']);self.assertIsNone(empty['nll'])
        self.assertEqual(empty['count'],0)

    def test_bootstrap_is_paired_and_reports_undefined_draws(self):
        attempts=[dict(fit_id=fid,raw=self.scores) for fid in ev.FIT_IDS]
        value=ev.paired_bootstrap(self.rows,attempts)
        delta=value['paired_comparator_minus_primary']['image']['accuracy']
        self.assertEqual(delta,dict(lower=0.,upper=0.,valid_replicates=2000,undefined_replicates=0))
        self.assertGreater(value['model_intervals'][ev.FIT_IDS[0]]['image']['damaged_precision']['undefined_replicates'],0)
        self.assertEqual(value,ev.paired_bootstrap(self.rows,attempts))

    def test_bootstrap_linear_percentile_and_multiplicity(self):
        self.assertEqual(ev.percentile([0.,10.,20.,30.],.25),7.5)
        point=ev.metrics(self.rows,self.scores,component_weighted=True,multiplicity={'g0':3,'g2':1})
        self.assertEqual(point['total_weight'],4.)
        self.assertAlmostEqual(point['accuracy'],.625)

    def test_summary_strict_uses_same_raw_predictions_and_retains_all102(self):
        attempts=[dict(fit_id=fid,raw=copy.deepcopy(self.scores)) for fid in ev.FIT_IDS]
        report=ev.summarize(self.data,attempts)
        self.assertEqual(report['coverage']['reserved_test'],102)
        self.assertEqual(report['coverage']['admitted'],5)
        self.assertEqual(report['coverage']['excluded'],97)
        self.assertEqual(len(report['test_dispositions']),102)
        self.assertEqual(report['strict']['support']['images'],3)
        self.assertAlmostEqual(report['primary']['always_normal']['image']['accuracy'],.4)
        self.assertAlmostEqual(report['strict']['always_normal']['image']['accuracy'],1/3)
        self.assertIsNone(report['primary']['always_normal']['image']['stable_ce'])
        self.assertFalse(report['operationally_approved']);self.assertEqual(report['serving_gates'],'closed')

    def portable_snapshot(self):
        data=self.root/'research/datasets';data.mkdir(parents=True,exist_ok=True)
        for row in self.rows:
            path=self.root/row['path'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(row['sample_id'].encode())
            row['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
            self.data['dispositions'][int(row['sample_id'][1:])]['sha256']=row['sha256']
        original='C:/fixture/repo/research/datasets/admitted.json'
        raw=(json.dumps({'payload':self.data,'sha256':ev.digest(self.data)},sort_keys=True)+'\n').encode()
        copy_path=data/'metadata.json';copy_path.write_bytes(raw)
        mapping=dict(original_path=original,windows_path=original,repo_path='research/datasets/metadata.json',sha256=hashlib.sha256(raw).hexdigest())
        source_manifest=dict(source=dict(sha256=h('source')),dispositions=copy.deepcopy(self.data['dispositions']))
        manifest=data/'manifest.json';ev.gpu.write_sealed(manifest,source_manifest)
        report=data/'report.json';ev.write(report,dict(source_sha256=h('source')))
        manifest_mapping=dict(original_path='C:/fixture/repo/research/datasets/manifest.json',windows_path='C:/fixture/repo/research/datasets/manifest.json',repo_path='research/datasets/manifest.json',sha256=ev.sha(manifest))
        report_mapping=dict(original_path='C:/fixture/repo/research/datasets/report.json',windows_path='C:/fixture/repo/research/datasets/report.json',repo_path='research/datasets/report.json',sha256=ev.sha(report))
        manifest_record=dict(path=manifest_mapping['original_path'],sha256=manifest_mapping['sha256'])
        report_record=dict(path=report_mapping['original_path'],sha256=report_mapping['sha256'])
        return dict(kind='parcel_source_test_transport_v1',windows_repo_root='C:/fixture/repo',admission=self.data,
            source_sha256=h('source'),metadata=[mapping,manifest_mapping,report_mapping],roots=[dict(path=original,sha256=mapping['sha256']),manifest_record,report_record],
            original_manifest_record=manifest_record,source_report_record=report_record,
            admission_record=dict(path=original,sha256=mapping['sha256']),code=ev.code_bindings())

    def test_portable_snapshot_verifies_exact_metadata_closure_and_encoded_assets(self):
        snapshot=self.portable_snapshot()
        with patch.object(ev,'ROOT',self.root):
            self.assertEqual(ev.verify_transport(snapshot)['rows'],self.rows)
            for change in ('metadata','asset','unused','duplicate','foreign','admission','source_header'):
                value=copy.deepcopy(snapshot)
                if change=='metadata':value['metadata'][0]['sha256']=h('changed')
                if change=='asset':value['admission']['rows'][0]['sha256']=h('changed')
                if change=='unused':value['metadata'].append(dict(value['metadata'][0],original_path='C:/fixture/repo/unused.json',repo_path='research/datasets/unused.json'))
                if change=='duplicate':value['metadata'].append(value['metadata'][0])
                if change=='foreign':value['metadata'][0]['windows_path']='C:/other/admitted.json'
                if change=='admission':value['admission']['dispositions'][90]['sha256']=h('changed')
                if change=='source_header':value['source_sha256']=h('new-once-key')
                with self.subTest(change=change),self.assertRaises(ValueError):ev.verify_transport(value)

    def test_preflight_rejects_test_access_wrong_context_and_excess_cost(self):
        context={'fixture':'context'}
        proof=dict(kind='parcel_source_test_preflight_v1',status='pass',context_sha256=ev.digest(context),
            no_test_access=True,input_scope='exposed_validation',ordered_fit_ids=list(ev.FIT_IDS),
            models=[dict(fit_id=f,cold_seconds=10.,projected_seconds=50.,state_unchanged=True) for f in ev.FIT_IDS],
            projected_phase_seconds=150.,evidence=[])
        for change in ('valid','test','context','cost','order','update'):
            value=copy.deepcopy(proof)
            if change=='test':value['no_test_access']=False
            if change=='context':value['context_sha256']=h('other')
            if change=='cost':value['models'][0]['projected_seconds']=181.
            if change=='order':value['ordered_fit_ids'].reverse()
            if change=='update':value['models'][0]['state_unchanged']=False
            with self.subTest(change=change):
                if change=='valid':ev.validate_preflight(value,context)
                else:
                    with self.assertRaises(ValueError):ev.validate_preflight(value,context)

    def native_fixture(self):
        target=self.root/ev.FIT_IDS[0];target.mkdir();prepared=dict(key=h('prepared'),binding=dict(code=ev.code_bindings(),activation_helper=dict(sha256=h('helper'))))
        unit='iilas-gpu-source-'+prepared['key'][:12]+'-0.service'
        properties=dict(MemoryMax=4096*1024**2,MemorySwapMax=0,CPUQuotaPerSecUSec=1000000,RuntimeMaxUSec=180000000,TimeoutStopUSec=5000000,KillMode='control-group')
        request=dict(command=ev.worker_command(self.root,ev.FIT_IDS[0]),unit_name=unit,output=str(target),output_tree=str(self.root),max_output_bytes=512*1024**2,
            code_sha256=prepared['binding']['code']['parcel_gpu_runtime.py'],activation_sha256=h('helper'),armed_monotonic=100.,effective_wall_seconds=180.,phase_deadline_monotonic=800.,requested_max_wall_seconds=180,
            resource_profile='parcel_gpu_memory_v3',memory_limit_bytes=4096*1024**2,admission_memory_bytes=6144*1024**2,live_memory_floor_bytes=2048*1024**2,root_cache_policy='fixed_root_linux_cache_once_v1')
        ev.write(target/'request.json',request)
        ev.write(target/'worker-envelope.json',dict(request_sha256=ev.sha(target/'request.json'),proof=dict(unit_name=unit,properties=properties)))
        ev.write(target/'worker-terminal.json',dict(returncode=0))
        native=dict(status='success',returncode=0,elapsed_seconds=10.,peak_rss_bytes=1024,requested_max_wall_seconds=180,effective_wall_seconds=180.,
            phase_deadline_monotonic=800.,armed_monotonic=100.,max_output_bytes=512*1024**2,output_tree=str(self.root),unit_name=unit,
            resource_profile='parcel_gpu_memory_v3',memory_limit_bytes=4096*1024**2,admission_memory_bytes=6144*1024**2,live_memory_floor_bytes=2048*1024**2,
            root_cache_policy='fixed_root_linux_cache_once_v1',properties=properties,cleanup=dict(status='clean',unit_inactive=True,cgroup_empty=True,remaining_pids=[]),
            request_sha256=ev.sha(target/'request.json'),worker_envelope_sha256=ev.sha(target/'worker-envelope.json'),worker_terminal_sha256=ev.sha(target/'worker-terminal.json'))
        ev.write(target/'native-result.json',native)
        return target,prepared,native

    def test_native_evaluator_requires_512mib_exact_command_hashes_and_cleanup(self):
        target,prepared,native=self.native_fixture()
        ev.verify_native(target,prepared,ev.FIT_IDS[0],native)
        for change in ('quota','cleanup','unit','envelope'):
            value=copy.deepcopy(native)
            if change=='quota':value['max_output_bytes']=128*1024**2
            if change=='cleanup':value['cleanup']['status']='unconfirmed'
            if change=='unit':value['unit_name']='iilas-gpu-other.service'
            if change=='envelope':value['worker_envelope_sha256']=h('changed')
            with self.subTest(change=change),self.assertRaises(ValueError):ev.verify_native(target,prepared,ev.FIT_IDS[0],value)

    def test_context_rejects_model_proof_environment_and_code_drift(self):
        context=dict(policy=ev.evaluation_policy(),code=ev.code_bindings(),environment={'fixture':'env'},
            activation_helper=dict(path=str(self.root/'helper.sh'),sha256=h('helper')),transport=dict(repo_path='x',sha256=h('t')))
        prepared=dict(profile=ev.PROFILE,key=ev.digest(context),binding=context,preflight=dict(repo_path='p',sha256=h('p')))
        # Context verification is the expensive OS boundary; prepared identities
        # still must reject edits before calling it or opening preflight bytes.
        bad=copy.deepcopy(prepared);bad['binding']['code']['parcel_source_test_evaluate.py']=h('changed')
        with patch.object(ev,'_read_sealed',return_value=bad),self.assertRaises(ValueError):ev.read_prepared(self.root/'prepared.json')

    def test_variable_snapshot_requires_restored_optimizer_and_preserves_bytes(self):
        class Array:
            shape=(2,);dtype='float32'
            def tobytes(self):return b'artificial-variable'
        class Variable:
            path='fixture/variable';shape=(2,);dtype='float32'
            def numpy(self):return Array()
        class Counter:
            def numpy(self):return 945
        class Optimizer:
            variables=[Variable()];iterations=Counter()
        class Model:
            variables=[Variable()];optimizer=Optimizer()
        value=ev.snapshot_state(Model())
        self.assertEqual(value['optimizer_iterations'],945)
        self.assertEqual(value['model_variables'][0]['sha256'],hashlib.sha256(b'artificial-variable').hexdigest())
        Model.optimizer=None
        with self.assertRaises(ValueError):ev.snapshot_state(Model())

    def test_serial_controller_preserves_failed_claim_and_never_runs_comparator_after_guard_failure(self):
        snapshot=dict(admission=self.data,source_sha256=h('source'))
        context=dict(transport={'fixture':'transport'},models={fid:dict(self.model(),fit_id=fid) for fid in ev.FIT_IDS})
        prepared=dict(key=h('prepared'),binding=context,preflight={})
        out=self.root/'outputs/run';out.parent.mkdir()
        calls=[]
        def worker(command,target,*args,**kwargs):
            calls.append(target.name);target.mkdir();ev.write(target/'attempt.json',self.attempt());return {'status':'failed'}
        with patch.object(ev,'ROOT',self.root),patch.object(ev,'read_prepared',return_value=(prepared,snapshot)),\
             patch.object(ev.gpu,'exclusive_job',return_value=__import__('contextlib').nullcontext({'retain':False})),\
             patch.object(ev.transport,'_git_check'),patch('parcel_gpu_runtime.run_worker',side_effect=worker),\
             patch.object(ev,'verify_native',side_effect=ValueError('artificial native failure')):
            with self.assertRaises(ValueError):ev.evaluate(self.root/'prepared.json',out)
            self.assertEqual(calls,[ev.FIT_IDS[0]])
            claims=list((self.root/'research/datasets/parcel-source-test-evaluation-registry').iterdir())
            self.assertEqual(len(claims),1);self.assertTrue((claims[0]/'failed.json').is_file())
            with self.assertRaises(ValueError):ev.evaluate(self.root/'prepared.json',self.root/'outputs/second')
            self.assertEqual(calls,[ev.FIT_IDS[0]])

    def test_same_compiled_scorer_retains_batch_outputs_before_shape_guard(self):
        class Values:
            def __init__(self,value):self.value=value
            def tolist(self):return self.value
        class Tensor:
            device='/device:GPU:0'
            def __init__(self,value):self.value=value
            def numpy(self):return Values(self.value)
        class TF:
            @staticmethod
            def convert_to_tensor(value):return value
        def forward(images,labels):
            return Tensor([[.8,.2] for _ in labels]),Tensor([[math.log(.8),math.log(.2)] for _ in labels]),Tensor([.2 for _ in labels])
        batches=[([0]*4,[0,1,1,0],.01),([0],[1],.01)]
        with patch.object(ev.gpu,'compiled_validation_forward',return_value=forward):
            raw,sizes,devices,timing=ev.score_rows(TF(),object(),self.rows,iter(batches),self.root)
        self.assertEqual(sizes,[4,1]);self.assertEqual(len(raw),5)
        self.assertEqual([r['sample_id'] for r in raw],[r['sample_id'] for r in self.rows])
        self.assertTrue((self.root/'batch-000.json').is_file());self.assertTrue((self.root/'batch-001.json').is_file())
        six=self.root/'six';six.mkdir();rows=self.rows+[dict(self.rows[0],sample_id='sixth')]
        with patch.object(ev.gpu,'compiled_validation_forward',return_value=forward):
            raw,sizes,devices,timing=ev.score_rows(TF(),object(),rows,iter([([0]*4,[0,1,1,0],.01),([0]*2,[1,0],.01)]),six)
        self.assertEqual(sizes,[4,2]);self.assertEqual(len(raw),6)
        self.assertEqual(raw[-1]['sample_id'],'sixth')

    def test_preflight_projection_uses_cold_trace_plus_twofold_steady_cost(self):
        attempt=self.attempt();attempt.update(startup_seconds=20.,timing=[dict(size=4,decode_seconds=.4,forward_seconds=10.),dict(size=2,decode_seconds=.2,forward_seconds=.1)])
        self.assertAlmostEqual(ev.project_preflight(attempt,95),58.5)
        attempt['timing'][1]['forward_seconds']=10.
        with self.assertRaises(ValueError):ev.project_preflight(attempt,95)

    def test_preflight_projection_includes_native_tail_and_import_overhead(self):
        attempt=self.attempt();attempt.update(startup_seconds=20.,timing=[dict(size=4,decode_seconds=.4,forward_seconds=10.),dict(size=2,decode_seconds=.2,forward_seconds=.1)])
        self.assertAlmostEqual(ev.project_preflight(attempt,95,native=dict(elapsed_seconds=60.7)),88.5)

    def test_attempt_file_binds_incremental_batches_state_and_phase_identity(self):
        attempt=self.attempt();attempt.update(key=h('key'),purpose='evaluation')
        prepared=dict(key=h('key'),binding=dict(models={ev.FIT_IDS[0]:self.model()}))
        target=self.root/'evidence';target.mkdir()
        self.write_attempt_evidence(target,attempt)
        ev.verify_attempt_files(target,prepared,self.rows,ev.FIT_IDS[0])
        first=target/'batch-000.json';record=json.loads(first.read_text());record['probabilities'][0]=[.6,.4]
        first.unlink();ev.write(first,record)
        with self.assertRaises(ValueError):ev.verify_attempt_files(target,prepared,self.rows,ev.FIT_IDS[0])

    def test_child_native_proof_cannot_disagree_with_wrapper_envelope(self):
        attempt=self.attempt();attempt.update(key=h('key'),purpose='evaluation')
        prepared=dict(key=h('key'),binding=dict(models={ev.FIT_IDS[0]:self.model()}))
        target=self.root/'child';target.mkdir();self.write_attempt_evidence(target,attempt)
        path=target/'attempt.json';changed=json.loads(path.read_text());changed['native']['unit_name']='foreign.service'
        path.unlink();ev.write(path,changed)
        with self.assertRaisesRegex(ValueError,'native proof'):ev.verify_attempt_files(target,prepared,self.rows,ev.FIT_IDS[0])

    def write_attempt_evidence(self,target,attempt):
        unit='iilas-gpu-source-'+attempt['key'][:12]+'-'+str(ev.FIT_IDS.index(attempt['fit_id']))+'.service'
        native=dict(resource_profile='parcel_gpu_memory_v3',unit_name=unit,cgroup='/fixture/'+unit,pid=222,main_pid=111,
            current_members=[111,222],properties=dict(MainPID=111,MemoryMax=4096*1024**2),
            cgroup_limits=dict(memory_max=4096*1024**2,memory_swap_max=0,cpu_quota=100000,cpu_period=100000))
        attempt['native']=native
        ev.write(target/'worker-envelope.json',dict(proof=dict(native,pid=111,current_members=[111])))
        if not (target/'attempt.json').exists():ev.write(target/'attempt.json',attempt)
        for name in ('before','after'):ev.write(target/('state-'+name+'.json'),attempt['state_'+name])
        offset=0
        for index,size in enumerate(attempt['batch_sizes']):
            raw=attempt['raw'][offset:offset+size]
            ev.write(target/('batch-'+str(index).zfill(3)+'.json'),dict(sample_ids=[r['sample_id'] for r in raw],
                input_labels=[('Normal','Damaged').index(r['label']) for r in raw],probabilities=[r['probabilities'] for r in raw],
                logits=[r['logits'] for r in raw],keras_sparse_ce=[r['keras_sparse_ce'] for r in raw],devices=attempt['output_devices'],size=size))
            offset+=size

    def test_missing_preflight_native_evidence_cannot_become_a_prepared_protocol(self):
        proof=dict(kind='parcel_source_test_preflight_v1',status='pass',context_sha256=ev.digest({}),
            no_test_access=True,input_scope='exposed_validation',ordered_fit_ids=list(ev.FIT_IDS),models=[],
            development_transport={'repo_path':'absent.json','sha256':h('missing')})
        with self.assertRaises((ValueError,FileNotFoundError)):ev.verify_preflight_evidence(proof,{},dict(admission=self.data))

    def test_mounted_windows_provenance_rejects_traversal_and_unproven_alias(self):
        self.assertEqual(str(ev._mounted_windows('/mnt/c/Users/fixture/metadata.json')),'C:\\Users\\fixture\\metadata.json')
        for original in ('/home/fixture/data.json','/mnt/c/../private.json','/mnt/invalid/data.json'):
            with self.subTest(original=original),self.assertRaises(ValueError):ev._mounted_windows(original)

    def test_empty_strict_bootstrap_retains_undefined_intervals_and_all_dispositions(self):
        value=copy.deepcopy(self.data)
        for row in value['rows']:row['strict_publisher_partition_eligible']=False
        for row in value['dispositions'][:5]:row['strict_publisher_partition_eligible']=False
        result=ev.summarize(value,[dict(fit_id=f,raw=self.scores) for f in ev.FIT_IDS])
        self.assertEqual(result['strict']['support']['images'],0)
        interval=result['strict']['uncertainty']['paired_comparator_minus_primary']['image']['accuracy']
        self.assertEqual(interval,dict(lower=None,upper=None,valid_replicates=0,undefined_replicates=2000))
        self.assertEqual(len(result['test_dispositions']),102)

    def test_controller_rejects_valid_first_attempt_rewritten_by_comparator(self):
        snapshot=dict(admission=self.data,source_sha256=h('source'));out=self.root/'outputs/run';out.parent.mkdir()
        context=dict(models={fid:dict(self.model(),fit_id=fid) for fid in ev.FIT_IDS})
        prepared=dict(key=h('prepared'),binding=context,preflight={})
        def worker(command,target,*args,**kwargs):
            target.mkdir();attempt=self.attempt();attempt.update(fit_id=target.name,key=prepared['key'],purpose='evaluation')
            self.write_attempt_evidence(target,attempt)
            ev.write(target/'native-result.json',{})
            if target.name==ev.FIT_IDS[1]:
                first=out/ev.FIT_IDS[0]/'attempt.json';first.unlink()
                modified=self.attempt();modified.update(key=prepared['key'],purpose='evaluation',raw=predictions(self.rows,[[.6,.4]]*5))
                ev.write(first,modified)
            return dict(cleanup=dict(status='clean'))
        with patch.object(ev,'ROOT',self.root),patch.object(ev,'read_prepared',return_value=(prepared,snapshot)),\
             patch.object(ev.gpu,'exclusive_job',return_value=__import__('contextlib').nullcontext({'retain':False})),\
             patch.object(ev.transport,'_git_check'),patch('parcel_gpu_runtime.run_worker',side_effect=worker),\
             patch.object(ev,'verify_native',return_value={}),patch.object(ev,'verify_context',return_value=snapshot):
            with self.assertRaisesRegex(ValueError,'attempt bytes changed'):ev.evaluate(self.root/'prepared.json',out)

    def review_metadata_graph(self,sheet_path):
        rendered=dict(accuracy_claim=False,model_predictions=0,samples=24,
            sheets=[dict(path=sheet_path,sha256=h('opaque review image'))],
            support={split+'|'+label:dict(requested=n,selected=n,shortfall=0)
                for split,n in (('train',8),('validation',4)) for label in ('Normal','Damaged')},test_pixels_decoded=0)
        paths={};bindings={}
        for name in ('policy','rendered','observations','lock','metadata_review','sample_key'):
            original='C:/fixture/review/'+name+'.json';local=self.root/(name+'.json')
            local.write_text(json.dumps(rendered if name=='rendered' else {}),encoding='utf-8')
            paths[original]=local;bindings[name]=dict(path=original,sha256=ev.sha(local))
        review=dict(schema_version=1,policy='publisher_visible_condition_pilot_with_sampled_review',decision='accept',bindings=bindings)
        local=self.root/'review.json';local.write_text(json.dumps(review),encoding='utf-8')
        original='C:/fixture/review/review.json';paths[original]=local
        return [dict(path=original,sha256=ev.sha(local))],paths,review,rendered

    def test_typed_review_support_pngs_are_opaque_original_json_content(self):
        for index,path in enumerate(('sheet-01.png','C:/fixture/review/sheet-01.png')):
            roots,paths,review,rendered=self.review_metadata_graph(path)
            before=paths[review['bindings']['rendered']['path']].read_bytes();resolved=[]
            def resolve(record):
                resolved.append(record['path'])
                self.assertNotEqual(record['path'],path,'Supporting PNG was interpreted as an authoritative edge')
                self.assertIn(record['path'],paths,'Unresolved authoritative metadata')
                return paths[record['path']]
            with self.subTest(path=path):
                edges=ev._walk_records(roots,resolve)
                self.assertEqual(len(edges),7)
                self.assertNotIn(path,resolved)
                self.assertEqual(paths[review['bindings']['rendered']['path']].read_bytes(),before)

    def test_visual_role_does_not_hide_missing_authoritative_json_or_untyped_png(self):
        roots,paths,review,rendered=self.review_metadata_graph('sheet-01.png')
        def resolve(record):
            ev.require(record['path'] in paths,'Missing or foreign authoritative metadata')
            return paths[record['path']]
        with self.assertRaises(ValueError):ev._walk_records([review['bindings']['rendered']],resolve)
        for missing in ('C:/fixture/review/missing.json','D:/private/foreign.json','missing.json'):
            changed=copy.deepcopy(review);changed['bindings']['metadata_review']=dict(path=missing,sha256=h('missing'))
            with self.subTest(missing=missing),self.assertRaises(ValueError):ev._walk_records(changed,resolve)
        changed=copy.deepcopy(review);changed['bindings']['policy']=dict(path='C:/fixture/review/authoritative.png',sha256=h('not metadata'))
        with self.assertRaises(ValueError):ev._walk_records(changed,resolve)

    def test_only_the_fixed_blind_rendered_contract_grants_opaque_sheet_role(self):
        roots,paths,review,rendered=self.review_metadata_graph('sheet-01.png')
        def resolve(record):
            ev.require(record['path'] in paths,'Supporting reference incorrectly resolved')
            return paths[record['path']]
        for change in ('predictions','test','claim','missing_support','relative_json'):
            bad=copy.deepcopy(rendered)
            if change=='predictions':bad['model_predictions']=1
            if change=='test':bad['test_pixels_decoded']=1
            if change=='claim':bad['accuracy_claim']=True
            if change=='missing_support':bad['support'].pop('train|Normal')
            if change=='relative_json':bad['sheets'][0]['path']='missing.json'
            local=paths[review['bindings']['rendered']['path']];local.write_text(json.dumps(bad),encoding='utf-8')
            with self.subTest(change=change),self.assertRaises(ValueError):
                ev._walk_records(review,resolve)

    def test_rendered_binding_requires_contract_in_first_dereferenced_json(self):
        roots,paths,review,rendered=self.review_metadata_graph('sheet-01.png')
        leaf=self.root/'indirect.json';leaf.write_text(json.dumps(rendered),encoding='utf-8')
        paths['C:/fixture/review/indirect.json']=leaf
        proxy=paths[review['bindings']['rendered']['path']]
        proxy.write_text(json.dumps(dict(path='C:/fixture/review/indirect.json',sha256=ev.sha(leaf))),encoding='utf-8')
        with self.assertRaises(ValueError):ev._walk_records(review,lambda record:paths[record['path']])


if __name__=='__main__':unittest.main()
