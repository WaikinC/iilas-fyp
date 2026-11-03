"""Registered paired RF/DT experiment; test observations are never loaded here."""
from collections import Counter, defaultdict
import math
import io
import hashlib
import re
from pathlib import Path
import sys

import inventory_context_artifacts as a
import inventory_context_contract as c

ARMS=('RF6','RF14','DT6','DT14')


def candidates():
    return [dict(arm=arm,features='context' if arm.endswith('14') else 'six',depth=depth,leaf=leaf)
        for arm in ARMS for depth in ((6,12) if arm.startswith('RF') else (4,8)) for leaf in (2,5)]


def candidate_id(spec):
    if spec not in candidates():raise ValueError('Unregistered parameters')
    return f"{spec['arm']}-d{spec['depth']}-l{spec['leaf']}"


def fit_ids():
    return tuple(f'cv-{candidate_id(spec)}-f{fold}' for spec in candidates() for fold in range(3)) + tuple('final-'+arm for arm in ARMS)


def estimator(spec):
    candidate_id(spec)
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.tree import DecisionTreeClassifier
    kw=dict(max_depth=spec['depth'],min_samples_leaf=spec['leaf'],class_weight='balanced',random_state=42)
    return (RandomForestClassifier(n_estimators=100,n_jobs=2,**kw) if spec['arm'].startswith('RF')
            else DecisionTreeClassifier(**kw))


def matrix(rows,feature_set):
    result=[]
    for row in rows:
        values=list(c.encode_case(row['case'],feature_set='context'))
        if row['features']!=values:raise ValueError('Changed encoded predictors')
        if feature_set not in ('six','context'):raise ValueError('Unknown feature set')
        result.append(values[:6] if feature_set=='six' else values)
    return result


def select(records):
    if len(records)!=48:raise ValueError('Selection needs all 48 folds')
    grouped=defaultdict(dict)
    for record in records:
        c.sim.exact(record,('spec','fold','macro_f1','critical_recall'),'selection record')
        identity=candidate_id(record['spec']);fold=record['fold']
        if type(fold) is not int or fold not in (0,1,2) or fold in grouped[identity]:
            raise ValueError('Repeated or unknown fold')
        for key in ('macro_f1','critical_recall'):
            if type(record[key]) not in (int,float) or not math.isfinite(record[key]) or not 0<=record[key]<=1:
                raise ValueError('Invalid selection score')
        grouped[identity][fold]=record
    if set(grouped)!={candidate_id(spec) for spec in candidates()} or any(len(v)!=3 for v in grouped.values()):
        raise ValueError('Incomplete candidate coverage')
    def ranking(spec):
        values=grouped[candidate_id(spec)].values()
        return (-sum(v['macro_f1'] for v in values)/3,-sum(v['critical_recall'] for v in values)/3,spec['depth'],-spec['leaf'])
    return {arm:min((s for s in candidates() if s['arm']==arm),key=ranking) for arm in ARMS}


def _majority(labels):
    counts=Counter(labels)
    if not labels or set(counts)-set(c.CLASSES):raise ValueError('Invalid training labels')
    return max(c.CLASSES,key=lambda label:counts[label])


def fit_controls(rows):
    overall=_majority([r['label'] for r in rows]);statuses={}
    for status in c.STATUSES:
        labels=[r['label'] for r in rows if r['case']['context']['supply_status']==status]
        statuses[status]=_majority(labels) if labels else overall
    return dict(majority=overall,status=statuses,provenance=c.PROVENANCE)


def predict_controls(controls,rows):
    return dict(majority=[controls['majority'] for _ in rows],
        status=[controls['status'][r['case']['context']['supply_status']] for r in rows],
        teacher=[c.teach_case(r['case'])['label'] for r in rows],
        binary_reorder=[r['case']['ledger']['reorder_level']>=r['features'][0] for r in rows])


def predictions(model,x):
    if set(model.classes_)!=set(c.CLASSES):raise ValueError('Estimator lacks classes')
    probabilities=model.predict_proba(x)
    indexes=[list(model.classes_).index(label) for label in c.CLASSES]
    ordered=[[float(row[index]) for index in indexes] for row in probabilities]
    result=dict(classes=list(c.CLASSES),probabilities=ordered,
        predicted=[str(model.classes_[max(range(3),key=lambda i:row[i])]) for row in probabilities])
    validate_predictions(result,len(x))
    return result


