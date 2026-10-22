"""Once-only crop internal test evaluation; never grants operational approval.

Pure scoring helpers import only the standard library. Worker/controller code
imports the closed intake/runtime separately; no training entry point exists.
"""
from collections import Counter, defaultdict
import copy
from dataclasses import replace
import json
import math
from numbers import Real
import os
from pathlib import Path
import random
import re
import sys
import time

import parcel_train as base
import runner_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]
MiB = 1024**2

CLASS_ORDER = ('Normal', 'Damaged')
MODEL_ORDER = ('mobilenetv2', 'efficientnetb0')
ASSOCIATION_FIELDS = ('sample_id', 'capture_id', 'item_identifier', 'dependency_group_id',
                      'label', 'image_sha256', 'decoded_sha256')


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_probabilities(vector):
    """Validate an uncalibrated Normal/Damaged vector without coercing strings/bools."""
    _require(isinstance(vector, (list, tuple)) and len(vector) == 2,
             'Two-class probability vector required')
    _require(all(isinstance(p, Real) and not isinstance(p, bool)
                 and math.isfinite(p) and 0 <= p <= 1 for p in vector),
             'Finite numeric probabilities in [0,1] required')
    _require(math.isclose(sum(vector), 1., rel_tol=0, abs_tol=1e-5),
             'Class probabilities must sum to one within 1e-5')
    return tuple(float(p) for p in vector)


def decision(vector):
    normal, damaged = validate_probabilities(vector)
    return 'Abstain' if normal == damaged else CLASS_ORDER[int(damaged > normal)]


def component_weights(rows):
    _require(isinstance(rows, list) and bool(rows), 'Nonempty test cohort required')
    _require(all(isinstance(r, dict) for r in rows), 'Test row objects required')
    _require(len({r.get('sample_id') for r in rows}) == len(rows)
             and all(isinstance(r.get('sample_id'), str) and r['sample_id'] for r in rows),
             'Unique test sample identities required')
    _require(len({r.get('split') for r in rows}) == 1
             and rows[0].get('split') in ('test', 'internal_test'), 'Single test partition required')
    _require(all(isinstance(r.get('dependency_group_id'), str) and r['dependency_group_id']
                 and r.get('label') in CLASS_ORDER for r in rows), 'Dependency component/publisher label required')
    sizes = Counter(r['dependency_group_id'] for r in rows)
    return [len(rows)/(len(sizes)*sizes[r['dependency_group_id']]) for r in rows]


def _metrics(rows, probabilities, weights):
    confusion = [[0., 0., 0.], [0., 0., 0.]]
    nll = 0.
    for row, vector, weight in zip(rows, probabilities, weights):
        truth = CLASS_ORDER.index(row['label'])
        predicted = decision(vector)
        confusion[truth][2 if predicted == 'Abstain' else CLASS_ORDER.index(predicted)] += weight
        nll -= weight*math.log(max(1e-7, vector[truth]))
    per_class = {}
    for index, name in enumerate(CLASS_ORDER):
        tp = confusion[index][index]
        fp = confusion[1-index][index]
        fn = sum(confusion[index])-tp
        per_class[name] = dict(precision=tp/(tp+fp) if tp+fp else None,
            recall=tp/(tp+fn) if tp+fn else None,
            f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else 0.,
            true_positive_weight=tp, false_positive_weight=fp, false_negative_weight=fn,
            support_weight=tp+fn, predicted_weight=tp+fp)
    total = sum(weights)
    abstention = sum(r[2] for r in confusion)
    return dict(confusion=confusion, confusion_rows=list(CLASS_ORDER),
        confusion_columns=[*CLASS_ORDER, 'Abstain'],
        accuracy=(confusion[0][0]+confusion[1][1])/total,
        macro_f1=sum(r['f1'] for r in per_class.values())/2,
        nll=nll/total, coverage=(total-abstention)/total, abstention_weight=abstention,
        total_weight=total, per_class=per_class, undefined_precision_recall=None,
        zero_division_f1=0, abstentions_count_as_misses=True, nll_floor=1e-7)


def _validated_scores(rows, probabilities):
    _require(isinstance(probabilities, (list, tuple)) and len(probabilities) == len(rows),
             'Complete probability count required')
    return [validate_probabilities(vector) for vector in probabilities]


def compute_metrics(rows, probabilities):
    weights = component_weights(rows)
    scores = _validated_scores(rows, probabilities)
    return dict(component_weighted=_metrics(rows, scores, weights),
                image_unweighted=_metrics(rows, scores, [1.]*len(rows)),
                predictions=[decision(vector) for vector in scores],
                confidence='uncalibrated')


def paired_component_bootstrap(rows, left, right):
    component_weights(rows)
    left, right = _validated_scores(rows, left), _validated_scores(rows, right)
    grouped = defaultdict(list)
    for row, a, b in zip(rows, left, right):
        grouped[row['dependency_group_id']].append(
            int(decision(a) == row['label'])-int(decision(b) == row['label']))
    support = {label: len({r['dependency_group_id'] for r in rows if r['label'] == label})
               for label in CLASS_ORDER}
    means = [sum(grouped[key])/len(grouped[key]) for key in sorted(grouped)]
    mixed = any(len({r['label'] for r in rows if r['dependency_group_id'] == key}) > 1 for key in grouped)
    result = dict(status='insufficient_support', unit='dependency_component',
        estimand='mean_dependency_component_correctness_difference',
        direction='mobilenetv2_minus_efficientnetb0', seed=42, replicates=0,
        dependency_components=len(grouped), components_with_class=support,
        class_support_counts_overlap=mixed, point_difference=sum(means)/len(means),
        interval_95=None, percentile_indices=[49, 1949], degenerate_interval=False,
        warnings=['fewer_than_20_components_per_class'] if min(support.values()) < 20 else [])
    if min(support.values()) < 5:
        return result
    rng = random.Random(42)
    replicates = sorted(sum(means[rng.randrange(len(means))] for _ in means)/len(means)
                        for _ in range(2000))
    interval = [replicates[49], replicates[1949]]
    result.update(status='complete', replicates=2000, interval_95=interval,
                  degenerate_interval=interval[0] == interval[1])
    if result['degenerate_interval']:
        result['warnings'].append('degenerate_interval')
    return result


def validate_raw_records(rows, records, model):
    component_weights(rows)
    _require(isinstance(model, dict) and model.get('architecture') in MODEL_ORDER
             and model.get('contrast') in ('none', 'clahe')
             and isinstance(model.get('artifact_sha256'), str)
             and len(model['artifact_sha256']) == 64
             and all(c in '0123456789abcdef' for c in model['artifact_sha256']), 'Exact model identity required')
    _require(isinstance(records, list) and len(records) == len(rows), 'Complete ordered raw records required')
    scores = []
    for index, (row, record) in enumerate(zip(rows, records)):
        _require(isinstance(record, dict) and type(record.get('row_index')) is int
                 and record['row_index'] == index, 'Raw order mismatch')
        for field in ASSOCIATION_FIELDS:
            _require(field in row and record.get(field) == row[field], 'Raw association mismatch: '+field)
        for field in ('architecture', 'artifact_sha256', 'contrast'):
            _require(record.get(field) == model[field], 'Raw model mismatch: '+field)
        vector = validate_probabilities(record.get('probabilities'))
        _require(record.get('decision') == decision(vector), 'Raw decision mismatch')
        scores.append(list(vector))
    return scores


