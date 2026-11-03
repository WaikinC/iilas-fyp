"""Bounded, one-use synthetic stock experiment. No application activation.

Develop reads development observations only. Evaluate reloads frozen local models
and freezes both prediction arrays before releasing any held-out metric.
"""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import io
import json
import math
from pathlib import Path
import platform
import sys
import time

import joblib
import numpy as np
import scipy
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.tree import DecisionTreeClassifier
from threadpoolctl import threadpool_limits

import inventory_simulation_main as data
import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'research/datasets/inventory-simulation-v1/main-01'
DATASET_SHA = '8ef1f9a86466e63b54349a8cd34c6a62ca50fc4f9f6354be9d317bbd43da3962'
PROTOCOL = 'inventory-bounded-training-1.0'
PROTOCOL_PATH = ROOT/'research/INVENTORY_TRAINING_PROTOCOL_2026-10-23.md'
FEATURES = data.sim.FEATURES
LABELS = data.LABELS
FAMILIES = ('DecisionTree', 'RandomForest')
FLAGS = dict(independent_human_review=False, independent_accuracy_validated=False,
             operationally_approved=False, real_warehouse_accuracy_validated=False)
LIMITATIONS = [
    'Agreement with an AI-authored deterministic synthetic teaching policy, not independent warehouse accuracy.',
    'Constructed balanced strata and correlated policy inputs do not represent deployment prevalence.',
    'Commitment deadlines and supply reliability used by the teacher are absent from the six predictors.',
    'Bootstrap intervals condition on this small synthetic cohort and fixed selected models; no refitting uncertainty.',
    'No application activation, automatic stock action or permission to impute missing real history.',
]


def sha(path):
    return runtime.sha256_file(path)


def write(path, value):
    runtime.write_json_exclusive(path, value)


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def candidates():
    return [dict(id=f'{prefix}-d{depth}-l{leaf}', family=family, depth=depth, leaf=leaf)
            for family, prefix, depths in [('DecisionTree', 'dt', (4, 8)), ('RandomForest', 'rf', (6, 12))]
            for depth in depths for leaf in (2, 5)]


def fit_ids():
    return [f'{spec["id"]}-f{fold}' for spec in candidates() for fold in range(3)]+[
        'final-DecisionTree', 'final-RandomForest']


def estimator(spec):
    if spec not in candidates():
        raise ValueError('Unregistered candidate')
    common = dict(max_depth=spec['depth'], min_samples_leaf=spec['leaf'],
                  class_weight='balanced', random_state=42)
    return (DecisionTreeClassifier(**common) if spec['family']=='DecisionTree' else
            RandomForestClassifier(n_estimators=100, n_jobs=2, **common))


def limits(seconds=900, output_bytes=100*1024**2):
    if not 0 < seconds <= 900 or not 0 < output_bytes <= 100*1024**2:
        raise ValueError('Invalid remaining budget')
    return runtime.Limits(max_wall_seconds=seconds, max_fit_seconds=60,
                          max_rss_bytes=2*1024**3, min_available_bytes=3*1024**3,
                          min_free_disk_bytes=1024**3, max_output_bytes=output_bytes, threads=2)


def versions():
    return dict(python=platform.python_version(), sklearn=sklearn.__version__, numpy=np.__version__,
                scipy=scipy.__version__, joblib=joblib.__version__)


def code_pins():
    return {str(p.relative_to(ROOT)).replace('\\', '/'): sha(p) for p in (
        Path(__file__), ROOT/'research/runner_runtime.py', PROTOCOL_PATH)}


def checked_file(directory, name, expected):
    path = directory/name
    if path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()):
        raise ValueError('Linked input forbidden')
    if not path.is_file() or path.stat().st_size != expected['bytes'] or sha(path) != expected['sha256']:
        raise ValueError('Input hash/size mismatch: '+name)
    return path