def validate_predictions(result,count):
    c.sim.exact(result,('classes','probabilities','predicted'),'predictions')
    if result['classes']!=list(c.CLASSES) or len(result['probabilities'])!=count or len(result['predicted'])!=count:
        raise ValueError('Prediction class order/count mismatch')
    for row,label in zip(result['probabilities'],result['predicted']):
        if (len(row)!=3 or any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1 for v in row)
            or abs(sum(row)-1)>1e-8 or label!=max(sorted(c.CLASSES),key=lambda name:row[c.CLASSES.index(name)])):
            raise ValueError('Invalid probability or argmax')


def serialize_model(model):
    import joblib
    stream=io.BytesIO()
    joblib.dump(model,stream,compress=3)
    return stream.getvalue()


def score(truth,predicted):
    if not truth or len(truth)!=len(predicted) or (set(truth)|set(predicted))-set(c.CLASSES):
        raise ValueError('Invalid metric observations')
    confusion=[[0]*3 for _ in range(3)]
    for actual,guess in zip(truth,predicted):confusion[c.CLASSES.index(actual)][c.CLASSES.index(guess)]+=1
    per_class={};undefined_precision=[];undefined_recall=[];undefined_f1=[]
    for i,label in enumerate(c.CLASSES):
        tp=confusion[i][i];support=sum(confusion[i]);positive=sum(row[i] for row in confusion)
        if not positive:undefined_precision.append(label)
        if not support:undefined_recall.append(label)
        if not positive and not support:undefined_f1.append(label)
        precision=tp/positive if positive else 0;recall=tp/support if support else 0
        per_class[label]=dict(precision=precision,recall=recall,f1=2*precision*recall/(precision+recall) if precision+recall else 0,support=support)
    return dict(accuracy=sum(confusion[i][i] for i in range(3))/len(truth),
        macro_f1=sum(v['f1'] for v in per_class.values())/3,per_class=per_class,confusion=confusion,
        critical_as_normal=confusion[2][0],false_alerts=confusion[0][1]+confusion[0][2],
        undefined_precision=undefined_precision,undefined_recall=undefined_recall,undefined_f1=undefined_f1)


def fit_worker(job,expected_sha256):
    a.runtime.require_supervised_worker()
    job=Path(job)
    if a.runtime.sha256_file(job)!=expected_sha256:raise ValueError('Scheduled job changed')
    value=a.read_json(job)
    c.sim.exact(value,('fit_id','spec','features','source_sha256','phase_claim_sha256','x_train','y_train','x_evaluate'),'fit job')
    ident=value['fit_id'];spec=value['spec'];candidate_id(spec)
    if ident not in fit_ids() or (ident.startswith('cv-') and not ident.startswith('cv-'+candidate_id(spec)+'-')) or (ident.startswith('final-') and ident!='final-'+spec['arm']):
        raise ValueError('Unregistered fit identity')
    expected_features=list(c.FEATURES6 if spec['features']=='six' else c.FEATURES14)
    if value['features']!=expected_features:raise ValueError('Changed worker feature order')
    claim=a.read_json(a._claim_path('development'))
    a.verify_claim(claim,'development',value['source_sha256'],job.parent)
    if c.sim.digest(claim)!=value['phase_claim_sha256']:raise ValueError('Worker claim changed')
    if a.completion('preparation')['source_sha256']!=value['source_sha256']:raise ValueError('Worker source changed')
    for matrix_ in (value['x_train'],value['x_evaluate']):
        if not matrix_ or len(matrix_)>2880 or any(len(row)!=len(expected_features) or any(type(v) not in (int,float) or not math.isfinite(v) for v in row) for row in matrix_):
            raise ValueError('Invalid worker matrix')
    if len(value['x_train'])!=len(value['y_train']) or set(value['y_train'])!=set(c.CLASSES):raise ValueError('Invalid worker labels')
    from threadpoolctl import threadpool_limits
    with threadpool_limits(limits=2):
        model=estimator(spec);model.fit(value['x_train'],value['y_train'])
        result=predictions(model,value['x_evaluate'])
    encoded=serialize_model(model)
    retained=ident.startswith('final-')
    if retained:
        with (job.parent/(ident+'.joblib')).open('xb') as stream:stream.write(encoded)
    a.write_json(job.parent/(ident+'.predictions.json'),result)
    a.write_json(job.parent/(ident+'.fit.json'),dict(fit_id=ident,spec=spec,
        job_sha256=expected_sha256,source_sha256=value['source_sha256'],
        phase_claim_sha256=value['phase_claim_sha256'],model_sha256=hashlib.sha256(encoded).hexdigest(),
        model_retained=retained,model_bytes=len(encoded),serialization='joblib-zlib3',
        classes=list(c.CLASSES),input_sha256=c.sim.digest({k:value[k] for k in ('x_train','y_train','x_evaluate')}),
        provenance=c.PROVENANCE))


