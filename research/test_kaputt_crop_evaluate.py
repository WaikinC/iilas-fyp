"""Software-only evaluator tests; never acquire the reserved source images."""
import copy
import importlib.util
import json
import math
import types
import sys
from pathlib import Path
import tempfile
import unittest
import weakref
from unittest.mock import patch
from contextlib import ExitStack

SPEC = importlib.util.find_spec('kaputt_crop_evaluate')
if SPEC is not None:
    import kaputt_crop_evaluate as evaluate
else:
    evaluate = None


def rows():
    return [dict(sample_id=f's{i}', capture_id=f'c{i}', item_identifier=f'item{i}',
                 dependency_group_id=group, label=label, split='test',
                 image_sha256=str(i)*64, decoded_sha256=str(i+1)*64)
            for i, (group, label) in enumerate([
                ('a', 'Normal'), ('a', 'Damaged'), ('b', 'Damaged')])]


class PureEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(evaluate, 'new evaluator module is required')

    def test_unequal_mixed_components_keep_equal_mass_and_abstentions_are_misses(self):
        cohort = rows()
        self.assertEqual(evaluate.component_weights(cohort), [.75, .75, 1.5])
        result = evaluate.compute_metrics(cohort, [[.9, .1], [.5, .5], [.1, .9]])
        weighted = result['component_weighted']
        self.assertEqual(weighted['confusion'], [[.75, 0, 0], [0, 1.5, .75]])
        self.assertEqual(weighted['confusion_columns'], ['Normal', 'Damaged', 'Abstain'])
        self.assertEqual(weighted['accuracy'], .75)
        self.assertEqual(weighted['coverage'], .75)
        self.assertAlmostEqual(weighted['macro_f1'], .9)
        self.assertAlmostEqual(weighted['nll'], -.75*math.log(.9)-.25*math.log(.5))
        self.assertAlmostEqual(result['image_unweighted']['accuracy'], 2/3)
        self.assertAlmostEqual(result['image_unweighted']['macro_f1'], 5/6)
        self.assertEqual(weighted['per_class']['Damaged']['false_negative_weight'], .75)

    def test_undefined_precision_and_recall_are_null_with_explicit_denominators(self):
        result = evaluate.compute_metrics(rows()[:1], [[0, 1]])['image_unweighted']
        self.assertIsNone(result['per_class']['Normal']['precision'])
        self.assertIsNone(result['per_class']['Damaged']['recall'])
        self.assertEqual(result['per_class']['Normal']['predicted_weight'], 0)
        self.assertEqual(result['per_class']['Damaged']['support_weight'], 0)
        self.assertEqual(result['zero_division_f1'], 0)

    def test_probabilities_reject_bool_nonfinite_shape_range_sum_and_accept_exact_ties(self):
        for vector in ([True, False], [float('nan'), .5], [float('inf'), 0],
                       [1], [[.5], [.5]], ['.5', .5], [-.1, 1.1], [.4, .4],
                       {'0': .5, '1': .5}, None):
            with self.subTest(vector=vector), self.assertRaises(ValueError):
                evaluate.validate_probabilities(vector)
        self.assertEqual(evaluate.decision([.5, .5]), 'Abstain')
        self.assertEqual(evaluate.decision([.500000001, .499999999]), 'Normal')
        self.assertEqual(evaluate.validate_probabilities([.5, .500009]), (.5, .500009))
        with self.assertRaises(ValueError): evaluate.validate_probabilities([.5, .500011])

    def test_component_rows_reject_duplicate_foreign_labels_missing_group_and_mixed_splits(self):
        for cohort in ([], rows()+[rows()[0]], [dict(rows()[0], label='Other')],
                       [dict(rows()[0], dependency_group_id='')],
                       [rows()[0], dict(rows()[1], split='validation')]):
            with self.subTest(cohort=cohort), self.assertRaises(ValueError):
                evaluate.component_weights(cohort)

    def test_nll_clips_zero_at_fixed_floor(self):
        result = evaluate.compute_metrics(rows()[:1], [[0, 1]])
        self.assertAlmostEqual(result['component_weighted']['nll'], -math.log(1e-7))

    def test_bootstrap_insufficient_support_and_mixed_support_overlap(self):
        result = evaluate.paired_component_bootstrap(rows(), [[.9,.1],[.1,.9],[.1,.9]],
                                                    [[.1,.9],[.9,.1],[.9,.1]])
        self.assertEqual(result['status'], 'insufficient_support')
        self.assertEqual(result['replicates'], 0)
        self.assertEqual(result['components_with_class'], {'Normal': 1, 'Damaged': 2})
        self.assertTrue(result['class_support_counts_overlap'])

    def test_bootstrap_fixed_pairing_reproducible_degenerate_and_small_group_warning(self):
        cohort = [dict(rows()[0], sample_id=f's{i}', dependency_group_id=f'g{i}',
                       label='Normal' if i < 5 else 'Damaged') for i in range(10)]
        left = [[.9,.1] if i < 5 else [.1,.9] for i in range(10)]
        right = [[.1,.9] if i < 5 else [.9,.1] for i in range(10)]
        result = evaluate.paired_component_bootstrap(cohort, left, right)
        self.assertEqual(result, evaluate.paired_component_bootstrap(cohort, left, right))
        self.assertEqual(result['replicates'], 2000)
        self.assertEqual(result['seed'], 42)
        self.assertEqual(result['interval_95'], [1., 1.])
        self.assertEqual(result['point_difference'], 1.)
        self.assertTrue(result['degenerate_interval'])
        self.assertEqual(result['percentile_indices'], [49, 1949])
        self.assertIn('fewer_than_20_components_per_class', result['warnings'])
        self.assertEqual(result['estimand'], 'mean_dependency_component_correctness_difference')

    def test_raw_records_require_exact_order_associations_model_and_decision(self):
        model = dict(architecture='mobilenetv2', artifact_sha256='a'*64, contrast='clahe')
        records = [dict(row, row_index=i, **model, probabilities=[.9,.1], decision='Normal')
                   for i,row in enumerate(rows())]
        self.assertEqual(evaluate.validate_raw_records(rows(), records, model), [[.9,.1]]*3)
        cases = [records[:-1], records+[records[0]], list(reversed(records))]
        for field,value in [('sample_id','foreign'), ('image_sha256','b'*64),
                            ('decoded_sha256','b'*64), ('label','Damaged'),
                            ('dependency_group_id','foreign'), ('artifact_sha256','c'*64),
                            ('contrast','none'), ('decision','Damaged'), ('row_index',True)]:
            bad = copy.deepcopy(records); bad[0][field]=value; cases.append(bad)
        for bad in cases:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                evaluate.validate_raw_records(rows(), bad, model)

    def test_comparative_report_refuses_missing_class_or_partial_model(self):
        model = dict(architecture='mobilenetv2', artifact_sha256='a'*64, contrast='clahe')
        other = dict(architecture='efficientnetb0', artifact_sha256='b'*64, contrast='none')
        def raw(cohort, candidate):
            return [dict(row, row_index=i, **candidate, probabilities=[.9,.1], decision='Normal')
                    for i,row in enumerate(cohort)]
        with self.assertRaises(ValueError):
            evaluate.comparative_metrics(rows()[:1], raw(rows()[:1],model), raw(rows()[:1],other), [model,other])
        with self.assertRaises(ValueError):
            evaluate.comparative_metrics(rows(), raw(rows(),model), raw(rows(),other)[:-1], [model,other])

    def test_fixed_always_normal_reference_keeps_damaged_recall_zero(self):
        self.assertTrue(hasattr(evaluate, 'always_normal_reference'), 'fixed trivial reference required')
        result = evaluate.always_normal_reference(rows())
        self.assertEqual(result['component_weighted']['accuracy'], .25)
        self.assertEqual(result['image_unweighted']['accuracy'], 1/3)
        self.assertEqual(result['component_weighted']['coverage'], 1)
        self.assertEqual(result['component_weighted']['per_class']['Damaged']['recall'], 0)


