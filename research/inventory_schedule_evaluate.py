"""Once-only paired holdout inference for the local inventory schedule study."""

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import sys

import inventory_context_artifacts as artifacts
from inventory_context_contract import CLASSES
from inventory_context_train import predictions, score, validate_predictions
import runner_runtime as runtime


PROTOCOL = 'inventory-schedule-outcome-3.0'
ARMS = ('rf14', 'schedule')
FIT_IDS = tuple(f'cv-{arm}-f{fold}' for arm in ARMS for fold in range(3)) + tuple(f'final-{arm}' for arm in ARMS)
EVALUATION_NAME = 'inventory-schedule-v3-evaluation-20261106'
EVALUATION_OUTPUT = Path(__file__).resolve().parent / 'datasets' / EVALUATION_NAME
GIB = 1024**3
LIMITS = runtime.Limits(max_wall_seconds=120, max_fit_seconds=120, max_rss_bytes=2 * GIB,
                        min_available_bytes=3 * GIB, min_free_disk_bytes=GIB,
                        max_output_bytes=100 * 1024**2, poll_seconds=0.1, threads=1)


def verify_frozen(development, development_claim, source_pins, versions):
    frozen_path = artifacts.member_path(development, 'frozen.json')
    if frozen_path.stat().st_size > artifacts.MAX_BYTES:
        raise ValueError('Frozen development manifest exceeds its size limit')
    raw = frozen_path.read_bytes()
    frozen = artifacts.decode_json(raw)
    if (frozen['protocol'] != PROTOCOL or frozen['phase'] != 'development'
            or frozen['holdout_scored'] is not False or frozen['fit_count'] != len(FIT_IDS)):
        raise ValueError('Development freeze does not match the registered study')
    if frozen['source_pins'] != source_pins or frozen['versions'] != versions:
        raise ValueError('Frozen source or versions changed')
    claim_path = artifacts.member_path(development_claim.parent, development_claim.name)
    if frozen['claim_sha256'] != runtime.sha256_file(claim_path):
        raise ValueError('Frozen development claim changed')

    models = {f'final-{arm}.joblib': arm for arm in ARMS}
    receipts = {f'{fit}.result.json': fit for fit in FIT_IDS}
    actual = {path.relative_to(development).as_posix() for path in development.rglob('*')
              if path.is_file() and path != frozen_path}
    if actual != set(frozen['files']) or not (models.keys() | receipts.keys()) <= actual:
        raise ValueError('Frozen development file inventory changed')
    if set(frozen['native_results']) != set(FIT_IDS):
        raise ValueError('Frozen native fit inventory changed')

    model_bytes = {}
    for name in frozen['files']:
        value = artifacts.checked_bytes(development, frozen, name)
        if name in models:
            model_bytes[models[name]] = value
        if name in receipts:
            result = artifacts.decode_json(value)
            if (result != frozen['native_results'][receipts[name]] or result['status'] != 'success'
                    or result['returncode'] != 0 or result['reason'] is not None):
                raise ValueError(f'Native fit failed or changed for {receipts[name]}')
    return hashlib.sha256(raw).hexdigest(), model_bytes


def claim_value(frozen_sha256, source_pins):
    return dict(protocol=PROTOCOL, phase='evaluation', output=str(EVALUATION_OUTPUT),
                frozen_sha256=frozen_sha256, source_pins=source_pins)


def write_claim(path, frozen_sha256, source_pins):
    runtime.write_json_exclusive(path, claim_value(frozen_sha256, source_pins))


def compare(labels, predictions_by_arm):
    normal, _, critical = CLASSES
    metrics = {}
    for arm in ARMS:
        value = score(labels, predictions_by_arm[arm])
        critical_class = value['per_class'][critical]
        normal_support = value['per_class'][normal]['support']
        metrics[arm] = dict(
            accuracy=value['accuracy'], macro_f1=value['macro_f1'],
            critical_precision=None if critical in value['undefined_precision'] else critical_class['precision'],
            critical_recall=None if critical in value['undefined_recall'] else critical_class['recall'],
            critical_support=critical_class['support'], critical_predicted=sum(row[2] for row in value['confusion']),
            critical_as_normal=value['critical_as_normal'], normal_false_alerts=value['false_alerts'],
            normal_false_alert_rate=value['false_alerts'] / normal_support if normal_support else None,
            normal_support=normal_support, confusion=value['confusion'],
            undefined_precision=value['undefined_precision'], undefined_recall=value['undefined_recall'],
        )
    delta = {}
    for name in ('accuracy', 'macro_f1', 'critical_precision', 'critical_recall',
                 'critical_as_normal', 'normal_false_alert_rate'):
        baseline, candidate = metrics['rf14'][name], metrics['schedule'][name]
        delta[name] = candidate - baseline if baseline is not None and candidate is not None else None
    return dict(classes=list(CLASSES), metrics=metrics, schedule_minus_rf14=delta)