def comparative_metrics(rows, left_records, right_records, models):
    component_weights(rows)
    _require({r['label'] for r in rows} == set(CLASS_ORDER), 'Both publisher classes required for comparison')
    _require(isinstance(models, list) and len(models) == 2
             and [m.get('architecture') for m in models] == list(MODEL_ORDER)
             and [m.get('contrast') for m in models] == ['clahe', 'none'], 'Frozen two-model comparison required')
    left = validate_raw_records(rows, left_records, models[0])
    right = validate_raw_records(rows, right_records, models[1])
    return dict(models={MODEL_ORDER[0]: compute_metrics(rows, left), MODEL_ORDER[1]: compute_metrics(rows, right)},
                always_normal=always_normal_reference(rows),
                paired_bootstrap=paired_component_bootstrap(rows, left, right),
                package_damage='previous_separate_frozen_reference_not_rerun',
                scope='conditional_cleaned_crop_internal_source_benchmark',
                operationally_approved=False)


def always_normal_reference(rows):
    """Predeclared trivial reference, with no model run or test-label selection."""
    return {**compute_metrics(rows, [[1., 0.] for _ in rows]),
            'rule': 'fixed_always_Normal', 'model_run': False}


def validate_model_shape(model):
    _require(model.input_shape == (None, 224, 224, 3) and model.output_shape == (None, 2),
             'Saved model must have one 224x224 RGB input and two-class output')


class RawPredictionWriter:
    """Exclusive fsynced journal; a failure leaves evidence and no complete seal."""
    def __init__(self, directory, rows, model, binding):
        component_weights(rows)
        self.directory = runtime._validate_output_path(directory)
        self.rows, self.model, self.binding = copy.deepcopy((rows, model, binding))
        self.records = []
        _require(not (self.directory/'raw.json').exists(), 'Complete raw output already exists')
        self.stream = (self.directory/'raw.partial.jsonl').open('x', encoding='utf-8', newline='\n')

    def append(self, row, probabilities):
        index = len(self.records)
        _require(not self.stream.closed and index < len(self.rows)
                 and row == self.rows[index], 'Raw input must follow exact admitted order')
        vector = list(validate_probabilities(probabilities))
        record = {field: row[field] for field in ASSOCIATION_FIELDS}
        record.update(row_index=index, **self.model, probabilities=vector, decision=decision(vector))
        # Validate the whole exact association before any durable append.
        validate_raw_records(self.rows[:index+1], self.records+[record], self.model)
        self.stream.write(json.dumps(record, sort_keys=True, allow_nan=False)+'\n')
        self.stream.flush()
        os.fsync(self.stream.fileno())
        self.records.append(record)

    def complete(self):
        _require(not self.stream.closed, 'Raw stream already closed')
        validate_raw_records(self.rows, self.records, self.model)
        self.close()
        path = self.directory/'raw.json'
        base.write_sealed(path, dict(status='complete', schema_version=1, model=self.model,
            binding=self.binding, class_order=list(CLASS_ORDER), confidence='uncalibrated',
            decision_rule='argmax-exact-tie-abstains', rows_sha256=base.digest(self.rows),
            records_sha256=base.digest(self.records), row_count=len(self.rows),
            journal_sha256=runtime.sha256_file(self.directory/'raw.partial.jsonl'), records=self.records))
        return path

    def close(self):
        if not self.stream.closed:
            self.stream.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def load_raw_predictions(path, rows, model, binding):
    import kaputt_crop_test_intake as intake
    path = intake._metadata_path(path)
    _require(path.name == 'raw.json', 'Complete raw artifact required')
    doc = intake._sealed(path)
    journal = intake.provenance._local(path.parent/'raw.partial.jsonl', datasets_only=True)
    _require(journal.is_file() and journal.stat().st_size <= 4*1024**2, 'Bounded raw journal required')
    _require(doc.get('status') == 'complete' and doc.get('schema_version') == 1
             and doc.get('model') == model and doc.get('binding') == binding
             and doc.get('class_order') == list(CLASS_ORDER) and doc.get('confidence') == 'uncalibrated'
             and doc.get('decision_rule') == 'argmax-exact-tie-abstains'
             and doc.get('rows_sha256') == base.digest(rows) and doc.get('row_count') == len(rows)
             and doc.get('journal_sha256') == runtime.sha256_file(journal), 'Changed complete raw provenance')
    records = doc.get('records')
    _require(doc.get('records_sha256') == base.digest(records), 'Changed raw record digest')
    # Exact canonical journal bytes avoid a second permissive JSON parser.
    canonical = ''.join(json.dumps(record, sort_keys=True, allow_nan=False)+'\n' for record in records)
    _require(journal.read_bytes() == canonical.encode('utf-8'), 'Raw journal/complete association mismatch')
    validate_raw_records(rows, records, model)
    return records


def _intake():
    import kaputt_crop_test_intake
    return kaputt_crop_test_intake


def limits(stage):
    value = runtime.Limits(max_wall_seconds=180, max_fit_seconds=180,
        max_rss_bytes=512*MiB, min_available_bytes=3072*MiB,
        min_free_disk_bytes=20*1024**3, max_output_bytes=512*MiB,
        available_floor_bytes=768*MiB, threads=1)
    _require(stage in ('reference','acquire','infer','score','evaluate','attempt'), 'Unknown evaluation stage')
    seconds = {'reference':180,'acquire':1800,'infer':300,'score':120,'evaluate':1200,'attempt':3300}[stage]
    return replace(value, max_wall_seconds=seconds, max_fit_seconds=seconds,
                   max_rss_bytes=(512 if stage in ('reference','acquire') else 2048)*MiB)


def resource_settings():
    return {stage:vars(limits(stage)) for stage in ('reference','acquire','infer','score','evaluate','attempt')}


def code_bindings():
    return {**_intake().code_bindings(), Path(__file__).name:runtime.sha256_file(__file__)}


def worker_command(command, output, architecture=None, stage=None):
    result = [sys.executable, str(Path(__file__).resolve()), command, '--output', str(Path(output).absolute())]
    if architecture is not None:
        result += ['--architecture', architecture]
    if stage is not None:
        result += ['--stage', stage]
    return result


def load_evaluation_protocol(path, output):
    intake = _intake()
    doc = intake._json(path)
    expected = dict(schema_version=1, profile=intake.PROFILE, evaluation_scope='development_only',
        input_scope='crop_only', operationally_approved=False, seed=42, class_order=list(CLASS_ORDER),
        preprocessing='rgb-letterbox224-v1', confidence='uncalibrated', decision_rule='argmax-exact-tie-abstains',
        comparison=[{'architecture':'mobilenetv2','contrast':'clahe'}, {'architecture':'efficientnetb0','contrast':'none'}],
        metrics={'weighting':'equal_dependency_component_mean1','nll_floor':1e-7,
                 'abstentions_count_as_misses':True,'undefined_precision_recall':None,'zero_division_f1':0,
                 'always_normal_reference':True},
        bootstrap={'unit':'dependency_component','seed':42,'replicates':2000,'percentile_indices':[49,1949],
                   'minimum_components_per_class':5,'small_group_warning_below':20,
                   'direction':'mobilenetv2_minus_efficientnetb0'}, resources=resource_settings(),
        sources=code_bindings(), environment=base.environment(),
        reference_command=worker_command('_reference', output),
        acquisition_command=worker_command('_acquire', output), policy_sha256=intake.POLICY_SHA256)
    _require(isinstance(doc, dict) and set(doc) == set(expected)|{'policy','development','negative_candidate'},
             'Complete closed prospective evaluation protocol required')
    for key, value in expected.items():
        _require(base.digest(doc.get(key)) == base.digest(value), 'Changed prospective setting: '+key)
    _require(isinstance(doc['policy'], dict) and base.digest(doc['policy']) == intake.POLICY_SHA256,
             'Entire frozen technical/dependency policy required')
    return doc


