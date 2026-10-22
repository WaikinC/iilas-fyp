"""Sealed, offline test evaluation. Never trains or activates a model.

Optional PackageDamage export ingestion is scoring only: acquiring a checkpoint
and performing separately authorized supervised inference remain future work.
"""
import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import random
import sys
import parcel_train as train
import runner_runtime as runtime

CLASSES = ('Normal', 'Damaged')
CHECKPOINT = '84c9b943672e676f32c97dc36a81aae8766bdd96646e1b5e552de17aebca289c'
BASE_SETTINGS = dict(imgsz=640, conf=.25, iou=.7, max_det=300, batch=1,
                     device='cpu', half=False, threads=1, seed=0, rect=False, augment=False)
KNOWN_BASELINE_SOURCES = ('nani-tmzf6/package-detection-5ozpr',
                          'roboflow-ngkro/package-detection-e1ssd')


def detection_summary(detections):
    if not isinstance(detections, list) or len(detections) > BASE_SETTINGS['max_det']:
        raise ValueError('Invalid raw detection records')
    labels = set()
    for d in detections:
        if not isinstance(d, dict): raise ValueError('Invalid raw detection')
        class_id = d.get('class_id')
        name = {0: 'Damaged', 1: 'Normal'}.get(class_id) if type(class_id) is int else None
        confidence, box = d.get('confidence'), d.get('bbox')
        if name is None or d.get('class_name') != name:
            raise ValueError('Baseline detector class mapping mismatch')
        if (type(confidence) not in (int, float) or not math.isfinite(confidence)
                or not .25 <= confidence <= 1 or not isinstance(box, list) or len(box) != 4
                or any(type(v) not in (int, float) or not math.isfinite(v) or v < 0 for v in box)
                or box[2] <= box[0] or box[3] <= box[1]):
            raise ValueError('Invalid detection confidence or pixel xyxy bbox')
        labels.add(name)
    return 'No detection' if not labels else 'Mixed' if len(labels) > 1 else next(iter(labels))


def known_baseline_source(value):
    value = str(value).lower().replace('\\', '/').replace('_', '-').replace(' ', '-')
    return any(token in value for token in ('nani-tmzf6', 'package-detection-5ozpr',
                                           'roboflow-ngkro', 'package-detection-e1ssd'))


def decide(scores):
    if (not isinstance(scores, list) or len(scores) != 2
            or any(not isinstance(x, (int, float)) or isinstance(x, bool) or not math.isfinite(x) or not 0 <= x <= 1 for x in scores)
            or abs(sum(scores)-1) > 1e-5):
        raise ValueError('Invalid two-class probability shape/range')
    return None if scores[0] == scores[1] else CLASSES[int(scores[1] > scores[0])]


