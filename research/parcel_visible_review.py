"""Immutable prediction-blind review overlay over the frozen native intake.

Only JSON/receipt hashes are read here; the unchanged base loader verifies image
bytes without decoding. New visual dependencies are conservative, not physical
identity proofs. A review observation never replaces a publisher class label.
"""
from collections import Counter, defaultdict
import copy
import hashlib
from pathlib import Path

import parcel_visible_manifest as base

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = Path(__file__).resolve()
KIND = 'visible_review_overlay_v1'
BINDINGS = {'policy','rendered','observations','lock','metadata_review','sample_key'}
POLICY = 'publisher_visible_condition_pilot_with_sampled_review'


def _require(ok,message):
    if not ok:
        raise ValueError(message)


def _code_bindings():
    return {'parcel_visible_review.py':base.runtime.sha256_file(CODE_PATH)}


def _metadata(path):
    path = base._local(path)
    _require(any(path.is_relative_to(ROOT/part) for part in ('outputs','research/datasets')),
             'Review metadata must remain in ignored outputs/research datasets')
    _require(path.suffix.lower() in ('.json','.md','.txt','.log') and path.is_file()
             and 0<path.stat().st_size<=32*base.MiB, 'Bounded review metadata required')
    return path


def _record(path):
    return base._record(_metadata(path))


def _verify(record):
    _require(isinstance(record,dict) and set(record)=={'path','sha256'}
             and isinstance(record['sha256'],str) and base.HEX.fullmatch(record['sha256']), 'Invalid review binding')
    path = _metadata(record['path'])
    _require(_record(path)==record, 'Changed review metadata binding')
    return path


def _output(path):
    path = base._local(path)
    _require(path.suffix=='.json' and path.is_relative_to(ROOT/'research'/'datasets'),
             'Review output must be JSON below research/datasets')
    if path.exists():
        raise FileExistsError('Review output exists; overwrite forbidden')
    _require(path.parent.is_dir(), 'Review output parent must exist')
    return base.runtime._validate_output_path(path,repo_root=ROOT)


