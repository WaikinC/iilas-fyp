import importlib.util
import unittest
from pathlib import Path
import tempfile
from unittest.mock import patch


class CliTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_context_cli'),'V2 bounded CLI missing')
        import inventory_context_cli as api
        self.a=api

    def test_no_public_limit_or_fixture_bypass(self):
        parser=self.a.parser()
        for flag in ('--force','--resume','--fixture','--max-rss','--families','--seed'):
            with self.subTest(flag=flag),self.assertRaises(SystemExit):parser.parse_args(['prepare','--output','x',flag,'1'])
        value=parser.parse_args(['develop','--source','x','--source-sha256','a'*64,'--output','y'])
        self.assertEqual(value.command,'develop')

    def test_hidden_worker_requires_native_job(self):
        with patch.object(self.a.a.runtime,'require_supervised_worker',side_effect=ValueError('No native Job')):
            with self.assertRaisesRegex(ValueError,'No native Job'):
                self.a.main(['_phase','--phase','preparation','--output','x'])

    def test_audit_dispatch_does_not_invoke_training(self):
        with (patch.object(self.a,'audit_cohort',return_value={'verified':True}) as audit,
              patch.object(self.a,'public_phase',side_effect=AssertionError('Audit started a scientific phase'))):
            self.assertEqual(self.a.main(['audit-data','--source','x','--source-sha256','a'*64]),0)
            audit.assert_called_once()

    def test_public_phase_order_and_exclusive_claims_with_supervisor_double(self):
        cli=self.a;a=cli.a
        base=Path(__file__).parent/'datasets/context-cli-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            root=Path(temp).resolve();seen=[]
            def execute(supervisor,command,*,fit_id,**kwargs):
                output=Path(command[command.index('--output')+1])
                claim=a.read_json(a._claim_path(fit_id))
                self.assertEqual(claim['phase'],fit_id)
                if fit_id=='preparation':
                    self.assertFalse(output.exists());output.mkdir();a.write_json(output/'manifest.json',{'software_fixture':True})
                else:
                    self.assertEqual(a.completion('preparation')['source_sha256'],claim['source_sha256'])
                    if fit_id=='evaluation':self.assertEqual(a.completion('development')['source_sha256'],claim['source_sha256'])
                    a.write_json(output/'fixture-result.json',{'phase':fit_id})
                seen.append(fit_id)
                return dict(status='success',cleanup_confirmed=True)
            with (patch.object(a,'BASE',root),patch.object(a,'other_training_processes',return_value=[]),
                  patch.object(a.ContextSupervisor,'preflight',return_value={'software_fixture':True}),
                  patch.object(a.ContextSupervisor,'run',execute),patch.object(a,'read_manifest',return_value={})):
                cli.main(['prepare','--output',str(root/'main')])
                sha=a.runtime.sha256_file(root/'main/manifest.json')
                cli.main(['develop','--source',str(root/'main'),'--source-sha256',sha,'--output',str(root/'dev')])
                cli.main(['evaluate','--source',str(root/'main'),'--source-sha256',sha,'--development',str(root/'dev'),'--output',str(root/'eval')])
                self.assertEqual(seen,['preparation','development','evaluation'])
                with self.assertRaises(FileExistsError):cli.main(['prepare','--output',str(root/'renamed')])

    def test_oversized_development_refuses_before_claim_or_fit(self):
        a=self.a.a
        self.assertTrue(hasattr(a,'storage_projection'),'Storage projection missing')
        base=Path(__file__).parent/'datasets/context-cli-budget-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as temp:
            root=Path(temp).resolve();source=root/'main';source.mkdir()
            args=self.a.parser().parse_args(['develop','--source',str(source),'--source-sha256','a'*64,'--output',str(root/'dev')])
            with (patch.object(a,'BASE',root),patch.object(a,'read_manifest',return_value={}),
                  patch.object(a,'completion',return_value={'output':str(source),'source_sha256':'a'*64}),
                  patch.object(a.runtime,'_output_bytes',return_value=70*1024**2),
                  patch.object(a,'claim_phase',side_effect=AssertionError('Oversized plan consumed claim')),
                  patch.object(a,'acquire_active',side_effect=AssertionError('Oversized plan acquired training lock'))):
                with self.assertRaises(a.runtime.RuntimeSafetyError):self.a.public_phase(args)
            self.assertFalse((root/'dev').exists())


if __name__=='__main__':unittest.main()
