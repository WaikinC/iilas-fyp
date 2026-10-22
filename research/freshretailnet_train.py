"""Prospective FreshRetailNet recorded-event benchmark. No application activation.

Development reads only publisher train bytes. Confirmation is a separate invocation
requiring an immutable, successful development directory and exclusive replay claim.
"""
from pathlib import Path
import argparse
import hashlib
import json
import platform
import sys
import time
import numpy as np
import pandas as pd
import sklearn
from sklearn.dummy import DummyClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, precision_recall_fscore_support,
                             confusion_matrix, average_precision_score, precision_recall_curve)

ROOT=Path(__file__).resolve().parent
DATA=ROOT/'datasets'
AUDIT=DATA/'freshretailnet-audit-2026-10-17'
PROTOCOL=ROOT/'FRESHRETAILNET_TRAINING_PROTOCOL_2026-10-17.md'
PROTOCOL_ID='freshretailnet-recorded-stockout-dayahead-1.0'
PINNED={'train.parquet':'6706832db892bbae4969c19d87e07975d2543d2ba7d7d4756360654785de5a3d',
        'eval.parquet':'1b118840664280c6b88bffc84c80ee1f54c05d911e354b7599e5da10995e960e'}
COLUMNS=['store_id','product_id','city_id','dt','sale_amount','stock_hour6_22_cnt']
FEATURES=([f'sales_lag_{i}' for i in (1,7,14,28)]+[f'stockout_lag_{i}' for i in (1,7,14,28)]+
          [f'sales_mean_{i}' for i in (7,14,28)]+[f'stockout_mean_{i}' for i in (7,14,28)]+
          [f'stockout_fraction_{i}' for i in (7,14,28)]+[f'weekday_{i}' for i in range(7)])
EXPOSURE={'publisher_eval_aggregate_exposed':True,'publisher_eval_prediction_scores_previously_observed':False,
          'primary_iilas_task_evaluated':False,'fresh_external_confirmation':False,'operational_acceptance':False}


def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''): h.update(block)
    return h.hexdigest()


def features(frame,start,end):
    """Only strictly prior observations within each complete, consecutive series."""
    if frame[COLUMNS].isna().any().any(): raise ValueError('Null source data')
    f=frame[COLUMNS+([c for c in ('source_partition','source_row') if c in frame])].copy()
    f['dt']=pd.to_datetime(f.dt)
    f=f.sort_values(['store_id','product_id','dt'],ignore_index=True)
    if f.duplicated(['store_id','product_id','dt']).any(): raise ValueError('Duplicate key')
    if not f.groupby('store_id').city_id.nunique().eq(1).all(): raise ValueError('City mapping changed')
    sales=f.sale_amount.to_numpy(dtype=np.float64); counts=f.stock_hour6_22_cnt.to_numpy(dtype=np.float64)
    if not np.isfinite(sales).all() or (sales<0).any(): raise ValueError('Invalid sales')
    if not np.isfinite(counts).all() or (counts<0).any() or (counts>16).any() or (counts!=np.floor(counts)).any(): raise ValueError('Invalid count')
    groups=f.groupby(['store_id','product_id'],sort=False)
    delta=groups.dt.diff().dropna()
    if not delta.eq(pd.Timedelta(days=1)).all(): raise ValueError('Missing/nonconsecutive days')
    mask=f.dt.between(pd.Timestamp(start),pd.Timestamp(end))
    if not mask.any(): raise ValueError('No target rows')
    position=groups.cumcount()
    if (position[mask]<28).any(): raise ValueError('Insufficient 28-day history')
    # Compute float64 grouped shifted history, cast exactly once at the final boundary.
    result=[]
    for column in ('sale_amount','stock_hour6_22_cnt'):
        for lag in (1,7,14,28): result.append(groups[column].shift(lag).to_numpy()[mask])
    for column in ('sale_amount','stock_hour6_22_cnt','positive'):
        values=(f.stock_hour6_22_cnt.gt(0).astype(float) if column=='positive' else f[column].astype(float))
        shifted=values.groupby([f.store_id,f.product_id],sort=False).shift(1)
        for window in (7,14,28):
            rolled=shifted.groupby([f.store_id,f.product_id],sort=False).rolling(window,min_periods=window).mean().reset_index(level=[0,1],drop=True).sort_index()
            result.append(rolled.to_numpy()[mask])
    weekday=f.loc[mask,'dt'].dt.dayofweek.to_numpy()
    result.extend([(weekday==i).astype(float) for i in range(7)])
    x=np.column_stack(result).astype(np.float32)
    if not np.isfinite(x).all(): raise ValueError('Nonfinite feature history')
    metadata=f.loc[mask].reset_index(drop=True)
    metadata['label']=metadata.stock_hour6_22_cnt.gt(0).astype(np.uint8)
    return x,metadata


