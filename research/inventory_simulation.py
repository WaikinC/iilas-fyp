"""Offline, unlabelled inventory pilot. No Firebase, model fitting or network I/O.

All outputs are fictional local evidence, never scientific ground truth. Generation
is exclusive; auditing reads the original packet without changing any file.
"""
import argparse
import copy
import csv
import hashlib
import html
import io
import json
import math
from pathlib import Path
import random
import subprocess
import sys

DAY = 86400000
ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = 'inventory-simulation-1.0'
RUBRIC = 'inventory-simulation-rubric-1.0'
GENERATOR = 'inventory-pilot-1.0'
FEATURES = ('available_quantity', 'reserved_quantity', 'movement_frequency',
            'reorder_distance', 'adjustment_count', 'days_since_replenishment')
COMMON = ('sample_id', 'group_id', 'source_id', 'origin', 'observed_at',
          'feature_cutoff_at', 'label', 'label_status', 'labeler_id',
          'evidence_ref', 'rubric_version', 'split')
REVIEW_COLUMNS = ('sample_id', 'family_id', 'reviewer_id', 'rubric_version',
                  'decision', 'reason', 'evidence_refs', 'fulfilment_impact',
                  'reviewed_at', 'revision_id')
MAX_BYTES = 100*1024*1024
CUTOFF = 1792728000000  # fixed fictional clock: 2026-10-23 04:00 UTC
REPORT_SHA = '5A89BABE5D204FBF784C1BB10B3C7634D9012D68D9A294B6574F4D04ED281B93'
TYPES = {'Receipt', 'Issue', 'Reservation', 'Release', 'Transfer', 'Adjustment', 'Correction'}


def canonical(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True,
                       separators=(',', ':'), allow_nan=False)+'\n').encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def integer(value, name, minimum=0, maximum=1000000):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError('Invalid '+name)
    return value


def exact(value, keys, name):
    if type(value) is not dict or set(value) != set(keys):
        raise ValueError('Invalid '+name+' fields')


def identifier(value):
    if (not isinstance(value, str) or not 1 <= len(value) <= 80 or
            any(c not in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in value)):
        raise ValueError('Invalid fictional identifier')
    return value


