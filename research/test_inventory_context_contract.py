"""Hand-checked stock/context policy fixtures, not scientific observations."""
import copy
import importlib.util
import unittest

DAY = 86400000
CUTOFF = 1792728000000


def make_case():
    ledger = dict(sample_id='L1', family_id='F1', ancestor_ids=['v2-F1'],
        observed_at_ms=CUTOFF, opening_at_ms=CUTOFF-120*DAY,
        opening=[dict(location='A',quantity=109,reserved=10,warehouse=0)],
        events=[dict(event_id='receipt',at_ms=CUTOFF-2*DAY,type='Receipt',quantity=1,
                     location_from='A',location_to='',direction='',correction_of='')],
        reorder_level=20, coverage_start_ms=CUTOFF-120*DAY,
        coverage_complete=True,pending_corrections=[])
    context=dict(known_at_ms=CUTOFF,reserved_commitment_quantity=10,
        additional_firm_quantity=50,additional_due_days=3,incoming_quantity=50,
        incoming_eta_days=2,supply_status='confirmed')
    return dict(protocol='inventory-context-experiment-2.0',sample_id='F1-V01',
        family_id='F1',view_id=1,history_regime='ordinary',buffer_regime='above',
        source_seed=2001,ledger=ledger,context=context)


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('inventory_context_contract'),
                             'The v2 stock context contract is missing')
        import inventory_context_contract as api
        self.api=api

    def test_context_changes_label_without_changing_stock_features(self):
        a=self.api;c=make_case();planned=copy.deepcopy(c);late=copy.deepcopy(c)
        planned['context'].update(additional_firm_quantity=150,supply_status='planned')
        late['context'].update(additional_firm_quantity=150,incoming_eta_days=4)
        self.assertEqual([a.teach_case(x)['label'] for x in (c,planned,late)],
                         ['Normal','Reorder Risk','Critical Stock Risk'])
        self.assertEqual(a.encode_case(c,feature_set='six'),(100,10,1,80,0,2))
        self.assertEqual(a.encode_case(c,feature_set='six'),a.encode_case(late,feature_set='six'))
        self.assertNotEqual(a.encode_case(c,feature_set='context'),a.encode_case(late,feature_set='context'))
        self.assertEqual(a.encode_case(c,feature_set='context'),(100,10,1,80,0,2,50,3,50,2,0,0,1,0))

    def test_absence_is_not_unknown(self):
        a=self.api;c=make_case();c['context'].update(additional_firm_quantity=0,
            additional_due_days=None,incoming_quantity=0,incoming_eta_days=None,supply_status='none')
        self.assertEqual(a.encode_case(c,feature_set='context')[-8:],(0,0,0,0,1,0,0,0))
        for change in [dict(additional_firm_quantity=1),dict(incoming_quantity=1),
                       dict(supply_status='confirmed'),dict(incoming_eta_days=0),
                       dict(additional_due_days=0),dict(known_at_ms=CUTOFF+1)]:
            bad=copy.deepcopy(c);bad['context'].update(change)
            with self.subTest(change=change),self.assertRaises(ValueError):a.encode_case(bad,feature_set='context')

    def test_rejects_unknown_extra_nonfinite_and_wrong_units(self):
        a=self.api
        for field,values in [('additional_firm_quantity',[True,'1',-1,1.5,float('inf')]),
                ('additional_due_days',[None,True,'3',-1,float('nan'),36501]),
                ('incoming_quantity',[False,'2',-1,0]),
                ('incoming_eta_days',[None,True,-1,float('inf')]),
                ('supply_status',['unknown',None]),('reserved_commitment_quantity',[0])]:
            for value in values:
                c=make_case();c['context'][field]=value
                with self.subTest(field=field,value=value),self.assertRaises(ValueError):a.teach_case(c)
        c=make_case();c['context']['label']='Normal'
        with self.assertRaises(ValueError):a.teach_case(c)
        c=make_case();del c['context']['supply_status']
        with self.assertRaises(ValueError):a.teach_case(c)
        with self.assertRaises(ValueError):a.encode_case(make_case(),feature_set='all')

    def test_teacher_boundaries_and_twelve_contexts(self):
        a=self.api
        table=[(50,'none',0,None,'Normal'),(50,'planned',50,2,'Normal'),
            (50,'confirmed',50,2,'Normal'),(100,'disrupted',50,2,'Normal'),
            (150,'confirmed',50,3,'Normal'),(150,'planned',50,3,'Reorder Risk'),
            (150,'confirmed',50,4,'Critical Stock Risk'),(150,'confirmed',49,3,'Critical Stock Risk'),
            (150,'planned',50,4,'Critical Stock Risk'),(150,'planned',49,3,'Critical Stock Risk'),
            (150,'disrupted',50,3,'Critical Stock Risk'),(150,'none',0,None,'Critical Stock Risk')]
        for demand,status,quantity,eta,want in table:
            c=make_case();c['context'].update(additional_firm_quantity=demand,
                supply_status=status,incoming_quantity=quantity,incoming_eta_days=eta)
            with self.subTest(context=c['context']):
                self.assertEqual(a.teach_case(c)['label'],want)
                c['ledger']['reorder_level']=100
                self.assertEqual(a.teach_case(c)['label'],'Reorder Risk' if want=='Normal' else want)

    def test_fractional_days_cutoff_and_provenance(self):
        c=make_case();c['context'].update(additional_due_days=.25,incoming_eta_days=.25,
                                        additional_firm_quantity=150)
        result=self.api.teach_case(c)
        self.assertEqual(result['label'],'Normal')
        for key in ('independent_human_review','independent_accuracy_validated','operationally_approved'):
            self.assertIs(result[key],False)
        self.assertEqual(result['annotation_origin'],'AI-authored synthetic policy')
        self.assertEqual(len(result['evidence_sha256']),64)

    def test_ineligible_history_receipts_and_invalid_corrections_reject(self):
        a=self.api
        for change in [dict(coverage_complete=False),dict(events=[]),
                       dict(pending_corrections=['receipt'])]:
            c=make_case();c['ledger'].update(change)
            with self.subTest(change=change),self.assertRaises(ValueError):a.teach_case(c)
        c=make_case();e=copy.deepcopy(c['ledger']['events'][0]);e.update(event_id='inverse',
            type='Correction',at_ms=CUTOFF,quantity=2,direction='Decrease',correction_of='receipt')
        c['ledger']['events'].append(e)
        with self.assertRaises(ValueError):a.assess_ledger(c['ledger'])

    def test_ledger_fingerprint_ignores_renaming_and_reorder(self):
        a=self.api;x=make_case()['ledger'];y=copy.deepcopy(x)
        y.update(sample_id='other',family_id='other',ancestor_ids=['other'],reorder_level=999)
        y['events'][0]['event_id']='renamed'
        self.assertEqual(a.ledger_fingerprint(x),a.ledger_fingerprint(y))
        y['opening'][0]['quantity']+=1
        self.assertNotEqual(a.ledger_fingerprint(x),a.ledger_fingerprint(y))

    def test_case_identity_and_metadata_cannot_supply_labels(self):
        for change in [dict(protocol='v1'),dict(label='Normal'),dict(family_id='other'),
                       dict(view_id=True),dict(source_seed=42)]:
            c=make_case();c.update(change)
            with self.subTest(change=change),self.assertRaises(ValueError):self.api.teach_case(c)


if __name__=='__main__':unittest.main()