def prepare_phase(frame,phase):
    end='2024-06-25' if phase=='development' else '2024-07-02'
    if phase not in ('development','confirmation'): raise ValueError('Unknown phase')
    if pd.to_datetime(frame.dt).max()>pd.Timestamp(end): raise ValueError('Future partition accessible to phase')
    return features(frame,'2024-04-25',end)


def candidates():
    common=dict(criterion='gini',max_depth=12,min_samples_split=2,min_weight_fraction_leaf=0.,max_leaf_nodes=4096,
                min_impurity_decrease=0.,ccp_alpha=0.,monotonic_cst=None,random_state=42)
    rows=[dict(id='dummy_most_frequent',family='dummy',order=0,model=DummyClassifier(strategy='most_frequent',random_state=42))]
    for family,klass in [('dt',DecisionTreeClassifier),('rf',RandomForestClassifier)]:
        for weight,leaf in [('balanced',20),(None,20),('balanced',100)]:
            args=dict(common,min_samples_leaf=leaf,class_weight=weight)
            args.update(dict(splitter='best',max_features=None) if family=='dt' else dict(n_estimators=64,max_features='sqrt',bootstrap=True,max_samples=500000,oob_score=False,warm_start=False,n_jobs=2,verbose=0))
            rows.append(dict(id=f'{family}_{weight or "none"}_leaf{leaf}',family=family,order=len(rows),model=klass(**args)))
    return rows


def phase_candidates(phase,choices=None):
    if phase=='development': return candidates()
    if phase!='confirmation' or choices is None or set(choices)!={'rf','dt','dummy'}: raise ValueError('Invalid phase choices')
    rows=[]
    for family,choice in choices.items():
        matches=[r for r in candidates() if r['id']==choice['id'] and r['family']==family]
        if len(matches)!=1 or choice['threshold'] not in thresholds() or (family=='dummy' and choice['threshold']!=.5): raise ValueError('Invalid locked choices')
        rows.extend(matches)
    return sorted(rows,key=lambda row:row['order'])


def thresholds(): return np.r_[np.arange(201,dtype=float)/200,np.nextafter(1.,np.inf)]


def positive_probability(model,x):
    indices=np.flatnonzero(np.asarray(model.classes_)==1)
    if len(indices)!=1: raise ValueError('Positive class missing')
    p=np.concatenate([model.predict_proba(x[i:i+50000])[:,indices[0]] for i in range(0,len(x),50000)])
    if not np.isfinite(p).all() or (p<0).any() or (p>1).any(): raise ValueError('Invalid probability')
    return p


def metric_report(y,p,threshold):
    if set(np.unique(y))!={0,1}: raise ValueError('Scoring requires both classes')
    pred=np.asarray(p)>=threshold
    precision,recall,f1,support=precision_recall_fscore_support(y,pred,labels=[0,1],zero_division=0)
    matrix=confusion_matrix(y,pred,labels=[0,1]); tn,fp,fn,tp=map(int,matrix.ravel())
    return dict(threshold=float(threshold),accuracy=float(accuracy_score(y,pred)),balanced_accuracy=float(balanced_accuracy_score(y,pred)),
                macro_f1=float(f1.mean()),positive_f1=float(f1[1]),positive_ap=float(average_precision_score(y,p)),
                classes={str(i):dict(precision=float(precision[i]),recall=float(recall[i]),f1=float(f1[i]),support=int(support[i])) for i in (0,1)},
                confusion_matrix=matrix.tolist(),prevalence=float(np.mean(y)),fp=fp,fn=fn,alert_count=tp+fp,alert_rate=float(pred.mean()),undefined_positive_precision=tp+fp==0)


