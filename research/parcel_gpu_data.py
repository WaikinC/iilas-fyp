"""Sealed relocation of Windows-admitted inputs, not a new source admission.

Cold import/Linux loading uses only the standard library, encoded-byte hashes
and metadata. Export alone calls the unchanged Windows admission loaders. It
copies original metadata bytes, never rewrites their Windows provenance paths,
and does not copy/decode images or load model weights.
"""
from collections import Counter, defaultdict
import copy
import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
CODE_PATH=Path(__file__).resolve()
KIND='parcel_gpu_transport_v1'
PROFILE='parcel_visible_development'
HEX=re.compile(r'[0-9a-f]{64}\Z')
MiB=1024**2
WEIGHT_METADATA={
    'mobilenetv2':'785686610c5722a28e92f5296c4011d9c9bd1ae95daa39a5d3e755b6e7a0b75f',
    'efficientnetb0':'7f146799fd429a5161b52d3637e47bc3b7fa2b3e8bae0ed61be1bbd3c73d7772'}
PROOF_HASHES={
    '010572de5a61f8a1fd853c4095a983d1a1350880e09cf97c8a1d3ce0b8eaa187',
    'f477f371442b8d0fd7709516ba94dfbb3453d2133131b4c5e56feda703befbe6',
    '8f0c0c1845a4aa03814b947ad1c9f27a4bdc390ce9f63054d02d5c49def41c63',
    '3c4c48d6ad069abacd1381c4374f6e02b7e586809f8013b35dbd56c634a8108c'}


def _require(ok,message):
    if not ok:raise ValueError(message)


def _digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def _sha(path):
    result=hashlib.sha256()
    with open(path,'rb') as stream:
        for block in iter(lambda:stream.read(MiB),b''):result.update(block)
    return result.hexdigest()


def _portable(value):
    _require(isinstance(value,str) and value and '\\' not in value and ':' not in value and '\0' not in value,
             'Unsafe portable relocation path')
    path=PurePosixPath(value)
    _require(bool(path.parts) and not path.is_absolute() and path.as_posix()==value and all(part not in ('.','..') for part in path.parts),
             'Unsafe portable relocation path')
    return value


def _safe(root,relative,*,data=True,exists=True):
    relative=_portable(relative)
    _require(not data or relative.startswith('research/datasets/'),'Relocation must remain below research/datasets')
    root=Path(root).absolute();path=root/relative
    for node in (path,*path.parents):
        _require(not node.is_symlink() and not (hasattr(node,'is_junction') and node.is_junction()),'Relocation links/junctions forbidden')
    _require(path.resolve().is_relative_to(root.resolve()),'Relocation escapes repository')
    if exists:
        _require(path.is_file() and path.stat().st_nlink==1,'Relocation file missing or hard-linked')
    return path.resolve()


def _relative(root,path):
    path=Path(path).absolute()
    _require(path.is_relative_to(Path(root).absolute()),'Source/output must remain inside repository')
    relative=path.relative_to(Path(root).absolute()).as_posix()
    _safe(root,relative,exists=False)
    return relative


def _json(path,max_bytes=32*MiB):
    _require(path.is_file() and 0<path.stat().st_size<=max_bytes,'Bounded transport JSON required')
    def unique(pairs):
        result={}
        for key,value in pairs:
            _require(key not in result,'Duplicate JSON key');result[key]=value
        return result
    def invalid(value):raise ValueError('Nonfinite JSON '+value)
    return json.loads(path.read_text(encoding='utf-8'),object_pairs_hook=unique,parse_constant=invalid)


def _unseal(path):
    value=_json(path)
    _require(isinstance(value,dict) and set(value)=={'payload','sha256'} and _digest(value['payload'])==value['sha256'],
             'Invalid transport/source seal')
    return value['payload']


