"""Frozen facts, synthetic triage policy and distinct abnormality contract."""
import hashlib
import math
import struct

PROTOCOL='delivery-demo-inference-1.0'
POLICY='delivery-triage-policy-1.0'
RULES='delivery-abnormality-rules-1.0'
CLASSES=('Low','Medium','High')
STATUSES=('Dispatched','In Transit','Attempt Failed')
FACTS=('expectedDurationHours','elapsedHours','failedAttempts','hasProof','statusEventCount','parcelCount','hoursSinceLastUpdate','currentStatus')
FEATURES=('expected_duration_hours','elapsed_hours','failed_attempts','has_proof','status_event_count','parcel_count','hours_since_last_update','status_dispatched','status_in_transit','status_attempt_failed')
PROVENANCE=dict(origin='simulated',annotationOrigin='AI-authored delivery triage policy',independentHumanReview=False,independentAccuracyValidated=False,operationally_approved=False,evaluationOnly=True,acceptanceSha256=None,humanReviewRequired=True,policyVersion=POLICY)


def exact(value,keys):
    if type(value) is not dict or set(value)!=set(keys):raise ValueError('Invalid delivery fields')


def number(value,low,high,integer=False):
    if type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high or integer and int(value)!=value:raise ValueError('Invalid delivery units')
    return 0 if value==0 else value


def validate_facts(value):
    exact(value,FACTS);v=dict(value)
    limits={'expectedDurationHours':(0,720,False),'elapsedHours':(0,1440,False),'failedAttempts':(0,20,True),'statusEventCount':(0,1000,True),'parcelCount':(1,1000,True),'hoursSinceLastUpdate':(0,1440,False)}
    for k,args in limits.items():v[k]=number(v[k],*args)
    if v['expectedDurationHours']==0 or type(v['hasProof']) is not bool or v['currentStatus'] not in STATUSES:raise ValueError('Invalid delivery context')
    if v['hoursSinceLastUpdate']>v['elapsedHours'] or v['failedAttempts']>v['statusEventCount']:raise ValueError('Inconsistent delivery counts or times')
    if v['currentStatus']=='Dispatched' and (v['statusEventCount'] or v['failedAttempts']):raise ValueError('Dispatched history contradicts events')
    if v['currentStatus']=='Attempt Failed' and not v['failedAttempts']:raise ValueError('Failure status needs an observed failure')
    return {k:v[k] for k in FACTS}


def features_for_facts(value):
    v=validate_facts(value);values=[v[k] for k in FACTS[:7]];values[3]=int(values[3])
    return dict(zip(FEATURES,values+[int(v['currentStatus']==s) for s in STATUSES]))


def validate_features(value):
    exact(value,FEATURES)
    for k,v in value.items():number(v,0 if k!='expected_duration_hours' else 0,1440 if k in ('elapsed_hours','hours_since_last_update') else 1000 if k in ('parcel_count','status_event_count') else 720 if k=='expected_duration_hours' else 20 if k=='failed_attempts' else 1,k not in ('expected_duration_hours','elapsed_hours','hours_since_last_update'))
    if sum(value[k] for k in FEATURES[-3:])!=1:raise ValueError('One active status required')
    status=STATUSES[[value[k] for k in FEATURES[-3:]].index(1)]
    return features_for_facts(dict(zip(FACTS,[value[k] for k in FEATURES[:3]]+[bool(value['has_proof']),value['status_event_count'],value['parcel_count'],value['hours_since_last_update'],status])))


def feature_payload(value):
    v=validate_features(value)
    return PROTOCOL+'\n'+''.join(k+'='+struct.pack('>d',float(v[k])).hex()+'\n' for k in FEATURES)


def feature_digest(value):return hashlib.sha256(feature_payload(value).encode('utf-8')).hexdigest()


def choose_label(scores):
    exact(scores,CLASSES)
    for v in scores.values():number(v,0,1)
    if abs(sum(scores.values())-1)>1e-6:raise ValueError('Invalid delivery probability sum')
    return max(CLASSES,key=lambda k:scores[k])


def teaching_label(value):
    v=validate_facts(value);overdue=v['elapsedHours']-v['expectedDurationHours'];age=v['hoursSinceLastUpdate'];failed=v['failedAttempts']
    high=[code for flag,code in [(failed>=2,'repeated_failures'),(overdue>=24,'overdue_24h'),(age>=48 and overdue>0,'stale_48h_overdue')] if flag]
    medium=[code for flag,code in [(overdue>0,'overdue'),(failed==1,'one_failure'),(age>=24,'stale_24h'),(v['elapsedHours']/v['expectedDurationHours']>=.8,'near_deadline')] if flag]
    return dict(label='High' if high else 'Medium' if medium else 'Low',reasons=high or medium or ['normal_progress'],policyVersion=POLICY)


def evaluate_rules(snapshot):
    exact(snapshot,('observedAtMs','deadlineMs','dispatchedAtMs','lastUpdateAtMs','currentStatus','failedAttempts','proofValid','invalidTransition'))
    now=number(snapshot['observedAtMs'],0,8640000000000000,True);unknown=[];matches=[];s=snapshot
    def valid(k,low=0,high=8640000000000000,integer=True):
        try:number(s[k],low,high,integer);return True
        except ValueError:unknown.append(k);return False
    def add(code,points,reason):matches.append(dict(code=code,points=points,reason=reason))
    status=s['currentStatus'];active=status in STATUSES;closed=status in ('Delivered','Returned')
    if not active and not closed:unknown.append('currentStatus')
    dispatch_ok=valid('dispatchedAtMs')
    if dispatch_ok and s['dispatchedAtMs']>now:unknown.append('dispatchedAtMs');dispatch_ok=False
    if active:
        deadline_ok=valid('deadlineMs')
        if deadline_ok and (not dispatch_ok or s['deadlineMs']<=s['dispatchedAtMs']):unknown.append('deadlineMs');deadline_ok=False
        if deadline_ok and now>s['deadlineMs']:add('overdue',30,'Expected delivery date exceeded')
    if valid('failedAttempts',0,20) and s['failedAttempts']>=2:add('repeated_failures',25,'Repeated failed delivery attempts')
    if status=='Delivered':
        if type(s['proofValid']) is not bool:unknown.append('proofValid')
        elif not s['proofValid']:add('missing_proof',20,'Delivered without matching proof')
    if type(s['invalidTransition']) is not bool:unknown.append('invalidTransition')
    elif s['invalidTransition']:add('invalid_transition',15,'Invalid recorded status sequence')
    if active:
        last_ok=valid('lastUpdateAtMs')
        if last_ok and (not dispatch_ok or not s['dispatchedAtMs']<=s['lastUpdateAtMs']<=now):unknown.append('lastUpdateAtMs');last_ok=False
        if last_ok and now-s['lastUpdateAtMs']>24*3600000:add('stale_update',10,'No delivery update for 24 hours')
    complete=not unknown;score=sum(x['points'] for x in matches) if complete else None
    return dict(complete=complete,unknowns=list(dict.fromkeys(unknown)),dataReviewRequired=bool(unknown) or s['invalidTransition'] is True,matches=matches,score=score,level=('High' if score>=50 else 'Medium' if score>=20 else 'Low') if complete else None,observedAtMs=now,ruleVersion=RULES)
