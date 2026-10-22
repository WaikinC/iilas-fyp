"""Closed GPU-artifact audit and supervised CPU adapter; never grants acceptance.

Full provenance is checked offline. Each prediction requires an externally pinned
compact descriptor and exact local bytes; it never traverses research datasets.
Importing this module is stdlib-only. No process, training or publication API.
"""
from collections import Counter
import copy
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import platform
import re
import stat
import sys
import time

import runner_runtime as runtime

ROOT=Path(__file__).resolve().parents[1]
MiB=1024**2
HEX=re.compile(r'[0-9a-f]{64}\Z')
DEV_KEY='aef72c6d16f6c23424533e801821ab37a1bd006ebe6d359030ce3a9f55c02507'
EVAL_KEY='19c60ed96fcc1089d02b3e195c346412d6641843aecec6631836825f52e07003'
POPULATION='1daae4f1f385ea44e6fd5c5340e594a2faa014f2e68e57f7b8718df0f5d54eb0'
FITS=('mobilenetv2-clahe','efficientnetb0-none')
DEV='research/datasets/parcel-visible-gpu-20261021/develop-02'
SOURCE='research/datasets/parcel-source-test-evaluation-20261021'
CLAIM='research/datasets/parcel-source-test-evaluation-registry/'+POPULATION
WINDOWS='research/datasets/parcel-windows-valid-compat/1f0d9277-386c-4cce-b815-2425a6ac6749'
OUTPUT='outputs/parcel-gpu-setup-20261021'
MODEL_PATH=DEV+'/mobilenetv2-clahe/classifier.keras'
MODEL_SHA='2fffa7aa1a8c33c6698a97e38d028858b8433aec84dbd582c01094711a0ae4da'
REPORT_PATH=SOURCE+'/evaluate-01/evaluation.json'
REPORT_SHA='b4f6727ce08630f8289b572e6a9d4ab71d730aff102250aa4af505bc27252fcc'
CODE_FILES=('parcel_gpu_serving.py','parcel_inputs.py','parcel_models.py','parcel_train.py','runner_runtime.py',
    'parcel_runtime.py','parcel_windows_valid_compat.py','parcel_source_test_evaluate.py','parcel_gpu_train.py',
    'parcel_gpu_runtime.py','parcel_source_test_audit.py','parcel_gpu_data.py','api.py')
PROVENANCE='research/datasets/parcel-gpu-serving-20261022'
AMENDMENT=dict(repo_path=PROVENANCE+'/transport-amendment-01/amendment.json',
    sha256='f3447893ded20d1b463b5d24cb1fd3d4a38aa9a4a20ed61068a8ff77811739d2')
ORIGINAL_CATALOG=dict(repo_path=PROVENANCE+'/frozen-proof-code-01/manifest.json',
    sha256='39ddd0f1259f1ee0f62058834d9f33f78818b38779f61b343e1f6a5a7173404f')
ORIGINAL_API=dict(repo_path=PROVENANCE+'/frozen-proof-api-01/record.json',
    sha256='6c395d91594b6729cba98c81d44e47601965bbec3daf548090a6585c8cd10cca')
ROOT_ROLES={
    'development.proof':'research/datasets/parcel-source-test-audit-20261021/protocol-01/development-proof.json',
    'development.comparison':DEV+'/comparison.json',
    'development.completed':'research/datasets/parcel-gpu-run-registry/develop-'+DEV_KEY+'/completed.json',
    'development.independent':OUTPUT+'/independent-develop-02-scientific-attestation-01.json',
    'development.transport':'research/datasets/parcel-visible-gpu-20261021/transport-01/transport.json',
    'development.manifest':'research/datasets/parcel-visible-gpu-20261021/transport-01/manifest-original.json',
    'development.protocol':'research/datasets/parcel-visible-gpu-20261021/transport-01/protocol-original.json',
    'source.transport':SOURCE+'/freeze-02/transport/transport.json',
    'source.prepared':SOURCE+'/prepared-01/prepared.json','source.preflight':SOURCE+'/preflight-01/preflight.json',
    'source.request':SOURCE+'/evaluate-01/request.json','source.report':REPORT_PATH,
    'source.reserved':CLAIM+'/reserved.json','source.completed':CLAIM+'/completed.json',
    'source.independent':OUTPUT+'/source-evaluation-final-independent-review-01.json',
    'source.code':'research/parcel_source_test_evaluate.py',
    'windows.independent':OUTPUT+'/independent-windows-valid-result-01.json'}
PINS={
    'development.proof':'cb5964bff0b4adc2fc0b2757b4418d15673a6047ae72a1b5e7b54b69dbf1882b',
    'development.comparison':'8e52e1f6f947be6a988f156842daabac6969808f9235dce99047089518cd04f2',
    'development.independent':'977ed41af85dce2528af43d06f6aa531434f7986024329f123983d6326eaea6d',
    'source.transport':'985372e4a98bab00534c80f51c0ca2f95a5fa488c3a434bf105b8c028716055c',
    'source.prepared':'4d914cd98815f5a8bdf8a8b408a25c972cf09e02323f8113ae7828185bbfae05',
    'source.report':REPORT_SHA,
    'source.code':'e45672d1ea54447bfbc5149848447d4fe73307a428c16a9a8630f05550a812d3',
    'source.independent':'36008a2743e601e95bf205e7db97e7248db80194d58543239538cc73c0419833',
    'windows.request':'3ea2c64dfe25fa5b2f68b6323e1498b26d23e602030a064ebed51870b661a639',
    'windows.summary':'9a4e9dd21fad5bc991c99efabd6761189fd974774782c646c91ea8e503448b4d',
    'windows.independent':'98748d0dcef41bbb4a3feba1a4601e37501c8701ac5b088a15bb553bdc9e7802'}
NATIVE_FILES=('request.json','native-result.json','worker-envelope.json','worker-terminal.json')


def require(ok,message='Parcel artifacts unavailable'):
    if not ok:raise ValueError(message)


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def safe_path(relative):
    require(isinstance(relative,str) and relative and '\\' not in relative and ':' not in relative and '\0' not in relative)
    parts=PurePosixPath(relative)
    require(not parts.is_absolute() and parts.as_posix()==relative and all(p not in ('.','..') for p in parts.parts))
    path=ROOT/relative
    for node in (path,*path.parents):
        require(not node.is_symlink() and not (hasattr(node,'is_junction') and node.is_junction()))
        if node==ROOT:break
    require(path.resolve().is_relative_to(ROOT.resolve()))
    return path