def retain_and_score(output, rows, packets, frozen_sha256):
    sample_ids = [row['sample'] for row in rows]
    labels = [row['label'] for row in rows]
    for arm in ARMS:
        validate_predictions(packets[arm], len(rows))
    files = {}
    for arm in ARMS:
        name = f'{arm}.predictions.json'
        runtime.write_json_exclusive(output / name, dict(arm=arm, sample_ids=sample_ids,
                                     frozen_sha256=frozen_sha256, **packets[arm]))
        files[name] = runtime.sha256_file(output / name)
    observations = [dict(sample=row['sample'], family=row['family'], label=row['label']) for row in rows]
    runtime.write_json_exclusive(output / 'observations.json', observations)
    files['observations.json'] = runtime.sha256_file(output / 'observations.json')
    completion = output / 'predictions-complete.json'
    runtime.write_json_exclusive(completion, dict(frozen_sha256=frozen_sha256, files=files))

    result = dict(protocol=PROTOCOL, phase='evaluation', frozen_sha256=frozen_sha256,
                  predictions_sha256=runtime.sha256_file(completion), rows=len(rows),
                  families=len({row['family'] for row in rows}), holdout_scored=True,
                  serving_eligible=False, provenance='synthetic simulated stock outcomes',
                  **compare(labels, {arm: packets[arm]['predicted'] for arm in ARMS}))
    runtime.write_json_exclusive(output / 'evaluation.json', result)
    return result


def holdout_rows(experiment):
    if (tuple(experiment.DEV_FAMILIES) != tuple(range(180))
            or tuple(experiment.HOLDOUT_FAMILIES) != tuple(range(180, 240))):
        raise ValueError('The registered schedule family split changed')
    rows = []
    for number in experiment.HOLDOUT_FAMILIES:
        family_id = f'IS3-{number:03}'
        family = experiment.build_family(number)
        if (len(family) != 4 or any(row['family'] != family_id for row in family)
                or {row['sample'] for row in family} != {f'{family_id}-V{view}' for view in range(1, 5)}):
            raise ValueError('Holdout family identity or sample count changed')
        rows.extend(family)
    if {row['label'] for row in rows} != set(CLASSES):
        raise ValueError('Holdout class coverage changed')
    for arm in ARMS:
        if any(len(row[arm]) != len(experiment.FEATURE_NAMES[arm]) or any(
                type(value) not in (int, float) or not math.isfinite(value) for value in row[arm]) for row in rows):
            raise ValueError(f'Invalid {arm} holdout feature matrix')
    return rows


def worker():
    runtime.require_supervised_worker()
    import inventory_schedule_experiment as experiment

    claim_path = experiment.development_claim().with_name(f'{EVALUATION_NAME}.claim.json')
    pins = experiment.source_pins()
    frozen_sha256, models = verify_frozen(experiment.DEVELOPMENT_OUTPUT, experiment.development_claim(),
                                         pins, experiment.versions())
    claim = artifacts.read_json(claim_path)
    if claim != claim_value(frozen_sha256, pins):
        raise ValueError('Canonical evaluation claim changed')
    output = artifacts.safe_path(EVALUATION_OUTPUT, existing=True)
    runtime.write_json_exclusive(output / 'holdout-started.json', claim)
    rows = holdout_rows(experiment)

    import joblib
    from threadpoolctl import threadpool_limits

    packets = {}
    with threadpool_limits(limits=LIMITS.threads):
        for arm in ARMS:
            model = joblib.load(io.BytesIO(models[arm]))
            packets[arm] = predictions(model, [row[arm] for row in rows])
    retain_and_score(output, rows, packets, frozen_sha256)


def launch():
    import inventory_schedule_experiment as experiment

    claim_path = experiment.development_claim().with_name(f'{EVALUATION_NAME}.claim.json')
    if claim_path.exists() or EVALUATION_OUTPUT.exists():
        raise ValueError('Inventory schedule evaluation already claimed; repeat forbidden')
    pins = experiment.source_pins()
    frozen_sha256, _ = verify_frozen(experiment.DEVELOPMENT_OUTPUT, experiment.development_claim(),
                                     pins, experiment.versions())
    runtime.ResourceSupervisor(experiment.DEVELOPMENT_OUTPUT, LIMITS).preflight()
    write_claim(claim_path, frozen_sha256, pins)
    output = runtime.create_run_directory(EVALUATION_OUTPUT)
    result = runtime.ResourceSupervisor(output, LIMITS).run(
        [sys.executable, str(Path(__file__).resolve()), '--worker'], fit_id='evaluate',
        cwd=Path(__file__).resolve().parents[1],
    )
    if result['status'] != 'success' or result['returncode'] != 0:
        raise runtime.RuntimeSafetyError('Inventory schedule evaluation failed; inspect its native receipt')
    print(json.dumps(artifacts.read_json(output / 'evaluation.json'), allow_nan=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    if parser.parse_args().worker:
        worker()
    else:
        launch()


if __name__ == '__main__':
    main()