def _review(candidate,candidate_path,review_path):
    review = base._json(_metadata(review_path))
    _require(review.get('schema_version')==1 and review.get('policy')==POLICY and review.get('decision')=='accept'
             and isinstance(review.get('independent_reviewer'),str) and review['independent_reviewer'].strip()
             and review.get('candidate_sha256')==base.runtime.sha256_file(candidate_path)
             and review.get('source_sha256')==candidate['source']['sha256'], 'Invalid review/source/candidate binding')
    _require(isinstance(review.get('bindings'),dict) and set(review['bindings'])==BINDINGS,
             'Six fixed review evidence bindings required')
    for record in review['bindings'].values():
        _verify(record)
    all_rows = {row['sample_id']:row for row in candidate['dispositions']}
    selected = {row['sample_id']:row for row in candidate['rows']}
    key = base._json(_verify(review['bindings']['sample_key']))
    _require(isinstance(key,dict) and isinstance(key.get('samples'),list) and key['samples'], 'Invalid fixed sample key')
    key_rows,case_ids = {},set()
    for item in key['samples']:
        _require(isinstance(item,dict) and item.get('sample_id') in selected
                 and isinstance(item.get('case_id'),str) and item['case_id'].strip(), 'Unknown fixed sample key/case')
        sid = item['sample_id']
        _require(sid not in key_rows and item['case_id'] not in case_ids
                 and all(item.get(field)==selected[sid].get(field) for field in
                         ('sha256','path','split','label','dependency_group_id')), 'Fixed sample key membership/hash changed')
        key_rows[sid]=item;case_ids.add(item['case_id'])
    samples = review.get('sampled_reviews')
    _require(isinstance(samples,list) and samples, 'Nonempty sampled review required')
    seen = set()
    for sample in samples:
        _require(isinstance(sample,dict) and sample.get('sample_id') in selected, 'Unknown sampled review ID')
        sid = sample['sample_id']
        _require(sid not in seen and sample.get('sha256')==selected[sid]['sha256'], 'Duplicate sampled review ID or wrong hash')
        _require(sid in key_rows and sample.get('case_id')==key_rows[sid]['case_id'], 'Fixed sample key/case mismatch')
        _require(sample.get('quality') in ('suitable','ambiguous','irrelevant')
                 and sample.get('observed_condition') in ('Normal','Damaged','Uncertain')
                 and isinstance(sample.get('notes'),str), 'Invalid sampled quality/observation')
        seen.add(sid)
    _require(seen==set(key_rows),'Reviewed IDs must exactly match fixed sample key membership')
    _require({(selected[sid]['split'],selected[sid]['label']) for sid in seen}==
        {('train','Normal'),('train','Damaged'),('validation','Normal'),('validation','Damaged')},
        'Sampled review must cover both classes and development splits')
    rights = review.get('rights_holds')
    _require(isinstance(rights,list), 'Explicit rights_holds list required')
    seen = set()
    for hold in rights:
        _require(isinstance(hold,dict) and hold.get('sample_id') in all_rows, 'Unknown rights review ID')
        sid = hold['sample_id']
        _require(sid not in seen and hold.get('sha256')==all_rows[sid]['sha256']
                 and isinstance(hold.get('reason'),str) and hold['reason'].strip(), 'Duplicate rights hold or invalid hash/evidence')
        seen.add(sid)
    links = review.get('dependency_links')
    _require(isinstance(links,list), 'Explicit dependency_links list required')
    seen = set()
    for link in links:
        _require(isinstance(link,dict) and link.get('left_sample_id') in all_rows
                 and link.get('right_sample_id') in all_rows, 'Unknown dependency review ID')
        left,right = link['left_sample_id'],link['right_sample_id']
        pair = tuple(sorted((left,right)))
        _require(left!=right and pair not in seen, 'Duplicate/repeated/self dependency link')
        _require(link.get('left_sha256')==all_rows[left]['sha256'] and link.get('right_sha256')==all_rows[right]['sha256']
                 and link.get('strength')=='conservative_review_dependency' and isinstance(link.get('basis'),str)
                 and link['basis'].strip(), 'Invalid dependency hash/basis/strength')
        seen.add(pair)
    # Bind the overlay to the observations frozen before opening publisher keys.
    # Extra explicit rights holds/links may be conservative, but none of the
    # locked evidence may silently disappear when it is translated to IDs.
    observations = base._json(_verify(review['bindings']['observations']))
    lock = base._json(_verify(review['bindings']['lock']))
    _require(observations.get('schema_version')==1 and observations.get('publisher_key_opened') is False
             and observations.get('model_predictions_seen') is False and lock.get('model_predictions_seen') is False
             and lock.get('publisher_key_read_after_this_lock') is True
             and lock.get('observations_sha256')==review['bindings']['observations']['sha256'],
             'Invalid prediction-blind observation lock')
    locked = observations.get('observations')
    _require(isinstance(locked,list) and len(locked)==len(samples), 'Locked observation/sample membership changed')
    samples_by_case = {sample['case_id']:sample for sample in samples}
    locked_cases = set()
    rights_ids = {hold['sample_id'] for hold in rights}
    for observation in locked:
        _require(isinstance(observation,dict) and observation.get('case_id') in samples_by_case
                 and observation['case_id'] not in locked_cases, 'Unknown/duplicate locked observation case')
        case = observation['case_id']; sample = samples_by_case[case]
        _require(sample['quality']==observation.get('quality') and sample['observed_condition']==observation.get('observed_condition')
                 and sample['notes']==observation.get('note'), 'Overlay differs from locked observation')
        if observation.get('rights_flag'):
            _require(sample['sample_id'] in rights_ids,'Locked rights flag missing explicit rights hold')
        locked_cases.add(case)
    declared_pairs = {tuple(sorted((link['left_sample_id'],link['right_sample_id']))) for link in links}
    related = observations.get('candidate_related_views',[])
    _require(isinstance(related,list),'Invalid locked related views')
    for relation in related:
        cases = relation.get('cases') if isinstance(relation,dict) else None
        _require(isinstance(cases,list) and len(cases)==2 and cases[0]!=cases[1]
                 and all(case in samples_by_case for case in cases),'Invalid locked related case pair')
        pair = tuple(sorted(samples_by_case[case]['sample_id'] for case in cases))
        _require(pair in declared_pairs,'Locked related pair missing declared dependency link')
    return review


