"""Once-only test inference and independent arithmetic audits of saved evidence."""
from collections import Counter, defaultdict
import math
from pathlib import Path
import random
import time

import inventory_context_artifacts as a
import inventory_context_contract as c
import inventory_context_train as train
from inventory_context_train import score

METRICS=('accuracy','macro_f1','critical_precision','critical_recall')


def _compact(metric):
    return dict(accuracy=metric['accuracy'],macro_f1=metric['macro_f1'],
        critical_precision=metric['per_class'][c.CLASSES[2]]['precision'],
        critical_recall=metric['per_class'][c.CLASSES[2]]['recall'])


def _groups(rows):
    groups=defaultdict(list)
    for index,row in enumerate(rows):groups[row['family_id']].append(index)
    if not groups or any(len(indices)!=12 for indices in groups.values()):raise ValueError('Expected twelve rows per family')
    return dict(sorted(groups.items()))


def _undefined(metrics):
    return {kind+'_'+stat:sum(c.CLASSES[i] in m['undefined_'+stat] for m in metrics)
            for i,kind in enumerate(('normal','reorder','critical')) for stat in ('precision','recall','f1')}


def family_bootstrap(rows,predictions,*,samples=500,seed=2044):
    if samples!=500 or seed!=2044 or set(predictions)!=set(train.ARMS):raise ValueError('Unregistered bootstrap')
    groups=_groups(rows);ids=list(groups);rng=random.Random(seed);draws=[]
    for _ in range(samples):
        families=rng.choices(ids,k=len(ids));indices=[i for family in families for i in groups[family]]
        metrics={arm:score([rows[i]['label'] for i in indices],[predictions[arm][i] for i in indices]) for arm in train.ARMS}
        compact={arm:_compact(value) for arm,value in metrics.items()}
        differences={key:compact['RF14'][key]-compact['RF6'][key] for key in METRICS}
        draws.append(dict(family_ids=families,row_indices=indices,metrics=metrics,paired_differences=differences))
    import numpy as np
    intervals={arm:{key:np.percentile([_compact(d['metrics'][arm])[key] for d in draws],[2.5,97.5],method='linear').tolist() for key in METRICS} for arm in train.ARMS}
    intervals['RF14-minus-RF6']={key:np.percentile([d['paired_differences'][key] for d in draws],[2.5,97.5],method='linear').tolist() for key in METRICS}
    return dict(draws=draws,intervals=intervals,undefined_counts={arm:_undefined([d['metrics'][arm] for d in draws]) for arm in train.ARMS},samples=samples,seed=seed)


def _audit_score(truth,predicted):
    """Separate stdlib reconstruction; no sklearn or primary scoring call."""
    if len(truth)!=len(predicted) or not truth or (set(truth)|set(predicted))-set(c.CLASSES):raise ValueError('Invalid audit labels')
    pairs=Counter(zip(truth,predicted));actual=Counter(truth);guessed=Counter(predicted)
    per={};undefined={'precision':[],'recall':[],'f1':[]}
    for label in c.CLASSES:
        tp=pairs[(label,label)];n=actual[label];p=guessed[label]
        if not p:undefined['precision'].append(label)
        if not n:undefined['recall'].append(label)
        if not n+p:undefined['f1'].append(label)
        precision=tp/p if p else 0;recall=tp/n if n else 0
        per[label]=dict(precision=precision,recall=recall,f1=2*tp/(n+p) if n+p else 0,support=n)
    return dict(accuracy=sum(pairs[(label,label)] for label in c.CLASSES)/len(truth),
        macro_f1=sum(v['f1'] for v in per.values())/3,per_class=per,
        confusion=[[pairs[(x,y)] for y in c.CLASSES] for x in c.CLASSES],
        critical_as_normal=pairs[(c.CLASSES[2],c.CLASSES[0])],
        false_alerts=sum(pairs[(c.CLASSES[0],label)] for label in c.CLASSES[1:]),
        **{'undefined_'+k:v for k,v in undefined.items()})


def _equal(left,right):
    if isinstance(left,dict) and isinstance(right,dict):return set(left)==set(right) and all(_equal(left[k],right[k]) for k in left)
    if isinstance(left,list) and isinstance(right,list):return len(left)==len(right) and all(_equal(x,y) for x,y in zip(left,right))
    if type(left) in (float,int) and type(right) in (float,int):return math.isclose(left,right,rel_tol=1e-12,abs_tol=1e-12)
    return left==right