class WorkerBoundaryTests(unittest.TestCase):
    def test_hidden_entries_fail_before_metadata_or_heavy_import_without_job(self):
        self.assertTrue(hasattr(evaluate, '_reference'), 'closed hidden worker entries required')
        with patch.dict('os.environ', {}, clear=True):
            for name,args in [('_reference',('missing',)),('_acquire',('missing',)),
                              ('_infer',('missing','mobilenetv2')),('_score',('missing',)),
                              ('_phase',('missing','attempt'))]:
                with self.subTest(name=name), self.assertRaises(evaluate.runtime.RuntimeSafetyError):
                    getattr(evaluate,name)(*args)

    def test_saved_model_shape_guard_rejects_foreign_and_multi_input_models(self):
        self.assertTrue(hasattr(evaluate, 'validate_model_shape'), 'strict saved model shapes required')
        class Model: input_shape=(None,224,224,3); output_shape=(None,2)
        evaluate.validate_model_shape(Model())
        for inputs,outputs in [((1,224,224,3),(None,2)),((None,224,224,1),(None,2)),
                               ([(None,224,224,3)],(None,2)),((None,224,224,3),(None,3))]:
            model=Model();model.input_shape=inputs;model.output_shape=outputs
            with self.subTest(inputs=inputs,outputs=outputs), self.assertRaises(ValueError):
                evaluate.validate_model_shape(model)

    def test_nonconstant_bootstrap_averages_components_rather_than_images(self):
        cohort = [dict(rows()[0], sample_id=f's{i}', dependency_group_id=f'g{i//2}',
                       label='Normal' if i % 2 == 0 else 'Damaged') for i in range(10)]
        # First mixed component: left wins twice, next two: one win each,
        # fourth: tied correctness, fifth: right wins twice. Means 1,.5,.5,0,-1.
        left_correct = [True,True,True,False,True,False,True,False,False,False]
        right_correct = [False,False,False,False,False,False,True,False,True,True]
        def vectors(correct):
            return [[.9,.1] if (row['label']=='Normal') == hit else [.1,.9]
                    for row,hit in zip(cohort,correct)]
        result = evaluate.paired_component_bootstrap(cohort, vectors(left_correct), vectors(right_correct))
        self.assertAlmostEqual(result['point_difference'], .2)
        # Every resample is an average of five values in [-1,1], hence
        # its confidence bounds must stay within this hand-derived support.
        self.assertGreaterEqual(result['interval_95'][0], -1)
        self.assertLess(result['interval_95'][0], 0)
        self.assertGreater(result['interval_95'][1], 0)
        self.assertLessEqual(result['interval_95'][1], 1)
        self.assertFalse(result['degenerate_interval'])

    def test_outer_drain_owner_rejects_foreign_job_before_native_api(self):
        self.assertTrue(hasattr(evaluate,'wait_attempt_drain'), 'explicit outer Job drain verification required')
        with tempfile.TemporaryDirectory(prefix='eval-drain-software-',
             dir=Path(__file__).resolve().parents[1]/'research/datasets') as folder:
            out=Path(folder)
            evaluate.base.write_sealed(out/'attempt-native-owner.json',{'job':'foreign','pid':1})
            with self.assertRaises(ValueError):evaluate.wait_attempt_drain(out)


class InferenceSoftwareTests(unittest.TestCase):
    def test_shape_one_safe_load_ordered_probabilities_and_reader_recheck(self):
        import numpy as np
        with tempfile.TemporaryDirectory(prefix='eval-infer-software-',
             dir=Path(__file__).resolve().parents[1]/'research/datasets') as folder:
            out=Path(folder); artifact=out/'classifier.keras';artifact.write_bytes(b'explicit software model double; never loaded')
            model=dict(architecture='mobilenetv2',contrast='clahe',artifact_sha256=evaluate.runtime.sha256_file(artifact))
            cohort=rows();doc={'rows':cohort}
            seen=[]
            class Tensor:
                def numpy(inner):return np.array([[.75,.25]],dtype=np.float32)
            class Model:
                input_shape=(None,224,224,3);output_shape=(None,2)
                def __call__(inner, value, *, training):
                    self.assertEqual(value.shape,(1,224,224,3));self.assertFalse(training)
                    return Tensor()
            def load(path,*,compile,safe_mode):
                self.assertEqual(path,artifact);self.assertFalse(compile);self.assertTrue(safe_mode)
                seen.append('safe_load');return Model()
            no_op=lambda *a,**kw:None
            tf=types.SimpleNamespace(config=types.SimpleNamespace(threading=types.SimpleNamespace(
                set_intra_op_parallelism_threads=no_op,set_inter_op_parallelism_threads=no_op)),
                keras=types.SimpleNamespace(utils=types.SimpleNamespace(set_random_seed=no_op),
                    mixed_precision=types.SimpleNamespace(set_global_policy=no_op),models=types.SimpleNamespace(load_model=load)))
            class Reader:
                rows=cohort
                def read(inner,row):seen.append(row['sample_id']);return np.zeros((64,64,3),dtype=np.uint8)
                def verify(inner):seen.append('verified');return {}
            intake=evaluate._intake();binding={'core_sha256':'a'*64}
            with ExitStack() as stack:
                stack.enter_context(patch.dict(sys.modules,{'tensorflow':tf}))
                stack.enter_context(patch.object(evaluate.runtime,'require_supervised_worker'))
                stack.enter_context(patch.object(evaluate.base,'worker_environment'))
                stack.enter_context(patch.object(evaluate,'verify_attempt',return_value=doc))
                stack.enter_context(patch.object(evaluate,'_selected_models',return_value=([model],
                    [dict(model,artifact=str(artifact))])))
                stack.enter_context(patch.object(evaluate,'_raw_binding',return_value=binding))
                stack.enter_context(patch.object(intake,'open_admitted_reader',return_value=Reader()))
                evaluate._infer(out,'mobilenetv2')
            self.assertEqual(seen,['safe_load','s0','s1','s2','verified'])
            raw=evaluate.load_raw_predictions(out/'mobilenetv2/raw.json',cohort,model,binding)
            self.assertEqual([r['probabilities'] for r in raw],[[.75,.25]]*3)


class RawDurabilityTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(evaluate, 'new evaluator module is required')
        self.assertTrue(hasattr(evaluate, 'RawPredictionWriter'), 'durable raw writer required')
        self.temp = tempfile.TemporaryDirectory(prefix='eval-software-',
            dir=Path(__file__).resolve().parents[1]/'research/datasets')
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.model = dict(architecture='mobilenetv2', artifact_sha256='a'*64, contrast='clahe')
        self.binding = {'core_sha256': 'b'*64, 'admission_sha256': 'c'*64}

    def test_partial_rows_are_durable_and_cannot_be_replaced_or_scored(self):
        writer = evaluate.RawPredictionWriter(self.root, rows(), self.model, self.binding)
        writer.append(rows()[0], [.9,.1])
        self.assertEqual(len((self.root/'raw.partial.jsonl').read_text().splitlines()), 1)
        with self.assertRaises(ValueError): writer.complete()
        writer.close()
        self.assertFalse((self.root/'raw.json').exists())
        with self.assertRaises(FileExistsError):
            evaluate.RawPredictionWriter(self.root, rows(), self.model, self.binding)
        with self.assertRaises((ValueError, FileNotFoundError)):
            evaluate.load_raw_predictions(self.root/'raw.json', rows(), self.model, self.binding)

    def test_completed_raw_binds_exact_jsonl_bytes_cohort_model_and_run(self):
        with evaluate.RawPredictionWriter(self.root, rows(), self.model, self.binding) as writer:
            for row in rows(): writer.append(row, [.5,.5])
            path = writer.complete()
        complete = evaluate.load_raw_predictions(path, rows(), self.model, self.binding)
        self.assertEqual([r['decision'] for r in complete], ['Abstain']*3)
        with self.assertRaises(ValueError):
            evaluate.load_raw_predictions(path, rows(), self.model, {'core_sha256':'d'*64})
        with (self.root/'raw.partial.jsonl').open('a') as stream: stream.write('{}\n')
        with self.assertRaises(ValueError):
            evaluate.load_raw_predictions(path, rows(), self.model, self.binding)

    def test_foreign_reordered_or_invalid_output_is_rejected_before_append(self):
        with evaluate.RawPredictionWriter(self.root, rows(), self.model, self.binding) as writer:
            for row, vector in ((rows()[1],[.9,.1]), (dict(rows()[0],label='Damaged'),[.9,.1]),
                                (rows()[0],[True,False])):
                with self.assertRaises(ValueError): writer.append(row, vector)
            self.assertEqual((self.root/'raw.partial.jsonl').stat().st_size, 0)


class ControlMetadataTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(hasattr(evaluate, 'load_evaluation_protocol'), 'closed evaluator protocol required')
        import kaputt_crop_test_intake as intake
        from test_kaputt_crop_train import POLICY
        self.intake = intake
        self.temp = tempfile.TemporaryDirectory(prefix='eval-control-software-',
            dir=Path(__file__).resolve().parents[1]/'research/datasets')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.out = self.root/'attempt'
        self.policy = copy.deepcopy(POLICY)

    def protocol(self):
        return dict(schema_version=1, profile='kaputt_crop_internal_test',
            evaluation_scope='development_only', input_scope='crop_only', operationally_approved=False,
            seed=42, class_order=['Normal','Damaged'], preprocessing='rgb-letterbox224-v1',
            confidence='uncalibrated', decision_rule='argmax-exact-tie-abstains',
            comparison=[{'architecture':'mobilenetv2','contrast':'clahe'},
                        {'architecture':'efficientnetb0','contrast':'none'}],
            metrics={'weighting':'equal_dependency_component_mean1','nll_floor':1e-7,
                     'abstentions_count_as_misses':True,'undefined_precision_recall':None,'zero_division_f1':0,
                     'always_normal_reference':True},
            bootstrap={'unit':'dependency_component','seed':42,'replicates':2000,
                       'percentile_indices':[49,1949],'minimum_components_per_class':5,
                       'small_group_warning_below':20,'direction':'mobilenetv2_minus_efficientnetb0'},
            policy=self.policy, policy_sha256=self.intake.POLICY_SHA256,
            resources=evaluate.resource_settings(), sources={'software_fixture.py':'a'*64},
            environment={'packages':{}}, reference_command=evaluate.worker_command('_reference', self.out),
            acquisition_command=evaluate.worker_command('_acquire', self.out),
            development={'development_key':'f'*64,'manifest':{'path':'unused','sha256':'a'*64},
                         'selection':{'path':'unused','sha256':'b'*64},'candidates_sha256':'c'*64,
                         'archive':{'bytes':1,'sha256':'d'*64}},
            negative_candidate={'path':str(self.root/'negative-selection.json'),'sha256':'e'*64})

    def save(self, doc):
        path=self.root/'protocol.json';path.write_text(json.dumps(doc));return path

    def test_protocol_rejects_full_policy_mutation_bool_numeric_and_raised_caps(self):
        original=self.protocol()
        with patch.object(evaluate,'code_bindings',return_value=original['sources']), \
             patch.object(evaluate.base,'environment',return_value=original['environment']):
            self.assertEqual(evaluate.load_evaluation_protocol(self.save(original),self.out),original)
            changes=[]
            bad=copy.deepcopy(original);bad['policy']['technical_rules']['minimum_side']=1;changes.append(bad)
            bad=copy.deepcopy(original);bad['seed']=True;changes.append(bad)
            bad=copy.deepcopy(original);bad['resources']['infer']['max_fit_seconds']=301;changes.append(bad)
            bad=copy.deepcopy(original);bad['bootstrap']['replicates']=1000;changes.append(bad)
            bad=copy.deepcopy(original);bad['metrics']['always_normal_reference']=False;changes.append(bad)
            bad=copy.deepcopy(original);bad['sources']={};changes.append(bad)
            bad=copy.deepcopy(original);bad['acquisition_command'][-1]=str(self.root/'foreign');changes.append(bad)
            for bad in changes:
                with self.subTest(bad=bad),self.assertRaises(ValueError):
                    evaluate.load_evaluation_protocol(self.save(bad),self.out)

    def test_unsafe_nonjson_protocol_refused_before_text_read(self):
        with patch.object(Path,'read_text',side_effect=AssertionError('metadata opened pixels')):
            with self.assertRaises(ValueError):evaluate.load_evaluation_protocol(self.root/'photo.jpg',self.out)

    def test_canonical_claim_rejects_historical_failed_or_copied_destination(self):
        key='f'*64
        with patch.object(evaluate,'ROOT',self.root):
            canonical,historical=evaluate.claim_paths(key)
            historical.mkdir(parents=True)
            with self.assertRaises(ValueError):evaluate.create_test_claim(key,self.out,{'x':1})
            historical.rmdir()
            with patch.object(evaluate.runtime,'_validate_output_path',side_effect=lambda p:Path(p)):
                claim=evaluate.create_test_claim(key,self.out,{'x':1})
                self.assertEqual(claim,canonical)
                (claim/'failed.json').write_text('{}')
                with self.assertRaises(ValueError):evaluate.create_test_claim(key,self.root/'copy',{'x':2})
            self.assertEqual(json.loads((claim/'started.json').read_text())['key'],key)

    def test_frozen_negative_candidate_mutation_refuses_before_postclaim_strict_guard(self):
        self.assertTrue(hasattr(evaluate,'verify_negative_snapshot'), 'immutable completed candidate snapshot required')
        original={'development_key':'f'*64,'selected':[{'artifact_sha256':'a'*64},{'artifact_sha256':'b'*64}]}
        path=self.root/'selection.json'
        selection={'status':'complete','candidate_selected':False,'selected':original['selected']}
        evaluate.base.write_sealed(path,selection)
        proof=self.root/'candidate-proof.json';proof.write_text('{}')
        snapshot={'selection':self.intake.metadata_record(path),'records':[self.intake.metadata_record(proof)],
                  'development_key':'f'*64,'sources':{},'environment':{'packages':{}}}
        with patch.object(self.intake.completed,'code_bindings',return_value={}), \
             patch.object(evaluate.base,'environment',return_value={'packages':{}}), \
             patch.object(self.intake.completed,'verify_selection',side_effect=AssertionError('no prefit guard after claim')):
            evaluate.verify_negative_snapshot(snapshot,{'selection':original})
            proof.write_text('{"changed":true}')
            with self.assertRaises(ValueError):evaluate.verify_negative_snapshot(snapshot,{'selection':original})


class MetadataLifetimeTests(unittest.TestCase):
    def test_worker_entries_release_unused_verified_context_before_builders(self):
        class Context(dict):
            pass
        core = {'manifest':{'path':'manifest.json'},'selection':{'path':'selection.json'}}
        request = {'core':core,'archive':'unused-metadata-only.tar.gz'}
        for entry in ('_reference','_acquire'):
            with self.subTest(entry=entry):
                observers = []
                def verify(output):
                    context = Context(artificial_metadata='software-only')
                    observers.append(weakref.ref(context))
                    return request,context
                calls = []
                def build(*args):
                    self.assertIsNone(observers[-1](), 'Unused full context retained during builder')
                    calls.append(args)
                intake = types.SimpleNamespace(build_reference_index=build,build_test_admission=build)
                with patch.object(evaluate.runtime,'require_supervised_worker'), \
                     patch.object(evaluate,'verify_request',side_effect=verify) as checked, \
                     patch.object(evaluate,'_intake',return_value=intake), \
                     patch.object(evaluate,'_binding',return_value={'core':core}):
                    getattr(evaluate,entry)(Path('artificial-output'))
                checked.assert_called_once_with(Path('artificial-output'))
                self.assertEqual(len(calls),1)
                self.assertEqual(calls[0][:2],('manifest.json','selection.json'))
                self.assertEqual(calls[0][-1],{'core':core})

    def test_attempt_releases_unused_context_before_nested_resource_launch(self):
        class Context(dict):
            pass
        class DiagnosticStop(Exception):
            pass
        observers, events = [], []
        def verify(output):
            context = Context(artificial_metadata='software-only')
            observers.append(weakref.ref(context))
            return {'core':{'development_key':'f'*64}},context
        class Supervisor:
            def __init__(inner,*args):
                pass
            def run(inner,command,*,fit_id,**kwargs):
                self.assertIsNone(observers[-1](), 'Unused full context retained during child execution')
                self.assertEqual(events,['deny'])
                self.assertEqual(fit_id,'reference')
                self.assertEqual(command,evaluate.worker_command('_reference',Path('artificial-output')))
                raise DiagnosticStop
        with patch.object(evaluate,'verify_controller_request',side_effect=verify,create=True) as checked, \
             patch.object(evaluate,'deny_existing_test_claim',side_effect=lambda key:events.append('deny')), \
             patch.object(evaluate.runtime,'ResourceSupervisor',Supervisor), \
             patch.object(evaluate,'create_test_claim',side_effect=AssertionError('No scientific claim permitted')):
            with self.assertRaises(DiagnosticStop):
                evaluate._attempt_phase(Path('artificial-output'))
        checked.assert_called_once_with(Path('artificial-output'))


