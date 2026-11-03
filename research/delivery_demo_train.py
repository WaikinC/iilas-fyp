"""Eleven registered fits on TRAIN; validation-only selection; no TEST reads."""
from pathlib import Path
import io
import warnings
import sys
import time
import delivery_demo_artifacts as a
import delivery_demo_contract as c
import delivery_demo_data as data
import runner_runtime as runtime
from inventory_context_runtime import ContextServingSupervisor as SUPERVISOR

def limits(phase=False):return runtime.Limits(max_wall_seconds=1800 if phase else 120,max_fit_seconds=1800 if phase else 120,max_rss_bytes=2*1024**3,min_available_bytes=3*1024**3,min_free_disk_bytes=1024**3,max_output_bytes=100*1024**2,poll_seconds=.1,threads=1)

def candidates():
    return [dict(family='RF',depth=d,leaf=l) for d in (8,12) for l in (1,3)]+[dict(family='DT',depth=d,leaf=l) for d in (4,8) for l in (1,3)]+[dict(family='LR',C=v) for v in (.1,1)]+[dict(family='Dummy')]
def estimator(spec,labels):
    if spec not in candidates():raise ValueError('Unregistered delivery candidate')
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.dummy import DummyClassifier
    family=spec['family'];kw=dict(class_weight='balanced',random_state=20261024)
    if family=='RF':return RandomForestClassifier(n_estimators=128,max_depth=spec['depth'],min_samples_leaf=spec['leaf'],n_jobs=2,**kw)
    if family=='DT':return DecisionTreeClassifier(max_depth=spec['depth'],min_samples_leaf=spec['leaf'],**kw)
    if family=='LR':return make_pipeline(StandardScaler(),LogisticRegression(C=spec['C'],solver='lbfgs',max_iter=2000,**kw))
    return DummyClassifier(strategy='constant',constant=max(c.CLASSES,key=labels.count))
def matrix(rows):return [[c.validate_features(row['features'])[k] for k in c.FEATURES] for row in rows]
def score(truth,predicted):
    if len(truth)!=len(predicted) or not truth or any(x not in c.CLASSES for x in truth+predicted):raise ValueError('Invalid delivery score input')
    cm=[[sum(t==a and p==b for t,p in zip(truth,predicted)) for b in c.CLASSES] for a in c.CLASSES];per={}
    for i,label in enumerate(c.CLASSES):
        tp=cm[i][i];support=sum(cm[i]);alerts=sum(row[i] for row in cm);precision=tp/alerts if alerts else 0;recall=tp/support if support else 0
        per[label]=dict(precision=precision,recall=recall,f1=2*precision*recall/(precision+recall) if precision+recall else 0,support=support,precisionUndefined=not alerts,recallUndefined=not support)
    return dict(accuracy=sum(cm[i][i] for i in range(3))/len(truth),macroF1=sum(v['f1'] for v in per.values())/3,balancedAccuracy=sum(v['recall'] for v in per.values())/3,perClass=per,confusionMatrix=cm,classOrder=list(c.CLASSES))
def predictions(model,x):
    if set(map(str,model.classes_))!=set(c.CLASSES):raise ValueError('Delivery estimator classes differ')
    rows=[{label:float(row[list(model.classes_).index(label)]) for label in c.CLASSES} for row in model.predict_proba(x)]
    return dict(probabilities=rows,predicted=[c.choose_label(row) for row in rows])
def fit_candidate(spec,xtrain,ytrain,xvalidation):
    runtime.require_supervised_worker()
    from sklearn.exceptions import ConvergenceWarning
    model=estimator(spec,ytrain)
    with warnings.catch_warnings():
        warnings.simplefilter('error',ConvergenceWarning);model.fit(xtrain,ytrain)
    return model,predictions(model,xvalidation)
def development_rows(manifest):
    m=data.verify_dataset(manifest);base=Path(m['output'])
    return a.read_json(base/'train.json'),a.read_json(base/'validation.json')
def select(records):
    if len(records)!=11 or [v['index'] for v in records]!=list(range(11)) or [v['spec'] for v in records]!=candidates():raise ValueError('Delivery candidate registry incomplete')
    for v in records:
        for n in [v['metrics']['macroF1'],v['metrics']['perClass']['High']['recall'],v['metrics']['perClass']['High']['precision']]:c.number(n,0,1)
    return {family:min((v for v in records if v['spec']['family']==family),key=lambda v:(-v['metrics']['macroF1'],-v['metrics']['perClass']['High']['recall'],-v['metrics']['perClass']['High']['precision'],v['index']))['index'] for family in ('RF','DT','LR','Dummy')}