def _bytes(path,maximum):
    path=Path(path).absolute();require(path.is_relative_to(ROOT.absolute()))
    path=safe_path(path.relative_to(ROOT.absolute()).as_posix());before=path.stat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and 0<before.st_size<=maximum)
    with path.open('rb') as stream:data=stream.read(maximum+1)
    after=path.stat()
    require(len(data)==before.st_size and (before.st_ino,before.st_size,before.st_mtime_ns)==
        (after.st_ino,after.st_size,after.st_mtime_ns))
    return data


def read_json(path,maximum=8*MiB,*,expected_sha=None):
    data=_bytes(path,maximum)
    require(expected_sha is None or hashlib.sha256(data).hexdigest()==expected_sha)
    def unique(pairs):
        result={}
        for key,value in pairs:require(key not in result);result[key]=value
        return result
    def invalid(value):raise ValueError('Nonfinite JSON')
    value=json.loads(data,object_pairs_hook=unique,parse_constant=invalid)
    require(isinstance(value,dict));return value


def _payload(value):
    require(set(value)=={'payload','sha256'} and digest(value['payload'])==value['sha256'])
    return value['payload']


def role_limit(role):
    return 32*MiB if role in ('source.transport','source_metadata.00000','source_metadata.00049','core','historical.proof.core') else 8*MiB


def contract():
    return dict(class_order=['Normal','Damaged'],preprocessing='rgb-letterbox224-v1',contrast='clahe',
        decision='larger_probability_exact_tie_abstains',confidence='uncalibrated',human_review_required=True,
        operationally_approved=False,acceptance_sha256=None)


def environment():
    return dict(platform=platform.system(),python=platform.python_version(),executable=sys.executable,
        packages={name:importlib.metadata.version(name) for name in ('tensorflow','keras','numpy','h5py','opencv-python-headless')})


def current_code():return {name:runtime.sha256_file(Path(__file__).parent/name) for name in CODE_FILES}


def _provenance_metadata():
    """Read only the three fixed, physically pinned historical mapping documents."""
    load=lambda record:read_json(safe_path(record['repo_path']),256*1024,expected_sha=record['sha256'])
    amendment=load(AMENDMENT);catalog=load(ORIGINAL_CATALOG);api=load(ORIGINAL_API)
    require(set(amendment)=={'schema_version','kind','acceptance_sha256','operationally_approved','historical_source_execution',
        'purpose','serving_gates','allowed_current_source_changes','original_sources','original_proofs','unchanged'}
        and type(amendment['schema_version']) is int and amendment['schema_version']==1
        and amendment['kind']=='parcel_gpu_transport_provenance_amendment_v1'
        and amendment['purpose']=='closed_typed_gpu_transport' and amendment['serving_gates']=='closed'
        and amendment['acceptance_sha256'] is None and amendment['operationally_approved'] is False
        and amendment['historical_source_execution'] is False
        and amendment['allowed_current_source_changes']==['research/parcel_gpu_serving.py','research/parcel_runtime.py','research/api.py']
        and amendment['original_sources']==dict(catalog=ORIGINAL_CATALOG,supplemental_api=ORIGINAL_API))
    unchanged=dict(class_order=['Normal','Damaged'],contrast='clahe',development_key=DEV_KEY,evaluation_sha256=REPORT_SHA,
        model_sha256=MODEL_SHA,model_variable_count=263,optimizer_iterations=945,optimizer_variable_count=6,
        preprocessing='rgb-letterbox224-v1',source_test_inference=False,training=False,native_limits=dict(
            available_floor_bytes=805306368,max_fit_seconds=25,max_output_bytes=67108864,max_rss_bytes=2147483648,
            max_wall_seconds=25,min_available_bytes=3221225472,min_free_disk_bytes=2147483648,poll_seconds=.05,threads=1))
    require(digest(amendment['unchanged'])==digest(unchanged))
    proofs=amendment['original_proofs']
    require(isinstance(proofs,dict) and set(proofs)=={'core','descriptor','offline_audit','cold_request','cold_proof',
        'independent_cold_review','production_completed'})
    for record in proofs.values():_record(record)
    require(set(catalog)=={'kind','git_history_copied','models_or_datasets_copied','operationally_approved','records',
        'source_cold_request_sha256','source_core_sha256'}
        and catalog['kind']=='parcel_serving_original_proof_source_snapshot_v1'
        and all(catalog[key] is False for key in ('git_history_copied','models_or_datasets_copied','operationally_approved'))
        and catalog['source_cold_request_sha256']==proofs['cold_request']['sha256']
        and catalog['source_core_sha256']==proofs['core']['sha256'])
    expected={'research/'+name for name in CODE_FILES if name!='api.py'}|{OUTPUT+'/parcel-cold-photo-proof-01.py'}
    require(isinstance(catalog['records'],list) and len(catalog['records'])==13)
    sources={}
    def add(row,logical,snapshot):
        require(row['original_repo_path']==logical and logical not in sources and row['snapshot_repo_path']==snapshot
            and type(row['bytes']) is int and 0<row['bytes']<=8*MiB)
        _record(dict(repo_path=snapshot,sha256=row['sha256']));sources[logical]=row
    for row in catalog['records']:
        require(isinstance(row,dict) and set(row)=={'original_repo_path','snapshot_repo_path','sha256','bytes'}
            and row['original_repo_path'] in expected)
        add(row,row['original_repo_path'],PROVENANCE+'/frozen-proof-code-01/'+PurePosixPath(row['original_repo_path']).name)
    require(set(sources)==expected)
    require(set(api)=={'kind','git_history_copied','models_or_datasets_copied','operationally_approved','original_repo_path',
        'snapshot_repo_path','sha256','bytes','source_catalog_sha256'}
        and api['kind']=='parcel_serving_original_api_source_snapshot_v1'
        and api['source_catalog_sha256']==ORIGINAL_CATALOG['sha256']
        and all(api[key] is False for key in ('git_history_copied','models_or_datasets_copied','operationally_approved')))
    add(api,'research/api.py',PROVENANCE+'/frozen-proof-api-01/api.py')
    return amendment,sources