def choose(rows):
    return min(rows,key=lambda r:(-round(r['macro_f1'],12),-round(r['positive_f1'],12),-round(r['positive_ap'],12),r['order'],round(abs(r['threshold']-.5),12),-r['threshold']))


def _counts_metrics(tn,fp,fn,tp):
    div=lambda a,b:float(a/b) if b else 0.
    return dict(macro_f1=(div(2*tn,2*tn+fn+fp)+div(2*tp,2*tp+fn+fp))/2,
                positive_precision=div(tp,tp+fp),positive_recall=div(tp,tp+fn),balanced_accuracy=(div(tn,tn+fp)+div(tp,tp+fn))/2,
                alert_rate=div(tp+fp,tn+fp+fn+tp))


def cluster_bootstrap(y,predictions,city,product,*,phase='development',replicates=500):
    if set(np.unique(y))!={0,1}: raise ValueError('Bootstrap requires both classes')
    cities,ci=np.unique(city,return_inverse=True); products,pi=np.unique(product,return_inverse=True)
    cells=ci*len(products)+pi; n=len(cities)*len(products)
    aggregate={}
    for name,pred in predictions.items():
        aggregate[name]=np.stack([np.bincount(cells,weights=((y==actual)&(pred==guess)),minlength=n) for actual,guess in [(0,0),(0,1),(1,0),(1,1)]])
    rng=np.random.default_rng(20261017 if phase=='development' else 20261018)
    samples={name:[] for name in aggregate}; differences={}; invalid=0; zero_predictions={name:0 for name in aggregate}
    for _ in range(replicates):
        cw=np.bincount(rng.integers(len(cities),size=len(cities)),minlength=len(cities))
        pw=np.bincount(rng.integers(len(products),size=len(products)),minlength=len(products))
        weights=(cw[:,None]*pw[None,:]).ravel()
        counts={name:a@weights for name,a in aggregate.items()}
        first=next(iter(counts.values()))
        if first.sum()==0 or first[0]+first[1]==0 or first[2]+first[3]==0: invalid+=1; continue
        for name,(tn,fp,fn,tp) in counts.items():
            zero_predictions[name]+=int(tp+fp==0)
            samples[name].append(_counts_metrics(tn,fp,fn,tp))
        for comparator in ('dt','dummy'):
            if 'rf' in samples and comparator in samples:
                differences.setdefault('rf-minus-'+comparator,[]).append({key:samples['rf'][-1][key]-samples[comparator][-1][key] for key in samples['rf'][-1]})
    def intervals(rows):
        return {key:np.percentile([r[key] for r in rows],[2.5,97.5]).tolist() for key in rows[0]} if rows else {}
    return dict(available=invalid==0,replicates=replicates,invalid_replicates=invalid,no_predicted_positive_replicates=zero_predictions,
                intervals={} if invalid else {name:intervals(rows) for name,rows in samples.items()},
                paired_differences={} if invalid else {name:intervals(rows) for name,rows in differences.items()},
                interpretation='conditional descriptive crossed city/product uncertainty; no future time-shock, retraining or selection uncertainty')


def threshold_reports(y,p,cutoffs):
    if set(np.unique(y))!={0,1}: raise ValueError('Scoring requires both classes')
    p=np.asarray(p,dtype=float); y=np.asarray(y)
    if not np.isfinite(p).all() or (p<0).any() or (p>1).any(): raise ValueError('Invalid probabilities')
    order=np.argsort(p,kind='stable'); sorted_p=p[order]
    positive_prefix=np.r_[0,np.cumsum(y[order],dtype=np.int64)]
    positive=int(y.sum()); negative=len(y)-positive
    ap=float(average_precision_score(y,p)); result=[]
    for cutoff in cutoffs:
        excluded=int(np.searchsorted(sorted_p,cutoff,side='left'))
        fn=int(positive_prefix[excluded]); tn=excluded-fn; tp=positive-fn; fp=negative-tn
        base=_counts_metrics(tn,fp,fn,tp)
        div=lambda a,b:float(a/b) if b else 0.
        classes={'0':dict(precision=div(tn,tn+fn),recall=div(tn,negative),f1=div(2*tn,2*tn+fn+fp),support=negative),
                 '1':dict(precision=div(tp,tp+fp),recall=div(tp,positive),f1=div(2*tp,2*tp+fn+fp),support=positive)}
        result.append(dict(threshold=float(cutoff),accuracy=float((tn+tp)/len(y)),balanced_accuracy=base['balanced_accuracy'],
                           macro_f1=base['macro_f1'],positive_f1=classes['1']['f1'],positive_ap=ap,classes=classes,
                           confusion_matrix=[[tn,fp],[fn,tp]],prevalence=float(positive/len(y)),fp=fp,fn=fn,alert_count=tp+fp,
                           alert_rate=base['alert_rate'],undefined_positive_precision=tp+fp==0))
    return result