def claim_paths(key):
    _require(isinstance(key, str) and re.fullmatch('[0-9a-f]{64}', key), 'Original development identity required')
    return tuple(ROOT/'research/datasets'/registry/('test-'+key)
                 for registry in ('kaputt-crop-test-registry','kaputt-crop-run-registry'))


def deny_existing_test_claim(key):
    canonical, historical = claim_paths(key)
    for path in (canonical, historical):
        runtime._validate_output_path(path)
        _require(not path.exists(), 'Internal test already claimed; replacement forbidden')
    return canonical


def create_test_claim(key, output, core):
    canonical, historical = claim_paths(key)
    # Check both spellings first; never derive identity from paths/protocol/code.
    _require(not canonical.exists() and not historical.exists(), 'Internal test already claimed; replacement forbidden')
    canonical = runtime._validate_output_path(canonical)
    runtime._validate_output_path(historical)
    canonical.parent.mkdir(parents=True, exist_ok=True)
    canonical.mkdir(exist_ok=False)
    runtime.write_json_exclusive(canonical/'started.json',
        dict(key=key, phase='test', output=str(Path(output).absolute()), binding_sha256=base.digest(core)))
    return canonical


def independent_graph_audit(doc, reference):
    """Recompute edges and closures using adjacency/BFS, independently of union-find."""
    nodes = {r['capture_id']:r for r in reference['rows']}
    tests = {r['capture_id']:r for r in doc['audits']}
    _require(not set(nodes)&set(tests), 'Foreign duplicate graph node')
    nodes.update(tests)
    edges = {tuple(sorted((e['a'], e['b'])))+(e['reason'],) for e in reference['known_edges']}
    groups = defaultdict(list)
    for key,row in nodes.items():
        groups[row['item_identifier']].append(key)
    for values in groups.values():
        ordered = sorted(values)
        edges.update((ordered[0],key,'same_source_item') for key in ordered[1:])
    fingerprints = {r['capture_id']:r for r in reference['rows']}
    fingerprints.update({key:r['fingerprint'] for key,r in tests.items() if r['fingerprint'] is not None})
    keys = sorted(fingerprints)
    for index,a in enumerate(keys):
        first = fingerprints[a]
        for b in keys[index+1:]:
            second = fingerprints[b]
            if first['image_sha256'] == second['image_sha256']: edges.add((a,b,'encoded_sha256'))
            if first['decoded_sha256'] == second['decoded_sha256']: edges.add((a,b,'decoded_sha256'))
            if bin(int(first['dhash64'],16)^int(second['dhash64'],16)).count('1') <= 4:
                edges.add((a,b,'dhash4'))
    expected_edges = [dict(a=a,b=b,reason=reason) for a,b,reason in sorted(edges)]
    _require(doc['edges'] == expected_edges, 'Independent graph edge mismatch')
    adjacency = {key:set() for key in nodes}
    for a,b,_ in edges:
        _require(a in nodes and b in nodes and a != b, 'Foreign independent graph endpoint')
        adjacency[a].add(b); adjacency[b].add(a)
    visited = set(); dispositions = []; components = []
    for start in sorted(nodes):
        if start in visited: continue
        pending = [start]; component = set()
        while pending:
            key = pending.pop()
            if key in component: continue
            component.add(key); pending.extend(adjacency[key]-component)
        visited.update(component)
        members = sorted(component); selected = sorted(component&tests.keys())
        if not selected: continue
        items = sorted({nodes[key]['item_identifier'] for key in members})
        identifier = 'kaputt:test-dependency:'+base.digest(items)
        endpoints = sorted(key for key in members if nodes[key].get('endpoint') is not None)
        failures = sorted(key for key in selected if tests[key]['technical_reasons'])
        reasons = sorted({'touches_'+nodes[key]['endpoint'] for key in endpoints}
                         | ({'technical_failure'} if failures else set()))
        components.append(dict(dependency_group_id=identifier,capture_ids=members,source_items=items,
            test_capture_ids=selected,prohibited_endpoints=endpoints,technical_failures=failures,reasons=reasons))
        dispositions.extend(dict(capture_id=key,dependency_group_id=identifier,
            disposition='excluded' if reasons else 'included',reasons=reasons,
            prohibited_endpoints=endpoints,technical_failures=failures) for key in selected)
    dispositions.sort(key=lambda r:r['capture_id'])
    _require(doc['components'] == components and doc['dispositions'] == dispositions,
             'Independent graph closure/disposition mismatch')
    included = {r['capture_id'] for r in dispositions if r['disposition'] == 'included'}
    _require({r['capture_id'] for r in doc['rows']} == included and len(doc['rows']) == len(included),
             'Independent included-row mismatch')
    return dict(algorithm='independent-adjacency-bfs-v1', edges_sha256=base.digest(expected_edges),
        dispositions_sha256=base.digest(dispositions), components_sha256=base.digest(components),
        included_images=len(included), excluded_images=len(tests)-len(included),
        consulted_model_probabilities=False)


def _candidate_record(path):
    intake = _intake()
    path = Path(path)
    if path.suffix == '.json':
        return intake.metadata_record(path)
    _require(path.suffix == '.keras', 'Candidate proof must be JSON or saved model')
    path = intake.provenance._local(path,datasets_only=True)
    return dict(path=str(path),sha256=runtime.sha256_file(path))


def negative_candidate_snapshot(selection_path, context):
    """Preclaim only: reuse the complete existing verifier, then freeze its chain."""
    intake = _intake(); fine = intake.completed
    path = intake._metadata_path(selection_path); out = path.parent
    _require(path.name == 'selection.json','Completed negative candidate selection required')
    run = intake._sealed(out/'development.json')
    selection = fine.verify_selection(out,run)
    original = context['selection']
    _require(selection.get('candidate_selected') is False and selection['selected'] == original['selected']
             and run['binding']['baseline']['development_key'] == original['development_key'],
             'Completed negative candidate must retain the exact original comparison')
    fine.verify_resource(out/'development.result.json',fine.phase_limits(),fit=False)
    phase = dict(development_key=run['key'],binding_sha256=base.digest(run['binding']),
        resource_result_sha256=runtime.sha256_file(out/'development.result.json'),
        selection_sha256=runtime.sha256_file(path))
    _require(intake._sealed(out/'phase-receipt.json') == phase,'Changed candidate phase receipt')
    claim = intake.provenance._local(run['claim'],datasets_only=True)
    _require(intake._json(claim/'completed.json') == dict(selection_sha256=phase['selection_sha256'],
        phase_receipt_sha256=runtime.sha256_file(out/'phase-receipt.json')),'Candidate not completed')
    target = out/fine.FIT_ID
    paths = [path,out/'development.json',out/'phase-receipt.json',out/'development.result.json',
             out/(fine.FIT_ID+'.result.json'),claim/'started.json',claim/'completed.json',
             Path(run['binding']['protocol']['path'])]
    paths += [target/name for name in ('classifier.keras','fit.json','worker-receipt.json',
                                       'history.json','validation-predictions.json','weight-proof.json')]
    paths += [Path(run['binding']['settings']['probe'][name]['path'])
              for name in ('receipt','request','report','resource')]
    records = [_candidate_record(value) for value in sorted(set(paths),key=str)]
    return dict(selection=intake.metadata_record(path),records=records,
        development_key=original['development_key'],sources=fine.code_bindings(),environment=base.environment())


