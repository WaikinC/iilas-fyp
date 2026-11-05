"""Develop a paired stock-risk experiment on fresh simulated families."""

import argparse
import json
from pathlib import Path
import random
import shutil
import subprocess
import sys

import inventory_context_contract as context
import runner_runtime as runtime
from inventory_context_artifacts import versions
from inventory_context_train import estimator, predictions, score, validate_predictions


HERE = Path(__file__).resolve().parent
PROTOCOL = 'inventory-schedule-outcome-3.0'
PROTOCOL_FILE = 'INVENTORY_SCHEDULE_PROTOCOL_2026-11-06.md'
DEVELOPMENT_OUTPUT = HERE / 'datasets' / 'inventory-schedule-v3-development-20261106'
DEV_FAMILIES = range(180)
HOLDOUT_FAMILIES = range(180, 240)
ARMS = ('rf14', 'schedule')
FEATURE_NAMES = {
    'rf14': context.FEATURES14,
    'schedule': context.FEATURES14 + ('first_batch_deadline_slack_days',
        'confirmed_units_by_first_due', 'firm_units_by_day_7', 'firm_units_by_day_14',
        'confirmed_units_by_day_14'),
}
RF_SPEC = dict(arm='RF14', features='context', depth=12, leaf=2)
LIMITS = runtime.Limits(max_wall_seconds=900, max_fit_seconds=60, max_rss_bytes=2 * 1024**3,
                        min_available_bytes=3 * 1024**3, min_free_disk_bytes=1024**3,
                        max_output_bytes=100 * 1024**2, threads=2)
NORMAL, REORDER, CRITICAL = context.CLASSES
HORIZON = 14


def feature_vectors(stock, commitments, incoming):
    """Only facts recorded at the cutoff reach either predictor vector."""
    due, demand = min(commitments, default=(0, 0))
    eta, quantity, status = min(incoming, default=(0, 0, 'none'))
    baseline = [*stock, demand, due, quantity, eta, *(int(status == s) for s in context.STATUSES)]
    extra = [
        due - eta if commitments and incoming else 0,
        sum(amount for day, amount, state in incoming if commitments and day <= due and state == 'confirmed'),
        sum(amount for day, amount in commitments if day <= 7),
        sum(amount for day, amount in commitments if day <= HORIZON),
        sum(amount for day, amount, state in incoming if day <= HORIZON and state == 'confirmed'),
    ]
    return baseline, baseline + extra


def classify_trajectory(available, reorder, arrivals, demands):
    """Replay realized arrivals before demand on the same simulated day."""
    for day in range(HORIZON + 1):
        available += sum(quantity for arrival, quantity in arrivals if arrival == day)
        requested = sum(quantity for due, quantity in demands if due == day)
        if requested > available:
            return CRITICAL
        available -= requested
    return REORDER if available <= reorder else NORMAL