def _percentiles(values):
    ordered=sorted(values);result=[]
    for percentile in (.025,.975):
        position=(len(ordered)-1)*percentile;low=math.floor(position);high=math.ceil(position)
        result.append(ordered[low]+(ordered[high]-ordered[low])*(position-low))
    return result


def audit_bootstrap(rows,predictions,value):
    if value['samples']!=500 or value['seed']!=2044 or len(value['draws'])!=500:raise ValueError('Bootstrap size/seed changed')
    groups=_groups(rows);rng=random.Random(2044);rebuilt=[]
    for draw in value['draws']:
        families=rng.choices(list(groups),k=len(groups));indices=[i for family in families for i in groups[family]]
        metrics={arm:_audit_score([rows[i]['label'] for i in indices],[predictions[arm][i] for i in indices]) for arm in train.ARMS}
        diff={key:_compact(metrics['RF14'])[key]-_compact(metrics['RF6'])[key] for key in METRICS}
        expected=dict(family_ids=families,row_indices=indices,metrics=metrics,paired_differences=diff)
        if not _equal(draw,expected):raise ValueError('Changed family resample or metric array')
        rebuilt.append(expected)
    intervals={arm:{key:_percentiles([_compact(d['metrics'][arm])[key] for d in rebuilt]) for key in METRICS} for arm in train.ARMS}
    intervals['RF14-minus-RF6']={key:_percentiles([d['paired_differences'][key] for d in rebuilt]) for key in METRICS}
    counts={arm:_undefined([d['metrics'][arm] for d in rebuilt]) for arm in train.ARMS}
    if not _equal(value['intervals'],intervals) or value['undefined_counts']!=counts:raise ValueError('Changed uncertainty summary')


def _subgroups(rows,predictions,scorer):
    groups=defaultdict(list)
    for i,row in enumerate(rows):
        case=row['case']
        for name,value in (('history',case['history_regime']),('buffer',case['buffer_regime']),
            ('status',case['context']['supply_status']),('context',str(case['view_id']))):groups[name+':'+value].append(i)
    return {name:dict(rows=len(indices),families=len({rows[i]['family_id'] for i in indices}),
        metrics={arm:scorer([rows[i]['label'] for i in indices],[predictions[arm][i] for i in indices]) for arm in train.ARMS})
        for name,indices in sorted(groups.items())}


def _binary(truth,predicted):
    target=[label!='Normal' for label in truth]
    tp=sum(y and p for y,p in zip(target,predicted));tn=sum(not y and not p for y,p in zip(target,predicted))
    positive=sum(predicted);support=sum(target)
    return dict(accuracy=(tp+tn)/len(target),precision=tp/positive if positive else 0,
        recall=tp/support if support else 0,positive_support=support,
        undefined_precision=positive==0,undefined_recall=support==0,
        interpretation='Binary current-buffer warning; not a three-class classifier.')


def _prediction_packets(source,source_sha256,development,output):
    """Test release and all model inference precede any metric call."""
    claim=a.read_json(a._claim_path('evaluation'));a.verify_claim(claim,'evaluation',source_sha256,output)
    train.validate_development(development,source_sha256)
    frozen=a.completion('development')
    if frozen['output']!=str(Path(development).resolve()) or a._inventory(development)!=frozen['files']:raise ValueError('Changed frozen run')
    value=a.read_json(Path(development)/'development.json')
    rows=a.load_rows(source,source_sha256,'test',claim=claim)
    import joblib
    packets={};timings={}
    from threadpoolctl import threadpool_limits
    for arm in train.ARMS:
        started=time.perf_counter()
        model=joblib.load(Path(development)/('final-'+arm+'.joblib'))
        with threadpool_limits(limits=2):packet=train.predictions(model,train.matrix(rows,value['selected'][arm]['features']))
        timings[arm]=time.perf_counter()-started
        packet.update(sample_ids=[r['sample_id'] for r in rows],source_sha256=source_sha256,
            development_sha256=c.sim.digest(frozen),arm=arm,provenance=c.PROVENANCE)
        a.write_json(Path(output)/(arm+'.predictions.json'),packet);packets[arm]=packet['predicted']
    controls=train.predict_controls(value['controls'],rows)
    a.write_json(Path(output)/'controls.predictions.json',dict(sample_ids=[r['sample_id'] for r in rows],predictions=controls,provenance=c.PROVENANCE))
    files={name:a.runtime.sha256_file(Path(output)/name) for name in [*(arm+'.predictions.json' for arm in train.ARMS),'controls.predictions.json']}
    a.write_json(Path(output)/'predictions-complete.json',dict(files=files,source_sha256=source_sha256,development_sha256=c.sim.digest(frozen),timings_seconds=timings))
    return rows,packets,controls,timings


