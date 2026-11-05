"""Compare Critical thresholds on saved RF14 development folds only."""

import argparse
from collections import Counter
import csv
import io
import json
from pathlib import Path

import inventory_context_artifacts as artifacts
from inventory_context_contract import CLASSES
from inventory_context_data import COLUMNS
from inventory_context_train import candidate_id, score, validate_predictions


SOURCE_SHA256 = '06b22b1c46e4d0c6dba6439abe4a00363c36be4424062fa678b5a34efd84d414'
DEVELOPMENT_SEAL_SHA256 = '0eb1350894bd9d4b4f66364d6dd98755cfd0af455b5dcc8cedb2b6c9cfa440cc'
THRESHOLDS = tuple(value / 1000 for value in range(250, 601, 25))
NORMAL, REORDER, CRITICAL = CLASSES


def checked_json(directory, file_index, name):
    return artifacts.decode_json(artifacts.checked_bytes(directory, file_index, name))


def read_rows(source, manifest):
    data = artifacts.checked_bytes(source, manifest, 'development.csv')
    reader = csv.DictReader(io.StringIO(data.decode('utf-8')))
    if tuple(reader.fieldnames or ()) != COLUMNS:
        raise ValueError('Development CSV columns changed')
    rows = {}
    for row in reader:
        sample_id, family, label = row['sample_id'], row['family_id'], row['label']
        if (not sample_id or sample_id in rows or not family or label not in CLASSES
                or row['split'] != 'development'):
            raise ValueError('Invalid development row')
        rows[sample_id] = (family, label)
    if len(rows) != 2880 or sorted(Counter(family for family, _ in rows.values()).values()) != [12] * 240:
        raise ValueError('Development cohort size changed')
    return rows


def read_evidence(cohort_root):
    source = cohort_root / 'main-01'
    development = cohort_root / 'development-01'
    seal_name = f'{artifacts.EXPERIMENT}-development-complete.json'
    source_index = {'files': {'manifest.json': SOURCE_SHA256}}
    seal_index = {'files': {seal_name: DEVELOPMENT_SEAL_SHA256}}
    manifest = checked_json(source, source_index, 'manifest.json')
    seal = checked_json(cohort_root / 'registry', seal_index, seal_name)
    receipt = checked_json(development, seal, 'development.json')
    if (seal['experiment_id'] != artifacts.EXPERIMENT or seal['phase'] != 'development'
            or seal['source_sha256'] != SOURCE_SHA256 or receipt['source_sha256'] != SOURCE_SHA256
            or receipt['basis'] != manifest['basis']):
        raise ValueError('Development seal or source binding changed')

    rows = read_rows(source, manifest)
    spec = receipt['selected']['RF14']
    if spec['arm'] != 'RF14' or spec['features'] != 'context':
        raise ValueError('Development selection is not RF14')
    candidate = candidate_id(spec)
    ledger = {entry['fit_id']: entry for entry in receipt['ledger']}
    if len(ledger) != len(receipt['ledger']):
        raise ValueError('Duplicate fit entries')
    folds = []
    for fold, split in enumerate(receipt['folds']):
        fit_id = f'cv-{candidate}-f{fold}'
        entry = ledger[fit_id]
        if entry['spec'] != spec or len(split['validation']) != 80:
            raise ValueError('Development fit identity changed')
        prediction = checked_json(development, seal, f'{fit_id}.predictions.json')
        folds.append((split, entry, prediction))
    return candidate, rows, folds


def summarize(truth, guesses):
    metrics = score(truth, guesses)
    critical = metrics['per_class'][CRITICAL]
    return dict(rows=len(truth), accuracy=metrics['accuracy'], macro_f1=metrics['macro_f1'],
                critical_precision=None if CRITICAL in metrics['undefined_precision'] else critical['precision'],
                critical_recall=None if CRITICAL in metrics['undefined_recall'] else critical['recall'],
                critical_support=critical['support'], critical_as_normal=metrics['critical_as_normal'],
                normal_support=metrics['per_class'][NORMAL]['support'], normal_alerts=metrics['false_alerts'])


def compare(rows, folds):
    families = {family for family, _ in rows.values()}
    if len(folds) != 3:
        raise ValueError('Expected three development folds')
    validation_families = set()
    labels, probabilities, baseline = [], [], []
    for split, entry, prediction in folds:
        train = set(split['train'])
        validation = set(split['validation'])
        if (not validation or train & validation or train | validation != families
                or validation_families & validation or len(train) != len(split['train'])
                or len(validation) != len(split['validation'])):
            raise ValueError('Invalid development family partition')
        validation_families.update(validation)
        train_ids = [sample for sample, (family, _) in rows.items() if family in train]
        validation_ids = [sample for sample, (family, _) in rows.items() if family in validation]
        if train_ids != entry['train_ids'] or validation_ids != entry['evaluate_ids']:
            raise ValueError('Development prediction row order changed')
        validate_predictions(prediction, len(validation_ids))
        labels.append([rows[sample][1] for sample in validation_ids])
        probabilities.append(prediction['probabilities'])
        baseline.append(prediction['predicted'])
    if validation_families != families:
        raise ValueError('Incomplete validation family coverage')

    pooled_labels = [label for fold in labels for label in fold]

    def summarize_folds(guesses):
        return dict(pooled=summarize(pooled_labels, [guess for fold in guesses for guess in fold]),
                    folds=[summarize(truth, predicted) for truth, predicted in zip(labels, guesses)])

    sweep = []
    for threshold in THRESHOLDS:
        guesses = []
        for fold in probabilities:
            guesses.append([CRITICAL if critical >= threshold else (NORMAL if normal >= reorder else REORDER)
                            for normal, reorder, critical in fold])
        sweep.append(dict(threshold=threshold, **summarize_folds(guesses)))
    return dict(rows=len(rows), families=len(families), baseline=summarize_folds(baseline), threshold_sweep=sweep)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cohort_root', type=Path, help='The existing inventory-simulation-v2 evidence directory')
    args = parser.parse_args()
    candidate, rows, folds = read_evidence(args.cohort_root.absolute())
    report = dict(scope='Exploratory grouped development only, with simulated teaching labels',
                  candidate=candidate, source_sha256=SOURCE_SHA256,
                  development_seal_sha256=DEVELOPMENT_SEAL_SHA256, **compare(rows, folds))
    print(json.dumps(report, allow_nan=False, indent=2))


if __name__ == '__main__':
    main()
