"""Software fixtures for the explicitly synthetic main cohort; no accuracy claim."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


class MainSimulationTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_simulation_main'),
                             'Main simulation preparation is not implemented')
        import inventory_simulation_main as api
        self.api = api

    def test_balanced_context_labels_and_existing_feature_order(self):
        a=self.api
        cases, rows, labels=a.build_main()
        self.assertEqual((len(cases),len(rows),len(labels)),(300,300,300))
        self.assertEqual({label:sum(r['label']==label for r in labels) for label in a.LABELS},
                         {label:100 for label in a.LABELS})
        for case,row,label in zip(cases,rows,labels):
            assessed=a.sim.assess_case(case)
            self.assertEqual(list(row)[-6:],list(a.sim.FEATURES))
            self.assertEqual({key:row[key] for key in a.sim.FEATURES},assessed['features'])
            self.assertEqual(a.assisted_label(case)['label'],label['label'])
            self.assertFalse(label['independent_human_review'])
            self.assertFalse(label['operationally_approved'])

    def test_receipt_age_and_zero_activity_coverage(self):
        a=self.api
        cases,rows,_=a.build_main()
        ages=[row['days_since_replenishment'] for row in rows]
        self.assertIn(0,ages);self.assertIn(.25,ages);self.assertIn(90,ages)
        self.assertGreaterEqual(sum(age>30 for age in ages),100)
        self.assertEqual(sum(row['movement_frequency']==0 for row in rows),50)
        self.assertTrue(all(a.sim.assess_case(c)['eligible'] for c in cases))

    def test_no_pilot_ancestry_or_repeated_families(self):
        a=self.api
        cases,_,_=a.build_main()
        pilot=a.sim.build_pilot(42)[0]
        a.sim.audit_families(pilot+cases)
        self.assertFalse(set(c['family_id'] for c in pilot)&set(c['family_id'] for c in cases))
        self.assertEqual(len({c['family_id'] for c in cases}),300)

    def test_split_family_separation_support_and_determinism(self):
        a=self.api
        _,rows,_=a.build_main()
        first=a.partition(rows);self.assertEqual(first,a.partition(rows))
        self.assertEqual((len(first['development']),len(first['test'])),(240,60))
        for subset in first.values():
            count=80 if len(subset)==240 else 20
            self.assertEqual({label:sum(r['label']==label for r in subset) for label in a.LABELS},
                             {label:count for label in a.LABELS})
        self.assertFalse(set(r['group_id'] for r in first['development'])&set(r['group_id'] for r in first['test']))

    def test_missing_or_conflicting_context_is_rejected(self):
        a=self.api
        case=a.build_main()[0][0]
        bad=copy.deepcopy(case);bad['context']['reserved_commitment_quantity']+=1
        with self.assertRaises(ValueError):a.assisted_label(bad)
        bad=copy.deepcopy(case);bad['context']['replenishment']['status']='unknown'
        with self.assertRaises(ValueError):a.assisted_label(bad)

    def test_output_is_exclusive_audited_and_tampering_refused(self):
        a=self.api
        def git_ok(args,**kwargs):return subprocess.CompletedProcess(args,0,stdout='',stderr='')
        with tempfile.TemporaryDirectory() as temp,patch.object(a.sim.subprocess,'run',git_ok):
            repo=Path(temp);dest=repo/'research/datasets/inventory-simulation-v1/main-01'
            result=a.prepare_main(dest,repo_root=repo)
            self.assertEqual(result['families'],300)
            self.assertEqual(a.audit_main(dest,repo_root=repo)['status'],'PASS')
            self.assertTrue((dest/'provenance.json').is_file(), 'Per-case source/coverage provenance is missing')
            provenance=json.loads((dest/'provenance.json').read_text())
            self.assertEqual(len(provenance),300)
            self.assertEqual({seed:sum(v['source_seed']==seed for v in provenance.values()) for seed in a.SEEDS},
                             {seed:60 for seed in a.SEEDS})
            self.assertEqual({condition:sum(v['coverage']==condition for v in provenance.values()) for condition in a.COVERAGE},
                             {condition:50 for condition in a.COVERAGE})
            for sample,entry in provenance.items():
                case=json.loads((dest/f'dossiers/{sample}.json').read_text())
                assessed=a.sim.assess_case(case)
                self.assertEqual(entry['family_id'],case['family_id'])
                self.assertEqual(entry['evidence_sha256'],a.sim.digest(case))
                self.assertEqual(entry['feature_version'],'inventory-simulation-features-1.0')
                if entry['coverage']=='same-day':self.assertEqual(assessed['features']['days_since_replenishment'],0)
                if entry['coverage']=='quarter-day':self.assertEqual(assessed['features']['days_since_replenishment'],.25)
                if entry['coverage']=='ninety-days':self.assertEqual(assessed['features']['days_since_replenishment'],90)
                if entry['coverage']=='zero-activity':self.assertEqual(assessed['features']['movement_frequency'],0)
            with self.assertRaises(ValueError):a.prepare_main(dest,repo_root=repo)
            path=dest/'development.csv';path.write_text(path.read_text().replace('Normal','Critical Stock Risk',1))
            with self.assertRaises(ValueError):a.audit_main(dest,repo_root=repo)

    def test_confirmed_but_insufficient_supply_is_critical(self):
        a=self.api
        case=copy.deepcopy(a.build_main()[0][0])
        available=a.sim.assess_case(case)['features']['available_quantity']
        case['context']['additional_firm_quantity']=available+20
        case['context']['replenishment'].update(status='confirmed',quantity=10,eta_days=2)
        result=a.assisted_label(case)
        self.assertEqual(result['label'],'Critical Stock Risk')
        self.assertIn('10 additional firm units lack',result['reason'])


if __name__=='__main__':unittest.main()
