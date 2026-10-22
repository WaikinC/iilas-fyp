"""Frozen native Olist completed-order experiment; no application inference.

prepare verifies source/counts without fitting. develop fits 13+4+4 fixed models
and stops before confirmation. confirm reloads unchanged models in a separately
invoked, one-use phase. Generated data stays in ignored run directories.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
import csv
import hashlib
import io
import json
from pathlib import Path
import platform
import sys
import time
import warnings
import zipfile

import joblib
import numpy as np
import pandas as pd
import scipy
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, precision_recall_fscore_support, confusion_matrix
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier
from threadpoolctl import threadpool_limits

HERE = Path(__file__).resolve().parent
SOURCE = HERE/'datasets/olist-audit-2026-10-17'
PROTOCOL = HERE/'OLIST_TRAINING_PROTOCOL_2026-10-17.md'
PROTOCOL_ID = 'olist-native-calendar-lateness-1.0'
MANIFEST_HASH = '2a42c040846d7a6ddbb8b79be818385e54f1ea7e49f88a3b4bcf788f93f957af'
SEED = 20261017
FEATURES = ['purchase_month','purchase_weekday','purchase_hour','promised_calendar_lead_days']
FAMILIES = ['RF','DT','LR','Dummy']
WINDOWS = {
    'train': (datetime(2016,9,1),datetime(2018,1,1),datetime(2018,1,1)),
    'validation': (datetime(2018,1,1),datetime(2018,3,1),datetime(2018,5,1)),
    'confirmation': (datetime(2018,5,1),datetime(2018,7,1),datetime(2018,10,1)),
}
FLAGS = dict(protocol_status='proposed',primary_iilas_task_evaluated=False,
             operational_acceptance=False,source_aggregate_outcomes_previously_observed=True,
             confirmation_partition_counts_previously_observed=True,
             olist_model_scores_observed_before_protocol=False)
LIMITATIONS = [
    'Binary lateness conditional on recorded completion; not all-order failure or primary three-class risk.',
    'Retrospective temporal evaluation: event-time as-of proxies assume contemporaneous recording and unrevised purchase estimates; no coverage guarantee.',
    'Confirmation is source-audited and count-exposed, model-score-unexposed before this protocol, not untouched prospective data.',
    'Validation selection is optimistic; intervals condition on the same selected models and thresholds.',
    'Customer and week intervals are separate descriptive analyses; neither jointly handles dependencies or fitting/selection uncertainty.',
    'Few confirmation weeks; no operational acceptance, significance, calibration, causality or future prevalence guarantee.',
    'Frozen January model ages through confirmation; no train-plus-validation refit.',
    'Source Olist v2, CC BY-NC-SA 4.0, https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce; local noncommercial research only.',
]


def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''): h.update(b)
    return h.hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def write_json(path,value):
    with Path(path).open('x',encoding='utf-8') as f:
        json.dump(value,f,indent=2,sort_keys=True,allow_nan=False); f.write('\n')


def parse(value):
    if not value: return None
    try: return datetime.strptime(value,'%Y-%m-%d %H:%M:%S')
    except ValueError: return None


def assess(row):
    p,a,c,d,e=[parse(row.get(k,'')) for k in ['order_purchase_timestamp','order_approved_at','order_delivered_carrier_date','order_delivered_customer_date','order_estimated_delivery_date']]
    core=bool(row['order_status']=='delivered' and p and d and e and d>=p and e.date()>=p.date())
    for key in ['order_approved_at','order_delivered_carrier_date']:
        if row.get(key) and parse(row[key]) is None: raise ValueError('Invalid optional event timestamp')
    bad=any(x is not None and y is not None and x<y for x,y in [(a,p),(c,p),(c,a),(d,p),(d,a),(d,c)])
    return dict(p=p,d=d,e=e,core=core,strict=core and not bad,
                calendar=int(d.date()>e.date()) if core else None,exact=int(d>e) if core else None)


def mature(e,cutoff,days=30):
    return e is not None and e.replace(hour=0,minute=0,second=0,microsecond=0)+timedelta(days=days+1)<=cutoff


def window_for(p):
    return next((name for name,(start,end,_) in WINDOWS.items() if p is not None and start<=p<end),None)


def exclusion(r,role):
    if not r['core']: return 'noncore'
    cutoff=WINDOWS[role][2]
    if r['d']>=cutoff: return 'outcome_at_or_after_cutoff'
    if not mature(r['e'],cutoff): return 'immature_after_known'
    return None


def unique_map(rows,key,value=None):
    result={}
    for r in rows:
        k=r[key]
        if not k or k in result: raise ValueError('Duplicate or missing '+key)
        result[k]=r[value] if value else r
    return result


def prepare_rows(orders,customers,items,products=None):
    """One order per row; aggregate item entities before any order lookup."""
    order_map=unique_map(orders,'order_id')
    customer_map=unique_map(customers,'customer_id','customer_unique_id')
    if any(not x for x in customer_map.values()): raise ValueError('Missing customer group')
    product_map=unique_map(products,'product_id') if products is not None else None
    item_keys=set(); per_order=defaultdict(list)
    for item in items:
        key=(item['order_id'],item['order_item_id'])
        if key in item_keys or not all(key): raise ValueError('Duplicate or missing item key')
        item_keys.add(key)
        if item['order_id'] not in order_map: raise ValueError('Item order join failure')
        if product_map is not None and item['product_id'] not in product_map: raise ValueError('Item product join failure')
        per_order[item['order_id']].append(item)
    data={}; first={}
    for oid,r in order_map.items():
        if r['customer_id'] not in customer_map: raise ValueError('Customer join failure')
        a=assess(r); customer=customer_map[r['customer_id']]
        a.update(customer=customer,status=r['order_status']); data[oid]=a
        if a['p'] is not None: first[customer]=min(first.get(customer,a['p']),a['p'])
    parts={}; retained={}; rows=[]
    for role,(start,end,cutoff) in WINDOWS.items():
        window={k for k,r in data.items() if r['p'] is not None and start<=r['p']<end}
        reasons=Counter(exclusion(data[k],role) or 'retained' for k in window)
        ids={k for k in window if exclusion(data[k],role) is None}; retained[role]=ids
        strict={k for k in ids if data[k]['strict']}; noncore={k for k in window if not data[k]['core']}
        parts[role]=dict(purchase_window_orders=len(window),noncore_excluded=reasons['noncore'],
            outcome_at_or_after_cutoff_excluded=reasons['outcome_at_or_after_cutoff'],
            immature_after_known_excluded=reasons['immature_after_known'],retained=len(ids),
            calendar_late=sum(data[k]['calendar'] for k in ids),exact_late=sum(data[k]['exact'] for k in ids),
            strict_retained=len(strict),strict_calendar_late=sum(data[k]['calendar'] for k in strict),
            strict_exact_late=sum(data[k]['exact'] for k in strict),
            joined_item_rows=sum(len(per_order[k]) for k in ids),orders_without_items=sum(not per_order[k] for k in ids),
            unique_customers=len({data[k]['customer'] for k in ids}),
            noncore_status_counts=dict(Counter(data[k]['status'] for k in noncore)),
            outcome_at_or_after_cutoff_status_counts=dict(Counter(data[k]['status'] for k in window if exclusion(data[k],role)=='outcome_at_or_after_cutoff')),
            mature_noncore_orders=sum(mature(data[k]['e'],cutoff) for k in noncore),
            mature_noncore_status_counts=dict(Counter(data[k]['status'] for k in noncore if mature(data[k]['e'],cutoff))),
            core_completion_proportion=(len(window)-len(noncore))/len(window) if window else None,
            retained_completion_proportion=len(ids)/len(window) if window else None)
        for oid in sorted(ids):
            r=data[oid]; p,e=r['p'],r['e']
            rows.append(dict(order_id=oid,customer=r['customer'],split=role,calendar=r['calendar'],exact=r['exact'],
                strict=r['strict'],unseen_customer=first[r['customer']]>=start,mature60=mature(e,cutoff,60),
                month=p.strftime('%Y-%m'),week=(p-timedelta(days=p.weekday())).strftime('%Y-%m-%d'),
                purchase_month=p.month,purchase_weekday=p.weekday(),purchase_hour=p.hour,
                promised_calendar_lead_days=(e.date()-p.date()).days))
    if any(retained[a]&retained[b] for a in WINDOWS for b in WINDOWS if a!=b): raise ValueError('Split overlap')
    frame=pd.DataFrame(rows,columns=['order_id','customer','split','calendar','exact','strict','unseen_customer','mature60','month','week']+FEATURES)
    if frame.order_id.duplicated().any(): raise ValueError('Order weight multiplied')
    if len(frame): feature_frame(frame[FEATURES])
    train=retained['train']; tc={data[k]['customer'] for k in train}
    tp={i['product_id'] for k in train for i in per_order[k]}; ts={i['seller_id'] for k in train for i in per_order[k]}
    overlaps={}
    for role in ['validation','confirmation']:
        ids=retained[role]; start=WINDOWS[role][0]; unseen={k for k in ids if first[data[k]['customer']]>=start}
        overlaps[role]=dict(customers_seen_in_fit=len({data[k]['customer'] for k in ids}&tc),
            orders_customer_seen_in_fit=sum(data[k]['customer'] in tc for k in ids),
            orders_with_any_product_seen_in_fit=sum(any(i['product_id'] in tp for i in per_order[k]) for k in ids),
            orders_with_any_seller_seen_in_fit=sum(any(i['seller_id'] in ts for i in per_order[k]) for k in ids),
            unseen_at_window_origin_orders=len(unseen),unseen_at_window_origin_customers=len({data[k]['customer'] for k in unseen}),
            unseen_at_window_origin_calendar_late=sum(data[k]['calendar'] for k in unseen))
    summary=dict(all_orders=len(data),core_orders=sum(r['core'] for r in data.values()),
        strict_orders=sum(r['strict'] for r in data.values()),partitions=parts,entity_overlap=overlaps,
        outside_all_purchase_windows=sum(window_for(r['p']) is None for r in data.values()),
        feature_ranges={c:[int(frame[c].min()),int(frame[c].max())] for c in FEATURES} if len(frame) else {})
    return frame,summary


def source_hashes(source):
    source=Path(source).resolve()
    if sha(source/'manifest.json')!=MANIFEST_HASH: raise ValueError('Source manifest changed')
    manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8')); hashes={'manifest.json':MANIFEST_HASH}
    for r in manifest['files']:
        raw=source/r['relative_path']; path=raw.resolve()
        if not path.is_relative_to(source) or raw.is_symlink() or any(p.is_symlink() for p in raw.parents if p!=source and p.is_relative_to(source)): raise ValueError('Unsafe source path')
        if sha(path)!=r['sha256']: raise ValueError('Source bytes changed')
        hashes[r['relative_path']]=r['sha256']
    return hashes


def load_source(source=SOURCE,verify_counts=True):
    source=Path(source); before=source_hashes(source)
    def read(name):
        with (source/'source'/name).open(encoding='utf-8',newline='') as f: return list(csv.DictReader(f))
    with zipfile.ZipFile(source/'olist-v2.zip') as z:
        with z.open('olist_customers_dataset.csv') as f:
            customers=list(csv.DictReader(io.TextIOWrapper(f,encoding='utf-8')))
    frame,summary=prepare_rows(read('olist_orders_dataset.csv'),customers,read('olist_order_items_dataset.csv'),read('olist_products_dataset.csv'))
    if source_hashes(source)!=before: raise ValueError('Source changed during preparation')
    if verify_counts: check_counts(summary)
    records=frame[['order_id','split','calendar','exact','strict','unseen_customer','mature60']].to_dict('records')
    summary.update(source_hashes=before,split_sha256=digest(records),features=FEATURES)
    return frame,summary


def check_counts(s):
    if [s['all_orders'],s['core_orders'],s['strict_orders'],s['outside_all_purchase_windows']]!=[99441,96470,95097,26974]: raise ValueError('Source cohort mismatch')
    keys=['purchase_window_orders','noncore_excluded','outcome_at_or_after_cutoff_excluded','immature_after_known_excluded','retained','calendar_late','exact_late','strict_retained','strict_calendar_late','strict_exact_late','joined_item_rows']
    expected={'train':[45430,1737,2496,8952,32245,1203,1461,32145,1200,1457,36765],
              'validation':[13997,373,37,142,13445,1280,1463,13409,1279,1462,15342],
              'confirmation':[13040,195,2,1,12842,512,637,12651,507,631,14814]}
    for role,values in expected.items():
        if [s['partitions'][role][k] for k in keys]!=values: raise ValueError('Temporal cohort mismatch: '+role)
    keys=['customers_seen_in_fit','orders_customer_seen_in_fit','orders_with_any_product_seen_in_fit','orders_with_any_seller_seen_in_fit','unseen_at_window_origin_orders','unseen_at_window_origin_customers','unseen_at_window_origin_calendar_late']
    for role,values in {'validation':[160,173,6347,11289,13210,12961,1264],'confirmation':[133,139,3745,7843,12489,12371,503]}.items():
        if [s['entity_overlap'][role][k] for k in keys]!=values: raise ValueError('Entity cohort mismatch')


def feature_frame(x):
    if list(x.columns)!=FEATURES: raise ValueError('Exact ordered four-feature allowlist required')
    a=x.to_numpy(dtype=float)
    if not np.isfinite(a).all() or not np.equal(a,np.floor(a)).all(): raise ValueError('Invalid feature value')
    for j,lo,hi in [(0,1,12),(1,0,6),(2,0,23),(3,0,None)]:
        if (a[:,j]<lo).any() or hi is not None and (a[:,j]>hi).any(): raise ValueError('Out-of-range feature')
    return x


def registry():
    rows=[]
    for family in FAMILIES:
        if family in ['RF','DT']:
            for leaf in [5,20]:
                for weight in [None,'balanced_subsample' if family=='RF' else 'balanced']:
                    p=dict(criterion='gini',max_depth=16 if family=='RF' else 8,min_samples_leaf=leaf,class_weight=weight,random_state=SEED)
                    if family=='RF': p.update(n_estimators=200,max_features='sqrt',bootstrap=True,n_jobs=1)
                    rows.append(dict(family=family,params=p))
        elif family=='LR':
            for c in [.1,1.0]:
                for weight in [None,'balanced']:
                    rows.append(dict(family=family,params=dict(solver='lbfgs',penalty='l2',fit_intercept=True,max_iter=2000,tol=1e-4,random_state=SEED,C=c,class_weight=weight)))
        else: rows.append(dict(family=family,params=dict(strategy='prior')))
    for i,r in enumerate(rows): r.update(id=f'primary-{i:02d}-{r["family"]}',index=i)
    return rows


def estimator(spec):
    return {'RF':RandomForestClassifier,'DT':DecisionTreeClassifier,'LR':LogisticRegression,'Dummy':DummyClassifier}[spec['family']](**spec['params'])


def pipeline(spec):
    pre=ColumnTransformer([('categorical',OneHotEncoder(handle_unknown='ignore'),FEATURES[:3]),
        ('numeric',StandardScaler() if spec['family']=='LR' else 'passthrough',[FEATURES[3]])],remainder='drop')
    return Pipeline([('preprocess',pre),('estimator',estimator(spec))])


def frozen_registry():
    return [dict(r,installed_parameters=estimator(r).get_params()) for r in registry()]


def fit_ids():
    return [r['id'] for r in registry()]+[f'{v}-{f}' for v in ['exact','chronology'] for f in FAMILIES]


def sensitivity_specs(choices):
    by_id={r['id']:r for r in registry()}; jobs=[]
    for variant in ['exact','chronology']:
        for family in FAMILIES:
            spec=by_id[choices[family]['candidate_id']]
            jobs.append(dict(spec,id=f'{variant}-{family}',primary_candidate_id=spec['id'],variant=variant,threshold=choices[family]['threshold']))
    return jobs


def thresholds():
    return [k/200 for k in range(201)]+[float(np.nextafter(1.0,np.inf))]


def positive_probability(model,x):
    classes=np.asarray(model.classes_)
    if set(classes.tolist())!={0,1}: raise ValueError('Both fitted classes required')
    p=np.asarray(model.predict_proba(x))
    if p.shape!=(len(x),2) or not np.isfinite(p).all() or (p<0).any() or (p>1).any() or not np.allclose(p.sum(axis=1),1): raise ValueError('Invalid probabilities')
    return p[:,int(np.flatnonzero(classes==1)[0])]


def metrics(y,p,threshold):
    y=np.asarray(y,dtype=int); p=np.asarray(p,dtype=float)
    if len(y)!=len(p) or not np.isfinite(p).all() or (p<0).any() or (p>1).any(): raise ValueError('Invalid scores')
    pred=(p>=threshold).astype(int); cm=confusion_matrix(y,pred,labels=[0,1])
    pr,re,f1,support=precision_recall_fscore_support(y,pred,labels=[0,1],zero_division=0)
    both=set(y.tolist())=={0,1}; n=len(y); alerts=int(pred.sum())
    return dict(denominator=n,threshold=float(threshold),confusion_matrix=cm.tolist(),true_predicted_class_order=[0,1],
        classes={str(i):dict(precision=float(pr[i]) if support[i] else None,recall=float(re[i]) if support[i] else None,f1=float(f1[i]) if support[i] else None,support=int(support[i])) for i in [0,1]},
        macro_f1=float(f1.mean()) if both else None,positive_f1=float(f1[1]) if both else None,
        balanced_accuracy=float(re.mean()) if both else None,accuracy=float(np.trace(cm)/n) if n else None,
        average_precision=float(average_precision_score(y,p)) if both else None,
        positive_prevalence=float(y.mean()) if n else None,alert_count=alerts,alert_rate=alerts/n if n else None,
        false_positives=int(cm[0,1]),false_negatives=int(cm[1,0]),positive_precision_undefined=alerts==0,
        missing_class=not both,unavailable_metrics=['macro_f1','positive_f1','balanced_accuracy','average_precision'] if not both else [])


def ranking(r):
    return (-round(r['macro_f1'],12),-round(r['positive_f1'],12),-round(r['average_precision'],12),r['candidate_index'],abs(Decimal(str(r['threshold']))-Decimal('.5')),-r['threshold'])


def select(candidates,y):
    if set(np.asarray(y).tolist())!={0,1}: raise ValueError('Selection needs both classes')
    scores=[]
    for spec,p in candidates:
        for t in ([.5] if spec['family']=='Dummy' else thresholds()):
            m=metrics(y,p,t)
            scores.append(dict(candidate_id=spec['id'],candidate_index=spec['index'],family=spec['family'],threshold=t,
                macro_f1=m['macro_f1'],positive_f1=m['positive_f1'],average_precision=m['average_precision']))
    return min(scores,key=ranking),scores


def unseen_categories(model,x):
    enc=model.named_steps['preprocess'].named_transformers_['categorical']
    return {c:int((~x[c].isin(enc.categories_[i])).sum()) for i,c in enumerate(FEATURES[:3])}


def bootstrap(y,predictions,choices,groups,replicates=500):
    """Same cluster multiplicities for all models; no redraws or refits."""
    y=np.asarray(y); groups=np.asarray(groups)
    if len(y)!=len(groups): raise ValueError('Bootstrap grain mismatch')
    names=list(predictions); labels,inverse=np.unique(groups.astype(str),return_inverse=True); g=len(labels)
    if not g: return dict(clusters=0,replicates=replicates,models={},paired_differences={},unavailable='empty population')
    rng=np.random.default_rng(SEED); counts=np.zeros((replicates,g),dtype=np.int32)
    for i in range(replicates): counts[i]=np.bincount(rng.integers(0,g,size=g),minlength=g)
    vectors={}; out={}
    def interval(v):
        valid=np.isfinite(v); count=int(valid.sum())
        return dict(interval=np.percentile(v[valid],[2.5,97.5]).tolist() if count>=475 else None,
                    valid_replicates=count,invalid_replicates=int(replicates-count),
                    suppression_reason=None if count>=475 else 'Fewer than 475 class-complete replicates')
    for name in names:
        pred=np.asarray(predictions[name])>=choices[name]
        cluster=np.column_stack([np.bincount(inverse,weights=(y==a)&(pred==b),minlength=g) for a,b in [(0,0),(0,1),(1,0),(1,1)]])
        tn,fp,fn,tp=(counts@cluster).T; n=tn+fp+fn+tp; valid=((tn+fp)>0)&((tp+fn)>0)
        def divide(a,b): return np.divide(a,b,out=np.zeros_like(a,dtype=float),where=b!=0)
        vals=dict(macro_f1=(divide(2*tn,2*tn+fp+fn)+divide(2*tp,2*tp+fp+fn))/2,
            positive_precision=divide(tp,tp+fp),positive_recall=divide(tp,tp+fn),
            balanced_accuracy=(divide(tn,tn+fp)+divide(tp,tp+fn))/2,alert_rate=divide(tp+fp,n))
        for key in vals:
            if key!='alert_rate': vals[key]=np.where(valid,vals[key],np.nan)
        vectors[name]=vals; out[name]={key:interval(v) for key,v in vals.items()}
        out[name]['no_alert_replicates']=int(((tp+fp)==0).sum())
        out[name]['precision_convention']='zero_division=0; no-alert precision undefined flag retained'
    paired={}
    for other in ['DT','LR']:
        if 'RF' in vectors and other in vectors:
            paired['RF-minus-'+other]={key:interval(vectors['RF'][key]-vectors[other][key]) for key in vectors['RF']}
    return dict(seed=SEED,replicates=replicates,clusters=g,models=out,paired_differences=paired,
        paired_multiplicities=True,individual_order_resampling=False)


def population_report(frame,probabilities,choices,target='calendar',uncertainty=True):
    y=frame[target].to_numpy(dtype=int); result=dict(denominator=len(frame),target=target,models={})
    for family,p in probabilities.items():
        result['models'][family]=dict(selected=metrics(y,p,choices[family]['threshold']),at_05=metrics(y,p,.5))
    result['purchase_months']={}
    for month in sorted(frame.month.unique()):
        mask=(frame.month==month).to_numpy()
        result['purchase_months'][month]={f:dict(selected=metrics(y[mask],p[mask],choices[f]['threshold']),at_05=metrics(y[mask],p[mask],.5)) for f,p in probabilities.items()}
    if uncertainty:
        result['uncertainty']={group:{mode:bootstrap(y,probabilities,{f:choices[f]['threshold'] if mode=='selected' else .5 for f in probabilities},frame[group].to_numpy()) for mode in ['selected','at_05']} for group in ['customer','week']}
    return result


def complete_report(frame,predictions,choices):
    report=dict(flags=FLAGS,limitations=LIMITATIONS,populations={}); primary=predictions['primary']
    report['populations']['primary']=population_report(frame,primary,choices)
    for slice_name,column in [('unseen_at_window_origin_customer','unseen_customer'),('60_day_maturity','mature60')]:
        mask=frame[column].to_numpy(dtype=bool)
        report['populations'][slice_name]=population_report(frame.loc[mask],{f:p[mask] for f,p in primary.items()},choices)
    report['populations']['exact_refitted']=population_report(frame,predictions['exact'],choices,'exact')
    report['populations']['primary_predictions_exact_reference']=population_report(frame,primary,choices,'exact')
    strict=frame.strict.to_numpy(dtype=bool)
    report['populations']['chronology_refitted']=population_report(frame.loc[strict],{f:p[strict] for f,p in predictions['chronology'].items()},choices)
    report['populations']['primary_predictions_chronology_population_reference']=population_report(frame.loc[strict],{f:p[strict] for f,p in primary.items()},choices)
    return report


def freeze_inventory(path,metadata):
    path=Path(path)
    files={p.relative_to(path).as_posix():sha(p) for p in path.rglob('*') if p.is_file() and p.relative_to(path).as_posix() not in ['frozen.json','confirmation.claim']}
    write_json(path/'frozen.json',dict(metadata,artifacts=files))


def verify_inventory(path):
    path=Path(path); frozen=json.loads((path/'frozen.json').read_text(encoding='utf-8'))
    if frozen.get('status')!='success': raise ValueError('Development not successful')
    for name,value in frozen['artifacts'].items():
        raw=path/name; p=raw.resolve()
        if not p.is_relative_to(path.resolve()) or raw.is_symlink() or any(q.is_symlink() for q in raw.parents if q!=path and q.is_relative_to(path)) or not p.is_file() or sha(p)!=value: raise ValueError('Frozen artifact tampering')
    actual={p.relative_to(path).as_posix() for p in path.rglob('*') if p.is_file() and p.relative_to(path).as_posix() not in ['frozen.json','confirmation.claim']}
    if actual!=set(frozen['artifacts']): raise ValueError('Frozen inventory mismatch')
    return frozen


def claim_confirmation(path):
    with (Path(path)/'confirmation.claim').open('x',encoding='utf-8') as f: f.write('Single confirmation invocation claimed; failed attempts are not resumable.\n')


def versions():
    return dict(python=platform.python_version(),numpy=np.__version__,pandas=pd.__version__,scipy=scipy.__version__,sklearn=sklearn.__version__,joblib=joblib.__version__)


def validate_environment():
    if sklearn.__version__!='1.8.0': raise ValueError('Protocol requires reviewed scikit-learn 1.8.0; no dependency upgrade or silent migration')


def code_hashes():
    return {p.name:sha(p) for p in [Path(__file__),HERE/'runner_runtime.py',PROTOCOL]}


def manifest(summary):
    return dict(protocol_id=PROTOCOL_ID,flags=FLAGS,limitations=LIMITATIONS,versions=versions(),code_hashes=code_hashes(),
        registry=frozen_registry(),features=FEATURES,seed=SEED,thresholds=thresholds(),
        windows={k:[v.isoformat() for v in spec] for k,spec in WINDOWS.items()},source=summary,
        fit_ids=fit_ids(),fit_budget=21,refit_confirmation=False,threads=1)


def run_fit(run_dir,spec,train,evaluation,supervisor):
    """Separate monitored fit process; worker never receives evaluation labels."""
    ident=spec['id']; jobdir=run_dir/ident; jobdir.mkdir()
    data=dict(x_train=feature_frame(train[FEATURES]),y_train=train['exact' if spec.get('variant')=='exact' else 'calendar'].to_numpy(),
              x_evaluation=feature_frame(evaluation[FEATURES]),spec=spec)
    if set(data['y_train'].tolist())!={0,1}: raise ValueError('Missing training class')
    joblib.dump(data,jobdir/'input.joblib')
    result=supervisor.run([sys.executable,str(Path(__file__).resolve()),'_fit','--job',str(jobdir)],fit_id=ident,cwd=str(HERE.parent))
    write_json(jobdir/'execution.json',result)
    if result['status']!='success': raise RuntimeError('Incomplete fit: '+ident)
    if not all((jobdir/f).is_file() for f in ['model.joblib','probabilities.npy','fit.json']): raise ValueError('Incomplete fit reconstruction')
    p=np.load(jobdir/'probabilities.npy',allow_pickle=False)
    if len(p)!=len(evaluation) or not np.isfinite(p).all() or (p<0).any() or (p>1).any(): raise ValueError('Invalid worker output')
    return p,result


def fit_worker(job):
    job=Path(job); data=joblib.load(job/'input.joblib'); model=pipeline(data['spec'])
    with threadpool_limits(limits=1),warnings.catch_warnings():
        warnings.simplefilter('error',ConvergenceWarning)
        model.fit(feature_frame(data['x_train']),data['y_train'])
        p=positive_probability(model,feature_frame(data['x_evaluation']))
    joblib.dump(model,job/'model.joblib')
    with (job/'probabilities.npy').open('xb') as f: np.save(f,p,allow_pickle=False)
    write_json(job/'fit.json',dict(spec=data['spec'],classes=model.classes_.tolist(),
        train_rows=len(data['y_train']),evaluation_rows=len(p),unknown_categories=unseen_categories(model,data['x_evaluation']),
        fitted_parameters=model.named_steps['estimator'].get_params()))


def develop(source,output,supervisor):
    from runner_runtime import FitLedger
    validate_environment()
    started=time.monotonic(); frame,summary=load_source(source)
    write_json(output/'manifest.json',manifest(summary))
    train=frame[frame.split=='train'].reset_index(drop=True); validation=frame[frame.split=='validation'].reset_index(drop=True)
    if set(validation.calendar)!={0,1}: raise ValueError('Missing validation class')
    ledger=FitLedger(fit_ids()); probabilities={}; all_scores=[]; choices={}
    for spec in registry():
        p,result=run_fit(output,spec,train,validation,supervisor); ledger.record(spec['id'],result); probabilities[spec['id']]=p
    for family in FAMILIES:
        selected,scores=select([(r,probabilities[r['id']]) for r in registry() if r['family']==family],validation.calendar)
        choices[family]=selected; all_scores.extend(scores)
    selection=dict(choices=choices,overall_diagnostic=min(choices.values(),key=ranking),all_validation_scores=all_scores,
        manifest_sha256=sha(output/'manifest.json'),confirmation_scored=False,primary_fits_complete=True)
    selection['dummy_comparison']={f:dict(macro_f1_difference=choices[f]['macro_f1']-choices['Dummy']['macro_f1'],
        improves_macro_f1=round(choices[f]['macro_f1'],12)>round(choices['Dummy']['macro_f1'],12)) for f in ['RF','DT','LR']}
    selection['all_families_fail_to_improve_dummy']=not any(v['improves_macro_f1'] for v in selection['dummy_comparison'].values())
    write_json(output/'selection.json',selection)
    preds={'primary':{f:probabilities[c['candidate_id']] for f,c in choices.items()},'exact':{},'chronology':{}}
    for spec in sensitivity_specs(choices):
        fit_train=train[train.strict].reset_index(drop=True) if spec['variant']=='chronology' else train
        p,result=run_fit(output,spec,fit_train,validation,supervisor); ledger.record(spec['id'],result)
        preds[spec['variant']][spec['family']]=p
    write_json(output/'fit-ledger.json',ledger.seal()); save_predictions(output,validation,preds)
    report=complete_report(validation,preds,choices)
    report['phase_flags']=dict(real_fitting_performed=True,validation_scored=True,confirmation_scored=False)
    write_json(output/'validation-report.json',report)
    write_json(output/'completion.json',dict(status='success',phase='development',elapsed_seconds=time.monotonic()-started,
        selection_sha256=sha(output/'selection.json'),manifest_sha256=sha(output/'manifest.json'),fit_count=21))


def save_predictions(output,frame,predictions):
    frame[['order_id','customer','month','week']].to_csv(output/'prediction-index.csv',index=False,mode='x')
    arrays={v+'__'+f:p for v,models in predictions.items() for f,p in models.items()}
    with (output/'predictions.npz').open('xb') as stream: np.savez_compressed(stream,**arrays)


def validate_development(path):
    validate_environment()
    frozen=verify_inventory(path)
    if frozen.get('phase')!='development' or frozen.get('fit_count')!=21: raise ValueError('Incomplete development')
    path=Path(path); m=json.loads((path/'manifest.json').read_text()); s=json.loads((path/'selection.json').read_text())
    phase=json.loads((path/'develop.result.json').read_text())
    if phase['status']!='success' or phase['returncode']!=0 or frozen['elapsed_seconds']!=phase['elapsed_seconds'] or not 0<phase['elapsed_seconds']<5400:
        raise ValueError('Outer phase completion/budget altered')
    ledger=json.loads((path/'fit-ledger.json').read_text())
    if ledger.get('status')!='complete' or ledger.get('expected_ids')!=fit_ids() or set(ledger.get('results',{}))!=set(fit_ids()) or any(r.get('status')!='success' for r in ledger['results'].values()):
        raise ValueError('Incomplete fit ledger')
    if sha(path/'manifest.json')!=frozen['manifest_sha256'] or sha(path/'selection.json')!=frozen['selection_sha256']: raise ValueError('Selection seal mismatch')
    if m['code_hashes']!=code_hashes() or m['versions']!=versions() or m['registry']!=frozen_registry() or m['features']!=FEATURES: raise ValueError('Code/runtime/protocol contract changed')
    if s['manifest_sha256']!=sha(path/'manifest.json') or s['confirmation_scored'] or not s['primary_fits_complete']: raise ValueError('Invalid selection')
    for family in FAMILIES:
        expected=min([r for r in s['all_validation_scores'] if r['family']==family],key=ranking)
        if s['choices'][family]!=expected: raise ValueError('Selection choices altered')
    return frozen,m,s


def confirm(source,output,development):
    development=Path(development); frozen,m,s=validate_development(development)
    claim_confirmation(development)
    started=time.monotonic(); frame,summary=load_source(source)
    if summary!=m['source']: raise ValueError('Source/split contract changed')
    frame=frame[frame.split=='confirmation'].reset_index(drop=True)
    choices=s['choices']; predictions={v:{} for v in ['primary','exact','chronology']}; unknown={}
    # Freeze all twelve predictions BEFORE computing any confirmation metric.
    for variant in predictions:
        for family in FAMILIES:
            ident=choices[family]['candidate_id'] if variant=='primary' else variant+'-'+family
            model=joblib.load(development/ident/'model.joblib')
            with threadpool_limits(limits=1): p=positive_probability(model,feature_frame(frame[FEATURES]))
            predictions[variant][family]=p; unknown[variant+'-'+family]=unseen_categories(model,frame[FEATURES])
    write_json(output/'manifest.json',dict(m,phase='confirmation',development_inventory_sha256=sha(development/'frozen.json'),
        selection_sha256=sha(development/'selection.json'),refits=0,prior_elapsed_seconds=frozen['elapsed_seconds']))
    save_predictions(output,frame,predictions)
    write_json(output/'predictions-frozen.json',dict(predictions_sha256=sha(output/'predictions.npz'),index_sha256=sha(output/'prediction-index.csv'),unknown_categories=unknown))
    report=complete_report(frame,predictions,choices)
    report['phase_flags']=dict(real_fitting_performed=False,prior_development_fits_exist=True,confirmation_scored=True,confirmation_refits=0)
    write_json(output/'confirmation-report.json',report)
    write_json(output/'completion.json',dict(status='success',phase='confirmation',elapsed_seconds=frozen['elapsed_seconds']+time.monotonic()-started,fit_count=0))


def limits(wall=5400):
    from runner_runtime import Limits
    return Limits(max_wall_seconds=wall,max_fit_seconds=600,max_rss_bytes=2*1024**3,min_available_bytes=3*1024**3,
        min_free_disk_bytes=1024**3,max_output_bytes=2*1024**3,poll_seconds=1,threads=1)


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__); sub=parser.add_subparsers(dest='command',required=True)
    for name in ['prepare','develop','confirm']:
        p=sub.add_parser(name); p.add_argument('--source',type=Path,default=SOURCE); p.add_argument('--output',type=Path,required=True)
        if name=='confirm': p.add_argument('--development',type=Path,required=True)
    p=sub.add_parser('_fit',help=argparse.SUPPRESS); p.add_argument('--job',type=Path,required=True)
    p=sub.add_parser('_phase',help=argparse.SUPPRESS); p.add_argument('--phase',choices=['prepare','develop','confirm'],required=True)
    p.add_argument('--source',type=Path,required=True); p.add_argument('--output',type=Path,required=True); p.add_argument('--development',type=Path)
    args=parser.parse_args(argv)
    if args.command in ['_fit','_phase']:
        from runner_runtime import require_supervised_worker
        require_supervised_worker()
    if args.command=='_fit': fit_worker(args.job); return
    from runner_runtime import ResourceSupervisor,create_run_directory
    if args.command=='_phase':
        if args.phase=='prepare':
            _,summary=load_source(args.source); write_json(args.output/'prepare.json',dict(summary,no_fit=True,no_model_scoring=True,flags=FLAGS,versions=versions(),code_hashes=code_hashes()))
        elif args.phase=='develop': develop(args.source,args.output,ResourceSupervisor(args.output,limits()))
        else: confirm(args.source,args.output,args.development)
        return
    wall=5400
    if args.command=='confirm':
        frozen,_,_=validate_development(args.development); wall-=float(frozen['elapsed_seconds'])
        if wall<=0: raise ValueError('90-minute experiment budget exhausted')
    output=create_run_directory(args.output,repo_root=HERE.parent)
    write_json(output/'invocation.json',dict(phase=args.command,started=datetime.now().isoformat(),flags=FLAGS,limits=vars(limits(wall))))
    command=[sys.executable,str(Path(__file__).resolve()),'_phase','--phase',args.command,'--source',str(args.source.resolve()),'--output',str(output.resolve())]
    if args.command=='confirm': command+=['--development',str(args.development.resolve())]
    result=ResourceSupervisor(output,limits(wall)).run(command,fit_id=args.command,cwd=str(HERE.parent),enforce_fit_timeout=False)
    if result['status']!='success':
        write_json(output/'phase-failure.json',result); raise RuntimeError('Olist phase incomplete: '+str(result.get('reason')))
    if args.command!='prepare':
        completion=json.loads((output/'completion.json').read_text())
        completion['elapsed_seconds']=result['elapsed_seconds']+(5400-wall)
        freeze_inventory(output,completion)
    print(json.dumps(dict(status='success',phase=args.command,output=str(output),fit_count=21 if args.command=='develop' else 0)))


if __name__=='__main__': main()