def _historical_sources(reader,records):
    """Authenticate snapshots as data; current non-amended sources stay exact."""
    amendment,sources=_provenance_metadata();current=current_code()
    require(set(current)==set(CODE_FILES))
    for logical,row in sources.items():
        record=records['historical.source.'+PurePosixPath(logical).name]
        require(record==dict(repo_path=row['snapshot_repo_path'],sha256=row['sha256']))
        require(len(reader.record(record,'historical.source'))==row['bytes'])
        if logical.startswith('research/') and logical not in amendment['allowed_current_source_changes']:
            require(current[PurePosixPath(logical).name]==row['sha256'])
    return sources


def _windows_code(sources):
    import parcel_windows_valid_compat as win
    current=current_code()
    return {name:(sources['research/parcel_runtime.py']['sha256'] if name=='parcel_runtime.py' else current[name])
        for name in win.CODE_NAMES}


def _historical_evidence(reader,records,projection):
    """Bind the accepted v1 proof as historical evidence, never current readiness."""
    amendment,sources=_provenance_metadata();_historical_sources(reader,records)
    expected={'historical.amendment':AMENDMENT,'historical.catalog':ORIGINAL_CATALOG,'historical.api_record':ORIGINAL_API}
    expected.update({'historical.proof.'+name:record for name,record in amendment['original_proofs'].items()})
    for role,record in expected.items():
        require(records[role]==record);reader.record(record,role)
    obj=lambda name:reader.object(records['historical.proof.'+name],'historical.proof.'+name)
    core=obj('core');receipt=obj('offline_audit');descriptor=obj('descriptor')
    original_projection={key:copy.deepcopy(value) for key,value in projection.items() if key!='provenance_amendment'}
    original_projection['code']={name:sources['research/'+name]['sha256'] for name in CODE_FILES if name!='api.py'}
    require(type(core['schema_version']) is int and core['schema_version']==1 and core['kind']=='parcel_gpu_serving_core_v1'
        and digest(core['projection'])==digest(original_projection))
    original_core=amendment['original_proofs']['core']['sha256']
    require(type(receipt['schema_version']) is int and receipt['schema_version']==1
        and receipt['kind']=='parcel_gpu_serving_offline_audit_v1' and receipt['core_sha256']==original_core
        and digest(receipt['projection'])==digest(original_projection) and receipt['status']=='verified_complete'
        and receipt['operationally_approved'] is False)
    require(type(descriptor['schema_version']) is int and descriptor['schema_version']==1
        and descriptor['kind']=='parcel_gpu_serving_descriptor_v1' and descriptor['core_sha256']==original_core
        and digest(descriptor['projection'])==digest(original_projection)
        and descriptor['offline_audit']==amendment['original_proofs']['offline_audit'])
    request=obj('cold_request');proof=obj('cold_proof');review=obj('independent_cold_review');completed=obj('production_completed')
    cold_names=('parcel_gpu_data.py','parcel_gpu_serving.py','parcel_gpu_train.py','parcel_inputs.py','parcel_models.py',
        'parcel_runtime.py','parcel_source_test_audit.py','parcel_train.py','parcel_windows_valid_compat.py','runner_runtime.py')
    original_code={name:sources['research/'+name]['sha256'] for name in cold_names}
    original_code['parent_harness']=sources[OUTPUT+'/parcel-cold-photo-proof-01.py']['sha256']
    descriptor_sha=amendment['original_proofs']['descriptor']['sha256']
    require(request['code']==original_code and request['environment']==projection['environment']
        and request['descriptor']['sha256']==descriptor_sha and request['descriptor']['core_sha256']==original_core
        and request['descriptor']['evaluation_sha256']==REPORT_SHA)
    require(proof['status']=='success' and proof['operationally_approved'] is False
        and proof['descriptor_sha256']==descriptor_sha and proof['request_sha256']==amendment['original_proofs']['cold_request']['sha256'])
    require(review['status']=='pass' and review['operationally_approved'] is False and review['acceptance_sha256'] is None
        and review['descriptor_sha256']==descriptor_sha and review['evaluation_sha256']==REPORT_SHA and review['model_sha256']==MODEL_SHA
        and review['adapter']['sha256']==sources['research/parcel_gpu_serving.py']['sha256']
        and review['harness']['sha256']==original_code['parent_harness'])
    require(completed['status']=='success' and completed['operationally_approved'] is False
        and completed['core_sha256']==original_core and completed['descriptor_sha256']==descriptor_sha
        and completed['offline_audit_sha256']==amendment['original_proofs']['offline_audit']['sha256']
        and completed['adapter_sha256']==sources['research/parcel_gpu_serving.py']['sha256'])
    return sources


def _record(value):
    require(isinstance(value,dict) and set(value)=={'repo_path','sha256'} and isinstance(value['sha256'],str)
        and HEX.fullmatch(value['sha256']));safe_path(value['repo_path']);return value


def _projection(value):
    require(isinstance(value,dict) and set(value)=={'model','contract','evaluation_sha256','code','environment','provenance_amendment'})
    require(digest(value['model'])==digest(dict(name='MobileNetV2',fit_id=FITS[0],artifact=dict(repo_path=MODEL_PATH,sha256=MODEL_SHA),
        optimizer_iterations=945,model_variable_count=263,optimizer_variable_count=6)))
    require(digest(value['contract'])==digest(contract()) and value['evaluation_sha256']==REPORT_SHA)
    require(value['provenance_amendment']==AMENDMENT)
    require(value['code']==current_code() and value['environment']==environment())
    require(value['environment']['platform']=='Windows');return value


def _check_artifact():
    path=safe_path(MODEL_PATH);before=path.stat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and 0<before.st_size<=128*MiB)
    value=runtime.sha256_file(path);after=path.stat()
    require(value==MODEL_SHA and (before.st_ino,before.st_size,before.st_mtime_ns)==
        (after.st_ino,after.st_size,after.st_mtime_ns));return path