def location(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 80:
        raise ValueError('Invalid location')
    return ' '.join(value.split()).upper()


def event(identity, at, kind, quantity, *, source='A', target='', direction='', correction=''):
    return dict(event_id=identity, at_ms=at, type=kind, quantity=quantity,
                location_from=source, location_to=target, direction=direction,
                correction_of=correction)


def make_context(available, reserved, pressure, horizon, *, cutoff=200*DAY):
    """Create fictional cutoff-known planning evidence, never an accepted label."""
    additional = 0 if pressure == 0 else max(1, available+pressure*10)
    return dict(known_at_ms=cutoff, review_horizon_days=horizon,
                reserved_commitment_quantity=reserved, reserved_due_days=3,
                additional_firm_quantity=additional, additional_due_days=3,
                planning_daily_usage=max(0, available//max(horizon, 1)),
                planning_basis='Fictional planning assumption; not observed business demand.',
                reconciliation_notes='Fictional count adjustments retain their explicitly linked inverse corrections.',
                replenishment=dict(quantity=max(10, additional), eta_days=2 if pressure < 2 else 14,
                                   status='confirmed' if pressure == 0 else 'planned' if pressure == 1 else 'disrupted'))


def validate_context(context, cutoff, reserved):
    exact(context, ('known_at_ms', 'review_horizon_days', 'reserved_commitment_quantity',
                    'reserved_due_days', 'additional_firm_quantity', 'additional_due_days',
                    'planning_daily_usage', 'planning_basis', 'reconciliation_notes', 'replenishment'), 'context')
    integer(context['known_at_ms'], 'context cutoff', 0, cutoff)
    integer(context['review_horizon_days'], 'review horizon', 1, 30)
    integer(context['reserved_commitment_quantity'], 'reserved commitment', reserved, reserved)
    for key in ('reserved_due_days', 'additional_due_days'):
        integer(context[key], key, 0, 30)
    for key in ('additional_firm_quantity', 'planning_daily_usage'):
        integer(context[key], key)
    if context['planning_basis'] != 'Fictional planning assumption; not observed business demand.':
        raise ValueError('Planning basis must disclose simulation')
    if not isinstance(context['reconciliation_notes'], str) or not 1 <= len(context['reconciliation_notes']) <= 500:
        raise ValueError('Invalid reconciliation explanation')
    supply = context['replenishment']
    exact(supply, ('quantity', 'eta_days', 'status'), 'replenishment')
    integer(supply['quantity'], 'planned supply')
    integer(supply['eta_days'], 'planned lead time', 0, 30)
    if supply['status'] not in ('confirmed', 'planned', 'disrupted'):
        raise ValueError('Unknown replenishment evidence')


def assess_case(case):
    """Replay all events, qualify six inputs, leave labels and real coverage alone."""
    exact(case, ('sample_id', 'family_id', 'ancestor_ids', 'observed_at_ms',
                 'opening_at_ms', 'opening', 'events', 'reorder_level',
                 'coverage_start_ms', 'coverage_complete', 'pending_corrections', 'context'), 'case')
    identifier(case['sample_id']); identifier(case['family_id'])
    ancestors = case['ancestor_ids']
    if not isinstance(ancestors, list) or not 1 <= len(ancestors) <= 100 or len(set(ancestors)) != len(ancestors):
        raise ValueError('Invalid ancestry')
    for parent in ancestors: identifier(parent)
    cutoff = integer(case['observed_at_ms'], 'cutoff', 0, 10**15)
    opening_at = integer(case['opening_at_ms'], 'opening time', 0, cutoff)
    coverage = integer(case['coverage_start_ms'], 'coverage start', opening_at, cutoff)
    if type(case['coverage_complete']) is not bool: raise ValueError('Invalid coverage declaration')
    reorder = integer(case['reorder_level'], 'reorder level')
    bins = {}
    if not isinstance(case['opening'], list) or not 1 <= len(case['opening']) <= 100:
        raise ValueError('Invalid opening bins')
    for row in case['opening']:
        exact(row, ('location', 'quantity', 'reserved', 'warehouse'), 'bin')
        key = location(row['location'])
        if key in bins: raise ValueError('Duplicate location')
        bins[key] = {k: integer(row[k], k) for k in ('quantity', 'reserved', 'warehouse')}
    primary = next(iter(bins))

    def totals():
        if len(bins) > 100: raise ValueError('Location limit exceeded')
        for row in bins.values():
            if not 0 <= row['warehouse'] <= row['reserved'] <= row['quantity'] <= 1000000:
                raise ValueError('Protected stock invariant failed')
        result = {k: sum(row[k] for row in bins.values()) for k in ('quantity', 'reserved', 'warehouse')}
        if any(v > 1000000 for v in result.values()): raise ValueError('Aggregate capacity exceeded')
        return result

    totals()
    events = case['events']
    if not isinstance(events, list) or len(events) > 1200: raise ValueError('Event limit exceeded')
    seen, corrected, receipts = {}, set(), []
    for row in events:
        exact(row, ('event_id', 'at_ms', 'type', 'quantity', 'location_from',
                    'location_to', 'direction', 'correction_of'), 'event')
        identifier(row['event_id'])
        if row['event_id'] in seen: raise ValueError('Duplicate event ID')
        seen[row['event_id']] = row
        integer(row['at_ms'], 'event time', opening_at, cutoff)
        integer(row['quantity'], 'event quantity', 1)
        if row['type'] not in TYPES: raise ValueError('Invalid event type')
    seen = {}
    ordered = sorted(events, key=lambda e: (e['at_ms'], e['event_id']))
    for row in ordered:
        kind, quantity = row['type'], row['quantity']
        source = location(row['location_from'])
        target = location(row['location_to']) if row['location_to'] else ''
        direction = row['direction']
        if kind == 'Correction':
            original = seen.get(row['correction_of'])
            if not original or original['type'] not in ('Receipt', 'Issue', 'Adjustment', 'Transfer') or row['correction_of'] in corrected:
                raise ValueError('Invalid or repeated correction')
            original_kind = original['type']
            expected_direction = ('Decrease' if original_kind == 'Receipt' or
                                  original_kind == 'Adjustment' and original['direction'] == 'Increase' else 'Increase')
            if original_kind == 'Transfer':
                expected_direction = ''
                expected_source, expected_target = location(original['location_to']), location(original['location_from'])
            else:
                expected_source, expected_target = location(original['location_from']), ''
            if (quantity != original['quantity'] or direction != expected_direction or
                    source != expected_source or target != expected_target):
                raise ValueError('Correction must be the exact inverse')
            corrected.add(row['correction_of'])
            kind = 'Transfer' if original_kind == 'Transfer' else 'Adjustment'
        elif row['correction_of']:
            raise ValueError('Only Correction can reference an original')
        if kind == 'Transfer':
            if not target or source == target or direction: raise ValueError('Invalid transfer')
        elif target or (kind != 'Adjustment' and direction):
            raise ValueError('Unexpected target/direction')
        if kind == 'Adjustment' and direction not in ('Increase', 'Decrease'):
            raise ValueError('Invalid adjustment direction')
        if source not in bins:
            if kind == 'Receipt' or kind == 'Adjustment' and direction == 'Increase':
                bins[source] = dict(quantity=0, reserved=0, warehouse=0)
            else: raise ValueError('Missing source bin')
        origin = bins[source]
        if kind == 'Receipt': origin['quantity'] += quantity
        elif kind == 'Issue': origin['quantity'] -= quantity
        elif kind == 'Adjustment': origin['quantity'] += quantity if direction == 'Increase' else -quantity
        elif kind == 'Reservation': origin['reserved'] += quantity
        elif kind == 'Release': origin['reserved'] -= quantity
        elif kind == 'Transfer':
            origin['quantity'] -= quantity
            bins.setdefault(target, dict(quantity=0, reserved=0, warehouse=0))['quantity'] += quantity
            if source == primary and origin['quantity'] == 0: primary = target
        totals()
        bins = {key: value for key, value in bins.items() if value['quantity'] or key == primary}
        if row['type'] == 'Receipt': receipts.append(row)
        seen[row['event_id']] = row
    pending = case['pending_corrections']
    if (not isinstance(pending, list) or len(set(pending)) != len(pending) or
            any(key not in seen or seen[key]['type'] != 'Receipt' or key in corrected for key in pending)):
        raise ValueError('Invalid pending receipt correction')
    balance = totals()
    validate_context(case['context'], cutoff, balance['reserved'])
    window = [r for r in ordered if r['at_ms'] >= cutoff-30*DAY]
    if len(window) > 200: raise ValueError('Pilot window event limit exceeded')
    issues = []
    complete = case['coverage_complete'] and coverage <= cutoff-30*DAY
    if not complete: issues.append('History coverage unknown')
    receipt = None
    candidates = sorted(receipts, key=lambda r: (r['at_ms'], r['event_id']), reverse=True)
    for candidate in candidates[:20]:
        if candidate['event_id'] in corrected: continue
        if candidate['event_id'] in pending:
            issues.append('Pending receipt correction'); break
        receipt = candidate; break
    if receipt is None: issues.append('Eligible replenishment receipt unknown or search exhausted')
    available = balance['quantity']-balance['reserved']
    features = dict(zip(FEATURES, (available, balance['reserved'], len(window) if complete else None,
                                 available-reorder, sum(r['type'] == 'Adjustment' for r in window) if complete else None,
                                 (cutoff-receipt['at_ms'])/DAY if receipt else None)))
    product = dict(quantityOnHand=balance['quantity'], reservedQuantity=balance['reserved'],
                   warehouseReservedQuantity=balance['warehouse'], reorderLevel=reorder,
                   location=primary, version=len(events)+1,
                   locationBalances=[dict(location=key, **value) for key, value in bins.items()])
    return dict(features=features, product=product, eligible=not issues, issues=issues,
                receipt_id=receipt['event_id'] if receipt else None,
                observed_movement_count=len(window),
                observed_adjustment_count=sum(r['type'] == 'Adjustment' for r in window))


def audit_families(cases):
    """Reject false independence by explicit ancestry or copied concrete history."""
    owners, histories, samples = {}, {}, set()
    for case in cases:
        assess_case(case)
        sample, family = identifier(case['sample_id']), identifier(case['family_id'])
        if sample in samples: raise ValueError('Duplicate sample ID')
        samples.add(sample)
        by_id = {row['event_id']: row for row in case['events']}
        def without_id(row):
            value = {k: v for k, v in row.items() if k != 'event_id'}
            if row['correction_of']:
                original = by_id[row['correction_of']]
                value['correction_of'] = digest({k: v for k, v in original.items() if k != 'event_id'})
            return value
        history = digest(dict(opening=case['opening'],
                              events=sorted((without_id(r) for r in case['events']), key=canonical)))
        for key, registry in [(p, owners) for p in case['ancestor_ids']]+[(history, histories)]:
            if key in registry and registry[key] != family:
                raise ValueError('Related histories/ancestry cross claimed families')
            registry[key] = family


def build_pilot(seed=42):
    integer(seed, 'seed', 0, 2**32-1)
    rng = random.Random(seed)
    regimes = ([('stable', 0)]*7+[('active_covered', 0)]*7+[('quiet_modest', 0)]*6+
               [('near_reorder', 1)]*7+[('depleting', 1)]*7+[('reserved_recoverable', 1)]*6+
               [('imminent_shortfall', 2)]*10+[('disrupted_supply', 2)]*10)
    rng.shuffle(regimes)
    cases, assignments = [], []
    for index, (regime, bucket) in enumerate(regimes):
        token = f'{rng.getrandbits(64):016x}'
        sample = f'C-{token}'; family = f'F-{token}'
        start = rng.randint(120, 180)
        opening = rng.randint(100, 400 if regime == 'quiet_modest' else 950)
        events = [event('e000', CUTOFF-rng.randint(31, 110)*DAY, 'Receipt', rng.randint(10, 50))]
        # Vary activity independently of intended risk; all quantities are fictional.
        pairs = rng.randint(0, 8) if regime == 'quiet_modest' else rng.randint(12, 32) if regime == 'active_covered' else rng.randint(1, 32)
        for position in range(pairs):
            at = CUTOFF-28*DAY+position*DAY//2
            q = rng.randint(1, 10)
            events.extend([event(f'i{position:03}', at, 'Issue', q),
                           event(f'r{position:03}', at+1, 'Receipt', q)])
        adjustments = 6 if index % 12 == 0 else rng.randint(0, 6)
        for adjustment in range(adjustments):
            at = CUTOFF-10*DAY+adjustment*60000
            events.extend([event(f'adj{adjustment}', at, 'Adjustment', 2, direction='Increase'),
                           event(f'rev{adjustment}', at+1000, 'Correction', 2, direction='Decrease', correction=f'adj{adjustment}')])
        events.extend([event('out', CUTOFF-8*DAY, 'Transfer', 5, target='B'),
                       event('back', CUTOFF-7*DAY, 'Transfer', 5, source='B', target='A')])
        quantity = opening+events[0]['quantity']
        if regime == 'depleting':
            decrement = max(1, quantity//30)
            for day in range(6):
                events.append(event(f'deplete{day}', CUTOFF-(6-day)*DAY, 'Issue', decrement))
                quantity -= decrement
        if index in (0, 20, 40):
            events.append(event('empty', CUTOFF-DAY, 'Issue', quantity))
            quantity = 0
        reserved = rng.randint(0, quantity)
        if reserved: events.append(event('hold', CUTOFF-DAY//2, 'Reservation', reserved))
        available = quantity-reserved
        case = dict(sample_id=sample, family_id=family, ancestor_ids=[f'BASE-{token}'],
                    observed_at_ms=CUTOFF, opening_at_ms=CUTOFF-start*DAY,
                    opening=[dict(location='A', quantity=opening, reserved=0, warehouse=0)],
                    reorder_level=rng.randint(0, min(1000, quantity+100)),
                    coverage_start_ms=CUTOFF-start*DAY, coverage_complete=True,
                    pending_corrections=[], events=events,
                    context=make_context(available, reserved, bucket, 7, cutoff=CUTOFF))
        if regime == 'near_reorder': case['reorder_level'] = max(0, min(1000, available+rng.randint(-10, 10)))
        # Forecasting/reorder context is evidence only, never model inputs or labels.
        if regime == 'quiet_modest': case['context']['planning_daily_usage'] = 0
        if regime == 'reserved_recoverable':
            case['context']['replenishment'].update(status='confirmed', eta_days=2)
        assess_case(case)
        cases.append(case)
        assignments.append(dict(sample_id=sample, regime=regime,
                                intended_bucket=('Normal', 'Reorder Risk', 'Critical Stock Risk')[bucket]))
    audit_families(cases)
    return cases, dict(assignments=assignments,
                       intended_bucket_counts={'Normal': 20, 'Reorder Risk': 20, 'Critical Stock Risk': 20},
                       warning='Design intentions only. No accepted human labels; do not show during review.')


def is_link(path):
    return path.is_symlink() or getattr(path, 'is_junction', lambda: False)()


def validate_destination(destination, repo_root=ROOT, *, existing=False):
    repo = Path(repo_root).resolve()
    raw = Path(destination)
    if '..' in raw.parts: raise ValueError('Parent traversal forbidden')
    absolute = raw.absolute()
    allowed = repo/'research/datasets/inventory-simulation-v1'
    if not absolute.is_relative_to(allowed) or absolute == allowed:
        raise ValueError('Output must be a child of ignored inventory simulation root')
    for ancestor in (absolute, *absolute.parents):
        if is_link(ancestor): raise ValueError('Links/junctions forbidden')
        if ancestor == repo: break
    relative = absolute.relative_to(repo).as_posix()
    for args in [('ls-files', '--', relative), ('check-ignore', '--no-index', '-q', '--', relative)]:
        result = subprocess.run(['git', *args], cwd=repo, capture_output=True, text=True, check=False)
        if result.returncode or args[0] == 'ls-files' and result.stdout.strip():
            raise ValueError('Output must be untracked and Git ignored')
    if existing:
        if not absolute.is_dir(): raise ValueError('Pilot directory missing')
    elif absolute.exists(): raise ValueError('Destination exists; overwrite/resume forbidden')
    return absolute


def pins():
    paths = [Path(__file__), ROOT/'lib/inventoryRisk.js', ROOT/'lib/locationStock.js',
             ROOT/'research/INVENTORY_SIMULATION_AND_LABELLING_2026-10-23.md']
    report = ROOT.parent/'fyp-cwk-2/resources/sources/project-1-2026-10-07/Project I Portfolio-WongRicHang.docx'
    if hashlib.sha256(report.read_bytes()).hexdigest().upper() != REPORT_SHA:
        raise ValueError('Partner report integrity mismatch')
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def csv_bytes(columns, rows):
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=columns, lineterminator='\n')
    writer.writeheader(); writer.writerows(rows)
    return stream.getvalue().encode()


def iso(at):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(at/1000, timezone.utc).isoformat()


def dossier_html(case):
    result = assess_case(case)
    def section(title, value):
        return '<h2>'+html.escape(title)+'</h2><pre>'+html.escape(json.dumps(value, indent=2))+'</pre>'
    body = '<p>Fictional inventory scenario. Review current condition at the cutoff; no label is suggested.</p>'
    body += section('Cutoff and stock', dict(cutoff=iso(case['observed_at_ms']), **result['product']))
    body += section('Six calculated inputs', result['features'])
    body += section('Cutoff-known planning context', case['context'])
    body += '<p>Reserved commitments are already included in reserved stock. Additional firm quantity is separate. Do not subtract reservations twice.</p>'
    body += section('Coverage and replenishment', dict(coverage_start=iso(case['coverage_start_ms']),
                         coverage_complete=case['coverage_complete'], latest_receipt=result['receipt_id'], issues=result['issues']))
    body += section('Opening balance and full event history', dict(opening=case['opening'], events=case['events']))
    return html_page(case['sample_id'], body)


def html_page(title, body):
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>'+html.escape(title)+'</title><style>body{font:16px system-ui;max-width:960px;margin:auto;padding:24px;color:#17233f}'
            'pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f3fa;padding:16px}a{color:#5144a0}li{margin:12px 0}</style>'
            '<h1>'+html.escape(title)+'</h1>'+body+'</html>').encode()


def pilot_payloads(cases, design):
    """One canonical renderer for generation and semantic evidence audit."""
    payloads, observations, reviews = {}, [], []
    links = []
    for case in cases:
        sample = case['sample_id']; result = assess_case(case)
        payloads[f'dossiers/{sample}.json'] = canonical(case)
        payloads[f'dossiers/{sample}.html'] = dossier_html(case)
        observations.append(dict(sample_id=sample, group_id=case['family_id'], source_id='project-simulation-v1',
            origin='simulated', observed_at=iso(case['observed_at_ms']), feature_cutoff_at=iso(case['observed_at_ms']),
            label='', label_status='pending', labeler_id='', evidence_ref=f'dossiers/{sample}.json',
            rubric_version=RUBRIC, split='', **result['features']))
        reviews.append({key: (sample if key == 'sample_id' else case['family_id'] if key == 'family_id'
                             else RUBRIC if key == 'rubric_version' else '') for key in REVIEW_COLUMNS})
        links.append(f'<li><a href="dossiers/{sample}.html">Case {len(links)+1:02}: {sample}</a></li>')
    payloads['observations.csv'] = csv_bytes(COMMON+FEATURES, observations)
    payloads['reviews-template.csv'] = csv_bytes(REVIEW_COLUMNS, reviews)
    payloads['reviews.jsonl'] = b''
    payloads['sealed-design.json'] = canonical(design)
    payloads['review.html'] = html_page('IILAS fictional stock pilot review',
        '<p>60 fictional product families; no model has been trained. Judge Normal, Reorder Risk, Critical Stock Risk or Unresolved from each dossier. '
        'Do not inspect the separate sealed design manifest before reviewing. It is procedural blinding, not access control.</p>'
        '<p>Critical needs evidence of likely fulfilment impact. Zero stock alone does not prove Critical. Missing context can remain Unresolved. '
        'Record your own judgement in a separate local copy of reviews-template.csv; this page does not save answers. '
        'Do not edit frozen observations or dossiers. A second reviewer uses a separate copy without seeing the first reviewer answers.</p><ol>'
        +''.join(links)+'</ol>')
    payloads['README.txt'] = ('SIMULATED ONLY. Pilot is not training/test data.\n'
        'Open review.html locally. Copy reviews-template.csv to a new ignored local path before recording answers.\n'
        'Preserve this frozen packet. Review import/adjudication is a later stage; audit checks the original unlabelled packet only.\n'
        'No accepted labels, split, model or real application history qualification.\n').encode()
    return payloads


def generate_pilot(destination, seed=42, *, repo_root=ROOT):
    destination = validate_destination(destination, repo_root)
    cases, design = build_pilot(seed)
    source_pins = pins()
    payloads = pilot_payloads(cases, design)
    if sum(map(len, payloads.values())) > MAX_BYTES: raise ValueError('Output budget exceeded')
    manifest = dict(protocol=PROTOCOL, rubric=RUBRIC, generator=GENERATOR, seed=seed, stage='pilot',
                    origin='simulated', families=60, reviewed_labels=0, source_pins=source_pins,
                    report_sha256=REPORT_SHA, features=list(FEATURES),
                    files={key: dict(sha256=hashlib.sha256(value).hexdigest(), bytes=len(value)) for key, value in payloads.items()})
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.mkdir(exist_ok=False)
    for relative, payload in payloads.items():
        path = destination/relative; path.parent.mkdir(exist_ok=True)
        with path.open('xb') as handle: handle.write(payload)
    # Written last: an interrupted partial packet never has a completed manifest.
    with (destination/'manifest.json').open('xb') as handle: handle.write(canonical(manifest))
    return audit_pilot(destination, repo_root=repo_root)


def audit_pilot(destination, *, repo_root=ROOT):
    destination = validate_destination(destination, repo_root, existing=True)
    paths = list(destination.rglob('*'))
    if len(paths) > 200 or any(is_link(p) for p in paths): raise ValueError('Unsafe pilot tree')
    files = [p for p in paths if p.is_file()]
    if sum(p.stat().st_size for p in files) > MAX_BYTES: raise ValueError('Pilot byte limit exceeded')
    manifest = json.loads((destination/'manifest.json').read_text(encoding='utf-8'))
    exact(manifest, ('protocol', 'rubric', 'generator', 'seed', 'stage', 'origin', 'families',
                     'reviewed_labels', 'source_pins', 'report_sha256', 'features', 'files'), 'manifest')
    if (manifest['protocol'], manifest['rubric'], manifest['generator'], manifest['stage'], manifest['origin']) != (PROTOCOL, RUBRIC, GENERATOR, 'pilot', 'simulated'):
        raise ValueError('Unsupported pilot protocol')
    if manifest['source_pins'] != pins() or manifest['report_sha256'] != REPORT_SHA:
        raise ValueError('Pilot source/report pins differ; preserve old packet and use a new version')
    if manifest['families'] != 60 or manifest['reviewed_labels'] != 0 or manifest['features'] != list(FEATURES):
        raise ValueError('Invalid pilot metadata')
    declared = manifest['files']
    if type(declared) is not dict or len(declared) != 126:
        raise ValueError('Unexpected packet file count')
    if {p.relative_to(destination).as_posix() for p in files} != set(declared)|{'manifest.json'}:
        raise ValueError('Packet files do not match manifest')
    for relative, identity in declared.items():
        p = Path(relative)
        if p.is_absolute() or '..' in p.parts or (destination/p).resolve().parent != destination.resolve() and not str(relative).startswith('dossiers/'):
            raise ValueError('Invalid manifest path')
        data = (destination/p).read_bytes()
        if identity != dict(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data)):
            raise ValueError('Packet checksum mismatch')
    cases = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((destination/'dossiers').glob('*.json'))]
    if len(cases) != 60 or len({c['family_id'] for c in cases}) != 60: raise ValueError('Pilot family count mismatch')
    audit_families(cases)
    with (destination/'observations.csv').open(encoding='utf-8', newline='') as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 60 or len({row['sample_id'] for row in rows}) != 60: raise ValueError('Observation count mismatch')
    by_id = {row['sample_id']: row for row in rows}
    for case in cases:
        assessed = assess_case(case); row = by_id.get(case['sample_id'])
        if not assessed['eligible'] or row is None: raise ValueError('Pilot case is not qualified for review')
        if list(row) != list(COMMON+FEATURES): raise ValueError('Observation columns differ')
        if any(row[key] for key in ('label', 'labeler_id', 'split')) or row['label_status'] != 'pending':
            raise ValueError('Pilot labels and splits must remain blank')
        if (row['origin'], row['group_id'], row['rubric_version'], row['source_id'], row['evidence_ref']) != ('simulated', case['family_id'], RUBRIC, 'project-simulation-v1', f'dossiers/{case["sample_id"]}.json'):
            raise ValueError('Observation provenance mismatch')
        if row['observed_at'] != iso(case['observed_at_ms']) or row['feature_cutoff_at'] != row['observed_at']:
            raise ValueError('Observation cutoff mismatch')
        if any(not math.isfinite(float(row[k])) or float(row[k]) != assessed['features'][k] for k in FEATURES):
            raise ValueError('Frozen features do not match event replay')
    if (destination/'reviews.jsonl').read_bytes(): raise ValueError('No human reviews belong in frozen initial packet')
    expected_cases, expected_design = build_pilot(manifest['seed'])
    expected_payloads = pilot_payloads(expected_cases, expected_design)
    if set(declared) != set(expected_payloads):
        raise ValueError('Frozen dossier names/evidence references differ from generated cases')
    for relative, expected in expected_payloads.items():
        if (destination/relative).read_bytes() != expected:
            raise ValueError('Rendered evidence or frozen data differ from canonical generation')
    if sorted(cases, key=lambda c: c['sample_id']) != sorted(expected_cases, key=lambda c: c['sample_id']):
        raise ValueError('Pilot differs from pinned deterministic generator')
    if json.loads((destination/'sealed-design.json').read_text(encoding='utf-8')) != expected_design:
        raise ValueError('Intended regimes differ from the declared sampling design')
    with (destination/'reviews-template.csv').open(encoding='utf-8', newline='') as handle:
        reviews = list(csv.DictReader(handle))
    if len(reviews) != 60 or {r['sample_id'] for r in reviews} != set(by_id):
        raise ValueError('Review template identities differ')
    for row in reviews:
        if (list(row) != list(REVIEW_COLUMNS) or row['family_id'] != by_id[row['sample_id']]['group_id'] or
                row['rubric_version'] != RUBRIC or any(row[key] for key in REVIEW_COLUMNS
                    if key not in ('sample_id', 'family_id', 'rubric_version'))):
            raise ValueError('Initial review template must be blank and correctly scoped')
    fingerprints = {}
    for case in cases:
        key = digest(assess_case(case)['features']); fingerprints.setdefault(key, []).append(case['sample_id'])
    return dict(status='PASS', protocol=PROTOCOL, families=60, observations=60, reviewed_labels=0,
                eligible_for_training=False, feature_collision_groups=sum(len(v)>1 for v in fingerprints.values()),
                data_files=len(files), bytes=sum(p.stat().st_size for p in files),
                path=str(destination), no_model_or_split=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('generate', 'audit'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args(argv)
    try:
        result = generate_pilot(args.output, args.seed) if args.action == 'generate' else audit_pilot(args.output)
        print(json.dumps(result, indent=2))
        return 0
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError):
        print('Pilot operation refused: invalid, changed or unsafe local evidence. Existing data were not replaced.', file=sys.stderr)
        return 1


if __name__ == '__main__': sys.exit(main())