def fit_worker(job_path,job_sha):
    runtime.require_supervised_worker();path=a.safe(job_path)
    blob=a.read_bytes(path)
    if a.digest(blob)!=job_sha:raise ValueError('Delivery fit job changed')
    job=a.read_json(path);c.exact(job,('index','spec','features','xtrain','ytrain','xvalidation','datasetSha256','claimSha256'))
    if job['spec']!=candidates()[job['index']] or job['features']!=list(c.FEATURES) or len(job['xtrain'])!=len(job['ytrain']) or set(job['ytrain'])!=set(c.CLASSES):raise ValueError('Invalid delivery fit job')
    for row in job['xtrain']+job['xvalidation']:c.validate_features(dict(zip(c.FEATURES,row)))
    model,result=fit_candidate(job['spec'],job['xtrain'],job['ytrain'],job['xvalidation'])
    import joblib
    buffer=io.BytesIO();joblib.dump(dict(model=model,spec=job['spec'],features=list(c.FEATURES),classes=list(c.CLASSES),provenance=c.PROVENANCE),buffer,compress=3);payload=buffer.getvalue()
    if not 0<len(payload)<=10*1024**2:raise ValueError('Delivery model size limit')
    modelpath=path.with_suffix('.joblib')
    with modelpath.open('xb') as stream:stream.write(payload)
    a.write_json(path.with_suffix('.predictions.json'),result)
    a.write_json(path.with_suffix('.fit.json'),dict(index=job['index'],spec=job['spec'],modelSha256=a.digest(payload),modelBytes=len(payload),jobSha256=job_sha,fitRows=len(job['xtrain']),validationRows=len(job['xvalidation']),datasetSha256=job['datasetSha256'],claimSha256=job['claimSha256']))
def develop(manifest,output):
    runtime.require_supervised_worker();output=a.safe(output);claim=a.read_json(a.DATA_ROOT/'registry/develop-attempt.json')
    if claim['output']!=str(output):raise ValueError('Delivery development claim differs')
    train,validation=development_rows(manifest);dataset=a.read_json(manifest);source_sha=a.digest(a.read_bytes(manifest));xtrain=matrix(train);ytrain=[r['label'] for r in train];xvalidation=matrix(validation);truth=[r['label'] for r in validation]
    records=[]
    for index,spec in enumerate(candidates()):
        directory=output/f'candidate-{index:02}';directory.mkdir();supervisor=SUPERVISOR(directory,limits(),a.DATA_ROOT)
        job=directory/'job.json';job_sha=a.write_json(job,dict(index=index,spec=spec,features=list(c.FEATURES),xtrain=xtrain,ytrain=ytrain,xvalidation=xvalidation,datasetSha256=source_sha,claimSha256=a.digest(a.canonical(claim))))
        native=supervisor.run([sys.executable,str(Path(__file__).with_name('delivery_demo_cli.py')),'_fit','--job',str(job),'--sha256',job_sha],fit_id='inference',cwd=a.ROOT)
        if native['status']!='success' or not native['cleanup_confirmed']:raise runtime.RuntimeSafetyError('Delivery fit failed; retained evidence must be investigated')
        receipt=a.read_json(job.with_suffix('.fit.json'));result=a.read_json(job.with_suffix('.predictions.json'))
        if receipt['jobSha256']!=job_sha or receipt['index']!=index or len(result['predicted'])!=len(truth):raise ValueError('Delivery fit receipt differs')
        records.append(dict(index=index,spec=spec,metrics=score(truth,result['predicted']),modelPath=str(job.with_suffix('.joblib')),modelSha256=receipt['modelSha256'],predictionSha256=a.digest(a.read_bytes(job.with_suffix('.predictions.json'))),jobSha256=job_sha,native=native))
    selected=select(records);ranges={k:dict(min=min(r['features'][k] for r in train),max=max(r['features'][k] for r in train)) for k in c.FEATURES}
    result=dict(protocol=a.PROTOCOL,manifest=str(manifest),datasetSha256=source_sha,sourcePins=a.source_pins(),environment=a.environment(),features=list(c.FEATURES),classes=list(c.CLASSES),provenance=c.PROVENANCE,records=records,selected=selected,ranges=ranges,teacher=score(truth,[r['label'] for r in validation]),rfBeatsDummy=records[selected['RF']]['metrics']['macroF1']>records[selected['Dummy']]['metrics']['macroF1'])
    a.write_json(output/'development.json',result);return result
def load_development(path):
    path=a.safe(path);seal=a.read_json(a.DATA_ROOT/'registry/develop-complete.json')
    if seal!=dict(protocol=a.PROTOCOL,path=str(path),sha256=a.digest(a.read_bytes(path))):raise ValueError('Delivery development seal changed')
    value=a.read_json(path)
    if value['sourcePins']!=a.source_pins() or value['environment']!=a.environment() or value['selected']!=select(value['records']) or value['provenance']!=c.PROVENANCE:raise ValueError('Delivery development identity changed')
    data.verify_dataset(value['manifest'])
    if a.digest(a.read_bytes(value['manifest']))!=value['datasetSha256']:raise ValueError('Delivery dataset identity changed')
    for record in value['records']:
        model=a.safe(record['modelPath'])
        if a.digest(a.read_bytes(model,10*1024**2))!=record['modelSha256'] or record['native']['status']!='success' or not record['native']['cleanup_confirmed']:raise ValueError('Delivery model/native receipt changed')
        stem=model.with_suffix('.json')
        if a.digest(a.read_bytes(stem))!=record['jobSha256'] or a.digest(a.read_bytes(stem.with_suffix('.predictions.json')))!=record['predictionSha256']:raise ValueError('Delivery fit inputs/predictions changed')
    return value