def _compact_descriptor(descriptor_path,expected_descriptor_sha256):
    require(isinstance(expected_descriptor_sha256,str) and HEX.fullmatch(expected_descriptor_sha256))
    descriptor=read_json(descriptor_path,256*1024,expected_sha=expected_descriptor_sha256)
    require(set(descriptor)=={'schema_version','kind','core_sha256','projection','offline_audit'}
        and type(descriptor['schema_version']) is int and descriptor['schema_version']==2 and descriptor['kind']=='parcel_gpu_serving_descriptor_v2'
        and HEX.fullmatch(descriptor['core_sha256']))
    projection=_projection(descriptor['projection']);record=_record(descriptor['offline_audit'])
    receipt=read_json(safe_path(record['repo_path']),256*1024,expected_sha=record['sha256'])
    require(set(receipt)=={'schema_version','kind','status','core_sha256','projection','role_catalog_sha256','verified','operationally_approved'}
        and type(receipt['schema_version']) is int and receipt['schema_version']==2 and receipt['kind']=='parcel_gpu_serving_offline_audit_v2'
        and receipt['status']=='verified_complete' and receipt['operationally_approved'] is False
        and receipt['core_sha256']==descriptor['core_sha256'] and receipt['projection']==projection
        and HEX.fullmatch(receipt['role_catalog_sha256'])
        and set(receipt['verified'])=={'development','source_evaluation','windows_compatibility'}
        and all(v is True for v in receipt['verified'].values()))
    return projection


def descriptor_bindings(descriptor_path,expected_descriptor_sha256):
    """Controller identity fence only: no model bytes, decoder or research walk."""
    _compact_descriptor(descriptor_path,expected_descriptor_sha256)
    return dict(modelVersion=MODEL_SHA,selectionSha256=expected_descriptor_sha256,evaluationSha256=REPORT_SHA)


def validate_descriptor(descriptor_path,expected_descriptor_sha256):
    _compact_descriptor(descriptor_path,expected_descriptor_sha256)
    path=_check_artifact()
    return dict(model='MobileNetV2',modelVersion=MODEL_SHA,artifact=str(path),contrast='clahe',preprocessing='rgb-letterbox224-v1',
        class_order=['Normal','Damaged'],selection_sha256=expected_descriptor_sha256,report_sha256=REPORT_SHA,
        operationally_approved=False)


def audit_descriptor(descriptor_path,expected_descriptor_sha256):
    try:return dict(status='artifact_ready',operationally_approved=False,model=validate_descriptor(descriptor_path,expected_descriptor_sha256))
    except (OSError,ValueError,TypeError,KeyError,AttributeError,OverflowError):
        return dict(status='unavailable',operationally_approved=False,reason='Parcel artifacts unavailable')


def validate_roles(records,expected):
    require(isinstance(records,dict) and set(records)==set(expected))
    for role,path in expected.items():
        record=_record(records[role]);require(record['repo_path']==path)
        if role in PINS:require(record['sha256']==PINS[role])


def verify_source_native(request,record,envelope,terminal,prepared,fit_id,original_root,hashes):
    import parcel_gpu_runtime as native
    native.validate_native_result(record,180);native.validate_resource_profile(request)
    require(fit_id in FITS and prepared['key']==EVAL_KEY and original_root.startswith('/'))
    output=original_root+'/'+SOURCE+'/evaluate-01';unit='iilas-gpu-source-'+EVAL_KEY[:12]+'-'+str(FITS.index(fit_id))+'.service'
    expected=[prepared['binding']['environment']['executable'],original_root+'/research/parcel_source_test_evaluate.py',
        '_worker','--output',output,'--fit-id',fit_id,'--purpose','evaluation']
    require(request['command']==expected and request['unit_name']==record['unit_name']==unit
        and request['output']==output+'/'+fit_id and request['output_tree']==record['output_tree']==output
        and request['max_output_bytes']==record['max_output_bytes']==512*MiB
        and request['code_sha256']==prepared['binding']['code']['parcel_gpu_runtime.py']
        and request['activation_sha256']==prepared['binding']['activation_helper']['sha256'])
    require(all(request.get(k)==record.get(k) for k in ('armed_monotonic','effective_wall_seconds','phase_deadline_monotonic','requested_max_wall_seconds')))
    for field,name in (('request_sha256','request.json'),('worker_envelope_sha256','worker-envelope.json'),('worker_terminal_sha256','worker-terminal.json')):
        require(record[field]==hashes[name])
    require(envelope['request_sha256']==hashes['request.json'] and envelope['proof']['unit_name']==unit
        and envelope['proof']['properties']==record['properties'] and terminal['returncode']==0)


def same_science(expected,actual,_field=None):
    """Only scientific floating results permit fixed 1e-12 representation error."""
    require(type(expected) is type(actual))
    if isinstance(expected,float):
        approximate=_field in {'accuracy','precision','recall','f1','macro_f1','nll','stable_ce','coverage','lower','upper',
            'max_absolute_probability_difference','mean_absolute_probability_difference'}
        require(math.isfinite(expected) and math.isfinite(actual)
            and (math.isclose(expected,actual,rel_tol=1e-12,abs_tol=1e-12) if approximate else expected==actual))
    elif isinstance(expected,dict):
        require(set(expected)==set(actual))
        for key in expected:same_science(expected[key],actual[key],key)
    elif isinstance(expected,list):
        require(len(expected)==len(actual))
        for left,right in zip(expected,actual):same_science(left,right,_field)
    else:require(expected==actual)


def _same_independent_section(expected,actual):
    """Pinned independent component sums can differ from per-image float sums.

    This exception is confined to known derived component confusion/weights.
    Fresh frozen-estimator comparisons still use same_science without it.
    """
    normalized=copy.deepcopy(actual)
    def numeric(left,right):
        require(type(left) is type(right))
        if isinstance(left,list):
            require(len(left)==len(right))
            for a,b in zip(left,right):numeric(a,b)
        elif isinstance(left,float):
            require(math.isfinite(left) and math.isfinite(right) and math.isclose(left,right,rel_tol=1e-12,abs_tol=1e-12))
        else:require(left==right)
    pairs=[(expected['always_normal']['component'],normalized['always_normal']['component'])]
    pairs.extend((expected['point_estimates'][fid]['component'],normalized['point_estimates'][fid]['component']) for fid in FITS)
    for left,right in pairs:
        for field in ('confusion','total_weight','abstention_weight'):
            numeric(left[field],right[field]);right[field]=copy.deepcopy(left[field])
        for label in ('Normal','Damaged'):
            for field in ('f1_denominator','false_negative_weight','false_positive_weight','predicted_weight','support_weight','true_positive_weight'):
                numeric(left['per_class'][label][field],right['per_class'][label][field])
                right['per_class'][label][field]=left['per_class'][label][field]
    same_science(expected,normalized)


