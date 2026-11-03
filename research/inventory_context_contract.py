"""V2 synthetic stock policy and factual context, never warehouse ground truth."""
import copy
import math
import inventory_simulation as sim

PROTOCOL = 'inventory-context-experiment-2.0'
TEACHER = 'assistant-context-policy-2.0'
FEATURES6 = sim.FEATURES
FEATURES14 = FEATURES6 + ('additional_firm_quantity','additional_due_days',
    'incoming_quantity','incoming_eta_days','supply_none','supply_planned',
    'supply_confirmed','supply_disrupted')
CLASSES = ('Normal','Reorder Risk','Critical Stock Risk')
STATUSES = ('none','planned','confirmed','disrupted')
HISTORY = ('same-day','quarter-day','older-than-window','zero-activity','ninety-days','ordinary')
SEEDS = (2001,2002,2003,2004,2005)
PROVENANCE = dict(origin='simulated',annotation_origin='AI-authored synthetic policy',
    independent_human_review=False,independent_accuracy_validated=False,operationally_approved=False)
LEDGER_KEYS = ('sample_id','family_id','ancestor_ids','observed_at_ms','opening_at_ms',
    'opening','events','reorder_level','coverage_start_ms','coverage_complete','pending_corrections')
CASE_KEYS = ('protocol','sample_id','family_id','view_id','history_regime','buffer_regime',
             'source_seed','ledger','context')
CONTEXT_KEYS = ('known_at_ms','reserved_commitment_quantity','additional_firm_quantity',
              'additional_due_days','incoming_quantity','incoming_eta_days','supply_status')


def assess_ledger(ledger):
    """Reuse frozen replay; its neutral legacy context is never v2 evidence."""
    sim.exact(ledger,LEDGER_KEYS,'ledger')
    projected=copy.deepcopy(ledger)
    try:
        reserved=sum(sim.integer(row['reserved'],'opening reservation') for row in ledger['opening'])
        for row in ledger['events']:
            if row['type'] in ('Reservation','Release'):
                reserved += (1 if row['type']=='Reservation' else -1)*sim.integer(row['quantity'],'reservation event',1)
        projected['context']=sim.make_context(0,reserved,0,7,cutoff=ledger['observed_at_ms'])
        return sim.assess_case(projected)
    except (KeyError,TypeError,OverflowError) as error:
        raise ValueError('Malformed stock ledger') from error


def _days(value,name):
    if type(value) not in (int,float) or not math.isfinite(value) or not 0<=value<=36500:
        raise ValueError('Invalid '+name)
    return value


def validate_context(context,*,cutoff_ms,reserved):
    sim.exact(context,CONTEXT_KEYS,'v2 context')
    sim.integer(cutoff_ms,'cutoff',0,10**15)
    sim.integer(context['known_at_ms'],'known at',0,cutoff_ms)
    sim.integer(context['reserved_commitment_quantity'],'reserved commitment',reserved,reserved)
    demand=sim.integer(context['additional_firm_quantity'],'additional firm quantity')
    quantity=sim.integer(context['incoming_quantity'],'incoming quantity')
    status=context['supply_status']
    if type(status) is not str or status not in STATUSES:raise ValueError('Unknown supply status')
    if demand:
        _days(context['additional_due_days'],'additional deadline')
    elif context['additional_due_days'] is not None:
        raise ValueError('Absent demand requires an absent deadline')
    if status=='none':
        if quantity!=0 or context['incoming_eta_days'] is not None:
            raise ValueError('Absent incoming batch contradicts quantity/ETA')
    else:
        if quantity==0:raise ValueError('Stated batch requires a positive quantity')
        _days(context['incoming_eta_days'],'incoming ETA')
    return copy.deepcopy(context)


def _validated(case):
    sim.exact(case,CASE_KEYS,'v2 case')
    if case['protocol']!=PROTOCOL:raise ValueError('Wrong case protocol')
    sim.identifier(case['sample_id']);sim.identifier(case['family_id'])
    sim.integer(case['view_id'],'view ID',1,12)
    if type(case['source_seed']) is not int or case['source_seed'] not in SEEDS:
        raise ValueError('Unregistered source seed')
    if case['history_regime'] not in HISTORY or case['buffer_regime'] not in ('above','at-below'):
        raise ValueError('Unknown coverage metadata')
    assessment=assess_ledger(case['ledger'])
    if case['family_id']!=case['ledger']['family_id']:raise ValueError('Case/ledger family mismatch')
    if not assessment['eligible']:raise ValueError('Incomplete synthetic history: '+', '.join(assessment['issues']))
    context=validate_context(case['context'],cutoff_ms=case['ledger']['observed_at_ms'],
                             reserved=assessment['features']['reserved_quantity'])
    return assessment,context


def encode_case(case,*,feature_set):
    if feature_set not in ('six','context'):raise ValueError('Unregistered feature set')
    assessment,context=_validated(case)
    result=tuple(assessment['features'][key] for key in FEATURES6)
    if feature_set=='context':
        result += (context['additional_firm_quantity'],context['additional_due_days'] or 0,
            context['incoming_quantity'],context['incoming_eta_days'] or 0,
            *(int(context['supply_status']==status) for status in STATUSES))
    return result


def teach_case(case):
    assessment,c=_validated(case)
    available=assessment['features']['available_quantity']
    reorder=case['ledger']['reorder_level'];demand=c['additional_firm_quantity']
    status=c['supply_status'];quantity=c['incoming_quantity']
    timely=(demand>0 and status!='none' and c['incoming_eta_days']<=c['additional_due_days'])
    enough=available+quantity>=demand
    buffer_label=CLASSES[1] if available<=reorder else CLASSES[0]
    if demand<=available:
        label=buffer_label;reason='Available units cover additional firm demand; apply the recorded reorder buffer.'
    elif status=='confirmed' and timely and enough:
        label=buffer_label;reason='Stated confirmed timely supply covers the additional shortfall; apply the current buffer.'
    elif status=='planned' and timely and enough:
        label=CLASSES[1];reason='A timely sufficient plan still needs confirmation to cover additional firm demand.'
    else:
        label=CLASSES[2]
        counted=quantity if status=='confirmed' and timely else 0
        reason=f'{max(0,demand-available-counted)} additional firm units lack adequate stated timely coverage.'
    return dict(sample_id=case['sample_id'],group_id=case['family_id'],label=label,
        reason=reason+' Reserved commitments are counted once; this is a synthetic teaching assumption.',
        teacher_version=TEACHER,evidence_sha256=sim.digest(case),**PROVENANCE)


def ledger_fingerprint(ledger):
    assess_ledger(ledger)
    by_id={event['event_id']:event for event in ledger['events']}
    events=[]
    for event in ledger['events']:
        value={k:v for k,v in event.items() if k!='event_id'}
        if value['correction_of']:
            value['correction_of']=sim.digest({k:v for k,v in by_id[value['correction_of']].items() if k!='event_id'})
        events.append(value)
    return sim.digest(dict(observed_at_ms=ledger['observed_at_ms'],opening_at_ms=ledger['opening_at_ms'],
        opening=ledger['opening'],events=sorted(events,key=sim.canonical)))
