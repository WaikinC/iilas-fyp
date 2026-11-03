"""Fixed owned synthetic tree; output-accounting timings, not model evaluation."""
import argparse
import json
from pathlib import Path
import statistics
import subprocess
import time

import inventory_context_runtime as serving
import runner_runtime as frozen

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'outputs/inventory-worker-output-scan-20261024'

def run_output_scan_benchmark(output):
    raw=Path(output)
    if '..' in raw.parts:raise ValueError('Parent traversal refused')
    output=raw.absolute()
    if not output.is_relative_to(BASE) or output==BASE:raise ValueError('Owned ignored output required')
    for p in (output,*output.parents):
        if p.is_symlink() or p.is_junction():raise ValueError('Linked benchmark output refused')
    subprocess.run(['git','check-ignore','-q','--',str(output.relative_to(ROOT))],cwd=ROOT,check=True,capture_output=True)
    output.mkdir(parents=True,exist_ok=False);tree=output/'fixed-tree';tree.mkdir()
    for folder in range(16):
        directory=tree/f'd{folder:02}';directory.mkdir();(directory/'empty-dir').mkdir()
        (directory/'zero').touch()
        for item in range(64):(directory/f'f{item:02}').write_bytes(bytes(1024))
    rows=[]
    for index in range(5):
        row={'index':index+1,'order':['frozen','serving'] if index%2==0 else ['serving','frozen']}
        for name in row['order']:
            counter=frozen._output_bytes if name=='frozen' else serving.measure_output_bytes
            began=time.perf_counter();count=counter(tree);elapsed=time.perf_counter()-began
            if count!=1048576:raise AssertionError('Counter differs from fixed corpus')
            row[name]={'bytes':count,'seconds':elapsed}
        rows.append(row)
    result={'passed':True,'files':1040,'bytes':1048576,'pairs':rows,'medianFrozenSeconds':statistics.median(r['frozen']['seconds'] for r in rows),'medianServingSeconds':statistics.median(r['serving']['seconds'] for r in rows),'limitations':'One owned stable synthetic tree; alternating order; cache/MSI effects uncontrolled; not an HTTP acceptance result'}
    with (output/'summary.json').open('x',encoding='utf-8') as f:json.dump(result,f,indent=2)
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    value=run_output_scan_benchmark(args.output)
    print(json.dumps({k:value[k] for k in ['passed','files','bytes','medianFrozenSeconds','medianServingSeconds']}))
