import copy
import importlib.util
import unittest
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch
import inventory_context_contract as c
from test_inventory_context_contract import make_case


class TrainingTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_context_train'),'V2 paired training missing')
        import inventory_context_train as api
        self.a=api

    def row(self,label,status='confirmed'):
        case=make_case();case['context']['supply_status']=status
        return dict(case=case,label=label,sample_id=case['sample_id'],family_id=case['family_id'],
                    features=list(c.encode_case(case,feature_set='context')))

    def test_grid_and_feature_boundary(self):
        a=self.a
        self.assertEqual((len(a.candidates()),len(a.fit_ids()),len(set(a.fit_ids()))),(16,52,52))
        row=self.row('Normal');row.update(secret_label='Critical Stock Risk',future_actual_arrival=100)
        self.assertEqual(len(a.matrix([row],'six')[0]),6)
        self.assertEqual(len(a.matrix([row],'context')[0]),14)
        for spec in a.candidates():
            model=a.estimator(spec)
            self.assertEqual(model.class_weight,'balanced');self.assertEqual(model.random_state,42)
            if spec['arm'].startswith('RF'):
                self.assertEqual((model.n_estimators,model.n_jobs),(100,2))
        spec=copy.deepcopy(a.candidates()[0]);spec['depth']=99
        with self.assertRaises(ValueError):a.estimator(spec)
        row['features'][0]=float('nan')
        with self.assertRaises(ValueError):a.matrix([row],'six')

    def test_selection_requires_full_unique_folds_and_ties(self):
        a=self.a
        records=[dict(spec=spec,fold=fold,macro_f1=.5,critical_recall=.5)
                 for spec in a.candidates() for fold in range(3)]
        selected=a.select(records)
        self.assertEqual((selected['RF14']['depth'],selected['RF14']['leaf']),(6,5))
        self.assertEqual((selected['DT6']['depth'],selected['DT6']['leaf']),(4,5))
        for bad in (records[:-1],records+[records[0]],records[:-1]+[records[0]]):
            with self.assertRaises(ValueError):a.select(bad)
        bad=copy.deepcopy(records);bad[0]['macro_f1']=float('nan')
        with self.assertRaises(ValueError):a.select(bad)

    def test_training_controls_do_not_learn_validation(self):
        a=self.a
        training=[self.row('Normal'),self.row('Reorder Risk')]
        controls=a.fit_controls(training)
        self.assertEqual(controls['majority'],'Normal')
        self.assertEqual(controls['status']['confirmed'],'Normal')
        validation=[self.row('Critical Stock Risk','disrupted')]
        self.assertEqual(a.predict_controls(controls,validation)['majority'],['Normal'])
        self.assertEqual(a.predict_controls(controls,validation)['status'],['Normal'])
        self.assertEqual(controls,a.fit_controls(training))

    def test_probabilities_order_argmax_and_rejections(self):
        a=self.a
        value=dict(classes=list(c.CLASSES),probabilities=[[.5,.5,0]],predicted=['Normal'])
        a.validate_predictions(value,1)
        for change in ({'classes':list(reversed(c.CLASSES))},{'predicted':['Reorder Risk']},
                       {'probabilities':[[float('nan'),0,1]]},{'probabilities':[[.3,.3,.3]]}):
            with self.assertRaises(ValueError):a.validate_predictions({**value,**change},1)

    def test_classifier_ties_keep_alphabetical_decisions(self):
        class Estimator:
            classes_=sorted(c.CLASSES)
            def predict_proba(self,x):return [[.5,.5,0],[.5,0,.5]]
        result=self.a.predictions(Estimator(),[[0],[0]])
        self.assertEqual(result['predicted'],['Critical Stock Risk','Critical Stock Risk'])
        self.assertEqual(result['probabilities'],[[.5,0,.5],[0,.5,.5]])
        self.a.validate_predictions(result,2)

    def test_storage_projection_and_lossless_model_serialization(self):
        import io
        import joblib
        t=self.a
        self.assertTrue(hasattr(t.a,'storage_projection'),'Remaining-artifact admission missing')
        projection=t.a.storage_projection(7*1024**2)
        self.assertLess(projection['planned_peak_bytes'],100*1024**2)
        with self.assertRaises(t.a.runtime.RuntimeSafetyError):t.a.storage_projection(70*1024**2)
        model=t.estimator(t.candidates()[0])
        x=[[i%3,0,0,0,0,1] for i in range(60)];y=[c.CLASSES[i%3] for i in range(60)]
        model.fit(x,y)
        encoded=t.serialize_model(model)
        decoded=joblib.load(io.BytesIO(encoded))
        self.assertEqual(t.predictions(model,x),t.predictions(decoded,x))
        plain=io.BytesIO();joblib.dump(model,plain,compress=0)
        self.assertLess(len(encoded),len(plain.getvalue()))

    def test_metrics_hand_calculated(self):
        metrics=self.a.score(['Normal','Critical Stock Risk','Reorder Risk'],['Normal','Normal','Reorder Risk'])
        self.assertAlmostEqual(metrics['accuracy'],2/3)
        self.assertEqual(metrics['critical_as_normal'],1)
        self.assertEqual(metrics['per_class']['Critical Stock Risk']['recall'],0)
        self.assertEqual(metrics['undefined_precision'],['Critical Stock Risk'])

    def test_native_worker_fit_and_job_tamper_guard(self):
        t=self.a;a=t.a
        base=Path(__file__).parent/'datasets/context-native-fit-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            root=Path(temp).resolve();source=root/'main';out=root/'development'
            with patch.object(a,'BASE',root):
                a.claim_phase('preparation',None,source);source.mkdir();a.write_json(source/'fixture.json',{'software_fixture':True})
                a.freeze_run(source,'preparation',{'source_sha256':'a'*64})
                out.mkdir();claim=a.claim_phase('development','a'*64,out)
                spec=t.candidates()[0];ident='cv-'+t.candidate_id(spec)+'-f0'
                x=[[i%3,0,i%3,0,0,1] for i in range(60)];y=[c.CLASSES[i%3] for i in range(60)]
                payload=dict(fit_id=ident,spec=spec,features=list(c.FEATURES6),source_sha256='a'*64,
                    phase_claim_sha256=c.sim.digest(claim),x_train=x,y_train=y,x_evaluate=x[:3])
                job=out/(ident+'.job.json');a.write_json(job,payload);sha=a.runtime.sha256_file(job)
                with patch.object(a.runtime,'require_supervised_worker'),patch.object(t,'estimator',side_effect=AssertionError('Tampered job reached fit')):
                    with self.assertRaisesRegex(ValueError,'Scheduled job changed'):t.fit_worker(job,'b'*64)
                script=f"import sys; from pathlib import Path; sys.path.insert(0,{str(Path(__file__).parent.resolve())!r}); import inventory_context_artifacts as a; a.BASE=Path({str(root)!r}); import inventory_context_train as t; t.fit_worker(Path({str(job)!r}),{sha!r})"
                limits=a.runtime.Limits(max_wall_seconds=30,max_fit_seconds=20,max_rss_bytes=2*1024**3,
                    min_available_bytes=0,min_free_disk_bytes=0,max_output_bytes=10**7,poll_seconds=.1,threads=2)
                result=a.ContextSupervisor(out,limits,root).run([sys.executable,'-c',script],fit_id=ident,cwd=a.ROOT)
                if result['status']!='success':self.fail(str(result)+' '+(out/(ident+'.stderr.log')).read_text())
                prediction=a.read_json(out/(ident+'.predictions.json'))
                t.validate_predictions(prediction,3)
                self.assertEqual(prediction['predicted'],list(c.CLASSES))
                self.assertTrue(result['cleanup_confirmed'])
                self.assertFalse((out/(ident+'.joblib')).exists())
                self.assertFalse(a.read_json(out/(ident+'.fit.json'))['model_retained'])
                final_id='final-RF6';payload['fit_id']=final_id
                final_job=out/(final_id+'.job.json');a.write_json(final_job,payload)
                final_sha=a.runtime.sha256_file(final_job)
                final_script=f"import sys; from pathlib import Path; sys.path.insert(0,{str(Path(__file__).parent.resolve())!r}); import inventory_context_artifacts as a; a.BASE=Path({str(root)!r}); import inventory_context_train as t; t.fit_worker(Path({str(final_job)!r}),{final_sha!r})"
                final=a.ContextSupervisor(out,limits,root).run([sys.executable,'-c',final_script],fit_id=final_id,cwd=a.ROOT)
                self.assertEqual(final['status'],'success',final)
                receipt=a.read_json(out/(final_id+'.fit.json'))
                self.assertTrue(receipt['model_retained'])
                self.assertEqual(receipt['model_sha256'],a.runtime.sha256_file(out/(final_id+'.joblib')))
                import joblib
                loaded=joblib.load(out/(final_id+'.joblib'))
                self.assertEqual(t.predictions(loaded,x[:3]),a.read_json(out/(final_id+'.predictions.json')))

    def test_development_audit_rejects_changed_receipt_controls_and_row_order(self):
        t=self.a;a=t.a
        base=Path(__file__).parent/'datasets/context-audit-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            out=Path(temp).resolve();source=out/'source';source.mkdir();claim={'fixture':'claim'}
            rows=[]
            for i in range(6):
                row=self.row(c.CLASSES[i%3]);case=row['case']
                case['family_id']=case['ledger']['family_id']=f'F{i}'
                case['sample_id']=row['sample_id']=f'S{i}';row['family_id']=f'F{i}'
                rows.append(row)
            folds=[dict(train=[f'F{i}' for i in range(6) if i//2!=fold],validation=[f'F{i}' for i in range(6) if i//2==fold]) for fold in range(3)]
            records=[];ledger=[];fold_controls=[]
            for fold,groups in enumerate(folds):
                train=[r for r in rows if r['family_id'] in groups['train']]
                val=[r for r in rows if r['family_id'] in groups['validation']]
                controls=t.fit_controls(train)
                fold_controls.append(dict(fold=fold,controls=controls,metrics={k:t.score([r['label'] for r in val],v) for k,v in t.predict_controls(controls,val).items() if k!='binary_reorder'}))
                for spec in t.candidates():
                    metric=t.score([r['label'] for r in val],['Normal']*len(val))
                    records.append(dict(spec=spec,fold=fold,macro_f1=metric['macro_f1'],critical_recall=metric['per_class'][c.CLASSES[2]]['recall']))
            selected=t.select(records)
            jobs=[('cv-'+t.candidate_id(r['spec'])+'-f'+str(r['fold']),r['spec'],r['fold']) for r in records]+[('final-'+arm,selected[arm],None) for arm in t.ARMS]
            for ident,spec,fold in jobs:
                train=rows if fold is None else [r for r in rows if r['family_id'] in folds[fold]['train']]
                val=rows if fold is None else [r for r in rows if r['family_id'] in folds[fold]['validation']]
                job=dict(fit_id=ident,spec=spec,features=list(c.FEATURES6 if spec['features']=='six' else c.FEATURES14),source_sha256='a'*64,
                    phase_claim_sha256=c.sim.digest(claim),x_train=t.matrix(train,spec['features']),y_train=[r['label'] for r in train],x_evaluate=t.matrix(val,spec['features']))
                a.write_json(out/(ident+'.job.json'),job)
                model_bytes=b'Not an estimator; audit must never unpickle this software fixture.'
                if ident.startswith('final-'):(out/(ident+'.joblib')).write_bytes(model_bytes)
                import hashlib
                receipt=dict(fit_id=ident,spec=spec,job_sha256=a.runtime.sha256_file(out/(ident+'.job.json')),source_sha256='a'*64,
                    phase_claim_sha256=c.sim.digest(claim),model_sha256=hashlib.sha256(model_bytes).hexdigest(),classes=list(c.CLASSES),
                    model_retained=ident.startswith('final-'),model_bytes=len(model_bytes),serialization='joblib-zlib3',
                    input_sha256=c.sim.digest({k:job[k] for k in ('x_train','y_train','x_evaluate')}),provenance=c.PROVENANCE)
                a.write_json(out/(ident+'.fit.json'),receipt)
                a.write_json(out/(ident+'.result.json'),{'status':'success','cleanup_confirmed':True})
                a.write_json(out/(ident+'.predictions.json'),dict(classes=list(c.CLASSES),probabilities=[[1,0,0]]*len(val),predicted=['Normal']*len(val)))
                entry=dict(fit_id=ident,spec=spec,train_ids=[r['sample_id'] for r in train],evaluate_ids=[r['sample_id'] for r in val],receipt=receipt)
                if fold is not None:entry['metrics']=t.score([r['label'] for r in val],['Normal']*len(val))
                ledger.append(entry)
            from collections import Counter
            value=dict(source=str(source),source_sha256='a'*64,basis=a.basis(),selected=selected,records=records,ledger=ledger,
                folds=folds,fold_controls=fold_controls,controls=t.fit_controls(rows),
                status_support={status:dict(Counter(r['label'] for r in rows if r['case']['context']['supply_status']==status)) for status in c.STATUSES},provenance=c.PROVENANCE)
            def save(value): (out/'development.json').write_bytes(c.sim.canonical(value))
            original_read=a.read_json
            with (patch.object(a,'load_rows',return_value=rows),patch.object(a,'read_manifest',return_value={}),
                  patch.object(a,'checked_bytes',return_value=c.sim.canonical({'folds':folds})),patch.object(a,'verify_claim'),
                  patch.object(a,'read_json',side_effect=lambda path:claim if Path(path)==a._claim_path('development') else original_read(path))):
                save(value);self.assertEqual(t.validate_development(out,'a'*64)['fits'],52)
                for mutation in ('missing','row_order','provenance','controls','fold_controls','receipt_source'):
                    bad=copy.deepcopy(value)
                    if mutation=='missing':bad['ledger'].pop()
                    if mutation=='row_order':bad['ledger'][0]['train_ids'].reverse()
                    if mutation=='provenance':bad['provenance']['operationally_approved']=True
                    if mutation=='controls':bad['controls']['majority']='Critical Stock Risk'
                    if mutation=='fold_controls':
                        original=bad['fold_controls'][0]['controls']['majority']
                        bad['fold_controls'][0]['controls']['majority']=next(label for label in c.CLASSES if label!=original)
                    if mutation=='receipt_source':
                        bad['ledger'][0]['receipt']['source_sha256']='b'*64
                        (out/(bad['ledger'][0]['fit_id']+'.fit.json')).write_bytes(c.sim.canonical(bad['ledger'][0]['receipt']))
                    save(bad)
                    with self.subTest(mutation=mutation),self.assertRaises(ValueError):t.validate_development(out,'a'*64)


if __name__=='__main__':unittest.main()