class LightweightControlTests(unittest.TestCase):
    protocol = ControlMetadataTests.protocol
    save = ControlMetadataTests.save

    def setUp(self):
        ControlMetadataTests.setUp(self)
        self.out.mkdir()
        self.archive = self.root/'metadata-only.tar.gz'
        self.archive.write_bytes(b'never open archive payload')
        self.context = dict(selection={'development_key':'f'*64,'selected':[]},
            archive={'bytes':1,'sha256':'d'*64},archive_path=str(self.archive),
            archive_identity=self.intake.low._identity(self.archive.stat()),
            reference_rows=[{'capture_id':'software-reference','image_path':'never-open.jpg'}],
            known_edges=[],reference_sources={})
        manifest=self.root/'manifest.json';manifest.write_text('{}')
        selection=self.root/'selection.json'
        evaluate.base.write_sealed(selection,self.context['selection'])
        negative_selection=self.root/'negative-selection.json'
        evaluate.base.write_sealed(negative_selection,dict(status='complete',candidate_selected=False,selected=[]))
        proof=self.root/'negative-proof.json';proof.write_text('{}')
        self.negative=dict(selection=self.intake.metadata_record(negative_selection),
            records=[self.intake.metadata_record(proof)],development_key='f'*64,
            sources={},environment={'packages':{}})
        self.core=dict(development_key='f'*64,manifest=self.intake.metadata_record(manifest),
            selection=self.intake.metadata_record(selection),protocol={'path':str(self.root/'protocol.json'),'sha256':'a'*64},
            policy=self.policy,policy_sha256=self.intake.POLICY_SHA256,candidates_sha256='c'*64,
            sources={'software_fixture.py':'a'*64},environment={'packages':{}})
        protocol=self.protocol();protocol['negative_candidate']=self.negative
        protocol['development'].update(manifest=self.core['manifest'],selection=self.core['selection'])
        self.save(protocol);self.core['protocol']=self.intake.metadata_record(self.root/'protocol.json')
        self.request=dict(core=self.core,archive=str(self.archive),negative_candidate=self.negative,
            reference_context=self.intake.metadata_record(selection))
        self.stack=ExitStack();self.addCleanup(self.stack.close)
        for target,name,value in [(evaluate,'code_bindings',self.core['sources']),
                (evaluate.base,'environment',self.core['environment']),
                (self.intake.completed,'code_bindings',{}),
                (evaluate,'_controller_development',self.context)]:
            self.stack.enter_context(patch.object(target,name,return_value=value,create=True))
        self.stack.enter_context(patch.object(self.intake,'_core_context',side_effect=AssertionError('heavy context forbidden')))
        self.stack.enter_context(patch.object(self.intake.provenance,'_parquet',side_effect=AssertionError('Arrow forbidden')))

    def write_request(self, projection=None):
        target=self.out/'reference-context.json'
        payload=dict(core_sha256=evaluate.base.digest(self.core),context={
            key:copy.deepcopy(self.context[key]) for key in ('reference_rows','reference_sources','known_edges',
                'archive','archive_path','archive_identity')}) if projection is None else projection
        # Re-sealing is explicit fixture mutation, never production recovery.
        for path in (target,self.out/'request.json'):
            if path.exists():path.unlink()
        evaluate.base.write_sealed(target,payload)
        self.request['reference_context']=self.intake.metadata_record(target)
        evaluate.base.write_sealed(self.out/'request.json',self.request)

    def test_controller_validates_bound_projection_without_arrow_and_rejects_foreign_context(self):
        self.assertTrue(hasattr(evaluate,'verify_controller_request'),'lightweight controller required')
        self.write_request()
        request,context=evaluate.verify_controller_request(self.out)
        self.assertEqual(request,self.request)
        self.assertEqual(context['reference_rows'],[{'capture_id':'software-reference','image_path':'never-open.jpg'}])
        valid=evaluate.base.read_sealed(self.out/'reference-context.json')
        for mutation in ('core','extra','missing','archive','foreign-path','changed-hash'):
            with self.subTest(mutation=mutation):
                bad=copy.deepcopy(valid)
                if mutation=='core':bad['core_sha256']='0'*64
                if mutation=='extra':bad['context']['extra']=True
                if mutation=='missing':del bad['context']['known_edges']
                if mutation=='archive':bad['context']['archive_identity']={}
                self.write_request(bad)
                if mutation=='foreign-path':
                    foreign=self.root/'reference-context.json';foreign.write_bytes((self.out/'reference-context.json').read_bytes())
                    self.request['reference_context']=self.intake.metadata_record(foreign)
                if mutation=='changed-hash':self.request['reference_context']['sha256']='0'*64
                (self.out/'request.json').unlink();evaluate.base.write_sealed(self.out/'request.json',self.request)
                with self.assertRaises(ValueError):evaluate.verify_controller_request(self.out)

    def test_changed_protocol_selection_reference_source_and_negative_proof_fail_before_launch_or_claim(self):
        self.assertTrue(hasattr(evaluate,'verify_controller_request'),'lightweight controller required')
        for mutation in ('missing-projection','protocol','selection','source','negative-proof','core-extra'):
            with self.subTest(mutation=mutation):
                self.write_request()
                saved=[]
                if mutation=='missing-projection':(self.out/'reference-context.json').unlink()
                elif mutation=='core-extra':
                    request=copy.deepcopy(self.request);request['core']['extra']=True
                    (self.out/'request.json').unlink();evaluate.base.write_sealed(self.out/'request.json',request)
                elif mutation=='source':
                    self.context['reference_sources']={'verification':{'path':str(self.root/'missing.json'),'sha256':'0'*64}}
                    self.write_request()
                else:
                    path={'protocol':self.root/'protocol.json','selection':self.root/'selection.json',
                          'negative-proof':self.root/'negative-proof.json'}[mutation]
                    saved.append((path,path.read_bytes()));path.write_text('{"changed":true}')
                try:
                    with patch.object(evaluate.runtime,'ResourceSupervisor',side_effect=AssertionError('child launched')), \
                         patch.object(evaluate,'create_test_claim',side_effect=AssertionError('claim created')), \
                         self.assertRaises((ValueError,FileNotFoundError)):
                        evaluate._attempt_phase(self.out)
                finally:
                    for path,content in saved:path.write_bytes(content)
                    self.context['reference_sources']={}

    def test_full_worker_compares_projection_to_fresh_original_context(self):
        self.assertTrue(hasattr(evaluate,'verify_controller_request'),'derived worker binding required')
        self.write_request()
        self.stack.close()
        with patch.object(evaluate,'_validate_request',return_value=(self.request,self.context)):
            self.assertEqual(evaluate.verify_request(self.out),(self.request,self.context))
            self.context['reference_rows'][0]['image_path']='changed-original.jpg'
            with self.assertRaises(ValueError):evaluate.verify_request(self.out)

    def test_projection_drift_blocks_each_leaf_before_its_pixel_builder(self):
        self.write_request()
        self.stack.close()
        changed=copy.deepcopy(self.context);changed['known_edges']=[{'a':'changed','b':'source','reason':'known_dhash4'}]
        with patch.object(evaluate,'_validate_request',return_value=(self.request,changed)), \
             patch.object(evaluate.runtime,'require_supervised_worker'), \
             patch.object(self.intake,'build_reference_index',side_effect=AssertionError('reference pixels accessed')), \
             patch.object(self.intake,'build_test_admission',side_effect=AssertionError('reserved pixels accessed')):
            for entry in ('_reference','_acquire'):
                with self.subTest(entry=entry),self.assertRaises(ValueError):getattr(evaluate,entry)(self.out)

    def test_full_projection_comparison_rejects_equal_value_foreign_json_numeric_types(self):
        self.context['reference_rows'][0]['width']=64
        self.write_request()
        self.stack.close()
        changed=copy.deepcopy(self.context);changed['reference_rows'][0]['width']=64.0
        with patch.object(evaluate,'_validate_request',return_value=(self.request,changed)),self.assertRaises(ValueError):
            evaluate.verify_request(self.out)

    def test_light_reference_binding_preserves_full_index_fingerprint_and_native_receipt_checks(self):
        self.context['reference_rows']=[dict(capture_id='software-reference',item_identifier='software',
            endpoint='train',image_path='never-open.jpg',image_sha256='a'*64,decoded_sha256='b'*64,
            width=64,height=64,image_bytes=100)]
        self.write_request()
        target=self.out/'reference';target.mkdir()
        fingerprint=dict(self.context['reference_rows'][0],dhash64='0'*16)
        payload=self.intake.reference_payload(self.context,self.core,[fingerprint])
        payload['worker']=dict(job='Local\\IILASNativeRunner-'+'a'*32,pid=123,
            command=evaluate.worker_command('_reference',self.out),limits=vars(evaluate.limits('reference')))
        index=target/'reference-index.json';evaluate.base.write_sealed(index,payload)
        result=self.out/'reference.result.json'
        result.write_text(json.dumps(dict(status='success',reason=None,returncode=0,elapsed_seconds=1,
            peak_rss_bytes=1,last_snapshot=dict(available_bytes=4*1024**3,free_disk_bytes=30*1024**3,
                rss_bytes=1,output_bytes=1,pids=[123]))))
        binding=evaluate._bind_reference(self.out,self.core)
        self.assertEqual(binding,dict(reference_index=self.intake.metadata_record(index),
                                      reference_resource=self.intake.metadata_record(result)))
        for mutation in ('fingerprint','worker','native'):
            with self.subTest(mutation=mutation):
                bad=copy.deepcopy(payload)
                if mutation=='fingerprint':bad['rows'][0]['image_sha256']='c'*64
                if mutation=='worker':bad['worker']['command'][-1]='foreign'
                if mutation=='native':
                    native=json.loads(result.read_text());native['peak_rss_bytes']=513*1024**2
                    result.write_text(json.dumps(native))
                index.unlink();evaluate.base.write_sealed(index,bad)
                with self.assertRaises(ValueError):evaluate._bind_reference(self.out,self.core)