def verify_negative_snapshot(snapshot, context):
    """Postclaim verification never invokes a development-only no-test guard."""
    intake = _intake()
    _require(isinstance(snapshot,dict) and set(snapshot) == {'selection','records','development_key','sources','environment'},
             'Complete immutable negative-candidate snapshot required')
    _require(snapshot['development_key'] == context['selection']['development_key']
             and snapshot['sources'] == intake.completed.code_bindings()
             and snapshot['environment'] == base.environment(),'Changed negative-candidate source/lineage')
    _require(isinstance(snapshot['records'],list) and bool(snapshot['records']), 'Candidate proof chain required')
    seen = set()
    for record in snapshot['records']:
        _require(isinstance(record,dict) and set(record) == {'path','sha256'} and record['path'] not in seen,
                 'Duplicate/foreign candidate proof')
        seen.add(record['path'])
        _require(_candidate_record(record['path']) == record,'Changed frozen negative-candidate artifact')
    selection = intake._sealed(intake._record(snapshot['selection']))
    _require(selection.get('status') == 'complete' and selection.get('candidate_selected') is False
             and selection.get('selected') == context['selection']['selected'],'Changed negative candidate selection')


def _context(manifest, selection):
    result = _intake()._development_context(manifest,selection)
    return {**result,'manifest_path':str(Path(manifest).absolute()),'selection_path':str(Path(selection).absolute())}


def _validate_request(request, output):
    intake = _intake(); core = request['core']
    context = intake._core_context(core['manifest']['path'],core['selection']['path'],{'core':core})
    context.update(manifest_path=core['manifest']['path'], selection_path=core['selection']['path'])
    protocol = load_evaluation_protocol(core['protocol']['path'],output)
    expected = dict(development_key=core['development_key'],manifest=core['manifest'],selection=core['selection'],
                    candidates_sha256=core['candidates_sha256'],archive=context['archive'])
    _require(protocol['development'] == expected and protocol['negative_candidate'] == request['negative_candidate'],
             'Changed development/candidate prospective identity')
    verify_negative_snapshot(request['negative_candidate'],context)
    archive = Path(request['archive'])
    intake.low._safe_ancestors(archive)
    _require(archive.is_file() and str(archive.absolute()) == str(Path(context['archive_path']).absolute())
             and intake.low._identity(archive.stat()) == context['archive_identity'], 'Changed original archive identity')
    return request,context


def verify_request(output):
    intake = _intake(); output = runtime._validate_output_path(output)
    request = intake._sealed(output/'request.json')
    _require(set(request) == {'core','archive','negative_candidate','reference_context'}, 'Complete test request required')
    request,context = _validate_request(request,output)
    _require(base.digest(_read_reference_context(output,request)) == base.digest(_reference_projection(context)),
             'Derived reference context differs from full original verification')
    return request,context


REFERENCE_CONTEXT_FIELDS = ('reference_rows','reference_sources','known_edges',
                            'archive','archive_path','archive_identity')


def _reference_projection(context):
    return {key:copy.deepcopy(context[key]) for key in REFERENCE_CONTEXT_FIELDS}


def _read_reference_context(output,request):
    intake = _intake()
    path = intake._record(request['reference_context'])
    _require(path == Path(output)/'reference-context.json','Foreign derived reference context path')
    doc = intake._sealed(path)
    _require(set(doc) == {'core_sha256','context'} and doc['core_sha256'] == base.digest(request['core'])
             and isinstance(doc['context'],dict) and set(doc['context']) == set(REFERENCE_CONTEXT_FIELDS),
             'Changed/foreign derived reference context')
    _require(isinstance(doc['context']['reference_rows'],list)
             and isinstance(doc['context']['known_edges'],list)
             and isinstance(doc['context']['reference_sources'],dict),'Invalid derived reference projection')
    for record in doc['context']['reference_sources'].values(): intake._record(record)
    return doc['context']


def _controller_development(core):
    """JSON/hash control checks only; full source reconstruction stays in leaves.

    Reuse the complete original four-fit/claim verifier on the bound manifest's
    metadata. No call to load_frozen, _reconstruct or _parquet is made here.
    """
    intake = _intake(); provenance = intake.provenance; old = intake.development
    provenance._validate_research_roots()
    data = intake._json(intake._record(core['manifest']))
    selection_path = intake._record(core['selection']); out = selection_path.parent
    _require(selection_path.name == 'selection.json','Original selection required')
    selection = intake._sealed(selection_path); run = intake._sealed(out/'development.json')
    binding = run['binding']
    _require(binding['manifest'] == core['manifest'] and binding['code'] == old.code_bindings()
             and binding['environment'] == base.environment(),'Changed original binding')
    original_protocol = intake._record(binding['protocol'])
    intake.completed.validate_original_protocol_paths(intake._json(original_protocol),original_protocol.parent)
    _require(binding['settings'] == old.load_protocol(original_protocol),'Changed original settings')
    _require(isinstance(data.get('source_hashes'),dict) and bool(data['source_hashes']), 'Missing frozen sources')
    for identity in data['source_hashes'].values():
        _require(isinstance(identity,dict) and set(identity) == {'path','bytes','sha256'},'Invalid frozen source')
        path = provenance._relative(identity['path'],ROOT)
        _require(path.suffix in ('.json','.parquet') or path.name == 'LICENSE','Metadata source required')
        _require(path.is_file() and path.stat().st_size == identity['bytes']
                 and runtime.sha256_file(path) == identity['sha256'],'Changed frozen metadata source')
    data['manifest_sha256'] = core['manifest']['sha256']
    _require(binding['benchmark_context'] == provenance.benchmark_context(data),'Changed original benchmark context')
    for row in data['rows']:
        row['_group_id'] = row['dependency_group_id']
        image = provenance._relative(row['image_path'],Path(data['image_root']))
        _require(image.is_file() and image.stat().st_size == row['image_bytes'],'Changed development image size')
    _require(old.experiment_identity(data,binding) == run['key'] == core['development_key'],
             'Changed original development identity')
    candidates = intake.validate_candidates(data['reserved_test_metadata'])
    _require(base.digest(candidates) == core['candidates_sha256'],'Changed frozen candidate identity')
    old.validate_fit_set(selection['all_fits'])
    for fit in selection['all_fits']:
        target = out/fit['fit_id']
        _require(Path(fit['artifact']).absolute() == provenance._local(target/'classifier.keras',datasets_only=True),
                 'Unsafe original model path')
        for name in ('fit.json','worker-receipt.json','validation-predictions.json','history.json'):
            intake._metadata_path(target/name)
        intake._metadata_path(out/(fit['fit_id']+'.result.json'))
    for name in ('phase-receipt.json','development.result.json'): intake._metadata_path(out/name)
    claim = provenance._local(run['claim'],datasets_only=True)
    intake._metadata_path(claim/'started.json'); intake._metadata_path(claim/'completed.json')
    intake.completed._verify_completed(out,selection,run,data)
    receipt = intake._json(Path(data['inputs']['intake_root'])/'selected/receipt.json')
    verification = intake._json(data['inputs']['independent_verification'])
    sample = provenance._relative(data['source_hashes']['source:query-sample.parquet']['path'],ROOT)
    return dict(selection=selection,archive=data['archive'],archive_path=receipt['archive'],
        archive_identity=receipt['archive_identity_after'],reference_sources={
            'sample_receipt':intake.metadata_record(sample.parent.parent/'sample-acquisition.json'),
            'verification':intake.metadata_record(data['inputs']['independent_verification'])},
        known_edges=sorted([dict(a=e['a'],b=e['b'],reason='known_dhash4')
            for e in verification['near_cross_item_candidates_dhash_le4']]+
            [dict(a=e['new'],b=e['old'],reason='known_dhash4')
             for e in verification['old_sample_near_candidates_dhash_le4']],key=lambda e:(e['a'],e['b'])))


