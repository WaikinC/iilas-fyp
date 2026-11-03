"""Fictional as-of event replay. No real identities or future outcome labels."""
from datetime import datetime,timezone,timedelta,date
import random
from uuid import uuid5,NAMESPACE_URL
import re
import delivery_demo_contract as c
import delivery_demo_artifacts as a

HOUR=3600000
STRATA=('normal','deadline','retry-stale')
TRANSITIONS={'Dispatched':('In Transit',),'In Transit':('Attempt Failed','Delivered','Returned'),'Attempt Failed':('In Transit','Returned')}
def deadline_ms(value):
    if type(value) is not str or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):raise ValueError('Invalid delivery date')
    d=date.fromisoformat(value)
    return int(datetime(d.year,d.month,d.day,23,59,59,999000,tzinfo=timezone(timedelta(hours=8))).timestamp()*1000)
def replay_snapshot(case):
    c.exact(case,('sampleId','familyId','ancestorIds','stratum','sourceSeed','view','ledger'))
    if not isinstance(case['familyId'],str) or case['ancestorIds']!=[case['familyId']] or case['stratum'] not in STRATA:raise ValueError('Invalid family identity')
    ledger=case['ledger'];c.exact(ledger,('dispatchedAtMs','expectedDeliveryDate','observedAtMs','parcelCount','events','proof','coverageComplete'))
    if ledger['coverageComplete'] is not True:raise ValueError('Incomplete fictional history')
    start=c.number(ledger['dispatchedAtMs'],0,8640000000000000,True);now=c.number(ledger['observedAtMs'],start,8640000000000000,True);deadline=deadline_ms(ledger['expectedDeliveryDate'])
    if deadline<=start or type(ledger['events']) is not list or len(ledger['events'])>1000:raise ValueError('Invalid delivery window/history')
    previous='Dispatched';last=start;failed=0
    for event in ledger['events']:
        c.exact(event,('atMs','status','previousStatus'));at=c.number(event['atMs'],start,now,True)
        if at<=last or event['previousStatus']!=previous or event['status'] not in TRANSITIONS.get(previous,()):raise ValueError('Invalid delivery event sequence')
        previous=event['status'];last=at;failed+=int(previous=='Attempt Failed')
    if previous not in c.STATUSES:raise ValueError('Closed snapshots are rule-only challenges')
    proof=ledger['proof']
    if proof is not None:
        c.exact(proof,('atMs','type','shipmentId'));c.number(proof['atMs'],start,now,True)
        if proof['type']!='Proof of Delivery' or proof['shipmentId']!=case['familyId']:raise ValueError('Unmatched fictional proof')
    facts=c.validate_facts(dict(expectedDurationHours=(deadline-start)/HOUR,elapsedHours=(now-start)/HOUR,failedAttempts=failed,hasProof=proof is not None,statusEventCount=len(ledger['events']),parcelCount=ledger['parcelCount'],hoursSinceLastUpdate=(now-last)/HOUR,currentStatus=previous))
    return dict(facts=facts,features=c.features_for_facts(facts),sourceSha256=a.digest(a.canonical(ledger)))
def generate_families(seed=20261024):
    if type(seed) is not int:raise ValueError('Integral source seed required')
    rng=random.Random(seed);cases=[]
    for stratum in STRATA:
        for i in range(100):
            family=str(uuid5(NAMESPACE_URL,f'delivery-demo-v1-{seed}-{stratum}-{i}'));day=date(2026,11,1)+timedelta(days=i%28);due=deadline_ms(day.isoformat())
            duration=rng.randint(4,24) if stratum=='normal' else rng.randint(6,72) if stratum=='deadline' else rng.randint(8,96)
            start=due-duration*HOUR
            elapsed=[.1*duration,.3*duration,.6*duration,.85*duration] if stratum=='normal' else [.7*duration,.9*duration,duration+1,duration+24+rng.random()*12] if stratum=='deadline' else [.2*duration,.4*duration,.6*duration,.8*duration]
            events=[dict(atMs=start+60000,status='In Transit',previousStatus='Dispatched')]
            if stratum=='retry-stale':
                t=start+int(elapsed[1]*HOUR)-120000
                events += [dict(atMs=t,status='Attempt Failed',previousStatus='In Transit'),dict(atMs=t+60000,status='In Transit',previousStatus='Attempt Failed'),dict(atMs=start+int(elapsed[3]*HOUR)-60000,status='Attempt Failed',previousStatus='In Transit')]
            for view,hours in enumerate(elapsed):
                now=start+round(hours*HOUR);ledger=dict(dispatchedAtMs=start,expectedDeliveryDate=day.isoformat(),observedAtMs=now,parcelCount=rng.randint(1,30),events=[dict(e) for e in events if e['atMs']<=now],proof=dict(atMs=start+60000,type='Proof of Delivery',shipmentId=family) if i%5==0 else None,coverageComplete=True)
                case=dict(sampleId=family+'-'+str(view),familyId=family,ancestorIds=[family],stratum=stratum,sourceSeed=seed,view=view,ledger=ledger);replay_snapshot(case);cases.append(case)
    return cases