class ControllerDevelopmentTests(unittest.TestCase):
    def setUp(self):
        self.intake=evaluate._intake();self.old=self.intake.development
        self.temp=tempfile.TemporaryDirectory(prefix='eval-light-source-software-',
            dir=Path(__file__).resolve().parents[1]/'research/datasets')
        self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.out=self.root/'development';self.out.mkdir()
        self.image_root=self.root/'images';self.image_root.mkdir()
        (self.image_root/'never-open.jpg').write_bytes(b'x')
        metadata=self.root/'metadata.json';metadata.write_text('{}')
        sample=self.root/'sample-data/query-sample.parquet';sample.parent.mkdir()
        sample.write_bytes(b'opaque metadata fixture, never decoded')
        (self.root/'sample-acquisition.json').write_text('{}')
        verify=self.root/'verification.json'
        verify.write_text(json.dumps({'near_cross_item_candidates_dhash_le4':[],
                                      'old_sample_near_candidates_dhash_le4':[]}))
        selected=self.root/'intake/selected';selected.mkdir(parents=True)
        (selected/'receipt.json').write_text(json.dumps({'archive':str(self.root/'never-open.tar.gz'),
                                                       'archive_identity_after':{'software':'identity'}}))
        data=dict(profile='kaputt_crop_development',operationally_approved=False,
            source_hashes={role:self.intake.provenance._identity(path) for role,path in (
                ('metadata',metadata),('source:query-sample.parquet',sample))},
            rows=[dict(sample_id='software',capture_id='software',dependency_group_id='software',
                item_identifier='software',label='Normal',split='train',image_path='never-open.jpg',image_bytes=1)],
            image_root=str(self.image_root),inputs={'intake_root':str(self.root/'intake'),
                'independent_verification':str(verify)},archive={'bytes':1,'sha256':'a'*64},
            reserved_test_metadata=[dict(capture_id=f'{i:08x}-0000-0000-0000-000000000000',
                query_crop=f'data/train/query-data/crop/{i:08x}-0000-0000-0000-000000000000.jpg',
                official_split='train',proposed_internal_partition='internal_test',defect=False,
                major_defect=False,item_material='cardboard',defect_types='',item_identifier=f'item{i}')
                for i in range(147)])
        manifest=self.root/'manifest.json';manifest.write_text(json.dumps(data))
        protocol=self.root/'original-protocol.json';protocol.write_text('{}')
        frozen=copy.deepcopy(data);frozen['manifest_sha256']=evaluate.runtime.sha256_file(manifest)
        binding=dict(manifest=self.intake.metadata_record(manifest),protocol=self.intake.metadata_record(protocol),
            code=self.old.code_bindings(),environment=evaluate.base.environment(),settings={},
            benchmark_context=self.intake.provenance.benchmark_context(frozen))
        frozen['rows'][0]['_group_id']='software'
        self.key=self.old.experiment_identity(frozen,binding)
        claim=self.root/'claim';claim.mkdir()
        for name in ('started.json','completed.json'):(claim/name).write_text('{}')
        run=dict(key=self.key,binding=binding,claim=str(claim),output=str(self.out))
        evaluate.base.write_sealed(self.out/'development.json',run)
        fits=[]
        for architecture in ('mobilenetv2','efficientnetb0'):
            for contrast in ('none','clahe'):
                name=architecture+'-'+contrast;target=self.out/name;target.mkdir()
                artifact=target/'classifier.keras';artifact.write_bytes(b'opaque artificial saved-model fixture')
                fits.append(dict(fit_id=name,architecture=architecture,contrast=contrast,status='success',
                    component_macro_f1=.5,component_nll=.5,artifact=str(artifact)))
                for receipt in ('fit.json','worker-receipt.json','validation-predictions.json','history.json'):
                    (target/receipt).write_text('{}')
                (self.out/(name+'.result.json')).write_text('{}')
        for name in ('phase-receipt.json','development.result.json'):(self.out/name).write_text('{}')
        evaluate.base.write_sealed(self.out/'selection.json',dict(development_key=self.key,all_fits=fits))
        self.core=dict(manifest=binding['manifest'],selection=self.intake.metadata_record(self.out/'selection.json'),
            development_key=self.key,candidates_sha256=evaluate.base.digest(data['reserved_test_metadata']))
        self.stack=ExitStack();self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(self.old,'load_protocol',return_value={}))
        self.stack.enter_context(patch.object(self.intake.completed,'validate_original_protocol_paths'))
        self.stack.enter_context(patch.object(self.intake.completed,'_verify_completed'))
        for target,name in ((self.old,'load_frozen'),(self.intake,'_core_context'),
                            (self.intake.provenance,'_parquet')):
            self.stack.enter_context(patch.object(target,name,side_effect=AssertionError('heavy metadata runtime entered')))

    def test_controller_rehashes_opaque_metadata_and_original_identity_without_decode(self):
        self.assertTrue(hasattr(evaluate,'_controller_development'),'metadata-only original verifier required')
        result=evaluate._controller_development(self.core)
        self.assertEqual(result['selection']['development_key'],self.key)
        self.assertEqual(result['known_edges'],[])
        (self.root/'sample-data/query-sample.parquet').write_bytes(b'changed source of same kind')
        with self.assertRaises(ValueError):evaluate._controller_development(self.core)

    def test_missing_original_receipt_and_changed_candidate_identity_fail_in_light_path(self):
        self.assertTrue(hasattr(evaluate,'_controller_development'),'metadata-only original verifier required')
        bad=dict(self.core,candidates_sha256='0'*64)
        with self.assertRaises(ValueError):evaluate._controller_development(bad)
        (self.out/'mobilenetv2-none/worker-receipt.json').unlink()
        with self.assertRaises((ValueError,FileNotFoundError)):evaluate._controller_development(self.core)


class SerialOrchestrationTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(hasattr(evaluate,'_evaluate_phase'), 'serial evaluator phase required')
        self.temp=tempfile.TemporaryDirectory(prefix='eval-serial-software-',
            dir=Path(__file__).resolve().parents[1]/'research/datasets')
        self.addCleanup(self.temp.cleanup);self.out=Path(self.temp.name)

    def test_first_or_second_model_failure_forbids_scoring_or_replacement(self):
        for failed in ('mobilenetv2','efficientnetb0'):
            calls=[]
            class Supervisor:
                def __init__(inner,*args):pass
                def run(inner,command,*,fit_id,**kwargs):
                    calls.append(fit_id)
                    return {'status':'failed' if fit_id==failed else 'success','reason':'software worker result'}
            with ExitStack() as stack:
                stack.enter_context(patch.object(evaluate.runtime,'ResourceSupervisor',Supervisor))
                stack.enter_context(patch.object(evaluate,'verify_attempt',return_value={'rows':rows()}))
                stack.enter_context(patch.object(evaluate,'verify_inference',return_value={}))
                stack.enter_context(patch.object(evaluate,'_seal_worker_completion'))
                with self.assertRaises(ValueError):evaluate._evaluate_phase(self.out)
            self.assertEqual(calls,['mobilenetv2'] if failed=='mobilenetv2' else ['mobilenetv2','efficientnetb0'])

    def test_missing_class_never_runs_a_model_or_headline_comparison(self):
        class Supervisor:
            def __init__(inner,*args):pass
            def run(inner,*args,**kwargs):raise AssertionError('model must not run without both classes')
        with patch.object(evaluate.runtime,'ResourceSupervisor',Supervisor), \
             patch.object(evaluate,'verify_attempt',return_value={'rows':rows()[:1]}):
            evaluate._evaluate_phase(self.out)
        result=evaluate.base.read_sealed(self.out/'report-staged.json')
        self.assertEqual(result['status'],'insufficient_support')
        self.assertNotIn('models',result)

    def test_acquisition_failure_never_reaches_admission_or_evaluation(self):
        self.assertTrue(hasattr(evaluate,'_attempt_phase'), 'serial attempt controller required')
        calls=[]
        class Supervisor:
            def __init__(inner,*args):pass
            def preflight(inner,*args,**kwargs):pass
            def run(inner,command,*,fit_id,**kwargs):
                calls.append(fit_id)
                return {'status':'failed' if fit_id=='acquire' else 'success'}
        core={'development_key':'f'*64}
        with ExitStack() as stack:
            for name,replacement in [('verify_controller_request',lambda *a:({'core':core},{})),
                ('_bind_reference',lambda *a: {'reference_index':{},'reference_resource':{}}),
                ('create_test_claim',lambda *a:self.out/'claim'),
                ('_write_test_run',lambda *a:{}), ('deny_existing_test_claim',lambda *a:None)]:
                stack.enter_context(patch.object(evaluate,name,side_effect=replacement))
            stack.enter_context(patch.object(evaluate.runtime,'ResourceSupervisor',Supervisor))
            stack.enter_context(patch.object(evaluate._intake(),'seal_successful_acquisition',
                                            side_effect=AssertionError('failed acquisition not admitted')))
            with self.assertRaises(ValueError):evaluate._attempt_phase(self.out)
        self.assertEqual(calls,['reference','acquire'])

    def test_successful_attempt_claims_before_acquire_and_freezes_bfs_before_evaluation(self):
        intake=evaluate._intake();key='f'*64
        claim=self.out/'claim';reference=self.out/'reference-index.json';reference.write_text('{}')
        protocol=self.out/'protocol.json'
        protocol.write_text(json.dumps({'acquisition_command':evaluate.worker_command('_acquire',self.out)}))
        core={'development_key':key,'protocol':{'path':str(protocol)}}
        bound={'reference_index':intake.metadata_record(reference),'reference_resource':{}}
        audits=[dict(capture_id='c1',item_identifier='i1',fingerprint={
            'image_sha256':'a'*64,'decoded_sha256':'b'*64,'dhash64':'0'*16,
            'width':64,'height':64,'image_bytes':100},technical_reasons=[])]
        graph=intake.resolve_graph(audits,[],[])
        doc={**graph,'audits':audits,'rows':[{'capture_id':'c1'}]}
        events=[]
        class Supervisor:
            def __init__(inner,*args):pass
            def preflight(inner,*args,**kwargs):pass
            def run(inner,command,*,fit_id,**kwargs):
                events.append(fit_id)
                if fit_id=='acquire':
                    self.assertTrue((claim/'started.json').is_file())
                    run=evaluate.base.read_sealed(self.out/'test-run.json')
                    self.assertEqual(run['acquisition_command'],command)
                    self.assertFalse((self.out/'admission/admission-completion.json').exists())
                if fit_id=='evaluation':
                    proof=evaluate.base.read_sealed(self.out/'graph-verification.json')
                    self.assertFalse(proof['audit']['consulted_model_probabilities'])
                    self.assertTrue((self.out/'admission/admission-completion.json').exists())
                result={'status':'success'}
                evaluate.runtime.write_json_exclusive(self.out/(fit_id+'.result.json'),result)
                return result
        def create(*args):
            self.assertEqual(events,['reference'])
            claim.mkdir();(claim/'started.json').write_text('{}');return claim
        def seal(*args):
            self.assertEqual(events,['reference','acquire'])
            self.assertEqual(json.loads((self.out/'acquire.result.json').read_text())['status'],'success')
            target=self.out/'admission';target.mkdir()
            (target/'manifest.json').write_text('{}');(target/'admission-completion.json').write_text('{}')
        with ExitStack() as stack:
            for name,value in [('verify_controller_request',({'core':core},{})),('deny_existing_test_claim',None),
                               ('_bind_reference',bound),('verify_attempt',doc)]:
                stack.enter_context(patch.object(evaluate,name,return_value=value))
            stack.enter_context(patch.object(evaluate,'create_test_claim',side_effect=create))
            stack.enter_context(patch.object(evaluate.runtime,'ResourceSupervisor',Supervisor))
            stack.enter_context(patch.object(intake,'seal_successful_acquisition',side_effect=seal))
            stack.enter_context(patch.object(intake,'load_test_admission',return_value=doc))
            stack.enter_context(patch.object(intake,'_sealed',return_value={'rows':[],'known_edges':[]}))
            evaluate._attempt_phase(self.out)
        self.assertEqual(events,['reference','acquire','evaluation'])

    def test_complete_pair_requires_bound_raw_worker_resource_and_score_completion(self):
        intake=evaluate._intake();cohort=rows();doc={'rows':cohort,'statistics':{'included':3}}
        models=[dict(architecture='mobilenetv2',contrast='clahe',artifact_sha256='a'*64),
                dict(architecture='efficientnetb0',contrast='none',artifact_sha256='b'*64)]
        binding={'software_only':'not_an_admission'};calls=[];current_command=[]
        def worker(stage):
            return dict(job='Local\\IILASNativeRunner-software',pid=123,command=list(current_command),
                        limits=vars(evaluate.limits(stage)))
        def native(stage):
            bounds=evaluate.limits(stage)
            return dict(status='success',reason=None,returncode=0,elapsed_seconds=.01,peak_rss_bytes=1,
                last_snapshot=dict(available_bytes=bounds.available_floor_bytes,free_disk_bytes=bounds.min_free_disk_bytes,
                                   rss_bytes=1,output_bytes=1,pids=[123]))
        class Supervisor:
            def __init__(inner,*args):pass
            def run(inner,command,*,fit_id,**kwargs):
                current_command[:]=command;calls.append(fit_id)
                if fit_id in ('mobilenetv2','efficientnetb0'):
                    target=self.out/fit_id;target.mkdir()
                    model=models[0 if fit_id=='mobilenetv2' else 1]
                    with evaluate.RawPredictionWriter(target,cohort,model,binding) as writer:
                        for row in cohort:writer.append(row,[.9,.1])
                        raw=writer.complete()
                    evaluate.base.write_sealed(target/'inference.json',dict(status='complete',architecture=fit_id,
                        model=model,binding=binding,raw=intake.metadata_record(raw),worker=worker('infer')))
                    result=native('infer')
                else:
                    evaluate._score(self.out);result=native('score')
                evaluate.runtime.write_json_exclusive(self.out/(fit_id+'.result.json'),result)
                return result
        with ExitStack() as stack:
            stack.enter_context(patch.object(evaluate.runtime,'ResourceSupervisor',Supervisor))
            stack.enter_context(patch.object(evaluate.runtime,'require_supervised_worker'))
            stack.enter_context(patch.object(evaluate.base,'worker_environment'))
            stack.enter_context(patch.object(evaluate,'verify_attempt',return_value=doc))
            stack.enter_context(patch.object(evaluate,'_selected_models',return_value=(models,models)))
            stack.enter_context(patch.object(evaluate,'_raw_binding',return_value=binding))
            stack.enter_context(patch.object(evaluate,'_worker_info',side_effect=worker))
            evaluate._evaluate_phase(self.out)
            self.assertEqual(calls,['mobilenetv2','efficientnetb0','score'])
            report=evaluate._verify_staged_report(self.out)
            self.assertEqual(report['status'],'complete')
            self.assertEqual(report['always_normal']['component_weighted']['accuracy'],.25)
            result_path=self.out/'efficientnetb0.result.json'
            result=json.loads(result_path.read_text());result['status']='failed';result_path.write_text(json.dumps(result))
            with self.assertRaises(ValueError):evaluate._verify_staged_report(self.out)