def environment():
    import joblib
    import threadpoolctl
    sys.path.insert(0,str(AUDIT/'_deps'))
    import pyarrow
    return dict(python=platform.python_version(),numpy=np.__version__,pandas=pd.__version__,sklearn=sklearn.__version__,joblib=joblib.__version__,threadpoolctl=threadpoolctl.__version__,pyarrow=pyarrow.__version__)


REVIEWED_ENVIRONMENT={'python':'3.13.15','numpy':'2.4.2','pandas':'3.0.1','sklearn':'1.8.0','joblib':'1.6.0','threadpoolctl':'3.7.0','pyarrow':'23.0.1'}

def require_environment():
    if environment()!=REVIEWED_ENVIRONMENT: raise ValueError('Unreviewed research environment; amended execution review required')


def registry():
    return [{key:value for key,value in row.items() if key!='model'}|{'params':row['model'].get_params(deep=True)} for row in candidates()]


def contract():
    return dict(protocol_id=PROTOCOL_ID,protocol_sha256=digest(PROTOCOL),code_sha256=digest(__file__),
                runtime_sha256=digest(ROOT/'runner_runtime.py'),environment=environment(),sources=PINNED,
                feature_order=FEATURES,dtype='float32',registry=registry(),exposure=EXPOSURE,
                attribution='Dingdong-Inc and Wang et al.; CC BY 4.0; release c374e85975c82816c495acfa904cc55ab14a47d3; derived binary target and strictly lagged sales/recorded-count features')


def freeze_selection(folder,choices,ledger):
    from runner_runtime import write_json_exclusive
    # Runtime ledger is necessary but not sufficient: demand all seven exact candidate IDs.
    expected=[r['id'] for r in candidates()]
    if ledger.get('status')!='complete' or set(ledger.get('results',{}))!=set(expected) or any(r.get('status')!='success' for r in ledger.get('results',{}).values()): raise ValueError('Incomplete development registry')
    files={p.relative_to(folder).as_posix():digest(p) for p in sorted(Path(folder).rglob('*')) if p.is_file() and not p.name.endswith(('.stdout.log','.stderr.log'))}
    record=dict(contract=contract(),choices=choices,ledger=ledger,artifacts=files)
    write_json_exclusive(Path(folder)/'selection.json',record)
    write_json_exclusive(Path(folder)/'selection-seal.json',{'sha256':digest(Path(folder)/'selection.json')})
    return record


def seal_completion(folder):
    from runner_runtime import write_json_exclusive
    folder=Path(folder)
    status=json.loads((folder/'phase-status.json').read_text())
    if status.get('status')!='success': raise ValueError('Cannot seal unsuccessful phase')
    artifacts={p.relative_to(folder).as_posix():digest(p) for p in sorted(folder.rglob('*')) if p.is_file()}
    write_json_exclusive(folder/'completion-seal.json',dict(artifacts=artifacts,selection_sha256=digest(folder/'selection.json')))


