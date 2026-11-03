"""Runner workflow tests use disposable fixtures, never reserved scientific test data."""
import copy
import csv
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from unittest.mock import Mock


class TrainingTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_simulation_train'),
                             'Bounded stock training runner is missing')
        import inventory_simulation_train as api
        self.api=api

    def rows(self,count=240):
        a=self.api;per=count//3
        return [dict(sample_id=f'C{i:03}',group_id=f'F{i:03}',source_id='project-assisted-main-v1',
            origin='simulated',observed_at='2026-10-23T04:00:00+00:00',feature_cutoff_at='2026-10-23T04:00:00+00:00',
            label=a.LABELS[i//per],label_status='assisted',labeler_id=a.data.TEACHER,
            evidence_ref=f'dossiers/C{i:03}.json',rubric_version=a.data.RUBRIC,split='development',
            **dict(zip(a.FEATURES,[i+10,3,5,2,1,7]))) for i in range(count)]

    def test_registry_and_resource_caps(self):
        a=self.api
        candidates=a.candidates()
        self.assertEqual(len(candidates),8)
        self.assertEqual(len(a.fit_ids()),26)
        self.assertEqual(len(set(a.fit_ids())),26)
        for spec in candidates:
            model=a.estimator(spec)
            self.assertEqual(model.random_state,42)
            self.assertEqual(model.class_weight,'balanced')
            if spec['family']=='RandomForest':
                self.assertEqual(model.n_estimators,100);self.assertEqual(model.n_jobs,2)
        limits=a.limits()
        self.assertEqual((limits.max_wall_seconds,limits.max_fit_seconds),(900,60))
        self.assertEqual((limits.max_rss_bytes,limits.min_available_bytes),(2*1024**3,3*1024**3))
        self.assertEqual(limits.max_output_bytes,100*1024**2)
        self.assertEqual(limits.threads,2)
        altered=copy.deepcopy(candidates[0]);altered['depth']=999
        with self.assertRaises(ValueError):a.estimator(altered)

    def test_cv_folds_are_disjoint_and_cover_every_family(self):
        a=self.api;rows=self.rows();folds=a.folds(rows)
        self.assertEqual(len(folds),3)
        seen=[]
        for fold in folds:
            train,valid=fold['train'],fold['validation']
            self.assertFalse(set(train)&set(valid));seen.extend(valid)
            self.assertEqual(set(rows[i]['label'] for i in train),set(a.LABELS))
            self.assertEqual(set(rows[i]['label'] for i in valid),set(a.LABELS))
        self.assertEqual(sorted(seen),list(range(240)))

    def test_selection_requires_all_folds_and_obeys_ties(self):
        a=self.api
        records=[dict(candidate=spec['id'],fold=fold,macro_f1=.5,critical_recall=.6)
                 for spec in a.candidates() for fold in range(3)]
        selected=a.select(records)
        self.assertEqual(selected['DecisionTree']['depth'],4)
        self.assertEqual(selected['DecisionTree']['leaf'],5)
        self.assertEqual(selected['RandomForest']['depth'],6)
        self.assertEqual(selected['RandomForest']['leaf'],5)
        with self.assertRaises(ValueError):a.select(records[:-1])
        with self.assertRaises(ValueError):a.select(records[:-1]+[records[0]])

    def fixture_source(self,repo):
        a=self.api;source=repo/'research/datasets/inventory-simulation-v1/source'
        source.mkdir(parents=True)
        rows=self.rows()
        (source/'development.csv').write_bytes(a.data.sim.csv_bytes(a.data.sim.COMMON+a.FEATURES,rows))
        splits=dict(development=[r['group_id'] for r in rows],test=[f'T{i:03}' for i in range(60)])
        (source/'splits.json').write_bytes(a.data.sim.canonical(splits))
        manifest=dict(protocol=a.data.PROTOCOL,rubric=a.data.RUBRIC,teacher=a.data.TEACHER,seeds=list(a.data.SEEDS),
            origin='simulated',annotation_origin='AI-authored synthetic policy',independent_human_review=False,
            eligible_for_prototype_training=True,operationally_approved=False,families=300,features=list(a.FEATURES),
            labels=list(a.LABELS),pilot_seed_excluded=42,source_pins=a.data.source_pins(),files={})
        for name in ('development.csv','splits.json'):
            path=source/name;manifest['files'][name]=dict(sha256=a.sha(path),bytes=path.stat().st_size)
        manifest['files']['test.csv']=dict(sha256='0'*64,bytes=100)
        (source/'manifest.json').write_bytes(a.data.sim.canonical(manifest))
        return source

    def git_ok(self,args,**kwargs):return subprocess.CompletedProcess(args,0,stdout='',stderr='')

    def test_development_reader_never_reads_test_and_rejects_tampering(self):
        a=self.api
        with tempfile.TemporaryDirectory() as temp,patch.object(a,'ROOT',Path(temp)),patch.object(a.runtime.subprocess,'run',self.git_ok):
            source=self.fixture_source(Path(temp))
            with patch.object(a,'DATASET_SHA',a.sha(source/'manifest.json')):
                original=Path.read_bytes
                def read(path):
                    if path.name=='test.csv':raise AssertionError('Reserved test observations read during development')
                    return original(path)
                with patch.object(Path,'read_bytes',read):
                    rows,meta=a.load_partition(source,'development')
                self.assertEqual(len(rows),240)
                self.assertEqual(meta['families'],300)
                path=source/'development.csv';path.write_text(path.read_text().replace(',simulated,',',real,',1))
                with self.assertRaises(ValueError):a.load_partition(source,'development')

    def test_registry_claim_is_exclusive_across_output_paths(self):
        a=self.api
        with tempfile.TemporaryDirectory() as temp,patch.object(a,'ROOT',Path(temp)),patch.object(a.runtime.subprocess,'run',self.git_ok):
            output=Path(temp)/'research/datasets/run-01';output.mkdir(parents=True)
            a.claim('development',output)
            with self.assertRaises(FileExistsError):a.claim('development',output.with_name('run-02'))
            a.claim('evaluation',output)
            with self.assertRaises(FileExistsError):a.claim('evaluation',output.with_name('other'))

    def test_hidden_worker_refuses_without_native_job(self):
        a=self.api
        with patch.dict(os.environ,{'IILAS_RUNNER_JOB':''}):
            with self.assertRaises(a.runtime.RuntimeSafetyError):a.main(['_fit','--job','not-a-job'])

    def test_metrics_preserve_class_order_and_binary_comparison(self):
        a=self.api
        rows=self.rows(60)
        predictions={family:dict(labels=['Normal']*60,probabilities=[[1,0,0]]*60)
                     for family in ('DecisionTree','RandomForest')}
        report=a.metrics(rows,predictions,bootstrap_samples=10)
        for family in predictions:
            result=report['models'][family]
            self.assertAlmostEqual(result['accuracy'],1/3)
            self.assertEqual(result['critical_as_normal'],20)
            self.assertEqual(result['confusion_matrix'],[[20,0,0],[20,0,0],[20,0,0]])
            self.assertEqual(list(result['per_class']),list(a.LABELS))
        self.assertIn('rules',report['binary_risk_comparison'])
        self.assertFalse(report['independent_accuracy_validated'])
        self.assertFalse(report['operationally_approved'])

    def test_freeze_refuses_code_drift_after_admission(self):
        a=self.api
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)
            a.write(output/'invocation.json',dict(code_pins={'runner':'old'},versions=a.versions()))
            with patch.object(a,'code_pins',return_value={'runner':'changed'}):
                with self.assertRaises(ValueError):
                    a.freeze(output,'development',dict(status='success',elapsed_seconds=2))
            self.assertFalse((output/'frozen.json').exists())

    def test_preflight_refusal_consumes_no_attempt(self):
        a=self.api
        with tempfile.TemporaryDirectory() as temp, patch.object(a,'source_metadata'), \
             patch.object(a.runtime,'create_run_directory',return_value=Path(temp)), \
             patch.object(a.runtime,'ResourceSupervisor') as supervisor, patch.object(a,'claim') as claim:
            supervisor.return_value.preflight.side_effect=a.runtime.RuntimeSafetyError('available_memory')
            with self.assertRaises(a.runtime.RuntimeSafetyError):
                a.main(['develop','--output',temp])
            claim.assert_not_called()
            supervisor.return_value.run.assert_not_called()

    def test_development_uses_exact_26_fits_and_no_test_reader(self):
        a=self.api;rows=self.rows();calls=[]
        def fake_fit(output,ident,spec,train,evaluate,supervisor):
            calls.append((ident,len(train),len(evaluate)))
            return dict(labels=[r['label'] for r in evaluate]),dict(status='success')
        with tempfile.TemporaryDirectory() as temp, patch.object(a,'load_partition',return_value=(rows,{})) as load, \
             patch.object(a,'run_fit',side_effect=fake_fit):
            a.develop(Path('fixture-source'),Path(temp),Mock())
            self.assertEqual([x[0] for x in calls],a.fit_ids())
            self.assertEqual(calls[-2:], [('final-DecisionTree',240,0),('final-RandomForest',240,0)])
            self.assertEqual(a.read(Path(temp)/'ledger.json')['status'],'complete')
            load.assert_called_once_with(Path('fixture-source'),'development')

    def test_first_fit_failure_stops_selection(self):
        a=self.api
        with tempfile.TemporaryDirectory() as temp, patch.object(a,'load_partition',return_value=(self.rows(),{})), \
             patch.object(a,'run_fit',side_effect=a.runtime.RuntimeSafetyError('fit_timeout')) as fit:
            with self.assertRaises(a.runtime.RuntimeSafetyError):
                a.develop(Path('fixture-source'),Path(temp),Mock())
            self.assertEqual(fit.call_count,1)
            self.assertFalse((Path(temp)/'selection.json').exists())

    def test_joint_predictions_are_frozen_before_metrics_and_evaluation_never_fits(self):
        a=self.api;rows=self.rows(60);steps=[]
        choices={family:next(s for s in a.candidates() if s['family']==family) for family in a.FAMILIES}
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp);dev=output/'development';dev.mkdir()
            (dev/'frozen.json').write_text('fixture')
            for family in a.FAMILIES:(dev/('final-'+family+'.joblib')).write_text('fixture')
            def verify(phase,dest):steps.append('claim')
            def load(source,partition):
                self.assertEqual(steps,['claim']);self.assertEqual(partition,'test');steps.append('read')
                return rows,{}
            def scores(actual,predicted):
                packet=a.read(output/'predictions.json');receipt=a.read(output/'predictions-frozen.json')
                self.assertEqual(set(packet['predictions']),set(a.FAMILIES))
                self.assertEqual(receipt['sha256'],a.sha(output/'predictions.json'))
                steps.append('metrics');return {'fixture':True}
            models={family:a.estimator(choices[family]) for family in a.FAMILIES}
            def fake_model(path):return models[next(f for f in a.FAMILIES if f in str(path))]
            with patch.object(a,'validate_development',return_value=(dev,{},dict(choices=choices))), \
                 patch.object(a,'verify_claim',side_effect=verify), patch.object(a,'load_partition',side_effect=load), \
                 patch.object(a.joblib,'load',side_effect=fake_model), patch.object(a,'estimator',side_effect=lambda s:models[s['family']]), \
                 patch.object(a,'predictions',return_value=dict(labels=['Normal']*60,probabilities=[[1,0,0]]*60)), \
                 patch.object(a,'metrics',side_effect=scores), patch.object(a.DecisionTreeClassifier,'fit') as dt, \
                 patch.object(a.RandomForestClassifier,'fit') as rf:
                a.evaluate(Path('source'),output,dev)
                dt.assert_not_called();rf.assert_not_called()
            self.assertEqual(steps,['claim','read','metrics'])


if __name__=='__main__':unittest.main()
