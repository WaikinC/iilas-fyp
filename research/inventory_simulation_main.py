"""Source-pinned, provisional synthetic stock cohort; never independent truth.

Uses an AI-authored context-aware teaching policy under the user's explicit
prototype-method approval. No network, Firebase, model fitting or activation.
"""
import argparse
import copy
import csv
import hashlib
import json
from pathlib import Path
import random
import sys

import inventory_simulation as sim

PROTOCOL = 'inventory-assisted-prototype-1.0'
RUBRIC = 'inventory-assisted-rubric-1.0'
TEACHER = 'assistant-context-policy-1.0'
LABELS = ('Normal', 'Reorder Risk', 'Critical Stock Risk')
SEEDS = (1001, 1002, 1003, 1004, 1005)
COVERAGE = ('same-day', 'quarter-day', 'older-than-window', 'zero-activity', 'ninety-days', 'ordinary')
PROTOCOL_PATH = sim.ROOT/'research/INVENTORY_AI_ASSISTED_PROTOCOL_2026-10-23.md'


def assisted_label(case):
    """Synthetic teaching policy; output is NOT an independent annotation."""
    assessment = sim.assess_case(case)
    if not assessment['eligible']: raise ValueError('Incomplete synthetic feature evidence')
    available = assessment['features']['available_quantity']
    context = case['context']; supply = context['replenishment']
    demand = context['additional_firm_quantity']; due = context['additional_due_days']
    timely = supply['eta_days'] <= due
    shortage = max(0, demand-available)
    confirmed_cover = available+(supply['quantity'] if timely and supply['status'] == 'confirmed' else 0)
    uncovered_at_due = max(0, demand-confirmed_cover)
    if shortage and (not timely or supply['status'] == 'disrupted' or
                     supply['status'] == 'confirmed' and confirmed_cover < demand):
        label = 'Critical Stock Risk'
        reason = (f'{uncovered_at_due} additional firm units lack timely stated supply by day {due}; '
                  f'supply is {supply["status"]}, expected day {supply["eta_days"]}. '
                  'Reserved commitments are already accounted for once.')
    elif shortage and supply['status'] == 'planned':
        if available+supply['quantity'] < demand: raise ValueError('Planned supply cannot cover the proposed review scenario')
        label = 'Reorder Risk'
        reason = 'Additional firm demand exceeds free stock; a timely but unconfirmed plan requires replenishment review.'
    elif available <= case['reorder_level']:
        label = 'Reorder Risk'
        reason = 'Available stock is at/below the recorded policy threshold; no separate likely-impact evidence is established.'
    else:
        label = 'Normal'
        reason = 'Recorded free stock exceeds policy threshold and the stated firm commitments have adequate coverage.'
    return dict(sample_id=case['sample_id'], group_id=case['family_id'], label=label,
                reason=reason, rubric_version=RUBRIC, teacher_version=TEACHER,
                annotation_origin='AI-authored synthetic policy', independent_human_review=False,
                operationally_approved=False, real_warehouse_accuracy_validated=False,
                training_use='Provisional synthetic prototype only',
                evidence_ref=f'dossiers/{case["sample_id"]}.json', evidence_sha256=sim.digest(case))


def _replay_with_updated_reservations(case):
    # Context must describe the recomputed balance after history coverage variants.
    reserved = sum(row['reserved'] for row in case['opening'])
    reserved += sum(row['quantity'] if row['type'] == 'Reservation' else -row['quantity']
                    for row in case['events'] if row['type'] in ('Reservation', 'Release'))
    case['context']['reserved_commitment_quantity'] = reserved
    return sim.assess_case(case)