class _Reader:
    """Per-offline-call verified byte cache; never an approval/request cache."""
    def __init__(self):self.cache={}
    def record(self,record,role):
        record=_record(record);path=record['repo_path']
        if path not in self.cache:self.cache[path]=_bytes(safe_path(path),role_limit(role))
        data=self.cache[path];require(len(data)<=role_limit(role) and hashlib.sha256(data).hexdigest()==record['sha256'])
        return data
    def value(self,record,role):
        data=self.record(record,role)
        def unique(pairs):
            result={}
            for k,v in pairs:require(k not in result);result[k]=v
            return result
        def invalid(value):raise ValueError('Nonfinite metadata')
        value=json.loads(data,object_pairs_hook=unique,parse_constant=invalid)
        return value
    def object(self,record,role,*,sealed=False):
        value=self.value(record,role);require(isinstance(value,dict))
        return _payload(value) if sealed else value
    def pinned(self,role,*,sealed=False):
        return self.object(dict(repo_path=ROOT_ROLES[role],sha256=PINS.get(role,runtime.sha256_file(safe_path(ROOT_ROLES[role])))),role,sealed=sealed)


def _windows_relative(original):
    path=PureWindowsPath(original);root=PureWindowsPath(str(ROOT))
    require(path.is_absolute() and path.is_relative_to(root) and '..' not in path.parts)
    return path.relative_to(root).as_posix()


def role_catalog():
    """Exact role->relative path catalog; metadata only, no model/image reads."""
    reader=_Reader();snapshot=reader.pinned('source.transport',sealed=True)
    independent=reader.pinned('development.independent');review=reader.pinned('source.independent')
    development_transport=reader.pinned('development.transport',sealed=True)
    result=dict(ROOT_ROLES)
    for index,row in enumerate(snapshot['metadata']):
        require(index<77 and row['repo_path'].startswith(SOURCE+'/freeze-02/transport/'+str(index).zfill(5)+'.'))
        result['source_metadata.'+str(index).zfill(5)]=row['repo_path']
    require(len(snapshot['metadata'])==77)
    for name in ('source','receipt','log'):
        result['development.binary.'+name]=_windows_relative(independent['parent_binary_readback'][name+'_path'])
    for name in ('verification_source','statistical_formula_freeze','statistical_fixtures'):
        result['source.independent.'+name]=_windows_relative(review[name]['path'])
    weights=[r for r in development_transport['relocations'] if r['kind']=='weight_proof']
    require(len(weights)==4)
    for index,row in enumerate(weights):result['development.weight_proof.'+str(index)]=row['repo_path']
    for fid in FITS:
        for name in ('fit.json','history.json','validation-predictions.json','validation-diagnostic.json',*NATIVE_FILES):
            result['development.'+fid+'.'+name]=DEV+'/'+fid+'/'+name
        for name in ('attempt.json','intent.json','state-before.json','state-after.json',*NATIVE_FILES,
            *('batch-'+str(i).zfill(3)+'.json' for i in range(19))):
            result['source.'+fid+'.'+name]=SOURCE+'/evaluate-01/'+fid+'/'+name
        unit='iilas-gpu-source-'+EVAL_KEY[:12]+'-'+str(FITS.index(fid))+'.service'
        result['source.'+fid+'.once']='research/datasets/parcel-gpu-runtime-registry/units/'+unit+'/attempt.json'
    for name in ('request.json','attempt.json','summary.json','progress.jsonl','execution.json','launch.json','worker.result.json','cleanup.json',
        'native-run-invoked.json','native-job-observed.json','native-drain-monitor.json','cpu_batch1-before.json','cpu_batch1-after.json',
        'cpu_batch4-before.json','cpu_batch4-after.json'):
        result['windows.'+name.removesuffix('.json')]=WINDOWS+'/'+name
    result['windows.request']=WINDOWS+'/request.json';result['windows.summary']=WINDOWS+'/summary.json'
    result['windows.request_independent']=OUTPUT+'/independent-windows-valid-request-01.json'
    result['windows.parent_selection']=OUTPUT+'/windows-valid-compat-parent-selection-01.json'
    amendment,sources=_provenance_metadata()
    result['historical.amendment']=AMENDMENT['repo_path'];result['historical.catalog']=ORIGINAL_CATALOG['repo_path']
    result['historical.api_record']=ORIGINAL_API['repo_path']
    for name,record in amendment['original_proofs'].items():result['historical.proof.'+name]=record['repo_path']
    for logical,row in sources.items():result['historical.source.'+PurePosixPath(logical).name]=row['snapshot_repo_path']
    result['windows.protected_api']=sources['research/api.py']['snapshot_repo_path']
    result['windows.photo_pin']='backend/functions/parcelAcceptance.mjs';result['windows.live_pin']='backend/functions/parcelLiveAcceptance.mjs'
    return result


def _relocations(records,reader):
    snapshot=reader.object(records['source.transport'],'source.transport',sealed=True)
    request=reader.object(records['source.'+FITS[0]+'.request.json'],'source.'+FITS[0]+'.request.json')
    script=request['command'][1];suffix='/research/parcel_source_test_evaluate.py';require(script.endswith(suffix))
    original_root=script[:-len(suffix)];require(original_root.startswith('/mnt/'))
    result={}
    def add(original,record):
        value=dict(original_path=original,repo_path=record['repo_path'],sha256=record['sha256'])
        if original in result:require(result[original]['sha256']==value['sha256'])
        else:result[original]=value
    for index,row in enumerate(snapshot['metadata']):
        record=records['source_metadata.'+str(index).zfill(5)]
        require(set(row)=={'original_path','windows_path','repo_path','sha256'} and row['repo_path']==record['repo_path'] and row['sha256']==record['sha256'])
        windows=PureWindowsPath(row['windows_path']);windows_root=PureWindowsPath(str(ROOT))
        require(windows.is_absolute() and '..' not in windows.parts and (windows.is_relative_to(windows_root)
            or windows==windows_root.parent/'Enter-IILAS-GPU.sh'))
        original=PureWindowsPath(row['original_path'])
        if original.is_absolute() and original.drive:require(original==windows)
        add(row['original_path'],record)
    for record in records.values():
        add(str(ROOT/record['repo_path']),record)
        add(original_root+'/'+record['repo_path'],record)
    _,sources=_provenance_metadata()
    for logical,row in sources.items():
        record=records['historical.source.'+PurePosixPath(logical).name]
        require(record==dict(repo_path=row['snapshot_repo_path'],sha256=row['sha256']))
        add(str(ROOT/logical),record);add(original_root+'/'+logical,record)
    return [result[key] for key in sorted(result)]


