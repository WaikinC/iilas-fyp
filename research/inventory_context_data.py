"""Deterministic v2 fictional ledgers and independent saved-evidence validation."""
from collections import Counter, defaultdict
import copy
import csv
import hashlib
import io
import json
import random

import inventory_context_contract as c

sim = c.sim
META = ('sample_id', 'family_id', 'view_id', 'history_regime', 'buffer_regime',
        'label', 'split', 'dossier_sha256')
COLUMNS = META + c.FEATURES14


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _stratum(family):
    return (family['history_regime'], family['buffer_regime'])


def build_families():
    families = []
    for seed in c.SEEDS:
        for stratum in range(12):
            history = c.HISTORY[stratum // 2]
            buffer = ('above', 'at-below')[stratum % 2]
            for ordinal in range(5):
                rng = random.Random(seed * 100000 + stratum * 100 + ordinal)
                identity = f'IC2-{seed}-{stratum:02}-{ordinal:02}'
                age = (0, .25, 31, 45, 90, rng.randint(1, 29))[stratum // 2]
                zero = buffer == 'at-below' and ordinal == 0
                quantity = 0 if zero else rng.randint(320, 2000)
                reserved = 0 if zero else rng.randint(0, 60)
                receipt = rng.randint(20, 80)
                # Distinct fictional clock offsets preserve the declared ages and
                # make independently constructed zero-stock histories identifiable.
                cutoff = sim.CUTOFF + (seed - 2001) * 60000 + stratum * 5000 + ordinal
                at = cutoff - int(age * sim.DAY)
                events = [sim.event(identity + '-R0', at, 'Receipt', receipt)]
                if zero:
                    events.append(sim.event(identity + '-R1', at, 'Issue', receipt))
                elif history != 'zero-activity':
                    for cycle in range(rng.randint(1, 5)):
                        when = cutoff - (29 - cycle) * sim.DAY
                        amount = rng.randint(1, 5)
                        prefix = identity + f'-C{cycle}'
                        events.extend([
                            sim.event(prefix+'0', when, 'Adjustment', amount, direction='Increase'),
                            sim.event(prefix+'1', when, 'Adjustment', amount, direction='Decrease'),
                            sim.event(prefix+'2', when, 'Reservation', amount),
                            sim.event(prefix+'3', when, 'Release', amount),
                            sim.event(prefix+'4', when, 'Transfer', amount, target='B'),
                            sim.event(prefix+'5', when, 'Transfer', amount, source='B', target='A')])
                available = 0 if zero else quantity + receipt - reserved
                margin = rng.randint(0, 100)
                reorder = (max(0, available - max(1, margin)) if buffer == 'above'
                           else available + margin)
                ledger = dict(sample_id=identity+'-L', family_id=identity,
                    ancestor_ids=['inventory-context-v2-'+identity], observed_at_ms=cutoff,
                    opening_at_ms=cutoff-120*sim.DAY,
                    opening=[dict(location='A', quantity=quantity, reserved=reserved, warehouse=0)],
                    events=events, reorder_level=reorder, coverage_start_ms=cutoff-120*sim.DAY,
                    coverage_complete=True, pending_corrections=[])
                families.append(dict(family_id=identity, source_seed=seed, history_regime=history,
                    buffer_regime=buffer, ledger=ledger,
                    context_seed=seed*1000000+stratum*1000+ordinal+17))
    return families


def expand_views(family):
    f = c.assess_ledger(family['ledger'])['features']
    rng = random.Random(family['context_seed'])
    available, reserved = f['available_quantity'], f['reserved_quantity']
    due = rng.randint(0, 14)
    timely = rng.randint(0, due)
    late = due + rng.randint(1, 7)
    gap = rng.randint(2, 100)
    enough = gap + rng.randint(0, 100)
    covered = rng.randint(0, available)
    contexts = [(covered, status, 0 if status == 'none' else enough,
                 None if status == 'none' else timely) for status in c.STATUSES]
    contexts += [(available+gap, status, amount, eta) for status, amount, eta in (
        ('confirmed', enough, timely), ('planned', enough, timely),
        ('confirmed', enough, late), ('confirmed', gap-1, timely),
        ('planned', enough, late), ('planned', gap-1, timely),
        ('disrupted', enough, timely), ('none', 0, None))]
    return [dict(protocol=c.PROTOCOL, sample_id=family['family_id']+f'-V{view:02}',
        family_id=family['family_id'], view_id=view, history_regime=family['history_regime'],
        buffer_regime=family['buffer_regime'], source_seed=family['source_seed'],
        ledger=copy.deepcopy(family['ledger']), context=dict(
            known_at_ms=family['ledger']['observed_at_ms'], reserved_commitment_quantity=reserved,
            additional_firm_quantity=demand, additional_due_days=due if demand else None,
            incoming_quantity=quantity, incoming_eta_days=eta, supply_status=status))
        for view, (demand, status, quantity, eta) in enumerate(contexts, 1)]


def assign_partitions(families):
    strata = defaultdict(list)
    for family in families:
        strata[_stratum(family)].append(family['family_id'])
    split_rng, fold_rng = random.Random(2042), random.Random(2043)
    development, test, validations = [], [], [[], [], []]
    for index, key in enumerate(sorted(strata)):
        identities = sorted(strata[key])
        split_rng.shuffle(identities)
        dev = identities[:20]
        development.extend(dev)
        test.extend(identities[20:])
        fold_rng.shuffle(dev)
        for offset, identity in enumerate(dev):
            validations[(index+offset) % 3].append(identity)
    development, test = sorted(development), sorted(test)
    folds = [dict(train=sorted(set(development)-set(validation)), validation=sorted(validation))
             for validation in validations]
    return dict(development=development, test=test, folds=folds)


def validate_cases(cases, partitions):
    if len(cases) != 3600:
        raise ValueError('Expected 3600 views')
    groups, samples = defaultdict(list), set()
    for case in cases:
        c.encode_case(case, feature_set='context')
        if case['sample_id'] in samples:
            raise ValueError('Duplicate sample')
        samples.add(case['sample_id'])
        groups[case['family_id']].append(case)
    if len(groups) != 300:
        raise ValueError('Expected 300 families')
    fingerprints, ancestors, families = set(), set(), []
    zero_count = 0
    for identity, views in groups.items():
        first = views[0]
        ledger = first['ledger']
        if sorted(v['view_id'] for v in views) != list(range(1, 13)):
            raise ValueError('Missing or duplicated family view')
        for view in views:
            if (view['ledger'] != ledger or any(view[k] != first[k] for k in
                ('source_seed', 'history_regime', 'buffer_regime'))):
                raise ValueError('Inconsistent family evidence')
            _validate_view(view)
        fingerprint = c.ledger_fingerprint(ledger)
        if fingerprint in fingerprints or ancestors.intersection(ledger['ancestor_ids']):
            raise ValueError('Shared ledger content or ancestor across families')
        fingerprints.add(fingerprint)
        ancestors.update(ledger['ancestor_ids'])
        if any(not a.startswith('inventory-context-v2-') for a in ledger['ancestor_ids']):
            raise ValueError('Wrong ancestry namespace')
        features = c.assess_ledger(ledger)['features']
        age = features['days_since_replenishment']
        regime = first['history_regime']
        expected_age = dict(zip(c.HISTORY[:-1], (0, .25, 31, 45, 90)))
        if (age != expected_age[regime] if regime in expected_age else not 1 <= age <= 29):
            raise ValueError('Wrong history regime')
        if regime == 'zero-activity' and features['movement_frequency'] != 0:
            raise ValueError('Unexpected recent activity')
        above = features['available_quantity'] > ledger['reorder_level']
        if above != (first['buffer_regime'] == 'above'):
            raise ValueError('Wrong buffer regime')
        if ledger['opening_at_ms'] != ledger['observed_at_ms']-120*sim.DAY:
            raise ValueError('Wrong ledger duration')
        zero_count += features['available_quantity'] == 0
        families.append(first)
    if (Counter(f['source_seed'] for f in families) != dict.fromkeys(c.SEEDS, 60)
        or set(Counter(_stratum(f) for f in families).values()) != {25} or zero_count != 30):
        raise ValueError('Coverage mismatch')
    # Recompute metadata assignments only; never regenerate ledger observations.
    if partitions != assign_partitions(families):
        raise ValueError('Changed or leaking partition/fold assignment')
    counts = Counter(c.teach_case(case)['label'] for case in cases)
    test_ids = set(partitions['test'])
    test_counts = Counter(c.teach_case(case)['label'] for case in cases if case['family_id'] in test_ids)
    if counts != dict(zip(c.CLASSES, (750, 1050, 1800))) or test_counts != dict(zip(c.CLASSES, (150, 210, 360))):
        raise ValueError('Label coverage mismatch')
    return dict(families=300, rows=3600, class_counts=dict(counts), test_class_counts=dict(test_counts))


def _validate_view(view):
    context=view['context'];index=view['view_id']
    available=c.encode_case(view,feature_set='six')[0]
    demand=context['additional_firm_quantity'];quantity=context['incoming_quantity']
    status=context['supply_status'];due=context['additional_due_days'];eta=context['incoming_eta_days']
    statuses=(*c.STATUSES,'confirmed','planned','confirmed','confirmed','planned','planned','disrupted','none')
    if status!=statuses[index-1] or (index<=4)!=(demand<=available):
        raise ValueError('Context does not match declared view')
    if (due is not None and not 0<=due<=14) or (eta is not None and not 0<=eta<=21):
        raise ValueError('Context outside declared bounds')
    if index>=5 and index!=12:
        timely=eta<=due;enough=available+quantity>=demand
        if timely!=(index not in (7,9)) or enough!=(index not in (8,10)):
            raise ValueError('Context timing/coverage mismatch')
        if index in (8,10) and available+quantity!=demand-1:
            raise ValueError('Expected one-unit shortfall')


def _csv(rows):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=COLUMNS, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode('utf-8')


def packet_payloads(families, partitions):
    cases = [case for family in families for case in expand_views(family)]
    validate_cases(cases, partitions)
    return _packet_from_cases(cases, partitions)


def _packet_from_cases(cases, partitions):
    packet = {'splits.json': sim.canonical(partitions)}
    rows = defaultdict(list)
    dev_ids = set(partitions['development'])
    for case in sorted(cases, key=lambda v: v['sample_id']):
        split = 'development' if case['family_id'] in dev_ids else 'test'
        ledger_ref = f"{split}/ledgers/{case['family_id']}.json"
        ledger_bytes = sim.canonical(case['ledger'])
        packet[ledger_ref] = ledger_bytes
        annotation = c.teach_case(case)
        dossier = {k:v for k,v in case.items() if k != 'ledger'}
        dossier.update(ledger_ref=ledger_ref, ledger_sha256=_sha(ledger_bytes), annotation=annotation)
        dossier_bytes = sim.canonical(dossier)
        packet[f"{split}/dossiers/{case['sample_id']}.json"] = dossier_bytes
        row = {k:case[k] for k in META[:5]}
        row.update(label=annotation['label'], split=split, dossier_sha256=_sha(dossier_bytes))
        row.update(zip(c.FEATURES14, c.encode_case(case, feature_set='context')))
        rows[split].append(row)
    for split in ('development', 'test'):
        packet[split+'.csv'] = _csv(rows[split])
    return packet


def validate_payloads(packet):
    """Audit saved dossiers, ledger replay, annotations, CSVs and exact tree."""
    try:
        if any(type(name) is not str or type(payload) is not bytes for name, payload in packet.items()):
            raise ValueError('Invalid packet')
        partitions = json.loads(packet['splits.json'])
        cases = []
        for name, data in packet.items():
            if '/dossiers/' not in name:
                continue
            dossier = json.loads(data)
            sim.exact(dossier, tuple(k for k in c.CASE_KEYS if k != 'ledger')+
                      ('ledger_ref', 'ledger_sha256', 'annotation'), 'dossier')
            ledger_bytes = packet[dossier['ledger_ref']]
            if _sha(ledger_bytes) != dossier['ledger_sha256']:
                raise ValueError('Changed ledger hash')
            case = {k:v for k,v in dossier.items() if k in c.CASE_KEYS}
            case['ledger'] = json.loads(ledger_bytes)
            if dossier['annotation'] != c.teach_case(case):
                raise ValueError('Changed annotation')
            cases.append(case)
        summary = validate_cases(cases, partitions)
        if packet != _packet_from_cases(cases, partitions):
            raise ValueError('Unexpected tree, changed CSV or noncanonical evidence')
        return summary
    except (KeyError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ValueError('Malformed saved packet') from error


def prepare_cohort(output):
    from pathlib import Path
    import inventory_context_artifacts as a
    a.runtime.require_supervised_worker()
    output=a.safe_path(output,existing=False)
    claim=a.read_json(a._claim_path('preparation'))
    a.verify_claim(claim,'preparation',None,output)
    families=build_families();partitions=assign_partitions(families)
    packet=packet_payloads(families,partitions)
    summary=validate_payloads(packet)
    if sum(map(len,packet.values()))>a.MAX_BYTES:raise ValueError('Cohort size exceeded')
    output.mkdir(parents=True,exist_ok=False)
    for name,payload in packet.items():
        path=a.member_path(output,name);path.parent.mkdir(parents=True,exist_ok=True)
        with path.open('xb') as stream:stream.write(payload)
    manifest=dict(basis=a.basis(),files={name:_sha(data) for name,data in packet.items()},
                  counts=summary,preparation_claim_sha256=sim.digest(claim))
    a.write_json(output/'manifest.json',manifest)
    return manifest


def audit_cohort(source,expected_sha256):
    import inventory_context_artifacts as a
    manifest=a.read_manifest(source,expected_sha256)
    packet={name:a.checked_bytes(source,manifest,name) for name in manifest['files']}
    summary=validate_payloads(packet)
    if manifest['counts']!=summary:raise ValueError('Manifest counts changed')
    claim=a.read_json(a._claim_path('preparation'))
    a.verify_claim(claim,'preparation',None,source)
    if manifest['preparation_claim_sha256']!=sim.digest(claim):raise ValueError('Preparation identity changed')
    return dict(source_sha256=expected_sha256,**summary)