def evaluate(source,source_sha256,development,output,supervisor):
    a.runtime.require_supervised_worker()
    rows,packets,controls,timings=_prediction_packets(source,source_sha256,development,output)
    truth=[r['label'] for r in rows]
    metrics={arm:score(truth,packets[arm]) for arm in train.ARMS}
    result=dict(source_sha256=source_sha256,rows=len(rows),families=len(_groups(rows)),metrics=metrics,
        controls={key:score(truth,value) for key,value in controls.items() if key!='binary_reorder'},
        binary_reorder=_binary(truth,controls['binary_reorder']),subgroups=_subgroups(rows,packets,score),
        bootstrap=family_bootstrap(rows,packets),timings_seconds=timings,provenance=c.PROVENANCE,
        favourable_research_result=(metrics['RF14']['macro_f1']>metrics['RF6']['macro_f1'] and metrics['RF14']['critical_as_normal']<=metrics['RF6']['critical_as_normal']),
        interpretation='Synthetic teaching-policy agreement only; no operational admission or app model change.')
    a.write_json(Path(output)/'evaluation.json',result)
    return result


def audit_evaluation(source,source_sha256,development,evaluation):
    """Read-only; no estimator loading, prediction, training or primary metric functions."""
    claim=a.read_json(a._claim_path('evaluation'));a.verify_claim(claim,'evaluation',source_sha256,evaluation)
    frozen=a.completion('development')
    if frozen['output']!=str(Path(development).resolve()) or a._inventory(development)!=frozen['files']:raise ValueError('Frozen model evidence changed')
    rows=a.load_rows(source,source_sha256,'test',claim=claim);truth=[r['label'] for r in rows]
    saved=a.read_json(Path(evaluation)/'evaluation.json');boundary=a.read_json(Path(evaluation)/'predictions-complete.json')
    expected_files={*(arm+'.predictions.json' for arm in train.ARMS),'controls.predictions.json'}
    if set(boundary['files'])!=expected_files or boundary['source_sha256']!=source_sha256 or boundary['development_sha256']!=c.sim.digest(frozen):raise ValueError('Prediction boundary changed')
    packets={}
    for name,sha in boundary['files'].items():
        if a.runtime.sha256_file(a.member_path(evaluation,name))!=sha:raise ValueError('Changed predictions')
    for arm in train.ARMS:
        packet=a.read_json(Path(evaluation)/(arm+'.predictions.json'))
        if (packet['sample_ids']!=[r['sample_id'] for r in rows] or packet['source_sha256']!=source_sha256
            or packet['development_sha256']!=c.sim.digest(frozen) or packet['arm']!=arm or packet['provenance']!=c.PROVENANCE):raise ValueError('Prediction lineage/order changed')
        train.validate_predictions({key:packet[key] for key in ('classes','probabilities','predicted')},len(rows))
        packets[arm]=packet['predicted']
    control_packet=a.read_json(Path(evaluation)/'controls.predictions.json')
    if control_packet['sample_ids']!=[r['sample_id'] for r in rows] or control_packet['provenance']!=c.PROVENANCE:raise ValueError('Control order/provenance changed')
    controls=control_packet['predictions']
    dev=a.read_json(Path(development)/'development.json')
    if controls!=train.predict_controls(dev['controls'],rows):raise ValueError('Changed frozen controls')
    metrics={arm:_audit_score(truth,packets[arm]) for arm in train.ARMS}
    if (saved['source_sha256']!=source_sha256 or (saved['rows'],saved['families'])!=(720,60)
        or saved['provenance']!=c.PROVENANCE or not _equal(saved['metrics'],metrics)
        or not _equal(saved['controls'],{k:_audit_score(truth,v) for k,v in controls.items() if k!='binary_reorder'})
        or not _equal(saved['subgroups'],_subgroups(rows,packets,_audit_score))
        or not _equal(saved['binary_reorder'],_binary(truth,controls['binary_reorder']))):raise ValueError('Changed evaluation metrics')
    audit_bootstrap(rows,packets,saved['bootstrap'])
    favourable=metrics['RF14']['macro_f1']>metrics['RF6']['macro_f1'] and metrics['RF14']['critical_as_normal']<=metrics['RF6']['critical_as_normal']
    if saved['favourable_research_result']!=favourable:raise ValueError('Changed research conclusion')
    return dict(source_sha256=source_sha256,rows=720,families=60,draws=500,verified=True)