def build_core():
    """Parent helper: return unsigned closed core; writes/ML/binaries never used."""
    paths=role_catalog();reader=_Reader();records={}
    for role,path in paths.items():
        data=_bytes(safe_path(path),role_limit(role))
        records[role]=dict(repo_path=path,sha256=hashlib.sha256(data).hexdigest())
        reader.cache[path]=data
    validate_roles(records,paths)
    windows=reader.object(records['windows.request'],'windows.request')
    projection=dict(model=dict(name='MobileNetV2',fit_id=FITS[0],artifact=dict(repo_path=MODEL_PATH,sha256=MODEL_SHA),
        optimizer_iterations=945,model_variable_count=263,optimizer_variable_count=6),contract=contract(),evaluation_sha256=REPORT_SHA,
        code=current_code(),environment=windows['environment'],provenance_amendment=dict(AMENDMENT))
    _projection(projection)
    return dict(schema_version=2,kind='parcel_gpu_serving_core_v2',projection=projection,roles=records,
        metadata_relocations=_relocations(records,reader))


def _development(reader,records):
    import parcel_source_test_audit as audit
    import parcel_gpu_train as gpu
    proof=audit._proof(safe_path(records['development.proof']['repo_path']))
    comparison=reader.object(records['development.comparison'],'development.comparison',sealed=True)
    manifest=reader.object(records['development.manifest'],'development.manifest',sealed=True)
    require(proof['development_key']==DEV_KEY and comparison['key']==DEV_KEY
        and reader.object(records['development.completed'],'development.completed')['result_sha256']==records['development.comparison']['sha256'])
    prepared=dict(key=DEV_KEY,binding=comparison['binding'])
    for fit in comparison['all_fits']:
        fid=fit['fit_id'];prefix='development.'+fid+'.'
        require(reader.object(records[prefix+'fit.json'],prefix+'fit.json',sealed=True)==fit)
        raw=reader.value(records[prefix+'validation-predictions.json'],prefix+'validation-predictions.json')
        history=reader.object(records[prefix+'history.json'],prefix+'history.json')
        gpu.validate_raw_result(fit,raw,history,manifest,prepared)
        for name,field in (('history.json','history_sha256'),('validation-predictions.json','validation_predictions_sha256'),
            ('validation-diagnostic.json','validation_diagnostic_sha256')):require(records[prefix+name]['sha256']==fit[field])
    require(comparison['all_fits'][0]['artifact_sha256']==MODEL_SHA)
    return manifest