def verify_controller_request(output):
    """Preclaim controller only. This result never authorizes a pixel read."""
    intake = _intake(); output = runtime._validate_output_path(output)
    request = intake._sealed(output/'request.json')
    _require(isinstance(request,dict) and set(request) == {'core','archive','negative_candidate','reference_context'},
             'Complete controller request required')
    core = request['core']
    _require(isinstance(core,dict) and set(core) == {'development_key','manifest','selection','protocol','policy',
             'policy_sha256','candidates_sha256','sources','environment'},'Complete fixed controller core required')
    claim_paths(core['development_key'])
    _require(core['policy_sha256'] == intake.POLICY_SHA256 and base.digest(core['policy']) == intake.POLICY_SHA256
             and core['sources'] == code_bindings() and core['environment'] == base.environment(),
             'Changed controller source/environment/policy')
    for name in ('manifest','selection','protocol'): intake._record(core[name])
    protocol = load_evaluation_protocol(core['protocol']['path'],output)
    context = _controller_development(core)
    _require(protocol['development'] == dict(development_key=core['development_key'],manifest=core['manifest'],
        selection=core['selection'],candidates_sha256=core['candidates_sha256'],archive=context['archive'])
        and protocol['negative_candidate'] == request['negative_candidate'],'Changed prospective control identity')
    verify_negative_snapshot(request['negative_candidate'],context)
    projection = _read_reference_context(output,request)
    _require(all(base.digest(projection[key]) == base.digest(context[key])
                 for key in REFERENCE_CONTEXT_FIELDS if key != 'reference_rows'),
             'Derived context differs from original metadata receipts')
    archive = Path(request['archive']); intake.low._safe_ancestors(archive)
    _require(archive.is_file() and str(archive.absolute()) == str(Path(context['archive_path']).absolute())
             and intake.low._identity(archive.stat()) == context['archive_identity'],'Changed original archive identity')
    return request,projection


def _bind_reference(output, core):
    intake = _intake()
    binding = {'core':core,'reference_index':intake.metadata_record(output/'reference/reference-index.json'),
               'reference_resource':intake.metadata_record(output/'reference.result.json')}
    request,context = verify_controller_request(output)
    _require(request['core'] == core,'Changed reference controller core')
    intake._reference(context,binding)
    return {key:binding[key] for key in ('reference_index','reference_resource')}


def _write_test_run(output, core, claim, reference):
    intake = _intake()
    command = intake._json(core['protocol']['path'])['acquisition_command']
    _require(command == worker_command('_acquire',output),'Changed prospective acquisition command')
    payload = dict(status='claimed',development_key=core['development_key'],claim=str(claim),binding=core,
                   **reference,acquisition_command=command)
    base.write_sealed(output/'test-run.json',payload)
    return dict(core=core,claim=str(claim),test_run=intake.metadata_record(output/'test-run.json'),**reference)


def _binding(output):
    intake = _intake(); request = verify_request(output)[0]
    run = intake._sealed(Path(output)/'test-run.json')
    _require(run.get('binding') == request['core'], 'Changed attempt core')
    binding = dict(core=request['core'],claim=run['claim'],test_run=intake.metadata_record(Path(output)/'test-run.json'),
                   reference_index=run['reference_index'],reference_resource=run['reference_resource'])
    intake._claim(binding)
    return binding


def verify_attempt(output):
    intake = _intake(); output = runtime._validate_output_path(output)
    binding = _binding(output)
    doc = intake.load_test_admission(output/'admission/manifest.json')
    _require(doc['binding'] == binding, 'Foreign admitted attempt')
    reference = intake._sealed(binding['reference_index']['path'])
    audit = independent_graph_audit(doc,reference)
    expected = dict(admission=intake.metadata_record(output/'admission/manifest.json'),
                    completion=intake.metadata_record(output/'admission/admission-completion.json'),
                    reference=binding['reference_index'],core_sha256=base.digest(binding['core']),audit=audit)
    _require(intake._sealed(output/'graph-verification.json') == expected, 'Changed pre-inference graph verification')
    return doc


def _worker_info(stage):
    return dict(job=os.environ.get('IILAS_RUNNER_JOB'),pid=os.getpid(),
                command=[sys.executable,*sys.argv],limits=vars(limits(stage)))


def _native_proof(path, stage):
    intake = _intake()
    intake.completed.verify_resource(intake._metadata_path(path),limits(stage))
    return intake.metadata_record(path)


def _reference(output):
    runtime.require_supervised_worker()
    request = verify_request(output)[0]; core = request['core']
    _intake().build_reference_index(core['manifest']['path'],core['selection']['path'],
                                   Path(output)/'reference',{'core':core})


def _acquire(output):
    runtime.require_supervised_worker()
    request = verify_request(output)[0]; binding = _binding(output); core = binding['core']
    _intake().build_test_admission(core['manifest']['path'],core['selection']['path'],request['archive'],
                                  Path(output)/'admission',binding)


def _attempt_phase(output):
    intake = _intake(); output = Path(output)
    request = verify_controller_request(output)[0]; core = request['core']
    deny_existing_test_claim(core['development_key'])
    reference = runtime.ResourceSupervisor(output,limits('reference'))
    result = reference.run(worker_command('_reference',output),fit_id='reference',cwd=ROOT)
    _require(result['status'] == 'success','Reference failed; no replacement')
    bound_reference = _bind_reference(output,core)
    # A fresh resource and metadata preflight precedes scientific claim creation.
    verify_controller_request(output)
    runtime.ResourceSupervisor(output,limits('attempt')).preflight()
    claim = create_test_claim(core['development_key'],output,core)
    _write_test_run(output,core,claim,bound_reference)
    acquire = runtime.ResourceSupervisor(output,limits('acquire'))
    result = acquire.run(worker_command('_acquire',output),fit_id='acquire',cwd=ROOT)
    _require(result['status'] == 'success','Acquisition failed; no replacement')
    intake.seal_successful_acquisition(output/'admission/manifest.json',output/'acquire.result.json')
    doc = intake.load_test_admission(output/'admission/manifest.json')
    audit = independent_graph_audit(doc,intake._sealed(bound_reference['reference_index']['path']))
    base.write_sealed(output/'graph-verification.json',dict(
        admission=intake.metadata_record(output/'admission/manifest.json'),
        completion=intake.metadata_record(output/'admission/admission-completion.json'),
        reference=bound_reference['reference_index'],core_sha256=base.digest(core),audit=audit))
    verify_attempt(output)
    evaluation = runtime.ResourceSupervisor(output,limits('evaluate'))
    result = evaluation.run(worker_command('_phase',output,stage='evaluate'),fit_id='evaluation',cwd=ROOT,
                            enforce_fit_timeout=False)
    _require(result['status'] == 'success','Evaluation failed; no replacement')


