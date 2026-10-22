"""Self-contained metadata tests for the one prospective tail candidate."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

try:
    import kaputt_crop_finetune as tail
except ModuleNotFoundError:
    tail = None


class TailRunnerTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(tail, 'Tail fine-tuning runner is missing')
        root = Path(__file__).parent/'datasets/tail-runner-software-tests'
        root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def save(self, name, value):
        path = self.root/name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding='utf-8')
        return path

    def rows(self):
        return [dict(sample_id=f's{i}', capture_id=f'c{i}', split='train', official_split='train',
                     dependency_group_id=f'g{i//2}', item_identifier=f'item{i//2}',
                     label='Normal' if i < 4 else 'Damaged', image_sha256=str(i)*64,
                     decoded_sha256=str(i+1)*64) for i in range(8)]

    def test_claim_is_portable_and_cannot_replace_failed_recipe(self):
        key = tail.candidate_identity('a'*64)
        self.assertEqual(key, tail.base.digest({'baseline_development_key':'a'*64,
                         'recipe_version':'mobilenetv2-tail14-16-conv1-lr1e-5-v1'}))
        claim = tail.claim_candidate('a'*64, {'output':'old','source':'x'}, self.root/'registry')
        tail.base.finish_claim(claim,'failed',{'reason':'timeout'})
        with self.assertRaisesRegex(ValueError,'claimed'):
            tail.claim_candidate('a'*64, {'output':'relocated','source':'changed','probe':'new'},self.root/'registry')
        self.assertEqual(len(list((self.root/'registry').glob('develop-*'))),1)

    def test_selection_keeps_baseline_on_ties_and_negative_findings(self):
        baseline = {'component_macro_f1':.6,'component_nll':.8,'name':'baseline'}
        candidate = {'component_macro_f1':.6,'component_nll':.8,'name':'candidate'}
        self.assertEqual(tail.choose_candidate(baseline,candidate)['name'],'baseline')
        candidate['component_macro_f1']=.59; candidate['component_nll']=.1
        self.assertEqual(tail.choose_candidate(baseline,candidate)['name'],'baseline')
        candidate['component_macro_f1']=.6
        self.assertEqual(tail.choose_candidate(baseline,candidate)['name'],'candidate')
        candidate['component_nll']=float('nan')
        with self.assertRaises(ValueError): tail.choose_candidate(baseline,candidate)

    def test_probe_uses_fixed_hash_order_without_repeated_components_or_items(self):
        rows=self.rows()
        selected=tail.probe_samples(rows)
        self.assertEqual([r['sample_id'] for r in selected],['s3','s0','s4','s7'])
        self.assertEqual(len({r['dependency_group_id'] for r in selected}),4)
        self.assertEqual([r['component_weight'] for r in selected],[1.,1.,1.,1.])
        self.assertEqual(selected,tail.probe_samples(list(reversed(rows))))
        rows[0]['split']='test'
        with self.assertRaises(ValueError): tail.probe_samples(rows)

    def test_probe_cannot_reweight_selected_subset_or_fallback_to_duplicates(self):
        rows=self.rows();rows.append(dict(rows[-1],sample_id='s8',capture_id='c8'))
        selected=tail.probe_samples(rows)
        expected={r['sample_id']:w for r,w in zip(rows,tail.old.component_weights(rows))}
        self.assertEqual([r['component_weight'] for r in selected],[expected[r['sample_id']] for r in selected])
        for row in rows:row['item_identifier']='same'
        with self.assertRaisesRegex(ValueError,'distinct'):tail.probe_samples(rows)

    def test_bounded_protocol_path_rejected_before_file_read(self):
        outside=self.root.parents[2]/'tail-protocol-outside.json'
        for path in (outside,self.root/'protocol.yaml',self.root/'..'/'escape.json'):
            with self.assertRaises((ValueError,tail.runtime.RuntimeSafetyError)):
                tail.load_protocol(path)
        oversized=self.root/'huge.json';oversized.write_bytes(b' '*1048577)
        with self.assertRaisesRegex(ValueError,'Bounded'):tail.load_protocol(oversized)

    def test_hidden_workers_refuse_direct_execution_before_any_inputs(self):
        for method in (tail._probe,tail._phase,tail._fit):
            with self.assertRaises(tail.runtime.RuntimeSafetyError):method(self.root)
        self.assertFalse(any(self.root.iterdir()))

    def test_import_has_no_heavy_ml_or_image_dependencies(self):
        code="import sys;import kaputt_crop_finetune;assert not ({'tensorflow','keras','numpy','cv2'} & sys.modules.keys())"
        result=subprocess.run([sys.executable,'-c',code],cwd=Path(__file__).parent,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_partial_or_failed_resource_never_counts_as_completed(self):
        good={'status':'success','reason':None,'returncode':0,'elapsed_seconds':1.,
              'peak_rss_bytes':100,'last_snapshot':{'available_bytes':4*1024**3,'rss_bytes':100,
              'free_disk_bytes':4*1024**3,'output_bytes':100,'pids':[123]}}
        path=self.save('resource.json',good)
        tail.verify_resource(path,tail.phase_limits())
        for key,value in [('status','failed'),('returncode',1),('reason','worker_exit'),
                          ('peak_rss_bytes',3*1024**3),('elapsed_seconds',4000)]:
            changed=dict(good);changed[key]=value;path.write_text(json.dumps(changed))
            with self.assertRaises(ValueError):tail.verify_resource(path,tail.phase_limits())

    def test_fit_rejects_inventory_and_frozen_or_unchanged_tail(self):
        before={'learned_weights':{'early':'a','tail':'b'},'batch_normalization':{'bn':'c'}}
        frozen={'learned_weights':{'early':'a'},'batch_normalization':{'bn':'c'}}
        after={'learned_weights':{'early':'a','tail':'d'},'batch_normalization':{'bn':'c'}}
        tail.validate_weight_change(before,after,frozen,copy.deepcopy(frozen))
        with self.assertRaisesRegex(ValueError,'frozen'):
            tail.validate_weight_change(before,after,frozen,{'learned_weights':{'early':'x'},'batch_normalization':{'bn':'c'}})
        with self.assertRaisesRegex(ValueError,'permitted'):
            tail.validate_weight_change(before,before,frozen,frozen)
        with self.assertRaisesRegex(ValueError,'inventory'):
            tail.require_inventory({'trainable':['a']},{'trainable':['b']})

    def proof(self):
        shapes=[]
        for block in (14,15,16):
            shapes.extend([(f'block_{block}_expand','kernel',[1,1,160,960]),
                           (f'block_{block}_depthwise','kernel',[3,3,960,1]),
                           (f'block_{block}_project','kernel',[1,1,960,320 if block==16 else 160])])
        shapes.extend([('Conv_1','kernel',[1,1,320,1280]),('normal_damaged','kernel',[1280,2]),('normal_damaged','bias',[2])])
        import math
        records=[{'name':layer+'/'+name,'shape':shape,'dtype':'float32','parameters':math.prod(shape),'layer':layer}
                 for layer,name,shape in shapes]
        inventory={'schema_version':1,'architecture':'mobilenetv2_parcel','trainable_variables':records,
                   'trainable_variable_count':12,'trainable_parameter_count':1513282,
                   'frozen_variables':[],'batch_normalization_variables':[],'layers':[]}
        fingerprints={'learned_weights':{r['name']:{'sha256':'a'*64,'shape':r['shape'],'dtype':'float32'} for r in records},
                      'batch_normalization':{},'random_generator_state':{},'frozen_only':False}
        gradient={'loss':.6,'variables':[{'name':r['name'],'finite':True,'nonzero':True,'l2_norm':.1} for r in records],
                  'all_finite_and_present':True,'any_nonzero':True}
        return {'schema_version':1,'inventory':inventory,'timings_seconds':{'warmup':.1,'timed_passes':[.1,.1,.1]},
                'gradients':[copy.deepcopy(gradient) for _ in range(4)],'before':fingerprints,'after':copy.deepcopy(fingerprints),
                'no_optimizer_updates':True,'learned_weights_unchanged':True,'batch_normalization_unchanged':True,
                'random_generator_state_unchanged':True,'training':False,
                'loss_reduction':'sum_weighted_sparse_ce_divided_by_batch4','sample_weights':[1.,1.,1.,1.]}

    def test_probe_rejects_nonfinite_missing_or_zero_gradients_and_weight_updates(self):
        proof=self.proof();tail.validate_gradient_proof(proof)
        mutations=[('no_optimizer_updates',False),('training',True),('learned_weights_unchanged',False),
                   ('batch_normalization_unchanged',False),('random_generator_state_unchanged',False),
                   ('sample_weights',[1.,1.,1.]),('gradients',proof['gradients'][:3]),
                   ('timings_seconds',{'warmup':.1,'timed_passes':[.1,float('nan'),.1]})]
        for key,value in mutations:
            changed=copy.deepcopy(proof);changed[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):tail.validate_gradient_proof(changed)
        for field,value in [('finite',False),('name','unpermitted/kernel'),('l2_norm',float('nan')),('nonzero',False)]:
            changed=copy.deepcopy(proof)
            for gradient in changed['gradients']:gradient['variables'][0][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):tail.validate_gradient_proof(changed)
        changed=copy.deepcopy(proof);changed['after']['learned_weights']['Conv_1/kernel']['sha256']='changed'
        with self.assertRaises(ValueError):tail.validate_gradient_proof(changed)

    def test_rng_advance_does_not_count_as_tail_update_or_frozen_state_change(self):
        before={'learned_weights':{'early':'a','tail':'b'},'batch_normalization':{'bn':'c'},'random_generator_state':{'rng':'one'}}
        after=copy.deepcopy(before);after['random_generator_state']['rng']='two'
        frozen={'learned_weights':{'early':'a'},'batch_normalization':{'bn':'c'},'random_generator_state':{'rng':'one'}}
        frozen_after=copy.deepcopy(frozen);frozen_after['random_generator_state']['rng']='two'
        with self.assertRaisesRegex(ValueError,'permitted'):tail.validate_weight_change(before,after,frozen,frozen_after)
        after['learned_weights']['tail']='updated'
        tail.validate_weight_change(before,after,frozen,frozen_after)

    def test_protocol_exact_recipe_cannot_add_search_or_relax_limits(self):
        for key,value in [('epochs',6),('patience',3),('learning_rate',.001),('contrast','none'),
                          ('operationally_approved',True),('decision','threshold'),('seed',43),
                          ('fixed_comparator','efficientnetb0-refit'),('optimizer','resume-Adam')]:
            doc=tail.recipe();doc[key]=value
            with self.subTest(key=key),self.assertRaisesRegex(ValueError,'Protocol amendment'):
                tail.load_protocol(self.save('protocol.json',doc))
        doc=tail.recipe();doc['limits']['develop']['max_fit_seconds']=3001
        with self.assertRaisesRegex(ValueError,'Protocol amendment'):
            tail.load_protocol(self.save('protocol.json',doc))

    def test_metadata_proof_byte_mutation_breaks_hash_before_admission(self):
        path=self.save('report.json',{'optimizer_updates':0});identity=tail.record(path)
        tail.check_record(identity,json_only=True)
        path.write_text('{"optimizer_updates":1}')
        with self.assertRaisesRegex(ValueError,'Changed'):tail.check_record(identity,json_only=True)

    def test_completed_test_claim_blocks_new_development_even_without_results(self):
        key=tail.base.digest({'software_test':str(self.root)})
        path=tail.ROOT/'research/datasets/kaputt-crop-test-registry'/('test-'+key)
        path.parent.mkdir(parents=True,exist_ok=True);path.mkdir()
        self.addCleanup(path.rmdir)
        with self.assertRaisesRegex(ValueError,'test already claimed'):tail.deny_test_claim(key)

    def original_completed_fixture(self):
        """Real complete receipts; no checkpoint is loaded and no pixels exist."""
        registry=tail.ROOT/'research/datasets/kaputt-crop-run-registry'
        registry.mkdir(exist_ok=True)
        claim_temp=tempfile.TemporaryDirectory(prefix='develop-',dir=registry)
        self.addCleanup(claim_temp.cleanup)
        claim=Path(claim_temp.name);key=claim.name[len('develop-'):]
        rows=[]
        for split,count,normals in [('train',633,369),('validation',133,80)]:
            for i in range(count):
                rows.append(dict(sample_id=f'{split}-{i}',capture_id=f'{split}-{i}',split=split,
                    item_identifier=f'{split}-{i}',dependency_group_id=f'{split}-{i}',
                    label='Normal' if i < normals else 'Damaged'))
        data={'rows':rows,'reserved_test_metadata':[{}]*147}
        context={'profile':'software_fixture','operationally_approved':False}
        binding={'benchmark_context':context,'settings':{'weights':{
            name:{'sha256':name+'-checkpoint'} for name in tail.old.ARCHITECTURES}}}
        run={'key':key,'binding':binding,'output':str(self.root),'claim':str(claim)}
        fits=[];validation=[r for r in rows if r['split']=='validation']
        resource={'status':'success','reason':None,'returncode':0,'elapsed_seconds':1.,'peak_rss_bytes':100,
            'last_snapshot':{'available_bytes':4*1024**3,'rss_bytes':100,'free_disk_bytes':4*1024**3,'output_bytes':100,'pids':[123]}}
        for fit_id in tail.old.FIT_IDS:
            architecture,contrast=fit_id.rsplit('-',1);target=self.root/fit_id;target.mkdir()
            better=fit_id in ('mobilenetv2-clahe','efficientnetb0-none')
            probabilities=[[.8,.2] if r['label']=='Normal' else ([.2,.8] if better else [.8,.2]) for r in validation]
            metrics=tail.old.validation_metrics(validation,probabilities)
            raw=[{**{k:r[k] for k in ('sample_id','capture_id','label','item_identifier','dependency_group_id')},
                  'component_weight':1.,'probabilities':p,'prediction':tail.old.CLASS_ORDER[pred]}
                  for r,p,pred in zip(validation,probabilities,metrics['predictions'])]
            self.save(f'{fit_id}/validation-predictions.json',raw)
            self.save(f'{fit_id}/history.json',{'loss':[.8],'val_loss':[metrics['component_weighted']['nll']]})
            (target/'classifier.keras').write_bytes(b'software checkpoint placeholder; never loaded')
            fit={'status':'success','fit_id':fit_id,'architecture':architecture,'contrast':contrast,
                 'development_key':key,'binding_sha256':tail.base.digest(binding),'artifact':str(target/'classifier.keras'),
                 'validation_metrics':metrics,'component_macro_f1':metrics['component_weighted']['macro_f1'],
                 'component_nll':metrics['component_weighted']['nll'],'seed':42,'weights_sha256':architecture+'-checkpoint',
                 'benchmark_context':context,'operationally_approved':False,
                 'partition_counts':{s:tail.old.partition_summary([r for r in rows if r['split']==s]) for s in ('train','validation')}}
            for name,field in [('classifier.keras','artifact_sha256'),('history.json','history_sha256'),('validation-predictions.json','validation_predictions_sha256')]:
                fit[field]=tail.runtime.sha256_file(target/name)
            tail.base.write_sealed(target/'fit.json',fit)
            self.save(fit_id+'.result.json',resource)
            tail.base.write_sealed(target/'worker-receipt.json',{'development_key':key,'binding_sha256':tail.base.digest(binding),
                'fit_id':fit_id,'fit_receipt_sha256':tail.runtime.sha256_file(target/'fit.json'),
                'resource_result_sha256':tail.runtime.sha256_file(self.root/(fit_id+'.result.json'))})
            fits.append(fit)
        selection={'status':'complete','development_key':key,'binding':binding,'all_fits':fits,
            'selected':[fits[1],fits[2]],'evaluation_scope':'development_only','operationally_approved':False,
            'class_order':['Normal','Damaged'],'decision':'argmax-exact-tie-abstains','test_metrics':'Not run',
            'benchmark_context':context,'input_scope':'crop_only'}
        tail.base.write_sealed(self.root/'selection.json',selection);self.save('development.result.json',resource)
        tail.base.write_sealed(self.root/'phase-receipt.json',{'development_key':key,'binding_sha256':tail.base.digest(binding),
            'resource_result_sha256':tail.runtime.sha256_file(self.root/'development.result.json'),
            'selection_sha256':tail.runtime.sha256_file(self.root/'selection.json')})
        tail.runtime.write_json_exclusive(claim/'started.json',{'key':key,'phase':'develop','output':str(self.root),
            'fit_ids':list(tail.old.FIT_IDS),'profile':tail.old.PROFILE})
        tail.runtime.write_json_exclusive(claim/'completed.json',{'selection_sha256':tail.runtime.sha256_file(self.root/'selection.json')})
        return selection,run,data

    def test_complete_baseline_receipt_graph_rejects_every_partial_or_mutated_link(self):
        selection,run,data=self.original_completed_fixture()
        tail._verify_completed(self.root,selection,run,data)
        for path in [self.root/'mobilenetv2-none/worker-receipt.json',self.root/'mobilenetv2-none.result.json',
                     self.root/'phase-receipt.json',Path(run['claim'])/'completed.json']:
            original=path.read_bytes();path.write_text('{}')
            with self.subTest(path=path.name),self.assertRaises(ValueError):tail._verify_completed(self.root,selection,run,data)
            path.write_bytes(original)
        bad=copy.deepcopy(selection);bad['selected']=[bad['all_fits'][0],bad['all_fits'][2]]
        with self.assertRaisesRegex(ValueError,'selected'):tail._verify_completed(self.root,bad,run,data)
        bad=copy.deepcopy(data);bad['rows'][0]['label']='Damaged'
        with self.assertRaisesRegex(ValueError,'cohort'):tail._verify_completed(self.root,selection,run,bad)

    def test_raw_validation_cannot_reassociate_labels_weights_predictions_or_history(self):
        selection,run,data=self.original_completed_fixture();fit=selection['all_fits'][0]
        target=self.root/fit['fit_id'];rows=[r for r in data['rows'] if r['split']=='validation']
        raw_path=target/'validation-predictions.json';original=raw_path.read_bytes()
        for key,value in [('sample_id','other'),('label','Damaged'),('component_weight',2.),('prediction','Damaged')]:
            raw=json.loads(original);raw[0][key]=value;raw_path.write_text(json.dumps(raw))
            with self.subTest(key=key),self.assertRaises(ValueError):tail.verify_predictions(target,fit,rows)
        raw_path.write_bytes(original)
        (target/'history.json').write_text('{"val_loss":[0.0001]}')
        with self.assertRaisesRegex(ValueError,'history'):tail.verify_predictions(target,fit,rows)

    def test_original_protocol_cannot_reference_pixels_as_checkpoint_or_proof(self):
        self.assertTrue(hasattr(tail,'validate_original_protocol_paths'),'Original protocol path pre-admission is missing')
        doc={'weights':{'mobilenetv2':{'path':str(self.root/'heldout.jpg')}},'weight_proofs':[]}
        with self.assertRaisesRegex(ValueError,'checkpoint'):tail.validate_original_protocol_paths(doc,self.root)
        doc={'weights':{'mobilenetv2':{'path':str(self.root/'weights.h5')}},
             'weight_proofs':[{'path':str(self.root/'heldout.png')}]}
        with self.assertRaisesRegex(ValueError,'proof'):tail.validate_original_protocol_paths(doc,self.root)

    def test_probe_request_rejects_mutated_scope_before_any_model_or_pixel_reads(self):
        self.assertTrue(hasattr(tail,'validate_probe_request'),'Probe scope pre-admission is missing')
        samples=tail.probe_samples(self.rows())
        request={'samples':samples,'salt':'iilas-tail-gradient-probe-v1','limits':vars(tail.probe_limits()),
                 'optimizer_updates':0,'warmup_passes':1,'timed_passes':3}
        tail.validate_probe_request(request,samples)
        for key,value in [('optimizer_updates',1),('timed_passes',4),('warmup_passes',0),('salt','new'),
                          ('samples',samples[:3]),('limits',{})]:
            changed=copy.deepcopy(request);changed[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):tail.validate_probe_request(changed,samples)

    def test_permitted_weight_update_cannot_hide_earlier_backbone_changes(self):
        before={'learned_weights':{'early':'a','tail':'b'},'batch_normalization':{}}
        after={'learned_weights':{'early':'changed','tail':'updated'},'batch_normalization':{}}
        frozen={'learned_weights':{'early':'a'},'batch_normalization':{}}
        with self.assertRaisesRegex(ValueError,'forbidden'):
            tail.validate_weight_change(before,after,frozen,frozen,{'trainable_variables':[{'name':'tail'}]})

    def test_probe_inventory_cannot_self_declare_different_kernel_shapes_or_tail(self):
        for key,value in [('trainable_variable_count',11),('trainable_parameter_count',1),('architecture','efficientnetb0')]:
            proof=self.proof();proof['inventory'][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):tail.validate_gradient_proof(proof)
        for key,value in [('layer','block_13_expand'),('shape',[1,1,160,959]),('dtype','float64')]:
            proof=self.proof();proof['inventory']['trainable_variables'][0][key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):tail.validate_gradient_proof(proof)


if __name__=='__main__':unittest.main()