def validate_selection(folder):
    folder=Path(folder)
    try:
        completion=json.loads((folder/'completion-seal.json').read_text())
        for name,sha in completion['artifacts'].items():
            path=(folder/name).resolve()
            if not path.is_relative_to(folder.resolve()) or digest(path)!=sha: raise ValueError('Completed development artifact/status changed')
        if completion['selection_sha256']!=digest(folder/'selection.json'): raise ValueError('Completed selection changed')
        record=json.loads((folder/'selection.json').read_text())
        seal=json.loads((folder/'selection-seal.json').read_text())
        if digest(folder/'selection.json')!=seal['sha256'] or record['contract']!=contract(): raise ValueError('Selection contract/hash changed')
        if record['ledger'].get('status')!='complete' or set(record['ledger']['results'])!={r['id'] for r in candidates()} or any(r.get('status')!='success' for r in record['ledger']['results'].values()): raise ValueError('Incomplete fits')
        for name,value in record['artifacts'].items():
            path=(folder/name).resolve()
            if not path.is_relative_to(folder.resolve()) or digest(path)!=value: raise ValueError('Development artifact changed')
        ids={r['id']:r for r in candidates()}
        if set(record['choices'])!={'rf','dt','dummy'}: raise ValueError('Missing locked family')
        for family,choice in record['choices'].items():
            if ids[choice['id']]['family']!=family or choice['threshold'] not in thresholds(): raise ValueError('Invalid family/threshold')
        if record['choices']['dummy']['threshold']!=.5: raise ValueError('Dummy threshold altered')
        status=json.loads((folder/'phase-status.json').read_text())
        if status['status']!='success': raise ValueError('Development phase unsuccessful')
        return record
    except (OSError,KeyError,json.JSONDecodeError) as error: raise ValueError('Missing/malformed frozen selection') from error


def claim_development(destination,claim_directory=None):
    from runner_runtime import write_json_exclusive
    directory=Path(claim_directory or DATA/'freshretailnet-execution-claims')
    directory.mkdir(parents=True,exist_ok=True)
    write_json_exclusive(directory/(PROTOCOL_ID+'-development.json'),dict(destination=str(destination),claimed_at=time.time(),
                         protocol_sha256=digest(PROTOCOL),status='claimed_no_retry_without_amended_review'))


def claim_confirmation(folder,selection_hash):
    from runner_runtime import write_json_exclusive
    # Claim resides in the development directory, so changing output cannot bypass replay.
    write_json_exclusive(Path(folder)/'confirmation-claim.json',dict(selection_sha256=selection_hash,claimed_at=time.time(),status='claimed_no_retry'))


def fit_and_save(model,xpath,ypath,destination):
    import joblib
    from threadpoolctl import threadpool_limits
    if Path(destination).exists(): raise ValueError('Model destination exists')
    x=np.load(xpath,mmap_mode='r'); y=np.load(ypath,mmap_mode='r')
    if set(np.unique(y))!={0,1}: raise ValueError('Fit population lacks native classes')
    with threadpool_limits(2): model.fit(x,y)
    if Path(destination).exists(): raise ValueError('Model destination exists')
    joblib.dump(model,destination)


def read_source(name):
    if digest(AUDIT/name)!=PINNED[name]: raise ValueError('Pinned source hash mismatch')
    sys.path.insert(0,str(AUDIT/'_deps'))
    import pyarrow
    import pyarrow.parquet as pq
    if pyarrow.__version__!='23.0.1': raise ValueError('Isolated reader version mismatch')
    frame=pq.read_table(AUDIT/name,columns=COLUMNS,use_threads=False).to_pandas()
    frame['source_partition']=name; frame['source_row']=np.arange(len(frame),dtype=np.int64)
    frame['dt']=pd.to_datetime(frame.dt)
    if digest(AUDIT/name)!=PINNED[name]: raise ValueError('Source changed while reading')
    boundary=pd.Timestamp('2024-06-25')
    if (name=='train.parquet' and frame.dt.gt(boundary).any()) or (name=='eval.parquet' and frame.dt.le(boundary).any()): raise ValueError('Publisher chronology changed')
    return frame


def validate_counts(metadata,phase):
    expected=[('fit','2024-04-25','2024-06-04',2050000,845053),('development','2024-06-05','2024-06-25',1050000,448377)]
    if phase=='confirmation': expected.append(('confirmation','2024-06-26','2024-07-02',350000,143438))
    summary={}
    for name,start,end,rows,positive in expected:
        part=metadata.loc[metadata.dt.between(start,end)]
        actual=(len(part),int(part.label.sum()))
        if actual!=(rows,positive): raise ValueError('Pinned eligibility count changed: '+name)
        if part.groupby(['store_id','product_id']).size().nunique()!=1: raise ValueError('Unequal series coverage')
        summary[name]=dict(rows=rows,positive=positive,negative=rows-positive)
    if metadata[['store_id','product_id']].drop_duplicates().shape[0]!=50000 or metadata.city_id.nunique()!=18 or metadata.product_id.nunique()!=865 or metadata.store_id.nunique()!=898: raise ValueError('Identity counts changed')
    for start,positive in [('2024-06-05',143771),('2024-06-12',153593),('2024-06-19',151013)]:
        end=pd.Timestamp(start)+pd.Timedelta(days=6)
        part=metadata.loc[metadata.dt.between(start,end)]
        if len(part)!=350000 or part.label.sum()!=positive: raise ValueError('Week counts changed')
    return summary


