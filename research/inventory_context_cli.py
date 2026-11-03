"""Bounded public commands; hidden workers require an assigned live Windows Job."""
import argparse
import json
from pathlib import Path
import sys
import uuid

import inventory_context_artifacts as a
from inventory_context_data import prepare_cohort, audit_cohort


def parser():
    result=argparse.ArgumentParser(description=__doc__)
    commands=result.add_subparsers(dest='command',required=True)
    for name in ('prepare','audit-data','develop','audit-development','evaluate','audit-evaluation'):
        command=commands.add_parser(name)
        if name!='prepare':
            command.add_argument('--source',type=Path,required=True)
            command.add_argument('--source-sha256',required=True)
        if name in ('prepare','develop','evaluate'):command.add_argument('--output',type=Path,required=True)
        if name in ('evaluate','audit-evaluation','audit-development'):command.add_argument('--development',type=Path,required=True)
        if name=='audit-evaluation':command.add_argument('--evaluation',type=Path,required=True)
    phase=commands.add_parser('_phase',help=argparse.SUPPRESS)
    phase.add_argument('--phase',choices=a.PHASES,required=True)
    phase.add_argument('--output',type=Path,required=True)
    phase.add_argument('--source',type=Path)
    phase.add_argument('--source-sha256')
    phase.add_argument('--development',type=Path)
    fit=commands.add_parser('_fit',help=argparse.SUPPRESS)
    fit.add_argument('--job',type=Path,required=True);fit.add_argument('--job-sha256',required=True)
    return result


def public_phase(args):
    phase={'prepare':'preparation','develop':'development','evaluate':'evaluation'}[args.command]
    output=a.safe_path(args.output,existing=False)
    if not output.is_relative_to(a.BASE) or output.parent!=a.BASE:
        raise ValueError('Scientific runs must be direct children of the v2 dataset root')
    if a._claim_path(phase).exists():raise FileExistsError('Phase already consumed; no resume or replacement')
    if phase!='preparation':
        args.source=a.safe_path(args.source,existing=True)
        a.read_manifest(args.source,args.source_sha256)
        prepared=a.completion('preparation')
        if prepared['output']!=str(args.source) or prepared['source_sha256']!=args.source_sha256:
            raise ValueError('Wrong prepared cohort')
    storage=(a.storage_projection(a.runtime._output_bytes(a.BASE)) if phase=='development' else None)
    diagnostics=a.BASE/'admission'/uuid.uuid4().hex
    diagnostics.mkdir(parents=True,exist_ok=False)
    admission=a.ContextSupervisor(diagnostics,a.limits(phase),a.BASE)
    try:
        snapshot=admission.preflight()
        a.write_json(diagnostics/'admitted.json',snapshot)
        if storage:a.write_json(diagnostics/'storage-plan.json',storage)
    except Exception as error:
        a.write_json(diagnostics/'refused.json',dict(reason=str(error),snapshot=admission.last_snapshot))
        raise
    lock=a.acquire_active();supervisor=None
    try:
        logs=output.with_name(output.name+'-preparation') if phase=='preparation' else output
        a.safe_path(logs,existing=False);logs.mkdir(parents=True,exist_ok=False)
        supervisor=a.ContextSupervisor(logs,a.limits(phase),a.BASE)
        supervisor.preflight()
        source_sha=None if phase=='preparation' else args.source_sha256
        a.claim_phase(phase,source_sha,output)
        command=[sys.executable,str(Path(__file__).resolve()),'_phase','--phase',phase,'--output',str(output)]
        if phase!='preparation':command+=['--source',str(args.source),'--source-sha256',args.source_sha256]
        if phase=='evaluation':command+=['--development',str(args.development.resolve())]
        result=supervisor.run(command,fit_id=phase,cwd=a.ROOT,enforce_fit_timeout=False)
        if result['status']!='success' or not result['cleanup_confirmed']:
            raise a.runtime.RuntimeSafetyError('Phase failed; evidence retained: '+str(result['reason']))
        if phase=='preparation':source_sha=a.runtime.sha256_file(output/'manifest.json')
        receipt=dict(source_sha256=source_sha,native=result,logs=str(logs))
        frozen=a.freeze_run(output,phase,receipt)
        print(json.dumps(dict(phase=phase,status='complete',source_sha256=source_sha,output=str(output),files=len(frozen['files']))))
    finally:
        if supervisor is None or supervisor.cleanup_confirmed:a.release_active(lock)


def main(argv=None):
    args=parser().parse_args(argv)
    if args.command in ('prepare','develop','evaluate'):
        public_phase(args);return 0
    if args.command=='_fit':
        a.runtime.require_supervised_worker()
        from inventory_context_train import fit_worker
        fit_worker(args.job,args.job_sha256);return 0
    if args.command=='_phase':
        a.runtime.require_supervised_worker()
        claim=a.read_json(a._claim_path(args.phase))
        a.verify_claim(claim,args.phase,args.source_sha256,args.output)
        if args.phase=='preparation':prepare_cohort(args.output)
        elif args.phase=='development':
            from inventory_context_train import develop
            develop(args.source,args.source_sha256,args.output,
                a.ContextSupervisor(args.output,a.limits('development'),a.BASE))
        else:
            from inventory_context_evaluate import evaluate
            evaluate(args.source,args.source_sha256,args.development,args.output,None)
        return 0
    if args.command=='audit-data':value=audit_cohort(args.source,args.source_sha256)
    elif args.command=='audit-development':
        from inventory_context_train import validate_development
        value=validate_development(args.development,args.source_sha256)
    else:
        from inventory_context_evaluate import audit_evaluation
        value=audit_evaluation(args.source,args.source_sha256,args.development,args.evaluation)
    print(json.dumps(value,sort_keys=True));return 0


if __name__=='__main__':raise SystemExit(main())