def _run_fit(output,ident,spec,train,evaluate,source_sha256,claim,supervisor):
    value=dict(fit_id=ident,spec=spec,features=list(c.FEATURES6 if spec['features']=='six' else c.FEATURES14),
        source_sha256=source_sha256,phase_claim_sha256=c.sim.digest(claim),
        x_train=matrix(train,spec['features']),y_train=[r['label'] for r in train],x_evaluate=matrix(evaluate,spec['features']))
    job=output/(ident+'.job.json');a.write_json(job,value)
    result=supervisor.run([sys.executable,str(Path(__file__).with_name('inventory_context_cli.py')),
        '_fit','--job',str(job),'--job-sha256',a.runtime.sha256_file(job)],fit_id=ident,cwd=a.ROOT)
    if result['status']!='success' or not result['cleanup_confirmed']:raise a.runtime.RuntimeSafetyError('Fit failed: '+str(result['reason']))
    predictions_=a.read_json(output/(ident+'.predictions.json'));validate_predictions(predictions_,len(evaluate))
    receipt=a.read_json(output/(ident+'.fit.json'))
    if receipt['job_sha256']!=a.runtime.sha256_file(job):raise ValueError('Worker consumed another job')
    entry=dict(fit_id=ident,spec=spec,train_ids=[r['sample_id'] for r in train],
        evaluate_ids=[r['sample_id'] for r in evaluate],receipt=receipt)
    return entry,predictions_


def develop(source,source_sha256,output,supervisor):
    a.runtime.require_supervised_worker();output=Path(output)
    claim=a.read_json(a._claim_path('development'));a.verify_claim(claim,'development',source_sha256,output)
    rows=a.load_rows(source,source_sha256,'development')
    manifest=a.read_manifest(source,source_sha256)
    splits=a.decode_json(a.checked_bytes(source,manifest,'splits.json'))
    records=[];ledger=[];fold_controls=[]
    for fold,groups in enumerate(splits['folds']):
        train=[r for r in rows if r['family_id'] in groups['train']]
        validation=[r for r in rows if r['family_id'] in groups['validation']]
        if len(train)!=1920 or len(validation)!=960:raise ValueError('Invalid grouped fold')
        controls=fit_controls(train);control_predictions=predict_controls(controls,validation)
        fold_controls.append(dict(fold=fold,controls=controls,metrics={key:score([r['label'] for r in validation],values)
            for key,values in control_predictions.items() if key!='binary_reorder'}))
        for spec in candidates():
            ident=f'cv-{candidate_id(spec)}-f{fold}'
            entry,result=_run_fit(output,ident,spec,train,validation,source_sha256,claim,supervisor)
            metric=score([r['label'] for r in validation],result['predicted'])
            records.append(dict(spec=spec,fold=fold,macro_f1=metric['macro_f1'],critical_recall=metric['per_class'][c.CLASSES[2]]['recall']))
            entry['metrics']=metric;ledger.append(entry)
    selected=select(records)
    for arm in ARMS:
        entry,_=_run_fit(output,'final-'+arm,selected[arm],rows,rows,source_sha256,claim,supervisor)
        ledger.append(entry)
    result=dict(source=str(Path(source).resolve()),source_sha256=source_sha256,basis=a.basis(),
        selected=selected,records=records,ledger=ledger,folds=splits['folds'],fold_controls=fold_controls,
        controls=fit_controls(rows),status_support={status:dict(Counter(r['label'] for r in rows if r['case']['context']['supply_status']==status)) for status in c.STATUSES},
        provenance=c.PROVENANCE)
    a.write_json(output/'development.json',result)
    validate_development(output,source_sha256)
    return result