def evidence():
    names=['source-README.md','source-metadata.json','acquisition-manifest.json','audit-summary.json','verification.json']
    current={name:digest(AUDIT/name) for name in names}
    prior=json.loads((DATA/'freshretailnet-protocol-2026-10-17'/'eligibility-verification.json').read_text())
    if current!=prior['audit_evidence_sha256']: raise ValueError('Historical all-hour consistency evidence changed')
    return dict(audit_hashes=current,independent_eligibility_sha256=digest(DATA/'freshretailnet-protocol-2026-10-17'/'eligibility-verification.json'),
                hourly_consistency='inherited preserved all-row audit, not rechecked by six-column reader')


def limits(wall=43200,output=4*1024**3):
    from runner_runtime import Limits
    return Limits(max_wall_seconds=wall,max_fit_seconds=wall,max_rss_bytes=8*1024**3,min_available_bytes=0,min_free_disk_bytes=10*1024**3,max_output_bytes=output,poll_seconds=1,threads=2)


def fit_registry(folder,rows,remaining_wall):
    from runner_runtime import FitLedger,ResourceSupervisor,write_json_exclusive
    ledger=FitLedger([r['id'] for r in rows]); start=time.monotonic()
    for row in rows:
        guard=ResourceSupervisor(folder,limits(max(.001,remaining_wall-(time.monotonic()-start))))
        guard.preflight(required_available_bytes=10*1024**3,include_resident=True)
        result=guard.run([sys.executable,str(Path(__file__).resolve()),'_fit','--output',str(folder),'--candidate',row['id']],fit_id=row['id'],include_resident_preflight=True)
        ledger.record(row['id'],result)
        write_json_exclusive(folder/(row['id']+'-fit-status.json'),result)
        if result['status']!='success':
            write_json_exclusive(folder/'fit-ledger-incomplete.json',dict(status='incomplete',expected_ids=[r['id'] for r in rows],results=ledger.results))
            raise ValueError('Incomplete comparison after failed fit')
    sealed=ledger.seal(); write_json_exclusive(folder/'fit-ledger.json',sealed)
    return sealed


def report_phase(folder,metadata,probabilities,phase,choices=None):
    from runner_runtime import write_json_exclusive
    y=metadata.label.to_numpy(); table=[]; selected={}; predictions={}
    for row in candidates():
        if row['id'] not in probabilities: continue
        p=probabilities[row['id']]
        sweep=thresholds() if phase=='development' and row['family']!='dummy' else [choices[row['family']]['threshold'] if choices else .5]
        scores=[score|dict(id=row['id'],family=row['family'],order=row['order']) for score in threshold_reports(y,p,sweep)]
        best=choose(scores); table.extend(scores)
        if phase=='development': selected[row['id']]=best
        else: selected[row['family']]=best
        write_json_exclusive(folder/(row['id']+'-at-0.5.json'),metric_report(y,p,.5))
        precision,recall,cutoffs=precision_recall_curve(y,p)
        np.savez_compressed(folder/(row['id']+'-pr-curve.npz'),precision=precision,recall=recall,threshold=cutoffs)
    if phase=='development':
        choices={family:choose([r for r in selected.values() if r['family']==family]) for family in ('rf','dt','dummy')}
    write_json_exclusive(folder/'threshold-table.json',table)
    write_json_exclusive(folder/'descriptive-winner.json',choose(list(choices.values()))) if phase=='development' else write_json_exclusive(folder/'locked-comparisons.json',selected)
    diagnostics={}
    for family,choice in choices.items():
        p=probabilities[choice['id']]; threshold=choice['threshold']
        predictions[family]=p>=threshold
        if threshold!=.5: predictions[family+'-at-0.5']=p>=.5
    for date in sorted(metadata.dt.unique()):
        mask=metadata.dt.eq(date).to_numpy()
        diagnostics[str(pd.Timestamp(date).date())]={family:metric_report(y[mask],probabilities[c['id']][mask],c['threshold']) for family,c in choices.items()}
    if phase=='development':
        for start in ['2024-06-05','2024-06-12','2024-06-19']:
            mask=metadata.dt.between(start,pd.Timestamp(start)+pd.Timedelta(days=6)).to_numpy()
            diagnostics['week-'+start]={family:metric_report(y[mask],probabilities[c['id']][mask],c['threshold']) for family,c in choices.items()}
    write_json_exclusive(folder/'date-week-diagnostics.json',diagnostics)
    write_json_exclusive(folder/'bootstrap.json',cluster_bootstrap(y,predictions,metadata.city_id.to_numpy(),metadata.product_id.to_numpy(),phase=phase))
    return choices