def source_metadata(source):
    source = runtime._validate_output_path(source, ROOT)
    path = source/'manifest.json'
    if path.is_symlink() or sha(path) != DATASET_SHA:
        raise ValueError('Frozen main manifest mismatch')
    manifest = read(path)
    expected = dict(protocol=data.PROTOCOL, rubric=data.RUBRIC, teacher=data.TEACHER,
        origin='simulated', annotation_origin='AI-authored synthetic policy',
        independent_human_review=False, operationally_approved=False, eligible_for_prototype_training=True,
        families=300, features=list(FEATURES), labels=list(LABELS), seeds=list(data.SEEDS),
        pilot_seed_excluded=42, source_pins=data.source_pins())
    if any(manifest.get(k) != v for k, v in expected.items()):
        raise ValueError('Source/provenance contract changed')
    splits = read(checked_file(source, 'splits.json', manifest['files']['splits.json']))
    if set(splits) != {'development', 'test'}:
        raise ValueError('Unexpected partition')
    if any(len(splits[p]) != n or len(set(splits[p])) != n for p, n in [('development',240), ('test',60)]):
        raise ValueError('Partition count/duplicate group')
    if set(splits['development']) & set(splits['test']):
        raise ValueError('Family leakage')
    return source, manifest, splits


def load_partition(source, partition):
    if partition not in ('development', 'test'):
        raise ValueError('Unknown partition')
    source, manifest, splits = source_metadata(source)
    name = partition+'.csv'
    path = checked_file(source, name, manifest['files'][name])
    reader = csv.DictReader(io.StringIO(path.read_text(encoding='utf-8')))
    if reader.fieldnames != list(data.sim.COMMON+FEATURES):
        raise ValueError('Predictor/schema order changed')
    rows = list(reader)
    expected = 240 if partition=='development' else 60
    if len(rows) != expected or len({r['sample_id'] for r in rows}) != expected:
        raise ValueError('Missing/duplicate observations')
    if len({r['group_id'] for r in rows}) != expected or set(r['group_id'] for r in rows) != set(splits[partition]):
        raise ValueError('Group membership changed')
    if Counter(r['label'] for r in rows) != Counter({label:expected//3 for label in LABELS}):
        raise ValueError('Class support changed')
    for row in rows:
        required = dict(source_id='project-assisted-main-v1', origin='simulated', label_status='assisted',
                        labeler_id=data.TEACHER, rubric_version=data.RUBRIC, split=partition)
        if any(row.get(k) != v for k, v in required.items()):
            raise ValueError('Undisclosed observation provenance')
        if not row['sample_id'] or row['evidence_ref'] != f'dossiers/{row["sample_id"]}.json':
            raise ValueError('Invalid evidence reference')
        if row['observed_at'] != row['feature_cutoff_at']:
            raise ValueError('Feature cutoff differs')
        datetime.fromisoformat(row['observed_at'])
        for key in FEATURES:
            value = float(row[key])
            if not math.isfinite(value) or (key != 'reorder_distance' and value < 0):
                raise ValueError('Missing/nonfinite/negative feature')
            if key != 'days_since_replenishment' and not value.is_integer():
                raise ValueError('Quantity/count must use integral units')
            row[key] = value
        if row['adjustment_count'] > row['movement_frequency']:
            raise ValueError('Adjustment count exceeds all movements')
    return rows, manifest


def matrix(rows):
    return [[row[key] for key in FEATURES] for row in rows]


def folds(rows):
    labels = [r['label'] for r in rows]
    groups = [r['group_id'] for r in rows]
    result = []
    splitter = StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=43)
    for train, valid in splitter.split(matrix(rows), labels, groups):
        if {groups[i] for i in train} & {groups[i] for i in valid}:
            raise ValueError('Cross-fold family leakage')
        for indices in (train, valid):
            counts = Counter(labels[i] for i in indices)
            if set(counts) != set(LABELS) or min(counts.values()) < 3:
                raise ValueError('Insufficient fold class support')
        result.append(dict(train=train.tolist(), validation=valid.tolist()))
    if sorted(i for fold in result for i in fold['validation']) != list(range(len(rows))):
        raise ValueError('Incomplete development coverage')
    return result


def select(records):
    expected = {(s['id'], f) for s in candidates() for f in range(3)}
    if len(records) != 24 or {(r['candidate'], r['fold']) for r in records} != expected:
        raise ValueError('Incomplete/duplicate candidate-fold records')
    summaries = []
    for spec in candidates():
        subset = [r for r in records if r['candidate']==spec['id']]
        for r in subset:
            if any(not math.isfinite(r[k]) or not 0 <= r[k] <= 1 for k in ('macro_f1','critical_recall')):
                raise ValueError('Invalid validation score')
        summaries.append(dict(spec, macro_f1=float(np.mean([r['macro_f1'] for r in subset])),
                              critical_recall=float(np.mean([r['critical_recall'] for r in subset]))))
    return {family:{k:v for k,v in min((s for s in summaries if s['family']==family),
               key=lambda s:(-s['macro_f1'], -s['critical_recall'], s['depth'], -s['leaf'])).items()
                    if k not in ('macro_f1','critical_recall')} for family in FAMILIES}


def claim(phase, output):
    if phase not in ('development', 'evaluation'):
        raise ValueError('Unknown phase claim')
    directory = runtime._validate_output_path(ROOT/'research/datasets/inventory-simulation-v1/experiment-registry', ROOT)
    directory.mkdir(parents=True, exist_ok=True)
    output = runtime._validate_output_path(output, ROOT)
    value = dict(protocol=PROTOCOL, dataset_sha256=DATASET_SHA, phase=phase, output=str(output),
                 claimed_at=datetime.now(timezone.utc).isoformat())
    write(directory/f'{DATASET_SHA}-{phase}.json', value)
    return value


def verify_claim(phase, output):
    directory = ROOT/'research/datasets/inventory-simulation-v1/experiment-registry'
    value = read(directory/f'{DATASET_SHA}-{phase}.json')
    if any(value.get(k) != v for k,v in dict(protocol=PROTOCOL, dataset_sha256=DATASET_SHA,
                                             phase=phase, output=str(Path(output).resolve())).items()):
        raise ValueError('Phase registry does not bind this run')


def predictions(model, x):
    if list(sorted(model.classes_)) != sorted(LABELS):
        raise ValueError('Model classes differ')
    if not x:
        return dict(labels=[], probabilities=[], batch_seconds=0., per_row_seconds=None)
    began = time.perf_counter()
    labels = model.predict(x).tolist()
    probs = model.predict_proba(x)[:, [list(model.classes_).index(label) for label in LABELS]].tolist()
    elapsed = time.perf_counter()-began
    return dict(labels=labels, probabilities=probs, batch_seconds=elapsed, per_row_seconds=elapsed/len(x))


def validate_predictions(result, count):
    probs = np.asarray(result['probabilities'], dtype=float)
    if len(result['labels']) != count or any(x not in LABELS for x in result['labels']):
        raise ValueError('Invalid predicted labels')
    if count and (probs.shape != (count, 3) or not np.isfinite(probs).all() or
                  (probs < 0).any() or (probs > 1).any() or not np.allclose(probs.sum(axis=1), 1)):
        raise ValueError('Invalid probabilities/class order')


def fit_worker(job):
    runtime.require_supervised_worker()
    job = Path(job)
    runtime._validate_output_path(job, ROOT)
    payload = read(job)
    if set(payload) != {'fit_id','spec','x_train','y_train','x_evaluate'}:
        raise ValueError('Unexpected worker fields; validation/test truth forbidden')
    if payload['fit_id'] not in fit_ids() or job.name != payload['fit_id']+'.job.json':
        raise ValueError('Unknown fit job')
    model = estimator(payload['spec'])
    x = np.asarray(payload['x_train'], dtype=float)
    if x.ndim != 2 or x.shape[1] != len(FEATURES) or not np.isfinite(x).all():
        raise ValueError('Invalid training matrix')
    if len(x) != len(payload['y_train']) or set(payload['y_train']) != set(LABELS):
        raise ValueError('Invalid training labels')
    with threadpool_limits(limits=2):
        model.fit(x, payload['y_train'])
        result = predictions(model, payload['x_evaluate'])
    model_path = job.parent/(payload['fit_id']+'.joblib')
    with model_path.open('xb') as stream:
        joblib.dump(model, stream, compress=3)
    write(job.parent/(payload['fit_id']+'.predictions.json'), result)
    write(job.parent/(payload['fit_id']+'.receipt.json'), dict(fit_id=payload['fit_id'], spec=payload['spec'],
        features=list(FEATURES), labels=list(LABELS), train_rows=len(x),
        evaluated_rows=len(payload['x_evaluate']), model_sha256=sha(model_path), **FLAGS))


def run_fit(output, ident, spec, train, evaluate, supervisor):
    job = output/(ident+'.job.json')
    write(job, dict(fit_id=ident, spec=spec, x_train=matrix(train), y_train=[r['label'] for r in train],
                    x_evaluate=matrix(evaluate)))
    result = supervisor.run([sys.executable, str(Path(__file__).resolve()), '_fit', '--job', str(job)],
                            fit_id=ident, cwd=ROOT, include_resident_preflight=True)
    if result['status'] != 'success':
        raise runtime.RuntimeSafetyError('Fit failed: '+ident+'; '+str(result['reason']))
    receipt = read(output/(ident+'.receipt.json'))
    if receipt['model_sha256'] != sha(output/(ident+'.joblib')):
        raise ValueError('Fit artefact mismatch')
    pred = read(output/(ident+'.predictions.json'))
    validate_predictions(pred, len(evaluate))
    return pred, result


def develop(source, output, supervisor):
    rows, _ = load_partition(source, 'development')
    partition = folds(rows)
    write(output/'manifest.json', dict(protocol=PROTOCOL, dataset_sha256=DATASET_SHA,
        source=str(Path(source).resolve()), versions=versions(), code_pins=code_pins(), source_pins=data.source_pins(),
        features=list(FEATURES), labels=list(LABELS), candidates=candidates(), limits=vars(limits()), **FLAGS))
    write(output/'folds.json', dict(rows=[dict(sample_id=r['sample_id'],group_id=r['group_id']) for r in rows], folds=partition))
    ledger = runtime.FitLedger(fit_ids())
    records = []
    for spec in candidates():
        for number, fold in enumerate(partition):
            train = [rows[i] for i in fold['train']]
            valid = [rows[i] for i in fold['validation']]
            ident = f'{spec["id"]}-f{number}'
            pred, receipt = run_fit(output, ident, spec, train, valid, supervisor)
            ledger.record(ident, receipt)
            p, recall, f1, support = precision_recall_fscore_support(
                [r['label'] for r in valid], pred['labels'], labels=list(LABELS), zero_division=0)
            records.append(dict(candidate=spec['id'], fold=number, macro_f1=float(f1.mean()),
                                critical_recall=float(recall[2]), support=support.tolist()))
    choices = select(records)
    write(output/'selection.json', dict(records=records, choices=choices))
    for family in FAMILIES:
        ident = 'final-'+family
        _, receipt = run_fit(output, ident, choices[family], rows, [], supervisor)
        ledger.record(ident, receipt)
    write(output/'ledger.json', ledger.seal())


def inventory(directory):
    # Check links before traversing/hashing any accepted artefact.
    runtime._output_bytes(directory)
    return {p.relative_to(directory).as_posix():dict(sha256=sha(p), bytes=p.stat().st_size)
            for p in sorted(directory.rglob('*')) if p.is_file() and p.name != 'frozen.json'}


def freeze(output, phase, result):
    if result['status'] != 'success' or not 0 < result['elapsed_seconds'] < 900:
        raise ValueError('Cannot freeze failed/out-of-budget phase')
    if runtime._output_bytes(output) > limits().max_output_bytes:
        raise ValueError('Output budget exceeded')
    invocation = read(output/'invocation.json')
    bindings = dict(code_pins=code_pins(), versions=versions(), source_pins=data.source_pins())
    if any(invocation.get(key) != value for key,value in bindings.items()):
        raise ValueError('Source/runtime drift after admission')
    if phase=='development':
        manifest = read(output/'manifest.json')
        if any(manifest.get(key) != value for key,value in bindings.items()):
            raise ValueError('Development source/runtime binding differs')
    write(output/'frozen.json', dict(protocol=PROTOCOL, phase=phase, dataset_sha256=DATASET_SHA,
        status='success', versions=versions(), code_pins=code_pins(), source_pins=data.source_pins(),
        elapsed_seconds=result['elapsed_seconds'], artifacts=inventory(output), **FLAGS))


def validate_development(development):
    development = runtime._validate_output_path(development, ROOT)
    frozen = read(development/'frozen.json')
    required = dict(protocol=PROTOCOL, phase='development', dataset_sha256=DATASET_SHA, status='success',
                    versions=versions(), code_pins=code_pins(), source_pins=data.source_pins(), **FLAGS)
    if any(frozen.get(k) != v for k,v in required.items()) or frozen['artifacts'] != inventory(development):
        raise ValueError('Frozen development inventory/source/runtime changed')
    elapsed = frozen['elapsed_seconds']
    if not math.isfinite(elapsed) or not 0 < elapsed < 900:
        raise ValueError('Invalid elapsed development budget')
    verify_claim('development', development)
    phase = read(development/'development.result.json')
    if phase['status'] != 'success' or phase['elapsed_seconds'] != elapsed:
        raise ValueError('Native phase receipt mismatch')
    ledger = read(development/'ledger.json')
    proof = runtime.FitLedger(fit_ids())
    if ledger.get('expected_ids') != fit_ids() or set(ledger['results']) != set(fit_ids()):
        raise ValueError('Fit ledger changed')
    for ident in fit_ids():
        receipt = read(development/(ident+'.result.json'))
        if receipt != ledger['results'][ident] or receipt.get('status') != 'success':
            raise ValueError('Incomplete/failed native fits')
        proof.record(ident, receipt)
    if ledger != proof.seal():
        raise ValueError('Unsealed fit ledger')
    selection = read(development/'selection.json')
    if selection['choices'] != select(selection['records']):
        raise ValueError('Selection changed')
    for family in FAMILIES:
        ident = 'final-'+family
        receipt = read(development/(ident+'.receipt.json'))
        if (receipt['spec'] != selection['choices'][family] or receipt['train_rows'] != 240 or
            receipt['evaluated_rows'] != 0 or receipt['model_sha256'] != sha(development/(ident+'.joblib')) or
            receipt['features'] != list(FEATURES) or receipt['labels'] != list(LABELS)):
            raise ValueError('Final model scope/hash mismatch')
    return development, frozen, selection


def score(truth, predicted, classes):
    p, r, f1, support = precision_recall_fscore_support(truth, predicted, labels=classes, zero_division=0)
    return dict(accuracy=float(accuracy_score(truth,predicted)), macro_f1=float(f1.mean()),
        per_class={label:dict(precision=float(p[i]), recall=float(r[i]), f1=float(f1[i]), support=int(support[i]))
                   for i,label in enumerate(classes)}, confusion_matrix=confusion_matrix(truth,predicted,labels=classes).tolist())


def metrics(rows, predicted, bootstrap_samples=500):
    if set(predicted) != set(FAMILIES) or not rows or len({r['group_id'] for r in rows}) != len(rows):
        raise ValueError('Evaluation requires paired primary families')
    truth = [r['label'] for r in rows]
    if set(truth) != set(LABELS):
        raise ValueError('Missing evaluation class')
    if not isinstance(bootstrap_samples, int) or bootstrap_samples < 1:
        raise ValueError('Invalid bootstrap budget')
    model_results = {}
    binary_truth = ['Normal' if label=='Normal' else 'Risk' for label in truth]
    binary = {'rules':score(binary_truth, ['Risk' if float(r['reorder_distance']) <= 0 else 'Normal' for r in rows], ['Normal','Risk'])}
    for family in FAMILIES:
        result = predicted[family]
        validate_predictions(result, len(rows))
        labels = result['labels']
        model_results[family] = dict(score(truth, labels, list(LABELS)),
            critical_as_normal=sum(t==LABELS[2] and p==LABELS[0] for t,p in zip(truth,labels)),
            false_alerts=sum(t==LABELS[0] and p!=LABELS[0] for t,p in zip(truth,labels)))
        binary[family] = score(binary_truth, ['Normal' if p=='Normal' else 'Risk' for p in labels], ['Normal','Risk'])
    rng = np.random.default_rng(44)
    arrays = {family:dict(accuracy=[],macro_f1=[]) for family in FAMILIES}
    indices = []
    for _ in range(bootstrap_samples):
        sample = rng.integers(0,len(rows),len(rows)).tolist()
        indices.append(sample)
        y = [truth[i] for i in sample]
        for family in FAMILIES:
            p = [predicted[family]['labels'][i] for i in sample]
            s = score(y,p,list(LABELS))
            for name in ('accuracy','macro_f1'):
                arrays[family][name].append(s[name])
    for family in FAMILIES:
        model_results[family]['conditional_95_percent_intervals'] = {
            key:np.percentile(values,[2.5,97.5]).tolist() for key,values in arrays[family].items()}
    return dict(protocol=PROTOCOL, dataset_sha256=DATASET_SHA, label_order=list(LABELS), features=list(FEATURES),
        observations=len(rows), models=model_results, binary_risk_comparison=binary,
        all_normal_reference=score(truth, [LABELS[0]]*len(rows), list(LABELS)),
        paired_bootstrap=dict(seed=44, samples=bootstrap_samples, indices=indices, scores=arrays),
        limitations=LIMITATIONS, **FLAGS)


def evaluate(source, output, development):
    development, frozen, selection = validate_development(development)
    verify_claim('evaluation', output)  # Must exist before the first test observation read.
    rows, _ = load_partition(source, 'test')
    predicted = {}
    with threadpool_limits(limits=2):
        for family in FAMILIES:
            model = joblib.load(development/('final-'+family+'.joblib'))
            if model.get_params() != estimator(selection['choices'][family]).get_params():
                raise ValueError('Loaded model parameters differ')
            predicted[family] = predictions(model, matrix(rows))
    packet = dict(rows=[dict(sample_id=r['sample_id'],group_id=r['group_id']) for r in rows],
                  label_order=list(LABELS), predictions=predicted, development_frozen_sha256=sha(development/'frozen.json'))
    write(output/'predictions.json', packet)
    # This exclusive hash receipt precedes every test metric, including references.
    write(output/'predictions-frozen.json', dict(sha256=sha(output/'predictions.json'),
        models={family:sha(development/('final-'+family+'.joblib')) for family in FAMILIES}))
    write(output/'metrics.json', metrics(rows, predicted))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('develop','evaluate'):
        item = sub.add_parser(name)
        item.add_argument('--source', type=Path, default=SOURCE)
        item.add_argument('--output', type=Path, required=True)
        if name=='evaluate':
            item.add_argument('--development', type=Path, required=True)
    item = sub.add_parser('_fit', help=argparse.SUPPRESS)
    item.add_argument('--job', type=Path, required=True)
    item = sub.add_parser('_phase', help=argparse.SUPPRESS)
    item.add_argument('--phase', choices=['develop','evaluate'], required=True)
    item.add_argument('--source', type=Path, required=True)
    item.add_argument('--output', type=Path, required=True)
    item.add_argument('--development', type=Path)
    args = parser.parse_args(argv)
    if args.command in ('_fit','_phase'):
        runtime.require_supervised_worker()
        if args.command=='_fit':
            fit_worker(args.job)
        elif args.phase=='develop':
            verify_claim('development', args.output)
            develop(args.source, args.output, runtime.ResourceSupervisor(args.output, limits()))
        else:
            evaluate(args.source, args.output, args.development)
        return
    source_metadata(args.source)  # Source/split metadata only; no test observations.
    seconds, output_bytes = 900, limits().max_output_bytes
    if args.command=='evaluate':
        development, frozen, _ = validate_development(args.development)
        seconds -= frozen['elapsed_seconds']
        output_bytes -= runtime._output_bytes(development)
    output = runtime.create_run_directory(args.output, ROOT)
    supervisor = runtime.ResourceSupervisor(output, limits(seconds,output_bytes))
    supervisor.preflight()
    phase = 'development' if args.command=='develop' else 'evaluation'
    claim(phase, output)  # No fitting/test release before successful admission.
    write(output/'invocation.json', dict(phase=phase, source=str(args.source.resolve()),
        limits=vars(limits(seconds,output_bytes)), versions=versions(), code_pins=code_pins(),
        source_pins=data.source_pins(), **FLAGS))
    command = [sys.executable, str(Path(__file__).resolve()), '_phase','--phase',args.command,
               '--source', str(args.source.resolve()), '--output', str(output)]
    if args.command=='evaluate':
        command += ['--development',str(development)]
    result = supervisor.run(command, fit_id=phase, cwd=ROOT, enforce_fit_timeout=False)
    if result['status'] != 'success':
        raise runtime.RuntimeSafetyError(f'{phase} failed: {result["reason"]}; preserve this attempt')
    supervisor.preflight(required_available_bytes=0)
    freeze(output, phase, result)
    if args.command=='evaluate' and runtime._output_bytes(output)+runtime._output_bytes(development) > limits().max_output_bytes:
        raise runtime.RuntimeSafetyError('Combined output limit exceeded')
    print(json.dumps(dict(phase=phase,status='success',output=str(output),elapsed_seconds=result['elapsed_seconds'],**FLAGS)))


if __name__=='__main__':
    main()
