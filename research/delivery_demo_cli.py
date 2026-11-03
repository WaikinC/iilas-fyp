"""Exclusive delivery study operations, supervised native phase and fit workers."""
from pathlib import Path
import argparse
import json
import sys
from uuid import uuid4
import delivery_demo_artifacts as a
import runner_runtime as runtime

def public_phase(phase,source,output):
    from delivery_demo_train import SUPERVISOR,limits
    output=a.safe(output)
    if output.exists():raise ValueError('Delivery phase output already exists')
    diagnostics=a.DATA_ROOT/'admission'/uuid4().hex;diagnostics.mkdir(parents=True)
    SUPERVISOR(diagnostics,limits(True),a.DATA_ROOT).preflight()
    if phase=='develop':
        from delivery_demo_data import verify_dataset
        verify_dataset(source)
    else:
        from delivery_demo_train import load_development
        if not load_development(source)['rfBeatsDummy']:raise ValueError('RF validation gate not met')
    a.claim(phase,output);output.mkdir(parents=True);supervisor=SUPERVISOR(output,limits(True),a.DATA_ROOT)
    command=[sys.executable,str(Path(__file__).resolve()),'_phase','--phase',phase,'--source',str(source),'--output',str(output)]
    result=supervisor.run(command,fit_id='inference',cwd=a.ROOT)
    if result['status']!='success' or not result['cleanup_confirmed']:raise runtime.RuntimeSafetyError('Delivery phase failed; inspect retained native evidence')
    target=output/('development.json' if phase=='develop' else 'evaluation.json');a.complete(phase,target)
    value=a.read_json(target);print(json.dumps(dict(phase=phase,complete=True,output=str(target),rfBeatsDummy=value.get('rfBeatsDummy'),metrics=value.get('models'))))
def main():
    p=argparse.ArgumentParser();p.add_argument('command',choices=['preflight','develop','evaluate','_phase','_fit']);p.add_argument('--manifest',type=Path);p.add_argument('--development',type=Path);p.add_argument('--source',type=Path);p.add_argument('--output',type=Path);p.add_argument('--phase',choices=['develop','evaluate']);p.add_argument('--job',type=Path);p.add_argument('--sha256');args=p.parse_args()
    if args.command=='preflight':
        snap=runtime.native_snapshot();print(json.dumps(dict(availableBytes=snap['available_bytes'],requiredBytes=3*1024**3)));return
    if args.command in ('develop','evaluate'):
        source=args.manifest if args.command=='develop' else args.development
        if source is None or args.output is None:p.error('Provide the source and exclusive output')
        public_phase(args.command,a.safe(source),args.output);return
    runtime.require_supervised_worker()
    if args.command=='_fit':
        from delivery_demo_train import fit_worker
        fit_worker(args.job,args.sha256);return
    if not args.phase or not args.source or not args.output:p.error('Missing native phase binding')
    if args.phase=='develop':
        from delivery_demo_train import develop
        develop(args.source,args.output)
    else:
        from delivery_demo_evaluate import evaluate
        evaluate(args.source,args.output)
if __name__=='__main__':main()