def validate_rows(rows, *, benchmark_context=None):
    if not rows or {r['label'] for r in rows} != set(CLASSES):
        raise ValueError('Both test classes required')
    if len({r['sample_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate targets')
    publisher = bool(benchmark_context)
    if publisher and (benchmark_context.get('benchmark_profile') != 'publisher_packaging_development'
                      or benchmark_context.get('evaluation_scope') != 'development_only'
                      or benchmark_context.get('grouping_basis') != 'publisher_item_identifier'):
        raise ValueError('Invalid publisher evaluation context')
    if publisher and any(r.get('label_status') != 'publisher' or r.get('group_status') != 'publisher_item'
                         or r.get('role') != 'query_crop' for r in rows):
        raise ValueError('Publisher evaluation provenance required')
    if any(r.get('target_status') != ('packaging' if publisher else 'single_principal') for r in rows):
        raise ValueError('Unresolved target association')


def validate_raw(rows, raw):
    if len(raw) != len(rows) or {r['sample_id'] for r in raw} != {r['sample_id'] for r in rows}:
        raise ValueError('Incomplete, duplicate or foreign predictions')
    indexed = {r['sample_id']: r for r in raw}
    result = []
    for row in rows:
        record = indexed[row['sample_id']]
        if record.get('image_sha256') != row['image_sha256']:
            raise ValueError('Changed image hash')
        result.append(decide(record['probabilities']))
    return result


def ratio(n, d):
    return dict(value=n/d if d else None, numerator=n, denominator=d)


def metrics(rows, predictions, equal_parcel=False, conditional=False):
    if len(rows) != len(predictions) or any(p not in (*CLASSES, None) for p in predictions):
        raise ValueError('Invalid prediction cohort')
    counts = {}
    for row in rows:
        group = row.get('_group_id', row.get('group_id'))
        counts[group] = counts.get(group, 0)+1
    weights = [1/counts[r.get('_group_id', r.get('group_id'))] if equal_parcel else 1 for r in rows]
    active = [(r, p, w) for r, p, w in zip(rows, predictions, weights) if not conditional or p is not None]
    total = sum(w for _, _, w in active)
    classes = {}
    for label in CLASSES:
        tp = sum(w for r, p, w in active if r['label'] == p == label)
        fp = sum(w for r, p, w in active if r['label'] != label and p == label)
        fn = sum(w for r, p, w in active if r['label'] == label and p != label)
        classes[label] = dict(precision=ratio(tp, tp+fp), recall=ratio(tp, tp+fn), f1=ratio(2*tp, 2*tp+fp+fn))
    f1 = [classes[c]['f1']['value'] for c in CLASSES]
    result = dict(accuracy=ratio(sum(w for r, p, w in active if r['label'] == p), total), classes=classes,
                  macro_f1=sum(f1)/2 if all(v is not None for v in f1) else None,
                  confusion=[[sum(w for r, p, w in active if r['label'] == c and p == v) for v in (*CLASSES, None)] for c in CLASSES],
                  confusion_columns=[*CLASSES, 'Abstain'], abstentions=sum(p is None for p in predictions),
                  coverage=ratio(sum(w for p, w in zip(predictions, weights) if p is not None), sum(weights)))
    if not conditional:
        result['conditional'] = metrics(rows, predictions, equal_parcel, True)
    return result


def bootstrap(rows, left, right, *, benchmark_context=None):
    groups = {}
    for i, r in enumerate(rows): groups.setdefault(r.get('_group_id', r.get('group_id')), []).append(i)
    support = {c: len({r.get('_group_id', r.get('group_id')) for r in rows if r['label'] == c}) for c in CLASSES}
    if min(support.values()) < 5:
        return dict(status='insufficient support', groups_per_class=support, replicates=0)
    rng = random.Random(42)
    keys = sorted(groups)
    differences = []
    for _ in range(2000):
        sampled = [rng.choice(keys) for _ in keys]
        delta = []
        for group in sampled:
            ids = groups[group]
            delta.append(sum((left[i] == rows[i]['label'])-(right[i] == rows[i]['label']) for i in ids)/len(ids))
        differences.append(sum(delta)/len(delta))
    differences.sort()
    unit = 'connected-source-item-group' if benchmark_context else 'parcel'
    return dict(status='complete', estimand=f'paired equal-{unit} accuracy difference left minus right', seed=42,
                replicates=2000, interval95=[differences[49], differences[1949]], groups_per_class=support,
                small_group_warning=min(support.values()) < 20, degenerate=differences[0] == differences[-1])


def baseline(path, rows):
    limitations = 'Unknown upstream training overlap remains; upstream licensing requires separate review before integration.'
    if path is None:
        return dict(status='Not run', limitations=limitations, reason='No separately authorized supervised raw export supplied')
    validate_rows(rows)  # Existing detector association requires single-principal targets.
    export = train.read_sealed(path)
    if (export.get('checkpoint_sha256') != CHECKPOINT or train.digest(export.get('settings')) != train.digest(BASE_SETTINGS)
            or export.get('class_order') != list(CLASSES) or export.get('status') != 'complete'
            or not export.get('authorization_evidence') or not export.get('supervisor_evidence')
            or export.get('known_training_source_exclusion') is not True):
        raise ValueError('Invalid separately authorized baseline provenance/settings')
    association = train.read_sealed(export['pre_output_associations']['path'])
    if runtime.sha256_file(export['pre_output_associations']['path']) != export['pre_output_associations']['sha256']:
        raise ValueError('Changed pre-output associations')
    expected = [dict(sample_id=r['sample_id'], image_sha256=r['image_sha256'], target_status='single_principal', source_id=r['source_id']) for r in rows]
    if association.get('targets') != expected or not association.get('recorded_before_outputs'):
        raise ValueError('Missing pre-output target association')
    try:
        before = datetime.fromisoformat(association['recorded_at_utc'])
        after = datetime.fromisoformat(export['inference_started_at_utc'])
        if before.utcoffset() is None or after.utcoffset() is None or before >= after:
            raise ValueError('Association must precede inference')
    except (KeyError, TypeError) as error:
        raise ValueError('Missing association chronology') from error
    excluded = export.get('known_training_sources')
    if (not isinstance(excluded, list) or any(not isinstance(v, str) for v in excluded)
            or not set(KNOWN_BASELINE_SOURCES).issubset(excluded)
            or not export.get('training_source_review_evidence')):
        raise ValueError('Explicit known upstream training-source review required')
    if any(any(s in excluded or known_baseline_source(s)
               for s in (r['source_id'], *r.get('source_ancestor_ids', []))) for r in rows):
        raise ValueError('Known baseline training source/derivative overlaps cohort')
    outputs = export.get('predictions', [])
    if len(outputs) != len(rows) or {r['sample_id'] for r in outputs} != {r['sample_id'] for r in rows}:
        raise ValueError('Incomplete baseline cohort')
    lookup = {r['sample_id']: r for r in outputs}
    predictions = []
    for r in rows:
        entry = lookup[r['sample_id']]
        if entry.get('image_sha256') != r['image_sha256']:
            raise ValueError('Invalid baseline output')
        summary = detection_summary(entry.get('detections'))
        if 'summary' in entry and entry['summary'] != summary:
            raise ValueError('Export summary differs from frozen raw detection rule')
        predictions.append(summary if summary in CLASSES else None)
    return dict(status='complete', limitations=limitations, predictions=predictions,
                image_weighted=metrics(rows, predictions), equal_parcel_weighted=metrics(rows, predictions, True))


def verify_selection(path, manifest):
    selection = train.read_sealed(path)
    if selection.get('status') != 'complete' or selection.get('class_order') != list(CLASSES) or selection.get('decision') != 'argmax-exact-tie-abstains':
        raise ValueError('Incomplete or incompatible selection')
    train.verify_binding(selection['binding'])
    key = selection.get('development_key', '')
    if len(key) != 64 or any(c not in '0123456789abcdef' for c in key):
        raise ValueError('Invalid development identity')
    if runtime.sha256_file(manifest) != selection['binding']['manifest']['sha256']:
        raise ValueError('Foreign manifest')
    train.validate_fit_set(selection['all_fits'])
    expected = [train.choose_variant([r for r in selection['all_fits'] if r['architecture'] == name]) for name in train.ARCHITECTURES]
    if selection['selected'] != expected:
        raise ValueError('Unselected or foreign model')
    for fit in expected:
        runtime._validate_output_path(fit['artifact'])
        if runtime.sha256_file(fit['artifact']) != fit['artifact_sha256']:
            raise ValueError('Changed model artifact')
    from parcel_manifest import benchmark_context
    data = train.load_frozen(manifest)
    if data.get('schema_version') == 2:
        expected_context = benchmark_context(data)
        if (selection.get('benchmark_context') != expected_context
                or selection['binding'].get('benchmark_context') != expected_context):
            raise ValueError('Selection benchmark context mismatch')
        if train.experiment_identity(data, selection['binding']) != key:
            raise ValueError('Selection development identity mismatch')
    elif 'benchmark_context' in selection or 'benchmark_context' in selection['binding']:
        raise ValueError('Foreign benchmark context for reviewed parcel profile')
    complete = train.ROOT / 'research/datasets/parcel-run-registry' / ('develop-'+selection['development_key']) / 'completed.json'
    if json.loads(complete.read_text())['selection_sha256'] != runtime.sha256_file(path):
        raise ValueError('Development not completed with this selection')
    return selection


def test(selection_path, manifest, output, baseline_export=None):
    selection = verify_selection(selection_path, manifest)
    rows = [r for r in train.load_frozen(manifest)['rows'] if r['split'] == 'test']
    validate_rows(rows, benchmark_context=selection.get('benchmark_context'))
    out = runtime.create_run_directory(output)
    supervisor = runtime.ResourceSupervisor(out, train.phase_limits(test=True))
    supervisor.preflight()
    claim = train.claim_phase(selection['development_key'], 'test', dict(output=str(out), selection_sha256=runtime.sha256_file(selection_path)))
    try:
        train.write_sealed(out/'test-run.json', dict(selection=str(Path(selection_path).resolve()), manifest=str(Path(manifest).resolve()), baseline_export=str(Path(baseline_export).resolve()) if baseline_export else None))
        result = supervisor.run([sys.executable, str(Path(__file__).resolve()), '_phase', '--output', str(out)], fit_id='test-phase', cwd=train.ROOT, enforce_fit_timeout=False)
        if result['status'] != 'success' or not (out/'report.json').is_file():
            raise ValueError('Test incomplete: '+str(result.get('reason')))
        train.finish_claim(claim, 'completed', dict(report_sha256=runtime.sha256_file(out/'report.json')))
    except Exception as error:
        train.finish_claim(claim, 'failed', dict(reason=str(error), raw_evidence='incomplete; do not score subsets or automatically rerun'))
        raise
    return out/'report.json'


def context(out):
    run = train.read_sealed(out/'test-run.json')
    selection = verify_selection(run['selection'], run['manifest'])
    rows = [r for r in train.load_frozen(run['manifest'])['rows'] if r['split'] == 'test']
    validate_rows(rows, benchmark_context=selection.get('benchmark_context'))
    # This context is used only after the durable test claim, inside the
    # supervised phase/workers. Verify all originals before loading a model.
    for row in rows:
        runtime._validate_output_path(row['_image_path'])
        if runtime.sha256_file(row['_image_path']) != row['image_sha256']:
            raise ValueError('Changed original test image')
    return run, selection, rows


def _phase(out):
    runtime.require_supervised_worker()
    _, selection, _ = context(out)
    supervisor = runtime.ResourceSupervisor(out, train.phase_limits(test=True))
    for fit in selection['selected']:
        result = supervisor.run([sys.executable, str(Path(__file__).resolve()), '_infer', '--output', str(out), '--architecture', fit['architecture']], fit_id=fit['architecture'], cwd=train.ROOT)
        if result['status'] != 'success': raise ValueError('Inference incomplete; no replacement worker')
    result = supervisor.run([sys.executable, str(Path(__file__).resolve()), '_score', '--output', str(out)], fit_id='scoring', cwd=train.ROOT)
    if result['status'] != 'success': raise ValueError('Scoring incomplete')


def _infer(out, architecture):
    runtime.require_supervised_worker()
    _, selection, rows = context(out)
    fits = [f for f in selection['selected'] if f['architecture'] == architecture]
    if len(fits) != 1: raise ValueError('Unselected architecture')
    fit = fits[0]
    train.worker_environment(out)
    import numpy as np
    import tensorflow as tf
    from parcel_inputs import prepare_image
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    model = tf.keras.models.load_model(fit['artifact'], compile=False, safe_mode=True)
    if model.output_shape != (None, 2) or model.input_shape != (None, 224, 224, 3):
        raise ValueError('Invalid model shape')
    raw = []
    for row in rows:
        x = prepare_image(train.read_image(row, allowed=('test',)), fit['contrast'])
        scores = model(np.expand_dims(x, 0), training=False).numpy()[0].tolist()
        decide(scores)
        record = dict(sample_id=row['sample_id'], image_sha256=row['image_sha256'], probabilities=scores)
        # Flush each original result before scoring; failure leaves explicit partial evidence.
        with (out/(architecture+'-partial.jsonl')).open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(record, allow_nan=False)+'\n')
        raw.append(record)
    train.write_sealed(out/(architecture+'-raw.json'), dict(status='complete', artifact_sha256=fit['artifact_sha256'], predictions=raw))


def _score(out):
    runtime.require_supervised_worker()
    run, selection, rows = context(out)
    train.worker_environment(out)
    results, predictions = {}, {}
    for fit in selection['selected']:
        name = fit['architecture']
        raw = train.read_sealed(out/(name+'-raw.json'))
        if raw.get('status') != 'complete' or raw.get('artifact_sha256') != fit['artifact_sha256']:
            raise ValueError('Incomplete raw evidence')
        p = validate_raw(rows, raw['predictions'])
        predictions[name] = p
        results[name] = dict(image_weighted=metrics(rows, p), equal_parcel_weighted=metrics(rows, p, True))
    reference = baseline(run['baseline_export'], rows)
    benchmark_context = selection.get('benchmark_context')
    comparison = bootstrap(rows, predictions['mobilenetv2'], predictions['efficientnetb0'],
                           benchmark_context=benchmark_context)
    if reference['status'] == 'complete':
        reference['paired_bootstrap'] = bootstrap(rows, predictions['mobilenetv2'], reference.pop('predictions'),
                                                benchmark_context=benchmark_context)
    train.write_sealed(out/'report.json', dict(status='complete', class_order=list(CLASSES), confidence='uncalibrated',
        **({'benchmark_context': benchmark_context} if benchmark_context else {}),
        models=results, paired_bootstrap=comparison, PackageDamage=reference,
        groups_per_class={c: len({r['_group_id'] for r in rows if r['label'] == c}) for c in CLASSES}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('test', '_phase', '_infer', '_score'))
    parser.add_argument('--selection', type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline-export', type=Path)
    parser.add_argument('--architecture')
    args = parser.parse_args()
    if args.command == 'test':
        if args.selection is None or args.manifest is None: parser.error('--selection and --manifest required')
        print(test(args.selection, args.manifest, args.output, args.baseline_export))
    elif args.command == '_phase': _phase(args.output)
    elif args.command == '_infer': _infer(args.output, args.architecture)
    else: _score(args.output)


if __name__ == '__main__': main()