def _source(reader,records,relocations):
    import parcel_source_test_evaluate as ev
    snapshot=reader.object(records['source.transport'],'source.transport',sealed=True)
    prepared=reader.object(records['source.prepared'],'source.prepared',sealed=True)
    report=reader.object(records['source.report'],'source.report',sealed=True)
    request=reader.object(records['source.request'],'source.request')
    reserved=reader.object(records['source.reserved'],'source.reserved');completed=reader.object(records['source.completed'],'source.completed')
    require(not safe_path(CLAIM+'/failed.json').exists() and not safe_path(SOURCE+'/evaluate-01/failed.json').exists())
    require(prepared['key']==EVAL_KEY==digest(prepared['binding']) and prepared['operationally_approved'] is False
        and prepared['serving_gates']=='closed' and prepared['binding']['population_key']==POPULATION
        and prepared['binding']['policy']==ev.evaluation_policy() and prepared['binding']['code']==ev.code_bindings())
    require(prepared['binding']['transport']==records['source.transport'] and prepared['preflight']==records['source.preflight'])
    require(request==dict(purpose='evaluation',prepared=prepared,claim=records['source.reserved'])
        and reserved['protocol']==prepared and reserved['population_key']==POPULATION
        and completed['result']==records['source.report'] and 0<completed['elapsed_seconds']<=600)
    require(report['key']==EVAL_KEY and report['binding']==prepared['binding'] and report['preflight']==prepared['preflight']
        and report['operationally_approved'] is False and report['serving_gates']=='closed')
    admission=snapshot['admission'];rows=ev.validate_admission(admission)
    require(len(rows)==75 and sum(r['strict_publisher_partition_eligible'] for r in rows)==47
        and len({r['dependency_group_id'] for r in rows})==60
        and digest(rows)==prepared['binding']['membership_sha256']
        and ev.population_key(snapshot['source_sha256'],admission)==POPULATION
        and snapshot['source_sha256']==reserved['source_sha256']==prepared['binding']['source_sha256'])
    require(reserved['test']==sorted([r['sample_id'],r['sha256']] for r in admission['dispositions'] if r['split']=='test'))
    mapping={r['original_path']:r for r in relocations}
    require(snapshot['admission_record']['path'] in mapping)
    admitted_record=mapping[snapshot['admission_record']['path']]
    require(admitted_record['sha256']==snapshot['admission_record']['sha256'])
    alias=next(k for k,v in records.items() if v=={key:admitted_record[key] for key in ('repo_path','sha256')})
    require(reader.object(records[alias],alias,sealed=True)==admission)
    first_request=reader.object(records['source.'+FITS[0]+'.request.json'],'source.'+FITS[0]+'.request.json')
    script=first_request['command'][1];original_root=script[:-len('/research/parcel_source_test_evaluate.py')]
    require(mapping[script]['repo_path']=='research/parcel_source_test_evaluate.py' and mapping[script]['sha256']==PINS['source.code'])
    attempts=[]
    for fid in FITS:
        prefix='source.'+fid+'.';obj=lambda name:reader.object(records[prefix+name],prefix+name)
        attempt=obj('attempt.json');ev.validate_attempt(attempt,rows,prepared['binding']['models'][fid])
        require(attempt['key']==EVAL_KEY and attempt['purpose']=='evaluation' and report['raw_attempts'][fid]==records[prefix+'attempt.json'])
        require(obj('state-before.json')==attempt['state_before'] and obj('state-after.json')==attempt['state_after'])
        hashes={name:records[prefix+name]['sha256'] for name in NATIVE_FILES}
        require(hashes==report['native_records'][fid])
        verify_source_native(obj('request.json'),obj('native-result.json'),obj('worker-envelope.json'),obj('worker-terminal.json'),
            prepared,fid,original_root,hashes)
        envelope=obj('worker-envelope.json')['proof'];child=attempt['native']
        require(all(child[k]==envelope[k] for k in ('unit_name','cgroup','resource_profile','properties','cgroup_limits','main_pid'))
            and child['pid'] in child['current_members'] and child['main_pid'] in child['current_members'])
        once=obj('once');require(once['output']==original_root+'/'+SOURCE+'/evaluate-01/'+fid
            and once['intent_sha256']==records[prefix+'intent.json']['sha256'])
        offset=0;names=['attempt.json','state-before.json','state-after.json','worker-envelope.json']
        for index,size in enumerate(attempt['batch_sizes']):
            name='batch-'+str(index).zfill(3)+'.json';names.append(name);batch=obj(name)
            raw=attempt['raw'][offset:offset+size];selected=rows[offset:offset+size]
            require(batch['size']==size and batch['sample_ids']==[r['sample_id'] for r in selected]
                and batch['input_labels']==[ev.CLASSES.index(r['label']) for r in selected]
                and sorted(set(batch['devices']))==attempt['output_devices'])
            for field,key in (('probabilities','probabilities'),('logits','logits'),('keras_sparse_ce','keras_sparse_ce')):
                require(batch[field]==[r[key] for r in raw])
            offset+=size
        require({name:records[prefix+name]['sha256'] for name in names}==report['attempt_evidence'][fid])
        attempts.append(attempt)
    fresh=ev.summarize(admission,attempts)
    for key,value in fresh.items():
        if key in ('primary','strict'):same_science(value,report[key])
        else:require(value==report[key])
    review=reader.object(records['source.independent'],'source.independent')
    require(review['status']=='pass' and review['kind']=='independent_source_test_final_scientific_review_v1'
        and review['key']==EVAL_KEY and review['population_key']==POPULATION and review['operationally_approved'] is False
        and review['serving_gates']=='closed' and review['every_reported_metric_interval_and_denominator_verified'] is True
        and review['strict_from_identical_outputs'] is True and review['evaluation']['sha256']==REPORT_SHA
        and review['prepared']['sha256']==records['source.prepared']['sha256']
        and review['completed_claim']['sha256']==records['source.completed']['sha256']
        and review['population_claim']['sha256']==records['source.reserved']['sha256'])
    for key in ('primary','strict'):_same_independent_section(report[key],review[key])
    for guard,attempt in zip(review['fit_guards'],attempts):
        fid=attempt['fit_id'];prefix='source.'+fid+'.'
        require(guard['fit_id']==fid and guard['artifact_sha256']==attempt['artifact_before_sha256']
            and guard['attempt_evidence']==report['attempt_evidence'][fid] and guard['native_bindings']==report['native_records'][fid]
            and guard['native_once_claim']['sha256']==records[prefix+'once']['sha256'] and guard['state_unchanged'] is True)


def _windows(reader,records,manifest):
    import parcel_windows_valid_compat as win
    sources=_historical_sources(reader,records)
    obj=lambda name:reader.object(records['windows.'+name],'windows.'+name)
    request=obj('request');attempt=obj('attempt');summary=obj('summary');review=obj('independent')
    rows=win.validate_rows(request['rows'])
    require(rows==[r for r in manifest['rows'] if r['split']=='validation'] and request['rows_sha256']==digest(rows)
        and request['policy']==win.policy() and request['code']==_windows_code(sources) and request['environment']==environment())
    win.validate_no_update(attempt);require(attempt['request_sha256']==records['windows.request']['sha256'] and attempt['policy']==win.policy())
    for key,state in zip(('cpu_batch1-before','cpu_batch1-after','cpu_batch4-before','cpu_batch4-after'),attempt['states']):
        require(obj(key)==dict(state=state,artifact_sha256=MODEL_SHA))
    raw=reader.value(records['development.'+FITS[0]+'.validation-predictions.json'],'development.'+FITS[0]+'.validation-predictions.json')
    win.validate_compiled(rows,attempt['cpu_batch4'],attempt['compiled_logits_ce'])
    same_science(win.compare_paths(rows,attempt['cpu_batch1'],attempt['cpu_batch4'],raw),summary)
    require(all(not summary[k]['disagreements'] for k in ('cpu_batch1_vs_cpu_batch4','cpu_batch1_vs_gpu_batch4','cpu_batch4_vs_gpu_batch4')))
    for device in attempt['devices']:require(isinstance(device,str) and device.endswith('CPU:0'))
    progress=[json.loads(line) for line in reader.record(records['windows.progress.jsonl'],'windows.progress.jsonl').decode().splitlines()]
    for name,expected_sizes in (('cpu_batch1',[1]*162),('cpu_batch4',[4]*40+[2])):
        events=[r for r in progress if r['path']==name];require([r['batch_size'] for r in events]==expected_sizes)
        require([p for r in events for p in r['predictions']]==attempt[name])
    require(len(progress)==203 and len(attempt['tensor_hashes'])==162)
    native=obj('worker.result');cleanup=obj('cleanup');launch=obj('launch');observed=obj('native-job-observed')
    monitor=obj('native-drain-monitor');invoked=obj('native-run-invoked');execution=obj('execution')
    require(native['status']=='success' and native['returncode']==0 and 0<native['elapsed_seconds']<=600
        and 0<native['peak_rss_bytes']<=2*1024**3 and cleanup['status']=='clean'
        and cleanup['native_run_invoked'] is True and 0<cleanup['elapsed_seconds']<=600)
    require(observed['job_name']==monitor['job_name']==cleanup['job_name'] and monitor['monitor_opened'] is True
        and observed['worker_may_have_started'] is True and invoked['worker_may_have_started'] is True)
    for record in (cleanup,launch,invoked,execution):require(record['request_sha256']==records['windows.request']['sha256'])
    require(launch['policy']==execution['policy']==win.policy() and launch['command']==[request['environment']['executable'],
        str(ROOT/'research/parcel_windows_valid_compat.py'),'_worker','--request',str(ROOT/WINDOWS/'request.json'),
        '--request-sha256',records['windows.request']['sha256']])
    require(review['status']=='pass' and review['kind']=='independent_windows_valid_compatibility_attestation_v1'
        and review['artifact_sha256']==MODEL_SHA and review['summary_sha256']==records['windows.summary']['sha256']
        and review['request_sha256']==records['windows.request']['sha256'] and review['decision_flips']==0
        and review['operationally_approved'] is False and review['operational_25_second_proof'] is False
        and review['four_state_checkpoints_verified'] is True and review['optimizer_iterations']==945)
    same_science(review['metrics'],summary['metrics'])
    for key in ('cpu_batch1_vs_cpu_batch4','cpu_batch1_vs_gpu_batch4','cpu_batch4_vs_gpu_batch4'):
        same_science(review['comparisons'][key],summary[key])
    # These pinned independent bindings enumerate known originals, never arbitrary references.
    path_hash={r['repo_path']:r['sha256'] for r in records.values()}
    path_hash.update({'research/'+name:value for name,value in current_code().items()})
    for logical in ('research/parcel_runtime.py','research/api.py'):path_hash[logical]=sources[logical]['sha256']
    for path,sha in review['physical_sha256'].items():
        normalized=path.replace('\\','/');require(normalized in path_hash and path_hash[normalized]==sha)