def _build_main():
    bases = [case for seed in SEEDS for case in sim.build_pilot(seed)[0]]
    rng = random.Random(314159)
    cases, strata = [], []
    for index, base in enumerate(bases):
        case = copy.deepcopy(base)
        bucket, ordinal = divmod(index, 100)
        coverage = (ordinal+bucket*2) % 6
        recent = [row for row in case['events'] if row['at_ms'] >= sim.CUTOFF-30*sim.DAY]
        if coverage in (2, 4):
            removed = [row for row in recent if row['type'] == 'Receipt']
            case['opening'][0]['quantity'] += sum(row['quantity'] for row in removed)
            identifiers = {row['event_id'] for row in removed}
            case['events'] = [row for row in case['events'] if row['event_id'] not in identifiers]
            if coverage == 4:
                next(row for row in case['events'] if row['event_id'] == 'e000')['at_ms'] = sim.CUTOFF-90*sim.DAY
        elif coverage == 3:
            case['events'] = [row for row in case['events'] if row['at_ms'] < sim.CUTOFF-30*sim.DAY]
        elif coverage in (0, 1):
            case['events'].append(sim.event('main-receipt', sim.CUTOFF-(0 if coverage == 0 else sim.DAY//4), 'Receipt', 1))
        assessment = _replay_with_updated_reservations(case)
        available = assessment['features']['available_quantity']
        if bucket == 0 and available == 0:
            case['opening'][0]['quantity'] += 1
            assessment = _replay_with_updated_reservations(case)
            available = assessment['features']['available_quantity']
        reserved = assessment['features']['reserved_quantity']
        case['context'] = sim.make_context(available, reserved, bucket, 7, cutoff=sim.CUTOFF)
        if bucket == 0:
            case['reorder_level'] = rng.randrange(available)
        elif bucket == 1:
            case['reorder_level'] = min(1000, available+rng.randint(1, 50))
        else:
            case['reorder_level'] = rng.randint(0, 1000)
        assessment = sim.assess_case(case)
        if not assessment['eligible']: raise ValueError('Main case failed complete-history qualification')
        cases.append(case)
        strata.append(dict(sample_id=case['sample_id'], coverage=COVERAGE[coverage],
                           family_id=case['family_id'], ancestor_ids=case['ancestor_ids'],
                           source_seed=SEEDS[index//60], intended_stratum=LABELS[bucket],
                           feature_version='inventory-simulation-features-1.0', rubric_version=RUBRIC,
                           teacher_version=TEACHER, evidence_sha256=sim.digest(case), not_model_input=True))
    sim.audit_families(sim.build_pilot(42)[0]+cases)
    order = list(range(300)); random.Random(271828).shuffle(order)
    cases = [cases[i] for i in order]
    by_stratum = {s['sample_id']: s for s in strata}
    rows, annotations = [], []
    for case in cases:
        assessment = sim.assess_case(case)
        annotation = assisted_label(case)
        if annotation['label'] != by_stratum[case['sample_id']]['intended_stratum']:
            raise ValueError('Constructed stratum and context policy disagree; do not silently relabel')
        annotations.append(annotation)
        rows.append(dict(sample_id=case['sample_id'], group_id=case['family_id'],
            source_id='project-assisted-main-v1', origin='simulated',
            observed_at=sim.iso(case['observed_at_ms']), feature_cutoff_at=sim.iso(case['observed_at_ms']),
            label=annotation['label'], label_status='assisted', labeler_id=TEACHER,
            evidence_ref=annotation['evidence_ref'], rubric_version=RUBRIC, split='', **assessment['features']))
    if {label:sum(r['label']==label for r in rows) for label in LABELS} != {label:100 for label in LABELS}:
        raise ValueError('Predeclared class support not met')
    return cases, rows, annotations, {entry['sample_id']:entry for entry in strata}


def build_main():
    cases, rows, annotations, _ = _build_main()
    return cases, rows, annotations


def partition(rows):
    if len(rows) != 300 or len({r['group_id'] for r in rows}) != 300:
        raise ValueError('Expected one primary row per main family')
    result = dict(development=[], test=[])
    rng = random.Random(42)
    for label in LABELS:
        group = sorted((r for r in rows if r['label'] == label), key=lambda r:r['group_id'])
        if len(group) != 100: raise ValueError('Class support changed')
        rng.shuffle(group)
        for key, subset in [('development', group[:80]), ('test', group[80:])]:
            result[key].extend([dict(r, split=key) for r in subset])
    return {key:sorted(value, key=lambda r:r['sample_id']) for key,value in result.items()}


def source_pins():
    return dict(sim.pins(), **{Path(__file__).relative_to(sim.ROOT).as_posix():hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                              PROTOCOL_PATH.relative_to(sim.ROOT).as_posix():hashlib.sha256(PROTOCOL_PATH.read_bytes()).hexdigest()})


def payloads():
    cases, rows, annotations, provenance = _build_main()
    splits = partition(rows)
    files = {f'dossiers/{c["sample_id"]}.json':sim.canonical(c) for c in cases}
    files['annotations.jsonl'] = b''.join(sim.canonical(row) for row in annotations)
    files['provenance.json'] = sim.canonical(provenance)
    for key, values in splits.items(): files[key+'.csv'] = sim.csv_bytes(sim.COMMON+sim.FEATURES, values)
    files['splits.json'] = sim.canonical({key:[r['group_id'] for r in values] for key,values in splits.items()})
    files['README.txt'] = ('SIMULATED PROTOTYPE ONLY. AI-authored deterministic labels, not independent human truth.\n'
        'Pilot seed42 families excluded. Development240/test60;20 test families per class.\n'
        'Test outcomes are one-use research evidence. No app/operational approval, real-history promotion or model installation.\n').encode()
    return files


def prepare_main(destination, *, repo_root=sim.ROOT):
    destination = sim.validate_destination(destination, repo_root)
    files = payloads()
    if sum(len(b) for b in files.values()) > sim.MAX_BYTES: raise ValueError('Main output budget exceeded')
    manifest = dict(protocol=PROTOCOL, rubric=RUBRIC, teacher=TEACHER, seeds=list(SEEDS),
        origin='simulated', annotation_origin='AI-authored synthetic policy', independent_human_review=False,
        eligible_for_prototype_training=True, operationally_approved=False, families=300,
        features=list(sim.FEATURES), labels=list(LABELS), pilot_seed_excluded=42,
        source_pins=source_pins(), files={p:dict(sha256=hashlib.sha256(b).hexdigest(), bytes=len(b)) for p,b in files.items()})
    destination.parent.mkdir(parents=True,exist_ok=True); destination.mkdir(exist_ok=False)
    for relative, content in files.items():
        path=destination/relative; path.parent.mkdir(exist_ok=True)
        with path.open('xb') as handle:handle.write(content)
    with (destination/'manifest.json').open('xb') as handle:handle.write(sim.canonical(manifest))
    return audit_main(destination,repo_root=repo_root)


def audit_main(destination, *, repo_root=sim.ROOT):
    destination = sim.validate_destination(destination,repo_root,existing=True)
    tree=list(destination.rglob('*'))
    if len(tree)>400 or any(sim.is_link(p) for p in tree):raise ValueError('Unsafe main tree')
    actual=[p for p in tree if p.is_file()]
    if sum(p.stat().st_size for p in actual)>sim.MAX_BYTES:raise ValueError('Main byte budget exceeded')
    manifest=json.loads((destination/'manifest.json').read_text(encoding='utf-8'))
    expected=payloads()
    identity=dict(protocol=PROTOCOL,rubric=RUBRIC,teacher=TEACHER,seeds=list(SEEDS),origin='simulated',
        annotation_origin='AI-authored synthetic policy',independent_human_review=False,
        eligible_for_prototype_training=True,operationally_approved=False,families=300,
        features=list(sim.FEATURES),labels=list(LABELS),pilot_seed_excluded=42,source_pins=source_pins(),
        files={p:dict(sha256=hashlib.sha256(b).hexdigest(),bytes=len(b)) for p,b in expected.items()})
    if manifest!=identity:raise ValueError('Main manifest/provenance/source pin mismatch')
    if {p.relative_to(destination).as_posix() for p in actual}!=set(expected)|{'manifest.json'}:
        raise ValueError('Main file identities differ')
    for path,content in expected.items():
        if (destination/path).read_bytes()!=content:raise ValueError('Main evidence/rows differ from canonical source')
    return dict(status='PASS',protocol=PROTOCOL,families=300,development_families=240,test_families=60,
                test_families_per_class=20,annotation_origin='AI-authored synthetic policy',
                independent_human_review=False,eligible_for_prototype_training=True,
                operationally_approved=False,no_model_fit=True,data_files=len(actual),
                bytes=sum(p.stat().st_size for p in actual),path=str(destination))


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('prepare','audit'));parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(argv)
    try:
        result=prepare_main(args.output) if args.action=='prepare' else audit_main(args.output)
        print(json.dumps(result,indent=2));return 0
    except (ValueError,OSError,KeyError,TypeError,json.JSONDecodeError):
        print('Main operation refused: unsafe, changed or unsupported synthetic data. No existing cohort replaced.',file=sys.stderr)
        return 1


if __name__=='__main__':sys.exit(main())