def validate_development(path,source_sha256):
    """Read-only recheck from saved jobs/predictions; never unpickle or fit."""
    path=Path(path);value=a.read_json(path/'development.json')
    if value['source_sha256']!=source_sha256 or value['basis']!=a.basis() or value['provenance']!=c.PROVENANCE:
        raise ValueError('Development lineage/provenance changed')
    if value['selected']!=select(value['records']):raise ValueError('Selection changed')
    rows=a.load_rows(Path(value['source']),source_sha256,'development')
    source_manifest=a.read_manifest(Path(value['source']),source_sha256)
    folds=a.decode_json(a.checked_bytes(Path(value['source']),source_manifest,'splits.json'))['folds']
    if value['folds']!=folds or value['controls']!=fit_controls(rows):raise ValueError('Changed folds/controls')
    expected_controls=[]
    for fold,groups in enumerate(folds):
        train=[r for r in rows if r['family_id'] in groups['train']]
        validation=[r for r in rows if r['family_id'] in groups['validation']]
        controls=fit_controls(train)
        expected_controls.append(dict(fold=fold,controls=controls,metrics={key:score([r['label'] for r in validation],values)
            for key,values in predict_controls(controls,validation).items() if key!='binary_reorder'}))
    expected_support={status:dict(Counter(r['label'] for r in rows if r['case']['context']['supply_status']==status)) for status in c.STATUSES}
    if value['fold_controls']!=expected_controls or value['status_support']!=expected_support:raise ValueError('Fold controls/status support changed')
    ledger=value['ledger']
    if len(ledger)!=52 or Counter(e['fit_id'] for e in ledger)!=Counter(fit_ids()):raise ValueError('Fit budget/coverage mismatch')
    records=[]
    claim=a.read_json(a._claim_path('development'));a.verify_claim(claim,'development',source_sha256,path)
    for entry in ledger:
        ident=entry['fit_id'];spec=entry['spec'];candidate_id(spec)
        if ident.startswith('cv-'):
            fold=int(ident[-1]);groups=folds[fold]
            train=[r for r in rows if r['family_id'] in groups['train']]
            evaluate=[r for r in rows if r['family_id'] in groups['validation']]
            if ident!=f'cv-{candidate_id(spec)}-f{fold}':raise ValueError('Fit/spec mismatch')
        else:
            train=evaluate=rows
            if spec!=value['selected'][ident.removeprefix('final-')]:raise ValueError('Final selection mismatch')
        if entry['train_ids']!=[r['sample_id'] for r in train] or entry['evaluate_ids']!=[r['sample_id'] for r in evaluate]:
            raise ValueError('Changed row order or split membership')
        job=a.read_json(path/(ident+'.job.json'))
        expected=dict(fit_id=ident,spec=spec,features=list(c.FEATURES6 if spec['features']=='six' else c.FEATURES14),
            source_sha256=source_sha256,phase_claim_sha256=c.sim.digest(claim),
            x_train=matrix(train,spec['features']),y_train=[r['label'] for r in train],x_evaluate=matrix(evaluate,spec['features']))
        receipt=a.read_json(path/(ident+'.fit.json'))
        if (job!=expected or receipt!=entry['receipt'] or receipt['job_sha256']!=a.runtime.sha256_file(path/(ident+'.job.json'))
            or receipt['fit_id']!=ident or receipt['spec']!=spec or receipt['source_sha256']!=source_sha256
            or receipt['phase_claim_sha256']!=c.sim.digest(claim)
            or type(receipt['model_bytes']) is not int or not 0<receipt['model_bytes']<a.MAX_BYTES
            or receipt['serialization']!='joblib-zlib3' or receipt['model_retained']!=ident.startswith('final-')
            or not re.fullmatch('[a-f0-9]{64}',receipt['model_sha256'])
            or receipt['classes']!=list(c.CLASSES) or receipt['provenance']!=c.PROVENANCE
            or receipt['input_sha256']!=c.sim.digest({k:expected[k] for k in ('x_train','y_train','x_evaluate')})):
            raise ValueError('Changed fitted artifact/input')
        model_path=path/(ident+'.joblib')
        if receipt['model_retained']:
            if receipt['model_sha256']!=a.runtime.sha256_file(model_path) or receipt['model_bytes']!=model_path.stat().st_size:
                raise ValueError('Changed final model')
        elif model_path.exists():raise ValueError('Unplanned retained CV model')
        native=a.read_json(path/(ident+'.result.json'))
        if native['status']!='success' or not native['cleanup_confirmed']:raise ValueError('Unconfirmed fit cleanup')
        result=a.read_json(path/(ident+'.predictions.json'));validate_predictions(result,len(evaluate))
        if ident.startswith('cv-'):
            metric=score([r['label'] for r in evaluate],result['predicted'])
            if metric!=entry['metrics']:raise ValueError('Fold scores changed')
            records.append(dict(spec=spec,fold=fold,macro_f1=metric['macro_f1'],critical_recall=metric['per_class'][c.CLASSES[2]]['recall']))
    if records!=value['records']:raise ValueError('Selection inputs changed')
    return dict(source_sha256=source_sha256,fits=52,selected=value['selected'])