def worker(phase,folder,development=None):
    from runner_runtime import write_json_exclusive
    import joblib
    started=time.monotonic(); manifest=json.loads((folder/'manifest.json').read_text())
    if phase=='prepare':
        prepare_worker(folder,manifest)
        return
    if manifest['contract']!=contract(): raise ValueError('Environment/code changed after manifest freeze')
    frozen=validate_selection(development) if phase=='confirmation' else None
    train=read_source('train.parquet')
    x,metadata=prepare_phase(train,'development'); del train
    summary=validate_counts(metadata,'development')
    write_json_exclusive(folder/'eligibility-exclusion-summary.json',dict(counts=summary,warmup_exclusions=1400000,eligible_train_targets=3100000))
    metadata.to_csv(folder/'training-source-row-split-map.csv',index=False)
    fitmask=metadata.dt.le('2024-06-04').to_numpy() if phase=='development' else np.ones(len(metadata),dtype=bool)
    np.save(folder/'fit-x.npy',x[fitmask]); np.save(folder/'fit-y.npy',metadata.label.to_numpy()[fitmask])
    rows=phase_candidates(phase,None if frozen is None else frozen['choices'])
    ledger=fit_registry(folder,rows,manifest['remaining_wall_seconds'])
    if phase=='confirmation':
        # Read publisher outcomes only after all settings were frozen and all three refits completed.
        del x,metadata
        train=read_source('train.parquet'); evaluation=read_source('eval.parquet')
        combined=pd.concat([train,evaluation],ignore_index=True); del train,evaluation
        x,metadata=prepare_phase(combined,'confirmation'); del combined
        validate_counts(metadata,'confirmation')
    scoremask=metadata.dt.ge('2024-06-05' if phase=='development' else '2024-06-26').to_numpy()
    x=x[scoremask]; metadata=metadata.loc[scoremask].reset_index(drop=True)
    np.save(folder/'score-x.npy',x)
    metadata.to_csv(folder/'source-row-split-map.csv',index=False)
    probabilities={}
    for row in rows:
        model=joblib.load(folder/(row['id']+'.joblib')); p=np.empty(len(metadata),dtype=np.float64)
        # Emit one target date at a time with a fixed model and strict prior-day features.
        for date in sorted(metadata.dt.unique()):
            idx=np.flatnonzero(metadata.dt.eq(date).to_numpy())
            p[idx]=positive_probability(model,x[idx])
        np.save(folder/(row['id']+'-probability.npy'),p); probabilities[row['id']]=p
        del model
    write_json_exclusive(folder/'predictions-frozen.json',dict(probabilities={r['id']:digest(folder/(r['id']+'-probability.npy')) for r in rows},models={r['id']:digest(folder/(r['id']+'.joblib')) for r in rows},feature_matrix=digest(folder/'score-x.npy'),source_rows=digest(folder/'source-row-split-map.csv')))
    # No metric function is called before all phase predictions are frozen.
    choices=report_phase(folder,metadata,probabilities,phase,None if frozen is None else frozen['choices'])
    write_json_exclusive(folder/'execution.json',dict(model_fits=len(rows),prediction_rows=len(metadata),confirmation_evaluated_this_run=phase=='confirmation',elapsed_seconds=time.monotonic()-started,
                         exposure=EXPOSURE|{'publisher_eval_prediction_scores_previously_observed':phase=='confirmation'}))
    if phase=='development': freeze_selection(folder,choices,ledger)