def stock_at_cutoff(family_number, family):
    sim = context.sim
    rng = random.Random(2026110601 * 10000 + family_number)
    cutoff = sim.CUTOFF + 365 * sim.DAY + family_number
    opening = rng.randint(35, 220)
    reserved = rng.randint(0, 20)
    receipt = rng.randint(15, 75)
    issue = rng.randint(0, 30)
    available = opening + receipt - issue - reserved
    reorder = max(0, available // 2 + rng.randint(-20, 35))
    events = [sim.event(f'{family}-R', cutoff - rng.randint(8, 90) * sim.DAY, 'Receipt', receipt)]
    if issue:
        events.append(sim.event(f'{family}-I', cutoff - 7 * sim.DAY, 'Issue', issue))
    for cycle in range(rng.randint(0, 4)):
        amount = rng.randint(1, 8)
        at = cutoff - (cycle + 1) * sim.DAY
        events.extend([sim.event(f'{family}-A{cycle}0', at, 'Adjustment', amount, direction='Increase'),
                       sim.event(f'{family}-A{cycle}1', at, 'Adjustment', amount, direction='Decrease')])
    opened = cutoff - 120 * sim.DAY
    ledger = dict(sample_id=f'{family}-L', family_id=family, ancestor_ids=[f'{family}-source'],
                  observed_at_ms=cutoff, opening_at_ms=opened, coverage_start_ms=opened,
                  opening=[dict(location='A', quantity=opening, reserved=reserved, warehouse=0)],
                  events=events, reorder_level=reorder, coverage_complete=True, pending_corrections=[])
    facts = context.assess_ledger(ledger)
    if not facts['eligible'] or facts['features']['available_quantity'] != available:
        raise ValueError('Simulated cutoff ledger failed replay')
    return tuple(facts['features'][key] for key in context.FEATURES6), reorder


def known_schedule(available, rng):
    commitments = tuple((rng.randint(1, HORIZON), rng.randint(5, max(6, available * 2 // 3)))
                        for _ in range(rng.randint(0, 3)))
    incoming = tuple((rng.randint(0, HORIZON + 3), rng.randint(5, max(6, available)),
                      rng.choice(context.STATUSES[1:])) for _ in range(rng.randint(0, 3)))
    return commitments, incoming


def simulate_outcome(available, reorder, commitments, incoming, rng):
    uncertainty = {'confirmed': (8, 0, 3), 'planned': (30, 0, 5), 'disrupted': (70, 2, 7)}
    arrivals = []
    for eta, quantity, status in incoming:
        cancelled, min_delay, max_delay = uncertainty[status]
        if rng.randrange(100) >= cancelled:
            arrivals.append((eta + rng.randint(min_delay, max_delay), quantity * rng.randint(65, 100) // 100))
    demands = list(commitments)
    if rng.randrange(100) < 35:
        demands.append((rng.randint(1, HORIZON), rng.randint(5, max(6, available // 3))))
    return classify_trajectory(available, reorder, arrivals, demands)


def build_family(family_number):
    if type(family_number) is not int or not 0 <= family_number < HOLDOUT_FAMILIES.stop:
        raise ValueError('Family number is outside the registered experiment')
    family = f'IS3-{family_number:03d}'
    stock, reorder = stock_at_cutoff(family_number, family)
    rows = []
    for view in range(1, 5):
        offset = family_number * 10 + view
        commitments, incoming = known_schedule(stock[0], random.Random(2026110602 * 10000 + offset))
        baseline, schedule = feature_vectors(stock, commitments, incoming)
        label = simulate_outcome(stock[0], reorder, commitments, incoming,
                                 random.Random(2026110603 * 10000 + offset))
        rows.append(dict(family=family, sample=f'{family}-V{view}', rf14=baseline, schedule=schedule, label=label))
    return rows


def development_groups():
    ids = list(DEV_FAMILIES)
    random.Random(2026110604).shuffle(ids)
    return tuple(tuple(sorted(ids[start:start + 60])) for start in range(0, len(ids), 60))


def development_claim():
    common_dir = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
                                cwd=HERE, capture_output=True, text=True, check=True).stdout.strip()
    root = Path(common_dir).resolve().parent
    claim = root / 'research' / 'datasets' / (DEVELOPMENT_OUTPUT.name + '.claim.json')
    return runtime._validate_output_path(claim, repo_root=root)


def source_pins():
    names = (Path(__file__).name, PROTOCOL_FILE, 'inventory_schedule_evaluate.py',
             'inventory_context_contract.py', 'inventory_context_train.py', 'inventory_context_artifacts.py',
             'inventory_simulation.py', 'inventory_inference.py', 'runner_runtime.py')
    return {name: runtime.sha256_file(HERE / name) for name in names}


def fit_ids():
    return tuple(f'cv-{arm}-f{fold}' for fold in range(3) for arm in ARMS) + tuple(f'final-{arm}' for arm in ARMS)


def preflight():
    destination = runtime._validate_output_path(DEVELOPMENT_OUTPUT)
    if destination.exists() or development_claim().exists():
        raise ValueError('Development is already claimed; preserve its files')
    available = runtime.native_snapshot()
    if available['available_bytes'] < LIMITS.min_available_bytes or available['rss_bytes'] > LIMITS.max_rss_bytes:
        raise runtime.RuntimeSafetyError('Development memory preflight failed')
    if shutil.disk_usage(HERE).free < LIMITS.min_free_disk_bytes:
        raise runtime.RuntimeSafetyError('Development free-disk preflight failed')
    return dict(protocol=PROTOCOL, available_bytes=available['available_bytes'], source_pins=source_pins(),
                versions=versions(), fit_count=len(fit_ids()), holdout_scored=False)


def fit_worker(fit_id, expected_sha):
    runtime.require_supervised_worker()
    job_path = DEVELOPMENT_OUTPUT / f'{fit_id}.job.json'
    if runtime.sha256_file(job_path) != expected_sha:
        raise ValueError('Development fit job hash changed')
    job = json.loads(job_path.read_text(encoding='utf-8'))
    if job['fit_id'] != fit_id or job['claim_sha256'] != runtime.sha256_file(development_claim()):
        raise ValueError('Development fit claim changed')
    model = estimator(RF_SPEC)
    model.fit(job['x_train'], job['y_train'])
    if job['x_evaluate']:
        runtime.write_json_exclusive(DEVELOPMENT_OUTPUT / f'{fit_id}.predictions.json',
                                     predictions(model, job['x_evaluate']))
    else:
        import joblib

        with (DEVELOPMENT_OUTPUT / f'{fit_id}.joblib').open('xb') as file:
            joblib.dump(model, file, compress=3)


def summarize(truth, predicted):
    result = score(truth, predicted)
    normal_support = result['per_class'][NORMAL]['support']
    result['normal_false_alert_rate'] = result['false_alerts'] / normal_support if normal_support else None
    return result


def develop():
    admitted = preflight()
    claim = development_claim()
    runtime.write_json_exclusive(claim, dict(output=str(DEVELOPMENT_OUTPUT), **admitted))
    claim_sha = runtime.sha256_file(claim)
    output = runtime.create_run_directory(DEVELOPMENT_OUTPUT)
    supervisor = runtime.ResourceSupervisor(output, LIMITS)
    families = {number: build_family(number) for number in DEV_FAMILIES}
    all_rows = [row for family in families.values() for row in family]
    runtime.write_json_exclusive(output / 'development-rows.json', all_rows)
    receipts = {}

    def run(fit_id, arm, train, evaluation):
        if {row['label'] for row in train} != set(context.CLASSES):
            raise ValueError('Training fold lacks a registered class')
        path = output / f'{fit_id}.job.json'
        runtime.write_json_exclusive(path, dict(fit_id=fit_id, claim_sha256=claim_sha,
            x_train=[row[arm] for row in train], y_train=[row['label'] for row in train],
            x_evaluate=[row[arm] for row in evaluation]))
        command = [sys.executable, '-B', str(Path(__file__).resolve()), '_fit', fit_id, runtime.sha256_file(path)]
        result = supervisor.run(command, fit_id=fit_id)
        if result['status'] != 'success' or result['returncode'] != 0:
            raise RuntimeError(f'Development fit failed: {fit_id}')
        receipts[fit_id] = result
        if evaluation:
            packet = json.loads((output / f'{fit_id}.predictions.json').read_text(encoding='utf-8'))
            validate_predictions(packet, len(evaluation))
            return packet['predicted']
        if not (output / f'{fit_id}.joblib').is_file():
            raise RuntimeError(f'Development model was not retained: {fit_id}')
        return []

    actual = []
    predicted = {arm: [] for arm in ARMS}
    fold_metrics = {arm: [] for arm in ARMS}
    groups = development_groups()
    for fold, ids in enumerate(groups):
        evaluation = [row for number in ids for row in families[number]]
        train = [row for number in sorted(set(DEV_FAMILIES) - set(ids)) for row in families[number]]
        truth = [row['label'] for row in evaluation]
        actual.extend(truth)
        for arm in ARMS:
            guesses = run(f'cv-{arm}-f{fold}', arm, train, evaluation)
            predicted[arm].extend(guesses)
            fold_metrics[arm].append(summarize(truth, guesses))
    for arm in ARMS:
        run(f'final-{arm}', arm, all_rows, [])
    if tuple(receipts) != fit_ids() or source_pins() != admitted['source_pins'] or runtime.sha256_file(claim) != claim_sha:
        raise RuntimeError('Development lineage or fit ledger changed')
    report = dict(protocol=PROTOCOL, label_origin='AI-assisted synthetic outcomes', families=len(families),
                  rows=len(all_rows), fit_count=len(receipts), holdout_scored=False,
                  arms={arm: dict(pooled=summarize(actual, predicted[arm]), folds=fold_metrics[arm]) for arm in ARMS})
    runtime.write_json_exclusive(output / 'development-report.json', dict(report, fold_families=groups,
                                  features=FEATURE_NAMES, estimator=estimator(RF_SPEC).get_params()))
    supervisor.preflight()
    runtime.write_json_exclusive(output / 'frozen.json', dict(phase='development', protocol=PROTOCOL,
        source_pins=admitted['source_pins'], versions=admitted['versions'], holdout_scored=False,
        fit_count=len(receipts), native_results=receipts, claim_sha256=claim_sha,
        files={path.name: runtime.sha256_file(path) for path in sorted(output.iterdir()) if path.is_file()}))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='phase', required=True)
    commands.add_parser('preflight')
    commands.add_parser('develop')
    worker = commands.add_parser('_fit', help=argparse.SUPPRESS)
    worker.add_argument('fit_id', choices=fit_ids())
    worker.add_argument('sha256')
    args = parser.parse_args()
    if args.phase == '_fit':
        fit_worker(args.fit_id, args.sha256)
        return
    report = preflight() if args.phase == 'preflight' else develop()
    print(json.dumps(report, allow_nan=False, indent=2))


if __name__ == '__main__':
    main()