class ScoreTransactionTests(unittest.TestCase):
    def setUp(self):
        self.intake=evaluate._intake()
        self.temp=tempfile.TemporaryDirectory(prefix='eval-score-transaction-software-',
            dir=Path(__file__).resolve().parents[1]/'research/datasets')
        self.addCleanup(self.temp.cleanup);self.out=Path(self.temp.name)
        self.cohort=rows();self.doc={'rows':self.cohort,'statistics':{'software_count':64}}
        self.models=[dict(architecture='mobilenetv2',contrast='clahe',artifact_sha256='a'*64),
                     dict(architecture='efficientnetb0',contrast='none',artifact_sha256='b'*64)]
        self.binding={'software_binding':'initial'}
        self.records={model['architecture']:[dict(row,row_index=i,**model,probabilities=[.9,.1],decision='Normal')
            for i,row in enumerate(self.cohort)] for model in self.models}
        self.workers={name:dict(job='Local\\IILASNativeRunner-software',pid=123,
            command=evaluate.worker_command('_infer',self.out,name),limits=vars(evaluate.limits('infer')))
            for name in evaluate.MODEL_ORDER}
        bounds=evaluate.limits('infer')
        self.native=dict(status='success',reason=None,returncode=0,elapsed_seconds=1,peak_rss_bytes=1,
            last_snapshot=dict(available_bytes=bounds.available_floor_bytes,free_disk_bytes=bounds.min_free_disk_bytes,
                               rss_bytes=1,output_bytes=1,pids=[123]))
        self.stack=ExitStack();self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(evaluate.runtime,'require_supervised_worker'))
        self.stack.enter_context(patch.object(evaluate.base,'worker_environment'))
        self.stack.enter_context(patch.object(evaluate,'_selected_models',side_effect=lambda doc:(self.models,self.models)))
        self.stack.enter_context(patch.object(evaluate,'_raw_binding',side_effect=lambda *args:self.binding))
        self.original_completion=evaluate._inference_completion
        for name in evaluate.MODEL_ORDER:
            (self.out/name).mkdir()
            (self.out/(name+'.result.json')).write_text(json.dumps(self.native))
            self.reseal(name)

    def replace_seal(self,path,payload):
        if path.exists():path.unlink()
        evaluate.base.write_sealed(path,payload)

    def reseal(self,name):
        target=self.out/name;model=self.models[evaluate.MODEL_ORDER.index(name)]
        records=self.records[name]
        journal=target/'raw.partial.jsonl'
        journal.write_text(''.join(json.dumps(record,sort_keys=True,allow_nan=False)+'\n' for record in records),
                           encoding='utf-8',newline='\n')
        self.replace_seal(target/'raw.json',dict(status='complete',schema_version=1,model=model,
            binding=self.binding,class_order=list(evaluate.CLASS_ORDER),confidence='uncalibrated',
            decision_rule='argmax-exact-tie-abstains',rows_sha256=evaluate.base.digest(self.cohort),
            records_sha256=evaluate.base.digest(records),row_count=len(records),
            journal_sha256=evaluate.runtime.sha256_file(journal),records=records))
        self.replace_seal(target/'inference.json',dict(status='complete',architecture=name,model=model,
            binding=self.binding,raw=self.intake.metadata_record(target/'raw.json'),worker=self.workers[name]))
        payload,_=self.original_completion(self.out,name,self.doc)
        self.replace_seal(target/'worker-completion.json',payload)

    def run_score(self,mutation=None):
        counts={'admission':0,'raw_native':0};mutated=False
        def admission(output):
            nonlocal mutated
            counts['admission']+=1
            if mutation is not None and counts['raw_native']==2 and not mutated:
                mutated=True;mutation()
            return self.doc
        def completion(*args):
            result=self.original_completion(*args);counts['raw_native']+=1;return result
        with patch.object(evaluate,'verify_attempt',side_effect=admission), \
             patch.object(evaluate,'_inference_completion',side_effect=completion):
            evaluate._score(self.out)
        return counts

    def reset_mutation_fixture(self):
        staged=self.out/'report-staged.json'
        if staged.exists():staged.unlink()
        self.cohort=rows();self.doc={'rows':self.cohort,'statistics':{'software_count':64}}
        self.models=[dict(architecture='mobilenetv2',contrast='clahe',artifact_sha256='a'*64),
                     dict(architecture='efficientnetb0',contrast='none',artifact_sha256='b'*64)]
        self.binding={'software_binding':'initial'}
        self.records={model['architecture']:[dict(row,row_index=i,**model,probabilities=[.9,.1],decision='Normal')
            for i,row in enumerate(self.cohort)] for model in self.models}
        for name in evaluate.MODEL_ORDER:
            self.workers[name]['job']='Local\\IILASNativeRunner-software'
            (self.out/(name+'.result.json')).write_text(json.dumps(self.native))
            self.reseal(name)

    def test_score_keeps_four_complete_raw_native_checks_with_only_two_full_admission_verifications(self):
        counts=self.run_score()
        self.assertEqual(counts['raw_native'],4)
        self.assertEqual(counts['admission'],2,'Score repeats expensive full original metadata verification')
        report=evaluate.base.read_sealed(self.out/'report-staged.json')
        self.assertEqual(report['models']['mobilenetv2']['image_unweighted']['accuracy'],1/3)
        self.assertEqual(report['always_normal']['component_weighted']['accuracy'],.25)

    def test_late_shared_document_and_numeric_type_mutations_cannot_be_hidden_by_alias_equality(self):
        for value in (65,64.0):
            with self.subTest(value=value):
                self.reset_mutation_fixture()
                def mutate():self.doc['statistics']['software_count']=value
                with self.assertRaises(ValueError):self.run_score(mutate)
                self.assertFalse((self.out/'report-staged.json').exists())

    def test_late_valid_raw_probability_change_is_rejected_even_with_resealed_complete_proofs(self):
        def mutate():
            self.records['mobilenetv2'][0]['probabilities']=[.8,.2]
            self.reseal('mobilenetv2')
        with self.assertRaises(ValueError):self.run_score(mutate)
        self.assertFalse((self.out/'report-staged.json').exists())

    def test_late_valid_worker_native_model_and_binding_drift_reject_before_staging(self):
        for field in ('worker','native','model','binding'):
            with self.subTest(field=field):
                self.reset_mutation_fixture()
                def mutate():
                    if field=='worker':self.workers['mobilenetv2']['job']='Local\\IILASNativeRunner-changed'
                    elif field=='native':
                        value=copy.deepcopy(self.native);value['elapsed_seconds']=2
                        (self.out/'mobilenetv2.result.json').write_text(json.dumps(value))
                    elif field=='model':
                        self.models[0]['artifact_sha256']='c'*64
                        for record in self.records['mobilenetv2']:record['artifact_sha256']='c'*64
                    else:self.binding['software_binding']='changed'
                    for name in evaluate.MODEL_ORDER:self.reseal(name)
                with self.assertRaises(ValueError):self.run_score(mutate)
                self.assertFalse((self.out/'report-staged.json').exists())

    def test_late_raw_label_journal_and_native_hash_tampering_reject_before_staging(self):
        for field in ('raw-label','journal','native-hash'):
            with self.subTest(field=field):
                self.reset_mutation_fixture()
                def mutate():
                    if field=='raw-label':
                        path=self.out/'mobilenetv2/raw.json';payload=evaluate.base.read_sealed(path)
                        payload['records'][0]['label']='Damaged';self.replace_seal(path,payload)
                    elif field=='journal':
                        with (self.out/'mobilenetv2/raw.partial.jsonl').open('a',encoding='utf-8') as stream:
                            stream.write('{}\n')
                    else:
                        value=copy.deepcopy(self.native);value['elapsed_seconds']=3
                        (self.out/'mobilenetv2.result.json').write_text(json.dumps(value))
                with self.assertRaises(ValueError):self.run_score(mutate)
                self.assertFalse((self.out/'report-staged.json').exists())


class FinalizationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='eval-final-software-',
            dir=Path(__file__).resolve().parents[1]/'research/datasets')
        self.addCleanup(self.temp.cleanup);self.out=Path(self.temp.name)
        self.claim=self.out/'claim';self.claim.mkdir()
        self.core={'development_key':'f'*64,'software_only':True};self.staged={'status':'complete','operationally_approved':False}
        self.start(self.out,self.claim)
        for name in ('attempt.result.json','evaluation.result.json','report-staged.json','graph-verification.json'):
            (self.out/name).write_text('{}')

    def final(self,supervisor):
        self.assertTrue(hasattr(evaluate,'_finalize_attempt'),'resource-checked finalization required')
        with patch.object(evaluate,'claim_paths',return_value=(self.claim,self.out/'historical')):
            return evaluate._finalize_attempt(self.out,self.core,self.claim,
                {'status':'drained'}, {},self.staged,supervisor)

    def start(self,output,claim):
        evaluate.runtime.write_json_exclusive(claim/'started.json',dict(key='f'*64,phase='test',
            output=str(output),binding_sha256=evaluate.base.digest(self.core)))

    def test_finalization_binds_report_and_checks_original_resource_owner(self):
        snapshots=[]
        class Supervisor:
            started=0
            def preflight(inner,**kwargs):
                snapshots.append(kwargs)
                return {'software_snapshot':len(snapshots)}
        result=self.final(Supervisor())
        report=evaluate.base.read_sealed(result)
        completed=json.loads((self.claim/'completed.json').read_text())
        self.assertEqual(completed['report_sha256'],evaluate.runtime.sha256_file(result))
        self.assertEqual(report['evaluation_scope'],'development_only')
        self.assertGreaterEqual(len(snapshots),4)
        self.assertTrue(all(item=={'required_available_bytes':805306368} for item in snapshots))
        self.assertFalse((self.claim/'completion-staged.json').exists())

    def test_resource_failure_at_each_write_boundary_never_leaves_completed_marker(self):
        for failure in range(1,7):
            with self.subTest(failure=failure):
                target=self.out/str(failure);target.mkdir()
                claim=target/'claim';claim.mkdir()
                self.start(target,claim)
                for name in ('attempt.result.json','evaluation.result.json','report-staged.json','graph-verification.json'):
                    (target/name).write_text('{}')
                calls=[]
                class Supervisor:
                    started=0
                    def preflight(inner,**kwargs):
                        calls.append(kwargs)
                        if len(calls)==failure:raise evaluate.runtime.RuntimeSafetyError('wall_timeout')
                        return {'software_snapshot':len(calls)}
                self.assertTrue(hasattr(evaluate,'_finalize_attempt'),'resource-checked finalization required')
                with patch.object(evaluate,'claim_paths',return_value=(claim,target/'historical')), \
                     self.assertRaises(evaluate.runtime.RuntimeSafetyError):
                    evaluate._finalize_attempt(target,self.core,claim,{'status':'drained'}, {},self.staged,Supervisor())
                self.assertFalse((claim/'completed.json').exists())
                if failure>=5:self.assertTrue((claim/'completion-uncertain.json').is_file())

    def test_actual_postrename_wall_or_output_limit_preserves_existing_uncertainty(self):
        original_rename=evaluate.os.rename
        for reason in ('wall_timeout','output_limit'):
            with self.subTest(reason=reason):
                target=self.out/reason;target.mkdir();claim=target/'claim';claim.mkdir()
                self.start(target,claim)
                old=claim/'completion-uncertain.json';old.write_text('older evidence')
                for name in ('attempt.result.json','evaluation.result.json','report-staged.json','graph-verification.json'):
                    (target/name).write_text('{}')
                bounds=evaluate.replace(evaluate.limits('attempt'),max_output_bytes=65536)
                supervisor=evaluate.runtime.ResourceSupervisor(target,bounds)
                def rename(source,destination):
                    original_rename(source,destination)
                    if Path(destination).name=='completed.json':
                        if reason=='wall_timeout':supervisor.started-=3301
                        else:(target/'quota-overflow.bin').write_bytes(b'x'*65537)
                with patch.object(evaluate,'claim_paths',return_value=(claim,target/'historical')), \
                     patch.object(evaluate.runtime,'native_snapshot',return_value={
                         'available_bytes':4*1024**3,'rss_bytes':1,'pids':[]}), \
                     patch.object(evaluate.os,'rename',side_effect=rename), \
                     self.assertRaisesRegex(evaluate.runtime.RuntimeSafetyError,reason):
                    evaluate._finalize_attempt(target,self.core,claim,{'status':'drained'}, {},self.staged,supervisor)
                self.assertFalse((claim/'completed.json').exists())
                self.assertEqual(old.read_text(),'older evidence')
                self.assertTrue((claim/'completion-uncertain-1.json').is_file())


class OuterControlTests(unittest.TestCase):
    def test_outer_failure_marks_failed_only_after_known_native_drain(self):
        with tempfile.TemporaryDirectory(prefix='eval-outer-software-',
                dir=Path(__file__).resolve().parents[1]/'research/datasets') as directory:
            root=Path(directory);key='f'*64
            for outcome in ('undrained','drained'):
                with self.subTest(outcome=outcome):
                    case=root/outcome;case.mkdir();out=case/'attempt';claim=case/'claim';claim.mkdir()
                    selection=case/'selection.json';selection.write_text('{}')
                    manifest=case/'manifest.json';manifest.write_text('{}')
                    protocol_path=case/'protocol.json';protocol_path.write_text('{}')
                    negative={'selection':{'path':str(selection)}}
                    protocol={'negative_candidate':negative,'policy':{}}
                    context={'selection':{'development_key':key},'data':{'reserved_test_metadata':[]},
                        'reference_rows':[],'reference_sources':{},'known_edges':[],
                        'archive':{},'archive_path':str(case/'unused-archive'),'archive_identity':{}}
                    class Supervisor:
                        started=0
                        def __init__(inner,*args):pass
                        def preflight(inner,**kwargs):return {}
                        def run(inner,*args,**kwargs):
                            request=evaluate.base.read_sealed(out/'request.json')
                            evaluate.runtime.write_json_exclusive(claim/'started.json',dict(key=key,phase='test',
                                output=str(out),binding_sha256=evaluate.base.digest(request['core'])))
                            return {'status':'failed','reason':'software_outer_failure'}
                    def drain(*args):
                        if outcome=='undrained':raise evaluate.runtime.RuntimeSafetyError('native drain unverified')
                        return {'status':'drained'}
                    with ExitStack() as stack:
                        replacements={'_context':context,'load_evaluation_protocol':protocol,
                            'negative_candidate_snapshot':negative,'_validate_request':({},context),
                            'deny_existing_test_claim':None,'claim_paths':(claim,case/'historical'),
                            'code_bindings':{}}
                        for name,value in replacements.items():
                            stack.enter_context(patch.object(evaluate,name,return_value=value))
                        stack.enter_context(patch.object(evaluate.base,'environment',return_value={}))
                        stack.enter_context(patch.object(evaluate.runtime,'ResourceSupervisor',Supervisor))
                        stack.enter_context(patch.object(evaluate,'wait_attempt_drain',side_effect=drain))
                        with self.assertRaises((ValueError,evaluate.runtime.RuntimeSafetyError)):
                            evaluate.test(selection,manifest,case/'unused-archive',protocol_path,out)
                    self.assertFalse((claim/'completed.json').exists())
                    self.assertEqual((claim/'failed.json').exists(),outcome=='drained')
                    self.assertTrue((claim/'started.json').is_file())


class IndependentGraphTests(unittest.TestCase):
    def test_missing_transitive_reference_relay_and_mutated_disposition_are_rejected(self):
        self.assertTrue(hasattr(evaluate,'independent_graph_audit'), 'independent BFS graph audit required')
        import kaputt_crop_test_intake as intake
        def fingerprint(seed):
            return {'image_sha256':str(seed)*64,'decoded_sha256':str(seed+1)*64,
                    'dhash64':('0'*16 if seed==0 else 'f'*16), 'width':64,'height':64,'image_bytes':100}
        refs=[dict(capture_id='r1',item_identifier='relay',endpoint=None,**fingerprint(0)),
              dict(capture_id='r2',item_identifier='train',endpoint='train',**fingerprint(2))]
        audits=[dict(capture_id='t1',item_identifier='relay',fingerprint=fingerprint(4),technical_reasons=[])]
        known=[{'a':'r1','b':'r2','reason':'known_dhash4'}]
        graph=intake.resolve_graph(audits,refs,known)
        doc={**graph,'audits':audits,'rows':[]}
        result=evaluate.independent_graph_audit(doc,{'rows':refs,'known_edges':known})
        self.assertEqual(result['included_images'],0)
        self.assertEqual(result['excluded_images'],1)
        for field in ('edges','dispositions'):
            bad=copy.deepcopy(doc);bad[field]=[]
            with self.assertRaises(ValueError):evaluate.independent_graph_audit(bad,{'rows':refs,'known_edges':known})


if __name__ == '__main__':
    unittest.main()
