"""Immutable grouped preparation for the delivery FYP study; no fitting."""
from pathlib import Path
import argparse
import random
from collections import Counter
import delivery_demo_artifacts as a
import delivery_demo_contract as c
import delivery_demo_simulation as s

def prepare_dataset(output):
    output=a.safe(output)
    if output.exists():raise ValueError('Delivery output already exists')
    a.claim('prepare',output);output.mkdir(parents=True)
    cases=s.generate_families();rng=random.Random(20261024);assignment={}
    for stratum in s.STRATA:
        ids=sorted({v['familyId'] for v in cases if v['stratum']==stratum});rng.shuffle(ids)
        for i,family in enumerate(ids):assignment[family]='train' if i<70 else 'validation' if i<85 else 'test'
    rows={k:[] for k in ('train','validation','test')}
    for case in cases:
        replay=s.replay_snapshot(case);rows[assignment[case['familyId']]].append(dict(case=case,**replay,**c.teaching_label(replay['facts'])))
    counts={k:len(v) for k,v in rows.items()};families={k:len({r['case']['familyId'] for r in v}) for k,v in rows.items()};classes={k:{label:sum(r['label']==label for r in v) for label in c.CLASSES} for k,v in rows.items()}
    if counts!={'train':840,'validation':180,'test':180} or families!={'train':210,'validation':45,'test':45} or any(n<20 for v in classes.values() for n in v.values()):raise ValueError('Prospective delivery coverage not met')
    pins={name:a.write_json(output/f'{name}.json',values) for name,values in rows.items()}
    manifest=dict(protocol=a.PROTOCOL,policy=c.POLICY,features=list(c.FEATURES),classes=list(c.CLASSES),output=str(output),counts=counts,familyCounts=families,classCounts=classes,partitions=pins,sourcePins=a.source_pins(),environment=a.environment(),provenance=c.PROVENANCE,assignment=assignment)
    a.write_json(output/'manifest.json',manifest);verify_dataset(output/'manifest.json',include_test=True,_preparing=True);a.complete('prepare',output/'manifest.json');return manifest
def verify_dataset(manifest,*,include_test=False,_preparing=False):
    path=a.safe(manifest);m=a.read_json(path)
    if not _preparing:
        seal=a.read_json(a.DATA_ROOT/'registry/prepare-complete.json')
        if seal!=dict(protocol=a.PROTOCOL,path=str(path),sha256=a.digest(a.read_bytes(path))):raise ValueError('Delivery preparation seal differs')
    if m['protocol']!=a.PROTOCOL or m['policy']!=c.POLICY or m['features']!=list(c.FEATURES) or m['classes']!=list(c.CLASSES) or m['sourcePins']!=a.source_pins() or m['environment']!=a.environment() or m['provenance']!=c.PROVENANCE or m['output']!=str(path.parent):raise ValueError('Delivery dataset binding changed')
    assignment=m['assignment']
    if Counter(assignment.values())!={'train':210,'validation':45,'test':45}:raise ValueError('Delivery family split differs')
    seen=set()
    for name in ('train','validation','test') if include_test else ('train','validation'):
        p=a.safe(path.parent/f'{name}.json')
        if a.digest(a.read_bytes(p))!=m['partitions'][name]:raise ValueError('Delivery rows changed')
        rows=a.read_json(p)
        if len(rows)!=m['counts'][name]:raise ValueError('Delivery row count differs')
        sample_ids=set();groups=set();labels=Counter()
        for row in rows:
            case=row['case'];family=case['familyId'];replay=s.replay_snapshot(case);label=c.teaching_label(replay['facts'])
            if assignment.get(family)!=name or case['sampleId'] in sample_ids or any(row.get(k)!=v for k,v in (replay|label).items()):raise ValueError('Delivery replay or split differs')
            sample_ids.add(case['sampleId']);groups.add(family);labels[row['label']]+=1
        if groups&seen or len(groups)!=m['familyCounts'][name] or dict(labels)!=m['classCounts'][name] or any(n<20 for n in labels.values()):raise ValueError('Delivery partition integrity differs')
        seen|=groups
    return m
def main():
    p=argparse.ArgumentParser();p.add_argument('command',choices=['prepare','verify']);p.add_argument('--output',type=Path);p.add_argument('--manifest',type=Path);args=p.parse_args()
    result=prepare_dataset(args.output) if args.command=='prepare' and args.output else verify_dataset(args.manifest) if args.command=='verify' and args.manifest else p.error('Use output for preparation or manifest for verification')
    print(__import__('json').dumps(dict(protocol=result['protocol'],counts=result['counts'],classCounts=result['classCounts'])))
if __name__=='__main__':main()
