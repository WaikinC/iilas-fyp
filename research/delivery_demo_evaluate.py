"""One frozen TEST evaluation. Bootstrap uses saved predictions, never refits."""
from pathlib import Path
import io
import random
import delivery_demo_artifacts as a
import delivery_demo_contract as c
import delivery_demo_data as data
import delivery_demo_train as train
import runner_runtime as runtime

def load_model(path,sha256):
    blob=a.read_bytes(path,10*1024**2)
    if a.digest(blob)!=sha256:raise ValueError('Delivery model changed before loading')
    import joblib
    bundle=joblib.load(io.BytesIO(blob))
    if bundle['features']!=list(c.FEATURES) or bundle['classes']!=list(c.CLASSES) or bundle['provenance']!=c.PROVENANCE:raise ValueError('Delivery bundle schema differs')
    return bundle['model']
def bootstrap_intervals(truth,predicted,families):
    if len(truth)!=len(predicted) or len(truth)!=len(families):raise ValueError('Bootstrap alignment differs')
    groups=sorted(set(families));indices={g:[i for i,f in enumerate(families) if f==g] for g in groups};rng=random.Random(20261024);values={k:[] for k in ('accuracy','macroF1','highRecall','highPrecision')}
    for _ in range(1000):
        sample=[i for g in rng.choices(groups,k=len(groups)) for i in indices[g]];t=[truth[i] for i in sample];p=[predicted[i] for i in sample];s=train.score(t,p);values['accuracy'].append(s['accuracy'])
        if set(t)==set(c.CLASSES):values['macroF1'].append(s['macroF1'])
        if not s['perClass']['High']['recallUndefined']:values['highRecall'].append(s['perClass']['High']['recall'])
        if not s['perClass']['High']['precisionUndefined']:values['highPrecision'].append(s['perClass']['High']['precision'])
    def interval(v):
        v=sorted(v)
        def q(p):
            n=(len(v)-1)*p;i=int(n);return v[i]+(v[min(i+1,len(v)-1)]-v[i])*(n-i)
        return dict(low=q(.025) if v else None,high=q(.975) if v else None,defined=len(v),undefined=1000-len(v))
    return dict(resamples=1000,seed=20261024,**{k:interval(v) for k,v in values.items()})
def evaluate(development,output):
    runtime.require_supervised_worker();output=a.safe(output);dev=train.load_development(development)
    if not dev['rfBeatsDummy']:raise ValueError('RF did not beat Dummy; no demo promotion')
    claim=a.read_json(a.DATA_ROOT/'registry/evaluate-attempt.json')
    if claim['output']!=str(output):raise ValueError('Delivery evaluation claim differs')
    manifest=data.verify_dataset(dev['manifest'],include_test=True);rows=a.read_json(Path(manifest['output'])/'test.json');x=train.matrix(rows);truth=[r['label'] for r in rows];families=[r['case']['familyId'] for r in rows];models={}
    # Any accidental refitting during this phase is an error, including a baseline.
    from unittest.mock import patch
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.dummy import DummyClassifier
    from contextlib import ExitStack
    with ExitStack() as stack:
        for cls in (RandomForestClassifier,DecisionTreeClassifier,LogisticRegression,DummyClassifier):stack.enter_context(patch.object(cls,'fit',side_effect=AssertionError('Evaluation must never fit')))
        for family,index in dev['selected'].items():
            record=dev['records'][index];model=load_model(record['modelPath'],record['modelSha256']);prediction=train.predictions(model,x);a.write_json(output/(family+'-predictions.json'),dict(truth=truth,families=families,**prediction));models[family]=dict(index=index,modelSha256=record['modelSha256'],metrics=train.score(truth,prediction['predicted']),uncertainty=bootstrap_intervals(truth,prediction['predicted'],families))
    result=dict(protocol=a.PROTOCOL,development=str(development),developmentSha256=a.digest(a.read_bytes(development)),datasetSha256=dev['datasetSha256'],sourcePins=a.source_pins(),environment=a.environment(),provenance=c.PROVENANCE,models=models,teacher=train.score(truth,truth),testRows=len(rows),testFamilies=len(set(families)),fitCalls=0)
    a.write_json(output/'evaluation.json',result);return result