def _evaluate_phase(output):
    output = Path(output); doc = verify_attempt(output)
    if {r['label'] for r in doc['rows']} != set(CLASS_ORDER):
        base.write_sealed(output/'report-staged.json',dict(status='insufficient_support',
            reason='Both publisher classes did not survive fixed admission',operationally_approved=False,
            comparison_performed=False,statistics=doc.get('statistics'),worker=_worker_info('evaluate')))
        return
    for architecture in MODEL_ORDER:
        verify_attempt(output)
        supervisor = runtime.ResourceSupervisor(output,limits('infer'))
        result = supervisor.run(worker_command('_infer',output,architecture),fit_id=architecture,cwd=ROOT)
        _require(result['status'] == 'success','Model inference failed; no replacement: '+architecture)
        _seal_worker_completion(output,architecture)
        verify_inference(output,architecture)
    verify_attempt(output)
    for architecture in MODEL_ORDER: verify_inference(output,architecture)
    supervisor = runtime.ResourceSupervisor(output,limits('score'))
    result = supervisor.run(worker_command('_score',output),fit_id='score',cwd=ROOT)
    _require(result['status'] == 'success','Scoring failed; no replacement')
    staged = _intake()._sealed(output/'report-staged.json')
    _require(staged['worker']['command'] == worker_command('_score',output), 'Foreign score worker')
    base.write_sealed(output/'score-completion.json',dict(report=_intake().metadata_record(output/'report-staged.json'),
        resource=_native_proof(output/'score.result.json','score'),worker=staged['worker']))


def _phase(output, stage='attempt'):
    runtime.require_supervised_worker()
    output = runtime._validate_output_path(output)
    _require(stage in ('attempt','evaluate'),'Unknown phase')
    owner = _worker_info(stage)
    base.write_sealed(output/(stage+'-native-owner.json'),owner)
    base.worker_environment(output)
    result = _attempt_phase(output) if stage == 'attempt' else _evaluate_phase(output)
    request = verify_request(output)[0]
    base.write_sealed(output/(stage+'-worker.json'),dict(status='complete',worker=owner,
        core_sha256=base.digest(request['core']),report=_intake().metadata_record(output/'report-staged.json')))
    return result


def _verify_phase_worker(output,stage):
    intake = _intake(); output = Path(output)
    worker = intake._sealed(output/(stage+'-native-owner.json'))
    _require(isinstance(worker.get('job'),str) and worker['job'].startswith('Local\\IILASNativeRunner-')
             and type(worker.get('pid')) is int and worker['pid'] > 0
             and worker.get('command') == worker_command('_phase',output,stage=stage)
             and worker.get('limits') == vars(limits(stage)), 'Foreign phase native owner')
    request = verify_request(output)[0]
    expected = dict(status='complete',worker=worker,core_sha256=base.digest(request['core']),
                    report=intake.metadata_record(output/'report-staged.json'))
    _require(intake._sealed(output/(stage+'-worker.json')) == expected,'Changed phase worker binding')
    return dict(worker=intake.metadata_record(output/(stage+'-worker.json')),
        native=_native_proof(output/('attempt.result.json' if stage == 'attempt' else 'evaluation.result.json'),stage))


def wait_attempt_drain(output,deadline=None):
    """Query the actual named outer Job after runtime termination, within its deadline."""
    intake = _intake(); output = Path(output)
    owner = intake._sealed(output/'attempt-native-owner.json')
    _require(isinstance(owner.get('job'),str) and owner['job'].startswith('Local\\IILASNativeRunner-')
             and type(owner.get('pid')) is int and owner['pid'] > 0
             and owner.get('command') == worker_command('_phase',output,stage='attempt')
             and owner.get('limits') == vars(limits('attempt')), 'Foreign outer native owner')
    _require(type(deadline) in (int,float) and math.isfinite(deadline), 'Original monotonic attempt deadline required')
    return _wait_job_drain(owner['job'],deadline)


def _wait_job_drain(name,deadline):
    _require(isinstance(name,str) and re.fullmatch(r'Local\\IILASNativeRunner-[0-9a-f]{32}',name),
             'Actual native runner Job name required')
    import ctypes
    from ctypes import wintypes as W
    _require(os.name == 'nt','Native Windows Job drain required')
    kernel = ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenJobObjectW.argtypes=[W.DWORD,W.BOOL,W.LPCWSTR]
    kernel.OpenJobObjectW.restype=W.HANDLE
    kernel.CloseHandle.argtypes=[W.HANDLE]
    while time.monotonic() < deadline:
        handle = kernel.OpenJobObjectW(4,False,name)
        if not handle:
            _require(ctypes.get_last_error() == 2,'Outer native Job drain unavailable')
            return dict(status='drained',job=name,proof='named_job_no_longer_exists')
        job = runtime._ProcessJob.__new__(runtime._ProcessJob)
        job.kernel,job.handle = kernel,handle
        try:
            pids = job.pids()
        finally:
            kernel.CloseHandle(handle)
        if not pids:
            return dict(status='drained',job=name,proof='named_job_zero_members')
        time.sleep(min(.05,max(0,deadline-time.monotonic())))
    raise runtime.RuntimeSafetyError('Original attempt deadline reached; native drain unverified, claim remains consumed')


def _selected_models(doc):
    intake = _intake()
    selection = intake._sealed(doc['binding']['core']['selection']['path'])
    selected = selection['selected']
    _require([(r['architecture'],r['contrast']) for r in selected]
             == [('mobilenetv2','clahe'),('efficientnetb0','none')], 'Frozen original comparison required')
    return [{key:r[key] for key in ('architecture','artifact_sha256','contrast')} for r in selected],selected


def _raw_binding(output,doc):
    intake = _intake(); output = Path(output)
    return dict(core_sha256=base.digest(doc['binding']['core']),test_run=doc['binding']['test_run'],
        admission=intake.metadata_record(output/'admission/manifest.json'),
        completion=intake.metadata_record(output/'admission/admission-completion.json'),
        graph=intake.metadata_record(output/'graph-verification.json'),rows_sha256=base.digest(doc['rows']))