def validate_warmup(frame):
    warmup=frame.loc[frame.dt.le('2024-04-24')]
    if len(warmup)!=1400000 or warmup.stock_hour6_22_cnt.gt(0).sum()!=698576: raise ValueError('Warmup counts changed')


def prepare_worker(folder,manifest):
    from runner_runtime import write_json_exclusive
    if manifest['contract']!=contract(): raise ValueError('Prepare contract changed')
    frame=pd.concat([read_source(n) for n in PINNED],ignore_index=True)
    validate_warmup(frame)
    x,m=prepare_phase(frame,'confirmation'); del frame
    summary=validate_counts(m,'confirmation')
    m.to_csv(folder/'source-row-split-map.csv',index=False)
    np.save(folder/'features.npy',x)
    write_json_exclusive(folder/'prepare.json',dict(contract=contract(),evidence=manifest['evidence'],counts=summary,
                         features_sha256=digest(folder/'features.npy'),split_map_sha256=digest(folder/'source-row-split-map.csv'),
                         model_fits=0,predictions=0,model_metrics=0,confirmation_evaluated_this_run=False))


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase',choices=['preflight','prepare','development','confirmation','_worker','_fit'])
    parser.add_argument('--output',type=Path)
    parser.add_argument('--development',type=Path)
    parser.add_argument('--worker-phase',choices=['prepare','development','confirmation'])
    parser.add_argument('--candidate')
    parser.add_argument('--scope-reviewed',action='store_true',help='Record owner acceptance of retrospective recorded-event scope; no supervisor approval implied')
    args=parser.parse_args(argv)
    from runner_runtime import ResourceSupervisor,create_run_directory,write_json_exclusive,require_supervised_worker
    if args.phase in ('_fit','_worker'): require_supervised_worker()
    if args.phase=='_fit':
        require_environment()
        row=next(r for r in candidates() if r['id']==args.candidate)
        fit_and_save(row['model'],args.output/'fit-x.npy',args.output/'fit-y.npy',args.output/(row['id']+'.joblib')); return
    if args.phase=='_worker': worker(args.worker_phase,args.output,args.development); return
    if args.phase=='preflight':
        guard=ResourceSupervisor(AUDIT,limits()); print(json.dumps(guard.preflight(required_available_bytes=10*1024**3))); return
    if args.output is None: parser.error('--output required')
    if args.phase in ('development','confirmation') and not args.scope_reviewed: parser.error('--scope-reviewed required before fits')
    for name,value in PINNED.items():
        if digest(AUDIT/name)!=value: raise ValueError('Source bytes changed')
    historical=evidence()
    require_environment()
    remaining=43200.; output_budget=4*1024**3
    if args.phase=='confirmation':
        if args.development is None: parser.error('--development required')
        validate_selection(args.development)
        prior=json.loads((args.development/'phase-status.json').read_text())
        remaining-=prior['elapsed_seconds']
        output_budget-=sum(p.stat().st_size for p in args.development.rglob('*') if p.is_file())
        if remaining<=0 or output_budget<=0: raise ValueError('Combined protocol resource budget exhausted')
    folder=create_run_directory(args.output)
    guard=ResourceSupervisor(folder,limits(remaining,output_budget))
    try:
        initial=guard.preflight(required_available_bytes=10*1024**3)
    except Exception as error:
        write_json_exclusive(folder/'initialization-failure.json',dict(status='failed',reason=str(error),model_fits=0,predictions=0,model_metrics=0))
        raise
    if args.phase=='development': claim_development(folder)
    if args.phase=='confirmation': claim_confirmation(args.development,digest(args.development/'selection.json'))
    write_json_exclusive(folder/'manifest.json',dict(contract=contract(),phase=args.phase,evidence=historical,initial_resources=initial,
                         owner_scope_reviewed=args.scope_reviewed,supervisor_approval=False,remaining_wall_seconds=remaining))
    command=[sys.executable,str(Path(__file__).resolve()),'_worker','--worker-phase',args.phase,'--output',str(folder)]
    if args.development: command+=['--development',str(args.development.resolve())]
    result=guard.run(command,fit_id=args.phase,enforce_fit_timeout=False)
    write_json_exclusive(folder/'phase-status.json',result)
    if result['status']!='success': raise ValueError('Phase failed; immutable evidence preserved')
    if args.phase=='development': seal_completion(folder)


if __name__=='__main__': main()