def _write(path,value):
    with open(path,'x',encoding='utf-8',newline='\n') as stream:
        stream.write(json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n');stream.flush();os.fsync(stream.fileno())


def _git_check(root,paths):
    paths=sorted({_portable(path) for path in paths})
    root=Path(root).resolve()
    def run(args,**kwargs):
        result=subprocess.run(['git',*args],cwd=root,capture_output=True,check=False,**kwargs)
        _require(result.returncode in (0,1),'Git metadata check failed')
        return result
    top=run(['rev-parse','--show-toplevel'])
    _require(top.returncode==0 and Path(os.fsdecode(top.stdout).strip()).resolve()==root,'Expected existing application Git checkout')
    tracked=run(['ls-files','-z','--','research/datasets'])
    status=run(['status','--porcelain=v1','-z','--untracked-files=all','--','research/datasets'])
    ignored=run(['check-ignore','-z','--stdin'],input=('\0'.join(paths)+'\0').encode())
    actual={os.fsdecode(item) for item in ignored.stdout.split(b'\0') if item}
    _require(tracked.returncode==0 and not tracked.stdout and status.returncode==0 and not status.stdout
             and ignored.returncode==0 and actual==set(paths),'Transport/assets must remain ignored and untracked with clean data Git status')


def _windows_relative(path,windows_root):
    root=PureWindowsPath(windows_root);path=PureWindowsPath(path)
    _require(root.is_absolute() and re.fullmatch('[A-Za-z]:',root.drive) and path.is_absolute()
             and '..' not in path.parts and path.is_relative_to(root),'Invalid Windows relocation provenance')
    return _portable(path.relative_to(root).as_posix())


def _validate_manifest(data):
    _require(data.get('schema_version')==1 and data.get('benchmark_profile')==PROFILE
             and data.get('class_order')==['Normal','Damaged'] and data.get('training_admission') is True
             and data.get('admission_kind')=='visible_review_overlay_v1','Original reviewed visible admission required')
    rows=data.get('rows');_require(isinstance(rows,list) and rows,'Frozen membership required')
    ids=set();counts=Counter();groups=defaultdict(set);families=set();component_counts=Counter()
    for row in rows:
        _require(row.get('split') in ('train','validation') and row.get('label') in ('Normal','Damaged')
                 and isinstance(row.get('sample_id'),str) and row['sample_id'] not in ids
                 and isinstance(row.get('dependency_group_id'),str) and row['dependency_group_id']
                 and isinstance(row.get('source_family'),str) and row['source_family'] not in families
                 and HEX.fullmatch(row.get('sha256','')) and HEX.fullmatch(row.get('pixel_sha256',''))
                 and isinstance(row.get('width'),int) and isinstance(row.get('height'),int)
                 and min(row['width'],row['height'])>=64 and row['width']*row['height']<=16000000,'Changed frozen membership/label/hash')
        _portable(row['path']);ids.add(row['sample_id']);families.add(row['source_family'])
        counts[row['split'],row['label']]+=1;groups[row['dependency_group_id']].add(row['split']);component_counts[row['dependency_group_id']]+=1
    _require(all(counts[split,label] for split in ('train','validation') for label in ('Normal','Damaged'))
             and sum(row['split']=='train' for row in rows)<=1600 and sum(row['split']=='validation' for row in rows)<=400
             and all(len(splits)==1 for splits in groups.values()) and all(value<=4 for value in component_counts.values()),
             'Frozen split/group/class support changed')


def _validate_weights(settings):
    weights=settings.get('weights',{});proofs=settings.get('weight_proofs',[])
    _require(set(weights)==set(WEIGHT_METADATA),'Exact pretrained weight architectures required')
    for name,record in weights.items():
        _require(_digest({key:value for key,value in record.items() if key!='path'})==WEIGHT_METADATA[name],
                 'Changed pretrained weight provenance metadata')
    _require(isinstance(proofs,list) and len(proofs)==4 and {row.get('sha256') for row in proofs}==PROOF_HASHES
             and all(set(row)=={'path','sha256'} for row in proofs),'Exact pretrained proof set required')


def _strip_paths(settings):
    settings=copy.deepcopy(settings)
    for record in settings['weights'].values():record.pop('path')
    for record in settings['weight_proofs']:record.pop('path')
    return settings


def _relocations(manifest,protocol,settings,windows_root,protocol_source):
    _validate_manifest(manifest);_validate_weights(settings);_validate_weights(protocol)
    _require(_strip_paths(protocol)==_strip_paths(settings),'Original protocol/settings metadata changed')
    records=[]
    for row in manifest['rows']:
        records.append(dict(kind='image',key=row['sample_id'],original_path=row['path'],
                            repo_path=_portable(row['path']),sha256=row['sha256']))
    protocol_parent=PureWindowsPath(protocol_source).parent
    for kind,raw_items,validated_items in (
        ('weight',protocol['weights'],settings['weights']),
        ('weight_proof',{row['sha256']:row for row in protocol['weight_proofs']},
                        {row['sha256']:row for row in settings['weight_proofs']})):
        for key,record in raw_items.items():
            raw=PureWindowsPath(record['path']);validated=PureWindowsPath(validated_items[key]['path'])
            expected=raw if raw.is_absolute() else protocol_parent/raw
            _require(expected==validated,'Changed validated Windows weight/proof path')
            relative=_windows_relative(str(validated),windows_root)
            _require(relative.startswith('research/datasets/'),'Weight/proof outside ignored research data')
            records.append(dict(kind=kind,key=key,original_path=record['path'],repo_path=relative,sha256=record['sha256']))
    return sorted(records,key=lambda row:(row['kind'],row['key']))


def export(manifest,protocol,output):
    """Windows only; validate original admission, then create new metadata copies."""
    _require(os.name=='nt','Export requires original Windows admission environment')
    root=ROOT.resolve();manifest=Path(manifest).absolute();protocol=Path(protocol).absolute();output=Path(output).absolute()
    manifest_relative=_relative(root,manifest);protocol_relative=_relative(root,protocol);output_relative=_relative(root,output)
    _require(output_relative.startswith('research/datasets/'),'Transport output must be below research/datasets')
    if output.exists():raise FileExistsError('Transport output exists; overwrite/resume forbidden')
    import parcel_visible_train as visible
    data=visible.load_frozen(manifest);settings=visible.load_protocol(protocol)
    original=_unseal(_safe(root,manifest_relative));raw_protocol=_json(_safe(root,protocol_relative),MiB)
    _require(data==original,'Validated manifest differs from original metadata bytes')
    records=_relocations(data,raw_protocol,settings,str(root),str(protocol))
    paths=[manifest_relative,protocol_relative,output_relative,*[record['repo_path'] for record in records]]
    _git_check(root,paths)
    for record in records:
        _require(_sha(_safe(root,record['repo_path']))==record['sha256'],'Changed source asset hash during transport export')
    source_hashes={'manifest':_sha(manifest),'protocol':_sha(protocol)}
    output.mkdir(parents=True,exist_ok=False)
    copies={}
    for name,source in [('manifest',manifest),('protocol',protocol)]:
        destination=output/(name+'-original.json')
        with open(source,'rb') as incoming,open(destination,'xb') as outgoing:
            while block:=incoming.read(MiB):outgoing.write(block)
            outgoing.flush();os.fsync(outgoing.fileno())
        _require(_sha(destination)==source_hashes[name] and _sha(source)==source_hashes[name],'Source copy changed during export')
        copies[name]=dict(source_path=str(source),repo_path=destination.relative_to(root).as_posix(),sha256=source_hashes[name])
    payload=dict(schema_version=1,kind=KIND,benchmark_profile=PROFILE,class_order=['Normal','Damaged'],
        admission_scope='relocation_of_Windows_validated_development_inputs_only',operationally_approved=False,
        windows_repo_root=str(root),source_copies=copies,settings=settings,relocations=records,
        membership_sha256=_digest(data['rows']),membership_count=len(data['rows']),
        weight_metadata=WEIGHT_METADATA,proof_hashes=sorted(PROOF_HASHES),
        source_code_bindings=visible.code_bindings(),transport_code_sha256=_sha(CODE_PATH))
    destination=output/'transport.json';_write(destination,dict(payload=payload,sha256=_digest(payload)))
    load_transport(destination,repo_root=root)
    return destination


def load_transport(path,repo_root=None):
    """Metadata/encoded hashes only; original Windows paths remain provenance."""
    root=Path(repo_root or ROOT).resolve();relative=_relative(root,Path(path).absolute());path=_safe(root,relative)
    payload=_unseal(path)
    _require(payload.get('schema_version')==1 and payload.get('kind')==KIND and payload.get('benchmark_profile')==PROFILE
             and payload.get('class_order')==['Normal','Damaged'] and payload.get('operationally_approved') is False
             and payload.get('admission_scope')=='relocation_of_Windows_validated_development_inputs_only'
             and payload.get('transport_code_sha256')==_sha(CODE_PATH)
             and payload.get('weight_metadata')==WEIGHT_METADATA and payload.get('proof_hashes')==sorted(PROOF_HASHES),
             'Transport profile/code/pretrained metadata binding changed')
    copies=payload['source_copies'];_require(set(copies)=={'manifest','protocol'},'Exact original source copies required')
    paths=[relative];source_paths={}
    for name,record in copies.items():
        local=_safe(root,record['repo_path']);paths.append(record['repo_path'])
        _require(_sha(local)==record['sha256'],'Original source copy hash changed')
        _windows_relative(record['source_path'],payload['windows_repo_root']);source_paths[name]=local
    manifest=_unseal(source_paths['manifest']);protocol=_json(source_paths['protocol'],MiB)
    expected=_relocations(manifest,protocol,payload['settings'],payload['windows_repo_root'],copies['protocol']['source_path'])
    _require(payload['relocations']==expected,'Relocation membership/path table changed')
    _require(payload['membership_sha256']==_digest(manifest['rows']) and payload['membership_count']==len(manifest['rows']),
             'Frozen membership changed')
    resolved=dict(images={},weights={},weight_proofs={})
    names={'image':'images','weight':'weights','weight_proof':'weight_proofs'}
    for record in expected:
        local=_safe(root,record['repo_path']);paths.append(record['repo_path'])
        _require(_sha(local)==record['sha256'],'Relocated asset encoded hash changed')
        resolved[names[record['kind']]][record['key']]=str(local)
    for name,expected_hash in payload['source_code_bindings'].items():
        _require(isinstance(name,str) and '/' not in name and '\\' not in name and name.endswith('.py'),'Unsafe source code binding')
        _require(_sha(_safe(root,'research/'+name,data=False))==expected_hash,'Original source code binding changed')
    _git_check(root,paths)
    return dict(transport=payload,manifest=manifest,protocol=protocol,settings=copy.deepcopy(payload['settings']),resolved=resolved)