def _infer(output, architecture):
    runtime.require_supervised_worker()
    output = runtime._validate_output_path(output)
    _require(architecture in MODEL_ORDER,'Unknown inference architecture')
    doc = verify_attempt(output); models,selected = _selected_models(doc)
    index = MODEL_ORDER.index(architecture); model_record = models[index]
    artifact = _intake().provenance._local(selected[index]['artifact'],datasets_only=True)
    _require(artifact.suffix == '.keras' and runtime.sha256_file(artifact) == model_record['artifact_sha256'],
             'Changed selected saved model')
    target = runtime.create_run_directory(output/architecture)
    base.worker_environment(target)
    os.environ['KERAS_HOME'] = str(target/'keras-cache')
    import numpy as np
    import tensorflow as tf
    from parcel_inputs import prepare_image
    tf.config.threading.set_intra_op_parallelism_threads(1)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    tf.keras.utils.set_random_seed(42)
    tf.keras.mixed_precision.set_global_policy('float32')
    model = tf.keras.models.load_model(artifact,compile=False,safe_mode=True)
    validate_model_shape(model)
    reader = _intake().open_admitted_reader(output/'admission/manifest.json')
    _require(reader.rows == doc['rows'],'Changed admitted inference order')
    raw_binding = _raw_binding(output,doc)
    with RawPredictionWriter(target,doc['rows'],model_record,raw_binding) as writer:
        for row in reader.rows:
            prepared = prepare_image(reader.read(row),model_record['contrast'])
            value = model(np.expand_dims(prepared,0),training=False).numpy()
            _require(value.shape == (1,2),'Model returned foreign batch/output shape')
            writer.append(row,value[0].tolist())
        reader.verify()
        _require(verify_attempt(output) == doc and _raw_binding(output,doc) == raw_binding,
                 'Changed full inference bindings')
        _require(runtime.sha256_file(artifact) == model_record['artifact_sha256'], 'Model changed during inference')
        raw = writer.complete()
    base.write_sealed(target/'inference.json',dict(status='complete',architecture=architecture,model=model_record,
        binding=raw_binding,raw=_intake().metadata_record(raw),worker=_worker_info('infer')))


def _inference_completion(output,architecture,doc):
    intake = _intake(); output = Path(output); target = output/architecture
    models,_ = _selected_models(doc); model = models[MODEL_ORDER.index(architecture)]
    binding = _raw_binding(output,doc); inference = intake._sealed(target/'inference.json')
    worker = inference.get('worker',{})
    _require(inference.get('status') == 'complete' and inference.get('architecture') == architecture
             and inference.get('model') == model and inference.get('binding') == binding
             and inference.get('raw') == intake.metadata_record(target/'raw.json'), 'Changed inference receipt')
    _require(isinstance(worker.get('job'),str) and worker['job'].startswith('Local\\IILASNativeRunner-')
             and type(worker.get('pid')) is int and worker['pid'] > 0
             and worker.get('command') == worker_command('_infer',output,architecture)
             and worker.get('limits') == vars(limits('infer')), 'Foreign native inference worker')
    records = load_raw_predictions(target/'raw.json',doc['rows'],model,binding)
    payload = dict(status='complete',inference=intake.metadata_record(target/'inference.json'),
        raw=intake.metadata_record(target/'raw.json'),
        resource=_native_proof(output/(architecture+'.result.json'),'infer'),binding=binding,worker=worker)
    return payload,records


def _seal_worker_completion(output,architecture):
    doc = verify_attempt(output)
    payload,_ = _inference_completion(output,architecture,doc)
    base.write_sealed(Path(output)/architecture/'worker-completion.json',payload)


def _verified_inference_for_doc(output,architecture,doc):
    """Check complete raw/native receipts against this already verified cohort."""
    payload,records = _inference_completion(output,architecture,doc)
    _require(base.digest(_intake()._sealed(Path(output)/architecture/'worker-completion.json')) == base.digest(payload),
             'Changed complete worker/resource/raw binding')
    return payload,records


def verify_inference(output,architecture):
    doc = verify_attempt(output)
    _,records = _verified_inference_for_doc(output,architecture,doc)
    return records


def _report_body(output,doc):
    raw = [verify_inference(output,architecture) for architecture in MODEL_ORDER]
    return _report_from_verified_raw(output,doc,raw)


def _report_from_verified_raw(output,doc,raw):
    """Keep the existing metrics/report shape for caller-verified raw records."""
    models,_ = _selected_models(doc)
    return dict(status='complete',**comparative_metrics(doc['rows'],*raw,models),
        binding=_raw_binding(output,doc),statistics=doc['statistics'],
        workers={name:_intake().metadata_record(Path(output)/name/'worker-completion.json') for name in MODEL_ORDER},
        limitations=['Publisher TRAIN crops selected by a fixed technical/dependency filter; conditional source benchmark',
            'Conservative dependency components do not establish physical parcel independence',
            'Educational/scientific research scope does not establish commercial rights',
            'This comparison does not establish IILAS shipping-parcel photo or live-camera accuracy'])


def _score(output):
    runtime.require_supervised_worker()
    output = runtime._validate_output_path(output)
    base.worker_environment(output)
    doc = verify_attempt(output)
    admission_sha256 = base.digest(doc)
    raw,receipts = [],[]
    for architecture in MODEL_ORDER:
        payload,records = _verified_inference_for_doc(output,architecture,doc)
        # Capture immutable digests immediately, before later calls can mutate
        # shared objects. A locally resealed valid replacement is still drift.
        receipts.append(base.digest(dict(completion=payload,records=records)))
        raw.append(records)
    body = copy.deepcopy(_report_from_verified_raw(output,doc,raw))
    body_sha256 = base.digest(body)
    final_doc = verify_attempt(output)
    _require(base.digest(final_doc) == admission_sha256,'Changed scoring admission')
    final_raw = []
    for architecture,receipt in zip(MODEL_ORDER,receipts):
        payload,records = _verified_inference_for_doc(output,architecture,final_doc)
        _require(base.digest(dict(completion=payload,records=records)) == receipt,
                 'Changed scoring raw/native/model/binding receipt')
        final_raw.append(records)
    _require(base.digest(final_doc) == admission_sha256 and base.digest(body) == body_sha256
             and base.digest(_report_from_verified_raw(output,final_doc,final_raw)) == body_sha256,
             'Changed exact scoring report association')
    base.write_sealed(output/'report-staged.json',{**body,'worker':_worker_info('score')})


def _verify_staged_report(output):
    intake = _intake(); output = Path(output); doc = verify_attempt(output)
    staged = intake._sealed(output/'report-staged.json')
    if {r['label'] for r in doc['rows']} != set(CLASS_ORDER):
        _require(staged.get('status') == 'insufficient_support' and staged.get('comparison_performed') is False
                 and 'models' not in staged and staged.get('statistics') == doc['statistics'],
                 'Invalid insufficient-support report')
        _require(not any((output/name).exists() for name in MODEL_ORDER), 'Unexpected model run without class support')
        return staged
    expected = _report_body(output,doc)
    _require({k:v for k,v in staged.items() if k != 'worker'} == expected, 'Changed comparative report')
    worker = staged.get('worker',{})
    _require(isinstance(worker.get('job'),str) and worker['job'].startswith('Local\\IILASNativeRunner-')
             and type(worker.get('pid')) is int and worker['pid'] > 0
             and worker.get('command') == worker_command('_score',output)
             and worker.get('limits') == vars(limits('score')), 'Foreign score worker')
    completion = dict(report=intake.metadata_record(output/'report-staged.json'),
                      resource=_native_proof(output/'score.result.json','score'),worker=worker)
    _require(intake._sealed(output/'score-completion.json') == completion, 'Missing/changed score completion')
    return staged