def _rebuild(candidate,candidate_path,review_path):
    _require(candidate.get('training_admission') is False and 'admission_kind' not in candidate,
             'Overlay requires original pending native candidate')
    review = _review(candidate,candidate_path,review_path)
    payload = copy.deepcopy(candidate)
    rows = payload['dispositions']
    indices = {row['sample_id']:index for index,row in enumerate(rows)}
    groups = base._Union(len(rows))
    original_groups = {}
    for index,row in enumerate(rows):
        group = row['dependency_group_id']
        if group in original_groups:
            groups.join(index,original_groups[group])
        else:
            original_groups[group] = index
        row['candidate_dependency_group_id'] = group
    for link in review['dependency_links']:
        groups.join(indices[link['left_sample_id']],indices[link['right_sample_id']])
    components = defaultdict(list)
    for index,row in enumerate(rows):
        components[groups.find(index)].append(row)
    observations = {sample['sample_id']:sample for sample in review['sampled_reviews']}
    rights = {hold['sample_id']:hold['reason'] for hold in review['rights_holds']}
    for component in components.values():
        group = 'dep-'+base._digest(sorted(row['sample_id'] for row in component))[:24]
        splits = {row['split'] for row in component}
        component_rights = any(row['sample_id'] in rights for row in component)
        component_quality = any(observations.get(row['sample_id'],{}).get('quality') in ('ambiguous','irrelevant')
                                for row in component)
        shared = set()
        if len(splits)>1:
            shared.add('review_cross_partition_component')
        if 'test' in splits:
            shared.add('review_published_test_component')
        if component_rights:
            shared.add('review_rights_candidate_family')
        if component_quality:
            shared.add('review_quality_candidate_family')
        for row in component:
            sid = row['sample_id']; row['dependency_group_id'] = group
            reasons = set(row['reasons']) | shared
            if sid in observations:
                observation = observations[sid]
                row['review_observation'] = copy.deepcopy(observation)
                row['quality'] = observation['quality']
                if row['quality'] in ('ambiguous','irrelevant'):
                    reasons.add('review_quality_'+row['quality'])
            if sid in rights:
                row['review_rights_observation'] = rights[sid]
                row['rights'] = 'rights_uncleared_review'
                reasons.add('rights_uncleared_review')
            row['reasons'] = sorted(reasons)
    # Only the original candidate membership may survive. A review hold never
    # causes an excluded augmentation/other component to be used as replacement.
    original_selected = {row['sample_id'] for row in candidate['rows']}
    families, counts, split_counts = set(),Counter(),Counter()
    for row in sorted(rows,key=lambda row:(base._rank(row['dependency_group_id']),base._rank(row['sample_id']))):
        if row['sample_id'] not in original_selected:
            continue
        if row['reasons']:
            row['disposition']='held'; continue
        if row['source_family'] in families:
            row['reasons'].append('review_family_representative_cap')
        elif counts[row['dependency_group_id']]>=4:
            row['reasons'].append('review_component_view_cap')
        elif split_counts[row['split']] >= (1600 if row['split']=='train' else 400):
            row['reasons'].append('review_split_view_cap')
        if row['reasons']:
            row['disposition']='not_selected'; continue
        families.add(row['source_family']);counts[row['dependency_group_id']]+=1;split_counts[row['split']]+=1
        row['disposition']='selected'
    payload['rows'] = sorted([copy.deepcopy(row) for row in rows if row['sample_id'] in original_selected
                             and row['disposition']=='selected'],key=lambda row:(row['split'],row['sample_id']))
    payload['summary'] = base._summary(payload['rows'],rows)
    _require(not payload['summary']['admission_blockers'],'Both classes required in TRAIN/validation after review overlay')
    payload['summary'].update(candidate_images=len(candidate['rows']),
        review_removed_images=len(candidate['rows'])-len(payload['rows']),replacement_images=0,
        sampled_review_is_gold_truth=False,full_validation_semantics_independently_verified=False)
    payload['candidate_graph'] = payload.pop('graph')
    payload['graph'] = dict(components=len(components),review_links=copy.deepcopy(review['dependency_links']),
                           review_link_strength='conservative_review_dependency',physical_identity_established=False)
    payload.update(training_admission=True,admission_kind=KIND,candidate_binding=_record(candidate_path),
                   review_binding=_record(review_path),adapter_code_bindings=_code_bindings())
    return payload


def admit_manifest(candidate: Path,review: Path,output: Path) -> Path:
    output = _output(output)
    candidate = _metadata(candidate); review = _metadata(review)
    data = base.load_manifest(candidate)
    payload = _rebuild(data,candidate,review)
    return base._seal(output,payload)


def load_manifest(path: Path) -> dict:
    data = base._unseal(_metadata(path))
    _require(data.get('admission_kind')==KIND and data.get('training_admission') is True
             and data.get('adapter_code_bindings')==_code_bindings(), 'Wrong review overlay admission/code binding')
    candidate = _verify(data['candidate_binding']);review = _verify(data['review_binding'])
    expected = _rebuild(base.load_manifest(candidate),candidate,review)
    _require(data==expected,'Review overlay reconstruction/seal changed')
    return data
