"""Generator/validator behavior; all packets here are in-memory software fixtures."""
import copy
from collections import Counter,defaultdict
import importlib.util
import json
import unittest
from unittest.mock import patch
import inventory_context_contract as contract


class DataTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_context_data'),'V2 grouped data module is missing')
        import inventory_context_data as api
        self.api=api
        self.families=api.build_families()
        self.cases=[c for f in self.families for c in api.expand_views(f)]
        self.partitions=api.assign_partitions(self.families)

    def test_declared_coverage_and_policy_counts(self):
        self.assertEqual((len(self.families),len(self.cases)),(300,3600))
        self.assertEqual(Counter(f['source_seed'] for f in self.families),dict.fromkeys(range(2001,2006),60))
        self.assertEqual(set(Counter((f['history_regime'],f['buffer_regime']) for f in self.families).values()),{25})
        self.assertEqual(Counter(contract.teach_case(c)['label'] for c in self.cases),
            {'Normal':750,'Reorder Risk':1050,'Critical Stock Risk':1800})
        statuses=defaultdict(set)
        for case in self.cases:statuses[case['context']['supply_status']].add(contract.teach_case(case)['label'])
        self.assertTrue(all(len(labels)==3 for labels in statuses.values()))
        self.assertEqual(sum(contract.assess_ledger(f['ledger'])['features']['available_quantity']==0 for f in self.families),30)
        self.assertEqual(self.api.build_families(),self.families)

    def test_family_folds_do_not_split_views(self):
        p=self.partitions
        self.assertEqual((len(p['development']),len(p['test'])),(240,60))
        self.assertFalse(set(p['development'])&set(p['test']))
        seen=[]
        for fold in p['folds']:
            self.assertEqual((len(fold['train']),len(fold['validation'])),(160,80))
            self.assertFalse(set(fold['train'])&set(fold['validation']))
            self.assertEqual(set(fold['train'])|set(fold['validation']),set(p['development']))
            seen+=fold['validation']
        self.assertEqual(Counter(seen),Counter(p['development']))
        summary=self.api.validate_cases(self.cases,p)
        self.assertEqual(summary['test_class_counts'],{'Normal':150,'Reorder Risk':210,'Critical Stock Risk':360})

    def test_renamed_ledger_and_cross_partition_ancestry_rejected(self):
        bad=copy.deepcopy(self.cases)
        for case in bad[12:24]:
            original=case['ledger'];case['ledger']=copy.deepcopy(bad[0]['ledger'])
            case['ledger'].update(sample_id=original['sample_id'],family_id=original['family_id'],ancestor_ids=original['ancestor_ids'])
        with self.assertRaises(ValueError):self.api.validate_cases(bad,self.partitions)
        bad=copy.deepcopy(self.cases)
        for case in bad[12:24]:case['ledger']['ancestor_ids']=bad[0]['ledger']['ancestor_ids']
        with self.assertRaises(ValueError):self.api.validate_cases(bad,self.partitions)
        p=copy.deepcopy(self.partitions);p['test'][0]=p['development'][0]
        with self.assertRaises(ValueError):self.api.validate_cases(self.cases,p)

    def test_missing_or_inconsistent_family_view_rejected(self):
        with self.assertRaises(ValueError):self.api.validate_cases(self.cases[:-1],self.partitions)
        bad=copy.deepcopy(self.cases);bad[1]['ledger']['reorder_level']+=1
        with self.assertRaises(ValueError):self.api.validate_cases(bad,self.partitions)

    def test_context_template_mismatch_and_boundary_coverage(self):
        bad=copy.deepcopy(self.cases)
        # Covered demand keeps the same label; status coverage still must match the frozen template.
        bad[0]['context'].update(supply_status='confirmed',incoming_quantity=1,incoming_eta_days=0)
        with self.assertRaises(ValueError):self.api.validate_cases(bad,self.partitions)
        shortages=[v for v in self.cases if v['view_id']==5]
        self.assertTrue(any(v['context']['incoming_eta_days']==v['context']['additional_due_days'] for v in shortages))
        self.assertTrue(any(v['context']['incoming_quantity']+contract.encode_case(v,feature_set='six')[0]==v['context']['additional_firm_quantity'] for v in shortages))
        bad=copy.deepcopy(self.cases);bad[1]['view_id']=1
        with self.assertRaises(ValueError):self.api.validate_cases(bad,self.partitions)

    def test_packet_validator_replays_saved_evidence_not_generator(self):
        packet=self.api.packet_payloads(self.families,self.partitions)
        with patch.object(self.api,'build_families',side_effect=AssertionError('Validator regenerated data')):
            summary=self.api.validate_payloads(packet)
        self.assertEqual((summary['families'],summary['rows']),(300,3600))
        self.assertEqual(len([n for n in packet if '/ledgers/' in n]),300)
        self.assertEqual(len([n for n in packet if '/dossiers/' in n]),3600)
        for mutate in ('feature','label','extra','dossier'):
            bad=copy.copy(packet)
            if mutate in ('feature','label'):
                lines=bad['development.csv'].decode().splitlines();header=lines[0].split(',');row=lines[1].split(',')
                index=header.index('available_quantity' if mutate=='feature' else 'label')
                row[index]='999999' if mutate=='feature' else 'NotAClass';lines[1]=','.join(row)
                bad['development.csv']=('\n'.join(lines)+'\n').encode()
            elif mutate=='extra':bad['extra.json']=b'{}'
            else:
                name=next(n for n in bad if '/dossiers/' in n);d=json.loads(bad[name]);d['context']['additional_firm_quantity']+=1
                bad[name]=json.dumps(d).encode()
            with self.subTest(mutation=mutate),self.assertRaises(ValueError):self.api.validate_payloads(bad)


if __name__=='__main__':unittest.main()