def _finalize_attempt(output,core,claim,drained,phases,staged,supervisor):
    """Include durable receipt work in the original owner's time/resource budget.

    A completion marker is provisional until the post-write observation passes.
    On a late failure move only our exact marker aside; the claim stays consumed.
    Windows rename is deliberately non-replacing, including uncertainty evidence.
    """
    intake = _intake(); output = Path(output)
    _require(os.name == 'nt','Windows non-replacing finalization required')
    claim = runtime._validate_output_path(claim)
    _require(claim == claim_paths(core['development_key'])[0], 'Foreign finalization claim')
    expected = dict(key=core['development_key'],phase='test',output=str(output),binding_sha256=base.digest(core))
    _require(intake._json(claim/'started.json') == expected and drained.get('status') == 'drained',
             'Owned drained claim required for finalization')
    completed = claim/'completed.json'; temporary = claim/'completion-staged.json'
    _require(not completed.exists() and not (claim/'failed.json').exists(), 'Terminal claim cannot finalize')
    check = lambda: supervisor.preflight(required_available_bytes=limits('attempt').available_floor_bytes)
    initial = check()
    phase = dict(core_sha256=base.digest(core),
        attempt_resource=intake.metadata_record(output/'attempt.result.json'),
        evaluation_resource=intake.metadata_record(output/'evaluation.result.json'),
        staged_report=intake.metadata_record(output/'report-staged.json'),
        graph=intake.metadata_record(output/'graph-verification.json'),phases=phases,drain=drained,
        finalization_initial_snapshot=initial)
    base.write_sealed(output/'phase-receipt.json',phase)
    check()
    report = {**staged,'phase_receipt':intake.metadata_record(output/'phase-receipt.json'),
        'evaluation_scope':'development_only','input_scope':'crop_only','operationally_approved':False}
    base.write_sealed(output/'report.json',report)
    before = check()
    runtime.write_json_exclusive(temporary,dict(report_sha256=runtime.sha256_file(output/'report.json'),
        status=staged['status'],finalization_precommit_snapshot=before,
        original_monotonic_deadline=supervisor.started+limits('attempt').max_wall_seconds))
    owned = intake.metadata_record(temporary)
    check()
    _require(intake.metadata_record(temporary) == owned and not completed.exists()
             and not (claim/'failed.json').exists(),'Changed staged completion ownership')
    renamed = False
    try:
        os.rename(temporary,completed)
        renamed = True
        snapshot = check()
        base.write_sealed(output/'finalization-observation.json',dict(
            completed=intake.metadata_record(completed),snapshot=snapshot,
            original_monotonic_deadline=supervisor.started+limits('attempt').max_wall_seconds))
        check()
    except Exception:
        if renamed:
            _require(intake.metadata_record(completed)['sha256'] == owned['sha256'],
                     'Foreign completion marker cannot be moved')
            suffix = 0
            while True:
                uncertain = claim/('completion-uncertain'+('' if not suffix else '-'+str(suffix))+'.json')
                try:
                    os.rename(completed,uncertain)
                    break
                except FileExistsError:
                    suffix += 1
        raise
    return output/'report.json'


def test(selection_path, development_manifest, archive_path, evaluation_protocol, output):
    """Run one durable, offline, bounded source attempt; no resume/replacement path."""
    intake = _intake()
    context = _context(development_manifest,selection_path)
    key = context['selection']['development_key']
    deny_existing_test_claim(key)
    protocol = load_evaluation_protocol(evaluation_protocol,output)
    _require(negative_candidate_snapshot(protocol['negative_candidate']['selection']['path'],context)
             == protocol['negative_candidate'], 'Prospective negative-candidate snapshot differs from strict completion')
    core = dict(development_key=key,manifest=intake.metadata_record(development_manifest),
        selection=intake.metadata_record(selection_path),protocol=intake.metadata_record(evaluation_protocol),
        policy=protocol['policy'],policy_sha256=intake.POLICY_SHA256,
        candidates_sha256=base.digest(context['data']['reserved_test_metadata']),
        sources=code_bindings(),environment=base.environment())
    request = dict(core=core,archive=str(Path(archive_path).absolute()),negative_candidate=protocol['negative_candidate'])
    verified_context = _validate_request(request,output)[1]
    output = runtime.create_run_directory(output)
    supervisor = runtime.ResourceSupervisor(output,limits('attempt'))
    try:
        supervisor.preflight()
    except Exception as error:
        runtime.write_json_exclusive(output/'preflight-failed.json',{'reason':str(error)})
        raise
    base.write_sealed(output/'reference-context.json',dict(core_sha256=base.digest(core),
        context=_reference_projection(verified_context)))
    request['reference_context'] = intake.metadata_record(output/'reference-context.json')
    base.write_sealed(output/'request.json',request)
    del verified_context,context
    claim,_ = claim_paths(key)
    deadline = supervisor.started+limits('attempt').max_wall_seconds
    drained = None
    try:
        result = supervisor.run(worker_command('_phase',output,stage='attempt'),fit_id='attempt',cwd=ROOT,
                                enforce_fit_timeout=False)
        if (output/'attempt-native-owner.json').exists() or claim.is_dir():
            drained = wait_attempt_drain(output,deadline)
        _require(result['status'] == 'success','Outer test attempt failed; no replacement')
        _require(drained is not None,'Outer native Job owner missing')
        supervisor.preflight(required_available_bytes=limits('attempt').available_floor_bytes)
        _native_proof(output/'attempt.result.json','attempt')
        _native_proof(output/'evaluation.result.json','evaluate')
        phases = {stage:_verify_phase_worker(output,stage) for stage in ('attempt','evaluate')}
        staged = _verify_staged_report(output)
        # Native outer run is terminal before claim finalization. No raw/report
        # from a timed-out or still-running hierarchy can become completed.
        return _finalize_attempt(output,core,claim,drained,phases,staged,supervisor)
    except Exception as error:
        # Failed scientific claims are permanent. Preclaim failures retain their
        # output evidence without inventing a scientific claim.
        if drained and claim.is_dir() and not (claim/'failed.json').exists() and not (claim/'completed.json').exists():
            started = intake._json(claim/'started.json')
            if started.get('output') == str(output) and started.get('binding_sha256') == base.digest(core):
                base.finish_claim(claim,'failed',{'reason':str(error)})
        raise


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('test','_phase','_reference','_acquire','_infer','_score'))
    parser.add_argument('--selection',type=Path)
    parser.add_argument('--manifest',type=Path)
    parser.add_argument('--archive',type=Path)
    parser.add_argument('--protocol',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--architecture',choices=MODEL_ORDER)
    parser.add_argument('--stage',choices=('attempt','evaluate'),default='attempt')
    args = parser.parse_args()
    if args.command == 'test':
        for key in ('selection','manifest','archive','protocol'):
            if getattr(args,key) is None: parser.error('--'+key+' is required for test')
        test(args.selection,args.manifest,args.archive,args.protocol,args.output)
    elif args.command == '_phase': _phase(args.output,args.stage)
    elif args.command == '_infer': _infer(args.output,args.architecture)
    else: globals()[args.command](args.output)


if __name__ == '__main__':
    main()