def audit_core(core_path,expected_core_sha256):
    require(isinstance(expected_core_sha256,str) and HEX.fullmatch(expected_core_sha256))
    core=read_json(core_path,32*MiB,expected_sha=expected_core_sha256)
    require(set(core)=={'schema_version','kind','projection','roles','metadata_relocations'} and type(core['schema_version']) is int and core['schema_version']==2
        and core['kind']=='parcel_gpu_serving_core_v2');_projection(core['projection'])
    records=core['roles'];validate_roles(records,role_catalog());reader=_Reader()
    for role,record in records.items():reader.record(record,role)
    _historical_evidence(reader,records,core['projection'])
    require(core['metadata_relocations']==_relocations(records,reader))
    manifest=_development(reader,records);_source(reader,records,core['metadata_relocations']);_windows(reader,records,manifest)
    return dict(schema_version=2,kind='parcel_gpu_serving_offline_audit_v2',status='verified_complete',core_sha256=expected_core_sha256,
        projection=core['projection'],role_catalog_sha256=digest(dict(roles=records,metadata_relocations=core['metadata_relocations'])),
        verified=dict(development=True,source_evaluation=True,windows_compatibility=True),operationally_approved=False)


def _load_model(path):
    import parcel_train as train
    train.configure_cpu();train.offline()
    import tensorflow as tf
    require(not tf.config.list_logical_devices('GPU'))
    return tf.keras.models.load_model(path,compile=True,safe_mode=True)


def _decode_prepare(data):
    from parcel_inputs import decode_rgb,prepare_image
    rgb=decode_rgb(data);require(rgb.shape[0]*rgb.shape[1]<=24000000,'Invalid parcel image')
    return prepare_image(rgb,'clahe')


def _snapshot(model):
    optimizer=getattr(model,'optimizer',None);require(optimizer is not None)
    def variables(values):
        result=[]
        for index,variable in enumerate(values):
            array=variable.numpy();result.append(dict(name=str(index)+':'+str(getattr(variable,'path',getattr(variable,'name',''))),
                shape=[int(n) for n in array.shape],dtype=str(array.dtype),sha256=hashlib.sha256(array.tobytes()).hexdigest()))
        return result
    result=dict(model_variables=variables(model.variables),optimizer_variables=variables(optimizer.variables),
        optimizer_iterations=int(optimizer.iterations.numpy()))
    require(len(result['model_variables'])==263 and len(result['optimizer_variables'])==6 and result['optimizer_iterations']==945)
    return result


def predict_image(data,descriptor_path,expected_descriptor_sha256):
    """Caller sets worker_environment(its monitored directory) before importing us."""
    runtime.require_supervised_worker()
    require(os.name=='nt','Supervised Windows CPU required')
    started=time.perf_counter()
    try:
        require(type(data) is bytes and 0<len(data)<=10*MiB,'Invalid parcel image')
        metadata=validate_descriptor(descriptor_path,expected_descriptor_sha256)
        tensor=_decode_prepare(data);require(tuple(tensor.shape)==(224,224,3))
        path=_check_artifact();model=_load_model(path)
        require(model.input_shape==(None,224,224,3) and model.output_shape==(None,2))
        before=_snapshot(model);_check_artifact()
        output=model(tensor[None,...],training=False)
        require(isinstance(getattr(output,'device',None),str) and output.device.endswith('CPU:0'))
        scores=output.numpy();require(tuple(scores.shape)==(1,2))
        probabilities=scores[0].tolist()
        require(all(type(v) in (int,float) and math.isfinite(v) and 0<=v<=1 for v in probabilities)
            and abs(sum(probabilities)-1)<=1e-6)
        require(_snapshot(model)==before);_check_artifact()
        elapsed=(time.perf_counter()-started)*1000;require(0<=elapsed<=25000)
        label=None if probabilities[0]==probabilities[1] else ('Normal' if probabilities[0]>probabilities[1] else 'Damaged')
        return dict(status='abstained' if label is None else 'predicted',label=label,confidence=max(probabilities),probabilities=probabilities,
            confidenceMeaning='uncalibrated',model='MobileNetV2',modelVersion=MODEL_SHA,preprocessing='rgb-letterbox224-v1',contrast='clahe',
            evidenceSha256=hashlib.sha256(data).hexdigest(),selectionSha256=expected_descriptor_sha256,evaluationSha256=REPORT_SHA,
            classOrder=['Normal','Damaged'],acceptanceSha256=None,processingTimeMs=elapsed,humanReviewRequired=True,operationally_approved=False)
    except (OSError,ValueError,TypeError,KeyError,AttributeError,ImportError,RuntimeError,OverflowError):
        raise ValueError('Parcel prediction unavailable') from None
